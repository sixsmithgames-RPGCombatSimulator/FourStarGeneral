/**
 * MODULE: CampaignCommandShell
 * WHAT: Composes and renders the first-class Campaign 2.0 command workspace around the shipped campaign map.
 * WHY: Campaign interaction needs stable command, workspace, map, inspector, and order regions without duplicating campaign truth.
 *
 * DEPENDENCIES: Browser DOM only; all campaign data arrives as an already-sanitized view model.
 * EXPORTS: CampaignCommandShell and its projection-safe view contracts.
 */

import { createCampaignCommandBar } from "./components/CampaignCommandBar";
import { createCampaignContextInspector, renderCampaignContextInspector } from "./components/CampaignContextInspector";
import { CAMPAIGN_WORKSPACES, createCampaignWorkspaceRail } from "./components/CampaignWorkspaceRail";
import { configureCampaignWorkspacePanel } from "./components/CampaignWorkspacePanel";
import type { CampaignCommandSelection, CampaignCommandUIStateSnapshot, CampaignWorkspaceId } from "./CampaignCommandUIState";

export type { CampaignWorkspaceId } from "./CampaignCommandUIState";

/** Compact projected resource displayed in the command bar. */
export interface CampaignCommandResourceView {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** Player-owned force summary displayed as a non-map alternative. */
export interface CampaignCommandForceView {
  readonly hexKey: string;
  readonly label: string;
  readonly count: number;
}

/** Player-safe operational-front summary used by the map list and typed inspector. */
export interface CampaignCommandFrontView {
  readonly key: string;
  readonly label: string;
  readonly hexKeys: readonly string[];
  readonly initiativeLabel: string;
  readonly pressureLabel?: string;
  readonly forcePosture?: string;
  readonly objectivePosture?: string;
  readonly lastChange?: string;
}

/** Faction-safe intelligence contact projection used by the map list and typed inspector. */
export interface CampaignCommandContactView {
  readonly id: string;
  readonly label: string;
  readonly locationHexKey: string;
  readonly state: "current" | "stale" | "disputed" | "lost";
  readonly confidenceBand: "low" | "medium" | "high";
  readonly ageSegments: number;
  readonly uncertaintyRadius: number;
  readonly sourceLabels: readonly string[];
  readonly strengthBand?: string;
}

/** Player-safe persistent formation projection for list and inspector surfaces. */
export interface CampaignCommandFormationView {
  readonly id: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly ownershipLabel: string;
  readonly locationHexKey: string | null;
  readonly statusLabel: string;
  readonly readiness: string;
  readonly cohesion: string;
  readonly fatigue: string;
  readonly personnel: string;
  readonly equipment: string;
  readonly supply: string;
  readonly experience: string;
  readonly honors: readonly string[];
  readonly battles: number;
  readonly currentOrderId: string | null;
  readonly latestHistory: string | null;
}

/** Player-safe strategic hex projection; actions remain owned by the existing campaign services. */
export interface CampaignCommandHexView {
  readonly hexKey: string;
  readonly roleLabel: string;
  readonly controlLabel: string;
  readonly forces: readonly string[];
  readonly infrastructure: string | null;
  readonly objectives: readonly string[];
  readonly fronts: readonly string[];
}

/** Authored objective summary safe for the Situation workspace. */
export interface CampaignCommandObjectiveView {
  readonly key: string;
  readonly label: string;
  readonly status: string;
  readonly category?: "primary" | "secondary" | "optional" | "failure";
  readonly progress?: number;
  readonly detail?: string;
  readonly deadline?: string | null;
  readonly score?: string;
  readonly hexKey?: string;
  readonly dependencies?: string | null;
  readonly failureEffect?: string | null;
}

export interface CampaignCommandObjectiveScoreView {
  readonly earned: number;
  readonly available: number;
  readonly percent: number;
  readonly projectedGrade: string;
}

export interface CampaignCommandOutcomeView {
  readonly key: string;
  readonly result: "victory" | "defeat";
  readonly grade: string;
  readonly title: string;
  readonly summary: string;
  readonly score: string;
  readonly completed: number;
  readonly failed: number;
  readonly canContinue?: boolean;
  readonly formationsPreserved?: string;
  readonly serviceRecord?: readonly string[];
  readonly checkpointStatus?: string;
}

/** Player-safe typed order projection for the persistent tray and timeline. */
export interface CampaignCommandOrderView {
  readonly id: string;
  readonly kind: "redeploy" | "production" | "reconnaissance" | "counterIntelligence" | "infrastructureRepair";
  readonly label: string;
  readonly detail: string;
  readonly status: "draft" | "conflict" | "committed" | "executing" | "completed" | "blocked" | "cancelled";
  readonly eta: string | null;
  readonly validationMessages: readonly string[];
  readonly validationIssues?: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
    readonly correctiveAction: string;
  }>;
  readonly routeSummary?: string;
  readonly costSummary?: string;
  readonly reservationSummaries?: readonly string[];
  readonly timingSummary?: string;
  readonly riskSummary?: string;
  readonly objectiveEffect?: string;
  readonly dependencySummary?: string;
  readonly nextTransition?: string;
  readonly cancellationSummary?: string;
  readonly canRemove: boolean;
  readonly canEdit?: boolean;
  readonly canMoveEarlier?: boolean;
  readonly canMoveLater?: boolean;
  readonly canCancel: boolean;
  readonly mapHexKeys?: readonly string[];
}

/** Atomic commit preflight and feedback projected beside the persistent order tray. */
export interface CampaignCommandOrderCommitView {
  readonly busy: boolean;
  readonly draftCount: number;
  readonly validDraftCount: number;
  readonly blockerCount: number;
  readonly firstBlocker: string | null;
  readonly firstCorrectiveAction: string | null;
  readonly feedback: string | null;
  readonly feedbackTone: "info" | "success" | "warning" | null;
}

export type CampaignCommandAdvanceMode = "segment" | "nextReport" | "dawn" | "dusk" | "day";
export type CampaignCommandAlertSeverity = "routine" | "notable" | "critical" | "decisionRequired";
export type CampaignCommandAlertTarget = "time" | "order" | "intelligence" | "engagement" | "objective" | "formation" | "campaign";

/** Player-safe notification projection for the persistent stop summary. */
export interface CampaignCommandAlertView {
  readonly id: string;
  readonly severity: CampaignCommandAlertSeverity;
  readonly title: string;
  readonly detail: string;
  readonly targetKind: CampaignCommandAlertTarget;
  readonly targetId: string | null;
  readonly timeLabel?: string;
  readonly requiresStop?: boolean;
  readonly acknowledged?: boolean;
}

/** Highest-value next decision shown above the Situation objective list. */
export interface CampaignCommandPriorityView {
  readonly id: string;
  readonly severity: CampaignCommandAlertSeverity;
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly targetKind: CampaignCommandAlertTarget;
  readonly targetId: string | null;
}

/** Player-safe persisted step projection shown newest-first in the timeline. */
export interface CampaignCommandTimelineView {
  readonly id: string;
  readonly timeLabel: string;
  readonly title: string;
  readonly detail: string;
  readonly severity: CampaignCommandAlertSeverity;
  readonly stopLabel: string | null;
  readonly targetKind: CampaignCommandAlertTarget;
  readonly targetId: string | null;
  readonly eventCount?: number;
}

/** Player-safe campaign synthesis used by the ten-second Situation board. */
export interface CampaignCommandSituationView {
  readonly brief: {
    readonly label: string;
    readonly title: string;
    readonly detail: string;
    readonly tone: "steady" | "attention" | "critical" | "complete";
  };
  readonly outlook: {
    readonly phaseDescription: string;
    readonly timePressure: string;
    readonly projectedGrade: string;
    readonly score: string;
    readonly objectiveStatus: string;
    readonly lossConditions: readonly string[];
  };
  readonly alerts: readonly CampaignCommandAlertView[];
  readonly intelligenceUnread: number;
  readonly afterActionUnread: number;
  readonly recentChanges: readonly CampaignCommandTimelineView[];
}

export interface CampaignCommandAdvanceView {
  readonly mode: CampaignCommandAdvanceMode;
  readonly enabled: boolean;
  readonly pauseAfterEveryResolution: boolean;
  readonly summary: string;
  readonly alerts: readonly CampaignCommandAlertView[];
  readonly timeline: readonly CampaignCommandTimelineView[];
}

export interface CampaignCommandAfterActionFormationView {
  readonly id: string;
  readonly name: string;
  readonly personnel: string;
  readonly condition: string;
  readonly disposition: string;
}

export interface CampaignCommandAfterActionDecisionView {
  readonly id: string;
  readonly severity: "attention" | "critical";
  readonly targetKind: CampaignCommandAlertTarget | "logistics" | "infrastructure";
  readonly targetId: string | null;
  readonly title: string;
  readonly detail: string;
}

