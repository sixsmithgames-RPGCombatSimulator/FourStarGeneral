import type {
  CampaignDecision,
  CampaignEngagementContext,
  CampaignFactionKey,
  CampaignPendingEngagement,
  CampaignScenarioData,
  CampaignTurnState,
  CampaignTileInstance,
  ProductionAllocation
} from "../core/campaignTypes";
import type {
  CampaignIntelBriefEvent,
  CampaignIntelOperationView,
  CampaignIntelOperationType,
  CampaignIntelligenceBriefing,
  CampaignKnowledgeState,
  CampaignMapViewModel
} from "../core/campaignIntelTypes";
import { hexDistance } from "../core/Hex";
import type { ScenarioUnit } from "../core/types";
import { getTransportMode } from "../data/transportModes";
import {
  buildEngagementContext,
  type BuildEngagementContextOptions
} from "../game/campaign/EngagementContextBuilder";
import {
  INTEL_OPERATION_RULES,
  buildCampaignMapView,
  buildIntelligenceBriefing,
  calculateIntelCapacity,
  createCampaignKnowledgeState,
  createIntelOperation,
  findEligibleIntelAssets,
  getCommittedCapacity,
  isIntelAssetInRange,
  recordBattlefieldIntelligence
} from "./CampaignIntelligence";
import { computeCampaignContentHash, createStableCampaignRecordId } from "../game/campaign/runtime/CampaignCanonical";
import {
  createCampaignRuntime,
  projectLegacyCampaignState,
  splitLegacyCampaignScenario
} from "../game/campaign/runtime/CampaignScenarioAdapter";
import { runCampaignRuntimeTransaction } from "../game/campaign/runtime/CampaignRuntimeTransaction";
import {
  type CampaignSegmentResolutionResult
} from "../game/campaign/runtime/CampaignSegmentResolver";
import {
  advanceCampaignRuntime,
  type CampaignAdvanceRequest,
  type CampaignAdvanceResult
} from "../game/campaign/runtime/CampaignAdvanceController";
import {
  CampaignRuntimeError,
  type CampaignInvariantIssue,
  CampaignLegacyProjection,
  type CampaignAdvanceStepRecord,
  type CampaignDomainEventDraft,
  type CampaignResolutionReport,
  type CampaignRuntimeState,
  type CampaignScenarioDefinition
} from "../game/campaign/runtime/campaignRuntimeTypes";
import {
  campaignOffsetKeyToRuntimeHexKey,
  commitCampaignOrderDrafts,
  createInfrastructureRepairOrderDraft,
  createIntelligenceOrderDraft,
  createProductionOrderDraft,
  createRedeployOrderDraft,
  moveCampaignOrderDraft,
  projectCampaignOrders,
  removeCampaignOrderDraft,
  revalidateCampaignOrderBook,
  setCampaignOrderReservationStatus
} from "../game/campaign/orders/CampaignOrderService";
import type {
  CampaignInfrastructureRepairOrderPayload,
  CampaignIntelligenceOrderPayload,
  CampaignOrder,
  CampaignOrderActionPreview,
  CampaignOrderCancellationPreview,
  CampaignOrderCommitPreview,
  CampaignOrderValidationCode,
  CampaignRedeployOrderPayload
} from "../game/campaign/orders/CampaignOrderTypes";
import {
  evaluateCampaignObjectives,
  getCampaignPhaseLabel,
  projectCampaignObjectives,
  reconcileCampaignObjectiveRuntime,
  type CampaignObjectivePresentation
} from "../game/campaign/objectives/CampaignObjectiveEvaluator";
import { calculateCampaignRedeploymentCosts } from "../game/campaign/orders/CampaignRedeployRules";
import {
  campaignInfrastructureRepairCosts,
  campaignInfrastructureRepairRate
} from "../game/campaign/infrastructure/CampaignInfrastructureRules";
import {
  DEFAULT_PRODUCTION_ALLOCATION,
  computeDailyProduction
} from "../game/campaign/logistics/CampaignProductionRules";
export {
  DEFAULT_PRODUCTION_ALLOCATION,
  PRODUCTION_RATES,
  computeDailyProduction
} from "../game/campaign/logistics/CampaignProductionRules";
import { IndexedDbCampaignSaveBackend } from "../game/campaign/persistence/CampaignSaveBackend";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../game/campaign/persistence/CampaignSaveEnvelope";
import { migrateLegacyCampaignSave } from "../game/campaign/persistence/CampaignSaveMigration";
import {
  CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH,
  CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH,
  CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH,
  migrateCampaignRuntimeContent
} from "../game/campaign/persistence/CampaignContentMigration";
import {
  CampaignSaveRepository,
  type CampaignSaveSlotLoadOptions
} from "../game/campaign/persistence/CampaignSaveRepository";
import {
  CampaignSaveError,
  type CampaignSaveExpectedContent,
  type CampaignSaveLoadFailure,
  type CampaignSaveQuarantineRecord,
  type CampaignSaveRecoveryCandidate,
  type CampaignSaveSlotIndexEntry,
  type CampaignSaveStorageBackend,
  type CampaignUiResumeContext,
  type FourStarSaveSlotType,
  type FourStarCampaignSaveEnvelope
} from "../game/campaign/persistence/CampaignSaveTypes";
import {
  assertCompleteActiveCampaignBattleSave,
  type ActiveCampaignBattleSave
} from "../game/battle/persistence/BattleSaveTypes";
import { reconcileCampaignFormationForceCounts } from "../game/campaign/formations/FormationLifecycleService";
import {
  attachCampaignFormationProvenanceToContext,
  createCampaignFormationBattleSeed,
  selectCampaignFormationsForAllocation
} from "../game/campaign/formations/CampaignFormationBattleAdapter";
import type { CampaignFormationRecord } from "../game/campaign/formations/campaignFormationTypes";
import type { CampaignAITheaterAssessment } from "../game/campaign/ai/CampaignAIAssessmentTypes";
import type { CampaignAIPlanningRecord } from "../game/campaign/ai/CampaignAIPlanningTypes";
import type { CampaignAIBehaviorRecord } from "../game/campaign/ai/CampaignAIBehaviorTypes";
import {
  commitCampaignEngagement as commitCampaignEngagementPackage,
  getCampaignBattlePackage,
  planCampaignEngagement,
  reconcileCampaignEngagementLedger,
  recordCampaignEngagementResolution
} from "../game/campaign/engagements/CampaignEngagementLedgerService";
import type {
  CampaignBattlePackage,
  CampaignEngagementCommitmentRequest,
  CampaignEngagementLedgerRecord
} from "../game/campaign/engagements/CampaignEngagementLedgerTypes";
import { assertCampaignBattleResultPackage } from "../game/campaign/results/CampaignBattleResultExtractor";
import type { CampaignBattleResultPackage } from "../game/campaign/results/CampaignBattleResultTypes";
import { applyCampaignBattleConsequences } from "../game/campaign/consequences/CampaignBattleConsequenceResolver";
import type { CampaignBattleConsequenceReport } from "../game/campaign/consequences/CampaignBattleConsequenceTypes";
import { applyCampaignBattleControl } from "../game/campaign/control/CampaignBattleControlResolver";
import type { CampaignBattleControlReport } from "../game/campaign/control/CampaignBattleControlTypes";
import { applyCampaignBattleInfrastructure } from "../game/campaign/infrastructure/CampaignBattleInfrastructureResolver";
import type { CampaignBattleInfrastructureReport } from "../game/campaign/infrastructure/CampaignBattleInfrastructureTypes";
import { reconcileCampaignInfrastructure } from "../game/campaign/infrastructure/CampaignInfrastructureRules";
import {
  assertCampaignAfterActionReport,
  buildCampaignAfterActionReport,
  projectCampaignAfterActionReports
} from "../game/campaign/aar/CampaignAfterActionReportService";
import type {
  CampaignAfterActionReport,
  CampaignAfterActionReportPresentation
} from "../game/campaign/aar/CampaignAfterActionReportTypes";

/** Shipped legacy localStorage record retained until a later explicit retirement policy. */
export const CAMPAIGN_LEGACY_SAVE_KEY = "fourstar.campaign.save.v1";

/** Separate marker proving a legacy record was written and verified in Campaign 2.0 storage. */
export const CAMPAIGN_LEGACY_MIGRATION_MARKER_KEY = "fourstar.campaign.migration.v2";

/** Primary manual slot used until the named save-browser interface lands. */
export const CAMPAIGN_PRIMARY_SAVE_SLOT_ID = "campaign-primary";

/** One copy-on-write slot whose history forms the recoverable post-battle checkpoint chain. */
export const CAMPAIGN_POST_BATTLE_AUTOSAVE_SLOT_PREFIX = "campaign-post-battle";

/** Current application build identity embedded in live Campaign 2.0 saves. */
export const CAMPAIGN_SAVE_BUILD_VERSION = "1.0.0";

/** Current campaign rules/content identity embedded in live Campaign 2.0 saves. */
export const CAMPAIGN_SAVE_CONTENT_VERSION = "campaign-content-1";

/** Minimal legacy storage boundary; the original save is read but never changed by the Campaign 2.0 path. */
export interface CampaignLegacyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Injectable persistence/configuration dependencies for CampaignState and deterministic integration tests. */
export interface CampaignStateOptions {
  readonly saveBackend?: CampaignSaveStorageBackend;
  readonly legacyStorage?: CampaignLegacyStorage | null;
  readonly buildVersion?: string;
  readonly contentVersion?: string;
}

/** Explicit metadata and UI context required to create or migrate the primary campaign save. */
export interface CampaignStatePersistenceRequest {
  readonly timestamp: string;
  readonly label: string;
  readonly playTimeSeconds: number;
  readonly difficulty: string | null;
  readonly commanderRosterLink: string | null;
  readonly uiResumeContext: CampaignUiResumeContext;
}

/** Named-slot extension used by the Campaign 2.0 save browser and tactical save coordinator. */
export interface CampaignStateSlotSaveRequest extends CampaignStatePersistenceRequest {
  readonly slotId: string;
  readonly slotType: FourStarSaveSlotType;
  readonly thumbnailKey?: string | null;
}

export interface CampaignPostBattleAutosaveStatus {
  readonly reportId: string;
  readonly state: "saving" | "saved" | "failed";
  readonly message: string;
}

/** Successful primary-slot load source and optional non-fatal marker warning. */
export interface CampaignStateLoadSuccess {
  readonly ok: true;
  readonly envelope: FourStarCampaignSaveEnvelope;
  readonly source: "campaign2" | "legacyMigration" | "recovery";
  readonly warning: string | null;
}

/** Primary-slot load result that preserves repository recovery semantics. */
export type CampaignStateLoadResult = CampaignStateLoadSuccess | CampaignSaveLoadFailure;

/** Result of resolving one actionable front entirely from current campaign truth. */
export type CampaignFrontEngagementPreparation = {
  readonly ok: true;
  readonly engagement: CampaignPendingEngagement & { readonly context: CampaignEngagementContext };
} | {
  readonly ok: false;
  readonly reason: string;
  readonly targetRequired: boolean;
};

// Hexes per day by unit type. Slowest selected unit determines redeploy ETA.
// Each hex = 5km, so multiply by 5 to get km/day, or divide 10 by (speed × 5) to get days per 10km.
const UNIT_SPEEDS_HEX_PER_DAY: Record<string, number> = {
  // Air units (very fast strategic movement)
  Fighter: 60,           // 300 km/day → 0.03 days per 10km
  Bomber: 45,            // 225 km/day → 0.04 days per 10km
  Interceptor: 70,       // 350 km/day → 0.03 days per 10km
  // Naval units
  Transport_Ship: 6,     // 30 km/day → 0.33 days per 10km
  Battleship: 8,         // 40 km/day → 0.25 days per 10km
  // Ground units - mechanized
  Supply_Truck: 5,       // 25 km/day → 0.4 days per 10km
  Panzer_IV: 3,          // 15 km/day → 0.67 days per 10km
  Light_Tank: 3,         // 15 km/day → 0.67 days per 10km
  Heavy_Tank: 2,         // 10 km/day → 1.0 days per 10km
  Panzer_V: 3,           // 15 km/day → 0.67 days per 10km
  // Ground units - artillery
  Howitzer_105: 2,       // 10 km/day → 1.0 days per 10km
  Artillery_155mm: 2,    // 10 km/day → 1.0 days per 10km
  Artillery_105mm: 2,    // 10 km/day → 1.0 days per 10km
  Rocket_Artillery: 3,   // 15 km/day → 0.67 days per 10km (typically self-propelled)
  SP_Artillery: 3,       // 15 km/day → 0.67 days per 10km (self-propelled)
  // Ground units - infantry
  Infantry_42: 1,        // 5 km/day → 2.0 days per 10km
  Infantry_Elite: 1,     // 5 km/day → 2.0 days per 10km
  Infantry: 1,           // 5 km/day → 2.0 days per 10km
  AT_Infantry: 1         // 5 km/day → 2.0 days per 10km
};

export type CampaignUpdateReason =
  | "scenarioLoaded"
  | "dayAdvanced"
  | "segmentResolved"
  | "turnAdvanced"
  | "decisionsUpdated"
  | "engagementsUpdated"
  | "engagementLedgerUpdated"
  | "headquartersStatusUpdated"
  | "intelligenceUpdated"
  | "ordersUpdated"
  | "reportsUpdated"
  | "saveStatusChanged"
  | "reset"
  | "manual";

/** Public segment-advance result also covers the pre-runtime no-campaign state. */
export type CampaignAdvanceSegmentResult = CampaignSegmentResolutionResult | {
  readonly ok: false;
  readonly state: null;
  readonly error: CampaignRuntimeError;
  readonly issues: readonly CampaignInvariantIssue[];
  readonly frozenViews: readonly [];
};

/** Public multi-segment result also covers the pre-runtime no-campaign state. */
export type CampaignAdvanceCommandResult = CampaignAdvanceResult | {
  readonly ok: false;
  readonly state: null;
  readonly error: CampaignRuntimeError;
  readonly issues: readonly CampaignInvariantIssue[];
};

type CampaignUpdateListener = (reason: CampaignUpdateReason) => void;

type HeadquartersStatusTone = "info" | "success" | "warning";

export interface HeadquartersStatusMessage {
  title: string;
  detail: string;
  action: string;
  tone: HeadquartersStatusTone;
}

/**
 * WHAT: Resolves browser localStorage without throwing in restricted/privacy/test environments.
 * WHY: Campaign 2.0 may read the legacy save and write only a migration marker, but storage absence must remain explicit.
 *
 * @returns Available legacy storage boundary or null.
 */
function resolveBrowserLegacyStorage(): CampaignLegacyStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * WHAT: Converts a canonical FNV-1a content hash into an unsigned deterministic campaign seed.
 * WHY: New compatibility sessions need reproducible runtime RNG without wall-clock or unseeded randomness.
 *
 * @param contentHash - Versioned scenario definition hash.
 * @returns Unsigned 32-bit seed.
 */
function campaignSeedFromContentHash(contentHash: string): number {
  return Number.parseInt(contentHash.slice("fnv1a32-".length), 16) >>> 0;
}

/**
 * Lightweight state container for the strategic campaign layer.
 * Surfaces subscribe/notify and read-only getters for UI components.
 */
export class CampaignState {
  private scenario: CampaignScenarioData | null = null;
  /** Frozen authored content resolved at the latest explicit setScenario/load boundary. */
  private scenarioDefinition: CampaignScenarioDefinition | null = null;
  /** Defensive legacy-shaped authored source used only to resolve current content during v1/v2 migration. */
  private authoredScenarioSource: CampaignScenarioData | null = null;
  /** Only authoritative mutable campaign truth while a scenario is loaded. */
  private runtime: CampaignRuntimeState | null = null;
  /** Complete tactical continuation owned by this campaign and bound to one exact runtime revision. */
  private activeBattleSave: ActiveCampaignBattleSave | null = null;
  private postBattleAutosaveStatus: CampaignPostBattleAutosaveStatus | null = null;
  /** Hash of the at-rest derived compatibility projection used to skip no-op notifications. */
  private compatibilityProjectionHash: string | null = null;
  private turnState: CampaignTurnState | null = null;
  private decisions: CampaignDecision[] = [];
  private engagements: CampaignPendingEngagement[] = [];
  /** Tracks which engagement the commander is actively resolving so battle outcomes can be applied deterministically. */
  private activeEngagementId: string | null = null;
  /** Current campaign time in 3-hour segments (0 = Day 1, 00:00-03:00; 8 = Day 2, 00:00-03:00) */
  private currentSegment: number = 0;
  private headquartersStatusMessage: HeadquartersStatusMessage | null = null;
  /** Faction-specific operational pictures. Raw campaign truth never leaves through these projections. */
  private intelligenceByFaction: Record<string, CampaignKnowledgeState> = {};
  private readonly listeners = new Set<CampaignUpdateListener>();
  private readonly saveRepository: CampaignSaveRepository;
  private readonly legacyStorage: CampaignLegacyStorage | null;
  private readonly buildVersion: string;
  private readonly contentVersion: string;

  /**
   * WHAT: Creates campaign state over injectable persistence boundaries.
   * WHY: Production IndexedDB and deterministic tests must exercise identical runtime ownership and save behavior.
   *
   * @param options - Optional backend, legacy storage, and version identities.
   */
  public constructor(options: CampaignStateOptions = {}) {
    const backend = options.saveBackend ?? new IndexedDbCampaignSaveBackend();
    this.saveRepository = new CampaignSaveRepository(backend);
    this.legacyStorage = options.legacyStorage === undefined ? resolveBrowserLegacyStorage() : options.legacyStorage;
    this.buildVersion = options.buildVersion ?? CAMPAIGN_SAVE_BUILD_VERSION;
    this.contentVersion = options.contentVersion ?? CAMPAIGN_SAVE_CONTENT_VERSION;
  }

  /**
   * WHAT: Captures the current compatibility draft in the exact legacy adapter contract.
   * WHY: Change detection and runtime reconciliation must include every field current CampaignState methods can mutate.
   *
   * @returns Defensive compatibility projection candidate.
   * @throws Error when no scenario is loaded.
   */
  private captureCompatibilityProjection(): CampaignLegacyProjection {
    if (!this.scenario) throw new Error("Cannot capture campaign compatibility state without a scenario.");
    return {
      scenario: structuredClone(this.scenario),
      currentSegment: this.currentSegment,
      turnState: structuredClone(this.turnState),
      activeEngagementId: this.activeEngagementId,
      queuedDecisions: structuredClone(this.decisions),
      engagements: structuredClone(this.engagements),
      intelligenceByFaction: structuredClone(this.intelligenceByFaction)
    };
  }

  /**
   * WHAT: Computes stable change identity for one complete compatibility projection.
   * WHY: UI-only/no-op notifications must not create campaign revisions or domain events.
   *
   * @param projection - Complete current compatibility state.
   * @returns Canonical deterministic hash.
   */
  private computeCompatibilityProjectionHash(projection: CampaignLegacyProjection): string {
    return computeCampaignContentHash(projection);
  }

  /**
   * WHAT: Replaces every compatibility field with a fresh defensive projection of committed runtime truth.
   * WHY: The existing scenario-shaped object may serve as a temporary rule draft but cannot persist as an independent authority.
   *
   * @param runtime - Valid committed runtime.
   */
  private hydrateCompatibilityProjection(runtime: CampaignRuntimeState): void {
    if (!this.scenarioDefinition) throw new Error("Cannot project campaign runtime without an authored definition.");
    const projection = projectLegacyCampaignState(this.scenarioDefinition, runtime);
    this.scenario = projection.scenario;
    this.currentSegment = projection.currentSegment;
    this.turnState = projection.turnState;
    this.activeEngagementId = projection.activeEngagementId;
    this.decisions = projection.queuedDecisions;
    this.engagements = projection.engagements;
    this.intelligenceByFaction = projection.intelligenceByFaction;
    this.compatibilityProjectionHash = this.computeCompatibilityProjectionHash(projection);
  }

