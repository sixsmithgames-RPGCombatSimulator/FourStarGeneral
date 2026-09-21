import { ensureBattleState } from "../state/BattleState";
import { ensureCampaignState } from "../state/CampaignState";
import { PrecombatScreen } from "../ui/screens/PrecombatScreen";
import { BattleScreen } from "../ui/screens/BattleScreen";
import { PopupManager } from "../ui/components/PopupManager";
import { WarRoomOverlay } from "../ui/components/WarRoomOverlay";
import { DeploymentPanel } from "../ui/components/DeploymentPanel";
import { SidebarButtons } from "../ui/components/SidebarButtons";
import { BattleWarRoomDataProvider } from "../ui/components/BattleWarRoomDataProvider";
import { BattleActivityLog } from "../ui/announcements/BattleActivityLog";
import { MapViewport } from "../ui/controls/MapViewport";
import { ZoomPanControls } from "../ui/controls/ZoomPanControls";
import { HexMapRenderer } from "../rendering/HexMapRenderer";
import { ensureTutorialOverlay } from "../ui/components/TutorialOverlay";
import soundCatalogData from "../data/soundCatalog.json";
import type { SoundCatalog } from "../audio/SoundAssetMetadata";
import type { IScreenManager } from "../contracts/IScreenManager";
import type { TacticalBattleFlow } from "../contracts/TacticalBattleFlow";
import type { UIState } from "../state/UIState";

export interface TacticalBattleFlowBootstrapDependencies {
  readonly screenManager: IScreenManager;
  readonly uiState: UIState;
}

/** Constructs the complete tactical lifecycle once, immediately before its first use. */
export function initializeTacticalBattleFlow(
  dependencies: TacticalBattleFlowBootstrapDependencies
): TacticalBattleFlow {
  const { screenManager, uiState } = dependencies;
  const cleanupStack: Array<() => void> = [];
  let disposed = false;
  const own = <T extends { dispose(): void }>(resource: T): T => {
    cleanupStack.push(() => resource.dispose());
    return resource;
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanupStack.splice(0).reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error("[TacticalBattleFlowBootstrap] Cleanup failed", error);
      }
    }
  };

  try {
    const battleState = ensureBattleState();
    const dataProvider = own(new BattleWarRoomDataProvider(battleState));
    const warRoomOverlay = own(new WarRoomOverlay({ dataProvider }));
    const popupManager = own(new PopupManager(warRoomOverlay));
    const sidebarButtons = own(new SidebarButtons());
    sidebarButtons.bindEvents(popupManager);

    let mapViewport: MapViewport | null = null;
    let zoomPanControls: ZoomPanControls | null = null;
    let hexMapRenderer: HexMapRenderer | null = null;
    if (document.querySelector("#battleHexMap")) {
      mapViewport = own(new MapViewport());
      zoomPanControls = own(new ZoomPanControls(mapViewport));
      hexMapRenderer = new HexMapRenderer({
        effects: "data/effectSpecs.json",
        terrainTints: "data/terrainTints.json",
        sounds: soundCatalogData as unknown as SoundCatalog
      });
      console.log("Map rendering system initialized");
    }

    const precombatScreen = own(new PrecombatScreen(screenManager, battleState));
    const deploymentPanel = own(new DeploymentPanel());
    const battleActivityLog = own(new BattleActivityLog());
    const battleScreen = own(new BattleScreen(
      screenManager,
      battleState,
      popupManager,
      hexMapRenderer,
      deploymentPanel,
      null,
      null,
      mapViewport,
      zoomPanControls,
      battleActivityLog,
      uiState
    ));
    precombatScreen.initialize();
    battleScreen.initialize();
    const tutorialOverlay = own(ensureTutorialOverlay());
    tutorialOverlay.initialize();
    console.log("Tutorial system initialized");

    return {
      dispose,
      enterPrecombat(missionKey, generalId, difficulty): void {
        precombatScreen.setup(missionKey, generalId, difficulty);
        screenManager.showScreenById("precombat");
      },
      enterCampaignPrecombat(): void {
        const campaignState = ensureCampaignState();
        battleState.setCampaignBridgeState({
          scenario: campaignState.getScenario(),
          turnState: campaignState.getTurnState(),
          queuedDecisions: campaignState.getQueuedDecisions(),
          pendingEngagements: campaignState.getPendingEngagements(),
          battlePackage: campaignState.getActiveCampaignBattlePackage()
        });
        uiState.selectedMission = "campaign";
        uiState.isFromCampaign = true;
        precombatScreen.setup("campaign", uiState.selectedGeneralId, uiState.selectedDifficulty);
        screenManager.showScreenById("precombat");
      },
      resumeActiveCampaignBattle(save): void {
        battleScreen.resumeActiveCampaignBattle(save);
        screenManager.showScreenById("battle");
      }
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
