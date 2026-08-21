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
  CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH,
  CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH,
  CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH
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
import { CampaignState, type CampaignStatePersistenceRequest } from "../src/state/CampaignState";

const CREATED_AT = "2026-08-02T12:00:00.000Z";
const UPDATED_AT = "2026-08-02T12:03:00.000Z";

function buildContactRepairCentralChannelScenario(): CampaignScenarioData {
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  delete scenario.historicalCalendar;
  scenario.description = "Command the invasion forces across the English Channel. Secure airbases, establish supply lines, and coordinate the largest amphibious operation in history.";
  delete scenario.tilePalette.playerAssaultTaskForce;
  const channelBase = scenario.tiles.find((tile) => tile.hex.q === 20 && tile.hex.r === 18);
  const beachheadTile = scenario.tiles.find((tile) => tile.hex.q === 27 && tile.hex.r === 24);
  const beachheadObjective = scenario.objectives.find((objective) => objective.key === "secure_beachhead");
  const beachheadPhase = scenario.campaignArc?.phases.find((phase) => phase.key === "beachhead");
  if (!channelBase || !beachheadTile?.forces || !beachheadObjective || !beachheadPhase) {
    throw new Error("Current Central Channel fixture is missing opening-repair source records.");
  }
  channelBase.tile = "playerNavalBase";
  delete channelBase.rotation;
  channelBase.forces = [{ unitType: "Infantry_42", count: 2, label: "Beachhead Garrison" }];
  beachheadTile.forces = beachheadTile.forces.filter((group) => group.label !== "Beachhead Reserve");
  beachheadObjective.label = "Establish Beachhead";
  beachheadObjective.description = "Capture and hold the coastal positions to allow reinforcements to land";
  beachheadObjective.hex = { q: 20, r: 18 };
  beachheadPhase.label = "Beachhead phase";
  beachheadPhase.description = "Secure the lodgment and open the reinforcement route.";
  return scenario;
}

function buildPreContactCentralChannelScenario(): CampaignScenarioData {
  const scenario = buildContactRepairCentralChannelScenario();
  scenario.tiles = scenario.tiles.filter((tile) => !(
    (tile.hex.q === 27 && tile.hex.r === 24)
    || (tile.hex.q === 29 && tile.hex.r === 25)
  ));
  const airfield = scenario.tiles.find((tile) => tile.hex.q === 30 && tile.hex.r === 25);
  if (!airfield?.forces) throw new Error("Current Central Channel fixture is missing the Eastern airfield forces.");
  airfield.forces = airfield.forces.filter((group) => ![
    "Airfield Counterattack Group",
    "Airfield Armoured Reserve"
  ].includes(group.label ?? ""));
  scenario.fronts = [
    {
      key: "normandy_coast",
      label: "Normandy Beachhead",
      hexKeys: ["15,18", "16,18", "17,18", "18,18", "19,18", "20,18", "21,18", "22,18", "23,18", "24,18"],
      initiative: "Player",
      modifiers: ["amphibiousAssault", "navalSupport"]
    },
    {
      key: "eastern_flank",
      label: "Eastern Sector",
      hexKeys: ["25,19", "26,20", "27,21", "28,22", "29,23"],
      initiative: "Bot",
      modifiers: ["fortified", "artillery"]
    }
  ];
  return scenario;
}

function statePersistenceRequest(timestamp: string): CampaignStatePersistenceRequest {
  return {
    timestamp,
    label: "Central Channel migration fixture",
    playTimeSeconds: 3600,
    difficulty: "Normal",
    commanderRosterLink: null,
    uiResumeContext: {
      workspace: "theater",
      selectedEntityId: null,
      mapCenter: null,
      mapZoom: 1
    }
  };
}

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

