import { registerTest } from "./harness.js";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import { GameEngineInitiativeMethods } from "../src/game/GameEngineInitiativeIntegration";
import { unitTypesData } from "../src/data/unitSystem/derivedUnitTypes";
import { summarizeFormationStatus } from "../src/data/unitSystem/damagePackets";
import { createOffMapSupportAsset } from "../src/game/support/SupportAssetFactory";
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

const forest: TerrainDefinition = {
  moveCost: { leg: 2, wheel: 2, track: 2, air: 1 },
  defense: 4,
  accMod: -20,
  blocksLOS: true
};

const terrain: TerrainDictionary = { plains, forest } as unknown as TerrainDictionary;

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
  Supply_Truck: supplyTruckDef,
  Howitzer_105: unitTypesData.Howitzer_105,
  Bomber: unitTypesData.Bomber
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

function createEngine(
  playerUnits: ScenarioUnit[],
  botUnits: ScenarioUnit[] = [],
  initialSupportAssets?: GameEngineConfig["initialSupportAssets"],
  scenarioData: ScenarioData = scenario()
): GameEngine {
  const config: GameEngineConfig = {
    scenario: scenarioData,
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
    ...(initialSupportAssets !== undefined ? { initialSupportAssets } : {}),
    botStrategyMode: "Simple"
  };

  const engine = new GameEngine(config);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

registerTest("PARTIALLY_MOVED_UNIT_ONLY_HIGHLIGHTS_DESTINATIONS_WITHIN_REMAINING_BUDGET", async ({ Then }) => {
  const mover: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "E" as ScenarioUnit["facing"],
    unitId: "partial-mover"
  };
  const movementScenario = scenario();
  movementScenario.tiles[0] = [
    { tile: "plains" },
    { tile: "plains" },
    { tile: "forest" },
    { tile: "plains" },
    { tile: "plains" }
  ];
  movementScenario.tilePalette.forest = {
    terrain: "forest",
    terrainType: "rural",
    density: "average",
    features: ["trees"],
    recon: "intel"
  };

  const engine = createEngine([mover], [], undefined, movementScenario);
  engine.moveUnit({ q: 0, r: 0 }, { q: 1, r: 0 }, mover.unitId);

  const budget = engine.getMovementBudget({ q: 1, r: 0 }, mover.unitId);
  if (!budget || budget.remaining !== 1) {
    throw new Error(`Expected one movement point to remain after the first step, received ${JSON.stringify(budget)}.`);
  }

  const reachable = engine.getReachableHexes({ q: 1, r: 0 }, mover.unitId);
  if (reachable.some((hex) => hex.q === 2 && hex.r === 0)) {
    throw new Error("A two-point forest hex was highlighted after the unit had only one movement point remaining.");
  }

  await Then("movement highlights remain consistent with the authoritative remaining-movement check", () => {});
});

registerTest("CAMPAIGN_NGFS_ASSET_IS_REAL_USABLE_AND_SAVE_COMPLETE", async ({ Then }) => {
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
    type: "Supply_Truck" as unknown as ScenarioUnit["type"],
    hex: { q: 3, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 0,
    fuel: 60,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };
  const ngfs = createOffMapSupportAsset("shoreFireControlParty", "campaign-support-test");
  if (!ngfs) throw new Error("NGFS formation did not create an off-map support asset.");
  const engine = createEngine([observer], [enemy], [ngfs]);
  const ready = engine.getSupportSnapshot().ready;
  if (ready.length !== 1 || ready[0]?.id !== ngfs.id || ready[0]?.charges !== 2) {
    throw new Error("Campaign NGFS did not replace unrelated placeholder support assets.");
  }
  if (!engine.queueSupportActionFromUnit(observer.hex, ngfs.id, enemy.hex)) {
    throw new Error("A campaign-provided NGFS asset could not be called by an eligible observer.");
  }
  engine.endTurn();
  const afterFire = engine.supportAssets[0];
  if (afterFire?.charges !== 1 || engine.consumeSupportImpactEvents().length !== 1) {
    throw new Error("Campaign NGFS did not resolve one real fire mission and expend one charge.");
  }
  const serialized = engine.serialize();
  const hydrated = GameEngine.fromSerialized({
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side({ q: 0, r: 0 }, [observer]),
    botSide: side({ q: 4, r: 2 }, [enemy]),
    initialSupportAssets: [ngfs],
    botStrategyMode: "Simple"
  }, serialized);
  if (hydrated.supportAssets.length !== 1
    || hydrated.supportAssets[0]?.id !== ngfs.id
    || hydrated.supportAssets[0]?.charges !== 1) {
    throw new Error("Campaign NGFS identity or remaining charges were lost on tactical hydrate.");
  }

  await Then("campaign-provided naval fire support remains usable and save-complete", () => {});
});

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

  const attackableTargets = engine.getAttackableTargets(observer.hex);
  if (!attackableTargets.some((hex) => hex.q === enemy.hex.q && hex.r === enemy.hex.r)) {
    throw new Error(`Expected a fresh observer to retain direct-fire eligibility after calling artillery, received ${JSON.stringify(attackableTargets)}.`);
  }

  await Then("calling artillery leaves a fresh unit's attack available", () => {});
});

