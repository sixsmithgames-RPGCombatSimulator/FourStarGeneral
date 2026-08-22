/**
 * MODULE: campaignRuntimeTypes
 * WHAT: Defines the versioned Campaign 2.0 authored-definition, runtime-state, event, and transaction contracts.
 * WHY: Campaign systems need one explicit owner for mutable truth that is separate from immutable scenario content.
 *
 * DEPENDENCIES: Existing campaign and intelligence types provide compatibility with shipped campaign data.
 * EXPORTS: Runtime version constants, scenario/runtime records, events, reports, errors, and transaction result types.
 */

import type {
  CampaignDecision,
  CampaignArcDefinition,
  CampaignFactionEconomy,
  CampaignFactionKey,
  CampaignForceGroup,
  CampaignFrontLine,
  CampaignInfrastructureState,
  CampaignMapExtents,
  CampaignObjective,
  CampaignPendingEngagement,
  CampaignScenarioData,
  CampaignTileDefinition,
  CampaignTurnState
} from "../../../core/campaignTypes";
import type { Axial } from "../../../core/types";
import type { CampaignKnowledgeState } from "../../../core/campaignIntelTypes";
import type { CampaignOrder, CampaignReservation } from "../orders/CampaignOrderTypes";
import type { CampaignFormationRecord } from "../formations/campaignFormationTypes";
import type { CampaignEngagementLedgerRecord } from "../engagements/CampaignEngagementLedgerTypes";
import type { CampaignAITheaterAssessment } from "../ai/CampaignAIAssessmentTypes";
import type { CampaignAIPlanningRecord } from "../ai/CampaignAIPlanningTypes";
import type { CampaignAIBehaviorRecord } from "../ai/CampaignAIBehaviorTypes";

/** Current authored Campaign 2.0 definition schema. */
export const CAMPAIGN_SCENARIO_DEFINITION_VERSION = 1;

/** Current mutable Campaign 2.0 runtime schema. */
export const CAMPAIGN_RUNTIME_VERSION = 1;

/** Current serialized named-random-stream schema. */
export const CAMPAIGN_RANDOM_STATE_VERSION = 1;

/**
 * Recursively marks campaign content read-only at compile time.
 * Runtime creation also freezes definitions so accidental writes fail at runtime.
 */
export type CampaignReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer TEntry)[]
      ? readonly CampaignReadonly<TEntry>[]
      : T extends object
        ? { readonly [TKey in keyof T]: CampaignReadonly<T[TKey]> }
        : T;

/** High-level state controlling which campaign operations are currently legal. */
export type CampaignRuntimeStatus = "planning" | "resolving" | "engagement" | "victory" | "defeat";

/** Named streams isolate subsystem random consumption from unrelated campaign rules. */
export type CampaignRandomStreamName =
  | "weather"
  | "movement"
  | "intelligence"
  | "aiTieBreak"
  | "delegatedCombat"
  | "identity";

/** Serializable deterministic random state stored in every Campaign 2.0 save. */
export interface SerializedCampaignRandomState {
  readonly version: typeof CAMPAIGN_RANDOM_STATE_VERSION;
  readonly baseSeed: number;
  readonly streams: Readonly<Record<CampaignRandomStreamName, number>>;
}

/** Immutable map/content fields separated from mutable campaign truth. */
export interface CampaignScenarioMapDefinition {
  readonly dimensions: CampaignReadonly<CampaignScenarioData["dimensions"]>;
  readonly mapExtents?: CampaignReadonly<CampaignMapExtents>;
  readonly background: CampaignReadonly<CampaignScenarioData["background"]>;
  readonly tilePalette: CampaignReadonly<Record<string, CampaignTileDefinition>>;
  readonly briefedStrategicSites?: CampaignReadonly<NonNullable<CampaignScenarioData["briefedStrategicSites"]>>;
  readonly initialFronts: readonly CampaignReadonly<CampaignFrontLine>[];
}

/** Immutable starting state used once to create a mutable campaign runtime. */
export interface CampaignInitialStateDefinition {
  readonly tiles: readonly CampaignReadonly<CampaignScenarioData["tiles"][number]>[];
  readonly economies: readonly CampaignReadonly<CampaignFactionEconomy>[];
}

