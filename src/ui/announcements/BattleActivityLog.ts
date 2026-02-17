import type { ActivityDetailSection, ActivityEvent } from "./AnnouncementTypes";

/**
 * Renders the right-hand activity log that chronicles battle updates for commanders.
 * Keeps the DOM synchronized with the event stream while preserving the empty-state prompt
 * until the first entry arrives. Autoscroll keeps the newest activity in view.
 */
type BattleActivityLogOptions = {
  listSelector?: string;
  emptyStateSelector?: string;
  scrollSelector?: string;
  toggleSelector?: string;
  hostSelector?: string;
};

export class BattleActivityLog {
  private readonly list: HTMLUListElement | null;
  private readonly emptyState: HTMLElement | null;
  private readonly scrollContainer: HTMLElement | null;
  private readonly toggleButton: HTMLButtonElement | null;
  private readonly host: HTMLElement | null;
  private readonly toggleHandler = () => this.handleToggle();
  private collapsedChangeListener: ((collapsed: boolean) => void) | null = null;

  constructor(selectors: BattleActivityLogOptions = {}) {
    const {
      listSelector = "#battleActivityLogList",
      emptyStateSelector = "#battleActivityLogEmpty",
      scrollSelector = "#battleActivityLogScroll",
      toggleSelector = "#battleActivityLogToggle",
      hostSelector = "#battleActivityLog"
    } = selectors;

    this.list = document.querySelector<HTMLUListElement>(listSelector);
    this.emptyState = document.querySelector<HTMLElement>(emptyStateSelector);
    this.scrollContainer = document.querySelector<HTMLElement>(scrollSelector);
    this.toggleButton = document.querySelector<HTMLButtonElement>(toggleSelector);
    this.host = document.querySelector<HTMLElement>(hostSelector);

    this.toggleButton?.addEventListener("click", this.toggleHandler);
  }

  /**
   * Clears existing entries and renders the provided snapshot. Use during initialization.
   */
  sync(events: readonly ActivityEvent[]): void {
    if (!this.list) {
      return;
    }
    this.list.innerHTML = "";
    for (const event of events) {
      this.list.appendChild(this.renderEvent(event));
    }
    this.toggleEmptyState(events.length === 0);
    this.scrollToLatest();
  }

  /**
   * Appends a newly published activity event to the log.
   */
  append(event: ActivityEvent): void {
    if (!this.list) {
      return;
    }
    this.list.appendChild(this.renderEvent(event));
    this.toggleEmptyState(false);
    if (this.host?.getAttribute("data-activity-visible") === "true" && !this.isCollapsed()) {
      this.scrollToLatest();
    }
  }

  /**
   * Releases references to DOM nodes so the component can be garbage collected safely.
   */
  dispose(): void {
    if (this.list) {
      this.list.innerHTML = "";
    }
    this.toggleButton?.removeEventListener("click", this.toggleHandler);
    this.host?.classList.add("hidden");
    this.host?.removeAttribute("data-activity-visible");
    this.host?.removeAttribute("data-activity-collapsed");
    this.toggleButton?.classList.add("hidden");
    if (this.toggleButton) {
      this.toggleButton.textContent = "⟩";
      this.toggleButton.setAttribute("aria-expanded", "false");
      this.toggleButton.setAttribute("aria-label", "Expand activity log");
    }
    this.collapsedChangeListener?.(true);
    this.collapsedChangeListener = null;
  }

  /** Allows BattleScreen to surface the log when the battle phase begins. */
  show(): void {
    this.host?.classList.remove("hidden");
    this.host?.setAttribute("data-activity-visible", "true");
    this.toggleButton?.classList.remove("hidden");
    this.setCollapsed(false);
  }

