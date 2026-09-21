import type {
  BattleWarRoomInputSnapshot,
  BattleWarRoomMissionSnapshot,
  BattleRosterSnapshot,
  LogisticsSnapshot,
  SupplySnapshot
} from "../contracts/BattleWarRoomSnapshot";
import type { CampaignBridgeState, GameEngine } from "../game/GameEngine";

export interface BattleWarRoomProjectionInput {
  readonly engine: GameEngine;
  readonly roster: BattleRosterSnapshot;
  readonly logistics: LogisticsSnapshot | null;
  readonly playerSupply: SupplySnapshot | null;
  readonly mission: BattleWarRoomMissionSnapshot | null;
  readonly campaign: CampaignBridgeState | null;
}

/** Builds one detached War Room read model from the state-owned live authority. */
export function createBattleWarRoomInputSnapshot(
  input: BattleWarRoomProjectionInput
): BattleWarRoomInputSnapshot {
  const engine = input.engine;
  const campaignScenario = input.campaign?.scenario ?? null;
  return structuredClone({
    turn: engine.getTurnSummary(),
    roster: input.roster,
    reserves: engine.getReserveSnapshot().map((reserve) => ({
      allocationKey: reserve.allocationKey,
      unitType: reserve.unit.type
    })),
    mission: input.mission,
    logistics: input.logistics,
    playerSupply: input.playerSupply,
    enemyContacts: engine.getEnemyContactSnapshot(),
    reconnaissanceUnits: engine.playerUnits.map((unit) => ({ type: unit.type, hex: unit.hex })),
    combatReports: engine.getCombatReports(),
    airMissionReports: engine.getAirMissionReports(),
    campaign: input.campaign ? {
      committedSegment: input.campaign.battlePackage?.committedSegment ?? null,
      scenarioTitle: campaignScenario?.title ?? null,
      historicalCalendar: campaignScenario?.historicalCalendar ?? null
    } : null
  });
}
