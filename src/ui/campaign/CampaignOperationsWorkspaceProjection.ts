/**
 * Pure player-safe projection for the command-shell Operations workspace.
 * CampaignScreen supplies authorized snapshots and formatting callbacks; this module owns no state or interaction.
 */
import { CAMPAIGN_SEGMENT_HOURS } from "../../core/campaignTypes";
import type {
  CampaignOrder,
  CampaignOrderCancellationPreview,
  CampaignOrderCommitPreview,
  CampaignReservation
} from "../../game/campaign/orders/CampaignOrderTypes";
import type {
  CampaignCommandOrderCommitView,
  CampaignCommandOrderView
} from "./CampaignCommandShell";
import { explainCampaignOrderValidationIssue } from "./CampaignOrderExperience";

type Immutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly Immutable<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: Immutable<T[Key]> }
      : T;

interface CampaignOperationsIntelRuleSource {
  readonly label: string;
  readonly targetRadius: number;
}

export interface CampaignOperationsOrderSource {
  readonly order: Immutable<CampaignOrder>;
  readonly reservations: readonly Immutable<CampaignReservation>[];
  readonly cancellation: Immutable<CampaignOrderCancellationPreview>;
  readonly formationName: string | null;
  readonly intelRule: CampaignOperationsIntelRuleSource | null;
  readonly intelAssetLabel: string | null;
  readonly redeployExecution: {
    readonly status: string;
    readonly arrivedSegment: number | null;
  } | null;
}

export interface CampaignOperationsPresentationContext {
  readonly formatSegment: (segment: number) => string;
  readonly formatLabel: (value: string) => string;
  readonly resolveLocationLabel: (hexKey: string) => string;
}

export interface CampaignOperationsWorkspaceProjectionInput extends CampaignOperationsPresentationContext {
  readonly orders: readonly CampaignOperationsOrderSource[];
  readonly commitPreview: Immutable<CampaignOrderCommitPreview>;
  readonly commitBusy: boolean;
  readonly commitFeedback: {
    readonly feedback: string | null;
    readonly feedbackTone: CampaignCommandOrderCommitView["feedbackTone"];
  };
}

export interface CampaignOperationsWorkspaceProjection {
  readonly orders: readonly CampaignCommandOrderView[];
  readonly orderCommit: CampaignCommandOrderCommitView;
}

interface CampaignOrderSpecificPresentation {
  readonly label: string;
  readonly detail: string;
  readonly etaSegment: number | null;
  readonly routeSummary: string;
  readonly costSummary: string;
  readonly riskSummary: string;
  readonly objectiveEffect: string;
  readonly transportReturn: {
    readonly timing: string;
    readonly next: string;
    readonly eta: string;
  } | null;
}

/** Canonical player-facing label for one reservation held by the order book. */
export function formatCampaignReservationLabel(reservation: Immutable<CampaignReservation>): string {
  const amount = reservation.amount.toLocaleString();
  if (reservation.kind === "resource") return `${amount} ${reservation.poolKey}`;
  if (reservation.kind === "transport") return `${amount} ${reservation.poolKey} transport`;
  if (reservation.kind === "intelligenceCapacity") return `${amount} intelligence capacity`;
  if (reservation.kind === "productionSlot") return "next support-allocation slot";
  if (reservation.kind === "formation") return `${amount} formation or force quantity`;
  return `${amount} assigned asset`;
}