  /**
   * WHAT: Creates first authoritative runtime truth from the loaded authored definition and initialized compatibility draft.
   * WHY: `setScenario()` must enter the Campaign 2.0 ownership model before any listener observes campaign state.
   */
  private createAuthoritativeRuntime(): void {
    if (!this.scenario || !this.scenarioDefinition) {
      throw new Error("Cannot create campaign runtime without scenario content and definition.");
    }
    const contentHash = computeCampaignContentHash(this.scenarioDefinition);
    const campaignId = createStableCampaignRecordId("campaign", "live-session", this.scenarioDefinition.key, contentHash);
    this.runtime = createCampaignRuntime(this.scenarioDefinition, {
      campaignId,
      seed: campaignSeedFromContentHash(contentHash),
      currentSegment: this.currentSegment,
      turnState: this.turnState,
      queuedDecisions: this.decisions,
      engagements: this.engagements,
      activeEngagementId: this.activeEngagementId,
      knowledgeByFaction: this.intelligenceByFaction,
      runtimeSeedOverride: {
        tiles: this.scenario.tiles,
        economies: this.scenario.economies,
        fronts: this.scenario.fronts
      }
    });
    this.hydrateCompatibilityProjection(this.runtime);
  }

  /**
   * WHAT: Reconciles a changed compatibility draft through one validated runtime transaction and restores safe truth on failure.
   * WHY: Existing synchronous rule methods can remain behavior-compatible while runtime becomes the only committed owner.
   *
   * @param reason - Existing stable mutation/notification reason recorded in the domain event.
   */
  private reconcileCompatibilityProjection(reason: CampaignUpdateReason): void {
    if (!this.scenario) return;
    if (!this.scenarioDefinition) this.scenarioDefinition = splitLegacyCampaignScenario(this.scenario);
    if (!this.runtime) {
      this.createAuthoritativeRuntime();
      return;
    }

    const projection = this.captureCompatibilityProjection();
    const projectionHash = this.computeCompatibilityProjectionHash(projection);
    if (projectionHash === this.compatibilityProjectionHash) return;

    const safeRuntime = this.runtime;
    try {
      const candidate = createCampaignRuntime(this.scenarioDefinition, {
        campaignId: safeRuntime.campaignId,
        seed: safeRuntime.rng.baseSeed,
        currentSegment: projection.currentSegment,
        turnState: projection.turnState,
        queuedDecisions: projection.queuedDecisions,
        engagements: projection.engagements,
        activeEngagementId: projection.activeEngagementId,
        knowledgeByFaction: projection.intelligenceByFaction,
        runtimeSeedOverride: {
          tiles: projection.scenario.tiles,
          economies: projection.scenario.economies,
          fronts: projection.scenario.fronts
        }
      });
      const result = runCampaignRuntimeTransaction(safeRuntime, `compatibility:${reason}`, (draft) => {
        draft.currentSegment = candidate.currentSegment;
        draft.status = safeRuntime.status === "victory" || safeRuntime.status === "defeat"
          ? safeRuntime.status
          : candidate.status;
        draft.activeEngagementId = candidate.activeEngagementId;
        draft.tileOrder.splice(0, draft.tileOrder.length, ...candidate.tileOrder);
        draft.tiles = structuredClone(candidate.tiles);
        reconcileCampaignFormationForceCounts(draft, candidate.currentSegment, `compatibility:${reason}`);
        draft.factionOrder.splice(0, draft.factionOrder.length, ...candidate.factionOrder);
        draft.factions = structuredClone(candidate.factions);
        draft.engagementOrder.splice(0, draft.engagementOrder.length, ...candidate.engagementOrder);
        draft.engagements = structuredClone(candidate.engagements);
        draft.engagementOrder.forEach((engagementId) => {
          const priorStatus = safeRuntime.engagements[engagementId]?.status;
          if (priorStatus) draft.engagements[engagementId].status = priorStatus;
          const context = draft.engagements[engagementId]?.engagement.context;
          if (context) {
            draft.engagements[engagementId].engagement.context = attachCampaignFormationProvenanceToContext(context, draft);
          }
        });
        reconcileCampaignEngagementLedger(draft);
        const activeStatus = draft.activeEngagementId
          ? draft.engagements[draft.activeEngagementId]?.status
          : null;
        if (safeRuntime.status !== "victory" && safeRuntime.status !== "defeat") {
          draft.status = activeStatus === "inBattle" ? "engagement" : "planning";
        }
        draft.knowledgeByFaction = structuredClone(candidate.knowledgeByFaction);
        draft.compatibility = structuredClone(candidate.compatibility);
        this.synchronizeTypedOrderExecution(draft);
        revalidateCampaignOrderBook(draft);
        return [{
          type: "stateChanged",
          category: reason === "intelligenceUpdated" ? "intelligence" : "system",
          summary: `Compatibility campaign state committed: ${reason}.`,
          details: { reason, currentSegment: candidate.currentSegment }
        }];
      });
      if (!result.ok) throw result.error;
      this.runtime = result.state;
      this.hydrateCompatibilityProjection(result.state);
    } catch (error) {
      this.runtime = safeRuntime;
      this.hydrateCompatibilityProjection(safeRuntime);
      throw error;
    }
  }

  /**
   * Commits one order-domain mutation through the authoritative runtime boundary and refreshes compatibility/UI projections.
   * The source runtime is retained byte-for-byte when the mutator throws or violates an invariant.
   */
  private transactCampaignOrders(
    label: string,
    summary: string,
    mutator: (draft: CampaignRuntimeState) => void,
    eventDetails: CampaignDomainEventDraft["details"] = {}
  ): { ok: true } | { ok: false; reason: string } {
    if (!this.runtime || !this.scenarioDefinition) return { ok: false, reason: "No campaign runtime is loaded." };
    const result = runCampaignRuntimeTransaction(this.runtime, label, (draft) => {
      mutator(draft);
      return [{
        type: "stateChanged",
        category: "orders",
        summary,
        details: { ...eventDetails, currentSegment: draft.currentSegment }
      }];
    });
    if (!result.ok) return { ok: false, reason: result.error.message };
    this.runtime = result.state;
    this.hydrateCompatibilityProjection(result.state);
    this.notify("ordersUpdated");
    return { ok: true };
  }

  /** Commits an engagement-domain mutation through the same validated revision boundary as orders and segments. */
  private transactCampaignEngagements(
    label: string,
    summary: string,
    mutator: (draft: CampaignRuntimeState) => void,
    eventDetails: CampaignDomainEventDraft["details"] = {}
  ): { ok: true } | { ok: false; reason: string } {
    if (!this.runtime || !this.scenarioDefinition) return { ok: false, reason: "No campaign runtime is loaded." };
    const result = runCampaignRuntimeTransaction(this.runtime, label, (draft) => {
      mutator(draft);
      return [{
        type: "stateChanged",
        category: "engagement",
        summary,
        details: { ...eventDetails, currentSegment: draft.currentSegment }
      }];
    });
    if (!result.ok) return { ok: false, reason: result.error.message };
    this.runtime = result.state;
    this.hydrateCompatibilityProjection(result.state);
    this.notify("engagementLedgerUpdated");
    return { ok: true };
  }

  /** Mirrors compatibility execution progress into typed order lifecycle without making compatibility authoritative. */
  private synchronizeTypedOrderExecution(runtime: CampaignRuntimeState): void {
    runtime.orderOrder.forEach((orderId) => {
      const order = runtime.orders[orderId];
      if (!order || (order.status !== "committed" && order.status !== "executing")) return;
      if (order.kind === "redeploy") {
        const decision = runtime.compatibility.queuedDecisions.find((entry) => entry.id === order.executionRefId);
        const status = typeof decision?.payload.status === "string" ? decision.payload.status : null;
        if (status === "arrived") order.status = "executing";
        if (status === "completed") order.status = "completed";
      } else if (order.kind === "production") {
        if (runtime.currentSegment >= order.payload.effectiveSegment) order.status = "completed";
      } else if (order.kind === "infrastructureRepair") {
        // The segment resolver owns repair progress and terminal status.
      } else {
        const operation = runtime.knowledgeByFaction[String(order.faction)]?.operations
          .find((entry) => entry.id === order.executionRefId);
        if (!operation) return;
        if (operation.status === "active") order.status = "executing";
        if (operation.status === "complete" || operation.status === "partial") order.status = "completed";
        if (operation.status === "aborted" || operation.status === "compromised") order.status = "blocked";
      }
    });
  }

  /**
   * WHAT: Returns a defensive snapshot of authoritative Campaign 2.0 truth.
   * WHY: Persistence, diagnostics, and integration tests must not read or mutate the compatibility cache as authority.
   *
   * @returns Runtime snapshot or null when no campaign is loaded.
   */
  getRuntimeSnapshot(): CampaignRuntimeState | null {
    return this.runtime ? structuredClone(this.runtime) : null;
  }

  /** Returns a defensive private assessment snapshot for strategic-AI planning and development diagnostics. */
  getCampaignAIAssessment(faction: CampaignFactionKey = "Bot"): CampaignAITheaterAssessment | null {
    const assessment = this.runtime?.aiAssessmentsByFaction?.[String(faction)];
    return assessment ? structuredClone(assessment) : null;
  }

  /** Returns a defensive private portfolio snapshot for strategic behavior code and development diagnostics. */
  getCampaignAIPlanningRecord(faction: CampaignFactionKey = "Bot"): CampaignAIPlanningRecord | null {
    const planning = this.runtime?.aiPlanningByFaction?.[String(faction)];
    return planning ? structuredClone(planning) : null;
  }

  /** Returns a defensive private common-order behavior trace for development diagnostics. */
  getCampaignAIBehaviorRecord(faction: CampaignFactionKey = "Bot"): CampaignAIBehaviorRecord | null {
    const behavior = this.runtime?.aiBehaviorsByFaction?.[String(faction)];
    return behavior ? structuredClone(behavior) : null;
  }

  /** Returns Player-safe, explanation-ready objective rows in stable authored order. */
  getCampaignObjectivePresentations(): CampaignObjectivePresentation[] {
    if (!this.runtime || !this.scenarioDefinition) return [];
    const snapshot = structuredClone(this.runtime);
    return projectCampaignObjectives(snapshot, this.scenarioDefinition)
      .filter((objective) => objective.visible)
      .map((objective) => structuredClone(objective));
  }

  /** Returns the current authored operation phase label without exposing mutable definition state. */
  getCampaignPhaseLabel(): string {
    return this.runtime && this.scenarioDefinition
      ? getCampaignPhaseLabel(this.runtime, this.scenarioDefinition)
      : "Operation";
  }

  /** Explicitly enters non-scoring sandbox play when the authored campaign permits it. */
  continueCampaignAfterOutcome(): { ok: true } | { ok: false; reason: string } {
    if (!this.runtime || !this.scenarioDefinition) return { ok: false, reason: "No campaign runtime is loaded." };
    if (!this.runtime.campaignOutcome) return { ok: false, reason: "The campaign has not reached an outcome." };
    if (this.scenarioDefinition.campaignArc?.allowContinueAfterOutcome !== true) {
      return { ok: false, reason: "This operation ends at its recorded outcome." };
    }
    if (this.runtime.campaignOutcome.sandboxContinued) return { ok: true };
    const transaction = runCampaignRuntimeTransaction(this.runtime, "objectives:continue-sandbox", (draft) => {
      if (!draft.campaignOutcome) throw new Error("Recorded campaign outcome is unavailable.");
      draft.campaignOutcome.sandboxContinued = true;
      draft.status = "planning";
      return [{
        type: "stateChanged",
        category: "objectives",
        summary: "Recorded campaign outcome retained; non-scoring sandbox continuation began.",
        details: { result: draft.campaignOutcome.result, grade: draft.campaignOutcome.grade, sandboxContinued: true }
      }];
    });
    if (!transaction.ok) return { ok: false, reason: transaction.error.message };
    this.runtime = transaction.state;
    this.hydrateCompatibilityProjection(transaction.state);
    this.notify("scenarioLoaded");
    return { ok: true };
  }

  /** Returns the campaign-owned tactical continuation without exposing mutable save data. */
  getActiveBattleSave(): ActiveCampaignBattleSave | null {
    return this.activeBattleSave ? structuredClone(this.activeBattleSave) : null;
  }

  /**
   * Attaches or clears the complete tactical continuation. Cross-campaign/revision snapshots are rejected
   * before they can enter authoritative campaign state.
   */
  setActiveBattleSave(save: ActiveCampaignBattleSave | null): void {
    if (save === null) {
      this.activeBattleSave = null;
      return;
    }
    if (!this.runtime || !this.runtime.activeEngagementId) {
      throw new Error("Cannot attach a tactical save without an active campaign engagement.");
    }
    const committedPackage = getCampaignBattlePackage(this.runtime, this.runtime.activeEngagementId);
    const legacyUnfrozen = this.runtime.engagementLedger[this.runtime.activeEngagementId]?.legacyUnfrozen === true;
    if (!legacyUnfrozen && (!committedPackage
      || save.engagementPackage.commitmentPackageId !== committedPackage.packageId
      || save.engagementPackage.commitmentIntegrityHash !== committedPackage.integrityHash)) {
      throw new Error("Cannot attach a tactical save to a different campaign commitment package.");
    }
    this.activeBattleSave = assertCompleteActiveCampaignBattleSave(save, {
      campaignId: this.runtime.campaignId,
      campaignRevision: this.runtime.revision,
      scenarioKey: this.runtime.scenarioKey,
      engagementId: this.runtime.activeEngagementId
    });
  }

  /** Returns the last checksummed transaction report for UI, saves, diagnostics, and AAR consumers. */
  getLastCampaignResolutionReport(): CampaignResolutionReport | null {
    return this.runtime?.lastResolution ? structuredClone(this.runtime.lastResolution) : null;
  }

  /** Returns recent Player-safe advance checkpoints in newest-first timeline order. */
  getCampaignAdvanceTimeline(limit = 24): CampaignAdvanceStepRecord[] {
    if (!this.runtime || !Number.isInteger(limit) || limit <= 0) return [];
    return this.runtime.advanceRecordOrder
      .slice(-limit)
      .reverse()
      .flatMap((id) => {
        const record = this.runtime?.advanceRecords[id];
        return record ? [structuredClone(record)] : [];
      });
  }

  /** Returns whether a retained Player-safe campaign alert has been explicitly reviewed. */
  isCampaignAlertAcknowledged(alertId: string): boolean {
    return Boolean(this.runtime?.acknowledgedCampaignAlertIds?.includes(alertId));
  }

  /** Marks one retained alert reviewed without resolving any decision or changing simulation truth. */
  acknowledgeCampaignAlert(alertId: string): boolean {
    if (!this.runtime || !alertId.trim()) return false;
    const exists = this.runtime.advanceRecordOrder.some((recordId) => (
      this.runtime?.advanceRecords[recordId]?.alerts.some((alert) => alert.id === alertId)
    ));
    if (!exists) return false;
    const acknowledged = this.runtime.acknowledgedCampaignAlertIds ??= [];
    if (!acknowledged.includes(alertId)) acknowledged.push(alertId);
    this.notify("reportsUpdated");
    return true;
  }

  /** Returns authoritative typed orders in deterministic planning/resolution order. */
  getCampaignOrders(): CampaignOrder[] {
    return this.runtime ? projectCampaignOrders(this.runtime) : [];
  }

  /** Summarizes valid draft holds for player-facing resource/capacity affordances. */
  getCampaignDraftReservations(faction: CampaignFactionKey = "Player"): {
    resources: Record<string, number>;
    transport: Record<string, number>;
    intelligenceCapacity: number;
    assets: number;
    formations: number;
  } {
    const summary = { resources: {} as Record<string, number>, transport: {} as Record<string, number>, intelligenceCapacity: 0, assets: 0, formations: 0 };
    if (!this.runtime) return summary;
    this.runtime.reservationOrder.forEach((id) => {
      const reservation = this.runtime?.reservations[id];
      if (!reservation || reservation.faction !== faction || reservation.status !== "held") return;
      if (reservation.kind === "resource") summary.resources[reservation.poolKey] = (summary.resources[reservation.poolKey] ?? 0) + reservation.amount;
      if (reservation.kind === "transport") summary.transport[reservation.poolKey] = (summary.transport[reservation.poolKey] ?? 0) + reservation.amount;
      if (reservation.kind === "intelligenceCapacity") summary.intelligenceCapacity += reservation.amount;
      if (reservation.kind === "asset") summary.assets += reservation.amount;
      if (reservation.kind === "formation") summary.formations += reservation.amount;
    });
    return structuredClone(summary);
  }

  /** Builds one stable availability result without exposing runtime truth to the command UI. */
  private campaignActionPreview(
    availability: CampaignOrderActionPreview["availability"],
    reasonCode: CampaignOrderValidationCode | null,
    reason: string | null,
    correctiveAction: string | null,
    mapHexKeys: readonly string[] = []
  ): CampaignOrderActionPreview {
    return { availability, reasonCode, reason, correctiveAction, mapHexKeys: [...mapHexKeys] };
  }

  /** Returns authoritative selected-origin availability for the common redeployment action. */
  getCampaignRedeployActionPreview(originOffsetKey: string, faction: CampaignFactionKey = "Player"): CampaignOrderActionPreview {
    if (!this.runtime || !this.scenario) {
      return this.campaignActionPreview("hidden", "ORDER_SOURCE_INVALID", "No campaign is loaded.", "Load or start a campaign before issuing orders.");
    }
    const origin = this.findTileByOffsetKey(originOffsetKey);
    if (!origin) {
      return this.campaignActionPreview("blocked", "ORDER_SOURCE_INVALID", "The selected origin is not a valid campaign hex.", "Select a friendly-controlled hex.");
    }
    const controller = origin.factionControl ?? this.scenario.tilePalette[origin.tile]?.factionControl;
    if (controller !== faction) {
      return this.campaignActionPreview("blocked", "ORDER_SOURCE_INVALID", "Redeployment must begin from a friendly-controlled hex.", "Select a friendly formation or force concentration.", [originOffsetKey]);
    }
    const runtimeHexKey = campaignOffsetKeyToRuntimeHexKey(originOffsetKey);
    const movable = (origin.forces ?? []).some((force) => {
      const held = runtimeHexKey ? this.runtime?.reservationOrder.reduce((sum, id) => {
        const reservation = this.runtime?.reservations[id];
        return reservation?.faction === faction
          && reservation.kind === "formation"
          && reservation.status === "held"
          && reservation.poolKey === `${runtimeHexKey}|${force.unitType}`
          ? sum + reservation.amount
          : sum;
      }, 0) ?? 0 : 0;
      return force.count - held > 0;
    });
    if (!movable) {
      return this.campaignActionPreview("blocked", "ORDER_FORCE_UNAVAILABLE", "No uncommitted force is available at this origin.", "Remove or reprioritize an earlier movement draft, or select another friendly force.", [originOffsetKey]);
    }
    return this.campaignActionPreview("available", null, null, null, [originOffsetKey]);
  }

  /** Returns authoritative availability for the exclusive next-delivery production slot. */
  getCampaignProductionActionPreview(faction: CampaignFactionKey = "Player", excludeOrderId?: string): CampaignOrderActionPreview {
    if (!this.runtime || !this.getProductionReport()) {
      return this.campaignActionPreview("hidden", "ORDER_ALLOCATION_INVALID", "Theater production is unavailable.", "Load a campaign with controlled industrial capacity.");
    }
    const priorDraft = this.runtime.orderOrder
      .map((id) => this.runtime?.orders[id])
      .find((order) => order?.id !== excludeOrderId && order?.faction === faction && order.kind === "production" && order.status === "draft");
    if (priorDraft) {
      return this.campaignActionPreview("blocked", "ORDER_RESERVATION_CONFLICT", "Another draft already holds the next production-allocation slot.", "Edit or remove the earlier production draft before creating another.");
    }
    return this.campaignActionPreview("available", null, null, null);
  }

  /** Returns the normalized allocation and exact next-delivery output used by draft creation. */
  previewProductionDraft(allocation: ProductionAllocation, excludeOrderId?: string): {
    readonly action: CampaignOrderActionPreview;
    readonly normalizedAllocation: ProductionAllocation | null;
    readonly dailyOutput: ProductionAllocation | null;
    readonly effectiveSegment: number | null;
  } {
    const action = this.getCampaignProductionActionPreview("Player", excludeOrderId);
    const normalizedAllocation = this.normalizeProductionAllocation(allocation);
    if (!normalizedAllocation) {
      return {
        action: this.campaignActionPreview("blocked", "ORDER_ALLOCATION_INVALID", "Production allocation must assign more than zero percent.", "Assign output to at least one resource."),
        normalizedAllocation: null,
        dailyOutput: null,
        effectiveSegment: null
      };
    }
    const report = this.getProductionReport();
    if (!report || action.availability !== "available") {
      return { action, normalizedAllocation, dailyOutput: report ? computeDailyProduction(report.capacity, normalizedAllocation) : null, effectiveSegment: null };
    }
    const remainder = this.runtime?.currentSegment ? this.runtime.currentSegment % 8 : 0;
    const currentSegment = this.runtime?.currentSegment ?? 0;
    return {
      action,
      normalizedAllocation,
      dailyOutput: computeDailyProduction(report.capacity, normalizedAllocation),
      effectiveSegment: currentSegment + (remainder === 0 ? 8 : 8 - remainder)
    };
  }

