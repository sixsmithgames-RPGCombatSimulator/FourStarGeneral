/**
 * MODULE: CampaignSegmentResolver
 * WHAT: Resolves one three-hour campaign boundary from frozen faction views inside one authoritative runtime transaction.
 * WHY: Time, movement, logistics, intelligence, control, and order lifecycle must commit together or roll back together.
 *
 * DEPENDENCIES: Runtime transaction/adapter, shared production and order rules, and the shipped intelligence resolver.
 * EXPORTS: Frozen faction view contracts, resolver options/results, phase order, view builder, and resolveCampaignSegment.
 */

import type {
  CampaignDecision,
  CampaignFactionEconomy,
  CampaignFactionKey,
  ProductionAllocation
} from "../../../core/campaignTypes";
import type { CampaignMapViewModel } from "../../../core/campaignIntelTypes";
import {
  buildCampaignMapView,
  resolveCampaignIntelligenceSegment,
  scheduleBaselineBotOperation
} from "../../../state/CampaignIntelligence";
import { computeDailyProduction, DEFAULT_PRODUCTION_ALLOCATION } from "../logistics/CampaignProductionRules";
import { assessCampaignAITheater } from "../ai/CampaignAIAssessmentService";
import type {
  CampaignAIAssessmentInput,
  CampaignAIFriendlyFormationView,
  CampaignAIObjectiveView,
  CampaignAITheaterAssessment
} from "../ai/CampaignAIAssessmentTypes";
import { planCampaignAIOperations } from "../ai/CampaignAIPlanningService";
import { executeCampaignAIPlanPortfolio } from "../ai/CampaignAIBehaviorService";
import { resolveCampaignAIEngagements } from "../ai/CampaignAIEngagementService";
import type {
  CampaignAIPlanningInput,
  CampaignAIPlanningRecord
} from "../ai/CampaignAIPlanningTypes";
import { campaignOffsetKeyToRuntimeHexKey, revalidateCampaignOrderBook } from "../orders/CampaignOrderService";
import type { CampaignOrder } from "../orders/CampaignOrderTypes";
import {
  reconcileCampaignFormationForceCounts,
  relocateCampaignFormation,
  releaseCampaignFormationAvailability,
  synchronizeCampaignFormationForceProjection
} from "../formations/FormationLifecycleService";
import {
  campaignTileCapacityFactor,
  refreshCampaignInfrastructureState
} from "../infrastructure/CampaignInfrastructureRules";
import { computeCampaignContentHash } from "./CampaignCanonical";
import {
  advanceCampaignFormationRecovery, campaignFormationRecoveryInterruption, releaseCampaignFormationRecovery
} from "../formations/CampaignFormationRecoveryService";
import { deriveCampaignFrontsFromControl } from "../control/CampaignBattleControlResolver";
import { evaluateCampaignObjectives, projectCampaignObjectives } from "../objectives/CampaignObjectiveEvaluator";
import { appendCampaignAdvanceStepRecord, type CampaignAdvanceContext } from "./CampaignAdvanceRules";
import { projectLegacyCampaignState } from "./CampaignScenarioAdapter";
import { runCampaignRuntimeTransaction } from "./CampaignRuntimeTransaction";
import {
  CampaignRuntimeError,
  type CampaignDomainEventDraft,
  type CampaignFrozenFactionViewCheckpoint,
  type CampaignInvariantIssue,
  type CampaignResolutionReport,
  type CampaignRuntimeState,
  type CampaignScenarioDefinition,
  type CampaignSegmentPhase,
  type CampaignSegmentPhaseReport
} from "./campaignRuntimeTypes";

/** Stable complete phase order. Future domain resolvers fill reserved phases without changing ordering. */
export const CAMPAIGN_SEGMENT_PHASE_ORDER: readonly CampaignSegmentPhase[] = [
  "timeBoundary",
  "environment",
  "orders",
  "movement",
  "logistics",
  "intelligence",
  "engagements",
  "consequences",
  "control",
  "objectives",
  "finalize"
] as const;

/** Legal, deeply frozen start-of-segment input prepared for one faction and future strategic AI. */
export interface CampaignFrozenFactionView {
  readonly faction: CampaignFactionKey;
  readonly campaignId: string;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly economy: CampaignFactionEconomy;
  readonly map: CampaignMapViewModel;
  readonly orders: readonly CampaignOrder[];
  readonly friendlyFormations: CampaignAIAssessmentInput["friendlyFormations"];
  readonly objectives: CampaignAIAssessmentInput["objectives"];
  readonly campaign: CampaignAIAssessmentInput["campaign"];
}

/** Optional phase observer supports diagnostics and deterministic fault-injection certification. */
export interface CampaignSegmentResolverOptions {
  readonly afterPhase?: (phase: CampaignSegmentPhase, candidate: CampaignRuntimeState) => void;
  readonly advanceContext?: CampaignAdvanceContext;
}

export interface CampaignSegmentResolutionCommitted {
  readonly ok: true;
  readonly state: CampaignRuntimeState;
  readonly report: CampaignResolutionReport;
  readonly frozenViews: readonly CampaignFrozenFactionView[];
}

export interface CampaignSegmentResolutionRejected {
  readonly ok: false;
  readonly state: CampaignRuntimeState;
  readonly error: CampaignRuntimeError;
  readonly issues: readonly CampaignInvariantIssue[];
  readonly frozenViews: readonly CampaignFrozenFactionView[];
}

export type CampaignSegmentResolutionResult = CampaignSegmentResolutionCommitted | CampaignSegmentResolutionRejected;

interface MovementPlan {
  readonly decisionId: string;
  readonly faction: CampaignFactionKey;
  readonly originHexKey: string;
  readonly destinationHexKey: string;
  readonly moving: Readonly<Record<string, number>>;
  readonly formationIds: readonly string[];
  readonly hasExactFormationCommitment: boolean;
  readonly returnDue: boolean;
}

