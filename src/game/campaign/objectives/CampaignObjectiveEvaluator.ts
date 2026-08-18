/**
 * MODULE: CampaignObjectiveEvaluator
 * WHAT: Evaluates campaign objectives, phases, rewards, score, victory, and defeat from authoritative runtime truth.
 * WHY: Campaign direction and end states must be deterministic, save-complete, explainable, and idempotent.
 */

import type {
  CampaignFactionEconomy,
  CampaignObjective,
  CampaignObjectiveCategory,
  CampaignObjectiveCondition,
  CampaignObjectiveRewardEffect,
  CampaignPhaseDefinition
} from "../../../core/campaignTypes";
import type { CampaignFormationRecord } from "../formations/campaignFormationTypes";
import type {
  CampaignDomainEventDraft,
  CampaignObjectiveRuntime,
  CampaignOutcomeGrade,
  CampaignReadonly,
  CampaignRuntimeState,
  CampaignScenarioDefinition
} from "../runtime/campaignRuntimeTypes";
import { CampaignRuntimeError } from "../runtime/campaignRuntimeTypes";

const DEFAULT_OBJECTIVE_SCORE: Readonly<Record<CampaignObjectiveCategory, number>> = Object.freeze({
  primary: 100,
  secondary: 50,
  optional: 25,
  failure: 0
});

interface ConditionEvaluation {
  readonly satisfied: boolean;
  readonly progress: number;
  readonly current: number;
  readonly target: number;
  readonly label: string;
}

export interface CampaignObjectiveEvaluationResult {
  readonly affectedObjectiveKeys: readonly string[];
  readonly events: readonly CampaignDomainEventDraft[];
}

export interface CampaignObjectivePresentation {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly category: CampaignObjectiveCategory;
  readonly status: CampaignObjectiveRuntime["status"];
  readonly progress: number;
  readonly progressLabel: string;
  readonly deadlineSegment: number | null;
  readonly score: number;
  readonly scoreAwarded: number;
  readonly phaseKey: string | null;
  readonly visible: boolean;
}