  /** Mirrors the collapsed state on the host element and toggle button. */
  setCollapsed(collapsed: boolean): void {
    if (this.host) {
      if (collapsed) {
        this.host.setAttribute("data-activity-collapsed", "true");
      } else {
        this.host.removeAttribute("data-activity-collapsed");
      }
    }
    if (this.toggleButton) {
      this.toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
      this.toggleButton.setAttribute(
        "aria-label",
        collapsed ? "Expand activity log" : "Collapse activity log"
      );
      this.toggleButton.textContent = collapsed ? "⟨" : "⟩";
    }
    this.collapsedChangeListener?.(collapsed);
  }

  /** Registers a listener so outer shells can mirror collapsed state in layout attributes. */
  registerCollapsedChangeListener(listener: (collapsed: boolean) => void): void {
    this.collapsedChangeListener = listener;
  }

  private handleToggle(): void {
    const wasCollapsed = this.isCollapsed();
    const nextCollapsed = !wasCollapsed;
    this.setCollapsed(nextCollapsed);
    if (!nextCollapsed) {
      this.scrollToLatest();
    }
  }

  private isCollapsed(): boolean {
    return this.host?.hasAttribute("data-activity-collapsed") ?? false;
  }

  private toggleEmptyState(showEmpty: boolean): void {
    if (!this.emptyState) {
      return;
    }
    if (showEmpty) {
      this.emptyState.classList.remove("hidden");
    } else {
      this.emptyState.classList.add("hidden");
    }
  }

  private renderEvent(event: ActivityEvent): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "battle-activity-log__item";

    const meta = document.createElement("div");
    meta.className = "battle-activity-log__meta";

    const timestamp = document.createElement("span");
    timestamp.className = "battle-activity-log__timestamp";
    timestamp.textContent = this.formatTimestamp(event.timestamp);

    const category = document.createElement("span");
    category.className = `battle-activity-log__badge battle-activity-log__badge--${event.category}`;
    category.textContent = event.category;

    const type = document.createElement("span");
    type.className = "battle-activity-log__badge";
    type.textContent = event.type;

    meta.append(timestamp, category, type);

    const summary = document.createElement("p");
    summary.className = "battle-activity-log__summary";
    summary.textContent = event.summary;

    item.append(meta, summary);

    if (event.detailSections && event.detailSections.length > 0) {
      const detailTrigger = document.createElement("button");
      detailTrigger.type = "button";
      detailTrigger.className = "battle-activity-log__details-toggle";
      detailTrigger.textContent = "Details";
      detailTrigger.setAttribute("aria-label", "Show detailed attack breakdown");

      const detailPanel = this.renderDetailPanel(event.detailSections);
      detailPanel.classList.add("battle-activity-log__details", "hidden");

      detailTrigger.addEventListener("click", () => {
        const isHidden = detailPanel.classList.toggle("hidden");
        detailTrigger.setAttribute("aria-expanded", (!isHidden).toString());
      });

      item.append(detailTrigger, detailPanel);
    }

    return item;
  }

  private renderDetailPanel(sections: readonly ActivityDetailSection[]): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "battle-activity-log__detail-panel";

    sections.forEach((section) => {
      const sectionElement = document.createElement("section");
      sectionElement.className = "battle-activity-log__detail-section";

      const title = document.createElement("h4");
      title.className = "battle-activity-log__detail-title";
      title.textContent = section.title;
      sectionElement.appendChild(title);

      const list = document.createElement("dl");
      list.className = "battle-activity-log__detail-grid";

      section.entries.forEach((entry) => {
        const term = document.createElement("dt");
        term.textContent = entry.label;
        const definition = document.createElement("dd");
        definition.textContent = entry.value;
        list.append(term, definition);
      });

      sectionElement.appendChild(list);
      container.appendChild(sectionElement);
    });

    return container;
  }

  private scrollToLatest(): void {
    if (!this.scrollContainer) {
      return;
    }
    this.scrollContainer.scrollTo({ top: this.scrollContainer.scrollHeight, behavior: "smooth" });
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "--:--";
    }
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}
