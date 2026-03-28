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
  softAttack: 8,
  ap: 1,
  accuracyBase: 60,
  traits: ["zoc"],
  cost: 90
};

const supplyTruckDef: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "vehicle", weight: "medium", role: "support", signature: "medium" },
  movement: 3,
  moveType: "wheel",
  vision: 2,
  ammo: 0,
  fuel: 60,
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

const unitTypes: UnitTypeDictionary = {
  TestInfantry: infantryDef,
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
  const row = Array.from({ length: 5 }, () => ({ tile: tileKey }));
  return {
    name: "Artillery Support Tempo",
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

function createEngine(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[] = []): GameEngine {
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side(
      { q: 0, r: 0 },
      playerUnits.map((unit) => ({ ...unit, preDeployed: true }))
    ),
    botSide: side(
      { q: 4, r: 2 },
      botUnits.map((unit) => ({ ...unit, preDeployed: true }))
    ),
    botStrategyMode: "Simple"
  };

  const engine = new GameEngine(config);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

registerTest("QUEUED_ARTILLERY_DOES_NOT_CONSUME_THE_CALLER_ACTION_OR_RESET_MOVEMENT_ON_CANCEL", async ({ Then }) => {
  const observer: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const enemy: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 2, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const engine = createEngine([observer], [enemy]);
  const moved = engine.moveUnit({ q: 0, r: 0 }, { q: 1, r: 0 });
  if (!moved) {
    throw new Error("Expected observer infantry to spend one step repositioning before calling artillery.");
  }

  const observerHex = { q: 1, r: 0 };
  const beforeQueueBudget = engine.getMovementBudget(observerHex);
  if (!beforeQueueBudget || beforeQueueBudget.remaining !== 1) {
    throw new Error(`Expected observer to have 1 movement remaining after repositioning, received ${JSON.stringify(beforeQueueBudget)}.`);
  }
  const beforeQueueState = engine.getUnitCommandState(observerHex);
  if (!beforeQueueState) {
    throw new Error("Expected observer command state to exist before queueing artillery.");
  }

  const supportAsset = engine.getSupportSnapshot().ready.find((asset) => asset.type === "artillery");
  if (!supportAsset) {
    throw new Error("Expected a ready artillery support asset for the observer test.");
  }

  if (!engine.queueSupportActionFromUnit(observerHex, supportAsset.id, enemy.hex)) {
    throw new Error("Expected observer to queue heavy artillery after moving within the allowed observation tempo.");
  }

  const queuedBudget = engine.getMovementBudget(observerHex);
  if (!queuedBudget || queuedBudget.remaining !== 1) {
    throw new Error(`Expected queueing artillery to preserve movement state, received ${JSON.stringify(queuedBudget)}.`);
  }

  const queuedState = engine.getUnitCommandState(observerHex);
  if (!queuedState) {
    throw new Error("Expected observer command state to exist after queueing artillery.");
  }
  if (queuedState.canEnterSentry !== beforeQueueState.canEnterSentry || queuedState.sentryReason !== beforeQueueState.sentryReason) {
    throw new Error(`Expected queueing artillery to preserve the observer's command-state gating, received before=${JSON.stringify(beforeQueueState)} after=${JSON.stringify(queuedState)}.`);
  }

  if (!engine.cancelQueuedSupport(supportAsset.id)) {
    throw new Error("Expected queued artillery order to cancel cleanly.");
  }

  const afterCancelBudget = engine.getMovementBudget(observerHex);
  if (!afterCancelBudget || afterCancelBudget.remaining !== 1) {
    throw new Error(`Expected canceling artillery to preserve prior movement spend, received ${JSON.stringify(afterCancelBudget)}.`);
  }

  const afterCancelState = engine.getUnitCommandState(observerHex);
  if (!afterCancelState) {
    throw new Error("Expected observer command state to exist after canceling artillery.");
  }
  if (afterCancelState.canEnterSentry !== beforeQueueState.canEnterSentry || afterCancelState.sentryReason !== beforeQueueState.sentryReason) {
    throw new Error(`Expected canceling artillery to preserve the original command-state gating, received before=${JSON.stringify(beforeQueueState)} after=${JSON.stringify(afterCancelState)}.`);
  }

  await Then("queueing and canceling artillery preserves the caller's real action state", () => {});
});

registerTest("FRESH_UNITS_CAN_STILL_ATTACK_AFTER_CALLING_ARTILLERY", async ({ Then }) => {
  const observer: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const enemy: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const engine = createEngine([observer], [enemy]);
  const supportAsset = engine.getSupportSnapshot().ready.find((asset) => asset.type === "artillery");
  if (!supportAsset) {
    throw new Error("Expected a ready artillery support asset for the fresh observer test.");
  }

  if (!engine.queueSupportActionFromUnit(observer.hex, supportAsset.id, enemy.hex)) {
    throw new Error("Expected fresh observer to queue heavy artillery.");
  }

  const resolution = engine.attackUnit(observer.hex, enemy.hex, "suppressive");
  if (!resolution) {
    throw new Error("Expected a fresh observer to retain its direct-fire attack after calling artillery.");
  }

  await Then("calling artillery leaves a fresh unit's attack available", () => {});
});