/** Rejects authored objective graphs that could never resolve or would surprise the player. */
export function assertCampaignObjectiveDefinitionContent(definition: CampaignScenarioDefinition): void {
  const objectiveKeys = new Set<string>();
  definition.objectives.forEach((objective) => {
    if (objective.key.trim().length === 0 || objectiveKeys.has(objective.key)) {
      throw new CampaignRuntimeError("INVALID_SCENARIO", `Campaign objective key ${objective.key || "<empty>"} is empty or duplicated.`, { path: `objectives.${objective.key}` });
    }
    objectiveKeys.add(objective.key);
  });
  const phaseKeys = new Set<string>();
  const phases = authoredPhases(definition);
  phases.forEach((phase) => {
    if (phase.key.trim().length === 0 || phaseKeys.has(phase.key)) {
      throw new CampaignRuntimeError("INVALID_SCENARIO", `Campaign phase key ${phase.key || "<empty>"} is empty or duplicated.`, { path: `campaignArc.phases.${phase.key}` });
    }
    phaseKeys.add(phase.key);
    phase.objectiveKeys.forEach((key) => {
      if (!objectiveKeys.has(key)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Campaign phase ${phase.key} references unknown objective ${key}.`, { path: `campaignArc.phases.${phase.key}.objectiveKeys` });
    });
  });
  const referencedTerminalKeys = [
    ...(definition.campaignArc?.victoryObjectiveKeys ?? []),
    ...(definition.campaignArc?.defeatObjectiveKeys ?? [])
  ];
  referencedTerminalKeys.forEach((key) => {
    if (!objectiveKeys.has(key)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Campaign outcome policy references unknown objective ${key}.`, { path: "campaignArc" });
  });
  [definition.campaignArc?.decisiveVictoryThreshold, definition.campaignArc?.standardVictoryThreshold]
    .filter((value): value is number => value !== undefined)
    .forEach((value) => {
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new CampaignRuntimeError("INVALID_SCENARIO", "Campaign victory grade thresholds must be between 0 and 100.", { path: "campaignArc" });
    });
  if ((definition.campaignArc?.standardVictoryThreshold ?? 60) > (definition.campaignArc?.decisiveVictoryThreshold ?? 90)) {
    throw new CampaignRuntimeError("INVALID_SCENARIO", "Standard victory threshold cannot exceed decisive victory threshold.", { path: "campaignArc" });
  }
  definition.objectives.forEach((objective) => {
    if (objective.phaseKey && !phaseKeys.has(objective.phaseKey)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} references unknown phase ${objective.phaseKey}.`, { path: `objectives.${objective.key}.phaseKey` });
    if (objective.category === "failure" && objective.visibility === "secretUntilResolved") throw new CampaignRuntimeError("INVALID_SCENARIO", `Failure objective ${objective.key} must be visible before it can end the campaign.`, { path: `objectives.${objective.key}.visibility` });
    if (objective.deadlineSegment !== undefined && (!Number.isInteger(objective.deadlineSegment) || objective.deadlineSegment < 0)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid deadline.`, { path: `objectives.${objective.key}.deadlineSegment` });
    if (objective.score !== undefined && (!Number.isFinite(objective.score) || objective.score < 0)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid score.`, { path: `objectives.${objective.key}.score` });
    (objective.requiresObjectives ?? []).forEach((key) => {
      if (!objectiveKeys.has(key) || key === objective.key) throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid prerequisite ${key}.`, { path: `objectives.${objective.key}.requiresObjectives` });
    });
    (objective.conditions ?? []).forEach((condition, index) => {
      if (condition.kind === "controlHex") {
        const hex = condition.hex ?? objective.hex;
        if (!definition.initialState.tiles.some((tile) => tile.hex.q === hex.q && tile.hex.r === hex.r)) {
          throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} targets campaign hex ${hex.q},${hex.r}, which has no operational tile.`, { path: `objectives.${objective.key}.conditions.${index}` });
        }
        if (condition.holdSegments !== undefined && (!Number.isInteger(condition.holdSegments) || condition.holdSegments < 0)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid hold duration.`, { path: `objectives.${objective.key}.conditions.${index}.holdSegments` });
        if (condition.minimumInfrastructureEffectiveness !== undefined && (!Number.isFinite(condition.minimumInfrastructureEffectiveness) || condition.minimumInfrastructureEffectiveness < 0 || condition.minimumInfrastructureEffectiveness > 1)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid infrastructure threshold.`, { path: `objectives.${objective.key}.conditions.${index}.minimumInfrastructureEffectiveness` });
      } else if (condition.kind === "formationStrength" && (!Number.isFinite(condition.percent) || condition.percent < 0 || condition.percent > 100)) {
        throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid formation strength threshold.`, { path: `objectives.${objective.key}.conditions.${index}.percent` });
      } else if (condition.kind === "resourceThreshold" && (!Number.isFinite(condition.amount) || condition.amount < 0)) {
        throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid resource threshold.`, { path: `objectives.${objective.key}.conditions.${index}.amount` });
      } else if (condition.kind === "surviveUntil" && (!Number.isInteger(condition.segment) || condition.segment < 0)) {
        throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} has an invalid survival boundary.`, { path: `objectives.${objective.key}.conditions.${index}.segment` });
      } else if (condition.kind === "objectiveStatus" && !objectiveKeys.has(condition.objectiveKey)) {
        throw new CampaignRuntimeError("INVALID_SCENARIO", `Objective ${objective.key} references unknown objective ${condition.objectiveKey}.`, { path: `objectives.${objective.key}.conditions.${index}.objectiveKey` });
      }
    });
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new CampaignRuntimeError("INVALID_SCENARIO", `Campaign objective dependency cycle includes ${key}.`, { path: `objectives.${key}.requiresObjectives` });
    if (visited.has(key)) return;
    visiting.add(key);
    const objective = definition.objectives.find((entry) => entry.key === key);
    (objective?.requiresObjectives ?? []).forEach(visit);
    visiting.delete(key);
    visited.add(key);
  };
  definition.objectives.forEach((objective) => visit(objective.key));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function objectiveCategory(objective: CampaignReadonly<CampaignObjective>): CampaignObjectiveCategory {
  return objective.category ?? "primary";
}

