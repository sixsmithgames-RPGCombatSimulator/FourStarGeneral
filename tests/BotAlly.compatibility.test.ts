/** Autonomous allies must commit the same faction-aware tactical transactions as enemy formations. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { axialKey, type Axial } from "../src/core/Hex";
import type { ScenarioData, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import terrainData from "../src/data/terrain.json";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { GameEngine, type BotTurnSummary, type GameEngineConfig, type SerializedBattleState } from "../src/game/GameEngine";
import { computeReachableHexes, type BotPlannerInput } from "../src/game/bot/BotPlanner";
import { registerTest } from "./harness";

const types = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;

/** A valid axial coordinate on the sole offset row; q,r=0 is not a one-row lane. */
function lane(q: number): Axial { return { q, r: 0 - Math.floor(q / 2) }; }

/** Stable authored identities keep actor, supply and save assertions independent of allocation counters. */
function unit(id: string, q: number, overrides: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return { unitId: id, type: "Infantry_42", hex: lane(q), strength: 100, experience: 0,
    ammo: 6, fuel: 0, entrench: 0, facing: "E", controlledBy: "AI", ...overrides };
}

/** Build a real hydrated engine without a deployment/supply round masking action resource consumption. */
function createEngine(allies: ScenarioUnit[], enemies = [unit("enemy", 9)], options: {
  vision?: number; scoutVision?: number; movement?: number; players?: ScenarioUnit[];
  allyDamageBonus?: number; botDamageBonus?: number; playerDamageBonus?: number;
  allyAccuracyBonus?: number; playerAccuracyBonus?: number;
  objectiveColumn?: number;
} = {}): GameEngine {
  const general = { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 };
  const scenario: ScenarioData = {
    name: "Autonomous allied transaction lane", size: { cols: 10, rows: 1 },
    tilePalette: { plain: { terrain: "plains", terrainType: "rural", density: "average", features: [], recon: "intel" } },
    tiles: [Array.from({ length: 10 }, () => ({ tile: "plain" }))],
    objectives: options.objectiveColumn === undefined ? [] : [{ hex: lane(options.objectiveColumn), owner: "Bot", vp: 100 }], turnLimit: 20,
    sides: { Player: { hq: lane(0), general: { ...general, dmgBonus: options.playerDamageBonus ?? 0, accBonus: options.playerAccuracyBonus ?? 0 }, units: [] },
      Bot: { hq: lane(9), general: { ...general, dmgBonus: options.botDamageBonus ?? 0 }, units: [] },
      Ally: { hq: lane(0), general: { ...general, dmgBonus: options.allyDamageBonus ?? 0, accBonus: options.allyAccuracyBonus ?? 0 }, units: [] } }
  };
  const definitions = { ...types };
  for (const key of ["Infantry_42", "Medium_Tank", "Recon_Bike", "AT_Gun_50mm"] as const) {
    definitions[key] = { ...types[key], vision: options.vision ?? 12, movement: options.movement ?? 4 };
  }
  definitions.Recon_Bike = { ...definitions.Recon_Bike, vision: options.scoutVision ?? options.vision ?? 12 };
  const config: GameEngineConfig = { scenario, unitTypes: definitions, terrain,
    playerSide: scenario.sides.Player, botSide: scenario.sides.Bot, allySide: scenario.sides.Ally,
    botStrategyMode: "Heuristic", botDifficulty: "Normal", initialSupportAssets: [] };
  const state: SerializedBattleState = { phase: "allyTurn", activeFaction: "Ally", turnNumber: 2, baseCamp: null,
    playerPlacements: options.players ?? [], botPlacements: enemies, allyPlacements: allies, reserves: [] };
  return GameEngine.fromSerialized(config, state);
}

/** Read the production planner boundary, including its canonical occupancy/visibility callbacks. */
function plannerInput(engine: GameEngine): BotPlannerInput {
  return engine["buildPlannerInputFor"](engine["allyPlacements"], engine["botPlacements"], "Normal");
}

