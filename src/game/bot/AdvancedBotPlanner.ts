/**
 * Advanced Bot Planner with Tactical Lookahead
 * 
 * Integrates the tactical analysis engine with the existing bot planner
 * to provide chess-like strategic decision making with 3-4 turn lookahead.
 * 
 * @since Advanced Bot AI v1.0
 */

import { planHeuristicBotTurn, type BotPlannerInput, type PlannedBotAction } from './BotPlanner';
import { TacticalAnalysisEngine, type LookaheadResult, type TacticalScore } from './TacticalAnalysisEngine';
import type { Axial } from '../../core/Hex';

/**
 * Enhanced bot action with tactical analysis
 */
export interface AdvancedBotAction extends PlannedBotAction {
  /** Tactical analysis of this action */
  tacticalAnalysis: {
    /** Expected tactical outcome */
    outcome: TacticalScore;
    /** Threat level after action */
    threatLevel: number;
    /** Attack opportunities created */
    attackOpportunities: number;
    /** Positional improvement */
    positionalGain: number;
  };
  /** Lookahead depth used for this decision */
  lookaheadDepth: number;
  /** Confidence in this decision (0-100) */
  confidence: number;
  /** Alternative actions considered */
  alternatives: Array<{
    action: PlannedBotAction;
    expectedScore: number;
  }>;
}

/**
 * Advanced Bot Planner Configuration
 */
export interface AdvancedBotPlannerConfig {
  /** Maximum lookahead depth (1-4, higher = smarter but slower) */
  maxLookaheadDepth: number;
  /** Time limit per decision in milliseconds */
  decisionTimeLimit: number;
  /** Enable tactical analysis */
  enableTacticalAnalysis: boolean;
  /** Enable smoke and concealment tactics */
  enableSmokeTactics: boolean;
  /** Enable terrain analysis */
  enableTerrainAnalysis: boolean;
  /** Aggressiveness level (0-100) */
  aggressiveness: number;
  /** Risk tolerance (0-100) */
  riskTolerance: number;
}

/**
 * Advanced Bot Planner
 * 
 * Combines heuristic planning with deep tactical analysis and lookahead.
 * Provides chess-like strategic decision making capabilities.
 */
export class AdvancedBotPlanner {
  private tacticalEngine: TacticalAnalysisEngine;
  private config: AdvancedBotPlannerConfig;

  constructor(config: Partial<AdvancedBotPlannerConfig> = {}) {
    this.config = {
      maxLookaheadDepth: 3,
      decisionTimeLimit: 1000,
      enableTacticalAnalysis: true,
      enableSmokeTactics: true,
      enableTerrainAnalysis: true,
      aggressiveness: 50,
      riskTolerance: 30,
      ...config
    };

    this.tacticalEngine = new TacticalAnalysisEngine();
  }

  /**
   * Plan advanced bot turn with tactical lookahead
   * 
   * @param input - Current game state
   * @returns Enhanced bot actions with tactical analysis
   */
  public planAdvancedBotTurn(input: BotPlannerInput): AdvancedBotAction[] {
    const startTime = Date.now();
    
    // Get base heuristic actions
    const heuristicActions = planHeuristicBotTurn(input);
    
    if (!this.config.enableTacticalAnalysis) {
      // Return heuristic actions with basic enhancement
      return heuristicActions.map(action => this.enhanceActionWithBasicAnalysis(action, input));
    }

    // Enhance each action with tactical analysis
    const enhancedActions: AdvancedBotAction[] = [];

    for (const action of heuristicActions) {
      // Check time limit
      if (Date.now() - startTime > this.config.decisionTimeLimit) {
        console.warn('Advanced bot planning time limit reached, using remaining heuristic actions');
        enhancedActions.push(...heuristicActions.slice(enhancedActions.length).map(action => 
          this.enhanceActionWithBasicAnalysis(action, input)
        ));
        break;
      }

      // Find the corresponding unit snapshot
      const unitSnapshot = input.botUnits.find(u => u.unit.unitId === action.unitKey);
      if (!unitSnapshot) {
        console.warn(`Unit snapshot not found for ${action.unitKey}`);
        continue;
      }

      // Perform tactical analysis
      const tacticalResult = this.tacticalEngine.analyzePosition(unitSnapshot, input);

      // Create enhanced action
      const enhancedAction = this.createEnhancedAction(action, tacticalResult, input);
      enhancedActions.push(enhancedAction);
    }

    // Sort by tactical score
    enhancedActions.sort((a, b) => b.tacticalAnalysis.outcome.total - a.tacticalAnalysis.outcome.total);

    console.log(`Advanced bot planning completed in ${Date.now() - startTime}ms for ${enhancedActions.length} units`);

    return enhancedActions;
  }

