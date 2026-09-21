import type { AttackResult } from "../../../core/Combat";
import type { Axial } from "../../../core/Hex";
import type { FormationStatusSummary, ScenarioUnit } from "../../../core/types";
import type { DamagePacket } from "../../../data/unitSystem/damagePackets";
import type { TurnFaction } from "../BattleRuntimeTypes";

export interface CombatDamageSummary {
  readonly strengthBefore: number;
  readonly strengthAfter: number;
  readonly readinessLoss: number;
  readonly statusBefore: FormationStatusSummary;
  readonly statusAfter: FormationStatusSummary;
  readonly personnel: DamagePacket["personnel"];
  readonly equipment: DamagePacket["equipment"];
  readonly suppression: number;
  readonly fortificationDamage: number;
  readonly weaponHits: DamagePacket["weaponHits"];
  readonly componentDamage?: DamagePacket["componentDamage"];
  readonly damageTypesUsed: readonly string[];
  readonly statusTransitions?: DamagePacket["statusTransitions"];
  readonly summary: string;
}

export interface TargetRichResolutionEntry {
  readonly unitId: string;
  readonly unitType: ScenarioUnit["type"];
  readonly remainingStrength: number;
  readonly destroyed: boolean;
  readonly expectedDamage: number;
  readonly damage?: CombatDamageSummary;
  readonly retaliationDamage: number;
  readonly retaliation?: CombatDamageSummary;
  readonly retaliationOccurred: boolean;
}

export interface AttackResolution {
  readonly result: AttackResult;
  readonly defenderRemainingStrength: number;
  readonly defenderDestroyed: boolean;
  readonly defenderDamage?: CombatDamageSummary;
  readonly retaliationResult?: AttackResult;
  readonly attackerRemainingStrength?: number;
  readonly retaliationDamage?: CombatDamageSummary;
  readonly retaliationOccurred: boolean;
  readonly retaliationNote?: string;
  readonly targetRich?: boolean;
  readonly targetRichDefenders?: readonly TargetRichResolutionEntry[];
  readonly totalDefenderDamage?: number;
  readonly totalRetaliationDamage?: number;
}

export interface BotAttackSummary {
  readonly attackerType: string;
  readonly defenderType: string;
  readonly from: Axial;
  readonly target: Axial;
  readonly inflictedDamage: number;
  readonly damageSummary?: string;
  readonly defenderDamage?: CombatDamageSummary;
  readonly defenderDestroyed: boolean;
  readonly retaliation?: {
    readonly damage: number;
    readonly summary?: string;
    readonly damageSummary?: CombatDamageSummary;
    readonly terrainDefense: number;
    readonly accuracyMod: number;
    readonly attackerStrengthAfter: number;
  };
}

export interface BattleCombatReportProjection {
  readonly attacker: {
    readonly unit: ScenarioUnit;
    readonly hex: Axial;
    readonly faction: TurnFaction;
    readonly strengthBefore: number;
    readonly strengthAfter: number;
  };
  readonly defender: {
    readonly unit: ScenarioUnit;
    readonly hex: Axial;
    readonly faction: TurnFaction;
    readonly strengthBefore: number;
    readonly strengthAfter: number;
    readonly destroyed: boolean;
  };
  readonly attackResult: AttackResult;
  readonly retaliationResult?: AttackResult;
  readonly damage?: CombatDamageSummary;
  readonly retaliationDamage?: CombatDamageSummary;
}

interface AttackOutcomeProjectionBase {
  readonly attacker: BattleCombatReportProjection["attacker"];
  readonly defender: BattleCombatReportProjection["defender"];
  readonly attackResult: AttackResult;
  readonly defenderDamage?: CombatDamageSummary;
  readonly primaryRetaliationResult?: AttackResult;
  readonly primaryRetaliationDamage?: CombatDamageSummary;
  readonly primaryRetaliationOccurred: boolean;
}

