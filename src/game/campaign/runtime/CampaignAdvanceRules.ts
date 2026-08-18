/**
 * MODULE: CampaignAdvanceRules
 * WHAT: Classifies one resolved campaign segment into Player-safe alerts and a deterministic automation stop.
 * WHY: Multi-segment time controls need one rules-owned distinction between bookkeeping, reports, critical changes, and mandatory decisions.
 *
 * DEPENDENCIES: CampaignCanonical creates stable IDs; runtime contracts provide authoritative before/after snapshots.
 * EXPORTS: CampaignAdvanceContext and appendCampaignAdvanceStepRecord.
 */

import { createStableCampaignRecordId } from "./CampaignCanonical";
import type {
  CampaignAdvanceAlert,
  CampaignAdvanceMode,
  CampaignAdvanceStepRecord,
  CampaignAdvanceStopReason,
  CampaignDomainEventDraft,
  CampaignRuntimeState
} from "./campaignRuntimeTypes";

/** Immutable command facts supplied to each ordinary segment transaction. */
export interface CampaignAdvanceContext {
  readonly commandId: string;
  readonly mode: CampaignAdvanceMode;
  readonly targetSegment: number | null;
  readonly safetySegment: number;
  readonly pauseAfterEveryResolution: boolean;
  readonly stopOnCriticalAlerts: boolean;
}

type AlertDraft = Omit<CampaignAdvanceAlert, "id" | "segment">;

const severityRank: Readonly<Record<CampaignAdvanceAlert["severity"], number>> = {
  routine: 0,
  notable: 1,
  critical: 2,
  decisionRequired: 3
};

function playerOrderLabel(kind: CampaignRuntimeState["orders"][string]["kind"]): string {
  if (kind === "redeploy") return "Redeployment";
  if (kind === "production") return "Production order";
  if (kind === "infrastructureRepair") return "Reconstruction order";
  if (kind === "counterIntelligence") return "Counterintelligence operation";
  return "Reconnaissance operation";
}

function classifyPlayerOrderChanges(source: CampaignRuntimeState, candidate: CampaignRuntimeState): AlertDraft[] {
  const alerts: AlertDraft[] = [];
  candidate.orderOrder.forEach((id) => {
    const order = candidate.orders[id];
    const prior = source.orders[id];
    if (!order || order.faction !== "Player" || !prior || order.status === prior.status) return;
    const label = playerOrderLabel(order.kind);
    if (order.status === "blocked") {
      alerts.push({
        severity: "decisionRequired",
        category: "orders",
        title: `${label} blocked`,
        detail: "The order cannot continue as issued. Review its validation and issue replacement intent.",
        targetKind: "order",
        targetId: id,
        requiresStop: true
      });
      return;
    }
    if (order.kind === "redeploy" && order.status === "executing") {
      alerts.push({
        severity: "notable",
        category: "movement",
        title: "Redeployment arrived",
        detail: "The selected formation reached its destination; transport recovery may still be in progress.",
        targetKind: "order",
        targetId: id,
        requiresStop: false
      });
      return;
    }
    if (order.status === "completed") {
      alerts.push({
        severity: "notable",
        category: order.kind === "production" || order.kind === "infrastructureRepair"
          ? "logistics" : order.kind === "redeploy" ? "movement" : "intelligence",
        title: `${label} complete`,
        detail: "The order completed and its result is available in the relevant command workspace.",
        targetKind: order.kind === "production" ? "campaign"
          : order.kind === "redeploy" || order.kind === "infrastructureRepair" ? "order" : "intelligence",
        targetId: id,
        requiresStop: false
      });
    }
  });
  return alerts;
}

function classifyPlayerIntelligence(source: CampaignRuntimeState, candidate: CampaignRuntimeState): AlertDraft[] {
  const priorIds = new Set((source.knowledgeByFaction.Player?.briefEvents ?? []).map((event) => event.id));
  return (candidate.knowledgeByFaction.Player?.briefEvents ?? [])
    .filter((event) => !priorIds.has(event.id))
    .map((event) => ({
      severity: "notable" as const,
      category: "intelligence" as const,
      title: event.title,
      detail: event.detail,
      targetKind: "intelligence" as const,
      targetId: event.contactId ?? event.operationId ?? event.id,
      requiresStop: false
    }));
}

