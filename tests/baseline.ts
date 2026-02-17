/**
 * Acceptance-style tests covering accuracy falloff, line of sight blocking, and supply attrition.
 * Each test follows the Given/When/Then structure enforced by the lightweight harness.
 */
import { registerTest } from "./harness";
import { calculateAccuracy } from "../src/core/Combat";
import type { AttackRequest, AttackerContext, DefenderContext, UnitCombatState } from "../src/core/Combat";
import { combat as balanceCombat } from "../src/core/balance";
import type { TerrainDefinition, UnitTypeDefinition } from "../src/core/types";
import { supplyTick } from "../src/core/Supply";
import type { SupplyNetwork, SupplyUnitState } from "../src/core/Supply";
import { losClear } from "../src/core/LOS";
import type { Lister } from "../src/core/LOS";
import type { Axial } from "../src/core/Hex";
import { GameEngine, type GameEngineConfig, buildScenarioUnitsFromAllocation } from "../src/game/GameEngine";
import terrainDataJson from "../src/data/terrain.json";
import unitTypesJson from "../src/data/unitTypes.json";
import type {
  ScenarioData as EngineScenarioData,
  ScenarioSide as EngineScenarioSide,
  TerrainDictionary,
  UnitTypeDictionary,
  ScenarioUnit
} from "../src/core/types";
import { deploymentTemplates } from "../src/game/adapters";
import unitTypesData from "../src/data/unitTypes.json";
import terrainData from "../src/data/terrain.json";

const testUnitTypes = unitTypesData as UnitTypeDictionary;
const testTerrain = terrainData as TerrainDictionary;

