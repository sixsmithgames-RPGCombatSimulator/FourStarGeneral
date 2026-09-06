/** FSG-CAM-012: real consequences, typed recovery, conservation, and transactional persistence. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import { CampaignState } from "../src/state/CampaignState";
import { scenarioFixture, contextFixture, tacticalStateFixture, missionStatus } from "./CampaignBattleResultExtraction.test.js";
import { createCampaignFormationBattleSeed } from "../src/game/campaign/formations/CampaignFormationBattleAdapter";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { calculateFormationReadiness } from "../src/data/unitSystem/status";
import type { CampaignFormationRecoveryOrder } from "../src/game/campaign/orders/CampaignOrderTypes";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { CampaignSaveRepository } from "../src/game/campaign/persistence/CampaignSaveRepository";
import { createCampaignSaveEnvelope, computeCampaignSaveChecksum, validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignRuntimeState } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import { resolveCampaignSegment } from "../src/game/campaign/runtime/CampaignSegmentResolver";
import { runCampaignRuntimeTransaction } from "../src/game/campaign/runtime/CampaignRuntimeTransaction";
import {
  commitCampaignOrderDrafts, createFormationRecoveryOrderDraft, revalidateCampaignOrderBook,
  createInfrastructureRepairOrderDraft
} from "../src/game/campaign/orders/CampaignOrderService";
import { previewCampaignFormationRecovery } from "../src/game/campaign/formations/CampaignFormationRecoveryService";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { campaignInfrastructureRepairCosts, refreshCampaignInfrastructureState } from "../src/game/campaign/infrastructure/CampaignInfrastructureRules";
import { retireCampaignFormation, relocateCampaignFormation } from "../src/game/campaign/formations/FormationLifecycleService";

function consequenceFixture(mode: "mixed" | "workshop" | "field" | "survived" | "noWork" = "mixed"): {
  campaign: CampaignState; formationId: string; siblingId: string; backend: InMemoryCampaignSaveBackend; scenario: CampaignScenarioData
} {
  const backend = new InMemoryCampaignSaveBackend();
  const campaign = new CampaignState({ legacyStorage: null, saveBackend: backend });
  const scenario = scenarioFixture();
  scenario.tiles[0].forces = [{ unitType: "Engineer", count: 2 }];
  campaign.setScenario(scenario);
  const context = contextFixture();
  context.availableForces = [{ hexKey: "0,0", unitType: "Engineer", count: 2 }];
  context.allocationCaps = { engineer: 2 };
  campaign.setPendingEngagements([{
    id: context.engagementId, frontKey: context.frontKey, objectiveKey: null,
    attacker: "Player", defender: "Bot", hexKeys: [context.battleHexKey], tags: [], context
  }]);
  campaign.setActiveEngagementId(context.engagementId);
  const committed = campaign.commitCampaignEngagement({
    engagementId: context.engagementId, expectedRevision: campaign.getRuntimeSnapshot()!.revision,
    selections: [{ allocationKey: "engineer", category: "units", quantity: 2, unitRpCost: 50 }]
  });
  if (!committed.ok) throw new Error(committed.reason);
  const runtime = campaign.getRuntimeSnapshot()!;
  const pkg = committed.package;
  const tactical = tacticalStateFixture(runtime, pkg);
  const casualty = tactical.playerPlacements[0];
  assert.equal(casualty.type, "Engineer");
  assert.ok(casualty.status);
  assert.equal(Object.values(casualty.status.personnel)[0].fit + 4, 160);
  Object.assign(Object.values(casualty.status.personnel)[0], { fit: 0, injured: 100, wounded: 35, severelyWounded: 15, killed: 10 });
  Object.assign(Object.values(casualty.status.equipment)[0], { operational: 7, damaged: 2, disabled: 1, destroyed: 2 });
  if (mode === "workshop" || mode === "field") {
    Object.assign(Object.values(casualty.status.personnel)[0], { fit: 148, injured: 2, wounded: 0, severelyWounded: 0, killed: 10 });
    Object.assign(Object.values(casualty.status.equipment)[0], mode === "workshop"
      ? { operational: 9, damaged: 0, disabled: 1, destroyed: 2 }
      : { operational: 9, damaged: 1, disabled: 0, destroyed: 2 });
  }
  if (mode === "noWork") {
    Object.assign(Object.values(casualty.status.personnel)[0], { fit: 150, injured: 0, wounded: 0, severelyWounded: 0, killed: 10 });
    Object.assign(Object.values(casualty.status.equipment)[0], { operational: 10, damaged: 0, disabled: 0, destroyed: 2 });
  }
  casualty.strength = 0;
  tactical.playerPlacements = [];
  tactical.casualtyLog!.push({
    unit: casualty, definition: structuredClone(unitTypes[casualty.type]),
    unitKey: casualty.formationKey ?? null, label: "5th Engineer recovery fixture", recordedAt: "battle:4:2"
  });
  if (mode === "survived") {
    tactical.casualtyLog!.pop();
    tactical.playerPlacements.push(casualty);
  }
  const formationId = casualty.campaignProvenance!.formationId;
  const siblingId = pkg.formationCommitments.find((entry) => entry.role === "attacker" && entry.formationId !== formationId)!.formationId;
  const sibling = createCampaignFormationBattleSeed(runtime.formations[siblingId], {
    campaignId: pkg.campaignId, engagementId: pkg.engagementId,
    sourceRevision: pkg.sourceRevision, sourceSegment: pkg.committedSegment, hex: { q: 0, r: 0 }
  });
  assert.ok(sibling);
  tactical.playerPlacements.push(sibling.unit);
  const result = extractCampaignBattleResultPackage({ battlePackage: pkg, tacticalState: tactical, missionStatus, result: "attackerVictory" });
  assert.equal(campaign.applyCampaignBattleResult(result).applied, true);
  assert.equal(campaign.getRuntimeSnapshot()!.formations[formationId].status, mode === "survived" ? "ready" : "shattered");
  return { campaign, formationId, siblingId, backend, scenario };
}

function committedRecovery(campaign: CampaignState, formationId: string): CampaignFormationRecoveryOrder {
  const preview = campaign.getCampaignFormationRecoveryPreview(formationId);
  assert.equal(preview.availability, "available", preview.reason ?? "No recovery quote");
  const draft = campaign.createFormationRecoveryDraft({ formationId, expectedRevision: preview.revision });
  if (!draft.ok) throw new Error(draft.reason);
  const commit = campaign.commitCampaignOrders([draft.order.id]);
  if (!commit.ok) throw new Error(commit.reason);
  const order = campaign.getCampaignOrders().find((entry) => entry.id === draft.order.id);
  assert.ok(order?.kind === "formationRecovery");
  return order;
}

function advance(campaign: CampaignState): void {
  const result = campaign.advanceSegment();
  if (!result.ok) throw new Error(`${result.error.message}: ${JSON.stringify(result.issues)}`);
}

registerTest("FSG_CAM_093_DOMAIN_REAL_CONSEQUENCE_HAS_RECOVERY_PIPELINE", async ({ Given, When, Then }) => {
  const { campaign, formationId, siblingId } = consequenceFixture();
  const before = campaign.getRuntimeSnapshot()!;
  const original = before.formations[formationId];
  let order: CampaignFormationRecoveryOrder;
  await Given("a committed Engineer returns through real extraction and consequences as shattered with 150 survivors and ten killed", () => {
    assert.equal(Object.values(campaign.getRuntimeSnapshot()!.formations[formationId].personnel).reduce((sum, pool) => sum + pool.killed, 0), 10);
  });
  await When("headquarters quotes, drafts, commits and resolves the real typed order", () => {
    const preview = campaign.getCampaignFormationRecoveryPreview(formationId);
    assert.equal(preview.availability, "available", preview.reason ?? "No quote");
    assert.ok(preview.quote);
    assert.equal(preview.quote.medicalWorkPoints, 295);
    assert.equal(preview.quote.equipmentWorkPoints, 9);
    assert.equal(preview.quote.suppliesCost, 92);
    assert.equal(preview.quote.personnelToFit, 150);
    assert.equal(preview.quote.equipmentToOperational, 3);
    assert.equal(preview.quote.permanentPersonnelLosses, 10);
    assert.equal(preview.quote.permanentEquipmentLosses, 2);
    for (let i = 0; i < 3; i++) assert.deepEqual(campaign.getCampaignFormationRecoveryPreview(formationId), preview);
    assert.equal(computeCampaignContentHash(campaign.getRuntimeSnapshot()), computeCampaignContentHash(before));
    order = committedRecovery(campaign, formationId);
    const committed = campaign.getRuntimeSnapshot()!;
    assert.equal(committed.factions.Player.economy.supplies, before.factions.Player.economy.supplies - 92);
    assert.deepEqual(committed.formations[formationId].personnel, original.personnel);
    assert.deepEqual(committed.formations[formationId].equipment, original.equipment);
    assert.equal(committed.formations[formationId].status, "refitting");
    assert.equal(committed.formations[formationId].currentOrderId, order.id);
    assert.equal(createCampaignFormationBattleSeed(committed.formations[formationId], {
      campaignId: committed.campaignId, engagementId: "no-refit-battle", sourceRevision: committed.revision,
      sourceSegment: committed.currentSegment, hex: { q: 0, r: 0 }
    }), null);
    for (let segment = 1; segment <= order.payload.durationSegments; segment++) {
      advance(campaign);
      const current = campaign.getRuntimeSnapshot()!;
      const activeOrder = current.orders[order.id];
      assert.ok(activeOrder.kind === "formationRecovery");
      assert.equal(activeOrder.payload.progress.completedSegments, segment);
      assert.equal(current.formations[formationId].status, segment === order.payload.durationSegments ? "ready" : "refitting");
      assert.equal(activeOrder.status, segment === order.payload.durationSegments ? "completed" : "executing");
    }
  });
  await Then("the same ID becomes eligible with survivors restored, permanent losses conserved and its sibling unchanged", () => {
    const after = campaign.getRuntimeSnapshot()!;
    const recovered = after.formations[formationId];
    assert.deepEqual(after.formationOrder, before.formationOrder);
    assert.deepEqual(recovered.origin, original.origin);
    assert.deepEqual(recovered.experience, original.experience);
    assert.deepEqual(recovered.honors, original.honors);
    assert.equal(recovered.fatigue, original.fatigue);
    assert.equal(recovered.cohesion, original.cohesion);
    assert.equal(recovered.locationHexKey, original.locationHexKey);
    assert.equal(recovered.currentOrderId, null);
    assert.equal(Object.values(recovered.personnel).reduce((sum, pool) => sum + pool.fit, 0), 150);
    assert.equal(Object.values(recovered.personnel).reduce((sum, pool) => sum + pool.killed, 0), 10);
    assert.equal(Object.values(recovered.equipment).reduce((sum, pool) => sum + pool.operational, 0), 10);
    assert.equal(Object.values(recovered.equipment).reduce((sum, pool) => sum + pool.destroyed, 0), 2);
    assert.equal(recovered.readiness, order!.payload.projectedReadiness);
    assert.equal(recovered.readiness, calculateFormationReadiness({ personnel: recovered.personnel, equipment: recovered.equipment,
      readinessModel: recovered.readinessModel, ammo: {}, suppression: 0 }, 0).readiness);
    assert.deepEqual(recovered.battleHistory.slice(0, -1), original.battleHistory);
    assert.equal(recovered.battleHistory[recovered.battleHistory.length - 1]?.type, "refit");
    assert.deepEqual(after.formations[siblingId], before.formations[siblingId]);
    const history = structuredClone(recovered.battleHistory);
    advance(campaign);
    assert.deepEqual(campaign.getRuntimeSnapshot()!.formations[formationId].battleHistory, history);
    assert.equal(campaign.getCampaignFormationRecoveryPreview(formationId).availability, "blocked");
  });
});

registerTest("FSG_CAM_093_DOMAIN_CANCEL_BEFORE_WORK_REFUNDS_ONCE", async ({ When, Then }) => {
  const { campaign, formationId } = consequenceFixture();
  const before = campaign.getRuntimeSnapshot()!;
  const order = committedRecovery(campaign, formationId);
  await When("the committed recovery is cancelled before any segment executes", () => {
    assert.equal(campaign.previewCampaignOrderCancellation(order.id).canCancel, true);
    assert.equal(campaign.cancelCampaignOrder(order.id).ok, true);
  });
  await Then("all pools, posture and stock return exactly, and a second cancellation cannot refund again", () => {
    const after = campaign.getRuntimeSnapshot()!;
    assert.deepEqual(after.formations[formationId], before.formations[formationId]);
    assert.deepEqual(after.factions, before.factions);
    assert.equal(after.orders[order.id].status, "cancelled");
    order.reservationIds.forEach((id) => assert.equal(after.reservations[id].status, "released"));
    assert.equal(campaign.cancelCampaignOrder(order.id).ok, false);
    assert.equal(computeCampaignContentHash(campaign.getRuntimeSnapshot()), computeCampaignContentHash(after));
    assert.equal(campaign.getCampaignFormationRecoveryPreview(formationId).availability, "available");
  });
});

registerTest("FSG_CAM_093_DOMAIN_STALE_QUOTES_AND_ATOMIC_NEGATIVES", async ({ When, Then }) => {
  const { campaign, formationId } = consequenceFixture();
  const stale = campaign.getCampaignFormationRecoveryPreview(formationId);
  const unrelated = campaign.createProductionDraft({ supplies: 25, fuel: 25, ammo: 25, manpower: 25 });
  if (!unrelated.ok) throw new Error(unrelated.reason);
  const afterRevision = computeCampaignContentHash(campaign.getRuntimeSnapshot());
  await When("a stale UI quote is submitted after another actual draft changes the revision", () => {
    assert.equal(campaign.createFormationRecoveryDraft({ formationId, expectedRevision: stale.revision }).ok, false);
    assert.equal(computeCampaignContentHash(campaign.getRuntimeSnapshot()), afterRevision);
  });
  await Then("a current quote works, while condition drift and post-debit exceptions roll back the entire portfolio", () => {
    const preview = campaign.getCampaignFormationRecoveryPreview(formationId);
    const result = campaign.createFormationRecoveryDraft({ formationId, expectedRevision: preview.revision });
    if (!result.ok) throw new Error(result.reason);
    const source = campaign.getRuntimeSnapshot()!;
    const definition = campaign.getScenarioDefinitionSnapshot()!;
    for (const failure of ["condition", "resources", "after-debit"] as const) {
      let reachedDebit = false;
      const transaction = runCampaignRuntimeTransaction(source, `test:recovery-${failure}`, (candidate) => {
        if (failure === "condition") {
          const pool = Object.values(candidate.formations[formationId].personnel)[0];
          pool.injured -= 1;
          pool.wounded += 1;
        }
        if (failure === "resources") candidate.factions.Player.economy.supplies = 0;
        commitCampaignOrderDrafts(candidate, [unrelated.order.id, result.order.id], definition);
        reachedDebit = true;
        throw new Error("Injected failure after the actual typed commit/debit.");
      });
      assert.equal(transaction.ok, false, failure);
      assert.equal(reachedDebit, failure === "after-debit", `${failure} must fail at its intended boundary`);
      assert.deepEqual(transaction.state, source, failure);
    }
    assert.equal(campaign.commitCampaignOrders([result.order.id]).ok, true);
    const committed = campaign.getRuntimeSnapshot()!;
    const rejected = resolveCampaignSegment(committed, definition, { afterPhase: (phase) => {
      if (phase === "consequences") throw new Error("Injected failure after actual recovery work.");
    } });
    assert.equal(rejected.ok, false);
    assert.deepEqual(rejected.state, committed);
    advance(campaign);
    assert.equal(campaign.previewCampaignOrderCancellation(result.order.id).canCancel, false);
    assert.equal(campaign.cancelCampaignOrder(result.order.id).ok, false);
  });
});

registerTest("FSG_CAM_093_DOMAIN_FACTION_RESOURCE_AND_IDENTITY_BLOCKERS", async ({ Then }) => {
  const { campaign, formationId, siblingId } = consequenceFixture();
  const source = campaign.getRuntimeSnapshot()!;
  const definition = campaign.getScenarioDefinitionSnapshot()!;
  await Then("unavailable, foreign, unsupplied and unfunded formations receive pure, actionable blockers", () => {
    assert.equal(campaign.getCampaignFormationRecoveryPreview(formationId, "Bot").quote, null);
    assert.equal(campaign.getCampaignFormationRecoveryPreview("missing").availability, "blocked");
    assert.equal(campaign.getCampaignFormationRecoveryPreview(siblingId).availability, "blocked");
    const poor = structuredClone(source);
    poor.factions.Player.economy.supplies = 0;
    const quote = previewCampaignFormationRecovery(poor, definition, formationId, "Player");
    assert.equal(quote.reasonCode, "ORDER_RESOURCE_INSUFFICIENT");
    assert.equal(quote.quote?.suppliesCost, 92);
    for (const status of ["destroyed", "captured", "isolated", "inTransit", "committed", "unavailable"] as const) {
      const unavailable = structuredClone(source);
      unavailable.formations[formationId].status = status;
      const result = previewCampaignFormationRecovery(unavailable, definition, formationId, "Player");
      assert.equal(result.availability, "blocked", status);
      assert.ok(result.reason && result.correctiveAction);
    }
    const noSupply = structuredClone(source);
    noSupply.tiles[source.formations[formationId].locationHexKey!].controller = "Neutral";
    assert.equal(previewCampaignFormationRecovery(noSupply, definition, formationId, "Player").reasonCode, "ORDER_SOURCE_INVALID");
    assert.deepEqual(campaign.getRuntimeSnapshot(), source);
    const draft = campaign.createFormationRecoveryDraft({ formationId, expectedRevision: source.revision });
    if (!draft.ok) throw new Error(draft.reason);
    assert.equal(campaign.getCampaignFormationRecoveryPreview(formationId).reasonCode, "ORDER_RESERVATION_CONFLICT");
    assert.equal(campaign.createFormationRecoveryDraft({ formationId, expectedRevision: campaign.getRuntimeSnapshot()!.revision }).ok, false);
  });
});

registerTest("FSG_CAM_093_DOMAIN_EXACT_ID_CONFLICTS_WITH_ENGINEERING_AND_MOVEMENT", async ({ Then }) => {
  const { campaign, formationId } = consequenceFixture("survived");
  const source = campaign.getRuntimeSnapshot()!;
  const definition = campaign.getScenarioDefinitionSnapshot()!;
  const target = source.formations[formationId].locationHexKey!;
  const tile = source.tiles[target];
  assert.ok(tile.infrastructure);
  tile.infrastructure.integrity = tile.infrastructure.maxIntegrity - 8;
  refreshCampaignInfrastructureState(tile.infrastructure, source.currentSegment);
  const [q, r] = target.split(",").map(Number);
  const offset = `${q},${r + Math.floor(q / 2)}`;
  const quote = previewCampaignFormationRecovery(source, definition, formationId, "Player").quote!;
  await Then("either draft priority rejects the later recovery/engineering claim on the same real formation", () => {
    for (const recoveryFirst of [false, true]) {
      const candidate = structuredClone(source);
      const recover = (): string => createFormationRecoveryOrderDraft(candidate, "Player", quote, definition).id;
      const repair = (): string => createInfrastructureRepairOrderDraft(candidate, { faction: "Player", payload: {
        targetOffsetHexKey: offset, targetRuntimeHexKey: target, role: tile.infrastructure!.role,
        engineerFormationId: formationId, sourceIntegrity: tile.infrastructure!.integrity,
        targetIntegrity: tile.infrastructure!.maxIntegrity, repairPoints: 8, repairRate: 8, durationSegments: 1,
        startSegment: source.currentSegment + 1, completeSegment: source.currentSegment + 1,
        suppliesCost: campaignInfrastructureRepairCosts(8).supplies,
        manpowerCost: campaignInfrastructureRepairCosts(8).manpower
      } }).id;
      const first = recoveryFirst ? recover() : repair();
      const second = recoveryFirst ? repair() : recover();
      revalidateCampaignOrderBook(candidate, definition);
      assert.equal(candidate.orders[first].validation.valid, true);
      assert.equal(candidate.orders[second].validation.issues[0]?.code, "ORDER_RESERVATION_CONFLICT");
      const transaction = runCampaignRuntimeTransaction(candidate, "test:conflicting-portfolio", (draft) => {
        commitCampaignOrderDrafts(draft, [first, second], definition);
        return [];
      });
      assert.equal(transaction.ok, false);
      assert.deepEqual(transaction.state, candidate);
    }
    committedRecovery(campaign, formationId);
    const state = campaign.getRuntimeSnapshot()!;
    const other = state.tileOrder.find((key) => key !== target && state.tiles[key].controller === "Player")!;
    const [oq, or] = other.split(",").map(Number);
    assert.equal(campaign.createRedeployDraft(offset, `${oq},${or + Math.floor(oq / 2)}`, [{ unitType: "Engineer", count: 1 }], "foot", undefined, [formationId]).ok, false);
  });
});

const saveRequest = {
  timestamp: "2026-09-06T12:00:00.000Z", label: "Recovery test checkpoint", playTimeSeconds: 0,
  difficulty: "standard", commanderRosterLink: null,
  uiResumeContext: { workspace: "formations" as const, selectedEntityId: null, mapCenter: null, mapZoom: null }
};

function envelopeFor(runtime: CampaignRuntimeState): ReturnType<typeof createCampaignSaveEnvelope> {
  return createCampaignSaveEnvelope({
    saveId: `recovery-test:${runtime.revision}`, slotType: "checkpoint", gameMode: "campaign",
    createdAt: saveRequest.timestamp, updatedAt: saveRequest.timestamp, buildVersion: "test", contentVersion: "test",
    scenarioKey: runtime.scenarioKey, campaignId: runtime.campaignId, engagementId: null,
    display: { campaignTitle: "Recovery test", segment: runtime.currentSegment, phaseLabel: "Recovery",
      lastEventSummary: null, playTimeSeconds: 0, difficulty: "standard", result: null, thumbnailKey: null },
    payload: { runtime, activeBattle: null, commanderRosterLink: null, uiResumeContext: saveRequest.uiResumeContext }
  });
}

function roundTrip(runtime: CampaignRuntimeState): CampaignRuntimeState {
  const validation = validateCampaignSaveEnvelope(JSON.parse(JSON.stringify(envelopeFor(runtime))));
  if (!validation.ok) throw validation.error;
  assert.equal(computeCampaignContentHash(validation.envelope.payload.runtime), computeCampaignContentHash(runtime));
  return validation.envelope.payload.runtime;
}

registerTest("FSG_CAM_093_DOMAIN_SERIALIZED_RESUME_PRESERVES_WORK_AND_STOCK", async ({ When, Then }) => {
  const fixture = consequenceFixture();
  const { campaign, formationId, backend, scenario } = fixture;
  const order = committedRecovery(campaign, formationId);
  await When("committed, partly executed and completed orders cross real named-slot save/load boundaries", async () => {
    for (const boundary of [0, 3, order.payload.durationSegments]) {
      while (campaign.getRuntimeSnapshot()!.currentSegment < order.issuedSegment + boundary) advance(campaign);
      const original = campaign.getRuntimeSnapshot()!;
      await campaign.saveCampaignSlot({ ...saveRequest, slotId: `recovery:${boundary}`, slotType: "checkpoint" });
      const serialized = JSON.stringify(backend.exportState());
      const restored = new CampaignState({ legacyStorage: null, saveBackend: new InMemoryCampaignSaveBackend(JSON.parse(serialized)) });
      restored.setScenario(structuredClone(scenario));
      const loaded = await restored.loadCampaignSlot(`recovery:${boundary}`, saveRequest);
      if (!loaded.ok) throw new Error(loaded.error.message);
      assert.equal(computeCampaignContentHash(restored.getRuntimeSnapshot()), computeCampaignContentHash(original));
      assert.deepEqual(restored.getRuntimeSnapshot()!.orders, original.orders);
      assert.deepEqual(restored.getRuntimeSnapshot()!.formations, original.formations);
      const retained = computeCampaignContentHash(restored.getRuntimeSnapshot());
      for (let read = 0; read < 3; read++) {
        restored.getCampaignOrders();
        restored.getCampaignFormationRecoveryPreview(formationId);
      }
      assert.equal(computeCampaignContentHash(restored.getRuntimeSnapshot()), retained);
      const left = campaign.advanceSegment();
      const right = restored.advanceSegment();
      assert.equal(left.ok, true);
      assert.equal(right.ok, true);
      assert.equal(computeCampaignContentHash(right.state), computeCampaignContentHash(left.state));
    }
  });
  await Then("the saved order still owns one debit, one completion and one exact formation identity", () => {
    const after = campaign.getRuntimeSnapshot()!;
    assert.equal(after.orders[order.id].status, "completed");
    assert.equal(after.formations[formationId].battleHistory.filter((entry) => entry.type === "refit").length, 1);
    assert.equal(Object.keys(backend.exportState().slots).some((key) => key === "campaign-primary"), false);
  });
});

registerTest("FSG_CAM_093_DOMAIN_INTERRUPTED_WORKSHOP_RETAINS_TIME_AND_CONTINUES_WITHOUT_RECHARGING_DONE_WORK", async ({ When, Then }) => {
  const { campaign, formationId } = consequenceFixture("workshop");
  const order = committedRecovery(campaign, formationId);
  const definition = campaign.getScenarioDefinitionSnapshot()!;
  assert.equal(order.payload.durationSegments, 8);
  assert.equal(order.payload.suppliesCost, 4);
  advance(campaign);
  const started = campaign.getRuntimeSnapshot()!;
  const beforeInterruptionStock = started.factions.Player.economy.supplies;
  let interrupted: CampaignRuntimeState;
  await When("the supply connection is cut after all pool work finishes but before the eight-segment minimum", () => {
    const cut = runCampaignRuntimeTransaction(started, "test:cut-recovery-supply", (candidate) => {
      candidate.tiles[order.payload.sourceRuntimeHexKey].controller = "Neutral";
      return [];
    });
    if (!cut.ok) throw cut.error;
    const step = resolveCampaignSegment(cut.state, definition);
    if (!step.ok) throw new Error(`${step.error.message}: ${JSON.stringify(step.issues)}`);
    interrupted = step.state;
    assert.equal(interrupted.orders[order.id].status, "blocked");
    assert.equal(interrupted.formations[formationId].status, "shattered");
    assert.equal(interrupted.formations[formationId].currentOrderId, null);
    assert.equal(interrupted.factions.Player.economy.supplies, beforeInterruptionStock);
    const blocked = interrupted.orders[order.id] as CampaignFormationRecoveryOrder;
    assert.equal(blocked.payload.progress.personnelReturnedToFit, 2);
    assert.equal(blocked.payload.progress.equipmentReturnedToOperational, 1);
    assert.equal(blocked.payload.progress.completedSegments, 1);
  });
  await Then("restoring supply enables a zero-supply continuation for exactly seven remaining segments", () => {
    const reconnect = runCampaignRuntimeTransaction(interrupted!, "test:restore-recovery-supply", (candidate) => {
      candidate.tiles[order.payload.sourceRuntimeHexKey].controller = "Player";
      return [];
    });
    if (!reconnect.ok) throw reconnect.error;
    const preview = previewCampaignFormationRecovery(reconnect.state, definition, formationId, "Player");
    assert.equal(preview.availability, "available", preview.reason ?? "No continuation quote");
    assert.ok(preview.quote);
    assert.equal(preview.quote.resumedFromOrderId, order.id);
    assert.equal(preview.quote.durationSegments, 7);
    assert.equal(preview.quote.suppliesCost, 0);
    assert.equal(preview.quote.medicalWorkPoints + preview.quote.equipmentWorkPoints, 0);
    let resumedId = "";
    const resume = runCampaignRuntimeTransaction(reconnect.state, "test:continue-recovery", (candidate) => {
      resumedId = createFormationRecoveryOrderDraft(candidate, "Player", preview.quote!, definition).id;
      commitCampaignOrderDrafts(candidate, [resumedId], definition);
      return [];
    });
    if (!resume.ok) throw new Error(`${resume.error.message}: ${JSON.stringify(resume.issues)}`);
    assert.equal(resume.state.factions.Player.economy.supplies, beforeInterruptionStock);
    let state = roundTrip(resume.state);
    for (let step = 1; step <= 2; step++) {
      const result = resolveCampaignSegment(state, definition);
      if (!result.ok) throw new Error(`${result.error.message}: ${JSON.stringify(result.issues)}`);
      state = result.state;
      assert.equal(state.formations[formationId].status, "refitting");
    }
    const secondCut = runCampaignRuntimeTransaction(state, "test:second-supply-cut", (candidate) => {
      candidate.tiles[order.payload.sourceRuntimeHexKey].controller = "Neutral";
      return [];
    });
    if (!secondCut.ok) throw secondCut.error;
    const stopped = resolveCampaignSegment(secondCut.state, definition);
    if (!stopped.ok) throw stopped.error;
    state = roundTrip(stopped.state);
    const secondRestore = runCampaignRuntimeTransaction(state, "test:second-supply-restored", (candidate) => {
      candidate.tiles[order.payload.sourceRuntimeHexKey].controller = "Player";
      return [];
    });
    if (!secondRestore.ok) throw secondRestore.error;
    state = roundTrip(secondRestore.state);
    const nextQuote = previewCampaignFormationRecovery(state, definition, formationId, "Player").quote;
    assert.ok(nextQuote);
    assert.equal(nextQuote.resumedFromOrderId, resumedId);
    assert.equal(nextQuote.durationSegments, 5);
    assert.equal(nextQuote.suppliesCost, 0);
    const staleAncestor = structuredClone(state);
    const ancestorOrder = createFormationRecoveryOrderDraft(staleAncestor, "Player", { ...nextQuote, resumedFromOrderId: order.id }, definition);
    assert.equal(ancestorOrder.validation.valid, false);
    const duplicate = structuredClone(state);
    createFormationRecoveryOrderDraft(duplicate, "Player", nextQuote, definition);
    const duplicateOrder = createFormationRecoveryOrderDraft(duplicate, "Player", nextQuote, definition);
    assert.equal(duplicateOrder.validation.issues[0]?.code, "ORDER_RESERVATION_CONFLICT");
    const restarted = runCampaignRuntimeTransaction(state, "test:continue-second-interruption", (candidate) => {
      resumedId = createFormationRecoveryOrderDraft(candidate, "Player", nextQuote, definition).id;
      commitCampaignOrderDrafts(candidate, [resumedId], definition);
      return [];
    });
    if (!restarted.ok) throw restarted.error;
    state = roundTrip(restarted.state);
    for (let step = 1; step <= 5; step++) {
      const result = resolveCampaignSegment(state, definition);
      if (!result.ok) throw result.error;
      state = result.state;
      assert.equal(state.formations[formationId].status, step === 5 ? "ready" : "refitting");
    }
    assert.equal(state.orders[resumedId].status, "completed");
    assert.equal(Object.values(state.formations[formationId].personnel).reduce((sum, pool) => sum + pool.killed, 0), 10);
    assert.equal(Object.values(state.formations[formationId].equipment).reduce((sum, pool) => sum + pool.destroyed, 0), 2);
    assert.equal(state.formations[formationId].battleHistory.filter((entry) => entry.type === "refit").length, 1);
    assert.equal(previewCampaignFormationRecovery(state, definition, formationId, "Player").availability, "blocked");
  });
});

registerTest("FSG_CAM_093_DOMAIN_MALFORMED_RECOVERY_SAVE_IS_REJECTED", async ({ Then }) => {
  const { campaign, formationId } = consequenceFixture();
  const order = committedRecovery(campaign, formationId);
  const source = campaign.getRuntimeSnapshot()!;
  await Then("unsupported policy, altered costs, timing, claims and fabricated progress fail runtime/save validation", () => {
    const corruptions: Array<(raw: Record<string, unknown>) => void> = [
      (raw) => { raw.policyVersion = 2; }, (raw) => { raw.suppliesCost = 0; },
      (raw) => { raw.durationSegments = 0; }, (raw) => { raw.startSegment = source.currentSegment; },
      (raw) => { raw.formationId = "another-id"; }, (raw) => { raw.minimumDurationSegments = 0; },
      (raw) => { raw.progress = { completedSegments: 1, lastProcessedSegment: null }; }
    ];
    for (const corrupt of corruptions) {
      const damaged = structuredClone(source);
      corrupt(damaged.orders[order.id].payload as unknown as Record<string, unknown>);
      assert.equal(validateCampaignRuntimeState(damaged).some((issue) => issue.code === "ORDER_INVALID"), true);
      assert.equal(resolveCampaignSegment(damaged, campaign.getScenarioDefinitionSnapshot()!).ok, false);
      const envelope = envelopeFor(source);
      corrupt(envelope.payload.runtime.orders[order.id].payload as unknown as Record<string, unknown>);
      const tampered = { ...envelope, checksum: computeCampaignSaveChecksum(envelope) };
      assert.equal(validateCampaignSaveEnvelope(tampered).ok, false);
    }
    assert.deepEqual(campaign.getRuntimeSnapshot(), source);
  });
});

registerTest("FSG_CAM_093_DOMAIN_FIELD_MINIMUM_AND_ZERO_WORK_WITHOUT_LINK", async ({ Then }) => {
  await Then("field treatment finishes in one segment, while a zero-work shattered casualty cannot invent workshop service time", () => {
    const field = consequenceFixture("field");
    const order = committedRecovery(field.campaign, field.formationId);
    assert.equal(order.payload.durationSegments, 1);
    assert.equal(order.payload.suppliesCost, 2);
    advance(field.campaign);
    assert.equal(field.campaign.getRuntimeSnapshot()!.formations[field.formationId].status, "ready");
    const noWork = consequenceFixture("noWork");
    const preview = noWork.campaign.getCampaignFormationRecoveryPreview(noWork.formationId);
    assert.equal(preview.availability, "blocked");
    assert.equal(preview.quote, null);
    assert.match(preview.reason!, /no surviving casualties/i);
  });
});

registerTest("FSG_CAM_093_DOMAIN_INTERRUPTED_REMAINING_WORK_HAS_EXACT_NEW_CHARGE", async ({ Then }) => {
  const { campaign, formationId } = consequenceFixture();
  const order = committedRecovery(campaign, formationId);
  advance(campaign);
  const started = campaign.getRuntimeSnapshot()!;
  const definition = campaign.getScenarioDefinitionSnapshot()!;
  await Then("an interrupted paid order retains work and losses, with a new charge only for remaining treatment", () => {
    const cut = runCampaignRuntimeTransaction(started, "test:interrupt-partial-work", (candidate) => {
      candidate.tiles[order.payload.sourceRuntimeHexKey].controller = "Neutral";
      return [];
    });
    if (!cut.ok) throw cut.error;
    const blocked = resolveCampaignSegment(cut.state, definition);
    if (!blocked.ok) throw blocked.error;
    assert.equal(blocked.state.factions.Player.economy.supplies, started.factions.Player.economy.supplies);
    const restored = runCampaignRuntimeTransaction(blocked.state, "test:restore-partial-work-supply", (candidate) => {
      candidate.tiles[order.payload.sourceRuntimeHexKey].controller = "Player";
      return [];
    });
    if (!restored.ok) throw restored.error;
    const quote = previewCampaignFormationRecovery(restored.state, definition, formationId, "Player").quote;
    assert.ok(quote);
    assert.equal(quote.resumedFromOrderId, order.id);
    assert.equal(quote.medicalWorkPoints, 283);
    assert.equal(quote.equipmentWorkPoints, 2);
    assert.equal(quote.suppliesCost, 86);
    assert.equal(quote.minimumDurationSegments, 7);
    assert.equal(quote.permanentPersonnelLosses, 10);
    assert.equal(quote.permanentEquipmentLosses, 2);
    const continued = runCampaignRuntimeTransaction(restored.state, "test:recommit-remaining-work", (candidate) => {
      const draft = createFormationRecoveryOrderDraft(candidate, "Player", quote, definition);
      commitCampaignOrderDrafts(candidate, [draft.id], definition);
      return [];
    });
    if (!continued.ok) throw continued.error;
    assert.equal(continued.state.factions.Player.economy.supplies, started.factions.Player.economy.supplies - 86);
    assert.deepEqual(continued.state.formations[formationId].personnel, started.formations[formationId].personnel);
    assert.deepEqual(continued.state.formations[formationId].equipment, started.formations[formationId].equipment);
  });
});

registerTest("FSG_CAM_093_DOMAIN_UNCOMMITTED_DRAFT_CANNOT_HEAL_OR_REUSE_STALE_ETA", async ({ Then }) => {
  const { campaign, formationId } = consequenceFixture();
  const preview = campaign.getCampaignFormationRecoveryPreview(formationId);
  const drafted = campaign.createFormationRecoveryDraft({ formationId, expectedRevision: preview.revision });
  if (!drafted.ok) throw new Error(drafted.reason);
  const before = campaign.getRuntimeSnapshot()!;
  await Then("ordinary advance leaves an uncommitted casualty unchanged and rejects its outdated quote at commit", () => {
    advance(campaign);
    assert.deepEqual(campaign.getRuntimeSnapshot()!.formations[formationId], before.formations[formationId]);
    const safe = campaign.getRuntimeSnapshot();
    assert.equal(campaign.commitCampaignOrders([drafted.order.id]).ok, false);
    assert.deepEqual(campaign.getRuntimeSnapshot(), safe);
  });
});

registerTest("FSG_CAM_093_DOMAIN_INTERRUPTION_PRESERVES_TERMINAL_CONTROL_AND_CONDITION", async ({ Then }) => {
  const { campaign, formationId } = consequenceFixture();
  const order = committedRecovery(campaign, formationId);
  advance(campaign);
  const started = campaign.getRuntimeSnapshot()!;
  const definition = campaign.getScenarioDefinitionSnapshot()!;
  await Then("control-owned retirement or relocation stops recovery without undoing the external lifecycle or healing again", () => {
    for (const change of ["captured", "destroyed", "relocated", "condition"] as const) {
      const changed = runCampaignRuntimeTransaction(started, `test:external-${change}`, (candidate) => {
        if (change === "captured" || change === "destroyed") {
          assert.equal(retireCampaignFormation(candidate, formationId, change, candidate.currentSegment), true);
        } else if (change === "relocated") {
          const destination = candidate.tileOrder.find((key) => key !== candidate.formations[formationId].locationHexKey)!;
          assert.equal(relocateCampaignFormation(candidate, formationId, destination, candidate.currentSegment), true);
        } else {
          const pool = Object.values(candidate.formations[formationId].personnel)[0];
          pool.injured -= 1;
          pool.wounded += 1;
        }
        return [];
      });
      if (!changed.ok) throw changed.error;
      const external = changed.state.formations[formationId];
      const resolved = resolveCampaignSegment(changed.state, definition);
      if (!resolved.ok) throw resolved.error;
      const after = resolved.state.formations[formationId];
      assert.equal(resolved.state.orders[order.id].status, "blocked");
      assert.deepEqual(after.personnel, external.personnel);
      assert.deepEqual(after.equipment, external.equipment);
      assert.deepEqual(after.battleHistory, external.battleHistory);
      assert.equal(after.locationHexKey, external.locationHexKey);
      assert.equal(after.status, change === "captured" || change === "destroyed" ? change : "shattered");
      assert.equal(after.currentOrderId, null);
      assert.equal(resolved.state.factions.Player.economy.supplies, started.factions.Player.economy.supplies);
    }
  });
});

registerTest("FSG_CAM_093_DOMAIN_COMPLETION_ALERT_ROUTES_TO_RECOVERY_ORDER", async ({ When, Then }) => {
  for (const mode of ["segment", "nextReport"] as const) {
    const { campaign, formationId } = consequenceFixture("field");
    const order = committedRecovery(campaign, formationId);
    await When(`the real State ${mode} command completes the recovery order`, () => {
      const advanced = campaign.advanceCampaign({ mode });
      if (!advanced.ok) throw advanced.error;
      assert.equal(advanced.report.elapsedSegments, 1);
      assert.equal(advanced.report.stopReason, mode === "segment" ? "segmentComplete" : "nextReport");
      assert.equal(campaign.getRuntimeSnapshot()!.orders[order.id].status, "completed");
    });
    await Then("the retained advance record has exactly one logistics completion routed to the exact order, without changing stop severity", () => {
      const records = campaign.getCampaignAdvanceTimeline();
      const alerts = records.flatMap((record) => record.alerts).filter((alert) => alert.targetId === order.id);
      assert.equal(alerts.length, 1);
      assert.deepEqual({ title: alerts[0].title, category: alerts[0].category, targetKind: alerts[0].targetKind,
        targetId: alerts[0].targetId, severity: alerts[0].severity, requiresStop: alerts[0].requiresStop }, {
        title: "Formation recovery complete", category: "logistics", targetKind: "order", targetId: order.id,
        severity: "notable", requiresStop: false
      });
      assert.equal(records[0].toSegment, order.payload.completeSegment);
      const retained = structuredClone(alerts[0]);
      advance(campaign);
      assert.deepEqual(campaign.getCampaignAdvanceTimeline().flatMap((record) => record.alerts)
        .filter((alert) => alert.targetId === order.id), [retained]);
    });
  }
});

registerTest("FSG_CAM_093_DOMAIN_INTERRUPTION_ALERT_ROUTES_TO_RECOVERY_ORDER", async ({ When, Then }) => {
  const { campaign, formationId, backend, scenario } = consequenceFixture("workshop");
  const order = committedRecovery(campaign, formationId);
  advance(campaign);
  const started = campaign.getRuntimeSnapshot()!;
  const cut = runCampaignRuntimeTransaction(started, "test:recovery-alert-supply-cut", (candidate) => {
    candidate.tiles[order.payload.sourceRuntimeHexKey].controller = "Neutral";
    return [];
  });
  if (!cut.ok) throw cut.error;
  await new CampaignSaveRepository(backend).saveSlot({
    slotId: "recovery-alert:supply-cut", label: "Interrupted recovery alert fixture", envelope: envelopeFor(cut.state)
  });
  const restored = new CampaignState({ legacyStorage: null, saveBackend: backend });
  restored.setScenario(scenario);
  const loaded = await restored.loadCampaignSlot("recovery-alert:supply-cut", saveRequest);
  if (!loaded.ok) throw loaded.error;
  await When("the real State day advance encounters the recovery supply interruption after a validated checkpoint load", () => {
    const advanced = restored.advanceCampaign({ mode: "day" });
    if (!advanced.ok) throw advanced.error;
    assert.equal(advanced.report.elapsedSegments, 1);
    assert.equal(advanced.report.stopReason, "blockedOrder");
    assert.equal(restored.getRuntimeSnapshot()!.orders[order.id].status, "blocked");
  });
  await Then("one decision-required order alert uses recovery wording and the exact order route, retaining the mandatory stop and deduplication", () => {
    const records = restored.getCampaignAdvanceTimeline();
    const alerts = records.flatMap((record) => record.alerts).filter((alert) => alert.targetId === order.id);
    assert.equal(alerts.length, 1);
    assert.deepEqual({ title: alerts[0].title, category: alerts[0].category, targetKind: alerts[0].targetKind,
      targetId: alerts[0].targetId, severity: alerts[0].severity, requiresStop: alerts[0].requiresStop }, {
      title: "Formation recovery blocked", category: "orders", targetKind: "order", targetId: order.id,
      severity: "decisionRequired", requiresStop: true
    });
    assert.equal(records[0].stopReason, "blockedOrder");
    const retained = structuredClone(alerts[0]);
    advance(restored);
    assert.deepEqual(restored.getCampaignAdvanceTimeline().flatMap((record) => record.alerts)
      .filter((alert) => alert.targetId === order.id), [retained]);
  });
});