/** Authored Campaign 2.0 scenario definition. */
export interface CampaignScenarioDefinition {
  readonly schemaVersion: typeof CAMPAIGN_SCENARIO_DEFINITION_VERSION;
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly historicalCalendar?: CampaignReadonly<NonNullable<CampaignScenarioData["historicalCalendar"]>>;
  readonly hexScaleKm: number;
  readonly map: CampaignScenarioMapDefinition;
  readonly objectives: readonly CampaignReadonly<CampaignObjective>[];
  readonly campaignArc?: CampaignReadonly<CampaignArcDefinition>;
  readonly initialState: CampaignInitialStateDefinition;
}

/** Mutable truth for one campaign tile. */
export interface CampaignTileRuntime {
  readonly hexKey: string;
  readonly hex: Axial;
  readonly tileKey: string;
  controller: CampaignFactionKey;
  controlSinceSegment: number;
  /** Authoritative persistent formations currently placed on this tile, in stable campaign order. */
  formationIds: string[];
  /** Transitional aggregate projection retained for shipped campaign rules and UI. */
  forces: CampaignForceGroup[];
  spriteKey?: string;
  rotation?: number;
  legacyControlSinceDay?: number;
  /** Persistent facility integrity/capture/repair truth. Absent only on pre-C20-025 development saves. */
  infrastructure?: CampaignInfrastructureState;
}

/** Mutable economy record keyed by faction in the runtime. */
export interface CampaignFactionRuntime {
  readonly faction: CampaignFactionKey;
  economy: CampaignFactionEconomy;
}

/** Lifecycle state for a migrated or newly created tactical engagement opportunity. */
export type CampaignEngagementStatus =
  | "opportunity"
  | "planned"
  | "committed"
  | "inBattle"
  | "resolved"
  | "cancelled"
  | "abandoned";

/** Runtime wrapper that adds authoritative lifecycle state to the shipped engagement contract. */
export interface CampaignEngagementRuntime {
  readonly id: string;
  status: CampaignEngagementStatus;
  engagement: CampaignPendingEngagement;
}

export type CampaignObjectiveRuntimeStatus = "locked" | "active" | "completed" | "failed";
export type CampaignOutcomeGrade = "decisiveVictory" | "victory" | "costlyVictory" | "defeat";

/** Authoritative, explanation-ready state for one campaign objective. */
export interface CampaignObjectiveRuntime {
  readonly objectiveKey: string;
  status: CampaignObjectiveRuntimeStatus;
  /** Normalized inclusive progress in the range 0-1. */
  progress: number;
  rewardApplied: boolean;
  /** Optional on runtime-v1 saves created before C20-026; reconciliation supplies it. */
  activatedSegment?: number | null;
  resolvedSegment?: number | null;
  scoreAwarded?: number;
  progressCurrent?: number;
  progressTarget?: number;
  progressLabel?: string;
  conditionLabels?: string[];
}

/** Transparent campaign score retained in saves and the terminal record. */
export interface CampaignScoreRuntime {
  earned: number;
  available: number;
  percent: number;
  projectedGrade: CampaignOutcomeGrade;
}

/** Immutable-in-practice recorded campaign result created at most once. */
export interface CampaignOutcomeRuntime {
  readonly result: "victory" | "defeat";
  readonly grade: CampaignOutcomeGrade;
  readonly segment: number;
  readonly phaseKey: string;
  readonly scoreEarned: number;
  readonly scoreAvailable: number;
  readonly completedObjectiveKeys: string[];
  readonly failedObjectiveKeys: string[];
  readonly summary: string;
  /** True only after the player explicitly leaves the recorded result for non-scoring sandbox play. */
  sandboxContinued: boolean;
}

/**
 * Explicit bridge for state the shipped campaign UI still needs while runtime-v2 services are introduced.
 * New Campaign 2.0 resolvers must not mutate this compatibility record.
 */
