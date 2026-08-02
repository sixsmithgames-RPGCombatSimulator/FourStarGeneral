import type { IScreenManager } from "../../contracts/IScreenManager";
import type { CampaignPendingEngagement, CampaignScenarioData, ProductionAllocation } from "../../core/campaignTypes";
import type { CampaignIntelOperationType, CampaignIntelOperationView, CampaignMapViewModel } from "../../core/campaignIntelTypes";
import { MISSION_TYPE_LABELS } from "../../game/campaign/EngagementContextBuilder";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { hexDistance } from "../../core/Hex";
import { CampaignMapRenderer } from "../../rendering/CampaignMapRenderer";
import { TRANSPORT_MODES, getDefaultTransportMode } from "../../data/transportModes";
import { MapViewport } from "../controls/MapViewport";
import { computeDailyProduction, ensureCampaignState } from "../../state/CampaignState";
import { ensureUnlockState } from "../../state/UnlockState";

interface CampaignScreenStatusMessage {
  title: string;
  detail: string;
  action: string;
  tone: "info" | "success" | "warning";
}

export class CampaignScreen {
  private readonly screenManager: IScreenManager;
  private readonly campaignState = ensureCampaignState();
  private readonly renderer: CampaignMapRenderer;
  private readonly unlockState = ensureUnlockState();
  private element: HTMLElement;
  private economyContainer: HTMLElement | null = null;
  private productionContainer: HTMLElement | null = null;
  private productionManageButton: HTMLButtonElement | null = null;
  private selectionContainer: HTMLElement | null = null;
  private queueEngagementButton: HTMLButtonElement | null = null;
  private advanceSegmentButton: HTMLButtonElement | null = null;
  private timeDisplayElement: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private loadButton: HTMLButtonElement | null = null;
  private exitButton: HTMLButtonElement | null = null;
  private selectedHexKey: string | null = null;
  private selectedFrontKey: string | null = null;
  private moveOriginHexKey: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private onQueueEngagement: (() => void) | null = null;
  private viewport: MapViewport | null = null;
  private editMode = false;
  private editModeButton: HTMLButtonElement | null = null;
  private exportJSONButton: HTMLButtonElement | null = null;
  private editPanel: HTMLElement | null = null;
  // Tracks a temporary set of hexes selected via click-and-drag while marking terrain in edit mode.
  private bulkTerrainSelection = new Set<string>();
  // Records whether the left mouse button is currently dragging across the map in edit mode.
  private terrainDragActive = false;
  // Ensures pointer handlers for terrain dragging are only bound to the SVG once.
  private terrainDragHandlersAttached = false;
  // Stores the first corner of a rectangular selection when Ctrl+Click is used.
  private rectSelectionCorner: string | null = null;
  private campaignStatusMessage: CampaignScreenStatusMessage | null = null;
  // Overlay shown while campaign mode is locked. Kept as an overlay (not an innerHTML swap)
  // so late-arriving auth resolution (Clerk loads asynchronously) can unlock without a rebuild.
  private lockOverlay: HTMLElement | null = null;
  private intelDrawer: HTMLElement | null = null;
  private intelSummary: HTMLElement | null = null;
  private intelUnreadBadge: HTMLElement | null = null;
  private intelCoverageButton: HTMLButtonElement | null = null;
  private intelTab: "situation" | "contacts" | "operations" = "situation";
  private intelOperationType: CampaignIntelOperationType = "groundRecon";
  private intelTargetContactId: string | null = null;
  private intelFeedback = "";
  private intelCoverageVisible = false;

  constructor(screenManager: IScreenManager, renderer: CampaignMapRenderer) {
    this.screenManager = screenManager;
    this.renderer = renderer;
    const el = document.getElementById("campaignScreen");
    if (!el) {
      throw new Error("Campaign screen element (#campaignScreen) not found in DOM");
    }
    this.element = el;
  }
  
  /**
   * (Re)binds the pan/zoom viewport after a render. Each render rebuilds the SVG contents,
   * which recreates #viewportRoot — MapViewport must be pointed at the live group and the
   * previous camera reapplied, or zoom/pan silently stops working after the first re-render.
   */
  private syncViewportAfterRender(): void {
    if (!this.viewport) {
      try {
        this.viewport = new MapViewport("#campaignHexMap");
        this.bindCampaignControls();
      } catch {
        // Defensive: viewport optional in tests / minimal DOMs
        return;
      }
    }
    const root = this.renderer.getViewportRoot();
    if (root) {
      this.viewport.setViewportRoot(root);
      const t = this.viewport.getTransform();
      this.viewport.setTransform(t.zoom, t.panX, t.panY);
    }
  }

  /** Renders only the Player knowledge projection. Raw enemy truth never reaches the map renderer. */
  private renderCampaignMap(): void {
    const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
    const canvas = this.element.querySelector<HTMLDivElement>("#campaignMapCanvas");
    const view = this.campaignState.getCampaignMapView("Player");
    if (!svg || !canvas || !view) return;
    this.renderer.render(svg, canvas, view);
    this.renderer.setTerrainOverlayVisible(this.editMode);
    this.renderer.setIntelCoverageVisible(this.intelCoverageVisible);
    this.syncViewportAfterRender();
  }

  /** Binds campaign zoom/pan buttons present in the sidebar to MapViewport operations. */
  private bindCampaignControls(): void {
    if (!this.viewport) return;
    const zoomIn = this.element.querySelector<HTMLButtonElement>("#campaignZoomIn");
    const zoomOut = this.element.querySelector<HTMLButtonElement>("#campaignZoomOut");
    const reset = this.element.querySelector<HTMLButtonElement>("#campaignResetView");
    const pans = Array.from(this.element.querySelectorAll<HTMLButtonElement>("[data-campaign-pan]"));
    zoomIn?.addEventListener("click", () => this.viewport?.adjustZoom(0.2));
    zoomOut?.addEventListener("click", () => this.viewport?.adjustZoom(-0.2));
    reset?.addEventListener("click", () => this.viewport?.reset());
    pans.forEach((btn) =>
      btn.addEventListener("click", () => {
        const dir = btn.dataset.campaignPan;
        const step = 64;
        switch (dir) {
          case "up":
            this.viewport?.pan(0, step);
            break;
          case "down":
            this.viewport?.pan(0, -step);
            break;
          case "left":
            this.viewport?.pan(step, 0);
            break;
          case "right":
            this.viewport?.pan(-step, 0);
            break;
        }
      })
    );
  }

  /**
   * Opens the redeployment planner. Transport modes render as selectable cards (invalid modes
   * disabled with the reason), units use sliders with quick-pick buttons, and the summary is a
   * live engine-accurate preview via CampaignState.previewRedeploy — so Confirm can never queue
   * an order the engine would reject.
   */
  private openRedeployModal(originOffsetKey: string, destOffsetKey: string): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    if (!layer || !dialog || !title || !body || !close) return;

    const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
    if (!scenario) return;
    const parse = (key: string) => CoordinateSystem.parseHexKey(key)!;
    const a = parse(originOffsetKey);
    const b = parse(destOffsetKey);
    const aAx = CoordinateSystem.offsetToAxial(a.col, a.row);
    const bAx = CoordinateSystem.offsetToAxial(b.col, b.row);
    const distance = Math.max(1, hexDistance(aAx, bAx));
    const hexKm = scenario.hexScaleKm ?? 10;

    const originTile = scenario.tiles.find((t) => t.hex.q === aAx.q && t.hex.r === aAx.r);
    const destTile = scenario.tiles.find((t) => t.hex.q === bAx.q && t.hex.r === bAx.r);
    const originForces = (originTile?.forces ?? []).map((g) => ({ unitType: g.unitType, count: g.count }));
    if (!originTile || originForces.length === 0) return;

    const originRole = scenario.tilePalette[originTile.tile]?.role ?? null;
    const destRole = destTile ? (scenario.tilePalette[destTile.tile]?.role ?? null) : null;

    // Card presentation for each transport mode key (data source of truth stays TRANSPORT_MODES).
    const MODE_PRESENTATION: Record<string, { icon: string; name: string; note: string }> = {
      foot: { icon: "🥾", name: "March", note: "Infantry only" },
      truck: { icon: "🚚", name: "Truck", note: "Infantry & towed guns" },
      armor: { icon: "🛡️", name: "Motorized", note: "Vehicles move themselves" },
      naval: { icon: "🚢", name: "Sea Lift", note: "Via transport ships" },
      warship: { icon: "⚓", name: "Warship", note: "Combat vessels" },
      fighter: { icon: "✈️", name: "Fighter Ferry", note: "Airbase to airbase" },
      bomber: { icon: "🛩️", name: "Bomber Ferry", note: "Airbase to airbase" }
    };

    /** Reason a mode is unusable for this origin/destination/garrison, or null if usable. */
    const modeBlockReason = (key: string): string | null => {
      const mode = TRANSPORT_MODES[key];
      if (!mode) return "Unknown mode";
      if (mode.applicableUnitTypes && mode.applicableUnitTypes.length > 0) {
        const anyUnit = originForces.some((g) => mode.applicableUnitTypes!.includes(g.unitType));
        if (!anyUnit) return "No units here can use this";
      }
      if (mode.requiresNavalBase && originRole !== "navalBase" && destRole !== "navalBase") {
        return "Needs a naval base at either end";
      }
      if (mode.requiresAirbase && (originRole !== "airbase" || destRole !== "airbase")) {
        return "Needs airbases at both ends";
      }
      return null;
    };

    // Default mode: recommended mode of the largest usable force group, else first usable mode.
    const sortedForces = [...originForces].sort((x, y) => y.count - x.count);
    let selectedModeKey = "foot";
    let defaulted = false;
    for (const g of sortedForces) {
      const candidate = getDefaultTransportMode(g.unitType);
      if (!modeBlockReason(candidate)) {
        selectedModeKey = candidate;
        defaulted = true;
        break;
      }
    }
    if (!defaulted) {
      const fallback = Object.keys(TRANSPORT_MODES).find((k) => !modeBlockReason(k));
      if (fallback) selectedModeKey = fallback;
    }

    title.textContent = "Schedule Redeployment";

    const modeCards = Object.keys(TRANSPORT_MODES)
      .map((key) => {
        const mode = TRANSPORT_MODES[key];
        const p = MODE_PRESENTATION[key] ?? { icon: "•", name: mode.label, note: "" };
        const blocked = modeBlockReason(key);
        return `
          <button type="button" class="redeploy-mode-card${blocked ? " mode-blocked" : ""}" data-mode="${key}" ${blocked ? "disabled" : ""} title="${this.escapeHtml(mode.description ?? mode.label)}">
            <span class="mode-icon">${p.icon}</span>
            <span class="mode-name">${p.name}</span>
            <span class="mode-speed">${mode.speedHexPerDay} hex / 3h</span>
            <span class="mode-note">${this.escapeHtml(blocked ?? p.note)}</span>
          </button>`;
      })
      .join("");

    const unitRows = originForces
      .map(
        (g, idx) => `
        <div class="redeploy-unit-row" data-unit-row="${idx}">
          <div class="unit-label">
            <span class="unit-name">${this.escapeHtml(g.unitType.replace(/_/g, " "))}</span>
            <span class="unit-avail">of ${g.count}</span>
          </div>
          <input type="range" min="0" max="${g.count}" value="${g.count}" data-move-slider="${idx}" aria-label="${this.escapeHtml(g.unitType)} count" />
          <input type="number" min="0" max="${g.count}" value="${g.count}" data-move-index="${idx}" />
          <div class="unit-quick">
            <button type="button" data-quick="0" data-quick-idx="${idx}" title="Leave all behind">0</button>
            <button type="button" data-quick="half" data-quick-idx="${idx}" title="Move half">½</button>
            <button type="button" data-quick="all" data-quick-idx="${idx}" title="Move all">All</button>
          </div>
          <div class="unit-note" data-unit-note="${idx}"></div>
        </div>`
      )
      .join("");

