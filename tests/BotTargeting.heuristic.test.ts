import { axialKey, hexDistance, type Axial } from "../src/core/Hex";
import type {
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDefinition,
  UnitTypeDictionary
} from "../src/core/types";
import {
  planHeuristicBotTurn,
  type BotPlannerInput,
  type PlannerUnitSnapshot,
  type PlannedBotAction
} from "../src/game/bot/BotPlanner";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import { registerTest } from "./harness";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const woods: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 3,
  accMod: -1,
  blocksLOS: true
};

const roughWoods: TerrainDefinition = {
  moveCost: { leg: 2, wheel: 2, track: 2, air: 1 },
  defense: 3,
  accMod: -1,
  blocksLOS: true
};

const terrain: TerrainDictionary = { plains, woods, roughWoods } as unknown as TerrainDictionary;

const playerInfantryDef: UnitTypeDefinition = {
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
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 4,
  softAttack: 10,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 70
};

const playerTankDef: UnitTypeDefinition = {
  class: "tank",
  combat: { category: "tank", weight: "medium", role: "normal", signature: "large" },
  movement: 3,
  moveType: "track",
  vision: 3,
  ammo: 6,
  fuel: 55,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 10, side: 8, top: 6 },
  hardAttack: 20,
  softAttack: 12,
  ap: 10,
  accuracyBase: 60,
  traits: [],
  cost: 220
};

const playerArtilleryDef: UnitTypeDefinition = {
  class: "artillery",
  combat: { category: "artillery", weight: "medium", role: "support", signature: "large" },
  movement: 1,
  moveType: "wheel",
  vision: 2,
  ammo: 5,
  fuel: 0,
  rangeMin: 2,
  rangeMax: 4,
  initiative: 2,
  armor: { front: 2, side: 2, top: 1 },
  hardAttack: 8,
  softAttack: 24,
  ap: 3,
  accuracyBase: 52,
  traits: ["indirect"],
  cost: 180
};

const antiTankGunDef: UnitTypeDefinition = {
  class: "specialist",
  combat: { category: "specialist", weight: "medium", role: "antiTank", signature: "medium" },
  movement: 1,
  moveType: "wheel",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 3,
  armor: { front: 2, side: 1, top: 1 },
  hardAttack: 24,
  softAttack: 6,
  ap: 12,
  accuracyBase: 58,
  traits: [],
  cost: 120
};

const reconBikeDef: UnitTypeDefinition = {
  class: "recon",
  combat: { category: "recon", weight: "light", role: "normal", signature: "small" },
  movement: 4,
  moveType: "wheel",
  vision: 4,
  ammo: 4,
  fuel: 50,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 5,
  armor: { front: 2, side: 1, top: 1 },
  hardAttack: 4,
  softAttack: 8,
  ap: 1,
  accuracyBase: 58,
  traits: [],
  cost: 95
};

const bomberDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "medium", role: "antiInfantry", signature: "large" },
  movement: 6,
  moveType: "air",
  vision: 4,
  ammo: 4,
  fuel: 60,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 1,
  armor: { front: 10, side: 10, top: 10 },
  hardAttack: 16,
  softAttack: 45,
  ap: 8,
  accuracyBase: 55,
  traits: ["indirect", "carpet"],
  cost: 380,
  airSupport: {
    roles: ["strike"],
    cruiseSpeedKph: 450,
    combatRadiusKm: 260,
    refitTurns: 2
  }
};

const groundAttackDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "antiVehicle", signature: "medium" },
  movement: 8,
  moveType: "air",
  vision: 4,
  ammo: 5,
  fuel: 55,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 5,
  armor: { front: 6, side: 5, top: 4 },
  hardAttack: 20,
  softAttack: 35,
  ap: 5,
  accuracyBase: 60,
  traits: ["carpet"],
  cost: 380,
  airSupport: {
    roles: ["strike"],
    cruiseSpeedKph: 420,
    combatRadiusKm: 240,
    refitTurns: 2
  }
};

const supplyTruckDef: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "vehicle", weight: "medium", role: "support", signature: "large" },
  movement: 2,
  moveType: "wheel",
  vision: 2,
  ammo: 0,
  fuel: 70,
  rangeMin: 0,
  rangeMax: 0,
  initiative: 1,
  armor: { front: 2, side: 1, top: 1 },
  hardAttack: 1,
  softAttack: 1,
  ap: 0,
  accuracyBase: 0,
  traits: [],
  cost: 50
};

const strikeUnitTypes: UnitTypeDictionary = {
  TestInfantry: playerInfantryDef,
  TestTank: playerTankDef,
  TestArtillery: playerArtilleryDef,
  TestBomber: bomberDef,
  TestGroundAttack: groundAttackDef,
  Supply_Truck: supplyTruckDef
} as unknown as UnitTypeDictionary;

