import type { IScreenManager } from "../../contracts/IScreenManager";

/**
 * Manages screen transitions and visibility across the application.
 * Ensures only one screen is visible at a time.
 */
export class ScreenManager implements IScreenManager {
  private currentScreen: HTMLElement | null = null;
  private readonly screens: Map<string, HTMLElement> = new Map();

  /**
   * Registers a screen element with a unique identifier.
   * @param id - Unique identifier for the screen
   * @param screen - The HTML element representing the screen
   */
  registerScreen(id: string, screen: HTMLElement): void {
    this.screens.set(id, screen);
  }

  /**
   * Shows the specified screen and hides all others.
   * Triggers a fade-in animation for smooth transitions.
   * @param screen - The screen element to display
   */
  showScreen(screen: HTMLElement): void {
    // Proactively hide every registered screen so a stale layout cannot leak into the active view.
    this.screens.forEach((registeredScreen) => {
      if (registeredScreen === screen) {
        return;
      }
      registeredScreen.classList.add("hidden");
      registeredScreen.classList.remove("screen-entering");
      registeredScreen.setAttribute("aria-hidden", "true");
    });

    // Reveal the requested screen after the cleanup pass.
    screen.classList.remove("hidden");
    screen.setAttribute("aria-hidden", "false");

    // Retrigger animation without forcing a synchronous layout of the newly revealed screen.
    // The campaign map can contain a large SVG; reading offsetWidth here made entering the
    // campaign block the browser main thread while it laid out the entire operational map.
    screen.classList.remove("screen-entering");
    this.currentScreen = screen;
    requestAnimationFrame(() => {
      if (this.currentScreen === screen) {
        screen.classList.add("screen-entering");
      }
    });
  }

  /**
   * Shows a screen by its registered ID.
   * @param id - The unique identifier of the screen
   */
  showScreenById(id: string): void {
    const screen = this.screens.get(id);
    if (!screen) {
      throw new Error(`Screen with id "${id}" not found. Did you register it?`);
    }
    this.showScreen(screen);
    document.dispatchEvent(new CustomEvent("screen:shown", {
      detail: {
        id,
        element: screen
      }
    }));
  }

  /**
   * Returns the currently visible screen element.
   */
  getCurrentScreen(): HTMLElement | null {
    return this.currentScreen;
  }

  /**
   * Hides all registered screens.
   */
  hideAllScreens(): void {
    this.screens.forEach((screen) => {
      screen.classList.add("hidden");
      screen.setAttribute("aria-hidden", "true");
    });
    this.currentScreen = null;
  }
}