  /**
   * Plan single unit action with deep analysis
   */
  public planUnitAction(unitKey: string, input: BotPlannerInput): AdvancedBotAction | null {
    const unitSnapshot = input.botUnits.find(u => u.unit.unitId === unitKey);
    if (!unitSnapshot) {
      return null;
    }

    // Get heuristic action for this unit
    const heuristicActions = planHeuristicBotTurn(input);
    const heuristicAction = heuristicActions.find(a => a.unitKey === unitKey);
    
    if (!heuristicAction) {
      return null;
    }

    // Perform tactical analysis
    const tacticalResult = this.tacticalEngine.analyzePosition(unitSnapshot, input);

    return this.createEnhancedAction(heuristicAction, tacticalResult, input);
  }

  /**
   * Get tactical assessment for current position
   */
  public getTacticalAssessment(unitKey: string, input: BotPlannerInput): TacticalScore | null {
    const unitSnapshot = input.botUnits.find(u => u.unit.unitId === unitKey);
    if (!unitSnapshot) {
      return null;
    }

    const result = this.tacticalEngine.analyzePosition(unitSnapshot, input);
    return result.bestMove?.expectedOutcome || null;
  }

  /**
   * Create enhanced action with tactical analysis
   */
  private createEnhancedAction(
    baseAction: PlannedBotAction,
    tacticalResult: LookaheadResult,
    input: BotPlannerInput
  ): AdvancedBotAction {
    const outcome = tacticalResult.bestMove?.expectedOutcome || {
      positional: 0,
      threat: 0,
      defense: 0,
      objectives: 0,
      total: 0
    };

    // Calculate confidence based on analysis depth and score consistency
    const confidence = this.calculateConfidence(tacticalResult, baseAction);

    // Create alternatives from lookahead result
    const alternatives = tacticalResult.alternatives.slice(0, 3).map(alt => ({
      action: this.convertLookaheadMoveToAction(alt, input),
      expectedScore: alt.expectedOutcome.total
    }));

    // Apply aggressiveness and risk tolerance adjustments
    const adjustedScore = this.adjustScoreForPersonality(outcome.total, confidence);

    return {
      ...baseAction,
      tacticalAnalysis: {
        outcome: {
          ...outcome,
          total: adjustedScore
        },
        threatLevel: this.calculateThreatLevel(outcome),
        attackOpportunities: this.countAttackOpportunities(baseAction, input),
        positionalGain: outcome.positional
      },
      lookaheadDepth: tacticalResult.depth,
      confidence,
      alternatives
    };
  }

  /**
   * Enhance action with basic analysis (when tactical analysis is disabled)
   */
  private enhanceActionWithBasicAnalysis(
    action: PlannedBotAction,
    input: BotPlannerInput
  ): AdvancedBotAction {
    const basicScore = this.calculateBasicScore(action, input);
    
    return {
      ...action,
      tacticalAnalysis: {
        outcome: {
          positional: basicScore.positional,
          threat: basicScore.threat,
          defense: basicScore.defense,
          objectives: basicScore.objectives,
          total: basicScore.total
        },
        threatLevel: basicScore.threatLevel,
        attackOpportunities: action.attackTarget ? 1 : 0,
        positionalGain: basicScore.positional
      },
      lookaheadDepth: 0,
      confidence: 50, // Medium confidence for basic analysis
      alternatives: []
    };
  }

