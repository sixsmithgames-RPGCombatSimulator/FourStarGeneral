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
import { getBattleTemplateByKey } from "../src/game/campaign/battleTemplates";
import { normalizeScenarioSource, type RawScenarioInput } from "../src/data/scenarioNormalizer";

const unitTypes = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;

function makeTestCampaignBattlePackage(binding: {
  campaignId: string;
  campaignRevision: number;
  scenarioKey: string;
  engagementId: string;
  playerRole?: "attacker" | "defender";
}): CampaignBattlePackage {
  const sourceRevision = Math.max(0, binding.campaignRevision - 1);
  const playerRole = binding.playerRole ?? "attacker";
  const attacker = playerRole === "attacker" ? "Player" as const : "Bot" as const;
  const defender = playerRole === "defender" ? "Player" as const : "Bot" as const;
  const context = {
    engagementId: binding.engagementId,
    battleHexKey: "1,1",
    attacker,
    defender,
    missionType: "meetingEngagement" as const,
    amphibious: false,
    coastal: false,
    availableForces: [{ hexKey: "0,1", unitType: "Infantry_42", count: 1, formationIds: ["formation-test"] }],
    allocationCaps: { infantry: 1 },
    enemyForces: [{ hexKey: "1,1", unitType: "Infantry_42", count: 1 }],
    airSorties: 0,
    rpReserve: 0,
    playerForceValue: 50,
    enemyForceValue: 50,
    forceRatio: 1,
    templateKey: "meeting_two_bridges",
    frontKey: null,
    objectiveKey: null
  };
  const engagement = {
    id: binding.engagementId,
    frontKey: null,
    objectiveKey: null,
    attacker,
    defender,
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
      role: playerRole,
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
  playerRole?: "attacker" | "defender";
}): ActiveCampaignBattleSave {
  const battlePackage = makeTestCampaignBattlePackage(binding);
  const template = getBattleTemplateByKey("meeting_two_bridges");
  if (!template) throw new Error("Tactical save fixture could not resolve its campaign template.");
  const scenario = normalizeScenarioSource(template.scenario as RawScenarioInput, { turnLimit: 0 });
  scenario.name = binding.playerRole === "defender"
    ? "Meeting Engagement Defense — Hex 1,1"
    : "Meeting Engagement — Hex 1,1";
  scenario.turnLimit = 0;
  scenario.campaignTemplateKey = "meeting_two_bridges";
  scenario.campaignPlayerRole = binding.playerRole ?? "attacker";
  scenario.campaignMissionType = "meetingEngagement";
  scenario.campaignBattleHexKey = "1,1";
  scenario.campaignEngagementId = binding.engagementId;
  scenario.campaignBattlePackageId = battlePackage.packageId;
  scenario.campaignInfrastructureEffectiveness = 1;
  const source = new BattleState();
  source.initializeEngine(makeConfig(scenario));
  source.ensureGameEngine().hydrateFromSerialized(makeLegacyState());
  const rules = createMissionRulesController("campaign", scenario);
  const playerDefense = binding.playerRole === "defender";
  source.setPrecombatMissionInfo({
    missionKey: "campaign",
    campaignTitle: "Operation Overlord - Central Channel Sector",
    title: scenario.name,
    briefing: playerDefense
      ? "Opposing forces have opened a meeting engagement at operational hex 1,1. Hold the marked tactical ground or break the attacking ground force; objective control or force collapse decides the engagement."
      : "Friendly forces are opening a meeting engagement at operational hex 1,1. Secure the marked tactical ground or break the opposing ground force; objective control or force collapse decides the engagement.",
    objectives: [playerDefense ? "Primary: Hold the engagement area" : "Primary: Secure the engagement area"],
    doctrine: playerDefense ? "Hold coherent defensive ground." : "Concentrate the committed formations.",
    turnLimit: null,
    baselineSupplies: []
  });
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

registerTest("TACTICAL_SAVE_MIGRATES_LEGACY_CAMPAIGN_DEFENSE_WITHOUT_A_DEADLINE", async ({ Given, When, Then }) => {
  const binding = {
    campaignId: "campaign-legacy-defense",
    campaignRevision: 7,
    scenarioKey: "central_channel",
    engagementId: "engagement-legacy-defense",
    playerRole: "defender" as const
  };
  const current = buildCompleteActiveBattleSave(binding);
  const legacy = structuredClone(current) as unknown as {
    battle: {
      engineConfig: { scenario: ScenarioData & Record<string, unknown> };
      engine: SerializedBattleState;
      boundary: { turn: number };
      missionRules: { data: Record<string, unknown> };
      precombatMission: {
        turnLimit: number | null;
        title: string;
        briefing: string;
        objectives: string[];
      } | null;
      missionStatus: {
        turn: number;
        outcome: { state: string; reason?: string };
        objectives: Array<{ id: string; label: string; state: string; detail?: string }>;
      };
    };
  };
  const legacyScenario = legacy.battle.engineConfig.scenario;
  legacyScenario.turnLimit = 24;
  delete legacyScenario.campaignPlayerRole;
  delete legacyScenario.campaignMissionType;
  delete legacyScenario.campaignBattleHexKey;
  delete legacyScenario.campaignEngagementId;
  delete legacyScenario.campaignBattlePackageId;
  if (!legacy.battle.precombatMission) throw new Error("Campaign fixture omitted precombat mission identity.");
  legacy.battle.engine.turnNumber = 30;
  legacy.battle.boundary.turn = 30;
  legacy.battle.missionRules.data = {
    outcome: {
      state: "playerVictory",
      reason: "Friendly forces held the engagement area through the defensive window."
    },
    turn: 30
  };
  legacy.battle.precombatMission.turnLimit = 24;
  legacy.battle.precombatMission.title = "Meeting Engagement — Hex 1,1";
  legacy.battle.precombatMission.briefing = "Opposing forces have opened a meeting engagement at operational hex 1,1. Hold the marked tactical ground or break the attacking ground force before the defensive window closes.";
  legacy.battle.precombatMission.objectives = ["Primary: Secure the engagement area"];
  const legacyPrimary = legacy.battle.missionStatus.objectives.find((objective) => objective.id === "campaign_control_engagement_area");
  if (!legacyPrimary) throw new Error("Campaign fixture omitted its primary mission status.");
  legacy.battle.missionStatus.turn = 30;
  legacy.battle.missionStatus.outcome = {
    state: "playerVictory",
    reason: "Friendly forces held the engagement area through the defensive window."
  };
  legacyPrimary.label = "Secure the engagement area";
  legacyPrimary.state = "completed";
  legacyPrimary.detail = "Friendly control: 0/1 tactical objectives at 1,1. 22 turns remain.";
  let migrated: ActiveCampaignBattleSave | null = null;

  await Given("an integrity-checked Player-defense save from the previous fixed-window rules", () => {});

  await When("the active tactical save crosses the current validation and migration boundary", () => {
    migrated = assertCompleteActiveCampaignBattleSave(legacy, binding);
  });

  await Then("the defender role and natural terminal conditions replace every obsolete deadline", () => {
    if (!migrated) throw new Error("Legacy campaign save was not migrated.");
    const scenario = migrated.battle.engineConfig.scenario;
    const mission = migrated.battle.precombatMission;
    const primary = migrated.battle.missionStatus.objectives.find((objective) => objective.id === "campaign_control_engagement_area");
    if (scenario.turnLimit !== 0 || scenario.campaignPlayerRole !== "defender"
      || scenario.campaignEngagementId !== binding.engagementId
      || mission?.turnLimit !== null || /window closes|\d+\s+turns?\s+remain/i.test(`${mission?.briefing} ${primary?.detail}`)
      || !mission?.title.includes("Defense") || primary?.label !== "Hold the engagement area") {
      throw new Error("Legacy campaign save retained stale role, title, or deadline identity.");
    }

    const restored = new BattleState();
    restored.hydrateComplete(migrated.battle);
    const engine = restored.ensureGameEngine();
    const controller = createMissionRulesController("campaign", scenario);
    controller.hydrateState(migrated.battle.missionRules);
    const occupancy = new Map<string, "Player" | "Bot" | "Ally">();
    engine.playerUnits.forEach((unit) => occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Player"));
    engine.botUnits.forEach((unit) => occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Bot"));
    engine.allyUnits.forEach((unit) => occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Ally"));
    const ongoing = controller.onTurnAdvanced({
      turnSummary: engine.getTurnSummary(),
      scenario,
      occupancy,
      playerUnits: engine.playerUnits,
      botUnits: engine.botUnits,
      allyUnits: engine.allyUnits
    });
    if (engine.getTurnSummary().turnNumber !== 30 || migrated.battle.boundary.turn !== 30
      || ongoing.turn !== 30 || ongoing.outcome.state !== "inProgress") {
      throw new Error(`Migrated campaign defense ended from elapsed turns: ${ongoing.outcome.state}.`);
    }
    const opposingControl = new Map<string, "Bot">();
    scenario.objectives.forEach((objective) => opposingControl.set(`${objective.hex.q},${objective.hex.r}`, "Bot"));
    const defeated = controller.onTurnAdvanced({
      turnSummary: { ...engine.getTurnSummary(), turnNumber: 31 },
      scenario,
      occupancy: opposingControl,
      playerUnits: engine.playerUnits,
      botUnits: engine.botUnits,
      allyUnits: engine.allyUnits
    });
    if (defeated.outcome.state !== "playerDefeat") {
      throw new Error("Migrated Player defense did not end when opposing forces secured every objective.");
    }
  });
});

registerTest("TACTICAL_SAVE_REJECTS_INCOMPATIBLE_FROZEN_CAMPAIGN_TEMPLATE", async ({ Given, When, Then }) => {
  const binding = {
    campaignId: "campaign-template-mismatch",
    campaignRevision: 4,
    scenarioKey: "central_channel",
    engagementId: "engagement-template-mismatch"
  };
  const raw = structuredClone(buildCompleteActiveBattleSave(binding)) as unknown as {
    engagementPackage: {
      commitmentIntegrityHash: string;
      bridge: { battlePackage: CampaignBattlePackage };
    };
  };
  const originalPackage = raw.engagementPackage.bridge.battlePackage;
  const provisional: CampaignBattlePackage = {
    ...originalPackage,
    context: { ...originalPackage.context, templateKey: "line_el_alamein" },
    engagement: {
      ...originalPackage.engagement,
      context: originalPackage.engagement.context
        ? { ...originalPackage.engagement.context, templateKey: "line_el_alamein" }
        : undefined
    },
    integrityHash: ""
  };
  const mismatchedPackage = {
    ...provisional,
    integrityHash: computeCampaignBattlePackageIntegrity(provisional)
  };
  raw.engagementPackage.bridge.battlePackage = mismatchedPackage;
  raw.engagementPackage.commitmentIntegrityHash = mismatchedPackage.integrityHash;
  let rejected = false;

  await Given("an internally checksummed Western Europe save frozen to an unapproved desert template", () => {});

  await When("the tactical load boundary verifies campaign and template compatibility", () => {
    try {
      assertCompleteActiveCampaignBattleSave(raw, binding);
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("incompatible with campaign 'central_channel'");
    }
  });

  await Then("the loader rejects the map instead of relabeling or stamping it", () => {
    if (!rejected) throw new Error("An incompatible frozen campaign template passed tactical-save migration.");
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
