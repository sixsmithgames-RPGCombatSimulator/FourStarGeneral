/**
 * Versioned tactical persistence contracts shared by BattleState, CampaignState, and the battle UI.
 * The campaign envelope owns integrity/checksum work; this module owns tactical completeness and binding.
 */

import type { PopupKey } from "../../../contracts/IPopupManager";
import type { ActivityEvent } from "../../../ui/announcements/AnnouncementTypes";
import type { BattleAnimationMode } from "../../../state/UIState";
import type {
  PrecombatAllocationSummary,
  PrecombatMissionInfo
} from "../../../state/BattleState";
import type { MissionStatus, SerializedMissionRulesState } from "../../../state/missionRules";
import type {
  CampaignBridgeState,
  GameEngineConfig,
  SerializedBattleState
} from "../../GameEngine";
import type { SerializedGameEngineInitiativeState } from "../../GameEngineInitiativeIntegration";
import {
  assertCampaignBattlePackage
} from "../../campaign/engagements/CampaignEngagementLedgerService";
import type { CampaignBattlePackage } from "../../campaign/engagements/CampaignEngagementLedgerTypes";
import { getBattleTemplateByKey } from "../../campaign/battleTemplates";
import { MISSION_TYPE_LABELS } from "../../campaign/EngagementContextBuilder";
import { computeCampaignContentHash } from "../../campaign/runtime/CampaignCanonical";
import { normalizeScenarioSource, type RawScenarioInput } from "../../../data/scenarioNormalizer";

export const COMPLETE_BATTLE_SAVE_VERSION = 1 as const;
export const CAMPAIGN_BATTLE_SAVE_PACKAGE_VERSION = 1 as const;

export type TacticalSaveBoundaryKind =
  | "deploymentActionComplete"
  | "playerDecision"
  | "activationBoundary"
  | "turnBoundary";

/** Proof that the snapshot was captured outside an animation or partially applied rule transaction. */
export interface TacticalSaveBoundary {
  readonly kind: TacticalSaveBoundaryKind;
  readonly turn: number;
  readonly phase: SerializedBattleState["phase"];
  readonly activeFaction: SerializedBattleState["activeFaction"];
}

/** Exact engine plus rule-controller state required to resume before UI presentation is rebuilt. */
export interface CompleteSerializedBattleState {
  readonly version: typeof COMPLETE_BATTLE_SAVE_VERSION;
  readonly engineConfig: GameEngineConfig;
  readonly engine: SerializedBattleState;
  readonly initiative: SerializedGameEngineInitiativeState | null;
  readonly missionRules: SerializedMissionRulesState;
  readonly missionStatus: MissionStatus;
  readonly precombatAllocation: PrecombatAllocationSummary | null;
  readonly precombatMission: PrecombatMissionInfo | null;
  readonly assignedCommanderId: string | null;
  readonly campaignBridge: CampaignBridgeState | null;
  readonly boundary: TacticalSaveBoundary;
}

/** Minimal presentation state restored after authoritative engine/rule hydration succeeds. */
export interface TacticalUIResumeContext {
  readonly selectedHexKey: string | null;
  readonly selectedPlayerUnitId: string | null;
  readonly intelOverlayExpanded: boolean;
  readonly openPopup: PopupKey | null;
  readonly activityLogCollapsed: boolean;
  readonly viewport: { readonly zoom: number; readonly panX: number; readonly panY: number } | null;
  readonly animationMode: BattleAnimationMode;
  readonly accessibilitySettingsReference: string | null;
  readonly focusedElementId: string | null;
  readonly currentObjectiveIndex: number;
  readonly activityEvents: readonly ActivityEvent[];
  readonly activityEventSequence: number;
  readonly seenAirReportIds: readonly string[];
  readonly initiativeGroupCursorUnitId: string | null;
  readonly initiativeGroupSessionId: string | null;
  readonly initiativeSkippedUnitIds: readonly string[];
}

/** Frozen campaign identity that prevents a tactical snapshot from being attached to another revision. */
export interface CampaignBattleSavePackage {
  readonly packageVersion: typeof CAMPAIGN_BATTLE_SAVE_PACKAGE_VERSION;
  readonly campaignId: string;
  readonly campaignRevision: number;
  readonly scenarioKey: string;
  readonly engagementId: string;
  readonly commitmentPackageId: string;
  readonly commitmentIntegrityHash: string;
  readonly bridge: CampaignBridgeState;
}

