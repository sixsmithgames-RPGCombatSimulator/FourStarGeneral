/**
 * Pure decision projections for Forces and Intelligence. Inputs are exclusively the
 * command shell's already sanitized view; this module never consults campaign truth.
 */
import type {
  CampaignCommandContactView,
  CampaignCommandFormationView,
  CampaignCommandIntelBriefView,
  CampaignCommandShellView
} from "./CampaignCommandShell";

/** Readiness categories reflect the supplied authoritative posture, never a percentage threshold. */
export type CampaignForceFilter = "all" | "ready" | "committed" | "inTransit" | "arriving" | "recovering";

/** One selectable command member with only decision-relevant, player-safe fields. */
export interface CampaignForceRow {
  readonly id: string;
  readonly selectionKind: "formation" | "hex";
  readonly commandLabel: string;
  readonly name: string;
  readonly locationLabel: string;
  readonly gridReference: string;
  readonly statusLabel: string;
  readonly category: CampaignForceFilter | "unavailable";
  readonly readiness: string;
  readonly strength: string;
  readonly equipment: string;
  readonly availability: string | null;
  /** Formatted arrival estimate from the active movement order; never an orderability promise. */
  readonly transitEta?: string;
  readonly blockingReason: string | null;
}

/** A headquarters and its subordinate formations at one operational grouping. */
export interface CampaignForceCommand {
  readonly label: string;
  readonly rows: readonly CampaignForceRow[];
}

/** A named front, objective, or rear-area location, with nonduplicated command counts. */
export interface CampaignForceGroup {
  readonly key: string;
  readonly label: string;
  readonly active: boolean;
  readonly commandCount: number;
  readonly formationCount: number;
  readonly readyCount: number;
  readonly statusSummary: string;
  readonly commands: readonly CampaignForceCommand[];
}

/** Discovery controls apply to the full safe roster; only the unfiltered default is front-limited. */
export interface CampaignForcesProjection {
  readonly groups: readonly CampaignForceGroup[];
  readonly theaterGroups: readonly CampaignForceGroup[];
  readonly totalCount: number;
  readonly matchingCount: number;
  readonly activeCount: number;
  readonly searchingTheater: boolean;
}

type ForcesInput = Pick<CampaignCommandShellView, "forces" | "formations" | "fronts" | "objectives" | "hexes" | "knownSites">
  & Partial<Pick<CampaignCommandShellView, "orders">>;

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function forceCategory(formation: CampaignCommandFormationView): CampaignForceRow["category"] {
  // A high readiness percentage does not override a reservation, transit, or recovery block.
  if (formation.postureKey === "ready") return formation.canReceiveOrders === true ? "ready" : "unavailable";
  if (formation.postureKey === "assigned" || formation.postureKey === "committed") return "committed";
  if (formation.postureKey === "scheduledArrival") return "arriving";
  if (formation.postureKey === "inTransit" || formation.postureKey === "recovering") return formation.postureKey;
  return "unavailable";
}

