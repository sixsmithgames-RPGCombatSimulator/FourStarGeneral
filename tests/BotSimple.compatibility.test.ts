/** Keeps the opt-in legacy policy inside canonical movement/combat ownership. */
import assert from "node:assert/strict";
import { axialKey, type Axial } from "../src/core/Hex";
import type { ScenarioData, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import terrainData from "../src/data/terrain.json";
import { GameEngine, type GameEngineConfig, type SerializedBattleState } from "../src/game/GameEngine";
import { registerTest } from "./harness";

const types = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;

function lane(q: number): Axial { return { q, r: 0 - Math.floor(q / 2) }; }
function laneKeys(...columns: number[]): string[] { return columns.map((q) => axialKey(lane(q))); }

function unit(id: string, q: number, overrides: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return {
    unitId: id, type: "Infantry_42", hex: lane(q), strength: 100,
    experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "E", ...overrides
  };
}

function createEngine(botUnits: ScenarioUnit[], playerUnits = [unit("target", 8)], options: {
  vision?: number; movement?: number; strategy?: "Simple" | "Heuristic" | "Default"; rows?: number; scoutVision?: number;
} = {}): GameEngine {
  const general = { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 };
  const scenario: ScenarioData = {
    name: "Simple compatibility lane", size: { cols: 10, rows: options.rows ?? 1 },
    tilePalette: { plain: { terrain: "plains", terrainType: "rural", density: "average", features: [], recon: "intel" } },
    tiles: Array.from({ length: options.rows ?? 1 }, () => Array.from({ length: 10 }, () => ({ tile: "plain" }))),
    objectives: [], turnLimit: 20,
    sides: { Player: { hq: lane(9), general, units: [] }, Bot: { hq: lane(0), general, units: [] } }
  };
  const definitions = { ...types };
  for (const type of ["Infantry_42", "Medium_Tank", "AT_Gun_50mm", "Recon_Bike"] as const) {
    if (!types[type]) continue;
    definitions[type] = { ...types[type], movement: options.movement ?? 4, vision: options.vision ?? 12 };
  }
  definitions.Recon_Bike = { ...definitions.Recon_Bike, vision: options.scoutVision ?? options.vision ?? 12 };
  const config: GameEngineConfig = {
    scenario, unitTypes: definitions, terrain, playerSide: scenario.sides.Player, botSide: scenario.sides.Bot,
    ...(options.strategy === "Default" ? {} : { botStrategyMode: options.strategy ?? "Simple" }),
    botDifficulty: "Normal", initialSupportAssets: []
  };
  const state: SerializedBattleState = {
    phase: "botTurn", activeFaction: "Bot", turnNumber: 2, baseCamp: null,
    playerPlacements: playerUnits, botPlacements: botUnits, allyPlacements: [], reserves: []
  };
  return GameEngine.fromSerialized(config, state);
}

registerTest("BOT_SIMPLE_MULTISTEP_PATH_USES_THE_ACTOR_NOT_HYPOTHETICAL_OCCUPANCY", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 3 })]);
  const summary = engine["executeBotTurn"]();
  assert.deepEqual(summary.moves[0]?.path.map(axialKey), laneKeys(0, 1, 2, 3));
  assert.equal(engine.botUnits[0]?.movementCredit, 0);
  assert.equal(engine["getUnitActionFlags"]("Bot", engine.botUnits[0]!).movementPointsUsed, 3);
});

registerTest("BOT_SIMPLE_FULL_ACTOR_STACK_ACTS_ONCE_WITH_STABLE_SUPPLY_IDENTITIES", () => {
  const engine = createEngine([unit("first", 0, { movementCredit: 2 }), unit("second", 0, { movementCredit: 2, ammo: 3 })]);
  const summary = engine["executeBotTurn"]();
  assert.deepEqual(summary.moves.map((move) => move.unitId), ["first", "second"]);
  assert.deepEqual(engine.botUnits.map((actor) => [actor.unitId, axialKey(actor.hex)]).sort(), [["first", axialKey(lane(2))], ["second", axialKey(lane(2))]]);
  const saved = engine.serialize();
  for (const actor of saved.botPlacements) {
    const supply = saved.supplyUnits?.Bot.find((entry) => entry.unitId === actor.unitId);
    assert.ok(supply, `Missing supply owner ${actor.unitId}`);
    assert.deepEqual(supply.hex, actor.hex);
    assert.equal(supply.ammo, actor.ammo);
  }
});

