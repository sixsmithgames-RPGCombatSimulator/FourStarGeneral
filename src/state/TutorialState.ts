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
  | "select_tanks"
  | "select_engineers"
  | "select_flak"
  | "select_air_wing"
  | "select_howitzer"
  | "select_ammo"
  | "select_fuel"
  | "mission_objectives"
  | "review_allocation"
  | "ui_overview"
  | "mission_briefing"
  | "deployment_panel_intro"
  | "deployment_intro"
  | "place_units"
  | "base_camp"
  | "roster_intro"
  | "air_support_intro"
  | "begin_battle"
  | "initiative_order"
  | "initiative_group"
  | "active_group_units"
  | "movement_intro"
  | "attack_intro"
  | "select_smoke_unit"
  | "intel_overlay_expand"
  | "smoke_demo"
  | "spend_activation"
  | "enemy_activation"
  | "enemy_response"
  | "next_unit"
  | "skip_group"
  | "engineer_intro"
  | "engineer_orders"
  | "select_attack_unit"
  | "artillery_support_intro"
  | "artillery_intro"
  | "select_artillery_observer"
  | "flak_intro"
  | "air_missions"
  | "logistics_intro"
  | "round_handoff"
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
  readonly allowBack?: boolean;
  readonly highlightFirstMatch?: boolean;
  readonly showSpotlight?: boolean;
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
  private highlightedElements: HTMLElement[] = [];

  /**
   * Starts the tutorial from the beginning.
   */
  startTutorial(): void {
    this.isActive = true;
    this.currentPhase = "budget_overview";
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
  advancePhase(nextPhase: TutorialPhase, canProceed = true): void {
    if (!this.isActive) return;

    this.completedPhases.add(this.currentPhase);
    this.currentPhase = nextPhase;
    this.canProceed = canProceed;

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
  highlightElement(selector: string, firstMatchOnly = false): void {
    this.clearHighlight();

    const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const elements = firstMatchOnly ? matches.slice(0, 1) : matches;
    if (elements.length > 0) {
      this.highlightedElements = elements;
      elements.forEach((element) => {
        element.classList.add("tutorial-highlight");
        element.setAttribute("data-tutorial-target", "true");
      });
    }
  }

  /**
   * Clears any active highlight.
   */
  clearHighlight(): void {
    if (this.highlightedElements.length > 0) {
      this.highlightedElements.forEach((element) => {
        element.classList.remove("tutorial-highlight");
        element.removeAttribute("data-tutorial-target");
      });
      this.highlightedElements = [];
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
