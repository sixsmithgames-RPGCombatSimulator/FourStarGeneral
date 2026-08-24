/**
 * MODULE: CampaignOrderTypes
 * WHAT: Defines authoritative Campaign 2.0 order, validation, and reservation records.
 * WHY: Drafting, AI planning, persistence, UI, and resolution need one discriminated contract instead of free-form payloads.
 *
 * DEPENDENCIES: Existing campaign and intelligence types provide faction, allocation, and operation identities.
 * EXPORTS: Typed order union, validation contracts, reservation ledger records, and draft inputs.
 */

import type { CampaignIntelOperationType } from "../../../core/campaignIntelTypes";
import type { CampaignFactionKey, ProductionAllocation } from "../../../core/campaignTypes";

/** Order kinds implemented by the first Milestone 1 typed-order slice. */
export type CampaignOrderKind =
  | "redeploy"
  | "production"
  | "reconnaissance"
  | "counterIntelligence"
  | "infrastructureRepair";

/** Complete persisted lifecycle shared by every campaign order. */
export type CampaignOrderStatus = "draft" | "committed" | "executing" | "blocked" | "completed" | "cancelled";

/** Stable validation codes consumed by UI, tests, AI, and future localization adapters. */
export type CampaignOrderValidationCode =
  | "ORDER_FACTION_INVALID"
  | "ORDER_SOURCE_INVALID"
  | "ORDER_TARGET_INVALID"
  | "ORDER_SELECTION_INVALID"
  | "ORDER_TRANSPORT_INVALID"
  | "ORDER_ALLOCATION_INVALID"
  | "ORDER_OPERATION_INVALID"
  | "ORDER_INFRASTRUCTURE_INVALID"
  | "ORDER_RESERVATION_CONFLICT"
  | "ORDER_RESOURCE_INSUFFICIENT"
  | "ORDER_CAPACITY_INSUFFICIENT"
  | "ORDER_ASSET_UNAVAILABLE"
  | "ORDER_FORCE_UNAVAILABLE";

/** One actionable validation diagnostic retained with a draft. */
export interface CampaignOrderValidationIssue {
  readonly code: CampaignOrderValidationCode;
  readonly message: string;
  readonly reservationId: string | null;
}

/** Last deterministic validation result for an order. */
export interface CampaignOrderValidationSnapshot {
  valid: boolean;
  issues: CampaignOrderValidationIssue[];
  validatedRevision: number;
}

/** Player-safe availability result returned by authoritative order preview services. */
export interface CampaignOrderActionPreview {
  readonly availability: "available" | "blocked" | "hidden";
  readonly reasonCode: CampaignOrderValidationCode | null;
  readonly reason: string | null;
  readonly correctiveAction: string | null;
  readonly mapHexKeys: readonly string[];
}

/** One draft blocker retained by the non-mutating atomic-commit preflight. */
export interface CampaignOrderCommitBlocker {
  readonly orderId: string;
  readonly code: CampaignOrderValidationCode;
  readonly message: string;
  readonly reservationId: string | null;
}

/** Authoritative non-mutating summary of the exact draft set a commit would attempt. */
export interface CampaignOrderCommitPreview {
  readonly canCommit: boolean;
  readonly draftIds: readonly string[];
  readonly validDraftCount: number;
  readonly blockers: readonly CampaignOrderCommitBlocker[];
}

/** Player-safe consequence preview for a committed-order cancellation attempt. */
export interface CampaignOrderCancellationPreview {
  readonly orderId: string;
  readonly canCancel: boolean;
  readonly reasonCode: CampaignOrderValidationCode | null;
  readonly reason: string | null;
  readonly correctiveAction: string | null;
  readonly releasedReservations: readonly CampaignReservation[];
  readonly sunkCostSummary: string;
  readonly delaySummary: string;
  readonly exposureSummary: string;
}

/** Resource/capacity categories that can be claimed by a draft. */
export type CampaignReservationKind =
  | "resource"
  | "transport"
  | "intelligenceCapacity"
  | "formation"
  | "asset"
  | "productionSlot";

/** Reservation lifecycle separates draft holds from committed consumption and cancellation release. */
export type CampaignReservationStatus = "proposed" | "held" | "consumed" | "released";

/** Authoritative claim against one shared campaign pool. */
export interface CampaignReservation {
  readonly id: string;
  readonly orderId: string;
  readonly faction: CampaignFactionKey;
  readonly kind: CampaignReservationKind;
  readonly poolKey: string;
  readonly amount: number;
  status: CampaignReservationStatus;
  readonly createdSegment: number;
}