/** Recursively freezes a defensive value so phase/AI consumers cannot alter their legal input. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
    Object.freeze(value);
  }
  return value;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function effectiveFormationStrength(formation: CampaignRuntimeState["formations"][string]): number {
  const personnel = Object.values(formation.personnel).reduce((totals, pool) => ({
    effective: totals.effective + pool.fit + pool.injured * 0.5,
    total: totals.total + pool.fit + pool.injured + pool.wounded + pool.severelyWounded + pool.killed
  }), { effective: 0, total: 0 });
  const equipment = Object.values(formation.equipment).reduce((totals, pool) => ({
    effective: totals.effective + pool.operational + pool.damaged * 0.5,
    total: totals.total + pool.operational + pool.damaged + pool.disabled + pool.destroyed
  }), { effective: 0, total: 0 });
  const ratios = [
    ...(personnel.total > 0 ? [personnel.effective / personnel.total] : []),
    ...(equipment.total > 0 ? [equipment.effective / equipment.total] : [])
  ];
  const material = ratios.length > 0 ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 0;
  return clampPercent(Math.min(material, formation.readiness / 100) * 100);
}

function formationSustainment(formation: CampaignRuntimeState["formations"][string]): number {
  const values = [formation.supply.rations, formation.supply.parts];
  if (formation.supply.ammo > 0) values.push(formation.supply.ammo);
  if (formation.supply.fuel > 0) values.push(formation.supply.fuel);
  return clampPercent(values.reduce((sum, value) => sum + clampPercent(value), 0) / Math.max(1, values.length));
}

function projectFriendlyFormations(
  source: CampaignRuntimeState,
  faction: CampaignFactionKey
): CampaignAIFriendlyFormationView[] {
  return source.formationOrder.flatMap((formationId) => {
    const formation = source.formations[formationId];
    if (!formation || formation.faction !== faction) return [];
    const unitType = formation.campaignUnitType.toLowerCase();
    return [{
      id: formation.id,
      name: formation.name,
      campaignUnitType: formation.campaignUnitType,
      locationHexKey: formation.locationHexKey,
      status: formation.status,
      effectiveStrengthPercent: effectiveFormationStrength(formation),
      readiness: clampPercent(formation.readiness),
      cohesion: clampPercent(formation.cohesion),
      fatigue: clampPercent(formation.fatigue),
      sustainmentPercent: formationSustainment(formation),
      mobile: /tank|panzer|motor|mechan|truck|recon|air|fighter|bomber|ship|naval/.test(unitType),
      hasActiveOrder: formation.currentOrderId !== null
    }];
  });
}

function objectiveRequiredFaction(
  source: CampaignRuntimeState,
  objective: CampaignScenarioDefinition["objectives"][number]
): CampaignFactionKey {
  const controlCondition = objective.conditions?.find((condition) => condition.kind === "controlHex");
  if (controlCondition?.kind === "controlHex") return controlCondition.faction ?? "Player";
  const resourceCondition = objective.conditions?.find((condition) => condition.kind === "resourceThreshold");
  if (resourceCondition?.kind === "resourceThreshold") return resourceCondition.faction ?? "Player";
  const formationCondition = objective.conditions?.find((condition) => condition.kind === "formationStrength" || condition.kind === "formationStatus");
  if (formationCondition?.kind === "formationStrength" || formationCondition?.kind === "formationStatus") {
    return source.formations[formationCondition.formationId]?.faction ?? "Player";
  }
  return "Player";
}

function projectAIObjectives(
  source: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  map: CampaignMapViewModel
): CampaignAIObjectiveView[] {
  const presentations = projectCampaignObjectives(structuredClone(source), definition);
  return presentations.flatMap((presentation) => {
    if (!presentation.visible) return [];
    const objective = definition.objectives.find((candidate) => candidate.key === presentation.key);
    if (!objective) return [];
    const tile = map.scenario.tiles.find((candidate) => candidate.hex.q === objective.hex.q && candidate.hex.r === objective.hex.r);
    const controller = tile?.factionControl
      ?? (tile ? map.scenario.tilePalette[tile.tile]?.factionControl : undefined)
      ?? objective.owner;
    const controlRelevant = !objective.conditions || objective.conditions.length === 0
      || objective.conditions.some((condition) => condition.kind === "controlHex");
    return [{
      key: objective.key,
      label: objective.label,
      runtimeHexKey: `${objective.hex.q},${objective.hex.r}`,
      owner: objective.owner,
      requiredFaction: objectiveRequiredFaction(source, objective),
      controlRelevant,
      currentController: controller,
      category: presentation.category,
      status: presentation.status,
      progress: presentation.progress,
      deadlineSegment: presentation.deadlineSegment,
      score: presentation.score
    }];
  });
}

/** Narrows the general segment view to the only fields strategic assessment is permitted to consume. */
export function buildCampaignAIAssessmentInput(view: CampaignFrozenFactionView): CampaignAIAssessmentInput {
  return deepFreeze({
    faction: view.faction,
    campaignId: view.campaignId,
    sourceRevision: view.sourceRevision,
    sourceSegment: view.sourceSegment,
    economy: structuredClone(view.economy),
    orders: structuredClone(view.orders),
    friendlyFormations: structuredClone(view.friendlyFormations),
    objectives: structuredClone(view.objectives),
    campaign: structuredClone(view.campaign),
    operationalPicture: {
      observerFaction: view.map.observerFaction,
      enemyContacts: structuredClone(view.map.enemyContacts),
      coverage: structuredClone(view.map.coverage),
      capacity: structuredClone(view.map.capacity),
      unreadReportCount: view.map.unreadReportCount,
      currentSegment: view.map.currentSegment
    }
  });
}