/** Select a stable live formation, failing rather than silently substituting a primary stack member. */
function ally(engine: GameEngine, id: string): ScenarioUnit {
  const result = engine.allyUnits.find((entry) => entry.unitId === id);
  assert.ok(result, `Expected live allied formation ${id}.`);
  return result;
}

/** Assert the actual canonical supply mirror, not an independent test-maintained resource ledger. */
function assertSupplyMirror(engine: GameEngine, actor: ScenarioUnit): void {
  const supply = engine.serialize().supplyUnits?.Ally.find((entry) => entry.unitId === actor.unitId);
  assert.ok(supply, `Missing allied supply identity ${actor.unitId}.`);
  assert.deepEqual(supply.hex, actor.hex);
  assert.equal(supply.ammo, actor.ammo);
  assert.equal(supply.fuel, actor.fuel);
}

registerTest("BOT_ALLY_PLANNER_INCLUDES_EVERY_STACK_MEMBER_ONCE", () => {
  const engine = createEngine([unit("lead", 0), unit("wing", 0)]);
  assert.deepEqual(plannerInput(engine).botUnits.map((entry) => entry.unit.unitId), ["lead", "wing"]);
});

registerTest("BOT_ALLY_SPARE_COALITION_SLOT_SUPPORTS_TRANSIT_AND_ENTRY", () => {
  for (const friendlyFaction of ["Ally", "Player"] as const) {
    const friend = unit("friend", 1, { movementCredit: 0 });
    const engine = createEngine([unit("mover", 0, { movementCredit: 3 }), ...(friendlyFaction === "Ally" ? [friend] : [])],
      undefined, { players: friendlyFaction === "Player" ? [friend] : [] });
    const input = plannerInput(engine);
    const paths = computeReachableHexes(lane(0), 3, "leg", input, axialKey(lane(0)), Infinity, "mover");
    assert.deepEqual(paths.get(axialKey(lane(3)))?.path, [lane(0), lane(1), lane(2), lane(3)]);
    assert.equal(input.map.canEnterHex?.(lane(0), lane(1), "mover"), true);
  }
});

registerTest("BOT_ALLY_EXECUTION_CROSSES_A_SPARE_PLAYER_SLOT_WITHOUT_OVERWRITING", () => {
  const friend = unit("player-friend", 1, { movementCredit: 0 });
  const engine = createEngine([unit("mover", 0, { movementCredit: 3 })], undefined, { players: [friend] });
  const friendBefore = engine.playerUnits;
  engine["executeHeuristicAllyTurn"]();
  assert.deepEqual(ally(engine, "mover").hex, lane(3));
  assert.deepEqual(engine.playerUnits, friendBefore);
  assertSupplyMirror(engine, ally(engine, "mover"));
});

registerTest("BOT_ALLY_FULL_COALITION_STACK_AND_VISIBLE_HOSTILE_BLOCK_ENTRY", () => {
  const engine = createEngine([unit("mover", 0), unit("friend", 1)], [unit("enemy", 2)],
    { players: [unit("player-friend", 1)] });
  const input = plannerInput(engine);
  assert.equal(input.map.canEnterHex?.(lane(0), lane(1), "mover"), false);
  assert.equal(input.map.canEnterHex?.(lane(0), lane(2), "mover"), false);
});

registerTest("BOT_ALLY_HIDDEN_BLOCKER_CANNOT_CHANGE_REACHABILITY_KNOWLEDGE", () => {
  const actor = unit("mover", 0, { movementCredit: 4 });
  const clear = createEngine([actor], [], { vision: 1 });
  const hidden = createEngine([actor], [unit("unknown", 2)], { vision: 1 });
  assert.equal(hidden["checkTargetSpotted"](lane(2), "Ally"), false);
  const reachable = (engine: GameEngine) => computeReachableHexes(lane(0), 4, "leg", plannerInput(engine), axialKey(lane(0)), Infinity, "mover");
  assert.deepEqual(reachable(hidden), reachable(clear));
  assert.ok(reachable(hidden).has(axialKey(lane(3))), "Unknown occupancy must not silently reveal itself through a blocked route.");
});