function createPlannerSnapshot(
  type: string,
  definition: UnitTypeDefinition,
  hex: Axial
): PlannerUnitSnapshot {
  return {
    unit: {
      type: type as ScenarioUnit["type"],
      hex: { ...hex },
      strength: 100,
      experience: 0,
      ammo: definition.ammo,
      fuel: definition.fuel,
      entrench: 0,
      facing: "NW"
    },
    definition
  };
}

function createPlannedAction(
  type: string,
  definition: UnitTypeDefinition,
  origin: Axial,
  destination: Axial,
  path: readonly Axial[],
  score: number
): PlannedBotAction {
  return {
    unit: createPlannerSnapshot(type, definition, origin),
    unitKey: axialKey(origin),
    origin: { ...origin },
    destination: { ...destination },
    path: path.map((hex) => ({ ...hex })),
    attackTarget: null,
    expectedDamage: 0,
    expectedRetaliation: 0,
    score,
    rationale: "Synthetic ordering regression"
  };
}

function side(hq = { q: 0, r: 0 }, units: ScenarioUnit[] = []): ScenarioSide {
  return {
    hq,
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units
  };
}

function createScenario(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[]): ScenarioData {
  const tileKey = "plains";
  const row = Array.from({ length: 8 }, () => ({ tile: tileKey }));
  return {
    name: "Bot Targeting Heuristic Test",
    size: { cols: 8, rows: 8 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row, row, row, row, row, row],
    objectives: [],
    turnLimit: 6,
    sides: {
      Player: side({ q: 0, r: 0 }, playerUnits),
      Bot: side({ q: 7, r: 0 }, botUnits)
    }
  } as unknown as ScenarioData;
}

