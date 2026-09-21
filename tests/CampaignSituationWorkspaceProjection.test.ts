import assert from "node:assert/strict";
import type { CampaignEnemyContactView } from "../src/core/campaignIntelTypes";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignObjectivePresentation } from "../src/game/campaign/objectives/CampaignObjectiveEvaluator";
import type {
  CampaignAdvanceAlertSeverity,
  CampaignAdvanceStepRecord
} from "../src/game/campaign/runtime/campaignRuntimeTypes";
import type { CampaignCommandFormationView } from "../src/ui/campaign/CampaignCommandShell";
import type { CampaignLocationPresentation } from "../src/ui/campaign/CampaignLocationPresentation";
import {
  projectCampaignSituationObjectives,
  projectCampaignSituationWorkspace,
  type CampaignSituationFrontAssessment
} from "../src/ui/campaign/CampaignSituationWorkspaceProjection";
import { registerTest } from "./harness.js";

function situationScenario(): CampaignScenarioData {
  return {
    key: "situation-projection",
    title: "Situation projection",
    description: "Projection fixture",
    dimensions: { cols: 8, rows: 8 },
    background: { imageUrl: "fixture.png" },
    tilePalette: {},
    tiles: [],
    fronts: [
      {
        key: "allied",
        label: "Allied advance",
        hexKeys: ["1,1"],
        edges: [{ friendlyHexKey: "1,1", opposingHexKey: "2,1" }],
        initiative: "Player"
      },
      {
        key: "counter",
        label: "Enemy counterattack",
        hexKeys: ["3,3"],
        edges: [{ friendlyHexKey: "3,3", opposingHexKey: "2,2" }],
        initiative: "Bot",
        modifiers: ["counterattack@8"]
      }
    ],
    objectives: [
      {
        key: "bridge",
        label: "Bridgehead",
        description: "Hold the bridgehead.",
        hex: { q: 1, r: 1 },
        owner: "Player",
        rewards: [],
        category: "primary",
        deadlineSegment: 9,
        score: 100,
        requiresObjectives: ["causeway"],
        phaseKey: "lodgment"
      },
      {
        key: "causeway",
        label: "Secure the causeway",
        description: "Keep the supply route open.",
        hex: { q: 2, r: 1 },
        owner: "Player",
        rewards: [],
        category: "secondary",
        score: 50,
        phaseKey: "lodgment"
      }
    ],
    campaignArc: {
      phases: [{
        key: "lodgment",
        label: "Lodgment",
        description: "Hold the line.",
        objectiveKeys: ["bridge", "causeway"]
      }],
      defeatObjectiveKeys: ["bridge"],
      defeatWhenNoPlayerFormations: true
    },
    economies: []
  };
}

function objectivePresentations(): CampaignObjectivePresentation[] {
  return [
    {
      key: "bridge",
      label: "Bridgehead",
      description: "Hold the bridgehead.",
      category: "primary",
      status: "active",
      progress: 0.5,
      progressLabel: "Hold for 1 more segment",
      progressCurrent: 1,
      progressTarget: 2,
      conditionLabels: ["Control Bridgehead", "Maintain supply"],
      deadlineSegment: 9,
      score: 100,
      scoreAwarded: 0,
      phaseKey: "lodgment",
      visible: true
    },
    {
      key: "causeway",
      label: "Secure the causeway",
      description: "Keep the supply route open.",
      category: "secondary",
      status: "completed",
      progress: 1,
      progressLabel: "Complete",
      progressCurrent: 1,
      progressTarget: 1,
      conditionLabels: ["Control Causeway"],
      deadlineSegment: null,
      score: 50,
      scoreAwarded: 50,
      phaseKey: "lodgment",
      visible: true
    }
  ];
}

function mutableLocation(hexKey: string): CampaignLocationPresentation {
  return {
    primaryLabel: `Position ${hexKey}`,
    secondaryGridReference: `Grid ${hexKey}`,
    uncertainty: {
      status: "stale",
      confidenceBand: "medium",
      radiusHexes: 1,
      label: "Last reported position"
    }
  };
}

