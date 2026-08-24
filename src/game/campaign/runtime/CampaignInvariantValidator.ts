/**
 * MODULE: CampaignInvariantValidator
 * WHAT: Validates Campaign 2.0 runtime identity, ordering, resources, forces, engagements, knowledge ownership, random state, and event history.
 * WHY: Transactions and save hydration must reject malformed truth before it can replace the last safe campaign state.
 *
 * DEPENDENCIES: CampaignRandom validates complete deterministic stream state; campaignRuntimeTypes defines state and structured issues.
 * EXPORTS: validateCampaignRuntimeState and assertCampaignRuntimeState.
 */

import { isSerializedCampaignRandomState } from "./CampaignRandom";
import {
  CAMPAIGN_RUNTIME_VERSION,
  CampaignRuntimeError,
  type CampaignInvariantIssue,
  type CampaignRuntimeState
} from "./campaignRuntimeTypes";
import {
  assertCampaignBattlePackage
} from "../engagements/CampaignEngagementLedgerService";
import { CAMPAIGN_ENGAGEMENT_LEDGER_VERSION } from "../engagements/CampaignEngagementLedgerTypes";
import { assertCampaignBattleResultPackage } from "../results/CampaignBattleResultExtractor";
import { assertCampaignBattleConsequenceReport } from "../consequences/CampaignBattleConsequenceResolver";
import {
  assertCampaignBattleControlReport,
  computeCampaignControlStateHash
} from "../control/CampaignBattleControlResolver";
import { assertCampaignBattleInfrastructureReport } from "../infrastructure/CampaignBattleInfrastructureResolver";
import { assertCampaignAfterActionReport } from "../aar/CampaignAfterActionReportService";
import {
  computeCampaignInfrastructureEffectiveness,
  deriveCampaignInfrastructureDamageState
} from "../infrastructure/CampaignInfrastructureRules";
import { computeCampaignContentHash } from "./CampaignCanonical";
import { computeCampaignAIAssessmentIntegrity } from "../ai/CampaignAIAssessmentService";
import { CAMPAIGN_AI_ASSESSMENT_VERSION } from "../ai/CampaignAIAssessmentTypes";
import { computeCampaignAIPlanningIntegrity } from "../ai/CampaignAIPlanningService";
import { CAMPAIGN_AI_PLANNING_VERSION, type CampaignAIPlanResources } from "../ai/CampaignAIPlanningTypes";
import { computeCampaignAIBehaviorIntegrity } from "../ai/CampaignAIBehaviorService";
import { CAMPAIGN_AI_BEHAVIOR_VERSION } from "../ai/CampaignAIBehaviorTypes";

