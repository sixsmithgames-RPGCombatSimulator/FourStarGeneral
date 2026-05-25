/**
 * Initiative Unit Highlighter
 * 
 * Manages visual highlighting of the currently active unit in the initiative system.
 * Provides visual feedback to players about which unit is currently acting.
 * 
 * @since Initiative System v1.0
 */

import type { UnitActivation } from '../../core/InitiativeQueue';
import type { HexMapRenderer } from '../../rendering/HexMapRenderer';

/**
 * Highlight styles for different activation states
 */
export interface HighlightStyles {
  /** CSS class for currently active unit */
  activeUnitClass: string;
  /** CSS class for units that have already acted */
  activatedUnitClass: string;
  /** CSS class for units that have not yet acted */
  pendingUnitClass: string;
  /** Animation duration for highlight transitions */
  animationDuration: number;
}

/**
 * Default highlight styles
 */
const DEFAULT_HIGHLIGHT_STYLES: HighlightStyles = {
  activeUnitClass: 'initiative-active-unit',
  activatedUnitClass: 'initiative-activated-unit',
  pendingUnitClass: 'initiative-pending-unit',
  animationDuration: 300
};

/**
 * Manages visual highlighting of units based on initiative state
 */
export class InitiativeUnitHighlighter {
  private readonly hexMapRenderer: HexMapRenderer | null;
  private readonly styles: HighlightStyles;
  private currentActivation: UnitActivation | null = null;
  private activatedUnits: Set<string> = new Set();
  private highlightedElements: Map<string, HTMLElement> = new Map();

  /**
   * Create a new initiative unit highlighter
   * 
   * @param hexMapRenderer - The hex map renderer for unit visual manipulation
   * @param styles - Custom highlight styles (optional)
   */
  constructor(
    hexMapRenderer: HexMapRenderer | null,
    styles: Partial<HighlightStyles> = {}
  ) {
    this.hexMapRenderer = hexMapRenderer;
    this.styles = { ...DEFAULT_HIGHLIGHT_STYLES, ...styles };
  }

  /**
   * Update the current activation and refresh highlighting
   * 
   * @param activation - The current unit activation, or null if none
   * @param allActivations - All activations in the current turn queue (optional)
   */
  public updateCurrentActivation(
    activation: UnitActivation | null,
    allActivations?: readonly UnitActivation[]
  ): void {
    // Clear previous highlighting
    this.clearAllHighlights();

    // Update current activation
    this.currentActivation = activation;

    // Update activated units if full queue is provided
    if (allActivations) {
      this.activatedUnits.clear();
      allActivations
        .filter(a => a.isActivated)
        .forEach(a => this.activatedUnits.add(a.unitId));
    }

    // Apply new highlighting
    this.applyHighlights();
  }

  /**
   * Mark a unit as activated and update its visual state
   * 
   * @param unitId - ID of the unit to mark as activated
   */
  public markUnitActivated(unitId: string): void {
    this.activatedUnits.add(unitId);
    
    // If this was the current activation, clear it
    if (this.currentActivation?.unitId === unitId) {
      this.currentActivation = null;
    }

    // Reapply highlights with updated state
    this.applyHighlights();
  }

  /**
   * Reset all activation states (called at start of new turn)
   */
  public resetActivationStates(): void {
    this.currentActivation = null;
    this.activatedUnits.clear();
    this.clearAllHighlights();
  }

  /**
   * Get the current activation state
   * 
   * @returns Current activation or null
   */
  public getCurrentActivation(): UnitActivation | null {
    return this.currentActivation;
  }

  /**
   * Get the set of activated unit IDs
   * 
   * @returns Set of activated unit IDs
   */
  public getActivatedUnits(): ReadonlySet<string> {
    return this.activatedUnits;
  }

  /**
   * Check if a specific unit is currently highlighted as active
   * 
   * @param unitId - ID of the unit to check
   * @returns True if the unit is currently active
   */
  public isUnitActive(unitId: string): boolean {
    return this.currentActivation?.unitId === unitId;
  }

  /**
   * Check if a specific unit has been activated
   * 
   * @param unitId - ID of the unit to check
   * @returns True if the unit has been activated
   */
  public isUnitActivated(unitId: string): boolean {
    return this.activatedUnits.has(unitId);
  }

  /**
   * Apply highlighting based on current activation state
   */
  private applyHighlights(): void {
    if (!this.hexMapRenderer) {
      return;
    }

    // Highlight currently active unit
    if (this.currentActivation) {
      this.highlightUnit(this.currentActivation.unitId, this.styles.activeUnitClass);
    }

    // Highlight activated units
    this.activatedUnits.forEach(unitId => {
      if (unitId !== this.currentActivation?.unitId) {
        this.highlightUnit(unitId, this.styles.activatedUnitClass);
      }
    });
  }

