import "./domEnvironment.js";
import { registerTest as registerHarnessTest, type TestContext } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { getScenarioByMissionKey } from "../src/data/scenarioRegistry";
import { ensureCampaignState } from "../src/state/CampaignState";
import { ensureDeploymentState, resetDeploymentState } from "../src/state/DeploymentState";
import { ensureTutorialState } from "../src/state/TutorialState";
import type { ScenarioUnit } from "../src/core/types";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import { commitFixture, missionStatus, tacticalStateFixture } from "./CampaignBattleResultExtraction.test.js";

/** Test-only access to the private mission-end entry points; the real handlers remain under test. */
type MissionEndHandlers = {
  handleEndMission(alreadyConfirmed?: boolean): Promise<void>;
  confirmMissionEndRequest(): Promise<boolean>;
};

/** Owns constructed screens for one case, including the listeners installed before initialize(). */
interface MissionFlowTestContext extends TestContext {
  createScreen(...args: ConstructorParameters<typeof BattleScreen>): BattleScreen;
  onCleanup(cleanup: () => void): void;
}

/** Always release screen subscriptions through the public lifecycle, even if a test assertion throws. */
function registerTest(id: string, spec: (context: MissionFlowTestContext) => Promise<void>): void {
  registerHarnessTest(id, async (context) => {
    const screens: BattleScreen[] = [];
    const cleanups: Array<() => void> = [];
    try {
      await spec({
        ...context,
        createScreen(...args) {
          const screen = new BattleScreen(...args);
          screens.push(screen);
          return screen;
        },
        onCleanup(cleanup) {
          cleanups.push(cleanup);
        }
      });
    } finally {
      // Unsubscribe the fixtures before ending their tutorial, which itself emits a state update.
      try {
        for (const screen of screens.reverse()) screen.dispose();
      } finally {
        for (const cleanup of cleanups.reverse()) cleanup();
      }
    }
  });
}

function mountBattleScreenRoot(): HTMLElement {
  document.body.innerHTML = "<div id=\"battleScreen\"></div>";
  const root = document.getElementById("battleScreen");
  if (!root) {
    throw new Error("Battle screen root was not created for test");
  }
  return root;
}

registerTest("BATTLESCREEN_MISSION_END_MODAL_USES_SAFE_ASCII_STATUS_MARKERS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let modalText = "";
  let modalHtml = "";

  await Given("a battle screen mission debrief with completed, failed, and incomplete objectives", async () => {
    const root = mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).element = root;
    (screen as any).missionEndModal = null;
    (screen as any).endMissionButton = document.createElement("button");
    (screen as any).handleEndMission = () => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).missionStatus = {
      objectives: [
        { id: "primary", label: "Repel the enemy assault", tier: "primary", state: "completed", detail: "Town remains in friendly hands." },
        { id: "secondary", label: "Hold the west ford", tier: "secondary", state: "failed", detail: "Enemy crossed the ford." },
        { id: "tertiary", label: "Preserve reserve armor", tier: "tertiary", state: "inProgress", detail: "Armor still in action." }
      ]
    };
  });

  await When("the mission end modal is rendered", async () => {
    (screen as any).showMissionEndModal("playerVictory", "The enemy attack spent itself before it could seize the town.");
    const modal = (screen as any).missionEndModal as HTMLElement | null;
    modalText = modal?.textContent ?? "";
    modalHtml = modal?.innerHTML ?? "";
  });

  await Then("the modal should avoid corrupted glyph sequences and use safe text markers instead", async () => {
    if (!modalText.includes("Mission Objectives")) {
      throw new Error(`Expected mission objectives summary in modal text, received ${modalText || "<empty>"}`);
    }
    if (!modalText.includes("OK") || !modalText.includes("X") || !modalText.includes("...")) {
      throw new Error(`Expected ASCII objective state markers in modal text, received ${modalText}`);
    }
    if (modalHtml.includes("Γ") || modalHtml.includes("┬") || modalHtml.includes("â")) {
      throw new Error(`Expected modal HTML to avoid mojibake sequences, received ${modalHtml}`);
    }
  });
});

registerTest("BATTLESCREEN_MISSION_RESULT_RETURNS_TO_HQ_WITHOUT_DUPLICATE_CONFIRMATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let alreadyConfirmed: boolean | undefined;

  await Given("a terminal mission result that already asks whether to return to headquarters", async () => {
    const root = mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).element = root;
    (screen as any).missionEndModal = null;
    (screen as any).missionStatus = { objectives: [] };
    (screen as any).handleEndMission = (confirmed: boolean) => {
      alreadyConfirmed = confirmed;
    };
    (screen as any).announceBattleUpdate = () => {};
  });

  await When("the commander chooses End Mission from that result", async () => {
    (screen as any).showMissionEndModal("playerVictory", "The opposing force is no longer combat-effective.");
    const button = document.querySelector<HTMLButtonElement>("[data-mission-end='confirm']");
    button?.click();
  });

  await Then("the result confirmation is carried into the headquarters handoff", async () => {
    if (alreadyConfirmed !== true) {
      throw new Error("Expected the terminal result to bypass the redundant generic end-mission confirmation.");
    }
    if ((screen as any).missionEndModal !== null) {
      throw new Error("Expected the completed result modal to close before the headquarters handoff.");
    }
  });
});

registerTest("BATTLESCREEN_MISSION_END_CONSENT_USES_IN_GAME_ACTIONS_AND_RESTORES_FOCUS", async ({ Given, When, Then }) => {
  // Only the private entry point is exposed; every dialog and event listener comes from BattleScreen.
  const screen = Object.create(BattleScreen.prototype) as MissionEndHandlers;
  const outcomes: boolean[] = [];
  let previousFocus: HTMLButtonElement;

  await Given("a focused mission control before the asynchronous in-game confirmation", () => {
    const root = mountBattleScreenRoot();
    previousFocus = document.createElement("button");
    previousFocus.textContent = "End Mission";
    root.appendChild(previousFocus);
    previousFocus.focus();
  });

  await When("the commander cancels through each supported action, then explicitly confirms", async () => {
    for (const action of ["cancel", "escape", "backdrop", "enterCancel", "confirm", "enterConfirm"]) {
      const pending = screen.confirmMissionEndRequest();
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="missionEndConfirmTitle"]');
      const cancel = dialog?.querySelector<HTMLButtonElement>('[data-action="cancel"]');
      const confirm = dialog?.querySelector<HTMLButtonElement>('[data-action="confirm"]');
      const backdrop = dialog?.querySelector<HTMLElement>(".initiative-proceed-modal__backdrop");
      if (!dialog || !cancel || !confirm || !backdrop || dialog.getAttribute("aria-modal") !== "true"
        || document.activeElement !== cancel || cancel.textContent !== "Keep Fighting") {
        throw new Error(`Expected accessible in-game consent with the safe action initially focused (${action}).`);
      }
      if (action === "cancel") cancel.click();
      if (action === "backdrop") backdrop.click();
      if (action === "confirm") confirm.click();
      if (action === "enterConfirm") confirm.focus();
      if (action === "escape" || action.startsWith("enter")) {
        const keyboard = new window.KeyboardEvent("keydown", { key: action === "escape" ? "Escape" : "Enter", bubbles: true, cancelable: true });
        document.dispatchEvent(keyboard);
        if (!keyboard.defaultPrevented) throw new Error("Mission-end keyboard input escaped its dialog owner.");
      }
      outcomes.push(await pending);
      if (dialog.isConnected || document.activeElement !== previousFocus) {
        throw new Error(`Expected consent to close and restore the original mission control (${action}).`);
      }
      const afterClose = new window.KeyboardEvent("keydown", { key: "Enter", cancelable: true });
      document.dispatchEvent(afterClose);
      if (afterClose.defaultPrevented) throw new Error("Mission-end dialog leaked its keyboard handler after closing.");
    }
  });

  await Then("only explicit confirmation authorizes the handoff", () => {
    if (outcomes.join() !== "false,false,false,false,true,true") {
      throw new Error(`Unexpected mission-end consent decisions: ${outcomes.join()}.`);
    }
  });
});

registerTest("SCENARIO_REGISTRY_REQUIRES_EXPLICIT_MISSION_MAPPING", async ({ Given, When, Then }) => {
  let patrolScenarioName = "";
  let resolvedScenarioName = "";
  let thrown: unknown = null;

  await Given("a request for a known and an unknown mission key", async () => {
    mountBattleScreenRoot();
  });

  await When("scenario sources are resolved", async () => {
    patrolScenarioName = (getScenarioByMissionKey("patrol") as { name?: string }).name ?? "";
    resolvedScenarioName = (getScenarioByMissionKey("patrol_river_watch") as { name?: string }).name ?? "";
    try {
      getScenarioByMissionKey("unknown_mission");
    } catch (error) {
      thrown = error;
    }
  });

  await Then("river watch resolves explicitly and unknown missions fail fast", async () => {
    if (patrolScenarioName !== "Town Defense") {
      throw new Error(`Expected patrol to resolve Town Defense, received ${patrolScenarioName || "<empty>"}`);
    }
    if (resolvedScenarioName !== "River Crossing Watch") {
      throw new Error(`Expected River Crossing Watch, received ${resolvedScenarioName || "<empty>"}`);
    }
    if (!(thrown instanceof Error) || !thrown.message.includes('Unknown mission key: "unknown_mission"')) {
      throw new Error("Expected unknown mission lookup to throw an explicit scenario registry error");
    }
  });
});

registerTest("BATTLESCREEN_STANDALONE_SCENARIOS_CLEAR_CAMPAIGN_BACKDROP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let backdropUrl: string | null | undefined;

  await Given("a standalone historical scenario after campaign state has been initialized", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).uiState = { isFromCampaign: false };
    (screen as any).hexMapRenderer = {
      setBackdropImage(url: string | null) {
        backdropUrl = url;
      }
    };
  });

  await When("the battle screen configures the tactical battlefield backdrop", async () => {
    (screen as any).configureBattlefieldBackdrop();
  });

  await Then("the standalone map should not show strategic artwork beyond its authored tiles", async () => {
    if (backdropUrl !== null) {
      throw new Error(`Expected standalone battle backdrop to clear, received ${String(backdropUrl)}.`);
    }
  });
});

