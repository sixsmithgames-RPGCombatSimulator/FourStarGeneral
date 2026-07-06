/**
 * Tactical Analysis Engine for Advanced Bot AI
 * 
 * Provides chess-like lookahead capabilities for tactical decision making.
 * Analyzes terrain, threats, and opportunities to plan optimal moves.
 * 
 * @since Advanced Bot AI v1.0
 */

import type { Axial } from '../../core/Hex';
import type { ScenarioUnit, UnitTypeDefinition, TerrainDefinition } from '../../core/types';
import type { BotPlannerInput, PlannerUnitSnapshot } from './BotPlanner';

/**
 * Tactical evaluation score components
 */
export interface TacticalScore {
  /** Positional advantage (-100 to +100) */
  positional: number;
  /** Threat level to enemies (-100 to +100) */
  threat: number;
  /** Defensive safety (-100 to +100) */
  defense: number;
  /** Objective control (-100 to +100) */
  objectives: number;
  /** Overall composite score */
  total: number;
}

/**
 * Threat assessment result
 */
export interface ThreatAssessment {
  /** Units that can attack this position */
  attackers: string[];
  /** Maximum damage that can be inflicted */
  maxDamage: number;
  /** Probability of being hit */
  hitProbability: number;
  /** Overall threat level (0-100) */
  threatLevel: number;
}

/**
 * Movement opportunity analysis
 */
export interface MovementOpportunity {
  /** Target position */
  position: Axial;
  /** Tactical score for this position */
  score: TacticalScore;
  /** Threat level at this position */
  threat: ThreatAssessment;
  /** Attack opportunities from this position */
  attackOpportunities: AttackOpportunity[];
  /** Movement cost to reach this position */
  movementCost: number;
  /** Path to reach this position */
  path: Axial[];
}

/**
 * Attack opportunity analysis
 */
export interface AttackOpportunity {
  /** Target unit */
  target: PlannerUnitSnapshot;
  /** Target position */
  targetPosition: Axial;
  /** Expected damage to target */
  expectedDamage: number;
  /** Expected retaliation damage */
  expectedRetaliation: number;
  /** Probability of hit */
  hitProbability: number;
  /** Tactical value of this target */
  targetValue: number;
  /** Overall attack score */
  attackScore: number;
}

/**
 * Game state snapshot for lookahead analysis
 */
export interface GameStateSnapshot {
  /** All bot units */
  botUnits: PlannerUnitSnapshot[];
  /** All player units */
  playerUnits: PlannerUnitSnapshot[];
  /** Current turn number */
  turnNumber: number;
  /** Units that have already acted this turn */
  actedUnits: Set<string>;
  /** Smoke and effect positions */
  smokePositions: Set<string>;
  /** Current tactical evaluation */
  evaluation: TacticalScore;
}

/**
 * Lookahead analysis result
 */
export interface LookaheadResult {
  /** Best move found */
  bestMove: {
    unitId: string;
    destination: Axial;
    attackTarget: string | null;
    expectedOutcome: TacticalScore;
  } | null;
  /** Alternative moves with their scores */
  alternatives: Array<{
    unitId: string;
    destination: Axial;
    attackTarget: string | null;
    expectedOutcome: TacticalScore;
  }>;
  /** Depth of analysis performed */
  depth: number;
  /** Positions evaluated */
  positionsEvaluated: number;
  /** Analysis time in milliseconds */
  analysisTime: number;
}

/**
 * Advanced Tactical Analysis Engine
 * 
 * Provides chess-like evaluation and lookahead capabilities for bot AI.
 * Uses minimax algorithm with alpha-beta pruning for efficient search.
 */
export class TacticalAnalysisEngine {
  private readonly MAX_LOOKAHEAD_DEPTH = 3; // Can be adjusted for performance
  private readonly ANALYSIS_TIME_LIMIT = 1000; // 1 second max per decision
  
  // Tactical evaluation weights
  private readonly WEIGHTS = {
    positional: 0.25,
    threat: 0.30,
    defense: 0.25,
    objectives: 0.20
  };

