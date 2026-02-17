import { ensureDeploymentState, type DeploymentPoolEntry, type ReserveUnitSnapshot } from "../../state/DeploymentState";

/**
 * Layout guardrails:
 * - The host element `#deploymentPanel` must have `height: 100%` with a viewport-bounded `max-height`
 *   so the unit roster never escapes the visible area.
 * - `.deployment-panel-body` should define its rows with `minmax(0, 1fr)` and hide overflow to allow
 *   the zone and unit lists (`overflow-y: auto`) to scroll independently inside the panel.
 * - When adjusting markup, preserve the scrolling containers around `#deploymentZoneList` and
 *   `#deploymentUnitList`; removing them will reintroduce clipped rosters for large allocations.
 */

export interface SelectedHexContext {
  terrainName: string;
  zoneKey: string | null;
  zoneLabel: string | null;
}

interface DeploymentZoneMeta {
  /** Unique identifier shared with engine snapshot wiring. */
  key: string;
  /** Human-readable label derived from scenario data or a safe fallback. */
  name: string;
  /** Supplemental description to aid zone selection. */
  description: string;
  /** Remaining hex capacity reported by DeploymentState. */
  remainingCapacity: number;
  /** Total hex capacity registered for the zone. */
  totalCapacity: number;
}

/**
 * Manages the deployment panel UI where players place units on the battlefield.
 * Handles deployment zones, unit selection, and placement validation without touching engine state.
 */
export type DeploymentPanelEventType = "deploy" | "recall" | "highlightZone" | "assignBaseCamp" | "callReserve";

export interface DeploymentPanelEventMap {
  readonly type: DeploymentPanelEventType;
  readonly payload?: Record<string, unknown>;
}

type DeploymentPanelListener = (event: DeploymentPanelEventMap) => void;

/**
 * Manages the deployment panel UI where players place units on the battlefield.
 * Handles deployment zones, unit selection, and placement validation without touching engine state.
 */
export class DeploymentPanel {
  private readonly panel: HTMLElement;
  private readonly statusElement: HTMLElement;
  private readonly zoneList: HTMLElement;
  private readonly unitList: HTMLElement;
  private readonly reserveList: HTMLElement;
  private readonly zoneSummary: HTMLElement;

  private readonly listeners = new Set<DeploymentPanelListener>();

  private readonly zoneMetaMap = new Map<string, DeploymentZoneMeta>();
  private readonly zoneHexLookup = new Map<string, Set<string>>();
  private readonly hexZoneIndex = new Map<string, string>();

  private selectedHexKey: string | null = null;
  private selectedTerrainLabel: string | null = null;
  private selectedZoneKey: string | null = null;
  private selectedZoneLabel: string | null = null;
  /** Tracks whether deployment interactions are available. BattleScreen disables them when combat begins. */
  private interactionsLocked = false;
  /** Tracks whether a base camp has been confirmed so the unit roster can unlock in staged fashion. */
  private baseCampAssigned = false;
  /** Records the deployment zone tied to the assigned base camp so subsequent UI updates can stay scoped. */
  private lockedZoneKey: string | null = null;
  /** Tracks a unit the player queued before choosing a destination hex so the next map click can deploy it. */
  private queuedUnitKey: string | null = null;
  /** Enables reserve call-ups once the battle phase begins so the panel exposes reinforcements. */
  private reserveCallupsEnabled = false;

  constructor() {
    this.panel = this.requireElement("#deploymentPanel");
    this.statusElement = this.requireElement("#deploymentStatus");
    this.zoneList = this.requireElement("#deploymentZoneList");
    this.unitList = this.requireElement("#deploymentUnitList");
    this.reserveList = this.requireElement("#deploymentReserveList");
    this.zoneSummary = this.requireElement("#deploymentZoneSummary");

    // Surface staged guidance defaults so the battle screen can progressively reveal deployment affordances.
    this.panel.setAttribute("data-basecamp-ready", "false");
    this.panel.removeAttribute("data-zone-locked");

    this.refreshZoneMetadata();
    this.panel.addEventListener("click", (event) => this.handlePanelClick(event));
  }