registerTest("CAMPAIGN_SAVE_MIGRATES_PRE_CONTACT_GEOMETRY_WITHOUT_LOSING_PROGRESS", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const legacyScenario = buildPreContactCentralChannelScenario();
  const legacyHash = computeCampaignContentHash(splitLegacyCampaignScenario(legacyScenario));
  const currentScenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const currentHash = computeCampaignContentHash(splitLegacyCampaignScenario(currentScenario));
  const source = new CampaignState({ saveBackend: backend });
  source.setScenario(legacyScenario);
  const before = source.getRuntimeSnapshot();
  if (!before) throw new Error("Pre-contact campaign fixture did not create a runtime.");
  await source.savePrimaryCampaign(statePersistenceRequest("2026-08-19T20:00:00.000Z"));
  let restored: CampaignState | null = null;

  await Given("a verified production save from the exact campaign content before actionable contact geometry", async () => {
    if (legacyHash !== CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH
      || currentHash !== CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH) {
      throw new Error(`Campaign content migration hashes drifted (${legacyHash} -> ${currentHash}).`);
    }
  });

  await When("the save loads against the repaired Central Channel scenario", async () => {
    restored = new CampaignState({ saveBackend: backend });
    restored.setScenario(currentScenario);
    const result = await restored.loadPrimaryCampaign(statePersistenceRequest("2026-08-19T20:01:00.000Z"));
    if (!result.ok) throw new Error(`Certified campaign content migration failed: ${result.error.message}`);
  });

  await Then("existing identity and progress survive while persistent contact forces and exact fronts are added once", async () => {
    const runtime = restored?.getRuntimeSnapshot();
    if (!runtime || runtime.scenarioContentHash !== CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH) {
      throw new Error("Migrated campaign did not adopt the repaired authored-content identity.");
    }
    if (runtime.campaignId !== before.campaignId || runtime.revision !== before.revision
      || runtime.currentSegment !== before.currentSegment) {
      throw new Error("Content migration changed campaign identity, revision, or elapsed time.");
    }
    const priorChannelFormationIds = new Set(before.tiles["20,18"].formationIds);
    before.formationOrder.forEach((formationId) => {
      const migratedFormation = runtime.formations[formationId];
      const priorFormation = before.formations[formationId];
      if (priorChannelFormationIds.has(formationId)) {
        if (migratedFormation.locationHexKey !== "27,24"
          || !migratedFormation.name.includes("Beachhead Reserve")
          || migratedFormation.faction !== priorFormation.faction
          || computeCampaignContentHash(migratedFormation.personnel) !== computeCampaignContentHash(priorFormation.personnel)
          || computeCampaignContentHash(migratedFormation.equipment) !== computeCampaignContentHash(priorFormation.equipment)
          || computeCampaignContentHash(migratedFormation.experience) !== computeCampaignContentHash(priorFormation.experience)) {
          throw new Error(`Existing Channel formation ${formationId} did not retain identity and condition on the shore.`);
        }
      } else if (computeCampaignContentHash(migratedFormation)
        !== computeCampaignContentHash(priorFormation)) {
        throw new Error(`Existing formation ${formationId} changed during content migration.`);
      }
    });
    for (const hexKey of ["27,24", "29,25"]) {
      if (!runtime.tiles[hexKey] || runtime.tiles[hexKey].formationIds.length === 0) {
        throw new Error(`Repaired contact tile ${hexKey} lacks persistent campaign formations.`);
      }
    }
    if (runtime.tiles["20,18"].tileKey !== "playerAssaultTaskForce"
      || runtime.tiles["20,18"].formationIds.length !== 0
      || runtime.tiles["20,18"].forces.length !== 0) {
      throw new Error("Migrated campaign retained the infantry base in the English Channel.");
    }
    const normandy = runtime.compatibility.initialFronts.find((front) => front.key === "normandy_coast");
    const eastern = runtime.compatibility.initialFronts.find((front) => front.key === "eastern_flank");
    if (normandy?.edges?.[0]?.friendlyHexKey !== "27,37" || normandy.edges[0].opposingHexKey !== "28,38"
      || eastern?.edges?.[0]?.friendlyHexKey !== "30,40" || eastern.edges[0].opposingHexKey !== "29,39") {
      throw new Error("Migrated campaign did not derive both repaired exact contact fronts.");
    }
  });
});

