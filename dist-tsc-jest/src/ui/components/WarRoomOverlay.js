import { warRoomHotspotDefinitions } from "../../data/warRoomHotspots";
/**
 * Manages the war room overlay interface with interactive hotspots.
 * Provides an immersive command center experience with accessibility support.
 */
export class WarRoomOverlay {
    constructor(options) {
        this.hotspotButtons = [];
        this.closeListeners = new Set();
        this.activeHotspot = null;
        this.unsubscribeProvider = null;
        this.dataProvider = options.dataProvider;
        this.hotspotDefinitions = options.hotspots ?? warRoomHotspotDefinitions;
        this.overlay = this.requireElement("#warRoomOverlay");
        this.dialog = this.requireElement(".war-room-surface");
        this.announcer = this.requireElement("#warRoomAnnouncer");
        this.hotspotLayer = this.requireElement(".war-room-hotspot-layer");
        this.closeButton = this.requireElement("#warRoomClose");
        this.detailPanel = this.requireElement("#warRoomDetail");
        this.detailTitle = this.requireElement("#warRoomDetailTitle");
        this.detailMeta = this.requireElement("#warRoomDetailMeta");
        this.detailBody = this.requireElement("#warRoomDetailBody");
        this.detailCloseButton = this.requireElement("#warRoomDetailClose");
        this.commandStrip = document.querySelector("[data-war-room-command-strip]");
        this.bindEvents();
        if (typeof this.dataProvider.subscribe === "function") {
            // Listen for upstream battle state changes so the overlay refreshes while open.
            this.unsubscribeProvider = this.dataProvider.subscribe(() => this.handleProviderUpdate());
        }
    }
    /**
     * Opens the war room overlay.
     */
    open() {
        this.overlay.classList.remove("hidden");
        this.overlay.setAttribute("aria-hidden", "false");
        if (this.hotspotButtons.length === 0) {
            this.renderHotspots();
        }
        this.renderCommandStrip();
        const firstHotspot = this.hotspotButtons[0];
        if (firstHotspot) {
            firstHotspot.focus();
        }
        else {
            this.dialog.focus();
        }
        // Refresh active detail on open to ensure data reflects the latest snapshot.
        if (this.activeHotspot) {
            this.renderHotspotDetail(this.activeHotspot);
        }
    }
    /**
     * Closes the war room overlay.
     */
    close() {
        this.overlay.classList.add("hidden");
        this.overlay.setAttribute("aria-hidden", "true");
        this.announceMessage("");
        this.activeHotspot = null;
        // Ensure detail modal is hidden when overlay closes so it doesn't persist on next open.
        this.detailPanel.classList.add("hidden");
        this.closeListeners.forEach((listener) => listener());
    }
    /**
     * Announces a message to screen readers.
     */
    announceMessage(message) {
        this.announcer.textContent = message;
    }
    /**
     * Renders interactive hotspot buttons.
     */
    renderHotspots() {
        this.hotspotLayer.innerHTML = "";
        this.hotspotButtons = [];
        const fragment = document.createDocumentFragment();
        const sorted = [...this.hotspotDefinitions].sort((a, b) => a.focusOrder - b.focusOrder);
        sorted.forEach((hotspot) => {
            const button = this.createHotspotButton(hotspot);
            fragment.appendChild(button);
            this.hotspotButtons.push(button);
        });
        this.hotspotLayer.appendChild(fragment);
        // Initial badge render
        this.updateHotspotBadges();
    }
    /**
     * Creates a hotspot button element.
     */
    createHotspotButton(hotspot) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "war-room-hotspot";
        button.dataset.hotspotId = hotspot.id;
        button.style.left = `${hotspot.coords.x}%`;
        button.style.top = `${hotspot.coords.y}%`;
        button.style.width = `${hotspot.coords.width}%`;
        button.style.height = `${hotspot.coords.height}%`;
        button.setAttribute("aria-label", hotspot.label);
        // Apply clip-path for shaped hotspots to match item outlines
        if (hotspot.clipPath) {
            button.style.clipPath = hotspot.clipPath;
        }
        const descriptionId = `war-room-${hotspot.id}-desc`;
        const description = document.createElement("span");
        description.id = descriptionId;
        description.className = "sr-only";
        description.textContent = hotspot.ariaDescription;
        button.appendChild(description);
        button.setAttribute("aria-describedby", descriptionId);
        button.addEventListener("focus", () => {
            this.announceMessage(`${hotspot.label}. ${hotspot.ariaDescription}`);
        });
        button.addEventListener("click", () => {
            this.handleHotspotActivation(hotspot);
            this.renderHotspotDetail(hotspot);
        });
        return button;
    }
    /**
     * Focuses the hotspot button at the given index when available.
     */
    focusHotspotByIndex(index) {
        const clamped = Math.max(0, Math.min(index, this.hotspotButtons.length - 1));
        const target = this.hotspotButtons[clamped];
        if (target) {
            target.focus();
            const id = target.dataset.hotspotId;
            const def = id ? this.hotspotDefinitions.find((h) => h.id === id) : null;
            if (def) {
                // Brief announcement for assistive tech on keyboard navigation.
                this.announceMessage(`${def.label}. ${def.ariaDescription}`);
            }
        }
    }
    /**
     * Moves keyboard focus by a relative offset across the linear hotspot sequence.
     * Left/Up use -1; Right/Down use +1. Wraps around for seamless navigation.
     */
    moveHotspotFocus(delta) {
        if (this.hotspotButtons.length === 0)
            return;
        const active = document.activeElement;
        const idx = active ? this.hotspotButtons.indexOf(active) : -1;
        const nextIndex = idx >= 0
            ? (idx + delta + this.hotspotButtons.length) % this.hotspotButtons.length
            : delta > 0
                ? 0
                : Math.max(0, this.hotspotButtons.length - 1);
        this.focusHotspotByIndex(nextIndex);
    }
    /**
     * Returns true when the centered detail modal is visible.
     */
    isDetailOpen() {
        return !this.detailPanel.classList.contains("hidden");
    }
    /**
     * Hides the detail panel and restores focus to the previously active hotspot when possible.
     */
    closeDetail() {
        this.detailPanel.classList.add("hidden");
        if (this.activeHotspot) {
            const idx = this.hotspotButtons.findIndex((btn) => btn.dataset.hotspotId === this.activeHotspot.id);
            this.activeHotspot = null;
            if (idx >= 0) {
                this.focusHotspotByIndex(idx);
            }
        }
    }
    /**
     * Handles hotspot activation (click/enter).
     */
    handleHotspotActivation(hotspot) {
        this.activeHotspot = hotspot;
        const summary = this.getWarRoomSummary(hotspot);
        const messageSegments = [hotspot.label];
        if (hotspot.statusAnnouncer) {
            messageSegments.push(hotspot.statusAnnouncer);
        }
        if (summary) {
            messageSegments.push(summary);
        }
        this.announceMessage(messageSegments.join(" "));
    }
    /**
     * Generates summary text for a hotspot based on war room data.
     */
    getWarRoomSummary(hotspot) {
        const warRoomData = this.getWarRoomData();
        const payload = warRoomData[hotspot.dataKey];
        switch (hotspot.dataKey) {
            case "intelBriefs": {
                const entry = payload[0];
                if (!entry) {
                    return "No intel briefs on record.";
                }
                return `${entry.title}. ${entry.summary}`;
            }
            case "reconReports": {
                const report = payload[0];
                if (!report) {
                    return "No recon reports available.";
                }
                return `${report.sector}. ${report.finding}`;
            }
            case "supplyStatus": {
                const status = payload;
                return `${status.status.toUpperCase()} status. ${status.note}`;
            }
            case "requisitions": {
                const request = payload[0];
                if (!request) {
                    return "No requisitions in queue.";
                }
                return `${request.item}. ${request.status.toUpperCase()} as of ${request.updatedAt}.`;
            }
            case "casualtyLedger": {
                const ledger = payload;
                const personnel = ledger.personnelCasualties ?? ledger.kia + ledger.wia + ledger.mia;
                const equipment = (ledger.equipmentDamaged ?? 0) + (ledger.equipmentDisabled ?? 0) + (ledger.equipmentDestroyed ?? 0);
                return `KIA ${ledger.kia}, WIA ${ledger.wia}, equipment effects ${equipment}, affected units ${ledger.affectedUnits ?? 0}. Updated ${ledger.updatedAt}. Personnel casualties ${personnel}.`;
            }
            case "engagementLog": {
                const engagement = payload[0];
                if (!engagement) {
                    return "No engagements logged.";
                }
                return `${engagement.theater}. ${engagement.result.toUpperCase()} - ${engagement.note}`;
            }
            case "logisticsSummary": {
                const digest = payload;
                const extra = digest.bottleneck ? ` Bottleneck: ${digest.bottleneck}.` : "";
                return `${digest.throughput}.${extra}`.trim();
            }
            case "commandOrders": {
                const directive = payload[0];
                if (!directive) {
                    return "No active directives.";
                }
                return `${directive.title}. ${directive.objective}`;
            }
            case "readinessState": {
                const readiness = payload;
                return `${readiness.level.toUpperCase()} readiness. ${readiness.comment}`;
            }
            case "campaignClock": {
                const timing = payload;
                return `Day ${timing.day}, ${timing.time}. ${timing.note}`;
            }
            default:
                return "";
        }
    }
    /**
     * Retrieves hotspot definitions from the shared data module.
     */
    getHotspotDefinitions() {
        return this.hotspotDefinitions;
    }
    /**
     * Retrieves war room data.
     * TODO: Wire to actual data source (state management, API, etc.)
     * For now, returns sample data for development.
     */
    getWarRoomData() {
        return this.dataProvider.getSnapshot();
    }
    /**
     * Binds event handlers.
     */
    bindEvents() {
        this.closeButton.addEventListener("click", () => this.close());
        this.overlay.addEventListener("click", (event) => {
            if (event.target === this.overlay) {
                this.close();
            }
        });
        // Close the detail panel via its own X button.
        this.detailCloseButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.closeDetail();
        });
        this.detailBody.addEventListener("click", (event) => {
            const actionButton = event.target.closest("[data-war-room-action]");
            if (!actionButton) {
                return;
            }
            const action = actionButton.dataset.warRoomAction ?? "";
            if (action === "open-battle-requisitions") {
                event.preventDefault();
                event.stopPropagation();
                document.dispatchEvent(new CustomEvent("warroom:openBattleRequisitions"));
            }
        });
        // Clicking anywhere on the surface that is not inside the detail panel or a hotspot closes the detail panel.
        this.dialog.addEventListener("click", (event) => {
            if (!this.isDetailOpen())
                return;
            const target = event.target;
            if (!target)
                return;
            if (this.detailPanel.contains(target))
                return;
            if (target.closest(".war-room-hotspot"))
                return;
            this.closeDetail();
        });
        // Keyboard shortcuts for quick navigation; Escape closes the detail first, then the overlay.
        this.overlay.addEventListener("keydown", (event) => {
            const e = event;
            switch (e.key) {
                case "Escape":
                    if (this.isDetailOpen()) {
                        this.closeDetail();
                    }
                    else {
                        this.close();
                    }
                    break;
                case "ArrowLeft":
                case "ArrowUp":
                    this.moveHotspotFocus(-1);
                    e.preventDefault();
                    break;
                case "ArrowRight":
                case "ArrowDown":
                    this.moveHotspotFocus(1);
                    e.preventDefault();
                    break;
                case "Home":
                    this.focusHotspotByIndex(0);
                    e.preventDefault();
                    break;
                case "End":
                    this.focusHotspotByIndex(Math.max(0, this.hotspotButtons.length - 1));
                    e.preventDefault();
                    break;
                default:
                    break;
            }
        });
    }
    /**
     * Renders the detail panel with extended information for the selected hotspot.
     */
    renderHotspotDetail(hotspot) {
        this.activeHotspot = hotspot;
        const warRoomData = this.getWarRoomData();
        const payload = warRoomData[hotspot.dataKey];
        this.detailTitle.textContent = hotspot.label;
        this.detailMeta.textContent = this.buildDetailMeta(hotspot);
        this.detailBody.innerHTML = this.buildDetailBody(hotspot, payload);
        this.detailPanel.classList.remove("hidden");
        // After rendering details, also refresh the small badges so numbers remain consistent.
        this.updateHotspotBadges();
    }
    /**
     * Builds the meta line that appears beneath the detail title.
     */
    buildDetailMeta(hotspot) {
        const status = hotspot.statusAnnouncer ?? "Status pending";
        return `${status}`;
    }
    /**
     * Renders a small badge string for a hotspot representing a quick-glance metric.
     * Returns an empty string when no badge is relevant.
     */
    buildHotspotBadge(hotspot) {
        const data = this.getWarRoomData();
        const payload = data[hotspot.dataKey];
        switch (hotspot.dataKey) {
            case "intelBriefs": {
                const briefs = payload ?? [];
                return `${briefs.length} briefs`;
            }
            case "reconReports": {
                const reports = payload ?? [];
                return `${reports.length} reports`;
            }
            case "supplyStatus": {
                const s = payload ?? { status: "adequate" };
                return s.status.toUpperCase();
            }
            case "requisitions": {
                const reqs = (payload ?? []);
                const pending = reqs.filter((r) => r.status === "pending").length;
                return pending > 0 ? `${pending} pending` : `${reqs.length}`;
            }
            case "casualtyLedger": {
                const ledger = payload ?? { kia: 0, wia: 0, mia: 0 };
                const personnel = ledger.personnelCasualties ?? ledger.kia + ledger.wia + ledger.mia;
                const equipment = (ledger.equipmentDamaged ?? 0) + (ledger.equipmentDisabled ?? 0) + (ledger.equipmentDestroyed ?? 0);
                return personnel > 0 || equipment > 0 ? `P ${personnel} / Eq ${equipment}` : "Clear";
            }
            case "engagementLog": {
                const logs = payload ?? [];
                return `${logs.length}`;
            }
            case "logisticsSummary": {
                const digest = payload;
                return typeof digest?.efficiency === "number" ? `${digest.efficiency}% eff` : "";
            }
            case "commandOrders": {
                const directives = payload ?? [];
                return `${directives.length}`;
            }
            case "readinessState": {
                const r = payload;
                return typeof r?.percentage === "number" ? `${r.percentage}%` : (r?.level?.toUpperCase() ?? "");
            }
            case "campaignClock": {
                const c = payload;
                return c?.day ? `Day ${c.day}` : "";
            }
            default:
                return "";
        }
    }
    /**
     * Updates all hotspot badges using the latest provider snapshot.
     */
    updateHotspotBadges() {
        const container = this.hotspotLayer;
        const buttons = Array.from(container.querySelectorAll(".war-room-hotspot"));
        buttons.forEach((btn) => {
            const id = btn.dataset.hotspotId ?? "";
            const def = this.hotspotDefinitions.find((h) => h.id === id);
            if (!def)
                return;
            const badgeText = this.buildHotspotBadge(def);
            let badge = btn.querySelector(".war-room-badge");
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "war-room-badge";
                btn.appendChild(badge);
            }
            badge.textContent = badgeText;
            badge.toggleAttribute("hidden", badgeText.length === 0);
        });
    }
    renderCommandStrip() {
        if (!this.commandStrip) {
            return;
        }
        const data = this.getWarRoomData();
        const supply = data.supplyStatus;
        const logistics = data.logisticsSummary;
        const readiness = data.readinessState;
        const casualties = data.casualtyLedger;
        const clock = data.campaignClock;
        const supplyClass = supply.status === "critical" || supply.status === "low"
            ? ` war-room-command-chip--${supply.status}`
            : "";
        const damageChipClass = (casualties.criticalUnits ?? 0) > 0 || (casualties.destroyedUnits ?? 0) > 0
            ? " war-room-command-chip--critical"
            : (casualties.affectedUnits ?? 0) > 0
                ? " war-room-command-chip--low"
                : "";
        this.commandStrip.innerHTML = `
      <div class="war-room-command-chip">
        <span>Headquarters</span>
        <strong>${this.escapeHtml(clock.note || `Turn ${clock.day}`)}</strong>
      </div>
      <div class="war-room-command-chip${supplyClass}">
        <span>Supply</span>
        <strong>${this.escapeHtml(supply.status.toUpperCase())}</strong>
      </div>
      <div class="war-room-command-chip">
        <span>Ammo</span>
        <strong>${this.formatNumber(supply.ammoTotal ?? 0)}</strong>
      </div>
      <div class="war-room-command-chip">
        <span>Fuel</span>
        <strong>${this.formatNumber(supply.fuelTotal ?? 0)}</strong>
      </div>
      <div class="war-room-command-chip">
        <span>Convoys</span>
        <strong>${this.formatNumber(logistics.loadedConvoys ?? 0)}/${this.formatNumber(logistics.convoyCount ?? 0)}</strong>
      </div>
      <div class="war-room-command-chip">
        <span>Ready</span>
        <strong>${typeof readiness.percentage === "number" ? `${readiness.percentage}%` : this.escapeHtml(readiness.level.toUpperCase())}</strong>
      </div>
      <div class="war-room-command-chip${damageChipClass}">
        <span>Damage</span>
        <strong>${this.formatNumber(casualties.wia ?? 0)} WIA / ${this.formatNumber(casualties.kia ?? 0)} KIA</strong>
      </div>
    `;
    }
    /**
     * Builds the rich HTML body for the detail panel based on hotspot data payloads.
     */
    buildDetailBody(hotspot, payload) {
        switch (hotspot.dataKey) {
            case "intelBriefs": {
                // Present each intelligence brief with source metadata so planners can gauge reliability quickly.
                const entries = payload ?? [];
                if (entries.length === 0) {
                    return `<p class="war-room-empty">No intelligence briefs are on file yet.</p>`;
                }
                return entries
                    .map((entry) => `
              <article class="war-room-intel">
                <h4>${this.escapeHtml(entry.title)}</h4>
                <p>${this.escapeHtml(entry.summary)}</p>
                <p class="war-room-intel-meta">${this.escapeHtml(entry.source ?? "Unknown source")} • ${this.escapeHtml(entry.timestamp ?? "No timestamp")}</p>
              </article>
            `)
                    .join("");
            }
            case "reconReports": {
                // Render recon spot-reports emphasizing findings and analyst confidence.
                const reports = payload ?? [];
                if (reports.length === 0) {
                    return `<p class="war-room-empty">Recon elements have not submitted any field reports.</p>`;
                }
                return reports
                    .map((report) => `
              <article class="war-room-recon">
                <h4>${this.escapeHtml(report.sector)}</h4>
                <p>${this.escapeHtml(report.finding)}</p>
                <p class="war-room-recon-meta">Confidence: ${this.escapeHtml(report.confidence ?? "Unknown")} • ${this.escapeHtml(report.timestamp ?? "No timestamp")}</p>
              </article>
            `)
                    .join("");
            }
            case "logisticsSummary": {
                const digest = payload ?? { throughput: "No logistics data available." };
                return `
          <section class="war-room-logistics">
            <div class="war-room-kpi-grid">
              <div class="war-room-kpi"><span>Convoys</span><strong>${this.formatNumber(digest.loadedConvoys ?? 0)}/${this.formatNumber(digest.convoyCount ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Queue</span><strong>${this.formatNumber(digest.queueCount ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Isolated</span><strong>${this.formatNumber(digest.isolatedUnits ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Network</span><strong>${typeof digest.efficiency === "number" ? `${digest.efficiency}%` : "N/A"}</strong></div>
              <div class="war-room-kpi"><span>Support Teams</span><strong>${this.formatNumber(digest.supportTeamCount ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Care Queue</span><strong>${this.formatNumber(digest.careRequestCount ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Medical</span><strong>${this.formatNumber(digest.medicalRequestCount ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Repair</span><strong>${this.formatNumber(digest.repairRequestCount ?? 0)}</strong></div>
            </div>
            <p>${this.escapeHtml(digest.throughput)}</p>
            ${digest.bottleneck ? `<p><span class="war-room-status-pill">Bottleneck</span></p><p>${this.escapeHtml(digest.bottleneck)}</p>` : ""}
          </section>
        `;
            }
            case "supplyStatus": {
                const status = payload ?? { status: "adequate", note: "No supply data available." };
                const ammo = Math.max(0, status.ammoTotal ?? 0);
                const fuel = Math.max(0, status.fuelTotal ?? 0);
                const depot = Math.max(0, (status.depotAmmo ?? 0) + (status.depotFuel ?? 0));
                const total = Math.max(1, ammo + fuel + depot);
                const ammoWidth = Math.max(0, Math.min(100, (ammo / total) * 100));
                const fuelWidth = Math.max(0, Math.min(100 - ammoWidth, (fuel / total) * 100));
                const depotWidth = Math.max(0, 100 - ammoWidth - fuelWidth);
                return `
          <section class="war-room-supply">
            <p><span class="war-room-status-pill">${this.escapeHtml(status.status.toUpperCase())}</span></p>
            <div class="war-room-kpi-grid">
              <div class="war-room-kpi"><span>Ammo Total</span><strong>${this.formatNumber(status.ammoTotal ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Fuel Total</span><strong>${this.formatNumber(status.fuelTotal ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Depot</span><strong>${this.formatNumber(depot)}</strong></div>
              <div class="war-room-kpi"><span>Burn</span><strong>${this.formatNumber(status.consumptionRate ?? 0)}</strong></div>
            </div>
            <div class="war-room-meter" role="img" aria-label="Supply split">
              <span class="war-room-meter__ammo" style="width: ${ammoWidth}%"></span>
              <span class="war-room-meter__fuel" style="width: ${fuelWidth}%"></span>
              <span class="war-room-meter__reserve" style="width: ${depotWidth}%"></span>
            </div>
            <p>${this.escapeHtml(status.note)}</p>
          </section>
        `;
            }
            case "commandOrders": {
                // List actionable directives and expose placeholder action buttons for future command hooks.
                const directives = payload ?? [];
                if (directives.length === 0) {
                    return `<p class="war-room-empty">No active directives have been issued.</p>`;
                }
                return directives
                    .map((directive) => `
              <article class="war-room-order">
                <h4>${this.escapeHtml(directive.title)}</h4>
                <p>${this.escapeHtml(directive.objective)}</p>
                <footer class="war-room-order-footer">
                  <span class="war-room-order-priority">Priority: ${this.escapeHtml(directive.priority ?? "unspecified")}</span>
                  <button type="button" class="war-room-action" data-war-room-action="acknowledge-directive">
                    Acknowledge
                  </button>
                </footer>
              </article>
            `)
                    .join("");
            }
            case "requisitions": {
                // Display outstanding requisitions in a tabular layout to show fulfillment status at a glance.
                const requisitions = payload ?? [];
                const rows = requisitions.length > 0
                    ? requisitions
                        .map((req) => `
                <tr>
                  <th scope="row">${this.escapeHtml(req.item)}</th>
                  <td>${this.escapeHtml(req.quantity ?? "N/A")}</td>
                  <td>${this.escapeHtml(req.status.toUpperCase())}</td>
                  <td>${this.escapeHtml(req.requestedBy ?? "Anonymous")}</td>
                  <td>${this.escapeHtml(req.updatedAt)}</td>
                </tr>
              `)
                        .join("")
                    : "";
                const tableMarkup = requisitions.length > 0
                    ? `
            <table>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Status</th>
                  <th scope="col">Requested By</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `
                    : "";
                return `
          <section class="war-room-requisitions">
            <p>
              <button type="button" class="war-room-action" data-war-room-action="open-battle-requisitions">
                Open Battle Requisitions
              </button>
            </p>
            ${requisitions.length === 0 ? '<p class="war-room-empty">All requisitions are fulfilled.</p>' : ""}
            ${tableMarkup}
          </section>
        `;
            }
            case "casualtyLedger": {
                const ledger = payload ?? { kia: 0, wia: 0, mia: 0, updatedAt: "" };
                const personnelCasualties = ledger.personnelCasualties ?? ledger.kia + ledger.wia + ledger.mia;
                const nonEffective = ledger.nonEffectivePersonnel ?? ledger.kia + (ledger.wounded ?? 0) + (ledger.severelyWounded ?? 0);
                const equipmentAffected = (ledger.equipmentDamaged ?? 0) + (ledger.equipmentDisabled ?? 0) + (ledger.equipmentDestroyed ?? 0);
                return `
          <section class="war-room-casualties">
            <ul class="war-room-metric-cards">
              <li><span class="label">KIA</span><span class="value">${ledger.kia}</span></li>
              <li><span class="label">WIA</span><span class="value">${ledger.wia}</span></li>
              <li><span class="label">MIA</span><span class="value">${ledger.mia}</span></li>
              <li><span class="label">Non-Effective</span><span class="value">${this.formatNumber(nonEffective)}</span></li>
              <li><span class="label">Affected Units</span><span class="value">${this.formatNumber(ledger.affectedUnits ?? 0)}</span></li>
              <li><span class="label">Critical Units</span><span class="value">${this.formatNumber(ledger.criticalUnits ?? 0)}</span></li>
            </ul>
            <div class="war-room-kpi-grid">
              <div class="war-room-kpi"><span>Injured</span><strong>${this.formatNumber(ledger.injured ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Wounded</span><strong>${this.formatNumber(ledger.wounded ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Severe</span><strong>${this.formatNumber(ledger.severelyWounded ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Personnel Effects</span><strong>${this.formatNumber(personnelCasualties)}</strong></div>
              <div class="war-room-kpi"><span>Damaged</span><strong>${this.formatNumber(ledger.equipmentDamaged ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Disabled</span><strong>${this.formatNumber(ledger.equipmentDisabled ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Destroyed</span><strong>${this.formatNumber(ledger.equipmentDestroyed ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Equipment Effects</span><strong>${this.formatNumber(equipmentAffected)}</strong></div>
            </div>
            <p>Personnel readiness uses fit, injured, wounded, severe, and KIA status pools. Equipment readiness uses operational, damaged, disabled, and destroyed vehicle pools.</p>
            <p class="war-room-updated">Updated ${this.escapeHtml(ledger.updatedAt)}</p>
          </section>
        `;
            }
            case "engagementLog": {
                // Render a timeline of recent engagements with outcomes and casualty context.
                const engagements = payload ?? [];
                if (engagements.length === 0) {
                    return `<p class="war-room-empty">No combat engagements have been logged yet.</p>`;
                }
                return `
          <ol class="war-room-engagements">
            ${engagements
                    .map((entry) => `
                  <li>
                    <h4>${this.escapeHtml(entry.theater)}</h4>
                    <p>Result: <strong>${this.escapeHtml(entry.result.toUpperCase())}</strong></p>
                    <p>${this.escapeHtml(entry.note)}</p>
                    ${entry.damageSummary ? `<p>${this.escapeHtml(entry.damageSummary)}</p>` : ""}
                    <p class="war-room-engagement-meta">${this.escapeHtml(entry.timestamp ?? "Pending timestamp")} • Personnel effects: ${this.escapeHtml(entry.personnelCasualties ?? entry.casualties ?? "N/A")} • Equipment effects: ${this.escapeHtml(entry.equipmentLosses ?? "N/A")}</p>
                  </li>
                `)
                    .join("")}
          </ol>
        `;
            }
            case "readinessState": {
                const readiness = payload ?? { level: "preparing", comment: "Readiness data pending." };
                const percentage = typeof readiness.percentage === "number" ? Math.max(0, Math.min(100, readiness.percentage)) : 0;
                return `
          <section class="war-room-readiness">
            <p><span class="war-room-status-pill">${this.escapeHtml(readiness.level.toUpperCase())}</span></p>
            <div class="war-room-kpi-grid">
              <div class="war-room-kpi"><span>Readiness</span><strong>${typeof readiness.percentage === "number" ? `${percentage}%` : "Pending"}</strong></div>
              <div class="war-room-kpi"><span>Strength</span><strong>${typeof readiness.averageStrength === "number" ? `${readiness.averageStrength}%` : "N/A"}</strong></div>
              <div class="war-room-kpi"><span>Personnel</span><strong>${typeof readiness.personnelReadiness === "number" ? `${readiness.personnelReadiness}%` : "N/A"}</strong></div>
              <div class="war-room-kpi"><span>Equipment</span><strong>${typeof readiness.equipmentReadiness === "number" ? `${readiness.equipmentReadiness}%` : "N/A"}</strong></div>
              <div class="war-room-kpi"><span>Affected</span><strong>${this.formatNumber(readiness.affectedUnits ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Degraded</span><strong>${this.formatNumber(readiness.degradedUnits ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Critical</span><strong>${this.formatNumber(readiness.criticalUnits ?? 0)}</strong></div>
              <div class="war-room-kpi"><span>Suppressed</span><strong>${this.formatNumber(readiness.suppressedUnits ?? 0)}</strong></div>
            </div>
            <div class="war-room-meter" role="img" aria-label="Readiness ${percentage}%">
              <span class="war-room-meter__ammo" style="width: ${percentage}%"></span>
            </div>
            <p>${this.escapeHtml(readiness.comment)}</p>
          </section>
        `;
            }
            case "campaignClock": {
                // Highlight campaign tempo so planners understand current operational window.
                const clock = payload ?? { day: 1, time: "0600", note: "", phase: "" };
                const phaseLine = clock.phase ? `<p class="war-room-phase">Current Phase: ${this.escapeHtml(clock.phase)}</p>` : "";
                return `
          <section class="war-room-clock">
            <p class="war-room-day">Day ${this.escapeHtml(clock.day)}</p>
            <p class="war-room-time">${this.escapeHtml(clock.time)}</p>
            <p>${this.escapeHtml(clock.note)}</p>
            ${phaseLine}
          </section>
        `;
            }
            default:
                return `<p>No additional details recorded for ${this.escapeHtml(hotspot.label)}.</p>`;
        }
    }
    /**
     * Helper to require an element from the DOM.
     */
    requireElement(selector) {
        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Required element not found: ${selector}`);
        }
        return element;
    }
    escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    formatNumber(value) {
        if (!Number.isFinite(value)) {
            return "0";
        }
        return Number(value.toFixed(1)).toString();
    }
    /**
     * Registers a listener that fires whenever the overlay fully closes.
     */
    registerCloseListener(listener) {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }
    /**
     * Clears the provider subscription when this component is no longer needed.
     */
    dispose() {
        this.closeListeners.clear();
        if (this.unsubscribeProvider) {
            this.unsubscribeProvider();
            this.unsubscribeProvider = null;
        }
        if (typeof this.dataProvider.dispose === "function") {
            this.dataProvider.dispose();
        }
    }
    /**
     * Reacts to provider updates by refreshing the active hotspot detail without forcing the overlay open.
     */
    handleProviderUpdate() {
        if (this.overlay.getAttribute("aria-hidden") === "true") {
            return;
        }
        this.renderCommandStrip();
        if (this.activeHotspot) {
            this.renderHotspotDetail(this.activeHotspot);
        }
        else {
            // Even if no detail is open, keep badges in sync with live data.
            this.updateHotspotBadges();
        }
    }
}
