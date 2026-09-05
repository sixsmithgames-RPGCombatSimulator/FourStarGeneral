/**
 * Terrain Analysis Module for Advanced Bot AI
 * 
 * Provides detailed analysis of terrain features, tactical positioning,
 * and movement opportunities for intelligent decision making.
 * 
 * @since Advanced Bot AI v1.0
 */

import type { Axial } from '../../core/Hex';
import type { TerrainFeature } from '../../core/types';
import type { BotPlannerInput, PlannerUnitSnapshot } from './BotPlanner';

/**
 * Terrain tactical properties
 */
export interface TerrainTacticalProperties {
  /** Movement cost multiplier */
  movementMultiplier: number;
  /** Defense bonus */
  defenseBonus: number;
  /** Accuracy modifier (negative = harder to hit) */
  accuracyModifier: number;
  /** Concealment level (0-100) */
  concealment: number;
  /** Elevation advantage */
  elevation: number;
  /** Cover type */
  coverType: 'none' | 'light' | 'medium' | 'heavy' | 'fortified';
  /** Strategic value for this terrain type */
  strategicValue: number;
}

/**
 * Tactical position analysis
 */
export interface TacticalPosition {
  /** Position coordinates */
  position: Axial;
  /** Terrain properties */
  terrain: TerrainTacticalProperties;
  /** Visibility analysis */
  visibility: {
    /** How many enemy units can see this position */
    visibleToEnemies: number;
    /** How many enemy units can be attacked from here */
    canAttackEnemies: number;
    /** Line of sight quality (0-100) */
    lineOfSightQuality: number;
  };
  /** Movement analysis */
  movement: {
    /** Movement cost to reach this position */
    cost: number;
    /** Accessibility for different unit types */
    accessibility: {
      infantry: boolean;
      armor: boolean;
      artillery: boolean;
      air: boolean;
    };
  };
  /** Tactical advantages */
  advantages: {
    /** Height advantage over surrounding area */
    heightAdvantage: number;
    /** Choke point potential */
    chokePoint: boolean;
    /** Flanking opportunities */
    flankingOpportunities: number;
    /** Defensive strength */
    defensiveStrength: number;
  };
}

/**
 * Smoke and concealment analysis
 */
export interface ConcealmentAnalysis {
  /** Current smoke positions */
  smokePositions: Set<string>;
  /** Natural concealment from terrain */
  naturalConcealment: Map<string, number>;
  /** Effective concealment level (0-100) */
  effectiveConcealment: number;
  /** Best concealment positions nearby */
  bestConcealmentPositions: Axial[];
  /** Predicted enemy observation posts */
  enemyObservationPosts: Axial[];
}

/**
 * Terrain Analysis Module
 * 
 * Provides comprehensive terrain analysis for tactical decision making.
 */
export class TerrainAnalysisModule {
  // Terrain tactical properties database
  private readonly terrainProperties: Map<string, TerrainTacticalProperties> = new Map([
    ['clear', {
      movementMultiplier: 1.0,
      defenseBonus: 0,
      accuracyModifier: 0,
      concealment: 0,
      elevation: 0,
      coverType: 'none',
      strategicValue: 5
    }],
    ['forest', {
      movementMultiplier: 1.5,
      defenseBonus: 15,
      accuracyModifier: -20,
      concealment: 70,
      elevation: 0,
      coverType: 'heavy',
      strategicValue: 25
    }],
    ['hill', {
      movementMultiplier: 1.2,
      defenseBonus: 10,
      accuracyModifier: -10,
      concealment: 20,
      elevation: 3,
      coverType: 'light',
      strategicValue: 20
    }],
    ['mountain', {
      movementMultiplier: 2.0,
      defenseBonus: 25,
      accuracyModifier: -30,
      concealment: 80,
      elevation: 5,
      coverType: 'fortified',
      strategicValue: 30
    }],
    ['city', {
      movementMultiplier: 1.3,
      defenseBonus: 20,
      accuracyModifier: -25,
      concealment: 60,
      elevation: 2,
      coverType: 'fortified',
      strategicValue: 35
    }],
    ['urban', {
      movementMultiplier: 1.4,
      defenseBonus: 18,
      accuracyModifier: -22,
      concealment: 55,
      elevation: 1,
      coverType: 'heavy',
      strategicValue: 30
    }],
    ['road', {
      movementMultiplier: 0.7,
      defenseBonus: 0,
      accuracyModifier: 5,
      concealment: 0,
      elevation: 0,
      coverType: 'none',
      strategicValue: 10
    }],
    ['water', {
      movementMultiplier: Infinity, // Impassable for most units
      defenseBonus: 0,
      accuracyModifier: 0,
      concealment: 10,
      elevation: -2,
      coverType: 'none',
      strategicValue: 5
    }],
    ['swamp', {
      movementMultiplier: 2.5,
      defenseBonus: 5,
      accuracyModifier: -15,
      concealment: 40,
      elevation: -1,
      coverType: 'light',
      strategicValue: 10
    }],
    ['rough', {
      movementMultiplier: 1.8,
      defenseBonus: 8,
      accuracyModifier: -12,
      concealment: 30,
      elevation: 1,
      coverType: 'light',
      strategicValue: 15
    }]
  ]);

