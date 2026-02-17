import type { DeploymentPoolEntry, DeploymentState } from "../../state/DeploymentState";

/**
 * Manages the battle loadout display showing allocated and deployed units.
 * Updates dynamically as units are deployed during the battle setup phase.
 */
export class BattleLoadout {
  /** Indicates whether the battle phase has begun so counts lock in and copy adjusts. */
  private battlePhaseStarted = false;
  private readonly listElement: HTMLElement;
  private readonly deploymentState: DeploymentState;
  private readonly previousRemaining = new Map<string, number>();

  constructor(deploymentState: DeploymentState, listElementSelector: string = "#battleLoadoutList") {
    const element = document.querySelector<HTMLElement>(listElementSelector);
    if (!element) {
      throw new Error(`Battle loadout list element not found: ${listElementSelector}`);
    }
    this.listElement = element;
    this.deploymentState = deploymentState;
  }

  /**
   * Initializes the component with the current deployment snapshot.
   */
  initialize(): void {
    this.render();
  }

  /**
   * Re-renders the list from the latest DeploymentState mirror.
   */
  render(): void {
    const pool = this.deploymentState.pool;
    console.log("BattleLoadout rendering with pool size:", pool.length);
    if (pool.length === 0) {
      this.previousRemaining.clear();
      this.renderEmptyState();
      return;
    }

    const items = pool.map((entry) => this.renderLoadoutItem(entry.key, entry.label, entry.remaining));
    this.listElement.innerHTML = items.join("");
    this.applyCountAnimations(pool);
    this.storeRemaining(pool);
  }

  /**
   * Convenience alias to keep previous API usage working.
   */
  refresh(): void {
    const poolSnapshot = this.deploymentState.pool;
    // Detect whether the remaining counts have changed so we only re-render (and animate) when users deploy or recall units.
    if (this.previousRemaining.size === 0 || this.hasRemainingDelta(poolSnapshot)) {
      this.render();
    }
  }

  /**
   * Locks the loadout to battle phase state preventing further deployment animations.
   */
  markBattlePhaseStarted(): void {
    this.battlePhaseStarted = true;
    this.render();
  }

  private renderEmptyState(): void {
    this.listElement.innerHTML = `
      <li class="loadout-empty" aria-live="polite">
        No units allocated for this operation.
      </li>
    `;
  }

  private renderLoadoutItem(unitKey: string, label: string, remaining: number): string {
    const totalAllocated = this.deploymentState.getUnitCount(unitKey);
    const deployed = Math.max(0, totalAllocated - remaining);
    const sprite = this.deploymentState.getSpritePath(unitKey);
    const ariaLabel = `${label}. ${deployed} deployed of ${totalAllocated} allocated.`;
    const spriteMarkup = sprite
      ? `<img src="${this.escapeHtml(sprite)}" alt="" class="loadout-thumb" loading="lazy" />`
      : `<span class="loadout-fallback">${this.getInitials(label)}</span>`;

    return `
      <li class="loadout-item" data-unit-key="${this.escapeHtml(unitKey)}" data-sprite-url="${sprite ? this.escapeHtml(sprite) : ""}" aria-label="${this.escapeHtml(ariaLabel)}">
        <div class="loadout-visual" aria-hidden="true">
          ${spriteMarkup}
        </div>
        <div class="loadout-copy">
          <strong>${this.escapeHtml(label)}</strong>
          <span>${deployed} / ${totalAllocated} deployed</span>
        </div>
      </li>
    `;
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

  private applyCountAnimations(entries: readonly DeploymentPoolEntry[]): void {
    entries.forEach((entry) => {
      const previous = this.previousRemaining.get(entry.key);
      if (previous !== undefined && previous !== entry.remaining) {
        const selector = `[data-unit-key="${CSS.escape(entry.key)}"]`;
        const item = this.listElement.querySelector<HTMLElement>(selector);
        if (item) {
          item.classList.add("loadout-item--changed");
          window.setTimeout(() => item.classList.remove("loadout-item--changed"), 300);
        }
      }
    });
  }

  private storeRemaining(entries: readonly DeploymentPoolEntry[]): void {
    const staleKeys = new Set(this.previousRemaining.keys());
    entries.forEach((entry) => {
      this.previousRemaining.set(entry.key, entry.remaining);
      staleKeys.delete(entry.key);
    });
    staleKeys.forEach((key) => this.previousRemaining.delete(key));
  }

  private hasRemainingDelta(entries: readonly DeploymentPoolEntry[]): boolean {
    if (entries.length !== this.previousRemaining.size) {
      return true;
    }
    return entries.some((entry) => {
      const previous = this.previousRemaining.get(entry.key);
      return previous === undefined || previous !== entry.remaining;
    });
  }
}
