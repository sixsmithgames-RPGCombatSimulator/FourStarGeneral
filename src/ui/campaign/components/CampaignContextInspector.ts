/** Typed context-inspector shell and Player-safe route rendering. */

import type {
  CampaignCommandFormationView,
  CampaignCommandHexView,
  CampaignCommandShellView,
  CampaignCommandStrategicGeographyView
} from "../CampaignCommandShell";
import type { CampaignCommandSelection } from "../CampaignCommandUIState";
import { isCampaignGridReferenceLabel, type CampaignLocationPresentation } from "../CampaignLocationPresentation";

interface InspectorFact {
  readonly label: string;
  readonly value: string;
}

interface InspectorFormationGroup {
  readonly key: "ready" | "committed" | "transit" | "arriving" | "recovering";
  readonly label: string;
  readonly formations: readonly CampaignCommandFormationView[];
}

interface InspectorCommandGroup {
  readonly commandLabel: string;
  readonly typeLabel: string;
  readonly formations: readonly CampaignCommandFormationView[];
  readonly showSubordinates: boolean;
}

interface CampaignInspectorRoute {
  readonly kind: Exclude<CampaignCommandSelection, null>["kind"] | "none";
  readonly title: string;
  readonly summary: string;
  readonly facts: readonly InspectorFact[];
  readonly formations?: readonly CampaignCommandFormationView[];
  readonly formationGroups?: readonly InspectorFormationGroup[];
  readonly fallbackPresence?: readonly string[];
  readonly presentation?: "friendlyBase";
  readonly mode: "compatibility" | "projected" | "projectedWithActions" | "empty";
  readonly showSelectionActions?: boolean;
  readonly showEngagementAction?: boolean;
  readonly actionSummary?: string;
  readonly identityHeading?: string;
  readonly presenceHeading?: string;
  readonly mapTarget?: { readonly hexKey: string; readonly label: string };
  readonly parentRoute?: { readonly hexKey: string; readonly label: string };
}

function createText(tagName: keyof HTMLElementTagNameMap, className: string, value: string): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = value;
  return element;
}

export function createCampaignContextInspector(workspacePanel: HTMLElement): HTMLElement {
  const inspector = document.createElement("aside");
  inspector.id = "campaignContextInspector";
  inspector.className = "campaign-context-inspector";
  inspector.setAttribute("aria-labelledby", "campaignInspectorTitle");
  inspector.innerHTML = `
    <header class="campaign-context-inspector__header">
      <div><span>Field report</span><h2 id="campaignInspectorTitle" tabindex="-1">Selection</h2></div>
      <button type="button" data-close-campaign-inspector aria-label="Close context inspector">×</button>
    </header>
    <p id="campaignInspectorStatus" class="campaign-context-inspector__status" role="status" aria-live="polite"></p>
    <div class="campaign-context-inspector__body">
      <section id="campaignContextInspectorRoute" class="campaign-context-inspector__route" hidden></section>
    </div>
    <footer class="campaign-context-inspector__action-footer" hidden>
      <h3 id="campaignInspectorActionsTitle">Orders</h3>
      <p class="campaign-context-inspector__action-summary" hidden></p>
    </footer>
  `;
  const selection = workspacePanel.querySelector<HTMLElement>(".selection-section");
  const action = workspacePanel.querySelector<HTMLElement>(".action-section");
  const actionFooter = inspector.querySelector<HTMLElement>(".campaign-context-inspector__action-footer");
  // Target choices and contextual information share the information scroll owner;
  // only the concise primary engagement action occupies the bounded footer.
  if (selection) inspector.querySelector(".campaign-context-inspector__body")?.appendChild(selection);
  if (action) actionFooter?.appendChild(action);
  return inspector;
}

