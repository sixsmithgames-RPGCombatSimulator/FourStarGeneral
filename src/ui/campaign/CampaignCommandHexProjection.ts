/**
 * MODULE: CampaignCommandHexProjection
 * WHAT: Projects player-safe campaign tiles and briefed sites for the command map.
 * WHY: One deterministic owner prevents the map, inspector, and base-action summaries from drifting apart.
 *
 * DEPENDENCIES: Player-safe scenario/view contracts and presentation-only campaign helpers.
 * EXPORTS: CampaignCommandHexProjectionInput and projectCampaignCommandHexes.
 */

import type { CampaignScenarioData } from "../../core/campaignTypes";
import type { CampaignOrderActionPreview } from "../../game/campaign/orders/CampaignOrderTypes";
import { projectLegacyForceGroupAsSupportCapacity } from "../../game/campaign/logistics/CampaignSupportCapacityAdapter";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import {
  projectCampaignInfrastructureCondition,
  projectCampaignInfrastructureRecoveryStatus
} from "./CampaignCommandProjection";
import type {
  CampaignCommandFormationView,
  CampaignCommandHexView,
  CampaignCommandKnownSiteView,
  CampaignCommandObjectiveView
} from "./CampaignCommandShell";
import type { CampaignLocationPresentation } from "./CampaignLocationPresentation";
import {
  projectCampaignStrategicGeography
} from "./CampaignIntelligenceWorkspaceProjection";
import {
  projectCampaignAssociatedLocations,
  resolveCampaignFriendlyBaseSummary
} from "./CampaignPresentation";
import { resolveCampaignForceGroupCommandLabel } from "../../game/campaign/formations/CampaignFormationPresentation";

export interface CampaignCommandHexProjectionInput {
  readonly scenario: Pick<CampaignScenarioData, "tiles" | "tilePalette" | "fronts">;
  readonly formations: readonly CampaignCommandFormationView[];
  readonly objectives: readonly CampaignCommandObjectiveView[];
  readonly knownSites: readonly CampaignCommandKnownSiteView[];
  readonly capabilitiesByHex: ReadonlyMap<string, readonly string[]>;
  readonly authoredWaterHexes: ReadonlySet<string>;
  readonly resolveLocation: (hexKey: string) => CampaignLocationPresentation;
  readonly resolveRedeployPreview: (hexKey: string) => CampaignOrderActionPreview;
  readonly resolveRepairPreview: (hexKey: string) => CampaignOrderActionPreview;
  readonly isAdjacentToEnemy: (hexKey: string) => boolean;
  readonly formatLabel: (value: string) => string;
  readonly formatSegment: (segment: number) => string;
}

type CampaignCommandTile = CampaignScenarioData["tiles"][number];

interface BaseActionProjection {
  readonly showSelectionActions: boolean;
  readonly actionSummary?: string;
}

function projectBaseAction(
  input: CampaignCommandHexProjectionInput,
  tile: CampaignCommandTile,
  hexKey: string,
  isFriendlyBase: boolean
): BaseActionProjection {
  if (!isFriendlyBase) return { showSelectionActions: false };
  const infrastructure = tile.infrastructure;
  const redeployPreview = input.resolveRedeployPreview(hexKey);
  const repairPreview = infrastructure && infrastructure.integrity < infrastructure.maxIntegrity
    ? input.resolveRepairPreview(hexKey)
    : null;
  const showSelectionActions = redeployPreview.availability === "available" || repairPreview !== null;
  if (repairPreview?.availability === "blocked") {
    return {
      showSelectionActions,
      actionSummary: `${repairPreview.reason ?? "Reconstruction is unavailable."} ${repairPreview.correctiveAction ?? "Review the facility and available resources."}`.trim()
    };
  }
  if (showSelectionActions) return { showSelectionActions };
  const locatedFormations = input.formations.filter((formation) => formation.locationHexKey === hexKey);
  const nextArrival = locatedFormations.find((formation) => formation.availabilityLabel)?.availabilityLabel ?? null;
  if (nextArrival) {
    return {
      showSelectionActions,
      actionSummary: `Reinforcements arrive ${nextArrival}. Movement orders become available after they arrive.`
    };
  }
  const hasAssignedFormation = locatedFormations.some((formation) => (
    formation.currentOrderId || formation.statusLabel.toLowerCase() !== "ready"
  ));
  return {
    showSelectionActions,
    actionSummary: hasAssignedFormation
      ? "All formations based here are committed or in transit. Review Orders before assigning another movement."
      : "No movable formation is currently based here. This installation continues its theater-support role automatically."
  };
}

