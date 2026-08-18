/**
 * GameEngine Initiative System Extensions
 * 
 * Extends GameEngine with initiative system functionality.
 * This approach avoids modifying the core GameEngine class and maintains separation of concerns.
 * 
 * @since Initiative System v1.0
 */

import type { BattlePhase } from './GameEngine';
import { initiativeQueueManager, type InitiativeQueue, type UnitActivation } from '../core/InitiativeQueue';
import type { ScenarioUnit } from '../core/types';
import {
  BattleStateInitiativeManager,
  type SerializedInitiativeState
} from '../state/BattleStateInitiativeExtensions';

/**
 * Extended battle phase that includes initiative system phases
 */
export type ExtendedBattlePhase = BattlePhase | 'initiativeTurn' | 'airShowPhase' | 'turnEnded';

/**
 * Interface for initiative system integration with GameEngine
 */
export interface GameEngineInitiativeExtensions {
  /** Initiative manager for handling queue state */
  initiativeManager: BattleStateInitiativeManager;
  /** Whether the initiative system is enabled for this battle */
  isInitiativeSystemEnabled: boolean;
  /** Current activation being processed */
  currentActivation: UnitActivation | null;
}

/** JSON-safe initiative integration state owned by the tactical save contract. */
export interface SerializedInitiativeIntegrationState {
  readonly manager: SerializedInitiativeState;
  readonly isInitiativeSystemEnabled: boolean;
  readonly currentActivation: UnitActivation | null;
}

/**
 * Manages initiative system integration with GameEngine
 * 
 * This class handles the integration between the initiative queue system
 * and the GameEngine's turn management without modifying the core engine.
 */
export class GameEngineInitiativeIntegration {
  private extensions: GameEngineInitiativeExtensions;
  private gameEngine: any; // GameEngine instance (avoiding circular dependency)

  constructor(gameEngine: any) {
    this.gameEngine = gameEngine;
    this.extensions = {
      initiativeManager: new BattleStateInitiativeManager(),
      isInitiativeSystemEnabled: false,
      currentActivation: null
    };
  }

  /**
   * Enable the initiative system for the current battle
   * 
   * @param units - All units to include in the initiative queue
   * @param turn - Current turn number
   * @throws Error if initiative system is already enabled or unit data is invalid
   */
  public enableInitiativeSystem(units: readonly ScenarioUnit[], turn: number): void {
    if (this.extensions.isInitiativeSystemEnabled) {
      throw new Error('Initiative system is already enabled');
    }

    // Initialize the initiative turn
    this.extensions.initiativeManager.initializeInitiativeTurn(units, turn);
    this.extensions.isInitiativeSystemEnabled = true;
    this.extensions.currentActivation = null;

    // Update game engine phase if possible
    this.updateEnginePhase('initiativeTurn');
  }

