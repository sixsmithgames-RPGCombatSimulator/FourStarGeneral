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
  LogisticsDelayNode,
  LogisticsMaintenanceEntry,
  LogisticsAlertEntry,
  CommanderBenefits
} from "../../game/GameEngine";
import {
  getReconIntelSnapshot as buildFallbackReconIntelSnapshot,
  type ReconIntelSnapshot,
  type ReconIntelAlert,
  type ReconIntelBrief,
  type ReconIntelSectorReport,
  type ReconIntelConfidence,
  type ReconIntelTimeframe
} from "../../data/reconIntelSnapshot";
import { getAllGenerals, type GeneralRosterEntry } from "../../utils/rosterStorage";
import type { WarRoomOverlay } from "./WarRoomOverlay";
import type { GameEngineAPI } from "../../game/GameEngine";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { axialKey } from "../../core/Hex";
import unitTypesSource from "../../data/unitTypes.json";

/**
 * Content structure for popup dialogs.
 */
interface PopupContent {
  title: string;
  body: string;
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
  private readonly airPickListener: (event: Event) => void;

  /** Cached recon/intel payload hydrated when the commander opens either panel. */
  private reconIntelSnapshot: ReconIntelSnapshot | null = null;
  /** Active timeframe filter controlling which intel briefs render. */
  private reconIntelTimeframe: ReconIntelTimeframe | "all" = "all";
  /** Active confidence filter controlling how uncertain intel is presented. */
  private reconIntelConfidence: ReconIntelConfidence | "all" = "all";

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

