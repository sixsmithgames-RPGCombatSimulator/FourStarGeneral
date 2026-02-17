import type {
  WarRoomData,
  WarRoomDataKey,
  IntelBrief,
  ReconReport,
  SupplySummary,
  RequisitionRecord,
  CasualtySummary,
  EngagementSummary,
  LogisticsDigest,
  CommandDirective,
  ReadinessStatus,
  CampaignTiming
} from "../../data/warRoomTypes";
import { warRoomHotspotDefinitions } from "../../data/warRoomHotspots";
import type { WarRoomDataProvider } from "./WarRoomDataProvider";

/**
 * Hotspot definition for interactive war room elements.
 */
export interface WarRoomHotspot {
  id: string;
  label: string;
  ariaDescription: string;
  statusAnnouncer?: string;
  coords: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  focusOrder: number;
  dataKey: WarRoomDataKey;
}

interface WarRoomOverlayOptions {
  /** Supplies current war room content and publishes updates when battle state changes. */
  dataProvider: WarRoomDataProvider;
  /** Allows scenarios to override hotspot layout; defaults to the shared registry. */
  hotspots?: ReadonlyArray<WarRoomHotspot>;
}

/**
 * Manages the war room overlay interface with interactive hotspots.
 * Provides an immersive command center experience with accessibility support.
 */
export class WarRoomOverlay {
  private hotspotButtons: HTMLButtonElement[] = [];

  private readonly dataProvider: WarRoomDataProvider;
  private readonly hotspotDefinitions: ReadonlyArray<WarRoomHotspot>;
  private readonly closeListeners = new Set<() => void>();
  private activeHotspot: WarRoomHotspot | null = null;
  private unsubscribeProvider: (() => void) | null = null;

  // DOM element references
  private readonly overlay: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly announcer: HTMLElement;
  private readonly hotspotLayer: HTMLElement;
  private readonly closeButton: HTMLElement;
  private readonly detailPanel: HTMLElement;
  private readonly detailTitle: HTMLElement;
  private readonly detailMeta: HTMLElement;
  private readonly detailBody: HTMLElement;
  private readonly detailCloseButton: HTMLElement;

  constructor(options: WarRoomOverlayOptions) {
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

    this.bindEvents();

    if (typeof this.dataProvider.subscribe === "function") {
      // Listen for upstream battle state changes so the overlay refreshes while open.
      this.unsubscribeProvider = this.dataProvider.subscribe(() => this.handleProviderUpdate());
    }
  }

