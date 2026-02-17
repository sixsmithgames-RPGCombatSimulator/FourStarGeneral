import type { WarRoomData } from "../../data/warRoomTypes";

/**
 * Lightweight interface describing the data bridge that feeds the War Room overlay.
 * Implementations typically wrap `BattleState` or scenario scripting modules.
 */
export interface WarRoomDataProvider {
  /**
   * Provides the latest snapshot rendered inside the overlay.
   */
  getSnapshot(): WarRoomData;

  /**
   * Optional subscription hook. When implemented, returns an unsubscribe function.
   */
  subscribe?(listener: () => void): () => void;

  /**
   * Optional notifier so UI code can proactively trigger downstream listeners after state mutations.
   */
  publishUpdate?(): void;

  /**
   * Optional disposal hook allowing overlays to release provider-held resources when torn down.
   */
  dispose?(): void;
}
