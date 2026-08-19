import type { IScreenManager } from "../../contracts/IScreenManager";
import type { CampaignPendingEngagement, CampaignScenarioData, ProductionAllocation } from "../../core/campaignTypes";
import type { CampaignIntelOperationType, CampaignIntelOperationView, CampaignMapViewModel } from "../../core/campaignIntelTypes";
import type {
  CampaignOrder,
  CampaignOrderActionPreview,
  CampaignReservation
} from "../../game/campaign/orders/CampaignOrderTypes";
import type { CampaignAdvanceStopReason } from "../../game/campaign/runtime/campaignRuntimeTypes";
import { MISSION_TYPE_LABELS } from "../../game/campaign/EngagementContextBuilder";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { hexDistance } from "../../core/Hex";
import { CampaignMapRenderer } from "../../rendering/CampaignMapRenderer";
import { TRANSPORT_MODES, getDefaultTransportMode } from "../../data/transportModes";
import { MapViewport } from "../controls/MapViewport";
import { computeDailyProduction, ensureCampaignState } from "../../state/CampaignState";
import { ensureUnlockState } from "../../state/UnlockState";
import {
  type CampaignCommandAdvanceMode,
  type CampaignCommandOrderCommitView,
  type CampaignCommandOrderView,
  type CampaignCommandPriorityView,
  type CampaignCommandSituationView,
  type CampaignCommandShellView
} from "../campaign/CampaignCommandShell";
import { CampaignCommandScreen as CampaignCommandInterface } from "../campaign/CampaignCommandScreen";
import { projectRuntimeHexKeyToCampaignOffset } from "../campaign/CampaignCommandProjection";
import {
  CampaignActionRegistry,
  decorateCampaignOrderComposer,
  explainCampaignOrderValidationIssue,
  getCampaignIntelOperationType,
  getCampaignIntelligenceActionId,
  type CampaignActionContext,
  type CampaignActionId
} from "../campaign/CampaignOrderExperience";

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
  private timeDisplayElement: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private loadButton: HTMLButtonElement | null = null;
  private battleSavesButton: HTMLButtonElement | null = null;
  private saveLoadBusy = false;
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
  private commandInterface: CampaignCommandInterface | null = null;
  private commandSaveStatus: CampaignCommandShellView["saveStatus"] = "Unsaved";
  private campaignAdvanceMode: CampaignCommandAdvanceMode = "nextReport";
  private pauseAfterEveryCampaignResolution = false;
  private readonly campaignActionRegistry = new CampaignActionRegistry((actionId, context) => this.previewCampaignAction(actionId, context));
  private editingIntelOrderId: string | null = null;
  private editingIntelAssetKey: string | null = null;
  private commandCommitBusy = false;
  private commandCommitFeedback: Pick<CampaignCommandOrderCommitView, "feedback" | "feedbackTone"> = { feedback: null, feedbackTone: null };
  private campaignPopupInvoker: HTMLElement | null = null;

  constructor(
    screenManager: IScreenManager,
    renderer: CampaignMapRenderer,
    private readonly sourceScenario?: CampaignScenarioData
  ) {
    this.screenManager = screenManager;
    this.renderer = renderer;
    const el = document.getElementById("campaignScreen");
    if (!el) {
      throw new Error("Campaign screen element (#campaignScreen) not found in DOM");
    }
    this.element = el;
  }

  /** Routes registry lookups to state-owned preview services without recreating campaign rules in the UI. */
  private previewCampaignAction(actionId: CampaignActionId, context: CampaignActionContext): CampaignOrderActionPreview {
    if (actionId === "redeploy") {
      return this.campaignState.getCampaignRedeployActionPreview(context.selectionId ?? "");
    }
    if (actionId === "production") {
      return this.campaignState.getCampaignProductionActionPreview("Player", context.excludeOrderId ?? undefined);
    }
    if (actionId === "infrastructureRepair") {
      return this.campaignState.getCampaignInfrastructureRepairActionPreview(context.selectionId ?? "");
    }
    const operationType = getCampaignIntelOperationType(actionId);
    if (!operationType) throw new Error(`Campaign action ${actionId} has no authoritative preview route.`);
    return this.campaignState.previewIntelOperationDraft({
      type: operationType,
      targetHexKey: context.selectionId ?? undefined,
      targetContactId: context.targetContactId ?? undefined,
      assignedAssetKey: context.assignedAssetKey ?? undefined,
      excludeOrderId: context.excludeOrderId ?? undefined,
      faction: "Player"
    });
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
   * live engine-accurate preview via CampaignState.previewRedeploy. Add Draft never spends resources;
   * the authoritative validator rechecks every shared reservation before atomic commit.
   */
  private openRedeployModal(
    originOffsetKey: string,
    destOffsetKey: string,
    editingOrder?: Extract<CampaignOrder, { kind: "redeploy" }>
  ): void {
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
    const originFormations = this.campaignState.getCampaignFormationRoster("Player")
      .filter((formation) => projectRuntimeHexKeyToCampaignOffset(formation.locationHexKey) === originOffsetKey);
    const originForces = (originTile?.forces ?? []).map((g) => {
      const names = originFormations
        .filter((formation) => formation.campaignUnitType === g.unitType)
        .map((formation) => formation.name);
      return {
        unitType: g.unitType,
        count: g.count,
        label: names.length > 0 ? names.join(" + ") : this.formatCampaignLabel(g.unitType)
      };
    });
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

    // Default mode: recommended mode of the largest usable force group, else first usable mode.
    const sortedForces = [...originForces].sort((x, y) => y.count - x.count);
    let selectedModeKey = editingOrder?.payload.transportModeKey ?? "foot";
    let defaulted = false;
    if (!editingOrder) {
      for (const g of sortedForces) {
        const candidate = getDefaultTransportMode(g.unitType);
        if (TRANSPORT_MODES[candidate]) {
          selectedModeKey = candidate;
          defaulted = true;
          break;
        }
      }
      if (!defaulted) selectedModeKey = Object.keys(TRANSPORT_MODES)[0] ?? "foot";
    }

    title.textContent = editingOrder ? "Edit Redeployment Draft" : "Plan Redeployment";

    const modeCards = Object.keys(TRANSPORT_MODES)
      .map((key) => {
        const mode = TRANSPORT_MODES[key];
        const p = MODE_PRESENTATION[key] ?? { icon: "•", name: mode.label, note: "" };
        return `
          <button type="button" class="redeploy-mode-card" data-mode="${key}" title="${this.escapeHtml(mode.description ?? mode.label)}">
            <span class="mode-icon">${p.icon}</span>
            <span class="mode-name">${p.name}</span>
            <span class="mode-speed">${mode.speedHexPerDay} hex / 3h</span>
            <span class="mode-note">${this.escapeHtml(p.note)}</span>
          </button>`;
      })
      .join("");

    const unitRows = originForces
      .map(
        (g, idx) => {
        const selectedCount = editingOrder?.payload.selections.find((selection) => selection.unitType === g.unitType)?.count ?? g.count;
        return `
        <div class="redeploy-unit-row" data-unit-row="${idx}">
          <div class="unit-label">
            <span class="unit-name">${this.escapeHtml(g.label)}</span>
            <span class="unit-avail">${this.escapeHtml(this.formatCampaignLabel(g.unitType))} · ${g.count} available</span>
          </div>
          <input type="range" min="0" max="${g.count}" value="${selectedCount}" data-move-slider="${idx}" aria-label="${this.escapeHtml(this.formatCampaignLabel(g.unitType))} count" />
          <input type="number" min="0" max="${g.count}" value="${selectedCount}" data-move-index="${idx}" />
          <div class="unit-quick">
            <button type="button" data-quick="0" data-quick-idx="${idx}" title="Leave all behind">0</button>
            <button type="button" data-quick="half" data-quick-idx="${idx}" title="Move half">½</button>
            <button type="button" data-quick="all" data-quick-idx="${idx}" title="Move all">All</button>
          </div>
          <div class="unit-note" data-unit-note="${idx}"></div>
        </div>`;
        }
      )
      .join("");

    body.innerHTML = `
      <form id="campaignRedeployForm" class="redeploy-modal">
        <div class="redeploy-route">
          <span class="route-node">${originOffsetKey}${originRole ? ` · ${this.escapeHtml(this.formatCampaignLabel(originRole))}` : ""}</span>
          <span class="route-arrow">→</span>
          <span class="route-node">${destOffsetKey}${destRole ? ` · ${this.escapeHtml(this.formatCampaignLabel(destRole))}` : ""}</span>
          <span class="route-distance">${distance} hex · ~${distance * hexKm} km</span>
        </div>
        <div class="redeploy-issues" id="campaignRedeployIssues"></div>
        <div class="redeploy-section-label">Transport mode</div>
        <div class="redeploy-modes">${modeCards}</div>
        <div class="redeploy-section-label">Units to move</div>
        <div class="redeploy-units">${unitRows}</div>
        <div class="redeploy-summary-panel" id="campaignRedeploySummary"></div>
        <div class="button-row redeploy-actions">
          <button type="submit" class="primary-button" id="campaignRedeployConfirm">${editingOrder ? "Replace Draft" : "Add Draft"}</button>
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
    decorateCampaignOrderComposer(form, "redeploy", `${originOffsetKey} to ${destOffsetKey}`, Boolean(editingOrder));

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

      const preview = this.campaignState.previewRedeploy(originOffsetKey, destOffsetKey, currentSelections(), selectedModeKey, editingOrder?.id);
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
        <dl class="campaign-order-preview-contract">
          <div><dt>Route</dt><dd>${this.escapeHtml(originOffsetKey)} → ${this.escapeHtml(destOffsetKey)} · ${distance} hex</dd></div>
          <div><dt>Reservations</dt><dd>Selected force quantities${preview.capacityNeeded > 0 ? ` · ${preview.capacityNeeded} ${this.escapeHtml(mode?.capacityType ?? "transport")} capacity` : ""} · ${fmt(preview.fuelCost)} fuel · ${fmt(preview.suppliesCost)} supply</dd></div>
          <div><dt>Known risk</dt><dd>${preview.manpowerLoss > 0 ? `${fmt(preview.manpowerLoss)} estimated transit attrition` : "No modeled transit attrition"}; destination conditions may change before arrival.</dd></div>
          <div><dt>Objective effect</dt><dd>No score changes until the force arrives and later campaign events resolve.</dd></div>
          <div><dt>Cancellation</dt><dd>Before execution, committed costs and reservations are refunded exactly.</dd></div>
        </dl>
      `;

      issuesEl.innerHTML = preview.ok ? `<div class="campaign-order-preview-clear">No conflicts in the current command picture.</div>` : preview.diagnostics.map((issue) => `<div class="redeploy-issue" data-reason-code="${issue.code}"><strong>${issue.code.replace(/^ORDER_/, "").replace(/_/g, " ")}</strong><span>${this.escapeHtml(issue.message)}</span><small>${this.escapeHtml(issue.correctiveAction)}</small></div>`).join("");
      const canRetainConflict = preview.diagnostics.length > 0
        && preview.diagnostics.every((issue) => issue.code === "ORDER_RESERVATION_CONFLICT");
      confirmBtn.disabled = !preview.ok && !canRetainConflict;
      confirmBtn.textContent = editingOrder
        ? canRetainConflict ? "Replace with conflicted draft" : "Replace Draft"
        : canRetainConflict ? "Add conflicted draft" : "Add Draft";
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
      const result = this.campaignState.createRedeployDraft(originOffsetKey, destOffsetKey, currentSelections(), selectedModeKey, editingOrder?.id);
      if (!result.ok) {
        this.setCampaignStatusMessage({
          title: "Draft not added.",
          detail: result.reason ?? "The redeployment draft could not be added.",
          action: "Adjust the route, unit selection, or transport mode and try again.",
          tone: "warning"
        });
        return;
      }
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      clearPreview();
      this.commandCommitFeedback = { feedback: `Redeployment draft ${editingOrder ? "replaced" : "added"}; exact holds are visible in the tray.`, feedbackTone: "success" };
      this.renderCommandShell();
      this.setCampaignStatusMessage({
        title: result.order.validation.valid ? `Redeployment draft ${editingOrder ? "replaced" : "ready"}.` : "Redeployment draft has a conflict.",
        detail: result.order.validation.issues[0]?.message ?? `Movement draft ${editingOrder ? "replaced" : "added"} from ${originOffsetKey} to ${destOffsetKey}.`,
        action: result.order.validation.valid ? "Review the order tray, then commit orders when ready." : "Remove the conflicting draft or free the required capacity before committing.",
        tone: "success"
      });
    };
    const clearPreview = (): void => {
      this.renderer.clearAllHighlights("order-preview-origin");
      this.renderer.clearAllHighlights("order-preview-target");
    };
    cancelBtn.onclick = () => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      clearPreview();
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };

    // Show popup
    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    this.renderer.highlightHex(originOffsetKey, "order-preview-origin");
    this.renderer.highlightHex(destOffsetKey, "order-preview-target");
    confirmBtn.focus({ preventScroll: true });
    close.onclick = () => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      clearPreview();
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };
  }

  /**
   * Resolves which hex the battle is actually fought over.
   * Proximity engagements target the enemy tile adjacent to the selected hex; front engagements
   * target an authoritative enemy-held hex on or adjacent to the operational line.
   */
  private resolveBattleHexKey(engagement: CampaignPendingEngagement): string | null {
    if (engagement.tags.includes("proximity") && engagement.hexKeys.length > 0) {
      return this.campaignState.findAdjacentEnemyHexKey(engagement.hexKeys[0]);
    }
    return null;
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

  /**
   * Mounts the legacy editor controls only for explicitly authorized development builds.
   * Keeping the controls in template fragments prevents internal tools from entering the normal player DOM.
   */
  private mountCampaignDeveloperTools(): void {
    const editorEnabled = import.meta.env?.DEV === true || import.meta.env?.VITE_CAMPAIGN_EDITOR === "true";
    if (!editorEnabled) return;
    const sessionTemplate = this.element.querySelector<HTMLTemplateElement>("#campaignDeveloperSessionTemplate");
    const editorTemplate = this.element.querySelector<HTMLTemplateElement>("#campaignDeveloperEditorTemplate");
    const sessionTarget = this.element.querySelector<HTMLElement>(".session-controls");
    const editorTarget = this.element.querySelector<HTMLElement>(".campaign-sidebar");
    if (sessionTemplate && sessionTarget) sessionTarget.appendChild(sessionTemplate.content.cloneNode(true));
    if (editorTemplate && editorTarget) editorTarget.appendChild(editorTemplate.content.cloneNode(true));
  }

  initialize(): void {
    // Gate via a live subscription rather than a one-time startup check: Clerk auth
    // resolves after initializeApplication() runs, so the entitlement snapshot here
    // may still be the guest bootstrap. The overlay reacts to hydration in both directions.
    this.unlockState.subscribe(() => this.syncCampaignLockState());

    this.mountCampaignDeveloperTools();
    this.commandInterface = new CampaignCommandInterface(this.element, {
      onOpenIntelligence: () => document.dispatchEvent(new CustomEvent("campaign:intelligence:open")),
      onAcknowledgeAfterActionReport: (reportId) => {
        this.campaignState.acknowledgeCampaignAfterActionReport(reportId);
        this.renderCommandShell();
      },
      onAcknowledgeAlert: (alertId) => {
        this.campaignState.acknowledgeCampaignAlert(alertId);
        this.renderCommandShell();
      },
      onAfterActionTargetSelected: (targetKind, targetId) => {
        this.commandInterface?.navigate({ kind: targetKind, id: targetId, focus: true });
        const runtime = this.campaignState.getRuntimeSnapshot();
        let runtimeHexKey = targetKind === "infrastructure" ? targetId : null;
        if (targetKind === "formation" && targetId) runtimeHexKey = runtime?.formations[targetId]?.locationHexKey ?? null;
        if (targetKind === "engagement" && targetId) runtimeHexKey = this.campaignState.getCampaignAfterActionReport(targetId)?.battleHexKey ?? null;
        if (runtimeHexKey) {
          const [q, r] = runtimeHexKey.split(",").map(Number);
          if (Number.isFinite(q) && Number.isFinite(r)) {
            const offset = CoordinateSystem.axialToOffset(q, r);
            const offsetKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
            this.selectedHexKey = offsetKey;
            this.renderer.clearAllHighlights("selected");
            this.renderer.highlightHex(offsetKey, "selected");
            this.renderSelection();
          }
        }
      },
      onSelectionRequested: (selection) => {
        if (!selection) return;
        let selectedHexKey: string | null = null;
        if (selection.kind === "hex") {
          selectedHexKey = selection.id;
          this.selectedFrontKey = null;
        } else if (selection.kind === "front") {
          const front = this.campaignState.getCampaignMapView("Player")?.scenario.fronts.find((entry) => entry.key === selection.id);
          if (!front) return;
          this.selectedFrontKey = front.key;
          selectedHexKey = front.hexKeys[0] ?? null;
        } else if (selection.kind === "formation") {
          const formation = this.campaignState.getCampaignFormationSnapshot(selection.id);
          if (!formation || formation.faction !== "Player") return;
          this.selectedFrontKey = null;
          selectedHexKey = projectRuntimeHexKeyToCampaignOffset(formation.locationHexKey);
        } else {
          return;
        }
        if (selection.kind === "hex" && selectedHexKey === this.selectedHexKey) return;
        this.selectedHexKey = selectedHexKey;
        this.moveOriginHexKey = null;
        this.renderer.clearAllHighlights("selected");
        this.renderer.clearAllHighlights("origin");
        if (selection.kind === "front") {
          const front = this.campaignState.getCampaignMapView("Player")?.scenario.fronts.find((entry) => entry.key === selection.id);
          front?.hexKeys.forEach((hexKey) => this.renderer.highlightHex(hexKey, "selected"));
        } else if (selectedHexKey) {
          this.renderer.highlightHex(selectedHexKey, "selected");
        }
        this.renderSelection();
        this.renderCampaignIntel();
      },
      onCommitOrders: () => this.commitDraftOrders(),
      onAdvance: (mode) => this.advanceCampaignTime(mode),
      onAdvanceModeChanged: (mode) => { this.campaignAdvanceMode = mode; },
      onPauseAfterEveryResolutionChanged: (enabled) => { this.pauseAfterEveryCampaignResolution = enabled; },
      onRemoveOrder: (orderId) => this.removeDraftOrder(orderId),
      onEditOrder: (orderId) => this.editDraftOrder(orderId),
      onMoveOrder: (orderId, direction) => this.moveDraftOrder(orderId, direction),
      onCancelOrder: (orderId) => this.openOrderCancellationPreview(orderId),
      onContinueOutcome: () => {
        const continued = this.campaignState.continueCampaignAfterOutcome();
        if (!continued.ok) this.setCampaignStatusMessage({
          title: "Campaign continuation unavailable",
          detail: continued.reason,
          action: "Review the recorded result or load an earlier save.",
          tone: "warning"
        });
        this.renderCommandShell();
      },
      onCancelGesture: () => {
        if (!this.moveOriginHexKey) return;
        this.moveOriginHexKey = null;
        this.renderer.clearAllHighlights("origin");
        this.renderSelection();
      }
    });
    this.commandInterface.initialize();

    // Capture hooks after shell composition. Existing IDs are moved, never duplicated.
    this.economyContainer = this.element.querySelector<HTMLElement>("#campaignEconomySummary");
    this.productionContainer = this.element.querySelector<HTMLElement>("#campaignProductionSummary");
    this.productionManageButton = this.element.querySelector<HTMLButtonElement>("#campaignProductionManage");
    if (this.productionManageButton) {
      this.productionManageButton.addEventListener("click", () => {
        this.campaignPopupInvoker = this.productionManageButton;
        this.openProductionModal();
      });
    }
    this.selectionContainer = this.element.querySelector<HTMLElement>("#campaignSelectionInfo");
    this.queueEngagementButton = this.element.querySelector<HTMLButtonElement>("#campaignQueueEngagement");
    this.timeDisplayElement = this.element.querySelector<HTMLElement>("#campaignTimeDisplay");
    this.saveButton = this.element.querySelector<HTMLButtonElement>("#campaignSave");
    this.loadButton = this.element.querySelector<HTMLButtonElement>("#campaignLoad");
    this.battleSavesButton = this.element.querySelector<HTMLButtonElement>("#campaignBattleSaves");
    this.exitButton = this.element.querySelector<HTMLButtonElement>("#campaignExit");
    this.editModeButton = this.element.querySelector<HTMLButtonElement>("#campaignEditMode");
    this.exportJSONButton = this.element.querySelector<HTMLButtonElement>("#campaignExportJSON");
    this.editPanel = this.element.querySelector<HTMLElement>("#campaignEditPanel");
    this.intelDrawer = this.element.querySelector<HTMLElement>("#campaignIntelDrawer");
    this.intelSummary = this.element.querySelector<HTMLElement>("#campaignIntelSummary");
    this.intelUnreadBadge = this.element.querySelector<HTMLElement>("#campaignIntelUnread");
    this.intelCoverageButton = this.element.querySelector<HTMLButtonElement>("#campaignIntelCoverage");
    this.bindCampaignIntelControls();
    this.bindCampaignInspectorActions();

    if (this.saveButton) {
      this.saveButton.addEventListener("click", () => { void this.saveCampaignSession(); });
    }
    if (this.loadButton) {
      this.loadButton.addEventListener("click", () => { void this.loadCampaignSession(); });
    }
    if (this.battleSavesButton) {
      this.battleSavesButton.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("campaign:battle:saves-open", {
          detail: { invokerId: this.battleSavesButton?.id ?? null }
        }));
      });
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
        if (this.campaignState.getActiveCampaignBattlePackage()) {
          this.onQueueEngagement?.();
          return;
        }
        const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
        if (!scenario) return;
        const existing = this.campaignState.getPendingEngagements();
        const id = `eng_${Date.now()}`;
        let engagement: CampaignPendingEngagement | null = null;
        // Prefer front-driven engagement if a front is selected
        if (this.selectedFrontKey) {
          const front = scenario.fronts.find((f) => f.key === this.selectedFrontKey);
          if (!front) return;
          if (front.initiative !== "Player") {
            this.setCampaignStatusMessage({
              title: "Enemy initiative front.",
              detail: `${front.label} is controlled by the opposing command and cannot be launched as a Player attack.`,
              action: "Advance campaign time or issue defensive orders. Any enemy offensive will interrupt command automatically.",
              tone: "info"
            });
            this.renderCommandShell();
            return;
          }
          const prepared = this.campaignState.prepareCampaignFrontEngagement({
            engagementId: id,
            frontKey: front.key,
            attacker: "Player"
          });
          if (!prepared.ok) {
            this.reportBattleLaunchFailure(prepared.reason);
            return;
          }
          engagement = prepared.engagement;
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
        // so precombat can honor the situation on the map. A campaign battle must never fall
        // back to a generic scenario when its authoritative target cannot be proven.
        let context = engagement.context ?? null;
        const battleHexKey = context?.battleHexKey ?? this.resolveBattleHexKey(engagement);
        if (!context) {
          if (!battleHexKey) {
            this.reportBattleLaunchFailure("The selected operation has no opposing controlled battle hex. Issue movement orders to establish contact or select another operation.");
            return;
          }
          try {
            context = this.campaignState.buildCampaignEngagementContext({
              engagementId: id,
              battleHexKey,
              attacker: engagement.attacker,
              frontKey: engagement.frontKey,
              objectiveKey: engagement.objectiveKey
            }, "Player");
          } catch (error) {
            console.error("[CampaignBattleLaunch] Engagement context failed safely", error);
            this.reportBattleLaunchFailure(error instanceof Error ? error.message : String(error));
            return;
          }
          if (!context) {
            this.reportBattleLaunchFailure("Campaign truth is unavailable for the selected battle hex. Reload the campaign before trying again.");
            return;
          }
          engagement.context = context;
        }
        try {
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
        } catch (error) {
          console.error("[CampaignBattleLaunch] Engagement context failed safely", error);
          this.reportBattleLaunchFailure(error instanceof Error ? error.message : String(error));
          return;
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
      if (reason === "scenarioLoaded" || reason === "intelligenceUpdated" || reason === "dayAdvanced" || reason === "segmentResolved") {
        this.renderCampaignMap();
      }
      // Segment transactions update the operational clock only after the full candidate commits.
      if (reason === "dayAdvanced" || reason === "segmentResolved") {
        this.renderTimeDisplay();
      }
      this.renderEconomy();
      this.renderProduction();
      this.renderSelection();
      this.renderCampaignIntel();
      if (!this.saveLoadBusy) this.commandSaveStatus = "Unsaved";
      this.renderCommandShell();
    });
    this.renderCommandShell();
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
    // Map clicks are selection-only. Every campaign action requires a separate inspector or tray control.
    this.renderer.onHexClick((hexKey) => {
      const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
      if (this.campaignStatusMessage) {
        this.campaignStatusMessage = null;
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

      this.selectedHexKey = hexKey;
      if (this.editMode) {
        this.moveOriginHexKey = null;
      }
      this.renderer.clearAllHighlights("selected");
      this.renderer.clearAllHighlights("origin");
      if (this.moveOriginHexKey) this.renderer.highlightHex(this.moveOriginHexKey, "origin");
      if (this.selectedHexKey) this.renderer.highlightHex(this.selectedHexKey, "selected");
      this.renderSelection();
      this.renderCampaignIntel();
      this.commandInterface?.revealInspector({ kind: "hex", id: hexKey });
    });

    // Initial sidebar render
    this.renderTimeDisplay();
    this.renderEconomy();
    this.renderProduction();
    this.renderSelection();
    this.renderCampaignIntel();
    this.renderCommandShell();
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

  /** Keeps campaign command usable when a tactical handoff cannot preserve campaign truth. */
  reportBattleLaunchFailure(reason: string): void {
    this.setCampaignStatusMessage({
      title: "Tactical handoff blocked",
      detail: reason,
      action: "Keep campaign time paused. Review the selected operation or reload after its campaign data is repaired.",
      tone: "warning"
    });
    this.renderCommandShell();
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
    if (this.productionManageButton) {
      const action = this.campaignActionRegistry.resolve("production", {
        selectionKind: "none",
        selectionId: null
      });
      this.productionManageButton.disabled = action.availability !== "available";
      this.productionManageButton.dataset.reasonCode = action.reasonCode ?? "";
      this.productionManageButton.title = action.availability === "available"
        ? "Plan the next industrial allocation."
        : `${action.reason ?? "Production planning is unavailable."} ${action.correctiveAction ?? ""}`.trim();
    }
  }

  /** Opens the industrial allocation modal: sliders per resource with a live daily-output preview. */
  private openProductionModal(editingOrder?: Extract<CampaignOrder, { kind: "production" }>): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    if (!layer || !dialog || !title || !body || !close) return;

    const report = this.campaignState.getProductionReport();
    if (!report) return;

    title.textContent = editingOrder ? "Edit Production Draft" : "War Production";
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
        <input type="range" min="0" max="100" step="5" value="${editingOrder?.payload.allocation[r.key] ?? report.allocation[r.key]}" data-alloc-slider="${r.key}" aria-label="${r.label} allocation" />
        <span class="alloc-pct" data-alloc-pct="${r.key}">${editingOrder?.payload.allocation[r.key] ?? report.allocation[r.key]}%</span>
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
        <div class="production-alloc-note">Percentages are normalized to 100% in the authoritative preview.</div>
        <div id="productionOrderPreview" class="campaign-order-preview-contract" aria-live="polite"></div>
        ${topSources.length > 0 ? `
          <div class="redeploy-section-label">Top production sites</div>
          <div class="production-sources">${sourceRows}</div>` : ""}
        <div class="button-row redeploy-actions">
          <button type="button" class="primary-button" id="productionApply">${editingOrder ? "Replace Draft" : "Add Draft"}</button>
          <button type="button" class="secondary-button" id="productionCancel">Cancel</button>
        </div>
      </div>
    `;

    const sliders = Array.from(body.querySelectorAll<HTMLInputElement>("[data-alloc-slider]"));
    const totalEl = body.querySelector<HTMLElement>("#productionAllocTotal");
    const applyBtn = body.querySelector<HTMLButtonElement>("#productionApply");
    const cancelBtn = body.querySelector<HTMLButtonElement>("#productionCancel");
    const previewEl = body.querySelector<HTMLElement>("#productionOrderPreview");
    if (!applyBtn || !cancelBtn) return;
    const composer = body.querySelector<HTMLElement>(".production-modal");
    if (composer) decorateCampaignOrderComposer(composer, "production", "Set the next daily industrial allocation", Boolean(editingOrder));

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
      const preview = this.campaignState.previewProductionDraft(raw, editingOrder?.id);
      const daily = preview.dailyOutput ?? computeDailyProduction(report.capacity, { supplies: 0, fuel: 0, ammo: 0, manpower: 0 });
      RESOURCES.forEach((r) => {
        const pctEl = body.querySelector<HTMLElement>(`[data-alloc-pct="${r.key}"]`);
        const outEl = body.querySelector<HTMLElement>(`[data-alloc-out="${r.key}"]`);
        if (pctEl) pctEl.textContent = `${raw[r.key]}%`;
        if (outEl) outEl.textContent = `+${fmt(daily[r.key])}/day`;
      });
      if (previewEl) {
        const normalized = preview.normalizedAllocation;
        previewEl.innerHTML = preview.action.availability === "available" && normalized && preview.effectiveSegment !== null
          ? `<div><dt>Intent</dt><dd>Supply ${normalized.supplies}% · Fuel ${normalized.fuel}% · Ammo ${normalized.ammo}% · Personnel ${normalized.manpower}%</dd></div>
             <div><dt>Timing</dt><dd>Effective ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(preview.effectiveSegment))}; the current allocation remains active until then.</dd></div>
             <div><dt>Reservation</dt><dd>Holds the exclusive next-delivery allocation slot; no stocks are spent.</dd></div>
             <div><dt>Known risk</dt><dd>Output follows controlled industrial capacity at delivery time.</dd></div>
             <div><dt>Objective effect</dt><dd>Indirect only; objective score changes when later campaign conditions resolve.</dd></div>
             <div><dt>Cancellation</dt><dd>After commitment, supersede this directive with a new allocation.</dd></div>
             <div class="campaign-order-preview-clear"><dt>Conflicts</dt><dd>No conflict in the current command picture.</dd></div>`
          : `<div class="redeploy-issue" data-reason-code="${preview.action.reasonCode ?? "ORDER_ALLOCATION_INVALID"}"><strong>${(preview.action.reasonCode ?? "ORDER_ALLOCATION_INVALID").replace(/^ORDER_/, "").replace(/_/g, " ")}</strong><span>${this.escapeHtml(preview.action.reason ?? "The allocation is unavailable.")}</span><small>${this.escapeHtml(preview.action.correctiveAction ?? "Adjust the allocation and review it again.")}</small></div>`;
      }
      applyBtn.disabled = preview.action.availability !== "available" || !preview.normalizedAllocation;
    };

    sliders.forEach((sl) => sl.addEventListener("input", refresh));
    refresh();

    const hide = (): void => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
    };

    applyBtn.onclick = () => {
      const result = this.campaignState.createProductionDraft(readAllocation(), editingOrder?.id);
      if (!result.ok) {
        this.setCampaignStatusMessage({
          title: "Draft not added.",
          detail: result.reason ?? "The production allocation draft could not be stored.",
          action: "Adjust the sliders so at least one resource receives output.",
          tone: "warning"
        });
        return;
      }
      hide();
      this.commandCommitFeedback = { feedback: `Production draft ${editingOrder ? "replaced" : "added"}; the next-delivery slot is held without spending stocks.`, feedbackTone: "success" };
      this.renderCommandShell();
      this.setCampaignStatusMessage({
        title: result.order.validation.valid ? `Production draft ${editingOrder ? "replaced" : "ready"}.` : "Production draft has a conflict.",
        detail: result.order.validation.issues[0]?.message ?? `The ${editingOrder ? "revised" : "new"} output mix is waiting in the order tray.`,
        action: result.order.validation.valid ? "Review and commit the draft before the next daily delivery." : "Remove the earlier production draft before committing.",
        tone: "success"
      });
    };
    cancelBtn.onclick = () => { hide(); this.campaignPopupInvoker?.focus({ preventScroll: true }); };
    close.onclick = () => { hide(); this.campaignPopupInvoker?.focus({ preventScroll: true }); };

    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    applyBtn.focus({ preventScroll: true });
  }

  /** Opens a reviewed, fully costed reconstruction composer instead of creating a one-click draft. */
  private openInfrastructureRepairModal(targetOffsetHexKey: string): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    const status = this.campaignState.getCampaignInfrastructureStatus(targetOffsetHexKey, "Player");
    const action = this.campaignActionRegistry.resolve("infrastructureRepair", {
      selectionKind: "hex",
      selectionId: targetOffsetHexKey
    });
    if (!layer || !dialog || !title || !body || !close || !status || action.availability === "hidden") return;
    title.textContent = "Plan Reconstruction";
    const infrastructureLabel = status.infrastructure.role.replace(/([A-Z])/g, " $1").trim();
    body.innerHTML = `
      <form id="campaignInfrastructureRepairForm" class="campaign-infrastructure-composer">
        <section class="campaign-order-preview-hero">
          <span>Facility and intent</span>
          <strong>${this.escapeHtml(infrastructureLabel)} at ${this.escapeHtml(targetOffsetHexKey)}</strong>
          <p>Restore ${status.infrastructure.integrity}/${status.infrastructure.maxIntegrity} integrity to full operational capacity.</p>
        </section>
        <dl class="campaign-order-preview-contract">
          <div><dt>Target / area</dt><dd>${this.escapeHtml(targetOffsetHexKey)} · friendly-controlled ${this.escapeHtml(infrastructureLabel)}</dd></div>
          <div><dt>Participant</dt><dd>${this.escapeHtml(status.engineerFormationName ?? "No supervising formation available")}</dd></div>
          <div><dt>Timing</dt><dd>Starts next segment · ${status.durationSegments * 3} hours · completes ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(status.completeSegment))}</dd></div>
          <div><dt>Cost now</dt><dd>${status.suppliesCost.toLocaleString()} supply · ${status.manpowerCost.toLocaleString()} personnel</dd></div>
          <div><dt>Reservations</dt><dd>Supervising formation, facility reconstruction slot, and exact resource stocks.</dd></div>
          <div><dt>Known risk</dt><dd>The formation remains committed on site; control loss or interruption can block completion.</dd></div>
          <div><dt>Objective effect</dt><dd>Restored capacity can support later objective conditions; no score changes at draft or commit.</dd></div>
          <div><dt>Cancellation</dt><dd>Before execution, committed stocks and the supervising formation are released exactly.</dd></div>
        </dl>
        <div id="campaignInfrastructureRepairIssues" class="redeploy-issues" aria-live="polite"></div>
        <div class="button-row redeploy-actions">
          <button type="submit" class="primary-button" id="campaignInfrastructureRepairConfirm">Add Draft</button>
          <button type="button" class="secondary-button" id="campaignInfrastructureRepairCancel">Cancel</button>
        </div>
      </form>
    `;
    const form = body.querySelector<HTMLFormElement>("#campaignInfrastructureRepairForm");
    const confirm = body.querySelector<HTMLButtonElement>("#campaignInfrastructureRepairConfirm");
    const cancel = body.querySelector<HTMLButtonElement>("#campaignInfrastructureRepairCancel");
    const issues = body.querySelector<HTMLElement>("#campaignInfrastructureRepairIssues");
    if (!form || !confirm || !cancel || !issues) return;
    decorateCampaignOrderComposer(form, "infrastructureRepair", `Restore ${infrastructureLabel} at ${targetOffsetHexKey}`);
    confirm.disabled = action.availability !== "available";
    issues.innerHTML = action.availability === "available"
      ? `<div class="campaign-order-preview-clear">No conflicts in the current command picture.</div>`
      : `<div class="redeploy-issue" data-reason-code="${action.reasonCode ?? "ORDER_INFRASTRUCTURE_INVALID"}"><strong>${(action.reasonCode ?? "ORDER_INFRASTRUCTURE_INVALID").replace(/^ORDER_/, "").replace(/_/g, " ")}</strong><span>${this.escapeHtml(action.reason ?? "Reconstruction is unavailable.")}</span><small>${this.escapeHtml(action.correctiveAction ?? "Review the selected facility.")}</small></div>`;
    const hide = (): void => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      this.renderer.clearAllHighlights("order-preview-target");
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const result = this.campaignState.createInfrastructureRepairDraft(targetOffsetHexKey);
      if (!result.ok) {
        issues.innerHTML = `<div class="redeploy-issue"><strong>DRAFT NOT ADDED</strong><span>${this.escapeHtml(result.reason ?? "Headquarters could not authorize reconstruction.")}</span><small>Review control, stocks, and on-site formation supervision.</small></div>`;
        return;
      }
      hide();
      this.commandCommitFeedback = { feedback: "Reconstruction draft added; stocks, facility slot, and supervising formation are held without spending.", feedbackTone: "success" };
      this.renderCommandShell();
      this.setCampaignStatusMessage({
        title: result.order.validation.valid ? "Repair draft ready." : "Repair draft has a conflict.",
        detail: result.order.validation.issues[0]?.message ?? "The reconstruction plan is waiting in the order tray.",
        action: result.order.validation.valid
          ? "Review its cost and completion time, then commit the order."
          : "Resolve the listed reservation conflict before committing.",
        tone: result.order.validation.valid ? "success" : "warning"
      });
    };
    cancel.onclick = hide;
    close.onclick = hide;
    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    this.renderer.highlightHex(targetOffsetHexKey, "order-preview-target");
    confirm.focus({ preventScroll: true });
  }

  /** Binds explicit inspector actions; map gestures themselves remain selection-only. */
  private bindCampaignInspectorActions(): void {
    this.selectionContainer?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-plan-campaign-redeploy]")) {
        if (!this.selectedHexKey) return;
        this.campaignPopupInvoker = target.closest<HTMLElement>("[data-plan-campaign-redeploy]");
        this.moveOriginHexKey = this.selectedHexKey;
        this.renderer.clearAllHighlights("origin");
        this.renderer.highlightHex(this.moveOriginHexKey, "origin");
        this.renderSelection();
        return;
      }
      if (target.closest("[data-confirm-campaign-redeploy]")) {
        if (!this.moveOriginHexKey || !this.selectedHexKey || this.moveOriginHexKey === this.selectedHexKey) return;
        const origin = this.moveOriginHexKey;
        const destination = this.selectedHexKey;
        this.moveOriginHexKey = null;
        this.renderer.clearAllHighlights("origin");
        this.campaignPopupInvoker = target.closest<HTMLElement>("[data-confirm-campaign-redeploy]");
        this.openRedeployModal(origin, destination);
        this.renderSelection();
        return;
      }
      if (target.closest("[data-cancel-campaign-redeploy]")) {
        this.moveOriginHexKey = null;
        this.renderer.clearAllHighlights("origin");
        this.renderSelection();
        return;
      }
      if (target.closest("[data-draft-infrastructure-repair]")) {
        if (!this.selectedHexKey) return;
        this.campaignPopupInvoker = target.closest<HTMLElement>("[data-draft-infrastructure-repair]");
        this.openInfrastructureRepairModal(this.selectedHexKey);
      }
    });
  }

  /** Renders projected selection details, legal explicit actions, and engagement queue status. */
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
    const view = this.campaignState.getCampaignMapView("Player");
    let selectedIsFriendlyOccupied = false;
    let selectedIsFriendlyControlled = false;
    const selectedInfrastructure = this.selectedHexKey
      ? this.campaignState.getCampaignInfrastructureStatus(this.selectedHexKey, "Player")
      : null;
    if (this.selectedHexKey && view) {
      const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
      const axial = parsed ? CoordinateSystem.offsetToAxial(parsed.col, parsed.row) : null;
      const tile = axial ? view.scenario.tiles.find((entry) => entry.hex.q === axial.q && entry.hex.r === axial.r) : null;
      const palette = tile ? view.scenario.tilePalette[tile.tile] : null;
      const owner = tile ? tile.factionControl ?? palette?.factionControl ?? "Neutral" : "Unknown";
      selectedIsFriendlyControlled = owner === "Player";
      selectedIsFriendlyOccupied = owner === "Player" && Boolean(tile?.forces?.some((force) => force.count > 0));
      items.push(`
        <div class="campaign-selection-identity">
          <strong>${this.escapeHtml(palette?.role?.replace(/([A-Z])/g, " $1").trim() ?? "Operational hex")}</strong>
          <span>${this.escapeHtml(this.selectedHexKey)} · ${this.escapeHtml(String(owner))} control</span>
        </div>
      `);
      if (selectedIsFriendlyOccupied && tile) {
        const forceSummary = (tile.forces ?? [])
          .filter((force) => force.count > 0)
          .map((force) => `${force.count.toLocaleString()} ${force.unitType.replace(/_/g, " ")}`)
          .join(" · ");
        items.push(`<div><strong>Present forces</strong><br>${this.escapeHtml(forceSummary)}</div>`);
      }
      if (selectedInfrastructure) {
        const infrastructure = selectedInfrastructure.infrastructure;
        const integrityPercent = Math.round(infrastructure.effectiveness * 100);
        const disruption = infrastructure.captureDisruptionUntilSegment !== null
          ? ` · Capture disruption clears ${this.campaignState.segmentToTimeDisplay(infrastructure.captureDisruptionUntilSegment)}`
          : "";
        const repairStatus = infrastructure.activeRepairOrderId
          ? "Reconstruction order active"
          : selectedInfrastructure.repairPoints > 0
            ? `${selectedInfrastructure.repairPoints} integrity missing · ${selectedInfrastructure.repairRate}/segment repair rate`
            : "Fully operational";
        const repairDescriptor = this.campaignActionRegistry.resolve("infrastructureRepair", {
          selectionKind: "hex",
          selectionId: this.selectedHexKey
        });
        const repairAction = selectedInfrastructure.repairPoints > 0 && !infrastructure.activeRepairOrderId
          ? `<button type="button" data-draft-infrastructure-repair data-reason-code="${repairDescriptor.reasonCode ?? ""}" ${repairDescriptor.availability === "available" ? "" : "disabled"} title="${this.escapeHtml(repairDescriptor.availability === "available" ? "Review the full reconstruction plan." : `${repairDescriptor.reason ?? "Reconstruction is unavailable."} ${repairDescriptor.correctiveAction ?? ""}`.trim())}">Plan reconstruction</button>`
          : "";
        items.push(`
          <section class="campaign-infrastructure-card" data-infrastructure-state="${this.escapeHtml(infrastructure.damageState)}">
            <div class="campaign-infrastructure-card__heading">
              <strong>Installation condition</strong>
              <span>${this.escapeHtml(infrastructure.damageState.replace(/([A-Z])/g, " $1").toLowerCase())}</span>
            </div>
            <div class="campaign-infrastructure-meter" role="meter" aria-label="Installation effectiveness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${integrityPercent}">
              <span style="width:${integrityPercent}%"></span>
            </div>
            <p>${infrastructure.integrity}/${infrastructure.maxIntegrity} integrity · ${integrityPercent}% operational capacity${this.escapeHtml(disruption)}</p>
            <p>${this.escapeHtml(repairStatus)}</p>
            ${selectedInfrastructure.repairPoints > 0 ? `<p>${selectedInfrastructure.suppliesCost} supply · ${selectedInfrastructure.manpowerCost} personnel${infrastructure.activeRepairOrderId ? " committed" : ""} · ETA ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(selectedInfrastructure.completeSegment))}${selectedInfrastructure.engineerFormationName ? ` · ${this.escapeHtml(selectedInfrastructure.engineerFormationName)}` : ""}</p>` : ""}
            ${repairDescriptor.reason ? `<small><strong>${repairDescriptor.reasonCode ?? "Blocked"}</strong> · ${this.escapeHtml(repairDescriptor.reason)} ${this.escapeHtml(repairDescriptor.correctiveAction ?? "")}</small>` : ""}
            ${repairAction ? `<div class="campaign-context-actions">${repairAction}</div>` : ""}
          </section>
        `);
      }
    }
    if (this.selectedFrontKey) {
      items.push(`<div><strong>Front assessment</strong><br>${this.escapeHtml(this.selectedFrontKey)}</div>`);
    }
    const engagements = this.campaignState.getPendingEngagements();
    if (engagements.length > 0) {
      items.push(`<div><strong>Pending engagements</strong><br>${engagements.length} decision${engagements.length === 1 ? "" : "s"} awaiting command</div>`);
    }
    if (this.moveOriginHexKey) {
      const destinationReady = Boolean(this.selectedHexKey && this.selectedHexKey !== this.moveOriginHexKey);
      items.push(`
        <div class="campaign-redeploy-gesture" role="status">
          <strong>Redeployment origin</strong>
          <span>${this.escapeHtml(this.moveOriginHexKey)}</span>
          <p>${destinationReady ? `Destination selected: ${this.escapeHtml(this.selectedHexKey ?? "")}. Review the route before opening the planner.` : "Select a destination hex. Selection will not move the formation."}</p>
          <div class="campaign-context-actions">
            ${destinationReady ? `<button type="button" data-confirm-campaign-redeploy>Plan redeployment here</button>` : ""}
            <button type="button" class="secondary" data-cancel-campaign-redeploy>Cancel planning</button>
          </div>
        </div>
      `);
    } else if (selectedIsFriendlyControlled) {
      const redeployDescriptor = this.campaignActionRegistry.resolve("redeploy", {
        selectionKind: "hex",
        selectionId: this.selectedHexKey
      });
      items.push(`
        <div class="campaign-context-actions">
          <button type="button" data-plan-campaign-redeploy data-reason-code="${redeployDescriptor.reasonCode ?? ""}" ${redeployDescriptor.availability === "available" ? "" : "disabled"} title="${this.escapeHtml(redeployDescriptor.availability === "available" ? "Choose a destination and review the movement plan." : `${redeployDescriptor.reason ?? "Redeployment is unavailable."} ${redeployDescriptor.correctiveAction ?? ""}`.trim())}">Plan redeployment</button>
          ${redeployDescriptor.reason ? `<small><strong>${redeployDescriptor.reasonCode ?? "Blocked"}</strong> · ${this.escapeHtml(redeployDescriptor.reason)} ${this.escapeHtml(redeployDescriptor.correctiveAction ?? "")}</small>` : ""}
        </div>
      `);
    }
    this.selectionContainer.innerHTML = items.join("") || "<div>No selection</div>";

    if (this.queueEngagementButton) {
      const activePackage = this.campaignState.getActiveCampaignBattlePackage();
      const canProximity = this.selectedHexKey ? this.campaignState.hasActionableEnemyContactNear(this.selectedHexKey) : false;
      const selectedFront = this.selectedFrontKey
        ? view?.scenario.fronts.find((front) => front.key === this.selectedFrontKey) ?? null
        : null;
      const canPlayerLaunchFront = selectedFront?.initiative === "Player";
      const canEngage = Boolean(activePackage) || canPlayerLaunchFront || canProximity;
      this.queueEngagementButton.disabled = !canEngage;
      this.queueEngagementButton.textContent = activePackage?.context.defender === "Player"
        ? "Respond to Enemy Offensive"
        : "Queue Tactical Engagement";
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
        this.renderer.clearAllHighlights("order-preview-target");
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
        this.renderer.clearAllHighlights("order-preview-target");
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
          this.editingIntelOrderId = null;
          this.editingIntelAssetKey = null;
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
        this.editingIntelOrderId = null;
        this.editingIntelAssetKey = null;
        this.intelFeedback = "";
        this.renderCampaignIntel();
        return;
      }
      if (target.closest("[data-intel-schedule]")) {
        this.scheduleSelectedIntelOperation();
      }
    });
    this.intelDrawer?.addEventListener("change", (event) => {
      const select = (event.target as Element).closest<HTMLSelectElement>("#campaignIntelAsset");
      if (select) this.editingIntelAssetKey = select.value || null;
    });
  }

  private scheduleSelectedIntelOperation(): void {
    if (!this.selectedHexKey) {
      this.intelFeedback = "Select a campaign hex on the map before issuing this order.";
      this.renderCampaignIntel();
      return;
    }
    const assetSelect = this.intelDrawer?.querySelector<HTMLSelectElement>("#campaignIntelAsset");
    const result = this.campaignState.createIntelOperationDraft({
      type: this.intelOperationType,
      targetHexKey: this.selectedHexKey,
      assignedAssetKey: assetSelect?.value || undefined,
      targetContactId: this.intelTargetContactId ?? undefined,
      replaceOrderId: this.editingIntelOrderId ?? undefined,
      faction: "Player"
    });
    if (!result.ok) {
      this.intelFeedback = result.reason;
      this.renderCampaignIntel();
      return;
    }
    const rule = this.campaignState.getIntelOperationRules()[this.intelOperationType];
    const replaced = Boolean(this.editingIntelOrderId);
    this.commandCommitFeedback = { feedback: `${rule.label} draft ${replaced ? "replaced" : "added"}; capacity, assets, and stocks are held without spending.`, feedbackTone: "success" };
    this.renderCommandShell();
    this.intelFeedback = result.order.validation.valid
      ? `${rule.label} draft ${replaced ? "replaced" : "added"} for ${this.selectedHexKey}; review and commit it in the order tray.`
      : result.order.validation.issues[0]?.message ?? `${rule.label} draft has a conflict.`;
    this.intelTargetContactId = null;
    this.editingIntelOrderId = null;
    this.editingIntelAssetKey = null;
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
    const heldCapacity = this.campaignState.getCampaignDraftReservations("Player").intelligenceCapacity;
    const draftAwareCapacity = Math.max(0, view.capacity.available - heldCapacity);
    if (this.intelSummary) {
      this.intelSummary.innerHTML = `
        <span><strong>${draftAwareCapacity}/${view.capacity.total}</strong> capacity free${heldCapacity > 0 ? ` · ${heldCapacity} held` : ""}</span>
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
    const composer = body.querySelector<HTMLElement>(".campaign-intel-composer");
    if (composer) {
      const kind = this.intelOperationType === "counterRecon" || this.intelOperationType === "opsec" || this.intelOperationType === "phantom"
        ? "counterIntelligence" as const
        : "reconnaissance" as const;
      const rule = this.campaignState.getIntelOperationRules()[this.intelOperationType];
      decorateCampaignOrderComposer(composer, kind, `${rule.label} at ${this.selectedHexKey ?? "unselected area"}`, Boolean(this.editingIntelOrderId));
      if (this.selectedHexKey) this.renderer.highlightHex(this.selectedHexKey, "order-preview-target");
    } else {
      this.renderer.clearAllHighlights("order-preview-target");
    }
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
    const heldCapacity = this.campaignState.getCampaignDraftReservations("Player").intelligenceCapacity;
    const draftAwareCapacity = Math.max(0, view.capacity.available - heldCapacity);
    return `
      <div class="campaign-intel-situation-grid">
        <article><span>Operational picture</span><strong>${view.enemyContacts.length} contacts</strong><small>${stale} stale or disputed</small></article>
        <article><span>Collection capacity</span><strong>${draftAwareCapacity}/${view.capacity.total}</strong><small>${view.capacity.committed} committed · ${heldCapacity} held</small></article>
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
    const initialPreview = this.campaignState.previewIntelOperationDraft({
      type: this.intelOperationType,
      targetHexKey: this.selectedHexKey ?? undefined,
      targetContactId: this.intelTargetContactId ?? undefined,
      excludeOrderId: this.editingIntelOrderId ?? undefined,
      faction: "Player"
    });
    const assets = initialPreview.eligibleAssets;
    const selectedAssetKey = this.editingIntelAssetKey && assets.some((asset) => asset.assetKey === this.editingIntelAssetKey)
      ? this.editingIntelAssetKey
      : assets[0]?.assetKey ?? null;
    const selectedPreview = this.campaignState.previewIntelOperationDraft({
      type: this.intelOperationType,
      targetHexKey: this.selectedHexKey ?? undefined,
      targetContactId: this.intelTargetContactId ?? undefined,
      assignedAssetKey: selectedAssetKey ?? undefined,
      excludeOrderId: this.editingIntelOrderId ?? undefined,
      faction: "Player"
    });
    const selectedAction = this.campaignActionRegistry.resolve(getCampaignIntelligenceActionId(this.intelOperationType), {
      selectionKind: this.intelTargetContactId ? "contact" : this.selectedHexKey ? "hex" : "none",
      selectionId: this.selectedHexKey,
      targetContactId: this.intelTargetContactId,
      assignedAssetKey: selectedAssetKey,
      excludeOrderId: this.editingIntelOrderId
    });
    const requiresAsset = rule.requiresAsset !== "none";
    const operationButtons = (Object.keys(rules) as CampaignIntelOperationType[]).map((type) => {
      const descriptor = this.campaignActionRegistry.resolve(getCampaignIntelligenceActionId(type), {
        selectionKind: type === "verify" && this.intelTargetContactId ? "contact" : this.selectedHexKey ? "hex" : "none",
        selectionId: this.selectedHexKey,
        targetContactId: type === "verify" ? this.intelTargetContactId : null,
        excludeOrderId: type === this.intelOperationType ? this.editingIntelOrderId : null
      });
      return `
        <button type="button" class="campaign-intel-operation-choice${type === this.intelOperationType ? " active" : ""}" data-intel-operation-type="${type}" data-action-availability="${descriptor.availability}" data-reason-code="${descriptor.reasonCode ?? ""}" title="${this.escapeHtml(descriptor.availability === "available" ? rules[type].description : `${descriptor.reason ?? "Operation unavailable."} ${descriptor.correctiveAction ?? ""}`.trim())}">
          <strong>${this.escapeHtml(rules[type].shortLabel)}</strong><span>${rules[type].capacityCost} capacity · ${rules[type].durationSegments * 3}h</span>
        </button>`;
    }).join("");
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
    const heldCapacity = this.campaignState.getCampaignDraftReservations("Player").intelligenceCapacity;
    const draftAwareCapacity = Math.max(0, view.capacity.available - heldCapacity);
    return `
      <div class="campaign-intel-capacity"><span>Capacity</span><strong>${draftAwareCapacity}/${view.capacity.total} free</strong><small>${view.capacity.committed} committed · ${heldCapacity} held</small></div>
      <div class="campaign-intel-operation-grid">${operationButtons}</div>
      <section class="campaign-intel-composer">
        <span class="campaign-intel-eyebrow">Order preview</span>
        <h4>${this.escapeHtml(rule.label)}</h4>
        <p>${this.escapeHtml(rule.description)}</p>
        <div class="campaign-intel-costs">
          <span>${rule.capacityCost} of ${selectedPreview.capacityAvailable} free capacity</span><span>${rule.durationSegments * 3} hours</span><span>${rule.suppliesCost} of ${selectedPreview.suppliesAvailable} supply</span><span>${rule.fuelCost} of ${selectedPreview.fuelAvailable} fuel</span>${requiresAsset && rule.assetRangeHex !== undefined ? `<span>${rule.assetRangeHex} hex range</span>` : ""}
        </div>
        <label>Target <strong>${this.escapeHtml(this.selectedHexKey ?? "Select a map hex")}</strong></label>
        ${requiresAsset ? `
          <label for="campaignIntelAsset">Assigned asset</label>
          <select id="campaignIntelAsset" ${assets.length === 0 ? "disabled" : ""}>
            ${assets.length === 0 ? `<option value="">No eligible asset</option>` : assets.map((asset) => `<option value="${this.escapeHtml(asset.assetKey)}" ${asset.assetKey === selectedAssetKey ? "selected" : ""}>${this.escapeHtml(asset.label)}</option>`).join("")}
          </select>
        ` : `<p class="campaign-intel-doctrine">This operation uses headquarters deception capacity and does not require a formation assignment.</p>`}
        <dl class="campaign-order-preview-contract">
          <div><dt>Area</dt><dd>${this.escapeHtml(this.selectedHexKey ?? "No target selected")} · radius ${rule.targetRadius} hex</dd></div>
          <div><dt>Timing</dt><dd>${selectedPreview.resolveSegment === null ? "Unavailable" : `Starts next segment · resolves ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(selectedPreview.resolveSegment))}`}</dd></div>
          <div><dt>Reservations</dt><dd>${rule.capacityCost} intelligence capacity${requiresAsset ? " · assigned asset" : ""} · ${rule.suppliesCost} supply · ${rule.fuelCost} fuel</dd></div>
          <div><dt>Known risk</dt><dd>Results remain limited by source access, uncertainty, and operation outcome; no hidden enemy truth is guaranteed.</dd></div>
          <div><dt>Objective effect</dt><dd>Improves or protects the operational picture; no direct objective score changes at draft or commit.</dd></div>
          <div><dt>Cancellation</dt><dd>Before execution, committed costs, capacity, and the assigned asset are released exactly.</dd></div>
        </dl>
        ${selectedAction.availability === "available"
          ? `<div class="campaign-order-preview-clear">No conflicts in the current command picture.</div>`
          : `<div class="redeploy-issue" data-reason-code="${selectedAction.reasonCode ?? "ORDER_OPERATION_INVALID"}"><strong>${(selectedAction.reasonCode ?? "ORDER_OPERATION_INVALID").replace(/^ORDER_/, "").replace(/_/g, " ")}</strong><span>${this.escapeHtml(selectedAction.reason ?? "The operation is unavailable.")}</span><small>${this.escapeHtml(selectedAction.correctiveAction ?? "Review the target and assigned asset.")}</small></div>`}
        ${this.intelFeedback ? `<div class="campaign-intel-feedback" aria-live="polite">${this.escapeHtml(this.intelFeedback)}</div>` : ""}
        <button type="button" class="campaign-intel-confirm" data-intel-schedule ${selectedAction.availability !== "available" ? "disabled" : ""}>${this.editingIntelOrderId ? "Replace draft" : "Add draft"}</button>
      </section>
      <div class="campaign-intel-section-heading"><h4>Active operations</h4></div>${active}
      ${recentlyComplete ? `<div class="campaign-intel-section-heading"><h4>Recent outcomes</h4></div>${recentlyComplete}` : ""}
    `;
  }

  /** Opens the owning composer with a draft's authoritative payload preselected. */
  private editDraftOrder(orderId: string): void {
    const order = this.campaignState.getCampaignOrders().find((entry) => entry.id === orderId && entry.faction === "Player");
    if (!order || order.status !== "draft") {
      this.setCampaignStatusMessage({
        title: "Draft not editable.",
        detail: "The selected order is no longer an active draft.",
        action: "Inspect its current lifecycle state in the order tray.",
        tone: "warning"
      });
      return;
    }
    this.campaignPopupInvoker = Array.from(this.element.querySelectorAll<HTMLElement>("[data-order-id]"))
      .find((entry) => entry.dataset.orderId === orderId) ?? null;
    if (order.kind === "redeploy") {
      this.openRedeployModal(order.payload.originOffsetKey, order.payload.destinationOffsetKey, order);
      return;
    }
    if (order.kind === "production") {
      this.openProductionModal(order);
      return;
    }
    if (order.kind === "infrastructureRepair") {
      this.setCampaignStatusMessage({
        title: "Reconstruction has no editable field.",
        detail: "Its target, supervising formation, cost, and timing are fixed by current facility conditions.",
        action: "Remove the draft and create a fresh reconstruction plan if conditions changed.",
        tone: "info"
      });
      return;
    }
    this.editingIntelOrderId = order.id;
    this.editingIntelAssetKey = order.payload.assignedAssetKey;
    this.intelOperationType = order.payload.operationType;
    this.intelTargetContactId = order.payload.targetContactId;
    this.selectedHexKey = order.payload.targetHexKey;
    this.intelTab = "operations";
    this.intelFeedback = "Editing this draft. Replace draft preserves the original if current validation fails.";
    this.renderer.clearAllHighlights("selected");
    this.renderer.highlightHex(order.payload.targetHexKey, "selected");
    document.dispatchEvent(new CustomEvent("campaign:intelligence:open"));
    this.renderSelection();
    this.renderCampaignIntel();
  }

  /** Changes draft priority and reports the resulting reservation revalidation. */
  private moveDraftOrder(orderId: string, direction: "earlier" | "later"): void {
    const result = this.campaignState.moveCampaignOrder(orderId, direction);
    const moved = this.campaignState.getCampaignOrders().find((order) => order.id === orderId);
    this.commandCommitFeedback = result.ok
      ? {
        feedback: moved?.validation.valid
          ? `Draft moved ${direction}; all affected holds were revalidated and this draft is ready.`
          : `Draft moved ${direction}; ${moved?.validation.issues[0]?.message ?? "a reservation conflict remains."}`,
        feedbackTone: moved?.validation.valid ? "success" : "warning"
      }
      : { feedback: result.reason ?? `The draft cannot move ${direction}.`, feedbackTone: "warning" };
    this.setCampaignStatusMessage(result.ok ? {
      title: `Draft moved ${direction}.`,
      detail: moved?.validation.issues[0]?.message ?? "Planning priority and shared holds were revalidated.",
      action: moved?.validation.valid ? "Review the updated tray or commit the valid draft set." : "Use the reason code and corrective action shown on the conflicted draft.",
      tone: moved?.validation.valid ? "success" : "warning"
    } : {
      title: "Draft priority unchanged.",
      detail: result.reason ?? `The draft cannot move ${direction}.`,
      action: "Review the other active drafts in the tray.",
      tone: "warning"
    });
    this.renderCommandShell();
  }

  /** Formats one Player-owned reservation without leaking runtime pool internals as unexplained IDs. */
  private campaignReservationLabel(reservation: CampaignReservation): string {
    const amount = reservation.amount.toLocaleString();
    if (reservation.kind === "resource") return `${amount} ${reservation.poolKey}`;
    if (reservation.kind === "transport") return `${amount} ${reservation.poolKey} transport`;
    if (reservation.kind === "intelligenceCapacity") return `${amount} intelligence capacity`;
    if (reservation.kind === "productionSlot") return "next production-allocation slot";
    if (reservation.kind === "formation") return `${amount} formation or force quantity`;
    return `${amount} assigned asset`;
  }

  /** Opens an in-game consequence review before applying a committed-order cancellation. */
  private openOrderCancellationPreview(orderId: string): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    const order = this.campaignState.getCampaignOrders().find((entry) => entry.id === orderId && entry.faction === "Player");
    const preview = this.campaignState.previewCampaignOrderCancellation(orderId, "Player");
    if (!layer || !dialog || !title || !body || !close || !order) return;
    this.campaignPopupInvoker = Array.from(this.element.querySelectorAll<HTMLElement>("[data-order-id]"))
      .find((entry) => entry.dataset.orderId === orderId) ?? null;
    const projected = this.projectCommandOrder(order, this.campaignState.getCampaignOrders().filter((entry) => entry.faction === "Player"));
    title.textContent = "Review Order Cancellation";
    body.innerHTML = `
      <section class="campaign-order-cancellation" data-cancellation-available="${preview.canCancel}">
        <header><span>Committed order</span><h3>${this.escapeHtml(projected.label)}</h3><p>${this.escapeHtml(projected.detail)}</p></header>
        <dl class="campaign-order-preview-contract">
          <div><dt>Released holds</dt><dd>${preview.releasedReservations.length > 0 ? preview.releasedReservations.map((reservation) => this.escapeHtml(this.campaignReservationLabel(reservation))).join(" · ") : "None"}</dd></div>
          <div><dt>Sunk cost</dt><dd>${this.escapeHtml(preview.sunkCostSummary)}</dd></div>
          <div><dt>Operational delay</dt><dd>${this.escapeHtml(preview.delaySummary)}</dd></div>
          <div><dt>Exposure</dt><dd>${this.escapeHtml(preview.exposureSummary)}</dd></div>
        </dl>
        <div class="${preview.canCancel ? "campaign-order-preview-clear" : "redeploy-issue"}" data-reason-code="${preview.reasonCode ?? ""}">
          <strong>${preview.canCancel ? "CANCELLATION AVAILABLE" : (preview.reasonCode ?? "CANCELLATION BLOCKED").replace(/^ORDER_/, "").replace(/_/g, " ")}</strong>
          <span>${this.escapeHtml(preview.reason ?? "The order can be cancelled before execution.")}</span>
          <small>${this.escapeHtml(preview.correctiveAction ?? "Confirm only if the consequences are acceptable.")}</small>
        </div>
        <div class="button-row redeploy-actions">
          <button type="button" class="primary-button" id="campaignConfirmOrderCancellation" ${preview.canCancel ? "" : "disabled"}>Confirm cancellation</button>
          <button type="button" class="secondary-button" id="campaignKeepOrder">Keep order</button>
        </div>
      </section>
    `;
    const confirm = body.querySelector<HTMLButtonElement>("#campaignConfirmOrderCancellation");
    const keep = body.querySelector<HTMLButtonElement>("#campaignKeepOrder");
    if (!confirm || !keep) return;
    const hide = (): void => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };
    confirm.onclick = () => {
      hide();
      this.cancelCommittedOrder(orderId);
    };
    keep.onclick = hide;
    close.onclick = hide;
    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    (preview.canCancel ? confirm : keep).focus({ preventScroll: true });
  }

  /** Issues every valid draft through one state transaction. */
  private commitDraftOrders(): void {
    if (this.commandCommitBusy) return;
    this.commandCommitBusy = true;
    this.commandCommitFeedback = { feedback: "Validating every draft and shared hold before atomic commit…", feedbackTone: "info" };
    this.renderCommandShell();
    const result = this.campaignState.commitCampaignOrders();
    this.commandCommitBusy = false;
    this.commandCommitFeedback = result.ok
      ? {
        feedback: `${result.committedCount} order${result.committedCount === 1 ? "" : "s"} committed together. Advance remains a separate command.`,
        feedbackTone: "success"
      }
      : {
        feedback: `Commit rejected. No order, resource, or hold changed; every draft was preserved.${result.blockers.length > 0 ? ` ${result.blockers.length} blocker${result.blockers.length === 1 ? "" : "s"} remain.` : ""}`,
        feedbackTone: "warning"
      };
    this.setCampaignStatusMessage(result.ok ? {
      title: `${result.committedCount} order${result.committedCount === 1 ? "" : "s"} committed.`,
      detail: "Resources and capacity were assigned together in one command transaction.",
      action: "Advance three hours when you are ready to execute the next campaign segment.",
      tone: "success"
    } : {
      title: "Orders not committed.",
      detail: `${result.reason} No order or resource changed; all drafts were preserved.`,
      action: result.blockers[0]
        ? explainCampaignOrderValidationIssue({ ...result.blockers[0] }).correctiveAction
        : "Resolve the conflict shown in the order tray, then try again.",
      tone: "warning"
    });
    this.renderCommandShell();
  }

  private removeDraftOrder(orderId: string): void {
    const result = this.campaignState.removeCampaignOrder(orderId);
    this.commandCommitFeedback = result.ok
      ? { feedback: "Draft removed; its holds were released and every later draft was revalidated.", feedbackTone: "success" }
      : { feedback: result.reason ?? "The draft is no longer editable.", feedbackTone: "warning" };
    this.setCampaignStatusMessage(result.ok ? {
      title: "Draft removed.",
      detail: "Its resource and capacity holds were released; later drafts were revalidated.",
      action: "Continue planning or commit the remaining valid drafts.",
      tone: "info"
    } : {
      title: "Draft not removed.",
      detail: result.reason ?? "The draft is no longer editable.",
      action: "Review its current status in the order tray.",
      tone: "warning"
    });
    this.renderCommandShell();
  }

  private cancelCommittedOrder(orderId: string): void {
    const preview = this.campaignState.previewCampaignOrderCancellation(orderId, "Player");
    const result = this.campaignState.cancelCampaignOrder(orderId);
    this.commandCommitFeedback = result.ok
      ? { feedback: `${preview.releasedReservations.length} committed hold${preview.releasedReservations.length === 1 ? "" : "s"} released after reviewed cancellation.`, feedbackTone: "success" }
      : { feedback: result.reason ?? "The order is no longer cancellable.", feedbackTone: "warning" };
    this.setCampaignStatusMessage(result.ok ? {
      title: "Order cancelled.",
      detail: `${preview.sunkCostSummary} ${preview.releasedReservations.length} committed reservation${preview.releasedReservations.length === 1 ? "" : "s"} restored.`,
      action: "Issue a replacement draft if command intent has changed.",
      tone: "success"
    } : {
      title: "Order not cancelled.",
      detail: result.reason ?? "The order is no longer cancellable.",
      action: "Allow the executing order to resolve or issue a follow-on order.",
      tone: "warning"
    });
    this.renderCommandShell();
  }

  private campaignAdvanceStopLabel(reason: CampaignAdvanceStopReason): string {
    const labels: Readonly<Record<CampaignAdvanceStopReason, string>> = {
      segmentComplete: "three-hour resolution complete",
      nextReport: "next report received",
      dawn: "dawn reached",
      dusk: "dusk reached",
      dayComplete: "one day complete",
      pauseAfterResolution: "pause-after-resolution preference",
      engagement: "tactical engagement requires command",
      objectiveChanged: "primary objective changed",
      blockedOrder: "an order requires a decision",
      formationAtRisk: "a formation is at risk",
      campaignEnded: "campaign ended",
      criticalAlert: "critical alert",
      resolutionFailed: "segment resolution failed",
      safetyLimit: "next-report safety limit reached"
    };
    return labels[reason];
  }

  /** Executes the selected bounded advance command and reports its exact safe stop boundary. */
  private advanceCampaignTime(mode: CampaignCommandAdvanceMode): void {
    this.campaignAdvanceMode = mode;
    const result = this.campaignState.advanceCampaign({
      mode,
      pauseAfterEveryResolution: this.pauseAfterEveryCampaignResolution,
      stopOnCriticalAlerts: true
    });
    if (result.ok) {
      const hours = result.report.elapsedSegments * 3;
      const highestAlert = [...result.report.alerts]
        .reverse()
        .find((alert) => alert.severity !== "routine");
      const stopLabel = this.campaignAdvanceStopLabel(result.report.stopReason);
      this.setCampaignStatusMessage({
        title: `Campaign advanced ${hours} hour${hours === 1 ? "" : "s"}.`,
        detail: `${this.campaignState.segmentToTimeDisplay(result.report.toSegment)} · Stopped because ${stopLabel}.${highestAlert ? ` ${highestAlert.title}: ${highestAlert.detail}` : ""}`,
        action: result.report.stopReason === "segmentComplete" || result.report.stopReason === "dawn"
          || result.report.stopReason === "dusk" || result.report.stopReason === "dayComplete"
          ? "Review the resolution timeline or continue with the next command."
          : "Review the highlighted report and issue any required follow-on orders before advancing.",
        tone: result.report.alerts.some((alert) => alert.requiresStop) ? "warning" : "success"
      });
      this.renderCommandShell();
      if (result.report.stopReason === "engagement"
        && this.campaignState.getActiveCampaignBattlePackage()?.context.defender === "Player") {
        this.onQueueEngagement?.();
      }
      return;
    }

    const partial = "report" in result ? result.report.elapsedSegments : 0;
    this.setCampaignStatusMessage({
      title: partial > 0 ? "Campaign advance stopped safely." : "Campaign time did not advance.",
      detail: partial > 0
        ? `${partial * 3} hours committed before the next segment was rejected. ${result.error.message}`
        : result.error.message,
      action: `The last valid segment boundary was retained. Diagnostic: ${result.error.code}.`,
      tone: "warning"
    });
    this.renderCommandShell();
  }

  /** Projects one authoritative typed order into the Player-safe tray timeline. */
  private projectCommandOrder(order: CampaignOrder, playerOrders: readonly CampaignOrder[]): CampaignCommandOrderView {
    let label: string;
    let detail: string;
    let etaSegment: number | null;
    let costSummary: string;
    let riskSummary: string;
    let objectiveEffect: string;
    let routeSummary: string;
    if (order.kind === "redeploy") {
      label = "Redeploy formation";
      detail = `${order.payload.originOffsetKey} → ${order.payload.destinationOffsetKey} · ${order.payload.transportModeKey.replace(/_/g, " ")}`;
      etaSegment = order.payload.etaSegment;
      routeSummary = `${order.payload.originOffsetKey} → ${order.payload.destinationOffsetKey} · ${order.payload.distance} hex`;
      costSummary = `${order.payload.fuelCost.toLocaleString()} fuel · ${order.payload.suppliesCost.toLocaleString()} supply${order.payload.manpowerCost > 0 ? ` · ${order.payload.manpowerCost.toLocaleString()} estimated personnel loss` : ""}`;
      riskSummary = order.payload.manpowerCost > 0
        ? `${order.payload.manpowerCost.toLocaleString()} modeled transit attrition; destination conditions can change before arrival.`
        : "No modeled transit attrition; destination conditions can change before arrival.";
      objectiveEffect = "No direct score change; formation position affects later control, engagement, and objective checks.";
    } else if (order.kind === "production") {
      label = "Set production allocation";
      const allocation = order.payload.allocation;
      detail = `Supply ${allocation.supplies}% · Fuel ${allocation.fuel}% · Ammo ${allocation.ammo}% · Personnel ${allocation.manpower}%`;
      etaSegment = order.payload.effectiveSegment;
      routeSummary = "Theater-wide industrial allocation";
      costSummary = "No stock spent; controlled industrial capacity is redirected.";
      riskSummary = "Output depends on controlled industrial capacity when the next delivery resolves.";
      objectiveEffect = "Indirect only; production supports later force, logistics, and objective conditions.";
    } else if (order.kind === "infrastructureRepair") {
      label = `Repair ${order.payload.role.replace(/([A-Z])/g, " $1").trim()}`;
      detail = `${order.payload.targetOffsetHexKey} · ${order.payload.sourceIntegrity} → ${order.payload.targetIntegrity} integrity · ${order.payload.suppliesCost} supply · ${order.payload.manpowerCost} personnel`;
      etaSegment = order.payload.completeSegment;
      routeSummary = `Facility at ${order.payload.targetOffsetHexKey}`;
      costSummary = `${order.payload.suppliesCost.toLocaleString()} supply · ${order.payload.manpowerCost.toLocaleString()} personnel`;
      riskSummary = "Supervising formation stays committed on site; control loss or interruption can block completion.";
      objectiveEffect = "Restored capacity can satisfy later infrastructure, supply, or control conditions; no score changes at commit.";
    } else {
      const rule = this.campaignState.getIntelOperationRules()[order.payload.operationType];
      label = rule.label;
      detail = `${order.payload.targetHexKey}${order.payload.assignedAssetKey ? ` · ${order.payload.assignedAssetKey}` : ""}`;
      etaSegment = order.payload.resolveSegment;
      routeSummary = `${order.payload.targetHexKey} · radius ${rule.targetRadius} hex`;
      costSummary = `${order.payload.suppliesCost.toLocaleString()} supply · ${order.payload.fuelCost.toLocaleString()} fuel · ${order.payload.capacityCost} intelligence capacity`;
      riskSummary = "Result remains limited by source access, uncertainty, and operation outcome; no hidden enemy truth is guaranteed.";
      objectiveEffect = "Changes the operational picture or its protection; no direct score change at commit.";
    }
    const reservations = this.campaignState.getCampaignOrderReservations(order.id, "Player");
    const draftOrders = playerOrders.filter((entry) => entry.status === "draft");
    const draftIndex = draftOrders.findIndex((entry) => entry.id === order.id);
    const cancellation = this.campaignState.previewCampaignOrderCancellation(order.id, "Player");
    const timingSummary = `${this.campaignState.segmentToTimeDisplay(order.earliestStartSegment)} start · ${etaSegment === null ? "completion not scheduled" : `${order.kind === "production" ? "effective" : "ETA"} ${this.campaignState.segmentToTimeDisplay(etaSegment)}`}`;
    const nextTransition = order.status === "draft"
      ? order.validation.valid ? "Ready for atomic commit" : "Blocked until the listed rule is corrected"
      : order.status === "committed"
        ? order.kind === "production" ? `Becomes effective ${this.campaignState.segmentToTimeDisplay(order.payload.effectiveSegment)}` : "Begins at the next campaign resolution boundary"
        : order.status === "executing" ? `Resolves ${etaSegment === null ? "at a future report" : this.campaignState.segmentToTimeDisplay(etaSegment)}`
          : order.status === "blocked" ? "Requires a command decision before progress can continue"
            : "Filed in command history";
    return {
      id: order.id,
      kind: order.kind,
      label,
      detail,
      status: order.status === "draft" && !order.validation.valid ? "conflict" : order.status,
      eta: etaSegment === null ? null : `${order.kind === "production" ? "Effective" : "ETA"} ${this.campaignState.segmentToTimeDisplay(etaSegment)}`,
      validationMessages: order.validation.issues.map((entry) => entry.message),
      validationIssues: order.validation.issues.map((entry) => explainCampaignOrderValidationIssue(entry)),
      routeSummary,
      costSummary,
      reservationSummaries: reservations.map((reservation) => `${this.campaignReservationLabel(reservation)} · ${reservation.status}`),
      timingSummary,
      riskSummary,
      objectiveEffect,
      dependencySummary: order.dependencies.length > 0
        ? `${order.dependencies.length} linked order dependenc${order.dependencies.length === 1 ? "y" : "ies"}`
        : "No linked order dependency",
      nextTransition,
      cancellationSummary: order.status === "draft"
        ? "Remove before commit to release every hold."
        : cancellation.canCancel
          ? `${cancellation.sunkCostSummary} Review is required before cancellation.`
          : cancellation.reason ?? "Cancellation is no longer available.",
      canRemove: order.status === "draft",
      canEdit: order.status === "draft" && order.kind !== "infrastructureRepair",
      canMoveEarlier: order.status === "draft" && draftIndex > 0,
      canMoveLater: order.status === "draft" && draftIndex >= 0 && draftIndex < draftOrders.length - 1,
      canCancel: cancellation.canCancel,
      mapHexKeys: order.targetHexKeys.slice()
    };
  }

  /** Renders the first-class shell from the Player projection and Player-owned compatibility records only. */
  private renderCommandShell(): void {
    if (!this.commandInterface) return;
    const view = this.campaignState.getCampaignMapView("Player");
    if (!view) {
      this.commandInterface.render({
        theaterTitle: "Campaign command",
        campaignPhase: "Awaiting theater",
        timeLabel: "No campaign loaded",
        commandStatus: "Planning",
        saveStatus: this.commandSaveStatus,
        unreadReports: 0,
        resources: [],
        objectives: [],
        forces: [],
        airPower: 0,
        navalPower: 0,
        intelligenceCapacity: "Unavailable",
        orders: [],
        advance: {
          mode: this.campaignAdvanceMode,
          enabled: false,
          pauseAfterEveryResolution: this.pauseAfterEveryCampaignResolution,
          summary: "Load a campaign to advance time.",
          alerts: [],
          timeline: []
        }
      });
      return;
    }

    const scenario = view.scenario;
    const playerEconomy = scenario.economies.find((economy) => economy.faction === "Player");
    const draftReservations = this.campaignState.getCampaignDraftReservations("Player");
    const displayStock = (value: number, key: string): string => {
      const held = draftReservations.resources[key] ?? 0;
      return held > 0 ? `${value.toLocaleString()} · ${held.toLocaleString()} held` : value.toLocaleString();
    };
    const playerOrders = this.campaignState.getCampaignOrders().filter((order) => order.faction === "Player");
    const objectiveStatusLabel = (status: "locked" | "active" | "completed" | "failed"): string => {
      if (status === "completed") return "Completed";
      if (status === "failed") return "Failed";
      if (status === "locked") return "Upcoming";
      return "In progress";
    };
    const objectivePresentations = this.campaignState.getCampaignObjectivePresentations();
    const objectives = objectivePresentations.map((objective) => {
      const authored = scenario.objectives.find((entry) => entry.key === objective.key);
      const offset = authored ? CoordinateSystem.axialToOffset(authored.hex.q, authored.hex.r) : null;
      const dependencies = authored?.requiresObjectives?.map((objectiveKey) => (
        scenario.objectives.find((entry) => entry.key === objectiveKey)?.label ?? objectiveKey
      )) ?? [];
      const defaultDefeatKeys = scenario.objectives
        .filter((entry) => entry.category === "primary" || entry.category === "failure")
        .map((entry) => entry.key);
      const defeatKeys = scenario.campaignArc?.defeatObjectiveKeys ?? defaultDefeatKeys;
      return {
        key: objective.key,
        label: objective.label,
        status: objectiveStatusLabel(objective.status),
        category: objective.category,
        progress: objective.progress,
        detail: objective.progressLabel,
        deadline: objective.deadlineSegment === null
          ? null
          : `Deadline ${this.campaignState.segmentToTimeDisplay(objective.deadlineSegment)}`,
        score: `${objective.scoreAwarded}/${objective.score} pts`,
        hexKey: offset ? CoordinateSystem.makeHexKey(offset.col, offset.row) : undefined,
        dependencies: dependencies.length > 0 ? `Requires ${dependencies.join(", ")}` : null,
        failureEffect: defeatKeys.includes(objective.key) ? "Failure ends the campaign" : null
      };
    });
    const forces = scenario.tiles.flatMap((tile) => {
      const palette = scenario.tilePalette[tile.tile];
      const controller = tile.factionControl ?? palette?.factionControl;
      if (controller !== "Player") return [];
      const offset = CoordinateSystem.axialToOffset(tile.hex.q, tile.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
      return (tile.forces ?? [])
        .filter((force) => force.count > 0)
        .map((force) => ({
          hexKey,
          label: force.label ?? this.formatCampaignLabel(force.unitType),
          count: force.count
        }));
    });
    const formations = this.campaignState.getCampaignFormationRoster("Player").map((formation) => {
      const locationHexKey = projectRuntimeHexKeyToCampaignOffset(formation.locationHexKey);
      const personnelPools = Object.values(formation.personnel);
      const fit = personnelPools.reduce((sum, pool) => sum + pool.fit, 0);
      const present = personnelPools.reduce(
        (sum, pool) => sum + pool.fit + pool.injured + pool.wounded + pool.severelyWounded,
        0
      );
      const killed = personnelPools.reduce((sum, pool) => sum + pool.killed, 0);
      const equipmentPools = Object.values(formation.equipment);
      const operational = equipmentPools.reduce((sum, pool) => sum + pool.operational, 0);
      const equipmentTotal = equipmentPools.reduce(
        (sum, pool) => sum + pool.operational + pool.damaged + pool.disabled + pool.destroyed,
        0
      );
      const statusLabel = formation.status.replace(/([a-z])([A-Z])/g, "$1 $2");
      return {
        id: formation.id,
        name: formation.name,
        typeLabel: this.formatCampaignLabel(formation.campaignUnitType),
        ownershipLabel: formation.ownership.charAt(0).toUpperCase() + formation.ownership.slice(1),
        locationHexKey,
        statusLabel: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
        readiness: `${Math.round(formation.readiness)}%`,
        cohesion: `${Math.round(formation.cohesion)}%`,
        fatigue: `${Math.round(formation.fatigue)}%`,
        personnel: `${fit.toLocaleString()} fit / ${present.toLocaleString()} present${killed > 0 ? ` · ${killed.toLocaleString()} lost` : ""}`,
        equipment: equipmentTotal > 0 ? `${operational.toLocaleString()} / ${equipmentTotal.toLocaleString()} operational` : "No vehicle pool",
        supply: `Ammo ${formation.supply.ammo} · Fuel ${formation.supply.fuel} · Rations ${formation.supply.rations} · Parts ${formation.supply.parts}`,
        experience: `${formation.experience.base + formation.experience.earned} XP`,
        honors: formation.honors.map((honor) => honor.name),
        battles: formation.experience.battles,
        currentOrderId: formation.currentOrderId,
        latestHistory: formation.battleHistory[formation.battleHistory.length - 1]?.summary ?? null
      };
    });
    const hexes = scenario.tiles.map((tile) => {
      const palette = scenario.tilePalette[tile.tile];
      const offset = CoordinateSystem.axialToOffset(tile.hex.q, tile.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
      const controller = tile.factionControl ?? palette?.factionControl ?? "Neutral";
      const controlLabel = controller === "Player" ? "Friendly control" : controller === "Bot" ? "Opposing control" : "Neutral control";
      const groups = tile.forces ?? palette?.forces ?? [];
      const infrastructure = tile.infrastructure;
      const roleLabel = this.formatCampaignLabel(palette?.role ?? "region");
      const infrastructureRole = infrastructure ? this.formatCampaignLabel(infrastructure.role) : "";
      const damageState = infrastructure ? this.formatCampaignLabel(infrastructure.damageState) : "";
      return {
        hexKey,
        roleLabel,
        controlLabel,
        forces: groups.filter((force) => force.count > 0).map((force) => `${force.label ?? this.formatCampaignLabel(force.unitType)} · ${force.count}`),
        infrastructure: infrastructure
          ? `${infrastructureRole} · ${damageState} · ${infrastructure.integrity}/${infrastructure.maxIntegrity} integrity · ${Math.round(infrastructure.effectiveness * 100)}% effective`
          : null,
        objectives: objectives.filter((objective) => objective.hexKey === hexKey).map((objective) => objective.label),
        fronts: scenario.fronts.filter((front) => front.hexKeys.includes(hexKey)).map((front) => front.label)
      };
    });
    const engagements = this.campaignState.getPendingEngagements();
    const runtime = this.campaignState.getRuntimeSnapshot();
    const postBattleAutosaveStatus = this.campaignState.getPostBattleAutosaveStatus();
    const afterActionReports = this.campaignState.getCampaignAfterActionReports().map((report) => {
      const locationHexKey = projectRuntimeHexKeyToCampaignOffset(report.battleHexKey) ?? report.battleHexKey;
      const charged = [
        [report.economyCharged.supplies, "supply"],
        [report.economyCharged.fuel, "fuel"],
        [report.economyCharged.ammo, "ammo"],
        [report.economyCharged.airPower, "air power"],
        [report.economyCharged.navalPower, "naval power"]
      ] as const;
      const resourcesSpent = charged
        .filter(([value]) => value > 0)
        .map(([value, label]) => `${value.toLocaleString()} ${label}`)
        .join(" · ") || "None";
      const resultLabel = report.strategicResult === "victory"
        ? "Victory"
        : report.strategicResult === "defeat"
          ? "Defeat"
          : report.strategicResult === "withdrawal"
            ? "Withdrawal"
            : "Stalemate";
      const operationalEffects = [
        `Control: ${report.controllerBefore} → ${report.controllerAfter}`,
        `Fronts: ${report.frontsBefore} → ${report.frontsAfter}`,
        report.infrastructureIntegrityBefore !== null || report.infrastructureIntegrityAfter !== null
          ? `${report.infrastructureRole ?? "Installation"}: ${report.infrastructureIntegrityBefore ?? 0} → ${report.infrastructureIntegrityAfter ?? 0} integrity · ${Math.round(report.infrastructureEffectivenessAfter * 100)}% effective`
          : null,
        report.campaignPhaseBefore !== report.campaignPhaseAfter
          ? `Campaign phase: ${report.campaignPhaseBefore} → ${report.campaignPhaseAfter}`
          : null
      ].filter((entry): entry is string => entry !== null);
      return {
        id: report.reportId,
        title: report.title,
        timeLabel: this.campaignState.segmentToTimeDisplay(report.segment),
        result: report.strategicResult,
        resultLabel,
        acknowledged: report.acknowledged,
        summary: report.summary,
        location: `Operational hex ${locationHexKey}`,
        locationHexKey,
        checkpointStatus: postBattleAutosaveStatus?.reportId === report.reportId
          ? postBattleAutosaveStatus.message
          : null,
        personnelLosses: report.friendlyFormations.reduce((total, formation) => total + formation.personnelLost, 0).toLocaleString(),
        opponentLosses: report.opponent.personnelLosses.toLocaleString(),
        resourcesSpent,
        scoreChange: report.campaignScoreAfter === report.campaignScoreBefore
          ? `${report.campaignScoreAfter} · no change`
          : `${report.campaignScoreBefore} → ${report.campaignScoreAfter}`,
        operationalEffects,
        tacticalObjectives: report.tacticalObjectives.map((objective) => (
          `${objective.label}: ${String(objective.state).replace(/([a-z])([A-Z])/g, "$1 $2")}`
        )),
        formations: report.friendlyFormations.map((formation) => ({
          id: formation.formationId,
          name: formation.name,
          personnel: `${formation.personnelAfter.toLocaleString()} / ${formation.personnelBefore.toLocaleString()} personnel · −${formation.personnelLost.toLocaleString()}`,
          condition: `Readiness ${Math.round(formation.readinessBefore)} → ${Math.round(formation.readinessAfter)} · Cohesion ${Math.round(formation.cohesionBefore)} → ${Math.round(formation.cohesionAfter)}`,
          disposition: `${formation.disposition.replace(/([a-z])([A-Z])/g, "$1 $2")} · ${formation.dispositionExplanation}`
        })),
        objectiveChanges: report.campaignObjectiveChanges.map((objective) => (
          `${objective.label}: ${objective.statusBefore} → ${objective.statusAfter} · ${Math.round(objective.progressAfter * 100)}%${objective.scoreAwarded > 0 ? ` · +${objective.scoreAwarded} points` : ""}`
        )),
        decisions: report.decisionsRequired.map((decision) => ({
          id: decision.id,
          severity: decision.severity,
          targetKind: decision.targetKind,
          targetId: decision.targetId,
          title: decision.title,
          detail: decision.detail
        }))
      };
    });
    const advanceRecords = this.campaignState.getCampaignAdvanceTimeline(24);
    const severityRank = { routine: 0, notable: 1, critical: 2, decisionRequired: 3 } as const;
    const timeline = advanceRecords.map((record) => {
      const alert = [...record.alerts].sort((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];
      return {
        id: record.id,
        timeLabel: this.campaignState.segmentToTimeDisplay(record.toSegment),
        title: alert?.title ?? "Segment resolved",
        detail: alert?.detail ?? `${record.eventCount} material campaign updates committed.`,
        severity: alert?.severity ?? "routine" as const,
        stopLabel: record.stopReason ? this.campaignAdvanceStopLabel(record.stopReason) : null,
        targetKind: alert?.targetKind ?? "time" as const,
        targetId: alert?.targetId ?? null,
        eventCount: record.eventCount
      };
    });
    const latestRecord = advanceRecords[0];
    const latestAlerts = latestRecord?.alerts
      .filter((alert) => alert.severity !== "routine" || latestRecord.stopped)
      .map((alert) => ({
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        targetKind: alert.targetKind,
        targetId: alert.targetId,
        timeLabel: this.campaignState.segmentToTimeDisplay(alert.segment),
        requiresStop: alert.requiresStop,
        acknowledged: this.campaignState.isCampaignAlertAcknowledged(alert.id)
      })) ?? [];
    const commandAlerts = advanceRecords.flatMap((record) => record.alerts
      .filter((alert) => alert.severity !== "routine" || alert.requiresStop)
      .map((alert) => ({
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        targetKind: alert.targetKind,
        targetId: alert.targetId,
        timeLabel: this.campaignState.segmentToTimeDisplay(alert.segment),
        requiresStop: alert.requiresStop,
        acknowledged: this.campaignState.isCampaignAlertAcknowledged(alert.id)
      }))).slice(0, 12);
    const actionableOrders = playerOrders.filter((order) => ["draft", "committed", "executing", "blocked"].includes(order.status));
    const priorities: CampaignCommandPriorityView[] = [];
    const urgentAlert = [...latestAlerts]
      .filter((alert) => alert.requiresStop || !alert.acknowledged)
      .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];
    const conflictedDraft = playerOrders.find((order) => order.status === "draft" && !order.validation.valid);
    const activePrimaryObjective = objectives.find((objective) => objective.category === "primary" && objective.status === "In progress");
    if (urgentAlert) {
      priorities.push({
        id: `alert:${urgentAlert.id}`,
        severity: urgentAlert.severity,
        label: urgentAlert.severity === "decisionRequired" ? "Decision required" : "Latest command report",
        title: urgentAlert.title,
        detail: urgentAlert.detail,
        actionLabel: "Review report",
        targetKind: urgentAlert.targetKind,
        targetId: urgentAlert.targetId
      });
    } else if (conflictedDraft) {
      priorities.push({
        id: `order:${conflictedDraft.id}`,
        severity: "decisionRequired",
        label: "Orders blocked",
        title: "Resolve the draft-order conflict",
        detail: conflictedDraft.validation.issues[0]?.message ?? "This draft must be corrected before command can commit the order set.",
        actionLabel: "Review order",
        targetKind: "order",
        targetId: conflictedDraft.id
      });
    } else if (activePrimaryObjective) {
      priorities.push({
        id: `objective:${activePrimaryObjective.key}`,
        severity: "notable",
        label: "Command priority",
        title: activePrimaryObjective.label,
        detail: activePrimaryObjective.detail ?? "Continue the active primary objective while preserving operational freedom.",
        actionLabel: "Review objective",
        targetKind: "objective",
        targetId: activePrimaryObjective.key
      });
    }
    const commandStatus: CampaignCommandShellView["commandStatus"] = runtime?.status === "victory" || runtime?.status === "defeat"
      ? "Campaign Ended"
      : this.campaignState.getActiveEngagementId()
        ? "Engagement"
        : engagements.length > 0 || actionableOrders.length > 0
          ? "Orders Ready"
          : "Planning";
    const gradeLabel = (grade: string): string => grade === "decisiveVictory"
      ? "Decisive victory"
      : grade === "costlyVictory"
        ? "Costly victory"
        : grade.charAt(0).toUpperCase() + grade.slice(1);
    const campaignScore = runtime?.campaignScore;
    const outcome = runtime?.campaignOutcome;
    const activeObjectives = objectives.filter((objective) => objective.status === "In progress");
    const completedObjectives = objectives.filter((objective) => objective.status === "Completed");
    const failedObjectives = objectives.filter((objective) => objective.status === "Failed");
    const deadlines = objectivePresentations
      .filter((objective) => objective.status === "active" && objective.deadlineSegment !== null)
      .map((objective) => objective.deadlineSegment as number);
    const nearestDeadline = deadlines.length > 0 ? Math.min(...deadlines) : null;
    const segmentsRemaining = nearestDeadline === null ? null : Math.max(0, nearestDeadline - view.currentSegment);
    const phaseDefinition = scenario.campaignArc?.phases.find((phase) => phase.key === runtime?.campaignPhaseKey);
    const defaultDefeatKeys = scenario.objectives
      .filter((objective) => objective.category === "primary" || objective.category === "failure")
      .map((objective) => objective.key);
    const defeatKeys = scenario.campaignArc?.defeatObjectiveKeys ?? defaultDefeatKeys;
    const lossConditions = defeatKeys.map((objectiveKey) => {
      const objective = objectives.find((entry) => entry.key === objectiveKey);
      return `Failing ${objective?.label ?? objectiveKey} ends the campaign.`;
    });
    if (scenario.campaignArc?.defeatWhenNoPlayerFormations) {
      lossConditions.push("Losing every Player formation ends the campaign.");
    }
    const frontViews = scenario.fronts.map((front) => {
      const frontHexes = new Set(front.hexKeys);
      const assessedContacts = view.enemyContacts.filter((contact) => frontHexes.has(contact.locationHexKey));
      const uncertainContacts = assessedContacts.filter((contact) => contact.state === "stale" || contact.state === "disputed").length;
      const friendlyFormations = formations.filter((formation) => formation.locationHexKey && frontHexes.has(formation.locationHexKey));
      const sectorObjectives = objectives.filter((objective) => objective.hexKey && frontHexes.has(objective.hexKey));
      const relatedObjectiveIds = new Set(sectorObjectives.map((objective) => objective.key));
      const relatedFormationIds = new Set(friendlyFormations.map((formation) => formation.id));
      const lastChange = timeline.find((entry) => (
        (entry.targetKind === "objective" && entry.targetId && relatedObjectiveIds.has(entry.targetId))
        || (entry.targetKind === "formation" && entry.targetId && relatedFormationIds.has(entry.targetId))
      ));
      return {
        key: front.key,
        label: front.label,
        hexKeys: front.hexKeys.slice(),
        initiativeLabel: front.initiative === "Player" ? "Friendly initiative" : "Opposing initiative",
        pressureLabel: assessedContacts.length === 0
          ? "No assessed hostile contact in this mapped sector."
          : `${assessedContacts.length} assessed contact${assessedContacts.length === 1 ? "" : "s"}${uncertainContacts > 0 ? ` · ${uncertainContacts} stale or disputed` : ""}.`,
        forcePosture: `${friendlyFormations.length} friendly formation${friendlyFormations.length === 1 ? "" : "s"} in sector`,
        objectivePosture: `${sectorObjectives.length} objective${sectorObjectives.length === 1 ? "" : "s"} in sector`,
        lastChange: lastChange ? `${lastChange.timeLabel} · ${lastChange.title}` : "No recent objective or formation change in this sector."
      };
    });
    const topPriority = priorities[0];
    const situation: CampaignCommandSituationView = {
      brief: outcome && !outcome.sandboxContinued
        ? {
          label: "Campaign record complete",
          title: outcome.result === "victory" ? "The operation is complete" : "The operation has been lost",
          detail: outcome.summary,
          tone: "complete"
        }
        : topPriority
          ? {
            label: "Commander's brief",
            title: phaseDefinition?.label ?? this.campaignState.getCampaignPhaseLabel(),
            detail: `${activeObjectives.length} active objective${activeObjectives.length === 1 ? "" : "s"} · ${segmentsRemaining === null ? "no active deadline" : `${segmentsRemaining * 3} hours to the nearest deadline`}. The command priority below requires attention.`,
            tone: topPriority.severity === "critical" || topPriority.severity === "decisionRequired" ? "critical" : "attention"
          }
          : {
            label: "Commander's brief",
            title: `${this.campaignState.getCampaignPhaseLabel()} operations continue`,
            detail: `${activeObjectives.length} active objective${activeObjectives.length === 1 ? "" : "s"}; no immediate decision is blocking time.`,
            tone: "steady"
          },
      outlook: {
        phaseDescription: phaseDefinition?.description ?? `${this.campaignState.getCampaignPhaseLabel()} is the active operational phase.`,
        timePressure: nearestDeadline === null
          ? "No active objective deadline"
          : `${segmentsRemaining === 0 ? "Deadline reached" : `${(segmentsRemaining ?? 0) * 3} hours remain`} · ${this.campaignState.segmentToTimeDisplay(nearestDeadline)}`,
        projectedGrade: campaignScore ? gradeLabel(campaignScore.projectedGrade) : "Not yet scored",
        score: campaignScore ? `${campaignScore.earned} / ${campaignScore.available} · ${campaignScore.percent}%` : "Not yet scored",
        objectiveStatus: `${activeObjectives.length} active · ${completedObjectives.length} complete · ${failedObjectives.length} failed`,
        lossConditions
      },
      alerts: commandAlerts,
      intelligenceUnread: view.unreadReportCount,
      afterActionUnread: afterActionReports.filter((report) => !report.acknowledged).length,
      recentChanges: timeline.slice(0, 5)
    };
    const commitPreview = this.campaignState.getCampaignOrderCommitPreview();
    const firstCommitBlocker = commitPreview.blockers[0];
    const firstCommitExplanation = firstCommitBlocker
      ? explainCampaignOrderValidationIssue({
        code: firstCommitBlocker.code,
        message: firstCommitBlocker.message,
        reservationId: firstCommitBlocker.reservationId
      })
      : null;
    const retainedFormations = formations.filter((formation) => !["Destroyed", "Disbanded", "Captured"].includes(formation.statusLabel));
    const serviceRecord = [...formations]
      .filter((formation) => formation.battles > 0 || formation.honors.length > 0)
      .sort((left, right) => right.honors.length - left.honors.length || right.battles - left.battles)
      .slice(0, 3)
      .map((formation) => `${formation.name} · ${formation.battles} battle${formation.battles === 1 ? "" : "s"}${formation.honors.length > 0 ? ` · ${formation.honors.join(", ")}` : ""}`);

    this.commandInterface.render({
      theaterTitle: scenario.title,
      campaignPhase: this.campaignState.getCampaignPhaseLabel(),
      timeLabel: this.campaignState.getCurrentTimeDisplay(),
      commandStatus,
      saveStatus: this.commandSaveStatus,
      unreadReports: view.unreadReportCount
        + afterActionReports.filter((report) => !report.acknowledged).length
        + commandAlerts.filter((alert) => !alert.acknowledged).length,
      situation,
      priorities,
      afterActionReports,
      resources: playerEconomy ? [
        { key: "manpower", label: "Personnel", value: displayStock(playerEconomy.manpower, "manpower") },
        { key: "supplies", label: "Supply", value: displayStock(playerEconomy.supplies, "supplies") },
        { key: "fuel", label: "Fuel", value: displayStock(playerEconomy.fuel, "fuel") },
        { key: "ammo", label: "Ammo", value: displayStock(playerEconomy.ammo, "ammo") }
      ] : [],
      objectives,
      objectiveScore: campaignScore ? {
        earned: campaignScore.earned,
        available: campaignScore.available,
        percent: campaignScore.percent,
        projectedGrade: gradeLabel(campaignScore.projectedGrade)
      } : undefined,
      outcome: outcome && !outcome.sandboxContinued ? {
        key: `${outcome.result}:${outcome.segment}`,
        result: outcome.result,
        grade: gradeLabel(outcome.grade),
        title: outcome.result === "victory" ? "Operation complete" : "Operation lost",
        summary: outcome.summary,
        score: `${outcome.scoreEarned} / ${outcome.scoreAvailable}`,
        completed: outcome.completedObjectiveKeys.length,
        failed: outcome.failedObjectiveKeys.length,
        canContinue: scenario.campaignArc?.allowContinueAfterOutcome === true,
        formationsPreserved: `${retainedFormations.length} / ${formations.length} retained`,
        serviceRecord,
        checkpointStatus: `Campaign record ${this.commandSaveStatus.toLowerCase()}. Save before returning to the main menu.`
      } : null,
      forces,
      fronts: frontViews,
      contacts: view.enemyContacts.map((contact) => ({
        id: contact.id,
        label: contact.label,
        locationHexKey: contact.locationHexKey,
        state: contact.state,
        confidenceBand: contact.confidenceBand,
        ageSegments: contact.ageSegments,
        uncertaintyRadius: contact.uncertaintyRadius,
        sourceLabels: contact.sourceLabels.slice(),
        strengthBand: contact.strengthBand
      })),
      formations,
      hexes,
      airPower: playerEconomy?.airPower ?? 0,
      navalPower: playerEconomy?.navalPower ?? 0,
      intelligenceCapacity: draftReservations.intelligenceCapacity > 0
        ? `${Math.max(0, view.capacity.available - draftReservations.intelligenceCapacity)}/${view.capacity.total} free · ${draftReservations.intelligenceCapacity} held`
        : `${view.capacity.available}/${view.capacity.total} available`,
      orders: playerOrders.map((order) => this.projectCommandOrder(order, playerOrders)),
      orderCommit: {
        busy: this.commandCommitBusy,
        draftCount: commitPreview.draftIds.length,
        validDraftCount: commitPreview.validDraftCount,
        blockerCount: commitPreview.blockers.length,
        firstBlocker: firstCommitBlocker?.message ?? null,
        firstCorrectiveAction: firstCommitExplanation?.correctiveAction ?? null,
        feedback: this.commandCommitFeedback.feedback,
        feedbackTone: this.commandCommitFeedback.feedbackTone
      },
      advance: {
        mode: this.campaignAdvanceMode,
        enabled: runtime?.status === "planning" && !this.saveLoadBusy && !this.commandCommitBusy,
        pauseAfterEveryResolution: this.pauseAfterEveryCampaignResolution,
        summary: `${commitPreview.draftIds.length > 0 ? `${commitPreview.draftIds.length} uncommitted draft${commitPreview.draftIds.length === 1 ? "" : "s"}; Advance will not execute them. ` : ""}${latestRecord
          ? `${this.campaignState.segmentToTimeDisplay(latestRecord.toSegment)} · ${latestRecord.stopReason ? `Stopped: ${this.campaignAdvanceStopLabel(latestRecord.stopReason)}` : "Automation continued"}`
          : "No campaign time resolved yet."}`,
        alerts: latestAlerts,
        timeline
      }
    });
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

    try {
      this.campaignState.setScenario(scenario);
    } catch (error) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: error instanceof Error ? error.message : "The edited campaign scenario is invalid.",
        action: "Choose a destination that preserves every authored objective and retry the move.",
        tone: "warning"
      });
      return;
    }

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

    const exportScenario = this.createFullPaletteExport(scenario);
    this.downloadCampaignJSON(exportScenario, `campaign_${scenario.key}_${Date.now()}.json`);

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
  }

  private formatCampaignLabel(value: string): string {
    return value
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : word)
      .join(" ");
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

    const exportScenario = this.createFullPaletteExport(scenario);
    this.downloadCampaignJSON(exportScenario, "campaign01.json");

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
  }

  private createFullPaletteExport(scenario: CampaignScenarioData): CampaignScenarioData {
    const source = this.sourceScenario ?? scenario;
    return {
      ...scenario,
      tilePalette: source.tilePalette,
      ...(source.mapExtents ? { mapExtents: source.mapExtents } : {})
    };
  }

  private downloadCampaignJSON(scenario: CampaignScenarioData, filename: string): void {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Builds explicit save metadata and minimal UI resume context for the current campaign workspace.
   * Persistence timestamps are created at this UI boundary so CampaignState/runtime remain deterministic.
   */
  private buildCampaignPersistenceRequest(timestamp: string) {
    const scenario = this.campaignState.getScenario();
    return {
      timestamp,
      label: scenario?.title ?? "Campaign",
      playTimeSeconds: 0,
      difficulty: null,
      commanderRosterLink: null,
      uiResumeContext: {
        workspace: "theater" as const,
        selectedEntityId: this.selectedHexKey,
        mapCenter: null,
        mapZoom: null
      }
    };
  }

  /** Disables both persistence actions while one atomic save/load request is active. */
  private setCampaignPersistenceBusy(busy: boolean): void {
    this.saveLoadBusy = busy;
    if (this.saveButton) this.saveButton.disabled = busy;
    if (this.loadButton) this.loadButton.disabled = busy;
    if (this.battleSavesButton) this.battleSavesButton.disabled = busy;
    this.renderCommandShell();
  }

  /** Saves the authoritative Campaign 2.0 envelope, including faction-local knowledge and active operations. */
  private async saveCampaignSession(): Promise<void> {
    if (this.saveLoadBusy) return;
    if (!this.campaignState.getScenario()) {
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail: "No campaign scenario is currently loaded.",
        action: "Load a campaign scenario before saving progress.",
        tone: "warning"
      });
      return;
    }
    this.commandSaveStatus = "Saving";
    this.setCampaignPersistenceBusy(true);
    this.setCampaignStatusMessage({
      title: "Saving campaign…",
      detail: "Validating campaign state and writing the verified primary slot.",
      action: "Wait for save confirmation before closing the game.",
      tone: "info"
    });
    try {
      await this.campaignState.savePrimaryCampaign(
        this.buildCampaignPersistenceRequest(new Date().toISOString())
      );
      this.commandSaveStatus = "Saved";
      this.setCampaignStatusMessage({
        title: "Campaign saved.",
        detail: "Campaign progress and faction-local intelligence were verified and committed to durable storage.",
        action: "Continue the campaign or use Load to restore this checkpoint.",
        tone: "success"
      });
    } catch (error) {
      this.commandSaveStatus = "Save Failed";
      const detail = error instanceof Error ? error.message : "The campaign save could not be written.";
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail,
        action: "Keep this campaign open and retry. Existing verified saves were not replaced.",
        tone: "warning"
      });
    } finally {
      this.setCampaignPersistenceBusy(false);
    }
  }

  /** Restores a verified Campaign 2.0 slot or explicitly accepted prior recovery candidate. */
  private async loadCampaignSession(): Promise<void> {
    if (this.saveLoadBusy) return;
    this.commandSaveStatus = "Loading";
    this.setCampaignPersistenceBusy(true);
    this.setCampaignStatusMessage({
      title: "Loading campaign…",
      detail: "Verifying save integrity, authored content, and runtime invariants.",
      action: "Wait for verification to finish.",
      tone: "info"
    });
    try {
      const result = await this.campaignState.loadPrimaryCampaign(
        this.buildCampaignPersistenceRequest(new Date().toISOString())
      );
      if (!result.ok) {
        if (result.recoveryCandidate) {
          const accepted = window.confirm(
            "The newest campaign save is damaged. A verified earlier save is available. Recover it now?"
          );
          if (accepted) {
            this.campaignState.restorePrimaryCampaignRecovery(result.recoveryCandidate);
            this.commandSaveStatus = "Saved";
            this.renderTimeDisplay();
            this.setCampaignStatusMessage({
              title: "Earlier campaign recovered.",
              detail: "A verified prior save was loaded. The damaged newest record remains quarantined for diagnosis.",
              action: "Review the restored time and situation, then Save to create a new current checkpoint.",
              tone: "warning"
            });
            return;
          }
        }
        const missing = result.error.code === "SLOT_NOT_FOUND";
        this.commandSaveStatus = "Unsaved";
        this.setCampaignStatusMessage({
          title: missing ? "No campaign save found." : "Campaign load failed.",
          detail: result.error.message,
          action: result.recoveryCandidate
            ? "Load again when you are ready to choose the verified recovery checkpoint."
            : "Keep the current campaign open and retry or inspect storage diagnostics.",
          tone: "warning"
        });
        return;
      }
      this.renderTimeDisplay();
      this.commandSaveStatus = "Saved";
      const activeBattle = this.campaignState.getActiveBattleSave();
      if (activeBattle) {
        this.setCampaignStatusMessage({
          title: "Tactical battle restored.",
          detail: "The campaign and its active engagement passed integrity and revision checks.",
          action: "Returning directly to the saved tactical decision point.",
          tone: "success"
        });
        document.dispatchEvent(new CustomEvent("campaign:battle:resume", {
          detail: { save: activeBattle }
        }));
        return;
      }
      this.setCampaignStatusMessage({
        title: result.source === "legacyMigration" ? "Campaign migrated and restored." : "Campaign restored.",
        detail: result.warning
          ?? "The operational picture and faction-local intelligence were verified and restored with campaign progress.",
        action: "Review new and stale reports before issuing the next order.",
        tone: result.warning ? "warning" : "success"
      });
    } catch (error) {
      this.commandSaveStatus = "Unsaved";
      const detail = error instanceof Error ? error.message : "The campaign save could not be loaded.";
      this.setCampaignStatusMessage({
        title: "Campaign load failed.",
        detail,
        action: "The current campaign was retained. Retry or inspect storage diagnostics.",
        tone: "warning"
      });
    } finally {
      this.setCampaignPersistenceBusy(false);
    }
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
