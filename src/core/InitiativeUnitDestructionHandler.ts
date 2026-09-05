/**
 * Initiative Unit Destruction Handler
 * 
 * Handles unit destruction during initiative turns, ensuring proper
 * queue cleanup and state management when units are destroyed
 * while active or waiting in the queue.
 * 
 * @since Initiative System v2.0
 */

import type { UnitActivation } from './InitiativeQueue';
import type { GroupedInitiativeQueue } from './GroupedInitiativeQueue';
import { globalInitiativeEventSystem } from '../events/InitiativeEventSystem';

/**
 * Unit destruction context
 */
export interface UnitDestructionContext {
  /** ID of the destroyed unit */
  unitId: string;
  /** Reason for destruction */
  reason: 'combat' | 'abandon' | 'scripted' | 'unknown';
  /** Unit that caused destruction (if applicable) */
  sourceUnitId?: string;
  /** Timestamp of destruction */
  timestamp: number;
  /** Hex where destruction occurred */
  hex?: { q: number; r: number };
}

/**
 * Destruction impact analysis
 */
export interface DestructionImpact {
  /** Whether the destroyed unit was currently active */
  wasActive: boolean;
  /** Whether the destroyed unit was in the current group */
  wasInCurrentGroup: boolean;
  /** Group index where unit was located */
  groupIndex: number;
  /** Position within the group */
  positionInGroup: number;
  /** Units remaining in the group */
  unitsRemainingInGroup: number;
  /** Whether the current group is now empty */
  isCurrentGroupEmpty: boolean;
  /** Whether all units are destroyed */
  areAllUnitsDestroyed: boolean;
}

/**
 * Destruction handler events
 */
export interface DestructionHandlerEvents {
  /** Fired when a unit is destroyed during initiative */
  onUnitDestroyed: (context: UnitDestructionContext, impact: DestructionImpact) => void;
  /** Fired when current unit is destroyed */
  onActiveUnitDestroyed: (context: UnitDestructionContext, nextUnit: UnitActivation | null) => void;
  /** Fired when current group becomes empty */
  onGroupEmptied: (groupIndex: number, initiative: number) => void;
  /** Fired when all units are destroyed */
  onAllUnitsDestroyed: () => void;
}

/**
 * Handles unit destruction during initiative turns
 */
export class InitiativeUnitDestructionHandler {
  private readonly events: Partial<DestructionHandlerEvents>;
  private destructionHistory: UnitDestructionContext[] = [];

  constructor(events: Partial<DestructionHandlerEvents> = {}) {
    this.events = events;
  }

  /**
   * Handle unit destruction and update initiative queue
   * 
   * @param unitId - ID of the destroyed unit
   * @param queue - Current initiative queue
   * @param context - Destruction context
   * @returns Updated queue and impact analysis
   */
  public handleUnitDestruction(
    unitId: string,
    queue: GroupedInitiativeQueue,
    context: Partial<UnitDestructionContext> = {}
  ): {
    updatedQueue: GroupedInitiativeQueue;
    impact: DestructionImpact;
    destructionContext: UnitDestructionContext;
  } {
    // Create full destruction context
    const fullContext: UnitDestructionContext = {
      unitId,
      reason: 'unknown',
      timestamp: Date.now(),
      ...context
    };

    // Analyze impact
    const impact = this.analyzeDestructionImpact(unitId, queue);

    // Update queue by removing destroyed unit
    const updatedQueue = this.removeUnitFromQueue(unitId, queue);

    // Record destruction
    this.recordDestruction(fullContext);

    // Fire events
    this.fireDestructionEvents(fullContext, impact, updatedQueue);

    // Emit global events
    this.emitGlobalEvents(fullContext, impact);

    return {
      updatedQueue,
      impact,
      destructionContext: fullContext
    };
  }

  /**
   * Handle multiple unit destructions (e.g., area effects)
   * 
   * @param unitIds - Array of destroyed unit IDs
   * @param queue - Current initiative queue
   * @param context - Base destruction context
   * @returns Updated queue and array of impacts
   */
  public handleMultipleDestructions(
    unitIds: string[],
    queue: GroupedInitiativeQueue,
    context: Partial<UnitDestructionContext> = {}
  ): {
    updatedQueue: GroupedInitiativeQueue;
    impacts: DestructionImpact[];
    destructionContexts: UnitDestructionContext[];
  } {
    let currentQueue = queue;
    const impacts: DestructionImpact[] = [];
    const destructionContexts: UnitDestructionContext[] = [];

    // Process each destruction
    unitIds.forEach(unitId => {
      const result = this.handleUnitDestruction(unitId, currentQueue, context);
      currentQueue = result.updatedQueue;
      impacts.push(result.impact);
      destructionContexts.push(result.destructionContext);
    });

    return {
      updatedQueue: currentQueue,
      impacts,
      destructionContexts
    };
  }