/** Valid runtime status values kept in one validator-owned set. */
const CAMPAIGN_RUNTIME_STATUSES = new Set(["planning", "resolving", "engagement", "victory", "defeat"]);
const CAMPAIGN_OBJECTIVE_STATUSES = new Set(["locked", "active", "completed", "failed"]);
const CAMPAIGN_OUTCOME_GRADES = new Set(["decisiveVictory", "victory", "costlyVictory", "defeat"]);
const CAMPAIGN_ORDER_STATUSES = new Set(["draft", "committed", "executing", "blocked", "completed", "cancelled"]);
const CAMPAIGN_ORDER_KINDS = new Set(["redeploy", "production", "reconnaissance", "counterIntelligence", "infrastructureRepair"]);
const CAMPAIGN_RESERVATION_STATUSES = new Set(["proposed", "held", "consumed", "released"]);
const CAMPAIGN_RESERVATION_KINDS = new Set(["resource", "transport", "intelligenceCapacity", "formation", "asset", "productionSlot"]);
const CAMPAIGN_ADVANCE_MODES = new Set(["segment", "nextReport", "dawn", "dusk", "day"]);
const CAMPAIGN_ADVANCE_ALERT_SEVERITIES = new Set(["routine", "notable", "critical", "decisionRequired"]);
const CAMPAIGN_ADVANCE_ALERT_TARGETS = new Set(["time", "order", "intelligence", "engagement", "objective", "formation", "campaign"]);
const CAMPAIGN_ADVANCE_STOP_REASONS = new Set([
  "segmentComplete",
  "nextReport",
  "dawn",
  "dusk",
  "dayComplete",
  "pauseAfterResolution",
  "engagement",
  "objectiveChanged",
  "blockedOrder",
  "formationAtRisk",
  "campaignEnded",
  "criticalAlert",
  "resolutionFailed",
  "safetyLimit"
]);
const CAMPAIGN_AI_PLAN_KINDS = new Set([
  "defendObjective",
  "reinforceFront",
  "prepareOffensive",
  "counterattack",
  "withdraw",
  "rebuildReserve",
  "protectLogistics",
  "interdictSupply",
  "gatherIntelligence"
]);
const CAMPAIGN_FORMATION_OWNERSHIP = new Set(["core", "attached", "auxiliary"]);
const CAMPAIGN_FORMATION_STATUSES = new Set([
  "unavailable",
  "ready",
  "committed",
  "inTransit",
  "isolated",
  "refitting",
  "shattered",
  "destroyed",
  "captured"
]);
const CAMPAIGN_FORMATION_HISTORY_TYPES = new Set([
  "formed",
  "moved",
  "statusChanged",
  "battle",
  "refit",
  "upgrade",
  "honor",
  "retired"
]);
const CAMPAIGN_ENGAGEMENT_LEDGER_STATUSES = new Set([
  "opportunity",
  "planned",
  "committed",
  "inBattle",
  "resolved",
  "cancelled",
  "abandoned"
]);
const CAMPAIGN_SEGMENT_PHASES = [
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

/**
 * WHAT: Adds one structured invariant issue to the current validation report.
 * WHY: Collecting every issue gives migrations, tests, and future player recovery UI enough context to act.
 *
 * @param issues - Mutable issue accumulator local to one validation call.
 * @param issue - Complete stable issue record.
 */
function addIssue(issues: CampaignInvariantIssue[], issue: CampaignInvariantIssue): void {
  issues.push(issue);
}

/**
 * WHAT: Checks a value for non-negative finite resource semantics.
 * WHY: NaN, Infinity, and negative stocks corrupt cost validation and can escape ordinary comparisons.
 *
 * @param value - Candidate resource amount.
 * @returns True for finite numbers at or above zero.
 */
function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * WHAT: Validates that an explicit order array contains every record key exactly once.
 * WHY: Record insertion order is not a sufficient persistence contract; campaign projection and deterministic resolution need canonical explicit order.
 *
 * @param order - Explicit stable record order.
 * @param record - Corresponding keyed records.
 * @returns True when order has no duplicates and exactly matches record keys.
 */
function explicitOrderMatchesRecord<T>(order: readonly string[], record: Readonly<Record<string, T>>): boolean {
  if (new Set(order).size !== order.length) {
    return false;
  }
  const keys = Object.keys(record);
  return keys.length === order.length && order.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/**
 * WHAT: Validates one faction economy and optional capacity/allocation records.
 * WHY: Runtime construction must trap corrupt resource values before any order or consequence math consumes them.
 *
 * @param runtime - Runtime containing the faction.
 * @param factionKey - Faction record key.
 * @param issues - Validation issue accumulator.
 */
function validateFactionEconomy(runtime: CampaignRuntimeState, factionKey: string, issues: CampaignInvariantIssue[]): void {
  const faction = runtime.factions[factionKey];
  if (!faction || faction.faction !== factionKey || faction.economy.faction !== factionKey) {
    addIssue(issues, {
      code: "ECONOMY_INVALID",
      path: `factions.${factionKey}`,
      message: `Faction runtime and economy ownership must match record key ${factionKey}.`
    });
    return;
  }

  const resourceEntries: ReadonlyArray<readonly [string, unknown]> = [
    ["manpower", faction.economy.manpower],
    ["supplies", faction.economy.supplies],
    ["fuel", faction.economy.fuel],
    ["ammo", faction.economy.ammo],
    ["airPower", faction.economy.airPower],
    ["navalPower", faction.economy.navalPower],
    ["intelCoverage", faction.economy.intelCoverage]
  ];
  resourceEntries.forEach(([resource, value]) => {
    if (!isNonNegativeFinite(value)) {
      addIssue(issues, {
        code: "ECONOMY_INVALID",
        path: `factions.${factionKey}.economy.${resource}`,
        message: `${factionKey} ${resource} must be a non-negative finite number.`
      });
    }
  });

  const capacity = faction.economy.transportCapacity;
  if (capacity) {
    Object.entries(capacity).forEach(([name, value]) => {
      if (!Number.isInteger(value) || value < 0) {
        addIssue(issues, {
          code: "ECONOMY_INVALID",
          path: `factions.${factionKey}.economy.transportCapacity.${name}`,
          message: `${factionKey} transport capacity ${name} must be a non-negative integer.`
        });
      }
    });
  }

  const allocation = faction.economy.productionAllocation;
  if (allocation) {
    const allocationValues = Object.values(allocation);
    const allocationTotal = allocationValues.reduce((sum, value) => sum + value, 0);
    if (allocationValues.some((value) => !isNonNegativeFinite(value)) || Math.abs(allocationTotal - 100) > 0.0001) {
      addIssue(issues, {
        code: "ECONOMY_INVALID",
        path: `factions.${factionKey}.economy.productionAllocation`,
        message: `${factionKey} support allocation must contain non-negative finite values totaling 100.`
      });
    }
  }
}

function validBoundedPercent(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validAIResources(resources: CampaignAIPlanResources): boolean {
  return [
    resources.supplies,
    resources.fuel,
    resources.ammo,
    resources.manpower,
    resources.intelligenceCapacity
  ].every((value) => isNonNegativeFinite(value));
}

function validateAIPlanning(runtime: CampaignRuntimeState, issues: CampaignInvariantIssue[]): void {
  if (runtime.aiPlanningByFaction === undefined) return;
  if (typeof runtime.aiPlanningByFaction !== "object" || runtime.aiPlanningByFaction === null || Array.isArray(runtime.aiPlanningByFaction)) {
    addIssue(issues, {
      code: "AI_PLANNING_INVALID",
      path: "aiPlanningByFaction",
      message: "AI planning records must be a faction-keyed record when present."
    });
    return;
  }
  Object.entries(runtime.aiPlanningByFaction).forEach(([faction, planning]) => {
    const path = `aiPlanningByFaction.${faction}`;
    try {
      const assessment = runtime.aiAssessmentsByFaction?.[faction];
      const candidates = planning.portfolio.candidates;
      const selected = planning.portfolio.selectedPlans;
      const selectedPlanIds = selected.map((plan) => plan.planId);
      const assignedFormationIds = selected.flatMap((plan) => plan.assignedFormationIds);
      const heldReserveIds = planning.portfolio.heldReserveFormationIds;
      const candidateIds = candidates.map((candidate) => candidate.id);
      const validOwnership = (formationId: string): boolean => runtime.formations[formationId]?.faction === faction;
      const scalarValid = planning.version === CAMPAIGN_AI_PLANNING_VERSION
        && planning.faction === faction
        && Boolean(runtime.factions[faction])
        && faction !== "Player"
        && faction !== "Neutral"
        && planning.id.trim().length > 0
        && planning.assessmentId === assessment?.id
        && planning.sourceAssessmentIntegrity === assessment?.integrityHash
        && planning.sourceRevision === assessment?.sourceRevision
        && planning.sourceSegment === assessment?.sourceSegment
        && planning.generatedSegment === assessment?.generatedSegment
        && planning.sourceRevision < runtime.revision
        && planning.generatedSegment <= runtime.currentSegment
        && /^fnv1a32-[0-9a-f]{8}$/.test(planning.sourcePlanningHash)
        && /^fnv1a32-[0-9a-f]{8}$/.test(planning.integrityHash);
      const policyValid = ["easier", "standard", "harder"].includes(planning.policy.difficulty)
        && [
          planning.policy.planningHorizonSegments,
          planning.policy.candidateLimit,
          planning.policy.portfolioPlanLimit,
          planning.policy.commitmentSegments
        ].every((value) => Number.isInteger(value) && value > 0)
        && validBoundedPercent(planning.policy.minimumPlanScore)
        && validBoundedPercent(planning.policy.riskTolerance)
        && candidates.length <= planning.policy.candidateLimit
        && selected.length <= planning.policy.portfolioPlanLimit;
      const candidatesValid = new Set(candidateIds).size === candidateIds.length
        && candidates.every((candidate) => candidate.id.trim().length > 0
          && candidate.signature.trim().length > 0
          && CAMPAIGN_AI_PLAN_KINDS.has(candidate.kind)
          && candidate.targetHexKey.trim().length > 0
          && Number.isInteger(candidate.requestedFormationCount)
          && candidate.requestedFormationCount >= 0
          && Number.isInteger(candidate.durationSegments)
          && candidate.durationSegments > 0
          && validBoundedPercent(candidate.score)
          && validAIResources(candidate.resources)
          && candidate.preferredFormationIds.every(validOwnership)
          && new Set(candidate.preferredFormationIds).size === candidate.preferredFormationIds.length
          && Object.values(candidate.scoreBreakdown).every((value) => validBoundedPercent(value)));
      const selectedValid = new Set(selectedPlanIds).size === selectedPlanIds.length
        && new Set(assignedFormationIds).size === assignedFormationIds.length
        && selected.every((plan) => plan.planId.trim().length > 0
          && candidateIds.includes(plan.candidateId)
          && CAMPAIGN_AI_PLAN_KINDS.has(plan.kind)
          && plan.targetHexKey.trim().length > 0
          && plan.assignedFormationIds.every(validOwnership)
          && validAIResources(plan.resources)
          && validBoundedPercent(plan.score)
          && Number.isInteger(plan.startedSegment)
          && plan.startedSegment <= plan.lastReviewedSegment
          && plan.lastReviewedSegment === planning.generatedSegment
          && plan.commitmentUntilSegment >= plan.startedSegment);
      const reserveValid = heldReserveIds.every(validOwnership)
        && new Set(heldReserveIds).size === heldReserveIds.length
        && heldReserveIds.every((id) => !assignedFormationIds.includes(id));
      const memoryValid = computeCampaignContentHash(planning.memory.activePlans) === computeCampaignContentHash(selected)
        && planning.memory.recentPlans.length <= 12
        && planning.memory.recentPlans.every((plan) => CAMPAIGN_AI_PLAN_KINDS.has(plan.kind)
          && ["superseded", "completed", "failed", "aborted"].includes(plan.outcome)
          && Number.isInteger(plan.startedSegment)
          && Number.isInteger(plan.retiredSegment)
          && plan.retiredSegment >= plan.startedSegment
          && validBoundedPercent(plan.finalScore))
        && Object.values(planning.memory.repetitionBySignature).every((count) => Number.isInteger(count) && count >= 0 && count <= 4);
      const resourcesValid = validAIResources(planning.portfolio.resourceBudget)
        && validAIResources(planning.portfolio.resourceCommitted)
        && validBoundedPercent(planning.portfolio.score);
      let integrityValid = false;
      try {
        integrityValid = computeCampaignAIPlanningIntegrity(planning) === planning.integrityHash;
      } catch {
        integrityValid = false;
      }
      if (!scalarValid || !policyValid || !candidatesValid || !selectedValid || !reserveValid || !memoryValid || !resourcesValid || !integrityValid) {
        addIssue(issues, {
          code: "AI_PLANNING_INVALID",
          path,
          message: `AI planning for ${faction} must retain valid ownership, timing, candidates, commitments, memory, and integrity.`
        });
      }
    } catch {
      addIssue(issues, {
        code: "AI_PLANNING_INVALID",
        path,
        message: `AI planning for ${faction} is incomplete or malformed.`
      });
    }
  });
}

function validateAIBehaviors(runtime: CampaignRuntimeState, issues: CampaignInvariantIssue[]): void {
  if (runtime.aiBehaviorsByFaction === undefined) return;
  if (typeof runtime.aiBehaviorsByFaction !== "object" || runtime.aiBehaviorsByFaction === null || Array.isArray(runtime.aiBehaviorsByFaction)) {
    addIssue(issues, {
      code: "AI_BEHAVIOR_INVALID",
      path: "aiBehaviorsByFaction",
      message: "AI behavior records must be a faction-keyed record when present."
    });
    return;
  }
  Object.entries(runtime.aiBehaviorsByFaction).forEach(([faction, behavior]) => {
    const path = `aiBehaviorsByFaction.${faction}`;
    try {
      const planning = runtime.aiPlanningByFaction?.[faction];
      const planIds = planning?.portfolio.selectedPlans.map((plan) => plan.planId) ?? [];
      const directivePlanIds = behavior.directives.map((directive) => directive.planId);
      const directiveOrderIds = behavior.directives.flatMap((directive) => directive.orderIds);
      const scalarValid = behavior.version === CAMPAIGN_AI_BEHAVIOR_VERSION
        && behavior.faction === faction
        && faction !== "Player"
        && faction !== "Neutral"
        && behavior.planningId === planning?.id
        && behavior.sourceRevision === planning?.sourceRevision
        && behavior.sourceSegment === planning?.sourceSegment
        && behavior.generatedSegment === planning?.generatedSegment
        && behavior.id.trim().length > 0
        && /^fnv1a32-[0-9a-f]{8}$/.test(behavior.sourceBehaviorHash)
        && /^fnv1a32-[0-9a-f]{8}$/.test(behavior.integrityHash);
      const directivesValid = new Set(directivePlanIds).size === directivePlanIds.length
        && directivePlanIds.length === planIds.length
        && directivePlanIds.every((planId) => planIds.includes(planId))
        && new Set(directiveOrderIds).size === directiveOrderIds.length
        && behavior.directives.every((directive) => CAMPAIGN_AI_PLAN_KINDS.has(directive.planKind)
          && ["ordered", "holding", "blocked"].includes(directive.status)
          && directive.reason.trim().length > 0
          && directive.orderIds.every((orderId) => {
            const order = runtime.orders[orderId];
            return Boolean(order) && order.faction === faction && order.status !== "draft";
          })
          && (directive.status === "ordered" ? directive.orderIds.length > 0 : directive.orderIds.length === 0));
      const committedValid = new Set(behavior.committedOrderIds).size === behavior.committedOrderIds.length
        && computeCampaignContentHash([...behavior.committedOrderIds].sort()) === computeCampaignContentHash([...directiveOrderIds].sort());
      const expectedBlocked = behavior.directives.filter((directive) => directive.status === "blocked").map((directive) => directive.planId).sort();
      const blockedValid = new Set(behavior.blockedPlanIds).size === behavior.blockedPlanIds.length
        && computeCampaignContentHash([...behavior.blockedPlanIds].sort()) === computeCampaignContentHash(expectedBlocked);
      let integrityValid = false;
      try {
        integrityValid = computeCampaignAIBehaviorIntegrity(behavior) === behavior.integrityHash;
      } catch {
        integrityValid = false;
      }
      if (!scalarValid || !directivesValid || !committedValid || !blockedValid || !integrityValid) {
        addIssue(issues, {
          code: "AI_BEHAVIOR_INVALID",
          path,
          message: `AI behavior for ${faction} must retain valid planning ownership, common order links, status, and integrity.`
        });
      }
    } catch {
      addIssue(issues, {
        code: "AI_BEHAVIOR_INVALID",
        path,
        message: `AI behavior for ${faction} is incomplete or malformed.`
      });
    }
  });
}

function validStatusPool(pool: unknown, keys: readonly string[]): boolean {
  if (typeof pool !== "object" || pool === null || Array.isArray(pool)) return false;
  const record = pool as Record<string, unknown>;
  return keys.every((key) => Number.isInteger(record[key]) && Number(record[key]) >= 0);
}

/** Validates persistent identity, condition pools, placement, and the aggregate compatibility projection. */
function validateCampaignFormations(runtime: CampaignRuntimeState, issues: CampaignInvariantIssue[]): void {
  if (!explicitOrderMatchesRecord(runtime.formationOrder, runtime.formations)) {
    addIssue(issues, {
      code: "FORMATION_ORDER_INVALID",
      path: "formationOrder",
      message: "Formation order must contain every persistent formation ID exactly once."
    });
    return;
  }

  const placedIds = new Set<string>();
  runtime.tileOrder.forEach((hexKey) => {
    const tile = runtime.tiles[hexKey];
    if (!tile) return;
    const tileSet = new Set(tile.formationIds);
    if (tileSet.size !== tile.formationIds.length) {
      addIssue(issues, {
        code: "FORMATION_PLACEMENT_INVALID",
        path: `tiles.${hexKey}.formationIds`,
        message: `Runtime tile ${hexKey} contains duplicate formation placement IDs.`
      });
    }
    const projected = new Map<string, number>();
    tile.formationIds.forEach((formationId) => {
      const formation = runtime.formations[formationId];
      if (!formation
        || formation.locationHexKey !== hexKey
        || formation.retiredSegment !== null
        || formation.status === "destroyed"
        || formation.status === "captured"
        || placedIds.has(formationId)) {
        addIssue(issues, {
          code: "FORMATION_PLACEMENT_INVALID",
          path: `tiles.${hexKey}.formationIds.${formationId}`,
          message: `Formation ${formationId} must exist, be active, point to ${hexKey}, and be placed exactly once.`
        });
        return;
      }
      placedIds.add(formationId);
      if (formation.status === "unavailable") return;
      projected.set(formation.campaignUnitType, (projected.get(formation.campaignUnitType) ?? 0) + 1);
    });
    const aggregate = new Map<string, number>();
    tile.forces.forEach((force) => aggregate.set(force.unitType, (aggregate.get(force.unitType) ?? 0) + force.count));
    const projectionMatches = aggregate.size === projected.size
      && Array.from(aggregate).every(([unitType, count]) => projected.get(unitType) === count);
    if (!projectionMatches) {
      addIssue(issues, {
        code: "FORMATION_PROJECTION_INVALID",
        path: `tiles.${hexKey}.forces`,
        message: `Runtime tile ${hexKey} aggregate force counts must exactly project its persistent formation IDs.`
      });
    }
  });

  runtime.formationOrder.forEach((id) => {
    const formation = runtime.formations[id];
    if (!formation) return;
    const invalidIdentity = formation.id !== id
      || typeof formation.faction !== "string"
      || formation.faction.trim().length === 0
      || !CAMPAIGN_FORMATION_OWNERSHIP.has(formation.ownership)
      || formation.name.trim().length === 0
      || formation.campaignUnitType.trim().length === 0
      || formation.formationKey.trim().length === 0
      || formation.equipmentPackageKey.trim().length === 0
      || !CAMPAIGN_FORMATION_STATUSES.has(formation.status)
      || !Number.isInteger(formation.createdSegment)
      || formation.createdSegment < 0
      || formation.createdSegment > runtime.currentSegment
      || (formation.retiredSegment !== null && (!Number.isInteger(formation.retiredSegment)
        || formation.retiredSegment < formation.createdSegment
        || formation.retiredSegment > runtime.currentSegment));
    if (invalidIdentity) {
      addIssue(issues, {
        code: "FORMATION_INVALID",
        path: `formations.${id}`,
        message: `Formation ${id} has invalid identity, type, lifecycle, or campaign time.`
      });
    }

    const invalidAvailability = (formation.availableFromSegment !== undefined
      && (!Number.isInteger(formation.availableFromSegment) || formation.availableFromSegment < 0))
      || (formation.availabilityCopy !== undefined
        && (typeof formation.availabilityCopy !== "string"
          || formation.availabilityCopy.trim().length === 0
          || formation.availableFromSegment === undefined))
      || (formation.status === "unavailable"
        && (formation.availableFromSegment === undefined
          || formation.availableFromSegment <= runtime.currentSegment
          || formation.currentOrderId !== null))
      || (formation.availableFromSegment !== undefined
        && formation.availableFromSegment > runtime.currentSegment
        && formation.status !== "unavailable");
    if (invalidAvailability) {
      addIssue(issues, {
        code: "FORMATION_INVALID",
        path: `formations.${id}.availableFromSegment`,
        message: `Formation ${id} availability metadata and lifecycle status must match campaign time.`
      });
    }

    const personnelEntries = Object.entries(formation.personnel);
    const equipmentEntries = Object.entries(formation.equipment);
    const invalidPools = personnelEntries.length === 0
      || personnelEntries.some(([key, pool]) => key.trim().length === 0
        || !validStatusPool(pool, ["fit", "injured", "wounded", "severelyWounded", "killed"]))
      || equipmentEntries.some(([key, pool]) => key.trim().length === 0
        || !validStatusPool(pool, ["operational", "damaged", "disabled", "destroyed"]));
    const invalidCondition = invalidPools
      || !validBoundedPercent(formation.readiness)
      || !validBoundedPercent(formation.cohesion)
      || !validBoundedPercent(formation.fatigue)
      || Object.values(formation.supply).some((value) => !isNonNegativeFinite(value))
      || !Number.isInteger(formation.experience.base)
      || formation.experience.base < 0
      || formation.experience.base > 5
      || !Number.isInteger(formation.experience.earned)
      || formation.experience.earned < 0
      || formation.experience.base + formation.experience.earned > 5
      || !Number.isInteger(formation.experience.battles)
      || formation.experience.battles < 0;
    if (invalidCondition) {
      addIssue(issues, {
        code: "FORMATION_INVALID",
        path: `formations.${id}.condition`,
        message: `Formation ${id} has invalid personnel, equipment, readiness, supply, or experience state.`
      });
    }

    const terminal = formation.status === "destroyed" || formation.status === "captured";
    const invalidPlacement = terminal
      ? formation.locationHexKey !== null || formation.retiredSegment === null || placedIds.has(id)
      : formation.retiredSegment !== null
        || formation.locationHexKey === null
        || !runtime.tiles[formation.locationHexKey]
        || !placedIds.has(id);
    if (invalidPlacement) {
      addIssue(issues, {
        code: "FORMATION_PLACEMENT_INVALID",
        path: `formations.${id}.locationHexKey`,
        message: `Formation ${id} location and retirement state must match its tile placement and lifecycle status.`
      });
    }

    const historyIds = new Set<string>();
    const historyInvalid = formation.battleHistory.length === 0 || formation.battleHistory.some((entry) => {
      const invalid = entry.id.trim().length === 0
        || historyIds.has(entry.id)
        || !CAMPAIGN_FORMATION_HISTORY_TYPES.has(entry.type)
        || !Number.isInteger(entry.segment)
        || entry.segment < formation.createdSegment
        || entry.segment > runtime.currentSegment
        || entry.summary.trim().length === 0
        || (entry.engagementId !== null && typeof entry.engagementId !== "string")
        || (entry.fromHexKey !== null && typeof entry.fromHexKey !== "string")
        || (entry.toHexKey !== null && typeof entry.toHexKey !== "string");
      historyIds.add(entry.id);
      return invalid;
    });
    const honorIds = new Set<string>();
    const honorsInvalid = formation.honors.some((honor) => {
      const invalid = honor.id.trim().length === 0
        || honorIds.has(honor.id)
        || honor.honorKey.trim().length === 0
        || honor.name.trim().length === 0
        || !Number.isInteger(honor.awardedSegment)
        || honor.awardedSegment < formation.createdSegment
        || honor.awardedSegment > runtime.currentSegment
        || honor.citation.trim().length === 0;
      honorIds.add(honor.id);
      return invalid;
    });
    const origin = formation.origin;
    const originInvalid = !origin
      || !new Set(["legacyAggregate", "authored", "reconstituted"]).has(origin.kind)
      || (origin.initialHexKey !== null && typeof origin.initialHexKey !== "string")
      || (origin.legacyGroupIndex !== null && (!Number.isInteger(origin.legacyGroupIndex) || origin.legacyGroupIndex < 0))
      || (origin.legacyOrdinal !== null && (!Number.isInteger(origin.legacyOrdinal) || origin.legacyOrdinal < 0))
      || (origin.legacyLabel !== null && typeof origin.legacyLabel !== "string")
      || (formation.currentOrderId !== null && !runtime.orders[formation.currentOrderId]);
    if (historyInvalid || honorsInvalid || originInvalid) {
      addIssue(issues, {
        code: "FORMATION_INVALID",
        path: `formations.${id}.history`,
        message: `Formation ${id} has invalid provenance, order linkage, honors, or append-only history.`
      });
    }
  });
}

/**
 * WHAT: Validates event history identity and monotonic ordering.
 * WHY: Domain events back AAR, idempotency, diagnostics, and replay, so duplicate or time-reversing history cannot be accepted.
 *
 * @param runtime - Runtime containing the event log.
 * @param issues - Validation issue accumulator.
 */
function validateEventLog(runtime: CampaignRuntimeState, issues: CampaignInvariantIssue[]): void {
  const ids = new Set<string>();
  let priorRevision = -1;
  let priorSequence = -1;
  runtime.eventLog.forEach((event, index) => {
    const invalidIdentity = event.id.trim().length === 0 || event.campaignId !== runtime.campaignId || ids.has(event.id);
    const revisionReversed = !Number.isInteger(event.revision) || event.revision < priorRevision || event.revision > runtime.revision;
    const expectedMinimumSequence = event.revision === priorRevision ? priorSequence + 1 : 0;
    const sequenceInvalid = !Number.isInteger(event.sequence) || event.sequence < expectedMinimumSequence;
    const segmentInvalid = !Number.isInteger(event.segment) || event.segment < 0 || event.segment > runtime.currentSegment;
    const detailsInvalid = Object.values(event.details).some((value) => {
      const type = typeof value;
      return value !== null
        && type !== "string"
        && type !== "boolean"
        && (type !== "number" || !Number.isFinite(value));
    });
    if (invalidIdentity || revisionReversed || sequenceInvalid || segmentInvalid || detailsInvalid) {
      addIssue(issues, {
        code: "EVENT_LOG_INVALID",
        path: `eventLog.${index}`,
        message: `Campaign event ${event.id || index} has invalid identity, ordering, segment, or detail values.`
      });
    }
    ids.add(event.id);
    priorRevision = event.revision;
    priorSequence = event.sequence;
  });

  if (runtime.lastResolution) {
    const report = runtime.lastResolution;
    const invalidReport = report.fromRevision < 0
      || report.toRevision !== runtime.revision
      || report.toRevision !== report.fromRevision + 1
      || report.segment > runtime.currentSegment
      || (report.resolutionKind !== "transaction" && report.resolutionKind !== "segment")
      || !Number.isInteger(report.fromSegment)
      || !Number.isInteger(report.toSegment)
      || report.fromSegment < 0
      || report.toSegment < report.fromSegment
      || report.toSegment !== report.segment
      || report.eventIds.some((id) => !ids.has(id));
    if (invalidReport) {
      addIssue(issues, {
        code: "EVENT_LOG_INVALID",
        path: "lastResolution",
        message: "Last campaign resolution must describe the current single-revision commit and reference existing events."
      });
    }

    const invalidSegmentMetadata = report.resolutionKind === "segment"
      ? report.toSegment !== report.fromSegment + 1
        || report.frozenFactionViews.length !== runtime.factionOrder.length
        || report.frozenFactionViews.some((checkpoint, index) => (
          checkpoint.faction !== runtime.factionOrder[index]
          || checkpoint.sourceRevision !== report.fromRevision
          || checkpoint.sourceSegment !== report.fromSegment
          || !/^fnv1a32-[0-9a-f]{8}$/.test(checkpoint.contentHash)
        ))
        || report.phaseReports.length !== CAMPAIGN_SEGMENT_PHASES.length
        || report.phaseReports.some((phase, index) => (
          phase.phase !== CAMPAIGN_SEGMENT_PHASES[index]
          || phase.sequence !== index
          || !Number.isInteger(phase.eventCount)
          || phase.eventCount < 0
          || new Set(phase.affectedRecordIds).size !== phase.affectedRecordIds.length
          || phase.affectedRecordIds.some((id) => typeof id !== "string" || id.length === 0)
        ))
        || report.phaseReports.reduce((sum, phase) => sum + phase.eventCount, 0) !== report.eventIds.length - 1
      : report.frozenFactionViews.length > 0 || report.phaseReports.length > 0;
    if (invalidSegmentMetadata) {
      addIssue(issues, {
        code: "SEGMENT_RESOLUTION_INVALID",
        path: "lastResolution",
        message: "Last campaign resolution has invalid frozen-view or ordered phase metadata."
      });
    }
  }
}

/** Validates save-stable command checkpoints and their links to committed transactions. */
function validateAdvanceLog(runtime: CampaignRuntimeState, issues: CampaignInvariantIssue[]): void {
  if (!explicitOrderMatchesRecord(runtime.advanceRecordOrder, runtime.advanceRecords)) {
    addIssue(issues, {
      code: "ADVANCE_LOG_INVALID",
      path: "advanceRecordOrder",
      message: "Advance record order must contain every persisted step ID exactly once."
    });
    return;
  }

  const committedTransactionIds = new Set(runtime.eventLog.flatMap((event) => (
    event.type === "transactionCommitted" && typeof event.details.transactionId === "string"
      ? [event.details.transactionId]
      : []
  )));
  let priorRevision = -1;
  let priorSegment = -1;
  const alertIds = new Set<string>();
  runtime.advanceRecordOrder.forEach((id) => {
    const record = runtime.advanceRecords[id];
    if (!record) return;
    const invalidRecord = record.id !== id
      || record.commandId.trim().length === 0
      || record.transactionId.trim().length === 0
      || !committedTransactionIds.has(record.transactionId)
      || !CAMPAIGN_ADVANCE_MODES.has(record.mode)
      || !Number.isInteger(record.fromSegment)
      || !Number.isInteger(record.toSegment)
      || record.toSegment !== record.fromSegment + 1
      || record.fromSegment < priorSegment
      || record.toSegment > runtime.currentSegment
      || (record.targetSegment !== null && (!Number.isInteger(record.targetSegment) || record.targetSegment < record.toSegment))
      || !Number.isInteger(record.revision)
      || record.revision <= priorRevision
      || record.revision > runtime.revision
      || !Number.isInteger(record.eventCount)
      || record.eventCount < 0
      || record.stopped !== (record.stopReason !== null)
      || (record.stopReason !== null && !CAMPAIGN_ADVANCE_STOP_REASONS.has(record.stopReason));
    if (invalidRecord) {
      addIssue(issues, {
        code: "ADVANCE_LOG_INVALID",
        path: `advanceRecords.${id}`,
        message: `Advance step ${id} has invalid identity, ordering, transaction linkage, target, or stop metadata.`
      });
    }
    record.alerts.forEach((alert, index) => {
      const invalidAlert = alert.id.trim().length === 0
        || alertIds.has(alert.id)
        || !CAMPAIGN_ADVANCE_ALERT_SEVERITIES.has(alert.severity)
        || !CAMPAIGN_ADVANCE_ALERT_TARGETS.has(alert.targetKind)
        || alert.segment !== record.toSegment
        || alert.title.trim().length === 0
        || alert.detail.trim().length === 0
        || (alert.targetId !== null && typeof alert.targetId !== "string")
        || typeof alert.requiresStop !== "boolean";
      if (invalidAlert) {
        addIssue(issues, {
          code: "ADVANCE_LOG_INVALID",
          path: `advanceRecords.${id}.alerts.${index}`,
          message: `Advance alert ${alert.id || index} has invalid identity, severity, target, segment, or copy.`
        });
      }
      alertIds.add(alert.id);
    });
    priorRevision = record.revision;
    priorSegment = record.fromSegment;
  });
}

/**
 * WHAT: Validates all currently authoritative Campaign 2.0 runtime invariants.
 * WHY: Save hydration and transactions need a non-throwing diagnostic pass before deciding whether a candidate can become truth.
 *
 * @param runtime - Candidate runtime state.
 * @returns Every detected structured invariant issue; an empty array means the state is valid.
 */
export function validateCampaignRuntimeState(runtime: CampaignRuntimeState): CampaignInvariantIssue[] {
  const issues: CampaignInvariantIssue[] = [];

  if (runtime.runtimeVersion !== CAMPAIGN_RUNTIME_VERSION) {
    addIssue(issues, {
      code: "RUNTIME_VERSION_INVALID",
      path: "runtimeVersion",
      message: `Campaign runtime version must be ${CAMPAIGN_RUNTIME_VERSION}.`
    });
  }
  if (runtime.campaignId.trim().length === 0) {
    addIssue(issues, { code: "CAMPAIGN_ID_INVALID", path: "campaignId", message: "Campaign ID cannot be empty." });
  }
  if (runtime.scenarioKey.trim().length === 0) {
    addIssue(issues, { code: "SCENARIO_KEY_INVALID", path: "scenarioKey", message: "Scenario key cannot be empty." });
  }
  if (!/^fnv1a32-[0-9a-f]{8}$/.test(runtime.scenarioContentHash)) {
    addIssue(issues, {
      code: "CONTENT_HASH_INVALID",
      path: "scenarioContentHash",
      message: "Scenario content hash must use the supported fnv1a32 format."
    });
  }
  if (!Number.isInteger(runtime.revision) || runtime.revision < 0) {
    addIssue(issues, { code: "REVISION_INVALID", path: "revision", message: "Campaign revision must be a non-negative integer." });
  }
  if (!Number.isInteger(runtime.currentSegment) || runtime.currentSegment < 0) {
    addIssue(issues, { code: "SEGMENT_INVALID", path: "currentSegment", message: "Current segment must be a non-negative integer." });
  }
  if (!CAMPAIGN_RUNTIME_STATUSES.has(runtime.status)) {
    addIssue(issues, { code: "STATUS_INVALID", path: "status", message: `Unsupported campaign runtime status ${runtime.status}.` });
  }
  if (!isSerializedCampaignRandomState(runtime.rng)) {
    addIssue(issues, { code: "RANDOM_STATE_INVALID", path: "rng", message: "Campaign random state is incomplete or invalid." });
  }

  if (!explicitOrderMatchesRecord(runtime.tileOrder, runtime.tiles)) {
    addIssue(issues, {
      code: "TILE_ORDER_INVALID",
      path: "tileOrder",
      message: "Tile order must contain every runtime tile key exactly once."
    });
  }
  runtime.tileOrder.forEach((hexKey) => {
    const tile = runtime.tiles[hexKey];
    if (!tile) return;
    const expectedKey = `${tile.hex.q},${tile.hex.r}`;
    if (tile.hexKey !== hexKey || expectedKey !== hexKey || tile.tileKey.trim().length === 0) {
      addIssue(issues, {
        code: "TILE_KEY_INVALID",
        path: `tiles.${hexKey}`,
        message: `Runtime tile identity must match its axial coordinate and include a palette key.`
      });
    }
    if (typeof tile.controller !== "string" || tile.controller.trim().length === 0) {
      addIssue(issues, {
        code: "TILE_CONTROL_INVALID",
        path: `tiles.${hexKey}.controller`,
        message: `Runtime tile ${hexKey} must have a non-empty controller.`
      });
    }
    if (!Number.isInteger(tile.controlSinceSegment) || tile.controlSinceSegment < 0 || tile.controlSinceSegment > runtime.currentSegment) {
      addIssue(issues, {
        code: "TILE_CONTROL_INVALID",
        path: `tiles.${hexKey}.controlSinceSegment`,
        message: `Runtime tile ${hexKey} control timestamp must be a valid segment no later than current time.`
      });
    }
    tile.forces.forEach((force, index) => {
      if (force.unitType.trim().length === 0 || !Number.isInteger(force.count) || force.count < 0) {
        addIssue(issues, {
          code: "FORCE_COUNT_INVALID",
          path: `tiles.${hexKey}.forces.${index}`,
          message: `Runtime tile ${hexKey} force ${index} needs a unit type and non-negative integer count.`
        });
      }
    });
    const infrastructure = tile.infrastructure;
    if (infrastructure) {
      const timestamps = [
        infrastructure.lastDamageSegment,
        infrastructure.lastRepairSegment,
        infrastructure.lastCapturedSegment
      ].filter((value): value is number => value !== null);
      const expectedEffectiveness = computeCampaignInfrastructureEffectiveness(
        infrastructure.integrity,
        infrastructure.maxIntegrity,
        runtime.currentSegment,
        infrastructure.captureDisruptionUntilSegment
      );
      if (!infrastructure.role
        || !Number.isInteger(infrastructure.maxIntegrity) || infrastructure.maxIntegrity <= 0
        || !Number.isInteger(infrastructure.integrity) || infrastructure.integrity < 0
        || infrastructure.integrity > infrastructure.maxIntegrity
        || infrastructure.damageState !== deriveCampaignInfrastructureDamageState(
          infrastructure.integrity,
          infrastructure.maxIntegrity
        )
        || infrastructure.disabled !== (infrastructure.integrity === 0)
        || !Number.isFinite(infrastructure.effectiveness)
        || Math.abs(infrastructure.effectiveness - expectedEffectiveness) > 0.000001
        || timestamps.some((value) => !Number.isInteger(value) || value < 0 || value > runtime.currentSegment)
        || (infrastructure.captureDisruptionUntilSegment !== null
          && (!Number.isInteger(infrastructure.captureDisruptionUntilSegment)
            || infrastructure.captureDisruptionUntilSegment <= runtime.currentSegment))
        || (infrastructure.activeRepairOrderId !== null && (() => {
          const repairOrder = runtime.orders[infrastructure.activeRepairOrderId];
          return !repairOrder
            || repairOrder.kind !== "infrastructureRepair"
            || repairOrder.payload.targetRuntimeHexKey !== hexKey
            || repairOrder.faction !== tile.controller
            || (repairOrder.status !== "committed" && repairOrder.status !== "executing");
        })())) {
        addIssue(issues, {
          code: "TILE_CONTROL_INVALID",
          path: `tiles.${hexKey}.infrastructure`,
          message: `Runtime tile ${hexKey} has malformed infrastructure condition or lifecycle state.`
        });
      }
    }
  });

  validateCampaignFormations(runtime, issues);

  if (!explicitOrderMatchesRecord(runtime.factionOrder, runtime.factions)) {
    addIssue(issues, {
      code: "FACTION_ORDER_INVALID",
      path: "factionOrder",
      message: "Faction order must contain every runtime faction key exactly once."
    });
  }
  runtime.factionOrder.forEach((faction) => validateFactionEconomy(runtime, faction, issues));

  if (!explicitOrderMatchesRecord(runtime.engagementOrder, runtime.engagements)) {
    addIssue(issues, {
      code: "ENGAGEMENT_INVALID",
      path: "engagementOrder",
      message: "Engagement order must contain every runtime engagement key exactly once."
    });
  }
  runtime.engagementOrder.forEach((id) => {
    const record = runtime.engagements[id];
    if (!record) return;
    const engagement = record.engagement;
    if (record.id !== id || engagement.id !== id || engagement.attacker.trim().length === 0 || engagement.defender.trim().length === 0) {
      addIssue(issues, {
        code: "ENGAGEMENT_INVALID",
        path: `engagements.${id}`,
        message: `Engagement ${id} must have matching identity and non-empty factions.`
      });
    }
  });
  if (!explicitOrderMatchesRecord(runtime.engagementLedgerOrder, runtime.engagementLedger)) {
    addIssue(issues, {
      code: "ENGAGEMENT_LEDGER_INVALID",
      path: "engagementLedgerOrder",
      message: "Engagement ledger order must contain every ledger record exactly once."
    });
  }
  const activelyCommittedFormationIds = new Set<string>();
  runtime.engagementLedgerOrder.forEach((id) => {
    const ledger = runtime.engagementLedger[id];
    if (!ledger) return;
    const revisionRefs = [ledger.plannedRevision, ledger.committedRevision, ledger.launchedRevision, ledger.terminalRevision];
    const invalidIdentity = ledger.ledgerVersion !== CAMPAIGN_ENGAGEMENT_LEDGER_VERSION
      || ledger.id !== id
      || ledger.engagementId !== id
      || !CAMPAIGN_ENGAGEMENT_LEDGER_STATUSES.has(ledger.status)
      || !Number.isInteger(ledger.createdSegment)
      || ledger.createdSegment < 0
      || ledger.createdSegment > runtime.currentSegment
      || revisionRefs.some((revision) => revision !== null
        && (!Number.isInteger(revision) || revision < 0 || revision > runtime.revision))
      || new Set(ledger.appliedResolutionIds).size !== ledger.appliedResolutionIds.length
      || ledger.appliedResolutionIds.some((resolutionId) => typeof resolutionId !== "string" || resolutionId.trim().length === 0)
      || (ledger.resolutionSummaryHash !== null && !/^fnv1a32-[0-9a-f]{8}$/.test(ledger.resolutionSummaryHash));
    if (invalidIdentity) {
      addIssue(issues, {
        code: "ENGAGEMENT_LEDGER_INVALID",
        path: `engagementLedger.${id}`,
        message: `Engagement ledger ${id} has invalid identity, lifecycle, or resolution receipts.`
      });
    }
    const liveEngagement = runtime.engagements[id];
    if (liveEngagement && liveEngagement.status !== ledger.status) {
      addIssue(issues, {
        code: "ENGAGEMENT_LEDGER_INVALID",
        path: `engagementLedger.${id}.status`,
        message: `Live engagement ${id} and its ledger must share one lifecycle status.`
      });
    }
    if ((ledger.status === "resolved" || ledger.status === "cancelled" || ledger.status === "abandoned")
      && ledger.terminalRevision === null) {
      addIssue(issues, {
        code: "ENGAGEMENT_LEDGER_INVALID",
        path: `engagementLedger.${id}.terminalRevision`,
        message: `Terminal engagement ledger ${id} requires a terminal revision.`
      });
    }
    if (!ledger.package) {
      if ((ledger.status === "committed" || ledger.status === "inBattle") && !ledger.legacyUnfrozen) {
        addIssue(issues, {
          code: "ENGAGEMENT_COMMITMENT_INVALID",
          path: `engagementLedger.${id}.package`,
          message: `Committed engagement ${id} requires a frozen battle package.`
        });
      }
      return;
    }
    try {
      const pkg = assertCampaignBattlePackage(ledger.package, {
        campaignId: runtime.campaignId,
        scenarioKey: runtime.scenarioKey,
        engagementId: id
      });
      if (pkg.committedRevision > runtime.revision
        || ledger.committedRevision !== pkg.committedRevision
        || ledger.launchedRevision === null
        || ledger.legacyUnfrozen) {
        throw new Error("Package revision or legacy state is inconsistent with the ledger.");
      }
      pkg.formationCommitments.forEach((commitment) => {
        const formation = runtime.formations[commitment.formationId];
        if (!formation || formation.faction !== commitment.faction
          || ((ledger.status === "committed" || ledger.status === "inBattle")
            && formation.locationHexKey !== commitment.sourceHexKey)
          || !/^fnv1a32-[0-9a-f]{8}$/.test(commitment.beforeStateHash)) {
          throw new Error(`Formation commitment ${commitment.formationId} is invalid.`);
        }
        if (ledger.status === "committed" || ledger.status === "inBattle") {
          if (formation.status !== "committed" || activelyCommittedFormationIds.has(formation.id)) {
            throw new Error(`Formation ${formation.id} is not exclusively committed to ${id}.`);
          }
          activelyCommittedFormationIds.add(formation.id);
        }
      });
      pkg.resourceCommitments.forEach((commitment) => {
        if (!runtime.factions[String(commitment.faction)] || !isNonNegativeFinite(commitment.reservedAmount)) {
          throw new Error(`Resource commitment ${commitment.poolKey} is invalid.`);
        }
      });
      if (ledger.resultPackage) {
        const result = assertCampaignBattleResultPackage(ledger.resultPackage, pkg);
        if (ledger.status !== "resolved" || !ledger.appliedResolutionIds.includes(result.resolutionId)) {
          throw new Error("Stored tactical result must belong to a resolved ledger receipt.");
        }
        if (ledger.consequenceReport) {
          const consequence = assertCampaignBattleConsequenceReport(ledger.consequenceReport, result);
          if (consequence.appliedRevision !== ledger.terminalRevision
            || consequence.appliedRevision > runtime.revision) {
            throw new Error("Stored battle consequences must match the engagement terminal revision.");
          }
          if (ledger.controlReport) {
            const control = assertCampaignBattleControlReport(ledger.controlReport, result, consequence);
            if (control.appliedRevision !== ledger.terminalRevision
              || control.appliedRevision > runtime.revision) {
              throw new Error("Stored battle control must match the engagement terminal revision.");
            }
            if (runtime.revision === control.appliedRevision) {
              const battleTile = runtime.tiles[control.battleHexKey];
              if (!battleTile
                || battleTile.controller !== control.controllerAfter
                || battleTile.controlSinceSegment !== control.controlSinceSegmentAfter
                || computeCampaignControlStateHash(runtime) !== control.controlStateHashAfter
                || computeCampaignContentHash(runtime.compatibility.initialFronts)
                  !== computeCampaignContentHash(control.frontsAfter)) {
                throw new Error("Stored battle control does not match the committed operational map state.");
              }
            }
            if (ledger.infrastructureReport) {
              const infrastructure = assertCampaignBattleInfrastructureReport(
                ledger.infrastructureReport,
                result,
                consequence,
                control
              );
              if (infrastructure.appliedRevision !== ledger.terminalRevision
                || infrastructure.appliedRevision > runtime.revision) {
                throw new Error("Stored battle infrastructure must match the engagement terminal revision.");
              }
              if (runtime.revision === infrastructure.appliedRevision) {
                const battleTile = runtime.tiles[infrastructure.battleHexKey];
                if (!battleTile || computeCampaignContentHash(battleTile.infrastructure ?? null)
                  !== computeCampaignContentHash(infrastructure.infrastructureAfter)) {
                  throw new Error("Stored battle infrastructure does not match the committed facility state.");
                }
              }
              if (ledger.afterActionReport) {
                const afterAction = assertCampaignAfterActionReport(
                  ledger.afterActionReport,
                  result,
                  consequence,
                  control,
                  infrastructure
                );
                if (afterAction.appliedRevision !== ledger.terminalRevision
                  || afterAction.appliedRevision > runtime.revision) {
                  throw new Error("Stored after-action report must match the engagement terminal revision.");
                }
              }
            } else if (ledger.afterActionReport) {
              throw new Error("Stored after-action report requires its immutable infrastructure audit.");
            }
          } else if (ledger.infrastructureReport || ledger.afterActionReport) {
            throw new Error("Stored battle infrastructure and after-action reports require their immutable control report.");
          }
        } else if (ledger.controlReport || ledger.infrastructureReport || ledger.afterActionReport) {
          throw new Error("Stored battle control, infrastructure, and after-action reports require their immutable consequence report.");
        }
      } else if (ledger.consequenceReport || ledger.controlReport || ledger.infrastructureReport || ledger.afterActionReport) {
        throw new Error("Stored battle consequences, control, infrastructure, and after-action reports require their immutable tactical result package.");
      }
    } catch (error) {
      addIssue(issues, {
        code: "ENGAGEMENT_COMMITMENT_INVALID",
        path: `engagementLedger.${id}.package`,
        message: error instanceof Error ? error.message : `Engagement ${id} has an invalid battle package.`
      });
    }
  });
  const acknowledgedAfterActionReportIds = runtime.acknowledgedAfterActionReportIds ?? [];
  const availableAfterActionReportIds = new Set(runtime.engagementLedgerOrder.flatMap((engagementId) => {
    const reportId = runtime.engagementLedger[engagementId]?.afterActionReport?.reportId;
    return reportId ? [reportId] : [];
  }));
  if (new Set(acknowledgedAfterActionReportIds).size !== acknowledgedAfterActionReportIds.length
    || acknowledgedAfterActionReportIds.some((reportId) => !availableAfterActionReportIds.has(reportId))) {
    addIssue(issues, {
      code: "ENGAGEMENT_LEDGER_INVALID",
      path: "acknowledgedAfterActionReportIds",
      message: "After-action acknowledgements must be unique and reference retained reports."
    });
  }
  const acknowledgedCampaignAlertIds = runtime.acknowledgedCampaignAlertIds ?? [];
  const availableCampaignAlertIds = new Set(runtime.advanceRecordOrder.flatMap((recordId) => (
    runtime.advanceRecords[recordId]?.alerts.map((alert) => alert.id) ?? []
  )));
  if (new Set(acknowledgedCampaignAlertIds).size !== acknowledgedCampaignAlertIds.length
    || acknowledgedCampaignAlertIds.some((alertId) => !availableCampaignAlertIds.has(alertId))) {
    addIssue(issues, {
      code: "ADVANCE_LOG_INVALID",
      path: "acknowledgedCampaignAlertIds",
      message: "Campaign alert acknowledgements must be unique and reference retained advance alerts."
    });
  }
  runtime.formationOrder.forEach((formationId) => {
    const formation = runtime.formations[formationId];
    if (formation?.status === "committed" && !activelyCommittedFormationIds.has(formationId)) {
      addIssue(issues, {
        code: "ENGAGEMENT_COMMITMENT_INVALID",
        path: `formations.${formationId}.status`,
        message: `Committed formation ${formationId} must belong to exactly one active engagement package.`
      });
    }
  });
  if (runtime.activeEngagementId !== null) {
    const active = runtime.engagements[runtime.activeEngagementId];
    const activeLedger = runtime.engagementLedger[runtime.activeEngagementId];
    const validPlanned = active?.status === "planned" && activeLedger?.status === "planned" && runtime.status === "planning";
    const validBattle = active?.status === "inBattle" && activeLedger?.status === "inBattle" && runtime.status === "engagement";
    if (!active || (!validPlanned && !validBattle)) {
      addIssue(issues, {
        code: "ACTIVE_ENGAGEMENT_INVALID",
        path: "activeEngagementId",
        message: "Active engagement must be a matching planned package or an in-battle package."
      });
    }
  } else if (runtime.status === "engagement") {
    addIssue(issues, {
      code: "ACTIVE_ENGAGEMENT_INVALID",
      path: "status",
      message: "Engagement status requires an active engagement ID."
    });
  }

  if (!explicitOrderMatchesRecord(runtime.objectiveOrder, runtime.objectives)) {
    addIssue(issues, {
      code: "OBJECTIVE_INVALID",
      path: "objectiveOrder",
      message: "Objective order must contain every objective runtime key exactly once."
    });
  }
  runtime.objectiveOrder.forEach((key) => {
    const objective = runtime.objectives[key];
    const invalidExtendedState = objective && (
      (objective.activatedSegment !== undefined && objective.activatedSegment !== null && (!Number.isInteger(objective.activatedSegment) || objective.activatedSegment < 0 || objective.activatedSegment > runtime.currentSegment))
      || (objective.resolvedSegment !== undefined && objective.resolvedSegment !== null && (!Number.isInteger(objective.resolvedSegment) || objective.resolvedSegment < 0 || objective.resolvedSegment > runtime.currentSegment))
      || (objective.scoreAwarded !== undefined && !isNonNegativeFinite(objective.scoreAwarded))
      || (objective.progressCurrent !== undefined && !isNonNegativeFinite(objective.progressCurrent))
      || (objective.progressTarget !== undefined && !isNonNegativeFinite(objective.progressTarget))
      || (objective.progressLabel !== undefined && typeof objective.progressLabel !== "string")
      || (objective.conditionLabels !== undefined && (!Array.isArray(objective.conditionLabels) || objective.conditionLabels.some((label) => typeof label !== "string")))
    );
    if (!objective
      || objective.objectiveKey !== key
      || !CAMPAIGN_OBJECTIVE_STATUSES.has(objective.status)
      || !isNonNegativeFinite(objective.progress)
      || objective.progress > 1
      || typeof objective.rewardApplied !== "boolean"
      || invalidExtendedState) {
      addIssue(issues, {
        code: "OBJECTIVE_INVALID",
        path: `objectives.${key}`,
        message: `Objective runtime ${key} must have matching identity, lifecycle, bounded progress, and valid explanation fields.`
      });
    }
  });
  const objectiveV2Fields = [runtime.campaignPhaseKey, runtime.campaignPhaseEnteredSegment, runtime.campaignScore, runtime.campaignOutcome, runtime.awardedRewardKeys];
  const hasAnyObjectiveV2 = objectiveV2Fields.some((value) => value !== undefined);
  const hasAllObjectiveV2 = objectiveV2Fields.every((value) => value !== undefined);
  if (hasAnyObjectiveV2 && !hasAllObjectiveV2) {
    addIssue(issues, {
      code: "OBJECTIVE_INVALID",
      path: "campaignOutcome",
      message: "Campaign phase, score, outcome, and awarded rewards must be present together after C20-026 reconciliation."
    });
  } else if (hasAllObjectiveV2) {
    const score = runtime.campaignScore!;
    const invalidScore = typeof runtime.campaignPhaseKey !== "string"
      || runtime.campaignPhaseKey.trim().length === 0
      || !Number.isInteger(runtime.campaignPhaseEnteredSegment)
      || runtime.campaignPhaseEnteredSegment! < 0
      || runtime.campaignPhaseEnteredSegment! > runtime.currentSegment
      || !isNonNegativeFinite(score.earned)
      || !isNonNegativeFinite(score.available)
      || !isNonNegativeFinite(score.percent)
      || score.percent > 100
      || score.earned > score.available
      || !CAMPAIGN_OUTCOME_GRADES.has(score.projectedGrade)
      || !Array.isArray(runtime.awardedRewardKeys)
      || new Set(runtime.awardedRewardKeys).size !== runtime.awardedRewardKeys.length
      || runtime.awardedRewardKeys.some((key) => typeof key !== "string" || key.length === 0);
    if (invalidScore) {
      addIssue(issues, {
        code: "OBJECTIVE_INVALID",
        path: "campaignScore",
        message: "Campaign phase and score state must be finite, bounded, and use unique reward keys."
      });
    }
    const outcome = runtime.campaignOutcome;
    if (outcome !== null && outcome !== undefined) {
      const invalidOutcome = (outcome.result !== "victory" && outcome.result !== "defeat")
        || !CAMPAIGN_OUTCOME_GRADES.has(outcome.grade)
        || (outcome.grade === "defeat") !== (outcome.result === "defeat")
        || !Number.isInteger(outcome.segment)
        || outcome.segment < 0
        || outcome.segment > runtime.currentSegment
        || outcome.phaseKey.length === 0
        || !isNonNegativeFinite(outcome.scoreEarned)
        || !isNonNegativeFinite(outcome.scoreAvailable)
        || outcome.scoreEarned > outcome.scoreAvailable
        || !Array.isArray(outcome.completedObjectiveKeys)
        || !Array.isArray(outcome.failedObjectiveKeys)
        || typeof outcome.summary !== "string"
        || typeof outcome.sandboxContinued !== "boolean"
        || (!outcome.sandboxContinued && runtime.status !== outcome.result)
        || (outcome.sandboxContinued && runtime.status !== "planning");
      if (invalidOutcome) {
        addIssue(issues, {
          code: "OBJECTIVE_INVALID",
          path: "campaignOutcome",
          message: "Recorded campaign outcome must match terminal runtime status, grade, score, and objective records."
        });
      }
    } else if (runtime.status === "victory" || runtime.status === "defeat") {
      addIssue(issues, {
        code: "OBJECTIVE_INVALID",
        path: "status",
        message: "A terminal C20-026 runtime status requires a recorded campaign outcome."
      });
    }
  }

  if (!explicitOrderMatchesRecord(runtime.orderOrder, runtime.orders)) {
    addIssue(issues, {
      code: "ORDER_INVALID",
      path: "orderOrder",
      message: "Order order must contain every typed campaign order ID exactly once."
    });
  }
  runtime.orderOrder.forEach((id) => {
    const order = runtime.orders[id];
    if (!order) return;
    const invalidIdentity = order.id !== id
      || !runtime.factions[String(order.faction)]
      || !CAMPAIGN_ORDER_KINDS.has(order.kind)
      || !CAMPAIGN_ORDER_STATUSES.has(order.status)
      || (order.executionRefId !== null && typeof order.executionRefId !== "string")
      || !Number.isInteger(order.issuedSegment)
      || order.issuedSegment < 0
      || order.issuedSegment > runtime.currentSegment
      || !Number.isInteger(order.earliestStartSegment)
      || order.earliestStartSegment < order.issuedSegment;
    const invalidCollections = order.targetHexKeys.some((key) => typeof key !== "string" || key.length === 0)
      || order.formationIds.some((key) => typeof key !== "string" || key.length === 0)
      || order.dependencies.some((key) => typeof key !== "string" || key.length === 0)
      || new Set(order.reservationIds).size !== order.reservationIds.length;
    const invalidValidation = typeof order.validation?.valid !== "boolean"
      || !Array.isArray(order.validation?.issues)
      || !Number.isInteger(order.validation?.validatedRevision)
      || order.validation.valid !== (order.validation.issues.length === 0);
    const payload = order.payload as unknown as Record<string, unknown>;
    let invalidPayload = !payload || typeof payload !== "object";
    if (!invalidPayload && order.kind === "redeploy") {
      const exactFormationIds = payload.formationIds;
      const invalidExactFormationIds = exactFormationIds !== undefined
        && (!Array.isArray(exactFormationIds)
          || exactFormationIds.length === 0
          || exactFormationIds.some((formationId) => typeof formationId !== "string" || formationId.length === 0)
          || new Set(exactFormationIds).size !== exactFormationIds.length
          || computeCampaignContentHash([...exactFormationIds].sort()) !== computeCampaignContentHash([...order.formationIds].sort()));
      invalidPayload = typeof payload.originOffsetKey !== "string"
        || typeof payload.destinationOffsetKey !== "string"
        || !Array.isArray(payload.selections)
        || typeof payload.transportModeKey !== "string"
        || !isNonNegativeFinite(payload.distance)
        || !isNonNegativeFinite(payload.timeSegments)
        || !isNonNegativeFinite(payload.etaSegment)
        || !isNonNegativeFinite(payload.returnEtaSegment)
        || !isNonNegativeFinite(payload.fuelCost)
        || !isNonNegativeFinite(payload.suppliesCost)
        || !isNonNegativeFinite(payload.manpowerCost)
        || !isNonNegativeFinite(payload.transportCapacityCost)
        || invalidExactFormationIds;
    } else if (!invalidPayload && order.kind === "production") {
      const allocation = payload.allocation as Record<string, unknown> | undefined;
      invalidPayload = !allocation
        || !isNonNegativeFinite(allocation.supplies)
        || !isNonNegativeFinite(allocation.fuel)
        || !isNonNegativeFinite(allocation.ammo)
        || !isNonNegativeFinite(allocation.manpower)
        || !Number.isInteger(payload.effectiveSegment);
    } else if (!invalidPayload && order.kind === "infrastructureRepair") {
      invalidPayload = typeof payload.targetOffsetHexKey !== "string"
        || typeof payload.targetRuntimeHexKey !== "string"
        || typeof payload.role !== "string"
        || typeof payload.engineerFormationId !== "string"
        || !Number.isInteger(payload.sourceIntegrity)
        || !Number.isInteger(payload.targetIntegrity)
        || !Number.isInteger(payload.repairPoints)
        || !Number.isInteger(payload.repairRate)
        || !Number.isInteger(payload.durationSegments)
        || !Number.isInteger(payload.startSegment)
        || !Number.isInteger(payload.completeSegment)
        || !isNonNegativeFinite(payload.suppliesCost)
        || !isNonNegativeFinite(payload.manpowerCost);
    } else if (!invalidPayload) {
      invalidPayload = typeof payload.operationType !== "string"
        || typeof payload.targetHexKey !== "string"
        || !isNonNegativeFinite(payload.durationSegments)
        || !isNonNegativeFinite(payload.capacityCost)
        || !isNonNegativeFinite(payload.suppliesCost)
        || !isNonNegativeFinite(payload.fuelCost)
        || !Number.isInteger(payload.resolveSegment);
    }
    if (invalidIdentity || invalidCollections || invalidValidation || invalidPayload) {
      addIssue(issues, {
        code: "ORDER_INVALID",
        path: `orders.${id}`,
        message: `Typed campaign order ${id} has invalid identity, lifecycle, references, or validation state.`
      });
    }
  });

  if (!explicitOrderMatchesRecord(runtime.reservationOrder, runtime.reservations)) {
    addIssue(issues, {
      code: "RESERVATION_INVALID",
      path: "reservationOrder",
      message: "Reservation order must contain every campaign reservation ID exactly once."
    });
  }
  runtime.reservationOrder.forEach((id) => {
    const reservation = runtime.reservations[id];
    if (!reservation) return;
    const owner = runtime.orders[reservation.orderId];
    const invalid = reservation.id !== id
      || !owner
      || owner.faction !== reservation.faction
      || !owner.reservationIds.includes(id)
      || !CAMPAIGN_RESERVATION_KINDS.has(reservation.kind)
      || !CAMPAIGN_RESERVATION_STATUSES.has(reservation.status)
      || reservation.poolKey.trim().length === 0
      || !Number.isFinite(reservation.amount)
      || reservation.amount <= 0
      || !Number.isInteger(reservation.createdSegment)
      || reservation.createdSegment < 0
      || reservation.createdSegment > runtime.currentSegment;
    if (invalid) {
      addIssue(issues, {
        code: "RESERVATION_INVALID",
        path: `reservations.${id}`,
        message: `Campaign reservation ${id} has invalid identity, ownership, pool, amount, or lifecycle.`
      });
    }
  });
  runtime.orderOrder.forEach((orderId) => {
    const order = runtime.orders[orderId];
    if (!order) return;
    order.reservationIds.forEach((reservationId) => {
      if (runtime.reservations[reservationId]?.orderId !== orderId) {
        addIssue(issues, {
          code: "RESERVATION_INVALID",
          path: `orders.${orderId}.reservationIds`,
          message: `Order ${orderId} references missing or foreign reservation ${reservationId}.`
        });
      }
    });
    const invalidReservationLifecycle = order.reservationIds.some((reservationId) => {
      const reservation = runtime.reservations[reservationId];
      if (!reservation) return true;
      const expectedStatus = order.status === "draft"
        ? order.validation.valid ? "held" : "proposed"
        : order.status === "cancelled"
          ? "released"
          : (order.status === "completed" || order.status === "blocked") && reservation.kind !== "resource"
            ? "released"
            : "consumed";
      return reservation.status !== expectedStatus;
    });
    if (invalidReservationLifecycle) {
      addIssue(issues, {
        code: "RESERVATION_INVALID",
        path: `orders.${orderId}.reservationIds`,
        message: `Order ${orderId} reservation lifecycle does not match ${order.status} status.`
      });
    }
  });

  Object.entries(runtime.knowledgeByFaction).forEach(([faction, knowledge]) => {
    if (knowledge.faction !== faction) {
      addIssue(issues, {
        code: "KNOWLEDGE_OWNER_INVALID",
        path: `knowledgeByFaction.${faction}.faction`,
        message: `Knowledge state owner ${knowledge.faction} must match record key ${faction}.`
      });
    }
  });

  if (runtime.aiAssessmentsByFaction !== undefined) {
    if (typeof runtime.aiAssessmentsByFaction !== "object" || runtime.aiAssessmentsByFaction === null || Array.isArray(runtime.aiAssessmentsByFaction)) {
      addIssue(issues, {
        code: "AI_ASSESSMENT_INVALID",
        path: "aiAssessmentsByFaction",
        message: "AI assessments must be a faction-keyed record when present."
      });
    } else {
      Object.entries(runtime.aiAssessmentsByFaction).forEach(([faction, assessment]) => {
        const path = `aiAssessmentsByFaction.${faction}`;
        try {
          const scalarValid = assessment.version === CAMPAIGN_AI_ASSESSMENT_VERSION
            && assessment.faction === faction
            && Boolean(runtime.factions[faction])
            && assessment.id.trim().length > 0
            && Number.isInteger(assessment.sourceRevision)
            && assessment.sourceRevision >= 0
            && assessment.sourceRevision < runtime.revision
            && Number.isInteger(assessment.sourceSegment)
            && assessment.sourceSegment >= 0
            && assessment.generatedSegment === assessment.sourceSegment + 1
            && assessment.generatedSegment <= runtime.currentSegment
            && /^fnv1a32-[0-9a-f]{8}$/.test(assessment.sourceViewHash)
            && /^fnv1a32-[0-9a-f]{8}$/.test(assessment.integrityHash);
          const postureValid = ["preserve", "delay", "balanced", "pressure", "decisiveOffensive"].includes(assessment.posture);
          const numericValues = [
            assessment.forces.activeFormations,
            assessment.forces.combatReadyFormations,
            assessment.forces.committedFormations,
            assessment.forces.averageEffectiveStrength,
            assessment.forces.averageReadiness,
            assessment.forces.averageCohesion,
            assessment.forces.averageFatigue,
            assessment.forces.assessedEnemyPressure,
            assessment.reserves.availableFormations,
            assessment.reserves.requiredFormations,
            assessment.reserves.deficit,
            assessment.logistics.averageFormationSustainment,
            assessment.intelligence.visibleContacts,
            assessment.intelligence.currentContacts,
            assessment.intelligence.staleOrDisputedContacts,
            assessment.intelligence.highConfidenceContacts,
            assessment.intelligence.availableCollectionCapacity,
            assessment.objectivePressure.activeObjectives,
            assessment.objectivePressure.protectedObjectives,
            assessment.objectivePressure.threatenedObjectives,
            assessment.objectivePressure.urgentDeadlines,
            assessment.objectivePressure.scoreAtRisk
          ];
          const findings = [...assessment.threats, ...assessment.opportunities];
          const findingIds = findings.map((finding) => finding.id);
          const findingsValid = new Set(findingIds).size === findingIds.length
            && findings.every((finding) => finding.id.trim().length > 0
              && finding.targetHexKey.trim().length > 0
              && validBoundedPercent(finding.score)
              && finding.kind === (assessment.threats.includes(finding) ? "threat" : "opportunity")
              && ["routine", "important", "urgent", "critical"].includes(finding.priority)
              && ["low", "medium", "high"].includes(finding.confidence));
          let integrityValid = false;
          try {
            integrityValid = computeCampaignAIAssessmentIntegrity(assessment) === assessment.integrityHash;
          } catch {
            integrityValid = false;
          }
          if (!scalarValid
            || !postureValid
            || numericValues.some((value) => !isNonNegativeFinite(value))
            || !validBoundedPercent(assessment.forces.averageEffectiveStrength)
            || !validBoundedPercent(assessment.forces.averageReadiness)
            || !validBoundedPercent(assessment.forces.averageCohesion)
            || !validBoundedPercent(assessment.forces.averageFatigue)
            || !validBoundedPercent(assessment.logistics.averageFormationSustainment)
            || !findingsValid
            || !integrityValid) {
            addIssue(issues, {
              code: "AI_ASSESSMENT_INVALID",
              path,
              message: `AI assessment for ${faction} must retain valid ownership, timing, scores, findings, and integrity.`
            });
          }
        } catch {
          addIssue(issues, {
            code: "AI_ASSESSMENT_INVALID",
            path,
            message: `AI assessment for ${faction} is incomplete or malformed.`
          });
        }
      });
    }
  }

  validateAIPlanning(runtime, issues);
  validateAIBehaviors(runtime, issues);

  validateEventLog(runtime, issues);
  validateAdvanceLog(runtime, issues);
  return issues;
}

/**
 * WHAT: Fails fast when a candidate Campaign 2.0 runtime violates any invariant.
 * WHY: Creation and post-transaction commit paths must never return invalid authoritative truth.
 *
 * @param runtime - Candidate authoritative state.
 * @throws CampaignRuntimeError containing the first issue and total issue count.
 */
export function assertCampaignRuntimeState(runtime: CampaignRuntimeState): void {
  const issues = validateCampaignRuntimeState(runtime);
  if (issues.length === 0) {
    return;
  }
  const first = issues[0];
  throw new CampaignRuntimeError(
    "INVALID_RUNTIME",
    `Campaign runtime failed ${issues.length} invariant check(s). First issue: ${first.message}`,
    { issueCount: issues.length, firstCode: first.code, firstPath: first.path }
  );
}
