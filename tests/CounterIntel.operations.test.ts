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

const vehicleDef: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "vehicle", weight: "medium", role: "support", signature: "medium" },
  movement: 3,
  moveType: "wheel",
  vision: 3,
  ammo: 10,
  fuel: 10,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 2, side: 1, top: 1 },
  hardAttack: 6,
  softAttack: 5,
  ap: 3,
  accuracyBase: 60,
  traits: [],
  cost: 100
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
  softAttack: 4,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 60
};

const unitTypes: UnitTypeDictionary = {
  TestVehicle: vehicleDef,
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
  const row = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }, { tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
  return {
    name: "Counter Intelligence Operations",
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

function createEngine(
  playerUnits: ScenarioUnit[],
  botUnits: ScenarioUnit[] = [],
  botStrategyMode: "Simple" | "Heuristic" = "Simple"
): GameEngine {
  const preDeployedPlayers = playerUnits.map((unit) => ({ ...unit, preDeployed: true }));
  const cfg: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side({ q: 0, r: 0 }, preDeployedPlayers),
    botSide: side({ q: 5, r: 0 }, botUnits),
    botStrategyMode
  };
  const engine = new GameEngine(cfg);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return engine;
}

function findBotUnit(engine: GameEngine): ScenarioUnit {
  const [unit] = engine.botUnits;
  if (!unit) {
    throw new Error("Expected a bot unit to remain on the map.");
  }
  return unit;
}

registerTest("INTEL_VERIFICATION_CONFIRMS_FALSE_REPORTS", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let initialStatus = "";
  let verificationStatus = "";

  await Given("a live battle with the default analyst briefing stack", async () => {
    const playerUnit: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 8,
      fuel: 8,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([playerUnit]);
  });

  await When("the commander verifies the known low-confidence deception brief", async () => {
    const before = engine.getReconIntelSnapshot();
    const brief = before.intelBriefs.find((entry) => entry.id === "brief-phantom");
    if (!brief) {
      throw new Error("Expected the phantom artillery brief to exist.");
    }
    initialStatus = brief.verificationStatus ?? "missing";

    const result = engine.verifyIntelBrief("brief-phantom");
    if (!result.ok) {
      throw new Error(`Expected intel verification to succeed, received '${result.reason}'.`);
    }
    verificationStatus = result.status;
  });

  await Then("the brief is exposed as false and reflected in the visible snapshot", async () => {
    if (initialStatus !== "suspected-false") {
      throw new Error(`Expected the false brief to begin as suspected-false, received '${initialStatus}'.`);
    }
    if (verificationStatus !== "confirmed-false") {
      throw new Error(`Expected verification to confirm the brief as false, received '${verificationStatus}'.`);
    }

    const after = engine.getReconIntelSnapshot();
    const resolved = after.intelBriefs.find((entry) => entry.id === "brief-phantom");
    if (!resolved || resolved.verificationStatus !== "confirmed-false") {
      throw new Error("Expected the visible intel snapshot to mark the phantom brief as confirmed false.");
    }
    if ((after.counterIntel?.confirmedFalseBriefs ?? 0) < 1) {
      throw new Error("Expected the counter-intel summary to count at least one confirmed false brief.");
    }
  });
});

registerTest("COUNTER_INTEL_DECEPTION_PULLS_SIMPLE_BOT_OFF_THE_REAL_AXIS", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot battalion facing a real player axis and a planted false one", async () => {
    const playerUnit: ScenarioUnit = {
      type: "EnemyInfantry" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "N"
    };
    const botUnit: ScenarioUnit = {
      type: "TestVehicle" as ScenarioUnit["type"],
      hex: { q: 5, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 8,
      fuel: 8,
      entrench: 0,
      facing: "N"
    };
    engine = createEngine([playerUnit], [botUnit], "Simple");
    const deception = engine.deployCounterIntel({ q: 5, r: 3 });
    if (!deception.ok) {
      throw new Error(`Expected deception deployment to succeed, received '${deception.reason}'.`);
    }
  });

  await When("the player ends the turn and the bot reacts to the perceived targets", async () => {
    engine.endTurn();
  });

  await Then("the bot moves toward the decoy sector instead of advancing straight down the true line", async () => {
    const botUnit = findBotUnit(engine);
    if (botUnit.hex.r <= 0) {
      throw new Error(`Expected the bot to climb toward the false axis, but it moved to ${botUnit.hex.q},${botUnit.hex.r}.`);
    }
  });
});
