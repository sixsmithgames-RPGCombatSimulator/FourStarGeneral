/**
 * Repair and Healing System
 * 
 * Manages unit recovery through:
 * - Field repairs by unit crews (minor equipment damage)
 * - Medical treatment for casualties
 * - Workshop repairs for major damage
 * - Salvage operations for destroyed equipment
 * 
 * @module RepairSystem
 */

import type {
  FormationStatus,
  ScenarioUnit,
  VehicleComponent
} from "../../core/types";
import { deriveStrengthFromStatus } from "./status";

/**
 * Helper: Calculate total fit personnel from formation status.
 */
function fitPersonnel(status: FormationStatus | undefined): number {
  if (!status) return 0;
  return Object.values(status.personnel).reduce((sum, pool) => sum + Math.max(0, pool.fit), 0);
}

/**
 * Repair action types available for damaged units.
 */
export type RepairActionType =
  | "fieldRepair"      // Unit crew performs minor repairs
  | "fieldMedic"       // Medics treat injured personnel
  | "evacuation"       // Evacuate severely wounded
  | "workshopRepair"   // Send to workshop for major repairs
  | "salvage";         // Salvage destroyed equipment for parts

/**
 * Configuration for repair actions.
 */
export interface RepairConfig {
  /** Base time in hours for the repair action */
  baseTimeHours: number;
  /** Personnel required to perform the repair */
  personnelRequired: number;
  /** Supplies consumed per unit repaired */
  supplyCost: number;
  /** Success probability (0-1) */
  successChance: number;
  /** Maximum damage state this action can address */
  maxDamageState: "damaged" | "disabled" | "destroyed";
}

/**
 * Default repair configurations.
 */
export const REPAIR_CONFIGS: Record<RepairActionType, RepairConfig> = {
  fieldRepair: {
    baseTimeHours: 2,
    personnelRequired: 2,
    supplyCost: 0.5,
    successChance: 0.8,
    maxDamageState: "damaged"
  },
  fieldMedic: {
    baseTimeHours: 1,
    personnelRequired: 1,
    supplyCost: 0.3,
    successChance: 0.9,
    maxDamageState: "damaged"
  },
  evacuation: {
    baseTimeHours: 4,
    personnelRequired: 2,
    supplyCost: 0,
    successChance: 0.95,
    maxDamageState: "disabled"
  },
  workshopRepair: {
    baseTimeHours: 24,
    personnelRequired: 5,
    supplyCost: 2.0,
    successChance: 0.95,
    maxDamageState: "disabled"
  },
  salvage: {
    baseTimeHours: 8,
    personnelRequired: 3,
    supplyCost: 0,
    successChance: 0.7,
    maxDamageState: "destroyed"
  }
};

/**
 * Result of a repair action.
 */
export interface RepairResult {
  /** Whether the repair was successful */
  success: boolean;
  /** Amount of damage repaired/recovered */
  amountRepaired: number;
  /** Time taken in hours */
  timeHours: number;
  /** Supplies consumed */
  suppliesUsed: number;
  /** Human-readable description */
  description: string;
}

/**
 * Check if a unit can perform a field repair on itself.
 * 
 * Requirements:
 * - Unit must have operational personnel
 * - Unit must not be in active combat
 * - Unit must have damaged (but not destroyed) equipment
 * 
 * @param unit - The unit to check
 * @returns Whether field repair is possible
 */
export function canPerformFieldRepair(unit: ScenarioUnit): boolean {
  const status = unit.status;
  if (!status) return false;

  // Need operational personnel
  const availablePersonnel = fitPersonnel(status);
  if (availablePersonnel < REPAIR_CONFIGS.fieldRepair.personnelRequired) {
    return false;
  }

  // Need damaged equipment tracked in the detailed vehicle status pools.
  const pools = Object.values(status.equipment);
  const totalVehicles = pools.reduce((sum, p) => 
    sum + p.operational + p.damaged + p.disabled + p.destroyed, 0);
  
  if (totalVehicles === 0) return false;

  // Must have some damaged equipment to repair
  const damagedCount = pools.reduce((sum, p) => sum + p.damaged, 0);
  return damagedCount > 0;
}

/**
 * Check if a unit has personnel needing medical treatment.
 * 
 * @param unit - The unit to check
 * @returns Whether medical treatment is needed
 */
export function hasCasualtiesNeedingTreatment(unit: ScenarioUnit): boolean {
  const status = unit.status;
  if (!status) return false;

  return Object.values(status.personnel).some((pool) => 
    pool.injured > 0 || pool.wounded > 0
  );
}

/**
 * Check if a unit has severely wounded needing evacuation.
 * 
 * @param unit - The unit to check
 * @returns Whether evacuation is needed
 */
