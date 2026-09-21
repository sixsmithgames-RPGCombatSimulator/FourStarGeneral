import type { IScreenManager } from "../contracts/IScreenManager";
import type { TacticalBattleFlow } from "../contracts/TacticalBattleFlow";
import type { ActiveCampaignBattleSave } from "../game/battle/persistence/BattleSaveTypes";

/** Restores a saved engagement only after the tactical runtime is fully initialized. */
export async function resumeCampaignBattleWhenReady(
  save: ActiveCampaignBattleSave,
  ensureTacticalBattleFlow: () => Promise<TacticalBattleFlow>,
  screenManager: IScreenManager
): Promise<void> {
  screenManager.beginTransition?.("Restoring the tactical engagement…");
  try {
    const tacticalBattleFlow = await ensureTacticalBattleFlow();
    tacticalBattleFlow.resumeActiveCampaignBattle(save);
  } catch (error) {
    screenManager.endTransition?.();
    console.error("[CampaignBattleResume] Tactical hydration failed safely", error);
    document.dispatchEvent(new CustomEvent("campaign:battle:resume-failed", {
      detail: { message: error instanceof Error ? error.message : String(error) }
    }));
  }
}
