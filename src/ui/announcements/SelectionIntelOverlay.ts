import type {
  BattleIntelAction,
  BattleIntelChip,
  BattleSelectionIntel,
  DeploymentSelectionIntel,
  SelectionIntel,
  TerrainSelectionIntel
} from "./AnnouncementTypes";

/**
 * Renders the centered intel card that summarizes the currently highlighted hex.
 * Handles dismiss logic and lightweight keyboard support so commanders can quickly
 * hide the overlay and bring it back when fresh intel arrives.
 */
export class SelectionIntelOverlay {
  private readonly root: HTMLElement | null;
  private readonly titleElement: HTMLElement | null;
  private readonly metaElement: HTMLElement | null;
  private readonly bodyElement: HTMLElement | null;
  private readonly notesElement: HTMLElement | null;
  private readonly headerElement: HTMLElement | null;
  private readonly dismissButton: HTMLButtonElement | null;
  private readonly toggleButton: HTMLButtonElement | null;
  private readonly handleDismissBound = (event: Event) => this.handleDismiss(event);
  private readonly handleKeydownBound = (event: KeyboardEvent) => this.handleKeydown(event);
  private readonly handleToggleBound = (event: Event) => this.handleToggle(event);
  private readonly handlePointerDownBound = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly handlePointerMoveBound = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly handlePointerUpBound = (event: PointerEvent) => this.handlePointerUp(event);

  private lastSignature: string | null = null;
  private suppressedSignature: string | null = null;
  private collapsed = true;
  private activePointerId: number | null = null;
  private pointerOffsetX = 0;
  private pointerOffsetY = 0;
  private hasManualPosition = false;

  constructor(selectors: {
    rootSelector?: string;
    titleSelector?: string;
    metaSelector?: string;
    bodySelector?: string;
    notesSelector?: string;
    dismissSelector?: string;
    toggleSelector?: string;
  } = {}) {
    const {
      rootSelector = "#battleIntelOverlay",
      titleSelector = "#battleIntelOverlayTitle",
      metaSelector = "#battleIntelOverlayMeta",
      bodySelector = "#battleIntelOverlayBody",
      notesSelector = "#battleIntelOverlayNotes",
      dismissSelector = "#battleIntelOverlayDismiss",
      toggleSelector = "#battleIntelOverlayToggle"
    } = selectors;

    this.root = document.querySelector<HTMLElement>(rootSelector);
    this.titleElement = document.querySelector<HTMLElement>(titleSelector);
    this.metaElement = document.querySelector<HTMLElement>(metaSelector);
    this.bodyElement = document.querySelector<HTMLElement>(bodySelector);
    this.notesElement = document.querySelector<HTMLElement>(notesSelector);
    this.headerElement = this.root?.querySelector<HTMLElement>(".battle-intel-overlay__header") ?? null;
    this.dismissButton = document.querySelector<HTMLButtonElement>(dismissSelector);
    this.toggleButton = document.querySelector<HTMLButtonElement>(toggleSelector);

    if (this.root) {
      this.root.setAttribute("aria-hidden", "true");
      this.root.classList.add("hidden");
      this.root.addEventListener("keydown", this.handleKeydownBound);
      this.root.dataset.collapsed = "true";
    }
    this.headerElement?.addEventListener("pointerdown", this.handlePointerDownBound);
    this.dismissButton?.addEventListener("click", this.handleDismissBound);
    this.toggleButton?.addEventListener("click", this.handleToggleBound);
  }

  /** Releases DOM listeners so the overlay can be safely garbage collected. */
  dispose(): void {
    this.headerElement?.removeEventListener("pointerdown", this.handlePointerDownBound);
    this.dismissButton?.removeEventListener("click", this.handleDismissBound);
    this.toggleButton?.removeEventListener("click", this.handleToggleBound);
    this.root?.removeEventListener("keydown", this.handleKeydownBound);
    window.removeEventListener("pointermove", this.handlePointerMoveBound);
    window.removeEventListener("pointerup", this.handlePointerUpBound);
  }

  /**
   * Updates the overlay content. When the commander dismisses the current intel the
   * card stays hidden until fresh intel arrives (new signature).
   */
  update(intel: SelectionIntel): void {
    if (!this.root) {
      if (intel) {
        console.debug("[SelectionIntelOverlay] Intel payload without overlay", intel);
      }
      return;
    }

    if (!intel) {
      this.lastSignature = null;
      this.hide();
      return;
    }

    const signature = JSON.stringify(intel);
    const isNewIntel = signature !== this.lastSignature;
    this.lastSignature = signature;

    if (isNewIntel) {
      this.suppressedSignature = null;
      this.collapsed = intel.kind === "battle";
    }

    if (this.suppressedSignature === signature) {
      // Commander dismissed this exact intel; keep it hidden until new intel arrives.
      return;
    }

    this.render(intel);
    this.show();
  }

