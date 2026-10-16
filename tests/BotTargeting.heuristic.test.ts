import assert from "node:assert/strict";
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
  computeReachableHexes,
  planHeuristicBotTurn,
  type BotPlannerInput,
  type PlannerUnitSnapshot
} from "../src/game/bot/BotPlanner";
import { GameEngine, type CombatReportEntry, type GameEngineConfig } from "../src/game/GameEngine";
import { GameEngineInitiativeMethods, type InitiativeBotActivationResult } from "../src/game/GameEngineInitiativeIntegration";
import { registerTest } from "./harness";
import { canonicalWeaponModel } from "./canonicalWeaponFixture";

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
  weaponModel: canonicalWeaponModel("infantry"),
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
  weaponModel: canonicalWeaponModel("tank"),
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
  weaponModel: canonicalWeaponModel("howitzer"),
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
  weaponModel: canonicalWeaponModel("antiTankBattery"),
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
  weaponModel: canonicalWeaponModel("reconBike"),
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
  weaponModel: canonicalWeaponModel("bomber"),
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
  weaponModel: canonicalWeaponModel("groundAttackWing"),
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
  weaponModel: canonicalWeaponModel("supplyConvoy"),
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
  Medium_Tank: playerTankDef,
  Infantry_42: playerInfantryDef,
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

function side(hq = { q: 0, r: 0 }, units: ScenarioUnit[] = [], moveBonus = 0): ScenarioSide {
  return {
    hq,
    general: { accBonus: 0, dmgBonus: 0, moveBonus, supplyBonus: 0 },
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

function createHeuristicEngine(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[], startPlayerTurn = true,
  overrides: Partial<Pick<GameEngineConfig, "unitTypes" | "terrain" | "botDifficulty" | "playerSide" | "botSide" | "allySide">> = {}): GameEngine {
  const preDeployedPlayers = playerUnits.map((unit) => ({ ...unit, preDeployed: true }));
  const cfg: GameEngineConfig = {
    scenario: createScenario(preDeployedPlayers, botUnits),
    unitTypes: strikeUnitTypes,
    terrain,
    playerSide: side({ q: 0, r: 0 }, preDeployedPlayers),
    botSide: side({ q: 7, r: 0 }, botUnits),
    botStrategyMode: "Heuristic",
    ...overrides
  };
  const engine = new GameEngine(cfg);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  if (startPlayerTurn) engine.startPlayerTurnPhase();
  return engine;
}

registerTest("BOT_COMMANDER_MOBILITY_GRANTS_STAY_FACTION_LOCAL_AT_REAL_ROUND_BOUNDARIES", async ({ Given, When, Then }) => {
  const definition = { ...playerInfantryDef, movement: 5, vision: 1 };
  const player = { ...createPlannerSnapshot("Infantry_42", definition, { q: 0, r: 6 }).unit, unitId: "mobility-player", preDeployed: true };
  const bot = { ...createPlannerSnapshot("Infantry_42", definition, { q: 7, r: 0 }).unit, unitId: "mobility-bot" };
  const ally = { ...createPlannerSnapshot("Infantry_42", definition, { q: 0, r: 7 }).unit, unitId: "mobility-ally" };
  const observed: number[][] = [];
  await Given("isolated five-point formations under independently authored generals", async () => {});
  await When("conventional and initiative rounds renew their real movement credits", async () => {
    for (const [playerBonus, botBonus, allyBonus] of [[10, 0, 40], [0, 20, 0]]) {
      for (const mode of ["conventional", "initiative"] as const) {
        const engine = createHeuristicEngine([player], [bot], true, {
          unitTypes: { ...strikeUnitTypes, Infantry_42: definition } as UnitTypeDictionary,
          playerSide: side({ q: 0, r: 6 }, [player], playerBonus),
          botSide: side({ q: 7, r: 0 }, [bot], botBonus),
          allySide: side({ q: 0, r: 7 }, [ally], allyBonus)
        });
        if (mode === "initiative") engine.hydrateFromSerialized({ ...engine.serialize(), phase: "botTurn", activeFaction: "Bot" });
        engine.endTurn();
        const credits = [
          engine.playerUnits.find((unit) => unit.unitId === player.unitId)!.movementCredit!,
          engine.botUnits.find((unit) => unit.unitId === bot.unitId)!.movementCredit!
        ];
        if (mode === "conventional") credits.push(engine.allyUnits.find((unit) => unit.unitId === ally.unitId)!.movementCredit!);
        observed.push(credits);
      }
    }
  });
  await Then("no faction receives another side's commander grant or carryover cap", async () => {
    assert.deepEqual(observed, [[6, 5, 7], [6, 5], [5, 6, 5], [5, 6]]);
  });
});

registerTest("BOT_COMMANDER_MOBILITY_PRESERVES_SAVED_PLAYER_OVERRIDE_WITHOUT_LEAKING_IT", async ({ Given, When, Then }) => {
  const definition = { ...playerInfantryDef, movement: 5, vision: 1 };
  const player = { ...createPlannerSnapshot("Infantry_42", definition, { q: 0, r: 6 }).unit, unitId: "saved-player" };
  const bot = { ...createPlannerSnapshot("Infantry_42", definition, { q: 7, r: 0 }).unit, unitId: "saved-bot" };
  const engine = createHeuristicEngine([player], [bot], true, { unitTypes: { ...strikeUnitTypes, Infantry_42: definition } as UnitTypeDictionary });
  await Given("neutral authored generals and a save whose player commander has earned twenty percent mobility", async () => {
    const saved = engine.serialize();
    engine.hydrateFromSerialized({ ...saved, phase: "botTurn", activeFaction: "Bot", commanderStats: { ...saved.commanderStats!, moveBonus: 20 } });
  });
  await When("the restored initiative round completes", async () => { engine.endTurn(); });
  await Then("the saved player budget remains six while the neutral bot receives five", async () => {
    assert.equal(engine.getMovementBudget(player.hex, player.unitId)?.max, 6);
    assert.equal(engine.playerUnits.find((unit) => unit.unitId === player.unitId)?.movementCredit, 6);
    assert.equal(engine.botUnits.find((unit) => unit.unitId === bot.unitId)?.movementCredit, 5);
    assert.equal(engine.serialize().commanderStats?.moveBonus, 20);
  });
});

registerTest("BOT_COMMANDER_MOBILITY_CONTROLS_REAL_MOVE_THEN_FIRE_ELIGIBILITY", async ({ Given, When, Then }) => {
  const definition = { ...playerTankDef, movement: 5 };
  const bot = { ...createPlannerSnapshot("TestTank", definition, { q: 1, r: 0 }).unit, unitId: "mobility-attacker" };
  const player = { ...createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 2, r: 0 }).unit, unitId: "mobility-defender", preDeployed: true, ammo: 0 };
  const results: boolean[] = [];
  await Given("a five-point tank which has already moved three points", async () => {});
  await When("opposed commander bonuses are evaluated at the actual bot attack transaction", async () => {
    for (const [playerBonus, botBonus] of [[10, 0], [0, 20]]) {
      const engine = createHeuristicEngine([player], [bot], true, {
        unitTypes: { ...strikeUnitTypes, TestTank: definition } as UnitTypeDictionary,
        playerSide: side({ q: 0, r: 0 }, [player], playerBonus), botSide: side({ q: 7, r: 0 }, [bot], botBonus)
      });
      engine["botActionFlags"].set(bot.unitId, { movementPointsUsed: 3, attacksUsed: 0, retaliationsUsed: 0, isRushing: false });
      const before = engine.serialize();
      const result = engine["resolveBotAttack"](engine.botUnits.find((unit) => unit.unitId === bot.unitId)!, bot.hex, player.hex);
      results.push(result !== null);
      if (botBonus === 0) assert.deepEqual(engine.serialize(), before, "Rejected movement must not spend ammo, damage, or RNG.");
      else {
        assert.ok(result, "The acting commander's own bonus must authorize the third movement point.");
        assert.equal(engine.serialize().actionFlags?.Bot.find(([id]) => id === bot.unitId)?.[1].attacksUsed, 1);
        const after = engine.serialize();
        assert.equal(engine["resolveBotAttack"](engine.botUnits.find((unit) => unit.unitId === bot.unitId)!, bot.hex, player.hex), null);
        assert.deepEqual(engine.serialize(), after, "The bonus must never create a second attack.");
      }
    }
  });
  await Then("only the acting bot commander's bonus can extend the firing limit", async () => { assert.deepEqual(results, [false, true]); });
});