  /** Builds the reserve list markup so commanders can deploy reinforcements directly from the panel once battle begins. */
  private renderReserveList(): void {
    const deploymentState = ensureDeploymentState();
    const reserves = deploymentState.getReserves();
    if (!this.reserveCallupsEnabled || reserves.length === 0) {
      this.reserveList.innerHTML = `
        <li class="deployment-guidance" data-deployment-disabled="true">
          ${this.reserveCallupsEnabled ? "All reserves deployed." : "Reserves unlock once battle begins."}
        </li>
      `;
      return;
    }

    const markup = reserves.map((entry) => this.renderReserveListItem(entry)).join("");
    this.reserveList.innerHTML = markup;
  }

  /** Composes a single reserve row with clear remaining counts and accessibility hints. */
  private renderReserveListItem(entry: ReserveUnitSnapshot): string {
    const deploymentState = ensureDeploymentState();
    const spritePath = entry.sprite ?? deploymentState.getSpritePath(entry.unitKey);
    const spriteMarkup = spritePath
      ? `<img class="deployment-unit-thumb" src="${this.escapeHtml(spritePath)}" alt="${this.escapeHtml(entry.label)} emblem" />`
      : `<span class="deployment-unit-fallback" aria-hidden="true">${this.escapeHtml(this.getInitials(entry.label))}</span>`;

    const ariaLabel = `${entry.label}. ${entry.remaining} remaining. ${entry.status === "ready" ? "Activate to deploy reserve." : "Reserve exhausted."}`;
    const canCallReserve = this.reserveCallupsEnabled && entry.remaining > 0 && entry.status === "ready";
    const disabledAttributes = canCallReserve
      ? ""
      : " data-deployment-disabled=\"true\"";
    const deployButton = canCallReserve
      ? `<button type="button" class="reserve-deploy" aria-label="Deploy ${this.escapeHtml(entry.label)}">Deploy</button>`
      : `<button type="button" class="reserve-deploy" aria-label="Deploy ${this.escapeHtml(entry.label)}" disabled>Deploy</button>`;

    return `
      <li class="deployment-unit reserve-entry" data-unit-key="${this.escapeHtml(entry.unitKey)}"${disabledAttributes} tabindex="0" aria-label="${this.escapeHtml(ariaLabel)}">
        <span class="deployment-unit-visual" aria-hidden="true">${spriteMarkup}</span>
        <div class="deployment-unit-copy">
          <span class="deployment-unit-label">${this.escapeHtml(entry.label)}</span>
          <span class="deployment-unit-meta" aria-hidden="true">
            <span class="deployment-unit-remaining">${entry.remaining}</span> in reserve · status ${entry.status}
          </span>
        </div>
        <div class="reserve-actions">${deployButton}</div>
      </li>
    `;
  }

