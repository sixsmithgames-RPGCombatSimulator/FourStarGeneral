/**
 * Interface for managing popup dialogs and overlays.
 * Provides a contract for popup lifecycle management.
 */
export type PopupKey =
  | "baseOperations"
  | "recon"
  | "reconIntel"
  | "logistics"
  | "supplies"
  | "airSupport"
  | "armyRoster"
  | "generalProfile"
  | "support"
  | "intelligence"
  | string; // Allow extensibility

/**
 * Controllers that mirror popup activity into auxiliary UI (e.g., sidebar buttons).
 */
export interface SidebarController {
  /** Updates active-state styling to reflect the currently displayed popup. */
  syncActiveState(activeKey: PopupKey | null): void;
}

export interface IPopupManager {
  /**
   * Opens a popup by its key identifier.
   * @param key - The unique identifier for the popup
   * @param trigger - Optional button element that triggered the popup (for focus restoration)
   */
  openPopup(key: PopupKey, trigger?: HTMLButtonElement): void;

  /**
   * Closes the currently active popup and restores focus to the trigger button.
   */
  closePopup(): void;

  /**
   * Returns the key of the currently active popup, or null if no popup is open.
   */
  getActivePopup(): PopupKey | null;

  /**
   * Registers a sidebar controller so popup transitions can toggle active button styling.
   */
  registerSidebarController(controller: SidebarController): void;

  /**
   * Generates a roster snapshot describing deployed units, reserves, and remaining counts.
   */
  buildRosterSnapshot(): RosterSnapshot;
}

export interface RosterSnapshotEntry {
  unitKey: string;
  label: string;
  strength: number;
  experience: number;
  ammo: number;
  fuel: number | null;
  status: "deployed" | "reserves" | "support" | "exhausted";
  supportCategory?: string;
  sprite?: string;
}

export interface RosterSnapshot {
  deployed: RosterSnapshotEntry[];
  reserves: RosterSnapshotEntry[];
  support: RosterSnapshotEntry[];
  exhausted: RosterSnapshotEntry[];
  totalDeployed: number;
  totalReserves: number;
  totalSupport: number;
}
