/**
 * MODULE: CampaignCommandShell.test
 * WHAT: Certifies Campaign 2.0 shell regions, keyboard workspaces, safe rendering, developer gating, and selection-only map behavior.
 * WHY: The M1 shell must improve campaign interaction without leaking truth or reintroducing direct map mutations.
 *
 * DEPENDENCIES: Custom harness, jsdom, shipped campaign01, CampaignCommandShell, and CampaignScreen.
 * EXPORTS: Registered C20-010/C20-011 certification tests.
 */

import "./domEnvironment.js";
import "./CampaignSituationFirstFrame.test.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import { CAMPAIGN_SEGMENT_HOURS, type CampaignScenarioData } from "../src/core/campaignTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import { CAMPAIGN_LEGACY_SAVE_KEY, CAMPAIGN_PRIMARY_SAVE_SLOT_ID, CampaignState, ensureCampaignState, type CampaignStatePersistenceRequest } from "../src/state/CampaignState";
import { UnlockState } from "../src/state/UnlockState";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { buildCampaignSaveCanonicalScenario, buildLegacyCampaignSaveV2Raw } from "./fixtures/CampaignSaveLegacy.fixtures.js";
import { buildCompleteActiveBattleSave } from "./TacticalSaveCompleteness.test.js";
import { scenarioFixture, contextFixture, tacticalStateFixture, missionStatus } from "./CampaignBattleResultExtraction.test.js";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import { createCampaignFormationBattleSeed } from "../src/game/campaign/formations/CampaignFormationBattleAdapter";
import { CampaignSaveRepository } from "../src/game/campaign/persistence/CampaignSaveRepository";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";
import { CampaignCommandShell } from "../src/ui/campaign/CampaignCommandShell";
import {
  CampaignScreen,
  projectCampaignAfterActionFormationEffects
} from "../src/ui/screens/CampaignScreen";
import { MapViewport } from "../src/ui/controls/MapViewport";

/** Builds the compatibility markup required for shell composition without loading index.html. */
function mountCommandShellFixture(includeDeveloperTemplates = false): HTMLElement {
  document.body.innerHTML = `
    <div id="campaignScreen">
      <div class="campaign-layout">
        <div class="campaign-map">
          <h2>Campaign map</h2>
          <div class="campaign-map-viewport"><div id="campaignMapCanvas"><svg id="campaignHexMap"></svg></div></div>
        </div>
        <aside class="campaign-sidebar">
          <section class="sidebar-section time-section"><div id="campaignTimeDisplay"></div><button id="campaignAdvanceSegment"><span class="btn-icon"></span><span class="btn-label"></span></button></section>
          <section class="sidebar-section campaign-intel-section"><button id="campaignIntelToggle"></button><button id="campaignIntelCoverage"></button><div id="campaignIntelSummary"></div><span id="campaignIntelUnread"></span></section>
          <section class="sidebar-section economy-section"><div id="campaignEconomySummary"></div></section>
          <section class="sidebar-section production-section"><div id="campaignProductionSummary"></div><button id="campaignProductionManage"></button></section>
          <section class="sidebar-section map-controls-section"><button id="campaignZoomOut">−</button><button id="campaignTheaterOverview" aria-pressed="false">Theater overview</button><button id="campaignActiveFrontView" aria-pressed="true">Active front</button><button id="campaignZoomIn">+</button></section>
          <section class="sidebar-section session-section"><div class="session-controls"><button id="campaignSave" class="session-btn">Save</button><button id="campaignLoad" class="session-btn">Load</button><button id="campaignBattleSaves" class="session-btn">Battles</button><button id="campaignExit" class="session-btn">Exit</button></div></section>
          ${includeDeveloperTemplates ? `
            <template id="campaignDeveloperSessionTemplate"><button id="campaignEditMode">Edit</button></template>
            <template id="campaignDeveloperEditorTemplate"><section id="campaignEditPanel"><button id="campaignExportJSON">Export</button></section></template>
          ` : ""}
          <section class="sidebar-section selection-section"><div id="campaignSelectionInfo"></div></section>
          <div class="action-section"><button id="campaignQueueEngagement"></button></div>
        </aside>
        <aside id="campaignIntelDrawer" class="campaign-intel-drawer hidden"><div id="campaignIntelBody"></div></aside>
      </div>
    </div>
  `;
  const root = document.getElementById("campaignScreen");
  if (!root) throw new Error("Campaign command shell fixture did not mount.");
  return root;
}

/** Mounts the real Screen producer with isolated state before it captures subscriptions and callbacks. */
function mountIsolatedCampaignScreen(state: CampaignState): { root: HTMLElement; screen: CampaignScreen; unlock: UnlockState } {
  const root = mountCommandShellFixture();
  const renderer = {
    render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {}, setIntelContactsVisible() {},
    getViewportRoot() { return null; }, getHexCenter() { return { cx: 0, cy: 0 }; },
    onHexClick() {}, clearAllHighlights() {}, highlightHex() {}
  };
  // Screen currently constructs its singleton privately; replace only this instance before initialize wires it.
  const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
  Object.defineProperty(screen, "campaignState", { value: state });
  // Gameplay-dialog tests need an entitled commander. Keep this authority local
  // to the fixture; access denial and hydration are covered by CampaignAccessGate.
  const unlock = new UnlockState();
  unlock.hydrate({ resolved: true, isAuthenticated: true, email: null, subscriptionStatus: null,
    planIds: [], isPrivileged: true, isGuest: false });
  Object.defineProperty(screen, "unlockState", { value: unlock });
  screen.initialize();
  assert.equal(document.getElementById("campaignLockOverlay"), null);
  return { root, screen, unlock };
}

registerTest("FSG_CAM_109_SCREEN_DISPOSAL_RELEASES_VIEWPORT_AND_STATE_SUBSCRIPTIONS", () => {
  const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
  const scenario = scenarioFixture();
  state.setScenario(scenario);
  const originalDispose = MapViewport.prototype.dispose;
  let viewportDisposals = 0;
  MapViewport.prototype.dispose = function auditedViewportDispose(): void {
    viewportDisposals += 1;
    originalDispose.call(this);
  };
  let mounted: ReturnType<typeof mountIsolatedCampaignScreen> | null = null;
  try {
    mounted = mountIsolatedCampaignScreen(state);
    mounted.screen.renderScenario(scenario);
    const internal = mounted.screen as unknown as { viewport: MapViewport | null };
    assert.ok(internal.viewport, "Rendering the campaign must create its viewport owner.");
    mounted.screen.disposeCampaignAccessGate();
    assert.equal(viewportDisposals, 1, "Campaign disposal must release the current viewport exactly once.");
    assert.equal(internal.viewport, null);
    state.setScenario(structuredClone(scenario));
    assert.equal(internal.viewport, null, "Disposed campaign-state subscriptions must not recreate a viewport.");
  } finally {
    if ((mounted?.screen as unknown as { viewport: MapViewport | null } | undefined)?.viewport) {
      mounted?.screen.disposeCampaignAccessGate();
    }
    MapViewport.prototype.dispose = originalDispose;
  }
});

/** Uses the shipped popup structure, outside the campaign root that becomes inert while it is open. */
function appendCampaignPopupFixture(): HTMLElement {
  document.body.insertAdjacentHTML("beforeend", `
    <div id="battlePopupLayer" class="popup-layer hidden" aria-hidden="true">
      <div class="battle-popup" role="dialog" aria-labelledby="battle-popup-title">
        <div class="popup-header"><h2 id="battle-popup-title" data-popup-title></h2>
          <button id="battlePopupClose" type="button" aria-label="Close popup"><span aria-hidden="true">×</span></button>
        </div><div data-popup-body></div>
      </div>
    </div>
  `);
  return document.getElementById("battlePopupLayer")!;
}

/** Waits for an observable UI boundary, with a bounded failure instead of timing-dependent sleeps. */
function waitForCampaignDom(predicate: () => boolean): Promise<void> {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new window.MutationObserver(() => {
      if (!predicate()) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error("Campaign control did not reach its expected DOM boundary."));
    }, 5000);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  });
}

