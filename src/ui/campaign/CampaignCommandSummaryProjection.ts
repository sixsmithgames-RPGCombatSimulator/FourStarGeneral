/**
 * MODULE: CampaignCommandSummaryProjection
 * WHAT: Projects the loaded command shell's high-level force, status, outcome, and advance summaries.
 * WHY: Top-level command facts need one deterministic owner outside the state-reading screen controller.
 */

import type { CampaignScenarioData } from "../../core/campaignTypes";
import type { CampaignOrder } from "../../game/campaign/orders/CampaignOrderTypes";
import type { CampaignOutcomeRuntime, CampaignRuntimeStatus } from "../../game/campaign/runtime/campaignRuntimeTypes";
import { resolveCampaignForceGroupCommandLabel } from "../../game/campaign/formations/CampaignFormationPresentation";
import { projectLegacyForceGroupAsSupportCapacity } from "../../game/campaign/logistics/CampaignSupportCapacityAdapter";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import type {
  CampaignCommandAdvanceMode,
  CampaignCommandAdvanceView,
  CampaignCommandAfterActionReportView,
  CampaignCommandAlertView,
  CampaignCommandForceView,
  CampaignCommandFormationView,
  CampaignCommandOutcomeView,
  CampaignCommandShellView,
  CampaignCommandTimelineView
} from "./CampaignCommandShell";
import type { CampaignLocationPresentation } from "./CampaignLocationPresentation";
import { formatCampaignOutcomeGrade } from "./CampaignSituationWorkspaceProjection";

const ACTIONABLE_ORDER_STATUSES = new Set<CampaignOrder["status"]>(["draft", "committed", "executing", "blocked"]);
const TERMINAL_FORMATION_STATUSES = new Set(["Destroyed", "Disbanded", "Captured"]);

interface CampaignCommandAdvanceSummaryInput {
  readonly mode: CampaignCommandAdvanceMode;
  readonly enabled: boolean;
  readonly pauseAfterEveryResolution: boolean;
  readonly draftCount: number;
  readonly latestCheckpoint: { readonly timeLabel: string; readonly stopLabel: string | null } | null;
  readonly alerts: readonly CampaignCommandAlertView[];
  readonly timeline: readonly CampaignCommandTimelineView[];
}

export interface CampaignCommandSummaryProjectionInput {
  readonly scenario: Pick<CampaignScenarioData, "tiles" | "tilePalette">;
  readonly priorityForceHexes: ReadonlySet<string>;
  readonly resolveLocation: (hexKey: string) => CampaignLocationPresentation;
  readonly runtimeStatus: CampaignRuntimeStatus | null;
  readonly hasActiveEngagement: boolean;
  readonly pendingEngagementCount: number;
  readonly playerOrders: readonly Pick<CampaignOrder, "status">[];
  readonly intelligenceUnread: number;
  readonly afterActionReports: readonly Pick<CampaignCommandAfterActionReportView, "acknowledged">[];
  readonly commandAlerts: readonly CampaignCommandAlertView[];
  readonly outcome: CampaignOutcomeRuntime | null | undefined;
  readonly allowContinueAfterOutcome: boolean;
  readonly formations: readonly CampaignCommandFormationView[];
  readonly saveStatus: CampaignCommandShellView["saveStatus"];
  readonly advance: CampaignCommandAdvanceSummaryInput;
}

export interface CampaignCommandSummaryProjection {
  readonly forces: readonly CampaignCommandForceView[];
  readonly commandStatus: CampaignCommandShellView["commandStatus"];
  readonly unreadReports: number;
  readonly outcome: CampaignCommandOutcomeView | null;
  readonly advance: CampaignCommandAdvanceView;
}

function detachLocation(location: CampaignLocationPresentation): CampaignLocationPresentation {
  return {
    primaryLabel: location.primaryLabel,
    secondaryGridReference: location.secondaryGridReference,
    ...(location.uncertainty ? { uncertainty: { ...location.uncertainty } } : {})
  };
}

