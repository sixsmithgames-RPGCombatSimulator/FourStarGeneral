import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  CampaignCommandAlertView,
  CampaignCommandShellView,
  CampaignCommandSituationView
} from "../src/ui/campaign/CampaignCommandShell";
import {
  projectCampaignCommandShellView,
  type CampaignCommandShellViewProjectionInput
} from "../src/ui/campaign/CampaignCommandShellViewProjection";
import { registerTest } from "./harness.js";

type LoadedInput = Extract<CampaignCommandShellViewProjectionInput, { readonly state: "loaded" }>;

function loadedInput(): LoadedInput {
  const alert: CampaignCommandAlertView = {
    id: "alert-1",
    severity: "critical",
    title: "Hold Hill 112",
    detail: "Enemy pressure is increasing.",
    targetKind: "objective",
    targetId: "hill-112",
    acknowledged: false
  };
  const situation: CampaignCommandSituationView = {
    brief: { label: "Current situation", title: "Line holding", detail: "The bridgehead remains viable.", tone: "attention" },
    outlook: {
      phaseDescription: "Breakout",
      timePressure: "12 hours remain",
      projectedGrade: "Major victory",
      score: "80 / 100",
      objectiveStatus: "1 of 2 complete",
      lossConditions: ["Do not lose the bridgehead"]
    },
    alerts: [alert],
    intelligenceUnread: 2,
    afterActionUnread: 1,
    recentChanges: []
  };
  return {
    state: "loaded",
    theaterTitle: "Western Front",
    campaignPhase: "Breakout",
    timeLabel: "D+2 0600",
    saveStatus: "Unsaved",
    intelligenceUnreadReports: 2,
    commandSummary: {
      commandStatus: "Engagement",
      unreadReports: 4,
      outcome: null,
      forces: [{ hexKey: "2,2", label: "Priority Battalion", count: 1 }],
      advance: {
        mode: "nextReport",
        enabled: true,
        pauseAfterEveryResolution: false,
        summary: "D+2 0600 · Automation continued",
        alerts: [alert],
        timeline: []
      }
    },
    situation: {
      situation,
      priorities: [],
      fronts: [],
      timeline: [],
      latestAlerts: [],
      commandAlerts: [alert],
      objectiveScore: { earned: 80, available: 100, percent: 80, projectedGrade: "Major victory" },
      latestCheckpoint: { timeLabel: "D+2 0600", stopLabel: null }
    },
    logistics: {
      resources: [{ key: "supplies", label: "Supply", value: "90" }],
      airPower: 3,
      navalPower: 1,
      navalSupport: {
        availableSupportAssignments: 1,
        availableFireMissions: 2,
        fireMissionsPerAssignment: 2,
        readySourceIds: ["fleet-1"],
        sources: [{
          sourceId: "fleet-1",
          sourceHexKey: "2,2",
          label: "Western Naval Force",
          readiness: 1,
          effectiveRangeHexes: 6,
          distanceHexes: 2,
          availableSupportAssignments: 1,
          availableFireMissions: 2,
          fireMissionsPerAssignment: 2,
          status: "ready",
          reason: "Fire control is ready.",
          nextAvailableSegment: null
        }]
      }
    },
    intelligence: {
      knownSites: [],
      knownRegions: [{
        id: "region-1",
        label: "Odon Valley",
        categoryLabel: "Operational area",
        summary: "A constrained approach.",
        sourceLabel: "Command briefing",
        locations: ["Hill 112", "Odon River"],
        commandStatus: "Known geography"
      }],
      contacts: [],
      intelligenceBriefs: [],
      intelligenceCapacity: "2 of 4 available"
    },
    operations: {
      orders: [],
      orderCommit: {
        busy: false,
        draftCount: 0,
        validDraftCount: 0,
        blockerCount: 0,
        firstBlocker: null,
        firstCorrectiveAction: null,
        feedback: null,
        feedbackTone: null
      }
    },
    afterActionReports: [],
    objectives: [
      { key: "hill-112", label: "Hold Hill 112", status: "In progress", hexKey: "2,2" },
      { key: "bridge", label: "Secure the bridge", status: "Completed", hexKey: "1,0" }
    ],
    formations: [],
    hexes: [
      {
        hexKey: "2,2",
        roleLabel: "Objective",
        controlLabel: "Player",
        forces: ["Priority Battalion"],
        capabilities: ["Air-wing staging"],
        infrastructure: null,
        objectives: ["Hold Hill 112"],
        fronts: ["Western Front"]
      },
      {
        hexKey: "1,0",
        roleLabel: "Bridge",
        controlLabel: "Player",
        forces: [],
        infrastructure: "Operational",
        objectives: ["Secure the bridge"],
        fronts: ["Western Front"]
      }
    ]
  };
}