  /**
   * Highlight a specific unit with the given CSS class
   * 
   * @param unitId - ID of the unit to highlight
   * @param cssClass - CSS class to apply
   */
  private highlightUnit(unitId: string, cssClass: string): void {
    if (!this.hexMapRenderer) {
      return;
    }

    try {
      // Get the unit's visual element
      const unitElement = this.getUnitElement(unitId);
      if (!unitElement) {
        return;
      }

      // Apply highlight class with animation
      unitElement.classList.add(cssClass);
      unitElement.style.transition = `all ${this.styles.animationDuration}ms ease-in-out`;

      // Store reference for cleanup
      this.highlightedElements.set(unitId, unitElement);

      // Add pulse animation for active units
      if (cssClass === this.styles.activeUnitClass) {
        this.addPulseAnimation(unitElement);
      }

    } catch (error) {
      console.warn(`Failed to highlight unit ${unitId}:`, error);
    }
  }

  /**
   * Clear all highlighting from units
   */
  private clearAllHighlights(): void {
    this.highlightedElements.forEach((element, unitId) => {
      try {
        // Remove all initiative-related classes
        element.classList.remove(
          this.styles.activeUnitClass,
          this.styles.activatedUnitClass,
          this.styles.pendingUnitClass
        );

        // Remove pulse animation
        this.removePulseAnimation(element);

        // Clear transition styles
        element.style.transition = '';

      } catch (error) {
        console.warn(`Failed to clear highlight for unit ${unitId}:`, error);
      }
    });

    this.highlightedElements.clear();
  }

  /**
   * Get the DOM element for a specific unit
   * 
   * @param unitId - ID of the unit
   * @returns DOM element or null if not found
   */
  private getUnitElement(unitId: string): HTMLElement | null {
    if (!this.hexMapRenderer) {
      return null;
    }

    // Try to find the unit element by ID or data attribute
    // This implementation depends on the actual DOM structure of the hex map renderer
    
    // Method 1: Look for element with data-unit-id attribute
    let element = document.querySelector(`[data-unit-id="${unitId}"]`) as HTMLElement;
    if (element) {
      return element;
    }

    // Method 2: Look for element with ID matching unit pattern
    element = document.querySelector(`#unit-${unitId}`) as HTMLElement;
    if (element) {
      return element;
    }

    // Method 3: Look for element with class containing unit ID
    element = document.querySelector(`.unit[data-id="${unitId}"]`) as HTMLElement;
    if (element) {
      return element;
    }

    // Method 4: Ask the hex map renderer for the unit element
    // This would require extending the HexMapRenderer interface
    if (typeof (this.hexMapRenderer as any).getUnitElement === 'function') {
      return (this.hexMapRenderer as any).getUnitElement(unitId);
    }

    return null;
  }

  /**
   * Add pulse animation to an element
   * 
   * @param element - Element to animate
   */
  private addPulseAnimation(element: HTMLElement): void {
    // Create a subtle pulse animation using CSS
    const animationName = `initiative-pulse-${Date.now()}`;
    
    // Inject keyframes if not already present
    if (!document.querySelector(`style[data-initiative-pulse]`)) {
      const style = document.createElement('style');
      style.setAttribute('data-initiative-pulse', 'true');
      style.textContent = `
        @keyframes initiative-pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px 5px rgba(255, 215, 0, 0.3); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
        }
        
        .${this.styles.activeUnitClass} {
          animation: initiative-pulse 2s infinite;
          z-index: 1000;
        }
      `;
      document.head.appendChild(style);
    }

    // Apply animation
    element.style.animation = 'initiative-pulse 2s infinite';
  }

  /**
   * Remove pulse animation from an element
   * 
   * @param element - Element to remove animation from
   */
  private removePulseAnimation(element: HTMLElement): void {
    element.style.animation = '';
  }

  /**
   * Dispose of the highlighter and clean up resources
   */
  public dispose(): void {
    this.clearAllHighlights();
    this.currentActivation = null;
    this.activatedUnits.clear();
  }

  /**
   * Get statistics about the current highlighting state
   * 
   * @returns Highlighting statistics
   */
  public getHighlightStats(): {
    activeUnits: number;
    activatedUnits: number;
    totalHighlighted: number;
  } {
    return {
      activeUnits: this.currentActivation ? 1 : 0,
      activatedUnits: this.activatedUnits.size,
      totalHighlighted: this.highlightedElements.size
    };
  }
}
