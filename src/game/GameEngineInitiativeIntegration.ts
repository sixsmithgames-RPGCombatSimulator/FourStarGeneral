/**
 * GameEngine Initiative Integration Layer
 * 
 * Provides integration methods for GameEngine to work with the initiative system.
 * This file contains the actual methods that would be added to GameEngine
 * if we were modifying it directly, but kept separate to maintain architectural boundaries.
 * 
 * @since Initiative System v1.0
 */

import { GameEngineInitiativeIntegration, type ExtendedBattlePhase } from './GameEngineInitiativeExtensions';
import { InitiativeActionValidator, type ActionValidationContext, type UnitActionType } from './InitiativeActionValidator';
import { InitiativeBotIntegration } from './bot/InitiativeBotIntegration';
import { hexDistance, neighbors, type Axial } from '../core/Hex';
import type { ScenarioUnit } from '../core/types';
import type { UnitActivation } from '../core/InitiativeQueue';

export interface InitiativeBotActivationResult {
  readonly unitId: string;
  readonly ownerId: 'player' | 'bot';
  readonly moved: boolean;
  readonly fromHex: Axial | null;
  readonly toHex: Axial | null;
}

/**
 * Integration methods that would be added to GameEngine
 * 
 * This class contains the actual implementation of methods that would be
 * added to the GameEngine class to support the initiative system.
 */
export class GameEngineInitiativeMethods {
  private integration: GameEngineInitiativeIntegration;
  private validator: InitiativeActionValidator;
  private botIntegration: InitiativeBotIntegration;
  private gameEngine: any; // GameEngine instance
  private botActivationObservers = new Set<(result: InitiativeBotActivationResult) => void>();
  private plannerIntegrationUnavailableLogged = false;
  private plannerBotIntegrationDisabled = false;

  constructor(gameEngine: any) {
    this.gameEngine = gameEngine;
    this.integration = new GameEngineInitiativeIntegration(gameEngine);
    this.validator = new InitiativeActionValidator();
    this.botIntegration = new InitiativeBotIntegration(gameEngine, true); // Enable advanced AI
  }

  /**
   * Start an initiative-based turn instead of the traditional player turn
   * 
   * This replaces the startPlayerTurnPhase method when initiative system is enabled
   * 
   * @param enableInitiativeSystem - Whether to enable the initiative system
   * @throws Error if deployment phase is not complete or base camp is not selected
   */
  public startInitiativeTurnPhase(enableInitiativeSystem: boolean = true): void {
    // Validate that we can start a turn
    this.gameEngine.assertPhase("deployment", "Initiative turn can only begin immediately after deployment.");
    if (!this.gameEngine._baseCamp) {
      throw new Error("Select a base camp before beginning the battle.");
    }

    // Set initial turn state
    // Keep the engine in playerTurn for command-system compatibility.
    // Initiative sequencing is tracked by the integration layer.
    this.gameEngine._phase = "playerTurn";
    this.gameEngine._activeFaction = "Player";
    this.gameEngine._turnNumber = 1;
    this.gameEngine.playerActionFlags.clear();
    this.gameEngine.clearFlakEngagementsFor("Player");
    this.gameEngine.rebuildPlayerIdleUnitSet();

    // Enable initiative system if requested
    if (enableInitiativeSystem) {
      const allUnits = this.getAllUnitsForInitiative();
      console.log('Initiative system starting with units:', {
        totalUnits: allUnits.length,
        playerUnits: this.gameEngine.playerUnits.length,
        botUnits: this.gameEngine.botUnits.length,
        unitTypes: allUnits.map(u => u.type)
      });
      
      this.integration.enableInitiativeSystem(allUnits, this.gameEngine._turnNumber);
      
      // Check initial queue state
      const initialQueue = this.integration.getInitiativeQueue();
      const initiativeBands = (initialQueue?.activations ?? []).reduce(
        (bands, activation) => {
          const key = `initiative_${activation.initiative}`;
          const entry = bands[key] ?? { player: 0, bot: 0 };
          if (activation.ownerId === 'player') {
            entry.player += 1;
          } else {
            entry.bot += 1;
          }
          bands[key] = entry;
          return bands;
        },
        {} as Record<string, { player: number; bot: number }>
      );
      const firstActivation = initialQueue?.activations?.find((activation) => !activation.isActivated) ?? null;
      console.log('Initial initiative queue:', {
        hasQueue: !!initialQueue,
        activations: initialQueue?.activations?.length || 0,
        currentIndex: initialQueue?.currentIndex || 0,
        firstActivation,
        initiativeBands
      });
      
      // Process the first activation
      this.processNextInitiativeActivation();
    } else {
      // Fall back to normal turn management
      this.gameEngine._phase = "playerTurn";
    }
  }

