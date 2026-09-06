/** FSG-CAM-003: canonical contact selection must reach the real verification draft authority. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { CampaignState } from "../src/state/CampaignState";
import { UnlockState } from "../src/state/UnlockState";
import { CampaignScreen } from "../src/ui/screens/CampaignScreen";
import type { CampaignMapRenderer } from "../src/rendering/CampaignMapRenderer";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { projectRuntimeHexKeyToCampaignOffset } from "../src/ui/campaign/CampaignCommandProjection";

/** Retains the real screen, canonical selection, previews, orders and reservations; only map painting is inert. */
function mountVerificationFixture() {
  document.body.innerHTML = `<main id="campaignScreen"><div class="campaign-layout">
    <div class="campaign-map"><div class="campaign-map-viewport"><div id="campaignMapCanvas"><svg id="campaignHexMap"></svg></div></div></div>
    <aside class="campaign-sidebar">
      <section class="time-section"><button id="campaignAdvanceSegment"><span class="btn-label"></span></button></section>
      <section class="campaign-intel-section"><button id="campaignIntelToggle"></button><div id="campaignIntelSummary"></div></section>
      <section class="session-section"><div class="session-controls"></div></section>
      <section class="selection-section"><div id="campaignSelectionInfo"></div></section>
      <div class="action-section"><button id="campaignQueueEngagement"></button></div>
    </aside>
    <aside id="campaignIntelDrawer" class="campaign-intel-drawer hidden">
      <button data-intel-close>Close intelligence drawer</button>
      <button data-intel-tab="situation">Situation</button><button data-intel-tab="contacts">Contacts</button><button data-intel-tab="operations">Operations</button>
      <div id="campaignIntelBody"></div>
    </aside>
  </div></main>`;
  const root = document.getElementById("campaignScreen")!;
  const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
  let clickHex: Parameters<CampaignMapRenderer["onHexClick"]>[0] | null = null;
  const selectedHighlights = new Set<string>();
  const renderer = {
    render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {}, setIntelContactsVisible() {},
    getViewportRoot() { return null; }, getHexCenter() { return { cx: 0, cy: 0 }; },
    onHexClick(callback: Parameters<CampaignMapRenderer["onHexClick"]>[0]) { clickHex = callback; },
    clearAllHighlights(kind: string) { if (kind === "selected") selectedHighlights.clear(); },
    highlightHex(key: string, kind: string) { if (kind === "selected") selectedHighlights.add(key); }
  };
  // This screen still constructs singleton dependencies privately. Replace only this fixture's instances before subscriptions.
  const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
  Object.defineProperty(screen, "campaignState", { value: state });
  const unlock = new UnlockState();
  unlock.hydrate({ resolved: true, isAuthenticated: true, email: null, subscriptionStatus: null, planIds: [], isPrivileged: true, isGuest: false });
  Object.defineProperty(screen, "unlockState", { value: unlock });
  screen.initialize();
  screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const contact = state.getCampaignMapView("Player")!.enemyContacts.find((entry) => entry.locationHexKey === "20,25");
  assert.ok(contact, "The production Cherbourg assessed contact must exist in the shipped scenario.");
  function button(selector: string): HTMLButtonElement {
    const control = root.querySelector<HTMLButtonElement>(selector);
    assert.ok(control, `Missing campaign control: ${selector}`);
    return control;
  }
  function inspectContact(): void {
    button(`[data-intelligence-contact='${contact!.id}']`).click();
  }
  function openVerify(): void {
    button("[data-open-campaign-intelligence]").click();
    button("[data-intel-operation-type='verify']").click();
  }
  function selectHexOnly(): void {
    assert.ok(clickHex);
    clickHex("20,25", null);
  }
  button("[data-campaign-workspace-tab='intelligence']").click();
  return { root, state, screen, contact, button, inspectContact, openVerify, selectHexOnly, selectedHighlights };
}