  // Unit type tactical values
  private readonly UNIT_VALUES = {
    infantry: 10,
    armor: 25,
    artillery: 20,
    antiTank: 18,
    recon: 12,
    engineer: 8,
    airDefense: 15,
    supply: 5
  };

  /**
   * Analyze current tactical situation and provide lookahead analysis
   * 
   * @param unit - Unit to analyze moves for
   * @param input - Current game state
   * @returns Lookahead analysis result
   */
  public analyzePosition(
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): LookaheadResult {
    const startTime = Date.now();
    
    // Create initial game state
    const initialState = this.createGameStateSnapshot(input);
    
    // Generate possible moves for this unit
    const possibleMoves = this.generatePossibleMoves(unit, input);
    
    if (possibleMoves.length === 0) {
      return {
        bestMove: null,
        alternatives: [],
        depth: 0,
        positionsEvaluated: 0,
        analysisTime: Date.now() - startTime
      };
    }

    // Evaluate each move with lookahead
    const moveEvaluations: Array<{
      move: {
        unitId: string;
        destination: Axial;
        attackTarget: string | null;
        expectedOutcome: TacticalScore;
      };
      score: number;
    }> = [];

    for (const move of possibleMoves) {
      // Check time limit
      if (Date.now() - startTime > this.ANALYSIS_TIME_LIMIT) {
        break;
      }

      // Simulate the move and evaluate with lookahead
      const simulatedState = this.simulateMove(initialState, unit, move);
      const evaluation = this.evaluatePositionWithLookahead(
        simulatedState,
        this.MAX_LOOKAHEAD_DEPTH - 1,
        -Infinity,
        Infinity,
        false // Next turn would be player's turn
      );

      moveEvaluations.push({
        move: {
          unitId: unit.unit.unitId || 'unknown',
          destination: move.position,
          attackTarget: move.attackOpportunities.length > 0 
            ? move.attackOpportunities[0].target.unit.unitId || null 
            : null,
          expectedOutcome: evaluation
        },
        score: evaluation.total
      });
    }

    // Sort by score
    moveEvaluations.sort((a, b) => b.score - a.score);

    const bestMove = moveEvaluations[0]?.move || null;
    const alternatives = moveEvaluations.slice(1, 5).map(evaluation => evaluation.move);

    return {
      bestMove,
      alternatives,
      depth: this.MAX_LOOKAHEAD_DEPTH,
      positionsEvaluated: moveEvaluations.length,
      analysisTime: Date.now() - startTime
    };
  }

