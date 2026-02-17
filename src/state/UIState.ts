import type { PopupKey } from "../contracts/IPopupManager";
import {
  getMissionTitle,
  getMissionBriefing,
  isValidMission,
  getAllMissionKeys
} from "../data/missions";
import type { BotDifficulty } from "../game/bot/BotPlanner";

/**
 * Mission type identifiers for the landing screen.
 */
export type MissionKey = "training" | "patrol" | "assault" | "campaign" | string;

/**
 * Centralized UI state management for the application.
 * Stores global UI state like selected mission, general, and popup status.
 */
export class UIState {
  private _selectedMission: MissionKey | null = null;
  private _selectedGeneralId: string | null = null;
  private _activePopup: PopupKey | null = null;
  private _selectedDifficulty: BotDifficulty = "Normal";

  private static readonly SELECTED_GENERAL_STORAGE_KEY = "selectedGeneralId";
  private static readonly DIFFICULTY_STORAGE_KEY = "selectedDifficulty";

  constructor() {
    this.loadGeneralSelectionFromStorage();
    this.loadDifficultyFromStorage();
  }

  /**
   * Gets the currently selected mission.
   */
  get selectedMission(): MissionKey | null {
    return this._selectedMission;
  }

  /**
   * Sets the currently selected mission.
   */
  set selectedMission(mission: MissionKey | null) {
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
  get selectedGeneralId(): string | null {
    return this._selectedGeneralId;
  }

  /**
   * Sets the currently selected general ID and persists to localStorage.
   */
  set selectedGeneralId(generalId: string | null) {
    this._selectedGeneralId = generalId;
    if (generalId) {
      window.localStorage.setItem(UIState.SELECTED_GENERAL_STORAGE_KEY, generalId);
    } else {
      window.localStorage.removeItem(UIState.SELECTED_GENERAL_STORAGE_KEY);
    }
  }

  /**
   * Gets the currently active popup key.
   */
  get activePopup(): PopupKey | null {
    return this._activePopup;
  }

  /**
   * Sets the currently active popup key.
   */
  set activePopup(popup: PopupKey | null) {
    this._activePopup = popup;
  }

  /**
   * Gets the currently selected difficulty level.
   */
  get selectedDifficulty(): BotDifficulty {
    return this._selectedDifficulty;
  }

  /**
   * Sets the difficulty level and persists to localStorage.
   */
  set selectedDifficulty(difficulty: BotDifficulty) {
    this._selectedDifficulty = difficulty;
    window.localStorage.setItem(UIState.DIFFICULTY_STORAGE_KEY, difficulty);
  }

  /**
   * Loads the difficulty setting from localStorage on initialization.
   */
  private loadDifficultyFromStorage(): void {
    const stored = window.localStorage.getItem(UIState.DIFFICULTY_STORAGE_KEY);
    if (stored && (stored === "Easy" || stored === "Normal" || stored === "Hard")) {
      this._selectedDifficulty = stored as BotDifficulty;
    }
  }

  /**
   * Loads the selected general from localStorage on initialization.
   */
  private loadGeneralSelectionFromStorage(): void {
    const stored = window.localStorage.getItem(UIState.SELECTED_GENERAL_STORAGE_KEY);
    if (stored && typeof stored === "string") {
      this._selectedGeneralId = stored;
    }
  }

  /**
   * Clears the selected general from both state and storage.
   */
  clearGeneralSelection(): void {
    this._selectedGeneralId = null;
    window.localStorage.removeItem(UIState.SELECTED_GENERAL_STORAGE_KEY);
  }

  /**
   * Checks if both a mission and general are selected.
   */
  canProceedToPrecombat(): boolean {
    if (!this._selectedMission || !this._selectedGeneralId) {
      return false;
    }

    return UIState.isValidMission(this._selectedMission);
  }

  /**
   * Gets the title of the currently selected mission.
   * @returns Mission title or empty string if no mission selected
   */
  getSelectedMissionTitle(): string {
    if (!this._selectedMission) {
      return "";
    }

    try {
      return getMissionTitle(this._selectedMission);
    } catch (error) {
      console.error("Failed to resolve mission title", error);
      return "";
    }
  }

  /**
   * Gets the briefing text of the currently selected mission.
   * @returns Mission briefing or empty string if no mission selected
   */
  getSelectedMissionBriefing(): string {
    if (!this._selectedMission) {
      return "";
    }

    try {
      return getMissionBriefing(this._selectedMission);
    } catch (error) {
      console.error("Failed to resolve mission briefing", error);
      return "";
    }
  }

  /**
   * Validates a mission key.
   * @param key - Mission key to validate
   * @returns True if mission exists
   */
  static isValidMission(key: string): boolean {
    return isValidMission(key);
  }

  /**
   * Retrieves all available mission keys.
   * Enables UI layers to iterate missions without duplicating data imports.
   */
  static getMissionKeys(): MissionKey[] {
    return getAllMissionKeys();
  }
}
