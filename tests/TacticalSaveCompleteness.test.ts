/** Certifies complete tactical serialization, hydration, initiative continuation, and campaign binding. */

import { registerTest } from "./harness.js";
import type { Axial } from "../src/core/Hex";
import type { ScenarioData, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import { createInitialFormationStatus } from "../src/data/unitSystem/status";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import terrainData from "../src/data/terrain.json";
import { GameEngine, type GameEngineConfig, type SerializedBattleState } from "../src/game/GameEngine";
import {
  CAMPAIGN_BATTLE_SAVE_PACKAGE_VERSION,
  COMPLETE_BATTLE_SAVE_VERSION,
  assertCompleteActiveCampaignBattleSave,
  type ActiveCampaignBattleSave
} from "../src/game/battle/persistence/BattleSaveTypes";
import { BattleState } from "../src/state/BattleState";
import { BattleStateInitiativeManager } from "../src/state/BattleStateInitiativeExtensions";
import { createMissionRulesController } from "../src/state/missionRules";
import {
  CAMPAIGN_BATTLE_PACKAGE_VERSION,
  type CampaignBattlePackage
} from "../src/game/campaign/engagements/CampaignEngagementLedgerTypes";
import { computeCampaignBattlePackageIntegrity } from "../src/game/campaign/engagements/CampaignEngagementLedgerService";

const unitTypes = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;

function makeTestCampaignBattlePackage(binding: {
  campaignId: string;
  campaignRevision: number;
  scenarioKey: string;
  engagementId: string;
}): CampaignBattlePackage {
  const sourceRevision = Math.max(0, binding.campaignRevision - 1);
  const context = {
    engagementId: binding.engagementId,
    battleHexKey: "1,1",
    attacker: "Player" as const,
    defender: "Bot" as const,
    missionType: "meetingEngagement" as const,
    amphibious: false,
    coastal: false,
    availableForces: [{ hexKey: "0,1", unitType: "Infantry_42", count: 1, formationIds: ["formation-test"] }],
    allocationCaps: { infantry: 1 },
    enemyForces: [],
    airSorties: 0,
    rpReserve: 0,
    playerForceValue: 50,
    enemyForceValue: 0,
    forceRatio: 1,
    templateKey: null,
    frontKey: null,
    objectiveKey: null
  };
  const engagement = {
    id: binding.engagementId,
    frontKey: null,
    objectiveKey: null,
    attacker: "Player" as const,
    defender: "Bot" as const,
    hexKeys: ["1,1"],
    tags: ["test"],
    context
  };
  const baselineStatus = createInitialFormationStatus("Infantry_42", "infantry", 100);
  const provisional: CampaignBattlePackage = {
    packageVersion: CAMPAIGN_BATTLE_PACKAGE_VERSION,
    packageId: `package-${binding.engagementId}`,
    campaignId: binding.campaignId,
    scenarioKey: binding.scenarioKey,
    engagementId: binding.engagementId,
    sourceRevision,
    committedRevision: sourceRevision + 1,
    committedSegment: 0,
    commitmentIdempotencyKey: `commit-${binding.engagementId}`,
    commitmentRequestHash: "fnv1a32-00000001",
    engagementContextHash: "fnv1a32-00000002",
    engagement,
    context,
    allocations: [{ allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50, totalRpCost: 50 }],
    formationCommitments: [{
      formationId: "formation-test",
      faction: "Player",
      role: "attacker",
      allocationKey: "infantry",
      sourceHexKey: "0,1",
      tacticalUnitId: "tactical-test",
      beforeStateHash: "fnv1a32-00000003",
      before: {
        personnel: baselineStatus.personnel,
        equipment: baselineStatus.equipment,
        readinessModel: baselineStatus.readinessModel ?? null,
        readiness: 100,
        cohesion: 100,
        fatigue: 0,
        supply: { ammo: 10, fuel: 0, rations: 100, parts: 100 },
        experience: { base: 0, earned: 0, battles: 0 }
      }
    }],
    supportCommitments: [],
    resourceCommitments: [],
    integrityHash: ""
  };
  return { ...provisional, integrityHash: computeCampaignBattlePackageIntegrity(provisional) };
}

function makeUnit(type: ScenarioUnit["type"], hex: Axial, unitId: string, controlledBy: "Player" | "AI"): ScenarioUnit {
  const definition = unitTypes[type];
  if (!definition) throw new Error(`Missing tactical test unit '${String(type)}'.`);
  return {
    type,
    hex: structuredClone(hex),
    strength: 100,
    experience: definition.baseExperience ?? 0,
    baseExperience: definition.baseExperience ?? 0,
    earnedExperience: 0,
    ammo: definition.ammo,
    fuel: definition.fuel,
    entrench: 0,
    facing: "SE",
    unitId,
    controlledBy,
    status: createInitialFormationStatus(type as string)
  };
}

export function makeScenario(): ScenarioData {
  const row = Array.from({ length: 7 }, () => ({ tile: "plain" }));
  return {
    name: "Tactical Save Certification",
    size: { cols: 7, rows: 3 },
    tilePalette: {
      plain: {
        terrain: "plains",
        terrainType: "rural",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row],
    objectives: [{ hex: { q: 3, r: 1 }, owner: "Bot", vp: 1 }],
    turnLimit: 8,
    sides: {
      Player: {
        hq: { q: 0, r: 1 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      },
      Bot: {
        hq: { q: 6, r: 1 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      },
      Ally: {
        hq: { q: 1, r: 2 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      }
    }
  };
}

export function makeConfig(scenario: ScenarioData): GameEngineConfig {
  return {
    scenario,
    unitTypes,
    terrain,
    playerSide: scenario.sides.Player,
    botSide: scenario.sides.Bot,
    allySide: scenario.sides.Ally,
    botStrategyMode: "Heuristic",
    botDifficulty: "Normal"
  };
}

export function makeLegacyState(): SerializedBattleState {
  return {
    phase: "playerTurn",
    activeFaction: "Player",
    turnNumber: 2,
    baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
    playerPlacements: [makeUnit("Infantry_42", { q: 1, r: 1 }, "player-core-1", "Player")],
    botPlacements: [makeUnit("Infantry_42", { q: 5, r: 1 }, "bot-core-1", "AI")],
    allyPlacements: [makeUnit("Infantry_42", { q: 1, r: 2 }, "ally-core-1", "AI")],
    reserves: []
  };
}

/** Builds a complete campaign-bound tactical fixture for save UX and repository integration tests. */
export function buildCompleteActiveBattleSave(binding: {
  campaignId: string;
  campaignRevision: number;
  scenarioKey: string;
  engagementId: string;
  focusedElementId?: string | null;
}): ActiveCampaignBattleSave {
  const battlePackage = makeTestCampaignBattlePackage(binding);
  const scenario = makeScenario();
  const source = new BattleState();
  source.initializeEngine(makeConfig(scenario));
  source.ensureGameEngine().hydrateFromSerialized(makeLegacyState());
  const rules = createMissionRulesController("training", scenario);
  const complete = source.serializeComplete({
    initiative: null,
    missionRules: rules.serializeState(),
    missionStatus: rules.getStatus(),
    boundary: { kind: "playerDecision", turn: 2, phase: "playerTurn", activeFaction: "Player" }
  });
  return {
    version: COMPLETE_BATTLE_SAVE_VERSION,
    engagementPackage: {
      packageVersion: CAMPAIGN_BATTLE_SAVE_PACKAGE_VERSION,
      campaignId: binding.campaignId,
      campaignRevision: binding.campaignRevision,
      scenarioKey: binding.scenarioKey,
      engagementId: binding.engagementId,
      commitmentPackageId: battlePackage.packageId,
      commitmentIntegrityHash: battlePackage.integrityHash,
      bridge: { scenario: null, turnState: null, queuedDecisions: [], pendingEngagements: [], battlePackage }
    },
    battle: complete,
    tacticalUI: {
      selectedHexKey: "1,1",
      selectedPlayerUnitId: "player-core-1",
      intelOverlayExpanded: true,
      openPopup: null,
      activityLogCollapsed: false,
      viewport: { zoom: 1.75, panX: 24, panY: -12 },
      animationMode: "quick",
      accessibilitySettingsReference: "fsg-local-ui-v1",
      focusedElementId: binding.focusedElementId ?? "endTurn",
      currentObjectiveIndex: 0,
      activityEvents: [],
      activityEventSequence: 0,
      seenAirReportIds: [],
      initiativeGroupCursorUnitId: null,
      initiativeGroupSessionId: null,
      initiativeSkippedUnitIds: []
    }
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function firstDifference(left: unknown, right: unknown, path = "root"): string | null {
  if (Object.is(left, right)) return null;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return `${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]));
  for (const key of keys) {
    const difference = firstDifference(leftRecord[key], rightRecord[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

registerTest("TACTICAL_SAVE_COMPLETE_STATE_ROUND_TRIPS_EXACTLY", async ({ Given, When, Then }) => {
  const scenario = makeScenario();
  const config = makeConfig(scenario);
  const source = new BattleState();
  source.initializeEngine(config);
  source.ensureGameEngine().hydrateFromSerialized(makeLegacyState());
  const rules = createMissionRulesController("training", scenario, "Normal");
  const missionStatus = rules.getStatus();
  const boundary = {
    kind: "playerDecision" as const,
    turn: 2,
    phase: "playerTurn" as const,
    activeFaction: "Player" as const
  };
  const snapshot = source.serializeComplete({
    initiative: null,
    missionRules: rules.serializeState(),
    missionStatus,
    boundary
  });
  let restoredSnapshot = snapshot;

  await Given("a complete tactical snapshot containing every required engine authority", async () => {
    if (snapshot.engine.completeStateVersion !== 1 || snapshot.engine.allyPlacements?.length !== 1) {
      throw new Error("Complete snapshot omitted its marker or allied placements.");
    }
    if (!snapshot.engine.supplyStates || !snapshot.engine.actionFlags || !snapshot.engine.counters) {
      throw new Error("Complete snapshot omitted supply, action, or deterministic counter state.");
    }
  });

  await When("a fresh BattleState hydrates and serializes the same stable boundary", async () => {
    const restored = new BattleState();
    restored.hydrateComplete(snapshot);
    restoredSnapshot = restored.serializeComplete({
      initiative: snapshot.initiative,
      missionRules: snapshot.missionRules,
      missionStatus: snapshot.missionStatus,
      boundary: snapshot.boundary
    });
  });

  await Then("the authoritative tactical payload is byte-equivalent after hydration", async () => {
    if (stableJson(snapshot) !== stableJson(restoredSnapshot)) {
      throw new Error(`Complete tactical state drifted during serialize/hydrate round-trip: ${firstDifference(snapshot, restoredSnapshot)}`);
    }
  });
});

registerTest("TACTICAL_SAVE_NEXT_TRANSITION_IS_DETERMINISTIC", async ({ Given, When, Then }) => {
  const scenario = makeScenario();
  const config = makeConfig(scenario);
  const seedEngine = GameEngine.fromSerialized(config, makeLegacyState());
  const snapshot = seedEngine.serialize();
  const left = GameEngine.fromSerialized(config, snapshot);
  const right = GameEngine.fromSerialized(config, snapshot);
  let leftResult = "";
  let rightResult = "";

  await Given("two fresh engines hydrated from the same complete tactical snapshot", async () => {
    if (snapshot.completeStateVersion !== 1) throw new Error("Seed engine did not emit complete tactical state.");
  });

  await When("both engines resolve the same next turn transition", async () => {
    left.endTurn();
    right.endTurn();
    leftResult = stableJson(left.serialize());
    rightResult = stableJson(right.serialize());
  });

  await Then("placements, logistics, logs, queues, RNG, and counters remain identical", async () => {
    if (leftResult !== rightResult) {
      throw new Error("Reloading changed the deterministic result of the next tactical transition.");
    }
  });
});

registerTest("TACTICAL_SAVE_INITIATIVE_AND_CAMPAIGN_BINDING_ARE_STRICT", async ({ Given, When, Then }) => {
  const initiative = new BattleStateInitiativeManager();
  const units = [
    makeUnit("Infantry_42", { q: 1, r: 1 }, "initiative-player", "Player"),
    makeUnit("Infantry_42", { q: 5, r: 1 }, "initiative-bot", "AI")
  ];
  initiative.initializeInitiativeTurn(units, 3);
  initiative.processNextActivation();
  const initiativeSnapshot = initiative.getStateSnapshot();
  const restoredInitiative = new BattleStateInitiativeManager();
  let rejectedCrossBinding = false;

  const scenario = makeScenario();
  const source = new BattleState();
  source.initializeEngine(makeConfig(scenario));
  source.ensureGameEngine().hydrateFromSerialized(makeLegacyState());
  const rules = createMissionRulesController("training", scenario);
  const complete = source.serializeComplete({
    initiative: null,
    missionRules: rules.serializeState(),
    missionStatus: rules.getStatus(),
    boundary: { kind: "playerDecision", turn: 2, phase: "playerTurn", activeFaction: "Player" }
  });
  const active: ActiveCampaignBattleSave = {
    // This fixture intentionally uses the same strict commitment package shape as production saves.
    version: COMPLETE_BATTLE_SAVE_VERSION,
    engagementPackage: (() => {
      const battlePackage = makeTestCampaignBattlePackage({
        campaignId: "campaign-save-test",
        campaignRevision: 7,
        scenarioKey: "scenario-save-test",
        engagementId: "engagement-save-test"
      });
      return {
      packageVersion: CAMPAIGN_BATTLE_SAVE_PACKAGE_VERSION,
      campaignId: "campaign-save-test",
      campaignRevision: 7,
      scenarioKey: "scenario-save-test",
      engagementId: "engagement-save-test",
      commitmentPackageId: battlePackage.packageId,
      commitmentIntegrityHash: battlePackage.integrityHash,
      bridge: { scenario: null, turnState: null, queuedDecisions: [], pendingEngagements: [], battlePackage }
      };
    })(),
    battle: complete,
    tacticalUI: {
      selectedHexKey: null,
      selectedPlayerUnitId: null,
      intelOverlayExpanded: false,
      openPopup: null,
      activityLogCollapsed: true,
      viewport: null,
      animationMode: "regular",
      accessibilitySettingsReference: null,
      focusedElementId: null,
      currentObjectiveIndex: -1,
      activityEvents: [],
      activityEventSequence: 0,
      seenAirReportIds: [],
      initiativeGroupCursorUnitId: null,
      initiativeGroupSessionId: null,
      initiativeSkippedUnitIds: []
    }
  };

  await Given("an in-progress initiative queue and a campaign-bound complete battle", async () => {
    restoredInitiative.hydrateState(initiativeSnapshot);
  });

  await When("the queue is restored and the battle is checked against another revision", async () => {
    try {
      assertCompleteActiveCampaignBattleSave(active, {
        campaignId: "campaign-save-test",
        campaignRevision: 8,
        scenarioKey: "scenario-save-test",
        engagementId: "engagement-save-test"
      });
    } catch {
      rejectedCrossBinding = true;
    }
  });

  await Then("initiative state is exact and cross-revision attachment is rejected", async () => {
    if (stableJson(restoredInitiative.getStateSnapshot()) !== stableJson(initiativeSnapshot)) {
      throw new Error("Initiative queue or current activation drifted during hydration.");
    }
    if (!rejectedCrossBinding) throw new Error("Cross-revision tactical save attachment was accepted.");
  });
});