registerTest("BATTLESCREEN_BASE_CAMP_REQUIRES_A_SELECTED_DEPLOYMENT_HEX", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let assignedAxial: { q: number; r: number } | null = null;
  let criticalError: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null = null;

  await Given("a deployment screen with a valid player zone but no explicit hex selection", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerZones([
      {
        zoneKey: "zone-alpha",
        capacity: 4,
        hexKeys: ["14,2", "15,2", "14,1", "15,1"],
        name: "Town Perimeter",
        description: "Town deployment ring",
        faction: "Player"
      }
    ]);

    const fakeEngine = {
      setBaseCamp(axial: { q: number; r: number }) {
        assignedAxial = axial;
      }
    } as any;

    const fakeBattleState = {
      ensureGameEngine() {
        return fakeEngine;
      }
    } as any;

    const fakeDeploymentPanel = {
      setCriticalError(error: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null) {
        criticalError = error;
      },
      markBaseCampAssigned() {
        throw new Error("Base camp should not be assigned without a selected deployment hex.");
      }
    } as any;

    const fakeRenderer = {
      clearInitiativeGroupHighlights() {},
      syncQueuedTargetMarkers() {},
      applyHexSelection() {},
      renderBaseCampMarker() {}
    } as any;

    screen = createScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol" } as any
    );

    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).refreshDeploymentMirrors = () => {};
    (screen as any).completeTutorialPhase = () => {};
    (screen as any).selectedHexKey = null;
    (screen as any).defaultSelectionKey = null;
  });

  await When("base camp assignment runs without a prior click on a specific hex", async () => {
    (screen as any).handleAssignBaseCamp();
  });

  await Then("the commander is told to choose a deployment-zone hex first", async () => {
    if (assignedAxial) {
      throw new Error(`Expected no base camp assignment without selection, received ${JSON.stringify(assignedAxial)}`);
    }
    if (criticalError?.title !== "Base camp assignment failed.") {
      throw new Error(`Expected a base camp selection error, received ${JSON.stringify(criticalError)}`);
    }
    if (!((screen as any).baseCampStatus.textContent ?? "").includes("Base camp assignment failed.")) {
      throw new Error(`Expected base camp status to surface selection guidance, received ${(screen as any).baseCampStatus.textContent}`);
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_TUTORIAL_BASE_CAMP_IGNORES_DEFAULT_SELECTION", async ({ Given, When, Then, createScreen, onCleanup }) => {
  let screen: BattleScreen;
  let assignedAxial: { q: number; r: number } | null = null;
  let criticalError: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null = null;

  await Given("the base camp tutorial is active with only a default focus hex", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerZones([
      {
        zoneKey: "zone-alpha",
        capacity: 4,
        hexKeys: ["14,2", "15,2"],
        name: "Town Perimeter",
        description: "Town deployment ring",
        faction: "Player"
      }
    ]);

    const fakeEngine = {
      setBaseCamp(axial: { q: number; r: number }) {
        assignedAxial = axial;
      }
    } as any;

    screen = createScreen(
      {} as any,
      { ensureGameEngine: () => fakeEngine } as any,
      {} as any,
      { applyHexSelection() {}, renderBaseCampMarker() {}, clearInitiativeGroupHighlights() {}, syncQueuedTargetMarkers() {} } as any,
      {
        setCriticalError(error: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null) {
          criticalError = error;
        },
        markBaseCampAssigned() {
          throw new Error("Tutorial base camp should require a fresh map selection.");
        }
      } as any,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "training" } as any
    );

    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).refreshDeploymentMirrors = () => {};
    (screen as any).completeTutorialPhase = () => {};
    (screen as any).selectedHexKey = null;
    (screen as any).defaultSelectionKey = "14,2";
    onCleanup(() => {
      ensureTutorialState().endTutorial();
      resetDeploymentState();
    });
    ensureTutorialState().startTutorial();
    ensureTutorialState().jumpToPhase("base_camp");
  });

  await When("the commander clicks assign before choosing a hex during the tutorial", async () => {
    (screen as any).handleAssignBaseCamp();
  });

  await Then("the default focus hex is not accepted as the player's base camp choice", async () => {
    if (assignedAxial) {
      throw new Error(`Expected no base camp assignment from default selection, received ${JSON.stringify(assignedAxial)}`);
    }
    if (criticalError?.title !== "Base camp assignment failed.") {
      throw new Error(`Expected a base camp selection error, received ${JSON.stringify(criticalError)}`);
    }
  });
});

registerTest("BATTLESCREEN_TUTORIAL_BASE_CAMP_PRESERVES_SELECTION_AFTER_INITIAL_ZONE_FRAMING", async ({ Given, When, Then, createScreen, onCleanup }) => {
  let screen: BattleScreen;
  const cameraRequests: Array<{ phase: string; hexKeys: string[]; zoom: number }> = [];

  await Given("the base-camp tutorial is active in deployment with multiple valid Zone Alpha hexes", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerZones([
      {
        zoneKey: "zone-alpha",
        capacity: 4,
        hexKeys: ["14,2", "15,2", "14,1", "15,1"],
        name: "Town Perimeter",
        description: "Town deployment ring",
        faction: "Player"
      }
    ]);

    const fakeEngine = {
      getTurnSummary() {
        return { phase: "deployment", activeFaction: "Player", turnNumber: 1 };
      }
    } as any;

    screen = createScreen(
      {} as any,
      { ensureGameEngine: () => fakeEngine, tryGetGameEngine: () => fakeEngine } as any,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "training" } as any
    );

    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).queueTutorialCameraForPhase = (phase: string, hexKeys: Iterable<string>, zoom: number) => {
      cameraRequests.push({ phase, hexKeys: [...hexKeys].sort(), zoom });
    };

    onCleanup(() => {
      ensureTutorialState().endTutorial();
      resetDeploymentState();
    });
    ensureTutorialState().startTutorial();
    ensureTutorialState().advancePhase("base_camp", false);
    (screen as any).syncTutorialPhaseWithCurrentContext("base_camp");
  });

  await When("the commander selects another valid deployment hex in Zone Alpha", async () => {
    (screen as any).handleRendererSelection("15,2", true);
    (screen as any).syncTutorialPhaseWithCurrentContext("base_camp");
  });

  await Then("the phase frames every legal choice once and preserves the commander's selected hex", async () => {
    if (cameraRequests.length !== 1 || cameraRequests[0].phase !== "base_camp"
      || cameraRequests[0].hexKeys.join(";") !== ["14,1", "14,2", "15,1", "15,2"].join(";")
      || !Number.isFinite(cameraRequests[0].zoom) || cameraRequests[0].zoom <= 0) {
      throw new Error(`Expected one bounded camera request for the complete deployment zone, received ${JSON.stringify(cameraRequests)}.`);
    }
    if ((screen as any).selectedHexKey !== "15,2" || (screen as any).selectionIntel?.hexKey !== "15,2"
      || !((screen as any).baseCampStatus.textContent ?? "").includes("Selected hex: 15,2")) {
      throw new Error("Expected selected hex, deployment intelligence and status to retain the commander's exact choice after phase synchronization.");
    }
  });
});

