/**
 * MODULE: CampaignRuntime.foundation.test
 * WHAT: Certifies Campaign 2.0 definition/runtime separation, deterministic identity/randomness, invariant validation, and transaction rollback.
 * WHY: The new runtime cannot replace shipped campaign state until its foundational ownership and determinism contracts are regression-protected.
 *
 * DEPENDENCIES: Custom test harness, shipped campaign intelligence seeding, and Campaign 2.0 runtime modules.
 * EXPORTS: Registered deterministic test cases.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import {
  canonicalCampaignStringify,
  computeCampaignContentHash,
  createStableCampaignRecordId
} from "../src/game/campaign/runtime/CampaignCanonical";
import { CampaignRandom } from "../src/game/campaign/runtime/CampaignRandom";
import {
  createCampaignRuntime,
  projectLegacyCampaignState,
  splitLegacyCampaignScenario,
  type CreateCampaignRuntimeOptions
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { runCampaignRuntimeTransaction } from "../src/game/campaign/runtime/CampaignRuntimeTransaction";
import { CampaignRuntimeError } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import { reconcileCampaignFormationForceCounts } from "../src/game/campaign/formations/FormationLifecycleService";

/**
 * WHAT: Builds a compact legacy campaign with inheritance, mutable state, engagement, objective, and both faction economies.
 * WHY: One representative fixture exercises every field the behavior-preserving adapter must retain.
 *
 * @returns Legacy campaign scenario fixture.
 */
function buildLegacyScenario(): CampaignScenarioData {
  return {
    key: "runtime-foundation",
    title: "Runtime Foundation",
    description: "Campaign 2.0 adapter fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 2 },
    mapExtents: {
      description: "Small test theater.",
      corners: {
        nw: { q: 0, r: 0, label: "NW" },
        ne: { q: 2, r: 0, label: "NE" },
        sw: { q: 0, r: 1, label: "SW" },
        se: { q: 2, r: 1, label: "SE" }
      },
      zones: [{ rMin: 0, rMax: 1, terrain: "land", label: "Test land" }]
    },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      playerHub: {
        role: "logisticsHub",
        factionControl: "Player",
        supplyValue: 4,
        forces: [{ unitType: "Infantry_42", count: 2, label: "Inherited infantry" }]
      },
      botFort: {
        role: "fortificationLight",
        factionControl: "Bot",
        supplyValue: 2
      }
    },
    tiles: [
      { tile: "playerHub", hex: { q: 0, r: 0 }, controlSinceDay: 2 },
      {
        tile: "botFort",
        factionControl: "Bot",
        hex: { q: 1, r: 0 },
        forces: [{ unitType: "Panzer_IV", count: 1, label: "Explicit armor" }]
      }
    ],
    fronts: [{ key: "front-a", label: "Test Front", hexKeys: ["0,0", "1,0"], initiative: "Player" }],
    objectives: [{
      key: "hold-hub",
      label: "Hold the hub",
      description: "Preserve the logistics hub.",
      hex: { q: 0, r: 0 },
      owner: "Player",
      rewards: ["Supply continuity"]
    }],
    economies: [
      {
        faction: "Player",
        manpower: 1000,
        supplies: 500,
        fuel: 300,
        ammo: 200,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0,
        productionAllocation: { supplies: 40, fuel: 30, ammo: 10, manpower: 20 }
      },
      {
        faction: "Bot",
        manpower: 900,
        supplies: 450,
        fuel: 280,
        ammo: 180,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0
      }
    ]
  };
}

/**
 * WHAT: Builds explicit runtime creation options from the shared legacy fixture.
 * WHY: Runtime creation deliberately has no hidden identity, time, seed, or auxiliary-state defaults.
 *
 * @param scenario - Legacy scenario used to seed faction knowledge.
 * @returns Complete deterministic creation options.
 */
function buildRuntimeOptions(scenario: CampaignScenarioData): CreateCampaignRuntimeOptions {
  const engagement = {
    id: "eng-foundation",
    frontKey: "front-a",
    objectiveKey: "hold-hub",
    attacker: "Player",
    defender: "Bot",
    hexKeys: ["1,0"],
    tags: ["front"]
  };
  return {
    campaignId: "campaign_foundation_test",
    seed: 0x1234abcd,
    currentSegment: 16,
    turnState: {
      scenarioKey: scenario.key,
      turnNumber: 3,
      activeFaction: "Player",
      economyDeltas: [],
      pendingEngagements: [engagement]
    },
    queuedDecisions: [{
      id: "decision-1",
      faction: "Player",
      type: "fortifyFront",
      payload: { frontKey: "front-a" },
      affectedHexKeys: ["0,0"],
      comment: "Hold the hub"
    }],
    engagements: [engagement],
    activeEngagementId: engagement.id,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 16),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 16)
    }
  };
}