function objectiveScore(objective: CampaignReadonly<CampaignObjective>): number {
  const score = objective.score ?? DEFAULT_OBJECTIVE_SCORE[objectiveCategory(objective)];
  return Number.isFinite(score) && score >= 0 ? Math.round(score) : 0;
}

function authoredPhases(definition: CampaignScenarioDefinition): readonly CampaignReadonly<CampaignPhaseDefinition>[] {
  return definition.campaignArc?.phases ?? [];
}

function objectivePhaseKey(
  objective: CampaignReadonly<CampaignObjective>,
  definition: CampaignScenarioDefinition
): string | null {
  if (objective.phaseKey) return objective.phaseKey;
  return authoredPhases(definition).find((phase) => phase.objectiveKeys.includes(objective.key))?.key ?? null;
}

function initialPhaseKey(definition: CampaignScenarioDefinition): string {
  return authoredPhases(definition)[0]?.key ?? "operation";
}

function currentPhase(definition: CampaignScenarioDefinition, runtime: CampaignRuntimeState): CampaignReadonly<CampaignPhaseDefinition> | null {
  return authoredPhases(definition).find((phase) => phase.key === runtime.campaignPhaseKey) ?? null;
}

function objectiveConditions(objective: CampaignReadonly<CampaignObjective>): readonly CampaignReadonly<CampaignObjectiveCondition>[] {
  if (objective.conditions && objective.conditions.length > 0) return objective.conditions;
  return [{
    kind: "controlHex",
    hex: objective.hex,
    faction: "Player",
    ...(objective.holdSegments !== undefined ? { holdSegments: objective.holdSegments } : {})
  }];
}

function formationStrengthPercent(formation: CampaignFormationRecord | undefined): number {
  if (!formation) return 0;
  const personnel = Object.values(formation.personnel).reduce((totals, pool) => ({
    effective: totals.effective + pool.fit + (pool.injured * 0.5),
    total: totals.total + pool.fit + pool.injured + pool.wounded + pool.severelyWounded + pool.killed
  }), { effective: 0, total: 0 });
  const equipment = Object.values(formation.equipment).reduce((totals, pool) => ({
    effective: totals.effective + pool.operational + (pool.damaged * 0.5),
    total: totals.total + pool.operational + pool.damaged + pool.disabled + pool.destroyed
  }), { effective: 0, total: 0 });
  const ratios = [
    ...(personnel.total > 0 ? [personnel.effective / personnel.total] : []),
    ...(equipment.total > 0 ? [equipment.effective / equipment.total] : [])
  ];
  const material = ratios.length > 0 ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 0;
  const readiness = clamp01(formation.readiness / 100);
  return Math.round(Math.min(material, readiness) * 100);
}

function comparisonEvaluation(current: number, target: number, comparison: "atLeast" | "atMost"): Pick<ConditionEvaluation, "satisfied" | "progress"> {
  if (comparison === "atLeast") {
    return { satisfied: current >= target, progress: target <= 0 ? 1 : clamp01(current / target) };
  }
  return { satisfied: current <= target, progress: current <= 0 ? 1 : clamp01(target / current) };
}

function evaluateOperationResult(
  condition: CampaignReadonly<Extract<CampaignObjectiveCondition, { kind: "operationResult" }>>,
  runtime: CampaignRuntimeState
): ConditionEvaluation {
  const ledger = runtime.engagementLedger[condition.engagementId];
  const result = ledger?.resultPackage?.result ?? null;
  let playerResult: "victory" | "defeat" | "stalemate" | null = null;
  if (result === "stalemate" || result === "withdrawal") playerResult = "stalemate";
  else if (result && ledger?.package) {
    const playerAttacks = ledger.package.engagement.attacker === "Player";
    const playerWon = (result === "attackerVictory" && playerAttacks)
      || (result === "defenderVictory" && !playerAttacks);
    playerResult = playerWon ? "victory" : "defeat";
  }
  const satisfied = condition.result === "anyResolved" ? playerResult !== null : playerResult === condition.result;
  return {
    satisfied,
    progress: playerResult === null ? 0 : satisfied ? 1 : 0,
    current: playerResult === null ? 0 : 1,
    target: 1,
    label: playerResult === null ? "Operation has not resolved" : `Operation result: ${playerResult}`
  };
}