registerTest("BOT_SIMPLE_SPARE_FRIENDLY_SLOT_ALLOWS_TRANSIT_WITHOUT_OVERWRITING", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 3 }), unit("friend", 1, { movementCredit: 0 })]);
  const summary = engine["executeBotTurn"]();
  assert.deepEqual(summary.moves[0]?.path.map(axialKey), laneKeys(0, 1, 2, 3));
  assert.equal(axialKey(engine.botUnits.find((actor) => actor.unitId === "friend")!.hex), "1,0");
  assert.equal(engine.botUnits.length, 2);
});

registerTest("BOT_SIMPLE_FULL_FRIENDLY_STACK_BLOCKS_TRANSIT_AND_DESTINATION", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 3 }), unit("friend-1", 1, { movementCredit: 0 }), unit("friend-2", 1, { movementCredit: 0 })]);
  assert.equal(engine["executeBotTurn"]().moves.length, 0);
  assert.equal(engine.botUnits.length, 3);
  assert.equal(axialKey(engine.botUnits.find((actor) => actor.unitId === "mover")!.hex), "0,0");
});

registerTest("BOT_SIMPLE_UNSEEN_PLAYER_CONTACT_DOES_NOT_CREATE_A_PURSUIT", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 4 })], [unit("hidden", 8)], { vision: 1 });
  assert.equal(engine["checkTargetSpotted"](lane(8), "Bot"), false);
  assert.equal(engine["executeBotTurn"]().moves.length, 0);
});

registerTest("BOT_SIMPLE_CAN_PURSUE_A_CONTACT_SPOTTED_BY_ANOTHER_STACK_MEMBER", () => {
  const mover = unit("mover", 0, { movementCredit: 2 });
  assert.equal(createEngine([mover], undefined, { vision: 1 })["checkTargetSpotted"](lane(8), "Bot"), false);
  const engine = createEngine([mover, unit("observer", 0, { type: "Recon_Bike", movementCredit: 0, fuel: 20 })], undefined,
    { vision: 1, scoutVision: 12 });
  assert.equal(engine["checkTargetSpotted"](lane(8), "Bot"), true);
  const summary = engine["executeBotTurn"]();
  assert.equal(summary.moves[0]?.unitId, "mover");
  assert.equal(summary.moves[0]?.distance, 2);
});

registerTest("BOT_SIMPLE_UNBANKED_MOVEMENT_IS_MATERIALIZED_AND_CANNOT_REPEAT", () => {
  const engine = createEngine([unit("mover", 0)], [unit("target", 9)], { movement: 2 });
  const first = engine["executeBotTurn"]();
  const second = engine["executeBotTurn"]();
  assert.equal(first.moves[0]?.distance, 2);
  assert.equal(second.moves.length, 0);
  assert.equal(engine.botUnits[0]?.movementCredit, 0);
});

registerTest("BOT_SIMPLE_EXHAUSTED_UNBANKED_ACTION_FLAGS_CANNOT_RECREATE_MOVEMENT", () => {
  const engine = createEngine([unit("mover", 0)]);
  engine["botActionFlags"].set("mover", { movementPointsUsed: 4, attacksUsed: 0, retaliationsUsed: 0, isRushing: false });
  assert.equal(engine["executeBotTurn"]().moves.length, 0);
});

registerTest("BOT_SIMPLE_ZERO_FUEL_AND_ZERO_CREDIT_HOLD_WITHOUT_MUTATING_POSITION", () => {
  for (const overrides of [{ type: "Medium_Tank", fuel: 0, movementCredit: 4 }, { movementCredit: 0 }] satisfies Partial<ScenarioUnit>[]) {
    const engine = createEngine([unit("mover", 0, overrides)]);
    assert.equal(engine["executeBotTurn"]().moves.length, 0);
    assert.equal(axialKey(engine.botUnits[0]!.hex), "0,0");
  }
});

registerTest("BOT_SIMPLE_MOVEMENT_FUEL_IS_COMMITTED_BEFORE_CANONICAL_ATTACK", () => {
  const engine = createEngine([unit("attacker", 0, { type: "Medium_Tank", movementCredit: 4, fuel: 40 })], [unit("target", 2)]);
  const originalAttack = engine["resolveBotAttack"].bind(engine);
  const originalSupply = engine["applySupplyTickFor"].bind(engine);
  let combatFuel = 40;
  let afterCombat: ScenarioUnit | undefined;
  let beforeSupply: ScenarioUnit | undefined;
  engine["resolveBotAttack"] = (...args) => {
    combatFuel = args[0].fuel;
    const result = originalAttack(...args);
    afterCombat = engine.botUnits.find((actor) => actor.unitId === "attacker");
    return result;
  };
  engine["applySupplyTickFor"] = (faction) => {
    beforeSupply = engine.botUnits.find((actor) => actor.unitId === "attacker");
    return originalSupply(faction);
  };
  const summary = engine["executeBotTurn"]();
  assert.equal(summary.attacks.length, 1, "The real canonical attack must execute.");
  assert.ok(combatFuel < 40, "Combat must receive the already-debited fuel state.");
  assert.ok(afterCombat && beforeSupply);
  assert.deepEqual(beforeSupply, afterCombat, "No deferred pre-combat snapshot may refund ammunition or undo casualties before legitimate supply upkeep.");
});

