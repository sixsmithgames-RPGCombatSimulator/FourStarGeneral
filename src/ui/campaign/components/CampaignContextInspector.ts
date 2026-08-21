/** Typed context-inspector shell and Player-safe route rendering. */

import type { CampaignCommandShellView } from "../CampaignCommandShell";
import type { CampaignCommandSelection } from "../CampaignCommandUIState";

interface InspectorFact {
  readonly label: string;
  readonly value: string;
}

interface CampaignInspectorRoute {
  readonly kind: Exclude<CampaignCommandSelection, null>["kind"] | "none";
  readonly title: string;
  readonly summary: string;
  readonly facts: readonly InspectorFact[];
  readonly mode: "compatibility" | "projected" | "projectedWithActions" | "empty";
  readonly mapTarget?: { readonly hexKey: string; readonly label: string };
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
  inspector.setAttribute("aria-label", "Campaign context inspector");
  inspector.innerHTML = `
    <header class="campaign-context-inspector__header">
      <div><span>Context inspector</span><h2 id="campaignInspectorTitle" tabindex="-1">Selection</h2></div>
      <button type="button" data-close-campaign-inspector aria-label="Close context inspector">×</button>
    </header>
    <section id="campaignContextInspectorRoute" class="campaign-context-inspector__route" aria-live="polite" hidden></section>
  `;
  const selection = workspacePanel.querySelector<HTMLElement>(".selection-section");
  const action = workspacePanel.querySelector<HTMLElement>(".action-section");
  if (selection) inspector.appendChild(selection);
  if (action) inspector.appendChild(action);
  return inspector;
}

export function renderCampaignContextInspector(
  inspector: HTMLElement,
  view: CampaignCommandShellView | null,
  selection: CampaignCommandSelection
): void {
  const route = resolveInspectorRoute(view, selection);
  inspector.dataset.selectionKind = route.kind;
  inspector.dataset.routeMode = route.mode;
  const title = inspector.querySelector<HTMLElement>(".campaign-context-inspector__header h2");
  if (title) title.textContent = route.title;
  const routeContainer = inspector.querySelector<HTMLElement>("#campaignContextInspectorRoute");
  const compatibilitySelection = inspector.querySelector<HTMLElement>(".selection-section");
  const compatibilityActions = inspector.querySelector<HTMLElement>(".action-section");
  const useCompatibility = route.mode === "compatibility";
  const showCompatibilityActions = useCompatibility || route.mode === "projectedWithActions";
  if (compatibilitySelection) compatibilitySelection.hidden = !(useCompatibility || route.mode === "projectedWithActions");
  if (compatibilityActions) compatibilityActions.hidden = !showCompatibilityActions;
  if (!routeContainer) return;
  routeContainer.hidden = useCompatibility;
  if (useCompatibility) {
    routeContainer.replaceChildren();
    return;
  }
  const facts = document.createElement("dl");
  facts.className = "campaign-context-inspector__facts";
  route.facts.forEach((fact) => {
    facts.append(createText("dt", "", fact.label), createText("dd", "", fact.value));
  });
  const content: HTMLElement[] = [createText("p", "campaign-context-inspector__summary", route.summary)];
  if (route.facts.length > 0) content.push(facts);
  if (route.mapTarget) {
    const mapAction = createText("button", "campaign-context-inspector__map-action", route.mapTarget.label) as HTMLButtonElement;
    mapAction.type = "button";
    mapAction.dataset.campaignMapHexTarget = route.mapTarget.hexKey;
    content.push(mapAction);
  }
  if (route.mode === "empty") content[0]?.classList.add("campaign-context-inspector__empty");
  routeContainer.replaceChildren(...content);
}

