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
  return structuredClone(value) as unknown as ActiveCampaignBattleSave;
}