/** Narrows one frozen faction boundary plus its assessment into the only legal planner input. */
export function buildCampaignAIPlanningInput(
  view: CampaignFrozenFactionView,
  assessment: CampaignAITheaterAssessment,
  previousRecord: CampaignAIPlanningRecord | null = null
): CampaignAIPlanningInput {
  return deepFreeze({
    faction: view.faction,
    campaignId: view.campaignId,
    sourceRevision: view.sourceRevision,
    sourceSegment: view.sourceSegment,
    generatedSegment: assessment.generatedSegment,
    assessment: structuredClone(assessment),
    friendlyFormations: structuredClone(view.friendlyFormations),
    economy: structuredClone(view.economy),
    availableCollectionCapacity: view.map.capacity.available,
    previousRecord: previousRecord ? structuredClone(previousRecord) : null
  });
}

/** Builds legal per-faction projections from only the authoritative source boundary. */
export function buildCampaignFrozenFactionViews(
  source: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): readonly CampaignFrozenFactionView[] {
  const projection = projectLegacyCampaignState(definition, source);
  return source.factionOrder.map((faction) => {
    const factionState = source.factions[faction];
    const knowledge = source.knowledgeByFaction[faction];
    if (!factionState || !knowledge) {
      throw new CampaignRuntimeError("INVALID_RUNTIME", `Cannot freeze missing faction state for ${faction}.`, { faction });
    }
    const map = buildCampaignMapView(projection.scenario, knowledge, source.currentSegment);
    const view: CampaignFrozenFactionView = {
      faction,
      campaignId: source.campaignId,
      sourceRevision: source.revision,
      sourceSegment: source.currentSegment,
      economy: structuredClone(factionState.economy),
      map,
      orders: source.orderOrder
        .map((id) => source.orders[id])
        .filter((order): order is CampaignOrder => Boolean(order) && order.faction === faction)
        .map((order) => structuredClone(order)),
      friendlyFormations: projectFriendlyFormations(source, faction),
      objectives: projectAIObjectives(source, definition, map),
      campaign: {
        phaseKey: source.campaignPhaseKey ?? "operation",
        score: structuredClone(source.campaignScore ?? {
          earned: 0,
          available: 0,
          percent: 0,
          projectedGrade: "costlyVictory"
        })
      }
    };
    return deepFreeze(view);
  });
}

function frozenViewCheckpoints(views: readonly CampaignFrozenFactionView[]): CampaignFrozenFactionViewCheckpoint[] {
  return views.map((view) => ({
    faction: view.faction,
    sourceRevision: view.sourceRevision,
    sourceSegment: view.sourceSegment,
    contentHash: computeCampaignContentHash(view)
  }));
}

function stableUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function normalizeAllocation(economy: CampaignFactionEconomy): ProductionAllocation {
  return economy.productionAllocation ? structuredClone(economy.productionAllocation) : { ...DEFAULT_PRODUCTION_ALLOCATION };
}

function incrementEconomy(economy: CampaignFactionEconomy, output: ProductionAllocation): void {
  economy.supplies += output.supplies;
  economy.fuel += output.fuel;
  economy.ammo += output.ammo;
  economy.manpower += output.manpower;
}

/** Applies daily theater-support deliveries using only control and allocation frozen at the start of the boundary. */
function resolveLogistics(
  source: CampaignRuntimeState,
  candidate: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  targetSegment: number,
  events: CampaignDomainEventDraft[]
): string[] {
  if (targetSegment % 8 !== 0) return [];
  const capacityByFaction = new Map<string, number>();
  source.tileOrder.forEach((hexKey) => {
    const tile = source.tiles[hexKey];
    const sourceDefinition = definition.map.tilePalette[tile?.tileKey ?? ""];
    const productionCapacity = (tile?.controller === sourceDefinition?.factionControl
      ? sourceDefinition.productionCapacity ?? 0
      : 0)
      * (tile ? campaignTileCapacityFactor(tile) : 1);
    if (tile && productionCapacity > 0) {
      capacityByFaction.set(String(tile.controller), (capacityByFaction.get(String(tile.controller)) ?? 0) + productionCapacity);
    }
  });

  const affected: string[] = [];
  source.factionOrder.forEach((faction) => {
    const frozenEconomy = source.factions[faction]?.economy;
    const economy = candidate.factions[faction]?.economy;
    if (!frozenEconomy || !economy) return;
    const capacity = capacityByFaction.get(faction) ?? 0;
    const output = faction === "Bot"
      ? { supplies: capacity, fuel: Math.round(capacity * 0.8), ammo: 0, manpower: Math.round(capacity * 100) }
      : computeDailyProduction(capacity, normalizeAllocation(frozenEconomy));
    incrementEconomy(economy, output);
    affected.push(faction);
    events.push({
      type: "stateChanged",
      category: "logistics",
      summary: `${faction} daily theater support delivered.`,
      details: {
        faction,
        capacity,
        supplies: output.supplies,
        fuel: output.fuel,
        ammo: output.ammo,
        manpower: output.manpower
      }
    });
  });
  return affected;
}

function selectedQuantities(decision: CampaignDecision): Array<{ unitType: string; count: number }> {
  const entries = Array.isArray(decision.payload.selections) ? decision.payload.selections : [];
  const totals = new Map<string, number>();
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const unitType = String((entry as { unitType?: unknown }).unitType ?? "");
    const count = Number((entry as { count?: unknown }).count ?? 0);
    if (unitType && Number.isInteger(count) && count > 0) totals.set(unitType, (totals.get(unitType) ?? 0) + count);
  });
  return Array.from(totals, ([unitType, count]) => ({ unitType, count })).sort((a, b) => a.unitType.localeCompare(b.unitType));
}

function releaseTransport(candidate: CampaignRuntimeState, decision: CampaignDecision): string | null {
  const capacity = decision.payload.capacityReserved as { type?: unknown; count?: unknown } | undefined;
  const type = typeof capacity?.type === "string" ? capacity.type : null;
  const count = Number(capacity?.count ?? 0);
  const economy = candidate.factions[String(decision.faction)]?.economy;
  if (!type || !Number.isFinite(count) || count <= 0 || !economy?.transportCapacity) return null;
  const key = `${type}InTransit` as keyof typeof economy.transportCapacity;
  const current = Number(economy.transportCapacity[key] ?? 0);
  (economy.transportCapacity[key] as number) = Math.max(0, current - count);
  return `${decision.faction}:${type}`;
}

