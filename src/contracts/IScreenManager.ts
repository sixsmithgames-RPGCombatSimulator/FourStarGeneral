/**
 * Interface for managing screen transitions and visibility in the application.
 * Decouples screen implementations from the management logic.
 */
export interface IScreenManager {
  /** Shows an input-blocking, player-facing status while a heavyweight destination is prepared. */
  beginTransition?(message: string): void;

  /** Clears a transition status when preparation fails before a destination can be shown. */
  endTransition?(): void;

  /**
   * Shows the specified screen element and hides all others.
   * @param screen - The HTMLElement representing the screen to display
   */
  showScreen(screen: HTMLElement): void;

  /**
   * Shows a screen by its registered ID.
   * @param id - The unique identifier of the screen
   */
  showScreenById(id: string): void;

  /**
   * Returns the currently visible screen element, or null if none is active.
   */
  getCurrentScreen(): HTMLElement | null;
}