export interface PlayerAttackOutcomeProjectionInput extends AttackOutcomeProjectionBase {
  readonly kind: "player";
  readonly retaliationOccurred: boolean;
  readonly retaliationNote?: string;
  readonly targetRichDefenders: readonly TargetRichResolutionEntry[];
  readonly totalDefenderDamage: number;
  readonly totalRetaliationDamage: number;
}

export interface BotAttackOutcomeProjectionInput extends AttackOutcomeProjectionBase {
  readonly kind: "bot";
  readonly retaliationOccurred: boolean;
  readonly representativeRetaliationResult?: AttackResult;
  readonly totalDefenderDamage: number;
  readonly totalRetaliationDamage: number;
  readonly allDefendersDestroyed: boolean;
}

export interface PlayerAttackOutcomeProjection {
  readonly report: BattleCombatReportProjection;
  readonly summary: AttackResolution;
}

export interface BotAttackOutcomeProjection {
  readonly report: BattleCombatReportProjection;
  readonly summary: BotAttackSummary;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function projectReport(input: AttackOutcomeProjectionBase): BattleCombatReportProjection {
  return {
    attacker: structuredClone(input.attacker),
    defender: structuredClone(input.defender),
    attackResult: structuredClone(input.attackResult),
    retaliationResult: input.primaryRetaliationOccurred
      ? cloneOptional(input.primaryRetaliationResult)
      : undefined,
    damage: cloneOptional(input.defenderDamage),
    retaliationDamage: input.primaryRetaliationOccurred
      ? cloneOptional(input.primaryRetaliationDamage)
      : undefined
  };
}

export function projectBattleAttackOutcome(
  input: PlayerAttackOutcomeProjectionInput
): PlayerAttackOutcomeProjection;
export function projectBattleAttackOutcome(
  input: BotAttackOutcomeProjectionInput
): BotAttackOutcomeProjection;
export function projectBattleAttackOutcome(
  input: PlayerAttackOutcomeProjectionInput | BotAttackOutcomeProjectionInput
): PlayerAttackOutcomeProjection | BotAttackOutcomeProjection {
  const report = projectReport(input);
  if (input.kind === "player") {
    return {
      report,
      summary: {
        result: structuredClone(input.attackResult),
        defenderRemainingStrength: input.defender.strengthAfter,
        defenderDestroyed: input.defender.destroyed,
        defenderDamage: cloneOptional(input.defenderDamage),
        retaliationResult: cloneOptional(input.primaryRetaliationResult),
        attackerRemainingStrength: input.attacker.strengthAfter,
        retaliationDamage: cloneOptional(input.primaryRetaliationDamage),
        retaliationOccurred: input.retaliationOccurred,
        retaliationNote: input.retaliationNote,
        targetRich: input.targetRichDefenders.length > 1,
        targetRichDefenders: structuredClone(input.targetRichDefenders),
        totalDefenderDamage: input.totalDefenderDamage,
        totalRetaliationDamage: input.totalRetaliationDamage
      }
    };
  }

  const representativeRetaliationResult = input.representativeRetaliationResult;
  return {
    report,
    summary: {
      attackerType: input.attacker.unit.type,
      defenderType: input.defender.unit.type,
      from: structuredClone(input.attacker.hex),
      target: structuredClone(input.defender.hex),
      inflictedDamage: input.totalDefenderDamage,
      damageSummary: input.defenderDamage?.summary,
      defenderDamage: cloneOptional(input.defenderDamage),
      defenderDestroyed: input.allDefendersDestroyed,
      retaliation: input.retaliationOccurred && representativeRetaliationResult
        ? {
            damage: input.totalRetaliationDamage,
            summary: input.primaryRetaliationDamage?.summary,
            damageSummary: cloneOptional(input.primaryRetaliationDamage),
            terrainDefense: 0,
            accuracyMod: Math.round(representativeRetaliationResult.accuracy * 100),
            attackerStrengthAfter: input.attacker.strengthAfter
          }
        : undefined
    }
  };
}