function classifyPlayerMaterialEvents(
  candidate: CampaignRuntimeState,
  events: readonly CampaignDomainEventDraft[],
  existing: readonly AlertDraft[]
): AlertDraft[] {
  return events.flatMap((event): AlertDraft[] => {
    if (event.category !== "movement" || event.details.faction !== "Player") return [];
    const decisionId = typeof event.details.decisionId === "string" ? event.details.decisionId : null;
    const linkedOrder = candidate.orderOrder
      .map((id) => candidate.orders[id])
      .find((order) => order?.executionRefId === decisionId);
    if (linkedOrder && existing.some((alert) => alert.targetId === linkedOrder.id)) return [];
    if (event.summary.includes("blocked") || event.summary.includes("no start-of-segment force")) {
      return [{
        severity: "decisionRequired" as const,
        category: "orders" as const,
        title: "Redeployment blocked",
        detail: "The formation could not complete its ordered movement and requires revised command intent.",
        targetKind: "order" as const,
        targetId: linkedOrder?.id ?? decisionId,
        requiresStop: true
      }];
    }
    if (event.summary.startsWith("Transport returned")) {
      return [{
        severity: "routine" as const,
        category: "movement" as const,
        title: "Transport capacity restored",
        detail: "Transport assigned to a completed redeployment is available for new orders.",
        targetKind: "campaign" as const,
        targetId: candidate.campaignId,
        requiresStop: false
      }];
    }
    if (!event.summary.includes("arrived")) return [];
    return [{
      severity: "notable" as const,
      category: "movement" as const,
      title: "Redeployment arrived",
      detail: "A Player formation reached its ordered destination.",
      targetKind: "order" as const,
      targetId: linkedOrder?.id ?? decisionId,
      requiresStop: false
    }];
  });
}

function classifyMandatoryChanges(
  source: CampaignRuntimeState,
  candidate: CampaignRuntimeState,
  events: readonly CampaignDomainEventDraft[]
): AlertDraft[] {
  const alerts: AlertDraft[] = [];
  if ((candidate.status === "victory" || candidate.status === "defeat") && candidate.status !== source.status) {
    alerts.push({
      severity: "decisionRequired",
      category: "objectives",
      title: candidate.status === "victory" ? "Campaign victory" : "Campaign defeat",
      detail: "The campaign has reached a terminal result and cannot advance further.",
      targetKind: "campaign",
      targetId: candidate.campaignId,
      requiresStop: true
    });
  }

  if (candidate.activeEngagementId && candidate.activeEngagementId !== source.activeEngagementId) {
    alerts.push({
      severity: "decisionRequired",
      category: "engagement",
      title: "Tactical engagement requires command",
      detail: "Campaign automation paused at a stable tactical commitment boundary so the engagement can be reviewed and deployed.",
      targetKind: "engagement",
      targetId: candidate.activeEngagementId,
      requiresStop: true
    });
  }

  candidate.objectiveOrder.forEach((key) => {
    const prior = source.objectives[key];
    const objective = candidate.objectives[key];
    if (!prior || !objective || prior.status === objective.status) return;
    alerts.push({
      severity: "critical",
      category: "objectives",
      title: "Primary objective changed",
      detail: `Objective ${key} is now ${objective.status}. Review the campaign situation before continuing.`,
      targetKind: "objective",
      targetId: key,
      requiresStop: true
    });
  });

  events.forEach((event) => {
    if (event.details.formationAtRisk === true) {
      const targetId = typeof event.details.formationId === "string" ? event.details.formationId : null;
      alerts.push({
        severity: "decisionRequired",
        category: event.category,
        title: "Formation at risk",
        detail: "A formation may be destroyed by isolation or retreat conditions and requires command attention.",
        targetKind: "formation",
        targetId,
        requiresStop: true
      });
    } else if (event.details.requiresDecision === true) {
      alerts.push({
        severity: "decisionRequired",
        category: event.category,
        title: "Command decision required",
        detail: event.summary,
        targetKind: "campaign",
        targetId: candidate.campaignId,
        requiresStop: true
      });
    }
  });
  return alerts;
}

