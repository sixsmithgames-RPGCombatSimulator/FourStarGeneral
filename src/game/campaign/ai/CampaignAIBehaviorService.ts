/**
 * MODULE: CampaignAIBehaviorService
 * WHAT: Translates selected AI operational plans into the same typed drafts, reservations, validation, and commit path as Player orders.
 * WHY: Strategic AI must never receive free movement, collection, production, or force commitment outside common campaign rules.
 */

import { hexDistance } from "../../../core/Hex";
import type { CampaignFactionKey } from "../../../core/campaignTypes";
import type { Axial } from "../../../core/types";
import { getTransportMode, TRANSPORT_MODES } from "../../../data/transportModes";
import { INTEL_OPERATION_RULES } from "../../../state/CampaignIntelligence";
import {
  commitCampaignOrderDrafts,
  createIntelligenceOrderDraft,
  createProductionOrderDraft,
  createRedeployOrderDraft,
  removeCampaignOrderDraft,
  revalidateCampaignOrderBook
} from "../orders/CampaignOrderService";
import type { CampaignOrder, CampaignRedeployOrderPayload } from "../orders/CampaignOrderTypes";
import { calculateCampaignRedeploymentCosts } from "../orders/CampaignRedeployRules";
import { computeCampaignContentHash, createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import type { CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import {
  CAMPAIGN_AI_BEHAVIOR_VERSION,
  type CampaignAIBehaviorRecord,
  type CampaignAIPlanBehaviorDirective
} from "./CampaignAIBehaviorTypes";
import type { CampaignAIPlanningRecord, CampaignAISelectedPlan } from "./CampaignAIPlanningTypes";

function runtimeKeyToAxial(key: string): Axial | null {
  const [qText, rText] = key.split(",");
  const q = Number(qText);
  const r = Number(rText);
  return Number.isInteger(q) && Number.isInteger(r) ? { q, r } : null;
}

function offsetKeyToRuntimeKey(key: string): string | null {
  const [columnText, rowText] = key.split(",");
  const column = Number(columnText);
  const row = Number(rowText);
  return Number.isInteger(column) && Number.isInteger(row) ? `${column},${row - Math.floor(column / 2)}` : null;
}

function runtimeKeyToOffsetKey(key: string): string {
  const hex = runtimeKeyToAxial(key);
  return hex ? `${hex.q},${hex.r + Math.floor(hex.q / 2)}` : key;
}

function friendlyTiles(runtime: CampaignRuntimeState, faction: string): CampaignRuntimeState["tiles"][string][] {
  return runtime.tileOrder.map((hexKey) => runtime.tiles[hexKey]).filter((tile) => Boolean(tile) && tile.controller === faction);
}

function targetDistance(tileHexKey: string, target: Axial): number {
  const tile = runtimeKeyToAxial(tileHexKey);
  return tile ? hexDistance(tile, target) : Number.MAX_SAFE_INTEGER;
}

function resolveManeuverDestination(runtime: CampaignRuntimeState, plan: CampaignAISelectedPlan, originHexKey: string): string {
  const faction = String(plan.assignedFormationIds.map((id) => runtime.formations[id]?.faction).find(Boolean) ?? "Bot");
  const friendly = friendlyTiles(runtime, faction);
  const targetRuntime = offsetKeyToRuntimeKey(plan.targetHexKey);
  const target = targetRuntime ? runtimeKeyToAxial(targetRuntime) : null;
  if (plan.kind === "protectLogistics") {
    const protectedTile = friendly
      .filter((tile) => tile.infrastructure && ["logisticsHub", "supplyRoute", "airbase", "navalBase", "intelNode"].includes(tile.infrastructure.role))
      .sort((a, b) => (b.infrastructure?.effectiveness ?? 0) - (a.infrastructure?.effectiveness ?? 0) || a.hexKey.localeCompare(b.hexKey))[0];
    if (protectedTile) return protectedTile.hexKey;
  }
  if (!target || friendly.length === 0) return originHexKey;
  if (plan.kind === "withdraw") {
    return [...friendly].sort((a, b) => targetDistance(b.hexKey, target) - targetDistance(a.hexKey, target) || a.hexKey.localeCompare(b.hexKey))[0]?.hexKey ?? originHexKey;
  }
  return [...friendly].sort((a, b) => targetDistance(a.hexKey, target) - targetDistance(b.hexKey, target) || a.hexKey.localeCompare(b.hexKey))[0]?.hexKey ?? originHexKey;
}

function transportFor(unitTypes: readonly string[]) {
  const preferredKeys = ["armor", "truck", "foot"];
  return preferredKeys
    .map((key) => getTransportMode(key))
    .find((mode) => mode && unitTypes.every((unitType) => !mode.applicableUnitTypes?.length || mode.applicableUnitTypes.includes(unitType)))
    ?? Object.values(TRANSPORT_MODES).find((mode) => !mode.requiresAirbase && !mode.requiresNavalBase
      && unitTypes.every((unitType) => !mode.applicableUnitTypes?.length || mode.applicableUnitTypes.includes(unitType)))
    ?? null;
}

function activePriorOrders(
  runtime: CampaignRuntimeState,
  plan: CampaignAISelectedPlan,
  previousRecord: CampaignAIBehaviorRecord | null
): string[] {
  const prior = previousRecord?.directives.find((directive) => directive.planId === plan.planId);
  return prior?.orderIds.filter((orderId) => {
    const status = runtime.orders[orderId]?.status;
    return status === "committed" || status === "executing";
  }) ?? [];
}

function createManeuverDrafts(runtime: CampaignRuntimeState, plan: CampaignAISelectedPlan): CampaignOrder[] {
  const grouped = new Map<string, string[]>();
  plan.assignedFormationIds.forEach((formationId) => {
    const formation = runtime.formations[formationId];
    if (!formation || formation.status !== "ready" || formation.currentOrderId !== null || !formation.locationHexKey) return;
    const ids = grouped.get(formation.locationHexKey) ?? [];
    ids.push(formationId);
    grouped.set(formation.locationHexKey, ids);
  });
  const drafts: CampaignOrder[] = [];
  [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([originRuntimeHexKey, formationIds]) => {
    const destinationRuntimeHexKey = resolveManeuverDestination(runtime, plan, originRuntimeHexKey);
    if (destinationRuntimeHexKey === originRuntimeHexKey) return;
    const selectionsByType = new Map<string, number>();
    formationIds.forEach((formationId) => {
      const unitType = runtime.formations[formationId]?.campaignUnitType;
      if (unitType) selectionsByType.set(unitType, (selectionsByType.get(unitType) ?? 0) + 1);
    });
    const selections = [...selectionsByType].map(([unitType, count]) => ({ unitType, count })).sort((a, b) => a.unitType.localeCompare(b.unitType));
    const transport = transportFor(selections.map((selection) => selection.unitType));
    const origin = runtimeKeyToAxial(originRuntimeHexKey);
    const destination = runtimeKeyToAxial(destinationRuntimeHexKey);
    if (!transport || !origin || !destination || selections.length === 0) return;
    const distance = Math.max(1, hexDistance(origin, destination));
    const costs = calculateCampaignRedeploymentCosts(selections, distance, transport);
    const timeSegments = Math.max(1, Math.ceil(distance / transport.speedHexPerDay));
    const payload: CampaignRedeployOrderPayload = {
      originOffsetKey: runtimeKeyToOffsetKey(originRuntimeHexKey),
      destinationOffsetKey: runtimeKeyToOffsetKey(destinationRuntimeHexKey),
      originRuntimeHexKey,
      destinationRuntimeHexKey,
      selections,
      transportModeKey: transport.key,
      transportCapacityType: transport.capacityType ?? null,
      distance,
      timeSegments,
      etaSegment: runtime.currentSegment + timeSegments,
      returnEtaSegment: transport.capacityType === "trucks" || transport.capacityType === "transportShips"
        ? runtime.currentSegment + timeSegments * 2
        : runtime.currentSegment + timeSegments,
      fuelCost: costs.fuelCost,
      suppliesCost: costs.suppliesCost,
      manpowerCost: costs.manpowerLoss,
      transportCapacityCost: costs.capacityNeeded,
      formationIds
    };
    drafts.push(createRedeployOrderDraft(runtime, { faction: runtime.formations[formationIds[0]].faction, payload }));
  });
  return drafts;
}

function createIntelligenceDraft(runtime: CampaignRuntimeState, plan: CampaignAISelectedPlan, faction: CampaignFactionKey): CampaignOrder | null {
  const operationType = plan.kind === "protectLogistics" ? "opsec"
    : plan.kind === "interdictSupply" && plan.contactIds.length > 0 ? "verify"
      : "groundRecon";
  const rule = INTEL_OPERATION_RULES[operationType];
  const assignedAssetKey = plan.assignedFormationIds.find((id) => runtime.formations[id]?.faction === faction) ?? null;
  if (rule.requiresAsset !== "none" && !assignedAssetKey) return null;
  const targetHexKey = plan.kind === "protectLogistics" && assignedAssetKey
    ? runtimeKeyToOffsetKey(runtime.formations[assignedAssetKey].locationHexKey ?? offsetKeyToRuntimeKey(plan.targetHexKey) ?? "0,0")
    : plan.targetHexKey;
  return createIntelligenceOrderDraft(runtime, {
    faction,
    kind: operationType === "opsec" ? "counterIntelligence" : "reconnaissance",
    payload: {
      operationType,
      targetHexKey,
      assignedAssetKey,
      targetContactId: plan.contactIds[0] ?? null,
      durationSegments: rule.durationSegments,
      capacityCost: rule.capacityCost,
      suppliesCost: rule.suppliesCost,
      fuelCost: rule.fuelCost,
      resolveSegment: runtime.currentSegment + rule.durationSegments
    }
  });
}

function createBehaviorDrafts(runtime: CampaignRuntimeState, plan: CampaignAISelectedPlan, faction: CampaignFactionKey): CampaignOrder[] {
  if (plan.kind === "gatherIntelligence" || plan.kind === "interdictSupply" || plan.kind === "protectLogistics") {
    const intelligence = createIntelligenceDraft(runtime, plan, faction);
    return intelligence ? [intelligence] : [];
  }
  if (plan.kind === "rebuildReserve") {
    return [createProductionOrderDraft(runtime, {
      faction,
      allocation: { supplies: 40, fuel: 15, ammo: 10, manpower: 35 },
      effectiveSegment: runtime.currentSegment + 1
    })];
  }
  return createManeuverDrafts(runtime, plan);
}

/** Recomputes behavior integrity without trusting the stored value. */
export function computeCampaignAIBehaviorIntegrity(
  record: Omit<CampaignAIBehaviorRecord, "integrityHash"> | CampaignAIBehaviorRecord
): string {
  const { integrityHash: _ignored, ...content } = record as CampaignAIBehaviorRecord;
  return computeCampaignContentHash(content);
}

/** Mutates only the planning faction's ordinary order book inside the caller-owned campaign transaction. */
export function executeCampaignAIPlanPortfolio(
  runtime: CampaignRuntimeState,
  planning: CampaignAIPlanningRecord,
  previousRecord: CampaignAIBehaviorRecord | null = null
): CampaignAIBehaviorRecord {
  if (planning.faction === "Player" || planning.faction === "Neutral" || !runtime.factions[String(planning.faction)]) {
    throw new Error("Campaign AI behavior requires a valid AI-controlled faction planning record.");
  }
  const directiveDrafts = new Map<string, CampaignOrder[]>();
  const directives: CampaignAIPlanBehaviorDirective[] = [];
  planning.portfolio.selectedPlans.forEach((plan) => {
    const priorOrderIds = activePriorOrders(runtime, plan, previousRecord);
    if (priorOrderIds.length > 0) {
      directives.push({ planId: plan.planId, planKind: plan.kind, status: "ordered", orderIds: priorOrderIds, reason: "Existing legal orders continue this operational commitment." });
      return;
    }
    const drafts = createBehaviorDrafts(runtime, plan, planning.faction);
    directiveDrafts.set(plan.planId, drafts);
  });
  revalidateCampaignOrderBook(runtime);
  const validDraftIds: string[] = [];
  planning.portfolio.selectedPlans.forEach((plan) => {
    if (directives.some((directive) => directive.planId === plan.planId)) return;
    const drafts = directiveDrafts.get(plan.planId) ?? [];
    const valid = drafts.filter((order) => runtime.orders[order.id]?.validation.valid);
    const invalid = drafts.filter((order) => !runtime.orders[order.id]?.validation.valid);
    const invalidReason = invalid[0]?.validation.issues[0]?.message ?? null;
    if (invalid.length > 0) {
      drafts.forEach((order) => removeCampaignOrderDraft(runtime, order.id));
      directives.push({ planId: plan.planId, planKind: plan.kind, status: "blocked", orderIds: [], reason: invalidReason ?? "No common order preview remained legal." });
    } else if (valid.length > 0) {
      validDraftIds.push(...valid.map((order) => order.id));
      directives.push({ planId: plan.planId, planKind: plan.kind, status: "ordered", orderIds: valid.map((order) => order.id), reason: "Translated through common typed-order validation and reservations." });
    } else if (drafts.length === 0) {
      directives.push({ planId: plan.planId, planKind: plan.kind, status: "holding", orderIds: [], reason: "Assigned forces are already staged at the legal friendly objective line." });
    }
  });
  if (validDraftIds.length > 0) commitCampaignOrderDrafts(runtime, validDraftIds);
  directives.sort((a, b) => a.planId.localeCompare(b.planId));
  const committedOrderIds = directives.flatMap((directive) => directive.orderIds).filter((orderId) => {
    const order = runtime.orders[orderId];
    return Boolean(order) && order.faction === planning.faction && order.status !== "draft";
  });
  const blockedPlanIds = directives.filter((directive) => directive.status === "blocked").map((directive) => directive.planId);
  const sourceBehaviorHash = computeCampaignContentHash({
    planningId: planning.id,
    planningIntegrity: planning.integrityHash,
    previousRecord: previousRecord ? { id: previousRecord.id, integrityHash: previousRecord.integrityHash } : null,
    directives
  });
  const recordWithoutIntegrity: Omit<CampaignAIBehaviorRecord, "integrityHash"> = {
    version: CAMPAIGN_AI_BEHAVIOR_VERSION,
    id: createStableCampaignRecordId("ai-behavior", runtime.campaignId, planning.faction, planning.id, sourceBehaviorHash),
    faction: planning.faction,
    planningId: planning.id,
    sourceRevision: planning.sourceRevision,
    sourceSegment: planning.sourceSegment,
    generatedSegment: planning.generatedSegment,
    directives,
    committedOrderIds,
    blockedPlanIds,
    sourceBehaviorHash
  };
  return { ...recordWithoutIntegrity, integrityHash: computeCampaignAIBehaviorIntegrity(recordWithoutIntegrity) };
}
