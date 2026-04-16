/**
 * Renders the deployment reserve queue using mirrored snapshots from `DeploymentState`.
 * Keeps markup accessible with sprite fallbacks, descriptive ARIA labels, and phase-aware messaging.
 */
export class ReserveListPresenter {
    constructor(deploymentState, listElementSelector = "#reserveList") {
        this.battlePhaseStarted = false;
        this.frozenEngineReserves = null;
        this.frozenSnapshots = null;
        this.previousRemaining = new Map();
        this.deploymentState = deploymentState;
        this.listElement = this.requireElement(listElementSelector);
    }
    /**
     * Seeds the reserve list immediately so downstream orchestration can rely on stable DOM structure.
     */
    initialize() {
        this.render();
        this.bindEvents();
    }
    /**
     * Binds click handlers to reserve items for call-up during battle.
     */
    bindEvents() {
        this.listElement.addEventListener("click", (evt) => {
            const target = evt.target;
            const item = target.closest(".reserve-item[data-unit-key]");
            if (!item) {
                return;
            }
            const unitKey = item.dataset.unitKey;
            if (!unitKey) {
                return;
            }
            // Dispatch event that BattleScreen listens for
            document.dispatchEvent(new CustomEvent("battle:callUpReserve", { detail: { unitKey } }));
        });
    }
    /**
     * Re-renders the component using the latest mirrored deployment snapshot.
     */
    refresh() {
        const reserves = this.getRenderableReserves();
        // Only trigger a DOM rewrite when remaining counts shift so the change animation reflects real deployments/recalls.
        if (this.previousRemaining.size === 0 || this.hasReserveDelta(reserves)) {
            this.render();
        }
    }
    /**
     * Flags that battle has started and caches the authoritative reserve snapshot returned by the engine.
     * @param engineReserves - Raw `ReserveUnit` array returned directly from `GameEngine.finalizeDeployment()`.
     * @param mirroredReserves - Mirror emitted by `DeploymentState.getReserves()` after freezing counts.
     */
    markBattlePhaseStarted(engineReserves, mirroredReserves) {
        this.battlePhaseStarted = true;
        this.frozenEngineReserves = this.cloneEngineReserves(engineReserves);
        this.frozenSnapshots = mirroredReserves.map((snapshot) => ({ ...snapshot }));
        this.render();
    }
    render() {
        const reserves = this.getRenderableReserves();
        console.log("ReserveListPresenter rendering with reserves size:", reserves.length);
        if (reserves.length === 0) {
            this.previousRemaining.clear();
            this.renderEmptyState();
            return;
        }
        const markup = reserves.map((entry) => this.renderReserveItem(entry)).join("");
        this.listElement.innerHTML = markup;
        this.applyReserveAnimations(reserves);
        this.storeReserveCounts(reserves);
    }
    renderEmptyState() {
        const copy = this.battlePhaseStarted
            ? "All reserves committed to battle."
            : "Reserve queue will populate once deployment begins.";
        this.listElement.innerHTML = `
      <li class="reserve-empty" aria-live="polite">
        ${this.escapeHtml(copy)}
      </li>
    `;
    }
    renderReserveItem(snapshot) {
        const spritePath = snapshot.sprite ?? this.deploymentState.getSpritePath(snapshot.unitKey);
        const spriteMarkup = spritePath
            ? `<img src="${this.escapeHtml(spritePath)}" alt="" class="reserve-thumb" aria-hidden="true" />`
            : `<span class="reserve-thumb reserve-thumb--fallback" aria-hidden="true">${this.escapeHtml(this.getInitials(snapshot.label))}</span>`;
        const statusLabel = snapshot.status === "ready" ? "Ready" : "Exhausted";
        const clickableClass = this.battlePhaseStarted && snapshot.remaining > 0 ? " reserve-item--clickable" : "";
        const clickHint = this.battlePhaseStarted && snapshot.remaining > 0 ? " Click to deploy to selected hex." : "";
        const ariaLabel = `${snapshot.label}. ${snapshot.remaining} remaining. ${statusLabel} reserve.${clickHint}`;
        return `
      <li class="reserve-item${clickableClass}" data-unit-key="${this.escapeHtml(snapshot.unitKey)}" data-sprite-url="${spritePath ? this.escapeHtml(spritePath) : ""}" aria-label="${this.escapeHtml(ariaLabel)}" title="${this.battlePhaseStarted ? this.escapeHtml(`Click to call up ${snapshot.label}`) : ""}">
        <div class="reserve-visual">${spriteMarkup}</div>
        <div class="reserve-copy">
          <strong>${this.escapeHtml(snapshot.label)}</strong>
          <span class="reserve-meta" aria-hidden="true">
            <span class="reserve-remaining">${snapshot.remaining} remaining</span>
            <span class="reserve-status-badge reserve-status-badge--${snapshot.status}">${statusLabel}</span>
          </span>
        </div>
      </li>
    `;
    }
    requireElement(selector) {
        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Reserve list element not found: ${selector}`);
        }
        return element;
    }
    escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value;
        return div.innerHTML;
    }
    getInitials(label) {
        return label
            .split(" ")
            .filter(Boolean)
            .map((word) => word[0]?.toUpperCase() ?? "")
            .join("")
            .slice(0, 2) || "--";
    }
    cloneEngineReserves(reserves) {
        if (typeof structuredClone === "function") {
            return structuredClone(reserves);
        }
        try {
            return JSON.parse(JSON.stringify(reserves));
        }
        catch {
            return reserves.map((entry) => ({
                unit: { ...entry.unit, hex: entry.unit.hex ? { ...entry.unit.hex } : entry.unit.hex },
                definition: { ...entry.definition },
                allocationKey: entry.allocationKey,
                sprite: entry.sprite
            }));
        }
    }
    applyReserveAnimations(entries) {
        entries.forEach((entry) => {
            const previous = this.previousRemaining.get(entry.unitKey);
            if (previous !== undefined && previous !== entry.remaining) {
                const selector = `[data-unit-key="${CSS.escape(entry.unitKey)}"]`;
                const item = this.listElement.querySelector(selector);
                if (item) {
                    item.classList.add("reserve-item--changed");
                    window.setTimeout(() => item.classList.remove("reserve-item--changed"), 300);
                }
            }
        });
    }
    storeReserveCounts(entries) {
        const stale = new Set(this.previousRemaining.keys());
        entries.forEach((entry) => {
            this.previousRemaining.set(entry.unitKey, entry.remaining);
            stale.delete(entry.unitKey);
        });
        stale.forEach((key) => this.previousRemaining.delete(key));
    }
    getRenderableReserves() {
        return this.battlePhaseStarted && this.frozenSnapshots
            ? this.frozenSnapshots.map((snapshot) => ({ ...snapshot }))
            : this.deploymentState.getReserves();
    }
    hasReserveDelta(reserves) {
        if (reserves.length !== this.previousRemaining.size) {
            return true;
        }
        return reserves.some((snapshot) => {
            const previous = this.previousRemaining.get(snapshot.unitKey);
            return previous === undefined || previous !== snapshot.remaining;
        });
    }
}