registerTest("BATTLESCREEN_DEFAULT_SELECTION_USES_PLAYER_DEPLOYMENT_HEX", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let defaultSelectionKey: string | null = null;

  await Given("the river-watch mission is selected", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerZones([
      {
        zoneKey: "bot-entry",
        capacity: 4,
        hexKeys: ["11,0", "11,1"],
        name: "Enemy Entry",
        description: "Bot zone",
        faction: "Bot"
      },
      {
        zoneKey: "player-line",
        capacity: 4,
        hexKeys: ["4,4", "4,5", "5,4", "5,5"],
        name: "Player Line",
        description: "Registered player frontage",
        faction: "Player"
      }
    ]);
    screen = createScreen(
      {} as any,
      {} as any,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch" } as any
    );
  });

  await When("the battle screen computes its default selection", async () => {
    defaultSelectionKey = (screen as any).computeDefaultSelectionKey();
  });

  await Then("the first registered player deployment hex is used instead of raw scenario zone data", async () => {
    if (defaultSelectionKey !== "4,4") {
      throw new Error(`Expected registered default selection to be 4,4, received ${defaultSelectionKey}`);
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_DEFAULT_SELECTION_PREFERS_ASSIGNED_BASE_CAMP", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let defaultSelectionKey: string | null = null;

  await Given("registered player zones and an assigned base camp", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    const deploymentState = ensureDeploymentState();
    deploymentState.registerZones([
      {
        zoneKey: "player-line",
        capacity: 4,
        hexKeys: ["4,4", "4,5", "5,4", "5,5"],
        name: "Player Line",
        description: "Registered player frontage",
        faction: "Player"
      }
    ]);
    (deploymentState as any).baseCampKey = "5,5";
    screen = createScreen(
      {} as any,
      {} as any,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch" } as any
    );
  });

  await When("the battle screen computes its default selection", async () => {
    defaultSelectionKey = (screen as any).computeDefaultSelectionKey();
  });

  await Then("the assigned base camp is preferred over generic player frontage", async () => {
    if (defaultSelectionKey !== "5,5") {
      throw new Error(`Expected base-camp default selection to be 5,5, received ${defaultSelectionKey}`);
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_INVALID_DEPLOYMENT_SELECTION_KEEPS_PLAYER_ZONE_HIGHLIGHTED", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let highlightedHexes: string[] = [];
  let selectedHexContext: { key: string | null; context?: { terrainName: string; zoneKey: string | null; zoneLabel: string | null } } | null = null;
  let baseCampButton: HTMLButtonElement;
  let baseCampStatus: HTMLDivElement;

  await Given("a River Watch deployment screen with registered player deployment zones", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerZones([
      {
        zoneKey: "allied-start",
        capacity: 20,
        hexKeys: [
          "0,1","1,1","2,1","3,1","4,1",
          "0,2","1,2","2,2","3,2","4,2",
          "0,3","1,3","2,3","3,3","4,3",
          "0,4","1,4","2,4","3,4","4,4"
        ],
        name: "Allied Start",
        description: "Covered west-bank line of departure",
        faction: "Player"
      }
    ]);

    const fakeBattleState = {
      ensureGameEngine() {
        return {
          getTurnSummary() {
            return { phase: "deployment", activeFaction: "Player", turnNumber: 1 };
          }
        };
      },
      tryGetGameEngine() {
        return this.ensureGameEngine();
      }
    } as any;

    const fakeRenderer = {
      clearInitiativeGroupHighlights() {},
      syncQueuedTargetMarkers() {},
      setZoneHighlights(keys: Iterable<string>) {
        highlightedHexes = Array.from(keys);
      }
    } as any;

    const fakeDeploymentPanel = {
      setSelectedHex(key: string | null, context?: { terrainName: string; zoneKey: string | null; zoneLabel: string | null }) {
        selectedHexContext = { key, context };
      }
    } as any;

    screen = createScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch" } as any
    );

    baseCampButton = document.createElement("button");
    baseCampStatus = document.createElement("div");
    (screen as any).baseCampAssignButton = baseCampButton;
    (screen as any).baseCampStatus = baseCampStatus;
  });

  await When("the commander selects an out-of-zone hex during deployment", async () => {
    (screen as any).updateSelectionFeedback("0,6");
  });

  await Then("the map keeps valid player deployment hexes highlighted and disables base-camp assignment", async () => {
    if (baseCampButton.disabled !== true) {
      throw new Error("Expected base-camp assignment button to stay disabled for an invalid deployment hex.");
    }
    if (!baseCampStatus.textContent?.includes("Outside player deployment zones")) {
      throw new Error(`Expected invalid-selection guidance in base-camp status, received ${baseCampStatus.textContent}`);
    }
    if (!selectedHexContext || selectedHexContext.key !== "0,6") {
      throw new Error("Expected deployment panel to receive the selected invalid hex context.");
    }
    if (selectedHexContext.context?.zoneKey !== null) {
      throw new Error(`Expected invalid selection to resolve no deployment zone, received ${selectedHexContext.context?.zoneKey}`);
    }
    if (!highlightedHexes.includes("0,1") || !highlightedHexes.includes("4,4")) {
      throw new Error(`Expected player deployment frontage to remain highlighted, received: ${highlightedHexes.join(", ")}`);
    }
    if (highlightedHexes.includes("0,6")) {
      throw new Error("Expected invalid hex to remain outside the highlighted player deployment frontage.");
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_SOUND_TOGGLE_PERSISTS_AND_UPDATES_RENDERER", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let soundEnabled = true;
  let toggleButton: HTMLButtonElement;

  await Given("a battle screen with a sound toggle button and renderer audio controls", async () => {
    document.body.innerHTML = `
      <div id="battleScreen">
        <button id="battleSoundToggle" type="button">
          <span>Battle Sound</span>
          <span data-settings-value>On</span>
        </button>
      </div>
    `;
    window.localStorage.removeItem("fsg-sound-enabled");

    const fakeRenderer = {
      clearInitiativeGroupHighlights() {},
      syncQueuedTargetMarkers() {},
      setSoundEnabled(enabled: boolean) {
        soundEnabled = enabled;
      },
      isSoundEnabled() {
        return soundEnabled;
      }
    } as any;

    screen = createScreen(
      {} as any,
      {} as any,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch" } as any
    );

    (screen as any).cacheElements();
    (screen as any).bindEvents();
    (screen as any).applySoundPreference(true);
    toggleButton = document.getElementById("battleSoundToggle") as HTMLButtonElement;
  });

  await When("the commander disables and then re-enables sound", async () => {
    toggleButton.click();
    toggleButton.click();
  });

  await Then("the button state, persistence, and renderer audio state stay in sync", async () => {
    if (window.localStorage.getItem("fsg-sound-enabled") !== "true") {
      throw new Error(`Expected sound preference to end enabled, received ${window.localStorage.getItem("fsg-sound-enabled")}`);
    }
    if (soundEnabled !== true) {
      throw new Error("Expected renderer sound state to be re-enabled after the second toggle.");
    }
    const value = toggleButton.querySelector<HTMLElement>("[data-settings-value]")?.textContent;
    if (value !== "On") {
      throw new Error(`Expected Battle Sound value to be On, received ${value}`);
    }
    if (toggleButton.getAttribute("aria-pressed") !== "true") {
      throw new Error(`Expected aria-pressed to be true, received ${toggleButton.getAttribute("aria-pressed")}`);
    }
    if (toggleButton.getAttribute("aria-checked") !== "true") {
      throw new Error(`Expected aria-checked to be true, received ${toggleButton.getAttribute("aria-checked")}`);
    }
    window.localStorage.removeItem("fsg-sound-enabled");
  });
});

registerTest("BATTLESCREEN_AUTO_DEPLOY_SKIPS_PREDEPLOYED_HEXES", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let deployedToAxialKey: string | null = null;
  let playerPlacements: ScenarioUnit[];
  let reserveUnits: import("../src/game/GameEngine").ReserveUnit[];

  const buildReserveUnit = (unit: ScenarioUnit): import("../src/game/GameEngine").ReserveUnit => ({
    unit,
    definition: {
      key: unit.type,
      name: unit.type,
      description: "",
      class: "recon",
      moveType: "wheel",
      movePoints: 4,
      fuel: unit.fuel ?? 0,
      ammo: unit.ammo ?? 0,
      traits: [],
      cost: 0
    } as unknown as import("../src/game/GameEngine").ReserveUnit["definition"],
    allocationKey: "recon"
  });

  await Given("a deployment zone where the closest auto-deploy hex already contains a predeployed unit", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();

    const deploymentState = ensureDeploymentState();
    deploymentState.initialize([{ key: "recon", label: "Recon", remaining: 3 }]);
    deploymentState.registerScenarioAlias("recon", "Recon_Bike");
    deploymentState.registerZones([
      {
        zoneKey: "player-line",
        capacity: 3,
        hexKeys: ["1,3", "2,4", "3,4"],
        name: "Player Line",
        description: "Frontage",
        faction: "Player"
      }
    ]);

    playerPlacements = [
      {
        type: "Recon_Bike" as ScenarioUnit["type"],
        hex: { q: 1, r: 3 },
        strength: 10,
        experience: 0,
        ammo: 5,
        fuel: 30,
        entrench: 0,
        facing: "NW",
        preDeployed: true
      } as ScenarioUnit,
      {
        type: "Recon_Bike" as ScenarioUnit["type"],
        hex: { q: 2, r: 3 },
        strength: 10,
        experience: 0,
        ammo: 5,
        fuel: 30,
        entrench: 0,
        facing: "NW",
        preDeployed: true
      } as ScenarioUnit
    ];

    reserveUnits = [
      buildReserveUnit({
        type: "Recon_Bike" as ScenarioUnit["type"],
        hex: { q: 0, r: 0 },
        strength: 10,
        experience: 0,
        ammo: 5,
        fuel: 30,
        entrench: 0,
        facing: "NW"
      } as ScenarioUnit)
    ];

    const fakeEngine = {
      baseCamp: { key: "1,3", hex: { q: 1, r: 3 } },
      getReserveSnapshot() {
        return reserveUnits;
      },
      getPlayerPlacementsSnapshot() {
        return playerPlacements;
      },
      deployUnitByKey(hex: { q: number; r: number }, unitKey: string) {
        const key = `${hex.q},${hex.r}`;
        if (playerPlacements.some((unit) => unit.hex.q === hex.q && unit.hex.r === hex.r)) {
          throw new Error(`Hex ${key} already contains a deployed unit.`);
        }
        if (unitKey !== "recon") {
          throw new Error(`Unexpected unit key ${unitKey}`);
        }
        deployedToAxialKey = key;
        const [reserve] = reserveUnits;
        if (!reserve) {
          throw new Error("Expected one reserve unit to auto-deploy.");
        }
        playerPlacements.push({
          ...reserve.unit,
          hex: { q: hex.q, r: hex.r }
        });
        reserveUnits = [];
      }
    } as any;

    const fakeBattleState = {
      hasEngine() {
        return true;
      },
      ensureGameEngine() {
        return fakeEngine;
      }
    } as any;

    screen = createScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch" } as any
    );

    (screen as any).refreshDeploymentMirrors = () => {};
    (screen as any).announceBattleUpdate = () => {};
  });

  await When("auto-deploy runs", async () => {
    (screen as any).handleAutoDeploy("even");
  });

  await Then("the deployment skips the predeployed hex and uses the next open offset hex", async () => {
    if (deployedToAxialKey !== "3,3") {
      throw new Error(`Expected auto-deploy to skip occupied axial 2,3 and place on 3,3, received ${deployedToAxialKey ?? "<none>"}.`);
    }
  });
});

registerTest("BATTLESCREEN_AUTO_DEPLOY_CONTROLS_REQUIRE_BASE_CAMP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let evenButton: HTMLButtonElement;
  let groupedButton: HTMLButtonElement;

  await Given("auto-placement controls before a deployment supply anchor is assigned", async () => {
    const root = mountBattleScreenRoot();
    evenButton = document.createElement("button");
    evenButton.dataset.autoDeployMode = "even";
    groupedButton = document.createElement("button");
    groupedButton.dataset.autoDeployMode = "grouped";
    root.append(evenButton, groupedButton);
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).autoDeployEvenlyButton = evenButton;
    (screen as any).autoDeployGroupedButton = groupedButton;
  });

  await When("deployment availability follows base-camp readiness", async () => {
    (screen as any).updateAutoDeployAvailability({ deploymentOpen: true, baseCampAssigned: false, deployableUnits: 4 });
  });

  await Then("both controls are visibly unavailable until base camp assignment and unlock afterward", async () => {
    if (!evenButton.disabled || !groupedButton.disabled
      || evenButton.getAttribute("aria-disabled") !== "true"
      || !groupedButton.title.includes("Assign a base camp")) {
      throw new Error("Auto-placement controls looked actionable before base camp assignment.");
    }
    (screen as any).updateAutoDeployAvailability({ deploymentOpen: true, baseCampAssigned: true, deployableUnits: 4 });
    if (evenButton.disabled || groupedButton.disabled
      || evenButton.getAttribute("aria-disabled") !== "false"
      || !groupedButton.title.includes("type in sequence")) {
      throw new Error("Auto-placement controls did not unlock with accurate guidance after base camp assignment.");
    }
    (screen as any).updateAutoDeployAvailability({ deploymentOpen: true, baseCampAssigned: true, deployableUnits: 0 });
    if (!evenButton.disabled || !evenButton.title.includes("already placed")) {
      throw new Error("Auto-placement controls stayed actionable after every formation was placed.");
    }
    (screen as any).updateAutoDeployAvailability({ deploymentOpen: false, baseCampAssigned: true, deployableUnits: 3 });
    if (!groupedButton.disabled || !groupedButton.title.includes("closed")) {
      throw new Error("Auto-placement controls stayed actionable after deployment closed.");
    }
  });
});

registerTest("BATTLESCREEN_BEGIN_MISSION_MATCHES_DEPLOYMENT_READINESS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let beginButton: HTMLButtonElement;

  await Given("a reused Begin Mission control at the start of deployment", async () => {
    const root = mountBattleScreenRoot();
    beginButton = document.createElement("button");
    beginButton.disabled = true;
    beginButton.setAttribute("aria-disabled", "true");
    root.append(beginButton);
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).beginBattleButton = beginButton;
  });

  await When("the current engine snapshot reaches each deployment prerequisite", async () => {
    (screen as any).updateBattleStartAvailability({
      deploymentOpen: true,
      committedEntries: true,
      baseCampAssigned: false,
      deployableUnits: 1,
      deployedUnits: 0
    });
  });

  await Then("Begin Mission unlocks only for a committed, fully placed force with a base camp", async () => {
    if (!beginButton.disabled || !beginButton.title.includes("Assign a base camp")) {
      throw new Error("Begin Mission looked actionable before base camp assignment.");
    }

    (screen as any).updateBattleStartAvailability({
      deploymentOpen: true,
      committedEntries: true,
      baseCampAssigned: true,
      deployableUnits: 1,
      deployedUnits: 1
    });
    if (!beginButton.disabled || !beginButton.title.includes("every requisitioned formation")) {
      throw new Error("Begin Mission looked actionable while formations still awaited placement.");
    }

    (screen as any).updateBattleStartAvailability({
      deploymentOpen: true,
      committedEntries: true,
      baseCampAssigned: true,
      deployableUnits: 0,
      deployedUnits: 1
    });
    if (beginButton.disabled
      || beginButton.getAttribute("aria-disabled") !== "false"
      || !beginButton.title.includes("Begin the mission")) {
      throw new Error("Begin Mission did not unlock when deployment status reported complete.");
    }

    (screen as any).updateBattleStartAvailability({
      deploymentOpen: false,
      committedEntries: true,
      baseCampAssigned: true,
      deployableUnits: 0,
      deployedUnits: 1
    });
    if (!beginButton.disabled || !beginButton.title.includes("already underway")) {
      throw new Error("Begin Mission remained actionable after deployment closed.");
    }
  });
});