  /**
   * Process the next activation in the initiative queue
   * 
   * @returns The next activation or null if queue is exhausted
   */
  public processNextInitiativeActivation(): UnitActivation | null {
    if (!this.integration.isInitiativeSystemActive()) {
      console.log('Initiative system not active');
      return null;
    }

    const queueBefore = this.integration.getInitiativeQueue();
    console.log('Processing next activation:', {
      queueExists: !!queueBefore,
      currentActivations: queueBefore?.activations?.length || 0,
      currentIndex: queueBefore?.currentIndex || 0
    });

    const nextActivation = this.integration.processNextActivation();
    
    if (nextActivation) {
      console.log('Next activation found:', {
        unitId: nextActivation.unitId,
        ownerId: nextActivation.ownerId
      });
      // Update UI and game state for the new activation
      this.onActivationStarted(nextActivation);
    } else {
      console.log('No more activations, queue complete');
      // No more activations, transition to air show phase
      this.onInitiativeQueueComplete();
    }

    return nextActivation;
  }

  /**
   * Complete the current unit activation
   * 
   * @param unitId - ID of the unit to complete
   * @throws Error if unit is not currently active
   */
  public completeUnitActivation(unitId: string): void {
    if (!this.integration.isInitiativeSystemActive()) {
      throw new Error('Initiative system is not active');
    }

    this.integration.completeCurrentActivation(unitId);
    this.onActivationCompleted(unitId);

    // Process the next activation
    this.processNextInitiativeActivation();
  }

  /**
   * Skip the current unit's activation (player chooses to skip)
   * 
   * @param unitId - ID of the unit to skip
   */
  public skipUnitActivation(unitId: string): void {
    if (!this.integration.isInitiativeSystemActive()) {
      return;
    }

    const currentActivation = this.integration.getCurrentActivation();
    if (currentActivation && currentActivation.unitId === unitId) {
      this.completeUnitActivation(unitId);
    }
  }

  /**
   * End the initiative turn early (skip all remaining player units)
   * 
   * This is called when the player chooses to end their turn
   */
  public endInitiativeTurnEarly(): void {
    if (!this.integration.isInitiativeSystemActive()) {
      // Fall back to normal turn management
      this.gameEngine.endTurn();
      return;
    }

    this.integration.skipRemainingPlayerActivations();
    this.onPlayerTurnSkipped();
  }

  /**
   * Handle the end of the initiative turn and transition to air show
   */
  public completeInitiativeTurn(): void {
    if (!this.integration.isInitiativeSystemActive()) {
      return;
    }

    this.integration.endInitiativeTurn();
    
    // Apply end-of-turn effects
    this.applyEndOfTurnEffects();
    
    // Transition to air show phase
    this.transitionToAirShowPhase();
  }

  /**
   * Validate a unit action before execution
   * 
   * @param unitId - ID of the unit attempting the action
   * @param actionType - Type of action being attempted
   * @param unit - The unit attempting the action (optional)
   * @returns Validation result
   */
  public validateUnitAction(
    unitId: string,
    actionType: UnitActionType,
    unit?: ScenarioUnit
  ): { isValid: boolean; reason?: string } {
    const context = this.createValidationContext();
    const result = this.validator.validateAction(unitId, actionType, context, unit);
    
    return {
      isValid: result.isValid,
      reason: result.reason
    };
  }

