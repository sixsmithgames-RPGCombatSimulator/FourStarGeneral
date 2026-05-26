/**
 * Grouped Initiative Queue System
 * 
 * Extends the initiative queue to support grouped processing where all units
 * at the same initiative level act together before moving to the next level.
 * This ensures initiative values remain meaningful and prevents gaming the system.
 * 
 * @since Initiative System v2.0
 */

import type { ScenarioUnit } from './types';
import { InitiativeQueueManager, type UnitActivation, type InitiativeQueue } from './InitiativeQueue';
import { unitTypesData } from '../data/unitSystem/derivedUnitTypes';

/**
 * Represents a group of units with the same initiative value
 */
export interface InitiativeGroup {
  /** Initiative value for this group */
  initiative: number;
  /** All units in this group (sorted by owner: player first, then bot) */
  units: UnitActivation[];
  /** Whether this group has been completed */
  isCompleted: boolean;
  /** Current unit index within this group */
  currentUnitIndex: number;
}

/**
 * Enhanced queue interface for grouped initiative processing
 */
export interface GroupedInitiativeQueue {
  /** All initiative groups in order */
  groups: InitiativeGroup[];
  /** Current group index */
  currentGroupIndex: number;
  /** Current turn number */
  currentTurn: number;
  /** Total number of units across all groups */
  totalUnits: number;
}

/**
 * Events fired by the grouped initiative system
 */
export interface GroupedInitiativeEvents {
  /** Fired when a new group becomes active */
  onGroupActivated: (group: InitiativeGroup) => void;
  /** Fired when a group is completed */
  onGroupCompleted: (group: InitiativeGroup) => void;
  /** Fired when a unit becomes active */
  onUnitActivated: (unit: UnitActivation) => void;
  /** Fired when a unit is completed */
  onUnitCompleted: (unit: UnitActivation) => void;
  /** Fired when all groups are completed */
  onAllGroupsCompleted: () => void;
}

/**
 * Manages grouped initiative queue processing
 */
export class GroupedInitiativeQueueManager extends InitiativeQueueManager {
  private eventListeners: Partial<GroupedInitiativeEvents> = {};