registerTest("BOT_COMMANDER_MOBILITY_PLANNER_AND_ACTIVATION_IGNORE_OPPOSING_BONUSES", async ({ Given, When, Then }) => {
  const definition = { ...playerTankDef, movement: 5, vision: 6 };
  const bot = { ...createPlannerSnapshot("TestTank", definition, { q: 0, r: 0 }).unit, unitId: "mobility-planner" };
  const player = { ...createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 4, r: 0 }).unit, unitId: "mobility-contact", preDeployed: true, ammo: 0 };
  const results: ReturnType<GameEngine["executeBotActivation"]>[] = [];
  await Given("a visible contact requiring three points of movement before a legal shot", async () => {});
  await When("real production activations vary only one side's mobility bonus", async () => {
    for (const [playerBonus, botBonus] of [[0, 0], [10, 0], [0, 20], [0, 20]]) {
      const engine = createHeuristicEngine([player], [bot], true, {
        unitTypes: { ...strikeUnitTypes, TestTank: definition } as UnitTypeDictionary,
        playerSide: side({ q: 0, r: 0 }, [player], playerBonus), botSide: side({ q: 7, r: 0 }, [bot], botBonus)
      });
      results.push(engine.executeBotActivation(bot.unitId));
    }
  });
  await Then("opposing bonuses cannot change a bot plan and its own bonus produces a reproducible legal move/fire", async () => {
    assert.deepEqual(results[1], results[0]);
    assert.equal(results[0].attacks.length, 0);
    assert.equal(results[2].attacks.length, 1);
    assert.equal(results[2].moves[0]?.path.length, 4);
    assert.deepEqual(results[3], results[2]);
  });
});

registerTest("BOT_COMMANDER_MOBILITY_TOW_HOOKUP_USES_ACTING_FACTION", async ({ Given, When, Then }) => {
  const definition = { ...antiTankGunDef, movement: 4, rangeMax: 1, vision: 5 };
  const gun = { ...createPlannerSnapshot("AT_Gun_50mm", definition, { q: 0, r: 0 }).unit, unitId: "mobility-gun", towState: "deployed" as const };
  const target = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 3, r: 0 }).unit, unitId: "tow-mobility-target", preDeployed: true };
  const expenditures: number[][] = [];
  await Given("a four-point gun and opposed neutral/twenty-five-percent mobility generals", async () => {});
  await When("the bot limbers and traverses while the player issues the real move-out command", async () => {
    for (const [playerBonus, botBonus] of [[25, 0], [0, 25]]) {
      const unitTypes = { ...strikeUnitTypes, AT_Gun_50mm: definition } as UnitTypeDictionary;
      const engine = createHeuristicEngine([target], [gun], true, {
        unitTypes, playerSide: side({ q: 0, r: 0 }, [target], playerBonus), botSide: side({ q: 7, r: 0 }, [gun], botBonus)
      });
      const summary = engine.executeBotActivation(gun.unitId);
      assert.equal(summary.moves.length, 1);
      assert.equal(summary.attacks.length, 0);
      const botFlags = engine.serialize().actionFlags?.Bot.find(([id]) => id === gun.unitId)?.[1];
      const botHookup = botFlags!.movementPointsUsed - (summary.moves[0].path.length - 1);
      const playerGun = { ...gun, preDeployed: true };
      const playerEngine = createHeuristicEngine([playerGun], [target], true, {
        unitTypes, playerSide: side({ q: 0, r: 0 }, [playerGun], playerBonus), botSide: side({ q: 7, r: 0 }, [target], botBonus)
      });
      assert.equal(playerEngine.moveOutTowableUnit(gun.hex, gun.unitId), true);
      const playerHookup = playerEngine.serialize().actionFlags?.Player.find(([id]) => id === gun.unitId)?.[1].movementPointsUsed;
      expenditures.push([playerHookup!, botHookup]);
      assert.equal(engine.botUnits.find((unit) => unit.unitId === gun.unitId)?.towState, "towed");
      assert.equal(engine.executeBotActivation(gun.unitId).attacks.length, 0);
    }
  });
  await Then("each hookup cost is half its own rounded allowance, not the opponent's", async () => {
    assert.deepEqual(expenditures, [[3, 2], [2, 3]]);
  });
});

