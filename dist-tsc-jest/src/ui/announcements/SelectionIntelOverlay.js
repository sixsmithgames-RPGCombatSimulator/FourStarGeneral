/**
 * Renders the centered intel card that summarizes the currently highlighted hex.
 * Handles dismiss logic and lightweight keyboard support so commanders can quickly
 * hide the overlay and bring it back when fresh intel arrives.
 */
export class SelectionIntelOverlay {
    constructor(selectors = {}) {
        this.handleDismissBound = (event) => this.handleDismiss(event);
        this.handleKeydownBound = (event) => this.handleKeydown(event);
        this.handleToggleBound = (event) => this.handleToggle(event);
        this.handleRootClickBound = (event) => this.handleRootClick(event);
        this.handlePointerDownBound = (event) => this.handlePointerDown(event);
        this.handlePointerMoveBound = (event) => this.handlePointerMove(event);
        this.handlePointerUpBound = (event) => this.handlePointerUp(event);
        this.lastSignature = null;
        this.suppressedSignature = null;
        this.activeIntel = null;
        this.activeBattleTab = "orders";
        this.collapsed = true;
        this.activePointerId = null;
        this.pointerOffsetX = 0;
        this.pointerOffsetY = 0;
        this.hasManualPosition = false;
        const { rootSelector = "#battleIntelOverlay", titleSelector = "#battleIntelOverlayTitle", metaSelector = "#battleIntelOverlayMeta", bodySelector = "#battleIntelOverlayBody", notesSelector = "#battleIntelOverlayNotes", dismissSelector = "#battleIntelOverlayDismiss", toggleSelector = "#battleIntelOverlayToggle" } = selectors;
        this.root = document.querySelector(rootSelector);
        this.titleElement = document.querySelector(titleSelector);
        this.metaElement = document.querySelector(metaSelector);
        this.bodyElement = document.querySelector(bodySelector);
        this.notesElement = document.querySelector(notesSelector);
        this.headerElement = this.root?.querySelector(".battle-intel-overlay__header") ?? null;
        this.dismissButton = document.querySelector(dismissSelector);
        this.toggleButton = document.querySelector(toggleSelector);
        if (this.root) {
            this.root.setAttribute("aria-hidden", "true");
            this.root.classList.add("hidden");
            this.root.addEventListener("keydown", this.handleKeydownBound);
            this.root.addEventListener("click", this.handleRootClickBound);
            this.root.dataset.collapsed = "true";
        }
        this.headerElement?.addEventListener("pointerdown", this.handlePointerDownBound);
        this.dismissButton?.addEventListener("click", this.handleDismissBound);
        this.toggleButton?.addEventListener("click", this.handleToggleBound);
    }
    /** Releases DOM listeners so the overlay can be safely garbage collected. */
    dispose() {
        this.headerElement?.removeEventListener("pointerdown", this.handlePointerDownBound);
        this.dismissButton?.removeEventListener("click", this.handleDismissBound);
        this.toggleButton?.removeEventListener("click", this.handleToggleBound);
        this.root?.removeEventListener("keydown", this.handleKeydownBound);
        this.root?.removeEventListener("click", this.handleRootClickBound);
        window.removeEventListener("pointermove", this.handlePointerMoveBound);
        window.removeEventListener("pointerup", this.handlePointerUpBound);
    }
    /**
     * Updates the overlay content. When the commander dismisses the current intel the
     * card stays hidden until fresh intel arrives (new signature).
     */
    update(intel) {
        if (!this.root) {
            if (intel) {
                console.debug("[SelectionIntelOverlay] Intel payload without overlay", intel);
            }
            return;
        }
        if (!intel) {
            this.lastSignature = null;
            this.activeIntel = null;
            this.hide();
            return;
        }
        const signature = JSON.stringify(intel);
        const isNewIntel = signature !== this.lastSignature;
        this.lastSignature = signature;
        if (isNewIntel) {
            this.suppressedSignature = null;
            this.activeBattleTab = "orders";
        }
        if (this.suppressedSignature === signature) {
            // Commander dismissed this exact intel; keep it hidden until new intel arrives.
            return;
        }
        this.activeIntel = intel;
        this.render(intel);
        this.show();
    }
    show() {
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
    hide() {
        if (!this.root) {
            return;
        }
        this.root.classList.add("hidden");
        this.root.setAttribute("aria-hidden", "true");
    }
    handleToggle(event) {
        event.preventDefault();
        this.collapsed = !this.collapsed;
        if (this.activeIntel) {
            this.render(this.activeIntel);
        }
        this.syncCollapsedState();
    }
    handleDismiss(event) {
        event.preventDefault();
        this.suppressedSignature = this.lastSignature;
        this.hide();
    }
    handleKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            this.suppressedSignature = this.lastSignature;
            this.hide();
        }
    }
    handleRootClick(event) {
        const target = event.target;
        const tabButton = target?.closest("[data-selection-intel-tab]");
        if (!tabButton) {
            return;
        }
        const nextTab = tabButton.dataset.selectionIntelTab;
        if (nextTab !== "orders" && nextTab !== "unit") {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.activeBattleTab = nextTab;
        if (this.activeIntel) {
            this.render(this.activeIntel);
        }
    }
    render(intel) {
        const title = this.resolveTitle(intel);
        const summary = this.composeSummary(intel);
        if (this.root) {
            this.root.dataset.intelKind = intel.kind;
            this.root.dataset.activeTab = intel.kind === "battle" ? this.activeBattleTab : "";
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
            const showNotes = this.shouldShowNotes(intel) && notes.length > 0;
            if (showNotes) {
                this.notesElement.classList.remove("hidden");
                this.notesElement.innerHTML = notes
                    .map((note) => `<p class="battle-intel-overlay__note">${this.escapeHtml(note)}</p>`)
                    .join("");
            }
            else {
                this.notesElement.classList.add("hidden");
                this.notesElement.textContent = "";
            }
        }
        window.requestAnimationFrame(() => this.clampWithinViewport());
    }
    syncCollapsedState() {
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
    handlePointerDown(event) {
        if (!this.root || !this.headerElement || event.target?.closest("button")) {
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
    handlePointerMove(event) {
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
    handlePointerUp(event) {
        if (!this.headerElement || this.activePointerId !== event.pointerId) {
            return;
        }
        this.headerElement.releasePointerCapture(event.pointerId);
        this.activePointerId = null;
        window.removeEventListener("pointermove", this.handlePointerMoveBound);
        window.removeEventListener("pointerup", this.handlePointerUpBound);
        this.clampWithinViewport();
    }
    clampWithinViewport() {
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
    resolveTitle(intel) {
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
    resolveMeta(intel) {
        const terrain = intel.terrainName ?? "Unknown terrain";
        return `${intel.hexKey} • ${terrain}`;
    }
    composeSummary(intel) {
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
    composeDeploymentSummary(intel) {
        const segments = [];
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
    composeBattleSummary(intel) {
        return this.resolveMeta(intel);
    }
    /**
     * Presents terrain intel with notes so reconnaissance overlays remain easy to scan while moving the cursor.
     */
    composeTerrainSummary(intel) {
        const segments = [];
        const terrainSegment = this.resolveMeta(intel);
        segments.push(terrainSegment);
        if (intel.notes.length > 0) {
            segments.push(intel.notes.join(", "));
        }
        return segments.join(" • ");
    }
    renderBodyMarkup(intel) {
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
    renderBattleMarkup(intel) {
        const statCards = [
            { label: "Strength", value: intel.unitStrength !== null ? `${Math.round(intel.unitStrength)}%` : "—" },
            { label: "Ammo", value: this.formatResourceValue(intel.unitAmmo) },
            { label: "Fuel", value: this.formatResourceValue(intel.unitFuel) },
            {
                label: "Move",
                value: intel.movementRemaining !== null
                    ? `${Math.max(0, Math.round(intel.movementRemaining))}${typeof intel.movementMax === "number" ? `/${Math.max(0, Math.round(intel.movementMax))}` : ""}`
                    : "—"
            },
            { label: "Range", value: intel.rangeLabel },
            { label: "Facing", value: intel.facingLabel }
        ];
        if (intel.canEntrench) {
            statCards.splice(3, 0, {
                label: "Entrench",
                value: intel.unitEntrenchment !== null ? `${Math.max(0, Math.round(intel.unitEntrenchment))}/2` : "—"
            });
        }
        const chipMarkup = intel.statusChips.length > 0
            ? `<div class="battle-intel-overlay__chip-row">${intel.statusChips.map((chip) => this.renderChipMarkup(chip)).join("")}</div>`
            : "";
        const towToggleMarkup = intel.towToggle
            ? `<div class="battle-intel-overlay__tow-toggle">
          <button
            type="button"
            class="battle-intel-overlay__tow-btn${intel.towToggle.canToggle ? "" : " disabled"}"
            data-selection-action="${intel.towToggle.toggleAction}"
            title="${this.escapeHtml(intel.towToggle.toggleTooltip)}"
            ${!intel.towToggle.canToggle ? "disabled" : ""}
          >
            ${this.escapeHtml(intel.towToggle.toggleLabel)}
          </button>
        </div>`
            : "";
        const unitTabMarkup = intel.unitTabs.length > 1 ? this.renderBattleUnitTabsMarkup(intel.unitTabs) : "";
        const tabMarkup = this.collapsed ? "" : this.renderBattleTabMarkup(intel);
        const contentMarkup = !this.collapsed && this.activeBattleTab === "unit"
            ? this.renderBattleDetailsMarkup(intel)
            : this.renderBattleActionsMarkup(intel);
        const statsStyle = `style="--battle-intel-stat-count:${statCards.length}"`;
        return `
      ${unitTabMarkup}
      <div class="battle-intel-overlay__stats" ${statsStyle}>
        ${statCards.map((stat) => `
          <article class="battle-intel-overlay__stat">
            <span class="battle-intel-overlay__stat-label">${this.escapeHtml(stat.label)}</span>
            <strong class="battle-intel-overlay__stat-value">${this.escapeHtml(stat.value)}</strong>
          </article>
        `).join("")}
      </div>
      ${chipMarkup}
      ${towToggleMarkup}
      ${tabMarkup}
      ${contentMarkup}
    `;
    }
    formatResourceValue(value) {
        if (value === null || !Number.isFinite(value)) {
            return "—";
        }
        const safeValue = Math.max(0, value);
        return safeValue.toFixed(2).replace(/\.?0+$/, "");
    }
    renderDeploymentMarkup(intel) {
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
    renderTerrainMarkup(intel) {
        const note = intel.notes[0] ?? "No unit occupies this hex.";
        return `
      <div class="battle-intel-overlay__summary-card">
        <span class="battle-intel-overlay__summary-label">Terrain Note</span>
        <strong class="battle-intel-overlay__summary-value">${this.escapeHtml(intel.terrainName ?? "Terrain Intel")}</strong>
        <span class="battle-intel-overlay__summary-caption">${this.escapeHtml(note)}</span>
      </div>
    `;
    }
    renderChipMarkup(chip) {
        return `<span class="battle-intel-overlay__chip battle-intel-overlay__chip--${chip.tone}">${this.escapeHtml(chip.label)}</span>`;
    }
    renderBattleUnitTabsMarkup(unitTabs) {
        return `
      <div class="battle-intel-overlay__unit-tabs" role="tablist" aria-label="Units on selected hex">
        ${unitTabs.map((unitTab) => `
          <button
            type="button"
            class="battle-intel-overlay__unit-tab"
            data-selection-action="selectUnit:${this.escapeHtml(unitTab.unitId)}"
            role="tab"
            aria-selected="${unitTab.selected ? "true" : "false"}"
            title="${this.escapeHtml(unitTab.label)}"
          >
            <span class="battle-intel-overlay__unit-tab-label">${this.escapeHtml(unitTab.label)}</span>
            <span class="battle-intel-overlay__unit-tab-detail">${this.escapeHtml(unitTab.detail)}</span>
          </button>
        `).join("")}
      </div>
    `;
    }
    renderActionMarkup(action) {
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
    renderBattleTabMarkup(intel) {
        const tabs = [
            { id: "orders", label: "Orders" },
            { id: "unit", label: "Unit", hidden: intel.detailSections.length === 0 }
        ];
        const visibleTabs = tabs.filter((tab) => !tab.hidden);
        if (visibleTabs.length < 2) {
            return "";
        }
        return `
      <div class="battle-intel-overlay__tabs" role="tablist" aria-label="Unit intel views">
        ${visibleTabs.map((tab) => `
          <button
            type="button"
            class="battle-intel-overlay__tab"
            data-selection-intel-tab="${tab.id}"
            role="tab"
            aria-selected="${this.activeBattleTab === tab.id ? "true" : "false"}"
          >
            ${this.escapeHtml(tab.label)}
          </button>
        `).join("")}
      </div>
    `;
    }
    renderBattleActionsMarkup(intel) {
        if (intel.actionCards.length > 0) {
            return `<div class="battle-intel-overlay__actions">${intel.actionCards.map((action) => this.renderActionMarkup(action)).join("")}</div>`;
        }
        return `<div class="battle-intel-overlay__empty">${this.escapeHtml(intel.statusMessage)}</div>`;
    }
    renderBattleDetailsMarkup(intel) {
        if (intel.detailSections.length === 0) {
            return `<div class="battle-intel-overlay__empty">Definition data is unavailable for this formation.</div>`;
        }
        return `
      <div class="battle-intel-overlay__details">
        ${intel.detailSections.map((section) => `
          <section class="battle-intel-overlay__detail-section">
            <h4 class="battle-intel-overlay__detail-title">${this.escapeHtml(section.title)}</h4>
            <div class="battle-intel-overlay__detail-grid">
              ${section.entries.map((entry) => `
                <div class="battle-intel-overlay__detail-entry">
                  <span class="battle-intel-overlay__detail-label">${this.escapeHtml(entry.label)}</span>
                  <strong class="battle-intel-overlay__detail-value">${this.escapeHtml(entry.value)}</strong>
                </div>
              `).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    `;
    }
    resolveNotes(intel) {
        switch (intel.kind) {
            case "battle":
                return intel.notes;
            case "deployment":
            case "terrain":
            default:
                return intel.notes;
        }
    }
    shouldShowNotes(intel) {
        return intel.kind !== "battle" || this.activeBattleTab === "orders";
    }
    escapeHtml(value) {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
}
