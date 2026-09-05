/**
 * MODULE: CampaignEngagementLedgerTypes
 * WHAT: Defines the authoritative commitment ledger and frozen tactical battle package.
 * WHY: A campaign battle must consume one exact, revision-bound set of formations and accept its result at most once.
 */

import type {
  CampaignEngagementContext,
  CampaignFactionKey,
  CampaignPendingEngagement
} from "../../../core/campaignTypes";
import type { FormationReadinessModel, PersonnelStatusPool, VehicleStatusPool } from "../../../core/types";
import type {
  CampaignFormationExperience,
  CampaignFormationSupply
} from "../formations/campaignFormationTypes";
import type { CampaignBattleResultPackage } from "../results/CampaignBattleResultTypes";
import type { CampaignBattleConsequenceReport } from "../consequences/CampaignBattleConsequenceTypes";
import type { CampaignBattleControlReport } from "../control/CampaignBattleControlTypes";
import type { CampaignBattleInfrastructureReport } from "../infrastructure/CampaignBattleInfrastructureTypes";
import type { CampaignAfterActionReport } from "../aar/CampaignAfterActionReportTypes";
import type { CampaignNavalSourceCommitment } from "../logistics/CampaignNavalSupportService";

export const CAMPAIGN_ENGAGEMENT_LEDGER_VERSION = 1 as const;
export const CAMPAIGN_BATTLE_PACKAGE_VERSION = 3 as const;

export type CampaignEngagementLedgerStatus =
  | "opportunity"
  | "planned"
  | "committed"
  | "inBattle"
  | "resolved"
  | "cancelled"
  | "abandoned";

export type CampaignFormationCommitmentRole = "attacker" | "defender";

/** Complete immutable tactical baseline needed to calculate a result without rereading campaign truth. */
export interface CampaignFormationCommitmentBaseline {
  readonly personnel: Readonly<Record<string, PersonnelStatusPool>>;
  readonly equipment: Readonly<Record<string, VehicleStatusPool>>;
  readonly readinessModel: FormationReadinessModel | null;
  readonly readiness: number;
  readonly cohesion: number;
  readonly fatigue: number;
  readonly supply: CampaignFormationSupply;
  readonly experience: CampaignFormationExperience;
}

/** One exact pre-battle formation snapshot owned by the engagement, not by the tactical engine. */
export interface CampaignFormationCommitment {
  readonly formationId: string;
  readonly faction: CampaignFactionKey;
  readonly role: CampaignFormationCommitmentRole;
  readonly allocationKey: string;
  readonly sourceHexKey: string;
  readonly tacticalUnitId: string;
  readonly beforeStateHash: string;
  readonly before: CampaignFormationCommitmentBaseline;
}

/** Player allocation line frozen at the moment combat formations are committed. */
export interface CampaignBattleAllocationCommitment {
  readonly allocationKey: string;
  readonly category: string;
  readonly quantity: number;
  readonly unitRpCost: number;
  readonly totalRpCost: number;
}

/** Non-formation support or consumable reserved for the tactical package. */
export interface CampaignSupportCommitment {
  readonly allocationKey: string;
  readonly category: string;
  readonly quantity: number;
  readonly reservedRp: number;
  /** Exact sources; required for v3 naval commitments, absent from pre-authority v2 packages. */
  readonly navalSources?: readonly CampaignNavalSourceCommitment[];
}

/** Shared campaign pool claim. Consumption/refund is reconciled by the later consequence milestone. */
export interface CampaignEngagementResourceCommitment {
  readonly faction: CampaignFactionKey;
  readonly poolKey: "requisitionPoints" | "airSorties";
  readonly reservedAmount: number;
}

/** Immutable package used by tactical generation, saves, result extraction, and consequence application. */
export interface CampaignBattlePackage {
  readonly packageVersion: 2 | typeof CAMPAIGN_BATTLE_PACKAGE_VERSION;
  readonly packageId: string;
  readonly campaignId: string;
  readonly scenarioKey: string;
  readonly engagementId: string;
  readonly sourceRevision: number;
  readonly committedRevision: number;
  readonly committedSegment: number;
  readonly commitmentIdempotencyKey: string;
  readonly commitmentRequestHash: string;
  readonly engagementContextHash: string;
  readonly engagement: CampaignPendingEngagement;
  readonly context: CampaignEngagementContext;
  readonly allocations: readonly CampaignBattleAllocationCommitment[];
  readonly formationCommitments: readonly CampaignFormationCommitment[];
  readonly supportCommitments: readonly CampaignSupportCommitment[];
  readonly resourceCommitments: readonly CampaignEngagementResourceCommitment[];
  readonly integrityHash: string;
}

/** Append-only engagement authority retained after the live opportunity leaves the campaign queue. */
export interface CampaignEngagementLedgerRecord {
  readonly ledgerVersion: typeof CAMPAIGN_ENGAGEMENT_LEDGER_VERSION;
  readonly id: string;
  readonly engagementId: string;
  status: CampaignEngagementLedgerStatus;
  readonly createdSegment: number;
  plannedRevision: number | null;
  committedRevision: number | null;
  launchedRevision: number | null;
  terminalRevision: number | null;
  package: CampaignBattlePackage | null;
  /** Immutable tactical fact package retained for consequence verification and AAR construction. */
  resultPackage: CampaignBattleResultPackage | null;
  /** Immutable campaign-side accounting retained for control resolution, AAR, saves, and recovery. */
  consequenceReport: CampaignBattleConsequenceReport | null;
  /** Immutable operational placement and territorial audit retained beside the battle accounting. */
  controlReport: CampaignBattleControlReport | null;
  /** Immutable C20-025 facility damage, capture, and capacity audit. */
  infrastructureReport: CampaignBattleInfrastructureReport | null;
  /** Immutable C20-027 Player-safe briefing retained for campaign history and recovery. */
  afterActionReport: CampaignAfterActionReport | null;
  /** Legacy active engagements can be recovered without pretending they had a frozen package. */
  legacyUnfrozen: boolean;
  readonly appliedResolutionIds: string[];
  resolutionSummaryHash: string | null;
  /** Resolution clock for naval replenishment, independent of when the tactical package was committed. */
  navalSupportResolvedSegment?: number;
}

/** Normalized precombat allocation accepted by the commitment service. */
export interface CampaignEngagementCommitmentSelection {
  readonly allocationKey: string;
  readonly category: string;
  readonly quantity: number;
  readonly unitRpCost: number;
}

export interface CampaignEngagementCommitmentRequest {
  readonly engagementId: string;
  readonly expectedRevision: number;
  readonly selections: readonly CampaignEngagementCommitmentSelection[];
}

export interface CampaignEngagementCommitmentResult {
  readonly package: CampaignBattlePackage;
  readonly alreadyCommitted: boolean;
}

export interface CampaignResolutionReceiptResult {
  readonly resolutionId: string;
  readonly duplicate: boolean;
}
