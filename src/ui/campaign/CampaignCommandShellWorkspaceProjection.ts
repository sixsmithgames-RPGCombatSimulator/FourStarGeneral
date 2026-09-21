/** Reader-free orchestration for the loaded command shell's scenario workspaces. */
import type { CampaignMapViewModel } from "../../core/campaignIntelTypes";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import {
  projectCampaignCommandHexes,
  type CampaignCommandHexProjectionInput
} from "./CampaignCommandHexProjection";
import {
  projectCampaignFormationRoster,
  type CampaignFormationRosterProjectionInput
} from "./CampaignFormationRosterProjection";
import {
  projectCampaignIntelligenceWorkspace,
  type CampaignIntelligenceWorkspaceProjectionInput
} from "./CampaignIntelligenceWorkspaceProjection";
import {
  projectCampaignLogisticsWorkspace,
  type CampaignLogisticsWorkspaceProjectionInput
} from "./CampaignLogisticsWorkspaceProjection";
import {
  projectCampaignSituationObjectives,
  type CampaignSituationObjectiveProjectionInput
} from "./CampaignSituationWorkspaceProjection";

export interface CampaignCommandShellWorkspaceProjectionInput {
  readonly view: CampaignMapViewModel;
  readonly playerEconomy: CampaignLogisticsWorkspaceProjectionInput["economy"];
  readonly reservedResources: CampaignLogisticsWorkspaceProjectionInput["reservedResources"];
  readonly heldIntelligenceCapacity: number;
  readonly objectivePresentations: CampaignSituationObjectiveProjectionInput["presentations"];
  readonly readFormationRoster: () => CampaignFormationRosterProjectionInput["formations"];
  readonly readIntelBriefEvents: () => CampaignIntelligenceWorkspaceProjectionInput["briefEvents"];
  readonly readProductionReport: () => CampaignLogisticsWorkspaceProjectionInput["productionReport"];
  readonly readCurrentSegment: () => number;
  readonly readNavalSupport: () => CampaignLogisticsWorkspaceProjectionInput["navalSupport"];
  readonly resolveLocation: CampaignIntelligenceWorkspaceProjectionInput["resolveLocation"];
  readonly resolveLocationDisplayLabel: CampaignIntelligenceWorkspaceProjectionInput["resolveLocationDisplayLabel"];
  readonly resolveHistory: CampaignFormationRosterProjectionInput["resolveHistory"];
  readonly resolveRedeployPreview: CampaignCommandHexProjectionInput["resolveRedeployPreview"];
  readonly resolveRepairPreview: CampaignCommandHexProjectionInput["resolveRepairPreview"];
  readonly isAdjacentToEnemy: CampaignCommandHexProjectionInput["isAdjacentToEnemy"];
  readonly formatLabel: CampaignIntelligenceWorkspaceProjectionInput["formatLabel"];
  readonly formatSegment: CampaignIntelligenceWorkspaceProjectionInput["formatSegment"];
}

/**
 * Runs each dependent projection once and in publication order. Lazy snapshot
 * readers keep CampaignScreen in control of live state while this module owns
 * only deterministic assembly.
 */
export function projectCampaignCommandShellWorkspaces(input: CampaignCommandShellWorkspaceProjectionInput) {
  const { view } = input;
  const scenario = view.scenario;
  const authoredWaterHexes = new Set(scenario.mapExtents?.waterHexes ?? []);
  const { objectives, priorityForceHexes } = projectCampaignSituationObjectives({
    scenario,
    presentations: input.objectivePresentations,
    formatSegment: input.formatSegment,
    resolveLocation: input.resolveLocation
  });
  const formations = projectCampaignFormationRoster({
    formations: input.readFormationRoster(),
    fronts: scenario.fronts,
    objectives,
    formatSegment: input.formatSegment,
    resolveLocation: input.resolveLocation,
    resolveHistory: input.resolveHistory
  });
  const intelligence = projectCampaignIntelligenceWorkspace({
    knownSites: view.knownStrategicSites ?? [], knownRegions: view.knownStrategicRegions ?? [],
    contacts: view.enemyContacts, briefEvents: input.readIntelBriefEvents(), fronts: scenario.fronts,
    authoredWaterHexes, scenarioTitle: scenario.title,
    capacity: { available: view.capacity.available, total: view.capacity.total, held: input.heldIntelligenceCapacity },
    resolveLocation: input.resolveLocation, resolveLocationDisplayLabel: input.resolveLocationDisplayLabel,
    formatLabel: input.formatLabel, formatSegment: input.formatSegment
  });
  const logistics = projectCampaignLogisticsWorkspace({
    economy: input.playerEconomy, reservedResources: input.reservedResources,
    productionReport: input.readProductionReport(), currentSegment: input.readCurrentSegment(),
    navalSupport: input.readNavalSupport(),
    hexes: scenario.tiles.map((tile) => {
      const offset = CoordinateSystem.axialToOffset(tile.hex.q, tile.hex.r);
      return { hexKey: CoordinateSystem.makeHexKey(offset.col, offset.row), airSortieCapacity: scenario.tilePalette[tile.tile]?.airSortieCapacity ?? 0 };
    }),
    hexScaleKm: scenario.hexScaleKm ?? 10, formatSegment: input.formatSegment
  });
  const hexes = projectCampaignCommandHexes({
    scenario, formations, objectives, knownSites: intelligence.knownSites,
    capabilitiesByHex: logistics.capabilitiesByHex, authoredWaterHexes,
    resolveLocation: input.resolveLocation, resolveRedeployPreview: input.resolveRedeployPreview,
    resolveRepairPreview: input.resolveRepairPreview, isAdjacentToEnemy: input.isAdjacentToEnemy,
    formatLabel: input.formatLabel, formatSegment: input.formatSegment
  });
  return { objectives, priorityForceHexes, formations, intelligence, logistics, hexes };
}
