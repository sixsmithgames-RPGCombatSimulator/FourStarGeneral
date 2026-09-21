import type { Axial } from "../core/types";
import type { AirEngagementEvent, TurnFaction } from "../game/battle/air/AirCombatContracts";
import type { CombatPreview } from "../game/GameEngine";

/** Pending attack intent retained while the commander reviews the confirmation dialog. */
export interface PendingAttackContext {
  readonly attacker: string;
  readonly target: string;
  readonly preview: CombatPreview | null;
  readonly attackerUnitId: string | null;
  readonly defenderUnitId: string | null;
}

/** Pending battlefield-work intent retained while the edge-facing dialog owns input. */
export interface PendingFortificationContext {
  readonly hex: Axial;
  readonly hexKey: string;
  readonly unitLabel: string;
  readonly unitId: string | null;
  readonly modificationType: "fortifications" | "tankTraps" | "smoke" | "facing";
  readonly callerAxial?: Axial;
}

export interface PreparedAirMissionFlight {
  readonly missionId: string;
  readonly faction: TurnFaction;
  readonly kind: string;
  readonly unitKey: string;
  readonly originKey: string;
  readonly destKey: string;
  readonly unitType: string;
  readonly strength?: number;
  readonly laneOffsetPx: number;
  readonly targetHex?: Axial;
  readonly targetUnitKey?: string;
  readonly escortTargetUnitKey?: string;
}

export interface LinkedStrikePlaybackOperation {
  readonly kind: "linkedStrike";
  readonly index: number;
  readonly focusHex: Axial | null;
  readonly focusKey: string | null;
  readonly flight: PreparedAirMissionFlight;
  readonly linkedEvents: readonly AirEngagementEvent[];
  readonly escorts: readonly PreparedAirMissionFlight[];
}

export interface StandaloneFlightPlaybackOperation {
  readonly kind: "flight";
  readonly index: number;
  readonly focusHex: Axial | null;
  readonly focusKey: string | null;
  readonly flight: PreparedAirMissionFlight;
}

export interface StandaloneEventPlaybackOperation {
  readonly kind: "event";
  readonly index: number;
  readonly focusHex: Axial;
  readonly focusKey: string;
  readonly event: AirEngagementEvent;
}

export type AirPlaybackOperation =
  | LinkedStrikePlaybackOperation
  | StandaloneFlightPlaybackOperation
  | StandaloneEventPlaybackOperation;