export interface CampaignLegacyCompatibilityState {
  readonly initialFronts: CampaignFrontLine[];
  queuedDecisions: CampaignDecision[];
  turnState: CampaignTurnState | null;
}

/** Scalar event detail types keep the event log serializable and safe for localization adapters. */
export type CampaignEventDetailValue = string | number | boolean | null;

/** Typed draft emitted by a domain mutator before transaction metadata is assigned. */
export interface CampaignDomainEventDraft {
  readonly type: "runtimeCreated" | "stateChanged" | "segmentAdvanced" | "transactionCommitted";
  readonly category: "system" | "orders" | "movement" | "logistics" | "intelligence" | "engagement" | "control" | "objectives" | "environment";
  readonly summary: string;
  readonly details: Readonly<Record<string, CampaignEventDetailValue>>;
}

/** Immutable material state change stored in campaign history and resolution reports. */
export interface CampaignDomainEvent extends CampaignDomainEventDraft {
  readonly id: string;
  readonly campaignId: string;
  readonly revision: number;
  readonly sequence: number;
  readonly segment: number;
}

/** Stable resolver phase identities. Their order is part of the Campaign 2.0 rules contract. */
export type CampaignSegmentPhase =
  | "timeBoundary"
  | "environment"
  | "orders"
  | "movement"
  | "logistics"
  | "intelligence"
  | "engagements"
  | "consequences"
  | "control"
  | "objectives"
  | "finalize";

/** Persisted proof of the legal information boundary frozen for one faction. */
export interface CampaignFrozenFactionViewCheckpoint {
  readonly faction: CampaignFactionKey;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly contentHash: string;
}

/** One deterministic resolver phase outcome retained in the aggregate report. */
export interface CampaignSegmentPhaseReport {
  readonly phase: CampaignSegmentPhase;
  readonly sequence: number;
  readonly eventCount: number;
  readonly affectedRecordIds: readonly string[];
}

/** Metadata supplied by a domain resolver before transaction identity and event IDs are assigned. */
export interface CampaignResolutionMetadata {
  readonly resolutionKind: "transaction" | "segment";
  readonly fromSegment: number;
  readonly toSegment: number;
  readonly frozenFactionViews: readonly CampaignFrozenFactionViewCheckpoint[];
  readonly phaseReports: readonly CampaignSegmentPhaseReport[];
}

/** Rich mutator response used when a resolver needs to attach deterministic report metadata. */
export interface CampaignRuntimeMutation {
  readonly events: readonly CampaignDomainEventDraft[];
  readonly resolution?: CampaignResolutionMetadata;
}

/** Transaction summary used by save, UI, AAR, and deterministic diagnostics. */
export interface CampaignResolutionReport {
  readonly transactionId: string;
  readonly label: string;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly segment: number;
  readonly eventIds: readonly string[];
  readonly resolutionKind: "transaction" | "segment";
  readonly fromSegment: number;
  readonly toSegment: number;
  readonly frozenFactionViews: readonly CampaignFrozenFactionViewCheckpoint[];
  readonly phaseReports: readonly CampaignSegmentPhaseReport[];
}

/** Player intent controlling how many ordinary three-hour transactions may be orchestrated. */
export type CampaignAdvanceMode = "segment" | "nextReport" | "dawn" | "dusk" | "day";

/** Player-facing importance. Severity does not by itself imply that simulation must stop. */
export type CampaignAdvanceAlertSeverity = "routine" | "notable" | "critical" | "decisionRequired";

/** Semantic destination used by the command shell without exposing unrestricted campaign truth. */
export type CampaignAdvanceAlertTargetKind =
  | "time"
  | "order"
  | "intelligence"
  | "engagement"
  | "objective"
  | "formation"
  | "campaign";

/** Machine-readable explanation for the end of one bounded advance command. */
export type CampaignAdvanceStopReason =
  | "segmentComplete"
  | "nextReport"
  | "dawn"
  | "dusk"
  | "dayComplete"
  | "pauseAfterResolution"
  | "engagement"
  | "objectiveChanged"
  | "blockedOrder"
  | "formationAtRisk"
  | "campaignEnded"
  | "criticalAlert"
  | "resolutionFailed"
  | "safetyLimit";

