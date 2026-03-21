import { registerTest } from "./harness.js";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import type {
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDefinition,
  UnitTypeDictionary
} from "../src/core/types";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

const vehicleDef: UnitTypeDefinition = {
  class: "vehicle",
  movement: 3,
  moveType: "wheel",
  vision: 3,
  ammo: 10,
  fuel: 10,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 2, side: 1, top: 1 },
  hardAttack: 6,
  softAttack: 5,
  ap: 3,
  accuracyBase: 60,
  traits: [],
  cost: 100
};

const infantryDef: UnitTypeDefinition = {
  class: "infantry",
  movement: 2,
  moveType: "leg",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 3,
  armor: { front: 0, side: 0, top: 0 },
  hardAttack: 2,
  softAttack: 4,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 60
};

const unitTypes: UnitTypeDictionary = {
  TestVehicle: vehicleDef,
  EnemyInfantry: infantryDef
} as unknown as UnitTypeDictionary;

function side(hq = { q: 0, r: 0 }): ScenarioSide {
  return {
    hq,
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: []
  };
}

function scenario(): ScenarioData {
  const tileKey = "plains";
  const row = [
    { tile: tileKey },
    { tile: tileKey },
    { tile: tileKey },
    { tile: tileKey }
  ];
  return {
    name: "Ground Logistics Enforcement",
    size: { cols: 4, rows: 4 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row, row],
    objectives: [],
    turnLimit: 5,
    sides: {
      Player: side({ q: 0, r: 0 }),
      Bot: side({ q: 3, r: 3 })
    }
  } as unknown as ScenarioData;
}

function createEngine(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[] = []): GameEngine {
  const preDeployedPlayers = playerUnits.map((unit) => ({ ...unit, preDeployed: true }));
  const cfg: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: { ...side({ q: 0, r: 0 }), units: preDeployedPlayers },
    botSide: { ...side({ q: 3, r: 3 }), units: botUnits }
  };
  const engine = new GameEngine(cfg);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

registerTest("GROUND_UNITS_STOP_ATTACKING_OR_MOVING_WITHOUT_CARRIED_STOCK", async ({ Given, Then }) => {
  let engine: GameEngine;

  await Given("a vehicle with no onboard ammo or fuel and an adjacent target", async () => {
    const playerUnit: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const enemyUnit: ScenarioUnit = {
      type: "EnemyInfantry" as ScenarioUnit["type"],
      hex: { q: 1, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 4,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([playerUnit], [enemyUnit]);
  });

  await Then("the unit cannot advertise or execute those actions", async () => {
    const attackable = engine.getAttackableTargets({ q: 0, r: 0 });
    if (attackable.length !== 0) {
      throw new Error(`Expected zero attackable targets while out of ammo, saw ${attackable.length}.`);
    }

    const reachable = engine.getReachableHexes({ q: 0, r: 0 });
    if (reachable.length !== 0) {
      throw new Error(`Expected zero reachable hexes while out of fuel, saw ${reachable.length}.`);
    }

    let attackError = "";
    try {
      engine.attackUnit({ q: 0, r: 0 }, { q: 1, r: 0 });
    } catch (error) {
      attackError = error instanceof Error ? error.message : String(error);
    }
    if (!attackError.includes("ammunition")) {
      throw new Error(`Expected an ammunition error when attacking dry, received '${attackError || "no error"}'.`);
    }

    let moveError = "";
    try {
      engine.moveUnit({ q: 0, r: 0 }, { q: 0, r: 1 });
    } catch (error) {
      moveError = error instanceof Error ? error.message : String(error);
    }
    if (!moveError.includes("fuel")) {
      throw new Error(`Expected a fuel error when moving dry, received '${moveError || "no error"}'.`);
    }
  });
});

registerTest("CONNECTED_UNITS_PULL_DEPOT_RESUPPLY_AND_LOGISTICS_ASSIGN_PRIMARY_SOURCES", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let supplySnapshot: ReturnType<GameEngine["getSupplySnapshot"]> | null = null;
  let logisticsSnapshot: ReturnType<GameEngine["getLogisticsSnapshot"]> | null = null;

  await Given("a connected logistics network with depot reserves available", async () => {
    const depletedVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const loadedVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 1 },
      strength: 10,
      experience: 0,
      ammo: 10,
      fuel: 10,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([depletedVehicle, loadedVehicle]);
  });

  await When("the turn advances and logistics refresh", async () => {
    engine.endTurn();
    supplySnapshot = engine.getSupplySnapshot("Player");
    logisticsSnapshot = engine.getLogisticsSnapshot();
  });

  await Then("the connected unit is topped up from depot stock without double-counting sources", async () => {
    if (!supplySnapshot || !logisticsSnapshot) {
      throw new Error("Expected supply and logistics snapshots after ending the turn.");
    }

    const refreshedUnit = engine.getPlayerPlacementsSnapshot().find((unit) => unit.hex.q === 0 && unit.hex.r === 0);
    if (!refreshedUnit) {
      throw new Error("Expected the depleted vehicle to remain on the map.");
    }
    if (refreshedUnit.ammo < 2 || refreshedUnit.fuel < 2) {
      throw new Error(`Expected connected resupply to top the unit back up, saw ammo=${refreshedUnit.ammo}, fuel=${refreshedUnit.fuel}.`);
    }

    const resupplyEntry = supplySnapshot.ledger.find((entry) => entry.reason.includes("frontline resupply"));
    if (!resupplyEntry) {
      throw new Error("Expected the supply ledger to record a frontline resupply transfer.");
    }

    const summedSourceAssignments = logisticsSnapshot.supplySources.reduce((sum, source) => sum + source.connectedUnits, 0);
    if (summedSourceAssignments !== logisticsSnapshot.connectedUnits) {
      throw new Error(`Expected logistics sources to assign primary routes once each, saw sources=${summedSourceAssignments} vs connected=${logisticsSnapshot.connectedUnits}.`);
    }
  });
});
