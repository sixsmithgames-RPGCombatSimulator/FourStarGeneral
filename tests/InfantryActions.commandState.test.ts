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

const shockInfantryDef: UnitTypeDefinition = {
  class: "infantry",
  combat: { category: "infantry", weight: "medium", role: "antiInfantry", signature: "medium" },
  movement: 2,
  moveType: "leg",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 0, side: 0, top: 0 },
  hardAttack: 4,
  softAttack: 18,
  ap: 2,
  accuracyBase: 85,
  traits: ["zoc"],
  cost: 140
};

const retaliationDummyDef: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "vehicle", weight: "heavy", role: "support", signature: "large" },
  movement: 3,
  moveType: "wheel",
  vision: 2,
  ammo: 6,
  fuel: 40,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 1,
  armor: { front: 12, side: 12, top: 10 },
  hardAttack: 1,
  softAttack: 1,
  ap: 1,
  accuracyBase: 15,
  traits: [],
  cost: 60
};

const towedGunDef: UnitTypeDefinition = {
  class: "specialist",
  combat: { category: "specialist", weight: "medium", role: "antiTank", signature: "medium" },
  movement: 2,
  moveType: "wheel",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 2,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 12,
  softAttack: 3,
  ap: 6,
  accuracyBase: 55,
  traits: [],
  cost: 110
};

const wheeledReconDef: UnitTypeDefinition = {
  class: "recon",
  combat: { category: "recon", weight: "light", role: "normal", signature: "small" },
  movement: 5,
  moveType: "wheel",
  vision: 3,
  ammo: 4,
  fuel: 40,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 2,
  softAttack: 6,
  ap: 1,
  accuracyBase: 56,
  traits: [],
  cost: 100
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
  TestEngineer: engineerDef,
  TestShockInfantry: shockInfantryDef,
  TestRetaliationDummy: retaliationDummyDef,
  AT_Gun_50mm: towedGunDef,
  TestReconTruck: wheeledReconDef,
  Recon_Bike: wheeledReconDef,
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

function createEngine(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[] = []): { engine: GameEngine; config: GameEngineConfig } {
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
  const dugInMovement = engine.getMovementBudget(infantry.hex);
  if (!dugInMovement || dugInMovement.remaining !== 0) {
    throw new Error(`Expected dig-in to consume remaining movement, received ${JSON.stringify(dugInMovement)}`);
  }

  const engineerCommand = engine.getUnitCommandState(engineer.hex);
  if (!engineerCommand?.isEngineer || !engineerCommand.canBuildModification) {
    throw new Error(`Expected engineer to be ready for fieldworks, received ${JSON.stringify(engineerCommand)}`);
  }

  if (!engine.buildHexModification(engineer.hex, "fortifications", "SE")) {
    throw new Error("Expected engineer fortification command to succeed.");
  }

  const modifications = engine.getHexModificationSnapshots();
  if (modifications.length !== 1 || modifications[0]?.type !== "fortifications" || modifications[0]?.facing !== "SE") {
    throw new Error(`Expected a fortification snapshot after building fieldworks, received ${JSON.stringify(modifications)}`);
  }
  const engineerMovement = engine.getMovementBudget(engineer.hex);
  if (!engineerMovement || engineerMovement.remaining !== 0) {
    throw new Error(`Expected engineer fieldworks to consume remaining movement, received ${JSON.stringify(engineerMovement)}`);
  }

  const restored = GameEngine.fromSerialized(config, engine.serialize());
  const restoredModifications = restored.getHexModificationSnapshots();
  if (restoredModifications.length !== 1 || restoredModifications[0]?.type !== "fortifications" || restoredModifications[0]?.facing !== "SE") {
    throw new Error(`Expected engineer fieldworks to persist through serialization, received ${JSON.stringify(restoredModifications)}`);
  }

  await Then("infantry command state and engineer fieldworks stay aligned with engine rules", () => {});
});

