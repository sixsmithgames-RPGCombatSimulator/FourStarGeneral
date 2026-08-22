/**
 * MODULE: CampaignSave.persistence.test
 * WHAT: Certifies Campaign 2.0 envelopes, atomic slots, corruption recovery, and shipped v1/v2 migration.
 * WHY: The live save cutover cannot begin until interruption, integrity, content-policy, and old-progress behavior are regression-protected.
 *
 * DEPENDENCIES: Custom test harness, checked-in legacy fixtures, Campaign 2.0 runtime/persistence modules.
 * EXPORTS: Registered persistence and migration certification cases.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import campaignScenarioData from "../src/data/campaign01.json";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import {
  projectLegacyCampaignState,
  splitLegacyCampaignScenario
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import {
  computeCampaignSaveChecksum,
  createCampaignSaveEnvelope,
  validateCampaignSaveEnvelope
} from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import {
  InMemoryCampaignSaveBackend,
  IndexedDbCampaignSaveBackend,
  type CampaignSaveCommitStage,
  type InMemoryCampaignSaveBackendState
} from "../src/game/campaign/persistence/CampaignSaveBackend";
import {
  migrateLegacyCampaignSave,
  type LegacyCampaignSaveMigrationContext,
  type LegacyCampaignSaveMigrationResult
} from "../src/game/campaign/persistence/CampaignSaveMigration";
import { CampaignSaveRepository } from "../src/game/campaign/persistence/CampaignSaveRepository";
import {
  CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH,
  CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH,
  CENTRAL_CHANNEL_PRE_COUNTERATTACK_CONTENT_HASH,
  migrateCampaignRuntimeContent
} from "../src/game/campaign/persistence/CampaignContentMigration";
import {
  CampaignSaveError,
  type CampaignSaveEnvelopeInput,
  type FourStarCampaignSaveEnvelope
} from "../src/game/campaign/persistence/CampaignSaveTypes";
import {
  LEGACY_V2_ENGAGEMENT_ID,
  buildCampaignSaveCanonicalScenario,
  buildLegacyCampaignSaveV1Raw,
  buildLegacyCampaignSaveV2Raw
} from "./fixtures/CampaignSaveLegacy.fixtures.js";
import { CampaignState } from "../src/state/CampaignState";

const CREATED_AT = "2026-08-02T12:00:00.000Z";
const UPDATED_AT = "2026-08-02T12:03:00.000Z";

/**
 * WHAT: Creates complete deterministic migration context around a supplied scenario resolver.
 * WHY: Migration intentionally has no hidden time, build, content, difficulty, or UI defaults.
 *
 * @param resolveScenario - Authored scenario lookup policy.
 * @returns Explicit migration context.
 */
function buildMigrationContext(
  resolveScenario: (scenarioKey: string) => CampaignScenarioData | null = () => buildCampaignSaveCanonicalScenario()
): LegacyCampaignSaveMigrationContext {
  return {
    resolveScenario,
    buildVersion: "test-build-1",
    contentVersion: "test-content-1",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    slotType: "manual",
    playTimeSeconds: 7200,
    difficulty: "standard",
    commanderRosterLink: "commander-fixture",
    uiResumeContext: {
      workspace: "theater",
      selectedEntityId: null,
      mapCenter: { x: 320, y: 240 },
      mapZoom: 1.25
    }
  };
}

/**
 * WHAT: Asserts a sync or async operation fails with one stable CampaignSaveError code.
 * WHY: Migration/storage error behavior is an API contract, not just exception presence.
 *
 * @param action - Operation expected to reject or throw.
 * @param code - Required stable error code.
 */
async function assertCampaignSaveError(
  action: () => unknown | Promise<unknown>,
  code: CampaignSaveError["code"]
): Promise<void> {
  let caught: unknown = null;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof CampaignSaveError) || caught.code !== code) {
    throw new Error(`Expected CampaignSaveError ${code}, received ${String(caught)}.`);
  }
}

/**
 * WHAT: Produces a new immutable envelope record over an existing certified payload.
 * WHY: Slot-overwrite tests need unique copy-on-write identities without changing campaign truth.
 *
 * @param base - Certified source envelope.
 * @param saveId - Unique new immutable save identity.
 * @param updatedAt - New slot ordering timestamp.
 * @returns Independently checksummed envelope.
 */