registerTest("BATTLESCREEN_NEW_DEPLOYMENT_REOPENS_REUSED_PANEL", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let battleMain: HTMLElement;
  let deploymentPanel: HTMLElement;
  let toggleButton: HTMLButtonElement;

  await Given("a battle shell whose deployment panel was collapsed by the previous engagement", async () => {
    const root = mountBattleScreenRoot();
    battleMain = document.createElement("main");
    battleMain.setAttribute("data-panel-collapsed", "true");
    deploymentPanel = document.createElement("aside");
    deploymentPanel.id = "deploymentPanel";
    deploymentPanel.hidden = true;
    deploymentPanel.setAttribute("aria-hidden", "true");
    toggleButton = document.createElement("button");
    toggleButton.hidden = true;
    toggleButton.setAttribute("aria-hidden", "true");
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.setAttribute("aria-label", "Expand deployment panel");
    battleMain.append(deploymentPanel, toggleButton);
    root.append(battleMain);

    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).element = root;
    (screen as any).battleMainContainer = battleMain;
    (screen as any).deploymentPanel = { getElement: () => deploymentPanel };
    (screen as any).deploymentPanelToggleButton = toggleButton;
  });

  await When("the reusable shell is restored for a new deployment", async () => {
    (screen as any).restoreDeploymentPanelForDeploymentPhase();
  });

  await Then("the panel is visible and its toggle exposes one synchronized expanded state", async () => {
    if (battleMain.hasAttribute("data-panel-collapsed") || deploymentPanel.hidden) {
      throw new Error("The previous battle's collapsed deployment layout leaked into the new engagement.");
    }
    if (deploymentPanel.getAttribute("aria-hidden") !== "false"
      || toggleButton.hidden
      || toggleButton.hasAttribute("aria-hidden")
      || toggleButton.getAttribute("aria-expanded") !== "true"
      || toggleButton.getAttribute("aria-label") !== "Collapse deployment panel"
      || toggleButton.textContent !== "<") {
      throw new Error("The restored deployment panel and its toggle exposed contradictory accessibility state.");
    }
  });
});

