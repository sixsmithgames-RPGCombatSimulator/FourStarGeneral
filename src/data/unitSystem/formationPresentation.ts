import type { UnitCompositionProfile } from "../unitComposition";

export interface AllocationCompositionDisplay {
  readonly summary: readonly string[];
  readonly details: readonly string[];
}

const SUPPORT_PLATFORM_LABEL = /^(support\s+)?vehicles?(\s+and\s+major\s+platforms)?$/i;
const AIRCRAFT_LABEL = /\b(aircraft|plane|planes|fighter|fighters|fighter-bomber|fighter-bombers|bomber|bombers|interceptor|interceptors)\b/i;
const GROUND_VEHICLE_LABEL = /\b(tank|tanks|tank destroyer|tank destroyers|assault gun|assault guns|self-propelled gun|self-propelled guns|truck|trucks|lorry|lorries|jeep|jeeps|bowser|bowsers|halftrack|halftracks|car|cars|motorbike|motorbikes|vehicle|vehicles|carrier|carriers|tractor|tractors|prime mover|prime movers|ambulance|ambulances)\b/i;
const TOWED_WEAPON_LABEL = /\b(gun|guns|howitzer|howitzers)\b/i;

function formatCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString();
}

function normalizeDisplayText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[,/]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\d[\d,]*\s+/, "")
    .trim();
}

function titleCaseFirst(value: string): string {
  const trimmed = value.trim();
  return trimmed.length === 0 ? trimmed : `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`;
}

function pushUnique(values: string[], value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  const normalized = normalizeDisplayText(trimmed);
  if (!normalized || values.some((existing) => normalizeDisplayText(existing) === normalized)) {
    return;
  }
  values.push(trimmed);
}

function displayCountedLabel(count: number, label: string, headlineTotal: number): string {
  if (count === headlineTotal || count === 1) {
    return titleCaseFirst(label);
  }
  return `${formatCount(count)} ${label}`;
}

function formatMobilitySummary(composition: UnitCompositionProfile): string {
  if (composition.vehicles <= 0) {
    return "Moves on foot; no vehicles assigned";
  }

  const concreteEntries = composition.vehicleBreakdown.filter((entry) => !SUPPORT_PLATFORM_LABEL.test(entry.label));
  const concreteCount = concreteEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const supportVehicleCount = Math.max(0, composition.vehicles - concreteCount);
  const hasAircraft = concreteEntries.some((entry) => AIRCRAFT_LABEL.test(entry.label));
  const hasGroundVehicles = concreteEntries.some((entry) => GROUND_VEHICLE_LABEL.test(entry.label));
  const hasTowedWeapons = concreteEntries.some((entry) =>
    TOWED_WEAPON_LABEL.test(entry.label) && !GROUND_VEHICLE_LABEL.test(entry.label)
  );

  if (hasAircraft && !hasGroundVehicles && !hasTowedWeapons) {
    return `${formatCount(composition.vehicles)} aircraft`;
  }
  if (hasTowedWeapons && supportVehicleCount > 0) {
    return `${formatCount(composition.vehicles)} guns and vehicles`;
  }
  if (hasTowedWeapons && !hasGroundVehicles) {
    return `${formatCount(composition.vehicles)} heavy weapons`;
  }
  return `${formatCount(composition.vehicles)} vehicles`;
}

export function buildAllocationCompositionDisplay(
  composition: UnitCompositionProfile | null | undefined,
  options: { readonly maxDetails?: number } = {}
): AllocationCompositionDisplay {
  if (!composition) {
    return { summary: [], details: [] };
  }

  const summary = [
    `${formatCount(composition.personnel)} personnel`,
    formatMobilitySummary(composition),
    composition.echelon ?? ""
  ].filter((detail) => detail.length > 0);

  const details: string[] = [];
  const platformEntryIds = new Set(composition.vehicleBreakdown.map((entry) => entry.id));

  for (const entry of composition.vehicleBreakdown) {
    if (SUPPORT_PLATFORM_LABEL.test(entry.label)) {
      continue;
    }
    pushUnique(details, displayCountedLabel(entry.quantity, entry.label, composition.vehicles));
  }

  for (const entry of composition.equipmentBreakdown) {
    if (platformEntryIds.has(entry.id)) {
      continue;
    }
    pushUnique(details, displayCountedLabel(entry.quantity, entry.label, Number.POSITIVE_INFINITY));
  }

  return {
    summary,
    details: details.slice(0, options.maxDetails ?? 5)
  };
}
