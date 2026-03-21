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
  softAttack: 8,
  ap: 1,
  accuracyBase: 60,
  traits: ["zoc"],
  cost: 90
};

const engineerDef: UnitTypeDefinition = {
  class: "specialist",
  movement: 2,
  moveType: "leg",
  vision: 2,
  ammo: 5,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 3,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 4,
  softAttack: 10,
  ap: 2,
  accuracyBase: 58,
  traits: ["engineer"],
  cost: 120
};

const unitTypes: UnitTypeDictionary = {
  TestInfantry: infantryDef,
  TestEngineer: engineerDef
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
  const row = Array.from({ length: 5 }, () => ({ tile: tileKey }));
  return {
    name: "Infantry Actions",
    size: { cols: 5, rows: 3 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row],
    objectives: [],
    turnLimit: 6,
    sides: {
      Player: side({ q: 0, r: 0 }),
      Bot: side({ q: 4, r: 2 })
    }
  } as unknown as ScenarioData;
}

function createEngine(playerUnits: ScenarioUnit[]): { engine: GameEngine; config: GameEngineConfig } {
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side(
      { q: 0, r: 0 },
      playerUnits.map((unit) => ({ ...unit, preDeployed: true }))
    ),
    botSide: side({ q: 4, r: 2 }, []),
    botStrategyMode: "Simple"
  };

  const engine = new GameEngine(config);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return { engine, config };
}

registerTest("INFANTRY_COMMAND_STATE_TRACKS_DIG_IN_AND_ENGINEER_FIELDWORKS", async ({ Then }) => {
  const infantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const engineer: ScenarioUnit = {
    type: "TestEngineer" as unknown as ScenarioUnit["type"],
    hex: { q: 1, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 5,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };

  const { engine, config } = createEngine([infantry, engineer]);

  const infantryCommand = engine.getUnitCommandState(infantry.hex);
  if (!infantryCommand?.canDigIn) {
    throw new Error(`Expected infantry to be able to dig in before acting, received ${JSON.stringify(infantryCommand)}`);
  }

  if (!engine.digInUnit(infantry.hex)) {
    throw new Error("Expected dig-in command to succeed for fresh infantry.");
  }

  const dugInState = engine.getUnitCommandState(infantry.hex);
  if (!dugInState || dugInState.entrenchment !== 1 || dugInState.canDigIn) {
    throw new Error(`Expected infantry to gain one entrenchment and consume the action, received ${JSON.stringify(dugInState)}`);
  }

  const engineerCommand = engine.getUnitCommandState(engineer.hex);
  if (!engineerCommand?.isEngineer || !engineerCommand.canBuildModification) {
    throw new Error(`Expected engineer to be ready for fieldworks, received ${JSON.stringify(engineerCommand)}`);
  }

  if (!engine.buildHexModification(engineer.hex, "fortifications")) {
    throw new Error("Expected engineer fortification command to succeed.");
  }

  const modifications = engine.getHexModificationSnapshots();
  if (modifications.length !== 1 || modifications[0]?.type !== "fortifications") {
    throw new Error(`Expected a fortification snapshot after building fieldworks, received ${JSON.stringify(modifications)}`);
  }

  const restored = GameEngine.fromSerialized(config, engine.serialize());
  const restoredModifications = restored.getHexModificationSnapshots();
  if (restoredModifications.length !== 1 || restoredModifications[0]?.type !== "fortifications") {
    throw new Error(`Expected engineer fieldworks to persist through serialization, received ${JSON.stringify(restoredModifications)}`);
  }

  await Then("infantry command state and engineer fieldworks stay aligned with engine rules", () => {});
});