/** Sanitized archive entry rendered without access to enemy campaign truth. */
export interface CampaignCommandAfterActionReportView {
  readonly id: string;
  readonly title: string;
  readonly timeLabel: string;
  readonly result: "victory" | "defeat" | "stalemate" | "withdrawal";
  readonly resultLabel: string;
  readonly acknowledged: boolean;
  readonly summary: string;
  readonly location: string;
  /** Campaign-map offset key used only for the Player-visible focus route. */
  readonly locationHexKey?: string;
  readonly checkpointStatus: string | null;
  readonly personnelLosses: string;
  readonly opponentLosses: string;
  readonly resourcesSpent: string;
  readonly scoreChange: string;
  readonly operationalEffects: readonly string[];
  readonly tacticalObjectives: readonly string[];
  readonly formations: readonly CampaignCommandAfterActionFormationView[];
  readonly objectiveChanges: readonly string[];
  readonly decisions: readonly CampaignCommandAfterActionDecisionView[];
}

/** Complete Player-safe shell view. Enemy truth must never be supplied here. */
export interface CampaignCommandShellView {
  readonly theaterTitle: string;
  readonly campaignPhase: string;
  readonly timeLabel: string;
  readonly commandStatus: "Planning" | "Orders Ready" | "Resolving" | "Engagement" | "Campaign Ended";
  readonly saveStatus: "Saved" | "Saving" | "Loading" | "Unsaved" | "Save Failed";
  readonly unreadReports: number;
  readonly situation?: CampaignCommandSituationView;
  readonly priorities?: readonly CampaignCommandPriorityView[];
  readonly afterActionReports?: readonly CampaignCommandAfterActionReportView[];
  readonly resources: readonly CampaignCommandResourceView[];
  readonly objectives: readonly CampaignCommandObjectiveView[];
  readonly objectiveScore?: CampaignCommandObjectiveScoreView;
  readonly outcome?: CampaignCommandOutcomeView | null;
  readonly forces: readonly CampaignCommandForceView[];
  readonly fronts?: readonly CampaignCommandFrontView[];
  readonly contacts?: readonly CampaignCommandContactView[];
  readonly formations?: readonly CampaignCommandFormationView[];
  readonly hexes?: readonly CampaignCommandHexView[];
  readonly airPower: number;
  readonly navalPower: number;
  readonly intelligenceCapacity: string;
  readonly orders: readonly CampaignCommandOrderView[];
  readonly orderCommit?: CampaignCommandOrderCommitView;
  readonly advance: CampaignCommandAdvanceView;
}

/** Integration callbacks keep shell gestures separate from campaign state mutation. */
export interface CampaignCommandShellCallbacks {
  readonly onWorkspaceChanged?: (workspace: CampaignWorkspaceId) => void;
  readonly onOpenIntelligence?: () => void;
  readonly onAcknowledgeAfterActionReport?: (reportId: string) => void;
  readonly onAcknowledgeAlert?: (alertId: string) => void;
  readonly onMarkIntelligenceRead?: () => void;
  readonly onCancelGesture?: () => void;
  readonly onCommitOrders?: () => void;
  readonly onRemoveOrder?: (orderId: string) => void;
  readonly onEditOrder?: (orderId: string) => void;
  readonly onMoveOrder?: (orderId: string, direction: "earlier" | "later") => void;
  readonly onCancelOrder?: (orderId: string) => void;
  readonly onAdvance?: (mode: CampaignCommandAdvanceMode) => void;
  readonly onAdvanceModeChanged?: (mode: CampaignCommandAdvanceMode) => void;
  readonly onPauseAfterEveryResolutionChanged?: (enabled: boolean) => void;
  readonly onWorkspaceExpandedChanged?: (expanded: boolean) => void;
  readonly onInspectorExpandedChanged?: (expanded: boolean) => void;
  readonly onTimelineExpandedChanged?: (expanded: boolean) => void;
  readonly onAfterActionExpandedChanged?: (expanded: boolean) => void;
  readonly onSelectionRequested?: (selection: CampaignCommandSelection) => void;
  readonly onAlertSelected?: (targetKind: CampaignCommandAlertTarget, targetId: string | null) => void;
  readonly onAfterActionTargetSelected?: (targetKind: CampaignCommandAfterActionDecisionView["targetKind"], targetId: string | null) => void;
  readonly onContinueOutcome?: () => void;
}

/** Returns true when global workspace shortcuts must not intercept text or form editing. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/** Creates a text-only element so projected campaign strings cannot become markup. */
function createTextElement(tagName: keyof HTMLElementTagNameMap, className: string, textValue: string): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = textValue;
  return element;
}

/**
 * Owns shell-only DOM structure and interaction state.
 * CampaignScreen remains responsible for campaign rules, projections, and action handlers.
 */
export class CampaignCommandShell {
  private readonly root: HTMLElement;
  private readonly callbacks: CampaignCommandShellCallbacks;
  private activeWorkspace: CampaignWorkspaceId = "situation";
  private initialized = false;
  private dismissedOutcomeKey: string | null = null;
  private inspectorExpanded = false;
  private afterActionExpanded = false;
  private selectedAfterActionReportId: string | null = null;
  private afterActionReports: readonly CampaignCommandAfterActionReportView[] = [];
  private currentView: CampaignCommandShellView | null = null;
  private activeSelection: CampaignCommandSelection = null;
  private readonly sheetInvokers = new Map<"workspace" | "inspector" | "timeline", HTMLElement>();
  private readonly automaticallyPresentedReportIds = new Set<string>();

  /**
   * Creates a command-shell controller for one campaign screen root.
   * @param root - Existing campaign screen containing the shipped map and compatibility controls.
   * @param callbacks - Gesture callbacks that do not grant direct access to campaign truth.
   */
  public constructor(root: HTMLElement, callbacks: CampaignCommandShellCallbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
  }

  /**
   * Rehomes existing campaign controls into semantic Campaign 2.0 regions.
   * Returns false for intentionally minimal test DOMs that do not contain the full campaign layout.
   */
  public initialize(): boolean {
    if (this.initialized) return true;
    const layout = this.root.querySelector<HTMLElement>(".campaign-layout");
    const map = layout?.querySelector<HTMLElement>(".campaign-map");
    const workspacePanel = layout?.querySelector<HTMLElement>(".campaign-sidebar");
    if (!layout || !map || !workspacePanel) return false;

    layout.classList.add("campaign-command-shell");
    layout.setAttribute("data-campaign-command-shell", "true");
    layout.setAttribute("data-inspector-expanded", "false");
    layout.setAttribute("data-workspace-expanded", "true");

    const commandBar = this.createCommandBar();
    const rail = this.createWorkspaceRail();
    const inspector = createCampaignContextInspector(workspacePanel);
    const tray = this.createOrderTray();
    configureCampaignWorkspacePanel(workspacePanel);
    this.configureMapStage(map);

    layout.prepend(commandBar);
    commandBar.after(rail);
    layout.append(inspector, tray, this.createAfterActionPanel(), this.createOutcomePanel());

    this.bindShellEvents();
    this.selectWorkspace("situation", false);
    this.initialized = true;
    return true;
  }

  /** Renders one sanitized command view without reading campaign state directly. */
  public render(view: CampaignCommandShellView): void {
    if (!this.initialized) return;
    this.currentView = view;
    this.setText("#campaignCommandTitle", view.theaterTitle);
    this.setText("#campaignCommandPhase", view.campaignPhase);
    this.setText("#campaignCommandClock", view.timeLabel);
    this.setText("#campaignCommandStatus", view.commandStatus);
    this.setText("#campaignCommandSaveStatus", view.saveStatus);
    this.setText("#campaignCommandUnread", String(view.unreadReports));
    this.setText("#campaignIntelligenceCapacity", view.intelligenceCapacity);
    this.setText("#campaignAirPowerValue", view.airPower.toLocaleString());
    this.setText("#campaignNavalPowerValue", view.navalPower.toLocaleString());

    const alert = this.root.querySelector<HTMLButtonElement>("#campaignCommandReports");
    if (alert) {
      alert.dataset.hasUnread = view.unreadReports > 0 ? "true" : "false";
      alert.setAttribute("aria-label", `${view.unreadReports} unread command report${view.unreadReports === 1 ? "" : "s"}`);
    }
    const status = this.root.querySelector<HTMLElement>("#campaignCommandStatus");
    if (status) status.dataset.commandStatus = view.commandStatus.toLowerCase().replace(/\s+/g, "-");
    const save = this.root.querySelector<HTMLElement>("#campaignCommandSaveStatus");
    if (save) save.dataset.saveStatus = view.saveStatus.toLowerCase().replace(/\s+/g, "-");

    this.renderResources(view.resources);
    this.renderAfterActionReports(view.afterActionReports ?? []);
    this.renderSituation(view);
    this.renderOutcome(view.outcome ?? null);
    this.renderForces(view.forces);
    this.renderOrders(view.orders, view.orderCommit);
    this.renderAdvance(view.advance);
    this.renderInspectorRoute();
  }

  /** Makes the inspector visible as a narrow-screen sheet after a map selection. */
  public revealInspector(): void {
    this.inspectorExpanded = true;
    this.syncInspectorState();
    this.setWorkspaceExpanded(false);
    const compact = typeof window !== "undefined" && window.innerWidth <= 1120;
    const focusTarget = compact
      ? this.root.querySelector<HTMLElement>("[data-close-campaign-inspector]")
      : this.root.querySelector<HTMLElement>("#campaignInspectorTitle");
    focusTarget?.focus({ preventScroll: true });
  }

