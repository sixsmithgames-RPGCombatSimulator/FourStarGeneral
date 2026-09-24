import type { RosterSnapshotEntry } from "../../contracts/IPopupManager";
import { extractDisplayInitials } from "./InitialsPresentation";

export interface RosterEntryPresentation {
  readonly unitKey: string;
  readonly label: string;
  readonly status: RosterSnapshotEntry["status"];
  readonly markup: string;
}

export interface RosterSectionPresentation {
  readonly entries: readonly RosterEntryPresentation[];
  readonly markup: string;
}

type RosterStatKey = "STR" | "EXP" | "AMMO" | "FUEL" | "CHARGES";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statClass(key: RosterStatKey, value: number | string): string {
  if (typeof value === "string") return "";
  if (key === "STR") {
    if (value <= 25) return " army-roster-stat--critical";
    if (value <= 50) return " army-roster-stat--warning";
    if (value >= 90) return " army-roster-stat--good";
  }
  if (key === "AMMO") {
    if (value <= 1) return " army-roster-stat--critical";
    if (value <= 3) return " army-roster-stat--warning";
    if (value >= 8) return " army-roster-stat--good";
  }
  if (key === "FUEL") {
    if (value <= 10) return " army-roster-stat--critical";
    if (value <= 25) return " army-roster-stat--warning";
    if (value >= 60) return " army-roster-stat--good";
  }
  if (key === "CHARGES") {
    if (value === 0) return " army-roster-stat--critical";
    if (value <= 1) return " army-roster-stat--warning";
    if (value >= 3) return " army-roster-stat--good";
  }
  return "";
}

function composeStatsMarkup(entry: Readonly<RosterSnapshotEntry>): string {
  const isOffMapSupport = entry.status === "support"
    && entry.supportCategory !== "Air Support"
    && entry.strength < 10
    && entry.fuel == null;
  if (isOffMapSupport) {
    return `<span class="army-roster-stat${statClass("CHARGES", entry.strength)}"><abbr title="Charges Remaining">CHARGES</abbr><strong>${entry.strength}</strong></span>`;
  }

  const metrics: readonly { readonly key: RosterStatKey; readonly title: string; readonly value: number | string }[] = [
    { key: "STR", title: "Strength", value: entry.strength },
    { key: "EXP", title: "Experience", value: entry.experience },
    { key: "AMMO", title: "Ammo", value: entry.ammo },
    { key: "FUEL", title: "Fuel", value: entry.fuel ?? "—" }
  ];
  return metrics.map((metric) => {
    const displayValue = metric.key === "FUEL" && entry.fuel == null ? "—" : String(metric.value);
    return `<span class="army-roster-stat${statClass(metric.key, metric.value)}"><abbr title="${escapeHtml(metric.title)}">${metric.key}</abbr><strong>${escapeHtml(displayValue)}</strong></span>`;
  }).join("");
}

function composeDetailsMarkup(entry: Readonly<RosterSnapshotEntry>): string {
  const roleMarkup = entry.logisticsRole
    ? `<span class="army-roster-detail army-roster-detail--role">${escapeHtml(entry.logisticsRole === "repair" ? "Repair logistics" : entry.logisticsRole === "medical" ? "Medical logistics" : "Supply logistics")}</span>`
    : "";
  const personnelMarkup = entry.personnelStatus && entry.personnelStatus.total > 0
    ? `<span class="army-roster-detail" title="Personnel status">P ${entry.personnelStatus.fit}/${entry.personnelStatus.total} fit · ${entry.personnelStatus.injured} inj · ${entry.personnelStatus.wounded} wnd · ${entry.personnelStatus.severelyWounded} sev · ${entry.personnelStatus.killed} KIA · ${entry.personnelStatus.readiness ?? 0}% ready</span>`
    : "";
  const equipmentMarkup = entry.equipmentStatus && entry.equipmentStatus.total > 0
    ? `<span class="army-roster-detail" title="Vehicle and equipment status">Eq ${entry.equipmentStatus.operational}/${entry.equipmentStatus.total} op · ${entry.equipmentStatus.damaged} dmg · ${entry.equipmentStatus.disabled} dis · ${entry.equipmentStatus.destroyed} lost · ${entry.equipmentStatus.readiness ?? 0}% ready</span>`
    : "";
  const suppressionMarkup = typeof entry.suppression === "number" && entry.suppression > 0
    ? `<span class="army-roster-detail army-roster-detail--suppression">Supp ${entry.suppression}</span>`
    : "";
  return [roleMarkup, personnelMarkup, equipmentMarkup, suppressionMarkup].filter(Boolean).join("");
}

