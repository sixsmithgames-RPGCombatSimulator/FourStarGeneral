/**
 * Interface for managing screen transitions and visibility in the application.
 * Decouples screen implementations from the management logic.
 */
export interface IScreenManager {
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