  /**
   * Execute a unit action with validation
   * 
   * @param unitId - ID of the unit performing the action
   * @param actionType - Type of action to execute
   * @param actionData - Data required for the action
   * @param unit - The unit performing the action (optional)
   * @returns True if action was executed successfully
   */
  public executeUnitAction(
    unitId: string,
    actionType: UnitActionType,
    actionData: any,
    unit?: ScenarioUnit
  ): boolean {
    // Validate the action first
    const validation = this.validateUnitAction(unitId, actionType, unit);
    if (!validation.isValid) {
      throw new Error(`Action validation failed: ${validation.reason}`);
    }

    // Execute the action based on type
    let success = false;
    switch (actionType) {
      case 'move':
        success = this.executeMoveAction(unitId, actionData);
        break;
      case 'attack':
        success = this.executeAttackAction(unitId, actionData);
        break;
      case 'support':
        success = this.executeSupportAction(unitId, actionData);
        break;
      case 'deploy':
        success = this.executeDeployAction(unitId, actionData);
        break;
      case 'entrench':
        success = this.executeEntrenchAction(unitId, actionData);
        break;
      case 'repair':
        success = this.executeRepairAction(unitId, actionData);
        break;
      case 'resupply':
        success = this.executeResupplyAction(unitId, actionData);
        break;
      case 'tow':
        success = this.executeTowAction(unitId, actionData);
        break;
      case 'sentry':
        success = this.executeSentryAction(unitId, actionData);
        break;
      case 'face':
        success = this.executeFaceAction(unitId, actionData);
        break;
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }

    if (success) {
      this.onActionExecuted(unitId, actionType, actionData);
    }

    return success;
  }

  /**
   * Get the current initiative queue for UI display
   * 
   * @returns Current initiative queue or null
   */
  public getCurrentInitiativeQueue(): any {
    return this.integration.getInitiativeQueue();
  }

  /**
   * Get the current activation for UI highlighting
   * 
   * @returns Current activation or null
   */
  public getCurrentActivation(): UnitActivation | null {
    return this.integration.getCurrentActivation();
  }

  public setBotActivationListener(listener: ((result: InitiativeBotActivationResult) => void) | null): void {
    this.botActivationObservers.clear();
    if (listener) {
      this.botActivationObservers.add(listener);
    }
  }

  /**
   * Skip the current initiative group
   */
  public skipCurrentGroup(): void {
    if (!this.integration.isInitiativeSystemActive()) {
      throw new Error('Initiative system is not active');
    }

    this.integration.skipCurrentGroup();
  }

  /**
   * End the current turn
   */
  public endCurrentTurn(): void {
    if (!this.integration.isInitiativeSystemActive()) {
      throw new Error('Initiative system is not active');
    }

    this.integration.endCurrentTurn();
  }

  /**
   * Skip remaining player activations
   */
  public skipRemainingPlayerActivations(): void {
    if (!this.integration.isInitiativeSystemActive()) {
      throw new Error('Initiative system is not active');
    }

    this.integration.skipRemainingPlayerActivations();
  }

  /**
   * Check if the initiative system is currently active
   * 
   * @returns True if initiative system is active
   */
  public isInitiativeSystemActive(): boolean {
    return this.integration.isInitiativeSystemActive();
  }

  /**
   * Get the current turn phase (extended for initiative system)
   * 
   * @returns Current turn phase
   */
  public getCurrentTurnPhase(): ExtendedBattlePhase {
    return this.integration.getCurrentTurnPhase();
  }

  /**
   * Get all units for initiative queue generation
   * 
   * @returns Array of all units in the battle
   */
  private getAllUnitsForInitiative(): ScenarioUnit[] {
    const units: ScenarioUnit[] = [];

    // Prefer public getters from GameEngine. These are the canonical unit collections.
    if (Array.isArray(this.gameEngine.playerUnits)) {
      units.push(
        ...(this.gameEngine.playerUnits as ScenarioUnit[]).map((unit) => ({
          ...unit,
          controlledBy: this.isAutomatedPlayerUnit(unit) ? "AI" as const : "Player" as const
        }))
      );
    }

    if (Array.isArray(this.gameEngine.botUnits)) {
      units.push(
        ...(this.gameEngine.botUnits as ScenarioUnit[]).map((unit) => ({
          ...unit,
          controlledBy: "AI" as const
        }))
      );
    }

    // Ally units act as non-player activations in the current initiative model.
    if (Array.isArray(this.gameEngine.allyUnits)) {
      units.push(
        ...(this.gameEngine.allyUnits as ScenarioUnit[]).map((unit) => ({
          ...unit,
          controlledBy: "AI" as const
        }))
      );
    }

    // Backward-compatible fallback for older/alternate engine shapes.
    if (units.length === 0) {
      if (this.gameEngine._playerUnits) {
        units.push(
          ...((Object.values(this.gameEngine._playerUnits) as ScenarioUnit[]).map((unit) => ({
            ...unit,
            controlledBy: this.isAutomatedPlayerUnit(unit) ? "AI" as const : "Player" as const
          })))
        );
      }
      if (this.gameEngine._botUnits) {
        units.push(
          ...((Object.values(this.gameEngine._botUnits) as ScenarioUnit[]).map((unit) => ({
            ...unit,
            controlledBy: "AI" as const
          })))
        );
      }
      if (this.gameEngine._allyUnits) {
        units.push(
          ...((Object.values(this.gameEngine._allyUnits) as ScenarioUnit[]).map((unit) => ({
            ...unit,
            controlledBy: "AI" as const
          })))
        );
      }
    }

    return units.filter((unit) => Boolean(unit?.type) && Boolean(unit?.hex));
  }