  /** Returns the active workspace for tests and controller synchronization. */
  public getActiveWorkspace(): CampaignWorkspaceId {
    return this.activeWorkspace;
  }

  /** Synchronizes the inspector route with a selection made by map, list, alert, report, or order tray. */
  public setSelection(selection: CampaignCommandSelection): void {
    this.activeSelection = selection ? { ...selection } : null;
    this.renderInspectorRoute();
  }

  /** Mirrors the single managed UI-state snapshot into compatibility DOM sheet attributes. */
  public syncUIState(state: CampaignCommandUIStateSnapshot): void {
    this.setWorkspaceExpanded(state.workspaceExpanded);
    this.inspectorExpanded = state.inspectorExpanded;
    this.syncInspectorState();
    const timeline = this.root.querySelector<HTMLElement>("#campaignAdvanceTimeline");
    if (timeline && state.timelineExpanded === timeline.hidden) this.setTimelineExpanded(state.timelineExpanded);
    if (state.afterActionExpanded !== this.afterActionExpanded) this.setAfterActionExpanded(state.afterActionExpanded);
  }

  /** Applies a workspace chosen by shared navigation or another synchronized campaign surface. */
  public showWorkspace(workspace: CampaignWorkspaceId, focusTab = false): void {
    this.selectWorkspace(workspace, focusTab);
  }

  private createCommandBar(): HTMLElement {
    return createCampaignCommandBar(this.root);
  }

  private createWorkspaceRail(): HTMLElement {
    return createCampaignWorkspaceRail();
  }

  private createAfterActionPanel(): HTMLElement {
    const panel = document.createElement("section");
    panel.id = "campaignAfterActionPanel";
    panel.className = "campaign-aar-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "campaignAarTitle");
    panel.innerHTML = `
      <button class="campaign-aar-panel__backdrop" type="button" data-close-campaign-aar aria-label="Close after-action reports"></button>
      <div class="campaign-aar-card">
        <header class="campaign-aar-card__header">
          <div><span>Headquarters archive</span><h2 id="campaignAarTitle">After-action reports</h2></div>
          <button type="button" data-close-campaign-aar aria-label="Close after-action reports">×</button>
        </header>
        <div class="campaign-aar-card__body">
          <nav id="campaignAarArchive" class="campaign-aar-archive" aria-label="Battle report archive"></nav>
          <article id="campaignAarDetail" class="campaign-aar-detail" aria-live="polite"></article>
        </div>
      </div>
    `;
    return panel;
  }

  private createOutcomePanel(): HTMLElement {
    const panel = document.createElement("section");
    panel.id = "campaignOutcomePanel";
    panel.className = "campaign-outcome-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "campaignOutcomeTitle");
    panel.innerHTML = `
      <div class="campaign-outcome-card">
        <span id="campaignOutcomeEyebrow" class="campaign-outcome-card__eyebrow">Campaign record</span>
        <h2 id="campaignOutcomeTitle">Campaign outcome</h2>
        <p id="campaignOutcomeSummary"></p>
        <div class="campaign-outcome-card__metrics">
          <div><span>Score</span><strong id="campaignOutcomeScore">0 / 0</strong></div>
          <div><span>Completed</span><strong id="campaignOutcomeCompleted">0</strong></div>
          <div><span>Failed</span><strong id="campaignOutcomeFailed">0</strong></div>
          <div><span>Forces preserved</span><strong id="campaignOutcomePreserved">—</strong></div>
        </div>
        <section class="campaign-outcome-card__record"><h3>Service record</h3><ul id="campaignOutcomeServiceRecord"></ul></section>
        <p id="campaignOutcomeCheckpoint" class="campaign-outcome-card__checkpoint"></p>
        <div class="campaign-outcome-card__actions">
          <button id="campaignOutcomeReview" type="button">Review campaign map</button>
          <button id="campaignOutcomeSave" type="button">Save campaign record</button>
          <button id="campaignOutcomeContinue" type="button" hidden>Continue without scoring</button>
          <button id="campaignOutcomeExit" type="button">Return to main menu</button>
        </div>
      </div>
    `;
    return panel;
  }

  private configureMapStage(map: HTMLElement): void {
    map.classList.add("campaign-operational-map");
    map.setAttribute("aria-label", "Operational map workspace");
    const oldHeading = map.querySelector<HTMLElement>(":scope > h2");
    if (oldHeading) oldHeading.remove();

    const toolbar = document.createElement("div");
    toolbar.className = "campaign-map-command-strip";
    toolbar.setAttribute("aria-label", "Map overlays and viewport controls");
    toolbar.innerHTML = `
      <div class="campaign-map-mode-group" role="group" aria-label="Map overlay">
        <button type="button" class="active" aria-pressed="true" data-campaign-overlay="operational">Operational</button>
      </div>
      <div class="campaign-map-viewport-controls" role="group" aria-label="Map viewport"></div>
      <div class="campaign-map-legend" aria-label="Map legend"><span><i data-legend="friendly"></i>Friendly control</span><span><i data-legend="contact"></i>Assessed contact</span><span><i data-legend="front"></i>Front</span></div>
    `;
    const modeGroup = toolbar.querySelector<HTMLElement>(".campaign-map-mode-group");
    const intelCoverage = this.root.querySelector<HTMLButtonElement>("#campaignIntelCoverage");
    if (intelCoverage && modeGroup) {
      intelCoverage.textContent = "Intel coverage";
      intelCoverage.removeAttribute("title");
      intelCoverage.setAttribute("aria-label", "Toggle intelligence collection coverage");
      modeGroup.appendChild(intelCoverage);
    }
    const viewportControls = toolbar.querySelector<HTMLElement>(".campaign-map-viewport-controls");
    ["#campaignZoomOut", "#campaignResetView", "#campaignZoomIn"].forEach((selector) => {
      const control = this.root.querySelector<HTMLElement>(selector);
      if (control && viewportControls) viewportControls.appendChild(control);
    });
    map.prepend(toolbar);

    const legacyMapControls = this.root.querySelector<HTMLElement>(".map-controls-section");
    if (legacyMapControls) legacyMapControls.setAttribute("data-campaign-shell-hidden", "true");
  }

  private createOrderTray(): HTMLElement {
    const tray = document.createElement("footer");
    tray.className = "campaign-order-tray";
    tray.setAttribute("aria-label", "Campaign order tray and timeline");
    tray.innerHTML = `
      <div class="campaign-order-tray__heading">
        <span>Order tray</span>
        <strong><span id="campaignDraftOrderCount">0</span> drafts · <span id="campaignCommittedOrderCount">0</span> active · <span id="campaignOrderHistoryCount">0</span> filed</strong>
        <small id="campaignAdvanceSummary">Select an advance mode.</small>
      </div>
      <div id="campaignOrderTrayList" class="campaign-order-tray__list" aria-live="polite"></div>
      <div class="campaign-order-tray__actions">
        <div id="campaignOrderCommitFeedback" class="campaign-order-commit-feedback" role="status" aria-live="polite"></div>
        <button id="campaignCommitOrders" type="button" disabled>Commit orders</button>
        <div class="campaign-advance-control">
          <label for="campaignAdvanceMode">Advance until</label>
          <select id="campaignAdvanceMode">
            <option value="segment">3 hours</option>
            <option value="nextReport">Next report</option>
            <option value="dawn">Dawn</option>
            <option value="dusk">Dusk</option>
            <option value="day">One day</option>
          </select>
          <label class="campaign-advance-pause"><input id="campaignPauseAfterResolution" type="checkbox" /> Pause after every resolution</label>
        </div>
        <button id="campaignTimelineToggle" type="button" aria-expanded="false" aria-controls="campaignAdvanceTimeline">Timeline <span id="campaignTimelineCount">0</span></button>
      </div>
      <section id="campaignAdvanceTimeline" class="campaign-advance-timeline" aria-label="Campaign resolution timeline" hidden>
        <header><div><span>Command record</span><h2>Resolution timeline</h2></div><button type="button" data-close-campaign-timeline aria-label="Close timeline">×</button></header>
        <div id="campaignAdvanceAlerts" class="campaign-advance-alerts" aria-live="polite"></div>
        <div id="campaignAdvanceTimelineList" class="campaign-advance-timeline__list"></div>
      </section>
    `;
    const actions = tray.querySelector<HTMLElement>(".campaign-order-tray__actions");
    const advance = this.root.querySelector<HTMLButtonElement>("#campaignAdvanceSegment");
    if (advance && actions) {
      advance.classList.add("campaign-order-tray__advance");
      const icon = advance.querySelector<HTMLElement>(".btn-icon");
      const label = advance.querySelector<HTMLElement>(".btn-label");
      if (icon) icon.textContent = "Advance";
      if (label) label.textContent = "3 hours";
      actions.appendChild(advance);
    }
    return tray;
  }