registerTest("BOT_SIMPLE_DESTROYED_MOVING_ATTACKER_CANNOT_BE_RESURRECTED_BY_FUEL_COMMIT", () => {
  const engine = createEngine([unit("attacker", 0, { type: "Medium_Tank", movementCredit: 4, fuel: 40, strength: 1 })], [unit("target", 2, { type: "Medium_Tank", fuel: 40 })]);
  const originalAttack = engine["resolveBotAttack"].bind(engine);
  let destroyedAtCombatBoundary = false;
  engine["resolveBotAttack"] = (...args) => {
    const result = originalAttack(...args);
    destroyedAtCombatBoundary = !engine.botUnits.some((actor) => actor.unitId === "attacker");
    return result;
  };
  const summary = engine["executeBotTurn"]();
  assert.equal(summary.attacks.length, 1);
  assert.equal(destroyedAtCombatBoundary, true, "Fixture must destroy the real attacker through canonical counterfire.");
  assert.equal(engine.botUnits.some((actor) => actor.unitId === "attacker"), false);
  assert.equal(summary.moves[0]?.unitId, "attacker", "Committed movement remains presentable after its actor dies.");
});

registerTest("BOT_SIMPLE_SERIALIZED_CONTINUATION_REPLAYS_IDENTICALLY_WITHOUT_SCHEMA_OR_STRATEGY_CHANGE", () => {
  const initial = createEngine([unit("first", 0, { movementCredit: 2 }), unit("second", 0, { movementCredit: 2 })]);
  const saved = JSON.parse(JSON.stringify(initial.serialize())) as SerializedBattleState;
  const restored = createEngine([]);
  restored.hydrateFromSerialized(saved);
  assert.equal(initial["botStrategyMode"], "Simple");
  assert.equal(restored["botStrategyMode"], "Simple");
  assert.deepEqual(initial["executeBotTurn"](), restored["executeBotTurn"]());
  assert.deepEqual(initial.serialize(), restored.serialize());
});

registerTest("BOT_SIMPLE_CANONICAL_ASSAULT_ADVANCE_IS_NOT_UNDONE_OR_DUPLICATED", () => {
  const engine = createEngine([unit("attacker", 0, { type: "Recon_Bike", movementCredit: 4, fuel: 40 })],
    [unit("target", 2, { strength: 1, ammo: 0 })]);
  const summary = engine["executeBotTurn"]();
  assert.equal(summary.attacks.length, 1);
  assert.equal(summary.attacks[0]?.defenderDestroyed, true, "Fixture must clear the real target.");
  const attackers = engine.botUnits.filter((actor) => actor.unitId === "attacker");
  assert.equal(attackers.length, 1, "A deferred fuel write must not recreate a second actor at the old attack origin.");
  assert.deepEqual(attackers[0]?.hex, lane(2), "The canonical assault owns the final position.");
});

registerTest("BOT_SIMPLE_PINNED_AND_BROKEN_ACTORS_CANNOT_MOVE", () => {
  for (const strength of [100, 20]) {
    const engine = createEngine([unit("suppressed", 0, { strength, movementCredit: 4, suppressedBy: ["a", "b"] })]);
    assert.equal(engine["resolveUnitSuppressionState"](engine.botUnits[0]!).state, strength === 100 ? "pinned" : "broken");
    assert.equal(engine["executeBotTurn"]().moves.length, 0);
  }
});

registerTest("BOT_SIMPLE_HIDDEN_BLOCKER_DOES_NOT_CHANGE_THE_PLAN_BUT_STOPS_REAL_EXECUTION", () => {
  const actor = unit("mover", 0, { movementCredit: 4 });
  const clear = createEngine([actor], [unit("far-target", 9)], { vision: 1 });
  const blocked = createEngine([actor], [unit("hidden", 2), unit("far-target", 9)], { vision: 1 });
  assert.equal(blocked["checkTargetSpotted"](lane(2), "Bot"), false);
  const clearPath = clear["planBotPath"](lane(0), lane(5), 4);
  const hiddenPath = blocked["planBotPath"](lane(0), lane(5), 4);
  assert.deepEqual(clearPath?.map(axialKey), laneKeys(0, 1, 2, 3, 4));
  assert.deepEqual(hiddenPath, clearPath);
  // A deliberate deception provides the shared destination without inventing knowledge of hidden contacts.
  for (const engine of [clear, blocked]) {
    engine["_phase"] = "playerTurn";
    engine["_activeFaction"] = "Player";
    assert.equal(engine.deployCounterIntel(lane(5)).ok, true);
    engine["_phase"] = "botTurn";
    engine["_activeFaction"] = "Bot";
  }
  assert.equal(clear["executeBotTurn"]().moves[0]?.distance, 4);
  assert.deepEqual(blocked["executeBotTurn"]().moves[0]?.path.map(axialKey), laneKeys(0, 1));
  assert.deepEqual(blocked.playerUnits.find((entry) => entry.unitId === "hidden")?.hex, lane(2));
});

