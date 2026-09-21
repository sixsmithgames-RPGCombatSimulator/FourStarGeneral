import "./domEnvironment.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { registerTest } from "./harness.js";
import type {
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDictionary
} from "../src/core/types";
import type { BattleSidebarEngine, ReserveUnit } from "../src/contracts/BattleSidebarEngine";
import type { GameEngineConfig } from "../src/game/GameEngine";
import { BattleState } from "../src/state/BattleState";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};
const terrain = { plains } as unknown as TerrainDictionary;
const unitTypes = {} as UnitTypeDictionary;

function side(): ScenarioSide {
  return {
    hq: { q: 0, r: 0 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: []
  };
}

function scenario(): ScenarioData {
  return {
    name: "Sidebar engine contract",
    size: { cols: 1, rows: 1 },
    tilePalette: {
      plain: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [[{ tile: "plain" }]],
    objectives: [],
    turnLimit: 1,
    sides: { Player: side(), Bot: side() }
  } as ScenarioData;
}

registerTest("BATTLE_SIDEBAR_ENGINE_FACADE_IS_STRUCTURALLY_SATISFIED_BY_LIVE_STATE", async ({ Given, When, Then }) => {
  const state = new BattleState();
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side(),
    botSide: side()
  };
  let sidebar: BattleSidebarEngine;
  let concrete: ReturnType<BattleState["ensureGameEngine"]>;
  let projectedPlayerUnits: readonly ScenarioUnit[] = [];
  let projectedReserves: readonly ReserveUnit[] = [];
  let counterIntelHex: { q: number; r: number } | null = null;
  let verifiedBriefId: string | null = null;
  let scheduledRequest: Parameters<BattleSidebarEngine["tryScheduleAirMission"]>[0] | null = null;
  let canceledMissionId: string | null = null;
  let priorityRequest: { unitId: string; priority: string } | null = null;
  let canceled = false;

  await Given("an initialized battle state with a concrete game engine", () => {
    state.initializeEngine(config);
    concrete = state.ensureGameEngine();
    concrete.cancelQueuedAirMission = (missionId: string) => {
      canceledMissionId = missionId;
      return true;
    };
    concrete.deployCounterIntel = (targetHex) => {
      counterIntelHex = structuredClone(targetHex);
      return { ok: true, operationId: "counter-intel-operation" };
    };
    concrete.verifyIntelBrief = (briefId) => {
      verifiedBriefId = briefId;
      return { ok: false, reason: "verification fixture" };
    };
    concrete.tryScheduleAirMission = (request) => {
      scheduledRequest = structuredClone(request);
      return { ok: true, missionId: "scheduled-air-mission" };
    };
    concrete.setSupplyPriority = (unitId, priority) => {
      priorityRequest = { unitId, priority };
      return true;
    };
  });
  await When("the sidebar requests its narrow engine capability", () => {
    sidebar = state.getSidebarEngine();
    projectedPlayerUnits = sidebar.playerUnits;
    projectedReserves = sidebar.reserveUnits;
    sidebar.deployCounterIntel({ q: 4, r: 2 });
    sidebar.verifyIntelBrief("brief-alpha");
    sidebar.tryScheduleAirMission({
      kind: "airCover",
      faction: "Player",
      unitHex: { q: 1, r: 3 }
    });
    canceled = sidebar.cancelQueuedAirMission("queued-air-mission");
    sidebar.setSupplyPriority("sidebar-player", "high");
    const detachedUnit: ScenarioUnit = {
      type: "Infantry" as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 1,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "E",
      unitId: "detached-only"
    };
    (projectedPlayerUnits as ScenarioUnit[]).push(detachedUnit);
    (projectedReserves as ReserveUnit[]).push({
      unit: detachedUnit,
      definition: {} as ReserveUnit["definition"],
      allocationKey: "detached-only"
    });
  });
  await Then("the stable facade delegates commands while returning detached roster projections", () => {
    assert.notEqual(sidebar, concrete);
    assert.equal(state.getSidebarEngine(), sidebar);
    assert.equal(sidebar.phase, "deployment");
    assert.equal(canceled, true);
    assert.deepEqual(counterIntelHex, { q: 4, r: 2 });
    assert.equal(verifiedBriefId, "brief-alpha");
    assert.deepEqual(scheduledRequest, {
      kind: "airCover",
      faction: "Player",
      unitHex: { q: 1, r: 3 }
    });
    assert.equal(canceledMissionId, "queued-air-mission");
    assert.deepEqual(priorityRequest, { unitId: "sidebar-player", priority: "high" });
    assert.equal(projectedPlayerUnits.length, 1);
    assert.equal(projectedReserves.length, 1);
    assert.equal(concrete.playerUnits.length, 0);
    assert.equal(concrete.reserveUnits.length, 0);
    assert.equal(sidebar.playerUnits.length, 0);
    assert.equal(sidebar.reserveUnits.length, 0);
    assert.deepEqual(sidebar.getAirSupportSummary(), {
      queued: 0,
      inFlight: 0,
      resolving: 0,
      completed: 0,
      refit: 0
    });
    assert.deepEqual(sidebar.getCommanderBenefits(), config.playerSide.general);
  });
});

registerTest("BATTLE_SIDEBAR_UI_HAS_NO_DIRECT_GAME_ENGINE_IMPORT", async ({ When, Then }) => {
  const files = [
    "src/ui/components/PopupManager.ts",
    "src/ui/components/ReserveListPresenter.ts"
  ];
  const directEngineImport = /from\s+["'][^"']*\/game\/GameEngine(?:[^"']*)["']/u;

  let sources: Array<{ file: string; source: string }> = [];
  await When("the sidebar component source boundaries are inspected", () => {
    sources = files.map((file) => ({
      file,
      source: readFileSync(path.resolve(process.cwd(), file), "utf8")
    }));
  });
  await Then("the canonical sidebar components never import or request the concrete engine", () => {
    sources.forEach(({ file, source }) => {
      assert.doesNotMatch(source, directEngineImport, `${file} must not import a GameEngine implementation module.`);
      assert.doesNotMatch(source, /\.ensureGameEngine\(\)/u, `${file} must request the state-owned sidebar facade.`);
    });
  });
});
