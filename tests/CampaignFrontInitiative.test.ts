/** FSG-CAM-014: a local battle must not cancel another sector's authored initiative. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignFrontLine, CampaignScenarioData } from "../src/core/campaignTypes";
import type { SerializedBattleState } from "../src/game/GameEngine";
import type { CampaignBattlePackage } from "../src/game/campaign/engagements/CampaignEngagementLedgerTypes";
import { createCampaignFormationBattleSeed } from "../src/game/campaign/formations/CampaignFormationBattleAdapter";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import type { CampaignBattleResultOutcome } from "../src/game/campaign/results/CampaignBattleResultTypes";
import type { CampaignRuntimeState } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import { CampaignState } from "../src/state/CampaignState";
import { repairCampaignFrontInitiativeFromControlHistory } from "../src/game/campaign/control/CampaignFrontInitiativeCompatibility";
import { deriveCampaignFrontsFromControl } from "../src/game/campaign/control/CampaignBattleControlResolver";
import { runCampaignRuntimeTransaction } from "../src/game/campaign/runtime/CampaignRuntimeTransaction";
import { splitLegacyCampaignScenario } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { computeCampaignSaveChecksum, createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { CampaignSaveRepository } from "../src/game/campaign/persistence/CampaignSaveRepository";
import type { FourStarCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveTypes";
import legacyArtifact from "./fixtures/CampaignFrontInitiative.99a3df1.json";

/** Feed every real commitment through the existing tactical adapter and result extractor. */
function terminalResult(runtime: CampaignRuntimeState, pkg: CampaignBattlePackage, outcome: CampaignBattleResultOutcome) {
  const units = pkg.formationCommitments.map((entry, index) => {
    const formation = runtime.formations[entry.formationId];
    assert.ok(formation);
    const seed = createCampaignFormationBattleSeed(formation, {
      campaignId: pkg.campaignId, engagementId: pkg.engagementId,
      sourceRevision: pkg.sourceRevision, sourceSegment: pkg.committedSegment,
      hex: { q: index, r: 0 }
    });
    assert.ok(seed, `Missing canonical tactical seed for ${entry.formationId}.`);
    return { faction: entry.faction, unit: seed.unit };
  });
  const supplyState = () => ({
    inventory: {
      ammo: { current: 0, baseline: 0, bonus: 0 }, fuel: { current: 0, baseline: 0, bonus: 0 },
      rations: { current: 0, baseline: 0, bonus: 0 }, parts: { current: 0, baseline: 0, bonus: 0 }
    },
    pending: [], productionRate: { ammo: 0, fuel: 0, rations: 0, parts: 0 }, ledger: [], lastUpdatedTurn: 35
  });
  // A terminal result with surviving opponents exercises real retreat/occupation,
  // without replacing campaign control, scheduler, or faction knowledge services.
  const tacticalState: SerializedBattleState = {
    completeStateVersion: 1, phase: "completed", activeFaction: "Player", turnNumber: 35,
    baseCamp: null,
    playerPlacements: units.filter((entry) => entry.faction === "Player").map((entry) => entry.unit),
    botPlacements: units.filter((entry) => entry.faction === "Bot").map((entry) => entry.unit),
    allyPlacements: units.filter((entry) => entry.faction === "Ally").map((entry) => entry.unit),
    reserves: [], airborneReserves: [], casualtyLog: [], battleRequisitionPointsSpent: 0,
    enemyContactStates: [], hexModifications: [],
    supplyStates: { Player: supplyState(), Bot: supplyState(), Ally: supplyState() }
  };
  return extractCampaignBattleResultPackage({ battlePackage: pkg, tacticalState, missionStatus: null, result: outcome });
}