registerTest("BOT_COMMANDER_MOBILITY_LEGACY_LOGISTICS_USES_ITS_OWN_ALLOWANCE", async ({ Given, When, Then }) => {
  const truck = { ...createPlannerSnapshot("Supply_Truck", supplyTruckDef, { q: 0, r: 0 }).unit, unitId: "legacy-mobility-truck", preDeployed: true };
  const outcomes: boolean[] = [];
  await Given("a legacy two-point convoy without banked movement facing a two-and-a-half-point edge", async () => {});
  await When("the actual initiative logistics mover compares opposing mobility bonuses", async () => {
    for (const faction of ["Player", "Bot"] as const) {
      for (const ownBonus of [0, 50]) {
        const players = faction === "Player" ? [truck] : [];
        const bots = faction === "Bot" ? [truck] : [];
        const playerBonus = faction === "Player" ? ownBonus : 50 - ownBonus;
        const botBonus = faction === "Bot" ? ownBonus : 50 - ownBonus;
        const engine = createHeuristicEngine(players, bots, true, {
          terrain: { ...terrain, plains: { ...plains, moveCost: { ...plains.moveCost, wheel: 2.5 } } } as TerrainDictionary,
          playerSide: side({ q: 0, r: 0 }, players, playerBonus), botSide: side({ q: 7, r: 0 }, bots, botBonus)
        });
        const saved = engine.serialize();
        engine.hydrateFromSerialized({ ...saved,
          playerPlacements: saved.playerPlacements.map((unit) => ({ ...unit, movementCredit: undefined })),
          botPlacements: saved.botPlacements.map((unit) => ({ ...unit, movementCredit: undefined }))
        });
        const unit = (faction === "Player" ? engine.playerUnits : engine.botUnits).find((entry) => entry.unitId === truck.unitId)!;
        assert.equal(unit.movementCredit, undefined);
        const integration = new GameEngineInitiativeMethods(engine);
        const harness = integration as unknown as { moveSingleHexToward(unit: ScenarioUnit, faction: "Player" | "Bot", target: Axial): boolean };
        const before = engine.serialize();
        const moved = harness.moveSingleHexToward(unit, faction, { q: 1, r: 0 });
        outcomes.push(moved);
        if (ownBonus === 0) assert.deepEqual(engine.serialize(), before);
        else {
          const after = (faction === "Player" ? engine.playerUnits : engine.botUnits).find((entry) => entry.unitId === truck.unitId)!;
          assert.deepEqual(after.hex, { q: 1, r: 0 });
          assert.equal(after.movementCredit, 0.5);
          assert.ok(after.fuel < unit.fuel);
        }
      }
    }
  });
  await Then("only the acting general enables the step and normal fuel/cost accounting remains intact", async () => {
    assert.deepEqual(outcomes, [false, true, false, true]);
  });
});

registerTest("BOT_COMMANDER_MOBILITY_COMBAT_CONTEXT_USES_ACTUAL_ATTACKER_FACTION", async ({ Given, When, Then }) => {
  const definition = { ...playerTankDef, movement: 5 };
  const player = { ...createPlannerSnapshot("TestTank", definition, { q: 0, r: 0 }).unit, unitId: "context-player", preDeployed: true };
  const bot = { ...createPlannerSnapshot("TestTank", definition, { q: 1, r: 0 }).unit, unitId: "context-bot" };
  const ally = { ...createPlannerSnapshot("TestTank", definition, { q: 0, r: 1 }).unit, unitId: "context-ally" };
  const engine = createHeuristicEngine([player], [bot], true, {
    unitTypes: { ...strikeUnitTypes, TestTank: definition } as UnitTypeDictionary,
    playerSide: side({ q: 0, r: 0 }, [player], 0), botSide: side({ q: 7, r: 0 }, [bot], 0), allySide: side({ q: 0, r: 1 }, [ally], 40)
  });
  let windows: (number | undefined)[];
  await Given("a saved player bonus of twenty percent, neutral bot and forty-percent ally", async () => {
    const saved = engine.serialize();
    engine.hydrateFromSerialized({ ...saved, commanderStats: { ...saved.commanderStats!, moveBonus: 20 } });
  });
  await When("the engine builds real forward and counterfire requests without resolving combat", async () => {
    const before = engine.serialize();
    const actualPlayer = engine.playerUnits.find((unit) => unit.unitId === player.unitId)!;
    const actualBot = engine.botUnits.find((unit) => unit.unitId === bot.unitId)!;
    const actualAlly = engine.allyUnits.find((unit) => unit.unitId === ally.unitId)!;
    windows = [
      engine["buildAttackRequest"](actualPlayer, actualBot, "Player", "Bot")?.attackerCtx.movementAttackWindow,
      engine["buildAttackRequest"](actualBot, actualPlayer, "Bot", "Player", { isRetaliation: true })?.attackerCtx.movementAttackWindow,
      engine["buildAttackRequest"](actualAlly, actualBot, "Ally", "Bot")?.attackerCtx.movementAttackWindow
    ];
    assert.deepEqual(engine.serialize(), before, "Mobility context projection must not consume RNG or mutate state.");
  });
  await Then("the movement windows follow each actual attacker, including the saved player override", async () => {
    assert.deepEqual(windows, [3, 2.5, 3.5]);
  });
});

registerTest("BOT_PLANNER_USES_ENGINE_STACK_CAPACITY_FOR_ENTRY_AND_TRANSIT", async ({ Given, When, Then }) => {
  const mover = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 0 });
  const input: BotPlannerInput = {
    botUnits: [mover],
    playerUnits: [],
    objectives: [],
    occupancy: new Map([["0,0", "bot"], ["1,0", "bot"], ["3,0", "bot"], ["5,0", "player"]]),
    map: {
      inBounds: (hex) => hex.r === 0 && hex.q >= 0 && hex.q <= 5,
      terrainAt: () => plains,
      movementCost: () => 1,
      canEnterHex: (origin, destination) => {
        assert.deepEqual(origin, mover.unit.hex, "Capacity must be checked for the acting formation's origin.");
        return destination.q !== 3 && destination.q !== 5;
      }
    },
    losAllows: () => true,
    movementAllowance: () => 5,
    attackEstimator: () => null
  };
  let reachable = new Map<string, { path: readonly Axial[] }>();

  await Given("one friendly formation at 1,0, a full friendly stack at 3,0, and an enemy at 5,0", async () => {});
  await When("the bot searches using the engine's authoritative stacking legality", async () => {
    reachable = computeReachableHexes(mover.unit.hex, 5, "track", input, "0,0");
  });
  await Then("the spare friendly slot allows a destination and transit but full stacks block the lane", async () => {
    assert.ok(reachable.has("1,0"), "The spare friendly slot must be a legal destination.");
    assert.deepEqual(reachable.get("2,0")?.path.map(axialKey), ["0,0", "1,0", "2,0"]);
    assert.equal(reachable.has("3,0"), false, "A full stack cannot receive a third unit.");
    assert.equal(reachable.has("4,0"), false, "A full stack cannot be crossed.");
    assert.equal(reachable.has("5,0"), false, "Hostile occupancy remains blocked.");
  });
});

registerTest("BOT_PLANNER_PRICES_MOVEMENT_FROM_THE_PREVIOUS_HEX", async ({ Given, When, Then }) => {
  const mover = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 0 });
  const costEdges: string[] = [];
  const input: BotPlannerInput = {
    botUnits: [mover], playerUnits: [], objectives: [], occupancy: new Map([["0,0", "bot"]]),
    map: {
      inBounds: (hex) => hex.r === 0 && hex.q >= 0 && hex.q <= 2,
      terrainAt: () => plains,
      movementCost: (hex, _moveType, from) => {
        costEdges.push(`${from ? axialKey(from) : "missing"}->${axialKey(hex)}`);
        return from && from.q === 0 && hex.q === 1 ? 2 : 1;
      }
    },
    losAllows: () => true, movementAllowance: () => 2, attackEstimator: () => null
  };
  let reachable = new Map<string, { cost: number }>();

  await Given("a crossing whose two-point cost depends on the entering edge", async () => {});
  await When("the bot computes positions reachable with two movement points", async () => {
    reachable = computeReachableHexes(mover.unit.hex, 2, "track", input, "0,0");
  });
  await Then("the bot can reach the crossing but cannot invent a discounted step beyond it", async () => {
    assert.equal(reachable.get("1,0")?.cost, 2);
    assert.equal(reachable.has("2,0"), false);
    assert.ok(costEdges.includes("0,0->1,0"));
    assert.equal(costEdges.some((edge) => edge.startsWith("missing")), false);
  });
});

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

