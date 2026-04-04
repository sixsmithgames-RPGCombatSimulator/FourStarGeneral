import type {
  IPopupManager,
  PopupKey,
  RosterSnapshot,
  RosterSnapshotEntry,
  SidebarController
} from "../../contracts/IPopupManager";
import { getPopupContent } from "../../data/popupContent";
import { ensureBattleState, type BattleUpdateReason } from "../../state/BattleState";
import type { BattleRosterSnapshot, RosterUnitSummary } from "../../game/GameEngine";
import type {
  SupplyAlert,
  SupplyCategorySnapshot,
  SupplyResourceKey,
  SupplySnapshot,
  TurnFaction,
  LogisticsSnapshot,
  LogisticsSupplySource,
  LogisticsStockpileEntry,
  LogisticsConvoyStatusEntry,
  LogisticsPriorityEntry,
  LogisticsDelayNode,
  LogisticsMaintenanceEntry,
  LogisticsAlertEntry,
  CommanderBenefits,
  SupplyPriority,
  SerializedAirMission
} from "../../game/GameEngine";
import {
  getReconIntelSnapshot as buildFallbackReconIntelSnapshot,
  type ReconIntelSnapshot,
  type ReconIntelAlert,
  type ReconIntelBrief,
  type ReconIntelCounterIntelOperation,
  type ReconIntelSectorReport,
  type ReconIntelConfidence,
  type ReconIntelTimeframe,
  type ReconIntelVerificationStatus
} from "../../data/reconIntelSnapshot";
import { getAllGenerals, type GeneralRosterEntry } from "../../utils/rosterStorage";
import type { WarRoomOverlay } from "./WarRoomOverlay";
import type { GameEngineAPI } from "../../game/GameEngine";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { combat as combatBalance, supply as supplyBalance } from "../../core/balance";
import { axialKey } from "../../core/Hex";
import type { AirMissionTemplate, AirMissionKind, ScenarioUnit } from "../../core/types";
import unitTypesSource from "../../data/unitTypes.json";
import { getSpriteForScenarioType } from "../../data/unitSpriteCatalog";

/**
 * Content structure for popup dialogs.
 */
interface PopupContent {
  title: string;
  body: string;
}

type AirPlannerFeedbackTone = "neutral" | "warning" | "success";

interface AirSupportPlannerState {
  missionKind: AirMissionKind | "";
  squadronValue: string;
  targetValue: string;
  feedback: string;
  feedbackTone: AirPlannerFeedbackTone;
  suspendedForMapPick: boolean;
}

interface AirMissionTabView {
  readonly template: AirMissionTemplate;
  readonly disabled: boolean;
  readonly disabledReason?: string;
}

interface AirSquadronCardView {
  readonly value: string;
  readonly squadronId: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly locationLabel: string;
  readonly roleLabel: string;
  readonly strength: number;
  readonly statusLabel: string;
  readonly statusClass: string;
  readonly isReserve: boolean;
  readonly disabled: boolean;
  readonly spriteUrl?: string;
  readonly refitTurns: number | null;
  readonly combatRadiusHex: number | null;
}

interface AirEscortTargetView {
  readonly value: string;
  readonly label: string;
  readonly detail: string;
  readonly meta: string;
}

interface AirPlannerViewModel {
  readonly missionTabs: readonly AirMissionTabView[];
  readonly selectedMission: AirMissionTemplate | null;
  readonly squadronCards: readonly AirSquadronCardView[];
  readonly selectedSquadron: AirSquadronCardView | null;
  readonly escortTargets: readonly AirEscortTargetView[];
}

/**
 * Manages popup dialogs and overlays throughout the application.
 * Handles opening, closing, focus management, and content rendering.
 */
export class PopupManager implements IPopupManager {
  private activePopup: PopupKey | null = null;
  private lastTriggerButton: HTMLButtonElement | null = null;
  private readonly warRoomOverlay: WarRoomOverlay | null;
  private readonly battleState = ensureBattleState();
  private readonly unsubscribeBattleUpdates: () => void;

  // DOM element references
  private readonly popupLayer: HTMLElement;
  private readonly popupDialog: HTMLElement;
  private readonly popupTitle: HTMLElement;
  private readonly popupBody: HTMLElement;
  private readonly closeButton: HTMLElement;
  private sidebarController: SidebarController | null = null;
  private readonly reconIntelEventListener: (event: Event) => void;
  /** Tracks which faction's supply ledger is currently displayed inside the Supplies panel. */
  private activeSupplyFaction: TurnFaction = "Player";
  /** Air Support: captures which field should be filled by the next map click. */
  private airPickMode: "target" | "escort" | null = null;
  private readonly airPlannerState: AirSupportPlannerState = {
    missionKind: "",
    squadronValue: "",
    targetValue: "",
    feedback: "",
    feedbackTone: "neutral",
    suspendedForMapPick: false
  };
  private intelPickMode: "deception" | null = null;
  private readonly airPickListener: (event: Event) => void;

  /** Cached recon/intel payload hydrated when the commander opens either panel. */
  private reconIntelSnapshot: ReconIntelSnapshot | null = null;
  /** Active timeframe filter controlling which intel briefs render. */
  private reconIntelTimeframe: ReconIntelTimeframe | "all" = "all";
  /** Active confidence filter controlling how uncertain intel is presented. */
  private reconIntelConfidence: ReconIntelConfidence | "all" = "all";
  private intelFeedbackMessage = "";

  constructor(warRoomOverlay: WarRoomOverlay | null = null) {
    this.warRoomOverlay = warRoomOverlay;
    const layer = document.getElementById("battlePopupLayer");
    if (!layer) {
      throw new Error("PopupManager: Required '#battlePopupLayer' element not found.");
    }
    this.popupLayer = layer;
    const dialog = layer.querySelector<HTMLElement>('.battle-popup');
    if (!dialog) {
      throw new Error("PopupManager: Required '.battle-popup' element not found inside #battlePopupLayer.");
    }
    this.popupDialog = dialog;
    const title = this.popupDialog.querySelector<HTMLElement>("[data-popup-title]");
    if (!title) {
      throw new Error("PopupManager: Required '[data-popup-title]' element not found inside battle popup.");
    }
    this.popupTitle = title;
    this.popupBody = this.requireElement("[data-popup-body]");
    this.closeButton = this.requireElement("#battlePopupClose");

    // Route live recon/intel refresh events into the active popup so planners see updated intelligence without reopening the panel.
    this.reconIntelEventListener = (event: Event) => {
      this.onReconIntelUpdate(event as CustomEvent<ReconIntelSnapshot>);
    };
    document.addEventListener("battle:reconIntelUpdated", this.reconIntelEventListener as EventListener);
    this.airPickListener = (event: Event) => {
      this.onBattleHexClicked(event as CustomEvent<{ offsetKey: string }>);
    };
    document.addEventListener("battle:hexClicked", this.airPickListener as EventListener);

    this.bindGlobalEvents();

    if (this.warRoomOverlay) {
      this.warRoomOverlay.registerCloseListener(() => this.handleWarRoomOverlayClosed());
    }

    // Keep open panels in sync with engine/battle updates.
    this.unsubscribeBattleUpdates = this.battleState.subscribeToBattleUpdates((reason: BattleUpdateReason) => {
      if (this.activePopup === "supplies" && this.shouldRefreshSuppliesPanel(reason)) {
        this.renderSuppliesPanel();
      }
      if (this.activePopup === "logistics" && this.shouldRefreshLogisticsPanel(reason)) {
        this.renderLogisticsPanel();
      }
      if (this.activePopup === "armyRoster" && this.shouldRefreshRosterPanel(reason)) {
        this.renderArmyRoster();
      }
      if (this.activePopup === "recon") {
        this.renderReconPanel();
      }
      if (this.activePopup === "intelligence") {
        this.renderIntelPanel();
      }
      if (this.activePopup === "airSupport") {
        this.renderAirSupportPanel();
      }
    });
    window.addEventListener("beforeunload", () => this.unsubscribeBattleUpdates());
  }

  /**
   * Binds the Supplies faction toggle so commanders can switch between Player and Enemy ledgers on demand.
   */
  private bindSupplyFactionControls(container: HTMLElement): void {
    if (container.getAttribute("data-controls-initialized") === "true") {
      return;
    }

    container.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-supplies-faction]");
      if (!button) {
        return;
      }

      const faction = (button.dataset.suppliesFaction ?? "Player") as TurnFaction;
      if (this.activeSupplyFaction === faction) {
        return;
      }

