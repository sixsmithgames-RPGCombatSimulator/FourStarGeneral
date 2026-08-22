/**
 * MODULE: CampaignState.runtimeCutover.test
 * WHAT: Certifies authoritative runtime ownership, compatibility rollback, live IndexedDB-repository save/load, legacy write-through, and deterministic continuation.
 * WHY: CampaignState/CampaignScreen cannot leave the legacy path until existing behavior and save recovery are proven over CampaignRuntimeState.
 *
 * DEPENDENCIES: Custom harness, shipped campaign01, in-memory persistence backend, checked-in legacy fixtures.
 * EXPORTS: Registered live-cutover certification cases.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { projectLegacyCampaignState } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import type { InMemoryCampaignSaveBackendState } from "../src/game/campaign/persistence/CampaignSaveBackend";
import {
  CampaignState,
  CAMPAIGN_LEGACY_MIGRATION_MARKER_KEY,
  CAMPAIGN_LEGACY_SAVE_KEY,
  CAMPAIGN_PRIMARY_SAVE_SLOT_ID,
  type CampaignLegacyStorage,
  type CampaignStatePersistenceRequest
} from "../src/state/CampaignState";
import {
  LEGACY_V2_ENGAGEMENT_ID,
  buildCampaignSaveCanonicalScenario,
  buildLegacyCampaignSaveV1Raw,
  buildLegacyCampaignSaveV2Raw
} from "./fixtures/CampaignSaveLegacy.fixtures.js";

/** Legacy storage fixture exposing defensive record inspection without browser globals. */
interface InspectableLegacyStorage extends CampaignLegacyStorage {
  snapshot(): Readonly<Record<string, string>>;
}

/**
 * WHAT: Creates isolated localStorage-like legacy records.
 * WHY: Migration tests must prove the original key is byte-identical and only the separate marker is added.
 *
 * @param initial - Initial string records.
 * @returns Inspectable legacy storage boundary.
 */
function createLegacyStorage(initial: Readonly<Record<string, string>> = {}): InspectableLegacyStorage {
  const records: Record<string, string> = { ...initial };
  return {
    getItem: (key) => records[key] ?? null,
    setItem: (key, value) => { records[key] = value; },
    snapshot: () => ({ ...records })
  };
}

/**
 * WHAT: Builds explicit deterministic primary-slot UI/save metadata.
 * WHY: CampaignState intentionally has no hidden clock, difficulty, commander, or resume-context defaults.
 *
 * @param timestamp - Canonical operation timestamp.
 * @returns Complete persistence request.
 */
function buildPersistenceRequest(timestamp: string): CampaignStatePersistenceRequest {
  return {
    timestamp,
    label: "Cutover certification",
    playTimeSeconds: 3600,
    difficulty: "standard",
    commanderRosterLink: "commander-cutover",
    uiResumeContext: {
      workspace: "theater",
      selectedEntityId: null,
      mapCenter: { x: 100, y: 200 },
      mapZoom: 1
    }
  };
}

/**
 * WHAT: Loads shipped campaign01 as a fresh mutable scenario.
 * WHY: Each test must avoid cross-test mutation and JSON-module cache sharing.
 *
 * @returns Defensive campaign01 scenario.
 */
function buildCampaign01Scenario(): CampaignScenarioData {
  return structuredClone(campaignScenarioData) as CampaignScenarioData;
}