registerTest("BOT_PLANNER_ROUTES_AROUND_PLAYER_UNITS", async ({ Given, When, Then }) => {
  let plannedPath: string[] = [];

  await Given("a bot formation with a player unit blocking the direct route", async () => {
    const botUnit = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 1 });
    const playerBlocker = createPlannerSnapshot("PlayerInfantry", playerInfantryDef, { q: 1, r: 1 });
    const input: BotPlannerInput = {
      botUnits: [botUnit],
      playerUnits: [playerBlocker],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botUnit.unit.hex), "bot"],
        [axialKey(playerBlocker.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 2 && hex.r >= 0 && hex.r <= 2,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: () => true,
      movementAllowance: () => 3,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const reachable = computeReachableHexes(botUnit.unit.hex, 3, botUnit.definition.moveType, input, axialKey(botUnit.unit.hex));
    plannedPath = (reachable.get("2,1")?.path ?? []).map((hex) => axialKey(hex));
  });

  await When("the bot computes its reachable movement paths", async () => {});

  await Then("the route to the far side should detour instead of crossing the player unit", async () => {
    if (plannedPath.length === 0) {
      throw new Error("Expected the bot to find a legal detour to 2,1.");
    }
    if (plannedPath.includes("1,1")) {
      throw new Error(`Expected bot route to avoid the player at 1,1, received ${plannedPath.join(" -> ")}.`);
    }
  });
});

registerTest("BOT_EXECUTION_TRANSITS_A_SPARE_FRIENDLY_SLOT_WITHOUT_MOVING_THE_LEAD_UNIT", async ({ Given, When, Then }) => {
  const rear = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 0 }).unit, unitId: "rear-tank" };
  const screen = { ...createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 1, r: 0 }).unit, unitId: "screen" };
  const target = { ...createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 3, r: 0 }).unit, unitId: "target" };
  const engine = createHeuristicEngine([target], [rear, screen]);
  let summary: ReturnType<GameEngine["executeBotActivation"]>;

  await Given("a rear tank and a stationary friendly screen with spare stacking capacity", async () => {});
  await When("only the rear tank receives an activation", async () => { summary = engine.executeBotActivation("rear-tank"); });
  await Then("its committed path crosses the friendly hex and preserves both stable unit identities", async () => {
    assert.equal(summary.moves.length, 1);
    assert.ok(summary.moves[0].path.some((hex) => axialKey(hex) === "1,0"));
    assert.notEqual(axialKey(engine.botUnits.find((unit) => unit.unitId === "rear-tank")!.hex), "0,0");
    assert.equal(axialKey(engine.botUnits.find((unit) => unit.unitId === "screen")!.hex), "1,0");
    assert.equal(engine.botUnits.filter((unit) => unit.unitId === "rear-tank").length, 1);
    assert.equal(summary.supplyReport, null, "An initiative activation must not run another supply tick.");
  });
});

registerTest("BOT_INITIATIVE_USES_THE_PRODUCTION_PLANNER_AND_CONSUMES_ONE_LEGAL_ATTACK", async ({ Given, When, Then }) => {
  const attacker = { ...createPlannerSnapshot("Medium_Tank", playerTankDef, { q: 0, r: 0 }).unit, unitId: "initiative-tank" };
  const target = { ...createPlannerSnapshot("Infantry_42", playerInfantryDef, { q: 2, r: 0 }).unit, unitId: "initiative-target" };
  const engine = createHeuristicEngine([target], [attacker], false);
  const integration = new GameEngineInitiativeMethods(engine);
  const activationResults: InitiativeBotActivationResult[] = [];
  const logs: string[] = [];
  let secondAttackCount = -1;
  integration.setBotActivationListener((result) => { activationResults.push(result); });

  await Given("a real engine whose enemy can move and fire after the combat-report ledger is already full", async () => {
    const oldReports: CombatReportEntry[] = Array.from({ length: 50 }, (_, index) => ({
      id: `old-report-${index}`, turn: 0, timestamp: "2026-10-15T00:00:00.000Z",
      attacker: { faction: "Bot", unitType: "Medium_Tank", position: { q: 0, r: 0 }, strengthBefore: 100, strengthAfter: 100 },
      defender: { faction: "Player", unitType: "Infantry_42", position: { q: 2, r: 0 }, strengthBefore: 100, strengthAfter: 100, destroyed: false },
      attackResult: { damage: 0, terrainDefense: 0, accuracyMod: 0, range: 1, los: true }
    }));
    engine.hydrateFromSerialized({ ...engine.serialize(), combatReports: oldReports });
  });
  await When("the production initiative queue activates the enemy formation", async () => {
    const oldLog = console.log;
    console.log = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
    try {
      integration.startInitiativeTurnPhase();
      integration.completeUnitActivation("initiative-target");
      await new Promise((resolve) => setTimeout(resolve, 1600));
      secondAttackCount = engine.executeBotActivation("initiative-tank").attacks.length;
    } finally { console.log = oldLog; }
  });
  await Then("the shared planner moves the stable unit, fires once, and does not fall back or grant extra ammunition", async () => {
    const result = activationResults.find((entry) => entry.unitId === "initiative-tank");
    assert.ok(result, "The real queue must report the bot activation.");
    assert.equal(result.attacks.length, 1);
    assert.equal(engine.getCombatReports().length, 50, "A rollover must not hide the new attack from presentation.");
    assert.equal(result.attacks[0].attackerUnitId, "initiative-tank");
    assert.equal(result.attacks[0].defenderUnitId, "initiative-target");
    assert.equal(result.moved, true);
    assert.deepEqual(result.movementPath?.[0], result.fromHex);
    assert.deepEqual(result.movementPath?.[result.movementPath.length - 1], result.toHex);
    assert.equal(secondAttackCount, 0);
    const survivor = engine.botUnits.find((unit) => unit.unitId === "initiative-tank");
    assert.ok(survivor);
    assert.ok(survivor.ammo < attacker.ammo);
    assert.ok(survivor.fuel < attacker.fuel);
    assert.ok(logs.some((line) => line.startsWith("[Bot AI] Plan for ")));
    assert.equal(logs.some((line) => /adapter unavailable|fallback bot|Advanced AI/.test(line)), false);
  });
});