registerTest("CAMPAIGN_COMMAND_SHELL_COMPOSES_SAFE_KEYBOARD_WORKSPACE", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let shell: CampaignCommandShell;
  let openedIntelligence = 0;
  let advancedMode = "";
  let pausePreference = false;
  let savedFromCommandBar = 0;

  await Given("the shipped campaign controls enter the Campaign 2.0 shell", async () => {
    root = mountCommandShellFixture();
    root.querySelector("#campaignSave")?.addEventListener("click", () => { savedFromCommandBar += 1; });
    shell = new CampaignCommandShell(root, {
      onOpenIntelligence: () => { openedIntelligence += 1; },
      onAdvance: (mode) => { advancedMode = mode; },
      onPauseAfterEveryResolutionChanged: (enabled) => { pausePreference = enabled; }
    });
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render({
      theaterTitle: "<Western Europe>",
      campaignPhase: "Opening phase",
      timeLabel: "Day 1, 00:00-03:00",
      commandStatus: "Orders Ready",
      saveStatus: "Unsaved",
      unreadReports: 2,
      resources: [{ key: "supply", label: "Supply", value: "12,500" }],
      objectives: [{
        key: "obj-1",
        label: "Secure <Port>",
        status: "In progress",
        detail: "Hold the operational port and its approaches.",
        progressLabel: "Hold for 2 more segments · installation 100% / 50% required",
        progressCurrent: 0,
        progressTarget: 2,
        conditionLabels: ["Hold streak 0 / 2", "Installation 100% / 50%"],
        nextAction: "Keep the port under friendly control, then advance to the next report.",
        deadline: "Deadline Day 2",
        failureEffect: "Lose access to heavy equipment.",
        hexKey: "27,37"
      }, {
        key: "obj-2",
        label: "Capture the airfield",
        status: "Upcoming",
        progressLabel: "Awaiting evaluation",
        deadline: "Day 4",
        hexKey: "29,39"
      }],
      forces: [{ hexKey: "2,3", label: "1st <Division>", count: 3 }],
      airPower: 8,
      navalPower: 4,
      navalSupport: { availableSupportAssignments: 0, availableFireMissions: 0, fireMissionsPerAssignment: 2, readySourceIds: [], sources: [] },
      intelligenceCapacity: "2/3 available",
      orders: [{
        id: "order-1",
        kind: "redeploy",
        label: "Redeploy <Reserve>",
        detail: "2,3 → 4,5",
        status: "committed",
        eta: "ETA Day 1, 03:00-06:00",
        validationMessages: [],
        canRemove: false,
        canCancel: true
      }],
      advance: {
        mode: "nextReport",
        enabled: true,
        pauseAfterEveryResolution: false,
        summary: "Day 1 · Stopped: next report received",
        alerts: [{
          id: "alert-1",
          severity: "notable",
          title: "Recon report",
          detail: "Movement assessed near the objective.",
          targetKind: "intelligence",
          targetId: "contact-1"
        }],
        timeline: [{
          id: "step-1",
          timeLabel: "Day 1, 03:00-06:00",
          title: "Recon report",
          detail: "Movement assessed near the objective.",
          severity: "notable",
          stopLabel: "next report received",
          targetKind: "intelligence",
          targetId: "contact-1"
        }]
      }
    });
  });

  await When("keyboard navigation advances from Situation and Reports opens the unified alert center before intelligence", async () => {
    shell.revealInspector();
    root.querySelector<HTMLButtonElement>("[data-objective-key='obj-1']")?.click();
    const situation = root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='situation']");
    if (!situation) throw new Error("Situation workspace tab is missing.");
    situation.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    root.querySelector<HTMLButtonElement>("#campaignCommandReports")?.click();
    if (document.activeElement?.id !== "campaignSituationAlertCenter") {
      throw new Error("Reports did not focus the unified Situation alert center.");
    }
    root.querySelector<HTMLButtonElement>(".campaign-situation-report-source")?.click();
    root.querySelector<HTMLButtonElement>("[data-close-campaign-workspace]")?.click();
    const pause = root.querySelector<HTMLInputElement>("#campaignPauseAfterResolution");
    if (pause) {
      pause.checked = true;
      pause.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
    root.querySelector<HTMLButtonElement>("#campaignAdvanceSegment")?.click();
    root.querySelector<HTMLButtonElement>("#campaignTimelineToggle")?.click();
    root.querySelector<HTMLButtonElement>("#campaignSave")?.click();
    root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='intelligence']")?.click();
    root.querySelector<HTMLButtonElement>("[data-close-campaign-workspace]")?.click();
  });

  await Then("semantic regions, roving tabs, text-only projections, and the committed timeline are present", async () => {
    const tabs = root.querySelectorAll("[role='tab']");
    if (tabs.length !== 4) throw new Error(`Expected four distinct campaign workspaces, received ${tabs.length}.`);
    if (root.querySelector("[data-campaign-workspace-tab='airNaval']")
      || root.querySelector("[data-campaign-workspace-tab='headquarters']")) {
      throw new Error("Redundant Air & Naval or Headquarters workspaces returned to the command rail.");
    }
    if (!root.querySelector(".campaign-command-bar") || !root.querySelector(".campaign-context-inspector") || !root.querySelector(".campaign-order-tray")) {
      throw new Error("The command bar, context inspector, or order tray is missing.");
    }
    if (root.querySelector("#campaignCommandCompactClock")?.textContent !== "Day 1, 00:00-03:00"
      || root.querySelector("#campaignCommandCompactState")?.textContent !== "Orders Ready"
      || root.querySelector("#campaignCommandCompactSave")?.textContent !== "Unsaved") {
      throw new Error("Compact layout status did not retain operational time, command state, and save state.");
    }
    if (root.querySelector<HTMLElement>("#campaignWorkspacePanel")?.scrollTop !== 0) {
      throw new Error("Changing campaign workspaces retained a stale panel scroll position.");
    }
    if (root.querySelector<HTMLElement>("[data-objective-key='obj-2']")?.textContent?.includes("Awaiting evaluation")) {
      throw new Error("An upcoming objective repeated a non-actionable evaluation placeholder.");
    }
    const intelligence = root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='intelligence']");
    if (intelligence?.getAttribute("aria-selected") !== "true" || shell.getActiveWorkspace() !== "intelligence") {
      throw new Error("Workspace selection and aria-selected state diverged.");
    }
    if (openedIntelligence !== 1) throw new Error(`Expected one intelligence callback, received ${openedIntelligence}.`);
    if (root.querySelector("#campaignAirPowerValue")?.textContent !== "8"
      || root.querySelector("#campaignNavalPowerValue")?.textContent !== "0") {
      throw new Error("Removing the redundant Air & Naval workspace also removed support readiness from Logistics.");
    }
    if (savedFromCommandBar !== 1
      || !root.querySelector("#campaignSave")
      || !root.querySelector("#campaignLoad")
      || !root.querySelector("#campaignBattleSaves")
      || !root.querySelector("#campaignExit")
      || root.querySelector(".session-section")?.getAttribute("data-campaign-shell-hidden") !== "true") {
      throw new Error("The command bar did not retain its first-class session actions or retained the empty legacy shell.");
    }
    if (root.querySelector(".campaign-command-shell")?.getAttribute("data-workspace-expanded") !== "false") {
      throw new Error("Compact workspace close control did not release the map canvas.");
    }
    if (root.querySelector(".campaign-command-shell")?.getAttribute("data-inspector-expanded") !== "false") {
      throw new Error("Opening a workspace did not dismiss the mutually exclusive compact inspector sheet.");
    }
    if (!root.textContent?.includes("<Western Europe>") || !root.textContent.includes("Redeploy <Reserve>")) {
      throw new Error("Projected command text was not rendered as visible text.");
    }
    const objectiveInspector = root.querySelector("#campaignContextInspectorRoute")?.textContent ?? "";
    if (!objectiveInspector.includes("Hold the operational port")
      || !objectiveInspector.includes("Hold for 2 more segments")
      || !objectiveInspector.includes("0 / 2")
      || !objectiveInspector.includes("Keep the port under friendly control")
      || objectiveInspector.includes("Awaiting evaluation")) {
      throw new Error(`Objective inspector dropped player-ready progress or next action: ${objectiveInspector}`);
    }
    if (root.innerHTML.includes("<Western Europe>") || root.innerHTML.includes("<Reserve>")) {
      throw new Error("Projected command text was interpreted as HTML.");
    }
    if (root.querySelector("#campaignCommittedOrderCount")?.textContent !== "1") {
      throw new Error("Committed compatibility order was not counted in the order tray.");
    }
    if (advancedMode !== "nextReport" || !pausePreference
      || root.querySelector("#campaignAdvanceMode")?.getAttribute("aria-disabled") === "true"
      || root.querySelector<HTMLButtonElement>("#campaignAdvanceSegment")?.title !== "Advance to next report"
      || root.querySelector<HTMLButtonElement>("#campaignAdvanceSegment")?.getAttribute("aria-label") !== "Advance to next report"
      || root.querySelector("#campaignAdvanceTimeline")?.hasAttribute("hidden")) {
      throw new Error("Advance mode, pause preference, or persisted timeline controls are not operable.");
    }
    if (!root.textContent?.includes("Recon report") || !root.textContent.includes("Stopped · next report received")) {
      throw new Error("Projected stop alert and timeline explanation were not rendered.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_SHELL_OPERATES_TYPED_DRAFT_TRAY", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let committed = 0;
  let removed = "";
  let drawerFocusedOnOpen = false;

  await Given("one valid typed draft in the Campaign 2.0 order tray", async () => {
    root = mountCommandShellFixture();
    const shell = new CampaignCommandShell(root, {
      onCommitOrders: () => { committed += 1; },
      onRemoveOrder: (orderId) => { removed = orderId; }
    });
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render({
      theaterTitle: "Western Europe",
      campaignPhase: "Opening phase",
      timeLabel: "Day 1, 00:00-03:00",
      commandStatus: "Orders Ready",
      saveStatus: "Unsaved",
      unreadReports: 0,
      resources: [],
      objectives: [],
      forces: [],
      airPower: 0,
      navalPower: 0,
      intelligenceCapacity: "3/3 available",
      orders: [{
        id: "draft-1",
        kind: "production",
        label: "Set production allocation",
        detail: "Supply 25% · Fuel 25% · Ammo 25% · Personnel 25%",
        status: "draft",
        eta: "Effective Day 2, 00:00-03:00",
        validationMessages: [],
        canRemove: true,
        canCancel: false
      }],
      advance: {
        mode: "segment",
        enabled: true,
        pauseAfterEveryResolution: false,
        summary: "No campaign time resolved yet.",
        alerts: [],
        timeline: []
      }
    });
  });

  await When("the player commits and removes through explicit tray controls", async () => {
    root.querySelector<HTMLButtonElement>("#campaignOrdersToggle")?.click();
    drawerFocusedOnOpen = root.querySelector("[data-close-campaign-orders]")?.matches(":focus") ?? false;
    root.querySelector<HTMLButtonElement>("#campaignCommitOrders")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-order-card__actions button")?.click();
  });

  await Then("draft count, enabled commit, and callbacks expose a first-class order loop", async () => {
    const commitButton = root.querySelector<HTMLButtonElement>("#campaignCommitOrders");
    const drawer = root.querySelector<HTMLElement>("#campaignOrdersDrawer");
    const toggle = root.querySelector<HTMLButtonElement>("#campaignOrdersToggle");
    if (root.querySelector("#campaignDraftOrderCount")?.textContent !== "1"
      || commitButton?.disabled
      || drawer?.hidden
      || toggle?.getAttribute("aria-expanded") !== "true") {
      throw new Error("Valid typed draft did not enable atomic commit or update the tray count.");
    }
    if (committed !== 1 || removed !== "draft-1") {
      throw new Error("Typed tray commit/remove gestures did not reach controller callbacks.");
    }
    if (!drawerFocusedOnOpen) {
      throw new Error("Opening the orders drawer did not move focus to its close control.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_SHELL_RENDERS_OBJECTIVE_PROGRESS_AND_TERMINAL_RECORD", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let saveRequests = 0;
  let exitRequests = 0;

  await Given("a scored objective projection and recorded costly victory", async () => {
    root = mountCommandShellFixture();
    root.querySelector("#campaignSave")?.addEventListener("click", () => { saveRequests += 1; });
    root.querySelector("#campaignExit")?.addEventListener("click", () => { exitRequests += 1; });
    const shell = new CampaignCommandShell(root);
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render({
      theaterTitle: "Operation Test",
      campaignPhase: "Expansion phase",
      timeLabel: "Day 2, 03:00-06:00",
      commandStatus: "Campaign Ended",
      saveStatus: "Saved",
      unreadReports: 0,
      resources: [],
      objectives: [{
        key: "hold-port",
        label: "Hold the port",
        status: "In progress",
        category: "primary",
        progress: 0.5,
        detail: "Hold for 2 more segments",
        progressLabel: "Hold for 2 more segments",
        deadline: "Day 3",
        score: "0/100 pts"
      }],
      objectiveScore: { earned: 100, available: 200, percent: 50, projectedGrade: "Costly victory" },
      outcome: {
        key: "victory:9",
        result: "victory",
        grade: "Costly victory",
        title: "Operation complete",
        summary: "The port is secure, but the operation exhausted its reserves.",
        score: "100 / 200",
        completed: 1,
        failed: 1,
        formationsPreserved: "7 / 9 retained",
        serviceRecord: ["1st Infantry Group · 4 battles · Presidential Unit Citation"],
        checkpointStatus: "Campaign record saved."
      },
      forces: [],
      airPower: 0,
      navalPower: 0,
      intelligenceCapacity: "0/0 available",
      orders: [],
      advance: {
        mode: "segment",
        enabled: false,
        pauseAfterEveryResolution: false,
        summary: "Campaign ended.",
        alerts: [],
        timeline: []
      }
    });
  });

  await When("the player reviews the outcome and returns to the situation workspace", async () => {
    const dialog = root.querySelector<HTMLElement>("#campaignOutcomePanel");
    if (!dialog || dialog.hidden) throw new Error("Recorded campaign outcome was not presented as a dialog.");
    root.querySelector<HTMLButtonElement>("#campaignOutcomeSave")?.click();
    root.querySelector<HTMLButtonElement>("#campaignOutcomeExit")?.click();
    root.querySelector<HTMLButtonElement>("#campaignOutcomeReview")?.click();
  });

  await Then("objective status, exact progress, score projection, outcome metrics, and review affordance remain accessible", async () => {
    const progress = root.querySelector<HTMLElement>("[data-objective-key='hold-port'] [role='progressbar']");
    const dialog = root.querySelector<HTMLElement>("#campaignOutcomePanel");
    if (progress?.getAttribute("aria-valuenow") !== "50"
      || !root.textContent?.includes("Hold for 2 more segments")
      || !root.textContent.includes("100 / 200")
      || !root.textContent.includes("7 / 9 retained")
      || !root.textContent.includes("Presidential Unit Citation")
      || saveRequests !== 1
      || exitRequests !== 1
      || !dialog?.hidden
      || root.querySelector("[data-campaign-workspace-tab='situation']")?.getAttribute("aria-selected") !== "true") {
      throw new Error("First-class objective or terminal-result projection is incomplete.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_SHELL_PRESENTS_ACCESSIBLE_AFTER_ACTION_ARCHIVE", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let acknowledged = "";
  let selectedTarget = "";
  let selectedLocation = "";

  await Given("a new campaign battle report with exact losses and one required follow-up decision", async () => {
    root = mountCommandShellFixture();
    const shell = new CampaignCommandShell(root, {
      onAcknowledgeAfterActionReport: (reportId) => { acknowledged = reportId; },
      onAfterActionTargetSelected: (kind, targetId) => { selectedTarget = `${kind}:${targetId}`; },
      onSelectionRequested: (selection) => { selectedLocation = selection ? `${selection.kind}:${selection.id}` : ""; }
    });
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render({
      theaterTitle: "Operation Test",
      campaignPhase: "Expansion phase",
      timeLabel: "Day 2, 03:00-06:00",
      commandStatus: "Planning",
      saveStatus: "Saved",
      unreadReports: 1,
      afterActionReports: [{
        id: "aar-1",
        title: "After action: <Harbor>",
        timeLabel: "Day 2, 03:00-06:00",
        result: "victory",
        resultLabel: "Victory",
        acknowledged: false,
        summary: "The harbor was secured after heavy fighting.",
        location: "Operational hex 4,2",
        locationHexKey: "4,2",
        checkpointStatus: "Post-battle recovery checkpoint saved.",
        personnelLosses: "24",
        opponentLosses: "38",
        resourcesSpent: "6 ammo · 2 fuel",
        scoreChange: "100 → 175",
        operationalEffects: ["Control: Bot → Player", "Fortification: 100 → 65 integrity"],
        tacticalObjectives: ["Secure harbor: completed"],
        formations: [{
          id: "formation-1",
          name: "1st Infantry <Group>",
          commandLabel: "1st Infantry Division",
          personnel: "76 / 100 personnel · −24",
          condition: "Readiness 90 → 62 · Cohesion 85 → 60",
          disposition: "occupied · Secured the harbor",
          materiallyChanged: true
        }],
        objectiveChanges: ["Secure harbor: active → completed · +75 points"],
        decisions: [{
          id: "decision-1",
          severity: "attention",
          targetKind: "infrastructure",
          targetId: "4,2",
          title: "Repair the harbor",
          detail: "The installation is operating at 65% effectiveness."
        }]
      }],
      resources: [],
      objectives: [],
      forces: [],
      airPower: 0,
      navalPower: 0,
      intelligenceCapacity: "0/0 available",
      orders: [],
      advance: {
        mode: "segment",
        enabled: true,
        pauseAfterEveryResolution: false,
        summary: "Battle resolved.",
        alerts: [],
        timeline: []
      }
    });
  });

  await When("the report location is focused, then the automatic review is acknowledged and its repair decision is selected", async () => {
    const dialog = root.querySelector<HTMLElement>("#campaignAfterActionPanel");
    if (!dialog || dialog.hidden) throw new Error("The newest unread AAR did not open automatically.");
    root.querySelector<HTMLButtonElement>("[data-campaign-map-hex-target='4,2']")?.click();
    if (!dialog.hidden || root.querySelector("#campaignContextInspector")?.getAttribute("data-selection-kind") !== "hex") {
      throw new Error("The AAR location did not route through the shared map inspector.");
    }
    root.querySelector<HTMLButtonElement>("#campaignCommandReports")?.click();
    Array.from(root.querySelectorAll<HTMLButtonElement>(".campaign-situation-report-source"))
      .find((button) => button.textContent?.includes("Battle reports"))?.click();
    root.querySelector<HTMLButtonElement>("[data-acknowledge-aar='aar-1']")?.click();
    root.querySelector<HTMLButtonElement>("[data-continue-campaign-aar]")?.click();
  });

  await Then("the dialog exposes archive history, before/after facts, autosave status, safe text, and actionable navigation", async () => {
    const dialog = root.querySelector<HTMLElement>("#campaignAfterActionPanel");
    if (dialog?.getAttribute("role") !== "dialog"
      || dialog.getAttribute("aria-modal") !== "true"
      || !dialog.hidden
      || !root.textContent?.includes("Post-battle recovery checkpoint saved.")
      || !root.textContent.includes("Friendly losses24")
      || !root.textContent.includes("Control: Bot → Player")
      || acknowledged !== "aar-1"
      || selectedLocation !== "hex:4,2"
      || selectedTarget !== "infrastructure:4,2") {
      throw new Error("The AAR archive did not expose its accessible review and decision workflow.");
    }
    if (root.innerHTML.includes("<Harbor>") || root.innerHTML.includes("<Group>")) {
      throw new Error("AAR projection text was interpreted as HTML.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_SHELL_EMPHASIZES_AFFECTED_FORMATIONS_WITHOUT_HIDING_EXACT_RECORDS", async ({ Given, When, Then }) => {
  let root: HTMLElement;

  await Given("an after-action report with two affected battalions and four formations with no reported loss or condition change", async () => {
    root = mountCommandShellFixture();
    const shell = new CampaignCommandShell(root, {});
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    const formationNames = [
      "8th Battalion",
      "9th Battalion",
      "1st Canadian Parachute Battalion",
      "7th Battalion",
      "12th Battalion",
      "13th Battalion"
    ];
    const formations = Array.from({ length: 6 }, (_, index) => ({
      id: `formation-${index + 1}`,
      name: formationNames[index]!,
      commandLabel: index < 3 ? "3rd Parachute Brigade" : "5th Parachute Brigade",
      personnel: index === 0 ? "118 / 150 personnel · −32" : "150 / 150 personnel · −0",
      condition: index === 0
        ? "Readiness 100 → 61 · Cohesion 100 → 68"
        : "Readiness 100 → 100 · Cohesion 100 → 100",
      effects: index === 1 ? ["2 field guns lost"] : [],
      disposition: "held · Retained the defended position",
      materiallyChanged: index <= 1
    }));
    shell.render({
      theaterTitle: "Operation Overlord",
      campaignPhase: "D+1 lodgment",
      timeLabel: "D+1 · 7 June 1944, 06:00–09:00",
      commandStatus: "Planning",
      saveStatus: "Saved",
      unreadReports: 1,
      afterActionReports: [{
        id: "aar-density",
        title: "After action: Orne",
        timeLabel: "D+1 · 7 June 1944, 06:00–09:00",
        result: "victory",
        resultLabel: "Victory",
        acknowledged: false,
        summary: "The airborne lodgment held.",
        location: "Operational hex 31,22",
        checkpointStatus: null,
        personnelLosses: "32",
        opponentLosses: "19",
        resourcesSpent: "No theater resources charged",
        scoreChange: "0 → 100",
        operationalEffects: [],
        tacticalObjectives: ["Hold the engagement area: completed"],
        formations,
        objectiveChanges: ["Hold the Normandy Lodgment: in progress → completed"],
        decisions: []
      }],
      resources: [],
      objectives: [],
      forces: [],
      airPower: 0,
      navalPower: 0,
      intelligenceCapacity: "0/0 available",
      orders: [],
      advance: {
        mode: "segment",
        enabled: true,
        pauseAfterEveryResolution: false,
        summary: "Battle resolved.",
        alerts: [],
        timeline: []
      }
    });
  });

  await When("the report opens at command-level reading density", async () => {});

  await Then("affected formations are immediately visible and every other exact record remains available by disclosure", async () => {
    const commands = Array.from(root.querySelectorAll<HTMLElement>(".campaign-aar-command"));
    const affected = root.querySelectorAll<HTMLElement>("[data-material-change='true']");
    const disclosures = Array.from(root.querySelectorAll<HTMLDetailsElement>(".campaign-aar-unchanged"));
    const exactIds = Array.from(root.querySelectorAll<HTMLElement>("[data-formation-id]"), (row) => row.dataset.formationId);
    if (commands.length !== 2
      || affected.length !== 2
      || disclosures.length !== 2
      || disclosures.some((details) => details.open)
      || !root.textContent?.includes("2 field guns lost")
      || !disclosures.some((details) => details.textContent?.includes("1 formation returned with no reported loss or condition change"))
      || !disclosures.some((details) => details.textContent?.includes("3 formations returned with no reported loss or condition change"))
      || new Set(exactIds).size !== 6
      || exactIds.length !== 6) {
      throw new Error("The AAR did not prioritize affected formations while preserving the exact committed roster.");
    }
  });
});

registerTest("CAMPAIGN_AAR_EXPLAINS_EQUIPMENT_FATIGUE_EXPERIENCE_AND_STATUS_CHANGES", async ({ Given, When, Then }) => {
  let effects: string[] = [];

  await Given("a formation result whose personnel and readiness are unchanged but other recorded conditions changed", async () => {});

  await When("the result is projected into player-facing AAR evidence", async () => {
    effects = projectCampaignAfterActionFormationEffects({
      equipmentLost: { field_guns: 2 },
      fatigueBefore: 12,
      fatigueAfter: 27,
      experienceGained: 3,
      statusAfter: "refitting"
    });
  });

  await Then("every reported reason is visible without exposing storage-key formatting", async () => {
    if (!effects.includes("2 field guns lost")
      || !effects.includes("Fatigue 12 → 27")
      || !effects.includes("+3 experience")
      || !effects.includes("Status: refitting")
      || effects.some((effect) => effect.includes("field_guns"))) {
      throw new Error(`AAR condition evidence was incomplete or storage-facing: ${JSON.stringify(effects)}.`);
    }
  });
});

registerTest("CAMPAIGN_COMMAND_SITUATION_PASSES_STRUCTURAL_TEN_SECOND_GATE", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let acknowledgedAlert = "";
  let selectedTarget = "";

  await Given("a Player-safe command synthesis with one required decision, deadline, front posture, and recent checkpoint", async () => {
    root = mountCommandShellFixture();
    const shell = new CampaignCommandShell(root, {
      onAcknowledgeAlert: (alertId) => { acknowledgedAlert = alertId; },
      onAlertSelected: (kind, id) => { selectedTarget = `${kind}:${id}`; }
    });
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render({
      theaterTitle: "Operation First Class",
      campaignPhase: "Breakout phase",
      timeLabel: "Day 3, 06:00-09:00",
      commandStatus: "Planning",
      saveStatus: "Saved",
      unreadReports: 3,
      priorities: [{
        id: "alert:decision-1",
        severity: "decisionRequired",
        label: "Decision required",
        title: "Reopen the coastal road",
        detail: "The advance is stopped until the blocked movement order is revised.",
        actionLabel: "Review blocked order",
        targetKind: "order",
        targetId: "order-1"
      }, {
        id: "objective:secondary",
        severity: "notable",
        label: "Secondary priority",
        title: "This must remain subordinate",
        detail: "Only one dominant priority may be visible.",
        actionLabel: "Review objective",
        targetKind: "objective",
        targetId: "secondary"
      }],
      situation: {
        brief: {
          label: "Commander's brief",
          title: "Breakout phase",
          detail: "Two objectives are active. The command priority below requires attention.",
          tone: "critical"
        },
        outlook: {
          phaseDescription: "Exploit the lodgment before opposing reserves can stabilize the front.",
          timePressure: "18 hours remain · Day 4, 00:00-03:00",
          projectedGrade: "Costly victory",
          score: "75 / 200 · 38%",
          objectiveStatus: "2 active · 1 complete · 0 failed",
          lossConditions: ["Failing Hold the beachhead ends the campaign."]
        },
        alerts: [{
          id: "decision-1",
          severity: "decisionRequired",
          title: "Movement order blocked",
          detail: "The destination is no longer legal.",
          targetKind: "order",
          targetId: "order-1",
          timeLabel: "Day 3, 06:00-09:00",
          requiresStop: true,
          acknowledged: false
        }],
        intelligenceUnread: 1,
        afterActionUnread: 1,
        recentChanges: [{
          id: "step-3",
          timeLabel: "Day 3, 06:00-09:00",
          title: "Movement order blocked",
          detail: "The destination is no longer legal.",
          severity: "decisionRequired",
          stopLabel: "blocked order",
          targetKind: "order",
          targetId: "order-1",
          eventCount: 4
        }]
      },
      resources: [],
      objectives: [{
        key: "primary",
        label: "Hold the beachhead",
        status: "In progress",
        category: "primary",
        progress: 0.62,
        detail: "Hold for three more checkpoints.",
        deadline: "Deadline Day 4, 00:00-03:00",
        score: "0/100 pts",
        dependencies: "Requires Secure the causeway",
        failureEffect: "Failure ends the campaign"
      }],
      objectiveScore: { earned: 75, available: 200, percent: 38, projectedGrade: "Costly victory" },
      fronts: [{
        key: "coast",
        label: "Coastal sector",
        hexKeys: ["4,2", "5,2"],
        initiativeLabel: "Opposing initiative",
        pressureLabel: "2 assessed contacts · 1 stale or disputed.",
        forcePosture: "3 friendly formations in sector",
        objectivePosture: "1 objective in sector",
        lastChange: "Day 3, 06:00-09:00 · Movement order blocked"
      }],
      forces: [],
      airPower: 0,
      navalPower: 0,
      intelligenceCapacity: "2/3 available",
      orders: [],
      advance: {
        mode: "segment",
        enabled: true,
        pauseAfterEveryResolution: false,
        summary: "Stopped: blocked order",
        alerts: [],
        timeline: []
      }
    });
  });

  await When("the commander reviews the dominant alert, acknowledges it, inspects the front, and opens full history", async () => {
    root.querySelector<HTMLButtonElement>(".campaign-situation-alert .campaign-advance-alert__link")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-situation-alert__acknowledge")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-situation-front")?.click();
    root.querySelector<HTMLButtonElement>("#campaignSituationOpenTimeline")?.click();
  });

  await Then("one dominant decision, concise objective and front summaries, report sources, aggregation, and routes are immediately present", async () => {
    if (root.querySelectorAll(".campaign-command-priority").length !== 1
      || root.querySelector("#campaignSituationBrief")
      || root.querySelector("#campaignSituationOutlook")
      || root.querySelector("#campaignSituationObjectives")?.textContent?.includes("Failure ends the campaign")
      || root.querySelector("#campaignSituationObjectives")?.textContent?.includes("Requires Secure the causeway")
      || !root.querySelector("#campaignSituationFronts")?.textContent?.includes("2 assessed contacts")
      || root.querySelector("#campaignSituationFronts")?.textContent?.includes("3 friendly formations")
      || !root.querySelector("#campaignSituationRecent")?.textContent?.includes("4 material updates")
      || root.querySelectorAll(".campaign-situation-report-source").length !== 2
      || root.querySelector("#campaignAdvanceTimeline")?.hasAttribute("hidden")) {
      throw new Error("The first-class Situation board failed its concise ten-second comprehension gate.");
    }
    const inspectorCopy = root.querySelector("#campaignContextInspector")?.textContent ?? "";
    if (!inspectorCopy.includes("3 friendly formations")
      || inspectorCopy.includes("derived from projected control adjacency")
      || inspectorCopy.includes("Deadline Deadline")) {
      throw new Error(`Front detail was lost or implementation wording leaked into the inspector: ${inspectorCopy}`);
    }
    if (acknowledgedAlert !== "decision-1" || selectedTarget !== "order:order-1"
      || root.querySelector("#campaignContextInspector")?.getAttribute("data-selection-kind") !== "front") {
      throw new Error("Situation alert acknowledgement or shared selection routing diverged.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_SHELL_OMITS_DEVELOPER_CONTROLS_FROM_PLAYER_DOM", async ({ Given, When, Then }) => {
  let root: HTMLElement;

  await Given("developer controls exist only inside inert templates", async () => {
    root = mountCommandShellFixture(true);
  });

  await When("the normal player shell is composed without development authorization", async () => {
    const renderer = {
      render() {},
      setTerrainOverlayVisible() {},
      setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      clearAllHighlights() {},
      highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    if (!root.querySelector("[data-campaign-command-shell='true']")) {
      throw new Error("Campaign command shell did not initialize.");
    }
  });

  await Then("editor and export controls are absent from the interactive document tree", async () => {
    if (root.querySelector("#campaignEditMode") || root.querySelector("#campaignEditPanel") || root.querySelector("#campaignExportJSON")) {
      throw new Error("Internal campaign editor controls entered the normal player DOM.");
    }
    if (!root.querySelector("#campaignDeveloperSessionTemplate") || !root.querySelector("#campaignDeveloperEditorTemplate")) {
      throw new Error("Developer template sources were unexpectedly removed.");
    }
  });
});

registerTest("CAMPAIGN_MAP_CLICK_IS_SELECTION_ONLY", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let onHexClick: ((hexKey: string) => void) | null = null;
  let beforeHash = "";
  let beforeRevision = -1;
  let playerHexKey = "";

  await Given("a live campaign command screen and a player-occupied hex", async () => {
    campaignState.reset();
    mountCommandShellFixture();
    const renderer = {
      render() {},
      setTerrainOverlayVisible() {},
      setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      onHexClick(handler: (hexKey: string) => void) { onHexClick = handler; },
      clearAllHighlights() {},
      highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    const view = campaignState.getCampaignMapView("Player");
    const playerTile = view?.scenario.tiles.find((tile) => {
      const palette = view.scenario.tilePalette[tile.tile];
      return (tile.factionControl ?? palette?.factionControl) === "Player" && (tile.forces ?? []).some((force) => force.count > 0);
    });
    if (!playerTile || !onHexClick) throw new Error("A player-occupied test hex or map click handler is unavailable.");
    const offset = CoordinateSystem.axialToOffset(playerTile.hex.q, playerTile.hex.r);
    playerHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
    const snapshot = campaignState.getRuntimeSnapshot();
    const scenario = campaignState.getScenario();
    if (!snapshot || !scenario) throw new Error("Campaign runtime was not created.");
    beforeRevision = snapshot.revision;
    beforeHash = computeCampaignContentHash(scenario);
  });

  await When("the player single-clicks the occupied campaign hex", async () => {
    if (!onHexClick) throw new Error("Map click handler is unavailable.");
    onHexClick(playerHexKey);
  });

  await Then("selection and inspector update without moving forces or revising campaign truth", async () => {
    const snapshot = campaignState.getRuntimeSnapshot();
    const scenario = campaignState.getScenario();
    if (!snapshot || !scenario) throw new Error("Campaign runtime disappeared after selection.");
    if (snapshot.revision !== beforeRevision) {
      throw new Error(`Map selection changed runtime revision ${beforeRevision} → ${snapshot.revision}.`);
    }
    if (computeCampaignContentHash(scenario) !== beforeHash) {
      throw new Error("Map selection mutated the campaign projection.");
    }
    const title = document.getElementById("campaignInspectorTitle");
    const actions = document.getElementById("campaignSelectionInfo");
    if (!title?.textContent || title.textContent === "Selection"
      || !/(?:Move or embark formations|Rebase aircraft|Redeploy formations)/.test(actions?.textContent ?? "")) {
      throw new Error("Selection did not update the explicit-action inspector.");
    }
    campaignState.reset();
  });
});

registerTest("CAMPAIGN_MULTI_TARGET_FRONT_ACCEPTS_VISIBLE_MAP_AND_CONTACT_SELECTION", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let onHexClick: ((hexKey: string, tile?: unknown, contactId?: string) => void) | null = null;
  let screen: CampaignScreen;
  let beforeHash = "";
  let beforeRevision = -1;

  await Given("the shipped Omaha-Gold front with two opposing target hexes, one carrying a contact", () => {
    campaignState.reset();
    mountCommandShellFixture();
    const renderer = {
      render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      onHexClick(handler: (hexKey: string, tile?: unknown, contactId?: string) => void) { onHexClick = handler; },
      clearAllHighlights() {}, highlightHex() {}
    };
    screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    (screen as any).selectedFrontKey = "omaha_gold";
    (screen as any).selectedFrontTargetHexKey = null;
    (screen as any).renderSelection();
    const snapshot = campaignState.getRuntimeSnapshot();
    const scenario = campaignState.getScenario();
    if (!snapshot || !scenario || !onHexClick) throw new Error("The Omaha-Gold target-selection fixture was incomplete.");
    beforeRevision = snapshot.revision;
    beforeHash = computeCampaignContentHash(scenario);
  });

  await When("the commander chooses one plain target hex and then the contacted target hex", () => {
    onHexClick?.("26,24");
    if ((screen as any).selectedFrontTargetHexKey !== "26,24") {
      throw new Error("The plain opposing hex did not become the selected front target.");
    }
    const contact = campaignState.getCampaignMapView("Player")?.enemyContacts.find((entry) => entry.locationHexKey === "24,24");
    if (!contact) throw new Error("The Omaha-Gold contact target was not projected.");
    onHexClick?.("24,24", undefined, contact.id);
  });

  await Then("the front remains selected, the target action is pressed, Queue enables, and campaign truth is unchanged", () => {
    const snapshot = campaignState.getRuntimeSnapshot();
    const scenario = campaignState.getScenario();
    const selectedAction = document.querySelector<HTMLButtonElement>('[data-campaign-front-target-choice="24,24"]');
    const queue = document.querySelector<HTMLButtonElement>("#campaignQueueEngagement");
    if (!snapshot || !scenario
      || (screen as any).selectedFrontKey !== "omaha_gold"
      || (screen as any).selectedFrontTargetHexKey !== "24,24"
      || selectedAction?.getAttribute("aria-pressed") !== "true"
      || queue?.disabled
      || snapshot.revision !== beforeRevision
      || computeCampaignContentHash(scenario) !== beforeHash) {
      throw new Error("Map target selection lost front identity, launch readiness, or selection-only safety.");
    }
    for (const expected of [
      { hexKey: "24,24", approach: "Omaha Beach approach", mission: "Fortified Assault" },
      { hexKey: "26,24", approach: "Gold Beach approach", mission: "Meeting Engagement" }
    ]) {
      const target = document.querySelector<HTMLButtonElement>(`[data-campaign-front-target-choice="${expected.hexKey}"]`);
      assert.ok(target, `Missing target choice for ${expected.approach}.`);
      const primary = target.querySelector("strong");
      const grid = target.querySelector("small");
      assert.equal(primary?.textContent, expected.approach, "An authored approach must be the primary target label.");
      assert.equal(target.querySelector("span")?.textContent, expected.mission);
      assert.equal(grid?.textContent, `Grid ${expected.hexKey}`, "Precise coordinates belong in subordinate grid detail.");
      assert.equal(target.firstElementChild, primary);
      assert.ok(primary && grid && (primary.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING));
      assert.doesNotMatch(primary?.textContent ?? "", /(?:Grid|Hex)\s*\d|\b\d+,\d+\b/i);
      assert.match(target.getAttribute("aria-label") ?? "", new RegExp(`^${expected.approach}, ${expected.mission}, .+Grid ${expected.hexKey}$`));
    }
    campaignState.reset();
  });
});

registerTest("CAMPAIGN_EMPTY_STAGING_BASE_OMITS_GROUND_ACTIONS", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let onHexClick: ((hexKey: string) => void) | null = null;
  let stagingHexKey = "";

  await Given("the Bristol base before any scheduled formation becomes available", () => {
    campaignState.reset();
    mountCommandShellFixture();
    const renderer = {
      render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      getHexCenter() { return { cx: 0, cy: 0 }; },
      onHexClick(handler: (hexKey: string) => void) { onHexClick = handler; },
      clearAllHighlights() {}, highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    const view = campaignState.getCampaignMapView("Player");
    const staging = view?.scenario.tiles.find((tile) => tile.tile === "bristolBuildUp");
    if (!staging || !onHexClick || (staging.forces?.length ?? 0) !== 0) {
      throw new Error("The scheduled-only Bristol staging fixture was not available.");
    }
    const offset = CoordinateSystem.axialToOffset(staging.hex.q, staging.hex.r);
    stagingHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
  });

  await When("the commander inspects the base", () => {
    onHexClick?.(stagingHexKey);
  });

  await Then("the base exposes scheduled formation identities and ETAs without an unusable redeployment action", () => {
    const route = document.getElementById("campaignContextInspectorRoute");
    const inspectorCopy = [
      route?.textContent,
      document.getElementById("campaignSelectionInfo")?.textContent,
      document.querySelector(".campaign-context-inspector__action-footer")?.textContent
    ].filter(Boolean).join(" ");
    const formationButtons = Array.from(route?.querySelectorAll<HTMLButtonElement>("[data-campaign-formation-id]") ?? []);
    if (!inspectorCopy.includes("Bristol")
      || !inspectorCopy.includes("Logistics and embarkation")
      || !inspectorCopy.includes("+9 Allied support points daily")
      || !inspectorCopy.includes("Embarkation port")
      || !inspectorCopy.includes("Assigned commands")
      || !inspectorCopy.includes("Orders")
      || !inspectorCopy.includes("Reinforcements arrive")
      || !inspectorCopy.includes("2d Infantry Division")
      || !inspectorCopy.includes("90th Infantry Division")
      || !inspectorCopy.includes("infantry arrival groups")
      || !inspectorCopy.includes("Arriving here")
      || /segment\s+[68]/i.test(inspectorCopy)
      || /Infantry 42/i.test(inspectorCopy)
      || formationButtons.length !== 0
      || /Plan redeployment/i.test(inspectorCopy)
      || !document.querySelector<HTMLElement>(".campaign-context-inspector .action-section")?.hidden) {
      throw new Error(`Empty staging base exposed a misleading ground action: ${inspectorCopy}`);
    }
    campaignState.reset();
  });
});

registerTest("CAMPAIGN_FRIENDLY_BASE_EXPLAINS_PLACE_PRESENCE_AND_RELEVANT_ACTION", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let onHexClick: ((hexKey: string) => void) | null = null;
  let portlandHexKey = "";

  await Given("the named Portland embarkation base with ready formations", () => {
    campaignState.reset();
    mountCommandShellFixture();
    const renderer = {
      render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      getHexCenter() { return { cx: 0, cy: 0 }; },
      onHexClick(handler: (hexKey: string) => void) { onHexClick = handler; },
      clearAllHighlights() {}, highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    const view = campaignState.getCampaignMapView("Player");
    const portland = view?.scenario.tiles.find((tile) => view.scenario.tilePalette[tile.tile]?.mapLabel === "Portland");
    if (!portland || !onHexClick) throw new Error("The Portland base fixture was unavailable.");
    const mapListLabel = document.querySelector(".campaign-map-list-toggle")?.getAttribute("aria-label") ?? "";
    if (!mapListLabel.includes("45 map records")) {
      throw new Error(`Operational map list lost the complete Allied-base and strategic-site inventory: ${mapListLabel}.`);
    }
    const mapListCopy = document.querySelector(".campaign-map-accessible-list")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (/historical locations|Allied supporting network|Historical lift network/i.test(mapListCopy)
      || !mapListCopy.includes("West Country embarkation ports")
      || !mapListCopy.includes("Dorset embarkation ports")
      || !mapListCopy.includes("Thames and Nore reinforcement ports")) {
      throw new Error(`Operational map list exposed authoring language instead of period-facing command copy: ${mapListCopy}.`);
    }
    const offset = CoordinateSystem.axialToOffset(portland.hex.q, portland.hex.r);
    portlandHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
  });

  await When("the commander selects Portland and opens one exact formation", () => {
    onHexClick?.(portlandHexKey);
  });

  await Then("the inspector answers what it is, what is there, and the one relevant order without duplicate aggregates", () => {
    const route = document.getElementById("campaignContextInspectorRoute");
    const routeCopy = route?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const selection = document.querySelector<HTMLElement>(".campaign-context-inspector .selection-section");
    const engagement = document.querySelector<HTMLElement>(".campaign-context-inspector .action-section");
    if (!routeCopy.includes("Embarkation port")
      || !routeCopy.includes("Omaha-bound embarkation ports for forces and stores")
      || !routeCopy.includes("Dorset coast")
      || !routeCopy.includes("Portland Harbour")
      || routeCopy.includes("Associated portsPortland")
      || !routeCopy.includes("Logistics and embarkation")
      || !routeCopy.includes("Assigned commands")
      || !routeCopy.includes("Ready now")
      || !routeCopy.includes("First U.S. Army")
      || routeCopy.includes("Projected forces")
      || routeCopy.includes(`hex ${portlandHexKey}`)
      || selection?.hidden
      || !selection?.textContent?.includes("Move or embark formations")
      || !engagement?.hidden) {
      throw new Error(`Portland did not present a concise truthful base route: ${routeCopy} / ${selection?.textContent ?? ""}.`);
    }
    campaignState.reset();
  });
});

registerTest("FSG_CAM_045_CANONICAL_FORCE_COPY_REACHES_INSPECTOR_AND_FORCES_WORKSPACE", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let onHexClick: ((hexKey: string) => void) | null = null;
  let omahaHexKey = "";

  await Given("the shipped D+1 campaign and its held Omaha lodgment", () => {
    campaignState.reset();
    mountCommandShellFixture();
    const renderer = {
      render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      getHexCenter() { return { cx: 0, cy: 0 }; },
      onHexClick(handler: (hexKey: string) => void) { onHexClick = handler; },
      clearAllHighlights() {}, highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    const view = campaignState.getCampaignMapView("Player");
    const omaha = view?.scenario.tiles.find((tile) => view.scenario.tilePalette[tile.tile]?.mapLabel === "Omaha");
    if (!omaha || !onHexClick) throw new Error("The Omaha inspector fixture was unavailable.");
    const offset = CoordinateSystem.axialToOffset(omaha.hex.q, omaha.hex.r);
    omahaHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
  });

  await When("the commander selects Omaha", () => {
    onHexClick?.(omahaHexKey);
  });

  await Then("the inspector presents a defended receiving lodgment without production or recruiting claims", () => {
    const routeCopy = document.getElementById("campaignContextInspectorRoute")?.textContent ?? "";
    const forcesCopy = document.getElementById("campaignForcesWorkspaceList")?.textContent?.replace(/\s+/g, " ") ?? "";
    if (!routeCopy.includes("Omaha")
      || !routeCopy.includes("Fortification Light")
      || !routeCopy.includes("16th Infantry Regiment")
      || !routeCopy.includes("116th Infantry Regiment")
      || /daily (?:Allied support|production) capacity|next delivery|recruit/i.test(routeCopy)
      || !forcesCopy.includes("16th Infantry Regiment")
      || !forcesCopy.includes("82d Airborne Division")
      || !/\d+ commands?/.test(forcesCopy)
      || /U\.S\. 1st Infantry Division battalions|supply columns|group group|groups group/i.test(forcesCopy)
      || /\b\d+ formations? · strength/i.test(forcesCopy)) {
      throw new Error(`Canonical force copy diverged between Omaha and the Forces workspace: ${JSON.stringify({ routeCopy, forcesCopy })}`);
    }
    campaignState.reset();
  });
});

registerTest("FSG_CAM_075_REAL_SCREEN_INTELLIGENCE_READ_PERSISTS_ACROSS_FRESH_STATE_LOAD", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const source = new CampaignState({ saveBackend: backend, legacyStorage: null });
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const request: CampaignStatePersistenceRequest = {
    timestamp: "2026-09-05T14:00:00.000Z", label: "Reviewed intelligence", playTimeSeconds: 0,
    difficulty: "standard", commanderRosterLink: null,
    uiResumeContext: { workspace: "intelligence", selectedEntityId: null, mapCenter: null, mapZoom: null }
  };
  let root: HTMLElement;
  let beforeRead: ReturnType<CampaignState["getIntelBriefEvents"]>;
  let reviewed: ReturnType<CampaignState["getIntelBriefEvents"]>;
  let reviewedRuntimeHash: string;

  await Given("the shipped campaign reaches the real Intelligence workspace with unread reports", () => {
    const fixture = mountIsolatedCampaignScreen(source);
    root = fixture.root;
    fixture.screen.renderScenario(scenario);
    const scout = source.getEligibleIntelAssets("airRecon", "Player")[0];
    assert.ok(scout, "The shipped aerial reconnaissance asset is required to generate a real briefing report.");
    const scheduled = source.scheduleIntelOperation({ type: "airRecon", targetHexKey: scout.hexKey, assignedAssetKey: scout.assetKey, faction: "Player" });
    assert.ok(scheduled.ok, scheduled.ok ? "" : scheduled.reason);
    source.advanceSegment();
    beforeRead = source.getIntelBriefEvents("Player");
    assert.ok(beforeRead.some((event) => !event.read && event.operationId === scheduled.operation.id), "Resolving the scheduled reconnaissance operation must produce a real unread report.");
    const beforeOpening = computeCampaignContentHash(source.getRuntimeSnapshot());
    root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='intelligence']")!.click();
    root.querySelector<HTMLButtonElement>("[data-open-campaign-intelligence]")!.click();
    assert.equal(root.querySelector("#campaignIntelDrawer")?.classList.contains("hidden"), false);
    assert.deepEqual(source.getIntelBriefEvents("Player"), beforeRead, "Opening the workspace or collection composer must never mark reports read.");
    assert.equal(computeCampaignContentHash(source.getRuntimeSnapshot()), beforeOpening);
    root.querySelector<HTMLButtonElement>("#campaignIntelToggle")!.click();
    assert.equal(root.querySelector("#campaignIntelDrawer")?.classList.contains("hidden"), true);
  });

  await When("the commander explicitly marks the briefing read and saves its authoritative runtime into a named slot", async () => {
    const markRead = root.querySelector<HTMLButtonElement>("#campaignIntelligenceMarkRead");
    assert.ok(markRead && !markRead.hidden && !markRead.disabled);
    markRead.click();
    reviewed = source.getIntelBriefEvents("Player");
    assert.deepEqual(reviewed, beforeRead.map((event) => ({ ...event, read: true })), "The Screen callback must reach real CampaignState read state without changing report content.");
    const persistedReports = source.getRuntimeSnapshot()?.knowledgeByFaction.Player.briefEvents;
    assert.ok(persistedReports);
    assert.deepEqual(persistedReports.slice().sort((left, right) => left.id.localeCompare(right.id)), reviewed.slice().sort((left, right) => left.id.localeCompare(right.id)), "Read flags must reach persisted runtime, not just the rendered view.");
    assert.equal(source.getCampaignMapView("Player")?.unreadReportCount, 0);
    assert.ok(markRead.hidden && markRead.disabled);
    reviewedRuntimeHash = computeCampaignContentHash(source.getRuntimeSnapshot());
    await source.saveCampaignSlot({ ...request, slotId: "slot-intel-explicit-read", slotType: "manual" });
  });

  await Then("a fresh CampaignState and Screen restore the exact read records and calm collapsed history", async () => {
    const restored = new CampaignState({ saveBackend: backend, legacyStorage: null });
    restored.setScenario(structuredClone(scenario));
    const loaded = await restored.loadCampaignSlot("slot-intel-explicit-read", { ...request, timestamp: "2026-09-05T14:01:00.000Z" });
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
    assert.equal(computeCampaignContentHash(restored.getRuntimeSnapshot()), reviewedRuntimeHash);
    assert.deepEqual(restored.getIntelBriefEvents("Player"), reviewed);
    const resumed = mountIsolatedCampaignScreen(restored);
    resumed.root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='intelligence']")!.click();
    const markRead = resumed.root.querySelector<HTMLButtonElement>("#campaignIntelligenceMarkRead");
    assert.ok(markRead?.hidden && markRead.disabled);
    assert.match(resumed.root.querySelector("#campaignIntelligenceBriefingStatus")?.textContent ?? "", /No new intelligence to review/);
    assert.equal(resumed.root.querySelectorAll("#campaignIntelligenceBriefingList [data-intelligence-report]").length, 0);
    assert.equal(resumed.root.querySelector<HTMLDetailsElement>("#campaignIntelligenceHistory")?.open, false);
    assert.deepEqual(Array.from(resumed.root.querySelectorAll<HTMLElement>("#campaignIntelligenceHistoryList [data-intelligence-report]"), (row) => row.dataset.intelligenceReport).sort(), reviewed.map((event) => event.id).sort());
    assert.deepEqual(restored.getIntelBriefEvents("Player"), reviewed, "Opening resumed Intelligence must preserve read flags and report content.");
    assert.equal(computeCampaignContentHash(restored.getRuntimeSnapshot()), reviewedRuntimeHash);
  });
});

registerTest("FSG_CAM_045_FIELD_FORMATION_SELECTION_PRESERVES_ORDERS_AND_BLOCKS_COMMITTED_ASSET", async ({ Given, When, Then }) => {
  const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
  let root: HTMLElement;
  let screen: CampaignScreen;
  let formationId: string;
  const origin = "24,23";
  let beforeSelectionHash: string;
  // Narrow inspection verifies the public row gesture's retained order origin and exact formation identity.
  const selectedContext = (): { readonly selectedHexKey: string | null; readonly selectedFormationId: string | null; readonly moveOriginHexKey: string | null } => screen as unknown as {
    readonly selectedHexKey: string | null; readonly selectedFormationId: string | null; readonly moveOriginHexKey: string | null;
  };

  await Given("the shipped Omaha field formation is selected through its Forces row", () => {
    const fixture = mountIsolatedCampaignScreen(state);
    root = fixture.root;
    screen = fixture.screen;
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.locationHexKey === "24,11"
      && entry.campaignUnitType === "Infantry_42" && entry.status === "ready" && entry.currentOrderId === null);
    assert.ok(formation, "The shipped Omaha field infantry is required for this integration fixture.");
    formationId = formation.id;
    beforeSelectionHash = computeCampaignContentHash(state.getRuntimeSnapshot());
    root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='forces']")!.click();
    const row = Array.from(root.querySelectorAll<HTMLButtonElement>("#campaignForcesWorkspaceList [data-force-id]"))
      .find((entry) => entry.dataset.forceId === formationId);
    assert.ok(row, "The active Forces workspace must expose the exact persistent field formation.");
    row.click();
  });

  await When("the formation inspector offers movement and engagement without losing its map location", () => {
    const inspector = root.querySelector<HTMLElement>("#campaignContextInspector")!;
    assert.equal(inspector.dataset.routeIdentity, `formation:${formationId}`);
    assert.equal(inspector.dataset.routeMode, "projectedWithActions");
    assert.equal(selectedContext().selectedFormationId, formationId);
    assert.equal(selectedContext().selectedHexKey, origin);
    const parentLocation = inspector.querySelector<HTMLButtonElement>(".campaign-context-inspector__parent-route");
    assert.equal(parentLocation?.dataset.campaignMapHexTarget, origin);
    assert.match(parentLocation?.textContent ?? "", /Omaha/);
    const movement = inspector.querySelector<HTMLButtonElement>("[data-plan-campaign-redeploy]");
    const engagement = inspector.querySelector<HTMLButtonElement>("#campaignQueueEngagement");
    assert.ok(movement && !movement.disabled && !movement.closest("[hidden]"), "A ready field formation must retain its movement action.");
    assert.ok(engagement && !engagement.disabled && !engagement.closest("[hidden]"), "A ready field formation must retain its enabled engagement action footer.");
    movement.click();
    assert.equal(selectedContext().moveOriginHexKey, origin);
    assert.equal(selectedContext().selectedFormationId, formationId);
    const cancel = root.querySelector<HTMLButtonElement>("[data-cancel-campaign-redeploy]");
    assert.ok(cancel && !cancel.closest("[hidden]"));
    cancel.click();
    assert.equal(selectedContext().moveOriginHexKey, null);
    assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), beforeSelectionHash, "Inspection and reversible route planning must not mutate campaign truth.");
  });

  await Then("committing that same field formation to an engagement removes new-order affordances without losing its real location", () => {
    const context = state.buildCampaignEngagementContext({ engagementId: "formation-inspector-commitment", battleHexKey: "24,24", attacker: "Player", frontKey: "omaha_gold" });
    assert.ok(context, "The shipped adjacent Omaha engagement must provide a real commitment context.");
    state.setPendingEngagements([{
      id: context.engagementId, frontKey: context.frontKey, objectiveKey: context.objectiveKey,
      attacker: context.attacker, defender: context.defender, hexKeys: [context.battleHexKey], tags: [], context
    }]);
    state.setActiveEngagementId(context.engagementId);
    const committed = state.commitCampaignEngagement({
      engagementId: context.engagementId, expectedRevision: state.getRuntimeSnapshot()!.revision,
      selections: [{ allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 }]
    });
    assert.ok(committed.ok, committed.ok ? "" : committed.reason);
    assert.ok(committed.package.formationCommitments.some((entry) => entry.formationId === formationId), "The real commitment must include the exact formation previously selected in Forces.");
    root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='forces']")!.click();
    const row = Array.from(root.querySelectorAll<HTMLButtonElement>("#campaignForcesWorkspaceList [data-force-id]"))
      .find((entry) => entry.dataset.forceId === formationId);
    assert.ok(row, "Committed field formations must remain discoverable.");
    row.click();
    const inspector = root.querySelector<HTMLElement>("#campaignContextInspector")!;
    assert.equal(inspector.dataset.routeIdentity, `formation:${formationId}`);
    assert.equal(state.getCampaignFormationSnapshot(formationId)?.status, "committed");
    assert.equal(state.getCampaignFormationSnapshot(formationId)?.locationHexKey, "24,11");
    assert.equal(selectedContext().selectedHexKey, origin);
    assert.equal(inspector.querySelector<HTMLButtonElement>(".campaign-context-inspector__parent-route")?.dataset.campaignMapHexTarget, origin);
    assert.equal(inspector.querySelector<HTMLElement>(".selection-section")?.hidden, true);
    assert.equal(inspector.querySelector<HTMLElement>(".action-section")?.hidden, true);
    assert.equal(inspector.querySelector("[data-plan-campaign-redeploy]"), null, "Blocked formation must not inherit a movable sibling's order action at the same location.");
    assert.match(inspector.querySelector(".campaign-context-inspector__action-summary")?.textContent ?? "", /committed/i);
    assert.equal(state.getCampaignRedeployAvailableFormations(origin).some((formation) => formation.id === formationId), false);
  });
});

registerTest("FSG_CAM_079_CAMPAIGN_CONFIRMATION_DIALOG_OWNS_FOCUS_AND_FAILS_CLOSED", async ({ Given, When, Then }) => {
  const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
  const { root, screen } = mountIsolatedCampaignScreen(state);
  screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const layer = appendCampaignPopupFixture();
  // This interaction has no independent public entry in the unit fixture; exercise the actual dialog, not a stubbed callback.
  const confirmation = screen as unknown as { confirmCampaignAction(title: string, detail: string, acceptLabel: string): Promise<boolean> };
  const invoker = root.querySelector<HTMLButtonElement>("#campaignSave")!;
  let pending: Promise<boolean>;

  await Given("the real campaign confirmation is invoked from a focused campaign control", () => {
    invoker.focus();
    pending = confirmation.confirmCampaignAction("Review <assessment>", "Reported uncertainty requires a decision.", "Continue to tactical planning");
    assert.equal(layer.classList.contains("hidden"), false);
    assert.equal(layer.getAttribute("aria-hidden"), "false");
    assert.equal(root.inert, true);
    assert.equal(layer.querySelector("[role='dialog']")?.getAttribute("aria-modal"), "true");
    assert.equal(layer.querySelector("[data-popup-title]")?.textContent, "Review <assessment>");
    assert.equal(layer.querySelector("assessment"), null);
    assert.equal(document.activeElement?.textContent, "Return to campaign");
  });

  await When("Tab and Shift+Tab wrap inside the dialog, then Escape cancels from the focused descendant", async () => {
    const accept = layer.querySelector<HTMLButtonElement>("[data-confirm-campaign-action]")!;
    const close = layer.querySelector<HTMLButtonElement>("#battlePopupClose")!;
    accept.focus();
    const forward = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    accept.dispatchEvent(forward);
    assert.equal(forward.defaultPrevented, true);
    assert.equal(document.activeElement, close);
    const reverse = new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(reverse);
    assert.equal(reverse.defaultPrevented, true);
    assert.equal(document.activeElement, accept);
    const escape = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    accept.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(await pending, false);
    assert.equal(root.inert, false);
    assert.equal(layer.getAttribute("aria-hidden"), "true");
    assert.equal(document.activeElement, invoker);
  });

  await Then("confirmation resolves true once, releases focus, and missing popup infrastructure cannot authorize an action", async () => {
    let acceptedContinuations = 0;
    const accepted = confirmation.confirmCampaignAction("Confirm operation", "Proceed after reviewing the briefing.", "Confirm").then((result) => {
      if (result) acceptedContinuations += 1;
      return result;
    });
    const accept = layer.querySelector<HTMLButtonElement>("[data-confirm-campaign-action]")!;
    accept.click();
    accept.click();
    assert.equal(await accepted, true);
    assert.equal(acceptedContinuations, 1);
    assert.equal(root.inert, false);
    assert.equal(layer.classList.contains("hidden"), true);
    assert.equal(document.activeElement, invoker);
    const beforeMissing = computeCampaignContentHash(state.getRuntimeSnapshot());
    layer.remove();
    assert.equal(await confirmation.confirmCampaignAction("Unavailable confirmation", "No panel exists.", "Continue"), false);
    assert.notEqual(root.inert, true);
    assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), beforeMissing);
    assert.match(root.textContent ?? "", /confirmation panel is unavailable.*Reload the game/s);
  });
});

registerTest("FSG_CAM_079_QUEUE_CALLER_REQUIRES_DANGER_BRIEFING_CONSENT", async ({ Given, When, Then }) => {
  for (const danger of [{ count: 8, band: "heavy" }, { count: 12, band: "overwhelming" }] as const) {
    const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
    const { root, screen } = mountIsolatedCampaignScreen(state);
    const scenario = buildCampaignSaveCanonicalScenario();
    // Author opposing forces in direct contact; real knowledge fusion, not a briefing stub, assesses their strength.
    scenario.tilePalette.playerHub.role = "fortificationLight";
    scenario.tilePalette.botFort.forces![0].count = danger.count;
    for (const tile of scenario.tiles) tile.forces = structuredClone(scenario.tilePalette[tile.tile].forces);
    screen.renderScenario(scenario);
    const layer = appendCampaignPopupFixture();
    const handoffs: Array<{ activeId: string | null; engagements: ReturnType<CampaignState["getPendingEngagements"]> }> = [];
    screen.setQueueEngagementHandler(() => {
      handoffs.push({ activeId: state.getActiveEngagementId(), engagements: state.getPendingEngagements() });
    });
    let queue: HTMLButtonElement;
    let runtimeBefore: string;
    let formationsBefore: ReturnType<CampaignState["getCampaignFormationRoster"]>;
    const briefing = state.buildCampaignEngagementContext({ engagementId: "danger-fixture", battleHexKey: "1,0", attacker: "Player", frontKey: null })?.intelligenceBriefing;

    await Given(`a ready Forces row beside a real ${danger.band} enemy assessment`, () => {
      assert.ok(briefing);
      assert.equal(briefing.resistanceBand, danger.band);
      assert.ok(briefing.contacts.length > 0 && briefing.contacts.every((contact) => contact.strengthBand), "Danger must come from assessed faction contacts.");
      root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='forces']")!.click();
      const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.locationHexKey === "0,0" && entry.status === "ready");
      assert.ok(formation);
      const row = Array.from(root.querySelectorAll<HTMLButtonElement>("#campaignForcesWorkspaceList [data-force-id]"))
        .find((entry) => entry.dataset.forceId === formation.id);
      assert.ok(row, "The actual Forces row must select the exact persistent formation.");
      row.click();
      queue = root.querySelector<HTMLButtonElement>("#campaignQueueEngagement")!;
      assert.ok(queue && !queue.disabled && !queue.closest("[hidden]"));
      runtimeBefore = computeCampaignContentHash(state.getRuntimeSnapshot());
      formationsBefore = state.getCampaignFormationRoster("Player");
      queue.focus();
      queue.click();
      assert.equal(layer.classList.contains("hidden"), false, "Actual Queue must await the campaign dialog for a dangerous assessment.");
      assert.match(layer.querySelector("[data-popup-body]")?.textContent ?? "", new RegExp(briefing.summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(handoffs.length, 0);
      assert.deepEqual(state.getPendingEngagements(), []);
      assert.equal(state.getActiveEngagementId(), null);
      assert.equal(state.getActiveCampaignBattlePackage(), null);
      assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), runtimeBefore, "Displaying consent must not commit forces or create pending runtime state.");
    });

    await When("the commander cancels the actual Queue caller's confirmation", async () => {
      const cancel = Array.from(layer.querySelectorAll<HTMLButtonElement>("[data-popup-body] button"))
        .find((button) => button.textContent === "Return to campaign");
      assert.ok(cancel);
      cancel.click();
      await Promise.resolve();
      assert.equal(layer.classList.contains("hidden"), true);
      assert.equal(root.inert, false);
      assert.equal(document.activeElement, queue);
      assert.equal(handoffs.length, 0);
      assert.deepEqual(state.getPendingEngagements(), []);
      assert.equal(state.getActiveEngagementId(), null);
      assert.equal(state.getActiveCampaignBattlePackage(), null);
      assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), runtimeBefore, "Cancelling must leave campaign state exactly unchanged.");
    });

    await Then("accepting a fresh Queue request installs one engagement and hands it to tactical planning exactly once", async () => {
      queue.click();
      assert.equal(layer.classList.contains("hidden"), false);
      assert.equal(handoffs.length, 0);
      assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), runtimeBefore);
      const accept = layer.querySelector<HTMLButtonElement>("[data-confirm-campaign-action]");
      assert.ok(accept);
      accept.click();
      accept.click();
      await Promise.resolve();
      assert.equal(handoffs.length, 1, "One accepted decision must cause exactly one caller handoff, even for a repeated accept gesture.");
      const handoff = handoffs[0];
      assert.equal(handoff.engagements.length, 1);
      const engagement = handoff.engagements[0];
      assert.equal(handoff.activeId, engagement.id);
      assert.deepEqual(engagement.hexKeys, ["0,0"], "The selected formation's order origin must survive the proximity route.");
      assert.equal(engagement.context?.battleHexKey, "1,0", "The actual caller must resolve the adjacent opposing target.");
      assert.equal(engagement.context?.intelligenceBriefing?.resistanceBand, danger.band);
      assert.deepEqual(engagement.context?.intelligenceBriefing, briefing);
      assert.deepEqual(state.getPendingEngagements(), handoff.engagements);
      assert.equal(state.getActiveCampaignBattlePackage(), null, "Consent enters tactical planning; allocation commitment still belongs to precombat.");
      assert.deepEqual(state.getCampaignFormationRoster("Player"), formationsBefore);
      assert.equal(root.inert, false);
      assert.equal(layer.classList.contains("hidden"), true);
    });
  }
});

registerTest("FSG_CAM_079_LOAD_RECOVERY_CANCEL_PRESERVES_STATE_ACCEPT_RESUMES_EXACT_BATTLE_ONCE", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const legacyValues = new Map([[CAMPAIGN_LEGACY_SAVE_KEY, buildLegacyCampaignSaveV2Raw()]]);
  const source = new CampaignState({ saveBackend: backend, legacyStorage: {
    getItem: (key) => legacyValues.get(key) ?? null,
    setItem: (key, value) => { legacyValues.set(key, value); }
  } });
  const request: CampaignStatePersistenceRequest = {
    timestamp: "2026-09-05T16:00:00.000Z", label: "Tactical recovery boundary", playTimeSeconds: 1800,
    difficulty: "Normal", commanderRosterLink: null,
    uiResumeContext: { workspace: "operations", selectedEntityId: null, mapCenter: null, mapZoom: null }
  };
  let state: CampaignState;
  let root: HTMLElement;
  let layer: HTMLElement;
  let load: HTMLButtonElement;
  let expectedBattle: NonNullable<ReturnType<CampaignState["getActiveBattleSave"]>>;
  let expectedRuntime: string;
  let beforeLoad: string;
  const resumes: unknown[] = [];
  const onResume = (event: Event): void => { resumes.push((event as CustomEvent<{ save: unknown }>).detail.save); };
  document.addEventListener("campaign:battle:resume", onResume);

  try {
    await Given("a corrupt primary save backed by a verified earlier complete tactical checkpoint", async () => {
      source.setScenario(buildCampaignSaveCanonicalScenario());
      const migrated = await source.loadPrimaryCampaign(request);
      assert.ok(migrated.ok, migrated.ok ? "" : migrated.error.message);
      const runtime = source.getRuntimeSnapshot();
      assert.ok(runtime?.activeEngagementId);
      const binding = { campaignId: runtime.campaignId, campaignRevision: runtime.revision, scenarioKey: runtime.scenarioKey, engagementId: runtime.activeEngagementId };
      source.setActiveBattleSave(buildCompleteActiveBattleSave({ ...binding, focusedElementId: "battleLoadButton" }));
      expectedBattle = source.getActiveBattleSave()!;
      expectedRuntime = computeCampaignContentHash(source.getRuntimeSnapshot());
      await source.savePrimaryCampaign({ ...request, timestamp: "2026-09-05T16:01:00.000Z" });
      source.setActiveBattleSave(buildCompleteActiveBattleSave({ ...binding, focusedElementId: "endTurn" }));
      await source.savePrimaryCampaign({ ...request, timestamp: "2026-09-05T16:02:00.000Z" });
      const exported = backend.exportState();
      const currentId = exported.slots[CAMPAIGN_PRIMARY_SAVE_SLOT_ID].currentSaveId;
      const saves = structuredClone(exported.saves) as Record<string, unknown>;
      const corrupt = structuredClone(saves[currentId]) as Record<string, unknown>;
      corrupt.checksum = "fsg-save-v1-fnv1a32-deadbeef";
      saves[currentId] = corrupt;
      state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend({ ...exported, saves }), legacyStorage: null });
      const fixture = mountIsolatedCampaignScreen(state);
      root = fixture.root;
      fixture.screen.renderScenario(buildCampaignSaveCanonicalScenario());
      layer = appendCampaignPopupFixture();
      load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
      assert.ok(load && !load.disabled);
      beforeLoad = computeCampaignContentHash(state.getRuntimeSnapshot());
      assert.equal(state.getActiveBattleSave(), null);
      load.focus();
      load.click();
      assert.equal(load.disabled, true);
      await chooseCampaignCheckpoint(CAMPAIGN_PRIMARY_SAVE_SLOT_ID);
      await waitForCampaignDom(() => !layer.classList.contains("hidden") || !load.disabled);
      assert.equal(layer.classList.contains("hidden"), false, "The actual Load control must present recovery before applying the older record.");
      assert.equal(layer.querySelector("[data-popup-title]")?.textContent, "Recover earlier campaign");
      assert.equal(resumes.length, 0);
      assert.equal(state.getActiveBattleSave(), null);
      assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), beforeLoad);
    });

    await When("Escape cancels recovery from the actual Load control", async () => {
      const accept = layer.querySelector<HTMLButtonElement>("[data-confirm-campaign-action]")!;
      accept.focus();
      assert.equal(document.activeElement, accept);
      accept.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await waitForCampaignDom(() => !load.disabled);
      assert.equal(layer.classList.contains("hidden"), true);
      assert.equal(root.inert, false);
      assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), beforeLoad, "Cancelling recovery must preserve the current campaign exactly.");
      assert.equal(state.getActiveBattleSave(), null);
      assert.equal(state.getActiveEngagementId(), null);
      assert.equal(resumes.length, 0);
    });

    await Then("accepting recovery on a fresh Load request restores and dispatches the exact earlier active battle once", async () => {
      load.click();
      await chooseCampaignCheckpoint(CAMPAIGN_PRIMARY_SAVE_SLOT_ID);
      await waitForCampaignDom(() => !layer.classList.contains("hidden") || !load.disabled);
      assert.equal(layer.classList.contains("hidden"), false);
      assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), beforeLoad);
      assert.equal(resumes.length, 0);
      const accept = layer.querySelector<HTMLButtonElement>("[data-confirm-campaign-action]");
      assert.equal(accept?.textContent, "Recover earlier save");
      accept!.click();
      accept!.click();
      await waitForCampaignDom(() => !load.disabled);
      assert.equal(resumes.length, 1, "Accepted recovery must reach the shared tactical resume path exactly once.");
      assert.deepEqual(resumes[0], expectedBattle, "Resume must dispatch the whole verified earlier battle, not the damaged newest checkpoint or a reconstructed replacement.");
      assert.deepEqual(state.getActiveBattleSave(), expectedBattle);
      assert.equal(state.getActiveBattleSave()?.tacticalUI.focusedElementId, "battleLoadButton");
      assert.equal(state.getActiveEngagementId(), expectedBattle.engagementPackage.engagementId);
      assert.equal(computeCampaignContentHash(state.getRuntimeSnapshot()), expectedRuntime);
      assert.equal(root.inert, false);
      assert.equal(layer.classList.contains("hidden"), true);
      assert.match(root.textContent ?? "", /Tactical battle restored/);
    });
  } finally {
    document.removeEventListener("campaign:battle:resume", onResume);
  }
});

