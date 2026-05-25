/**
 * Initiative System Action Validator
 * 
 * Validates unit actions based on initiative system state.
 * Ensures that only currently active units can perform actions.
 * 
 * @since Initiative System v1.0
 */

import type { UnitActivation } from '../core/InitiativeQueue';
import type { ScenarioUnit } from '../core/types';

/**
 * Types of unit actions that can be validated
 */
export type UnitActionType = 
  | 'move'
  | 'attack'
  | 'support'
  | 'deploy'
  | 'entrench'
  | 'repair'
  | 'resupply'
  | 'tow'
  | 'sentry'
  | 'face';

/**
 * Result of action validation
 */
export interface ActionValidationResult {
  /** Whether the action is allowed */
  isValid: boolean;
  /** Reason for validation failure (if invalid) */
  reason?: string;
  /** Suggested corrective action (if applicable) */
  suggestion?: string;
}

/**
 * Context for action validation
 */
export interface ActionValidationContext {
  /** Current activation in the initiative queue */
  currentActivation: UnitActivation | null;
  /** Whether the initiative system is active */
  isInitiativeSystemActive: boolean;
  /** Current turn phase */
  currentPhase: string;
  /** Current active faction */
  activeFaction: 'Player' | 'Bot' | 'Ally';
}

/**
 * Validates unit actions based on initiative system state
 * 
 * This class ensures that the initiative system's rules are enforced
 * when units attempt to perform actions during battle.
 */
export class InitiativeActionValidator {
  /**
   * Validate a unit action based on initiative system state
   * 
   * @param unitId - ID of the unit attempting the action
   * @param actionType - Type of action being attempted
   * @param context - Current validation context
   * @param unit - The unit attempting the action (optional, for additional validation)
   * @returns Validation result with detailed information
   */
  public validateAction(
    unitId: string,
    actionType: UnitActionType,
    context: ActionValidationContext,
    unit?: ScenarioUnit
  ): ActionValidationResult {
    // If initiative system is not active, allow all actions (fallback to normal turn management)
    if (!context.isInitiativeSystemActive) {
      return { isValid: true };
    }

    // Check if there's a current activation
    if (!context.currentActivation) {
      return {
        isValid: false,
        reason: 'No unit is currently active in the initiative queue',
        suggestion: 'Wait for the next unit activation or end the turn'
      };
    }

    // Check if the unit is the currently active unit
    if (context.currentActivation.unitId !== unitId) {
      const currentUnitLabel = this.getUnitLabel(context.currentActivation.unitId, unit);
      return {
        isValid: false,
        reason: `Unit ${unitId} is not currently active. ${currentUnitLabel} is active.`,
        suggestion: 'Wait for this unit\'s turn in the initiative order'
      };
    }

    // Check if the action is allowed for the current faction
    if (!this.isActionAllowedForFaction(actionType, context.currentActivation.ownerId, context.activeFaction)) {
      return {
        isValid: false,
        reason: `Action ${actionType} is not allowed for ${context.currentActivation.ownerId} units during ${context.activeFaction} phase`,
        suggestion: 'Wait for the appropriate turn phase'
      };
    }

    // Additional phase-specific validation
    const phaseValidation = this.validateActionForPhase(actionType, context.currentPhase);
    if (!phaseValidation.isValid) {
      return phaseValidation;
    }

    // Unit-specific validation (if unit data is provided)
    if (unit) {
      const unitValidation = this.validateActionForUnit(actionType, unit, context);
      if (!unitValidation.isValid) {
        return unitValidation;
      }
    }

    return { isValid: true };
  }

  /**
   * Validate multiple actions at once (useful for complex actions)
   * 
   * @param actions - Array of actions to validate
   * @param context - Current validation context
   * @returns Array of validation results
   */
  public validateMultipleActions(
    actions: Array<{ unitId: string; actionType: UnitActionType; unit?: ScenarioUnit }>,
    context: ActionValidationContext
  ): ActionValidationResult[] {
    return actions.map(action => 
      this.validateAction(action.unitId, action.actionType, context, action.unit)
    );
  }

  /**
   * Check if a unit can perform any actions (is it currently active?)
   * 
   * @param unitId - ID of the unit to check
   * @param context - Current validation context
   * @returns True if the unit can perform actions
   */
  public canUnitAct(unitId: string, context: ActionValidationContext): boolean {
    if (!context.isInitiativeSystemActive) {
      return true;
    }

    return context.currentActivation !== null && context.currentActivation.unitId === unitId;
  }

  /**
   * Get the currently active unit's ID
   * 
   * @param context - Current validation context
   * @returns ID of currently active unit or null if none
   */
  public getActiveUnitId(context: ActionValidationContext): string | null {
    return context.currentActivation?.unitId || null;
  }