export function hasCriticalCasualties(unit: ScenarioUnit): boolean {
  const status = unit.status;
  if (!status) return false;

  return Object.values(status.personnel).some((pool) => pool.severelyWounded > 0);
}

/**
 * Apply field repair to a unit's equipment.
 * Converts damaged equipment back to operational state.
 * 
 * @param unit - Unit to repair
 * @param repairHours - Hours spent repairing (affects amount repaired)
 * @returns Result of the repair action
 */
export function applyFieldRepair(
  unit: ScenarioUnit,
  repairHours: number
): RepairResult {
  const config = REPAIR_CONFIGS.fieldRepair;
  const status = unit.status;

  if (!status) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "Unit has no status data."
    };
  }

  // Check personnel availability
  const availablePersonnel = fitPersonnel(status);
  if (availablePersonnel < config.personnelRequired) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: `Insufficient personnel. Need ${config.personnelRequired}, have ${availablePersonnel}.`
    };
  }

  // Calculate repair amount based on time and success chance
  const success = Math.random() < config.successChance;
  const repairRate = 0.5; // 50% of damaged equipment per full repair cycle
  const timeFactor = Math.min(repairHours / config.baseTimeHours, 2); // Cap at 2x effectiveness
  
  let totalRepaired = 0;
  const suppliesUsed = config.supplyCost * timeFactor;

  if (success) {
    // Repair damaged equipment across all pools
    Object.values(status.equipment).forEach((pool) => {
      if (pool.damaged > 0) {
        const repairAmount = Math.min(
          pool.damaged,
          Math.ceil(pool.damaged * repairRate * timeFactor)
        );
        pool.damaged -= repairAmount;
        pool.operational += repairAmount;
        totalRepaired += repairAmount;
      }
    });
  }

  // Update unit strength after repair
  unit.strength = recalculateUnitStrength(status);

  return {
    success,
    amountRepaired: totalRepaired,
    timeHours: repairHours,
    suppliesUsed,
    description: success 
      ? `Field repair successful. ${totalRepaired.toFixed(1)} equipment restored to operational.`
      : "Field repair failed. Equipment remains damaged."
  };
}

/**
 * Apply medical treatment to injured and wounded personnel.
 * Converts injured/wounded to fit status.
 * 
 * @param unit - Unit to treat
 * @param treatmentHours - Hours spent treating (affects recovery rate)
 * @returns Result of the medical treatment
 */
export function applyMedicalTreatment(
  unit: ScenarioUnit,
  treatmentHours: number
): RepairResult {
  const config = REPAIR_CONFIGS.fieldMedic;
  const status = unit.status;

  if (!status) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "Unit has no status data."
    };
  }

  // Check personnel availability (need medics/someone to treat)
  const availablePersonnel = fitPersonnel(status);
  if (availablePersonnel < config.personnelRequired) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: `Insufficient personnel. Need ${config.personnelRequired}, have ${availablePersonnel}.`
    };
  }

  const success = Math.random() < config.successChance;
  const recoveryRate = 0.6; // 60% recovery per full treatment cycle
  const timeFactor = Math.min(treatmentHours / config.baseTimeHours, 2);
  
  let totalTreated = 0;
  const suppliesUsed = config.supplyCost * timeFactor;

  if (success) {
    // Treat injured first, then wounded
    Object.values(status.personnel).forEach((pool) => {
      // Treat injured (minor wounds, faster recovery)
      if (pool.injured > 0) {
        const treatAmount = Math.min(
          pool.injured,
          Math.ceil(pool.injured * recoveryRate * timeFactor * 1.5)
        );
        pool.injured -= treatAmount;
        pool.fit += treatAmount;
        totalTreated += treatAmount;
      }

      // Treat wounded (more serious, slower recovery)
      if (pool.wounded > 0) {
        const treatAmount = Math.min(
          pool.wounded,
          Math.ceil(pool.wounded * recoveryRate * timeFactor)
        );
        pool.wounded -= treatAmount;
        pool.fit += treatAmount;
        totalTreated += treatAmount;
      }
    });
  }

  // Update unit strength after treatment
  unit.strength = recalculateUnitStrength(status);

  return {
    success,
    amountRepaired: totalTreated,
    timeHours: treatmentHours,
    suppliesUsed,
    description: success
      ? `Medical treatment successful. ${totalTreated.toFixed(1)} personnel returned to fit status.`
      : "Medical treatment incomplete. Some casualties remain."
  };
}

/**
 * Evacuate severely wounded personnel.
 * Removes them from the unit (they're sent to rear hospitals).
 * Reduces unit strength but preserves remaining combat capability.
 * 
 * @param unit - Unit to evacuate casualties from
 * @returns Result of the evacuation
 */