registerTest("BOT_ALLY_EXECUTION_STOPS_AT_HIDDEN_PHYSICAL_BLOCKER_WITHOUT_INVENTING_ATTACK", () => {
  const actor = unit("mover", 0, { movementCredit: 3 });
  const clear = createEngine([actor], [], { vision: 1, objectiveColumn: 8 });
  const blocked = createEngine([actor], [unit("unknown", 2)], { vision: 1, objectiveColumn: 8 });
  assert.equal(blocked["checkTargetSpotted"](lane(2), "Ally"), false);
  clear["executeHeuristicAllyTurn"]();
  blocked["executeHeuristicAllyTurn"]();
  assert.deepEqual(ally(clear, "mover").hex, lane(3), "Known objective must actually motivate a march.");
  assert.deepEqual(ally(blocked, "mover").hex, lane(1));
  assert.deepEqual(blocked.botUnits[0]?.hex, lane(2));
  assert.equal(blocked.getCombatReports().length, 0);
  assert.equal(blocked["getUnitActionFlags"]("Ally", ally(blocked, "mover")).movementPointsUsed, 1);
});

registerTest("BOT_ALLY_SPOTTING_USES_SECONDARY_OBSERVER_WITHOUT_REVEALING_OTHER_ENEMIES", () => {
  const mover = unit("mover", 0, { movementCredit: 0 });
  assert.equal(plannerInput(createEngine([mover], [unit("near", 3)], { vision: 1 })).playerUnits.length, 0);
  const engine = createEngine([mover, unit("observer", 0, { type: "Recon_Bike", fuel: 20, movementCredit: 0 })],
    [unit("near", 3), unit("hidden", 9)], { vision: 1, scoutVision: 3 });
  assert.deepEqual(plannerInput(engine).playerUnits.map((entry) => entry.unit.unitId), ["near"]);
});

registerTest("BOT_ALLY_MOVEMENT_DEBITS_ACTION_STATE_AND_STABLE_SUPPLY_POSITION", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 3 })]);
  engine["executeHeuristicAllyTurn"]();
  const moved = ally(engine, "mover");
  assert.notDeepEqual(moved.hex, lane(0), "Fixture must commit an actual heuristic march.");
  const flags = engine["getUnitActionFlags"]("Ally", moved);
  assert.ok(flags.movementPointsUsed > 0);
  assert.equal(moved.movementCredit! + flags.movementPointsUsed, 3);
  assertSupplyMirror(engine, moved);
});

registerTest("BOT_ALLY_MOTORIZED_MOVEMENT_CONSUMES_REAL_FUEL_WITHOUT_ROUND_UPKEEP", () => {
  const engine = createEngine([unit("tank", 0, { type: "Medium_Tank", fuel: 20, movementCredit: 3 })]);
  engine["executeHeuristicAllyTurn"]();
  const moved = ally(engine, "tank");
  assert.notDeepEqual(moved.hex, lane(0));
  assert.ok(moved.fuel < 20, "An allied motorized march must not be free.");
  assert.equal(moved.fuel, 20 - engine["getUnitActionFlags"]("Ally", moved).movementPointsUsed);
  assertSupplyMirror(engine, moved);
});

registerTest("BOT_ALLY_ZERO_FUEL_AND_EXHAUSTED_ACTIONS_HOLD", () => {
  for (const mode of ["fuel", "movement"] as const) {
    const engine = createEngine([unit("mover", 0, { type: "Medium_Tank", fuel: mode === "fuel" ? 0 : 20 })]);
    if (mode === "movement") engine["allyActionFlags"].set("mover", {
      movementPointsUsed: 4, attacksUsed: 0, retaliationsUsed: 0, isRushing: false
    });
    engine["executeHeuristicAllyTurn"]();
    assert.deepEqual(ally(engine, "mover").hex, lane(0));
  }
});