  /**
   * Create validation context from current game state
   * 
   * @returns Validation context
   */
  private createValidationContext(): ActionValidationContext {
    return InitiativeActionValidator.createContext(
      this.integration.getCurrentActivation(),
      this.integration.isInitiativeSystemActive(),
      this.gameEngine._phase,
      this.gameEngine._activeFaction
    );
  }

  /**
   * Handle activation started event
   * 
   * @param activation - The activation that started
   */
  private onActivationStarted(activation: UnitActivation): void {
    // Update UI to highlight the active unit
    // This would emit an event for the UI to react to
    console.log(`Activation started: ${activation.unitId} (${activation.ownerId})`);
    
    // Update game engine state
    this.gameEngine._activeFaction = activation.ownerId === 'player' ? 'Player' : 'Bot';
    
    // If this is a bot unit, automatically execute its decision
    if (activation.ownerId === 'bot') {
      this.executeBotTurn(activation);
    }
  }

  /**
   * Execute bot turn for the given activation
   * 
   * @param activation - The bot unit activation
   */
  private executeBotTurn(activation: UnitActivation): void {
    const beforeState = this.resolveActivationUnit(activation);
    const beforeHex = this.cloneHex(beforeState?.unit.hex ?? null);

    try {
      console.log(`Executing bot turn for ${activation.unitId}`);

      let executed = false;

      if (!this.plannerBotIntegrationDisabled && this.supportsPlannerBotIntegration()) {
        try {
          // Get bot decision
          const decisionResult = this.botIntegration.executeBotDecision(activation);

          if (decisionResult.hasValidAction) {
            console.log(`Bot decision for ${activation.unitId}: ${decisionResult.action.rationale}`);

            // Execute the planned action
            const executionSuccess = this.botIntegration.executePlannedAction(decisionResult.action);

            if (executionSuccess) {
              console.log(`Bot action executed successfully for ${activation.unitId}`);
              executed = true;
            } else {
              console.warn(`Bot action execution failed for ${activation.unitId}`);
            }
          } else {
            console.log(`No valid action found for bot unit ${activation.unitId}`);
          }

          // Log performance metrics
          if (decisionResult.executionTime > 100) {
            console.warn(`Bot decision took ${decisionResult.executionTime}ms for ${activation.unitId}`);
          }
        } catch (plannerError) {
          this.plannerBotIntegrationDisabled = true;
          if (!this.plannerIntegrationUnavailableLogged) {
            this.plannerIntegrationUnavailableLogged = true;
            console.info("[Initiative] Planner bot adapter failed during execution; using deterministic fallback bot activations for the remainder of this battle.");
          }
          console.warn("[Initiative] Planner bot adapter error:", plannerError);
        }
      } else if (!this.plannerIntegrationUnavailableLogged) {
        this.plannerIntegrationUnavailableLogged = true;
        console.info("[Initiative] Planner bot adapter unavailable on current engine shape; using deterministic fallback bot activations.");
      }

      if (!executed) {
        executed = this.executeFallbackBotActivation(activation);
      }

      const afterState = this.resolveActivationUnit(activation);
      const afterHex = this.cloneHex(afterState?.unit.hex ?? null);
      this.emitBotActivationResult(activation, beforeHex, afterHex);
      
      // Automatically complete the bot unit's activation
      setTimeout(() => {
        this.completeUnitActivation(activation.unitId);
      }, 500); // Small delay for visual feedback
      
    } catch (error) {
      console.error(`Error executing bot turn for ${activation.unitId}:`, error);
      this.executeFallbackBotActivation(activation);
      const afterState = this.resolveActivationUnit(activation);
      const afterHex = this.cloneHex(afterState?.unit.hex ?? null);
      this.emitBotActivationResult(activation, beforeHex, afterHex);
      
      // Complete the activation anyway to prevent game from getting stuck
      setTimeout(() => {
        this.completeUnitActivation(activation.unitId);
      }, 500);
    }
  }

