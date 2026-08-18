/**
 * MODULE: CampaignAIAssessmentService
 * WHAT: Produces deterministic posture, threat, opportunity, reserve, logistics, and objective assessments.
 * WHY: Strategic AI needs an explainable belief-constrained picture before it can generate or score legal plans.
 */

import { hexDistance } from "../../../core/Hex";
import type { Axial } from "../../../core/types";
import type {
  CampaignEnemyContactView,
  IntelConfidenceBand,
  IntelStrengthBand
} from "../../../core/campaignIntelTypes";
import { computeCampaignContentHash, createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import {
  CAMPAIGN_AI_ASSESSMENT_VERSION,
  type CampaignAIAssessmentInput,
  type CampaignAIFinding,
  type CampaignAIFindingPriority,
  type CampaignAIForceAssessment,
  type CampaignAIForceBalance,
  type CampaignAIFriendlyFormationView,
  type CampaignAIIntelligenceAssessment,
  type CampaignAILogisticsAssessment,
  type CampaignAILogisticsState,
  type CampaignAIObjectivePressureAssessment,
  type CampaignAIObjectiveView,
  type CampaignAIPosture,
  type CampaignAIReserveAssessment,
  type CampaignAITheaterAssessment
} from "./CampaignAIAssessmentTypes";

const ACTIVE_FORMATION_STATUSES = new Set(["ready", "committed", "inTransit", "isolated", "refitting"]);
const STRENGTH_SCORE: Readonly<Record<IntelStrengthBand, number>> = Object.freeze({
  trace: 12,
  light: 25,
  moderate: 45,
  heavy: 68,
  massed: 88
});
const CONFIDENCE_FACTOR: Readonly<Record<IntelConfidenceBand, number>> = Object.freeze({
  low: 0.55,
  medium: 0.75,
  high: 1
});

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: readonly number[]): number {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

/** Converts the campaign UI's odd-column offset key into authoritative axial coordinates. */
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

function axialToOffsetKey(hex: Axial): string {
  return `${hex.q},${hex.r + Math.floor(hex.q / 2)}`;
}

function priorityForScore(score: number): CampaignAIFindingPriority {
  if (score >= 80) return "critical";
  if (score >= 60) return "urgent";
  if (score >= 35) return "important";
  return "routine";
}

function contactBaseScore(contact: CampaignEnemyContactView): number {
  const strength = contact.strengthBand ? STRENGTH_SCORE[contact.strengthBand] : 34;
  const stateFactor = contact.state === "current" ? 1 : contact.state === "stale" ? 0.78 : 0.68;
  const ageFactor = Math.max(0.55, 1 - contact.ageSegments * 0.08);
  const condition = contact.readinessBand === "high" ? 10
    : contact.readinessBand === "ready" ? 5
      : contact.readinessBand === "disrupted" ? -12
        : 0;
  const supply = contact.supplyBand === "wellSupplied" ? 6
    : contact.supplyBand === "isolated" ? -15
      : contact.supplyBand === "strained" ? -8
        : 0;
  return clampScore((strength + condition + supply) * CONFIDENCE_FACTOR[contact.confidenceBand] * stateFactor * ageFactor);
}

function nearestDistance(hex: Axial, candidates: readonly Axial[]): number | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => Math.min(best, hexDistance(hex, candidate)), Number.POSITIVE_INFINITY);
}

function objectiveIsProtected(objective: CampaignAIObjectiveView, faction: string): boolean {
  return objective.requiredFaction === faction
    ? objective.currentController === faction
    : objective.currentController !== objective.requiredFaction;
}

function activeObjectives(input: CampaignAIAssessmentInput): CampaignAIObjectiveView[] {
  return input.objectives.filter((objective) => objective.status === "active");
}

function protectedObjectives(input: CampaignAIAssessmentInput): CampaignAIObjectiveView[] {
  return activeObjectives(input).filter((objective) => objective.controlRelevant && objectiveIsProtected(objective, String(input.faction)));
}

