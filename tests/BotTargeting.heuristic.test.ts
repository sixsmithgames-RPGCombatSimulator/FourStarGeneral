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
import { planHeuristicBotTurn, type BotPlannerInput, type PlannerUnitSnapshot } from "../src/game/bot/BotPlanner";
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

const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

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

const strikeUnitTypes: UnitTypeDictionary = {
  TestInfantry: playerInfantryDef,
  TestTank: playerTankDef,
  TestArtillery: playerArtilleryDef,
  TestBomber: bomberDef,
  TestGroundAttack: groundAttackDef
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
