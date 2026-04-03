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

const engineerDef: UnitTypeDefinition = {
  class: "specialist",
  combat: { category: "specialist", weight: "light", role: "antiInfantry", signature: "small" },
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
  const row = Array.from({ length: 6 }, () => ({ tile: tileKey }));
  return {
    name: "Engineer Fieldworks",
    size: { cols: 6, rows: 4 },
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
    turnLimit: 6,
    sides: {
      Player: side({ q: 0, r: 0 }),
      Bot: side({ q: 5, r: 3 })
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
    botSide: side({ q: 5, r: 3 }),
    botStrategyMode: "Simple"
  };

  const engine = new GameEngine(config);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return { engine, config };
}

registerTest("ENGINEERS_CAN_BUILD_QUICK_FIELDWORKS_AFTER_MOVING_AND_END_TURN", async ({ Then }) => {
  const engineerTemplate: ScenarioUnit = {
    type: "TestEngineer" as unknown as ScenarioUnit["type"],
    hex: { q: 1, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 5,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };

  for (const [type, destination] of [
    ["tankTraps", { q: 2, r: 1 }],
    ["clearedPath", { q: 2, r: 2 }]
  ] as const) {
    const { engine } = createEngine([structuredClone(engineerTemplate)]);
    engine.moveUnit(engineerTemplate.hex, destination);

    const afterMoveState = engine.getUnitCommandState(destination);
    if (!afterMoveState?.canBuildModification || !afterMoveState.buildModificationAvailability[type].available) {
      throw new Error(
        `Expected ${type} to remain available after movement, received ${JSON.stringify(afterMoveState)}.`
      );
    }
    if (afterMoveState.buildModificationAvailability.fortifications.available) {
      throw new Error(
        `Expected fortifications to stay blocked after movement while ${type} remains available, received ${JSON.stringify(afterMoveState)}.`
      );
    }

    if (!engine.buildHexModification(destination, type)) {
      throw new Error(`Expected engineer to build ${type} after moving.`);
    }

    const afterBuildState = engine.getUnitCommandState(destination);
    if (!afterBuildState || afterBuildState.canBuildModification || afterBuildState.canEnterSentry) {
      throw new Error(`Expected ${type} to consume the engineer's remaining turn, received ${JSON.stringify(afterBuildState)}.`);
    }

    const movementBudget = engine.getMovementBudget(destination);
    if (!movementBudget || movementBudget.remaining !== 0) {
      throw new Error(`Expected ${type} to consume remaining movement, received ${JSON.stringify(movementBudget)}.`);
    }
  }

  await Then("engineers can move, lay quick fieldworks, and then finish their turn", () => {});
});
