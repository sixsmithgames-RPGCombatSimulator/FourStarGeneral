import type { Axial } from "../core/Hex";
import type { EnemyContactSnapshot } from "../game/battle/BattleRuntimeContracts";
import type { BattlePhase, TurnFaction } from "../game/battle/BattleRuntimeTypes";
import type { CombatDamageSummary } from "../game/battle/combat/BattleAttackOutcomeProjection";
import type { MissionKey } from "../state/UIState";
import type {
  BattleRosterSnapshot,
  LogisticsSnapshot,
  SupplySnapshot
} from "./BattleSidebarEngine";

export type {
  BattleRosterSnapshot,
  LogisticsSnapshot,
  RosterUnitSummary,
  SupplyCategorySnapshot,
  SupplySnapshot
} from "./BattleSidebarEngine";

/** Mission briefing frozen when precombat commits the tactical engagement. */
export interface BattleWarRoomMissionSnapshot {
  readonly missionKey: MissionKey;
  readonly campaignTitle?: string;
  readonly title: string;
  readonly briefing: string;
  readonly objectives: readonly string[];
  readonly doctrine: string;
  readonly turnLimit: number | null;
  readonly baselineSupplies: ReadonlyArray<{ readonly label: string; readonly amount: string }>;
}

/** Minimal reserve identity needed by the War Room requisition board. */
export interface BattleWarRoomReserveSnapshot {
  readonly allocationKey?: string;
  readonly unitType: string;
}

/** Detached friendly reconnaissance position used only when no enemy contact exists. */
export interface BattleWarRoomReconUnitSnapshot {
  readonly type: string;
  readonly hex: Axial;
}

/** Ground-combat facts consumed by War Room narrative projections. */
export interface BattleWarRoomCombatReport {
  readonly timestamp: string;
  readonly attacker: {
    readonly faction: TurnFaction;
    readonly unitType: string;
    readonly position: Axial;
  };
  readonly defender: {
    readonly faction: TurnFaction;
    readonly unitType: string;
    readonly position: Axial;
    readonly strengthBefore: number;
    readonly strengthAfter: number;
    readonly destroyed: boolean;
  };
  readonly attackResult: {
    readonly damage: number;
    readonly statusSummary?: string;
    readonly personnel?: CombatDamageSummary["personnel"];
    readonly equipment?: CombatDamageSummary["equipment"];
  };
  readonly retaliation?: {
    readonly damage: number;
    readonly statusSummary?: string;
  };
}

/** Air-operation facts consumed by War Room narrative projections. */
export interface BattleWarRoomAirMissionReport {
  readonly timestamp: string;
  readonly unitType: string;
  readonly targetHex?: Axial;
  readonly event?: "resolved" | "refitStarted" | "refitCompleted";
  readonly outcome?: {
    readonly result: "success" | "partial" | "aborted" | "destroyed";
    readonly details: string;
  };
}

/** Campaign clock identity committed into the tactical engagement package. */
export interface BattleWarRoomCampaignSnapshot {
  readonly committedSegment: number | null;
  readonly scenarioTitle: string | null;
  readonly historicalCalendar: {
    readonly startDateIso: string;
    readonly operationDayOffset: number;
  } | null;
}

/**
 * Complete immutable input for one War Room render. BattleState is the only
 * producer; UI consumers never receive the live GameEngine or mutable units.
 */
export interface BattleWarRoomInputSnapshot {
  readonly turn: {
    readonly phase: BattlePhase;
    readonly activeFaction: TurnFaction;
    readonly turnNumber: number;
  };
  readonly roster: BattleRosterSnapshot;
  readonly reserves: readonly BattleWarRoomReserveSnapshot[];
  readonly mission: BattleWarRoomMissionSnapshot | null;
  readonly logistics: LogisticsSnapshot | null;
  readonly playerSupply: SupplySnapshot | null;
  readonly enemyContacts: readonly EnemyContactSnapshot[];
  readonly reconnaissanceUnits: readonly BattleWarRoomReconUnitSnapshot[];
  readonly combatReports: readonly BattleWarRoomCombatReport[];
  readonly airMissionReports: readonly BattleWarRoomAirMissionReport[];
  readonly campaign: BattleWarRoomCampaignSnapshot | null;
}
