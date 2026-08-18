import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";

registerTest("BATTLESCREEN_CAMPAIGN_PRECOMBAT_MISSION_CONTROLS_TACTICAL_HANDOFF", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let refreshedMissionKey: string | null = null;
  let engineResetCount = 0;
  const uiState = {
    selectedMission: "training",
    selectedDifficulty: "Normal",
    isFromCampaign: false
  } as any;

  await Given("campaign precombat is committed while shared UI state still carries the default training mission", async () => {
    document.body.innerHTML = "<div id=\"battleScreen\"></div>";
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).uiState = uiState;
    (screen as any).battleState = {
      getPrecombatMissionInfo() {
        return {
          missionKey: "campaign",
          title: "Port Assault",
          briefing: "Break the defended port line.",
          objectives: [],
          doctrine: "Concentrate combat power.",
          turnLimit: 12,
          baselineSupplies: []
        };
      },
      resetEngineState() {
        engineResetCount += 1;
      }
    };
    (screen as any).scenario = { name: "Coastal Push" };
    (screen as any).activeMissionSessionKey = "training:Normal:Coastal Push";
    (screen as any).refreshScenario = () => {
      refreshedMissionKey = uiState.selectedMission;
      (screen as any).scenario = { name: "Port Assault — Hex 28,38" };
    };
    (screen as any).resetMissionDerivedUiState = () => {};
    (screen as any).hydrateMissionBriefing = () => {};
    (screen as any).initializeBattleMap = () => {
      (screen as any).activeMissionSessionKey = (screen as any).getMissionSessionKey();
    };
    (screen as any).prepareBattleState = () => ({});
    (screen as any).initializeDeploymentMirrors = () => {};
    (screen as any).syncTurnContext = () => {};
    (screen as any).renderMissionStatus = () => {};
    (screen as any).selectionIntelOverlay = { update() {} };
    (screen as any).activityEvents = [];
    (screen as any).battleActivityLog = null;
  });

  await When("the battle screen receives its activation event", async () => {
    (screen as any).handleScreenShown(new CustomEvent("screen:shown", { detail: { id: "battle" } }));
  });

  await Then("the exact campaign mission replaces training before the tactical scenario is refreshed", async () => {
    if (refreshedMissionKey !== "campaign") {
      throw new Error(`Expected campaign to be authoritative before scenario refresh, received ${refreshedMissionKey ?? "<none>"}.`);
    }
    if (uiState.selectedMission !== "campaign" || uiState.isFromCampaign !== true) {
      throw new Error(`Expected synchronized campaign UI context, received ${JSON.stringify(uiState)}.`);
    }
    if ((screen as any).activeMissionSessionKey !== "campaign:Normal:Port Assault — Hex 28,38") {
      throw new Error(`Expected campaign tactical session key, received ${(screen as any).activeMissionSessionKey}.`);
    }
    if (engineResetCount !== 1) {
      throw new Error(`Expected stale training engine to reset once, received ${engineResetCount}.`);
    }
  });
});