    body.innerHTML = `
      <form id="campaignRedeployForm" class="redeploy-modal">
        <div class="redeploy-route">
          <span class="route-node">${originOffsetKey}${originRole ? ` · ${this.escapeHtml(originRole)}` : ""}</span>
          <span class="route-arrow">→</span>
          <span class="route-node">${destOffsetKey}${destRole ? ` · ${this.escapeHtml(destRole)}` : ""}</span>
          <span class="route-distance">${distance} hex · ~${distance * hexKm} km</span>
        </div>
        <div class="redeploy-section-label">Transport mode</div>
        <div class="redeploy-modes">${modeCards}</div>
        <div class="redeploy-section-label">Units to move</div>
        <div class="redeploy-units">${unitRows}</div>
        <div class="redeploy-summary-panel" id="campaignRedeploySummary"></div>
        <div class="redeploy-issues" id="campaignRedeployIssues"></div>
        <div class="button-row redeploy-actions">
          <button type="submit" class="primary-button" id="campaignRedeployConfirm">Confirm Orders</button>
          <button type="button" id="campaignRedeployCancel" class="secondary-button">Cancel</button>
        </div>
      </form>
    `;

    const form = body.querySelector<HTMLFormElement>("#campaignRedeployForm");
    const summaryEl = body.querySelector<HTMLElement>("#campaignRedeploySummary");
    const issuesEl = body.querySelector<HTMLElement>("#campaignRedeployIssues");
    const confirmBtn = body.querySelector<HTMLButtonElement>("#campaignRedeployConfirm");
    const cancelBtn = body.querySelector<HTMLButtonElement>("#campaignRedeployCancel");
    if (!form || !summaryEl || !issuesEl || !confirmBtn || !cancelBtn) return;

    const numberInputs = Array.from(body.querySelectorAll<HTMLInputElement>("[data-move-index]"));
    const sliders = Array.from(body.querySelectorAll<HTMLInputElement>("[data-move-slider]"));
    const modeButtons = Array.from(body.querySelectorAll<HTMLButtonElement>(".redeploy-mode-card"));

    const unitAllowedInMode = (unitType: string, modeKey: string): boolean => {
      const mode = TRANSPORT_MODES[modeKey];
      if (!mode) return false;
      return !mode.applicableUnitTypes || mode.applicableUnitTypes.length === 0 || mode.applicableUnitTypes.includes(unitType);
    };

    // Units that can't ride the selected mode are excluded (they stay behind) rather than erroring.
    const currentSelections = (): Array<{ unitType: string; count: number }> =>
      originForces.map((g, i) => ({
        unitType: g.unitType,
        count: unitAllowedInMode(g.unitType, selectedModeKey)
          ? Math.max(0, Math.min(g.count, Number(numberInputs[i]?.value) || 0))
          : 0
      }));

    const fmt = (n: number) => n.toLocaleString();

    const refresh = (): void => {
      modeButtons.forEach((btnEl) => btnEl.classList.toggle("selected", btnEl.dataset.mode === selectedModeKey));

      originForces.forEach((g, i) => {
        const allowed = unitAllowedInMode(g.unitType, selectedModeKey);
        const row = body.querySelector<HTMLElement>(`[data-unit-row="${i}"]`);
        const note = body.querySelector<HTMLElement>(`[data-unit-note="${i}"]`);
        row?.classList.toggle("unit-row-disabled", !allowed);
        if (numberInputs[i]) numberInputs[i].disabled = !allowed;
        if (sliders[i]) sliders[i].disabled = !allowed;
        body.querySelectorAll<HTMLButtonElement>(`[data-quick-idx="${i}"]`).forEach((qb) => {
          qb.disabled = !allowed;
        });
        if (note) note.textContent = allowed ? "" : "Stays behind — can't travel by this mode";
      });

      const preview = this.campaignState.previewRedeploy(originOffsetKey, destOffsetKey, currentSelections(), selectedModeKey);
      if (!preview) {
        summaryEl.innerHTML = "";
        issuesEl.innerHTML = "";
        confirmBtn.disabled = true;
        return;
      }

      const etaDisplay = this.campaignState.segmentToTimeDisplay(preview.etaSegment);
      const fuelBad = preview.fuelCost > preview.fuelAvailable;
      const supBad = preview.suppliesCost > preview.suppliesAvailable;
      const capBad = preview.capacityAvailable !== null && preview.capacityNeeded > preview.capacityAvailable;
      const mode = TRANSPORT_MODES[selectedModeKey];
      const capLabel = mode?.capacityType === "trucks" ? "🚛 Trucks" : mode?.capacityType === "transportShips" ? "🚢 Ships" : "✈️ Planes";

      summaryEl.innerHTML = `
        <div class="summary-eta">Arrives <strong>${etaDisplay}</strong> · ${preview.timeSegments} segment${preview.timeSegments !== 1 ? "s" : ""} in transit</div>
        <div class="summary-grid">
          <div class="summary-cell${fuelBad ? " cost-bad" : ""}"><span>⛽ Fuel</span><strong>${fmt(preview.fuelCost)}</strong><em>of ${fmt(preview.fuelAvailable)}</em></div>
          <div class="summary-cell${supBad ? " cost-bad" : ""}"><span>📦 Supplies</span><strong>${fmt(preview.suppliesCost)}</strong><em>of ${fmt(preview.suppliesAvailable)}</em></div>
          ${mode?.capacityType ? `<div class="summary-cell${capBad ? " cost-bad" : ""}"><span>${capLabel}</span><strong>${preview.capacityNeeded}</strong><em>of ${preview.capacityAvailable ?? 0}</em></div>` : ""}
          ${preview.manpowerLoss > 0 ? `<div class="summary-cell cost-warn"><span>💀 Est. losses</span><strong>${fmt(preview.manpowerLoss)}</strong><em>men</em></div>` : ""}
        </div>
      `;

      issuesEl.innerHTML = preview.ok ? "" : preview.issues.map((issue) => `<div class="redeploy-issue">⚠ ${this.escapeHtml(issue)}</div>`).join("");
      confirmBtn.disabled = !preview.ok;
    };

    modeButtons.forEach((btnEl) =>
      btnEl.addEventListener("click", () => {
        if (btnEl.disabled) return;
        selectedModeKey = btnEl.dataset.mode ?? selectedModeKey;
        refresh();
      })
    );
    numberInputs.forEach((inp, i) =>
      inp.addEventListener("input", () => {
        const clamped = Math.max(0, Math.min(originForces[i].count, Number(inp.value) || 0));
        if (sliders[i]) sliders[i].value = String(clamped);
        refresh();
      })
    );
    sliders.forEach((sl, i) =>
      sl.addEventListener("input", () => {
        if (numberInputs[i]) numberInputs[i].value = sl.value;
        refresh();
      })
    );
    body.querySelectorAll<HTMLButtonElement>("[data-quick]").forEach((qb) =>
      qb.addEventListener("click", () => {
        const i = Number(qb.dataset.quickIdx);
        const max = originForces[i]?.count ?? 0;
        const val = qb.dataset.quick === "all" ? max : qb.dataset.quick === "half" ? Math.ceil(max / 2) : 0;
        if (numberInputs[i]) numberInputs[i].value = String(val);
        if (sliders[i]) sliders[i].value = String(val);
        refresh();
      })
    );

    refresh();

