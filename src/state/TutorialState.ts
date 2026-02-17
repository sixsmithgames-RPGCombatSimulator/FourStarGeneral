/**
 * TutorialState manages the tutorial progression and step tracking.
 * Uses a singleton pattern to maintain consistent tutorial state across components.
 */

export type TutorialPhase =
  | "inactive"
  | "welcome"
  | "budget_overview"
  | "unit_categories"
  | "select_infantry"
  | "adjust_quantity"
  | "select_tanks"
  | "select_support"
  | "review_allocation"
  | "proceed_to_battle"
  | "deployment_intro"
  | "place_units"
  | "base_camp"
  | "begin_battle"
  | "movement_intro"
  | "attack_intro"
  | "turn_end"
  | "complete";

export interface TutorialStep {
  readonly phase: TutorialPhase;
  readonly title: string;
  readonly content: string;
  readonly highlightSelector?: string;
  readonly position: "top" | "bottom" | "left" | "right" | "center";
  readonly actionLabel?: string;
  readonly waitForAction?: boolean;
  readonly arrowDirection?: "up" | "down" | "left" | "right";
}

export interface TutorialProgress {
  readonly currentPhase: TutorialPhase;
  readonly completedPhases: readonly TutorialPhase[];
  readonly isActive: boolean;
  readonly canProceed: boolean;
}

type TutorialUpdateListener = (progress: TutorialProgress) => void;

/**
 * Singleton class managing tutorial state and progression.
 */
class TutorialStateManager {
  private currentPhase: TutorialPhase = "inactive";
  private completedPhases: Set<TutorialPhase> = new Set();
  private isActive = false;
  private canProceed = true;
  private listeners: Set<TutorialUpdateListener> = new Set();
  private highlightedElement: HTMLElement | null = null;

  /**
   * Starts the tutorial from the beginning.
   */
  startTutorial(): void {
    this.isActive = true;
    this.currentPhase = "welcome";
    this.completedPhases.clear();
    this.canProceed = true;
    this.notifyListeners();
  }

  /**
   * Ends the tutorial and resets state.
   */
  endTutorial(): void {
    this.isActive = false;
    this.currentPhase = "inactive";
    this.clearHighlight();
    this.notifyListeners();
  }

  /**
   * Skips the tutorial entirely.
   */
  skipTutorial(): void {
    this.isActive = false;
    this.currentPhase = "complete";
    this.clearHighlight();
    this.notifyListeners();
  }

  /**
   * Advances to the next tutorial phase.
   */
  advancePhase(nextPhase: TutorialPhase): void {
    if (!this.isActive) return;

    this.completedPhases.add(this.currentPhase);
    this.currentPhase = nextPhase;
    this.canProceed = true;

    if (nextPhase === "complete") {
      this.isActive = false;
    }

    this.notifyListeners();
  }

  /**
   * Sets whether the user can proceed to the next step.
   */
  setCanProceed(canProceed: boolean): void {
    this.canProceed = canProceed;
    this.notifyListeners();
  }

  /**
   * Jumps to a specific phase (for debugging or special flows).
   */
  jumpToPhase(phase: TutorialPhase): void {
    if (!this.isActive && phase !== "inactive") {
      this.isActive = true;
    }
    this.currentPhase = phase;
    this.canProceed = true;
    this.notifyListeners();
  }

  /**
   * Returns the current tutorial progress.
   */
  getProgress(): TutorialProgress {
    return {
      currentPhase: this.currentPhase,
      completedPhases: Array.from(this.completedPhases),
      isActive: this.isActive,
      canProceed: this.canProceed
    };
  }

  /**
   * Checks if the tutorial is currently active.
   */
  isTutorialActive(): boolean {
    return this.isActive;
  }

  /**
   * Gets the current phase.
   */
  getCurrentPhase(): TutorialPhase {
    return this.currentPhase;
  }

  /**
   * Highlights a DOM element for the current tutorial step.
   */
  highlightElement(selector: string): void {
    this.clearHighlight();

    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      this.highlightedElement = element;
      element.classList.add("tutorial-highlight");
      element.setAttribute("data-tutorial-target", "true");
    }
  }

  /**
   * Clears any active highlight.
   */
  clearHighlight(): void {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove("tutorial-highlight");
      this.highlightedElement.removeAttribute("data-tutorial-target");
      this.highlightedElement = null;
    }

    // Also clear any stray highlights
    document.querySelectorAll(".tutorial-highlight").forEach(el => {
      el.classList.remove("tutorial-highlight");
      el.removeAttribute("data-tutorial-target");
    });
  }

  /**
   * Subscribes to tutorial state updates.
   */
  subscribe(listener: TutorialUpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notifies all listeners of state changes.
   */
  private notifyListeners(): void {
    const progress = this.getProgress();
    this.listeners.forEach(listener => listener(progress));
  }
}

// Singleton instance
let tutorialStateInstance: TutorialStateManager | null = null;

/**
 * Returns the singleton TutorialState instance.
 */
export function ensureTutorialState(): TutorialStateManager {
  if (!tutorialStateInstance) {
    tutorialStateInstance = new TutorialStateManager();
  }
  return tutorialStateInstance;
}

/**
 * Checks if the current mission is the training tutorial.
 */
export function isTrainingMission(missionKey: string | null): boolean {
  return missionKey === "training";
}