/** Persisted, Player-safe notification raised by a resolved segment. */
export interface CampaignAdvanceAlert {
  readonly id: string;
  readonly severity: CampaignAdvanceAlertSeverity;
  readonly category: CampaignDomainEventDraft["category"];
  readonly segment: number;
  readonly title: string;
  readonly detail: string;
  readonly targetKind: CampaignAdvanceAlertTargetKind;
  readonly targetId: string | null;
  readonly requiresStop: boolean;
}

/** One save-stable checkpoint in a possibly multi-segment advance command. */
export interface CampaignAdvanceStepRecord {
  readonly id: string;
  readonly commandId: string;
  readonly transactionId: string;
  readonly mode: CampaignAdvanceMode;
  readonly fromSegment: number;
  readonly toSegment: number;
  readonly targetSegment: number | null;
  readonly revision: number;
  readonly eventCount: number;
  readonly alerts: readonly CampaignAdvanceAlert[];
  readonly stopped: boolean;
  readonly stopReason: CampaignAdvanceStopReason | null;
}

/** Authoritative mutable Campaign 2.0 truth. */
export interface CampaignRuntimeState {
  readonly runtimeVersion: typeof CAMPAIGN_RUNTIME_VERSION;
  readonly campaignId: string;
  readonly scenarioKey: string;
  readonly scenarioContentHash: string;
  revision: number;
  status: CampaignRuntimeStatus;
  currentSegment: number;
  activeEngagementId: string | null;
  rng: SerializedCampaignRandomState;
  readonly tileOrder: string[];
  tiles: Record<string, CampaignTileRuntime>;
  readonly factionOrder: string[];
  factions: Record<string, CampaignFactionRuntime>;
  readonly formationOrder: string[];
  formations: Record<string, CampaignFormationRecord>;
  readonly engagementOrder: string[];
  engagements: Record<string, CampaignEngagementRuntime>;
  /** Append-only battle commitment and result-receipt authority. */
  readonly engagementLedgerOrder: string[];
  engagementLedger: Record<string, CampaignEngagementLedgerRecord>;
  readonly objectiveOrder: string[];
  objectives: Record<string, CampaignObjectiveRuntime>;
  /** C20-026 fields are optional only so runtime-v1 saves can be reconciled without data loss. */
  campaignPhaseKey?: string;
  campaignPhaseEnteredSegment?: number;
  campaignScore?: CampaignScoreRuntime;
  campaignOutcome?: CampaignOutcomeRuntime | null;
  awardedRewardKeys?: string[];
  /** Mutable report acknowledgement is stored separately from integrity-bound AAR history. */
  acknowledgedAfterActionReportIds?: string[];
  /** Mutable command-alert acknowledgement; required decisions remain unresolved until their domain state changes. */
  acknowledgedCampaignAlertIds?: string[];
  readonly orderOrder: string[];
  orders: Record<string, CampaignOrder>;
  readonly reservationOrder: string[];
  reservations: Record<string, CampaignReservation>;
  knowledgeByFaction: Record<string, CampaignKnowledgeState>;
  /** Latest private belief-constrained operational assessment by AI-controlled faction. */
  aiAssessmentsByFaction?: Record<string, CampaignAITheaterAssessment>;
  /** Latest private operational portfolio and bounded memory by AI-controlled faction. */
  aiPlanningByFaction?: Record<string, CampaignAIPlanningRecord>;
  /** Latest private proof that selected plans used common typed-order behavior adapters. */
  aiBehaviorsByFaction?: Record<string, CampaignAIBehaviorRecord>;
  eventLog: CampaignDomainEvent[];
  lastResolution: CampaignResolutionReport | null;
  readonly advanceRecordOrder: string[];
  advanceRecords: Record<string, CampaignAdvanceStepRecord>;
  compatibility: CampaignLegacyCompatibilityState;
}

