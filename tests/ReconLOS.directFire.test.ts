import { registerTest } from "./harness";
import { losClearAdvanced, type Lister } from "../src/core/LOS";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import type {
  Axial,
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

const hill: TerrainDefinition = {
  moveCost: { leg: 2, wheel: 3, track: 2, air: 1 },
  defense: 3,
  accMod: -16,
  blocksLOS: true
};

const terrain: TerrainDictionary = {
  plains,
  hill
} as unknown as TerrainDictionary;

const reconCarDef: UnitTypeDefinition = {
  class: "recon",
  combat: { category: "vehicle", weight: "light", role: "support", signature: "medium" },
  movement: 4,
  moveType: "wheel",
  vision: 4,
  ammo: 6,
  fuel: 40,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 4,
  armor: { front: 2, side: 1, top: 1 },
  hardAttack: 4,
  softAttack: 8,
  ap: 2,
  accuracyBase: 55,
  traits: [],
  cost: 90
};

const spotterInfantryDef: UnitTypeDefinition = {
  class: "infantry",
  combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
  movement: 3,
  moveType: "leg",
  vision: 3,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 3,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 2,
  softAttack: 8,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 60
};

const enemyInfantryDef: UnitTypeDefinition = {
  class: "infantry",
  combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
  movement: 3,
  moveType: "leg",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 3,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 2,
  softAttack: 8,
  ap: 1,
  accuracyBase: 50,
  traits: [],
  cost: 60
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

const unitTypes: UnitTypeDictionary = {
  TestReconCar: reconCarDef,
  TestSpotterInfantry: spotterInfantryDef,
  TestEnemyInfantry: enemyInfantryDef,
  Supply_Truck: supplyTruckDef
} as unknown as UnitTypeDictionary;

function side(hq = { q: 0, r: 0 }, units: ScenarioUnit[] = []): ScenarioSide {
  return {
    hq,
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units
  };
}

function scenario(): ScenarioData {
  const plainsTile = "plains";
  const hillTile = "hill";
  return {
    name: "Recon LOS Regression",
    size: { cols: 4, rows: 4 },
    tilePalette: {
      [plainsTile]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      },
      [hillTile]: {
        terrain: "hill",
        terrainType: "highland",
        density: "average",
        features: [],
        recon: "watch"
      }
    },
    tiles: [
      [{ tile: plainsTile }, { tile: plainsTile }, { tile: plainsTile }, { tile: plainsTile }],
      [{ tile: hillTile }, { tile: plainsTile }, { tile: plainsTile }, { tile: plainsTile }],
      [{ tile: plainsTile }, { tile: plainsTile }, { tile: plainsTile }, { tile: plainsTile }],
      [{ tile: plainsTile }, { tile: plainsTile }, { tile: plainsTile }, { tile: plainsTile }]
    ],
    objectives: [],
    turnLimit: 4,
    sides: {
      Player: side({ q: 0, r: 0 }),
      Bot: side({ q: 3, r: 0 })
    }
  } as unknown as ScenarioData;
}

function createEngine(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[]): GameEngine {
  const preDeployedPlayers = playerUnits.map((unit) => ({ ...unit, preDeployed: true }));
  const cfg: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side({ q: 0, r: 0 }, preDeployedPlayers),
    botSide: side({ q: 3, r: 0 }, botUnits),
    botStrategyMode: "Simple"
  };
  const engine = new GameEngine(cfg);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

registerTest("RECON_SPOTTING_CAN_PEEK_BUT_DIRECT_FIRE_CANNOT_SHOOT_THROUGH_SINGLE_BLOCKER", async ({ Given, When, Then }) => {
  const attackerHex = { q: 0, r: 0 };
  const targetHex = { q: 0, r: 2 };
  const lister: Lister = {
    terrainAt(hex) {
      if (hex.q === 0 && hex.r === 1) {
        return hill;
      }
      return plains;
    }
  };

  let spottingLOS = false;
  let directFireLOS = false;

  await Given("a recon vehicle looking through a single blocking hill hex", async () => {
    spottingLOS = losClearAdvanced({
      attackerClass: "recon",
      attackerHex,
      targetHex,
      isAttackerAir: false,
      lister,
      purpose: "spotting"
    });
    directFireLOS = losClearAdvanced({
      attackerClass: "recon",
      attackerHex,
      targetHex,
      isAttackerAir: false,
      lister,
      purpose: "direct-fire"
    });
  });

  await When("the engine evaluates observation versus a direct attack lane", async () => {
    // Values already captured above.
  });

  await Then("recon can still spot past the first blocker, but cannot fire through it directly", async () => {
    if (!spottingLOS) {
      throw new Error("Expected recon spotting LOS to remain available across a single blocking hex.");
    }
    if (directFireLOS) {
      throw new Error("Expected direct-fire LOS to fail when a single blocking hill sits between recon and target.");
    }
  });
});

registerTest("PLAYER_RECON_ATTACK_TARGETS_RESPECT_SELECTED_UNIT_DIRECT_FIRE_LOS", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let attackableTargets: Axial[] = [];
  let contactState: string | null = null;

  await Given("a recon car whose target is globally spotted by a nearby infantry observer", async () => {
    const reconCar: ScenarioUnit = {
      type: "TestReconCar" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 40,
      entrench: 0,
      facing: "N"
    };
    const playerSpotter: ScenarioUnit = {
      type: "TestSpotterInfantry" as ScenarioUnit["type"],
      hex: { q: 1, r: 1 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const defender: ScenarioUnit = {
      type: "TestEnemyInfantry" as ScenarioUnit["type"],
      hex: { q: 0, r: 2 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "S"
    };
    engine = createEngine([reconCar, playerSpotter], [defender]);
  });

  await When("the selected recon car asks for its attackable targets", async () => {
    contactState = (engine as any).getPlayerEnemyContactStateAtHex({ q: 0, r: 2 });
    attackableTargets = engine.getAttackableTargets({ q: 0, r: 0 });
  });

  await Then("the enemy can remain visible without becoming a legal direct-fire target through the hill", async () => {
    if (!contactState) {
      throw new Error("Expected the enemy to remain visible thanks to the nearby spotter.");
    }
    if (attackableTargets.some((hex) => hex.q === 0 && hex.r === 2)) {
      throw new Error("Expected the selected recon car to lose the shot because its own direct-fire LOS is blocked by the hill.");
    }
  });
});