export function applyEvacuation(unit: ScenarioUnit): RepairResult {
  const config = REPAIR_CONFIGS.evacuation;
  const status = unit.status;

  if (!status) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "Unit has no status data."
    };
  }

  // Check for severely wounded to evacuate
  const severeWounded = Object.values(status.personnel).reduce(
    (sum, pool) => sum + pool.severelyWounded, 0
  );

  if (severeWounded === 0) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "No severely wounded personnel to evacuate."
    };
  }

  const success = Math.random() < config.successChance;
  let evacuated = 0;

  if (success) {
    Object.values(status.personnel).forEach((pool) => {
      if (pool.severelyWounded > 0) {
        // Evacuate all severely wounded (they're removed from the unit)
        evacuated += pool.severelyWounded;
        pool.severelyWounded = 0;
      }
    });
  } else {
    // Partial evacuation
    Object.values(status.personnel).forEach((pool) => {
      if (pool.severelyWounded > 0) {
        const partial = Math.ceil(pool.severelyWounded * 0.7);
        evacuated += partial;
        pool.severelyWounded -= partial;
      }
    });
  }

  // Update unit strength after evacuation
  unit.strength = recalculateUnitStrength(status);

  return {
    success,
    amountRepaired: evacuated,
    timeHours: config.baseTimeHours,
    suppliesUsed: 0,
    description: success
      ? `Evacuation complete. ${evacuated.toFixed(0)} severely wounded evacuated to rear hospital.`
      : `Partial evacuation. ${evacuated.toFixed(0)} evacuated, some remain in unit.`
  };
}

/**
 * Apply workshop-level repairs to a unit.
 * Can restore disabled equipment to operational status.
 * 
 * @param unit - Unit to repair in workshop
 * @param repairHours - Hours of workshop time
 * @returns Result of the workshop repair
 */
export function applyWorkshopRepair(
  unit: ScenarioUnit,
  repairHours: number
): RepairResult {
  const config = REPAIR_CONFIGS.workshopRepair;
  const status = unit.status;

  if (!status) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "Unit has no status data."
    };
  }

  const success = Math.random() < config.successChance;
  const repairRate = 0.4; // 40% per cycle (slower than field repair but handles disabled)
  const timeFactor = Math.min(repairHours / config.baseTimeHours, 3); // Allow up to 3x
  
  let totalRepaired = 0;
  const suppliesUsed = config.supplyCost * timeFactor;

  if (success) {
    // Repair disabled equipment first (priority)
    Object.values(status.equipment).forEach((pool) => {
      if (pool.disabled > 0) {
        const repairAmount = Math.min(
          pool.disabled,
          Math.ceil(pool.disabled * repairRate * timeFactor)
        );
        pool.disabled -= repairAmount;
        pool.operational += repairAmount;
        totalRepaired += repairAmount;
      }
    });

    // Then repair damaged equipment
    Object.values(status.equipment).forEach((pool) => {
      if (pool.damaged > 0) {
        const repairAmount = Math.min(
          pool.damaged,
          Math.ceil(pool.damaged * repairRate * timeFactor)
        );
        pool.damaged -= repairAmount;
        pool.operational += repairAmount;
        totalRepaired += repairAmount;
      }
    });
  }

  // Update unit strength
  unit.strength = recalculateUnitStrength(status);

  return {
    success,
    amountRepaired: totalRepaired,
    timeHours: repairHours,
    suppliesUsed,
    description: success
      ? `Workshop repair complete. ${totalRepaired.toFixed(1)} equipment restored.`
      : "Workshop repair incomplete. Additional time required."
  };
}

/**
 * Salvage destroyed equipment for parts.
 * Clears destroyed equipment and recovers some supplies.
 * 
 * @param unit - Unit to salvage
 * @returns Result of the salvage operation
 */