  /** Wires reserve clicks (and keyboard activation) to emit call-up events once battle phase allows them. */
  private bindReserveEvents(): void {
    this.reserveList.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const deployBtn = target.closest<HTMLButtonElement>(".reserve-deploy");
      if (deployBtn) {
        const item = deployBtn.closest<HTMLElement>(".reserve-entry[data-unit-key]");
        if (!item || item.hasAttribute("data-deployment-disabled")) {
          return;
        }
        const unitKey = item.getAttribute("data-unit-key");
        if (!unitKey) {
          return;
        }
        this.emit("callReserve", { unitKey });
        return;
      }
      const item = target.closest<HTMLElement>(".reserve-entry[data-unit-key]");
      if (!item || item.hasAttribute("data-deployment-disabled")) {
        return;
      }
      const unitKey = item.getAttribute("data-unit-key");
      if (!unitKey) {
        return;
      }
      this.emit("callReserve", { unitKey });
    });

    this.reserveList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const target = event.target as HTMLElement;
      const item = target.closest<HTMLElement>(".reserve-entry[data-unit-key]");
      if (!item || item.hasAttribute("data-deployment-disabled")) {
        return;
      }
      const unitKey = item.getAttribute("data-unit-key");
      if (!unitKey) {
        return;
      }
      event.preventDefault();
      this.emit("callReserve", { unitKey });
    });
  }

  /**
   * Surfaces the root panel element so screen orchestrators can coordinate scrolling or focus cues.
   */
  getElement(): HTMLElement {
    return this.panel;
  }

  initialize(): void {
    this.renderDeploymentStatus();
    this.renderDeploymentZones();
    this.renderDeploymentUnits();
    this.renderReserveList();
    this.bindReserveEvents();
  }

  update(): void {
    this.refreshZoneMetadata();
    this.renderDeploymentStatus();
    this.renderDeploymentUnits();
    this.renderDeploymentZones();
    this.renderReserveList();
    this.syncZoneHighlight();
  }

  /**
   * Recomputes the deployment status banner, embedding a secondary line with the currently
   * highlighted hex details so the user can confirm terrain and zone context at a glance.
   */
  renderDeploymentStatus(): void {
    const deploymentState = ensureDeploymentState();
    const isBattlePhaseLayout = this.panel.getAttribute("data-phase") === "battle";

    if (isBattlePhaseLayout) {
      const reserves = deploymentState.getReserves();
      const readyCount = reserves.reduce((sum, entry) => (entry.status === "ready" ? sum + entry.remaining : sum), 0);
      this.statusElement.textContent = readyCount > 0
        ? `Reserves ready: ${readyCount} standing by. Select a valid base-camp hex to reinforce.`
        : "All reserves committed. No reinforcements remain.";
      return;
    }

    const deployed = deploymentState.getTotalDeployed();
    const total = deploymentState.pool.reduce((sum, entry) => sum + deploymentState.getUnitCount(entry.key), 0);
    const remaining = Math.max(0, total - deployed);

    if (!this.baseCampAssigned) {
      this.statusElement.textContent = "Step 1: Assign a base camp to unlock deployment planning.";
      return;
    }

    if (this.queuedUnitKey && !this.selectedHexKey) {
      const queuedLabel =
        deploymentState.pool.find((entry) => entry.key === this.queuedUnitKey)?.label ?? "Queued unit";
      this.statusElement.textContent = `${queuedLabel} queued. Select a deployment hex to place it.`;
      return;
    }

    const selectionMessage = this.composeSelectionMessage();
    const summary = selectionMessage ? `${selectionMessage}` : "Select a deployment hex to review zone capacity.";

    const baseCampKey = deploymentState.getBaseCampKey();
    const baseCampCopy = baseCampKey
      ? `Base camp anchored at ${baseCampKey}.`
      : "Base camp assigned; awaiting placement updates.";

    const readinessCopy = remaining === 0
      ? "All requisitioned units deployed."
      : `${remaining} unit${remaining === 1 ? "" : "s"} remaining in reserve.`;

    this.statusElement.textContent = `Deployment ready: ${deployed}/${total} units placed. ${readinessCopy} ${baseCampCopy} ${summary}`;
  }

  /**
   * Renders the deployment zone list using mirrored metadata so selection highlights can be applied
   * consistently when the user hovers zones or picks a hex on the map.
   */
  renderDeploymentZones(): void {
    if (this.lockedZoneKey && this.baseCampAssigned) {
      const lockedZone = this.zoneMetaMap.get(this.lockedZoneKey);
      if (lockedZone) {
        const usedSlots = lockedZone.totalCapacity - lockedZone.remainingCapacity;
        this.zoneList.innerHTML = `
          <li class="deployment-zone is-locked" data-zone-key="${this.escapeHtml(lockedZone.key)}" tabindex="-1">
            <span class="deployment-zone-name">${this.escapeHtml(lockedZone.name)}</span>
            <span class="deployment-zone-capacity" aria-hidden="true">${usedSlots}/${lockedZone.totalCapacity}</span>
            <span class="deployment-zone-description">Deployment zone locked after base camp assignment.</span>
          </li>
        `;
        this.zoneSummary.textContent = this.composeZoneSummaryCopy();
      } else {
        this.zoneList.innerHTML = `
          <li class="deployment-zone is-empty" aria-live="polite">
            Deployment zone lock pending. Scenario data may still be loading.
          </li>
        `;
        this.zoneSummary.textContent = "Deployment zone lock pending.";
      }
      this.panel.setAttribute("data-zone-locked", "true");
      return;
    }

    this.panel.removeAttribute("data-zone-locked");

    if (this.zoneMetaMap.size === 0) {
      this.zoneList.innerHTML = `
        <li class="deployment-zone is-empty" aria-live="polite">
          Deployment zones unavailable. Scenario data may still be loading.
        </li>
      `;
      this.zoneSummary.removeAttribute("data-zone-active");
      this.zoneSummary.textContent = "No deployment zone selected.";
      return;
    }

    const markup = Array.from(this.zoneMetaMap.values(), (zone) => this.renderZoneListItem(zone)).join("");
    this.zoneList.innerHTML = markup;
    if (!this.baseCampAssigned) {
      this.zoneSummary.textContent = "Step 2: Select a deployment zone to guide base camp placement.";
    } else if (this.selectedZoneKey) {
      this.zoneSummary.textContent = this.composeZoneSummaryCopy();
      this.zoneSummary.setAttribute("data-zone-active", this.selectedZoneLabel ?? "");
    } else {
      this.zoneSummary.removeAttribute("data-zone-active");
      this.zoneSummary.textContent = "Base camp locked in. Select any deployment hex to begin staging units.";
    }
    this.syncZoneHighlight();
  }

  /**
   * Updates the available unit roster to reflect the latest remaining counts reported by
   * `DeploymentState`, keeping the panel synchronized with deployment interactions.
   */
  renderDeploymentUnits(): void {
    const deploymentState = ensureDeploymentState();
    const locked = this.interactionsLocked;
    if (!this.baseCampAssigned) {
      this.unitList.innerHTML = `
        <li class="deployment-guidance" data-deployment-disabled="true" tabindex="-1">
          Assign a base camp to reveal available units and queue deployments.
        </li>
      `;
      this.queuedUnitKey = null;
      return;
    }
    const markup = deploymentState.pool
      .map((entry) => this.renderUnitListItem(entry, deploymentState.getUnitCount(entry.key), locked))
      .join("");
    this.unitList.innerHTML = markup;
    this.syncQueuedUnitHighlight();
  }

  /**
   * Disables deployment interactions when the battle phase begins, mirroring both visuals and ARIA cues.
   * The panel remains readable, but all actionable elements are marked inert for screen readers and pointer input.
   */
  lockInteractions(): void {
    if (this.interactionsLocked) {
      return;
    }
    this.interactionsLocked = true;
    this.panel.setAttribute("data-deployment-locked", "true");
    this.panel.setAttribute("aria-disabled", "true");
    this.renderDeploymentUnits();
    this.renderReserveList();
  }

  /**
   * Re-enables deployment interactions when returning to the planning phase (primarily for testing tools).
   */
  unlockInteractions(): void {
    if (!this.interactionsLocked) {
      return;
    }
    this.interactionsLocked = false;
    this.panel.removeAttribute("data-deployment-locked");
    this.panel.removeAttribute("aria-disabled");
    this.renderDeploymentUnits();
    this.renderReserveList();
  }

  /**
   * Receives the currently selected map hex and updates deployment UI affordances.
   * @param key - Hex key or null when deselecting
   * @param context - Supplemental details describing the selected location
   */
  setSelectedHex(key: string | null, context?: SelectedHexContext): void {
    this.selectedHexKey = key;
    if (key && this.lockedZoneKey) {
      const owningZone = this.hexZoneIndex.get(key);
      if (owningZone && owningZone !== this.lockedZoneKey) {
        return;
      }
    }
    if (key && context) {
      this.selectedTerrainLabel = context.terrainName;
      if (!this.lockedZoneKey || context.zoneKey === this.lockedZoneKey) {
        this.selectedZoneKey = context.zoneKey;
        this.selectedZoneLabel = context.zoneLabel;
      }
    } else {
      this.selectedTerrainLabel = null;
      this.selectedZoneKey = null;
      this.selectedZoneLabel = null;
    }

    this.renderDeploymentStatus();
    this.syncZoneHighlight();
    this.deployQueuedUnitIfReady(key);
  }

  /**
   * Identifies the deployment zone metadata that owns the provided hex.
   */
  resolveZoneForHex(hexKey: string): DeploymentZoneMeta | null {
    const zoneKey = this.hexZoneIndex.get(hexKey);
    if (!zoneKey) {
      return null;
    }
    return this.zoneMetaMap.get(zoneKey) ?? null;
  }

  /**
   * Returns the set of hex keys allocated to the provided zone for renderer highlighting.
   */
  getZoneHexes(zoneKey: string | null): Iterable<string> {
    if (!zoneKey) {
      return [];
    }
    return this.zoneHexLookup.get(zoneKey) ?? [];
  }

  /**
   * Generates a deployment zone list entry summarizing capacity and metadata.
   * @param zone - Scenario-provided zone definition including remaining capacity budget.
   * @returns HTML string inserted into `#deploymentZoneList`.
   */
  private renderZoneListItem(zone: DeploymentZoneMeta): string {
    const usedSlots = zone.totalCapacity - zone.remainingCapacity;
    const ariaLabel = `${zone.name} deployment zone. ${zone.remainingCapacity} of ${zone.totalCapacity} positions available.`;
    return `
      <li class="deployment-zone" data-zone-key="${this.escapeHtml(zone.key)}" data-zone-remaining="${zone.remainingCapacity}" data-zone-capacity="${zone.totalCapacity}" tabindex="0" aria-label="${this.escapeHtml(ariaLabel)}">
        <span class="deployment-zone-name">${this.escapeHtml(zone.name)}</span>
        <span class="deployment-zone-capacity" aria-hidden="true">${usedSlots}/${zone.totalCapacity}</span>
        <span class="deployment-zone-description">${this.escapeHtml(zone.description)}</span>
        <span class="sr-only">${usedSlots} of ${zone.totalCapacity} positions filled.</span>
      </li>
    `;
  }

  /**
   * Renders a single unit row showing remaining quantity and fallback art.
   * @param entry - Deployment pool item containing label and remaining count.
   * @param total - Total number of units allocated for this entry (used to compute deployed count).
   * @returns HTML string rendered inside `#deploymentUnitList`.
   */
  private renderUnitListItem(entry: DeploymentPoolEntry, total: number, locked: boolean): string {
    const deploymentState = ensureDeploymentState();
    const deployed = total - entry.remaining;
    const disabled = locked || entry.remaining === 0;
    const disabledAttr = disabled ? " data-deployment-disabled=\"true\"" : "";
    const ariaLabelBase = `${entry.label}. ${entry.remaining} of ${total} remaining.`;
    const ariaLabel = disabled
      ? `${ariaLabelBase} Deployment controls locked.`
      : `${ariaLabelBase} Activate to queue deployment.`;

    const statusLabel = this.resolveStatusLabel(entry.remaining, deployed, total);
    const spritePath = entry.sprite ?? deploymentState.getSpritePath(entry.key);
    const thumbnailMarkup = this.renderUnitThumbnail(entry.label, spritePath);

    return `
      <li class="deployment-unit" data-unit-key="${this.escapeHtml(entry.key)}"${disabledAttr} data-status="${statusLabel.toLowerCase()}" tabindex="0" aria-label="${this.escapeHtml(ariaLabel)}">
        <span class="deployment-unit-visual" aria-hidden="true">${thumbnailMarkup}</span>
        <div class="deployment-unit-copy">
          <span class="deployment-unit-label">${this.escapeHtml(entry.label)}</span>
          <span class="deployment-unit-meta" aria-hidden="true">
            <span class="deployment-unit-remaining">${entry.remaining}</span> remaining · ${deployed}/${total} committed
            <span class="deployment-status deployment-status--${statusLabel.toLowerCase()}">${statusLabel}</span>
          </span>
        </div>
        <span class="sr-only">${entry.remaining} remaining of ${total} total.</span>
      </li>
    `;
  }

  /**
   * Builds the thumbnail markup for a deployment unit row, preferring sprite art while falling back to initials for clarity.
   * Exposing the helper keeps accessibility copy consistent across every rendered roster entry.
   */
  private renderUnitThumbnail(label: string, spritePath: string | undefined): string {
    if (spritePath) {
      return `<img class="deployment-unit-thumb" src="${this.escapeHtml(spritePath)}" alt="${this.escapeHtml(label)} emblem" />`;
    }
    const initials = this.getInitials(label);
    return `
      <span class="deployment-unit-fallback" aria-hidden="true">${this.escapeHtml(initials)}</span>
      <span class="sr-only">${this.escapeHtml(label)} thumbnail</span>
    `;
  }

  private resolveStatusLabel(remaining: number, deployed: number, total: number): "Ready" | "Deployed" | "Exhausted" {
    if (remaining <= 0) {
      return "Exhausted";
    }
    if (deployed > 0 && deployed < total) {
      return "Deployed";
    }
    return "Ready";
  }

  private refreshZoneMetadata(): void {
    const deploymentState = ensureDeploymentState();
    const summaries = deploymentState.getZoneUsageSummaries();
    this.zoneMetaMap.clear();
    this.zoneHexLookup.clear();
    this.hexZoneIndex.clear();

    if (summaries.length === 0) {
      return;
    }

    summaries.forEach((summary) => {
      const zoneMeta: DeploymentZoneMeta = {
        key: summary.zoneKey,
        name: summary.name ?? this.titleCaseFromKey(summary.zoneKey),
        description: summary.description ?? "Deployment zone registered by scenario.",
        remainingCapacity: summary.remaining,
        totalCapacity: summary.capacity
      };
      this.zoneMetaMap.set(zoneMeta.key, zoneMeta);
      const hexes = new Set(deploymentState.getZoneHexes(summary.zoneKey));
      this.zoneHexLookup.set(zoneMeta.key, hexes);
      hexes.forEach((hexKey) => this.hexZoneIndex.set(hexKey, zoneMeta.key));
    });
  }

  private composeZoneSummaryCopy(): string {
    if (!this.selectedZoneKey) {
      return "No deployment zone selected.";
    }
    const deploymentState = ensureDeploymentState();
    const summary = deploymentState
      .getZoneUsageSummaries()
      .find((zone) => zone.zoneKey === this.selectedZoneKey);
    if (!summary) {
      return `${this.selectedZoneLabel ?? "Unknown zone"}: capacity data loading.`;
    }
    const label = this.selectedZoneLabel ?? summary.name ?? this.titleCaseFromKey(summary.zoneKey);
    return `${label}: ${summary.remaining}/${summary.capacity} slots available.`;
  }

  private composeSelectionMessage(): string {
    if (!this.selectedHexKey) {
      return "Select a hex to assign base camp.";
    }

    const terrainLabel = this.selectedTerrainLabel ?? "Unknown terrain";
    if (this.selectedZoneLabel && this.selectedZoneKey) {
      const deploymentState = ensureDeploymentState();
      const summary = deploymentState
        .getZoneUsageSummaries()
        .find((zone) => zone.zoneKey === this.selectedZoneKey);
      const remaining = summary?.remaining ?? deploymentState.getRemainingZoneCapacity(this.selectedZoneKey);
      const capacity = summary?.capacity ?? this.zoneMetaMap.get(this.selectedZoneKey)?.totalCapacity ?? null;
      if (remaining != null && capacity != null) {
        return `${this.selectedHexKey} · ${terrainLabel} · ${this.selectedZoneLabel} (${remaining}/${capacity} slots remaining)`;
      }
      return `${this.selectedHexKey} · ${terrainLabel} · ${this.selectedZoneLabel}`;
    }
    return `${this.selectedHexKey} · ${terrainLabel}`;
  }

  private syncZoneHighlight(): void {
    this.zoneList.querySelectorAll("[data-zone-key]").forEach((element) => {
      const zoneKey = element.getAttribute("data-zone-key");
      if (zoneKey && zoneKey === this.selectedZoneKey) {
        element.classList.add("is-selected");
      } else {
        element.classList.remove("is-selected");
      }
    });

    if (this.selectedZoneLabel) {
      this.zoneSummary.setAttribute("data-zone-active", this.selectedZoneLabel);
      this.zoneSummary.textContent = this.composeZoneSummaryCopy();
    } else {
      this.zoneSummary.removeAttribute("data-zone-active");
      this.zoneSummary.textContent = "No deployment zone selected.";
    }
  }

  /**
   * Derives render metadata for a zone using mirrored capacity data and safe name fallbacks until
   * TODO_deployment_state_engine_bridge.md supplies localized labels.
   * @param summary - Aggregated zone usage pulled from DeploymentState.
   * @param fallbacks - Map of descriptive copy keyed by zone identifiers.
   * @returns Enriched metadata consumed by renderZoneListItem().
   */
  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Required element not found: ${selector}`);
    }
    return element;
  }

  /**
   * Allows BattleScreen to subscribe to panel events without exposing DOM-specific details.
   */
  on(listener: DeploymentPanelListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Dispatches a typed event to registered listeners so downstream orchestrators can react.
   */
  private emit(type: DeploymentPanelEventType, payload: Record<string, unknown> = {}): void {
    const event = { type, payload } satisfies DeploymentPanelEventMap;
    this.listeners.forEach((listener) => listener(event));
  }

  private handlePanelClick(event: Event): void {
    const target = event.target as HTMLElement;
    const unitItem = target.closest<HTMLElement>("[data-unit-key]");
    if (unitItem && !unitItem.hasAttribute("data-deployment-disabled") && !this.interactionsLocked) {
      const unitKey = unitItem.getAttribute("data-unit-key");
      if (!unitKey) {
        return;
      }

      if (this.selectedHexKey) {
        this.emit("deploy", { unitKey, hexKey: this.selectedHexKey });
        this.queuedUnitKey = null;
        this.syncQueuedUnitHighlight();
      }
      if (!this.selectedHexKey) {
        this.queuedUnitKey = unitKey;
        this.syncQueuedUnitHighlight();
        this.renderDeploymentStatus();
      }
      return;
    }

    const recallButton = target.closest<HTMLElement>("[data-recall-hex]");
    if (recallButton) {
      if (this.interactionsLocked) {
        return;
      }
      const hexKey = recallButton.getAttribute("data-recall-hex");
      if (hexKey) {
        this.emit("recall", { hexKey });
      }
      return;
    }

    const zoneItem = target.closest<HTMLElement>("[data-zone-key]");
    if (zoneItem && !this.lockedZoneKey) {
      const zoneKey = zoneItem.getAttribute("data-zone-key");
      if (zoneKey) {
        this.emit("highlightZone", { zoneKey });
      }
    }
  }

  /** Tells the panel that battle has begun so reserve call-ups become interactive. */
  enableReserveCallups(): void {
    if (this.reserveCallupsEnabled) {
      return;
    }
    this.reserveCallupsEnabled = true;
    this.renderReserveList();
  }

  /**
   * Switches the panel into battle-phase mode so reserve call-ups take center stage while deployment-only affordances hide.
   * Keeps the panel visible after combat starts, matching commander expectations for mid-battle reinforcements.
   */
  enterBattlePhaseLayout(): void {
    if (this.panel.getAttribute("data-phase") === "battle") {
      return;
    }
    this.panel.setAttribute("data-phase", "battle");
    if (!this.reserveCallupsEnabled) {
      this.enableReserveCallups();
    } else {
      this.renderReserveList();
    }
    this.renderDeploymentStatus();
  }

  /** Allows tests or tooling to rewind the panel back to deployment-only state. */
  disableReserveCallups(): void {
    if (!this.reserveCallupsEnabled) {
      return;
    }
    this.reserveCallupsEnabled = false;
    this.renderReserveList();
  }

  /**
   * Marks the panel as pending base camp assignment so instructional copy hides advanced controls.
   */
  markBaseCampPending(): void {
    if (!this.baseCampAssigned && this.lockedZoneKey === null) {
      this.panel.setAttribute("data-basecamp-ready", "false");
      this.panel.removeAttribute("data-zone-locked");
      this.panel.removeAttribute("data-phase");
      return;
    }
    this.baseCampAssigned = false;
    this.lockedZoneKey = null;
    this.panel.setAttribute("data-basecamp-ready", "false");
    this.panel.removeAttribute("data-zone-locked");
    this.panel.removeAttribute("data-phase");
    this.queuedUnitKey = null;
    this.disableReserveCallups();
    this.renderDeploymentStatus();
    this.renderDeploymentUnits();
    this.renderDeploymentZones();
    this.renderReserveList();
  }

  /**
   * Locks in the base camp decision so deployment zones and rosters reveal appropriately.
   */
  markBaseCampAssigned(zoneKey: string | null): void {
    if (this.baseCampAssigned && this.lockedZoneKey === zoneKey) {
      return;
    }
    this.baseCampAssigned = true;
    this.lockedZoneKey = zoneKey;
    this.panel.setAttribute("data-basecamp-ready", "true");
    this.panel.removeAttribute("data-phase");
    if (zoneKey) {
      this.panel.setAttribute("data-zone-locked", "true");
      const zone = this.zoneMetaMap.get(zoneKey);
      if (zone) {
        this.selectedZoneKey = zone.key;
        this.selectedZoneLabel = zone.name;
      }
    } else {
      this.panel.removeAttribute("data-zone-locked");
    }
    this.queuedUnitKey = null;
    this.renderDeploymentStatus();
    this.renderDeploymentUnits();
    this.renderDeploymentZones();
    this.renderReserveList();

    // Debugging hook: surface roster availability whenever the base camp flips to assigned so we can confirm
    // the UI actually renders the commander-approved pool. Remove once the handoff regression is resolved.
    const deploymentState = ensureDeploymentState();
    const renderedUnitCount = this.unitList.querySelectorAll(".deployment-unit").length;
    console.log("[DeploymentPanel] markBaseCampAssigned", {
      zoneKey: this.lockedZoneKey,
      poolSize: deploymentState.pool.length,
      baseCampAssigned: this.baseCampAssigned,
      renderedUnitCount
    });
  }

  /**
   * Indicates whether a deployment zone has been locked due to base camp assignment.
   */
  isZoneLocked(): boolean {
    return this.lockedZoneKey !== null;
  }

  /**
   * Confirms whether the provided hex belongs to the locked deployment zone (if any).
   */
  isHexWithinLockedZone(hexKey: string): boolean {
    if (!this.lockedZoneKey) {
      return true;
    }
    return this.hexZoneIndex.get(hexKey) === this.lockedZoneKey;
  }

  /**
   * Supplies friendly copy for the locked deployment zone so announcements remain descriptive.
   */
  getLockedZoneLabel(): string | null {
    if (!this.lockedZoneKey) {
      return null;
    }
    return this.zoneMetaMap.get(this.lockedZoneKey)?.name ?? null;
  }

  /**
   * Highlights the queued unit (if any) so the player knows which roster entry will deploy next.
   */
  private syncQueuedUnitHighlight(): void {
    this.unitList.querySelectorAll("[data-unit-key]").forEach((element) => {
      const elementKey = element.getAttribute("data-unit-key");
      if (elementKey && elementKey === this.queuedUnitKey) {
        element.classList.add("is-queued");
      } else {
        element.classList.remove("is-queued");
      }
    });
  }

  /**
   * Deploys the queued unit as soon as the player selects a compatible hex, keeping the flow fluid.
   */
  private deployQueuedUnitIfReady(hexKey: string | null): void {
    if (!hexKey || !this.queuedUnitKey || this.interactionsLocked) {
      return;
    }

    const unitKey = this.queuedUnitKey;
    this.queuedUnitKey = null;
    this.syncQueuedUnitHighlight();
    this.emit("deploy", { unitKey, hexKey });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private getInitials(label: string): string {
    return label
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "--";
  }

  private titleCaseFromKey(key: string): string {
    return key
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
