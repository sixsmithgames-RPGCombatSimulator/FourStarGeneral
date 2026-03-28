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

const road: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 0.5, track: 0.5, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;
const routingTerrain: TerrainDictionary = { plains, road } as unknown as TerrainDictionary;

const vehicleDef: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "vehicle", weight: "medium", role: "support", signature: "medium" },
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

const supplyTruckDef: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "vehicle", weight: "medium", role: "support", signature: "medium" },
  movement: 2,
  moveType: "wheel",
  vision: 2,
  ammo: 0,
  fuel: 12,
  rangeMin: 0,
  rangeMax: 0,
  initiative: 1,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 0,
  softAttack: 0,
  ap: 0,
  accuracyBase: 0,
  traits: [],
  cost: 80
};

const infantryDef: UnitTypeDefinition = {
  class: "infantry",
  combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
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
  Supply_Truck: supplyTruckDef,
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

function routingScenario(): ScenarioData {
  return {
    name: "Convoy Routing Regression",
    size: { cols: 3, rows: 3 },
    tilePalette: {
      P: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      },
      R: {
        terrain: "road",
        terrainType: "rural",
        density: "sparse",
        features: [],
        recon: "intel"
      }
    },
    tiles: [
      [{ tile: "P" }, { tile: "R" }, { tile: "P" }],
      [{ tile: "R" }, { tile: "R" }, { tile: "P" }],
      [{ tile: "P" }, { tile: "P" }, { tile: "P" }]
    ],
    objectives: [],
    turnLimit: 3,
    sides: {
      Player: side({ q: 0, r: 0 }),
      Bot: side({ q: 2, r: 2 })
    }
  } as unknown as ScenarioData;
}

function createRoutingEngine(): GameEngine {
  const cfg: GameEngineConfig = {
    scenario: routingScenario(),
    unitTypes,
    terrain: routingTerrain,
    playerSide: side({ q: 0, r: 0 }),
    botSide: side({ q: 2, r: 2 })
  };
  const engine = new GameEngine(cfg);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

function findPlayerUnit(engine: GameEngine, hex: { q: number; r: number }): ScenarioUnit {
  const unit = engine.getPlayerPlacementsSnapshot().find((candidate) => candidate.hex.q === hex.q && candidate.hex.r === hex.r);
  if (!unit) {
    throw new Error(`Expected player unit at ${hex.q},${hex.r}.`);
  }
  return unit;
}

function createDepotSeeder(hex = { q: 3, r: 0 }): ScenarioUnit {
  return {
    type: "TestVehicle" as ScenarioUnit["type"],
    hex,
    strength: 10,
    experience: 0,
    ammo: 10,
    fuel: 10,
    entrench: 0,
    facing: "N"
  };
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

registerTest("ONLY_BASE_ADJACENT_UNITS_RECEIVE_DIRECT_DEPOT_ISSUES", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let logisticsSnapshot: ReturnType<GameEngine["getLogisticsSnapshot"]> | null = null;

  await Given("one battalion near base and one forward battalion with no convoy support", async () => {
    const nearBaseVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 1 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const forwardVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 2, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([nearBaseVehicle, forwardVehicle, createDepotSeeder()]);
  });

  await When("the turn advances and logistics refresh", async () => {
    engine.endTurn();
    logisticsSnapshot = engine.getLogisticsSnapshot();
  });

  await Then("only the battalion adjacent to base is refilled directly from depot stock", async () => {
    if (!logisticsSnapshot) {
      throw new Error("Expected a logistics snapshot after ending the turn.");
    }

    const nearBaseRefreshed = findPlayerUnit(engine, { q: 0, r: 1 });
    if (nearBaseRefreshed.ammo <= 0 || nearBaseRefreshed.fuel <= 0) {
      throw new Error(`Expected the base-adjacent battalion to be reissued stock, saw ammo=${nearBaseRefreshed.ammo}, fuel=${nearBaseRefreshed.fuel}.`);
    }

    const forwardRefreshed = findPlayerUnit(engine, { q: 2, r: 0 });
    if (forwardRefreshed.ammo !== 0 || forwardRefreshed.fuel !== 0) {
      throw new Error(`Expected the forward battalion to remain dry without a convoy, saw ammo=${forwardRefreshed.ammo}, fuel=${forwardRefreshed.fuel}.`);
    }

    const queueEntry = logisticsSnapshot.priorityTargets.find((entry) => entry.hex === "2,0");
    if (!queueEntry) {
      throw new Error("Expected the forward battalion to remain in the logistics queue.");
    }
    if (queueEntry.status !== "queued") {
      throw new Error(`Expected the forward battalion to be queued for convoy service, saw '${queueEntry.status}'.`);
    }
  });
});

registerTest("CONNECTED_UNITS_DO_NOT_LOSE_ONBOARD_AMMO_WHEN_DEPOT_STOCK_IS_EMPTY", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let ammoBefore = 0;

  await Given("a connected battalion with onboard ammo but an empty depot", async () => {
    const playerUnit: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 1 },
      strength: 10,
      experience: 0,
      ammo: 7,
      fuel: 10,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([playerUnit]);
    ammoBefore = findPlayerUnit(engine, { q: 0, r: 1 }).ammo;

    const unsafeEngine = engine as unknown as {
      supplyStateByFaction: {
        Player: {
          inventory: {
            ammo: { current: number };
            fuel: { current: number };
          };
        };
      };
    };
    unsafeEngine.supplyStateByFaction.Player.inventory.ammo.current = 0;
    unsafeEngine.supplyStateByFaction.Player.inventory.fuel.current = 100;
  });

  await When("the player supply tick runs without depot ammunition", async () => {
    const unsafeEngine = engine as unknown as {
      applySupplyTickFor: (faction: "Player") => unknown;
    };
    unsafeEngine.applySupplyTickFor("Player");
  });

  await Then("the battalion keeps its carried ammo until it actually fires", async () => {
    const afterTick = findPlayerUnit(engine, { q: 0, r: 1 });
    if (afterTick.ammo !== ammoBefore) {
      throw new Error(`Expected connected upkeep to preserve onboard ammo, saw ${ammoBefore} drop to ${afterTick.ammo}.`);
    }
  });
});