function resolveInspectorRoute(
  view: CampaignCommandShellView | null,
  selection: CampaignCommandSelection
): CampaignInspectorRoute {
  if (!selection) {
    return { kind: "none", title: "Selection", summary: "Select a map hex or command record to inspect it.", facts: [], mode: "compatibility" };
  }
  if (selection.kind === "hex") {
    const hex = view?.hexes?.find((entry) => entry.hexKey === selection.id);
    return {
      kind: "hex",
      title: hex?.displayLabel ?? `Operational hex ${selection.id}`,
      summary: hex
        ? hex.summary ?? `${hex.roleLabel} under ${hex.controlLabel.toLowerCase()}.`
        : "No projected installation or force record is present at this location.",
      facts: [
        { label: "Location", value: hex?.locationLabel ?? selection.id },
        ...(hex ? [
          { label: "Control", value: hex.controlLabel },
          { label: "Type", value: hex.roleLabel },
          ...(hex.forces.length > 0 ? [{ label: "Projected forces", value: hex.forces.join("; ") }] : []),
          ...(hex.infrastructure ? [{ label: "Infrastructure", value: hex.infrastructure }] : []),
          ...(hex.objectives.length > 0 ? [{ label: "Objectives", value: hex.objectives.join(", ") }] : []),
          ...(hex.fronts.length > 0 ? [{ label: "Fronts", value: hex.fronts.join(", ") }] : [])
        ] : [])
      ],
      mode: hex && hex.hasContextActions !== false ? "projectedWithActions" : "projected"
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
        ? { mapTarget: { hexKey: objective.hexKey, label: `Focus ${objective.hexKey} on the map` } }
        : {})
    };
  }
  if (selection.kind === "order") {
    const order = view.orders.find((entry) => entry.id === selection.id);
    if (!order) return emptyRoute("order", selection.id);
    return {
      kind: "order",
      title: order.label,
      summary: order.detail,
      facts: [
        { label: "Status", value: order.status },
        ...(order.mapHexKeys && order.mapHexKeys.length > 0
          ? [{ label: "Map route", value: order.mapHexKeys.join(" → ") }]
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
            { label: `Requires attention · ${issue.code}`, value: issue.message },
            { label: "Corrective action", value: issue.correctiveAction }
          ])
      ],
      mode: "projected"
    };
  }
  if (selection.kind === "report") {
    const report = view.afterActionReports?.find((entry) => entry.id === selection.id);
    if (!report) return emptyRoute("report", selection.id);
    return {
      kind: "report",
      title: report.title,
      summary: report.summary,
      facts: [
        { label: "Result", value: report.resultLabel },
        { label: "Time", value: report.timeLabel },
        { label: "Location", value: report.location },
        { label: "Friendly losses", value: report.personnelLosses },
        { label: "Assessed opposing losses", value: report.opponentLosses }
      ],
      mode: "projected",
      ...(report.locationHexKey
        ? { mapTarget: { hexKey: report.locationHexKey, label: `Focus ${report.location}` } }
        : {})
    };
  }
  if (selection.kind === "formation") {
    const rosterFormation = view.formations?.find((entry) => entry.id === selection.id);
    if (rosterFormation) {
      return {
        kind: "formation",
        title: rosterFormation.name,
        summary: `${rosterFormation.ownershipLabel} ${rosterFormation.typeLabel} formation${rosterFormation.latestHistory ? `. ${rosterFormation.latestHistory}` : "."}`,
        facts: [
          { label: "Status", value: rosterFormation.statusLabel },
          { label: "Location", value: rosterFormation.locationHexKey ?? "Off map" },
          { label: "Readiness", value: rosterFormation.readiness },
          { label: "Cohesion", value: rosterFormation.cohesion },
          { label: "Fatigue", value: rosterFormation.fatigue },
          { label: "Personnel", value: rosterFormation.personnel },
          { label: "Equipment", value: rosterFormation.equipment },
          { label: "Supply", value: rosterFormation.supply },
          { label: "Experience", value: `${rosterFormation.experience} · ${rosterFormation.battles} battle${rosterFormation.battles === 1 ? "" : "s"}` },
          { label: "Current order", value: rosterFormation.currentOrderId ?? "None" },
          { label: "Honors", value: rosterFormation.honors.join(", ") || "None" }
        ],
        mode: "projected"
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
    return {
      kind: "contact",
      title: contact.label,
      summary: `${contact.confidenceBand} confidence assessment from ${contact.sourceLabels.join(", ") || "unattributed reporting"}.`,
      facts: [
        { label: "State", value: contact.state },
        { label: "Assessed location", value: contact.locationHexKey },
        { label: "Uncertainty", value: `${contact.uncertaintyRadius} hex radius` },
        { label: "Age", value: `${contact.ageSegments} segment${contact.ageSegments === 1 ? "" : "s"}` },
        ...(contact.strengthBand ? [{ label: "Assessed strength", value: contact.strengthBand }] : [])
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
        ...(front.hexKeys.length > 1 ? [{ label: "Sectors", value: front.hexKeys.length.toLocaleString() }] : []),
        ...(front.engagementLabel ? [{ label: "Engagement", value: front.engagementLabel }] : []),
        ...(!front.engagementLabel && front.targetHexKey ? [{ label: "Opposing target", value: front.targetHexKey }] : []),
        ...(front.roleLabel ? [{ label: "Roles", value: front.roleLabel }] : []),
        ...(front.intelligenceUnknowns?.length ? [{ label: "Intelligence unknowns", value: front.intelligenceUnknowns.join(" · ") }] : []),
        ...(front.targetChoiceLabel ? [{ label: "Target decision", value: front.targetChoiceLabel }] : []),
        ...(front.forcePosture ? [{ label: "Friendly posture", value: front.forcePosture }] : []),
        ...(front.objectivePosture ? [{ label: "Objectives", value: front.objectivePosture }] : []),
        ...(front.lastChange && !front.lastChange.startsWith("No recent") ? [{ label: "Last change", value: front.lastChange }] : [])
      ],
      mode: "projectedWithActions"
    };
  }
  return emptyRoute(selection.kind, selection.id);
}

function emptyRoute(kind: Exclude<CampaignCommandSelection, null>["kind"], id: string): CampaignInspectorRoute {
  const label = kind.replace(/([a-z])([A-Z])/g, "$1 $2");
  return {
    kind,
    title: label.charAt(0).toUpperCase() + label.slice(1),
    summary: `No Player-safe projected detail is available for ${id}.`,
    facts: [],
    mode: "empty"
  };
}
