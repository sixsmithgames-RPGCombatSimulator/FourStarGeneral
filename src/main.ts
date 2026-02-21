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
    hexMapRenderer = new HexMapRenderer();
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
  const campaignScreen = new CampaignScreen(screenManager, campaignRenderer);
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
    const generalId = uiState.selectedGeneralId;
    // Persist a bridge snapshot for downstream battle UI. Keep it defensive: missing state yields empty lists.
    const campaignState = ensureCampaignState();
    const bridge = {
      scenario: campaignState.getScenario(),
      turnState: campaignState.getTurnState(),
      queuedDecisions: campaignState.getQueuedDecisions(),
      pendingEngagements: campaignState.getPendingEngagements()
    } as const;
    battleState.setCampaignBridgeState(bridge);
    precombatScreen.setup("campaign", generalId);
    screenManager.showScreenById("precombat");
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
}

// Start the application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApplication);
} else {
  initializeApplication();
}

// Export for debugging and testing
export { initializeApplication };