function releaseExactRedeploymentFormations(candidate: CampaignRuntimeState, decision: CampaignDecision): string[] {
  const orderId = typeof decision.payload.typedOrderId === "string" ? decision.payload.typedOrderId : null;
  const formationIds = Array.isArray(decision.payload.formationIds)
    ? decision.payload.formationIds.filter((value): value is string => typeof value === "string")
    : [];
  formationIds.forEach((formationId) => {
    const formation = candidate.formations[formationId];
    if (!formation || (formation.currentOrderId !== null && formation.currentOrderId !== orderId)) return;
    if (formation.currentOrderId === orderId) formation.currentOrderId = null;
    if (formation.status === "inTransit") formation.status = "ready";
  });
  return formationIds;
}

/** Calculates due moves from frozen forces, then applies all force changes as one net delta. */
function resolveMovement(
  source: CampaignRuntimeState,
  candidate: CampaignRuntimeState,
  targetSegment: number,
  events: CampaignDomainEventDraft[]
): string[] {
  const decisions = source.compatibility.queuedDecisions
    .filter((decision) => decision.type === "redeploy")
    .slice()
    .sort((a, b) => {
      const etaA = Number(a.payload.etaSegment ?? a.payload.etaDay ?? Number.MAX_SAFE_INTEGER);
      const etaB = Number(b.payload.etaSegment ?? b.payload.etaDay ?? Number.MAX_SAFE_INTEGER);
      return etaA - etaB || a.id.localeCompare(b.id);
    });
  const allocated = new Map<string, number>();
  const plans: MovementPlan[] = [];
  const updates = new Map<string, CampaignDecision>();
  const affected: string[] = [];

  decisions.forEach((decision) => {
    const status = String(decision.payload.status ?? "queued");
    const eta = Number(decision.payload.etaSegment ?? decision.payload.etaDay ?? Number.NaN);
    const returnEta = Number(decision.payload.returnEtaSegment ?? decision.payload.returnEtaDay ?? Number.NaN);
    if (status === "arrived" && Number.isFinite(returnEta) && returnEta <= targetSegment) {
      releaseTransport(candidate, decision);
      updates.set(decision.id, {
        ...structuredClone(decision),
        payload: { ...structuredClone(decision.payload), status: "completed", completedSegment: targetSegment }
      });
      affected.push(decision.id);
      events.push({
        type: "stateChanged",
        category: "movement",
        summary: `Transport returned for redeployment ${decision.id}.`,
        details: { decisionId: decision.id, faction: decision.faction }
      });
      return;
    }
    if (status !== "queued" || !Number.isFinite(eta) || eta > targetSegment) return;

    const origin = campaignOffsetKeyToRuntimeHexKey(String(decision.payload.originOffsetKey ?? ""));
    const destination = campaignOffsetKeyToRuntimeHexKey(String(decision.payload.destOffsetKey ?? ""));
    if (!origin || !destination || !source.tiles[origin] || !source.tiles[destination]) {
      updates.set(decision.id, {
        ...structuredClone(decision),
        payload: { ...structuredClone(decision.payload), status: "blocked", blockedSegment: targetSegment }
      });
      affected.push(decision.id);
      affected.push(...releaseExactRedeploymentFormations(candidate, decision));
      releaseTransport(candidate, decision);
      events.push({
        type: "stateChanged",
        category: "movement",
        summary: `Redeployment ${decision.id} was blocked before arrival.`,
        details: { decisionId: decision.id, faction: decision.faction, reason: "missing-route-endpoint" }
      });
      return;
    }

    const typedOrderId = typeof decision.payload.typedOrderId === "string" ? decision.payload.typedOrderId : null;
    const exactFormationPayload = Array.isArray(decision.payload.formationIds) ? decision.payload.formationIds : null;
    const hasExactFormationCommitment = exactFormationPayload !== null;
    const exactFormationIds = exactFormationPayload
      ? exactFormationPayload.filter((value): value is string => typeof value === "string")
      : [];
    const moving: Record<string, number> = {};
    if (hasExactFormationCommitment) {
      const exactByType = new Map<string, number>();
      const requestedByType = new Map(selectedQuantities(decision).map(({ unitType, count }) => [unitType, count]));
      const exactValid = exactFormationIds.length > 0
        && exactFormationIds.length === exactFormationPayload.length
        && new Set(exactFormationIds).size === exactFormationIds.length
        && exactFormationIds.every((formationId) => {
          const formation = source.formations[formationId];
          if (!formation
            || formation.faction !== decision.faction
            || formation.locationHexKey !== origin
            || formation.currentOrderId !== typedOrderId
            || formation.status !== "inTransit") return false;
          exactByType.set(formation.campaignUnitType, (exactByType.get(formation.campaignUnitType) ?? 0) + 1);
          return true;
        })
        && requestedByType.size === exactByType.size
        && [...requestedByType].every(([unitType, count]) => exactByType.get(unitType) === count);
      if (!exactValid) {
        updates.set(decision.id, {
          ...structuredClone(decision),
          payload: { ...structuredClone(decision.payload), status: "blocked", blockedSegment: targetSegment }
        });
        affected.push(decision.id);
        affected.push(...releaseExactRedeploymentFormations(candidate, decision));
        releaseTransport(candidate, decision);
        events.push({
          type: "stateChanged",
          category: "movement",
          summary: `Redeployment ${decision.id} lost its exact formation commitment before arrival.`,
          details: { decisionId: decision.id, faction: decision.faction, reason: "exact-formation-unavailable" }
        });
        return;
      }
      exactByType.forEach((count, unitType) => { moving[unitType] = count; });
    } else {
      selectedQuantities(decision).forEach(({ unitType, count }) => {
        const pool = `${origin}|${unitType}`;
        const available = source.tiles[origin].forces
          .filter((force) => force.unitType === unitType)
          .reduce((sum, force) => sum + force.count, 0);
        const quantity = Math.max(0, Math.min(count, available - (allocated.get(pool) ?? 0)));
        if (quantity > 0) {
          moving[unitType] = quantity;
          allocated.set(pool, (allocated.get(pool) ?? 0) + quantity);
        }
      });
      if (Object.keys(moving).length === 0) {
        updates.set(decision.id, {
          ...structuredClone(decision),
          payload: { ...structuredClone(decision.payload), status: "blocked", blockedSegment: targetSegment }
        });
        affected.push(decision.id);
        releaseTransport(candidate, decision);
        events.push({
          type: "stateChanged",
          category: "movement",
          summary: `Redeployment ${decision.id} had no start-of-segment force available.`,
          details: { decisionId: decision.id, faction: decision.faction, reason: "frozen-force-unavailable" }
        });
        return;
      }
    }
    plans.push({
      decisionId: decision.id,
      faction: decision.faction,
      originHexKey: origin,
      destinationHexKey: destination,
      moving,
      formationIds: exactFormationIds,
      hasExactFormationCommitment,
      returnDue: Number.isFinite(returnEta) && returnEta <= targetSegment
    });
  });

  const forceDeltas = new Map<string, Map<string, number>>();
  const addDelta = (hexKey: string, unitType: string, amount: number): void => {
    const tileDeltas = forceDeltas.get(hexKey) ?? new Map<string, number>();
    tileDeltas.set(unitType, (tileDeltas.get(unitType) ?? 0) + amount);
    forceDeltas.set(hexKey, tileDeltas);
  };
  plans.forEach((plan) => {
    if (plan.hasExactFormationCommitment) return;
    Object.entries(plan.moving).forEach(([unitType, count]) => {
      addDelta(plan.originHexKey, unitType, -count);
      addDelta(plan.destinationHexKey, unitType, count);
    });
  });
  plans.forEach((plan) => {
    plan.formationIds.forEach((formationId) => {
      const formation = candidate.formations[formationId];
      if (!formation) return;
      formation.currentOrderId = null;
      if (!relocateCampaignFormation(
        candidate,
        formationId,
        plan.destinationHexKey,
        targetSegment,
        `${formation.name} completed redeployment from ${plan.originHexKey} to ${plan.destinationHexKey}.`
      )) {
        throw new Error(`Exact redeployment formation ${formationId} could not arrive at ${plan.destinationHexKey}.`);
      }
      affected.push(formationId);
    });
  });
  if (plans.length > 0 || updates.size > 0) {
    synchronizeCampaignFormationForceProjection(candidate);
  }
  forceDeltas.forEach((deltas, hexKey) => {
    const tile = candidate.tiles[hexKey];
    if (!tile) return;
    const quantities = new Map<string, number>();
    tile.forces.forEach((force) => quantities.set(force.unitType, (quantities.get(force.unitType) ?? 0) + force.count));
    deltas.forEach((delta, unitType) => quantities.set(unitType, (quantities.get(unitType) ?? 0) + delta));
    tile.forces = Array.from(quantities, ([unitType, count]) => ({ unitType, count }))
      .filter((force) => force.count > 0)
      .sort((a, b) => a.unitType.localeCompare(b.unitType));
    affected.push(hexKey);
  });

  plans.forEach((plan) => {
    const decision = source.compatibility.queuedDecisions.find((entry) => entry.id === plan.decisionId);
    if (!decision) return;
    const destination = candidate.tiles[plan.destinationHexKey];
    if (destination.controller === "Neutral") {
      destination.controller = plan.faction;
      destination.controlSinceSegment = targetSegment;
    }
    if (plan.returnDue) releaseTransport(candidate, decision);
    updates.set(decision.id, {
      ...structuredClone(decision),
      payload: {
        ...structuredClone(decision.payload),
        status: plan.returnDue ? "completed" : "arrived",
        arrivedSegment: targetSegment,
        ...(plan.returnDue ? { completedSegment: targetSegment } : {})
      }
    });
    affected.push(decision.id, plan.destinationHexKey);
    events.push({
      type: "stateChanged",
      category: "movement",
      summary: `Redeployment ${decision.id} arrived.`,
      details: {
        decisionId: decision.id,
        faction: decision.faction,
        originHexKey: plan.originHexKey,
        destinationHexKey: plan.destinationHexKey
      }
    });
  });

  candidate.compatibility.queuedDecisions = candidate.compatibility.queuedDecisions
    .map((decision) => updates.get(decision.id) ?? decision);
  if (plans.length > 0 || updates.size > 0) {
    const reconciled = reconcileCampaignFormationForceCounts(candidate, targetSegment, "segment redeployment arrival");
    affected.push(
      ...reconciled.createdFormationIds,
      ...reconciled.movedFormationIds,
      ...reconciled.retiredFormationIds
    );
  }
  return stableUnique(affected);
}

