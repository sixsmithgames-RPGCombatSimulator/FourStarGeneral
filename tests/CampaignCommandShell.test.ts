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
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import { CAMPAIGN_LEGACY_SAVE_KEY, CAMPAIGN_PRIMARY_SAVE_SLOT_ID, CampaignState, ensureCampaignState, type CampaignStatePersistenceRequest } from "../src/state/CampaignState";
import { UnlockState } from "../src/state/UnlockState";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { buildCampaignSaveCanonicalScenario, buildLegacyCampaignSaveV2Raw } from "./fixtures/CampaignSaveLegacy.fixtures.js";
import { buildCompleteActiveBattleSave } from "./TacticalSaveCompleteness.test.js";
import { CampaignCommandShell } from "../src/ui/campaign/CampaignCommandShell";
import {
  CampaignScreen,
  projectCampaignAfterActionFormationEffects
} from "../src/ui/screens/CampaignScreen";

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
function mountIsolatedCampaignScreen(state: CampaignState): { root: HTMLElement; screen: CampaignScreen } {
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
  return { root, screen };
}

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