function evaluateCondition(
  condition: CampaignReadonly<CampaignObjectiveCondition>,
  objective: CampaignReadonly<CampaignObjective>,
  runtime: CampaignRuntimeState
): ConditionEvaluation {
  if (condition.kind === "controlHex") {
    const hex = condition.hex ?? objective.hex;
    const tile = runtime.tiles[`${hex.q},${hex.r}`];
    const faction = condition.faction ?? "Player";
    const controlled = tile?.controller === faction;
    const holdTarget = Math.max(0, Math.round(condition.holdSegments ?? objective.holdSegments ?? 0));
    const held = controlled && tile ? Math.max(0, runtime.currentSegment - tile.controlSinceSegment) : 0;
    const holdProgress = controlled ? (holdTarget === 0 ? 1 : clamp01(held / holdTarget)) : 0;
    const infrastructureTarget = clamp01(condition.minimumInfrastructureEffectiveness ?? 0);
    const infrastructureValue = tile?.infrastructure?.effectiveness ?? (infrastructureTarget > 0 ? 0 : 1);
    const infrastructureProgress = infrastructureTarget === 0 ? 1 : clamp01(infrastructureValue / infrastructureTarget);
    const satisfied = controlled && held >= holdTarget && infrastructureValue >= infrastructureTarget;
    const remaining = Math.max(0, holdTarget - held);
    const controlLabel = !tile
      ? "Objective location is not an operational campaign hex"
      : !controlled
        ? `Controlled by ${tile.controller}; ${faction} control required`
        : remaining > 0
          ? `Hold for ${remaining} more segment${remaining === 1 ? "" : "s"}`
          : `${faction} control secured`;
    const infrastructureLabel = infrastructureTarget > 0
      ? ` · installation ${Math.round(infrastructureValue * 100)}% / ${Math.round(infrastructureTarget * 100)}% required`
      : "";
    return {
      satisfied,
      progress: Math.min(holdProgress, infrastructureProgress),
      current: holdTarget > 0 ? held : controlled ? 1 : 0,
      target: holdTarget > 0 ? holdTarget : 1,
      label: `${controlLabel}${infrastructureLabel}`
    };
  }
  if (condition.kind === "formationStrength") {
    const formation = runtime.formations[condition.formationId];
    const current = formationStrengthPercent(formation);
    const compared = comparisonEvaluation(current, condition.percent, condition.comparison);
    return {
      ...compared,
      current,
      target: condition.percent,
      label: formation ? `${formation.name}: ${current}% effective strength (${condition.comparison === "atLeast" ? "minimum" : "maximum"} ${condition.percent}%)` : `Formation ${condition.formationId} is unavailable`
    };
  }
  if (condition.kind === "formationStatus") {
    const formation = runtime.formations[condition.formationId];
    const satisfied = Boolean(formation && condition.statuses.includes(formation.status));
    return {
      satisfied,
      progress: satisfied ? 1 : 0,
      current: satisfied ? 1 : 0,
      target: 1,
      label: formation ? `${formation.name}: ${formation.status}` : `Formation ${condition.formationId} is unavailable`
    };
  }
  if (condition.kind === "resourceThreshold") {
    const faction = condition.faction ?? "Player";
    const economy = runtime.factions[String(faction)]?.economy;
    const current = Number(economy?.[condition.resource] ?? 0);
    const compared = comparisonEvaluation(current, condition.amount, condition.comparison);
    return {
      ...compared,
      current,
      target: condition.amount,
      label: `${condition.resource}: ${Math.round(current).toLocaleString()} (${condition.comparison === "atLeast" ? "minimum" : "maximum"} ${condition.amount.toLocaleString()})`
    };
  }
  if (condition.kind === "operationResult") return evaluateOperationResult(condition, runtime);
  if (condition.kind === "surviveUntil") {
    const satisfied = runtime.currentSegment >= condition.segment;
    return {
      satisfied,
      progress: condition.segment <= 0 ? 1 : clamp01(runtime.currentSegment / condition.segment),
      current: runtime.currentSegment,
      target: condition.segment,
      label: satisfied ? `Survived through segment ${condition.segment}` : `${condition.segment - runtime.currentSegment} segments remain`
    };
  }
  const linked = runtime.objectives[condition.objectiveKey];
  const satisfied = linked?.status === condition.status;
  return {
    satisfied,
    progress: satisfied ? 1 : linked?.progress ?? 0,
    current: satisfied ? 1 : 0,
    target: 1,
    label: `Objective ${condition.objectiveKey}: ${linked?.status ?? "unavailable"}`
  };
}