function projectRedeployOrder(
  source: CampaignOperationsOrderSource,
  input: CampaignOperationsPresentationContext
): CampaignOrderSpecificPresentation {
  const order = source.order;
  if (order.kind !== "redeploy") throw new Error("Redeploy presentation requires a redeploy order.");
  const originLabel = input.resolveLocationLabel(order.payload.originOffsetKey);
  const destinationLabel = input.resolveLocationLabel(order.payload.destinationOffsetKey);
  const transportReturn = order.status === "executing" && source.redeployExecution?.status === "arrived"
    ? (() => {
      const transportLabel = order.payload.transportCapacityType === "trucks" ? "Trucks"
        : order.payload.transportCapacityType === "transportShips" ? "Transport ships"
          : order.payload.transportCapacityType === "transportPlanes" ? "Transport planes"
            : input.formatLabel(order.payload.transportModeKey);
      const returnTime = input.formatSegment(order.payload.returnEtaSegment);
      const arrivalTime = source.redeployExecution.arrivedSegment === null
        ? "Arrival recorded"
        : `Arrival ${input.formatSegment(source.redeployExecution.arrivedSegment)}`;
      return {
        transportLabel,
        returnTime,
        timing: `${arrivalTime} · Transport available ${returnTime}`,
        next: `${transportLabel} return ${returnTime}`,
        eta: `Transport available ${returnTime}`
      };
    })()
    : null;
  return {
    label: "Redeploy formation",
    detail: transportReturn
      ? `Formations arrived at ${destinationLabel}; ${transportReturn.transportLabel.toLowerCase()} return ${transportReturn.returnTime}.`
      : `${originLabel} → ${destinationLabel} · ${input.formatLabel(order.payload.transportModeKey)}`,
    etaSegment: transportReturn ? order.payload.returnEtaSegment : order.payload.etaSegment,
    routeSummary: `${originLabel} → ${destinationLabel} · ${order.payload.distance} hex`,
    costSummary: `${order.payload.fuelCost.toLocaleString()} fuel · ${order.payload.suppliesCost.toLocaleString()} supply${order.payload.manpowerCost > 0 ? ` · ${order.payload.manpowerCost.toLocaleString()} estimated personnel loss` : ""}`,
    riskSummary: transportReturn
      ? `${transportReturn.transportLabel} remain committed until their return (${order.payload.transportCapacityCost.toLocaleString()} capacity reserved).`
      : order.payload.manpowerCost > 0
        ? `${order.payload.manpowerCost.toLocaleString()} modeled transit attrition; destination conditions can change before arrival.`
        : "No modeled transit attrition; destination conditions can change before arrival.",
    objectiveEffect: "No direct score change; formation position affects later control, engagement, and objective checks.",
    transportReturn
  };
}

function projectProductionOrder(
  source: CampaignOperationsOrderSource
): CampaignOrderSpecificPresentation {
  const order = source.order;
  if (order.kind !== "production") throw new Error("Production presentation requires a production order.");
  const allocation = order.payload.allocation;
  return {
    label: "Set Allied support allocation",
    detail: `Supply ${allocation.supplies}% · Fuel ${allocation.fuel}% · Ammo ${allocation.ammo}% · Personnel ${allocation.manpower}%`,
    etaSegment: order.payload.effectiveSegment,
    routeSummary: "Allied theater-support pipeline",
    costSummary: "No stock spent; the next cross-Channel delivery is reprioritized.",
    riskSummary: "Output depends on controlled rear-area staging capacity when the next delivery resolves.",
    objectiveEffect: "Indirect only; delivered resources support later force, logistics, and objective conditions.",
    transportReturn: null
  };
}

function projectInfrastructureOrder(
  source: CampaignOperationsOrderSource,
  input: CampaignOperationsPresentationContext
): CampaignOrderSpecificPresentation {
  const order = source.order;
  if (order.kind !== "infrastructureRepair") throw new Error("Infrastructure presentation requires a repair order.");
  const locationLabel = input.resolveLocationLabel(order.payload.targetOffsetHexKey);
  return {
    label: `Repair ${order.payload.role.replace(/([A-Z])/g, " $1").trim()}`,
    detail: `${locationLabel} · ${order.payload.sourceIntegrity} → ${order.payload.targetIntegrity} integrity · ${order.payload.suppliesCost} supply · ${order.payload.manpowerCost} personnel`,
    etaSegment: order.payload.completeSegment,
    routeSummary: `${locationLabel} · Grid ${order.payload.targetOffsetHexKey}`,
    costSummary: `${order.payload.suppliesCost.toLocaleString()} supply · ${order.payload.manpowerCost.toLocaleString()} personnel`,
    riskSummary: "Supervising formation stays committed on site; control loss or interruption can block completion.",
    objectiveEffect: "Restored capacity can satisfy later infrastructure, supply, or control conditions; no score changes at commit.",
    transportReturn: null
  };
}

