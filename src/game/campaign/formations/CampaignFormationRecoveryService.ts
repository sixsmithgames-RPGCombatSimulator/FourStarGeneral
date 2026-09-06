/**
 * MODULE: CampaignFormationRecoveryService
 * WHAT: Quotes and applies campaign treatment/repair to existing formation pools.
 * WHY: Orders, time, and UI must share one deterministic recovery policy and preserve permanent losses.
 * DEPENDENCIES: Shared status transitions and the existing friendly supply graph; no State or order-service imports.
 */
import { CAMPAIGN_SEGMENT_HOURS, type CampaignFactionKey } from "../../../core/campaignTypes";
import type { FormationStatus } from "../../../core/types";
import {
  applyMedicalRecoveryToStatus, applyEquipmentRepairToStatus, calculateFormationReadiness
} from "../../../data/unitSystem/status";
import { REPAIR_CONFIGS } from "../../../data/unitSystem/repairSystem";
import { hasCampaignFriendlySupplyAccess } from "../logistics/CampaignSupplyAccess";
import { computeCampaignContentHash, createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import type { CampaignRuntimeState, CampaignScenarioDefinition } from "../runtime/campaignRuntimeTypes";
import type {
  CampaignFormationRecoveryOrder, CampaignFormationRecoveryPreview, CampaignFormationRecoveryQuote,
  CampaignOrderValidationCode
} from "../orders/CampaignOrderTypes";
import type { CampaignFormationRecord } from "./campaignFormationTypes";
import { isCampaignFormationPresentAtLocation } from "./FormationLifecycleService";

/** New campaign mapping: the existing tactical service budgets (12 medical / 8 repair) per 3-hour segment. */
export const CAMPAIGN_FORMATION_RECOVERY_POLICY = Object.freeze({
  version: 1 as const,
  medicalCapacity: 12,
  equipmentCapacity: 8,
  workshopMinimumSegments: Math.ceil(REPAIR_CONFIGS.workshopRepair.baseTimeHours / CAMPAIGN_SEGMENT_HOURS),
  medicalSupplyPerPoint: REPAIR_CONFIGS.fieldMedic.supplyCost,
  damagedEquipmentSupplies: REPAIR_CONFIGS.fieldRepair.supplyCost,
  disabledEquipmentSupplies: REPAIR_CONFIGS.workshopRepair.supplyCost + REPAIR_CONFIGS.fieldRepair.supplyCost
});

function statusView(formation: CampaignFormationRecord): FormationStatus {
  return { personnel: formation.personnel, equipment: formation.equipment,
    readinessModel: formation.readinessModel, ammo: {}, suppression: 0 };
}

/** Detects condition drift without retaining a second copy of campaign pools. Posture is checked separately. */
export function campaignFormationRecoveryFingerprint(formation: CampaignFormationRecord): string {
  return computeCampaignContentHash({
    id: formation.id, faction: formation.faction, location: formation.locationHexKey,
    personnel: formation.personnel, equipment: formation.equipment,
    readinessModel: formation.readinessModel, readiness: formation.readiness
  });
}

function recoveryWork(status: FormationStatus): { medical: number; equipment: number } {
  return {
    medical: Object.values(status.personnel).reduce((sum, pool) => sum + pool.injured + 3 * pool.wounded + 6 * pool.severelyWounded, 0),
    equipment: Object.values(status.equipment).reduce((sum, pool) => sum + 2 * pool.damaged + 5 * pool.disabled, 0)
  };
}

/** Shared arithmetic is used by quote validation as well as quote creation. */
export function campaignFormationRecoverySupplyCost(medicalWork: number, damaged: number, disabled: number): number {
  const policy = CAMPAIGN_FORMATION_RECOVERY_POLICY;
  return Math.ceil(policy.medicalSupplyPerPoint * medicalWork
    + policy.damagedEquipmentSupplies * damaged + policy.disabledEquipmentSupplies * disabled);
}

/** Computes exact completion by running the same indivisible transitions as each real segment. */
function interruptedRecovery(runtime: CampaignRuntimeState, formation: CampaignFormationRecord): CampaignFormationRecoveryOrder | null {
  const latest = [...runtime.orderOrder].reverse().map((id) => runtime.orders[id]).find((order) =>
    order?.kind === "formationRecovery" && order.payload.formationId === formation.id
    && order.status !== "draft" && order.status !== "cancelled");
  return latest?.kind === "formationRecovery" && latest.status === "blocked"
    && latest.faction === formation.faction
    && latest.payload.sourceRuntimeHexKey === formation.locationHexKey
    && latest.payload.progress.conditionHash === campaignFormationRecoveryFingerprint(formation)
    ? latest : null;
}

function quoteRecovery(formation: CampaignFormationRecord, segment: number, interrupted: CampaignFormationRecoveryOrder | null): CampaignFormationRecoveryQuote {
  const status = structuredClone(statusView(formation));
  const work = recoveryWork(status);
  const personnel = Object.values(status.personnel);
  const equipment = Object.values(status.equipment);
  const damaged = equipment.reduce((sum, pool) => sum + pool.damaged, 0);
  const disabled = equipment.reduce((sum, pool) => sum + pool.disabled, 0);
  let durationSegments = 0;
  let remaining = work;
  while (remaining.medical > 0 || remaining.equipment > 0) {
    applyMedicalRecoveryToStatus(status, CAMPAIGN_FORMATION_RECOVERY_POLICY.medicalCapacity);
    applyEquipmentRepairToStatus(status, CAMPAIGN_FORMATION_RECOVERY_POLICY.equipmentCapacity);
    const next = recoveryWork(status);
    if (next.medical + next.equipment >= remaining.medical + remaining.equipment) {
      throw new Error("Formation recovery cannot progress from these condition pools. Reload a valid campaign checkpoint.");
    }
    remaining = next;
    durationSegments += 1;
  }
  const minimumDurationSegments = interrupted
    ? Math.max(1, interrupted.payload.minimumDurationSegments - interrupted.payload.progress.completedSegments)
    : disabled > 0 ? CAMPAIGN_FORMATION_RECOVERY_POLICY.workshopMinimumSegments : 1;
  durationSegments = Math.max(durationSegments, minimumDurationSegments);
  const [q, r] = formation.locationHexKey!.split(",").map(Number);
  return {
    policyVersion: 1, formationId: formation.id, sourceRuntimeHexKey: formation.locationHexKey!,
    sourceOffsetHexKey: `${q},${r + Math.floor(q / 2)}`,
    sourceStatus: formation.status === "shattered" ? "shattered" : "ready",
    sourceFingerprint: campaignFormationRecoveryFingerprint(formation),
    resumedFromOrderId: interrupted?.id ?? null, minimumDurationSegments,
    medicalWorkPoints: work.medical, equipmentWorkPoints: work.equipment,
    damagedEquipment: damaged, disabledEquipment: disabled,
    personnelToFit: Object.values(formation.personnel).reduce((sum, pool) => sum + pool.injured + pool.wounded + pool.severelyWounded, 0),
    equipmentToOperational: damaged + disabled,
    permanentPersonnelLosses: personnel.reduce((sum, pool) => sum + pool.killed, 0),
    permanentEquipmentLosses: equipment.reduce((sum, pool) => sum + pool.destroyed, 0),
    suppliesCost: campaignFormationRecoverySupplyCost(work.medical, damaged, disabled),
    durationSegments, startSegment: segment + 1, completeSegment: segment + durationSegments,
    projectedReadiness: calculateFormationReadiness(status, formation.readiness).readiness
  };
}

/** Pure eligibility/quote; shared-pool arbitration is added by the order book, not duplicated here. */
export function previewCampaignFormationRecovery(
  runtime: CampaignRuntimeState, definition: CampaignScenarioDefinition | undefined,
  formationId: string, faction: CampaignFactionKey
): CampaignFormationRecoveryPreview {
  let quote: CampaignFormationRecoveryQuote | null = null;
  const blocked = (reasonCode: CampaignOrderValidationCode, reason: string, correctiveAction: string): CampaignFormationRecoveryPreview => ({
    formationId, revision: runtime.revision, quote, availability: "blocked", reasonCode, reason, correctiveAction,
    mapHexKeys: quote ? [quote.sourceOffsetHexKey] : []
  });
  const formation = runtime.formations[formationId];
  if (!runtime.factions[String(faction)] || !formation || formation.faction !== faction) {
    return blocked("ORDER_FORCE_UNAVAILABLE", "This formation is not available to your command.", "Select a current friendly formation.");
  }
  if ((formation.status !== "ready" && formation.status !== "shattered") || !isCampaignFormationPresentAtLocation(formation)) {
    return blocked("ORDER_FORCE_UNAVAILABLE", "Recovery requires a present formation that is ready or shattered.", "Resolve its current movement, isolation or commitment before arranging recovery. Captured and destroyed formations cannot recover.");
  }
  if (formation.currentOrderId !== null || Object.values(runtime.engagementLedger).some((entry) =>
    (entry.status === "committed" || entry.status === "inBattle")
    && entry.package?.formationCommitments.some((commitment) => commitment.formationId === formationId))) {
    return blocked("ORDER_FORCE_UNAVAILABLE", "This formation is already assigned to an order or battle.", "Complete its current assignment or cancel it before execution.");
  }
  if (!definition) return blocked("ORDER_RECOVERY_INVALID", "Campaign supply information is unavailable.", "Reload the campaign before arranging recovery.");
  if (!hasCampaignFriendlySupplyAccess(runtime, definition, faction, formation.locationHexKey!)) {
    return blocked("ORDER_SOURCE_INVALID", "This formation has no friendly supply connection.", "Restore a friendly-controlled connection to a supply source before arranging recovery.");
  }
  const work = recoveryWork(statusView(formation));
  const interrupted = interruptedRecovery(runtime, formation);
  const waiting = interrupted && interrupted.payload.minimumDurationSegments > interrupted.payload.progress.completedSegments;
  if (work.medical + work.equipment === 0 && !waiting) {
    return blocked("ORDER_RECOVERY_INVALID", "There are no surviving casualties or damaged equipment this order can recover.", "Killed personnel and destroyed equipment require replacements; this recovery order cannot replace them.");
  }
  quote = quoteRecovery(formation, runtime.currentSegment, interrupted);
  if (quote.projectedReadiness <= 0) return blocked("ORDER_RECOVERY_INVALID", "Treating survivors cannot restore this formation's combat readiness.", "Replacement personnel or equipment are required; this order cannot provide replacements.");
  if (runtime.factions[String(faction)].economy.supplies < quote.suppliesCost) {
    return blocked("ORDER_RESOURCE_INSUFFICIENT", `Recovery requires ${quote.suppliesCost} supplies.`, "Wait for supplies or release another allocation, then review the quote again.");
  }
  return { formationId, revision: runtime.revision, quote, availability: "available", reasonCode: null, reason: null,
    correctiveAction: null, mapHexKeys: [quote.sourceOffsetHexKey] };
}

/** Returns player-safe interruption text without changing any formation, order, or graph. */
export function campaignFormationRecoveryInterruption(
  runtime: CampaignRuntimeState, definition: CampaignScenarioDefinition, order: CampaignFormationRecoveryOrder
): string | null {
  const formation = runtime.formations[order.payload.formationId];
  if (!formation || formation.faction !== order.faction || formation.status !== "refitting"
    || formation.currentOrderId !== order.id || formation.locationHexKey !== order.payload.sourceRuntimeHexKey) {
    return "Recovery stopped because the formation's location, ownership or assignment changed. Review its current status before issuing another order.";
  }
  if (campaignFormationRecoveryFingerprint(formation) !== order.payload.progress.conditionHash) {
    return "Recovery stopped because the formation's condition changed outside this order. Review its condition and request a new quote.";
  }
  if (!hasCampaignFriendlySupplyAccess(runtime, definition, order.faction, formation.locationHexKey!)) {
    return "Recovery stopped because its friendly supply connection was lost. Restore the connection and request a continuation quote: remaining work is charged again, completed work is retained, and unfinished minimum recovery time is preserved.";
  }
  return null;
}

/** Clears only this order's assignment/posture; terminal or control-owned states remain authoritative. */
export function releaseCampaignFormationRecovery(runtime: CampaignRuntimeState, order: CampaignFormationRecoveryOrder): void {
  const formation = runtime.formations[order.payload.formationId];
  if (formation?.currentOrderId !== order.id) return;
  formation.currentOrderId = null;
  if (formation.status === "refitting") formation.status = order.payload.sourceStatus;
}

/** Applies exactly one scheduled boundary to the existing pools, returning whether recovery finished. */
export function advanceCampaignFormationRecovery(
  runtime: CampaignRuntimeState, order: CampaignFormationRecoveryOrder, segment: number
): boolean {
  const formation = runtime.formations[order.payload.formationId];
  const { progress } = order.payload;
  const expected = order.payload.startSegment + progress.completedSegments;
  if (segment !== expected) throw new Error("Recovery schedule is inconsistent. Reload the last valid campaign checkpoint.");
  const status = statusView(formation);
  const medical = applyMedicalRecoveryToStatus(status, CAMPAIGN_FORMATION_RECOVERY_POLICY.medicalCapacity);
  const equipment = applyEquipmentRepairToStatus(status, CAMPAIGN_FORMATION_RECOVERY_POLICY.equipmentCapacity);
  formation.readiness = calculateFormationReadiness(status, formation.readiness).readiness;
  progress.completedSegments += 1;
  progress.lastProcessedSegment = segment;
  progress.personnelReturnedToFit += medical.returnedToFit;
  progress.equipmentReturnedToOperational += equipment.returnedToOperational;
  progress.conditionHash = campaignFormationRecoveryFingerprint(formation);
  const completed = progress.completedSegments === order.payload.durationSegments;
  if (completed) {
    const work = recoveryWork(status);
    if (work.medical + work.equipment !== 0 || formation.readiness <= 0
      || progress.personnelReturnedToFit !== order.payload.personnelToFit
      || progress.equipmentReturnedToOperational !== order.payload.equipmentToOperational) {
      throw new Error("Recovery did not match its quoted work. Reload the last valid campaign checkpoint.");
    }
    formation.currentOrderId = null;
    formation.status = "ready";
    formation.battleHistory.push({
      id: createStableCampaignRecordId("formation-history", formation.id, order.id, "refit"),
      type: "refit", segment, engagementId: null, fromHexKey: formation.locationHexKey, toHexKey: formation.locationHexKey,
      summary: `${formation.name} completed recovery: ${progress.personnelReturnedToFit} personnel returned to fit duty and ${progress.equipmentReturnedToOperational} equipment restored. Permanent losses remain recorded.`
    });
  }
  return completed;
}