/**
 * WHAT: Asserts that an action throws the expected structured CampaignRuntimeError code.
 * WHY: Error branches need stable machine-readable behavior, not only generic exception presence.
 *
 * @param action - Runtime operation expected to fail.
 * @param expectedCode - Stable error code required from the failure.
 */
function assertRuntimeError(action: () => void, expectedCode: CampaignRuntimeError["code"]): void {
  let caught: unknown = null;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof CampaignRuntimeError) || caught.code !== expectedCode) {
    throw new Error(`Expected CampaignRuntimeError ${expectedCode}, received ${String(caught)}.`);
  }
}

registerTest("CAMPAIGN_RUNTIME_CANONICAL_IDENTITY", async ({ Given, When, Then }) => {
  let firstHash = "";
  let secondHash = "";

  await Given("semantically identical records with different property insertion order", async () => {
    firstHash = computeCampaignContentHash({ alpha: 1, nested: { beta: 2, gamma: [3, 4] } });
    secondHash = computeCampaignContentHash({ nested: { gamma: [3, 4], beta: 2 }, alpha: 1 });
  });

  await Then("canonical serialization, hashes, and stable record IDs are insertion-order independent", async () => {
    if (firstHash !== secondHash) throw new Error(`Canonical hashes differ: ${firstHash} versus ${secondHash}.`);
    const firstId = createStableCampaignRecordId("Formation", "campaign-a", { q: 2, r: 3 }, "Infantry_42");
    const secondId = createStableCampaignRecordId("formation", "campaign-a", { r: 3, q: 2 }, "Infantry_42");
    if (firstId !== secondId) throw new Error(`Stable IDs differ: ${firstId} versus ${secondId}.`);
  });

  await When("canonicalization receives a non-finite value", async () => {});

  await Then("it rejects the unsupported value instead of silently serializing null", async () => {
    assertRuntimeError(() => canonicalCampaignStringify({ invalid: Number.POSITIVE_INFINITY }), "CANONICALIZATION_FAILED");
  });
});

registerTest("CAMPAIGN_RUNTIME_RANDOM_STREAMS_PERSIST", async ({ Given, When, Then }) => {
  const first = new CampaignRandom(123456789);
  const control = new CampaignRandom(123456789);
  let saved = first.serialize();
  let expectedNextWeather = 0;

  await Given("two generators with the same base seed", async () => {
    first.next("weather");
    first.next("weather");
    saved = first.serialize();
    expectedNextWeather = first.next("weather");
  });

  await Then("consuming weather does not advance movement or intelligence streams", async () => {
    if (first.next("movement") !== control.next("movement")) throw new Error("Weather consumption changed movement stream output.");
    if (first.next("intelligence") !== control.next("intelligence")) throw new Error("Weather consumption changed intelligence stream output.");
  });

  await When("the saved stream state is restored", async () => {
    const restored = CampaignRandom.fromSerialized(saved);
    if (restored.next("weather") !== expectedNextWeather) {
      throw new Error("Restored weather stream did not continue from the exact serialized position.");
    }
  });

  await Then("invalid seeds, missing streams, and invalid ranges are trapped", async () => {
    assertRuntimeError(() => new CampaignRandom(-1), "INVALID_RANDOM_STATE");
    assertRuntimeError(() => CampaignRandom.fromSerialized({ version: 1, baseSeed: 1, streams: {} }), "INVALID_RANDOM_STATE");
    assertRuntimeError(() => first.range("weather", 4, 4), "INVALID_RANDOM_RANGE");
    assertRuntimeError(() => first.integer("weather", 1.5, 3), "INVALID_RANDOM_RANGE");
  });
});

