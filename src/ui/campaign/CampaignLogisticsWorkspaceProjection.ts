/**
 * Pure player-safe projection for command-shell Logistics facts.
 * CampaignScreen supplies authoritative snapshots; this module owns no state, DOM, or interaction.
 */
import type { CampaignFactionEconomy } from "../../core/campaignTypes";
import type { CampaignNavalSupportView } from "../../game/campaign/logistics/CampaignNavalSupportService";
import type { CampaignCommandResourceView } from "./CampaignCommandShell";

interface CampaignLogisticsProductionSource {
  readonly offsetKey: string;
  readonly capacity: number;
}

interface CampaignLogisticsProductionReport {
  readonly sources: readonly CampaignLogisticsProductionSource[];
  readonly segmentsUntilNextTick: number;
}

interface CampaignLogisticsHexSource {
  readonly hexKey: string;
  readonly airSortieCapacity: number;
}

export interface CampaignLogisticsWorkspaceProjectionInput {
  readonly economy: CampaignFactionEconomy | null | undefined;
  readonly reservedResources: Readonly<Record<string, number>>;
  readonly productionReport: CampaignLogisticsProductionReport | null;
  readonly currentSegment: number;
  readonly navalSupport: CampaignNavalSupportView;
  readonly hexes: readonly CampaignLogisticsHexSource[];
  readonly hexScaleKm: number;
  readonly formatSegment: (segment: number) => string;
}

export interface CampaignLogisticsWorkspaceProjection {
  readonly resources: readonly CampaignCommandResourceView[];
  readonly airPower: number;
  /** Legacy economy scalar retained for the shell contract; availability comes only from navalSupport. */
  readonly navalPower: number;
  readonly navalSupport: CampaignNavalSupportView;
  readonly capabilitiesByHex: ReadonlyMap<string, readonly string[]>;
}

function displayStock(
  value: number,
  key: string,
  reservedResources: Readonly<Record<string, number>>
): string {
  const held = reservedResources[key] ?? 0;
  return held > 0
    ? `${value.toLocaleString()} · ${held.toLocaleString()} held`
    : value.toLocaleString();
}

function projectResources(
  economy: CampaignFactionEconomy | null | undefined,
  reservedResources: Readonly<Record<string, number>>
): CampaignCommandResourceView[] {
  if (!economy) return [];
  return [
    { key: "manpower", label: "Personnel", value: displayStock(economy.manpower, "manpower", reservedResources) },
    { key: "supplies", label: "Supply", value: displayStock(economy.supplies, "supplies", reservedResources) },
    { key: "fuel", label: "Fuel", value: displayStock(economy.fuel, "fuel", reservedResources) },
    { key: "ammo", label: "Ammo", value: displayStock(economy.ammo, "ammo", reservedResources) }
  ];
}

function detachNavalSupport(source: CampaignNavalSupportView): CampaignNavalSupportView {
  return {
    availableSupportAssignments: source.availableSupportAssignments,
    availableFireMissions: source.availableFireMissions,
    fireMissionsPerAssignment: source.fireMissionsPerAssignment,
    readySourceIds: [...source.readySourceIds],
    sources: source.sources.map((entry) => ({ ...entry }))
  };
}

function projectCapabilities(
  input: CampaignLogisticsWorkspaceProjectionInput
): ReadonlyMap<string, readonly string[]> {
  const productionByHex = new Map(input.productionReport?.sources.map((source) => [
    source.offsetKey,
    source.capacity
  ]) ?? []);
  const nextProductionLabel = input.productionReport
    ? input.formatSegment(input.currentSegment + input.productionReport.segmentsUntilNextTick)
    : null;
  return new Map(input.hexes.map((hex) => {
    const capabilities = [
      ...(productionByHex.has(hex.hexKey)
        ? [`+${productionByHex.get(hex.hexKey)!.toLocaleString()} Allied support points daily${nextProductionLabel ? ` · next allocation ${nextProductionLabel}` : ""}`]
        : []),
      ...(hex.airSortieCapacity > 0 ? ["Air-wing staging and fighter/bomber rebase point"] : []),
      ...input.navalSupport.sources.filter((source) => source.sourceHexKey === hex.hexKey)
        .map((source) => `${source.label}: ${source.availableFireMissions} ready fire mission${source.availableFireMissions === 1 ? "" : "s"} · ${source.effectiveRangeHexes * input.hexScaleKm} km range · ${source.reason}${source.nextAvailableSegment === null ? "" : ` · next available ${input.formatSegment(source.nextAvailableSegment)}`}`)
    ];
    return [hex.hexKey, capabilities] as const;
  }));
}

/** Projects the complete detached command-shell Logistics view from authorized campaign snapshots. */
export function projectCampaignLogisticsWorkspace(
  input: CampaignLogisticsWorkspaceProjectionInput
): CampaignLogisticsWorkspaceProjection {
  return {
    resources: projectResources(input.economy, input.reservedResources),
    airPower: input.economy?.airPower ?? 0,
    navalPower: input.economy?.navalPower ?? 0,
    navalSupport: detachNavalSupport(input.navalSupport),
    capabilitiesByHex: projectCapabilities(input)
  };
}