  /** Returns authoritative operation availability after target, capacity, resource, contact, and asset checks. */
  previewIntelOperationDraft(options: {
    type: CampaignIntelOperationType;
    targetHexKey?: string;
    faction?: CampaignFactionKey;
    assignedAssetKey?: string;
    targetContactId?: string;
    excludeOrderId?: string;
  }): CampaignOrderActionPreview & {
    readonly eligibleAssets: ReadonlyArray<{ assetKey: string; label: string; hexKey: string }>;
    readonly capacityAvailable: number;
    readonly suppliesAvailable: number;
    readonly fuelAvailable: number;
    readonly resolveSegment: number | null;
  } {
    const faction = options.faction ?? "Player";
    const rule = INTEL_OPERATION_RULES[options.type];
    const targetKeys = options.targetHexKey ? [options.targetHexKey] : [];
    const empty = (preview: CampaignOrderActionPreview, eligibleAssets: ReadonlyArray<{ assetKey: string; label: string; hexKey: string }> = []) => ({
      ...preview,
      eligibleAssets,
      capacityAvailable: 0,
      suppliesAvailable: 0,
      fuelAvailable: 0,
      resolveSegment: null
    });
    if (!this.runtime || !this.scenario || !rule) {
      return empty(this.campaignActionPreview("hidden", "ORDER_OPERATION_INVALID", "Intelligence operations are unavailable.", "Load a campaign with an intelligence command network."));
    }
    const held = this.runtime.reservationOrder.reduce((summary, id) => {
      const reservation = this.runtime?.reservations[id];
      const ownerOrder = reservation ? this.runtime?.orders[reservation.orderId] : null;
      if (!reservation || reservation.faction !== faction || reservation.status !== "held" || ownerOrder?.id === options.excludeOrderId) return summary;
      if (reservation.kind === "intelligenceCapacity") summary.capacity += reservation.amount;
      if (reservation.kind === "resource" && reservation.poolKey === "supplies") summary.supplies += reservation.amount;
      if (reservation.kind === "resource" && reservation.poolKey === "fuel") summary.fuel += reservation.amount;
      if (reservation.kind === "asset") summary.assets.add(reservation.poolKey);
      return summary;
    }, { capacity: 0, supplies: 0, fuel: 0, assets: new Set<string>() });
    const state = this.ensureKnowledgeState(faction);
    const economy = this.runtime.factions[String(faction)]?.economy;
    const capacityAvailable = Math.max(0, state.capacityTotal - getCommittedCapacity(state) - held.capacity);
    const suppliesAvailable = Math.max(0, (economy?.supplies ?? 0) - held.supplies);
    const fuelAvailable = Math.max(0, (economy?.fuel ?? 0) - held.fuel);
    const eligibleAssets = (options.targetHexKey
      ? this.getEligibleIntelAssets(options.type, faction, options.targetHexKey)
      : this.getEligibleIntelAssets(options.type, faction))
      .filter((asset) => !held.assets.has(asset.assetKey));
    const result = (preview: CampaignOrderActionPreview) => ({
      ...preview,
      eligibleAssets: structuredClone(eligibleAssets),
      capacityAvailable,
      suppliesAvailable,
      fuelAvailable,
      resolveSegment: this.runtime ? this.runtime.currentSegment + rule.durationSegments : null
    });
    if (!options.targetHexKey || !this.parseOffsetKeyToAxial(options.targetHexKey)) {
      return result(this.campaignActionPreview("blocked", "ORDER_TARGET_INVALID", "Choose a valid campaign target.", "Select a map hex, then return to this operation.", targetKeys));
    }
    if (options.type === "verify" && !state.contacts.some((contact) => contact.id === options.targetContactId)) {
      return result(this.campaignActionPreview("blocked", "ORDER_TARGET_INVALID", "Contact verification requires an assessed contact.", "Open Contacts and choose Verify on the contact to be checked.", targetKeys));
    }
    if (rule.requiresAsset === "friendlyForce") {
      const targetTile = this.findTileByOffsetKey(options.targetHexKey);
      const controller = targetTile ? targetTile.factionControl ?? this.scenario.tilePalette[targetTile.tile]?.factionControl : null;
      if (controller !== faction || (targetTile?.forces?.length ?? 0) === 0) {
        return result(this.campaignActionPreview("blocked", "ORDER_TARGET_INVALID", "Operational Security must protect a friendly force concentration.", "Select a friendly-occupied hex.", targetKeys));
      }
    }
    if (rule.requiresAsset !== "none" && eligibleAssets.length === 0) {
      return result(this.campaignActionPreview("blocked", "ORDER_ASSET_UNAVAILABLE", "No eligible uncommitted asset is in range.", "Select another target or release a suitable formation or air asset.", targetKeys));
    }
    if (options.assignedAssetKey && !eligibleAssets.some((asset) => asset.assetKey === options.assignedAssetKey)) {
      return result(this.campaignActionPreview("blocked", "ORDER_ASSET_UNAVAILABLE", "The selected asset is unavailable, ineligible, or out of range.", "Choose an eligible asset from the current list.", targetKeys));
    }
    if (rule.capacityCost > capacityAvailable) {
      return result(this.campaignActionPreview("blocked", "ORDER_CAPACITY_INSUFFICIENT", `This operation needs ${rule.capacityCost} intelligence capacity; ${capacityAvailable} remains uncommitted.`, "Remove, reprioritize, or wait for an earlier intelligence operation.", targetKeys));
    }
    if (rule.suppliesCost > suppliesAvailable || rule.fuelCost > fuelAvailable) {
      return result(this.campaignActionPreview("blocked", "ORDER_RESOURCE_INSUFFICIENT", `This operation needs ${rule.suppliesCost} supply and ${rule.fuelCost} fuel; ${suppliesAvailable} supply and ${fuelAvailable} fuel remain uncommitted.`, "Remove a competing draft, wait for production, or choose a less costly operation.", targetKeys));
    }
    return result(this.campaignActionPreview("available", null, null, null, targetKeys));
  }

  /** Returns authoritative facility-repair availability while keeping non-facility selections out of the action list. */
  getCampaignInfrastructureRepairActionPreview(
    targetOffsetHexKey: string,
    faction: CampaignFactionKey = "Player"
  ): CampaignOrderActionPreview {
    const status = this.getCampaignInfrastructureStatus(targetOffsetHexKey, faction);
    if (!status) return this.campaignActionPreview("hidden", null, null, null, [targetOffsetHexKey]);
    if (status.canDraftRepair) return this.campaignActionPreview("available", null, null, null, [targetOffsetHexKey]);
    const reason = status.repairBlockReason ?? "Reconstruction is unavailable.";
    const code: CampaignOrderValidationCode = reason.includes("formation")
      ? "ORDER_FORCE_UNAVAILABLE"
      : reason.includes("Requires")
        ? "ORDER_RESOURCE_INSUFFICIENT"
        : "ORDER_INFRASTRUCTURE_INVALID";
    const correctiveAction = code === "ORDER_FORCE_UNAVAILABLE"
      ? "Station a ready, uncommitted formation at the facility."
      : code === "ORDER_RESOURCE_INSUFFICIENT"
        ? "Release held stocks or wait for the next production delivery."
        : "Allow the current reconstruction to finish or select a damaged friendly facility.";
    return this.campaignActionPreview("blocked", code, reason, correctiveAction, [targetOffsetHexKey]);
  }

  /** Adds a non-spending redeployment draft using the same exact preview as the planner. */
  createRedeployDraft(
    originOffsetKey: string,
    destinationOffsetKey: string,
    selections: Array<{ unitType: string; count: number }>,
    transportModeKey = "foot",
    replaceOrderId?: string
  ): { ok: true; order: CampaignOrder } | { ok: false; reason: string } {
    const preview = this.previewRedeploy(originOffsetKey, destinationOffsetKey, selections, transportModeKey, replaceOrderId, true);
    const transportMode = getTransportMode(transportModeKey);
    const originRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(originOffsetKey);
    const destinationRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(destinationOffsetKey);
    if (!this.runtime || !preview || !transportMode || !originRuntimeHexKey || !destinationRuntimeHexKey) {
      return { ok: false, reason: "The redeployment route or transport mode is invalid." };
    }
    if (!preview.ok) return { ok: false, reason: preview.issues[0] ?? "The redeployment draft is invalid." };
    const activeSelections = selections
      .filter((selection) => selection.count > 0)
      .map((selection) => ({ unitType: selection.unitType, count: Math.floor(selection.count) }));
    let returnEtaSegment = preview.etaSegment;
    if (transportMode.capacityType === "trucks" || transportMode.capacityType === "transportShips") {
      returnEtaSegment += preview.timeSegments;
    }
    const payload: CampaignRedeployOrderPayload = {
      originOffsetKey,
      destinationOffsetKey,
      originRuntimeHexKey,
      destinationRuntimeHexKey,
      selections: activeSelections,
      transportModeKey,
      transportCapacityType: transportMode.capacityType ?? null,
      distance: preview.distance,
      timeSegments: preview.timeSegments,
      etaSegment: preview.etaSegment,
      returnEtaSegment,
      fuelCost: preview.fuelCost,
      suppliesCost: preview.suppliesCost,
      manpowerCost: preview.manpowerLoss,
      transportCapacityCost: preview.capacityNeeded
    };
    let createdId: string | null = null;
    const result = this.transactCampaignOrders(
      "orders:create-redeploy-draft",
      `Redeployment draft ${replaceOrderId ? "replaced" : "added"} from ${originOffsetKey} to ${destinationOffsetKey}.`,
      (draft) => {
        if (replaceOrderId && !removeCampaignOrderDraft(draft, replaceOrderId)) throw new Error("The redeployment draft is no longer editable.");
        const created = createRedeployOrderDraft(draft, { faction: "Player", payload });
        if (replaceOrderId && !created.validation.valid) throw new Error(created.validation.issues[0]?.message ?? "The replacement redeployment draft is invalid.");
        createdId = created.id;
      },
      { kind: "redeploy", originOffsetKey, destinationOffsetKey, replaceOrderId: replaceOrderId ?? null }
    );
    if (!result.ok) return result;
    const order = createdId && this.runtime?.orders[createdId];
    return order ? { ok: true, order: structuredClone(order) } : { ok: false, reason: "The redeployment draft was not retained." };
  }

  /** Normalizes a production mix to the exact persisted 100-percent allocation contract. */
  private normalizeProductionAllocation(allocation: ProductionAllocation): ProductionAllocation | null {
    const clamped = {
      supplies: Math.max(0, Number(allocation.supplies) || 0),
      fuel: Math.max(0, Number(allocation.fuel) || 0),
      ammo: Math.max(0, Number(allocation.ammo) || 0),
      manpower: Math.max(0, Number(allocation.manpower) || 0)
    };
    const total = clamped.supplies + clamped.fuel + clamped.ammo + clamped.manpower;
    if (total <= 0) return null;
    const normalized: ProductionAllocation = {
      supplies: Math.round((clamped.supplies / total) * 100),
      fuel: Math.round((clamped.fuel / total) * 100),
      ammo: Math.round((clamped.ammo / total) * 100),
      manpower: Math.round((clamped.manpower / total) * 100)
    };
    const drift = 100 - Object.values(normalized).reduce((sum, value) => sum + value, 0);
    if (drift !== 0) {
      const keys: Array<keyof ProductionAllocation> = ["supplies", "fuel", "ammo", "manpower"];
      const largest = keys.reduce((best, key) => normalized[key] > normalized[best] ? key : best, keys[0]);
      normalized[largest] += drift;
    }
    return normalized;
  }

  /** Adds an exclusive next-delivery production draft without changing the active allocation. */
  createProductionDraft(allocation: ProductionAllocation, replaceOrderId?: string): { ok: true; order: CampaignOrder } | { ok: false; reason: string } {
    if (!this.runtime) return { ok: false, reason: "No campaign runtime is loaded." };
    const preview = this.previewProductionDraft(allocation, replaceOrderId);
    const normalized = preview.normalizedAllocation;
    if (!normalized) return { ok: false, reason: "Allocation must be greater than zero." };
    const currentSegment = this.runtime.currentSegment;
    const remainder = currentSegment % 8;
    const effectiveSegment = currentSegment + (remainder === 0 ? 8 : 8 - remainder);
    let createdId: string | null = null;
    const result = this.transactCampaignOrders(
      "orders:create-production-draft",
      `Production allocation draft ${replaceOrderId ? "replaced" : "added"}.`,
      (draft) => {
        if (replaceOrderId && !removeCampaignOrderDraft(draft, replaceOrderId)) throw new Error("The production draft is no longer editable.");
        const created = createProductionOrderDraft(draft, { faction: "Player", allocation: normalized, effectiveSegment });
        if (replaceOrderId && !created.validation.valid) throw new Error(created.validation.issues[0]?.message ?? "The replacement production draft is invalid.");
        createdId = created.id;
      },
      { kind: "production", effectiveSegment, replaceOrderId: replaceOrderId ?? null }
    );
    if (!result.ok) return result;
    const order = createdId && this.runtime?.orders[createdId];
    return order ? { ok: true, order: structuredClone(order) } : { ok: false, reason: "The production draft was not retained." };
  }

  /** Returns a faction-safe facility condition and exact reconstruction preview for the campaign inspector. */
  getCampaignInfrastructureStatus(
    targetOffsetHexKey: string,
    faction: CampaignFactionKey = "Player"
  ): {
    infrastructure: NonNullable<CampaignTileInstance["infrastructure"]>;
    controller: CampaignFactionKey;
    repairRate: number;
    repairPoints: number;
    durationSegments: number;
    completeSegment: number;
    suppliesCost: number;
    manpowerCost: number;
    engineerFormationId: string | null;
    engineerFormationName: string | null;
    canDraftRepair: boolean;
    repairBlockReason: string | null;
  } | null {
    if (!this.runtime || !this.scenarioDefinition) return null;
    const runtimeHexKey = campaignOffsetKeyToRuntimeHexKey(targetOffsetHexKey);
    const tile = runtimeHexKey ? this.runtime.tiles[runtimeHexKey] : null;
    if (!tile || tile.controller !== faction || !tile.infrastructure) return null;
    const definition = this.scenarioDefinition.map.tilePalette[tile.tileKey];
    if (!definition) return null;
    const repairPoints = Math.max(0, tile.infrastructure.maxIntegrity - tile.infrastructure.integrity);
    const activeOrder = tile.infrastructure.activeRepairOrderId
      ? this.runtime.orders[tile.infrastructure.activeRepairOrderId]
      : null;
    const activeRepair = activeOrder?.kind === "infrastructureRepair" ? activeOrder : null;
    const repairRate = activeRepair?.payload.repairRate ?? campaignInfrastructureRepairRate(definition);
    const durationSegments = activeRepair
      ? Math.max(0, activeRepair.payload.completeSegment - this.runtime.currentSegment)
      : repairPoints > 0 ? Math.ceil(repairPoints / repairRate) : 0;
    const costs = activeRepair
      ? { supplies: activeRepair.payload.suppliesCost, manpower: activeRepair.payload.manpowerCost }
      : campaignInfrastructureRepairCosts(repairPoints);
    const heldAmount = (kind: "resource" | "asset", poolKey: string): number => this.runtime?.reservationOrder.reduce((sum, id) => {
      const reservation = this.runtime?.reservations[id];
      return reservation?.faction === faction && reservation.kind === kind && reservation.poolKey === poolKey && reservation.status === "held"
        ? sum + reservation.amount
        : sum;
    }, 0) ?? 0;
    const availableEngineer = this.runtime.formationOrder
      .map((id) => this.runtime?.formations[id])
      .find((formation) => formation?.faction === faction
        && formation.locationHexKey === runtimeHexKey
        && formation.status === "ready"
        && formation.currentOrderId === null
        && heldAmount("asset", `engineering:${formation.id}`) === 0) ?? null;
    const activeEngineer = activeRepair
      ? this.runtime.formations[activeRepair.payload.engineerFormationId] ?? null
      : null;
    const engineer = activeEngineer ?? availableEngineer;
    let repairBlockReason: string | null = null;
    if (repairPoints === 0) repairBlockReason = "Facility is fully operational.";
    else if (tile.infrastructure.activeRepairOrderId) repairBlockReason = "Reconstruction is already underway.";
    else if (!engineer) repairBlockReason = "A ready formation must be stationed here to supervise repairs.";
    else {
      const economy = this.runtime.factions[String(faction)]?.economy;
      const suppliesAvailable = Math.max(0, (economy?.supplies ?? 0) - heldAmount("resource", "supplies"));
      const manpowerAvailable = Math.max(0, (economy?.manpower ?? 0) - heldAmount("resource", "manpower"));
      if (!economy || suppliesAvailable < costs.supplies || manpowerAvailable < costs.manpower) {
        repairBlockReason = `Requires ${costs.supplies} supply and ${costs.manpower} personnel; ${suppliesAvailable} supply and ${manpowerAvailable} personnel remain uncommitted.`;
      }
    }
    return {
      infrastructure: structuredClone(tile.infrastructure),
      controller: tile.controller,
      repairRate,
      repairPoints,
      durationSegments,
      completeSegment: activeRepair?.payload.completeSegment ?? this.runtime.currentSegment + durationSegments,
      suppliesCost: costs.supplies,
      manpowerCost: costs.manpower,
      engineerFormationId: engineer?.id ?? null,
      engineerFormationName: engineer?.name ?? null,
      canDraftRepair: repairBlockReason === null,
      repairBlockReason
    };
  }

  /** Builds a fully costed facility-repair draft supervised by a ready formation on the selected hex. */
  createInfrastructureRepairDraft(
    targetOffsetHexKey: string,
    faction: CampaignFactionKey = "Player"
  ): { ok: true; order: CampaignOrder } | { ok: false; reason: string } {
    if (!this.runtime || !this.scenarioDefinition) return { ok: false, reason: "No campaign runtime is loaded." };
    const targetRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(targetOffsetHexKey);
    const tile = targetRuntimeHexKey ? this.runtime.tiles[targetRuntimeHexKey] : null;
    const infrastructure = tile?.infrastructure;
    const definition = tile ? this.scenarioDefinition.map.tilePalette[tile.tileKey] : null;
    if (!targetRuntimeHexKey || !tile || !definition || !infrastructure) {
      return { ok: false, reason: "The selected hex has no repairable strategic infrastructure." };
    }
    if (tile.controller !== faction) return { ok: false, reason: "Only friendly-controlled facilities can be repaired." };
    if (infrastructure.integrity >= infrastructure.maxIntegrity) return { ok: false, reason: "This facility is already at full integrity." };
    if (infrastructure.activeRepairOrderId) return { ok: false, reason: "A repair order is already active at this facility." };
    const engineer = this.runtime.formationOrder
      .map((id) => this.runtime?.formations[id])
      .find((formation) => formation?.faction === faction
        && formation.locationHexKey === targetRuntimeHexKey
        && formation.status === "ready"
        && formation.currentOrderId === null);
    if (!engineer) return { ok: false, reason: "Station a ready formation on the facility to supervise reconstruction." };
    const repairPoints = infrastructure.maxIntegrity - infrastructure.integrity;
    const repairRate = campaignInfrastructureRepairRate(definition);
    const durationSegments = Math.ceil(repairPoints / repairRate);
    const costs = campaignInfrastructureRepairCosts(repairPoints);
    const payload: CampaignInfrastructureRepairOrderPayload = {
      targetOffsetHexKey,
      targetRuntimeHexKey,
      role: infrastructure.role,
      engineerFormationId: engineer.id,
      sourceIntegrity: infrastructure.integrity,
      targetIntegrity: infrastructure.maxIntegrity,
      repairPoints,
      repairRate,
      durationSegments,
      startSegment: this.runtime.currentSegment + 1,
      completeSegment: this.runtime.currentSegment + durationSegments,
      suppliesCost: costs.supplies,
      manpowerCost: costs.manpower
    };
    let createdId: string | null = null;
    const result = this.transactCampaignOrders(
      "orders:create-infrastructure-repair-draft",
      `${infrastructure.role} repair draft added for ${targetOffsetHexKey}.`,
      (draft) => {
        createdId = createInfrastructureRepairOrderDraft(draft, { faction, payload }).id;
      },
      { kind: "infrastructureRepair", targetHexKey: targetOffsetHexKey, repairPoints }
    );
    if (!result.ok) return result;
    const order = createdId && this.runtime?.orders[createdId];
    return order ? { ok: true, order: structuredClone(order) } : { ok: false, reason: "The repair draft was not retained." };
  }