registerTest("BATTLESCREEN_ASSIGNS_BASE_CAMP_ON_VALID_PLAYER_DEPLOYMENT_HEX", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let assignedAxial: { q: number; r: number } | null = null;
  let assignedZoneKey: string | null = null;
  let renderedBaseCampMarker: string | null = null;
  let mirroredReason: string | null = null;

  await Given("a selected River Watch player deployment hex", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerZones([
      {
        zoneKey: "allied-start",
        capacity: 20,
        hexKeys: [
          "0,1","1,1","2,1","3,1","4,1",
          "0,2","1,2","2,2","3,2","4,2",
          "0,3","1,3","2,3","3,3","4,3",
          "0,4","1,4","2,4","3,4","4,4"
        ],
        name: "Allied Start",
        description: "Covered west-bank line of departure",
        faction: "Player"
      },
      {
        zoneKey: "enemy-entry-north",
        capacity: 8,
        hexKeys: ["11,0", "12,0"],
        name: "Enemy North Approach",
        description: "Northern ford approach",
        faction: "Bot"
      }
    ]);

    const fakeEngine = {
      setBaseCamp(axial: { q: number; r: number }) {
        assignedAxial = axial;
      }
    };

    const fakeBattleState = {
      ensureGameEngine() {
        return fakeEngine;
      }
    } as any;

    const fakeDeploymentPanel = {
      setCriticalError() {
      },
      markBaseCampAssigned(zoneKey: string | null) {
        assignedZoneKey = zoneKey;
      }
    } as any;

    const fakeRenderer = {
      clearInitiativeGroupHighlights() {},
      syncQueuedTargetMarkers() {},
      renderBaseCampMarker(hexKey: string | null) {
        renderedBaseCampMarker = hexKey;
      }
    } as any;

    screen = createScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch" } as any
    );

    (screen as any).selectedHexKey = "0,1";
    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).refreshDeploymentMirrors = (reason: string) => {
      mirroredReason = reason;
    };
    (screen as any).completeTutorialPhase = () => {};
  });

  await When("base camp assignment runs", async () => {
    (screen as any).handleAssignBaseCamp();
  });

  await Then("the engine and deployment panel receive the valid player deployment zone assignment", async () => {
    if (!assignedAxial || assignedAxial.q !== 0 || assignedAxial.r !== 1) {
      throw new Error(`Expected base camp axial assignment 0,1, received ${JSON.stringify(assignedAxial)}`);
    }
    if (assignedZoneKey !== "allied-start") {
      throw new Error(`Expected base camp to lock allied-start, received ${assignedZoneKey}`);
    }
    if (renderedBaseCampMarker !== "0,1") {
      throw new Error(`Expected base camp marker to render at 0,1, received ${renderedBaseCampMarker}`);
    }
    if (mirroredReason !== "baseCamp") {
      throw new Error(`Expected deployment mirrors to refresh for baseCamp, received ${mirroredReason}`);
    }
    if (!((screen as any).baseCampStatus.textContent ?? "").includes("Base camp: 0,1")) {
      throw new Error(`Expected base camp status to confirm the assigned hex, received ${(screen as any).baseCampStatus.textContent}`);
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_REPORTS_MISSING_PLAYER_SELECTION_CONTEXT", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let criticalError: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null = null;

  await Given("a battle screen whose registered zones contain no player deployment hexes", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerZones([
      {
        zoneKey: "bot-entry",
        capacity: 4,
        hexKeys: ["11,0", "11,1"],
        name: "Enemy Entry",
        description: "Bot zone",
        faction: "Bot"
      }
    ]);

    const fakeDeploymentPanel = {
      setCriticalError(error: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null) {
        criticalError = error;
      }
    } as any;

    screen = createScreen(
      {} as any,
      {} as any,
      {} as any,
      null,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch" } as any
    );

    (screen as any).battleAnnouncements = document.createElement("div");
    (screen as any).baseCampStatus = document.createElement("div");
  });

  await When("default selection initialization runs", async () => {
    (screen as any).ensureDefaultSelection();
  });

  await Then("a blocking panel error is shown instead of silently falling back", async () => {
    if (!criticalError || criticalError.title !== "Mission selection context unavailable.") {
      throw new Error("Expected a blocking mission selection context error.");
    }
    if (!criticalError.detail?.includes("no registered player deployment hexes are available")) {
      throw new Error(`Expected missing-player-zone detail, received ${criticalError.detail}`);
    }
    if (criticalError.recoverable !== false) {
      throw new Error(`Expected non-recoverable selection-context error, received ${criticalError.recoverable}`);
    }
    if ((screen as any).defaultSelectionKey !== null) {
      throw new Error("Expected default selection key to remain null when no player deployment hexes are registered.");
    }
    const announcementText = (screen as any).battleAnnouncements.textContent ?? "";
    if (!announcementText.includes("Mission selection context unavailable.") || !announcementText.includes("Reload the mission or repair the scenario's player deployment zones before continuing.")) {
      throw new Error("Expected battle announcement to summarize the blocking selection-context error.");
    }
    if ((screen as any).baseCampStatus.textContent !== "Mission selection context unavailable.") {
      throw new Error("Expected base-camp status to mirror the blocking selection-context error title.");
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_BEGIN_MISSION_TRANSFERS_ALLIES_BEFORE_INITIATIVE", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const callOrder: string[] = [];
  let announcement = "";

  await Given("a finalized deployment with two predeployed allied formations", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    const engine = {
      phase: "playerTurn",
      activeFaction: "Player",
      turnNumber: 1,
      baseCamp: { key: "0,0", hex: { q: 0, r: 0 } },
      finalizeDeployment: () => {
        callOrder.push("finalize");
        return [];
      },
      transferAllAlliedUnitsToPlayerControl: () => {
        callOrder.push("transfer-allies");
        return 2;
      },
      getReserveSnapshot: () => []
    };

    (screen as any).uiState = { selectedMission: "training" };
    (screen as any).scenario = { name: "Training Exercise" };
    (screen as any).shouldDeferTutorialInitiativeAutoFocus = () => false;
    (screen as any).prepareBattleState = () => engine;
    (screen as any).assertBattleReady = () => {};
    (screen as any).initializeInitiativeSystem = () => {
      callOrder.push("initialize-initiative");
    };
    (screen as any).initiativeMethods = {
      startInitiativeTurnPhase: () => {
        callOrder.push("start-initiative");
      }
    };
    (screen as any).syncInitiativeTurnControlsState = () => {};
    (screen as any).focusCurrentInitiativeActivation = () => {};
    (screen as any).refreshDeploymentMirrors = () => {};
    (screen as any).battleState = {
      tryGetGameEngine: () => engine,
      getCampaignBridgeState: () => null,
      getCurrentTurnSummary: () => ({ turnNumber: 1, activeFaction: "Player", phase: "playerTurn" })
    };
    (screen as any).battleLoadout = null;
    (screen as any).reservePresenter = null;
    (screen as any).deploymentPanel = null;
    (screen as any).lockDeploymentInteractions = () => {};
    (screen as any).updateUIForBattlePhase = () => {};
    (screen as any).collapseDeploymentPanelForBattlePhase = () => {};
    (screen as any).renderEngineUnits = () => {};
    (screen as any).announceBattleUpdate = (message: string) => {
      announcement = message;
    };
    (screen as any).completeTutorialPhase = () => {};
  });

  await When("the commander selects Begin Mission", async () => {
    (screen as any).handleBeginBattle();
  });

  await Then("allied ownership settles before the opening initiative queue is created", async () => {
    const expectedOrder = ["finalize", "transfer-allies", "initialize-initiative", "start-initiative"];
    if (JSON.stringify(callOrder) !== JSON.stringify(expectedOrder)) {
      throw new Error(`Expected mission-start ownership order ${JSON.stringify(expectedOrder)}, received ${JSON.stringify(callOrder)}.`);
    }
    if (!announcement.includes("2 allied formations transferred to your command.")) {
      throw new Error(`Expected allied command transfer in the battle-start report, received '${announcement}'.`);
    }
  });
});

registerTest("BATTLESCREEN_BEGIN_BATTLE_ERRORS_USE_PANEL_MESSAGING", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let alertCount = 0;
  let criticalError: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null = null;
  const originalAlert = window.alert ?? (() => {});

  await Given("battle start fails validation", async () => {
    mountBattleScreenRoot();
    window.alert = (() => {
      alertCount += 1;
    }) as typeof window.alert;

    const fakeDeploymentPanel = {
      setCriticalError(error: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null) {
        criticalError = error;
      }
    } as any;

    screen = createScreen(
      {} as any,
      {} as any,
      {} as any,
      null,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "training" } as any
    );

    (screen as any).battleAnnouncements = document.createElement("div");
    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).prepareBattleState = () => {
      throw new Error("Commander allocations missing. Return to precombat and lock requisitions before battle.");
    };
  });

  await When("the begin battle handler runs", async () => {
    try {
      (screen as any).handleBeginBattle();
    } finally {
      window.alert = originalAlert;
    }
  });

  await Then("the failure is routed to the deployment panel instead of alert", async () => {
    if (!criticalError || criticalError.title !== "Begin battle failed.") {
      throw new Error("Expected a structured begin-battle deployment-panel error.");
    }
    if (criticalError.detail !== "Commander allocations missing. Return to precombat and lock requisitions before battle.") {
      throw new Error(`Expected begin-battle validation detail, received ${criticalError.detail}`);
    }
    if (!criticalError.action?.includes("Correct the deployment issue and try Begin Battle again.")) {
      throw new Error("Expected corrective action text in the begin-battle error.");
    }
    if (criticalError.recoverable !== true) {
      throw new Error(`Expected recoverable begin-battle error, received ${criticalError.recoverable}`);
    }
    if (alertCount !== 0) {
      throw new Error(`Expected alert() to be unused, received ${alertCount} calls`);
    }
    const announcementText = (screen as any).battleAnnouncements.textContent ?? "";
    if (!announcementText.includes("Begin battle failed.") || !announcementText.includes("Correct the deployment issue and try Begin Battle again.")) {
      throw new Error("Expected battle announcement to summarize the begin-battle error");
    }
    if ((screen as any).baseCampStatus.textContent !== "Begin battle failed.") {
      throw new Error("Expected base-camp status to mirror the begin-battle error title.");
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_MISSION_END_USES_HEADQUARTERS_HANDOFF", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const shownScreens: string[] = [];
  const serviceRecordResults: boolean[] = [];
  const handoffOrder: string[] = [];
  const nativeDialogCalls: string[] = [];
  const campaignState = ensureCampaignState();
  let headquartersStatus: ReturnType<typeof campaignState.getHeadquartersStatusMessage> = null;
  const saveBackend = new InMemoryCampaignSaveBackend();
  const committed = commitFixture(saveBackend);
  const tacticalState = tacticalStateFixture(committed.runtime, committed.pkg);
  const priorHeadquartersStatus = campaignState.getHeadquartersStatusMessage();
  const originalCampaignMethods = {
    getScenario: campaignState.getScenario,
    getActiveCampaignBattlePackage: campaignState.getActiveCampaignBattlePackage,
    applyCampaignBattleResult: campaignState.applyCampaignBattleResult,
    getCampaignBattleResultPackage: campaignState.getCampaignBattleResultPackage,
    savePostBattleAutosave: campaignState.savePostBattleAutosave
  };
  const originalDialogs = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };

  await Given("a terminal campaign battle backed by a committed package and complete tactical evidence", async () => {
    mountBattleScreenRoot();
    const engine = {
      playerUnits: tacticalState.playerPlacements,
      serialize: () => structuredClone(tacticalState)
    };
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    Object.assign(screen, {
      uiState: { selectedMission: "campaign", selectedDifficulty: "Normal", isFromCampaign: true },
      scenario: { name: "Line Assault — Hex 1,0", sides: { Player: { units: tacticalState.playerPlacements } } },
      missionStatus: structuredClone(missionStatus),
      battleState: {
        // Deliberately different from the extracted campaign ledger: the retained result owns the report.
        getSupplyHistory: () => [
          { stockpile: { ammo: 120, fuel: 90 } },
          { stockpile: { ammo: 105, fuel: 70 } }
        ],
        hasEngine: () => true,
        ensureGameEngine: () => engine,
        tryGetGameEngine: () => engine,
        getAssignedCommanderId: () => null
      },
      screenManager: {
        showScreenById(screenId: string) {
          shownScreens.push(screenId);
          handoffOrder.push("navigate");
        }
      },
      updateGeneralServiceRecord(success: boolean) {
        serviceRecordResults.push(success);
        handoffOrder.push("serviceRecord");
      },
      announceBattleUpdate: () => {},
      tacticalSessionStartedAt: Date.now(),
      selectedHexKey: null,
      mapViewport: null,
      battleAnnouncements: document.createElement("div"),
      baseCampStatus: document.createElement("div")
    });
  });

  await When("the commander consents in-game and the asynchronous handoff completes", async () => {
    try {
      window.alert = () => { nativeDialogCalls.push("alert"); };
      window.confirm = () => { nativeDialogCalls.push("confirm"); return true; };
      window.prompt = () => { nativeDialogCalls.push("prompt"); return "99"; };
      // Route the singleton boundary to a real isolated campaign, retaining its validation and transaction authority.
      campaignState.getScenario = committed.campaign.getScenario.bind(committed.campaign);
      campaignState.getActiveCampaignBattlePackage = committed.campaign.getActiveCampaignBattlePackage.bind(committed.campaign);
      campaignState.getCampaignBattleResultPackage = committed.campaign.getCampaignBattleResultPackage.bind(committed.campaign);
      campaignState.applyCampaignBattleResult = (result) => {
        handoffOrder.push("apply");
        return committed.campaign.applyCampaignBattleResult(result);
      };
      campaignState.savePostBattleAutosave = async (engagementId, request) => {
        handoffOrder.push("autosaveStarted");
        const slot = await committed.campaign.savePostBattleAutosave(engagementId, request);
        if (shownScreens.length !== 0 || serviceRecordResults.length !== 0) {
          throw new Error("Campaign navigation or service-record update preceded durable autosave completion.");
        }
        handoffOrder.push("autosaveCompleted");
        return slot;
      };

      // The prototype fixture exposes the private handler without replacing its consent or computed resolution.
      const pending = (screen as unknown as MissionEndHandlers).handleEndMission();
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="missionEndConfirmTitle"]');
      const confirm = dialog?.querySelector<HTMLButtonElement>('[data-action="confirm"]');
      if (!confirm || handoffOrder.length !== 0 || committed.campaign.getCampaignBattleResultPackage(committed.pkg.engagementId)) {
        throw new Error("Expected an in-game consent dialog before any campaign result application.");
      }
      confirm.click();
      await pending;
      headquartersStatus = campaignState.getHeadquartersStatusMessage();
      if (dialog?.isConnected) throw new Error("Mission-end consent remained open after confirmation.");
    } finally {
      Object.assign(window, originalDialogs);
      Object.assign(campaignState, originalCampaignMethods);
      campaignState.setHeadquartersStatusMessage(priorHeadquartersStatus);
    }
  });

  await Then("headquarters receives the validated result and recovery checkpoint before navigation", async () => {
    if (shownScreens.join() !== "campaign" || serviceRecordResults.length !== 1 || serviceRecordResults[0] !== true
      || handoffOrder.join() !== "apply,autosaveStarted,autosaveCompleted,serviceRecord,navigate") {
      throw new Error(`Expected one awaited campaign handoff, received ${handoffOrder.join()}.`);
    }
    if (nativeDialogCalls.length !== 0) {
      throw new Error(`Expected no browser-native mission dialogs, received ${nativeDialogCalls.join()}.`);
    }
    if (!headquartersStatus || headquartersStatus.title !== "Mission completed successfully.") {
      throw new Error("Expected a headquarters success handoff message after mission end.");
    }
    if (!headquartersStatus.detail.includes("Line Assault — Hex 1,0 recorded 1 objective, 4 casualties, 6 ammo spent, and 2 fuel spent.")
      || !headquartersStatus.detail.includes("Primary objective secured. Objective board: 1 completed, 1 failed, 0 contested.")
      || !headquartersStatus.detail.includes("A post-battle recovery checkpoint was saved.")) {
      throw new Error(`Expected headquarters detail to summarize the mission result, received ${headquartersStatus.detail}`);
    }
    if (!headquartersStatus.action.includes("Review the updated front and headquarters ledgers")) {
      throw new Error("Expected headquarters action guidance after mission end.");
    }
    if (headquartersStatus.tone !== "success") {
      throw new Error(`Expected success tone for mission-end handoff, received ${headquartersStatus.tone}`);
    }
    const retained = committed.campaign.getCampaignBattleResultPackage(committed.pkg.engagementId);
    const runtime = committed.campaign.getRuntimeSnapshot();
    if (!retained || retained.resourcesConsumed.Player?.ammo !== 6 || retained.resourcesConsumed.Player?.fuel !== 2
      || runtime?.engagementLedger[committed.pkg.engagementId]?.appliedResolutionIds.length !== 1
      || runtime.activeEngagementId !== null) {
      throw new Error("Expected the actual campaign transaction to retain one result and resolve the active engagement.");
    }
    const slots = await saveBackend.listSlots();
    if (slots.length !== 1 || slots[0].slotType !== "autosave"
      || committed.campaign.getPostBattleAutosaveStatus()?.state !== "saved") {
      throw new Error("Expected one durable post-battle autosave.");
    }
    const saved = validateCampaignSaveEnvelope(await saveBackend.getSave(slots[0].currentSaveId));
    if (!saved.ok) throw new Error(`Post-battle checkpoint failed validation: ${saved.error.message}`);
    if (saved.envelope.payload.runtime.engagementLedger[committed.pkg.engagementId]?.resultPackage?.integrityHash !== retained.integrityHash) {
      throw new Error("The recovery checkpoint did not preserve the applied tactical result.");
    }
  });
});