function buildThreats(input: CampaignAIAssessmentInput): CampaignAIFinding[] {
  const friendlyHexes = input.friendlyFormations
    .map((formation) => runtimeKeyToAxial(formation.locationHexKey))
    .filter((hex): hex is Axial => hex !== null);
  const protectedValues = protectedObjectives(input);
  const results = input.operationalPicture.enemyContacts.flatMap((contact): CampaignAIFinding[] => {
    const contactHex = offsetKeyToAxial(contact.locationHexKey);
    if (!contactHex) return [];
    const nearbyObjectives = protectedValues
      .map((objective) => ({ objective, hex: runtimeKeyToAxial(objective.runtimeHexKey) }))
      .filter((entry): entry is { objective: CampaignAIObjectiveView; hex: Axial } => entry.hex !== null)
      .map((entry) => ({ ...entry, distance: hexDistance(contactHex, entry.hex) }))
      .filter((entry) => entry.distance <= 4 + contact.uncertaintyRadius)
      .sort((a, b) => a.distance - b.distance || b.objective.score - a.objective.score || a.objective.key.localeCompare(b.objective.key));
    const closestObjective = nearbyObjectives[0] ?? null;
    const friendlyDistance = nearestDistance(contactHex, friendlyHexes);
    const base = contactBaseScore(contact);
    const objectiveBonus = closestObjective
      ? Math.max(8, 34 - closestObjective.distance * 6) + Math.min(14, closestObjective.objective.score / 10)
      : 0;
    const friendlyBonus = friendlyDistance !== null && friendlyDistance <= 2 + contact.uncertaintyRadius
      ? Math.max(4, 18 - friendlyDistance * 5)
      : 0;
    const movementBonus = contact.movementState === "moving" || contact.movementState === "preparing" ? 7 : 0;
    const score = clampScore(base + objectiveBonus + friendlyBonus + movementBonus);
    if (score < 18) return [];
    const objectiveKeys = closestObjective ? [closestObjective.objective.key] : [];
    const factors = [
      contact.strengthBand ? `${contact.strengthBand} reported strength` : "strength not yet classified",
      `${contact.confidenceBand} confidence`,
      contact.state === "current" ? "current contact" : `${contact.state} contact`,
      ...(closestObjective ? [`${closestObjective.distance} hexes from ${closestObjective.objective.label}`] : []),
      ...(friendlyDistance !== null && friendlyDistance <= 3 ? [`${friendlyDistance} hexes from friendly forces`] : [])
    ];
    const summary = closestObjective
      ? `${contact.label} threatens ${closestObjective.objective.label}`
      : `${contact.label} creates sector pressure`;
    return [{
      id: createStableCampaignRecordId("ai-threat", input.campaignId, input.faction, input.sourceRevision, contact.id, objectiveKeys),
      kind: "threat",
      targetHexKey: contact.locationHexKey,
      score,
      priority: priorityForScore(score),
      confidence: contact.confidenceBand,
      summary,
      detail: closestObjective
        ? `The projected contact can influence a protected objective inside its current uncertainty area.`
        : `The projected contact is close enough to friendly forces to merit command attention.`,
      factors,
      contactIds: [contact.id],
      objectiveKeys
    }];
  });
  return results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 8);
}

function closestFriendlyDistance(objective: CampaignAIObjectiveView, formations: readonly CampaignAIFriendlyFormationView[]): number | null {
  const objectiveHex = runtimeKeyToAxial(objective.runtimeHexKey);
  if (!objectiveHex) return null;
  const formationHexes = formations
    .filter((formation) => ACTIVE_FORMATION_STATUSES.has(formation.status))
    .map((formation) => runtimeKeyToAxial(formation.locationHexKey))
    .filter((hex): hex is Axial => hex !== null);
  return nearestDistance(objectiveHex, formationHexes);
}