function projectInfrastructure(
  input: CampaignCommandHexProjectionInput,
  tile: CampaignCommandTile,
  isFriendlyBase: boolean
): Pick<CampaignCommandHexView, "infrastructure" | "infrastructureRecovery"> {
  const infrastructure = tile.infrastructure;
  if (!infrastructure) return { infrastructure: null, infrastructureRecovery: null };
  return {
    infrastructure: projectCampaignInfrastructureCondition({
      roleLabel: input.formatLabel(infrastructure.role),
      damageStateLabel: input.formatLabel(infrastructure.damageState),
      integrity: infrastructure.integrity,
      maxIntegrity: infrastructure.maxIntegrity,
      effectiveness: infrastructure.effectiveness,
      conciseBaseIdentity: isFriendlyBase
    }),
    infrastructureRecovery: projectCampaignInfrastructureRecoveryStatus({
      integrity: infrastructure.integrity,
      maxIntegrity: infrastructure.maxIntegrity,
      captureDisruptionUntilSegment: infrastructure.captureDisruptionUntilSegment,
      disruptionTimeLabel: infrastructure.captureDisruptionUntilSegment === null
        ? null
        : input.formatSegment(infrastructure.captureDisruptionUntilSegment)
    })
  };
}

function projectAuthoredHex(input: CampaignCommandHexProjectionInput, tile: CampaignCommandTile): CampaignCommandHexView {
  const { scenario } = input;
  const palette = scenario.tilePalette[tile.tile];
  const offset = CoordinateSystem.axialToOffset(tile.hex.q, tile.hex.r);
  const hexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
  const controller = tile.factionControl ?? palette?.factionControl ?? "Neutral";
  const controlLabel = controller === "Player" ? "Friendly control" : controller === "Bot" ? "Opposing control" : "Neutral control";
  const groups = tile.forces ?? palette?.forces ?? [];
  const roleLabel = input.formatLabel(palette?.role ?? "region");
  const isAlliedAssaultFleet = controller === "Player" && palette?.role === "taskForce";
  const authoredMapLabel = palette?.mapLabel?.trim();
  const hasPresentForces = groups.some((force) => force.count > 0);
  const isFriendlyBase = controller === "Player"
    && (palette?.role === "airbase" || palette?.role === "logisticsHub" || palette?.role === "navalBase");
  const baseAction = projectBaseAction(input, tile, hexKey, isFriendlyBase);
  const friendlyBaseRoleLabel = palette?.role === "airbase"
    ? "Air base"
    : palette?.role === "logisticsHub"
      ? "Logistics and embarkation"
      : palette?.role === "navalBase"
        ? "Naval base"
        : roleLabel;
  const associatedLocations = projectCampaignAssociatedLocations(authoredMapLabel, palette?.historicalNetwork);
  const terrain = input.authoredWaterHexes.has(`${tile.hex.q},${tile.hex.r}`) ? "water" as const : "land" as const;
  return {
    hexKey,
    location: input.resolveLocation(hexKey),
    roleLabel: isAlliedAssaultFleet ? "Naval task force" : isFriendlyBase ? friendlyBaseRoleLabel : roleLabel,
    controlLabel,
    ...(isFriendlyBase ? {
      presentation: "friendlyBase" as const,
      showSelectionActions: baseAction.showSelectionActions,
      showEngagementAction: false,
      actionSummary: baseAction.actionSummary
    } : {
      showEngagementAction: controller === "Player" && hasPresentForces && !isAlliedAssaultFleet && input.isAdjacentToEnemy(hexKey)
    }),
    ...(associatedLocations.length ? { historicalNetwork: associatedLocations } : {}),
    strategicGeography: projectCampaignStrategicGeography(
      palette?.geography,
      palette?.geography?.terrain ?? terrain,
      authoredMapLabel,
      roleLabel !== "Region" ? roleLabel : undefined
    ),
    ...(authoredMapLabel || isAlliedAssaultFleet ? {
      displayLabel: authoredMapLabel ?? "Allied Assault Fleet",
      summary: isFriendlyBase
        ? resolveCampaignFriendlyBaseSummary(authoredMapLabel, palette?.notes ?? `${friendlyBaseRoleLabel} under ${controlLabel.toLowerCase()}.`)
        : palette?.notes ?? (isAlliedAssaultFleet
          ? "Naval gunfire, transport, and logistics group on station supporting the established Normandy lodgment."
          : `${roleLabel} under ${controlLabel.toLowerCase()}.`),
      locationLabel: isAlliedAssaultFleet
        ? `English Channel · offshore support station · hex ${hexKey}`
        : `${authoredMapLabel ?? roleLabel} · hex ${hexKey}`
    } : {}),
    hasContextActions: isFriendlyBase ? baseAction.showSelectionActions : controller === "Player" && hasPresentForces,
    forces: groups
      .filter((force) => force.count > 0 && projectLegacyForceGroupAsSupportCapacity(force) === null)
      .map((force) => `${resolveCampaignForceGroupCommandLabel(force.label, force.unitType)} · ${force.count}`),
    capabilities: [...(input.capabilitiesByHex.get(hexKey) ?? [])],
    ...projectInfrastructure(input, tile, isFriendlyBase),
    objectives: input.objectives.filter((objective) => objective.hexKey === hexKey).map((objective) => objective.label),
    fronts: scenario.fronts.filter((front) => front.hexKeys.includes(hexKey)).map((front) => front.label)
  };
}

