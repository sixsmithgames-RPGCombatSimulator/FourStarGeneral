import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { ensureCampaignState } from "../src/state/CampaignState";
import {
  commitFixture,
  missionStatus,
  tacticalStateFixture
} from "./CampaignBattleResultExtraction.test.js";

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

registerTest("BATTLESCREEN_CAMPAIGN_TITLE_STAYS_DISTINCT_FROM_ENGAGEMENT_TITLE", async ({ Given, When, Then }) => {
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  const campaignTitle = document.createElement("span");
  const missionTitle = document.createElement("span");

  await Given("campaign precombat has separate theater and engagement identities", () => {
    (screen as any).campaignTitleElement = campaignTitle;
    (screen as any).missionTitleElement = missionTitle;
    (screen as any).missionBriefingElement = null;
    (screen as any).missionObjectivesList = null;
    (screen as any).missionDoctrineElement = null;
    (screen as any).missionTurnLimitElement = null;
    (screen as any).missionSuppliesList = null;
    (screen as any).scenario = { name: "Port Assault — Hex 28,38" };
    (screen as any).battleState = {
      getPrecombatMissionInfo() {
        return {
          missionKey: "campaign",
          campaignTitle: "Operation Overlord - Central Channel Sector",
          title: "Port Assault — Hex 28,38",
          briefing: "Secure the port.",
          objectives: [],
          doctrine: "Concentrate combat power.",
          turnLimit: null,
          baselineSupplies: []
        };
      }
    };
  });

  await When("the tactical header hydrates from the campaign mission", () => {
    (screen as any).hydrateMissionBriefing(false);
  });

  await Then("the parent campaign and child tactical engagement remain visible as separate labels", () => {
    if (campaignTitle.textContent !== "Operation Overlord - Central Channel Sector"
      || missionTitle.textContent !== "Port Assault — Hex 28,38"
      || campaignTitle.textContent.includes(missionTitle.textContent)) {
      throw new Error("Campaign and tactical engagement titles collapsed or drifted during handoff.");
    }
  });
});