/** Projects the active command picture while retaining all rear, unplaced, and arriving formations. */
export function projectCampaignForcesWorkspace(
  view: ForcesInput,
  options: { readonly query?: string; readonly filter?: CampaignForceFilter } = {}
): CampaignForcesProjection {
  const fronts = view.fronts ?? [];
  const objectives = view.objectives.filter((objective) => objective.status === "In progress");
  const entries: { row: CampaignForceRow; key: string; label: string; active: boolean }[] = [];
  const add = (
    row: CampaignForceRow,
    hexKey: string | null,
    frontKey?: string,
    objectiveKey?: string,
    transitKey?: string
  ): void => {
    const front = fronts.find((entry) => frontKey ? entry.key === frontKey : hexKey !== null && entry.hexKeys.includes(hexKey));
    const objective = objectives.find((entry) => objectiveKey ? entry.key === objectiveKey : hexKey !== null && entry.hexKey === hexKey);
    entries.push({
      row,
      key: front ? `front:${front.key}` : objective ? `objective:${objective.key}` : transitKey ?? `location:${hexKey ?? "unplaced"}`,
      label: front?.label ?? objective?.label ?? row.locationLabel,
      active: Boolean(front || objective)
    });
  };
  const locationAt = (hexKey: string | null): { primaryLabel: string; secondaryGridReference: string } | undefined => {
    if (hexKey === null) return undefined;
    return view.hexes?.find((hex) => hex.hexKey === hexKey)?.location
      ?? view.knownSites?.find((site) => site.locationHexKey === hexKey)?.location;
  };

  if (view.formations !== undefined) {
    const seen = new Set<string>();
    for (const formation of view.formations) {
      if (seen.has(formation.id)) continue;
      seen.add(formation.id);
      const inTransit = formation.postureKey === "inTransit";
      // The exact current-order link supplies route context, not a new map position.
      // Filed or unrelated orders must not keep an arrived/cancelled formation moving.
      const movement = inTransit && formation.currentOrderId !== null
        ? view.orders?.find((order) => order.id === formation.currentOrderId && order.kind === "redeploy"
          && (order.status === "committed" || order.status === "executing"))
        : undefined;
      const route = movement?.routeSummary?.trim();
      const locationHexKey = inTransit ? null : formation.locationHexKey;
      const location = inTransit ? undefined : formation.location ?? locationAt(locationHexKey);
      const front = fronts.find((entry) => entry.key === formation.operationalFrontKey
        || (locationHexKey !== null && entry.hexKeys.includes(locationHexKey)));
      const objective = objectives.find((entry) => entry.key === formation.objectiveKey
        || (locationHexKey !== null && entry.hexKey === locationHexKey));
      add({
        id: formation.id,
        selectionKind: "formation",
        commandLabel: formation.commandLabel?.trim() || formation.name,
        name: formation.name,
        locationLabel: inTransit ? `In transit · ${route || "Route not reported"}`
          : location?.primaryLabel ?? front?.label ?? objective?.label ?? "Location not reported",
        gridReference: location?.secondaryGridReference ?? (locationHexKey === null ? "No map position assigned" : `Grid ${locationHexKey}`),
        statusLabel: formation.statusLabel,
        category: forceCategory(formation),
        readiness: formation.readiness,
        strength: formation.personnel,
        equipment: formation.equipment,
        availability: formation.availabilityLabel ?? null,
        ...(movement?.eta ? { transitEta: movement.eta } : {}),
        blockingReason: formation.blockingReason ?? null
      }, locationHexKey, formation.operationalFrontKey, formation.objectiveKey,
      inTransit ? `transit:${movement ? JSON.stringify(movement.mapHexKeys?.length ? movement.mapHexKeys : [movement.id]) : "unreported"}` : undefined);
    }
  } else {
    // Legacy aggregate views carry strength, not formation readiness. Keep that absence explicit.
    for (const force of view.forces) {
      const location = force.location ?? locationAt(force.hexKey);
      const front = fronts.find((entry) => entry.hexKeys.includes(force.hexKey));
      const objective = objectives.find((entry) => entry.hexKey === force.hexKey);
      add({
        id: force.hexKey,
        selectionKind: "hex",
        commandLabel: force.label,
        name: force.label,
        locationLabel: location?.primaryLabel ?? front?.label ?? objective?.label ?? "Location not reported",
        gridReference: location?.secondaryGridReference ?? `Grid ${force.hexKey}`,
        statusLabel: "Formation status not reported",
        category: "unavailable",
        readiness: "Not reported",
        strength: `Strength ${force.count.toLocaleString()}`,
        equipment: "Equipment not reported",
        availability: null,
        blockingReason: "Inspect this command to review its formation records."
      }, force.hexKey);
    }
  }

  const filter = options.filter ?? "all";
  const tokens = normalize(options.query ?? "").split(/\s+/).filter(Boolean);
  const matching = entries.filter((entry) => (filter === "all" || entry.row.category === filter)
    && tokens.every((token) => normalize(`${entry.row.id} ${entry.row.commandLabel} ${entry.row.name} ${entry.row.locationLabel} ${entry.row.statusLabel} ${entry.row.transitEta ?? ""} ${entry.label}`).includes(token)));
  const groupEntries = (rows: typeof entries): CampaignForceGroup[] => {
    const groups = new Map<string, typeof entries>();
    for (const entry of rows) {
      const group = groups.get(entry.key) ?? [];
      group.push(entry);
      groups.set(entry.key, group);
    }
    return Array.from(groups, ([key, members]) => {
      const commands = new Map<string, CampaignForceRow[]>();
      for (const member of members) {
        const command = commands.get(member.row.commandLabel) ?? [];
        command.push(member.row);
        commands.set(member.row.commandLabel, command);
      }
      const readyCount = members.filter((entry) => entry.row.category === "ready").length;
      const statuses = new Map<string, number>();
      for (const member of members) statuses.set(member.row.statusLabel, (statuses.get(member.row.statusLabel) ?? 0) + 1);
      return {
        key,
        label: members[0].label,
        active: members[0].active,
        commandCount: commands.size,
        formationCount: members.length,
        readyCount,
        statusSummary: Array.from(statuses, ([status, count]) => `${count} ${status.toLowerCase()}`).join(" · "),
        commands: Array.from(commands, ([label, commandRows]) => ({ label, rows: commandRows.slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) }))
          .sort((a, b) => a.label.localeCompare(b.label))
      };
    }).sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  };
  const searchingTheater = tokens.length > 0 || filter !== "all";
  return {
    groups: groupEntries(searchingTheater ? matching : matching.filter((entry) => entry.active)),
    theaterGroups: groupEntries(matching),
    totalCount: entries.length,
    matchingCount: matching.length,
    activeCount: entries.filter((entry) => entry.active).length,
    searchingTheater
  };
}