registerTest("CAMPAIGN_SITUATION_OBJECTIVES_PRESERVE_COPY_ORDER_AND_DETACH_LOCATIONS", () => {
  const scenario = situationScenario();
  const presentations = objectivePresentations();
  const locations = new Map<string, CampaignLocationPresentation>([
    ["1,1", mutableLocation("1,1")],
    ["2,2", mutableLocation("2,2")]
  ]);
  const segmentCalls: number[] = [];
  const locationCalls: string[] = [];
  const projected = projectCampaignSituationObjectives({
    scenario,
    presentations,
    formatSegment: (segment) => {
      segmentCalls.push(segment);
      return `Segment ${segment}`;
    },
    resolveLocation: (hexKey) => {
      locationCalls.push(hexKey);
      return locations.get(hexKey)!;
    }
  });

  assert.deepEqual(segmentCalls, [9]);
  assert.deepEqual(locationCalls, ["1,1", "2,2"]);
  assert.deepEqual([...projected.priorityForceHexes], ["1,1"]);
  assert.deepEqual(projected.objectives.map((objective) => ({
    key: objective.key,
    status: objective.status,
    deadline: objective.deadline,
    score: objective.score,
    dependencies: objective.dependencies,
    failureEffect: objective.failureEffect,
    hexKey: objective.hexKey
  })), [
    {
      key: "bridge",
      status: "In progress",
      deadline: "Segment 9",
      score: "0/100 pts",
      dependencies: "Requires Secure the causeway",
      failureEffect: "Failure ends the campaign",
      hexKey: "1,1"
    },
    {
      key: "causeway",
      status: "Completed",
      deadline: null,
      score: "50/50 pts",
      dependencies: null,
      failureEffect: null,
      hexKey: "2,2"
    }
  ]);
  assert.notEqual(projected.objectives[0].location, locations.get("1,1"));
  assert.notEqual(projected.objectives[0].location?.uncertainty, locations.get("1,1")?.uncertainty);
  assert.notEqual(projected.objectives[0].conditionLabels, presentations[0].conditionLabels);

  (presentations[0].conditionLabels as string[])[0] = "Mutated condition";
  (locations.get("1,1") as { primaryLabel: string }).primaryLabel = "Mutated location";
  (locations.get("1,1")!.uncertainty as { label: string }).label = "Mutated uncertainty";
  scenario.objectives[0].requiresObjectives![0] = "mutated-dependency";
  assert.deepEqual(projected.objectives[0].conditionLabels, ["Control Bridgehead", "Maintain supply"]);
  assert.equal(projected.objectives[0].location?.primaryLabel, "Position 1,1");
  assert.equal(projected.objectives[0].location?.uncertainty?.label, "Last reported position");
  assert.equal(projected.objectives[0].dependencies, "Requires Secure the causeway");
});