function createRevisedEnvelope(
  base: FourStarCampaignSaveEnvelope,
  saveId: string,
  updatedAt: string
): FourStarCampaignSaveEnvelope {
  const input: CampaignSaveEnvelopeInput = {
    saveId,
    slotType: base.slotType,
    gameMode: "campaign",
    createdAt: base.createdAt,
    updatedAt,
    buildVersion: base.buildVersion,
    contentVersion: base.contentVersion,
    scenarioKey: base.scenarioKey,
    campaignId: base.campaignId,
    engagementId: base.engagementId,
    display: structuredClone(base.display),
    payload: structuredClone(base.payload)
  };
  return createCampaignSaveEnvelope(input);
}

/**
 * WHAT: Creates two valid save revisions behind one in-memory named slot.
 * WHY: Atomic interruption and corruption recovery tests share the same certified history shape.
 *
 * @param observer - Optional atomic stage observer.
 * @returns Backend, repository, and first/second envelopes.
 */
async function createTwoSaveHistory(
  observer?: (stage: CampaignSaveCommitStage) => void
): Promise<{
  backend: InMemoryCampaignSaveBackend;
  repository: CampaignSaveRepository;
  first: FourStarCampaignSaveEnvelope;
  second: FourStarCampaignSaveEnvelope;
}> {
  const migrated = migrateLegacyCampaignSave(buildLegacyCampaignSaveV1Raw(), buildMigrationContext());
  const first = createRevisedEnvelope(migrated.envelope, "save_manual_first", "2026-08-02T12:04:00.000Z");
  const second = createRevisedEnvelope(migrated.envelope, "save_manual_second", "2026-08-02T12:05:00.000Z");
  const backend = new InMemoryCampaignSaveBackend(undefined, observer);
  const repository = new CampaignSaveRepository(backend, 3);
  await repository.saveSlot({ slotId: "slot-primary", label: "Primary campaign", envelope: first });
  await repository.saveSlot({ slotId: "slot-primary", label: "Primary campaign", envelope: second });
  return { backend, repository, first, second };
}

registerTest("CAMPAIGN_SAVE_ENVELOPE_CERTIFIES_INTEGRITY_AND_CONTENT", async ({ Given, When, Then }) => {
  const migrated = migrateLegacyCampaignSave(buildLegacyCampaignSaveV1Raw(), buildMigrationContext());
  const valid = migrated.envelope;
  const tampered = structuredClone(valid) as unknown as Record<string, unknown>;

  await Given("a checksummed Campaign 2.0 envelope with a valid authoritative runtime", async () => {
    const result = validateCampaignSaveEnvelope(valid, {
      scenarioKey: valid.scenarioKey,
      scenarioContentHash: valid.payload.runtime.scenarioContentHash
    });
    if (!result.ok) throw new Error(`Certified envelope failed validation: ${result.error.message}`);
    if (valid.checksum !== computeCampaignSaveChecksum(valid)) throw new Error("Created envelope checksum is not reproducible.");
  });

  await When("stored payload content changes without updating the checksum", async () => {
    const payload = tampered.payload as { runtime: { factions: Record<string, { economy: { supplies: number } }> } };
    payload.runtime.factions.Player.economy.supplies += 1;
  });

  await Then("checksum, future-version, invalid-runtime, and expected-content policies reject independently", async () => {
    const checksumResult = validateCampaignSaveEnvelope(tampered);
    if (checksumResult.ok || checksumResult.error.code !== "CHECKSUM_MISMATCH") {
      throw new Error("Tampered envelope did not fail checksum validation.");
    }

    const future = { ...structuredClone(valid), envelopeVersion: 2 };
    const futureResult = validateCampaignSaveEnvelope(future);
    if (futureResult.ok || futureResult.error.code !== "UNSUPPORTED_ENVELOPE_VERSION") {
      throw new Error("Future envelope version was not retained as unsupported read-only state.");
    }

    const invalidRuntime = structuredClone(valid);
    invalidRuntime.payload.runtime.factions.Player.economy.supplies = -1;
    const unsignedInvalid = invalidRuntime as unknown as Record<string, unknown>;
    Object.assign(invalidRuntime, { checksum: computeCampaignSaveChecksum(unsignedInvalid) });
    const invalidResult = validateCampaignSaveEnvelope(invalidRuntime);
    if (invalidResult.ok || invalidResult.error.code !== "INVALID_ENVELOPE") {
      throw new Error("Checksummed invalid runtime unexpectedly passed envelope validation.");
    }

    const contentResult = validateCampaignSaveEnvelope(valid, {
      scenarioKey: valid.scenarioKey,
      scenarioContentHash: "fnv1a32-00000000"
    });
    if (contentResult.ok || contentResult.error.code !== "CONTENT_MISMATCH") {
      throw new Error("Expected scenario content mismatch was not rejected.");
    }
  });
});