const postBattleRequest: CampaignStatePersistenceRequest = {
  timestamp: "2026-09-06T12:00:00.000Z", label: "Before Omaha", playTimeSeconds: 0,
  difficulty: "Normal", commanderRosterLink: null,
  uiResumeContext: { workspace: "theater", selectedEntityId: null, mapCenter: null, mapZoom: null }
};

/** Real battle accounting at the reported offset hex, with authored geography retained separately. */
async function prepareCampaignPostBattle(backend: InMemoryCampaignSaveBackend, frontCase?: "rekey" | "frozenOnly" | "ambiguous" | "namedPlace", recoverable: boolean | "workshop" = false) {
  const scenario = scenarioFixture();
  scenario.title = "Operation Overlord - Normandy Campaign";
  scenario.dimensions = { cols: 58, rows: 50 };
  scenario.tiles[0].hex = { q: 24, r: 11 };
  scenario.tiles[0].forces![0].count = 2;
  if (recoverable) scenario.tiles[0].forces![0].unitType = "Engineer";
  scenario.tiles[1].hex = { q: 24, r: 12 };
  scenario.fronts = [{ key: "omaha_gold", label: "Omaha-Gold Sector", hexKeys: ["24,23"],
    edges: [{ friendlyHexKey: "24,23", opposingHexKey: "24,24" }], initiative: "Player" }];
  if (frontCase === "frozenOnly") scenario.fronts[0].edges = [];
  if (frontCase === "ambiguous") scenario.fronts.push({ ...structuredClone(scenario.fronts[0]), key: "another-sector", label: "Another sector" });
  if (frontCase === "namedPlace") scenario.tilePalette.bot.mapLabel = "Beach exit";
  const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
  state.setScenario(scenario);
  await state.savePrimaryCampaign(postBattleRequest);
  if (frontCase && frontCase !== "namedPlace") {
    const stored = backend.exportState();
    const validation = validateCampaignSaveEnvelope(stored.saves[stored.slots[CAMPAIGN_PRIMARY_SAVE_SLOT_ID].currentSaveId]);
    assert.ok(validation.ok, validation.ok ? "" : validation.error.message);
    const runtime = structuredClone(validation.envelope.payload.runtime);
    runtime.compatibility.initialFronts.splice(0, runtime.compatibility.initialFronts.length,
      { key: "rebuilt-front", label: "Frozen beachhead", hexKeys: ["24,23"],
        edges: [{ friendlyHexKey: "24,23", opposingHexKey: "24,24" }], initiative: "Player" });
    const envelope = createCampaignSaveEnvelope({ ...validation.envelope, saveId: `${validation.envelope.saveId}:rebuilt`,
      updatedAt: "2026-09-06T12:00:01.000Z", payload: { ...validation.envelope.payload, runtime } });
    await new CampaignSaveRepository(backend).saveSlot({ slotId: CAMPAIGN_PRIMARY_SAVE_SLOT_ID, label: "Rebuilt operational front", envelope });
    const loaded = await state.loadPrimaryCampaign(postBattleRequest);
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
  }
  const context = contextFixture();
  context.battleHexKey = "24,24";
  context.frontKey = frontCase && frontCase !== "namedPlace" ? "rebuilt-front" : "omaha_gold";
  context.availableForces[0].hexKey = "24,23";
  context.availableForces[0].count = 2;
  context.allocationCaps.infantry = 2;
  if (recoverable) { context.availableForces[0].unitType = "Engineer"; context.allocationCaps = { engineer: 2 }; }
  context.enemyForces[0].hexKey = "24,24";
  state.setPendingEngagements([{ id: context.engagementId, frontKey: context.frontKey, objectiveKey: null,
    attacker: context.attacker, defender: context.defender, hexKeys: [context.battleHexKey], tags: [], context }]);
  state.setActiveEngagementId(context.engagementId);
  const committed = state.commitCampaignEngagement({ engagementId: context.engagementId,
    expectedRevision: state.getRuntimeSnapshot()!.revision,
    selections: [{ allocationKey: recoverable ? "engineer" : "infantry", category: "units", quantity: 2, unitRpCost: 50 },
      { allocationKey: "ammo", category: "supplies", quantity: 1, unitRpCost: 30 }] });
  assert.ok(committed.ok, committed.ok ? "" : committed.reason);
  const runtime = state.getRuntimeSnapshot()!;
  const tacticalState = tacticalStateFixture(runtime, committed.package);
  if (recoverable) {
    const casualty = tacticalState.playerPlacements[0];
    assert.ok(casualty.status);
    Object.assign(Object.values(casualty.status.personnel)[0], { fit: 0, injured: 100, wounded: 35, severelyWounded: 15, killed: 10 });
    Object.assign(Object.values(casualty.status.equipment)[0], { operational: 7, damaged: 2, disabled: 1, destroyed: 2 });
    if (recoverable === "workshop") {
      Object.assign(Object.values(casualty.status.personnel)[0], { fit: 148, injured: 2, wounded: 0, severelyWounded: 0, killed: 10 });
      Object.assign(Object.values(casualty.status.equipment)[0], { operational: 9, damaged: 0, disabled: 1, destroyed: 2 });
    }
    casualty.strength = 0;
    tacticalState.playerPlacements = [];
    tacticalState.casualtyLog!.push({ unit: casualty, definition: structuredClone(unitTypes[casualty.type]),
      unitKey: casualty.formationKey ?? null, label: "Engineer survivors", recordedAt: "battle:4:2" });
  }
  const second = committed.package.formationCommitments.filter((entry) => entry.role === "attacker")[1];
  assert.ok(second, "Two distinct committed survivors distinguish battle history from the occupier's subsequent movement.");
  const seed = createCampaignFormationBattleSeed(runtime.formations[second.formationId], {
    campaignId: committed.package.campaignId, engagementId: committed.package.engagementId,
    sourceRevision: committed.package.sourceRevision, sourceSegment: committed.package.committedSegment, hex: { q: 0, r: 1 }
  });
  assert.ok(seed);
  tacticalState.playerPlacements.push(seed.unit);
  const result = extractCampaignBattleResultPackage({ battlePackage: committed.package,
    tacticalState, missionStatus, result: "attackerVictory" });
  const applied = state.applyCampaignBattleResult(result);
  assert.ok(applied.applied && !applied.duplicate);
  const slot = await state.savePostBattleAutosave(context.engagementId, { ...postBattleRequest, timestamp: "2026-09-06T12:01:00.000Z" });
  return { state, scenario, slot, pkg: committed.package, result };
}