/** Complete compatibility snapshot used to feed the shipped campaign facade during migration. */
export interface CampaignLegacyProjection {
  readonly scenario: CampaignScenarioData;
  readonly currentSegment: number;
  readonly turnState: CampaignTurnState | null;
  readonly activeEngagementId: string | null;
  readonly queuedDecisions: CampaignDecision[];
  readonly engagements: CampaignPendingEngagement[];
  readonly intelligenceByFaction: Record<string, CampaignKnowledgeState>;
}

/** Structured invariant failure so tests and future player error surfaces can explain invalid state. */
export interface CampaignInvariantIssue {
  readonly code:
    | "RUNTIME_VERSION_INVALID"
    | "CAMPAIGN_ID_INVALID"
    | "SCENARIO_KEY_INVALID"
    | "CONTENT_HASH_INVALID"
    | "REVISION_INVALID"
    | "SEGMENT_INVALID"
    | "SEGMENT_RESOLUTION_INVALID"
    | "STATUS_INVALID"
    | "RANDOM_STATE_INVALID"
    | "TILE_ORDER_INVALID"
    | "TILE_KEY_INVALID"
    | "TILE_CONTROL_INVALID"
    | "FORCE_COUNT_INVALID"
    | "FORMATION_ORDER_INVALID"
    | "FORMATION_INVALID"
    | "FORMATION_PLACEMENT_INVALID"
    | "FORMATION_PROJECTION_INVALID"
    | "FACTION_ORDER_INVALID"
    | "ECONOMY_INVALID"
    | "ENGAGEMENT_INVALID"
    | "ENGAGEMENT_LEDGER_INVALID"
    | "ENGAGEMENT_COMMITMENT_INVALID"
    | "ACTIVE_ENGAGEMENT_INVALID"
    | "OBJECTIVE_INVALID"
    | "ORDER_INVALID"
    | "RESERVATION_INVALID"
    | "KNOWLEDGE_OWNER_INVALID"
    | "AI_ASSESSMENT_INVALID"
    | "AI_PLANNING_INVALID"
    | "AI_BEHAVIOR_INVALID"
    | "EVENT_LOG_INVALID"
    | "ADVANCE_LOG_INVALID";
  readonly path: string;
  readonly message: string;
}

/** Stable error codes thrown by campaign runtime creation and assertion APIs. */
export type CampaignRuntimeErrorCode =
  | "INVALID_SCENARIO"
  | "INVALID_RANDOM_STATE"
  | "INVALID_RANDOM_RANGE"
  | "INVALID_RUNTIME"
  | "CANONICALIZATION_FAILED"
  | "TRANSACTION_FAILED";

/**
 * Error carrying a stable code and actionable diagnostic context.
 * Callers may convert this into the project's player-facing error shape when the runtime is integrated.
 */
export class CampaignRuntimeError extends Error {
  public readonly code: CampaignRuntimeErrorCode;
  public readonly context: Readonly<Record<string, CampaignEventDetailValue>>;

  /**
   * WHAT: Creates a campaign runtime error with stable diagnostic metadata.
   * WHY: Runtime failures must be explicit and machine-readable rather than silently defaulting state.
   *
   * @param code - Stable failure category.
   * @param message - Human-readable diagnostic explanation.
   * @param context - Scalar facts that help locate and recover from the failure.
   */
  public constructor(
    code: CampaignRuntimeErrorCode,
    message: string,
    context: Readonly<Record<string, CampaignEventDetailValue>> = {}
  ) {
    super(message);
    this.name = "CampaignRuntimeError";
    this.code = code;
    this.context = context;
  }
}

/** Successful atomic campaign runtime transaction. */
export interface CampaignTransactionCommitted {
  readonly ok: true;
  readonly state: CampaignRuntimeState;
  readonly report: CampaignResolutionReport;
}

/** Rejected transaction retaining the exact last safe state. */
export interface CampaignTransactionRejected {
  readonly ok: false;
  readonly state: CampaignRuntimeState;
  readonly error: CampaignRuntimeError;
  readonly issues: readonly CampaignInvariantIssue[];
}

/** Result returned by the runtime transaction boundary. */
export type CampaignTransactionResult = CampaignTransactionCommitted | CampaignTransactionRejected;
