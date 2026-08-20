/**
 * MODULE: CampaignCommandShell.test
 * WHAT: Certifies Campaign 2.0 shell regions, keyboard workspaces, safe rendering, developer gating, and selection-only map behavior.
 * WHY: The M1 shell must improve campaign interaction without leaking truth or reintroducing direct map mutations.
 *
 * DEPENDENCIES: Custom harness, jsdom, shipped campaign01, CampaignCommandShell, and CampaignScreen.
 * EXPORTS: Registered C20-010/C20-011 certification tests.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import { ensureCampaignState } from "../src/state/CampaignState";
import { CampaignCommandShell } from "../src/ui/campaign/CampaignCommandShell";
import { CampaignScreen } from "../src/ui/screens/CampaignScreen";

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
          <section class="sidebar-section map-controls-section"><button id="campaignZoomOut">−</button><button id="campaignResetView">Reset</button><button id="campaignZoomIn">+</button></section>
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
      || root.querySelector("#campaignNavalPowerValue")?.textContent !== "4") {
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
    root.querySelector<HTMLButtonElement>("#campaignCommitOrders")?.click();
    root.querySelector<HTMLButtonElement>(".campaign-order-card__actions button")?.click();
  });

  await Then("draft count, enabled commit, and callbacks expose a first-class order loop", async () => {
    const commitButton = root.querySelector<HTMLButtonElement>("#campaignCommitOrders");
    if (root.querySelector("#campaignDraftOrderCount")?.textContent !== "1" || commitButton?.disabled) {
      throw new Error("Valid typed draft did not enable atomic commit or update the tray count.");
    }
    if (committed !== 1 || removed !== "draft-1") {
      throw new Error("Typed tray commit/remove gestures did not reach controller callbacks.");
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
          personnel: "76 / 100 personnel · −24",
          condition: "Readiness 90 → 62 · Cohesion 85 → 60",
          disposition: "occupied · Secured the harbor"
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
    const inspector = document.getElementById("campaignSelectionInfo");
    if (!inspector?.textContent?.includes(playerHexKey) || !inspector.textContent.includes("Plan redeployment")) {
      throw new Error("Selection did not update the explicit-action inspector.");
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
    advance: { mode: "nextReport" as const, enabled: true, pauseAfterEveryResolution: false, summary: "No campaign time resolved yet.", alerts: [], timeline: [] }
  };

  await Given("operational forces, a theater reserve, and no pending orders", () => {
    root = mountCommandShellFixture();
    shell = new CampaignCommandShell(root);
    if (!shell.initialize()) throw new Error("Campaign command shell did not initialize.");
    shell.render(baseView);
  });

  await When("the concise force and order surfaces render, then a completed commit reports success", () => {
    const directForces = root.querySelectorAll("#campaignForcesWorkspaceList > button");
    const reserveDisclosure = root.querySelector<HTMLDetailsElement>(".campaign-forces-disclosure");
    if (directForces.length !== 2
      || reserveDisclosure?.open
      || reserveDisclosure?.querySelectorAll("button").length !== 1
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
      || !root.querySelector("#campaignOrderCommitFeedback")?.textContent?.includes("Orders committed successfully.")) {
      throw new Error("Idle compaction hid meaningful commit feedback or lost its single concise status.");
    }
  });
});
