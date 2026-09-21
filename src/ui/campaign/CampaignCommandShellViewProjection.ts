/**
 * Pure assembly for the command shell's empty and loaded presentation models.
 * CampaignScreen remains the only campaign snapshot reader and the only render/event owner.
 */
import type { CampaignCommandSummaryProjection } from "./CampaignCommandSummaryProjection";
import type { CampaignIntelligenceWorkspaceProjection } from "./CampaignIntelligenceWorkspaceProjection";
import type { CampaignLogisticsWorkspaceProjection } from "./CampaignLogisticsWorkspaceProjection";
import type { CampaignOperationsWorkspaceProjection } from "./CampaignOperationsWorkspaceProjection";
import type {
  CampaignCommandAdvanceMode,
  CampaignCommandShellView
} from "./CampaignCommandShell";
import type { CampaignSituationWorkspaceProjection } from "./CampaignSituationWorkspaceProjection";

interface CampaignCommandEmptyShellProjectionInput {
  readonly state: "empty";
  readonly saveStatus: CampaignCommandShellView["saveStatus"];
  readonly advanceMode: CampaignCommandAdvanceMode;
  readonly pauseAfterEveryResolution: boolean;
}

interface CampaignCommandLoadedShellProjectionInput {
  readonly state: "loaded";
  readonly theaterTitle: string;
  readonly campaignPhase: string;
  readonly timeLabel: string;
  readonly saveStatus: CampaignCommandShellView["saveStatus"];
  readonly intelligenceUnreadReports: number;
  readonly commandSummary: CampaignCommandSummaryProjection;
  readonly situation: CampaignSituationWorkspaceProjection;
  readonly logistics: Omit<CampaignLogisticsWorkspaceProjection, "capabilitiesByHex">;
  readonly intelligence: CampaignIntelligenceWorkspaceProjection;
  readonly operations: CampaignOperationsWorkspaceProjection;
  readonly afterActionReports: NonNullable<CampaignCommandShellView["afterActionReports"]>;
  readonly objectives: CampaignCommandShellView["objectives"];
  readonly formations: NonNullable<CampaignCommandShellView["formations"]>;
  readonly hexes: NonNullable<CampaignCommandShellView["hexes"]>;
}

export type CampaignCommandShellViewProjectionInput =
  | CampaignCommandEmptyShellProjectionInput
  | CampaignCommandLoadedShellProjectionInput;

function projectEmptyShell(input: CampaignCommandEmptyShellProjectionInput): CampaignCommandShellView {
  return {
    theaterTitle: "Campaign command",
    campaignPhase: "Awaiting theater",
    timeLabel: "No campaign loaded",
    commandStatus: "Planning",
    saveStatus: input.saveStatus,
    unreadReports: 0,
    resources: [],
    objectives: [],
    forces: [],
    airPower: 0,
    navalPower: 0,
    intelligenceCapacity: "Unavailable",
    orders: [],
    advance: {
      mode: input.advanceMode,
      enabled: false,
      pauseAfterEveryResolution: input.pauseAfterEveryResolution,
      summary: "Load a campaign to advance time.",
      alerts: [],
      timeline: []
    }
  };
}

function projectLoadedShell(input: CampaignCommandLoadedShellProjectionInput): CampaignCommandShellView {
  return {
    theaterTitle: input.theaterTitle,
    campaignPhase: input.campaignPhase,
    timeLabel: input.timeLabel,
    commandStatus: input.commandSummary.commandStatus,
    saveStatus: input.saveStatus,
    unreadReports: input.commandSummary.unreadReports,
    situation: input.situation.situation,
    priorities: input.situation.priorities,
    afterActionReports: input.afterActionReports,
    resources: input.logistics.resources,
    objectives: input.objectives,
    objectiveScore: input.situation.objectiveScore,
    outcome: input.commandSummary.outcome,
    forces: input.commandSummary.forces,
    fronts: input.situation.fronts,
    knownSites: input.intelligence.knownSites,
    knownRegions: input.intelligence.knownRegions,
    contacts: input.intelligence.contacts,
    formations: input.formations,
    hexes: input.hexes,
    airPower: input.logistics.airPower,
    navalPower: input.logistics.navalPower,
    navalSupport: input.logistics.navalSupport,
    intelligenceUnreadReports: input.intelligenceUnreadReports,
    intelligenceBriefs: input.intelligence.intelligenceBriefs,
    intelligenceCapacity: input.intelligence.intelligenceCapacity,
    orders: input.operations.orders,
    orderCommit: input.operations.orderCommit,
    advance: input.commandSummary.advance
  };
}

/** Assembles a detached shell view without reading state or retaining caller-owned presentation objects. */
export function projectCampaignCommandShellView(
  input: CampaignCommandShellViewProjectionInput
): CampaignCommandShellView {
  return structuredClone(input.state === "empty" ? projectEmptyShell(input) : projectLoadedShell(input));
}
