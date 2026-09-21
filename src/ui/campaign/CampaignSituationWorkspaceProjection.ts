/**
 * Pure player-safe projection for the command-shell Situation workspace.
 * CampaignScreen supplies authorized snapshots and presentation callbacks; this module owns no state or interaction.
 */
import { CAMPAIGN_SEGMENT_HOURS, type CampaignScenarioData } from "../../core/campaignTypes";
import type { CampaignEnemyContactView } from "../../core/campaignIntelTypes";
import type { CampaignObjectivePresentation } from "../../game/campaign/objectives/CampaignObjectiveEvaluator";
import type {
  CampaignAdvanceAlertSeverity,
  CampaignAdvanceStepRecord,
  CampaignOutcomeRuntime,
  CampaignScoreRuntime
} from "../../game/campaign/runtime/campaignRuntimeTypes";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import type {
  CampaignCommandAlertView,
  CampaignCommandFormationView,
  CampaignCommandFrontView,
  CampaignCommandObjectiveScoreView,
  CampaignCommandObjectiveView,
  CampaignCommandPriorityView,
  CampaignCommandSituationView,
  CampaignCommandTimelineView
} from "./CampaignCommandShell";
import type { CampaignLocationPresentation } from "./CampaignLocationPresentation";

type Immutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly Immutable<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: Immutable<T[Key]> }
      : T;

export interface CampaignSituationFrontTargetAssessment {
  readonly targetHexKey: string;
  readonly approachLabel: string;
  readonly missionLabel: string;
  readonly roleLabel: string;
  readonly contactCount: number;
  readonly resistanceBand: string;
  readonly confidenceBand: string;
  readonly explicitUnknowns: readonly string[];
}

export interface CampaignSituationFrontAssessment {
  readonly canLaunch: boolean;
  readonly pressureLabel: string;
  readonly targetRequired: boolean;
  readonly target: CampaignSituationFrontTargetAssessment | null;
  readonly targets: readonly CampaignSituationFrontTargetAssessment[];
}

interface CampaignSituationOrderSource {
  readonly id: string;
  readonly status: string;
  readonly validation: {
    readonly valid: boolean;
    readonly issues: ReadonlyArray<{ readonly message: string }>;
  };
}

export interface CampaignSituationObjectiveProjectionInput {
  readonly scenario: Immutable<CampaignScenarioData>;
  readonly presentations: readonly Immutable<CampaignObjectivePresentation>[];
  readonly formatSegment: (segment: number) => string;
  readonly resolveLocation: (hexKey: string) => CampaignLocationPresentation;
}

export interface CampaignSituationObjectiveProjection {
  readonly objectives: readonly CampaignCommandObjectiveView[];
  readonly priorityForceHexes: ReadonlySet<string>;
}

export interface CampaignSituationWorkspaceProjectionInput {
  readonly scenario: Immutable<CampaignScenarioData>;
  readonly objectives: readonly Immutable<CampaignCommandObjectiveView>[];
  readonly objectivePresentations: readonly Immutable<CampaignObjectivePresentation>[];
  readonly contacts: readonly Immutable<CampaignEnemyContactView>[];
  readonly formations: readonly Immutable<CampaignCommandFormationView>[];
  readonly advanceRecords: readonly Immutable<CampaignAdvanceStepRecord>[];
  readonly acknowledgedAlertIds: ReadonlySet<string>;
  readonly playerOrders: readonly Immutable<CampaignSituationOrderSource>[];
  readonly activeEngagementFrontKeys: ReadonlySet<string>;
  readonly counterattackStatusByFront: ReadonlyMap<string, string | null>;
  readonly frontAssessments: ReadonlyMap<string, Immutable<CampaignSituationFrontAssessment>>;
  readonly currentSegment: number;
  readonly phaseKey: string | null;
  readonly phaseLabel: string;
  readonly campaignScore: Immutable<CampaignScoreRuntime> | null | undefined;
  readonly campaignOutcome: Immutable<CampaignOutcomeRuntime> | null | undefined;
  readonly intelligenceUnread: number;
  readonly afterActionUnread: number;
  readonly formatSegment: (segment: number) => string;
  readonly formatStopReason: (reason: NonNullable<CampaignAdvanceStepRecord["stopReason"]>) => string;
  readonly resolveLocation: (hexKey: string) => CampaignLocationPresentation;
  readonly resolveLocationDisplayLabel: (hexKey: string) => string;
}