registerTest("BOT_INITIATIVE_ROUND_WRAP_RENEWS_ACTIONS_AND_MOVEMENT_WITHOUT_FREE_EXTRA_ATTACKS", async ({ Given, When, Then }) => {
  const bot = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 0 }).unit, unitId: "round-attacker" };
  const target = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 2, r: 0 }).unit, unitId: "round-defender", ammo: 0 };
  const engine = createHeuristicEngine([target], [bot]);
  const attacksPerRound: number[] = [];
  await Given("a legal tank attack which consumes movement and the round's only shot", async () => {
    const first = engine.executeBotActivation("round-attacker");
    attacksPerRound.push(first.attacks.length);
    assert.equal(first.moves.length, 1);
    assert.equal(engine.executeBotActivation("round-attacker").attacks.length, 0);
  });
  await When("two completed initiative rounds enter the real engine round boundary", async () => {
    for (let round = 0; round < 2; round += 1) {
      engine.hydrateFromSerialized({ ...engine.serialize(), phase: "botTurn", activeFaction: "Bot" });
      engine.endTurn();
      assert.equal(engine.serialize().actionFlags?.Bot.length, 0);
      assert.ok((engine.botUnits.find((unit) => unit.unitId === "round-attacker")?.movementCredit ?? 0) > 0);
      const next = engine.executeBotActivation("round-attacker");
      attacksPerRound.push(next.attacks.length);
      assert.equal(engine.executeBotActivation("round-attacker").attacks.length, 0);
    }
  });
  await Then("the stable formation can fight in every new round, never twice within one round", async () => {
    assert.deepEqual(attacksPerRound, [1, 1, 1]);
    assert.equal(engine.botUnits.filter((unit) => unit.unitId === "round-attacker").length, 1);
  });
});

registerTest("BOT_ACTIVATION_RESPECTS_EMPTY_FUEL_AND_SPENT_MOVEMENT", async ({ Given, When, Then }) => {
  const target = { ...createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 2, r: 0 }).unit, unitId: "budget-target" };
  const cases = [
    { unitId: "empty-tank", fuel: 0, movementCredit: 3 },
    { unitId: "spent-tank", fuel: 50, movementCredit: 0 }
  ];
  const summaries: ReturnType<GameEngine["executeBotActivation"]>[] = [];
  await Given("one tank with no fuel and another whose movement credit has been spent", async () => {});
  await When("each receives an activation with a visible target beyond its firing range", async () => {
    for (const state of cases) {
      const unit = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 0 }).unit, ...state };
      const engine = createHeuristicEngine([target], [unit]);
      summaries.push(engine.executeBotActivation(state.unitId));
    }
  });
  await Then("neither gains a free move or a shot from an unreachable firing position", async () => {
    for (const summary of summaries) {
      assert.equal(summary.moves.length, 0);
      assert.equal(summary.attacks.length, 0);
    }
  });
});

registerTest("BOT_ACTIVATION_DOES_NOT_HUNT_UNOBSERVED_FORMATIONS", async ({ Given, When, Then }) => {
  const unit = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 0 }).unit, unitId: "fog-tank" };
  const target = { ...createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 0, r: 6 }).unit, unitId: "hidden-target" };
  let input: BotPlannerInput;
  let result: ReturnType<GameEngine["executeBotActivation"]>;
  await Given("an enemy beyond every bot observer's spotting radius and no contested objective", async () => {});
  await When("the real engine builds its knowledge and executes the tank activation", async () => {
    const engine = createHeuristicEngine([target], [unit]);
    const harness = engine as unknown as {
      readonly botPlacements: Map<string, ScenarioUnit>;
      readonly playerPlacements: Map<string, ScenarioUnit>;
      buildPlannerInputFor(acting: Map<string, ScenarioUnit>, opposing: Map<string, ScenarioUnit>, difficulty: "Normal"): BotPlannerInput;
    };
    input = harness.buildPlannerInputFor(harness.botPlacements, harness.playerPlacements, "Normal");
    result = engine.executeBotActivation("fog-tank");
  });
  await Then("hidden identities and positions do not enter scoring and the bot cannot chase them", async () => {
    assert.equal(input.playerUnits.some((entry) => entry.unit.unitId === "hidden-target"), false);
    assert.equal(input.occupancy.has(axialKey(target.hex)), false);
    assert.equal(result.moves.length, 0);
    assert.equal(result.attacks.length, 0);
  });
});

registerTest("BOT_ROUTES_ARE_IDENTICAL_WHEN_ONLY_UNOBSERVED_HOSTILE_OCCUPANCY_CHANGES", async ({ Given, When, Then }) => {
  const tankDefinition = { ...playerTankDef, movement: 4, vision: 1 };
  const mover = { ...createPlannerSnapshot("Medium_Tank", tankDefinition, { q: 0, r: 3 }).unit, unitId: "route-scout" };
  const hidden = { ...createPlannerSnapshot("Infantry_42", playerInfantryDef, { q: 0, r: 5 }).unit, unitId: "route-hidden" };
  const overrides = { unitTypes: { ...strikeUnitTypes, Medium_Tank: tankDefinition } as UnitTypeDictionary };
  const clearEngine = createHeuristicEngine([], [mover], true, overrides);
  const hiddenEngine = createHeuristicEngine([hidden], [mover], true, overrides);
  const inputs = [clearEngine, hiddenEngine].map((engine) => ({
    ...engine["buildPlannerInputFor"](engine["botPlacements"], engine["playerPlacements"], "Normal"),
    objectives: [{ hex: { q: 0, r: 6 }, owner: "Player" as const, vp: 100 }]
  }));
  let paths: ReturnType<typeof computeReachableHexes>[];
  let plans: ReturnType<typeof planHeuristicBotTurn>[];
  await Given("otherwise identical maps with a hostile unit outside the moving tank's vision", async () => {
    assert.equal(hiddenEngine["checkTargetSpotted"](hidden.hex, "Bot"), false);
    assert.equal(inputs[1].occupancy.has(axialKey(hidden.hex)), false);
    assert.equal(inputs[1].playerUnits.some((entry) => entry.unit.unitId === hidden.unitId), false);
    assert.equal(hiddenEngine["canFactionEnterHex"](mover, "Bot", hidden.hex), false, "Execution must still enforce actual collision.");
  });
  await When("the real engine planner compares all reachable paths and chooses the next order", async () => {
    paths = inputs.map((input) => computeReachableHexes(mover.hex, 4, "track", input, axialKey(mover.hex), mover.fuel, mover.unitId));
    plans = inputs.map((input) => planHeuristicBotTurn(input, (entry) => entry.unit.unitId === mover.unitId));
  });
  await Then("hidden truth changes neither route costs nor tactical choices, while physical execution remains guarded", async () => {
    assert.ok(paths[0].has(axialKey(hidden.hex)), "The counterfactual must actually cover the hidden blocker.");
    assert.deepEqual(paths[1], paths[0]);
    assert.equal(plans[0].length, 1);
    assert.deepEqual(plans[1], plans[0]);
    assert.ok(plans[0][0].path.some((hex) => axialKey(hex) === axialKey(hidden.hex)), "The identical planned route must not secretly detour around the hidden unit.");
    assert.equal(hiddenEngine["canFactionEnterHex"](mover, "Bot", hidden.hex), false);
  });
});