registerTest("INITIAL_PLAYER_DEPOT_STOCK_AUGMENTS_LOGISTICS_SNAPSHOT", async ({ Given, Then }) => {
  let engine: GameEngine;

  await Given("a battle initialized with precombat depot stock bonuses", async () => {
    const playerUnit: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 1 },
      strength: 10,
      experience: 0,
      ammo: 3,
      fuel: 4,
      entrench: 0,
      facing: "N"
    };
    const cfg: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: { ...side({ q: 0, r: 0 }), units: [{ ...playerUnit, preDeployed: true }] },
      botSide: side({ q: 3, r: 3 }),
      initialPlayerDepotStock: { ammo: 5, fuel: 7, rations: 0, parts: 0 }
    };
    engine = new GameEngine(cfg);
    engine.beginDeployment();
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();
  });

  await Then("the logistics snapshot includes the precombat ammo and fuel package", async () => {
    const logistics = engine.getLogisticsSnapshot();
    if (logistics.depotStock.ammo !== 8) {
      throw new Error(`Expected depot ammo to include carried stock plus precombat package, saw ${logistics.depotStock.ammo}.`);
    }
    if (logistics.depotStock.fuel !== 11) {
      throw new Error(`Expected depot fuel to include carried stock plus precombat package, saw ${logistics.depotStock.fuel}.`);
    }
  });
});

registerTest("SUPPLY_CONVOYS_DELIVER_TO_FORWARD_BATTALIONS", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let logisticsSnapshot: ReturnType<GameEngine["getLogisticsSnapshot"]> | null = null;

  await Given("a forward battalion with a convoy staged between it and the depot", async () => {
    const convoy: ScenarioUnit = {
      type: "Supply_Truck" as ScenarioUnit["type"],
      hex: { q: 1, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 12,
      entrench: 0,
      facing: "N"
    };
    const forwardVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 2, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([convoy, forwardVehicle, createDepotSeeder()]);
  });

  await When("the turn advances", async () => {
    engine.endTurn();
    logisticsSnapshot = engine.getLogisticsSnapshot();
  });

  await Then("the convoy loads from depot and transfers stock to the forward battalion", async () => {
    if (!logisticsSnapshot) {
      throw new Error("Expected a logistics snapshot after convoy automation.");
    }

    const forwardVehicle = findPlayerUnit(engine, { q: 2, r: 0 });
    if (forwardVehicle.ammo <= 0 || forwardVehicle.fuel <= 0) {
      throw new Error(`Expected convoy delivery to refill the forward battalion, saw ammo=${forwardVehicle.ammo}, fuel=${forwardVehicle.fuel}.`);
    }

    if (logisticsSnapshot.convoyStatuses.length !== 1) {
      throw new Error(`Expected one convoy status entry, saw ${logisticsSnapshot.convoyStatuses.length}.`);
    }

    const convoyStatus = logisticsSnapshot.convoyStatuses[0];
    if (convoyStatus.status !== "delivering" && convoyStatus.status !== "loading") {
      throw new Error(`Expected the convoy to be in an active service state, saw '${convoyStatus.status}'.`);
    }
  });
});

