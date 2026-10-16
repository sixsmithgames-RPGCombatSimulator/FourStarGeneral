import type { ScenarioUnit, UnitClass, UnitTypeDefinition } from "../core/types";

/** Authored weapon role used by muzzle, tracer, and impact presentation. */
export type WeaponVisualRole = NonNullable<UnitTypeDefinition["weaponModel"]>["groups"][number]["role"];

/** Immutable fire composition derived solely from the resolved actor's definition. */
export interface FormationFireMix {
  readonly attackerType?: string;
  readonly attackerClass?: UnitClass;
  readonly hasWeaponModel: boolean;
  readonly totalShots: number;
  readonly shotsByRole: Partial<Record<WeaponVisualRole, number>>;
}

/** Resolved actor identity survives casualty removal, assault advance, and stack changes. */
export interface CombatPresentationActor {
  readonly unitId?: string;
  readonly unitType: string;
  readonly unitClass?: UnitClass;
}

/** Presentation-only input; never infers or changes the resolved combat outcome. */
export interface CombatPresentationContext {
  readonly attacker: CombatPresentationActor;
  readonly defender?: CombatPresentationActor;
}

/** Stable participants copied from a preview or resolved engine outcome. */
export interface ResolvedAttackPresentationSource {
  readonly attackerUnitId?: string;
  readonly attackerType: string;
  readonly defenderUnitId?: string;
  readonly defenderType: string;
  readonly retaliation?: { readonly attackerUnitId?: string; readonly attackerType?: string };
}

/** Projects forward/counterfire presentation from the resolved event, never from current hex occupants. */
export function buildResolvedAttackPresentation(
  source: ResolvedAttackPresentationSource,
  definitions: Readonly<Record<string, UnitTypeDefinition>> | undefined
): {
  readonly forward: CombatPresentationContext;
  readonly retaliation: CombatPresentationContext;
  readonly targetIsHard: boolean;
  readonly retaliationTargetIsHard: boolean;
} {
  const actor = (unitType: string, unitId?: string): CombatPresentationActor => ({ unitId, unitType, unitClass: definitions?.[unitType]?.class });
  const attacker = actor(source.attackerType, source.attackerUnitId);
  const defender = actor(source.defenderType, source.defenderUnitId);
  // Aggregate return fire can come from a different stacked defender. Missing
  // legacy counterfire identity must not claim the primary defender's sprite.
  const retaliator = actor(source.retaliation?.attackerType ?? source.defenderType, source.retaliation?.attackerUnitId);
  const isHardTarget = (actor: CombatPresentationActor): boolean => actor.unitClass === "vehicle" || actor.unitClass === "tank" || actor.unitClass === "air";
  return {
    forward: { attacker, defender },
    retaliation: { attacker: retaliator, defender: attacker },
    targetIsHard: isHardTarget(defender),
    retaliationTargetIsHard: isHardTarget(attacker)
  };
}

/** Read the resolver's actual first counterfire actor, including a non-primary stacked defender. */
export function buildPlayerAttackPresentation(
  preview: { readonly attacker: Pick<ScenarioUnit, "unitId" | "type">; readonly defender: Pick<ScenarioUnit, "unitId" | "type"> } | null,
  definitions: Readonly<Record<string, UnitTypeDefinition>> | undefined,
  defenders?: readonly { readonly unitId: string; readonly unitType: string; readonly retaliationOccurred: boolean }[]
): ReturnType<typeof buildResolvedAttackPresentation> {
  if (!preview) {
    throw new Error("Cannot present player attack: participant preview is unavailable; skip this cue and refresh the battle view.");
  }
  const retaliator = defenders?.find((entry) => entry.retaliationOccurred);
  return buildResolvedAttackPresentation({
    attackerUnitId: preview.attacker.unitId, attackerType: preview.attacker.type,
    defenderUnitId: preview.defender.unitId, defenderType: preview.defender.type,
    retaliation: retaliator ? { attackerUnitId: retaliator.unitId, attackerType: retaliator.unitType } : undefined
  }, definitions);
}

/** Preserve the existing weapon-role mix without consulting mutable per-hex state. */
export function buildCombatFormationFireMix(
  attackerType: string | undefined,
  attackerClass: UnitClass | undefined,
  weaponModel: UnitTypeDefinition["weaponModel"]
): FormationFireMix {
  const shotsByRole: Partial<Record<WeaponVisualRole, number>> = {};
  weaponModel?.groups.forEach((group) => {
    shotsByRole[group.role] = (shotsByRole[group.role] ?? 0) + Math.max(0, group.shots);
  });
  const totalShots = Object.values(shotsByRole).reduce((sum, shots) => sum + (shots ?? 0), 0);
  return { attackerType, attackerClass, hasWeaponModel: Boolean(weaponModel), totalShots, shotsByRole };
}