function appendSupplementalKnownSites(
  hexes: CampaignCommandHexView[],
  input: CampaignCommandHexProjectionInput
): void {
  const projectedHexKeys = new Set(hexes.map((hex) => hex.hexKey));
  input.knownSites.forEach((site) => {
    if (projectedHexKeys.has(site.locationHexKey)) return;
    hexes.push({
      hexKey: site.locationHexKey,
      location: site.location,
      roleLabel: site.roleLabel,
      controlLabel: site.categoryLabel === "Allied supporting site"
        ? "Friendly support network"
        : site.categoryLabel === "Strategic geography"
          ? "Geographic reference"
          : "Current control unconfirmed",
      displayLabel: site.label,
      summary: site.summary,
      locationLabel: site.label,
      sourceLabel: site.sourceLabel,
      ...(site.relatedLocations.length ? { historicalNetwork: [...site.relatedLocations] } : {}),
      ...(site.strategicGeography ? { strategicGeography: site.strategicGeography } : {}),
      hasContextActions: false,
      forces: [],
      capabilities: [],
      infrastructure: null,
      objectives: input.objectives.filter((objective) => objective.hexKey === site.locationHexKey).map((objective) => objective.label),
      fronts: input.scenario.fronts.filter((front) => front.hexKeys.includes(site.locationHexKey)).map((front) => front.label)
    });
    projectedHexKeys.add(site.locationHexKey);
  });
}

/** Projects every authored tile, then adds fixed briefed sites not represented by a selectable tile. */
export function projectCampaignCommandHexes(input: CampaignCommandHexProjectionInput): CampaignCommandHexView[] {
  const hexes = input.scenario.tiles.map((tile) => projectAuthoredHex(input, tile));
  appendSupplementalKnownSites(hexes, input);
  return hexes;
}