registerTest("FSG_CAM_084_SELECTED_CONTACT_VERIFY_REACHES_VALID_TYPED_DRAFT", async () => {
  const fixture = mountVerificationFixture();
  const { root, state, contact, button } = fixture;
  try {
    const before = state.getRuntimeSnapshot();
    fixture.inspectContact();
    fixture.openVerify();
    assert.equal(button("[data-intel-operation-type='verify']").dataset.actionAvailability, "available");
    assert.equal(button("[data-intel-schedule]").disabled, false, "Inspect contact → Plan collection → Verify must retain the assessed contact ID.");
    assert.match(root.querySelector(".campaign-intel-composer")!.textContent!, /Cherbourg fortress-port.*Grid 20,25/s);
    // Changing operation intent must not erase the command selection when the player returns to Verify.
    button("[data-intel-operation-type='groundRecon']").click();
    assert.equal(button("[data-intel-operation-type='verify']").dataset.actionAvailability, "available", "Changing intent cannot make the still-selected contact falsely unavailable.");
    button("[data-intel-operation-type='verify']").click();
    assert.equal(button("[data-intel-schedule]").disabled, false);
    assert.deepEqual(state.getRuntimeSnapshot(), before, "Inspecting and previewing may not mutate campaign truth or spend resources.");
    const assignedAsset = root.querySelector<HTMLSelectElement>("#campaignIntelAsset")!.value;
    button("[data-intel-schedule]").click();
    const orders = state.getCampaignOrders();
    assert.equal(orders.length, 1);
    const order = orders[0];
    assert.equal(order.kind, "reconnaissance");
    assert.ok(order.kind === "reconnaissance");
    assert.equal(order.status, "draft");
    assert.equal(order.validation.valid, true);
    assert.equal(order.payload.operationType, "verify");
    assert.equal(order.payload.targetContactId, contact.id);
    assert.equal(order.payload.targetHexKey, "20,25");
    assert.equal(order.payload.assignedAssetKey, assignedAsset);
    assert.deepEqual(state.getRuntimeSnapshot()!.factions.Player.economy, before!.factions.Player.economy);
    const holds = state.getCampaignDraftReservations("Player");
    assert.equal(holds.intelligenceCapacity, 1);
    assert.equal(holds.resources.supplies, 10);
    assert.equal(holds.resources.fuel, 5);
    assert.equal(holds.assets, 1);
    fixture.selectHexOnly();
    button(`[data-order-id='${order.id}'] [data-order-action='edit']`).click();
    assert.equal(button("[data-intel-schedule]").disabled, false, "Editing must retain the draft's own contact even after the map selection changes.");
    button("[data-intel-schedule]").click();
    const replacement = state.getCampaignOrders()[0];
    assert.equal(state.getCampaignOrders().length, 1);
    assert.ok(replacement.kind === "reconnaissance");
    assert.deepEqual(replacement.payload, order.payload);
    assert.equal(replacement.validation.valid, true);
  } finally { fixture.screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_084_HEX_ONLY_VERIFY_RECOVERS_THROUGH_CANONICAL_CONTACTS", async () => {
  const fixture = mountVerificationFixture();
  const { root, state, button } = fixture;
  try {
    fixture.inspectContact();
    fixture.selectHexOnly();
    const before = state.getRuntimeSnapshot();
    fixture.openVerify();
    assert.equal(button("[data-intel-schedule]").disabled, true, "A hex occupied by a report is not itself an assessed-contact selection.");
    assert.match(root.querySelector(".campaign-intel-composer")!.textContent!, /inspect a reported contact.*Plan collection operation.*Verify/is);
    button("[data-intel-select-contact]").click();
    assert.equal(root.querySelector("#campaignIntelDrawer")!.classList.contains("hidden"), true);
    assert.equal(root.dataset.campaignWorkspace, "intelligence");
    assert.equal(root.querySelectorAll(".campaign-intel-contact-card").length, 0, "Recovery must not recreate the superseded Contacts panel.");
    assert.equal(document.activeElement, root.querySelector("#campaignIntelligenceContactsTitle"));
    assert.deepEqual(state.getRuntimeSnapshot(), before);
    fixture.inspectContact();
    fixture.openVerify();
    assert.equal(button("[data-intel-schedule]").disabled, false, "The canonical briefing must resolve the recovery loop.");
    button("[data-intel-schedule]").click();
    assert.equal(state.getCampaignOrders().length, 1);
  } finally { fixture.screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_084_VERIFY_RECHECKS_CURRENT_AUTHORIZED_CONTACT_BEFORE_DRAFT", async () => {
  const fixture = mountVerificationFixture();
  const { root, state, contact, button } = fixture;
  try {
    fixture.inspectContact();
    fixture.openVerify();
    assert.equal(button("[data-intel-schedule]").disabled, false);
    fixture.selectHexOnly();
    assert.equal(button("[data-intel-schedule]").disabled, true, "Map selection changes must immediately invalidate a contact-only preview.");
    fixture.inspectContact();
    assert.equal(button("[data-intel-schedule]").disabled, false);
    const before = state.getRuntimeSnapshot();
    const readView = state.getCampaignMapView.bind(state);
    // Simulate a newer authorized projection removing the contact after preview.
    // Preview, draft validation and resource/order producers remain the real state methods.
    state.getCampaignMapView = (faction) => {
      const view = readView(faction);
      return view ? { ...view, enemyContacts: view.enemyContacts.filter((entry) => entry.id !== contact.id) } : view;
    };
    button("[data-intel-schedule]").click();
    assert.equal(state.getCampaignOrders().length, 0, "A once-selected ID absent from the current Player view cannot create a verification draft.");
    assert.deepEqual(state.getRuntimeSnapshot(), before);
    assert.equal(button("[data-intel-schedule]").disabled, true);
    assert.ok(root.querySelector("[data-intel-select-contact]"));
    assert.equal(root.querySelector(".redeploy-issue")?.getAttribute("data-reason-code"), "ORDER_TARGET_INVALID");
  } finally { fixture.screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_084_REAL_MAP_LIST_SAME_HEX_CLEARS_CONTACT_VERIFY_PREVIEW", async () => {
  const fixture = mountVerificationFixture();
  const { root, state, button } = fixture;
  try {
    fixture.inspectContact();
    fixture.openVerify();
    assert.equal(button("[data-intel-schedule]").disabled, false);
    const before = state.getRuntimeSnapshot();
    const layer = root.querySelector<HTMLSelectElement>('select[aria-label="Map layer"]');
    assert.ok(layer);
    layer.value = "operational";
    layer.dispatchEvent(new Event("change", { bubbles: true }));
    button(".campaign-map-list-toggle").click();
    assert.equal(root.querySelector<HTMLElement>("#campaignMapAccessibleList")!.hidden, false);
    const hex = button("[data-map-list-selection-kind='hex'][data-map-list-selection-id='20,25']");
    assert.match(hex.textContent!, /Cherbourg/);
    hex.click();
    assert.equal(root.dataset.campaignSelection, "hex");
    assert.equal(button("[data-intel-schedule]").disabled, true, "Selecting the same hex through the real map list must refresh the contact-only composer.");
    assert.equal(button("[data-intel-operation-type='verify']").dataset.actionAvailability, "blocked");
    assert.ok(root.querySelector("[data-intel-select-contact]"));
    // Even a stale/bypassed enabled control must still reach current-contact validation.
    button("[data-intel-schedule]").disabled = false;
    button("[data-intel-schedule]").click();
    assert.equal(state.getCampaignOrders().length, 0);
    assert.deepEqual(state.getRuntimeSnapshot(), before);
  } finally { fixture.screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_084_REAL_REVIEW_OBJECTIVE_SYNCS_MAP_AND_COLLECTION_TARGET", async () => {
  const fixture = mountVerificationFixture();
  const { root, state, button } = fixture;
  try {
    fixture.inspectContact();
    fixture.openVerify();
    assert.equal(button("[data-intel-schedule]").disabled, false);
    const before = state.getRuntimeSnapshot();
    button("[data-campaign-workspace-tab='situation']").click();
    const review = button("#campaignSituationPriority button[data-objective-key]");
    assert.equal(review.textContent, "Review objective");
    const objective = state.getCampaignMapView("Player")!.scenario.objectives.find((entry) => entry.key === review.dataset.objectiveKey);
    assert.ok(objective);
    const objectiveGrid = projectRuntimeHexKeyToCampaignOffset(`${objective.hex.q},${objective.hex.r}`);
    assert.ok(objectiveGrid);
    assert.notEqual(objectiveGrid, "20,25");
    review.click();
    assert.equal(root.dataset.campaignSelection, "objective");
    assert.equal(root.querySelector("#campaignInspectorTitle")!.textContent, objective.label);
    assert.equal(button("[data-intel-schedule]").disabled, true, "Review objective must invalidate the previous contact-only preview immediately.");
    assert.deepEqual([...fixture.selectedHighlights], [objectiveGrid]);
    assert.ok(root.querySelector(".campaign-intel-composer")!.textContent!.includes(`Grid ${objectiveGrid}`));
    assert.doesNotMatch(root.querySelector(".campaign-intel-composer")!.textContent!, /Cherbourg fortress-port|Grid 20,25/);
    button("[data-intel-schedule]").disabled = false;
    button("[data-intel-schedule]").click();
    assert.equal(state.getCampaignOrders().length, 0);
    assert.deepEqual(state.getRuntimeSnapshot(), before);
    // A headquarters operation verifies retargeting without inventing an in-range collection asset.
    const preview = state.previewIntelOperationDraft({ type: "phantom", targetHexKey: objectiveGrid, faction: "Player" });
    assert.equal(preview.availability, "available", preview.reason ?? "The current objective must support the headquarters operation.");
    button("[data-intel-operation-type='phantom']").click();
    assert.equal(button("[data-intel-schedule]").disabled, false);
    button("[data-intel-schedule]").click();
    const orders = state.getCampaignOrders();
    assert.equal(orders.length, 1);
    assert.ok(orders[0].kind === "counterIntelligence");
    assert.equal(orders[0].payload.operationType, "phantom");
    assert.equal(orders[0].payload.targetHexKey, objectiveGrid);
    assert.equal(orders[0].payload.targetContactId, null);
    assert.equal(orders[0].validation.valid, true);
  } finally { fixture.screen.disposeCampaignAccessGate(); }
});