registerTest("CAMPAIGN_RUNTIME_LEGACY_ADAPTER_ROUND_TRIPS", async ({ Given, When, Then }) => {
  const legacy = buildLegacyScenario();
  const definition = splitLegacyCampaignScenario(legacy);
  const runtime = createCampaignRuntime(definition, buildRuntimeOptions(legacy));
  const contentHashBeforeMutation = runtime.scenarioContentHash;
  let projected = projectLegacyCampaignState(definition, runtime);

  await Given("a shipped campaign scenario split into frozen authored content and mutable runtime truth", async () => {
    if (!Object.isFrozen(definition) || !Object.isFrozen(definition.map.tilePalette.playerHub.forces)) {
      throw new Error("Campaign scenario definition is not recursively frozen.");
    }
    if (runtime.tiles["0,0"].forces[0]?.count !== 2) throw new Error("Palette force inheritance was not materialized in runtime truth.");
    if (runtime.tiles["0,0"].controlSinceSegment !== 8) throw new Error("Legacy controlSinceDay was not migrated to a segment.");
    if (runtime.status !== "engagement" || runtime.engagements["eng-foundation"].status !== "inBattle") {
      throw new Error("Active legacy engagement was not preserved in runtime lifecycle state.");
    }
  });

  await Then("the compatibility projection preserves scenario and auxiliary campaign state", async () => {
    if (projected.scenario.key !== legacy.key || projected.scenario.hexScaleKm !== 10) throw new Error("Scenario identity or scale changed.");
    if (projected.scenario.fronts[0]?.key !== "front-a") throw new Error("Legacy front metadata was not preserved.");
    if (projected.scenario.objectives[0]?.key !== "hold-hub") throw new Error("Objective definition was not preserved.");
    if (projected.scenario.economies[0]?.supplies !== 500) throw new Error("Faction economy was not preserved.");
    if (projected.queuedDecisions[0]?.id !== "decision-1") throw new Error("Queued decision was not preserved.");
    if (projected.turnState?.turnNumber !== 3) throw new Error("Turn state was not preserved.");
    if (projected.engagements[0]?.id !== "eng-foundation") throw new Error("Engagement was not preserved.");
    if (projected.intelligenceByFaction.Player.faction !== "Player") throw new Error("Faction knowledge was not preserved.");
  });

  await When("runtime and projected records are mutated after creation", async () => {
    runtime.tiles["0,0"].forces[0].count = 1;
    reconcileCampaignFormationForceCounts(runtime, runtime.currentSegment, "Foundation fixture mutates authoritative force count.");
    projected.scenario.economies[0].supplies = 1;
    projected = projectLegacyCampaignState(definition, runtime);
  });

  await Then("authored content stays unchanged and each projection is defensive", async () => {
    const authoredCount = definition.initialState.tiles[0].forces?.[0]?.count
      ?? definition.map.tilePalette.playerHub.forces?.[0]?.count;
    if (authoredCount !== 2) throw new Error("Runtime mutation leaked into frozen authored content.");
    if (runtime.factions.Player.economy.supplies !== 500) throw new Error("Projection mutation leaked into runtime economy.");
    if (runtime.scenarioContentHash !== contentHashBeforeMutation) throw new Error("Runtime mutation changed authored content identity.");
  });
});