registerTest("BOT_ALLY_CANONICAL_ATTACK_CONSUMES_AMMO_AND_CANNOT_REPEAT", () => {
  const engine = createEngine([unit("attacker", 0, { movementCredit: 0 })], [unit("defender", 1)]);
  engine["executeHeuristicAllyTurn"]();
  const attacker = ally(engine, "attacker");
  assert.equal(engine.getCombatReports().length, 1, "Fixture must execute a real accepted attack.");
  assert.ok(attacker.ammo < 6);
  assert.equal(engine["getUnitActionFlags"]("Ally", attacker).attacksUsed, 1);
  assertSupplyMirror(engine, attacker);
  const settled = engine.serialize();
  engine["executeHeuristicAllyTurn"]();
  assert.deepEqual(engine.serialize(), settled, "Repeated execution cannot recreate movement, attacks or free entrenchment.");
});

registerTest("BOT_ALLY_STACKED_ACTORS_ATTACK_ONCE_EACH_WITH_DISTINCT_REPORT_IDENTITIES", () => {
  const engine = createEngine([unit("lead", 0, { movementCredit: 0 }), unit("wing", 0, { movementCredit: 0 })],
    [unit("defender", 1, { type: "Medium_Tank", fuel: 20 })]);
  engine["executeHeuristicAllyTurn"]();
  const reports = engine.getCombatReports();
  assert.deepEqual(reports.map((entry) => entry.attacker.unitId).sort(), ["lead", "wing"]);
  for (const id of ["lead", "wing"]) {
    const actor = ally(engine, id);
    assert.equal(engine["getUnitActionFlags"]("Ally", actor).attacksUsed, 1);
    assertSupplyMirror(engine, actor);
  }
});

registerTest("BOT_ALLY_DESTROYING_PRIMARY_TARGET_PROMOTES_THE_SURVIVING_STACK_MEMBER", () => {
  const engine = createEngine([unit("attacker", 0, { type: "Medium_Tank", fuel: 20, movementCredit: 0 })],
    [unit("weak-primary", 1, { strength: 1, ammo: 0 }), unit("armored-wing", 1, { type: "Medium_Tank", fuel: 20 })]);
  engine["executeHeuristicAllyTurn"]();
  assert.equal(engine.botUnits.some((entry) => entry.unitId === "weak-primary"), false, "Fixture must remove the primary target.");
  const survivors = engine.botUnits.filter((entry) => axialKey(entry.hex) === axialKey(lane(1)));
  assert.ok(survivors.some((entry) => entry.unitId === "armored-wing"), "The armored wing must survive this attack.");
  assert.equal(engine["botPlacements"].has(axialKey(lane(1))), true, "A surviving secondary cannot remain orphaned outside the primary placement map.");
  assert.deepEqual(engine.getHexStackMembers(lane(1), "Bot").map((entry) => entry.unitId), survivors.map((entry) => entry.unitId));
});

registerTest("BOT_ALLY_COUNTERFIRE_IS_REAL_AND_CONSUMES_DEFENDER_RETALIATION", () => {
  const engine = createEngine([unit("attacker", 0, { movementCredit: 0 })], [unit("defender", 1)]);
  engine["executeHeuristicAllyTurn"]();
  assert.equal(engine.getCombatReports().length, 1);
  assert.ok(ally(engine, "attacker").strength < 100, "Real surviving defenders must return fire when eligible.");
  assert.equal(engine["getUnitActionFlags"]("Bot", engine.botUnits[0]!).retaliationsUsed, 1);
});