  private supportsPlannerBotIntegration(): boolean {
    const plannerEngine = (this.botIntegration as unknown as { gameEngine?: Record<string, unknown> | null })?.gameEngine;
    const candidateEngines: Record<string, unknown>[] = [];
    if (plannerEngine && typeof plannerEngine === 'object') {
      candidateEngines.push(plannerEngine);
    }
    if (this.gameEngine && typeof this.gameEngine === 'object') {
      candidateEngines.push(this.gameEngine as Record<string, unknown>);
    }
    if (candidateEngines.length === 0) {
      return false;
    }

    const requiredMethods = [
      'getUnitsForFaction',
      'getUnit',
      'getUnitAt',
      'executeUnitMove',
      'executeUnitAttack',
      'executeUnitDigIn',
      'isInBounds',
      'getTerrainAt',
      'getMovementCost',
      'getFeaturesAt',
      'isRoad',
      'getHexModificationsAt',
      'checkLineOfSight',
      'estimateAttack',
      'getObjectives'
    ] as const;

    return candidateEngines.every((engine) =>
      requiredMethods.every((name) => typeof engine[name] === 'function')
    );
  }

  private cloneHex(hex: Axial | null | undefined): Axial | null {
    return hex ? { q: hex.q, r: hex.r } : null;
  }

  private emitBotActivationResult(
    activation: UnitActivation,
    beforeHex: Axial | null,
    afterHex: Axial | null
  ): void {
    const moved = Boolean(beforeHex && afterHex && (beforeHex.q !== afterHex.q || beforeHex.r !== afterHex.r));
    const result: InitiativeBotActivationResult = {
      unitId: activation.unitId,
      ownerId: activation.ownerId,
      moved,
      fromHex: beforeHex,
      toHex: afterHex
    };
    this.botActivationObservers.forEach((observer) => {
      try {
        observer(result);
      } catch (error) {
        console.warn('Bot activation observer failed:', error);
      }
    });
  }

  private resolveActivationUnit(
    activation: UnitActivation
  ): { unit: ScenarioUnit; faction: 'Player' | 'Bot' } | null {
    if (Array.isArray(this.gameEngine.botUnits)) {
      const botUnit = (this.gameEngine.botUnits as ScenarioUnit[]).find((entry) => entry.unitId === activation.unitId) ?? null;
      if (botUnit) {
        return { unit: botUnit, faction: 'Bot' };
      }
    }

    if (Array.isArray(this.gameEngine.playerUnits)) {
      const playerUnit = (this.gameEngine.playerUnits as ScenarioUnit[]).find((entry) => entry.unitId === activation.unitId) ?? null;
      if (playerUnit) {
        return { unit: playerUnit, faction: 'Player' };
      }
    }

    return null;
  }

