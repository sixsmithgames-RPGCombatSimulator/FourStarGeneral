/**
 * Four Star General - Main Application Entry Point
 *
 * This file orchestrates the modular application architecture.
 * The previous 883-line main.ts has been refactored into focused modules:
 *
 * - State Management: src/state/ (UIState, BattleState, DeploymentState)
 * - Screen Management: src/ui/screens/ (LandingScreen, PrecombatScreen, BattleScreen)
 * - UI Components: src/ui/components/ (PopupManager, WarRoomOverlay, etc.)
 * - Map Controls: src/ui/controls/ (MapViewport, ZoomPanControls)
 * - Rendering: src/rendering/ (HexMapRenderer, TerrainRenderer, etc.)
 *
 * For implementation details, see the modularization plan document.
 */

import { ScreenManager } from "./ui/screens/ScreenManager";
import { LandingScreen } from "./ui/screens/LandingScreen";
import { PrecombatScreen } from "./ui/screens/PrecombatScreen";
import { BattleScreen } from "./ui/screens/BattleScreen";
import { UIState } from "./state/UIState";
import { CampaignScreen } from "./ui/screens/CampaignScreen";
import { CampaignMapRenderer } from "./rendering/CampaignMapRenderer";
import type { CampaignScenarioData } from "./core/campaignTypes";
import campaignScenarioData from "./data/campaign01.json";
import soundCatalogData from "./data/soundCatalog.json";
import type { SoundCatalog } from "./audio/SoundAssetMetadata";
import campaignMapImage from "./assets/campaign/Campaign Map -- Central Channel.png";
import { ensureCampaignState } from "./state/CampaignState";
import { ensureBattleState } from "./state/BattleState";
import { PopupManager } from "./ui/components/PopupManager";
import { WarRoomOverlay } from "./ui/components/WarRoomOverlay";
import { DeploymentPanel } from "./ui/components/DeploymentPanel";
import { BattleActivityLog } from "./ui/announcements/BattleActivityLog";
import { SidebarButtons } from "./ui/components/SidebarButtons";
import { MapViewport } from "./ui/controls/MapViewport";
import { ZoomPanControls } from "./ui/controls/ZoomPanControls";
import { HexMapRenderer } from "./rendering/HexMapRenderer";
import { BattleWarRoomDataProvider } from "./ui/components/BattleWarRoomDataProvider";
import { ensureTutorialOverlay } from "./ui/components/TutorialOverlay";
import { setMissionStartedUI } from "./ui/utils/missionUi";
import { installAirShowPlaybackCaptureDebugHook } from "./ui/airshow/AirShowPlaybackCapture";
import { installAirShowRuntimeTraceDebugHook } from "./ui/airshow/AirShowRuntimeTrace";
import type { ActiveCampaignBattleSave } from "./game/battle/persistence/BattleSaveTypes";

/**
 * Application initialization and bootstrapping.
 */
