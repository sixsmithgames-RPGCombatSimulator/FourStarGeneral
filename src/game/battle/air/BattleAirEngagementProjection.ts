import type { Axial } from "../../../core/Hex";
import type {
  AirCombatExchangeEntry,
  AirEngagementEvent,
  FlakEngagementEntry
} from "./AirCombatContracts";
import type { TurnFaction } from "../BattleRuntimeTypes";

type AirEngagementParticipant = AirEngagementEvent["interceptors"][number];

export interface BattleAirEngagementBomberInput {
  readonly faction: TurnFaction;
  readonly unitKey: string;
  readonly unitType: string;
  readonly label?: string;
  readonly strengthBefore: number;
}

interface BattleAirEngagementInputBase {
  readonly missionId?: string;
  readonly location: Axial;
  readonly bomber: BattleAirEngagementBomberInput;
  readonly interceptors: ReadonlyArray<AirEngagementParticipant>;
}

export interface BattleFlakEngagementProjectionInput extends BattleAirEngagementInputBase {
  readonly type: "flak";
  readonly flakEngagements: ReadonlyArray<FlakEngagementEntry>;
}

export interface BattleAirInterceptionProjectionFacts {
  readonly bomberAfter: { readonly strength: number };
  readonly interceptorAttrition: number;
  readonly escortPhaseInterceptorAttrition: number;
  readonly bomberDefenseInterceptorAttrition: number;
  readonly interceptorKills: number;
  readonly escortAttrition: number;
  readonly escortKills: number;
  readonly escortsEngaged: number;
  readonly interceptorsAfterEscortPhase: number;
  readonly escortsAfterEscortPhase: number;
  readonly interceptorDeltas: ReadonlyArray<{
    readonly strengthAfterEscortPhase: number;
    readonly unitAfter: { readonly strength: number };
  }>;
  readonly escortDeltas: ReadonlyArray<{
    readonly strengthAfterEscortPhase: number;
    readonly unitAfter: { readonly strength: number };
  }>;
  readonly escortExchanges: ReadonlyArray<AirCombatExchangeEntry>;
  readonly bomberPassExchanges: ReadonlyArray<AirCombatExchangeEntry>;
}

export interface BattleAirToAirEngagementProjectionInput extends BattleAirEngagementInputBase {
  readonly type: "airToAir";
  readonly escorts: ReadonlyArray<AirEngagementParticipant>;
  readonly interception: BattleAirInterceptionProjectionFacts;
}

export interface BattleCapClashEngagementProjectionInput extends BattleAirEngagementInputBase {
  readonly type: "capClash";
  readonly missionId: string | undefined;
  readonly escorts: ReadonlyArray<AirEngagementParticipant>;
  readonly bomberStrengthAfter: number;
  readonly interceptorFinalStrengths: ReadonlyArray<number>;
  readonly escortFinalStrengths: ReadonlyArray<number>;
  readonly escortExchanges: ReadonlyArray<AirCombatExchangeEntry>;
}

export type BattleAirEngagementProjectionInput =
  | BattleFlakEngagementProjectionInput
  | BattleAirToAirEngagementProjectionInput
  | BattleCapClashEngagementProjectionInput;

function projectIdentity(input: BattleAirEngagementProjectionInput): Pick<
  AirEngagementEvent,
  "missionId" | "location" | "bomber" | "interceptors" | "escorts"
> {
  return {
    ...(input.type === "capClash" || input.missionId !== undefined ? { missionId: input.missionId } : {}),
    location: structuredClone(input.location),
    bomber: {
      faction: input.bomber.faction,
      unitKey: input.bomber.unitKey,
      unitType: input.bomber.unitType,
      ...(input.bomber.label === undefined ? {} : { label: input.bomber.label }),
      strength: input.bomber.strengthBefore
    },
    interceptors: structuredClone(input.interceptors),
    escorts: input.type === "flak" ? [] : structuredClone(input.escorts)
  };
}

function projectFlak(input: BattleFlakEngagementProjectionInput): AirEngagementEvent {
  const finalEngagement = input.flakEngagements[input.flakEngagements.length - 1];
  const bomberStrengthAfter = finalEngagement?.bomberStrengthAfter ?? input.bomber.strengthBefore;
  return {
    type: "flak",
    ...projectIdentity(input),
    flakDamage: input.flakEngagements.reduce((total, engagement) => total + engagement.damageToBomber, 0),
    flakEngagements: structuredClone(input.flakEngagements),
    bomberStrengthBefore: input.bomber.strengthBefore,
    bomberStrengthAfter,
    bomberDestroyed: bomberStrengthAfter <= 0
  };
}

function projectAirToAir(input: BattleAirToAirEngagementProjectionInput): AirEngagementEvent {
  const { interception } = input;
  return {
    type: "airToAir",
    ...projectIdentity(input),
    bomberStrengthBefore: input.bomber.strengthBefore,
    bomberStrengthAfter: interception.bomberAfter.strength,
    bomberDestroyed: interception.bomberAfter.strength <= 0,
    interceptorAttrition: interception.interceptorAttrition,
    escortPhaseInterceptorAttrition: interception.escortPhaseInterceptorAttrition,
    bomberDefenseInterceptorAttrition: interception.bomberDefenseInterceptorAttrition,
    interceptorKills: interception.interceptorKills,
    escortAttrition: interception.escortAttrition,
    escortKills: interception.escortKills,
    escortsEngaged: interception.escortsEngaged,
    interceptorsAfterEscortPhase: interception.interceptorsAfterEscortPhase,
    escortsAfterEscortPhase: interception.escortsAfterEscortPhase,
    interceptorStrengthsAfterEscortPhase: interception.interceptorDeltas.map((delta) => delta.strengthAfterEscortPhase),
    escortStrengthsAfterEscortPhase: interception.escortDeltas.map((delta) => delta.strengthAfterEscortPhase),
    interceptorFinalStrengths: interception.interceptorDeltas.map((delta) => delta.unitAfter.strength),
    escortFinalStrengths: interception.escortDeltas.map((delta) => delta.unitAfter.strength),
    escortExchanges: structuredClone(interception.escortExchanges),
    bomberPassExchanges: structuredClone(interception.bomberPassExchanges)
  };
}

function projectCapClash(input: BattleCapClashEngagementProjectionInput): AirEngagementEvent {
  const interceptorStrengths = [...input.interceptorFinalStrengths];
  const escortStrengths = [...input.escortFinalStrengths];
  return {
    type: "capClash",
    ...projectIdentity(input),
    bomberStrengthBefore: input.bomber.strengthBefore,
    bomberStrengthAfter: input.bomberStrengthAfter,
    bomberDestroyed: false,
    escortExchanges: structuredClone(input.escortExchanges),
    bomberPassExchanges: [],
    interceptorsAfterEscortPhase: interceptorStrengths.filter((strength) => strength > 0).length,
    escortsAfterEscortPhase: escortStrengths.filter((strength) => strength > 0).length,
    interceptorStrengthsAfterEscortPhase: [...interceptorStrengths],
    escortStrengthsAfterEscortPhase: [...escortStrengths],
    interceptorFinalStrengths: interceptorStrengths,
    escortFinalStrengths: escortStrengths
  };
}

/** Detaches the UI-facing air engagement record from mutable combat transaction state. */
export function projectBattleAirEngagement(input: BattleAirEngagementProjectionInput): AirEngagementEvent {
  if (input.type === "flak") return projectFlak(input);
  return input.type === "airToAir" ? projectAirToAir(input) : projectCapClash(input);
}
