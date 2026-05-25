/**
 * Initiative Skip Handler
 * 
 * Provides comprehensive skip functionality for the initiative system.
 * Allows skipping individual units, remaining units in current group,
 * or all remaining units with proper validation and state management.
 * 
 * @since Initiative System v2.0
 */

import type { UnitActivation } from './InitiativeQueue';
import type { InitiativeGroup, GroupedInitiativeQueue } from './GroupedInitiativeQueue';
import { globalInitiativeEventSystem } from '../events/InitiativeEventSystem';

/**
 * Skip options and constraints
 */
export interface SkipOptions {
  /** Whether to require confirmation for destructive skips */
  requireConfirmation: boolean;
  /** Whether to allow skipping active units */
  allowSkipActive: boolean;
  /** Whether to show skip reasons */
  showReason: boolean;
  /** Custom reason for skip */
  reason?: string;
}

/**
 * Skip result information
 */
export interface SkipResult {
  /** Whether the skip was successful */
  success: boolean;
  /** Number of units skipped */
  unitsSkipped: number;
  /** IDs of skipped units */
  skippedUnitIds: string[];
  /** Next unit after skip (if any) */
  nextUnit: UnitActivation | null;
  /** Whether queue is exhausted */
  queueExhausted: boolean;
  /** Error message if skip failed */
  errorMessage?: string;
  /** Warning message if applicable */
  warningMessage?: string;
}

/**
 * Skip validation result
 */
export interface SkipValidation {
  /** Whether the skip is valid */
  isValid: boolean;
  /** Reason for invalidation */
  reason?: string;
  /** Warning message */
  warning?: string;
  /** Units that would be affected */
  affectedUnits: string[];
}

/**
 * Skip handler events
 */
export interface SkipHandlerEvents {
  /** Fired when units are skipped */
  onUnitsSkipped: (result: SkipResult) => void;
  /** Fired when skip validation fails */
  onSkipValidationFailed: (validation: SkipValidation) => void;
  /** Fired when skip is cancelled */
  onSkipCancelled: (reason: string) => void;
}

/**
 * Handles skipping functionality for initiative system
 */
export class InitiativeSkipHandler {
  private readonly options: SkipOptions;
  private readonly events: Partial<SkipHandlerEvents>;
  private skipHistory: SkipResult[] = [];

  constructor(options: Partial<SkipOptions> = {}, events: Partial<SkipHandlerEvents> = {}) {
    this.options = {
      requireConfirmation: false,
      allowSkipActive: true,
      showReason: true,
      ...options
    };
    this.events = events;
  }

  /**
   * Skip the current unit
   * 
   * @param queue - Current initiative queue
   * @param options - Skip options override
   * @returns Skip result
   */
  public skipCurrentUnit(
    queue: GroupedInitiativeQueue,
    options: Partial<SkipOptions> = {}
  ): SkipResult {
    const mergedOptions = { ...this.options, ...options };
    
    // Get current unit
    const currentGroup = queue.groups[queue.currentGroupIndex];
    if (!currentGroup || currentGroup.isCompleted) {
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: null,
        queueExhausted: true,
        errorMessage: 'No current unit to skip'
      };
    }