function projectRecoveryOrder(
  source: CampaignOperationsOrderSource,
  input: CampaignOperationsPresentationContext
): CampaignOrderSpecificPresentation {
  const order = source.order;
  if (order.kind !== "formationRecovery") throw new Error("Recovery presentation requires a formation-recovery order.");
  return {
    label: order.payload.resumedFromOrderId ? "Formation recovery continuation" : "Formation recovery",
    detail: `${source.formationName ?? "Assigned formation"} · ${order.payload.personnelToFit} surviving personnel · ${order.payload.equipmentToOperational} equipment · projected readiness ${Math.round(order.payload.projectedReadiness)}%`,
    etaSegment: order.payload.completeSegment,
    routeSummary: `${input.resolveLocationLabel(order.payload.sourceOffsetHexKey)} · Grid ${order.payload.sourceOffsetHexKey}`,
    costSummary: `${order.payload.suppliesCost} supply · ${order.payload.durationSegments * CAMPAIGN_SEGMENT_HOURS} hours`,
    riskSummary: `${order.payload.permanentPersonnelLosses} killed personnel and ${order.payload.permanentEquipmentLosses} destroyed equipment remain losses. Treatment requires the formation to stay supplied at its assigned location.`,
    objectiveEffect: `${order.payload.progress.completedSegments}/${order.payload.durationSegments} recovery segments complete; no replacement personnel, replacement equipment or direct score awarded.`,
    transportReturn: null
  };
}

function projectIntelligenceOrder(
  source: CampaignOperationsOrderSource,
  input: CampaignOperationsPresentationContext
): CampaignOrderSpecificPresentation {
  const order = source.order;
  if (order.kind !== "reconnaissance" && order.kind !== "counterIntelligence") {
    throw new Error("Intelligence presentation requires an intelligence order.");
  }
  if (!source.intelRule) throw new Error(`Missing presentation rule for ${order.payload.operationType}.`);
  const locationLabel = input.resolveLocationLabel(order.payload.targetHexKey);
  return {
    label: source.intelRule.label,
    detail: `${locationLabel}${source.intelAssetLabel ? ` · ${source.intelAssetLabel}` : ""}`,
    etaSegment: order.payload.resolveSegment,
    routeSummary: `${locationLabel} · Grid ${order.payload.targetHexKey} · radius ${source.intelRule.targetRadius} hex`,
    costSummary: `${order.payload.suppliesCost.toLocaleString()} supply · ${order.payload.fuelCost.toLocaleString()} fuel · ${order.payload.capacityCost} intelligence capacity`,
    riskSummary: "Result remains limited by source access, uncertainty, and operation outcome; no hidden enemy truth is guaranteed.",
    objectiveEffect: "Changes the operational picture or its protection; no direct score change at commit.",
    transportReturn: null
  };
}

function projectOrderSpecific(
  source: CampaignOperationsOrderSource,
  input: CampaignOperationsPresentationContext
): CampaignOrderSpecificPresentation {
  if (source.order.kind === "redeploy") return projectRedeployOrder(source, input);
  if (source.order.kind === "production") return projectProductionOrder(source);
  if (source.order.kind === "infrastructureRepair") return projectInfrastructureOrder(source, input);
  if (source.order.kind === "formationRecovery") return projectRecoveryOrder(source, input);
  return projectIntelligenceOrder(source, input);
}