function contactPressureNearObjective(input: CampaignAIAssessmentInput, objective: CampaignAIObjectiveView): number {
  const objectiveHex = runtimeKeyToAxial(objective.runtimeHexKey);
  if (!objectiveHex) return 0;
  return input.operationalPicture.enemyContacts.reduce((pressure, contact) => {
    const hex = offsetKeyToAxial(contact.locationHexKey);
    if (!hex || hexDistance(hex, objectiveHex) > 3 + contact.uncertaintyRadius) return pressure;
    return pressure + contactBaseScore(contact);
  }, 0);
}

function buildOpportunities(input: CampaignAIAssessmentInput): CampaignAIFinding[] {
  const results: CampaignAIFinding[] = [];
  for (const objective of activeObjectives(input)) {
    if (!objective.controlRelevant) continue;
    if (objectiveIsProtected(objective, String(input.faction))) continue;
    const friendlyDistance = closestFriendlyDistance(objective, input.friendlyFormations);
    if (friendlyDistance === null) continue;
    const deadline = objective.deadlineSegment === null ? null : objective.deadlineSegment - input.sourceSegment;
    const deadlineBonus = deadline !== null && deadline <= 8 ? Math.max(0, 22 - deadline * 2) : 0;
    const proximityBonus = Math.max(0, 28 - friendlyDistance * 5);
    const resistancePenalty = Math.min(35, Math.round(contactPressureNearObjective(input, objective) * 0.35));
    const score = clampScore(30 + Math.min(22, objective.score / 5) + deadlineBonus + proximityBonus - resistancePenalty);
    const action = objective.requiredFaction === input.faction ? "secure" : "deny";
    results.push({
      id: createStableCampaignRecordId("ai-opportunity", input.campaignId, input.faction, input.sourceRevision, objective.key, action),
      kind: "opportunity",
      targetHexKey: axialToOffsetKey(runtimeKeyToAxial(objective.runtimeHexKey)!),
      score,
      priority: priorityForScore(score),
      confidence: resistancePenalty > 20 ? "low" : resistancePenalty > 0 ? "medium" : "high",
      summary: `${action === "secure" ? "Secure" : "Contest"} ${objective.label}`,
      detail: action === "secure"
        ? `Friendly forces can advance the faction's objective from the projected operational picture.`
        : `Control of this location would obstruct the opposing faction's public objective.`,
      factors: [
        `${objective.category} objective worth ${objective.score} points`,
        `${friendlyDistance} hexes from the nearest active friendly formation`,
        resistancePenalty > 0 ? "projected enemy resistance nearby" : "no projected enemy resistance nearby",
        ...(deadline !== null ? [`${Math.max(0, deadline)} segments to deadline`] : [])
      ],
      contactIds: [],
      objectiveKeys: [objective.key]
    });
  }
  for (const contact of input.operationalPicture.enemyContacts) {
    const weakness = contact.readinessBand === "disrupted" || contact.readinessBand === "degraded"
      || contact.supplyBand === "isolated" || contact.supplyBand === "strained";
    if (!weakness) continue;
    const contactHex = offsetKeyToAxial(contact.locationHexKey);
    if (!contactHex) continue;
    const formationDistance = nearestDistance(contactHex, input.friendlyFormations
      .map((formation) => runtimeKeyToAxial(formation.locationHexKey))
      .filter((hex): hex is Axial => hex !== null));
    const score = clampScore(42 + (formationDistance === null ? 0 : Math.max(0, 24 - formationDistance * 4))
      + (contact.supplyBand === "isolated" ? 15 : 0)
      + (contact.readinessBand === "disrupted" ? 12 : 0));
    results.push({
      id: createStableCampaignRecordId("ai-opportunity", input.campaignId, input.faction, input.sourceRevision, contact.id, "weakness"),
      kind: "opportunity",
      targetHexKey: contact.locationHexKey,
      score,
      priority: priorityForScore(score),
      confidence: contact.confidenceBand,
      summary: `Exploit weakness in ${contact.label}`,
      detail: `Projected readiness or supply reporting indicates a bounded exploitation window.`,
      factors: [
        ...(contact.readinessBand ? [`${contact.readinessBand} assessed readiness`] : []),
        ...(contact.supplyBand ? [`${contact.supplyBand} assessed supply`] : []),
        ...(formationDistance !== null ? [`${formationDistance} hexes from friendly forces`] : [])
      ],
      contactIds: [contact.id],
      objectiveKeys: []
    });
  }
  return results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 8);
}