function combineConditions(
  objective: CampaignReadonly<CampaignObjective>,
  evaluations: readonly ConditionEvaluation[]
): ConditionEvaluation {
  const mode = objective.completionMode ?? "all";
  const satisfied = mode === "any"
    ? evaluations.some((entry) => entry.satisfied)
    : evaluations.every((entry) => entry.satisfied);
  const progress = evaluations.length === 0
    ? 0
    : mode === "any"
      ? Math.max(...evaluations.map((entry) => entry.progress))
      : evaluations.reduce((sum, entry) => sum + entry.progress, 0) / evaluations.length;
  const representative = mode === "any"
    ? [...evaluations].sort((left, right) => right.progress - left.progress)[0]
    : evaluations.find((entry) => !entry.satisfied) ?? evaluations[evaluations.length - 1];
  return {
    satisfied,
    progress,
    current: representative?.current ?? 0,
    target: representative?.target ?? 1,
    label: representative?.label ?? "No objective conditions are authored"
  };
}

function canActivateObjective(
  objective: CampaignReadonly<CampaignObjective>,
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): boolean {
  const dependenciesSatisfied = (objective.requiresObjectives ?? []).every((key) => runtime.objectives[key]?.status === "completed");
  if (!dependenciesSatisfied) return false;
  const phaseKey = objectivePhaseKey(objective, definition);
  return phaseKey === null || phaseKey === runtime.campaignPhaseKey;
}

function applyRewardEffect(
  runtime: CampaignRuntimeState,
  objectiveKey: string,
  index: number,
  reward: CampaignReadonly<CampaignObjectiveRewardEffect>
): CampaignDomainEventDraft | null {
  const awardKey = `${objectiveKey}:reward:${index}`;
  runtime.awardedRewardKeys ??= [];
  if (runtime.awardedRewardKeys.includes(awardKey)) return null;
  runtime.awardedRewardKeys.push(awardKey);
  if (reward.kind === "unlock") {
    return {
      type: "stateChanged",
      category: "objectives",
      summary: `${reward.label} unlocked.`,
      details: { objectiveKey, rewardKey: awardKey, unlockKey: reward.key }
    };
  }
  const faction = reward.faction ?? "Player";
  const economy = runtime.factions[String(faction)]?.economy;
  if (!economy) return null;
  const resource = reward.resource as keyof CampaignFactionEconomy;
  const before = Number(economy[resource] ?? 0);
  (economy as unknown as Record<string, number>)[resource] = Math.max(0, before + reward.amount);
  return {
    type: "stateChanged",
    category: "objectives",
    summary: reward.label ?? `${reward.resource} ${reward.amount >= 0 ? "+" : ""}${reward.amount}.`,
    details: { objectiveKey, rewardKey: awardKey, faction: String(faction), resource: reward.resource, amount: reward.amount }
  };
}

function projectedGrade(definition: CampaignScenarioDefinition, percent: number): CampaignOutcomeGrade {
  const decisive = definition.campaignArc?.decisiveVictoryThreshold ?? 90;
  const standard = definition.campaignArc?.standardVictoryThreshold ?? 60;
  if (percent >= decisive) return "decisiveVictory";
  if (percent >= standard) return "victory";
  return "costlyVictory";
}