registerTest("BOT_SIMPLE_TOW_HOOKUP_AND_FUEL_USE_THE_CANONICAL_TRUCK_MOVEMENT_RULE", () => {
  const engine = createEngine([unit("gun", 0, { type: "AT_Gun_50mm", movementCredit: 4, towState: "deployed", fuel: 20 })]);
  const originalSupply = engine["applySupplyTickFor"].bind(engine);
  let movementFuel = 20;
  engine["applySupplyTickFor"] = (faction) => {
    movementFuel = engine.botUnits[0]!.fuel;
    return originalSupply(faction);
  };
  const summary = engine["executeBotTurn"]();
  const gun = engine.botUnits[0]!;
  assert.deepEqual(summary.moves[0]?.path.map(axialKey), laneKeys(0, 1, 2));
  assert.equal(gun.towState, "towed");
  assert.equal(gun.movementCredit, 0);
  assert.equal(engine["getUnitActionFlags"]("Bot", gun).movementPointsUsed, 4);
  assert.equal(movementFuel, 20 - engine["resolveMovementFuelStep"]("truck", lane(1)) - engine["resolveMovementFuelStep"]("truck", lane(2)));
  assert.equal(summary.attacks.length, 0);
});

registerTest("BOT_SIMPLE_PARTIAL_FUEL_LIMIT_PRESERVES_THE_ACTUAL_COMMITTED_ROUTE", () => {
  const engine = createEngine([unit("tank", 0, { type: "Medium_Tank", movementCredit: 4, fuel: 1.5 })]);
  const stepFuel = engine["resolveMovementFuelStep"]("track", lane(1));
  assert.ok(stepFuel > 0 && stepFuel <= 1.5 && 2 * stepFuel > 1.5, "Fixture must afford exactly one ground step.");
  assert.deepEqual(engine["executeBotTurn"]().moves[0]?.path.map(axialKey), laneKeys(0, 1));
});

registerTest("BOT_SIMPLE_ROUND_BOUNDARY_SERVICES_SUPPLY_ONCE_AND_REFRESHES_MOVEMENT", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 0 })], [unit("target", 9)], { movement: 2 });
  engine["_phase"] = "playerTurn";
  engine["_activeFaction"] = "Player";
  const supply = engine["applySupplyTickFor"].bind(engine);
  const factions: string[] = [];
  engine["applySupplyTickFor"] = (faction) => { factions.push(faction); return supply(faction); };
  engine.endTurn();
  assert.equal(engine.peekBotTurnSummary()?.moves[0]?.distance, 2);
  engine.endTurn();
  assert.equal(engine.peekBotTurnSummary()?.moves[0]?.distance, 2);
  assert.equal(factions.filter((faction) => faction === "Bot").length, 2);
  assert.equal(engine.turnNumber, 4);
});

registerTest("BOT_SIMPLE_OMITTED_STRATEGY_REMAINS_SIMPLE_AND_NEVER_ALIASES_HEURISTIC", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 2 })], undefined, { strategy: "Default" });
  assert.equal(engine["botStrategyMode"], "Simple");
  engine["executeHeuristicBotTurn"] = () => { throw new Error("Simple must retain its own nearest-contact policy."); };
  assert.equal(engine["executeBotTurn"]().moves[0]?.distance, 2);
});

registerTest("BOT_SIMPLE_LEGACY_SINGLE_STEP_CALL_CONTRACT_REMAINS_VALID", () => {
  const engine = createEngine([unit("mover", 0, { movementCredit: 2 })]);
  assert.deepEqual(engine["selectBotStepToward"](lane(0), lane(8)), lane(1));
  const friendly = createEngine([unit("mover", 0), unit("friend", 1)]);
  assert.equal(friendly["selectBotStepToward"](lane(0), lane(8)), null);
  const hostile = createEngine([unit("mover", 0)], [unit("hidden", 1)], { vision: 0 });
  assert.equal(hostile["selectBotStepToward"](lane(0), lane(8)), null);
});