  /** Adds an intelligence/counterintelligence draft after current target and asset rule checks. */
  createIntelOperationDraft(options: {
    type: CampaignIntelOperationType;
    targetHexKey: string;
    faction?: CampaignFactionKey;
    assignedAssetKey?: string;
    targetContactId?: string;
    replaceOrderId?: string;
  }): { ok: true; order: CampaignOrder } | { ok: false; reason: string } {
    if (!this.runtime || !this.scenario) return { ok: false, reason: "No campaign scenario is loaded." };
    const faction = options.faction ?? "Player";
    const target = this.parseOffsetKeyToAxial(options.targetHexKey);
    if (!target) return { ok: false, reason: "Choose a valid campaign hex." };
    const state = this.ensureKnowledgeState(faction);
    const rule = INTEL_OPERATION_RULES[options.type];
    const assets = this.getEligibleIntelAssets(options.type, faction, options.targetHexKey);
    if (rule.requiresAsset !== "none") {
      if (!options.assignedAssetKey) return { ok: false, reason: "Assign an eligible formation or air unit." };
      if (!assets.some((asset) => asset.assetKey === options.assignedAssetKey)) {
        return { ok: false, reason: "The selected asset is unavailable, ineligible, or out of range for this operation." };
      }
    }
    if (rule.requiresAsset === "friendlyForce") {
      const targetTile = this.findTileByOffsetKey(options.targetHexKey);
      const owner = targetTile ? targetTile.factionControl ?? this.scenario.tilePalette[targetTile.tile]?.factionControl : null;
      if (owner !== faction || (targetTile?.forces?.length ?? 0) === 0) {
        return { ok: false, reason: "Operational Security must protect a friendly force concentration." };
      }
    }
    if (options.type === "verify" && !state.contacts.some((contact) => contact.id === options.targetContactId)) {
      return { ok: false, reason: "Select an existing contact to verify." };
    }
    const payload: CampaignIntelligenceOrderPayload = {
      operationType: options.type,
      targetHexKey: options.targetHexKey,
      assignedAssetKey: options.assignedAssetKey ?? null,
      targetContactId: options.targetContactId ?? null,
      durationSegments: rule.durationSegments,
      capacityCost: rule.capacityCost,
      suppliesCost: rule.suppliesCost,
      fuelCost: rule.fuelCost,
      resolveSegment: this.runtime.currentSegment + rule.durationSegments
    };
    const kind = options.type === "counterRecon" || options.type === "opsec" || options.type === "phantom"
      ? "counterIntelligence" as const
      : "reconnaissance" as const;
    let createdId: string | null = null;
    const result = this.transactCampaignOrders(
      "orders:create-intelligence-draft",
      `${rule.label} draft ${options.replaceOrderId ? "replaced" : "added"} for ${options.targetHexKey}.`,
      (draft) => {
        if (options.replaceOrderId && !removeCampaignOrderDraft(draft, options.replaceOrderId)) {
          throw new Error("The intelligence draft is no longer editable.");
        }
        const created = createIntelligenceOrderDraft(draft, { faction, kind, payload });
        if (options.replaceOrderId && !created.validation.valid) throw new Error(created.validation.issues[0]?.message ?? "The replacement intelligence draft is invalid.");
        createdId = created.id;
      },
      { kind, operationType: options.type, targetHexKey: options.targetHexKey, replaceOrderId: options.replaceOrderId ?? null }
    );
    if (!result.ok) return result;
    const order = createdId && this.runtime?.orders[createdId];
    return order ? { ok: true, order: structuredClone(order) } : { ok: false, reason: "The intelligence draft was not retained." };
  }

  /** Returns the Player-owned reservation records attached to one projected order. */
  getCampaignOrderReservations(orderId: string, faction: CampaignFactionKey = "Player"): CampaignOrderCancellationPreview["releasedReservations"] {
    const order = this.runtime?.orders[orderId];
    if (!order || order.faction !== faction || !this.runtime) return [];
    return order.reservationIds.flatMap((id) => {
      const reservation = this.runtime?.reservations[id];
      return reservation ? [structuredClone(reservation)] : [];
    });
  }

  /** Revalidates a clone and reports the exact atomic draft set without changing campaign revision or holds. */
  getCampaignOrderCommitPreview(orderIds?: readonly string[]): CampaignOrderCommitPreview {
    if (!this.runtime) return { canCommit: false, draftIds: [], validDraftCount: 0, blockers: [] };
    const candidate = structuredClone(this.runtime);
    revalidateCampaignOrderBook(candidate);
    const draftIds = orderIds
      ? [...new Set(orderIds)].filter((id) => candidate.orders[id]?.status === "draft")
      : candidate.orderOrder.filter((id) => candidate.orders[id]?.status === "draft" && candidate.orders[id]?.faction === "Player");
    const blockers = draftIds.flatMap((orderId) => candidate.orders[orderId]?.validation.issues.map((entry) => ({
      orderId,
      code: entry.code,
      message: entry.message,
      reservationId: entry.reservationId
    })) ?? []);
    const validDraftCount = draftIds.filter((id) => candidate.orders[id]?.validation.valid).length;
    return {
      canCommit: draftIds.length > 0 && blockers.length === 0 && validDraftCount === draftIds.length,
      draftIds,
      validDraftCount,
      blockers
    };
  }

  /** Moves draft priority one place and atomically revalidates every affected reservation. */
  moveCampaignOrder(orderId: string, direction: "earlier" | "later"): { ok: boolean; reason?: string } {
    const order = this.runtime?.orders[orderId];
    if (!order || order.status !== "draft") return { ok: false, reason: "Only an editable draft can change priority." };
    return this.transactCampaignOrders(
      "orders:move-draft",
      `Draft order ${orderId} moved ${direction} in planning priority.`,
      (draft) => {
        if (!moveCampaignOrderDraft(draft, orderId, direction)) throw new Error(`The draft cannot move ${direction}.`);
      },
      { orderId, direction }
    );
  }

  /** Returns exact release/refund and legality facts before a committed order is cancelled. */
  previewCampaignOrderCancellation(orderId: string, faction: CampaignFactionKey = "Player"): CampaignOrderCancellationPreview {
    const order = this.runtime?.orders[orderId];
    const unavailable = (
      reasonCode: CampaignOrderValidationCode,
      reason: string,
      correctiveAction: string
    ): CampaignOrderCancellationPreview => ({
      orderId,
      canCancel: false,
      reasonCode,
      reason,
      correctiveAction,
      releasedReservations: [],
      sunkCostSummary: "No cancellation was applied.",
      delaySummary: "The current order remains in force.",
      exposureSummary: "Review its current lifecycle state before issuing a follow-on order."
    });
    if (!order || order.faction !== faction) {
      return unavailable("ORDER_TARGET_INVALID", "The selected order is unavailable.", "Return to the order tray and select a current friendly order.");
    }
    if (order.status === "draft") {
      return unavailable("ORDER_OPERATION_INVALID", "This is still a draft and has not been committed.", "Use Remove draft to release its proposed holds.");
    }
    if (order.kind === "production") {
      return unavailable("ORDER_OPERATION_INVALID", "A committed production allocation cannot be cancelled.", "Create and commit a new allocation to supersede it at the next delivery.");
    }
    if (order.status !== "committed") {
      return unavailable("ORDER_OPERATION_INVALID", "This order has already started or ended.", "Allow it to resolve or issue a follow-on order.");
    }
    const reservations = this.getCampaignOrderReservations(orderId, faction);
    const releaseSummary = reservations.length === 0
      ? "No shared-pool reservation is attached."
      : `${reservations.length} resource, capacity, formation, or asset reservation${reservations.length === 1 ? "" : "s"} will be released.`;
    const delaySummary = order.kind === "redeploy"
      ? "The force remains at its origin; any replacement movement starts on a later command boundary."
      : order.kind === "infrastructureRepair"
        ? "Reconstruction will not begin; facility recovery is delayed until a replacement order is committed."
        : "Collection will not begin; intelligence coverage and any expected report are delayed.";
    const exposureSummary = order.kind === "redeploy"
      ? "The force remains available at its current location but does not reinforce the planned destination."
      : order.kind === "infrastructureRepair"
        ? "The damaged facility continues operating at its present reduced effectiveness."
        : "The target remains at its current uncertainty and the assigned asset returns to the available pool.";
    return {
      orderId,
      canCancel: true,
      reasonCode: null,
      reason: releaseSummary,
      correctiveAction: "Confirm cancellation only if the operational delay is acceptable.",
      releasedReservations: reservations,
      sunkCostSummary: "No sunk cost before execution; committed resource charges are refunded exactly.",
      delaySummary,
      exposureSummary
    };
  }

  /** Removes one uncommitted draft and releases/rebalances all affected proposed holds. */
  removeCampaignOrder(orderId: string): { ok: boolean; reason?: string } {
    const order = this.runtime?.orders[orderId];
    if (!order) return { ok: false, reason: "Order not found." };
    if (order.status !== "draft") return { ok: false, reason: "Only a draft can be removed." };
    return this.transactCampaignOrders(
      "orders:remove-draft",
      `Draft order ${orderId} removed.`,
      (draft) => {
        if (!removeCampaignOrderDraft(draft, orderId)) throw new Error("The order is no longer an editable draft.");
      },
      { orderId }
    );
  }

  /** Commits selected drafts (or every Player draft) in one validated all-or-nothing runtime revision. */
  commitCampaignOrders(orderIds?: readonly string[]):
    | { ok: true; committedCount: number }
    | { ok: false; reason: string; draftsPreserved: true; blockers: CampaignOrderCommitPreview["blockers"] } {
    if (!this.runtime) return { ok: false, reason: "No campaign runtime is loaded.", draftsPreserved: true, blockers: [] };
    const requested = orderIds
      ? [...new Set(orderIds)]
      : this.runtime.orderOrder.filter((id) => this.runtime?.orders[id]?.status === "draft" && this.runtime?.orders[id]?.faction === "Player");
    if (requested.length === 0) return { ok: false, reason: "There are no draft orders to commit.", draftsPreserved: true, blockers: [] };
    const preview = this.getCampaignOrderCommitPreview(requested);
    if (!preview.canCommit) {
      return {
        ok: false,
        reason: preview.blockers[0]?.message ?? "The selected draft set is no longer valid.",
        draftsPreserved: true,
        blockers: preview.blockers
      };
    }
    const result = this.transactCampaignOrders(
      "orders:commit",
      `${requested.length} campaign order${requested.length === 1 ? "" : "s"} committed atomically.`,
      (draft) => {
        commitCampaignOrderDrafts(draft, requested);
      },
      { orderCount: requested.length }
    );
    return result.ok
      ? { ok: true, committedCount: requested.length }
      : { ok: false, reason: result.reason, draftsPreserved: true, blockers: this.getCampaignOrderCommitPreview(requested).blockers };
  }

  /** Cancels a committed movement/intelligence order only while its execution adapter has not begun. */
  cancelCampaignOrder(orderId: string): { ok: boolean; reason?: string } {
    const order = this.runtime?.orders[orderId];
    if (!order) return { ok: false, reason: "Order not found." };
    if (order.status === "draft") return this.removeCampaignOrder(orderId);
    if (order.status !== "committed") return { ok: false, reason: "This order has already started or ended." };
    if (order.kind === "production") return { ok: false, reason: "A committed production allocation cannot be cancelled; issue a new allocation draft." };
    return this.transactCampaignOrders(
      "orders:cancel",
      `Committed ${order.kind} order ${orderId} cancelled before execution.`,
      (draft) => {
        const candidate = draft.orders[orderId];
        if (!candidate || candidate.status !== "committed") throw new Error("The order is no longer cancellable.");
        const economy = draft.factions[String(candidate.faction)]?.economy;
        if (!economy) throw new Error("The issuing economy is unavailable.");
        if (candidate.kind === "redeploy") {
          const index = draft.compatibility.queuedDecisions.findIndex((entry) => entry.id === candidate.executionRefId);
          const decision = draft.compatibility.queuedDecisions[index];
          if (index < 0 || decision?.payload.status !== "queued") throw new Error("Redeployment has already begun.");
          economy.fuel += candidate.payload.fuelCost;
          economy.supplies += candidate.payload.suppliesCost;
          economy.manpower += candidate.payload.manpowerCost;
          if (candidate.payload.transportCapacityType && candidate.payload.transportCapacityCost > 0) {
            const capacity = economy.transportCapacity as unknown as Record<string, number> | undefined;
            const key = `${candidate.payload.transportCapacityType}InTransit`;
            if (capacity) capacity[key] = Math.max(0, (capacity[key] ?? 0) - candidate.payload.transportCapacityCost);
          }
          candidate.payload.formationIds?.forEach((formationId) => {
            const formation = draft.formations[formationId];
            if (!formation || formation.currentOrderId !== candidate.id) return;
            formation.currentOrderId = null;
            if (formation.status === "inTransit") formation.status = "ready";
          });
          draft.compatibility.queuedDecisions.splice(index, 1);
        } else if (candidate.kind === "infrastructureRepair") {
          const tile = draft.tiles[candidate.payload.targetRuntimeHexKey];
          const infrastructure = tile?.infrastructure;
          const engineer = draft.formations[candidate.payload.engineerFormationId];
          if (!infrastructure || infrastructure.activeRepairOrderId !== candidate.id) {
            throw new Error("Facility repair has already begun or was interrupted.");
          }
          economy.supplies += candidate.payload.suppliesCost;
          economy.manpower += candidate.payload.manpowerCost;
          infrastructure.activeRepairOrderId = null;
          if (engineer?.currentOrderId === candidate.id) engineer.currentOrderId = null;
        } else {
          if (candidate.kind === "production") throw new Error("A production allocation cannot be cancelled after commit.");
          const knowledge = draft.knowledgeByFaction[String(candidate.faction)];
          const index = knowledge?.operations.findIndex((entry) => entry.id === candidate.executionRefId) ?? -1;
          const operation = index >= 0 ? knowledge?.operations[index] : null;
          if (!knowledge || !operation || operation.status !== "planned") throw new Error("Intelligence operation has already begun.");
          economy.supplies += candidate.payload.suppliesCost;
          economy.fuel += candidate.payload.fuelCost;
          knowledge.operations.splice(index, 1);
        }
        candidate.status = "cancelled";
        setCampaignOrderReservationStatus(draft, candidate, "released");
        revalidateCampaignOrderBook(draft);
      },
      { orderId, kind: order.kind }
    );
  }

  /**
   * WHAT: Returns a defensive snapshot of the frozen authored definition.
   * WHY: Save content checks and certification need to prove runtime/definition identity without mutation access.
   *
   * @returns Definition snapshot or null when no campaign is loaded.
   */
  getScenarioDefinitionSnapshot(): CampaignScenarioDefinition | null {
    return this.scenarioDefinition ? structuredClone(this.scenarioDefinition) : null;
  }

  subscribe(listener: CampaignUpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @deprecated Legacy synchronous localStorage compatibility only; live UI uses `loadPrimaryCampaign()`. */
  hasSave(): boolean {
    try {
      return Boolean(this.legacyStorage?.getItem(CAMPAIGN_LEGACY_SAVE_KEY));
    } catch {
      return false;
    }
  }

  /** @deprecated Legacy synchronous localStorage compatibility only; live UI uses `savePrimaryCampaign()`. */
  saveToStorage(): void {
    try {
      if (!this.scenario) return;
      this.reconcileCompatibilityProjection("manual");
      const snapshot = {
        saveVersion: 2,
        scenario: this.scenario,
        turnState: this.turnState,
        decisions: this.decisions,
        engagements: this.engagements,
        activeEngagementId: this.activeEngagementId,
        currentSegment: this.currentSegment,
        intelligenceByFaction: this.intelligenceByFaction
      };
      this.legacyStorage?.setItem(CAMPAIGN_LEGACY_SAVE_KEY, JSON.stringify(snapshot));
    } catch {
      /* no-op */
    }
  }

  /** @deprecated Legacy synchronous localStorage compatibility only; live UI uses `loadPrimaryCampaign()`. */
  loadFromStorage(): void {
    try {
      const raw = this.legacyStorage?.getItem(CAMPAIGN_LEGACY_SAVE_KEY) ?? null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        saveVersion: number;
        scenario: CampaignScenarioData;
        turnState: CampaignTurnState | null;
        decisions: CampaignDecision[];
        engagements: CampaignPendingEngagement[];
        activeEngagementId: string | null;
        currentSegment: number;
        currentDay: number; // Legacy support
        intelligenceByFaction: Record<string, CampaignKnowledgeState>;
      }>;
      if (parsed.scenario) {
        this.scenario = parsed.scenario;
        if (!this.scenarioDefinition || this.scenarioDefinition.key !== parsed.scenario.key) {
          this.authoredScenarioSource = structuredClone(parsed.scenario);
          this.scenarioDefinition = splitLegacyCampaignScenario(parsed.scenario);
          this.runtime = null;
          this.compatibilityProjectionHash = null;
        }
      }
      this.turnState = parsed.turnState ?? null;
      this.decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
      this.engagements = Array.isArray(parsed.engagements) ? parsed.engagements : [];
      this.activeEngagementId = parsed.activeEngagementId ?? null;

      // Support both new segment system and legacy day system
      if (Number.isFinite(parsed.currentSegment)) {
        this.currentSegment = parsed.currentSegment as number;
      } else if (Number.isFinite(parsed.currentDay)) {
        // Convert legacy day to segment (assume start of day)
        this.currentSegment = ((parsed.currentDay as number) - 1) * 8;
      } else {
        this.currentSegment = 0;
      }

      if (parsed.intelligenceByFaction && typeof parsed.intelligenceByFaction === "object") {
        this.intelligenceByFaction = structuredClone(parsed.intelligenceByFaction);
      } else if (this.scenario) {
        // v1 migration: the old scalar intelCoverage had no knowledge semantics, so seed a truthful
        // baseline from scenario briefings and direct/front-line observation.
        this.initializeCampaignIntelligence();
      }

      this.refreshIntelCapacity();

      this.notify("scenarioLoaded");
    } catch {
      /* no-op */
    }
  }

  /**
   * WHAT: Hydrates a verified envelope into authoritative runtime and regenerates the compatibility projection.
   * WHY: Load/recovery must never assign legacy fields independently or bypass current authored-content policy.
   *
   * @param envelope - Candidate current or recovery envelope.
   * @throws CampaignSaveError when checksum, runtime, or content identity is invalid.
   */
  private applyCampaignSaveEnvelope(envelope: FourStarCampaignSaveEnvelope): void {
    if (!this.scenarioDefinition) {
      throw new CampaignSaveError("CONTENT_MISMATCH", "No authored campaign scenario is loaded for save migration.");
    }
    const validation = validateCampaignSaveEnvelope(envelope);
    if (!validation.ok) throw validation.error;
    const content = migrateCampaignRuntimeContent(validation.envelope.payload.runtime, this.scenarioDefinition);
    this.runtime = content.runtime;
    reconcileCampaignInfrastructure(this.runtime, this.scenarioDefinition!.map.tilePalette);
    reconcileCampaignObjectiveRuntime(this.runtime, this.scenarioDefinition!);
    this.activeBattleSave = validation.envelope.payload.activeBattle
      ? assertCompleteActiveCampaignBattleSave(validation.envelope.payload.activeBattle, {
          campaignId: this.runtime.campaignId,
          campaignRevision: this.runtime.revision,
          scenarioKey: this.runtime.scenarioKey,
          engagementId: this.runtime.activeEngagementId ?? ""
        })
      : null;
    this.postBattleAutosaveStatus = null;
    this.hydrateCompatibilityProjection(this.runtime);
    this.notify("scenarioLoaded");
  }

