import { ALLOCATION_BY_CATEGORY, allocationOptions, getAllocationOption } from "../../data/unitAllocation";
import { unitComposition } from "../../data/unitComposition";
import { buildAllocationCompositionDisplay } from "../../data/unitSystem/formationPresentation";
import { getMissionBriefing, getMissionSummaryPackage, getMissionTitle, getMissionTurnLimit } from "../../data/missions";
import { ensureDeploymentState } from "../../state/DeploymentState";
import { ensureUnlockState } from "../../state/UnlockState";
import { findTemplateForUnitKey } from "../../game/adapters";
import { ensureTutorialState, isTrainingMission } from "../../state/TutorialState";
import { getNextPhase } from "../../data/tutorialSteps";
import { createMissionRulesController } from "../../state/missionRules";
import { HexMapRenderer } from "../../rendering/HexMapRenderer";
import { getScenarioByMissionKey } from "../../data/scenarioRegistry";
import { normalizeScenarioSource } from "../../data/scenarioNormalizer";
import { finalizeDeploymentZone } from "../utils/deploymentZonePlanner";
import { ensureCampaignState } from "../../state/CampaignState";
import { resolveScenarioForMission } from "../../game/campaign/CampaignBattleGenerator";
import { describeForceRatio, MISSION_TYPE_LABELS } from "../../game/campaign/EngagementContextBuilder";
import { RESERVE_PURCHASABLE_KEYS } from "../../game/campaign/campaignForceMapping";
const ALLOCATION_RESET_LABEL = "Reset Allocations";
function createAllocationPreset(missionKey, missionName, entries) {
    return {
        missionKeys: [missionKey],
        label: "Use Preset Allocations",
        appliedMessage: `${missionName} preset allocations applied.`,
        entries
    };
}
const TRAINING_ALLOCATION_PRESET = createAllocationPreset("training", "Training", [
    { key: "infantry", quantity: 3 },
    { key: "engineer", quantity: 1 },
    { key: "tank", quantity: 1 },
    { key: "heavyTankCompany", quantity: 1 },
    { key: "tankDestroyerCompany", quantity: 1 },
    { key: "flakBattery", quantity: 1 },
    { key: "reconBike", quantity: 1 },
    { key: "howitzer", quantity: 1 },
    { key: "supplyConvoy", quantity: 1 },
    { key: "ammo", quantity: 1 },
    { key: "medic", quantity: 1 },
    { key: "maintenance", quantity: 1 }
]);
const TOWN_DEFENSE_ALLOCATION_PRESET = createAllocationPreset("patrol", "Town Defense", [
    { key: "flakBattery", quantity: 4 },
    { key: "howitzer", quantity: 4 },
    { key: "interceptorWing", quantity: 3 }
]);
const RIVER_CROSSING_WATCH_ALLOCATION_PRESET = createAllocationPreset("patrol_river_watch", "River Crossing Watch", [
    { key: "infantry", quantity: 1 },
    { key: "engineer", quantity: 1 },
    { key: "reconBike", quantity: 1 },
    { key: "supplyConvoy", quantity: 1 },
    { key: "fuel", quantity: 1 }
]);
const POINTE_DU_HOC_ALLOCATION_PRESET = createAllocationPreset("patrol_pointe_du_hoc", "Pointe du Hoc", [
    { key: "infantry", quantity: 3 },
    { key: "engineer", quantity: 1 },
    { key: "shoreFireControlParty", quantity: 1 }
]);
const EL_ALAMEIN_ALLOCATION_PRESET = createAllocationPreset("assault_el_alamein", "El Alamein", [
    { key: "infantry", quantity: 6 },
    { key: "engineer", quantity: 4 },
    { key: "tank", quantity: 6 },
    { key: "heavyTankCompany", quantity: 1 },
    { key: "tankDestroyerCompany", quantity: 1 },
    { key: "howitzer", quantity: 3 },
    { key: "flakBattery", quantity: 1 },
    { key: "reconBike", quantity: 1 },
    { key: "fighter", quantity: 1 },
    { key: "groundAttackWing", quantity: 1 },
    { key: "bomber", quantity: 1 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 1 },
    { key: "fuel", quantity: 2 }
]);
const KASSERINE_PASS_ALLOCATION_PRESET = createAllocationPreset("assault_kasserine_pass", "Kasserine Pass", [
    { key: "infantry", quantity: 5 },
    { key: "engineer", quantity: 2 },
    { key: "tank", quantity: 3 },
    { key: "tankDestroyerCompany", quantity: 4 },
    { key: "howitzer", quantity: 1 },
    { key: "antiTankBattery", quantity: 4 },
    { key: "reconBike", quantity: 2 },
    { key: "fighter", quantity: 1 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 3 },
    { key: "fuel", quantity: 3 },
    { key: "maintenance", quantity: 1 }
]);
const GELA_LANDINGS_ALLOCATION_PRESET = createAllocationPreset("assault_gela_landings", "Gela Landings", [
    { key: "infantry", quantity: 4 },
    { key: "engineer", quantity: 1 },
    { key: "tank", quantity: 5 },
    { key: "tankDestroyerCompany", quantity: 3 },
    { key: "howitzer", quantity: 2 },
    { key: "antiTankBattery", quantity: 1 },
    { key: "flakBattery", quantity: 2 },
    { key: "reconBike", quantity: 1 },
    { key: "airborneDetachment", quantity: 3 },
    { key: "transportWing", quantity: 1 },
    { key: "shoreFireControlParty", quantity: 1 },
    { key: "supplyConvoy", quantity: 2 },
    { key: "medic", quantity: 1 },
    { key: "maintenance", quantity: 1 }
]);
const ANZIO_BEACHHEAD_ALLOCATION_PRESET = createAllocationPreset("assault_anzio_beachhead", "Anzio Beachhead", [
    { key: "infantry", quantity: 6 },
    { key: "airborneDetachment", quantity: 1 },
    { key: "engineer", quantity: 3 },
    { key: "tank", quantity: 3 },
    { key: "heavyTankCompany", quantity: 1 },
    { key: "tankDestroyerCompany", quantity: 4 },
    { key: "howitzer", quantity: 3 },
    { key: "flakBattery", quantity: 1 },
    { key: "reconBike", quantity: 2 },
    { key: "fighter", quantity: 1 },
    { key: "groundAttackWing", quantity: 1 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 1 },
    { key: "fuel", quantity: 2 },
    { key: "medic", quantity: 1 },
    { key: "maintenance", quantity: 1 }
]);
const MONTE_CASSINO_ALLOCATION_PRESET = createAllocationPreset("assault_monte_cassino", "Monte Cassino", [
    { key: "infantry", quantity: 8 },
    { key: "airborneDetachment", quantity: 1 },
    { key: "engineer", quantity: 5 },
    { key: "tank", quantity: 1 },
    { key: "howitzer", quantity: 6 },
    { key: "reconBike", quantity: 2 },
    { key: "groundAttackWing", quantity: 1 },
    { key: "bomber", quantity: 1 },
    { key: "corpsArtilleryGroup", quantity: 2 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 2 },
    { key: "fuel", quantity: 3 },
    { key: "medic", quantity: 2 },
    { key: "maintenance", quantity: 2 }
]);
const OMAHA_BEACH_ALLOCATION_PRESET = createAllocationPreset("assault_omaha_beach", "Omaha Beach", [
    { key: "infantry", quantity: 9 },
    { key: "engineer", quantity: 5 },
    { key: "tank", quantity: 5 },
    { key: "howitzer", quantity: 2 },
    { key: "fighter", quantity: 1 },
    { key: "groundAttackWing", quantity: 1 },
    { key: "bomber", quantity: 1 },
    { key: "shoreFireControlParty", quantity: 1 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 3 },
    { key: "fuel", quantity: 3 },
    { key: "medic", quantity: 1 },
    { key: "maintenance", quantity: 2 }
]);
const CARENTAN_ALLOCATION_PRESET = createAllocationPreset("assault_carentan", "Carentan", [
    { key: "infantry", quantity: 6 },
    { key: "airborneDetachment", quantity: 4 },
    { key: "engineer", quantity: 3 },
    { key: "tank", quantity: 2 },
    { key: "tankDestroyerCompany", quantity: 2 },
    { key: "howitzer", quantity: 2 },
    { key: "antiTankBattery", quantity: 2 },
    { key: "reconBike", quantity: 3 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 2 },
    { key: "fuel", quantity: 3 },
    { key: "medic", quantity: 2 },
    { key: "maintenance", quantity: 2 }
]);
const ARNHEM_BRIDGE_ALLOCATION_PRESET = createAllocationPreset("assault_arnhem_bridge", "Arnhem Bridge", [
    { key: "infantry", quantity: 4 },
    { key: "airborneDetachment", quantity: 4 },
    { key: "engineer", quantity: 2 },
    { key: "tank", quantity: 4 },
    { key: "tankDestroyerCompany", quantity: 3 },
    { key: "howitzer", quantity: 1 },
    { key: "antiTankBattery", quantity: 4 },
    { key: "reconBike", quantity: 2 },
    { key: "fighter", quantity: 1 },
    { key: "transportWing", quantity: 2 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 3 },
    { key: "fuel", quantity: 2 },
    { key: "medic", quantity: 1 },
    { key: "maintenance", quantity: 2 }
]);
const FALAISE_POCKET_ALLOCATION_PRESET = createAllocationPreset("assault_falaise_pocket", "Falaise Pocket", [
    { key: "infantry", quantity: 5 },
    { key: "engineer", quantity: 1 },
    { key: "tank", quantity: 7 },
    { key: "heavyTankCompany", quantity: 1 },
    { key: "tankDestroyerCompany", quantity: 3 },
    { key: "howitzer", quantity: 2 },
    { key: "reconBike", quantity: 3 },
    { key: "scoutPlaneWing", quantity: 1 },
    { key: "fighter", quantity: 1 },
    { key: "groundAttackWing", quantity: 2 },
    { key: "bomber", quantity: 1 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 1 },
    { key: "fuel", quantity: 3 },
    { key: "maintenance", quantity: 1 }
]);
const HURTGEN_FOREST_ALLOCATION_PRESET = createAllocationPreset("assault_hurtgen_forest", "Hurtgen Forest", [
    { key: "infantry", quantity: 9 },
    { key: "engineer", quantity: 5 },
    { key: "tank", quantity: 2 },
    { key: "howitzer", quantity: 6 },
    { key: "antiTankBattery", quantity: 3 },
    { key: "reconBike", quantity: 2 },
    { key: "corpsArtilleryGroup", quantity: 2 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 3 },
    { key: "fuel", quantity: 3 },
    { key: "medic", quantity: 2 },
    { key: "maintenance", quantity: 1 }
]);
const TWO_BRIDGES_ALLOCATION_PRESET = createAllocationPreset("assault", "Two Bridges", [
    { key: "infantry", quantity: 4 },
    { key: "engineer", quantity: 2 },
    { key: "tank", quantity: 3 },
    { key: "tankDestroyerCompany", quantity: 1 },
    { key: "howitzer", quantity: 1 },
    { key: "reconBike", quantity: 2 },
    { key: "supplyConvoy", quantity: 2 },
    { key: "ammo", quantity: 2 },
    { key: "fuel", quantity: 2 }
]);
const CITADEL_RIDGE_ALLOCATION_PRESET = createAllocationPreset("assault_citadel_ridge", "Citadel Ridge", [
    { key: "infantry", quantity: 5 },
    { key: "engineer", quantity: 4 },
    { key: "tank", quantity: 5 },
    { key: "heavyTankCompany", quantity: 1 },
    { key: "tankDestroyerCompany", quantity: 1 },
    { key: "howitzer", quantity: 3 },
    { key: "flakBattery", quantity: 1 },
    { key: "reconBike", quantity: 1 },
    { key: "bomber", quantity: 1 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 2 },
    { key: "fuel", quantity: 3 }
]);
const BASTOGNE_ALLOCATION_PRESET = createAllocationPreset("assault_bastogne", "Bastogne", [
    { key: "infantry", quantity: 7 },
    { key: "airborneDetachment", quantity: 2 },
    { key: "engineer", quantity: 1 },
    { key: "tank", quantity: 1 },
    { key: "tankDestroyerCompany", quantity: 4 },
    { key: "howitzer", quantity: 1 },
    { key: "antiTankBattery", quantity: 4 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 2 },
    { key: "fuel", quantity: 3 },
    { key: "medic", quantity: 1 },
    { key: "maintenance", quantity: 1 }
]);
const REMAGEN_ALLOCATION_PRESET = createAllocationPreset("assault_remagen", "Remagen", [
    { key: "infantry", quantity: 6 },
    { key: "engineer", quantity: 4 },
    { key: "tank", quantity: 3 },
    { key: "heavyTankCompany", quantity: 1 },
    { key: "tankDestroyerCompany", quantity: 3 },
    { key: "howitzer", quantity: 2 },
    { key: "flakBattery", quantity: 1 },
    { key: "reconBike", quantity: 3 },
    { key: "fighter", quantity: 1 },
    { key: "groundAttackWing", quantity: 1 },
    { key: "supplyConvoy", quantity: 3 },
    { key: "ammo", quantity: 3 },
    { key: "fuel", quantity: 1 },
    { key: "maintenance", quantity: 1 }
]);
const ALLOCATION_PRESETS = [
    TRAINING_ALLOCATION_PRESET,
    TOWN_DEFENSE_ALLOCATION_PRESET,
    RIVER_CROSSING_WATCH_ALLOCATION_PRESET,
    POINTE_DU_HOC_ALLOCATION_PRESET,
    EL_ALAMEIN_ALLOCATION_PRESET,
    KASSERINE_PASS_ALLOCATION_PRESET,
    GELA_LANDINGS_ALLOCATION_PRESET,
    ANZIO_BEACHHEAD_ALLOCATION_PRESET,
    MONTE_CASSINO_ALLOCATION_PRESET,
    OMAHA_BEACH_ALLOCATION_PRESET,
    CARENTAN_ALLOCATION_PRESET,
    ARNHEM_BRIDGE_ALLOCATION_PRESET,
    FALAISE_POCKET_ALLOCATION_PRESET,
    HURTGEN_FOREST_ALLOCATION_PRESET,
    TWO_BRIDGES_ALLOCATION_PRESET,
    CITADEL_RIDGE_ALLOCATION_PRESET,
    BASTOGNE_ALLOCATION_PRESET,
    REMAGEN_ALLOCATION_PRESET
];
export class PrecombatScreen {
    constructor(screenManager, battleState) {
        this.baselineSupplySectionElement = null;
        this.miniMapRenderer = new HexMapRenderer();
        // Campaign integration: active mission, difficulty, and dynamic caps derived from campaign economy when applicable.
        this.activeMissionKey = null;
        this.activeDifficulty = "Normal";
        this.campaignCaps = null;
        /**
         * Strategic context for the active campaign engagement, when present. Drives per-type allocation
         * caps (committed forces), the consumables budget, and the outgunned banner. Null outside the
         * campaign flow or for legacy engagements queued without context.
         */
        this.engagementContext = null;
        /**
         * Allocation state containers required by interaction TODO.
         *
         * Contract Summary:
         * - `allocationCounts` retains canonical quantities keyed by `UnitAllocationOption.key`.
         *   Re-render workflows read from this Map so interaction modules MUST write here instead of
         *   manipulating DOM directly.
         * - `allocationBudget` is currently a simple number representing total available funds. Future
         *   validation tasks may compute dynamic values but should continue to update this field so the
         *   getters remain stable.
         * - `allocationDirty` acts as a cache invalidation flag for planned budget computations. Downstream
         *   modules can short-circuit recalculations when this flag is false.
         */
        this.allocationCounts = new Map();
        this.allocationBudget = 10000;
        this.allocationDirty = false;
        this.predeployedRoster = new Map();
        this.unlockState = ensureUnlockState();
        this.miniMapRenderFrame = null;
        this.miniMapRetryTimer = null;
        this.miniMapRetryLimit = 8;
        this.screenShownListener = (event) => {
            const shownEvent = event;
            if (shownEvent.detail?.id === "precombat") {
                this.requestMiniMapRender();
            }
        };
        this.resizeListener = () => {
            if (!this.element.classList.contains("hidden")) {
                this.requestMiniMapRender();
            }
        };
        this.screenManager = screenManager;
        this.battleState = battleState;
        this.scenarioSource = getScenarioByMissionKey("training");
        this.miniMapScenario = this.buildMiniMapScenario(this.scenarioSource);
        const precombatScreen = document.getElementById("precombatScreen");
        if (!precombatScreen) {
            throw new Error("Precombat screen element (#precombatScreen) not found in DOM");
        }
        this.element = precombatScreen;
    }
    /**
     * Initializes the precombat screen.
     */
    initialize() {
        this.cacheElements();
        this.bindEvents();
        this.primeAllocationState();
        this.seedDeploymentCaches();
        // Refresh deployment zone metadata so the player always sees accurate capacity guidance before adjusting allocations.
        this.registerScenarioDeploymentZones();
        // Ensure allocation widgets are hydrated before presenting the screen so keyboard / pointer controls are responsive immediately.
        this.initializeAllocationUI();
        this.unlockState.subscribe(() => {
            this.rerenderAllocations();
            this.updateBudgetDisplay();
        });
        this.requestMiniMapRender();
    }
    /**
     * Returns the screen's root element.
     */
    getElement() {
        return this.element;
    }
    /**
     * Caches references to DOM elements.
     */
    cacheElements() {
        this.missionTitleElement = this.requireElement("#precombatMissionTitle");
        this.missionBriefingElement = this.requireElement("#precombatMissionBriefing");
        this.objectiveListElement = this.requireElement("#objectiveList");
        this.missionTurnLimitElement = this.requireElement("#missionTurnLimit");
        this.baselineSupplyListElement = this.requireElement("#baselineSupplyList");
        this.baselineSupplySectionElement = this.element.querySelector("#baselineSupplySection");
        this.doctrineNotesElement = this.requireElement("#missionDoctrineNotes");
        this.returnToLandingButton = this.requireElement("#returnToLanding");
        this.proceedToBattleButton = this.requireElement("#proceedToBattle");
        this.allocationWarningReturn = this.requireElement("#allocationWarningReturn");
        this.allocationWarningProceed = this.requireElement("#allocationWarningProceed");
        this.allocationUnitList = this.requireElement("#allocationUnitList");
        this.allocationSupportList = this.requireElement("#allocationSupportList");
        this.allocationLogisticsList = this.requireElement("#allocationLogisticsList");
        this.allocationResetButton = this.requireElement("#resetAllocations");
        this.allocationWarningOverlay = this.requireElement("#allocationWarningOverlay");
        this.allocationWarningModal = this.requireElement("#allocationWarningModal");
        this.budgetPanel = this.requireElement("#precombatBudgetPanel");
        this.budgetSpentElement = this.requireElement("#budgetSpent");
        this.budgetRemainingElement = this.requireElement("#budgetRemaining");
        this.allocationFeedbackElement = this.requireElement("#allocationFeedback");
        this.miniMapCanvas = this.requireElement("#precombatMapCanvas");
        const miniMapSvg = this.element.querySelector("#precombatHexMap");
        if (!miniMapSvg) {
            throw new Error("Required precombat element not found: #precombatHexMap");
        }
        this.miniMapSvg = miniMapSvg;
    }
    /**
     * Binds event handlers.
     */
    bindEvents() {
        this.returnToLandingButton.addEventListener("click", () => this.handleReturnToLanding());
        this.proceedToBattleButton.addEventListener("click", () => this.handleProceedToBattle());
        this.allocationWarningReturn.addEventListener("click", () => this.handleAllocationWarningReturn());
        this.allocationWarningProceed.addEventListener("click", () => this.handleAllocationWarningProceed());
        this.allocationResetButton.addEventListener("click", () => this.handleAllocationActionButton());
        document.addEventListener("screen:shown", this.screenShownListener);
        window.addEventListener("resize", this.resizeListener);
    }
    /**
     * Sets up the screen with mission-specific data.
     */
    setup(missionKey, selectedGeneralId, selectedDifficulty) {
        this.activeMissionKey = missionKey;
        this.activeDifficulty = selectedDifficulty;
        // Campaign engagements resolve through the battle generator (template + generated Bot roster,
        // cached per engagement so BattleScreen receives the identical scenario object).
        this.scenarioSource = resolveScenarioForMission(missionKey);
        // Load the strategic engagement context before budget priming so committed-force caps and the
        // consumables reserve shape the requisition screen from the first render.
        this.engagementContext = missionKey === "campaign"
            ? (ensureCampaignState().getActiveEngagement()?.context ?? null)
            : null;
        console.info("[PrecombatScreen] setup mission", {
            missionKey,
            scenarioName: this.scenarioSource.name,
            size: this.scenarioSource.size
        });
        if (missionKey === "patrol_river_watch") {
            const sourceName = this.scenarioSource.name;
            if (sourceName !== "River Crossing Watch") {
                const message = "River Crossing Watch scenario failed to load; expected river map, got " + (sourceName ?? "unknown");
                console.error(message);
                throw new Error(message);
            }
        }
        this.miniMapScenario = this.buildMiniMapScenario(this.scenarioSource);
        this.primeAllocationState();
        this.seedDeploymentCaches();
        this.registerScenarioDeploymentZones();
        this.renderMiniMap();
        this.requestMiniMapRender();
        this.renderMissionSummary(missionKey, selectedDifficulty);
        this.seedPredeployedAllocations();
        this.seedRecommendedLogisticsAllocations();
        this.appendAlliedForcesObjective();
        // Persist the command assignment so battle overlays reference the same general profile as precombat.
        this.battleState.setAssignedCommanderId(selectedGeneralId);
        this.rerenderAllocations();
        this.bindAllocationLists();
        // Derive campaign caps when entering precombat from the campaign flow.
        if (missionKey === "campaign") {
            this.computeCampaignCaps();
        }
        else {
            this.campaignCaps = null;
        }
        this.renderEngagementContextBanner();
        if (typeof console !== "undefined") {
            const expectedUnitRows = this.engagementContext
                ? (ALLOCATION_BY_CATEGORY.get("units") ?? []).filter((option) => RESERVE_PURCHASABLE_KEYS.includes(option.key) || this.getEffectiveMaxQuantity(option) > 0).length
                : (ALLOCATION_BY_CATEGORY.get("units") ?? []).filter((option) => this.isUnitAllowedByScenario(option.key)).length;
            console.assert(expectedUnitRows === this.allocationUnitList.children.length, "Precombat allocation list did not render the expected number of unit entries.");
        }
        // Start the tutorial if this is the training mission
        if (isTrainingMission(missionKey)) {
            this.startTrainingTutorial();
        }
    }
    /**
     * Starts the training tutorial when the player enters the training mission.
     */
    startTrainingTutorial() {
        const tutorialState = ensureTutorialState();
        tutorialState.startTutorial();
        console.log("[PrecombatScreen] Training tutorial started");
    }
    /**
     * Advances the tutorial to the next phase if conditions are met.
     */
    advanceTutorialIfNeeded(optionKey, newQuantity) {
        const tutorialState = ensureTutorialState();
        if (!tutorialState.isTutorialActive())
            return;
        const currentPhase = tutorialState.getCurrentPhase();
        const hasAllocation = (key, minimum) => (this.allocationCounts.get(key) ?? 0) >= minimum;
        if (currentPhase === "select_infantry" && optionKey === "infantry" && newQuantity >= 3) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_infantry");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
        if (currentPhase === "select_tanks" &&
            ["tank", "heavyTankCompany", "tankDestroyerCompany"].includes(optionKey) &&
            hasAllocation("tank", 1) &&
            hasAllocation("heavyTankCompany", 1) &&
            hasAllocation("tankDestroyerCompany", 1)) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_tanks");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
        if (currentPhase === "select_engineers" && optionKey === "engineer" && newQuantity > 0) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_engineers");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
        if (currentPhase === "select_flak" && optionKey === "flakBattery" && newQuantity >= 1) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_flak");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
        if (currentPhase === "select_recon" &&
            ["reconBike", "recon"].includes(optionKey) &&
            (hasAllocation("reconBike", 1) || hasAllocation("recon", 1))) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_recon");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
        if (currentPhase === "select_howitzer" && optionKey === "howitzer" && newQuantity > 0) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_howitzer");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
        if (currentPhase === "select_ammo" && optionKey === "ammo" && newQuantity > 0) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_ammo");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
        if (currentPhase === "select_fuel" &&
            ["medic", "maintenance"].includes(optionKey) &&
            hasAllocation("medic", 1) &&
            hasAllocation("maintenance", 1)) {
            tutorialState.setCanProceed(true);
            setTimeout(() => {
                const nextPhase = getNextPhase("select_fuel");
                if (nextPhase)
                    tutorialState.advancePhase(nextPhase);
            }, 800);
        }
    }
    /**
     * Initializes the unit allocation UI.
     */
    initializeAllocationUI() {
        this.rerenderAllocations();
        this.bindAllocationLists();
        this.updateBudgetDisplay();
    }
    /**
     * Ensures every allocation list uses a shared delegated listener so repeated renders stay idempotent.
     */
    /**
     * Handles return to landing screen.
     */
    handleReturnToLanding() {
        ensureDeploymentState().reset();
        this.screenManager.showScreenById("landing");
    }
    /**
     * Handles proceeding to battle screen.
     */
    handleProceedToBattle(force = false) {
        const tutorialState = ensureTutorialState();
        if (tutorialState.isTutorialActive() && tutorialState.getCurrentPhase() === "review_allocation") {
            tutorialState.advancePhase("ui_overview");
        }
        const entries = this.toDeploymentEntries();
        console.log("[PrecombatScreen] toDeploymentEntries built", entries.map((e) => ({ key: e.key, remaining: e.remaining })));
        if (!this.hasOperationalCombatForces() && !force) {
            this.showAllocationWarning();
            return;
        }
        this.hideAllocationWarning();
        this.registerScenarioDeploymentZones();
        const deploymentState = ensureDeploymentState();
        // Preserve the exact requisition snapshot before initialization so BattleScreen can seed the engine with the same payloads.
        deploymentState.recordCommittedEntries(entries);
        deploymentState.initialize(entries);
        entries.forEach((entry) => deploymentState.setTotalAllocatedUnits(entry.key, entry.remaining));
        // Persist the requisition snapshot so the battle engine can rebuild its reserve queue when deployment begins.
        this.battleState.setPendingDeployment(entries);
        console.log("[PrecombatScreen] Committed deployment entries and initialized DeploymentState", {
            count: entries.length,
            keys: entries.map((e) => e.key)
        });
        // Engine Touchpoints: `BattleState` persists the summary so battle-phase UI can render committed
        // allocations without re-deriving totals from mutable deployment state. `BattleScreen` will read
        // this snapshot when ready (see TODO inside that class for loadout rendering hook).
        const summary = this.buildAllocationSummary(entries);
        this.battleState.setPrecombatAllocationSummary(summary);
        this.allocationDirty = false;
        this.screenManager.showScreenById("battle");
        if (this.allocationFeedbackElement) {
            this.allocationFeedbackElement.textContent = "Deployment package locked in. Review the battle screen to finalize placements.";
        }
    }
    /**
     * Handles allocation warning return action.
     */
    handleAllocationWarningReturn() {
        this.hideAllocationWarning();
        this.proceedToBattleButton?.focus();
    }
    /**
     * Handles allocation warning proceed action.
     */
    handleAllocationWarningProceed() {
        this.hideAllocationWarning();
        this.handleProceedToBattle(true);
    }
    /**
     * Returns the effective requisition ceiling for an allocation row.
     * With an engagement context, combat formations are capped by the forces actually committed on
     * the campaign map; consumables/support stay purchasable from the RP reserve up to catalog max.
     */
    getEffectiveMaxQuantity(option) {
        if (!this.engagementContext) {
            return option.maxQuantity;
        }
        if (RESERVE_PURCHASABLE_KEYS.includes(option.key)) {
            return option.maxQuantity;
        }
        const committed = this.engagementContext.allocationCaps[option.key] ?? 0;
        return Math.min(option.maxQuantity, committed);
    }
    /**
     * Total RP value of the committed campaign forces at their effective (catalog-clamped) caps.
     * The budget covers this value in full so type caps — not money — are the binding constraint
     * on combat formations, while the RP reserve funds consumables on top.
     */
    calculateCommittedForceValue() {
        if (!this.engagementContext) {
            return 0;
        }
        let total = 0;
        for (const [key, cap] of Object.entries(this.engagementContext.allocationCaps)) {
            const option = getAllocationOption(key);
            if (!option || cap <= 0) {
                continue;
            }
            total += Math.min(cap, option.maxQuantity) * option.costPerUnit;
        }
        return total;
    }
    /**
     * Seeds the allocation map with zeroed counts so render paths can assume presence.
     */
    primeAllocationState() {
        allocationOptions.forEach((option) => {
            this.allocationCounts.set(option.key, 0);
        });
        const rawScenarioBudget = this.scenarioSource["playerBudget"];
        const scenarioBudget = typeof rawScenarioBudget === "number" ? rawScenarioBudget : undefined;
        if (this.engagementContext) {
            // Campaign engagement: budget = full value of committed forces + consumables reserve.
            // Committing everything is always affordable; the reserve is the real discretionary spend.
            this.allocationBudget = this.calculateCommittedForceValue() + this.engagementContext.rpReserve;
        }
        else {
            this.allocationBudget = scenarioBudget ?? 10000;
        }
        console.info("[PrecombatScreen] Budget initialized:", {
            scenarioBudget,
            engagementContext: this.engagementContext
                ? {
                    missionType: this.engagementContext.missionType,
                    rpReserve: this.engagementContext.rpReserve,
                    committedForceValue: this.calculateCommittedForceValue(),
                    battleHexKey: this.engagementContext.battleHexKey
                }
                : null,
            effectiveBudget: this.allocationBudget
        });
        this.allocationDirty = false;
        this.seedPredeployedAllocations();
        this.seedRecommendedLogisticsAllocations();
        this.updateBudgetDisplay();
    }
    /**
     * Seeds deployment bridges with sprite paths and scenario aliases so the battle phase can mirror state without
     * recomputing lookups. Keeping the registration close to precombat setup ensures all catalog entries stay in sync
     * even if the player has not purchased a given unit type yet.
     */
    seedDeploymentCaches() {
        const deploymentState = ensureDeploymentState();
        allocationOptions.forEach((option) => {
            if (option.spriteUrl) {
                deploymentState.registerSprite(option.key, option.spriteUrl);
            }
            const template = findTemplateForUnitKey(option.key);
            if (template) {
                deploymentState.registerScenarioAlias(option.key, template.type);
            }
        });
    }
    registerScenarioDeploymentZones() {
        const deploymentState = ensureDeploymentState();
        const missionKey = this.activeMissionKey;
        const rawZones = (this.scenarioSource.deploymentZones ?? []);
        if (rawZones.length === 0) {
            throw new Error("Scenario did not declare any deployment zones. Unable to initialize deployment UI.");
        }
        const zones = rawZones.map((zone) => {
            const finalizedZone = finalizeDeploymentZone({
                key: zone.key,
                label: zone.label,
                description: zone.description,
                capacity: zone.capacity,
                faction: zone.faction === "Player" || zone.faction === "Bot" ? zone.faction : zone.faction,
                hexes: (zone.hexes ?? []).map(([col, row]) => [col, row])
            }, this.miniMapScenario, missionKey ?? undefined);
            return finalizedZone;
        });
        deploymentState.registerZones(zones);
    }
    /**
     * Converts the current allocation map into deployment-ready entries.
     */
    toDeploymentEntries() {
        const deploymentState = ensureDeploymentState();
        const entries = [];
        for (const [key, quantity] of this.allocationCounts.entries()) {
            if (quantity <= 0) {
                continue;
            }
            const option = getAllocationOption(key);
            if (!option) {
                console.warn("Unknown allocation key encountered while building deployment entries", key);
                continue;
            }
            if (!this.isDeployableAllocation(option)) {
                continue;
            }
            if (option.spriteUrl) {
                deploymentState.registerSprite(option.key, option.spriteUrl);
            }
            entries.push({
                key,
                label: option.label,
                remaining: quantity,
                sprite: option.spriteUrl
            });
        }
        console.debug("[PrecombatScreen] toDeploymentEntries summary", entries.map((e) => ({ key: e.key, qty: e.remaining })));
        return entries;
    }
    /**
     * Builds the dataset persisted to `BattleState` for later battle-phase loadout summaries.
     */
    buildAllocationSummary(_entries) {
        let totalSpend = 0;
        const depotPackage = {
            ammo: 0,
            fuel: 0,
            rations: 0,
            parts: 0
        };
        const allocationSnapshots = [];
        for (const [key, quantity] of this.allocationCounts.entries()) {
            if (quantity <= 0) {
                continue;
            }
            const option = getAllocationOption(key);
            if (!option) {
                throw new Error(`Allocation option missing during summary build: ${key}`);
            }
            totalSpend += option.costPerUnit * quantity;
            allocationSnapshots.push({
                key,
                label: option.label,
                quantity,
                costPerUnit: option.costPerUnit,
                category: option.category
            });
            const depotPayload = option.depotPayload;
            if (depotPayload) {
                depotPackage.ammo += (depotPayload.ammo ?? 0) * quantity;
                depotPackage.fuel += (depotPayload.fuel ?? 0) * quantity;
                depotPackage.rations += (depotPayload.rations ?? 0) * quantity;
                depotPackage.parts += (depotPayload.parts ?? 0) * quantity;
            }
        }
        return {
            allocations: allocationSnapshots,
            depotPackage,
            totalSpend,
            remainingFunds: Math.max(0, this.allocationBudget - totalSpend),
            committedAt: new Date().toISOString()
        };
    }
    /**
     * Renders allocation rows for the provided category containers with current counts.
     */
    /**
     * Check if a unit type is allowed for purchase based on scenario restrictions.
     */
    isUnitAllowedByScenario(unitKey) {
        const { allowedUnits, restrictedUnits } = this.getScenarioUnitRestrictions();
        if (restrictedUnits.includes(unitKey)) {
            return false;
        }
        // Convoys are part of the core logistics loop, so missions keep at least one available
        // unless the scenario author explicitly blocks them.
        if (unitKey === "supplyConvoy") {
            return true;
        }
        if (allowedUnits.length > 0) {
            return allowedUnits.includes(unitKey);
        }
        return true;
    }
    getScenarioUnitRestrictions() {
        const scenario = this.scenarioSource;
        return {
            allowedUnits: Array.isArray(scenario.allowedUnits)
                ? scenario.allowedUnits.map((entry) => String(entry))
                : [],
            restrictedUnits: Array.isArray(scenario.restrictedUnits)
                ? scenario.restrictedUnits.map((entry) => String(entry))
                : []
        };
    }
    getMissionMinimumAllocationCount(optionKey) {
        if (optionKey === "supplyConvoy" && this.isUnitAllowedByScenario(optionKey)) {
            return 1;
        }
        return 0;
    }
    isAllocationVisible(option) {
        return option.visibleInAllocationUi !== false;
    }
    isAllocationImplemented(option) {
        return option.implemented !== false;
    }
    isDeployableAllocation(option) {
        return this.isAllocationImplemented(option) && findTemplateForUnitKey(option.key) !== null;
    }
    shouldApplyScenarioRestrictions(option) {
        return option.category === "units" && this.isDeployableAllocation(option);
    }
    rerenderAllocations() {
        const panelTargets = [
            [["units"], this.allocationUnitList],
            [["support"], this.allocationSupportList],
            [["logistics", "supplies"], this.allocationLogisticsList]
        ];
        panelTargets.forEach(([categories, container]) => {
            if (!container) {
                return;
            }
            const { restrictedUnits } = this.getScenarioUnitRestrictions();
            const filteredAllocations = allocationOptions.filter((option) => categories.includes(option.category)).filter((option) => {
                if (!this.isAllocationVisible(option)) {
                    return false;
                }
                if (restrictedUnits.includes(option.key)) {
                    return false;
                }
                // Campaign engagements: the strategic context is authoritative. Combat rows appear iff
                // forces are in position (cap > 0); consumables stay visible because the RP reserve can
                // always purchase sustainment. The scenario's static requisition whitelist is bypassed —
                // it describes the placeholder map, not the situation on the campaign map.
                if (this.engagementContext) {
                    return RESERVE_PURCHASABLE_KEYS.includes(option.key) || this.getEffectiveMaxQuantity(option) > 0;
                }
                if (!this.shouldApplyScenarioRestrictions(option)) {
                    return true;
                }
                return this.isUnitAllowedByScenario(option.key);
            }).sort((left, right) => Number(this.isAllocationImplemented(right)) - Number(this.isAllocationImplemented(left)));
            container.innerHTML = filteredAllocations
                .map((option) => this.renderAllocationItem(option, this.allocationCounts.get(option.key) ?? 0))
                .join("");
        });
    }
    /**
     * Attaches delegated event handlers to each allocation list so +/− controls update state.
     * We bind once per container and rely on a private flag to avoid duplicate listeners on re-render.
     */
    bindAllocationLists() {
        this.bindAllocationInteraction(this.allocationUnitList);
        this.bindAllocationInteraction(this.allocationSupportList);
        this.bindAllocationInteraction(this.allocationLogisticsList);
    }
    /**
     * Produces markup for a single allocation row including controls with accessibility metadata.
     */
    escapeAllocationHtml(value) {
        return value.replace(/[&<>"']/g, (char) => {
            switch (char) {
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case "\"":
                    return "&quot;";
                case "'":
                    return "&#39;";
                default:
                    return char;
            }
        });
    }
    renderAllocationChip(detail) {
        return `<span>${this.escapeAllocationHtml(detail)}</span>`;
    }
    renderAllocationItem(option, quantity) {
        const missionMinimum = this.getMissionMinimumAllocationCount(option.key);
        const unavailable = !this.isAllocationImplemented(option);
        const locked = this.unlockState.isUnitLocked(option.key);
        const effectiveMax = this.getEffectiveMaxQuantity(option);
        const decrementDisabled = unavailable || locked || quantity <= missionMinimum;
        const incrementDisabled = unavailable || locked || quantity >= effectiveMax;
        const totalCost = option.costPerUnit * quantity;
        const composition = Object.prototype.hasOwnProperty.call(unitComposition, option.key)
            ? unitComposition[option.key]
            : null;
        const compositionDisplay = buildAllocationCompositionDisplay(composition, { maxDetails: 5 });
        const missionMinimumBadge = missionMinimum > 0
            ? `<span class="allocation-lock" aria-label="${option.label} has a mission minimum of ${missionMinimum}.">Mission minimum ×${missionMinimum}</span>`
            : "";
        const committedCapBadge = this.engagementContext && !RESERVE_PURCHASABLE_KEYS.includes(option.key)
            ? `<span class="allocation-lock" aria-label="${option.label} limited to ${effectiveMax} by forces in position on the campaign map.">In position ×${effectiveMax}</span>`
            : "";
        const availabilityBadge = unavailable
            ? `<span class="allocation-lock" aria-label="${option.label} is planned but not yet implemented.">Planned feature</span>`
            : "";
        const lockIcon = locked ? `<span class="allocation-lock-icon" title="Locked">🔒</span>` : "";
        const unlockBadge = !unavailable && locked
            ? `<span class="allocation-lock allocation-lock--required" aria-label="${option.label} requires a roster unlock before you can requisition it.">🔒 Unlock required — Purchase to access</span>`
            : "";
        const controlsMarkup = unavailable
            ? `<div class="allocation-quantity allocation-quantity--disabled" role="group" aria-label="${option.label} availability"><span class="allocation-count">Pending</span></div>`
            : locked
                ? `<div class="allocation-quantity allocation-quantity--locked" role="group" aria-label="${option.label} unlock controls"><span class="allocation-count">🔒 Locked</span><a class="secondary-button allocation-unlock-link" href="${this.unlockState.buildPurchaseUrlForSku(option.key)}">Unlock</a></div>`
                : `<div class="allocation-quantity" role="group" aria-label="${option.label} quantity controls">
            <button
              type="button"
              class="allocation-btn"
              data-action="decrement"
              data-key="${option.key}"
              data-delta="-1"
              aria-label="Decrease ${option.label} (or press Minus key)"
              ${decrementDisabled ? "disabled" : ""}
            >−</button>
            <span class="allocation-count" aria-live="polite">${quantity}</span>
            <button
              type="button"
              class="allocation-btn"
              data-action="increment"
              data-key="${option.key}"
              data-delta="1"
              aria-label="Increase ${option.label} (or press Plus key)"
              ${incrementDisabled ? "disabled" : ""}
            >+</button>
          </div>`;
        const statusBadges = [missionMinimumBadge, committedCapBadge, availabilityBadge, unlockBadge]
            .filter((badge) => badge.length > 0)
            .join("");
        return `
      <li class="allocation-item" data-key="${option.key}" data-quantity="${quantity}" data-locked="${locked ? "true" : "false"}" data-unavailable="${unavailable ? "true" : "false"}">
        <div class="allocation-card-shell">
          <div class="allocation-visual">
            ${option.spriteUrl ? `<img src="${option.spriteUrl}" alt="${option.label}" class="allocation-thumb" />` : `<div class="allocation-fallback">${option.label.charAt(0)}</div>`}
          </div>
          <div class="allocation-copy">
            <div class="allocation-title-row">
              <h4>${lockIcon}${option.label}</h4>
              <span class="allocation-cost">${option.costPerUnit.toLocaleString()} RP</span>
            </div>
            <p class="allocation-copy__description">${option.description}</p>
            ${compositionDisplay.summary.length > 0
            ? `<div class="allocation-copy__details">${compositionDisplay.summary.map((detail) => this.renderAllocationChip(detail)).join("")}</div>`
            : ""}
            ${compositionDisplay.details.length > 0
            ? `<div class="allocation-copy__equipment">${compositionDisplay.details.map((detail) => this.renderAllocationChip(detail)).join("")}</div>`
            : ""}
            ${statusBadges.length > 0 ? `<div class="allocation-status-row">${statusBadges}</div>` : ""}
          </div>
          <div class="allocation-aside">
          ${controlsMarkup}
          <span class="allocation-total">${totalCost.toLocaleString()} RP</span>
          </div>
        </div>
      </li>
    `;
    }
    /**
     * Hooks click and keyboard handlers for a given allocation list to manage state updates.
     */
    bindAllocationInteraction(container) {
        if (!container) {
            return;
        }
        const allocationElement = container;
        if (allocationElement.__allocationListenersAttached) {
            return;
        }
        allocationElement.__allocationListenersAttached = true;
        container.addEventListener("click", (event) => this.handleAllocationContainerClick(event));
        container.addEventListener("keydown", (event) => this.handleAllocationContainerKeydown(event));
    }
    /**
     * Delegated click handler that routes plus/minus interactions to the state adjustment routine.
     */
    handleAllocationContainerClick(event) {
        const target = event.target;
        if (!target) {
            return;
        }
        const button = target.closest("button[data-action]");
        if (!button) {
            return;
        }
        const key = button.getAttribute("data-key") ?? button.closest("[data-key]")?.getAttribute("data-key");
        if (!key) {
            return;
        }
        const rawDelta = button.getAttribute("data-delta") ?? button.getAttribute("data-adjust");
        const parsedDelta = rawDelta ? Number(rawDelta) : button.dataset.action === "increment" ? 1 : -1;
        if (Number.isNaN(parsedDelta)) {
            console.warn(`Allocation control for key ${key} provided an invalid delta.`);
            return;
        }
        this.handleAllocationAdjustment(key, parsedDelta);
    }
    /**
     * Keyboard handler that enables ArrowUp/ArrowDown and Plus/Minus keys to adjust quantities.
     * Plus/Minus keys work globally when any allocation item is focused.
     */
    handleAllocationContainerKeydown(event) {
        const button = event.target;
        if (!button) {
            return;
        }
        const optionKey = button.getAttribute("data-key") ?? button.closest("[data-key]")?.getAttribute("data-key");
        const deltaAttr = button.getAttribute("data-delta") ?? button.getAttribute("data-adjust");
        // Arrow keys work on buttons with data-delta
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            if (optionKey && deltaAttr) {
                const delta = Number(deltaAttr);
                if (!Number.isNaN(delta)) {
                    this.handleAllocationAdjustment(optionKey, delta);
                }
            }
            return;
        }
        // Plus/Minus keys adjust quantities for the currently focused allocation item
        if (event.key === "+" || event.key === "=" || event.key === "NumpadAdd") {
            event.preventDefault();
            if (optionKey) {
                this.handleAllocationAdjustment(optionKey, 1);
            }
            return;
        }
        if (event.key === "-" || event.key === "_" || event.key === "NumpadSubtract") {
            event.preventDefault();
            if (optionKey) {
                this.handleAllocationAdjustment(optionKey, -1);
            }
            return;
        }
        if (button.matches("[data-action]") && optionKey) {
            const delta = deltaAttr ? Number(deltaAttr) : button.dataset.action === "increment" ? 1 : -1;
            if (!Number.isNaN(delta)) {
                this.handleAllocationAdjustment(optionKey, delta);
            }
        }
    }
    handleAllocationActionButton() {
        const preset = this.getActiveAllocationPreset();
        if (preset && !this.allocationDirty) {
            this.applyAllocationPreset(preset);
            return;
        }
        this.resetAllocations();
    }
    getActiveAllocationPreset() {
        if (!this.activeMissionKey) {
            return null;
        }
        return ALLOCATION_PRESETS.find((preset) => preset.missionKeys.includes(this.activeMissionKey)) ?? null;
    }
    syncAllocationActionButton() {
        if (!this.allocationResetButton) {
            return;
        }
        const preset = this.getActiveAllocationPreset();
        const shouldOfferPreset = preset !== null && !this.allocationDirty;
        const label = shouldOfferPreset ? preset.label : ALLOCATION_RESET_LABEL;
        this.allocationResetButton.textContent = label;
        this.allocationResetButton.setAttribute("aria-label", label);
        this.allocationResetButton.dataset.mode = shouldOfferPreset ? "preset" : "reset";
    }
    getAllocationQuantityFloor(optionKey) {
        return this.getMissionMinimumAllocationCount(optionKey);
    }
    restoreAllocationCountsToFloors() {
        for (const key of this.allocationCounts.keys()) {
            this.allocationCounts.set(key, this.getAllocationQuantityFloor(key));
        }
    }
    isAllocationAvailableForPreset(option) {
        if (!this.isAllocationVisible(option) || !this.isAllocationImplemented(option) || this.unlockState.isUnitLocked(option.key)) {
            return false;
        }
        const { restrictedUnits } = this.getScenarioUnitRestrictions();
        if (restrictedUnits.includes(option.key)) {
            return false;
        }
        if (this.shouldApplyScenarioRestrictions(option)) {
            return this.isUnitAllowedByScenario(option.key);
        }
        return true;
    }
    applyAllocationPreset(preset) {
        this.restoreAllocationCountsToFloors();
        this.seedRecommendedLogisticsAllocations();
        const skipped = [];
        const capped = [];
        preset.entries.forEach((entry) => {
            const option = getAllocationOption(entry.key);
            if (!option || !this.isAllocationAvailableForPreset(option)) {
                skipped.push(entry.key);
                return;
            }
            const floor = this.getAllocationQuantityFloor(entry.key);
            const requested = Math.max(floor, entry.quantity);
            const applied = Math.min(this.getEffectiveMaxQuantity(option), requested);
            if (applied < requested) {
                capped.push(option.label);
            }
            this.allocationCounts.set(entry.key, applied);
        });
        this.allocationDirty = true;
        this.rerenderAllocations();
        this.updateBudgetDisplay();
        this.completeTutorialAfterPresetAllocation();
        if (skipped.length > 0 || capped.length > 0) {
            const skippedText = skipped.length > 0 ? `Unavailable: ${skipped.join(", ")}.` : "";
            const cappedText = capped.length > 0 ? `Capped at maximum: ${capped.join(", ")}.` : "";
            this.allocationFeedbackElement.textContent = [preset.appliedMessage, skippedText, cappedText].filter(Boolean).join(" ");
            this.allocationFeedbackElement.classList.remove("feedback--ready");
            this.allocationFeedbackElement.classList.add("feedback--warning");
            return;
        }
        if (this.allocationBudget - this.calculateSpend() >= 0 && this.hasOperationalCombatForces()) {
            this.allocationFeedbackElement.textContent = preset.appliedMessage;
            this.allocationFeedbackElement.classList.remove("feedback--warning");
            this.allocationFeedbackElement.classList.add("feedback--ready");
        }
    }
    completeTutorialAfterPresetAllocation() {
        const tutorialState = ensureTutorialState();
        if (!tutorialState.isTutorialActive()) {
            return;
        }
        const currentPhase = tutorialState.getCurrentPhase();
        const presetEligiblePhases = [
            "budget_overview",
            "unit_categories",
            "select_infantry",
            "select_tanks",
            "select_engineers",
            "select_flak",
            "select_recon",
            "select_howitzer",
            "select_ammo",
            "select_fuel",
            "review_allocation"
        ];
        if (presetEligiblePhases.includes(currentPhase)) {
            tutorialState.jumpToPhase("review_allocation");
        }
    }
    /**
     * Adjusts allocation counts with clamping and triggers re-render flows.
     */
    handleAllocationAdjustment(optionKey, delta) {
        const option = getAllocationOption(optionKey);
        if (!option) {
            console.warn("Attempted to adjust unknown allocation option", optionKey);
            return;
        }
        if (!this.isAllocationImplemented(option)) {
            this.allocationFeedbackElement.classList.remove("feedback--ready");
            this.allocationFeedbackElement.classList.add("feedback--warning");
            this.allocationFeedbackElement.textContent = `${option.label} is planned but not yet implemented for precombat requisitioning.`;
            return;
        }
        if (this.unlockState.isUnitLocked(optionKey)) {
            this.allocationFeedbackElement.classList.remove("feedback--ready");
            this.allocationFeedbackElement.classList.add("feedback--warning");
            this.allocationFeedbackElement.textContent = `${option.label} requires an unlock before it can be requisitioned.`;
            return;
        }
        const current = this.allocationCounts.get(optionKey) ?? 0;
        const quantityFloor = this.getMissionMinimumAllocationCount(optionKey);
        const effectiveMax = this.getEffectiveMaxQuantity(option);
        const next = Math.max(quantityFloor, Math.min(effectiveMax, current + delta));
        if (next === current) {
            if (delta > 0 && this.engagementContext && current >= effectiveMax && effectiveMax < option.maxQuantity) {
                this.allocationFeedbackElement.classList.remove("feedback--ready");
                this.allocationFeedbackElement.classList.add("feedback--warning");
                this.allocationFeedbackElement.textContent = `${option.label}: only ${effectiveMax} in position on the campaign map. Move more forces adjacent to the battle hex to raise the cap.`;
            }
            return;
        }
        this.allocationCounts.set(optionKey, next);
        this.allocationDirty = true;
        this.rerenderAllocations();
        this.updateBudgetDisplay();
        // Surface over-budget risk via the feedback banner so the commander understands why proceeding is blocked.
        const remainingBudget = this.allocationBudget - this.calculateSpend();
        if (remainingBudget < 0) {
            this.allocationFeedbackElement.classList.add("feedback--warning");
        }
        else {
            this.allocationFeedbackElement.classList.remove("feedback--warning");
        }
        if (typeof console !== "undefined") {
            console.assert((this.allocationBudget - this.calculateSpend()) >= 0 || this.proceedToBattleButton?.disabled === true, "Budget gating failed to disable proceed button when over budget.");
        }
        // Advance tutorial if this action completes a tutorial step
        this.advanceTutorialIfNeeded(optionKey, next);
    }
    /**
     * Resets all allocation counts to mission floors and refreshes the UI.
     */
    resetAllocations() {
        this.restoreAllocationCountsToFloors();
        this.seedRecommendedLogisticsAllocations();
        this.allocationDirty = false;
        this.rerenderAllocations();
        this.updateBudgetDisplay();
        this.allocationFeedbackElement.textContent = "Allocate forces and supplies to prepare for deployment.";
    }
    /**
     * Updates budget labels, panel state, and proceed button gating.
     */
    updateBudgetDisplay() {
        const spent = this.calculateSpend();
        const remaining = this.allocationBudget - spent;
        this.budgetSpentElement.textContent = `Spent: ${spent.toLocaleString()} RP`;
        this.budgetRemainingElement.textContent = `Budget Remaining: ${Math.max(remaining, 0).toLocaleString()} requisition points`;
        this.budgetPanel.dataset.state = remaining < 0 ? "over-budget" : "within-budget";
        this.syncAllocationActionButton();
        const hasAnyForces = this.hasOperationalCombatForces();
        this.proceedToBattleButton.disabled = remaining < 0 || !hasAnyForces;
        // Normalize feedback styling before we decide which state to present so repeated calls cannot accumulate stale classes.
        this.allocationFeedbackElement.classList.remove("feedback--warning", "feedback--ready");
        if (remaining < 0) {
            this.allocationFeedbackElement.textContent = "Over requisition budget: adjust allocations before proceeding.";
            this.allocationFeedbackElement.classList.add("feedback--warning");
        }
        else if (!hasAnyForces) {
            this.allocationFeedbackElement.textContent = "Allocate at least one combat formation to continue.";
        }
        else {
            this.allocationFeedbackElement.textContent = "Requisition budget nominal. You may proceed when ready.";
            this.allocationFeedbackElement.classList.add("feedback--ready");
        }
        // Campaign gating: enforce economy-derived caps in addition to money budget when applicable.
        // When a structured engagement context exists, per-type caps are enforced at interaction level
        // and this coarse global gate is skipped.
        if (this.activeMissionKey === "campaign" && this.campaignCaps && !this.engagementContext) {
            // Units cap uses requisition quantities only (scenario-provided baselines do not consume campaign manpower).
            const unitOptions = ALLOCATION_BY_CATEGORY.get("units") ?? [];
            let requestedUnits = 0;
            unitOptions.forEach((option) => {
                requestedUnits += this.allocationCounts.get(option.key) ?? 0;
            });
            const airKeys = ["scoutPlaneWing", "fighter", "interceptorWing", "groundAttackWing", "bomber", "transportWing"];
            let requestedAir = 0;
            airKeys.forEach((key) => {
                requestedAir += this.allocationCounts.get(key) ?? 0;
            });
            const requestedAmmo = this.allocationCounts.get("ammo") ?? 0;
            const requestedFuel = this.allocationCounts.get("fuel") ?? 0;
            const over = [];
            if (requestedUnits > this.campaignCaps.manpowerUnits)
                over.push("units");
            if (requestedAir > this.campaignCaps.airSlots)
                over.push("air slots");
            if (requestedAmmo > this.campaignCaps.ammo)
                over.push("ammo");
            if (requestedFuel > this.campaignCaps.fuel)
                over.push("fuel");
            if (over.length > 0) {
                this.proceedToBattleButton.disabled = true;
                this.allocationFeedbackElement.classList.remove("feedback--ready");
                this.allocationFeedbackElement.classList.add("feedback--warning");
                this.allocationFeedbackElement.textContent = `Campaign caps exceeded: ${over.join(", ")}. Adjust allocations.`;
            }
            else if (remaining >= 0 && spent > 0) {
                this.allocationFeedbackElement.textContent = "Budget and campaign caps OK. You may proceed.";
                this.allocationFeedbackElement.classList.add("feedback--ready");
            }
        }
    }
    /**
     * Renders (or clears) the strategic-context banner above the budget panel: mission type,
     * battle hex, consumables reserve, and the banded outgunned warning. The banner never shows
     * exact enemy counts — intel stays estimate-grade by design.
     */
    renderEngagementContextBanner() {
        const existing = this.budgetPanel.querySelector("#engagementContextBanner");
        if (!this.engagementContext) {
            existing?.remove();
            return;
        }
        const context = this.engagementContext;
        const legacyRatio = describeForceRatio(context.forceRatio);
        const briefing = context.intelligenceBriefing;
        const assessedDanger = briefing
            ? briefing.resistanceBand === "heavy" || briefing.resistanceBand === "overwhelming"
            : legacyRatio.outgunned;
        const assessmentLabel = briefing?.summary ?? legacyRatio.label;
        const banner = existing ?? document.createElement("div");
        banner.id = "engagementContextBanner";
        banner.style.cssText = [
            "margin-bottom:0.75rem",
            "padding:0.6rem 0.8rem",
            "border-radius:8px",
            "line-height:1.45",
            "font-size:0.85rem",
            assessedDanger
                ? "background:rgba(180,83,9,0.18);border:1px solid rgba(245,196,109,0.55);color:#f5c46d"
                : "background:rgba(34,80,44,0.22);border:1px solid rgba(134,196,144,0.45);color:#b9e0c0"
        ].join(";");
        const committedGroups = context.availableForces.reduce((sum, group) => sum + group.count, 0);
        banner.innerHTML = `
      <strong style="display:block;letter-spacing:0.05em;text-transform:uppercase;">${MISSION_TYPE_LABELS[context.missionType]} — hex ${context.battleHexKey}</strong>
      <span style="display:block;">${committedGroups} formation group${committedGroups === 1 ? "" : "s"} in position · ${context.airSorties} air sortie${context.airSorties === 1 ? "" : "s"} in range · ${context.rpReserve.toLocaleString()} RP consumables reserve</span>
      <span style="display:block;${assessedDanger ? "font-weight:700;" : ""}">${assessmentLabel}</span>
      ${briefing ? `<span style="display:block;opacity:0.88;">Intel confidence: ${briefing.confidenceBand} · ${briefing.contacts.length} contact${briefing.contacts.length === 1 ? "" : "s"} · Unknown: ${briefing.explicitUnknowns.join(", ") || "none reported"}</span>` : ""}
    `;
        if (!existing) {
            this.budgetPanel.insertBefore(banner, this.budgetPanel.firstChild);
        }
    }
    /**
     * Preloads a small convoy package so logistics is part of the opening plan instead of a hidden
     * purchase the player only discovers after running dry in battle.
     */
    seedRecommendedLogisticsAllocations() {
        const convoyOption = getAllocationOption("supplyConvoy");
        if (!convoyOption || !this.isUnitAllowedByScenario(convoyOption.key)) {
            return;
        }
        const current = this.allocationCounts.get(convoyOption.key) ?? 0;
        const recommended = this.getRecommendedSupplyConvoyCount(convoyOption.maxQuantity);
        if (current < recommended) {
            this.allocationCounts.set(convoyOption.key, recommended);
        }
    }
    /**
     * Uses the planned frontage to size the default convoy package while keeping the opening cost light.
     */
    getRecommendedSupplyConvoyCount(maxQuantity) {
        let plannedFrontlineUnits = 0;
        (ALLOCATION_BY_CATEGORY.get("units") ?? []).forEach((option) => {
            if (option.key === "supplyConvoy" || !this.isUnitAllowedByScenario(option.key)) {
                return;
            }
            plannedFrontlineUnits += this.allocationCounts.get(option.key) ?? 0;
        });
        const recommended = plannedFrontlineUnits > 0
            ? Math.max(1, Math.ceil(plannedFrontlineUnits / 4))
            : 1;
        return Math.min(maxQuantity, recommended);
    }
    /**
     * Supply convoys support the force, but they should not count as the only formation required to
     * begin a tactical battle.
     */
    hasOperationalCombatForces() {
        return (ALLOCATION_BY_CATEGORY.get("units") ?? []).some((option) => {
            if (option.key === "supplyConvoy" || !this.isUnitAllowedByScenario(option.key)) {
                return false;
            }
            return (this.allocationCounts.get(option.key) ?? 0) > 0;
        });
    }
    /**
     * Presents the allocation warning overlay when the player attempts to proceed with no units.
     */
    showAllocationWarning() {
        this.allocationWarningOverlay.classList.remove("hidden");
        this.allocationWarningModal.setAttribute("aria-hidden", "false");
        // Move focus inside the modal so screen readers announce the warning content immediately.
        if (typeof this.allocationWarningModal.focus === "function") {
            this.allocationWarningModal.focus();
        }
        else {
            this.allocationWarningModal.setAttribute("tabindex", "-1");
            this.allocationWarningModal.focus();
        }
    }
    /**
     * Hides the allocation warning overlay.
     */
    hideAllocationWarning() {
        this.allocationWarningOverlay.classList.add("hidden");
        this.allocationWarningModal.setAttribute("aria-hidden", "true");
    }
    /**
     * Calculates the cumulative allocation spend for reuse across rendering helpers.
     */
    calculateSpend() {
        let spent = 0;
        for (const [key, quantity] of this.allocationCounts.entries()) {
            const option = getAllocationOption(key);
            if (!option) {
                console.warn("Missing allocation option during budget update", key);
                continue;
            }
            spent += option.costPerUnit * quantity;
        }
        return spent;
    }
    /**
     * Aggregates scenario-provided player and allied units into a read-only roster for display
     * in the objectives panel. These units are NOT surfaced as interactive requisition tiles.
     */
    seedPredeployedAllocations() {
        this.predeployedRoster.clear();
        const rawUnits = (this.scenarioSource.sides?.Player?.units ?? []);
        const playerUnits = rawUnits.filter((u) => u.preDeployed === true);
        const alliedUnits = (this.scenarioSource.sides?.Ally?.units ?? []);
        const deploymentState = ensureDeploymentState();
        // Predeployed Player units are placed by the engine via scenario data. They are tracked here
        // for read-only display only — they must NOT appear as interactive requisition tiles.
        playerUnits.forEach((unit) => {
            const scenarioType = unit.type;
            const allocationKey = deploymentState.getUnitKeyForScenarioType(scenarioType) ?? scenarioType;
            const option = getAllocationOption(allocationKey);
            const label = option?.label ?? this.formatScenarioLabel(scenarioType);
            const rosterKey = `Player:${allocationKey}`;
            const existing = this.predeployedRoster.get(rosterKey);
            this.predeployedRoster.set(rosterKey, {
                label,
                scenarioType,
                count: (existing?.count ?? 0) + 1
            });
        });
        alliedUnits.forEach((unit) => {
            const scenarioType = unit.type;
            const allocationKey = deploymentState.getUnitKeyForScenarioType(scenarioType) ?? scenarioType;
            const option = getAllocationOption(allocationKey);
            const label = `Allied ${option?.label ?? this.formatScenarioLabel(scenarioType)}`;
            const rosterKey = `Ally:${allocationKey}`;
            const existing = this.predeployedRoster.get(rosterKey);
            this.predeployedRoster.set(rosterKey, {
                label,
                scenarioType,
                count: (existing?.count ?? 0) + 1
            });
        });
    }
    /**
     * Computes campaign-driven caps from the stored bridge snapshot (scenario + economies).
     * Air cap comes from total airSortieCapacity across player-controlled airbases.
     * Manpower/supplies/fuel caps are coarse-grained conversions to allocation counts.
     */
    computeCampaignCaps() {
        const bridge = this.battleState.getCampaignBridgeState?.();
        if (!bridge || !bridge.scenario) {
            this.campaignCaps = null;
            return;
        }
        const scenario = bridge.scenario;
        const economy = (scenario.economies ?? []).find((e) => e.faction === "Player");
        if (!economy) {
            this.campaignCaps = null;
            return;
        }
        let airSlots = 0;
        const palette = scenario.tilePalette || {};
        (scenario.tiles || []).forEach((instance) => {
            const def = palette[instance.tile];
            const owner = instance.factionControl ?? def?.factionControl;
            if (def && owner === "Player" && def.role === "airbase") {
                airSlots += def.airSortieCapacity ?? 0;
            }
        });
        const manpowerUnits = Math.max(0, Math.floor((economy.manpower ?? 0) / 10));
        const ammo = Math.max(0, Math.floor((economy.supplies ?? 0) / 10));
        const fuel = Math.max(0, Math.floor((economy.fuel ?? 0) / 10));
        this.campaignCaps = { manpowerUnits, airSlots, ammo, fuel };
    }
    /**
     * Appends allied in-theater forces as a compact Secondary objective line so the objectives list
     * remains the single source of mission context without a separate panel.
     */
    appendAlliedForcesObjective() {
        const playerEntries = Array.from(this.predeployedRoster.entries())
            .filter(([key]) => key.startsWith("Player:"))
            .map(([, entry]) => entry);
        const alliedEntries = Array.from(this.predeployedRoster.entries())
            .filter(([key]) => key.startsWith("Ally:"))
            .map(([, entry]) => entry);
        const allEntries = [...playerEntries, ...alliedEntries];
        if (allEntries.length === 0) {
            return;
        }
        // Build a compact RP-value summary so the player understands the balance context without
        // confusing predeployed forces for requisitioned ones.
        let totalRpValue = 0;
        const unitDescriptions = [];
        allEntries.forEach((entry) => {
            const option = getAllocationOption(this.resolveAllocationKeyFromLabel(entry.scenarioType));
            const rpPerUnit = option?.costPerUnit ?? 0;
            totalRpValue += rpPerUnit * entry.count;
            const displayLabel = entry.label.replace(/^Allied\s+/i, "");
            unitDescriptions.push(entry.count > 1 ? `${entry.count}× ${displayLabel}` : displayLabel);
        });
        const rpNote = totalRpValue > 0 ? ` (RP value: ${totalRpValue.toLocaleString()})` : "";
        const alliedPrefix = alliedEntries.length > 0 && playerEntries.length === 0
            ? "Make contact with and take command of allied forces in theater"
            : "Forces already in theater";
        const objectiveText = `${alliedPrefix}: ${unitDescriptions.join(", ")}${rpNote}.`;
        const li = document.createElement("li");
        li.className = "mission-order-item mission-order-item--secondary";
        li.innerHTML = `<strong>Secondary:</strong> <span class="mission-order-copy">${objectiveText}</span>`;
        this.objectiveListElement.appendChild(li);
    }
    /**
     * Resolves an allocation key from a scenario unit type string for RP cost lookups.
     */
    resolveAllocationKeyFromLabel(scenarioType) {
        const deploymentState = ensureDeploymentState();
        return deploymentState.getUnitKeyForScenarioType(scenarioType) ?? scenarioType;
    }
    /**
     * Provides a readable fallback label when allocation metadata is unavailable for a scenario unit type.
     */
    formatScenarioLabel(scenarioType) {
        return scenarioType
            .replace(/_/g, " ")
            .replace(/\w\S*/g, (fragment) => fragment.charAt(0).toUpperCase() + fragment.slice(1).toLowerCase());
    }
    /**
     * Populates the mission briefing panel with objectives, timeline, and logistical expectations.
     */
    renderMissionSummary(missionKey, selectedDifficulty) {
        const title = getMissionTitle(missionKey);
        const briefing = getMissionBriefing(missionKey);
        const summary = getMissionSummaryPackage(missionKey, selectedDifficulty);
        const missionRules = createMissionRulesController(missionKey, this.miniMapScenario, selectedDifficulty);
        const missionRuleObjectives = missionRules.getStatus().objectives;
        const objectives = missionRuleObjectives.length > 0
            ? missionRuleObjectives.map((objective) => `${this.formatScenarioLabel(objective.tier)}: ${objective.label}`)
            : [...summary.objectives];
        const scenarioTurnLimit = typeof this.miniMapScenario.turnLimit === "number" && this.miniMapScenario.turnLimit > 0
            ? this.miniMapScenario.turnLimit
            : null;
        const authoredTurnLimit = getMissionTurnLimit(missionKey, selectedDifficulty);
        const effectiveTurnLimit = authoredTurnLimit > 0 ? authoredTurnLimit : scenarioTurnLimit;
        this.missionTitleElement.textContent = title;
        this.missionBriefingElement.textContent = briefing;
        this.objectiveListElement.innerHTML = objectives
            .map((objective, index) => {
            const parsed = this.parseMissionObjective(objective);
            const primaryClass = parsed.tier === "primary" || (parsed.tier === "other" && index === 0)
                ? " mission-order-item--primary"
                : "";
            const labelMarkup = parsed.label
                ? `<strong>${parsed.label}:</strong>`
                : "";
            return `<li class="mission-order-item mission-order-item--${parsed.tier}${primaryClass}">${labelMarkup}${labelMarkup ? " " : ""}<span class="mission-order-copy">${parsed.text}</span></li>`;
        })
            .join("");
        this.missionTurnLimitElement.textContent = effectiveTurnLimit !== null ? `${effectiveTurnLimit} turns` : "Pending";
        const visibleMissionAssets = this.filterMissionAssetsForBriefing(summary.supplies);
        if (this.baselineSupplySectionElement) {
            this.baselineSupplySectionElement.classList.toggle("hidden", visibleMissionAssets.length === 0);
        }
        this.baselineSupplyListElement.innerHTML = visibleMissionAssets
            .map((item) => `<li><strong>${item.label}</strong><span>${item.amount}</span></li>`)
            .join("");
        this.doctrineNotesElement.textContent = summary.doctrine;
        const missionInfo = {
            missionKey,
            title,
            briefing,
            objectives,
            doctrine: summary.doctrine,
            turnLimit: effectiveTurnLimit,
            baselineSupplies: summary.supplies
        };
        this.battleState.setPrecombatMissionInfo(missionInfo);
    }
    parseMissionObjective(objective) {
        const matched = objective.match(/^(Primary|Secondary|Tertiary):\s*(.+)$/i);
        if (!matched) {
            return {
                label: null,
                text: objective,
                tier: "other"
            };
        }
        const [, rawLabel, text] = matched;
        const normalizedTier = rawLabel.toLowerCase();
        return {
            label: rawLabel,
            text,
            tier: normalizedTier
        };
    }
    filterMissionAssetsForBriefing(supplies) {
        const duplicateAssetPatterns = [
            /budget/i,
            /garrison/i,
            /baseline forces/i,
            /predeployed/i,
            /operational window/i,
            /^duration$/i
        ];
        return supplies.filter((item) => duplicateAssetPatterns.every((pattern) => !pattern.test(item.label.trim())));
    }
    renderMiniMap() {
        this.miniMapRenderer.render(this.miniMapSvg, this.miniMapCanvas, this.miniMapScenario);
        const mapPreview = this.miniMapCanvas.closest(".map-preview");
        if (mapPreview) {
            mapPreview.style.aspectRatio = `${this.miniMapScenario.size.cols} / ${this.miniMapScenario.size.rows}`;
        }
        this.miniMapCanvas.style.width = "100%";
        this.miniMapCanvas.style.height = "100%";
        this.miniMapSvg.removeAttribute("width");
        this.miniMapSvg.removeAttribute("height");
        this.miniMapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        this.miniMapSvg.style.width = "100%";
        this.miniMapSvg.style.height = "100%";
        this.miniMapSvg.style.overflow = "visible";
        const terrainSprites = Array.from(this.miniMapSvg.querySelectorAll(".terrain-sprite"));
        terrainSprites.forEach((sprite) => sprite.remove());
        const hexTiles = Array.from(this.miniMapSvg.querySelectorAll(".hex-tile"));
        hexTiles.forEach((polygon) => {
            const hexCell = polygon.closest(".hex-cell");
            const terrainKey = hexCell?.dataset.terrain ?? hexCell?.dataset.terrainType ?? "";
            const fill = this.getMiniMapTerrainFill(terrainKey, polygon.getAttribute("fill"));
            polygon.setAttribute("fill", fill);
            polygon.setAttribute("fill-opacity", "0.92");
            polygon.setAttribute("stroke", "#272319");
            polygon.setAttribute("stroke-width", "0.9");
            polygon.setAttribute("vector-effect", "non-scaling-stroke");
            polygon.style.paintOrder = "stroke fill";
        });
        const terrainOverlays = Array.from(this.miniMapSvg.querySelectorAll(".terrain-feature-overlay"));
        terrainOverlays.forEach((overlay) => overlay.setAttribute("opacity", "0.9"));
        return true;
    }
    requestMiniMapRender(attempt = 0) {
        if (typeof window === "undefined") {
            this.renderMiniMap();
            return;
        }
        if (this.miniMapRenderFrame !== null) {
            window.cancelAnimationFrame(this.miniMapRenderFrame);
            this.miniMapRenderFrame = null;
        }
        if (this.miniMapRetryTimer !== null) {
            window.clearTimeout(this.miniMapRetryTimer);
            this.miniMapRetryTimer = null;
        }
        this.miniMapRenderFrame = window.requestAnimationFrame(() => {
            this.miniMapRenderFrame = window.requestAnimationFrame(() => {
                this.miniMapRenderFrame = null;
                const rendered = this.renderMiniMap();
                if (!rendered && attempt < this.miniMapRetryLimit) {
                    this.miniMapRetryTimer = window.setTimeout(() => {
                        this.miniMapRetryTimer = null;
                        this.requestMiniMapRender(attempt + 1);
                    }, 50);
                }
            });
        });
    }
    getMiniMapTerrainFill(terrainKey, fallbackFill) {
        const normalized = terrainKey.trim().toLowerCase();
        if (normalized.includes("water") || normalized.includes("river")) {
            return "#5f7580";
        }
        if (normalized.includes("forest") || normalized.includes("woods")) {
            return "#5a6648";
        }
        if (normalized.includes("hill") || normalized.includes("ridge") || normalized.includes("mount")) {
            return "#7a6849";
        }
        if (normalized.includes("urban") ||
            normalized.includes("town") ||
            normalized.includes("hamlet") ||
            normalized.includes("city") ||
            normalized.includes("village")) {
            return "#8a775d";
        }
        if (normalized.includes("road") || normalized.includes("bridge")) {
            return "#8b7a58";
        }
        if (normalized.includes("swamp") || normalized.includes("marsh")) {
            return "#66705d";
        }
        if (normalized.includes("sand") || normalized.includes("desert")) {
            return "#a08c64";
        }
        if (normalized.includes("snow") || normalized.includes("ice")) {
            return "#c2c3b6";
        }
        if (normalized.includes("field") || normalized.includes("plain") || normalized.includes("grass")) {
            return "#867950";
        }
        return fallbackFill ?? "#7f7250";
    }
    /**
     * Builds a normalized ScenarioData for the minimap renderer using the shared scenarioNormalizer.
     * Delegates to normalizeScenarioSource so the minimap and battle screen use identical tile, palette,
     * unit, and objective normalization — eliminating the previous split-brain where each screen had
     * its own divergent copy of this logic.
     */
    buildMiniMapScenario(source) {
        const missionKey = this.activeMissionKey ?? "training";
        return normalizeScenarioSource(JSON.parse(JSON.stringify(source)), { turnLimit: getMissionTurnLimit(missionKey, this.activeDifficulty) });
    }
    /**
     * Helper that throws when required DOM is missing so initialization fails fast.
     */
    requireElement(selector) {
        const element = this.element.querySelector(selector);
        if (!element) {
            throw new Error(`Required precombat element not found: ${selector}`);
        }
        return element;
    }
}
