import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { Axial, ScenarioData, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { createInitialFormationStatus } from "../src/data/unitSystem/status";
import terrainData from "../src/data/terrain.json";
import { GameEngine, type SerializedBattleState } from "../src/game/GameEngine";
import {
  projectBattleAircraftAttackAmmunitionReadiness,
  projectBattleAircraftAttackManeuverReadiness
} from "../src/game/battle/combat/BattleAircraftAttackReadinessProjection";
import { projectBattleAttackerDisposition } from "../src/game/battle/combat/BattleAttackerDispositionProjection";
import { projectBattleAttackerPreparation } from "../src/game/battle/combat/BattleAttackerPreparation";
import { projectBattleDefenderDamage } from "../src/game/battle/combat/BattleDefenderDamageProjection";
import { registerTest } from "./harness.js";

const unitTypes = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;

function attacker(overrides: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return {
    type: "Infantry_42",
    unitId: "attack-preparation-unit",
    hex: { q: 2, r: -1 },
    strength: 8,
    experience: 2,
    ammo: 5,
    fuel: 4,
    entrench: 1,
    facing: "NW",
    onSentry: true,
    ...overrides
  };
}

function legacyProjection(
  source: ScenarioUnit,
  resolvedFacing: ScenarioUnit["facing"],
  ammunitionCost: number,
  maneuverCost: number
) {
  const attackRequestSource = structuredClone(source);
  attackRequestSource.facing = resolvedFacing;
  attackRequestSource.onSentry = false;
  const updatedAttacker = structuredClone(attackRequestSource);
  updatedAttacker.ammo = Math.max(0, updatedAttacker.ammo - ammunitionCost);
  return {
    attackRequestSource,
    updatedAttacker,
    nextActionFlags: {
      movementPointsUsed: 3 + maneuverCost,
      attacksUsed: 1,
      retaliationsUsed: 1,
      isRushing: true
    }
  };
}

function liveUnit(
  unitId: string,
  hex: Axial,
  facing: ScenarioUnit["facing"],
  ammo: number,
  strength = 100
): ScenarioUnit {
  return {
    type: "Infantry_42",
    unitId,
    formationKey: "infantry",
    hex: structuredClone(hex),
    strength,
    experience: 0,
    baseExperience: 0,
    earnedExperience: 0,
    ammo,
    fuel: 0,
    entrench: 0,
    facing,
    onSentry: true,
    status: createInitialFormationStatus("Infantry_42", "infantry", strength)
  };
}

function liveAircraftUnit(
  unitId: string,
  hex: Axial,
  facing: ScenarioUnit["facing"],
  strength = 100
): ScenarioUnit {
  return {
    ...liveUnit(unitId, hex, facing, 6, strength),
    type: "Fighter",
    formationKey: "airFighter",
    fuel: 50,
    status: createInitialFormationStatus("Fighter", "airFighter", strength)
  };
}

function liveScenario(): ScenarioData {
  const row = Array.from({ length: 5 }, () => ({ tile: "plain" }));
  return {
    name: "Battle attacker preparation integration",
    size: { cols: 5, rows: 3 },
    tilePalette: {
      plain: {
        terrain: "plains",
        terrainType: "rural",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row],
    objectives: [],
    turnLimit: 4,
    sides: {
      Player: {
        hq: { q: 0, r: 1 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      },
      Bot: {
        hq: { q: 4, r: 1 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      }
    }
  };
}

function liveEngine(state: SerializedBattleState): GameEngine {
  const scenario = liveScenario();
  return GameEngine.fromSerialized({
    scenario,
    unitTypes,
    terrain,
    playerSide: scenario.sides.Player,
    botSide: scenario.sides.Bot
  }, state);
}

function stateSignature(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readTypeScriptSources(directory: string): Array<{ path: string; source: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return readTypeScriptSources(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts")
      ? [{ path, source: readFileSync(path, "utf8") }]
      : [];
  });
}

registerTest("BATTLE_AIRCRAFT_ATTACK_READINESS_HAS_ONE_ORDERED_RESOURCE_POLICY", async ({ Given, When, Then }) => {
  const readyAmmo = { air: 2, ground: 1, needsRearm: false };
  let maneuverProjections!: ReturnType<typeof projectBattleAircraftAttackManeuverReadiness>[];
  let ammunitionProjections!: ReturnType<typeof projectBattleAircraftAttackAmmunitionReadiness>[];

  await Given("ground fire and aircraft attacks at each resource boundary", () => {});
  await When("the ordered maneuver and ammunition stages project every case", () => {
    maneuverProjections = [
      projectBattleAircraftAttackManeuverReadiness({
        attackerIsAircraft: false,
        defenderIsAircraft: true,
        movementAllowance: 0,
        movementPointsUsed: 99
      }),
      projectBattleAircraftAttackManeuverReadiness({
        attackerIsAircraft: true,
        defenderIsAircraft: true,
        movementAllowance: 5,
        movementPointsUsed: 3
      }),
      projectBattleAircraftAttackManeuverReadiness({
        attackerIsAircraft: true,
        defenderIsAircraft: false,
        movementAllowance: 5,
        movementPointsUsed: 4
      }),
      projectBattleAircraftAttackManeuverReadiness({
        attackerIsAircraft: true,
        defenderIsAircraft: true,
        movementAllowance: 1,
        movementPointsUsed: 0
      }),
      projectBattleAircraftAttackManeuverReadiness({
        attackerIsAircraft: true,
        defenderIsAircraft: false,
        movementAllowance: 0,
        movementPointsUsed: 0
      })
    ];
    ammunitionProjections = [
      projectBattleAircraftAttackAmmunitionReadiness({
        defenderIsAircraft: true,
        ammunition: readyAmmo
      }),
      projectBattleAircraftAttackAmmunitionReadiness({
        defenderIsAircraft: true,
        ammunition: null
      }),
      projectBattleAircraftAttackAmmunitionReadiness({
        defenderIsAircraft: false,
        ammunition: { air: 2, ground: 1, needsRearm: true }
      }),
      projectBattleAircraftAttackAmmunitionReadiness({
        defenderIsAircraft: true,
        ammunition: { air: 0, ground: 1, needsRearm: false }
      }),
      projectBattleAircraftAttackAmmunitionReadiness({
        defenderIsAircraft: false,
        ammunition: { air: 2, ground: 0, needsRearm: false }
      })
    ];
  });
  await Then("ground bypass, sortie cost, exact copy, and fail-closed null ammunition remain exact", () => {
    assert.deepEqual(maneuverProjections, [
      { maneuverCost: 0, unavailableReason: null, unavailableMessage: null },
      { maneuverCost: 2, unavailableReason: null, unavailableMessage: null },
      { maneuverCost: 1, unavailableReason: null, unavailableMessage: null },
      {
        maneuverCost: 2,
        unavailableReason: "insufficient-flight-time",
        unavailableMessage: "This squadron expended its flight time and cannot execute another aerial dogfight this turn."
      },
      {
        maneuverCost: 1,
        unavailableReason: "insufficient-flight-time",
        unavailableMessage: "This squadron lacks the flight time to line up another ground strike this turn."
      }
    ]);
    assert.deepEqual(ammunitionProjections, [
      { unavailableReason: null, unavailableMessage: null },
      {
        unavailableReason: "ammunition-state-unavailable",
        unavailableMessage: "This squadron's ammunition state is unavailable and the attack cannot proceed."
      },
      {
        unavailableReason: "needs-rearm",
        unavailableMessage: "This squadron must return to base to rearm before flying another sortie."
      },
      {
        unavailableReason: "air-ammunition-depleted",
        unavailableMessage: "The fighter wing has exhausted its interception ammo and needs to rearm at base."
      },
      {
        unavailableReason: "ground-ammunition-depleted",
        unavailableMessage: "The squadron has expended its bomb load and must rearm at the base camp before attacking ground targets again."
      }
    ]);
  });
});

registerTest("BATTLE_AIRCRAFT_MOVEMENT_REJECTION_DOES_NOT_INITIALIZE_AMMUNITION_STATE", async ({ Given, When, Then }) => {
  const playerId = "player-ground-strike-no-flight-time";
  const playerTargetId = "bot-ground-target-for-rejected-strike";
  const botId = "bot-ground-strike-no-flight-time";
  const botTargetId = "player-ground-target-for-rejected-strike";
  const playerHex = { q: 1, r: 1 };
  const botHex = { q: 2, r: 1 };
  let playerEngine!: GameEngine;
  let botEngine!: GameEngine;
  let playerBefore!: SerializedBattleState;
  let botBefore!: SerializedBattleState;
  let playerFailure: unknown;
  let botResolution: unknown;

  await Given("Player and Bot fighters with spent flight time and no legacy ammo registry entries", () => {
    playerEngine = liveEngine({
      phase: "playerTurn",
      activeFaction: "Player",
      turnNumber: 1,
      randomState: 0x1a2b3c4d,
      baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
      playerPlacements: [liveAircraftUnit(playerId, playerHex, "E")],
      botPlacements: [liveUnit(playerTargetId, botHex, "W", 0)],
      reserves: [],
      actionFlags: {
        Player: [[playerId, { movementPointsUsed: 10, attacksUsed: 0, retaliationsUsed: 0, isRushing: false }]],
        Bot: [],
        Ally: []
      },
      enemyContactStates: [{
        unitId: playerTargetId,
        state: "visible",
        lastSeenTurn: 1,
        lastKnownHex: botHex,
        lastKnownStrength: 100,
        knownUnitType: "Infantry_42",
        source: "aircraft-readiness-order-regression"
      }]
    });
    botEngine = liveEngine({
      phase: "playerTurn",
      activeFaction: "Player",
      turnNumber: 1,
      randomState: 0x5e6f7788,
      baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
      playerPlacements: [liveUnit(botTargetId, playerHex, "E", 0)],
      botPlacements: [liveAircraftUnit(botId, botHex, "W")],
      reserves: [],
      actionFlags: {
        Player: [],
        Bot: [[botId, { movementPointsUsed: 10, attacksUsed: 0, retaliationsUsed: 0, isRushing: false }]],
        Ally: []
      }
    });
    playerBefore = playerEngine.serialize();
    botBefore = botEngine.serialize();
    assert.deepEqual(playerBefore.aircraftAmmo?.player, []);
    assert.deepEqual(botBefore.aircraftAmmo?.bot, []);
  });

  await When("both live ground-strike paths reject on movement before ammunition lookup", () => {
    try {
      playerEngine.attackUnit(playerHex, botHex, "fireAtWill", playerId, playerTargetId);
    } catch (error) {
      playerFailure = error;
    }
    const botAttacker = botEngine.getHexStackMembers(botHex, "Bot").find((entry) => entry.unitId === botId)?.unit;
    if (!botAttacker) {
      throw new Error("Expected the Bot fighter before the rejected strike.");
    }
    botResolution = (botEngine as unknown as {
      resolveBotAttack(unit: ScenarioUnit, from: Axial, target: Axial, stance: "fireAtWill"): unknown;
    }).resolveBotAttack(botAttacker, botHex, playerHex, "fireAtWill");
  });

  await Then("the Player copy is exact, Bot returns null, and neither transaction mutates serialized state", () => {
    assert.ok(playerFailure instanceof Error);
    assert.equal(playerFailure.message, "This squadron lacks the flight time to line up another ground strike this turn.");
    assert.equal(botResolution, null);
    assert.deepEqual(playerEngine.serialize(), playerBefore);
    assert.deepEqual(botEngine.serialize(), botBefore);
    assert.deepEqual(playerEngine.serialize().aircraftAmmo?.player, []);
    assert.deepEqual(botEngine.serialize().aircraftAmmo?.bot, []);
  });
});

registerTest("BATTLE_ATTACKER_PREPARATION_PRESERVES_PLAYER_AND_BOT_PARITY", async ({ Given, When, Then }) => {
  const cases = [
    { source: attacker(), resolvedFacing: "E" as const, ammunitionCost: 2, maneuverCost: 0 },
    { source: attacker({ type: "Fighter", ammo: 1 }), resolvedFacing: "SW" as const, ammunitionCost: 1, maneuverCost: 1 },
    { source: attacker({ ammo: 0 }), resolvedFacing: "W" as const, ammunitionCost: 3, maneuverCost: 2 }
  ];

  await Given("representative ground, strike-aircraft, and exhausted-ammunition attackers", () => {});
  await When("the shared projection prepares each deterministic attack commitment", () => {});
  await Then("it exactly matches the former inline player and Bot calculation", () => {
    for (const testCase of cases) {
      const actual = projectBattleAttackerPreparation({
        ...testCase,
        attacker: testCase.source,
        actionFlags: {
          movementPointsUsed: 3,
          attacksUsed: 0,
          retaliationsUsed: 1,
          isRushing: true
        }
      });
      assert.deepEqual(
        actual,
        legacyProjection(
          testCase.source,
          testCase.resolvedFacing,
          testCase.ammunitionCost,
          testCase.maneuverCost
        )
      );
    }
  });
});

registerTest("BATTLE_ATTACKER_PREPARATION_OUTPUTS_ARE_DETACHED", async ({ Given, When, Then }) => {
  const source = attacker();
  const projection = projectBattleAttackerPreparation({
    attacker: source,
    resolvedFacing: "SE",
    ammunitionCost: 2,
    maneuverCost: 1,
    actionFlags: { movementPointsUsed: 2, attacksUsed: 0, retaliationsUsed: 1, isRushing: false }
  });

  await Given("one mutable live attacker snapshot", () => {});
  await When("the source and each projected snapshot are mutated independently", () => {
    source.hex.q = 99;
    projection.attackRequestSource.hex.r = 88;
    projection.updatedAttacker.hex.q = 77;
  });
  await Then("no mutation crosses a snapshot boundary", () => {
    assert.deepEqual(source.hex, { q: 99, r: -1 });
    assert.deepEqual(projection.attackRequestSource.hex, { q: 2, r: 88 });
    assert.deepEqual(projection.updatedAttacker.hex, { q: 77, r: -1 });
    assert.equal(projection.attackRequestSource.ammo, 5);
    assert.equal(projection.updatedAttacker.ammo, 3);
    assert.equal(projection.attackRequestSource.onSentry, false);
    assert.equal(projection.updatedAttacker.facing, "SE");
  });
});

registerTest("BATTLE_ATTACKER_PREPARATION_INTENTIONALLY_RESETS_OPTIONAL_ACTION_SENTINELS", async ({ Given, When, Then }) => {
  const sentinelFlags = {
    movementPointsUsed: 1,
    attacksUsed: 0,
    retaliationsUsed: 2,
    isRushing: true,
    retaliationLimit: 3,
    smokeUsed: true,
    facingSet: true,
    supportQueued: true
  };
  let nextFlags!: ReturnType<typeof projectBattleAttackerPreparation>["nextActionFlags"];

  await Given("legacy core action values plus optional one-action sentinels", () => {});
  await When("a successful attack commitment is projected", () => {
    nextFlags = projectBattleAttackerPreparation({
      attacker: attacker(),
      resolvedFacing: "E",
      ammunitionCost: 1,
      maneuverCost: 2,
      actionFlags: sentinelFlags
    }).nextActionFlags;
  });
  await Then("core values advance or survive while legacy optional sentinels are deliberately reset", () => {
    assert.deepEqual(nextFlags, {
      movementPointsUsed: 3,
      attacksUsed: 1,
      retaliationsUsed: 2,
      isRushing: true
    });
    assert.equal("retaliationLimit" in nextFlags, false);
    assert.equal("smokeUsed" in nextFlags, false);
    assert.equal("facingSet" in nextFlags, false);
    assert.equal("supportQueued" in nextFlags, false);
  });
});

registerTest("BATTLE_DEFENDER_DAMAGE_PROJECTION_IS_EXACT_AND_DETACHED", async ({ Given, When, Then }) => {
  const damaged = attacker({
    unitId: "damaged-defender",
    strength: 6,
    suppressedBy: ["existing-suppressor"]
  });
  let projection!: ReturnType<typeof projectBattleDefenderDamage>;

  await Given("a surviving damaged defender and a newly suppressing attacker", () => {});
  await When("the shared post-damage projection finalizes defender facts", () => {
    projection = projectBattleDefenderDamage({
      defenderAfterDamage: damaged,
      stance: "suppressive",
      suppressorKey: "new-suppressor",
      suppressionBefore: "pinned"
    });
  });
  await Then("it records one unique suppressor, detects the transition, and detaches output", () => {
    assert.deepEqual(projection.updatedDefender.suppressedBy, ["existing-suppressor", "new-suppressor"]);
    assert.equal(projection.defenderBecameBroken, true);
    projection.updatedDefender.hex.q = 99;
    projection.updatedDefender.suppressedBy?.push("output-only");
    assert.deepEqual(damaged.hex, { q: 2, r: -1 });
    assert.deepEqual(damaged.suppressedBy, ["existing-suppressor"]);

    const repeated = projectBattleDefenderDamage({
      defenderAfterDamage: damaged,
      stance: "suppressive",
      suppressorKey: "existing-suppressor",
      suppressionBefore: "broken"
    });
    assert.deepEqual(repeated.updatedDefender.suppressedBy, ["existing-suppressor"]);
    assert.equal(repeated.defenderBecameBroken, false);

    const destroyed = projectBattleDefenderDamage({
      defenderAfterDamage: attacker({ strength: 0 }),
      stance: "suppressive",
      suppressorKey: "ignored-on-destroyed",
      suppressionBefore: "clear"
    });
    assert.equal(destroyed.updatedDefender.suppressedBy, undefined);
    assert.equal(destroyed.defenderBecameBroken, false);

    const destroyedWhilePinned = projectBattleDefenderDamage({
      defenderAfterDamage: attacker({
        strength: 0,
        suppressedBy: ["first-suppressor", "second-suppressor"]
      }),
      stance: "fireAtWill",
      suppressorKey: "irrelevant",
      suppressionBefore: "pinned"
    });
    assert.equal(destroyedWhilePinned.defenderBecameBroken, false);

    const brokenByNewSuppressor = projectBattleDefenderDamage({
      defenderAfterDamage: attacker({
        strength: 20,
        suppressedBy: ["first-suppressor"]
      }),
      stance: "suppressive",
      suppressorKey: "second-suppressor",
      suppressionBefore: "suppressed"
    });
    assert.deepEqual(brokenByNewSuppressor.updatedDefender.suppressedBy, [
      "first-suppressor",
      "second-suppressor"
    ]);
    assert.equal(brokenByNewSuppressor.defenderBecameBroken, true);
  });
});

registerTest("BATTLE_ATTACKER_DISPOSITION_COVERS_ADVANCE_HOLD_AND_DESTRUCTION_WITHOUT_ALIASING", async ({ Given, When, Then }) => {
  const source = attacker({ hex: { q: 1, r: 1 }, entrench: 2, strength: 8 });
  let advance!: ReturnType<typeof projectBattleAttackerDisposition>;
  let aircraftHold!: ReturnType<typeof projectBattleAttackerDisposition>;
  let primaryAircraftHold!: ReturnType<typeof projectBattleAttackerDisposition>;
  let destroyed!: ReturnType<typeof projectBattleAttackerDisposition>;

  await Given("resolved ground, aircraft, and destroyed attackers", () => {});
  await When("their post-combat dispositions are projected", () => {
    advance = projectBattleAttackerDisposition({
      attackerAfterCombat: source,
      targetHex: { q: 2, r: 1 },
      stance: "assault",
      allDefendersDestroyed: true,
      attackerIsAircraft: false,
      primaryDefenderIsAircraft: false
    });
    aircraftHold = projectBattleAttackerDisposition({
      attackerAfterCombat: attacker({ type: "Fighter", hex: { q: 1, r: 1 }, entrench: 2 }),
      targetHex: { q: 2, r: 1 },
      stance: "assault",
      allDefendersDestroyed: true,
      attackerIsAircraft: true,
      primaryDefenderIsAircraft: false
    });
    primaryAircraftHold = projectBattleAttackerDisposition({
      attackerAfterCombat: attacker({ hex: { q: 1, r: 1 }, entrench: 2 }),
      targetHex: { q: 2, r: 1 },
      stance: "assault",
      allDefendersDestroyed: true,
      attackerIsAircraft: false,
      primaryDefenderIsAircraft: true
    });
    destroyed = projectBattleAttackerDisposition({
      attackerAfterCombat: attacker({ hex: { q: 1, r: 1 }, strength: 0 }),
      targetHex: { q: 2, r: 1 },
      stance: "assault",
      allDefendersDestroyed: true,
      attackerIsAircraft: false,
      primaryDefenderIsAircraft: false
    });
  });
  await Then("only the eligible surviving ground assault advances and every output is detached", () => {
    assert.equal(advance.kind, "advance");
    assert.deepEqual(advance.attacker.hex, { q: 2, r: 1 });
    assert.equal(advance.attacker.entrench, 0);
    assert.equal(aircraftHold.kind, "hold");
    assert.equal(aircraftHold.attacker.entrench, 2);
    assert.equal(primaryAircraftHold.kind, "hold");
    assert.deepEqual(primaryAircraftHold.attacker.hex, { q: 1, r: 1 });
    assert.equal(primaryAircraftHold.attacker.entrench, 2);
    assert.equal(destroyed.kind, "destroyed");
    advance.attacker.hex.q = 99;
    assert.deepEqual(source.hex, { q: 1, r: 1 });
    assert.equal(source.entrench, 2);
  });
});

registerTest("BATTLE_ATTACKER_PREPARATION_REAL_PLAYER_AND_BOT_TRANSACTION_SIGNATURES", async ({ Given, When, Then }) => {
  const playerId = "player-preparation-live";
  const playerTargetId = "bot-target-live";
  const botId = "bot-preparation-live";
  const botTargetId = "player-target-live";
  const playerHex = { q: 1, r: 1 };
  const botHex = { q: 2, r: 1 };
  const playerSeed = 0x12345678;
  const botSeed = 0x0badc0de;
  let playerEngine!: GameEngine;
  let botEngine!: GameEngine;
  let playerRandomBefore = 0;
  let botRandomBefore = 0;
  let playerSignature = "";
  let botSignature = "";
  let playerPayload: unknown;
  let botPayload: unknown;

  await Given("seeded real engines with non-default ammo, facing, and action inputs", () => {
    playerEngine = liveEngine({
      phase: "playerTurn",
      activeFaction: "Player",
      turnNumber: 1,
      randomState: playerSeed,
      baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
      playerPlacements: [liveUnit(playerId, playerHex, "NW", 6)],
      botPlacements: [liveUnit(playerTargetId, botHex, "SE", 0)],
      reserves: [],
      actionFlags: {
        Player: [[playerId, {
          movementPointsUsed: 1,
          attacksUsed: 0,
          retaliationsUsed: 1,
          isRushing: true,
          retaliationLimit: 2,
          smokeUsed: true,
          facingSet: true,
          supportQueued: true
        }]],
        Bot: [],
        Ally: []
      },
      enemyContactStates: [{
        unitId: playerTargetId,
        state: "visible",
        lastSeenTurn: 1,
        lastKnownHex: botHex,
        lastKnownStrength: 100,
        knownUnitType: "Infantry_42",
        source: "preparation-integration"
      }]
    });
    botEngine = liveEngine({
      phase: "playerTurn",
      activeFaction: "Player",
      turnNumber: 1,
      randomState: botSeed,
      baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
      playerPlacements: [liveUnit(botTargetId, playerHex, "NW", 0)],
      botPlacements: [liveUnit(botId, botHex, "SE", 6)],
      reserves: [],
      actionFlags: {
        Player: [],
        Bot: [[botId, {
          movementPointsUsed: 2,
          attacksUsed: 0,
          retaliationsUsed: 1,
          isRushing: true,
          retaliationLimit: 2,
          smokeUsed: true,
          facingSet: true,
          supportQueued: true
        }]],
        Ally: []
      }
    });
    playerRandomBefore = playerEngine.serialize().randomState ?? 0;
    botRandomBefore = botEngine.serialize().randomState ?? 0;
  });

  await When("real Player suppressive fire and Bot fire-at-will transactions resolve", () => {
    const playerResolution = playerEngine.attackUnit(playerHex, botHex, "suppressive", playerId, playerTargetId);
    const botAttacker = botEngine.getHexStackMembers(botHex, "Bot").find((entry) => entry.unitId === botId)?.unit;
    if (!playerResolution || !botAttacker) {
      throw new Error("Expected both integration attacks to have valid live participants.");
    }
    const botResolution = (botEngine as unknown as {
      resolveBotAttack(unit: ScenarioUnit, from: Axial, target: Axial, stance: "fireAtWill"): unknown;
    }).resolveBotAttack(botAttacker, botHex, playerHex, "fireAtWill");
    if (!botResolution) {
      throw new Error("Expected the real Bot attack to resolve.");
    }

    const playerState = playerEngine.serialize();
    const botState = botEngine.serialize();
    const playerAfter = playerState.playerPlacements.find((unit) => unit.unitId === playerId);
    const botAfter = botState.botPlacements.find((unit) => unit.unitId === botId);
    const playerDefenderAfter = playerState.botPlacements.find((unit) => unit.unitId === playerTargetId);
    const botDefenderAfter = botState.playerPlacements.find((unit) => unit.unitId === botTargetId);
    const playerFlags = playerState.actionFlags?.Player.find(([key]) => key === playerId)?.[1];
    const botFlags = botState.actionFlags?.Bot.find(([key]) => key === botId)?.[1];
    const playerReports = playerEngine.getCombatReports();
    const botReports = botEngine.getCombatReports();
    playerPayload = {
      randomBefore: playerRandomBefore,
      randomAfter: playerState.randomState,
      attacker: playerAfter && {
        hex: playerAfter.hex,
        ammo: playerAfter.ammo,
        entrench: playerAfter.entrench,
        facing: playerAfter.facing,
        onSentry: playerAfter.onSentry,
        strength: playerAfter.strength,
        earnedExperience: playerAfter.earnedExperience
      },
      defender: playerDefenderAfter && {
        facing: playerDefenderAfter.facing,
        onSentry: playerDefenderAfter.onSentry,
        strength: playerDefenderAfter.strength,
        suppressedBy: playerDefenderAfter.suppressedBy
      },
      actionFlags: playerFlags,
      resolution: playerResolution,
      report: playerReports[playerReports.length - 1]
    };
    botPayload = {
      randomBefore: botRandomBefore,
      randomAfter: botState.randomState,
      attacker: botAfter && {
        hex: botAfter.hex,
        ammo: botAfter.ammo,
        entrench: botAfter.entrench,
        facing: botAfter.facing,
        onSentry: botAfter.onSentry,
        strength: botAfter.strength,
        earnedExperience: botAfter.earnedExperience
      },
      defender: botDefenderAfter && {
        facing: botDefenderAfter.facing,
        onSentry: botDefenderAfter.onSentry,
        strength: botDefenderAfter.strength,
        suppressedBy: botDefenderAfter.suppressedBy
      },
      actionFlags: botFlags,
      resolution: botResolution,
      report: botReports[botReports.length - 1]
    };
    playerSignature = stateSignature(playerPayload);
    botSignature = stateSignature(botPayload);
  });

  await Then("ammo, facing, action commitment, output, and RNG ordering match locked transactions", () => {
    assert.deepEqual((playerPayload as { attacker: unknown }).attacker, {
      hex: playerHex,
      ammo: 4,
      entrench: 0,
      facing: "E",
      onSentry: false,
      strength: 100,
      earnedExperience: 1
    });
    assert.deepEqual((playerPayload as { actionFlags: unknown }).actionFlags, {
      movementPointsUsed: 1,
      attacksUsed: 1,
      retaliationsUsed: 1,
      isRushing: true
    });
    assert.deepEqual((botPayload as { attacker: unknown }).attacker, {
      hex: botHex,
      ammo: 5,
      entrench: 0,
      facing: "W",
      onSentry: false,
      strength: 100,
      earnedExperience: 1
    });
    assert.deepEqual((botPayload as { actionFlags: unknown }).actionFlags, {
      movementPointsUsed: 2,
      attacksUsed: 1,
      retaliationsUsed: 1,
      isRushing: true
    });
    assert.deepEqual((playerPayload as { defender: unknown }).defender, {
      facing: "W",
      onSentry: false,
      strength: 87.26,
      suppressedBy: [playerId]
    });
    assert.deepEqual((botPayload as { defender: unknown }).defender, {
      facing: "E",
      onSentry: false,
      strength: 84.48,
      suppressedBy: undefined
    });
    assert.equal((playerPayload as { randomBefore: number }).randomBefore, playerSeed);
    assert.equal((botPayload as { randomBefore: number }).randomBefore, botSeed);
    assert.equal((playerPayload as { randomAfter: number }).randomAfter, playerSeed);
    assert.equal((botPayload as { randomAfter: number }).randomAfter, botSeed);
    assert.equal(playerSignature, "b60a12bab8a2ec17286e636541b855ebf72d9e497deb5cd4414927af2b6730d0");
    assert.equal(botSignature, "1cb60ad8c7385cd7fe0e6d8123c18753e3f2b52d67a9750f3a7d2f5f2f465732");
  });
});

registerTest("BATTLE_ATTACKER_DISPOSITION_REAL_PLAYER_AND_BOT_ASSAULT_ADVANCE_SIGNATURES", async ({ Given, When, Then }) => {
  const playerId = "player-assault-disposition";
  const botId = "bot-assault-disposition";
  const playerTargetId = "bot-fragile-target";
  const botTargetId = "player-fragile-target";
  const playerOrigin = { q: 1, r: 1 };
  const botOrigin = { q: 2, r: 1 };
  const playerSeed = 0x13572468;
  const botSeed = 0x24681357;
  let playerEngine!: GameEngine;
  let botEngine!: GameEngine;
  let playerSignature = "";
  let botSignature = "";

  await Given("seeded real engines with adjacent fragile defenders", () => {
    playerEngine = liveEngine({
      phase: "playerTurn",
      activeFaction: "Player",
      turnNumber: 1,
      randomState: playerSeed,
      baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
      playerPlacements: [liveUnit(playerId, playerOrigin, "NW", 6)],
      botPlacements: [liveUnit(playerTargetId, botOrigin, "SE", 0, 1)],
      reserves: [],
      enemyContactStates: [{
        unitId: playerTargetId,
        state: "visible",
        lastSeenTurn: 1,
        lastKnownHex: botOrigin,
        lastKnownStrength: 1,
        knownUnitType: "Infantry_42",
        source: "disposition-assault-integration"
      }]
    });
    botEngine = liveEngine({
      phase: "playerTurn",
      activeFaction: "Player",
      turnNumber: 1,
      randomState: botSeed,
      baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
      playerPlacements: [liveUnit(botTargetId, playerOrigin, "NW", 0, 1)],
      botPlacements: [liveUnit(botId, botOrigin, "SE", 6)],
      reserves: []
    });
  });

  await When("real Player and Bot assault transactions destroy and occupy their targets", () => {
    const playerResolution = playerEngine.attackUnit(playerOrigin, botOrigin, "assault", playerId, playerTargetId);
    const botAttacker = botEngine.getHexStackMembers(botOrigin, "Bot").find((entry) => entry.unitId === botId)?.unit;
    if (!playerResolution || !botAttacker) {
      throw new Error("Expected both assault integrations to have valid participants.");
    }
    const botResolution = (botEngine as unknown as {
      resolveBotAttack(unit: ScenarioUnit, from: Axial, target: Axial, stance: "assault"): unknown;
    }).resolveBotAttack(botAttacker, botOrigin, playerOrigin, "assault");
    if (!botResolution) {
      throw new Error("Expected the Bot assault integration to resolve.");
    }
    const playerState = playerEngine.serialize();
    const botState = botEngine.serialize();
    playerSignature = stateSignature({
      randomState: playerState.randomState,
      attackers: playerState.playerPlacements,
      defenders: playerState.botPlacements,
      flags: playerState.actionFlags?.Player,
      resolution: playerResolution,
      reports: playerEngine.getCombatReports()
    });
    botSignature = stateSignature({
      randomState: botState.randomState,
      attackers: botState.botPlacements,
      defenders: botState.playerPlacements,
      flags: botState.actionFlags?.Bot,
      resolution: botResolution,
      reports: botEngine.getCombatReports()
    });
  });

  await Then("both canonical advance decisions relocate exactly once with locked transactions", () => {
    assert.equal(playerEngine.getHexStackMembers(playerOrigin, "Player").some((entry) => entry.unitId === playerId), false);
    assert.equal(playerEngine.getHexStackMembers(botOrigin, "Player").some((entry) => entry.unitId === playerId), true);
    assert.equal(playerEngine.getHexStackMembers(botOrigin, "Bot").some((entry) => entry.unitId === playerTargetId), false);
    assert.equal(botEngine.getHexStackMembers(botOrigin, "Bot").some((entry) => entry.unitId === botId), false);
    assert.equal(botEngine.getHexStackMembers(playerOrigin, "Bot").some((entry) => entry.unitId === botId), true);
    assert.equal(botEngine.getHexStackMembers(playerOrigin, "Player").some((entry) => entry.unitId === botTargetId), false);
    assert.equal(playerEngine.serialize().randomState, playerSeed);
    assert.equal(botEngine.serialize().randomState, botSeed);
    assert.equal(playerSignature, "fef10f86c15281112ec587214018e0cf4d0216a99449b0139eababd483e2dadb");
    assert.equal(botSignature, "c2e345f56046b4ab1e73089e9bc5945645c050d34cc9ac2a2496a9f11afbaf29");
  });
});

registerTest("BATTLE_ATTACKER_PREPARATION_IS_THE_SINGLE_ENGINE_AUTHORITY", async ({ Given, When, Then }) => {
  const source = readFileSync("src/game/GameEngine.ts", "utf8");
  const playerStart = source.indexOf("  private resolvePlayerAttack(");
  const playerEnd = source.indexOf("  /** Resolve a basic attack", playerStart);
  const botStart = source.indexOf("  private resolveBotAttack(");
  const botEnd = source.indexOf("  /** Ensures bot supply", botStart);
  const previewStart = source.indexOf("  private previewRetaliationForPlayerAttack(");
  const previewEnd = source.indexOf("  private resolveMoveCost(", previewStart);
  const suppressionResolverStart = source.indexOf("  private resolveUnitSuppressionState(");
  const suppressionResolverEnd = source.indexOf("  private isPinnedOrBroken(", suppressionResolverStart);
  const playerBody = source.slice(playerStart, playerEnd);
  const botBody = source.slice(botStart, botEnd);
  const previewBody = source.slice(previewStart, previewEnd);
  const suppressionResolverBody = source.slice(suppressionResolverStart, suppressionResolverEnd);

  await Given("the two live engine attack transaction paths", () => {
    assert.ok(playerStart >= 0 && playerEnd > playerStart);
    assert.ok(botStart >= 0 && botEnd > botStart);
    assert.ok(previewStart >= 0 && previewEnd > previewStart);
    assert.ok(suppressionResolverStart >= 0 && suppressionResolverEnd > suppressionResolverStart);
  });
  await When("their deterministic attacker preparation ownership is inspected", () => {});
  await Then("each delegates exactly once and neither retains the split calculation", () => {
    assert.equal(playerBody.match(/projectBattleAttackerPreparation\(/g)?.length, 1);
    assert.equal(botBody.match(/projectBattleAttackerPreparation\(/g)?.length, 1);
    assert.equal(playerBody.match(/projectBattleAircraftAttackManeuverReadiness\(/g)?.length, 1);
    assert.equal(botBody.match(/projectBattleAircraftAttackManeuverReadiness\(/g)?.length, 1);
    assert.equal(playerBody.match(/projectBattleAircraftAttackAmmunitionReadiness\(/g)?.length, 1);
    assert.equal(botBody.match(/projectBattleAircraftAttackAmmunitionReadiness\(/g)?.length, 1);
    assert.equal(playerBody.match(/projectBattleDefenderDamage\(/g)?.length, 1);
    assert.equal(botBody.match(/projectBattleDefenderDamage\(/g)?.length, 1);
    assert.equal(playerBody.match(/projectBattleAttackerDisposition\(/g)?.length, 1);
    assert.equal(botBody.match(/projectBattleAttackerDisposition\(/g)?.length, 1);
    assert.equal(previewBody.match(/projectBattleDefenderDamage\(/g)?.length, 1);
    assert.match(suppressionResolverBody, /return resolveBattleUnitSuppressionState\(unit\);/);
    assert.doesNotMatch(suppressionResolverBody, /suppressedBy|count\s*[=>]/);
    for (const body of [playerBody, botBody]) {
      assert.doesNotMatch(body, /attackRequestSource\s*=\s*structuredClone\(attackingSnapshot\)/);
      assert.doesNotMatch(body, /updatedAttacker\.ammo\s*=\s*attackerIsAircraft/);
      assert.doesNotMatch(body, /attacksUsed:\s*(?:flags|attackerFlags)\.attacksUsed\s*\+\s*1/);
      assert.doesNotMatch(body, /suppressors\.push\(attackerKey\)/);
      assert.doesNotMatch(body, /defenderSuppressionBefore\s*!==\s*"broken"/);
      assert.doesNotMatch(body, /const canAssaultAdvance\s*=/);
      assert.doesNotMatch(body, /updatedAttacker\.hex\s*=\s*structuredClone/);
      assert.doesNotMatch(body, /remaining(?:Air)?Movement\s*\+\s*1e-6\s*</);
      assert.doesNotMatch(body, /ammoState\.(?:air|ground)\s*<=\s*0/);
      assert.doesNotMatch(body, /aircraftNeedsRearm\(/);
      assert.doesNotMatch(body, /attackManeuverCost\s*=\s*primaryDefenderIsAircraft/);
    }
    assert.doesNotMatch(previewBody, /defenderSuppressionBefore\s*!==\s*"broken"/);

    const productionSources = readTypeScriptSources("src");
    for (const functionName of [
      "projectBattleAircraftAttackManeuverReadiness",
      "projectBattleAircraftAttackAmmunitionReadiness"
    ]) {
      const declarationOwners = productionSources
        .filter(({ source: candidate }) => new RegExp(`export\\s+function\\s+${functionName}\\b`).test(candidate))
        .map(({ path }) => path);
      const runtimeCallers = productionSources
        .filter(({ path }) => path !== "src/game/battle/combat/BattleAircraftAttackReadinessProjection.ts")
        .filter(({ source: candidate }) => new RegExp(`${functionName}\\(`).test(candidate))
        .map(({ path }) => path);
      assert.deepEqual(declarationOwners, ["src/game/battle/combat/BattleAircraftAttackReadinessProjection.ts"]);
      assert.deepEqual(runtimeCallers, ["src/game/GameEngine.ts"]);
    }
  });
});
