import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { getScenarioByMissionKey } from "../src/data/scenarioRegistry";
import { ensureCampaignState } from "../src/state/CampaignState";
import { ensureDeploymentState, resetDeploymentState } from "../src/state/DeploymentState";
function mountBattleScreenRoot() {
    document.body.innerHTML = "<div id=\"battleScreen\"></div>";
    const root = document.getElementById("battleScreen");
    if (!root) {
        throw new Error("Battle screen root was not created for test");
    }
    return root;
}
registerTest("SCENARIO_REGISTRY_REQUIRES_EXPLICIT_MISSION_MAPPING", async ({ Given, When, Then }) => {
    let patrolScenarioName = "";
    let resolvedScenarioName = "";
    let thrown = null;
    await Given("a request for a known and an unknown mission key", async () => {
        mountBattleScreenRoot();
    });
    await When("scenario sources are resolved", async () => {
        patrolScenarioName = getScenarioByMissionKey("patrol").name ?? "";
        resolvedScenarioName = getScenarioByMissionKey("patrol_river_watch").name ?? "";
        try {
            getScenarioByMissionKey("unknown_mission");
        }
        catch (error) {
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
        if (!(thrown instanceof Error) || !thrown.message.includes("Unknown mission key: unknown_mission")) {
            throw new Error("Expected unknown mission lookup to throw an explicit scenario registry error");
        }
    });
});
registerTest("BATTLESCREEN_BASE_CAMP_FALLS_BACK_TO_DEFAULT_DEPLOYMENT_HEX", async ({ Given, When, Then }) => {
    let screen;
    let assignedAxial = null;
    let assignedZoneKey = null;
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
            setBaseCamp(axial) {
                assignedAxial = axial;
            }
        };
        const fakeBattleState = {
            ensureGameEngine() {
                return fakeEngine;
            }
        };
        const fakeDeploymentPanel = {
            setCriticalError() { },
            markBaseCampAssigned(zoneKey) {
                assignedZoneKey = zoneKey;
            }
        };
        const fakeRenderer = {
            applyHexSelection() { },
            renderBaseCampMarker() { }
        };
        screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "patrol" });
        screen.baseCampStatus = document.createElement("div");
        screen.refreshDeploymentMirrors = () => { };
        screen.completeTutorialPhase = () => { };
        screen.selectedHexKey = null;
        screen.defaultSelectionKey = null;
    });
    await When("base camp assignment runs without a prior click on a specific hex", async () => {
        screen.handleAssignBaseCamp();
    });
    await Then("the default player deployment hex is used instead of surfacing a null-selection error", async () => {
        if (!assignedAxial || assignedAxial.q !== 14 || assignedAxial.r !== -5) {
            throw new Error(`Expected fallback base camp assignment at offset 14,2 => axial 14,-5, received ${JSON.stringify(assignedAxial)}`);
        }
        if (assignedZoneKey !== "zone-alpha") {
            throw new Error(`Expected fallback base camp assignment to lock zone-alpha, received ${assignedZoneKey}`);
        }
        if (!(screen.baseCampStatus.textContent ?? "").includes("Base camp: 14,2")) {
            throw new Error(`Expected base camp status to confirm fallback hex 14,2, received ${screen.baseCampStatus.textContent}`);
        }
        resetDeploymentState();
    });
});
registerTest("BATTLESCREEN_DEFAULT_SELECTION_USES_PLAYER_DEPLOYMENT_HEX", async ({ Given, When, Then }) => {
    let screen;
    let defaultSelectionKey = null;
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
        screen = new BattleScreen({}, {}, {}, null, null, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
    });
    await When("the battle screen computes its default selection", async () => {
        defaultSelectionKey = screen.computeDefaultSelectionKey();
    });
    await Then("the first registered player deployment hex is used instead of raw scenario zone data", async () => {
        if (defaultSelectionKey !== "4,4") {
            throw new Error(`Expected registered default selection to be 4,4, received ${defaultSelectionKey}`);
        }
        resetDeploymentState();
    });
});
registerTest("BATTLESCREEN_DEFAULT_SELECTION_PREFERS_ASSIGNED_BASE_CAMP", async ({ Given, When, Then }) => {
    let screen;
    let defaultSelectionKey = null;
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
        deploymentState.baseCampKey = "5,5";
        screen = new BattleScreen({}, {}, {}, null, null, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
    });
    await When("the battle screen computes its default selection", async () => {
        defaultSelectionKey = screen.computeDefaultSelectionKey();
    });
    await Then("the assigned base camp is preferred over generic player frontage", async () => {
        if (defaultSelectionKey !== "5,5") {
            throw new Error(`Expected base-camp default selection to be 5,5, received ${defaultSelectionKey}`);
        }
        resetDeploymentState();
    });
});
registerTest("BATTLESCREEN_INVALID_DEPLOYMENT_SELECTION_KEEPS_PLAYER_ZONE_HIGHLIGHTED", async ({ Given, When, Then }) => {
    let screen;
    let highlightedHexes = [];
    let selectedHexContext = null;
    let baseCampButton;
    let baseCampStatus;
    await Given("a River Watch deployment screen with registered player deployment zones", async () => {
        mountBattleScreenRoot();
        resetDeploymentState();
        ensureDeploymentState().registerZones([
            {
                zoneKey: "allied-start",
                capacity: 20,
                hexKeys: [
                    "0,1", "1,1", "2,1", "3,1", "4,1",
                    "0,2", "1,2", "2,2", "3,2", "4,2",
                    "0,3", "1,3", "2,3", "3,3", "4,3",
                    "0,4", "1,4", "2,4", "3,4", "4,4"
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
            }
        };
        const fakeRenderer = {
            setZoneHighlights(keys) {
                highlightedHexes = Array.from(keys);
            }
        };
        const fakeDeploymentPanel = {
            setSelectedHex(key, context) {
                selectedHexContext = { key, context };
            }
        };
        screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
        baseCampButton = document.createElement("button");
        baseCampStatus = document.createElement("div");
        screen.baseCampAssignButton = baseCampButton;
        screen.baseCampStatus = baseCampStatus;
    });
    await When("the commander selects an out-of-zone hex during deployment", async () => {
        screen.updateSelectionFeedback("0,6");
    });
    await Then("the map keeps valid player deployment hexes highlighted and disables base-camp assignment", async () => {
        if (baseCampButton.disabled !== true) {
            throw new Error("Expected base-camp assignment button to stay disabled for an invalid deployment hex.");
        }
        if (!baseCampStatus.textContent?.includes("outside player deployment zones")) {
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
registerTest("BATTLESCREEN_SOUND_TOGGLE_PERSISTS_AND_UPDATES_RENDERER", async ({ Given, When, Then }) => {
    let screen;
    let soundEnabled = true;
    let toggleButton;
    await Given("a battle screen with a sound toggle button and renderer audio controls", async () => {
        document.body.innerHTML = `
      <div id="battleScreen">
        <button id="battleSoundToggle" type="button">Sound On</button>
      </div>
    `;
        window.localStorage.removeItem("fsg-sound-enabled");
        const fakeRenderer = {
            setSoundEnabled(enabled) {
                soundEnabled = enabled;
            },
            isSoundEnabled() {
                return soundEnabled;
            }
        };
        screen = new BattleScreen({}, {}, {}, fakeRenderer, null, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
        screen.cacheElements();
        screen.bindEvents();
        screen.applySoundPreference(true);
        toggleButton = document.getElementById("battleSoundToggle");
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
        if (toggleButton.textContent !== "Sound On") {
            throw new Error(`Expected button label to be Sound On, received ${toggleButton.textContent}`);
        }
        if (toggleButton.getAttribute("aria-pressed") !== "true") {
            throw new Error(`Expected aria-pressed to be true, received ${toggleButton.getAttribute("aria-pressed")}`);
        }
        window.localStorage.removeItem("fsg-sound-enabled");
    });
});
registerTest("BATTLESCREEN_AUTO_DEPLOY_SKIPS_PREDEPLOYED_HEXES", async ({ Given, When, Then }) => {
    let screen;
    let deployedToAxialKey = null;
    let playerPlacements;
    let reserveUnits;
    const buildReserveUnit = (unit) => ({
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
        },
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
                type: "Recon_Bike",
                hex: { q: 1, r: 3 },
                strength: 10,
                experience: 0,
                ammo: 5,
                fuel: 30,
                entrench: 0,
                facing: "NW",
                preDeployed: true
            },
            {
                type: "Recon_Bike",
                hex: { q: 2, r: 3 },
                strength: 10,
                experience: 0,
                ammo: 5,
                fuel: 30,
                entrench: 0,
                facing: "NW",
                preDeployed: true
            }
        ];
        reserveUnits = [
            buildReserveUnit({
                type: "Recon_Bike",
                hex: { q: 0, r: 0 },
                strength: 10,
                experience: 0,
                ammo: 5,
                fuel: 30,
                entrench: 0,
                facing: "NW"
            })
        ];
        const fakeEngine = {
            baseCamp: { key: "1,3", hex: { q: 1, r: 3 } },
            getReserveSnapshot() {
                return reserveUnits;
            },
            getPlayerPlacementsSnapshot() {
                return playerPlacements;
            },
            deployUnitByKey(hex, unitKey) {
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
        };
        const fakeBattleState = {
            hasEngine() {
                return true;
            },
            ensureGameEngine() {
                return fakeEngine;
            }
        };
        screen = new BattleScreen({}, fakeBattleState, {}, null, null, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
        screen.refreshDeploymentMirrors = () => { };
        screen.announceBattleUpdate = () => { };
    });
    await When("auto-deploy runs", async () => {
        screen.handleAutoDeploy("even");
    });
    await Then("the deployment skips the predeployed hex and uses the next open offset hex", async () => {
        if (deployedToAxialKey !== "3,3") {
            throw new Error(`Expected auto-deploy to skip occupied axial 2,3 and place on 3,3, received ${deployedToAxialKey ?? "<none>"}.`);
        }
    });
});
registerTest("BATTLESCREEN_ASSIGNS_BASE_CAMP_ON_VALID_PLAYER_DEPLOYMENT_HEX", async ({ Given, When, Then }) => {
    let screen;
    let assignedAxial = null;
    let assignedZoneKey = null;
    let renderedBaseCampMarker = null;
    let mirroredReason = null;
    await Given("a selected River Watch player deployment hex", async () => {
        mountBattleScreenRoot();
        resetDeploymentState();
        ensureDeploymentState().registerZones([
            {
                zoneKey: "allied-start",
                capacity: 20,
                hexKeys: [
                    "0,1", "1,1", "2,1", "3,1", "4,1",
                    "0,2", "1,2", "2,2", "3,2", "4,2",
                    "0,3", "1,3", "2,3", "3,3", "4,3",
                    "0,4", "1,4", "2,4", "3,4", "4,4"
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
            setBaseCamp(axial) {
                assignedAxial = axial;
            }
        };
        const fakeBattleState = {
            ensureGameEngine() {
                return fakeEngine;
            }
        };
        const fakeDeploymentPanel = {
            setCriticalError() {
            },
            markBaseCampAssigned(zoneKey) {
                assignedZoneKey = zoneKey;
            }
        };
        const fakeRenderer = {
            renderBaseCampMarker(hexKey) {
                renderedBaseCampMarker = hexKey;
            }
        };
        screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
        screen.selectedHexKey = "0,1";
        screen.baseCampStatus = document.createElement("div");
        screen.refreshDeploymentMirrors = (reason) => {
            mirroredReason = reason;
        };
        screen.completeTutorialPhase = () => { };
    });
    await When("base camp assignment runs", async () => {
        screen.handleAssignBaseCamp();
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
        if (!(screen.baseCampStatus.textContent ?? "").includes("Base camp: 0,1")) {
            throw new Error(`Expected base camp status to confirm the assigned hex, received ${screen.baseCampStatus.textContent}`);
        }
        resetDeploymentState();
    });
});
registerTest("BATTLESCREEN_REPORTS_MISSING_PLAYER_SELECTION_CONTEXT", async ({ Given, When, Then }) => {
    let screen;
    let criticalError = null;
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
            setCriticalError(error) {
                criticalError = error;
            }
        };
        screen = new BattleScreen({}, {}, {}, null, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
        screen.battleAnnouncements = document.createElement("div");
        screen.baseCampStatus = document.createElement("div");
    });
    await When("default selection initialization runs", async () => {
        screen.ensureDefaultSelection();
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
        if (screen.defaultSelectionKey !== null) {
            throw new Error("Expected default selection key to remain null when no player deployment hexes are registered.");
        }
        const announcementText = screen.battleAnnouncements.textContent ?? "";
        if (!announcementText.includes("Mission selection context unavailable.") || !announcementText.includes("Reload the mission or repair the scenario's player deployment zones before continuing.")) {
            throw new Error("Expected battle announcement to summarize the blocking selection-context error.");
        }
        if (screen.baseCampStatus.textContent !== "Mission selection context unavailable.") {
            throw new Error("Expected base-camp status to mirror the blocking selection-context error title.");
        }
        resetDeploymentState();
    });
});
registerTest("BATTLESCREEN_BEGIN_BATTLE_ERRORS_USE_PANEL_MESSAGING", async ({ Given, When, Then }) => {
    let screen;
    let alertCount = 0;
    let criticalError = null;
    const originalAlert = window.alert ?? (() => { });
    await Given("battle start fails validation", async () => {
        mountBattleScreenRoot();
        window.alert = (() => {
            alertCount += 1;
        });
        const fakeDeploymentPanel = {
            setCriticalError(error) {
                criticalError = error;
            }
        };
        screen = new BattleScreen({}, {}, {}, null, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "training" });
        screen.battleAnnouncements = document.createElement("div");
        screen.baseCampStatus = document.createElement("div");
        screen.prepareBattleState = () => {
            throw new Error("Commander allocations missing. Return to precombat and lock requisitions before battle.");
        };
    });
    await When("the begin battle handler runs", async () => {
        try {
            screen.handleBeginBattle();
        }
        finally {
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
        const announcementText = screen.battleAnnouncements.textContent ?? "";
        if (!announcementText.includes("Begin battle failed.") || !announcementText.includes("Correct the deployment issue and try Begin Battle again.")) {
            throw new Error("Expected battle announcement to summarize the begin-battle error");
        }
        if (screen.baseCampStatus.textContent !== "Begin battle failed.") {
            throw new Error("Expected base-camp status to mirror the begin-battle error title.");
        }
        resetDeploymentState();
    });
});
registerTest("BATTLESCREEN_MISSION_END_USES_HEADQUARTERS_HANDOFF", async ({ Given, When, Then }) => {
    let screen;
    let shownScreenId = null;
    let alertCount = 0;
    const campaignState = ensureCampaignState();
    const originalAlert = window.alert ?? (() => { });
    const originalConfirm = window.confirm ?? (() => true);
    const originalPrompt = window.prompt ?? (() => "0");
    await Given("a mission end flow with a live campaign layer", async () => {
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
        });
        window.alert = (() => {
            alertCount += 1;
        });
        window.confirm = (() => true);
        let promptCallCount = 0;
        window.prompt = (() => {
            promptCallCount += 1;
            return promptCallCount === 1 ? "6" : "2";
        });
        const fakeBattleState = {
            getSupplyHistory() {
                return [
                    { stockpile: { ammo: 120, fuel: 90 } },
                    { stockpile: { ammo: 105, fuel: 70 } }
                ];
            },
            getSupplySnapshot() {
                return { stockpile: { ammo: 105, fuel: 70 } };
            }
        };
        screen = new BattleScreen({
            showScreenById(screenId) {
                shownScreenId = screenId;
            }
        }, fakeBattleState, {}, null, null, null, null, null, null, null, { selectedMission: "training" });
        screen.battleAnnouncements = document.createElement("div");
        screen.baseCampStatus = document.createElement("div");
    });
    await When("the mission end handler runs", async () => {
        try {
            screen.handleEndMission();
        }
        finally {
            window.alert = originalAlert;
            window.confirm = originalConfirm;
            window.prompt = originalPrompt;
        }
    });
    await Then("battle results are handed off to headquarters instead of alert", async () => {
        if (shownScreenId !== "campaign") {
            throw new Error(`Expected mission end to return to campaign, received ${shownScreenId}`);
        }
        if (alertCount !== 0) {
            throw new Error(`Expected alert() to be unused, received ${alertCount} calls`);
        }
        const headquartersStatus = campaignState.getHeadquartersStatusMessage();
        if (!headquartersStatus || headquartersStatus.title !== "Mission completed successfully.") {
            throw new Error("Expected a headquarters success handoff message after mission end.");
        }
        if (!headquartersStatus.detail.includes("Coastal Push recorded 6 objectives, 2 casualties, 15 ammo spent, and 20 fuel spent.")) {
            throw new Error(`Expected headquarters detail to summarize the mission result, received ${headquartersStatus.detail}`);
        }
        if (!headquartersStatus.action.includes("Review the updated front and headquarters ledgers")) {
            throw new Error("Expected headquarters action guidance after mission end.");
        }
        if (headquartersStatus.tone !== "success") {
            throw new Error(`Expected success tone for mission-end handoff, received ${headquartersStatus.tone}`);
        }
        campaignState.reset();
    });
});
registerTest("BATTLESCREEN_RIVER_WATCH_MISSION_END_USES_COMPUTED_STATUS", async ({ Given, When, Then }) => {
    let screen;
    let shownScreenId = null;
    let promptCount = 0;
    const campaignState = ensureCampaignState();
    const originalConfirm = window.confirm ?? (() => true);
    const originalPrompt = window.prompt ?? (() => "0");
    await Given("a River Crossing Watch mission with computed mission status", async () => {
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
        });
        window.confirm = (() => true);
        window.prompt = (() => {
            promptCount += 1;
            return "0";
        });
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
        };
        screen = new BattleScreen({
            showScreenById(screenId) {
                shownScreenId = screenId;
            }
        }, fakeBattleState, {}, null, null, null, null, null, null, null, { selectedMission: "patrol_river_watch" });
        screen.battleAnnouncements = document.createElement("div");
        screen.baseCampStatus = document.createElement("div");
        screen.scenario = {
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
        };
        screen.missionStatus = {
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
            screen.handleEndMission();
        }
        finally {
            window.confirm = originalConfirm;
            window.prompt = originalPrompt;
        }
    });
    await Then("headquarters uses computed mission results instead of prompts", async () => {
        if (shownScreenId !== "campaign") {
            throw new Error(`Expected mission end to return to campaign, received ${shownScreenId}`);
        }
        if (promptCount !== 0) {
            throw new Error(`Expected prompt() to be unused for computed mission status, received ${promptCount} calls`);
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
registerTest("BATTLESCREEN_RIVER_WATCH_SEEDS_INITIAL_MISSION_STATUS", async ({ Given, When, Then }) => {
    let screen;
    let missionObjectives = null;
    let missionTurnLimit = null;
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
        missionObjectives = document.getElementById("battleMissionObjectives");
        missionTurnLimit = document.getElementById("battleMissionTurnLimit");
        const fakeBattleState = {
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
                return () => { };
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
        };
        screen = new BattleScreen({}, fakeBattleState, { getActivePopup() { return null; } }, null, { initialize() { }, resetScenarioState() { }, on() { } }, { initialize() { } }, { initialize() { } }, null, null, { registerCollapsedChangeListener() { }, sync() { } }, { selectedMission: "patrol_river_watch" });
        screen.initializeBattleMap = () => { };
        screen.prepareBattleState = () => fakeBattleState.ensureGameEngine();
        screen.initializeDeploymentMirrors = () => { };
        screen.syncTurnContext = () => { };
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
registerTest("BATTLESCREEN_RIVER_WATCH_HARD_DIFFICULTY_NORMALIZES_TURN_LIMIT", async ({ Given, When, Then }) => {
    let screen;
    let scenarioTurnLimit = -1;
    await Given("a River Watch battle screen on Hard difficulty", async () => {
        mountBattleScreenRoot();
        screen = new BattleScreen({}, {}, {}, null, null, null, null, null, null, null, { selectedMission: "patrol_river_watch", selectedDifficulty: "Hard" });
    });
    await When("the scenario is normalized for battle", async () => {
        scenarioTurnLimit = screen.buildScenarioData().turnLimit;
    });
    await Then("the normalized scenario uses the authored Hard extraction window", async () => {
        if (scenarioTurnLimit !== 11) {
            throw new Error(`Expected Hard River Watch turn limit to normalize to 11, received ${scenarioTurnLimit}`);
        }
    });
});
registerTest("BATTLESCREEN_RIVER_WATCH_PHASE_CHANGES_ANNOUNCE_AND_UPDATE_SUMMARY", async ({ Given, When, Then }) => {
    let screen;
    let missionSummary = null;
    let battleAnnouncements = null;
    let phaseTwoAnnouncement = "";
    const engineState = {
        turnNumber: 1,
        playerUnits: [{ type: "Infantry_42", hex: { q: 4, r: 4 } }],
        botUnits: [{ type: "Infantry_42", hex: { q: 10, r: 4 } }],
        allyUnits: []
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
                return () => { };
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
        };
        screen = new BattleScreen({}, fakeBattleState, {}, null, null, null, null, null, null, null, { selectedMission: "patrol_river_watch", selectedDifficulty: "Normal" });
        screen.missionBriefingElement = missionSummary;
        screen.missionObjectivesList = document.getElementById("battleMissionObjectives");
        screen.missionDoctrineElement = document.getElementById("battleMissionDoctrine");
        screen.missionTurnLimitElement = document.getElementById("battleMissionTurnLimit");
        screen.battleAnnouncements = battleAnnouncements;
        screen.renderMissionStatus();
    });
    await When("the mission reaches turn 4 and then blocks all three fords for two turns", async () => {
        engineState.turnNumber = 4;
        screen.evaluateMissionRules();
        phaseTwoAnnouncement = battleAnnouncements?.textContent ?? "";
        engineState.turnNumber = 5;
        engineState.playerUnits = [
            { type: "Infantry_42", hex: { q: 7, r: -1 } },
            { type: "Infantry_42", hex: { q: 6, r: 3 } },
            { type: "Infantry_42", hex: { q: 6, r: 6 } }
        ];
        screen.evaluateMissionRules();
        engineState.turnNumber = 6;
        screen.evaluateMissionRules();
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
registerTest("BATTLESCREEN_RESETS_MISSION_DERIVED_UI_STATE", async ({ Given, When, Then }) => {
    let screen;
    let panelResetCount = 0;
    let idleHighlightClears = 0;
    let renderedBaseCampMarker;
    let lastSyncedActivityCount = -1;
    const zoneHighlightCalls = [];
    const overlayUpdates = [];
    await Given("a battle screen with stale mission-derived state", async () => {
        mountBattleScreenRoot();
        const fakeRenderer = {
            clearIdleUnitHighlights() {
                idleHighlightClears += 1;
            },
            toggleSelectionGlow() {
            },
            setZoneHighlights(keys) {
                zoneHighlightCalls.push(Array.from(keys));
            },
            renderBaseCampMarker(hexKey) {
                renderedBaseCampMarker = hexKey;
            }
        };
        const fakeDeploymentPanel = {
            resetScenarioState() {
                panelResetCount += 1;
            }
        };
        const fakeBattleActivityLog = {
            sync(events) {
                lastSyncedActivityCount = events.length;
            }
        };
        screen = new BattleScreen({}, {}, {}, fakeRenderer, fakeDeploymentPanel, null, null, null, null, fakeBattleActivityLog, { selectedMission: "training" });
        const announcements = document.createElement("div");
        const baseCampStatus = document.createElement("div");
        const endMissionButton = document.createElement("button");
        endMissionButton.classList.add("battle-button--highlight");
        screen.battleAnnouncements = announcements;
        screen.baseCampStatus = baseCampStatus;
        screen.endMissionButton = endMissionButton;
        screen.selectionIntelOverlay = {
            update(intel) {
                overlayUpdates.push(intel);
            }
        };
        screen.pendingAttack = { source: "1,1", target: "1,2" };
        screen.attackConfirmationLocked = true;
        screen.missionRulesController = { getStatus() { return null; } };
        screen.missionStatus = { outcome: { state: "inProgress" } };
        screen.lastMissionPhaseId = "phase2_commitment";
        screen.missionEndPrompted = true;
        screen.selectedHexKey = "5,5";
        screen.defaultSelectionKey = "0,1";
        screen.playerMoveHexes.add("1,1");
        screen.playerAttackHexes.add("2,2");
        screen.pendingIdleTurnAdvance = { reason: "test" };
        screen.lastFocusedHexKey = "5,5";
        screen.lastViewportTransform = { scale: 2 };
        screen.lastAnnouncement = "Stale announcement";
        screen.activityEvents.push({ id: "activity_1" });
        screen.activityEventSequence = 4;
        screen.idleUnitHighlightKeys.add("3,3");
        screen.airPreviewKeys = new Set(["4,4"]);
    });
    await When("the mission reset contract runs", async () => {
        screen.resetMissionDerivedUiState();
    });
    await Then("selection, overlays, activity log state, and deployment-panel state are cleared", async () => {
        if (screen.missionRulesController !== null) {
            throw new Error("Expected mission rules controller to be cleared during mission reset");
        }
        if (screen.missionStatus !== null) {
            throw new Error("Expected mission status to be cleared during mission reset");
        }
        if (screen.lastMissionPhaseId !== null) {
            throw new Error("Expected last mission phase id to be cleared during mission reset");
        }
        if (screen.missionEndPrompted !== false) {
            throw new Error("Expected mission end prompt tracking to reset between missions");
        }
        if (screen.selectedHexKey !== null) {
            throw new Error("Expected selected hex to be cleared during mission reset");
        }
        if (screen.defaultSelectionKey !== null) {
            throw new Error("Expected default selection key to be cleared during mission reset");
        }
        if (screen.playerMoveHexes.size !== 0 || screen.playerAttackHexes.size !== 0) {
            throw new Error("Expected movement and attack overlays to be cleared during mission reset");
        }
        if (screen.idleUnitHighlightKeys.size !== 0) {
            throw new Error("Expected idle highlight keys to be cleared during mission reset");
        }
        if (screen.airPreviewKeys.size !== 0) {
            throw new Error("Expected air preview keys to be cleared during mission reset");
        }
        if (screen.activityEvents.length !== 0 || screen.activityEventSequence !== 0) {
            throw new Error("Expected activity log state to reset between missions");
        }
        if (overlayUpdates.length === 0 || overlayUpdates[overlayUpdates.length - 1] !== null) {
            throw new Error("Expected selection intel overlay to be cleared during mission reset");
        }
        if (idleHighlightClears !== 1) {
            throw new Error(`Expected idle highlights to be cleared once, received ${idleHighlightClears}`);
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
        if (screen.battleAnnouncements.textContent !== "") {
            throw new Error("Expected battle announcements to clear during mission reset");
        }
        if (screen.baseCampStatus.textContent !== "No hex selected.") {
            throw new Error("Expected base-camp status to reset during mission reset");
        }
        if (screen.endMissionButton.classList.contains("battle-button--highlight")) {
            throw new Error("Expected mission reset to remove end-mission highlight state");
        }
    });
});
registerTest("BATTLESCREEN_DIFFICULTY_CHANGE_FORCES_MISSION_SESSION_REFRESH", async ({ Given, When, Then }) => {
    let screen;
    let resetCount = 0;
    let engineResetCount = 0;
    let briefingHydrateCount = 0;
    let mapInitCount = 0;
    const uiState = { selectedMission: "patrol_river_watch", selectedDifficulty: "Normal" };
    await Given("a battle screen already keyed to the current mission at Normal difficulty", async () => {
        mountBattleScreenRoot();
        screen = new BattleScreen({ showScreenById() { }, showScreen() { }, getCurrentScreen() { return null; } }, { resetEngineState() { engineResetCount += 1; } }, {}, null, null, null, null, null, null, null, uiState);
        screen.scenario = { name: "River Crossing Watch" };
        screen.activeMissionSessionKey = "patrol_river_watch:Normal:River Crossing Watch";
        screen.resetMissionDerivedUiState = () => {
            resetCount += 1;
        };
        screen.refreshScenario = () => {
            screen.scenario = { name: "River Crossing Watch" };
        };
        screen.hydrateMissionBriefing = () => {
            briefingHydrateCount += 1;
        };
        screen.initializeBattleMap = () => {
            mapInitCount += 1;
            screen.activeMissionSessionKey = `patrol_river_watch:${uiState.selectedDifficulty}:River Crossing Watch`;
        };
        screen.prepareBattleState = () => ({});
        screen.initializeDeploymentMirrors = () => { };
        screen.syncTurnContext = () => { };
        screen.renderMissionStatus = () => { };
        screen.selectionIntelOverlay = { update() { } };
    });
    await When("the commander re-enters battle on a different difficulty for the same scenario", async () => {
        uiState.selectedDifficulty = "Hard";
        screen.handleScreenShown(new CustomEvent("screenShown", { detail: { id: "battle" } }));
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
        if (screen.activeMissionSessionKey !== "patrol_river_watch:Hard:River Crossing Watch") {
            throw new Error(`Expected mission session key to track Hard difficulty, received ${screen.activeMissionSessionKey}`);
        }
    });
});
registerTest("BATTLESCREEN_BASE_CAMP_ERRORS_USE_PANEL_MESSAGING", async ({ Given, When, Then }) => {
    let screen;
    let alertCount = 0;
    let criticalError = null;
    const originalAlert = window.alert ?? (() => { });
    await Given("base-camp assignment is attempted without a selected hex", async () => {
        mountBattleScreenRoot();
        window.alert = (() => {
            alertCount += 1;
        });
        const fakeDeploymentPanel = {
            setCriticalError(error) {
                criticalError = error;
            }
        };
        screen = new BattleScreen({}, {}, {}, null, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "training" });
        screen.battleAnnouncements = document.createElement("div");
    });
    await When("the assignment handler runs", async () => {
        try {
            screen.handleAssignBaseCamp();
        }
        finally {
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
        const announcementText = screen.battleAnnouncements.textContent ?? "";
        if (!announcementText.includes("Base camp assignment failed.") || !announcementText.includes("Select a deployment-zone hex and try again.")) {
            throw new Error("Expected battle announcement to summarize the structured base-camp error");
        }
    });
});
registerTest("BATTLESCREEN_DUPLICATE_DEPLOY_EVENTS_IGNORE_STALE_SECOND_ATTEMPT", async ({ Given, When, Then }) => {
    let screen;
    let panelListener = null;
    let criticalError = null;
    let deployCalls = 0;
    const refreshReasons = [];
    let reserveSnapshot = [
        {
            unit: { type: "Infantry_42", hex: { q: 0, r: 0 } },
            definition: { name: "Infantry Battalion" },
            allocationKey: "infantry"
        }
    ];
    let placements = [];
    await Given("a deployment panel event stream that delivers the same deploy request twice", async () => {
        mountBattleScreenRoot();
        resetDeploymentState();
        ensureDeploymentState().registerScenarioAlias("infantry", "Infantry_42");
        const fakeDeploymentPanel = {
            on(listener) {
                panelListener = listener;
                return () => { };
            },
            setCriticalError(error) {
                criticalError = error;
            },
            resolveZoneForHex() {
                return { name: "Allied Start" };
            }
        };
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
            deployUnitByKey(_axial, unitKey) {
                if (unitKey !== "infantry") {
                    throw new Error(`Unexpected unit key ${unitKey}`);
                }
                deployCalls += 1;
                reserveSnapshot = [];
                placements = [{ type: "Infantry_42", hex: { q: 3, r: 2 } }];
            }
        };
        screen = new BattleScreen({}, { ensureGameEngine() { return fakeEngine; } }, {}, null, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "training" });
        screen.battleAnnouncements = document.createElement("div");
        screen.baseCampStatus = document.createElement("div");
        screen.refreshDeploymentMirrors = (reason) => {
            refreshReasons.push(reason);
        };
        screen.announceBattleUpdate = () => { };
        screen.completeTutorialPhase = () => { };
    });
    await When("the duplicate deploy events are processed", async () => {
        screen.bindPanelEvents();
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
registerTest("BATTLESCREEN_BIND_PANEL_EVENTS_IS_IDEMPOTENT", async ({ Given, When, Then }) => {
    let screen;
    let panelOnCalls = 0;
    await Given("a battle screen with a reusable deployment panel", async () => {
        mountBattleScreenRoot();
        const fakeDeploymentPanel = {
            on() {
                panelOnCalls += 1;
                return () => { };
            }
        };
        screen = new BattleScreen({}, { ensureGameEngine() { return {}; } }, {}, null, fakeDeploymentPanel, null, null, null, null, null, { selectedMission: "training" });
    });
    await When("panel events are bound more than once", async () => {
        screen.bindPanelEvents();
        screen.bindPanelEvents();
    });
    await Then("the deployment panel only receives one listener registration", async () => {
        if (panelOnCalls !== 1) {
            throw new Error(`Expected a single deployment-panel binding, received ${panelOnCalls}.`);
        }
    });
});