/** Common order identity, lifecycle, targeting, dependency, and validation fields. */
export interface CampaignOrderBase {
  readonly id: string;
  readonly faction: CampaignFactionKey;
  readonly kind: CampaignOrderKind;
  status: CampaignOrderStatus;
  readonly issuedSegment: number;
  readonly earliestStartSegment: number;
  readonly targetHexKeys: string[];
  readonly formationIds: string[];
  readonly dependencies: string[];
  readonly reservationIds: string[];
  readonly acknowledgementKeys: string[];
  executionRefId: string | null;
  validation: CampaignOrderValidationSnapshot;
}

/** Exact unit quantity selected for a redeployment. */
export interface CampaignRedeploySelection {
  readonly unitType: string;
  readonly count: number;
}

/** Exact engine preview persisted with a redeployment draft. */
export interface CampaignRedeployOrderPayload {
  readonly originOffsetKey: string;
  readonly destinationOffsetKey: string;
  readonly originRuntimeHexKey: string;
  readonly destinationRuntimeHexKey: string;
  readonly selections: CampaignRedeploySelection[];
  readonly transportModeKey: string;
  readonly transportCapacityType: string | null;
  readonly distance: number;
  readonly timeSegments: number;
  readonly etaSegment: number;
  readonly returnEtaSegment: number;
  readonly fuelCost: number;
  readonly suppliesCost: number;
  readonly manpowerCost: number;
  readonly transportCapacityCost: number;
  /** Exact persistent formation identities when the planner/AI selected named forces. Legacy UI drafts may omit this. */
  readonly formationIds?: readonly string[];
}

/** Typed movement order. */
export interface CampaignRedeployOrder extends CampaignOrderBase {
  readonly kind: "redeploy";
  readonly payload: CampaignRedeployOrderPayload;
}

/** Typed theater-support allocation order. */
export interface CampaignProductionOrder extends CampaignOrderBase {
  readonly kind: "production";
  readonly payload: {
    readonly allocation: ProductionAllocation;
    readonly effectiveSegment: number;
  };
}

/** Shared complete payload for intelligence and counterintelligence orders. */
export interface CampaignIntelligenceOrderPayload {
  readonly operationType: CampaignIntelOperationType;
  readonly targetHexKey: string;
  readonly assignedAssetKey: string | null;
  readonly targetContactId: string | null;
  readonly durationSegments: number;
  readonly capacityCost: number;
  readonly suppliesCost: number;
  readonly fuelCost: number;
  readonly resolveSegment: number;
}

/** Typed intelligence collection order. */
export interface CampaignReconnaissanceOrder extends CampaignOrderBase {
  readonly kind: "reconnaissance";
  readonly payload: CampaignIntelligenceOrderPayload;
}

/** Typed counter-reconnaissance, OPSEC, or deception order. */
export interface CampaignCounterIntelligenceOrder extends CampaignOrderBase {
  readonly kind: "counterIntelligence";
  readonly payload: CampaignIntelligenceOrderPayload;
}

/** Complete repair plan frozen when headquarters creates the draft. */
export interface CampaignInfrastructureRepairOrderPayload {
  readonly targetOffsetHexKey: string;
  readonly targetRuntimeHexKey: string;
  readonly role: string;
  readonly engineerFormationId: string;
  readonly sourceIntegrity: number;
  readonly targetIntegrity: number;
  readonly repairPoints: number;
  readonly repairRate: number;
  readonly durationSegments: number;
  readonly startSegment: number;
  readonly completeSegment: number;
  readonly suppliesCost: number;
  readonly manpowerCost: number;
}

/** Typed, capacity-reserved facility reconstruction order. */
export interface CampaignInfrastructureRepairOrder extends CampaignOrderBase {
  readonly kind: "infrastructureRepair";
  readonly payload: CampaignInfrastructureRepairOrderPayload;
}

/** Authoritative discriminated order union. */
export type CampaignOrder =
  | CampaignRedeployOrder
  | CampaignProductionOrder
  | CampaignReconnaissanceOrder
  | CampaignCounterIntelligenceOrder
  | CampaignInfrastructureRepairOrder;

/** Redeployment draft input after exact rule preview. */
export interface CampaignRedeployDraftInput {
  readonly faction: CampaignFactionKey;
  readonly payload: CampaignRedeployOrderPayload;
}

/** Theater-support draft input after normalization. */
export interface CampaignProductionDraftInput {
  readonly faction: CampaignFactionKey;
  readonly allocation: ProductionAllocation;
  readonly effectiveSegment: number;
}

/** Intelligence draft input after target/asset rule preview. */
export interface CampaignIntelligenceDraftInput {
  readonly faction: CampaignFactionKey;
  readonly kind: "reconnaissance" | "counterIntelligence";
  readonly payload: CampaignIntelligenceOrderPayload;
}

/** Repair draft input after tile, engineer, time, and resource preview. */
export interface CampaignInfrastructureRepairDraftInput {
  readonly faction: CampaignFactionKey;
  readonly payload: CampaignInfrastructureRepairOrderPayload;
}