/** Selects and explicitly loads through the real HQ dialog; opening alone must never restore. */
async function chooseCampaignCheckpoint(slotId: string): Promise<void> {
  await waitForCampaignDom(() => !!document.querySelector("#campaignCheckpointPicker") || !document.querySelector<HTMLButtonElement>("#campaignLoad")?.disabled);
  const dialog = document.querySelector<HTMLElement>("#campaignCheckpointPicker");
  assert.ok(dialog, "HQ Load must open a campaign checkpoint choice before loading anything.");
  const option = Array.from(dialog.querySelectorAll<HTMLButtonElement>("[data-campaign-checkpoint-id]"))
    .find((button) => button.dataset.campaignCheckpointId === slotId);
  assert.ok(option, `The checkpoint ${slotId} must be offered.`);
  option.click();
  const load = dialog.querySelector<HTMLButtonElement>("[data-campaign-checkpoint-load]");
  assert.ok(load && !load.disabled);
  load.click();
}

registerTest("FSG_CAM_091_ACTUAL_SCREEN_AAR_AND_HISTORY_RETAIN_NAMED_SECTOR_AFTER_CAPTURE", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { state, result } = await prepareCampaignPostBattle(backend);
  const before = state.getRuntimeSnapshot();
  assert.ok(before);
  assert.equal(state.getCampaignMapView("Player")!.scenario.fronts.length, 0, "Real capture must remove the active front.");
  assert.equal(state.getCampaignAfterActionReport(result.engagementId)!.battleHexKey, "24,12");
  const { root, screen } = mountIsolatedCampaignScreen(state);
  try {
    const report = root.querySelector<HTMLElement>("#campaignAfterActionPanel");
    assert.ok(report && !report.hidden);
    assert.equal(report.querySelector("h3")?.textContent, "After action: Omaha-Gold Sector");
    const focus = report.querySelector<HTMLButtonElement>("[data-campaign-map-hex-target='24,24']");
    assert.equal(focus?.textContent, "Focus Omaha-Gold Sector · Grid 24,24");
    focus!.click();
    assert.equal(root.querySelector("#campaignContextInspector")?.getAttribute("data-selection-kind"), "hex");
    const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.battleHistory[entry.battleHistory.length - 1]?.type === "statusChanged");
    assert.ok(formation, "A held survivor must retain the real battle-linked status history.");
    root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='forces']")!.click();
    root.querySelector<HTMLElement>("#campaignForcesTheater > summary")!.click();
    const formationControl = root.querySelector<HTMLButtonElement>(`[data-force-id='${formation.id}']`);
    assert.ok(formationControl, "The real Forces list must expose the surviving formation.");
    formationControl.click();
    const inspector = root.querySelector("#campaignContextInspector")?.textContent ?? "";
    assert.match(inspector, /Omaha-Gold Sector.*Grid 24,24/);
    assert.doesNotMatch(inspector, new RegExp(result.engagementId));
    assert.deepEqual(state.getRuntimeSnapshot(), before, "Rendering and focusing historical geography must preserve all reports, formations and stocks.");
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_091_AUTHORED_GEOGRAPHY_SURVIVES_PRIOR_REKEY_WITH_FROZEN_AND_AMBIGUITY_CONTROLS", async () => {
  for (const [frontCase, expected] of [
    ["rekey", "Omaha-Gold Sector"], ["frozenOnly", "Frozen beachhead"],
    ["ambiguous", "Operation Overlord - Normandy Campaign"], ["namedPlace", "Beach exit"]
  ] as const) {
    const backend = new InMemoryCampaignSaveBackend();
    const { state, scenario, slot } = await prepareCampaignPostBattle(backend, frontCase);
    const before = state.getRuntimeSnapshot();
    const restored = new CampaignState({ saveBackend: backend, legacyStorage: null });
    restored.setScenario(scenario);
    const loaded = await restored.loadCampaignSlot(slot.slotId, postBattleRequest);
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
    const { root, screen } = mountIsolatedCampaignScreen(restored);
    try {
      assert.equal(root.querySelector("#campaignAfterActionPanel h3")?.textContent, `After action: ${expected}`, frontCase);
      assert.equal(root.querySelector("#campaignAfterActionPanel [data-campaign-map-hex-target='24,24']")?.textContent, `Focus ${expected} · Grid 24,24`);
      assert.deepEqual(restored.getRuntimeSnapshot(), before);
    } finally { screen.disposeCampaignAccessGate(); }
  }
});

