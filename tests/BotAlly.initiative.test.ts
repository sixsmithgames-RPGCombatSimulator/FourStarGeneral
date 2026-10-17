/** Real initiative/save boundaries for autonomous allies; queue ownership is not combat allegiance. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { setTimeout as nextTask } from "node:timers/promises";
import type { Axial } from "../src/core/Hex";
import type { ScenarioData, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import terrainData from "../src/data/terrain.json";
import { GameEngine, type BotTurnSummary, type GameEngineConfig, type SerializedBattleState } from "../src/game/GameEngine";
import { GameEngineInitiativeMethods, type InitiativeBotActivationResult } from "../src/game/GameEngineInitiativeIntegration";
import { GameEngineInitiativeIntegration } from "../src/game/GameEngineInitiativeExtensions";
import { registerTest } from "./harness";

type FactionResult = InitiativeBotActivationResult & { readonly faction?: "Player" | "Bot" | "Ally" };

/** One valid offset row expressed in axial engine coordinates. */
function lane(q: number): Axial { return { q, r: 0 - Math.floor(q / 2) }; }

/** Authored IDs, not hex keys, identify formations sharing a cell. */
function unit(unitId: string, q: number, overrides: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return { unitId, type: "Infantry_42", hex: lane(q), strength: 100, experience: 0,
    ammo: 6, fuel: 0, entrench: 0, facing: "E", ...overrides };
}

/** Real engine configuration with no support missions or procedural terrain. */
function fixture(options: { allies?: ScenarioUnit[]; players?: ScenarioUnit[]; enemies?: ScenarioUnit[]; movement?: number } = {}): {
  engine: GameEngine; config: GameEngineConfig; methods: GameEngineInitiativeMethods;
} {
  const general = { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 };
  const scenario: ScenarioData = {
    name: "Autonomous ally initiative lane", size: { cols: 12, rows: 1 },
    tilePalette: { plain: { terrain: "plains", terrainType: "rural", density: "average", features: [], recon: "intel" } },
    tiles: [Array.from({ length: 12 }, () => ({ tile: "plain" }))], objectives: [], turnLimit: 20,
    sides: { Player: { hq: lane(0), general, units: [] }, Bot: { hq: lane(11), general, units: [] },
      Ally: { hq: lane(0), general, units: [] } }
  };
  const types = unitTypesData as UnitTypeDictionary;
  const definitions = { ...types };
  for (const type of ["Infantry_42", "Recon_Bike", "Medium_Tank"] as const) {
    definitions[type] = { ...types[type], vision: 12, movement: options.movement ?? 3 };
  }
  const config: GameEngineConfig = { scenario, unitTypes: definitions, terrain: terrainData as TerrainDictionary,
    playerSide: scenario.sides.Player, botSide: scenario.sides.Bot, allySide: scenario.sides.Ally,
    initialSupportAssets: [], botStrategyMode: "Heuristic", botDifficulty: "Normal" };
  const state: SerializedBattleState = { phase: "deployment", activeFaction: "Player", turnNumber: 1,
    baseCamp: { hex: lane(0), key: "0,0" }, reserves: [],
    playerPlacements: options.players ?? [unit("manual-player", 10, { controlledBy: "Player", movementCredit: 0 })],
    botPlacements: options.enemies ?? [unit("enemy", 8, { movementCredit: 0, ammo: 0 })],
    allyPlacements: options.allies ?? [unit("ally", 0, { type: "Recon_Bike", fuel: 30, movementCredit: 2 })] };
  const engine = GameEngine.fromSerialized(config, state);
  return { engine, config, methods: methodsFor(engine) };
}

/** Remove only presentation delay, preserving the real observer Promise and queue completion path. */
function methodsFor(engine: GameEngine): GameEngineInitiativeMethods {
  const methods = new GameEngineInitiativeMethods(engine);
  methods["resolveBotActivationCompletionDelay"] = () => 0;
  return methods;
}

/** Flush already queued native microtasks; never poll or bypass the activation state machine. */
async function settle(): Promise<void> { await nextTask(0); }

