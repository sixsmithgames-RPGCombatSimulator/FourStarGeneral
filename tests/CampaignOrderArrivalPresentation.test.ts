/** FSG-CAM-005: arrival and transport return are distinct authoritative movement boundaries. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignOrder } from "../src/game/campaign/orders/CampaignOrderTypes";
import { CampaignState, type CampaignStatePersistenceRequest } from "../src/state/CampaignState";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { CampaignScreen } from "../src/ui/screens/CampaignScreen";
import type { CampaignCommandOrderView, CampaignCommandShellView } from "../src/ui/campaign/CampaignCommandShell";
import { createCampaignContextInspector, renderCampaignContextInspector } from "../src/ui/campaign/components/CampaignContextInspector";

/** Calls the actual Screen presentation boundary without mounting a second gameplay subscription or browser. */
function projectOrder(state: CampaignState, orderId: string): CampaignCommandOrderView {
  document.body.innerHTML = '<main id="campaignScreen"></main>';
  const screen = new CampaignScreen({ showScreenById() {} } as never, {} as never);
  Object.defineProperty(screen, "campaignState", { value: state });
  const orders = state.getCampaignOrders();
  const order = orders.find((entry) => entry.id === orderId);
  assert.ok(order);
  // A narrow test seam exercises the real private projection, not a copied UI formula.
  return (screen as unknown as {
    projectCommandOrder(order: CampaignOrder, playerOrders: readonly CampaignOrder[]): CampaignCommandOrderView;
  }).projectCommandOrder(order, orders);
}

/** Feeds the real Screen formation projection into the shipped inspector consumer. */
function projectFormationInspector(state: CampaignState, formationId: string): string {
  document.body.innerHTML = '<main id="campaignScreen"></main>';
  const screen = new CampaignScreen({ showScreenById() {} } as never, {} as never);
  Object.defineProperty(screen, "campaignState", { value: state });
  const views: CampaignCommandShellView[] = [];
  Object.defineProperty(screen, "commandInterface", { value: { render(view: CampaignCommandShellView) { views.push(view); } } });
  // Capture the owning projection without mounting another campaign's listeners.
  (screen as unknown as { renderCommandShell(): void }).renderCommandShell();
  assert.equal(views.length, 1);
  const inspector = createCampaignContextInspector(document.createElement("section"));
  document.body.append(inspector);
  renderCampaignContextInspector(inspector, views[0], { kind: "formation", id: formationId });
  return inspector.textContent ?? "";
}

registerTest("FSG_CAM_085_ARRIVED_TRANSPORT_RETURN_PRESENTATION_SURVIVES_SAVE_LOAD", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
  state.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const initial = state.getRuntimeSnapshot()!;
  const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.locationHexKey === "14,3" && entry.campaignUnitType === "Infantry_42" && entry.status === "ready");
  assert.ok(formation, "The shipped Portland infantry must support the observed Exeter redeployment.");
  const draft = state.createRedeployDraft("14,10", "15,8", [{ unitType: "Infantry_42", count: 1 }], "truck", undefined, [formation.id]);
  assert.ok(draft.ok, draft.ok ? "" : draft.reason);
  assert.ok(draft.order.kind === "redeploy" && draft.order.validation.valid);
  const { etaSegment, returnEtaSegment, transportCapacityCost } = draft.order.payload;
  assert.equal(etaSegment, 1);
  assert.equal(returnEtaSegment, 2);
  const committed = state.commitCampaignOrders();
  assert.ok(committed.ok, "The exact typed movement draft must commit normally.");
  const departing = projectOrder(state, draft.order.id);
  assert.equal(departing.status, "committed");
  assert.doesNotMatch(departing.detail, /Formations arrived/);
  const initialHistory = initial.formations[formation.id].battleHistory;
  assert.ok(projectFormationInspector(state, formation.id).includes(initialHistory[initialHistory.length - 1].summary), "Committed movement cannot rewrite the preceding non-movement history as an arrival.");
  state.advanceSegment();
  const arrived = state.getRuntimeSnapshot()!;
  const executing = arrived.orders[draft.order.id];
  assert.equal(executing.status, "executing");
  assert.equal(state.getQueuedDecisions().find((entry) => entry.id === executing.executionRefId)?.payload.status, "arrived");
  assert.equal(arrived.formations[formation.id].status, "ready");
  assert.equal(arrived.formations[formation.id].locationHexKey, "15,1");
  assert.equal(arrived.factions.Player.economy.transportCapacity!.trucksInTransit, initial.factions.Player.economy.transportCapacity!.trucksInTransit + transportCapacityCost);
  const beforeProjection = state.getRuntimeSnapshot();
  const view = projectOrder(state, draft.order.id);
  assert.equal(view.status, "executing", "UI must not prematurely complete an order while trucks are returning.");
  assert.match(view.detail, /Formations arrived at Exeter/);
  assert.equal(view.nextTransition, `Trucks return ${state.segmentToTimeDisplay(returnEtaSegment)}`);
  assert.equal(view.eta, `Transport available ${state.segmentToTimeDisplay(returnEtaSegment)}`);
  assert.match(view.timingSummary!, /Arrival .* · Transport available /);
  assert.ok(view.timingSummary!.includes(state.segmentToTimeDisplay(etaSegment)));
  assert.ok(view.timingSummary!.includes(state.segmentToTimeDisplay(returnEtaSegment)));
  assert.doesNotMatch(view.riskSummary!, /before arrival/);
  const arrivalInspector = projectFormationInspector(state, formation.id);
  assert.match(arrivalInspector, /Moved from Portland \(Grid 14,10\) to Exeter \(Grid 15,8\)\./);
  assert.doesNotMatch(arrivalInspector, /from 14,3 to 15,1/);
  const arrivedHistory = arrived.formations[formation.id].battleHistory;
  assert.match(arrivedHistory[arrivedHistory.length - 1].summary, /from 14,3 to 15,1/, "The persisted domain summary must remain untouched.");
  assert.deepEqual(state.getRuntimeSnapshot(), beforeProjection, "Presentation must not change transport, order or formation authority.");

  const request: CampaignStatePersistenceRequest = {
    timestamp: "2026-09-06T04:00:00.000Z", label: "Arrived; trucks returning", playTimeSeconds: 0,
    difficulty: "standard", commanderRosterLink: null,
    uiResumeContext: { workspace: "formations", selectedEntityId: formation.id, mapCenter: null, mapZoom: null }
  };
  await state.savePrimaryCampaign(request);
  const restored = new CampaignState({ saveBackend: backend, legacyStorage: null });
  restored.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const loaded = await restored.loadPrimaryCampaign({ ...request, timestamp: "2026-09-06T04:01:00.000Z" });
  assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
  assert.deepEqual(restored.getRuntimeSnapshot(), beforeProjection);
  assert.deepEqual(projectOrder(restored, draft.order.id), view, "The resumed order must explain the same arrival/return boundary.");
  assert.equal(projectFormationInspector(restored, formation.id), arrivalInspector, "Named history and player grid references must survive a fresh-state load.");
  restored.advanceSegment();
  const returned = restored.getRuntimeSnapshot()!;
  assert.equal(returned.orders[draft.order.id].status, "completed");
  assert.equal(returned.factions.Player.economy.transportCapacity!.trucksInTransit, initial.factions.Player.economy.transportCapacity!.trucksInTransit);
  assert.equal(returned.formations[formation.id].locationHexKey, "15,1");
  const completed = projectOrder(restored, draft.order.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.nextTransition, "Filed in command history");
  assert.doesNotMatch(completed.detail, /trucks return /i, "The completed boundary must not continue promising a future transport return.");
});
