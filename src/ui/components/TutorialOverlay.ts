/**
 * TutorialOverlay renders professional-grade tutorial popups with highlights,
 * arrows, and step-by-step progression for the training mission.
 */

import {
  ensureTutorialState,
  type TutorialPhase,
  type TutorialProgress
} from "../../state/TutorialState";
import { getTutorialStep, getNextPhase, getPreviousPhase, isFirstPhase, type TutorialStep } from "../../data/tutorialSteps";

/**
 * Creates and manages the tutorial overlay UI.
 */
export class TutorialOverlay {
  private container: HTMLElement | null = null;
  private backdropElement: HTMLElement | null = null;
  private panelElement: HTMLElement | null = null;
  private spotlightElement: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private currentStep: TutorialStep | null = null;
  private lastRenderedPhase: TutorialPhase | null = null;
  private syncingCanProceed = false;

  /**
   * Initializes the tutorial overlay and subscribes to state changes.
   */
  initialize(): void {
    this.createOverlayElements();
    this.bindEvents();

    const tutorialState = ensureTutorialState();
    this.unsubscribe = tutorialState.subscribe((progress) => {
      this.handleProgressUpdate(progress);
    });

    // Initial render if tutorial is already active
    const progress = tutorialState.getProgress();
    if (progress.isActive) {
      this.handleProgressUpdate(progress);
    }
  }

  /**
   * Cleans up the overlay and unsubscribes from state.
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.removeOverlayElements();
  }

  /**
   * Creates the overlay DOM elements.
   */
  private createOverlayElements(): void {
    // Container for the entire tutorial overlay system
    this.container = document.createElement("div");
    this.container.id = "tutorialOverlayContainer";
    this.container.className = "tutorial-overlay-container hidden";
    this.container.setAttribute("role", "dialog");
    this.container.setAttribute("aria-modal", "true");
    this.container.setAttribute("aria-label", "Tutorial");

    // Semi-transparent backdrop
    this.backdropElement = document.createElement("div");
    this.backdropElement.className = "tutorial-backdrop";

    // Spotlight cutout for highlighted elements
    this.spotlightElement = document.createElement("div");
    this.spotlightElement.className = "tutorial-spotlight hidden";

    // Main tutorial panel
    this.panelElement = document.createElement("div");
    this.panelElement.className = "tutorial-panel";
    this.panelElement.innerHTML = `
      <div class="tutorial-panel-header">
        <span class="tutorial-step-indicator"></span>
        <div class="tutorial-header-buttons">
          <button type="button" class="tutorial-back-btn" aria-label="Previous step">Back</button>
          <button type="button" class="tutorial-skip-btn" aria-label="Skip tutorial">Skip</button>
        </div>
      </div>
      <div class="tutorial-panel-content">
        <h3 class="tutorial-title"></h3>
        <p class="tutorial-description"></p>
      </div>
      <div class="tutorial-panel-footer">
        <button type="button" class="tutorial-action-btn primary-button">Continue</button>
      </div>
      <div class="tutorial-arrow hidden"></div>
    `;

    this.container.appendChild(this.backdropElement);
    this.container.appendChild(this.spotlightElement);
    this.container.appendChild(this.panelElement);

    document.body.appendChild(this.container);
  }

  /**
   * Removes overlay elements from the DOM.
   */
  private removeOverlayElements(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.backdropElement = null;
    this.panelElement = null;
    this.spotlightElement = null;
  }