  /** Saves authoritative campaign truth, including an optional active battle, into one named copy-on-write slot. */
  async saveCampaignSlot(request: CampaignStateSlotSaveRequest): Promise<CampaignSaveSlotIndexEntry> {
    this.reconcileCompatibilityProjection("manual");
    if (!this.runtime || !this.scenarioDefinition) {
      throw new CampaignSaveError("INVALID_ENVELOPE", "No authoritative campaign runtime is available to save.");
    }
    if (request.slotId.trim().length === 0 || request.label.trim().length === 0) {
      throw new CampaignSaveError("INVALID_ENVELOPE", "Campaign save slot ID and label must be non-empty.");
    }
    const runtime = structuredClone(this.runtime);
    const tacticalBoundary = this.activeBattleSave?.battle.boundary ?? null;
    const saveId = createStableCampaignRecordId(
      "save",
      runtime.campaignId,
      runtime.revision,
      request.timestamp,
      request.slotId
    );
    const lastEventSummary = runtime.eventLog[runtime.eventLog.length - 1]?.summary ?? null;
    const envelope = createCampaignSaveEnvelope({
      saveId,
      slotType: request.slotType,
      gameMode: "campaign",
      createdAt: request.timestamp,
      updatedAt: request.timestamp,
      buildVersion: this.buildVersion,
      contentVersion: this.contentVersion,
      scenarioKey: runtime.scenarioKey,
      campaignId: runtime.campaignId,
      engagementId: runtime.activeEngagementId,
      display: {
        campaignTitle: this.scenarioDefinition.title,
        segment: runtime.currentSegment,
        phaseLabel: tacticalBoundary
          ? `Tactical turn ${tacticalBoundary.turn} · ${tacticalBoundary.phase}`
          : runtime.status === "engagement"
            ? "Tactical engagement"
            : runtime.campaignOutcome
              ? runtime.campaignOutcome.grade === "decisiveVictory"
                ? "Decisive victory"
                : runtime.campaignOutcome.grade === "costlyVictory"
                  ? "Costly victory"
                  : runtime.campaignOutcome.grade.charAt(0).toUpperCase() + runtime.campaignOutcome.grade.slice(1)
              : getCampaignPhaseLabel(runtime, this.scenarioDefinition),
        lastEventSummary,
        playTimeSeconds: request.playTimeSeconds,
        difficulty: request.difficulty,
        result: runtime.status === "victory" ? "victory" : runtime.status === "defeat" ? "defeat" : null,
        thumbnailKey: request.thumbnailKey ?? null
      },
      payload: {
        runtime,
        activeBattle: this.activeBattleSave ? structuredClone(this.activeBattleSave) : null,
        commanderRosterLink: request.commanderRosterLink,
        uiResumeContext: structuredClone(request.uiResumeContext)
      }
    });
    return this.saveRepository.saveSlot({
      slotId: request.slotId,
      label: request.label,
      envelope
    });
  }

  /**
   * WHAT: Saves authoritative runtime into the primary copy-on-write Campaign 2.0 slot.
   * WHY: Live Save must use verified IndexedDB persistence and must never claim success after a failed write.
   */
  async savePrimaryCampaign(request: CampaignStatePersistenceRequest): Promise<CampaignSaveSlotIndexEntry> {
    return this.saveCampaignSlot({
      ...request,
      slotId: CAMPAIGN_PRIMARY_SAVE_SLOT_ID,
      slotType: "manual"
    });
  }

  /** Returns validated named save-slot metadata for first-class save browsers. */
  async listCampaignSaveSlots(): Promise<readonly CampaignSaveSlotIndexEntry[]> {
    return this.saveRepository.listSlots();
  }

  /** Returns defensive quarantine diagnostics so recovery UI can explain and export damaged records. */
  async listCampaignSaveQuarantine(): Promise<readonly CampaignSaveQuarantineRecord[]> {
    return this.saveRepository.listQuarantine();
  }

  /**
   * WHAT: Converts unknown storage failures into stable save errors for state/UI results.
   * WHY: Load callers need one predictable result union even when a backend throws outside envelope validation.
   *
   * @param error - Unknown persistence failure.
   * @param action - Diagnostic action phrase.
   * @returns Stable CampaignSaveError.
   */
  private normalizeSaveError(error: unknown, action: string): CampaignSaveError {
    if (error instanceof CampaignSaveError) return error;
    const detail = error instanceof Error ? error.message : String(error);
    return new CampaignSaveError("STORAGE_FAILED", `Campaign save failed while ${action}: ${detail}`, { action, detail });
  }

  /** Returns current authored identity plus only the exact prior hash with a certified migration. */
  private getExpectedSaveContent(): CampaignSaveExpectedContent {
    if (!this.scenarioDefinition) {
      throw new CampaignSaveError("CONTENT_MISMATCH", "No authored campaign scenario is loaded for save validation.");
    }
    const scenarioContentHash = computeCampaignContentHash(this.scenarioDefinition);
    return {
      scenarioKey: this.scenarioDefinition.key,
      scenarioContentHash,
      ...(this.scenarioDefinition.key === "central_channel"
        && scenarioContentHash === CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH
        ? {
            compatiblePriorContentHashes: [
              CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH,
              CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH
            ]
          }
        : {})
    };
  }

  /** Loads one named Campaign 2.0 slot without applying legacy-primary migration policy. */
  async loadCampaignSlot(
    slotId: string,
    request: CampaignStatePersistenceRequest
  ): Promise<CampaignStateLoadResult> {
    let expectedContent: CampaignSaveExpectedContent;
    try {
      expectedContent = this.getExpectedSaveContent();
    } catch (error) {
      return { ok: false, error: this.normalizeSaveError(error, "resolving authored content"), recoveryCandidate: null };
    }
    try {
      const stored = await this.saveRepository.loadSlot(slotId, {
        observedAt: request.timestamp,
        expectedContent
      });
      if (!stored.ok) return stored;
      this.applyCampaignSaveEnvelope(stored.envelope);
      return { ok: true, envelope: stored.envelope, source: "campaign2", warning: null };
    } catch (error) {
      return {
        ok: false,
        error: this.normalizeSaveError(error, `loading campaign slot ${slotId}`),
        recoveryCandidate: null
      };
    }
  }