  /**
   * Check if a unit can be safely destroyed
   * 
   * @param unitId - Unit ID to check
   * @param queue - Current initiative queue
   * @returns True if destruction is safe
   */
  public canDestroyUnit(unitId: string, queue: GroupedInitiativeQueue): boolean {
    // Unit can always be destroyed, but we check for edge cases
    const impact = this.analyzeDestructionImpact(unitId, queue);
    
    // Warn if destroying the last unit
    if (impact.areAllUnitsDestroyed) {
      console.warn(`Destroying unit ${unitId} will end the initiative turn`);
    }

    return true;
  }

  /**
   * Get destruction history
   * 
   * @param limit - Maximum number of records to return
   * @returns Array of destruction contexts
   */
  public getDestructionHistory(limit?: number): UnitDestructionContext[] {
    if (limit) {
      return this.destructionHistory.slice(-limit);
    }
    return [...this.destructionHistory];
  }

  /**
   * Clear destruction history
   */
  public clearDestructionHistory(): void {
    this.destructionHistory = [];
  }

  /**
   * Get statistics about destructions
   * 
   * @returns Destruction statistics
   */
  public getDestructionStatistics(): {
    totalDestructions: number;
    destructionsByReason: Record<string, number>;
    activeUnitsDestroyed: number;
    groupsEmptied: number;
  } {
    const destructionsByReason: Record<string, number> = {};
    const activeUnitsDestroyed = 0;
    const groupsEmptied = 0;

    this.destructionHistory.forEach(context => {
      destructionsByReason[context.reason] = (destructionsByReason[context.reason] || 0) + 1;
    });

    // Note: This would require tracking impact data in history for full accuracy
    // For now, we provide basic statistics

    return {
      totalDestructions: this.destructionHistory.length,
      destructionsByReason,
      activeUnitsDestroyed,
      groupsEmptied
    };
  }

  /**
   * Analyze the impact of unit destruction
   * 
   * @param unitId - ID of the destroyed unit
   * @param queue - Current initiative queue
   * @returns Impact analysis
   */
  private analyzeDestructionImpact(unitId: string, queue: GroupedInitiativeQueue): DestructionImpact {
    let wasActive = false;
    let wasInCurrentGroup = false;
    let groupIndex = -1;
    let positionInGroup = -1;
    let unitsRemainingInGroup = 0;
    let isCurrentGroupEmpty = false;

    // Find the unit in the queue
    queue.groups.forEach((group, gIndex) => {
      const unitIndex = group.units.findIndex(unit => unit.unitId === unitId);
      
      if (unitIndex !== -1) {
        groupIndex = gIndex;
        positionInGroup = unitIndex;
        wasInCurrentGroup = gIndex === queue.currentGroupIndex;
        
        // Check if unit was active
        if (wasInCurrentGroup && unitIndex === group.currentUnitIndex) {
          wasActive = true;
        }
        
        // Calculate remaining units in group
        unitsRemainingInGroup = group.units.length - 1;
        isCurrentGroupEmpty = unitsRemainingInGroup === 0 && wasInCurrentGroup;
      }
    });

    const totalUnits = queue.groups.reduce((sum, group) => sum + group.units.length, 0);
    const areAllUnitsDestroyed = totalUnits <= 1; // Will be 0 after removal

    return {
      wasActive,
      wasInCurrentGroup,
      groupIndex,
      positionInGroup,
      unitsRemainingInGroup,
      isCurrentGroupEmpty,
      areAllUnitsDestroyed
    };
  }

  /**
   * Remove a unit from the initiative queue
   * 
   * @param unitId - ID of unit to remove
   * @param queue - Current initiative queue
   * @returns Updated queue
   */
  private removeUnitFromQueue(unitId: string, queue: GroupedInitiativeQueue): GroupedInitiativeQueue {
    // Create deep copy of queue
    const updatedQueue: GroupedInitiativeQueue = {
      groups: queue.groups.map(group => ({
        initiative: group.initiative,
        units: [...group.units],
        isCompleted: group.isCompleted,
        currentUnitIndex: group.currentUnitIndex
      })),
      currentGroupIndex: queue.currentGroupIndex,
      currentTurn: queue.currentTurn,
      totalUnits: queue.totalUnits
    };

    // Remove unit from its group
    updatedQueue.groups.forEach((group, groupIndex) => {
      const unitIndex = group.units.findIndex(unit => unit.unitId === unitId);
      
      if (unitIndex !== -1) {
        // Remove the unit
        group.units.splice(unitIndex, 1);
        
        // Adjust current unit index if necessary
        if (groupIndex === queue.currentGroupIndex) {
          if (unitIndex < group.currentUnitIndex) {
            group.currentUnitIndex--;
          } else if (unitIndex === group.currentUnitIndex) {
            // Current unit was destroyed - index stays the same (points to next unit)
            if (group.currentUnitIndex >= group.units.length) {
              // No more units in this group
              group.currentUnitIndex = 0;
              group.isCompleted = true;
            }
          }
        }
        
        // Mark group as completed if no units remain
        if (group.units.length === 0) {
          group.isCompleted = true;
        }
      }
    });

    // Remove empty groups
    updatedQueue.groups = updatedQueue.groups.filter(group => group.units.length > 0);

    // Adjust current group index if necessary
    if (updatedQueue.currentGroupIndex >= updatedQueue.groups.length) {
      updatedQueue.currentGroupIndex = Math.max(0, updatedQueue.groups.length - 1);
    }

    // Update total units count
    updatedQueue.totalUnits = updatedQueue.groups.reduce((sum, group) => sum + group.units.length, 0);

    return updatedQueue;
  }

