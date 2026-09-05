/**
 * Pure decision projections for Forces and Intelligence. Inputs are exclusively the
 * command shell's already sanitized view; this module never consults campaign truth.
 */
import type {
  CampaignCommandFormationView,
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

type ForcesInput = Pick<CampaignCommandShellView, "forces" | "formations" | "fronts" | "objectives" | "hexes" | "knownSites">;

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
    objectiveKey?: string
  ): void => {
    const front = fronts.find((entry) => frontKey ? entry.key === frontKey : hexKey !== null && entry.hexKeys.includes(hexKey));
    const objective = objectives.find((entry) => objectiveKey ? entry.key === objectiveKey : hexKey !== null && entry.hexKey === hexKey);
    entries.push({
      row,
      key: front ? `front:${front.key}` : objective ? `objective:${objective.key}` : `location:${hexKey ?? "unplaced"}`,
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
      const location = formation.location ?? locationAt(formation.locationHexKey);
      const front = fronts.find((entry) => entry.key === formation.operationalFrontKey
        || (formation.locationHexKey !== null && entry.hexKeys.includes(formation.locationHexKey)));
      const objective = objectives.find((entry) => entry.key === formation.objectiveKey
        || (formation.locationHexKey !== null && entry.hexKey === formation.locationHexKey));
      add({
        id: formation.id,
        selectionKind: "formation",
        commandLabel: formation.commandLabel?.trim() || formation.name,
        name: formation.name,
        locationLabel: location?.primaryLabel ?? front?.label ?? objective?.label ?? "Location not reported",
        gridReference: location?.secondaryGridReference ?? (formation.locationHexKey === null ? "No map position assigned" : `Grid ${formation.locationHexKey}`),
        statusLabel: formation.statusLabel,
        category: forceCategory(formation),
        readiness: formation.readiness,
        strength: formation.personnel,
        equipment: formation.equipment,
        availability: formation.availabilityLabel ?? null,
        blockingReason: formation.blockingReason ?? null
      }, formation.locationHexKey, formation.operationalFrontKey, formation.objectiveKey);
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
    && tokens.every((token) => normalize(`${entry.row.commandLabel} ${entry.row.name} ${entry.row.locationLabel} ${entry.label}`).includes(token)));
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
