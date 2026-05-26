/**
 * Initiative Queue System
 * 
 * Manages unit activation order based on initiative values.
 * Implements alternating player/bot activation sequence.
 * 
 * @since Initiative System v1.0
 */

import type { ScenarioUnit } from './types';
import { unitTypesData } from '../data/unitSystem/derivedUnitTypes';

/**
 * Represents a single unit's activation in the turn queue
 */
export interface UnitActivation {
  /** Unique identifier for the unit */
  readonly unitId: string;
  /** Owner of the unit */
  readonly ownerId: 'player' | 'bot';
  /** Unit's initiative value (higher = earlier activation) */
  readonly initiative: number;
  /** Whether this unit has been activated this turn */
  isActivated: boolean;
  /** Position in the original sorted order (for tie-breaking) */
  readonly sortOrder: number;
}

/**
 * Complete initiative queue for a turn
 */
export interface InitiativeQueue {
  /** All unit activations for this turn */
  readonly activations: readonly UnitActivation[];
  /** Current position in the activation sequence */
  currentIndex: number;
  /** Current turn number */
  readonly currentTurn: number;
}

/**
 * Manages initiative queue generation and processing
 * 
 * Responsibilities:
 * - Generate sorted activation queues from unit collections
 * - Track activation state during turn processing
 * - Provide queue navigation methods
 * 
 * @sealed This class contains only pure logic, no UI or external dependencies
 */
export class InitiativeQueueManager {
  /**
   * Generate an initiative queue from a collection of units
   * 
   * @param units - All units to consider for activation
   * @param turn - Current turn number
   * @returns Sorted initiative queue ready for processing
   * 
   * @throws Error if unit data is invalid
   */
  public generateQueue(units: readonly ScenarioUnit[], turn: number): InitiativeQueue {
    // Validate inputs
    if (!Array.isArray(units)) {
      throw new Error('Units must be an array');
    }
    if (typeof turn !== 'number' || turn < 0) {
      throw new Error('Turn must be a non-negative number');
    }

    // Filter out aircraft (initiative 0) and create activation entries
    const activations: UnitActivation[] = units
      .filter(unit => {
        // Get initiative from unit type definition
        const unitDef = unitTypesData[unit.type as keyof typeof unitTypesData];
        return unitDef && unitDef.initiative > 0; // Exclude aircraft
      })
      .map((unit, index) => {
        const unitDef = unitTypesData[unit.type as keyof typeof unitTypesData];
        return {
          unitId: unit.unitId || `${unit.type}-${index}`, // Fallback ID if unitId is missing
          ownerId: unit.controlledBy === 'Player' ? 'player' : 'bot',
          initiative: unitDef?.initiative || 0,
          isActivated: false,
          sortOrder: index
        };
      });

    // Group by initiative and interleave player/bot activations within each initiative band.
    const groupedByInitiative = new Map<number, { player: UnitActivation[]; bot: UnitActivation[] }>();
    activations.forEach((activation) => {
      const existing = groupedByInitiative.get(activation.initiative) ?? { player: [], bot: [] };
      if (activation.ownerId === 'player') {
        existing.player.push(activation);
      } else {
        existing.bot.push(activation);
      }
      groupedByInitiative.set(activation.initiative, existing);
    });

    const initiativesDescending = Array.from(groupedByInitiative.keys()).sort((left, right) => right - left);
    const interleavedActivations: UnitActivation[] = [];

    initiativesDescending.forEach((initiative) => {
      const group = groupedByInitiative.get(initiative);
      if (!group) {
        return;
      }
      const playerQueue = [...group.player].sort((left, right) => left.sortOrder - right.sortOrder);
      const botQueue = [...group.bot].sort((left, right) => left.sortOrder - right.sortOrder);

      while (playerQueue.length > 0 || botQueue.length > 0) {
        const nextPlayer = playerQueue.shift();
        if (nextPlayer) {
          interleavedActivations.push(nextPlayer);
        }
        const nextBot = botQueue.shift();
        if (nextBot) {
          interleavedActivations.push(nextBot);
        }
      }
    });

    return {
      activations: Object.freeze(interleavedActivations),
      currentIndex: 0,
      currentTurn: turn
    };
  }

  /**
   * Get the next unit activation that hasn't been processed
   * 
   * @param queue - Current initiative queue
   * @returns Next activation or null if queue is exhausted
   */
  public getNextActivation(queue: InitiativeQueue): UnitActivation | null {
    if (!queue || !Array.isArray(queue.activations)) {
      throw new Error('Invalid queue provided');
    }

    // Find next unactivated unit starting from current position
    for (let i = queue.currentIndex; i < queue.activations.length; i++) {
      if (!queue.activations[i].isActivated) {
        return queue.activations[i];
      }
    }

    return null; // No more unactivated units
  }

