import { CampaignMapRenderer } from "../rendering/CampaignMapRenderer";
import { CampaignScreen } from "../ui/screens/CampaignScreen";
import campaignScenarioData from "../data/campaign01.json";
import campaignMapImage from "../assets/campaign/Campaign Map -- Central Channel.png";
import type { CampaignScenarioData } from "../core/campaignTypes";
import type { IScreenManager } from "../contracts/IScreenManager";
import type { UIState } from "../state/UIState";
import type { TacticalBattleFlow } from "../contracts/TacticalBattleFlow";

export interface CampaignScreenBootstrapDependencies {
  readonly screenManager: IScreenManager;
  readonly uiState: UIState;
  readonly ensureTacticalBattleFlow: () => Promise<TacticalBattleFlow>;
}

function installCampaignBattleLaunch(
  campaignScreen: CampaignScreen,
  dependencies: CampaignScreenBootstrapDependencies
): void {
  const { screenManager, ensureTacticalBattleFlow } = dependencies;
  campaignScreen.setQueueEngagementHandler(() => {
    screenManager.beginTransition?.("Preparing the tactical engagement…");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void ensureTacticalBattleFlow()
          .then((tacticalBattleFlow) => tacticalBattleFlow.enterCampaignPrecombat())
          .catch((error) => {
            screenManager.endTransition?.();
            console.error("[CampaignBattleLaunch] Tactical handoff failed safely", error);
            campaignScreen.reportBattleLaunchFailure(error instanceof Error ? error.message : String(error));
          });
      });
    });
  });
}

/** Creates the strategic screen only when a route first needs the campaign feature set. */
export function initializeCampaignScreen(
  dependencies: CampaignScreenBootstrapDependencies
): CampaignScreen {
  const scenario = campaignScenarioData as unknown as CampaignScenarioData;
  const campaignScreen = new CampaignScreen(
    dependencies.screenManager,
    new CampaignMapRenderer(),
    scenario
  );
  campaignScreen.initialize();
  installCampaignBattleLaunch(campaignScreen, dependencies);
  campaignScreen.renderScenario({
    ...scenario,
    background: { ...scenario.background, imageUrl: campaignMapImage }
  });
  return campaignScreen;
}