  private bindShellEvents(): void {
    const rail = this.root.querySelector<HTMLElement>(".campaign-workspace-rail");
    rail?.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-campaign-workspace-tab]");
      const workspace = button?.dataset.campaignWorkspaceTab as CampaignWorkspaceId | undefined;
      if (workspace) this.selectWorkspace(workspace, true);
    });
    rail?.addEventListener("keydown", (event) => this.handleRailKeydown(event));
    this.root.querySelector("[data-open-campaign-intelligence]")?.addEventListener("click", () => this.callbacks.onOpenIntelligence?.());
    this.root.querySelector("#campaignCommandReports")?.addEventListener("click", () => {
      this.selectWorkspace("situation", true);
      this.root.querySelector<HTMLElement>("#campaignSituationAlertCenter")?.focus();
    });
    this.root.querySelectorAll("[data-close-campaign-aar]").forEach((button) => {
      button.addEventListener("click", () => this.setAfterActionExpanded(false));
    });
    this.root.querySelector("#campaignAfterActionPanel")?.addEventListener("click", (event) => {
      const target = event.target as Element;
      const reportButton = target.closest<HTMLElement>("[data-aar-report-id]");
      if (reportButton?.dataset.aarReportId) {
        this.selectedAfterActionReportId = reportButton.dataset.aarReportId;
        this.requestSelection({ kind: "report", id: reportButton.dataset.aarReportId }, false);
        this.renderAfterActionReports(this.afterActionReports, false);
        return;
      }
      const location = target.closest<HTMLButtonElement>("[data-campaign-map-hex-target]");
      if (location?.dataset.campaignMapHexTarget) {
        this.setAfterActionExpanded(false);
        this.requestSelection({ kind: "hex", id: location.dataset.campaignMapHexTarget }, true);
        return;
      }
      const acknowledge = target.closest<HTMLButtonElement>("[data-acknowledge-aar]");
      if (acknowledge?.dataset.acknowledgeAar) {
        this.callbacks.onAcknowledgeAfterActionReport?.(acknowledge.dataset.acknowledgeAar);
        return;
      }
      const decision = target.closest<HTMLButtonElement>("[data-aar-target-kind]");
      if (decision?.dataset.aarTargetKind) {
        this.callbacks.onAfterActionTargetSelected?.(
          decision.dataset.aarTargetKind as CampaignCommandAfterActionDecisionView["targetKind"],
          decision.dataset.aarTargetId ?? null
        );
        this.setAfterActionExpanded(false);
        return;
      }
      if (target.closest("[data-continue-campaign-aar]")) {
        const report = this.afterActionReports.find((entry) => entry.id === this.selectedAfterActionReportId);
        const nextDecision = report?.decisions[0];
        if (nextDecision) {
          this.callbacks.onAfterActionTargetSelected?.(nextDecision.targetKind, nextDecision.targetId);
          this.setAfterActionExpanded(false);
        } else {
          this.setAfterActionExpanded(false);
          this.selectWorkspace("situation", true);
        }
      }
    });
    this.root.querySelector("#campaignCommitOrders")?.addEventListener("click", () => this.callbacks.onCommitOrders?.());
    this.root.querySelector("#campaignAdvanceSegment")?.addEventListener("click", () => {
      const select = this.root.querySelector<HTMLSelectElement>("#campaignAdvanceMode");
      this.callbacks.onAdvance?.((select?.value ?? "segment") as CampaignCommandAdvanceMode);
    });
    this.root.querySelector("#campaignAdvanceMode")?.addEventListener("change", (event) => {
      const mode = (event.currentTarget as HTMLSelectElement).value as CampaignCommandAdvanceMode;
      this.callbacks.onAdvanceModeChanged?.(mode);
      this.syncAdvanceButtonLabel(mode);
    });
    this.root.querySelector("#campaignPauseAfterResolution")?.addEventListener("change", (event) => {
      this.callbacks.onPauseAfterEveryResolutionChanged?.((event.currentTarget as HTMLInputElement).checked);
    });
    this.root.querySelector("#campaignTimelineToggle")?.addEventListener("click", () => this.setTimelineExpanded());
    this.root.querySelector("#campaignSituationOpenTimeline")?.addEventListener("click", () => this.setTimelineExpanded(true));
    this.root.querySelector("[data-close-campaign-timeline]")?.addEventListener("click", () => this.setTimelineExpanded(false));
    this.root.querySelector("[data-close-campaign-inspector]")?.addEventListener("click", () => {
      this.inspectorExpanded = false;
      this.syncInspectorState();
    });
    this.root.querySelector("#campaignContextInspector")?.addEventListener("click", (event) => {
      const location = (event.target as Element).closest<HTMLButtonElement>("[data-campaign-map-hex-target]");
      if (location?.dataset.campaignMapHexTarget) {
        this.requestSelection({ kind: "hex", id: location.dataset.campaignMapHexTarget }, true);
      }
    });
    this.root.querySelector("[data-close-campaign-workspace]")?.addEventListener("click", () => this.setWorkspaceExpanded(false));
    this.root.querySelector("#campaignHeadquartersWorkspaceIntro")?.addEventListener("click", (event) => {
      const proxy = (event.target as Element).closest<HTMLButtonElement>("[data-campaign-session-proxy]");
      const targetId = proxy?.dataset.campaignSessionProxy;
      if (targetId) this.root.querySelector<HTMLButtonElement>(`#${targetId}`)?.click();
    });
    this.root.querySelector("#campaignOutcomeReview")?.addEventListener("click", () => {
      const panel = this.root.querySelector<HTMLElement>("#campaignOutcomePanel");
      this.dismissedOutcomeKey = panel?.dataset.outcomeKey ?? null;
      if (panel) panel.hidden = true;
      this.selectWorkspace("situation", true);
    });
    this.root.querySelector("#campaignOutcomeContinue")?.addEventListener("click", () => {
      this.callbacks.onContinueOutcome?.();
    });
    this.root.querySelector("#campaignOutcomeSave")?.addEventListener("click", () => {
      this.root.querySelector<HTMLButtonElement>("#campaignSave")?.click();
    });
    this.root.querySelector("#campaignOutcomeExit")?.addEventListener("click", () => {
      this.root.querySelector<HTMLButtonElement>("#campaignExit")?.click();
    });
    this.root.addEventListener("keydown", (event) => this.handleRootKeydown(event));
  }

  private handleRailKeydown(event: KeyboardEvent): void {
    const current = (event.target as Element).closest<HTMLButtonElement>("[data-campaign-workspace-tab]");
    if (!current) return;
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>("[data-campaign-workspace-tab]"));
    const index = buttons.indexOf(current);
    let nextIndex: number | null = null;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) nextIndex = (index + 1) % buttons.length;
    if (["ArrowUp", "ArrowLeft"].includes(event.key)) nextIndex = (index - 1 + buttons.length) % buttons.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = buttons.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    buttons[nextIndex]?.focus();
    buttons[nextIndex]?.click();
  }

  private handleRootKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (this.afterActionExpanded) {
        this.setAfterActionExpanded(false);
        return;
      }
      this.inspectorExpanded = false;
      this.setWorkspaceExpanded(false);
      this.syncInspectorState();
      this.callbacks.onCancelGesture?.();
      return;
    }
    if (isEditableTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    const shortcutIndex = Number(event.key) - 1;
    if (Number.isInteger(shortcutIndex) && shortcutIndex >= 0 && shortcutIndex < CAMPAIGN_WORKSPACES.length) {
      event.preventDefault();
      this.selectWorkspace(CAMPAIGN_WORKSPACES[shortcutIndex].id, true);
    }
  }

  private selectWorkspace(workspace: CampaignWorkspaceId, focusTab: boolean): void {
    if (!CAMPAIGN_WORKSPACES.some((entry) => entry.id === workspace)) return;
    this.activeWorkspace = workspace;
    this.root.querySelectorAll<HTMLElement>("[data-campaign-workspace]").forEach((section) => {
      section.hidden = section.dataset.campaignWorkspace !== workspace;
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-campaign-workspace-tab]").forEach((button) => {
      const active = button.dataset.campaignWorkspaceTab === workspace;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
      if (active && focusTab) button.focus();
    });
    const panel = this.root.querySelector<HTMLElement>("#campaignWorkspacePanel");
    panel?.setAttribute("aria-labelledby", `campaignWorkspaceTab-${workspace}`);
    panel?.setAttribute("data-active-workspace", workspace);
    if (focusTab) {
      this.inspectorExpanded = false;
      this.syncInspectorState();
      this.setWorkspaceExpanded(true);
    }
    this.callbacks.onWorkspaceChanged?.(workspace);
  }

  private setWorkspaceExpanded(expanded: boolean): void {
    const layout = this.root.querySelector<HTMLElement>(".campaign-command-shell");
    const wasExpanded = layout?.getAttribute("data-workspace-expanded") === "true";
    if (expanded && !wasExpanded) this.captureSheetInvoker("workspace");
    layout?.setAttribute("data-workspace-expanded", expanded ? "true" : "false");
    this.callbacks.onWorkspaceExpandedChanged?.(expanded);
    if (!expanded && wasExpanded) {
      this.restoreSheetInvoker("workspace", this.root.querySelector<HTMLElement>("[data-campaign-workspace-tab][aria-selected='true']"));
    }
  }

  private syncInspectorState(): void {
    const layout = this.root.querySelector<HTMLElement>(".campaign-command-shell");
    const wasExpanded = layout?.getAttribute("data-inspector-expanded") === "true";
    if (this.inspectorExpanded && !wasExpanded) this.captureSheetInvoker("inspector");
    layout?.setAttribute("data-inspector-expanded", this.inspectorExpanded ? "true" : "false");
    this.callbacks.onInspectorExpandedChanged?.(this.inspectorExpanded);
    if (!this.inspectorExpanded && wasExpanded) {
      this.restoreSheetInvoker("inspector", this.root.querySelector<HTMLElement>("#campaignMapCanvas"));
    }
  }

  private renderResources(resources: readonly CampaignCommandResourceView[]): void {
    const container = this.root.querySelector<HTMLElement>("#campaignCommandResources");
    if (!container) return;
    container.replaceChildren(...resources.map((resource) => {
      const item = document.createElement("span");
      item.className = "campaign-command-resource";
      item.dataset.resourceKey = resource.key;
      item.append(createTextElement("small", "", resource.label), createTextElement("strong", "", resource.value));
      return item;
    }));
  }

  private setAfterActionExpanded(expanded: boolean): void {
    this.afterActionExpanded = expanded && this.afterActionReports.length > 0;
    const panel = this.root.querySelector<HTMLElement>("#campaignAfterActionPanel");
    if (panel) panel.hidden = !this.afterActionExpanded;
    if (this.afterActionExpanded) {
      this.root.querySelector<HTMLButtonElement>("#campaignAfterActionPanel [data-close-campaign-aar]")?.focus();
    } else {
      this.root.querySelector<HTMLButtonElement>("#campaignCommandReports")?.focus();
    }
    this.callbacks.onAfterActionExpandedChanged?.(this.afterActionExpanded);
  }

  private createAfterActionTextList(className: string, entries: readonly string[], empty: string): HTMLElement {
    const list = document.createElement("ul");
    list.className = className;
    const values = entries.length > 0 ? entries : [empty];
    list.replaceChildren(...values.map((entry) => createTextElement("li", "", entry)));
    return list;
  }

  private renderAfterActionReports(
    reports: readonly CampaignCommandAfterActionReportView[],
    autoPresent = true
  ): void {
    this.afterActionReports = reports;
    const archive = this.root.querySelector<HTMLElement>("#campaignAarArchive");
    const detail = this.root.querySelector<HTMLElement>("#campaignAarDetail");
    if (!archive || !detail) return;
    if (reports.length === 0) {
      archive.replaceChildren(createTextElement("p", "campaign-aar-empty", "No completed campaign battles are on file."));
      detail.replaceChildren(createTextElement("p", "campaign-aar-empty", "Complete a campaign engagement to create an after-action report."));
      this.selectedAfterActionReportId = null;
      this.setAfterActionExpanded(false);
      return;
    }

    const newestUnread = reports.find((report) => !report.acknowledged);
    const selectedStillExists = reports.some((report) => report.id === this.selectedAfterActionReportId);
    if (!selectedStillExists) this.selectedAfterActionReportId = newestUnread?.id ?? reports[0].id;
    if (autoPresent && newestUnread && !this.automaticallyPresentedReportIds.has(newestUnread.id)) {
      this.selectedAfterActionReportId = newestUnread.id;
      this.automaticallyPresentedReportIds.add(newestUnread.id);
      this.setAfterActionExpanded(true);
    }

    archive.replaceChildren(...reports.map((report) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "campaign-aar-archive__entry";
      button.dataset.aarReportId = report.id;
      button.dataset.aarResult = report.result;
      button.dataset.acknowledged = report.acknowledged ? "true" : "false";
      button.setAttribute("aria-current", report.id === this.selectedAfterActionReportId ? "true" : "false");
      button.append(
        createTextElement("span", "campaign-aar-archive__time", report.timeLabel),
        createTextElement("strong", "", report.title),
        createTextElement("small", "", `${report.resultLabel}${report.acknowledged ? "" : " · New"}`)
      );
      return button;
    }));

    const selected = reports.find((report) => report.id === this.selectedAfterActionReportId) ?? reports[0];
    const header = document.createElement("header");
    header.className = "campaign-aar-detail__header";
    header.dataset.aarResult = selected.result;
    const locationLine = createTextElement("p", "campaign-aar-detail__location", selected.timeLabel);
    if (selected.locationHexKey) {
      const focusLocation = createTextElement("button", "campaign-aar-detail__map-focus", `Focus ${selected.location}`) as HTMLButtonElement;
      focusLocation.type = "button";
      focusLocation.dataset.campaignMapHexTarget = selected.locationHexKey;
      locationLine.append(document.createTextNode(" · "), focusLocation);
    } else {
      locationLine.append(document.createTextNode(` · ${selected.location}`));
    }
    header.append(
      createTextElement("span", "campaign-aar-detail__result", selected.resultLabel),
      createTextElement("h3", "", selected.title),
      locationLine,
      createTextElement("p", "campaign-aar-detail__summary", selected.summary)
    );
    if (selected.checkpointStatus) {
      header.append(createTextElement("small", "campaign-aar-detail__checkpoint", selected.checkpointStatus));
    }

    const metrics = document.createElement("section");
    metrics.className = "campaign-aar-metrics";
    [
      ["Friendly losses", selected.personnelLosses],
      ["Confirmed enemy losses", selected.opponentLosses],
      ["Resources charged", selected.resourcesSpent],
      ["Campaign score", selected.scoreChange]
    ].forEach(([label, value]) => {
      const item = document.createElement("div");
      item.append(createTextElement("span", "", label), createTextElement("strong", "", value));
      metrics.append(item);
    });

    const operational = document.createElement("section");
    operational.className = "campaign-aar-section";
    operational.append(
      createTextElement("h4", "", "Operational consequences"),
      this.createAfterActionTextList("campaign-aar-facts", selected.operationalEffects, "No operational control change was recorded."),
      createTextElement("h4", "", "Tactical objectives"),
      this.createAfterActionTextList("campaign-aar-facts", selected.tacticalObjectives, "No tactical objective record was supplied.")
    );

    const formations = document.createElement("section");
    formations.className = "campaign-aar-section";
    formations.append(createTextElement("h4", "", "Formation condition"));
    const formationList = document.createElement("div");
    formationList.className = "campaign-aar-formations";
    if (selected.formations.length === 0) {
      formationList.append(createTextElement("p", "campaign-aar-empty", "No friendly persistent formations were committed."));
    } else {
      formationList.replaceChildren(...selected.formations.map((formation) => {
        const row = document.createElement("article");
        row.dataset.formationId = formation.id;
        row.append(
          createTextElement("strong", "", formation.name),
          createTextElement("span", "", formation.personnel),
          createTextElement("span", "", formation.condition),
          createTextElement("small", "", formation.disposition)
        );
        return row;
      }));
    }
    formations.append(formationList);

    const objectives = document.createElement("section");
    objectives.className = "campaign-aar-section";
    objectives.append(
      createTextElement("h4", "", "Campaign objective changes"),
      this.createAfterActionTextList("campaign-aar-facts", selected.objectiveChanges, "No campaign objective changed in this battle.")
    );

    const decisions = document.createElement("section");
    decisions.className = "campaign-aar-section campaign-aar-decisions";
    decisions.append(createTextElement("h4", "", "Decisions required"));
    if (selected.decisions.length === 0) {
      decisions.append(createTextElement("p", "campaign-aar-empty", "No immediate follow-up decision is required."));
    } else {
      decisions.append(...selected.decisions.map((decision) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.aarTargetKind = decision.targetKind;
        if (decision.targetId) button.dataset.aarTargetId = decision.targetId;
        button.dataset.severity = decision.severity;
        button.append(
          createTextElement("strong", "", decision.title),
          createTextElement("span", "", decision.detail),
          createTextElement("small", "", "Review")
        );
        return button;
      }));
    }

    const actions = document.createElement("footer");
    actions.className = "campaign-aar-detail__actions";
    if (!selected.acknowledged) {
      const acknowledge = createTextElement("button", "campaign-aar-acknowledge", "Acknowledge report") as HTMLButtonElement;
      acknowledge.type = "button";
      acknowledge.dataset.acknowledgeAar = selected.id;
      actions.append(acknowledge);
    } else {
      actions.append(createTextElement("span", "campaign-aar-acknowledged", "Report acknowledged"));
    }
    const continueAction = createTextElement(
      "button",
      "campaign-aar-continue",
      selected.decisions.length > 0 ? "Continue to required decision" : "Return to Situation"
    ) as HTMLButtonElement;
    continueAction.type = "button";
    continueAction.dataset.continueCampaignAar = "true";
    actions.append(continueAction);
    detail.replaceChildren(header, metrics, operational, formations, objectives, decisions, actions);
  }

  private renderSituation(view: CampaignCommandShellView): void {
    const situation = view.situation ?? {
      brief: {
        label: view.priorities?.[0]?.label ?? "Commander's brief",
        title: view.priorities?.[0]?.title ?? `${view.campaignPhase} operations continue`,
        detail: view.priorities?.[0]?.detail ?? "No immediate decision is blocking campaign planning.",
        tone: view.priorities?.[0]?.severity === "critical" || view.priorities?.[0]?.severity === "decisionRequired"
          ? "critical" as const
          : "steady" as const
      },
      outlook: {
        phaseDescription: `${view.campaignPhase} is active.`,
        timePressure: "No published deadline pressure.",
        projectedGrade: view.objectiveScore?.projectedGrade ?? "Not yet scored",
        score: view.objectiveScore ? `${view.objectiveScore.earned} / ${view.objectiveScore.available}` : "Not yet scored",
        objectiveStatus: `${view.objectives.filter((objective) => objective.status === "In progress").length} active`,
        lossConditions: []
      },
      alerts: view.advance.alerts,
      intelligenceUnread: Math.max(0, view.unreadReports - (view.afterActionReports ?? []).filter((report) => !report.acknowledged).length),
      afterActionUnread: (view.afterActionReports ?? []).filter((report) => !report.acknowledged).length,
      recentChanges: view.advance.timeline.slice(0, 5)
    };
    this.renderSituationBrief(situation);
    this.renderPriorities(view.priorities ?? []);
    this.renderObjectives(view.objectives, view.objectiveScore);
    this.renderSituationOutlook(situation);
    this.renderSituationFronts(view.fronts ?? []);
    this.renderSituationAlerts(situation);
    this.renderSituationRecent(situation.recentChanges);
  }

  private renderSituationBrief(situation: CampaignCommandSituationView): void {
    const container = this.root.querySelector<HTMLElement>("#campaignSituationBrief");
    if (!container) return;
    container.dataset.tone = situation.brief.tone;
    container.replaceChildren(
      createTextElement("span", "campaign-situation-brief__label", situation.brief.label),
      createTextElement("h3", "", situation.brief.title),
      createTextElement("p", "", situation.brief.detail)
    );
  }

  private renderPriorities(priorities: readonly CampaignCommandPriorityView[]): void {
    const container = this.root.querySelector<HTMLElement>("#campaignSituationPriority");
    if (!container) return;
    const priority = priorities[0];
    if (!priority) {
      container.hidden = true;
      container.replaceChildren();
      return;
    }
    container.hidden = false;
    const priorityRegion = document.createElement("section");
    priorityRegion.className = "campaign-command-priorities";
    priorityRegion.setAttribute("aria-label", "Command priorities");
    const card = document.createElement("article");
    card.className = "campaign-command-priority";
    card.dataset.priorityId = priority.id;
    card.dataset.alertSeverity = priority.severity;
    const heading = document.createElement("div");
    heading.append(
      createTextElement("span", "campaign-command-priority__label", priority.label),
      createTextElement("strong", "", priority.title)
    );
    const action = this.createAlertLink(priority.targetKind, priority.targetId, priority.actionLabel);
    card.append(heading, createTextElement("p", "", priority.detail), action);
    priorityRegion.append(card);
    container.replaceChildren(priorityRegion);
  }

  private renderObjectives(
    objectives: readonly CampaignCommandObjectiveView[],
    score?: CampaignCommandObjectiveScoreView
  ): void {
    const container = this.root.querySelector<HTMLElement>("#campaignSituationObjectives");
    if (!container) return;
    const activeCount = objectives.filter((objective) => objective.status === "In progress").length;
    this.setText("#campaignSituationObjectiveCount", `${activeCount} active`);
    const scoreCard = document.createElement("article");
    scoreCard.className = "campaign-objective-score";
    if (score) {
      scoreCard.append(
        createTextElement("span", "", "Campaign score"),
        createTextElement("strong", "", `${score.earned} / ${score.available} · ${score.percent}%`),
        createTextElement("small", "", `Projected ${score.projectedGrade}`)
      );
    }
    const rows = objectives.map((objective) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "campaign-workspace-list-row campaign-objective-row";
      row.dataset.objectiveKey = objective.key;
      row.dataset.objectiveStatus = objective.status.toLowerCase();
      row.dataset.objectiveCategory = objective.category ?? "primary";
      const header = document.createElement("div");
      header.className = "campaign-objective-row__header";
      header.append(
        createTextElement("strong", "", objective.label),
        createTextElement("span", "campaign-objective-row__status", objective.status)
      );
      row.append(header);
      if (objective.detail) row.append(createTextElement("p", "campaign-objective-row__detail", objective.detail));
      if (objective.dependencies) row.append(createTextElement("p", "campaign-objective-row__dependency", objective.dependencies));
      if (objective.failureEffect) row.append(createTextElement("p", "campaign-objective-row__failure", objective.failureEffect));
      if (objective.progress !== undefined) {
        const progress = document.createElement("div");
        progress.className = "campaign-objective-row__progress";
        progress.setAttribute("role", "progressbar");
        progress.setAttribute("aria-label", `${objective.label} progress`);
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", "100");
        progress.setAttribute("aria-valuenow", String(Math.round(objective.progress * 100)));
        const fill = document.createElement("i");
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, objective.progress)) * 100)}%`;
        progress.append(fill);
        row.append(progress);
      }
      const meta = [objective.category, objective.deadline, objective.score].filter((value): value is string => Boolean(value));
      if (meta.length > 0) row.append(createTextElement("small", "campaign-objective-row__meta", meta.join(" · ")));
      row.addEventListener("click", () => this.requestSelection({ kind: "objective", id: objective.key }, true));
      return row;
    });
    const content: HTMLElement[] = [];
    if (score) content.push(scoreCard);
    if (rows.length > 0) content.push(...rows);
    else content.push(createTextElement("p", "campaign-workspace-empty", "No active objectives are published for this phase."));
    container.replaceChildren(...content);
  }

  private renderSituationOutlook(situation: CampaignCommandSituationView): void {
    const container = this.root.querySelector<HTMLElement>("#campaignSituationOutlookBody");
    if (!container) return;
    const metrics = document.createElement("dl");
    metrics.className = "campaign-situation-outlook__metrics";
    [
      ["Projected result", situation.outlook.projectedGrade],
      ["Campaign score", situation.outlook.score],
      ["Objective state", situation.outlook.objectiveStatus],
      ["Time pressure", situation.outlook.timePressure]
    ].forEach(([label, value]) => {
      metrics.append(createTextElement("dt", "", label), createTextElement("dd", "", value));
    });
    const phase = createTextElement("p", "campaign-situation-outlook__phase", situation.outlook.phaseDescription);
    const lossHeading = createTextElement("h4", "", "Loss conditions");
    const losses = document.createElement("ul");
    losses.className = "campaign-situation-losses";
    const conditions = situation.outlook.lossConditions.length > 0
      ? situation.outlook.lossConditions
      : ["No explicit terminal loss condition is published for this operation."];
    losses.replaceChildren(...conditions.map((condition) => createTextElement("li", "", condition)));
    container.replaceChildren(phase, metrics, lossHeading, losses);
  }

  private renderSituationFronts(fronts: readonly CampaignCommandFrontView[]): void {
    const container = this.root.querySelector<HTMLElement>("#campaignSituationFronts");
    if (!container) return;
    this.setText("#campaignSituationFrontCount", `${fronts.length} sector${fronts.length === 1 ? "" : "s"}`);
    if (fronts.length === 0) {
      container.replaceChildren(createTextElement("p", "campaign-workspace-empty", "No operational fronts are published in the current projection."));
      return;
    }
    container.replaceChildren(...fronts.map((front) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "campaign-situation-front";
      card.dataset.frontKey = front.key;
      const heading = document.createElement("div");
      heading.append(createTextElement("strong", "", front.label), createTextElement("span", "", front.initiativeLabel));
      card.append(
        heading,
        createTextElement("p", "", front.pressureLabel ?? "No assessed pressure summary is available."),
        createTextElement("small", "", [front.forcePosture, front.objectivePosture].filter(Boolean).join(" · ") || `${front.hexKeys.length} mapped hexes`),
        createTextElement("em", "", front.lastChange ?? "No recent material sector change recorded.")
      );
      card.addEventListener("click", () => this.requestSelection({ kind: "front", id: front.key }, true));
      return card;
    }));
  }

  private renderSituationAlerts(situation: CampaignCommandSituationView): void {
    const container = this.root.querySelector<HTMLElement>("#campaignSituationAlerts");
    const sources = this.root.querySelector<HTMLElement>("#campaignSituationReportSources");
    if (!container || !sources) return;
    const unacknowledged = situation.alerts.filter((alert) => !alert.acknowledged).length
      + situation.intelligenceUnread + situation.afterActionUnread;
    this.setText("#campaignSituationUnreadCount", `${unacknowledged} unread`);
    if (situation.alerts.length === 0) {
      container.replaceChildren(createTextElement("p", "campaign-workspace-empty", "No command alerts are waiting for review."));
    } else {
      container.replaceChildren(...situation.alerts.map((alert) => {
        const card = document.createElement("article");
        card.className = "campaign-situation-alert";
        card.dataset.alertId = alert.id;
        card.dataset.alertSeverity = alert.severity;
        card.dataset.acknowledged = alert.acknowledged ? "true" : "false";
        const heading = document.createElement("div");
        heading.append(
          createTextElement("span", "", alert.timeLabel ?? "Current command cycle"),
          createTextElement("strong", "", alert.title)
        );
        const actions = document.createElement("div");
        actions.className = "campaign-situation-alert__actions";
        if (alert.targetKind !== "time") actions.append(this.createAlertLink(alert.targetKind, alert.targetId));
        if (!alert.acknowledged) {
          const acknowledge = createTextElement("button", "campaign-situation-alert__acknowledge", "Acknowledge") as HTMLButtonElement;
          acknowledge.type = "button";
          acknowledge.addEventListener("click", () => this.callbacks.onAcknowledgeAlert?.(alert.id));
          actions.append(acknowledge);
        } else {
          actions.append(createTextElement(
            "span",
            "campaign-situation-alert__reviewed",
            alert.requiresStop ? "Acknowledged · resolution still required" : "Acknowledged"
          ));
        }
        card.append(heading, createTextElement("p", "", alert.detail), actions);
        return card;
      }));
    }

    const intelligence = document.createElement("button");
    intelligence.type = "button";
    intelligence.className = "campaign-situation-report-source";
    intelligence.append(
      createTextElement("span", "", "Intelligence reports"),
      createTextElement("strong", "", `${situation.intelligenceUnread} unread`),
      createTextElement("small", "", "Open the assessed operational picture")
    );
    intelligence.addEventListener("click", () => {
      this.selectWorkspace("intelligence", true);
      this.callbacks.onOpenIntelligence?.();
    });
    const battle = document.createElement("button");
    battle.type = "button";
    battle.className = "campaign-situation-report-source";
    battle.disabled = this.afterActionReports.length === 0;
    battle.append(
      createTextElement("span", "", "Battle reports"),
      createTextElement("strong", "", `${situation.afterActionUnread} unread`),
      createTextElement("small", "", this.afterActionReports.length > 0 ? `${this.afterActionReports.length} after-action reports archived` : "No battles resolved yet")
    );
    battle.addEventListener("click", () => this.setAfterActionExpanded(true));
    sources.replaceChildren(intelligence, battle);
  }

  private renderSituationRecent(entries: readonly CampaignCommandTimelineView[]): void {
    const container = this.root.querySelector<HTMLElement>("#campaignSituationRecent");
    if (!container) return;
    if (entries.length === 0) {
      container.replaceChildren(createTextElement("p", "campaign-workspace-empty", "Advance campaign time to establish the first resolution record."));
      return;
    }
    container.replaceChildren(...entries.map((entry) => {
      const row = document.createElement("article");
      row.className = "campaign-situation-change";
      row.dataset.alertSeverity = entry.severity;
      const heading = document.createElement("div");
      heading.append(createTextElement("span", "", entry.timeLabel), createTextElement("strong", "", entry.title));
      const summary = entry.eventCount && entry.eventCount > 1
        ? `${entry.detail} · ${entry.eventCount} material updates in this checkpoint.`
        : entry.detail;
      row.append(heading, createTextElement("p", "", summary));
      if (entry.stopLabel) row.append(createTextElement("small", "", `Stopped · ${entry.stopLabel}`));
      if (entry.targetKind !== "time") row.append(this.createAlertLink(entry.targetKind, entry.targetId));
      return row;
    }));
  }

  private renderOutcome(outcome: CampaignCommandOutcomeView | null): void {
    const panel = this.root.querySelector<HTMLElement>("#campaignOutcomePanel");
    if (!panel) return;
    if (!outcome) {
      panel.hidden = true;
      return;
    }
    this.setText("#campaignOutcomeEyebrow", outcome.grade);
    this.setText("#campaignOutcomeTitle", outcome.title);
    this.setText("#campaignOutcomeSummary", outcome.summary);
    this.setText("#campaignOutcomeScore", outcome.score);
    this.setText("#campaignOutcomeCompleted", String(outcome.completed));
    this.setText("#campaignOutcomeFailed", String(outcome.failed));
    this.setText("#campaignOutcomePreserved", outcome.formationsPreserved ?? "Not recorded");
    this.setText("#campaignOutcomeCheckpoint", outcome.checkpointStatus ?? `Campaign record is ${this.currentView?.saveStatus.toLowerCase() ?? "available"}.`);
    const serviceRecord = this.root.querySelector<HTMLElement>("#campaignOutcomeServiceRecord");
    if (serviceRecord) {
      const entries = outcome.serviceRecord?.length ? outcome.serviceRecord : ["No formation distinction was recorded."];
      serviceRecord.replaceChildren(...entries.map((entry) => createTextElement("li", "", entry)));
    }
    const continueButton = this.root.querySelector<HTMLButtonElement>("#campaignOutcomeContinue");
    if (continueButton) continueButton.hidden = outcome.canContinue !== true;
    panel.dataset.outcome = outcome.result;
    panel.dataset.outcomeKey = outcome.key;
    panel.hidden = this.dismissedOutcomeKey === outcome.key;
  }

  private renderForces(forces: readonly CampaignCommandForceView[]): void {
    const container = this.root.querySelector<HTMLElement>("#campaignForcesWorkspaceList");
    if (!container) return;
    if (forces.length === 0) {
      container.replaceChildren(createTextElement("p", "campaign-workspace-empty", "No player formations are visible in the current projection."));
      return;
    }
    container.replaceChildren(...forces.map((force) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "campaign-workspace-list-row";
      row.dataset.forceHex = force.hexKey;
      row.append(
        createTextElement("strong", "", force.label),
        createTextElement("span", "", `${force.count.toLocaleString()} · ${force.hexKey}`)
      );
      row.addEventListener("click", () => this.requestSelection({ kind: "hex", id: force.hexKey }, true));
      return row;
    }));
  }

  private renderOrders(
    orders: readonly CampaignCommandOrderView[],
    commitView?: CampaignCommandOrderCommitView
  ): void {
    const container = this.root.querySelector<HTMLElement>("#campaignOrderTrayList");
    const drafts = orders.filter((order) => order.status === "draft" || order.status === "conflict");
    const activeOrders = orders.filter((order) => order.status !== "completed" && order.status !== "cancelled");
    const historyCount = orders.length - activeOrders.length;
    const draftCount = this.root.querySelector<HTMLElement>("#campaignDraftOrderCount");
    const committed = this.root.querySelector<HTMLElement>("#campaignCommittedOrderCount");
    const history = this.root.querySelector<HTMLElement>("#campaignOrderHistoryCount");
    const commit = this.root.querySelector<HTMLButtonElement>("#campaignCommitOrders");
    const feedback = this.root.querySelector<HTMLElement>("#campaignOrderCommitFeedback");
    const invalidDraft = drafts.find((order) => order.validationMessages.length > 0);
    const resolvedCommit = commitView ?? {
      busy: false,
      draftCount: drafts.length,
      validDraftCount: drafts.length - (invalidDraft ? 1 : 0),
      blockerCount: invalidDraft?.validationMessages.length ?? 0,
      firstBlocker: invalidDraft?.validationMessages[0] ?? null,
      firstCorrectiveAction: null,
      feedback: null,
      feedbackTone: null
    };
    if (draftCount) draftCount.textContent = String(resolvedCommit.draftCount);
    if (committed) committed.textContent = String(activeOrders.filter((order) => ["committed", "executing", "blocked"].includes(order.status)).length);
    if (history) history.textContent = String(historyCount);
    if (feedback) {
      const blockerSummary = resolvedCommit.blockerCount > 0
        ? `${resolvedCommit.blockerCount} blocker${resolvedCommit.blockerCount === 1 ? "" : "s"}: ${resolvedCommit.firstBlocker ?? "Review conflicted drafts."}${resolvedCommit.firstCorrectiveAction ? ` ${resolvedCommit.firstCorrectiveAction}` : ""}`
        : resolvedCommit.draftCount > 0
          ? `${resolvedCommit.validDraftCount}/${resolvedCommit.draftCount} drafts ready for one atomic commit.`
          : historyCount > 0
            ? `${historyCount} completed or cancelled order${historyCount === 1 ? "" : "s"} filed in command history.`
            : "Drafts hold resources without spending them.";
      feedback.textContent = resolvedCommit.busy ? "Committing orders as one command transaction…" : resolvedCommit.feedback ?? blockerSummary;
      feedback.dataset.tone = resolvedCommit.feedbackTone ?? (resolvedCommit.blockerCount > 0 ? "warning" : "info");
      feedback.setAttribute("aria-busy", resolvedCommit.busy ? "true" : "false");
    }
    if (commit) {
      commit.disabled = resolvedCommit.busy || resolvedCommit.draftCount === 0 || resolvedCommit.blockerCount > 0;
      commit.setAttribute("aria-describedby", "campaignOrderCommitFeedback");
      commit.textContent = resolvedCommit.busy ? "Committing…" : `Commit ${resolvedCommit.draftCount || ""} order${resolvedCommit.draftCount === 1 ? "" : "s"}`.replace(/\s+/g, " ");
      commit.title = resolvedCommit.draftCount === 0
        ? "Add a draft order before committing."
        : resolvedCommit.blockerCount > 0
          ? `${resolvedCommit.firstBlocker ?? "Resolve order conflicts before committing."}${resolvedCommit.firstCorrectiveAction ? ` ${resolvedCommit.firstCorrectiveAction}` : ""}`
          : `Commit ${resolvedCommit.draftCount} draft order${resolvedCommit.draftCount === 1 ? "" : "s"} atomically.`;
    }
    if (!container) return;
    if (activeOrders.length === 0) {
      const message = historyCount > 0
        ? `${historyCount} completed or cancelled order${historyCount === 1 ? " is" : "s are"} filed in the resolution timeline.`
        : "No active orders. Assess the map, then add a draft from a planner.";
      container.replaceChildren(createTextElement("p", "campaign-order-tray__empty", message));
      return;
    }
    container.replaceChildren(...activeOrders.map((order, orderIndex) => {
      const card = document.createElement("article");
      card.className = "campaign-order-card";
      card.dataset.orderId = order.id;
      card.dataset.orderStatus = order.status;
      const header = document.createElement("div");
      header.className = "campaign-order-card__header";
      const orderLabel = createTextElement("strong", "", order.label);
      orderLabel.id = `campaignOrderLabel${orderIndex}`;
      header.append(orderLabel, createTextElement("span", "", order.status));
      const inspect = document.createElement("button");
      inspect.type = "button";
      inspect.className = "campaign-order-card__inspect";
      inspect.textContent = "Inspect";
      inspect.setAttribute("aria-label", "Inspect order details");
      inspect.setAttribute("aria-describedby", orderLabel.id);
      inspect.addEventListener("click", () => this.requestSelection({ kind: "order", id: order.id }, true));
      header.append(inspect);
      card.append(header, createTextElement("p", "campaign-order-card__intent", order.detail));
      const facts = document.createElement("dl");
      facts.className = "campaign-order-card__facts";
      const appendFact = (label: string, value: string | undefined): void => {
        if (!value) return;
        const row = document.createElement("div");
        row.append(createTextElement("dt", "", label), createTextElement("dd", "", value));
        facts.appendChild(row);
      };
      appendFact("Route / area", order.routeSummary);
      appendFact("Cost", order.costSummary);
      appendFact("Timing", order.timingSummary ?? order.eta ?? undefined);
      appendFact("Next", order.nextTransition);
      appendFact("Risk", order.riskSummary);
      appendFact("Objective effect", order.objectiveEffect);
      appendFact("Dependencies", order.dependencySummary);
      appendFact("Cancellation", order.cancellationSummary);
      if (order.reservationSummaries?.length) appendFact("Reservations", order.reservationSummaries.join(" · "));
      if (facts.childElementCount > 0) card.appendChild(facts);
      const issues = order.validationIssues ?? order.validationMessages.map((message) => ({ code: "ORDER_BLOCKED", message, correctiveAction: "Review and correct this draft." }));
      issues.forEach((issue) => {
        const block = document.createElement("div");
        block.className = "campaign-order-card__validation";
        block.dataset.reasonCode = issue.code;
        block.append(createTextElement("strong", "", issue.code.replace(/^ORDER_/, "").replace(/_/g, " ")), createTextElement("span", "", issue.message), createTextElement("small", "", issue.correctiveAction));
        card.appendChild(block);
      });
      if (order.canRemove || order.canCancel || order.canEdit || order.canMoveEarlier || order.canMoveLater) {
        const actions = document.createElement("div");
        actions.className = "campaign-order-card__actions";
        const addAction = (label: string, ariaLabel: string, callback: () => void): void => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.setAttribute("aria-label", ariaLabel);
          button.setAttribute("aria-describedby", orderLabel.id);
          button.addEventListener("click", callback);
          actions.appendChild(button);
        };
        if (order.canMoveEarlier) addAction("Earlier", "Move order earlier", () => this.callbacks.onMoveOrder?.(order.id, "earlier"));
        if (order.canMoveLater) addAction("Later", "Move order later", () => this.callbacks.onMoveOrder?.(order.id, "later"));
        if (order.canEdit) addAction("Edit", "Edit order", () => this.callbacks.onEditOrder?.(order.id));
        if (order.canRemove) addAction("Remove", "Remove draft order", () => this.callbacks.onRemoveOrder?.(order.id));
        if (order.canCancel) addAction("Cancel", "Review order cancellation", () => this.callbacks.onCancelOrder?.(order.id));
        card.appendChild(actions);
      }
      return card;
    }));
  }

  private syncAdvanceButtonLabel(mode: CampaignCommandAdvanceMode): void {
    const labels: Readonly<Record<CampaignCommandAdvanceMode, string>> = {
      segment: "3 hours",
      nextReport: "Next report",
      dawn: "To dawn",
      dusk: "To dusk",
      day: "One day"
    };
    const label = this.root.querySelector<HTMLElement>("#campaignAdvanceSegment .btn-label");
    if (label) label.textContent = labels[mode];
  }

  private setTimelineExpanded(force?: boolean): void {
    const panel = this.root.querySelector<HTMLElement>("#campaignAdvanceTimeline");
    const toggle = this.root.querySelector<HTMLButtonElement>("#campaignTimelineToggle");
    if (!panel || !toggle) return;
    const expanded = force ?? panel.hidden;
    const wasExpanded = !panel.hidden;
    if (expanded && !wasExpanded) this.captureSheetInvoker("timeline");
    panel.hidden = !expanded;
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    this.callbacks.onTimelineExpandedChanged?.(expanded);
    if (!expanded && wasExpanded) this.restoreSheetInvoker("timeline", toggle);
  }

  private renderAdvance(advance: CampaignCommandAdvanceView): void {
    const select = this.root.querySelector<HTMLSelectElement>("#campaignAdvanceMode");
    const pause = this.root.querySelector<HTMLInputElement>("#campaignPauseAfterResolution");
    const button = this.root.querySelector<HTMLButtonElement>("#campaignAdvanceSegment");
    if (select) {
      select.value = advance.mode;
      select.disabled = !advance.enabled;
    }
    if (pause) {
      pause.checked = advance.pauseAfterEveryResolution;
      pause.disabled = !advance.enabled;
    }
    if (button) button.disabled = !advance.enabled;
    this.syncAdvanceButtonLabel(advance.mode);
    this.setText("#campaignAdvanceSummary", advance.summary);
    this.setText("#campaignTimelineCount", String(advance.timeline.length));

    const alertContainer = this.root.querySelector<HTMLElement>("#campaignAdvanceAlerts");
    if (alertContainer) {
      alertContainer.replaceChildren(...advance.alerts.map((alert) => {
        const card = document.createElement("article");
        card.className = "campaign-advance-alert";
        card.dataset.alertSeverity = alert.severity;
        card.append(createTextElement("strong", "", alert.title), createTextElement("p", "", alert.detail));
        if (alert.targetKind !== "time") card.appendChild(this.createAlertLink(alert.targetKind, alert.targetId));
        return card;
      }));
    }

    const timeline = this.root.querySelector<HTMLElement>("#campaignAdvanceTimelineList");
    if (!timeline) return;
    if (advance.timeline.length === 0) {
      timeline.replaceChildren(createTextElement("p", "campaign-advance-timeline__empty", "Advance campaign time to create the first resolution checkpoint."));
      return;
    }
    timeline.replaceChildren(...advance.timeline.map((entry) => {
      const row = document.createElement("article");
      row.className = "campaign-advance-timeline__entry";
      row.dataset.alertSeverity = entry.severity;
      const heading = document.createElement("div");
      heading.append(createTextElement("span", "", entry.timeLabel), createTextElement("strong", "", entry.title));
      row.append(heading, createTextElement("p", "", entry.detail));
      if (entry.stopLabel) row.appendChild(createTextElement("small", "", `Stopped · ${entry.stopLabel}`));
      if (entry.targetKind !== "time") row.appendChild(this.createAlertLink(entry.targetKind, entry.targetId));
      return row;
    }));
  }

  private createAlertLink(targetKind: CampaignCommandAlertTarget, targetId: string | null, label = "Review"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "campaign-advance-alert__link";
    button.textContent = label;
    button.addEventListener("click", () => {
      const workspace: CampaignWorkspaceId = targetKind === "intelligence"
        ? "intelligence"
        : targetKind === "formation"
          ? "forces"
          : "situation";
      this.selectWorkspace(workspace, true);
      if (targetKind === "intelligence") this.callbacks.onOpenIntelligence?.();
      if (targetKind === "order" && targetId) {
        const order = Array.from(this.root.querySelectorAll<HTMLElement>("[data-order-id]"))
          .find((entry) => entry.dataset.orderId === targetId);
        order?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      this.callbacks.onAlertSelected?.(targetKind, targetId);
    });
    return button;
  }

  private requestSelection(selection: Exclude<CampaignCommandSelection, null>, revealInspector: boolean): void {
    this.setSelection(selection);
    this.callbacks.onSelectionRequested?.(selection);
    if (revealInspector) this.revealInspector();
  }

  private renderInspectorRoute(): void {
    const inspector = this.root.querySelector<HTMLElement>("#campaignContextInspector");
    if (!inspector) return;
    renderCampaignContextInspector(inspector, this.currentView, this.activeSelection);
  }

  private captureSheetInvoker(sheet: "workspace" | "inspector" | "timeline"): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.root.contains(active)) this.sheetInvokers.set(sheet, active);
  }

  private restoreSheetInvoker(
    sheet: "workspace" | "inspector" | "timeline",
    fallback: HTMLElement | null
  ): void {
    const storedInvoker = this.sheetInvokers.get(sheet);
    const invoker = storedInvoker && !storedInvoker.closest("[inert], [hidden]")
      ? storedInvoker
      : fallback;
    this.sheetInvokers.delete(sheet);
    if (!invoker || !this.root.contains(invoker)) return;
    if (invoker.tabIndex < 0 && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(invoker.tagName)) invoker.tabIndex = -1;
    invoker.focus({ preventScroll: true });
  }

  private setText(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }
}