  /**
   * Mark a unit as activated and advance the queue position
   * 
   * @param queue - Current initiative queue (will be mutated)
   * @param unitId - ID of unit to mark as activated
   * @param expectedSortOrder - Optional sort-order hint to disambiguate duplicate unit IDs
   * 
   * @throws Error if unitId is not found or already activated
   */
  public markActivated(queue: InitiativeQueue, unitId: string, expectedSortOrder?: number): void {
    if (!queue || !Array.isArray(queue.activations)) {
      throw new Error('Invalid queue provided');
    }
    if (!unitId || typeof unitId !== 'string') {
      throw new Error('Unit ID must be a non-empty string');
    }

    // Find the activation entry. Prefer an exact unitId+sortOrder match when available
    // so duplicate unit IDs do not advance the queue to the wrong position.
    let activationIndex = -1;
    if (typeof expectedSortOrder === 'number') {
      activationIndex = queue.activations.findIndex(
        (activation) => activation.unitId === unitId && activation.sortOrder === expectedSortOrder
      );
    }

    if (activationIndex === -1) {
      activationIndex = queue.activations.findIndex(
        (activation) => activation.unitId === unitId && !activation.isActivated
      );
    }

    if (activationIndex === -1) {
      activationIndex = queue.activations.findIndex(
        (activation) => activation.unitId === unitId
      );
    }

    if (activationIndex === -1) {
      throw new Error(`Unit ${unitId} not found in initiative queue`);
    }

    const activation = queue.activations[activationIndex];
    if (activation.isActivated) {
      throw new Error(`Unit ${unitId} is already activated`);
    }

    // Mark as activated and advance position if needed
    (activation as UnitActivation).isActivated = true;
    
    // Update current index to point to next unactivated unit
    if (queue.currentIndex <= activationIndex) {
      queue.currentIndex = activationIndex + 1;
    }

    while (queue.currentIndex < queue.activations.length && queue.activations[queue.currentIndex]?.isActivated) {
      queue.currentIndex += 1;
    }
  }

  /**
   * Skip all remaining player activations in the current turn
   * 
   * This is used when the player ends their turn early.
   * 
   * @param queue - Current initiative queue (will be mutated)
   */
  public skipRemainingPlayerActivations(queue: InitiativeQueue): void {
    if (!queue || !Array.isArray(queue.activations)) {
      throw new Error('Invalid queue provided');
    }

    // Mark all remaining player units as activated
    for (let i = queue.currentIndex; i < queue.activations.length; i++) {
      const activation = queue.activations[i];
      if (activation.ownerId === 'player' && !activation.isActivated) {
        (activation as UnitActivation).isActivated = true;
      }
    }

    // Advance index past all player units
    while (queue.currentIndex < queue.activations.length && 
           queue.activations[queue.currentIndex].ownerId === 'player') {
      queue.currentIndex++;
    }
  }

  /**
   * Get all remaining unactivated units for a specific owner
   * 
   * @param queue - Current initiative queue
   * @param ownerId - Owner to filter by ('player' | 'bot')
   * @returns Array of remaining activations for specified owner
   */
  public getRemainingActivations(
    queue: InitiativeQueue, 
    ownerId: 'player' | 'bot'
  ): readonly UnitActivation[] {
    if (!queue || !Array.isArray(queue.activations)) {
      throw new Error('Invalid queue provided');
    }
    if (ownerId !== 'player' && ownerId !== 'bot') {
      throw new Error('Owner ID must be "player" or "bot"');
    }

    return queue.activations.filter(
      activation => activation.ownerId === ownerId && !activation.isActivated
    );
  }

  /**
   * Check if the queue is completely processed (all units activated)
   * 
   * @param queue - Current initiative queue
   * @returns True if all units have been activated
   */
  public isQueueComplete(queue: InitiativeQueue): boolean {
    if (!queue || !Array.isArray(queue.activations)) {
      throw new Error('Invalid queue provided');
    }

    return queue.activations.every(activation => activation.isActivated);
  }

  /**
   * Get the current activation being processed
   * 
   * @param queue - Current initiative queue
   * @returns Current activation or null if no current activation
   */
  public getCurrentActivation(queue: InitiativeQueue): UnitActivation | null {
    if (!queue || !Array.isArray(queue.activations)) {
      throw new Error('Invalid queue provided');
    }

    if (queue.currentIndex >= queue.activations.length) {
      return null;
    }

    const current = queue.activations[queue.currentIndex];
    return current.isActivated ? null : current;
  }

  /**
   * Reset activation state for all units in the queue
   * 
   * Used when starting a new turn or retrying a turn.
   * 
   * @param queue - Initiative queue to reset (will be mutated)
   */
  public resetQueue(queue: InitiativeQueue): void {
    if (!queue || !Array.isArray(queue.activations)) {
      throw new Error('Invalid queue provided');
    }

    // Reset all activation states
    for (const activation of queue.activations) {
      (activation as UnitActivation).isActivated = false;
    }
    
    // Reset position to start
    queue.currentIndex = 0;
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const initiativeQueueManager = new InitiativeQueueManager();