  /**
   * Analyze tactical properties of a specific position
   */
  public analyzePosition(
    position: Axial,
    input: BotPlannerInput,
    unit?: PlannerUnitSnapshot
  ): TacticalPosition {
    const terrain = this.getTerrainProperties(position, input);
    const visibility = this.analyzeVisibility(position, input, unit);
    const movement = this.analyzeMovement(position, input, unit);
    const advantages = this.analyzeAdvantages(position, input, terrain);

    return {
      position,
      terrain,
      visibility,
      movement,
      advantages
    };
  }

  /**
   * Analyze concealment opportunities in an area
   */
  public analyzeConcealment(
    centerPosition: Axial,
    radius: number,
    input: BotPlannerInput
  ): ConcealmentAnalysis {
    const smokePositions = new Set<string>();
    const naturalConcealment = new Map<string, number>();
    const bestConcealmentPositions: Axial[] = [];
    const enemyObservationPosts: Axial[] = [];

    // Analyze all positions in radius
    for (let q = centerPosition.q - radius; q <= centerPosition.q + radius; q++) {
      for (let r = centerPosition.r - radius; r <= centerPosition.r + radius; r++) {
        const pos = { q, r };
        const distance = this.calculateDistance(centerPosition, pos);
        
        if (distance <= radius && input.map.inBounds(pos)) {
          const terrain = this.getTerrainProperties(pos, input);
          const concealment = terrain.concealment;
          
          naturalConcealment.set(`${q},${r}`, concealment);
          
          if (concealment >= 60) {
            bestConcealmentPositions.push(pos);
          }
        }
      }
    }

    // Identify enemy observation posts (high ground, clear terrain)
    for (const enemy of input.playerUnits) {
      const enemyTerrain = this.getTerrainProperties(enemy.unit.hex, input);
      if (enemyTerrain.elevation >= 2 || enemyTerrain.coverType === 'none') {
        enemyObservationPosts.push(enemy.unit.hex);
      }
    }

    return {
      smokePositions,
      naturalConcealment,
      effectiveConcealment: this.calculateEffectiveConcealment(centerPosition, input),
      bestConcealmentPositions,
      enemyObservationPosts
    };
  }

