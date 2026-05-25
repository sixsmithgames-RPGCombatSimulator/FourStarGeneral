/**
 * Initiative System Type Extensions
 * 
 * Extends existing types with initiative-specific properties.
 * This approach avoids modifying core interfaces and maintains backward compatibility.
 * 
 * @since Initiative System v1.0
 */

import type { ScenarioUnit } from './types';

/**
 * ScenarioUnit extended with initiative system properties
 * 
 * This interface represents a unit that has been enhanced with initiative tracking.
 * It's used when the initiative system is active and provides additional state
 * without modifying the core ScenarioUnit interface.
 */
export interface InitiativeUnit extends ScenarioUnit {
  /** Initiative system: whether this unit has been activated this turn */
  isActivatedThisTurn: boolean;
  /** Initiative system: order in which this unit was activated this turn (for debugging) */
  activationOrder?: number;
}

/**
 * Type guard to check if a unit has initiative properties
 * 
 * @param unit - The unit to check
 * @returns True if the unit has initiative properties
 */
export function isInitiativeUnit(unit: ScenarioUnit): unit is InitiativeUnit {
  return 'isActivatedThisTurn' in unit;
}

/**
 * Convert a ScenarioUnit to an InitiativeUnit with default activation state
 * 
 * @param unit - The base unit to convert
 * @returns The unit with initiative properties initialized
 */
export function toInitiativeUnit(unit: ScenarioUnit): InitiativeUnit {
  return {
    ...unit,
    isActivatedThisTurn: false,
    activationOrder: undefined
  };
}

/**
 * Reset activation state for a unit (called at start of new turn)
 * 
 * @param unit - The unit to reset
 */
export function resetUnitActivation(unit: InitiativeUnit): void {
  unit.isActivatedThisTurn = false;
  unit.activationOrder = undefined;
}

/**
 * Mark a unit as activated with the given order
 * 
 * @param unit - The unit to activate
 * @param order - The activation order number
 */
export function activateUnit(unit: InitiativeUnit, order: number): void {
  unit.isActivatedThisTurn = true;
  unit.activationOrder = order;
}
