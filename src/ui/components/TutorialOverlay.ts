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
  private onViewportChange: (() => void) | null = null;
  private domObserver: MutationObserver | null = null;
  private domObserverScheduled = false;
  private domObserverRafId: number | null = null;
  private anchorAttemptId = 0;
  private anchorTimeoutId: number | null = null;
  private lastResolvedAnchorSelector: string | null = null;
  private lastAnchoredSelector: string | null = null;
  private suppressCurrentPhaseDisplay = false;

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
    if (this.onViewportChange) {
      window.removeEventListener("resize", this.onViewportChange);
      window.removeEventListener("scroll", this.onViewportChange, true);
      this.onViewportChange = null;
    }
    this.stopDomObserver();
    this.clearAnchorRetry();
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

    if (!this.onViewportChange) {
      this.onViewportChange = () => {
        // Keep spotlight/panel aligned as the UI changes (scrolling, resize, popups opening)
        if (this.currentStep?.highlightSelector) {
          this.positionSpotlight(this.currentStep.highlightSelector);
        }
        this.positionPanelForCurrentStep();
      };
      window.addEventListener("resize", this.onViewportChange);
      // Capture scroll events from nested scroll containers (sidebars/panels)
      window.addEventListener("scroll", this.onViewportChange, true);
    }
  }

  /**
   * Handles tutorial state updates.
   */
  private handleProgressUpdate(progress: TutorialProgress): void {
    if (!progress.isActive || progress.currentPhase === "inactive") {
      this.hide();
      return;
    }

    if (this.suppressCurrentPhaseDisplay && progress.currentPhase === "review_allocation") {
      // Stay hidden after the user dismisses the free-review step. We'll re-enable when phase changes.
      this.lastRenderedPhase = progress.currentPhase;
      return;
    }

    if (this.suppressCurrentPhaseDisplay && progress.currentPhase !== "review_allocation") {
      this.suppressCurrentPhaseDisplay = false;
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

    if (this.backdropElement) {
      this.backdropElement.style.background = step.highlightSelector ? "rgba(0, 0, 0, 0)" : "";
    }

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
      // Premium anchoring: attempt to ensure the target exists (panels may be closed / DOM may be async)
      this.ensureAnchorTarget(step.highlightSelector);
    } else {
      this.stopDomObserver();
      this.clearAnchorRetry();
      this.hideSpotlight();
    }

    // Position the panel
    this.positionPanel(step);

    // Handle arrow
    this.updateArrow(step);
  }

  private clearAnchorRetry(): void {
    if (this.anchorTimeoutId !== null) {
      window.clearTimeout(this.anchorTimeoutId);
      this.anchorTimeoutId = null;
    }
  }

  private stopDomObserver(): void {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    if (this.domObserverRafId !== null) {
      cancelAnimationFrame(this.domObserverRafId);
      this.domObserverRafId = null;
    }
    this.domObserverScheduled = false;
  }

  private startDomObserver(): void {
    if (this.domObserver) {
      return;
    }
    this.domObserver = new MutationObserver(() => {
      if (!this.currentStep?.highlightSelector) {
        return;
      }

      // Debounce mutation bursts to avoid feedback loops (anchoring itself mutates DOM).
      if (this.domObserverScheduled) {
        return;
      }
      this.domObserverScheduled = true;
      this.domObserverRafId = requestAnimationFrame(() => {
        this.domObserverRafId = null;
        this.domObserverScheduled = false;

        if (!this.currentStep?.highlightSelector) {
          return;
        }
        const selector = this.currentStep.highlightSelector;
        if (this.lastAnchoredSelector === selector) {
          // Still keep spotlight positioned in case layout shifted.
          this.positionSpotlight(selector);
          this.positionPanelForCurrentStep();
          return;
        }

        // If the target exists now (e.g. user opened the correct panel), anchor.
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          this.anchorToTarget(selector);
        }
      });
    });

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "data-panel-collapsed"]
    });
  }

  private ensureAnchorTarget(selector: string): void {
    this.lastResolvedAnchorSelector = selector;
    this.lastAnchoredSelector = null;
    this.anchorAttemptId += 1;
    const attemptId = this.anchorAttemptId;

    // First attempt: if it exists right now, anchor immediately.
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) {
      this.anchorToTarget(selector);
      return;
    }

    // Context-aware assist: try to open the correct UI surface if we can infer it.
    this.tryAutoOpenContextForSelector(selector);

    // Start observing DOM mutations so the spotlight snaps in as soon as the target appears.
    this.startDomObserver();

    // Retry loop: poll briefly because some UI updates are async and don't always produce a mutation we can rely on.
    this.clearAnchorRetry();
    const startedAt = performance.now();
    const timeoutMs = 1200;
    const intervalMs = 120;

    const tick = () => {
      if (attemptId !== this.anchorAttemptId) {
        return;
      }

      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        this.anchorToTarget(selector);
        return;
      }

      if (performance.now() - startedAt >= timeoutMs) {
        // Graceful fallback: no spotlight; keep the panel visible and centered.
        this.hideSpotlight();
        ensureTutorialState().clearHighlight();
        this.positionPanelForCurrentStep();
        return;
      }

      this.anchorTimeoutId = window.setTimeout(tick, intervalMs);
    };

    this.anchorTimeoutId = window.setTimeout(tick, intervalMs);
  }

  private anchorToTarget(selector: string): void {
    this.clearAnchorRetry();
    this.startDomObserver();

    // Mark as anchored early to avoid mutation feedback loops.
    this.lastAnchoredSelector = selector;

    // First scroll the target element into view so users can see and interact with it
    this.scrollTargetIntoView(selector);

    const tutorialState = ensureTutorialState();
    tutorialState.highlightElement(selector);
    this.positionSpotlight(selector);

    if (this.currentStep) {
      this.positionPanel(this.currentStep);
    }
  }

  private tryAutoOpenContextForSelector(selector: string): void {
    // If selector includes an obvious popup/panel, attempt to open it.
    // This is deliberately conservative: we only auto-open when we can infer intent.
    if (selector.includes("#deploymentPanel")) {
      return;
    }

    // Sidebar popups use [data-popup="..."] triggers.
    if (selector.includes("armyRoster") || selector.includes("data-popup='armyRoster'") || selector.includes("data-popup=\"armyRoster\"")) {
      this.clickIfPresent(".control-sidebar [data-popup=\"armyRoster\"]");
      return;
    }
    if (selector.includes("airSupport") || selector.includes("airHudWidget") || selector.includes("data-popup='airSupport'") || selector.includes("data-popup=\"airSupport\"")) {
      // Prefer the Air HUD widget if present (it exists in the battle header), otherwise fall back to sidebar popup.
      this.clickIfPresent("[data-airhud-open]");
      this.clickIfPresent(".control-sidebar [data-popup=\"airSupport\"]");
      return;
    }
  }

  private clickIfPresent(selector: string): void {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && typeof (el as any).click === "function") {
      try {
        (el as any).click();
      } catch {
        // ignore
      }
    }
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
      // Avoid smooth-scroll loops that can repeatedly trigger observers/scroll handlers.
      targetElement.scrollIntoView({
        behavior: "auto",
        block: "center",
        inline: "center"
      });

      // Reposition immediately since auto scroll completes synchronously.
      this.positionSpotlight(selector);
      this.positionPanelForCurrentStep();
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

    const left = Math.max(0, rect.left - padding);
    const top = Math.max(0, rect.top - padding);
    const right = Math.min(window.innerWidth, rect.right + padding);
    const bottom = Math.min(window.innerHeight, rect.bottom + padding);

    this.spotlightElement.style.left = `${left}px`;
    this.spotlightElement.style.top = `${top}px`;
    this.spotlightElement.style.width = `${Math.max(0, right - left)}px`;
    this.spotlightElement.style.height = `${Math.max(0, bottom - top)}px`;
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
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Use actual rendered size so we never guess wrong and end up off-screen.
    const panelRect = this.panelElement.getBoundingClientRect();
    const panelWidth = Math.max(1, panelRect.width || 380);
    const panelHeight = Math.max(1, panelRect.height || 280);

    if (step.position === "center") {
      this.panelElement.style.left = "50%";
      this.panelElement.style.top = "50%";
      this.panelElement.style.transform = "translate(-50%, -50%)";
      return;
    }

    const clamp = (value: number, min: number, max: number): number => {
      if (Number.isNaN(value)) return min;
      return Math.max(min, Math.min(value, max));
    };

    const getPanelRect = (): DOMRect => this.panelElement!.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect): boolean => {
      return !(
        a.right <= b.left ||
        a.left >= b.right ||
        a.bottom <= b.top ||
        a.top >= b.bottom
      );
    };

    const nudgeWithinViewport = (): void => {
      const rect = getPanelRect();
      const maxLeft = viewportWidth - rect.width - viewportMargin;
      const maxTop = viewportHeight - rect.height - viewportMargin;
      const desiredLeft = clamp(rect.left, viewportMargin, maxLeft);
      const desiredTop = clamp(rect.top, viewportMargin, maxTop);
      const dx = desiredLeft - rect.left;
      const dy = desiredTop - rect.top;
      if (dx !== 0 || dy !== 0) {
        const currentLeft = parseFloat(this.panelElement!.style.left || "0");
        const currentTop = parseFloat(this.panelElement!.style.top || "0");

        if (this.panelElement!.style.left) {
          this.panelElement!.style.left = `${currentLeft + dx}px`;
        } else if (this.panelElement!.style.right) {
          const currentRight = parseFloat(this.panelElement!.style.right || "0");
          this.panelElement!.style.right = `${currentRight - dx}px`;
        } else {
          this.panelElement!.style.left = `${desiredLeft}px`;
        }

        if (this.panelElement!.style.top) {
          this.panelElement!.style.top = `${currentTop + dy}px`;
        } else if (this.panelElement!.style.bottom) {
          const currentBottom = parseFloat(this.panelElement!.style.bottom || "0");
          this.panelElement!.style.bottom = `${currentBottom - dy}px`;
        } else {
          this.panelElement!.style.top = `${desiredTop}px`;
        }
      }
    };

    // Position relative to highlighted element if one exists
    if (step.highlightSelector) {
      const targetElement = document.querySelector<HTMLElement>(step.highlightSelector);
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const offset = 20;

        const idealCenteredTop = rect.top + rect.height / 2 - panelHeight / 2;
        const centeredTop = Math.max(
          viewportMargin,
          Math.min(idealCenteredTop, viewportHeight - panelHeight - viewportMargin)
        );

        const idealCenteredLeft = rect.left + rect.width / 2 - panelWidth / 2;
        const centeredLeft = Math.max(
          viewportMargin,
          Math.min(idealCenteredLeft, viewportWidth - panelWidth - viewportMargin)
        );

        switch (step.position) {
          case "left": {
            const idealRight = viewportWidth - rect.left + offset;
            // Calculate where the top would be (centered on target)
            const idealTop = rect.top + rect.height / 2 - panelHeight / 2;
            // Clamp to viewport bounds
            const clampedTop = Math.max(viewportMargin, Math.min(idealTop, viewportHeight - panelHeight - viewportMargin));

            // Clamp the right position so the panel stays fully on-screen.
            const minRight = viewportMargin;
            const maxRight = viewportWidth - panelWidth - viewportMargin;
            const clampedRight = clamp(idealRight, minRight, maxRight);

            this.panelElement.style.right = `${clampedRight}px`;
            this.panelElement.style.top = `${clampedTop}px`;
            // Don't use transform since we're manually positioning
            break;
          }
          case "right": {
            const leftPos = rect.right + offset;
            const idealTop = rect.top + rect.height / 2 - panelHeight / 2;
            const clampedTop = Math.max(viewportMargin, Math.min(idealTop, viewportHeight - panelHeight - viewportMargin));

            const clampedLeft = Math.max(viewportMargin, Math.min(leftPos, viewportWidth - panelWidth - viewportMargin));

            this.panelElement.style.left = `${clampedLeft}px`;
            this.panelElement.style.top = `${clampedTop}px`;
            break;
          }
          case "top": {
            const bottomPos = viewportHeight - rect.top + offset;
            const idealLeft = rect.left + rect.width / 2 - panelWidth / 2;
            const clampedLeft = Math.max(viewportMargin, Math.min(idealLeft, viewportWidth - panelWidth - viewportMargin));

            const panelBottomInPx = Math.max(viewportMargin, Math.min(bottomPos, viewportHeight - panelHeight - viewportMargin));

            this.panelElement.style.left = `${clampedLeft}px`;
            this.panelElement.style.bottom = `${panelBottomInPx}px`;
            break;
          }
          case "bottom": {
            const topPos = rect.bottom + offset;
            const idealLeft = rect.left + rect.width / 2 - panelWidth / 2;
            const clampedLeft = Math.max(viewportMargin, Math.min(idealLeft, viewportWidth - panelWidth - viewportMargin));

            const clampedTop = Math.max(viewportMargin, Math.min(topPos, viewportHeight - panelHeight - viewportMargin));

            this.panelElement.style.left = `${clampedLeft}px`;
            this.panelElement.style.top = `${clampedTop}px`;
            break;
          }
        }

        // Final safety: keep inside viewport and avoid covering the highlighted target.
        nudgeWithinViewport();

        const panelNow = getPanelRect();
        const targetNow = rect;
        if (overlaps(panelNow, targetNow)) {
          // Try flipping to the opposite side if possible.
          if (step.position === "left") {
            const leftPos = rect.right + offset;
            const clampedLeft = clamp(leftPos, viewportMargin, viewportWidth - panelWidth - viewportMargin);
            this.panelElement.style.removeProperty("right");
            this.panelElement.style.left = `${clampedLeft}px`;
            this.panelElement.style.top = `${centeredTop}px`;
          } else if (step.position === "right") {
            const idealRight = viewportWidth - rect.left + offset;
            const clampedRight = clamp(idealRight, viewportMargin, viewportWidth - panelWidth - viewportMargin);
            this.panelElement.style.removeProperty("left");
            this.panelElement.style.right = `${clampedRight}px`;
            this.panelElement.style.top = `${centeredTop}px`;
          } else if (step.position === "top") {
            const topPos = rect.bottom + offset;
            const clampedTop2 = clamp(topPos, viewportMargin, viewportHeight - panelHeight - viewportMargin);
            this.panelElement.style.removeProperty("bottom");
            this.panelElement.style.top = `${clampedTop2}px`;
            this.panelElement.style.left = `${centeredLeft}px`;
          } else if (step.position === "bottom") {
            const bottomPos = viewportHeight - rect.top + offset;
            const clampedBottom = clamp(bottomPos, viewportMargin, viewportHeight - panelHeight - viewportMargin);
            this.panelElement.style.removeProperty("top");
            this.panelElement.style.bottom = `${clampedBottom}px`;
            this.panelElement.style.left = `${centeredLeft}px`;
          }
          nudgeWithinViewport();
        }
        return;
      }

      // If the highlight target isn't present (user changed tabs/panels), fall back to a safe center position.
      this.panelElement.style.left = "50%";
      this.panelElement.style.top = "50%";
      this.panelElement.style.transform = "translate(-50%, -50%)";
      return;
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

    // Special case: review_allocation is a dismiss-only overlay. Hide and wait for Begin Battle to advance.
    if (this.currentStep.phase === "review_allocation") {
      this.suppressCurrentPhaseDisplay = true;
      this.hide();
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