registerTest("BATTLESCREEN_FAILED_CAMPAIGN_RESULT_HANDOFF_RETRIES_WITHOUT_EXITING", async ({ Given, When, Then }) => {
  const campaign = ensureCampaignState();
  const committed = commitFixture();
  const tacticalState = tacticalStateFixture(committed.runtime, committed.pkg);
  const originalGetScenario = campaign.getScenario;
  const originalGetActiveCampaignBattlePackage = campaign.getActiveCampaignBattlePackage;
  const originalApplyCampaignBattleResult = campaign.applyCampaignBattleResult;
  const originalGetCampaignBattleResultPackage = campaign.getCampaignBattleResultPackage;
  const originalSavePostBattleAutosave = campaign.savePostBattleAutosave;
  const priorHeadquartersStatus = campaign.getHeadquartersStatusMessage();
  let screen: BattleScreen;
  let applicationAttempts = 0;
  let autosaveAttempts = 0;
  let serviceRecordWrites = 0;
  let retryModalCount = 0;
  let firstAttemptStayedInBattle = false;
  let firstAttemptKeptMissionUiActive = false;
  let firstAttemptServiceRecordWrites = -1;
  let firstAttemptMessage = "";
  const announcedMessages: string[] = [];
  const shownScreens: string[] = [];

  await Given("a completed campaign battle whose first strategic result application fails", () => {
    document.body.innerHTML = `
      <div id="battleScreen"></div>
      <button id="beginBattle" class="hidden" type="button">Begin Battle</button>
      <button id="endMissionButton" type="button">End Mission</button>
    `;
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).uiState = {
      selectedMission: "campaign",
      selectedDifficulty: "Normal",
      isFromCampaign: true
    };
    (screen as any).scenario = {
      name: "Line Assault — Hex 1,0",
      sides: { Player: { units: tacticalState.playerPlacements } }
    };
    (screen as any).missionStatus = structuredClone(missionStatus);
    (screen as any).battleState = {
      getSupplyHistory() {
        return [];
      },
      getSupplySnapshot() {
        return { stockpile: { ammo: 0, fuel: 0 } };
      },
      tryGetGameEngine() {
        return { serialize: () => structuredClone(tacticalState) };
      },
      getAssignedCommanderId() {
        return null;
      }
    };
    (screen as any).screenManager = {
      showScreenById(screenId: string) {
        shownScreens.push(screenId);
      }
    };
    (screen as any).confirmMissionEndRequest = async () => true;
    (screen as any).resolveMissionEndResolution = () => ({
      success: true,
      objectivesCompleted: 1,
      objectivesFailed: 0,
      objectivesContested: 0,
      casualties: 0,
      reason: "The engagement objective is secure.",
      headquartersTitle: "Mission completed successfully.",
      headquartersAction: "Review the after-action report."
    });
    (screen as any).showMissionEndModal = () => {
      retryModalCount += 1;
    };
    (screen as any).announceBattleUpdate = (message: string) => {
      announcedMessages.push(message);
    };
    (screen as any).updateGeneralServiceRecord = () => {
      serviceRecordWrites += 1;
    };
    (screen as any).tacticalSessionStartedAt = Date.now();
    (screen as any).selectedHexKey = null;
    (screen as any).mapViewport = null;
    (screen as any).battleAnnouncements = null;
    (screen as any).baseCampStatus = null;

    (campaign as any).getScenario = () => ({ key: committed.pkg.scenarioKey });
    (campaign as any).getActiveCampaignBattlePackage = () => structuredClone(committed.pkg);
    (campaign as any).applyCampaignBattleResult = () => {
      applicationAttempts += 1;
      if (applicationAttempts === 1) {
        throw new Error("Simulated campaign transaction failure.");
      }
      return { applied: true, duplicate: false, resolutionId: "retry-resolution" };
    };
    (campaign as any).getCampaignBattleResultPackage = () => null;
    (campaign as any).savePostBattleAutosave = async () => {
      autosaveAttempts += 1;
      return {};
    };
  });

  await When("the commander retries End Mission after the failed handoff", async () => {
    try {
      await (screen as any).handleEndMission();
      firstAttemptStayedInBattle = shownScreens.length === 0;
      firstAttemptKeptMissionUiActive = document.getElementById("beginBattle")?.classList.contains("hidden") === true
        && document.getElementById("endMissionButton")?.classList.contains("hidden") === false;
      firstAttemptServiceRecordWrites = serviceRecordWrites;
      firstAttemptMessage = announcedMessages[announcedMessages.length - 1] ?? "";
      await (screen as any).handleEndMission();
    } finally {
      (campaign as any).getScenario = originalGetScenario;
      (campaign as any).getActiveCampaignBattlePackage = originalGetActiveCampaignBattlePackage;
      (campaign as any).applyCampaignBattleResult = originalApplyCampaignBattleResult;
      (campaign as any).getCampaignBattleResultPackage = originalGetCampaignBattleResultPackage;
      (campaign as any).savePostBattleAutosave = originalSavePostBattleAutosave;
      campaign.setHeadquartersStatusMessage(priorHeadquartersStatus);
    }
  });

  await Then("the failed attempt preserves tactical recovery and the successful retry records exactly once", () => {
    if (!firstAttemptStayedInBattle || !firstAttemptKeptMissionUiActive) {
      throw new Error("Failed campaign handoff exited or deactivated the tactical battle.");
    }
    if (firstAttemptServiceRecordWrites !== 0 || retryModalCount !== 1
      || !firstAttemptMessage.includes("battle remains open for a safe retry")) {
      throw new Error("Failed campaign handoff did not expose one safe retry without recording service history.");
    }
    if (applicationAttempts !== 2 || autosaveAttempts !== 1 || serviceRecordWrites !== 1
      || shownScreens.length !== 1 || shownScreens[0] !== "campaign") {
      throw new Error("Successful campaign handoff retry did not record and navigate exactly once.");
    }
    if (document.getElementById("beginBattle")?.classList.contains("hidden") === true
      || document.getElementById("endMissionButton")?.classList.contains("hidden") !== true) {
      throw new Error("Successful campaign handoff retry did not close the tactical mission UI.");
    }
  });
});