    form.onsubmit = (ev) => {
      ev.preventDefault();
      const result = this.campaignState.scheduleRedeploy(originOffsetKey, destOffsetKey, currentSelections(), selectedModeKey);
      if (!result.ok) {
        this.setCampaignStatusMessage({
          title: "Redeployment failed.",
          detail: result.reason ?? "The redeployment order could not be scheduled.",
          action: "Adjust the route, unit selection, or transport mode and try again.",
          tone: "warning"
        });
        return;
      }
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      this.setCampaignStatusMessage({
        title: "Redeployment queued.",
        detail: `Movement order logged from ${originOffsetKey} to ${destOffsetKey}.`,
        action: "Advance the campaign clock to process the transfer or queue another order.",
        tone: "success"
      });
    };
    cancelBtn.onclick = () => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
    };

    // Show popup
    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    close.onclick = () => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
    };
  }

  /**
   * Resolves which hex the battle is actually fought over.
   * Proximity engagements target the enemy tile adjacent to the selected hex; front engagements
   * target the first enemy-held hex on the front line, falling back to an enemy tile adjacent to it.
   */
  private resolveBattleHexKey(engagement: CampaignPendingEngagement): string | null {
    if (engagement.tags.includes("proximity") && engagement.hexKeys.length > 0) {
      return this.campaignState.findAdjacentEnemyHexKey(engagement.hexKeys[0]);
    }
    for (const hexKey of engagement.hexKeys) {
      if (this.campaignState.getTileOwner(hexKey) === "Bot") {
        return hexKey;
      }
    }
    for (const hexKey of engagement.hexKeys) {
      const adjacent = this.campaignState.findAdjacentEnemyHexKey(hexKey);
      if (adjacent) {
        return adjacent;
      }
    }
    return engagement.hexKeys[0] ?? null;
  }

  /**
   * Shows or hides the locked overlay based on the current unlock snapshot.
   * Auth resolves asynchronously (Clerk loads after app init), so this must be
   * re-evaluated whenever UnlockState hydrates — never decided once at startup.
   */
  private syncCampaignLockState(): void {
    if (this.unlockState.isCampaignLocked("campaign")) {
      this.showCampaignLockedOverlay();
    } else {
      this.removeCampaignLockedOverlay();
    }
  }

  /**
   * Displays a locked overlay when campaign mode is not unlocked.
   * Redirects user to pricing page for full-game subscription.
   * Rendered as an overlay so the campaign screen beneath stays intact and can be
   * revealed the moment entitlements arrive.
   */
  private showCampaignLockedOverlay(): void {
    if (this.lockOverlay) {
      return;
    }
    const purchaseUrl = this.unlockState.buildPurchaseUrlForSku("campaign");
    const overlay = document.createElement("div");
    overlay.id = "campaignLockOverlay";
    overlay.style.cssText = "position:absolute;inset:0;z-index:40;background:rgba(8,10,17,0.96);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem;text-align:center;";
    overlay.innerHTML = `
      <div style="font-size:3rem;margin-bottom:1rem;">🔒</div>
      <h1 style="font-size:2rem;font-weight:800;margin-bottom:0.5rem;letter-spacing:0.08em;text-transform:uppercase;">Campaign Locked</h1>
      <p style="color:#f5c46d;margin-bottom:2rem;max-width:500px;line-height:1.6;">
        Campaign mode requires a full-game subscription. Unlock the Western Europe offensive by subscribing to Four Star General or the All-Access Bundle.
      </p>
      <a href="${purchaseUrl}" style="background:linear-gradient(135deg,#b45309,#f5c46d);color:#080a11;padding:0.875rem 2rem;border-radius:50px;text-decoration:none;font-weight:700;font-size:1rem;">View Plans →</a>
      <button type="button" class="secondary-button" data-lock-return style="margin-top:1rem;color:#6b7280;font-size:0.875rem;background:none;border:none;cursor:pointer;text-decoration:underline;">Return to Landing Screen</button>
    `;
    overlay.querySelector<HTMLButtonElement>("[data-lock-return]")?.addEventListener("click", () => {
      this.screenManager.showScreenById("landing");
    });
    if (getComputedStyle(this.element).position === "static") {
      this.element.style.position = "relative";
    }
    this.element.appendChild(overlay);
    this.lockOverlay = overlay;
  }

  /** Removes the locked overlay once campaign access is confirmed. */
  private removeCampaignLockedOverlay(): void {
    if (this.lockOverlay) {
      this.lockOverlay.remove();
      this.lockOverlay = null;
    }
  }

  initialize(): void {
    // Gate via a live subscription rather than a one-time startup check: Clerk auth
    // resolves after initializeApplication() runs, so the entitlement snapshot here
    // may still be the guest bootstrap. The overlay reacts to hydration in both directions.
    this.unlockState.subscribe(() => this.syncCampaignLockState());

    // Capture sidebar hooks if present. These may be null in minimal DOMs (e.g. tests)
    this.economyContainer = this.element.querySelector<HTMLElement>("#campaignEconomySummary");
    this.productionContainer = this.element.querySelector<HTMLElement>("#campaignProductionSummary");
    this.productionManageButton = this.element.querySelector<HTMLButtonElement>("#campaignProductionManage");
    if (this.productionManageButton) {
      this.productionManageButton.addEventListener("click", () => this.openProductionModal());
    }
    this.selectionContainer = this.element.querySelector<HTMLElement>("#campaignSelectionInfo");
    this.queueEngagementButton = this.element.querySelector<HTMLButtonElement>("#campaignQueueEngagement");
    this.advanceSegmentButton = this.element.querySelector<HTMLButtonElement>("#campaignAdvanceSegment");
    this.timeDisplayElement = this.element.querySelector<HTMLElement>("#campaignTimeDisplay");
    this.saveButton = this.element.querySelector<HTMLButtonElement>("#campaignSave");
    this.loadButton = this.element.querySelector<HTMLButtonElement>("#campaignLoad");
    this.exitButton = this.element.querySelector<HTMLButtonElement>("#campaignExit");
    this.editModeButton = this.element.querySelector<HTMLButtonElement>("#campaignEditMode");
    this.exportJSONButton = this.element.querySelector<HTMLButtonElement>("#campaignExportJSON");
    this.editPanel = this.element.querySelector<HTMLElement>("#campaignEditPanel");
    this.intelDrawer = this.element.querySelector<HTMLElement>("#campaignIntelDrawer");
    this.intelSummary = this.element.querySelector<HTMLElement>("#campaignIntelSummary");
    this.intelUnreadBadge = this.element.querySelector<HTMLElement>("#campaignIntelUnread");
    this.intelCoverageButton = this.element.querySelector<HTMLButtonElement>("#campaignIntelCoverage");
    this.bindCampaignIntelControls();

    if (this.advanceSegmentButton) {
      // Clicking the advance segment button progresses the campaign by 3 hours (1 segment)
      this.advanceSegmentButton.addEventListener("click", () => {
        this.campaignState.advanceSegment();
      });
    }

    // Speed control buttons
    const speedButtons = this.element.querySelectorAll<HTMLButtonElement>(".speed-btn");
    speedButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        // Remove active class from all speed buttons
        speedButtons.forEach((b) => b.classList.remove("active"));
        // Add active class to clicked button
        btn.classList.add("active");

        const speed = parseInt(btn.dataset.speed ?? "1", 10);
        // Note: For now we just show the selected speed. Future enhancement could implement
        // auto-advancement based on the selected speed multiplier.
        console.log(`Game speed set to ${speed}x`);
      });
    });

    if (this.saveButton) {
      this.saveButton.addEventListener("click", () => this.saveCampaignSession());
    }
    if (this.loadButton) {
      this.loadButton.addEventListener("click", () => this.loadCampaignSession());
    }
    if (this.exitButton) {
      this.exitButton.addEventListener("click", () => this.screenManager.showScreenById("landing"));
    }

    if (this.editModeButton) {
      this.editModeButton.addEventListener("click", () => this.toggleEditMode());
    }

    if (this.exportJSONButton) {
      this.exportJSONButton.addEventListener("click", () => this.exportCampaignJSON());
    }

    this.initializeEditModeControls();

    if (this.queueEngagementButton) {
      // Clicking the button queues a pending engagement for the currently selected front
      this.queueEngagementButton.addEventListener("click", () => {
        const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
        if (!scenario) return;
        const existing = this.campaignState.getPendingEngagements();
        const id = `eng_${Date.now()}`;
        let engagement: CampaignPendingEngagement | null = null;
        // Prefer front-driven engagement if a front is selected
        if (this.selectedFrontKey) {
          const front = scenario.fronts.find((f) => f.key === this.selectedFrontKey);
          if (!front) return;
          engagement = {
            id,
            frontKey: front.key,
            objectiveKey: null,
            attacker: front.initiative,
            defender: front.initiative === "Player" ? "Bot" : "Player",
            hexKeys: front.hexKeys.slice(),
            tags: ["front"]
          };
        } else if (this.selectedHexKey && this.campaignState.isAdjacentToEnemy(this.selectedHexKey)) {
          // Hex-proximity engagement when player forces are near enemy forces
          engagement = {
            id,
            frontKey: null,
            objectiveKey: null,
            attacker: "Player",
            defender: "Bot",
            hexKeys: [this.selectedHexKey],
            tags: ["proximity"]
          };
        } else {
          return;
        }

        // Capture the strategic context (mission type, forces in position, enemy pool, budget)
        // so precombat can honor the situation on the map. Failure to build context falls back
        // to the legacy generic flow rather than blocking the queue.
        const battleHexKey = this.resolveBattleHexKey(engagement);
        if (battleHexKey) {
          const context = this.campaignState.buildCampaignEngagementContext({
            engagementId: id,
            battleHexKey,
            attacker: engagement.attacker,
            frontKey: engagement.frontKey,
            objectiveKey: engagement.objectiveKey
          }, "Player");
          if (context) {
            // The battle generator keeps truth internally; commitment UI uses the frozen faction briefing.
            const briefing = context.intelligenceBriefing;
            const assessedDanger = briefing?.resistanceBand === "heavy" || briefing?.resistanceBand === "overwhelming";
            if (assessedDanger) {
              const proceed = window.confirm(
                `${MISSION_TYPE_LABELS[context.missionType]} at ${battleHexKey}.\n\n${briefing.summary}\nConfidence: ${briefing.confidenceBand}.\n\nLaunch anyway — we understand the intelligence risk?`
              );
              if (!proceed) {
                return;
              }
            }
            engagement.context = context;
          }
        }

        existing.push(engagement);
        this.campaignState.setPendingEngagements(existing);
        this.campaignState.setActiveEngagementId(id);
        this.renderSelection();
        // If the app provided a transition handler, invoke it now to proceed into precombat.
        if (this.onQueueEngagement) {
          this.onQueueEngagement();
        }
      });
    }

    // Subscribe to campaign state changes so the sidebar reflects latest data
    this.unsubscribe = this.campaignState.subscribe((reason) => {
      // On scenario mutations (e.g., post-battle outcome), re-render the map so fronts/economy refresh visually.
      if (reason === "scenarioLoaded" || reason === "intelligenceUpdated" || reason === "dayAdvanced") {
        this.renderCampaignMap();
      }
      // On day advancement, update the day counter and economy display
      if (reason === "dayAdvanced") {
        this.renderTimeDisplay();
      }
      this.renderEconomy();
      this.renderProduction();
      this.renderSelection();
      this.renderCampaignIntel();
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  renderScenario(scenario: CampaignScenarioData): void {
    this.campaignState.setScenario(scenario);
    const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
    const canvas = this.element.querySelector<HTMLDivElement>("#campaignMapCanvas");
    if (!svg || !canvas) {
      return;
    }
    this.renderCampaignMap();
    this.bindTerrainEditDragHandlers(svg);
    // Handle hex clicks by recording selection and detecting if the hex is part of a front
    this.renderer.onHexClick((hexKey) => {
      const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
      if (this.campaignStatusMessage) {
        this.campaignStatusMessage = null;
      }
      if (this.campaignState.getHeadquartersStatusMessage()) {
        this.campaignState.setHeadquartersStatusMessage(null);
      }
      this.selectedFrontKey = null;
      // Front selection path
      if (scenario && scenario.fronts && scenario.fronts.length > 0) {
        for (const f of scenario.fronts) {
          if (f.hexKeys.includes(hexKey)) {
            this.selectedFrontKey = f.key;
            break;
          }
        }
      }

      // Skip movement/redeployment logic when in edit mode
      if (!this.editMode) {
        // Movement: if an origin is primed, move adjacent immediately; otherwise open redeploy scheduler for non-adjacent
        if (this.moveOriginHexKey && this.moveOriginHexKey !== hexKey) {
          const a = CoordinateSystem.parseHexKey(this.moveOriginHexKey);
          const b = CoordinateSystem.parseHexKey(hexKey);
          if (a && b) {
            // Convert offset to axial
            const aAx = CoordinateSystem.offsetToAxial(a.col, a.row);
            const bAx = CoordinateSystem.offsetToAxial(b.col, b.row);
            const d = hexDistance(aAx, bAx);
            if (d === 1) {
              this.campaignState.moveForces(this.moveOriginHexKey, hexKey);
            } else if (d > 1) {
              this.openRedeployModal(this.moveOriginHexKey, hexKey);
            }
          }
          this.moveOriginHexKey = null;
          this.selectedHexKey = hexKey;
          // Update selection highlights
          this.renderer.clearAllHighlights("selected");
          this.renderer.clearAllHighlights("origin");
          if (this.selectedHexKey) this.renderer.highlightHex(this.selectedHexKey, "selected");
          this.renderSelection();
          return;
        }

        // If no origin is primed: select this hex. If it belongs to the Player and has forces, prime as move origin.
        this.selectedHexKey = hexKey;
        if (scenario) {
          const parsed = CoordinateSystem.parseHexKey(hexKey);
          if (parsed) {
            const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
            const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);
            if (tile) {
              const owner = tile.factionControl ?? scenario.tilePalette[tile.tile]?.factionControl;
              const hasForces = Array.isArray(tile.forces) && tile.forces.length > 0;
              if (owner === "Player" && hasForces) {
                this.moveOriginHexKey = hexKey;
              }
            }
          }
        }
      } else {
        // In edit mode, just select the hex
        this.selectedHexKey = hexKey;
        this.moveOriginHexKey = null;
      }
      // Update selection highlights
      this.renderer.clearAllHighlights("selected");
      this.renderer.clearAllHighlights("origin");
      if (this.moveOriginHexKey) this.renderer.highlightHex(this.moveOriginHexKey, "origin");
      if (this.selectedHexKey) this.renderer.highlightHex(this.selectedHexKey, "selected");
      this.renderSelection();
      this.renderCampaignIntel();
    });

    // Initial sidebar render
    this.renderTimeDisplay();
    this.renderEconomy();
    this.renderProduction();
    this.renderSelection();
    this.renderCampaignIntel();
  }

  /** Binds pointer handlers used to drag-select hexes for bulk terrain marking in edit mode. */
  private bindTerrainEditDragHandlers(svg: SVGSVGElement): void {
    if (this.terrainDragHandlersAttached) {
      return;
    }

    const downHandler = (event: PointerEvent): void => this.handleTerrainPointerDown(event);
    const moveHandler = (event: PointerEvent): void => this.handleTerrainPointerMove(event);
    const upHandler = (event: PointerEvent): void => this.handleTerrainPointerUp(event);

    svg.addEventListener("pointerdown", downHandler);
    svg.addEventListener("pointermove", moveHandler);
    svg.addEventListener("pointerup", upHandler);
    svg.addEventListener("pointerleave", upHandler);

    this.terrainDragHandlersAttached = true;
  }

  /** Allows the app shell to provide a transition routine when an engagement is queued. */
  setQueueEngagementHandler(handler: (() => void) | null): void {
    this.onQueueEngagement = handler;
  }

  /** Updates the campaign time display. */
  private renderTimeDisplay(): void {
    if (!this.timeDisplayElement) {
      return;
    }
    const timeDisplay = this.campaignState.getCurrentTimeDisplay();
    this.timeDisplayElement.textContent = timeDisplay;
  }

  /** Updates the economy summary sidebar using the loaded scenario economies. */
  private renderEconomy(): void {
    if (!this.economyContainer) {
      return;
    }
    const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
    if (!scenario) {
      this.economyContainer.innerHTML = "";
      return;
    }

    // Format numbers with thousands separators
    const fmt = (n: number) => n.toLocaleString();

    // Color coding for resource levels
    const getResourceColor = (current: number, threshold: number) => {
      if (current > threshold * 2) return "rgba(100, 220, 120, 0.9)"; // Green - abundant
      if (current > threshold) return "rgba(200, 220, 140, 0.9)"; // Yellow-green - good
      if (current > threshold * 0.5) return "rgba(255, 200, 100, 0.9)"; // Orange - low
      return "rgba(255, 120, 120, 0.9)"; // Red - critical
    };

    const rows = scenario.economies
      .filter((economy) => economy.faction === "Player")
      .map((e) => {
        const transportCap = e.transportCapacity;
        const trucksAvail = transportCap ? transportCap.trucks - transportCap.trucksInTransit : 0;
        const shipsAvail = transportCap ? transportCap.transportShips - transportCap.transportShipsInTransit : 0;
        const planesAvail = transportCap ? transportCap.transportPlanes - transportCap.transportPlanesInTransit : 0;

        return `
          <div style="margin-bottom: 0.875rem; padding: 0.875rem; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;">
            <div style="font-weight: 700; font-size: 0.95em; margin-bottom: 0.75rem; color: rgba(220, 240, 255, 0.95); text-transform: uppercase; letter-spacing: 0.03em; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.12);">
              ${e.faction}
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85em;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85); display: flex; align-items: center; gap: 0.4rem;">
                  <span style="font-size: 1.1em;">👥</span>
                  <span>Manpower</span>
                </span>
                <span style="font-weight: 600; color: ${getResourceColor(e.manpower, 10000)};">${fmt(e.manpower)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85); display: flex; align-items: center; gap: 0.4rem;">
                  <span style="font-size: 1.1em;">📦</span>
                  <span>Supplies</span>
                </span>
                <span style="font-weight: 600; color: ${getResourceColor(e.supplies, 5000)};">${fmt(e.supplies)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85); display: flex; align-items: center; gap: 0.4rem;">
                  <span style="font-size: 1.1em;">⛽</span>
                  <span>Fuel</span>
                </span>
                <span style="font-weight: 600; color: ${getResourceColor(e.fuel, 5000)};">${fmt(e.fuel)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85); display: flex; align-items: center; gap: 0.4rem;">
                  <span style="font-size: 1.1em;">💣</span>
                  <span>Ammo</span>
                </span>
                <span style="font-weight: 600; color: ${getResourceColor(e.ammo ?? 0, 2000)};">${fmt(e.ammo ?? 0)}</span>
              </div>
              <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; font-size: 0.8em;">
                <div style="text-align: center; padding: 0.35rem; background: rgba(60, 120, 200, 0.15); border-radius: 5px;">
                  <div style="font-size: 1.2em;">✈️</div>
                  <div style="color: rgba(180, 180, 180, 0.8); margin-top: 0.15rem;">Air</div>
                  <div style="font-weight: 600; color: rgba(220, 240, 255, 0.95); margin-top: 0.1rem;">${e.airPower}</div>
                </div>
                <div style="text-align: center; padding: 0.35rem; background: rgba(60, 120, 200, 0.15); border-radius: 5px;">
                  <div style="font-size: 1.2em;">⚓</div>
                  <div style="color: rgba(180, 180, 180, 0.8); margin-top: 0.15rem;">Naval</div>
                  <div style="font-weight: 600; color: rgba(220, 240, 255, 0.95); margin-top: 0.1rem;">${e.navalPower}</div>
                </div>
              </div>
              ${transportCap ? `
                <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; font-size: 0.8em; line-height: 1.5; color: rgba(200, 200, 200, 0.85);">
                  <div style="font-weight: 600; color: rgba(220, 220, 220, 0.9); margin-bottom: 0.3rem;">Transport Capacity:</div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>🚛 Trucks:</span>
                    <span style="font-weight: 600; color: ${trucksAvail > 0 ? 'rgba(120, 200, 140, 0.95)' : 'rgba(255, 120, 120, 0.95)'};">${trucksAvail}/${transportCap.trucks}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>🚢 Ships:</span>
                    <span style="font-weight: 600; color: ${shipsAvail > 0 ? 'rgba(120, 200, 140, 0.95)' : 'rgba(255, 120, 120, 0.95)'};">${shipsAvail}/${transportCap.transportShips}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>✈️ Planes:</span>
                    <span style="font-weight: 600; color: ${planesAvail > 0 ? 'rgba(120, 200, 140, 0.95)' : 'rgba(255, 120, 120, 0.95)'};">${planesAvail}/${transportCap.transportPlanes}</span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      })
      .join("");
    this.economyContainer.innerHTML = `${rows}
      <div class="campaign-classified-economy" role="note">
        <strong>Enemy logistics: classified</strong>
        <span>Strength and sustainment appear only when intelligence sources produce an assessment.</span>
      </div>`;
  }

  /** Renders the compact production summary in the sidebar (daily output + next tick countdown). */
  private renderProduction(): void {
    if (!this.productionContainer) {
      return;
    }
    const report = this.campaignState.getProductionReport();
    if (!report) {
      this.productionContainer.innerHTML = "";
      return;
    }
    const fmt = (n: number) => n.toLocaleString();
    const hoursUntil = report.segmentsUntilNextTick * 3;
    const row = (icon: string, label: string, value: number) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.2rem 0;font-size:0.85em;">
        <span style="color:rgba(200,200,200,0.85);">${icon} ${label}</span>
        <span style="font-weight:600;color:rgba(140,220,150,0.95);">+${fmt(value)}</span>
      </div>`;
    this.productionContainer.innerHTML = `
      <div style="padding:0.75rem;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;font-size:0.8em;color:rgba(180,190,205,0.75);margin-bottom:0.4rem;">
          <span>Industry: <strong style="color:rgba(220,240,255,0.95);">${fmt(report.capacity)}</strong></span>
          <span>${report.sources.length} site${report.sources.length !== 1 ? "s" : ""}</span>
        </div>
        <div style="font-size:0.72em;text-transform:uppercase;letter-spacing:0.05em;color:rgba(180,190,205,0.6);margin-bottom:0.25rem;">Daily output</div>
        ${row("📦", "Supplies", report.daily.supplies)}
        ${row("⛽", "Fuel", report.daily.fuel)}
        ${row("💣", "Ammo", report.daily.ammo)}
        ${row("👥", "Manpower", report.daily.manpower)}
        <div style="margin-top:0.4rem;padding-top:0.4rem;border-top:1px solid rgba(255,255,255,0.1);font-size:0.78em;color:rgba(245,196,109,0.9);">
          Next delivery in ${report.segmentsUntilNextTick} segment${report.segmentsUntilNextTick !== 1 ? "s" : ""} (${hoursUntil}h)
        </div>
      </div>
    `;
  }

  /** Opens the industrial allocation modal: sliders per resource with a live daily-output preview. */
  private openProductionModal(): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    if (!layer || !dialog || !title || !body || !close) return;

    const report = this.campaignState.getProductionReport();
    if (!report) return;

    title.textContent = "War Production";
    const fmt = (n: number) => n.toLocaleString();

    const RESOURCES: Array<{ key: keyof ProductionAllocation; icon: string; label: string; hint: string }> = [
      { key: "supplies", icon: "📦", label: "Supplies", hint: "Rations, spares, consumables" },
      { key: "fuel", icon: "⛽", label: "Fuel", hint: "Powers armor, ships, aircraft" },
      { key: "ammo", icon: "💣", label: "Ammunition", hint: "Feeds tactical battles" },
      { key: "manpower", icon: "👥", label: "Manpower", hint: "Replacements & new drafts" }
    ];

    const sliderRows = RESOURCES.map(
      (r) => `
      <div class="production-alloc-row">
        <div class="alloc-label">
          <span class="alloc-name">${r.icon} ${r.label}</span>
          <span class="alloc-hint">${r.hint}</span>
        </div>
        <input type="range" min="0" max="100" step="5" value="${report.allocation[r.key]}" data-alloc-slider="${r.key}" aria-label="${r.label} allocation" />
        <span class="alloc-pct" data-alloc-pct="${r.key}">${report.allocation[r.key]}%</span>
        <span class="alloc-out" data-alloc-out="${r.key}"></span>
      </div>`
    ).join("");

    const topSources = report.sources.slice(0, 8);
    const sourceRows = topSources.map(
      (s) => `
      <div class="production-source-row">
        <span>${this.escapeHtml(s.tile.replace(/_/g, " "))}${s.role ? ` <em>(${this.escapeHtml(s.role)})</em>` : ""}</span>
        <span class="source-hex">${s.offsetKey}</span>
        <span class="source-value">${fmt(s.supplyValue)}</span>
      </div>`
    ).join("");

    body.innerHTML = `
      <div class="production-modal">
        <div class="production-capacity-banner">
          Industrial capacity <strong>${fmt(report.capacity)}</strong> from ${report.sources.length} controlled site${report.sources.length !== 1 ? "s" : ""}
          · next delivery in ${report.segmentsUntilNextTick} segment${report.segmentsUntilNextTick !== 1 ? "s" : ""}
        </div>
        <div class="redeploy-section-label">Allocation <span class="alloc-total" id="productionAllocTotal"></span></div>
        <div class="production-alloc">${sliderRows}</div>
        <div class="production-alloc-note">Percentages are normalized to 100% when applied.</div>
        ${topSources.length > 0 ? `
          <div class="redeploy-section-label">Top production sites</div>
          <div class="production-sources">${sourceRows}</div>` : ""}
        <div class="button-row redeploy-actions">
          <button type="button" class="primary-button" id="productionApply">Apply Allocation</button>
          <button type="button" class="secondary-button" id="productionCancel">Cancel</button>
        </div>
      </div>
    `;

    const sliders = Array.from(body.querySelectorAll<HTMLInputElement>("[data-alloc-slider]"));
    const totalEl = body.querySelector<HTMLElement>("#productionAllocTotal");
    const applyBtn = body.querySelector<HTMLButtonElement>("#productionApply");
    const cancelBtn = body.querySelector<HTMLButtonElement>("#productionCancel");
    if (!applyBtn || !cancelBtn) return;

    const readAllocation = (): ProductionAllocation => {
      const raw: ProductionAllocation = { supplies: 0, fuel: 0, ammo: 0, manpower: 0 };
      sliders.forEach((sl) => {
        const key = sl.dataset.allocSlider as keyof ProductionAllocation;
        raw[key] = Number(sl.value) || 0;
      });
      return raw;
    };

    const refresh = (): void => {
      const raw = readAllocation();
      const total = raw.supplies + raw.fuel + raw.ammo + raw.manpower;
      if (totalEl) {
        totalEl.textContent = `· total ${total}%`;
        totalEl.classList.toggle("alloc-total-off", total !== 100);
      }
      // Preview uses the normalized share, matching what setProductionAllocation will store.
      const scale = total > 0 ? 100 / total : 0;
      const normalized: ProductionAllocation = {
        supplies: raw.supplies * scale,
        fuel: raw.fuel * scale,
        ammo: raw.ammo * scale,
        manpower: raw.manpower * scale
      };
      const daily = computeDailyProduction(report.capacity, normalized);
      RESOURCES.forEach((r) => {
        const pctEl = body.querySelector<HTMLElement>(`[data-alloc-pct="${r.key}"]`);
        const outEl = body.querySelector<HTMLElement>(`[data-alloc-out="${r.key}"]`);
        if (pctEl) pctEl.textContent = `${raw[r.key]}%`;
        if (outEl) outEl.textContent = `+${fmt(daily[r.key])}/day`;
      });
      applyBtn.disabled = total <= 0;
    };

    sliders.forEach((sl) => sl.addEventListener("input", refresh));
    refresh();

    const hide = (): void => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
    };

    applyBtn.onclick = () => {
      const result = this.campaignState.setProductionAllocation(readAllocation());
      if (!result.ok) {
        this.setCampaignStatusMessage({
          title: "Allocation not applied.",
          detail: result.reason ?? "The production allocation could not be stored.",
          action: "Adjust the sliders so at least one resource receives output.",
          tone: "warning"
        });
        return;
      }
      hide();
      this.setCampaignStatusMessage({
        title: "Production allocation updated.",
        detail: "New output mix takes effect at the next daily delivery.",
        action: "Advance the campaign clock to collect the adjusted output.",
        tone: "success"
      });
    };
    cancelBtn.onclick = hide;
    close.onclick = hide;

    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
  }

  /** Renders current selection details and engagement queue status. */
  private renderSelection(): void {
    if (!this.selectionContainer) {
      return;
    }
    const items: string[] = [];
    const statusSections: Array<{ source: "campaign" | "headquarters"; message: CampaignScreenStatusMessage }> = [];
    if (this.campaignStatusMessage) {
      statusSections.push({ source: "campaign", message: this.campaignStatusMessage });
    }
    const headquartersStatus = this.campaignState.getHeadquartersStatusMessage();
    if (headquartersStatus) {
      statusSections.push({ source: "headquarters", message: headquartersStatus });
    }
    if (statusSections.length > 0) {
      items.push(...statusSections.map(({ source, message }) => this.composeStatusMarkup(source, message)));
      this.selectionContainer.setAttribute("aria-live", "assertive");
      this.selectionContainer.setAttribute("data-status", statusSections[0].message.tone);
    } else {
      this.selectionContainer.removeAttribute("aria-live");
      this.selectionContainer.removeAttribute("data-status");
    }
    if (this.selectedHexKey) {
      items.push(`<div>Selected hex: ${this.selectedHexKey}</div>`);
    }
    if (this.moveOriginHexKey) {
      items.push(`<div>Move: origin ${this.moveOriginHexKey} — select destination (non-adjacent opens Schedule Redeploy)</div>`);
    }
    if (this.selectedFrontKey) {
      items.push(`<div>Front: ${this.selectedFrontKey}</div>`);
    }
    const engagements = this.campaignState.getPendingEngagements();
    if (engagements.length > 0) {
      items.push(`<div>Pending engagements: ${engagements.length}</div>`);
    }
    this.selectionContainer.innerHTML = items.join("") || "<div>No selection</div>";

    if (this.queueEngagementButton) {
      const canProximity = this.selectedHexKey ? this.campaignState.hasActionableEnemyContactNear(this.selectedHexKey) : false;
      const canEngage = Boolean(this.selectedFrontKey) || canProximity;
      this.queueEngagementButton.disabled = !canEngage;
    }

    // Update edit mode UI if active
    if (this.editMode) {
      this.updateEditPanel();
    }
  }

  /** Wires the persistent campaign Intelligence drawer and map-safe operation workflow. */
  private bindCampaignIntelControls(): void {
    const toggle = this.element.querySelector<HTMLButtonElement>("#campaignIntelToggle");
    const openDrawer = () => {
      if (!this.intelDrawer) return;
      this.intelDrawer.classList.remove("hidden");
      toggle?.setAttribute("aria-expanded", "true");
      this.campaignState.markIntelBriefsRead("Player");
      this.renderCampaignIntel();
    };
    toggle?.addEventListener("click", () => {
      if (!this.intelDrawer) return;
      if (this.intelDrawer.classList.contains("hidden")) openDrawer();
      else {
        this.intelDrawer.classList.add("hidden");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("campaign:intelligence:open", openDrawer);

    this.intelCoverageButton?.addEventListener("click", () => {
      this.intelCoverageVisible = !this.intelCoverageVisible;
      this.intelCoverageButton?.setAttribute("aria-pressed", this.intelCoverageVisible ? "true" : "false");
      this.intelCoverageButton?.classList.toggle("active", this.intelCoverageVisible);
      this.renderer.setIntelCoverageVisible(this.intelCoverageVisible);
    });

    this.intelDrawer?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-intel-close]")) {
        this.intelDrawer?.classList.add("hidden");
        toggle?.setAttribute("aria-expanded", "false");
        toggle?.focus();
        return;
      }
      const tab = target.closest<HTMLButtonElement>("[data-intel-tab]")?.dataset.intelTab;
      if (tab === "situation" || tab === "contacts" || tab === "operations") {
        this.intelTab = tab;
        this.renderCampaignIntel();
        return;
      }
      if (target.closest("[data-intel-mark-read]")) {
        this.campaignState.markIntelBriefsRead("Player");
        this.renderCampaignIntel();
        return;
      }
      const focusId = target.closest<HTMLButtonElement>("[data-intel-focus]")?.dataset.intelFocus;
      if (focusId) {
        const contact = this.campaignState.getCampaignMapView("Player")?.enemyContacts.find((entry) => entry.id === focusId);
        if (contact) {
          this.selectedHexKey = contact.locationHexKey;
          this.moveOriginHexKey = null;
          this.renderer.clearAllHighlights("selected");
          this.renderer.highlightHex(contact.locationHexKey, "selected");
          this.renderSelection();
        }
        return;
      }
      const verifyId = target.closest<HTMLButtonElement>("[data-intel-verify-contact]")?.dataset.intelVerifyContact;
      if (verifyId) {
        const contact = this.campaignState.getCampaignMapView("Player")?.enemyContacts.find((entry) => entry.id === verifyId);
        if (contact) {
          this.intelTab = "operations";
          this.intelOperationType = "verify";
          this.intelTargetContactId = contact.id;
          this.selectedHexKey = contact.locationHexKey;
          this.intelFeedback = `Verification target set: ${contact.label} near ${contact.locationHexKey}.`;
          this.renderCampaignIntel();
        }
        return;
      }
      const operationType = target.closest<HTMLButtonElement>("[data-intel-operation-type]")?.dataset.intelOperationType as CampaignIntelOperationType | undefined;
      if (operationType) {
        this.intelOperationType = operationType;
        if (operationType !== "verify") this.intelTargetContactId = null;
        this.intelFeedback = "";
        this.renderCampaignIntel();
        return;
      }
      if (target.closest("[data-intel-schedule]")) {
        this.scheduleSelectedIntelOperation();
      }
    });
  }

  private scheduleSelectedIntelOperation(): void {
    if (!this.selectedHexKey) {
      this.intelFeedback = "Select a campaign hex on the map before issuing this order.";
      this.renderCampaignIntel();
      return;
    }
    const assetSelect = this.intelDrawer?.querySelector<HTMLSelectElement>("#campaignIntelAsset");
    const result = this.campaignState.scheduleIntelOperation({
      type: this.intelOperationType,
      targetHexKey: this.selectedHexKey,
      assignedAssetKey: assetSelect?.value || undefined,
      targetContactId: this.intelTargetContactId ?? undefined,
      faction: "Player"
    });
    if (!result.ok) {
      this.intelFeedback = result.reason;
      this.renderCampaignIntel();
      return;
    }
    this.intelFeedback = `${this.campaignState.getIntelOperationRules()[this.intelOperationType].label} ordered for ${this.selectedHexKey}; resolves in ${result.operation.resolveSegment - result.operation.startSegment} segment${result.operation.resolveSegment - result.operation.startSegment === 1 ? "" : "s"}.`;
    this.intelTargetContactId = null;
    this.renderCampaignIntel();
  }

  /** Renders compact readiness plus the Situation / Contacts / Operations drawer. */
  private renderCampaignIntel(): void {
    const view = this.campaignState.getCampaignMapView("Player");
    const operations = this.campaignState.getIntelOperations("Player");
    if (!view) {
      if (this.intelSummary) this.intelSummary.textContent = "Intelligence unavailable";
      return;
    }
    if (this.intelSummary) {
      this.intelSummary.innerHTML = `
        <span><strong>${view.capacity.available}/${view.capacity.total}</strong> capacity available</span>
        <span><strong>${view.enemyContacts.length}</strong> active contact${view.enemyContacts.length === 1 ? "" : "s"}</span>
      `;
    }
    if (this.intelUnreadBadge) {
      this.intelUnreadBadge.textContent = String(view.unreadReportCount);
      this.intelUnreadBadge.classList.toggle("hidden", view.unreadReportCount === 0);
    }
    if (!this.intelDrawer || this.intelDrawer.classList.contains("hidden")) return;

    const tabButtons = Array.from(this.intelDrawer.querySelectorAll<HTMLButtonElement>("[data-intel-tab]"));
    tabButtons.forEach((button) => {
      const active = button.dataset.intelTab === this.intelTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    const body = this.intelDrawer.querySelector<HTMLElement>("#campaignIntelBody");
    if (!body) return;
    body.innerHTML = this.intelTab === "situation"
      ? this.composeIntelSituationMarkup(view)
      : this.intelTab === "contacts"
        ? this.composeIntelContactsMarkup(view)
        : this.composeIntelOperationsMarkup(view, operations);
  }

  private composeIntelSituationMarkup(view: CampaignMapViewModel): string {
    const events = this.campaignState.getIntelBriefEvents("Player").slice(0, 16);
    const eventMarkup = events.length === 0
      ? `<div class="campaign-intel-empty">No new intelligence has reached headquarters.</div>`
      : events.map((event) => `
          <article class="campaign-intel-report${event.read ? "" : " unread"}" data-report-kind="${event.kind}">
            <div class="campaign-intel-report__time">${this.escapeHtml(this.campaignState.segmentToTimeDisplay(event.segment))}</div>
            <strong>${this.escapeHtml(event.title)}</strong>
            <p>${this.escapeHtml(event.detail)}</p>
            ${event.contactId ? `<button type="button" data-intel-focus="${this.escapeHtml(event.contactId)}">Focus map</button>` : ""}
          </article>
        `).join("");
    const stale = view.enemyContacts.filter((contact) => contact.state === "stale" || contact.state === "disputed").length;
    return `
      <div class="campaign-intel-situation-grid">
        <article><span>Operational picture</span><strong>${view.enemyContacts.length} contacts</strong><small>${stale} stale or disputed</small></article>
        <article><span>Collection capacity</span><strong>${view.capacity.available}/${view.capacity.total}</strong><small>${view.capacity.committed} committed</small></article>
        <article><span>Unread reports</span><strong>${view.unreadReportCount}</strong><small>since last briefing</small></article>
      </div>
      <div class="campaign-intel-section-heading"><h4>Briefing changes</h4><button type="button" data-intel-mark-read>Mark read</button></div>
      <div class="campaign-intel-report-list">${eventMarkup}</div>
    `;
  }

  private composeIntelContactsMarkup(view: CampaignMapViewModel): string {
    if (view.enemyContacts.length === 0) {
      return `<div class="campaign-intel-empty"><strong>No current enemy contacts.</strong><p>Assign reconnaissance to a front or suspected approach. Absence of a marker is not proof the area is clear.</p></div>`;
    }
    return `<div class="campaign-intel-contact-list">${view.enemyContacts.map((contact) => `
      <article class="campaign-intel-contact-card" data-level="${contact.level}" data-state="${contact.state}">
        <header>
          <div><span class="campaign-intel-eyebrow">${contact.level} · ${contact.confidenceBand} confidence</span><strong>${this.escapeHtml(contact.label)}</strong></div>
          <span class="campaign-intel-age">${contact.ageSegments === 0 ? "Current" : `${contact.ageSegments * 3}h old`}</span>
        </header>
        <dl>
          <div><dt>Where</dt><dd>${this.escapeHtml(contact.locationHexKey)}${contact.uncertaintyRadius > 0 ? ` ±${contact.uncertaintyRadius} hex` : ""}</dd></div>
          <div><dt>Strength</dt><dd>${contact.strengthBand ?? "Unknown"}</dd></div>
          <div><dt>State</dt><dd>${contact.state}${contact.movementState ? ` · ${contact.movementState}` : ""}</dd></div>
          <div><dt>Source</dt><dd>${this.escapeHtml(contact.sourceLabels.join(", ") || "Unspecified")}</dd></div>
        </dl>
        <p>${this.escapeHtml(contact.analystNotes[0] ?? "No analyst note is available.")}</p>
        <footer>
          <button type="button" data-intel-focus="${this.escapeHtml(contact.id)}">Focus map</button>
          <button type="button" data-intel-verify-contact="${this.escapeHtml(contact.id)}">Verify</button>
        </footer>
      </article>
    `).join("")}</div>`;
  }

  private composeIntelOperationsMarkup(view: CampaignMapViewModel, operations: CampaignIntelOperationView[]): string {
    const rules = this.campaignState.getIntelOperationRules();
    const rule = rules[this.intelOperationType];
    const assets = this.campaignState.getEligibleIntelAssets(
      this.intelOperationType,
      "Player",
      this.selectedHexKey ?? undefined
    );
    const requiresAsset = rule.requiresAsset !== "none";
    const operationButtons = (Object.keys(rules) as CampaignIntelOperationType[]).map((type) => `
      <button type="button" class="campaign-intel-operation-choice${type === this.intelOperationType ? " active" : ""}" data-intel-operation-type="${type}">
        <strong>${this.escapeHtml(rules[type].shortLabel)}</strong><span>${rules[type].capacityCost} capacity · ${rules[type].durationSegments * 3}h</span>
      </button>
    `).join("");
    const active = operations
      .filter((operation) => operation.status === "planned" || operation.status === "active")
      .map((operation) => `
        <article class="campaign-intel-active-op">
          <strong>${this.escapeHtml(rules[operation.type].label)}</strong>
          <span>${this.escapeHtml(operation.targetHexKey)} · resolves ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(operation.resolveSegment))}</span>
        </article>
      `).join("") || `<div class="campaign-intel-empty compact">No intelligence operations are active.</div>`;
    const recentlyComplete = operations
      .filter((operation) => operation.status !== "planned" && operation.status !== "active" && operation.publicOutcome)
      .slice(-5)
      .reverse()
      .map((operation) => `<article class="campaign-intel-outcome"><strong>${this.escapeHtml(operation.publicOutcome!.summary)}</strong><p>${this.escapeHtml(operation.publicOutcome!.detail)}</p></article>`)
      .join("");
    return `
      <div class="campaign-intel-capacity"><span>Capacity</span><strong>${view.capacity.available}/${view.capacity.total} available</strong><small>${view.capacity.committed} committed</small></div>
      <div class="campaign-intel-operation-grid">${operationButtons}</div>
      <section class="campaign-intel-composer">
        <span class="campaign-intel-eyebrow">Order preview</span>
        <h4>${this.escapeHtml(rule.label)}</h4>
        <p>${this.escapeHtml(rule.description)}</p>
        <div class="campaign-intel-costs">
          <span>${rule.capacityCost} capacity</span><span>${rule.durationSegments * 3} hours</span><span>${rule.suppliesCost} supplies</span><span>${rule.fuelCost} fuel</span>${requiresAsset && rule.assetRangeHex !== undefined ? `<span>${rule.assetRangeHex} hex range</span>` : ""}
        </div>
        <label>Target <strong>${this.escapeHtml(this.selectedHexKey ?? "Select a map hex")}</strong></label>
        ${requiresAsset ? `
          <label for="campaignIntelAsset">Assigned asset</label>
          <select id="campaignIntelAsset" ${assets.length === 0 ? "disabled" : ""}>
            ${assets.length === 0 ? `<option value="">No eligible asset</option>` : assets.map((asset) => `<option value="${this.escapeHtml(asset.assetKey)}">${this.escapeHtml(asset.label)}</option>`).join("")}
          </select>
        ` : `<p class="campaign-intel-doctrine">This operation uses headquarters deception capacity and does not require a formation assignment.</p>`}
        ${this.intelFeedback ? `<div class="campaign-intel-feedback" aria-live="polite">${this.escapeHtml(this.intelFeedback)}</div>` : ""}
        <button type="button" class="campaign-intel-confirm" data-intel-schedule ${!this.selectedHexKey || (requiresAsset && assets.length === 0) || (this.intelOperationType === "verify" && !this.intelTargetContactId) ? "disabled" : ""}>Issue order</button>
      </section>
      <div class="campaign-intel-section-heading"><h4>Active operations</h4></div>${active}
      ${recentlyComplete ? `<div class="campaign-intel-section-heading"><h4>Recent outcomes</h4></div>${recentlyComplete}` : ""}
    `;
  }

  private setCampaignStatusMessage(message: CampaignScreenStatusMessage | null): void {
    this.campaignStatusMessage = message ? { ...message } : null;
    this.renderSelection();
  }

  private composeStatusMarkup(source: "campaign" | "headquarters", message: CampaignScreenStatusMessage): string {
    return `<div data-${source}-status="${message.tone}"><strong>${this.escapeHtml(message.title)}</strong><div>${this.escapeHtml(message.detail)}</div><div>${this.escapeHtml(message.action)}</div></div>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Resolves an offset hex key ("col,row") from a DOM event target on the campaign SVG. */
  private resolveHexKeyFromEventTarget(target: EventTarget | null): string | null {
    if (!target || !(target instanceof Element)) {
      return null;
    }

    const group = target.closest<SVGGElement>(".campaign-hex");
    const dataHexCarrier = target.closest("[data-hex]") as Element | null;
    const dataHex = dataHexCarrier?.getAttribute("data-hex") ?? null;
    const hexKey = group?.dataset.hex ?? dataHex;
    return hexKey ?? null;
  }

  /** Adds the hex under the pointer to the current bulk terrain selection and updates highlighting. */
  private addTerrainSelectionFromEvent(event: PointerEvent): void {
    const hexKey = this.resolveHexKeyFromEventTarget(event.target);
    if (!hexKey) {
      return;
    }

    if (!this.bulkTerrainSelection.has(hexKey)) {
      this.bulkTerrainSelection.add(hexKey);
      this.renderer.highlightHex(hexKey, "bulk-terrain");
    }

    // Track the most recent hex so the edit panel can show details while dragging.
    this.selectedHexKey = hexKey;
    this.renderSelection();
  }

  /** Clears any bulk terrain selection state and associated highlight classes. */
  private clearTerrainBulkSelection(): void {
    if (this.bulkTerrainSelection.size === 0) {
      return;
    }
    this.bulkTerrainSelection.clear();
    this.renderer.clearAllHighlights("bulk-terrain");
  }

  /** Selects all hexes in a rectangular region between two corner hexes (offset coordinates). */
  private selectRectangularRegion(corner1Key: string, corner2Key: string): void {
    const parsed1 = CoordinateSystem.parseHexKey(corner1Key);
    const parsed2 = CoordinateSystem.parseHexKey(corner2Key);

    if (!parsed1 || !parsed2) {
      return;
    }

    // Work in offset coordinates to select rectangular region
    const minCol = Math.min(parsed1.col, parsed2.col);
    const maxCol = Math.max(parsed1.col, parsed2.col);
    const minRow = Math.min(parsed1.row, parsed2.row);
    const maxRow = Math.max(parsed1.row, parsed2.row);

    this.clearTerrainBulkSelection();

    // Select all hexes in the rectangular bounds
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const hexKey = CoordinateSystem.makeHexKey(col, row);
        this.bulkTerrainSelection.add(hexKey);
        this.renderer.highlightHex(hexKey, "bulk-terrain");
      }
    }

    const count = this.bulkTerrainSelection.size;
    this.updateTerrainStatus(`Selected ${count} hex(es) in rectangle. Click Mark Water/Land to apply.`);
  }

  /** Begins tracking a drag paint gesture for terrain marking when the left mouse button is pressed. */
  private handleTerrainPointerDown(event: PointerEvent): void {
    if (!this.editMode || event.button !== 0) {
      return;
    }

    const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
    if (!svg || !svg.contains(event.target as Node)) {
      return;
    }

    const hexKey = this.resolveHexKeyFromEventTarget(event.target);
    if (!hexKey) {
      return;
    }

    // Ctrl+Click: rectangular selection mode
    if (event.ctrlKey || event.metaKey) {
      if (!this.rectSelectionCorner) {
        // First corner - start rectangular selection
        this.rectSelectionCorner = hexKey;
        this.clearTerrainBulkSelection();
        this.bulkTerrainSelection.add(hexKey);
        this.renderer.highlightHex(hexKey, "bulk-terrain");
        this.updateTerrainStatus("First corner selected. Ctrl+Click another hex to complete rectangle.");
      } else {
        // Second corner - complete rectangular selection
        this.selectRectangularRegion(this.rectSelectionCorner, hexKey);
        this.rectSelectionCorner = null;
      }
      return;
    }

    // Normal drag paint mode
    this.rectSelectionCorner = null; // Cancel any pending rectangular selection
    this.terrainDragActive = true;
    this.clearTerrainBulkSelection();
    this.addTerrainSelectionFromEvent(event);
  }

  /** Extends the bulk terrain selection as the pointer moves across additional hexes. */
  private handleTerrainPointerMove(event: PointerEvent): void {
    if (!this.editMode || !this.terrainDragActive) {
      return;
    }
    this.addTerrainSelectionFromEvent(event);
  }

  /** Finishes the drag paint gesture when the pointer is released or leaves the SVG. */
  private handleTerrainPointerUp(event: PointerEvent): void {
    if (!this.editMode || !this.terrainDragActive) {
      return;
    }
    this.addTerrainSelectionFromEvent(event);
    this.terrainDragActive = false;
  }

  private toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (this.editPanel) {
      if (this.editMode) {
        this.editPanel.classList.remove("hidden");
      } else {
        this.editPanel.classList.add("hidden");
      }
    }
    if (this.exportJSONButton) {
      if (this.editMode) {
        this.exportJSONButton.classList.remove("hidden");
      } else {
        this.exportJSONButton.classList.add("hidden");
      }
    }
    if (this.editModeButton) {
      this.editModeButton.textContent = this.editMode ? "Exit Edit Mode" : "Edit Mode";
    }

    // Toggle terrain overlay visibility
    this.renderer.setTerrainOverlayVisible(this.editMode);
    if (!this.editMode) {
      this.clearTerrainBulkSelection();
    }
  }

  private initializeEditModeControls(): void {
    const applyBaseBtn = this.element.querySelector<HTMLButtonElement>("#editorApplyBase");
    const deleteBaseBtn = this.element.querySelector<HTMLButtonElement>("#editorDeleteBase");
    const addUnitBtn = this.element.querySelector<HTMLButtonElement>("#editorAddUnit");
    const moveBaseBtn = this.element.querySelector<HTMLButtonElement>("#editorMoveBase");

    if (applyBaseBtn) {
      applyBaseBtn.addEventListener("click", () => this.applyBaseEdit());
    }
    if (deleteBaseBtn) {
      deleteBaseBtn.addEventListener("click", () => this.deleteBase());
    }
    if (addUnitBtn) {
      addUnitBtn.addEventListener("click", () => this.addUnit());
    }
    if (moveBaseBtn) {
      moveBaseBtn.addEventListener("click", () => this.moveBase());
    }

    // Resource editing buttons
    const applyResourcesBtn = this.element.querySelector<HTMLButtonElement>("#editorApplyResources");
    const loadResourcesBtn = this.element.querySelector<HTMLButtonElement>("#editorLoadResources");

    if (applyResourcesBtn) {
      applyResourcesBtn.addEventListener("click", () => this.applyResourceEdit());
    }
    if (loadResourcesBtn) {
      loadResourcesBtn.addEventListener("click", () => this.loadCurrentResources());
    }

    // Terrain marking buttons
    const markWaterBtn = this.element.querySelector<HTMLButtonElement>("#editorMarkWater");
    const markLandBtn = this.element.querySelector<HTMLButtonElement>("#editorMarkLand");

    if (markWaterBtn) {
      markWaterBtn.addEventListener("click", () => this.markHexAsWater());
    }
    if (markLandBtn) {
      markLandBtn.addEventListener("click", () => this.markHexAsLand());
    }
  }

  private updateEditPanel(): void {
    const hexSpan = this.element.querySelector("#editorSelectedHex");
    const baseSelect = this.element.querySelector<HTMLSelectElement>("#editorBaseType");
    const unitList = this.element.querySelector("#editorUnitList");
    const colInput = this.element.querySelector<HTMLInputElement>("#editorCol");
    const rowInput = this.element.querySelector<HTMLInputElement>("#editorRow");
    const axialSpan = this.element.querySelector("#editorAxialCoords");

    if (!this.selectedHexKey || !hexSpan) return;

    hexSpan.textContent = this.selectedHexKey;

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    // Update coordinate inputs
    if (colInput) colInput.value = String(parsed.col);
    if (rowInput) rowInput.value = String(parsed.row);

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);

    // Update axial display and show water status
    const hexKey = `${q},${r}`;
    const isWater = scenario.mapExtents?.waterHexes?.includes(hexKey) ?? false;
    if (axialSpan) {
      axialSpan.textContent = `q:${q}, r:${r}${isWater ? ' [WATER]' : ''}`;
    }

    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    // Update base type select
    if (baseSelect) {
      if (tile) {
        baseSelect.value = tile.tile;
      } else {
        baseSelect.value = "";
      }
    }

    // Update rotation select
    const rotationSelect = this.element.querySelector<HTMLSelectElement>("#editorRotation");
    if (rotationSelect) {
      if (tile && tile.rotation !== undefined) {
        rotationSelect.value = String(tile.rotation);
      } else {
        rotationSelect.value = "0";
      }
    }

    // Update unit list
    if (unitList && tile?.forces) {
      unitList.innerHTML = tile.forces.map((f, idx) => `
        <div style="display: flex; gap: 8px; margin: 4px 0; align-items: center;">
          <span>${f.unitType} x${f.count} - ${f.label || ''}</span>
          <button type="button" data-unit-index="${idx}" class="editor-delete-unit">×</button>
        </div>
      `).join("");

      // Add delete handlers
      unitList.querySelectorAll<HTMLButtonElement>(".editor-delete-unit").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.unitIndex ?? "-1");
          this.deleteUnit(idx);
        });
      });
    } else if (unitList) {
      unitList.innerHTML = "<div>No units</div>";
    }
  }

  private applyBaseEdit(): void {
    if (!this.selectedHexKey) return;

    const baseSelect = this.element.querySelector<HTMLSelectElement>("#editorBaseType");
    const rotationSelect = this.element.querySelector<HTMLSelectElement>("#editorRotation");
    if (!baseSelect) return;

    const baseType = baseSelect.value;
    const rotation = rotationSelect ? parseInt(rotationSelect.value) : 0;
    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);

    // Find or create tile
    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    if (!baseType) {
      // Remove base if empty selection
      if (tile) {
        const idx = scenario.tiles.indexOf(tile);
        scenario.tiles.splice(idx, 1);
      }
    } else {
      if (tile) {
        // Update existing tile
        tile.tile = baseType;
        tile.rotation = rotation;
      } else {
        // Create new tile
        scenario.tiles.push({
          tile: baseType,
          hex: { q, r },
          forces: [],
          rotation: rotation
        });
      }
    }

    this.campaignState.setScenario(scenario);
    this.renderSelection();
  }

  private deleteBase(): void {
    if (!this.selectedHexKey) return;

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const tileIdx = scenario.tiles.findIndex((t) => t.hex.q === q && t.hex.r === r);

    if (tileIdx >= 0) {
      scenario.tiles.splice(tileIdx, 1);
      this.campaignState.setScenario(scenario);
      this.renderSelection();
    }
  }

  private markHexAsWater(): void {
    const usingBulk = this.bulkTerrainSelection.size > 0;
    const targetHexKeys = usingBulk
      ? Array.from(this.bulkTerrainSelection)
      : this.selectedHexKey
        ? [this.selectedHexKey]
        : [];

    if (targetHexKeys.length === 0) {
      return;
    }

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    // Initialize mapExtents if it doesn't exist so irregular coastlines can be marked precisely.
    if (!scenario.mapExtents) {
      scenario.mapExtents = {
        description: "Campaign map extents",
        corners: {
          nw: { q: 0, r: 0, label: "Northwest" },
          ne: { q: scenario.dimensions.cols - 1, r: 0, label: "Northeast" },
          sw: { q: 0, r: scenario.dimensions.rows - 1, label: "Southwest" },
          se: { q: scenario.dimensions.cols - 1, r: scenario.dimensions.rows - 1, label: "Southeast" }
        },
        zones: [],
        waterHexes: []
      };
    }

    if (!scenario.mapExtents.waterHexes) {
      scenario.mapExtents.waterHexes = [];
    }

    const added: Array<{ q: number; r: number }> = [];
    const alreadyWater: Array<{ q: number; r: number }> = [];

    for (const offsetKey of targetHexKeys) {
      const parsed = CoordinateSystem.parseHexKey(offsetKey);
      if (!parsed) continue;

      const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
      const axialKey = `${q},${r}`;

      if (!scenario.mapExtents.waterHexes.includes(axialKey)) {
        scenario.mapExtents.waterHexes.push(axialKey);
        added.push({ q, r });
      } else {
        alreadyWater.push({ q, r });
      }
    }

    if (added.length > 0) {
      this.campaignState.setScenario(scenario);
      this.renderer.refreshTerrainOverlay();
    }

    if (!usingBulk && targetHexKeys.length === 1) {
      if (added.length === 1) {
        const { q, r } = added[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) marked as WATER`);
        console.log(`Marked hex (${q}, ${r}) as water. Total water hexes: ${scenario.mapExtents.waterHexes.length}`);
      } else if (alreadyWater.length === 1) {
        const { q, r } = alreadyWater[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) already marked as water`);
      }
    } else if (usingBulk) {
      if (added.length > 0) {
        this.updateTerrainStatus(`Marked ${added.length} hex(es) as WATER${alreadyWater.length ? `; ${alreadyWater.length} already water` : ""}`);
      } else {
        this.updateTerrainStatus(`${alreadyWater.length} selected hex(es) were already marked as water`);
      }
      console.log(`Bulk water marking: added=${added.length}, alreadyWater=${alreadyWater.length}, total=${scenario.mapExtents.waterHexes.length}`);
    }

    this.clearTerrainBulkSelection();
  }

  private markHexAsLand(): void {
    const usingBulk = this.bulkTerrainSelection.size > 0;
    const targetHexKeys = usingBulk
      ? Array.from(this.bulkTerrainSelection)
      : this.selectedHexKey
        ? [this.selectedHexKey]
        : [];

    if (targetHexKeys.length === 0) {
      return;
    }

    const scenario = this.campaignState.getScenario();
    if (!scenario || !scenario.mapExtents?.waterHexes) {
      this.updateTerrainStatus("No water hexes to remove");
      return;
    }

    const removed: Array<{ q: number; r: number }> = [];
    const notWater: Array<{ q: number; r: number }> = [];

    for (const offsetKey of targetHexKeys) {
      const parsed = CoordinateSystem.parseHexKey(offsetKey);
      if (!parsed) continue;

      const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
      const axialKey = `${q},${r}`;

      const index = scenario.mapExtents.waterHexes.indexOf(axialKey);
      if (index >= 0) {
        scenario.mapExtents.waterHexes.splice(index, 1);
        removed.push({ q, r });
      } else {
        notWater.push({ q, r });
      }
    }

    if (removed.length > 0) {
      this.campaignState.setScenario(scenario);
      this.renderer.refreshTerrainOverlay();
    }

    if (!usingBulk && targetHexKeys.length === 1) {
      if (removed.length === 1) {
        const { q, r } = removed[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) marked as LAND`);
        console.log(`Marked hex (${q}, ${r}) as land. Total water hexes: ${scenario.mapExtents.waterHexes.length}`);
      } else if (notWater.length === 1) {
        const { q, r } = notWater[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) was not marked as water`);
      }
    } else if (usingBulk) {
      if (removed.length > 0) {
        this.updateTerrainStatus(`Marked ${removed.length} hex(es) as LAND${notWater.length ? `; ${notWater.length} were already land` : ""}`);
      } else {
        this.updateTerrainStatus("No selected hexes were marked as water");
      }
      console.log(`Bulk land marking: removed=${removed.length}, alreadyLand=${notWater.length}, remainingWater=${scenario.mapExtents.waterHexes.length}`);
    }

    this.clearTerrainBulkSelection();
  }

  private updateTerrainStatus(message: string): void {
    const statusDiv = this.element.querySelector("#editorTerrainStatus");
    if (statusDiv) {
      statusDiv.textContent = message;
      // Clear message after 3 seconds
      setTimeout(() => {
        if (statusDiv.textContent === message) {
          statusDiv.textContent = "";
        }
      }, 3000);
    }
  }

  private addUnit(): void {
    if (!this.selectedHexKey) return;

    const unitTypeSelect = this.element.querySelector<HTMLSelectElement>("#editorUnitType");
    const unitCountInput = this.element.querySelector<HTMLInputElement>("#editorUnitCount");
    const unitLabelInput = this.element.querySelector<HTMLInputElement>("#editorUnitLabel");

    if (!unitTypeSelect || !unitCountInput) return;

    const unitType = unitTypeSelect.value;
    const count = parseInt(unitCountInput.value) || 1;
    const label = unitLabelInput?.value || "";

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    if (!tile) {
      this.setCampaignStatusMessage({
        title: "Unit placement failed.",
        detail: "No base is present at the selected hex.",
        action: "Create or select a base before adding units to this location.",
        tone: "warning"
      });
      return;
    }

    if (!tile.forces) {
      tile.forces = [];
    }

    tile.forces.push({ unitType, count, label });

    this.campaignState.setScenario(scenario);
    this.renderSelection();
    this.setCampaignStatusMessage({
      title: "Unit added.",
      detail: `${unitType} x${count} assigned to ${this.selectedHexKey}.`,
      action: "Review the updated garrison or continue editing the force package.",
      tone: "success"
    });

    // Clear inputs
    if (unitCountInput) unitCountInput.value = "5";
    if (unitLabelInput) unitLabelInput.value = "";
  }

  private deleteUnit(index: number): void {
    if (!this.selectedHexKey || index < 0) return;

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    if (tile?.forces && tile.forces[index]) {
      tile.forces.splice(index, 1);
      this.campaignState.setScenario(scenario);
      this.renderSelection();
    }
  }

  private moveBase(): void {
    if (!this.selectedHexKey) return;

    const colInput = this.element.querySelector<HTMLInputElement>("#editorCol");
    const rowInput = this.element.querySelector<HTMLInputElement>("#editorRow");

    if (!colInput || !rowInput) return;

    const newCol = parseInt(colInput.value);
    const newRow = parseInt(rowInput.value);

    if (isNaN(newCol) || isNaN(newRow)) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: "The destination coordinates are invalid.",
        action: "Enter numeric column and row values, then try the move again.",
        tone: "warning"
      });
      return;
    }

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const oldAxial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const newAxial = CoordinateSystem.offsetToAxial(newCol, newRow);

    // Find the tile at the old position
    const tileIdx = scenario.tiles.findIndex((t) => t.hex.q === oldAxial.q && t.hex.r === oldAxial.r);

    if (tileIdx < 0) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: "No base exists at the currently selected location.",
        action: "Select an existing base before issuing a relocation order.",
        tone: "warning"
      });
      return;
    }

    // Check if destination already has a base
    const destTile = scenario.tiles.find((t) => t.hex.q === newAxial.q && t.hex.r === newAxial.r);
    if (destTile) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: `Destination (${newCol}, ${newRow}) already contains a base.`,
        action: "Choose an open destination hex and retry the relocation.",
        tone: "warning"
      });
      return;
    }

    // Move the base
    scenario.tiles[tileIdx].hex.q = newAxial.q;
    scenario.tiles[tileIdx].hex.r = newAxial.r;

    this.campaignState.setScenario(scenario);

    // Update selection to new position
    this.selectedHexKey = CoordinateSystem.makeHexKey(newCol, newRow);
    this.renderer.clearAllHighlights("selected");
    this.renderer.highlightHex(this.selectedHexKey, "selected");
    this.renderSelection();
    this.setCampaignStatusMessage({
      title: "Base moved.",
      detail: `Base repositioned to (${newCol}, ${newRow}).`,
      action: "Review the new frontage and continue editing if further adjustments are needed.",
      tone: "success"
    });
  }

  private loadCurrentResources(): void {
    const factionSelect = this.element.querySelector<HTMLSelectElement>("#editorResourceFaction");
    if (!factionSelect) return;

    const faction = factionSelect.value;
    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const economy = scenario.economies.find((e) => e.faction === faction);
    if (!economy) return;

    // Populate the input fields with current values
    const manpowerInput = this.element.querySelector<HTMLInputElement>("#editorManpower");
    const suppliesInput = this.element.querySelector<HTMLInputElement>("#editorSupplies");
    const fuelInput = this.element.querySelector<HTMLInputElement>("#editorFuel");
    const ammoInput = this.element.querySelector<HTMLInputElement>("#editorAmmo");
    const airPowerInput = this.element.querySelector<HTMLInputElement>("#editorAirPower");
    const navalPowerInput = this.element.querySelector<HTMLInputElement>("#editorNavalPower");
    const intelInput = this.element.querySelector<HTMLInputElement>("#editorIntelCoverage");

    if (manpowerInput) manpowerInput.value = String(economy.manpower);
    if (suppliesInput) suppliesInput.value = String(economy.supplies);
    if (fuelInput) fuelInput.value = String(economy.fuel);
    if (ammoInput) ammoInput.value = String(economy.ammo ?? 0);
    if (airPowerInput) airPowerInput.value = String(economy.airPower);
    if (navalPowerInput) navalPowerInput.value = String(economy.navalPower);
    if (intelInput) intelInput.value = String(economy.intelCoverage);
  }

  private applyResourceEdit(): void {
    const factionSelect = this.element.querySelector<HTMLSelectElement>("#editorResourceFaction");
    if (!factionSelect) return;

    const faction = factionSelect.value;
    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const economy = scenario.economies.find((e) => e.faction === faction);
    if (!economy) {
      this.setCampaignStatusMessage({
        title: "Resource update failed.",
        detail: `No economy record exists for faction ${faction}.`,
        action: "Choose a faction with a configured economy or repair the campaign data before retrying.",
        tone: "warning"
      });
      return;
    }

    // Get values from input fields
    const manpowerInput = this.element.querySelector<HTMLInputElement>("#editorManpower");
    const suppliesInput = this.element.querySelector<HTMLInputElement>("#editorSupplies");
    const fuelInput = this.element.querySelector<HTMLInputElement>("#editorFuel");
    const ammoInput = this.element.querySelector<HTMLInputElement>("#editorAmmo");
    const airPowerInput = this.element.querySelector<HTMLInputElement>("#editorAirPower");
    const navalPowerInput = this.element.querySelector<HTMLInputElement>("#editorNavalPower");
    const intelInput = this.element.querySelector<HTMLInputElement>("#editorIntelCoverage");

    // Update economy values
    if (manpowerInput) economy.manpower = Math.max(0, parseInt(manpowerInput.value) || 0);
    if (suppliesInput) economy.supplies = Math.max(0, parseInt(suppliesInput.value) || 0);
    if (fuelInput) economy.fuel = Math.max(0, parseInt(fuelInput.value) || 0);
    if (ammoInput) economy.ammo = Math.max(0, parseInt(ammoInput.value) || 0);
    if (airPowerInput) economy.airPower = Math.max(0, parseInt(airPowerInput.value) || 0);
    if (navalPowerInput) economy.navalPower = Math.max(0, parseInt(navalPowerInput.value) || 0);
    if (intelInput) economy.intelCoverage = Math.max(0, parseInt(intelInput.value) || 0);

    // Update the scenario
    this.campaignState.setScenario(scenario);
    this.setCampaignStatusMessage({
      title: "Resources updated.",
      detail: `${faction} economy values were saved to the active campaign state.`,
      action: "Review the updated ledgers or continue editing the scenario.",
      tone: "success"
    });
  }

  /**
   * Validates campaign scenario map extents and tiles.
   * Returns warnings about tiles in water zones or out of bounds.
   */
  private validateMapExtents(scenario: CampaignScenarioData): string[] {
    const warnings: string[] = [];
    const { dimensions, mapExtents, tiles } = scenario;

    // Log corner coordinates
    if (mapExtents) {
      console.log("Map Corners:", {
        NW: `(${mapExtents.corners.nw.q}, ${mapExtents.corners.nw.r}) - ${mapExtents.corners.nw.label}`,
        NE: `(${mapExtents.corners.ne.q}, ${mapExtents.corners.ne.r}) - ${mapExtents.corners.ne.label}`,
        SW: `(${mapExtents.corners.sw.q}, ${mapExtents.corners.sw.r}) - ${mapExtents.corners.sw.label}`,
        SE: `(${mapExtents.corners.se.q}, ${mapExtents.corners.se.r}) - ${mapExtents.corners.se.label}`
      });

      // Build water hex set from explicit waterHexes list (preferred)
      const waterHexSet = new Set(mapExtents.waterHexes ?? []);

      // If no explicit water hexes, fall back to zone-based detection
      const waterZones = mapExtents.zones.filter(z => z.terrain === "water");

      tiles.forEach(tile => {
        const { q, r } = tile.hex;
        const hexKey = `${q},${r}`;

        // Check bounds
        if (q < 0 || q >= dimensions.cols || r < 0 || r >= dimensions.rows) {
          warnings.push(`Tile at (${q}, ${r}) is outside map bounds (${dimensions.cols}×${dimensions.rows})`);
        }

        // Check if tile is in water (prefer explicit waterHexes over zones)
        const isWater = waterHexSet.has(hexKey) || waterZones.some(zone => r >= zone.rMin && r <= zone.rMax);

        if (isWater) {
          const paletteEntry = scenario.tilePalette[tile.tile];
          const role = paletteEntry?.role ?? "unknown";
          warnings.push(`${role} at (${q}, ${r}) is in water hex`);
        }
      });

      if (warnings.length > 0) {
        console.warn("Map validation warnings:", warnings);
      }
    }

    return warnings;
  }

  private exportCampaignJSON(): void {
    const scenario = this.campaignState.getScenario();
    if (!scenario) {
      this.setCampaignStatusMessage({
        title: "Export failed.",
        detail: "No campaign scenario is currently loaded.",
        action: "Load a campaign scenario before exporting JSON.",
        tone: "warning"
      });
      return;
    }

    // Validate map extents
    const warnings = this.validateMapExtents(scenario);
    if (warnings.length > 0) {
      const waterWarnings = warnings.filter(w => w.includes("water zone"));
      if (waterWarnings.length > 0) {
        console.warn("Tiles in water zones detected:", waterWarnings);
      }
    }

    // Import the original campaign data to get the full palette and mapExtents
    import("../../data/campaign01.json").then((originalModule) => {
      const original = originalModule.default as any;

      // Merge: use current scenario but restore full original palette and mapExtents
      const exportScenario = {
        ...scenario,
        tilePalette: original.tilePalette, // Use full original palette
        mapExtents: original.mapExtents // Include map extents documentation
      };

      const json = JSON.stringify(exportScenario, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign_${scenario.key}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.setCampaignStatusMessage({
        title: warnings.length > 0 ? "Campaign JSON exported with warnings." : "Campaign JSON exported.",
        detail: warnings.length > 0
          ? `Downloaded a full-palette export with ${warnings.length} validation warning(s).`
          : "Downloaded a full-palette campaign JSON export.",
        action: warnings.length > 0
          ? "Review the console warnings before using the exported file."
          : "Use the downloaded JSON for archival or scenario review.",
        tone: warnings.length > 0 ? "warning" : "success"
      });
    }).catch((err) => {
      console.error("Failed to load original campaign data:", err);
      // Fallback to exporting as-is
      const json = JSON.stringify(scenario, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign_${scenario.key}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.setCampaignStatusMessage({
        title: "Campaign JSON exported with warnings.",
        detail: "Palette restoration failed, so the download contains the current scenario state only.",
        action: "Review the exported file and console output before treating it as a final source asset.",
        tone: "warning"
      });
    });
  }

  private saveCampaignToFile(): void {
    const scenario = this.campaignState.getScenario();
    if (!scenario) {
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail: "No campaign scenario is currently loaded.",
        action: "Load a campaign scenario before saving an export file.",
        tone: "warning"
      });
      return;
    }

    // Validate map extents
    const warnings = this.validateMapExtents(scenario);
    if (warnings.length > 0) {
      const waterWarnings = warnings.filter(w => w.includes("water zone"));
      if (waterWarnings.length > 0) {
        console.warn("Tiles in water zones detected:", waterWarnings);
      }
    }

    // Import the original campaign data to get the full palette and mapExtents
    import("../../data/campaign01.json").then((originalModule) => {
      const original = originalModule.default as any;

      // Merge: use current scenario but restore full original palette and mapExtents
      const exportScenario = {
        ...scenario,
        tilePalette: original.tilePalette, // Use full original palette
        mapExtents: original.mapExtents // Include map extents documentation
      };

      const json = JSON.stringify(exportScenario, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign01.json`; // Fixed filename to replace the original
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.setCampaignStatusMessage({
        title: warnings.length > 0 ? "Campaign saved with warnings." : "Campaign saved.",
        detail: warnings.length > 0
          ? `Downloaded campaign01.json with ${warnings.length} validation warning(s).`
          : "Downloaded campaign01.json for source replacement.",
        action: warnings.length > 0
          ? "Review the console warnings before replacing the source file."
          : "Replace src/data/campaign01.json with the downloaded file when ready.",
        tone: warnings.length > 0 ? "warning" : "success"
      });
    }).catch((err) => {
      console.error("Failed to load original campaign data:", err);
      const detail = err instanceof Error
        ? err.message
        : "Original campaign data could not be loaded for palette restoration.";
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail,
        action: "Retry the save. If palette restoration keeps failing, inspect the source campaign data first.",
        tone: "warning"
      });
    });
  }

  /** Saves the full campaign envelope, including faction-local knowledge and active operations. */
  private saveCampaignSession(): void {
    if (!this.campaignState.getScenario()) {
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail: "No campaign scenario is currently loaded.",
        action: "Load a campaign scenario before saving progress.",
        tone: "warning"
      });
      return;
    }
    this.campaignState.saveToStorage();
    this.setCampaignStatusMessage({
      title: "Campaign saved.",
      detail: "Progress, reports, contacts, uncertainty, and intelligence operations are stored in the local campaign slot.",
      action: "Continue the campaign or use Load to restore this checkpoint.",
      tone: "success"
    });
  }

  /** Restores the full versioned campaign envelope from the local campaign slot. */
  private loadCampaignSession(): void {
    if (!this.campaignState.hasSave()) {
      this.setCampaignStatusMessage({
        title: "No campaign save found.",
        detail: "The local campaign slot is empty.",
        action: "Save the current campaign before trying to restore it.",
        tone: "warning"
      });
      return;
    }
    this.campaignState.loadFromStorage();
    this.renderTimeDisplay();
    this.setCampaignStatusMessage({
      title: "Campaign restored.",
      detail: "The operational picture and all intelligence operations were restored with campaign progress.",
      action: "Review new and stale reports before issuing the next order.",
      tone: "success"
    });
  }

  private loadCampaignFromFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const scenario = JSON.parse(json);

          // Validate it's a campaign scenario
          if (!scenario.key || !scenario.tilePalette || !scenario.tiles) {
            this.setCampaignStatusMessage({
              title: "Campaign load failed.",
              detail: "The selected file is not a valid campaign scenario.",
              action: "Choose a campaign JSON export with scenario key, palette, and tile data.",
              tone: "warning"
            });
            return;
          }

          // Validate map extents
          const warnings = this.validateMapExtents(scenario);
          if (warnings.length > 0) {
            const waterWarnings = warnings.filter(w => w.includes("water zone"));
            if (waterWarnings.length > 0) {
              console.warn("Tiles in water zones detected:", waterWarnings);
            }
          }

          this.campaignState.setScenario(scenario);
          this.renderCampaignMap();

          this.setCampaignStatusMessage({
            title: warnings.length > 0 ? "Campaign loaded with warnings." : "Campaign loaded.",
            detail: warnings.length > 0
              ? `Scenario imported with ${warnings.length} validation warning(s).`
              : "Scenario imported into the active campaign view.",
            action: warnings.length > 0
              ? "Review the console warnings before editing or saving the imported scenario."
              : "Review the map, fronts, and ledgers before continuing.",
            tone: warnings.length > 0 ? "warning" : "success"
          });
        } catch (err) {
          console.error("Failed to parse campaign file:", err);
          this.setCampaignStatusMessage({
            title: "Campaign load failed.",
            detail: "The selected file could not be parsed as valid JSON.",
            action: "Choose a valid campaign JSON file and retry the import.",
            tone: "warning"
          });
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }
}