function initializeApplication(): void {
  console.log("Four Star General - Initializing modular architecture...");

  // Initialize state management
  const uiState = new UIState();
  const battleState = ensureBattleState();

  // Initialize screen management
  const screenManager = new ScreenManager();

  // Register screens
  const landingScreenElement = document.getElementById("landingScreen");
  const precombatScreenElement = document.getElementById("precombatScreen");
  const battleScreenElement = document.getElementById("battleScreen");
  const campaignScreenElement = document.getElementById("campaignScreen");

  if (landingScreenElement) {
    screenManager.registerScreen("landing", landingScreenElement);
  }
  if (precombatScreenElement) {
    screenManager.registerScreen("precombat", precombatScreenElement);
  }
  if (battleScreenElement) {
    screenManager.registerScreen("battle", battleScreenElement);
  }
  if (campaignScreenElement) {
    screenManager.registerScreen("campaign", campaignScreenElement);
  }

  // Initialize UI components
  // Create the War Room overlay first so PopupManager can control it directly.
  const warRoomDataProvider = new BattleWarRoomDataProvider(battleState);
  const warRoomOverlay = new WarRoomOverlay({ dataProvider: warRoomDataProvider });
  const popupManager = new PopupManager(warRoomOverlay);
  const sidebarButtons = new SidebarButtons();
  sidebarButtons.bindEvents(popupManager);

  // Initialize map viewport and controls (if battle map exists)
  let mapViewport: MapViewport | null = null;
  let zoomPanControls: ZoomPanControls | null = null;
  let hexMapRenderer: HexMapRenderer | null = null;

  const battleMapElement = document.querySelector("#battleHexMap");
  if (battleMapElement) {
    mapViewport = new MapViewport();
    zoomPanControls = new ZoomPanControls(mapViewport);
    hexMapRenderer = new HexMapRenderer({
      effects: "data/effectSpecs.json",
      terrainTints: "data/terrainTints.json",
      sounds: soundCatalogData as unknown as SoundCatalog
    });
    console.log("Map rendering system initialized");
  }

    // Initialize battle-specific components
  // The battle loadout UI has been commented out in the markup, so we pass `null`
  // to keep BattleScreen from requesting DOM hooks that no longer exist until the
  // refreshed layout is ready.
  const battleLoadout = null;
  const reservePresenter = null;
  const deploymentPanel = new DeploymentPanel();
  const battleActivityLog = new BattleActivityLog();

  // Initialize screens
  const landingScreen = new LandingScreen(screenManager, uiState);
  const precombatScreen = new PrecombatScreen(screenManager, battleState);
  const campaignRenderer = new CampaignMapRenderer();
  const campaignScreen = new CampaignScreen(
    screenManager,
    campaignRenderer,
    campaignScenarioData as unknown as CampaignScenarioData
  );
  const battleScreen = new BattleScreen(
    screenManager,
    battleState,
    popupManager,
    hexMapRenderer,
    deploymentPanel,
    battleLoadout,
    reservePresenter,
    mapViewport,
    zoomPanControls,
    battleActivityLog,
    uiState
  );

  landingScreen.attachPrecombatScreen(precombatScreen);
  landingScreen.attachCampaignScreen(campaignScreen);
  landingScreen.initialize();
  precombatScreen.initialize();
  campaignScreen.initialize();
  // When an engagement is queued on the campaign map, proceed to precombat flow using the campaign mission.
  campaignScreen.setQueueEngagementHandler(() => {
    screenManager.beginTransition("Preparing the tactical engagement…");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const generalId = uiState.selectedGeneralId;
          // Persist a bridge snapshot for downstream battle UI. Keep it defensive: missing state yields empty lists.
          const campaignState = ensureCampaignState();
          const bridge = {
            scenario: campaignState.getScenario(),
            turnState: campaignState.getTurnState(),
            queuedDecisions: campaignState.getQueuedDecisions(),
            pendingEngagements: campaignState.getPendingEngagements(),
            battlePackage: campaignState.getActiveCampaignBattlePackage()
          } as const;
          battleState.setCampaignBridgeState(bridge);
          // CampaignScreen bypasses LandingScreen, so promote the campaign mission explicitly before
          // precombat. BattleScreen and mission-specific tactical services consume this shared key.
          uiState.selectedMission = "campaign";
          // Mark this mission as started from campaign screen
          uiState.isFromCampaign = true;
          precombatScreen.setup("campaign", generalId, uiState.selectedDifficulty);
          screenManager.showScreenById("precombat");
        } catch (error) {
          screenManager.endTransition();
          console.error("[CampaignBattleLaunch] Tactical handoff failed safely", error);
          campaignScreen.reportBattleLaunchFailure(error instanceof Error ? error.message : String(error));
        }
      });
    });
  });
  // Render the campaign scenario immediately so entering the Campaign screen shows the map.
  // Patch the background image URL since JSON files can't use new URL() for asset bundling
  const patchedCampaignData: CampaignScenarioData = {
    ...(campaignScenarioData as any),
    background: {
      ...(campaignScenarioData as any).background,
      imageUrl: campaignMapImage
    }
  };
  campaignScreen.renderScenario(patchedCampaignData);
  battleScreen.initialize();
  document.addEventListener("campaign:battle:resume", (event: Event) => {
    const save = (event as CustomEvent<{ save?: ActiveCampaignBattleSave }>).detail?.save;
    if (!save) return;
    try {
      battleScreen.resumeActiveCampaignBattle(save);
      screenManager.showScreenById("battle");
    } catch (error) {
      console.error("[CampaignBattleResume] Tactical hydration failed safely", error);
      document.dispatchEvent(new CustomEvent("campaign:battle:resume-failed", {
        detail: { message: error instanceof Error ? error.message : String(error) }
      }));
    }
  });

  // Initialize tutorial overlay system
  const tutorialOverlay = ensureTutorialOverlay();
  tutorialOverlay.initialize();
  console.log("Tutorial system initialized");

  // Show landing screen initially
  if (landingScreenElement) {
    screenManager.showScreen(landingScreenElement);
  }

  console.log("Application initialized successfully");
  console.log("Module architecture:");
  console.log("  - State: UIState, BattleState, DeploymentState");
  console.log("  - Screens: LandingScreen, PrecombatScreen, BattleScreen");
  console.log("  - Components: PopupManager, WarRoomOverlay, BattleLoadout, DeploymentPanel");
  console.log("  - Controls: MapViewport, ZoomPanControls");
  console.log("  - Rendering: HexMapRenderer, TerrainRenderer, RoadOverlayRenderer, CoordinateSystem");

  if (typeof window !== "undefined") {
    installAirShowPlaybackCaptureDebugHook(window);
    installAirShowRuntimeTraceDebugHook(window);
  }

  const bootStatus = document.getElementById("appBootStatus");
  if (bootStatus) {
    bootStatus.dataset.ready = "true";
    bootStatus.setAttribute("aria-label", "Command systems ready");
    bootStatus.remove();
  }

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const codexTest = searchParams?.get("codex-test");
  if (codexTest === "airshow" || codexTest === "airshow-large" || codexTest === "airshow-replay" || codexTest === "airshow-tutorial") {
    void import("./testing/airshowE2eHarness")
      .then(({ installAirshowE2EHarness, installAirshowE2EHarnessLarge, installAirshowPlaybackReplayE2EHarness, installTutorialStrikeAirshowE2EHarness }) => {
        if (codexTest === "airshow-large") {
          installAirshowE2EHarnessLarge();
        } else if (codexTest === "airshow-replay") {
          installAirshowPlaybackReplayE2EHarness();
        } else if (codexTest === "airshow-tutorial") {
          installTutorialStrikeAirshowE2EHarness();
        } else {
          installAirshowE2EHarness();
        }
      })
      .catch((error) => {
        console.error("[AirshowE2E] Failed to install browser harness", error);
      });
  }
}

// Start the application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApplication);
} else {
  initializeApplication();
}

// Export for debugging and testing
export { initializeApplication, setMissionStartedUI };