registerTest("BOT_ALLY_INITIATIVE_COMMITS_REAL_MOVEMENT_WITH_FRIENDLY_IDENTITY", async () => {
  const { engine, methods } = fixture();
  const results: FactionResult[] = [];
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  methods.setBotActivationListener((result) => { results.push(result); return blocked; });
  methods.startInitiativeTurnPhase();
  try {
    const current = methods.getCurrentActivation();
    assert.equal(current?.unitId, "ally");
    assert.equal(current?.ownerId, "bot", "Automated queue ownership remains save-compatible.");
    assert.equal(engine.activeFaction, "Ally");
    assert.equal(methods["integration"].getCurrentActiveFaction(), "Ally");
    assert.equal(results.length, 1);
    assert.equal(results[0].faction, "Ally");
    assert.equal(results[0].moved, true);
    assert.deepEqual(results[0].movementPath, [lane(0), lane(1), lane(2)]);
    assert.equal(results[0].visibleBefore, true);
    assert.equal(results[0].visibleAfter, true);
    assert.equal(engine.allyUnits[0]?.movementCredit, 0);
    assert.equal(engine.botUnits[0]?.movementCredit, 0);
  } finally { release(); await settle(); }
  assert.equal(methods.getCurrentActivation()?.unitId, "manual-player");
});

registerTest("BOT_ALLY_INITIATIVE_AWAITS_OBSERVER_BEFORE_NEXT_STACK_ACTOR", async () => {
  const { engine, methods } = fixture({ allies: [
    unit("lead", 0, { type: "Recon_Bike", fuel: 30, movementCredit: 1 }),
    unit("wing", 0, { type: "Recon_Bike", fuel: 30, movementCredit: 1 })
  ] });
  const executed: Array<{ id: string; summary: BotTurnSummary }> = [];
  const execute = engine.executeAllyActivation.bind(engine);
  engine.executeAllyActivation = (id) => {
    const summary = execute(id);
    executed.push({ id, summary });
    return summary;
  };
  const results: FactionResult[] = [];
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  methods.setBotActivationListener((result) => { results.push(result); return result.unitId === "lead" ? blocked : undefined; });
  methods.startInitiativeTurnPhase();
  try {
    await settle();
    assert.deepEqual(results.map((entry) => entry.unitId), ["lead"]);
    assert.deepEqual(executed.map((entry) => entry.id), ["lead"]);
    assert.equal(methods.getCurrentActivation()?.unitId, "lead");
    assert.deepEqual(engine.allyUnits.find((entry) => entry.unitId === "wing")?.hex, lane(0));
    assert.equal(engine.activeFaction, "Ally");
  } finally { release(); await settle(); }
  assert.deepEqual(executed.map((entry) => entry.id), ["lead", "wing"]);
  assert.deepEqual(results.map((entry) => [entry.unitId, entry.faction]), [["lead", "Ally"], ["wing", "Ally"]]);
  for (const [index, entry] of executed.entries()) {
    assert.equal(results[index].moved, entry.summary.moves.length > 0);
    assert.deepEqual(results[index].movementPath, entry.summary.moves[0]?.path);
    assert.deepEqual(results[index].toHex, engine.allyUnits.find((actor) => actor.unitId === entry.id)?.hex);
  }
  assert.deepEqual(engine.allyUnits.find((entry) => entry.unitId === "lead")?.hex, lane(1));
  assert.equal(methods.getCurrentActivation()?.unitId, "manual-player");
});

