import type { BotDifficulty } from "../game/bot/BotPlanner";
import type { ActiveCampaignBattleSave } from "../game/battle/persistence/BattleSaveTypes";
import type { MissionKey } from "../state/UIState";

/** Narrow entry contract for the lazily constructed precombat and battle screens. */
export interface TacticalBattleFlow {
  /** Idempotently releases the complete lazily-created tactical runtime. */
  dispose(): void;
  enterPrecombat(missionKey: MissionKey, generalId: string | null, difficulty: BotDifficulty): void;
  enterCampaignPrecombat(): void;
  resumeActiveCampaignBattle(save: ActiveCampaignBattleSave): void;
}