registerTest("BATTLESCREEN_RIVER_WATCH_MISSION_END_USES_COMPUTED_STATUS", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let shownScreenId: string | null = null;
  let campaignRevision = -1;
  let confirmCount = 0;
  let promptCount = 0;
  const campaignState = ensureCampaignState();
  const originalConfirm = window.confirm ?? (() => true);
  const originalPrompt = window.prompt ?? (() => "0");

  await Given("a standalone River Crossing Watch terminal result already confirmed in the result modal", async () => {
    mountBattleScreenRoot();
    campaignState.reset();
    campaignState.setScenario({
      key: "campaign_test",
      title: "Campaign Test",
      description: "",
      dimensions: { cols: 1, rows: 1 },
      background: { imageUrl: "about:blank" },
      tilePalette: {},
      tiles: [],
      fronts: [],
      objectives: [],
      economies: [{ faction: "Player", supplies: 200, fuel: 150, manpower: 500 }]
    } as any);
    campaignRevision = campaignState.getRuntimeSnapshot()?.revision ?? -1;
    window.confirm = (() => { confirmCount += 1; return true; }) as typeof window.confirm;
    window.prompt = (() => {
      promptCount += 1;
      return "0";
    }) as typeof window.prompt;

    const fakeBattleState = {
      getSupplyHistory() {
        return [
          { stockpile: { ammo: 120, fuel: 90 } },
          { stockpile: { ammo: 110, fuel: 80 } }
        ];
      },
      hasEngine() {
        return true;
      },
      ensureGameEngine() {
        return {
          playerUnits: [
            { type: "Infantry_42", hex: { q: 1, r: 1 } },
            { type: "Engineer", hex: { q: 1, r: 2 } },
            { type: "Recon_Bike", hex: { q: 1, r: 3 } }
          ]
        };
      }
    } as any;

    screen = createScreen(
      {
        showScreenById(screenId: string) {
          shownScreenId = screenId;
        }
      } as any,
      fakeBattleState,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch", isFromCampaign: false } as any
    );

    (screen as any).battleAnnouncements = document.createElement("div");
    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).scenario = {
      name: "River Crossing Watch",
      sides: {
        Player: {
          units: [
            { type: "Infantry_42", hex: { q: 1, r: 1 } },
            { type: "Infantry_42", hex: { q: 1, r: 2 } },
            { type: "Engineer", hex: { q: 1, r: 3 } },
            { type: "Recon_Bike", hex: { q: 1, r: 4 } }
          ]
        }
      }
    } as any;
    (screen as any).missionStatus = {
      turn: 12,
      objectives: [
        { id: "primary_deny_fords", label: "Deny enemy control of any ford for 4 consecutive turns", tier: "primary", state: "completed", detail: "Ford 1: Bot hold 0/4 turns; Ford 2: Bot hold 0/4 turns; Ford 3: Bot hold 0/4 turns" },
        { id: "secondary_destroy_comms", label: "Destroy the enemy comms team before it reaches the central ford", tier: "secondary", state: "completed" },
        { id: "tertiary_keep_recon", label: "Keep at least one recon unit alive", tier: "tertiary", state: "inProgress" }
      ],
      outcome: { state: "playerVictory", reason: "Held river line through the final turn." }
    };
  });

  await When("the mission end handler runs", async () => {
    try {
      // This resolution-only test starts after terminal-modal consent; the dialog owners are tested separately.
      await (screen as unknown as MissionEndHandlers).handleEndMission(true);
    } finally {
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
    }
  });

  await Then("the computed debrief returns standalone play to landing without changing campaign truth", async () => {
    if (shownScreenId !== "landing") {
      throw new Error(`Expected standalone mission end to return to landing, received ${shownScreenId}`);
    }
    if (promptCount !== 0 || confirmCount !== 0 || document.querySelector('[aria-labelledby="missionEndConfirmTitle"]')) {
      throw new Error(`Expected no duplicate consent or manual result prompts, received ${confirmCount} confirms and ${promptCount} prompts.`);
    }
    if (campaignRevision < 0 || campaignState.getRuntimeSnapshot()?.revision !== campaignRevision
      || campaignState.getPostBattleAutosaveStatus() !== null) {
      throw new Error("Standalone mission completion changed campaign truth or attempted a campaign autosave.");
    }
    const headquartersStatus = campaignState.getHeadquartersStatusMessage();
    if (!headquartersStatus) {
      throw new Error("Expected a headquarters mission status handoff message.");
    }
    if (headquartersStatus.title !== "Mission completed successfully.") {
      throw new Error(`Expected a success title, received ${headquartersStatus.title}`);
    }
    if (!headquartersStatus.detail.includes("River Crossing Watch recorded 2 objectives, 1 casualty, 10 ammo spent, and 10 fuel spent.")) {
      throw new Error(`Expected computed debrief summary, received ${headquartersStatus.detail}`);
    }
    if (!headquartersStatus.detail.includes("Held river line through the final turn.")) {
      throw new Error("Expected computed mission outcome reason in the headquarters detail.");
    }
    if (!headquartersStatus.detail.includes("Objective board: 2 completed, 0 failed, 1 contested.")) {
      throw new Error("Expected objective board breakdown in the headquarters detail.");
    }
    if (headquartersStatus.tone !== "success") {
      throw new Error(`Expected success tone for computed mission status, received ${headquartersStatus.tone}`);
    }
    campaignState.reset();
  });
});

registerTest("BATTLESCREEN_RIVER_WATCH_SEEDS_INITIAL_MISSION_STATUS", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let missionObjectives: HTMLUListElement | null = null;
  let missionTurnLimit: HTMLElement | null = null;

  await Given("a battle screen initialized for River Crossing Watch", async () => {
    document.body.innerHTML = `
      <div id="battleScreen">
        <div id="battleMissionSummary"></div>
        <ul id="battleMissionObjectives"></ul>
        <div id="battleMissionDoctrine"></div>
        <div id="battleMissionTurnLimit"></div>
        <ul id="battleMissionSupplies"></ul>
      </div>
    `;
    missionObjectives = document.getElementById("battleMissionObjectives") as HTMLUListElement | null;
    missionTurnLimit = document.getElementById("battleMissionTurnLimit");

    const fakeBattleState = {
      getCampaignBridgeState() {
        return null;
      },
      tryGetGameEngine() {
        return this.ensureGameEngine();
      },
      getPrecombatMissionInfo() {
        return {
          missionKey: "patrol_river_watch",
          title: "River Crossing Watch",
          briefing: "Hold the river line.",
          objectives: ["Fallback objective text should be replaced."],
          doctrine: "Screen the crossings.",
          turnLimit: 12,
          baselineSupplies: []
        };
      },
      subscribeToBattleUpdates() {
        return () => {};
      },
      hasEngine() {
        return true;
      },
      ensureGameEngine() {
        return {
          getTurnSummary() {
            return { phase: "deployment", activeFaction: "Player", turnNumber: 1 };
          }
        };
      },
      emitBattleUpdate() {
      }
    } as any;

    screen = createScreen(
      {} as any,
      fakeBattleState,
      { getActivePopup() { return null; } } as any,
      null,
      { initialize() {}, resetScenarioState() {}, on() {}, getElement: () => document.getElementById("deploymentPanel") } as any,
      { initialize() {} } as any,
      { initialize() {} } as any,
      null,
      null,
      { registerCollapsedChangeListener() {}, sync() {}, dispose() {} } as any,
      { selectedMission: "patrol_river_watch" } as any
    );

    (screen as any).initializeBattleMap = () => {};
    (screen as any).prepareBattleState = () => fakeBattleState.ensureGameEngine();
    (screen as any).initializeDeploymentMirrors = () => {};
    (screen as any).syncTurnContext = () => {};
  });

  await When("the battle screen initializes", async () => {
    screen.initialize();
  });

  await Then("the objective panel shows seeded River Watch mission state before turn advancement", async () => {
    if (!missionObjectives) {
      throw new Error("Expected mission objectives element to exist");
    }
    if (!missionTurnLimit) {
      throw new Error("Expected mission turn limit element to exist");
    }
    const objectiveText = missionObjectives.textContent ?? "";
    if (!objectiveText.includes("Hold all fords for 8 consecutive turns")) {
      throw new Error(`Expected seeded primary objective text, received ${objectiveText}`);
    }
    if (!objectiveText.includes("Player hold all: 0/8 turns")) {
      throw new Error(`Expected seeded player hold detail, received ${objectiveText}`);
    }
    if (!objectiveText.includes("Ford 1: Bot hold 0/8 turns")) {
      throw new Error(`Expected seeded ford hold detail, received ${objectiveText}`);
    }
    if (!objectiveText.includes("Enemy comms team remains active.")) {
      throw new Error(`Expected seeded secondary objective detail, received ${objectiveText}`);
    }
    if (!objectiveText.includes("At least one recon element remains operational.")) {
      throw new Error(`Expected seeded recon objective detail, received ${objectiveText}`);
    }
    if (!objectiveText.includes("In progress")) {
      throw new Error("Expected seeded mission objectives to render progress badges.");
    }
    if (objectiveText.includes("Fallback objective text should be replaced.")) {
      throw new Error("Expected seeded mission status to override static fallback objective copy.");
    }
    if (missionTurnLimit.textContent !== "12 turns") {
      throw new Error(`Expected seeded mission turn limit, received ${missionTurnLimit.textContent}`);
    }
  });
});

registerTest("BATTLESCREEN_RIVER_WATCH_IGNORES_DIFFICULTY_FOR_TURN_LIMIT", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let scenarioTurnLimit = -1;

  await Given("a River Watch battle screen on Hard difficulty", async () => {
    mountBattleScreenRoot();
    screen = createScreen(
      {} as any,
      {} as any,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch", selectedDifficulty: "Hard" } as any
    );
  });

  await When("the scenario is normalized for battle", async () => {
    scenarioTurnLimit = ((screen as any).buildScenarioData() as { turnLimit: number }).turnLimit;
  });

  await Then("the normalized scenario uses the authored mission turn limit", async () => {
    if (scenarioTurnLimit !== 12) {
      throw new Error(`Expected River Watch turn limit to normalize to 12, received ${scenarioTurnLimit}`);
    }
  });
});

registerTest("BATTLESCREEN_RIVER_WATCH_PHASE_CHANGES_ANNOUNCE_AND_UPDATE_SUMMARY", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let missionSummary: HTMLElement | null = null;
  let battleAnnouncements: HTMLElement | null = null;
  let phaseTwoAnnouncement = "";
  const engineState = {
    turnNumber: 1,
    playerUnits: [{ type: "Infantry_42", hex: { q: 4, r: 4 } }] as Array<{ type: string; hex: { q: number; r: number } }>,
    botUnits: [{ type: "Infantry_42", hex: { q: 10, r: 4 } }] as Array<{ type: string; hex: { q: number; r: number } }>,
    allyUnits: [] as Array<{ type: string; hex: { q: number; r: number } }>
  };

  await Given("a River Watch battle screen with a live mission announcement region", async () => {
    document.body.innerHTML = `
      <div id="battleScreen">
        <div id="battleMissionSummary"></div>
        <ul id="battleMissionObjectives"></ul>
        <div id="battleMissionDoctrine"></div>
        <div id="battleMissionTurnLimit"></div>
        <ul id="battleMissionSupplies"></ul>
        <div id="battleAnnouncements"></div>
      </div>
    `;

    missionSummary = document.getElementById("battleMissionSummary");
    battleAnnouncements = document.getElementById("battleAnnouncements");

    const fakeBattleState = {
      getPrecombatMissionInfo() {
        return {
          missionKey: "patrol_river_watch",
          title: "River Crossing Watch",
          briefing: "Hold the river line.",
          objectives: [],
          doctrine: "Screen the crossings.",
          turnLimit: 12,
          baselineSupplies: []
        };
      },
      subscribeToBattleUpdates() {
        return () => {};
      },
      hasEngine() {
        return true;
      },
      ensureGameEngine() {
        return {
          getTurnSummary() {
            return { phase: "playerTurn", activeFaction: "Player", turnNumber: engineState.turnNumber };
          },
          playerUnits: engineState.playerUnits,
          botUnits: engineState.botUnits,
          allyUnits: engineState.allyUnits
        };
      },
      emitBattleUpdate() {
      }
    } as any;

    screen = createScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol_river_watch", selectedDifficulty: "Normal" } as any
    );

    (screen as any).missionBriefingElement = missionSummary;
    (screen as any).missionObjectivesList = document.getElementById("battleMissionObjectives");
    (screen as any).missionDoctrineElement = document.getElementById("battleMissionDoctrine");
    (screen as any).missionTurnLimitElement = document.getElementById("battleMissionTurnLimit");
    (screen as any).battleAnnouncements = battleAnnouncements;
    (screen as any).renderMissionStatus();
  });

  await When("the mission reaches turn 4 and then blocks all three fords for two turns", async () => {
    engineState.turnNumber = 4;
    (screen as any).evaluateMissionRules();
    phaseTwoAnnouncement = battleAnnouncements?.textContent ?? "";

    engineState.turnNumber = 5;
    engineState.playerUnits = [
      { type: "Infantry_42", hex: { q: 7, r: -1 } },
      { type: "Infantry_42", hex: { q: 6, r: 3 } },
      { type: "Infantry_42", hex: { q: 6, r: 6 } }
    ];
    (screen as any).evaluateMissionRules();

    engineState.turnNumber = 6;
    (screen as any).evaluateMissionRules();
  });

  await Then("the battle announces authored phase changes and the summary reflects the latest phase", async () => {
    if (!missionSummary) {
      throw new Error("Expected mission summary element to exist");
    }
    if (!battleAnnouncements) {
      throw new Error("Expected battle announcement element to exist");
    }
    if (!phaseTwoAnnouncement.includes("enemy pressure is building across multiple crossings")) {
      throw new Error(`Expected phase 2 announcement, received ${phaseTwoAnnouncement}`);
    }
    const finalAnnouncement = battleAnnouncements.textContent ?? "";
    if (!finalAnnouncement.includes("trigger reserve pressure")) {
      throw new Error(`Expected phase 3 announcement, received ${finalAnnouncement}`);
    }
    const summaryText = missionSummary.textContent ?? "";
    if (!summaryText.includes("Phase 3: Reserve Pressure.")) {
      throw new Error(`Expected mission summary to include phase 3 label, received ${summaryText}`);
    }
    if (!summaryText.includes("Expect reserve pressure and indirect probing before dawn.")) {
      throw new Error(`Expected mission summary to include phase 3 detail, received ${summaryText}`);
    }
  });
});