  private show(): void {
    if (!this.root) {
      return;
    }
    this.root.classList.remove("hidden");
    this.root.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => {
      this.clampWithinViewport();
      this.root?.focus({ preventScroll: true });
    });
  }

  private hide(): void {
    if (!this.root) {
      return;
    }
    this.root.classList.add("hidden");
    this.root.setAttribute("aria-hidden", "true");
  }

  private handleToggle(event: Event): void {
    event.preventDefault();
    this.collapsed = !this.collapsed;
    this.syncCollapsedState();
  }

  private handleDismiss(event: Event): void {
    event.preventDefault();
    this.suppressedSignature = this.lastSignature;
    this.hide();
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.suppressedSignature = this.lastSignature;
      this.hide();
    }
  }

  private render(intel: Exclude<SelectionIntel, null>): void {
    const title = this.resolveTitle(intel);
    const summary = this.composeSummary(intel);

    if (this.root) {
      this.root.dataset.intelKind = intel.kind;
    }
    if (this.toggleButton) {
      const canCollapse = intel.kind === "battle";
      this.toggleButton.hidden = !canCollapse;
      this.toggleButton.setAttribute("aria-hidden", canCollapse ? "false" : "true");
      if (canCollapse) {
        this.toggleButton.textContent = this.collapsed ? "Expand" : "Compact";
      }
    }
    this.syncCollapsedState();
    if (this.titleElement) {
      this.titleElement.textContent = title;
    }
    if (this.metaElement) {
      this.metaElement.textContent = summary;
    }
    if (this.bodyElement) {
      this.bodyElement.innerHTML = this.renderBodyMarkup(intel);
    }
    if (this.notesElement) {
      const notes = this.resolveNotes(intel);
      if (notes.length > 0) {
        this.notesElement.classList.remove("hidden");
        this.notesElement.innerHTML = notes
          .map((note) => `<p class="battle-intel-overlay__note">${this.escapeHtml(note)}</p>`)
          .join("");
      } else {
        this.notesElement.classList.add("hidden");
        this.notesElement.textContent = "";
      }
    }
    window.requestAnimationFrame(() => this.clampWithinViewport());
  }

  private syncCollapsedState(): void {
    if (!this.root) {
      return;
    }
    this.root.dataset.collapsed = this.collapsed ? "true" : "false";
    if (this.toggleButton && !this.toggleButton.hidden) {
      this.toggleButton.setAttribute("aria-expanded", this.collapsed ? "false" : "true");
      this.toggleButton.textContent = this.collapsed ? "Expand" : "Compact";
    }
    window.requestAnimationFrame(() => this.clampWithinViewport());
  }

  private handlePointerDown(event: PointerEvent): void {
    if (!this.root || !this.headerElement || (event.target as HTMLElement | null)?.closest("button")) {
      return;
    }
    const parent = this.root.parentElement;
    if (!parent) {
      return;
    }
    const rootRect = this.root.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    this.root.style.left = `${rootRect.left - parentRect.left}px`;
    this.root.style.top = `${rootRect.top - parentRect.top}px`;
    this.activePointerId = event.pointerId;
    this.pointerOffsetX = event.clientX - rootRect.left;
    this.pointerOffsetY = event.clientY - rootRect.top;
    this.hasManualPosition = true;
    this.headerElement.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", this.handlePointerMoveBound);
    window.addEventListener("pointerup", this.handlePointerUpBound);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.root || this.activePointerId !== event.pointerId) {
      return;
    }
    const parent = this.root.parentElement;
    if (!parent) {
      return;
    }
    const parentRect = parent.getBoundingClientRect();
    const rootWidth = this.root.offsetWidth;
    const rootHeight = this.root.offsetHeight;
    const left = event.clientX - parentRect.left - this.pointerOffsetX;
    const top = event.clientY - parentRect.top - this.pointerOffsetY;
    const clampedLeft = Math.min(Math.max(16, left), Math.max(16, parent.clientWidth - rootWidth - 16));
    const clampedTop = Math.min(Math.max(16, top), Math.max(16, parent.clientHeight - rootHeight - 16));
    this.root.style.left = `${clampedLeft}px`;
    this.root.style.top = `${clampedTop}px`;
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.headerElement || this.activePointerId !== event.pointerId) {
      return;
    }
    this.headerElement.releasePointerCapture(event.pointerId);
    this.activePointerId = null;
    window.removeEventListener("pointermove", this.handlePointerMoveBound);
    window.removeEventListener("pointerup", this.handlePointerUpBound);
    this.clampWithinViewport();
  }

  private clampWithinViewport(): void {
    if (!this.root || this.root.classList.contains("hidden")) {
      return;
    }
    const parent = this.root.parentElement;
    if (!parent) {
      return;
    }
    const rootWidth = this.root.offsetWidth;
    const rootHeight = this.root.offsetHeight;
    if (!this.hasManualPosition) {
      const currentLeft = Number.parseFloat(this.root.style.left || "16");
      const currentTop = Number.parseFloat(this.root.style.top || "16");
      this.root.style.left = `${currentLeft}px`;
      this.root.style.top = `${currentTop}px`;
    }
    const left = Number.parseFloat(this.root.style.left || "16");
    const top = Number.parseFloat(this.root.style.top || "16");
    const clampedLeft = Math.min(Math.max(16, left), Math.max(16, parent.clientWidth - rootWidth - 16));
    const clampedTop = Math.min(Math.max(16, top), Math.max(16, parent.clientHeight - rootHeight - 16));
    this.root.style.left = `${clampedLeft}px`;
    this.root.style.top = `${clampedTop}px`;
  }

  private resolveTitle(intel: Exclude<SelectionIntel, null>): string {
    switch (intel.kind) {
      case "deployment":
        return intel.zoneLabel ?? "Deployment Zone";
      case "battle":
        return intel.unitLabel ?? "Selected Unit";
      case "terrain":
      default:
        return "Terrain Intel";
    }
  }

  private resolveMeta(intel: Exclude<SelectionIntel, null>): string {
    const terrain = intel.terrainName ?? "Unknown terrain";
    return `${intel.hexKey} • ${terrain}`;
  }

  private composeSummary(intel: Exclude<SelectionIntel, null>): string {
    switch (intel.kind) {
      case "deployment":
        return this.composeDeploymentSummary(intel);
      case "battle":
        return this.composeBattleSummary(intel);
      case "terrain":
      default:
        return this.composeTerrainSummary(intel);
    }
  }

  /**
   * Formats deployment intel as a concise sequence so commanders can confirm zone, capacity, and context at a glance.
   */
  private composeDeploymentSummary(intel: DeploymentSelectionIntel): string {
    const segments: string[] = [];
    segments.push(this.resolveMeta(intel));

    if (intel.remainingCapacity !== null && intel.totalCapacity !== null) {
      segments.push(`${intel.remainingCapacity} / ${intel.totalCapacity} ready`);
    }

    if (!intel.zoneLabel && intel.notes.length > 0) {
      segments.push(intel.notes.join(", "));
    }

    return segments.filter((segment) => segment.length > 0).join(" • ");
  }

  /**
   * Summarizes unit intel on a single line, covering strength, ammo, and immediate action state.
   */
  private composeBattleSummary(intel: BattleSelectionIntel): string {
    const segments: string[] = [];
    segments.push(this.resolveMeta(intel));

    if (intel.unitStrength !== null) {
      const percent = Math.round(Math.max(0, Math.min(100, intel.unitStrength)));
      segments.push(`STR ${percent}%`);
    }
    if (intel.unitAmmo !== null) {
      const ammo = Math.max(0, Math.round(intel.unitAmmo));
      segments.push(`Ammo ${ammo}`);
    }

    if (intel.movementRemaining !== null) {
      const maxLabel = typeof intel.movementMax === "number" ? `/${Math.max(0, Math.round(intel.movementMax))}` : "";
      const remaining = Math.max(0, Math.round(intel.movementRemaining));
      segments.push(`Move ${remaining}${maxLabel}`);
    }

    return segments.filter((segment) => segment.length > 0).join(" • ");
  }

  /**
   * Presents terrain intel with notes so reconnaissance overlays remain easy to scan while moving the cursor.
   */
  private composeTerrainSummary(intel: TerrainSelectionIntel): string {
    const segments: string[] = [];
    const terrainSegment = this.resolveMeta(intel);
    segments.push(terrainSegment);

    if (intel.notes.length > 0) {
      segments.push(intel.notes.join(", "));
    }

    return segments.join(" • ");
  }

  private renderBodyMarkup(intel: Exclude<SelectionIntel, null>): string {
    switch (intel.kind) {
      case "battle":
        return this.renderBattleMarkup(intel);
      case "deployment":
        return this.renderDeploymentMarkup(intel);
      case "terrain":
      default:
        return this.renderTerrainMarkup(intel);
    }
  }

  private renderBattleMarkup(intel: BattleSelectionIntel): string {
    const statCards = [
      { label: "Strength", value: intel.unitStrength !== null ? `${Math.round(intel.unitStrength)}%` : "—" },
      { label: "Ammo", value: intel.unitAmmo !== null ? `${Math.max(0, Math.round(intel.unitAmmo))}` : "—" },
      { label: "Fuel", value: intel.unitFuel !== null ? `${Math.max(0, Math.round(intel.unitFuel))}` : "—" },
      { label: "Entrench", value: intel.unitEntrenchment !== null ? `${Math.max(0, Math.round(intel.unitEntrenchment))}/2` : "—" },
      {
        label: "Move",
        value: intel.movementRemaining !== null
          ? `${Math.max(0, Math.round(intel.movementRemaining))}${typeof intel.movementMax === "number" ? `/${Math.max(0, Math.round(intel.movementMax))}` : ""}`
          : "—"
      },
      { label: "Targets", value: `${Math.max(0, Math.round(intel.attackOptions))}` }
    ];

    const chipMarkup = intel.statusChips.length > 0
      ? `<div class="battle-intel-overlay__chip-row">${intel.statusChips.map((chip) => this.renderChipMarkup(chip)).join("")}</div>`
      : "";
    const actionMarkup = intel.actionCards.length > 0
      ? `<div class="battle-intel-overlay__actions">${intel.actionCards.map((action) => this.renderActionMarkup(action)).join("")}</div>`
      : `<div class="battle-intel-overlay__status-line">No infantry field actions are available for this formation.</div>`;

    return `
      <div class="battle-intel-overlay__stats">
        ${statCards.map((stat) => `
          <article class="battle-intel-overlay__stat">
            <span class="battle-intel-overlay__stat-label">${this.escapeHtml(stat.label)}</span>
            <strong class="battle-intel-overlay__stat-value">${this.escapeHtml(stat.value)}</strong>
          </article>
        `).join("")}
      </div>
      ${chipMarkup}
      ${actionMarkup}
    `;
  }

  private renderDeploymentMarkup(intel: DeploymentSelectionIntel): string {
    const capacityValue = intel.remainingCapacity !== null && intel.totalCapacity !== null
      ? `${intel.remainingCapacity} / ${intel.totalCapacity}`
      : "Pending";
    const capacityCaption = intel.remainingCapacity !== null && intel.totalCapacity !== null
      ? "slots ready"
      : "Awaiting deployment-zone confirmation";
    return `
      <div class="battle-intel-overlay__summary-card">
        <span class="battle-intel-overlay__summary-label">Deployment Capacity</span>
        <strong class="battle-intel-overlay__summary-value">${this.escapeHtml(capacityValue)}</strong>
        <span class="battle-intel-overlay__summary-caption">${this.escapeHtml(capacityCaption)}</span>
      </div>
    `;
  }

  private renderTerrainMarkup(intel: TerrainSelectionIntel): string {
    const note = intel.notes[0] ?? "No unit occupies this hex.";
    return `
      <div class="battle-intel-overlay__summary-card">
        <span class="battle-intel-overlay__summary-label">Terrain Note</span>
        <strong class="battle-intel-overlay__summary-value">${this.escapeHtml(intel.terrainName ?? "Terrain Intel")}</strong>
        <span class="battle-intel-overlay__summary-caption">${this.escapeHtml(note)}</span>
      </div>
    `;
  }

  private renderChipMarkup(chip: BattleIntelChip): string {
    return `<span class="battle-intel-overlay__chip battle-intel-overlay__chip--${chip.tone}">${this.escapeHtml(chip.label)}</span>`;
  }

  private renderActionMarkup(action: BattleIntelAction): string {
    const detail = action.available ? action.detail : (action.reason ?? action.detail);
    const disabled = action.available ? "" : " disabled aria-disabled=\"true\"";
    const title = this.escapeHtml(action.available ? action.detail : (action.reason ?? action.detail));
    return `
      <button
        type="button"
        class="battle-intel-overlay__action battle-intel-overlay__action--${action.tone}"
        data-selection-action="${this.escapeHtml(action.id)}"
        title="${title}"${disabled}
      >
        <span class="battle-intel-overlay__action-label">${this.escapeHtml(action.label)}</span>
        <span class="battle-intel-overlay__action-detail">${this.escapeHtml(detail)}</span>
      </button>
    `;
  }

  private resolveNotes(intel: Exclude<SelectionIntel, null>): readonly string[] {
    switch (intel.kind) {
      case "battle":
        return intel.notes;
      case "deployment":
      case "terrain":
      default:
        return intel.notes;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