export function renderCampaignContextInspector(
  inspector: HTMLElement,
  view: CampaignCommandShellView | null,
  selection: CampaignCommandSelection
): void {
  const route = resolveInspectorRoute(view, selection);
  const routeIdentity = `${route.kind}:${selection?.id ?? "none"}`;
  const routeChanged = inspector.dataset.routeIdentity !== routeIdentity;
  inspector.dataset.routeIdentity = routeIdentity;
  inspector.dataset.selectionKind = route.kind;
  inspector.dataset.routeMode = route.mode;
  inspector.dataset.presentation = route.presentation ?? "generic";
  const title = inspector.querySelector<HTMLElement>(".campaign-context-inspector__header h2");
  if (title) title.textContent = route.title;
  const status = inspector.querySelector<HTMLElement>("#campaignInspectorStatus");
  if (status && routeChanged) status.textContent = `Selected ${route.title}.`;
  const body = inspector.querySelector<HTMLElement>(".campaign-context-inspector__body");
  const routeContainer = inspector.querySelector<HTMLElement>("#campaignContextInspectorRoute");
  const compatibilitySelection = inspector.querySelector<HTMLElement>(".selection-section");
  const compatibilityActions = inspector.querySelector<HTMLElement>(".action-section");
  const actionFooter = inspector.querySelector<HTMLElement>(".campaign-context-inspector__action-footer");
  const actionSummary = inspector.querySelector<HTMLElement>(".campaign-context-inspector__action-summary");
  const showSelectionActions = route.showSelectionActions === true;
  const showEngagementAction = route.showEngagementAction === true;
  if (actionSummary) {
    actionSummary.textContent = route.actionSummary ?? "";
    actionSummary.hidden = !route.actionSummary;
  }
  if (compatibilitySelection) compatibilitySelection.hidden = !showSelectionActions;
  if (compatibilityActions) compatibilityActions.hidden = !showEngagementAction;
  if (actionFooter) actionFooter.hidden = !(showEngagementAction || route.actionSummary);
  if (!routeContainer) return;
  const useCompatibility = route.mode === "compatibility";
  routeContainer.hidden = useCompatibility;
  if (useCompatibility) {
    routeContainer.replaceChildren();
    if (routeChanged && body) body.scrollTop = 0;
    return;
  }
  const content = route.presentation === "friendlyBase"
    ? renderFriendlyBaseRoute(route)
    : renderGenericRoute(route);
  if (route.parentRoute) {
    const parentAction = createText("button", "campaign-context-inspector__parent-route", route.parentRoute.label) as HTMLButtonElement;
    parentAction.type = "button";
    parentAction.dataset.campaignMapHexTarget = route.parentRoute.hexKey;
    content.unshift(parentAction);
  }
  if (route.mapTarget) {
    const mapAction = createText("button", "campaign-context-inspector__map-action", route.mapTarget.label) as HTMLButtonElement;
    mapAction.type = "button";
    mapAction.dataset.campaignMapHexTarget = route.mapTarget.hexKey;
    content.push(mapAction);
  }
  if (route.mode === "empty") content[0]?.classList.add("campaign-context-inspector__empty");
  routeContainer.replaceChildren(...content);
  if (routeChanged && body) body.scrollTop = 0;
}

function createFacts(facts: readonly InspectorFact[]): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = "campaign-context-inspector__facts";
  facts.forEach((fact) => {
    list.append(createText("dt", "", fact.label), createText("dd", "", fact.value));
  });
  return list;
}

/** Keeps the grid subordinate and avoids repeating a place already used as the heading. */
function createLocationFacts(
  location: CampaignLocationPresentation | undefined,
  selectedTitle?: string,
  locationLabel = "Location"
): InspectorFact[] {
  if (!location) return [];
  return [
    ...(location.primaryLabel !== selectedTitle ? [{ label: locationLabel, value: location.primaryLabel }] : []),
    { label: "Grid reference", value: location.secondaryGridReference },
    ...(location.uncertainty ? [{ label: "Uncertainty", value: location.uncertainty.label }] : [])
  ];
}

/** Uses only published geography for the exact key, never an adjacent place or a contact's position. */
function findLocation(view: CampaignCommandShellView, hexKey: string | undefined): CampaignLocationPresentation | undefined {
  if (!hexKey) return undefined;
  return view.hexes?.find((hex) => hex.hexKey === hexKey)?.location
    ?? view.knownSites?.find((site) => site.locationHexKey === hexKey)?.location;
}

/** Legacy authored labels remain usable, but raw grid copy is never a primary location. */
function namedLocationLabel(label: string | undefined): string | undefined {
  return label?.trim() && !isCampaignGridReferenceLabel(label) ? label : undefined;
}