registerTest("BOT_ALLY_INITIATIVE_HYDRATES_CURRENT_ALLY_WITHOUT_REPLAYING_ACTION", async () => {
  const { engine, config, methods } = fixture();
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  methods.setBotActivationListener(() => blocked);
  methods.startInitiativeTurnPhase();
  try {
    const savedEngine = JSON.parse(JSON.stringify(engine.serialize())) as SerializedBattleState;
    const savedQueue = JSON.parse(JSON.stringify(methods.serializeState())) as ReturnType<typeof methods.serializeState>;
    const restored = GameEngine.fromSerialized(config, savedEngine);
    const resumed = methodsFor(restored);
    resumed.setBotActivationListener(() => { throw new Error("Hydration must never execute an activation."); });
    resumed.hydrateState(savedQueue);
    assert.equal(restored.activeFaction, "Ally");
    assert.equal(resumed["integration"].getCurrentActiveFaction(), "Ally");
    assert.deepEqual(resumed.serializeState(), savedQueue);
    assert.deepEqual(restored.allyUnits, engine.allyUnits);
    assert.deepEqual(restored.serialize().actionFlags, savedEngine.actionFlags);
  } finally { release(); await settle(); }
});

registerTest("BOT_ALLY_INITIATIVE_JSON_CONTINUATION_MATCHES_UNINTERRUPTED_EXECUTION", async () => {
  const { engine, config, methods } = fixture({
    players: [unit("manual-player", 10, { type: "Recon_Bike", fuel: 30, controlledBy: "Player" })],
    allies: [unit("ally", 0, { movementCredit: 2 })],
    enemies: [unit("enemy", 8, { type: "Medium_Tank", fuel: 0, ammo: 0, movementCredit: 0 })]
  });
  methods.startInitiativeTurnPhase();
  assert.equal(methods.getCurrentActivation()?.unitId, "manual-player");
  const restored = GameEngine.fromSerialized(config, JSON.parse(JSON.stringify(engine.serialize())) as SerializedBattleState);
  const resumed = methodsFor(restored);
  resumed.hydrateState(JSON.parse(JSON.stringify(methods.serializeState())) as ReturnType<typeof methods.serializeState>);
  const expected: FactionResult[] = [];
  const actual: FactionResult[] = [];
  methods.setBotActivationListener((result) => { expected.push(result); });
  resumed.setBotActivationListener((result) => { actual.push(result); });
  methods.completeUnitActivation("manual-player");
  resumed.completeUnitActivation("manual-player");
  await settle();
  assert.equal(expected.find((entry) => entry.unitId === "ally")?.moved, true);
  assert.deepEqual(actual, expected);
  assert.deepEqual(restored.allyUnits, engine.allyUnits);
  assert.deepEqual(restored.botUnits, engine.botUnits);
  assert.deepEqual(restored.serialize().supplyUnits, engine.serialize().supplyUnits);
  assert.deepEqual(restored.serialize().actionFlags, engine.serialize().actionFlags);
  assert.deepEqual(resumed.serializeState(), methods.serializeState());
});

