/**
 * MODULE: CampaignOrders.typed.test
 * WHAT: Certifies typed drafts, reservations/conflicts, atomic commit, cancellation, invariants, and save/load continuity.
 * WHY: C20-012 cannot replace direct campaign mutation without proving its complete authoritative order loop.
 *
 * DEPENDENCIES: Custom harness, shipped campaign01, CampaignState, in-memory persistence, and runtime invariants.
 * EXPORTS: Registered C20-012 certification cases.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import {
  CampaignState,
  type CampaignStatePersistenceRequest
} from "../src/state/CampaignState";

const ORIGIN = "26,25";
const DESTINATION = "37,17";

function buildState(backend = new InMemoryCampaignSaveBackend()): CampaignState {
  const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
  state.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  return state;
}

function persistenceRequest(timestamp: string): CampaignStatePersistenceRequest {
  return {
    timestamp,
    label: "Typed order certification",
    playTimeSeconds: 1200,
    difficulty: "standard",
    commanderRosterLink: null,
    uiResumeContext: {
      workspace: "theater",
      selectedEntityId: null,
      mapCenter: null,
      mapZoom: null
    }
  };
}

registerTest("CAMPAIGN_TYPED_ORDERS_RESERVE_AND_CONFLICT_WITHOUT_SPENDING", async ({ Given, When, Then }) => {
  const state = buildState();
  const initial = state.getRuntimeSnapshot();
  if (!initial) throw new Error("Typed-order fixture did not create a runtime.");
  let firstId = "";
  let secondId = "";

  await Given("a player economy and twelve infantry available at one origin", async () => {
    const forces = initial.tiles["26,12"]?.forces.find((force) => force.unitType === "Infantry_42")?.count;
    if (forces !== 12) throw new Error(`Expected twelve origin infantry, received ${String(forces)}.`);
  });

  await When("two drafts each claim eight of the same infantry before either is committed", async () => {
    const first = state.createRedeployDraft(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 8 }], "foot");
    const second = state.createRedeployDraft(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 8 }], "foot");
    if (!first.ok) throw new Error(first.reason);
    if (!second.ok) throw new Error(second.reason);
    firstId = first.order.id;
    secondId = second.order.id;
  });

  await Then("the earlier draft holds the force, the later draft conflicts, and failed atomic commit is a no-op", async () => {
    const planned = state.getRuntimeSnapshot();
    if (!planned) throw new Error("Runtime disappeared after draft creation.");
    const first = planned.orders[firstId];
    const second = planned.orders[secondId];
    if (!first?.validation.valid || second?.validation.valid
      || second?.validation.issues[0]?.code !== "ORDER_RESERVATION_CONFLICT") {
      throw new Error("Stable-order formation conflict was not represented by machine-readable validation.");
    }
    if (first.reservationIds.some((id) => planned.reservations[id]?.status !== "held")
      || second.reservationIds.some((id) => planned.reservations[id]?.status !== "proposed")) {
      throw new Error("Valid and invalid draft reservation lifecycles are incorrect.");
    }
    if (planned.factions.Player.economy.supplies !== initial.factions.Player.economy.supplies
      || planned.compatibility.queuedDecisions.length !== 0
      || state.getIntelOperations("Player").length !== 0) {
      throw new Error("Draft creation spent resources or scheduled a compatibility execution record.");
    }

    const beforeRejectHash = computeCampaignContentHash(planned);
    const rejected = state.commitCampaignOrders();
    if (rejected.ok || computeCampaignContentHash(state.getRuntimeSnapshot()) !== beforeRejectHash) {
      throw new Error("Invalid multi-order commit changed authoritative runtime.");
    }

    const removed = state.removeCampaignOrder(firstId);
    const rebalanced = state.getCampaignOrders().find((order) => order.id === secondId);
    if (!removed.ok || !rebalanced?.validation.valid) {
      throw new Error("Removing the earlier draft did not release and reassign its formation hold.");
    }

    const duplicateState = buildState();
    const duplicate = duplicateState.createRedeployDraft(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 8 }], "foot");
    if (!duplicate.ok || duplicate.order.id !== firstId) {
      throw new Error("Typed order identity depends on wall-clock or non-deterministic state.");
    }
  });
});

registerTest("CAMPAIGN_TYPED_ORDERS_COMMIT_CANCEL_AND_SAVE_ATOMICALLY", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const state = buildState(backend);
  const initial = state.getRuntimeSnapshot();
  if (!initial) throw new Error("Typed-order fixture did not create a runtime.");
  let redeployId = "";
  let productionId = "";
  let intelligenceId = "";
  let committedHash = "";

  await Given("valid movement, production, and counterintelligence drafts", async () => {
    const redeploy = state.createRedeployDraft(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 2 }], "foot");
    const production = state.createProductionDraft({ supplies: 10, fuel: 20, ammo: 30, manpower: 40 });
    const intelligence = state.createIntelOperationDraft({ type: "phantom", targetHexKey: ORIGIN, faction: "Player" });
    if (!redeploy.ok || !production.ok || !intelligence.ok) {
      throw new Error(!redeploy.ok ? redeploy.reason : !production.ok ? production.reason : !intelligence.ok ? intelligence.reason : "Draft failure");
    }
    if (![redeploy.order, production.order, intelligence.order].every((order) => order.validation.valid)) {
      throw new Error("A valid cross-domain draft unexpectedly failed reservation validation.");
    }
    redeployId = redeploy.order.id;
    productionId = production.order.id;
    intelligenceId = intelligence.order.id;
  });

  await When("the full tray is committed and saved", async () => {
    const beforeCommit = state.getRuntimeSnapshot();
    if (!beforeCommit) throw new Error("Runtime disappeared before commit.");
    const result = state.commitCampaignOrders();
    const committed = state.getRuntimeSnapshot();
    if (!result.ok || result.committedCount !== 3 || !committed || committed.revision !== beforeCommit.revision + 1) {
      throw new Error("Valid multi-domain drafts did not commit in exactly one runtime revision.");
    }
    committedHash = computeCampaignContentHash(committed);
    await state.savePrimaryCampaign(persistenceRequest("2026-08-03T12:00:00.000Z"));
  });

  await Then("execution records, consumed holds, exact restoration, and cancellation refunds survive load", async () => {
    const committed = state.getRuntimeSnapshot();
    if (!committed) throw new Error("Runtime disappeared after commit.");
    const orders = [redeployId, productionId, intelligenceId].map((id) => committed.orders[id]);
    if (orders.some((order) => order?.status !== "committed")
      || orders.some((order) => order.reservationIds.some((id) => committed.reservations[id]?.status !== "consumed"))) {
      throw new Error("Committed order or reservation lifecycle was not persisted authoritatively.");
    }
    if (!committed.compatibility.queuedDecisions.some((decision) => decision.id === committed.orders[redeployId].executionRefId)
      || !committed.knowledgeByFaction.Player.operations.some((operation) => operation.id === committed.orders[intelligenceId].executionRefId)) {
      throw new Error("Typed commit did not create its movement/intelligence execution adapters.");
    }
    const allocation = committed.factions.Player.economy.productionAllocation;
    if (!allocation || allocation.supplies !== 10 || allocation.fuel !== 20 || allocation.ammo !== 30 || allocation.manpower !== 40) {
      throw new Error("Typed production order did not apply its normalized allocation.");
    }

    const restored = buildState(backend);
    const load = await restored.loadPrimaryCampaign(persistenceRequest("2026-08-03T12:01:00.000Z"));
    if (!load.ok || computeCampaignContentHash(restored.getRuntimeSnapshot()) !== committedHash) {
      throw new Error("Typed orders/reservations did not survive the checksummed save/load boundary exactly.");
    }

    const cancelMove = restored.cancelCampaignOrder(redeployId);
    const cancelIntel = restored.cancelCampaignOrder(intelligenceId);
    const cancelProduction = restored.cancelCampaignOrder(productionId);
    const cancelled = restored.getRuntimeSnapshot();
    if (!cancelMove.ok || !cancelIntel.ok || cancelProduction.ok || !cancelled) {
      throw new Error("Pre-execution cancellation policy was not enforced by order kind.");
    }
    if (cancelled.orders[redeployId].status !== "cancelled"
      || cancelled.orders[intelligenceId].status !== "cancelled"
      || cancelled.compatibility.queuedDecisions.some((decision) => decision.id === committed.orders[redeployId].executionRefId)
      || cancelled.knowledgeByFaction.Player.operations.some((operation) => operation.id === committed.orders[intelligenceId].executionRefId)) {
      throw new Error("Cancelled execution adapters or order statuses were not updated exactly once.");
    }
    if (cancelled.factions.Player.economy.supplies !== initial.factions.Player.economy.supplies
      || cancelled.factions.Player.economy.fuel !== initial.factions.Player.economy.fuel
      || cancelled.factions.Player.economy.manpower !== initial.factions.Player.economy.manpower) {
      throw new Error("Cancellation did not restore committed resources exactly.");
    }
  });
});

registerTest("CAMPAIGN_TYPED_ORDER_INVARIANTS_REJECT_CORRUPT_LEDGER", async ({ Given, When, Then }) => {
  const state = buildState();
  const draft = state.createProductionDraft({ supplies: 25, fuel: 25, ammo: 25, manpower: 25 });
  if (!draft.ok) throw new Error(draft.reason);
  const corrupt = state.getRuntimeSnapshot();
  if (!corrupt) throw new Error("Runtime disappeared before invariant test.");
  const reservationId = corrupt.orders[draft.order.id].reservationIds[0];

  await Given("a valid authoritative typed order and reservation ledger", async () => {});
  await When("the reservation amount is corrupted outside CampaignState", async () => {
    (corrupt.reservations[reservationId] as unknown as { amount: number }).amount = 0;
  });
  await Then("runtime validation returns a structured reservation invariant failure", async () => {
    const issues = validateCampaignRuntimeState(corrupt);
    if (!issues.some((entry) => entry.code === "RESERVATION_INVALID" && entry.path === `reservations.${reservationId}`)) {
      throw new Error("Corrupt typed reservation did not produce a structured invariant diagnostic.");
    }
  });
});

registerTest("CAMPAIGN_FCI4_PREVIEW_PRIORITY_REPLACE_AND_CANCEL_PARITY", async ({ Given, When, Then }) => {
  const state = buildState();
  let firstMoveId = "";
  let secondMoveId = "";
  let firstProductionId = "";
  let secondProductionId = "";

  await Given("one valid movement draft and a draft-aware preview for the same force pool", async () => {
    const first = state.createRedeployDraft(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 8 }], "foot");
    if (!first.ok) throw new Error(first.reason);
    firstMoveId = first.order.id;
    const preview = state.previewRedeploy(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 8 }], "foot");
    if (preview?.ok || preview?.diagnostics[0]?.code !== "ORDER_RESERVATION_CONFLICT") {
      throw new Error("Draft-aware movement preview did not identify the earlier formation hold by stable reason code.");
    }
  });

  await When("a conflicted draft is retained, moved earlier, and an invalid production replacement is attempted", async () => {
    const second = state.createRedeployDraft(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 8 }], "foot");
    if (!second.ok || second.order.validation.valid) throw new Error("Normal draft creation did not retain the explainable movement conflict.");
    secondMoveId = second.order.id;
    const preflight = state.getCampaignOrderCommitPreview();
    if (preflight.canCommit || preflight.blockers[0]?.code !== "ORDER_RESERVATION_CONFLICT") {
      throw new Error("Atomic commit preflight did not retain the typed movement blocker.");
    }
    const moved = state.moveCampaignOrder(secondMoveId, "earlier");
    const movementOrders = state.getCampaignOrders().filter((order) => order.kind === "redeploy");
    if (!moved.ok || !movementOrders.find((order) => order.id === secondMoveId)?.validation.valid
      || movementOrders.find((order) => order.id === firstMoveId)?.validation.valid) {
      throw new Error("Draft priority change did not re-arbitrate the shared force hold deterministically.");
    }

    state.removeCampaignOrder(firstMoveId);
    state.removeCampaignOrder(secondMoveId);
    const firstProduction = state.createProductionDraft({ supplies: 25, fuel: 25, ammo: 25, manpower: 25 });
    const secondProduction = state.createProductionDraft({ supplies: 40, fuel: 20, ammo: 20, manpower: 20 });
    if (!firstProduction.ok || !secondProduction.ok || secondProduction.order.validation.valid) {
      throw new Error("Production-slot conflict fixture was not retained.");
    }
    firstProductionId = firstProduction.order.id;
    secondProductionId = secondProduction.order.id;
    const beforeReplace = computeCampaignContentHash(state.getRuntimeSnapshot());
    const replacement = state.createProductionDraft({ supplies: 10, fuel: 30, ammo: 30, manpower: 30 }, firstProductionId);
    if (replacement.ok || computeCampaignContentHash(state.getRuntimeSnapshot()) !== beforeReplace) {
      throw new Error("Failed atomic draft replacement did not preserve the original order book exactly.");
    }
  });

  await Then("commit failure preserves drafts and cancellation preview reconciles exact refundable holds", async () => {
    const beforeReject = computeCampaignContentHash(state.getRuntimeSnapshot());
    const rejected = state.commitCampaignOrders();
    if (rejected.ok || !rejected.draftsPreserved || rejected.blockers.length === 0
      || computeCampaignContentHash(state.getRuntimeSnapshot()) !== beforeReject) {
      throw new Error("Rejected atomic commit did not preserve every draft and authoritative value.");
    }
    state.removeCampaignOrder(secondProductionId);
    const committed = state.commitCampaignOrders([firstProductionId]);
    if (!committed.ok) throw new Error(committed.reason);
    const productionCancellation = state.previewCampaignOrderCancellation(firstProductionId);
    if (productionCancellation.canCancel || !productionCancellation.correctiveAction?.includes("new allocation")) {
      throw new Error("Committed production cancellation preview did not explain its superseding-order policy.");
    }

    const move = state.createRedeployDraft(ORIGIN, DESTINATION, [{ unitType: "Infantry_42", count: 2 }], "foot");
    if (!move.ok) throw new Error(move.reason);
    const moveCommit = state.commitCampaignOrders([move.order.id]);
    if (!moveCommit.ok) throw new Error(moveCommit.reason);
    const cancellation = state.previewCampaignOrderCancellation(move.order.id);
    const reservationCount = state.getCampaignOrderReservations(move.order.id).length;
    if (!cancellation.canCancel || cancellation.releasedReservations.length !== reservationCount
      || !cancellation.sunkCostSummary.includes("No sunk cost")) {
      throw new Error("Cancellation consequence preview diverged from the committed reservation ledger.");
    }
  });
});

registerTest("CAMPAIGN_REDEPLOY_PREVIEW_REJECTS_MISSING_MAP_DESTINATION", async ({ Given, When, Then }) => {
  const state = buildState();
  const missingDestination = "26,24";

  await Given("a selected destination inside the rendered grid but absent from the authoritative theater tiles", async () => {});
  await When("the player previews and attempts to draft a redeployment to that location", async () => {});
  await Then("preview and draft creation reject the target before the order reaches the tray", async () => {
    const preview = state.previewRedeploy(ORIGIN, missingDestination, [{ unitType: "Infantry_42", count: 8 }], "foot");
    if (preview?.ok || !preview?.diagnostics.some((entry) => entry.code === "ORDER_TARGET_INVALID")) {
      throw new Error("Missing theater destination was not rejected by the redeployment preview.");
    }
    const draft = state.createRedeployDraft(ORIGIN, missingDestination, [{ unitType: "Infantry_42", count: 8 }], "foot");
    if (draft.ok || state.getCampaignOrders().length !== 0) {
      throw new Error("Missing theater destination reached the authoritative order tray.");
    }
  });
});

registerTest("CAMPAIGN_FCI4_PLAYER_COMMIT_AND_INTEL_ASSET_HOLDS_STAY_FACTION_SAFE", async ({ Given, When, Then }) => {
  const state = buildState();
  let playerOrderId = "";
  let botOrderId = "";

  await Given("Player and Bot each have a draft while one Player reconnaissance asset is held", async () => {
    const asset = state.getEligibleIntelAssets("airRecon", "Player")[0];
    if (!asset) throw new Error("The campaign fixture has no Player air-recon asset.");
    const playerRecon = state.createIntelOperationDraft({
      type: "airRecon",
      targetHexKey: asset.hexKey,
      assignedAssetKey: asset.assetKey,
      faction: "Player"
    });
    const botDeception = state.createIntelOperationDraft({ type: "phantom", targetHexKey: DESTINATION, faction: "Bot" });
    if (!playerRecon.ok || !botDeception.ok) {
      throw new Error(!playerRecon.ok ? playerRecon.reason : !botDeception.ok ? botDeception.reason : "Draft failure");
    }
    playerOrderId = playerRecon.order.id;
    botOrderId = botDeception.order.id;

    const preview = state.previewIntelOperationDraft({
      type: "airRecon",
      targetHexKey: asset.hexKey,
      assignedAssetKey: asset.assetKey,
      faction: "Player"
    });
    if (preview.availability !== "blocked" || preview.reasonCode !== "ORDER_ASSET_UNAVAILABLE"
      || preview.eligibleAssets.some((candidate) => candidate.assetKey === asset.assetKey)) {
      throw new Error("Intelligence preview did not remove an asset held by an earlier Player draft.");
    }
  });

  await When("the command tray commits its default Player draft set", async () => {
    const committed = state.commitCampaignOrders();
    if (!committed.ok || committed.committedCount !== 1) {
      throw new Error(committed.ok ? `Expected one Player commit, received ${committed.committedCount}.` : committed.reason);
    }
  });

  await Then("the Player order commits without sweeping the independent Bot draft", async () => {
    const orders = state.getCampaignOrders();
    if (orders.find((order) => order.id === playerOrderId)?.status !== "committed"
      || orders.find((order) => order.id === botOrderId)?.status !== "draft") {
      throw new Error("Default Player commit crossed the faction-owned planning boundary.");
    }
  });
});