      this.activeSupplyFaction = faction;
      // Re-render so the panel reflects the newly selected ledger.
      this.renderSuppliesPanel();
    }, { passive: true });

    container.setAttribute("data-controls-initialized", "true");
  }

  /**
   * Wires logistics priority buttons so the commander can steer automated convoy service without manual truck orders.
   */
  private bindLogisticsPriorityControls(container: HTMLElement): void {
    if (container.getAttribute("data-logistics-controls-initialized") === "true") {
      return;
    }

    container.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-logistics-priority-button]");
      if (!button) {
        return;
      }

      const unitId = button.dataset.logisticsPriorityUnitId ?? "";
      const priority = (button.dataset.logisticsPriority ?? "normal") as SupplyPriority;
      if (!unitId) {
        return;
      }

      try {
        const engine = this.battleState.ensureGameEngine();
        if (engine.setSupplyPriority(unitId, priority)) {
          this.renderLogisticsPanel();
        }
      } catch (error) {
        console.warn("PopupManager: Failed to update logistics priority.", error);
      }
    }, { passive: true });

    container.setAttribute("data-logistics-controls-initialized", "true");
  }

  /**
   * Updates faction toggle button styling and accessibility state to mirror the currently selected ledger.
   */
  private syncSupplyFactionControls(container: HTMLElement, availability: Record<TurnFaction, boolean>): void {
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-supplies-faction]"));
    buttons.forEach((button) => {
      const faction = (button.dataset.suppliesFaction ?? "Player") as TurnFaction;
      const isActive = faction === this.activeSupplyFaction;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");

      const hasData = availability[faction];
      button.disabled = !hasData;
      button.title = hasData
        ? (faction === "Player" ? "View our current supply ledger" : "View enemy supply estimates")
        : "Recon reports are required before this ledger is available.";
    });
  }

  /**
   * Wires global-level listeners so popup layers respond to keyboard shortcuts and background interactions.
   * This keeps accessibility affordances centralized rather than scattering event bindings throughout the constructor.
   */
  private bindGlobalEvents(): void {
    // Close button click returns control to the triggering sidebar button.
    this.closeButton.addEventListener("click", () => this.closePopup());

    // Clicking the translucent overlay outside the dialog closes any standard popup.
    this.popupLayer.addEventListener("click", (event) => {
      if (event.target !== this.popupLayer) {
        return;
      }

      if (this.airPickMode || this.intelPickMode) {
        const mouseEvent = event as MouseEvent;
        const hits = document.elementsFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        let offsetKey: string | null = null;
        for (const hit of hits) {
          const cell = (hit as Element).closest?.(".hex-cell") as Element | null;
          const key = (cell as HTMLElement | SVGElement | null)?.dataset?.hex;
          if (typeof key === "string" && key.length > 0) {
            offsetKey = key;
            break;
          }
        }

        if (offsetKey) {
          this.onBattleHexClicked(new CustomEvent("battle:hexClicked", { detail: { offsetKey } }));
        } else {
          if (this.airPickMode) {
            const panel = this.popupBody.querySelector<HTMLElement>("[data-air-panel]");
            const fb = panel?.querySelector<HTMLElement>("[data-air-feedback]");
            fb && (fb.textContent = "Click a hex on the map to select a target.");
          } else if (this.intelPickMode) {
            this.setIntelFeedback("Click an in-bounds hex on the map to project the deception screen.");
          }
        }
        return;
      }

      this.closePopup();
    });

    // Provide Escape-key dismissal for keyboard users.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.activePopup && this.activePopup !== "baseOperations") {
        if (this.activePopup === "airSupport" && this.airPickMode) {
          event.preventDefault();
          this.airPickMode = null;
          document.dispatchEvent(new CustomEvent("air:clearPreview"));
          this.setAirPlannerFeedback("Target selection cancelled.", "neutral");
          if (this.airPlannerState.suspendedForMapPick) {
            this.resumeAirSupportPopupFromMapPick();
          } else {
            this.renderAirSupportPanel();
          }
          return;
        }
        this.closePopup();
      }
    });
  }

  /**
   * Initializes the Intelligence panel by wiring timeframe/confidence filters and rendering the view.
   * The Intelligence panel presents analyst briefs and an optional alert banner; recon sectors are not shown here.
   */
  private initializeIntelPanel(): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    const panel = this.popupBody.querySelector<HTMLElement>("[data-intel-panel]");
    if (!panel) {
      return;
    }
    const timeframeButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-intel-timeframe]"));
    const confidenceButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-intel-confidence]"));

    const activate = (buttons: HTMLButtonElement[], active: HTMLButtonElement): void => {
      buttons.forEach((b) => b.classList.toggle("is-active", b === active));
    };

    timeframeButtons.forEach((button) => {
      if ((button.dataset.intelTimeframe ?? "all") === "all") button.classList.add("is-active");
      button.addEventListener("click", () => {
        this.reconIntelTimeframe = (button.dataset.intelTimeframe ?? "all") as ReconIntelTimeframe | "all";
        activate(timeframeButtons, button);
        this.renderIntelPanel();
      });
    });

    confidenceButtons.forEach((button) => {
      if ((button.dataset.intelConfidence ?? "all") === "all") button.classList.add("is-active");
      button.addEventListener("click", () => {
        this.reconIntelConfidence = (button.dataset.intelConfidence ?? "all") as ReconIntelConfidence | "all";
        activate(confidenceButtons, button);
        this.renderIntelPanel();
      });
    });

    this.bindIntelActionControls(panel);
    this.renderIntelPanel();
  }

  private bindIntelActionControls(panel: HTMLElement): void {
    if (panel.getAttribute("data-intel-controls-initialized") === "true") {
      return;
    }

    panel.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const deployButton = target.closest<HTMLButtonElement>("[data-intel-action='deception']");
      if (deployButton) {
        this.intelPickMode = "deception";
        this.setIntelFeedback("Click a map hex to place a deception screen. Enemy battalions will bias toward that false axis.");
        return;
      }

      const verifyButton = target.closest<HTMLButtonElement>("[data-intel-verify]");
      if (verifyButton) {
        const briefId = verifyButton.dataset.intelVerify ?? "";
        if (!briefId) {
          return;
        }
        this.handleIntelVerification(briefId);
      }
    });

    panel.setAttribute("data-intel-controls-initialized", "true");
  }

  private handleIntelVerification(briefId: string): void {
    try {
      const engine = this.battleState.ensureGameEngine();
      const result = engine.verifyIntelBrief(briefId);
      if (!result.ok) {
        this.setIntelFeedback(result.reason);
        return;
      }
      this.setIntelFeedback(
        result.status === "confirmed-false"
          ? "Verification complete: the brief was false. Keep reserves on the confirmed axis."
          : "Verification complete: the brief is confirmed and can be used for planning."
      );
      this.refreshReconIntelSnapshot();
    } catch (error) {
      console.warn("PopupManager: Failed to verify intelligence brief.", error);
      this.setIntelFeedback("Verification failed. Try again once the battle engine is available.");
    }
  }

  /**
   * Renders the Intelligence panel: alert banner + filtered intelligence briefs with confidence labels.
   */
  private renderIntelPanel(): void {
    this.reconIntelSnapshot = this.requestReconIntelSnapshot();
    if (!this.reconIntelSnapshot) {
      return;
    }
    const banner = this.popupBody.querySelector<HTMLElement>("[data-intel-alert]");
    if (banner) {
      const alert = this.selectReconIntelAlert();
      if (!alert) {
        banner.hidden = true;
        banner.textContent = "";
        banner.removeAttribute("data-severity");
      } else {
        banner.hidden = false;
        banner.setAttribute("data-severity", alert.severity);
        banner.innerHTML = `<span>${alert.message}</span><small>${alert.action}</small>`;
      }
    }

    const summary = this.popupBody.querySelector<HTMLElement>("[data-intel-counterintel-summary]");
    if (summary) {
      summary.innerHTML = this.composeIntelCounterIntelSummary(this.reconIntelSnapshot.counterIntel);
    }

    const operations = this.popupBody.querySelector<HTMLElement>("[data-intel-counterintel-ops]");
    if (operations) {
      const activeOperations = this.reconIntelSnapshot.counterIntel?.activeOperations ?? [];
      operations.innerHTML = activeOperations.length === 0
        ? '<div class="intel-empty">No deception screens are active. Use counter-intelligence to pull the enemy toward a false axis.</div>'
        : activeOperations.map((entry) => this.composeCounterIntelOperationMarkup(entry)).join("");
    }

    const feedback = this.popupBody.querySelector<HTMLElement>("[data-intel-feedback]");
    if (feedback) {
      feedback.textContent = this.intelFeedbackMessage || "Low-confidence briefs may be deceptive. Verify them before shifting reserves.";
    }

    const list = this.popupBody.querySelector<HTMLElement>("[data-intel-brief-list]");
    if (!list) {
      return;
    }
    const briefs = this.reconIntelSnapshot.intelBriefs.filter((b) => this.matchesReconIntelFilters(b.timeframe, b.confidence));
    list.innerHTML = briefs.length === 0
      ? '<div class="intel-empty">No intelligence briefs match the selected filters.</div>'
      : briefs.map((b) => this.composeIntelBriefMarkup(b)).join("");
  }

  /**
   * Renders the Recon panel with live and recent reports so commanders can see the current contact picture.
   */
  private renderReconPanel(): void {
    this.reconIntelSnapshot = this.requestReconIntelSnapshot();
    if (!this.reconIntelSnapshot) {
      return;
    }
    const list = this.popupBody.querySelector<HTMLElement>("[data-recon-report-list]");
    if (!list) {
      return;
    }
    const reconReports = this.reconIntelSnapshot.sectors
      .filter((sector) => sector.timeframe === "current" || sector.timeframe === "last")
      .sort((left, right) => {
        const timeframeRank = (left.timeframe === "current" ? 0 : 1) - (right.timeframe === "current" ? 0 : 1);
        if (timeframeRank !== 0) {
          return timeframeRank;
        }
        const confidenceRank = { high: 0, medium: 1, low: 2 } as const;
        return confidenceRank[left.confidence] - confidenceRank[right.confidence];
      });
    list.innerHTML = reconReports.length === 0
      ? '<div class="recon-report-empty">No reconnaissance reports are available yet.</div>'
      : reconReports.map((sector) => this.composeReconReportCard(sector)).join("");
  }

  private refreshReconIntelSnapshot(): void {
    const snapshot = this.requestReconIntelSnapshot();
    this.reconIntelSnapshot = snapshot;
    document.dispatchEvent(new CustomEvent("battle:reconIntelUpdated", { detail: snapshot }));
  }

  private setIntelFeedback(message: string): void {
    this.intelFeedbackMessage = message;
    const feedback = this.popupBody.querySelector<HTMLElement>("[data-intel-feedback]");
    if (feedback) {
      feedback.textContent = message;
    }
  }

  private composeIntelCounterIntelSummary(summary: ReconIntelSnapshot["counterIntel"] | undefined): string {
    if (!summary) {
      return `
        <article class="intel-command-card">
          <strong>Counter-Intelligence Offline</strong>
          <p>Live deception and verification actions become available once the battle engine is active.</p>
        </article>
      `;
    }

    return `
      <article class="intel-command-card">
        <span>Deception Teams</span>
        <strong>${summary.deceptionCharges}/${summary.deceptionMaxCharges}</strong>
        <p>Project a false axis that can pull enemy battalions away from the real main effort.</p>
      </article>
      <article class="intel-command-card">
        <span>Verification Cells</span>
        <strong>${summary.verificationCharges}/${summary.verificationMaxCharges}</strong>
        <p>Resolve suspicious briefs before you redeploy reserves, artillery, or logistics convoys.</p>
      </article>
      <article class="intel-command-card">
        <span>False Intel Risk</span>
        <strong>${summary.suspectedFalseBriefs} suspect / ${summary.confirmedFalseBriefs} confirmed</strong>
        <p>${this.escapeHtml(summary.doctrineSummary)}</p>
      </article>
    `;
  }

  private composeCounterIntelOperationMarkup(operation: ReconIntelCounterIntelOperation): string {
    return `
      <article class="intel-operation-card">
        <header>
          <strong>${this.escapeHtml(operation.label)}</strong>
          <span class="meta-pill">Turns ${operation.remainingTurns}</span>
        </header>
        <div class="meta-line">
          <span>${this.escapeHtml(operation.targetHex)}</span>
          <span>Radius ${operation.radius}</span>
        </div>
        <p class="body">${this.escapeHtml(operation.effect)}</p>
      </article>
    `;
  }

  private composeIntelBriefMarkup(brief: ReconIntelBrief): string {
    const verificationStatus = brief.verificationStatus ?? "unverified";
    const locked = verificationStatus === "verified" || verificationStatus === "confirmed-false";
    const linkedSectorCount = brief.linkedSectors.length;
    const linkedSectorText =
      linkedSectorCount === 0
        ? "No recon sectors linked."
        : `${linkedSectorCount} recon sector${linkedSectorCount === 1 ? "" : "s"} linked.`;
    const sourceMarkup = brief.source
      ? `<span class="meta-pill">${this.escapeHtml(brief.source)}</span>`
      : "";

    return `
      <article class="intel-card intel-card--${verificationStatus}" data-brief-id="${this.escapeHtml(brief.id)}" tabindex="0">
        <div class="intel-card__header">
          <div class="intel-card__title-group">
            <strong>${this.escapeHtml(brief.title)}</strong>
            <div class="meta-line">
              <span class="meta-pill">${this.describeReconIntelTimeframe(brief.timeframe)}</span>
              <span class="meta-pill">${this.describeReconIntelConfidence(brief.confidence)}</span>
              <span class="meta-pill meta-pill--status">${this.describeReconIntelVerificationStatus(verificationStatus)}</span>
              ${sourceMarkup}
            </div>
          </div>
          <button
            type="button"
            class="intel-verify-button${locked ? " is-disabled" : ""}"
            data-intel-verify="${this.escapeHtml(brief.id)}"
            ${locked ? "disabled" : ""}
          >
            ${locked ? "Resolved" : "Verify"}
          </button>
        </div>
        <p class="body" data-confidence="${brief.confidence}">${this.escapeHtml(brief.assessment)}</p>
        <p class="body">${this.escapeHtml(brief.recommendedAction ?? brief.projectedImpact)}</p>
        <div class="meta-line"><span>${this.escapeHtml(linkedSectorText)}</span></div>
      </article>
    `;
  }

  private describeReconIntelVerificationStatus(status: ReconIntelVerificationStatus): string {
    switch (status) {
      case "suspected-false":
        return "Suspected False";
      case "verified":
        return "Verified";
      case "confirmed-false":
        return "Confirmed False";
      case "unverified":
      default:
        return "Unverified";
    }
  }

  /**
   * Creates a card for a recon sector formatted for the Recon panel.
   */
  private composeReconReportCard(sector: ReconIntelSectorReport): string {
    return `
      <article class="recon-report-card" data-recon-sector-id="${sector.id}">
        <strong>${sector.name}</strong>
        <div class="meta-line">
          <span class="meta-pill">${this.describeReconIntelTimeframe(sector.timeframe)}</span>
          <span class="meta-pill">${this.describeReconIntelConfidence(sector.confidence)}</span>
          <span>${sector.coordinates}</span>
        </div>
        <p>${sector.summary}</p>
        <p>${sector.activity}</p>
      </article>
    `;
  }

  /**
   * Pulls the latest recon/intel snapshot from the battle engine when available, falling back to static data otherwise.
   */
  private requestReconIntelSnapshot(): ReconIntelSnapshot {
    try {
      const battleState = ensureBattleState();
      if (battleState.hasEngine()) {
        return battleState.ensureGameEngine().getReconIntelSnapshot();
      }
    } catch (error) {
      console.warn("PopupManager: Failed to pull recon intel snapshot from GameEngine. Using fallback.", error);
    }
    return buildFallbackReconIntelSnapshot();
  }

  /**
   * Handles broadcast events when the recon/intel pipeline publishes a fresh snapshot.
   * The handler caches the payload and re-renders the panel if it is currently visible.
   */
  private onReconIntelUpdate(event: CustomEvent<ReconIntelSnapshot>): void {
    const incoming = event.detail ?? this.requestReconIntelSnapshot();
    this.reconIntelSnapshot = incoming;
    if (this.activePopup === "recon") {
      this.renderReconPanel();
    } else if (this.activePopup === "intelligence") {
      this.renderIntelPanel();
    }
  }

  /**
   * Opens a popup by its key identifier.
   */
  openPopup(key: PopupKey, trigger?: HTMLButtonElement): void {
    const resolvedKey: PopupKey = key === "supplies" ? "logistics" : key;

    // Handle special popup types
    if (resolvedKey === "baseOperations") {
      this.openBaseOperationsPopup(resolvedKey, trigger);
      return;
    }

    if (resolvedKey === "recon") {
      this.openReconPopup(resolvedKey, trigger);
      return;
    }

    if (resolvedKey === "intelligence") {
      this.openIntelPopup(resolvedKey, trigger);
      return;
    }

    if (resolvedKey === "airSupport") {
      this.openAirSupportPopup(resolvedKey, trigger);
      return;
    }

    // Standard popup handling
    const content = getPopupContent(resolvedKey);
    if (!content) {
      console.warn(`No content defined for popup key: ${resolvedKey}`);
      return;
    }

    this.showPopup(resolvedKey, content, trigger);
  }

  /**
   * Closes the currently active popup.
   * Handles both standard popups and the war room overlay.
   */
  closePopup(): void {
    if (!this.activePopup) {
      return;
    }

    // Handle war room overlay closure separately
    if (this.activePopup === "baseOperations") {
      this.warRoomOverlay?.close();
      return;
    } else {
      // Standard popup closure
      this.hidePopupLayer();
    }

    this.syncSidebarButtons(null);

    const trigger = this.lastTriggerButton;
    this.resetAirSupportPlannerState();
    this.intelPickMode = null;
    this.intelFeedbackMessage = "";
    this.activePopup = null;
    this.lastTriggerButton = null;

    // Restore focus to trigger button
    if (trigger) {
      trigger.focus();
    }
  }

  /**
   * Returns the currently active popup key.
   */
  getActivePopup(): PopupKey | null {
    return this.activePopup;
  }

  /**
   * Shows a standard popup with the provided content.
   */
  private showPopup(key: PopupKey, content: PopupContent, trigger?: HTMLButtonElement): void {
    this.popupTitle.textContent = content.title;
    this.popupBody.innerHTML = content.body;
    this.popupDialog.dataset.popupKey = key;

    this.popupLayer.classList.remove("hidden");
    this.popupLayer.setAttribute("aria-hidden", "false");

    this.activePopup = key;
    this.lastTriggerButton = trigger ?? null;
    this.syncSidebarButtons(key);

    // Handle post-render logic for specific popups
    if (key === "armyRoster") {
      this.renderArmyRoster();
    }

    if (key === "generalProfile") {
      this.renderGeneralProfile();
    }

    if (key === "supplies") {
      this.renderSuppliesPanel();
    }

    if (key === "logistics") {
      this.renderLogisticsPanel();
    }

    this.popupDialog.focus();
  }

  /** Opens the Air Support panel and renders its contents (summary, mission roster, scheduler). */
  private openAirSupportPopup(key: PopupKey, trigger?: HTMLButtonElement): void {
    const content = getPopupContent("airSupport");
    if (!content) {
      console.warn("Air Support popup content is not registered.");
      return;
    }
    this.resetAirSupportPlannerState();
    this.showPopup(key, content, trigger);
    this.renderAirSupportPanel();
  }

  /** Renders the Air Support panel summary chips, mission list, and sortie order board. */
  private renderAirSupportPanel(): void {
    const panel = this.popupBody.querySelector<HTMLElement>("[data-air-panel]");
    if (!panel) {
      return;
    }

    let engine: GameEngineAPI;
    try {
      engine = this.battleState.ensureGameEngine();
    } catch (error) {
      console.warn("Air Support panel: GameEngine unavailable", error);
      return;
    }

    try {
      const summary = engine.getAirSupportSummary();
      const setText = (selector: string, value: number): void => {
        const element = panel.querySelector<HTMLElement>(selector);
        if (element) {
          element.textContent = String(value);
        }
      };
      setText("[data-air-queued]", summary.queued);
      setText("[data-air-inflight]", summary.inFlight);
      setText("[data-air-resolving]", summary.resolving);
      setText("[data-air-completed]", summary.completed);
      setText("[data-air-refit]", summary.refit);
    } catch {
      // Keep panel resilient if the summary snapshot temporarily fails.
    }

    const list = panel.querySelector<HTMLUListElement>("[data-air-mission-list]");
    if (list) {
      this.renderAirMissionList(list, engine);
    }

    const refreshBtn = panel.querySelector<HTMLButtonElement>("[data-air-refresh]");
    if (refreshBtn) {
      refreshBtn.onclick = () => this.renderAirSupportPanel();
    }

    this.renderAirSupportOrderBoard(panel, engine);
  }

  /** Populates the mission-kind select from engine templates. */
  private populateAirMissionKind(select: HTMLSelectElement, engine: GameEngineAPI): void {
    try {
      const templates = engine.listAirMissionTemplates();
      select.innerHTML = templates.map((t) => `<option value="${t.kind}">${this.escapeHtml(t.label)}</option>`).join("");
    } catch {
      select.innerHTML = "";
    }
  }

  private updateAirSupportBrief(
    panel: HTMLElement,
    engine: GameEngineAPI,
    kind: string,
    unitValue: string
  ): void {
    const title = panel.querySelector<HTMLElement>("[data-air-brief-title]");
    const text = panel.querySelector<HTMLElement>("[data-air-brief-text]");
    const target = panel.querySelector<HTMLElement>("[data-air-brief-target]");
    const refit = panel.querySelector<HTMLElement>("[data-air-brief-refit]");

    let template:
      | { label: string; description: string; requiresTarget?: boolean; requiresFriendlyEscortTarget?: boolean }
      | undefined;

    try {
      template = engine.listAirMissionTemplates().find((entry) => entry.kind === kind);
    } catch {
      template = undefined;
    }

    if (title) {
      title.textContent = template?.label ?? "Standing Patrol Orders";
    }
    if (text) {
      text.textContent = template?.description
        ?? "Assign fighter cover, strike sorties, and emergency lifts from the sortie board.";
    }
    if (target) {
      if (kind === "airTransport") {
        target.textContent = "Drop zone required";
      } else if (template?.requiresFriendlyEscortTarget) {
        target.textContent = "Queued bomber required";
      } else if (template?.requiresTarget) {
        target.textContent = "Target hex required";
      } else if (kind === "airCover") {
        target.textContent = "Base CAP or selected sector";
      } else {
        target.textContent = "Optional assignment";
      }
    }
    if (refit) {
      let refitCopy = "Refit follows each sortie";
      const unitHex = this.parseAxialString(unitValue);
      if (unitHex) {
        try {
          const refitTurns = engine.getAircraftRefitTurns(unitHex as any);
          if (typeof refitTurns === "number") {
            refitCopy = `${refitTurns} turn${refitTurns === 1 ? "" : "s"} of refit after sortie`;
          }
        } catch {
          // Leave default wording when the selected entry is unavailable.
        }
      }
      refit.textContent = refitCopy;
    }
  }

  /** Disables Escort mission until at least one bomber strike is scheduled for the active faction. */
  private disableEscortUnlessBomberScheduled(kindSelect: HTMLSelectElement, engine: GameEngineAPI): void {
    try {
      const missions = engine.getScheduledAirMissions(engine.activeFaction);
      const hasBomberStrike = missions.some((m) => m.kind === "strike");
      const escortOption = Array.from(kindSelect.options).find((o) => o.value === "escort");
      if (escortOption) {
        escortOption.disabled = !hasBomberStrike;
        if (!hasBomberStrike && kindSelect.value === "escort") {
          // Nudge back to first available option when escort becomes invalid
          const first = Array.from(kindSelect.options).find((o) => !o.disabled);
          if (first) {
            kindSelect.value = first.value;
          }
        }
      }
    } catch {}
  }

  /** Populate player squadrons that qualify for the selected mission based on unit type AirSupportProfile roles. */
  private populateEligibleSquadrons(select: HTMLSelectElement, engine: GameEngineAPI, kind: string): void {
    try {
      const templates = engine.listAirMissionTemplates();
      const tpl = templates.find((t) => t.kind === (kind as any));
      const allowed = new Set((tpl?.allowedRoles ?? []) as string[]);
      const mk = (ax: { q: number; r: number }) => `${ax.q},${ax.r}`;

      // Collect eligible aircraft from deployed units
      const deployedUnits = engine.playerUnits ?? [];
      const eligibleDeployed = deployedUnits.filter((u) => {
        const def = (unitTypesSource as any)[u.type];
        const roles: string[] = def?.airSupport?.roles ?? [];
        return Array.isArray(roles) && roles.some((r) => allowed.has(r));
      });

      // Also collect eligible aircraft from reserves (allocated in precombat)
      const reserveUnits = engine.reserveUnits ?? [];
      const eligibleReserves = reserveUnits.filter((r) => {
        const def = (unitTypesSource as any)[r.unit.type];
        const roles: string[] = def?.airSupport?.roles ?? [];
        return Array.isArray(roles) && roles.some((role) => allowed.has(role));
      });

      if (eligibleDeployed.length === 0 && eligibleReserves.length === 0) {
        select.innerHTML = `<option value="" disabled selected>No eligible squadrons</option>`;
        select.disabled = true;
        return;
      }
      select.disabled = false;

      // Build options: deployed units first, then reserves
      const options: string[] = [];
      for (const u of eligibleDeployed) {
        options.push(`<option value="${mk(u.hex)}">${this.escapeHtml(String(u.type))} — ${mk(u.hex)}</option>`);
      }
      for (const r of eligibleReserves) {
        // Reserves use their scenario hex as identifier (consistent with lookupUnit including reserves)
        options.push(`<option value="${mk(r.unit.hex)}">${this.escapeHtml(String(r.unit.type))} (Reserve)</option>`);
      }
      select.innerHTML = options.join("");
    } catch {
      select.innerHTML = `<option value="" disabled selected>Unavailable</option>`;
      select.disabled = true;
    }
  }

  /** Populate targets: enemy units for strike; friendly bomber hexes for escort; optional for airCover. */
  private populateTargets(select: HTMLSelectElement, engine: GameEngineAPI, kind: string): void {
    const mk = (ax: { q: number; r: number }) => `${ax.q},${ax.r}`;
    try {
      if (kind !== "airTransport" && this.airPickMode === "target") {
        this.airPickMode = null;
      }

      if (kind === "escort") {
        const missions = engine.getScheduledAirMissions(engine.activeFaction).filter((m) => m.kind === "strike");
        if (missions.length === 0) {
          select.innerHTML = `<option value="" disabled selected>Schedule a bomber strike first</option>`;
          select.disabled = true;
          return;
        }
        // Include both deployed and reserve units when searching for the bomber
        const friendlies = engine.playerUnits ?? [];
        const reserveUnits = engine.reserveUnits ?? [];
        const getSquadronKey = (unit: { unitId?: string; type: any; hex: { q: number; r: number } }): string => {
          return unit.unitId ?? `${String(unit.type)}@${axialKey(unit.hex as any)}`;
        };
        const options: string[] = [];
        for (const m of missions) {
          // Try deployed units first
          let unit = friendlies.find((u) => getSquadronKey(u as any) === m.unitKey);
          // Also check reserves for air units
          if (!unit) {
            const reserveEntry = reserveUnits.find((r) => getSquadronKey(r.unit as any) === m.unitKey);
            unit = reserveEntry?.unit;
          }
          if (unit) {
            options.push(
              `<option value="${mk(unit.hex)}">Bomber at ${mk(unit.hex)} — ${this.escapeHtml(String(unit.type))}</option>`
            );
            continue;
          }
          if (typeof m.originHexKey === "string" && m.originHexKey.length > 0) {
            options.push(
              `<option value="${this.escapeHtml(m.originHexKey)}">Bomber at ${this.escapeHtml(m.originHexKey)} — ${this.escapeHtml(String(m.unitType))}</option>`
            );
          }
        }
        if (options.length === 0) {
          select.innerHTML = `<option value="" disabled selected>No bomber position available</option>`;
          select.disabled = true;
          return;
        }
        select.disabled = false;
        select.innerHTML = options.join("");
        return;
      }

      // Air Cover: target is optional, add "Base CAP" as the default option.
      if (kind === "airCover") {
        const targets = (engine.activeFaction === "Player" ? engine.playerUnits : engine.botUnits) ?? [];
        const options: string[] = [];
        // Base CAP option: no target hex means the squadron covers its own base.
        options.push(`<option value="">Base CAP (cover home base)</option>`);
        // Also allow selecting specific hexes to patrol.
        for (const u of targets) {
          options.push(`<option value="${mk(u.hex)}">Patrol over ${mk(u.hex)} — ${this.escapeHtml(String(u.type))}</option>`);
        }
        select.disabled = false;
        select.innerHTML = options.join("");
        return;
      }

      // Air Transport: allow clicking on the map to select any hex for paratroop drop.
      // We show a "Click map to select drop zone" prompt and enable map click targeting.
      if (kind === "airTransport") {
        this.airPickMode = "target";
        select.innerHTML = `<option value="" selected>Click map to select drop zone...</option>`;
        select.disabled = false;
        // The actual target selection will be handled by the map click handler.
        return;
      }

      // Strike: list enemy targets known to the commander (all current enemy units)
      const enemies = engine.botUnits ?? [];
      if (!enemies || enemies.length === 0) {
        select.innerHTML = `<option value="" disabled selected>No enemy targets in intel</option>`;
        select.disabled = true;
        return;
      }
      select.disabled = false;
      select.innerHTML = enemies
        .map((u) => `<option value="${mk(u.hex)}">${this.escapeHtml(String(u.type))} — ${mk(u.hex)}</option>`)
        .join("");
    } catch {
      select.innerHTML = `<option value="" disabled selected>Unavailable</option>`;
      select.disabled = true;
    }
  }

  private resetAirSupportPlannerState(): void {
    this.airPickMode = null;
    this.airPlannerState.missionKind = "";
    this.airPlannerState.squadronValue = "";
    this.airPlannerState.targetValue = "";
    this.airPlannerState.feedback = "";
    this.airPlannerState.feedbackTone = "neutral";
    this.airPlannerState.suspendedForMapPick = false;
    document.dispatchEvent(new CustomEvent("air:clearPreview"));
  }

  private setAirPlannerFeedback(message: string, tone: AirPlannerFeedbackTone = "neutral"): void {
    this.airPlannerState.feedback = message;
    this.airPlannerState.feedbackTone = tone;
  }

  private renderAirSupportOrderBoard(panel: HTMLElement, engine: GameEngineAPI): void {
    const view = this.buildAirPlannerView(engine);

    const missionTabsHost = panel.querySelector<HTMLElement>("[data-air-mission-tabs]");
    if (missionTabsHost) {
      missionTabsHost.innerHTML = view.missionTabs.map((entry) => `
        <button
          type="button"
          class="air-mission-tab"
          role="tab"
          aria-selected="${entry.template.kind === this.airPlannerState.missionKind ? "true" : "false"}"
          data-air-mission-tab="${this.escapeHtml(entry.template.kind)}"
          ${entry.disabled ? "disabled" : ""}
          ${entry.disabledReason ? `title="${this.escapeHtml(entry.disabledReason)}"` : ""}
        >
          <strong>${this.escapeHtml(entry.template.label)}</strong>
          <span>${this.escapeHtml(entry.template.description)}</span>
        </button>
      `).join("");

      missionTabsHost.querySelectorAll<HTMLButtonElement>("[data-air-mission-tab]").forEach((button) => {
        button.onclick = () => {
          const kind = (button.dataset.airMissionTab ?? "") as AirMissionKind;
          if (!kind || button.disabled) {
            return;
          }
          this.airPlannerState.missionKind = kind;
          this.airPlannerState.targetValue = "";
          this.airPickMode = null;
          this.setAirPlannerFeedback("", "neutral");
          document.dispatchEvent(new CustomEvent("air:clearPreview"));
          this.renderAirSupportPanel();
        };
      });
    }

    const squadronGrid = panel.querySelector<HTMLElement>("[data-air-squadron-grid]");
    if (squadronGrid) {
      if (view.squadronCards.length === 0) {
        squadronGrid.innerHTML = `
          <div class="air-target-card">
            <span class="air-target-card__eyebrow">Squadron Board</span>
            <strong class="air-target-card__title">No eligible wings</strong>
            <p class="air-target-card__detail">No ready squadron can fly this mission profile right now.</p>
          </div>
        `;
      } else {
        squadronGrid.innerHTML = view.squadronCards.map((card) => {
          const visual = card.spriteUrl
            ? `<img src="${this.escapeHtml(card.spriteUrl)}" alt="${this.escapeHtml(card.label)}">`
            : `<span class="air-squadron-card__fallback">${this.escapeHtml(card.shortLabel)}</span>`;
          const radiusCopy = card.combatRadiusHex === null ? "Radius unavailable" : `Radius ${card.combatRadiusHex} hex`;
          const refitCopy = card.refitTurns === null ? "Refit variable" : `Refit ${card.refitTurns} turn${card.refitTurns === 1 ? "" : "s"}`;
          const baseCopy = card.isReserve ? "Reserve Strip" : `Base ${card.locationLabel}`;
          return `
            <button
              type="button"
              class="air-squadron-card"
              data-air-squadron="${this.escapeHtml(card.value)}"
              aria-pressed="${card.value === this.airPlannerState.squadronValue ? "true" : "false"}"
              ${card.disabled ? "disabled" : ""}
            >
              <span class="air-squadron-card__visual">${visual}</span>
              <span class="air-squadron-card__copy">
                <span class="air-squadron-card__topline">
                  <span class="air-squadron-card__label">${this.escapeHtml(card.label)}</span>
                  <span class="air-status-pill air-status-pill--${this.escapeHtml(card.statusClass)}">${this.escapeHtml(card.statusLabel)}</span>
                </span>
                <span class="air-squadron-card__meta">
                  <span class="air-squadron-stat">Strength ${this.escapeHtml(String(card.strength))}</span>
                  <span class="air-squadron-stat">${this.escapeHtml(baseCopy)}</span>
                </span>
                <span class="air-squadron-card__detail">${this.escapeHtml(card.roleLabel)} · ${this.escapeHtml(radiusCopy)} · ${this.escapeHtml(refitCopy)}</span>
              </span>
            </button>
          `;
        }).join("");
      }

      squadronGrid.querySelectorAll<HTMLButtonElement>("[data-air-squadron]").forEach((button) => {
        button.onclick = () => {
          const value = button.dataset.airSquadron ?? "";
          if (!value || button.disabled) {
            return;
          }
          this.airPlannerState.squadronValue = value;
          this.setAirPlannerFeedback("", "neutral");
          this.renderAirSupportPanel();
        };
      });
    }

    const targetPanel = panel.querySelector<HTMLElement>("[data-air-target-panel]");
    if (targetPanel) {
      targetPanel.innerHTML = this.renderAirTargetPanelMarkup(engine, view);

      targetPanel.querySelectorAll<HTMLButtonElement>("[data-air-pick-target]").forEach((button) => {
        button.onclick = () => this.beginAirTargetSelection(view);
      });
      targetPanel.querySelectorAll<HTMLButtonElement>("[data-air-clear-target]").forEach((button) => {
        button.onclick = () => {
          this.airPlannerState.targetValue = "";
          this.setAirPlannerFeedback("", "neutral");
          this.renderAirSupportPanel();
        };
      });
      targetPanel.querySelectorAll<HTMLButtonElement>("[data-air-escort-target]").forEach((button) => {
        button.onclick = () => {
          const value = button.dataset.airEscortTarget ?? "";
          if (!value) {
            return;
          }
          this.airPlannerState.targetValue = value;
          this.setAirPlannerFeedback("", "neutral");
          this.renderAirSupportPanel();
        };
      });
    }

    const form = panel.querySelector<HTMLFormElement>("[data-air-form]");
    if (form) {
      form.onsubmit = (event) => {
        event.preventDefault();
        this.scheduleAirPlannerMission(engine, view);
      };
    }

    const submitButton = panel.querySelector<HTMLButtonElement>("[data-air-submit]");
    if (submitButton) {
      const mission = view.selectedMission;
      const canSubmit = Boolean(
        mission
        && view.selectedSquadron
        && !view.selectedSquadron.disabled
        && (!mission.requiresTarget || this.airPlannerState.targetValue)
        && (!mission.requiresFriendlyEscortTarget || this.airPlannerState.targetValue)
      );
      submitButton.disabled = !canSubmit;
      submitButton.textContent = mission?.kind === "airCover"
        ? "Assign Patrol"
        : mission?.kind === "escort"
          ? "Assign Escort"
          : mission?.kind === "airTransport"
            ? "Commit Drop"
            : "Issue Sortie";
    }

    this.updateAirSupportBriefFromPlanner(panel, engine, view);
    this.syncAirPlannerFeedback(panel, view);
  }

  private buildAirPlannerView(engine: GameEngineAPI): AirPlannerViewModel {
    const missionTabs = this.buildAirMissionTabs(engine);
    const selectedMission = (() => {
      const active = missionTabs.find((entry) => entry.template.kind === this.airPlannerState.missionKind && !entry.disabled);
      if (active) {
        return active.template;
      }
      return missionTabs.find((entry) => !entry.disabled)?.template ?? missionTabs[0]?.template ?? null;
    })();

    this.airPlannerState.missionKind = selectedMission?.kind ?? "";

    const squadronCards = this.buildAirSquadronCards(engine, selectedMission);
    const firstReadySquadron = squadronCards.find((entry) => !entry.disabled) ?? squadronCards[0] ?? null;
    const selectedSquadron = squadronCards.find((entry) => entry.value === this.airPlannerState.squadronValue && !entry.disabled)
      ?? firstReadySquadron;
    this.airPlannerState.squadronValue = selectedSquadron?.value ?? "";

    const escortTargets = this.buildAirEscortTargets(engine, selectedMission);
    if (selectedMission?.kind === "escort") {
      const selectedEscort = escortTargets.find((entry) => entry.value === this.airPlannerState.targetValue) ?? escortTargets[0] ?? null;
      this.airPlannerState.targetValue = selectedEscort?.value ?? "";
    } else if (this.airPickMode === "escort") {
      this.airPickMode = null;
    }

    return {
      missionTabs,
      selectedMission,
      squadronCards,
      selectedSquadron: squadronCards.find((entry) => entry.value === this.airPlannerState.squadronValue) ?? null,
      escortTargets
    } satisfies AirPlannerViewModel;
  }

  private buildAirMissionTabs(engine: GameEngineAPI): readonly AirMissionTabView[] {
    const queuedStrikeExists = engine.getScheduledAirMissions(engine.activeFaction).some(
      (mission) => mission.kind === "strike" && mission.status === "queued"
    );

    return engine.listAirMissionTemplates().map((template) => ({
      template,
      disabled: template.kind === "escort" && !queuedStrikeExists,
      disabledReason: template.kind === "escort" && !queuedStrikeExists
        ? "Queue a bomber strike first."
        : undefined
    }));
  }

  private buildAirSquadronCards(
    engine: GameEngineAPI,
    mission: AirMissionTemplate | null
  ): readonly AirSquadronCardView[] {
    if (!mission) {
      return [];
    }

    const allowedRoles = new Set(mission.allowedRoles);
    const activeAssignments = new Map<string, SerializedAirMission>();
    engine.getScheduledAirMissions(engine.activeFaction).forEach((entry) => {
      if (entry.status !== "completed") {
        activeAssignments.set(entry.unitKey, entry);
      }
    });

    const deployedEntries = (engine.playerUnits ?? []).map((unit) => ({ unit, isReserve: false }));
    const reserveEntries = (engine.reserveUnits ?? []).map((entry) => ({ unit: entry.unit as ScenarioUnit, isReserve: true }));

    return [...deployedEntries, ...reserveEntries]
      .filter(({ unit }) => {
        const roles = ((unitTypesSource as Record<string, { airSupport?: { roles?: string[] } }>)[String(unit.type)]?.airSupport?.roles ?? []);
        return roles.some((role) => allowedRoles.has(role as never));
      })
      .map(({ unit, isReserve }) => {
        const squadronId = this.resolveAirPlannerSquadronId(unit);
        const assignment = activeAssignments.get(squadronId) ?? null;
        const roleLabel = (((unitTypesSource as Record<string, { airSupport?: { roles?: string[] } }>)[String(unit.type)]?.airSupport?.roles ?? []) as string[])
          .map((role) => this.formatAirRoleLabel(role))
          .join(" / ");
        const refitTurns = ((unitTypesSource as Record<string, { airSupport?: { refitTurns?: number } }>)[String(unit.type)]?.airSupport?.refitTurns ?? null) as number | null;
        const statusLabel = assignment
          ? this.formatAirMissionStatusLabel(assignment.status)
          : isReserve
            ? "Reserve"
            : "Ready";
        const statusClass = assignment
          ? this.formatAirMissionStatusClass(assignment.status)
          : isReserve
            ? "reserve"
            : "ready";

        return {
          value: `${unit.hex.q},${unit.hex.r}`,
          squadronId,
          label: this.formatAirUnitLabel(String(unit.type)),
          shortLabel: this.buildAirUnitMonogram(String(unit.type)),
          locationLabel: `${unit.hex.q},${unit.hex.r}`,
          roleLabel: roleLabel || "Air Wing",
          strength: unit.strength ?? 0,
          statusLabel,
          statusClass,
          isReserve,
          disabled: assignment !== null,
          spriteUrl: getSpriteForScenarioType(String(unit.type)),
          refitTurns,
          combatRadiusHex: this.resolveAirPlannerRadiusHex(engine, unit)
        } satisfies AirSquadronCardView;
      });
  }

  private buildAirEscortTargets(
    engine: GameEngineAPI,
    mission: AirMissionTemplate | null
  ): readonly AirEscortTargetView[] {
    if (!mission || mission.kind !== "escort") {
      return [];
    }

    return engine.getScheduledAirMissions(engine.activeFaction)
      .filter((entry) => entry.kind === "strike" && entry.status === "queued")
      .map((entry) => {
        const origin = entry.originHexKey ?? this.resolveAirMissionOriginHex(engine, entry) ?? "";
        const target = entry.targetHex ? `${entry.targetHex.q},${entry.targetHex.r}` : "Target pending";
        return {
          value: origin,
          label: `${this.formatAirUnitLabel(entry.unitType)} Package`,
          detail: `Target ${target}`,
          meta: origin ? `Launch ${origin}` : "Launch strip unavailable"
        } satisfies AirEscortTargetView;
      })
      .filter((entry) => entry.value.length > 0);
  }

  private resolveAirPlannerSquadronId(unit: ScenarioUnit): string {
    return unit.unitId ?? `${String(unit.type)}@${axialKey(unit.hex)}`;
  }

  private resolveAirPlannerRadiusHex(engine: GameEngineAPI, unit: Pick<ScenarioUnit, "hex" | "type">): number | null {
    const engineRadius = engine.getAircraftCombatRadiusHex({ q: unit.hex.q, r: unit.hex.r });
    if (typeof engineRadius === "number") {
      return engineRadius;
    }
    const radiusKm = (unitTypesSource as Record<string, { airSupport?: { combatRadiusKm?: number } }>)[String(unit.type)]?.airSupport?.combatRadiusKm;
    if (typeof radiusKm === "number") {
      return Math.max(0, Math.floor(radiusKm / 0.25));
    }
    return null;
  }

  private resolveAirMissionOriginHex(engine: GameEngineAPI, mission: SerializedAirMission): string | null {
    if (mission.originHexKey) {
      return mission.originHexKey;
    }
    const deployed = engine.playerUnits ?? [];
    const reserves = (engine.reserveUnits ?? []).map((entry) => entry.unit as ScenarioUnit);
    const match = [...deployed, ...reserves].find((unit) => this.resolveAirPlannerSquadronId(unit) === mission.unitKey) ?? null;
    return match ? `${match.hex.q},${match.hex.r}` : null;
  }

  private updateAirSupportBriefFromPlanner(panel: HTMLElement, engine: GameEngineAPI, view: AirPlannerViewModel): void {
    const title = panel.querySelector<HTMLElement>("[data-air-brief-title]");
    const text = panel.querySelector<HTMLElement>("[data-air-brief-text]");
    const target = panel.querySelector<HTMLElement>("[data-air-brief-target]");
    const refit = panel.querySelector<HTMLElement>("[data-air-brief-refit]");

    if (title) {
      title.textContent = view.selectedMission?.label ?? "Standing Patrol Orders";
    }
    if (text) {
      text.textContent = view.selectedMission?.description
        ?? "Assign fighter cover, strike sorties, and emergency lifts from the sortie board.";
    }
    if (target) {
      target.textContent = this.describeAirBriefTarget(engine, view);
    }
    if (refit) {
      if (view.selectedSquadron?.refitTurns !== null && view.selectedSquadron?.refitTurns !== undefined) {
        const turns = view.selectedSquadron.refitTurns;
        refit.textContent = `${turns} turn${turns === 1 ? "" : "s"} of refit after sortie`;
      } else {
        refit.textContent = "Refit follows each sortie";
      }
    }
  }

  private describeAirBriefTarget(engine: GameEngineAPI, view: AirPlannerViewModel): string {
    const mission = view.selectedMission;
    if (!mission) {
      return "Mission board not ready";
    }
    if (mission.kind === "escort") {
      if (!this.airPlannerState.targetValue) {
        return "Queued bomber required";
      }
      const selected = view.escortTargets.find((entry) => entry.value === this.airPlannerState.targetValue);
      return selected ? `Escort ${selected.label}` : "Queued bomber required";
    }
    if (mission.kind === "airCover" && !this.airPlannerState.targetValue) {
      return "Base CAP over home strip";
    }
    if (this.airPlannerState.targetValue) {
      return this.describeAirTargetSelection(engine, mission.kind, this.airPlannerState.targetValue);
    }
    return mission.requiresTarget ? "Awaiting map-marked target" : "Optional assignment";
  }

  private renderAirTargetPanelMarkup(engine: GameEngineAPI, view: AirPlannerViewModel): string {
    const mission = view.selectedMission;
    if (!mission) {
      return `
        <div class="air-target-card">
          <span class="air-target-card__eyebrow">Target Board</span>
          <strong class="air-target-card__title">Orders unavailable</strong>
          <p class="air-target-card__detail">Mission data is unavailable until the battle engine is active.</p>
        </div>
      `;
    }

    if (mission.kind === "escort") {
      if (view.escortTargets.length === 0) {
        return `
          <div class="air-target-card">
            <span class="air-target-card__eyebrow">Escort Assignment</span>
            <strong class="air-target-card__title">No strike package awaiting cover</strong>
            <p class="air-target-card__detail">Queue a bomber strike first, then assign escorts to the package from this board.</p>
          </div>
        `;
      }

      return `
        <div class="air-target-card">
          <span class="air-target-card__eyebrow">Escort Assignment</span>
          <strong class="air-target-card__title">Queued strike packages</strong>
          <p class="air-target-card__detail">Choose the bomber stream this escort wing will protect.</p>
        </div>
        <div class="air-target-choice-grid">
          ${view.escortTargets.map((entry) => `
            <button
              type="button"
              class="air-target-choice"
              data-air-escort-target="${this.escapeHtml(entry.value)}"
              aria-pressed="${entry.value === this.airPlannerState.targetValue ? "true" : "false"}"
            >
              <span class="air-target-choice__copy">
                <span class="air-target-choice__label">${this.escapeHtml(entry.label)}</span>
                <span class="air-target-choice__detail">${this.escapeHtml(entry.detail)}</span>
                <span class="air-target-choice__meta">${this.escapeHtml(entry.meta)}</span>
              </span>
            </button>
          `).join("")}
        </div>
      `;
    }

    const targetSelected = this.airPlannerState.targetValue.length > 0;
    const title = targetSelected
      ? this.describeAirTargetSelection(engine, mission.kind, this.airPlannerState.targetValue)
      : mission.kind === "airCover"
        ? "Base CAP"
        : "Awaiting map mark";
    const detail = (() => {
      if (mission.kind === "airCover" && !targetSelected) {
        return "No patrol hex selected. The squadron will orbit its home strip and intercept raids over the base.";
      }
      if (!targetSelected) {
        return "Choose a hex on the map. The order board will reopen once the target is marked.";
      }
      if (mission.kind === "airTransport") {
        return "Airborne infantry will launch from the selected transport wing and drop into this marked hex.";
      }
      if (mission.kind === "airCover") {
        return "Combat air patrol will center on this hex instead of the squadron's base.";
      }
      return "Strike aircraft will stage their run against the selected hex when the mission executes.";
    })();
    const pickLabel = mission.kind === "airTransport"
      ? "Mark Drop Zone"
      : mission.kind === "airCover"
        ? "Choose Patrol Hex"
        : "Choose Target On Map";

    return `
      <div class="air-target-card">
        <span class="air-target-card__eyebrow">${this.escapeHtml(mission.kind === "airTransport" ? "Drop Zone" : "Target Board")}</span>
        <strong class="air-target-card__title">${this.escapeHtml(title)}</strong>
        <p class="air-target-card__detail">${this.escapeHtml(detail)}</p>
        <div class="air-target-actions">
          <button type="button" class="air-button" data-air-pick-target>${this.escapeHtml(pickLabel)}</button>
          ${mission.kind === "airCover"
            ? `<button type="button" class="air-button" data-air-clear-target ${targetSelected ? "" : "disabled"}>Use Base CAP</button>`
            : targetSelected
              ? `<button type="button" class="air-button" data-air-clear-target>Clear Mark</button>`
              : ""}
        </div>
      </div>
    `;
  }

  private syncAirPlannerFeedback(panel: HTMLElement, view: AirPlannerViewModel): void {
    const note = panel.querySelector<HTMLElement>("[data-air-order-note]");
    const liveRegion = panel.querySelector<HTMLElement>("[data-air-feedback]");
    const fallback = this.describeAirPlannerFallback(view);
    const message = this.airPlannerState.feedback || fallback.message;
    const tone = this.airPlannerState.feedback ? this.airPlannerState.feedbackTone : fallback.tone;

    if (note) {
      note.textContent = message;
      note.dataset.tone = tone;
    }
    if (liveRegion) {
      liveRegion.textContent = this.airPlannerState.feedback;
    }
  }

  private describeAirPlannerFallback(view: AirPlannerViewModel): { message: string; tone: AirPlannerFeedbackTone } {
    const mission = view.selectedMission;
    if (!mission) {
      return { message: "Air planner is unavailable until the battle engine is active.", tone: "warning" };
    }
    if (!view.selectedSquadron) {
      return { message: "No ready squadron is available for this mission profile.", tone: "warning" };
    }
    if (mission.kind === "escort" && view.escortTargets.length === 0) {
      return { message: "Queue a bomber strike first. Escort flights only attach to queued strike packages.", tone: "warning" };
    }
    if (mission.requiresFriendlyEscortTarget && !this.airPlannerState.targetValue) {
      return { message: "Choose which queued bomber package this escort wing will protect.", tone: "warning" };
    }
    if (mission.requiresTarget && !this.airPlannerState.targetValue) {
      return { message: "Mark a target on the map before issuing this sortie.", tone: "warning" };
    }
    if (mission.kind === "airCover" && !this.airPlannerState.targetValue) {
      return { message: "No patrol hex selected. The squadron will fly base CAP over its home strip.", tone: "neutral" };
    }
    return { message: "Orders post immediately to the operations log and commit the wing until recovery is complete.", tone: "neutral" };
  }

  private scheduleAirPlannerMission(engine: GameEngineAPI, view: AirPlannerViewModel): void {
    const mission = view.selectedMission;
    const squadron = view.selectedSquadron;
    if (!mission || !squadron) {
      this.setAirPlannerFeedback("Select a ready squadron before issuing orders.", "warning");
      this.renderAirSupportPanel();
      return;
    }

    const unitHex = this.parseAxialString(squadron.value);
    if (!unitHex) {
      this.setAirPlannerFeedback("The selected squadron does not have a valid launch hex.", "warning");
      this.renderAirSupportPanel();
      return;
    }

    const request: {
      kind: AirMissionKind;
      faction: TurnFaction;
      unitHex: { q: number; r: number };
      targetHex?: { q: number; r: number };
      escortTargetHex?: { q: number; r: number };
    } = {
      kind: mission.kind,
      faction: engine.activeFaction,
      unitHex
    };

    const parsedTarget = this.parseAxialString(this.airPlannerState.targetValue);
    if (mission.requiresTarget && !parsedTarget) {
      this.setAirPlannerFeedback("Mark a target on the map before issuing this sortie.", "warning");
      this.renderAirSupportPanel();
      return;
    }
    if (mission.requiresFriendlyEscortTarget && !parsedTarget) {
      this.setAirPlannerFeedback("Choose the bomber package this escort wing will protect.", "warning");
      this.renderAirSupportPanel();
      return;
    }

    if ((mission.requiresTarget || mission.kind === "airCover") && parsedTarget) {
      request.targetHex = parsedTarget;
    }
    if (mission.requiresFriendlyEscortTarget && parsedTarget) {
      request.escortTargetHex = parsedTarget;
    }

    const result = engine.tryScheduleAirMission(request);
    if (!result.ok) {
      this.setAirPlannerFeedback(result.reason, "warning");
      this.renderAirSupportPanel();
      return;
    }

    this.setAirPlannerFeedback(`${this.formatAirMissionKindLabel(mission.kind)} posted to the operations log.`, "success");
    this.renderAirSupportPanel();
    this.battleState.emitBattleUpdate("missionUpdated");
  }

  private beginAirTargetSelection(view: AirPlannerViewModel): void {
    const squadron = view.selectedSquadron;
    if (!squadron) {
      this.setAirPlannerFeedback("Select a ready squadron before marking a target.", "warning");
      this.renderAirSupportPanel();
      return;
    }

    const origin = this.parseAxialString(squadron.value);
    const radius = squadron.combatRadiusHex;
    if (origin && typeof radius === "number" && radius > 0) {
      document.dispatchEvent(new CustomEvent("air:previewRange", { detail: { origin, radius } }));
    } else {
      document.dispatchEvent(new CustomEvent("air:clearPreview"));
    }

    this.airPickMode = "target";
    this.airPlannerState.suspendedForMapPick = true;
    this.popupLayer.classList.add("hidden");
    this.popupLayer.setAttribute("aria-hidden", "true");
    this.setAirPlannerFeedback("Map selection in progress.", "neutral");
  }

  private resumeAirSupportPopupFromMapPick(): void {
    if (this.activePopup !== "airSupport") {
      return;
    }
    this.airPlannerState.suspendedForMapPick = false;
    this.popupDialog.dataset.popupKey = "airSupport";
    this.popupLayer.classList.remove("hidden");
    this.popupLayer.setAttribute("aria-hidden", "false");
    this.renderAirSupportPanel();
    this.popupDialog.focus();
  }

  private describeAirTargetSelection(engine: GameEngineAPI, kind: AirMissionKind, value: string): string {
    if (!value) {
      return kind === "airCover" ? "Base CAP" : "Awaiting map mark";
    }

    const target = this.parseAxialString(value);
    if (!target) {
      return value;
    }

    if (kind === "strike") {
      const enemy = (engine.botUnits ?? []).find((unit) => unit.hex.q === target.q && unit.hex.r === target.r);
      return enemy ? `${this.formatAirUnitLabel(String(enemy.type))} @ ${value}` : `Strike Hex ${value}`;
    }
    if (kind === "airTransport") {
      return `Drop Zone ${value}`;
    }
    const friendly = (engine.playerUnits ?? []).find((unit) => unit.hex.q === target.q && unit.hex.r === target.r);
    return friendly ? `${this.formatAirUnitLabel(String(friendly.type))} @ ${value}` : `Patrol Hex ${value}`;
  }

  private formatAirUnitLabel(rawType: string): string {
    return rawType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private formatAirRoleLabel(role: string): string {
    switch (role) {
      case "cap":
        return "CAP";
      case "strike":
        return "Strike";
      case "escort":
        return "Escort";
      case "transport":
        return "Transport";
      case "recon":
        return "Recon";
      default:
        return this.formatAirUnitLabel(role);
    }
  }

  private buildAirUnitMonogram(rawType: string): string {
    return this.formatAirUnitLabel(rawType)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0])
      .join("");
  }

  /** Renders the mission roster with cancel actions for queued sorties. */
  private renderAirMissionList(list: HTMLUListElement, engine: GameEngineAPI): void {
    const missions = engine.getScheduledAirMissions();
    if (!missions || missions.length === 0) {
      list.innerHTML = '<li class="air-mission-empty">No sorties queued. Air wings remain on standby until new orders are issued.</li>';
      return;
    }
    const resolveSquadronLabel = (squadronId: string | undefined): string => {
      if (!squadronId) {
        return "—";
      }

      const deployed = [...(engine.playerUnits ?? []), ...(engine.botUnits ?? [])];
      const reserves = (engine.reserveUnits ?? []).map((entry) => entry.unit);
      const allUnits = [...deployed, ...reserves];
      const match = allUnits.find((unit) => unit.unitId === squadronId) ?? null;
      if (!match) {
        console.error("[PopupManager] Unable to resolve squadron id for Air Support label", {
          squadronId,
          deployedCount: deployed.length,
          reserveCount: reserves.length
        });
        return "Unknown squadron";
      }
      return `${String(match.type)} @ ${match.hex.q},${match.hex.r}`;
    };
    const compose = (m: { id: string; kind: string; status: string; unitType: string; originHexKey?: string; launchTurn: number; turnsRemaining: number; targetHex?: { q: number; r: number }; escortTargetUnitKey?: string; outcome?: { result: string; details: string; damageInflicted?: number; defenderDestroyed?: boolean; defenderType?: string } }): string => {
      const status = m.status;
      const kindLabel = this.formatAirMissionKindLabel(m.kind);
      const statusLabel = this.formatAirMissionStatusLabel(status);
      // Show "Base CAP" for Air Cover missions without a specific target hex.
      let target: string;
      if (m.targetHex) {
        target = `${m.targetHex.q},${m.targetHex.r}`;
      } else if (m.kind === "airCover") {
        target = "Base CAP";
      } else {
        target = resolveSquadronLabel(m.escortTargetUnitKey);
      }
      const origin = m.originHexKey ?? "Airbase";
      const cancel = status === "queued" ? `<button type="button" class="air-button" data-air-cancel="${m.id}">Cancel</button>` : "";

      // Build outcome display for completed missions
      let outcomeMarkup = "";
      if (status === "completed" && m.outcome) {
        const resultClass = m.outcome.result === "success" ? "air-badge--success" : m.outcome.result === "aborted" ? "air-badge--aborted" : "air-badge--partial";
        const damageText = typeof m.outcome.damageInflicted === "number" ? ` (${m.outcome.damageInflicted} dmg)` : "";
        const destroyedText = m.outcome.defenderDestroyed ? " — Target destroyed!" : "";
        outcomeMarkup = `
          <div class="air-mission-outcome">
            <span class="air-badge ${resultClass}">${this.escapeHtml(m.outcome.result.toUpperCase())}</span>
            <span class="air-outcome-details">${this.escapeHtml(m.outcome.details)}${damageText}${destroyedText}</span>
          </div>`;
      }

      return `
        <li class="air-mission-item">
          <div class="air-mission-head">
            <div class="air-mission-title">
              <strong>${this.escapeHtml(kindLabel)}</strong>
              <span class="air-mission-subtitle">${this.escapeHtml(String(m.unitType))}</span>
            </div>
            <span class="air-badge air-badge--${this.escapeHtml(this.formatAirMissionStatusClass(status))}">${this.escapeHtml(statusLabel)}</span>
          </div>
          <div class="air-mission-grid">
            <div class="air-mission-fact">
              <span class="air-mission-label">Origin</span>
              <strong>${this.escapeHtml(origin)}</strong>
            </div>
            <div class="air-mission-fact">
              <span class="air-mission-label">Target</span>
              <strong>${this.escapeHtml(target)}</strong>
            </div>
            <div class="air-mission-fact">
              <span class="air-mission-label">Launch Turn</span>
              <strong>${this.escapeHtml(String(m.launchTurn))}</strong>
            </div>
            <div class="air-mission-fact">
              <span class="air-mission-label">Turns Remaining</span>
              <strong>${this.escapeHtml(String(m.turnsRemaining))}</strong>
            </div>
          </div>
          <div class="air-mission-actions">
            ${cancel}
          </div>
          ${outcomeMarkup}
        </li>`;
    };
    list.innerHTML = missions.map((m) => compose(m)).join("");

    // Bind cancel buttons after render
    list.querySelectorAll<HTMLButtonElement>("[data-air-cancel]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-air-cancel") ?? "";
        if (!id) return;
        const ok = engine.cancelQueuedAirMission(id);
        if (ok) {
          this.renderAirSupportPanel();
          this.battleState.emitBattleUpdate("missionUpdated");
        }
      };
    });
  }

  private formatAirMissionKindLabel(kind: string): string {
    switch (kind) {
      case "strike":
        return "Strike Target";
      case "escort":
        return "Escort Sortie";
      case "airCover":
        return "Air Cover";
      case "airTransport":
        return "Air Transport";
      default:
        return kind;
    }
  }

  private formatAirMissionStatusLabel(status: string): string {
    switch (status) {
      case "inFlight":
        return "In Flight";
      case "queued":
        return "Queued";
      case "resolving":
        return "On Run";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  }

  private formatAirMissionStatusClass(status: string): string {
    switch (status) {
      case "inFlight":
        return "inflight";
      case "queued":
      case "resolving":
      case "completed":
        return status;
      default:
        return status.toLowerCase();
    }
  }

  /** Parses "q,r" into an axial coordinate. Returns null when invalid. */
  private parseAxialString(value: string): { q: number; r: number } | null {
    if (!value) return null;
    const parts = value.split(",").map((s) => s.trim());
    if (parts.length !== 2) return null;
    const q = Number(parts[0]);
    const r = Number(parts[1]);
    if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
    return { q, r };
  }

  /** Handles map clicks when Air Support panel is in pick mode (target/escort). */
  private onBattleHexClicked(event: CustomEvent<{ offsetKey: string }>): void {
    const key = event.detail?.offsetKey ?? "";
    const parts = key.split(",");
    if (parts.length !== 2) {
      this.airPickMode = null;
      this.intelPickMode = null;
      return;
    }
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      this.airPickMode = null;
      this.intelPickMode = null;
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(col, row);
    const value = `${axial.q},${axial.r}`;

    if (this.activePopup === "intelligence" && this.intelPickMode === "deception") {
      try {
        const engine = this.battleState.ensureGameEngine();
        const result = engine.deployCounterIntel(axial);
        if (!result.ok) {
          this.setIntelFeedback(result.reason);
          return;
        }
        this.intelPickMode = null;
        this.setIntelFeedback(`Deception screen projected at ${value}. Enemy planning will now bias toward that false axis.`);
        this.refreshReconIntelSnapshot();
      } catch (error) {
        console.warn("PopupManager: Failed to deploy counter-intelligence.", error);
        this.setIntelFeedback("Counter-intelligence is unavailable until the battle engine is active.");
      }
      return;
    }

    if (this.activePopup !== "airSupport" || !this.airPickMode) {
      return;
    }

    this.airPlannerState.targetValue = value;
    this.setAirPlannerFeedback(`Marked ${value} on the map.`, "success");
    document.dispatchEvent(new CustomEvent("air:clearPreview"));
    this.airPickMode = null;
    if (this.airPlannerState.suspendedForMapPick) {
      this.resumeAirSupportPopupFromMapPick();
    } else {
      this.renderAirSupportPanel();
    }
  }

  /**
   * Opens the base operations popup (war room overlay).
   * This is a special popup that uses the WarRoomOverlay component instead of the standard popup layer.
   */
  private openBaseOperationsPopup(key: PopupKey, trigger?: HTMLButtonElement): void {
    // Hide the standard popup layer when opening war room
    this.hidePopupLayer();

    // Set active state before opening war room
    this.activePopup = key;
    this.lastTriggerButton = trigger ?? null;
    this.syncSidebarButtons(key);

    this.warRoomOverlay?.open();
  }

  /**
   * Opens the recon popup and renders last-turn reconnaissance reports.
   */
  private openReconPopup(key: PopupKey, trigger?: HTMLButtonElement): void {
    const content = getPopupContent("recon");
    if (!content) {
      console.warn("Recon popup content is not registered.");
      return;
    }

    this.showPopup(key, content, trigger);
    this.reconIntelSnapshot = this.requestReconIntelSnapshot();
    this.renderReconPanel();
  }

  /**
   * Opens the intelligence popup and hydrates it with analyst briefs and alerts.
   */
  private openIntelPopup(key: PopupKey, trigger?: HTMLButtonElement): void {
    const content = getPopupContent("intelligence");
    if (!content) {
      console.warn("Intelligence popup content is not registered.");
      return;
    }

    this.showPopup(key, content, trigger);

    this.reconIntelTimeframe = "all";
    this.reconIntelConfidence = "all";
    this.intelPickMode = null;
    this.intelFeedbackMessage = "";
    this.reconIntelSnapshot = this.requestReconIntelSnapshot();

    this.initializeIntelPanel();
  }

  /**
   * Hides the popup layer.
   */
  private hidePopupLayer(): void {
    this.popupLayer.classList.add("hidden");
    this.popupLayer.setAttribute("aria-hidden", "true");
    delete this.popupDialog.dataset.popupKey;
  }

  /**
   * Syncs sidebar button active states.
   */
  private syncSidebarButtons(targetKey: PopupKey | null): void {
    this.sidebarController?.syncActiveState(targetKey);
  }

  /**
   * Registers the sidebar controller so popup transitions can update active button indicators centrally.
   */
  public registerSidebarController(controller: SidebarController): void {
    this.sidebarController = controller;
    controller.syncActiveState(this.activePopup);
  }

  /**
   * Builds a roster snapshot summarizing deployed units, reserves, and exhausted allocations.
   * Pulls mirror data directly from DeploymentState so reserve counts reflect the live engine snapshot.
   */
  public buildRosterSnapshot(): RosterSnapshot {
    const battleSnapshot = this.pullBattleRosterSnapshot();
    if (!battleSnapshot) {
      return {
        deployed: [],
        reserves: [],
        support: [],
        exhausted: [],
        totalDeployed: 0,
        totalReserves: 0,
        totalSupport: 0
      } satisfies RosterSnapshot;
    }

    const frontlineEntries = battleSnapshot.frontline.map((unit) => this.transformRosterUnit(unit, "deployed"));

    const airReserveUnits = battleSnapshot.reserves.filter((unit) => this.isAirRosterUnit(unit));
    const groundReserveUnits = battleSnapshot.reserves.filter((unit) => !this.isAirRosterUnit(unit));

    const reserveEntries = groundReserveUnits.map((unit) => this.transformRosterUnit(unit, "reserves"));

    const engineSupportEntries = battleSnapshot.support.map((unit) => this.transformRosterUnit(unit, "support"));
    const airSupportEntries = airReserveUnits.map((unit) => this.transformRosterUnit(unit, "support", "Air Support"));
    const supportEntries = [...engineSupportEntries, ...airSupportEntries];

    const totalDeployed = frontlineEntries.length;
    const totalReserves = reserveEntries.length;
    const totalSupport = supportEntries.length;

    return {
      deployed: frontlineEntries,
      reserves: reserveEntries,
      support: supportEntries,
      exhausted: battleSnapshot.casualties.map((unit) => this.transformRosterUnit(unit, "exhausted")),
      totalDeployed,
      totalReserves,
      totalSupport
    } satisfies RosterSnapshot;
  }

  /**
   * Renders army roster content (placeholder).
   */
  private renderArmyRoster(): void {
    const rosterContainer = this.popupBody.querySelector<HTMLElement>("#armyRosterContent") ?? this.popupBody;
    const snapshot = this.buildRosterSnapshot();

    rosterContainer.innerHTML = `
      <section class="army-roster-summary">
        <p>Total deployed: <strong>${snapshot.totalDeployed}</strong></p>
        <p>Reserves remaining: <strong>${snapshot.totalReserves}</strong></p>
        <p>Support units: <strong>${snapshot.totalSupport}</strong></p>
      </section>
      <section class="army-roster-section" data-roster-section="frontline">
        <header><h4>Frontline</h4></header>
        <ul class="army-roster-list" data-roster-list="frontline"></ul>
      </section>
      <section class="army-roster-section" data-roster-section="reserves">
        <header>
          <h4>Reserves</h4>
          <p class="army-roster-note">Reserve call-ups arrive at base camp automatically during battle.</p>
        </header>
        <ul class="army-roster-list" data-roster-list="reserves"></ul>
      </section>
      <section class="army-roster-section" data-roster-section="support">
        <header><h4>Support Units</h4></header>
        <ul class="army-roster-list" data-roster-list="support"></ul>
      </section>
      <section class="army-roster-section" data-roster-section="exhausted">
        <header><h4>Exhausted</h4></header>
        <ul class="army-roster-list" data-roster-list="exhausted"></ul>
      </section>
    `;

    this.renderRosterSection(rosterContainer, "frontline", snapshot.deployed);
    this.renderRosterSection(rosterContainer, "reserves", snapshot.reserves);
    this.renderRosterSection(rosterContainer, "support", snapshot.support);
    this.renderRosterSection(rosterContainer, "exhausted", snapshot.exhausted);
  }

  private renderRosterSection(container: HTMLElement, listKey: "frontline" | "reserves" | "support" | "exhausted", entries: RosterSnapshotEntry[]): void {
    const list = container.querySelector<HTMLUListElement>(`[data-roster-list="${listKey}"]`);
    if (!list) {
      return;
    }
    if (entries.length === 0) {
      list.innerHTML = "<li class=\"army-roster-empty\">No units recorded.</li>";
      return;
    }
    list.innerHTML = entries
      .map((entry) => this.composeRosterEntryMarkup(entry))
      .join("");

    if (listKey === "reserves") {
      // Bind click handler for the entire row (for backwards compatibility and keyboard users)
      list.querySelectorAll<HTMLElement>(".army-roster-entry.reserves-selectable")
        .forEach((element) => {
          element.addEventListener("click", (event) => {
            // Don't trigger if clicking the deploy button directly
            const target = event.target as HTMLElement;
            if (target.closest("[data-roster-deploy]")) {
              return;
            }
            const unitKey = element.dataset.unitKey;
            if (!unitKey) {
              return;
            }
            document.dispatchEvent(new CustomEvent("battle:selectReserve", { detail: { unitKey } }));
          });
        });

      // Bind click handler for deploy buttons
      list.querySelectorAll<HTMLButtonElement>("[data-roster-deploy]")
        .forEach((button) => {
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            const unitKey = button.dataset.rosterDeploy;
            if (!unitKey) {
              return;
            }
            document.dispatchEvent(new CustomEvent("battle:selectReserve", { detail: { unitKey } }));
          });
        });
    }
  }

  private composeRosterEntryMarkup(entry: RosterSnapshotEntry): string {
    const spriteMarkup = entry.sprite
      ? `<img src="${this.escapeHtml(entry.sprite)}" alt="" class="reserve-thumb" aria-hidden="true" />`
      : `<span class="reserve-thumb reserve-thumb--fallback" aria-hidden="true">${this.escapeHtml(this.extractInitials(entry.label))}</span>`;

    const fuelCopy = entry.fuel == null ? "—" : `${entry.fuel}`;
    const statusCopy = entry.status === "deployed"
      ? "Frontline"
      : entry.status === "reserves"
        ? "Reserve"
        : entry.status === "support"
          ? (entry.supportCategory ?? "Support")
          : "Out of action";
    const statusClass = entry.status === "deployed"
      ? "army-roster-status--frontline"
      : entry.status === "reserves"
        ? "army-roster-status--reserve"
        : entry.status === "support"
          ? "army-roster-status--support"
          : "army-roster-status--exhausted";

    // Present roster stats as condensed inline chips so each entry fits within a two-line layout.
    // Color-coded classes help commanders quickly identify units needing attention.
    const getStatClass = (key: string, value: number | string): string => {
      if (typeof value === "string") return "";
      if (key === "STR") {
        if (value <= 25) return " army-roster-stat--critical";
        if (value <= 50) return " army-roster-stat--warning";
        if (value >= 90) return " army-roster-stat--good";
      }
      if (key === "AMMO") {
        if (value <= 1) return " army-roster-stat--critical";
        if (value <= 3) return " army-roster-stat--warning";
        if (value >= 8) return " army-roster-stat--good";
      }
      if (key === "FUEL" && typeof value === "number") {
        if (value <= 10) return " army-roster-stat--critical";
        if (value <= 25) return " army-roster-stat--warning";
        if (value >= 60) return " army-roster-stat--good";
      }
      if (key === "CHARGES") {
        if (value === 0) return " army-roster-stat--critical";
        if (value <= 1) return " army-roster-stat--warning";
        if (value >= 3) return " army-roster-stat--good";
      }
      return "";
    };

    // Off-map support assets (not Air Support) use different metrics: charges instead of standard unit stats.
    // Detect them by checking if it's a support entry with low/abnormal strength values (charges) and no fuel.
    const isOffMapSupport = entry.status === "support" && entry.supportCategory !== "Air Support" && entry.strength < 10 && entry.fuel == null;

    let statsMarkup: string;
    if (isOffMapSupport) {
      // Off-map support assets show charges and status only
      const chargesClass = getStatClass("CHARGES", entry.strength);
      statsMarkup = `<span class="army-roster-stat${chargesClass}"><abbr title="Charges Remaining">CHARGES</abbr><strong>${entry.strength}</strong></span>`;
    } else {
      // Normal units and air support show full stats
      const metrics = [
        { key: "STR", title: "Strength", value: entry.strength },
        { key: "EXP", title: "Experience", value: entry.experience },
        { key: "AMMO", title: "Ammo", value: entry.ammo },
        { key: "FUEL", title: "Fuel", value: entry.fuel ?? fuelCopy }
      ];
      statsMarkup = metrics
        .map((metric) => {
          const displayValue = metric.key === "FUEL" && entry.fuel == null ? "—" : String(metric.value);
          const statClass = getStatClass(metric.key, metric.value);
          return `<span class="army-roster-stat${statClass}"><abbr title="${this.escapeHtml(metric.title)}">${metric.key}</abbr><strong>${this.escapeHtml(displayValue)}</strong></span>`;
        })
        .join("");
    }

    const selectableClass = entry.status === "reserves" ? " reserves-selectable" : "";

    // Add deploy button for reserve units
    const deployButtonMarkup = entry.status === "reserves"
      ? `<button type="button" class="roster-deploy-btn" data-roster-deploy="${this.escapeHtml(entry.unitKey)}" aria-label="Deploy ${this.escapeHtml(entry.label)} from reserves to base camp" title="Reserve call-ups arrive at base camp automatically">Deploy</button>`
      : "";

    return `
      <li class="army-roster-item">
        <div class="army-roster-entry reserve-item${selectableClass}" data-unit-key="${this.escapeHtml(entry.unitKey)}">
          <div class="reserve-visual">${spriteMarkup}</div>
          <div class="reserve-copy">
            <div class="army-roster-line">
              <strong>${this.escapeHtml(entry.label)}</strong>
              <span class="army-roster-status ${statusClass}">${this.escapeHtml(statusCopy)}</span>
            </div>
            <div class="army-roster-stats">${statsMarkup}</div>
          </div>
          ${deployButtonMarkup ? `<div class="roster-actions">${deployButtonMarkup}</div>` : ""}
        </div>
      </li>
    `;
  }

  /** Returns true when roster should refresh on a battle update. */
  private shouldRefreshRosterPanel(reason: BattleUpdateReason): boolean {
    return ["deploymentUpdated", "turnAdvanced", "engineInitialized", "manual"].includes(reason);
  }

  private renderGeneralProfile(): void {
    const container = this.popupBody.querySelector<HTMLElement>("#generalProfileContent");
    if (!container) {
      return;
    }

    const profile = this.resolvePrimaryGeneral();
    const portraitElement = container.querySelector<HTMLElement>("#generalProfilePortrait");
    const summaryElement = container.querySelector<HTMLElement>("#generalProfileSummary");
    const statsElement = container.querySelector<HTMLElement>("#generalProfileStats");
    const traitsElement = container.querySelector<HTMLElement>("#generalProfileTraits");
    const directivesElement = container.querySelector<HTMLElement>("#generalProfileDirectives");
    const historyElement = container.querySelector<HTMLElement>("#generalProfileHistory");

    if (!profile) {
      this.applyGeneralPortraitFallback(portraitElement, null);
      summaryElement && (summaryElement.textContent = "No commanding officer assigned. Commission a general to unlock doctrine insights.");
      statsElement && (statsElement.innerHTML = '<div class="general-profile__empty">Command modifiers will appear after a commander is assigned.</div>');
      traitsElement && (traitsElement.innerHTML = '<li class="general-profile__empty">Command traits are unavailable without an active commander.</li>');
      directivesElement && (directivesElement.innerHTML = '<li class="general-profile__empty">Strategic directives will populate after campaign briefing.</li>');
      historyElement && (historyElement.textContent = "Service notes will display once a commissioned general accumulates operational history.");
      return;
    }

    this.applyGeneralPortraitFallback(portraitElement, profile);
    summaryElement && (summaryElement.textContent = this.composeGeneralSummary(profile));
    const commanderBenefits = this.resolveCommanderBenefits(profile);
    statsElement && (statsElement.innerHTML = this.composeGeneralStatMarkup(profile, commanderBenefits));
    traitsElement && (traitsElement.innerHTML = this.composeGeneralTraitMarkup(profile));
    directivesElement && (directivesElement.innerHTML = this.composeGeneralDirectiveMarkup(profile));
    historyElement && (historyElement.textContent = this.composeGeneralHistory(profile));
  }

  private resolvePrimaryGeneral(): GeneralRosterEntry | null {
    const battleState = ensureBattleState();
    try {
      const assigned = battleState.getAssignedCommanderProfile();
      if (assigned) {
        return assigned;
      }
    } catch (error) {
      console.warn("PopupManager: Unable to resolve assigned commander profile.", error);
    }

    const generals = getAllGenerals();
    return generals.length > 0 ? generals[0] : null;
  }

  private applyGeneralPortraitFallback(element: HTMLElement | null, profile: GeneralRosterEntry | null): void {
    if (!element) {
      return;
    }

    const portraitUrl = (profile as Partial<{ portraitUrl: string }> | null)?.portraitUrl ?? null;
    element.style.backgroundImage = portraitUrl ? `url(${portraitUrl})` : "";
    element.style.backgroundSize = portraitUrl ? "cover" : "";
    element.textContent = "";

    if (!portraitUrl) {
      const initials = profile ? this.extractInitials(profile.identity.name) : "?";
      element.textContent = initials;
    }
  }

  private composeGeneralSummary(profile: GeneralRosterEntry): string {
    const { identity } = profile;
    const parts: string[] = [];
    if (identity.rank) {
      parts.push(identity.rank);
    }
    parts.push(identity.name);
    if (identity.affiliation) {
      parts.push(`— ${identity.affiliation}`);
    }
    if (identity.commissionedAt) {
      parts.push(`(Commissioned ${this.formatDate(identity.commissionedAt)})`);
    }
    return parts.join(" ");
  }

  private composeGeneralStatMarkup(profile: GeneralRosterEntry, activeBenefits: CommanderBenefits): string {
    const descriptors: Array<{
      key: keyof CommanderBenefits;
      title: string;
      description: string;
    }> = [
      {
        key: "accBonus",
        title: "Accuracy",
        description: "Multiplies final hit probability by the listed percentage."
      },
      {
        key: "dmgBonus",
        title: "Damage",
        description: "Boosts per-hit damage by the listed percentage."
      },
      {
        key: "moveBonus",
        title: "Mobility",
        description: "Increases movement allowance by the listed percentage."
      },
      {
        key: "supplyBonus",
        title: "Supply",
        description: "Reduces upkeep draw and out-of-supply attrition by the listed percentage."
      }
    ];

    const rosterStats = profile.stats;

    return descriptors
      .map(({ key, title, description }) => {
        const rosterValue = rosterStats[key] ?? 0;
        const activeValue = activeBenefits[key] ?? rosterValue;
        const formattedActive = this.formatModifier(activeValue);
        const deltaNote = activeValue !== rosterValue
          ? ` (Roster baseline ${this.formatModifier(rosterValue)})`
          : "";

        return `
          <div class="general-profile__benefit">
            <dt>${this.escapeHtml(`${title} Bonus`)}</dt>
            <dd>
              <span class="general-profile__benefit-value">${formattedActive}</span>
              <span class="general-profile__benefit-detail">${this.escapeHtml(description)}${this.escapeHtml(deltaNote)}</span>
            </dd>
          </div>
        `;
      })
      .join("");
  }

  /**
   * Retrieves commander modifiers from the live engine when available so the panel mirrors in-battle effects.
   * Falls back to roster stats when the engine is offline (e.g., pre-initialization) to keep copy meaningful.
   */
  private resolveCommanderBenefits(profile: GeneralRosterEntry): CommanderBenefits {
    try {
      if (this.battleState.hasEngine()) {
        const engine = this.battleState.ensureGameEngine();
        return engine.getCommanderBenefits();
      }
    } catch (error) {
      console.warn("PopupManager: Unable to pull commander benefits from GameEngine, using roster stats.", error);
    }

    return {
      accBonus: profile.stats.accBonus ?? 0,
      dmgBonus: profile.stats.dmgBonus ?? 0,
      moveBonus: profile.stats.moveBonus ?? 0,
      supplyBonus: profile.stats.supplyBonus ?? 0
    } satisfies CommanderBenefits;
  }

  /**
   * Formats the rolling supply ledger so commanders can audit production, shipments, and upkeep drains per turn.
   */
  private composeSupplyLedgerMarkup(entries: SupplySnapshot["ledger"]): string {
    if (!entries || entries.length === 0) {
      return '<li class="supplies-ledger__empty">Ledger is empty for this faction.</li>';
    }

    return entries
      .slice(0, 12)
      .map((entry) => {
        const direction = entry.delta >= 0 ? "+" : "-";
        const amount = this.formatQuantity(Math.abs(entry.delta));
        const resourceLabel = this.resolveResourceLabel(entry.type as SupplyResourceKey);
        const timestamp = this.formatDate(entry.timestamp);
        return `
          <li class="supplies-ledger__entry" data-supplies-ledger-entry="${entry.type}">
            <span class="supplies-ledger__delta supplies-ledger__delta--${entry.delta >= 0 ? "positive" : "negative"}">
              ${direction}${amount}
            </span>
            <span class="supplies-ledger__resource">${resourceLabel}</span>
            <span class="supplies-ledger__reason">${this.escapeHtml(entry.reason)}</span>
            <time class="supplies-ledger__timestamp" datetime="${entry.timestamp}">${timestamp}</time>
          </li>
        `;
      })
      .join("");
  }

  private composeGeneralTraitMarkup(profile: GeneralRosterEntry): string {
    const traits: string[] = [];
    const { identity, stats } = profile;

    if (identity.schoolLabel) {
      traits.push(`${identity.schoolLabel} Graduate`);
    }
    if (identity.regionLabel) {
      traits.push(`${identity.regionLabel} Theater Veteran`);
    }

    const focusTrait = this.resolveFocusTrait(stats);
    if (focusTrait) {
      traits.push(focusTrait);
    }

    if (traits.length === 0) {
      return '<li class="general-profile__empty">Command traits will unlock after doctrine is assigned.</li>';
    }

    return traits.map((trait) => `<li>${trait}</li>`).join("");
  }

  private composeGeneralDirectiveMarkup(profile: GeneralRosterEntry): string {
    const directives: Array<{ heading: string; detail: string }> = [];
    const { identity, serviceRecord } = profile;

    if (identity.commissionedAt) {
      directives.push({
        heading: `Commissioned ${this.formatDate(identity.commissionedAt)}`,
        detail: "Authorized to lead frontline operations."
      });
    }

    if (serviceRecord) {
      directives.push({
        heading: "Operational Readiness",
        detail: `${serviceRecord.missionsCompleted} missions completed • ${serviceRecord.victoriesAchieved} victories`
      });
    }

    if (directives.length === 0) {
      return '<li class="general-profile__empty">No active directives recorded for this commander.</li>';
    }

    return directives
      .map((directive) => `
        <li>
          <strong>${directive.heading}</strong>
          <div class="general-profile__history">${directive.detail}</div>
        </li>
      `)
      .join("");
  }

  private composeGeneralHistory(profile: GeneralRosterEntry): string {
    const parts: string[] = [];
    const { serviceRecord, identity, missionHistory } = profile;

    if (serviceRecord) {
      parts.push(
        `${identity.name} has led ${serviceRecord.missionsCompleted} mission${serviceRecord.missionsCompleted === 1 ? "" : "s"} with ${serviceRecord.victoriesAchieved} victory${serviceRecord.victoriesAchieved === 1 ? "" : "ies"}.`
      );
      parts.push(`Total units deployed: ${serviceRecord.unitsDeployed}. Total casualties: ${serviceRecord.casualtiesSustained}.`);

      // Add detailed mission history if available
      if (missionHistory && missionHistory.length > 0) {
        parts.push("\n\n<strong>Recent Operations:</strong>");

        // Show last 5 missions in reverse chronological order
        const recentMissions = missionHistory.slice(-5).reverse();

        for (const mission of recentMissions) {
          parts.push(this.formatMissionRecord(mission));
        }
      }
    } else {
      parts.push("Operational history is still being compiled for this commander.");
    }

    if (identity.schoolLabel) {
      parts.push(`\n${identity.name} is a graduate of ${identity.schoolLabel}, reinforcing doctrinal discipline.`);
    }

    return parts.join(" ");
  }

  private formatMissionRecord(mission: any): string {
    const parts: string[] = [];
    const date = new Date(mission.completedAt).toLocaleDateString();
    const outcome = mission.success ? "✓ VICTORY" : "✗ DEFEAT";
    const outcomeColor = mission.success ? "#4ade80" : "#f87171";

    parts.push(`\n<div style="margin: 12px 0; padding: 12px; background: rgba(0,0,0,0.3); border-left: 3px solid ${outcomeColor}; border-radius: 4px;">`);
    parts.push(`<strong style="color: ${outcomeColor};">${outcome}</strong> • ${mission.missionTitle} • ${date}`);
    parts.push(`<br><span style="color: rgba(255,255,255,0.6); font-size: 0.85em;">${mission.turnsElapsed} turns</span>`);

    // Objectives
    const obj = mission.objectives;
    if (obj.primaryTotal > 0 || obj.secondaryTotal > 0 || obj.tertiaryTotal > 0) {
      parts.push(`<br><strong>Objectives:</strong>`);
      if (obj.primaryTotal > 0) {
        parts.push(` Primary ${obj.primaryCompleted}/${obj.primaryTotal}`);
      }
      if (obj.secondaryTotal > 0) {
        parts.push(` • Secondary ${obj.secondaryCompleted}/${obj.secondaryTotal}`);
      }
      if (obj.tertiaryTotal > 0) {
        parts.push(` • Tertiary ${obj.tertiaryCompleted}/${obj.tertiaryTotal}`);
      }
    }

    // Casualties
    const totalCasualties = mission.casualties.reduce((sum: number, c: any) => sum + c.count, 0);
    if (totalCasualties > 0) {
      const topCasualties = mission.casualties.slice(0, 3).map((c: any) => `${c.type} (${c.count})`).join(", ");
      parts.push(`<br><strong style="color: #f87171;">Casualties (${totalCasualties}):</strong> ${topCasualties}`);
    }

    // Enemies destroyed
    const totalDestroyed = mission.enemiesDestroyed.reduce((sum: number, e: any) => sum + e.count, 0);
    if (totalDestroyed > 0) {
      const topDestroyed = mission.enemiesDestroyed.slice(0, 3).map((e: any) => `${e.type} (${e.count})`).join(", ");
      parts.push(`<br><strong style="color: #4ade80;">Destroyed (${totalDestroyed}):</strong> ${topDestroyed}`);
    }

    // Ammunition
    const ammo = mission.ammunition;
    const ammoUsed: string[] = [];
    if (ammo.bombsDropped > 0) ammoUsed.push(`${ammo.bombsDropped} bombs`);
    if (ammo.artilleryShellsFired > 0) ammoUsed.push(`${ammo.artilleryShellsFired} artillery`);
    if (ammo.rocketsFired > 0) ammoUsed.push(`${ammo.rocketsFired} rockets`);
    if (ammoUsed.length > 0) {
      parts.push(`<br><strong>Ammunition:</strong> ${ammoUsed.join(", ")}`);
    }

    parts.push(`</div>`);

    return parts.join("");
  }

  private resolveFocusTrait(stats: GeneralRosterEntry["stats"]): string | null {
    const statEntries: Array<{ key: keyof GeneralRosterEntry["stats"]; label: string }> = [
      { key: "accBonus", label: "Marksman Doctrine" },
      { key: "dmgBonus", label: "Shock Assault Planner" },
      { key: "moveBonus", label: "Rapid Maneuver Expert" },
      { key: "supplyBonus", label: "Logistics Savant" }
    ];

    const strongest = statEntries.reduce<{ label: string; value: number } | null>((current, entry) => {
      const value = stats[entry.key];
      if (!current || value > current.value) {
        return { label: entry.label, value };
      }
      return current;
    }, null);

    if (!strongest || strongest.value === 0) {
      return null;
    }

    return `${strongest.label} (${this.formatModifier(strongest.value)})`;
  }

  private formatModifier(value: number): string {
    const sign = value >= 0 ? "+" : "";
    const display = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    return `${sign}${display}%`;
  }

  /**
   * Formats scalar supply quantities with two decimal precision for consistent presentation.
   */
  private formatQuantity(value: number): string {
    if (!Number.isFinite(value)) {
      return "0.00";
    }
    const formatted = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return formatted;
  }

  /**
   * Formats per-turn deltas with explicit sign so commanders can quickly discern gains vs. losses.
   */
  private formatDelta(value: number): string {
    if (!Number.isFinite(value)) {
      return "0.00";
    }
    if (Math.abs(value) < 0.005) {
      return "0.00";
    }
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    const magnitude = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sign ? `${sign}${magnitude}` : magnitude;
  }

  private extractInitials(name: string): string {
    return name
      .split(" ")
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("")
      .padEnd(2, "?")
      .slice(0, 2);
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private isAirRosterUnit(unit: RosterUnitSummary): boolean {
    const def = (unitTypesSource as any)[unit.unitType];
    return def?.moveType === "air";
  }

  private transformRosterUnit(unit: RosterUnitSummary, status: "deployed" | "reserves" | "support" | "exhausted", supportCategory?: string): RosterSnapshotEntry {
    return {
      unitKey: unit.unitKey ?? unit.unitId,
      label: unit.label,
      strength: Math.max(0, Math.round(unit.strength)),
      experience: Math.max(0, Math.round(unit.experience)),
      ammo: Math.max(0, Math.round(unit.ammo)),
      fuel: unit.fuel === null ? null : Math.max(0, Math.round(unit.fuel)),
      status,
      supportCategory,
      sprite: unit.sprite
    } satisfies RosterSnapshotEntry;
  }

  private pullBattleRosterSnapshot(): BattleRosterSnapshot | null {
    try {
      return this.battleState.getRosterSnapshot();
    } catch (error) {
      console.warn("PopupManager: Unable to retrieve battle roster snapshot.", error);
      return null;
    }
  }

  private shouldRefreshSuppliesPanel(reason: BattleUpdateReason): boolean {
    return ["engineInitialized", "turnAdvanced", "deploymentUpdated", "allocationsUpdated", "missionUpdated"].includes(reason);
  }

  private renderSuppliesPanel(): void {
    const panel = this.popupBody.querySelector<HTMLElement>("#suppliesPanel");
    if (!panel) {
      return;
    }

    const overviewTarget = panel.querySelector<HTMLElement>("[data-supplies-overview]");
    const categoryGrid = panel.querySelector<HTMLElement>("[data-supplies-category-grid]");
    const alertsList = panel.querySelector<HTMLUListElement>("[data-supplies-alerts]");
    const trendTarget = panel.querySelector<HTMLElement>("[data-supplies-trend]");
    const controls = panel.querySelector<HTMLElement>('[data-supplies-faction-controls]');
    const ledgerList = panel.querySelector<HTMLElement>('[data-supplies-ledger]');
    if (!overviewTarget || !categoryGrid || !alertsList || !trendTarget) {
      return;
    }

    // Fetch both ledgers so the toggle can instantly switch between Player and Bot views.
    const playerSnapshot = this.pullSupplySnapshot("Player");
    const botSnapshot = this.pullSupplySnapshot("Bot");
    const allySnapshot = this.pullSupplySnapshot("Ally");
    const availability: Record<TurnFaction, boolean> = {
      Player: Boolean(playerSnapshot),
      Bot: Boolean(botSnapshot),
      Ally: Boolean(allySnapshot)
    };

    if (controls) {
      this.bindSupplyFactionControls(controls);
      this.syncSupplyFactionControls(controls, availability);
    }

    const resolvedSnapshot = this.activeSupplyFaction === "Bot" ? botSnapshot : playerSnapshot;
    const snapshot = resolvedSnapshot ?? null;
    if (!snapshot) {
      const message = this.activeSupplyFaction === "Bot"
        ? "Enemy supply estimates require additional recon before they can be charted."
        : "Supply data becomes available once the battle engine initializes.";
      overviewTarget.innerHTML = `<p class="supplies-panel__empty">${this.escapeHtml(message)}</p>`;
      categoryGrid.innerHTML = "";
      alertsList.innerHTML = `<li class="supplies-alerts__empty">No alerts reported.</li>`;
      trendTarget.innerHTML = "";
      if (ledgerList) {
        ledgerList.innerHTML = '<li class="supplies-ledger__empty">Ledger data is unavailable.</li>';
      }
      return;
    }

    overviewTarget.innerHTML = this.composeSuppliesOverview(snapshot);
    categoryGrid.innerHTML = snapshot.categories.map((category: SupplyCategorySnapshot) => this.composeSupplyCategoryCard(category)).join("");
    alertsList.innerHTML = this.composeSupplyAlertsMarkup(snapshot.alerts);
    trendTarget.innerHTML = this.composeSupplyTrendMarkup(snapshot.categories);
    if (ledgerList) {
      // Ledger container ships with the refreshed supplies popup; skip gracefully when legacy markup omits it.
      ledgerList.innerHTML = this.composeSupplyLedgerMarkup(snapshot.ledger);
    }
  }

  /**
   * Retrieves the most recent supply snapshot for the requested faction, falling back to the engine when caches are empty.
   */
  private pullSupplySnapshot(faction: TurnFaction): SupplySnapshot | null {
    try {
      const cachedSnapshot = this.battleState.getSupplySnapshot(faction);
      if (cachedSnapshot) {
        return cachedSnapshot;
      }

      // If the cache has not been seeded yet but the engine is live, pull directly to avoid placeholder copy lingering.
      if (this.battleState.hasEngine()) {
        const engineSnapshot = this.battleState.ensureGameEngine().getSupplySnapshot(faction);
        return engineSnapshot;
      }
    } catch (error) {
      console.warn("PopupManager: Failed to retrieve supply snapshot.", error);
      return null;
    }
    return null;
  }

  private composeSuppliesOverview(snapshot: SupplySnapshot): string {
    return `
      <div class="supplies-overview">
        <div class="supplies-overview__hero">
          <article class="supplies-overview__metric">
            <span>Turn</span>
            <strong>${snapshot.turn}</strong>
            <small>${this.escapeHtml(snapshot.phase)}</small>
          </article>
          <article class="supplies-overview__metric">
            <span>Resupply Tick</span>
            <strong>${supplyBalance.resupply.ammo}/${supplyBalance.resupply.fuel}</strong>
            <small>ammo / fuel to connected units</small>
          </article>
          <article class="supplies-overview__metric">
            <span>Supply Reach</span>
            <strong>${supplyBalance.roadRange}/${supplyBalance.offroadRange}</strong>
            <small>road / rough hexes</small>
          </article>
          <article class="supplies-overview__metric">
            <span>Last Updated</span>
            <strong>${this.formatDate(snapshot.updatedAt)}</strong>
            <small>live ledger snapshot</small>
          </article>
        </div>
        <div class="supplies-overview__stock">
          <span class="supplies-overview__stock-item"><strong>Depot Ammo</strong> ${this.formatQuantity(snapshot.stockpile?.ammo ?? 0)}</span>
          <span class="supplies-overview__stock-item"><strong>Depot Fuel</strong> ${this.formatQuantity(snapshot.stockpile?.fuel ?? 0)}</span>
          <span class="supplies-overview__stock-item"><strong>Rations</strong> ${this.formatQuantity(snapshot.stockpile?.rations ?? 0)}</span>
          <span class="supplies-overview__stock-item"><strong>Parts</strong> ${this.formatQuantity(snapshot.stockpile?.parts ?? 0)}</span>
        </div>
        <div class="supplies-overview__brief">
          <p class="supplies-overview__headline">Units fight from carried stocks. Connected formations draw abstract convoy resupply from the depot each turn.</p>
          <ul class="supplies-overview__rules">
            <li>Base Camp and HQ project the supply network out to the current road and rough range limits.</li>
            <li>Ground attacks spend onboard ammo. Motorized movement spends onboard fuel; infantry leg movement does not.</li>
            <li>Cut-off units stop receiving resupply and begin losing ammo, fuel, entrenchment, and eventually strength.</li>
          </ul>
        </div>
      </div>
    `;
  }

  private composeSupplyCategoryCard(category: SupplyCategorySnapshot): string {
    const { resource, label, total, frontlineTotal, reserveTotal, stockpileTotal, averagePerUnit, consumptionPerTurn, estimatedDepletionTurns, status } = category;
    const statusLabel = status === "unknown" ? "Data Pending" : status.toUpperCase();
    const depletionCopy = estimatedDepletionTurns !== null ? `${estimatedDepletionTurns} turn${estimatedDepletionTurns === 1 ? "" : "s"}` : "N/A";
    const formattedDelta = this.formatDelta(consumptionPerTurn);
    const overallTotal = total + stockpileTotal;
    // Highlight how stock is distributed so commanders can quickly spot imbalances between frontline and reserve pools.
    const gaugeMarkup = this.composeSupplyGauge(frontlineTotal, reserveTotal, stockpileTotal, total);

    return `
      <article class="supplies-card" data-supplies-resource="${resource}">
        <header class="supplies-card__header">
          <div>
            <h4>${label}</h4>
            <p class="supplies-card__subhead">Carried ${this.formatQuantity(total)} · Depot ${this.formatQuantity(stockpileTotal)}</p>
          </div>
          <span class="supplies-card__status supplies-card__status--${status}">${statusLabel}</span>
        </header>
        <div class="supplies-card__total-row">
          <strong class="supplies-card__overall">${this.formatQuantity(overallTotal)}</strong>
          <span class="supplies-card__overall-label">overall stock</span>
        </div>
        ${gaugeMarkup}
        <dl class="supplies-card__metrics">
          <div><dt>Frontline</dt><dd>${this.formatQuantity(frontlineTotal)}</dd></div>
          <div><dt>Reserves</dt><dd>${this.formatQuantity(reserveTotal)}</dd></div>
          <div><dt>Depot</dt><dd>${this.formatQuantity(stockpileTotal)}</dd></div>
          <div><dt>Issued / Unit</dt><dd>${this.formatQuantity(averagePerUnit)}</dd></div>
          <div><dt>Burn / Turn</dt><dd>${formattedDelta}</dd></div>
          <div><dt>Outlook</dt><dd>${depletionCopy}</dd></div>
        </dl>
        <p class="supplies-card__footer">${resource === "ammo"
          ? "Ammo must be on the unit to fire."
          : resource === "fuel"
            ? "Fuel must be on the unit to move."
            : "Tracking pending implementation."}</p>
      </article>
    `;
  }

  /**
   * Renders a compact summary of depot stock so commanders can contrast unit-held supplies with logistics reserves.
   */
  private composeStockpileSection(stockpileTotal: number, resource: SupplyResourceKey): string {
    const safeTotal = Math.max(0, Number(stockpileTotal));
    const label = this.resolveResourceLabel(resource);
    const description = safeTotal > 0
      ? `${this.formatQuantity(safeTotal)} stored in depots`
      : "No depot reserves recorded";

    return `
      <p class="supplies-card__stockpile" aria-label="${label} depot stock">
        <strong>Depot:</strong> ${description}
      </p>
    `;
  }

  /**
   * Builds a small stacked gauge showing how supply totals split between frontline and reserve forces to surface imbalances.
   */
  private composeSupplyGauge(frontlineTotal: number, reserveTotal: number, stockpileTotal: number, total: number): string {
    // Aggregate depot stock with unit-held totals so the gauge communicates the full logistics picture.
    const overall = Math.max(total + stockpileTotal, 0);
    if (overall === 0) {
      return `
        <div class="supplies-card__gauge" role="img" aria-label="No recorded stock levels">
          <span class="supplies-card__gauge-bar supplies-card__gauge-bar--empty" style="width: 100%"></span>
        </div>
        <p class="supplies-card__gauge-legend">Frontline 0% · Reserves 0% · Depot 0%</p>
      `;
    }

    const frontlinePercent = Math.min(100, Math.max(0, Math.round((frontlineTotal / overall) * 100)));
    const reservePercent = Math.min(100 - frontlinePercent, Math.max(0, Math.round((reserveTotal / overall) * 100)));
    const depotPercent = Math.min(100 - frontlinePercent - reservePercent, Math.max(0, Math.round((stockpileTotal / overall) * 100)));
    const bufferPercent = Math.max(0, 100 - frontlinePercent - reservePercent - depotPercent);

    const ariaLabelParts = [`Frontline ${frontlinePercent}%`, `Reserves ${reservePercent}%`];
    if (depotPercent > 0) {
      ariaLabelParts.push(`Depot ${depotPercent}%`);
    }
    if (bufferPercent > 0) {
      ariaLabelParts.push(`Unallocated ${bufferPercent}%`);
    }
    const ariaLabel = ariaLabelParts.join(" · ");

    return `
      <div class="supplies-card__gauge" role="img" aria-label="${ariaLabel}">
        <span class="supplies-card__gauge-bar supplies-card__gauge-bar--frontline" style="width: ${frontlinePercent}%"></span>
        <span class="supplies-card__gauge-bar supplies-card__gauge-bar--reserve" style="width: ${reservePercent}%"></span>
        ${depotPercent > 0 ? `<span class="supplies-card__gauge-bar supplies-card__gauge-bar--depot" style="width: ${depotPercent}%"></span>` : ""}
        ${bufferPercent > 0 ? `<span class="supplies-card__gauge-bar supplies-card__gauge-bar--buffer" style="width: ${bufferPercent}%"></span>` : ""}
      </div>
      <p class="supplies-card__gauge-legend">${ariaLabel}</p>
    `;
  }

  private composeSupplyAlertsMarkup(alerts: SupplyAlert[]): string {
    if (alerts.length === 0) {
      return '<li class="supplies-alerts__empty">No alerts reported.</li>';
    }

    return alerts
      .map((alert) => `
        <li class="supplies-alerts__item supplies-alerts__item--${alert.level}" data-supplies-alert="${alert.resource}">
          <strong>${this.resolveResourceLabel(alert.resource)}:</strong> ${alert.message}
        </li>
      `)
      .join("");
  }

  private composeSupplyTrendMarkup(categories: SupplyCategorySnapshot[]): string {
    return categories
      .map((category) => {
        const trendPoints = category.trend
          .map((value) => `<span>${this.formatQuantity(value)}</span>`)
          .join("");
        return `
          <section class="supplies-trend__series" data-supplies-trend-resource="${category.resource}">
            <header>
              <h5>${category.label}</h5>
            </header>
            <div class="supplies-trend__points">${trendPoints}</div>
          </section>
        `;
      })
      .join("");
  }

  private resolveResourceLabel(resource: SupplyResourceKey): string {
    switch (resource) {
      case "ammo":
        return "Ammunition";
      case "fuel":
        return "Fuel";
      case "medical":
        return "Medical";
      case "emergency":
        return "Emergency";
      default:
        return resource;
    }
  }

  /** Returns true when logistics should refresh on a battle update. */
  private shouldRefreshLogisticsPanel(reason: BattleUpdateReason): boolean {
    return ["engineInitialized", "turnAdvanced", "deploymentUpdated", "missionUpdated"].includes(reason);
  }

  /**
   * Renders the combined Logistics panel: depot stock, supply status, convoy routing, and delivery priorities.
   */
  private renderLogisticsPanel(): void {
    const panel = this.popupBody.querySelector<HTMLElement>("#logisticsPanel");
    if (!panel) {
      return;
    }

    const snapshot = this.pullLogisticsSnapshot();
    const supplySnapshot = this.pullSupplySnapshot("Player");
    if (!snapshot) {
      const emptyMessage = `<div class="logistics-panel__empty">Logistics data becomes available once the battle engine initializes and units are deployed.</div>`;
      panel.querySelectorAll("[data-logistics-overview], [data-logistics-supply-categories], [data-logistics-priorities], [data-logistics-sources], [data-logistics-stockpiles], [data-logistics-convoys], [data-logistics-delays], [data-logistics-alerts], [data-logistics-trend], [data-logistics-ledger]")
        .forEach((container) => { container.innerHTML = emptyMessage; });
      return;
    }

    const overviewContainer = panel.querySelector<HTMLElement>("[data-logistics-overview]");
    const supplyCategoriesContainer = panel.querySelector<HTMLElement>("[data-logistics-supply-categories]");
    const prioritiesContainer = panel.querySelector<HTMLElement>("[data-logistics-priorities]");
    const sourcesContainer = panel.querySelector<HTMLElement>("[data-logistics-sources]");
    const stockpilesContainer = panel.querySelector<HTMLElement>("[data-logistics-stockpiles]");
    const convoysContainer = panel.querySelector<HTMLElement>("[data-logistics-convoys]");
    const delaysContainer = panel.querySelector<HTMLElement>("[data-logistics-delays]");
    const alertsContainer = panel.querySelector<HTMLElement>("[data-logistics-alerts]");
    const trendContainer = panel.querySelector<HTMLElement>("[data-logistics-trend]");
    const ledgerContainer = panel.querySelector<HTMLElement>("[data-logistics-ledger]");

    if (overviewContainer) {
      overviewContainer.innerHTML = this.composeLogisticsOverview(snapshot, supplySnapshot);
    }

    if (supplyCategoriesContainer) {
      supplyCategoriesContainer.innerHTML = supplySnapshot
        ? supplySnapshot.categories.map((category: SupplyCategorySnapshot) => this.composeSupplyCategoryCard(category)).join("")
        : '<div class="logistics-panel__empty">Supply breakdown will populate once the live ledger is available.</div>';
    }

    if (prioritiesContainer) {
      prioritiesContainer.innerHTML = snapshot.priorityTargets.length === 0
        ? '<div class="logistics-panel__empty">No frontline unit is currently requesting ammo or fuel.</div>'
        : snapshot.priorityTargets.map((entry) => this.composePriorityItem(entry)).join("");
    }

    if (sourcesContainer) {
      sourcesContainer.innerHTML = snapshot.supplySources.length === 0
        ? '<div class="logistics-panel__empty">No supply sources available.</div>'
        : snapshot.supplySources.map((source) => this.composeSupplySourceCard(source)).join("");
    }

    if (stockpilesContainer) {
      stockpilesContainer.innerHTML = snapshot.stockpiles.length === 0
        ? '<div class="logistics-panel__empty">No stockpile data available.</div>'
        : snapshot.stockpiles.map((stockpile) => this.composeStockpileCard(stockpile)).join("");
    }

    if (convoysContainer) {
      convoysContainer.innerHTML = snapshot.convoyStatuses.length === 0
        ? '<li class="logistics-panel__empty">No active convoys.</li>'
        : snapshot.convoyStatuses.map((convoy) => this.composeConvoyItem(convoy)).join("");
    }

    if (delaysContainer) {
      delaysContainer.innerHTML = snapshot.delayNodes.length === 0
        ? '<li class="logistics-panel__empty">No delay nodes detected.</li>'
        : snapshot.delayNodes.map((delay) => this.composeDelayItem(delay)).join("");
    }

    if (alertsContainer) {
      alertsContainer.innerHTML = this.composeCombinedLogisticsAlerts(snapshot.alerts, supplySnapshot?.alerts ?? []);
    }

    if (trendContainer) {
      trendContainer.innerHTML = supplySnapshot
        ? this.composeSupplyTrendMarkup(supplySnapshot.categories)
        : '<div class="logistics-panel__empty">Trend history is not available yet.</div>';
    }

    if (ledgerContainer) {
      ledgerContainer.innerHTML = supplySnapshot
        ? this.composeSupplyLedgerMarkup(supplySnapshot.ledger)
        : '<li class="supplies-ledger__empty">Ledger data is unavailable.</li>';
    }

    this.bindLogisticsPriorityControls(panel);
  }

  /**
   * Retrieves the logistics snapshot from the game engine.
   */
  private pullLogisticsSnapshot(): LogisticsSnapshot | null {
    try {
      if (this.battleState.hasEngine()) {
        return this.battleState.ensureGameEngine().getLogisticsSnapshot();
      }
    } catch (error) {
      console.warn("PopupManager: Failed to retrieve logistics snapshot.", error);
      return null;
    }
    return null;
  }

  /** Summarizes the current logistics model so the panel explains what the numbers mean and what the player can do. */
  private composeLogisticsOverview(snapshot: LogisticsSnapshot, supplySnapshot: SupplySnapshot | null): string {
    const directIssueLabel = supplyBalance.convoy.sourceRadius <= 1
      ? "On source or adjacent"
      : `Base/HQ +${supplyBalance.convoy.sourceRadius} hex`;
    const phaseLabel = this.formatBattlePhaseLabel(supplySnapshot?.phase ?? "playerTurn");
    const depotRations = supplySnapshot?.stockpile.rations ?? 0;
    const depotParts = supplySnapshot?.stockpile.parts ?? snapshot.depotStock.parts;

    return `
      <div class="logistics-overview">
        <div class="logistics-overview__hero">
          <article class="logistics-overview__metric">
            <span>Turn</span>
            <strong>${snapshot.turn}</strong>
            <small>${this.escapeHtml(phaseLabel)}</small>
          </article>
          <article class="logistics-overview__metric">
            <span>Deployed</span>
            <strong>${snapshot.deployedUnits}</strong>
            <small>${snapshot.isolatedUnits} isolated</small>
          </article>
          <article class="logistics-overview__metric">
            <span>Convoys</span>
            <strong>${snapshot.convoyUnits}</strong>
            <small>${snapshot.loadedConvoys} loaded for delivery</small>
          </article>
          <article class="logistics-overview__metric">
            <span>Queue</span>
            <strong>${snapshot.priorityTargets.length}</strong>
            <small>${snapshot.connectedUnits} in network</small>
          </article>
        </div>
        <div class="logistics-overview__stock">
          <span class="logistics-overview__stock-item"><strong>Depot Ammo</strong> ${this.formatQuantity(snapshot.depotStock.ammo)}</span>
          <span class="logistics-overview__stock-item"><strong>Depot Fuel</strong> ${this.formatQuantity(snapshot.depotStock.fuel)}</span>
          <span class="logistics-overview__stock-item"><strong>Rations</strong> ${this.formatQuantity(depotRations)}</span>
          <span class="logistics-overview__stock-item"><strong>Parts</strong> ${this.formatQuantity(depotParts)}</span>
          <span class="logistics-overview__stock-item"><strong>Convoy Cargo</strong> ${this.formatQuantity(snapshot.convoyCargo.ammo)} ammo · ${this.formatQuantity(snapshot.convoyCargo.fuel)} fuel</span>
          <span class="logistics-overview__stock-item"><strong>Direct Issue</strong> ${directIssueLabel}</span>
        </div>
        <div class="logistics-overview__brief">
          <p class="logistics-overview__headline">Base Camp and HQ only issue supplies on their own hex and adjacent hexes. Everything farther forward must be sustained by automated on-map supply convoys.</p>
          <ul class="logistics-overview__rules">
            <li>Convoys are live map units for both sides. They return to Base Camp or HQ to reload before running the next delivery.</li>
            <li>Each convoy carries up to ${supplyBalance.convoy.ammoCapacity} ammo and ${supplyBalance.convoy.fuelCapacity} fuel, unloading up to ${supplyBalance.convoy.unloadAmmoPerTurn}/${supplyBalance.convoy.unloadFuelPerTurn} per turn.</li>
            <li>Ground attacks spend onboard ammo. Motorized movement spends onboard fuel. Infantry do not burn fuel to move.</li>
            <li>Use the resupply queue below to raise or lower delivery priority. Forward battalions wait on convoy service instead of abstract depot teleportation.</li>
          </ul>
        </div>
      </div>
    `;
  }

  /**
   * Renders a resupply-priority card so the commander can steer which battalion gets the next convoy slot.
   */
  private composePriorityItem(entry: LogisticsPriorityEntry): string {
    const statusLabel = this.formatPriorityStatusLabel(entry.status);
    const priorityOptions: SupplyPriority[] = ["critical", "high", "normal", "low"];

    return `
      <article class="logistics-priority-card">
        <header class="logistics-priority-card__row">
          <div class="logistics-priority-card__summary">
            <h4>${this.escapeHtml(entry.unitLabel)}</h4>
            <p>${this.escapeHtml(entry.hex)} · Needs ${this.formatQuantity(entry.ammoNeed)} ammo · ${this.formatQuantity(entry.fuelNeed)} fuel · Assigned convoys: ${entry.assignedConvoys}</p>
          </div>
          <span class="logistics-priority-card__status logistics-priority-card__status--${entry.status}">${this.escapeHtml(statusLabel)}</span>
          <div class="logistics-priority-card__buttons" role="group" aria-label="Set ${this.escapeHtml(entry.unitLabel)} logistics priority">
          ${priorityOptions.map((priority) => `
            <button
              type="button"
              class="logistics-priority-button${entry.priority === priority ? " is-active" : ""}"
              data-logistics-priority-button
              data-logistics-priority-unit-id="${this.escapeHtml(entry.unitId)}"
              data-logistics-priority="${priority}"
              aria-pressed="${entry.priority === priority ? "true" : "false"}"
            >
              ${this.escapeHtml(this.formatSupplyPriorityLabel(priority))}
            </button>
          `).join("")}
          </div>
        </header>
      </article>
    `;
  }

  /**
   * Renders a supply source card showing throughput and bottlenecks.
   */
  private composeSupplySourceCard(source: LogisticsSupplySource): string {
    const utilizationPercent = Math.round(source.utilization * 100);
    const bottleneckMarkup = source.bottleneck
      ? `<div class="logistics-source-card__bottleneck"><strong>Bottleneck:</strong> ${this.escapeHtml(source.bottleneck)}</div>`
      : "";

    return `
      <article class="logistics-source-card">
        <header class="logistics-source-card__header">
          <h4>${this.escapeHtml(source.label)}</h4>
          <span class="logistics-source-card__utilization">${utilizationPercent}%</span>
        </header>
        <dl class="logistics-source-card__metrics">
          <div class="logistics-source-card__metric">
            <dt>Connected Units</dt>
            <dd>${source.connectedUnits}</dd>
          </div>
          <div class="logistics-source-card__metric">
            <dt>Throughput</dt>
            <dd>${source.throughput}</dd>
          </div>
          <div class="logistics-source-card__metric">
            <dt>Avg Travel Time</dt>
            <dd>${source.averageTravelHours}h</dd>
          </div>
        </dl>
        ${bottleneckMarkup}
      </article>
    `;
  }

  /**
   * Renders a stockpile card showing resource levels and trends.
   */
  private composeStockpileCard(stockpile: LogisticsStockpileEntry): string {
    const resourceLabel = this.formatResourceLabel(stockpile.resource);
    const trendLabel = stockpile.trend.charAt(0).toUpperCase() + stockpile.trend.slice(1);
    const detailLabel = stockpile.resource === "parts"
      ? `${this.formatQuantity(stockpile.averagePerUnit)} repair need / unit`
      : `${this.formatQuantity(stockpile.averagePerUnit)} carried / unit`;

    return `
      <article class="logistics-stockpile-card">
        <div class="logistics-stockpile-card__label">${resourceLabel}</div>
        <div class="logistics-stockpile-card__caption">Depot stock</div>
        <div class="logistics-stockpile-card__total">${this.formatQuantity(stockpile.total)}</div>
        <div class="logistics-stockpile-card__avg">${detailLabel}</div>
        <span class="logistics-stockpile-card__trend logistics-stockpile-card__trend--${stockpile.trend}">${trendLabel}</span>
      </article>
    `;
  }

  /**
   * Renders a convoy status item.
   */
  private composeConvoyItem(convoy: LogisticsConvoyStatusEntry): string {
    const statusLabel = this.formatConvoyStatusLabel(convoy.status);
    const etaLabel = convoy.etaHours > 0 ? `${convoy.etaHours}h` : "Now";
    const incidentMarkup = convoy.incident
      ? `<div class="logistics-convoy-item__incident">${this.escapeHtml(convoy.incident)}</div>`
      : "";

    return `
      <li class="logistics-convoy-item">
        <div class="logistics-convoy-item__main">
          <div class="logistics-convoy-item__heading">${this.escapeHtml(convoy.convoyLabel)}</div>
          <div class="logistics-convoy-item__route">${this.escapeHtml(convoy.route)}</div>
          <div class="logistics-convoy-item__cargo">Cargo ${this.formatQuantity(convoy.cargoAmmo)} ammo · ${this.formatQuantity(convoy.cargoFuel)} fuel</div>
          ${incidentMarkup}
        </div>
        <span class="logistics-convoy-item__status logistics-convoy-item__status--${convoy.status}">${statusLabel}</span>
        <span class="logistics-convoy-item__eta">ETA ${etaLabel}</span>
      </li>
    `;
  }

  /**
   * Renders a delay node item.
   */
  private composeDelayItem(delay: LogisticsDelayNode): string {
    const riskLabel = delay.risk.charAt(0).toUpperCase() + delay.risk.slice(1);

    return `
      <li class="logistics-delay-item">
        <div class="logistics-delay-item__node">${this.escapeHtml(delay.node)}</div>
        <span class="logistics-delay-item__risk logistics-delay-item__risk--${delay.risk}">${riskLabel} Risk</span>
        <div class="logistics-delay-item__reason">${this.escapeHtml(delay.reason)}</div>
      </li>
    `;
  }

  /**
   * Renders a maintenance backlog item.
   */
  private composeMaintenanceItem(item: LogisticsMaintenanceEntry): string {
    const turnsLabel = item.pendingTurns === 1 ? "1 turn" : `${item.pendingTurns} turns`;

    return `
      <li class="logistics-maintenance-item">
        <div class="logistics-maintenance-item__unit">${this.escapeHtml(item.unitKey)}</div>
        <div class="logistics-maintenance-item__issue">${this.escapeHtml(item.issue)}</div>
        <span class="logistics-maintenance-item__eta">${turnsLabel}</span>
      </li>
    `;
  }

  /**
   * Renders a logistics alert.
   */
  private composeLogisticsAlert(alert: LogisticsAlertEntry): string {
    return `
      <li class="logistics-alert-item logistics-alert-item--${alert.level}">
        ${this.escapeHtml(alert.message)}
      </li>
    `;
  }

  private composeCombinedLogisticsAlerts(logisticsAlerts: LogisticsAlertEntry[], supplyAlerts: SupplyAlert[]): string {
    const merged = new Map<string, LogisticsAlertEntry["level"]>();
    const severityRank: Record<LogisticsAlertEntry["level"], number> = {
      info: 0,
      warning: 1,
      critical: 2
    };

    logisticsAlerts.forEach((alert) => {
      merged.set(alert.message, alert.level);
    });

    supplyAlerts.forEach((alert) => {
      const message = `${this.resolveResourceLabel(alert.resource)}: ${alert.message}`;
      const current = merged.get(message);
      if (!current || severityRank[alert.level] > severityRank[current]) {
        merged.set(message, alert.level);
      }
    });

    if (merged.size === 0) {
      return '<li class="logistics-panel__empty">No logistics alerts.</li>';
    }

    return Array.from(merged.entries())
      .map(([message, level]) => this.composeLogisticsAlert({ message, level }))
      .join("");
  }

  private formatSupplyPriorityLabel(priority: SupplyPriority): string {
    switch (priority) {
      case "critical":
        return "Critical";
      case "high":
        return "High";
      case "normal":
        return "Normal";
      case "low":
      default:
        return "Low";
    }
  }

  private formatPriorityStatusLabel(status: LogisticsPriorityEntry["status"]): string {
    switch (status) {
      case "direct":
        return "At Depot";
      case "delivering":
        return "Convoy Assigned";
      case "resupplied":
        return "Resupplied";
      case "isolated":
        return "Isolated";
      case "queued":
      default:
        return "Queued";
    }
  }

  private formatConvoyStatusLabel(status: LogisticsConvoyStatusEntry["status"]): string {
    switch (status) {
      case "loading":
        return "Loading";
      case "delivering":
        return "Delivering";
      case "returning":
        return "Returning";
      case "idle":
        return "Idle";
      case "blocked":
      default:
        return "Blocked";
    }
  }

  /**
   * Formats resource names for display.
   */
  private formatResourceLabel(resource: string): string {
    switch (resource) {
      case "ammo":
        return "Ammunition";
      case "fuel":
        return "Fuel";
      case "parts":
        return "Spare Parts";
      default:
        return resource.charAt(0).toUpperCase() + resource.slice(1);
    }
  }

  private formatBattlePhaseLabel(phase: string): string {
    switch (phase) {
      case "playerTurn":
        return "Player Turn";
      case "botTurn":
        return "Enemy Turn";
      case "allyTurn":
        return "Ally Turn";
      case "deployment":
        return "Deployment";
      case "completed":
        return "Completed";
      default:
        return phase;
    }
  }

  /**
   * Wires filter controls and performs the initial render of the recon/intel panel.
   */
  private initializeReconIntelPanel(): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    const panel = this.popupBody.querySelector<HTMLElement>("[data-recon-intel-panel]");
    if (!panel) {
      return;
    }
    this.bindReconIntelFilters(panel);
    this.renderReconIntelPanel();
  }

  private bindReconIntelFilters(panel: HTMLElement): void {
    const timeframeButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-recon-timeframe]"));
    const confidenceButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-recon-confidence]"));

    const activateButton = (buttons: HTMLButtonElement[], active: HTMLButtonElement): void => {
      buttons.forEach((candidate: HTMLButtonElement) => {
        candidate.classList.toggle("is-active", candidate === active);
      });
    };

    timeframeButtons.forEach((button: HTMLButtonElement) => {
      if ((button.dataset.reconTimeframe ?? "all") === "all") {
        button.classList.add("is-active");
      }
      button.addEventListener("click", () => {
        const value = (button.dataset.reconTimeframe ?? "all") as ReconIntelTimeframe | "all";
        this.reconIntelTimeframe = value;
        activateButton(timeframeButtons, button);
        this.renderReconIntelPanel();
      });
    });

    confidenceButtons.forEach((button: HTMLButtonElement) => {
      if ((button.dataset.reconConfidence ?? "all") === "all") {
        button.classList.add("is-active");
      }
      button.addEventListener("click", () => {
        const value = (button.dataset.reconConfidence ?? "all") as ReconIntelConfidence | "all";
        this.reconIntelConfidence = value;
        activateButton(confidenceButtons, button);
        this.renderReconIntelPanel();
      });
    });
  }

  /**
   * Re-renders all recon/intel sub-sections after a filter change.
   */
  private renderReconIntelPanel(): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    this.renderReconIntelAlert();
    this.renderReconIntelSectors();
    this.renderReconIntelBriefs();
    this.bindReconIntelLinkEvents();
  }

  /**
   * Displays the highest-severity alert matching the active timeframe filters.
   */
  private renderReconIntelAlert(): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    const banner = this.popupBody.querySelector<HTMLElement>("[data-recon-intel-alert]");
    if (!banner) {
      return;
    }
    const alert = this.selectReconIntelAlert();
    if (!alert) {
      banner.hidden = true;
      banner.textContent = "";
      banner.removeAttribute("data-severity");
      return;
    }
    banner.hidden = false;
    banner.setAttribute("data-severity", alert.severity);
    banner.innerHTML = `<span>${alert.message}</span><small>${alert.action}</small>`;
  }

  /**
   * Chooses the alert banner entry honoring severity and active timeframe filters.
   */
  private selectReconIntelAlert(): ReconIntelAlert | null {
    if (!this.reconIntelSnapshot || this.reconIntelSnapshot.alerts.length === 0) {
      return null;
    }
    const matches = this.reconIntelSnapshot.alerts.filter((entry: ReconIntelAlert) => {
      return this.reconIntelTimeframe === "all" || entry.timeframe === this.reconIntelTimeframe;
    });
    const pool = matches.length > 0 ? matches : this.reconIntelSnapshot.alerts;
    const severityScore: Record<ReconIntelAlert["severity"], number> = {
      critical: 3,
      warning: 2,
      info: 1
    };
    const [first, ...rest] = pool;
    return rest.reduce<ReconIntelAlert>((best, current) => {
      return severityScore[current.severity] > severityScore[best.severity] ? current : best;
    }, first);
  }

  /**
   * Renders recon column cards, blurring low confidence activity per UX guidance.
   */
  private renderReconIntelSectors(): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    const container = this.popupBody.querySelector<HTMLElement>("[data-recon-sector-list]");
    if (!container) {
      return;
    }
    const sectors: ReconIntelSectorReport[] = this.reconIntelSnapshot.sectors.filter((entry: ReconIntelSectorReport) =>
      this.matchesReconIntelFilters(entry.timeframe, entry.confidence)
    );
    if (sectors.length === 0) {
      container.innerHTML = "<div class=\"recon-intel-empty\">No recon sectors match the selected filters.</div>";
      return;
    }
    container.innerHTML = sectors.map((entry: ReconIntelSectorReport) => this.composeReconIntelSectorMarkup(entry)).join("");
  }

  /**
   * Renders intel briefs in the right column, highlighting linked sectors when focused.
   */
  private renderReconIntelBriefs(): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    const container = this.popupBody.querySelector<HTMLElement>("[data-recon-brief-list]");
    if (!container) {
      return;
    }
    const briefs: ReconIntelBrief[] = this.reconIntelSnapshot.intelBriefs.filter((entry: ReconIntelBrief) =>
      this.matchesReconIntelFilters(entry.timeframe, entry.confidence)
    );
    if (briefs.length === 0) {
      container.innerHTML = "<div class=\"recon-intel-empty\">No intelligence briefs match the selected filters.</div>";
      return;
    }
    container.innerHTML = briefs.map((entry: ReconIntelBrief) => this.composeReconIntelBriefMarkup(entry)).join("");
  }

  /**
   * Checks whether an entry should render for the active timeframe/confidence filters.
   */
  private matchesReconIntelFilters(timeframe: ReconIntelTimeframe, confidence: ReconIntelConfidence): boolean {
    const timeframeMatches = this.reconIntelTimeframe === "all" || this.reconIntelTimeframe === timeframe;
    const confidenceMatches = this.reconIntelConfidence === "all" || this.reconIntelConfidence === confidence;
    return timeframeMatches && confidenceMatches;
  }

  /**
   * Generates accessible markup for a recon sector card.
   */
  private composeReconIntelSectorMarkup(sector: ReconIntelSectorReport): string {
    const linkedBriefCount = sector.linkedBriefs.length;
    const linkedBriefText =
      linkedBriefCount === 0
        ? "No intel briefs linked."
        : `${linkedBriefCount} intel brief${linkedBriefCount === 1 ? "" : "s"} linked.`;
    return `
      <article class="recon-intel-card" data-sector-id="${sector.id}" tabindex="0">
        <strong>${sector.name}</strong>
        <div class="meta-line">
          <span class="meta-pill">${this.describeReconIntelTimeframe(sector.timeframe)}</span>
          <span class="meta-pill">${this.describeReconIntelConfidence(sector.confidence)}</span>
          <span>${sector.coordinates}</span>
        </div>
        <p class="body">${sector.summary}</p>
        <p class="body" data-confidence="${sector.confidence}">${sector.activity}</p>
        <div class="meta-line"><span>${linkedBriefText}</span></div>
      </article>
    `;
  }

  /**
   * Generates accessible markup for an intel brief card.
   */
  private composeReconIntelBriefMarkup(brief: ReconIntelBrief): string {
    const linkedSectorCount = brief.linkedSectors.length;
    const linkedSectorText =
      linkedSectorCount === 0
        ? "No recon sectors linked."
        : `${linkedSectorCount} recon sector${linkedSectorCount === 1 ? "" : "s"} linked.`;
    return `
      <article class="recon-intel-card" data-brief-id="${brief.id}" tabindex="0">
        <strong>${brief.title}</strong>
        <div class="meta-line">
          <span class="meta-pill">${this.describeReconIntelTimeframe(brief.timeframe)}</span>
          <span class="meta-pill">${this.describeReconIntelConfidence(brief.confidence)}</span>
        </div>
        <p class="body" data-confidence="${brief.confidence}">${brief.assessment}</p>
        <p class="body">${brief.projectedImpact}</p>
        <div class="meta-line"><span>${linkedSectorText}</span></div>
      </article>
    `;
  }

  /**
   * Converts timeframe codes into human-readable labels.
   */
  private describeReconIntelTimeframe(timeframe: ReconIntelTimeframe): string {
    switch (timeframe) {
      case "last":
        return "Last Turn";
      case "current":
        return "Current Turn";
      case "forecast":
        return "Forecast";
      default:
        return timeframe;
    }
  }

  /**
   * Converts confidence codes into human-readable labels.
   */
  private describeReconIntelConfidence(confidence: ReconIntelConfidence): string {
    switch (confidence) {
      case "high":
        return "Confidence: High";
      case "medium":
        return "Confidence: Medium";
      case "low":
        return "Confidence: Low";
      default:
        return confidence;
    }
  }

  /**
   * Attaches hover/focus interactions to cross-highlight linked recon/brief cards.
   */
  private bindReconIntelLinkEvents(): void {
    const sectorCards = Array.from(this.popupBody.querySelectorAll<HTMLElement>("[data-sector-id]"));
    const briefCards = Array.from(this.popupBody.querySelectorAll<HTMLElement>("[data-brief-id]"));

    sectorCards.forEach((card: HTMLElement) => {
      const id = card.dataset.sectorId;
      if (!id) {
        return;
      }
      const activate = (active: boolean) => {
        card.classList.toggle("is-highlighted", active);
        this.toggleReconIntelHighlight("sector", id, active);
      };
      card.addEventListener("mouseenter", () => activate(true));
      card.addEventListener("mouseleave", () => activate(false));
      card.addEventListener("focusin", () => activate(true));
      card.addEventListener("focusout", () => activate(false));
    });

    briefCards.forEach((card: HTMLElement) => {
      const id = card.dataset.briefId;
      if (!id) {
        return;
      }
      const activate = (active: boolean) => {
        card.classList.toggle("is-highlighted", active);
        this.toggleReconIntelHighlight("brief", id, active);
      };
      card.addEventListener("mouseenter", () => activate(true));
      card.addEventListener("mouseleave", () => activate(false));
      card.addEventListener("focusin", () => activate(true));
      card.addEventListener("focusout", () => activate(false));
    });
  }

  /**
   * Coordinates cross-column highlighting so recon cards highlight their linked intel briefs and vice versa.
   */
  private toggleReconIntelHighlight(source: "sector" | "brief", id: string, active: boolean): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    if (source === "sector") {
      const sector = this.reconIntelSnapshot.sectors.find((entry) => entry.id === id);
      if (!sector) {
        return;
      }
      this.applyReconIntelHighlight("[data-brief-id]", sector.linkedBriefs, active);
    } else {
      const brief = this.reconIntelSnapshot.intelBriefs.find((entry) => entry.id === id);
      if (!brief) {
        return;
      }
      this.applyReconIntelHighlight("[data-sector-id]", brief.linkedSectors, active);
    }
  }

  /**
   * Applies or clears the shared highlight class for a given set of dataset identifiers.
   */
  private applyReconIntelHighlight(selector: string, ids: readonly string[], active: boolean): void {
    if (ids.length === 0) {
      return;
    }
    const elements = Array.from(this.popupBody.querySelectorAll<HTMLElement>(selector));
    elements.forEach((element: HTMLElement) => {
      const elementId = selector === "[data-sector-id]" ? element.dataset.sectorId : element.dataset.briefId;
      if (!elementId) {
        return;
      }
      if (ids.includes(elementId)) {
        element.classList.toggle("is-highlighted", active);
      }
    });
  }

  /**
   * Helper to require an element from the DOM.
   */
  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Required element not found: ${selector}`);
    }
    return element;
  }

  private handleWarRoomOverlayClosed(): void {
    if (this.activePopup !== "baseOperations") {
      return;
    }
    this.syncSidebarButtons(null);
    const trigger = this.lastTriggerButton;
    this.activePopup = null;
    this.lastTriggerButton = null;
    if (trigger) {
      trigger.focus();
    }
  }
}