      if (this.airPickMode) {
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
          const panel = this.popupBody.querySelector<HTMLElement>("[data-air-panel]");
          const fb = panel?.querySelector<HTMLElement>("[data-air-feedback]");
          fb && (fb.textContent = "Click a hex on the map to select a target.");
        }
        return;
      }

      this.closePopup();
    });

    // Provide Escape-key dismissal for keyboard users.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.activePopup && this.activePopup !== "baseOperations") {
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

    this.renderIntelPanel();
  }

  /**
   * Renders the Intelligence panel: alert banner + filtered intelligence briefs with confidence labels.
   */
  private renderIntelPanel(): void {
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

    const list = this.popupBody.querySelector<HTMLElement>("[data-intel-brief-list]");
    if (!list) {
      return;
    }
    const briefs = this.reconIntelSnapshot.intelBriefs.filter((b) => this.matchesReconIntelFilters(b.timeframe, b.confidence));
    list.innerHTML = briefs.length === 0
      ? '<div class="intel-empty">No intelligence briefs match the selected filters.</div>'
      : briefs.map((b) => this.composeReconIntelBriefMarkup(b)).join("");
  }

  /**
   * Renders the Recon panel: last-turn reports from reconnaissance units only.
   * We scope to timeframe "last" per design until live sensor sources can refine this further.
   */
  private renderReconPanel(): void {
    if (!this.reconIntelSnapshot) {
      return;
    }
    const list = this.popupBody.querySelector<HTMLElement>("[data-recon-report-list]");
    if (!list) {
      return;
    }
    const lastTurnSectors = this.reconIntelSnapshot.sectors.filter((s) => s.timeframe === "last");
    list.innerHTML = lastTurnSectors.length === 0
      ? '<div class="recon-report-empty">No last-turn reconnaissance reports available.</div>'
      : lastTurnSectors.map((s) => this.composeReconReportCard(s)).join("");
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
    // Handle special popup types
    if (key === "baseOperations") {
      this.openBaseOperationsPopup(key, trigger);
      return;
    }

    if (key === "recon") {
      this.openReconPopup(key, trigger);
      return;
    }

    if (key === "intelligence") {
      this.openIntelPopup(key, trigger);
      return;
    }

    if (key === "airSupport") {
      this.openAirSupportPopup(key, trigger);
      return;
    }

    // Standard popup handling
    const content = getPopupContent(key);
    if (!content) {
      console.warn(`No content defined for popup key: ${key}`);
      return;
    }

    this.showPopup(key, content, trigger);
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
    this.showPopup(key, content, trigger);
    this.renderAirSupportPanel();
  }

  /** Renders the Air Support panel summary chips, mission list, and scheduling form. */
  private renderAirSupportPanel(): void {
    // Defensive guard: panel may not be mounted yet
    const panel = this.popupBody.querySelector<HTMLElement>("[data-air-panel]");
    if (!panel) {
      return;
    }
    let engine: GameEngineAPI | null = null;
    try {
      engine = this.battleState.ensureGameEngine();
    } catch (e) {
      console.warn("Air Support panel: GameEngine unavailable", e);
      return;
    }

    // Summary chips
    try {
      if (!engine) return;
      const summary = engine.getAirSupportSummary();
      const setText = (sel: string, v: number) => {
        const el = panel.querySelector<HTMLElement>(sel);
        if (el) el.textContent = String(v);
      };
      setText("[data-air-queued]", summary.queued);
      setText("[data-air-inflight]", summary.inFlight);
      setText("[data-air-resolving]", summary.resolving);
      setText("[data-air-completed]", summary.completed);
      setText("[data-air-refit]", summary.refit);
    } catch {
      // Keep panel resilient if summary fails
    }

    // Mission roster
    const list = panel.querySelector<HTMLUListElement>("[data-air-mission-list]");
    if (list && engine) {
      this.renderAirMissionList(list, engine);
    }

    // Populate mission kind selector (escort disabled until a bomber strike exists)
    const kindSelect = panel.querySelector<HTMLSelectElement>("[data-air-mission-kind]");
    if (kindSelect && engine) {
      this.populateAirMissionKind(kindSelect, engine);
      this.disableEscortUnlessBomberScheduled(kindSelect, engine);
    }

    // Bind Refresh button
    const refreshBtn = panel.querySelector<HTMLButtonElement>("[data-air-refresh]");
    if (refreshBtn) {
      refreshBtn.onclick = () => this.renderAirSupportPanel();
    }

    // Bind scheduling form (dropdown flow: Mission → Squadron → Target)
    const form = panel.querySelector<HTMLFormElement>("[data-air-form]");
    const unitSelect = panel.querySelector<HTMLSelectElement>("[data-air-unit-select]");
    const targetSelect = panel.querySelector<HTMLSelectElement>("[data-air-target-select]");
    if (form && kindSelect && unitSelect && targetSelect && engine) {
      // When mission changes, repopulate unit and target dropdowns
      kindSelect.onchange = () => {
        this.disableEscortUnlessBomberScheduled(kindSelect, engine);
        const kind = (kindSelect.value ?? "") as any;
        this.populateEligibleSquadrons(unitSelect, engine, kind);
        this.populateTargets(targetSelect, engine, kind);
      };
      // Seed initial dropdown population and enable/disable escort based on current missions
      this.disableEscortUnlessBomberScheduled(kindSelect, engine);
      const initialKind = (kindSelect.value ?? "") as any;
      this.populateEligibleSquadrons(unitSelect, engine, initialKind);
      this.populateTargets(targetSelect, engine, initialKind);

      form.onsubmit = (ev) => {
        ev.preventDefault();
        const feedback = panel.querySelector<HTMLElement>("[data-air-feedback]");
        const kind = (kindSelect.value ?? "") as any;
        const unitVal = unitSelect.value ?? "";
        const targetVal = targetSelect.value ?? "";
        const unitHex = this.parseAxialString(unitVal);
        const parsedTarget = this.parseAxialString(targetVal);

        if (!unitHex) {
          feedback && (feedback.textContent = "Unit hex is required (format q,r)");
          return;
        }

        const request: any = { kind, faction: engine.activeFaction, unitHex };
        // Determine template requirements
        let requiresTarget = false;
        let requiresEscort = false;
        try {
          const templates = engine.listAirMissionTemplates();
          const tpl = templates.find((t) => t.kind === kind);
          requiresTarget = !!tpl?.requiresTarget;
          requiresEscort = !!tpl?.requiresFriendlyEscortTarget;
        } catch {}

        if (requiresTarget) {
          if (!parsedTarget) {
            feedback && (feedback.textContent = "Target is required by this mission.");
            return;
          }
          request.targetHex = parsedTarget;
        }
        if (requiresEscort) {
          if (!parsedTarget) {
            feedback && (feedback.textContent = "Escort target is required by this mission.");
            return;
          }
          // For escort, the target dropdown lists friendly bomber hexes
          request.escortTargetHex = parsedTarget;
        }

        // Confirmation: summarize mission parameters and potential refit impact so the commander explicitly approves.
        try {
          const refitTurns = engine.getAircraftRefitTurns(unitHex as any);
          const parts: string[] = [];
          parts.push(`Confirm ${String(kind)} mission`);
          parts.push(`Unit: ${unitHex.q},${unitHex.r}`);
          if (request.targetHex) {
            parts.push(`Target: ${request.targetHex.q},${request.targetHex.r}`);
          }
          if (request.escortTargetHex) {
            parts.push(`Escort: ${request.escortTargetHex.q},${request.escortTargetHex.r}`);
          }
          if (typeof refitTurns === "number") {
            parts.push(`Refit: ${refitTurns} turn(s) after sortie`);
          }
          const confirmed = window.confirm(parts.join("\n"));
          if (!confirmed) {
            feedback && (feedback.textContent = "Scheduling cancelled.");
            return;
          }
        } catch {
          // If refit preview fails, proceed without blocking but still try to schedule.
        }

        const result = engine.tryScheduleAirMission(request);
        if (result.ok) {
          feedback && (feedback.textContent = `Mission scheduled (#${result.missionId}).`);
          this.renderAirSupportPanel();
          this.battleState.emitBattleUpdate("missionUpdated");
        } else {
          // Surface the human-readable reason without exposing internal error codes like NOT_AIRCRAFT.
          feedback && (feedback.textContent = result.reason);
        }
      };
    }
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

  /** Renders the mission roster with cancel actions for queued sorties. */
  private renderAirMissionList(list: HTMLUListElement, engine: GameEngineAPI): void {
    const missions = engine.getScheduledAirMissions();
    if (!missions || missions.length === 0) {
      list.innerHTML = '<li class="air-mission-item">No air missions scheduled.</li>';
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
    const compose = (m: { id: string; kind: string; status: string; unitType: string; targetHex?: { q: number; r: number }; escortTargetUnitKey?: string; outcome?: { result: string; details: string; damageInflicted?: number; defenderDestroyed?: boolean; defenderType?: string } }): string => {
      const status = m.status;
      // Show "Base CAP" for Air Cover missions without a specific target hex.
      let target: string;
      if (m.targetHex) {
        target = `${m.targetHex.q},${m.targetHex.r}`;
      } else if (m.kind === "airCover") {
        target = "Base CAP";
      } else {
        target = resolveSquadronLabel(m.escortTargetUnitKey);
      }
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
          <div class="air-mission-line">
            <strong>${this.escapeHtml(String(m.kind))}</strong>
            <span class="air-badge">${this.escapeHtml(String(status))}</span>
          </div>
          <div class="air-mission-line">
            <span>Unit: ${this.escapeHtml(String(m.unitType))}</span>
            <span>Target: ${this.escapeHtml(target)}</span>
            <div class="air-actions">${cancel}</div>
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
    if (this.activePopup !== "airSupport" || !this.airPickMode) {
      return;
    }
    const panel = this.popupBody.querySelector<HTMLElement>("[data-air-panel]");
    if (!panel) {
      this.airPickMode = null;
      return;
    }
    const key = event.detail?.offsetKey ?? "";
    const parts = key.split(",");
    if (parts.length !== 2) {
      this.airPickMode = null;
      return;
    }
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      this.airPickMode = null;
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(col, row);
    const value = `${axial.q},${axial.r}`;
    if (this.airPickMode === "target") {
      const select = panel.querySelector<HTMLSelectElement>("[data-air-target-select]");
      if (select) {
        const hasOption = Array.from(select.options).some((o) => o.value === value);
        if (!hasOption) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        }
        select.value = value;
      }
    } else if (this.airPickMode === "escort") {
      const select = panel.querySelector<HTMLSelectElement>("[data-air-target-select]");
      if (select) {
        const hasOption = Array.from(select.options).some((o) => o.value === value);
        if (!hasOption) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        }
        select.value = value;
      }
    }
    const fb = panel.querySelector<HTMLElement>("[data-air-feedback]");
    fb && (fb.textContent = `Selected ${value} for ${this.airPickMode === "target" ? "Target" : "Escort"}.`);
    // Clear any temporary range overlay once a pick is made.
    document.dispatchEvent(new CustomEvent("air:clearPreview"));
    this.airPickMode = null;
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
    this.reconIntelSnapshot = this.requestReconIntelSnapshot();

    this.initializeIntelPanel();
  }

  /**
   * Hides the popup layer.
   */
  private hidePopupLayer(): void {
    this.popupLayer.classList.add("hidden");
    this.popupLayer.setAttribute("aria-hidden", "true");
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
        <header><h4>Reserves</h4></header>
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
      ? `<button type="button" class="roster-deploy-btn" data-roster-deploy="${this.escapeHtml(entry.unitKey)}" aria-label="Deploy ${this.escapeHtml(entry.label)} from reserves">Deploy</button>`
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
    const { serviceRecord, identity } = profile;

    if (serviceRecord) {
      parts.push(
        `${identity.name} has led ${serviceRecord.missionsCompleted} mission${serviceRecord.missionsCompleted === 1 ? "" : "s"} with ${serviceRecord.victoriesAchieved} victory${serviceRecord.victoriesAchieved === 1 ? "" : "ies"}.`
      );
      parts.push(`Units deployed: ${serviceRecord.unitsDeployed}. Casualties sustained: ${serviceRecord.casualtiesSustained}.`);
    } else {
      parts.push("Operational history is still being compiled for this commander.");
    }

    if (identity.schoolLabel) {
      parts.push(`${identity.name} is a graduate of ${identity.schoolLabel}, reinforcing doctrinal discipline.`);
    }

    return parts.join(" ");
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
    const availability: Record<TurnFaction, boolean> = {
      Player: Boolean(playerSnapshot),
      Bot: Boolean(botSnapshot)
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
    // Present depot totals up top so commanders grasp overall stockpile health before diving into category cards.
    const depotAmmo = this.formatQuantity(snapshot.stockpile?.ammo ?? 0);
    const depotFuel = this.formatQuantity(snapshot.stockpile?.fuel ?? 0);
    const depotRations = this.formatQuantity(snapshot.stockpile?.rations ?? 0);
    const depotParts = this.formatQuantity(snapshot.stockpile?.parts ?? 0);
    const depotCopy = [
      `${depotAmmo} ammo`,
      `${depotFuel} fuel`,
      `${depotRations} rations`,
      `${depotParts} parts`
    ].join(" · ");

    return `
      <div class="supplies-overview">
        <p><strong>Turn:</strong> ${snapshot.turn}</p>
        <p><strong>Phase:</strong> ${snapshot.phase}</p>
        <p><strong>Last Updated:</strong> ${this.formatDate(snapshot.updatedAt)}</p>
        <p><strong>Depot Stock:</strong> ${depotCopy}</p>
      </div>
    `;
  }

  private composeSupplyCategoryCard(category: SupplyCategorySnapshot): string {
    const { resource, label, total, frontlineTotal, reserveTotal, stockpileTotal, averagePerUnit, consumptionPerTurn, estimatedDepletionTurns, status } = category;
    const statusLabel = status === "unknown" ? "Data Pending" : status.toUpperCase();
    const depletionCopy = estimatedDepletionTurns !== null ? `${estimatedDepletionTurns} turn${estimatedDepletionTurns === 1 ? "" : "s"}` : "N/A";
    const formattedDelta = this.formatDelta(consumptionPerTurn);
    // Highlight how stock is distributed so commanders can quickly spot imbalances between frontline and reserve pools.
    const gaugeMarkup = this.composeSupplyGauge(frontlineTotal, reserveTotal, stockpileTotal, total);
    const stockpileMarkup = this.composeStockpileSection(stockpileTotal, resource);

    return `
      <article class="supplies-card" data-supplies-resource="${resource}">
        <header class="supplies-card__header">
          <h4>${label}</h4>
          <span class="supplies-card__status supplies-card__status--${status}">${statusLabel}</span>
        </header>
        ${gaugeMarkup}
        ${stockpileMarkup}
        <dl class="supplies-card__metrics">
          <div><dt>Total</dt><dd>${this.formatQuantity(total)}</dd></div>
          <div><dt>Frontline</dt><dd>${this.formatQuantity(frontlineTotal)}</dd></div>
          <div><dt>Reserves</dt><dd>${this.formatQuantity(reserveTotal)}</dd></div>
          <div><dt>Avg / Unit</dt><dd>${this.formatQuantity(averagePerUnit)}</dd></div>
          <div><dt>Delta / Turn</dt><dd>${formattedDelta}</dd></div>
          <div><dt>Depletion</dt><dd>${depletionCopy}</dd></div>
        </dl>
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
   * Renders the Logistics panel showing supply routes, stockpiles, convoy status, and maintenance backlog.
   */
  private renderLogisticsPanel(): void {
    const panel = this.popupBody.querySelector<HTMLElement>("#logisticsPanel");
    if (!panel) {
      return;
    }

    const snapshot = this.pullLogisticsSnapshot();
    if (!snapshot) {
      const emptyMessage = `<div class="logistics-panel__empty">Logistics data becomes available once the battle engine initializes and units are deployed.</div>`;
      panel.querySelectorAll("[data-logistics-sources], [data-logistics-stockpiles], [data-logistics-convoys], [data-logistics-delays], [data-logistics-maintenance], [data-logistics-alerts]")
        .forEach((container) => { container.innerHTML = emptyMessage; });
      return;
    }

    const sourcesContainer = panel.querySelector<HTMLElement>("[data-logistics-sources]");
    const stockpilesContainer = panel.querySelector<HTMLElement>("[data-logistics-stockpiles]");
    const convoysContainer = panel.querySelector<HTMLElement>("[data-logistics-convoys]");
    const delaysContainer = panel.querySelector<HTMLElement>("[data-logistics-delays]");
    const maintenanceContainer = panel.querySelector<HTMLElement>("[data-logistics-maintenance]");
    const alertsContainer = panel.querySelector<HTMLElement>("[data-logistics-alerts]");

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

    if (maintenanceContainer) {
      maintenanceContainer.innerHTML = snapshot.maintenanceBacklog.length === 0
        ? '<li class="logistics-panel__empty">No units in maintenance backlog.</li>'
        : snapshot.maintenanceBacklog.map((item) => this.composeMaintenanceItem(item)).join("");
    }

    if (alertsContainer) {
      alertsContainer.innerHTML = snapshot.alerts.length === 0
        ? '<li class="logistics-panel__empty">No logistics alerts.</li>'
        : snapshot.alerts.map((alert) => this.composeLogisticsAlert(alert)).join("");
    }
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

  /**
   * Renders a supply source card showing throughput and bottlenecks.
   */
  private composeSupplySourceCard(source: LogisticsSupplySource): string {
    const utilizationPercent = Math.round(source.utilization * 100);
    const bottleneckMarkup = source.bottleneck
      ? `<div class="logistics-source-card__bottleneck">⚠ ${this.escapeHtml(source.bottleneck)}</div>`
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

    return `
      <article class="logistics-stockpile-card">
        <div class="logistics-stockpile-card__label">${resourceLabel}</div>
        <div class="logistics-stockpile-card__total">${stockpile.total}</div>
        <div class="logistics-stockpile-card__avg">${stockpile.averagePerUnit} per unit</div>
        <span class="logistics-stockpile-card__trend logistics-stockpile-card__trend--${stockpile.trend}">${trendLabel}</span>
      </article>
    `;
  }

  /**
   * Renders a convoy status item.
   */
  private composeConvoyItem(convoy: LogisticsConvoyStatusEntry): string {
    const statusLabel = convoy.status === "onSchedule" ? "On Schedule" : convoy.status === "delayed" ? "Delayed" : "Blocked";

    return `
      <li class="logistics-convoy-item">
        <div class="logistics-convoy-item__route">${this.escapeHtml(convoy.route)}</div>
        <span class="logistics-convoy-item__status logistics-convoy-item__status--${convoy.status}">${statusLabel}</span>
        <span class="logistics-convoy-item__eta">ETA: ${convoy.etaHours}h</span>
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