interface CampaignSituationLatestAlert extends CampaignCommandAlertView {
  readonly category: string;
}

const CAMPAIGN_SITUATION_SEVERITY_RANK: Readonly<Record<CampaignAdvanceAlertSeverity, number>> = {
  routine: 0,
  notable: 1,
  critical: 2,
  decisionRequired: 3
};

function compareCampaignSituationSeverity(
  left: { readonly severity: CampaignAdvanceAlertSeverity },
  right: { readonly severity: CampaignAdvanceAlertSeverity }
): number {
  return CAMPAIGN_SITUATION_SEVERITY_RANK[right.severity]
    - CAMPAIGN_SITUATION_SEVERITY_RANK[left.severity];
}

function detachLocation(location: CampaignLocationPresentation): CampaignLocationPresentation {
  return {
    primaryLabel: location.primaryLabel,
    secondaryGridReference: location.secondaryGridReference,
    ...(location.uncertainty ? { uncertainty: { ...location.uncertainty } } : {})
  };
}

export interface CampaignSituationWorkspaceProjection {
  readonly priorities: readonly CampaignCommandPriorityView[];
  readonly fronts: readonly CampaignCommandFrontView[];
  readonly situation: CampaignCommandSituationView;
  readonly timeline: readonly CampaignCommandTimelineView[];
  readonly latestAlerts: readonly CampaignSituationLatestAlert[];
  readonly commandAlerts: readonly CampaignCommandAlertView[];
  readonly objectiveScore?: CampaignCommandObjectiveScoreView;
  readonly latestCheckpoint: { readonly timeLabel: string; readonly stopLabel: string | null } | null;
}

