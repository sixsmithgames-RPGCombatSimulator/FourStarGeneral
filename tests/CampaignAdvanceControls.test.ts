/**
 * MODULE: CampaignAdvanceControls.test
 * WHAT: Certifies C20-014 targets, report stops, mandatory interruption, deterministic ledgers, pause preference, and persistence.
 * WHY: Automated campaign time is safe only when it stops predictably and explains every committed boundary.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignDecision, CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import {
  advanceCampaignRuntime,
  getCampaignAdvanceTargetSegment
} from "../src/game/campaign/runtime/CampaignAdvanceController";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { CampaignState, type CampaignStatePersistenceRequest } from "../src/state/CampaignState";

function buildAdvanceScenario(): CampaignScenarioData {
  return {
    key: "advance-controls",
    title: "Advance Controls",
    description: "Compact C20-014 fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 1 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      player: { role: "region", factionControl: "Player", supplyValue: 0 },
      neutral: { role: "region", factionControl: "Neutral", supplyValue: 0 },
      bot: { role: "region", factionControl: "Bot", supplyValue: 0 }
    },
    tiles: [
      { tile: "player", hex: { q: 0, r: 0 }, forces: [{ unitType: "Infantry_42", count: 4 }] },
      { tile: "neutral", hex: { q: 1, r: 0 }, forces: [] },
      { tile: "bot", hex: { q: 2, r: 0 }, forces: [] }
    ],
    fronts: [],
    objectives: [],
    economies: [
      { faction: "Player", manpower: 100, supplies: 100, fuel: 100, ammo: 100, airPower: 0, navalPower: 0, intelCoverage: 0 },
      { faction: "Bot", manpower: 100, supplies: 100, fuel: 100, ammo: 100, airPower: 0, navalPower: 0, intelCoverage: 0 }
    ]
  };
}

function movement(id: string, destination: string, etaSegment: number): CampaignDecision {
  return {
    id,
    faction: "Player",
    type: "redeploy",
    payload: {
      originOffsetKey: "0,0",
      destOffsetKey: destination,
      selections: [{ unitType: "Infantry_42", count: 2 }],
      etaSegment,
      returnEtaSegment: etaSegment + 2,
      status: "queued"
    },
    affectedHexKeys: ["0,0", destination]
  };
}

function buildRuntime(decisions: readonly CampaignDecision[] = []) {
  const scenario = buildAdvanceScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign_advance_controls",
    seed: 0x1420,
    currentSegment: 0,
    turnState: null,
    queuedDecisions: structuredClone([...decisions]),
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 0),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 0)
    }
  });
  return { scenario, definition, runtime };
}

function persistenceRequest(timestamp: string): CampaignStatePersistenceRequest {
  return {
    timestamp,
    label: "Advance control certification",
    playTimeSeconds: 300,
    difficulty: "standard",
    commanderRosterLink: null,
    uiResumeContext: { workspace: "theater", selectedEntityId: null, mapCenter: null, mapZoom: null }
  };
}

registerTest("CAMPAIGN_ADVANCE_TARGETS_NAMED_BOUNDARIES", async ({ Given, When, Then }) => {
  await Given("the three-hour campaign clock at ordinary and exact named boundaries", async () => {});
  await When("finite advance targets are calculated", async () => {});
  await Then("segment, day, dawn, and dusk always point at a future exact boundary", async () => {
    const actual = [
      getCampaignAdvanceTargetSegment(0, "segment"),
      getCampaignAdvanceTargetSegment(0, "day"),
      getCampaignAdvanceTargetSegment(0, "dawn"),
      getCampaignAdvanceTargetSegment(2, "dawn"),
      getCampaignAdvanceTargetSegment(3, "dusk"),
      getCampaignAdvanceTargetSegment(6, "dusk"),
      getCampaignAdvanceTargetSegment(0, "nextReport")
    ];
    const expected = [1, 8, 2, 10, 6, 14, null];
    if (actual.some((value, index) => value !== expected[index])) {
      throw new Error(`Named advance targets diverged: ${JSON.stringify(actual)}.`);
    }
  });
});

registerTest("CAMPAIGN_ADVANCE_NEXT_REPORT_IGNORES_ROUTINE_AND_STOPS_ON_ARRIVAL", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildRuntime([movement("arrival", "1,0", 2)]);
  const result = advanceCampaignRuntime(runtime, definition, { mode: "nextReport" });

  await Given("a Player redeployment due after one quiet three-hour segment", async () => {});
  await When("command advances until the next report", async () => {});
  await Then("routine cycles do not stop time but the arrival does and both transactions remain auditable", async () => {
    if (!result.ok) throw new Error(result.error.message);
    if (result.state.currentSegment !== 2 || result.state.revision !== runtime.revision + 2
      || result.report.stopReason !== "nextReport" || result.report.stepRecordIds.length !== 2) {
      throw new Error(`Next-report advance stopped at the wrong boundary: ${JSON.stringify(result.report)}.`);
    }
    const records = result.report.stepRecordIds.map((id) => result.state.advanceRecords[id]);
    if (records[0]?.stopped || !records[1]?.stopped
      || !records[1].alerts.some((alert) => alert.title === "Redeployment arrived" && alert.severity === "notable")) {
      throw new Error("Persisted step records did not distinguish routine resolution from the arrival report.");
    }
    const duplicate = advanceCampaignRuntime(runtime, definition, { mode: "nextReport" });
    if (!duplicate.ok || computeCampaignContentHash(duplicate.state) !== computeCampaignContentHash(result.state)) {
      throw new Error("Identical advance input did not produce identical command, event, and ledger identity.");
    }
  });
});

registerTest("CAMPAIGN_ADVANCE_MANDATORY_AND_ACCESSIBILITY_STOPS", async ({ Given, When, Then }) => {
  const blockedFixture = buildRuntime([movement("blocked", "9,9", 1)]);
  const quietFixture = buildRuntime();

  await Given("a day command with an impossible order and a separate high-control pause preference", async () => {});
  const blocked = advanceCampaignRuntime(blockedFixture.runtime, blockedFixture.definition, { mode: "day" });
  const blockedAtDawn = advanceCampaignRuntime(blockedFixture.runtime, blockedFixture.definition, { mode: "dawn" });
  const paused = advanceCampaignRuntime(quietFixture.runtime, quietFixture.definition, {
    mode: "day",
    pauseAfterEveryResolution: true
  });
  await When("both bounded commands resolve", async () => {});
  await Then("the decision-required order and pause preference each stop after exactly one safe revision", async () => {
    if (!blocked.ok || blocked.report.stopReason !== "blockedOrder" || blocked.report.elapsedSegments !== 1
      || !blocked.report.alerts.some((alert) => alert.requiresStop)) {
      throw new Error(blocked.ok ? "Blocked order did not force a decision stop." : blocked.error.message);
    }
    if (!blockedAtDawn.ok || blockedAtDawn.report.stopReason !== "blockedOrder" || blockedAtDawn.report.elapsedSegments !== 1) {
      throw new Error(blockedAtDawn.ok ? "Named-boundary automation ignored a mandatory stop." : blockedAtDawn.error.message);
    }
    if (!paused.ok || paused.report.stopReason !== "pauseAfterResolution" || paused.report.elapsedSegments !== 1) {
      throw new Error(paused.ok ? "Pause-after-resolution did not stop after one transaction." : paused.error.message);
    }
  });
});

registerTest("CAMPAIGN_ADVANCE_LATER_FAILURE_RETAINS_EARLIER_COMMITS", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildRuntime();
  await Given("a multi-segment command whose second resolution rejects before commit", async () => {});
  const result = advanceCampaignRuntime(runtime, definition, { mode: "day" }, {
    afterPhase: (segmentIndex, phase) => {
      if (segmentIndex === 1 && phase === "environment") throw new Error("injected second-segment fault");
    }
  });
  await When("the first segment commits and the second rolls back", async () => {});
  await Then("the aggregate failure reports partial progress at the exact last safe boundary", async () => {
    if (result.ok || result.report.stopReason !== "resolutionFailed" || result.report.elapsedSegments !== 1
      || result.state.currentSegment !== 1 || result.state.revision !== runtime.revision + 1
      || result.state.advanceRecordOrder.length !== 1 || result.segmentResults.length !== 1) {
      throw new Error(result.ok ? "Injected second-segment failure unexpectedly committed." : result.error.message);
    }
    if (validateCampaignRuntimeState(result.state).length > 0) {
      throw new Error("Partial advance failure did not retain a valid first-segment boundary.");
    }
  });
});

registerTest("CAMPAIGN_ADVANCE_LEDGER_SURVIVES_SAVE_LOAD_AND_VALIDATION", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const source = new CampaignState({ saveBackend: backend, legacyStorage: null });
  const restored = new CampaignState({ saveBackend: backend, legacyStorage: null });
  const scenario = buildAdvanceScenario();
  let acknowledgedAlertId = "";
  source.setScenario(structuredClone(scenario));
  restored.setScenario(structuredClone(scenario));

  await Given("a committed pause-after-resolution checkpoint", async () => {
    const advanced = source.advanceCampaign({ mode: "day", pauseAfterEveryResolution: true });
    if (!advanced.ok || advanced.report.stopReason !== "pauseAfterResolution") {
      throw new Error(advanced.ok ? "Unexpected stop reason." : advanced.error.message);
    }
    acknowledgedAlertId = source.getCampaignAdvanceTimeline()[0]?.alerts[0]?.id ?? "";
    const before = source.getRuntimeSnapshot();
    if (!acknowledgedAlertId || !before || !source.acknowledgeCampaignAlert(acknowledgedAlertId)) {
      throw new Error("A retained campaign alert could not be acknowledged.");
    }
    const after = source.getRuntimeSnapshot();
    if (!after || after.currentSegment !== before.currentSegment || after.revision !== before.revision || after.status !== before.status) {
      throw new Error("Acknowledging an alert incorrectly resolved or revised campaign simulation truth.");
    }
  });
  await When("the runtime is checksummed, stored, and hydrated", async () => {
    await source.savePrimaryCampaign(persistenceRequest("2026-08-04T12:00:00.000Z"));
    const loaded = await restored.loadPrimaryCampaign(persistenceRequest("2026-08-04T12:01:00.000Z"));
    if (!loaded.ok) throw new Error(loaded.error.message);
  });
  await Then("timeline identity is exact and malformed ledger ordering is rejected", async () => {
    const sourceTimeline = source.getCampaignAdvanceTimeline();
    const restoredTimeline = restored.getCampaignAdvanceTimeline();
    if (sourceTimeline.length !== 1
      || computeCampaignContentHash(sourceTimeline) !== computeCampaignContentHash(restoredTimeline)) {
      throw new Error("Advance timeline did not survive the save/load boundary exactly.");
    }
    if (!restored.isCampaignAlertAcknowledged(acknowledgedAlertId)) {
      throw new Error("Campaign alert acknowledgement did not survive save/load.");
    }
    const malformed = restored.getRuntimeSnapshot();
    if (!malformed) throw new Error("Restored runtime disappeared.");
    malformed.advanceRecordOrder.push(malformed.advanceRecordOrder[0]);
    if (!validateCampaignRuntimeState(malformed).some((issue) => issue.code === "ADVANCE_LOG_INVALID")) {
      throw new Error("Malformed advance ledger ordering passed runtime validation.");
    }
  });
});
