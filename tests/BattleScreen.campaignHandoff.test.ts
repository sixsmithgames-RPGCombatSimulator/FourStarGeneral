import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { BattleState } from "../src/state/BattleState";
import { ensureCampaignState } from "../src/state/CampaignState";
import { buildCompleteActiveBattleSave } from "./TacticalSaveCompleteness.test.js";
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
          title: "Port Assault — Hex 28,38",
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

registerTest("BATTLESCREEN_COLD_TACTICAL_RESUME_PRESERVES_THE_HYDRATED_CAMPAIGN_SCENARIO", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let refreshCount = 0;
  let resetCount = 0;
  let defaultSelectionCount = 0;

  await Given("a cold-start battle screen already hydrated from a campaign checkpoint", async () => {
    document.body.innerHTML = "<div id=\"battleScreen\"></div>";
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).uiState = {
      selectedMission: "campaign",
      selectedDifficulty: "Normal",
      isFromCampaign: true
    };
    (screen as any).scenario = { name: "Fortified Assault — Hex 29,23" };
    (screen as any).activeMissionSessionKey = "campaign:Normal:Fortified Assault — Hex 29,23";
    (screen as any).battleState = {
      getPrecombatMissionInfo: () => ({
        missionKey: "campaign",
        title: "Fortified Assault — Hex 29,23"
      }),
      resetEngineState: () => {
        resetCount += 1;
      }
    };
    (screen as any).refreshScenario = () => {
      refreshCount += 1;
      (screen as any).scenario = { name: "Coastal Push" };
    };
    (screen as any).hexMapRenderer = null;
    (screen as any).primeDeploymentState = () => {};
    (screen as any).refreshDeploymentMirrors = () => {};
    (screen as any).ensureDefaultSelection = () => {
      defaultSelectionCount += 1;
    };
  });

  await When("the screen manager reveals the restored battle", async () => {
    (screen as any).handleScreenShown(new CustomEvent("screen:shown", { detail: { id: "battle" } }));
    (screen as any).initializeBattleMap(true);
    (screen as any).initializeDeploymentMirrors(true);
  });

  await Then("screen activation keeps the restored engagement instead of reseeding the default battle", async () => {
    if (refreshCount !== 0 || resetCount !== 0 || defaultSelectionCount !== 0
      || (screen as any).scenario.name !== "Fortified Assault — Hex 29,23") {
      throw new Error(
        `Cold resume was clobbered: refresh=${refreshCount}, reset=${resetCount}, defaultSelection=${defaultSelectionCount}, scenario=${(screen as any).scenario.name}.`
      );
    }
  });
});