function objectiveStatusLabel(status: CampaignObjectivePresentation["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "locked") return "Upcoming";
  return "In progress";
}

/** Projects objective cards once for every Situation, map, formation, and outcome consumer. */
export function projectCampaignSituationObjectives(
  input: CampaignSituationObjectiveProjectionInput
): CampaignSituationObjectiveProjection {
  const defaultDefeatKeys = input.scenario.objectives
    .filter((entry) => entry.category === "primary" || entry.category === "failure")
    .map((entry) => entry.key);
  const defeatKeys = input.scenario.campaignArc?.defeatObjectiveKeys ?? defaultDefeatKeys;
  const objectives = input.presentations.map((objective): CampaignCommandObjectiveView => {
    const authored = input.scenario.objectives.find((entry) => entry.key === objective.key);
    const offset = authored ? CoordinateSystem.axialToOffset(authored.hex.q, authored.hex.r) : null;
    const hexKey = offset ? CoordinateSystem.makeHexKey(offset.col, offset.row) : undefined;
    const dependencies = authored?.requiresObjectives?.map((objectiveKey) => (
      input.scenario.objectives.find((entry) => entry.key === objectiveKey)?.label ?? objectiveKey
    )) ?? [];
    return {
      key: objective.key,
      label: objective.label,
      status: objectiveStatusLabel(objective.status),
      category: objective.category,
      progress: objective.progress,
      detail: objective.description,
      progressLabel: objective.progressLabel,
      progressCurrent: objective.progressCurrent,
      progressTarget: objective.progressTarget,
      conditionLabels: [...objective.conditionLabels],
      nextAction: objective.status === "active"
        ? "Hold these conditions, then advance to the next report."
        : objective.status === "locked"
          ? "Complete the listed dependencies before issuing orders here."
          : "Review the recorded result and its effect on the campaign.",
      deadline: objective.deadlineSegment === null ? null : input.formatSegment(objective.deadlineSegment),
      score: `${objective.scoreAwarded}/${objective.score} pts`,
      hexKey,
      ...(hexKey ? { location: detachLocation(input.resolveLocation(hexKey)) } : {}),
      dependencies: dependencies.length > 0 ? `Requires ${dependencies.join(", ")}` : null,
      failureEffect: defeatKeys.includes(objective.key) ? "Failure ends the campaign" : null
    };
  });
  return {
    objectives,
    priorityForceHexes: new Set(objectives
      .filter((objective) => objective.status === "In progress")
      .map((objective) => objective.hexKey)
      .filter((hexKey): hexKey is string => Boolean(hexKey)))
  };
}

/** Keeps authored counterattack timing truthful before, during, and after the one-shot event. */
export function resolveCampaignCounterattackStageLabel(options: {
  cadenceSegment: number | null;
  currentSegment: number;
  active: boolean;
  priorStatus: string | null;
  timeLabel: string | null;
}): string | undefined {
  if (!Number.isInteger(options.cadenceSegment)) return undefined;
  if (options.active || ["opportunity", "planned", "committed", "inBattle"].includes(options.priorStatus ?? "")) {
    return "Enemy counterattack requires command now.";
  }
  if (options.priorStatus === "resolved") return "Enemy counterattack resolved.";
  if (options.priorStatus === "cancelled" || options.priorStatus === "abandoned") {
    return "Enemy counterattack concluded.";
  }
  const cadence = options.cadenceSegment as number;
  if (options.currentSegment < cadence) {
    return `Enemy counterattack expected in ${(cadence - options.currentSegment) * CAMPAIGN_SEGMENT_HOURS} hours${options.timeLabel ? ` · ${options.timeLabel}` : ""}.`;
  }
  return "Enemy counterattack will interrupt the next campaign resolution.";
}

function projectAlertDetail(
  alert: CampaignAdvanceStepRecord["alerts"][number] | undefined,
  fallback: string,
  objectives: readonly CampaignCommandObjectiveView[]
): string {
  if (!alert) return fallback;
  if (alert.category === "intelligence" && alert.targetKind === "intelligence" && alert.targetId) {
    return "An intelligence update was reported. Review Intelligence for the current assessment.";
  }
  if (alert.targetKind !== "objective" || !alert.targetId) return alert.detail;
  const objective = objectives.find((entry) => entry.key === alert.targetId);
  const recordedStatus = /\bis now ([^.]+)/i.exec(alert.detail)?.[1]?.trim();
  return objective
    ? `${objective.label} is ${(recordedStatus ?? objective.status).toLowerCase()}. Review the campaign situation before continuing.`
    : "A primary objective changed. Review the campaign situation before continuing.";
}

function projectTimeline(input: CampaignSituationWorkspaceProjectionInput): CampaignCommandTimelineView[] {
  return input.advanceRecords.map((record) => {
    const alert = [...record.alerts].sort(compareCampaignSituationSeverity)[0];
    return {
      id: record.id,
      timeLabel: input.formatSegment(record.toSegment),
      title: alert?.title ?? "Segment resolved",
      detail: projectAlertDetail(alert, `${record.eventCount} material campaign updates committed.`, input.objectives),
      severity: alert?.severity ?? "routine",
      stopLabel: record.stopReason ? input.formatStopReason(record.stopReason) : null,
      targetKind: alert?.targetKind ?? "time",
      targetId: alert?.targetId ?? null,
      eventCount: record.eventCount
    };
  });
}

function projectAlerts(input: CampaignSituationWorkspaceProjectionInput): {
  latestAlerts: CampaignSituationLatestAlert[];
  commandAlerts: CampaignCommandAlertView[];
} {
  const latestRecord = input.advanceRecords[0];
  const latestAlerts = latestRecord?.alerts
    .filter((alert) => alert.severity !== "routine" || latestRecord.stopped)
    .map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      category: alert.category,
      title: alert.title,
      detail: projectAlertDetail(alert, alert.detail, input.objectives),
      targetKind: alert.targetKind,
      targetId: alert.targetId,
      timeLabel: input.formatSegment(alert.segment),
      requiresStop: alert.requiresStop,
      acknowledged: input.acknowledgedAlertIds.has(alert.id)
    })) ?? [];
  const commandAlerts = input.advanceRecords.flatMap((record) => record.alerts
    .filter((alert) => alert.category !== "intelligence")
    .filter((alert) => alert.severity !== "routine" || alert.requiresStop)
    .map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      detail: projectAlertDetail(alert, alert.detail, input.objectives),
      targetKind: alert.targetKind,
      targetId: alert.targetId,
      timeLabel: input.formatSegment(alert.segment),
      requiresStop: alert.requiresStop,
      acknowledged: input.acknowledgedAlertIds.has(alert.id)
    }))).slice(0, 12);
  return { latestAlerts, commandAlerts };
}