    const currentUnit = currentGroup.units[currentGroup.currentUnitIndex];
    if (!currentUnit) {
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: null,
        queueExhausted: true,
        errorMessage: 'No current unit to skip'
      };
    }

    // Validate skip
    const validation = this.validateSkipUnit(currentUnit, queue, mergedOptions);
    if (!validation.isValid) {
      this.events.onSkipValidationFailed?.(validation);
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: currentUnit,
        queueExhausted: false,
        errorMessage: validation.reason
      };
    }

    // Perform skip
    const result = this.performSkip([currentUnit], queue, mergedOptions);
    
    // Update queue state
    currentUnit.isActivated = true;
    currentGroup.currentUnitIndex++;

    // Check if group is completed
    if (currentGroup.currentUnitIndex >= currentGroup.units.length) {
      currentGroup.isCompleted = true;
      queue.currentGroupIndex++;
    }

    // Get next unit
    result.nextUnit = this.getNextUnit(queue);
    result.queueExhausted = result.nextUnit === null;

    // Record and emit events
    this.recordSkip(result);
    this.emitSkipEvents(result);

    return result;
  }

  /**
   * Skip all remaining units in the current group
   * 
   * @param queue - Current initiative queue
   * @param options - Skip options override
   * @returns Skip result
   */
  public skipCurrentGroup(
    queue: GroupedInitiativeQueue,
    options: Partial<SkipOptions> = {}
  ): SkipResult {
    const mergedOptions = { ...this.options, ...options };
    
    // Get current group
    const currentGroup = queue.groups[queue.currentGroupIndex];
    if (!currentGroup || currentGroup.isCompleted) {
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: null,
        queueExhausted: true,
        errorMessage: 'No current group to skip'
      };
    }

    // Get remaining units in group
    const remainingUnits = currentGroup.units.slice(currentGroup.currentUnitIndex);
    
    if (remainingUnits.length === 0) {
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: null,
        queueExhausted: false,
        errorMessage: 'No remaining units in current group'
      };
    }

    // Validate skip
    const validation = this.validateSkipUnits(remainingUnits, queue, mergedOptions);
    if (!validation.isValid) {
      this.events.onSkipValidationFailed?.(validation);
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: remainingUnits[0],
        queueExhausted: false,
        errorMessage: validation.reason
      };
    }

    // Perform skip
    const result = this.performSkip(remainingUnits, queue, mergedOptions);

    // Update queue state
    remainingUnits.forEach(unit => {
      unit.isActivated = true;
    });
    currentGroup.isCompleted = true;
    queue.currentGroupIndex++;

    // Get next unit
    result.nextUnit = this.getNextUnit(queue);
    result.queueExhausted = result.nextUnit === null;

    // Record and emit events
    this.recordSkip(result);
    this.emitSkipEvents(result);

    return result;
  }

  /**
   * Skip all remaining units in the entire queue
   * 
   * @param queue - Current initiative queue
   * @param options - Skip options override
   * @returns Skip result
   */
  public skipAllRemaining(
    queue: GroupedInitiativeQueue,
    options: Partial<SkipOptions> = {}
  ): SkipResult {
    const mergedOptions = { ...this.options, ...options };
    
    // Get all remaining units
    const remainingUnits: UnitActivation[] = [];
    
    for (let i = queue.currentGroupIndex; i < queue.groups.length; i++) {
      const group = queue.groups[i];
      if (group.isCompleted) continue;
      
      const startIndex = (i === queue.currentGroupIndex) ? group.currentUnitIndex : 0;
      const unitsInGroup = group.units.slice(startIndex);
      remainingUnits.push(...unitsInGroup);
    }

    if (remainingUnits.length === 0) {
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: null,
        queueExhausted: true,
        errorMessage: 'No remaining units to skip'
      };
    }

    // Validate skip
    const validation = this.validateSkipUnits(remainingUnits, queue, mergedOptions);
    if (!validation.isValid) {
      this.events.onSkipValidationFailed?.(validation);
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: remainingUnits[0],
        queueExhausted: false,
        errorMessage: validation.reason
      };
    }

    // Perform skip
    const result = this.performSkip(remainingUnits, queue, mergedOptions);

    // Update queue state
    remainingUnits.forEach(unit => {
      unit.isActivated = true;
    });
    
    // Mark all remaining groups as completed
    for (let i = queue.currentGroupIndex; i < queue.groups.length; i++) {
      queue.groups[i].isCompleted = true;
    }
    
    queue.currentGroupIndex = queue.groups.length;

    // Set next unit and exhaustion
    result.nextUnit = null;
    result.queueExhausted = true;

    // Record and emit events
    this.recordSkip(result);
    this.emitSkipEvents(result);

    return result;
  }

  /**
   * Skip specific units by ID
   * 
   * @param unitIds - Array of unit IDs to skip
   * @param queue - Current initiative queue
   * @param options - Skip options override
   * @returns Skip result
   */
  public skipSpecificUnits(
    unitIds: string[],
    queue: GroupedInitiativeQueue,
    options: Partial<SkipOptions> = {}
  ): SkipResult {
    const mergedOptions = { ...this.options, ...options };
    
    // Find units to skip
    const unitsToSkip: UnitActivation[] = [];
    
    queue.groups.forEach(group => {
      group.units.forEach(unit => {
        if (unitIds.includes(unit.unitId) && !unit.isActivated) {
          unitsToSkip.push(unit);
        }
      });
    });

    if (unitsToSkip.length === 0) {
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: this.getNextUnit(queue),
        queueExhausted: false,
        errorMessage: 'No valid units found to skip'
      };
    }

    // Validate skip
    const validation = this.validateSkipUnits(unitsToSkip, queue, mergedOptions);
    if (!validation.isValid) {
      this.events.onSkipValidationFailed?.(validation);
      return {
        success: false,
        unitsSkipped: 0,
        skippedUnitIds: [],
        nextUnit: this.getNextUnit(queue),
        queueExhausted: false,
        errorMessage: validation.reason
      };
    }

    // Perform skip
    const result = this.performSkip(unitsToSkip, queue, mergedOptions);

    // Update queue state
    unitsToSkip.forEach(unit => {
      unit.isActivated = true;
    });

    // Update group current unit indices if needed
    queue.groups.forEach(group => {
      while (group.currentUnitIndex < group.units.length && 
             group.units[group.currentUnitIndex].isActivated) {
        group.currentUnitIndex++;
      }
      
      if (group.currentUnitIndex >= group.units.length) {
        group.isCompleted = true;
      }
    });

    // Get next unit
    result.nextUnit = this.getNextUnit(queue);
    result.queueExhausted = result.nextUnit === null;

    // Record and emit events
    this.recordSkip(result);
    this.emitSkipEvents(result);

    return result;
  }

  /**
   * Validate if a unit can be skipped
   * 
   * @param unit - Unit to validate
   * @param queue - Current queue
   * @param options - Skip options
   * @returns Validation result
   */
  public validateSkipUnit(
    unit: UnitActivation,
    queue: GroupedInitiativeQueue,
    options: SkipOptions
  ): SkipValidation {
    const affectedUnits = [unit.unitId];

    // Check if unit is already activated
    if (unit.isActivated) {
      return {
        isValid: false,
        reason: 'Unit is already activated',
        affectedUnits
      };
    }

    // Check if unit is active and skipping is not allowed
    const currentUnit = this.getCurrentUnit(queue);
    if (currentUnit && currentUnit.unitId === unit.unitId && !options.allowSkipActive) {
      return {
        isValid: false,
        reason: 'Cannot skip currently active unit',
        affectedUnits
      };
    }

    return {
      isValid: true,
      affectedUnits
    };
  }

  /**
   * Validate if multiple units can be skipped
   * 
   * @param units - Units to validate
   * @param queue - Current queue
   * @param options - Skip options
   * @returns Validation result
   */
  public validateSkipUnits(
    units: UnitActivation[],
    queue: GroupedInitiativeQueue,
    options: SkipOptions
  ): SkipValidation {
    const affectedUnits = units.map(u => u.unitId);
    
    // Check each unit
    for (const unit of units) {
      const validation = this.validateSkipUnit(unit, queue, options);
      if (!validation.isValid) {
        return validation;
      }
    }

    // Check for warnings
    let warning: string | undefined;
    
    // Warn if skipping many units
    if (units.length > 5) {
      warning = `Skipping ${units.length} units may significantly impact game balance`;
    }

    // Warn if skipping current unit
    const currentUnit = this.getCurrentUnit(queue);
    if (currentUnit && units.some(u => u.unitId === currentUnit.unitId) && !options.allowSkipActive) {
      warning = 'Skipping currently active unit may disrupt game flow';
    }

    return {
      isValid: true,
      warning,
      affectedUnits
    };
  }

  /**
   * Get skip history
   * 
   * @param limit - Maximum number of records to return
   * @returns Array of skip results
   */
  public getSkipHistory(limit?: number): SkipResult[] {
    if (limit) {
      return this.skipHistory.slice(-limit);
    }
    return [...this.skipHistory];
  }

  /**
   * Clear skip history
   */
  public clearSkipHistory(): void {
    this.skipHistory = [];
  }

  /**
   * Get skip statistics
   * 
   * @returns Skip statistics
   */
  public getSkipStatistics(): {
    totalSkips: number;
    unitsSkipped: number;
    averageUnitsPerSkip: number;
    skipTypes: Record<string, number>;
  } {
    const skipTypes: Record<string, number> = {};
    let totalUnitsSkipped = 0;

    this.skipHistory.forEach(result => {
      if (result.success) {
        totalUnitsSkipped += result.unitsSkipped;
        
        // Categorize skip type
        let type = 'unknown';
        if (result.unitsSkipped === 1) {
          type = 'single';
        } else if (result.queueExhausted) {
          type = 'all';
        } else {
          type = 'group';
        }
        
        skipTypes[type] = (skipTypes[type] || 0) + 1;
      }
    });

    return {
      totalSkips: this.skipHistory.length,
      unitsSkipped: totalUnitsSkipped,
      averageUnitsPerSkip: this.skipHistory.length > 0 ? totalUnitsSkipped / this.skipHistory.length : 0,
      skipTypes
    };
  }

  /**
   * Get the current unit in the queue
   * 
   * @param queue - Initiative queue
   * @returns Current unit or null
   */
  private getCurrentUnit(queue: GroupedInitiativeQueue): UnitActivation | null {
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
   * Get the next unit in the queue
   * 
   * @param queue - Initiative queue
   * @returns Next unit or null
   */
  private getNextUnit(queue: GroupedInitiativeQueue): UnitActivation | null {
    // Check current group first
    const currentGroup = queue.groups[queue.currentGroupIndex];
    if (currentGroup && !currentGroup.isCompleted && currentGroup.currentUnitIndex < currentGroup.units.length) {
      return currentGroup.units[currentGroup.currentUnitIndex];
    }

    // Check next groups
    for (let i = queue.currentGroupIndex + 1; i < queue.groups.length; i++) {
      const group = queue.groups[i];
      if (!group.isCompleted && group.units.length > 0) {
        return group.units[0];
      }
    }

    return null;
  }

  /**
   * Perform the actual skip operation
   * 
   * @param units - Units to skip
   * @param queue - Current queue
   * @param options - Skip options
   * @returns Skip result
   */
  private performSkip(
    units: UnitActivation[],
    queue: GroupedInitiativeQueue,
    options: SkipOptions
  ): SkipResult {
    const skippedUnitIds = units.map(u => u.unitId);
    
    return {
      success: true,
      unitsSkipped: units.length,
      skippedUnitIds,
      nextUnit: null, // Will be set by caller
      queueExhausted: false, // Will be set by caller
      warningMessage: options.showReason ? options.reason : undefined
    };
  }

  /**
   * Record skip in history
   * 
   * @param result - Skip result
   */
  private recordSkip(result: SkipResult): void {
    this.skipHistory.push(result);
    
    // Maintain reasonable history size
    if (this.skipHistory.length > 1000) {
      this.skipHistory = this.skipHistory.slice(-500);
    }
  }

  /**
   * Emit skip-related events
   * 
   * @param result - Skip result
   */
  private emitSkipEvents(result: SkipResult): void {
    if (result.success) {
      this.events.onUnitsSkipped?.(result);
      
      // Emit global event
      globalInitiativeEventSystem.emit({
        id: `skip_${Date.now()}`,
        timestamp: Date.now(),
        type: 'units-skipped',
        source: 'InitiativeSkipHandler',
        unitsSkipped: result.unitsSkipped,
        skippedUnitIds: result.skippedUnitIds,
        nextUnitId: result.nextUnit?.unitId || null,
        queueExhausted: result.queueExhausted
      } as any);
    }
  }
}

/**
 * Create a skip handler with default configuration
 * 
 * @param options - Skip options
 * @param events - Event handlers
 * @returns Configured skip handler
 */
export function createInitiativeSkipHandler(
  options: Partial<SkipOptions> = {},
  events: Partial<SkipHandlerEvents> = {}
): InitiativeSkipHandler {
  return new InitiativeSkipHandler(options, {
    onUnitsSkipped: (result) => {
      console.log(`Skipped ${result.unitsSkipped} units:`, result.skippedUnitIds);
    },
    onSkipValidationFailed: (validation) => {
      console.warn(`Skip validation failed: ${validation.reason}`);
    },
    ...events
  });
}
