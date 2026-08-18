/**
 * MODULE: CampaignRedeployRules
 * WHAT: Computes exact deterministic costs for one campaign redeployment plan.
 * WHY: Planner preview, typed validation, compatibility execution, AI, and tests must use identical movement economics.
 *
 * DEPENDENCIES: Transport-mode data defines capacity and applicable unit categories.
 * EXPORTS: calculateCampaignRedeploymentCosts.
 */

import type { TransportMode } from "../../../core/campaignTypes";
import { INFANTRY_UNITS } from "../../../data/transportModes";

export interface CampaignRedeploymentCosts {
  readonly fuelCost: number;
  readonly suppliesCost: number;
  readonly manpowerLoss: number;
  readonly capacityNeeded: number;
}

/** Computes the exact existing campaign economics for selected forces, distance, and transport. */
export function calculateCampaignRedeploymentCosts(
  selections: readonly { readonly unitType: string; readonly count: number }[],
  distance: number,
  transportMode: TransportMode
): CampaignRedeploymentCosts {
  let totalFuel = 0;
  let totalSupplies = 0;
  let totalManpower = 0;
  let totalCapacityNeeded = 0;

  selections.forEach((selection) => {
    const unitCount = selection.count;
    if (unitCount <= 0) return;
    if (transportMode.key === "foot") {
      if (INFANTRY_UNITS.includes(selection.unitType)) totalSupplies += unitCount * distance;
    } else if (transportMode.key === "truck") {
      const trucksNeeded = Math.ceil(unitCount / 100);
      totalCapacityNeeded += trucksNeeded;
      totalFuel += trucksNeeded * distance * 3;
      totalSupplies += trucksNeeded * distance;
      if (INFANTRY_UNITS.includes(selection.unitType)) totalSupplies += unitCount * distance;
    } else if (transportMode.key === "armor") {
      totalFuel += unitCount * distance * 25;
      totalSupplies += unitCount * distance * 5;
      totalManpower += unitCount * distance * 0.01;
    } else if (transportMode.key === "naval") {
      const shipsNeeded = Math.ceil(unitCount / 500);
      totalCapacityNeeded += shipsNeeded;
      totalFuel += shipsNeeded * distance * 1750;
      totalSupplies += shipsNeeded * distance * 70;
      totalManpower += unitCount * distance * 0.05;
    } else if (transportMode.key === "warship") {
      totalFuel += unitCount * distance * 2250;
      totalSupplies += unitCount * distance * 1500;
      totalManpower += unitCount * distance * 0.02;
    } else if (transportMode.key === "fighter") {
      totalFuel += unitCount * distance * 300;
      totalSupplies += unitCount * distance;
      totalManpower += unitCount * distance * 0.001;
    } else if (transportMode.key === "bomber") {
      totalFuel += unitCount * distance * 750;
      totalSupplies += unitCount * distance * 5;
      totalManpower += unitCount * distance * 0.002;
    }
  });

  return {
    fuelCost: Math.ceil(totalFuel),
    suppliesCost: Math.ceil(totalSupplies),
    manpowerLoss: Math.floor(totalManpower),
    capacityNeeded: totalCapacityNeeded
  };
}