  private executeFallbackBotActivation(activation: UnitActivation): boolean {
    const resolved = this.resolveActivationUnit(activation);
    if (!resolved) {
      return false;
    }

    const engine = this.gameEngine as any;
    const unitDefinition = typeof engine.getUnitDefinition === 'function'
      ? engine.getUnitDefinition(resolved.unit.type)
      : null;

    if (!unitDefinition || unitDefinition.moveType === 'air') {
      return false;
    }

    if (resolved.faction === 'Player' && resolved.unit.type === 'Supply_Truck') {
      const logistics = typeof engine.getLogisticsSnapshot === 'function' ? engine.getLogisticsSnapshot() : null;
      const priorityTargets = Array.isArray(logistics?.priorityTargets) ? logistics.priorityTargets : [];
      const nextTarget = priorityTargets.find((entry: { status?: string }) => entry.status !== 'resupplied');
      const targetHex = this.parseAxialKey(nextTarget?.hex ?? null) ?? this.cloneHex(engine._baseCamp?.hex ?? null);
      if (!targetHex) {
        return false;
      }
      return this.moveSingleHexToward(resolved.unit, resolved.faction, targetHex);
    }

    const perceivedTargets = typeof engine.buildBotPerceivedTargets === 'function'
      ? engine.buildBotPerceivedTargets()
      : [];
    if (!Array.isArray(perceivedTargets) || perceivedTargets.length === 0) {
      return false;
    }

    const selectedTarget = typeof engine.selectBotPerceivedTarget === 'function'
      ? engine.selectBotPerceivedTarget(resolved.unit.hex, perceivedTargets)
      : perceivedTargets[0];

    if (!selectedTarget?.hex) {
      return false;
    }

    const targetHex = this.cloneHex(selectedTarget.hex) ?? selectedTarget.hex;
    const deceptionTarget = selectedTarget.isDeception === true;
    const origin = this.cloneHex(resolved.unit.hex);
    if (!origin) {
      return false;
    }

    if (!deceptionTarget && hexDistance(origin, targetHex) <= 1) {
      return this.tryResolveBotAttack(resolved.unit, origin, targetHex);
    }

    const moved = this.moveSingleHexToward(resolved.unit, resolved.faction, targetHex);
    if (!moved) {
      return false;
    }

    const refreshed = this.resolveActivationUnit(activation);
    const newOrigin = this.cloneHex(refreshed?.unit.hex ?? null);
    if (!deceptionTarget && refreshed?.faction === 'Bot' && newOrigin && hexDistance(newOrigin, targetHex) <= 1) {
      this.tryResolveBotAttack(refreshed.unit, newOrigin, targetHex);
    }

    return true;
  }

  private moveSingleHexToward(unit: ScenarioUnit, faction: 'Player' | 'Bot', targetHex: Axial): boolean {
    const engine = this.gameEngine as any;
    const origin = this.cloneHex(unit.hex);
    if (!origin) {
      return false;
    }

    let step: Axial | null = null;
    if (faction === 'Bot' && typeof engine.selectBotStepToward === 'function') {
      step = engine.selectBotStepToward(origin, targetHex);
    }

    if (!step) {
      const candidateSteps = neighbors(origin)
        .filter((candidate) => typeof engine.inBounds === 'function' ? engine.inBounds(candidate) : true)
        .filter((candidate) => !(typeof engine.isOccupied === 'function' && engine.isOccupied(candidate)))
        .sort((left, right) => hexDistance(left, targetHex) - hexDistance(right, targetHex));
      step = candidateSteps[0] ?? null;
    }

    if (!step) {
      return false;
    }

    const moved = structuredClone(unit) as ScenarioUnit;
    moved.facing = typeof engine.resolveFacingToward === 'function'
      ? engine.resolveFacingToward(origin, step, unit.facing)
      : unit.facing;
    moved.hex = this.cloneHex(step) ?? step;
    moved.entrench = 0;

    if (typeof engine.removeUnitFromFactionHex !== 'function' || typeof engine.addUnitToFactionHex !== 'function') {
      return false;
    }

    engine.removeUnitFromFactionHex(faction, origin, moved.unitId ?? undefined);
    engine.addUnitToFactionHex(faction, moved);

    const fuelStep = typeof engine.resolveMovementFuelStep === 'function' && engine.getUnitDefinition
      ? engine.resolveMovementFuelStep(engine.getUnitDefinition(unit.type).moveType, step)
      : 0;
    if (Number.isFinite(fuelStep) && fuelStep > 0) {
      moved.fuel = Math.max(0, Number((moved.fuel - fuelStep).toFixed(2)));
    }

    if (typeof engine.updateSupplyPositionForFaction === 'function') {
      engine.updateSupplyPositionForFaction(faction, origin, moved.hex, moved.unitId ?? undefined);
    }
    if (typeof engine.syncFuelForFaction === 'function') {
      engine.syncFuelForFaction(faction, moved.hex, moved.fuel, moved.unitId ?? undefined);
    }
    if (typeof engine.syncEntrenchForFaction === 'function') {
      engine.syncEntrenchForFaction(faction, moved.hex, moved.entrench, moved.unitId ?? undefined);
    }

    return true;
  }

  private tryResolveBotAttack(unit: ScenarioUnit, fromHex: Axial, targetHex: Axial): boolean {
    const engine = this.gameEngine as any;
    if (typeof engine.resolveBotAttack !== 'function') {
      return false;
    }

    const stance = typeof engine.chooseBotStance === 'function'
      ? engine.chooseBotStance(unit, targetHex)
      : 'fireAtWill';
    const result = engine.resolveBotAttack(unit, fromHex, targetHex, stance);
    return Boolean(result);
  }