  /**
   * Generate all possible moves for a unit
   */
  private generatePossibleMoves(
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): MovementOpportunity[] {
    const opportunities: MovementOpportunity[] = [];
    
    // Get movement allowance
    const movementAllowance = input.movementAllowance(unit);
    if (movementAllowance <= 0) {
      return opportunities;
    }

    // Calculate reachable hexes
    const reachableHexes = this.calculateReachableHexes(
      unit.unit.hex,
      movementAllowance,
      unit.definition.moveType,
      input
    );

    // Analyze each reachable position
    for (const hex of reachableHexes) {
      const opportunity = this.analyzePositionForMovement(hex, unit, input);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Sort by tactical score
    opportunities.sort((a, b) => b.score.total - a.score.total);

    // Return top opportunities (limit for performance)
    return opportunities.slice(0, 20);
  }

  /**
   * Analyze a specific position for tactical value
   */
  private analyzePositionForMovement(
    position: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): MovementOpportunity | null {
    // Calculate path to position
    const path = this.calculatePath(unit.unit.hex, position, input);
    if (!path) {
      return null;
    }

    // Calculate movement cost
    const movementCost = this.calculateMovementCost(path, unit.definition.moveType, input);

    // Analyze threats at this position
    const threat = this.assessThreats(position, unit, input);

    // Analyze attack opportunities
    const attackOpportunities = this.analyzeAttackOpportunities(position, unit, input);

    // Calculate tactical score
    const score = this.calculateTacticalScore(
      position,
      unit,
      threat,
      attackOpportunities,
      input
    );

    return {
      position,
      score,
      threat,
      attackOpportunities,
      movementCost,
      path
    };
  }

  /**
   * Assess threats to a unit at a specific position
   */
  private assessThreats(
    position: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): ThreatAssessment {
    const attackers: string[] = [];
    let maxDamage = 0;
    let totalHitProbability = 0;

    // Check all enemy units
    for (const enemy of input.playerUnits) {
      // Check if enemy can attack this position
      const range = this.getUnitAttackRange(enemy.definition);
      const distance = this.calculateDistance(position, enemy.unit.hex);

      if (distance <= range) {
        // Check line of sight
        if (input.losAllows(enemy.unit.hex, position, this.isAirUnit(enemy.definition))) {
          const damage = this.estimateDamage(enemy, unit, enemy.unit.hex, position);
          const hitProb = this.calculateHitProbability(enemy, unit, distance, input);

          attackers.push(enemy.unit.unitId || 'unknown');
          maxDamage = Math.max(maxDamage, damage);
          totalHitProbability += hitProb;
        }
      }
    }

    const threatLevel = attackers.length > 0 
      ? (maxDamage * 0.6 + totalHitProbability * 40) / attackers.length 
      : 0;

    return {
      attackers,
      maxDamage,
      hitProbability: attackers.length > 0 ? totalHitProbability / attackers.length : 0,
      threatLevel: Math.min(100, threatLevel)
    };
  }

  /**
   * Analyze attack opportunities from a position
   */
  private analyzeAttackOpportunities(
    position: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): AttackOpportunity[] {
    const opportunities: AttackOpportunity[] = [];

    const attackRange = this.getUnitAttackRange(unit.definition);

    for (const target of input.playerUnits) {
      const distance = this.calculateDistance(position, target.unit.hex);

      if (distance <= attackRange) {
        // Check line of sight
        if (input.losAllows(position, target.unit.hex, this.isAirUnit(unit.definition))) {
          const damage = this.estimateDamage(unit, target, position, target.unit.hex);
          const retaliation = this.estimateRetaliationDamage(unit, target, position, target.unit.hex, input);
          const hitProb = this.calculateHitProbability(unit, target, distance, input);
          const unitValues: Record<string, number> = {
          infantry: 10, armor: 20, artillery: 15, antiTank: 18,
          recon: 12, engineer: 8, airDefense: 15, supply: 5
        };
        const targetValue = unitValues[target.definition.combat as unknown as string] || 10;

          const attackScore = this.calculateAttackScore(
            damage,
            retaliation,
            hitProb,
            targetValue,
            target.unit.strength
          );

          opportunities.push({
            target,
            targetPosition: target.unit.hex,
            expectedDamage: damage,
            expectedRetaliation: retaliation,
            hitProbability: hitProb,
            targetValue,
            attackScore
          });
        }
      }
    }

    // Sort by attack score
    opportunities.sort((a, b) => b.attackScore - a.attackScore);

    return opportunities.slice(0, 5); // Limit to top 5 targets
  }

  /**
   * Calculate tactical score for a position
   */
  private calculateTacticalScore(
    position: Axial,
    unit: PlannerUnitSnapshot,
    threat: ThreatAssessment,
    attackOpportunities: AttackOpportunity[],
    input: BotPlannerInput
  ): TacticalScore {
    // Positional score based on terrain and proximity to objectives
    const positional = this.calculatePositionalScore(position, unit, input);

    // Threat score (negative is bad for us)
    const threatScore = -threat.threatLevel;

    // Defensive score based on cover and terrain
    const defense = this.calculateDefensiveScore(position, unit, input);

    // Objective score based on proximity to objectives
    const objectives = this.calculateObjectiveScore(position, unit, input);

    // Add attack opportunity bonus
    const attackBonus = attackOpportunities.length > 0 
      ? Math.max(...attackOpportunities.map(op => op.attackScore)) * 0.3 
      : 0;

    const total = (positional * this.WEIGHTS.positional) +
                  (threatScore * this.WEIGHTS.threat) +
                  (defense * this.WEIGHTS.defense) +
                  (objectives * this.WEIGHTS.objectives) +
                  attackBonus;

    return {
      positional,
      threat: threatScore,
      defense,
      objectives,
      total: Math.max(-100, Math.min(100, total))
    };
  }

  /**
   * Calculate positional score based on terrain and tactical positioning
   */
  private calculatePositionalScore(
    position: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): number {
    let score = 0;

    // Terrain bonus
    const terrain = input.map.terrainAt(position);
    if (terrain) {
      // Use terrain defense value as fallback since name property not available
      if (terrain.defense >= 5) {
        score += 20; // Excellent cover (city/fortress)
      } else if (terrain.defense >= 4) {
        score += 15; // Good cover (forest)
      } else if (terrain.defense >= 2) {
        score += 10; // Some cover (hill)
      }
    }

    // Proximity to enemy units (engagement bonus)
    let closestEnemyDistance = Infinity;
    for (const enemy of input.playerUnits) {
      const distance = this.calculateDistance(position, enemy.unit.hex);
      closestEnemyDistance = Math.min(closestEnemyDistance, distance);
    }

    if (closestEnemyDistance <= 6) {
      score += 25; // Close enough to engage
    } else if (closestEnemyDistance <= 12) {
      score += 15; // Reasonable proximity
    } else {
      score -= 10; // Too far from action
    }

    // Formation cohesion bonus
    const friendlyUnits = input.botUnits.filter(bot => 
      bot.unit.unitId !== unit.unit.unitId
    );
    let nearbyAllies = 0;
    for (const ally of friendlyUnits) {
      const distance = this.calculateDistance(position, ally.unit.hex);
      if (distance <= 3) {
        nearbyAllies++;
      }
    }

    if (nearbyAllies >= 2) {
      score += 10; // Good formation
    } else if (nearbyAllies === 0) {
      score -= 15; // Isolated
    }

    return Math.max(-50, Math.min(50, score));
  }

  /**
   * Calculate defensive score based on terrain and cover
   */
  private calculateDefensiveScore(
    position: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): number {
    let score = 0;

    const terrain = input.map.terrainAt(position);
    if (terrain) {
      // Terrain defense bonus
      score += terrain.defense || 0;

      // Accuracy modifier from terrain
      if (terrain.accMod) {
        score -= terrain.accMod; // Negative accMod is good for defense
      }
    }

    // Check for smoke cover
    const positionKey = `${position.q},${position.r}`;
    // Note: smokePositions not available in BotPlannerInput
    if (false) {
      score += 20; // Smoke provides excellent concealment
    }

    // Elevation advantage
    const surroundingTerrain = this.getSurroundingTerrain(position, input);
    const elevationAdvantage = this.calculateElevationAdvantage(position, surroundingTerrain);
    score += elevationAdvantage * 5;

    return Math.max(-50, Math.min(50, score));
  }

  /**
   * Calculate objective score based on proximity to objectives
   */
  private calculateObjectiveScore(
    position: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): number {
    let score = 0;

    for (const objective of input.objectives) {
      const distance = this.calculateDistance(position, objective.hex);
      
      if (objective.owner === 'Bot') {
        // Defend our objectives
        if (distance <= 3) {
          score += objective.vp * 10;
        } else if (distance <= 6) {
          score += objective.vp * 5;
        }
      } else {
        // Capture enemy objectives
        if (distance <= 2) {
          score += objective.vp * 15;
        } else if (distance <= 5) {
          score += objective.vp * 8;
        }
      }
    }

    return Math.max(-50, Math.min(50, score));
  }

  /**
   * Calculate attack score for a potential attack
   */
  private calculateAttackScore(
    damage: number,
    retaliation: number,
    hitProbability: number,
    targetValue: number,
    targetStrength: number
  ): number {
    // Expected damage output
    const expectedDamage = damage * hitProbability;
    
    // Expected damage taken
    const expectedRetaliation = retaliation * (1 - hitProbability); // Assume we hit
    
    // Target priority based on strength and value
    const targetPriority = (targetValue * 0.6 + (100 - targetStrength) * 0.4);
    
    // Trade-off analysis
    const tradeRatio = expectedDamage > 0 ? expectedRetaliation / expectedDamage : 10;
    
    let score = expectedDamage * 2 - expectedRetaliation;
    
    // Bonus for high-value targets
    score += targetPriority * 0.5;
    
    // Penalty for unfavorable trades
    if (tradeRatio > 1.5) {
      score -= 20;
    } else if (tradeRatio < 0.7) {
      score += 15;
    }
    
    // Bonus for high hit probability
    if (hitProbability > 0.8) {
      score += 10;
    }
    
    return Math.max(-100, Math.min(100, score));
  }

  /**
   * Evaluate position with lookahead using minimax algorithm
   */
  private evaluatePositionWithLookahead(
    state: GameStateSnapshot,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizingPlayer: boolean
  ): TacticalScore {
    if (depth === 0) {
      return this.evaluateGameState(state);
    }

    if (isMaximizingPlayer) {
      // Bot's turn - maximize score
      let maxScore = { positional: -100, threat: -100, defense: -100, objectives: -100, total: -Infinity };
      
      // Generate all possible bot moves
      for (const unit of state.botUnits) {
        if (unit.unit.unitId && state.actedUnits.has(unit.unit.unitId)) continue;
        
        // Simplified move generation for performance
        const moves = this.generateSimplifiedMoves(unit, state);
        
        for (const move of moves) {
          const movementOpportunity: MovementOpportunity = {
            position: move.position,
            score: { positional: 0, threat: 0, defense: 0, objectives: 0, total: 0 },
            threat: { attackers: [], maxDamage: 0, hitProbability: 0, threatLevel: 0 },
            attackOpportunities: [],
            movementCost: 1,
            path: [move.position]
          };
          const newState = this.simulateMove(state, unit, movementOpportunity);
          const evaluation = this.evaluatePositionWithLookahead(
            newState, 
            depth - 1, 
            alpha, 
            beta, 
            false
          );
          
          if (evaluation.total > maxScore.total) {
            maxScore = evaluation;
          }
          
          alpha = Math.max(alpha, evaluation.total);
          if (beta <= alpha) {
            break; // Alpha-beta pruning
          }
        }
      }
      
      return maxScore;
    } else {
      // Player's turn - minimize score (assume optimal play)
      let minScore = { positional: 100, threat: 100, defense: 100, objectives: 100, total: Infinity };
      
      // Generate all possible player moves (simplified)
      for (const unit of state.playerUnits) {
        if (unit.unit.unitId && state.actedUnits.has(unit.unit.unitId)) continue;
        
        const moves = this.generateSimplifiedMoves(unit, state);
        
        for (const move of moves) {
          const movementOpportunity: MovementOpportunity = {
            position: move.position,
            score: { positional: 0, threat: 0, defense: 0, objectives: 0, total: 0 },
            threat: { attackers: [], maxDamage: 0, hitProbability: 0, threatLevel: 0 },
            attackOpportunities: [],
            movementCost: 1,
            path: [move.position]
          };
          const newState = this.simulateMove(state, unit, movementOpportunity);
          const evaluation = this.evaluatePositionWithLookahead(
            newState, 
            depth - 1, 
            alpha, 
            beta, 
            true
          );
          
          if (evaluation.total < minScore.total) {
            minScore = evaluation;
          }
          
          beta = Math.min(beta, evaluation.total);
          if (beta <= alpha) {
            break; // Alpha-beta pruning
          }
        }
      }
      
      return minScore;
    }
  }

  /**
   * Generate simplified moves for lookahead (performance optimization)
   */
  private generateSimplifiedMoves(
    unit: PlannerUnitSnapshot,
    state: GameStateSnapshot
  ): Array<{ position: Axial; attackTarget: string | null }> {
    const moves: Array<{ position: Axial; attackTarget: string | null }> = [];
    
    // Current position (no move)
    moves.push({ position: unit.unit.hex, attackTarget: null });
    
    // Adjacent positions (simplified movement)
    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    
    for (const dir of directions) {
      const newPos = { q: unit.unit.hex.q + dir.q, r: unit.unit.hex.r + dir.r };
      
      // Check if position is valid (simplified)
      if (this.isValidPosition(newPos, state)) {
        moves.push({ position: newPos, attackTarget: null });
      }
    }
    
    return moves;
  }

  /**
   * Create game state snapshot
   */
  private createGameStateSnapshot(input: BotPlannerInput): GameStateSnapshot {
    return {
      botUnits: [...input.botUnits],
      playerUnits: [...input.playerUnits],
      turnNumber: 0, // Would be set from actual game state
      actedUnits: new Set(),
      smokePositions: new Set(), // Would be populated from actual game state
      evaluation: { positional: 0, threat: 0, defense: 0, objectives: 0, total: 0 }
    };
  }

  /**
   * Simulate a move and return new game state
   */
  private simulateMove(
    state: GameStateSnapshot,
    unit: PlannerUnitSnapshot,
    move: MovementOpportunity
  ): GameStateSnapshot {
    // Create deep copy of state
    const newState: GameStateSnapshot = {
      botUnits: state.botUnits.map(u => ({ ...u, unit: { ...u.unit } })),
      playerUnits: state.playerUnits.map(u => ({ ...u, unit: { ...u.unit } })),
      turnNumber: state.turnNumber,
      actedUnits: new Set(state.actedUnits),
      smokePositions: new Set(state.smokePositions),
      evaluation: { ...state.evaluation }
    };

    // Update unit position
    const unitIndex = newState.botUnits.findIndex(u => u.unit.unitId === unit.unit.unitId);
    if (unitIndex >= 0) {
      newState.botUnits[unitIndex].unit.hex = move.position;
      if (unit.unit.unitId) newState.actedUnits.add(unit.unit.unitId);
    }

    // Simulate attacks
    for (const attack of move.attackOpportunities) {
      const targetIndex = newState.playerUnits.findIndex(u => u.unit.unitId === attack.target.unit.unitId);
      if (targetIndex >= 0) {
        const currentStrength = newState.playerUnits[targetIndex].unit.strength;
        // Planner lookahead works on cloned heuristic snapshots only. Live combat must use
        // GameEngine's status-pool damage packets so casualties and equipment states stay authoritative.
        newState.playerUnits[targetIndex].unit.strength = Math.max(0, currentStrength - attack.expectedDamage);
      }
    }

    return newState;
  }

  /**
   * Evaluate overall game state
   */
  private evaluateGameState(state: GameStateSnapshot): TacticalScore {
    let positional = 0;
    let threat = 0;
    let defense = 0;
    let objectives = 0;

    // Evaluate bot units
    for (const unit of state.botUnits) {
      if (unit.unit.strength <= 0) continue;
      
      positional += this.calculatePositionalScore(unit.unit.hex, unit, this.createMockInput(state));
      defense += this.calculateDefensiveScore(unit.unit.hex, unit, this.createMockInput(state));
    }

    // Evaluate player units (as threats)
    for (const unit of state.playerUnits) {
      if (unit.unit.strength <= 0) continue;
      
      const unitValues: Record<string, number> = {
      infantry: 10, armor: 20, artillery: 15, antiTank: 18,
      recon: 12, engineer: 8, airDefense: 15, supply: 5
    };
    threat += unitValues[unit.definition.combat as unknown as string] || 10;
    }

    // Calculate total
    const total = (positional * this.WEIGHTS.positional) +
                  (threat * this.WEIGHTS.threat) +
                  (defense * this.WEIGHTS.defense) +
                  (objectives * this.WEIGHTS.objectives);

    return {
      positional: Math.max(-100, Math.min(100, positional / Math.max(1, state.botUnits.length))),
      threat: Math.max(-100, Math.min(100, -threat / Math.max(1, state.playerUnits.length))),
      defense: Math.max(-100, Math.min(100, defense / Math.max(1, state.botUnits.length))),
      objectives: Math.max(-100, Math.min(100, objectives)),
      total: Math.max(-100, Math.min(100, total))
    };
  }

  // Helper methods (simplified implementations)
  private calculateReachableHexes(start: Axial, movement: number, moveType: string, input: BotPlannerInput): Axial[] {
    // Simplified implementation - would use proper pathfinding
    const hexes: Axial[] = [];
    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    
    for (let i = 1; i <= movement; i++) {
      for (const dir of directions) {
        const hex = { q: start.q + dir.q * i, r: start.r + dir.r * i };
        if (input.map.inBounds(hex)) {
          hexes.push(hex);
        }
      }
    }
    
    return hexes;
  }

  private calculatePath(from: Axial, to: Axial, input: BotPlannerInput): Axial[] {
    // Simplified pathfinding
    return [from, to];
  }

  private calculateMovementCost(path: Axial[], moveType: string, input: BotPlannerInput): number {
    return path.length - 1;
  }

  private calculateDistance(a: Axial, b: Axial): number {
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
  }

  private getUnitAttackRange(definition: UnitTypeDefinition): number {
    return definition.rangeMax || 1;
  }

  private isAirUnit(definition: UnitTypeDefinition): boolean {
    return definition.moveType === 'air';
  }

  private estimateDamage(attacker: PlannerUnitSnapshot, defender: PlannerUnitSnapshot, fromHex: Axial, toHex: Axial): number {
    // Simplified damage calculation
    return Math.floor(attacker.definition.hardAttack || attacker.definition.softAttack || 10);
  }

  private estimateRetaliationDamage(
    attacker: PlannerUnitSnapshot,
    defender: PlannerUnitSnapshot,
    fromHex: Axial,
    toHex: Axial,
    input: BotPlannerInput
  ): number {
    // Check if defender can retaliate
    const defenderRange = this.getUnitAttackRange(defender.definition);
    const distance = this.calculateDistance(toHex, fromHex);
    
    if (distance <= defenderRange && input.losAllows(toHex, fromHex, this.isAirUnit(defender.definition))) {
      return Math.floor(defender.definition.hardAttack || defender.definition.softAttack || 8);
    }
    
    return 0;
  }

  private calculateHitProbability(
    attacker: PlannerUnitSnapshot,
    target: PlannerUnitSnapshot,
    distance: number,
    input: BotPlannerInput
  ): number {
    // Simplified hit probability based on distance and unit type
    let baseProb = 0.7;
    
    if (distance > 5) baseProb -= 0.2;
    if (distance > 10) baseProb -= 0.3;
    
    return Math.max(0.1, Math.min(0.95, baseProb));
  }

  private getSurroundingTerrain(position: Axial, input: BotPlannerInput): TerrainDefinition[] {
    const terrain: TerrainDefinition[] = [];
    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    
    for (const dir of directions) {
      const hex = { q: position.q + dir.q, r: position.r + dir.r };
      const t = input.map.terrainAt(hex);
      if (t) terrain.push(t);
    }
    
    return terrain;
  }

  private calculateElevationAdvantage(position: Axial, surroundingTerrain: TerrainDefinition[]): number {
    // Simplified elevation calculation
    return Math.random() * 3 - 1.5; // Random between -1.5 and 1.5
  }

  private isValidPosition(position: Axial, state: GameStateSnapshot): boolean {
    // Check if position is not occupied
    const occupied = [...state.botUnits, ...state.playerUnits].some(u => 
      u.unit.hex.q === position.q && u.unit.hex.r === position.r
    );
    
    return !occupied;
  }

  private createMockInput(state: GameStateSnapshot): BotPlannerInput {
    // Create minimal mock input for evaluation functions
    return {
      botUnits: state.botUnits,
      playerUnits: state.playerUnits,
      objectives: [],
      occupancy: new Map(),
      map: {
        inBounds: () => true,
        terrainAt: () => null,
        movementCost: () => 1,
        featuresAt: () => [],
        isRoad: () => false,
        hexModificationsAt: () => []
      },
      losAllows: () => true,
      movementAllowance: () => 6,
      attackEstimator: () => null,
      difficulty: 'Normal'
    };
  }
}