function assessedEnemyPressure(input: CampaignAIAssessmentInput): number {
  return Math.round(input.operationalPicture.enemyContacts.reduce((sum, contact) => sum + contactBaseScore(contact), 0));
}

function forceBalance(ownStrength: number, enemyPressure: number, contacts: number): CampaignAIForceBalance {
  if (contacts === 0) return "unknown";
  const ratio = ownStrength / Math.max(1, enemyPressure);
  if (ratio < 0.55) return "critical";
  if (ratio < 0.85) return "unfavorable";
  if (ratio < 1.2) return "even";
  if (ratio < 1.75) return "favorable";
  return "dominant";
}

function assessForces(input: CampaignAIAssessmentInput): CampaignAIForceAssessment {
  const active = input.friendlyFormations.filter((formation) => ACTIVE_FORMATION_STATUSES.has(formation.status));
  const pressure = assessedEnemyPressure(input);
  const ownStrength = active.reduce((sum, formation) => sum + formation.effectiveStrengthPercent, 0);
  return {
    activeFormations: active.length,
    combatReadyFormations: active.filter((formation) => formation.status === "ready" && formation.readiness >= 60 && formation.effectiveStrengthPercent >= 60).length,
    committedFormations: active.filter((formation) => formation.status === "committed" || formation.hasActiveOrder).length,
    averageEffectiveStrength: average(active.map((formation) => formation.effectiveStrengthPercent)),
    averageReadiness: average(active.map((formation) => formation.readiness)),
    averageCohesion: average(active.map((formation) => formation.cohesion)),
    averageFatigue: average(active.map((formation) => formation.fatigue)),
    assessedEnemyPressure: pressure,
    assessedBalance: forceBalance(ownStrength, pressure, input.operationalPicture.enemyContacts.length)
  };
}

function assessReserves(input: CampaignAIAssessmentInput, threats: readonly CampaignAIFinding[]): CampaignAIReserveAssessment {
  const active = input.friendlyFormations.filter((formation) => ACTIVE_FORMATION_STATUSES.has(formation.status));
  const available = active.filter((formation) => formation.status === "ready"
    && !formation.hasActiveOrder
    && formation.readiness >= 60
    && formation.effectiveStrengthPercent >= 60).length;
  const criticalThreats = threats.filter((threat) => threat.priority === "critical").length;
  const required = active.length === 0 ? 0 : Math.max(1, Math.ceil(active.length * 0.2)) + Math.min(2, criticalThreats);
  return {
    availableFormations: available,
    requiredFormations: required,
    deficit: Math.max(0, required - available),
    adequate: available >= required
  };
}

function logisticsThreshold(activeFormations: number, level: "critical" | "strained", resource: "supplies" | "fuel" | "ammo" | "manpower"): number {
  const critical = resource === "fuel" ? 3 : resource === "manpower" ? 2 : 5;
  const strained = resource === "fuel" ? 10 : resource === "manpower" ? 8 : 15;
  return Math.max(1, activeFormations) * (level === "critical" ? critical : strained);
}

