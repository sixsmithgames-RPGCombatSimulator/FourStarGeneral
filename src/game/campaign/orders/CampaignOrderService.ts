/**
 * MODULE: CampaignOrderService
 * WHAT: Creates, validates, reserves, removes, and lifecycle-projects authoritative typed campaign orders.
 * WHY: Player UI, AI, saves, and resolution must share deterministic legality and conflict behavior.
 *
 * DEPENDENCIES: CampaignCanonical supplies stable IDs; runtime/order types supply authoritative state contracts.
 * EXPORTS: Draft factories, order-book revalidation, reservation transitions, and draft removal.
 */

import { createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import { getTransportMode } from "../../../data/transportModes";
import { createIntelOperation, INTEL_OPERATION_RULES } from "../../../state/CampaignIntelligence";
import type { CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import { calculateCampaignRedeploymentCosts } from "./CampaignRedeployRules";
import { campaignInfrastructureRepairCosts } from "../infrastructure/CampaignInfrastructureRules";
import type {
  CampaignInfrastructureRepairDraftInput,
  CampaignIntelligenceDraftInput,
  CampaignOrder,
  CampaignOrderValidationIssue,
  CampaignProductionDraftInput,
  CampaignRedeployDraftInput,
  CampaignReservation,
  CampaignReservationKind,
  CampaignReservationStatus
} from "./CampaignOrderTypes";

const COUNTER_INTELLIGENCE_TYPES = new Set(["counterRecon", "opsec", "phantom"]);

/** Converts the offset-key convention used by the campaign UI into authoritative axial runtime identity. */
export function campaignOffsetKeyToRuntimeHexKey(offsetKey: string): string | null {
  const [colText, rowText] = offsetKey.split(",");
  const col = Number(colText);
  const row = Number(rowText);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return `${col},${row - Math.floor(col / 2)}`;
}

function blankValidation(revision: number) {
  return { valid: false, issues: [], validatedRevision: revision };
}

function createOrderId(runtime: CampaignRuntimeState, kind: CampaignOrder["kind"], payload: unknown): string {
  return createStableCampaignRecordId(
    "order",
    runtime.campaignId,
    runtime.revision + 1,
    runtime.orderOrder.length,
    kind,
    payload
  );
}

function createReservation(
  runtime: CampaignRuntimeState,
  orderId: string,
  faction: CampaignOrder["faction"],
  kind: CampaignReservationKind,
  poolKey: string,
  amount: number,
  sequence: number
): CampaignReservation {
  return {
    id: createStableCampaignRecordId("reservation", orderId, sequence, kind, poolKey),
    orderId,
    faction,
    kind,
    poolKey,
    amount,
    status: "proposed",
    createdSegment: runtime.currentSegment
  };
}

function appendOrder(runtime: CampaignRuntimeState, order: CampaignOrder, reservations: CampaignReservation[]): CampaignOrder {
  runtime.orderOrder.push(order.id);
  runtime.orders[order.id] = order;
  reservations.forEach((reservation) => {
    runtime.reservationOrder.push(reservation.id);
    runtime.reservations[reservation.id] = reservation;
    order.reservationIds.push(reservation.id);
  });
  revalidateCampaignOrderBook(runtime);
  return runtime.orders[order.id];
}

/** Creates a complete redeployment draft and its proposed shared-pool claims. */
export function createRedeployOrderDraft(runtime: CampaignRuntimeState, input: CampaignRedeployDraftInput): CampaignOrder {
  const id = createOrderId(runtime, "redeploy", input.payload);
  const order: CampaignOrder = {
    id,
    faction: input.faction,
    kind: "redeploy",
    status: "draft",
    issuedSegment: runtime.currentSegment,
    earliestStartSegment: runtime.currentSegment,
    targetHexKeys: [input.payload.originOffsetKey, input.payload.destinationOffsetKey],
    formationIds: input.payload.formationIds?.length
      ? [...input.payload.formationIds]
      : input.payload.selections.map((selection) => `${input.payload.originRuntimeHexKey}:${selection.unitType}`),
    dependencies: [],
    reservationIds: [],
    acknowledgementKeys: [],
    executionRefId: null,
    validation: blankValidation(runtime.revision),
    payload: structuredClone(input.payload)
  };
  const reservations: CampaignReservation[] = [];
  const add = (kind: CampaignReservationKind, poolKey: string, amount: number): void => {
    if (amount > 0) reservations.push(createReservation(runtime, id, input.faction, kind, poolKey, amount, reservations.length));
  };
  add("resource", "fuel", input.payload.fuelCost);
  add("resource", "supplies", input.payload.suppliesCost);
  add("resource", "manpower", input.payload.manpowerCost);
  if (input.payload.transportCapacityType) {
    add("transport", input.payload.transportCapacityType, input.payload.transportCapacityCost);
  }
  if (input.payload.formationIds?.length) {
    input.payload.formationIds.forEach((formationId) => add("formation", `formation-id:${formationId}`, 1));
  } else {
    input.payload.selections.forEach((selection) => {
      add("formation", `${input.payload.originRuntimeHexKey}|${selection.unitType}`, selection.count);
    });
  }
  return appendOrder(runtime, order, reservations);
}

/** Creates one exclusive next-delivery theater-support allocation draft. */
export function createProductionOrderDraft(runtime: CampaignRuntimeState, input: CampaignProductionDraftInput): CampaignOrder {
  const payload = { allocation: structuredClone(input.allocation), effectiveSegment: input.effectiveSegment };
  const id = createOrderId(runtime, "production", payload);
  const order: CampaignOrder = {
    id,
    faction: input.faction,
    kind: "production",
    status: "draft",
    issuedSegment: runtime.currentSegment,
    earliestStartSegment: runtime.currentSegment,
    targetHexKeys: [],
    formationIds: [],
    dependencies: [],
    reservationIds: [],
    acknowledgementKeys: [],
    executionRefId: null,
    validation: blankValidation(runtime.revision),
    payload
  };
  return appendOrder(runtime, order, [createReservation(runtime, id, input.faction, "productionSlot", "allocation", 1, 0)]);
}

/** Creates a reconnaissance or counterintelligence draft with exact capacity, asset, and resource claims. */
export function createIntelligenceOrderDraft(runtime: CampaignRuntimeState, input: CampaignIntelligenceDraftInput): CampaignOrder {
  const expectedKind = COUNTER_INTELLIGENCE_TYPES.has(input.payload.operationType) ? "counterIntelligence" : "reconnaissance";
  const kind = input.kind === expectedKind ? input.kind : expectedKind;
  const id = createOrderId(runtime, kind, input.payload);
  const order: CampaignOrder = {
    id,
    faction: input.faction,
    kind,
    status: "draft",
    issuedSegment: runtime.currentSegment,
    earliestStartSegment: runtime.currentSegment,
    targetHexKeys: [input.payload.targetHexKey],
    formationIds: input.payload.assignedAssetKey ? [input.payload.assignedAssetKey] : [],
    dependencies: [],
    reservationIds: [],
    acknowledgementKeys: [],
    executionRefId: null,
    validation: blankValidation(runtime.revision),
    payload: structuredClone(input.payload)
  };
  const reservations: CampaignReservation[] = [];
  const add = (reservationKind: CampaignReservationKind, poolKey: string, amount: number): void => {
    if (amount > 0) reservations.push(createReservation(runtime, id, input.faction, reservationKind, poolKey, amount, reservations.length));
  };
  add("resource", "supplies", input.payload.suppliesCost);
  add("resource", "fuel", input.payload.fuelCost);
  add("intelligenceCapacity", "operations", input.payload.capacityCost);
  if (input.payload.assignedAssetKey) add("asset", input.payload.assignedAssetKey, 1);
  return appendOrder(runtime, order, reservations);
}

/** Creates one exclusive facility repair draft and reserves its engineer plus up-front resources. */
export function createInfrastructureRepairOrderDraft(
  runtime: CampaignRuntimeState,
  input: CampaignInfrastructureRepairDraftInput
): CampaignOrder {
  const id = createOrderId(runtime, "infrastructureRepair", input.payload);
  const order: CampaignOrder = {
    id,
    faction: input.faction,
    kind: "infrastructureRepair",
    status: "draft",
    issuedSegment: runtime.currentSegment,
    earliestStartSegment: input.payload.startSegment,
    targetHexKeys: [input.payload.targetOffsetHexKey],
    formationIds: [input.payload.engineerFormationId],
    dependencies: [],
    reservationIds: [],
    acknowledgementKeys: [],
    executionRefId: null,
    validation: blankValidation(runtime.revision),
    payload: structuredClone(input.payload)
  };
  const reservations: CampaignReservation[] = [];
  const add = (kind: CampaignReservationKind, poolKey: string, amount: number): void => {
    if (amount > 0) reservations.push(createReservation(runtime, id, input.faction, kind, poolKey, amount, reservations.length));
  };
  add("resource", "supplies", input.payload.suppliesCost);
  add("resource", "manpower", input.payload.manpowerCost);
  add("asset", `infrastructure:${input.payload.targetRuntimeHexKey}`, 1);
  add("asset", `engineering:${input.payload.engineerFormationId}`, 1);
  return appendOrder(runtime, order, reservations);
}

function issue(code: CampaignOrderValidationIssue["code"], message: string, reservationId: string | null = null): CampaignOrderValidationIssue {
  return { code, message, reservationId };
}

function validateStaticOrder(runtime: CampaignRuntimeState, order: CampaignOrder): CampaignOrderValidationIssue[] {
  const issues: CampaignOrderValidationIssue[] = [];
  if (!runtime.factions[String(order.faction)]) {
    issues.push(issue("ORDER_FACTION_INVALID", "The issuing faction is no longer part of this campaign."));
    return issues;
  }
  if (order.kind === "redeploy") {
    const origin = runtime.tiles[order.payload.originRuntimeHexKey];
    const destination = runtime.tiles[order.payload.destinationRuntimeHexKey];
    const transport = getTransportMode(order.payload.transportModeKey);
    if (!origin || origin.controller !== order.faction) {
      issues.push(issue("ORDER_SOURCE_INVALID", "The origin is no longer controlled by the issuing faction."));
    }
    if (!destination) {
      issues.push(issue("ORDER_TARGET_INVALID", "The redeployment destination is no longer available."));
    } else if (destination.controller !== "Neutral" && destination.controller !== order.faction) {
      issues.push(issue("ORDER_TARGET_INVALID", "Redeployment cannot enter a location under opposing control."));
    }
    if (order.payload.selections.length === 0 || order.payload.selections.some((entry) => !Number.isInteger(entry.count) || entry.count <= 0)) {
      issues.push(issue("ORDER_SELECTION_INVALID", "Select at least one valid unit quantity."));
    }
    if (order.payload.formationIds?.length) {
      const exactIds = [...order.payload.formationIds];
      const selectedByType = new Map(order.payload.selections.map((selection) => [selection.unitType, selection.count]));
      const exactByType = new Map<string, number>();
      const invalidFormation = new Set(exactIds).size !== exactIds.length || exactIds.some((formationId) => {
        const formation = runtime.formations[formationId];
        if (!formation) return true;
        exactByType.set(formation.campaignUnitType, (exactByType.get(formation.campaignUnitType) ?? 0) + 1);
        return formation.faction !== order.faction
          || formation.locationHexKey !== order.payload.originRuntimeHexKey
          || formation.status !== "ready"
          || (formation.currentOrderId !== null && formation.currentOrderId !== order.id);
      });
      const selectionMismatch = selectedByType.size !== exactByType.size
        || [...selectedByType].some(([unitType, count]) => exactByType.get(unitType) !== count);
      if (invalidFormation || selectionMismatch) {
        issues.push(issue("ORDER_FORCE_UNAVAILABLE", "The exact formations selected for redeployment are no longer ready at the origin."));
      }
    }
    const [originQ, originR] = order.payload.originRuntimeHexKey.split(",").map(Number);
    const [destinationQ, destinationR] = order.payload.destinationRuntimeHexKey.split(",").map(Number);
    const distance = Number.isFinite(originQ) && Number.isFinite(originR) && Number.isFinite(destinationQ) && Number.isFinite(destinationR)
      ? Math.max(1, (Math.abs(originQ - destinationQ) + Math.abs(originQ + originR - destinationQ - destinationR) + Math.abs(originR - destinationR)) / 2)
      : Number.NaN;
    const costs = transport && Number.isFinite(distance)
      ? calculateCampaignRedeploymentCosts(order.payload.selections, distance, transport)
      : null;
    const expectedTime = transport && Number.isFinite(distance) ? Math.max(1, Math.ceil(distance / transport.speedHexPerDay)) : -1;
    const expectedEta = order.issuedSegment + expectedTime;
    const expectedReturn = transport?.capacityType === "trucks" || transport?.capacityType === "transportShips"
      ? expectedEta + expectedTime
      : expectedEta;
    const transportInvalid = !transport
      || campaignOffsetKeyToRuntimeHexKey(order.payload.originOffsetKey) !== order.payload.originRuntimeHexKey
      || campaignOffsetKeyToRuntimeHexKey(order.payload.destinationOffsetKey) !== order.payload.destinationRuntimeHexKey
      || order.payload.selections.some((entry) => transport.applicableUnitTypes?.length
        && !transport.applicableUnitTypes.includes(entry.unitType))
      || distance !== order.payload.distance
      || expectedTime !== order.payload.timeSegments
      || expectedEta !== order.payload.etaSegment
      || expectedReturn !== order.payload.returnEtaSegment
      || transport.capacityType !== (order.payload.transportCapacityType ?? undefined)
      || costs?.fuelCost !== order.payload.fuelCost
      || costs?.suppliesCost !== order.payload.suppliesCost
      || costs?.manpowerLoss !== order.payload.manpowerCost
      || costs?.capacityNeeded !== order.payload.transportCapacityCost;
    if (transportInvalid || order.payload.etaSegment < runtime.currentSegment) {
      issues.push(issue("ORDER_TRANSPORT_INVALID", "The transport plan is no longer valid."));
    }
  } else if (order.kind === "production") {
    const values = Object.values(order.payload.allocation);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (values.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(total - 100) > 0.0001) {
      issues.push(issue("ORDER_ALLOCATION_INVALID", "Support shares must be non-negative and total 100%."));
    }
  } else if (order.kind === "infrastructureRepair") {
    const tile = runtime.tiles[order.payload.targetRuntimeHexKey];
    const infrastructure = tile?.infrastructure;
    const engineer = runtime.formations[order.payload.engineerFormationId];
    const costs = campaignInfrastructureRepairCosts(order.payload.repairPoints);
    if (!tile || tile.controller !== order.faction || !infrastructure) {
      issues.push(issue("ORDER_TARGET_INVALID", "The facility is unavailable or no longer under friendly control."));
    }
    if (!engineer || engineer.faction !== order.faction || engineer.locationHexKey !== order.payload.targetRuntimeHexKey
      || engineer.status !== "ready" || (engineer.currentOrderId !== null && engineer.currentOrderId !== order.id)) {
      issues.push(issue("ORDER_FORCE_UNAVAILABLE", "A ready formation must remain on the facility to supervise repairs."));
    }
    const invalidRepair = !infrastructure
      || infrastructure.activeRepairOrderId !== null
      || campaignOffsetKeyToRuntimeHexKey(order.payload.targetOffsetHexKey) !== order.payload.targetRuntimeHexKey
      || order.payload.role !== infrastructure.role
      || order.payload.sourceIntegrity !== infrastructure.integrity
      || order.payload.targetIntegrity !== infrastructure.maxIntegrity
      || order.payload.repairPoints !== order.payload.targetIntegrity - order.payload.sourceIntegrity
      || order.payload.repairPoints <= 0
      || !Number.isInteger(order.payload.repairRate) || order.payload.repairRate <= 0
      || order.payload.durationSegments !== Math.ceil(order.payload.repairPoints / order.payload.repairRate)
      || order.payload.startSegment !== order.issuedSegment + 1
      || order.payload.completeSegment !== order.issuedSegment + order.payload.durationSegments
      || order.payload.suppliesCost !== costs.supplies
      || order.payload.manpowerCost !== costs.manpower;
    if (invalidRepair) {
      issues.push(issue("ORDER_INFRASTRUCTURE_INVALID", "The facility condition, repair schedule, or reconstruction cost has changed."));
    }
  } else {
    const runtimeTarget = campaignOffsetKeyToRuntimeHexKey(order.payload.targetHexKey);
    if (!runtimeTarget || !runtime.tiles[runtimeTarget]) {
      issues.push(issue("ORDER_TARGET_INVALID", "The intelligence target is no longer a valid campaign hex."));
    }
    const expectedCounter = COUNTER_INTELLIGENCE_TYPES.has(order.payload.operationType);
    const rule = INTEL_OPERATION_RULES[order.payload.operationType];
    if ((order.kind === "counterIntelligence") !== expectedCounter
      || !rule
      || order.payload.durationSegments !== rule.durationSegments
      || order.payload.capacityCost !== rule.capacityCost
      || order.payload.suppliesCost !== rule.suppliesCost
      || order.payload.fuelCost !== rule.fuelCost
      || order.payload.resolveSegment !== order.issuedSegment + rule.durationSegments
      || (rule.requiresAsset !== "none" && !order.payload.assignedAssetKey)) {
      issues.push(issue("ORDER_OPERATION_INVALID", "The intelligence operation definition is invalid."));
    }
  }
  return issues;
}

function reservationCapacity(runtime: CampaignRuntimeState, reservation: CampaignReservation): number {
  const faction = runtime.factions[String(reservation.faction)];
  if (!faction) return 0;
  if (reservation.kind === "resource") {
    const economy = faction.economy as unknown as Record<string, unknown>;
    const value = economy[reservation.poolKey];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  if (reservation.kind === "transport") {
    const capacity = faction.economy.transportCapacity as unknown as Record<string, unknown> | undefined;
    const total = capacity?.[reservation.poolKey];
    const inTransit = capacity?.[`${reservation.poolKey}InTransit`];
    return Math.max(0, (typeof total === "number" ? total : 0) - (typeof inTransit === "number" ? inTransit : 0));
  }
  if (reservation.kind === "intelligenceCapacity") {
    const knowledge = runtime.knowledgeByFaction[String(reservation.faction)];
    if (!knowledge) return 0;
    const committed = knowledge.operations
      .filter((operation) => operation.status === "planned" || operation.status === "active")
      .reduce((sum, operation) => sum + operation.capacityCommitted, 0);
    return Math.max(0, knowledge.capacityTotal - committed);
  }
  if (reservation.kind === "formation") {
    if (reservation.poolKey.startsWith("formation-id:")) {
      const formationId = reservation.poolKey.slice("formation-id:".length);
      const formation = runtime.formations[formationId];
      return formation
        && formation.faction === reservation.faction
        && formation.status === "ready"
        && formation.currentOrderId === null
        ? 1
        : 0;
    }
    const separator = reservation.poolKey.indexOf("|");
    if (separator < 1) return 0;
    const hexKey = reservation.poolKey.slice(0, separator);
    const unitType = reservation.poolKey.slice(separator + 1);
    return runtime.tiles[hexKey]?.forces
      .filter((force) => force.unitType === unitType)
      .reduce((sum, force) => sum + force.count, 0) ?? 0;
  }
  if (reservation.kind === "asset") {
    if (reservation.poolKey.startsWith("infrastructure:")) {
      const hexKey = reservation.poolKey.slice("infrastructure:".length);
      return runtime.tiles[hexKey]?.infrastructure?.activeRepairOrderId ? 0 : 1;
    }
    if (reservation.poolKey.startsWith("engineering:")) {
      const formationId = reservation.poolKey.slice("engineering:".length);
      const formation = runtime.formations[formationId];
      return formation && formation.status === "ready" && formation.currentOrderId === null ? 1 : 0;
    }
    const knowledge = runtime.knowledgeByFaction[String(reservation.faction)];
    const committed = knowledge?.operations.some((operation) =>
      (operation.status === "planned" || operation.status === "active")
      && operation.assignedAssetKey === reservation.poolKey
    );
    return committed ? 0 : 1;
  }
  return 1;
}

function reservationIssue(
  reservation: CampaignReservation,
  capacity: number,
  used: number
): CampaignOrderValidationIssue {
  const conflict = used > 0;
  if (conflict) {
    return issue(
      "ORDER_RESERVATION_CONFLICT",
      `Another draft already holds ${reservation.poolKey}; remove or commit the earlier order first.`,
      reservation.id
    );
  }
  if (reservation.kind === "resource") {
    return issue(
      "ORDER_RESOURCE_INSUFFICIENT",
      `Insufficient ${reservation.poolKey}: ${reservation.amount.toLocaleString()} required, ${capacity.toLocaleString()} available.`,
      reservation.id
    );
  }
  if (reservation.kind === "formation") {
    return issue("ORDER_FORCE_UNAVAILABLE", "The selected units are no longer available at the origin.", reservation.id);
  }
  if (reservation.kind === "asset") {
    return issue("ORDER_ASSET_UNAVAILABLE", "The assigned asset is already committed or unavailable.", reservation.id);
  }
  return issue(
    "ORDER_CAPACITY_INSUFFICIENT",
    `Insufficient ${reservation.poolKey} capacity: ${reservation.amount} required, ${capacity} available.`,
    reservation.id
  );
}

/**
 * Revalidates every draft and arbitrates proposed holds in stable order.
 * Earlier valid drafts reserve first; invalid drafts retain diagnostics but hold nothing.
 */
export function revalidateCampaignOrderBook(runtime: CampaignRuntimeState): void {
  const usedByPool = new Map<string, number>();
  runtime.orderOrder.forEach((orderId) => {
    const order = runtime.orders[orderId];
    if (!order || order.status !== "draft") return;
    const reservations = order.reservationIds
      .map((reservationId) => runtime.reservations[reservationId])
      .filter((reservation): reservation is CampaignReservation => Boolean(reservation));
    reservations.forEach((reservation) => { reservation.status = "proposed"; });
    const issues = validateStaticOrder(runtime, order);
    if (issues.length === 0) {
      reservations.forEach((reservation) => {
        const poolIdentity = `${reservation.faction}|${reservation.kind}|${reservation.poolKey}`;
        const used = usedByPool.get(poolIdentity) ?? 0;
        const capacity = reservationCapacity(runtime, reservation);
        if (reservation.amount > capacity - used) issues.push(reservationIssue(reservation, capacity, used));
      });
    }
    order.validation = { valid: issues.length === 0, issues, validatedRevision: runtime.revision };
    if (issues.length === 0) {
      reservations.forEach((reservation) => {
        reservation.status = "held";
        const poolIdentity = `${reservation.faction}|${reservation.kind}|${reservation.poolKey}`;
        usedByPool.set(poolIdentity, (usedByPool.get(poolIdentity) ?? 0) + reservation.amount);
      });
    }
  });
}

/** Removes a draft and its proposed/held reservations, then revalidates all later drafts. */
export function removeCampaignOrderDraft(runtime: CampaignRuntimeState, orderId: string): boolean {
  const order = runtime.orders[orderId];
  if (!order || order.status !== "draft") return false;
  const reservationIds = new Set(order.reservationIds);
  reservationIds.forEach((reservationId) => { delete runtime.reservations[reservationId]; });
  runtime.reservationOrder.splice(0, runtime.reservationOrder.length, ...runtime.reservationOrder.filter((id) => !reservationIds.has(id)));
  delete runtime.orders[orderId];
  runtime.orderOrder.splice(0, runtime.orderOrder.length, ...runtime.orderOrder.filter((id) => id !== orderId));
  revalidateCampaignOrderBook(runtime);
  return true;
}

/**
 * Moves one draft ahead of or behind the adjacent draft and then re-arbitrates every proposed hold.
 * Committed/history records keep their relative positions, so only planning priority changes.
 */
export function moveCampaignOrderDraft(
  runtime: CampaignRuntimeState,
  orderId: string,
  direction: "earlier" | "later"
): boolean {
  const order = runtime.orders[orderId];
  if (!order || order.status !== "draft") return false;
  const draftIds = runtime.orderOrder.filter((id) => runtime.orders[id]?.status === "draft");
  const draftIndex = draftIds.indexOf(orderId);
  const targetDraftId = direction === "earlier" ? draftIds[draftIndex - 1] : draftIds[draftIndex + 1];
  if (!targetDraftId) return false;
  const orderIndex = runtime.orderOrder.indexOf(orderId);
  const targetIndex = runtime.orderOrder.indexOf(targetDraftId);
  if (orderIndex < 0 || targetIndex < 0) return false;
  runtime.orderOrder[orderIndex] = targetDraftId;
  runtime.orderOrder[targetIndex] = orderId;
  revalidateCampaignOrderBook(runtime);
  return true;
}

/** Transitions every reservation owned by an order without changing ledger identity. */
export function setCampaignOrderReservationStatus(
  runtime: CampaignRuntimeState,
  order: CampaignOrder,
  status: CampaignReservationStatus
): void {
  order.reservationIds.forEach((reservationId) => {
    const reservation = runtime.reservations[reservationId];
    if (reservation) reservation.status = status;
  });
}

/**
 * Commits validated drafts through the same resource, capacity, formation, and execution adapters for Player and AI.
 * The caller owns the surrounding runtime transaction, so any thrown error rolls the complete portfolio back.
 */
export function commitCampaignOrderDrafts(runtime: CampaignRuntimeState, orderIds: readonly string[]): CampaignOrder[] {
  const requested = [...new Set(orderIds)];
  if (requested.length === 0) return [];
  revalidateCampaignOrderBook(runtime);
  const orders = requested.map((orderId) => runtime.orders[orderId]);
  const missing = orders.findIndex((order) => !order || order.status !== "draft");
  if (missing >= 0) throw new Error(`Order ${requested[missing]} is missing or no longer a draft.`);
  const invalid = orders.find((order) => !order.validation.valid);
  if (invalid) throw new Error(invalid.validation.issues[0]?.message ?? `Order ${invalid.id} is invalid.`);

  orders.forEach((order) => {
    const faction = runtime.factions[String(order.faction)];
    if (!faction) throw new Error(`Issuing faction ${order.faction} is unavailable.`);
    if (order.kind === "redeploy") {
      const economy = faction.economy;
      if (economy.fuel < order.payload.fuelCost || economy.supplies < order.payload.suppliesCost || economy.manpower < order.payload.manpowerCost) {
        throw new Error("Redeployment resources changed before commit.");
      }
      economy.fuel -= order.payload.fuelCost;
      economy.supplies -= order.payload.suppliesCost;
      economy.manpower -= order.payload.manpowerCost;
      if (order.payload.transportCapacityType && order.payload.transportCapacityCost > 0) {
        const capacity = economy.transportCapacity as unknown as Record<string, number> | undefined;
        if (!capacity) throw new Error("Transport capacity is unavailable.");
        const key = `${order.payload.transportCapacityType}InTransit`;
        capacity[key] = (capacity[key] ?? 0) + order.payload.transportCapacityCost;
      }
      const decisionId = createStableCampaignRecordId("decision", runtime.campaignId, order.id, "redeploy");
      runtime.compatibility.queuedDecisions.push({
        id: decisionId,
        faction: order.faction,
        type: "redeploy",
        payload: {
          originOffsetKey: order.payload.originOffsetKey,
          destOffsetKey: order.payload.destinationOffsetKey,
          selections: structuredClone(order.payload.selections),
          transportMode: order.payload.transportModeKey,
          distance: order.payload.distance,
          timeSegments: order.payload.timeSegments,
          etaSegment: order.payload.etaSegment,
          returnEtaSegment: order.payload.returnEtaSegment,
          fuelCost: order.payload.fuelCost,
          suppliesCost: order.payload.suppliesCost,
          manpowerLoss: order.payload.manpowerCost,
          formationIds: order.payload.formationIds ? [...order.payload.formationIds] : undefined,
          capacityReserved: order.payload.transportCapacityType
            ? { type: order.payload.transportCapacityType, count: order.payload.transportCapacityCost }
            : undefined,
          status: "queued",
          typedOrderId: order.id
        },
        affectedHexKeys: [order.payload.originOffsetKey, order.payload.destinationOffsetKey]
      });
      order.payload.formationIds?.forEach((formationId) => {
        const formation = runtime.formations[formationId];
        if (!formation || formation.currentOrderId !== null || formation.status !== "ready") {
          throw new Error(`Formation ${formationId} changed before redeployment commitment.`);
        }
        formation.currentOrderId = order.id;
        formation.status = "inTransit";
      });
      order.executionRefId = decisionId;
    } else if (order.kind === "production") {
      faction.economy.productionAllocation = structuredClone(order.payload.allocation);
      order.executionRefId = createStableCampaignRecordId("production", runtime.campaignId, order.id, order.payload.effectiveSegment);
    } else if (order.kind === "infrastructureRepair") {
      const tile = runtime.tiles[order.payload.targetRuntimeHexKey];
      const infrastructure = tile?.infrastructure;
      const engineer = runtime.formations[order.payload.engineerFormationId];
      if (!tile || tile.controller !== order.faction || !infrastructure || infrastructure.activeRepairOrderId) {
        throw new Error("Facility condition changed before repair commitment.");
      }
      if (!engineer || engineer.faction !== order.faction || engineer.locationHexKey !== tile.hexKey
        || engineer.status !== "ready" || engineer.currentOrderId !== null) {
        throw new Error("The supervising formation changed before repair commitment.");
      }
      if (faction.economy.supplies < order.payload.suppliesCost || faction.economy.manpower < order.payload.manpowerCost) {
        throw new Error("Repair resources changed before commitment.");
      }
      faction.economy.supplies -= order.payload.suppliesCost;
      faction.economy.manpower -= order.payload.manpowerCost;
      infrastructure.activeRepairOrderId = order.id;
      engineer.currentOrderId = order.id;
      order.executionRefId = order.id;
    } else {
      const economy = faction.economy;
      if (economy.supplies < order.payload.suppliesCost || economy.fuel < order.payload.fuelCost) {
        throw new Error("Intelligence resources changed before commit.");
      }
      const knowledge = runtime.knowledgeByFaction[String(order.faction)];
      if (!knowledge) throw new Error("Faction intelligence state is unavailable.");
      economy.supplies -= order.payload.suppliesCost;
      economy.fuel -= order.payload.fuelCost;
      const operation = createIntelOperation(
        knowledge,
        order.payload.operationType,
        order.payload.targetHexKey,
        runtime.currentSegment,
        order.payload.assignedAssetKey ?? undefined,
        order.payload.targetContactId ?? undefined
      );
      knowledge.operations.push(operation);
      order.executionRefId = operation.id;
    }
    order.status = "committed";
    order.validation = { valid: true, issues: [], validatedRevision: runtime.revision };
    setCampaignOrderReservationStatus(runtime, order, "consumed");
  });
  revalidateCampaignOrderBook(runtime);
  return orders;
}

/** Returns an order-book snapshot in deterministic UI/resolution order. */
export function projectCampaignOrders(runtime: CampaignRuntimeState): CampaignOrder[] {
  return runtime.orderOrder
    .map((id) => runtime.orders[id])
    .filter((order): order is CampaignOrder => Boolean(order))
    .map((order) => structuredClone(order));
}