registerTest("CAMPAIGN_SAVE_MIGRATES_CONTACT_REPAIR_TO_COHERENT_OPENING", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const contactScenario = buildContactRepairCentralChannelScenario();
  const contactHash = computeCampaignContentHash(splitLegacyCampaignScenario(contactScenario));
  const currentScenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const currentHash = computeCampaignContentHash(splitLegacyCampaignScenario(currentScenario));
  const source = new CampaignState({ saveBackend: backend });
  source.setScenario(contactScenario);
  const advanced = source.advanceCampaign({ mode: "segment" });
  if (!advanced.ok) throw new Error(advanced.error.message);
  const before = source.getRuntimeSnapshot();
  if (!before) throw new Error("Contact-repair campaign fixture did not create a runtime.");
  const priorChannelFormationIds = [...before.tiles["20,18"].formationIds];
  const priorObjective = structuredClone(before.objectives.secure_beachhead);
  await source.savePrimaryCampaign(statePersistenceRequest("2026-08-20T12:00:00.000Z"));
  let restored: CampaignState | null = null;

  await Given("a progressed save from the exact contact-repair production content", async () => {
    if (contactHash !== CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH
      || currentHash !== CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH
      || priorChannelFormationIds.length !== 2) {
      throw new Error(`Opening migration identities drifted (${contactHash} -> ${currentHash}).`);
    }
  });

  await When("the save loads against the coherent post-landing opening", async () => {
    restored = new CampaignState({ saveBackend: backend });
    restored.setScenario(currentScenario);
    const result = await restored.loadPrimaryCampaign(statePersistenceRequest("2026-08-20T12:01:00.000Z"));
    if (!result.ok) throw new Error(`Certified opening migration failed: ${result.error.message}`);
  });

  await Then("elapsed progress and formation condition survive while the water base becomes a task force", async () => {
    const runtime = restored?.getRuntimeSnapshot();
    if (!runtime || runtime.scenarioContentHash !== CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH
      || runtime.campaignId !== before.campaignId
      || runtime.revision !== before.revision
      || runtime.currentSegment !== before.currentSegment
      || computeCampaignContentHash(runtime.objectives.secure_beachhead) !== computeCampaignContentHash(priorObjective)) {
      throw new Error("Opening migration changed campaign identity, time, revision, or objective progress.");
    }
    if (runtime.tiles["20,18"].tileKey !== "playerAssaultTaskForce"
      || runtime.tiles["20,18"].formationIds.length !== 0
      || priorChannelFormationIds.some((formationId) => runtime.formations[formationId]?.locationHexKey !== "27,24")
      || priorChannelFormationIds.some((formationId) => !runtime.tiles["27,24"].formationIds.includes(formationId))) {
      throw new Error("Opening migration did not reconcile the Channel task force and shore reserve exactly once.");
    }
  });
});

registerTest("CAMPAIGN_SAVE_ADOPTS_CLOCK_AND_FLEET_CLARITY_WITHOUT_CHANGING_PROGRESS", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const priorScenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  delete priorScenario.historicalCalendar;
  const priorTaskForcePalette = Object.values(priorScenario.tilePalette).find((entry) => entry.role === "taskForce");
  if (!priorTaskForcePalette) throw new Error("Clarity migration fixture is missing its task-force palette entry.");
  priorTaskForcePalette.notes = "Allied assault fleet supporting the established lodgment";
  const priorTaskForceTile = priorScenario.tiles.find((tile) => priorScenario.tilePalette[tile.tile]?.role === "taskForce");
  if (!priorTaskForceTile) throw new Error("Clarity migration fixture is missing its Channel task force.");
  delete priorTaskForceTile.rotation;
  const priorHash = computeCampaignContentHash(splitLegacyCampaignScenario(priorScenario));
  const currentScenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const source = new CampaignState({ saveBackend: backend });
  source.setScenario(priorScenario);
  const advanced = source.advanceCampaign({ mode: "segment" });
  if (!advanced.ok) throw new Error(advanced.error.message);
  const before = source.getRuntimeSnapshot();
  if (!before) throw new Error("Clarity migration fixture did not create runtime progress.");
  await source.savePrimaryCampaign(statePersistenceRequest("2026-08-20T21:00:00.000Z"));
  let restored: CampaignState | null = null;

  await Given("a progressed save from the exact opening-repair content", () => {
    if (priorHash !== CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH) {
      throw new Error(`Prior opening identity drifted: ${priorHash}.`);
    }
  });

  await When("the save loads against the dated opening and directional fleet art", async () => {
    restored = new CampaignState({ saveBackend: backend });
    restored.setScenario(currentScenario);
    const result = await restored.loadPrimaryCampaign(statePersistenceRequest("2026-08-20T21:01:00.000Z"));
    if (!result.ok) throw new Error(`Certified clarity migration failed: ${result.error.message}`);
  });

  await Then("only authored-content identity changes while every runtime fact remains exact", () => {
    const runtime = restored?.getRuntimeSnapshot();
    if (!runtime) throw new Error("Clarity migration did not restore the campaign runtime.");
    const expected = { ...structuredClone(before), scenarioContentHash: CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH };
    if (computeCampaignContentHash(runtime) !== computeCampaignContentHash(expected)) {
      throw new Error("Historical-clock and fleet clarity migration changed campaign progress.");
    }
    if (restored?.getCurrentTimeDisplay() !== "D+1 · 7 June 1944, 03:00–06:00") {
      throw new Error(`Restored campaign did not adopt the historical clock: ${restored?.getCurrentTimeDisplay()}.`);
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
