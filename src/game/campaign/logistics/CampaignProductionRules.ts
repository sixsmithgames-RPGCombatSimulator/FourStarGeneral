/**
 * MODULE: CampaignProductionRules
 * WHAT: Defines deterministic campaign production allocation defaults, rates, and output math.
 * WHY: Planning previews and segment resolution must share one pure production rule without importing the CampaignState facade.
 */

import type { ProductionAllocation } from "../../../core/campaignTypes";

/** Balanced allocation that preserves the legacy output mix while adding ammunition production. */
export const DEFAULT_PRODUCTION_ALLOCATION: ProductionAllocation = {
  supplies: 40,
  fuel: 30,
  ammo: 10,
  manpower: 20
};

/** Concrete output per point of capacity when one resource receives the entire allocation. */
export const PRODUCTION_RATES: ProductionAllocation = {
  supplies: 2.5,
  fuel: 8 / 3,
  ammo: 2,
  manpower: 500
};

/** Converts frozen industrial capacity and allocation percentages into one daily delivery. */
export function computeDailyProduction(capacity: number, allocation: ProductionAllocation): ProductionAllocation {
  return {
    supplies: Math.round(capacity * (allocation.supplies / 100) * PRODUCTION_RATES.supplies),
    fuel: Math.round(capacity * (allocation.fuel / 100) * PRODUCTION_RATES.fuel),
    ammo: Math.round(capacity * (allocation.ammo / 100) * PRODUCTION_RATES.ammo),
    manpower: Math.round(capacity * (allocation.manpower / 100) * PRODUCTION_RATES.manpower)
  };
}