registerTest("BOT_ATTACK_REJECTS_EXCESS_MOVEMENT_WITHOUT_CHANGING_STATE", async ({ Given, When, Then }) => {
  const bot = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 1, r: 0 }).unit, unitId: "spent-attacker" };
  const player = { ...createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 2, r: 0 }).unit, unitId: "spent-defender" };
  const engine = createHeuristicEngine([player], [bot]);
  const harness = engine as unknown as {
    botActionFlags: Map<string, { movementPointsUsed: number; attacksUsed: number; retaliationsUsed: number; isRushing: boolean }>;
    resolveBotAttack(unit: ScenarioUnit, from: Axial, to: Axial): unknown;
  };
  let before: ReturnType<GameEngine["serialize"]>;
  let result: unknown;
  await Given("a three-point-movement tank that has already spent two points", async () => {
    harness.botActionFlags.set("spent-attacker", { movementPointsUsed: 2, attacksUsed: 0, retaliationsUsed: 0, isRushing: false });
    before = engine.serialize();
  });
  await When("the real bot attack boundary is asked to fire anyway", async () => {
    result = harness.resolveBotAttack(engine.botUnits.find((unit) => unit.unitId === "spent-attacker")!, bot.hex, player.hex);
  });
  await Then("the same movement-before-fire limit as the player rejects it without any mutation", async () => {
    assert.equal(result, null);
    assert.deepEqual(engine.serialize(), before);
  });
});

registerTest("BOT_EXECUTION_PRESERVES_FULL_FRIENDLY_STACKS_WHILE_ROUTING_AROUND_THEM", async ({ Given, When, Then }) => {
  const mover = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 0 }).unit, unitId: "stack-mover" };
  const screen = createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 1, r: 0 }).unit;
  const target = createPlannerSnapshot("TestInfantry", playerInfantryDef, { q: 3, r: 0 }).unit;
  const engine = createHeuristicEngine([target], [mover, { ...screen, unitId: "screen-one" }, { ...screen, unitId: "screen-two" }]);
  let summary: ReturnType<GameEngine["executeBotActivation"]>;
  await Given("two friendly combat formations occupying the direct approach hex", async () => {});
  await When("a third formation receives a move-and-fight activation", async () => { summary = engine.executeBotActivation("stack-mover"); });
  await Then("the actual move avoids the full hex and leaves both stacked formations intact", async () => {
    summary.moves.forEach((move) => assert.equal(move.path.some((hex) => axialKey(hex) === "1,0"), false));
    assert.deepEqual(engine.botUnits.filter((unit) => axialKey(unit.hex) === "1,0").map((unit) => unit.unitId).sort(), ["screen-one", "screen-two"]);
    assert.equal(engine.botUnits.filter((unit) => unit.unitId === "stack-mover").length, 1);
  });
});

registerTest("BOT_TOWED_ATTACK_READINESS_REJECTS_MOVEMENT_BELOW_THE_NORMAL_FIRE_LIMIT", async ({ Given, When, Then }) => {
  const definition = { ...antiTankGunDef, movement: 4 };
  const gun = { ...createPlannerSnapshot("AT_Gun_50mm", definition, { q: 0, r: 0 }).unit, unitId: "moved-towed-gun", towState: "towed" as const };
  const target = createPlannerSnapshot("TestTank", playerTankDef, { q: 1, r: 0 }).unit;
  const engine = createHeuristicEngine([target], [gun], true, {
    unitTypes: { ...strikeUnitTypes, AT_Gun_50mm: definition } as UnitTypeDictionary
  });
  let before: ReturnType<GameEngine["serialize"]>;
  let result: unknown;
  await Given("a limbered gun that moved one point, below its normal two-point movement-before-fire limit", async () => {
    engine["botActionFlags"].set("moved-towed-gun", { movementPointsUsed: 1, attacksUsed: 0, retaliationsUsed: 0, isRushing: false });
    before = engine.serialize();
  });
  await When("the real attack boundary evaluates its shared tow readiness", async () => {
    result = engine["resolveBotAttack"](engine.botUnits.find((unit) => unit.unitId === gun.unitId)!, gun.hex, target.hex);
  });
  await Then("it refuses before deployment, damage or resource mutation", async () => {
    assert.equal(result, null);
    assert.deepEqual(engine.serialize(), before);
  });
});

registerTest("BOT_CONVENTIONAL_TURN_REPLANS_AFTER_EACH_COMMITTED_ACTION", async ({ Given, When, Then }) => {
  const first = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 0 }).unit, unitId: "first-attacker" };
  const second = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 1 }).unit, unitId: "second-attacker" };
  const target = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 2, r: 0 }).unit, unitId: "replan-target", ammo: 0 };
  const engine = createHeuristicEngine([target], [first, second]);
  const observations: string[][] = [];
  const harness = engine as unknown as {
    buildPlannerInputFor(...args: unknown[]): BotPlannerInput;
  };
  const originalBuilder = harness.buildPlannerInputFor.bind(engine);
  harness.buildPlannerInputFor = (...args: unknown[]): BotPlannerInput => {
    const input = originalBuilder(...args);
    observations.push(input.botUnits.map((snapshot) => `${snapshot.unit.unitId}@${axialKey(snapshot.unit.hex)}`));
    return input;
  };
  await Given("two tanks whose initial plans compete for a firing lane", async () => {});
  await When("a conventional enemy turn commits its actions", async () => { engine.endTurn(); });
  await Then("the second decision observes the first committed move and each stable formation fires at most once", async () => {
    assert.ok(observations.length >= 2, "One frozen plan list cannot account for changed occupancy and contacts.");
    assert.notDeepEqual(observations[0], observations[1]);
    const observedSummary = engine.peekBotTurnSummary();
    assert.ok(observedSummary);
    assert.notStrictEqual(observedSummary.moves, engine.peekBotTurnSummary()?.moves, "Mission observation must be detached from animation history.");
    const summary = engine.consumeBotTurnSummary();
    assert.ok(summary);
    assert.equal(summary.attacks.length, 2, "Both formations should exploit their legal firing opportunity.");
    assert.equal(engine.peekBotTurnSummary(), null);
    assert.equal(new Set(engine.botUnits.map((unit) => unit.unitId)).size, engine.botUnits.length);
    const actionFlags = engine.serialize().actionFlags?.Bot ?? [];
    for (const unitId of ["first-attacker", "second-attacker"]) {
      assert.equal(actionFlags.find(([id]) => id === unitId)?.[1].attacksUsed, 1);
    }
  });
});