  private parseAxialKey(value: string | null | undefined): Axial | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const [qRaw, rRaw] = value.split(',');
    const q = Number.parseInt(qRaw ?? '', 10);
    const r = Number.parseInt(rRaw ?? '', 10);
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      return null;
    }
    return { q, r };
  }

  private isAutomatedPlayerUnit(unit: ScenarioUnit): boolean {
    const engine = this.gameEngine as any;
    if (typeof engine.isAutomatedPlayerUnit === 'function') {
      try {
        return engine.isAutomatedPlayerUnit(unit) === true;
      } catch {
        // fall through to static heuristic
      }
    }
    return unit.type === 'Supply_Truck' || unit.controlledBy === 'AI';
  }

  /**
   * Handle activation completed event
   * 
   * @param unitId - ID of the unit that completed activation
   */
  private onActivationCompleted(unitId: string): void {
    // Update UI to remove highlighting
    console.log(`Activation completed: ${unitId}`);
    
    // Update unit state
    // This would mark the unit as activated in the game state
  }

  /**
   * Handle initiative queue completion
   */
  private onInitiativeQueueComplete(): void {
    console.log('Initiative queue complete, transitioning to air show phase');
    this.transitionToAirShowPhase();
  }

  /**
   * Handle player turn skipped event
   */
  private onPlayerTurnSkipped(): void {
    console.log('Player turn skipped, processing remaining bot activations');
    // Bot activations are automatically processed by the integration
  }

  /**
   * Apply end-of-turn effects
   */
  private applyEndOfTurnEffects(): void {
    // Apply supply ticks, mission progress, etc.
    // This would call the existing endTurn methods but without phase changes
    console.log('Applying end-of-turn effects');
  }

  /**
   * Transition to air show phase
   */
  private transitionToAirShowPhase(): void {
    this.integration.transitionToAirShowPhase();
    
    // Start air show phase
    // This would integrate with the existing air show system
    console.log('Transitioning to air show phase');
  }

  /**
   * Handle action executed event
   * 
   * @param unitId - ID of the unit that executed the action
   * @param actionType - Type of action executed
   * @param actionData - Data for the executed action
   */
  private onActionExecuted(unitId: string, actionType: UnitActionType, actionData: any): void {
    console.log(`Action executed: ${unitId} -> ${actionType}`);
    
    // Update game state based on the action
    // This would integrate with the existing action execution systems
  }

  // Action execution methods (these would integrate with existing GameEngine methods)
  private executeMoveAction(unitId: string, actionData: any): boolean {
    // Integrate with existing movement system
    return true; // Placeholder
  }

  private executeAttackAction(unitId: string, actionData: any): boolean {
    // Integrate with existing combat system
    return true; // Placeholder
  }

  private executeSupportAction(unitId: string, actionData: any): boolean {
    // Integrate with existing support system
    return true; // Placeholder
  }

  private executeDeployAction(unitId: string, actionData: any): boolean {
    // Integrate with existing deployment system
    return true; // Placeholder
  }

  private executeEntrenchAction(unitId: string, actionData: any): boolean {
    // Integrate with existing entrenchment system
    return true; // Placeholder
  }

  private executeRepairAction(unitId: string, actionData: any): boolean {
    // Integrate with existing repair system
    return true; // Placeholder
  }

  private executeResupplyAction(unitId: string, actionData: any): boolean {
    // Integrate with existing supply system
    return true; // Placeholder
  }

  private executeTowAction(unitId: string, actionData: any): boolean {
    // Integrate with existing towing system
    return true; // Placeholder
  }

  private executeSentryAction(unitId: string, actionData: any): boolean {
    // Integrate with existing sentry system
    return true; // Placeholder
  }

  private executeFaceAction(unitId: string, actionData: any): boolean {
    // Integrate with existing facing system
    return true; // Placeholder
  }

  /**
   * Get the integration instance for advanced operations
   * 
   * @returns The initiative integration instance
   */
  public getIntegration(): GameEngineInitiativeIntegration {
    return this.integration;
  }

  /**
   * Get the validator instance for custom validation
   * 
   * @returns The action validator instance
   */
  public getValidator(): InitiativeActionValidator {
    return this.validator;
  }
}
