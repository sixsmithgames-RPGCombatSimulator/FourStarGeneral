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
import {
  projectCampaignAfterActionDecisionTargetId,
  projectCampaignAfterActionInfrastructureEffect,
  projectCampaignAfterActionTitle,
  projectRuntimeHexKeyToCampaignOffset,
  shouldPresentCampaignAfterActionDecision
} from "../src/ui/campaign/CampaignCommandProjection";
import {
  describeCampaignAssociatedLocations,
  projectCampaignAssociatedLocations,
  resolveCampaignFriendlyBaseSummary,
  resolveCampaignTheaterRegionPresentation
} from "../src/ui/campaign/CampaignPresentation";
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
          <section class="map-controls-section"><button id="campaignZoomOut">−</button><button id="campaignTheaterOverview" aria-pressed="false">Theater overview</button><button id="campaignActiveFrontView" aria-pressed="true">Active front</button><button id="campaignZoomIn">+</button></section>
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
    if (intel.workspace !== "intelligence" || intel.overlay !== "intelligence" || intel.selection !== null) {
      throw new Error("Unvalidated intelligence alert IDs were promoted into contact selections.");
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

registerTest("CAMPAIGN_FRIENDLY_BASE_INSPECTOR_IS_HIERARCHICAL_EXACT_AND_ACTIONABLE", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let screen: CampaignCommandScreen;
  let originalWidth: number;

  await Given("a friendly logistics base with ready, committed, and arriving exact formations", async () => {
    originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    root = mountFoundationFixture();
    const selectionInfo = root.querySelector<HTMLElement>("#campaignSelectionInfo");
    if (selectionInfo) {
      selectionInfo.innerHTML = `<div class="campaign-context-actions"><button type="button" data-plan-campaign-redeploy>Plan redeployment</button></div>`;
    }
    const queue = root.querySelector<HTMLButtonElement>("#campaignQueueEngagement");
    if (queue) {
      queue.disabled = true;
      queue.textContent = "Queue Tactical Engagement";
    }
    screen = new CampaignCommandScreen(root, {}, { v2Enabled: true });
    if (!screen.initialize()) throw new Error("Managed campaign inspector did not initialize.");
    const formation = (
      id: string,
      name: string,
      statusLabel: string,
      availabilityLabel: string | null,
      currentOrderId: string | null
    ) => ({
      id,
      name,
      commandLabel: "First Army",
      hasAuthoredSubordinateIdentity: true,
      typeLabel: "Infantry",
      ownershipLabel: "Core",
      locationHexKey: "4,5",
      statusLabel,
      ...(availabilityLabel ? { availabilityLabel } : {}),
      readiness: "88%",
      cohesion: "91%",
      fatigue: "12%",
      personnel: "8,200 fit / 8,500 present",
      equipment: "120 / 130 operational",
      supply: "Ammo 80 · Fuel 72 · Rations 90 · Parts 66",
      experience: "24 XP",
      honors: [],
      battles: 0,
      currentOrderId,
      latestHistory: null
    });
    screen.render({
      ...createSafeView("Base Inspector Test"),
      formations: [
        formation("ready-1", "1st Infantry Division", "Ready", null, null),
        formation("committed-1", "Armored Reserve", "Committed", null, "order-1"),
        formation("arriving-1", "90th Infantry Division", "Unavailable", "D+1 · 7 June 1944, 06:00–09:00", null),
        {
          ...formation("arriving-2", "2nd Infantry Division", "Unavailable", "D+1 · 7 June 1944, 09:00–12:00", null),
          locationHexKey: "8,8"
        }
      ],
      hexes: [{
        hexKey: "4,5",
        roleLabel: "Logistics Hub",
        controlLabel: "Friendly control",
        presentation: "friendlyBase",
        displayLabel: "First Army Depot",
        summary: "Stages supplies and follow-on formations for the lodgment.",
        locationLabel: "First Army Depot · hex 4,5",
        showSelectionActions: true,
        showEngagementAction: false,
        forces: ["1st Infantry Division · 1", "Armored Reserve · 1"],
        capabilities: ["9 daily Allied support capacity"],
        infrastructure: "Logistics Hub · intact · 100/100 integrity",
        objectives: ["Sustain the lodgment"],
        fronts: []
      }, {
        hexKey: "8,8",
        roleLabel: "Logistics Hub",
        controlLabel: "Friendly control",
        presentation: "friendlyBase",
        displayLabel: "Bristol",
        summary: "Stages the next wave of follow-on formations.",
        showSelectionActions: false,
        showEngagementAction: false,
        actionSummary: "No order is available here yet. First formation arrives D+1 · 7 June 1944, 09:00–12:00.",
        forces: [],
        capabilities: ["9 daily Allied support capacity"],
        infrastructure: null,
        objectives: [],
        fronts: []
      }],
      orders: [{
        id: "order-1",
        kind: "redeploy",
        label: "Move armored reserve",
        detail: "Reserve movement",
        status: "committed",
        eta: "D+1 · 7 June 1944, 03:00–06:00",
        validationMessages: [],
        canRemove: false,
        canCancel: true
      }]
    });
  });

  await When("the commander inspects the base and drills into an arriving formation", async () => {
    screen.revealInspector({ kind: "hex", id: "4,5" });
  });

  await Then("the inspector keeps one readable hierarchy, exact identities, and only the relevant action", async () => {
    const inspector = root.querySelector<HTMLElement>("#campaignContextInspector");
    const body = inspector?.querySelector<HTMLElement>(".campaign-context-inspector__body");
    const route = inspector?.querySelector<HTMLElement>("#campaignContextInspectorRoute");
    const footer = inspector?.querySelector<HTMLElement>(".campaign-context-inspector__action-footer");
    const headings = Array.from(inspector?.querySelectorAll("h3, h4") ?? []).map((entry) => entry.textContent?.trim());
    const routeCopy = route?.textContent ?? "";
    const nameOccurrences = (routeCopy.match(/1st Infantry Division/g) ?? []).length;
    if (inspector?.getAttribute("aria-labelledby") !== "campaignInspectorTitle"
      || inspector?.dataset.presentation !== "friendlyBase"
      || headings.indexOf("Embarkation port") < 0
      || headings.indexOf("Assigned commands") <= headings.indexOf("Embarkation port")
      || headings.indexOf("Orders") <= headings.indexOf("Assigned commands")
      || !headings.includes("Ready now (1)")
      || !headings.includes("Committed or in transit (1)")
      || !headings.includes("Arriving here (1)")
      || routeCopy.includes("Projected forces")
      || routeCopy.includes("4,5")
      || routeCopy.includes("Cohesion")
      || nameOccurrences !== 1
      || route?.querySelectorAll("[data-campaign-formation-id]").length !== 3
      || footer?.hidden
      || !footer?.querySelector("[data-plan-campaign-redeploy]")
      || !root.querySelector<HTMLElement>(".action-section")?.hidden
      || root.querySelector("#campaignInspectorStatus")?.textContent !== "Selected First Army Depot.") {
      throw new Error(`Friendly-base hierarchy remained duplicated, ambiguous, or action-cluttered: '${inspector?.textContent ?? ""}'.`);
    }

    if (!body) throw new Error("The inspector has no independent scrolling body.");
    body.scrollTop = 240;
    route?.querySelector<HTMLButtonElement>('[data-campaign-formation-id="arriving-1"]')?.click();
    const formationCopy = route?.textContent ?? "";
    const back = route?.querySelector<HTMLButtonElement>("[data-campaign-map-hex-target]");
    if (body.scrollTop !== 0
      || !formationCopy.includes("Cohesion")
      || !formationCopy.includes("D+1 · 7 June 1944")
      || back?.textContent !== "Back to First Army Depot"
      || footer?.hidden !== true) {
      throw new Error(`Formation drill-in lost detail, base return, or scroll reset: '${formationCopy}'.`);
    }
    body.scrollTop = 180;
    back.click();
    if (body.scrollTop !== 0
      || inspector?.dataset.presentation !== "friendlyBase"
      || !route?.textContent?.includes("Assigned commands")) {
      throw new Error("Returning from exact formation detail did not restore the base at the top of its route.");
    }
    screen.revealInspector({ kind: "hex", id: "8,8" });
    const summary = footer?.querySelector<HTMLElement>(".campaign-context-inspector__action-summary");
    if (footer?.hidden
      || summary?.hidden
      || !summary?.textContent?.includes("First formation arrives D+1")
      || !root.querySelector<HTMLElement>(".selection-section")?.hidden
      || !root.querySelector<HTMLElement>(".action-section")?.hidden) {
      throw new Error("A scheduled-only base did not retain concise next-availability copy without irrelevant controls.");
    }
    screen.destroy();
    root.remove();
    Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
    window.dispatchEvent(new Event("resize"));
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
    const selectionInfo = root.querySelector<HTMLElement>("#campaignSelectionInfo");
    if (selectionInfo) {
      selectionInfo.innerHTML = `<div class="campaign-context-actions"><button type="button" data-plan-campaign-redeploy>Plan redeployment</button></div>`;
    }
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
      knownSites: [{
        id: "briefed-site-1",
        label: "Charted relay station",
        locationHexKey: "6,5",
        roleLabel: "Intel node",
        summary: "The fixed relay location is known; its current control and activity are unconfirmed.",
        sourceLabel: "Theater signals directory",
        categoryLabel: "Known opposing installation",
        locationPrecision: "fixed",
        relatedLocations: []
      }, {
        id: "briefed-site-2",
        label: "Known rail yard",
        locationHexKey: "5,5",
        roleLabel: "Logistics Hub",
        summary: "The fixed rail-yard location is known; current activity is unconfirmed.",
        sourceLabel: "Pre-operation aerial survey",
        categoryLabel: "Known opposing installation",
        locationPrecision: "fixed",
        relatedLocations: []
      }],
      knownRegions: [{
        id: "region-thames",
        label: "Thames and Nore reinforcement ports",
        categoryLabel: "Allied theater support",
        summary: "British follow-on forces and stores are assembled through the eastern ports.",
        sourceLabel: "NEPTUNE loading and assembly plan",
        locations: ["Tilbury", "Harwich"],
        commandStatus: "Briefing only · outside the opening D+1 command area"
      }],
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
      }, {
        id: "formation-3",
        name: "Theater Training Reserve",
        typeLabel: "Infantry",
        ownershipLabel: "Reserve",
        locationHexKey: "9,9",
        statusLabel: "Unavailable",
        availabilityLabel: "D+2 · 8 June 1944, 00:00–03:00",
        readiness: "95%",
        cohesion: "94%",
        fatigue: "2%",
        personnel: "7,900 fit / 8,000 present",
        equipment: "100 / 102 operational",
        supply: "Ammo 95 · Fuel 90 · Rations 98 · Parts 85",
        experience: "4 XP",
        honors: [],
        battles: 0,
        currentOrderId: null,
        latestHistory: "Scheduled to become available D+2 · 8 June 1944, 00:00–03:00."
      }],
      hexes: [{
        hexKey: "4,5",
        roleLabel: "Logistics Hub",
        controlLabel: "Friendly control",
        presentation: "friendlyBase",
        displayLabel: "First Army Depot",
        summary: "Named friendly supply base.",
        locationLabel: "First Army Depot · hex 4,5",
        historicalNetwork: ["First Army Depot", "Tilbury", "Harwich"],
        showSelectionActions: true,
        showEngagementAction: false,
        forces: ["1st Infantry Group · 3"],
        capabilities: ["9 daily Allied support capacity"],
        infrastructure: "logistics hub · damaged · 80/100 integrity · 80% effective",
        objectives: ["Secure the crossing"],
        fronts: ["Northern front"]
      }, {
        hexKey: "6,5",
        roleLabel: "Intel node",
        controlLabel: "Current control unconfirmed",
        displayLabel: "Charted relay station",
        summary: "The fixed relay location is known; its current control and activity are unconfirmed.",
        locationLabel: "Charted relay station · hex 6,5",
        sourceLabel: "Theater signals directory",
        hasContextActions: false,
        forces: [],
        infrastructure: null,
        objectives: [],
        fronts: []
      }],
      contacts: [{
        id: "contact-1",
        label: "Armored activity",
        locationHexKey: "5,5",
        locationLabel: "Known rail yard",
        locationRoleLabel: "Logistics Hub",
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
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    if (!root.querySelector("[data-map-list-selection-kind='hex'][data-map-list-selection-id='6,5']")
      || !root.querySelector("[data-map-list-selection-kind='hex'][data-map-list-selection-id='4,5']")
      || !root.querySelector("[data-map-list-selection-kind='theaterRegion'][data-map-list-selection-id='region-thames']")
      || !root.querySelector(".campaign-map-list-toggle")?.getAttribute("aria-label")?.includes("5 map records")) {
      throw new Error("Operational map list omitted the named friendly base or fixed briefing-site record.");
    }
    const operationalMapListCopy = root.querySelector(".campaign-map-accessible-list")?.textContent ?? "";
    if (/historical locations|supporting network/i.test(operationalMapListCopy)
      || !operationalMapListCopy.includes("associated locations")) {
      throw new Error(`Operational map list exposed authoring language instead of concrete place types: ${operationalMapListCopy}`);
    }
    root.querySelector<HTMLButtonElement>("[data-close-map-list]")?.click();
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
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("Tilbury")
      || root.querySelector<HTMLElement>(".campaign-context-inspector__action-footer")?.hidden
      || root.querySelector<HTMLElement>(".selection-section")?.hidden
      || !root.querySelector<HTMLElement>(".action-section")?.hidden
      || !root.querySelector("[data-plan-campaign-redeploy]")) {
      throw new Error("Typed hex detail did not preserve the domain-owned legal-action surface.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    screen.revealInspector({ kind: "formation", id: "formation-2" });
    const orderedFormationInspector = root.querySelector("#campaignContextInspectorRoute")?.textContent ?? "";
    if (!orderedFormationInspector.includes("Redeploy formation")
      || !orderedFormationInspector.includes("committed")
      || !orderedFormationInspector.includes("ETA Day 1")
      || orderedFormationInspector.includes("order-map-1")) {
      throw new Error("Formation inspector exposed a raw order ID instead of its player-facing operation state.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-overlay-id='intelligence']")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    if (!root.querySelector("[data-map-list-selection-kind='hex'][data-map-list-selection-id='6,5']")
      || !root.querySelector(".campaign-map-list-toggle")?.getAttribute("aria-label")?.includes("3 map records")
      || root.querySelector("[data-map-list-selection-kind='hex'][data-map-list-selection-id='5,5']")) {
      throw new Error("Intelligence map list omitted the fixed briefing-site record.");
    }
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='contact']")?.click();
    const contactInspector = root.querySelector("#campaignContextInspectorRoute")?.textContent ?? "";
    if (!contactInspector.includes("high confidence")
      || !contactInspector.includes("Known rail yard")
      || !contactInspector.includes("Logistics Hub")) {
      throw new Error("Safe contact detail did not reach the typed inspector.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='theaterRegion']")?.click();
    const regionInspector = [
      root.querySelector("#campaignInspectorTitle")?.textContent,
      root.querySelector("#campaignContextInspectorRoute")?.textContent
    ].filter(Boolean).join(" ");
    if (!regionInspector.includes("Thames and Nore reinforcement ports")
      || !regionInspector.includes("Tilbury")
      || !regionInspector.includes("outside the opening D+1 command area")
      || !root.querySelector<HTMLElement>(".action-section")?.hidden) {
      throw new Error("Non-geocoded theater context did not remain searchable, sourced, and non-orderable.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-list-selection-kind='hex'][data-map-list-selection-id='6,5']")?.click();
    const siteInspector = root.querySelector("#campaignContextInspectorRoute")?.textContent ?? "";
    if (!siteInspector.includes("Current control unconfirmed")
      || !siteInspector.includes("Theater signals directory")
      || !root.querySelector<HTMLElement>(".action-section")?.hidden) {
      throw new Error("Briefed site inspector leaked live status or exposed runtime actions.");
    }
    root.querySelector<HTMLButtonElement>("[data-close-campaign-inspector]")?.click();
    root.querySelector<HTMLButtonElement>("[data-map-overlay-id='forces']")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle")?.click();
    if (!root.querySelector(".campaign-map-accessible-list__status")?.textContent?.includes("2 relevant of 3 formations")
      || root.querySelectorAll("[data-map-list-selection-kind='formation']").length !== 2) {
      throw new Error("The default force list did not prioritize only active fronts and objective ground.");
    }
    const search = root.querySelector<HTMLInputElement>("[aria-label='Search current map list']");
    if (search) {
      search.value = "Infantry";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (root.querySelectorAll("[data-map-list-selection-kind='formation']").length !== 1
      || !root.querySelector(".campaign-map-accessible-list__status")?.textContent?.includes("1 of 3")) {
      throw new Error("Large-roster map-list search did not filter with a live count.");
    }
    screen.setRedeploymentTargetMode("4,5", [
      { hexKey: "5,5", label: "Opposing ground · 5,5", available: false, reason: "Redeployment cannot enter opposing control." },
      { hexKey: "4,6", label: "Friendly ground · 4,6", available: true, reason: null }
    ]);
    const destinationToggle = root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle");
    const destinationSearch = root.querySelector<HTMLInputElement>("[aria-label='Search current map list']");
    if (destinationSearch) {
      destinationSearch.value = "4,6";
      destinationSearch.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (root.querySelectorAll("[data-map-list-selection-kind='hex']").length !== 1
      || root.querySelector("[data-map-list-selection-kind='formation']")
      || !root.querySelector(".campaign-map-accessible-list__status")?.textContent?.includes("1 of 2 destinations shown")) {
      throw new Error("Redeployment search switched from destination hexes to force records.");
    }
    if (destinationSearch) {
      destinationSearch.value = "";
      destinationSearch.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const blockedDestination = root.querySelector<HTMLButtonElement>("[data-map-list-selection-id='5,5']");
    const legalDestination = root.querySelector<HTMLButtonElement>("[data-map-list-selection-id='4,6']");
    if (destinationToggle?.textContent?.trim() !== "Destinations (2)"
      || !destinationToggle.getAttribute("aria-label")?.includes("2 destination hexes")
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
    screen.revealInspector({ kind: "formation", id: "formation-3" });
    const scheduledInspector = root.querySelector("#campaignContextInspectorRoute")?.textContent ?? "";
    if (!scheduledInspector.includes("AvailableD+2 · 8 June 1944, 00:00–03:00")
      || !scheduledInspector.includes("Scheduled to become available")
      || /segment\s+\d+/i.test(scheduledInspector)) {
      throw new Error(`Scheduled formation ETA was not player-facing: ${scheduledInspector}`);
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

registerTest("CAMPAIGN_AAR_COORDINATES_PROJECT_TO_OPERATIONAL_MAP_IDENTITY", async ({ Given, When, Then }) => {
  let locationHexKey: string | null = null;
  let fallbackTitle = "";
  let objectiveTitle = "";
  let infrastructureTarget: string | null = null;
  let formationTarget: string | null = null;

  await Given("an immutable battle report recorded at runtime axial hex 29,9", () => {});
  await When("the report and its required decision cross into the operational command interface", () => {
    locationHexKey = projectRuntimeHexKeyToCampaignOffset("29,9");
    fallbackTitle = projectCampaignAfterActionTitle("After action: 29,9", null, "29,9");
    objectiveTitle = projectCampaignAfterActionTitle("After action: Secure the bridge", "Secure the bridge", "29,9");
    infrastructureTarget = projectCampaignAfterActionDecisionTargetId("infrastructure", "29,9");
    formationTarget = projectCampaignAfterActionDecisionTargetId("formation", "formation-1");
  });
  await Then("player-facing coordinates use the matching offset hex without changing non-coordinate identities", () => {
    if (locationHexKey !== "29,23"
      || fallbackTitle !== `After action: ${locationHexKey}`
      || objectiveTitle !== "After action: Secure the bridge"
      || infrastructureTarget !== locationHexKey
      || formationTarget !== "formation-1") {
      throw new Error(
        `AAR projection mixed runtime and operational coordinates: location='${locationHexKey}', title='${fallbackTitle}', objective='${objectiveTitle}', infrastructure='${infrastructureTarget}', formation='${formationTarget}'.`
      );
    }
  });
});

registerTest("CAMPAIGN_AAR_PROJECTION_DISTINGUISHES_CAPTURE_REORGANIZATION_FROM_RECONSTRUCTION", async ({ Given, When, Then }) => {
  const intactAudit = { integrity: 160, maxIntegrity: 160, captureDisruptionUntilSegment: 8 };
  const damagedAudit = { integrity: 90, maxIntegrity: 160, captureDisruptionUntilSegment: 8 };
  let staleRepairVisible = true;
  let otherInfrastructureDecisionVisible = false;
  let damagedRepairVisible = false;
  let intactEffect = "";
  let damagedEffect = "";

  await Given("an affected saved repair prompt, an intact captured fort, and a genuinely damaged captured fort", () => {});
  await When("the reports cross the command presentation boundary", () => {
    staleRepairVisible = shouldPresentCampaignAfterActionDecision("infrastructure", "Repair the battle area", intactAudit);
    otherInfrastructureDecisionVisible = shouldPresentCampaignAfterActionDecision("infrastructure", "Assign the port commandant", intactAudit);
    damagedRepairVisible = shouldPresentCampaignAfterActionDecision("infrastructure", "Reconstruct the battle area", damagedAudit);
    intactEffect = projectCampaignAfterActionInfrastructureEffect({
      roleLabel: "Heavy fortification",
      integrityBefore: 160,
      infrastructureAfter: intactAudit,
      effectivenessAfter: 0.5,
      disruptionTimeLabel: "D+2 · 8 June 1944, 00:00–03:00"
    }) ?? "";
    damagedEffect = projectCampaignAfterActionInfrastructureEffect({
      roleLabel: "Heavy fortification",
      integrityBefore: 160,
      infrastructureAfter: damagedAudit,
      effectivenessAfter: 0.5,
      disruptionTimeLabel: "D+2 · 8 June 1944, 00:00–03:00"
    }) ?? "";
  });
  await Then("only the obsolete false repair is suppressed and both operational effects remain truthful", () => {
    if (staleRepairVisible
      || !otherInfrastructureDecisionVisible
      || !damagedRepairVisible
      || !intactEffect.includes("captured intact")
      || !intactEffect.includes("new garrison reorganizes")
      || !intactEffect.includes("full capacity returns D+2")
      || !damagedEffect.includes("160 → 90 integrity")
      || !damagedEffect.includes("garrison reorganization continues until D+2")) {
      throw new Error(`Capture and repair projection diverged: ${JSON.stringify({ staleRepairVisible, otherInfrastructureDecisionVisible, damagedRepairVisible, intactEffect, damagedEffect })}.`);
    }
  });
});

registerTest("CAMPAIGN_PRESENTATION_USES_PERIOD_OPERATIONAL_LANGUAGE_WITHOUT_MUTATING_AUTHORED_TRUTH", async ({ Given, When, Then }) => {
  let regionPresentation: ReturnType<typeof resolveCampaignTheaterRegionPresentation>;
  let associatedLocations: string[];

  await Given("authored campaign data retains exact research provenance and consolidated place identities", async () => {});

  await When("the command UI projects a list-only support region and an embarkation base", async () => {
    regionPresentation = resolveCampaignTheaterRegionPresentation({
      id: "briefed_thames_nore",
      label: "Thames and Nore build-up network",
      category: "alliedSupport",
      summary: "Research-facing regional summary.",
      sourceLabel: "U.S. Naval History and Heritage Command NEPTUNE loading and assembly plan",
      commandStatus: "Known Allied support outside the opening D+1 order network"
    });
    associatedLocations = projectCampaignAssociatedLocations("Plymouth", ["Plymouth", "Torbay", "Dartmouth"]);
  });

  await Then("the field presentation uses concrete places, period commands, and no redundant principal location", async () => {
    const combined = Object.values(regionPresentation).join(" ");
    if (/historical locations|supporting network|build-up network|History and Heritage Command/i.test(combined)
      || regionPresentation.label !== "Thames and Nore reinforcement ports"
      || regionPresentation.categoryLabel !== "Allied theater support"
      || regionPresentation.sourceLabel !== "NEPTUNE loading and assembly plan"
      || associatedLocations.join(",") !== "Torbay,Dartmouth"
      || describeCampaignAssociatedLocations("Logistics and embarkation", associatedLocations.length) !== "2 associated ports"
      || resolveCampaignFriendlyBaseSummary("Plymouth", "Western embarkation network")
        !== "Western embarkation ports supporting Utah-bound forces and stores.") {
      throw new Error(`Campaign presentation leaked authoring language or redundant locations: ${JSON.stringify({ regionPresentation, associatedLocations })}`);
    }
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
    const search = root.querySelector<HTMLInputElement>(".campaign-map-accessible-list__search input");
    if (!search) throw new Error("Full-roster force search is unavailable.");
    search.value = "1st Infantry";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
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
        validationMessages: ["The selected formation is no longer ready."],
        validationIssues: [{
          code: "ORDER_FORCE_UNAVAILABLE",
          message: "The selected formation is no longer ready.",
          correctiveAction: "Choose another ready formation."
        }],
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
    const orderInspectorCopy = root.querySelector("#campaignContextInspectorRoute")?.textContent ?? "";
    if (screen.getUIState().getSnapshot().selection?.kind !== "order"
      || !orderInspectorCopy.includes("ETA Day 1")
      || !orderInspectorCopy.includes("Requires attention")
      || orderInspectorCopy.includes("ORDER_FORCE_UNAVAILABLE")) {
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
      || !root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("No current Player-safe assessment")) {
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