registerTest("BOT_PRODUCTION_DIFFICULTIES_APPLY_LEGAL_REPRODUCIBLE_PRESSURE", async ({ Given, When, Then }) => {
  const bot = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r: 0 }).unit, unitId: "difficulty-attacker" };
  const target = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 2, r: 0 }).unit, unitId: "difficulty-target", ammo: 0 };
  const damageByDifficulty = new Map<string, number>();
  await Given("identical seeded tank engagements at Easy, Normal, and Hard", async () => {});
  await When("the real production planner and combat resolver commit each difficulty's activation twice from identical starts", async () => {
    for (const botDifficulty of ["Easy", "Normal", "Hard"] as const) {
      const runs: ReturnType<GameEngine["executeBotActivation"]>[] = [];
      for (let repeat = 0; repeat < 2; repeat += 1) {
        const engine = createHeuristicEngine([target], [bot], true, { botDifficulty });
        const result = engine.executeBotActivation("difficulty-attacker");
        assert.equal(result.attacks.length, 1, `${botDifficulty} must exploit the legal firing lane.`);
        assert.equal(result.moves.length, 1);
        assert.ok(result.moves[0].path.length <= 2, "No difficulty grants extra move-and-fire range.");
        assert.equal(engine.executeBotActivation("difficulty-attacker").attacks.length, 0);
        runs.push(result);
      }
      assert.deepEqual(runs[0], runs[1], `${botDifficulty} must replay deterministically.`);
      damageByDifficulty.set(botDifficulty, runs[0].attacks[0].inflictedDamage);
    }
  });
  await Then("all difficulties create actual pressure while Hard retains its authored stronger combat modifier", async () => {
    assert.ok(damageByDifficulty.get("Easy")! > 0);
    assert.ok(damageByDifficulty.get("Normal")! >= damageByDifficulty.get("Easy")!);
    assert.ok(damageByDifficulty.get("Hard")! >= damageByDifficulty.get("Normal")!);
  });
});

registerTest("BOT_CONVENTIONAL_REPLANNING_SCORES_ONLY_THE_NEXT_ACTOR_AFTER_INITIAL_RANKING", async ({ Given, When, Then }) => {
  const bots = Array.from({ length: 4 }, (_, r) => ({
    ...createPlannerSnapshot("TestTank", playerTankDef, { q: 0, r }).unit, unitId: `bounded-actor-${r}`
  }));
  const target = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 3, r: 1 }).unit, ammo: 0 };
  const engine = createHeuristicEngine([target], bots);
  const searchesPerDecision: number[] = [];
  const originalBuilder = engine["buildPlannerInputFor"].bind(engine);
  engine["buildPlannerInputFor"] = (...args): BotPlannerInput => {
    const input = originalBuilder(...args);
    const decisionIndex = searchesPerDecision.push(0) - 1;
    return { ...input, movementAllowance: (snapshot) => {
      searchesPerDecision[decisionIndex] += 1;
      return input.movementAllowance(snapshot);
    } };
  };
  await Given("four formations sharing a live battlefield whose first ranking determines activation order", async () => {});
  await When("the conventional turn replans after each committed action", async () => { engine.endTurn(); });
  await Then("it scores the army once, then exactly one fresh actor per decision instead of quadratic repeated army searches", async () => {
    assert.deepEqual(searchesPerDecision, [4, 1, 1, 1]);
    assert.equal(engine.botUnits.filter((unit) => unit.unitId?.startsWith("bounded-actor-")).length, 4);
  });
});

registerTest("BOT_TOWED_MOVEMENT_USES_PLAYER_TRANSPORT_COSTS_AND_PAYS_HOOKUP", async ({ Given, When, Then }) => {
  const gunDefinition: UnitTypeDefinition = { ...antiTankGunDef, movement: 4, rangeMax: 1, vision: 5 };
  const overrides = {
    unitTypes: { ...strikeUnitTypes, AT_Gun_50mm: gunDefinition } as UnitTypeDictionary,
    terrain: { ...terrain, plains: { ...plains, moveCost: { ...plains.moveCost, wheel: 3 } } } as TerrainDictionary
  };
  const gun = { ...createPlannerSnapshot("AT_Gun_50mm", gunDefinition, { q: 0, r: 0 }).unit, unitId: "tow-gun", towState: "deployed" as const };
  const enemy = { ...createPlannerSnapshot("TestTank", playerTankDef, { q: 3, r: 0 }).unit, unitId: "tow-target" };
  const botEngine = createHeuristicEngine([enemy], [gun], true, overrides);
  const playerEngine = createHeuristicEngine([gun], [enemy], true, overrides);
  let summary: ReturnType<GameEngine["executeBotActivation"]>;
  await Given("a deployed anti-tank gun where its wheel definition and limbered truck costs differ", async () => {});
  await When("the bot plans and commits its move and the player issues the equivalent tow-and-move order", async () => {
    summary = botEngine.executeBotActivation("tow-gun");
    assert.equal(summary.moves.length, 1, "The two-point transport lane must be planned after paying two-point hookup.");
    assert.equal(playerEngine.moveOutTowableUnit(gun.hex, "tow-gun"), true);
    playerEngine.moveUnit(gun.hex, summary.moves[0].to, "tow-gun");
  });
  await Then("both formations pay the same transport cost, preserve their identity and cannot move-and-fire", async () => {
    const botGun = botEngine.botUnits.find((unit) => unit.unitId === "tow-gun")!;
    const playerGun = playerEngine.playerUnits.find((unit) => unit.unitId === "tow-gun")!;
    assert.notDeepEqual(botGun.hex, gun.hex);
    assert.deepEqual(botGun.hex, playerGun.hex);
    assert.equal(botGun.movementCredit, playerGun.movementCredit);
    assert.equal(botGun.towState, "towed");
    assert.equal(summary.attacks.length, 0);
    const botFlags = botEngine.serialize().actionFlags?.Bot.find(([id]) => id === "tow-gun")?.[1];
    const playerFlags = playerEngine.serialize().actionFlags?.Player.find(([id]) => id === "tow-gun")?.[1];
    assert.equal(botFlags?.movementPointsUsed, playerFlags?.movementPointsUsed);
    assert.equal(botFlags?.movementPointsUsed, 2 + summary.moves[0].path.length - 1);
    assert.equal(botEngine.executeBotActivation("tow-gun").attacks.length, 0);
  });
});

