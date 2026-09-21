import type { ScenarioUnit } from "../../../core/types";

export interface BattleAttackActionFlags {
  readonly movementPointsUsed: number;
  readonly attacksUsed: number;
  readonly retaliationsUsed: number;
  readonly isRushing: boolean;
}

export interface BattleAttackerPreparationInput {
  readonly attacker: ScenarioUnit;
  readonly resolvedFacing: ScenarioUnit["facing"];
  readonly ammunitionCost: number;
  readonly maneuverCost: number;
  readonly actionFlags: BattleAttackActionFlags;
}

export interface BattleAttackerPreparation {
  readonly attackRequestSource: ScenarioUnit;
  readonly updatedAttacker: ScenarioUnit;
  readonly nextActionFlags: BattleAttackActionFlags;
}

/**
 * Projects the attacker snapshots and action commitment shared by player and Bot
 * attacks. Runtime mutation, resource registries, combat RNG, and publication stay
 * in GameEngine; this function only creates detached deterministic values.
 */
export function projectBattleAttackerPreparation(
  input: BattleAttackerPreparationInput
): BattleAttackerPreparation {
  const attackRequestSource = structuredClone(input.attacker);
  attackRequestSource.facing = input.resolvedFacing;
  attackRequestSource.onSentry = false;

  const updatedAttacker = structuredClone(attackRequestSource);
  updatedAttacker.ammo = Math.max(0, updatedAttacker.ammo - input.ammunitionCost);

  return {
    attackRequestSource,
    updatedAttacker,
    nextActionFlags: {
      movementPointsUsed: input.actionFlags.movementPointsUsed + input.maneuverCost,
      attacksUsed: input.actionFlags.attacksUsed + 1,
      retaliationsUsed: input.actionFlags.retaliationsUsed,
      isRushing: input.actionFlags.isRushing
    }
  };
}