  /**
   * Disable the initiative system and return to normal turn management
   */
  public disableInitiativeSystem(): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      return;
    }

    this.extensions.initiativeManager.endTurn();
    this.extensions.isInitiativeSystemEnabled = false;
    this.extensions.currentActivation = null;

    // Return to normal turn management
    this.updateEnginePhase('playerTurn');
  }

  /**
   * Check if the initiative system is currently enabled
   * 
   * @returns True if initiative system is enabled
   */
  public isInitiativeSystemActive(): boolean {
    return this.extensions.isInitiativeSystemEnabled;
  }

  /**
   * Get the current initiative queue
   * 
   * @returns Current initiative queue or null if inactive
   */
  public getInitiativeQueue(): InitiativeQueue | null {
    return this.extensions.initiativeManager.getInitiativeQueue();
  }

  /**
   * Get the current activation being processed
   * 
   * @returns Current activation or null if none
   */
  public getCurrentActivation(): UnitActivation | null {
    return this.extensions.initiativeManager.getCurrentActivation();
  }

  /**
   * Register a unit that just entered play mid-turn (e.g. a reserve called up from the roster)
   * so it can act during the current turn rather than waiting for the queue to rebuild next turn.
   */
  public addUnitActivation(unit: ScenarioUnit, ownerId: 'player' | 'bot'): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      return;
    }
    this.extensions.initiativeManager.addUnitActivation(unit, ownerId);
  }

  /**
   * Process the next activation in the initiative queue
   *
   * @returns Next activation or null if queue is exhausted
   * @throws Error if initiative system is not active
   */
  public processNextActivation(): UnitActivation | null {
    if (!this.extensions.isInitiativeSystemEnabled) {
      throw new Error('Initiative system is not active');
    }

    const nextActivation = this.extensions.initiativeManager.processNextActivation();
    this.extensions.currentActivation = nextActivation;

    if (nextActivation) {
      // Update engine state to reflect current activation
      this.updateEngineActiveFaction(nextActivation.ownerId === 'player' ? 'Player' : 'Bot');
    }

    return nextActivation;
  }

  /**
   * Complete the current activation
   * 
   * @param unitId - ID of the unit to mark as completed
   * @throws Error if unitId doesn't match current activation
   */
  public completeCurrentActivation(unitId: string): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      throw new Error('Initiative system is not active');
    }

    // Get current units from the engine
    const currentUnits = this.getCurrentUnitsFromEngine();
    
    this.extensions.initiativeManager.completeCurrentActivation(unitId, currentUnits);
    this.extensions.currentActivation = null;

    // Check if queue is complete
    if (this.extensions.initiativeManager.isQueueComplete()) {
      this.transitionToAirShowPhase();
    }
  }

  /**
   * Skip all remaining player activations (used when player ends turn early)
   * 
   * @throws Error if initiative system is not active
   */
  public skipRemainingPlayerActivations(): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      throw new Error('Initiative system is not active');
    }

    const currentUnits = this.getCurrentUnitsFromEngine();
    this.extensions.initiativeManager.skipRemainingPlayerActivations(currentUnits);
    this.extensions.currentActivation = null;

    // Process remaining bot activations automatically
    this.processRemainingBotActivations();
  }

  /**
   * Transition to the air show phase
   * 
   * @throws Error if initiative system is not active
   */
  public transitionToAirShowPhase(): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      throw new Error('Initiative system is not active');
    }

    this.extensions.initiativeManager.transitionToAirShowPhase();
    this.extensions.currentActivation = null;
    this.updateEnginePhase('airShowPhase');
  }

  /**
   * End the current turn and reset for next turn
   */
  public endInitiativeTurn(): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      return;
    }

    this.extensions.initiativeManager.endTurn();
    this.extensions.currentActivation = null;
    this.updateEnginePhase('turnEnded');
  }

  /**
   * Validate that a unit can perform actions (must be currently active)
   * 
   * @param unitId - ID of the unit to validate
   * @returns True if the unit can perform actions
   */
  public canUnitAct(unitId: string): boolean {
    if (!this.extensions.isInitiativeSystemEnabled) {
      return true; // Normal turn management
    }

    const currentActivation = this.extensions.currentActivation;
    return currentActivation !== null && currentActivation.unitId === unitId;
  }

  /**
   * Get the current turn phase
   * 
   * @returns Current turn phase
   */
  public getCurrentTurnPhase(): ExtendedBattlePhase {
    if (!this.extensions.isInitiativeSystemEnabled) {
      return this.gameEngine._phase as BattlePhase;
    }

    return this.extensions.initiativeManager.getTurnPhase() as ExtendedBattlePhase;
  }

  /**
   * Get the current active faction
   * 
   * @returns Current active faction
   */
  public getCurrentActiveFaction(): 'Player' | 'Bot' | 'Ally' {
    if (!this.extensions.isInitiativeSystemEnabled) {
      return this.gameEngine._activeFaction;
    }

    const currentActivation = this.extensions.currentActivation;
    if (!currentActivation) {
      return this.gameEngine._activeFaction;
    }

    return currentActivation.ownerId === 'player' ? 'Player' : 'Bot';
  }

  /**
   * Get the initiative manager for advanced operations
   * 
   * @returns The initiative manager instance
   */
  public getInitiativeManager(): BattleStateInitiativeManager {
    return this.extensions.initiativeManager;
  }

  /**
   * Update the game engine's internal phase (if accessible)
   * 
   * @param phase - New phase to set
   */
  private updateEnginePhase(phase: ExtendedBattlePhase): void {
    // Only update if the phase is compatible with the engine
    if (this.gameEngine && typeof this.gameEngine._phase !== 'undefined') {
      const validPhases: BattlePhase[] = ['deployment', 'playerTurn', 'allyTurn', 'botTurn', 'completed'];
      
      if (validPhases.includes(phase as BattlePhase)) {
        this.gameEngine._phase = phase;
      }
    }
  }

  /**
   * Update the game engine's active faction (if accessible)
   * 
   * @param faction - New active faction
   */
  private updateEngineActiveFaction(faction: 'Player' | 'Bot' | 'Ally'): void {
    if (this.gameEngine && typeof this.gameEngine._activeFaction !== 'undefined') {
      this.gameEngine._activeFaction = faction;
    }
  }

  /**
   * Get current units from the game engine
   * 
   * @returns Array of current units
   */
  private getCurrentUnitsFromEngine(): ScenarioUnit[] {
    if (!this.gameEngine) {
      return [];
    }

    // Prefer public API if available.
    if (typeof this.gameEngine.getAllUnits === 'function') {
      return this.gameEngine.getAllUnits();
    }

    const units: ScenarioUnit[] = [];

    if (Array.isArray(this.gameEngine.playerUnits)) {
      units.push(...(this.gameEngine.playerUnits as ScenarioUnit[]));
    }
    if (Array.isArray(this.gameEngine.botUnits)) {
      units.push(...(this.gameEngine.botUnits as ScenarioUnit[]));
    }
    if (Array.isArray(this.gameEngine.allyUnits)) {
      units.push(...(this.gameEngine.allyUnits as ScenarioUnit[]));
    }

    // Backward-compatible fallback for older engine shapes.
    if (units.length === 0) {
      if (this.gameEngine._playerUnits) {
        units.push(...Object.values(this.gameEngine._playerUnits) as ScenarioUnit[]);
      }
      if (this.gameEngine._botUnits) {
        units.push(...Object.values(this.gameEngine._botUnits) as ScenarioUnit[]);
      }
      if (this.gameEngine._allyUnits) {
        units.push(...Object.values(this.gameEngine._allyUnits) as ScenarioUnit[]);
      }
    }

    return units;
  }

  /**
   * Process remaining bot activations automatically
   */
  private processRemainingBotActivations(): void {
    while (true) {
      const nextActivation = this.extensions.initiativeManager.processNextActivation();
      
      if (!nextActivation) {
        break; // No more activations
      }
      
      if (nextActivation.ownerId === 'player') {
        // Should not happen, but break to avoid infinite loop
        break;
      }
      
      // Process bot activation (this would integrate with bot AI)
      this.extensions.currentActivation = nextActivation;
      
      // Simulate bot action completion
      const currentUnits = this.getCurrentUnitsFromEngine();
      this.extensions.initiativeManager.completeCurrentActivation(nextActivation.unitId, currentUnits);
      this.extensions.currentActivation = null;
    }
    
    // Check if queue is complete and transition to air show
    if (this.extensions.initiativeManager.isQueueComplete()) {
      this.transitionToAirShowPhase();
    }
  }

  /**
   * Skip the current initiative group
   * 
   * @throws Error if initiative system is not active
   */
  public skipCurrentGroup(): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      throw new Error('Initiative system is not active');
    }

    this.extensions.initiativeManager.skipCurrentGroup();
    this.extensions.currentActivation = null;
    
    // Process next activation
    this.processNextActivation();
  }

  /**
   * End the current turn
   * 
   * @throws Error if initiative system is not active
   */
  public endCurrentTurn(): void {
    if (!this.extensions.isInitiativeSystemEnabled) {
      throw new Error('Initiative system is not active');
    }

    // Process all remaining activations
    while (true) {
      const nextActivation = this.extensions.initiativeManager.processNextActivation();
      
      if (!nextActivation) {
        break; // No more activations
      }
      
      // Complete the activation immediately
      const currentUnits = this.getCurrentUnitsFromEngine();
      this.extensions.initiativeManager.completeCurrentActivation(nextActivation.unitId, currentUnits);
    }
    
    this.extensions.currentActivation = null;
    
    // Transition to air show phase
    this.transitionToAirShowPhase();
  }

  /**
   * Get the current state for debugging and testing
   * 
   * @returns Current initiative integration state
   */
  public getStateSnapshot(): GameEngineInitiativeExtensions {
    return {
      initiativeManager: this.extensions.initiativeManager,
      isInitiativeSystemEnabled: this.extensions.isInitiativeSystemEnabled,
      currentActivation: this.extensions.currentActivation
    };
  }

  /** Captures exact queue/activation state without exposing the live manager object. */
  public serializeState(): SerializedInitiativeIntegrationState {
    return {
      manager: this.extensions.initiativeManager.getStateSnapshot(),
      isInitiativeSystemEnabled: this.extensions.isInitiativeSystemEnabled,
      currentActivation: this.extensions.currentActivation
        ? structuredClone(this.extensions.currentActivation)
        : null
    };
  }

  /** Restores an exact queue and current activation without regenerating initiative order. */
  public hydrateState(snapshot: SerializedInitiativeIntegrationState): void {
    if (snapshot.isInitiativeSystemEnabled !== snapshot.manager.isInitiativeSystemActive) {
      throw new Error("Initiative integration enabled state disagrees with the serialized manager.");
    }
    this.extensions.initiativeManager.hydrateState(snapshot.manager);
    this.extensions.isInitiativeSystemEnabled = snapshot.isInitiativeSystemEnabled;
    this.extensions.currentActivation = snapshot.currentActivation
      ? structuredClone(snapshot.currentActivation)
      : null;
    if (this.extensions.currentActivation) {
      this.updateEngineActiveFaction(this.extensions.currentActivation.ownerId === "player" ? "Player" : "Bot");
    }
  }
}
