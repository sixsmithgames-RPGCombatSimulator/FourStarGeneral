/**
 * MODULE: CampaignCommandViewAssembler
 * WHAT: Finalizes immutable, faction-safe view models for campaign command components.
 * WHY: UI components must never receive mutable runtime objects or forbidden opposing truth.
 *
 * DEPENDENCIES: CampaignCommandShell view contracts and pure location presentation.
 * EXPORTS: CampaignCommandViewAssembler and projection-safety assertions.
 */

import type { CampaignCommandShellView } from "./CampaignCommandShell";
import {
  isCampaignGridReferenceLabel,
  resolveCampaignLocationPresentation,
  type CampaignLocationPresentation
} from "./CampaignLocationPresentation";

const FORBIDDEN_PROJECTION_KEYS = new Set([
  "rawRuntime",
  "randomStreams",
  "randomSeed",
  "hiddenForces",
  "hiddenOrders",
  "enemyEconomy",
  "botEconomy",
  "opposingTruth"
]);

function assertSafeNode(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeNode(entry, `${path}[${index}]`));
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (FORBIDDEN_PROJECTION_KEYS.has(key)) {
      throw new Error(`Campaign command projection contains forbidden key '${key}' at ${path}.`);
    }
    assertSafeNode(child, `${path}.${key}`);
  });
}

function cloneAndFreezeProjection<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreezeProjection(entry))) as T;
  }
  const clone: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    clone[key] = cloneAndFreezeProjection(child);
  });
  return Object.freeze(clone) as T;
}

/** Throws when a view-model tree contains a key reserved for hidden campaign truth. */
export function assertCampaignCommandProjectionSafe(value: unknown): void {
  assertSafeNode(value, "campaignCommandView");
}

/** Propagates explicitly briefed geography to matching keys without inferring a nearest location. */
function normalizeLocations(source: CampaignCommandShellView): CampaignCommandShellView {
  const locations = new Map<string, CampaignLocationPresentation>();
  source.hexes?.forEach((hex) => {
    if (hex.location) locations.set(hex.hexKey, hex.location);
  });
  source.knownSites?.forEach((site) => {
    if (site.location && !locations.has(site.locationHexKey)) locations.set(site.locationHexKey, site.location);
  });
  const resolve = (location: CampaignLocationPresentation | undefined, hexKey: string | null | undefined): CampaignLocationPresentation | undefined => (
    location ?? (hexKey ? locations.get(hexKey) : undefined)
  );
  const attach = <T extends { readonly location?: CampaignLocationPresentation }>(entry: T, hexKey: string | null | undefined): T => {
    const location = resolve(entry.location, hexKey);
    return location ? { ...entry, location } : entry;
  };
  return {
    ...source,
    forces: source.forces.map((force) => attach(force, force.hexKey)),
    objectives: source.objectives.map((objective) => attach(objective, objective.hexKey)),
    ...(source.formations ? { formations: source.formations.map((formation) => attach(formation, formation.locationHexKey)) } : {}),
    ...(source.fronts ? { fronts: source.fronts.map((front) => attach(front, front.targetHexKey)) } : {}),
    ...(source.knownSites ? { knownSites: source.knownSites.map((site) => attach(site, site.locationHexKey)) } : {}),
    ...(source.hexes ? { hexes: source.hexes.map((hex) => {
      const location = resolve(hex.location, hex.hexKey);
      if (!location) return hex;
      return {
        ...hex,
        location,
        displayLabel: hex.displayLabel && !isCampaignGridReferenceLabel(hex.displayLabel) ? hex.displayLabel : location.primaryLabel
      };
    }) } : {}),
    ...(source.contacts ? { contacts: source.contacts.map((contact) => {
      const geography = resolve(contact.location, contact.locationHexKey);
      if (!geography) return contact;
      // A briefed fixed place does not confirm a contact there. Its own public
      // assessment supplies uncertainty independently of the geographic lookup.
      const location = resolveCampaignLocationPresentation({
        hexKey: contact.locationHexKey,
        placeLabel: geography.primaryLabel,
        sectorLabel: geography.primaryLabel,
        uncertainty: {
          status: contact.state,
          confidenceBand: contact.confidenceBand,
          radiusHexes: contact.uncertaintyRadius
        }
      });
      return { ...contact, location, locationLabel: location.primaryLabel };
    }) } : {}),
    ...(source.afterActionReports ? { afterActionReports: source.afterActionReports.map((report) => {
      const location = resolve(report.locationPresentation, report.locationHexKey);
      if (!location) return report;
      const titleSubject = report.title.replace(/^After action:\s*/i, "").trim();
      return {
        ...report,
        locationPresentation: location,
        location: `${location.primaryLabel} · ${location.secondaryGridReference}`,
        title: !titleSubject || isCampaignGridReferenceLabel(titleSubject)
          ? `After action: ${location.primaryLabel}`
          : report.title
      };
    }) } : {})
  };
}

/** Creates a detached, deeply frozen view so rendering cannot mutate controller-owned projections. */
export class CampaignCommandViewAssembler {
  /** Enriches safe views with supplied geography, then detaches and freezes every field. */
  public assemble(source: CampaignCommandShellView): CampaignCommandShellView {
    assertCampaignCommandProjectionSafe(source);
    return cloneAndFreezeProjection(normalizeLocations(source));
  }
}
