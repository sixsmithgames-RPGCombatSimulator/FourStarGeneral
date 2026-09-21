import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignOutcomeRuntime } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import type {
  CampaignCommandAlertView,
  CampaignCommandFormationView,
  CampaignCommandTimelineView
} from "../src/ui/campaign/CampaignCommandShell";
import type { CampaignLocationPresentation } from "../src/ui/campaign/CampaignLocationPresentation";
import {
  projectCampaignCommandSummary,
  type CampaignCommandSummaryProjectionInput
} from "../src/ui/campaign/CampaignCommandSummaryProjection";
import { registerTest } from "./harness.js";

function formation(overrides: Partial<CampaignCommandFormationView> = {}): CampaignCommandFormationView {
  return {
    id: "formation-1",
    name: "1st Division",
    typeLabel: "Infantry division",
    ownershipLabel: "Player",
    locationHexKey: "0,0",
    statusLabel: "Ready",
    readiness: "Ready",
    cohesion: "Steady",
    fatigue: "Rested",
    personnel: "10,000",
    equipment: "Full",
    supply: "Full",
    experience: "Veteran",
    honors: [],
    battles: 0,
    currentOrderId: null,
    latestHistory: null,
    ...overrides
  };
}

function scenario(): Pick<CampaignScenarioData, "tiles" | "tilePalette"> {
  return { tiles: [], tilePalette: {} };
}

function input(overrides: Partial<CampaignCommandSummaryProjectionInput> = {}): CampaignCommandSummaryProjectionInput {
  return {
    scenario: scenario(),
    priorityForceHexes: new Set(),
    resolveLocation: (hexKey) => ({ primaryLabel: `Position ${hexKey}`, secondaryGridReference: `Grid ${hexKey}` }),
    runtimeStatus: "planning",
    hasActiveEngagement: false,
    pendingEngagementCount: 0,
    playerOrders: [],
    intelligenceUnread: 0,
    afterActionReports: [],
    commandAlerts: [],
    outcome: null,
    allowContinueAfterOutcome: false,
    formations: [],
    saveStatus: "Unsaved",
    advance: {
      mode: "segment",
      enabled: true,
      pauseAfterEveryResolution: false,
      draftCount: 0,
      latestCheckpoint: null,
      alerts: [],
      timeline: []
    },
    ...overrides
  };
}

registerTest("CAMPAIGN_COMMAND_SUMMARY_PROJECTS_OFFSET_FORCES_WITH_PRIORITY_AND_DETACHMENT", () => {
  const mutableLocation: CampaignLocationPresentation = {
    primaryLabel: "Hill 112",
    secondaryGridReference: "Grid 2,2",
    uncertainty: { status: "stale", confidenceBand: "medium", radiusHexes: 1, label: "Reported position" }
  };
  const source = {
    tilePalette: {
      friendly: { role: "region" as const, factionControl: "Player" },
      opposing: { role: "region" as const, factionControl: "Bot" }
    },
    tiles: [
      { tile: "friendly", hex: { q: 0, r: 0 }, forces: [{ unitType: "Infantry_42", count: 2, label: "Rear Battalion" }] },
      {
        tile: "friendly",
        hex: { q: 2, r: 1 },
        forces: [
          { unitType: "Infantry_42", count: 1, label: "Priority Battalion" },
          { unitType: "Supply_Truck", count: 3, label: "Solent supply columns" }
        ]
      },
      { tile: "opposing", hex: { q: 3, r: 1 }, forces: [{ unitType: "Infantry_42", count: 9, label: "Hidden Enemy" }] }
    ]
  };
  const locationCalls: string[] = [];
  const projected = projectCampaignCommandSummary(input({
    scenario: source,
    priorityForceHexes: new Set(["2,2"]),
    resolveLocation: (hexKey) => {
      locationCalls.push(hexKey);
      return hexKey === "2,2" ? mutableLocation : { primaryLabel: "Rear", secondaryGridReference: "Grid 0,0" };
    }
  }));

  assert.deepEqual(locationCalls, ["0,0", "2,2"], "location lookup must use operational offset keys before presentation sorting");
  assert.deepEqual(projected.forces, [
    {
      hexKey: "2,2",
      location: {
        primaryLabel: "Hill 112",
        secondaryGridReference: "Grid 2,2",
        uncertainty: { status: "stale", confidenceBand: "medium", radiusHexes: 1, label: "Reported position" }
      },
      label: "Priority Battalion",
      count: 1
    },
    {
      hexKey: "0,0",
      location: { primaryLabel: "Rear", secondaryGridReference: "Grid 0,0" },
      label: "Rear Battalion",
      count: 2
    }
  ]);
  (mutableLocation as { primaryLabel: string }).primaryLabel = "Source mutation";
  (mutableLocation.uncertainty as { label: string }).label = "Mutated uncertainty";
  source.tiles[1]!.forces![0]!.count = 99;
  assert.equal(projected.forces[0]?.location?.primaryLabel, "Hill 112");
  assert.equal(projected.forces[0]?.location?.uncertainty?.label, "Reported position");
  assert.equal(projected.forces[0]?.count, 1);
});