  /**
   * Binds event handlers.
   */
  private bindEvents(): void {
    if (!this.panelElement) return;

    const backBtn = this.panelElement.querySelector(".tutorial-back-btn");
    const skipBtn = this.panelElement.querySelector(".tutorial-skip-btn");
    const actionBtn = this.panelElement.querySelector(".tutorial-action-btn");

    backBtn?.addEventListener("click", () => this.handleBack());
    skipBtn?.addEventListener("click", () => this.handleSkip());
    actionBtn?.addEventListener("click", () => this.handleAction());

    // Handle keyboard navigation
    this.container?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.handleSkip();
      } else if (e.key === "Enter" || e.key === " ") {
        this.handleAction();
      }
    });
  }

  /**
   * Handles tutorial state updates.
   */
  private handleProgressUpdate(progress: TutorialProgress): void {
    if (!progress.isActive || progress.currentPhase === "inactive") {
      this.hide();
      return;
    }

    const step = getTutorialStep(progress.currentPhase);
    if (!step) {
      this.hide();
      return;
    }
    if (
      !this.syncingCanProceed &&
      step.waitForAction === true &&
      progress.canProceed === true &&
      this.lastRenderedPhase !== progress.currentPhase &&
      !progress.completedPhases.includes(progress.currentPhase)
    ) {
      this.syncingCanProceed = true;
      ensureTutorialState().setCanProceed(false);
      this.syncingCanProceed = false;
      return;
    }

    this.currentStep = step;
    this.lastRenderedPhase = progress.currentPhase;
    this.show();
    this.renderStep(step, progress);
  }

  /**
   * Renders the current tutorial step.
   */
  private renderStep(step: TutorialStep, progress: TutorialProgress): void {
    if (!this.panelElement) return;

    const tutorialState = ensureTutorialState();

    // Update step indicator
    const stepIndicator = this.panelElement.querySelector(".tutorial-step-indicator");
    if (stepIndicator) {
      const completedCount = progress.completedPhases.length;
      stepIndicator.textContent = `Step ${completedCount + 1}`;
    }

    // Update back button visibility - hide on first step
    const backBtn = this.panelElement.querySelector<HTMLButtonElement>(".tutorial-back-btn");
    if (backBtn) {
      if (isFirstPhase(step.phase)) {
        backBtn.style.display = "none";
      } else {
        backBtn.style.display = "";
      }
    }

    // Update title and description
    const titleEl = this.panelElement.querySelector(".tutorial-title");
    const descEl = this.panelElement.querySelector(".tutorial-description");

    if (titleEl) titleEl.textContent = step.title;
    if (descEl) descEl.textContent = step.content;

    const waitingForAction = step.waitForAction === true && !progress.canProceed;

    // Update action button
    const actionBtn = this.panelElement.querySelector<HTMLButtonElement>(".tutorial-action-btn");
    if (actionBtn) {
      actionBtn.textContent = step.actionLabel ?? "Continue";
      actionBtn.disabled = waitingForAction;

      if (waitingForAction) {
        actionBtn.classList.add("waiting");
      } else {
        actionBtn.classList.remove("waiting");
      }
    }

    if (step.waitForAction === true) {
      if (this.container) {
        this.container.style.pointerEvents = "none";
      }

      if (this.backdropElement) {
        this.backdropElement.style.pointerEvents = "none";
      }

      if (this.spotlightElement) {
        this.spotlightElement.style.pointerEvents = "none";
      }

      if (this.panelElement) {
        this.panelElement.style.pointerEvents = "none";
        // Re-enable pointer events only on interactive elements within the panel
        const interactiveElements = this.panelElement.querySelectorAll<HTMLElement>(
          "button, a, input, select, textarea"
        );
        interactiveElements.forEach(el => {
          el.style.pointerEvents = "auto";
        });
      }
    } else {
      if (this.container) {
        this.container.style.pointerEvents = "";
      }

      if (this.backdropElement) {
        this.backdropElement.style.pointerEvents = "auto";
      }

      if (this.spotlightElement) {
        this.spotlightElement.style.pointerEvents = "";
      }

      if (this.panelElement) {
        this.panelElement.style.pointerEvents = "";
        // Clear inline styles on interactive elements
        const interactiveElements = this.panelElement.querySelectorAll<HTMLElement>(
          "button, a, input, select, textarea"
        );
        interactiveElements.forEach(el => {
          el.style.pointerEvents = "";
        });
      }
    }

    // Handle highlighting
    tutorialState.clearHighlight();
    if (step.highlightSelector) {
      // First scroll the target element into view so users can see and interact with it
      this.scrollTargetIntoView(step.highlightSelector);
      tutorialState.highlightElement(step.highlightSelector);
      this.positionSpotlight(step.highlightSelector);
    } else {
      this.hideSpotlight();
    }

    // Position the panel
    this.positionPanel(step);

    // Handle arrow
    this.updateArrow(step);
  }

  /**
   * Scrolls the target element into view if it's not visible in the viewport.
   * Uses smooth scrolling for a better user experience.
   * After scrolling completes, repositions the spotlight to match the new element location.
   */
  private scrollTargetIntoView(selector: string): void {
    const targetElement = document.querySelector<HTMLElement>(selector);
    if (!targetElement) return;

    const rect = targetElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Add margin so elements aren't right at the edge
    const margin = 100;

    // Check if element is outside the visible viewport (with margin)
    const isOutOfView =
      rect.top < margin ||
      rect.bottom > viewportHeight - margin ||
      rect.left < margin ||
      rect.right > viewportWidth - margin;

    if (isOutOfView) {
      // Scroll the element into view with some padding
      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center"
      });

      // After scroll completes, reposition spotlight to match new element location
      // Use a timeout since smooth scroll doesn't have a completion callback
      setTimeout(() => {
        this.positionSpotlight(selector);
        this.positionPanelForCurrentStep();
      }, 400);
    }
  }

  /**
   * Repositions the panel for the current step after scroll/resize events.
   */
  private positionPanelForCurrentStep(): void {
    if (this.currentStep) {
      this.positionPanel(this.currentStep);
    }
  }

  /**
   * Positions the spotlight around the highlighted element.
   */
  private positionSpotlight(selector: string): void {
    if (!this.spotlightElement) return;

    const targetElement = document.querySelector<HTMLElement>(selector);
    if (!targetElement) {
      this.hideSpotlight();
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const padding = 8;

    this.spotlightElement.style.left = `${rect.left - padding}px`;
    this.spotlightElement.style.top = `${rect.top - padding}px`;
    this.spotlightElement.style.width = `${rect.width + padding * 2}px`;
    this.spotlightElement.style.height = `${rect.height + padding * 2}px`;
    this.spotlightElement.classList.remove("hidden");
  }

  /**
   * Hides the spotlight.
   */
  private hideSpotlight(): void {
    if (this.spotlightElement) {
      this.spotlightElement.classList.add("hidden");
    }
  }

  /**
   * Positions the tutorial panel based on the step configuration.
   */
  private positionPanel(step: TutorialStep): void {
    if (!this.panelElement) return;

    // Reset positioning
    this.panelElement.style.removeProperty("left");
    this.panelElement.style.removeProperty("right");
    this.panelElement.style.removeProperty("top");
    this.panelElement.style.removeProperty("bottom");
    this.panelElement.style.removeProperty("transform");

    this.panelElement.className = `tutorial-panel tutorial-position-${step.position}`;

    // Viewport boundaries with minimum margin
    const viewportMargin = 20;
    const panelWidth = 380;
    const panelHeight = 280; // Approximate max height
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (step.position === "center") {
      this.panelElement.style.left = "50%";
      this.panelElement.style.top = "50%";
      this.panelElement.style.transform = "translate(-50%, -50%)";
      return;
    }

    // Position relative to highlighted element if one exists
    if (step.highlightSelector) {
      const targetElement = document.querySelector<HTMLElement>(step.highlightSelector);
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const offset = 20;

        switch (step.position) {
          case "left": {
            const rightPos = viewportWidth - rect.left + offset;
            // Calculate where the top would be (centered on target)
            const idealTop = rect.top + rect.height / 2 - panelHeight / 2;
            // Clamp to viewport bounds
            const clampedTop = Math.max(viewportMargin, Math.min(idealTop, viewportHeight - panelHeight - viewportMargin));

            this.panelElement.style.right = `${rightPos}px`;
            this.panelElement.style.top = `${clampedTop}px`;
            // Don't use transform since we're manually positioning
            break;
          }
          case "right": {
            const leftPos = rect.right + offset;
            const idealTop = rect.top + rect.height / 2 - panelHeight / 2;
            const clampedTop = Math.max(viewportMargin, Math.min(idealTop, viewportHeight - panelHeight - viewportMargin));

            this.panelElement.style.left = `${leftPos}px`;
            this.panelElement.style.top = `${clampedTop}px`;
            break;
          }
          case "top": {
            const bottomPos = viewportHeight - rect.top + offset;
            const idealLeft = rect.left + rect.width / 2 - panelWidth / 2;
            const clampedLeft = Math.max(viewportMargin, Math.min(idealLeft, viewportWidth - panelWidth - viewportMargin));

            this.panelElement.style.left = `${clampedLeft}px`;
            this.panelElement.style.bottom = `${bottomPos}px`;
            break;
          }
          case "bottom": {
            const topPos = rect.bottom + offset;
            const idealLeft = rect.left + rect.width / 2 - panelWidth / 2;
            const clampedLeft = Math.max(viewportMargin, Math.min(idealLeft, viewportWidth - panelWidth - viewportMargin));

            this.panelElement.style.left = `${clampedLeft}px`;
            this.panelElement.style.top = `${topPos}px`;
            break;
          }
        }
        return;
      }
    }

    // Default positioning when no target - centered in viewport quadrant
    switch (step.position) {
      case "left":
        this.panelElement.style.left = `${viewportMargin}px`;
        this.panelElement.style.top = "50%";
        this.panelElement.style.transform = "translateY(-50%)";
        break;
      case "right":
        this.panelElement.style.right = `${viewportMargin}px`;
        this.panelElement.style.top = "50%";
        this.panelElement.style.transform = "translateY(-50%)";
        break;
      case "top":
        this.panelElement.style.left = "50%";
        this.panelElement.style.top = `${viewportMargin}px`;
        this.panelElement.style.transform = "translateX(-50%)";
        break;
      case "bottom":
        this.panelElement.style.left = "50%";
        this.panelElement.style.bottom = `${viewportMargin}px`;
        this.panelElement.style.transform = "translateX(-50%)";
        break;
    }
  }

  /**
   * Updates the arrow indicator.
   */
  private updateArrow(step: TutorialStep): void {
    if (!this.panelElement) return;

    const arrow = this.panelElement.querySelector<HTMLElement>(".tutorial-arrow");
    if (!arrow) return;

    if (!step.arrowDirection) {
      arrow.classList.add("hidden");
      return;
    }

    arrow.classList.remove("hidden");
    arrow.className = `tutorial-arrow tutorial-arrow-${step.arrowDirection}`;
  }

  /**
   * Shows the tutorial overlay.
   */
  private show(): void {
    if (this.container) {
      this.container.classList.remove("hidden");
      // Focus the panel for accessibility
      this.panelElement?.focus();
    }
  }

  /**
   * Hides the tutorial overlay.
   */
  private hide(): void {
    if (this.container) {
      this.container.classList.add("hidden");
    }
    this.hideSpotlight();
    ensureTutorialState().clearHighlight();
  }

  /**
   * Handles the skip button click.
   */
  private handleSkip(): void {
    ensureTutorialState().skipTutorial();
  }

  /**
   * Handles the back button click.
   */
  private handleBack(): void {
    if (!this.currentStep) return;

    const previousPhase = getPreviousPhase(this.currentStep.phase);
    if (previousPhase) {
      const tutorialState = ensureTutorialState();
      tutorialState.jumpToPhase(previousPhase);
    }
  }

  /**
   * Handles the action button click.
   */
  private handleAction(): void {
    if (!this.currentStep) return;

    const tutorialState = ensureTutorialState();
    const progress = tutorialState.getProgress();

    // If waiting for action and can't proceed yet, do nothing
    if (this.currentStep.waitForAction && !progress.canProceed) {
      return;
    }

    // Get next phase and advance
    const nextPhase = getNextPhase(this.currentStep.phase);
    if (nextPhase) {
      tutorialState.advancePhase(nextPhase);
    } else {
      tutorialState.endTutorial();
    }
  }

  /**
   * Manually triggers completion of the current step's action.
   * Called by external code when a required action is performed.
   */
  completeCurrentAction(): void {
    const tutorialState = ensureTutorialState();
    tutorialState.setCanProceed(true);
  }

  /**
   * Checks if the tutorial is currently on a specific phase.
   */
  isOnPhase(phase: TutorialPhase): boolean {
    return ensureTutorialState().getCurrentPhase() === phase;
  }
}

// Singleton instance
let tutorialOverlayInstance: TutorialOverlay | null = null;

/**
 * Returns the singleton TutorialOverlay instance.
 */
export function ensureTutorialOverlay(): TutorialOverlay {
  if (!tutorialOverlayInstance) {
    tutorialOverlayInstance = new TutorialOverlay();
  }
  return tutorialOverlayInstance;
}