function projectPriorities(
  input: CampaignSituationWorkspaceProjectionInput,
  latestAlerts: readonly CampaignSituationLatestAlert[]
): CampaignCommandPriorityView[] {
  const urgentAlert = [...latestAlerts]
    .filter((alert) => alert.category !== "intelligence")
    .filter((alert) => alert.requiresStop || !alert.acknowledged)
    .sort(compareCampaignSituationSeverity)[0];
  if (urgentAlert) {
    return [{
      id: `alert:${urgentAlert.id}`,
      severity: urgentAlert.severity,
      label: urgentAlert.severity === "decisionRequired" ? "Decision required" : "Latest command report",
      title: urgentAlert.title,
      detail: urgentAlert.detail,
      actionLabel: "Review report",
      targetKind: urgentAlert.targetKind,
      targetId: urgentAlert.targetId
    }];
  }
  const conflictedDraft = input.playerOrders.find((order) => order.status === "draft" && !order.validation.valid);
  if (conflictedDraft) {
    return [{
      id: `order:${conflictedDraft.id}`,
      severity: "decisionRequired",
      label: "Orders blocked",
      title: "Resolve the draft-order conflict",
      detail: conflictedDraft.validation.issues[0]?.message
        ?? "This draft must be corrected before command can commit the order set.",
      actionLabel: "Review order",
      targetKind: "order",
      targetId: conflictedDraft.id
    }];
  }
  const objective = input.objectives
    .find((entry) => entry.category === "primary" && entry.status === "In progress");
  return objective ? [{
    id: `objective:${objective.key}`,
    severity: "notable",
    label: "Command priority",
    title: objective.label,
    detail: objective.detail ?? "Continue the active primary objective while preserving operational freedom.",
    actionLabel: "Review objective",
    targetKind: "objective",
    targetId: objective.key
  }] : [];
}

