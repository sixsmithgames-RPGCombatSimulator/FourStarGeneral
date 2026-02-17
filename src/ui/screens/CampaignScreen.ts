import type { IScreenManager } from "../../contracts/IScreenManager";
import type { CampaignScenarioData } from "../../core/campaignTypes";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { hexDistance } from "../../core/Hex";
import { CampaignMapRenderer } from "../../rendering/CampaignMapRenderer";
import { MapViewport } from "../controls/MapViewport";
import { ensureCampaignState } from "../../state/CampaignState";

export class CampaignScreen {
  private readonly screenManager: IScreenManager;
  private readonly campaignState = ensureCampaignState();
  private readonly renderer: CampaignMapRenderer;
  private element: HTMLElement;
  private economyContainer: HTMLElement | null = null;
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

  constructor(screenManager: IScreenManager, renderer: CampaignMapRenderer) {
    this.screenManager = screenManager;
    this.renderer = renderer;
    const el = document.getElementById("campaignScreen");
    if (!el) {
      throw new Error("Campaign screen element (#campaignScreen) not found in DOM");
    }
    this.element = el;
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

  /** Opens a lightweight modal for scheduling a redeploy from origin to dest with unit picking and cost preview. */
  private openRedeployModal(originOffsetKey: string, destOffsetKey: string): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    if (!layer || !dialog || !title || !body || !close) return;

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;
    const parse = (key: string) => CoordinateSystem.parseHexKey(key)!;
    const a = parse(originOffsetKey);
    const b = parse(destOffsetKey);
    const aAx = CoordinateSystem.offsetToAxial(a.col, a.row);
    const bAx = CoordinateSystem.offsetToAxial(b.col, b.row);
    const distance = hexDistance(aAx, bAx);

    // Gather origin and destination tile info
    const originTile = scenario.tiles.find((t) => t.hex.q === aAx.q && t.hex.r === aAx.r);
    const destTile = scenario.tiles.find((t) => t.hex.q === bAx.q && t.hex.r === bAx.r);
    const originForces = (originTile?.forces ?? []).map((g) => ({ unitType: g.unitType, count: g.count }));
    if (!originTile || originForces.length === 0) return;

    const originRole = originTile ? (scenario.tilePalette[originTile.tile]?.role ?? null) : null;
    const destRole = destTile ? (scenario.tilePalette[destTile.tile]?.role ?? null) : null;

    // Get player economy for transport capacity display
    const playerEcon = scenario.economies.find((e) => e.faction === "Player");
    const transportCap = playerEcon?.transportCapacity;

    title.textContent = "Schedule Redeployment";
    const rows = originForces
      .map(
        (g, idx) => `
        <tr>
          <td>${g.unitType}</td>
          <td>${g.count}</td>
          <td><input type=\"number\" min=\"0\" max=\"${g.count}\" value=\"${g.count}\" data-move-index=\"${idx}\" style=\"width:72px\" /></td>
        </tr>`
      )
      .join("");

    body.innerHTML = `
      <form id=\"campaignRedeployForm\" class=\"campaign-redeploy-form\">
        <div class=\"redeploy-summary\">From ${originOffsetKey} → ${destOffsetKey} &middot; Distance ${distance} hex(es)</div>
        <div style=\"margin:0.5rem 0\">
          <label for=\"transportModeSelect\" style=\"font-weight:bold\">Transport Mode:</label>
          <select id=\"transportModeSelect\" style=\"width:100%;margin-top:0.25rem;padding:0.25rem\">
            <option value=\"foot\">On Foot (1 hex/segment, infantry only)</option>
            <option value=\"truck\">Truck Transport (3 hex/segment, requires trucks)</option>
            <option value=\"armor\">Armor/Motorized (2 hex/segment, self-propelled)</option>
            <option value=\"naval\">Naval Transport (3 hex/segment, ships & naval bases)</option>
            <option value=\"warship\">Warship (3 hex/segment, combat vessels)</option>
            <option value=\"fighter\">Fighter Aircraft (75 hex/segment, requires airbases)</option>
            <option value=\"bomber\">Bomber Aircraft (75 hex/segment, requires airbases)</option>
          </select>
        </div>
        <table class=\"redeploy-table\">
          <thead><tr><th>Unit</th><th>Avail</th><th>Move</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class=\"redeploy-cost\" id=\"campaignRedeployCost\" style=\"margin-top:0.5rem;font-size:0.9rem\"></div>
        <div class=\"button-row\" style=\"margin-top:0.5rem\">
          <button type=\"submit\" class=\"primary-button\">Confirm</button>
          <button type=\"button\" id=\"campaignRedeployCancel\" class=\"secondary-button\">Cancel</button>
        </div>
      </form>
    `;

    const form = body.querySelector<HTMLFormElement>("#campaignRedeployForm");
    const costEl = body.querySelector<HTMLElement>("#campaignRedeployCost");
    const cancelBtn = body.querySelector<HTMLButtonElement>("#campaignRedeployCancel");
    const modeSelect = body.querySelector<HTMLSelectElement>("#transportModeSelect");

    const calcAndRenderCost = (): void => {
      if (!modeSelect || !costEl) return;

      const selectedMode = modeSelect.value;
      const inputs = Array.from(body.querySelectorAll<HTMLInputElement>("[data-move-index]"));
      const picks = inputs.map((inp) => Number(inp.value) || 0);
      const totalUnits = picks.reduce((s, v) => s + Math.max(0, v), 0);

      if (totalUnits === 0) {
        costEl.innerHTML = '<span style=\"color:#999\">Select units to see cost estimate</span>';
        return;
      }

      // Get transport mode definition (inline simplified version)
      const modes = {
        foot: { speed: 1, fuel: 0, supplies: 1, risk: 0, capacity: null },
        truck: { speed: 3, fuel: 3, supplies: 1, risk: 0, capacity: { type: 'trucks', perVehicle: 100 } },
        armor: { speed: 2, fuel: 25, supplies: 5, risk: 0.01, capacity: null },
        naval: { speed: 3, fuel: 1750, supplies: 70, risk: 0.05, capacity: { type: 'transportShips', perVehicle: 500 } },
        warship: { speed: 3, fuel: 2250, supplies: 1500, risk: 0.02, capacity: null },
        fighter: { speed: 75, fuel: 300, supplies: 1, risk: 0.001, capacity: { type: 'transportPlanes', perVehicle: 1 } },
        bomber: { speed: 75, fuel: 750, supplies: 5, risk: 0.002, capacity: { type: 'transportPlanes', perVehicle: 1 } }
      };
      const mode = modes[selectedMode as keyof typeof modes] ?? modes.foot;

      const timeSegments = Math.max(1, Math.ceil(distance / mode.speed));
      const fuel = Math.ceil(totalUnits * distance * mode.fuel);
      const supplies = Math.ceil(totalUnits * distance * mode.supplies);
      const manpower = Math.floor(totalUnits * distance * mode.risk);

      let capacityInfo = '';
      if (mode.capacity && transportCap) {
        const needed = Math.ceil(totalUnits / mode.capacity.perVehicle);
        const capType = mode.capacity.type as 'trucks' | 'transportShips' | 'transportPlanes';
        const available = (transportCap[capType] ?? 0) - (transportCap[`${capType}InTransit` as keyof typeof transportCap] ?? 0);
        const capColor = available >= needed ? '#0a0' : '#c00';
        capacityInfo = `<br/>Requires: ${needed} ${capType} (<span style=\"color:${capColor}\">${available} available</span>)`;
      }

      const warnings: string[] = [];
      if ((selectedMode === 'naval' || selectedMode === 'warship') && originRole !== 'navalBase' && destRole !== 'navalBase') {
        warnings.push('⚠ Naval transport requires origin or destination to be a naval base');
      }
      if ((selectedMode === 'fighter' || selectedMode === 'bomber') && (originRole !== 'airbase' || destRole !== 'airbase')) {
        warnings.push('⚠ Air transport requires both origin and destination to be airbases');
      }

      const warningHtml = warnings.length > 0 ? `<div style=\"color:#f80;margin-top:0.25rem\">${warnings.join('<br/>')}</div>` : '';

      const currentSegment = this.campaignState.getCurrentSegment();
      const etaSegment = currentSegment + timeSegments;
      const etaDisplay = this.campaignState.segmentToTimeDisplay(etaSegment);

      costEl.innerHTML = `
        <strong>ETA: ${etaDisplay} (in ${timeSegments} segment${timeSegments !== 1 ? 's' : ''})</strong>
        <br/>Fuel: ${fuel} · Supplies: ${supplies}${manpower > 0 ? ` · Est. losses: ${manpower}` : ''}${capacityInfo}${warningHtml}
      `;
    };

    calcAndRenderCost();
    body.querySelectorAll<HTMLInputElement>("[data-move-index]").forEach((inp) => inp.addEventListener("input", () => calcAndRenderCost()));
    modeSelect?.addEventListener("change", () => calcAndRenderCost());

    if (!form || !cancelBtn || !modeSelect) return;
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const inputs = Array.from(body.querySelectorAll<HTMLInputElement>("[data-move-index]"));
      const selections = inputs.map((inp, i) => ({ unitType: originForces[i].unitType, count: Math.max(0, Math.min(originForces[i].count, Number(inp.value) || 0)) }));
      const transportMode = modeSelect.value;
      const result = this.campaignState.scheduleRedeploy(originOffsetKey, destOffsetKey, selections, transportMode);
      if (!result.ok) {
        window.alert(result.reason ?? "Unable to schedule");
        return;
      }
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
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

  initialize(): void {
    // Capture sidebar hooks if present. These may be null in minimal DOMs (e.g. tests)
    this.economyContainer = this.element.querySelector<HTMLElement>("#campaignEconomySummary");
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
      this.saveButton.addEventListener("click", () => this.saveCampaignToFile());
    }
    if (this.loadButton) {
      this.loadButton.addEventListener("click", () => this.loadCampaignFromFile());
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
        const scenario = this.campaignState.getScenario();
        if (!scenario) return;
        const existing = this.campaignState.getPendingEngagements();
        const id = `eng_${Date.now()}`;
        // Prefer front-driven engagement if a front is selected
        if (this.selectedFrontKey) {
          const front = scenario.fronts.find((f) => f.key === this.selectedFrontKey);
          if (!front) return;
          existing.push({
            id,
            frontKey: front.key,
            objectiveKey: null,
            attacker: front.initiative,
            defender: front.initiative === "Player" ? "Bot" : "Player",
            hexKeys: front.hexKeys.slice(),
            tags: ["front"]
          });
        } else if (this.selectedHexKey && this.campaignState.isAdjacentToEnemy(this.selectedHexKey)) {
          // Hex-proximity engagement when player forces are near enemy forces
          existing.push({
            id,
            frontKey: null,
            objectiveKey: null,
            attacker: "Player",
            defender: "Bot",
            hexKeys: [this.selectedHexKey],
            tags: ["proximity"]
          });
        } else {
          return;
        }
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
      if (reason === "scenarioLoaded") {
        const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
        const canvas = this.element.querySelector<HTMLDivElement>("#campaignMapCanvas");
        const scenario = this.campaignState.getScenario();
        if (svg && canvas && scenario) {
          this.renderer.render(svg, canvas, scenario);
          this.renderer.setTerrainOverlayVisible(this.editMode);
          // Initialize zoom/pan controls once the SVG is available
          if (!this.viewport) {
            try {
              this.viewport = new MapViewport("#campaignHexMap");
              this.bindCampaignControls();
            } catch {
              // Defensive: viewport optional in tests
            }
          }
        }
      }
      // On day advancement, update the day counter and economy display
      if (reason === "dayAdvanced") {
        this.renderTimeDisplay();
      }
      this.renderEconomy();
      this.renderSelection();
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
    this.renderer.render(svg, canvas, scenario);
    this.renderer.setTerrainOverlayVisible(this.editMode);
    this.bindTerrainEditDragHandlers(svg);
    // Handle hex clicks by recording selection and detecting if the hex is part of a front
    this.renderer.onHexClick((hexKey) => {
      const scenario = this.campaignState.getScenario();
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
    });

    // Initial sidebar render
    this.renderTimeDisplay();
    this.renderEconomy();
    this.renderSelection();
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
    const scenario = this.campaignState.getScenario();
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
              <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.8em;">
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
                <div style="text-align: center; padding: 0.35rem; background: rgba(60, 120, 200, 0.15); border-radius: 5px;">
                  <div style="font-size: 1.2em;">🔍</div>
                  <div style="color: rgba(180, 180, 180, 0.8); margin-top: 0.15rem;">Intel</div>
                  <div style="font-weight: 600; color: rgba(220, 240, 255, 0.95); margin-top: 0.1rem;">${e.intelCoverage}</div>
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
    this.economyContainer.innerHTML = rows;
  }

  /** Renders current selection details and engagement queue status. */
  private renderSelection(): void {
    if (!this.selectionContainer) {
      return;
    }
    const items: string[] = [];
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
      const canProximity = this.selectedHexKey ? this.campaignState.isAdjacentToEnemy(this.selectedHexKey) : false;
      const canEngage = Boolean(this.selectedFrontKey) || canProximity;
      this.queueEngagementButton.disabled = !canEngage;
    }

    // Update edit mode UI if active
    if (this.editMode) {
      this.updateEditPanel();
    }
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
    let tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

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
    let tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    if (!tile) {
      // Need a base before adding units
      alert("Please create a base first before adding units");
      return;
    }

    if (!tile.forces) {
      tile.forces = [];
    }

    tile.forces.push({ unitType, count, label });

    this.campaignState.setScenario(scenario);
    this.renderSelection();

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
      alert("Invalid coordinates");
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
      alert("No base at current location to move");
      return;
    }

