import type { Axial } from "../../../core/Hex";
import type { CombatStance, ScenarioUnit } from "../../../core/types";

export type BattleAttackerDispositionKind = "destroyed" | "advance" | "hold";

export interface BattleAttackerDispositionInput {
  readonly attackerAfterCombat: ScenarioUnit;
  readonly targetHex: Axial;
  readonly stance?: CombatStance;
  readonly allDefendersDestroyed: boolean;
  readonly attackerIsAircraft: boolean;
  readonly primaryDefenderIsAircraft: boolean;
}

export interface BattleAttackerDispositionProjection {
  readonly kind: BattleAttackerDispositionKind;
  readonly attacker: ScenarioUnit;
}

/**
 * Projects where a resolved direct-fire attacker belongs after combat. GameEngine
 * retains every live removal, move, supply, recovery-site, and mirror mutation.
 */
export function projectBattleAttackerDisposition(
  input: BattleAttackerDispositionInput
): BattleAttackerDispositionProjection {
  const attacker = structuredClone(input.attackerAfterCombat);
  if (attacker.strength <= 0) {
    return {
      kind: "destroyed",
      attacker
    };
  }

  const canAdvance = input.stance === "assault"
    && input.allDefendersDestroyed
    && !input.attackerIsAircraft
    && !input.primaryDefenderIsAircraft;
  if (!canAdvance) {
    return {
      kind: "hold",
      attacker
    };
  }

  attacker.hex = structuredClone(input.targetHex);
  attacker.entrench = 0;
  return {
    kind: "advance",
    attacker
  };
}