function createEmptySide(): EngineScenarioSide {
  return {
    hq: { q: 0, r: 0 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: []
  };
}

function createTestScenario(): EngineScenarioData {
  const tileKey = "plain";
  const row: Array<{ tile: string }> = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
  return {
    name: "Test Operation",
    size: { cols: 3, rows: 3 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "rural",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row],
    objectives: [{ hex: { q: 0, r: 0 }, owner: "Player", vp: 1 }],
    turnLimit: 10,
    sides: {
      Player: createEmptySide(),
      Bot: createEmptySide()
    }
  };
}

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const forest: TerrainDefinition = {
  moveCost: { leg: 2, wheel: 3, track: 2, air: 1 },
  defense: 2,
  accMod: -10,
  blocksLOS: true
};

const infantry: UnitTypeDefinition = {
  class: "infantry",
  movement: 3,
  moveType: "leg",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 2,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 10,
  softAttack: 25,
  ap: 2,
  accuracyBase: 60,
  traits: ["zoc"],
  cost: 100
};

function makeUnitState(): UnitCombatState {
  return {
    unit: infantry,
    strength: 10,
    experience: 0,
    general: { accBonus: 0, dmgBonus: 0 }
  };
}

function makeContexts(attackerHex: Axial, defenderHex: Axial): { attackerCtx: AttackerContext; defenderCtx: DefenderContext } {
  return {
    attackerCtx: { hex: attackerHex },
    defenderCtx: { terrain: plains, class: "infantry", facing: "N", hex: defenderHex }
  };
}

registerTest("ACCURACY_RANGE_DROP", async ({ Given, When, Then }) => {
  let nearAccuracy = 0;
  let farAccuracy = 0;

  await Given("an infantry unit firing across open plains", async () => {
    const attacker = makeUnitState();
    const defender = makeUnitState();
    const near = makeContexts({ q: 0, r: 0 }, { q: 0, r: 1 });
    const far = makeContexts({ q: 0, r: 0 }, { q: 0, r: 3 });

    const baseRequest: Omit<AttackRequest, "attacker" | "defender" | "attackerCtx" | "defenderCtx" | "targetFacing" | "isSoftTarget"> = {} as never;

    nearAccuracy = calculateAccuracy({
      attacker,
      defender,
      attackerCtx: near.attackerCtx,
      defenderCtx: near.defenderCtx,
      targetFacing: "S",
      isSoftTarget: true,
      ...baseRequest
    }).final;

    farAccuracy = calculateAccuracy({
      attacker,
      defender,
      attackerCtx: far.attackerCtx,
      defenderCtx: far.defenderCtx,
      targetFacing: "S",
      isSoftTarget: true,
      ...baseRequest
    }).final;
  });

  await When("the shot distance grows from 1 to 3 hexes", async () => {
    // No extra work; values captured above.
  });

  await Then("accuracy drops exactly 10 points", async () => {
    if (Math.round(nearAccuracy - farAccuracy) !== 10) {
      throw new Error(`Expected 10 point drop, saw ${nearAccuracy - farAccuracy}`);
    }
  });
});

const terrainDictionary = terrainDataJson as TerrainDictionary;
const unitTypesDictionary = unitTypesJson as UnitTypeDictionary;

const smokeScenario: EngineScenarioData = {
  name: "Persistence Smoke",
  size: { cols: 1, rows: 1 },
  tilePalette: {
    PLAINS: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
  },
  tiles: [[{ tile: "PLAINS" }]],
  objectives: [],
  turnLimit: 1,
  sides: {
    Player: {
      hq: { q: 0, r: 0 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: []
    },
    Bot: {
      hq: { q: 0, r: 0 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: []
    }
  }
};

function cloneSide(side: EngineScenarioSide): EngineScenarioSide {
  return JSON.parse(JSON.stringify(side)) as EngineScenarioSide;
}

function buildSmokeConfig(): GameEngineConfig {
  return {
    scenario: smokeScenario,
    unitTypes: unitTypesDictionary,
    terrain: terrainDictionary,
    playerSide: cloneSide(smokeScenario.sides.Player),
    botSide: cloneSide(smokeScenario.sides.Bot)
  };
}

registerTest("ENGINE_SERIALIZATION_ROUND_TRIP", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let restored: GameEngine;
  let snapshot: ReturnType<GameEngine["serialize"]>;

  await Given("a fresh engine instance", async () => {
    engine = new GameEngine(buildSmokeConfig());
    engine.beginDeployment();
  });

  await When("the battle state is serialized and restored", async () => {
    snapshot = engine.serialize();
    restored = GameEngine.fromSerialized(buildSmokeConfig(), snapshot);
  });

  await Then("turn metadata survives the round trip", async () => {
    const originalSummary = engine.getTurnSummary();
    const restoredSummary = restored.getTurnSummary();
    if (restoredSummary.phase !== originalSummary.phase || restoredSummary.turnNumber !== originalSummary.turnNumber) {
      throw new Error("Serialized battle state round-trip lost turn metadata.");
    }
  });
});

registerTest("DEPLOYMENT_BUILD_ENGINE_PLACEMENTS", async ({ Given, When, Then }) => {
  const placements = [
    { hex: { q: 1, r: 0 }, unitKey: "infantryBattalion" },
    { hex: { q: 2, r: 0 }, unitKey: "armoredCompany" }
  ];
  let result: ScenarioUnit[] = [];
  let failure: Error | null = null;

  await Given("valid deployment placements", async () => {
    result = buildScenarioUnitsFromAllocation(placements, deploymentTemplates, testUnitTypes);
  });

  await When("a placement references an unknown template", async () => {
    try {
      buildScenarioUnitsFromAllocation([
        { hex: { q: 0, r: 0 }, unitKey: "nonexistent" }
      ], deploymentTemplates, testUnitTypes);
    } catch (error) {
      failure = error as Error;
    }
  });

  await Then("known templates convert cleanly and bad templates throw", async () => {
    if (result.length !== 2) {
      throw new Error(`Expected 2 units, saw ${result.length}`);
    }
    const [infantryUnit, armorUnit] = result;
    if (infantryUnit.type !== "Infantry_42" || armorUnit.type !== "Panzer_IV") {
      throw new Error(`Unexpected unit types: ${infantryUnit.type}, ${armorUnit.type}`);
    }
    if (!failure || !failure.message.includes("No deployment template")) {
      throw new Error("Expected failure when template missing.");
    }
  });
});

registerTest("ENGINE_INITIALIZE_FROM_ALLOCATIONS_RESETS_RESERVES", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  await Given("an engine seeded with allocations", async () => {
    engine = new GameEngine({
      scenario: createTestScenario(),
      unitTypes: testUnitTypes,
      terrain: testTerrain,
      playerSide: createEmptySide(),
      botSide: createEmptySide()
    });
    const units = buildScenarioUnitsFromAllocation(
      [{ hex: { q: 0, r: 0 }, unitKey: "infantryBattalion" }],
      deploymentTemplates,
      testUnitTypes
    );
    engine.initializeFromAllocations(units);
  });

  await When("deployment begins", async () => {
    engine.beginDeployment();
  });

  await Then("reserves match the allocation count and placements cleared", async () => {
    if (engine.getReserveSnapshot().length !== 1) {
      throw new Error(`Expected 1 reserve after initialization, saw ${engine.getReserveSnapshot().length}`);
    }
    if (engine.getPlayerPlacementsSnapshot().length !== 0) {
      throw new Error("Expected placements cleared at deployment start.");
    }
  });
});

registerTest("ENGINE_END_TURN_REQUIRES_BASE_CAMP", async ({ Given, When, Then }) => {
  const engine = new GameEngine({
    scenario: createTestScenario(),
    unitTypes: testUnitTypes,
    terrain: testTerrain,
    playerSide: createEmptySide(),
    botSide: createEmptySide()
  });
  const units = buildScenarioUnitsFromAllocation(
    [{ hex: { q: 0, r: 0 }, unitKey: "infantryBattalion" }],
    deploymentTemplates,
    testUnitTypes
  );
  engine.initializeFromAllocations(units);
  engine.deployUnit({ q: 0, r: 0 }, 0);
  let reportDuringDeployment: ReturnType<GameEngine["endTurn"]> = null;
  let reportAfterStart: ReturnType<GameEngine["endTurn"]> = null;
  let subsequentReport: ReturnType<GameEngine["endTurn"]> = null;

  await Given("deployment without base camp", async () => {
    // No base camp assignment yet.
  });

  await When("finalizing deployment", async () => {
    reportDuringDeployment = engine.endTurn();
    try {
      engine.finalizeDeployment();
      throw new Error("Expected finalizeDeployment to require base camp.");
    } catch (error) {
      if (!(error as Error).message.includes("base camp")) {
        throw error;
      }
    }
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    reportAfterStart = engine.endTurn();
    subsequentReport = engine.endTurn();
  });

  await Then("end turn returns null during deployment and supply report after start", async () => {
    if (reportDuringDeployment !== null) {
      throw new Error("Expected null report during deployment phase.");
    }
    if (!reportAfterStart || reportAfterStart.faction !== "Player") {
      throw new Error("Expected Player faction to receive initial supply report after deployment.");
    }
    if (!subsequentReport || subsequentReport.faction !== "Bot") {
      throw new Error("Expected Bot faction to follow in the turn sequence.");
    }
  });
});

registerTest("LOS_FOREST_BLOCKS", async ({ Given, When, Then }) => {
  const lister: Lister = {
    terrainAt(hex) {
      if (hex.q === 0 && hex.r === 1) {
        return forest;
      }
      return plains;
    }
  };

  let blocked = false;
  let airborne = false;

  await Given("a forest tile between two ground units", async () => {
    blocked = !losClear({ q: 0, r: 0 }, { q: 0, r: 2 }, false, lister);
  });

  await When("the attacker is an aircraft", async () => {
    airborne = losClear({ q: 0, r: 0 }, { q: 0, r: 2 }, true, lister);
  });

  await Then("ground units are blocked but aircraft have clear sight", async () => {
    if (!blocked || !airborne) {
      throw new Error(`Expected ground LOS blocked (got ${blocked}) and air LOS clear (got ${airborne}).`);
    }
  });
});

registerTest("SUPPLY_CUT_TICK", async ({ Given, When, Then }) => {
  const supplyUnits: SupplyUnitState[] = [
    { hex: { q: 2, r: 0 }, ammo: 3, fuel: 3, entrench: 2, strength: 8 }
  ];

  const barrenMap: SupplyNetwork = {
    sources: [{ q: 0, r: 0 }],
    map: {
      terrainAt(hex) {
        if (hex.q === 1 && hex.r === 0) {
          return forest;
        }
        return plains;
      },
      isRoad() {
        return false;
      },
      isPassable() {
        return true;
      }
    }
  };

  await Given("a unit beyond road range and offroad budget", async () => {
    // NOTE: Distance penalty system replaced with range-based accuracy tables
    // This test is obsolete with the new system
  });

  await When("a supply tick processes", async () => {
    supplyTick(supplyUnits, barrenMap);
  });

  await Then("ammo and fuel drop by one, entrenchment drops by one", async () => {
    const [unit] = supplyUnits;
    if (unit.ammo !== 2 || unit.fuel !== 2 || unit.entrench !== 1) {
      throw new Error(`Unexpected supply state: ammo=${unit.ammo}, fuel=${unit.fuel}, entrench=${unit.entrench}`);
    }
  });
});