registerTest("CAMPAIGN_SITUATION_WORKSPACE_PRESERVES_PRIORITY_FRONT_AND_TIMELINE_PARITY", () => {
  const scenario = situationScenario();
  const presentations = objectivePresentations();
  const objectiveLocations = new Map<string, CampaignLocationPresentation>([
    ["1,1", mutableLocation("1,1")],
    ["2,2", mutableLocation("2,2")]
  ]);
  const objectives = projectCampaignSituationObjectives({
    scenario,
    presentations,
    formatSegment: (segment) => `Segment ${segment}`,
    resolveLocation: (hexKey) => objectiveLocations.get(hexKey)!
  }).objectives;
  const contacts: CampaignEnemyContactView[] = [{
    id: "contact-1",
    subjectKind: "force",
    level: "located",
    state: "stale",
    confidenceBand: "medium",
    locationHexKey: "3,3",
    uncertaintyRadius: 1,
    domain: "ground",
    label: "Enemy armor",
    lastObservedSegment: 4,
    ageSegments: 2,
    sourceLabels: ["Recon"],
    analystNotes: []
  }];
  const formations: CampaignCommandFormationView[] = [
    {
      id: "formation-1", name: "1st Brigade", typeLabel: "Infantry", ownershipLabel: "Player",
      locationHexKey: "1,1", statusLabel: "Ready", readiness: "Ready", cohesion: "Steady",
      fatigue: "Low", personnel: "900", equipment: "Full", supply: "Supplied", experience: "Veteran",
      honors: ["Bridgehead"], battles: 1, currentOrderId: null, latestHistory: null
    },
    {
      id: "formation-2", name: "2nd Brigade", typeLabel: "Infantry", ownershipLabel: "Player",
      locationHexKey: "2,2", statusLabel: "Ready", readiness: "Ready", cohesion: "Steady",
      fatigue: "Low", personnel: "850", equipment: "Full", supply: "Supplied", experience: "Regular",
      honors: [], battles: 0, currentOrderId: null, latestHistory: null
    }
  ];
  const records: CampaignAdvanceStepRecord[] = [
    {
      id: "advance-6", commandId: "command-6", transactionId: "transaction-6", mode: "nextReport",
      fromSegment: 5, toSegment: 6, targetSegment: null, revision: 6, eventCount: 4, stopped: true,
      stopReason: "criticalAlert",
      alerts: [
        {
          id: "intel-update", severity: "decisionRequired", category: "intelligence", segment: 6,
          title: "Enemy movement assessed", detail: "Enemy armor reported at 3,3.",
          targetKind: "intelligence", targetId: "contact-1", requiresStop: false
        },
        {
          id: "objective-warning", severity: "critical", category: "objectives", segment: 6,
          title: "Bridgehead compromised", detail: "Bridgehead is now Failed.",
          targetKind: "objective", targetId: "bridge", requiresStop: true
        }
      ]
    },
    {
      id: "advance-5", commandId: "command-5", transactionId: "transaction-5", mode: "segment",
      fromSegment: 4, toSegment: 5, targetSegment: 5, revision: 5, eventCount: 2, stopped: false,
      stopReason: null,
      alerts: [{
        id: "formation-update", severity: "notable", category: "movement", segment: 5,
        title: "Formation regrouped", detail: "The brigade completed its movement.",
        targetKind: "formation", targetId: "formation-1", requiresStop: false
      }]
    }
  ];
  const targetUnknowns = ["Exact reserve strength unknown"];
  const playerAssessment: CampaignSituationFrontAssessment = {
    canLaunch: true,
    pressureLabel: "Choose from 2 opposing targets.",
    targetRequired: true,
    target: {
      targetHexKey: "2,1",
      approachLabel: "Bridge approach",
      missionLabel: "Fortified Assault",
      roleLabel: "Primary crossing",
      contactCount: 1,
      resistanceBand: "Heavy",
      confidenceBand: "Medium",
      explicitUnknowns: targetUnknowns
    },
    targets: []
  };
  const frontLocations = new Map<string, CampaignLocationPresentation>([
    ["2,1", mutableLocation("2,1")],
    ["3,3", mutableLocation("3,3")]
  ]);
  const segmentCalls: number[] = [];
  const stopCalls: string[] = [];
  const locationCalls: string[] = [];
  const displayCalls: string[] = [];
  const before = JSON.stringify({ scenario, presentations, contacts, formations, records, playerAssessment });

  const projected = projectCampaignSituationWorkspace({
    scenario,
    objectives,
    objectivePresentations: presentations,
    contacts,
    formations,
    advanceRecords: records,
    acknowledgedAlertIds: new Set(["objective-warning"]),
    playerOrders: [{
      id: "invalid-draft", status: "draft",
      validation: { valid: false, issues: [{ message: "Draft route is blocked." }] }
    }],
    activeEngagementFrontKeys: new Set(),
    counterattackStatusByFront: new Map([["counter", null]]),
    frontAssessments: new Map([["allied", playerAssessment]]),
    currentSegment: 6,
    phaseKey: "lodgment",
    phaseLabel: "Lodgment",
    campaignScore: { earned: 75, available: 200, percent: 38, projectedGrade: "costlyVictory" },
    campaignOutcome: null,
    intelligenceUnread: 2,
    afterActionUnread: 1,
    formatSegment: (segment) => {
      segmentCalls.push(segment);
      return `Segment ${segment}`;
    },
    formatStopReason: (reason) => {
      stopCalls.push(reason);
      return "Critical alert";
    },
    resolveLocation: (hexKey) => {
      locationCalls.push(hexKey);
      return frontLocations.get(hexKey)!;
    },
    resolveLocationDisplayLabel: (hexKey) => {
      displayCalls.push(hexKey);
      return `Display ${hexKey}`;
    }
  });

  assert.equal(JSON.stringify({ scenario, presentations, contacts, formations, records, playerAssessment }), before);
  assert.deepEqual(segmentCalls, [6, 5, 6, 6, 6, 5, 8, 9, 6]);
  assert.deepEqual(stopCalls, ["criticalAlert", "criticalAlert"]);
  assert.deepEqual(locationCalls, ["2,1", "3,3"]);
  assert.deepEqual(displayCalls, ["2,1"]);
  assert.deepEqual(projected.priorities, [{
    id: "alert:objective-warning",
    severity: "critical",
    label: "Latest command report",
    title: "Bridgehead compromised",
    detail: "Bridgehead is failed. Review the campaign situation before continuing.",
    actionLabel: "Review report",
    targetKind: "objective",
    targetId: "bridge"
  }]);
  assert.deepEqual(projected.timeline.map((entry) => ({
    id: entry.id, title: entry.title, detail: entry.detail, targetKind: entry.targetKind, stopLabel: entry.stopLabel
  })), [
    {
      id: "advance-6", title: "Enemy movement assessed",
      detail: "An intelligence update was reported. Review Intelligence for the current assessment.",
      targetKind: "intelligence", stopLabel: "Critical alert"
    },
    {
      id: "advance-5", title: "Formation regrouped",
      detail: "The brigade completed its movement.", targetKind: "formation", stopLabel: null
    }
  ]);
  assert.deepEqual(projected.fronts.map((front) => ({
    key: front.key,
    hexKeys: front.hexKeys,
    pressureLabel: front.pressureLabel,
    engagementLabel: front.engagementLabel,
    stageLabel: front.stageLabel,
    forcePosture: front.forcePosture,
    objectivePosture: front.objectivePosture,
    lastChange: front.lastChange
  })), [
    {
      key: "allied", hexKeys: ["1,1"], pressureLabel: "Choose from 2 opposing targets.",
      engagementLabel: "Fortified Assault — Display 2,1", stageLabel: undefined,
      forcePosture: "1 friendly formation in sector", objectivePosture: "1 objective in sector",
      lastChange: "Segment 5 · Formation regrouped"
    },
    {
      key: "counter", hexKeys: ["3,3"], pressureLabel: "1 assessed contact · 1 stale or disputed.",
      engagementLabel: undefined, stageLabel: "Enemy counterattack expected in 6 hours · Segment 8.",
      forcePosture: "1 friendly formation in sector", objectivePosture: "1 objective in sector",
      lastChange: "No recent objective or formation change in this sector."
    }
  ]);
  assert.deepEqual(projected.situation.brief, {
    label: "Commander's brief",
    title: "Lodgment",
    detail: "1 active objective · 9 hours to the nearest deadline. The command priority below requires attention.",
    tone: "critical"
  });
  assert.deepEqual(projected.situation.outlook, {
    phaseDescription: "Hold the line.",
    timePressure: "9 hours remain · Segment 9",
    projectedGrade: "Costly victory",
    score: "75 / 200 · 38%",
    objectiveStatus: "1 active · 1 complete · 0 failed",
    lossConditions: ["Failing Bridgehead ends the campaign.", "Losing every Player formation ends the campaign."]
  });
  assert.equal(projected.latestAlerts.length, 2);
  assert.deepEqual(projected.commandAlerts.map((alert) => alert.id), ["objective-warning", "formation-update"]);
  assert.deepEqual(projected.objectiveScore, {
    earned: 75, available: 200, percent: 38, projectedGrade: "Costly victory"
  });
  assert.deepEqual(projected.latestCheckpoint, { timeLabel: "Segment 6", stopLabel: "Critical alert" });
  assert.notEqual(projected.fronts[0].hexKeys, scenario.fronts[0].hexKeys);
  assert.notEqual(projected.fronts[0].location, frontLocations.get("2,1"));
  assert.notEqual(projected.fronts[0].location?.uncertainty, frontLocations.get("2,1")?.uncertainty);
  assert.notEqual(projected.fronts[0].intelligenceUnknowns, targetUnknowns);
  assert.notEqual(projected.latestAlerts[1], records[0].alerts[1]);

  scenario.fronts[0].hexKeys[0] = "mutated-front";
  targetUnknowns[0] = "Mutated unknown";
  (frontLocations.get("2,1") as { primaryLabel: string }).primaryLabel = "Mutated location";
  (frontLocations.get("2,1")!.uncertainty as { label: string }).label = "Mutated uncertainty";
  (records[0].alerts as unknown as Array<{ title: string }>)[1].title = "Mutated alert";
  assert.deepEqual(projected.fronts[0].hexKeys, ["1,1"]);
  assert.deepEqual(projected.fronts[0].intelligenceUnknowns, ["Exact reserve strength unknown"]);
  assert.equal(projected.fronts[0].location?.primaryLabel, "Position 2,1");
  assert.equal(projected.fronts[0].location?.uncertainty?.label, "Last reported position");
  assert.equal(projected.latestAlerts[1].title, "Bridgehead compromised");
  assert.equal(projected.commandAlerts[0].title, "Bridgehead compromised");
});

