/**
 * Pure player-safe projection for the Intelligence workspace.
 * CampaignScreen supplies authorized snapshots and presentation callbacks; this module owns no state or interaction.
 */
import type { CampaignHexGeography } from "../../core/campaignTypes";
import type {
  CampaignEnemyContactView,
  CampaignIntelBriefEvent,
  CampaignKnownStrategicRegionView,
  CampaignKnownStrategicSiteView
} from "../../core/campaignIntelTypes";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import {
  type CampaignCommandContactView,
  type CampaignCommandIntelBriefView,
  type CampaignCommandKnownRegionView,
  type CampaignCommandKnownSiteView,
  type CampaignCommandStrategicGeographyView
} from "./CampaignCommandShell";
import {
  type CampaignLocationPresentation,
  type CampaignLocationUncertaintyInput
} from "./CampaignLocationPresentation";
import { resolveCampaignTheaterRegionPresentation } from "./CampaignPresentation";

interface CampaignIntelligenceFrontSource {
  readonly label: string;
  readonly hexKeys: readonly string[];
  readonly edges?: ReadonlyArray<{ readonly opposingHexKey: string }>;
}

export interface CampaignIntelligenceWorkspaceProjectionInput {
  readonly knownSites: readonly CampaignKnownStrategicSiteView[];
  readonly knownRegions: readonly CampaignKnownStrategicRegionView[];
  readonly contacts: readonly CampaignEnemyContactView[];
  readonly briefEvents: readonly CampaignIntelBriefEvent[];
  readonly fronts: readonly CampaignIntelligenceFrontSource[];
  readonly authoredWaterHexes: ReadonlySet<string>;
  readonly scenarioTitle: string;
  readonly capacity: { readonly available: number; readonly total: number; readonly held: number };
  readonly resolveLocation: (
    hexKey: string,
    uncertainty?: CampaignLocationUncertaintyInput
  ) => CampaignLocationPresentation;
  readonly resolveLocationDisplayLabel: (hexKey: string) => string;
  readonly formatLabel: (value: string) => string;
  readonly formatSegment: (segment: number) => string;
}

export interface CampaignIntelligenceWorkspaceProjection {
  readonly knownSites: readonly CampaignCommandKnownSiteView[];
  readonly knownRegions: readonly CampaignCommandKnownRegionView[];
  readonly contacts: readonly CampaignCommandContactView[];
  readonly intelligenceBriefs: readonly CampaignCommandIntelBriefView[];
  readonly intelligenceCapacity: string;
}

/** Projects authored geography into detached, player-facing labels and route lists. */
export function projectCampaignStrategicGeography(
  geography: CampaignHexGeography | undefined,
  terrain: "land" | "water",
  settlement?: string,
  operationalFeature?: string
): CampaignCommandStrategicGeographyView {
  return {
    terrain: terrain === "water" ? "Water" : "Land",
    ...(geography?.terrainCharacter ? { landform: geography.terrainCharacter } : {}),
    ...(geography?.placeName || settlement ? { settlement: geography?.placeName ?? settlement } : {}),
    ...(geography?.roads?.length ? { roads: [...geography.roads] } : {}),
    ...(geography?.railways?.length ? { railways: [...geography.railways] } : {}),
    ...(geography?.waterways?.length ? { waterways: [...geography.waterways] } : {}),
    ...((geography?.operationalFeatures?.length || operationalFeature) ? {
      operationalFeatures: geography?.operationalFeatures?.length
        ? [...geography.operationalFeatures]
        : operationalFeature ? [operationalFeature] : []
    } : {})
  };
}

function isAuthoredWaterHex(waterHexes: ReadonlySet<string>, offsetHexKey: string): boolean {
  const offset = CoordinateSystem.parseHexKey(offsetHexKey);
  if (!offset) return false;
  const axial = CoordinateSystem.offsetToAxial(offset.col, offset.row);
  return waterHexes.has(`${axial.q},${axial.r}`);
}