function createStrategicGeographyFacts(
  geography: CampaignCommandStrategicGeographyView,
  selectedTitle?: string,
  locationLabel?: string
): InspectorFact[] {
  return [
    { label: "Ground", value: [geography.terrain, geography.landform].filter(Boolean).join(" · ") },
    ...(geography.settlement && geography.settlement !== selectedTitle && geography.settlement !== locationLabel
      ? [{ label: "Place", value: geography.settlement }]
      : []),
    ...(geography.roads?.length ? [{ label: "Roads", value: geography.roads.join(" · ") }] : []),
    ...(geography.railways?.length ? [{ label: "Rail", value: geography.railways.join(" · ") }] : []),
    ...(geography.waterways?.length ? [{ label: "Waterways", value: geography.waterways.join(" · ") }] : []),
    ...(geography.operationalFeatures?.length ? [{ label: "Features", value: geography.operationalFeatures.join(" · ") }] : [])
  ];
}

function appendCommandPresentations(
  list: HTMLElement,
  formations: readonly CampaignCommandFormationView[],
  group: InspectorFormationGroup["key"] | "generic"
): void {
  groupBaseCommands(formations).forEach((command) => {
    if (!command.showSubordinates) {
      const summary = document.createElement("article");
      summary.className = "campaign-context-inspector__command-summary";
      summary.append(
        createText("strong", "", command.commandLabel),
        createText("span", "", `${command.formations.length} ${command.typeLabel}${command.formations.length === 1 ? "" : "s"}`)
      );
      list.appendChild(summary);
      return;
    }
    const disclosure = document.createElement("details");
    disclosure.className = "campaign-context-inspector__command";
    const summary = document.createElement("summary");
    const subordinateNoun = command.typeLabel.toLowerCase().includes("squadron") ? "squadron" : "unit";
    summary.append(
      createText("strong", "", command.commandLabel),
      createText("span", "", `${command.formations.length} ${subordinateNoun}${command.formations.length === 1 ? "" : "s"} · select to inspect`)
    );
    const subordinates = document.createElement("div");
    subordinates.className = "campaign-context-inspector__command-units";
    command.formations.forEach((formation) => subordinates.appendChild(createFormationButton(formation, group)));
    disclosure.append(summary, subordinates);
    list.appendChild(disclosure);
  });
}

function renderGenericRoute(route: CampaignInspectorRoute): HTMLElement[] {
  const content: HTMLElement[] = [createText("p", "campaign-context-inspector__summary", route.summary)];
  if (route.facts.length > 0) content.push(createFacts(route.facts));
  if (route.formations && route.formations.length > 0) {
    const formationSection = document.createElement("section");
    formationSection.className = "campaign-context-inspector__formations";
    formationSection.appendChild(createText("h3", "", "Formations at this location"));
    const formationList = document.createElement("div");
    formationList.className = "campaign-context-inspector__formation-list";
    appendCommandPresentations(formationList, route.formations, "generic");
    formationSection.appendChild(formationList);
    content.push(formationSection);
  }
  return content;
}

function renderFriendlyBaseRoute(route: CampaignInspectorRoute): HTMLElement[] {
  const identity = document.createElement("section");
  identity.className = "campaign-context-inspector__section campaign-context-inspector__identity";
  const identityTitle = `campaignInspectorIdentity-${route.kind}`;
  identity.setAttribute("aria-labelledby", identityTitle);
  const heading = createText("h3", "", route.identityHeading ?? "Position");
  heading.id = identityTitle;
  identity.append(heading, createText("p", "campaign-context-inspector__summary", route.summary));
  if (route.facts.length > 0) identity.appendChild(createFacts(route.facts));

  const presence = document.createElement("section");
  presence.className = "campaign-context-inspector__section campaign-context-inspector__formations";
  const presenceTitle = `campaignInspectorPresence-${route.kind}`;
  presence.setAttribute("aria-labelledby", presenceTitle);
  const presenceHeading = createText("h3", "", route.presenceHeading ?? "Assigned formations");
  presenceHeading.id = presenceTitle;
  presence.appendChild(presenceHeading);

  const populatedGroups = route.formationGroups?.filter((group) => group.formations.length > 0) ?? [];
  populatedGroups.forEach((group) => {
    const groupElement = document.createElement("section");
    groupElement.className = "campaign-context-inspector__formation-group";
    groupElement.dataset.formationGroup = group.key;
    const groupTitle = createText("h4", "", `${group.label} (${group.formations.length})`);
    const list = document.createElement("div");
    list.className = "campaign-context-inspector__formation-list";
    appendCommandPresentations(list, group.formations, group.key);
    groupElement.append(groupTitle, list);
    presence.appendChild(groupElement);
  });
  if (populatedGroups.length === 0 && route.fallbackPresence?.length) {
    const fallback = document.createElement("ul");
    fallback.className = "campaign-context-inspector__fallback-presence";
    route.fallbackPresence.forEach((entry) => fallback.appendChild(createText("li", "", entry)));
    presence.appendChild(fallback);
  } else if (populatedGroups.length === 0) {
    presence.appendChild(createText("p", "campaign-context-inspector__empty-presence", "No formation is ready or scheduled here."));
  }
  return [identity, presence];
}