function composeRosterEntryMarkup(entry: Readonly<RosterSnapshotEntry>): string {
  const spriteMarkup = entry.sprite
    ? `<img src="${escapeHtml(entry.sprite)}" alt="" class="reserve-thumb" aria-hidden="true" />`
    : `<span class="reserve-thumb reserve-thumb--fallback" aria-hidden="true">${escapeHtml(extractDisplayInitials(entry.label))}</span>`;
  const statusCopy = entry.status === "deployed" ? "Frontline"
    : entry.status === "reserves" ? "Reserve"
      : entry.status === "support" ? (entry.supportCategory ?? "Support") : "Out of action";
  const statusClass = entry.status === "deployed" ? "army-roster-status--frontline"
    : entry.status === "reserves" ? "army-roster-status--reserve"
      : entry.status === "support" ? "army-roster-status--support" : "army-roster-status--exhausted";
  const detailMarkup = composeDetailsMarkup(entry);
  const selectableClass = entry.status === "reserves" ? " reserves-selectable" : "";
  const deployButtonMarkup = entry.status === "reserves"
    ? `<button type="button" class="roster-deploy-btn" data-roster-deploy="${escapeHtml(entry.unitKey)}" aria-label="Deploy ${escapeHtml(entry.label)} from reserves to base camp" title="Reserve call-ups arrive at base camp automatically">Deploy</button>`
    : "";

  return `
      <li class="army-roster-item">
        <div class="army-roster-entry reserve-item${selectableClass}" data-unit-key="${escapeHtml(entry.unitKey)}">
          <div class="reserve-visual">${spriteMarkup}</div>
          <div class="reserve-copy">
            <div class="army-roster-line">
              <strong>${escapeHtml(entry.label)}</strong>
              <span class="army-roster-status ${statusClass}">${escapeHtml(statusCopy)}</span>
            </div>
            <div class="army-roster-stats">${composeStatsMarkup(entry)}</div>
${detailMarkup ? `            <div class="army-roster-details">${detailMarkup}</div>` : ""}
          </div>
          ${deployButtonMarkup ? `<div class="roster-actions">${deployButtonMarkup}</div>` : ""}
        </div>
      </li>
    `;
}

/** Creates the detached, canonical presentation for one populated roster section. */
export function projectRosterSectionPresentation(
  sourceEntries: readonly RosterSnapshotEntry[]
): RosterSectionPresentation {
  const labelTotals = new Map<string, number>();
  sourceEntries.forEach((entry) => labelTotals.set(entry.label, (labelTotals.get(entry.label) ?? 0) + 1));
  const labelSeen = new Map<string, number>();
  const entries = sourceEntries.map((source): RosterEntryPresentation => {
    const occurrence = (labelSeen.get(source.label) ?? 0) + 1;
    labelSeen.set(source.label, occurrence);
    const label = (labelTotals.get(source.label) ?? 0) > 1 ? `${source.label} #${occurrence}` : source.label;
    const detachedEntry: RosterSnapshotEntry = {
      ...source,
      label,
      personnelStatus: source.personnelStatus ? { ...source.personnelStatus } : undefined,
      equipmentStatus: source.equipmentStatus ? { ...source.equipmentStatus } : undefined
    };
    return {
      unitKey: detachedEntry.unitKey,
      label: detachedEntry.label,
      status: detachedEntry.status,
      markup: composeRosterEntryMarkup(detachedEntry)
    };
  });
  return { entries, markup: entries.map((entry) => entry.markup).join("") };
}