function projectKnownSite(
  site: CampaignKnownStrategicSiteView,
  input: CampaignIntelligenceWorkspaceProjectionInput
): CampaignCommandKnownSiteView {
  const roleLabel = input.formatLabel(site.role);
  return {
    id: site.id,
    label: site.label,
    locationHexKey: site.locationHexKey,
    location: input.resolveLocation(site.locationHexKey),
    roleLabel,
    summary: site.summary,
    sourceLabel: site.sourceLabel,
    categoryLabel: site.category === "enemyInstallation"
      ? "Known opposing installation"
      : site.category === "alliedSupport"
        ? "Allied supporting site"
        : "Strategic geography",
    locationPrecision: site.locationPrecision,
    relatedLocations: [...site.relatedLocations],
    strategicGeography: projectCampaignStrategicGeography(
      site.geography,
      site.geography?.terrain ?? (isAuthoredWaterHex(input.authoredWaterHexes, site.locationHexKey) ? "water" : "land"),
      site.geography?.placeName ?? site.label,
      roleLabel
    )
  };
}

function projectKnownRegion(region: CampaignKnownStrategicRegionView): CampaignCommandKnownRegionView {
  return {
    id: region.id,
    ...resolveCampaignTheaterRegionPresentation(region),
    locations: [...region.locations]
  };
}

function resolveFrontLabel(
  hexKey: string,
  input: CampaignIntelligenceWorkspaceProjectionInput
): string | undefined {
  return input.fronts.find((front) => front.hexKeys.includes(hexKey)
    || front.edges?.some((edge) => edge.opposingHexKey === hexKey))?.label;
}

function projectContact(
  contact: CampaignEnemyContactView,
  knownSites: readonly CampaignCommandKnownSiteView[],
  input: CampaignIntelligenceWorkspaceProjectionInput
): CampaignCommandContactView {
  const knownLocation = knownSites.find((site) => site.locationHexKey === contact.locationHexKey);
  return {
    id: contact.id,
    label: contact.label,
    locationHexKey: contact.locationHexKey,
    location: input.resolveLocation(contact.locationHexKey, {
      status: contact.state,
      confidenceBand: contact.confidenceBand,
      radiusHexes: contact.uncertaintyRadius
    }),
    sectorLabel: resolveFrontLabel(contact.locationHexKey, input)
      ?? input.resolveLocationDisplayLabel(contact.locationHexKey),
    priority: contact.state === "disputed" ? "critical"
      : contact.state === "stale" || contact.confidenceBand === "low" ? "notable" : "routine",
    threatLabel: contact.classificationBand ?? `${input.formatLabel(contact.domain)} activity`,
    ...(knownLocation ? { locationLabel: knownLocation.label, locationRoleLabel: knownLocation.roleLabel } : {}),
    state: contact.state,
    confidenceBand: contact.confidenceBand,
    ageSegments: contact.ageSegments,
    uncertaintyRadius: contact.uncertaintyRadius,
    sourceLabels: contact.sourceLabels.slice(),
    strengthBand: contact.strengthBand
  };
}

function projectBrief(
  event: CampaignIntelBriefEvent,
  input: CampaignIntelligenceWorkspaceProjectionInput
): CampaignCommandIntelBriefView {
  const contact = input.contacts.find((entry) => entry.id === event.contactId);
  const location = contact ? input.resolveLocation(contact.locationHexKey) : null;
  return {
    ...event,
    title: location
      ? `${location.primaryLabel}: ${event.kind === "new" ? "New contact" : `${input.formatLabel(event.kind)} assessment`}`
      : event.title,
    detail: event.detail,
    timeLabel: input.formatSegment(event.segment),
    sectorLabel: contact
      ? resolveFrontLabel(contact.locationHexKey, input) ?? location?.primaryLabel
      : input.scenarioTitle,
    priority: event.kind === "disputed" ? "critical"
      : event.kind === "stale" || event.kind === "downgraded" ? "notable" : "routine",
    materiallyChanged: true
  };
}

/** Projects one complete detached Intelligence workspace without reading or mutating campaign state. */
export function projectCampaignIntelligenceWorkspace(
  input: CampaignIntelligenceWorkspaceProjectionInput
): CampaignIntelligenceWorkspaceProjection {
  const knownSites = input.knownSites.map((site) => projectKnownSite(site, input));
  return {
    knownSites,
    knownRegions: input.knownRegions.map(projectKnownRegion),
    contacts: input.contacts.map((contact) => projectContact(contact, knownSites, input)),
    intelligenceBriefs: input.briefEvents.map((event) => projectBrief(event, input)),
    intelligenceCapacity: input.capacity.held > 0
      ? `${Math.max(0, input.capacity.available - input.capacity.held)}/${input.capacity.total} · ${input.capacity.held} held`
      : `${input.capacity.available}/${input.capacity.total}`
  };
}