function projectFronts(
  input: CampaignSituationWorkspaceProjectionInput,
  timeline: readonly CampaignCommandTimelineView[]
): CampaignCommandFrontView[] {
  return input.scenario.fronts.map((front) => {
    const frontHexes = new Set(front.hexKeys);
    const playerSideHexes = new Set(front.initiative === "Player"
      ? front.hexKeys
      : front.edges?.map((edge) => edge.opposingHexKey) ?? front.hexKeys);
    const assessedContacts = input.contacts.filter((contact) => frontHexes.has(contact.locationHexKey));
    const uncertainContacts = assessedContacts
      .filter((contact) => contact.state === "stale" || contact.state === "disputed").length;
    const friendlyFormations = input.formations
      .filter((formation) => formation.locationHexKey && playerSideHexes.has(formation.locationHexKey));
    const sectorObjectives = input.objectives
      .filter((objective) => objective.hexKey && playerSideHexes.has(objective.hexKey));
    const relatedObjectiveIds = new Set(sectorObjectives.map((objective) => objective.key));
    const relatedFormationIds = new Set(friendlyFormations.map((formation) => formation.id));
    const lastChange = timeline.find((entry) => (
      (entry.targetKind === "objective" && entry.targetId && relatedObjectiveIds.has(entry.targetId))
      || (entry.targetKind === "formation" && entry.targetId && relatedFormationIds.has(entry.targetId))
    ));
    const playerAssessment = input.frontAssessments.get(front.key) ?? null;
    const target = playerAssessment?.target ?? null;
    const counterattackCadence = front.modifiers?.flatMap((modifier) => {
      const match = /^counterattack@(\d+)$/.exec(modifier);
      return match ? [Number(match[1])] : [];
    })[0];
    const stageLabel = front.initiative !== "Player"
      ? resolveCampaignCounterattackStageLabel({
          cadenceSegment: Number.isInteger(counterattackCadence) ? counterattackCadence as number : null,
          currentSegment: input.currentSegment,
          active: input.activeEngagementFrontKeys.has(front.key),
          priorStatus: input.counterattackStatusByFront.get(front.key) ?? null,
          timeLabel: Number.isInteger(counterattackCadence)
            ? input.formatSegment(counterattackCadence as number)
            : null
        })
      : undefined;
    const locationHexKey = target?.targetHexKey ?? front.hexKeys[0];
    return {
      key: front.key,
      label: front.label,
      ...(locationHexKey ? { location: detachLocation(input.resolveLocation(locationHexKey)) } : {}),
      hexKeys: [...front.hexKeys],
      initiativeLabel: front.initiative === "Player" ? "Friendly initiative" : "Opposing initiative",
      pressureLabel: playerAssessment?.pressureLabel ?? (assessedContacts.length === 0
        ? "No assessed hostile contact in this mapped sector."
        : `${assessedContacts.length} assessed contact${assessedContacts.length === 1 ? "" : "s"}${uncertainContacts > 0 ? ` · ${uncertainContacts} stale or disputed` : ""}.`),
      engagementLabel: target
        ? `${target.missionLabel} — ${input.resolveLocationDisplayLabel(target.targetHexKey)}`
        : undefined,
      targetHexKey: target?.targetHexKey,
      roleLabel: target?.roleLabel,
      intelligenceUnknowns: target ? [...target.explicitUnknowns] : undefined,
      stageLabel,
      forcePosture: `${friendlyFormations.length} friendly formation${friendlyFormations.length === 1 ? "" : "s"} in sector`,
      objectivePosture: `${sectorObjectives.length} objective${sectorObjectives.length === 1 ? "" : "s"} in sector`,
      lastChange: lastChange
        ? `${lastChange.timeLabel} · ${lastChange.title}`
        : "No recent objective or formation change in this sector."
    };
  });
}

/** Formats one persisted campaign grade consistently across Situation and terminal outcome surfaces. */
export function formatCampaignOutcomeGrade(grade: string): string {
  if (grade === "decisiveVictory") return "Decisive victory";
  if (grade === "costlyVictory") return "Costly victory";
  return grade.charAt(0).toUpperCase() + grade.slice(1);
}