function projectForces(input: CampaignCommandSummaryProjectionInput): CampaignCommandForceView[] {
  return input.scenario.tiles.flatMap((tile) => {
    const palette = input.scenario.tilePalette[tile.tile];
    const controller = tile.factionControl ?? palette?.factionControl;
    if (controller !== "Player") return [];
    const offset = CoordinateSystem.axialToOffset(tile.hex.q, tile.hex.r);
    const hexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
    return (tile.forces ?? [])
      .filter((force) => force.count > 0 && projectLegacyForceGroupAsSupportCapacity(force) === null)
      .map((force) => ({
        hexKey,
        location: detachLocation(input.resolveLocation(hexKey)),
        label: resolveCampaignForceGroupCommandLabel(force.label, force.unitType),
        count: force.count
      }));
  }).sort((left, right) => {
    const leftPriority = input.priorityForceHexes.has(left.hexKey) ? 0 : 1;
    const rightPriority = input.priorityForceHexes.has(right.hexKey) ? 0 : 1;
    return leftPriority - rightPriority || left.hexKey.localeCompare(right.hexKey) || left.label.localeCompare(right.label);
  });
}

function projectCommandStatus(input: CampaignCommandSummaryProjectionInput): CampaignCommandShellView["commandStatus"] {
  if (input.runtimeStatus === "victory" || input.runtimeStatus === "defeat") return "Campaign Ended";
  if (input.hasActiveEngagement) return "Engagement";
  return input.pendingEngagementCount > 0 || input.playerOrders.some((order) => ACTIONABLE_ORDER_STATUSES.has(order.status))
    ? "Orders Ready"
    : "Planning";
}

function projectOutcome(input: CampaignCommandSummaryProjectionInput): CampaignCommandOutcomeView | null {
  const outcome = input.outcome;
  if (!outcome || outcome.sandboxContinued) return null;
  const retainedCount = input.formations.filter((formation) => !TERMINAL_FORMATION_STATUSES.has(formation.statusLabel)).length;
  const serviceRecord = [...input.formations]
    .filter((formation) => formation.battles > 0 || formation.honors.length > 0)
    .sort((left, right) => right.honors.length - left.honors.length || right.battles - left.battles)
    .slice(0, 3)
    .map((formation) => `${formation.name} · ${formation.battles} battle${formation.battles === 1 ? "" : "s"}${formation.honors.length > 0 ? ` · ${formation.honors.join(", ")}` : ""}`);
  return {
    key: `${outcome.result}:${outcome.segment}`,
    result: outcome.result,
    grade: formatCampaignOutcomeGrade(outcome.grade),
    title: outcome.result === "victory" ? "Operation complete" : "Operation lost",
    summary: outcome.summary,
    score: `${outcome.scoreEarned} / ${outcome.scoreAvailable}`,
    completed: outcome.completedObjectiveKeys.length,
    failed: outcome.failedObjectiveKeys.length,
    canContinue: input.allowContinueAfterOutcome,
    formationsPreserved: `${retainedCount} / ${input.formations.length} retained`,
    serviceRecord,
    checkpointStatus: `Campaign record ${input.saveStatus.toLowerCase()}. Save before returning to the main menu.`
  };
}

function projectAdvance(input: CampaignCommandAdvanceSummaryInput): CampaignCommandAdvanceView {
  const draftWarning = input.draftCount > 0
    ? `${input.draftCount} uncommitted draft${input.draftCount === 1 ? "" : "s"}; Advance will not execute them. `
    : "";
  const checkpoint = input.latestCheckpoint
    ? `${input.latestCheckpoint.timeLabel} · ${input.latestCheckpoint.stopLabel ? `Stopped: ${input.latestCheckpoint.stopLabel}` : "Automation continued"}`
    : "No campaign time resolved yet.";
  return {
    mode: input.mode,
    enabled: input.enabled,
    pauseAfterEveryResolution: input.pauseAfterEveryResolution,
    summary: `${draftWarning}${checkpoint}`,
    alerts: input.alerts.map((alert) => ({ ...alert })),
    timeline: input.timeline.map((entry) => ({ ...entry }))
  };
}

/** Projects all loaded-shell summary facts without retaining mutable caller-owned arrays or objects. */
export function projectCampaignCommandSummary(input: CampaignCommandSummaryProjectionInput): CampaignCommandSummaryProjection {
  return {
    forces: projectForces(input),
    commandStatus: projectCommandStatus(input),
    unreadReports: input.intelligenceUnread
      + input.afterActionReports.filter((report) => !report.acknowledged).length
      + input.commandAlerts.filter((alert) => !alert.acknowledged).length,
    outcome: projectOutcome(input),
    advance: projectAdvance(input.advance)
  };
}