registerTest("BATTLESCREEN_RESETS_MISSION_DERIVED_UI_STATE", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let panelResetCount = 0;
  let idleHighlightClears = 0;
  let initiativeHighlightClears = 0;
  let tacticalHighlightClears = 0;
  let objectiveMarkerClears = 0;
  let renderedBaseCampMarker: string | null | undefined;
  let lastSyncedActivityCount = -1;
  const zoneHighlightCalls: string[][] = [];
  const overlayUpdates: unknown[] = [];

  await Given("a battle screen with stale mission-derived state", async () => {
    mountBattleScreenRoot();
    const fakeRenderer = {
      syncQueuedTargetMarkers() {},
      clearInitiativeGroupHighlights() {
        initiativeHighlightClears += 1;
      },
      clearTacticalHighlights() {
        tacticalHighlightClears += 1;
      },
      clearObjectiveMarkers() {
        objectiveMarkerClears += 1;
      },
      clearIdleUnitHighlights() {
        idleHighlightClears += 1;
      },
      toggleSelectionGlow() {
      },
      setZoneHighlights(keys: Iterable<string>) {
        zoneHighlightCalls.push(Array.from(keys));
      },
      renderBaseCampMarker(hexKey: string | null) {
        renderedBaseCampMarker = hexKey;
      }
    } as any;
    const fakeDeploymentPanel = {
      getElement: () => document.getElementById("deploymentPanel"),
      resetScenarioState() {
        panelResetCount += 1;
      }
    } as any;
    const fakeBattleActivityLog = {
      dispose() {},
      sync(events: unknown[]) {
        lastSyncedActivityCount = events.length;
      }
    } as any;

    screen = createScreen(
      {} as any,
      { tryGetGameEngine: () => null } as any,
      {} as any,
      fakeRenderer,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      fakeBattleActivityLog,
      { selectedMission: "training" } as any
    );

    const announcements = document.createElement("div");
    const baseCampStatus = document.createElement("div");
    const endMissionButton = document.createElement("button");
    endMissionButton.classList.add("battle-button--highlight");

    (screen as any).battleAnnouncements = announcements;
    (screen as any).baseCampStatus = baseCampStatus;
    (screen as any).endMissionButton = endMissionButton;
    (screen as any).selectionIntelOverlay = {
      dispose() {},
      update(intel: unknown) {
        overlayUpdates.push(intel);
      }
    };
    (screen as any).pendingAttack = { source: "1,1", target: "1,2" };
    (screen as any).attackConfirmationLocked = true;
    (screen as any).missionRulesController = { getStatus() { return null; } };
    (screen as any).missionStatus = { outcome: { state: "inProgress" } };
    (screen as any).lastMissionPhaseId = "phase2_commitment";
    (screen as any).missionEndPrompted = true;
    (screen as any).selectedHexKey = "5,5";
    (screen as any).defaultSelectionKey = "0,1";
    (screen as any).playerMoveHexes.add("1,1");
    (screen as any).playerAttackHexes.add("2,2");
    (screen as any).pendingIdleTurnAdvance = { reason: "test" };
    (screen as any).lastFocusedHexKey = "5,5";
    (screen as any).lastViewportTransform = { scale: 2 };
    (screen as any).lastAnnouncement = "Stale announcement";
    (screen as any).activityEvents.push({ id: "activity_1" });
    (screen as any).activityEventSequence = 4;
    (screen as any).idleUnitHighlightKeys.add("3,3");
    (screen as any).airPreviewKeys = new Set(["4,4"]);
  });

  await When("the mission reset contract runs", async () => {
    (screen as any).resetMissionDerivedUiState();
  });

  await Then("selection, overlays, activity log state, and deployment-panel state are cleared", async () => {
    if ((screen as any).missionRulesController !== null) {
      throw new Error("Expected mission rules controller to be cleared during mission reset");
    }
    if ((screen as any).missionStatus !== null) {
      throw new Error("Expected mission status to be cleared during mission reset");
    }
    if ((screen as any).lastMissionPhaseId !== null) {
      throw new Error("Expected last mission phase id to be cleared during mission reset");
    }
    if ((screen as any).missionEndPrompted !== false) {
      throw new Error("Expected mission end prompt tracking to reset between missions");
    }
    if ((screen as any).selectedHexKey !== null) {
      throw new Error("Expected selected hex to be cleared during mission reset");
    }
    if ((screen as any).defaultSelectionKey !== null) {
      throw new Error("Expected default selection key to be cleared during mission reset");
    }
    if ((screen as any).playerMoveHexes.size !== 0 || (screen as any).playerAttackHexes.size !== 0) {
      throw new Error("Expected movement and attack overlays to be cleared during mission reset");
    }
    if ((screen as any).idleUnitHighlightKeys.size !== 0) {
      throw new Error("Expected idle highlight keys to be cleared during mission reset");
    }
    if ((screen as any).airPreviewKeys.size !== 0) {
      throw new Error("Expected air preview keys to be cleared during mission reset");
    }
    if ((screen as any).activityEvents.length !== 0 || (screen as any).activityEventSequence !== 0) {
      throw new Error("Expected activity log state to reset between missions");
    }
    if (overlayUpdates.length === 0 || overlayUpdates[overlayUpdates.length - 1] !== null) {
      throw new Error("Expected selection intel overlay to be cleared during mission reset");
    }
    if (idleHighlightClears !== 1) {
      throw new Error(`Expected idle highlights to be cleared once, received ${idleHighlightClears}`);
    }
    if (initiativeHighlightClears !== 1 || tacticalHighlightClears !== 1 || objectiveMarkerClears !== 1) {
      throw new Error(`Expected initiative, tactical, and objective overlays to clear once, received ${initiativeHighlightClears}, ${tacticalHighlightClears}, ${objectiveMarkerClears}.`);
    }
    if (!zoneHighlightCalls.some((keys) => keys.length === 0)) {
      throw new Error("Expected zone highlights to be cleared during mission reset");
    }
    if (renderedBaseCampMarker !== null) {
      throw new Error("Expected rendered base camp marker to be cleared during mission reset");
    }
    if (panelResetCount !== 1) {
      throw new Error(`Expected deployment panel reset once, received ${panelResetCount}`);
    }
    if (lastSyncedActivityCount !== 0) {
      throw new Error(`Expected activity log sync to receive 0 events, received ${lastSyncedActivityCount}`);
    }
    if ((screen as any).battleAnnouncements.textContent !== "") {
      throw new Error("Expected battle announcements to clear during mission reset");
    }
    if ((screen as any).baseCampStatus.textContent !== "No hex selected.") {
      throw new Error("Expected base-camp status to reset during mission reset");
    }
    if ((screen as any).endMissionButton.classList.contains("battle-button--highlight")) {
      throw new Error("Expected mission reset to remove end-mission highlight state");
    }
  });
});

registerTest("BATTLESCREEN_DIFFICULTY_CHANGE_FORCES_MISSION_SESSION_REFRESH", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let resetCount = 0;
  let engineResetCount = 0;
  let briefingHydrateCount = 0;
  let mapInitCount = 0;
  const uiState = { selectedMission: "patrol_river_watch", selectedDifficulty: "Normal" } as any;

  await Given("a battle screen already keyed to the current mission at Normal difficulty", async () => {
    mountBattleScreenRoot();
    screen = createScreen(
      { showScreenById() {}, showScreen() {}, getCurrentScreen() { return null; } } as any,
      { resetEngineState() { engineResetCount += 1; } } as any,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      uiState
    );

    (screen as any).scenario = { name: "River Crossing Watch" };
    (screen as any).activeMissionSessionKey = "patrol_river_watch:Normal:River Crossing Watch";
    (screen as any).resetMissionDerivedUiState = () => {
      resetCount += 1;
    };
    (screen as any).refreshScenario = () => {
      (screen as any).scenario = { name: "River Crossing Watch" };
    };
    (screen as any).hydrateMissionBriefing = () => {
      briefingHydrateCount += 1;
    };
    (screen as any).initializeBattleMap = () => {
      mapInitCount += 1;
      (screen as any).activeMissionSessionKey = `patrol_river_watch:${uiState.selectedDifficulty}:River Crossing Watch`;
    };
    (screen as any).prepareBattleState = () => ({});
    (screen as any).initializeDeploymentMirrors = () => {};
    (screen as any).syncTurnContext = () => {};
    (screen as any).renderMissionStatus = () => {};
    (screen as any).selectionIntelOverlay = { update() {}, dispose() {} };
  });

  await When("the commander re-enters battle on a different difficulty for the same scenario", async () => {
    uiState.selectedDifficulty = "Hard";
    (screen as any).handleScreenShown(new CustomEvent("screenShown", { detail: { id: "battle" } }));
  });

  await Then("the mission session refreshes instead of reusing stale battle state", async () => {
    if (resetCount !== 1) {
      throw new Error(`Expected one mission-state reset on difficulty change, received ${resetCount}`);
    }
    if (engineResetCount !== 1) {
      throw new Error(`Expected engine reset on difficulty change, received ${engineResetCount}`);
    }
    if (briefingHydrateCount !== 1) {
      throw new Error(`Expected mission briefing to rehydrate on difficulty change, received ${briefingHydrateCount}`);
    }
    if (mapInitCount !== 1) {
      throw new Error(`Expected battle map to reinitialize on difficulty change, received ${mapInitCount}`);
    }
    if ((screen as any).activeMissionSessionKey !== "patrol_river_watch:Hard:River Crossing Watch") {
      throw new Error(`Expected mission session key to track Hard difficulty, received ${(screen as any).activeMissionSessionKey}`);
    }
  });
});