export function applySalvage(unit: ScenarioUnit): RepairResult {
  const config = REPAIR_CONFIGS.salvage;
  const status = unit.status;

  if (!status) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "Unit has no status data."
    };
  }

  // Check for destroyed equipment to salvage
  const destroyedCount = Object.values(status.equipment).reduce(
    (sum, pool) => sum + pool.destroyed, 0
  );

  if (destroyedCount === 0) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "No destroyed equipment to salvage."
    };
  }

  const success = Math.random() < config.successChance;
  let salvaged = 0;
  let suppliesRecovered = 0;

  if (success) {
    Object.values(status.equipment).forEach((pool) => {
      if (pool.destroyed > 0) {
        // Salvage all destroyed equipment
        salvaged += pool.destroyed;
        // Recover some supplies (30% of destroyed equipment value)
        suppliesRecovered += pool.destroyed * 0.3;
        pool.destroyed = 0;
      }
    });
  } else {
    // Partial salvage
    Object.values(status.equipment).forEach((pool) => {
      if (pool.destroyed > 0) {
        const partial = Math.ceil(pool.destroyed * 0.5);
        salvaged += partial;
        suppliesRecovered += partial * 0.3;
        pool.destroyed -= partial;
      }
    });
  }

  // Update unit strength (salvage doesn't restore strength, just clears destroyed)
  unit.strength = recalculateUnitStrength(status);

  return {
    success,
    amountRepaired: salvaged,
    timeHours: config.baseTimeHours,
    suppliesUsed: -suppliesRecovered, // Negative because we recover supplies
    description: success
      ? `Salvage complete. ${salvaged.toFixed(1)} equipment processed. ${suppliesRecovered.toFixed(1)} supplies recovered.`
      : `Partial salvage. ${salvaged.toFixed(1)} equipment processed.`
  };
}

/**
 * Apply component-specific repairs to a unit.
 * Targeted repair of specific vehicle components.
 * 
 * @param unit - Unit to repair
 * @param component - Specific component to repair
 * @param targetState - Target state after repair (damaged or operational)
 * @returns Result of the component repair
 */
export function applyComponentRepair(
  unit: ScenarioUnit,
  component: VehicleComponent,
  targetState: "damaged" | "operational" = "operational"
): RepairResult {
  const status = unit.status;

  if (!status) {
    return {
      success: false,
      amountRepaired: 0,
      timeHours: 0,
      suppliesUsed: 0,
      description: "Unit has no status data."
    };
  }

  // This is a simplified component repair - in a full implementation,
  // component damage would be tracked per-vehicle in the status
  
  // For now, treat this as a focused field repair
  const timeHours = targetState === "operational" ? 4 : 2;
  // Simulate component repair by doing a partial field repair
  const repairResult = applyFieldRepair(unit, timeHours);
  
  return {
    ...repairResult,
    description: `${repairResult.description} (${component} focused repair)`
  };
}

/**
 * Recalculate unit strength based on current status.
 * 
 * @param status - Unit formation status
 * @returns Recalculated strength value
 */
function recalculateUnitStrength(status: FormationStatus): number {
  return deriveStrengthFromStatus(status, 100);
}

/**
 * Get recommended repair actions for a unit.
 * 
 * @param unit - Unit to assess
 * @returns Array of recommended repair actions with priorities
 */
export function getRecommendedRepairs(unit: ScenarioUnit): {
  action: RepairActionType;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
}[] {
  const recommendations: { action: RepairActionType; priority: "critical" | "high" | "medium" | "low"; reason: string }[] = [];
  const status = unit.status;

  if (!status) return recommendations;

  // Check for critical casualties needing evacuation
  const severeWounded = Object.values(status.personnel).reduce(
    (sum, pool) => sum + pool.severelyWounded, 0
  );
  if (severeWounded > 0) {
    recommendations.push({
      action: "evacuation",
      priority: "critical",
      reason: `${severeWounded.toFixed(1)} severely wounded need immediate evacuation.`
    });
  }

  // Check for wounded needing treatment
  const wounded = Object.values(status.personnel).reduce(
    (sum, pool) => sum + pool.wounded + pool.injured, 0
  );
  if (wounded > 0) {
    recommendations.push({
      action: "fieldMedic",
      priority: severeWounded > 0 ? "high" : "medium",
      reason: `${wounded.toFixed(1)} casualties need medical treatment.`
    });
  }

  // Check for disabled equipment
  const disabled = Object.values(status.equipment).reduce(
    (sum, pool) => sum + pool.disabled, 0
  );
  if (disabled > 0) {
    recommendations.push({
      action: "workshopRepair",
      priority: disabled >= 2 ? "high" : "medium",
      reason: `${disabled.toFixed(1)} equipment disabled, requires workshop.`
    });
  }

  // Check for damaged equipment
  const damaged = Object.values(status.equipment).reduce(
    (sum, pool) => sum + pool.damaged, 0
  );
  if (damaged > 0 && disabled === 0) {
    recommendations.push({
      action: "fieldRepair",
      priority: damaged >= 3 ? "medium" : "low",
      reason: `${damaged.toFixed(1)} equipment damaged, field repair possible.`
    });
  }

  // Check for destroyed equipment
  const destroyed = Object.values(status.equipment).reduce(
    (sum, pool) => sum + pool.destroyed, 0
  );
  if (destroyed > 0) {
    recommendations.push({
      action: "salvage",
      priority: "low",
      reason: `${destroyed.toFixed(1)} equipment destroyed, salvage for parts.`
    });
  }

  return recommendations;
}