registerTest("FSG_CAM_092_ACTUAL_HQ_PICKER_LOADS_POST_BATTLE_WITHOUT_TOUCHING_PRIMARY", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { state: saved, scenario, slot } = await prepareCampaignPostBattle(backend);
  const expected = saved.getRuntimeSnapshot();
  const beforeStorage = backend.exportState();
  const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
  state.setScenario(scenario);
  const before = state.getRuntimeSnapshot();
  const { root, screen } = mountIsolatedCampaignScreen(state);
  const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
  try {
    load.focus(); load.click();
    await waitForCampaignDom(() => !!document.querySelector("#campaignCheckpointPicker") || !load.disabled);
    assert.ok(document.querySelector("#campaignCheckpointPicker"), "HQ Load must offer saved campaign checkpoints.");
    assert.deepEqual(state.getRuntimeSnapshot(), before, "Opening the picker must not load Primary.");
    assert.deepEqual(backend.exportState(), beforeStorage);
    await chooseCampaignCheckpoint(slot.slotId);
    await waitForCampaignDom(() => !load.disabled);
    assert.deepEqual(state.getRuntimeSnapshot(), expected, "The selected checkpoint restores exact stocks, formations and immutable AAR history.");
    assert.deepEqual(backend.exportState(), beforeStorage, "Loading a post-battle slot must not rewrite Primary or any save.");
    assert.equal(document.querySelector("#campaignCheckpointPicker"), null);
    assert.equal(root.inert, false);
    const openedReport = root.querySelector<HTMLElement>("#campaignAfterActionPanel");
    assert.ok(openedReport && !openedReport.hidden && openedReport.contains(document.activeElement), "The newly opened AAR owns focus after restoration; HQ Load regains it on cancellation.");
    assert.equal(root.querySelector("#campaignAfterActionPanel h3")?.textContent, "After action: Omaha-Gold Sector");
    assert.equal(root.querySelector("[data-campaign-map-hex-target='24,24']")?.textContent, "Focus Omaha-Gold Sector · Grid 24,24");
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_092_PICKER_CANCEL_KEYBOARD_AND_DISPOSAL_RELEASE_MODAL_OWNERSHIP", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { scenario } = await prepareCampaignPostBattle(backend);
  const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
  state.setScenario(scenario);
  const before = state.getRuntimeSnapshot();
  const storage = backend.exportState();
  const { root, screen } = mountIsolatedCampaignScreen(state);
  const background = document.createElement("aside");
  background.inert = true; background.setAttribute("aria-hidden", "false");
  document.body.append(background);
  const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
  try {
    for (const cancellation of ["Escape", "Cancel", "dispose"] as const) {
      load.focus(); load.click();
      await waitForCampaignDom(() => !!document.querySelector("#campaignCheckpointPicker"));
      const dialog = document.querySelector<HTMLElement>("#campaignCheckpointPicker")!;
      assert.equal(dialog.getAttribute("role"), "dialog");
      assert.equal(dialog.getAttribute("aria-modal"), "true");
      assert.equal(dialog.querySelector("h2")?.textContent, "Load campaign checkpoint");
      assert.equal(root.inert, true);
      assert.equal(root.getAttribute("aria-hidden"), "true");
      assert.equal(load.disabled, true);
      assert.equal(dialog.querySelector<HTMLButtonElement>("[data-campaign-checkpoint-load]")!.disabled, true);
      const options = dialog.querySelectorAll<HTMLButtonElement>("[role='option']");
      assert.equal(options.length, 2);
      assert.equal(document.activeElement, options[0]);
      options[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      assert.equal(document.activeElement, options[1]);
      assert.equal(options[1].getAttribute("aria-selected"), "true");
      const cancel = dialog.querySelectorAll<HTMLButtonElement>("[data-campaign-checkpoint-cancel]")[1];
      cancel.focus();
      cancel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      assert.equal(document.activeElement, dialog.querySelector("[data-campaign-checkpoint-cancel]"));
      document.activeElement!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
      assert.equal(document.activeElement, cancel);
      if (cancellation === "Escape") cancel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      else if (cancellation === "Cancel") cancel.click();
      else screen.disposeCampaignAccessGate();
      await waitForCampaignDom(() => !load.disabled);
      assert.equal(document.querySelector("#campaignCheckpointPicker"), null);
      assert.equal(root.inert, false);
      assert.equal(root.getAttribute("aria-hidden"), null);
      assert.equal(background.inert, true);
      assert.equal(background.getAttribute("aria-hidden"), "false");
      if (cancellation !== "dispose") assert.equal(document.activeElement, load, "Busy HQ Load regains focus only after it is enabled.");
      assert.deepEqual(state.getRuntimeSnapshot(), before);
      assert.deepEqual(backend.exportState(), storage);
    }
    const outside = document.createElement("button"); document.body.append(outside); outside.focus();
    assert.equal(document.activeElement, outside, "Closed pickers must leave no focus guard behind.");
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_092_DEFERRED_LIST_CANNOT_OPEN_PICKER_AFTER_SCREEN_DISPOSAL_OR_EXIT", async () => {
  for (const exit of ["dispose", "screen"] as const) {
    const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
    state.setScenario(scenarioFixture());
    const before = state.getRuntimeSnapshot();
    let release!: (slots: Awaited<ReturnType<CampaignState["listCampaignSaveSlots"]>>) => void;
    const delayed = new Promise<Awaited<ReturnType<CampaignState["listCampaignSaveSlots"]>>>((resolve) => { release = resolve; });
    state.listCampaignSaveSlots = () => delayed;
    const { root, screen } = mountIsolatedCampaignScreen(state);
    const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
    load.click();
    assert.ok(load.disabled);
    if (exit === "dispose") screen.disposeCampaignAccessGate();
    else document.dispatchEvent(new CustomEvent("screen:shown", { detail: { id: "landing" } }));
    release([]);
    await waitForCampaignDom(() => !load.disabled || !!document.querySelector("#campaignCheckpointPicker"));
    assert.equal(document.querySelector("#campaignCheckpointPicker"), null, "A completed stale listing must not mount or isolate the new screen.");
    assert.equal(Boolean(root.inert), false);
    assert.equal(root.getAttribute("aria-hidden"), null);
    assert.deepEqual(state.getRuntimeSnapshot(), before);
    screen.disposeCampaignAccessGate();
  }
});

/** Stores two complete tactical primaries so delayed reads exercise real verification and recovery. */
async function prepareCampaignLoadLifecycleFixture(corrupt: boolean) {
  const backend = new InMemoryCampaignSaveBackend();
  const source = new CampaignState({ saveBackend: backend, legacyStorage: {
    getItem: (key) => key === CAMPAIGN_LEGACY_SAVE_KEY ? buildLegacyCampaignSaveV2Raw() : null,
    setItem() {}
  } });
  const scenario = buildCampaignSaveCanonicalScenario();
  source.setScenario(scenario);
  const migrated = await source.loadPrimaryCampaign(postBattleRequest);
  assert.ok(migrated.ok, migrated.ok ? "" : migrated.error.message);
  const runtime = source.getRuntimeSnapshot()!;
  assert.ok(runtime.activeEngagementId);
  const binding = { campaignId: runtime.campaignId, campaignRevision: runtime.revision,
    scenarioKey: runtime.scenarioKey, engagementId: runtime.activeEngagementId };
  source.setActiveBattleSave(buildCompleteActiveBattleSave({ ...binding, focusedElementId: "battleLoadButton" }));
  await source.savePrimaryCampaign({ ...postBattleRequest, timestamp: "2026-09-06T12:02:00.000Z" });
  source.setActiveBattleSave(buildCompleteActiveBattleSave({ ...binding, focusedElementId: "endTurn" }));
  await source.savePrimaryCampaign({ ...postBattleRequest, timestamp: "2026-09-06T12:03:00.000Z" });
  const stored = backend.exportState();
  const saves = structuredClone(stored.saves) as Record<string, unknown>;
  if (corrupt) {
    const saveId = stored.slots[CAMPAIGN_PRIMARY_SAVE_SLOT_ID].currentSaveId;
    saves[saveId] = { ...(saves[saveId] as Record<string, unknown>), checksum: "fsg-save-v1-fnv1a32-deadbeef" };
  }
  const storage = new InMemoryCampaignSaveBackend({ ...stored, saves });
  const state = new CampaignState({ saveBackend: storage, legacyStorage: null });
  state.setScenario(scenario);
  return { state, storage, expectedRuntime: source.getRuntimeSnapshot(), expectedBattle: source.getActiveBattleSave() };
}

registerTest("FSG_CAM_092_DEFERRED_SELECTED_LOAD_CANNOT_OPEN_RECOVERY_OR_HANDOFF_AFTER_EXIT", async () => {
  for (const corrupt of [true, false]) for (const exit of ["dispose", "screen"] as const) {
    const { state, storage, expectedRuntime, expectedBattle } = await prepareCampaignLoadLifecycleFixture(corrupt);
    const before = state.getRuntimeSnapshot();
    const { root, screen } = mountIsolatedCampaignScreen(state);
    const layer = appendCampaignPopupFixture();
    const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const readSave = storage.getSave.bind(storage);
    let started!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    storage.getSave = async (saveId) => { started(); await delayed; return readSave(saveId); };
    const resumes: unknown[] = [];
    const onResume = (event: Event): void => { resumes.push((event as CustomEvent).detail); };
    document.addEventListener("campaign:battle:resume", onResume);
    try {
      load.click(); await chooseCampaignCheckpoint(CAMPAIGN_PRIMARY_SAVE_SLOT_ID);
      await reading;
      if (exit === "dispose") screen.disposeCampaignAccessGate();
      else document.dispatchEvent(new CustomEvent("screen:shown", { detail: { id: "landing" } }));
      release();
      await waitForCampaignDom(() => !load.disabled || !layer.classList.contains("hidden"));
      assert.equal(layer.classList.contains("hidden"), true, "A late corrupt read cannot mount recovery after its Screen request ended.");
      assert.equal(resumes.length, 0, "An accepted load may finish in State but cannot navigate a Screen that has left.");
      assert.equal(document.querySelector("#campaignCheckpointPicker"), null);
      assert.equal(root.inert, false);
      assert.deepEqual(state.getRuntimeSnapshot(), corrupt ? before : expectedRuntime);
      assert.deepEqual(state.getActiveBattleSave(), corrupt ? null : expectedBattle);
    } finally {
      release(); screen.disposeCampaignAccessGate();
      document.removeEventListener("campaign:battle:resume", onResume);
    }
  }
});

registerTest("FSG_CAM_092_PENDING_RECOVERY_CANNOT_APPLY_AFTER_REQUEST_EXIT", async () => {
  for (const acceptedBeforeExit of [false, true]) {
    const { state } = await prepareCampaignLoadLifecycleFixture(true);
    const before = state.getRuntimeSnapshot();
    const { root, screen } = mountIsolatedCampaignScreen(state);
    const layer = appendCampaignPopupFixture();
    const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
    try {
      load.click(); await chooseCampaignCheckpoint(CAMPAIGN_PRIMARY_SAVE_SLOT_ID);
      await waitForCampaignDom(() => !layer.classList.contains("hidden"));
      const accept = layer.querySelector<HTMLButtonElement>("[data-confirm-campaign-action]")!;
      if (acceptedBeforeExit) accept.click();
      document.dispatchEvent(new CustomEvent("screen:shown", { detail: { id: "landing" } }));
      assert.equal(layer.classList.contains("hidden"), true, "Leaving must dismiss the pending recovery confirmation.");
      await waitForCampaignDom(() => !load.disabled);
      accept.click();
      assert.deepEqual(state.getRuntimeSnapshot(), before, "Neither a queued acceptance nor a stale detached button may restore after exit.");
      assert.equal(state.getActiveBattleSave(), null);
      assert.equal(root.inert, false);
    } finally { screen.disposeCampaignAccessGate(); }
  }
});

registerTest("FSG_CAM_092_ACCESS_REVOCATION_CANCELS_PICKER_BEFORE_GATE_OWNS_FOCUS", async () => {
  const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
  state.setScenario(scenarioFixture());
  const before = state.getRuntimeSnapshot();
  const { root, screen, unlock } = mountIsolatedCampaignScreen(state);
  const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
  try {
    load.focus(); load.click();
    await waitForCampaignDom(() => !!document.querySelector("#campaignCheckpointPicker"));
    unlock.hydrate({ ...unlock.getSnapshot(), isPrivileged: false });
    assert.equal(document.querySelector("#campaignCheckpointPicker"), null, "The access gate must not compete with the picker focus/key guards.");
    const gate = document.querySelector<HTMLElement>("#campaignLockOverlay")!;
    assert.ok(gate?.contains(document.activeElement));
    await waitForCampaignDom(() => !load.disabled);
    assert.equal(root.inert, true);
    document.activeElement!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, gate.querySelector("[data-lock-return]"));
    assert.deepEqual(state.getRuntimeSnapshot(), before);
    unlock.hydrate({ ...unlock.getSnapshot(), isPrivileged: true });
    assert.equal(document.querySelector("#campaignLockOverlay"), null);
    assert.equal(root.inert, false);
    assert.equal(root.getAttribute("aria-hidden"), null);
    load.focus();
    assert.equal(document.activeElement, load, "Regranting access must leave no picker trap or isolation behind.");
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_092_SELECTED_CORRUPT_POST_BATTLE_REQUIRES_EXPLICIT_RECOVERY", async () => {
  const original = new InMemoryCampaignSaveBackend();
  const { state: saved, scenario, slot, result } = await prepareCampaignPostBattle(original);
  const expected = saved.getRuntimeSnapshot();
  saved.advanceSegment();
  await saved.savePostBattleAutosave(result.engagementId, { ...postBattleRequest, timestamp: "2026-09-06T12:03:00.000Z" });
  const exported = original.exportState();
  const currentId = exported.slots[slot.slotId].currentSaveId;
  const saves = structuredClone(exported.saves) as Record<string, unknown>;
  saves[currentId] = { ...(saves[currentId] as Record<string, unknown>), checksum: "fsg-save-v1-fnv1a32-deadbeef" };
  const backend = new InMemoryCampaignSaveBackend({ ...exported, saves });
  const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
  state.setScenario(scenario);
  const before = state.getRuntimeSnapshot();
  const { root, screen } = mountIsolatedCampaignScreen(state);
  const layer = appendCampaignPopupFixture();
  const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
  try {
    for (const acceptRecovery of [false, true]) {
      load.focus(); load.click();
      await chooseCampaignCheckpoint(slot.slotId);
      await waitForCampaignDom(() => !layer.classList.contains("hidden") || !load.disabled);
      assert.equal(layer.classList.contains("hidden"), false);
      assert.equal(layer.querySelector("[data-popup-title]")?.textContent, "Recover earlier campaign");
      assert.deepEqual(state.getRuntimeSnapshot(), before, "Even the verified earlier record waits for explicit acceptance.");
      const accept = layer.querySelector<HTMLButtonElement>("[data-confirm-campaign-action]")!;
      if (acceptRecovery) { accept.click(); accept.click(); }
      else accept.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await waitForCampaignDom(() => !load.disabled);
      assert.deepEqual(state.getRuntimeSnapshot(), acceptRecovery ? expected : before);
      assert.deepEqual(backend.exportState().slots, exported.slots, "Recovery must not advance Primary or the damaged post-battle pointer.");
      assert.deepEqual(backend.exportState().saves, saves);
      assert.equal(root.inert, false);
    }
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_092_WRONG_CONTENT_SELECTION_FAILS_CLOSED_AND_PRIMARY_LEGACY_REMAINS_AVAILABLE", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { slot } = await prepareCampaignPostBattle(backend);
  const legacyValues = new Map([[CAMPAIGN_LEGACY_SAVE_KEY, buildLegacyCampaignSaveV2Raw()]]);
  const exported = backend.exportState();
  const slots = { ...exported.slots };
  delete slots[CAMPAIGN_PRIMARY_SAVE_SLOT_ID];
  const storage = new InMemoryCampaignSaveBackend({ ...exported, slots });
  const state = new CampaignState({ saveBackend: storage, legacyStorage: {
    getItem: (key) => legacyValues.get(key) ?? null, setItem: (key, value) => { legacyValues.set(key, value); }
  } });
  state.setScenario(buildCampaignSaveCanonicalScenario());
  const before = state.getRuntimeSnapshot();
  const { root, screen } = mountIsolatedCampaignScreen(state);
  const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
  try {
    load.click(); await chooseCampaignCheckpoint(slot.slotId);
    await waitForCampaignDom(() => !load.disabled);
    assert.match(root.textContent ?? "", /Campaign load failed/);
    assert.deepEqual(state.getRuntimeSnapshot(), before);
    assert.deepEqual(storage.exportState().slots, slots);
    assert.equal(storage.exportState().slots[CAMPAIGN_PRIMARY_SAVE_SLOT_ID], undefined);
    load.click(); await chooseCampaignCheckpoint(CAMPAIGN_PRIMARY_SAVE_SLOT_ID);
    await waitForCampaignDom(() => !load.disabled);
    assert.match(root.textContent ?? "", /Campaign migrated and restored/);
    assert.ok(storage.exportState().slots[CAMPAIGN_PRIMARY_SAVE_SLOT_ID], "Only the existing explicit primary migration path may create Primary.");
    assert.equal(legacyValues.get(CAMPAIGN_LEGACY_SAVE_KEY), buildLegacyCampaignSaveV2Raw());
  } finally { screen.disposeCampaignAccessGate(); }
});

/** Opens an exact roster identity through the real Forces controls after closing the report. */
function inspectCampaignFormation(root: HTMLElement, formationId: string): void {
  root.querySelector<HTMLButtonElement>("#campaignAfterActionPanel [data-continue-campaign-aar]")?.click();
  root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab='forces']")!.click();
  const theater = root.querySelector<HTMLDetailsElement>("#campaignForcesTheater")!;
  if (!theater.open) theater.querySelector<HTMLElement>("summary")!.click();
  const control = root.querySelector<HTMLButtonElement>(`[data-force-id='${formationId}']`);
  assert.ok(control, "The actual Forces roster must expose the exact selected formation.");
  control.click();
}

for (const route of ["CONTINUE", "RECOVER"] as const) {
  registerTest(`FSG_CAM_098_SCREEN_LOADED_AAR_${route}_SYNCS_EXACT_RECOVERY_QUOTE_AND_DRAFT`, async () => {
    for (const priorSelection of ["none", "sibling"] as const) {
      const backend = new InMemoryCampaignSaveBackend();
      const { state: saved, scenario, slot } = await prepareCampaignPostBattle(backend, undefined, true);
      const formation = saved.getCampaignFormationRoster("Player").find((entry) => entry.status === "shattered")!;
      const sibling = saved.getCampaignFormationRoster("Player").find((entry) => entry.status === "ready")!;
      const expected = saved.getRuntimeSnapshot();
      const storageBefore = backend.exportState();
      const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
      state.setScenario(scenario);
      const { root, screen } = mountIsolatedCampaignScreen(state);
      try {
        if (priorSelection === "sibling") inspectCampaignFormation(root, sibling.id);
        const load = root.querySelector<HTMLButtonElement>("#campaignLoad")!;
        load.focus(); load.click();
        await chooseCampaignCheckpoint(slot.slotId);
        await waitForCampaignDom(() => !load.disabled);
        assert.deepEqual(state.getRuntimeSnapshot(), expected, "The actual HQ selection must load the exact post-battle checkpoint.");
        assert.deepEqual(backend.exportState(), storageBefore, "Loading must leave Primary and the post-battle save untouched.");
        const reportPanel = root.querySelector<HTMLElement>("#campaignAfterActionPanel")!;
        assert.ok(!reportPanel.hidden && reportPanel.contains(document.activeElement));
        const report = state.getCampaignAfterActionReports()[0];
        reportPanel.querySelector<HTMLButtonElement>("[data-acknowledge-aar]")!.click();
        assert.deepEqual(state.getCampaignAfterActionReports()[0], { ...report, acknowledged: true },
          "Acknowledgement may change only the projected read flag, preserving every frozen report field.");
        const beforeNavigation = state.getRuntimeSnapshot()!;
        const preview = state.getCampaignFormationRecoveryPreview(formation.id);
        assert.equal(preview.availability, "available", preview.reason ?? "");
        assert.ok(preview.quote);
        const quote = preview.quote;
        const recover = reportPanel.querySelector<HTMLButtonElement>(`[data-aar-target-kind='formation'][data-aar-target-id='${formation.id}']`);
        assert.ok(recover, "The actual AAR must offer recovery for the exact shattered survivor.");
        assert.equal(reportPanel.querySelector("[data-aar-target-kind]"), recover, "Continue must route to the same first required formation decision.");
        const action = route === "CONTINUE"
          ? reportPanel.querySelector<HTMLButtonElement>("[data-continue-campaign-aar]")! : recover;
        action.focus(); action.click();
        assert.equal(reportPanel.hidden, true);
        assert.equal(root.querySelector("[data-campaign-workspace-tab='forces']")?.getAttribute("aria-selected"), "true");
        const inspector = root.querySelector<HTMLElement>("#campaignContextInspector")!;
        assert.equal(inspector.dataset.routeIdentity, `formation:${formation.id}`);
        const panel = inspector.querySelector<HTMLElement>("[data-campaign-formation-recovery]");
        assert.ok(panel && !panel.closest("[hidden], .hidden, [inert]"),
          `Loaded AAR ${route} must render the selected formation's visible recovery content with prior selection ${priorSelection}.`);
        const add = panel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]");
        assert.ok(add && !add.disabled);
        assert.equal(add.dataset.formationId, formation.id, "An earlier sibling selection must never supply the AAR recovery identity.");
        assert.equal(Number(add.dataset.recoveryRevision), preview.revision);
        assert.ok(panel.textContent?.includes(`${quote.suppliesCost} supply · ${quote.durationSegments * CAMPAIGN_SEGMENT_HOURS} hours`));
        assert.ok(panel.textContent?.includes(`projected readiness ${Math.round(quote.projectedReadiness)}%`));
        assert.ok(panel.textContent?.includes(state.segmentToTimeDisplay(quote.completeSegment)));
        assert.equal(inspector.querySelector("[data-plan-campaign-redeploy]"), null, "The shattered formation must not inherit generic or sibling redeployment.");
        assert.deepEqual(state.getRuntimeSnapshot(), beforeNavigation, "AAR navigation and quoting must not heal, spend, assign or acknowledge anything else.");
        assert.deepEqual(backend.exportState(), storageBefore);
        const requests: Parameters<CampaignState["createFormationRecoveryDraft"]>[0][] = [];
        const create = state.createFormationRecoveryDraft.bind(state);
        // Observe the exact request while retaining the real State validation/transaction.
        state.createFormationRecoveryDraft = (request) => { requests.push(structuredClone(request)); return create(request); };
        add.focus(); add.click();
        assert.deepEqual(requests, [{ formationId: formation.id, expectedRevision: preview.revision, faction: "Player" }]);
        const orders = state.getCampaignOrders().filter((entry) => entry.kind === "formationRecovery");
        assert.equal(orders.length, 1);
        const draft = orders[0];
        assert.ok(draft.kind === "formationRecovery" && draft.status === "draft");
        assert.equal(draft.payload.formationId, formation.id);
        assert.notEqual(draft.payload.formationId, sibling.id);
        assert.equal(draft.payload.sourceFingerprint, quote.sourceFingerprint);
        assert.equal(draft.payload.suppliesCost, quote.suppliesCost);
        assert.equal(draft.payload.completeSegment, quote.completeSegment);
        const review = inspector.querySelector<HTMLButtonElement>(`[data-campaign-recovery-order-id='${draft.id}']`);
        assert.ok(review);
        assert.equal(document.activeElement, review, "The focused Add action must continue on the exact newly created order's Review control.");
        assert.deepEqual(state.getRuntimeSnapshot()!.formations, beforeNavigation.formations);
        assert.deepEqual(state.getRuntimeSnapshot()!.factions, beforeNavigation.factions);
        assert.deepEqual(backend.exportState(), storageBefore, "Drafting never writes Primary or another checkpoint.");
      } finally { screen.disposeCampaignAccessGate(); }
    }
  });
}

registerTest("FSG_CAM_093_SCREEN_RECOVERY_QUOTES_AND_DRAFTS_EXACT_SHATTERED_SURVIVORS", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { state, scenario } = await prepareCampaignPostBattle(backend, undefined, true);
  const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.status === "shattered");
  assert.ok(formation);
  const preview = state.getCampaignFormationRecoveryPreview(formation.id);
  assert.equal(preview.availability, "available", preview.reason ?? "");
  assert.ok(preview.quote);
  const quote = preview.quote;
  const { root, screen } = mountIsolatedCampaignScreen(state);
  try {
    inspectCampaignFormation(root, formation.id);
    const before = state.getRuntimeSnapshot()!;
    const panel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]");
    assert.ok(panel, "The selected shattered formation needs a supported recovery quote/action.");
    assert.equal(panel.closest("[hidden], .hidden"), null, "Recovery cannot be hidden by the ordinary-order posture gate.");
    assert.ok(panel.textContent?.includes(`${quote.suppliesCost} supply`));
    assert.ok(panel.textContent?.includes(`${quote.personnelToFit} surviving personnel`));
    assert.ok(panel.textContent?.includes(`${quote.equipmentToOperational} equipment`));
    assert.ok(panel.textContent?.includes(state.segmentToTimeDisplay(quote.completeSegment)));
    assert.match(panel.textContent ?? "", /10 killed.*2 destroyed.*remain losses/);
    assert.deepEqual(state.getRuntimeSnapshot(), before, "Reading the quote must not spend or heal.");
    const add = panel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]");
    assert.ok(add && !add.disabled);
    add.focus(); add.click(); add.click();
    const order = state.getCampaignOrders().find((entry) => entry.kind === "formationRecovery");
    assert.ok(order?.kind === "formationRecovery" && order.status === "draft");
    assert.equal(state.getCampaignOrders().filter((entry) => entry.kind === "formationRecovery").length, 1);
    assert.equal(order.payload.formationId, formation.id);
    assert.equal(order.payload.suppliesCost, quote.suppliesCost);
    assert.equal(order.payload.completeSegment, quote.completeSegment);
    const review = root.querySelector<HTMLButtonElement>(`[data-campaign-formation-recovery] [data-campaign-recovery-order-id='${order.id}']`);
    assert.ok(review);
    assert.equal(document.activeElement, review, "Draft creation must carry focus from the removed Add action to its exact Review control.");
    assert.deepEqual(state.getRuntimeSnapshot()!.formations, before.formations, "Drafting must not heal any exact formation.");
    assert.deepEqual(state.getRuntimeSnapshot()!.factions, before.factions, "Draft holds do not spend stock.");
    assert.equal(root.querySelector("[data-draft-formation-recovery]"), null);
    root.querySelector<HTMLButtonElement>("#campaignCommitOrders")!.click();
    const committed = state.getCampaignOrders().find((entry) => entry.id === order.id)!;
    assert.equal(committed.status, "committed");
    assert.equal(state.getCampaignFormationSnapshot(formation.id)?.status, "refitting");
    const committedCopy = root.querySelector("#campaignContextInspector")?.textContent ?? "";
    assert.match(committedCopy, /Formation recovery/);
    assert.ok(committedCopy.includes(state.segmentToTimeDisplay(quote.completeSegment)));
    await state.saveCampaignSlot({ ...postBattleRequest, timestamp: "2026-09-06T12:05:00.000Z", slotId: "test-recovery-committed", slotType: "manual" });
    const restored = new CampaignState({ saveBackend: backend, legacyStorage: null });
    restored.setScenario(scenario);
    const loaded = await restored.loadCampaignSlot("test-recovery-committed", postBattleRequest);
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
    assert.deepEqual(restored.getRuntimeSnapshot(), state.getRuntimeSnapshot());
    const checkpoint = restored.getRuntimeSnapshot()!;
    const resumed = mountIsolatedCampaignScreen(restored);
    inspectCampaignFormation(resumed.root, formation.id);
    assert.match(resumed.root.querySelector("#campaignContextInspector")?.textContent ?? "", /Formation recovery/);
    assert.ok(resumed.root.querySelector("#campaignContextInspector")?.textContent?.includes(restored.segmentToTimeDisplay(quote.completeSegment)));
    try {
      restored.advanceSegment();
      const executing = restored.getCampaignOrders().find((entry) => entry.id === order.id);
      assert.ok(executing?.kind === "formationRecovery" && executing.status === "executing");
      assert.equal(executing.payload.progress.completedSegments, 1);
      assert.match(resumed.root.querySelector("[data-campaign-formation-recovery]")?.textContent ?? "", /1\/\d+ recovery segments complete/);
      while (restored.getRuntimeSnapshot()!.currentSegment < quote.completeSegment) restored.advanceSegment();
      const completedPanel = resumed.root.querySelector("[data-campaign-formation-recovery]");
      assert.equal(completedPanel?.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]")?.disabled, true);
      assert.match(completedPanel?.textContent ?? "", /no surviving casualties|no .*recover/i);
    } finally { resumed.screen.disposeCampaignAccessGate(); }
    const after = restored.getCampaignFormationSnapshot(formation.id)!;
    assert.equal(after.status, "ready");
    assert.equal(Object.values(after.personnel).reduce((sum, pool) => sum + pool.fit, 0), 150);
    assert.equal(Object.values(after.personnel).reduce((sum, pool) => sum + pool.killed, 0), 10);
    assert.equal(Object.values(after.equipment).reduce((sum, pool) => sum + pool.destroyed, 0), 2);
    assert.equal(restored.getCampaignOrders().find((entry) => entry.id === order.id)?.status, "completed");
    assert.equal(restored.getRuntimeSnapshot()!.formationOrder.join(), checkpoint.formationOrder.join());
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_093_SCREEN_RECOVERY_SHOWS_REAL_BLOCKERS_AND_REVALIDATES_STALE_CLICK", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { state } = await prepareCampaignPostBattle(backend, undefined, true);
  const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.status === "shattered")!;
  const healthy = state.getCampaignFormationRoster("Player").find((entry) => entry.status === "ready")!;
  const { root, screen } = mountIsolatedCampaignScreen(state);
  try {
    inspectCampaignFormation(root, healthy.id);
    const healthyPreview = state.getCampaignFormationRecoveryPreview(healthy.id);
    assert.equal(healthyPreview.availability, "blocked");
    let panel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]")!;
    assert.ok(panel.textContent?.includes(healthyPreview.reason!));
    assert.ok(panel.textContent?.includes(healthyPreview.correctiveAction!));
    assert.equal(panel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]")?.disabled, true);
    inspectCampaignFormation(root, formation.id);
    panel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]")!;
    const add = panel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]")!;
    const formations = state.getRuntimeSnapshot()!.formations;
    // Another real command changes the revision between displayed quote and the
    // bubbling Add click. The owning State must reject the stale displayed revision.
    const concurrent = (): void => {
      const result = state.createProductionDraft({ supplies: 100, fuel: 0, ammo: 0, manpower: 0 });
      assert.ok(result.ok, result.ok ? "" : result.reason);
    };
    add.addEventListener("click", concurrent, { once: true, capture: true });
    add.focus(); add.click();
    assert.equal(state.getCampaignOrders().filter((entry) => entry.kind === "formationRecovery").length, 0);
    assert.deepEqual(state.getRuntimeSnapshot()!.formations, formations);
    assert.match(root.textContent ?? "", /campaign changed after this quote/);
    assert.match(root.textContent ?? "", /Recovery draft not added/);
    const refreshed = root.querySelector<HTMLButtonElement>("[data-campaign-formation-recovery] [data-draft-formation-recovery]");
    assert.ok(refreshed && !refreshed.disabled);
    assert.equal(document.activeElement, refreshed, "A rejected stale draft must keep focus on the refreshed actionable quote.");
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_099_SCREEN_RECOVERY_REJECTION_RETAINS_CURRENT_ORDER_CONTEXT", async () => {
  const { state } = await prepareCampaignPostBattle(new InMemoryCampaignSaveBackend(), undefined, true);
  const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.status === "shattered")!;
  const { root, screen } = mountIsolatedCampaignScreen(state);
  try {
    inspectCampaignFormation(root, formation.id);
    const add = root.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]")!;
    let acceptedOrderId = "";
    let acceptedState: ReturnType<CampaignState["getRuntimeSnapshot"]> = null;
    add.addEventListener("click", () => {
      const preview = state.getCampaignFormationRecoveryPreview(formation.id);
      const created = state.createFormationRecoveryDraft({ formationId: formation.id, expectedRevision: preview.revision });
      assert.ok(created.ok, created.ok ? "" : created.reason);
      acceptedOrderId = created.order.id;
      const committed = state.commitCampaignOrders([acceptedOrderId]);
      assert.ok(committed.ok, committed.ok ? "" : committed.reason);
      acceptedState = state.getRuntimeSnapshot();
    }, { capture: true, once: true });
    add.focus(); add.click();
    assert.ok(acceptedState);
    assert.deepEqual(state.getRuntimeSnapshot(), acceptedState, "The stale UI request must not duplicate the already accepted order or its debit.");
    assert.match(root.textContent ?? "", /Recovery draft not added/);
    const panel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]")!;
    assert.ok(panel.contains(document.activeElement), "A rejection with no fresh Add control must retain focus in the current recovery context.");
    assert.equal(panel.querySelector("[data-draft-formation-recovery]"), null);
    const review = panel.querySelector<HTMLButtonElement>("[data-campaign-recovery-order-id]")!;
    assert.equal(review.dataset.campaignRecoveryOrderId, acceptedOrderId);
    assert.equal(state.getCampaignFormationSnapshot(formation.id)!.currentOrderId, acceptedOrderId);
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_093_SCREEN_INSUFFICIENT_SUPPLIES_SHOWS_QUOTE_WITH_BLOCKED_REASON", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { state, slot } = await prepareCampaignPostBattle(backend, undefined, true);
  const stored = backend.exportState();
  const validation = validateCampaignSaveEnvelope(stored.saves[slot.currentSaveId]);
  assert.ok(validation.ok, validation.ok ? "" : validation.error.message);
  const runtime = structuredClone(validation.envelope.payload.runtime);
  runtime.factions.Player.economy.supplies = 0;
  const envelope = createCampaignSaveEnvelope({ ...validation.envelope, saveId: `${validation.envelope.saveId}:no-supply`,
    updatedAt: "2026-09-06T12:06:00.000Z", payload: { ...validation.envelope.payload, runtime } });
  await new CampaignSaveRepository(backend).saveSlot({ slotId: slot.slotId, label: "No supplies remaining", envelope });
  const loaded = await state.loadCampaignSlot(slot.slotId, postBattleRequest);
  assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
  const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.status === "shattered")!;
  const { root, screen } = mountIsolatedCampaignScreen(state);
  try {
    inspectCampaignFormation(root, formation.id);
    const before = state.getRuntimeSnapshot();
    const preview = state.getCampaignFormationRecoveryPreview(formation.id);
    assert.equal(preview.availability, "blocked");
    assert.equal(preview.reasonCode, "ORDER_RESOURCE_INSUFFICIENT");
    assert.ok(preview.quote);
    const panel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]")!;
    assert.ok(panel.textContent?.includes(`${preview.quote.suppliesCost} supply`));
    assert.ok(panel.textContent?.includes(preview.reason!));
    assert.ok(panel.textContent?.includes(preview.correctiveAction!));
    panel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]")!.click();
    assert.deepEqual(state.getRuntimeSnapshot(), before);
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_093_SCREEN_INTERRUPTED_WORKSHOP_OFFERS_ZERO_COST_CONTINUATION_AND_SHOWS_NEW_ACTIVE_ORDER", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const { state } = await prepareCampaignPostBattle(backend, undefined, "workshop");
  const formation = state.getCampaignFormationRoster("Player").find((entry) => entry.status === "shattered")!;
  const { root, screen } = mountIsolatedCampaignScreen(state);
  // Supply-control fixtures enter through validated persistence. Recovery work,
  // interruption, quotes, drafting and commitment all use the actual State API.
  const loadSupplyControl = async (controller: "Neutral" | "Player"): Promise<void> => {
    const slotId = `test-workshop-supply-${controller}`;
    const slot = await state.saveCampaignSlot({ ...postBattleRequest, slotId, slotType: "manual" });
    const validation = validateCampaignSaveEnvelope(backend.exportState().saves[slot.currentSaveId]);
    assert.ok(validation.ok, validation.ok ? "" : validation.error.message);
    const runtime = structuredClone(validation.envelope.payload.runtime);
    runtime.tiles[formation.locationHexKey!].controller = controller;
    const envelope = createCampaignSaveEnvelope({ ...validation.envelope,
      saveId: `${validation.envelope.saveId}:supply-${controller}`,
      payload: { ...validation.envelope.payload, runtime } });
    await new CampaignSaveRepository(backend).saveSlot({ slotId, label: "Workshop supply boundary", envelope });
    const loaded = await state.loadCampaignSlot(slotId, postBattleRequest);
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
    inspectCampaignFormation(root, formation.id);
  };
  try {
    inspectCampaignFormation(root, formation.id);
    root.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]")!.click();
    root.querySelector<HTMLButtonElement>("#campaignCommitOrders")!.click();
    const first = state.getCampaignOrders().find((entry) => entry.kind === "formationRecovery")!;
    assert.ok(first.kind === "formationRecovery" && first.status === "committed");
    assert.equal(first.payload.durationSegments, 8);
    assert.equal(first.payload.suppliesCost, 4);
    const step = state.advanceSegment();
    assert.ok(step.ok, step.ok ? "" : step.error.message);
    const treated = state.getCampaignFormationSnapshot(formation.id)!;
    assert.equal(Object.values(treated.personnel).reduce((sum, pool) => sum + pool.fit, 0), 150);
    assert.equal(Object.values(treated.equipment).reduce((sum, pool) => sum + pool.operational, 0), 10);

    await loadSupplyControl("Neutral");
    const interruptedStep = state.advanceSegment();
    assert.ok(interruptedStep.ok, interruptedStep.ok ? "" : interruptedStep.error.message);
    const interrupted = state.getCampaignOrders().find((entry) => entry.id === first.id)!;
    assert.ok(interrupted.kind === "formationRecovery" && interrupted.status === "blocked");
    assert.equal(interrupted.payload.progress.completedSegments, 1);
    assert.equal(state.getCampaignFormationSnapshot(formation.id)!.currentOrderId, null);
    const blockedPreview = state.getCampaignFormationRecoveryPreview(formation.id);
    assert.equal(blockedPreview.availability, "blocked");
    const blockedPanel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]")!;
    assert.ok(blockedPanel.textContent?.includes(blockedPreview.reason!));
    assert.ok(blockedPanel.textContent?.includes(blockedPreview.correctiveAction!));
    assert.equal(blockedPanel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]")?.disabled, true);

    await loadSupplyControl("Player");
    const preview = state.getCampaignFormationRecoveryPreview(formation.id);
    assert.equal(preview.availability, "available", preview.reason ?? "");
    assert.ok(preview.quote);
    const quote = preview.quote;
    assert.equal(quote.resumedFromOrderId, first.id);
    assert.equal(quote.suppliesCost, 0);
    assert.equal(quote.durationSegments, 7);
    assert.equal(quote.personnelToFit + quote.equipmentToOperational, 0);
    const beforeDraft = state.getRuntimeSnapshot()!;
    const panel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]")!;
    const add = panel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]");
    assert.ok(add && !add.disabled, "A blocked historical order must not hide State's available zero-cost continuation.");
    assert.ok(panel.textContent?.includes(`0 supply · ${quote.durationSegments * CAMPAIGN_SEGMENT_HOURS} hours`));
    assert.ok(panel.textContent?.includes(state.segmentToTimeDisplay(quote.completeSegment)));
    assert.match(panel.textContent ?? "", /Completed treatment and repair are retained/);
    assert.deepEqual(state.getRuntimeSnapshot(), beforeDraft, "Displaying continuation cannot replay treatment or debit stock.");
    add.click();
    const resumed = state.getCampaignOrders().find((entry) => entry.kind === "formationRecovery" && entry.status === "draft");
    assert.ok(resumed?.kind === "formationRecovery");
    assert.notEqual(resumed.id, first.id);
    assert.equal(resumed.payload.resumedFromOrderId, first.id);
    assert.equal(resumed.payload.suppliesCost, 0);
    assert.equal(resumed.payload.durationSegments, quote.durationSegments);
    assert.deepEqual(state.getRuntimeSnapshot()!.formations, beforeDraft.formations);
    assert.deepEqual(state.getRuntimeSnapshot()!.factions, beforeDraft.factions);
    const assertResumedVisible = (status: string, completedSegments: number): void => {
      const activePanel = root.querySelector<HTMLElement>("[data-campaign-formation-recovery]")!;
      assert.equal(activePanel.querySelector<HTMLElement>("[data-campaign-recovery-order-id]")?.dataset.campaignRecoveryOrderId, resumed.id,
        "The resumed active order must win over the older blocked record.");
      assert.equal(activePanel.querySelector("[data-draft-formation-recovery]"), null);
      assert.ok(activePanel.textContent?.includes(`${status} · ${completedSegments}/${quote.durationSegments} recovery segments complete`));
      assert.ok(activePanel.textContent?.includes(`0 supply · ${quote.durationSegments * CAMPAIGN_SEGMENT_HOURS} hours`));
    };
    assertResumedVisible("Draft", 0);
    root.querySelector<HTMLButtonElement>("#campaignCommitOrders")!.click();
    assertResumedVisible("Committed", 0);
    assert.equal(state.getCampaignFormationSnapshot(formation.id)!.currentOrderId, resumed.id);
    assert.equal(state.getRuntimeSnapshot()!.factions.Player.economy.supplies, beforeDraft.factions.Player.economy.supplies);
    root.querySelector<HTMLButtonElement>("[data-campaign-recovery-order-id]")!.click();
    assert.match(root.querySelector("#campaignContextInspector")?.textContent ?? "", /Formation recovery continuation/);
    inspectCampaignFormation(root, formation.id);
    const continuationStep = state.advanceSegment();
    assert.ok(continuationStep.ok, continuationStep.ok ? "" : continuationStep.error.message);
    assertResumedVisible("Executing", 1);
    const after = state.getCampaignFormationSnapshot(formation.id)!;
    assert.deepEqual(after.personnel, treated.personnel);
    assert.deepEqual(after.equipment, treated.equipment);
    assert.equal(state.getCampaignOrders().find((entry) => entry.id === first.id)!.status, "blocked");
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("FSG_CAM_097_SCREEN_HISTORICAL_INTELLIGENCE_COPY_RETAINS_RECORD_AND_REVIEWS_MOVED_CONTACT", async () => {
  const backend = new InMemoryCampaignSaveBackend();
  const scenario = scenarioFixture();
  scenario.dimensions = { cols: 58, rows: 50 };
  scenario.fronts = [];
  scenario.tiles[0].hex = { q: 25, r: 10 };
  scenario.tiles[1].hex = { q: 26, r: 10 };
  scenario.tilePalette.later = { ...scenario.tilePalette.bot, mapLabel: "Later observation" };
  scenario.tiles.push({ tile: "later", factionControl: "Bot", hex: { q: 27, r: 10 }, forces: [] });
  const state = new CampaignState({ saveBackend: backend, legacyStorage: null });
  state.setScenario(scenario);
  let boundary = 0;
  const loadHistoricalFixture = async (change: (runtime: NonNullable<ReturnType<CampaignState["getRuntimeSnapshot"]>>) => void): Promise<void> => {
    boundary += 1;
    const slotId = `test-historical-intelligence-${boundary}`;
    const slot = await state.saveCampaignSlot({ ...postBattleRequest, slotId, slotType: "manual",
      timestamp: `2026-09-06T12:0${boundary}:00.000Z` });
    const validation = validateCampaignSaveEnvelope(backend.exportState().saves[slot.currentSaveId]);
    assert.ok(validation.ok, validation.ok ? "" : validation.error.message);
    const runtime = structuredClone(validation.envelope.payload.runtime);
    change(runtime);
    const envelope = createCampaignSaveEnvelope({ ...validation.envelope, saveId: `${validation.envelope.saveId}:historical-fixture`,
      payload: { ...validation.envelope.payload, runtime } });
    await new CampaignSaveRepository(backend).saveSlot({ slotId, label: "Historical intelligence boundary", envelope });
    const loaded = await state.loadCampaignSlot(slotId, postBattleRequest);
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.error.message);
  };
  // The real next segment discovers the observed contact and authors its alert;
  // the saved legacy fixture starts without an opening contact assessment.
  await loadHistoricalFixture((runtime) => {
    runtime.knowledgeByFaction.Player.contacts = [];
    runtime.knowledgeByFaction.Player.sourceReports = [];
    runtime.knowledgeByFaction.Player.briefEvents = [];
  });
  const step = state.advanceSegment();
  assert.ok(step.ok, step.ok ? "" : step.error.message);
  const record = state.getCampaignAdvanceTimeline()[0];
  const alert = record.alerts.find((entry) => entry.targetKind === "intelligence" && entry.targetId);
  assert.ok(alert?.targetId, "Ordinary resolution must author a real contact-linked intelligence alert.");
  assert.equal(alert.title, "New enemy contact");
  assert.ok(alert.detail.includes("26,23"));
  const serializedAlert = JSON.stringify(alert);
  const nextStep = state.advanceSegment();
  assert.ok(nextStep.ok, nextStep.ok ? "" : nextStep.error.message);
  // A later current assessment may move. Historical alerts and source reports
  // retain their original bytes; only the current-contact fixture is updated.
  await loadHistoricalFixture((runtime) => {
    const contact = runtime.knowledgeByFaction.Player.contacts.find((entry) => entry.id === alert.targetId)!;
    contact.locationHexKey = "27,23";
    contact.lastObservedSegment = runtime.currentSegment;
    contact.lastUpdatedSegment = runtime.currentSegment;
  });
  const before = state.getRuntimeSnapshot()!;
  const stored = backend.exportState();
  assert.equal(JSON.stringify(before.advanceRecords[record.id].alerts.find((entry) => entry.id === alert.id)), serializedAlert);
  const current = state.getCampaignMapView("Player")!.enemyContacts.find((entry) => entry.id === alert.targetId)!;
  assert.equal(current.locationHexKey, "27,23");
  const { root, screen } = mountIsolatedCampaignScreen(state);
  try {
    root.querySelector<HTMLButtonElement>("#campaignCommandReports")!.click();
    const row = Array.from(root.querySelectorAll<HTMLElement>("#campaignSituationRecent article"))
      .find((entry) => entry.querySelector("strong")?.textContent === alert.title
        && entry.querySelector("span")?.textContent === state.segmentToTimeDisplay(record.toSegment));
    assert.ok(row && !row.closest("[hidden], .hidden"));
    const detail = row.querySelector("p")!.textContent!;
    assert.ok(detail.includes("An intelligence update was reported. Review Intelligence for the current assessment."),
      "Historical contact prose must not assert a location that was never frozen as structured metadata.");
    assert.doesNotMatch(detail, /26,23|27,23|Later observation/);
    assert.equal(row.dataset.alertSeverity, alert.severity);
    assert.deepEqual(state.getRuntimeSnapshot(), before);
    row.querySelector<HTMLButtonElement>("button")!.click();
    assert.equal(root.querySelector("[data-campaign-workspace-tab='intelligence']")?.getAttribute("aria-selected"), "true");
    assert.equal(root.querySelector<HTMLElement>("#campaignContextInspector")?.dataset.selectionKind, "contact");
    assert.ok(root.querySelector("#campaignContextInspectorRoute")?.textContent?.includes("27,23"),
      "The existing review route must inspect the exact contact's current assessment after movement.");
    assert.deepEqual(state.getRuntimeSnapshot(), before, "Reviewing cannot change alert identity, time, severity, read flags, contacts or resources.");
    assert.equal(JSON.stringify(state.getRuntimeSnapshot()!.advanceRecords[record.id].alerts.find((entry) => entry.id === alert.id)), serializedAlert);
    assert.deepEqual(backend.exportState(), stored, "Rendering and navigation must leave the original serialized history untouched.");
  } finally { screen.disposeCampaignAccessGate(); }
});