/** Recomputes current derived air/naval/intelligence power from post-movement theater truth. */
function updateDerivedPower(candidate: CampaignRuntimeState, definition: CampaignScenarioDefinition): string[] {
  const stats = new Map<string, { airbases: number; navalBases: number; bases: number; aircraft: number; ships: number }>();
  candidate.factionOrder.forEach((faction) => stats.set(faction, { airbases: 0, navalBases: 0, bases: 0, aircraft: 0, ships: 0 }));
  candidate.tileOrder.forEach((hexKey) => {
    const tile = candidate.tiles[hexKey];
    const palette = definition.map.tilePalette[tile.tileKey];
    const value = stats.get(String(tile.controller));
    if (!palette || !value) return;
    const infrastructureFactor = campaignTileCapacityFactor(tile);
    if (palette.role === "airbase") value.airbases += infrastructureFactor;
    if (palette.role === "navalBase") value.navalBases += infrastructureFactor;
    if (["airbase", "navalBase", "logisticsHub", "intelNode", "fortificationHeavy", "fortificationLight"].includes(palette.role)) {
      value.bases += infrastructureFactor;
    }
    tile.forces.forEach((force) => {
      const unit = force.unitType.toLowerCase();
      if (unit.includes("fighter") || unit.includes("bomber")) value.aircraft += force.count;
      if (unit.includes("ship") || unit.includes("battleship") || unit.includes("destroyer")) value.ships += force.count;
    });
  });
  candidate.factionOrder.forEach((faction) => {
    const economy = candidate.factions[faction]?.economy;
    const value = stats.get(faction);
    if (!economy || !value) return;
    economy.airPower = Math.round(value.airbases * 10 + value.aircraft);
    economy.navalPower = Math.round(value.navalBases * 10 + value.ships);
    economy.intelCoverage = Math.round(value.bases * 2);
  });
  return [...candidate.factionOrder];
}

