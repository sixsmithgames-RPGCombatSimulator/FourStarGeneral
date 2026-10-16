/** Shared authored-state and runtime limit for friendly combat formations in one hex. */
export const COMBAT_STACK_LIMIT = 2;

/** Logistics trucks share a hex without consuming a combat formation slot. */
export function countsTowardCombatStack(unitType: string): boolean {
  return unitType !== "Supply_Truck";
}
