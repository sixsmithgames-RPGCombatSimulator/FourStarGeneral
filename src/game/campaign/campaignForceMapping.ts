/**
 * Campaign → tactical force mapping.
 *
 * Single source of truth for translating campaign-layer force groups (CampaignForceGroup.unitType)
 * into precombat allocation keys and RP values. Used by the engagement context builder to compute
 * per-type requisition caps and force-ratio estimates.
 *
 * Design reference: docs/CAMPAIGN_BATTLE_GENERATION_DESIGN.md ("Campaign → allocation mapping table").
 */

import { getAllocationOption } from "../../data/unitAllocation";

/**
 * Maps campaign unit types to precombat allocation keys.
 * Types with no tactical analogue (e.g., Transport_Ship) are intentionally absent —
 * they influence context flags (amphibious) rather than the requisition roster.
 */
const CAMPAIGN_TO_ALLOCATION: Readonly<Record<string, string>> = Object.freeze({
  Infantry: "infantry",
  Infantry_42: "infantry",
  // Elite infantry map to the standard formation; Phase 2 templates add an experience bonus on spawn.
  Infantry_Elite: "infantry",
  AT_Infantry: "antiTankBattery",
  Panzer_IV: "tank",
  Panzer_V: "tank",
  Light_Tank: "tank",
  Heavy_Tank: "heavyTankCompany",
  Howitzer_105: "howitzer",
  Artillery_105mm: "howitzer",
  // The tactical engine has no distinct 155mm map unit. Use the deployable howitzer battery as
  // the closest exact-provenance proxy so a persistent heavy-artillery formation can survive the
  // complete commitment -> battle -> result chain instead of becoming an untracked support charge.
  Artillery_155mm: "howitzer",
  Rocket_Artillery: "rocketArtilleryBattalion",
  SP_Artillery: "spArtilleryGroup",
  Fighter: "fighter",
  Interceptor: "interceptorWing",
  Bomber: "bomber",
  Supply_Truck: "supplyConvoy",
  // Naval gunfire support: battleships adjacent to a coastal battle enable shore fire control.
  Battleship: "shoreFireControlParty"
});

/** Air-wing campaign types: eligible only when a friendly airbase is within sortie range. */
export const CAMPAIGN_AIR_UNIT_TYPES: readonly string[] = Object.freeze(["Fighter", "Interceptor", "Bomber"]);

/** Naval campaign types: contribute support eligibility rather than ground formations. */
export const CAMPAIGN_NAVAL_UNIT_TYPES: readonly string[] = Object.freeze(["Battleship", "Transport_Ship"]);

/**
 * Consumable/support allocation keys purchasable from the discretionary RP reserve even when
 * the engagement context caps combat formations. Kept deliberately small: the reserve buys
 * sustainment, not additional fighting power.
 */
export const RESERVE_PURCHASABLE_KEYS: readonly string[] = Object.freeze([
  "ammo",
  "fuel",
  "supplyConvoy",
  "medic",
  "maintenance"
]);

/** Returns the allocation key for a campaign unit type, or null when there is no tactical analogue. */
export function mapCampaignUnitToAllocationKey(campaignUnitType: string): string | null {
  return CAMPAIGN_TO_ALLOCATION[campaignUnitType] ?? null;
}

/**
 * Returns the RP value of a single campaign unit by pricing its mapped allocation option.
 * Unmapped or unknown types are worth 0 so they never distort force-ratio math.
 */
export function getCampaignUnitRpValue(campaignUnitType: string): number {
  const key = mapCampaignUnitToAllocationKey(campaignUnitType);
  if (!key) {
    return 0;
  }
  const option = getAllocationOption(key);
  return option ? option.costPerUnit : 0;
}

/**
 * Sums the mapped RP value of a force pool. Used for both the player's committed value
 * and the enemy estimate that drives the outgunned banner.
 */
export function sumForcePoolRpValue(pool: ReadonlyArray<{ unitType: string; count: number }>): number {
  let total = 0;
  for (const group of pool) {
    if (!group || group.count <= 0) {
      continue;
    }
    total += getCampaignUnitRpValue(group.unitType) * group.count;
  }
  return total;
}

/**
 * Converts a force pool into per-allocation-key caps. Groups whose type has no mapping are
 * logged once per call and skipped — availability must never crash the queue flow.
 */
export function buildAllocationCaps(
  pool: ReadonlyArray<{ unitType: string; count: number }>
): Record<string, number> {
  const caps: Record<string, number> = {};
  const unmapped = new Set<string>();
  for (const group of pool) {
    if (!group || group.count <= 0) {
      continue;
    }
    const key = mapCampaignUnitToAllocationKey(group.unitType);
    if (!key) {
      unmapped.add(group.unitType);
      continue;
    }
    caps[key] = (caps[key] ?? 0) + group.count;
  }
  if (unmapped.size > 0) {
    console.warn("[campaignForceMapping] Campaign unit types without tactical mapping were skipped", {
      unitTypes: Array.from(unmapped)
    });
  }
  return caps;
}