registerTest("BATTLESCREEN_COLD_TACTICAL_RESUME_REHYDRATES_CAMPAIGN_PRESENTATION", async ({ Given, When, Then }) => {
  const campaign = ensureCampaignState();
  const originalGetRuntimeSnapshot = campaign.getRuntimeSnapshot;
  const binding = {
    campaignId: "cold-resume-campaign",
    campaignRevision: 12,
    scenarioKey: "central_channel",
    engagementId: "cold-resume-engagement"
  };
  const save = buildCompleteActiveBattleSave(binding);
  let screen: BattleScreen;
  let preserveHydratedScenario: boolean | null = null;
  let preserveHydratedSelection: boolean | null = null;
  let restoredSelectionKey: string | null = null;
  let activityLogCollapsed: boolean | null = null;
  let resumeError: unknown = null;
  let campaignTitle: HTMLElement;
  let missionTitle: HTMLElement;

  await Given("a fresh battle screen and a verified campaign-bound tactical checkpoint", async () => {
    document.body.innerHTML = `
      <div id="battleScreen">
        <span id="battleCampaignTitle">Operation</span>
        <span id="battleMissionTitle">Coastal Push</span>
      </div>
    `;
    campaignTitle = document.getElementById("battleCampaignTitle") as HTMLElement;
    missionTitle = document.getElementById("battleMissionTitle") as HTMLElement;
    (campaign as any).getRuntimeSnapshot = () => ({
      campaignId: binding.campaignId,
      revision: binding.campaignRevision,
      scenarioKey: binding.scenarioKey,
      activeEngagementId: binding.engagementId
    });

    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).element = document.getElementById("battleScreen");
    (screen as any).uiState = {
      selectedMission: "training",
      selectedDifficulty: "Normal",
      isFromCampaign: false
    };
    (screen as any).battleState = new BattleState();
    (screen as any).scenario = { name: "Coastal Push", objectives: [] };
    (screen as any).campaignTitleElement = campaignTitle;
    (screen as any).missionTitleElement = missionTitle;
    (screen as any).missionBriefingElement = null;
    (screen as any).missionObjectivesList = null;
    (screen as any).missionDoctrineElement = null;
    (screen as any).missionTurnLimitElement = null;
    (screen as any).missionSuppliesList = null;
    (screen as any).objectiveHexKeys = new Set<string>();
    (screen as any).activityEvents = [];
    (screen as any).initiativeSkippedUnitIds = new Set<string>();
    (screen as any).popupManager = { openPopup() {} };
    (screen as any).battleActivityLog = {
      sync() {},
      setCollapsed(collapsed: boolean) {
        activityLogCollapsed = collapsed;
      }
    };
    (screen as any).mapViewport = null;
    (screen as any).resetMissionDerivedUiState = () => {};
    (screen as any).calculateMissionStatusFromEngine = () => null;
    (screen as any).renderBattleObjectiveSummary = () => {};
    (screen as any).teardownInitiativeSystemUi = () => {};
    (screen as any).applyBattleAnimationMode = () => {};
    (screen as any).initializeBattleMap = (preserve: boolean) => {
      preserveHydratedScenario = preserve;
    };
    (screen as any).initializeDeploymentMirrors = (preserve: boolean) => {
      preserveHydratedSelection = preserve;
    };
    (screen as any).restoreBattlePhasePresentationAfterResume = () => {};
    (screen as any).syncTurnContext = () => {};
    (screen as any).renderMissionStatus = () => {};
    (screen as any).restoreInitiativeTurnControlsAfterResume = () => {};
    (screen as any).requestTacticalTurnStartAutosave = async () => {};
    (screen as any).syncQueuedTargetMarkers = () => {};
    (screen as any).applySelectedHex = (hexKey: string) => {
      restoredSelectionKey = hexKey;
    };
    (screen as any).expandBattleIntelOverlayIfCollapsed = () => {};
    (screen as any).highlightCurrentInitiativeGroup = () => {};
    (screen as any).syncLegacyEndTurnButton = () => {};
  });

  await When("the checkpoint hydrates before the tactical map is reconstructed", async () => {
    try {
      screen.resumeActiveCampaignBattle(save);
      (screen as any).handleScreenShown(new CustomEvent("screen:shown", { detail: { id: "battle" } }));
    } catch (error) {
      resumeError = error;
    } finally {
      (campaign as any).getRuntimeSnapshot = originalGetRuntimeSnapshot;
    }
  });

  await Then("the saved scenario renders directly and the campaign and engagement headers return", async () => {
    if (resumeError) throw resumeError;
    if (preserveHydratedScenario !== true) {
      throw new Error(`Cold resume rebuilt the map without preserving its hydrated scenario: ${String(preserveHydratedScenario)}.`);
    }
    if (preserveHydratedSelection !== true || restoredSelectionKey !== "1,1" || activityLogCollapsed !== true) {
      throw new Error(
        `Cold resume presentation timing drifted: preserveSelection=${String(preserveHydratedSelection)}, selection=${restoredSelectionKey}, logCollapsed=${String(activityLogCollapsed)}.`
      );
    }
    if ((screen as any).scenario.name !== "Meeting Engagement — Hex 1,1"
      || campaignTitle.textContent !== "Operation Overlord - Central Channel Sector"
      || missionTitle.textContent !== "Meeting Engagement — Hex 1,1") {
      throw new Error(
        `Cold resume presentation drifted: scenario=${(screen as any).scenario.name}, campaign=${campaignTitle.textContent}, engagement=${missionTitle.textContent}.`
      );
    }
  });
});

registerTest("BATTLESCREEN_CAMPAIGN_FORMATION_NAME_OVERRIDES_GENERIC_TACTICAL_TYPE", async ({ Given, When, Then }) => {
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  let label: string | null = null;

  await Given("a tactical unit carrying its immutable campaign formation identity", async () => {});

  await When("the battle inspector resolves the player's unit label", async () => {
    label = (screen as any).resolveUnitLabelForUnit({
      type: "Infantry_42",
      campaignProvenance: { formationName: "U.S. 1st Infantry Division" }
    });
  });

  await Then("the campaign formation name is shown instead of a generic catalog label", async () => {
    if (label !== "U.S. 1st Infantry Division") {
      throw new Error(`Expected campaign formation identity, received ${label ?? "<none>"}.`);
    }
  });
});

