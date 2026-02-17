import type {
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
  private readonly dismissButton: HTMLButtonElement | null;
  private readonly handleDismissBound = (event: Event) => this.handleDismiss(event);
  private readonly handleKeydownBound = (event: KeyboardEvent) => this.handleKeydown(event);

  private lastSignature: string | null = null;
  private suppressedSignature: string | null = null;

  constructor(selectors: {
    rootSelector?: string;
    titleSelector?: string;
    metaSelector?: string;
    bodySelector?: string;
    notesSelector?: string;
    dismissSelector?: string;
  } = {}) {
    const {
      rootSelector = "#battleIntelOverlay",
      titleSelector = "#battleIntelOverlayTitle",
      metaSelector = "#battleIntelOverlayMeta",
      bodySelector = "#battleIntelOverlayBody",
      notesSelector = "#battleIntelOverlayNotes",
      dismissSelector = "#battleIntelOverlayDismiss"
    } = selectors;

    this.root = document.querySelector<HTMLElement>(rootSelector);
    this.titleElement = document.querySelector<HTMLElement>(titleSelector);
    this.metaElement = document.querySelector<HTMLElement>(metaSelector);
    this.bodyElement = document.querySelector<HTMLElement>(bodySelector);
    this.notesElement = document.querySelector<HTMLElement>(notesSelector);
    this.dismissButton = document.querySelector<HTMLButtonElement>(dismissSelector);

    if (this.root) {
      this.root.setAttribute("aria-hidden", "true");
      this.root.classList.add("hidden");
      this.root.addEventListener("keydown", this.handleKeydownBound);
    }
    this.dismissButton?.addEventListener("click", this.handleDismissBound);
  }

  /** Releases DOM listeners so the overlay can be safely garbage collected. */
  dispose(): void {
    this.dismissButton?.removeEventListener("click", this.handleDismissBound);
    this.root?.removeEventListener("keydown", this.handleKeydownBound);
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
    // Focus the overlay so keyboard users can immediately interact or dismiss.
    window.requestAnimationFrame(() => {
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

    if (this.titleElement) {
      this.titleElement.textContent = title;
    }
    if (this.metaElement) {
      // Present a tight, single-line status string per CODEX request so the overlay stays unobtrusive.
      this.metaElement.textContent = summary;
    }
    if (this.bodyElement) {
      this.bodyElement.textContent = "";
    }
    if (this.notesElement) {
      this.notesElement.classList.add("hidden");
      this.notesElement.textContent = "";
    }
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
    const zoneLabel = intel.zoneLabel ?? "Deployment Zone";
    segments.push(zoneLabel.trim());

    const terrainSegment = this.resolveMeta(intel);
    segments.push(terrainSegment);

    if (intel.remainingCapacity !== null && intel.totalCapacity !== null) {
      segments.push(`${intel.remainingCapacity} / ${intel.totalCapacity} slots`);
    }

    if (intel.notes.length > 0) {
      segments.push(intel.notes.join(", "));
    }

    return segments.filter((segment) => segment.length > 0).join(" • ");
  }

  /**
   * Summarizes unit intel on a single line, covering strength, ammo, actionable options, and current status.
   */
  private composeBattleSummary(intel: BattleSelectionIntel): string {
    const segments: string[] = [];
    const terrainSegment = this.resolveMeta(intel);
    const unitLabel = intel.unitLabel ?? "Unit";
    segments.push(`${unitLabel} @ ${terrainSegment}`.trim());

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
      segments.push(`Moves ${remaining}${maxLabel}`);
    }

    segments.push(`${intel.attackOptions} targets`);

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
}