registerTest("CAMPAIGN_COMMAND_SUMMARY_PRESERVES_STATUS_OUTCOME_UNREAD_AND_ADVANCE_PRECEDENCE", () => {
  const unacknowledgedAlert: CampaignCommandAlertView = {
    id: "alert-1",
    severity: "critical",
    title: "Decision required",
    detail: "Resolve the front.",
    targetKind: "campaign",
    targetId: null,
    acknowledged: false
  };
  const acknowledgedAlert: CampaignCommandAlertView = { ...unacknowledgedAlert, id: "alert-2", acknowledged: true };
  const timelineEntry: CampaignCommandTimelineView = {
    id: "timeline-1",
    timeLabel: "D+1 0600",
    title: "Advance stopped",
    detail: "Enemy contact reported.",
    severity: "critical",
    stopLabel: "Critical alert",
    targetKind: "time",
    targetId: null
  };
  const outcome: CampaignOutcomeRuntime = {
    result: "victory",
    grade: "decisiveVictory",
    segment: 12,
    phaseKey: "breakout",
    scoreEarned: 240,
    scoreAvailable: 250,
    completedObjectiveKeys: ["one", "two"],
    failedObjectiveKeys: ["three"],
    summary: "The operation succeeded.",
    sandboxContinued: false
  };
  const formations = [
    formation({ id: "a", name: "Alpha", honors: ["Caen", "Falaise"], battles: 1 }),
    formation({ id: "b", name: "Bravo", honors: ["Omaha"], battles: 9 }),
    formation({ id: "c", name: "Charlie", battles: 10 }),
    formation({ id: "d", name: "Delta", battles: 2 }),
    formation({ id: "e", name: "Echo", statusLabel: "Destroyed", battles: 0 })
  ];
  const advanceAlerts = [unacknowledgedAlert];
  const timeline = [timelineEntry];
  const projected = projectCampaignCommandSummary(input({
    runtimeStatus: "victory",
    hasActiveEngagement: true,
    pendingEngagementCount: 2,
    playerOrders: [{ status: "executing" }],
    intelligenceUnread: 2,
    afterActionReports: [{ acknowledged: false }, { acknowledged: true }],
    commandAlerts: [unacknowledgedAlert, acknowledgedAlert],
    outcome,
    allowContinueAfterOutcome: true,
    formations,
    saveStatus: "Save Failed",
    advance: {
      mode: "nextReport",
      enabled: false,
      pauseAfterEveryResolution: true,
      draftCount: 2,
      latestCheckpoint: { timeLabel: "D+1 0600", stopLabel: "Critical alert" },
      alerts: advanceAlerts,
      timeline
    }
  }));

  assert.equal(projected.commandStatus, "Campaign Ended", "terminal state must outrank engagement and order activity");
  assert.equal(projected.unreadReports, 4);
  assert.deepEqual(projected.outcome, {
    key: "victory:12",
    result: "victory",
    grade: "Decisive victory",
    title: "Operation complete",
    summary: "The operation succeeded.",
    score: "240 / 250",
    completed: 2,
    failed: 1,
    canContinue: true,
    formationsPreserved: "4 / 5 retained",
    serviceRecord: ["Alpha · 1 battle · Caen, Falaise", "Bravo · 9 battles · Omaha", "Charlie · 10 battles"],
    checkpointStatus: "Campaign record save failed. Save before returning to the main menu."
  });
  assert.deepEqual(projected.advance, {
    mode: "nextReport",
    enabled: false,
    pauseAfterEveryResolution: true,
    summary: "2 uncommitted drafts; Advance will not execute them. D+1 0600 · Stopped: Critical alert",
    alerts: [unacknowledgedAlert],
    timeline: [timelineEntry]
  });

  (unacknowledgedAlert as { title: string }).title = "Source mutation";
  (timelineEntry as { detail: string }).detail = "Source mutation";
  (formations[0]!.honors as string[]).push("Source mutation");
  assert.equal(projected.advance.alerts[0]?.title, "Decision required");
  assert.equal(projected.advance.timeline[0]?.detail, "Enemy contact reported.");
  assert.deepEqual(projected.outcome?.serviceRecord, ["Alpha · 1 battle · Caen, Falaise", "Bravo · 9 battles · Omaha", "Charlie · 10 battles"]);
  (projected.advance.alerts as Array<{ title: string }>)[0]!.title = "View mutation";
  assert.equal(unacknowledgedAlert.title, "Source mutation");
});