registerTest("CAMPAIGN_SAVE_REPOSITORY_COMMITS_ATOMIC_SLOT_HISTORY", async ({ Given, When, Then }) => {
  let failureStage: CampaignSaveCommitStage | null = null;
  const history = await createTwoSaveHistory((stage) => {
    if (stage === failureStage) {
      throw new CampaignSaveError("QUOTA_EXCEEDED", "Injected quota failure after slot draft update.");
    }
  });
  const third = createRevisedEnvelope(history.first, "save_manual_third", "2026-08-02T12:06:00.000Z");

  await Given("a named slot with two immutable verified save records", async () => {
    const slot = await history.backend.getSlot("slot-primary");
    if (slot?.currentSaveId !== history.second.saveId || slot.previousSaveIds[0] !== history.first.saveId) {
      throw new Error("Copy-on-write slot history was not ordered newest to oldest.");
    }
  });

  await When("quota failure interrupts a later commit after its draft slot update", async () => {
    failureStage = "slotUpdated";
    await assertCampaignSaveError(
      () => history.repository.saveSlot({ slotId: "slot-primary", label: "Primary campaign", envelope: third }),
      "QUOTA_EXCEEDED"
    );
  });

  await Then("the prior pointer and verified save remain readable and the failed record is absent", async () => {
    const slot = await history.backend.getSlot("slot-primary");
    if (slot?.currentSaveId !== history.second.saveId || slot.previousSaveIds[0] !== history.first.saveId) {
      throw new Error("Interrupted atomic commit changed prior slot state.");
    }
    if (await history.backend.getSave(third.saveId) !== null) {
      throw new Error("Interrupted atomic commit exposed its uncommitted final save.");
    }
    const load = await history.repository.loadSlot("slot-primary", {
      observedAt: "2026-08-02T12:07:00.000Z"
    });
    if (!load.ok || load.envelope.saveId !== history.second.saveId) {
      throw new Error("Prior verified slot could not be loaded after interruption.");
    }
  });
});