function openingAttack(priorCounterattack = false) {
  const campaign = new CampaignState({ legacyStorage: null });
  campaign.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const first = campaign.advanceCampaign({ mode: "segment" });
  assert.ok(first.ok, first.ok ? undefined : first.error.message);
  assert.equal(first.state.currentSegment, 1);
  assert.equal(first.state.activeEngagementId, null, "The published defense must not start before segment two.");
  if (priorCounterattack) {
    const defense = campaign.advanceCampaign({ mode: "segment" });
    assert.ok(defense.ok);
    assert.ok(defense.state.activeEngagementId);
    const defensePackage = defense.state.engagementLedger[defense.state.activeEngagementId]?.package;
    assert.ok(defensePackage);
    assert.equal(defensePackage.engagement.frontKey, "caen_airborne_flank");
    campaign.applyCampaignBattleResult(terminalResult(defense.state, defensePackage, "stalemate"));
  }
  const before = structuredClone(first.state);
  const prepared = campaign.prepareCampaignFrontEngagement({
    engagementId: "fsg-014-omaha", frontKey: "omaha_gold", attacker: "Player", requestedTargetHexKey: "24,24"
  });
  assert.ok(prepared.ok, prepared.ok ? undefined : prepared.reason);
  campaign.setPendingEngagements([prepared.engagement]);
  campaign.setActiveEngagementId(prepared.engagement.id);
  const planned = campaign.getRuntimeSnapshot();
  assert.ok(planned);
  const committed = campaign.commitCampaignEngagement({
    engagementId: prepared.engagement.id, expectedRevision: planned.revision,
    selections: [{ allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 }]
  });
  assert.ok(committed.ok, committed.ok ? undefined : committed.reason);
  const runtime = campaign.getRuntimeSnapshot();
  assert.ok(runtime);
  return { campaign, before, runtime, pkg: committed.package };
}

/**
 * Full checkpoints produced by unmodified deployed 99a3df1 source, not reconstructed
 * hashes. See fixtures/CampaignFrontInitiative.99a3df1.md for reproducible provenance.
 */
function legacyCheckpoint(resolvedCounterattack = false): FourStarCampaignSaveEnvelope {
  assert.equal(legacyArtifact.sourceCommit, "99a3df14a050c461ed98b8cc8cd94ffc3e7d3ae9");
  assert.equal(legacyArtifact.sourceControlBlob, "dd8894bee35b665dd6d676ded4189ca720bb0e2a");
  const raw = structuredClone(resolvedCounterattack
    ? legacyArtifact.afterResolvedCounterattack.envelope : legacyArtifact.beforeCounterattack.envelope);
  const validation = validateCampaignSaveEnvelope(raw);
  assert.ok(validation.ok, validation.ok ? undefined : validation.error.message);
  assert.equal(front(validation.envelope.payload.runtime, "caen_airborne_flank").initiative, "Player",
    "The old producer must actually contain the unrelated-front corruption.");
  return validation.envelope;
}

const persistenceRequest = {
  timestamp: "2026-09-06T07:01:00.000Z", label: "FSG-CAM-014 compatibility proof",
  playTimeSeconds: 0, difficulty: "Normal", commanderRosterLink: null,
  uiResumeContext: { workspace: "theater" as const, selectedEntityId: null, mapCenter: null, mapZoom: null }
};

/** Only boundary-negative variants are new envelopes; positive legacy proof uses original bytes. */
function checkpoint(runtime: CampaignRuntimeState) {
  return createCampaignSaveEnvelope({
    saveId: `fsg-094-save-${runtime.revision}`, slotType: "autosave", gameMode: "campaign",
    createdAt: "2026-09-06T07:00:00.000Z", updatedAt: "2026-09-06T07:00:00.000Z",
    buildVersion: "fsg-094", contentVersion: "campaign-content-1", scenarioKey: runtime.scenarioKey,
    campaignId: runtime.campaignId, engagementId: null,
    display: { campaignTitle: "Normandy", segment: runtime.currentSegment, phaseLabel: "After action",
      lastEventSummary: null, playTimeSeconds: 0, difficulty: "Normal", result: "victory", thumbnailKey: null },
    payload: { runtime, activeBattle: null, commanderRosterLink: null, uiResumeContext: persistenceRequest.uiResumeContext }
  });
}

