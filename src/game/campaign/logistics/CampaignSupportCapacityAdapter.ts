/**
 * MODULE: CampaignSupportCapacityAdapter
 * WHAT: Classifies shipped legacy aggregate records that model transport capacity, not formations.
 * WHY: Capacity must be migrated through orders and reservations before it can safely leave old saves.
 */

import type { CampaignForceGroup } from "../../../core/campaignTypes";
import type { CampaignFormationRecord } from "../formations/campaignFormationTypes";
import {
  isCampaignCapacityPresentation,
  resolveCampaignFormationPresentation,
  resolveCampaignFormationRecordPresentation
} from "../formations/CampaignFormationPresentation";

export interface CampaignLegacySupportCapacityProjection {
  readonly representation: "capacity";
  readonly capacityType: "trucks";
  readonly quantity: number;
  readonly commandLabel: string;
  readonly selectableFormation: false;
  /** Conversion is deferred until formation/order/reservation migration can preserve every active reference. */
  readonly requiresStateMigration: true;
}

/** Returns typed capacity for an authored aggregate, or null for an actual formation/strength group. */
export function projectLegacyForceGroupAsSupportCapacity(
  group: Pick<CampaignForceGroup, "unitType" | "count" | "label">
): CampaignLegacySupportCapacityProjection | null {
  const presentation = resolveCampaignFormationPresentation({
    legacyLabel: group.label,
    legacyOrdinal: 0,
    unitType: group.unitType
  });
  if (!isCampaignCapacityPresentation(presentation)) return null;
  return Object.freeze({
    representation: "capacity",
    capacityType: "trucks",
    quantity: Math.max(0, Math.floor(group.count)),
    commandLabel: presentation.commandLabel,
    selectableFormation: false,
    requiresStateMigration: true
  });
}

/** Identifies a persisted legacy formation whose eventual replacement is a capacity-pool entry. */
export function isLegacyCampaignCapacityFormation(
  formation: Pick<CampaignFormationRecord, "campaignUnitType" | "origin">
): boolean {
  return isCampaignCapacityPresentation(resolveCampaignFormationRecordPresentation(formation));
}