function refreshScore(runtime: CampaignRuntimeState, definition: CampaignScenarioDefinition): void {
  let earned = 0;
  let available = 0;
  let maximumAchievable = 0;
  definition.objectives.forEach((objective) => {
    const score = objectiveScore(objective);
    if (score <= 0) return;
    available += score;
    const state = runtime.objectives[objective.key];
    if (state?.status === "completed") earned += score;
    if (state?.status !== "failed") maximumAchievable += score;
  });
  const percent = available > 0 ? Math.round((earned / available) * 100) : 100;
  const projectedPercent = available > 0 ? Math.round((maximumAchievable / available) * 100) : 100;
  runtime.campaignScore = {
    earned,
    available,
    percent,
    projectedGrade: projectedGrade(definition, projectedPercent)
  };
}

function playerCommandViable(runtime: CampaignRuntimeState): boolean {
  return runtime.formationOrder.some((id) => {
    const formation = runtime.formations[id];
    return formation?.faction === "Player" && !["destroyed", "captured", "shattered"].includes(formation.status);
  });
}

function recordOutcome(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  events: CampaignDomainEventDraft[]
): void {
  if (runtime.campaignOutcome) {
    if (!runtime.campaignOutcome.sandboxContinued) runtime.status = runtime.campaignOutcome.result;
    return;
  }
  const primaryKeys = definition.objectives
    .filter((objective) => objectiveCategory(objective) === "primary")
    .map((objective) => objective.key);
  const failureKeys = definition.objectives
    .filter((objective) => objectiveCategory(objective) === "failure")
    .map((objective) => objective.key);
  const victoryKeys = definition.campaignArc?.victoryObjectiveKeys ?? primaryKeys;
  const defeatKeys = definition.campaignArc?.defeatObjectiveKeys ?? [...primaryKeys, ...failureKeys];
  const defeated = defeatKeys.some((key) => runtime.objectives[key]?.status === "failed")
    || (definition.campaignArc?.defeatWhenNoPlayerFormations === true && !playerCommandViable(runtime));
  const victorious = victoryKeys.length > 0 && victoryKeys.every((key) => runtime.objectives[key]?.status === "completed");
  if (!defeated && !victorious) return;
  const result = defeated ? "defeat" : "victory";
  const grade: CampaignOutcomeGrade = defeated
    ? "defeat"
    : projectedGrade(definition, runtime.campaignScore?.percent ?? 0);
  const completedObjectiveKeys = runtime.objectiveOrder.filter((key) => runtime.objectives[key]?.status === "completed");
  const failedObjectiveKeys = runtime.objectiveOrder.filter((key) => runtime.objectives[key]?.status === "failed");
  const gradeLabel = grade === "decisiveVictory" ? "Decisive victory" : grade === "costlyVictory" ? "Costly victory" : grade === "victory" ? "Victory" : "Defeat";
  runtime.campaignOutcome = {
    result,
    grade,
    segment: runtime.currentSegment,
    phaseKey: runtime.campaignPhaseKey ?? initialPhaseKey(definition),
    scoreEarned: runtime.campaignScore?.earned ?? 0,
    scoreAvailable: runtime.campaignScore?.available ?? 0,
    completedObjectiveKeys,
    failedObjectiveKeys,
    summary: `${gradeLabel}: ${completedObjectiveKeys.length} objectives completed, ${failedObjectiveKeys.length} failed.`,
    sandboxContinued: false
  };
  runtime.status = result;
  events.push({
    type: "stateChanged",
    category: "objectives",
    summary: runtime.campaignOutcome.summary,
    details: {
      result,
      grade,
      segment: runtime.currentSegment,
      scoreEarned: runtime.campaignOutcome.scoreEarned,
      scoreAvailable: runtime.campaignOutcome.scoreAvailable
    }
  });
}