    // Check if destination already has a base
    const destTile = scenario.tiles.find((t) => t.hex.q === newAxial.q && t.hex.r === newAxial.r);
    if (destTile) {
      alert("Destination already has a base");
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

    alert(`Base moved to (${newCol}, ${newRow})`);
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
      alert(`No economy found for faction: ${faction}`);
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

    alert(`Resources updated for ${faction}`);
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
      alert("No scenario loaded");
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

      const msg = warnings.length > 0
        ? `Campaign JSON exported with full palette!\n\n⚠ ${warnings.length} validation warning(s) - check console.`
        : "Campaign JSON exported with full palette!";
      alert(msg);
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
      alert("Campaign JSON exported (without palette restoration)");
    });
  }

  private saveCampaignToFile(): void {
    const scenario = this.campaignState.getScenario();
    if (!scenario) {
      alert("No scenario loaded");
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

      const msg = warnings.length > 0
        ? `Campaign saved! Replace src/data/campaign01.json with the downloaded file.\n\n⚠ ${warnings.length} validation warning(s) - check console.`
        : "Campaign saved! Replace src/data/campaign01.json with the downloaded file.";
      alert(msg);
    }).catch((err) => {
      console.error("Failed to load original campaign data:", err);
      alert("Error saving campaign: " + err.message);
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
            alert("Invalid campaign scenario file");
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
          const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
          const canvas = this.element.querySelector<HTMLDivElement>("#campaignMapCanvas");
          if (svg && canvas) {
            this.renderer.render(svg, canvas, scenario);
          }

          const msg = warnings.length > 0
            ? `Campaign loaded successfully!\n\n⚠ ${warnings.length} validation warning(s) - check console.`
            : "Campaign loaded successfully!";
          alert(msg);
        } catch (err) {
          console.error("Failed to parse campaign file:", err);
          alert("Error loading campaign: Invalid JSON file");
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }
}
