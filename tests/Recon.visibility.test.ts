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

const artilleryDef: UnitTypeDefinition = {
  class: "artillery",
  combat: { category: "artillery", weight: "medium", role: "antiInfantry", signature: "medium" },
  movement: 1,
  moveType: "wheel",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 2,
  rangeMax: 6,
  initiative: 2,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 10,
  softAttack: 20,
  ap: 3,
  accuracyBase: 60,
  traits: [],
  cost: 120
};

const reconDef: UnitTypeDefinition = {
  class: "recon",
  combat: { category: "recon", weight: "light", role: "normal", signature: "small" },
  movement: 5,
  moveType: "wheel",
  vision: 2,
  ammo: 3,
  fuel: 18,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 2,
  softAttack: 4,
  ap: 1,
  accuracyBase: 55,
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
  softAttack: 5,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 60
};

const unitTypes: UnitTypeDictionary = {
  TestHowitzer: artilleryDef,
  ScoutCar: reconDef,
  EnemyInfantry: infantryDef
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
    name: "Recon Visibility",
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
  const cfg: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side(
      { q: 0, r: 0 },
      playerUnits.map((unit) => ({ ...unit, preDeployed: true }))
    ),
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

function hasHex(hexes: readonly ScenarioUnit["hex"][], target: ScenarioUnit["hex"]): boolean {
  return hexes.some((hex) => hex.q === target.q && hex.r === target.r);
}

registerTest("RECON_HIDES_ENEMIES_UNTIL_SENSORS_FIX_THEM", async ({ Then }) => {
  const artillery: ScenarioUnit = {
    type: "TestHowitzer" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const recon: ScenarioUnit = {
    type: "ScoutCar" as unknown as ScenarioUnit["type"],
    hex: { q: 1, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 3,
    fuel: 18,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const enemy: ScenarioUnit = {
    type: "EnemyInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 4, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const blindEngine = createEngine([artillery], [enemy]);
  if (blindEngine.getEnemyContactSnapshot().length !== 0) {
    throw new Error("Expected enemy formations to stay hidden before recon or direct LOS fixes them.");
  }
  if (hasHex(blindEngine.getAttackableTargets(artillery.hex), enemy.hex)) {
    throw new Error("Expected hidden enemies to stay off the attackable target list.");
  }

  const reconEngine = createEngine([artillery, recon], [enemy]);
  const contacts = reconEngine.getEnemyContactSnapshot();
  if (contacts.length !== 1 || contacts[0]?.state !== "identified") {
    throw new Error(`Expected recon to identify the enemy contact, received ${JSON.stringify(contacts)}`);
  }
  if (!hasHex(reconEngine.getAttackableTargets(artillery.hex), enemy.hex)) {
    throw new Error("Expected artillery to receive a valid target once recon fixes the enemy position.");
  }

  const intel = reconEngine.getReconIntelSnapshot();
  if (!intel.intelBriefs.some((brief) => brief.id === "brief-recon-current")) {
    throw new Error("Expected the intelligence feed to include a live recon contact brief.");
  }

  await Then("recon gating keeps hidden enemies off the map until sensors fix them", () => {});
});

registerTest("RECON_CONTACTS_DEGRADE_TO_SPOTTED_WHEN_SENSORS_LOSE_THEM", async ({ Then }) => {
  const recon: ScenarioUnit = {
    type: "ScoutCar" as unknown as ScenarioUnit["type"],
    hex: { q: 1, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 3,
    fuel: 18,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const enemy: ScenarioUnit = {
    type: "EnemyInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 5, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const engine = createEngine([recon], [enemy]);
  const initial = engine.getEnemyContactSnapshot();
  if (initial.length !== 1 || initial[0]?.state !== "identified") {
    throw new Error(`Expected an identified recon contact before movement, received ${JSON.stringify(initial)}`);
  }

  engine.moveUnit(recon.hex, { q: 0, r: 3 });
  const degraded = engine.getEnemyContactSnapshot();
  if (degraded.length !== 1 || degraded[0]?.state !== "spotted") {
    throw new Error(`Expected the contact to degrade to spotted after recon pulled away, received ${JSON.stringify(degraded)}`);
  }
  if (degraded[0]?.unitType !== undefined) {
    throw new Error("Expected stale spotted contacts to hide exact unit type until recon reacquires them.");
  }

  await Then("contacts degrade to last-known plots when recon loses sight", () => {});
});
