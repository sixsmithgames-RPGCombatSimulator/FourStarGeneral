/**
 * TutorialState manages the tutorial progression and step tracking.
 * Uses a singleton pattern to maintain consistent tutorial state across components.
 */
/**
 * Singleton class managing tutorial state and progression.
 */
class TutorialStateManager {
    constructor() {
        this.currentPhase = "inactive";
        this.completedPhases = new Set();
        this.isActive = false;
        this.canProceed = true;
        this.listeners = new Set();
        this.highlightedElements = [];
    }
    /**
     * Starts the tutorial from the beginning.
     */
    startTutorial() {
        this.isActive = true;
        this.currentPhase = "budget_overview";
        this.completedPhases.clear();
        this.canProceed = true;
        this.notifyListeners();
    }
    /**
     * Ends the tutorial and resets state.
     */
    endTutorial() {
        this.isActive = false;
        this.currentPhase = "inactive";
        this.clearHighlight();
        this.notifyListeners();
    }
    /**
     * Skips the tutorial entirely.
     */
    skipTutorial() {
        this.isActive = false;
        this.currentPhase = "complete";
        this.clearHighlight();
        this.notifyListeners();
    }
    /**
     * Advances to the next tutorial phase.
     */
    advancePhase(nextPhase, canProceed = true) {
        if (!this.isActive)
            return;
        this.completedPhases.add(this.currentPhase);
        this.currentPhase = nextPhase;
        this.canProceed = canProceed;
        this.notifyListeners();
    }
    /**
     * Sets whether the user can proceed to the next step.
     */
    setCanProceed(canProceed) {
        this.canProceed = canProceed;
        this.notifyListeners();
    }
    /**
     * Jumps to a specific phase (for debugging or special flows).
     */
    jumpToPhase(phase) {
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
    getProgress() {
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
    isTutorialActive() {
        return this.isActive;
    }
    /**
     * Gets the current phase.
     */
    getCurrentPhase() {
        return this.currentPhase;
    }
    /**
     * Highlights a DOM element for the current tutorial step.
     */
    highlightElement(selector, firstMatchOnly = false) {
        this.clearHighlight();
        const matches = Array.from(document.querySelectorAll(selector));
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
    clearHighlight() {
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
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /**
     * Notifies all listeners of state changes.
     */
    notifyListeners() {
        const progress = this.getProgress();
        this.listeners.forEach(listener => listener(progress));
    }
}
// Singleton instance
let tutorialStateInstance = null;
/**
 * Returns the singleton TutorialState instance.
 */
export function ensureTutorialState() {
    if (!tutorialStateInstance) {
        tutorialStateInstance = new TutorialStateManager();
    }
    return tutorialStateInstance;
}
/**
 * Checks if the current mission is the training tutorial.
 */
export function isTrainingMission(missionKey) {
    return missionKey === "training";
}