registerTest("CAMPAIGN_STATE_RUNTIME_CUTOVER_STARTS_EQUIVALENT", async ({ Given, When, Then }) => {
  const state = new CampaignState({
    saveBackend: new InMemoryCampaignSaveBackend(),
    legacyStorage: createLegacyStorage()
  });

  await Given("the shipped campaign01 scenario enters CampaignState", async () => {
    state.setScenario(buildCampaign01Scenario());
  });

  await When("the current compatibility state is projected independently from authoritative runtime", async () => {});

  await Then("runtime, authored definition, legacy facade, and faction-filtered player view agree without shared mutation", async () => {
    const runtime = state.getRuntimeSnapshot();
    const definition = state.getScenarioDefinitionSnapshot();
    const scenario = state.getScenario();
    if (!runtime || !definition || !scenario) throw new Error("CampaignState did not create definition/runtime/facade state.");
    const projected = projectLegacyCampaignState(definition, runtime);
    if (computeCampaignContentHash(projected.scenario) !== computeCampaignContentHash(scenario)) {
      throw new Error("Live compatibility scenario differs from independent runtime projection.");
    }
    if (runtime.scenarioKey !== scenario.key || runtime.currentSegment !== state.getCurrentSegment()) {
      throw new Error("Runtime identity/time differs from the shipped CampaignState facade.");
    }
    const playerView = state.getCampaignMapView("Player");
    if (!playerView || playerView.scenario.economies.some((entry) => entry.faction === "Bot")) {
      throw new Error("Runtime cutover leaked opposing economy truth into the player projection.");
    }

    Object.assign(definition, { title: "External mutation attempt" });
    runtime.factions.Player.economy.supplies = -999;
    if (state.getScenarioDefinitionSnapshot()?.title === "External mutation attempt"
      || (state.getRuntimeSnapshot()?.factions.Player.economy.supplies ?? -1) < 0) {
      throw new Error("Runtime/definition inspection snapshots share mutation references with CampaignState.");
    }

    const revision = state.getRuntimeSnapshot()?.revision;
    state.emit("manual");
    if (state.getRuntimeSnapshot()?.revision !== revision) {
      throw new Error("No-op compatibility notification created an unnecessary runtime revision.");
    }
  });
});

registerTest("CAMPAIGN_STATE_REJECTS_INVALID_SCENARIO_ATOMICALLY", async ({ Given, When, Then }) => {
  const state = new CampaignState({
    saveBackend: new InMemoryCampaignSaveBackend(),
    legacyStorage: createLegacyStorage()
  });
  let scenarioHash = "";
  let runtimeHash = "";
  let definitionHash = "";
  let authoredHash = "";
  let rejection = "";

  await Given("a valid live campaign and an edited replacement that removes an objective-bearing tile", async () => {
    state.setScenario(buildCampaign01Scenario());
    scenarioHash = computeCampaignContentHash(state.getScenario());
    runtimeHash = computeCampaignContentHash(state.getRuntimeSnapshot());
    definitionHash = computeCampaignContentHash(state.getScenarioDefinitionSnapshot());
    authoredHash = computeCampaignContentHash((state as any).authoredScenarioSource);
  });

  await When("the invalid replacement is submitted through the authored scenario boundary", async () => {
    const invalid = buildCampaign01Scenario();
    invalid.tiles = invalid.tiles.filter((tile) => tile.hex.q !== 22 || tile.hex.r !== 13);
    try {
      state.setScenario(invalid);
    } catch (error) {
      rejection = error instanceof Error ? error.message : String(error);
    }
  });

  await Then("validation fails before scenario, definition, runtime, or migration source truth changes", async () => {
    if (!rejection.includes("has no operational tile")) {
      throw new Error(`Expected objective validation rejection, received '${rejection}'.`);
    }
    if (computeCampaignContentHash(state.getScenario()) !== scenarioHash
      || computeCampaignContentHash(state.getRuntimeSnapshot()) !== runtimeHash
      || computeCampaignContentHash(state.getScenarioDefinitionSnapshot()) !== definitionHash
      || computeCampaignContentHash((state as any).authoredScenarioSource) !== authoredHash) {
      throw new Error("Rejected authored scenario changed live or migration-owned campaign truth.");
    }
  });
});

registerTest("CAMPAIGN_STATE_RUNTIME_CUTOVER_COMMITS_OR_ROLLS_BACK", async ({ Given, When, Then }) => {
  const state = new CampaignState({
    saveBackend: new InMemoryCampaignSaveBackend(),
    legacyStorage: createLegacyStorage()
  });
  state.setScenario(buildCampaignSaveCanonicalScenario());
  const before = state.getRuntimeSnapshot();
  const notifications: string[] = [];
  let rejected = false;
  state.subscribe((reason) => { notifications.push(reason); });

  await Given("a valid authoritative runtime and unchanged compatibility facade", async () => {
    if (!before) throw new Error("Cutover fixture did not create runtime.");
  });

  await When("a legacy-facing mutation references an active engagement that does not exist", async () => {
    try {
      state.setActiveEngagementId("missing-engagement");
    } catch {
      rejected = true;
    }
  });

  await Then("the invalid candidate rolls back exactly and listeners never observe it", async () => {
    const afterRollback = state.getRuntimeSnapshot();
    if (!rejected || !afterRollback || !before) throw new Error("Invalid compatibility mutation was not rejected.");
    if (computeCampaignContentHash(afterRollback) !== computeCampaignContentHash(before)
      || state.getActiveEngagementId() !== null
      || notifications.length !== 0) {
      throw new Error("Rejected compatibility mutation changed safe runtime, facade, or listeners.");
    }

    state.queueDecision({
      id: "cutover-valid-decision",
      faction: "Player",
      type: "fortifyFront",
      payload: { frontKey: "fixture-front" },
      affectedHexKeys: ["0,0"]
    });
    const committed = state.getRuntimeSnapshot();
    if (!committed || committed.revision !== before.revision + 1
      || committed.compatibility.queuedDecisions[0]?.id !== "cutover-valid-decision"
      || Number(notifications.length) !== 1) {
      throw new Error("Valid compatibility mutation did not commit exactly one revision before notification.");
    }
  });
});