registerTest("CAMPAIGN_COMMAND_SHELL_VIEW_PRESERVES_LOADED_PARITY_ORDER_AND_PRECEDENCE", () => {
  const input = loadedInput();
  const projected = projectCampaignCommandShellView(input);
  const expected: CampaignCommandShellView = {
    theaterTitle: input.theaterTitle,
    campaignPhase: input.campaignPhase,
    timeLabel: input.timeLabel,
    commandStatus: "Engagement",
    saveStatus: input.saveStatus,
    unreadReports: 4,
    situation: input.situation.situation,
    priorities: input.situation.priorities,
    afterActionReports: input.afterActionReports,
    resources: input.logistics.resources,
    objectives: input.objectives,
    objectiveScore: input.situation.objectiveScore,
    outcome: null,
    forces: input.commandSummary.forces,
    fronts: input.situation.fronts,
    knownSites: input.intelligence.knownSites,
    knownRegions: input.intelligence.knownRegions,
    contacts: input.intelligence.contacts,
    formations: input.formations,
    hexes: input.hexes,
    airPower: 3,
    navalPower: 1,
    navalSupport: input.logistics.navalSupport,
    intelligenceUnreadReports: 2,
    intelligenceBriefs: input.intelligence.intelligenceBriefs,
    intelligenceCapacity: "2 of 4 available",
    orders: input.operations.orders,
    orderCommit: input.operations.orderCommit,
    advance: input.commandSummary.advance
  };

  assert.deepEqual(projected, expected);
  assert.deepEqual(projected.objectives.map((objective) => objective.hexKey), ["2,2", "1,0"]);
  assert.deepEqual(projected.hexes?.map((hex) => hex.hexKey), ["2,2", "1,0"]);
  assert.equal(projected.commandStatus, "Engagement", "the canonical summary must retain status precedence");
});

registerTest("CAMPAIGN_COMMAND_SHELL_VIEW_DETACHES_ALL_NESTED_PRESENTATION_INPUTS", () => {
  const input = loadedInput();
  const projected = projectCampaignCommandShellView(input);

  (input.situation.situation.outlook.lossConditions as string[])[0] = "Source mutation";
  (input.commandSummary.advance.alerts as unknown as Array<{ title: string }>)[0]!.title = "Source mutation";
  (input.intelligence.knownRegions[0]!.locations as string[])[0] = "Source mutation";
  (input.logistics.navalSupport.sources as unknown as Array<{ label: string }>)[0]!.label = "Source mutation";
  (input.objectives as unknown as Array<{ label: string }>)[0]!.label = "Source mutation";
  (input.hexes[0]!.capabilities as string[])[0] = "Source mutation";

  assert.deepEqual(projected.situation?.outlook.lossConditions, ["Do not lose the bridgehead"]);
  assert.equal(projected.advance.alerts[0]?.title, "Hold Hill 112");
  assert.deepEqual(projected.knownRegions?.[0]?.locations, ["Hill 112", "Odon River"]);
  assert.equal(projected.navalSupport?.sources[0]?.label, "Western Naval Force");
  assert.equal(projected.objectives[0]?.label, "Hold Hill 112");
  assert.deepEqual(projected.hexes?.[0]?.capabilities, ["Air-wing staging"]);

  (projected.knownRegions?.[0]?.locations as string[])[0] = "View mutation";
  assert.equal(input.intelligence.knownRegions[0]?.locations[0], "Source mutation");
});

