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
import { unitFormations } from "../src/data/unitSystem/formations";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

const towedSmokeGunDef: UnitTypeDefinition = {
  class: "artillery",
  combat: { category: "artillery", weight: "medium", role: "support", signature: "medium" },
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
  traits: ["smoke"],
  cost: 110
};

const unitTypes: UnitTypeDictionary = {
  AT_Gun_50mm: towedSmokeGunDef,
  Infantry_42: unitFormations.infantry.tactical,
  APC_Halftrack: unitFormations.apcHalftrackCompany.tactical
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
    name: "Towed Smoke Availability",
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

function createEngine(playerUnits: ScenarioUnit[]): GameEngine {
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side(
      { q: 0, r: 0 },
      playerUnits.map((unit) => ({ ...unit, preDeployed: true }))
    ),
    botSide: side({ q: 4, r: 2 }),
    botStrategyMode: "Simple"
  };

  const engine = new GameEngine(config);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

registerTest("TOWED_SMOKE_REQUIRES_DEPLOYMENT_BEFORE_FIRING_SMOKE", async ({ Then }) => {
  const gun: ScenarioUnit = {
    type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
    hex: { q: 1, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE" as ScenarioUnit["facing"],
    towState: "towed"
  };
  const engine = createEngine([gun]);

  const towedState = engine.getUnitCommandState(gun.hex);
  if (!towedState || towedState.towState !== "towed") {
    throw new Error(`Expected a towed command state, received ${JSON.stringify(towedState)}.`);
  }
  if (towedState.canLaySmoke) {
    throw new Error(`Expected towed gun smoke to be blocked, received ${JSON.stringify(towedState)}.`);
  }
  if (!towedState.smokeReason?.includes("Deploy the battery before laying smoke")) {
    throw new Error(`Expected tow smoke reason to require deployment, received ${JSON.stringify(towedState)}.`);
  }

  let blockedByTow = false;
  try {
    engine.laySmoke(gun.hex, "E");
  } catch (error) {
    blockedByTow = String(error).includes("Deploy the battery before laying smoke");
  }
  if (!blockedByTow) {
    throw new Error("Expected laySmoke to reject while the gun is still towed.");
  }

  if (!engine.deployTowableUnit(gun.hex)) {
    throw new Error("Expected stationary towed gun to deploy.");
  }

  const deployedState = engine.getUnitCommandState(gun.hex);
  if (!deployedState || deployedState.towState !== "deployed" || !deployedState.canLaySmoke) {
    throw new Error(`Expected deployed gun smoke to become available, received ${JSON.stringify(deployedState)}.`);
  }

  await Then("towed guns cannot lay smoke until they deploy", () => {});
});

registerTest("INFANTRY_BATTALION_MORTARS_DO_NOT_CREATE_HEX_EDGE_SMOKE_SCREENS", async ({ Then }) => {
  const infantry: ScenarioUnit = {
    unitId: "tutorial_infantry",
    type: "Infantry_42",
    hex: { q: 1, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 1,
    facing: "NE",
    controlledBy: "Player"
  };
  const engine = createEngine([infantry]);
  const commandState = engine.getUnitCommandState(infantry.hex, infantry.unitId);

  if (!commandState || commandState.isSmokeCapable || commandState.canLaySmoke) {
    throw new Error(`Expected infantry smoke to be unavailable, received ${JSON.stringify(commandState)}.`);
  }
  if (!commandState.smokeReason?.includes("Only tanks and artillery")) {
    throw new Error(`Expected infantry smoke reason to name eligible classes, received ${JSON.stringify(commandState)}.`);
  }

  await Then("line infantry mortars no longer create precise hex-edge smoke screens", () => {});
});

registerTest("HALFTRACK_CARRIERS_DO_NOT_GAIN_SMOKE_FROM_VEHICLE_CLASS_ALONE", async ({ Then }) => {
  const halftrack: ScenarioUnit = {
    unitId: "halftrack_carrier",
    type: "APC_Halftrack",
    hex: { q: 1, r: 1 },
    strength: 100,
    experience: 0,
    ammo: 2,
    fuel: 50,
    entrench: 0,
    facing: "NE",
    controlledBy: "Player"
  };
  const engine = createEngine([halftrack]);
  const commandState = engine.getUnitCommandState(halftrack.hex, halftrack.unitId);

  if (!commandState || commandState.isSmokeCapable || commandState.canLaySmoke) {
    throw new Error(`Expected halftrack smoke to be unavailable, received ${JSON.stringify(commandState)}.`);
  }
  if (!commandState.smokeReason?.includes("Only tanks and artillery")) {
    throw new Error(`Expected halftrack smoke reason to name eligible classes, received ${JSON.stringify(commandState)}.`);
  }

  await Then("carrier vehicles do not receive smoke screens unless the rules explicitly grant them", () => {});
});