  /**
   * Opens the war room overlay.
   */
  open(): void {
    this.overlay.classList.remove("hidden");
    this.overlay.setAttribute("aria-hidden", "false");

    if (this.hotspotButtons.length === 0) {
      this.renderHotspots();
    }

    const firstHotspot = this.hotspotButtons[0];
    if (firstHotspot) {
      firstHotspot.focus();
    } else {
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
  close(): void {
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
  announceMessage(message: string): void {
    this.announcer.textContent = message;
  }

  /**
   * Renders interactive hotspot buttons.
   */
  renderHotspots(): void {
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
  private createHotspotButton(hotspot: WarRoomHotspot): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "war-room-hotspot";
    button.dataset.hotspotId = hotspot.id;
    button.style.left = `${hotspot.coords.x}%`;
    button.style.top = `${hotspot.coords.y}%`;
    button.style.width = `${hotspot.coords.width}%`;
    button.style.height = `${hotspot.coords.height}%`;
    button.setAttribute("aria-label", hotspot.label);

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
  private focusHotspotByIndex(index: number): void {
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
  private moveHotspotFocus(delta: number): void {
    if (this.hotspotButtons.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? this.hotspotButtons.indexOf(active as HTMLButtonElement) : -1;
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
  private isDetailOpen(): boolean {
    return !this.detailPanel.classList.contains("hidden");
  }

  /**
   * Hides the detail panel and restores focus to the previously active hotspot when possible.
   */
  private closeDetail(): void {
    this.detailPanel.classList.add("hidden");
    if (this.activeHotspot) {
      const idx = this.hotspotButtons.findIndex((btn) => btn.dataset.hotspotId === this.activeHotspot!.id);
      this.activeHotspot = null;
      if (idx >= 0) {
        this.focusHotspotByIndex(idx);
      }
    }
  }

  /**
   * Handles hotspot activation (click/enter).
   */
  private handleHotspotActivation(hotspot: WarRoomHotspot): void {
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
  private getWarRoomSummary(hotspot: WarRoomHotspot): string {
    const warRoomData = this.getWarRoomData();
    const payload = warRoomData[hotspot.dataKey];

    switch (hotspot.dataKey) {
      case "intelBriefs": {
        const entry = (payload as IntelBrief[])[0];
        if (!entry) {
          return "No intel briefs on record.";
        }
        return `${entry.title}. ${entry.summary}`;
      }
      case "reconReports": {
        const report = (payload as ReconReport[])[0];
        if (!report) {
          return "No recon reports available.";
        }
        return `${report.sector}. ${report.finding}`;
      }
      case "supplyStatus": {
        const status = payload as SupplySummary;
        return `${status.status.toUpperCase()} status. ${status.note}`;
      }
      case "requisitions": {
        const request = (payload as RequisitionRecord[])[0];
        if (!request) {
          return "No requisitions in queue.";
        }
        return `${request.item}. ${request.status.toUpperCase()} as of ${request.updatedAt}.`;
      }
      case "casualtyLedger": {
        const ledger = payload as CasualtySummary;
        return `KIA ${ledger.kia}, WIA ${ledger.wia}, MIA ${ledger.mia}. Updated ${ledger.updatedAt}.`;
      }
      case "engagementLog": {
        const engagement = (payload as EngagementSummary[])[0];
        if (!engagement) {
          return "No engagements logged.";
        }
        return `${engagement.theater}. ${engagement.result.toUpperCase()} - ${engagement.note}`;
      }
      case "logisticsSummary": {
        const digest = payload as LogisticsDigest;
        const extra = digest.bottleneck ? ` Bottleneck: ${digest.bottleneck}.` : "";
        return `${digest.throughput}.${extra}`.trim();
      }
      case "commandOrders": {
        const directive = (payload as CommandDirective[])[0];
        if (!directive) {
          return "No active directives.";
        }
        return `${directive.title}. ${directive.objective}`;
      }
      case "readinessState": {
        const readiness = payload as ReadinessStatus;
        return `${readiness.level.toUpperCase()} readiness. ${readiness.comment}`;
      }
      case "campaignClock": {
        const timing = payload as CampaignTiming;
        return `Day ${timing.day}, ${timing.time}. ${timing.note}`;
      }
      default:
        return "";
    }
  }

  /**
   * Retrieves hotspot definitions from the shared data module.
   */
  private getHotspotDefinitions(): WarRoomHotspot[] {
    return this.hotspotDefinitions as WarRoomHotspot[];
  }

  /**
   * Retrieves war room data.
   * TODO: Wire to actual data source (state management, API, etc.)
   * For now, returns sample data for development.
   */
  private getWarRoomData(): WarRoomData {
    return this.dataProvider.getSnapshot();
  }

  /**
   * Binds event handlers.
   */
  private bindEvents(): void {
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

    // Clicking anywhere on the surface that is not inside the detail panel or a hotspot closes the detail panel.
    this.dialog.addEventListener("click", (event) => {
      if (!this.isDetailOpen()) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (this.detailPanel.contains(target)) return;
      if (target.closest(".war-room-hotspot")) return;
      this.closeDetail();
    });

    // Keyboard shortcuts for quick navigation; Escape closes the detail first, then the overlay.
    this.overlay.addEventListener("keydown", (event) => {
      const e = event as KeyboardEvent;
      switch (e.key) {
        case "Escape":
          if (this.isDetailOpen()) {
            this.closeDetail();
          } else {
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
  private renderHotspotDetail(hotspot: WarRoomHotspot): void {
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
  private buildDetailMeta(hotspot: WarRoomHotspot): string {
    const status = hotspot.statusAnnouncer ?? "Status pending";
    return `${status}`;
  }

  /**
   * Renders a small badge string for a hotspot representing a quick-glance metric.
   * Returns an empty string when no badge is relevant.
   */
  private buildHotspotBadge(hotspot: WarRoomHotspot): string {
    const data = this.getWarRoomData();
    const payload = data[hotspot.dataKey] as unknown;
    switch (hotspot.dataKey) {
      case "intelBriefs": {
        const briefs = (payload as IntelBrief[]) ?? [];
        return `${briefs.length} briefs`;
      }
      case "reconReports": {
        const reports = (payload as ReconReport[]) ?? [];
        return `${reports.length} reports`;
      }
      case "supplyStatus": {
        const s = (payload as SupplySummary) ?? { status: "adequate" };
        return s.status.toUpperCase();
      }
      case "requisitions": {
        const reqs = ((payload as RequisitionRecord[]) ?? []);
        const pending = reqs.filter((r) => r.status === "pending").length;
        return pending > 0 ? `${pending} pending` : `${reqs.length}`;
      }
      case "casualtyLedger": {
        const ledger = (payload as CasualtySummary) ?? { kia: 0, wia: 0, mia: 0 };
        return `KIA ${ledger.kia}`;
      }
      case "engagementLog": {
        const logs = (payload as EngagementSummary[]) ?? [];
        return `${logs.length}`;
      }
      case "logisticsSummary": {
        const digest = payload as LogisticsDigest | undefined;
        return typeof digest?.efficiency === "number" ? `${digest.efficiency}% eff` : "";
      }
      case "commandOrders": {
        const directives = (payload as CommandDirective[]) ?? [];
        return `${directives.length}`;
      }
      case "readinessState": {
        const r = payload as ReadinessStatus | undefined;
        return typeof r?.percentage === "number" ? `${r.percentage}%` : (r?.level?.toUpperCase() ?? "");
      }
      case "campaignClock": {
        const c = payload as CampaignTiming | undefined;
        return c?.day ? `Day ${c.day}` : "";
      }
      default:
        return "";
    }
  }

  /**
   * Updates all hotspot badges using the latest provider snapshot.
   */
  private updateHotspotBadges(): void {
    const container = this.hotspotLayer;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".war-room-hotspot"));
    buttons.forEach((btn) => {
      const id = btn.dataset.hotspotId ?? "";
      const def = this.hotspotDefinitions.find((h) => h.id === id);
      if (!def) return;
      const badgeText = this.buildHotspotBadge(def);
      let badge = btn.querySelector<HTMLElement>(".war-room-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "war-room-badge";
        btn.appendChild(badge);
      }
      badge.textContent = badgeText;
      badge.toggleAttribute("hidden", badgeText.length === 0);
    });
  }

  /**
   * Builds the rich HTML body for the detail panel based on hotspot data payloads.
   */
  private buildDetailBody(hotspot: WarRoomHotspot, payload: unknown): string {
    switch (hotspot.dataKey) {
      case "intelBriefs": {
        // Present each intelligence brief with source metadata so planners can gauge reliability quickly.
        const entries = (payload as IntelBrief[]) ?? [];
        if (entries.length === 0) {
          return `<p class="war-room-empty">No intelligence briefs are on file yet.</p>`;
        }
        return entries
          .map(
            (entry) => `
              <article class="war-room-intel">
                <h4>${entry.title}</h4>
                <p>${entry.summary}</p>
                <p class="war-room-intel-meta">${entry.source ?? "Unknown source"} • ${entry.timestamp ?? "No timestamp"}</p>
              </article>
            `
          )
          .join("");
      }
      case "reconReports": {
        // Render recon spot-reports emphasizing findings and analyst confidence.
        const reports = (payload as ReconReport[]) ?? [];
        if (reports.length === 0) {
          return `<p class="war-room-empty">Recon elements have not submitted any field reports.</p>`;
        }
        return reports
          .map(
            (report) => `
              <article class="war-room-recon">
                <h4>${report.sector}</h4>
                <p>${report.finding}</p>
                <p class="war-room-recon-meta">Confidence: ${report.confidence ?? "Unknown"} • ${report.timestamp ?? "No timestamp"}</p>
              </article>
            `
          )
          .join("");
      }
      case "logisticsSummary": {
        // Summarize logistics posture in a compact table so commanders can spot bottlenecks.
        const digest = (payload as LogisticsDigest) ?? { throughput: "No logistics data available." };
        const bottleneckRow = digest.bottleneck
          ? `<tr><th scope="row">Bottleneck</th><td>${digest.bottleneck}</td></tr>`
          : "";
        const efficiencyRow = typeof digest.efficiency === "number"
          ? `<tr><th scope="row">Efficiency</th><td>${digest.efficiency}%</td></tr>`
          : "";
        return `
          <section class="war-room-logistics">
            <table>
              <tbody>
                <tr><th scope="row">Throughput</th><td>${digest.throughput}</td></tr>
                ${bottleneckRow}
                ${efficiencyRow}
              </tbody>
            </table>
          </section>
        `;
      }
      case "supplyStatus": {
        // Provide supply state with supporting detail so shortages stand out.
        const status = (payload as SupplySummary) ?? { status: "adequate", note: "No supply data available." };
        const stockLine = typeof status.stockLevel === "number" ? `<li>Stock Level: ${status.stockLevel}%</li>` : "";
        const consumptionLine = typeof status.consumptionRate === "number"
          ? `<li>Consumption Rate: ${status.consumptionRate} units / turn</li>`
          : "";
        return `
          <section class="war-room-supply">
            <header>
              <p>Status: <strong>${status.status.toUpperCase()}</strong></p>
            </header>
            <p>${status.note}</p>
            <ul class="war-room-detail-list">
              ${stockLine}
              ${consumptionLine}
            </ul>
          </section>
        `;
      }
      case "commandOrders": {
        // List actionable directives and expose placeholder action buttons for future command hooks.
        const directives = (payload as CommandDirective[]) ?? [];
        if (directives.length === 0) {
          return `<p class="war-room-empty">No active directives have been issued.</p>`;
        }
        return directives
          .map(
            (directive) => `
              <article class="war-room-order">
                <h4>${directive.title}</h4>
                <p>${directive.objective}</p>
                <footer class="war-room-order-footer">
                  <span class="war-room-order-priority">Priority: ${directive.priority ?? "unspecified"}</span>
                  <button type="button" class="war-room-action" data-war-room-action="acknowledge-directive">
                    Acknowledge
                  </button>
                </footer>
              </article>
            `
          )
          .join("");
      }
      case "requisitions": {
        // Display outstanding requisitions in a tabular layout to show fulfillment status at a glance.
        const requisitions = (payload as RequisitionRecord[]) ?? [];
        if (requisitions.length === 0) {
          return `<p class="war-room-empty">All requisitions are fulfilled.</p>`;
        }
        const rows = requisitions
          .map(
            (req) => `
              <tr>
                <th scope="row">${req.item}</th>
                <td>${req.quantity ?? "—"}</td>
                <td>${req.status.toUpperCase()}</td>
                <td>${req.requestedBy ?? "Anonymous"}</td>
                <td>${req.updatedAt}</td>
              </tr>
            `
          )
          .join("");
        return `
          <section class="war-room-requisitions">
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
          </section>
        `;
      }
      case "casualtyLedger": {
        // Summarize casualties using card layout to emphasize severity quickly.
        const ledger = (payload as CasualtySummary) ?? { kia: 0, wia: 0, mia: 0, updatedAt: "" };
        return `
          <section class="war-room-casualties">
            <ul class="war-room-metric-cards">
              <li><span class="label">KIA</span><span class="value">${ledger.kia}</span></li>
              <li><span class="label">WIA</span><span class="value">${ledger.wia}</span></li>
              <li><span class="label">MIA</span><span class="value">${ledger.mia}</span></li>
            </ul>
            <p class="war-room-updated">Updated ${ledger.updatedAt}</p>
          </section>
        `;
      }
      case "engagementLog": {
        // Render a timeline of recent engagements with outcomes and casualty context.
        const engagements = (payload as EngagementSummary[]) ?? [];
        if (engagements.length === 0) {
          return `<p class="war-room-empty">No combat engagements have been logged yet.</p>`;
        }
        return `
          <ol class="war-room-engagements">
            ${engagements
              .map(
                (entry) => `
                  <li>
                    <h4>${entry.theater}</h4>
                    <p>Result: <strong>${entry.result.toUpperCase()}</strong></p>
                    <p>${entry.note}</p>
                    <p class="war-room-engagement-meta">${entry.timestamp ?? "Pending timestamp"} • Casualties: ${entry.casualties ?? "N/A"}</p>
                  </li>
                `
              )
              .join("")}
          </ol>
        `;
      }
      case "readinessState": {
        // Present readiness as a gauge with supporting commentary.
        const readiness = (payload as ReadinessStatus) ?? { level: "preparing", comment: "Readiness data pending." };
        const percentageLine = typeof readiness.percentage === "number"
          ? `<p class="war-room-readiness-percentage">Overall readiness: ${readiness.percentage}%</p>`
          : "";
        return `
          <section class="war-room-readiness">
            <header>
              <h4>${readiness.level.toUpperCase()}</h4>
            </header>
            <p>${readiness.comment}</p>
            ${percentageLine}
          </section>
        `;
      }
      case "campaignClock": {
        // Highlight campaign tempo so planners understand current operational window.
        const clock = (payload as CampaignTiming) ?? { day: 1, time: "0600", note: "", phase: "" };
        const phaseLine = clock.phase ? `<p class="war-room-phase">Current Phase: ${clock.phase}</p>` : "";
        return `
          <section class="war-room-clock">
            <p class="war-room-day">Day ${clock.day}</p>
            <p class="war-room-time">${clock.time}</p>
            <p>${clock.note}</p>
            ${phaseLine}
          </section>
        `;
      }
      default:
        return `<p>No additional details recorded for ${hotspot.label}.</p>`;
    }
  }

  /**
   * Helper to require an element from the DOM.
   */
  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Required element not found: ${selector}`);
    }
    return element;
  }

  /**
   * Registers a listener that fires whenever the overlay fully closes.
   */
  registerCloseListener(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /**
   * Clears the provider subscription when this component is no longer needed.
   */
  dispose(): void {
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
  private handleProviderUpdate(): void {
    if (this.overlay.getAttribute("aria-hidden") === "true") {
      return;
    }
    if (this.activeHotspot) {
      this.renderHotspotDetail(this.activeHotspot);
    } else {
      // Even if no detail is open, keep badges in sync with live data.
      this.updateHotspotBadges();
    }
  }
}