  /**
   * Get a human-readable description of the current activation state
   * 
   * @param context - Current validation context
   * @returns Description of current activation state
   */
  public getActivationStateDescription(context: ActionValidationContext): string {
    if (!context.isInitiativeSystemActive) {
      return 'Initiative system is not active';
    }

    if (!context.currentActivation) {
      return 'No unit is currently active';
    }

    const unit = this.getUnitLabel(context.currentActivation.unitId);
    const faction = context.currentActivation.ownerId === 'player' ? 'Player' : 'Bot';
    const initiative = context.currentActivation.initiative;

    return `${unit} (${faction}, Initiative ${initiative}) is currently active`;
  }

  /**
   * Check if an action type is allowed for a specific faction
   * 
   * @param actionType - Type of action to check
   * @param unitOwner - Owner of the unit attempting the action
   * @param activeFaction - Currently active faction
   * @returns True if the action is allowed
   */
  private isActionAllowedForFaction(
    actionType: UnitActionType,
    unitOwner: 'player' | 'bot',
    activeFaction: 'Player' | 'Bot' | 'Ally'
  ): boolean {
    // Player units can only act during Player phase
    if (unitOwner === 'player' && activeFaction !== 'Player') {
      return false;
    }

    // Bot units can only act during Bot phase
    if (unitOwner === 'bot' && activeFaction !== 'Bot') {
      return false;
    }

    return true;
  }

  /**
   * Validate an action based on the current phase
   * 
   * @param actionType - Type of action to validate
   * @param currentPhase - Current turn phase
   * @returns Validation result
   */
  private validateActionForPhase(actionType: UnitActionType, currentPhase: string): ActionValidationResult {
    // Most actions are allowed during initiative turn
    if (currentPhase === 'initiativeTurn') {
      return { isValid: true };
    }

    // Some actions might be restricted in other phases
    switch (currentPhase) {
      case 'airShowPhase':
        const allowedInAirShow: UnitActionType[] = ['move', 'attack']; // Only air-related actions
        if (!allowedInAirShow.includes(actionType)) {
          return {
            isValid: false,
            reason: `Action ${actionType} is not allowed during air show phase`,
            suggestion: 'Wait for the next ground turn phase'
          };
        }
        break;

      case 'turnEnded':
        return {
          isValid: false,
          reason: 'No actions are allowed after the turn has ended',
          suggestion: 'Wait for the next turn to begin'
        };

      default:
        // Allow actions in unknown phases (defensive programming)
        break;
    }

    return { isValid: true };
  }

  /**
   * Validate an action based on unit-specific properties
   * 
   * @param actionType - Type of action to validate
   * @param unit - Unit attempting the action
   * @param context - Current validation context
   * @returns Validation result
   */
  private validateActionForUnit(
    actionType: UnitActionType,
    unit: ScenarioUnit,
    context: ActionValidationContext
  ): ActionValidationResult {
    // Check if unit has enough ammo for attack actions
    if (actionType === 'attack' && unit.ammo <= 0) {
      return {
        isValid: false,
        reason: 'Unit has no ammunition remaining',
        suggestion: 'Resupply the unit before attacking'
      };
    }

    // Check if unit has enough fuel for movement actions
    if (actionType === 'move' && unit.fuel <= 0) {
      return {
        isValid: false,
        reason: 'Unit has no fuel remaining',
        suggestion: 'Resupply the unit before moving'
      };
    }

    // Check if unit is suppressed (some actions might be restricted)
    if (unit.suppressedBy && unit.suppressedBy.length > 0) {
      const restrictedActions: UnitActionType[] = ['move', 'attack'];
      if (restrictedActions.includes(actionType)) {
        return {
          isValid: false,
          reason: 'Unit is suppressed and cannot perform this action',
          suggestion: 'Wait for suppression to be lifted or use rally actions'
        };
      }
    }

    // Check if unit is in a valid state for the action
    if (unit.strength <= 0) {
      return {
        isValid: false,
        reason: 'Unit has been destroyed',
        suggestion: 'No actions available for destroyed units'
      };
    }

    return { isValid: true };
  }

  /**
   * Get a human-readable label for a unit
   * 
   * @param unitId - ID of the unit
   * @param unit - Unit object (optional)
   * @returns Human-readable unit label
   */
  private getUnitLabel(unitId: string, unit?: ScenarioUnit): string {
    if (unit) {
      return `${unit.type} (${unitId})`;
    }
    return `Unit ${unitId}`;
  }

  /**
   * Create a validation context from current game state
   * 
   * @param currentActivation - Current activation
   * @param isInitiativeActive - Whether initiative system is active
   * @param currentPhase - Current phase
   * @param activeFaction - Active faction
   * @returns Validation context
   */
  public static createContext(
    currentActivation: UnitActivation | null,
    isInitiativeActive: boolean,
    currentPhase: string,
    activeFaction: 'Player' | 'Bot' | 'Ally'
  ): ActionValidationContext {
    return {
      currentActivation,
      isInitiativeSystemActive: isInitiativeActive,
      currentPhase,
      activeFaction
    };
  }
}