/** Supplies all C20-026 fields when creating or loading a runtime-v1 campaign. */
export function reconcileCampaignObjectiveRuntime(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): void {
  runtime.campaignPhaseKey ??= initialPhaseKey(definition);
  runtime.campaignPhaseEnteredSegment ??= runtime.currentSegment;
  runtime.campaignOutcome ??= null;
  if (runtime.campaignOutcome && typeof runtime.campaignOutcome.sandboxContinued !== "boolean") {
    runtime.campaignOutcome.sandboxContinued = false;
  }
  runtime.awardedRewardKeys ??= [];
  definition.objectives.forEach((objective) => {
    const existing = runtime.objectives[objective.key];
    if (!existing) return;
    existing.activatedSegment ??= existing.status === "active" ? runtime.currentSegment : null;
    existing.resolvedSegment ??= existing.status === "completed" || existing.status === "failed" ? runtime.currentSegment : null;
    existing.scoreAwarded ??= existing.status === "completed" ? objectiveScore(objective) : 0;
    existing.progressCurrent ??= existing.progress;
    existing.progressTarget ??= 1;
    existing.progressLabel ??= existing.status === "completed" ? "Objective completed" : existing.status === "failed" ? "Objective failed" : "Awaiting evaluation";
    existing.conditionLabels ??= [];
    if (!canActivateObjective(objective, runtime, definition)
      && existing.status === "active"
      && existing.progress === 0
      && existing.resolvedSegment === null) {
      existing.status = "locked";
      existing.activatedSegment = null;
    }
  });
  refreshScore(runtime, definition);
}

function transitionPhase(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  events: CampaignDomainEventDraft[]
): boolean {
  const phases = authoredPhases(definition);
  const phase = currentPhase(definition, runtime);
  if (!phase) return false;
  const currentIndex = phases.findIndex((entry) => entry.key === phase.key);
  const required = phase.objectiveKeys.filter((key) => {
    const objective = definition.objectives.find((entry) => entry.key === key);
    return objective && objectiveCategory(objective) === "primary";
  });
  if (required.length === 0 || !required.every((key) => runtime.objectives[key]?.status === "completed")) return false;
  const next = phases[currentIndex + 1];
  if (!next) return false;
  runtime.campaignPhaseKey = next.key;
  runtime.campaignPhaseEnteredSegment = runtime.currentSegment;
  events.push({
    type: "stateChanged",
    category: "objectives",
    summary: `Campaign phase advanced to ${next.label}.`,
    details: { priorPhaseKey: phase.key, phaseKey: next.key, segment: runtime.currentSegment }
  });
  return true;
}

