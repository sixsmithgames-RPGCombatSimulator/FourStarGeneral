import { getMissionTitle, getMissionBriefing, isValidMission, getAllMissionKeys } from "../data/missions";
/**
 * Centralized UI state management for the application.
 * Stores global UI state like selected mission, general, and popup status.
 */
export class UIState {
    constructor() {
        this._selectedMission = null;
        this._selectedGeneralId = null;
        this._activePopup = null;
        this._selectedDifficulty = "Normal";
        this._battleAnimationMode = "regular";
        this._isFromCampaign = false;
        this.loadGeneralSelectionFromStorage();
        this.loadDifficultyFromStorage();
        this.loadBattleAnimationModeFromStorage();
    }
    /**
     * Gets the currently selected mission.
     */
    get selectedMission() {
        return this._selectedMission;
    }
    /**
     * Sets the currently selected mission.
     */
    set selectedMission(mission) {
        if (mission === null) {
            this._selectedMission = null;
            return;
        }
        if (!UIState.isValidMission(mission)) {
            throw new Error(`Attempted to select unknown mission key: ${mission}`);
        }
        this._selectedMission = mission;
    }
    /**
     * Gets the currently selected general ID.
     */
    get selectedGeneralId() {
        return this._selectedGeneralId;
    }
    /**
     * Sets the currently selected general ID and persists to localStorage.
     */
    set selectedGeneralId(generalId) {
        this._selectedGeneralId = generalId;
        if (generalId) {
            window.localStorage.setItem(UIState.SELECTED_GENERAL_STORAGE_KEY, generalId);
        }
        else {
            window.localStorage.removeItem(UIState.SELECTED_GENERAL_STORAGE_KEY);
        }
    }
    /**
     * Gets the currently active popup key.
     */
    get activePopup() {
        return this._activePopup;
    }
    /**
     * Sets the currently active popup key.
     */
    set activePopup(popup) {
        this._activePopup = popup;
    }
    /**
     * Gets the currently selected difficulty level.
     */
    get selectedDifficulty() {
        return this._selectedDifficulty;
    }
    /**
     * Sets the difficulty level and persists to localStorage.
     */
    set selectedDifficulty(difficulty) {
        this._selectedDifficulty = difficulty;
        window.localStorage.setItem(UIState.DIFFICULTY_STORAGE_KEY, difficulty);
    }
    /**
     * Gets the current battle movement animation mode.
     */
    get battleAnimationMode() {
        return this._battleAnimationMode;
    }
    /**
     * Sets the battle movement animation mode and persists it for future missions.
     */
    set battleAnimationMode(mode) {
        if (!UIState.isBattleAnimationMode(mode)) {
            throw new Error(`Attempted to select unknown battle animation mode: ${mode}`);
        }
        this._battleAnimationMode = mode;
        window.localStorage.setItem(UIState.BATTLE_ANIMATION_MODE_STORAGE_KEY, mode);
    }
    /**
     * Loads the difficulty setting from localStorage on initialization.
     */
    loadDifficultyFromStorage() {
        const stored = window.localStorage.getItem(UIState.DIFFICULTY_STORAGE_KEY);
        if (stored && (stored === "Easy" || stored === "Normal" || stored === "Hard")) {
            this._selectedDifficulty = stored;
        }
    }
    /**
     * Loads the battle animation mode from localStorage on initialization.
     */
    loadBattleAnimationModeFromStorage() {
        const stored = window.localStorage.getItem(UIState.BATTLE_ANIMATION_MODE_STORAGE_KEY);
        if (UIState.isBattleAnimationMode(stored)) {
            this._battleAnimationMode = stored;
        }
    }
    /**
     * Loads the selected general from localStorage on initialization.
     */
    loadGeneralSelectionFromStorage() {
        const stored = window.localStorage.getItem(UIState.SELECTED_GENERAL_STORAGE_KEY);
        if (stored && typeof stored === "string") {
            this._selectedGeneralId = stored;
        }
    }
    /**
     * Clears the selected general from both state and storage.
     */
    clearGeneralSelection() {
        this._selectedGeneralId = null;
        window.localStorage.removeItem(UIState.SELECTED_GENERAL_STORAGE_KEY);
    }
    /**
     * Checks if both a mission and general are selected.
     */
    canProceedToPrecombat() {
        if (!this._selectedMission || !this._selectedGeneralId) {
            return false;
        }
        return UIState.isValidMission(this._selectedMission);
    }
    /**
     * Gets the title of the currently selected mission.
     * @returns Mission title or empty string if no mission selected
     */
    getSelectedMissionTitle() {
        if (!this._selectedMission) {
            return "";
        }
        try {
            return getMissionTitle(this._selectedMission);
        }
        catch (error) {
            console.error("Failed to resolve mission title", error);
            return "";
        }
    }
    /**
     * Gets the briefing text of the currently selected mission.
     * @returns Mission briefing or empty string if no mission selected
     */
    getSelectedMissionBriefing() {
        if (!this._selectedMission) {
            return "";
        }
        try {
            return getMissionBriefing(this._selectedMission);
        }
        catch (error) {
            console.error("Failed to resolve mission briefing", error);
            return "";
        }
    }
    /**
     * Gets whether the current mission was started from the campaign screen.
     */
    get isFromCampaign() {
        return this._isFromCampaign;
    }
    /**
     * Sets whether the mission was started from the campaign screen.
     * This determines where to route after mission completion.
     */
    set isFromCampaign(value) {
        this._isFromCampaign = value;
    }
    /**
     * Validates a mission key.
     * @param key - Mission key to validate
     * @returns True if mission exists
     */
    static isValidMission(key) {
        return isValidMission(key);
    }
    static isBattleAnimationMode(value) {
        return value === "regular" || value === "quick";
    }
    /**
     * Retrieves all available mission keys.
     * Enables UI layers to iterate missions without duplicating data imports.
     */
    static getMissionKeys() {
        return getAllMissionKeys();
    }
}
UIState.SELECTED_GENERAL_STORAGE_KEY = "selectedGeneralId";
UIState.DIFFICULTY_STORAGE_KEY = "selectedDifficulty";
UIState.BATTLE_ANIMATION_MODE_STORAGE_KEY = "battleAnimationMode";
