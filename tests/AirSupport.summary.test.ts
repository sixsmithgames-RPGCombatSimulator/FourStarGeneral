import { registerTest } from "./harness.js";
import type { Axial } from "../src/core/Hex";
import type { ScenarioUnit, UnitTypeDefinition, UnitTypeDictionary, TerrainDefinition, TerrainDictionary, ScenarioSide, ScenarioData } from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";

// Minimal inline data to keep the test deterministic and self-contained
const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};
const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

const fighterDef: UnitTypeDefinition = {
  class: "air",
  movement: 5,
  moveType: "air",
  vision: 4,
  ammo: 6,
  fuel: 50,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 6,
  armor: { front: 5, side: 4, top: 4 },
  hardAttack: 12,
  softAttack: 18,
  ap: 6,
  accuracyBase: 64,
  traits: ["skirmish"],
  cost: 320,
  airSupport: {
    roles: ["escort", "cap", "strike"],
    cruiseSpeedKph: 540,
    combatRadiusKm: 250,
    refitTurns: 1
  }
};

const unitTypes: UnitTypeDictionary = {
  Fighter: fighterDef
} as unknown as UnitTypeDictionary;

function side(): ScenarioSide {
  return { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] };
}

function scenario(): ScenarioData {
  const tileKey = "plains";
  const row = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
  return {
    name: "Air Support HUD",
    size: { cols: 3, rows: 3 },
    tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles: [row, row, row],
    objectives: [],
    turnLimit: 5,
    sides: { Player: side(), Bot: side() }
  } as unknown as ScenarioData;
}

registerTest("AIR_SUPPORT_HUD_SUMMARY_AND_CANCEL", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let missionId = "";

  await Given("a player fighter and an air cover mission is queued", async () => {
    const cfg: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(cfg);
    engine.beginDeployment();
    const fighter: ScenarioUnit = {
      type: "Fighter" as unknown as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 50,
      entrench: 0,
      facing: "N"
    };
    engine.initializeFromAllocations([fighter]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    // Sanity: templates are available for UI
    const templates = engine.listAirMissionTemplates();
    if (!templates || templates.length < 1) {
      throw new Error("Expected air mission templates to be available");
    }

    missionId = engine.scheduleAirMission({ kind: "airCover", faction: "Player", unitHex: { q: 0, r: 0 }, targetHex: { q: 0, r: 0 } as Axial });
  });

  let summaryBefore: ReturnType<GameEngine["getAirSupportSummary"]> | null = null;
  let summaryAfter: ReturnType<GameEngine["getAirSupportSummary"]> | null = null;

  await When("inspecting HUD summary and canceling the mission", async () => {
    summaryBefore = engine.getAirSupportSummary();
    const canceled = engine.cancelQueuedAirMission(missionId);
    if (!canceled) {
      throw new Error("Expected mission to be canceled");
    }
    summaryAfter = engine.getAirSupportSummary();
  });

  await Then("queued count decreases by one after cancellation", async () => {
    if (!summaryBefore || !summaryAfter) {
      throw new Error("Missing HUD summaries");
    }
    if (summaryBefore.queued < 1) {
      throw new Error(`Expected at least one queued mission, saw ${summaryBefore.queued}`);
    }
    if (summaryAfter.queued !== Math.max(0, summaryBefore.queued - 1)) {
      throw new Error(`Expected queued to decrease by one, before=${summaryBefore.queued}, after=${summaryAfter.queued}`);
    }
  });
});
