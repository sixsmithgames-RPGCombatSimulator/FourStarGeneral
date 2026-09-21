import type { ScenarioUnit } from "../../../core/types";
import type { UnitSuppressionState } from "../BattleRuntimeContracts";

/** Canonical suppression classification shared by projections and engine rule queries. */
export function resolveBattleUnitSuppressionState(
  unit: Readonly<ScenarioUnit>
): { state: UnitSuppressionState; count: number } {
  const count = unit.suppressedBy?.length ?? 0;
  if (count >= 2) {
    return { state: unit.strength < 25 ? "broken" : "pinned", count };
  }
  return count === 1
    ? { state: "suppressed", count }
    : { state: "clear", count: 0 };
}