function determineStopReason(
  source: CampaignRuntimeState,
  candidate: CampaignRuntimeState,
  context: CampaignAdvanceContext,
  alerts: readonly CampaignAdvanceAlert[]
): CampaignAdvanceStopReason | null {
  if ((candidate.status === "victory" || candidate.status === "defeat") && candidate.status !== source.status) return "campaignEnded";
  if (candidate.activeEngagementId && candidate.activeEngagementId !== source.activeEngagementId) return "engagement";
  if (alerts.some((alert) => alert.requiresStop && alert.targetKind === "order")) return "blockedOrder";
  if (alerts.some((alert) => alert.requiresStop && alert.targetKind === "objective")) return "objectiveChanged";
  if (alerts.some((alert) => alert.requiresStop && alert.targetKind === "formation")) return "formationAtRisk";
  if (alerts.some((alert) => alert.requiresStop)) return "engagement";
  if (context.pauseAfterEveryResolution && context.mode !== "segment") return "pauseAfterResolution";
  if (context.mode === "nextReport" && alerts.some((alert) => severityRank[alert.severity] >= severityRank.notable)) return "nextReport";
  if (context.stopOnCriticalAlerts && alerts.some((alert) => alert.severity === "critical")) return "criticalAlert";
  if (context.targetSegment !== null && candidate.currentSegment >= context.targetSegment) {
    if (context.mode === "dawn") return "dawn";
    if (context.mode === "dusk") return "dusk";
    if (context.mode === "day") return "dayComplete";
    return "segmentComplete";
  }
  if (context.mode === "segment") return "segmentComplete";
  if (candidate.currentSegment >= context.safetySegment) return "safetyLimit";
  return null;
}

/**
 * Appends the Player-safe step checkpoint inside the segment transaction that produced it.
 * The transaction ID is deterministic and therefore known before the transaction boundary finalizes its event IDs.
 */
export function appendCampaignAdvanceStepRecord(
  source: CampaignRuntimeState,
  candidate: CampaignRuntimeState,
  events: readonly CampaignDomainEventDraft[],
  context: CampaignAdvanceContext,
  transactionLabel: string
): CampaignAdvanceStepRecord {
  const targetSegment = candidate.currentSegment;
  const revision = source.revision + 1;
  const transactionId = createStableCampaignRecordId("transaction", source.campaignId, revision, transactionLabel);
  const drafts: AlertDraft[] = [
    ...classifyMandatoryChanges(source, candidate, events),
    ...classifyPlayerOrderChanges(source, candidate),
    ...classifyPlayerIntelligence(source, candidate)
  ];
  drafts.push(...classifyPlayerMaterialEvents(candidate, events, drafts));
  if (events.some((event) => event.category === "control") && !drafts.some((alert) => alert.category === "control")) {
    drafts.push({
      severity: "notable",
      category: "control",
      title: "Front-line situation changed",
      detail: "Sustained territorial control changed the reported campaign front.",
      targetKind: "campaign",
      targetId: candidate.campaignId,
      requiresStop: false
    });
  }
  if (events.some((event) => event.category === "logistics" && event.details.faction === "Player")) {
    drafts.push({
      severity: "routine",
      category: "logistics",
      title: "Daily production delivered",
      detail: "Controlled infrastructure added output using the current production allocation.",
      targetKind: "campaign",
      targetId: candidate.campaignId,
      requiresStop: false
    });
  }
  if (drafts.length === 0) {
    drafts.push({
      severity: "routine",
      category: "system",
      title: "Segment resolved",
      detail: "No report required command attention during this three-hour period.",
      targetKind: "time",
      targetId: null,
      requiresStop: false
    });
  }

  const alerts: CampaignAdvanceAlert[] = drafts.map((draft, index) => ({
    ...draft,
    id: createStableCampaignRecordId("advance-alert", context.commandId, targetSegment, index, draft.title),
    segment: targetSegment
  }));
  const stopReason = determineStopReason(source, candidate, context, alerts);
  const record: CampaignAdvanceStepRecord = {
    id: createStableCampaignRecordId("advance-step", context.commandId, targetSegment),
    commandId: context.commandId,
    transactionId,
    mode: context.mode,
    fromSegment: source.currentSegment,
    toSegment: targetSegment,
    targetSegment: context.targetSegment,
    revision,
    eventCount: events.length,
    alerts,
    stopped: stopReason !== null,
    stopReason
  };
  candidate.advanceRecordOrder.push(record.id);
  candidate.advanceRecords[record.id] = record;
  return record;
}