registerTest("CAMPAIGN_SITUATION_TIMELINE_AND_PRIORITY_SHARE_CANONICAL_SEVERITY_ORDER", () => {
  const scenario = situationScenario();
  scenario.fronts = [];
  const presentations = objectivePresentations();
  const objectives = projectCampaignSituationObjectives({
    scenario,
    presentations,
    formatSegment: (segment) => `Segment ${segment}`,
    resolveLocation: (hexKey) => mutableLocation(hexKey)
  }).objectives;
  const cases: Array<{
    readonly severities: readonly CampaignAdvanceAlertSeverity[];
    readonly expected: CampaignAdvanceAlertSeverity;
  }> = [
    { severities: ["routine", "notable"], expected: "notable" },
    { severities: ["critical", "notable"], expected: "critical" },
    { severities: ["critical", "decisionRequired"], expected: "decisionRequired" },
    { severities: ["decisionRequired", "routine", "critical", "notable"], expected: "decisionRequired" }
  ];

  for (const [caseIndex, severityCase] of cases.entries()) {
    const alerts = severityCase.severities.map((severity, alertIndex) => ({
      id: `severity-${caseIndex}-${alertIndex}`,
      severity,
      category: "objectives" as const,
      segment: 6,
      title: `Alert ${severity}`,
      detail: `${severity} detail`,
      targetKind: "objective" as const,
      targetId: "bridge",
      requiresStop: false
    }));
    const projected = projectCampaignSituationWorkspace({
      scenario,
      objectives,
      objectivePresentations: presentations,
      contacts: [],
      formations: [],
      advanceRecords: [{
        id: `severity-record-${caseIndex}`,
        commandId: `severity-command-${caseIndex}`,
        transactionId: `severity-transaction-${caseIndex}`,
        mode: "segment",
        fromSegment: 5,
        toSegment: 6,
        targetSegment: 6,
        revision: 6,
        eventCount: alerts.length,
        alerts,
        stopped: true,
        stopReason: null
      }],
      acknowledgedAlertIds: new Set(),
      playerOrders: [],
      activeEngagementFrontKeys: new Set(),
      counterattackStatusByFront: new Map(),
      frontAssessments: new Map(),
      currentSegment: 6,
      phaseKey: "lodgment",
      phaseLabel: "Lodgment",
      campaignScore: null,
      campaignOutcome: null,
      intelligenceUnread: 0,
      afterActionUnread: 0,
      formatSegment: (segment) => `Segment ${segment}`,
      formatStopReason: (reason) => reason,
      resolveLocation: (hexKey) => mutableLocation(hexKey),
      resolveLocationDisplayLabel: (hexKey) => hexKey
    });

    assert.equal(projected.timeline[0].title, `Alert ${severityCase.expected}`);
    assert.equal(projected.priorities[0].title, `Alert ${severityCase.expected}`);
  }
});