registerTest("BOT_ALLY_COUNTERFIRE_CAN_DESTROY_THE_ACTOR_WITHOUT_RESURRECTION", () => {
  const engine = createEngine([unit("attacker", 0, { type: "Medium_Tank", fuel: 20, strength: 1, movementCredit: 0 })],
    [unit("defender", 1, { type: "Medium_Tank", fuel: 20 })]);
  engine["executeHeuristicAllyTurn"]();
  const reports = engine.getCombatReports();
  assert.equal(reports.length, 1, "Fixture must execute a real heuristic attack, not hold or retreat.");
  assert.equal(engine.allyUnits.some((entry) => entry.unitId === "attacker"), false, "Canonical counterfire must remove a destroyed allied actor.");
  assert.equal(engine.serialize().supplyUnits?.Ally.some((entry) => entry.unitId === "attacker"), false);
});

registerTest("BOT_ALLY_CANONICAL_ASSAULT_ADVANCE_PRESERVES_ONE_ACTOR_AND_SUPPLY_ID", () => {
  const engine = createEngine([unit("attacker", 0, { movementCredit: 0 })],
    [unit("defender", 1, { strength: 1, ammo: 0 })]);
  engine["executeHeuristicAllyTurn"]();
  assert.equal(engine.getCombatReports().length, 1);
  assert.equal(engine.botUnits.length, 0, "Fixture must clear the assaulted target.");
  assert.deepEqual(ally(engine, "attacker").hex, lane(1));
  assert.equal(engine.allyUnits.length, 1);
  assertSupplyMirror(engine, ally(engine, "attacker"));
});

registerTest("BOT_ALLY_ATTACK_AND_COUNTERFIRE_REQUESTS_USE_THE_ACTUAL_FACTION_GENERAL", () => {
  const engine = createEngine([unit("attacker", 0)], [unit("defender", 1)],
    { allyDamageBonus: 37, botDamageBonus: 11, playerDamageBonus: 83 });
  const attacker = ally(engine, "attacker");
  const defender = engine.botUnits[0]!;
  const before = engine.serialize();
  const forward = engine["buildAttackRequest"](attacker, defender, "Ally", "Bot");
  const reverse = engine["buildAttackRequest"](defender, attacker, "Bot", "Ally", { isRetaliation: true });
  assert.ok(forward && reverse);
  assert.deepEqual([forward.attacker.general.dmgBonus, forward.defender.general.dmgBonus,
    reverse.attacker.general.dmgBonus, reverse.defender.general.dmgBonus], [37, 11, 11, 37]);
  assert.deepEqual(engine.serialize(), before, "Request projection must not consume state.");
});

registerTest("BOT_ALLY_PLANNER_ESTIMATE_IGNORES_PLAYER_GENERAL_AND_USES_ALLY_GENERAL", () => {
  const estimate = (allyAccuracyBonus: number, playerAccuracyBonus: number) => {
    const engine = createEngine([unit("attacker", 0, { strength: 20 })], [unit("defender", 3)], { allyAccuracyBonus, playerAccuracyBonus });
    const input = plannerInput(engine);
    return input.attackEstimator(input.botUnits[0]!, lane(0), input.playerUnits[0]!, lane(3));
  };
  const neutral = estimate(0, 0);
  assert.ok(neutral);
  assert.deepEqual(estimate(0, 80), neutral, "Unrelated Player command cannot change autonomous Ally plans.");
  const boosted = estimate(80, 0);
  assert.ok(boosted && boosted.expectedDamage > neutral.expectedDamage,
    `The real Ally commander must affect its own attack estimate: neutral=${JSON.stringify(neutral)}, boosted=${JSON.stringify(boosted)}.`);
});

registerTest("BOT_ALLY_TOWED_MARCH_PAYS_HOOKUP_TRUCK_COST_FUEL_AND_CANNOT_FIRE", () => {
  const engine = createEngine([unit("gun", 0, { type: "AT_Gun_50mm", fuel: 20, movementCredit: 4, towState: "deployed" })]);
  engine["executeHeuristicAllyTurn"]();
  const gun = ally(engine, "gun");
  assert.notDeepEqual(gun.hex, lane(0));
  assert.equal(gun.towState, "towed");
  assert.equal(engine["getUnitActionFlags"]("Ally", gun).movementPointsUsed + gun.movementCredit!, 4);
  assert.ok(gun.fuel < 20);
  assert.equal(engine.getCombatReports().length, 0);
  assertSupplyMirror(engine, gun);
});