registerTest("BOT_INITIATIVE_AUTOMATED_LOGISTICS_CANNOT_MOVE_WITHOUT_FUEL", async ({ Given, When, Then }) => {
  const truck = { ...createPlannerSnapshot("Supply_Truck", supplyTruckDef, { q: 0, r: 0 }).unit, unitId: "dry-convoy", fuel: 0 };
  const engine = createHeuristicEngine([truck], []);
  const integration = new GameEngineInitiativeMethods(engine);
  const harness = integration as unknown as { moveSingleHexToward(unit: ScenarioUnit, faction: "Player", target: Axial): boolean };
  let before: ReturnType<GameEngine["serialize"]>;
  let moved = true;
  await Given("a real automated player convoy with movement credit but empty fuel", async () => { before = engine.serialize(); });
  await When("the logistics activation requests a step toward its supply assignment", async () => {
    moved = harness.moveSingleHexToward(engine.playerUnits.find((unit) => unit.unitId === "dry-convoy")!, "Player", { q: 2, r: 0 });
  });
  await Then("it holds with position, fuel, credit, occupancy and action flags untouched", async () => {
    assert.equal(moved, false);
    assert.deepEqual(engine.serialize(), before);
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

  await Given("two bot bombers and two equally valuable artillery targets", async () => {
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
    const secondArtillery: ScenarioUnit = {
      type: "TestArtillery" as ScenarioUnit["type"],
      hex: { q: 4, r: 1 },
      strength: 100,
      experience: 0,
      ammo: 5,
      fuel: 0,
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
    engine = createHeuristicEngine([artillery, secondArtillery], [firstBomber, secondBomber]);
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

registerTest("BOT_ARTILLERY_HOLDS_WHEN_A_LONG_RANGE_TARGET_IS_NOT_YET_SERVICEABLE", async ({ Given, When, Then }) => {
  let plannedDestination = "";
  let plannedRationale = "";

  await Given("a safe artillery battery with a spotted enemy beyond its current firing solution", async () => {
    const artillery = createPlannerSnapshot("BotArtillery", playerArtilleryDef, { q: 0, r: 0 });
    const enemy = createPlannerSnapshot("PlayerInfantry", playerInfantryDef, { q: 6, r: 0 });
    const input: BotPlannerInput = {
      botUnits: [artillery],
      playerUnits: [enemy],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(artillery.unit.hex), "bot"],
        [axialKey(enemy.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 7 && hex.r >= 0 && hex.r <= 3,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: () => true,
      movementAllowance: () => 1,
      attackEstimator: () => null,
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input)[0];
    plannedDestination = plan ? axialKey(plan.destination) : "";
    plannedRationale = plan?.rationale ?? "";
  });

  await When("the planner considers staging and pressure movement", async () => {});

  await Then("the battery should preserve its long-range firing position instead of creeping forward", async () => {
    if (plannedDestination !== "0,0" || !plannedRationale.toLowerCase().includes("hold")) {
      throw new Error(`Expected artillery to hold at 0,0, received destination=${plannedDestination || "none"} rationale=${plannedRationale || "none"}.`);
    }
  });
});

registerTest("BOT_ARTILLERY_FIRES_FROM_ITS_CURRENT_HEX_INSTEAD_OF_MOVING_FOR_A_BETTER_SHOT", async ({ Given, When, Then }) => {
  let plannedDestination = "";
  let plannedTarget = "";

  await Given("a long-range battery that can fire now but would score more damage from a closer illegal move-and-fire hex", async () => {
    const artillery = createPlannerSnapshot("BotArtillery", playerArtilleryDef, { q: 0, r: 0 });
    const enemy = createPlannerSnapshot("PlayerInfantry", playerInfantryDef, { q: 4, r: 0 });
    const input: BotPlannerInput = {
      botUnits: [artillery],
      playerUnits: [enemy],
      objectives: [],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(artillery.unit.hex), "bot"],
        [axialKey(enemy.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 5 && hex.r >= 0 && hex.r <= 3,
        terrainAt: () => plains,
        movementCost: () => 1
      },
      losAllows: () => true,
      movementAllowance: () => 1,
      attackEstimator: (_attacker, attackerHex) => ({
        expectedDamage: attackerHex.q === 0 ? 8 : 30,
        expectedRetaliation: 0
      }),
      difficulty: "Normal"
    };

    const plan = planHeuristicBotTurn(input)[0];
    plannedDestination = plan ? axialKey(plan.destination) : "";
    plannedTarget = plan?.attackTarget ? axialKey(plan.attackTarget) : "";
  });

  await When("the planner ranks current and mobile firing candidates", async () => {});

  await Then("the legal long-range shot from the current hex should be selected", async () => {
    if (plannedDestination !== "0,0" || plannedTarget !== "4,0") {
      throw new Error(`Expected artillery to fire 0,0 -> 4,0, received destination=${plannedDestination || "none"} target=${plannedTarget || "none"}.`);
    }
  });
});

registerTest("BOT_PLANNER_ARMORED_ASSAULT_STAGES_OFF_ROAD_WHEN_A_TOWN_STRONGHOLD_IS_UNSUPPRESSED", async ({ Given, When, Then }) => {
  let plannedDestination = "";

  await Given("a tank choosing between the obvious road and a covered flank toward a fortified town objective", async () => {
    const botTank = createPlannerSnapshot("BotTank", playerTankDef, { q: 1, r: 1 });
    const botInfantry = createPlannerSnapshot("BotInfantry", playerInfantryDef, { q: 0, r: 1 });
    const playerObserver = createPlannerSnapshot("PlayerObserver", reconBikeDef, { q: 5, r: 2 });
    const playerGarrison = createPlannerSnapshot("PlayerGarrison", playerInfantryDef, { q: 4, r: 2 });
    const playerAtGun = createPlannerSnapshot("PlayerATGun", antiTankGunDef, { q: 4, r: 3 });
    const playerArtillery = createPlannerSnapshot("PlayerArtillery", playerArtilleryDef, { q: 6, r: 2 });

    const input: BotPlannerInput = {
      botUnits: [botTank, botInfantry],
      playerUnits: [playerObserver, playerGarrison, playerAtGun, playerArtillery],
      objectives: [{ hex: { q: 4, r: 2 }, owner: "Player", vp: 300 }],
      occupancy: new Map<string, "bot" | "player">([
        [axialKey(botTank.unit.hex), "bot"],
        [axialKey(botInfantry.unit.hex), "bot"],
        [axialKey(playerObserver.unit.hex), "player"],
        [axialKey(playerGarrison.unit.hex), "player"],
        [axialKey(playerAtGun.unit.hex), "player"],
        [axialKey(playerArtillery.unit.hex), "player"]
      ]),
      map: {
        inBounds: (hex) => hex.q >= 0 && hex.q <= 7 && hex.r >= 0 && hex.r <= 5,
        terrainAt: (hex) => axialKey(hex) === "1,2" ? woods : plains,
        movementCost: () => 1,
        featuresAt: (hex) => axialKey(hex) === "4,2" ? ["buildings"] : [],
        isRoad: (hex) => ["2,1", "3,1", "4,2"].includes(axialKey(hex)),
        hexModificationsAt: (hex) => axialKey(hex) === "4,2"
          ? [{ type: "fortifications", facing: "NW" } as never]
          : []
      },
      losAllows: (attackerHex, targetHex) => {
        const attackerKey = axialKey(attackerHex);
        const targetKey = axialKey(targetHex);
        if (attackerKey === "1,2" || targetKey === "1,2") {
          return false;
        }
        return true;
      },
      movementAllowance: (snapshot) => axialKey(snapshot.unit.hex) === "1,1" ? 1 : 0,
      attackEstimator: () => null,
      difficulty: "Hard"
    };

    const plan = planHeuristicBotTurn(input).find((candidate) => axialKey(candidate.origin) === "1,1");
    plannedDestination = plan ? axialKey(plan.destination) : "";
  });

  await When("the planner evaluates how to start the assault before the town fire-control network is suppressed", async () => {
    // Result captured during Given.
  });

  await Then("the tank should stage into the covered flank instead of using the obvious road", async () => {
    if (plannedDestination !== "1,2") {
      throw new Error(`Expected the tank to stage into covered lane 1,2, but planner chose ${plannedDestination || "no move"}.`);
    }
  });
});