registerTest("CAMPAIGN_STATE_PRIMARY_SAVE_LOAD_CONTINUES_DETERMINISTICALLY", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const source = new CampaignState({ saveBackend: backend, legacyStorage: createLegacyStorage() });
  const restored = new CampaignState({ saveBackend: backend, legacyStorage: createLegacyStorage() });
  source.setScenario(buildCampaignSaveCanonicalScenario());
  source.advanceSegment();
  let savedRuntimeHash = "";

  await Given("a live campaign advanced to a committed stable boundary", async () => {
    savedRuntimeHash = computeCampaignContentHash(source.getRuntimeSnapshot());
    await source.savePrimaryCampaign(buildPersistenceRequest("2026-08-02T13:00:00.000Z"));
  });

  await When("a fresh CampaignState resolves the same authored scenario and loads the primary IndexedDB-style slot", async () => {
    restored.setScenario(buildCampaignSaveCanonicalScenario());
    const result = await restored.loadPrimaryCampaign(buildPersistenceRequest("2026-08-02T13:01:00.000Z"));
    if (!result.ok || result.source !== "campaign2") {
      throw new Error(result.ok ? "Primary load reported the wrong source." : result.error.message);
    }
  });

  await Then("restored truth matches exactly and the next segment remains deterministic", async () => {
    if (computeCampaignContentHash(restored.getRuntimeSnapshot()) !== savedRuntimeHash
      || computeCampaignContentHash(restored.getScenario()) !== computeCampaignContentHash(source.getScenario())) {
      throw new Error("Primary load did not restore exact runtime and compatibility state.");
    }
    source.advanceSegment();
    restored.advanceSegment();
    if (computeCampaignContentHash(restored.getRuntimeSnapshot())
      !== computeCampaignContentHash(source.getRuntimeSnapshot())) {
      throw new Error("Save/load continuation produced a different next deterministic runtime.");
    }
    const sourceView = source.getCampaignMapView("Player");
    const restoredView = restored.getCampaignMapView("Player");
    if (computeCampaignContentHash(sourceView) !== computeCampaignContentHash(restoredView)) {
      throw new Error("Save/load continuation produced a different faction-filtered player view.");
    }
  });
});