registerTest("BATTLESCREEN_CAMPAIGN_MAP_POINTS_NEVER_RENDER_PLACEHOLDER_OBJECTIVES", async ({ Given, When, Then }) => {
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  const summaryButton = document.createElement("button");
  const indexElement = document.createElement("span");
  const titleElement = document.createElement("span");
  const statusElement = document.createElement("span");

  await Given("four focusable tactical points and two semantic campaign objectives", () => {
    (screen as any).objectiveSummaryButton = summaryButton;
    (screen as any).objectiveIndexElement = indexElement;
    (screen as any).objectiveTitleElement = titleElement;
    (screen as any).objectiveStatusElement = statusElement;
    (screen as any).currentObjectiveIndex = 2;
    (screen as any).scenario = {
      objectives: [
        { hex: { q: 1, r: 1 } },
        { hex: { q: 2, r: 1 } },
        { hex: { q: 3, r: 1 } },
        { hex: { q: 4, r: 1 } }
      ]
    };
    (screen as any).missionStatus = {
      objectives: [
        { id: "secure", label: "Secure the engagement area", tier: "primary", state: "inProgress" },
        { id: "break", label: "Break the opposing ground force", tier: "secondary", state: "inProgress" }
      ],
      markers: [
        { status: "player" },
        { status: "enemy" },
        { status: "unoccupied" },
        { status: "unoccupied" }
      ]
    };
    (screen as any).battleState = {
      getPrecombatMissionInfo: () => ({
        objectives: ["Primary: Secure the engagement area", "Secondary: Break the opposing ground force"]
      })
    };
  });

  await When("the objective card renders the third focusable map point", () => {
    (screen as any).renderBattleObjectiveSummary();
  });

  await Then("the card gives that point an actionable order and map status", () => {
    if (indexElement.textContent !== "Tactical Objective 3 of 4"
      || titleElement.textContent !== "Secure Engagement Point 3"
      || statusElement.textContent !== "Open"
      || statusElement.dataset.state !== "inProgress"
      || summaryButton.getAttribute("aria-label")?.includes("awaiting confirmation")) {
      throw new Error(
        `Campaign tactical point summary drifted: index=${indexElement.textContent}, title=${titleElement.textContent}, status=${statusElement.textContent}.`
      );
    }
  });
});

registerTest("BATTLESCREEN_MAP_RECONSTRUCTION_REAPPLIES_OBJECTIVE_MARKERS", async ({ Given, When, Then }) => {
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  const renderOrder: string[] = [];

  await Given("a campaign battlefield whose SVG is being reconstructed", () => {
    document.body.innerHTML = `
      <div id="battleScreen">
        <div id="battleMapCanvas"></div>
        <svg id="battleHexMap"></svg>
      </div>
    `;
    (screen as any).element = document.getElementById("battleScreen");
    (screen as any).scenario = { objectives: [{ hex: { q: 1, r: 1 } }] };
    (screen as any).hexMapRenderer = {
      render: () => renderOrder.push("map"),
      setSoundEnabled() {},
      onHexClick() {},
      onSelectionChanged() {},
      renderBaseCampMarker() {}
    };
    (screen as any).soundEnabled = false;
    (screen as any).ensureEngine = () => {};
    (screen as any).cloneScenario = () => (screen as any).scenario;
    (screen as any).configureBattlefieldBackdrop = () => {};
    (screen as any).registerScenarioZones = () => {};
    (screen as any).mapViewport = { reset() {} };
    (screen as any).renderEngineUnits = () => renderOrder.push("units");
    (screen as any).updateObjectiveMarkers = () => renderOrder.push("objectives");
    (screen as any).updateAirHudWidget = () => {};
    (screen as any).activeMissionSessionKey = null;
    (screen as any).getMissionSessionKey = () => "campaign:Normal:objective-marker-test";
  });

  await When("the tactical map finishes rendering", () => {
    (screen as any).initializeBattleMap(true);
  });

  await Then("objective markers are restored after terrain and units exist", () => {
    if (renderOrder.join(" > ") !== "map > units > objectives") {
      throw new Error(`Objective marker render order drifted: ${renderOrder.join(" > ")}.`);
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