async function storeAndLoad(envelope: FourStarCampaignSaveEnvelope) {
  const backend = new InMemoryCampaignSaveBackend();
  const repository = new CampaignSaveRepository(backend);
  const slot = await repository.saveSlot({ slotId: "campaign-post-battle:fsg-094", label: "After Omaha", envelope });
  const state = new CampaignState({ legacyStorage: null, saveBackend: backend });
  state.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const result = await state.loadCampaignSlot(slot.slotId, persistenceRequest);
  assert.ok(result.ok, result.ok ? undefined : result.error.message);
  return { backend, repository, slot, state };
}

registerTest("FSG_CAM_094_OLD_PRODUCTION_SAVE_LOAD_REPAIRS_ONLY_VERIFIED_FRONT_AND_RESUMES_EXACT_DEFENSE", async ({ When, Then }) => {
  const envelope = legacyCheckpoint();
  const source = envelope.payload.runtime;
  assert.equal(source.currentSegment, 2, "The old save must already have missed the published defense window.");
  const sourceCopy = structuredClone(source);
  const historicalReports = JSON.stringify(source.engagementLedger);
  const definition = splitLegacyCampaignScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const repair = repairCampaignFrontInitiativeFromControlHistory(source, definition);
  assert.deepEqual(repair.repairedFrontKeys, ["caen_airborne_flank"]);
  const { backend, slot, state } = await storeAndLoad(envelope);
  await When("the actual State load adopts the original production checkpoint through the verified repair hook", () => {
    const loaded = state.getRuntimeSnapshot();
    assert.ok(loaded);
    assert.equal(front(loaded, "caen_airborne_flank").initiative, "Bot");
    assertFrontOrientation(loaded);
    assert.equal(loaded.revision, source.revision + 1);
    assert.deepEqual(loaded, repair.runtime);
    assert.deepEqual(source, sourceCopy);
    assert.equal(JSON.stringify(loaded.engagementLedger), historicalReports, "Stored historical reports must remain byte-equivalent.");
    assert.deepEqual(loaded.eventLog.slice(0, source.eventLog.length), source.eventLog);
    assert.equal(loaded.eventLog.length, source.eventLog.length + 2);
    assert.deepEqual({ ...loaded, compatibility: source.compatibility, revision: source.revision,
      eventLog: source.eventLog, lastResolution: source.lastResolution }, source);
    for (const entry of source.compatibility.initialFronts.filter(entry => entry.key !== "caen_airborne_flank")) {
      assert.deepEqual(front(loaded, entry.key), entry, "Unrelated current fronts must not change on repair.");
    }
    assert.deepEqual(backend.exportState().saves[envelope.saveId], envelope, "Loading must not overwrite the original stored checkpoint.");
    assert.deepEqual(repairCampaignFrontInitiativeFromControlHistory(loaded, definition), {
      runtime: loaded, repairedFrontKeys: []
    });
  });
  await Then("real State save and fresh State reload are idempotent, and ordinary time creates exactly the promised defense", async () => {
    const persisted = await state.saveCampaignSlot({ ...persistenceRequest, slotId: "manual:fsg-094-repaired", slotType: "manual" });
    const expectedReload = state.getRuntimeSnapshot();
    const fresh = new CampaignState({ legacyStorage: null, saveBackend: backend });
    fresh.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    const loaded = await fresh.loadCampaignSlot(persisted.slotId, persistenceRequest);
    assert.ok(loaded.ok, loaded.ok ? undefined : loaded.error.message);
    assert.deepEqual(fresh.getRuntimeSnapshot(), expectedReload, "Reload must not add a repair revision or rewrite history.");
    assert.deepEqual(backend.exportState().slots[slot.slotId], slot, "The old post-battle slot must remain unchanged.");
    const advanced = fresh.advanceCampaign({ mode: "segment" });
    assert.ok(advanced.ok);
    assert.equal(advanced.state.currentSegment, 3);
    assert.ok(advanced.state.activeEngagementId, "Loading the old save must restore the ordinary scheduled defense.");
    const pkg = advanced.state.engagementLedger[advanced.state.activeEngagementId]?.package;
    assert.ok(pkg);
    assert.equal(pkg.engagement.frontKey, "caen_airborne_flank");
    assert.equal(pkg.context.battleHexKey, "31,22");
    assert.equal(pkg.context.attacker, "Bot");
    assert.equal(pkg.context.defender, "Player");
    assert.equal(advanced.report.stopReason, "engagement");
    fresh.applyCampaignBattleResult(terminalResult(advanced.state, pkg, "defenderVictory"));
    const next = fresh.advanceCampaign({ mode: "segment" });
    assert.ok(next.ok);
    assert.deepEqual(next.state.engagementLedgerOrder.filter(id =>
      next.state.engagementLedger[id]?.package?.engagement.frontKey === "caen_airborne_flank"), [pkg.engagementId]);
  });
});

