/**
 * MODULE: CampaignCommandFoundation.test
 * WHAT: Certifies the FCI state, navigation, immutable projection, feature boundary, and DOM leak helpers.
 * WHY: The UI overhaul must not create a second campaign truth model or inconsistent deep links.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { CampaignCommandScreen } from "../src/ui/campaign/CampaignCommandScreen";
import { CampaignCommandNavigator } from "../src/ui/campaign/CampaignCommandNavigator";
import { CampaignCommandUIState } from "../src/ui/campaign/CampaignCommandUIState";
import { CampaignUIEvents } from "../src/ui/campaign/CampaignUIEvents";
import { assertCampaignCommandDOMSafe, findCampaignCommandDOMLeaks } from "../src/ui/campaign/CampaignCommandInformationSafety";
import { CampaignCommandViewAssembler } from "../src/ui/campaign/CampaignCommandViewAssembler";
import { projectRuntimeHexKeyToCampaignOffset } from "../src/ui/campaign/CampaignCommandProjection";
import type { CampaignCommandShellView } from "../src/ui/campaign/CampaignCommandShell";
import {
  CampaignActionRegistry,
  decorateCampaignOrderComposer,
  getCampaignOrderComposerSchema
} from "../src/ui/campaign/CampaignOrderExperience";

function mountFoundationFixture(): HTMLElement {
  document.body.innerHTML = `
    <div id="campaignScreen">
      <div class="campaign-layout">
        <div class="campaign-map"><h2>Map</h2><div class="campaign-map-viewport"><div id="campaignMapCanvas"><svg id="campaignHexMap"><g class="campaign-hex" data-hex="4,5"><polygon></polygon></g><g class="campaign-hex" data-hex="5,5"><polygon></polygon></g></svg></div></div></div>
        <aside class="campaign-sidebar">
          <section class="time-section"><div id="campaignTimeDisplay"></div><button id="campaignAdvanceSegment"><span class="btn-icon"></span><span class="btn-label"></span></button></section>
          <section class="campaign-intel-section"><button id="campaignIntelToggle"></button><button id="campaignIntelCoverage"></button><div id="campaignIntelSummary"></div><span id="campaignIntelUnread"></span></section>
          <section class="economy-section"><div id="campaignEconomySummary"></div></section>
          <section class="production-section"><div id="campaignProductionSummary"></div><button id="campaignProductionManage"></button></section>
          <section class="map-controls-section"><button id="campaignZoomOut">−</button><button id="campaignResetView">Reset</button><button id="campaignZoomIn">+</button></section>
          <section class="session-section"><button id="campaignSave">Save</button><button id="campaignLoad">Load</button><button id="campaignExit">Exit</button></section>
          <section class="selection-section"><div id="campaignSelectionInfo"></div></section>
          <div class="action-section"><button id="campaignQueueEngagement"></button></div>
        </aside>
      </div>
    </div>`;
  const root = document.getElementById("campaignScreen");
  if (!root) throw new Error("Campaign foundation fixture did not mount.");
  return root;
}

function createSafeView(title = "Operation Test"): CampaignCommandShellView {
  return {
    theaterTitle: title,
    campaignPhase: "Opening phase",
    timeLabel: "Day 1, 00:00-03:00",
    commandStatus: "Planning",
    saveStatus: "Saved",
    unreadReports: 0,
    resources: [{ key: "supplies", label: "Supply", value: "200,000" }],
    objectives: [],
    forces: [],
    airPower: 0,
    navalPower: 0,
    intelligenceCapacity: "3/3 available",
    orders: [],
    advance: {
      mode: "nextReport",
      enabled: true,
      pauseAfterEveryResolution: false,
      summary: "No campaign time resolved yet.",
      alerts: [],
      timeline: []
    }
  };
}

registerTest("CAMPAIGN_COMMAND_UI_STATE_IS_EPHEMERAL_AND_SHEET_EXCLUSIVE", async ({ Given, When, Then }) => {
  const events = new CampaignUIEvents();
  const state = new CampaignCommandUIState(events);
  let emitted = 0;

  await Given("one interface-only state store and typed event channel", async () => {
    events.on("state:changed", () => { emitted += 1; });
  });

  await When("workspace, overlay, selection, and compact sheet state change", async () => {
    state.setWorkspace("forces");
    state.setOverlay("forces");
    state.setSelection({ kind: "formation", id: "formation-1" });
    state.revealInspector();
  });

  await Then("the immutable snapshot contains no campaign truth and exposes only one sheet", async () => {
    const snapshot = state.getSnapshot();
    if (!Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.selection)) {
      throw new Error("Campaign UI state snapshots are not immutable.");
    }
    if (snapshot.workspace !== "forces" || snapshot.overlay !== "forces" || snapshot.selection?.id !== "formation-1") {
      throw new Error("Campaign UI state did not retain synchronized navigation state.");
    }
    if (snapshot.openSheet !== "inspector" || !snapshot.inspectorExpanded || snapshot.workspaceExpanded
      || snapshot.timelineExpanded || snapshot.afterActionExpanded || snapshot.orderComposerExpanded) {
      throw new Error("Campaign compact sheets are not mutually exclusive.");
    }
    const serialized = JSON.stringify(snapshot);
    if (/economy|readiness|campaignTime|enemy|runtime/i.test(serialized) || emitted < 4) {
      throw new Error("Ephemeral UI state contains campaign truth or did not emit typed changes.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_NAVIGATOR_ROUTES_ALL_SURFACES_CONSISTENTLY", async ({ Given, When, Then }) => {
  const state = new CampaignCommandUIState();
  const navigator = new CampaignCommandNavigator(state);
  let focusKind = "";

  await Given("a shared navigator observed by map, workspace, inspector, and report surfaces", async () => {
    state.getEvents().on("focus:requested", ({ selection }) => { focusKind = selection?.kind ?? "none"; });
  });

  await When("an intelligence contact and then a formation are deep-linked", async () => {
    navigator.navigate({ kind: "intelligence", id: "contact-7" });
    const intel = state.getSnapshot();
    if (intel.workspace !== "intelligence" || intel.overlay !== "intelligence" || intel.selection?.kind !== "contact") {
      throw new Error("Intelligence deep link did not resolve to its canonical destination.");
    }
    navigator.navigate({ kind: "formation", id: "formation-3" });
  });

  await Then("the final destination has the canonical forces workspace, overlay, selection, and focus request", async () => {
    const snapshot = state.getSnapshot();
    if (snapshot.workspace !== "forces" || snapshot.overlay !== "forces"
      || snapshot.selection?.kind !== "formation" || snapshot.selection.id !== "formation-3" || focusKind !== "formation") {
      throw new Error("Formation navigation diverged between command surfaces.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_VIEW_ASSEMBLER_FREEZES_AND_REJECTS_TRUTH", async ({ Given, When, Then }) => {
  const assembler = new CampaignCommandViewAssembler();
  let safeView: CampaignCommandShellView;
  let rejected = false;

  await Given("one Player-safe command projection", async () => {
    safeView = createSafeView();
  });

  await When("the projection is finalized and a forbidden runtime-bearing projection is attempted", async () => {
    safeView = assembler.assemble(safeView);
    try {
      assembler.assemble({ ...createSafeView(), rawRuntime: { hiddenForces: ["secret"] } } as unknown as CampaignCommandShellView);
    } catch {
      rejected = true;
    }
  });

  await Then("the safe view is detached and deeply immutable while forbidden truth is rejected", async () => {
    if (!Object.isFrozen(safeView) || !Object.isFrozen(safeView.resources) || !Object.isFrozen(safeView.resources[0]) || !rejected) {
      throw new Error("Campaign view finalization did not enforce immutability and information safety.");
    }
  });
});

registerTest("CAMPAIGN_MAP_OVERLAYS_ARE_STABLE_SAFE_AND_LIST_ACCESSIBLE", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let screen: CampaignCommandScreen;
  let originalWidth: number;
  let initialCacheBuilds: number;
  let initialClassApplications: number;

  await Given("a managed map receives only Player-safe objective, force, front, contact, and order projections", async () => {
    if (projectRuntimeHexKeyToCampaignOffset("26,12") !== "26,25"
      || projectRuntimeHexKeyToCampaignOffset("invalid") !== null) {
      throw new Error("Runtime axial formation coordinates did not project to campaign offset identity.");
    }
    originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    root = mountFoundationFixture();
    screen = new CampaignCommandScreen(root, {}, { v2Enabled: true });
    if (!screen.initialize()) throw new Error("Managed campaign map controller did not initialize.");
    screen.render({
      ...createSafeView("Overlay Test"),
      objectives: [{
        key: "objective-1",
        label: "Secure the crossing",
        status: "In progress",
        detail: "Hold the projected objective ground.",
        deadline: "Deadline Day 2",
        score: "0/50 pts",
        hexKey: "4,5"
      }],
      forces: [{ hexKey: "4,5", label: "1st Infantry Group", count: 3 }],
      fronts: [{ key: "front-1", label: "Northern front", hexKeys: ["4,5", "5,5"], initiativeLabel: "Friendly initiative" }],
      formations: [{
        id: "formation-1",
        name: "1st Infantry Division",
        typeLabel: "Infantry",
        ownershipLabel: "Core",
        locationHexKey: "4,5",
        statusLabel: "Ready",
        readiness: "88%",
        cohesion: "91%",
        fatigue: "12%",
        personnel: "8,200 fit / 8,500 present",
        equipment: "120 / 130 operational",
        supply: "Ammo 80 · Fuel 72 · Rations 90 · Parts 66",
        experience: "24 XP",
        honors: ["Crossing Citation"],
        battles: 2,
        currentOrderId: null,
        latestHistory: "Held the northern crossing."
      }, {
        id: "formation-2",
        name: "Armored Reserve",
        typeLabel: "Medium tank",
        ownershipLabel: "Attached",
        locationHexKey: "5,5",
        statusLabel: "Committed",
        readiness: "72%",
        cohesion: "76%",
        fatigue: "28%",
        personnel: "620 fit / 700 present",
        equipment: "42 / 55 operational",
        supply: "Ammo 60 · Fuel 48 · Rations 75 · Parts 40",
        experience: "12 XP",
        honors: [],
        battles: 1,
        currentOrderId: "order-map-1",
        latestHistory: null
      }],
      hexes: [{
        hexKey: "4,5",
        roleLabel: "logistics hub",
        controlLabel: "Friendly control",
        forces: ["1st Infantry Group · 3"],
        infrastructure: "logistics hub · damaged · 80/100 integrity · 80% effective",
        objectives: ["Secure the crossing"],
        fronts: ["Northern front"]
      }],
      contacts: [{
        id: "contact-1",
        label: "Armored activity",
        locationHexKey: "5,5",
        state: "current",
        confidenceBand: "high",
        ageSegments: 1,
        uncertaintyRadius: 1,
        sourceLabels: ["Air reconnaissance"],
        strengthBand: "moderate"
      }],
      orders: [{
        id: "order-map-1",
        kind: "redeploy",
        label: "Redeploy formation",
        detail: "4,5 → 5,5",
        status: "committed",
        eta: "ETA Day 1, 03:00-06:00",
        validationMessages: [],
        canRemove: false,
        canCancel: true,
        mapHexKeys: ["4,5", "5,5"]
      }]
    });
    const initialPerformance = screen.getMapOverlayPerformanceSnapshot();
    initialCacheBuilds = initialPerformance.cacheBuilds;
    initialClassApplications = initialPerformance.entityClassApplications;
  });

  await When("the player changes layers and selects objective and contact records through the map list", async () => {
    root.querySelector<HTMLButtonElement>("[data-map-overlay-id='objectives']")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='objective']")?.click();
    if (screen.getUIState().getSnapshot().selection?.kind !== "objective"
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("Deadline Day 2")) {
      throw new Error("Objective map-list selection did not reach the shared typed inspector.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    screen.revealInspector({ kind: "hex", id: "4,5" });
    if (!root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("80/100 integrity")
      || root.querySelector<HTMLElement>(".action-section")?.hidden) {
      throw new Error("Typed hex detail did not preserve the domain-owned legal-action surface.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-overlay-id='intelligence']")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='contact']")?.click();
    if (!root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("high confidence")) {
      throw new Error("Safe contact detail did not reach the typed inspector.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-overlay-id='forces']")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    const search = root.querySelector<HTMLInputElement>("[aria-label='Search current map list']");
    if (search) {
      search.value = "Infantry";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (root.querySelectorAll("[data-map-list-selection-kind='formation']").length !== 1
      || !root.querySelector(".campaign-map-accessible-list__status")?.textContent?.includes("1 of 2")) {
      throw new Error("Large-roster map-list search did not filter with a live count.");
    }
    screen.setRedeploymentTargetMode("4,5", [
      { hexKey: "5,5", label: "Opposing ground · 5,5", available: false, reason: "Redeployment cannot enter opposing control." },
      { hexKey: "4,6", label: "Friendly ground · 4,6", available: true, reason: null }
    ]);
    const destinationToggle = root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle");
    const blockedDestination = root.querySelector<HTMLButtonElement>("[data-map-list-selection-id='5,5']");
    const legalDestination = root.querySelector<HTMLButtonElement>("[data-map-list-selection-id='4,6']");
    if (!destinationToggle?.textContent?.includes("2 destination hexes")
      || blockedDestination?.getAttribute("aria-disabled") !== "true"
      || blockedDestination?.disabled
      || !blockedDestination.parentElement?.textContent?.includes("opposing control")
      || !legalDestination) {
      throw new Error("Redeployment target mode did not expose keyboard destinations and authoritative blocking copy.");
    }
    blockedDestination.focus();
    blockedDestination.click();
    if (document.activeElement !== blockedDestination
      || !root.querySelector(".campaign-map-accessible-list__status")?.textContent?.includes("opposing control")) {
      throw new Error("Blocked destination reason was not focusable and announced to keyboard users.");
    }
    legalDestination.click();
    if (screen.getUIState().getSnapshot().selection?.kind !== "hex"
      || screen.getUIState().getSnapshot().selection?.id !== "4,6") {
      throw new Error("Keyboard destination selection did not use the shared hex route.");
    }
    screen.setRedeploymentTargetMode(null);
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    const restoredSearch = root.querySelector<HTMLInputElement>("[aria-label='Search current map list']");
    if (restoredSearch) {
      restoredSearch.value = "Infantry";
      restoredSearch.dispatchEvent(new Event("input", { bubbles: true }));
    }
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='formation']")?.click();
  });

  await Then("available layers, truthful gates, map emphasis, list parity, and safe contact detail stay synchronized", async () => {
    const svg = root.querySelector<SVGSVGElement>("#campaignHexMap");
    const performance = screen.getMapOverlayPerformanceSnapshot();
    if (root.querySelectorAll("[data-map-overlay-id]").length !== 5
      || root.querySelector("[data-map-overlay-id='supply']")
      || screen.getUIState().getSnapshot().overlay !== "forces"
      || screen.getUIState().getSnapshot().selection?.kind !== "formation"
      || svg?.dataset.overlayMode !== "forces"
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("88%")
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("Crossing Citation")
      || !root.querySelector<SVGGElement>("[data-hex='4,5']")?.classList.contains("campaign-overlay-objective")
      || !root.querySelector<SVGGElement>("[data-hex='4,5']")?.classList.contains("campaign-overlay-force")
      || !root.querySelector<SVGGElement>("[data-hex='5,5']")?.classList.contains("campaign-overlay-order")
      || !root.querySelector<HTMLElement>("#campaignWorkspacePanel")?.inert
      || root.querySelector<HTMLElement>("#campaignMapAccessibleList")?.hidden !== true
      || performance.indexedHexes !== 2 || performance.cacheBuilds !== initialCacheBuilds
      || performance.entityClassApplications !== initialClassApplications) {
      throw new Error("Campaign overlay registry, emphasis, or accessible list state diverged.");
    }
    screen.getUIState().setOverlay("environment", "test-feature-gate");
    const gatedSvg = root.querySelector<SVGSVGElement>("#campaignHexMap");
    if (gatedSvg?.dataset.overlayRequested !== "environment" || gatedSvg.dataset.overlayStatus !== "featureGated"
      || gatedSvg.dataset.overlayMode !== "operational"
      || !root.querySelector(".campaign-map-legend")?.textContent?.includes("projected weather-zone service")) {
      throw new Error("Feature-gated environment overlay did not fall back truthfully.");
    }
    assertCampaignCommandDOMSafe(root, ["AXIS-HIDDEN-OVERLAY-TRUTH"]);
    screen.destroy();
    Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
    window.dispatchEvent(new Event("resize"));
  });
});

registerTest("CAMPAIGN_DESKTOP_MAP_LIST_RESELECTION_RETAINS_INSPECTOR_FOCUS", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let screen: CampaignCommandScreen;
  let originalWidth: number;

  await Given("a desktop map list and an already-open formation inspector", async () => {
    originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    root = mountFoundationFixture();
    screen = new CampaignCommandScreen(root, {}, { v2Enabled: true });
    if (!screen.initialize()) throw new Error("Managed campaign command screen did not initialize.");
    screen.render({
      ...createSafeView("Desktop focus test"),
      formations: [{
        id: "formation-focus-1",
        name: "1st Infantry Division",
        typeLabel: "Infantry",
        ownershipLabel: "Core",
        locationHexKey: "4,5",
        statusLabel: "Ready",
        readiness: "88%",
        cohesion: "91%",
        fatigue: "12%",
        personnel: "8,200 fit / 8,500 present",
        equipment: "120 / 130 operational",
        supply: "Ammo 80 · Fuel 72 · Rations 90 · Parts 66",
        experience: "24 XP",
        honors: ["Crossing Citation"],
        battles: 2,
        currentOrderId: null,
        latestHistory: "Held the northern crossing."
      }]
    });
    root.querySelector<HTMLButtonElement>("[data-map-overlay-id='forces']")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='formation']")?.click();
  });

  await When("the player opens the desktop map list and selects that formation again", async () => {
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='formation']")?.click();
  });

  await Then("the hidden list row transfers focus to the current inspector route", async () => {
    if (document.activeElement?.id !== "campaignInspectorTitle"
      || root.querySelector<HTMLElement>("#campaignMapAccessibleList")?.hidden !== true
      || screen.getUIState().getSnapshot().selection?.id !== "formation-focus-1") {
      throw new Error("Replacing an already-open desktop inspector route did not retain a usable focus target.");
    }
    screen.destroy();
    root.remove();
    Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
    window.dispatchEvent(new Event("resize"));
  });
});

registerTest("CAMPAIGN_COMMAND_SCREEN_MOUNTS_MANAGED_COMPATIBILITY_BOUNDARY", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let screen: CampaignCommandScreen;

  await Given("the shipped campaign markup enters the feature-flagged composition root", async () => {
    root = mountFoundationFixture();
    screen = new CampaignCommandScreen(root, {}, { v2Enabled: true });
    if (!screen.initialize()) throw new Error("Managed campaign command screen did not initialize.");
    screen.render({
      ...createSafeView("First-Class Operation"),
      objectives: [{
        key: "primary-1",
        label: "Secure the operational objective",
        status: "In progress",
        category: "primary",
        progress: 0.25,
        detail: "The next decision is visible without opening another screen.",
        deadline: "Deadline Day 3",
        score: "0/100 pts"
      }],
      forces: [{ hexKey: "4,5", label: "1st Infantry Group", count: 3 }],
      orders: [{
        id: "order-1",
        kind: "redeploy",
        label: "Redeploy reserve",
        detail: "4,5 → 5,5",
        status: "committed",
        eta: "ETA Day 1, 03:00-06:00",
        validationMessages: [],
        canRemove: false,
        canCancel: true
      }],
      priorities: [{
        id: "objective:primary-1",
        severity: "notable",
        label: "Command priority",
        title: "Secure the operational objective",
        detail: "The next decision is visible without opening another screen.",
        actionLabel: "Review objective",
        targetKind: "objective",
        targetId: "primary-1"
      }]
    });
  });

  await When("objective, force-location, order, and formation selections use the shared route", async () => {
    root.querySelector<HTMLButtonElement>("[data-objective-key='primary-1']")?.click();
    if (screen.getUIState().getSnapshot().selection?.kind !== "objective"
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("Deadline Day 3")
      || !document.activeElement?.matches("[data-close-campaign-inspector]")) {
      throw new Error("Objective list selection did not reach the typed inspector.");
    }
    screen.showWorkspace("forces", false);
    root.querySelector<HTMLButtonElement>("[data-force-hex='4,5']")?.click();
    if (screen.getUIState().getSnapshot().selection?.kind !== "hex") {
      throw new Error("Force-location selection did not reach shared UI state.");
    }
    root.querySelector<HTMLButtonElement>("[data-order-id='order-1'] .campaign-order-card__inspect")?.click();
    if (screen.getUIState().getSnapshot().selection?.kind !== "order"
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("ETA Day 1")) {
      throw new Error("Order-tray selection did not reach the typed inspector.");
    }
    screen.navigate({ kind: "formation", id: "formation-9", focus: false });
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
  });

  await Then("feature, state, workspace, overlay, component, and safe DOM contracts remain synchronized", async () => {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (root.dataset.campaignCommandUi !== "v2" || root.dataset.campaignCommandState !== "managed"
      || root.dataset.campaignWorkspace !== "forces" || root.dataset.campaignOverlay !== "forces"
      || root.dataset.campaignSelection !== "formation") {
      throw new Error("Campaign composition-root state attributes are not synchronized.");
    }
    if (!root.querySelector(".campaign-command-bar") || !root.querySelector(".campaign-workspace-rail")
      || root.querySelector("[data-campaign-workspace-tab='forces']")?.getAttribute("aria-selected") !== "true") {
      throw new Error("Componentized campaign frame did not render the synchronized workspace.");
    }
    if (screen.getUIState().getSnapshot().openSheet !== null
      || !activeElement || !root.contains(activeElement) || activeElement.closest("[inert], [hidden]")
      || !root.textContent?.includes("Secure the operational objective")
      || root.querySelector("#campaignContextInspector")?.getAttribute("data-selection-kind") !== "formation"
      || (window.innerWidth <= 1120 && (
        !root.querySelector<HTMLElement>("#campaignContextInspector")?.inert
        || root.querySelector("#campaignContextInspector")?.getAttribute("aria-hidden") !== "true"
      ))
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("No Player-safe projected detail")) {
      throw new Error(`Compact close state or Situation command-priority rendering is not synchronized: ${JSON.stringify({
        openSheet: screen.getUIState().getSnapshot().openSheet,
        activeElement: activeElement?.id,
        priority: root.textContent?.includes("Secure the operational objective"),
        selectionKind: root.querySelector("#campaignContextInspector")?.getAttribute("data-selection-kind"),
        inspectorText: root.querySelector("#campaignContextInspectorRoute")?.textContent
      })}`);
    }
    assertCampaignCommandDOMSafe(root, ["AXIS-HIDDEN-SECRET"]);
    const leaked = document.createElement("div");
    leaked.dataset.truth = "AXIS-HIDDEN-SECRET";
    root.appendChild(leaked);
    if (findCampaignCommandDOMLeaks(root, ["AXIS-HIDDEN-SECRET"]).length !== 1) {
      throw new Error("Campaign DOM leak helper did not detect an attribute leak.");
    }
  });
});

registerTest("CAMPAIGN_FCI4_ACTION_REGISTRY_AND_COMPOSER_ARE_AUTHORITATIVE_AND_COMMON", async ({ Given, When, Then }) => {
  let providerCalls = 0;
  const registry = new CampaignActionRegistry((actionId, context) => {
    providerCalls += 1;
    if (actionId === "redeploy" && context.selectionId === "4,5") {
      return {
        availability: "blocked",
        reasonCode: "ORDER_FORCE_UNAVAILABLE",
        reason: "No uncommitted force is available at this origin.",
        correctiveAction: "Release an earlier movement draft.",
        mapHexKeys: ["4,5"]
      };
    }
    return { availability: "available", reasonCode: null, reason: null, correctiveAction: null, mapHexKeys: [] };
  });
  let composer: HTMLElement;

  await Given("a UI registry backed only by an authoritative preview provider", async () => {
    composer = document.createElement("form");
  });

  await When("a blocked selected-hex action is resolved and two order kinds decorate their composers", async () => {
    const descriptor = registry.resolve("redeploy", { selectionKind: "hex", selectionId: "4,5" });
    if (descriptor.availability !== "blocked" || descriptor.reasonCode !== "ORDER_FORCE_UNAVAILABLE"
      || descriptor.correctiveAction !== "Release an earlier movement draft.") {
      throw new Error("Action registry changed or inferred the provider's authoritative reason result.");
    }
    decorateCampaignOrderComposer(composer, "redeploy", "4,5 to 5,5");
    decorateCampaignOrderComposer(composer, "production", "Next daily allocation", true);
  });

  await Then("the registry was queried and the idempotent seven-stage schema remains identical across order kinds", async () => {
    const stages = Array.from(composer.querySelectorAll<HTMLElement>("[data-order-stage]")).map((entry) => entry.dataset.orderStage);
    const schema = getCampaignOrderComposerSchema("counterIntelligence");
    if (providerCalls !== 1 || composer.querySelectorAll(".campaign-order-composer__guide").length !== 1
      || stages.length !== 7 || stages.join(",") !== schema.stages.map((stage) => stage.id).join(",")
      || composer.dataset.orderMode !== "edit" || composer.dataset.orderKind !== "production") {
      throw new Error("Common schema decoration did not preserve one idempotent seven-stage order journey.");
    }
  });
});
