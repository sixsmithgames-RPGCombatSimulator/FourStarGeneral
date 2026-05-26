/**
 * BattleState Initiative System Extensions
 * 
 * Extends BattleState with initiative system functionality.
 * This approach avoids modifying the core BattleState class and maintains separation of concerns.
 * 
 * @since Initiative System v1.0
 */

import type { InitiativeQueue, UnitActivation } from "../core/InitiativeQueue";
import { initiativeQueueManager } from "../core/InitiativeQueue";
import type { ScenarioUnit } from "../core/types";
import { isInitiativeUnit, type InitiativeUnit, toInitiativeUnit, resetUnitActivation, activateUnit } from "../core/InitiativeTypes";

/**
 * Extension interface for BattleState when initiative system is active
 * 
 * This provides the additional properties and methods needed for initiative management
 * without modifying the core BattleState class.
 */
export interface BattleStateInitiativeExtensions {
  /** Initiative queue state for the current turn (null when initiative system is inactive) */
  initiativeQueue: InitiativeQueue | null;
  /** Current activation being processed in the initiative system */
  currentActivation: UnitActivation | null;
  /** Whether the initiative system is currently active */
  isInitiativeSystemActive: boolean;
  /** Current turn phase for initiative system */
  turnPhase: 'initiative' | 'airShow' | 'ended';
}

/**
 * Manages initiative system state and operations for BattleState
 * 
 * This class handles the initiative-specific functionality that would otherwise
 * be added directly to BattleState, maintaining architectural separation.
 */
export class BattleStateInitiativeManager {
  private state: BattleStateInitiativeExtensions = {
    initiativeQueue: null,
    currentActivation: null,
    isInitiativeSystemActive: false,
    turnPhase: 'initiative'
  };

  /**
   * Initialize the initiative system for a new turn
   * 
   * @param units - All units to include in the initiative queue
   * @param turn - Current turn number
   * @throws Error if unit data is invalid
   */
  public initializeInitiativeTurn(units: readonly ScenarioUnit[], turn: number): void {
    // Convert units to InitiativeUnits if they aren't already
    const initiativeUnits = units.map(unit => 
      isInitiativeUnit(unit) ? unit : toInitiativeUnit(unit)
    );

    // Generate the initiative queue
    this.state.initiativeQueue = initiativeQueueManager.generateQueue(initiativeUnits, turn);
    this.state.currentActivation = null;
    this.state.isInitiativeSystemActive = true;
    this.state.turnPhase = 'initiative';

    // Reset activation state for all units
    for (const unit of initiativeUnits) {
      resetUnitActivation(unit);
    }
  }

  /**
   * Get the current initiative queue
   * 
   * @returns Current initiative queue or null if inactive
   */
  public getInitiativeQueue(): InitiativeQueue | null {
    return this.state.initiativeQueue ? { ...this.state.initiativeQueue } : null;
  }

  /**
   * Get the current activation being processed
   * 
   * @returns Current activation or null if none
   */
  public getCurrentActivation(): UnitActivation | null {
    return this.state.currentActivation ? { ...this.state.currentActivation } : null;
  }

  /**
   * Check if the initiative system is active
   * 
   * @returns True if initiative system is active
   */
  public isInitiativeActive(): boolean {
    return this.state.isInitiativeSystemActive;
  }

  /**
   * Get the current turn phase
   * 
   * @returns Current turn phase
   */
  public getTurnPhase(): 'initiative' | 'airShow' | 'ended' {
    return this.state.turnPhase;
  }

  /**
   * Process the next activation in the initiative queue
   * 
   * @returns Next activation or null if queue is exhausted
   * @throws Error if initiative system is not active
   */
  public processNextActivation(): UnitActivation | null {
    if (!this.state.isInitiativeSystemActive) {
      throw new Error('Initiative system is not active');
    }
    if (!this.state.initiativeQueue) {
      throw new Error('No initiative queue available');
    }

    const nextActivation = initiativeQueueManager.getNextActivation(this.state.initiativeQueue);
    if (nextActivation) {
      this.state.currentActivation = nextActivation;
    }

    return nextActivation;
  }