  /**
   * Generate a grouped initiative queue from a collection of units
   * 
   * @param units - All units to consider for activation
   * @param turn - Current turn number
   * @returns Grouped initiative queue ready for processing
   */
  public generateGroupedQueue(units: readonly ScenarioUnit[], turn: number): GroupedInitiativeQueue {
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
          unitId: unit.unitId || `${unit.type}-${index}`,
          ownerId: unit.controlledBy === 'Player' ? 'player' : 'bot',
          initiative: unitDef?.initiative || 0,
          isActivated: false,
          sortOrder: index
        };
      });

    // Group units by initiative value
    const groupMap = new Map<number, UnitActivation[]>();
    
    activations.forEach(activation => {
      if (!groupMap.has(activation.initiative)) {
        groupMap.set(activation.initiative, []);
      }
      groupMap.get(activation.initiative)!.push(activation);
    });

    // Sort groups by initiative (descending)
    const sortedInitiatives = Array.from(groupMap.keys()).sort((a, b) => b - a);

    // Create initiative groups with proper sorting within each group
    const groups: InitiativeGroup[] = sortedInitiatives.map(initiative => {
      const groupUnits = groupMap.get(initiative)!;
      
      // Sort units within group: player first, then bot, then by original order
      groupUnits.sort((a, b) => {
        if (a.ownerId !== b.ownerId) {
          return a.ownerId === 'player' ? -1 : 1; // Player units first
        }
        return a.sortOrder - b.sortOrder; // Maintain original order
      });

      return {
        initiative,
        units: groupUnits,
        isCompleted: false,
        currentUnitIndex: 0
      };
    });

    return {
      groups,
      currentGroupIndex: 0,
      currentTurn: turn,
      totalUnits: activations.length
    };
  }

  /**
   * Get the current active group
   * 
   * @param queue - The grouped initiative queue
   * @returns Current group or null if no active group
   */
  public getCurrentGroup(queue: GroupedInitiativeQueue): InitiativeGroup | null {
    if (queue.currentGroupIndex >= queue.groups.length) {
      return null;
    }

    const currentGroup = queue.groups[queue.currentGroupIndex];
    
    // Skip completed groups
    while (currentGroup.isCompleted && queue.currentGroupIndex < queue.groups.length - 1) {
      queue.currentGroupIndex++;
      return this.getCurrentGroup(queue);
    }

    return currentGroup.isCompleted ? null : currentGroup;
  }

  /**
   * Get the current active unit within the current group
   * 
   * @param queue - The grouped initiative queue
   * @returns Current unit activation or null if no active unit
   */
  public getCurrentUnit(queue: GroupedInitiativeQueue): UnitActivation | null {
    const currentGroup = this.getCurrentGroup(queue);
    
    if (!currentGroup || currentGroup.currentUnitIndex >= currentGroup.units.length) {
      return null;
    }

    return currentGroup.units[currentGroup.currentUnitIndex];
  }

  /**
   * Get all remaining units in the current group
   * 
   * @param queue - The grouped initiative queue
   * @returns Array of remaining units in current group
   */
  public getRemainingUnitsInCurrentGroup(queue: GroupedInitiativeQueue): UnitActivation[] {
    const currentGroup = this.getCurrentGroup(queue);
    
    if (!currentGroup) {
      return [];
    }

    return currentGroup.units.slice(currentGroup.currentUnitIndex);
  }

  /**
   * Get all remaining player units in the current group
   * 
   * @param queue - The grouped initiative queue
   * @returns Array of remaining player units in current group
   */
  public getRemainingPlayerUnitsInCurrentGroup(queue: GroupedInitiativeQueue): UnitActivation[] {
    return this.getRemainingUnitsInCurrentGroup(queue)
      .filter(unit => unit.ownerId === 'player');
  }

  /**
   * Complete the current unit and advance to the next unit
   * 
   * @param queue - The grouped initiative queue
   * @param unitId - ID of the unit to complete
   * @returns True if unit was completed, false if unit not found
   */
  public completeCurrentUnit(queue: GroupedInitiativeQueue, unitId: string): boolean {
    const currentGroup = this.getCurrentGroup(queue);
    const currentUnit = this.getCurrentUnit(queue);

    if (!currentGroup || !currentUnit || currentUnit.unitId !== unitId) {
      throw new Error(`Cannot complete unit ${unitId}: not the current active unit`);
    }

    // Mark unit as activated
    currentUnit.isActivated = true;
    currentGroup.currentUnitIndex++;

    // Fire unit completion event
    this.fireEvent('onUnitCompleted', currentUnit);

    // Check if group is completed
    if (currentGroup.currentUnitIndex >= currentGroup.units.length) {
      this.completeCurrentGroup(queue);
    } else {
      // Activate next unit in group
      const nextUnit = this.getCurrentUnit(queue);
      if (nextUnit) {
        this.fireEvent('onUnitActivated', nextUnit);
      }
    }

    return true;
  }

  /**
   * Complete the current group and advance to the next group
   * 
   * @param queue - The grouped initiative queue
   */
  public completeCurrentGroup(queue: GroupedInitiativeQueue): void {
    const currentGroup = this.getCurrentGroup(queue);
    
    if (!currentGroup) {
      return;
    }

    // Mark all units in group as activated if not already done
    currentGroup.units.forEach(unit => {
      unit.isActivated = true;
    });

    currentGroup.isCompleted = true;
    this.fireEvent('onGroupCompleted', currentGroup);

    // Move to next group
    queue.currentGroupIndex++;

    // Activate next group if available
    const nextGroup = this.getCurrentGroup(queue);
    if (nextGroup) {
      this.fireEvent('onGroupActivated', nextGroup);
      const nextUnit = this.getCurrentUnit(queue);
      if (nextUnit) {
        this.fireEvent('onUnitActivated', nextUnit);
      }
    } else {
      // All groups completed
      this.fireEvent('onAllGroupsCompleted', {} as any);
    }
  }

  /**
   * Skip all remaining player units in the current group
   * 
   * @param queue - The grouped initiative queue
   */
  public skipRemainingPlayerUnitsInCurrentGroup(queue: GroupedInitiativeQueue): void {
    const currentGroup = this.getCurrentGroup(queue);
    
    if (!currentGroup) {
      return;
    }

    // Complete all remaining player units in the group
    const remainingPlayerUnits = this.getRemainingPlayerUnitsInCurrentGroup(queue);
    
    remainingPlayerUnits.forEach(unit => {
      unit.isActivated = true;
      this.fireEvent('onUnitCompleted', unit);
    });

    // Find the next bot unit or advance to next group
    const nextBotUnit = currentGroup.units.find((unit, index) => 
      index >= currentGroup.currentUnitIndex && 
      unit.ownerId === 'bot' && 
      !unit.isActivated
    );

    if (nextBotUnit) {
      // Advance to the next bot unit
      currentGroup.currentUnitIndex = currentGroup.units.indexOf(nextBotUnit);
      this.fireEvent('onUnitActivated', nextBotUnit);
    } else {
      // No more bot units, complete the group
      this.completeCurrentGroup(queue);
    }
  }

  /**
   * Check if the current group is completed
   * 
   * @param queue - The grouped initiative queue
   * @returns True if current group is completed
   */
  public isCurrentGroupCompleted(queue: GroupedInitiativeQueue): boolean {
    const currentGroup = this.getCurrentGroup(queue);
    return currentGroup?.isCompleted || false;
  }

  /**
   * Check if all groups are completed
   * 
   * @param queue - The grouped initiative queue
   * @returns True if all groups are completed
   */
  public isAllGroupsCompleted(queue: GroupedInitiativeQueue): boolean {
    return queue.currentGroupIndex >= queue.groups.length || 
           queue.groups.every(group => group.isCompleted);
  }

  /**
   * Get statistics about the current queue state
   * 
   * @param queue - The grouped initiative queue
   * @returns Queue statistics
   */
  public getQueueStatistics(queue: GroupedInitiativeQueue): {
    totalGroups: number;
    completedGroups: number;
    currentGroup: number;
    totalUnits: number;
    activatedUnits: number;
    remainingUnits: number;
    currentInitiative: number | null;
  } {
    const completedGroups = queue.groups.filter(group => group.isCompleted).length;
    const activatedUnits = queue.groups.flatMap(group => group.units)
      .filter(unit => unit.isActivated).length;
    const currentGroup = this.getCurrentGroup(queue);

    return {
      totalGroups: queue.groups.length,
      completedGroups,
      currentGroup: queue.currentGroupIndex + 1,
      totalUnits: queue.totalUnits,
      activatedUnits,
      remainingUnits: queue.totalUnits - activatedUnits,
      currentInitiative: currentGroup?.initiative || null
    };
  }

  /**
   * Reset the queue to initial state
   * 
   * @param queue - The grouped initiative queue to reset
   */
  public resetQueue(queue: GroupedInitiativeQueue): void;
  public resetQueue(queue: InitiativeQueue): void;
  public resetQueue(queue: InitiativeQueue | GroupedInitiativeQueue): void {
    // Handle both queue types
    if ('groups' in queue) {
      // GroupedInitiativeQueue
      queue.groups.forEach((group: InitiativeGroup) => {
        group.isCompleted = false;
        group.currentUnitIndex = 0;
        group.units.forEach((unit: UnitActivation) => {
          unit.isActivated = false;
        });
      });
      
      queue.currentGroupIndex = 0;
      
      // Activate first unit
      const firstUnit = this.getCurrentUnit(queue);
      if (firstUnit) {
        this.fireEvent('onUnitActivated', firstUnit);
      }
    } else {
      // Standard InitiativeQueue - call parent method
      super.resetQueue(queue);
    }
  }

  /**
   * Add event listener for grouped initiative events
   * 
   * @param event - Event name
   * @param listener - Event listener function
   */
  public addEventListener<K extends keyof GroupedInitiativeEvents>(
    event: K,
    listener: GroupedInitiativeEvents[K]
  ): void {
    this.eventListeners[event] = listener;
  }

  /**
   * Remove event listener
   * 
   * @param event - Event name to remove
   */
  public removeEventListener<K extends keyof GroupedInitiativeEvents>(
    event: K
  ): void {
    delete this.eventListeners[event];
  }

  /**
   * Fire an event if listener is registered
   * 
   * @param event - Event name
   * @param data - Event data
   */
  private fireEvent<K extends keyof GroupedInitiativeEvents>(
    event: K,
    data: Parameters<GroupedInitiativeEvents[K]>[0]
  ): void {
    const listener = this.eventListeners[event];
    if (listener) {
      (listener as any)(data);
    }
  }

  /**
   * Skip the current initiative group
   * 
   * @param queue - The grouped initiative queue
   */
  public skipCurrentGroup(queue: GroupedInitiativeQueue): void {
    const currentGroup = this.getCurrentGroup(queue);
    
    if (!currentGroup) {
      return;
    }

    // Mark all units in group as activated
    currentGroup.units.forEach(unit => {
      unit.isActivated = true;
    });

    // Mark group as completed
    currentGroup.isCompleted = true;
    currentGroup.currentUnitIndex = currentGroup.units.length;

    // Fire group completion event
    this.fireEvent('onGroupCompleted', currentGroup);

    // Move to next group
    queue.currentGroupIndex++;

    // Activate next group if available
    const nextGroup = this.getCurrentGroup(queue);
    if (nextGroup) {
      this.fireEvent('onGroupActivated', nextGroup);
      const nextUnit = this.getCurrentUnit(queue);
      if (nextUnit) {
        this.fireEvent('onUnitActivated', nextUnit);
      }
    }
  }

  /**
   * Convert a standard initiative queue to grouped format (for compatibility)
   * 
   * @param standardQueue - Standard initiative queue
   * @returns Grouped initiative queue
   */
  public convertToGroupedQueue(standardQueue: InitiativeQueue): GroupedInitiativeQueue {
    const groupMap = new Map<number, UnitActivation[]>();
    
    standardQueue.activations.forEach(activation => {
      if (!groupMap.has(activation.initiative)) {
        groupMap.set(activation.initiative, []);
      }
      groupMap.get(activation.initiative)!.push(activation);
    });

    const groups: InitiativeGroup[] = Array.from(groupMap.entries())
      .sort(([a], [b]) => b - a)
      .map(([initiative, units]) => ({
        initiative,
        units,
        isCompleted: units.every(unit => unit.isActivated),
        currentUnitIndex: units.findIndex(unit => !unit.isActivated)
      }));

    return {
      groups,
      currentGroupIndex: 0,
      currentTurn: standardQueue.currentTurn,
      totalUnits: standardQueue.activations.length
    };
  }
}