registerTest("CAMPAIGN_SAVE_REPOSITORY_QUARANTINES_AND_OFFERS_RECOVERY", async ({ Given, When, Then }) => {
  const history = await createTwoSaveHistory();
  const exported = history.backend.exportState();
  const saves = structuredClone(exported.saves) as Record<string, unknown>;
  const corruptCurrent = structuredClone(saves[history.second.saveId]) as Record<string, unknown>;
  corruptCurrent.checksum = "fsg-save-v1-fnv1a32-deadbeef";
  saves[history.second.saveId] = corruptCurrent;
  const corruptState: InMemoryCampaignSaveBackendState = {
    saves,
    slots: exported.slots,
    quarantine: exported.quarantine
  };
  const backend = new InMemoryCampaignSaveBackend(corruptState);
  const repository = new CampaignSaveRepository(backend, 3);
  let load = await repository.loadSlot("slot-primary", {
    observedAt: "2026-08-02T12:08:00.000Z"
  });

  await Given("a slot whose current checksum is corrupt but whose prior immutable record is valid", async () => {});

  await When("the repository verifies the current record and scans history", async () => {
    if (load.ok) throw new Error("Corrupt current save unexpectedly loaded.");
  });

  await Then("it quarantines current data and returns—but does not load—the newest verified recovery candidate", async () => {
    if (load.ok || load.error.code !== "CHECKSUM_MISMATCH") throw new Error("Current corruption was not reported.");
    if (load.recoveryCandidate?.envelope.saveId !== history.first.saveId
      || load.recoveryCandidate.failedSaveId !== history.second.saveId) {
      throw new Error("Newest verified prior save was not offered as an explicit recovery candidate.");
    }
    const quarantine = await repository.listQuarantine();
    if (quarantine.length !== 1 || quarantine[0].saveId !== history.second.saveId) {
      throw new Error("Corrupt current save was not retained in quarantine.");
    }
    const slot = await backend.getSlot("slot-primary");
    if (slot?.currentSaveId !== history.second.saveId) {
      throw new Error("Recovery discovery silently rewrote the current slot pointer.");
    }

    const healthyBackend = new InMemoryCampaignSaveBackend(exported);
    const healthyRepository = new CampaignSaveRepository(healthyBackend, 3);
    load = await healthyRepository.loadSlot("slot-primary", {
      observedAt: "2026-08-02T12:09:00.000Z",
      expectedContent: {
        scenarioKey: history.second.scenarioKey,
        scenarioContentHash: "fnv1a32-00000000"
      }
    });
    if (load.ok || load.error.code !== "CONTENT_MISMATCH") {
      throw new Error("Healthy but content-incompatible save was not rejected read-only.");
    }
    if ((await healthyRepository.listQuarantine()).length !== 0) {
      throw new Error("Content mismatch was incorrectly quarantined as corruption.");
    }
  });
});

registerTest("CAMPAIGN_SAVE_MIGRATES_V1_DETERMINISTICALLY", async ({ Given, When, Then }) => {
  const raw = buildLegacyCampaignSaveV1Raw();
  const originalRaw = `${raw}`;
  let first: LegacyCampaignSaveMigrationResult | null = null;
  let second: LegacyCampaignSaveMigrationResult | null = null;

  await Given("a shipped version-1 day-based save without faction knowledge", async () => {});

  await When("the same original string is migrated twice against current authored content", async () => {
    first = migrateLegacyCampaignSave(raw, buildMigrationContext());
    second = migrateLegacyCampaignSave(raw, buildMigrationContext());
  });

  await Then("time, mutable state, knowledge, identity, RNG, checksum, and source bytes are preserved deterministically", async () => {
    if (!first || !second) throw new Error("Version-1 migration did not return results.");
    const runtime = first.envelope.payload.runtime;
    if (runtime.currentSegment !== 16) throw new Error(`Version-1 day 3 should migrate to segment 16, got ${runtime.currentSegment}.`);
    if (runtime.factions.Player.economy.supplies !== 412 || runtime.tiles["0,0"].forces[0]?.count !== 1) {
      throw new Error("Version-1 mutable economy or force progress was not preserved.");
    }
    if (runtime.compatibility.initialFronts[0]?.initiative !== "Bot"
      || runtime.compatibility.queuedDecisions[0]?.id !== "legacy-v1-decision") {
      throw new Error("Version-1 front or queued decision was not preserved.");
    }
    if (runtime.knowledgeByFaction.Player.faction !== "Player" || runtime.knowledgeByFaction.Bot.faction !== "Bot") {
      throw new Error("Version-1 migration did not seed isolated Player/Bot knowledge.");
    }
    if (first.envelope.saveId !== second.envelope.saveId
      || first.envelope.campaignId !== second.envelope.campaignId
      || first.envelope.checksum !== second.envelope.checksum
      || computeCampaignContentHash(runtime.rng) !== computeCampaignContentHash(second.envelope.payload.runtime.rng)) {
      throw new Error("Repeated version-1 migration produced different identity, checksum, or RNG state.");
    }
    const expectedContentHash = computeCampaignContentHash(splitLegacyCampaignScenario(buildCampaignSaveCanonicalScenario()));
    if (runtime.scenarioContentHash !== expectedContentHash) {
      throw new Error("Migrated runtime content identity did not come from the resolver-owned authored definition.");
    }
    if (raw !== originalRaw) throw new Error("Pure migration modified the original legacy source string.");
  });
});

