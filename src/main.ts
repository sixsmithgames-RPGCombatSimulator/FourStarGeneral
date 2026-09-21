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
import { UIState } from "./state/UIState";
import type { CampaignScreen } from "./ui/screens/CampaignScreen";
import { setMissionStartedUI } from "./ui/utils/missionUi";
import { installAirShowPlaybackCaptureDebugHook } from "./ui/airshow/AirShowPlaybackCapture";
import { installAirShowRuntimeTraceDebugHook } from "./ui/airshow/AirShowRuntimeTrace";
import type { ActiveCampaignBattleSave } from "./game/battle/persistence/BattleSaveTypes";
import { createRetryableTacticalBattleFlowLoader } from "./bootstrap/LazyTacticalBattleFlow";
import { resumeCampaignBattleWhenReady } from "./bootstrap/TacticalBattleResumeRouting";

/**
 * Application initialization and bootstrapping.
 */
function initializeApplication(): void {
  console.log("Four Star General - Initializing modular architecture...");

  // Initialize lightweight state and screen routing. Tactical state is created on first use.
  const uiState = new UIState();

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

  // Initialize the landing screen; campaign and tactical screens own lazy lifecycle boundaries.
  const landingScreen = new LandingScreen(screenManager, uiState);
  const ensureTacticalBattleFlow = createRetryableTacticalBattleFlowLoader(() =>
    import("./bootstrap/TacticalBattleFlowBootstrap")
      .then(({ initializeTacticalBattleFlow }) => initializeTacticalBattleFlow({ screenManager, uiState }))
  );
  landingScreen.attachTacticalBattleFlowLoader(ensureTacticalBattleFlow);
  let campaignScreenPromise: Promise<CampaignScreen> | null = null;
  const ensureCampaignScreen = (): Promise<CampaignScreen> => {
    if (!campaignScreenPromise) {
      campaignScreenPromise = import("./bootstrap/CampaignScreenBootstrap")
        .then(({ initializeCampaignScreen }) => initializeCampaignScreen({
          screenManager,
          uiState,
          ensureTacticalBattleFlow
        }))
        .then((campaignScreen) => {
          landingScreen.attachCampaignScreen(campaignScreen);
          return campaignScreen;
        })
        .catch((error) => {
          campaignScreenPromise = null;
          throw error;
        });
    }
    return campaignScreenPromise;
  };
  landingScreen.attachCampaignScreenLoader(ensureCampaignScreen);
  landingScreen.initialize();
  document.addEventListener("campaign:battle:resume", (event: Event) => {
    const save = (event as CustomEvent<{ save?: ActiveCampaignBattleSave }>).detail?.save;
    if (!save) return;
    void resumeCampaignBattleWhenReady(save, ensureTacticalBattleFlow, screenManager);
  });

  // Preserve the public entry's campaign intent after all normal command and
  // entitlement controls initialize. CampaignScreen retains its access gate.
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const markApplicationReady = (): void => {
    const bootStatus = document.getElementById("appBootStatus");
    if (bootStatus) {
      bootStatus.dataset.ready = "true";
      bootStatus.setAttribute("aria-label", "Command systems ready");
      bootStatus.remove();
    }
  };
  if (searchParams?.get("mode") === "campaign" && campaignScreenElement) {
    uiState.selectedMission = "campaign";
    void ensureCampaignScreen()
      .then(() => screenManager.showScreenById("campaign"))
      .catch((error) => {
        console.error("[CampaignRoute] Direct campaign entry failed safely", error);
        if (landingScreenElement) screenManager.showScreen(landingScreenElement);
      })
      .finally(markApplicationReady);
  } else if (landingScreenElement) {
    screenManager.showScreen(landingScreenElement);
    markApplicationReady();
  } else {
    markApplicationReady();
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

  const codexTest = searchParams?.get("codex-test");
  if (codexTest === "airshow" || codexTest === "airshow-large" || codexTest === "airshow-replay" || codexTest === "airshow-tutorial") {
    void ensureTacticalBattleFlow()
      .then(() => import("./testing/airshowE2eHarness"))
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