/** Independent filters preserve stale/disputed knowledge rather than treating it as current truth. */
export interface CampaignIntelligenceFilters {
  readonly priority: "all" | "critical" | "notable" | "routine";
  readonly currency: "all" | "current" | "stale" | "disputed" | "lost";
  readonly uncertainty: "all" | "uncertain" | "precise";
}

/** Safe contact facts for briefing and contact selection, without exposing unobserved records. */
export interface CampaignIntelligenceContact {
  readonly id: string;
  readonly label: string;
  readonly locationLabel: string;
  readonly gridReference: string;
  readonly sectorLabel: string;
  readonly priority: "routine" | "notable" | "critical";
  readonly threatLabel: string;
  readonly state: CampaignCommandContactView["state"];
  readonly ageLabel: string;
  readonly uncertaintyLabel: string;
  readonly uncertain: boolean;
  readonly sourceLabel: string;
  readonly strengthLabel: string;
}

/** A briefing event enriched only from a currently authorized contact. */
export interface CampaignIntelligenceReport {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly timeLabel: string;
  readonly segment: number;
  readonly read: boolean;
  readonly kind: CampaignCommandIntelBriefView["kind"];
  readonly contactId: string | null;
  readonly sectorLabel: string;
  readonly priority: "routine" | "notable" | "critical";
  readonly threatLabel: string;
  readonly changeLabel: string;
}

/** Reports and contacts share sector, threat, and priority grouping without repeating coordinate cards. */
export interface CampaignIntelligenceGroup {
  readonly key: string;
  readonly sectorLabel: string;
  readonly priority: "routine" | "notable" | "critical";
  readonly threatLabel: string;
  readonly reports: readonly CampaignIntelligenceReport[];
  readonly contacts: readonly CampaignIntelligenceContact[];
}

/** New information leads; persisted read history remains secondary and does not count as unread. */
export interface CampaignIntelligenceProjection {
  readonly briefing: readonly CampaignIntelligenceGroup[];
  readonly contacts: readonly CampaignIntelligenceGroup[];
  readonly history: readonly CampaignIntelligenceReport[];
  readonly unreadCount: number;
  readonly canMarkRead: boolean;
  readonly totalContactCount: number;
  readonly matchingContactCount: number;
  readonly unmatchedUnreadCount: number;
}

const PRIORITY_ORDER = { critical: 0, notable: 1, routine: 2 } as const;

