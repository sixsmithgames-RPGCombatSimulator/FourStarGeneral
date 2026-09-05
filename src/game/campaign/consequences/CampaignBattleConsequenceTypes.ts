/**
 * MODULE: CampaignBattleConsequenceTypes
 * WHAT: Defines the immutable campaign-side accounting produced when one tactical result is applied.
 * WHY: Formation, support, and economy consequences need a save-stable audit record that later control, AAR, and recovery systems can trust.
 */

import type { CampaignFactionKey } from "../../../core/campaignTypes";
import type {
  CampaignFormationExperience,
  CampaignFormationStatus,
  CampaignFormationSupply
} from "../formations/campaignFormationTypes";
import type {
  CampaignBattleResultOutcome,
  CampaignSupportTrackingMode
} from "../results/CampaignBattleResultTypes";
import type { CampaignFormationCommitmentRole } from "../engagements/CampaignEngagementLedgerTypes";

export const CAMPAIGN_BATTLE_CONSEQUENCE_VERSION = 2 as const;

/** One fleet assignment's spend/refund audit; firing twice never spends a second fleet's reservation. */
export interface CampaignNavalSourceRequisitionConsequence {
  readonly sourceId: string;
  readonly reservedRequisitionPoints: number;
  readonly consumedRequisitionPoints: number;
  readonly refundedRequisitionPoints: number;
}

/** Persistent condition and lifecycle accounting for one committed formation. */
export interface CampaignFormationBattleConsequence {
  readonly campaignFormationId: string;
  readonly faction: CampaignFactionKey;
  readonly role: CampaignFormationCommitmentRole;
  readonly sourceHexKey: string;
  readonly locationAfter: string | null;
  readonly statusBefore: CampaignFormationStatus;
  readonly statusAfter: CampaignFormationStatus;
  readonly personnelBefore: number;
  readonly personnelAfter: number;
  readonly personnelLost: number;
  readonly equipmentLost: Readonly<Record<string, number>>;
  readonly readinessBefore: number;
  readonly readinessAfter: number;
  readonly cohesionBefore: number;
  readonly cohesionAfter: number;
  readonly fatigueBefore: number;
  readonly fatigueAfter: number;
  readonly experienceBefore: CampaignFormationExperience;
  readonly experienceAfter: CampaignFormationExperience;
  readonly supplyBefore: CampaignFormationSupply;
  readonly supplyAfter: CampaignFormationSupply;
  /** C20-024 owns retreat, occupation, isolation, and final non-terminal placement. */
  readonly placementResolution: "terminallyRemoved" | "heldAtSourcePendingControl";
}

/** Final spend/refund decision for one non-formation tactical commitment. */
export interface CampaignSupportBattleConsequence {
  /** Exact source accounting for version-2 naval consequences with source-bearing tactical receipts. */
  readonly navalSourceRequisition?: readonly CampaignNavalSourceRequisitionConsequence[];
  readonly allocationKey: string;
  readonly category: string;
  readonly trackingMode: CampaignSupportTrackingMode;
  readonly committedQuantity: number;
  readonly survivingElements: number;
  readonly lostElements: number;
  readonly chargesUsed: number;
  readonly reservedRequisitionPoints: number;
  readonly consumedRequisitionPoints: number;
  readonly refundedRequisitionPoints: number;
  readonly resourcePayloadCommitted: CampaignFormationSupply;
  readonly resourcePayloadConsumed: CampaignFormationSupply;
}

/** Campaign economy values relevant to battle accounting. */
export interface CampaignBattleEconomySnapshot {
  readonly manpower: number;
  readonly supplies: number;
  readonly fuel: number;
  readonly ammo: number;
  readonly airPower: number;
  readonly navalPower: number;
}

/** Requested/charged/shortfall values use the same campaign economy units as the snapshot. */
export interface CampaignBattleEconomyCharge {
  readonly supplies: number;
  readonly fuel: number;
  readonly ammo: number;
  readonly airPower: number;
  readonly navalPower: number;
}

/** Exact faction-level stock reconciliation, including any explicitly visible emergency shortfall. */
export interface CampaignFactionBattleEconomyConsequence {
  readonly faction: CampaignFactionKey;
  readonly before: CampaignBattleEconomySnapshot;
  readonly tacticalConsumption: CampaignFormationSupply;
  readonly supportRequisitionPointsReserved: number;
  readonly supportRequisitionPointsConsumed: number;
  readonly supportRequisitionPointsRefunded: number;
  readonly tacticalBattleRequisitionPointsSpent: number;
  readonly airSortiesReserved: number;
  readonly airSortiesConsumed: number;
  readonly airSortiesReleased: number;
  readonly requestedCharge: CampaignBattleEconomyCharge;
  readonly charged: CampaignBattleEconomyCharge;
  readonly shortfall: CampaignBattleEconomyCharge;
  readonly after: CampaignBattleEconomySnapshot;
}

/** Explicit handoff counts for rules deliberately owned by the following Milestone 2 services. */
export interface CampaignDeferredBattleConsequences {
  readonly controlResolutionPending: boolean;
  readonly infrastructureDamageCount: number;
  readonly objectiveResultCount: number;
  readonly evidenceReportCount: number;
  readonly honorRecommendationCount: number;
}

/** Immutable, integrity-bound audit of one atomic C20-023 consequence transaction. */
export interface CampaignBattleConsequenceReport {
  readonly consequenceVersion: 1 | typeof CAMPAIGN_BATTLE_CONSEQUENCE_VERSION;
  readonly campaignId: string;
  readonly scenarioKey: string;
  readonly engagementId: string;
  readonly resolutionId: string;
  readonly battleResultIntegrityHash: string;
  readonly sourceRevision: number;
  readonly appliedRevision: number;
  readonly appliedSegment: number;
  readonly result: CampaignBattleResultOutcome;
  readonly formationConsequences: readonly CampaignFormationBattleConsequence[];
  readonly supportConsequences: readonly CampaignSupportBattleConsequence[];
  readonly economyConsequences: Readonly<Record<string, CampaignFactionBattleEconomyConsequence>>;
  readonly deferred: CampaignDeferredBattleConsequences;
  readonly integrityHash: string;
}