registerTest("FSG_CAM_094_COMPATIBILITY_REFUSES_CHANGED_BOUNDARY_ACTIVE_TERMINAL_AND_UNRELATED_STATES", async ({ Then }) => {
  const source = legacyCheckpoint().payload.runtime;
  const definition = splitLegacyCampaignScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const changed = runCampaignRuntimeTransaction(source, "later-front-boundary-change", candidate => {
    candidate.tiles["31,7"].controller = "Bot";
    candidate.compatibility.initialFronts.splice(0, candidate.compatibility.initialFronts.length,
      ...deriveCampaignFrontsFromControl(candidate));
    return [];
  });
  assert.ok(changed.ok, changed.ok ? undefined : `${changed.error.message}: ${JSON.stringify(changed.issues)}`);
  assert.notDeepEqual(front(changed.state, "caen_airborne_flank").edges, front(source, "caen_airborne_flank").edges);
  const metadataChanged = runCampaignRuntimeTransaction(source, "later-front-orders", candidate => {
    front(candidate, "caen_airborne_flank").modifiers = ["different-current-orders"];
    return [];
  });
  assert.ok(metadataChanged.ok, metadataChanged.ok ? undefined : metadataChanged.error.message);
  const terminal = runCampaignRuntimeTransaction(source, "terminal-negative-fixture", candidate => {
    candidate.status = "defeat";
    candidate.campaignOutcome = {
      result: "defeat", grade: "defeat", segment: candidate.currentSegment,
      phaseKey: candidate.campaignPhaseKey!, scoreEarned: 0, scoreAvailable: 0,
      completedObjectiveKeys: [], failedObjectiveKeys: [], summary: "Terminal negative fixture", sandboxContinued: false
    };
    return [];
  });
  assert.ok(terminal.ok, terminal.ok ? undefined : terminal.error.message);
  const opening = openingAttack();
  await Then("only the still-identical audited nonterminal boundary is eligible, including through actual State loading", async () => {
    for (const candidate of [changed.state, metadataChanged.state, terminal.state, opening.before]) {
      const original = structuredClone(candidate);
      assert.deepEqual(repairCampaignFrontInitiativeFromControlHistory(candidate, definition), { runtime: original, repairedFrontKeys: [] });
      assert.deepEqual(candidate, original);
      const loaded = await storeAndLoad(checkpoint(candidate));
      assert.deepEqual(loaded.state.getRuntimeSnapshot(), original);
    }
    // An active battle cannot be represented by a post-battle envelope without its tactical payload.
    // Exercise the pure boundary directly, retaining the actual committed battle package.
    const active = structuredClone(opening.runtime);
    assert.deepEqual(repairCampaignFrontInitiativeFromControlHistory(active, definition), { runtime: active, repairedFrontKeys: [] });
  });
});