registerTest("ARTILLERY_QUEUE_ALLOWS_CALLER_AFTER_FULL_MOVEMENT", async ({ Then }) => {
  const observer: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"],
    unitId: "observer-a"
  };
  const enemy: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 4, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const engine = createEngine([observer], [enemy]);
  const firstMove = engine.moveUnit({ q: 0, r: 0 }, { q: 1, r: 0 });
  const secondMove = engine.moveUnit({ q: 1, r: 0 }, { q: 2, r: 0 });
  if (firstMove.to.q !== 1 || secondMove.to.q !== 2) {
    throw new Error("Expected observer to spend two movement points before queueing support.");
  }

  const supportAsset = engine.getSupportSnapshot().ready.find((asset) => asset.type === "artillery");
  if (!supportAsset) {
    throw new Error("Expected a ready artillery asset for movement-spend validation.");
  }

  const queued = engine.queueSupportActionFromUnit({ q: 2, r: 0 }, supportAsset.id, enemy.hex, observer.unitId);
  if (!queued) {
    throw new Error("Expected a unit to call artillery after spending its full movement allowance.");
  }

  const budgetAfterQueue = engine.getMovementBudget({ q: 2, r: 0 }, observer.unitId);
  if (!budgetAfterQueue || budgetAfterQueue.remaining !== 0) {
    throw new Error(`Expected calling artillery to preserve the fully-spent movement budget, received ${JSON.stringify(budgetAfterQueue)}.`);
  }

  await Then("artillery remains callable after moving and does not alter movement spend", () => {});
});

registerTest("QUEUED_ARTILLERY_SUPPORT_DAMAGE_USES_STATUS_POOLS", async ({ Then }) => {
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
    type: "Supply_Truck" as unknown as ScenarioUnit["type"],
    hex: { q: 3, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 0,
    fuel: 60,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const engine = createEngine([observer], [enemy]);
  const supportAsset = engine.getSupportSnapshot().ready.find((asset) => asset.type === "artillery");
  if (!supportAsset) {
    throw new Error("Expected a ready artillery support asset for status-pool damage validation.");
  }
  if (!engine.queueSupportActionFromUnit(observer.hex, supportAsset.id, enemy.hex)) {
    throw new Error("Expected observer to queue artillery support against the supply truck.");
  }

  engine.endTurn();
  const impact = engine.consumeSupportImpactEvents()[0];
  if (!impact || impact.damage <= 0 || impact.damage > (supportAsset.strikeDamageCap ?? 24)) {
    throw new Error(`Expected a capped nonzero support impact event, received ${JSON.stringify(impact)}.`);
  }

  const updatedEnemy = engine.botUnits.find((unit: ScenarioUnit) => unit.hex.q === enemy.hex.q && unit.hex.r === enemy.hex.r);
  if (!updatedEnemy) {
    throw new Error("Expected the support strike to damage, not remove, the supply truck in this guardrail scenario.");
  }
  const statusSummary = summarizeFormationStatus(updatedEnemy.status, updatedEnemy.strength);
  const derivedLoss = Math.round((100 - statusSummary.readiness) * 100) / 100;
  const personnelEvents = statusSummary.personnel.casualties;
  const equipmentEvents = statusSummary.equipment.damaged + statusSummary.equipment.disabled + statusSummary.equipment.destroyed;

  if (Math.abs(derivedLoss - impact.damage) > 0.01) {
    throw new Error(`Expected support impact damage to match status-derived readiness loss, event=${impact.damage}, derived=${derivedLoss}.`);
  }
  if (personnelEvents + equipmentEvents <= 0) {
    throw new Error(`Expected support impact to create detailed status effects, received ${JSON.stringify(statusSummary)}.`);
  }

  await Then("queued artillery support applies detailed personnel/equipment status damage", () => {});
});

registerTest("QUEUED_ARTILLERY_RESOLVES_WHEN_INITIATIVE_REACHES_THE_ARTILLERY_BAND", async ({ Then }) => {
  const observed = { resolutionCalls: 0, impactNotifications: 0 };
  const playerUnits: ScenarioUnit[] = [
    {
      type: "Infantry_42",
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NE",
      unitId: "initiative-observer"
    },
    {
      type: "Howitzer_105",
      hex: { q: 1, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 8,
      fuel: 20,
      entrench: 0,
      facing: "NE",
      unitId: "initiative-artillery"
    }
  ];
  const fakeEngine = {
    _turnNumber: 1,
    _phase: "playerTurn",
    _activeFaction: "Player",
    playerUnits,
    botUnits: [],
    allyUnits: [],
    resolveQueuedSupportActionsForInitiative: () => {
      observed.resolutionCalls += 1;
      return 1;
    }
  };
  const initiative = new GameEngineInitiativeMethods(fakeEngine);
  initiative.setSupportImpactListener(() => {
    observed.impactNotifications += 1;
  });

  const firstActivation = initiative.startNextInitiativeTurnPhase();
  if (firstActivation?.initiative !== 5 || observed.resolutionCalls !== 0) {
    throw new Error(`Expected support to remain queued during initiative 5, received activation=${JSON.stringify(firstActivation)} calls=${observed.resolutionCalls}.`);
  }

  initiative.completeUnitActivation(firstActivation.unitId);
  const artilleryActivation = initiative.getCurrentActivation();
  if (artilleryActivation?.initiative !== 2) {
    throw new Error(`Expected the next activation to enter artillery initiative 2, received ${JSON.stringify(artilleryActivation)}.`);
  }
  const finalResolutionCalls = Number(observed.resolutionCalls);
  const finalImpactNotifications = Number(observed.impactNotifications);
  if (finalResolutionCalls !== 1 || finalImpactNotifications !== 1) {
    throw new Error(`Expected one support resolution and impact notification at initiative 2, received calls=${observed.resolutionCalls} notifications=${observed.impactNotifications}.`);
  }

  await Then("off-map artillery lands once as the artillery initiative begins", () => {});
});
