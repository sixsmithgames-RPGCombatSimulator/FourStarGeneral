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

const wheeledReconDef: UnitTypeDefinition = {
  class: "recon",
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