function projectOrder(
  source: CampaignOperationsOrderSource,
  draftOrderIds: readonly string[],
  input: CampaignOperationsPresentationContext
): CampaignCommandOrderView {
  const order = source.order;
  const presentation = projectOrderSpecific(source, input);
  const draftIndex = draftOrderIds.indexOf(order.id);
  const timingSummary = `${input.formatSegment(order.earliestStartSegment)} start · ${presentation.transportReturn?.timing ?? (presentation.etaSegment === null ? "completion not scheduled" : `${order.kind === "production" ? "effective" : "ETA"} ${input.formatSegment(presentation.etaSegment)}`)}`;
  const nextTransition = order.status === "draft"
    ? order.validation.valid ? "Ready for atomic commit" : "Blocked until the listed rule is corrected"
    : order.status === "committed"
      ? order.kind === "production" ? `Becomes effective ${input.formatSegment(order.payload.effectiveSegment)}` : "Begins at the next campaign resolution boundary"
      : order.status === "executing"
        ? presentation.transportReturn?.next ?? `Resolves ${presentation.etaSegment === null ? "at a future report" : input.formatSegment(presentation.etaSegment)}`
        : order.status === "blocked" ? "Requires a command decision before progress can continue" : "Filed in command history";
  return {
    id: order.id,
    kind: order.kind,
    label: presentation.label,
    detail: presentation.detail,
    status: order.status === "draft" && !order.validation.valid ? "conflict" : order.status,
    eta: presentation.transportReturn?.eta ?? (presentation.etaSegment === null ? null : `${order.kind === "production" ? "Effective" : "ETA"} ${input.formatSegment(presentation.etaSegment)}`),
    validationMessages: order.validation.issues.map((entry) => entry.message),
    validationIssues: order.validation.issues.map((entry) => explainCampaignOrderValidationIssue(entry)),
    routeSummary: presentation.routeSummary,
    costSummary: presentation.costSummary,
    reservationSummaries: source.reservations.map((reservation) => `${formatCampaignReservationLabel(reservation)} · ${reservation.status}`),
    timingSummary,
    riskSummary: presentation.riskSummary,
    objectiveEffect: presentation.objectiveEffect,
    dependencySummary: order.dependencies.length > 0
      ? `${order.dependencies.length} linked order dependenc${order.dependencies.length === 1 ? "y" : "ies"}`
      : "No linked order dependency",
    nextTransition,
    cancellationSummary: order.status === "draft"
      ? "Remove before commit to release every hold."
      : source.cancellation.canCancel
        ? `${source.cancellation.sunkCostSummary} Review is required before cancellation.`
        : source.cancellation.reason ?? "Cancellation is no longer available.",
    canRemove: order.status === "draft",
    canEdit: order.status === "draft" && order.kind !== "infrastructureRepair" && order.kind !== "formationRecovery",
    canMoveEarlier: order.status === "draft" && draftIndex > 0,
    canMoveLater: order.status === "draft" && draftIndex >= 0 && draftIndex < draftOrderIds.length - 1,
    canCancel: source.cancellation.canCancel,
    mapHexKeys: [...order.targetHexKeys]
  };
}

/** Projects one order for the tray or consequence review from the same canonical rule set. */
export function projectCampaignOperationOrder(
  source: CampaignOperationsOrderSource,
  draftOrderIds: readonly string[],
  context: CampaignOperationsPresentationContext
): CampaignCommandOrderView {
  return projectOrder(source, [...draftOrderIds], context);
}

/** Builds the complete Operations tray and atomic-commit presentation from detached inputs. */
export function projectCampaignOperationsWorkspace(
  input: CampaignOperationsWorkspaceProjectionInput
): CampaignOperationsWorkspaceProjection {
  const draftOrderIds = input.orders
    .filter((source) => source.order.status === "draft")
    .map((source) => source.order.id);
  const firstBlocker = input.commitPreview.blockers[0];
  return {
    orders: input.orders.map((source) => projectCampaignOperationOrder(source, draftOrderIds, input)),
    orderCommit: {
      busy: input.commitBusy,
      draftCount: input.commitPreview.draftIds.length,
      validDraftCount: input.commitPreview.validDraftCount,
      blockerCount: input.commitPreview.blockers.length,
      firstBlocker: firstBlocker?.message ?? null,
      firstCorrectiveAction: firstBlocker ? explainCampaignOrderValidationIssue(firstBlocker).correctiveAction : null,
      feedback: input.commitFeedback.feedback,
      feedbackTone: input.commitFeedback.feedbackTone
    }
  };
}
