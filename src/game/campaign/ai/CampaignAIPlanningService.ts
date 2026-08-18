/**
 * MODULE: CampaignAIPlanningService
 * WHAT: Generates, scores, and selects a deterministic portfolio of belief-constrained operational plans.
 * WHY: The strategic opponent must coordinate scarce forces and retain intent across segments before issuing orders.
 */

import { hexDistance } from "../../../core/Hex";
import type { Axial } from "../../../core/types";
import { computeCampaignContentHash, createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import type { CampaignAIFinding, CampaignAIFriendlyFormationView } from "./CampaignAIAssessmentTypes";
import {
  CAMPAIGN_AI_PLANNING_VERSION,
  type CampaignAIOperationalPlanCandidate,
  type CampaignAIOperationalMemory,
  type CampaignAIPlanKind,
  type CampaignAIPlanningDifficulty,
  type CampaignAIPlanningInput,
  type CampaignAIPlanningPolicy,
  type CampaignAIPlanningRecord,
  type CampaignAIPlanResources,
  type CampaignAIPlanScoreBreakdown,
  type CampaignAIPlanTriggers,
  type CampaignAIRetiredPlan,
  type CampaignAISelectedPlan
} from "./CampaignAIPlanningTypes";

const ZERO_RESOURCES: CampaignAIPlanResources = Object.freeze({
  supplies: 0,
  fuel: 0,
  ammo: 0,
  manpower: 0,
  intelligenceCapacity: 0
});

const POLICIES: Readonly<Record<CampaignAIPlanningDifficulty, CampaignAIPlanningPolicy>> = Object.freeze({
  easier: Object.freeze({
    difficulty: "easier",
    planningHorizonSegments: 2,
    candidateLimit: 6,
    portfolioPlanLimit: 2,
    commitmentSegments: 2,
    minimumPlanScore: 48,
    riskTolerance: 35
  }),
  standard: Object.freeze({
    difficulty: "standard",
    planningHorizonSegments: 4,
    candidateLimit: 9,
    portfolioPlanLimit: 3,
    commitmentSegments: 3,
    minimumPlanScore: 42,
    riskTolerance: 55
  }),
  harder: Object.freeze({
    difficulty: "harder",
    planningHorizonSegments: 6,
    candidateLimit: 12,
    portfolioPlanLimit: 4,
    commitmentSegments: 4,
    minimumPlanScore: 38,
    riskTolerance: 70
  })
});

interface CandidateSeed {
  readonly kind: CampaignAIPlanKind;
  readonly targetHexKey: string;
  readonly finding: CampaignAIFinding | null;
  readonly requestedFormationCount: number;
  readonly summary: string;
  readonly durationSegments: number;
  readonly resources: CampaignAIPlanResources;
  readonly continuityPlan: CampaignAISelectedPlan | null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolvePolicy(input: CampaignAIPlanningInput): CampaignAIPlanningPolicy {
  if (!input.policy) return POLICIES.standard;
  if (typeof input.policy === "string") return POLICIES[input.policy];
  return {
    ...input.policy,
    planningHorizonSegments: Math.max(1, Math.round(input.policy.planningHorizonSegments)),
    candidateLimit: Math.max(1, Math.round(input.policy.candidateLimit)),
    portfolioPlanLimit: Math.max(1, Math.round(input.policy.portfolioPlanLimit)),
    commitmentSegments: Math.max(1, Math.round(input.policy.commitmentSegments)),
    minimumPlanScore: clampScore(input.policy.minimumPlanScore),
    riskTolerance: clampScore(input.policy.riskTolerance)
  };
}

function offsetKeyToAxial(offsetKey: string): Axial | null {
  const [columnText, rowText] = offsetKey.split(",");
  const column = Number(columnText);
  const row = Number(rowText);
  if (!Number.isInteger(column) || !Number.isInteger(row)) return null;
  return { q: column, r: row - Math.floor(column / 2) };
}

function runtimeKeyToAxial(runtimeKey: string | null): Axial | null {
  if (!runtimeKey) return null;
  const [qText, rText] = runtimeKey.split(",");
  const q = Number(qText);
  const r = Number(rText);
  return Number.isInteger(q) && Number.isInteger(r) ? { q, r } : null;
}

function runtimeKeyToOffsetKey(runtimeKey: string | null): string | null {
  const hex = runtimeKeyToAxial(runtimeKey);
  return hex ? `${hex.q},${hex.r + Math.floor(hex.q / 2)}` : null;
}

function availableFormations(input: CampaignAIPlanningInput): CampaignAIFriendlyFormationView[] {
  return input.friendlyFormations
    .filter((formation) => formation.status === "ready"
      && !formation.hasActiveOrder
      && formation.locationHexKey !== null
      && formation.readiness >= 45
      && formation.effectiveStrengthPercent >= 45)
    .sort((a, b) => b.readiness - a.readiness
      || b.effectiveStrengthPercent - a.effectiveStrengthPercent
      || a.id.localeCompare(b.id));
}

function preferredFormationIds(
  targetHexKey: string,
  formations: readonly CampaignAIFriendlyFormationView[],
  kind: CampaignAIPlanKind
): string[] {
  const target = offsetKeyToAxial(targetHexKey);
  return [...formations].sort((a, b) => {
    const aHex = runtimeKeyToAxial(a.locationHexKey);
    const bHex = runtimeKeyToAxial(b.locationHexKey);
    const aDistance = target && aHex ? hexDistance(target, aHex) : 99;
    const bDistance = target && bHex ? hexDistance(target, bHex) : 99;
    const mobilityBiasA = kind === "reinforceFront" || kind === "prepareOffensive" || kind === "counterattack"
      ? (a.mobile ? -3 : 0)
      : 0;
    const mobilityBiasB = kind === "reinforceFront" || kind === "prepareOffensive" || kind === "counterattack"
      ? (b.mobile ? -3 : 0)
      : 0;
    return (aDistance * 10 + mobilityBiasA - a.readiness * 0.05 - a.effectiveStrengthPercent * 0.03)
      - (bDistance * 10 + mobilityBiasB - b.readiness * 0.05 - b.effectiveStrengthPercent * 0.03)
      || a.id.localeCompare(b.id);
  }).map((formation) => formation.id);
}

function resourcesFor(kind: CampaignAIPlanKind): CampaignAIPlanResources {
  switch (kind) {
    case "defendObjective": return { supplies: 8, fuel: 2, ammo: 9, manpower: 0, intelligenceCapacity: 0 };
    case "reinforceFront": return { supplies: 6, fuel: 7, ammo: 3, manpower: 0, intelligenceCapacity: 0 };
    case "prepareOffensive": return { supplies: 13, fuel: 12, ammo: 14, manpower: 0, intelligenceCapacity: 0 };
    case "counterattack": return { supplies: 11, fuel: 10, ammo: 12, manpower: 0, intelligenceCapacity: 0 };
    case "withdraw": return { supplies: 4, fuel: 5, ammo: 0, manpower: 0, intelligenceCapacity: 0 };
    case "rebuildReserve": return { supplies: 8, fuel: 0, ammo: 3, manpower: 7, intelligenceCapacity: 0 };
    case "protectLogistics": return { supplies: 5, fuel: 4, ammo: 4, manpower: 3, intelligenceCapacity: 0 };
    case "interdictSupply": return { supplies: 6, fuel: 8, ammo: 6, manpower: 0, intelligenceCapacity: 1 };
    case "gatherIntelligence": return { supplies: 4, fuel: 3, ammo: 0, manpower: 0, intelligenceCapacity: 1 };
  }
}

function addResources(left: CampaignAIPlanResources, right: CampaignAIPlanResources): CampaignAIPlanResources {
  return {
    supplies: left.supplies + right.supplies,
    fuel: left.fuel + right.fuel,
    ammo: left.ammo + right.ammo,
    manpower: left.manpower + right.manpower,
    intelligenceCapacity: left.intelligenceCapacity + right.intelligenceCapacity
  };
}

function resourcesFit(used: CampaignAIPlanResources, request: CampaignAIPlanResources, budget: CampaignAIPlanResources): boolean {
  const total = addResources(used, request);
  return total.supplies <= budget.supplies
    && total.fuel <= budget.fuel
    && total.ammo <= budget.ammo
    && total.manpower <= budget.manpower
    && total.intelligenceCapacity <= budget.intelligenceCapacity;
}

function buildResourceBudget(input: CampaignAIPlanningInput): CampaignAIPlanResources {
  return {
    supplies: Math.max(0, Math.floor(input.economy.supplies * 0.4)),
    fuel: Math.max(0, Math.floor(input.economy.fuel * 0.4)),
    ammo: Math.max(0, Math.floor(input.economy.ammo * 0.4)),
    manpower: Math.max(0, Math.floor(input.economy.manpower * 0.3)),
    intelligenceCapacity: Math.max(0, Math.floor(input.availableCollectionCapacity))
  };
}

function signatureFor(kind: CampaignAIPlanKind, targetHexKey: string, objectiveKeys: readonly string[]): string {
  return `${kind}:${targetHexKey}:${[...objectiveKeys].sort().join("+") || "sector"}`;
}

function fallbackTarget(input: CampaignAIPlanningInput): string {
  return input.assessment.threats[0]?.targetHexKey
    ?? input.assessment.opportunities[0]?.targetHexKey
    ?? input.friendlyFormations.map((formation) => runtimeKeyToOffsetKey(formation.locationHexKey)).find((key): key is string => Boolean(key))
    ?? "0,0";
}

function generateSeeds(input: CampaignAIPlanningInput, policy: CampaignAIPlanningPolicy): CandidateSeed[] {
  const seeds: CandidateSeed[] = [];
  const add = (kind: CampaignAIPlanKind, finding: CampaignAIFinding | null, requested: number, summary: string): void => {
    seeds.push({
      kind,
      targetHexKey: finding?.targetHexKey ?? fallbackTarget(input),
      finding,
      requestedFormationCount: requested,
      summary,
      durationSegments: policy.planningHorizonSegments,
      resources: resourcesFor(kind),
      continuityPlan: null
    });
  };

  input.assessment.threats.slice(0, 3).forEach((threat) => {
    add(threat.objectiveKeys.length > 0 ? "defendObjective" : "reinforceFront", threat, threat.score >= 75 ? 2 : 1, threat.summary);
    if (input.assessment.posture === "pressure" || input.assessment.posture === "decisiveOffensive") {
      add("counterattack", threat, threat.score >= 70 ? 2 : 1, `Counterattack against ${threat.summary.toLowerCase()}`);
    }
  });

  input.assessment.opportunities.slice(0, 3).forEach((opportunity) => {
    const kind: CampaignAIPlanKind = opportunity.contactIds.length > 0 ? "counterattack" : "prepareOffensive";
    add(kind, opportunity, opportunity.score >= 75 ? 2 : 1, opportunity.summary);
    if (opportunity.contactIds.length > 0 && opportunity.score >= 55) {
      add("interdictSupply", opportunity, 1, `Interdict the reported weak sector near ${opportunity.targetHexKey}`);
    }
  });

  if (input.assessment.intelligence.uncertainty !== "low") {
    add("gatherIntelligence", input.assessment.threats[0] ?? input.assessment.opportunities[0] ?? null, 1, "Reduce operational uncertainty before commitment");
  }
  if (input.assessment.reserves.deficit > 0) {
    add("rebuildReserve", null, 0, "Rebuild a headquarters reserve");
  }
  if (input.assessment.logistics.state === "critical" || input.assessment.logistics.state === "strained") {
    add("protectLogistics", input.assessment.threats[0] ?? null, 1, "Protect theater logistics and restore sustainment");
  }
  if ((input.assessment.posture === "preserve" || input.assessment.posture === "delay") && input.assessment.threats[0]) {
    add("withdraw", input.assessment.threats[0], 1, "Trade space to preserve an exposed formation");
  }

  const existingSignatures = new Set(seeds.map((seed) => signatureFor(seed.kind, seed.targetHexKey, seed.finding?.objectiveKeys ?? [])));
  input.previousRecord?.memory.activePlans.forEach((plan) => {
    if (plan.commitmentUntilSegment < input.generatedSegment || existingSignatures.has(plan.signature)) return;
    seeds.push({
      kind: plan.kind,
      targetHexKey: plan.targetHexKey,
      finding: null,
      requestedFormationCount: plan.assignedFormationIds.length,
      summary: plan.summary,
      durationSegments: Math.max(1, plan.commitmentUntilSegment - input.generatedSegment + 1),
      resources: plan.resources,
      continuityPlan: plan
    });
  });

  const deduplicated = new Map<string, CandidateSeed>();
  seeds.forEach((seed) => {
    const signature = signatureFor(seed.kind, seed.targetHexKey, seed.finding?.objectiveKeys ?? seed.continuityPlan?.objectiveKeys ?? []);
    const existing = deduplicated.get(signature);
    if (!existing || (seed.finding?.score ?? seed.continuityPlan?.score ?? 0) > (existing.finding?.score ?? existing.continuityPlan?.score ?? 0)) {
      deduplicated.set(signature, seed);
    }
  });
  return [...deduplicated.values()];
}

function logisticsScore(input: CampaignAIPlanningInput): number {
  switch (input.assessment.logistics.state) {
    case "critical": return 18;
    case "strained": return 42;
    case "adequate": return 70;
    case "secure": return 92;
  }
}

function confidenceScore(input: CampaignAIPlanningInput, seed: CandidateSeed): number {
  if (seed.kind === "gatherIntelligence") {
    return input.assessment.intelligence.uncertainty === "high" ? 100 : input.assessment.intelligence.uncertainty === "moderate" ? 78 : 35;
  }
  if (!seed.finding) return 60;
  return seed.finding.confidence === "high" ? 92 : seed.finding.confidence === "medium" ? 68 : 40;
}

function exposureFor(kind: CampaignAIPlanKind, input: CampaignAIPlanningInput): number {
  const base = kind === "prepareOffensive" ? 62
    : kind === "counterattack" || kind === "interdictSupply" ? 52
      : kind === "reinforceFront" ? 35
        : kind === "withdraw" ? 20
          : 25;
  return clampScore(base - (input.assessment.forces.assessedBalance === "dominant" ? 18 : input.assessment.forces.assessedBalance === "favorable" ? 10 : 0));
}

function scoreSeed(
  input: CampaignAIPlanningInput,
  policy: CampaignAIPlanningPolicy,
  seed: CandidateSeed,
  formations: readonly CampaignAIFriendlyFormationView[],
  budget: CampaignAIPlanResources
): CampaignAIOperationalPlanCandidate {
  const objectiveKeys = seed.finding?.objectiveKeys ?? seed.continuityPlan?.objectiveKeys ?? [];
  const contactIds = seed.finding?.contactIds ?? seed.continuityPlan?.contactIds ?? [];
  const sourceFindingIds = seed.finding ? [seed.finding.id] : seed.continuityPlan?.sourceFindingIds ?? [];
  const signature = signatureFor(seed.kind, seed.targetHexKey, objectiveKeys);
  const matchingActive = input.previousRecord?.memory.activePlans.find((plan) => plan.signature === signature) ?? seed.continuityPlan;
  const eligibleFormations = formations.filter((formation) => !formation.hasActiveOrder || matchingActive?.assignedFormationIds.includes(formation.id));
  const rankedPreferred = preferredFormationIds(seed.targetHexKey, eligibleFormations, seed.kind);
  const preferred = matchingActive
    ? [
      ...matchingActive.assignedFormationIds.filter((id) => rankedPreferred.includes(id)),
      ...rankedPreferred.filter((id) => !matchingActive.assignedFormationIds.includes(id))
    ]
    : rankedPreferred;
  const proposed = preferred.slice(0, seed.requestedFormationCount);
  const proposedRecords = proposed.map((id) => formations.find((formation) => formation.id === id)).filter((formation): formation is CampaignAIFriendlyFormationView => Boolean(formation));
  const averageStrength = proposedRecords.length > 0
    ? proposedRecords.reduce((sum, formation) => sum + formation.effectiveStrengthPercent, 0) / proposedRecords.length
    : seed.requestedFormationCount === 0 ? 85 : 0;
  const reserveRemaining = Math.max(0, formations.length - seed.requestedFormationCount);
  const reserveNeed = input.assessment.reserves.requiredFormations;
  const repetitionCount = input.previousRecord?.memory.repetitionBySignature[signature] ?? 0;
  const urgency = seed.finding?.score ?? (matchingActive ? matchingActive.score : seed.kind === "rebuildReserve" ? 68 : 55);
  const exposure = exposureFor(seed.kind, input);
  const downside = clampScore(
    (input.assessment.logistics.state === "critical" ? 35 : input.assessment.logistics.state === "strained" ? 18 : 0)
      + (input.assessment.forces.assessedBalance === "critical" ? 35 : input.assessment.forces.assessedBalance === "unfavorable" ? 20 : 0)
      + Math.max(0, exposure - policy.riskTolerance) * 0.5
  );
  const breakdown: CampaignAIPlanScoreBreakdown = {
    objectiveValue: clampScore((objectiveKeys.length > 0 ? 68 : 42) + (seed.finding?.score ?? 0) * 0.25),
    forceAdequacy: clampScore(averageStrength * 1.2),
    urgency: clampScore(urgency),
    logisticsSupport: logisticsScore(input),
    intelligenceConfidence: confidenceScore(input, seed),
    reserveHealth: reserveRemaining >= reserveNeed ? 90 : reserveRemaining === reserveNeed - 1 ? 58 : 25,
    continuityBonus: matchingActive ? (matchingActive.commitmentUntilSegment >= input.generatedSegment ? 22 : 12) : 0,
    exposurePenalty: exposure,
    downsidePenalty: downside,
    repetitionPenalty: Math.min(24, repetitionCount * 6)
  };
  const supportBonus = seed.kind === "rebuildReserve" && input.assessment.reserves.deficit > 0 ? 14
    : seed.kind === "protectLogistics" && input.assessment.logistics.state === "critical" ? 16
      : seed.kind === "gatherIntelligence" && input.assessment.intelligence.uncertainty === "high" ? 14
        : 0;
  const total = clampScore(
    breakdown.objectiveValue * 0.2
      + breakdown.forceAdequacy * 0.17
      + breakdown.urgency * 0.16
      + breakdown.logisticsSupport * 0.1
      + breakdown.intelligenceConfidence * 0.1
      + breakdown.reserveHealth * 0.12
      + breakdown.continuityBonus
      + supportBonus
      - breakdown.exposurePenalty * 0.07
      - breakdown.downsidePenalty * 0.08
      - breakdown.repetitionPenalty
  );
  const rejectionReasons: string[] = [];
  if (proposed.length < seed.requestedFormationCount) rejectionReasons.push("Insufficient legally available formations.");
  if (!resourcesFit(ZERO_RESOURCES, seed.resources, budget)) rejectionReasons.push("The candidate exceeds the planning-cycle resource budget.");
  if (seed.resources.intelligenceCapacity > input.availableCollectionCapacity) rejectionReasons.push("No intelligence collection capacity is available.");
  if (seed.requestedFormationCount > 0 && reserveRemaining < Math.max(0, reserveNeed - (urgency >= 80 ? 1 : 0))) {
    rejectionReasons.push("The commitment would consume the protected reserve below the emergency floor.");
  }
  return {
    id: createStableCampaignRecordId("ai-plan-candidate", input.campaignId, input.faction, input.sourceRevision, input.generatedSegment, signature),
    signature,
    kind: seed.kind,
    targetHexKey: seed.targetHexKey,
    sourceFindingIds,
    objectiveKeys,
    contactIds,
    requestedFormationCount: seed.requestedFormationCount,
    preferredFormationIds: preferred,
    durationSegments: seed.durationSegments,
    resources: seed.resources,
    scoreBreakdown: breakdown,
    score: total,
    viable: rejectionReasons.length === 0,
    rejectionReasons,
    summary: seed.summary,
    rationale: [
      `Operational value ${breakdown.objectiveValue}; urgency ${breakdown.urgency}; force adequacy ${breakdown.forceAdequacy}.`,
      `Logistics ${breakdown.logisticsSupport}; intelligence confidence ${breakdown.intelligenceConfidence}; reserve health ${breakdown.reserveHealth}.`,
      matchingActive ? `Continuity adds ${breakdown.continuityBonus} while the prior commitment remains relevant.` : "No active-plan continuity bonus applies.",
      rejectionReasons.length > 0 ? rejectionReasons.join(" ") : `Candidate is legal inside the projected planning budget.`
    ]
  };
}

function triggersFor(kind: CampaignAIPlanKind): CampaignAIPlanTriggers {
  const reinforce = kind === "defendObjective" || kind === "reinforceFront"
    ? ["Threat pressure rises one priority band.", "Assigned force adequacy falls below 60."]
    : ["A new critical threat enters the plan sector."];
  const exploit = kind === "prepareOffensive" || kind === "counterattack" || kind === "interdictSupply"
    ? ["The target contact becomes disrupted or isolated.", "Projected resistance falls below the committed force band."]
    : ["A high-confidence opportunity appears inside the plan sector."];
  return {
    reinforce,
    exploit,
    abort: ["Logistics becomes critical.", "The source contact becomes disputed without corroboration.", "A decisive objective elsewhere becomes critical."],
    withdraw: ["Assigned formations fall below 40 readiness.", "Assessed local balance becomes critical."]
  };
}

function selectPortfolio(
  input: CampaignAIPlanningInput,
  policy: CampaignAIPlanningPolicy,
  candidates: readonly CampaignAIOperationalPlanCandidate[],
  formations: readonly CampaignAIFriendlyFormationView[],
  budget: CampaignAIPlanResources
): { selected: CampaignAISelectedPlan[]; used: CampaignAIPlanResources; heldReserveFormationIds: string[]; rationale: string[] } {
  const selected: CampaignAISelectedPlan[] = [];
  const usedFormationIds = new Set<string>();
  let used = { ...ZERO_RESOURCES };
  const ordered = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  for (const candidate of ordered) {
    if (selected.length >= policy.portfolioPlanLimit) break;
    if (!candidate.viable || candidate.score < policy.minimumPlanScore || !resourcesFit(used, candidate.resources, budget)) continue;
    const assigned = candidate.preferredFormationIds.filter((id) => !usedFormationIds.has(id)).slice(0, candidate.requestedFormationCount);
    if (assigned.length < candidate.requestedFormationCount) continue;
    const reserveAfter = formations.length - usedFormationIds.size - assigned.length;
    const emergencyDraw = candidate.scoreBreakdown.urgency >= 80 ? 1 : 0;
    if (reserveAfter < Math.max(0, input.assessment.reserves.requiredFormations - emergencyDraw)) continue;
    const previous = input.previousRecord?.memory.activePlans.find((plan) => plan.signature === candidate.signature) ?? null;
    const startedSegment = previous?.startedSegment ?? input.generatedSegment;
    const planId = previous?.planId
      ?? createStableCampaignRecordId("ai-operational-plan", input.campaignId, input.faction, candidate.signature, startedSegment);
    selected.push({
      planId,
      candidateId: candidate.id,
      signature: candidate.signature,
      kind: candidate.kind,
      targetHexKey: candidate.targetHexKey,
      sourceFindingIds: candidate.sourceFindingIds,
      objectiveKeys: candidate.objectiveKeys,
      contactIds: candidate.contactIds,
      assignedFormationIds: assigned,
      resources: candidate.resources,
      score: candidate.score,
      startedSegment,
      lastReviewedSegment: input.generatedSegment,
      commitmentUntilSegment: previous
        ? Math.max(previous.commitmentUntilSegment, input.generatedSegment)
        : input.generatedSegment + policy.commitmentSegments - 1,
      triggers: triggersFor(candidate.kind),
      summary: candidate.summary
    });
    assigned.forEach((id) => usedFormationIds.add(id));
    used = addResources(used, candidate.resources);
  }
  const remaining = formations.filter((formation) => !usedFormationIds.has(formation.id));
  const heldReserveFormationIds = remaining
    .slice(0, input.assessment.reserves.requiredFormations)
    .map((formation) => formation.id);
  return {
    selected,
    used,
    heldReserveFormationIds,
    rationale: [
      `${candidates.filter((candidate) => candidate.viable).length} viable candidates were ranked from ${candidates.length} evaluated options.`,
      `${selected.length} plans fit the ${policy.difficulty} portfolio limit and common resource constraints.`,
      `${heldReserveFormationIds.length} formations remain designated as headquarters reserve.`,
      selected.length > 0
        ? `Lead plan: ${selected[0].summary} (${selected[0].score}).`
        : "No candidate cleared legality, reserve, resource, and minimum-score gates."
    ]
  };
}

function updateMemory(input: CampaignAIPlanningInput, selected: readonly CampaignAISelectedPlan[]): CampaignAIOperationalMemory {
  const selectedIds = new Set(selected.map((plan) => plan.planId));
  const retired: CampaignAIRetiredPlan[] = (input.previousRecord?.memory.activePlans ?? [])
    .filter((plan) => !selectedIds.has(plan.planId))
    .map((plan) => ({
      planId: plan.planId,
      signature: plan.signature,
      kind: plan.kind,
      targetHexKey: plan.targetHexKey,
      startedSegment: plan.startedSegment,
      retiredSegment: input.generatedSegment,
      outcome: "superseded" as const,
      finalScore: plan.score
    }));
  const recentPlans = [...retired, ...(input.previousRecord?.memory.recentPlans ?? [])]
    .sort((a, b) => b.retiredSegment - a.retiredSegment || a.planId.localeCompare(b.planId))
    .slice(0, 12);
  const repetitionBySignature: Record<string, number> = {};
  recentPlans.forEach((plan) => {
    repetitionBySignature[plan.signature] = Math.min(4, (repetitionBySignature[plan.signature] ?? 0) + 1);
  });
  return { activePlans: selected, recentPlans, repetitionBySignature };
}

/** Recomputes planning integrity without trusting the stored value. */
export function computeCampaignAIPlanningIntegrity(
  record: Omit<CampaignAIPlanningRecord, "integrityHash"> | CampaignAIPlanningRecord
): string {
  const { integrityHash: _ignored, ...content } = record as CampaignAIPlanningRecord;
  return computeCampaignContentHash(content);
}

/** Generates one deterministic operational portfolio from legal projected inputs only. */
export function planCampaignAIOperations(input: CampaignAIPlanningInput): CampaignAIPlanningRecord {
  if (input.faction !== input.assessment.faction
    || input.economy.faction !== input.faction
    || input.sourceRevision !== input.assessment.sourceRevision
    || input.sourceSegment !== input.assessment.sourceSegment
    || input.generatedSegment !== input.assessment.generatedSegment) {
    throw new Error("Campaign AI planning input must match its faction-owned source assessment boundary.");
  }
  const policy = resolvePolicy(input);
  const ordinaryAvailable = availableFormations(input);
  const priorAssignedIds = new Set(input.previousRecord?.memory.activePlans.flatMap((plan) => plan.assignedFormationIds) ?? []);
  const continuingFormations = input.friendlyFormations.filter((formation) => priorAssignedIds.has(formation.id)
    && formation.locationHexKey !== null
    && !["destroyed", "captured", "shattered"].includes(formation.status));
  const formationsById = new Map<string, CampaignAIFriendlyFormationView>();
  [...ordinaryAvailable, ...continuingFormations].forEach((formation) => formationsById.set(formation.id, formation));
  const formations = [...formationsById.values()].sort((a, b) => a.id.localeCompare(b.id));
  const budget = buildResourceBudget(input);
  const seeds = generateSeeds(input, policy);
  const candidates = seeds
    .map((seed) => scoreSeed(input, policy, seed, formations, budget))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, policy.candidateLimit);
  const selection = selectPortfolio(input, policy, candidates, formations, budget);
  const memory = updateMemory(input, selection.selected);
  const portfolioScore = selection.selected.length > 0
    ? Math.round(selection.selected.reduce((sum, plan) => sum + plan.score, 0) / selection.selected.length)
    : 0;
  const sourcePlanningHash = computeCampaignContentHash({
    faction: input.faction,
    campaignId: input.campaignId,
    sourceRevision: input.sourceRevision,
    sourceSegment: input.sourceSegment,
    generatedSegment: input.generatedSegment,
    assessmentIntegrity: input.assessment.integrityHash,
    friendlyFormations: input.friendlyFormations,
    economy: input.economy,
    availableCollectionCapacity: input.availableCollectionCapacity,
    previousRecord: input.previousRecord ? { id: input.previousRecord.id, integrityHash: input.previousRecord.integrityHash } : null,
    policy
  });
  const recordWithoutIntegrity: Omit<CampaignAIPlanningRecord, "integrityHash"> = {
    version: CAMPAIGN_AI_PLANNING_VERSION,
    id: createStableCampaignRecordId("ai-planning", input.campaignId, input.faction, input.sourceRevision, input.generatedSegment, sourcePlanningHash),
    faction: input.faction,
    assessmentId: input.assessment.id,
    sourceRevision: input.sourceRevision,
    sourceSegment: input.sourceSegment,
    generatedSegment: input.generatedSegment,
    sourceAssessmentIntegrity: input.assessment.integrityHash,
    sourcePlanningHash,
    policy,
    portfolio: {
      candidates,
      selectedPlans: selection.selected,
      heldReserveFormationIds: selection.heldReserveFormationIds,
      availableFormationIds: formations.map((formation) => formation.id),
      resourceBudget: budget,
      resourceCommitted: selection.used,
      score: portfolioScore,
      rationale: selection.rationale
    },
    memory
  };
  return {
    ...recordWithoutIntegrity,
    integrityHash: computeCampaignAIPlanningIntegrity(recordWithoutIntegrity)
  };
}