function resolveIntelligence(
  candidate: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  targetSegment: number,
  events: CampaignDomainEventDraft[]
): string[] {
  const scenario = projectLegacyCampaignState(definition, candidate).scenario;
  const bot = candidate.knowledgeByFaction.Bot;
  const botEconomy = candidate.factions.Bot?.economy;
  if (bot && botEconomy) {
    const operation = scheduleBaselineBotOperation(scenario, bot, targetSegment);
    if (operation && botEconomy.supplies >= operation.suppliesCost && botEconomy.fuel >= operation.fuelCost) {
      botEconomy.supplies -= operation.suppliesCost;
      botEconomy.fuel -= operation.fuelCost;
      bot.operations.push(operation);
    }
  }
  candidate.knowledgeByFaction = resolveCampaignIntelligenceSegment(
    scenario,
    candidate.knowledgeByFaction,
    targetSegment
  );
  events.push({
    type: "stateChanged",
    category: "intelligence",
    summary: "Campaign intelligence cycle resolved.",
    details: { segment: targetSegment, factionCount: candidate.factionOrder.length }
  });
  return [...candidate.factionOrder];
}

function resolveAIAssessments(
  candidate: CampaignRuntimeState,
  frozenViews: readonly CampaignFrozenFactionView[],
  targetSegment: number,
  events: CampaignDomainEventDraft[]
): string[] {
  const affected: string[] = [];
  candidate.aiAssessmentsByFaction ??= {};
  candidate.aiPlanningByFaction ??= {};
  candidate.aiBehaviorsByFaction ??= {};
  frozenViews
    .filter((view) => view.faction !== "Player" && view.faction !== "Neutral")
    .forEach((view) => {
      const assessment = assessCampaignAITheater(buildCampaignAIAssessmentInput(view));
      if (assessment.generatedSegment !== targetSegment) {
        throw new CampaignRuntimeError(
          "TRANSACTION_FAILED",
          `AI assessment ${assessment.id} was generated for segment ${assessment.generatedSegment}, expected ${targetSegment}.`,
          { assessmentId: assessment.id, targetSegment }
        );
      }
      candidate.aiAssessmentsByFaction![String(view.faction)] = assessment;
      const previousPlanning = candidate.aiPlanningByFaction![String(view.faction)] ?? null;
      const planning = planCampaignAIOperations(buildCampaignAIPlanningInput(view, assessment, previousPlanning));
      candidate.aiPlanningByFaction![String(view.faction)] = planning;
      const previousBehavior = candidate.aiBehaviorsByFaction![String(view.faction)] ?? null;
      const behavior = executeCampaignAIPlanPortfolio(candidate, planning, previousBehavior);
      candidate.aiBehaviorsByFaction![String(view.faction)] = behavior;
      affected.push(assessment.id, planning.id, behavior.id, ...behavior.committedOrderIds);
      events.push({
        type: "stateChanged",
        category: "system",
        summary: "Operational command cycle completed.",
        details: {
          faction: String(view.faction),
          assessmentId: assessment.id,
          planningId: planning.id,
          behaviorId: behavior.id,
          sourceSegment: assessment.sourceSegment,
          generatedSegment: assessment.generatedSegment
        }
      });
    });
  return affected;
}

function resolveFrontControl(
  candidate: CampaignRuntimeState,
  targetSegment: number,
  events: CampaignDomainEventDraft[]
): string[] {
  const before = computeCampaignContentHash(candidate.compatibility.initialFronts);
  const fronts = deriveCampaignFrontsFromControl(candidate);
  const after = computeCampaignContentHash(fronts);
  if (before === after) return [];
  candidate.compatibility.initialFronts.splice(
    0,
    candidate.compatibility.initialFronts.length,
    ...structuredClone(fronts)
  );
  const affected = stableUnique(fronts.flatMap((front) => [
    front.key,
    ...(front.edges ?? []).flatMap((edge) => [
      campaignOffsetKeyToRuntimeHexKey(edge.friendlyHexKey),
      campaignOffsetKeyToRuntimeHexKey(edge.opposingHexKey)
    ])
  ]).filter((key): key is string => key !== null));
  events.push({
    type: "stateChanged",
    category: "control",
    summary: "Campaign fronts were rebuilt from opposing tile-control adjacency.",
    details: { segment: targetSegment, frontCount: fronts.length }
  });
  return affected;
}

/** Recomputes time-sensitive facility capacity immediately after the campaign clock changes. */
function resolveInfrastructureEnvironment(candidate: CampaignRuntimeState, targetSegment: number): string[] {
  const affected: string[] = [];
  candidate.tileOrder.forEach((hexKey) => {
    const infrastructure = candidate.tiles[hexKey]?.infrastructure;
    if (!infrastructure) return;
    const before = infrastructure.effectiveness;
    refreshCampaignInfrastructureState(infrastructure, targetSegment);
    if (before !== infrastructure.effectiveness) affected.push(hexKey);
  });
  return affected;
}