registerTest("BATTLESCREEN_BASE_CAMP_ERRORS_USE_PANEL_MESSAGING", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let alertCount = 0;
  let criticalError: { title?: string; detail?: string; action?: string } | null = null;
  const originalAlert = window.alert ?? (() => {});

  await Given("base-camp assignment is attempted without a selected hex", async () => {
    mountBattleScreenRoot();
    window.alert = (() => {
      alertCount += 1;
    }) as typeof window.alert;

    const fakeDeploymentPanel = {
      setCriticalError(error: { title?: string; detail?: string; action?: string } | null) {
        criticalError = error;
      }
    } as any;

    screen = createScreen(
      {} as any,
      {} as any,
      {} as any,
      null,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "training" } as any
    );

    (screen as any).battleAnnouncements = document.createElement("div");
  });

  await When("the assignment handler runs", async () => {
    try {
      (screen as any).handleAssignBaseCamp();
    } finally {
      window.alert = originalAlert;
    }
  });

  await Then("the failure is routed to the deployment panel instead of alert", async () => {
    if (!criticalError || criticalError.title !== "Base camp assignment failed.") {
      throw new Error("Expected a structured deployment-panel error for missing base-camp selection");
    }
    if (criticalError.detail !== "No hex is currently selected.") {
      throw new Error(`Expected missing-selection detail, received ${criticalError.detail}`);
    }
    if (!criticalError.action?.includes("Select a deployment-zone hex")) {
      throw new Error("Expected corrective action text in the deployment-panel error");
    }
    if (alertCount !== 0) {
      throw new Error(`Expected alert() to be unused, received ${alertCount} calls`);
    }
    const announcementText = (screen as any).battleAnnouncements.textContent ?? "";
    if (!announcementText.includes("Base camp assignment failed.") || !announcementText.includes("Select a deployment-zone hex and try again.")) {
      throw new Error("Expected battle announcement to summarize the structured base-camp error");
    }
  });
});

registerTest("BATTLESCREEN_DUPLICATE_DEPLOY_EVENTS_IGNORE_STALE_SECOND_ATTEMPT", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let panelListener: ((event: { type: string; payload?: Record<string, unknown> }) => void) | null = null;
  let criticalError: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null = null;
  let deployCalls = 0;
  const refreshReasons: string[] = [];
  let reserveSnapshot = [
    {
      unit: { type: "Infantry_42", hex: { q: 0, r: 0 } },
      definition: { name: "Infantry Battalion" },
      allocationKey: "infantry"
    }
  ];
  let placements: Array<{ type: string; hex: { q: number; r: number } }> = [];

  await Given("a deployment panel event stream that delivers the same deploy request twice", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();
    ensureDeploymentState().registerScenarioAlias("infantry", "Infantry_42");

    const fakeDeploymentPanel = {
      on(listener: (event: { type: string; payload?: Record<string, unknown> }) => void) {
        panelListener = listener;
        return () => {};
      },
      setCriticalError(error: { title?: string; detail?: string; action?: string; recoverable?: boolean } | null) {
        criticalError = error;
      },
      resolveZoneForHex() {
        return { name: "Allied Start" };
      }
    } as any;

    const fakeEngine = {
      getTurnSummary() {
        return { phase: "deployment", activeFaction: "Player", turnNumber: 1 };
      },
      getReserveSnapshot() {
        return reserveSnapshot;
      },
      getPlayerPlacementsSnapshot() {
        return placements;
      },
      deployUnitByKey(_axial: { q: number; r: number }, unitKey: string) {
        if (unitKey !== "infantry") {
          throw new Error(`Unexpected unit key ${unitKey}`);
        }
        deployCalls += 1;
        reserveSnapshot = [];
        placements = [{ type: "Infantry_42", hex: { q: 3, r: 2 } }];
      }
    } as any;

    screen = createScreen(
      {} as any,
      { ensureGameEngine() { return fakeEngine; } } as any,
      {} as any,
      null,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "training" } as any
    );

    (screen as any).battleAnnouncements = document.createElement("div");
    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).refreshDeploymentMirrors = (reason: string) => {
      refreshReasons.push(reason);
    };
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).completeTutorialPhase = () => {};
  });

  await When("the duplicate deploy events are processed", async () => {
    (screen as any).bindPanelEvents();
    if (!panelListener) {
      throw new Error("Expected deployment panel listener to be registered.");
    }
    panelListener({ type: "deploy", payload: { unitKey: "infantry", hexKey: "3,3" } });
    panelListener({ type: "deploy", payload: { unitKey: "infantry", hexKey: "3,3" } });
  });

  await Then("the second stale attempt refreshes mirrors without surfacing a false deployment failure", async () => {
    if (deployCalls !== 1) {
      throw new Error(`Expected exactly one live deployment, received ${deployCalls}.`);
    }
    if (criticalError !== null) {
      throw new Error(`Expected no deployment-panel error for the duplicate deploy, received ${JSON.stringify(criticalError)}.`);
    }
    if (refreshReasons.join("|") !== "deploy|sync") {
      throw new Error(`Expected refresh reasons deploy|sync, received ${refreshReasons.join("|") || "<none>"}.`);
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_MANUAL_DEPLOY_COMPLETES_TUTORIAL_WHEN_DEPLOYMENT_POOL_IS_EMPTY", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let panelListener: ((event: { type: string; payload?: Record<string, unknown> }) => void) | null = null;
  let deployCalls = 0;
  let completedPhase: string | null = null;
  let reserveSnapshot: any[] = [];
  let placements: ScenarioUnit[] = [];

  const infantryReserve = {
    unit: {
      type: "Infantry_42",
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NE"
    },
    definition: { name: "Infantry Battalion", moveType: "foot" },
    allocationKey: "infantry"
  };
  const supportReserve = {
    unit: {
      type: "Supply_Truck",
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 0,
      fuel: 20,
      entrench: 0,
      facing: "NE"
    },
    definition: { name: "Supply Convoy", moveType: "wheel" },
    allocationKey: "supplyConvoy"
  };

  await Given("a manual deployment with one requisitioned unit and a non-pool support reserve still present", async () => {
    mountBattleScreenRoot();
    resetDeploymentState();

    const deploymentState = ensureDeploymentState();
    deploymentState.initialize([{ key: "infantry", label: "Infantry Battalion", remaining: 1 }]);
    deploymentState.registerScenarioAlias("infantry", "Infantry_42");
    deploymentState.registerScenarioAlias("supplyConvoy", "Supply_Truck");

    reserveSnapshot = [infantryReserve, supportReserve];

    const fakeDeploymentPanel = {
      on(listener: (event: { type: string; payload?: Record<string, unknown> }) => void) {
        panelListener = listener;
        return () => {};
      },
      setCriticalError() {},
      resolveZoneForHex() {
        return { name: "Allied Start" };
      }
    } as any;

    const fakeEngine = {
      getTurnSummary() {
        return { phase: "deployment", activeFaction: "Player", turnNumber: 1 };
      },
      getReserveSnapshot() {
        return reserveSnapshot;
      },
      getPlayerPlacementsSnapshot() {
        return placements;
      },
      deployUnitByKey(hex: { q: number; r: number }, unitKey: string) {
        if (unitKey !== "infantry") {
          throw new Error(`Unexpected unit key ${unitKey}`);
        }
        deployCalls += 1;
        reserveSnapshot = [supportReserve];
        placements = [{
          type: "Infantry_42" as ScenarioUnit["type"],
          hex: { q: hex.q, r: hex.r },
          strength: 10,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "NE"
        } as ScenarioUnit];
      }
    } as any;

    screen = createScreen(
      {} as any,
      { ensureGameEngine() { return fakeEngine; } } as any,
      {} as any,
      null,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "training" } as any
    );

    (screen as any).battleAnnouncements = document.createElement("div");
    (screen as any).baseCampStatus = document.createElement("div");
    (screen as any).refreshDeploymentMirrors = () => {
      ensureDeploymentState().mirrorEngineState(fakeEngine);
    };
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).completeTutorialPhase = (phase: string) => {
      completedPhase = phase;
    };
  });

  await When("the commander places the final requisitioned unit by hand", async () => {
    (screen as any).bindPanelEvents();
    if (!panelListener) {
      throw new Error("Expected deployment panel listener to be registered.");
    }
    panelListener({ type: "deploy", payload: { unitKey: "infantry", hexKey: "3,3" } });
  });

  await Then("Place The Line completes even though a support reserve remains outside the deployment pool", async () => {
    if (deployCalls !== 1) {
      throw new Error(`Expected one manual deployment, received ${deployCalls}.`);
    }
    if (completedPhase !== "place_units") {
      throw new Error(`Expected the place_units tutorial phase to complete, received ${completedPhase ?? "<none>"}.`);
    }
    if ((screen as any).countRemainingDeploymentPoolUnits() !== 0) {
      throw new Error("Expected no deployable pool units to remain.");
    }
    resetDeploymentState();
  });
});

registerTest("BATTLESCREEN_BIND_PANEL_EVENTS_IS_IDEMPOTENT", async ({ Given, When, Then, createScreen }) => {
  let screen: BattleScreen;
  let panelOnCalls = 0;

  await Given("a battle screen with a reusable deployment panel", async () => {
    mountBattleScreenRoot();
    const fakeDeploymentPanel = {
      on() {
        panelOnCalls += 1;
        return () => {};
      }
    } as any;

    screen = createScreen(
      {} as any,
      { ensureGameEngine() { return {}; } } as any,
      {} as any,
      null,
      fakeDeploymentPanel,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "training" } as any
    );
  });

  await When("panel events are bound more than once", async () => {
    (screen as any).bindPanelEvents();
    (screen as any).bindPanelEvents();
  });

  await Then("the deployment panel only receives one listener registration", async () => {
    if (panelOnCalls !== 1) {
      throw new Error(`Expected a single deployment-panel binding, received ${panelOnCalls}.`);
    }
  });
});

registerTest("BATTLESCREEN_PANEL_EVENT_STREAM_DOES_NOT_REBIND_DOM_CONTROLS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let baseCampBindings = 0;
  let toggleBindings = 0;

  await Given("the deployment event stream and its DOM controls are initialized through separate owners", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).element = mountBattleScreenRoot();
    (screen as any).deploymentPanel = { on() { return () => {}; } };
    (screen as any).panelEventsBound = false;
    (screen as any).battleState = { ensureGameEngine() { return {}; } };
    (screen as any).baseCampAssignButton = {
      addEventListener() { baseCampBindings += 1; }
    };
    (screen as any).deploymentPanelToggleButton = {
      addEventListener() { toggleBindings += 1; }
    };
  });

  await When("the deployment component event stream is bound", async () => {
    (screen as any).bindPanelEvents();
  });

  await Then("it does not add a second base-camp or sidebar-toggle click handler", async () => {
    if (baseCampBindings !== 0 || toggleBindings !== 0) {
      throw new Error(`Deployment DOM controls were rebound: base camp ${baseCampBindings}, toggle ${toggleBindings}.`);
    }
  });
});
