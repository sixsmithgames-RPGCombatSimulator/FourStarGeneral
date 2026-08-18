/** Component/controller for campaign map modes, dynamic legends, and keyboard/list parity. */

import {
  getAvailableCampaignMapOverlays,
  getCampaignMapOverlay,
  type CampaignMapOverlayDefinition
} from "../CampaignMapOverlayRegistry";
import type {
  CampaignCommandContactView,
  CampaignCommandFormationView,
  CampaignCommandForceView,
  CampaignCommandFrontView,
  CampaignCommandObjectiveView,
  CampaignCommandOrderView,
  CampaignCommandShellView
} from "../CampaignCommandShell";
import type { CampaignCommandSelection, CampaignOverlayId } from "../CampaignCommandUIState";

export interface CampaignMapOverlayControllerCallbacks {
  readonly onOverlayChanged?: (overlay: CampaignOverlayId) => void;
  readonly onSelectionRequested?: (selection: Exclude<CampaignCommandSelection, null>) => void;
  readonly onListExpandedChanged?: (expanded: boolean) => void;
}

export interface CampaignMapOverlayPerformanceSnapshot {
  readonly cacheBuilds: number;
  readonly indexedHexes: number;
  readonly entityClassApplications: number;
}

interface MapListEntry {
  readonly key: string;
  readonly marker: string;
  readonly label: string;
  readonly meta: string;
  readonly selection: Exclude<CampaignCommandSelection, null>;
}