  /**
   * Mark the current activation as completed
   * 
   * @param unitId - ID of the unit to mark as activated
   * @param units - Current unit state to update activation on
   * @throws Error if unitId doesn't match current activation
   */
  public completeCurrentActivation(unitId: string, units: ScenarioUnit[]): void {
    if (!this.state.currentActivation) {
      throw new Error('No current activation to complete');
    }
    if (this.state.currentActivation.unitId !== unitId) {
      throw new Error(`Cannot complete activation for unit ${unitId}: current activation is ${this.state.currentActivation.unitId}`);
    }
    if (!this.state.initiativeQueue) {
      throw new Error('No initiative queue available');
    }

    const activeSortOrder = this.state.currentActivation.sortOrder;

    // Mark as activated in the queue
    initiativeQueueManager.markActivated(this.state.initiativeQueue, unitId, activeSortOrder);

    // Update the unit's activation state
    const unit = units.find(u => u.unitId === unitId);
    if (unit && isInitiativeUnit(unit)) {
      activateUnit(unit, activeSortOrder);
    }

    // Clear current activation
    this.state.currentActivation = null;
  }

  /**
   * Skip all remaining player activations (used when player ends turn early)
   * 
   * @param units - Current unit state to update
   * @throws Error if initiative system is not active
   */
  public skipRemainingPlayerActivations(units: ScenarioUnit[]): void {
    if (!this.state.isInitiativeSystemActive) {
      throw new Error('Initiative system is not active');
    }
    if (!this.state.initiativeQueue) {
      throw new Error('No initiative queue available');
    }

    // Skip player activations in the queue
    initiativeQueueManager.skipRemainingPlayerActivations(this.state.initiativeQueue);

    // Mark remaining player units as activated
    const remainingPlayerActivations = initiativeQueueManager.getRemainingActivations(
      this.state.initiativeQueue, 
      'player'
    );

    for (const activation of remainingPlayerActivations) {
      const unit = units.find(u => u.unitId === activation.unitId);
      if (unit && isInitiativeUnit(unit)) {
        activateUnit(unit, activation.sortOrder);
      }
    }
  }

  /**
   * Skip the current initiative group
   * 
   * @throws Error if initiative system is not active
   */
  public skipCurrentGroup(): void {
    if (!this.state.isInitiativeSystemActive) {
      throw new Error('Initiative system is not active');
    }
    if (!this.state.initiativeQueue) {
      throw new Error('No initiative queue available');
    }

    const queue = this.state.initiativeQueue;
    const currentActivation = initiativeQueueManager.getNextActivation(queue);
    if (!currentActivation) {
      this.state.currentActivation = null;
      return;
    }

    // In the standard queue model, a "group" is treated as contiguous
    // unactivated entries with the same initiative + owner.
    for (let i = queue.currentIndex; i < queue.activations.length; i += 1) {
      const activation = queue.activations[i];
      if (activation.isActivated) {
        continue;
      }

      if (
        activation.initiative !== currentActivation.initiative ||
        activation.ownerId !== currentActivation.ownerId
      ) {
        break;
      }

      (activation as UnitActivation).isActivated = true;
      if (queue.currentIndex <= i) {
        queue.currentIndex = i + 1;
      }
    }

    this.state.currentActivation = null;
  }

  /**
   * Check if the initiative queue is complete (all units activated)
   * 
   * @returns True if all units have been activated
   */
  public isQueueComplete(): boolean {
    if (!this.state.initiativeQueue) {
      return true;
    }

    return initiativeQueueManager.isQueueComplete(this.state.initiativeQueue);
  }

  /**
   * Transition to the air show phase
   * 
   * @throws Error if initiative system is not active
   */
  public transitionToAirShowPhase(): void {
    if (!this.state.isInitiativeSystemActive) {
      throw new Error('Initiative system is not active');
    }

    this.state.turnPhase = 'airShow';
    this.state.currentActivation = null;
  }

  /**
   * End the current turn and reset initiative state
   */
  public endTurn(): void {
    this.state.initiativeQueue = null;
    this.state.currentActivation = null;
    this.state.isInitiativeSystemActive = false;
    this.state.turnPhase = 'initiative';
  }

  /**
   * Get the current state snapshot (for debugging and testing)
   * 
   * @returns Current initiative state
   */
  public getStateSnapshot(): BattleStateInitiativeExtensions {
    return {
      initiativeQueue: this.state.initiativeQueue ? { ...this.state.initiativeQueue } : null,
      currentActivation: this.state.currentActivation ? { ...this.state.currentActivation } : null,
      isInitiativeSystemActive: this.state.isInitiativeSystemActive,
      turnPhase: this.state.turnPhase
    };
  }
}
