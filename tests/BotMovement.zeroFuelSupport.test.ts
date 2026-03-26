import { registerTest } from "./harness";
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
  hardAttack: 2,
  softAttack: 8,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 60
};

const towGunDef: UnitTypeDefinition = {
  class: "specialist",
  combat: { category: "specialist", weight: "medium", role: "antiTank", signature: "medium" },
  movement: 2,
  moveType: "wheel",
  vision: 2,
  ammo: 5,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 3,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 10,
  softAttack: 4,
  ap: 6,
  accuracyBase: 55,
  traits: [],
  cost: 100
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
  TestPlayerInfantry: playerInfantryDef,
  TestTowGun: towGunDef,
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
  const tileKey = "plains";
  const row = Array.from({ length: 6 }, () => ({ tile: tileKey }));
  return {
    name: "Tow Gun Movement Regression",
    size: { cols: 6, rows: 6 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row, row, row, row],
    objectives: [],
    turnLimit: 6,
    sides: {
      Player: side({ q: 0, r: 0 }),
      Bot: side({ q: 5, r: 0 })
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
    botSide: side({ q: 5, r: 0 }, botUnits),
    botStrategyMode: "Simple"
  };
  const engine = new GameEngine(cfg);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

registerTest("BOT_TOW_GUNS_WITH_ZERO_FUEL_CAPACITY_CAN_STILL_ADVANCE", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot tow gun with zero fuel capacity facing a player battalion across open ground", async () => {
    const playerUnit: ScenarioUnit = {
      type: "TestPlayerInfantry" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const botTowGun: ScenarioUnit = {
      type: "TestTowGun" as ScenarioUnit["type"],
      hex: { q: 5, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 5,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    };
    engine = createEngine([playerUnit], [botTowGun]);
  });

  await When("the player ends the turn", async () => {
    engine.endTurn();
  });

  await Then("the bot tow gun advances instead of being pinned in place by a false zero-fuel limit", async () => {
    const [movedTowGun] = engine.botUnits;
    if (!movedTowGun) {
      throw new Error("Expected the bot tow gun to remain on the map.");
    }
    if (movedTowGun.hex.q === 5 && movedTowGun.hex.r === 0) {
      throw new Error("Expected the bot tow gun to move toward the player, but it stayed on its origin hex.");
    }
  });
});