registerTest("CAMPAIGN_SAVE_PRESERVES_PROGRESS_WHILE_ENABLING_THE_CAEN_COUNTERATTACK", async ({ Given, When, Then }) => {
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const definition = splitLegacyCampaignScenario(scenario);
  const state = new CampaignState({ legacyStorage: null });
  state.setScenario(scenario);
  const runtime = state.getRuntimeSnapshot();
  if (!runtime) throw new Error("Counterattack migration fixture did not create a runtime.");
  const prior = {
    ...structuredClone(runtime),
    scenarioContentHash: CENTRAL_CHANNEL_PRE_COUNTERATTACK_CONTENT_HASH,
  };
  prior.currentSegment = 12;
  prior.revision = 12;
  const caen = prior.compatibility.initialFronts.find((front) => front.key === "caen_airborne_flank");
  if (!caen) throw new Error("Counterattack migration fixture lost the Caen front.");
  caen.modifiers = caen.modifiers?.filter((modifier) => !modifier.startsWith("counterattack@"));
  let migrated: ReturnType<typeof migrateCampaignRuntimeContent>;

  await Given("a progressed save from the immediately preceding D+1 build", () => {});
  await When("the executable counterattack cadence is added without changing campaign geometry", () => {
    migrated = migrateCampaignRuntimeContent(prior, definition);
  });
  await Then("progress is retained and only the current authored front modifier and content identity are reconciled", () => {
    const repaired = migrated.runtime.compatibility.initialFronts.find((front) => front.key === "caen_airborne_flank");
    if (!migrated.migrated
      || migrated.runtime.currentSegment !== 12
      || migrated.runtime.revision !== 12
      || migrated.runtime.scenarioContentHash !== CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH
      || !repaired?.modifiers?.includes("counterattack@2")) {
      throw new Error("The compatible counterattack migration reset progress or omitted its authored cadence.");
    }
  });
});

registerTest("CAMPAIGN_SAVE_MIGRATES_ONLY_A_PRISTINE_RETIRED_MAP_TO_THE_CORRECTED_DPLUS1_OPENING", async ({ Given, When, Then }) => {
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const definition = splitLegacyCampaignScenario(scenario);
  const state = new CampaignState({ legacyStorage: null });
  state.setScenario(scenario);
  const runtime = state.getRuntimeSnapshot();
  if (!runtime) throw new Error("Pristine migration fixture did not create a runtime.");
  const retiredOpening = {
    ...structuredClone(runtime),
    scenarioContentHash: CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH
  };
  let migrated: ReturnType<typeof migrateCampaignRuntimeContent>;

  await Given("an unplayed save carrying the exact retired production content identity", () => {
    const currentHash = computeCampaignContentHash(definition);
    if (currentHash !== CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH
      || retiredOpening.currentSegment !== 0
      || retiredOpening.revision !== 0) {
      throw new Error(`Normandy content identity or pristine boundary drifted: ${currentHash}.`);
    }
  });

  await When("the save is reconciled against the corrected source-backed Normandy map", () => {
    migrated = migrateCampaignRuntimeContent(retiredOpening, definition);
  });

  await Then("the campaign identity survives while the complete opening is deterministically reseeded", () => {
    const result = migrated.runtime;
    if (!migrated.migrated
      || result.campaignId !== runtime.campaignId
      || result.scenarioContentHash !== CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH
      || result.currentSegment !== 0
      || result.revision !== 0
      || result.tiles["2,19"]?.tileKey !== "utahBeach"
      || result.tiles["4,18"]?.tileKey !== "omahaBeach"
      || result.tiles["10,15"]?.tileKey !== "swordBeach"
      || result.compatibility.initialFronts.length !== 4
      || !result.knowledgeByFaction.Player
      || !result.knowledgeByFaction.Bot) {
      throw new Error("Pristine save did not adopt the complete corrected D+1 opening.");
    }
  });
});