registerTest("BOT_ALLY_CANONICAL_DIG_IN_CONSUMES_ACTION_AND_REJECTS_REPEAT", () => {
  const engine = createEngine([unit("digger", 0, { movementCredit: 4 })]);
  assert.equal(engine["executeHeuristicBotDigIn"](lane(0), "digger", "Ally"), true);
  const dug = ally(engine, "digger");
  assert.equal(dug.entrench, 1);
  assert.equal(dug.movementCredit, 0);
  assert.equal(engine["getUnitActionFlags"]("Ally", dug).attacksUsed, 1);
  const settled = engine.serialize();
  assert.equal(engine["executeHeuristicBotDigIn"](lane(0), "digger", "Ally"), false);
  assert.deepEqual(engine.serialize(), settled);
});

registerTest("BOT_ALLY_SERIALIZED_STACK_CONTINUATION_IS_DETERMINISTIC_WITHOUT_SCHEMA_CHANGE", () => {
  const initial = createEngine([unit("lead", 0, { movementCredit: 3 }), unit("wing", 0, { movementCredit: 3 })]);
  const saved = JSON.parse(JSON.stringify(initial.serialize())) as SerializedBattleState;
  const restored = createEngine([]);
  restored.hydrateFromSerialized(saved);
  initial["executeHeuristicAllyTurn"]();
  restored["executeHeuristicAllyTurn"]();
  assert.deepEqual(restored.serialize(), initial.serialize());
  assert.equal(restored.serialize().completeStateVersion, 1);
  assert.deepEqual(restored.allyUnits.map((entry) => entry.unitId).sort(), ["lead", "wing"]);
});

registerTest("BOT_ALLY_PLAYER_HANDOFF_REMAINS_COMPLETE_AND_IDEMPOTENT", () => {
  const engine = createEngine([unit("lead", 0), unit("wing", 0)]);
  const before = engine.allyUnits;
  assert.equal(engine.transferAllAlliedUnitsToPlayerControl(), 2);
  assert.equal(engine.allyUnits.length, 0);
  assert.deepEqual(engine.playerUnits, before.map((entry) => ({ ...entry, controlledBy: "Player" })));
  const settled = engine.serialize();
  assert.equal(engine.transferAllAlliedUnitsToPlayerControl(), 0);
  assert.deepEqual(engine.serialize(), settled);
});

registerTest("BOT_ALLY_SINGLE_ACTIVATION_SELECTS_ONLY_THE_REQUESTED_STACK_ID_WITHOUT_SUPPLY_TICK", () => {
  const engine = createEngine([unit("lead", 0, { movementCredit: 3 }), unit("wing", 0, { movementCredit: 3 })]);
  const leadBefore = ally(engine, "lead");
  const supplyBefore = engine.serialize().supplyStates;
  // The cast lets this desired public contract compile before its implementation;
  // the assertion below fails explicitly on old engines rather than substituting another executor.
  const activationEngine = engine as unknown as { executeAllyActivation?: (unitId: string) => BotTurnSummary };
  assert.equal(typeof activationEngine.executeAllyActivation, "function", "Autonomous Ally needs a real stable-ID initiative boundary.");
  const summary = activationEngine.executeAllyActivation!("wing");
  assert.deepEqual(ally(engine, "lead"), leadBefore);
  assert.ok(summary.moves.length > 0);
  assert.ok(summary.moves.every((entry) => entry.unitId === "wing"));
  assert.equal(summary.supplyReport, null);
  assert.deepEqual(engine.serialize().supplyStates, supplyBefore);
});