registerTest("FSG_CAM_094_OLD_PRODUCTION_RESOLVED_COUNTERATTACK_SAVE_LOAD_NEVER_RECREATES_OPERATION", async ({ Then }) => {
  const envelope = legacyCheckpoint(true);
  const source = envelope.payload.runtime;
  const existing = source.engagementLedgerOrder.filter(id =>
    source.engagementLedger[id]?.package?.engagement.frontKey === "caen_airborne_flank");
  assert.equal(existing.length, 1);
  assert.equal(source.engagementLedger[existing[0]].status, "resolved");
  await Then("the actual old resolved save remains unrepaired and ordinary advance cannot reopen that operation", async () => {
    const loaded = await storeAndLoad(envelope);
    assert.deepEqual(loaded.state.getRuntimeSnapshot(), source);
    const advanced = loaded.state.advanceCampaign({ mode: "segment" });
    assert.ok(advanced.ok);
    assert.deepEqual(advanced.state.engagementLedgerOrder.filter(id =>
      advanced.state.engagementLedger[id]?.package?.engagement.frontKey === "caen_airborne_flank"), existing);
  });
});

registerTest("FSG_CAM_094_INVALID_AUDIT_HASH_OR_ENVELOPE_CHECKSUM_FAILS_REAL_LOAD_WITHOUT_ADOPTION", async ({ Then }) => {
  const envelope = legacyCheckpoint();
  const backend = new InMemoryCampaignSaveBackend();
  const slot = await new CampaignSaveRepository(backend).saveSlot({ slotId: "campaign-post-battle:fsg-094", label: "After Omaha", envelope });
  await Then("invalid evidence is rejected before repair even when its outer checksum has been recomputed", async () => {
    for (const tamperAudit of [true, false]) {
      const stored = backend.exportState();
      const raw = { ...stored, saves: { ...stored.saves } };
      const damaged = raw.saves[envelope.saveId] as FourStarCampaignSaveEnvelope;
      if (tamperAudit) {
        const ledger = damaged.payload.runtime.engagementLedger["fsg-014-omaha"];
        const report = ledger.controlReport;
        assert.ok(report);
        ledger.controlReport = { ...report, integrityHash: "invalid-control-integrity" };
        raw.saves = { ...raw.saves, [envelope.saveId]: { ...damaged, checksum: computeCampaignSaveChecksum(damaged) } };
      } else {
        raw.saves[envelope.saveId] = { ...damaged, buildVersion: "checksum-corruption" };
      }
      const damagedBackend = new InMemoryCampaignSaveBackend(raw);
      const state = new CampaignState({ legacyStorage: null, saveBackend: damagedBackend });
      state.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
      const before = state.getRuntimeSnapshot();
      const loaded = await state.loadCampaignSlot(slot.slotId, persistenceRequest);
      assert.equal(loaded.ok, false);
      if (!loaded.ok) assert.equal(loaded.error.code, tamperAudit ? "INVALID_ENVELOPE" : "CHECKSUM_MISMATCH");
      assert.deepEqual(state.getRuntimeSnapshot(), before, "Rejected historical evidence must never be adopted or repaired.");
      assert.equal((await damagedBackend.listQuarantine()).length, 1);
    }
  });
});

function front(runtime: CampaignRuntimeState, key: string): CampaignFrontLine {
  const value = runtime.compatibility.initialFronts.find((entry) => entry.key === key);
  assert.ok(value, `Missing front ${key}.`);
  return value;
}

function assertFrontOrientation(runtime: CampaignRuntimeState): void {
  const runtimeKey = (offset: string) => {
    const [q, row] = offset.split(",").map(Number);
    return `${q},${row - Math.floor(q / 2)}`;
  };
  for (const entry of runtime.compatibility.initialFronts) {
    assert.ok(entry.edges?.length);
    for (const edge of entry.edges) {
      assert.equal(runtime.tiles[runtimeKey(edge.friendlyHexKey)]?.controller, entry.initiative);
      const opposing = runtime.tiles[runtimeKey(edge.opposingHexKey)]?.controller;
      assert.ok(opposing && opposing !== "Neutral" && opposing !== entry.initiative);
    }
  }
}