function createFormationButton(
  formation: CampaignCommandFormationView,
  group: InspectorFormationGroup["key"] | "generic"
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "campaign-context-inspector__formation";
  button.dataset.campaignFormationId = formation.id;
  const detail = group === "arriving" && formation.availabilityLabel
    ? `${formation.typeLabel} · Arrives ${formation.availabilityLabel}`
    : group === "ready"
      ? `${formation.typeLabel} · ${formation.readiness} ready`
      : group === "committed"
        ? `${formation.typeLabel} · ${formation.statusLabel} · ${formation.readiness} ready`
        : `${formation.typeLabel} · ${formation.statusLabel} · Readiness ${formation.readiness} · Cohesion ${formation.cohesion}${formation.availabilityLabel ? ` · Available ${formation.availabilityLabel}` : ""}`;
  button.append(createText("strong", "", formation.name), createText("span", "", detail));
  return button;
}

function resolveInspectorRoute(
  view: CampaignCommandShellView | null,
  selection: CampaignCommandSelection
): CampaignInspectorRoute {
  if (!selection) {
    return { kind: "none", title: "Selection", summary: "Select a map hex or command record to inspect it.", facts: [], mode: "compatibility" };
  }
  if (selection.kind === "hex") {
    const knownSite = view?.knownSites?.find((entry) => entry.locationHexKey === selection.id);
    const hex: CampaignCommandHexView | undefined = view?.hexes?.find((entry) => entry.hexKey === selection.id)
      ?? (knownSite ? {
        hexKey: knownSite.locationHexKey,
        location: knownSite.location,
        displayLabel: knownSite.label,
        roleLabel: knownSite.roleLabel,
        controlLabel: knownSite.categoryLabel === "Allied supporting site"
          ? "Friendly support network"
          : knownSite.categoryLabel === "Strategic geography"
            ? "Geographic reference"
            : "Current control unconfirmed",
        summary: knownSite.summary,
        sourceLabel: knownSite.sourceLabel,
        strategicGeography: knownSite.strategicGeography,
        forces: [], infrastructure: null, objectives: [], fronts: [], hasContextActions: false
      } : undefined);
    const locatedFormations = view?.formations?.filter((formation) => formation.locationHexKey === selection.id) ?? [];
    const isFriendlyBase = hex?.presentation === "friendlyBase";
    const showSelectionActions = hex?.showSelectionActions ?? hex?.hasContextActions === true;
    const showEngagementAction = hex?.showEngagementAction === true;
    const formationGroups = isFriendlyBase ? groupBaseFormations(locatedFormations) : undefined;
    const displayLabel = namedLocationLabel(hex?.displayLabel);
    // A fleet is a command at a place. Its authored command identity stays in the
    // heading while its location uses the same geography facts as other records.
    const title = (hex?.roleLabel === "Naval task force" ? displayLabel : hex?.location?.primaryLabel)
      ?? displayLabel ?? view?.theaterTitle ?? "Operational sector";
    return {
      kind: "hex",
      title,
      summary: hex
        ? hex.summary ?? `${hex.roleLabel} under ${hex.controlLabel.toLowerCase()}.`
        : "No projected installation or force record is present at this location.",
      facts: isFriendlyBase && hex ? [
        ...createLocationFacts(hex.location, title),
        ...(hex.strategicGeography ? createStrategicGeographyFacts(hex.strategicGeography, title, hex.location?.primaryLabel) : []),
        { label: "Status", value: `${hex.roleLabel} · ${hex.controlLabel}` },
        ...(hex.historicalNetwork?.length ? [{
          label: hex.roleLabel === "Air base"
            ? "Satellite airfields"
            : hex.roleLabel === "Naval base"
              ? "Associated anchorages"
              : "Associated ports",
          value: hex.historicalNetwork.join(" · ")
        }] : []),
        ...(hex.capabilities?.length ? [{ label: "Provides", value: hex.capabilities.join(" · ") }] : []),
        ...(hex.infrastructure ? [{ label: "Condition", value: hex.infrastructure }] : []),
        ...(hex.infrastructureRecovery ? [{ label: "Recovery", value: hex.infrastructureRecovery }] : []),
        ...(hex.objectives.length > 0 ? [{ label: "Supports", value: hex.objectives.join(", ") }] : []),
        ...(hex.fronts.length > 0 ? [{ label: "Front", value: hex.fronts.join(", ") }] : [])
      ] : [
        ...createLocationFacts(hex?.location, title),
        ...(!hex?.location && !displayLabel ? [{ label: "Grid reference", value: `Grid ${selection.id}` }] : []),
        ...(hex?.strategicGeography ? createStrategicGeographyFacts(hex.strategicGeography, title, hex.location?.primaryLabel) : []),
        ...(hex ? [
          { label: "Control", value: hex.controlLabel },
          { label: "Type", value: hex.roleLabel },
          ...(hex.historicalNetwork?.length ? [{ label: "Includes", value: hex.historicalNetwork.join(" · ") }] : []),
          ...(hex.forces.length > 0 && locatedFormations.length === 0
            ? [{ label: "Projected forces", value: hex.forces.join("; ") }]
            : []),
          ...(hex.capabilities?.length ? [{ label: "Operational contribution", value: hex.capabilities.join(" · ") }] : []),
          ...(hex.infrastructure ? [{ label: "Infrastructure", value: hex.infrastructure }] : []),
          ...(hex.infrastructureRecovery ? [{ label: "Recovery", value: hex.infrastructureRecovery }] : []),
          ...(hex.objectives.length > 0 ? [{ label: "Objectives", value: hex.objectives.join(", ") }] : []),
          ...(hex.fronts.length > 0 ? [{ label: "Fronts", value: hex.fronts.join(", ") }] : [])
        ] : [])
      ],
      ...(isFriendlyBase ? {
        presentation: "friendlyBase" as const,
        formationGroups,
        fallbackPresence: locatedFormations.length === 0 ? hex?.forces ?? [] : [],
        identityHeading: hex.roleLabel === "Air base"
          ? "Air station"
          : hex.roleLabel === "Naval base"
            ? "Naval station"
            : "Embarkation port",
        presenceHeading: hex.roleLabel === "Air base" ? "Assigned air commands" : "Assigned commands"
      } : { formations: locatedFormations }),
      mode: showSelectionActions || showEngagementAction ? "projectedWithActions" : "projected",
      showSelectionActions,
      showEngagementAction,
      actionSummary: hex?.actionSummary
    };
  }
  if (!view) return emptyRoute(selection.kind, selection.id);
  if (selection.kind === "objective") {
    const objective = view.objectives.find((entry) => entry.key === selection.id);
    if (!objective) return emptyRoute("objective", selection.id);
    const progress = objective.progressCurrent !== undefined && objective.progressTarget !== undefined
      ? `${objective.progressCurrent} of ${objective.progressTarget}${objective.progressLabel ? ` · ${objective.progressLabel}` : ""}`
      : objective.progressLabel;
    const requirements = objective.conditionLabels?.filter((label) => label !== objective.progressLabel) ?? [];
    return {
      kind: "objective",
      title: objective.label,
      summary: objective.detail ?? "Objective status is projected from the committed campaign boundary.",
      facts: [
        { label: "Status", value: objective.status },
        ...createLocationFacts(objective.location, objective.label),
        ...(progress ? [{ label: "Progress", value: progress }] : []),
        ...(requirements.length ? [{ label: "Requirements", value: requirements.join(" · ") }] : []),
        ...(objective.nextAction ? [{ label: "Next action", value: objective.nextAction }] : []),
        ...(objective.deadline ? [{ label: "Deadline", value: objective.deadline }] : []),
        ...(objective.score ? [{ label: "Score", value: objective.score }] : []),
        ...(objective.dependencies ? [{ label: "Dependencies", value: objective.dependencies }] : []),
        ...(objective.failureEffect ? [{ label: "Failure effect", value: objective.failureEffect }] : [])
      ],
      mode: "projected",
      ...(objective.hexKey
        ? { mapTarget: { hexKey: objective.hexKey, label: `Focus ${objective.location?.primaryLabel ?? objective.label} on the map` } }
        : {})
    };
  }
  if (selection.kind === "order") {
    const order = view.orders.find((entry) => entry.id === selection.id);
    if (!order) return emptyRoute("order", selection.id);
    const routeLocations = order.mapHexKeys?.map((hexKey) => findLocation(view, hexKey));
    return {
      kind: "order",
      title: order.label,
      summary: order.detail,
      facts: [
        { label: "Status", value: order.status },
        ...(order.mapHexKeys && order.mapHexKeys.length > 0
          ? [
            { label: "Map route", value: order.routeSummary ?? routeLocations?.map((location) => location?.primaryLabel ?? "Location not reported").join(" → ") ?? "Location not reported" },
            { label: "Grid references", value: order.mapHexKeys.map((hexKey, index) => routeLocations?.[index]?.secondaryGridReference ?? `Grid ${hexKey}`).join(" → ") }
          ]
          : [{ label: "Map route", value: "Theater-wide" }]),
        ...(order.costSummary ? [{ label: "Cost", value: order.costSummary }] : []),
        ...(order.reservationSummaries?.length ? [{ label: "Reservations", value: order.reservationSummaries.join(" · ") }] : []),
        ...(order.timingSummary || order.eta ? [{ label: "Timing", value: order.timingSummary ?? order.eta ?? "" }] : []),
        ...(order.nextTransition ? [{ label: "Next transition", value: order.nextTransition }] : []),
        ...(order.riskSummary ? [{ label: "Known risk", value: order.riskSummary }] : []),
        ...(order.objectiveEffect ? [{ label: "Objective effect", value: order.objectiveEffect }] : []),
        ...(order.dependencySummary ? [{ label: "Dependencies", value: order.dependencySummary }] : []),
        ...(order.cancellationSummary ? [{ label: "Cancellation", value: order.cancellationSummary }] : []),
        ...(order.validationIssues ?? order.validationMessages.map((message) => ({ code: "ORDER_BLOCKED", message, correctiveAction: "Review and correct this draft." })))
          .flatMap((issue) => [
            { label: "Requires attention", value: issue.message },
            { label: "Corrective action", value: issue.correctiveAction }
          ])
      ],
      mode: "projected"
    };
  }
  if (selection.kind === "report") {
    const report = view.afterActionReports?.find((entry) => entry.id === selection.id);
    if (!report) return emptyRoute("report", selection.id);
    const location = report.locationPresentation ?? findLocation(view, report.locationHexKey);
    return {
      kind: "report",
      title: report.title,
      summary: report.summary,
      facts: [
        { label: "Result", value: report.resultLabel },
        { label: "Time", value: report.timeLabel },
        ...(location ? createLocationFacts(location) : [
          { label: "Location", value: namedLocationLabel(report.location) ?? "Location not reported" },
          ...(report.locationHexKey ? [{ label: "Grid reference", value: `Grid ${report.locationHexKey}` }] : [])
        ]),
        { label: "Friendly losses", value: report.personnelLosses },
        { label: "Assessed opposing losses", value: report.opponentLosses }
      ],
      mode: "projected",
      ...(report.locationHexKey
        ? { mapTarget: { hexKey: report.locationHexKey, label: `Focus ${location?.primaryLabel ?? namedLocationLabel(report.location) ?? "battle location"}` } }
        : {})
    };
  }
  if (selection.kind === "formation") {
    const rosterFormation = view.formations?.find((entry) => entry.id === selection.id);
    if (rosterFormation) {
      const location = rosterFormation.locationHexKey
        ? view.hexes?.find((entry) => entry.hexKey === rosterFormation.locationHexKey)
        : null;
      const locationPresentation = rosterFormation.location ?? location?.location;
      const currentOrder = rosterFormation.currentOrderId
        ? view.orders.find((entry) => entry.id === rosterFormation.currentOrderId)
        : null;
      const currentOrderLabel = currentOrder
        ? `${currentOrder.label} · ${currentOrder.status}${currentOrder.eta ? ` · ${currentOrder.eta}` : ""}`
        : rosterFormation.currentOrderId ? "Assigned to an active operation" : "None";
      const transitRoute = rosterFormation.postureKey === "inTransit" && currentOrder?.kind === "redeploy"
        && (currentOrder.status === "committed" || currentOrder.status === "executing")
        ? currentOrder.routeSummary
        : undefined;
      return {
        kind: "formation",
        title: rosterFormation.name,
        summary: `${rosterFormation.ownershipLabel} ${rosterFormation.typeLabel} formation${rosterFormation.latestHistory ? `. ${rosterFormation.latestHistory}` : "."}`,
        facts: [
          { label: "Status", value: rosterFormation.statusLabel },
          ...(rosterFormation.availabilityLabel
            ? [{ label: "Available", value: rosterFormation.availabilityLabel }]
            : []),
          ...(locationPresentation ? createLocationFacts(locationPresentation) : [{
            label: "Location",
            value: rosterFormation.locationHexKey
              ? (location?.roleLabel === "Naval task force" ? undefined : namedLocationLabel(location?.displayLabel))
                ?? namedLocationLabel(location?.locationLabel) ?? "Location not reported"
              : "Off map"
          }]),
          { label: "Readiness", value: rosterFormation.readiness },
          { label: "Cohesion", value: rosterFormation.cohesion },
          { label: "Fatigue", value: rosterFormation.fatigue },
          { label: "Personnel", value: rosterFormation.personnel },
          { label: "Equipment", value: rosterFormation.equipment },
          { label: "Supply", value: rosterFormation.supply },
          { label: "Experience", value: `${rosterFormation.experience} · ${rosterFormation.battles} battle${rosterFormation.battles === 1 ? "" : "s"}` },
          { label: "Current order", value: currentOrderLabel },
          ...(transitRoute ? [{ label: "Route", value: transitRoute }] : []),
          { label: "Honors", value: rosterFormation.honors.join(", ") || "None" }
        ],
        mode: "projected",
        ...(location && rosterFormation.locationHexKey ? {
          parentRoute: { hexKey: rosterFormation.locationHexKey, label: `Back to ${location.location?.primaryLabel ?? namedLocationLabel(location.displayLabel) ?? "base"}` },
          mode: "projectedWithActions" as const,
          showSelectionActions: rosterFormation.canReceiveOrders !== false && (location.showSelectionActions ?? location.hasContextActions === true),
          showEngagementAction: rosterFormation.canReceiveOrders !== false && location.showEngagementAction === true,
          actionSummary: rosterFormation.blockingReason ?? location.actionSummary
        } : {})
      };
    }
    const formation = view.afterActionReports
      ?.flatMap((report) => report.formations)
      .find((entry) => entry.id === selection.id);
    if (!formation) return emptyRoute("formation", selection.id);
    return {
      kind: "formation",
      title: formation.name,
      summary: formation.disposition,
      facts: [
        { label: "Personnel", value: formation.personnel },
        { label: "Condition", value: formation.condition }
      ],
      mode: "projected"
    };
  }
  if (selection.kind === "contact") {
    const contact = view.contacts?.find((entry) => entry.id === selection.id);
    if (!contact) return emptyRoute("contact", selection.id);
    const locationLabel = contact.location?.primaryLabel ?? namedLocationLabel(contact.locationLabel);
    return {
      kind: "contact",
      title: locationLabel ? `${locationLabel} — ${contact.label}` : contact.label,
      summary: `${contact.confidenceBand} confidence assessment from ${contact.sourceLabels.join(", ") || "unattributed reporting"}.`,
      facts: [
        { label: "State", value: contact.state },
        ...(contact.location ? createLocationFacts(contact.location, undefined, "Assessed location") : [
          { label: "Assessed location", value: locationLabel ?? "Location not reported" },
          { label: "Grid reference", value: `Grid ${contact.locationHexKey}` },
          { label: "Uncertainty", value: `${contact.uncertaintyRadius} hex radius` }
        ]),
        ...(contact.locationRoleLabel ? [{ label: "Known site", value: contact.locationRoleLabel }] : []),
        { label: "Age", value: `${contact.ageSegments} segment${contact.ageSegments === 1 ? "" : "s"}` },
        ...(contact.strengthBand ? [{ label: "Assessed strength", value: contact.strengthBand }] : [])
      ],
      mode: "projected"
    };
  }
  if (selection.kind === "theaterRegion") {
    const region = view.knownRegions?.find((entry) => entry.id === selection.id);
    if (!region) return emptyRoute("theaterRegion", selection.id);
    return {
      kind: "theaterRegion",
      title: region.label,
      summary: region.summary,
      facts: [
        { label: "Context", value: region.categoryLabel },
        { label: "Includes", value: region.locations.join(" · ") },
        { label: "Command status", value: region.commandStatus }
      ],
      mode: "projected"
    };
  }
  if (selection.kind === "front") {
    const front = view.fronts?.find((entry) => entry.key === selection.id);
    if (!front) return emptyRoute("front", selection.id);
    return {
      kind: "front",
      title: front.label,
      summary: front.pressureLabel ?? "Review this front before issuing the next command.",
      facts: [
        { label: "Initiative", value: front.initiativeLabel },
        ...createLocationFacts(front.location, front.label, front.targetHexKey ? "Opposing target" : "Location"),
        ...(front.hexKeys.length > 1 ? [{ label: "Sectors", value: front.hexKeys.length.toLocaleString() }] : []),
        ...(front.engagementLabel ? [{ label: "Engagement", value: front.engagementLabel }] : []),
        ...(!front.location && front.targetHexKey ? [{ label: "Grid reference", value: `Grid ${front.targetHexKey}` }] : []),
        ...(front.roleLabel ? [{ label: "Roles", value: front.roleLabel }] : []),
        ...(front.intelligenceUnknowns?.length ? [{ label: "Intelligence unknowns", value: front.intelligenceUnknowns.join(" · ") }] : []),
        ...(front.targetChoiceLabel ? [{ label: "Target decision", value: front.targetChoiceLabel }] : []),
        ...(front.stageLabel ? [{ label: "Next development", value: front.stageLabel }] : []),
        ...(front.forcePosture ? [{ label: "Friendly posture", value: front.forcePosture }] : []),
        ...(front.objectivePosture ? [{ label: "Objectives", value: front.objectivePosture }] : []),
        ...(front.lastChange && !front.lastChange.startsWith("No recent") ? [{ label: "Last change", value: front.lastChange }] : [])
      ],
      mode: "projectedWithActions",
      showSelectionActions: true,
      showEngagementAction: true
    };
  }
  return emptyRoute(selection.kind, selection.id);
}

