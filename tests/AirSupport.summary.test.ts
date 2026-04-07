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
  combat: { category: "air", weight: "light", role: "normal", signature: "large" },
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
      facing: "NW"
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

registerTest("AIR_SUPPORT_RESERVE_HELPERS_UPDATE_AND_REMOVE_PLAYER_SQUADRONS", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let updatedStrength = 0;
  let remainingReserves = 0;

  await Given("a player aircraft sitting in reserves", async () => {
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
      facing: "NW",
      unitId: "reserve-flight-1"
    } as ScenarioUnit;
    engine.initializeFromAllocations([fighter]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();
  });

  await When("reserve-aware roster helpers update and remove the flight", async () => {
    const damagedFlight: ScenarioUnit = {
      ...(engine.getReserveSnapshot()[0]!.unit as ScenarioUnit),
      strength: 73
    };
    const replaced = (engine as any).replaceUnitInFactionHex("Player", damagedFlight);
    if (!replaced) {
      throw new Error("Expected reserve aircraft replacement helper to succeed.");
    }
    updatedStrength = engine.getReserveSnapshot().find((entry) => entry.unit.unitId === "reserve-flight-1")?.unit.strength ?? 0;

    const removed = (engine as any).removeUnitFromFactionHex("Player", damagedFlight.hex, "reserve-flight-1");
    if (!removed) {
      throw new Error("Expected reserve aircraft removal helper to succeed.");
    }
    remainingReserves = engine.getReserveSnapshot().length;
  });

  await Then("reserve aircraft changes should be visible through the live reserve snapshot", async () => {
    if (updatedStrength !== 73) {
      throw new Error(`Expected updated reserve strength of 73, saw ${updatedStrength}.`);
    }
    if (remainingReserves !== 0) {
      throw new Error(`Expected destroyed reserve flight to be removed from live reserves, saw ${remainingReserves} remaining.`);
    }
  });
});

registerTest("AIR_SUPPORT_CAP_REPORTS_COMBAT_WHEN_THE_PATROL_INTERCEPTS_A_STRIKE", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let outcome: {
    result?: string;
    details?: string;
    interceptions?: number;
    meta?: { bomberAttrition?: number; interceptorAttrition?: number; capKills?: number };
  } | null = null;

  await Given("a valid air support engine", async () => {
    const cfg: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(cfg);
  });

  await When("a CAP mission resolves after logging an interception", async () => {
    outcome = (engine as any).resolveAirCoverMission({
      id: "cap-report",
      template: {
        kind: "airCover",
        label: "CAP",
        description: "",
        allowedRoles: ["cap"],
        requiresTarget: true,
        requiresFriendlyEscortTarget: false,
        durationTurns: 1
      },
      faction: "Player",
      unitKey: "cap-1",
      unitType: "Fighter",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 1, r: 0 },
      interceptions: 1,
      airCombatDamageInflicted: 18,
      airCombatDamageTaken: 6,
      airCombatKills: 1
    });
  });

  await Then("the CAP report should describe the interception instead of claiming no hostile bombers arrived", async () => {
    if (!outcome) {
      throw new Error("Expected CAP outcome to be produced.");
    }
    if (outcome.result !== "success") {
      throw new Error(`Expected CAP resolution to succeed, saw ${outcome.result ?? "<missing>"}.`);
    }
    if (!(outcome.details ?? "").includes("engaged")) {
      throw new Error(`Expected CAP details to mention the interception, saw ${outcome.details ?? "<missing>"}.`);
    }
    if ((outcome.details ?? "").includes("no hostile bombers entered the area")) {
      throw new Error(`Did not expect the no-contact CAP text after an interception, saw ${outcome.details}.`);
    }
    if (outcome.interceptions !== 1) {
      throw new Error(`Expected CAP interception count to be preserved, saw ${outcome.interceptions ?? "<missing>"}.`);
    }
    if (outcome.meta?.bomberAttrition !== 18 || outcome.meta?.interceptorAttrition !== 6 || outcome.meta?.capKills !== 1) {
      throw new Error(`Expected CAP attrition metadata to be preserved, saw ${JSON.stringify(outcome.meta)}.`);
    }
  });
});