registerTest("SUPPLY_PRIORITIES_DECIDE_WHICH_BATTALION_GETS_THE_NEXT_CONVOY", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let logisticsSnapshot: ReturnType<GameEngine["getLogisticsSnapshot"]> | null = null;

  await Given("one convoy and two forward battalions competing for service", async () => {
    const convoy: ScenarioUnit = {
      type: "Supply_Truck" as ScenarioUnit["type"],
      hex: { q: 1, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 12,
      entrench: 0,
      facing: "N"
    };
    const closerVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 2, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const fartherVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 2 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([convoy, closerVehicle, fartherVehicle, createDepotSeeder()]);
  });

  await When("the commander raises the farther battalion to critical priority before ending the turn", async () => {
    const closerUnit = findPlayerUnit(engine, { q: 2, r: 0 });
    const fartherUnit = findPlayerUnit(engine, { q: 0, r: 2 });

    if (!closerUnit.unitId || !fartherUnit.unitId) {
      throw new Error("Expected stable unit ids for logistics priority assignment.");
    }

    if (!engine.setSupplyPriority(closerUnit.unitId, "low")) {
      throw new Error("Expected the closer battalion priority update to succeed.");
    }
    if (!engine.setSupplyPriority(fartherUnit.unitId, "critical")) {
      throw new Error("Expected the farther battalion priority update to succeed.");
    }

    engine.endTurn();
    logisticsSnapshot = engine.getLogisticsSnapshot();
  });

  await Then("the single convoy is assigned to the higher-priority battalion first", async () => {
    if (!logisticsSnapshot) {
      throw new Error("Expected a logistics snapshot after applying convoy priorities.");
    }

    const closerEntry = logisticsSnapshot.priorityTargets.find((entry) => entry.hex === "2,0");
    const fartherEntry = logisticsSnapshot.priorityTargets.find((entry) => entry.hex === "0,2");
    if (!closerEntry || !fartherEntry) {
      throw new Error("Expected both battalions to remain visible in the logistics queue.");
    }

    if (fartherEntry.assignedConvoys !== 1) {
      throw new Error(`Expected the critical battalion to receive the convoy assignment, saw ${fartherEntry.assignedConvoys}.`);
    }
    if (closerEntry.assignedConvoys !== 0) {
      throw new Error(`Expected the low-priority battalion to wait, saw ${closerEntry.assignedConvoys} assigned convoys.`);
    }

    const assignedTotal = logisticsSnapshot.priorityTargets.reduce((sum, entry) => sum + entry.assignedConvoys, 0);
    if (assignedTotal !== 1) {
      throw new Error(`Expected one convoy to service one battalion at a time, saw ${assignedTotal} assignments.`);
    }
  });
});

registerTest("CONVOY_PATHFINDER_RETAINS_THE_CHEAPEST_ROUTE_BREADCRUMBS", async ({ Then }) => {
  const engine = createRoutingEngine();
  const planner = engine as unknown as {
    findCheapestPathToAny: (
      from: { q: number; r: number },
      destinations: readonly { q: number; r: number }[],
      moveType: string,
      occupied: ReadonlySet<string>
    ) => { path: Array<{ q: number; r: number }>; summary: { cost: number; steps: number } } | null;
  };

  const plan = planner.findCheapestPathToAny(
    { q: 0, r: 0 },
    [{ q: 2, r: 0 }],
    "wheel",
    new Set<string>()
  );

  if (!plan) {
    throw new Error("Expected a wheel route to the destination.");
  }

  const pathKeys = plan.path.map((hex) => `${hex.q},${hex.r}`).join(" -> ");
  if (pathKeys !== "0,0 -> 1,0 -> 2,0") {
    throw new Error(`Expected the planner to keep the cheapest direct road branch, received '${pathKeys}'.`);
  }

  if (Math.abs(plan.summary.cost - 1.5) > 1e-6 || plan.summary.steps !== 2) {
    throw new Error(`Expected the cheapest route summary to stay aligned with the chosen path, received ${JSON.stringify(plan.summary)}.`);
  }

  await Then("convoy routing keeps the best breadcrumb chain instead of drifting onto a worse branch", () => {});
});

registerTest("BOT_FACTIONS_AUTO_STAGE_CONVOYS_AND_RESTORE_STRANDED_MOBILITY_WHEN_SCENARIOS_OMIT_THEM", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot vehicle that needs supply but no authored convoy units", async () => {
    const playerScreen: ScenarioUnit = {
      type: "EnemyInfantry" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 4,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const botVehicle: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 1, r: 3 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([playerScreen], [botVehicle]);
  });

  await When("the turn advances through the bot supply phase", async () => {
    engine.endTurn();
  });

  await Then("the engine provisions a live bot convoy and uses it to restore the stranded vehicle's supply state", async () => {
    const botUnits = engine.botUnits;
    if (!botUnits.some((unit) => unit.type === "Supply_Truck")) {
      throw new Error("Expected the bot to receive an auto-provisioned supply convoy.");
    }

    const resuppliedVehicle = botUnits.find((unit) => unit.hex.q === 1 && unit.hex.r === 3);
    if (!resuppliedVehicle) {
      throw new Error("Expected the original bot vehicle to remain on the map.");
    }

    if (resuppliedVehicle.fuel <= 0) {
      throw new Error(`Expected the bot vehicle to receive convoy-delivered fuel, saw ammo=${resuppliedVehicle.ammo}, fuel=${resuppliedVehicle.fuel}.`);
    }
  });
});