registerTest("BOT_ALLY_INITIATIVE_TWO_ROUNDS_REFRESH_ONCE_WITHOUT_CONVENTIONAL_REPLAY", async () => {
  const { engine, methods } = fixture({ movement: 1, allies: [unit("ally", 0, { type: "Recon_Bike", fuel: 30, movementCredit: 1 })] });
  // Structural typing lets this regression compile against the pre-repair API for a genuine red proof.
  const allyEngine = engine as unknown as { executeAllyActivation: (unitId: string) => BotTurnSummary };
  assert.equal(typeof allyEngine.executeAllyActivation, "function", "Initiative needs a canonical single-ally transaction.");
  const execute = allyEngine.executeAllyActivation.bind(engine);
  const activations: string[] = [];
  allyEngine.executeAllyActivation = (id) => { activations.push(id); return execute(id); };
  const applySupply = engine["applySupplyTickFor"].bind(engine);
  const supplyFactions: string[] = [];
  engine["applySupplyTickFor"] = (faction) => { supplyFactions.push(faction); return applySupply(faction); };
  const results: FactionResult[] = [];
  methods.setBotActivationListener((result) => { results.push(result); });
  methods.startInitiativeTurnPhase();
  for (let round = 1; round <= 2; round += 1) {
    await settle();
    assert.equal(methods.getCurrentActivation()?.unitId, "manual-player");
    assert.equal(activations.length, round);
    assert.equal(results.filter((entry) => entry.faction === "Ally" && entry.moved).length, round);
    methods.completeUnitActivation("manual-player");
    await settle();
    assert.equal(methods.getCurrentTurnPhase(), "airShow");
    const spentActor = engine.allyUnits.find((entry) => entry.unitId === "ally")!;
    spentActor.onSentry = true;
    spentActor.suppressedBy = ["enemy"];
    if (spentActor.status) spentActor.status.suppression = 30;
    engine["replaceUnitInFactionHex"]("Ally", spentActor);
    const positions = engine.allyUnits.map((entry) => [entry.unitId, entry.hex]);
    const reportCount = engine.getCombatReports().length;
    // Same resolved-round bridge used by BattleScreen, not the conventional playerTurn ground executor.
    engine["_phase"] = "botTurn";
    engine["_activeFaction"] = "Bot";
    engine.endTurn();
    assert.deepEqual(engine.allyUnits.map((entry) => [entry.unitId, entry.hex]), positions);
    assert.equal(engine.getCombatReports().length, reportCount, "Round upkeep cannot replay conventional allied combat.");
    assert.equal(activations.length, round);
    assert.equal(supplyFactions.filter((faction) => faction === "Ally").length, round);
    const actor = engine.allyUnits.find((entry) => entry.unitId === "ally");
    assert.ok(actor);
    assert.ok((actor.movementCredit ?? 0) >= 1);
    assert.equal(engine["getUnitActionFlags"]("Ally", actor).movementPointsUsed, 0);
    assert.deepEqual(actor.suppressedBy, []);
    assert.equal(actor.status?.suppression, 0);
    assert.equal(actor.onSentry, false);
    if (round < 2) methods.startNextInitiativeTurnPhase();
  }
});

registerTest("BOT_ALLY_INITIATIVE_BOT_RESULT_RETAINS_ENEMY_FACTION_AND_FOG", async () => {
  const { engine, methods } = fixture({ allies: [],
    enemies: [unit("enemy", 0, { type: "Recon_Bike", fuel: 30, movementCredit: 0, ammo: 0 })] });
  const results: FactionResult[] = [];
  methods.setBotActivationListener((result) => { results.push(result); });
  const before = engine.getEnemyContactSnapshot().find((entry) => entry.unitId === "enemy")?.state === "visible";
  methods.startInitiativeTurnPhase();
  await settle();
  assert.equal(results.length, 1);
  assert.equal(results[0].faction, "Bot");
  assert.equal(results[0].visibleBefore, before);
  assert.equal(methods.getCurrentActivation()?.unitId, "manual-player");
});

registerTest("BOT_ALLY_INITIATIVE_LEGACY_OWNER_PROJECTION_REMAINS_FOR_MISSING_ROSTER_API", () => {
  const legacy = { _activeFaction: "Player", _phase: "playerTurn" };
  const integration = new GameEngineInitiativeIntegration(legacy);
  integration.enableInitiativeSystem([unit("legacy-bot", 0, { controlledBy: "AI" })], 1);
  integration.processNextActivation();
  assert.equal(integration.getCurrentActiveFaction(), "Bot");
  assert.equal(legacy._activeFaction, "Bot");
});

registerTest("BOT_ALLY_INITIATIVE_NEW_MISSING_ACTOR_CANNOT_INHERIT_PREVIOUS_ALLY", () => {
  const { engine } = fixture({ allies: [], enemies: [], players: [] });
  engine["_activeFaction"] = "Ally";
  const integration = new GameEngineInitiativeIntegration(engine);
  integration.enableInitiativeSystem([unit("missing-enemy", 0, { controlledBy: "AI" })], 1);
  integration.processNextActivation();
  assert.equal(engine.activeFaction, "Bot");
  assert.equal(integration.getCurrentActiveFaction(), "Bot");
});