function assessLogistics(input: CampaignAIAssessmentInput, activeFormations: number): CampaignAILogisticsAssessment {
  const resources = ["supplies", "fuel", "ammo", "manpower"] as const;
  const critical = resources.filter((resource) => input.economy[resource] < logisticsThreshold(activeFormations, "critical", resource));
  const strained = resources.filter((resource) => input.economy[resource] < logisticsThreshold(activeFormations, "strained", resource));
  const sustainment = average(input.friendlyFormations
    .filter((formation) => ACTIVE_FORMATION_STATUSES.has(formation.status))
    .map((formation) => formation.sustainmentPercent));
  let state: CampaignAILogisticsState = "secure";
  if (critical.length > 0 || sustainment < 25) state = "critical";
  else if (strained.length > 0 || sustainment < 50) state = "strained";
  else if (sustainment < 75) state = "adequate";
  const lowResourceKeys = state === "critical" ? critical : state === "strained" ? strained : [];
  return {
    state,
    averageFormationSustainment: sustainment,
    lowResourceKeys,
    explanation: lowResourceKeys.length > 0
      ? `${state === "critical" ? "Critical" : "Limited"} theater stocks: ${lowResourceKeys.join(", ")}.`
      : state === "secure"
        ? "Theater stocks and formation sustainment support continued operations."
        : `Formation sustainment averages ${sustainment}%.`
  };
}

function assessIntelligence(input: CampaignAIAssessmentInput): CampaignAIIntelligenceAssessment {
  const contacts = input.operationalPicture.enemyContacts;
  const stale = contacts.filter((contact) => contact.state === "stale" || contact.state === "disputed").length;
  const high = contacts.filter((contact) => contact.confidenceBand === "high").length;
  const uncertainty = contacts.length === 0 || stale > contacts.length / 2 || high === 0
    ? "high"
    : high >= Math.ceil(contacts.length / 2) && stale === 0
      ? "low"
      : "moderate";
  return {
    visibleContacts: contacts.length,
    currentContacts: contacts.filter((contact) => contact.state === "current").length,
    staleOrDisputedContacts: stale,
    highConfidenceContacts: high,
    availableCollectionCapacity: input.operationalPicture.capacity.available,
    uncertainty
  };
}

function assessObjectivePressure(
  input: CampaignAIAssessmentInput,
  threats: readonly CampaignAIFinding[]
): CampaignAIObjectivePressureAssessment {
  const active = activeObjectives(input);
  const protectedValues = protectedObjectives(input);
  const threatenedKeys = new Set(threats.flatMap((threat) => threat.objectiveKeys));
  const deadlineDistances = active
    .flatMap((objective) => objective.deadlineSegment === null ? [] : [Math.max(0, objective.deadlineSegment - input.sourceSegment)]);
  return {
    activeObjectives: active.length,
    protectedObjectives: protectedValues.length,
    threatenedObjectives: protectedValues.filter((objective) => threatenedKeys.has(objective.key)).length,
    urgentDeadlines: deadlineDistances.filter((distance) => distance <= 8).length,
    scoreAtRisk: protectedValues.filter((objective) => threatenedKeys.has(objective.key)).reduce((sum, objective) => sum + objective.score, 0),
    nearestDeadlineSegments: deadlineDistances.length > 0 ? Math.min(...deadlineDistances) : null
  };
}

function choosePosture(
  forces: CampaignAIForceAssessment,
  reserves: CampaignAIReserveAssessment,
  logistics: CampaignAILogisticsAssessment,
  objectives: CampaignAIObjectivePressureAssessment,
  threats: readonly CampaignAIFinding[],
  opportunities: readonly CampaignAIFinding[]
): CampaignAIPosture {
  if (forces.activeFormations === 0 || forces.averageEffectiveStrength < 45 || logistics.state === "critical" || forces.assessedBalance === "critical") {
    return "preserve";
  }
  const criticalThreat = threats.some((threat) => threat.priority === "critical");
  if ((criticalThreat && !reserves.adequate) || (objectives.urgentDeadlines > 0 && objectives.threatenedObjectives > 0)) {
    return "delay";
  }
  const bestOpportunity = opportunities[0]?.score ?? 0;
  if (bestOpportunity >= 80
    && forces.averageReadiness >= 70
    && logistics.state === "secure"
    && reserves.adequate
    && ["favorable", "dominant", "unknown"].includes(forces.assessedBalance)) {
    return "decisiveOffensive";
  }
  if (bestOpportunity >= 55 && logistics.state !== "strained" && reserves.adequate) return "pressure";
  if (criticalThreat || objectives.threatenedObjectives > 0) return "delay";
  return "balanced";
}