/** Advances committed facility reconstruction after this segment's frozen logistics delivery. */
function resolveInfrastructureRepairs(
  candidate: CampaignRuntimeState,
  targetSegment: number,
  events: CampaignDomainEventDraft[]
): string[] {
  const affected: string[] = [];
  candidate.orderOrder.forEach((orderId) => {
    const order = candidate.orders[orderId];
    if (!order || order.kind !== "infrastructureRepair"
      || (order.status !== "committed" && order.status !== "executing")
      || targetSegment < order.payload.startSegment) return;
    const tile = candidate.tiles[order.payload.targetRuntimeHexKey];
    const infrastructure = tile?.infrastructure;
    const engineer = candidate.formations[order.payload.engineerFormationId];
    const blockedReason = !tile || tile.controller !== order.faction
      ? "facility-control-lost"
      : !infrastructure || infrastructure.activeRepairOrderId !== order.id
        ? "facility-unavailable"
        : !engineer || engineer.faction !== order.faction || engineer.locationHexKey !== tile.hexKey
          || engineer.currentOrderId !== order.id || engineer.status !== "ready"
          ? "engineering-supervision-lost"
          : null;
    if (blockedReason) {
      order.status = "blocked";
      if (infrastructure?.activeRepairOrderId === order.id) infrastructure.activeRepairOrderId = null;
      if (engineer?.currentOrderId === order.id) engineer.currentOrderId = null;
      releaseCompletedReservationKinds(candidate, order);
      affected.push(order.id, order.payload.targetRuntimeHexKey, order.payload.engineerFormationId);
      events.push({
        type: "stateChanged",
        category: "logistics",
        summary: `Facility repair ${order.id} was interrupted.`,
        details: { orderId: order.id, hexKey: order.payload.targetRuntimeHexKey, reason: blockedReason }
      });
      return;
    }
    if (!tile || !infrastructure || !engineer) return;
    const integrityBefore = infrastructure.integrity;
    infrastructure.integrity = Math.min(
      order.payload.targetIntegrity,
      infrastructure.integrity + order.payload.repairRate
    );
    infrastructure.lastRepairSegment = targetSegment;
    refreshCampaignInfrastructureState(infrastructure, targetSegment);
    const completed = infrastructure.integrity >= order.payload.targetIntegrity;
    order.status = completed ? "completed" : "executing";
    if (completed) {
      infrastructure.activeRepairOrderId = null;
      if (engineer.currentOrderId === order.id) engineer.currentOrderId = null;
      releaseCompletedReservationKinds(candidate, order);
    }
    affected.push(order.id, tile.hexKey, engineer.id);
    events.push({
      type: "stateChanged",
      category: "logistics",
      summary: completed
        ? `${infrastructure.role} reconstruction completed at ${tile.hexKey}.`
        : `${infrastructure.role} reconstruction advanced at ${tile.hexKey}.`,
      details: {
        orderId: order.id,
        hexKey: tile.hexKey,
        integrityBefore,
        integrityAfter: infrastructure.integrity,
        effectiveness: infrastructure.effectiveness,
        completed
      }
    });
  });
  return stableUnique(affected);
}

/** Recovery shares the consequences transaction and never advances from reads or compatibility hydration. */
function resolveFormationRecoveries(
  candidate: CampaignRuntimeState, definition: CampaignScenarioDefinition, targetSegment: number,
  events: CampaignDomainEventDraft[]
): string[] {
  const affected: string[] = [];
  candidate.orderOrder.forEach((id) => {
    const order = candidate.orders[id];
    if (!order || order.kind !== "formationRecovery" || (order.status !== "committed" && order.status !== "executing")
      || targetSegment < order.payload.startSegment) return;
    const reason = campaignFormationRecoveryInterruption(candidate, definition, order);
    if (reason) {
      order.status = "blocked";
      order.validation = { valid: false, validatedRevision: candidate.revision,
        issues: [{ code: "ORDER_RECOVERY_INVALID", message: reason, reservationId: null }] };
      releaseCampaignFormationRecovery(candidate, order);
      releaseCompletedReservationKinds(candidate, order);
    } else {
      const complete = advanceCampaignFormationRecovery(candidate, order, targetSegment);
      order.status = complete ? "completed" : "executing";
      if (complete) releaseCompletedReservationKinds(candidate, order);
    }
    affected.push(order.id, order.payload.formationId, order.payload.sourceRuntimeHexKey);
    events.push({
      type: "stateChanged", category: "logistics",
      summary: reason ?? (order.status === "completed" ? "Formation recovery completed." : "Formation recovery progressed."),
      details: { orderId: id, formationId: order.payload.formationId, hexKey: order.payload.sourceRuntimeHexKey,
        completedSegments: order.payload.progress.completedSegments, status: order.status }
    });
  });
  synchronizeCampaignFormationForceProjection(candidate);
  return stableUnique(affected);
}

function releaseCompletedReservationKinds(candidate: CampaignRuntimeState, order: CampaignOrder): void {
  order.reservationIds.forEach((reservationId) => {
    const reservation = candidate.reservations[reservationId];
    if (!reservation || reservation.kind === "resource") return;
    reservation.status = "released";
  });
}

/** Mirrors execution adapters into typed lifecycle and releases only reusable committed pools. */
function synchronizeTypedOrders(candidate: CampaignRuntimeState, definition: CampaignScenarioDefinition): string[] {
  const affected: string[] = [];
  candidate.orderOrder.forEach((orderId) => {
    const order = candidate.orders[orderId];
    if (!order || (order.status !== "committed" && order.status !== "executing")) return;
    const before = order.status;
    if (order.kind === "redeploy") {
      const decision = candidate.compatibility.queuedDecisions.find((entry) => entry.id === order.executionRefId);
      const status = String(decision?.payload.status ?? "");
      if (status === "arrived") order.status = "executing";
      if (status === "completed") order.status = "completed";
      if (status === "blocked") order.status = "blocked";
    } else if (order.kind === "production") {
      if (candidate.currentSegment >= order.payload.effectiveSegment) order.status = "completed";
    } else if (order.kind === "infrastructureRepair" || order.kind === "formationRecovery") {
      // Repair progress and terminal status are resolved in the consequences phase.
    } else {
      const operation = candidate.knowledgeByFaction[String(order.faction)]?.operations
        .find((entry) => entry.id === order.executionRefId);
      if (operation?.status === "active") order.status = "executing";
      if (operation?.status === "complete" || operation?.status === "partial") order.status = "completed";
      if (operation?.status === "aborted" || operation?.status === "compromised") order.status = "blocked";
    }
    if (order.status !== before) affected.push(order.id);
    if (order.status === "completed" || order.status === "blocked") releaseCompletedReservationKinds(candidate, order);
  });
  revalidateCampaignOrderBook(candidate, definition);
  return affected;
}