/** Tactical state embedded in and owned by one campaign save payload. */
export interface ActiveCampaignBattleSave {
  readonly version: typeof COMPLETE_BATTLE_SAVE_VERSION;
  readonly engagementPackage: CampaignBattleSavePackage;
  readonly battle: CompleteSerializedBattleState;
  readonly tacticalUI: TacticalUIResumeContext;
}

export interface TacticalSaveAvailability {
  readonly stable: boolean;
  readonly boundary: TacticalSaveBoundary | null;
  readonly reason: string | null;
}

const REQUIRED_COMPLETE_ENGINE_FIELDS: ReadonlyArray<keyof SerializedBattleState> = [
  "allyPlacements",
  "airborneReserves",
  "airMissions",
  "airMissionRefits",
  "aaEngagements",
  "airMissionReports",
  "reconIntelSnapshot",
  "counterIntelOperations",
  "intelBriefStates",
  "counterIntelResources",
  "counterIntelIdCounter",
  "enemyContactStates",
  "hexModifications",
  "battleRequisitionPoints",
  "battleRequisitionPointsEarned",
  "battleRequisitionPointsSpent",
  "pendingBattleRequisitions",
  "battleRequisitionIdCounter",
  "supportAssets",
  "objectiveEntryAwardedKeys",
  "objectiveCaptureAwardedKeys",
  "actionFlags",
  "playerIdleUnitKeys",
  "aircraftAmmo",
  "supplyUnits",
  "supplyStates",
  "supplyHistory",
  "logisticsCareEvents",
  "supplyTruckStates",
  "convoyServiceHistory",
  "convoyServiceSequence",
  "supplyPriorities",
  "airMissionAssignments",
  "pendingAirMissionArrivals",
  "pendingAirEngagements",
  "resolvedMissionAirPhases",
  "resolvedEscortMissionStates",
  "pendingSupportImpactEvents",
  "combatReports",
  "casualtyLog",
  "queuedAllocations",
  "commanderStats",
  "pendingBotTurnSummary",
  "transportAirlift",
  "scenarioObjectives",
  "counters",
  "randomState"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const LEGACY_CAMPAIGN_DEADLINE_REASONS = new Set([
  "Friendly forces held the engagement area through the defensive window.",
  "The tactical window closed before the engagement objective was secured."
]);

function campaignGeometryFingerprint(scenario: GameEngineConfig["scenario"]): string {
  return computeCampaignContentHash({
    size: scenario.size,
    tilePalette: scenario.tilePalette,
    tiles: scenario.tiles,
    objectives: scenario.objectives.map((objective) => ({ hex: objective.hex, vp: objective.vp })),
    deploymentZones: (scenario.deploymentZones ?? []).map((zone) => ({
      key: zone.key,
      capacity: zone.capacity,
      hexes: zone.hexes
    }))
  });
}

function assertCompatibleIdentity(label: string, actual: unknown, expected: unknown): void {
  if (actual !== undefined && actual !== null && actual !== expected) {
    throw new Error(`Active campaign battle cannot be migrated because ${label} conflicts with its frozen commitment package.`);
  }
}

function isLegacyDeadlineOutcome(value: unknown): boolean {
  return isRecord(value)
    && typeof value["reason"] === "string"
    && LEGACY_CAMPAIGN_DEADLINE_REASONS.has(value["reason"]);
}

/** Reconciles only provably compatible pre-no-deadline saves from frozen campaign truth. */
function migrateCampaignBattleRules(
  value: Record<string, unknown>,
  battlePackage: CampaignBattlePackage
): ActiveCampaignBattleSave {
  const original = structuredClone(value) as unknown as ActiveCampaignBattleSave;
  const { context } = battlePackage;
  if (original.battle.missionRules.kind !== "campaignBattle"
    || original.battle.precombatMission?.missionKey !== "campaign") {
    throw new Error("Active campaign battle cannot be migrated because its campaign mission-rule or precombat identity is missing.");
  }
  const playerRole = context.attacker === "Player" && context.defender === "Bot"
    ? "attacker"
    : context.attacker === "Bot" && context.defender === "Player"
      ? "defender"
      : null;
  if (!playerRole) {
    throw new Error("Active campaign battle cannot be migrated because its frozen factions do not identify the Player's role.");
  }
  if (typeof context.templateKey !== "string" || context.templateKey.length === 0) {
    throw new Error("Active campaign battle cannot be migrated because its frozen tactical template is missing.");
  }
  const template = getBattleTemplateByKey(context.templateKey);
  if (!template || !template.campaignKeys.includes(battlePackage.scenarioKey)
    || !template.missionTypes.includes(context.missionType)) {
    throw new Error(`Active campaign battle cannot be migrated because template '${context.templateKey}' is incompatible with campaign '${battlePackage.scenarioKey}'.`);
  }

  const scenario = original.battle.engineConfig.scenario;
  const templateScenario = normalizeScenarioSource(template.scenario as RawScenarioInput, { turnLimit: 0 });
  if (campaignGeometryFingerprint(scenario) !== campaignGeometryFingerprint(templateScenario)) {
    throw new Error(`Active campaign battle cannot be migrated because its saved geometry does not match template '${template.key}'.`);
  }
  assertCompatibleIdentity("template identity", scenario.campaignTemplateKey, template.key);
  assertCompatibleIdentity("template role", scenario.campaignTemplatePlayerRole, template.playerRole);
  assertCompatibleIdentity("Player role", scenario.campaignPlayerRole, playerRole);
  assertCompatibleIdentity("mission type", scenario.campaignMissionType, context.missionType);
  assertCompatibleIdentity("battle hex", scenario.campaignBattleHexKey, context.battleHexKey);
  assertCompatibleIdentity("engagement identity", scenario.campaignEngagementId, context.engagementId);
  assertCompatibleIdentity("battle package identity", scenario.campaignBattlePackageId, battlePackage.packageId);
  assertCompatibleIdentity(
    "infrastructure effectiveness",
    scenario.campaignInfrastructureEffectiveness,
    context.infrastructureEffectiveness ?? 1
  );

  const savedBridgePackage = original.battle.campaignBridge?.battlePackage;
  if (savedBridgePackage && savedBridgePackage.packageId !== battlePackage.packageId) {
    throw new Error("Active campaign battle cannot be migrated because its tactical bridge references another commitment package.");
  }
  const deadlineOutcome = isLegacyDeadlineOutcome(original.battle.missionRules.data["outcome"])
    || isLegacyDeadlineOutcome(original.battle.missionStatus.outcome);
  const missionRules: SerializedMissionRulesState = deadlineOutcome
    ? {
        ...original.battle.missionRules,
        data: { ...original.battle.missionRules.data, outcome: { state: "inProgress" } }
      }
    : original.battle.missionRules;
  const missionStatus: MissionStatus = {
    ...original.battle.missionStatus,
    outcome: deadlineOutcome ? { state: "inProgress" } : original.battle.missionStatus.outcome,
    objectives: original.battle.missionStatus.objectives.map((objective) => ({
      ...objective,
      ...(objective.id === "campaign_control_engagement_area" ? {
        label: playerRole === "defender" ? "Hold the engagement area" : "Secure the engagement area",
        state: deadlineOutcome ? "inProgress" as const : objective.state,
        detail: `${objective.detail
          ?.replace(/\s*(?:\d+\s+turns?\s+remain\..*|No fixed tactical deadline\.)$/i, "")
          .trim() ?? ""} No fixed tactical deadline.`.trim()
      } : deadlineOutcome ? { state: "inProgress" as const } : {})
    }))
  };
  const engagementLabel = MISSION_TYPE_LABELS[context.missionType];
  const title = playerRole === "defender"
    ? `${engagementLabel} Defense — Hex ${context.battleHexKey}`
    : `${engagementLabel} — Hex ${context.battleHexKey}`;
  const briefing = playerRole === "defender"
    ? `Opposing forces have opened a ${engagementLabel.toLowerCase()} at operational hex ${context.battleHexKey}. Hold the marked tactical ground or break the attacking ground force; objective control or force collapse decides the engagement.`
    : `Friendly forces are opening a ${engagementLabel.toLowerCase()} at operational hex ${context.battleHexKey}. Secure the marked tactical ground or break the opposing ground force; objective control or force collapse decides the engagement.`;
  const doctrine = playerRole === "defender"
    ? "Hold coherent defensive ground, preserve the committed formations, and counterattack only when the opposing attack loses cohesion."
    : "Concentrate the committed formations, secure the tactical objective network, and preserve a viable force for the campaign that follows.";
  const precombatMission: PrecombatMissionInfo = {
    ...original.battle.precombatMission,
    campaignTitle: original.battle.precombatMission.campaignTitle
      ?? original.engagementPackage.bridge.scenario?.title
      ?? "Campaign Operation",
    title,
    briefing,
    objectives: missionStatus.objectives.map((objective) => (
      `${objective.tier.charAt(0).toUpperCase()}${objective.tier.slice(1)}: ${objective.label}`
    )),
    doctrine,
    turnLimit: null
  };
  const normalizedScenario: GameEngineConfig["scenario"] = {
    ...scenario,
    turnLimit: 0,
    campaignTemplateKey: template.key,
    campaignTemplatePlayerRole: template.playerRole,
    campaignPlayerRole: playerRole,
    campaignMissionType: context.missionType,
    campaignBattleHexKey: context.battleHexKey,
    campaignEngagementId: context.engagementId,
    campaignBattlePackageId: battlePackage.packageId,
    campaignInfrastructureEffectiveness: context.infrastructureEffectiveness ?? 1
  };
  return {
    ...original,
    battle: {
      ...original.battle,
      engineConfig: { ...original.battle.engineConfig, scenario: normalizedScenario },
      missionRules,
      missionStatus,
      precombatMission,
      campaignBridge: structuredClone(original.engagementPackage.bridge)
    }
  };
}

/** Throws before hydration when a tactical snapshot is partial, malformed, or cross-bound. */
export function assertCompleteActiveCampaignBattleSave(
  value: unknown,
  expected?: {
    readonly campaignId: string;
    readonly campaignRevision: number;
    readonly scenarioKey: string;
    readonly engagementId: string;
  }
): ActiveCampaignBattleSave {
  if (!isRecord(value) || value.version !== COMPLETE_BATTLE_SAVE_VERSION) {
    throw new Error("Active battle save has an unsupported or missing version.");
  }
  if (!isRecord(value.engagementPackage) || !isRecord(value.battle) || !isRecord(value.tacticalUI)) {
    throw new Error("Active battle save is missing its package, battle, or tactical UI record.");
  }
  const battle = value.battle;
  const engine = battle.engine;
  if (battle.version !== COMPLETE_BATTLE_SAVE_VERSION || !isRecord(engine)
    || engine.completeStateVersion !== 1 || !isRecord(battle.engineConfig)) {
    throw new Error("Active battle save did not pass the complete engine-state gate.");
  }
  const missingFields = REQUIRED_COMPLETE_ENGINE_FIELDS.filter((field) => !(field in engine));
  if (missingFields.length > 0) {
    throw new Error(`Active battle save is incomplete: ${missingFields.join(", ")}.`);
  }
  if (!isRecord(battle.missionRules) || battle.missionRules.version !== 1
    || !isRecord(battle.missionStatus) || !isRecord(battle.boundary)) {
    throw new Error("Active battle save is missing mission-rule or stable-boundary state.");
  }
  const pkg = value.engagementPackage;
  if (pkg.packageVersion !== CAMPAIGN_BATTLE_SAVE_PACKAGE_VERSION
    || typeof pkg.campaignId !== "string" || !Number.isInteger(pkg.campaignRevision)
    || typeof pkg.scenarioKey !== "string" || typeof pkg.engagementId !== "string"
    || typeof pkg.commitmentPackageId !== "string" || pkg.commitmentPackageId.trim().length === 0
    || typeof pkg.commitmentIntegrityHash !== "string" || pkg.commitmentIntegrityHash.trim().length === 0
    || !isRecord(pkg.bridge)) {
    throw new Error("Active battle save campaign binding is malformed.");
  }
  if (expected && (pkg.campaignId !== expected.campaignId
    || pkg.campaignRevision !== expected.campaignRevision
    || pkg.scenarioKey !== expected.scenarioKey
    || pkg.engagementId !== expected.engagementId)) {
    throw new Error("Active battle save belongs to a different campaign or engagement revision.");
  }
  if (!isRecord(pkg.bridge.battlePackage)) {
    throw new Error("Active battle save is missing its frozen campaign commitment package.");
  }
  const battlePackage = assertCampaignBattlePackage(pkg.bridge.battlePackage as unknown as CampaignBattlePackage, {
    campaignId: pkg.campaignId as string,
    scenarioKey: pkg.scenarioKey as string,
    engagementId: pkg.engagementId as string,
    packageId: pkg.commitmentPackageId as string
  });
  if (battlePackage.integrityHash !== pkg.commitmentIntegrityHash) {
    throw new Error("Active battle save commitment integrity does not match its campaign package.");
  }
  const tacticalUI = value.tacticalUI;
  if (!Array.isArray(tacticalUI.activityEvents) || !Array.isArray(tacticalUI.seenAirReportIds)
    || !Array.isArray(tacticalUI.initiativeSkippedUnitIds)
    || !Number.isInteger(tacticalUI.activityEventSequence)
    || !(tacticalUI.focusedElementId === null || typeof tacticalUI.focusedElementId === "string")) {
    throw new Error("Active battle save tactical UI resume context is malformed.");
  }
  return migrateCampaignBattleRules(value, battlePackage);
}