registerTest("CAMPAIGN_COMMAND_SHELL_VIEW_PRESERVES_EMPTY_COPY_AND_FRESH_COLLECTIONS", () => {
  const input: CampaignCommandShellViewProjectionInput = {
    state: "empty",
    saveStatus: "Loading",
    advanceMode: "dawn",
    pauseAfterEveryResolution: true
  };
  const first = projectCampaignCommandShellView(input);
  const second = projectCampaignCommandShellView(input);
  assert.deepEqual(first, {
    theaterTitle: "Campaign command",
    campaignPhase: "Awaiting theater",
    timeLabel: "No campaign loaded",
    commandStatus: "Planning",
    saveStatus: "Loading",
    unreadReports: 0,
    resources: [],
    objectives: [],
    forces: [],
    airPower: 0,
    navalPower: 0,
    intelligenceCapacity: "Unavailable",
    orders: [],
    advance: {
      mode: "dawn",
      enabled: false,
      pauseAfterEveryResolution: true,
      summary: "Load a campaign to advance time.",
      alerts: [],
      timeline: []
    }
  });
  assert.notEqual(first.resources, second.resources);
  assert.notEqual(first.advance, second.advance);
  assert.notEqual(first.advance.alerts, second.advance.alerts);
});

registerTest("CAMPAIGN_COMMAND_SHELL_VIEW_HAS_ONE_RUNTIME_OWNER_WITHOUT_STATE_OR_DOM_AUTHORITY", () => {
  const screen = readFileSync("src/ui/screens/CampaignScreen.ts", "utf8");
  const projector = readFileSync("src/ui/campaign/CampaignCommandShellViewProjection.ts", "utf8");
  const workspaceProjector = readFileSync("src/ui/campaign/CampaignCommandShellWorkspaceProjection.ts", "utf8");
  const renderMethod = screen.slice(screen.indexOf("private renderCommandShell"), screen.indexOf("private setCampaignStatusMessage"));

  assert.equal((renderMethod.match(/projectCampaignCommandShellView\(\{/g) ?? []).length, 2);
  assert.equal((renderMethod.match(/projectCampaignCommandShellWorkspaces\(\{/g) ?? []).length, 1);
  assert.doesNotMatch(renderMethod, /commandInterface\.render\(\{/);
  assert.doesNotMatch(renderMethod, /Load a campaign to advance time|Awaiting theater|intelligenceCapacity: "Unavailable"/);
  assert.match(projector, /export function projectCampaignCommandShellView/);
  assert.match(workspaceProjector, /export function projectCampaignCommandShellWorkspaces/);
  assert.equal((projector.match(/Load a campaign to advance time/g) ?? []).length, 1);
  assert.doesNotMatch(projector, /CampaignState|campaignState|getRuntimeSnapshot|getCampaignMapView/);
  assert.doesNotMatch(projector, /document\.|querySelector|addEventListener|HTMLElement|commandInterface\.render/);
  assert.doesNotMatch(workspaceProjector, /CampaignState|campaignState|getRuntimeSnapshot|getCampaignMapView/);
  assert.doesNotMatch(workspaceProjector, /document\.|querySelector|addEventListener|HTMLElement|commandInterface\.render/);
  for (const dependency of [
    "projectCampaignSituationObjectives", "projectCampaignFormationRoster",
    "projectCampaignIntelligenceWorkspace", "projectCampaignLogisticsWorkspace", "projectCampaignCommandHexes"
  ]) {
    assert.equal((workspaceProjector.match(new RegExp(`${dependency}\\(`, "g")) ?? []).length, 1,
      `${dependency} must have one publication path.`);
  }
  for (const reader of [
    "readFormationRoster", "readIntelBriefEvents", "readProductionReport", "readCurrentSegment", "readNavalSupport"
  ]) {
    assert.equal((workspaceProjector.match(new RegExp(`input\\.${reader}\\(`, "g")) ?? []).length, 1,
      `${reader} must be sampled exactly once per shell projection.`);
  }
});