function rejectedBeforeTransaction(
  source: CampaignRuntimeState,
  error: CampaignRuntimeError,
  frozenViews: readonly CampaignFrozenFactionView[] = []
): CampaignSegmentResolutionRejected {
  return { ok: false, state: structuredClone(source), error, issues: [], frozenViews };
}

/** Resolves exactly one campaign segment through the shared revision/event/RNG transaction boundary. */
export function resolveCampaignSegment(
  source: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  options: CampaignSegmentResolverOptions = {}
): CampaignSegmentResolutionResult {
  if (source.status !== "planning") {
    return rejectedBeforeTransaction(source, new CampaignRuntimeError(
      "TRANSACTION_FAILED",
      `Campaign time cannot advance while runtime status is ${source.status}.`,
      { status: source.status, segment: source.currentSegment }
    ));
  }

  let frozenViews: readonly CampaignFrozenFactionView[];
  try {
    frozenViews = buildCampaignFrozenFactionViews(source, definition);
  } catch (error) {
    const runtimeError = error instanceof CampaignRuntimeError
      ? error
      : new CampaignRuntimeError("TRANSACTION_FAILED", `Campaign faction views could not be frozen: ${String(error)}.`);
    return rejectedBeforeTransaction(source, runtimeError);
  }
  const checkpoints = frozenViewCheckpoints(frozenViews);
  const fromSegment = source.currentSegment;
  const targetSegment = fromSegment + 1;
  const label = `segment:${fromSegment}:${targetSegment}`;

  const result = runCampaignRuntimeTransaction(source, label, (candidate) => {
    const frozenSource = structuredClone(candidate);
    const frozenScenario = projectLegacyCampaignState(definition, frozenSource).scenario;
    const events: CampaignDomainEventDraft[] = [];
    const phaseReports: CampaignSegmentPhaseReport[] = [];
    const phase = (phaseId: CampaignSegmentPhase, action: () => readonly string[]): void => {
      const eventStart = events.length;
      const affected = stableUnique(action());
      phaseReports.push({
        phase: phaseId,
        sequence: phaseReports.length,
        eventCount: events.length - eventStart,
        affectedRecordIds: affected
      });
      options.afterPhase?.(phaseId, candidate);
    };

    phase("timeBoundary", () => {
      candidate.status = "resolving";
      candidate.currentSegment = targetSegment;
      events.push({
        type: "segmentAdvanced",
        category: "system",
        summary: `Campaign advanced to segment ${targetSegment}.`,
        details: { fromSegment, toSegment: targetSegment }
      });
      const releases = releaseCampaignFormationAvailability(candidate, targetSegment);
      releases.forEach((release) => {
        events.push({
          type: "stateChanged",
          category: "movement",
          summary: release.summary,
          details: {
            faction: String(release.faction),
            hexKey: release.hexKey,
            availableFromSegment: release.availableFromSegment,
            formationCount: release.formationIds.length
          }
        });
      });
      return [candidate.campaignId, ...releases.flatMap((release) => release.formationIds)];
    });
    phase("environment", () => resolveInfrastructureEnvironment(candidate, targetSegment));
    phase("orders", () => candidate.orderOrder.filter((id) => {
      const status = candidate.orders[id]?.status;
      return status === "committed" || status === "executing";
    }));
    phase("movement", () => resolveMovement(frozenSource, candidate, targetSegment, events));
    phase("logistics", () => resolveLogistics(frozenSource, candidate, definition, targetSegment, events));
    phase("intelligence", () => [
      ...resolveIntelligence(candidate, definition, targetSegment, events),
      ...resolveAIAssessments(candidate, frozenViews, targetSegment, events)
    ]);
    phase("engagements", () => resolveCampaignAIEngagements(candidate, definition, events, frozenScenario));
    phase("consequences", () => [
      ...resolveInfrastructureRepairs(candidate, targetSegment, events),
      ...resolveFormationRecoveries(candidate, definition, targetSegment, events)
    ]);
    phase("control", () => resolveFrontControl(candidate, targetSegment, events));
    phase("objectives", () => {
      const evaluation = evaluateCampaignObjectives(candidate, definition);
      events.push(...evaluation.events);
      return evaluation.affectedObjectiveKeys;
    });
    phase("finalize", () => {
      const affected = [...updateDerivedPower(candidate, definition), ...synchronizeTypedOrders(candidate, definition)];
      if (candidate.status !== "victory" && candidate.status !== "defeat") {
        candidate.status = candidate.activeEngagementId ? "engagement" : "planning";
      }
      events.push({
        type: "stateChanged",
        category: "system",
        summary: candidate.status === "victory" || candidate.status === "defeat"
          ? `Campaign segment ${targetSegment} resolution completed with ${candidate.status}.`
          : `Campaign segment ${targetSegment} resolution completed.`,
        details: { segment: targetSegment, phaseCount: CAMPAIGN_SEGMENT_PHASE_ORDER.length, terminal: candidate.status === "victory" || candidate.status === "defeat" }
      });
      return affected;
    });

    if (options.advanceContext) {
      appendCampaignAdvanceStepRecord(frozenSource, candidate, events, options.advanceContext, label);
    }

    return {
      events,
      resolution: {
        resolutionKind: "segment",
        fromSegment,
        toSegment: targetSegment,
        frozenFactionViews: checkpoints,
        phaseReports
      }
    };
  });

  return result.ok
    ? { ...result, frozenViews }
    : { ...result, frozenViews };
}
