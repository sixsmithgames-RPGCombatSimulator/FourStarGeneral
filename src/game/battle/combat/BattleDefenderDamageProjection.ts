import type { CombatStance, ScenarioUnit } from "../../../core/types";
import type { UnitSuppressionState } from "../BattleRuntimeContracts";
import { resolveBattleUnitSuppressionState } from "./BattleSuppressionState";
export interface BattleDefenderDamageProjectionInput {
  readonly defenderAfterDamage: ScenarioUnit;
  readonly stance?: CombatStance;
  readonly suppressorKey: string;
  readonly suppressionBefore: UnitSuppressionState;
}

export interface BattleDefenderDamageProjection {
  readonly updatedDefender: ScenarioUnit;
  readonly defenderBecameBroken: boolean;
}

/**
 * Finalizes deterministic defender state after GameEngine applies combat damage.
 * Damage stays in the engine; this owns attribution before classifying suppression.
 */
export function projectBattleDefenderDamage(
  input: BattleDefenderDamageProjectionInput
): BattleDefenderDamageProjection {
  const updatedDefender = structuredClone(input.defenderAfterDamage);
  if (input.stance === "suppressive" && updatedDefender.strength > 0) {
    const suppressors = Array.isArray(updatedDefender.suppressedBy)
      ? [...updatedDefender.suppressedBy]
      : [];
    if (!suppressors.includes(input.suppressorKey)) {
      suppressors.push(input.suppressorKey);
    }
    updatedDefender.suppressedBy = suppressors;
  }

  return {
    updatedDefender,
    defenderBecameBroken:
      updatedDefender.strength > 0
      && input.suppressionBefore !== "broken"
      && resolveBattleUnitSuppressionState(updatedDefender).state === "broken"
  };
}