function buildRationale(
  posture: CampaignAIPosture,
  forces: CampaignAIForceAssessment,
  reserves: CampaignAIReserveAssessment,
  logistics: CampaignAILogisticsAssessment,
  intelligence: CampaignAIIntelligenceAssessment,
  objectives: CampaignAIObjectivePressureAssessment,
  threats: readonly CampaignAIFinding[],
  opportunities: readonly CampaignAIFinding[]
): string[] {
  return [
    `Posture ${posture} follows an assessed force balance of ${forces.assessedBalance}.`,
    `Command has ${reserves.availableFormations} reserve formations against a requirement of ${reserves.requiredFormations}.`,
    logistics.explanation,
    `Intelligence uncertainty is ${intelligence.uncertainty} across ${intelligence.visibleContacts} projected contacts.`,
    `${objectives.threatenedObjectives} protected objectives are threatened; ${objectives.urgentDeadlines} deadlines fall within eight segments.`,
    threats[0] ? `Highest threat: ${threats[0].summary} (${threats[0].score}).` : "No projected threat exceeds the reporting threshold.",
    opportunities[0] ? `Best opportunity: ${opportunities[0].summary} (${opportunities[0].score}).` : "No actionable opportunity is currently projected."
  ];
}

/** Recomputes the integrity hash without trusting the stored value. */
export function computeCampaignAIAssessmentIntegrity(
  assessment: Omit<CampaignAITheaterAssessment, "integrityHash"> | CampaignAITheaterAssessment
): string {
  const { integrityHash: _ignored, ...content } = assessment as CampaignAITheaterAssessment;
  return computeCampaignContentHash(content);
}

/** Builds one deterministic assessment from a legal faction projection only. */
export function assessCampaignAITheater(input: CampaignAIAssessmentInput): CampaignAITheaterAssessment {
  if (input.operationalPicture.observerFaction !== input.faction || input.economy.faction !== input.faction) {
    throw new Error("Campaign AI assessment input owners must match the projected faction.");
  }
  const sourceViewHash = computeCampaignContentHash(input);
  const threats = buildThreats(input);
  const opportunities = buildOpportunities(input);
  const forces = assessForces(input);
  const reserves = assessReserves(input, threats);
  const logistics = assessLogistics(input, forces.activeFormations);
  const intelligence = assessIntelligence(input);
  const objectivePressure = assessObjectivePressure(input, threats);
  const posture = choosePosture(forces, reserves, logistics, objectivePressure, threats, opportunities);
  const rationale = buildRationale(posture, forces, reserves, logistics, intelligence, objectivePressure, threats, opportunities);
  const assessmentWithoutIntegrity: Omit<CampaignAITheaterAssessment, "integrityHash"> = {
    version: CAMPAIGN_AI_ASSESSMENT_VERSION,
    id: createStableCampaignRecordId("ai-assessment", input.campaignId, input.faction, input.sourceRevision, input.sourceSegment, sourceViewHash),
    faction: input.faction,
    sourceRevision: input.sourceRevision,
    sourceSegment: input.sourceSegment,
    generatedSegment: input.sourceSegment + 1,
    sourceViewHash,
    posture,
    forces,
    reserves,
    logistics,
    intelligence,
    objectivePressure,
    threats,
    opportunities,
    rationale
  };
  return {
    ...assessmentWithoutIntegrity,
    integrityHash: computeCampaignAIAssessmentIntegrity(assessmentWithoutIntegrity)
  };
}
