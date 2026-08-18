/** Certifies queued tactical saves, serialized writes, and the three-slot turn-start autosave policy. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  TacticalSaveCoordinator,
  buildTacticalTurnAutosaveSlotId,
  type TacticalSaveIntent
} from "../src/game/battle/persistence/TacticalSaveCoordinator";
import type { TacticalSaveAvailability } from "../src/game/battle/persistence/BattleSaveTypes";
import {
  CAMPAIGN_LEGACY_SAVE_KEY,
  CampaignState,
  type CampaignLegacyStorage,
  type CampaignStatePersistenceRequest
} from "../src/state/CampaignState";
import {
  InMemoryCampaignSaveBackend,
  type InMemoryCampaignSaveBackendState
} from "../src/game/campaign/persistence/CampaignSaveBackend";
import {
  LEGACY_V2_ENGAGEMENT_ID,
  buildCampaignSaveCanonicalScenario,
  buildLegacyCampaignSaveV2Raw
} from "./fixtures/CampaignSaveLegacy.fixtures.js";
import { buildCompleteActiveBattleSave } from "./TacticalSaveCompleteness.test.js";

const stableAvailability: TacticalSaveAvailability = {
  stable: true,
  boundary: { kind: "playerDecision", turn: 2, phase: "playerTurn", activeFaction: "Player" },
  reason: null
};

function manualIntent(label = "Front line"): TacticalSaveIntent {
  return {
    trigger: "manual",
    slotId: "battle:campaign:manual:test",
    label,
    slotType: "manual",
    requestedAt: "2026-08-04T15:00:00.000Z",
    dedupeKey: null
  };
}

function createLegacyStorage(initial: Record<string, string> = {}): CampaignLegacyStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }
  };
}

function persistenceRequest(timestamp: string, label = "Tactical checkpoint"): CampaignStatePersistenceRequest {
  return {
    timestamp,
    label,
    playTimeSeconds: 1800,
    difficulty: "Normal",
    commanderRosterLink: "commander-save-ux",
    uiResumeContext: {
      workspace: "operations",
      selectedEntityId: null,
      mapCenter: null,
      mapZoom: 1.4
    }
  };
}

async function createCampaignWithActiveBattle(backend: InMemoryCampaignSaveBackend, focusedElementId: string) {
  const state = new CampaignState({
    saveBackend: backend,
    legacyStorage: createLegacyStorage({ [CAMPAIGN_LEGACY_SAVE_KEY]: buildLegacyCampaignSaveV2Raw() })
  });
  state.setScenario(buildCampaignSaveCanonicalScenario());
  const migration = await state.loadPrimaryCampaign(persistenceRequest("2026-08-04T16:00:00.000Z"));
  if (!migration.ok) throw new Error(`Campaign fixture migration failed: ${migration.error.message}`);
  const runtime = state.getRuntimeSnapshot();
  if (!runtime || runtime.activeEngagementId !== LEGACY_V2_ENGAGEMENT_ID) {
    throw new Error("Campaign fixture did not hydrate its active engagement.");
  }
  const battle = buildCompleteActiveBattleSave({
    campaignId: runtime.campaignId,
    campaignRevision: runtime.revision,
    scenarioKey: runtime.scenarioKey,
    engagementId: runtime.activeEngagementId,
    focusedElementId
  });
  state.setActiveBattleSave(battle);
  return { state, battle };
}

registerTest("TACTICAL_SAVE_UX_QUEUES_UNTIL_STABLE_BOUNDARY", async ({ Given, When, Then }) => {
  let availability: TacticalSaveAvailability = {
    stable: false,
    boundary: null,
    reason: "Enemy automation is still resolving."
  };
  const writes: TacticalSaveIntent[] = [];
  const coordinator = new TacticalSaveCoordinator({
    getAvailability: () => availability,
    persist: async (intent) => { writes.push(structuredClone(intent)); }
  });

  await Given("an unstable tactical resolver boundary", async () => {
    await coordinator.requestManual(manualIntent());
  });

  await When("the player request remains queued and Player control becomes stable", async () => {
    if (writes.length !== 0 || coordinator.getSnapshot().status !== "queued") {
      throw new Error("Manual save did not remain queued outside a stable boundary.");
    }
    availability = stableAvailability;
    await coordinator.flush();
  });

  await Then("one complete manual write occurs at the proven boundary", async () => {
    const snapshot = coordinator.getSnapshot();
    if (writes.length !== 1 || snapshot.status !== "saved" || snapshot.lastCompleted?.label !== "Front line") {
      throw new Error("Queued manual save did not complete exactly once at the stable boundary.");
    }
  });
});

registerTest("TACTICAL_SAVE_UX_SERIALIZES_OVERLAPPING_FLUSHES", async ({ Given, When, Then }) => {
  let releaseWrite: (() => void) | null = null;
  let writeCount = 0;
  const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const coordinator = new TacticalSaveCoordinator({
    getAvailability: () => stableAvailability,
    persist: async () => {
      writeCount += 1;
      await writeGate;
    }
  });

  await Given("one stable manual save whose storage commit is still running", async () => {
    void coordinator.requestManual(manualIntent("Serialized write"));
    await Promise.resolve();
    if (coordinator.getSnapshot().status !== "saving") throw new Error("Expected an in-flight tactical save.");
  });

  await When("multiple boundary notifications flush the coordinator concurrently", async () => {
    const overlapping = [coordinator.flush(), coordinator.flush(), coordinator.flush()];
    releaseWrite?.();
    await Promise.all(overlapping);
  });

  await Then("all callers join the same atomic write", async () => {
    if (writeCount !== 1 || coordinator.getSnapshot().status !== "saved") {
      throw new Error(`Overlapping flushes created ${writeCount} writes instead of one.`);
    }
  });
});

registerTest("TACTICAL_SAVE_UX_ROTATES_THREE_TURN_AUTOSAVES_WITH_DEDUPE", async ({ Given, When, Then }) => {
  const writes: TacticalSaveIntent[] = [];
  const coordinator = new TacticalSaveCoordinator({
    getAvailability: () => stableAvailability,
    persist: async (intent) => { writes.push(structuredClone(intent)); }
  });
  const prefix = "battle:campaign-alpha:";

  await Given("seven successive Player turn-start boundaries", async () => {
    for (let turn = 1; turn <= 7; turn += 1) {
      await coordinator.requestAutosave({
        trigger: "battle-turn-start",
        slotId: buildTacticalTurnAutosaveSlotId(prefix, turn),
        label: `Turn ${turn} start`,
        slotType: "autosave",
        requestedAt: `2026-08-04T15:0${turn}:00.000Z`,
        dedupeKey: `campaign-alpha:engagement-one:turn-start:${turn}`
      });
    }
  });

  await When("the seventh turn notification is repeated", async () => {
    await coordinator.requestAutosave({
      trigger: "battle-turn-start",
      slotId: buildTacticalTurnAutosaveSlotId(prefix, 7),
      label: "Turn 7 start",
      slotType: "autosave",
      requestedAt: "2026-08-04T15:07:01.000Z",
      dedupeKey: "campaign-alpha:engagement-one:turn-start:7"
    });
  });

  await Then("seven writes occupy exactly three fixed slot identities and the duplicate is ignored", async () => {
    const slotIds = new Set(writes.map((intent) => intent.slotId));
    if (writes.length !== 7 || slotIds.size !== 3) {
      throw new Error(`Autosave policy produced ${writes.length} writes across ${slotIds.size} slots.`);
    }
  });
});

registerTest("TACTICAL_SAVE_UX_NAMED_SLOT_RELOADS_COMPLETE_ACTIVE_BATTLE", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const source = await createCampaignWithActiveBattle(backend, "battleSaveButton");
  const slotId = "battle:fixture-campaign:manual:front-line";
  let restored: CampaignState | null = null;

  await Given("a complete campaign-bound tactical battle in a named manual slot", async () => {
    await source.state.saveCampaignSlot({
      ...persistenceRequest("2026-08-04T16:01:00.000Z", "Front line"),
      slotId,
      slotType: "manual",
      thumbnailKey: "tactical:fixture:turn-2"
    });
  });

  await When("a fresh CampaignState verifies and loads that named slot", async () => {
    restored = new CampaignState({ saveBackend: backend, legacyStorage: createLegacyStorage() });
    restored.setScenario(buildCampaignSaveCanonicalScenario());
    const load = await restored.loadCampaignSlot(slotId, persistenceRequest("2026-08-04T16:02:00.000Z"));
    if (!load.ok) throw new Error(`Named tactical load failed: ${load.error.message}`);
  });

  await Then("the exact active battle and focus context are ready for direct tactical resume", async () => {
    const active = restored?.getActiveBattleSave();
    if (!active || JSON.stringify(active) !== JSON.stringify(source.battle)) {
      throw new Error("Named tactical slot did not restore its exact complete active battle.");
    }
    if (active.tacticalUI.focusedElementId !== "battleSaveButton" || active.tacticalUI.viewport?.zoom !== 1.75) {
      throw new Error("Tactical focus or viewport resume context did not round-trip.");
    }
    const slots = await restored?.listCampaignSaveSlots();
    const slot = slots?.find((candidate) => candidate.slotId === slotId);
    if (slot?.slotType !== "manual" || !slot.display.phaseLabel.includes("Tactical turn 2")) {
      throw new Error("Named tactical slot metadata was not suitable for the Save Center.");
    }
  });
});

registerTest("TACTICAL_SAVE_UX_CORRUPTION_REQUIRES_EXPLICIT_RECOVERY", async ({ Given, When, Then }) => {
  const originalBackend = new InMemoryCampaignSaveBackend();
  const source = await createCampaignWithActiveBattle(originalBackend, "battleLoadButton");
  const slotId = "battle:fixture-campaign:manual:recovery";
  await source.state.saveCampaignSlot({
    ...persistenceRequest("2026-08-04T16:03:00.000Z", "Recovery line"),
    slotId,
    slotType: "manual"
  });
  source.state.setActiveBattleSave(buildCompleteActiveBattleSave({
    campaignId: source.battle.engagementPackage.campaignId,
    campaignRevision: source.battle.engagementPackage.campaignRevision,
    scenarioKey: source.battle.engagementPackage.scenarioKey,
    engagementId: source.battle.engagementPackage.engagementId,
    focusedElementId: "endTurn"
  }));
  await source.state.saveCampaignSlot({
    ...persistenceRequest("2026-08-04T16:04:00.000Z", "Recovery line"),
    slotId,
    slotType: "manual"
  });
  const exported = originalBackend.exportState();
  const currentId = exported.slots[slotId].currentSaveId;
  const saves = structuredClone(exported.saves) as Record<string, unknown>;
  const corrupt = structuredClone(saves[currentId]) as Record<string, unknown>;
  corrupt.checksum = "fsg-save-v1-fnv1a32-deadbeef";
  saves[currentId] = corrupt;
  const corruptState: InMemoryCampaignSaveBackendState = {
    saves,
    slots: exported.slots,
    quarantine: exported.quarantine
  };
  const recovered = new CampaignState({
    saveBackend: new InMemoryCampaignSaveBackend(corruptState),
    legacyStorage: createLegacyStorage()
  });
  recovered.setScenario(buildCampaignSaveCanonicalScenario());
  const load = await recovered.loadCampaignSlot(slotId, persistenceRequest("2026-08-04T16:05:00.000Z"));

  await Given("a corrupt newest tactical record with a verified earlier immutable checkpoint", async () => {});

  await When("the named slot is inspected before the player accepts recovery", async () => {
    if (load.ok || !load.recoveryCandidate) throw new Error("Corrupt tactical slot did not offer explicit recovery.");
  });

  await Then("nothing is applied until recovery is accepted, then the earlier battle and focus restore", async () => {
    if (recovered.getActiveBattleSave() !== null || load.ok || !load.recoveryCandidate) {
      throw new Error("Recovery candidate was silently applied before player acceptance.");
    }
    recovered.restoreCampaignRecovery(load.recoveryCandidate);
    const active = recovered.getActiveBattleSave();
    if (active?.tacticalUI.focusedElementId !== "battleLoadButton") {
      throw new Error("Explicit recovery did not restore the earlier tactical checkpoint.");
    }
    const quarantine = await recovered.listCampaignSaveQuarantine();
    if (!quarantine.some((record) => record.saveId === currentId)) {
      throw new Error("Corrupt tactical record was not retained in quarantine.");
    }
  });
});