registerTest("CAMPAIGN_OPENING_CAMERA_FRAMES_THE_PRIMARY_NORMANDY_OBJECTIVE", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let centered: { x: number; y: number } | null = null;
  let openingZoom: number | null = null;

  await Given("a fresh D+1 campaign whose forces sit well below the map's northwest origin", async () => {
    campaignState.reset();
    mountCommandShellFixture();
  });

  await When("the pre-rendered campaign screen becomes visible", async () => {
    const renderer = {
      render() {},
      setTerrainOverlayVisible() {},
      setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      getHexCenter(hexKey: string) { return hexKey === "26,23" ? { cx: 640, cy: 980 } : null; },
      onHexClick() {},
      clearAllHighlights() {},
      highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    (screen as any).viewport = {
      centerOn(x: number, y: number) { centered = { x, y }; },
      getTransform() { return { zoom: 1, panX: 0, panY: 0 }; },
      setTransform(zoom: number) { openingZoom = zoom; }
    };
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    if (centered !== null) {
      throw new Error("The hidden startup render tried to center before the campaign had a measurable viewport.");
    }
    document.dispatchEvent(new CustomEvent("screen:shown", { detail: { id: "campaign" } }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

  await Then("the first frame centers the active lodgment rather than empty southern England", async () => {
    const actual = centered as { x: number; y: number } | null;
    const scopeLabel = document.querySelector("#campaignMapScopeLabel")?.textContent;
    const activePressed = document.querySelector<HTMLButtonElement>("#campaignActiveFrontView")?.getAttribute("aria-pressed");
    if (!actual || actual.x !== 640 || actual.y !== 980 || openingZoom !== 1.5 || scopeLabel !== "Active front" || activePressed !== "true") {
      throw new Error(`Opening camera did not identify and frame the Normandy objective at command scale: ${JSON.stringify({ actual, openingZoom, scopeLabel, activePressed })}.`);
    }
    campaignState.reset();
  });
});

registerTest("CAMPAIGN_CAMERA_SWITCHES_BETWEEN_THEATER_OVERVIEW_AND_ACTIVE_FRONT", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let centered: { x: number; y: number } | null = null;
  let openingZoom: number | null = null;
  let theaterFitCount = 0;
  let root: HTMLElement;

  await Given("a commander who has panned away from the active lodgment", () => {
    campaignState.reset();
    root = mountCommandShellFixture();
  });

  await When("the commander requests the theater overview and then returns to the active front", async () => {
    const renderer = {
      render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {}, setIntelContactsVisible() {},
      getViewportRoot() { return null; },
      getHexCenter(hexKey: string) { return hexKey === "26,23" ? { cx: 640, cy: 980 } : null; },
      onHexClick() {}, clearAllHighlights() {}, highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    (screen as any).viewport = {
      fitToMap() { theaterFitCount += 1; },
      centerOn(x: number, y: number) { centered = { x, y }; },
      getTransform() { return { zoom: 1, panX: 0, panY: 0 }; },
      setTransform(zoom: number) { openingZoom = zoom; }
    };
    (screen as any).bindCampaignControls();
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    root.querySelector<HTMLButtonElement>("#campaignTheaterOverview")?.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const theaterLabel = root.querySelector("#campaignMapScopeLabel")?.textContent;
    const theaterPressed = root.querySelector<HTMLButtonElement>("#campaignTheaterOverview")?.getAttribute("aria-pressed");
    if (theaterFitCount !== 1 || theaterLabel !== "Theater overview" || theaterPressed !== "true") {
      throw new Error(`Theater overview did not fit or identify the full map: ${JSON.stringify({ theaterFitCount, theaterLabel, theaterPressed })}.`);
    }
    root.querySelector<HTMLButtonElement>("#campaignActiveFrontView")?.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

  await Then("the active-front route restores the primary Normandy objective and identifies the camera scope", () => {
    const actual = centered as { x: number; y: number } | null;
    const activeLabel = root.querySelector("#campaignMapScopeLabel")?.textContent;
    const activePressed = root.querySelector<HTMLButtonElement>("#campaignActiveFrontView")?.getAttribute("aria-pressed");
    if (theaterFitCount !== 1 || !actual || actual.x !== 640 || actual.y !== 980 || openingZoom !== 1.5 || activeLabel !== "Active front" || activePressed !== "true") {
      throw new Error(`Active-front view did not restore the command area: ${JSON.stringify({ theaterFitCount, actual, openingZoom, activeLabel, activePressed })}.`);
    }
    campaignState.reset();
  });
});

registerTest("FSG_CAM_059_TASK_FORCE_AND_LOGISTICS_RENDER_THE_SAME_CAMPAIGN_AUTHORITY", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let onHexClick: ((hexKey: string) => void) | null = null;
  let root: HTMLElement;

  await Given("the shipped Allied assault fleet marker in the English Channel", () => {
    campaignState.reset();
    root = mountCommandShellFixture();
    const renderer = {
      render() {},
      setTerrainOverlayVisible() {},
      setIntelCoverageVisible() {},
      getViewportRoot() { return null; },
      onHexClick(handler: (hexKey: string) => void) { onHexClick = handler; },
      clearAllHighlights() {},
      highlightHex() {}
    };
    const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
    screen.initialize();
    screen.renderScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    if (!onHexClick) throw new Error("Campaign map click handling was not connected.");
  });

  await When("the player selects the fleet symbol", () => {
    if (!onHexClick) throw new Error("Campaign map click handling is unavailable.");
    onHexClick("22,20");
  });

  await Then("the inspector names its naval purpose and omits unrelated ground actions", () => {
    const inspector = root.querySelector<HTMLElement>("#campaignContextInspector");
    const route = root.querySelector<HTMLElement>("#campaignContextInspectorRoute");
    const compatibilitySelection = root.querySelector<HTMLElement>(".selection-section");
    const compatibilityActions = root.querySelector<HTMLElement>(".action-section");
    const hiddenSelectionCopy = root.querySelector<HTMLElement>("#campaignSelectionInfo")?.textContent ?? "";
    const naval = campaignState.getPlayerNavalSupport();
    const fleet = naval.sources.find((source) => source.sourceHexKey === "22,20");
    if (!fleet || !route?.textContent?.includes(fleet.reason)
      || !route.textContent.includes(`${fleet.availableFireMissions} ready fire mission`)
      || root.querySelector("#campaignNavalPowerValue")?.textContent !== naval.availableFireMissions.toLocaleString()) {
      throw new Error("Campaign producer failed to join the exact fleet's authority into both naval UI surfaces.");
    }
    if (inspector?.dataset.routeMode !== "projected"
      || inspector.querySelector("h2")?.textContent !== "Western Naval Force"
      || !route?.textContent?.includes("English Channel")
      || !route.textContent.includes("Naval task force")
      || compatibilitySelection?.hidden !== true
      || compatibilityActions?.hidden !== true
      || hiddenSelectionCopy.includes("ORDER_FORCE_UNAVAILABLE")) {
      throw new Error(`The fleet marker remained ambiguous or exposed ground-action clutter: '${inspector?.textContent ?? ""}'.`);
    }
    campaignState.reset();
  });
});

registerTest("CAMPAIGN_FCI4_TRAY_EXPLAINS_PREVIEW_CONFLICT_PRIORITY_EDIT_AND_CANCEL", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let edited = "";
  let moved = "";
  let cancellationReviewed = "";

  await Given("a complete active order set with one typed blocker and one filed terminal order", async () => {
    root = mountCommandShellFixture();
    const shell = new CampaignCommandShell(root, {
      onEditOrder: (orderId) => { edited = orderId; },
      onMoveOrder: (orderId, direction) => { moved = `${orderId}:${direction}`; },
      onCancelOrder: (orderId) => { cancellationReviewed = orderId; }
    });
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render({
      theaterTitle: "Operation Orders",
      campaignPhase: "Planning phase",
      timeLabel: "Day 1, 00:00-03:00",
      commandStatus: "Orders Ready",
      saveStatus: "Unsaved",
      unreadReports: 0,
      resources: [],
      objectives: [],
      forces: [],
      airPower: 0,
      navalPower: 0,
      intelligenceCapacity: "2/3 free · 1 held",
      orders: [{
        id: "draft-early",
        kind: "production",
        label: "Set production allocation",
        detail: "Supply 40% · Fuel 20% · Ammo 20% · Personnel 20%",
        status: "draft",
        eta: "Effective Day 2",
        validationMessages: [],
        routeSummary: "Theater-wide industrial allocation",
        costSummary: "No stock spent",
        reservationSummaries: ["next production-allocation slot · held"],
        timingSummary: "Effective Day 2",
        riskSummary: "Output follows controlled industry",
        objectiveEffect: "Indirect only",
        dependencySummary: "No linked order dependency",
        nextTransition: "Ready for atomic commit",
        cancellationSummary: "Remove before commit to release every hold.",
        canRemove: true,
        canEdit: true,
        canMoveLater: true,
        canCancel: false
      }, {
        id: "draft-conflict",
        kind: "production",
        label: "Set production allocation",
        detail: "Supply 25% · Fuel 25% · Ammo 25% · Personnel 25%",
        status: "conflict",
        eta: "Effective Day 2",
        validationMessages: ["Another draft already holds allocation."],
        validationIssues: [{
          code: "ORDER_RESERVATION_CONFLICT",
          message: "Another draft already holds allocation.",
          correctiveAction: "Remove, edit, or reprioritize the earlier draft."
        }],
        reservationSummaries: ["next production-allocation slot · proposed"],
        nextTransition: "Blocked until corrected",
        canRemove: true,
        canEdit: true,
        canMoveEarlier: true,
        canCancel: false
      }, {
        id: "committed-recon",
        kind: "reconnaissance",
        label: "Ground Recon Patrol",
        detail: "4,5 · scout formation",
        status: "committed",
        eta: "ETA Day 1, 03:00-06:00",
        validationMessages: [],
        reservationSummaries: ["1 intelligence capacity · consumed", "1 assigned asset · consumed"],
        nextTransition: "Begins next segment",
        cancellationSummary: "No sunk cost before execution; review required.",
        canRemove: false,
        canCancel: true
      }, {
        id: "filed-order",
        kind: "redeploy",
        label: "Redeploy formation",
        detail: "2,3 → 4,5",
        status: "completed",
        eta: null,
        validationMessages: [],
        canRemove: false,
        canCancel: false
      }],
      orderCommit: {
        busy: false,
        draftCount: 2,
        validDraftCount: 1,
        blockerCount: 1,
        firstBlocker: "Another draft already holds allocation.",
        firstCorrectiveAction: "Remove, edit, or reprioritize the earlier draft.",
        feedback: null,
        feedbackTone: null
      },
      advance: { mode: "segment", enabled: true, pauseAfterEveryResolution: false, summary: "2 uncommitted drafts; Advance will not execute them.", alerts: [], timeline: [] }
    });
  });

  await When("the commander uses the explicit priority, edit, and cancellation-review controls", async () => {
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".campaign-order-card__actions button"));
    buttons.find((button) => button.textContent === "Earlier")?.click();
    buttons.find((button) => button.textContent === "Edit")?.click();
    buttons.find((button) => button.textContent === "Cancel")?.click();
  });

  await Then("the tray keeps all planning facts, explains the blocker, compacts history, and routes every reversible action", async () => {
    const commit = root.querySelector<HTMLButtonElement>("#campaignCommitOrders");
    const conflict = root.querySelector<HTMLElement>("[data-reason-code='ORDER_RESERVATION_CONFLICT']");
    if (!commit?.disabled
      || !root.querySelector("#campaignOrderCommitFeedback")?.textContent?.includes("1 blocker")
      || !root.textContent?.includes("Advance will not execute them")
      || !root.textContent?.includes("next production-allocation slot")
      || conflict?.textContent?.includes("Remove, edit, or reprioritize") !== true
      || conflict?.textContent?.includes("Needs correction") !== true
      || /\bORDER_[A-Z_]+\b|RESERVATION CONFLICT/.test(root.textContent ?? "")
      || root.querySelectorAll(".campaign-order-card").length !== 3
      || root.querySelector("#campaignOrderHistoryCount")?.textContent !== "1"
      || moved !== "draft-conflict:earlier"
      || edited !== "draft-early"
      || cancellationReviewed !== "committed-recon") {
      throw new Error("FCI-4 order tray lost preview, conflict, history, or reversible-action behavior.");
    }
  });
});

registerTest("CAMPAIGN_COMMAND_SHELL_PRIORITIZES_FORCES_AND_COMPACTS_TRUE_IDLE_STATE", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let shell: CampaignCommandShell;
  const baseView = {
    theaterTitle: "Operation Clarity",
    campaignPhase: "Opening phase",
    timeLabel: "Day 1, 00:00-03:00",
    commandStatus: "Planning" as const,
    saveStatus: "Saved" as const,
    unreadReports: 0,
    resources: [],
    objectives: [{ key: "hold", label: "Hold the port", status: "In progress", hexKey: "2,2" }],
    fronts: [{ key: "front", label: "Coastal front", hexKeys: ["1,1"], initiativeLabel: "Friendly initiative" }],
    forces: [
      { hexKey: "1,1", label: "Frontline Infantry", count: 3 },
      { hexKey: "2,2", label: "Port Guard", count: 2 },
      { hexKey: "9,9", label: "Theater Reserve", count: 8 }
    ],
    airPower: 0,
    navalPower: 0,
    intelligenceCapacity: "3/3",
    orders: [],
    advance: { mode: "day" as const, enabled: true, pauseAfterEveryResolution: false, summary: "No campaign time resolved yet.", alerts: [], timeline: [] }
  };

  await Given("operational forces, a theater reserve, and no pending orders", () => {
    root = mountCommandShellFixture();
    shell = new CampaignCommandShell(root);
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render(baseView);
  });

  await When("the concise force and order surfaces render, then a completed commit reports success", () => {
    const directForces = root.querySelectorAll("#campaignForcesWorkspaceList [data-force-id]");
    const reserveDisclosure = root.querySelector<HTMLDetailsElement>(".campaign-forces-disclosure");
    if (directForces.length !== 2
      || reserveDisclosure?.open
      || reserveDisclosure?.querySelectorAll("[data-force-id]").length !== 3
      || root.querySelector<HTMLElement>(".campaign-command-shell")?.dataset.ordersEmpty !== "true") {
      throw new Error("Operational force groups did not lead the collapsed theater roster.");
    }
    shell.render({
      ...baseView,
      orderCommit: {
        busy: false,
        draftCount: 0,
        validDraftCount: 0,
        blockerCount: 0,
        firstBlocker: null,
        firstCorrectiveAction: null,
        feedback: "Orders committed successfully.",
        feedbackTone: "success" as const
      }
    });
  });

  await Then("the true idle tray has one plain status while explicit success feedback remains visible", () => {
    const layout = root.querySelector<HTMLElement>(".campaign-command-shell");
    if (layout?.dataset.ordersEmpty !== "false"
      || !root.querySelector(".campaign-order-tray__idle")?.textContent?.includes("No pending orders")
      || !root.querySelector("#campaignOrderCommitFeedback")?.textContent?.includes("Orders committed successfully.")
      || root.querySelector<HTMLButtonElement>("#campaignAdvanceSegment")?.title !== "Advance one day"
      || root.querySelector<HTMLButtonElement>("#campaignAdvanceSegment")?.getAttribute("aria-label") !== "Advance one day") {
      throw new Error("Idle compaction hid meaningful commit feedback or lost its single concise status.");
    }
  });
});