registerTest("BOT_ALLY_INITIATIVE_ATTACK_RESULT_MATCHES_CANONICAL_AMMO_AND_REPORT", async () => {
  const { engine, methods } = fixture({
    players: [unit("manual-player", 10, { type: "Recon_Bike", fuel: 30, controlledBy: "Player" })],
    allies: [unit("ally", 0, { movementCredit: 0 })],
    enemies: [unit("enemy", 1, { type: "Medium_Tank", fuel: 20, movementCredit: 0 })]
  });
  const results: FactionResult[] = [];
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  methods.setBotActivationListener((result) => { results.push(result); return result.unitId === "ally" ? blocked : undefined; });
  methods.startInitiativeTurnPhase();
  methods.completeUnitActivation("manual-player");
  try {
    assert.equal(results[0]?.faction, "Ally");
    assert.equal(results[0]?.attacks.length, 1);
    const attack = results[0].attacks[0];
    const report = engine.getCombatReports()[0];
    assert.equal(attack.attackerUnitId, "ally");
    assert.equal(attack.defenderUnitId, "enemy");
    assert.deepEqual(attack.fromHex, report.attacker.position);
    assert.deepEqual(attack.targetHex, report.defender.position);
    assert.equal(attack.inflictedDamage, report.attackResult.damage);
    assert.equal(engine["getUnitActionFlags"]("Ally", engine.allyUnits[0]!).attacksUsed, 1);
    assert.ok(engine.allyUnits[0]!.ammo < 6);
    assert.equal(engine.activeFaction, "Ally");
  } finally { release(); await settle(); }
});

registerTest("BOT_ALLY_INITIATIVE_COUNTERFIRE_CASUALTY_PRESERVES_FACTION_AND_PARTIAL_RESULT_ON_SAVE", async () => {
  const { engine, config, methods } = fixture({
    allies: [unit("ally", 0, { type: "Medium_Tank", fuel: 20, strength: 1, movementCredit: 0 })],
    enemies: [unit("enemy", 1, { type: "Heavy_Tank", fuel: 20, movementCredit: 0 })]
  });
  const allyEngine = engine as unknown as { executeAllyActivation: (unitId: string) => BotTurnSummary };
  assert.equal(typeof allyEngine.executeAllyActivation, "function");
  const execute = allyEngine.executeAllyActivation.bind(engine);
  allyEngine.executeAllyActivation = (id) => { execute(id); throw new Error("Injected after committed allied combat."); };
  const results: FactionResult[] = [];
  const errors: unknown[][] = [];
  const originalError = console.error;
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  methods.setBotActivationListener((result) => { results.push(result); return result.unitId === "ally" ? blocked : undefined; });
  methods.startInitiativeTurnPhase();
  try {
    console.error = (...entries: unknown[]) => { errors.push(entries); };
    methods.completeUnitActivation("manual-player");
    console.error = originalError;
    assert.equal(engine.allyUnits.length, 0, "Fixture must destroy the real allied actor through canonical counterfire.");
    assert.equal(results[0]?.faction, "Ally");
    assert.equal(results[0]?.attacks.length, 1, "Committed Ally combat must survive partial execution diagnostics.");
    assert.equal(results[0]?.attacks[0].attackerUnitId, "ally");
    assert.equal(results[0]?.toHex, null);
    assert.equal(results[0]?.visibleAfter, true);
    assert.equal(engine.activeFaction, "Ally");
    assert.equal(methods.getIntegration().getCurrentActiveFaction(), "Ally");
    assert.equal(errors.length, 1);
    assert.match(String(errors[0][0]), /Error executing bot turn for ally/);
    const restored = GameEngine.fromSerialized(config, JSON.parse(JSON.stringify(engine.serialize())) as SerializedBattleState);
    const resumed = methodsFor(restored);
    resumed.hydrateState(JSON.parse(JSON.stringify(methods.serializeState())) as ReturnType<typeof methods.serializeState>);
    assert.equal(restored.activeFaction, "Ally");
    assert.equal(resumed.getIntegration().getCurrentActiveFaction(), "Ally");
    assert.equal(restored.allyUnits.length, 0);
    assert.deepEqual(restored.getCombatReports(), engine.getCombatReports());
  } finally { console.error = originalError; release(); await settle(); }
});
