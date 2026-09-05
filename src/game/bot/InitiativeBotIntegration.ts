/**
 * Initiative Bot Integration
 * 
 * Integrates the existing BotPlanner with the initiative system to provide
 * automated decision making for bot units during their initiative activations.
 * 
 * @since Initiative System v2.0
 */

import { planHeuristicBotTurn, type BotPlannerInput, type PlannedBotAction, type PlannerUnitSnapshot } from './BotPlanner';
import { AdvancedBotPlanner, type AdvancedBotAction } from './AdvancedBotPlanner';
import { TacticalAnalysisEngine } from './TacticalAnalysisEngine';
import { ThreatAssessmentModule } from './ThreatAssessmentModule';
import { TerrainAnalysisModule } from './TerrainAnalysisModule';
import type { UnitActivation } from '../../core/InitiativeQueue';
import type { Axial } from '../../core/Hex';

/**
 * Bot decision result for initiative system
 */
export interface BotDecisionResult {
  /** The action the bot decided to take */
  action: PlannedBotAction;
  /** Whether the bot has any valid actions */
  hasValidAction: boolean;
  /** Execution time in milliseconds (for performance monitoring) */
  executionTime: number;
}

/**
 * Integration layer between BotPlanner and Initiative System
 * 
 * This class handles the conversion between initiative system data structures
 * and the BotPlanner's expected input format, then executes bot decisions.
 */
export class InitiativeBotIntegration {
  private gameEngine: any; // GameEngine instance
  private lastDecisionTime: number = 0;
  private tacticalEngine: TacticalAnalysisEngine;
  private advancedPlanner: AdvancedBotPlanner;
  private threatAssessment: ThreatAssessmentModule;
  private terrainAnalysis: TerrainAnalysisModule;
  private useAdvancedAI: boolean;

  constructor(gameEngine: any, useAdvancedAI: boolean = true) {
    this.gameEngine = gameEngine;
    this.tacticalEngine = new TacticalAnalysisEngine();
    this.advancedPlanner = new AdvancedBotPlanner({
      maxLookaheadDepth: 3,
      decisionTimeLimit: 800,
      enableTacticalAnalysis: true,
      enableSmokeTactics: true,
      enableTerrainAnalysis: true,
      aggressiveness: 60,
      riskTolerance: 40
    });
    this.threatAssessment = new ThreatAssessmentModule();
    this.terrainAnalysis = new TerrainAnalysisModule();
    this.useAdvancedAI = useAdvancedAI;
  }

  /**
   * Execute bot decision for the current activation
   * 
   * @param activation - Current unit activation
   * @returns Bot decision result
   */
  public executeBotDecision(activation: UnitActivation): BotDecisionResult {
    const startTime = Date.now();
    
    try {
      // Convert game state to BotPlanner input format
      const plannerInput = this.createPlannerInput(activation);
      
      let currentUnitAction: PlannedBotAction | null = null;
      
      if (this.useAdvancedAI) {
        // Use advanced AI with tactical lookahead
        try {
          const advancedActions = this.advancedPlanner.planAdvancedBotTurn(plannerInput);
          const advancedAction = advancedActions.find(action => action.unitKey === activation.unitId);
          
          if (advancedAction) {
            console.log(`Advanced AI selected action for ${activation.unitId}:`, {
              score: advancedAction.tacticalAnalysis.outcome.total,
              confidence: advancedAction.confidence,
              lookaheadDepth: advancedAction.lookaheadDepth,
              rationale: advancedAction.rationale
            });
            
            currentUnitAction = this.convertAdvancedAction(advancedAction);
          }
        } catch (advancedError) {
          console.warn('Advanced AI failed, falling back to heuristic:', advancedError);
          // Fall back to heuristic planning
        }
      }
      
      // Fallback to heuristic planning if advanced AI didn't find an action
      if (!currentUnitAction) {
        const botActions = planHeuristicBotTurn(plannerInput);
        currentUnitAction = botActions.find(action => action.unitKey === activation.unitId) || null;
      }
      
      const executionTime = Date.now() - startTime;
      this.lastDecisionTime = executionTime;
      
      if (currentUnitAction) {
        return {
          action: currentUnitAction,
          hasValidAction: true,
          executionTime
        };
      } else {
        // No valid action found for this unit
        return {
          action: this.createNoOpAction(activation),
          hasValidAction: false,
          executionTime
        };
      }
      
    } catch (error) {
      console.error(`Bot decision failed for unit ${activation.unitId}:`, error);
      
      const executionTime = Date.now() - startTime;
      return {
        action: this.createNoOpAction(activation),
        hasValidAction: false,
        executionTime
      };
    }
  }