  /**
   * Find optimal movement path considering terrain
   */
  public findOptimalPath(
    from: Axial,
    to: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput,
    preferences: {
      preferCover?: boolean;
      avoidThreats?: boolean;
      minimizeExposure?: boolean;
    } = {}
  ): Axial[] {
    // Simplified A* pathfinding with terrain considerations
    const openSet: Array<{ pos: Axial; g: number; h: number; f: number; path: Axial[] }> = [];
    const closedSet = new Set<string>();
    const _startKey = `${from.q},${from.r}`;

    openSet.push({
      pos: from,
      g: 0,
      h: this.calculateHeuristic(from, to),
      f: this.calculateHeuristic(from, to),
      path: [from]
    });

    while (openSet.length > 0) {
      // Find node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;

      const currentKey = `${current.pos.q},${current.pos.r}`;
      
      if (currentKey === `${to.q},${to.r}`) {
        return current.path;
      }

      closedSet.add(currentKey);

      // Check neighbors
      const neighbors = this.getNeighbors(current.pos);
      for (const neighbor of neighbors) {
        if (!input.map.inBounds(neighbor)) continue;
        
        const neighborKey = `${neighbor.q},${neighbor.r}`;
        if (closedSet.has(neighborKey)) continue;

        const terrain = this.getTerrainProperties(neighbor, input);
        const movementCost = this.calculateMovementCost(neighbor, unit, input);
        
        if (movementCost === Infinity) continue; // Impassable

        const g = current.g + movementCost;
        const h = this.calculateHeuristic(neighbor, to);
        
        // Apply preferences
        let f = g + h;
        
        if (preferences.preferCover) {
          f -= terrain.defenseBonus * 0.5;
        }
        
        if (preferences.minimizeExposure) {
          const exposure = this.calculateExposure(neighbor, input);
          f += exposure * 2;
        }

        const existingNode = openSet.find(n => n.pos.q === neighbor.q && n.pos.r === neighbor.r);
        
        if (!existingNode || g < existingNode.g) {
          if (existingNode) {
            openSet.splice(openSet.indexOf(existingNode), 1);
          }
          
          openSet.push({
            pos: neighbor,
            g,
            h,
            f,
            path: [...current.path, neighbor]
          });
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Identify tactical choke points in an area
   */
  public identifyChokePoints(
    area: { center: Axial; radius: number },
    input: BotPlannerInput
  ): Array<{ position: Axial; strength: number; reason: string }> {
    const chokePoints: Array<{ position: Axial; strength: number; reason: string }> = [];

    // Analyze terrain for natural choke points
    for (let q = area.center.q - area.radius; q <= area.center.q + area.radius; q++) {
      for (let r = area.center.r - area.radius; r <= area.center.r + area.radius; r++) {
        const pos = { q, r };
        const distance = this.calculateDistance(area.center, pos);
        
        if (distance <= area.radius && input.map.inBounds(pos)) {
          const strength = this.calculateChokePointStrength(pos, input);
          
          if (strength > 0.5) {
            const reason = this.getChokePointReason(pos, input);
            chokePoints.push({ position: pos, strength, reason });
          }
        }
      }
    }

    // Sort by strength
    chokePoints.sort((a, b) => b.strength - a.strength);

    return chokePoints.slice(0, 10); // Return top 10
  }

  /**
   * Get terrain properties for a position
   */
  private getTerrainProperties(position: Axial, input: BotPlannerInput): TerrainTacticalProperties {
    const terrain = input.map.terrainAt(position);
    
    if (!terrain) {
      return this.terrainProperties.get('clear')!;
    }

    // Use terrain defense value as fallback since type property not available
    let properties = this.terrainProperties.get('clear')!;
    properties.movementMultiplier = (terrain.moveCost?.leg || 1);
    
    if (!properties) {
      properties = this.terrainProperties.get('clear')!;
    }

    // Apply terrain features
    const features = input.map.featuresAt?.(position) || [];
    for (const feature of features) {
      properties = this.applyTerrainFeature(properties, feature);
    }

    return { ...properties };
  }

  /**
   * Apply terrain feature modifiers
   */
  private applyTerrainFeature(
    base: TerrainTacticalProperties,
    feature: TerrainFeature
  ): TerrainTacticalProperties {
    const modified = { ...base };

    // Handle specific terrain features with proper type checking
    if (feature === 'moderate fortifications' || feature === 'heavy fortifications') {
      modified.defenseBonus += 15;
      modified.coverType = 'fortified';
      modified.strategicValue += 10;
    } else if (feature === 'trees' || feature === 'shrubs') {
      modified.concealment = Math.max(modified.concealment, 80);
      modified.accuracyModifier -= 15;
    } else if (feature === 'rocks' || feature === 'cliffs') {
      modified.defenseBonus += 8;
      modified.movementMultiplier *= 1.3;
      modified.concealment += 20;
    } else if (feature === 'foothills') {
      modified.defenseBonus -= 5;
      modified.movementMultiplier *= 1.5;
    }

    return modified;
  }

  /**
   * Analyze visibility from a position
   */
  private analyzeVisibility(
    position: Axial,
    input: BotPlannerInput,
    unit?: PlannerUnitSnapshot
  ): TacticalPosition['visibility'] {
    let visibleToEnemies = 0;
    let canAttackEnemies = 0;
    let totalLineOfSightQuality = 0;

    const attackRange = unit ? this.getUnitAttackRange(unit.definition) : 10;

    for (const enemy of input.playerUnits) {
      const distance = this.calculateDistance(position, enemy.unit.hex);
      
      // Check if enemy can see this position
      if (input.losAllows(enemy.unit.hex, position, this.isAirUnit(enemy.definition))) {
        visibleToEnemies++;
        
        // Calculate line of sight quality based on distance and terrain
        const losQuality = this.calculateLineOfSightQuality(position, enemy.unit.hex, input);
        totalLineOfSightQuality += losQuality;
      }

      // Check if we can attack enemy from this position
      if (unit && distance <= attackRange && input.losAllows(position, enemy.unit.hex, this.isAirUnit(unit.definition))) {
        canAttackEnemies++;
      }
    }

    const lineOfSightQuality = visibleToEnemies > 0 ? totalLineOfSightQuality / visibleToEnemies : 100;

    return {
      visibleToEnemies,
      canAttackEnemies,
      lineOfSightQuality
    };
  }

  /**
   * Analyze movement properties of a position
   */
  private analyzeMovement(
    position: Axial,
    input: BotPlannerInput,
    unit?: PlannerUnitSnapshot
  ): TacticalPosition['movement'] {
    const terrain = this.getTerrainProperties(position, input);
    const cost = this.calculateMovementCost(position, unit!, input);

    const accessibility = {
      infantry: terrain.movementMultiplier < Infinity,
      armor: terrain.movementMultiplier < 2.0,
      artillery: terrain.movementMultiplier < 2.5,
      air: true // Air units ignore terrain
    };

    return {
      cost,
      accessibility
    };
  }

  /**
   * Analyze tactical advantages of a position
   */
  private analyzeAdvantages(
    position: Axial,
    input: BotPlannerInput,
    terrain: TerrainTacticalProperties
  ): TacticalPosition['advantages'] {
    const heightAdvantage = this.calculateHeightAdvantage(position, input);
    const chokePoint = this.calculateChokePointStrength(position, input) > 0.5;
    const flankingOpportunities = this.calculateFlankingOpportunities(position, input);
    const defensiveStrength = terrain.defenseBonus + terrain.concealment * 0.3;

    return {
      heightAdvantage,
      chokePoint,
      flankingOpportunities,
      defensiveStrength
    };
  }

  /**
   * Calculate effective concealment for a position
   */
  private calculateEffectiveConcealment(position: Axial, input: BotPlannerInput): number {
    const terrain = this.getTerrainProperties(position, input);
    let concealment = terrain.concealment;

    // Add smoke effects if present
    const _positionKey = `${position.q},${position.r}`;
    // Note: smokePositions not available in BotPlannerInput
    if (false) {
      concealment = Math.max(concealment, 80);
    }

    // Consider time of day (would need game state)
    // concealment += this.getTimeBasedConcealment();

    return Math.min(100, concealment);
  }

  /**
   * Calculate exposure level (how visible a position is)
   */
  private calculateExposure(position: Axial, input: BotPlannerInput): number {
    let exposure = 100; // Start fully exposed

    const terrain = this.getTerrainProperties(position, input);
    exposure -= terrain.concealment;
    exposure -= terrain.defenseBonus * 0.5;

    // Check if in enemy line of sight
    for (const enemy of input.playerUnits) {
      if (input.losAllows(enemy.unit.hex, position, this.isAirUnit(enemy.definition))) {
        exposure += 20; // Being seen increases exposure
      }
    }

    return Math.max(0, Math.min(100, exposure));
  }

  /**
   * Calculate choke point strength of a position
   */
  private calculateChokePointStrength(position: Axial, input: BotPlannerInput): number {
    const neighbors = this.getNeighbors(position);
    let passableNeighbors = 0;
    let totalCost = 0;

    for (const neighbor of neighbors) {
      if (!input.map.inBounds(neighbor)) continue;
      
      const terrain = this.getTerrainProperties(neighbor, input);
      if (terrain.movementMultiplier < Infinity) {
        passableNeighbors++;
        totalCost += terrain.movementMultiplier;
      }
    }

    // A position is a choke point if it has limited passable neighbors
    // and those neighbors are high-cost to move through
    if (passableNeighbors <= 2) {
      const avgCost = passableNeighbors > 0 ? totalCost / passableNeighbors : 1;
      return Math.min(1.0, avgCost / 2.0);
    }

    return 0;
  }

  /**
   * Get reason for choke point classification
   */
  private getChokePointReason(position: Axial, input: BotPlannerInput): string {
    const terrain = input.map.terrainAt(position);
    const neighbors = this.getNeighbors(position);
    let passableCount = 0;

    for (const neighbor of neighbors) {
      if (input.map.inBounds(neighbor)) {
        const neighborTerrain = input.map.terrainAt(neighbor);
        // Use movement cost as water indicator since type property not available
    if (neighborTerrain?.moveCost?.leg !== undefined && neighborTerrain.moveCost.leg < 999) {
          passableCount++;
        }
      }
    }

    // Use defense value as terrain indicator since type property not available
    if (terrain?.defense && terrain.defense >= 3) {
      return 'High ground with limited approaches';
    } else if (passableCount <= 2) {
      return 'Narrow passage with limited routes';
    } else {
      return 'Strategic terrain bottleneck';
    }
  }

  /**
   * Calculate flanking opportunities from a position
   */
  private calculateFlankingOpportunities(position: Axial, input: BotPlannerInput): number {
    let opportunities = 0;

    for (const enemy of input.playerUnits) {
      const distance = this.calculateDistance(position, enemy.unit.hex);
      
      if (distance <= 8) { // Close enough to potentially flank
        // Check if we can approach from side or rear
        const angle = this.calculateApproachAngle(position, enemy.unit.hex, input);
        if (angle >= 45 && angle <= 135) { // Side or rear approach
          opportunities++;
        }
      }
    }

    return opportunities;
  }

  /**
   * Calculate height advantage over surrounding area
   */
  private calculateHeightAdvantage(position: Axial, input: BotPlannerInput): number {
    const currentTerrain = this.getTerrainProperties(position, input);
    let advantage = 0;

    const neighbors = this.getNeighbors(position);
    for (const neighbor of neighbors) {
      if (input.map.inBounds(neighbor)) {
        const neighborTerrain = this.getTerrainProperties(neighbor, input);
        advantage += currentTerrain.elevation - neighborTerrain.elevation;
      }
    }

    return advantage / neighbors.length;
  }

  /**
   * Calculate line of sight quality between two positions
   */
  private calculateLineOfSightQuality(from: Axial, to: Axial, input: BotPlannerInput): number {
    let quality = 100;
    const distance = this.calculateDistance(from, to);

    // Distance penalty
    quality -= distance * 2;

    // Terrain interference
    const toTerrain = this.getTerrainProperties(to, input);
    quality -= toTerrain.concealment * 0.5;

    return Math.max(0, Math.min(100, quality));
  }

  /**
   * Calculate movement cost for a unit to reach a position
   */
  private calculateMovementCost(
    position: Axial,
    unit: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): number {
    const terrain = this.getTerrainProperties(position, input);
    return input.movementAllowance(unit) * terrain.movementMultiplier;
  }

  /**
   * Calculate heuristic distance for pathfinding
   */
  private calculateHeuristic(from: Axial, to: Axial): number {
    return this.calculateDistance(from, to);
  }

  /**
   * Get neighboring hex positions
   */
  private getNeighbors(position: Axial): Axial[] {
    return [
      { q: position.q + 1, r: position.r },
      { q: position.q + 1, r: position.r - 1 },
      { q: position.q, r: position.r - 1 },
      { q: position.q - 1, r: position.r },
      { q: position.q - 1, r: position.r + 1 },
      { q: position.q, r: position.r + 1 }
    ];
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(a: Axial, b: Axial): number {
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
  }

  /**
   * Calculate approach angle for flanking
   */
  private calculateApproachAngle(from: Axial, to: Axial, _input: BotPlannerInput): number {
    // Simplified angle calculation
    const dx = to.q - from.q;
    const dy = to.r - from.r;
    return Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  }

  /**
   * Get unit attack range
   */
  private getUnitAttackRange(definition: any): number {
    return definition.attack?.range || 1;
  }

  /**
   * Check if unit is air unit
   */
  private isAirUnit(definition: any): boolean {
    return definition.moveType === 'air';
  }
}

/**
 * Default terrain analysis module instance
 */
export const terrainAnalysisModule = new TerrainAnalysisModule();