/** Builds a briefing from persisted safe events, never from hidden truth or render-time diffs. */
export function projectCampaignIntelligenceWorkspace(
  view: Pick<CampaignCommandShellView, "contacts" | "fronts" | "intelligenceBriefs" | "intelligenceUnreadReports" | "situation">,
  filters: CampaignIntelligenceFilters = { priority: "all", currency: "all", uncertainty: "all" }
): CampaignIntelligenceProjection {
  const contacts = new Map<string, CampaignIntelligenceContact>();
  for (const contact of view.contacts ?? []) {
    if (contacts.has(contact.id)) continue;
    const front = view.fronts?.find((entry) => entry.hexKeys.includes(contact.locationHexKey));
    contacts.set(contact.id, {
      id: contact.id,
      label: contact.label,
      locationLabel: contact.location?.primaryLabel ?? contact.locationLabel ?? front?.label ?? "Location not reported",
      gridReference: contact.location?.secondaryGridReference ?? `Grid ${contact.locationHexKey}`,
      sectorLabel: contact.sectorLabel ?? front?.label ?? contact.location?.primaryLabel ?? contact.locationLabel ?? "Sector not reported",
      priority: contact.priority ?? "routine",
      threatLabel: contact.threatLabel ?? "Unclassified contact",
      state: contact.state,
      ageLabel: contact.ageSegments === 0 ? "Observed this segment" : `${contact.ageSegments * 3}h since observation`,
      uncertaintyLabel: `${contact.confidenceBand} confidence · ${contact.uncertaintyRadius > 0 ? `location within ${contact.uncertaintyRadius} hex${contact.uncertaintyRadius === 1 ? "" : "es"}` : "reported position"}`,
      uncertain: contact.uncertaintyRadius > 0 || contact.confidenceBand !== "high" || contact.state !== "current",
      sourceLabel: contact.sourceLabels.length > 0 ? contact.sourceLabels.join(", ") : "Source not reported",
      strengthLabel: contact.strengthBand ? `${contact.strengthBand} reported strength` : "Strength unknown"
    });
  }
  const matchesContact = (contact: CampaignIntelligenceContact): boolean => (filters.priority === "all" || contact.priority === filters.priority)
    && (filters.currency === "all" || contact.state === filters.currency)
    && (filters.uncertainty === "all" || (filters.uncertainty === "uncertain" ? contact.uncertain : !contact.uncertain));
  const events = new Map<string, CampaignCommandIntelBriefView>();
  for (const event of view.intelligenceBriefs ?? []) if (!events.has(event.id)) events.set(event.id, event);
  const reports = Array.from(events.values(), (event): CampaignIntelligenceReport => {
    const contact = event.contactId ? contacts.get(event.contactId) : undefined;
    return {
      id: event.id,
      title: event.title,
      detail: event.detail,
      timeLabel: event.timeLabel,
      segment: event.segment,
      read: event.read,
      kind: event.kind,
      contactId: contact?.id ?? null,
      sectorLabel: event.sectorLabel ?? contact?.sectorLabel ?? "Theater intelligence",
      priority: event.priority ?? contact?.priority ?? "routine",
      threatLabel: contact?.threatLabel ?? (event.kind === "operation" ? "Collection operations" : "Contact assessment"),
      changeLabel: event.kind === "new" ? "New contact" : event.materiallyChanged === true ? "Material change" : {
        upgraded: "Assessment upgraded", downgraded: "Assessment downgraded", stale: "Report became stale",
        disputed: "Conflicting reports", operation: "Collection result"
      }[event.kind]
    };
  }).sort((a, b) => b.segment - a.segment || a.id.localeCompare(b.id));
  const unreadCount = view.intelligenceUnreadReports ?? view.situation?.intelligenceUnread ?? reports.filter((event) => !event.read).length;
  const unread = reports.filter((event) => !event.read);
  const matchesReport = (report: CampaignIntelligenceReport): boolean => {
    if (filters.priority !== "all" && report.priority !== filters.priority) return false;
    const contact = report.contactId ? contacts.get(report.contactId) : undefined;
    if (!contact) return filters.currency === "all" && filters.uncertainty === "all";
    return (filters.currency === "all" || contact.state === filters.currency)
      && (filters.uncertainty === "all" || (filters.uncertainty === "uncertain" ? contact.uncertain : !contact.uncertain));
  };
  const group = (groupReports: readonly CampaignIntelligenceReport[], groupContacts: readonly CampaignIntelligenceContact[]): CampaignIntelligenceGroup[] => {
    const groups = new Map<string, { key: string; sectorLabel: string; priority: CampaignIntelligenceContact["priority"]; threatLabel: string; reports: CampaignIntelligenceReport[]; contacts: CampaignIntelligenceContact[] }>();
    for (const item of [...groupReports, ...groupContacts]) {
      const key = JSON.stringify([item.sectorLabel, item.priority, item.threatLabel]);
      const entry = groups.get(key) ?? { key, sectorLabel: item.sectorLabel, priority: item.priority, threatLabel: item.threatLabel, reports: [], contacts: [] };
      if ("read" in item) entry.reports.push(item);
      else entry.contacts.push(item);
      groups.set(key, entry);
    }
    return Array.from(groups.values()).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      || a.sectorLabel.localeCompare(b.sectorLabel) || a.threatLabel.localeCompare(b.threatLabel));
  };
  const matchingContacts = Array.from(contacts.values()).filter(matchesContact)
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return {
    briefing: group(unreadCount > 0 ? unread.filter(matchesReport) : [], []),
    contacts: group([], matchingContacts),
    history: reports.filter((event) => event.read),
    unreadCount,
    canMarkRead: unreadCount > 0 && unread.length > 0,
    totalContactCount: contacts.size,
    matchingContactCount: matchingContacts.length,
    unmatchedUnreadCount: Math.max(0, unreadCount - unread.length)
  };
}