  /**
   * WHAT: Loads the verified primary Campaign 2.0 slot or performs first-use pure legacy migration/write-through.
   * WHY: The original localStorage save must remain untouched until a new envelope is durable and successfully hydrated.
   *
   * @param request - Explicit migration/save metadata and observation timestamp.
   * @returns Applied current/migrated save or failure with optional unapplied recovery candidate.
   */
  async loadPrimaryCampaign(request: CampaignStatePersistenceRequest): Promise<CampaignStateLoadResult> {
    let expectedContent: CampaignSaveExpectedContent;
    try {
      expectedContent = this.getExpectedSaveContent();
    } catch (error) {
      return { ok: false, error: this.normalizeSaveError(error, "resolving authored content"), recoveryCandidate: null };
    }
    const loadOptions: CampaignSaveSlotLoadOptions = {
      observedAt: request.timestamp,
      expectedContent
    };

    try {
      const stored = await this.saveRepository.loadSlot(CAMPAIGN_PRIMARY_SAVE_SLOT_ID, loadOptions);
      if (stored.ok) {
        this.applyCampaignSaveEnvelope(stored.envelope);
        return { ok: true, envelope: stored.envelope, source: "campaign2", warning: null };
      }
      if (stored.error.code !== "SLOT_NOT_FOUND") return stored;

      const legacyRaw = this.legacyStorage?.getItem(CAMPAIGN_LEGACY_SAVE_KEY) ?? null;
      if (!legacyRaw) return stored;
      if (!this.authoredScenarioSource) {
        return {
          ok: false,
          error: new CampaignSaveError(
            "MIGRATION_FAILED",
            "Legacy campaign save exists but no authored scenario source is loaded for migration."
          ),
          recoveryCandidate: null
        };
      }

      const authoredScenario = structuredClone(this.authoredScenarioSource);
      const migrated = migrateLegacyCampaignSave(legacyRaw, {
        resolveScenario: (scenarioKey) => scenarioKey === authoredScenario.key ? structuredClone(authoredScenario) : null,
        buildVersion: this.buildVersion,
        contentVersion: this.contentVersion,
        createdAt: request.timestamp,
        updatedAt: request.timestamp,
        slotType: "manual",
        playTimeSeconds: request.playTimeSeconds,
        difficulty: request.difficulty,
        commanderRosterLink: request.commanderRosterLink,
        uiResumeContext: structuredClone(request.uiResumeContext)
      });
      await this.saveRepository.saveSlot({
        slotId: CAMPAIGN_PRIMARY_SAVE_SLOT_ID,
        label: request.label,
        envelope: migrated.envelope
      });
      const verified = await this.saveRepository.loadSlot(CAMPAIGN_PRIMARY_SAVE_SLOT_ID, loadOptions);
      if (!verified.ok) return verified;

      this.scenarioDefinition = migrated.definition;
      this.applyCampaignSaveEnvelope(verified.envelope);
      let warning: string | null = null;
      try {
        this.legacyStorage?.setItem(CAMPAIGN_LEGACY_MIGRATION_MARKER_KEY, JSON.stringify({
          sourceHash: migrated.sourceHash,
          sourceVersion: migrated.sourceVersion,
          saveId: verified.envelope.saveId,
          checksum: verified.envelope.checksum,
          migratedAt: request.timestamp
        }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        warning = `Campaign migrated successfully, but its migration marker could not be written: ${detail}`;
      }
      return { ok: true, envelope: verified.envelope, source: "legacyMigration", warning };
    } catch (error) {
      return { ok: false, error: this.normalizeSaveError(error, "loading the primary campaign slot"), recoveryCandidate: null };
    }
  }

  /**
   * WHAT: Applies a repository-verified prior save only after the caller/player explicitly accepts recovery.
   * WHY: Recovery discovery must never silently replace the requested current slot state.
   *
   * @param candidate - Independently validated repository recovery candidate.
   * @returns Applied recovery result; the slot pointer remains unchanged until a later explicit save.
   */
  restorePrimaryCampaignRecovery(candidate: CampaignSaveRecoveryCandidate): CampaignStateLoadSuccess {
    return this.restoreCampaignRecovery(candidate);
  }

  /** Applies an explicitly accepted, independently verified recovery candidate from any named slot. */
  restoreCampaignRecovery(candidate: CampaignSaveRecoveryCandidate): CampaignStateLoadSuccess {
    this.applyCampaignSaveEnvelope(candidate.envelope);
    return { ok: true, envelope: candidate.envelope, source: "recovery", warning: null };
  }

  emit(reason: CampaignUpdateReason = "manual"): void {
    this.notify(reason);
  }

  private notify(reason: CampaignUpdateReason): void {
    if (reason !== "reset") this.reconcileCompatibilityProjection(reason);
    this.listeners.forEach((listener) => {
      try {
        listener(reason);
      } catch (err) {
        // console surface only; state remains intact
        console.error("[CampaignState] listener error", { reason, err });
      }
    });
  }

  setScenario(scenario: CampaignScenarioData): void {
    // Validate and split a defensive candidate before replacing any live authored state.
    // Editor/import mistakes must fail atomically so a rejected scenario cannot poison
    // the source later used by save migration while the previous runtime stays visible.
    const authoredScenario = structuredClone(scenario);
    const scenarioDefinition = splitLegacyCampaignScenario(authoredScenario);
    this.authoredScenarioSource = structuredClone(authoredScenario);
    this.scenarioDefinition = scenarioDefinition;
    this.runtime = null;
    this.activeBattleSave = null;
    this.postBattleAutosaveStatus = null;
    this.compatibilityProjectionHash = null;
    this.scenario = authoredScenario;
    // Seed control-since timestamps so fronts can measure hold duration from the start.
    try {
      const segment = this.currentSegment;
      for (const t of this.scenario.tiles) {
        const palette = this.scenario.tilePalette[t.tile];
        const owner = t.factionControl ?? palette?.factionControl;
        if (owner && typeof (t as any).controlSinceSegment !== "number") {
          (t as any).controlSinceSegment = segment;
        }
      }
    } catch {}

    // Auto-calculate power values based on strategic assets
    this.updatePowerValues();
    this.initializeCampaignIntelligence();

    this.notify("scenarioLoaded");
  }

  getScenario(): CampaignScenarioData | null {
    return this.scenario ? structuredClone(this.scenario) : null;
  }

  /** Returns the sanitized campaign projection for one observing faction. */
  getCampaignMapView(faction: CampaignFactionKey = "Player"): CampaignMapViewModel | null {
    if (!this.scenario) return null;
    const state = this.ensureKnowledgeState(faction);
    return buildCampaignMapView(this.scenario, state, this.currentSegment);
  }

  /** Returns only the seed-free operation projection needed by the intelligence drawer. */
  getIntelOperations(faction: CampaignFactionKey = "Player"): CampaignIntelOperationView[] {
    if (!this.scenario) return [];
    return this.ensureKnowledgeState(faction).operations.map(({ seed: _seed, ...operation }) => structuredClone(operation));
  }

  getIntelContactsAtHex(hexKey: string, faction: CampaignFactionKey = "Player") {
    const view = this.getCampaignMapView(faction);
    if (!view) return [];
    return view.enemyContacts.filter((contact) => {
      const center = this.parseOffsetKeyToAxial(hexKey);
      const location = this.parseOffsetKeyToAxial(contact.locationHexKey);
      return Boolean(center && location && hexDistance(center, location) <= contact.uncertaintyRadius);
    });
  }

  hasActionableEnemyContactNear(hexKey: string, faction: CampaignFactionKey = "Player", radius = 1): boolean {
    const origin = this.parseOffsetKeyToAxial(hexKey);
    const view = this.getCampaignMapView(faction);
    if (!origin || !view) return false;
    return view.enemyContacts.some((contact) => {
      const location = this.parseOffsetKeyToAxial(contact.locationHexKey);
      return Boolean(location && hexDistance(origin, location) <= radius + contact.uncertaintyRadius);
    });
  }

  getIntelBriefEvents(faction: CampaignFactionKey = "Player"): CampaignIntelBriefEvent[] {
    if (!this.scenario) return [];
    return structuredClone(this.ensureKnowledgeState(faction).briefEvents)
      .sort((a, b) => b.segment - a.segment);
  }

  markIntelBriefsRead(faction: CampaignFactionKey = "Player"): void {
    if (!this.scenario) return;
    const state = this.ensureKnowledgeState(faction);
    state.briefEvents.forEach((event) => { event.read = true; });
    this.notify("intelligenceUpdated");
  }

  getIntelOperationRules() {
    return structuredClone(INTEL_OPERATION_RULES);
  }

  getEligibleIntelAssets(
    type: CampaignIntelOperationType,
    faction: CampaignFactionKey = "Player",
    targetHexKey?: string
  ) {
    if (!this.scenario) return [];
    const state = this.ensureKnowledgeState(faction);
    const committedAssets = new Set(state.operations
      .filter((operation) => operation.status === "planned" || operation.status === "active")
      .map((operation) => operation.assignedAssetKey)
      .filter((assetKey): assetKey is string => Boolean(assetKey)));
    return findEligibleIntelAssets(this.scenario, faction, type)
      .filter((asset) => !committedAssets.has(asset.assetKey))
      .filter((asset) => !targetHexKey || isIntelAssetInRange(asset.hexKey, targetHexKey, type));
  }

  scheduleIntelOperation(options: {
    type: CampaignIntelOperationType;
    targetHexKey: string;
    faction?: CampaignFactionKey;
    assignedAssetKey?: string;
    targetContactId?: string;
  }): { ok: true; operation: CampaignIntelOperationView } | { ok: false; reason: string } {
    if (!this.scenario) return { ok: false, reason: "No campaign scenario is loaded." };
    const faction = options.faction ?? "Player";
    const target = this.parseOffsetKeyToAxial(options.targetHexKey);
    if (!target) return { ok: false, reason: "Choose a valid campaign hex." };
    const state = this.ensureKnowledgeState(faction);
    const rule = INTEL_OPERATION_RULES[options.type];
    const committed = getCommittedCapacity(state);
    if (committed + rule.capacityCost > state.capacityTotal) {
      return { ok: false, reason: `This order needs ${rule.capacityCost} Intelligence Capacity; ${Math.max(0, state.capacityTotal - committed)} is available.` };
    }
    const assets = this.getEligibleIntelAssets(options.type, faction, options.targetHexKey);
    if (rule.requiresAsset !== "none") {
      if (!options.assignedAssetKey) return { ok: false, reason: "Assign an eligible formation or air unit." };
      if (!assets.some((asset) => asset.assetKey === options.assignedAssetKey)) {
        return { ok: false, reason: "The selected asset is unavailable, ineligible, or out of range for this operation." };
      }
    }
    if (rule.requiresAsset === "friendlyForce") {
      const targetTile = this.findTileByOffsetKey(options.targetHexKey);
      const owner = targetTile ? (targetTile.factionControl ?? this.scenario.tilePalette[targetTile.tile]?.factionControl) : null;
      if (owner !== faction || (targetTile?.forces?.length ?? 0) === 0) {
        return { ok: false, reason: "Operational Security must protect a friendly force concentration." };
      }
    }
    if (options.type === "verify") {
      const contact = state.contacts.find((candidate) => candidate.id === options.targetContactId);
      if (!contact) return { ok: false, reason: "Select an existing contact to verify." };
    }
    const economy = this.scenario.economies.find((entry) => entry.faction === faction);
    if (!economy || economy.supplies < rule.suppliesCost || economy.fuel < rule.fuelCost) {
      return { ok: false, reason: `Insufficient resources: requires ${rule.suppliesCost} supplies and ${rule.fuelCost} fuel.` };
    }
    economy.supplies = Math.max(0, economy.supplies - rule.suppliesCost);
    economy.fuel = Math.max(0, economy.fuel - rule.fuelCost);
    const operation = createIntelOperation(
      state,
      options.type,
      options.targetHexKey,
      this.currentSegment,
      options.assignedAssetKey,
      options.targetContactId
    );
    state.operations.push(operation);
    this.notify("intelligenceUpdated");
    const { seed: _seed, ...publicOperation } = operation;
    return { ok: true, operation: structuredClone(publicOperation) };
  }

  buildIntelligenceBriefing(battleHexKey: string, faction: CampaignFactionKey = "Player"): CampaignIntelligenceBriefing | null {
    if (!this.scenario) return null;
    return buildIntelligenceBriefing(this.ensureKnowledgeState(faction), battleHexKey, this.currentSegment);
  }

  /** Builds the truth-bearing tactical payload inside the state boundary while freezing a safe briefing. */
  buildCampaignEngagementContext(
    options: Omit<BuildEngagementContextOptions, "intelligenceBriefing">,
    briefingFaction: CampaignFactionKey = "Player"
  ): CampaignEngagementContext | null {
    if (!this.scenario) return null;
    const intelligenceBriefing = buildIntelligenceBriefing(
      this.ensureKnowledgeState(briefingFaction),
      options.battleHexKey,
      this.currentSegment
    );
    const context = buildEngagementContext(this.scenario, { ...options, intelligenceBriefing });
    return context && this.runtime
      ? attachCampaignFormationProvenanceToContext(context, this.runtime)
      : context;
  }

  /**
   * Resolves a front attack from exact, current opposing-control edges.
   * No UI fallback may turn an authored polyline or missing tile into a tactical battle.
   */
  prepareCampaignFrontEngagement(options: {
    readonly engagementId: string;
    readonly frontKey: string;
    readonly attacker: CampaignFactionKey;
    readonly requestedTargetHexKey?: string | null;
  }): CampaignFrontEngagementPreparation {
    if (!this.runtime || !this.scenario) {
      return { ok: false, reason: "No authoritative campaign runtime is available.", targetRequired: false };
    }
    const front = this.runtime.compatibility.initialFronts.find((candidate) => candidate.key === options.frontKey);
    if (!front) {
      return { ok: false, reason: "The selected front no longer exists in current campaign truth.", targetRequired: false };
    }
    if (front.initiative !== options.attacker) {
      return { ok: false, reason: "The selected faction does not hold initiative on this front.", targetRequired: false };
    }
    const legalEdges = (front.edges ?? []).filter((edge) => {
      const friendlyKey = campaignOffsetKeyToRuntimeHexKey(edge.friendlyHexKey);
      const opposingKey = campaignOffsetKeyToRuntimeHexKey(edge.opposingHexKey);
      const friendlyTile = friendlyKey ? this.runtime?.tiles[friendlyKey] : null;
      const opposingTile = opposingKey ? this.runtime?.tiles[opposingKey] : null;
      return Boolean(friendlyTile && opposingTile
        && friendlyTile.controller === options.attacker
        && opposingTile.controller !== "Neutral"
        && opposingTile.controller !== options.attacker
        && hexDistance(friendlyTile.hex, opposingTile.hex) === 1);
    });
    const requestedTarget = options.requestedTargetHexKey ?? null;
    const candidates = requestedTarget
      ? legalEdges.filter((edge) => edge.opposingHexKey === requestedTarget)
      : legalEdges;
    if (candidates.length === 0) {
      return {
        ok: false,
        reason: requestedTarget
          ? "The requested target is not a current opposing-control edge on this front."
          : "This front has no current opposing-control edge that can support a battle.",
        targetRequired: false
      };
    }
    if (!requestedTarget && candidates.length > 1) {
      return { ok: false, reason: "Select which opposing front hex to attack.", targetRequired: true };
    }
    const edge = candidates[0];
    const objectiveKey = this.scenario.objectives.find((objective) => (
      this.axialToOffsetKey(objective.hex.q, objective.hex.r) === edge.opposingHexKey
    ))?.key ?? null;
    let context: CampaignEngagementContext | null;
    try {
      context = this.buildCampaignEngagementContext({
        engagementId: options.engagementId,
        battleHexKey: edge.opposingHexKey,
        attacker: options.attacker,
        frontKey: front.key,
        objectiveKey
      }, options.attacker);
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        targetRequired: false
      };
    }
    if (!context) {
      return { ok: false, reason: "Campaign engagement context could not be built.", targetRequired: false };
    }
    const attackerFormations = context.availableForces.flatMap((group) => group.formationIds ?? []);
    const defenderFormations = context.enemyForces.flatMap((group) => group.formationIds ?? []);
    if (attackerFormations.length === 0 || defenderFormations.length === 0) {
      return {
        ok: false,
        reason: "Both sides need mapped persistent ground formations at this front before battle can begin.",
        targetRequired: false
      };
    }
    return {
      ok: true,
      engagement: {
        id: options.engagementId,
        frontKey: front.key,
        objectiveKey,
        attacker: context.attacker,
        defender: context.defender,
        hexKeys: [edge.friendlyHexKey, edge.opposingHexKey],
        tags: ["front"],
        context
      }
    };
  }

  /** Returns a defensive persistent formation record for later roster/detail surfaces. */
  getCampaignFormationSnapshot(formationId: string): CampaignFormationRecord | null {
    const formation = this.runtime?.formations[formationId];
    return formation ? structuredClone(formation) : null;
  }

  /** Returns stable faction formation order without exposing mutable campaign truth. */
  getCampaignFormationRoster(faction: CampaignFactionKey): CampaignFormationRecord[] {
    if (!this.runtime) return [];
    return this.runtime.formationOrder.flatMap((id) => {
      const formation = this.runtime?.formations[id];
      return formation?.faction === faction ? [structuredClone(formation)] : [];
    });
  }

  /** Returns one defensive append-only engagement ledger row for UI, saves, and diagnostics. */
  getCampaignEngagementLedgerRecord(engagementId: string): CampaignEngagementLedgerRecord | null {
    const record = this.runtime?.engagementLedger[engagementId];
    return record ? structuredClone(record) : null;
  }

  /** Returns the retained immutable tactical facts for a resolved campaign engagement. */
  getCampaignBattleResultPackage(engagementId: string): CampaignBattleResultPackage | null {
    const result = this.runtime?.engagementLedger[engagementId]?.resultPackage;
    return result ? structuredClone(result) : null;
  }

  /** Returns the immutable C20-023 campaign accounting for a resolved tactical engagement. */
  getCampaignBattleConsequenceReport(engagementId: string): CampaignBattleConsequenceReport | null {
    const report = this.runtime?.engagementLedger[engagementId]?.consequenceReport;
    return report ? structuredClone(report) : null;
  }

  /** Returns the immutable C20-024 retreat, occupation, isolation, control, and derived-front audit. */
  getCampaignBattleControlReport(engagementId: string): CampaignBattleControlReport | null {
    const report = this.runtime?.engagementLedger[engagementId]?.controlReport;
    return report ? structuredClone(report) : null;
  }

  /** Returns the immutable C20-025 facility damage, capture, and capacity audit. */
  getCampaignBattleInfrastructureReport(engagementId: string): CampaignBattleInfrastructureReport | null {
    const report = this.runtime?.engagementLedger[engagementId]?.infrastructureReport;
    return report ? structuredClone(report) : null;
  }

  /** Returns one retained integrity-checked campaign AAR. */
  getCampaignAfterActionReport(engagementId: string): CampaignAfterActionReport | null {
    const report = this.runtime?.engagementLedger[engagementId]?.afterActionReport;
    return report ? assertCampaignAfterActionReport(report) : null;
  }

  /** Returns the Player-safe campaign battle archive newest-first. */
  getCampaignAfterActionReports(): CampaignAfterActionReportPresentation[] {
    return this.runtime ? projectCampaignAfterActionReports(this.runtime) : [];
  }

  /** Counts reports that still require explicit player acknowledgement. */
  getUnreadCampaignAfterActionReportCount(): number {
    return this.getCampaignAfterActionReports().filter((report) => !report.acknowledged).length;
  }

  /** Returns ephemeral write status for the newest post-battle recovery checkpoint. */
  getPostBattleAutosaveStatus(): CampaignPostBattleAutosaveStatus | null {
    return this.postBattleAutosaveStatus ? { ...this.postBattleAutosaveStatus } : null;
  }

  /** Acknowledges a report without changing its integrity-bound historical payload. */
  acknowledgeCampaignAfterActionReport(reportId: string): boolean {
    if (!this.runtime || !reportId.trim()) return false;
    const exists = this.runtime.engagementLedgerOrder.some((engagementId) => (
      this.runtime?.engagementLedger[engagementId]?.afterActionReport?.reportId === reportId
    ));
    if (!exists) return false;
    const acknowledged = this.runtime.acknowledgedAfterActionReportIds ??= [];
    if (!acknowledged.includes(reportId)) acknowledged.push(reportId);
    this.notify("engagementLedgerUpdated");
    return true;
  }

  /** Writes the resolved campaign state into the bounded post-battle autosave history. */
  async savePostBattleAutosave(
    engagementId: string,
    request: CampaignStatePersistenceRequest
  ): Promise<CampaignSaveSlotIndexEntry> {
    if (!this.runtime) throw new CampaignSaveError("INVALID_ENVELOPE", "No campaign runtime is available for a post-battle autosave.");
    const report = this.runtime.engagementLedger[engagementId]?.afterActionReport;
    if (!report) throw new CampaignSaveError("INVALID_ENVELOPE", "The resolved engagement has no after-action report to checkpoint.");
    assertCampaignAfterActionReport(report);
    this.postBattleAutosaveStatus = {
      reportId: report.reportId,
      state: "saving",
      message: "Writing post-battle recovery checkpoint…"
    };
    this.notify("saveStatusChanged");
    try {
      const slot = await this.saveCampaignSlot({
        ...request,
        label: `Post-battle · ${report.title.replace(/^After action:\s*/i, "")}`,
        slotId: `${CAMPAIGN_POST_BATTLE_AUTOSAVE_SLOT_PREFIX}:${this.runtime.campaignId}`,
        slotType: "autosave",
        thumbnailKey: `campaign-aar:${report.scenarioKey}:${report.engagementId}`,
        uiResumeContext: {
          workspace: "theater",
          selectedEntityId: report.battleHexKey,
          mapCenter: null,
          mapZoom: request.uiResumeContext.mapZoom
        }
      });
      this.postBattleAutosaveStatus = {
        reportId: report.reportId,
        state: "saved",
        message: "Post-battle recovery checkpoint saved."
      };
      this.notify("saveStatusChanged");
      return slot;
    } catch (error) {
      this.postBattleAutosaveStatus = {
        reportId: report.reportId,
        state: "failed",
        message: error instanceof Error ? error.message : "The post-battle recovery checkpoint failed."
      };
      this.notify("saveStatusChanged");
      throw error;
    }
  }

  /** Returns the active frozen tactical package, if the precombat plan has been committed. */
  getActiveCampaignBattlePackage(): CampaignBattlePackage | null {
    if (!this.runtime?.activeEngagementId) return null;
    return getCampaignBattlePackage(this.runtime, this.runtime.activeEngagementId);
  }

  /**
   * Atomically validates the precombat revision, locks exact formations, and freezes the tactical package.
   * Repeating an identical request returns the original package without creating a new revision.
   */
  commitCampaignEngagement(
    request: CampaignEngagementCommitmentRequest
  ): { ok: true; package: CampaignBattlePackage; alreadyCommitted: boolean } | { ok: false; reason: string } {
    if (!this.runtime) return { ok: false, reason: "No campaign runtime is loaded." };
    const existing = this.runtime.engagementLedger[request.engagementId]?.package;
    if (existing) {
      try {
        const replay = commitCampaignEngagementPackage(structuredClone(this.runtime), request);
        return { ok: true, package: replay.package, alreadyCommitted: true };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    }

    let committed: CampaignBattlePackage | null = null;
    const result = this.transactCampaignEngagements(
      `engagement:commit:${request.engagementId}`,
      `Formation package committed for engagement ${request.engagementId}.`,
      (draft) => {
        committed = commitCampaignEngagementPackage(draft, request).package;
      },
      { engagementId: request.engagementId, expectedRevision: request.expectedRevision }
    );
    if (!result.ok) return result;
    if (!committed) return { ok: false, reason: "The engagement transaction completed without a battle package." };
    return { ok: true, package: structuredClone(committed), alreadyCommitted: false };
  }

  /** Builds battle-owned friendly units only from the active package's exact formation commitments. */
  buildCampaignFormationBattleUnits(engagementId: string, allocationKey: string, quantity: number): ScenarioUnit[] {
    if (!this.runtime || quantity <= 0) return [];
    const engagement = this.runtime.engagements[engagementId]?.engagement;
    if (!engagement?.context
      || (engagement.context.attacker !== "Player" && engagement.context.defender !== "Player")) return [];
    const pkg = getCampaignBattlePackage(this.runtime, engagementId);
    const playerRole = engagement.context.attacker === "Player" ? "attacker" : "defender";
    const formations = pkg
      ? pkg.formationCommitments
          .filter((entry) => entry.faction === "Player" && entry.role === playerRole && entry.allocationKey === allocationKey)
          .slice(0, quantity)
          .flatMap((entry) => {
            const formation = this.runtime?.formations[entry.formationId];
            return formation ? [formation] : [];
          })
      : playerRole === "attacker" ? selectCampaignFormationsForAllocation(
          this.runtime,
          attachCampaignFormationProvenanceToContext(engagement.context, this.runtime),
          allocationKey,
          quantity
        ) : [];
    if (pkg && formations.length !== quantity) return [];
    const defensiveEntrenchment = playerRole === "defender"
      ? Math.max(0, Math.round(({
          fortifiedAssault: 3,
          lineAssault: 2,
          portAssault: 1,
          airfieldRaid: 1,
          depotRaid: 1,
          meetingEngagement: 0
        } as const)[engagement.context.missionType]
          * Math.max(0, Math.min(1, engagement.context.infrastructureEffectiveness ?? 1))))
      : 0;
    return formations.flatMap((formation) => {
      const seed = createCampaignFormationBattleSeed(formation, {
        campaignId: this.runtime!.campaignId,
        engagementId,
        sourceRevision: pkg?.sourceRevision ?? this.runtime!.revision,
        sourceSegment: pkg?.committedSegment ?? this.runtime!.currentSegment,
        hex: { q: 0, r: 0 },
        entrench: defensiveEntrenchment
      });
      return seed ? [seed.unit] : [];
    });
  }

  private initializeCampaignIntelligence(): void {
    if (!this.scenario) {
      this.intelligenceByFaction = {};
      return;
    }
    this.intelligenceByFaction = {
      Player: createCampaignKnowledgeState(this.scenario, "Player", this.currentSegment),
      Bot: createCampaignKnowledgeState(this.scenario, "Bot", this.currentSegment)
    };
  }

  private ensureKnowledgeState(faction: CampaignFactionKey): CampaignKnowledgeState {
    const key = String(faction);
    let state = this.intelligenceByFaction[key];
    if (!state) {
      if (!this.scenario) throw new Error("Cannot initialize campaign intelligence without a scenario.");
      state = createCampaignKnowledgeState(this.scenario, faction, this.currentSegment);
      this.intelligenceByFaction[key] = state;
    }
    return state;
  }

  private refreshIntelCapacity(): void {
    if (!this.scenario) return;
    for (const [faction, state] of Object.entries(this.intelligenceByFaction)) {
      state.capacityTotal = calculateIntelCapacity(this.scenario, faction);
    }
  }

  setTurnState(state: CampaignTurnState | null): void {
    this.turnState = state ? structuredClone(state) : null;
    this.notify("turnAdvanced");
  }

  getTurnState(): CampaignTurnState | null {
    return this.turnState ? structuredClone(this.turnState) : null;
  }

  /** Returns configured hex/day speed for a given unit type. Defaults to 1 if unknown. */
  getUnitSpeed(unitType: string): number {
    return UNIT_SPEEDS_HEX_PER_DAY[unitType] ?? 1;
  }

  queueDecision(decision: CampaignDecision): void {
    this.decisions.push(structuredClone(decision));
    this.notify("decisionsUpdated");
  }

  getQueuedDecisions(): CampaignDecision[] {
    return this.decisions.map((d) => structuredClone(d));
  }

  clearQueuedDecisions(): void {
    this.decisions = [];
    this.notify("decisionsUpdated");
  }

  setPendingEngagements(list: CampaignPendingEngagement[]): void {
    this.engagements = list.map((e) => structuredClone(e));
    this.notify("engagementsUpdated");
  }

  getPendingEngagements(): CampaignPendingEngagement[] {
    return this.engagements.map((e) => structuredClone(e));
  }

  /** Marks a specific pending engagement as the one the commander is resolving next. */
  setActiveEngagementId(id: string | null): void {
    if (!this.runtime) {
      this.activeEngagementId = id;
      this.notify("engagementsUpdated");
      return;
    }
    const result = this.transactCampaignEngagements(
      id ? `engagement:plan:${id}` : "engagement:clear-plan",
      id ? `Engagement ${id} entered precombat planning.` : "The active precombat plan was cleared.",
      (draft) => {
        reconcileCampaignEngagementLedger(draft);
        if (id) {
          planCampaignEngagement(draft, id);
          return;
        }
        const priorId = draft.activeEngagementId;
        const priorLedger = priorId ? draft.engagementLedger[priorId] : null;
        const priorEngagement = priorId ? draft.engagements[priorId] : null;
        if (priorLedger?.package) throw new Error("Committed battle packages cannot be cleared from precombat.");
        if (priorLedger?.status === "planned") priorLedger.status = "opportunity";
        if (priorEngagement?.status === "planned") priorEngagement.status = "opportunity";
        draft.activeEngagementId = null;
        draft.status = "planning";
      },
      { engagementId: id }
    );
    if (!result.ok) throw new Error(result.reason);
  }

  /** Returns the id of the currently active engagement, if any. */
  getActiveEngagementId(): string | null {
    return this.activeEngagementId;
  }

  /** Returns the full record for the currently active engagement, if any. */
  getActiveEngagement(): CampaignPendingEngagement | null {
    const id = this.activeEngagementId;
    if (!id) return null;
    const found = this.engagements.find((e) => e.id === id) ?? null;
    return found ? structuredClone(found) : null;
  }

  setHeadquartersStatusMessage(message: HeadquartersStatusMessage | null): void {
    this.headquartersStatusMessage = message ? { ...message } : null;
    this.notify("headquartersStatusUpdated");
  }

  getHeadquartersStatusMessage(): HeadquartersStatusMessage | null {
    return this.headquartersStatusMessage ? { ...this.headquartersStatusMessage } : null;
  }

  /** Returns the current campaign segment (0 = Day 1, 00:00-03:00). */
  getCurrentSegment(): number {
    return this.currentSegment;
  }

  /** Returns the current day number (1-based). */
  getCurrentDay(): number {
    return Math.floor(this.currentSegment / 8) + 1;
  }

  /** Returns the segment within the current day (0-7). */
  getSegmentOfDay(): number {
    return this.currentSegment % 8;
  }

  /**
   * Returns a human-readable time string for the current segment.
   * Example: "Day 5, 09:00-12:00"
   */
  getCurrentTimeDisplay(): string {
    const day = this.getCurrentDay();
    const segmentOfDay = this.getSegmentOfDay();
    const hourStart = segmentOfDay * 3;
    const hourEnd = hourStart + 3;
    const formatHour = (h: number) => h.toString().padStart(2, '0');
    return `Day ${day}, ${formatHour(hourStart)}:00-${formatHour(hourEnd)}:00`;
  }

  /**
   * Converts a segment number to a display string.
   * Example: segmentToTimeDisplay(16) = "Day 3, 00:00-03:00"
   */
  segmentToTimeDisplay(segment: number): string {
    const day = Math.floor(segment / 8) + 1;
    const segmentOfDay = segment % 8;
    const hourStart = segmentOfDay * 3;
    const hourEnd = hourStart + 3;
    const formatHour = (h: number) => h.toString().padStart(2, '0');
    return `Day ${day}, ${formatHour(hourStart)}:00-${formatHour(hourEnd)}:00`;
  }

  /**
   * Advances the campaign by one 3-hour segment.
   * Daily resource generation occurs every 8 segments (once per day).
   * Redeployments and front updates are processed each segment.
   */
  advanceSegment(): CampaignAdvanceSegmentResult {
    const command = this.advanceCampaign({ mode: "segment" });
    if (!command.ok) {
      return {
        ok: false,
        state: command.state,
        error: command.error,
        issues: command.issues,
        frozenViews: []
      };
    }
    const segment = command.segmentResults[0];
    if (segment) return segment;
    return {
      ok: false,
      state: command.state,
      error: new CampaignRuntimeError("TRANSACTION_FAILED", "Campaign advance completed without resolving a segment."),
      issues: [],
      frozenViews: []
    };
  }

  /** Advances through a bounded sequence of ordinary three-hour transactions until the selected stop policy fires. */
  advanceCampaign(request: CampaignAdvanceRequest): CampaignAdvanceCommandResult {
    if (!this.runtime || !this.scenarioDefinition) {
      return {
        ok: false,
        state: null,
        error: new CampaignRuntimeError("TRANSACTION_FAILED", "No authoritative campaign runtime is loaded."),
        issues: [],
      };
    }
    const previousRevision = this.runtime.revision;
    const result = advanceCampaignRuntime(this.runtime, this.scenarioDefinition, request);
    if (result.state.revision === previousRevision) return result;
    this.runtime = result.state;
    this.hydrateCompatibilityProjection(result.state);
    this.notify("segmentResolved");
    return result;
  }

  /**
   * Legacy method for compatibility. Advances by 8 segments (1 full day).
   * @deprecated Use advanceSegment() instead for granular control.
   */
  advanceDay(): void {
    this.advanceCampaign({ mode: "day" });
  }

  /**
   * Processes daily resource generation based on controlled tiles.
   * Each controlled tile contributes to faction economy based on its supplyValue.
   */
  private processDailyResourceGeneration(): void {
    if (!this.scenario) return;

    // Player output honors the commander's industrial allocation; Bot keeps the legacy
    // fixed formula so enemy balance is unchanged by the allocation feature.
    let playerCapacity = 0;
    const botIncome = { supplies: 0, fuel: 0, manpower: 0 };

    for (const tile of this.scenario.tiles) {
      const palette = this.scenario.tilePalette[tile.tile];
      if (!palette) continue;

      const supplyValue = (palette.supplyValue ?? 0) * (tile.infrastructure?.effectiveness ?? 1);
      const faction = tile.factionControl ?? palette.factionControl;

      if (faction === "Player") {
        playerCapacity += supplyValue;
      } else if (faction === "Bot") {
        botIncome.supplies += supplyValue;
        botIncome.fuel += Math.round(supplyValue * 0.8);
        botIncome.manpower += Math.round(supplyValue * 100);
      }
    }

    // Apply income to economies
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const playerEconomy = economies.find((e) => e.faction === "Player");
    const botEconomy = economies.find((e) => e.faction === "Bot");

    if (playerEconomy) {
      const output = computeDailyProduction(playerCapacity, this.getProductionAllocation());
      playerEconomy.supplies = (playerEconomy.supplies ?? 0) + output.supplies;
      playerEconomy.fuel = (playerEconomy.fuel ?? 0) + output.fuel;
      playerEconomy.ammo = (playerEconomy.ammo ?? 0) + output.ammo;
      playerEconomy.manpower = (playerEconomy.manpower ?? 0) + output.manpower;
    }

    if (botEconomy) {
      botEconomy.supplies = (botEconomy.supplies ?? 0) + botIncome.supplies;
      botEconomy.fuel = (botEconomy.fuel ?? 0) + botIncome.fuel;
      botEconomy.manpower = (botEconomy.manpower ?? 0) + botIncome.manpower;
    }

    this.scenario.economies = economies;
    this.notify("scenarioLoaded"); // Trigger economy re-render
  }

  /** Returns the player's industrial allocation, falling back to the balanced default. */
  getProductionAllocation(): ProductionAllocation {
    const player = this.scenario?.economies.find((e) => e.faction === "Player");
    const alloc = player?.productionAllocation;
    if (!alloc) return { ...DEFAULT_PRODUCTION_ALLOCATION };
    return { ...alloc };
  }

  /**
   * Stores a new industrial allocation on the Player economy (so it persists through
   * both localStorage snapshots and JSON exports). Values are clamped to >= 0 and
   * normalized to sum to exactly 100.
   */
  setProductionAllocation(allocation: ProductionAllocation): { ok: boolean; reason?: string } {
    if (!this.scenario) return { ok: false, reason: "No scenario" };
    const player = this.scenario.economies.find((e) => e.faction === "Player");
    if (!player) return { ok: false, reason: "No player economy" };

    const clamped = {
      supplies: Math.max(0, Number(allocation.supplies) || 0),
      fuel: Math.max(0, Number(allocation.fuel) || 0),
      ammo: Math.max(0, Number(allocation.ammo) || 0),
      manpower: Math.max(0, Number(allocation.manpower) || 0)
    };
    const total = clamped.supplies + clamped.fuel + clamped.ammo + clamped.manpower;
    if (total <= 0) return { ok: false, reason: "Allocation must be greater than zero" };

    // Normalize to 100, assigning rounding drift to the largest bucket to keep the sum exact.
    const normalized: ProductionAllocation = {
      supplies: Math.round((clamped.supplies / total) * 100),
      fuel: Math.round((clamped.fuel / total) * 100),
      ammo: Math.round((clamped.ammo / total) * 100),
      manpower: Math.round((clamped.manpower / total) * 100)
    };
    const drift = 100 - (normalized.supplies + normalized.fuel + normalized.ammo + normalized.manpower);
    if (drift !== 0) {
      const keys: Array<keyof ProductionAllocation> = ["supplies", "fuel", "ammo", "manpower"];
      const largest = keys.reduce((best, k) => (normalized[k] > normalized[best] ? k : best), keys[0]);
      normalized[largest] += drift;
    }

    player.productionAllocation = normalized;
    this.notify("scenarioLoaded");
    return { ok: true };
  }

  /**
   * Snapshot of the player's war economy production: total capacity, where it comes
   * from, what today's allocation yields, and when the next production tick lands.
   */
  getProductionReport(): {
    capacity: number;
    allocation: ProductionAllocation;
    daily: ProductionAllocation;
    sources: Array<{ offsetKey: string; tile: string; role: string | null; supplyValue: number }>;
    segmentsUntilNextTick: number;
  } | null {
    if (!this.scenario) return null;

    const sources: Array<{ offsetKey: string; tile: string; role: string | null; supplyValue: number }> = [];
    let capacity = 0;
    for (const tile of this.scenario.tiles) {
      const palette = this.scenario.tilePalette[tile.tile];
      if (!palette) continue;
      const faction = tile.factionControl ?? palette.factionControl;
      if (faction !== "Player") continue;
      const supplyValue = (palette.supplyValue ?? 0) * (tile.infrastructure?.effectiveness ?? 1);
      if (supplyValue <= 0) continue;
      capacity += supplyValue;
      sources.push({
        offsetKey: this.axialToOffsetKey(tile.hex.q, tile.hex.r),
        tile: tile.tile,
        role: palette.role ?? null,
        supplyValue
      });
    }
    sources.sort((a, b) => b.supplyValue - a.supplyValue);

    const allocation = this.getProductionAllocation();
    const remainder = this.currentSegment % 8;
    return {
      capacity,
      allocation,
      daily: computeDailyProduction(capacity, allocation),
      sources,
      segmentsUntilNextTick: remainder === 0 ? 8 : 8 - remainder
    };
  }

  /**
   * Auto-calculates Air Power, Naval Power, and Intel Coverage based on strategic assets.
   * Air Power = (airbases × 10) + (aircraft count)
   * Naval Power = (naval bases × 10) + (ship count)
   * Intel Coverage = (controlled bases × 2)
   */
  private updatePowerValues(): void {
    if (!this.scenario) return;

    const playerStats = { airbases: 0, navalBases: 0, bases: 0, aircraft: 0, ships: 0 };
    const botStats = { airbases: 0, navalBases: 0, bases: 0, aircraft: 0, ships: 0 };

    // Count bases by faction
    for (const tile of this.scenario.tiles) {
      const palette = this.scenario.tilePalette[tile.tile];
      if (!palette) continue;

      const faction = tile.factionControl ?? palette.factionControl;
      const stats = faction === "Player" ? playerStats : faction === "Bot" ? botStats : null;
      if (!stats) continue;

      // Count bases
      const infrastructureFactor = tile.infrastructure?.effectiveness ?? 1;
      if (palette.role === "airbase") stats.airbases += infrastructureFactor;
      else if (palette.role === "navalBase") stats.navalBases += infrastructureFactor;

      if (palette.role === "airbase" || palette.role === "navalBase" || palette.role === "logisticsHub" || palette.role === "intelNode" ||
          palette.role === "fortificationHeavy" || palette.role === "fortificationLight") {
        stats.bases += infrastructureFactor;
      }

      // Count units
      if (tile.forces) {
        for (const force of tile.forces) {
          const unitType = force.unitType.toLowerCase();
          if (unitType.includes("fighter") || unitType.includes("bomber")) {
            stats.aircraft += force.count;
          } else if (unitType.includes("ship") || unitType.includes("battleship") || unitType.includes("destroyer")) {
            stats.ships += force.count;
          }
        }
      }
    }

    // Calculate power values
    const calculatePower = (stats: typeof playerStats) => ({
      airPower: Math.round((stats.airbases * 10) + stats.aircraft),
      navalPower: Math.round((stats.navalBases * 10) + stats.ships),
      intelCoverage: Math.round(stats.bases * 2)
    });

    const playerPower = calculatePower(playerStats);
    const botPower = calculatePower(botStats);

    // Update economies
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const playerEconomy = economies.find((e) => e.faction === "Player");
    const botEconomy = economies.find((e) => e.faction === "Bot");

    if (playerEconomy) {
      playerEconomy.airPower = playerPower.airPower;
      playerEconomy.navalPower = playerPower.navalPower;
      playerEconomy.intelCoverage = playerPower.intelCoverage;
    }

    if (botEconomy) {
      botEconomy.airPower = botPower.airPower;
      botEconomy.navalPower = botPower.navalPower;
      botEconomy.intelCoverage = botPower.intelCoverage;
    }

    this.scenario.economies = economies;
  }

  /** Moves all player forces from an origin hex to an adjacent destination hex. Returns true on success. */
  moveForces(originHexKey: string, destHexKey: string): boolean {
    if (!this.scenario) return false;
    const origin = this.findTileByOffsetKey(originHexKey);
    if (!origin) return false;
    const paletteOrigin = this.scenario.tilePalette[origin.tile];
    const owner = origin.factionControl ?? paletteOrigin?.factionControl;
    if (owner !== "Player") return false;

    const moving = Array.isArray(origin.forces) ? origin.forces : [];
    if (moving.length === 0) return false;

    // Ensure destination instance exists; if absent, create a neutral region and mark as Player-controlled on arrival
    let dest = this.findTileByOffsetKey(destHexKey);
    if (!dest) {
      const coords = this.parseOffsetKeyToAxial(destHexKey);
      if (!coords) return false;
      const newDest: CampaignTileInstance = { tile: "neutralRegion", factionControl: "Player", hex: coords, forces: [] } as CampaignTileInstance;
      this.scenario.tiles.push(newDest);
      dest = newDest;
    }

    // Merge force groups by unitType at destination
    const merge: Record<string, number> = {};
    (Array.isArray(dest.forces) ? dest.forces : []).forEach((g) => {
      merge[g.unitType] = (merge[g.unitType] ?? 0) + g.count;
    });
    moving.forEach((g) => {
      merge[g.unitType] = (merge[g.unitType] ?? 0) + g.count;
    });
    dest.forces = Object.entries(merge).map(([unitType, count]) => ({ unitType, count })) as CampaignTileInstance["forces"];

    // Set control to Player if not explicitly enemy-held
    const destOwner = dest.factionControl ?? this.scenario.tilePalette[dest.tile]?.factionControl;
    if (destOwner !== "Bot") {
      dest.factionControl = "Player";
      (dest as any).controlSinceSegment = this.currentSegment;
    }

    // Clear origin after move
    origin.forces = [];

    this.notify("scenarioLoaded");
    return true;
  }

  /**
   * Calculates realistic resource costs for a redeployment based on unit types and transport mode.
   * Returns fuel cost, supplies cost, manpower loss, and transport capacity needed.
   */
  /**
   * Non-mutating preview of a redeploy order. Returns the exact costs and validation
   * results scheduleRedeploy() would apply, so UI previews never drift from engine rules.
   */
  previewRedeploy(
    originOffsetKey: string,
    destOffsetKey: string,
    selections: Array<{ unitType: string; count: number }>,
    transportModeKey: string,
    excludeOrderId?: string,
    ignoreDraftHolds = false
  ): {
    ok: boolean;
    issues: string[];
    diagnostics: Array<{ code: CampaignOrderValidationCode; message: string; correctiveAction: string }>;
    distance: number;
    timeSegments: number;
    etaSegment: number;
    fuelCost: number;
    suppliesCost: number;
    manpowerLoss: number;
    capacityNeeded: number;
    capacityAvailable: number | null;
    fuelAvailable: number;
    suppliesAvailable: number;
  } | null {
    if (!this.scenario) return null;
    const transportMode = getTransportMode(transportModeKey);
    const a = this.parseOffsetKeyToAxial(originOffsetKey);
    const b = this.parseOffsetKeyToAxial(destOffsetKey);
    if (!transportMode || !a || !b) return null;

    const issues: string[] = [];
    const diagnostics: Array<{ code: CampaignOrderValidationCode; message: string; correctiveAction: string }> = [];
    const addIssue = (code: CampaignOrderValidationCode, message: string, correctiveAction: string): void => {
      issues.push(message);
      diagnostics.push({ code, message, correctiveAction });
    };
    const distance = Math.max(1, hexDistance(a, b));

    const origin = this.findTileByOffsetKey(originOffsetKey);
    const paletteOrigin = origin ? this.scenario.tilePalette[origin.tile] : null;
    const dest = this.findTileByOffsetKey(destOffsetKey);
    const paletteDest = dest ? this.scenario.tilePalette[dest.tile] : null;
    const runtimeOriginKey = campaignOffsetKeyToRuntimeHexKey(originOffsetKey);
    const runtimeDestinationKey = campaignOffsetKeyToRuntimeHexKey(destOffsetKey);
    const runtimeOrigin = runtimeOriginKey ? this.runtime?.tiles[runtimeOriginKey] : null;
    const runtimeDestination = runtimeDestinationKey ? this.runtime?.tiles[runtimeDestinationKey] : null;

    if (!origin || !runtimeOrigin || runtimeOrigin.controller !== "Player") {
      addIssue(
        "ORDER_SOURCE_INVALID",
        "The redeployment origin is not currently available under Player control.",
        "Choose a Player-controlled origin with ready formations."
      );
    }
    if (!dest || !runtimeDestination) {
      addIssue(
        "ORDER_TARGET_INVALID",
        "The redeployment destination is not part of the current operational map.",
        "Choose a visible map hex that belongs to the current theater."
      );
    } else if (runtimeDestination.controller !== "Neutral" && runtimeDestination.controller !== "Player") {
      addIssue(
        "ORDER_TARGET_INVALID",
        "Redeployment cannot enter a location under opposing control.",
        "Stage on friendly or neutral ground, then launch a tactical engagement from a Player-initiative front."
      );
    }

    const active = selections.filter((s) => s.count > 0);
    if (active.length === 0) {
      addIssue("ORDER_SELECTION_INVALID", "No units selected.", "Select at least one available unit quantity.");
    }
    for (const sel of active) {
      if (transportMode.applicableUnitTypes && transportMode.applicableUnitTypes.length > 0 && !transportMode.applicableUnitTypes.includes(sel.unitType)) {
        addIssue("ORDER_TRANSPORT_INVALID", `${sel.unitType} cannot use ${transportMode.label}.`, "Choose a compatible transport mode or leave that unit type at the origin.");
      }
    }
    if (transportMode.requiresNavalBase && paletteOrigin?.role !== "navalBase" && paletteDest?.role !== "navalBase") {
      addIssue("ORDER_TRANSPORT_INVALID", "Requires a naval base at origin or destination.", "Choose a route connected to a naval base or use another transport mode.");
    }
    if (transportMode.requiresAirbase && (paletteOrigin?.role !== "airbase" || paletteDest?.role !== "airbase")) {
      addIssue("ORDER_TRANSPORT_INVALID", "Requires airbases at both origin and destination.", "Choose two airbase hexes or use another transport mode.");
    }

    const heldByPool = (kind: "resource" | "transport" | "formation", poolKey: string): number => {
      if (!this.runtime || ignoreDraftHolds) return 0;
      return this.runtime.reservationOrder.reduce((sum, id) => {
        const reservation = this.runtime?.reservations[id];
        const ownerOrder = reservation ? this.runtime?.orders[reservation.orderId] : null;
        return reservation?.faction === "Player"
          && reservation.kind === kind
          && reservation.poolKey === poolKey
          && reservation.status === "held"
          && ownerOrder?.id !== excludeOrderId
          ? sum + reservation.amount
          : sum;
      }, 0);
    };
    active.forEach((selection) => {
      const total = origin?.forces?.filter((force) => force.unitType === selection.unitType)
        .reduce((sum, force) => sum + force.count, 0) ?? 0;
      const poolKey = runtimeOriginKey ? `${runtimeOriginKey}|${selection.unitType}` : "";
      const held = poolKey ? heldByPool("formation", poolKey) : 0;
      const available = Math.max(0, total - held);
      if (!Number.isInteger(selection.count) || selection.count > available) {
        addIssue(
          held > 0 && selection.count <= total ? "ORDER_RESERVATION_CONFLICT" : "ORDER_FORCE_UNAVAILABLE",
          `${selection.unitType.replace(/_/g, " ")} selection exceeds the ${available.toLocaleString()} uncommitted at the origin.`,
          "Reduce the quantity, remove or reprioritize an earlier movement draft, or choose another origin."
        );
      }
    });

    const costs = calculateCampaignRedeploymentCosts(active, distance, transportMode);
    const player = this.runtime?.factions.Player?.economy ?? this.scenario.economies.find((e) => e.faction === "Player");
    const grossFuel = player?.fuel ?? 0;
    const grossSupplies = player?.supplies ?? 0;
    const fuelAvailable = Math.max(0, grossFuel - heldByPool("resource", "fuel"));
    const suppliesAvailable = Math.max(0, grossSupplies - heldByPool("resource", "supplies"));
    if (fuelAvailable < costs.fuelCost) {
      addIssue(grossFuel >= costs.fuelCost ? "ORDER_RESERVATION_CONFLICT" : "ORDER_RESOURCE_INSUFFICIENT", `Insufficient fuel: ${costs.fuelCost.toLocaleString()} required, ${fuelAvailable.toLocaleString()} uncommitted.`, "Reduce the movement package, remove a competing draft, or wait for production.");
    }
    if (suppliesAvailable < costs.suppliesCost) {
      addIssue(grossSupplies >= costs.suppliesCost ? "ORDER_RESERVATION_CONFLICT" : "ORDER_RESOURCE_INSUFFICIENT", `Insufficient supply: ${costs.suppliesCost.toLocaleString()} required, ${suppliesAvailable.toLocaleString()} uncommitted.`, "Reduce the movement package, remove a competing draft, or wait for production.");
    }

    let capacityAvailable: number | null = null;
    if (transportMode.capacityType) {
      const cap = player?.transportCapacity;
      const available = cap ? (cap[transportMode.capacityType] ?? 0) : 0;
      const inTransit = cap ? ((cap[`${transportMode.capacityType}InTransit` as keyof typeof cap] as number) ?? 0) : 0;
      const grossCapacityAvailable = Math.max(0, available - inTransit);
      capacityAvailable = Math.max(0, grossCapacityAvailable - heldByPool("transport", transportMode.capacityType));
      if (costs.capacityNeeded > capacityAvailable) {
        addIssue(grossCapacityAvailable >= costs.capacityNeeded ? "ORDER_RESERVATION_CONFLICT" : "ORDER_CAPACITY_INSUFFICIENT", `Insufficient ${transportMode.capacityType}: ${costs.capacityNeeded} required, ${capacityAvailable} uncommitted.`, "Reduce the movement package, remove or reprioritize an earlier draft, or choose another mode.");
      }
    }

    const timeSegments = Math.max(1, Math.ceil(distance / transportMode.speedHexPerDay));
    return {
      ok: issues.length === 0,
      issues,
      diagnostics,
      distance,
      timeSegments,
      etaSegment: this.currentSegment + timeSegments,
      fuelCost: costs.fuelCost,
      suppliesCost: costs.suppliesCost,
      manpowerLoss: costs.manpowerLoss,
      capacityNeeded: costs.capacityNeeded,
      capacityAvailable,
      fuelAvailable,
      suppliesAvailable
    };
  }

  /**
   * Schedules a long-range redeployment using a specified transport mode.
   * Validates requirements (capacity, bases, resources) and reserves transport assets.
   */
  scheduleRedeploy(
    originOffsetKey: string,
    destOffsetKey: string,
    selections: Array<{ unitType: string; count: number }>,
    transportModeKey: string = "foot"
  ): { ok: boolean; reason?: string } {
    if (!this.scenario) return { ok: false, reason: "No scenario" };

    // Validate origin
    const origin = this.findTileByOffsetKey(originOffsetKey);
    if (!origin) return { ok: false, reason: "Invalid origin" };
    const paletteOrigin = this.scenario.tilePalette[origin.tile];
    const owner = origin.factionControl ?? paletteOrigin?.factionControl;
    if (owner !== "Player") return { ok: false, reason: "Origin not player-controlled" };

    // Validate destination
    const dest = this.findTileByOffsetKey(destOffsetKey);
    const paletteDest = dest ? this.scenario.tilePalette[dest.tile] : null;

    // Get transport mode
    const transportMode = getTransportMode(transportModeKey);
    if (!transportMode) return { ok: false, reason: "Invalid transport mode" };

    // Calculate distance
    const a = this.parseOffsetKeyToAxial(originOffsetKey);
    const b = this.parseOffsetKeyToAxial(destOffsetKey);
    if (!a || !b) return { ok: false, reason: "Invalid coordinates" };
    const distance = Math.max(1, hexDistance(a, b));

    // Validate unit selection
    const totalUnits = selections.reduce((sum, s) => sum + Math.max(0, s.count), 0);
    if (totalUnits <= 0) return { ok: false, reason: "No units selected" };

    // Validate unit types are compatible with transport mode
    for (const sel of selections) {
      if (sel.count <= 0) continue;
      if (transportMode.applicableUnitTypes && transportMode.applicableUnitTypes.length > 0) {
        if (!transportMode.applicableUnitTypes.includes(sel.unitType)) {
          return { ok: false, reason: `${sel.unitType} cannot use ${transportMode.label}` };
        }
      }
    }

    // Validate naval base requirements
    if (transportMode.requiresNavalBase) {
      const originRole = paletteOrigin?.role;
      const destRole = paletteDest?.role;
      if (originRole !== "navalBase" && destRole !== "navalBase") {
        return { ok: false, reason: "Naval transport requires origin or destination to be a naval base" };
      }
    }

    // Validate airbase requirements
    if (transportMode.requiresAirbase) {
      const originRole = paletteOrigin?.role;
      const destRole = paletteDest?.role;
      if (originRole !== "airbase" || destRole !== "airbase") {
        return { ok: false, reason: "Air transport requires both origin and destination to be airbases" };
      }
    }

    // Calculate realistic resource costs based on unit types and transport mode
    const costs = calculateCampaignRedeploymentCosts(selections, distance, transportMode);
    const fuelCost = costs.fuelCost;
    const suppliesCost = costs.suppliesCost;
    const manpowerLoss = costs.manpowerLoss;
    const capacityNeeded = costs.capacityNeeded;

    // Check and reserve resources
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const player = economies.find((e) => e.faction === "Player");
    if (!player) return { ok: false, reason: "No player economy" };

    // Validate fuel and supplies
    if ((player.fuel ?? 0) < fuelCost) {
      return { ok: false, reason: `Insufficient fuel (need ${fuelCost}, have ${player.fuel ?? 0})` };
    }
    if ((player.supplies ?? 0) < suppliesCost) {
      return { ok: false, reason: `Insufficient supplies (need ${suppliesCost}, have ${player.supplies ?? 0})` };
    }

    // Validate and reserve transport capacity
    if (capacityNeeded > 0 && transportMode.capacityType) {
      if (!player.transportCapacity) {
        return { ok: false, reason: "No transport capacity available" };
      }

      const availableKey = transportMode.capacityType;
      const available = player.transportCapacity[availableKey] ?? 0;
      const inTransit = player.transportCapacity[`${availableKey}InTransit` as keyof typeof player.transportCapacity] ?? 0;
      const totalAvailable = available - inTransit;

      if (totalAvailable < capacityNeeded) {
        return { ok: false, reason: `Insufficient ${availableKey} (need ${capacityNeeded}, available ${totalAvailable})` };
      }

      // Reserve capacity
      const inTransitKey = `${availableKey}InTransit` as keyof typeof player.transportCapacity;
      (player.transportCapacity[inTransitKey] as number) = inTransit + capacityNeeded;
    }

    // Deduct resources
    player.fuel = Math.max(0, (player.fuel ?? 0) - fuelCost);
    player.supplies = Math.max(0, (player.supplies ?? 0) - suppliesCost);
    player.manpower = Math.max(0, (player.manpower ?? 0) - manpowerLoss);

    this.scenario.economies = economies;

    // Calculate transit time based on transport mode speed (speedHexPerDay is actually hex per segment now)
    const timeSegments = Math.max(1, Math.ceil(distance / transportMode.speedHexPerDay));
    const etaSegment = this.currentSegment + timeSegments;

    // Calculate when transport returns to pool (round trip for trucks/ships, immediate for planes)
    let returnEtaSegment = etaSegment;
    if (transportMode.capacityType === "trucks" || transportMode.capacityType === "transportShips") {
      returnEtaSegment = etaSegment + timeSegments; // Round trip
    } else if (transportMode.capacityType === "transportPlanes") {
      returnEtaSegment = etaSegment; // Planes return immediately after drop
    }

    // Create redeployment decision
    const id = `dec_redeploy_${Date.now()}`;
    const decision: CampaignDecision = {
      id,
      faction: "Player",
      type: "redeploy",
      payload: {
        originOffsetKey,
        destOffsetKey,
        selections: selections.map((s) => ({ unitType: s.unitType, count: s.count })),
        transportMode: transportModeKey,
        distance,
        timeSegments,
        etaSegment,
        returnEtaSegment,
        fuelCost,
        suppliesCost,
        manpowerLoss,
        capacityReserved: capacityNeeded > 0 ? { type: transportMode.capacityType!, count: capacityNeeded } : undefined,
        status: "queued"
      },
      affectedHexKeys: [originOffsetKey, destOffsetKey]
    };

    this.queueDecision(decision);
    this.notify("scenarioLoaded");
    return { ok: true };
  }

  /** Executes due redeployments, releases transport capacity, and marks them completed. */
  private processScheduledRedeployments(): void {
    if (!this.scenario) return;
    const updated: CampaignDecision[] = [];
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const player = economies.find((e) => e.faction === "Player");

    for (const d of this.decisions) {
      if (d.type !== "redeploy") {
        updated.push(d);
        continue;
      }

      // Support both new segment system and legacy day system
      const eta = Number((d.payload as any)?.etaSegment ?? (d.payload as any)?.etaDay ?? NaN);
      const returnEta = Number((d.payload as any)?.returnEtaSegment ?? (d.payload as any)?.returnEtaDay ?? NaN);
      const status = String((d.payload as any)?.status ?? "queued");

      // Execute redeployment when forces arrive
      if (Number.isFinite(eta) && status === "queued" && eta <= this.currentSegment) {
        const originKey = String((d.payload as any)?.originOffsetKey ?? "");
        const destKey = String((d.payload as any)?.destOffsetKey ?? "");
        const selections = Array.isArray((d.payload as any)?.selections) ? ((d.payload as any).selections as Array<{ unitType: string; count: number }>) : [];
        this.executeRedeploy(originKey, destKey, selections);

        // Mark as arrived (transport may still be returning)
        const arrived = { ...d, payload: { ...(d.payload as any), status: "arrived", arrivedSegment: this.currentSegment } } as CampaignDecision;
        updated.push(arrived);
        continue;
      }

      // Release transport capacity when vehicles return
      if (Number.isFinite(returnEta) && status === "arrived" && returnEta <= this.currentSegment) {
        const capacityReserved = (d.payload as any)?.capacityReserved as { type: string; count: number } | undefined;
        if (capacityReserved && player && player.transportCapacity) {
          const inTransitKey = `${capacityReserved.type}InTransit` as keyof typeof player.transportCapacity;
          const current = (player.transportCapacity[inTransitKey] as number) ?? 0;
          (player.transportCapacity[inTransitKey] as number) = Math.max(0, current - capacityReserved.count);
        }

        // Mark as completed
        const completed = { ...d, payload: { ...(d.payload as any), status: "completed", completedSegment: this.currentSegment } } as CampaignDecision;
        updated.push(completed);
        continue;
      }

      // Keep pending decisions
      updated.push(d);
    }

    this.decisions = updated;
    if (player) {
      this.scenario.economies = economies;
    }
  }

  /** Moves a subset of forces along any distance and merges at destination; sets control day when captured. */
  private executeRedeploy(originHexKey: string, destHexKey: string, selections: Array<{ unitType: string; count: number }>): void {
    if (!this.scenario) return;
    const origin = this.findTileByOffsetKey(originHexKey);
    if (!origin) return;
    let dest = this.findTileByOffsetKey(destHexKey);
    if (!dest) {
      const coords = this.parseOffsetKeyToAxial(destHexKey);
      if (!coords) return;
      const newDest: any = { tile: "neutralRegion", factionControl: "Player", hex: coords, forces: [], controlSinceSegment: this.currentSegment };
      this.scenario.tiles.push(newDest);
      dest = newDest;
    }

    const available: Record<string, number> = {};
    (origin.forces ?? []).forEach((g) => (available[g.unitType] = (available[g.unitType] ?? 0) + g.count));
    const moving: Record<string, number> = {};
    selections.forEach((s) => {
      const cap = Math.max(0, Math.min(s.count, available[s.unitType] ?? 0));
      if (cap > 0) moving[s.unitType] = (moving[s.unitType] ?? 0) + cap;
    });

    const remain: Record<string, number> = { ...available };
    Object.entries(moving).forEach(([u, c]) => (remain[u] = Math.max(0, (remain[u] ?? 0) - c)));

    origin.forces = Object.entries(remain)
      .filter(([, c]) => c > 0)
      .map(([unitType, count]) => ({ unitType, count }));

    if (!dest) return; // Safety check (should never happen)

    const destMerge: Record<string, number> = {};
    (dest.forces ?? []).forEach((g) => (destMerge[g.unitType] = (destMerge[g.unitType] ?? 0) + g.count));
    Object.entries(moving).forEach(([u, c]) => (destMerge[u] = (destMerge[u] ?? 0) + c));
    dest.forces = Object.entries(destMerge).map(([unitType, count]) => ({ unitType, count }));

    const destOwner = dest.factionControl ?? this.scenario.tilePalette[dest.tile]?.factionControl;
    if (destOwner !== "Bot") {
      dest.factionControl = "Player";
      if (!(dest as any).controlSinceSegment) (dest as any).controlSinceSegment = this.currentSegment;
    }

    this.notify("scenarioLoaded");
  }

  /** Extends fronts by adding tiles held for 16+ segments (2 days) for both factions. */
  private updateFrontsForHeldTiles(): void {
    if (!this.scenario) return;
    const fronts = this.scenario.fronts.map((f) => ({ ...f, hexKeys: [...f.hexKeys] }));

    const ensureFront = (initiative: "Player" | "Bot") => {
      let f = fronts.find((x) => x.initiative === initiative);
      if (!f) {
        f = { key: initiative === "Player" ? "player-front" : "bot-front", label: initiative === "Player" ? "Player Front" : "Enemy Front", hexKeys: [], initiative };
        fronts.push(f);
      }
      return f;
    };

    const extendFor = (initiative: "Player" | "Bot") => {
      const front = ensureFront(initiative);
      const set = new Set<string>(front.hexKeys);
      for (const t of this.scenario!.tiles) {
        const palette = this.scenario!.tilePalette[t.tile];
        const owner = t.factionControl ?? palette?.factionControl;
        if (owner !== initiative) continue;
        const since = (t as any).controlSinceSegment ?? null;
        if (!since || this.currentSegment - since < 16) continue; // 16 segments = 2 days
        const key = this.axialToOffsetKey(t.hex.q, t.hex.r);
        if (set.has(key)) continue;
        const neighbors = this.neighborAxials(t.hex.q, t.hex.r).map((ax) => this.axialToOffsetKey(ax.q, ax.r));
        const neighborOnFront = neighbors.find((k) => front.hexKeys.includes(k));
        if (neighborOnFront) {
          const idx = front.hexKeys.indexOf(neighborOnFront);
          if (idx === front.hexKeys.length - 1) front.hexKeys.push(key);
          else front.hexKeys.splice(idx + 1, 0, key);
        } else {
          front.hexKeys.push(key);
        }
        set.add(key);
      }
    };

    extendFor("Player");
    extendFor("Bot");

    this.scenario.fronts = fronts;
    this.notify("scenarioLoaded");
  }

  private estimateTimeDaysForSelection(distance: number, selections: Array<{ unitType: string; count: number }>): number {
    const speeds: number[] = selections
      .filter((s) => (s.count ?? 0) > 0)
      .map((s) => Math.max(1, this.getUnitSpeed(s.unitType)));
    const slowest = speeds.length > 0 ? Math.min(...speeds) : 1;
    return Math.max(1, Math.ceil(distance / Math.max(1, slowest)));
  }

  /** Returns the controlling faction of the tile at the given offset hex key, or null when no tile exists. */
  getTileOwner(offsetHexKey: string): string | null {
    if (!this.scenario) return null;
    const inst = this.findTileByOffsetKey(offsetHexKey);
    if (!inst) return null;
    return inst.factionControl ?? this.scenario.tilePalette[inst.tile]?.factionControl ?? null;
  }

  /**
   * Returns the offset hex key of the first Bot-controlled tile adjacent to the given hex, or null.
   * Used to resolve the contested battle hex when the player queues a proximity engagement.
   */
  findAdjacentEnemyHexKey(offsetHexKey: string): string | null {
    if (!this.scenario) return null;
    const coords = this.parseOffsetKeyToAxial(offsetHexKey);
    if (!coords) return null;
    for (const ax of this.neighborAxials(coords.q, coords.r)) {
      const key = this.axialToOffsetKey(ax.q, ax.r);
      const inst = this.findTileByOffsetKey(key);
      if (!inst) continue;
      const owner = inst.factionControl ?? this.scenario.tilePalette[inst.tile]?.factionControl;
      if (owner === "Bot") return key;
    }
    return null;
  }

  /** Returns true if the given offset hex key is adjacent to any Bot-controlled tile. */
  isAdjacentToEnemy(offsetHexKey: string): boolean {
    if (!this.scenario) return false;
    const coords = this.parseOffsetKeyToAxial(offsetHexKey);
    if (!coords) return false;
    const neighbors = this.neighborAxials(coords.q, coords.r).map((ax) => this.axialToOffsetKey(ax.q, ax.r));
    return neighbors.some((k) => {
      const inst = this.findTileByOffsetKey(k);
      if (!inst) return false;
      const owner = inst.factionControl ?? this.scenario!.tilePalette[inst.tile]?.factionControl;
      return owner === "Bot";
    });
  }

  private findTileByOffsetKey(offsetKey: string): CampaignScenarioData["tiles"][number] | undefined {
    if (!this.scenario) return undefined;
    const coords = this.parseOffsetKeyToAxial(offsetKey);
    if (!coords) return undefined;
    return this.scenario.tiles.find((t) => t.hex.q === coords.q && t.hex.r === coords.r);
  }

  private parseOffsetKeyToAxial(offsetKey: string): { q: number; r: number } | null {
    const parts = offsetKey.split(",");
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    const q = col;
    const r = row - Math.floor(col / 2);
    return { q, r };
  }

  private axialToOffsetKey(q: number, r: number): string {
    const col = q;
    const row = r + Math.floor(q / 2);
    return `${col},${row}`;
  }

  private neighborAxials(q: number, r: number): Array<{ q: number; r: number }> {
    const dirs = [
      { q: +1, r: 0 },
      { q: +1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: +1 },
      { q: 0, r: +1 }
    ];
    return dirs.map((d) => ({ q: q + d.q, r: r + d.r }));
  }

  /** Applies one verified tactical fact package through atomic accounting, control, and infrastructure resolution. */
  applyCampaignBattleResult(
    resultPackage: CampaignBattleResultPackage
  ): { applied: boolean; duplicate: boolean; resolutionId: string } {
    if (!this.runtime || !this.scenarioDefinition) throw new Error("No campaign runtime is loaded.");
    const ledger = this.runtime.engagementLedger[resultPackage.engagementId];
    if (!ledger?.package) throw new Error("The tactical result has no frozen campaign commitment package.");
    const result = assertCampaignBattleResultPackage(resultPackage, ledger.package);
    if (ledger.appliedResolutionIds.includes(result.resolutionId)) {
      return { applied: false, duplicate: true, resolutionId: result.resolutionId };
    }

    const sourceRuntime = this.runtime;
    const transaction = runCampaignRuntimeTransaction(
      sourceRuntime,
      `engagement:resolution:${result.engagementId}:${result.resolutionId}`,
      (draft) => {
        const consequences = applyCampaignBattleConsequences(draft, result);
        const control = applyCampaignBattleControl(
          draft,
          this.scenarioDefinition!,
          result,
          consequences.report
        );
        const infrastructure = applyCampaignBattleInfrastructure(
          draft,
          this.scenarioDefinition!,
          result,
          consequences.report,
          control.report
        );
        const objectives = evaluateCampaignObjectives(draft, this.scenarioDefinition!);
        const report = buildCampaignAfterActionReport(
          sourceRuntime,
          draft,
          this.scenarioDefinition!,
          ledger.package!,
          result,
          consequences.report,
          control.report,
          infrastructure.report
        );
        draft.engagementLedger[result.engagementId].afterActionReport = report;
        return [
          ...consequences.events,
          ...control.events,
          ...infrastructure.events,
          ...objectives.events,
          {
            type: "stateChanged",
            category: "engagement",
            summary: `${report.title} filed.`,
            details: {
              engagementId: report.engagementId,
              reportId: report.reportId,
              result: report.strategicResult,
              decisionsRequired: report.decisionsRequired.length
            }
          }
        ];
      }
    );
    if (!transaction.ok) throw transaction.error;
    this.runtime = transaction.state;
    this.hydrateCompatibilityProjection(transaction.state);
    this.activeBattleSave = null;
    this.postBattleAutosaveStatus = null;
    this.notify("engagementLedgerUpdated");
    this.notify("scenarioLoaded");
    return { applied: true, duplicate: false, resolutionId: result.resolutionId };
  }

  /**
   * Applies aggregate compatibility consequences for legacy or unbound battles.
   * Typed tactical results always route through C20-023 and never run this coarse bridge.
   */
  applyBattleOutcome(outcome: {
    activeEngagementId?: string | null;
    frontKey?: string | null;
    result: "PlayerVictory" | "PlayerDefeat" | "Stalemate";
    casualties: number;
    spentAmmo: number;
    spentFuel: number;
    resolutionId?: string;
    resultPackage?: CampaignBattleResultPackage;
  }): { applied: boolean; duplicate: boolean; resolutionId: string } {
    if (outcome.resultPackage) return this.applyCampaignBattleResult(outcome.resultPackage);
    if (!this.scenario || !this.runtime) {
      return { applied: false, duplicate: false, resolutionId: outcome.resolutionId ?? "unavailable" };
    }

    const resolvedId = outcome.activeEngagementId ?? this.activeEngagementId;
    if (!resolvedId) throw new Error("A campaign engagement ID is required to record a battle outcome.");
    const resolvedEngagement = this.engagements.find((engagement) => engagement.id === resolvedId)
      ?? this.runtime.engagementLedger[resolvedId]?.package?.engagement
      ?? null;
    const battleHexKey = resolvedEngagement?.context?.battleHexKey ?? resolvedEngagement?.hexKeys[0] ?? null;
    const frontKey = outcome.frontKey ?? this.getActiveEngagement()?.frontKey ?? null;
    const normalizedSummary = {
      engagementId: resolvedId,
      frontKey,
      battleHexKey,
      result: outcome.result,
      casualties: Math.max(0, outcome.casualties),
      spentAmmo: Math.max(0, outcome.spentAmmo),
      spentFuel: Math.max(0, outcome.spentFuel)
    };
    const resolutionId = outcome.resolutionId ?? createStableCampaignRecordId(
      "battle-resolution",
      this.runtime.campaignId,
      resolvedId,
      normalizedSummary
    );
    const existingLedger = this.runtime.engagementLedger[resolvedId];
    if (existingLedger?.appliedResolutionIds.includes(resolutionId)) {
      return { applied: false, duplicate: true, resolutionId };
    }

    const scenarioForIntel = structuredClone(this.scenario);
    let duplicate = false;
    const transaction = this.transactCampaignEngagements(
      `engagement:resolve:${resolvedId}:${resolutionId}`,
      `Battle result ${resolutionId} accepted for engagement ${resolvedId}.`,
      (draft) => {
        const receipt = recordCampaignEngagementResolution(
          draft,
          resolvedId,
          resolutionId,
          normalizedSummary
        );
        duplicate = receipt.duplicate;
        if (duplicate) return;

        const player = draft.factions.Player?.economy;
        if (player) {
          player.supplies = Math.max(0, player.supplies - normalizedSummary.spentAmmo);
          player.fuel = Math.max(0, player.fuel - normalizedSummary.spentFuel);
          player.manpower = Math.max(0, player.manpower - normalizedSummary.casualties * 10);
        }
        if (frontKey) {
          const front = draft.compatibility.initialFronts.find((candidate) => candidate.key === frontKey);
          if (front) {
            if (outcome.result === "PlayerVictory") {
              if (front.hexKeys.length > 1) front.hexKeys.shift();
              front.initiative = "Player";
            } else if (outcome.result === "PlayerDefeat") {
              if (front.hexKeys.length > 1) front.hexKeys.pop();
              front.initiative = "Bot";
            }
          }
        }
        if (battleHexKey) {
          for (const faction of ["Player", "Bot"] as const) {
            const knowledge = draft.knowledgeByFaction[faction];
            if (knowledge) {
              draft.knowledgeByFaction[faction] = recordBattlefieldIntelligence(
                scenarioForIntel,
                knowledge,
                battleHexKey,
                draft.currentSegment
              );
            }
          }
        }
        draft.engagementOrder.splice(0, draft.engagementOrder.length,
          ...draft.engagementOrder.filter((engagementId) => engagementId !== resolvedId));
        delete draft.engagements[resolvedId];
        draft.activeEngagementId = null;
        draft.status = "planning";
      },
      { engagementId: resolvedId, resolutionId, result: outcome.result }
    );
    if (!transaction.ok) throw new Error(transaction.reason);
    this.activeBattleSave = null;
    this.postBattleAutosaveStatus = null;
    this.notify("scenarioLoaded");
    return { applied: !duplicate, duplicate, resolutionId };
  }

  reset(): void {
    this.scenario = null;
    this.scenarioDefinition = null;
    this.authoredScenarioSource = null;
    this.runtime = null;
    this.activeBattleSave = null;
    this.postBattleAutosaveStatus = null;
    this.compatibilityProjectionHash = null;
    this.turnState = null;
    this.decisions = [];
    this.engagements = [];
    this.activeEngagementId = null;
    this.currentSegment = 0;
    this.headquartersStatusMessage = null;
    this.intelligenceByFaction = {};
    this.notify("reset");
  }
}

let campaignStateInstance: CampaignState | null = null;
export function ensureCampaignState(): CampaignState {
  if (!campaignStateInstance) {
    campaignStateInstance = new CampaignState();
  }
  return campaignStateInstance;
}