  /**
   * Execute the bot's planned action in the game engine
   * 
   * @param action - The planned bot action to execute
   * @returns True if action was executed successfully
   */
  public executePlannedAction(action: PlannedBotAction): boolean {
    try {
      const unit = this.gameEngine.getUnit(action.unitKey);
      if (!unit) {
        console.error(`Unit ${action.unitKey} not found for action execution`);
        return false;
      }

      // Execute movement if destination is different from origin
      if (!this.axialEqual(action.origin, action.destination)) {
        const moveSuccess = this.gameEngine.executeUnitMove(unit, action.destination);
        if (!moveSuccess) {
          console.warn(`Bot movement failed for unit ${action.unitKey} to ${axialKey(action.destination)}`);
          // Continue anyway - bot might still be able to attack from current position
        }
      }

      // Execute attack if target is specified
      if (action.attackTarget) {
        const targetUnit = this.gameEngine.getUnitAt(action.attackTarget);
        if (targetUnit) {
          const attackSuccess = this.gameEngine.executeUnitAttack(unit, targetUnit);
          if (!attackSuccess) {
            console.warn(`Bot attack failed for unit ${action.unitKey} on target at ${axialKey(action.attackTarget)}`);
          }
        } else {
          console.warn(`Bot attack target not found at ${axialKey(action.attackTarget)}`);
        }
      }

      // Execute field action (dig in) if specified
      if (action.fieldAction === 'digIn') {
        const digInSuccess = this.gameEngine.executeUnitDigIn(unit);
        if (!digInSuccess) {
          console.warn(`Bot dig in failed for unit ${action.unitKey}`);
        }
      }

      return true;
      
    } catch (error) {
      console.error(`Failed to execute bot action for unit ${action.unitKey}:`, error);
      return false;
    }
  }

  /**
   * Get performance metrics for the last bot decision
   */
  public getLastDecisionTime(): number {
    return this.lastDecisionTime;
  }

  /**
   * Create BotPlannerInput from current game state and activation
   */
  private createPlannerInput(_activation: UnitActivation): BotPlannerInput {
    // Get all bot units
    const botUnits = this.createPlannerUnitSnapshots('Bot');
    
    // Get all player units  
    const playerUnits = this.createPlannerUnitSnapshots('Player');
    
    // Get objectives from game state
    const objectives = this.extractObjectives();
    
    // Create occupancy map
    const occupancy = this.createOccupancyMap(botUnits, playerUnits);
    
    // Create map interface
    const mapInterface = this.createMapInterface();
    
    // Create LOS checker
    const losChecker = this.createLosChecker();
    
    // Create movement allowance function
    const movementAllowance = this.createMovementAllowanceFunction();
    
    // Create attack estimator
    const attackEstimator = this.createAttackEstimator();

    return {
      botUnits,
      playerUnits,
      objectives,
      occupancy,
      map: mapInterface,
      losAllows: losChecker,
      movementAllowance,
      attackEstimator,
      difficulty: 'Normal' // Default difficulty, could be made configurable
    };
  }

  /**
   * Create planner unit snapshots for specified faction
   */
  private createPlannerUnitSnapshots(faction: 'Player' | 'Bot'): PlannerUnitSnapshot[] {
    const units = this.gameEngine.getUnitsForFaction(faction);
    
    return units.map((unit: any) => ({
      unit: unit, // Pass the unit directly as ScenarioUnit
      definition: this.gameEngine.getUnitDefinition(unit.type)
    }));
  }

  /**
   * Extract objectives from game state
   */
  private extractObjectives(): { hex: Axial; owner: "Player" | "Bot"; vp: number }[] {
    // Extract objectives from the game state
    // This would depend on how objectives are stored in the game engine
    const objectives = this.gameEngine.getObjectives() || [];
    
    return objectives.map((obj: any) => ({
      hex: obj.hex,
      owner: obj.owner,
      vp: obj.vp || 1
    }));
  }