function groupBaseFormations(formations: readonly CampaignCommandFormationView[]): InspectorFormationGroup[] {
  const ready: CampaignCommandFormationView[] = [];
  const committed: CampaignCommandFormationView[] = [];
  const transit: CampaignCommandFormationView[] = [];
  const arriving: CampaignCommandFormationView[] = [];
  const recovering: CampaignCommandFormationView[] = [];
  formations.forEach((formation) => {
    const posture = formation.postureKey;
    const status = formation.statusLabel.toLowerCase();
    if (posture === "scheduledArrival" || formation.availabilityLabel || status === "unavailable") {
      arriving.push(formation);
    } else if (posture === "inTransit" || status === "in transit") {
      transit.push(formation);
    } else if (posture === "recovering" || ["isolated", "refitting", "shattered"].includes(status)) {
      recovering.push(formation);
    } else if (posture === "ready" || (status === "ready" && !formation.currentOrderId)) {
      ready.push(formation);
    } else {
      committed.push(formation);
    }
  });
  return [
    { key: "ready", label: "Ready now", formations: ready },
    { key: "committed", label: "Committed", formations: committed },
    { key: "transit", label: "In transit", formations: transit },
    { key: "arriving", label: "Arriving here", formations: arriving },
    { key: "recovering", label: "Recovering or unavailable", formations: recovering }
  ];
}

function groupBaseCommands(formations: readonly CampaignCommandFormationView[]): InspectorCommandGroup[] {
  const commands = new Map<string, CampaignCommandFormationView[]>();
  formations.forEach((formation) => {
    const commandLabel = formation.commandLabel ?? formation.name;
    commands.set(commandLabel, [...(commands.get(commandLabel) ?? []), formation]);
  });
  return Array.from(commands.entries()).map(([commandLabel, members]) => ({
    commandLabel,
    typeLabel: Array.from(new Set(members.map((member) => member.typeLabel))).join(" / "),
    formations: members,
    showSubordinates: members.every((member) => member.hasAuthoredSubordinateIdentity === true)
  }));
}

function emptyRoute(kind: Exclude<CampaignCommandSelection, null>["kind"], _id: string): CampaignInspectorRoute {
  const label = kind.replace(/([a-z])([A-Z])/g, "$1 $2");
  return {
    kind,
    title: label.charAt(0).toUpperCase() + label.slice(1),
    summary: "No current Player-safe assessment is available for this selection.",
    facts: [],
    mode: "empty"
  };
}