registerTest("CAMPAIGN_COMMAND_SUMMARY_PRESERVES_NONTERMINAL_STATUS_AND_EMPTY_ADVANCE_PARITY", () => {
  const statuses = [
    { expected: "Engagement", hasActiveEngagement: true, pendingEngagementCount: 1, playerOrders: [{ status: "completed" as const }] },
    { expected: "Orders Ready", hasActiveEngagement: false, pendingEngagementCount: 1, playerOrders: [] },
    { expected: "Orders Ready", hasActiveEngagement: false, pendingEngagementCount: 0, playerOrders: [{ status: "blocked" as const }] },
    { expected: "Planning", hasActiveEngagement: false, pendingEngagementCount: 0, playerOrders: [{ status: "completed" as const }] }
  ];
  statuses.forEach((status) => {
    assert.equal(projectCampaignCommandSummary(input({
      hasActiveEngagement: status.hasActiveEngagement,
      pendingEngagementCount: status.pendingEngagementCount,
      playerOrders: status.playerOrders
    })).commandStatus, status.expected);
  });

  const projected = projectCampaignCommandSummary(input({
    outcome: {
      result: "defeat",
      grade: "defeat",
      segment: 4,
      phaseKey: "opening",
      scoreEarned: 0,
      scoreAvailable: 100,
      completedObjectiveKeys: [],
      failedObjectiveKeys: ["line"],
      summary: "Recorded result.",
      sandboxContinued: true
    },
    advance: {
      mode: "segment",
      enabled: true,
      pauseAfterEveryResolution: false,
      draftCount: 1,
      latestCheckpoint: null,
      alerts: [],
      timeline: []
    }
  }));
  assert.equal(projected.outcome, null, "sandbox continuation must suppress the terminal card without rewriting the record");
  assert.equal(projected.advance.summary, "1 uncommitted draft; Advance will not execute them. No campaign time resolved yet.");
});

registerTest("CAMPAIGN_COMMAND_SUMMARY_PRESERVES_AUTOMATION_COPY_AND_STABLE_SERVICE_TIES", () => {
  const projected = projectCampaignCommandSummary(input({
    outcome: {
      result: "defeat",
      grade: "defeat",
      segment: 7,
      phaseKey: "defense",
      scoreEarned: 40,
      scoreAvailable: 100,
      completedObjectiveKeys: [],
      failedObjectiveKeys: ["line"],
      summary: "The line was lost.",
      sandboxContinued: false
    },
    formations: [
      formation({ id: "zulu", name: "Zulu", honors: ["Odon"], battles: 3 }),
      formation({ id: "able", name: "Able", honors: ["Caen"], battles: 3 })
    ],
    advance: {
      mode: "day",
      enabled: true,
      pauseAfterEveryResolution: false,
      draftCount: 0,
      latestCheckpoint: { timeLabel: "D+2 1200", stopLabel: null },
      alerts: [],
      timeline: []
    }
  }));

  assert.equal(projected.advance.summary, "D+2 1200 · Automation continued");
  assert.deepEqual(projected.outcome?.serviceRecord, [
    "Zulu · 3 battles · Odon",
    "Able · 3 battles · Caen"
  ], "equal honors and battle totals must retain authoritative source order");
});

registerTest("CAMPAIGN_COMMAND_SUMMARY_HAS_ONE_RUNTIME_OWNER_WITHOUT_STATE_OR_DOM_AUTHORITY", () => {
  const screen = readFileSync("src/ui/screens/CampaignScreen.ts", "utf8");
  const projector = readFileSync("src/ui/campaign/CampaignCommandSummaryProjection.ts", "utf8");
  assert.equal((screen.match(/projectCampaignCommandSummary\(\{/g) ?? []).length, 1);
  assert.doesNotMatch(screen, /const actionableOrders|const retainedFormations|const serviceRecord/);
  assert.doesNotMatch(screen, /Advance will not execute them|Campaign record .*toLowerCase/);
  assert.match(projector, /export function projectCampaignCommandSummary/);
  assert.doesNotMatch(projector, /CampaignState|campaignState|document\.|querySelector|addEventListener/);
  assert.equal((projector.match(/No campaign time resolved yet/g) ?? []).length, 1);
});