  /**
   * Calculate confidence in tactical decision
   */
  private calculateConfidence(tacticalResult: LookaheadResult, baseAction: PlannedBotAction): number {
    let confidence = 50; // Base confidence

    // Higher confidence with deeper analysis
    confidence += tacticalResult.depth * 10;

    // Higher confidence if best move is significantly better than alternatives
    if (tacticalResult.alternatives.length > 0) {
      const scoreDiff = tacticalResult.bestMove?.expectedOutcome.total || 0;
      const altScore = tacticalResult.alternatives[0]?.expectedOutcome.total || 0;
      const diff = scoreDiff - altScore;
      
      if (diff > 20) confidence += 20;
      else if (diff > 10) confidence += 10;
      else if (diff < 5) confidence -= 10;
    }

    // Lower confidence if analysis was rushed
    if (tacticalResult.analysisTime > this.config.decisionTimeLimit * 0.8) {
      confidence -= 15;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Adjust score based on bot personality
   */
  private adjustScoreForPersonality(baseScore: number, confidence: number): number {
    let adjustedScore = baseScore;

    // Apply aggressiveness
    if (this.config.aggressiveness > 60) {
      // More aggressive: prefer offensive actions
      adjustedScore += (this.config.aggressiveness - 60) * 0.3;
    } else if (this.config.aggressiveness < 40) {
      // More defensive: prefer safe actions
      adjustedScore -= (40 - this.config.aggressiveness) * 0.2;
    }

    // Apply risk tolerance
    if (this.config.riskTolerance > 60) {
      // More risk-tolerant: don't penalize threats as much
      adjustedScore += (this.config.riskTolerance - 60) * 0.2;
    } else if (this.config.riskTolerance < 40) {
      // More risk-averse: penalize threats more
      adjustedScore -= (40 - this.config.riskTolerance) * 0.3;
    }

    // Factor in confidence
    adjustedScore = adjustedScore * (0.5 + confidence / 200);

    return Math.max(-100, Math.min(100, adjustedScore));
  }

  /**
   * Calculate threat level from tactical outcome
   */
  private calculateThreatLevel(outcome: TacticalScore): number {
    // Threat level is inverse of defensive score
    return Math.max(0, Math.min(100, 50 - outcome.defense));
  }

  /**
   * Count attack opportunities for an action
   */
  private countAttackOpportunities(action: PlannedBotAction, input: BotPlannerInput): number {
    if (!action.attackTarget) return 0;

    // Count additional units that could be attacked from the destination
    const unit = input.botUnits.find(u => u.unit.unitId === action.unitKey);
    if (!unit) return 0;

    let opportunities = 1; // The primary attack target
    
    // Check for other nearby enemies
    const attackRange = unit.definition.rangeMax || 1;
    for (const enemy of input.playerUnits) {
      if (action.attackTarget && enemy.unit.unitId === action.attackTarget.toString()) continue;
      
      const distance = this.calculateDistance(action.destination, enemy.unit.hex);
      if (distance <= attackRange) {
        opportunities++;
      }
    }

    return opportunities;
  }

  /**
   * Calculate basic score without deep analysis
   */
  private calculateBasicScore(action: PlannedBotAction, input: BotPlannerInput): {
    positional: number;
    threat: number;
    defense: number;
    objectives: number;
    total: number;
    threatLevel: number;
  } {
    const unit = input.botUnits.find(u => u.unit.unitId === action.unitKey);
    if (!unit) {
      return { positional: 0, threat: 0, defense: 0, objectives: 0, total: 0, threatLevel: 50 };
    }

    // Simple positional evaluation
    let positional = 0;
    if (action.expectedDamage > 0) positional += 20;
    if (action.expectedRetaliation < action.expectedDamage) positional += 15;

    // Simple threat evaluation
    let threat = 0;
    if (action.expectedRetaliation > 0) threat -= 10;

    // Simple defense evaluation
    let defense = 0;
    const terrain = input.map.terrainAt(action.destination);
    if (terrain?.defense) defense += terrain.defense;

    // Simple objective evaluation
    let objectives = 0;
    for (const obj of input.objectives) {
      const distance = this.calculateDistance(action.destination, obj.hex);
      if (distance <= 3) objectives += obj.vp * 2;
    }

    const total = positional + threat + defense + objectives;
    const threatLevel = Math.max(0, Math.min(100, 50 - defense));

    return { positional, threat, defense, objectives, total, threatLevel };
  }

  /**
   * Convert lookahead move to planned action
   */
  private convertLookaheadMoveToAction(
    move: { unitId: string; destination: Axial; attackTarget: string | null },
    input: BotPlannerInput
  ): PlannedBotAction {
    const unit = input.botUnits.find(u => u.unit.unitId === move.unitId);
    if (!unit) {
      throw new Error(`Unit ${move.unitId} not found`);
    }

    return {
      unit,
      unitKey: move.unitId,
      origin: unit.unit.hex,
      destination: move.destination,
      path: [unit.unit.hex, move.destination], // Simplified path
      attackTarget: move.attackTarget as Axial | null,
      expectedDamage: 0, // Would be calculated
      expectedRetaliation: 0, // Would be calculated
      score: 0, // Would be calculated
      rationale: 'Lookahead analysis'
    };
  }

  /**
   * Calculate distance between two hex positions
   */
  private calculateDistance(a: Axial, b: Axial): number {
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
  }

  /**
   * Update planner configuration
   */
  public updateConfig(newConfig: Partial<AdvancedBotPlannerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): AdvancedBotPlannerConfig {
    return { ...this.config };
  }
}

/**
 * Default advanced bot planner instance
 */
export const advancedBotPlanner = new AdvancedBotPlanner();

/**
 * Convenience function to plan advanced bot turn
 */
export function planAdvancedBotTurn(input: BotPlannerInput): AdvancedBotAction[] {
  return advancedBotPlanner.planAdvancedBotTurn(input);
}