registerTest("CAMPAIGN_SAVE_PRESERVES_BUT_REJECTS_PROGRESS_ON_RETIRED_GEOGRAPHY", async ({ Given, When, Then }) => {
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const definition = splitLegacyCampaignScenario(scenario);
  const state = new CampaignState({ legacyStorage: null });
  state.setScenario(scenario);
  const runtime = state.getRuntimeSnapshot();
  if (!runtime) throw new Error("Progressed migration fixture did not create a runtime.");
  const progressedRetiredMap = {
    ...structuredClone(runtime),
    scenarioContentHash: CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH,
    currentSegment: 1,
    revision: 1
  };
  let failure: CampaignSaveError | null = null;

  await Given("a save with elapsed progress on the retired out-of-bounds map", () => {});
  await When("the new build is asked to guess that progress onto different geography and formations", () => {
    try {
      migrateCampaignRuntimeContent(progressedRetiredMap, definition);
    } catch (error) {
      failure = error instanceof CampaignSaveError ? error : null;
    }
  });
  await Then("the save fails closed with explicit recovery guidance instead of silently changing history", () => {
    if (failure?.code !== "CONTENT_MISMATCH"
      || !failure.message.includes("progress on the retired out-of-bounds campaign geography")
      || !failure.message.includes("preserved")
      || !failure.message.includes("compatible earlier build")) {
      throw new Error(`Progressed retired content did not fail closed with recovery guidance: ${failure?.message ?? "none"}.`);
    }
  });
});
registerTest("CAMPAIGN_SAVE_MIGRATES_V2_AND_REJECTS_INCOMPATIBLE_INPUT", async ({ Given, When, Then }) => {
  const raw = buildLegacyCampaignSaveV2Raw();
  const parsed = JSON.parse(raw) as { intelligenceByFaction: unknown };
  const migrated = migrateLegacyCampaignSave(raw, buildMigrationContext());

  await Given("a shipped version-2 segment save with knowledge, decisions, mutable progress, and an active engagement", async () => {});

  await When("the snapshot is migrated and projected through the compatibility adapter", async () => {
    const projection = projectLegacyCampaignState(migrated.definition, migrated.envelope.payload.runtime);
    if (projection.scenario.economies[0]?.supplies !== 321 || projection.scenario.economies[0]?.fuel !== 222) {
      throw new Error("Version-2 projected economy did not preserve saved mutable values.");
    }
    if (projection.queuedDecisions[0]?.id !== "legacy-v2-decision" || projection.turnState?.turnNumber !== 4) {
      throw new Error("Version-2 decision or turn state did not survive compatibility projection.");
    }
  });

  await Then("all v2 runtime fields survive while future versions and content-incompatible references fail read-only", async () => {
    const runtime = migrated.envelope.payload.runtime;
    if (runtime.currentSegment !== 19 || runtime.tiles["0,0"].controller !== "Bot") {
      throw new Error("Version-2 time or tile control was not preserved.");
    }
    if (runtime.activeEngagementId !== LEGACY_V2_ENGAGEMENT_ID
      || runtime.engagements[LEGACY_V2_ENGAGEMENT_ID]?.status !== "inBattle"
      || runtime.status !== "engagement") {
      throw new Error("Version-2 active engagement lifecycle was not preserved.");
    }
    if (computeCampaignContentHash(runtime.knowledgeByFaction)
      !== computeCampaignContentHash(parsed.intelligenceByFaction)) {
      throw new Error("Version-2 faction knowledge changed during migration.");
    }
    const validation = validateCampaignSaveEnvelope(migrated.envelope, {
      scenarioKey: migrated.definition.key,
      scenarioContentHash: runtime.scenarioContentHash
    });
    if (!validation.ok) throw new Error(`Migrated version-2 envelope failed round trip: ${validation.error.message}`);

    await assertCampaignSaveError(
      () => migrateLegacyCampaignSave(JSON.stringify({ saveVersion: 3 }), buildMigrationContext()),
      "UNSUPPORTED_LEGACY_VERSION"
    );

    const incompatibleResolver = (): CampaignScenarioData => {
      const scenario = buildCampaignSaveCanonicalScenario();
      delete scenario.tilePalette.botFort;
      return scenario;
    };
    await assertCampaignSaveError(
      () => migrateLegacyCampaignSave(raw, buildMigrationContext(incompatibleResolver)),
      "MIGRATION_FAILED"
    );

    const unavailable = new IndexedDbCampaignSaveBackend(null, "unavailable-test-database");
    await assertCampaignSaveError(() => unavailable.getSave("missing"), "STORAGE_UNAVAILABLE");
  });
});