registerTest("FSG_CAM_094_OMAHA_RESULT_THEN_ORDINARY_ADVANCE_OPENS_EXACT_CAEN_DEFENSE_ONCE", async ({ When, Then }) => {
  const { campaign, runtime, pkg } = openingAttack();
  await When("the real Omaha consequence completes before the published Caen counterattack window", () => {
    campaign.applyCampaignBattleResult(terminalResult(runtime, pkg, "attackerVictory"));
    const resolved = campaign.getRuntimeSnapshot();
    assert.ok(resolved);
    assert.equal(resolved.currentSegment, 1, "Tactical turns do not advance the campaign clock.");
    assert.equal(resolved.activeEngagementId, null);
    assert.equal(resolved.tiles["24,12"].controller, "Player", "The real occupation must occur.");
  });
  const second = campaign.advanceCampaign({ mode: "segment" });
  await Then("ordinary time opens one exact mandatory defense with the published formations and retains deduplication", () => {
    assert.ok(second.ok, second.ok ? undefined : second.error.message);
    assert.equal(second.state.currentSegment, 2);
    assert.ok(second.state.activeEngagementId, "Omaha victory must not suppress the scheduled Caen defense.");
    const defense = second.state.engagementLedger[second.state.activeEngagementId]?.package;
    assert.ok(defense);
    assert.equal(defense.engagement.frontKey, "caen_airborne_flank");
    assert.equal(defense.context.battleHexKey, "31,22");
    assert.equal(defense.context.attacker, "Bot");
    assert.equal(defense.context.defender, "Player");
    assert.equal(second.report.stopReason, "engagement");
    assert.equal(second.state.status, "engagement");
    const defenders = defense.formationCommitments.filter((entry) => entry.faction === "Player" && entry.role === "defender");
    const allocations = defenders.reduce<Record<string, number>>((totals, entry) => {
      totals[entry.allocationKey] = (totals[entry.allocationKey] ?? 0) + 1;
      return totals;
    }, {});
    assert.deepEqual(allocations, { airborneDetachment: 6, infantry: 9, tank: 3 });
    assert.ok(defense.formationCommitments.some((entry) => entry.faction === "Bot" && entry.role === "attacker"));
    assert.equal(new Set(defense.formationCommitments.map((entry) => entry.formationId)).size, defense.formationCommitments.length);
    campaign.applyCampaignBattleResult(terminalResult(second.state, defense, "defenderVictory"));
    const next = campaign.advanceCampaign({ mode: "segment" });
    assert.ok(next.ok, next.ok ? undefined : next.error.message);
    const opened = next.state.engagementLedgerOrder.filter((id) => {
      const engagement = next.state.engagementLedger[id]?.package?.engagement;
      return engagement?.frontKey === "caen_airborne_flank" && engagement.attacker === "Bot";
    });
    assert.deepEqual(opened, [defense.engagementId], "A completed authored counterattack must not reopen.");
  });
});

for (const outcome of ["attackerVictory", "defenderVictory"] as const) {
  registerTest(`FSG_CAM_094_${outcome.toUpperCase()}_PRESERVES_UNRELATED_FRONT_AUTHORITY`, async ({ When, Then }) => {
    const { campaign, before, runtime, pkg } = openingAttack();
    await When("a single sector's battle result passes through the real consequence transaction", () => {
      campaign.applyCampaignBattleResult(terminalResult(runtime, pkg, outcome));
    });
    await Then("unrelated named fronts retain exact identity, cadence, initiative and orientation", () => {
      const after = campaign.getRuntimeSnapshot();
      assert.ok(after);
      for (const key of ["caen_airborne_flank", "utah_cotentin", "juno_sword"]) {
        assert.deepEqual(front(after, key), front(before, key), `${key} changed because of an unrelated Omaha result.`);
      }
      assertFrontOrientation(after);
      if (outcome === "defenderVictory") {
        assert.equal(front(after, "omaha_gold").initiative, "Bot", "The affected front must still inherit its actual winner.");
      }
      const result = terminalResult(runtime, pkg, outcome);
      const frozenAfter = structuredClone(after);
      campaign.applyCampaignBattleResult(result);
      assert.deepEqual(campaign.getRuntimeSnapshot(), frozenAfter, "Reapplying the same result must not rebuild or mutate fronts twice.");
    });
  });
}