function createText(tag: keyof HTMLElementTagNameMap, className: string, value: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

/**
 * Presentation-only map controller. It receives the same immutable Player-safe command view as the shell,
 * adds visual emphasis to existing rendered SVG entities, and never reads campaign runtime truth.
 */
export class CampaignMapOverlayController {
  private activeOverlay: CampaignOverlayId = "operational";
  private view: CampaignCommandShellView | null = null;
  private map: HTMLElement | null = null;
  private modeButtons: HTMLElement | null = null;
  private modeSelect: HTMLSelectElement | null = null;
  private legend: HTMLElement | null = null;
  private coverageFilter: HTMLElement | null = null;
  private listToggle: HTMLButtonElement | null = null;
  private listPanel: HTMLElement | null = null;
  private listContent: HTMLElement | null = null;
  private listTitle: HTMLElement | null = null;
  private listSummary: HTMLElement | null = null;
  private listSearch: HTMLInputElement | null = null;
  private listStatus: HTMLElement | null = null;
  private cachedLayerRoot: Element | null = null;
  private readonly hexIndex = new Map<string, SVGGElement>();
  private cacheBuilds = 0;
  private entityClassesDirty = true;
  private entityClassApplications = 0;
  private initialized = false;

  private readonly onModeClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-map-overlay-id]");
    const overlay = button?.dataset.mapOverlayId as CampaignOverlayId | undefined;
    if (overlay) this.callbacks.onOverlayChanged?.(overlay);
  };

  private readonly onModeSelect = (): void => {
    const overlay = this.modeSelect?.value as CampaignOverlayId | undefined;
    if (overlay) this.callbacks.onOverlayChanged?.(overlay);
  };

  private readonly onListClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-close-map-list]")) {
      this.setListExpanded(false, true);
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-map-list-selection-kind]");
    const kind = button?.dataset.mapListSelectionKind as Exclude<CampaignCommandSelection, null>["kind"] | undefined;
    const id = button?.dataset.mapListSelectionId;
    if (kind && id) {
      this.setListExpanded(false, false);
      this.callbacks.onSelectionRequested?.({ kind, id } as Exclude<CampaignCommandSelection, null>);
    }
  };

  private readonly onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.setListExpanded(false, true);
  };

  private readonly onSearchInput = (): void => this.renderList(getCampaignMapOverlay(this.activeOverlay));

  public constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: CampaignMapOverlayControllerCallbacks = {}
  ) {}

  public initialize(): boolean {
    if (this.initialized) return true;
    this.map = this.root.querySelector<HTMLElement>(".campaign-operational-map");
    const toolbar = this.map?.querySelector<HTMLElement>(".campaign-map-command-strip");
    const modeGroup = toolbar?.querySelector<HTMLElement>(".campaign-map-mode-group");
    this.legend = toolbar?.querySelector<HTMLElement>(".campaign-map-legend") ?? null;
    if (!this.map || !toolbar || !modeGroup || !this.legend) return false;

    const existingCoverage = modeGroup.querySelector<HTMLElement>("#campaignIntelCoverage");
    this.modeButtons = document.createElement("div");
    this.modeButtons.className = "campaign-map-overlay-buttons";
    this.modeButtons.setAttribute("role", "group");
    this.modeButtons.setAttribute("aria-label", "Map layer");

    const selectLabel = document.createElement("label");
    selectLabel.className = "campaign-map-overlay-select";
    selectLabel.append(createText("span", "", "Layer"));
    this.modeSelect = document.createElement("select");
    this.modeSelect.setAttribute("aria-label", "Map layer");
    selectLabel.appendChild(this.modeSelect);

    const filters = document.createElement("div");
    filters.className = "campaign-map-overlay-filters";
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Map layer filters");
    if (existingCoverage) filters.appendChild(existingCoverage);
    this.coverageFilter = existingCoverage;

    modeGroup.replaceChildren(this.modeButtons, selectLabel, filters);
    this.listToggle = document.createElement("button");
    this.listToggle.type = "button";
    this.listToggle.className = "campaign-map-list-toggle";
    this.listToggle.setAttribute("aria-expanded", "false");
    this.listToggle.setAttribute("aria-controls", "campaignMapAccessibleList");
    this.listToggle.textContent = "Map list";
    toolbar.appendChild(this.listToggle);

    this.listPanel = this.createListPanel();
    this.map.appendChild(this.listPanel);
    this.renderModeControls();

    this.modeButtons.addEventListener("click", this.onModeClick);
    this.modeSelect.addEventListener("change", this.onModeSelect);
    this.listToggle.addEventListener("click", () => this.setListExpanded(this.listPanel?.hidden ?? true, false));
    this.listPanel.addEventListener("click", this.onListClick);
    this.listPanel.addEventListener("keydown", this.onPanelKeyDown);
    this.initialized = true;
    this.apply();
    return true;
  }

  public render(view: CampaignCommandShellView): void {
    this.view = view;
    this.entityClassesDirty = true;
    this.apply();
  }

  public setOverlay(overlay: CampaignOverlayId): void {
    if (overlay !== this.activeOverlay && this.listSearch) this.listSearch.value = "";
    this.activeOverlay = overlay;
    this.apply();
  }

  public destroy(): void {
    this.modeButtons?.removeEventListener("click", this.onModeClick);
    this.modeSelect?.removeEventListener("change", this.onModeSelect);
    this.listPanel?.removeEventListener("click", this.onListClick);
    this.listPanel?.removeEventListener("keydown", this.onPanelKeyDown);
    this.listSearch?.removeEventListener("input", this.onSearchInput);
    this.listPanel?.remove();
    this.cachedLayerRoot = null;
    this.hexIndex.clear();
    this.initialized = false;
  }

  public getPerformanceSnapshot(): CampaignMapOverlayPerformanceSnapshot {
    return Object.freeze({
      cacheBuilds: this.cacheBuilds,
      indexedHexes: this.hexIndex.size,
      entityClassApplications: this.entityClassApplications
    });
  }

  private renderModeControls(): void {
    if (!this.modeButtons || !this.modeSelect) return;
    const definitions = getAvailableCampaignMapOverlays();
    this.modeButtons.replaceChildren(...definitions.map((definition) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mapOverlayId = definition.id;
      button.title = definition.description;
      button.setAttribute("aria-label", `${definition.label} map layer. ${definition.description}`);
      button.append(
        createText("span", "campaign-map-overlay-button__short", definition.shortLabel),
        createText("span", "campaign-map-overlay-button__label", definition.label)
      );
      return button;
    }));
    this.modeSelect.replaceChildren(...definitions.map((definition) => {
      const option = document.createElement("option");
      option.value = definition.id;
      option.textContent = definition.label;
      return option;
    }));
  }

  private createListPanel(): HTMLElement {
    const panel = document.createElement("aside");
    panel.id = "campaignMapAccessibleList";
    panel.className = "campaign-map-accessible-list";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Map entities list");
    const header = document.createElement("header");
    const heading = document.createElement("div");
    heading.append(
      createText("span", "campaign-map-accessible-list__eyebrow", "Map list"),
      createText("h2", "campaign-map-accessible-list__title", "Operational entities")
    );
    this.listTitle = heading.querySelector("h2");
    const close = document.createElement("button");
    close.type = "button";
    close.dataset.closeMapList = "true";
    close.setAttribute("aria-label", "Close map list");
    close.textContent = "×";
    header.append(heading, close);
    this.listSummary = createText("p", "campaign-map-accessible-list__summary", "Choose an entity to inspect it.");
    const search = document.createElement("label");
    search.className = "campaign-map-accessible-list__search";
    search.append(createText("span", "", "Search this layer"));
    this.listSearch = document.createElement("input");
    this.listSearch.type = "search";
    this.listSearch.placeholder = "Name, status, or location";
    this.listSearch.setAttribute("aria-label", "Search current map list");
    this.listStatus = createText("small", "campaign-map-accessible-list__status", "");
    this.listStatus.setAttribute("aria-live", "polite");
    search.append(this.listSearch, this.listStatus);
    this.listSearch.addEventListener("input", this.onSearchInput);
    this.listContent = document.createElement("div");
    this.listContent.className = "campaign-map-accessible-list__content";
    panel.append(header, this.listSummary, search, this.listContent);
    return panel;
  }

  private apply(): void {
    if (!this.initialized || !this.map) return;
    const requested = getCampaignMapOverlay(this.activeOverlay);
    const effective = requested.status === "available" ? requested : getCampaignMapOverlay("operational");
    const svg = this.root.querySelector<SVGSVGElement>("#campaignHexMap");
    if (svg) {
      svg.dataset.overlayMode = effective.id;
      svg.dataset.overlayRequested = requested.id;
      svg.dataset.overlayStatus = requested.status;
    }
    this.map.dataset.overlayMode = effective.id;
    this.map.dataset.overlayRequested = requested.id;
    this.map.dataset.overlayStatus = requested.status;
    this.map.setAttribute("aria-label", `${effective.label} campaign map. ${effective.description}`);
    this.syncControls(effective, requested);
    this.applyEntityClasses();
    this.renderLegend(requested);
    this.renderList(requested);
  }

  private syncControls(effective: CampaignMapOverlayDefinition, requested: CampaignMapOverlayDefinition): void {
    this.modeButtons?.querySelectorAll<HTMLButtonElement>("[data-map-overlay-id]").forEach((button) => {
      const selected = button.dataset.mapOverlayId === effective.id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    if (this.modeSelect) this.modeSelect.value = effective.id;
    if (this.coverageFilter) this.coverageFilter.hidden = effective.id !== "intelligence";
    if (this.listToggle) {
      const count = this.getListEntries(effective.id).length;
      this.listToggle.textContent = `Map list ${count}`;
      this.listToggle.setAttribute("aria-label", `${effective.label} map list, ${count} item${count === 1 ? "" : "s"}`);
      if (requested.status === "featureGated") this.listToggle.textContent = `${requested.shortLabel} unavailable`;
    }
  }

  private applyEntityClasses(): void {
    const cacheRebuilt = this.refreshHexIndex();
    if (!cacheRebuilt && !this.entityClassesDirty) return;
    this.hexIndex.forEach((hex) => hex.classList.remove(
      "campaign-overlay-objective",
      "campaign-overlay-force",
      "campaign-overlay-order",
      "campaign-overlay-front"
    ));
    const mark = (hexKey: string, className: string): void => {
      this.hexIndex.get(hexKey)?.classList.add(className);
    };
    this.view?.objectives.forEach((objective) => {
      if (objective.hexKey) mark(objective.hexKey, "campaign-overlay-objective");
    });
    this.view?.forces.forEach((force) => mark(force.hexKey, "campaign-overlay-force"));
    this.view?.formations?.forEach((formation) => {
      if (formation.locationHexKey) mark(formation.locationHexKey, "campaign-overlay-force");
    });
    this.view?.orders.forEach((order) => order.mapHexKeys?.forEach((hexKey) => mark(hexKey, "campaign-overlay-order")));
    this.view?.fronts?.forEach((front) => front.hexKeys.forEach((hexKey) => mark(hexKey, "campaign-overlay-front")));
    this.entityClassesDirty = false;
    this.entityClassApplications += 1;
  }

  private refreshHexIndex(): boolean {
    const svg = this.root.querySelector<SVGSVGElement>("#campaignHexMap");
    const layerRoot = svg?.querySelector("#viewportRoot") ?? svg?.firstElementChild ?? null;
    if (layerRoot === this.cachedLayerRoot && this.hexIndex.size > 0) return false;
    this.cachedLayerRoot = layerRoot;
    this.hexIndex.clear();
    svg?.querySelectorAll<SVGGElement>(".campaign-hex[data-hex]").forEach((hex) => {
      const key = hex.dataset.hex;
      if (key) this.hexIndex.set(key, hex);
    });
    this.cacheBuilds += 1;
    return true;
  }

  private renderLegend(definition: CampaignMapOverlayDefinition): void {
    if (!this.legend) return;
    this.legend.replaceChildren(
      createText("strong", "campaign-map-legend__title", definition.label),
      ...(definition.status === "featureGated"
        ? [createText("span", "campaign-map-legend__gate", definition.unavailableReason ?? "This map layer is unavailable.")]
        : definition.legend.map((entry) => {
          const item = document.createElement("span");
          item.dataset.legend = entry.key;
          item.dataset.tone = entry.tone;
          item.append(createText("i", "", entry.symbol), document.createTextNode(entry.label));
          return item;
        }))
    );
  }

  private renderList(definition: CampaignMapOverlayDefinition): void {
    if (!this.listContent || !this.listTitle || !this.listSummary || !this.listSearch || !this.listStatus) return;
    this.listTitle.textContent = `${definition.label} map list`;
    this.listSummary.textContent = definition.status === "featureGated"
      ? definition.unavailableReason ?? "This map layer is unavailable."
      : `${definition.description} Select any item to open the same context route used by the map.`;
    const allEntries = definition.status === "available" ? this.getListEntries(definition.id) : [];
    const query = this.listSearch.value.trim().toLocaleLowerCase();
    const entries = query.length === 0
      ? allEntries
      : allEntries.filter((entry) => `${entry.label} ${entry.meta}`.toLocaleLowerCase().includes(query));
    this.listSearch.parentElement!.hidden = definition.status === "featureGated" || allEntries.length === 0;
    this.listStatus.textContent = query.length > 0
      ? `${entries.length} of ${allEntries.length} shown`
      : `${allEntries.length} item${allEntries.length === 1 ? "" : "s"}`;
    if (entries.length === 0) {
      this.listContent.replaceChildren(createText(
        "p",
        "campaign-map-accessible-list__empty",
        definition.status === "featureGated" ? "No projected layer is exposed." : "No projected entities are available in this layer."
      ));
      return;
    }
    this.listContent.replaceChildren(...entries.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "campaign-map-list-entry";
      button.dataset.mapListSelectionKind = entry.selection.kind;
      button.dataset.mapListSelectionId = entry.selection.id;
      button.append(
        createText("span", "campaign-map-list-entry__marker", entry.marker),
        createText("strong", "", entry.label),
        createText("small", "", entry.meta)
      );
      return button;
    }));
  }

  private getListEntries(overlay: CampaignOverlayId): readonly MapListEntry[] {
    if (!this.view) return [];
    if (overlay === "objectives") return this.view.objectives.map((objective) => this.objectiveEntry(objective));
    if (overlay === "forces") return this.view.formations && this.view.formations.length > 0
      ? this.view.formations.map((formation) => this.formationEntry(formation))
      : this.view.forces.map((force, index) => this.forceEntry(force, index));
    if (overlay === "intelligence") return (this.view.contacts ?? []).map((contact) => this.contactEntry(contact));
    if (overlay === "orders") return this.view.orders.map((order) => this.orderEntry(order));
    if (overlay === "operational") return (this.view.fronts ?? []).map((front) => this.frontEntry(front));
    return [];
  }

  private objectiveEntry(objective: CampaignCommandObjectiveView): MapListEntry {
    return {
      key: objective.key,
      marker: objective.status === "Completed" ? "✓" : objective.status === "Failed" ? "!" : "◎",
      label: objective.label,
      meta: `${objective.status}${objective.hexKey ? ` · ${objective.hexKey}` : ""}`,
      selection: { kind: "objective", id: objective.key }
    };
  }

  private forceEntry(force: CampaignCommandForceView, index: number): MapListEntry {
    return {
      key: `${force.hexKey}:${index}`,
      marker: "◆",
      label: force.label,
      meta: `${force.count.toLocaleString()} · ${force.hexKey}`,
      selection: { kind: "hex", id: force.hexKey }
    };
  }

  private formationEntry(formation: CampaignCommandFormationView): MapListEntry {
    return {
      key: formation.id,
      marker: formation.statusLabel === "Ready" ? "◆" : "◇",
      label: formation.name,
      meta: `${formation.statusLabel} · ${formation.readiness}${formation.locationHexKey ? ` · ${formation.locationHexKey}` : " · Off map"}`,
      selection: { kind: "formation", id: formation.id }
    };
  }

  private contactEntry(contact: CampaignCommandContactView): MapListEntry {
    return {
      key: contact.id,
      marker: contact.state === "current" ? "◇" : "◈",
      label: contact.label,
      meta: `${contact.confidenceBand} confidence · ${contact.locationHexKey} · ${contact.ageSegments} segment${contact.ageSegments === 1 ? "" : "s"} old`,
      selection: { kind: "contact", id: contact.id }
    };
  }

  private orderEntry(order: CampaignCommandOrderView): MapListEntry {
    return {
      key: order.id,
      marker: order.status === "conflict" || order.status === "blocked" ? "!" : "→",
      label: order.label,
      meta: `${order.status} · ${order.mapHexKeys?.join(" → ") || "Theater-wide"}`,
      selection: { kind: "order", id: order.id }
    };
  }

  private frontEntry(front: CampaignCommandFrontView): MapListEntry {
    return {
      key: front.key,
      marker: "━",
      label: front.label,
      meta: `${front.initiativeLabel} · ${front.hexKeys.length} sector${front.hexKeys.length === 1 ? "" : "s"}`,
      selection: { kind: "front", id: front.key }
    };
  }

  private setListExpanded(expanded: boolean, restoreFocus: boolean): void {
    if (!this.listPanel || !this.listToggle) return;
    this.listPanel.hidden = !expanded;
    this.listToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    this.map?.classList.toggle("campaign-map-list-open", expanded);
    this.callbacks.onListExpandedChanged?.(expanded);
    if (expanded) this.listPanel.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    else if (restoreFocus) this.listToggle.focus({ preventScroll: true });
  }
}