function createHeuristicEngine(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[]): GameEngine {
  const preDeployedPlayers = playerUnits.map((unit) => ({ ...unit, preDeployed: true }));
  const cfg: GameEngineConfig = {
    scenario: createScenario(preDeployedPlayers, botUnits),
    unitTypes: strikeUnitTypes,
    terrain,
    playerSide: side({ q: 0, r: 0 }, preDeployedPlayers),
    botSide: side({ q: 7, r: 0 }, botUnits),
    botStrategyMode: "Heuristic"
  };
  const engine = new GameEngine(cfg);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

registerTest("BOT_PLANNER_STAGES_FOR_ARMORED_TARGETS_WITH_A_REAL_FIRING_LANE", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("an anti-tank gun with a closer infantry contact but only a viable lane toward armor", async () => {
    const botUnit = createPlannerSnapshot("BotATGun", antiTankGunDef, { q: 0, r: 0 });
    const playerInfantry = createPlannerSnapshot("EnemyInfantry", playerInfantryDef, { q: 0, r: 3 });
    const playerTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 4, r: 0 });
    const infantryKey = axialKey(playerInfantry.unit.hex);

    const input: BotPlannerInput = {
      botUnits: [botUnit],
      playerUnits: [playerInfantry, playerTank],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botUnit.unit.hex), "bot"],
        [axialKey(playerInfantry.unit.hex), "player"],
        [axialKey(playerTank.unit.hex), "player"]
      ]),
      map: {
        inBounds: () => true,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: (_attackerHex, targetHex) => axialKey(targetHex) !== infantryKey,
      movementAllowance: () => 1,
      attackEstimator: (attacker, attackerHex, defender) => {
        const distance = hexDistance(attackerHex, defender.unit.hex);
        const inRange = distance >= (attacker.definition.rangeMin ?? 1) && distance <= (attacker.definition.rangeMax ?? 1);
        if (!inRange) {
          return null;
        }
        if (axialKey(defender.unit.hex) === infantryKey) {
          return null;
        }
        return {
          expectedDamage: defender.definition.class === "tank" ? 18 : 6,
          expectedRetaliation: defender.definition.class === "tank" ? 3 : 8
        };
      },
      difficulty: "Normal"
    };

    const [plan] = planHeuristicBotTurn(input);
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner scores setup moves instead of simple nearest-enemy pressure", async () => {
    // Planner result captured during Given to keep the test focused on the pure scoring output.
  });

  await Then("the unit stages east toward the armored target instead of north toward the blocked infantry", async () => {
    if (plannedDestination !== "1,0") {
      throw new Error(`Expected the anti-tank gun to stage toward armor at 1,0, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});

registerTest("BOT_PLANNER_HOLDS_A_GOOD_FIRING_LANE_INSTEAD_OF_SHUFFLING_SIDEWAYS", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("an anti-tank gun already covering an armored target from a useful staging hex", async () => {
    const botUnit = createPlannerSnapshot("BotATGun", antiTankGunDef, { q: 0, r: 0 });
    const blocker = createPlannerSnapshot("BotBlocker", playerInfantryDef, { q: 1, r: 0 });
    const playerTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 2, r: 0 });

    const input: BotPlannerInput = {
      botUnits: [botUnit, blocker],
      playerUnits: [playerTank],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botUnit.unit.hex), "bot"],
        [axialKey(blocker.unit.hex), "bot"],
        [axialKey(playerTank.unit.hex), "player"]
      ]),
      map: {
        inBounds: () => true,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: () => true,
      movementAllowance: () => 1,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,0");
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner compares lateral movement against simply holding the lane", async () => {
    // Planner result captured during Given to keep the test focused on the chosen destination.
  });

  await Then("the unit should stay put instead of sidestepping without improving range or LOS", async () => {
    if (plannedDestination !== "0,0") {
      throw new Error(`Expected the anti-tank gun to hold at 0,0, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});

registerTest("BOT_PLANNER_PATHS_THROUGH_FRIENDLY_HEXES_TO_JOIN_THE_ASSAULT_LINE", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("a rear tank queued behind a friendly screen in a one-hex-wide lane toward enemy armor", async () => {
    const rearTank = createPlannerSnapshot("RearTank", playerTankDef, { q: 0, r: 0 });
    const frontScreen = createPlannerSnapshot("FrontScreen", playerInfantryDef, { q: 1, r: 0 });
    const enemyTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 4, r: 0 });

    const input: BotPlannerInput = {
      botUnits: [rearTank, frontScreen],
      playerUnits: [enemyTank],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(rearTank.unit.hex), "bot"],
        [axialKey(frontScreen.unit.hex), "bot"],
        [axialKey(enemyTank.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.r === 0 && hex.q >= 0 && hex.q <= 4,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: () => true,
      movementAllowance: () => 2,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,0");
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner evaluates a follow-on move behind the lead element", async () => {
    // Planner result captured during Given to keep the test focused on the pathing output.
  });

  await Then("the rear tank should plan through the friendly screen instead of stalling in place", async () => {
    if (plannedDestination !== "2,0") {
      throw new Error(`Expected the rear tank to form up at 2,0, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});

registerTest("BOT_EXECUTION_MOVES_LANE_CLEARING_UNITS_BEFORE_THEIR_FOLLOWERS", async ({ Given, When, Then }) => {
  let orderedOrigins: string[] = [];

  await Given("a rear tank plan that depends on a lead element clearing the lane first", async () => {
    const engine = createHeuristicEngine([], []);
    const rearTankPlan = createPlannedAction(
      "RearTank",
      playerTankDef,
      { q: 0, r: 0 },
      { q: 3, r: 0 },
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 }
      ],
      25
    );
    const leadTankPlan = createPlannedAction(
      "LeadTank",
      playerTankDef,
      { q: 1, r: 0 },
      { q: 2, r: -1 },
      [
        { q: 1, r: 0 },
        { q: 2, r: -1 }
      ],
      12
    );

    orderedOrigins = ((engine as any).prioritizeHeuristicPlansForExecution([
      rearTankPlan,
      leadTankPlan
    ]) as PlannedBotAction[]).map((plan) => axialKey(plan.origin));
  });

  await When("the executor reorders heuristic plans for movement", async () => {
    // Ordered results were captured during Given so the assertion stays focused on the sequencing.
  });

  await Then("the lane-clearing unit should execute before the rear unit that needs the vacated hex", async () => {
    if (orderedOrigins.join(" -> ") !== "1,0 -> 0,0") {
      throw new Error(`Expected lead unit at 1,0 to move before follower at 0,0, but saw ${orderedOrigins.join(" -> ") || "no order"}.`);
    }
  });
});

registerTest("BOT_PLANNER_PREFERS_A_MASKED_APPROACH_OVER_AN_EXPOSED_STRAIGHT_LUNGE", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("a tank can either close under woods cover or step into view of multiple defenders", async () => {
    const botTank = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 0 });
    const botInfantry = createPlannerSnapshot("BotInfantry", playerInfantryDef, { q: 1, r: 2 });
    const enemyTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 4, r: 0 });
    const enemyArtillery = createPlannerSnapshot("EnemyArtillery", playerArtilleryDef, { q: 4, r: 2 });
    const artilleryKey = axialKey(enemyArtillery.unit.hex);

    const input: BotPlannerInput = {
      botUnits: [botTank, botInfantry],
      playerUnits: [enemyTank, enemyArtillery],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botTank.unit.hex), "bot"],
        [axialKey(botInfantry.unit.hex), "bot"],
        [axialKey(enemyTank.unit.hex), "player"],
        [artilleryKey, "player"]
      ]),
      map: {
        inBounds: () => true,
        terrainAt: (hex) => axialKey(hex) === "1,1" ? woods : plains,
        movementCost: () => 1
      },
      losAllows: (attackerHex, targetHex) => {
        const attackerKey = axialKey(attackerHex);
        if (axialKey(targetHex) === artilleryKey && attackerKey === "1,1") {
          return false;
        }
        return true;
      },
      movementAllowance: () => 2,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,0");
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner scores staging hexes for the armored push", async () => {
    // Planner result captured during Given to keep the test focused on the chosen destination.
  });

  await Then("the tank should choose the masked woods approach instead of the fully exposed center hex", async () => {
    if (plannedDestination !== "1,1") {
      throw new Error(`Expected the tank to stage at 1,1, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});

registerTest("BOT_GROUND_ATTACK_STRIKES_ARMOR_OVER_CLOSER_INFANTRY", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot ground-attack aircraft with a nearby infantry unit and a farther armored target", async () => {
    const infantry: ScenarioUnit = {
      type: "TestInfantry" as ScenarioUnit["type"],
      hex: { q: 2, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    };
    const tank: ScenarioUnit = {
      type: "TestTank" as ScenarioUnit["type"],
      hex: { q: 4, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 55,
      entrench: 0,
      facing: "NW"
    };
    const attacker: ScenarioUnit = {
      type: "TestGroundAttack" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 5,
      fuel: 55,
      entrench: 0,
      facing: "NW"
    };
    engine = createHeuristicEngine([infantry, tank], [attacker]);
  });

  await When("the player ends the turn and the bot schedules its strike mission", async () => {
    engine.endTurn();
  });

  await Then("the strike report should show the armored unit as the chosen target", async () => {
    const strikeReport = engine.getAirMissionReports().find((entry) => entry.faction === "Bot" && entry.kind === "strike");
    if (!strikeReport?.targetHex) {
      throw new Error("Expected a bot strike report with a recorded target hex.");
    }
    if (axialKey(strikeReport.targetHex) !== "4,0") {
      throw new Error(`Expected ground-attack aircraft to target armor at 4,0, but it struck ${axialKey(strikeReport.targetHex)}.`);
    }
  });
});

registerTest("BOT_LEVEL_BOMBERS_STRIKE_ARTILLERY_OVER_CLOSER_INFANTRY", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot bomber with a nearby infantry unit and a farther artillery battery", async () => {
    const infantry: ScenarioUnit = {
      type: "TestInfantry" as ScenarioUnit["type"],
      hex: { q: 2, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    };
    const artillery: ScenarioUnit = {
      type: "TestArtillery" as ScenarioUnit["type"],
      hex: { q: 4, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 5,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    };
    const attacker: ScenarioUnit = {
      type: "TestBomber" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 4,
      fuel: 60,
      entrench: 0,
      facing: "NW"
    };
    engine = createHeuristicEngine([infantry, artillery], [attacker]);
  });

  await When("the bot executes its heuristic air tasking", async () => {
    engine.endTurn();
  });

  await Then("the strike report should show the artillery battery as the chosen target", async () => {
    const strikeReport = engine.getAirMissionReports().find((entry) => entry.faction === "Bot" && entry.kind === "strike");
    if (!strikeReport?.targetHex) {
      throw new Error("Expected a bot strike report with a recorded target hex.");
    }
    if (axialKey(strikeReport.targetHex) !== "4,0") {
      throw new Error(`Expected bomber strike to target artillery at 4,0, but it struck ${axialKey(strikeReport.targetHex)}.`);
    }
  });
});

registerTest("BOT_LEVEL_MULTIPLE_BOMBERS_QUEUE_MULTIPLE_STRIKES", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("two bot bombers and two valuable ground targets", async () => {
    const artillery: ScenarioUnit = {
      type: "TestArtillery" as ScenarioUnit["type"],
      hex: { q: 4, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 5,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    };
    const tank: ScenarioUnit = {
      type: "TestTank" as ScenarioUnit["type"],
      hex: { q: 4, r: 1 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 55,
      entrench: 0,
      facing: "NW"
    };
    const firstBomber: ScenarioUnit = {
      type: "TestBomber" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 4,
      fuel: 60,
      entrench: 0,
      facing: "NW"
    };
    const secondBomber: ScenarioUnit = {
      type: "TestBomber" as ScenarioUnit["type"],
      hex: { q: 0, r: 1 },
      strength: 100,
      experience: 0,
      ammo: 4,
      fuel: 60,
      entrench: 0,
      facing: "NW"
    };
    engine = createHeuristicEngine([artillery, tank], [firstBomber, secondBomber]);
  });

  await When("the bot runs its air-tasking pass for the turn", async () => {
    engine.endTurn();
  });

  await Then("both bombers should resolve strike missions against meaningful targets", async () => {
    const strikeReports = engine.getAirMissionReports().filter(
      (entry) => entry.faction === "Bot" && entry.kind === "strike" && entry.event === "resolved"
    );
    if (strikeReports.length !== 2) {
      throw new Error(`Expected 2 resolved bot strike reports, received ${strikeReports.length}.`);
    }

    const resolvedTargets = strikeReports
      .map((entry) => (entry.targetHex ? axialKey(entry.targetHex) : "<missing>"))
      .sort();
    const expectedTargets = ["4,0", "4,1"];
    if (resolvedTargets.length !== expectedTargets.length || resolvedTargets.some((target, index) => target !== expectedTargets[index])) {
      throw new Error(`Expected bombers to divide strikes across 4,0 and 4,1, but received ${resolvedTargets.join(", ")}.`);
    }
  });
});

registerTest("BOT_PLANNER_INFANTRY_MARCHES_THROUGH_COVER_TOWARD_HIGH_VALUE_GUNS", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("an infantry unit choosing between a covered approach and an exposed shortcut toward enemy guns", async () => {
    const botInfantry = createPlannerSnapshot("BotInfantry", playerInfantryDef, { q: 0, r: 1 });
    const supportInfantry = createPlannerSnapshot("SupportInfantry", playerInfantryDef, { q: 0, r: 2 });
    const enemyArtillery = createPlannerSnapshot("EnemyArtillery", playerArtilleryDef, { q: 4, r: 1 });
    const enemyInfantry = createPlannerSnapshot("EnemyInfantry", playerInfantryDef, { q: 3, r: 2 });
    const enemyInfantryKey = axialKey(enemyInfantry.unit.hex);

    const input: BotPlannerInput = {
      botUnits: [botInfantry, supportInfantry],
      playerUnits: [enemyArtillery, enemyInfantry],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botInfantry.unit.hex), "bot"],
        [axialKey(supportInfantry.unit.hex), "bot"],
        [axialKey(enemyArtillery.unit.hex), "player"],
        [enemyInfantryKey, "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 5 && hex.r >= 0 && hex.r <= 5,
        terrainAt: (hex) => axialKey(hex) === "1,1" ? woods : plains,
        movementCost: () => 1
      },
      losAllows: (attackerHex, targetHex) => {
        if (axialKey(attackerHex) === "1,1" && axialKey(targetHex) === enemyInfantryKey) {
          return false;
        }
        return true;
      },
      movementAllowance: () => 1,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,1");
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner weighs approach timing against exposure on the way in", async () => {
    // Planner result captured during Given to keep the test focused on the chosen destination.
  });

  await Then("the infantry should advance through the covered hex instead of drifting into the open", async () => {
    if (plannedDestination !== "1,1") {
      throw new Error(`Expected infantry to march through covered hex 1,1, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});

registerTest("BOT_PLANNER_INFANTRY_TAKES_SAFE_TEMPO_OVER_A_SLOW_ROUGH_SLOG", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("an infantry unit choosing between a fast plains lane and a slower rough-woods lane while the enemy is still several turns away", async () => {
    const botInfantry = createPlannerSnapshot("BotInfantry", playerInfantryDef, { q: 0, r: 1 });
    const supportInfantry = createPlannerSnapshot("SupportInfantry", playerInfantryDef, { q: 0, r: 2 });
    const enemyArtillery = createPlannerSnapshot("EnemyArtillery", playerArtilleryDef, { q: 6, r: 1 });
    const enemyInfantry = createPlannerSnapshot("EnemyInfantry", playerInfantryDef, { q: 7, r: 1 });

    const input: BotPlannerInput = {
      botUnits: [botInfantry, supportInfantry],
      playerUnits: [enemyArtillery, enemyInfantry],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botInfantry.unit.hex), "bot"],
        [axialKey(supportInfantry.unit.hex), "bot"],
        [axialKey(enemyArtillery.unit.hex), "player"],
        [axialKey(enemyInfantry.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 7 && hex.r >= 0 && hex.r <= 7,
        terrainAt: (hex) => axialKey(hex) === "1,2" ? roughWoods : plains,
        movementCost: (hex) => axialKey(hex) === "1,2" ? 2 : 1
      },
      losAllows: () => true,
      movementAllowance: () => 2,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,1");
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner compares immediate safety against march tempo", async () => {
    // Result captured during Given.
  });

  await Then("the infantry should use the faster safe lane instead of bogging down in slow terrain", async () => {
    if (plannedDestination !== "1,1") {
      throw new Error(`Expected infantry to pick the faster plains lane at 1,1, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});

registerTest("BOT_HEURISTIC_INFANTRY_CONSOLIDATES_IN_COVER_AND_DIGS_IN", async ({ Given, When, Then }) => {
  let plannedDestination = "";
  let plannedFieldAction = "";

  await Given("a bot infantry battalion already staged in woods near contact with friendly support", async () => {
    const infantryDef = structuredClone(playerInfantryDef);
    const tankDef = structuredClone(playerTankDef);
    const localWoods = structuredClone(woods);
    const localPlains = structuredClone(plains);
    const botInfantry = createPlannerSnapshot("BotInfantry", infantryDef, { q: 3, r: 3 });
    const supportInfantry = createPlannerSnapshot("SupportInfantry", infantryDef, { q: 3, r: 4 });
    const enemyTank = createPlannerSnapshot("EnemyTank", tankDef, { q: 9, r: 3 });
    const enemyInfantry = createPlannerSnapshot("EnemyInfantry", infantryDef, { q: 9, r: 4 });

    const input: BotPlannerInput = {
      botUnits: [botInfantry, supportInfantry],
      playerUnits: [enemyTank, enemyInfantry],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botInfantry.unit.hex), "bot"],
        [axialKey(supportInfantry.unit.hex), "bot"],
        [axialKey(enemyTank.unit.hex), "player"],
        [axialKey(enemyInfantry.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 10 && hex.r >= 0 && hex.r <= 10,
        terrainAt: (hex) => axialKey(hex) === "3,3" ? localWoods : localPlains,
        movementCost: () => 1
      },
      losAllows: (attackerHex, targetHex) => {
        const attackerKey = axialKey(attackerHex);
        if (attackerKey === "3,3" && axialKey(targetHex) === "9,4") {
          return false;
        }
        return true;
      },
      movementAllowance: () => 2,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "3,3");
    plannedDestination = plan ? axialKey(plan.destination) : "";
    plannedFieldAction = plan?.fieldAction ?? "";
  });

  await When("the planner evaluates whether the infantry should push again or consolidate the covered posture", async () => {
    // Result captured during Given.
  });

  await Then("the staged infantry should hold the covered hex and choose the dig-in field action", async () => {
    if (plannedDestination !== "3,3") {
      throw new Error(`Expected the infantry to hold its covered staging hex, but planner chose ${plannedDestination || "no move"}.`);
    }
    if (plannedFieldAction !== "digIn") {
      throw new Error(`Expected the infantry to choose a dig-in consolidation action, received ${plannedFieldAction || "none"}.`);
    }
  });
});

registerTest("BOT_PLANNER_RECON_PREFERS_A_SCREENING_LANE_OVER_A_SUICIDAL_FRONTLINE_POKE", async ({ Given, When, Then }) => {
  let plannedDestination = "";
  let plannedAttackTarget = "";

  await Given("a recon bike choosing between a front-line jab and a safer spotting lane under enemy recon and artillery coverage", async () => {
    const botRecon = createPlannerSnapshot("BotRecon", reconBikeDef, { q: 0, r: 2 });
    const botTank = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 3 });
    const playerFrontInfantry = createPlannerSnapshot("PlayerFrontInfantry", playerInfantryDef, { q: 2, r: 1 });
    const playerRecon = createPlannerSnapshot("PlayerRecon", reconBikeDef, { q: 3, r: 1 });
    const playerArtillery = createPlannerSnapshot("PlayerArtillery", playerArtilleryDef, { q: 4, r: 1 });
    const playerBomber = createPlannerSnapshot("PlayerBomber", bomberDef, { q: 6, r: 0 });

    const input: BotPlannerInput = {
      botUnits: [botRecon, botTank],
      playerUnits: [playerFrontInfantry, playerRecon, playerArtillery, playerBomber],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botRecon.unit.hex), "bot"],
        [axialKey(botTank.unit.hex), "bot"],
        [axialKey(playerFrontInfantry.unit.hex), "player"],
        [axialKey(playerRecon.unit.hex), "player"],
        [axialKey(playerArtillery.unit.hex), "player"],
        [axialKey(playerBomber.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 6 && hex.r >= 0 && hex.r <= 6,
        terrainAt: (hex) => axialKey(hex) === "1,2" ? woods : plains,
        movementCost: () => 1
      },
      losAllows: (attackerHex, targetHex) => {
        const attackerKey = axialKey(attackerHex);
        const targetKey = axialKey(targetHex);
        const visiblePairs = new Set([
          "1,1->2,1",
          "1,1->3,1",
          "1,1->4,1",
          "1,2->2,1",
          "1,2->4,1",
          "3,1->1,1"
        ]);
        return visiblePairs.has(`${attackerKey}->${targetKey}`);
      },
      movementAllowance: () => 1,
      attackEstimator: (_attacker, attackerHex, defender, defenderHex) => {
        if (axialKey(attackerHex) === "1,1"
          && axialKey(defenderHex) === "2,1"
          && (defender.unit.type as string) === "PlayerFrontInfantry") {
          return {
            expectedDamage: 7,
            expectedRetaliation: 4
          };
        }
        return null;
      },
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,2");
    plannedDestination = plan ? axialKey(plan.destination) : "";
    plannedAttackTarget = plan?.attackTarget ? axialKey(plan.attackTarget) : "";
  });

  await When("the planner compares the attack against the safer reconnaissance screen", async () => {
    // Result captured during Given.
  });

  await Then("the recon should avoid the exposed attack hex and move into the safer spotting lane instead", async () => {
    if (plannedDestination !== "1,2") {
      throw new Error(`Expected recon to choose screening hex 1,2, but planner chose ${plannedDestination || "no move"}.`);
    }
    if (plannedAttackTarget) {
      throw new Error(`Expected recon to skip the front-line attack, but it planned an attack on ${plannedAttackTarget}.`);
    }
  });
});

registerTest("BOT_PLANNER_RECON_HOLDS_A_DEEP_SCREEN_INSTEAD_OF_DIVING_INTO_A_SUPPORTED_KILL_ZONE", async ({ Given, When, Then }) => {
  let plannedDestination = "";
  let plannedAttackTarget = "";

  await Given("a recon bike choosing between a close contact poke and a deeper covered screen under artillery and player recon support", async () => {
    const botRecon = createPlannerSnapshot("BotRecon", reconBikeDef, { q: 0, r: 2 });
    const botTank = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 4 });
    const playerFrontInfantry = createPlannerSnapshot("PlayerFrontInfantry", playerInfantryDef, { q: 3, r: 2 });
    const playerRecon = createPlannerSnapshot("PlayerRecon", reconBikeDef, { q: 4, r: 1 });
    const playerArtillery = createPlannerSnapshot("PlayerArtillery", playerArtilleryDef, { q: 5, r: 2 });
    const playerBomber = createPlannerSnapshot("PlayerBomber", bomberDef, { q: 6, r: 1 });

    const input: BotPlannerInput = {
      botUnits: [botRecon, botTank],
      playerUnits: [playerFrontInfantry, playerRecon, playerArtillery, playerBomber],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botRecon.unit.hex), "bot"],
        [axialKey(botTank.unit.hex), "bot"],
        [axialKey(playerFrontInfantry.unit.hex), "player"],
        [axialKey(playerRecon.unit.hex), "player"],
        [axialKey(playerArtillery.unit.hex), "player"],
        [axialKey(playerBomber.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 6 && hex.r >= 0 && hex.r <= 6,
        terrainAt: (hex) => axialKey(hex) === "0,3" ? woods : plains,
        movementCost: () => 1
      },
      losAllows: (attackerHex, targetHex) => {
        const attackerKey = axialKey(attackerHex);
        const targetKey = axialKey(targetHex);
        const visiblePairs = new Set([
          "1,2->3,2",
          "1,2->4,1",
          "1,2->5,2",
          "0,3->3,2",
          "0,3->5,2",
          "4,1->1,2",
          "4,1->0,3"
        ]);
        return visiblePairs.has(`${attackerKey}->${targetKey}`);
      },
      movementAllowance: () => 1,
      attackEstimator: (_attacker, attackerHex, defender, defenderHex) => {
        if (axialKey(attackerHex) === "1,2"
          && axialKey(defenderHex) === "3,2"
          && (defender.unit.type as string) === "PlayerFrontInfantry") {
          return {
            expectedDamage: 7,
            expectedRetaliation: 4
          };
        }
        return null;
      },
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,2");
    plannedDestination = plan ? axialKey(plan.destination) : "";
    plannedAttackTarget = plan?.attackTarget ? axialKey(plan.attackTarget) : "";
  });

  await When("the planner weighs the observer role against the kill zone at the front edge", async () => {
    // Result captured during Given.
  });

  await Then("the recon should hold the deeper screen and avoid the closer attack hex", async () => {
    if (plannedDestination !== "0,3") {
      throw new Error(`Expected recon to hold deeper screen 0,3, but planner chose ${plannedDestination || "no move"}.`);
    }
    if (plannedAttackTarget) {
      throw new Error(`Expected recon to skip the close-contact attack, but it planned an attack on ${plannedAttackTarget}.`);
    }
  });
});

registerTest("BOT_PLANNER_RECON_SPREADS_INTO_A_SECOND_SPOTTING_LANE_INSTEAD_OF_CLUSTERING", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("a second recon bike choosing between clustering beside another scout or covering a different enemy avenue", async () => {
    const anchorRecon = createPlannerSnapshot("AnchorRecon", reconBikeDef, { q: 1, r: 1 });
    const movingRecon = createPlannerSnapshot("MovingRecon", reconBikeDef, { q: 0, r: 3 });
    const botTank = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 4 });
    const firstArtillery = createPlannerSnapshot("FirstArtillery", playerArtilleryDef, { q: 4, r: 1 });
    const secondArtillery = createPlannerSnapshot("SecondArtillery", playerArtilleryDef, { q: 5, r: 3 });

    const input: BotPlannerInput = {
      botUnits: [anchorRecon, movingRecon, botTank],
      playerUnits: [firstArtillery, secondArtillery],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(anchorRecon.unit.hex), "bot"],
        [axialKey(movingRecon.unit.hex), "bot"],
        [axialKey(botTank.unit.hex), "bot"],
        [axialKey(firstArtillery.unit.hex), "player"],
        [axialKey(secondArtillery.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 6 && hex.r >= 0 && hex.r <= 6,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: (attackerHex, targetHex) => {
        const attackerKey = axialKey(attackerHex);
        const targetKey = axialKey(targetHex);
        const visiblePairs = new Set([
          "1,2->4,1",
          "2,3->5,3"
        ]);
        return visiblePairs.has(`${attackerKey}->${targetKey}`);
      },
      movementAllowance: (snapshot) => ((snapshot.unit.type as string) === "MovingRecon" ? 2 : 0),
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,3");
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner scores the clustered lane against the unique spotting lane", async () => {
    // Result captured during Given.
  });

  await Then("the moving recon should peel into the second lane instead of piling up beside the first scout", async () => {
    if (plannedDestination !== "2,3") {
      throw new Error(`Expected moving recon to spread to 2,3, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});

registerTest("BOT_PLANNER_PRIORITIZES_KILLING_A_PLAYER_RECON_OBSERVER_THAT_IS_SPOTTING_FOR_ARTILLERY", async ({ Given, When, Then }) => {
  let plannedAttackTarget = "";

  await Given("a bot tank choosing between a player recon observer and a nearby infantry unit with the observer enabling artillery fire", async () => {
    const tankDef = structuredClone(playerTankDef);
    const gunDef = structuredClone(antiTankGunDef);
    const reconDef = structuredClone(reconBikeDef);
    const infantryDef = structuredClone(playerInfantryDef);
    const artilleryDef = structuredClone(playerArtilleryDef);
    const localPlains = structuredClone(plains);
    const botTank = createPlannerSnapshot("BotTank", tankDef, { q: 0, r: 0 });
    const botGun = createPlannerSnapshot("BotGun", gunDef, { q: 0, r: 1 });
    const playerRecon = createPlannerSnapshot("PlayerRecon", reconDef, { q: 1, r: 0 });
    const playerInfantry = createPlannerSnapshot("PlayerInfantry", infantryDef, { q: 1, r: 1 });
    const playerArtillery = createPlannerSnapshot("PlayerArtillery", artilleryDef, { q: 3, r: 0 });

    const input: BotPlannerInput = {
      botUnits: [botTank, botGun],
      playerUnits: [playerRecon, playerInfantry, playerArtillery],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botTank.unit.hex), "bot"],
        [axialKey(botGun.unit.hex), "bot"],
        [axialKey(playerRecon.unit.hex), "player"],
        [axialKey(playerInfantry.unit.hex), "player"],
        [axialKey(playerArtillery.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 4 && hex.r >= 0 && hex.r <= 4,
        terrainAt: () => localPlains,
        movementCost: () => 1
      },
      losAllows: (attackerHex, targetHex) => {
        const attackerKey = axialKey(attackerHex);
        const targetKey = axialKey(targetHex);
        const visiblePairs = new Set([
          "1,0->0,0",
          "1,0->0,1",
          "0,0->1,0",
          "0,0->1,1"
        ]);
        return visiblePairs.has(`${attackerKey}->${targetKey}`);
      },
      movementAllowance: () => 1,
      attackEstimator: (_attacker, attackerHex, _defender, defenderHex) => {
        if (axialKey(attackerHex) === "0,0" && (axialKey(defenderHex) === "1,0" || axialKey(defenderHex) === "1,1")) {
          return {
            expectedDamage: 12,
            expectedRetaliation: 4
          };
        }
        return null;
      },
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,0");
    plannedAttackTarget = plan?.attackTarget ? axialKey(plan.attackTarget) : "";
  });

  await When("the planner ranks attack targets with observer-enabled artillery pressure in mind", async () => {
    // Result captured during Given.
  });

  await Then("the recon observer should be attacked before the equally available infantry target", async () => {
    if (plannedAttackTarget !== "1,0") {
      throw new Error(`Expected bot tank to attack recon observer at 1,0, but planner targeted ${plannedAttackTarget || "nothing"}.`);
    }
  });
});

registerTest("BOT_PLANNER_LONG_RANGE_CHASES_USE_PRESSURE_LOGIC_INSTEAD_OF_DISTANT_FIRE_SETUP", async ({ Given, When, Then }) => {
  let plannedDestination = "";
  let plannedRationale = "";

  await Given("a rear tank looking at artillery that is still multiple turns away from a real firing position", async () => {
    const rearTank = createPlannerSnapshot("RearTank", playerTankDef, { q: 0, r: 0 });
    const playerArtillery = createPlannerSnapshot("PlayerArtillery", playerArtilleryDef, { q: 9, r: 0 });

    const input: BotPlannerInput = {
      botUnits: [rearTank],
      playerUnits: [playerArtillery],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(rearTank.unit.hex), "bot"],
        [axialKey(playerArtillery.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 10 && hex.r >= 0 && hex.r <= 6,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: () => true,
      movementAllowance: () => 2,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "0,0");
    plannedDestination = plan ? axialKey(plan.destination) : "";
    plannedRationale = plan?.rationale ?? "";
  });

  await When("the planner evaluates whether this is really a next-turn fire setup or just a longer operational chase", async () => {
    // Result captured during Given.
  });

  await Then("the move should be treated as pressure instead of a fake long-range firing setup", async () => {
    if (plannedDestination !== "2,0") {
      throw new Error(`Expected rear tank to pressure forward to 2,0, but planner chose ${plannedDestination || "no move"}.`);
    }
    if (!plannedRationale.toLowerCase().includes("pressure")) {
      throw new Error(`Expected a pressure-driven rationale, but planner reported "${plannedRationale || "none"}".`);
    }
  });
});