  /**
   * Create occupancy map for bot planner
   */
  private createOccupancyMap(
    botUnits: PlannerUnitSnapshot[],
    playerUnits: PlannerUnitSnapshot[]
  ): ReadonlyMap<string, "bot" | "player"> {
    const occupancy = new Map<string, "bot" | "player">();
    
    botUnits.forEach(unit => {
      occupancy.set(axialKey(unit.unit.hex), "bot");
    });
    
    playerUnits.forEach(unit => {
      occupancy.set(axialKey(unit.unit.hex), "player");
    });
    
    return occupancy;
  }

  /**
   * Create map interface for bot planner
   */
  private createMapInterface() {
    return {
      inBounds: (hex: Axial) => this.gameEngine.isInBounds(hex),
      terrainAt: (hex: Axial) => this.gameEngine.getTerrainAt(hex),
      movementCost: (hex: Axial, moveType: string) => this.gameEngine.getMovementCost(hex, moveType),
      featuresAt: (hex: Axial) => this.gameEngine.getFeaturesAt(hex),
      isRoad: (hex: Axial) => this.gameEngine.isRoad(hex),
      hexModificationsAt: (hex: Axial) => this.gameEngine.getHexModificationsAt(hex)
    };
  }

  /**
   * Create LOS checker for bot planner
   */
  private createLosChecker() {
    return (attackerHex: Axial, targetHex: Axial, isAir: boolean) => 
      this.gameEngine.checkLineOfSight(attackerHex, targetHex, isAir);
  }

  /**
   * Create movement allowance function for bot planner
   */
  private createMovementAllowanceFunction() {
    return (snapshot: PlannerUnitSnapshot) => {
      // Use unit ID from the snapshot
      const unit = this.gameEngine.getUnit(snapshot.unit.unitId);
      return unit ? unit.movement : 0;
    };
  }

  /**
   * Create attack estimator for bot planner
   */
  private createAttackEstimator() {
    return (
      attacker: PlannerUnitSnapshot,
      attackerHex: Axial,
      defender: PlannerUnitSnapshot,
      defenderHex: Axial
    ) => {
      const attackerUnit = this.gameEngine.getUnit(attacker.unit.unitId);
      const defenderUnit = this.gameEngine.getUnit(defender.unit.unitId);
      
      if (!attackerUnit || !defenderUnit) {
        return null;
      }
      
      return this.gameEngine.estimateAttack(attackerUnit, defenderUnit, attackerHex, defenderHex);
    };
  }

  /**
   * Convert AdvancedBotAction to PlannedBotAction
   */
  private convertAdvancedAction(advancedAction: AdvancedBotAction): PlannedBotAction {
    return {
      unit: advancedAction.unit,
      unitKey: advancedAction.unitKey,
      origin: advancedAction.origin,
      destination: advancedAction.destination,
      path: advancedAction.path,
      attackTarget: advancedAction.attackTarget,
      expectedDamage: advancedAction.expectedDamage,
      expectedRetaliation: advancedAction.expectedRetaliation,
      score: advancedAction.tacticalAnalysis.outcome.total,
      rationale: `Advanced AI (${advancedAction.confidence}% confidence): ${advancedAction.rationale}`
    };
  }

  /**
   * Create a no-op action when no valid action is found
   */
  private createNoOpAction(activation: UnitActivation): PlannedBotAction {
    const unit = this.gameEngine.getUnit(activation.unitId);
    
    return {
      unit: {
        unit: unit || {
          unitId: activation.unitId,
          hex: { q: 0, r: 0 },
          type: 'infantry',
          strength: 100,
          movement: 0,
          hasMoved: false,
          hasAttacked: false
        },
        definition: this.gameEngine.getUnitDefinition(unit?.type || 'infantry')
      },
      unitKey: activation.unitId,
      origin: unit?.hex || { q: 0, r: 0 },
      destination: unit?.hex || { q: 0, r: 0 },
      path: [],
      attackTarget: null,
      expectedDamage: 0,
      expectedRetaliation: 0,
      score: 0,
      rationale: 'No valid action available'
    };
  }

  /**
   * Helper function to compare axial coordinates
   */
  private axialEqual(a: Axial, b: Axial): boolean {
    return a.q === b.q && a.r === b.r;
  }
}

/**
 * Helper function to create axial key (assuming this exists elsewhere)
 */
function axialKey(hex: Axial): string {
  return `${hex.q},${hex.r}`;
}
