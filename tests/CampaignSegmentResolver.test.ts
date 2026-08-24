/**
 * MODULE: CampaignSegmentResolver.test
 * WHAT: Certifies C20-013 frozen faction views, simultaneous movement, phase reports, rollback, and save/load continuity.
 * WHY: A campaign clock boundary is authoritative only when every subsystem commits once from the same information boundary.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignDecision, CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import {
  CAMPAIGN_SEGMENT_PHASE_ORDER,
  resolveCampaignSegment
} from "../src/game/campaign/runtime/CampaignSegmentResolver";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import {
  CampaignState,
  type CampaignStatePersistenceRequest
} from "../src/state/CampaignState";

function buildSegmentScenario(): CampaignScenarioData {
  return {
    key: "segment-transaction",
    title: "Segment Transaction",
    description: "Compact deterministic segment fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 4, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      playerHub: { role: "logisticsHub", factionControl: "Player", supplyValue: 1, productionCapacity: 1 },
      neutralFactory: { role: "logisticsHub", factionControl: "Neutral", supplyValue: 10, productionCapacity: 10 },
      neutralRoad: { role: "region", factionControl: "Neutral", supplyValue: 0 },
      botPost: { role: "logisticsHub", factionControl: "Bot", supplyValue: 2, productionCapacity: 2 }
    },
    tiles: [
      { tile: "playerHub", hex: { q: 0, r: 0 }, forces: [{ unitType: "Infantry_42", count: 10 }] },
      { tile: "neutralFactory", hex: { q: 1, r: 0 }, forces: [] },
      { tile: "neutralRoad", hex: { q: 2, r: 0 }, forces: [] },
      { tile: "botPost", hex: { q: 3, r: 0 }, forces: [{ unitType: "Panzer_IV", count: 4 }] }
    ],
    fronts: [{ key: "test-front", label: "Test Front", hexKeys: ["2,1", "3,1"], initiative: "Player" }],
    objectives: [],
    economies: [
      {
        faction: "Player",
        manpower: 100,
        supplies: 100,
        fuel: 100,
        ammo: 100,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0,
        productionAllocation: { supplies: 40, fuel: 30, ammo: 10, manpower: 20 }
      },
      {
        faction: "Bot",
        manpower: 100,
        supplies: 100,
        fuel: 100,
        ammo: 100,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0
      }
    ]
  };
}

function dueMove(id: string, originOffsetKey: string, destinationOffsetKey: string): CampaignDecision {
  return {
    id,
    faction: "Player",
    type: "redeploy",
    payload: {
      originOffsetKey,
      destOffsetKey: destinationOffsetKey,
      selections: [{ unitType: "Infantry_42", count: 10 }],
      etaSegment: 8,
      returnEtaSegment: 8,
      status: "queued"
    },
    affectedHexKeys: [originOffsetKey, destinationOffsetKey]
  };
}

function buildSegmentRuntime() {
  const scenario = buildSegmentScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign_segment_transaction",
    seed: 0x5e6d3a21,
    currentSegment: 7,
    turnState: null,
    queuedDecisions: [dueMove("move-a-b", "0,0", "1,0"), dueMove("move-b-c", "1,0", "2,1")],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 7),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 7)
    }
  });
  return { scenario, definition, runtime };
}

function persistenceRequest(timestamp: string): CampaignStatePersistenceRequest {
  return {
    timestamp,
    label: "Segment transaction certification",
    playTimeSeconds: 900,
    difficulty: "standard",
    commanderRosterLink: null,
    uiResumeContext: { workspace: "theater", selectedEntityId: null, mapCenter: null, mapZoom: null }
  };
}

registerTest("CAMPAIGN_SEGMENT_FREEZES_AND_RESOLVES_SIMULTANEOUSLY", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildSegmentRuntime();
  const sourceHash = computeCampaignContentHash(runtime);
  const result = resolveCampaignSegment(runtime, definition);

  await Given("two due redeployments where the second depends on the first arriving, at a daily production boundary", async () => {});
  await When("one deterministic segment transaction resolves every ordered phase", async () => {});

  await Then("legal views are frozen, movement cannot chain, and logistics uses frozen control", async () => {
    if (!result.ok) throw new Error(result.error.message);
    if (result.state.currentSegment !== 8 || result.state.revision !== runtime.revision + 1) {
      throw new Error("Segment transaction did not advance exactly one segment and revision.");
    }
    if (computeCampaignContentHash(runtime) !== sourceHash) throw new Error("Segment resolution mutated its authoritative source.");
    if (result.report.resolutionKind !== "segment"
      || result.report.fromSegment !== 7
      || result.report.toSegment !== 8
      || result.report.phaseReports.map((phase) => phase.phase).join("|") !== CAMPAIGN_SEGMENT_PHASE_ORDER.join("|")) {
      throw new Error("Persisted segment report is missing stable boundary or phase identity.");
    }
    const reportedEvents = result.report.phaseReports.reduce((sum, phase) => sum + phase.eventCount, 0);
    if (reportedEvents !== result.report.eventIds.length - 1) throw new Error("Phase event accounting does not match the transaction report.");

    const playerView = result.frozenViews.find((view) => view.faction === "Player");
    const hiddenBotTile = playerView?.map.scenario.tiles.find((tile) => tile.hex.q === 3 && tile.hex.r === 0);
    if (!playerView || !Object.isFrozen(playerView) || !Object.isFrozen(playerView.map) || !Object.isFrozen(playerView.orders)) {
      throw new Error("Legal faction projection was not deeply frozen.");
    }
    if (playerView.map.scenario.economies.some((economy) => economy.faction === "Bot") || (hiddenBotTile?.forces?.length ?? 0) > 0) {
      throw new Error("Frozen Player view leaked opposing exact economy or force truth.");
    }

    const firstDestination = result.state.tiles["1,0"].forces.find((force) => force.unitType === "Infantry_42")?.count ?? 0;
    const chainedDestination = result.state.tiles["2,0"].forces.find((force) => force.unitType === "Infantry_42")?.count ?? 0;
    const chainedDecision = result.state.compatibility.queuedDecisions.find((decision) => decision.id === "move-b-c");
    if (firstDestination !== 10 || chainedDestination !== 0 || chainedDecision?.payload.status !== "blocked") {
      throw new Error("Due movement observed a same-segment arrival instead of frozen start forces.");
    }
    if (result.state.tiles["1,0"].controller !== "Player" || result.state.factions.Player.economy.supplies !== 101) {
      throw new Error("Daily logistics used post-movement factory control instead of the frozen start boundary.");
    }
    if (result.state.knowledgeByFaction.Player.lastResolvedSegment !== 8
      || result.state.knowledgeByFaction.Bot.lastResolvedSegment !== 8) {
      throw new Error("Both faction intelligence pictures were not resolved exactly at the committed boundary.");
    }

    const duplicate = resolveCampaignSegment(runtime, definition);
    if (!duplicate.ok || computeCampaignContentHash(duplicate.state) !== computeCampaignContentHash(result.state)) {
      throw new Error("Identical source state did not produce an identical deterministic segment result.");
    }
  });
});

registerTest("CAMPAIGN_SEGMENT_ROLLS_BACK_THROW_AND_INVARIANT_FAILURE", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildSegmentRuntime();
  const sourceHash = computeCampaignContentHash(runtime);

  await Given("a valid pre-segment runtime with a serialized random checkpoint", async () => {});
  await When("a phase throws and a separate candidate violates an economy invariant", async () => {});
  await Then("both resolutions retain the exact source segment, history, resources, and RNG", async () => {
    const thrown = resolveCampaignSegment(runtime, definition, {
      afterPhase: (phase) => {
        if (phase === "movement") throw new Error("injected movement fault");
      }
    });
    if (thrown.ok || thrown.error.code !== "TRANSACTION_FAILED" || computeCampaignContentHash(thrown.state) !== sourceHash) {
      throw new Error("Thrown phase did not roll back to the exact safe runtime.");
    }

    const invalid = resolveCampaignSegment(runtime, definition, {
      afterPhase: (phase, candidate) => {
        if (phase === "intelligence") candidate.factions.Player.economy.supplies = -1;
      }
    });
    if (invalid.ok
      || !invalid.issues.some((issue) => issue.code === "ECONOMY_INVALID")
      || computeCampaignContentHash(invalid.state) !== sourceHash
      || computeCampaignContentHash(runtime) !== sourceHash) {
      throw new Error("Invariant-invalid phase did not return structured rollback diagnostics and exact safe truth.");
    }
  });
});

registerTest("CAMPAIGN_CAPTURED_SUPPORT_HUB_DENIES_BUT_DOES_NOT_TRANSFER_EXTERNAL_OUTPUT", async ({ Given, When, Then }) => {
  const scenario = buildSegmentScenario();
  scenario.tiles[3] = { ...scenario.tiles[3], factionControl: "Player" };
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign_captured_support_hub",
    seed: 0x5e6d3a22,
    currentSegment: 7,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 7),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 7)
    }
  });

  await Given("a Player-controlled Bot support hub immediately before the daily delivery", async () => {});
  const result = resolveCampaignSegment(runtime, definition);
  await When("the external support networks resolve from authored ownership and current control", async () => {});
  await Then("the captured hub denies Bot output without becoming an Allied factory or recruiting center", async () => {
    if (!result.ok) throw new Error(result.error.message);
    const playerDelivery = result.state.eventLog.find((event) => event.category === "logistics"
      && event.details.faction === "Player" && event.details.capacity === 1);
    const botDelivery = result.state.eventLog.find((event) => event.category === "logistics"
      && event.details.faction === "Bot" && event.details.capacity === 0);
    if (!playerDelivery || !botDelivery || result.state.factions.Player.economy.supplies !== 101) {
      throw new Error("Captured enemy support infrastructure incorrectly transferred its external production pipeline to the Player.");
    }
  });
});

registerTest("CAMPAIGN_STATE_SEGMENT_REPORT_SURVIVES_SAVE_LOAD", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const source = new CampaignState({ saveBackend: backend, legacyStorage: null });
  const restored = new CampaignState({ saveBackend: backend, legacyStorage: null });
  const scenario = buildSegmentScenario();
  source.setScenario(structuredClone(scenario));
  restored.setScenario(structuredClone(scenario));

  await Given("a live CampaignState with a committed typed production order at a stable planning boundary", async () => {
    const draft = source.createProductionDraft({ supplies: 25, fuel: 25, ammo: 25, manpower: 25 });
    if (!draft.ok) throw new Error(draft.reason);
    const commit = source.commitCampaignOrders();
    if (!commit.ok) throw new Error(commit.reason);
  });
  const before = source.getRuntimeSnapshot();
  const advanced = source.advanceCampaign({ mode: "day" });
  await When("the UI-facing action resolves through the next daily delivery and the result is checksummed into the primary save", async () => {
    if (!advanced.ok || !before || advanced.state.revision !== before.revision + 8 || advanced.state.currentSegment !== 8) {
      throw new Error(advanced.ok
        ? `CampaignState stopped at segment ${advanced.state.currentSegment} / revision ${advanced.state.revision} (${advanced.report.stopReason}) instead of the eight-segment daily boundary.`
        : advanced.error.message);
    }
    const production = advanced.state.orderOrder.map((id) => advanced.state.orders[id]).find((order) => order?.kind === "production");
    if (!production || production.status !== "completed"
      || production.reservationIds.some((id) => advanced.state.reservations[id]?.status !== "released")) {
      throw new Error("Finalization did not synchronize typed production and reusable reservation lifecycle.");
    }
    await source.savePrimaryCampaign(persistenceRequest("2026-08-03T16:00:00.000Z"));
  });

  await Then("load restores the complete last segment report and deterministic continuation", async () => {
    const load = await restored.loadPrimaryCampaign(persistenceRequest("2026-08-03T16:01:00.000Z"));
    if (!load.ok) throw new Error(load.error.message);
    const sourceReport = source.getLastCampaignResolutionReport();
    const restoredReport = restored.getLastCampaignResolutionReport();
    if (!sourceReport || sourceReport.resolutionKind !== "segment"
      || computeCampaignContentHash(sourceReport) !== computeCampaignContentHash(restoredReport)) {
      throw new Error("Checksummed save/load did not preserve complete segment resolution metadata.");
    }
    const sourceNext = source.advanceSegment();
    const restoredNext = restored.advanceSegment();
    if (!sourceNext.ok || !restoredNext.ok
      || computeCampaignContentHash(sourceNext.state) !== computeCampaignContentHash(restoredNext.state)) {
      throw new Error("Loaded campaign did not continue from the same deterministic segment boundary.");
    }
  });
});