registerTest("CAMPAIGN_RUNTIME_INVARIANTS_REPORT_CORRUPTION", async ({ Given, When, Then }) => {
  const scenario = buildLegacyScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), buildRuntimeOptions(scenario));
  const invalid = structuredClone(runtime);
  let codes = new Set<string>();

  await Given("a valid runtime candidate", async () => {
    if (validateCampaignRuntimeState(runtime).length !== 0) throw new Error("Valid runtime failed foundation invariants.");
  });

  await When("every foundational identity, ordering, state, and history category is corrupted", async () => {
    Object.assign(invalid, {
      runtimeVersion: 99,
      campaignId: "",
      scenarioKey: "",
      scenarioContentHash: "unsupported-hash",
      revision: -1,
      status: "paused",
      currentSegment: -1
    });
    invalid.tileOrder.push("0,0");
    invalid.factions.Player.economy.supplies = -1;
    invalid.factionOrder.push("Player");
    invalid.tiles["0,0"].hex.q = 9;
    invalid.tiles["0,0"].forces[0].count = -1;
    invalid.rng = { ...invalid.rng, streams: { ...invalid.rng.streams, weather: -1 } };
    invalid.engagementOrder.push("eng-foundation");
    invalid.engagements["eng-foundation"].engagement.attacker = "";
    invalid.engagements["eng-foundation"].status = "opportunity";
    invalid.objectiveOrder.push("hold-hub");
    invalid.objectives["hold-hub"].progress = -1;
    invalid.knowledgeByFaction.Player.faction = "Bot";
    Object.assign(invalid.eventLog[0], { id: "" });
    codes = new Set(validateCampaignRuntimeState(invalid).map((issue) => issue.code));
  });

  await Then("validation reports every affected foundational invariant category", async () => {
    for (const expected of [
      "RUNTIME_VERSION_INVALID",
      "CAMPAIGN_ID_INVALID",
      "SCENARIO_KEY_INVALID",
      "CONTENT_HASH_INVALID",
      "REVISION_INVALID",
      "SEGMENT_INVALID",
      "STATUS_INVALID",
      "RANDOM_STATE_INVALID",
      "TILE_ORDER_INVALID",
      "TILE_KEY_INVALID",
      "TILE_CONTROL_INVALID",
      "FORCE_COUNT_INVALID",
      "FACTION_ORDER_INVALID",
      "ECONOMY_INVALID",
      "ENGAGEMENT_INVALID",
      "ACTIVE_ENGAGEMENT_INVALID",
      "OBJECTIVE_INVALID",
      "KNOWLEDGE_OWNER_INVALID",
      "EVENT_LOG_INVALID"
    ]) {
      if (!codes.has(expected)) throw new Error(`Missing expected invariant issue ${expected}. Received ${Array.from(codes).join(", ")}.`);
    }
  });
});

registerTest("CAMPAIGN_RUNTIME_TRANSACTION_COMMITS_OR_ROLLS_BACK", async ({ Given, When, Then }) => {
  const scenario = buildLegacyScenario();
  const source = createCampaignRuntime(splitLegacyCampaignScenario(scenario), buildRuntimeOptions(scenario));
  const sourceHash = computeCampaignContentHash(source);
  const sourceWeatherSeed = source.rng.streams.weather;
  let committed = runCampaignRuntimeTransaction(source, "foundation-supply-spend", (draft, random) => {
    draft.factions.Player.economy.supplies -= 25;
    random.next("weather");
    return [{
      type: "stateChanged",
      category: "logistics",
      summary: "Foundation test supply expenditure.",
      details: { faction: "Player", suppliesSpent: 25 }
    }];
  });

  await Given("a valid source runtime and a deterministic mutation", async () => {});

  await Then("one revision commits with ordered events, random checkpoint, report, and an unchanged source", async () => {
    if (!committed.ok) throw new Error(`Expected committed transaction, received ${committed.error.message}.`);
    if (committed.state.revision !== source.revision + 1) throw new Error("Transaction did not increment revision exactly once.");
    if (committed.state.factions.Player.economy.supplies !== 475) throw new Error("Candidate supply mutation was not committed.");
    if (committed.state.rng.streams.weather === sourceWeatherSeed) throw new Error("Consumed weather stream was not checkpointed.");
    if (committed.state.eventLog.length !== source.eventLog.length + 2) throw new Error("Material and commit events were not appended.");
    if (committed.report.eventIds.length !== 2 || committed.state.lastResolution?.transactionId !== committed.report.transactionId) {
      throw new Error("Transaction report does not reference committed events.");
    }
    if (computeCampaignContentHash(source) !== sourceHash) throw new Error("Transaction mutated the source runtime.");
  });

  await When("another mutation would create a negative economy", async () => {
    committed = runCampaignRuntimeTransaction(source, "foundation-invalid-spend", (draft) => {
      draft.factions.Player.economy.supplies = -1;
      return [{
        type: "stateChanged",
        category: "logistics",
        summary: "Invalid supply expenditure.",
        details: { faction: "Player" }
      }];
    });
  });

  await Then("the invalid candidate is rejected and the exact safe state is retained", async () => {
    if (committed.ok) throw new Error("Invalid negative-resource transaction unexpectedly committed.");
    if (!committed.issues.some((issue) => issue.code === "ECONOMY_INVALID")) {
      throw new Error(`Rejected transaction did not report economy corruption: ${committed.error.message}.`);
    }
    if (computeCampaignContentHash(committed.state) !== sourceHash || computeCampaignContentHash(source) !== sourceHash) {
      throw new Error("Rejected transaction did not retain the exact last safe state.");
    }
  });
});