function projectSituation(
  input: CampaignSituationWorkspaceProjectionInput,
  priorities: readonly CampaignCommandPriorityView[],
  commandAlerts: readonly CampaignCommandAlertView[],
  timeline: readonly CampaignCommandTimelineView[]
): CampaignCommandSituationView {
  const active = input.objectives.filter((objective) => objective.status === "In progress");
  const completed = input.objectives.filter((objective) => objective.status === "Completed");
  const failed = input.objectives.filter((objective) => objective.status === "Failed");
  const deadlines = input.objectivePresentations
    .filter((objective) => objective.status === "active" && objective.deadlineSegment !== null)
    .map((objective) => objective.deadlineSegment as number);
  const nearestDeadline = deadlines.length > 0 ? Math.min(...deadlines) : null;
  const remaining = nearestDeadline === null ? null : Math.max(0, nearestDeadline - input.currentSegment);
  const phase = input.scenario.campaignArc?.phases.find((entry) => entry.key === input.phaseKey);
  const defaultDefeatKeys = input.scenario.objectives
    .filter((objective) => objective.category === "primary" || objective.category === "failure")
    .map((objective) => objective.key);
  const defeatKeys = input.scenario.campaignArc?.defeatObjectiveKeys ?? defaultDefeatKeys;
  const lossConditions = defeatKeys.map((objectiveKey) => {
    const objective = input.objectives.find((entry) => entry.key === objectiveKey);
    return `Failing ${objective?.label ?? objectiveKey} ends the campaign.`;
  });
  if (input.scenario.campaignArc?.defeatWhenNoPlayerFormations) {
    lossConditions.push("Losing every Player formation ends the campaign.");
  }
  const priority = priorities[0];
  const outcome = input.campaignOutcome;
  const score = input.campaignScore;
  return {
    brief: outcome && !outcome.sandboxContinued
      ? {
        label: "Campaign record complete",
        title: outcome.result === "victory" ? "The operation is complete" : "The operation has been lost",
        detail: outcome.summary,
        tone: "complete"
      }
      : priority
        ? {
          label: "Commander's brief",
          title: phase?.label ?? input.phaseLabel,
          detail: `${active.length} active objective${active.length === 1 ? "" : "s"} · ${remaining === null ? "no active deadline" : `${remaining * CAMPAIGN_SEGMENT_HOURS} hours to the nearest deadline`}. The command priority below requires attention.`,
          tone: priority.severity === "critical" || priority.severity === "decisionRequired" ? "critical" : "attention"
        }
        : {
          label: "Commander's brief",
          title: `${input.phaseLabel} operations continue`,
          detail: `${active.length} active objective${active.length === 1 ? "" : "s"}; no immediate decision is blocking time.`,
          tone: "steady"
        },
    outlook: {
      phaseDescription: phase?.description ?? `${input.phaseLabel} is the active operational phase.`,
      timePressure: nearestDeadline === null
        ? "No active objective deadline"
        : `${remaining === 0 ? "Deadline reached" : `${(remaining ?? 0) * CAMPAIGN_SEGMENT_HOURS} hours remain`} · ${input.formatSegment(nearestDeadline)}`,
      projectedGrade: score ? formatCampaignOutcomeGrade(score.projectedGrade) : "Not yet scored",
      score: score ? `${score.earned} / ${score.available} · ${score.percent}%` : "Not yet scored",
      objectiveStatus: `${active.length} active · ${completed.length} complete · ${failed.length} failed`,
      lossConditions
    },
    alerts: commandAlerts,
    intelligenceUnread: input.intelligenceUnread,
    afterActionUnread: input.afterActionUnread,
    recentChanges: timeline.slice(0, 5)
  };
}

/** Projects the complete detached Situation workspace after its canonical objective cards are available. */
export function projectCampaignSituationWorkspace(
  input: CampaignSituationWorkspaceProjectionInput
): CampaignSituationWorkspaceProjection {
  const timeline = projectTimeline(input);
  const { latestAlerts, commandAlerts } = projectAlerts(input);
  const priorities = projectPriorities(input, latestAlerts);
  const latestRecord = input.advanceRecords[0];
  return {
    priorities,
    fronts: projectFronts(input, timeline),
    situation: projectSituation(input, priorities, commandAlerts, timeline),
    timeline,
    latestAlerts,
    commandAlerts,
    ...(input.campaignScore ? {
      objectiveScore: {
        earned: input.campaignScore.earned,
        available: input.campaignScore.available,
        percent: input.campaignScore.percent,
        projectedGrade: formatCampaignOutcomeGrade(input.campaignScore.projectedGrade)
      }
    } : {}),
    latestCheckpoint: latestRecord ? {
      timeLabel: input.formatSegment(latestRecord.toSegment),
      stopLabel: latestRecord.stopReason ? input.formatStopReason(latestRecord.stopReason) : null
    } : null
  };
}
