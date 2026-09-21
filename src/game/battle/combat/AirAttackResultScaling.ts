import type { AttackResult } from "../../../core/Combat";
export interface AirAttackResultScalingInput {
  readonly attackerIsAircraft: boolean;
  readonly attackerIsBomber: boolean;
  readonly defenderIsAircraft: boolean;
}

/** Applies the shared tactical and mission air-damage profile without consuming RNG or mutating its input. */
export function scaleAirAttackResult(
  result: AttackResult,
  input: AirAttackResultScalingInput
): AttackResult {
  if (input.attackerIsBomber && !input.defenderIsAircraft) {
    return {
      ...result,
      damagePerHit: result.damagePerHit * 10,
      expectedDamage: result.expectedDamage * 10,
      expectedSuppression: result.expectedSuppression * 10
    };
  }
  if (input.attackerIsAircraft && !input.attackerIsBomber && input.defenderIsAircraft) {
    return {
      ...result,
      damagePerHit: result.damagePerHit * 4,
      expectedDamage: result.expectedDamage * 4,
      expectedSuppression: result.expectedSuppression * 4
    };
  }
  return result;
}