/** Evaluates the complete objective/end-state loop after consequences and control commit for one segment. */
export function evaluateCampaignObjectives(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): CampaignObjectiveEvaluationResult {
  reconcileCampaignObjectiveRuntime(runtime, definition);
  if (runtime.campaignOutcome) {
    if (!runtime.campaignOutcome.sandboxContinued) runtime.status = runtime.campaignOutcome.result;
    return { affectedObjectiveKeys: [], events: [] };
  }
  const events: CampaignDomainEventDraft[] = [];
  const affected = new Set<string>();
  let changed = true;
  let passes = 0;
  while (changed && passes <= definition.objectives.length + authoredPhases(definition).length) {
    passes += 1;
    changed = false;
    definition.objectives.forEach((objective) => {
      const state = runtime.objectives[objective.key];
      if (!state || state.status === "completed" || state.status === "failed") return;
      if (state.status === "locked" && canActivateObjective(objective, runtime, definition)) {
        state.status = "active";
        state.activatedSegment = runtime.currentSegment;
        state.progressLabel = "Objective active";
        affected.add(objective.key);
        changed = true;
        events.push({
          type: "stateChanged",
          category: "objectives",
          summary: `${objective.label} is now active.`,
          details: { objectiveKey: objective.key, status: "active", segment: runtime.currentSegment }
        });
      }
      const deadlineExpired = objective.deadlineSegment !== undefined && runtime.currentSegment >= objective.deadlineSegment;
      if (state.status !== "active") {
        if (deadlineExpired && objectiveCategory(objective) !== "failure") {
          state.status = "failed";
          state.resolvedSegment = runtime.currentSegment;
          state.scoreAwarded = 0;
          state.progressLabel = `Deadline expired at segment ${objective.deadlineSegment}`;
          affected.add(objective.key);
          changed = true;
          events.push({
            type: "stateChanged",
            category: "objectives",
            summary: `${objective.label} failed before activation.`,
            details: { objectiveKey: objective.key, status: "failed", deadlineSegment: objective.deadlineSegment ?? null, segment: runtime.currentSegment }
          });
        }
        return;
      }
      const evaluations = objectiveConditions(objective).map((condition) => evaluateCondition(condition, objective, runtime));
      const combined = combineConditions(objective, evaluations);
      if (state.progress !== combined.progress || state.progressLabel !== combined.label) affected.add(objective.key);
      state.progress = clamp01(combined.progress);
      state.progressCurrent = combined.current;
      state.progressTarget = combined.target;
      state.progressLabel = combined.label;
      state.conditionLabels = evaluations.map((entry) => entry.label);
      const category = objectiveCategory(objective);
      let terminal: "completed" | "failed" | null = null;
      if (category === "failure") {
        if (combined.satisfied) terminal = "failed";
        else if (deadlineExpired) terminal = "completed";
      } else if (combined.satisfied) terminal = "completed";
      else if (deadlineExpired) terminal = "failed";
      if (!terminal) return;
      state.status = terminal;
      state.resolvedSegment = runtime.currentSegment;
      state.progress = terminal === "completed" ? 1 : state.progress;
      state.scoreAwarded = terminal === "completed" ? objectiveScore(objective) : 0;
      state.progressLabel = terminal === "completed" ? "Objective completed" : deadlineExpired ? `Deadline expired at segment ${objective.deadlineSegment}` : "Failure condition triggered";
      affected.add(objective.key);
      changed = true;
      events.push({
        type: "stateChanged",
        category: "objectives",
        summary: `${objective.label} ${terminal}.`,
        details: { objectiveKey: objective.key, status: terminal, score: state.scoreAwarded, segment: runtime.currentSegment }
      });
      if (terminal === "completed" && !state.rewardApplied) {
        (objective.rewardEffects ?? []).forEach((reward, index) => {
          const event = applyRewardEffect(runtime, objective.key, index, reward);
          if (event) events.push(event);
        });
        state.rewardApplied = true;
      }
    });
    if (transitionPhase(runtime, definition, events)) changed = true;
  }
  refreshScore(runtime, definition);
  recordOutcome(runtime, definition, events);
  return { affectedObjectiveKeys: [...affected], events };
}

export function getCampaignPhaseLabel(runtime: CampaignRuntimeState, definition: CampaignScenarioDefinition): string {
  return authoredPhases(definition).find((phase) => phase.key === runtime.campaignPhaseKey)?.label
    ?? (runtime.campaignPhaseKey === "operation" ? "Operation" : runtime.campaignPhaseKey ?? "Operation");
}

export function projectCampaignObjectives(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): CampaignObjectivePresentation[] {
  reconcileCampaignObjectiveRuntime(runtime, definition);
  return definition.objectives.map((objective) => {
    const state = runtime.objectives[objective.key];
    const visibility = objective.visibility ?? "briefed";
    const resolved = state?.status === "completed" || state?.status === "failed";
    const visible = visibility === "briefed" || resolved || (visibility === "revealedByEvent" && state?.status === "active");
    return {
      key: objective.key,
      label: objective.label,
      description: objective.description,
      category: objectiveCategory(objective),
      status: state?.status ?? "locked",
      progress: clamp01(state?.progress ?? 0),
      progressLabel: state?.progressLabel ?? "Awaiting evaluation",
      deadlineSegment: objective.deadlineSegment ?? null,
      score: objectiveScore(objective),
      scoreAwarded: state?.scoreAwarded ?? 0,
      phaseKey: objectivePhaseKey(objective, definition),
      visible
    };
  });
}
