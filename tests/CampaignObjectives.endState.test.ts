/** Certifies C20-026 objective progress, phases, idempotent rewards, score, terminal stops, and persistence. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { resolveCampaignSegment } from "../src/game/campaign/runtime/CampaignSegmentResolver";
import { advanceCampaignRuntime } from "../src/game/campaign/runtime/CampaignAdvanceController";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { projectCampaignObjectives } from "../src/game/campaign/objectives/CampaignObjectiveEvaluator";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";

function objectiveScenario(): CampaignScenarioData {
  return {
    key: "objective-end-state",
    title: "Objective End State",
    description: "Compact phase, score, victory, and defeat fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 1 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      beach: { role: "navalBase", factionControl: "Player", supplyValue: 0 },
      port: { role: "navalBase", factionControl: "Bot", supplyValue: 0 },
      airfield: { role: "airbase", factionControl: "Bot", supplyValue: 0 }
    },
    tiles: [
      { tile: "beach", hex: { q: 0, r: 0 }, forces: [{ unitType: "Infantry_42", count: 2, label: "Beach Group" }] },
      { tile: "port", hex: { q: 1, r: 0 }, forces: [{ unitType: "Infantry_42", count: 1, label: "Port Guard" }] },
      { tile: "airfield", hex: { q: 2, r: 0 }, forces: [] }
    ],
    fronts: [],
    objectives: [
      {
        key: "hold-beach",
        label: "Hold the beach",
        description: "Keep the reinforcement route operational.",
        hex: { q: 0, r: 0 },
        owner: "Player",
        rewards: ["reinforcements:available"],
        category: "primary",
        phaseKey: "landing",
        deadlineSegment: 3,
        score: 100,
        conditions: [{ kind: "controlHex", faction: "Player", holdSegments: 2, minimumInfrastructureEffectiveness: 0.5 }],
        rewardEffects: [
          { kind: "resource", resource: "supplies", amount: 10, label: "Landing stores released." },
          { kind: "unlock", key: "landing-reserve", label: "Landing reserve" }
        ]
      },
      {
        key: "take-port",
        label: "Take the port",
        description: "Open the heavy supply route.",
        hex: { q: 1, r: 0 },
        owner: "Bot",
        rewards: [],
        category: "primary",
        phaseKey: "expansion",
        requiresObjectives: ["hold-beach"],
        deadlineSegment: 6,
        score: 150,
        conditions: [{ kind: "controlHex", faction: "Player", holdSegments: 1, minimumInfrastructureEffectiveness: 0.5 }]
      },
      {
        key: "take-airfield",
        label: "Take the airfield",
        description: "Optional operational reach.",
        hex: { q: 2, r: 0 },
        owner: "Bot",
        rewards: [],
        category: "secondary",
        phaseKey: "expansion",
        requiresObjectives: ["hold-beach"],
        deadlineSegment: 5,
        score: 75,
        conditions: [{ kind: "controlHex", faction: "Player" }]
      }
    ],
    campaignArc: {
      phases: [
        { key: "landing", label: "Landing phase", description: "Secure the coast.", objectiveKeys: ["hold-beach"] },
        { key: "expansion", label: "Expansion phase", description: "Open the port.", objectiveKeys: ["take-port", "take-airfield"] }
      ],
      victoryObjectiveKeys: ["hold-beach", "take-port"],
      defeatObjectiveKeys: ["hold-beach", "take-port"],
      decisiveVictoryThreshold: 90,
      standardVictoryThreshold: 60
    },
    economies: [
      { faction: "Player", manpower: 100, supplies: 20, fuel: 20, ammo: 20, airPower: 0, navalPower: 0, intelCoverage: 0 },
      { faction: "Bot", manpower: 100, supplies: 20, fuel: 20, ammo: 20, airPower: 0, navalPower: 0, intelCoverage: 0 }
    ]
  };
}

function objectiveFixture() {
  const scenario = objectiveScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign_objective_end_state",
    seed: 0xc20026,
    currentSegment: 0,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 0),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 0)
    }
  });
  return { scenario, definition, runtime };
}

registerTest("CAMPAIGN_OBJECTIVES_PROJECT_TRUTHFUL_INITIAL_PROGRESS", async ({ Given, When, Then }) => {
  const { definition, runtime } = objectiveFixture();
  let projected: ReturnType<typeof projectCampaignObjectives>;

  await Given("a fresh campaign whose opening hold objective is already on controlled operational ground", () => {});
  await When("the command UI projects the objective before the first segment resolves", () => {
    projected = projectCampaignObjectives(runtime, definition);
  });
  await Then("the presentation reports the live hold and infrastructure requirement without resolving campaign truth", () => {
    const hold = projected.find((objective) => objective.key === "hold-beach");
    if (!hold
      || hold.progressLabel !== "Hold for 2 more segments · installation 100% / 50% required"
      || hold.progressCurrent !== 0
      || hold.progressTarget !== 2
      || hold.conditionLabels.join("|") !== hold.progressLabel
      || /awaiting evaluation/i.test(hold.progressLabel)
      || runtime.objectives["hold-beach"].status !== "active"
      || runtime.objectives["hold-beach"].rewardApplied
      || runtime.revision !== 0) {
      throw new Error(`Fresh objective projection was incomplete or mutated truth: ${JSON.stringify(hold)}`);
    }
  });
});

registerTest("CAMPAIGN_OBJECTIVES_PHASE_REWARD_SCORE_AND_VICTORY", async ({ Given, When, Then }) => {
  const { definition, runtime } = objectiveFixture();
  const first = resolveCampaignSegment(runtime, definition);
  let second = first.ok ? resolveCampaignSegment(first.state, definition) : first;

  await Given("a briefed primary hold objective followed by dependent primary and secondary expansion objectives", () => {});
  await When("the beach is held for two complete segments and the port is then captured and held", () => {
    if (!first.ok) throw new Error(first.error.message);
    if (!second.ok) throw new Error(second.error.message);
    if (first.state.objectives["hold-beach"].progress !== 0.5 || first.state.objectives["hold-beach"].status !== "active") {
      throw new Error("Hold progress did not count uninterrupted completed campaign segments.");
    }
    if (second.state.objectives["hold-beach"].status !== "completed"
      || second.state.objectives["take-port"].status !== "active"
      || second.state.objectives["take-airfield"].status !== "active"
      || second.state.campaignPhaseKey !== "expansion") {
      throw new Error("Objective completion did not activate dependencies and advance the authored phase atomically.");
    }
    const projected = projectCampaignObjectives(structuredClone(second.state), definition);
    if (projected.find((objective) => objective.key === "take-port")?.status !== "active"
      || projected.find((objective) => objective.key === "take-airfield")?.status !== "active") {
      throw new Error("Player objective projection relocked objectives whose phase and dependencies were already satisfied.");
    }
    if (second.state.factions.Player.economy.supplies !== 30
      || second.state.awardedRewardKeys?.length !== 2
      || !second.state.objectives["hold-beach"].rewardApplied) {
      throw new Error("Typed objective rewards were not applied exactly once.");
    }
    second.state.tiles["1,0"].controller = "Player";
    second.state.tiles["1,0"].controlSinceSegment = 2;
    const terminal = resolveCampaignSegment(second.state, definition);
    if (!terminal.ok) throw new Error(`${terminal.error.message} ${JSON.stringify(terminal.issues)}`);
    second = terminal;
  });
  await Then("the campaign records a standard victory, transparent score, immutable reward keys, and terminal invariants", () => {
    if (!second.ok) throw new Error(second.error.message);
    const state = second.state;
    if (state.status !== "victory"
      || state.objectives["take-port"].status !== "completed"
      || state.objectives["take-airfield"].status !== "active"
      || state.campaignScore?.earned !== 250
      || state.campaignScore.available !== 325
      || state.campaignScore.percent !== 77
      || state.campaignOutcome?.grade !== "victory"
      || state.campaignOutcome.completedObjectiveKeys.join("|") !== "hold-beach|take-port"
      || state.awardedRewardKeys?.length !== 2
      || validateCampaignRuntimeState(state).length > 0) {
      throw new Error("Victory grade, score, objective record, or terminal runtime is incorrect.");
    }
    const blocked = resolveCampaignSegment(state, definition);
    if (blocked.ok || blocked.state.currentSegment !== 3) throw new Error("Terminal campaign state advanced after the recorded outcome.");

    const timestamp = "2026-08-05T12:00:00.000Z";
    const envelope = createCampaignSaveEnvelope({
      saveId: "save_objective_victory",
      slotType: "checkpoint",
      gameMode: "campaign",
      createdAt: timestamp,
      updatedAt: timestamp,
      buildVersion: "test",
      contentVersion: "test",
      scenarioKey: definition.key,
      campaignId: state.campaignId,
      engagementId: null,
      display: {
        campaignTitle: definition.title,
        segment: state.currentSegment,
        phaseLabel: "Expansion phase",
        lastEventSummary: state.campaignOutcome.summary,
        playTimeSeconds: 120,
        difficulty: "standard",
        result: "victory",
        thumbnailKey: null
      },
      payload: {
        runtime: state,
        activeBattle: null,
        commanderRosterLink: null,
        uiResumeContext: { workspace: "objectives", selectedEntityId: "take-port", mapCenter: null, mapZoom: null }
      }
    });
    const loaded = validateCampaignSaveEnvelope(envelope, { scenarioKey: definition.key, scenarioContentHash: state.scenarioContentHash });
    if (!loaded.ok || loaded.envelope.payload.runtime.campaignOutcome?.grade !== "victory") {
      throw new Error("Checksummed persistence did not retain the complete campaign outcome and score.");
    }
  });
});

registerTest("CAMPAIGN_OBJECTIVE_DEADLINE_CAUSES_DEFEAT_AND_AUTOMATION_STOP", async ({ Given, When, Then }) => {
  const { definition, runtime } = objectiveFixture();
  runtime.tiles["0,0"].controller = "Bot";
  runtime.tiles["0,0"].controlSinceSegment = 0;

  await Given("a visible required objective whose inclusive deadline is segment three", () => {});
  const advanced = advanceCampaignRuntime(runtime, definition, { mode: "day", stopOnCriticalAlerts: true });
  await When("automation reaches the unresolved objective deadline", () => {});
  await Then("defeat overrides further advance and the persisted command record explains the terminal stop", () => {
    if (!advanced.ok) throw new Error(advanced.error.message);
    const state = advanced.state;
    if (state.currentSegment !== 3
      || state.status !== "defeat"
      || state.objectives["hold-beach"].status !== "failed"
      || state.campaignOutcome?.grade !== "defeat"
      || advanced.report.stopReason !== "campaignEnded"
      || !advanced.report.alerts.some((alert) => alert.title === "Campaign defeat" && alert.requiresStop)
      || state.factions.Player.economy.supplies !== 20
      || state.awardedRewardKeys?.length !== 0) {
      throw new Error("Deadline defeat, automation stop, or unapplied reward state is incorrect.");
    }
  });
});

registerTest("CAMPAIGN_OBJECTIVE_AUTHORING_REJECTS_CYCLES_AND_SECRET_FAILURES", async ({ Given, When, Then }) => {
  const cyclic = objectiveScenario();
  cyclic.objectives[0].requiresObjectives = ["take-port"];
  cyclic.objectives[1].requiresObjectives = ["hold-beach"];
  const secret = objectiveScenario();
  secret.objectives.push({
    key: "secret-collapse",
    label: "Secret collapse",
    description: "Invalid surprise defeat.",
    hex: { q: 0, r: 0 },
    owner: "Player",
    rewards: [],
    category: "failure",
    visibility: "secretUntilResolved",
    conditions: [{ kind: "resourceThreshold", resource: "supplies", comparison: "atMost", amount: 0 }]
  });
  let cycleRejected = false;
  let secretRejected = false;

  await Given("malformed authored objective graphs that can never resolve or can surprise-end the campaign", () => {});
  await When("the immutable scenario adapter validates both definitions", () => {
    try { splitLegacyCampaignScenario(cyclic); } catch { cycleRejected = true; }
    try { splitLegacyCampaignScenario(secret); } catch { secretRejected = true; }
  });
  await Then("both definitions fail before runtime or save identity is created", () => {
    if (!cycleRejected || !secretRejected) throw new Error("Objective authoring validation accepted a dependency cycle or secret failure condition.");
  });
});