registerTest("CAMPAIGN_STATE_LEGACY_LOAD_WRITES_THROUGH_NON_DESTRUCTIVELY", async ({ Given, When, Then }) => {
  for (const fixture of [
    { version: 1, raw: buildLegacyCampaignSaveV1Raw(), expectedSegment: 16, expectedEngagement: null },
    { version: 2, raw: buildLegacyCampaignSaveV2Raw(), expectedSegment: 19, expectedEngagement: LEGACY_V2_ENGAGEMENT_ID }
  ]) {
    const backend = new InMemoryCampaignSaveBackend();
    const storage = createLegacyStorage({ [CAMPAIGN_LEGACY_SAVE_KEY]: fixture.raw });
    const state = new CampaignState({ saveBackend: backend, legacyStorage: storage });
    state.setScenario(buildCampaignSaveCanonicalScenario());

    await Given(`a shipped v${fixture.version} localStorage save and an empty Campaign 2.0 repository`, async () => {});

    let result = await state.loadPrimaryCampaign(buildPersistenceRequest(
      fixture.version === 1 ? "2026-08-02T14:00:00.000Z" : "2026-08-02T14:01:00.000Z"
    ));
    await When(`the live loader migrates, atomically writes, verifies, and hydrates v${fixture.version}`, async () => {});

    await Then(`v${fixture.version} progress loads while original bytes remain and a separate marker is written`, async () => {
      if (!result.ok || result.source !== "legacyMigration") {
        throw new Error(result.ok ? "Legacy load reported the wrong source." : result.error.message);
      }
      if (state.getCurrentSegment() !== fixture.expectedSegment
        || state.getActiveEngagementId() !== fixture.expectedEngagement) {
        throw new Error(`Legacy v${fixture.version} time or engagement state was not hydrated.`);
      }
      const records = storage.snapshot();
      if (records[CAMPAIGN_LEGACY_SAVE_KEY] !== fixture.raw
        || !records[CAMPAIGN_LEGACY_MIGRATION_MARKER_KEY]) {
        throw new Error(`Legacy v${fixture.version} source changed or migration marker is missing.`);
      }
      const slot = await backend.getSlot(CAMPAIGN_PRIMARY_SAVE_SLOT_ID);
      if (!slot || slot.currentSaveId !== result.envelope.saveId) {
        throw new Error(`Legacy v${fixture.version} migrated envelope was not installed in the primary slot.`);
      }
      const playerView = state.getCampaignMapView("Player");
      if (!playerView || playerView.scenario.economies.some((entry) => entry.faction === "Bot")) {
        throw new Error(`Legacy v${fixture.version} load leaked opposing economy truth.`);
      }

      const secondState = new CampaignState({ saveBackend: backend, legacyStorage: storage });
      secondState.setScenario(buildCampaignSaveCanonicalScenario());
      result = await secondState.loadPrimaryCampaign(buildPersistenceRequest(
        fixture.version === 1 ? "2026-08-02T14:02:00.000Z" : "2026-08-02T14:03:00.000Z"
      ));
      if (!result.ok || result.source !== "campaign2") {
        throw new Error(`Subsequent v${fixture.version} load did not prefer verified Campaign 2.0 storage.`);
      }
    });
  }
});

registerTest("CAMPAIGN_STATE_RECOVERY_REQUIRES_EXPLICIT_ACCEPTANCE", async ({ Given, When, Then }) => {
  const originalBackend = new InMemoryCampaignSaveBackend();
  const source = new CampaignState({ saveBackend: originalBackend, legacyStorage: createLegacyStorage() });
  source.setScenario(buildCampaignSaveCanonicalScenario());
  source.advanceSegment();
  await source.savePrimaryCampaign(buildPersistenceRequest("2026-08-02T15:00:00.000Z"));
  source.advanceSegment();
  await source.savePrimaryCampaign(buildPersistenceRequest("2026-08-02T15:01:00.000Z"));
  const exported = originalBackend.exportState();
  const slot = exported.slots[CAMPAIGN_PRIMARY_SAVE_SLOT_ID];
  const saves = structuredClone(exported.saves) as Record<string, unknown>;
  const current = structuredClone(saves[slot.currentSaveId]) as Record<string, unknown>;
  current.checksum = "fsg-save-v1-fnv1a32-deadbeef";
  saves[slot.currentSaveId] = current;
  const corruptState: InMemoryCampaignSaveBackendState = {
    saves,
    slots: exported.slots,
    quarantine: exported.quarantine
  };
  const restored = new CampaignState({
    saveBackend: new InMemoryCampaignSaveBackend(corruptState),
    legacyStorage: createLegacyStorage()
  });
  restored.setScenario(buildCampaignSaveCanonicalScenario());
  const load = await restored.loadPrimaryCampaign(buildPersistenceRequest("2026-08-02T15:02:00.000Z"));

  await Given("a corrupt current primary save with one verified earlier record", async () => {});

  await When("CampaignState discovers repository recovery without player acceptance", async () => {});

  await Then("active state stays unchanged until the explicit recovery method is called", async () => {
    if (load.ok || !load.recoveryCandidate || restored.getCurrentSegment() !== 0) {
      throw new Error("Recovery candidate was missing or silently applied.");
    }
    const recovered = restored.restorePrimaryCampaignRecovery(load.recoveryCandidate);
    if (!recovered.ok || recovered.source !== "recovery" || restored.getCurrentSegment() !== 1) {
      throw new Error("Explicit recovery did not hydrate the verified earlier segment.");
    }
  });
});
