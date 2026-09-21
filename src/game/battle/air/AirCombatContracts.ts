import type { Axial } from "../../../core/Hex";
import type { AirMissionKind } from "../../../core/types";
import type { CombatDamageSummary } from "../combat/BattleAttackOutcomeProjection";
import type { TurnFaction } from "../BattleRuntimeTypes";

export type { TurnFaction } from "../BattleRuntimeTypes";

/** Lifecycle state persisted for a scheduled air mission. */
export type AirMissionStatus = "queued" | "inFlight" | "resolving" | "completed";

export type AirMissionResult = "success" | "partial" | "aborted" | "destroyed";

export interface AirMissionOutcomeBase {
  readonly type: AirMissionKind;
  readonly result: AirMissionResult;
  readonly details: string;
  readonly refitRequired: boolean;
  readonly meta?: {
    readonly flakAttrition?: number;
    readonly capIntercepts?: number;
    readonly capKills?: number;
    readonly escortsEngaged?: number;
    readonly escortsWins?: number;
    readonly bomberAttrition?: number;
    readonly interceptorAttrition?: number;
    readonly escortPhaseInterceptorAttrition?: number;
    readonly bomberDefenseInterceptorAttrition?: number;
    readonly interceptorKills?: number;
    readonly escortAttrition?: number;
    readonly escortKills?: number;
  };
}

export type AirMissionOutcome =
  | (AirMissionOutcomeBase & {
      readonly type: "strike";
      readonly damageInflicted?: number;
      readonly defenderDestroyed?: boolean;
      readonly defenderType?: string;
    })
  | (AirMissionOutcomeBase & {
      readonly type: "escort";
      readonly interceptions?: number;
      readonly protectedUnitKey?: string;
    })
  | (AirMissionOutcomeBase & {
      readonly type: "airCover";
      readonly interceptions?: number;
      readonly protectedHex?: Axial;
    })
  | (AirMissionOutcomeBase & {
      readonly type: "airTransport";
      readonly droppedUnitType?: string;
      readonly droppedHex?: Axial;
    });

/** Save-stable and UI-facing projection of a scheduled mission. */
export interface SerializedAirMission {
  readonly id: string;
  readonly kind: AirMissionKind;
  readonly faction: TurnFaction;
  readonly unitKey: string;
  readonly originHexKey?: string;
  readonly unitType: string;
  readonly status: AirMissionStatus;
  readonly launchTurn: number;
  readonly turnsRemaining: number;
  readonly targetHex?: Axial;
  readonly targetUnitKey?: string;
  readonly escortTargetUnitKey?: string;
  readonly interceptions?: number;
  readonly airCombatDamageInflicted?: number;
  readonly airCombatDamageTaken?: number;
  readonly airCombatKills?: number;
  readonly outcome?: AirMissionOutcome;
}

/** Lightweight mission arrival consumed by battle playback. */
export interface AirMissionArrival {
  readonly missionId: string;
  readonly faction: TurnFaction;
  readonly unitKey: string;
  readonly originHexKey?: string;
  readonly unitType: string;
  readonly unitStrength?: number;
  readonly kind: AirMissionKind;
  readonly targetHex?: Axial;
  readonly targetUnitKey?: string;
  readonly escortTargetUnitKey?: string;
}

export interface AirCombatExchangeEntry {
  readonly phase: "capClash" | "escortClash" | "bomberPass";
  readonly attackerFaction: TurnFaction;
  readonly attackerUnitKey: string;
  readonly attackerUnitType: string;
  readonly attackerLabel?: string;
  readonly defenderFaction: TurnFaction;
  readonly defenderUnitKey: string;
  readonly defenderUnitType: string;
  readonly defenderLabel?: string;
  readonly attackerStrengthBefore: number;
  readonly attackerStrengthAfter: number;
  readonly defenderStrengthBefore: number;
  readonly defenderStrengthAfter: number;
  readonly damageToDefender: number;
  readonly retaliationDamage: number;
  readonly damageSummaryToDefender?: CombatDamageSummary;
  readonly retaliationDamageSummary?: CombatDamageSummary;
  readonly attackerDestroyed: boolean;
  readonly defenderDestroyed: boolean;
  readonly visualPasses?: number;
  readonly escortIndex?: number;
  readonly interceptorIndex?: number;
}

export interface FlakEngagementEntry {
  readonly batteryFaction: TurnFaction;
  readonly batteryUnitKey: string;
  readonly batteryUnitType: string;
  readonly batteryLabel?: string;
  readonly batteryHex?: Axial;
  readonly bomberFaction: TurnFaction;
  readonly bomberUnitKey: string;
  readonly bomberUnitType: string;
  readonly bomberLabel?: string;
  readonly bomberStrengthBefore: number;
  readonly bomberStrengthAfter: number;
  readonly damageToBomber: number;
  readonly bomberDestroyed: boolean;
}

/** Immutable combat event consumed by air-show planning and scene projection. */
export interface AirEngagementEvent {
  readonly type: "airToAir" | "capClash" | "flak";
  readonly location: Axial;
  readonly missionId?: string;
  readonly bomber: {
    readonly faction: TurnFaction;
    readonly unitKey: string;
    readonly unitType: string;
    readonly label?: string;
    readonly strength?: number;
  };
  readonly interceptors: ReadonlyArray<{
    readonly faction: TurnFaction;
    readonly unitKey: string;
    readonly unitType: string;
    readonly label?: string;
    readonly strength?: number;
    readonly hex?: Axial;
  }>;
  readonly escorts: ReadonlyArray<{
    readonly faction: TurnFaction;
    readonly unitKey: string;
    readonly unitType: string;
    readonly label?: string;
    readonly strength?: number;
  }>;
  readonly flakDamage?: number;
  readonly flakEngagements?: ReadonlyArray<FlakEngagementEntry>;
  readonly bomberStrengthBefore?: number;
  readonly bomberStrengthAfter?: number;
  readonly bomberDestroyed?: boolean;
  readonly interceptorAttrition?: number;
  readonly escortPhaseInterceptorAttrition?: number;
  readonly bomberDefenseInterceptorAttrition?: number;
  readonly interceptorKills?: number;
  readonly escortAttrition?: number;
  readonly escortKills?: number;
  readonly escortExchanges?: ReadonlyArray<AirCombatExchangeEntry>;
  readonly bomberPassExchanges?: ReadonlyArray<AirCombatExchangeEntry>;
  readonly escortsEngaged?: number;
  readonly interceptorsAfterEscortPhase?: number;
  readonly escortsAfterEscortPhase?: number;
  readonly interceptorStrengthsAfterEscortPhase?: ReadonlyArray<number>;
  readonly escortStrengthsAfterEscortPhase?: ReadonlyArray<number>;
  readonly interceptorFinalStrengths?: ReadonlyArray<number>;
  readonly escortFinalStrengths?: ReadonlyArray<number>;
}