registerTest("WHEELED_RECON_UNITS_CANNOT_DIG_IN", async ({ Then }) => {
  const reconTruck: ScenarioUnit = {
    type: "TestReconTruck" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 4,
    fuel: 40,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([reconTruck]);
  const commandState = engine.getUnitCommandState(reconTruck.hex);
  if (!commandState) {
    throw new Error("Expected recon truck command state to be available.");
  }
  if (commandState.canDigIn) {
    throw new Error(`Expected wheeled recon to be blocked from digging in, received ${JSON.stringify(commandState)}`);
  }
  if (engine.digInUnit(reconTruck.hex)) {
    throw new Error("Expected dig-in command to fail for wheeled recon.");
  }

  await Then("vehicle recon formations are excluded from dig-in commands", () => {});
});

registerTest("ENGINEERS_CAN_STACK_FORTIFICATIONS_ACROSS_MULTIPLE_HEX_EDGES", async ({ Then }) => {
  const engineerA: ScenarioUnit = {
    type: "TestEngineer" as unknown as ScenarioUnit["type"],
    unitId: "eng-a",
    hex: { q: 1, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 5,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const engineerB: ScenarioUnit = {
    type: "TestEngineer" as unknown as ScenarioUnit["type"],
    unitId: "eng-b",
    hex: { q: 1, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 5,
    fuel: 0,
    entrench: 0,
    facing: "SE" as ScenarioUnit["facing"]
  };

  const { engine, config } = createEngine([engineerA, engineerB]);

  if (!engine.buildHexModification(engineerA.hex, "fortifications", "SE", engineerA.unitId)) {
    throw new Error("Expected first engineer to fortify the SE edge.");
  }
  if (!engine.buildHexModification(engineerB.hex, "fortifications", "E", engineerB.unitId)) {
    throw new Error("Expected second engineer to fortify the E edge on the same hex.");
  }
  if (engine.buildHexModification(engineerB.hex, "fortifications", "SE", engineerB.unitId)) {
    throw new Error("Expected duplicate fortification on the same edge to be rejected.");
  }

  const commandState = engine.getUnitCommandState(engineerA.hex, engineerA.unitId);
  if (!commandState) {
    throw new Error("Expected engineer command state to remain available.");
  }
  if (commandState.existingHexModifications.length !== 2) {
    throw new Error(`Expected command state to expose two fortified edges, received ${JSON.stringify(commandState.existingHexModifications)}.`);
  }

  const modifications = engine.getHexModificationSnapshots()
    .filter((modification) => modification.type === "fortifications")
    .sort((left, right) => String(left.facing).localeCompare(String(right.facing)));
  if (modifications.length !== 2 || modifications[0]?.facing !== "E" || modifications[1]?.facing !== "SE") {
    throw new Error(`Expected two fortification snapshots on distinct edges, received ${JSON.stringify(modifications)}.`);
  }

  const restored = GameEngine.fromSerialized(config, engine.serialize());
  const restoredModifications = restored.getHexModificationSnapshots()
    .filter((modification) => modification.type === "fortifications")
    .sort((left, right) => String(left.facing).localeCompare(String(right.facing)));
  if (restoredModifications.length !== 2 || restoredModifications[0]?.facing !== "E" || restoredModifications[1]?.facing !== "SE") {
    throw new Error(`Expected stacked fortifications to persist through serialization, received ${JSON.stringify(restoredModifications)}.`);
  }

  await Then("fortifications can stack across multiple edges on the same hex", () => {});
});

registerTest("STACKED_UNITS_KEEP_ENTRENCHMENT_UNTIL_THEY_MOVE_OFF_HEX", async ({ Then }) => {
  const entrenchedInfantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    unitId: "stack-alpha",
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const stackedWingman: ScenarioUnit = {
    type: "TestShockInfantry" as unknown as ScenarioUnit["type"],
    unitId: "stack-bravo",
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SE" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([entrenchedInfantry, stackedWingman]);

  if (!engine.digInUnit(entrenchedInfantry.hex, entrenchedInfantry.unitId)) {
    throw new Error("Expected the primary stacked infantry unit to dig in successfully.");
  }

  const beforeTurnAdvance = engine.getHexStackMembers(entrenchedInfantry.hex, "Player");
  const entrenchedBeforeTurn = beforeTurnAdvance.find((entry) => entry.unitId === entrenchedInfantry.unitId)?.unit.entrench ?? -1;
  if (entrenchedBeforeTurn !== 1) {
    throw new Error(`Expected entrenched unit to hold level 1 before turn advance, received ${entrenchedBeforeTurn}.`);
  }

  engine.endTurn();

  const afterTurnAdvance = engine.getHexStackMembers(entrenchedInfantry.hex, "Player");
  const entrenchedAfterTurn = afterTurnAdvance.find((entry) => entry.unitId === entrenchedInfantry.unitId)?.unit.entrench ?? -1;
  const wingmanEntrench = afterTurnAdvance.find((entry) => entry.unitId === stackedWingman.unitId)?.unit.entrench ?? -1;
  if (entrenchedAfterTurn !== 1) {
    throw new Error(`Expected entrenched stacked unit to keep entrenchment until it moves, received ${entrenchedAfterTurn}.`);
  }
  if (wingmanEntrench !== 0) {
    throw new Error(`Expected the unentrenched stacked unit to remain at entrenchment 0, received ${wingmanEntrench}.`);
  }

  await Then("stacking no longer wipes entrenchment off the unit that dug in", () => {});
});

registerTest("RECON_BIKES_CAN_ASSAULT_BUT_CANNOT_DIG_IN", async ({ Then }) => {
  const reconBike: ScenarioUnit = {
    type: "Recon_Bike" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 4,
    fuel: 40,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const enemyInfantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([reconBike], [enemyInfantry]);
  const commandState = engine.getUnitCommandState(reconBike.hex);
  if (!commandState) {
    throw new Error("Expected recon bike command state to be available.");
  }
  if (commandState.canDigIn) {
    throw new Error("Expected recon bikes to remain excluded from dig-in.");
  }

  const suppressive = engine.previewAttack(reconBike.hex, enemyInfantry.hex, "suppressive");
  const assault = engine.previewAttack(reconBike.hex, enemyInfantry.hex, "assault");
  if (!suppressive || !assault) {
    throw new Error("Expected both suppressive and assault previews to be available for recon bikes.");
  }
  if (assault.finalExpectedDamage <= suppressive.finalExpectedDamage) {
    throw new Error(
      `Expected assault to materially improve recon bike damage. Saw suppressive=${suppressive.finalExpectedDamage}, assault=${assault.finalExpectedDamage}.`
    );
  }

  const resolution = engine.attackUnit(reconBike.hex, enemyInfantry.hex, "assault");
  if (!resolution) {
    throw new Error("Expected recon bike assault attack to resolve.");
  }

  await Then("recon bikes can launch assault fire without regaining dig-in rights", () => {});
});

registerTest("UNIT_FACING_UPDATES_AFTER_MOVEMENT_AND_ATTACK", async ({ Then }) => {
  const infantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NW" as ScenarioUnit["facing"]
  };
  const enemyInfantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 2, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NW" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([infantry], [enemyInfantry]);

  engine.moveUnit({ q: 0, r: 0 }, { q: 1, r: 0 });
  const movedUnit = engine.getPlayerPlacementsSnapshot().find((unit) => unit.hex.q === 1 && unit.hex.r === 0);
  if (!movedUnit || movedUnit.facing !== "SE") {
    throw new Error(`Expected moved infantry to face its movement direction, received ${JSON.stringify(movedUnit)}`);
  }

  const result = engine.attackUnit({ q: 1, r: 0 }, { q: 2, r: 0 }, "suppressive");
  if (!result) {
    throw new Error("Expected follow-on attack to resolve after movement.");
  }

  const attackerAfter = engine.getPlayerPlacementsSnapshot().find((unit) => unit.hex.q === 1 && unit.hex.r === 0);
  const defenderAfter = engine.botUnits.find((unit) => unit.hex.q === 2 && unit.hex.r === 0);
  if (!attackerAfter || attackerAfter.facing !== "SE") {
    throw new Error(`Expected attacker to face the unit it attacked, received ${JSON.stringify(attackerAfter)}`);
  }
  if (defenderAfter && defenderAfter.facing !== "NW") {
    throw new Error(`Expected defender to turn toward the attacker, received ${JSON.stringify(defenderAfter)}`);
  }

  await Then("movement and combat both persist facing updates onto the units", () => {});
});

registerTest("DIG_IN_ENTRENCHMENT_PERSISTS_THROUGH_TURN_CYCLE", async ({ Then }) => {
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

  const { engine, config } = createEngine([infantry]);
  if (!engine.digInUnit(infantry.hex)) {
    throw new Error("Expected dig-in command to succeed before turn rollover.");
  }

  engine.endTurn();

  const liveUnit = engine.getPlayerPlacementsSnapshot().find((unit) => unit.hex.q === 0 && unit.hex.r === 0);
  if (!liveUnit || liveUnit.entrench !== 1) {
    throw new Error(`Expected entrenchment to survive the turn cycle, received ${JSON.stringify(liveUnit)}`);
  }

  const restored = GameEngine.fromSerialized(config, engine.serialize());
  const restoredUnit = restored.getPlayerPlacementsSnapshot().find((unit) => unit.hex.q === 0 && unit.hex.r === 0);
  if (!restoredUnit || restoredUnit.entrench !== 1) {
    throw new Error(`Expected entrenchment to survive serialization, received ${JSON.stringify(restoredUnit)}`);
  }

  await Then("dig-in entrenchment persists through upkeep and save-load", () => {});
});

registerTest("MOVING_OFF_AN_ENTRENCHED_HEX_CLEARS_ENTRENCHMENT_IMMEDIATELY", async ({ Then }) => {
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

  const { engine } = createEngine([infantry]);
  if (!engine.digInUnit(infantry.hex)) {
    throw new Error("Expected dig-in command to succeed before movement.");
  }

  engine.endTurn();
  const moved = engine.moveUnit({ q: 0, r: 0 }, { q: 1, r: 0 });
  if (moved.unit.entrench !== 0) {
    throw new Error(`Expected movement to clear entrenchment immediately, received ${JSON.stringify(moved.unit)}`);
  }

  const movedUnit = engine.getPlayerPlacementsSnapshot().find((unit) => unit.hex.q === 1 && unit.hex.r === 0);
  if (!movedUnit || movedUnit.entrench !== 0) {
    throw new Error(`Expected moved unit to have no entrenchment after leaving the hex, received ${JSON.stringify(movedUnit)}`);
  }

  await Then("moving to a different hex strips the previous entrenchment completely", () => {});
});

registerTest("SUPPRESSED_AND_PINNED_INFANTRY_RESPECT_MOVEMENT_AND_ASSAULT_RULES", async ({ Then }) => {
  const movingInfantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };

  const { engine: suppressedMoveEngine } = createEngine([movingInfantry]);
  const suppressedMoveState = suppressedMoveEngine.serialize();
  suppressedMoveState.playerPlacements[0] = {
    ...suppressedMoveState.playerPlacements[0],
    suppressedBy: ["enemy_1"]
  };
  suppressedMoveEngine.hydrateFromSerialized(suppressedMoveState);
  const moved = suppressedMoveEngine.moveUnit({ q: 0, r: 0 }, { q: 1, r: 0 });
  if (moved.unit.hex.q !== 1 || moved.unit.hex.r !== 0) {
    throw new Error(`Expected suppressed infantry to move successfully, received ${JSON.stringify(moved)}`);
  }

  const attackingInfantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const targetInfantry: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const { engine: suppressedAttackEngine } = createEngine([attackingInfantry], [targetInfantry]);
  const suppressedAttackState = suppressedAttackEngine.serialize();
  suppressedAttackState.playerPlacements[0] = {
    ...suppressedAttackState.playerPlacements[0],
    suppressedBy: ["enemy_1"]
  };
  suppressedAttackEngine.hydrateFromSerialized(suppressedAttackState);
  let assaultBlocked = false;
  try {
    suppressedAttackEngine.attackUnit({ q: 0, r: 0 }, { q: 0, r: 1 }, "assault");
  } catch (error) {
    assaultBlocked = String(error).includes("cannot initiate assault fire");
  }
  if (!assaultBlocked) {
    throw new Error("Expected suppressed infantry to be blocked from assault fire.");
  }

  const { engine: pinnedMoveEngine } = createEngine([movingInfantry]);
  const pinnedMoveState = pinnedMoveEngine.serialize();
  pinnedMoveState.playerPlacements[0] = {
    ...pinnedMoveState.playerPlacements[0],
    suppressedBy: ["enemy_1", "enemy_2"]
  };
  pinnedMoveEngine.hydrateFromSerialized(pinnedMoveState);
  let pinnedMoveBlocked = false;
  try {
    pinnedMoveEngine.moveUnit({ q: 0, r: 0 }, { q: 1, r: 0 });
  } catch (error) {
    pinnedMoveBlocked = String(error).includes("cannot move");
  }
  if (!pinnedMoveBlocked) {
    throw new Error("Expected pinned infantry to be blocked from movement.");
  }

  await Then("suppression still allows movement while pinning halts movement and assault", () => {});
});

registerTest("PINNED_DEFENDERS_LOSE_RETALIATION_OPPORTUNITY", async ({ Then }) => {
  const attacker: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const defender: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([attacker], [defender]);
  const state = engine.serialize();
  state.botPlacements[0] = {
    ...state.botPlacements[0],
    suppressedBy: ["existing_suppressor"]
  };
  engine.hydrateFromSerialized(state);

  const resolution = engine.attackUnit({ q: 0, r: 0 }, { q: 0, r: 1 }, "suppressive");
  if (!resolution) {
    throw new Error("Expected suppressive attack resolution to be available.");
  }
  if (resolution.retaliationOccurred) {
    throw new Error(`Expected pinned defender to lose retaliation opportunity, received ${JSON.stringify(resolution)}`);
  }

  await Then("a defender pinned by suppressive fire cannot retaliate", () => {});
});

registerTest("BOT_ATTACK_SUMMARY_INCLUDES_PLAYER_RETALIATION", async ({ Then }) => {
  const defender: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const attacker: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([defender], [attacker]);
  const botAttack = (engine as any).resolveBotAttack(attacker, { q: 0, r: 1 }, { q: 0, r: 0 }, "suppressive");
  if (!botAttack?.retaliation || botAttack.retaliation.damage <= 0) {
    throw new Error(`Expected bot attack summary to include player retaliation, received ${JSON.stringify(botAttack)}`);
  }

  await Then("bot summaries surface player counter-fire for animation playback", () => {});
});

registerTest("PLAYER_DEFENDER_RETALIATES_ONCE_PER_TURN_AND_SPENDS_AMMO", async ({ Then }) => {
  const defender: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 1, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const attackers: ScenarioUnit[] = [
    { type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"], hex: { q: 1, r: 0 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "SE" as ScenarioUnit["facing"] },
    { type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"], hex: { q: 2, r: 0 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "SW" as ScenarioUnit["facing"] }
  ];

  const { engine } = createEngine([defender], attackers);

  for (let index = 0; index < attackers.length; index += 1) {
    const attacker = attackers[index];
    const botAttack = (engine as any).resolveBotAttack(attacker, attacker.hex, defender.hex);
    if (!botAttack) {
      throw new Error(`Expected bot attack ${index + 1} to resolve.`);
    }

    const defenderAfter = engine.getPlayerPlacementsSnapshot().find((unit: ScenarioUnit) => unit.hex.q === defender.hex.q && unit.hex.r === defender.hex.r);
    const expectedAmmo = index === 0 ? 5 : 5;
    if (defenderAfter?.ammo !== expectedAmmo) {
      throw new Error(`Expected defender ammo to be ${expectedAmmo} after attack ${index + 1}, received ${defenderAfter?.ammo ?? "<missing>"}.`);
    }

    if (index === 0) {
      if (!botAttack.retaliation || botAttack.retaliation.damage <= 0) {
        throw new Error(`Expected retaliation ${index + 1} to occur with damage, received ${JSON.stringify(botAttack)}`);
      }
    } else if (botAttack.retaliation) {
      throw new Error(`Expected second attack to find no retaliation after the once-per-turn counterfire was spent, received ${JSON.stringify(botAttack)}`);
    }
  }

  await Then("a defending unit can answer one attack and then stops until its next activation", () => {});
});

registerTest("SENTRY_DEFENDER_RETALIATES_TWICE_PER_TURN_AND_SPENDS_AMMO", async ({ Then }) => {
  const defender: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 1, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const attackers: ScenarioUnit[] = [
    { type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"], hex: { q: 1, r: 0 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "SE" as ScenarioUnit["facing"] },
    { type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"], hex: { q: 2, r: 0 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "SW" as ScenarioUnit["facing"] },
    { type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"], hex: { q: 2, r: 1 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "NW" as ScenarioUnit["facing"] }
  ];

  const { engine } = createEngine([defender], attackers);
  if (!engine.enterSentry(defender.hex)) {
    throw new Error("Expected defender to enter sentry before bot attacks.");
  }

  for (let index = 0; index < attackers.length; index += 1) {
    const attacker = attackers[index];
    const botAttack = (engine as any).resolveBotAttack(attacker, attacker.hex, defender.hex);
    if (!botAttack) {
      throw new Error(`Expected bot attack ${index + 1} to resolve.`);
    }

    const defenderAfter = engine.getPlayerPlacementsSnapshot().find((unit: ScenarioUnit) => unit.hex.q === defender.hex.q && unit.hex.r === defender.hex.r);
    const expectedAmmo = Math.max(4, 6 - Math.min(index + 1, 2));
    if (defenderAfter?.ammo !== expectedAmmo) {
      throw new Error(`Expected sentry defender ammo to be ${expectedAmmo} after attack ${index + 1}, received ${defenderAfter?.ammo ?? "<missing>"}.`);
    }

    if (index < 2) {
      if (!botAttack.retaliation || botAttack.retaliation.damage <= 0) {
        throw new Error(`Expected sentry retaliation ${index + 1} to occur with damage, received ${JSON.stringify(botAttack)}`);
      }
    } else if (botAttack.retaliation) {
      throw new Error(`Expected third attack to find no retaliation after both sentry counterfires were spent, received ${JSON.stringify(botAttack)}`);
    }
  }

  await Then("a sentry defending unit can answer two attacks and then stops until its next activation", () => {});
});

registerTest("SENTRY_COMMITS_A_UNIT_UNTIL_ITS_NEXT_ACTIVATION", async ({ Then }) => {
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

  const { engine } = createEngine([infantry]);
  const readyState = engine.getUnitCommandState(infantry.hex);
  if (!readyState?.canEnterSentry) {
    throw new Error(`Expected infantry to be able to enter sentry before acting, received ${JSON.stringify(readyState)}`);
  }

  if (!engine.enterSentry(infantry.hex)) {
    throw new Error("Expected sentry command to succeed for a fresh infantry unit.");
  }

  const sentryState = engine.getUnitCommandState(infantry.hex);
  if (!sentryState?.isOnSentry || sentryState.canEnterSentry) {
    throw new Error(`Expected sentry state to be active and consumed, received ${JSON.stringify(sentryState)}`);
  }

  const sentryMovement = engine.getMovementBudget(infantry.hex);
  if (!sentryMovement || sentryMovement.remaining !== 0) {
    throw new Error(`Expected sentry to consume remaining movement, received ${JSON.stringify(sentryMovement)}`);
  }

  engine.endTurn();

  const refreshedState = engine.getUnitCommandState(infantry.hex);
  if (!refreshedState || refreshedState.isOnSentry || !refreshedState.canEnterSentry) {
    throw new Error(`Expected sentry to clear at the unit's next activation, received ${JSON.stringify(refreshedState)}`);
  }

  await Then("sentry consumes the current turn and expires on the next activation", () => {});
});

registerTest("SENTRY_DEFENDERS_RETURN_FIRE_SIMULTANEOUSLY_DURING_BOT_ATTACKS", async ({ Then }) => {
  const defender: ScenarioUnit = {
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 10,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const attacker: ScenarioUnit = {
    type: "TestShockInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([defender], [attacker]);
  if (!engine.enterSentry(defender.hex)) {
    throw new Error("Expected defending infantry to enter sentry before the bot attack.");
  }

  const botAttack = (engine as any).resolveBotAttack(attacker, { q: 0, r: 1 }, { q: 0, r: 0 });
  if (!botAttack?.defenderDestroyed) {
    throw new Error(`Expected the sentry defender to be destroyed by the stronger bot attack, received ${JSON.stringify(botAttack)}`);
  }
  if (!botAttack?.retaliation || botAttack.retaliation.damage <= 0) {
    throw new Error(`Expected sentry defender to return fire simultaneously even when destroyed, received ${JSON.stringify(botAttack)}`);
  }

  await Then("sentry preserves simultaneous return fire on lethal bot attacks", () => {});
});

registerTest("TOWED_GUNS_MUST_MOVE_OUT_BEFORE_TOWING_AND_CANNOT_DEPLOY_AFTER_MOVING", async ({ Then }) => {
  const gun: ScenarioUnit = {
    type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 1,
    facing: "NE" as ScenarioUnit["facing"]
  };
  const target: ScenarioUnit = {
    type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"],
    hex: { q: 2, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 40,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([gun], [target]);

  const initialCommand = engine.getUnitCommandState(gun.hex);
  const initialBudget = engine.getMovementBudget(gun.hex);
  if (initialCommand?.towState !== "deployed" || !initialCommand.canMoveOut) {
    throw new Error(`Expected gun to begin deployed with Move Out available, received ${JSON.stringify(initialCommand)}`);
  }
  if (initialBudget?.remaining !== 0) {
    throw new Error(`Expected deployed gun to have no towing movement before Move Out, received ${JSON.stringify(initialBudget)}`);
  }
  if (engine.getReachableHexes(gun.hex).length !== 0) {
    throw new Error("Expected deployed gun to have no reachable towing hexes before Move Out.");
  }

  if (!engine.moveOutTowableUnit(gun.hex)) {
    throw new Error("Expected deployed gun to enter towed status after Move Out.");
  }

  const towedBudget = engine.getMovementBudget(gun.hex);
  if (!towedBudget || towedBudget.remaining !== 1) {
    throw new Error(`Expected Move Out to spend half of a 2-point movement allowance, received ${JSON.stringify(towedBudget)}`);
  }

  const moveResolution = engine.moveUnit(gun.hex, { q: 1, r: 0 });
  const movedHex = moveResolution.to;
  const movedCommand = engine.getUnitCommandState(movedHex);
  if (movedCommand?.towState !== "towed") {
    throw new Error(`Expected moved gun to remain towed after relocation, received ${JSON.stringify(movedCommand)}`);
  }
  if (movedCommand?.canDeployTow) {
    throw new Error(`Expected moved gun to be blocked from deploying until next turn, received ${JSON.stringify(movedCommand)}`);
  }
  if (!movedCommand?.deployTowReason?.includes("already moved")) {
    throw new Error(`Expected move-then-deploy command state to explain the turn lockout, received ${JSON.stringify(movedCommand)}`);
  }
  if (engine.deployTowableUnit(movedHex)) {
    throw new Error("Did not expect a towed gun to deploy after moving in the same turn.");
  }
  const blockedAfterMove = engine.getUnitCommandState(movedHex);
  if (blockedAfterMove?.towState !== "towed") {
    throw new Error(`Expected move-locked gun to remain towed, received ${JSON.stringify(blockedAfterMove)}`);
  }
  if (engine.getAttackableTargets(movedHex).length !== 0) {
    throw new Error("Expected moved tow gun to remain unable to fire before next-turn deployment.");
  }

  await Then("deployed-start guns must Move Out first, and movement prevents same-turn tow deployment", () => {});
});

registerTest("TOWED_GUNS_CAN_DEPLOY_AND_FIRE_IF_THEY_HAVE_NOT_MOVED", async ({ Then }) => {
  const gun: ScenarioUnit = {
    type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"],
    towState: "towed"
  };
  const target: ScenarioUnit = {
    type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"],
    hex: { q: 2, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 40,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"]
  };

  const { engine } = createEngine([gun], [target]);

  const towedBudget = engine.getMovementBudget(gun.hex);
  const towedCommand = engine.getUnitCommandState(gun.hex);
  if (!towedBudget || towedBudget.remaining !== 2) {
    throw new Error(`Expected already-towed gun to begin with full movement, received ${JSON.stringify(towedBudget)}`);
  }
  if (towedCommand?.towState !== "towed" || !towedCommand.canDeployTow) {
    throw new Error(`Expected already-towed gun to be ready to deploy, received ${JSON.stringify(towedCommand)}`);
  }
  if (engine.getAttackableTargets(gun.hex).length !== 0) {
    throw new Error("Expected towed gun to have no attack targets before deploying.");
  }

  if (!engine.deployTowableUnit(gun.hex)) {
    throw new Error("Expected already-towed gun to deploy without spending the turn.");
  }

  const deployedTargets = engine.getAttackableTargets(gun.hex);
  if (!deployedTargets.some((hex) => hex.q === target.hex.q && hex.r === target.hex.r)) {
    throw new Error(`Expected deployed gun to regain attack permission without prior movement, received ${JSON.stringify(deployedTargets)}`);
  }

  const resolution = engine.attackUnit(gun.hex, target.hex);
  if (!resolution) {
    throw new Error("Expected deployed gun to be able to fire after deploying from a stationary towed state.");
  }

  await Then("already-towed guns can deploy and fire in the same turn when they have not moved", () => {});
});

registerTest("TOWED_GUNS_CANNOT_RETALIATE_UNTIL_DEPLOYED", async ({ Then }) => {
  const playerAttacker: ScenarioUnit = {
    type: "TestRetaliationDummy" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 40,
    entrench: 0,
    facing: "SE" as ScenarioUnit["facing"]
  };
  const towedBotGun: ScenarioUnit = {
    type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SW" as ScenarioUnit["facing"],
    towState: "towed"
  };

  const { engine: playerVsTowed } = createEngine([playerAttacker], [towedBotGun]);
  const towedPreview = playerVsTowed.previewAttack(playerAttacker.hex, towedBotGun.hex);
  if (!towedPreview) {
    throw new Error("Expected preview against a limbered gun to be available.");
  }
  if (towedPreview.retaliationPossible || towedPreview.expectedRetaliation > 0) {
    throw new Error(`Expected limbered gun preview to show no retaliation, received ${JSON.stringify(towedPreview)}`);
  }
  if (!towedPreview.retaliationNote?.includes("limbered")) {
    throw new Error(`Expected limbered retaliation preview note, received ${JSON.stringify(towedPreview)}`);
  }

  const towedResolution = playerVsTowed.attackUnit(playerAttacker.hex, towedBotGun.hex);
  if (!towedResolution) {
    throw new Error("Expected live attack against a limbered gun to resolve.");
  }
  if (towedResolution.retaliationOccurred) {
    throw new Error(`Expected limbered gun to skip retaliation, received ${JSON.stringify(towedResolution)}`);
  }

  const deployedBotGun: ScenarioUnit = {
    ...towedBotGun,
    towState: "deployed"
  };
  const { engine: playerVsDeployed } = createEngine([playerAttacker], [deployedBotGun]);
  const deployedPreview = playerVsDeployed.previewAttack(playerAttacker.hex, deployedBotGun.hex);
  if (!deployedPreview) {
    throw new Error("Expected preview against a deployed gun to be available.");
  }
  if (!deployedPreview.retaliationPossible || deployedPreview.expectedRetaliation <= 0) {
    throw new Error(`Expected deployed gun preview to retain retaliation, received ${JSON.stringify(deployedPreview)}`);
  }

  const playerTowedGun: ScenarioUnit = {
    ...towedBotGun,
    hex: { q: 1, r: 1 }
  };
  const botAttacker: ScenarioUnit = {
    ...playerAttacker,
    hex: { q: 1, r: 0 }
  };
  const { engine: botVsTowed } = createEngine([playerTowedGun], [botAttacker]);
  const towedBotAttack = (botVsTowed as any).resolveBotAttack(botAttacker, botAttacker.hex, playerTowedGun.hex);
  if (towedBotAttack?.retaliation) {
    throw new Error(`Expected bot summary to omit retaliation from limbered gun, received ${JSON.stringify(towedBotAttack)}`);
  }

  const playerDeployedGun: ScenarioUnit = {
    ...playerTowedGun,
    towState: "deployed"
  };
  const { engine: botVsDeployed } = createEngine([playerDeployedGun], [botAttacker]);
  const deployedBotAttack = (botVsDeployed as any).resolveBotAttack(botAttacker, botAttacker.hex, playerDeployedGun.hex);
  if (!deployedBotAttack?.retaliation || deployedBotAttack.retaliation.damage <= 0) {
    throw new Error(`Expected deployed gun to retain bot-turn retaliation, received ${JSON.stringify(deployedBotAttack)}`);
  }

  await Then("limbered guns lose retaliation in previews and live combat until they are deployed again", () => {});
});