  /**
   * Record destruction in history
   * 
   * @param context - Destruction context
   */
  private recordDestruction(context: UnitDestructionContext): void {
    this.destructionHistory.push(context);
    
    // Maintain reasonable history size
    if (this.destructionHistory.length > 1000) {
      this.destructionHistory = this.destructionHistory.slice(-500);
    }
  }

  /**
   * Fire destruction-related events
   * 
   * @param context - Destruction context
   * @param impact - Impact analysis
   * @param updatedQueue - Updated queue
   */
  private fireDestructionEvents(
    context: UnitDestructionContext,
    impact: DestructionImpact,
    updatedQueue: GroupedInitiativeQueue
  ): void {
    // General destruction event
    this.events.onUnitDestroyed?.(context, impact);

    // Active unit destruction
    if (impact.wasActive) {
      const nextUnit = this.getNextUnit(updatedQueue);
      this.events.onActiveUnitDestroyed?.(context, nextUnit);
    }

    // Group emptied
    if (impact.isCurrentGroupEmpty) {
      const groupInitiative = this.getGroupInitiative(updatedQueue, impact.groupIndex);
      if (groupInitiative !== null) {
        this.events.onGroupEmptied?.(impact.groupIndex, groupInitiative);
      }
    }

    // All units destroyed
    if (impact.areAllUnitsDestroyed) {
      this.events.onAllUnitsDestroyed?.();
    }
  }

  /**
   * Emit global events for destruction
   * 
   * @param context - Destruction context
   * @param impact - Impact analysis
   */
  private emitGlobalEvents(context: UnitDestructionContext, impact: DestructionImpact): void {
    // Emit unit-specific event
    globalInitiativeEventSystem.emit({
      id: `destruction_${context.unitId}_${Date.now()}`,
      timestamp: context.timestamp,
      type: 'unit-destroyed',
      source: 'InitiativeDestructionHandler',
      unitId: context.unitId,
      reason: context.reason,
      sourceUnitId: context.sourceUnitId,
      hex: context.hex,
      wasActive: impact.wasActive,
      wasInCurrentGroup: impact.wasInCurrentGroup
    } as any);
  }

  /**
   * Get the next unit in the queue
   * 
   * @param queue - Initiative queue
   * @returns Next unit or null
   */
  private getNextUnit(queue: GroupedInitiativeQueue): UnitActivation | null {
    const currentGroup = queue.groups[queue.currentGroupIndex];
    if (!currentGroup || currentGroup.isCompleted) {
      return null;
    }

    if (currentGroup.currentUnitIndex < currentGroup.units.length) {
      return currentGroup.units[currentGroup.currentUnitIndex];
    }

    return null;
  }

  /**
   * Get initiative value for a group
   * 
   * @param queue - Initiative queue
   * @param groupIndex - Group index
   * @returns Initiative value or null
   */
  private getGroupInitiative(queue: GroupedInitiativeQueue, groupIndex: number): number | null {
    const group = queue.groups[groupIndex];
    return group ? group.initiative : null;
  }
}

/**
 * Create a destruction handler with default event logging
 * 
 * @returns Configured destruction handler
 */
export function createInitiativeDestructionHandler(): InitiativeUnitDestructionHandler {
  return new InitiativeUnitDestructionHandler({
    onUnitDestroyed: (context, impact) => {
      console.log(`Unit ${context.unitId} destroyed (${context.reason}) - Impact:`, impact);
    },
    onActiveUnitDestroyed: (context, nextUnit) => {
      console.log(`Active unit ${context.unitId} destroyed - Next: ${nextUnit?.unitId || 'none'}`);
    },
    onGroupEmptied: (groupIndex, initiative) => {
      console.log(`Group ${groupIndex} (initiative ${initiative}) emptied`);
    },
    onAllUnitsDestroyed: () => {
      console.log('All units destroyed - initiative turn ended');
    }
  });
}
