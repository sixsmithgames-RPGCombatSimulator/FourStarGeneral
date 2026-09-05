/**
 * MODULE: CampaignLocationPresentation
 * WHAT: Resolves authored, player-visible geography into one location grammar.
 * WHY: Place and sector names lead; exact offset grid references remain secondary.
 * DEPENDENCIES: Player-safe map view and existing coordinate lookup adapter.
 */

import type { CampaignMapViewModel } from "../../core/campaignIntelTypes";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";

/** Public intelligence assessment; never a live opposing position or force record. */
export interface CampaignLocationUncertaintyInput {
  readonly status: "current" | "stale" | "disputed" | "lost";
  readonly confidenceBand: "low" | "medium" | "high";
  readonly radiusHexes: number;
}

/** Decision-relevant uncertainty kept separate from a known geographic name. */
export interface CampaignLocationUncertainty extends CampaignLocationUncertaintyInput {
  readonly label: string;
}

/** Shared player-facing location; map keys and entity IDs remain on their owning views. */
export interface CampaignLocationPresentation {
  readonly primaryLabel: string;
  readonly secondaryGridReference: string;
  readonly uncertainty?: CampaignLocationUncertainty;
}

/**
 * Authored names for one exact campaign-map offset key. The required sector is the
 * authored front or theater title when the cell has no more specific briefed name.
 * Supplying a nearby place or deriving names from hidden state is not permitted.
 */
export interface CampaignLocationPresentationInput {
  readonly hexKey: string;
  readonly sectorLabel: string;
  readonly placeLabel?: string | null;
  readonly objectiveLabel?: string | null;
  readonly approachLabel?: string | null;
  readonly baseLabel?: string | null;
  readonly frontLabel?: string | null;
  readonly uncertainty?: CampaignLocationUncertaintyInput;
}

/** Recognizes legacy grid-only copy so a coordinate cannot masquerade as an authored place. */
export function isCampaignGridReferenceLabel(label: string): boolean {
  return /^(?:(?:operational\s+)?(?:hex|grid)(?:\s+reference)?\s*)?\(?\s*-?\d+\s*,\s*-?\d+\s*\)?$/i.test(label.trim());
}

function authoredLabel(label: string | null | undefined): string | undefined {
  const trimmed = label?.trim();
  return trimmed && !isCampaignGridReferenceLabel(trimmed) ? trimmed : undefined;
}

function presentUncertainty(input: CampaignLocationUncertaintyInput | undefined): CampaignLocationUncertainty | undefined {
  if (!input) return undefined;
  if (!Number.isFinite(input.radiusHexes) || input.radiusHexes < 0) {
    throw new Error("Cannot present this contact's location: its reported uncertainty radius is invalid. Refresh the intelligence assessment before reviewing this contact.");
  }
  if (input.status === "current" && input.confidenceBand === "high" && input.radiusHexes === 0) return undefined;
  const statusLabel = input.status === "current" ? "Reported position"
    : input.status === "stale" ? "Last reported position"
      : input.status === "disputed" ? "Disputed position"
        : "Contact lost; last reported position";
  const radiusLabel = input.radiusHexes > 0 ? ` · uncertainty radius ${input.radiusHexes} hex` : "";
  return {
    status: input.status,
    confidenceBand: input.confidenceBand,
    radiusHexes: input.radiusHexes,
    label: `${statusLabel} · ${input.confidenceBand} confidence${radiusLabel}`
  };
}

/**
 * Resolves only supplied geography, without converting, rounding, or changing its key.
 * An unnamed cell uses its authored front/sector; missing geography is an explicit
 * producer error rather than an invented location. Legacy unlocated views need not call this resolver.
 */
export function resolveCampaignLocationPresentation(input: CampaignLocationPresentationInput): CampaignLocationPresentation {
  if (!/^-?\d+,-?\d+$/.test(input.hexKey) || !input.hexKey.split(",").map(Number).every(Number.isSafeInteger)) {
    throw new Error("Cannot present this campaign location: its grid reference is invalid. Refresh the map and select a location with a valid campaign grid reference.");
  }
  const primaryLabel = [input.placeLabel, input.baseLabel, input.objectiveLabel, input.approachLabel, input.frontLabel, input.sectorLabel]
    .map(authoredLabel)
    .find((label) => label !== undefined);
  if (!primaryLabel) {
    throw new Error("Cannot name this campaign location: no authored place, front, or sector was supplied. Supply the campaign's briefed sector or theater title and reopen the map.");
  }
  const uncertainty = presentUncertainty(input.uncertainty);
  return {
    primaryLabel,
    secondaryGridReference: `Grid ${input.hexKey}`,
    ...(uncertainty ? { uncertainty } : {})
  };
}

/**
 * Looks up the exact authored location in a player-safe map view for command and
 * precombat consumers. Offset-to-axial conversion is only for matching authored tiles;
 * the supplied offset key remains the displayed grid and navigation identity.
 */
export function resolveCampaignMapLocationPresentation(
  view: CampaignMapViewModel | null,
  offsetHexKey: string,
  uncertainty?: CampaignLocationUncertaintyInput
): CampaignLocationPresentation {
  const parsed = CoordinateSystem.parseHexKey(offsetHexKey);
  const axial = parsed ? CoordinateSystem.offsetToAxial(parsed.col, parsed.row) : null;
  const tile = axial ? view?.scenario.tiles?.find((entry) => entry.hex.q === axial.q && entry.hex.r === axial.r) : null;
  const palette = tile && view ? view.scenario.tilePalette[tile.tile] : null;
  const site = view?.knownStrategicSites?.find((entry) => entry.locationHexKey === offsetHexKey);
  const objective = view?.scenario.objectives.find((entry) => entry.hex.q === axial?.q && entry.hex.r === axial?.r);
  const front = view?.scenario.fronts.find((entry) => entry.hexKeys.includes(offsetHexKey)
    || entry.edges?.some((edge) => edge.opposingHexKey === offsetHexKey));
  return resolveCampaignLocationPresentation({
    hexKey: offsetHexKey,
    placeLabel: palette?.geography?.placeName ?? site?.geography?.placeName ?? site?.label
      ?? (palette?.role === "taskForce" ? null : palette?.mapLabel),
    objectiveLabel: objective?.label,
    frontLabel: front?.label,
    sectorLabel: view?.scenario.title ?? "Operational sector",
    uncertainty
  });
}
