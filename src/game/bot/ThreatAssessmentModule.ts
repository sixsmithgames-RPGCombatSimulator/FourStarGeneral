/**
 * Threat Assessment Module for Advanced Bot AI
 * 
 * Provides comprehensive threat analysis, target prioritization,
 * and engagement decision making based on firepower calculations.
 * 
 * @since Advanced Bot AI v1.0
 */

import type { Axial } from '../../core/Hex';
import type { ScenarioUnit, UnitTypeDefinition } from '../../core/types';
import type { BotPlannerInput, PlannerUnitSnapshot } from './BotPlanner';

/**
 * Threat level classification
 */
export enum ThreatLevel {
  NONE = 0,
  LOW = 25,
  MEDIUM = 50,
  HIGH = 75,
  CRITICAL = 100
}

/**
 * Unit threat analysis
 */
export interface UnitThreat {
  /** Unit being analyzed */
  unit: PlannerUnitSnapshot;
  /** Overall threat level */
  threatLevel: ThreatLevel;
  /** Damage potential against our units */
  damagePotential: number;
  /** Range of threat */
  threatRange: number;
  /** Mobility threat */
  mobilityThreat: number;
  /** Strategic threat (objectives, key positions) */
  strategicThreat: number;
  /** Counters available to this unit */
  availableCounters: string[];
  /** Weaknesses of this unit */
  weaknesses: string[];
}

/**
 * Engagement opportunity analysis
 */
export interface EngagementOpportunity {
  /** Target unit */
  target: PlannerUnitSnapshot;
  /** Attacker unit */
  attacker: PlannerUnitSnapshot;
  /** Engagement position */
  engagementPosition: Axial;
  /** Probability of successful hit */
  hitProbability: number;
  /** Expected damage to target */
  expectedDamage: number;
  /** Expected retaliation damage */
  expectedRetaliation: number;
  /** Trade ratio (damage dealt / damage taken) */
  tradeRatio: number;
  /** Engagement urgency */
  urgency: number;
  /** Strategic value of eliminating this target */
  strategicValue: number;
  /** Overall engagement score */
  engagementScore: number;
}

/**
 * Firepower analysis
 */
export interface FirepowerAnalysis {
  /** Total offensive firepower */
  totalOffensivePower: number;
  /** Total defensive firepower */
  totalDefensivePower: number;
  /** Firepower distribution by unit type */
  firepowerByType: Map<string, number>;
  /** Range coverage analysis */
  rangeCoverage: {
    short: number;    // 1-3 hexes
    medium: number;   // 4-8 hexes
    long: number;     // 9+ hexes
  };
  /** Anti-armor capability */
  antiArmorCapability: number;
  /** Anti-infantry capability */
  antiInfantryCapability: number;
  /** Anti-air capability */
  antiAirCapability: number;
}

/**
 * Threat Assessment Module
 * 
 * Provides comprehensive threat analysis and engagement decision making.
 */
export class ThreatAssessmentModule {
  // Unit type threat multipliers
  private readonly unitThreatMultipliers: Map<string, number> = new Map([
    ['infantry', 1.0],
    ['armor', 2.5],
    ['artillery', 2.0],
    ['antiTank', 2.2],
    ['recon', 1.2],
    ['engineer', 0.8],
    ['airDefense', 1.8],
    ['supply', 0.3],
    ['aircraft', 3.0]
  ]);

  // Unit effectiveness matrix (attacker vs defender)
  private readonly effectivenessMatrix: Map<string, Map<string, number>> = new Map([
    ['infantry', new Map([
      ['infantry', 1.0],
      ['armor', 0.3],
      ['artillery', 1.2],
      ['antiTank', 0.8],
      ['airDefense', 0.9],
      ['aircraft', 0.1]
    ])],
    ['armor', new Map([
      ['infantry', 1.5],
      ['armor', 1.0],
      ['artillery', 0.8],
      ['antiTank', 0.4],
      ['airDefense', 1.1],
      ['aircraft', 0.2]
    ])],
    ['artillery', new Map([
      ['infantry', 1.8],
      ['armor', 1.2],
      ['artillery', 0.9],
      ['antiTank', 1.0],
      ['airDefense', 0.7],
      ['aircraft', 0.1]
    ])],
    ['antiTank', new Map([
      ['infantry', 1.2],
      ['armor', 2.0],
      ['artillery', 1.3],
      ['antiTank', 0.8],
      ['airDefense', 1.0],
      ['aircraft', 0.1]
    ])],
    ['airDefense', new Map([
      ['infantry', 1.0],
      ['armor', 0.8],
      ['artillery', 0.9],
      ['antiTank', 0.7],
      ['airDefense', 0.8],
      ['aircraft', 3.0]
    ])],
    ['aircraft', new Map([
      ['infantry', 2.0],
      ['armor', 2.5],
      ['artillery', 2.2],
      ['antiTank', 1.8],
      ['airDefense', 0.3],
      ['aircraft', 1.0]
    ])]
  ]);

  /**
   * Analyze all enemy threats
   */
  public analyzeThreats(input: BotPlannerInput): UnitThreat[] {
    const threats: UnitThreat[] = [];

    for (const enemy of input.playerUnits) {
      const threat = this.analyzeUnitThreat(enemy, input);
      threats.push(threat);
    }

    // Sort by threat level
    threats.sort((a, b) => b.threatLevel - a.threatLevel);

    return threats;
  }

  /**
   * Analyze engagement opportunities for all bot units
   */
  public analyzeEngagementOpportunities(input: BotPlannerInput): EngagementOpportunity[] {
    const opportunities: EngagementOpportunity[] = [];

    for (const attacker of input.botUnits) {
      // Skip units that can't attack
      if (!attacker.definition.hardAttack && !attacker.definition.softAttack) {
        continue;
      }

      const unitOpportunities = this.analyzeUnitEngagementOpportunities(attacker, input);
      opportunities.push(...unitOpportunities);
    }

    // Sort by engagement score
    opportunities.sort((a, b) => b.engagementScore - a.engagementScore);

    return opportunities;
  }

  /**
   * Analyze overall firepower balance
   */
  public analyzeFirepower(input: BotPlannerInput): FirepowerAnalysis {
    const botFirepower = this.calculateFirepower([...input.botUnits]);
    const enemyFirepower = this.calculateFirepower([...input.playerUnits]);

    return {
      totalOffensivePower: botFirepower.total,
      totalDefensivePower: enemyFirepower.total,
      firepowerByType: botFirepower.byType,
      rangeCoverage: botFirepower.rangeCoverage,
      antiArmorCapability: botFirepower.antiArmor,
      antiInfantryCapability: botFirepower.antiInfantry,
      antiAirCapability: botFirepower.antiAir
    };
  }

  /**
   * Determine if bot has sufficient firepower to eliminate a target
   */
  public canEliminateTarget(
    target: PlannerUnitSnapshot,
    availableAttackers: PlannerUnitSnapshot[],
    input: BotPlannerInput
  ): {
    canEliminate: boolean;
    requiredAttackers: number;
    recommendedAttackers: string[];
    expectedCasualties: number;
    confidence: number;
  } {
    const targetHealth = target.unit.strength;
    let totalExpectedDamage = 0;
    let totalExpectedRetaliation = 0;
    const recommendedAttackers: string[] = [];

    // Sort attackers by effectiveness against target
    const sortedAttackers = availableAttackers
      .filter(attacker => attacker.definition.hardAttack || attacker.definition.softAttack)
      .sort((a, b) => {
        const effectivenessA = this.getEffectiveness(a.definition.combat as unknown as string, target.definition.combat as unknown as string);
        const effectivenessB = this.getEffectiveness(b.definition.combat as unknown as string, target.definition.combat as unknown as string);
        return effectivenessB - effectivenessA;
      });

    for (const attacker of sortedAttackers) {
      if (totalExpectedDamage >= targetHealth) {
        break;
      }

      const opportunity = this.analyzeEngagementOpportunity(attacker, target, input);
      totalExpectedDamage += opportunity.expectedDamage;
      totalExpectedRetaliation += opportunity.expectedRetaliation;
      recommendedAttackers.push(attacker.unit.unitId || 'unknown');
    }

    const canEliminate = totalExpectedDamage >= targetHealth;
    const expectedCasualties = Math.floor(totalExpectedRetaliation / 50); // Rough estimate
    const confidence = Math.min(100, (totalExpectedDamage / targetHealth) * 100);

    return {
      canEliminate,
      requiredAttackers: recommendedAttackers.length,
      recommendedAttackers,
      expectedCasualties,
      confidence
    };
  }

  /**
   * Get priority targets for engagement
   */
  public getPriorityTargets(
    input: BotPlannerInput,
    maxTargets: number = 5
  ): EngagementOpportunity[] {
    const opportunities = this.analyzeEngagementOpportunities(input);
    
    // Filter for favorable engagements
    const favorableOpportunities = opportunities.filter(op => 
      op.tradeRatio >= 0.7 || op.strategicValue >= 50
    );

    return favorableOpportunities.slice(0, maxTargets);
  }

  /**
   * Analyze individual unit threat
   */
  private analyzeUnitThreat(unit: PlannerUnitSnapshot, input: BotPlannerInput): UnitThreat {
    const threatMultiplier = this.unitThreatMultipliers.get(unit.definition.combat as unknown as string) || 1.0;
    const baseDamage = unit.definition.hardAttack || unit.definition.softAttack || 0;
    const range = unit.definition.rangeMax || 1;

    // Calculate damage potential against our units
    let damagePotential = 0;
    for (const ourUnit of input.botUnits) {
      const distance = this.calculateDistance(unit.unit.hex, ourUnit.unit.hex);
      if (distance <= range) {
        const effectiveness = this.getEffectiveness(unit.definition.combat as unknown as string, ourUnit.definition.combat as unknown as string);
        damagePotential += baseDamage * effectiveness;
      }
    }

    // Calculate mobility threat
    const mobilityThreat = this.calculateMobilityThreat(unit, input);

    // Calculate strategic threat
    const strategicThreat = this.calculateStrategicThreat(unit, input);

    // Calculate overall threat level
    const threatScore = (damagePotential * 0.4 + 
                        mobilityThreat * 0.3 + 
                        strategicThreat * 0.3) * threatMultiplier;

    const threatLevel = this.getThreatLevel(threatScore);

    // Identify counters and weaknesses
    const availableCounters = this.identifyCounters(unit, [...input.botUnits]);
    const weaknesses = this.identifyWeaknesses(unit);

    return {
      unit,
      threatLevel,
      damagePotential,
      threatRange: range,
      mobilityThreat,
      strategicThreat,
      availableCounters,
      weaknesses
    };
  }

  /**
   * Analyze engagement opportunities for a specific unit
   */
  private analyzeUnitEngagementOpportunities(
    attacker: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): EngagementOpportunity[] {
    const opportunities: EngagementOpportunity[] = [];
    const attackRange = attacker.definition.rangeMax || 1;

    for (const target of input.playerUnits) {
      const distance = this.calculateDistance(attacker.unit.hex, target.unit.hex);
      
      if (distance <= attackRange) {
        const opportunity = this.analyzeEngagementOpportunity(attacker, target, input);
        opportunities.push(opportunity);
      }
    }

    return opportunities.sort((a, b) => b.engagementScore - a.engagementScore);
  }

  /**
   * Analyze specific engagement opportunity
   */
  private analyzeEngagementOpportunity(
    attacker: PlannerUnitSnapshot,
    target: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): EngagementOpportunity {
    const distance = this.calculateDistance(attacker.unit.hex, target.unit.hex);
    const hitProbability = this.calculateHitProbability(attacker, target, distance, input);
    const expectedDamage = this.calculateExpectedDamage(attacker, target, hitProbability);
    const expectedRetaliation = this.calculateExpectedRetaliation(attacker, target, input);
    const tradeRatio = expectedRetaliation > 0 ? expectedDamage / expectedRetaliation : expectedDamage;
    const urgency = this.calculateEngagementUrgency(target, input);
    const strategicValue = this.calculateTargetStrategicValue(target, input);

    const engagementScore = this.calculateEngagementScore({
      expectedDamage,
      expectedRetaliation,
      tradeRatio,
      hitProbability,
      urgency,
      strategicValue
    });

    return {
      target,
      attacker,
      engagementPosition: attacker.unit.hex,
      hitProbability,
      expectedDamage,
      expectedRetaliation,
      tradeRatio,
      urgency,
      strategicValue,
      engagementScore
    };
  }

  /**
   * Calculate firepower for a group of units
   */
  private calculateFirepower(units: PlannerUnitSnapshot[]): {
    total: number;
    byType: Map<string, number>;
    rangeCoverage: { short: number; medium: number; long: number };
    antiArmor: number;
    antiInfantry: number;
    antiAir: number;
  } {
    const byType = new Map<string, number>();
    const rangeCoverage = { short: 0, medium: 0, long: 0 };
    let total = 0;
    let antiArmor = 0;
    let antiInfantry = 0;
    let antiAir = 0;

    for (const unit of units) {
      if (!unit.definition.hardAttack && !unit.definition.softAttack) continue;

      const damage = unit.definition.hardAttack || unit.definition.softAttack || 0;
      const range = unit.definition.rangeMax || 1;
      const unitType = unit.definition.combat as unknown as string;

      total += damage;
      byType.set(unitType, (byType.get(unitType) || 0) + damage);

      // Range coverage
      if (range <= 3) rangeCoverage.short += damage;
      else if (range <= 8) rangeCoverage.medium += damage;
      else rangeCoverage.long += damage;

      // Specialized capabilities
      if (unitType === 'antiTank' || unitType === 'armor') antiArmor += damage;
      if (unitType === 'infantry' || unitType === 'artillery') antiInfantry += damage;
      if (unitType === 'airDefense') antiAir += damage;
    }

    return { total, byType, rangeCoverage, antiArmor, antiInfantry, antiAir };
  }

  /**
   * Calculate mobility threat of a unit
   */
  private calculateMobilityThreat(unit: PlannerUnitSnapshot, input: BotPlannerInput): number {
    const movement = unit.definition.movement || 0;
    const moveType = unit.definition.moveType;

    let threat = movement * 2; // Base threat from movement

    // Adjust for movement type
    switch (moveType) {
      case 'air':
        threat *= 2.0; // Air units are highly mobile
        break;
      case 'track':
        threat *= 1.3; // Tracked units are good cross-country
        break;
      case 'wheel':
        threat *= 1.1; // Wheeled units are decent on roads
        break;
      case 'leg':
        threat *= 0.8; // Infantry are slower but more versatile
        break;
    }

    // Consider proximity to objectives or our units
    let minDistance = Infinity;
    for (const ourUnit of input.botUnits) {
      const distance = this.calculateDistance(unit.unit.hex, ourUnit.unit.hex);
      minDistance = Math.min(minDistance, distance);
    }

    if (minDistance <= 6) {
      threat *= 1.5; // Close units are more threatening
    }

    return Math.min(100, threat);
  }

  /**
   * Calculate strategic threat of a unit
   */
  private calculateStrategicThreat(unit: PlannerUnitSnapshot, input: BotPlannerInput): number {
    let threat = 0;

    // Check proximity to objectives
    for (const objective of input.objectives) {
      const distance = this.calculateDistance(unit.unit.hex, objective.hex);
      if (objective.owner === 'Bot') {
        // Enemy near our objectives is high threat
        if (distance <= 3) threat += objective.vp * 10;
        else if (distance <= 6) threat += objective.vp * 5;
      } else {
        // Enemy near their objectives is lower threat
        if (distance <= 3) threat += objective.vp * 3;
      }
    }

    // Consider unit type strategic value
    const strategicValues: Record<string, number> = {
      artillery: 25,
      armor: 20,
      airDefense: 18,
      antiTank: 15,
      recon: 12,
      infantry: 10,
      aircraft: 30,
      engineer: 8,
      supply: 5
    };

    threat += strategicValues[unit.definition.combat as unknown as string] || 10;

    return Math.min(100, threat);
  }

  /**
   * Identify counters to a unit
   */
  private identifyCounters(unit: PlannerUnitSnapshot, ourUnits: PlannerUnitSnapshot[]): string[] {
    const counters: string[] = [];
    const unitType = unit.definition.combat as unknown as string;

    for (const ourUnit of ourUnits) {
      const effectiveness = this.getEffectiveness(ourUnit.definition.combat as unknown as string, unitType);
      if (effectiveness >= 1.5) {
        counters.push(ourUnit.unit.unitId || 'unknown');
      }
    }

    return counters;
  }

  /**
   * Identify weaknesses of a unit
   */
  private identifyWeaknesses(unit: PlannerUnitSnapshot): string[] {
    const weaknesses: string[] = [];
    const unitType = unit.definition.combat as unknown as string;

    // Check effectiveness against different unit types
    const effectivenessMap = this.effectivenessMatrix.get(unitType);
    if (!effectivenessMap) return weaknesses;

    for (const [targetType, effectiveness] of effectivenessMap.entries()) {
      if (effectiveness <= 0.5) {
        weaknesses.push(targetType);
      }
    }

    // Add general weaknesses
    if (unit.definition.movement && unit.definition.movement <= 3) {
      weaknesses.push('low_mobility');
    }

    if (!unit.definition.hardAttack && !unit.definition.softAttack && unit.definition.rangeMax <= 2) {
      weaknesses.push('short_range');
    }

    if (unit.unit.strength < 50) {
      weaknesses.push('weakened');
    }

    return weaknesses;
  }

  /**
   * Calculate hit probability
   */
  private calculateHitProbability(
    attacker: PlannerUnitSnapshot,
    target: PlannerUnitSnapshot,
    distance: number,
    input: BotPlannerInput
  ): number {
    let baseProbability = 0.8; // 80% base hit chance

    // Distance modifier
    if (distance > 5) baseProbability -= 0.2;
    if (distance > 10) baseProbability -= 0.3;

    // Unit effectiveness modifier
    const effectiveness = this.getEffectiveness(attacker.definition.combat as unknown as string, target.definition.combat as unknown as string);
    baseProbability *= (0.5 + effectiveness * 0.5);

    // Target defense modifier
    const targetTerrain = input.map.terrainAt(target.unit.hex);
    if (targetTerrain?.defense) {
      baseProbability -= targetTerrain.defense * 0.01;
    }

    return Math.max(0.1, Math.min(0.95, baseProbability));
  }

  /**
   * Calculate expected damage
   */
  private calculateExpectedDamage(
    attacker: PlannerUnitSnapshot,
    target: PlannerUnitSnapshot,
    hitProbability: number
  ): number {
    const baseDamage = attacker.definition.hardAttack || attacker.definition.softAttack || 0;
    const effectiveness = this.getEffectiveness(attacker.definition.combat as unknown as string, target.definition.combat as unknown as string);
    
    return Math.floor(baseDamage * effectiveness * hitProbability);
  }

  /**
   * Calculate expected retaliation damage
   */
  private calculateExpectedRetaliation(
    attacker: PlannerUnitSnapshot,
    target: PlannerUnitSnapshot,
    input: BotPlannerInput
  ): number {
    // Check if target can retaliate
    if (!target.definition.hardAttack && !target.definition.softAttack) {
      return 0;
    }

    const distance = this.calculateDistance(attacker.unit.hex, target.unit.hex);
    const targetRange = target.definition.rangeMax || 1;

    if (distance > targetRange) {
      return 0; // Out of retaliation range
    }

    const hitProbability = this.calculateHitProbability(target, attacker, distance, input);
    return this.calculateExpectedDamage(target, attacker, hitProbability);
  }

  /**
   * Calculate engagement urgency
   */
  private calculateEngagementUrgency(target: PlannerUnitSnapshot, input: BotPlannerInput): number {
    let urgency = 0;

    // High value targets are more urgent
    const unitValues: Record<string, number> = {
      artillery: 30,
      armor: 25,
      aircraft: 35,
      airDefense: 20,
      antiTank: 18,
      recon: 15,
      infantry: 10,
      engineer: 8,
      supply: 5
    };

    urgency += unitValues[target.definition.combat as unknown as string] || 10;

    // Weakened targets are more urgent to finish off
    if (target.unit.strength < 50) {
      urgency += 20;
    }

    // Units about to attack are high priority
    // Note: hasAttacked property not available in ScenarioUnit, would need game state
    // urgency += 15;

    // Units near our objectives are urgent
    for (const objective of input.objectives) {
      if (objective.owner === 'Bot') {
        const distance = this.calculateDistance(target.unit.hex, objective.hex);
        if (distance <= 3) {
          urgency += objective.vp * 2;
        }
      }
    }

    return Math.min(100, urgency);
  }

  /**
   * Calculate target strategic value
   */
  private calculateTargetStrategicValue(target: PlannerUnitSnapshot, input: BotPlannerInput): number {
    let value = 0;

    // Base value by unit type
    const baseValues: Record<string, number> = {
      artillery: 25,
      armor: 20,
      aircraft: 30,
      airDefense: 18,
      antiTank: 15,
      recon: 12,
      infantry: 10,
      engineer: 8,
      supply: 5
    };

    value += baseValues[target.definition.combat as unknown as string] || 10;

    // Position value
    for (const objective of input.objectives) {
      const distance = this.calculateDistance(target.unit.hex, objective.hex);
      if (distance <= 5) {
        value += (6 - distance) * 3;
      }
    }

    // Threat multiplier (more threatening targets are more valuable to eliminate)
    const threat = this.analyzeUnitThreat(target, input);
    value += threat.threatLevel * 0.3;

    return Math.min(100, value);
  }

  /**
   * Calculate overall engagement score
   */
  private calculateEngagementScore(params: {
    expectedDamage: number;
    expectedRetaliation: number;
    tradeRatio: number;
    hitProbability: number;
    urgency: number;
    strategicValue: number;
  }): number {
    let score = 0;

    // Damage output
    score += params.expectedDamage * 2;

    // Trade considerations
    if (params.tradeRatio >= 1.5) {
      score += 30; // Very favorable trade
    } else if (params.tradeRatio >= 1.0) {
      score += 15; // Good trade
    } else if (params.tradeRatio < 0.5) {
      score -= 20; // Bad trade
    }

    // Hit probability
    score += params.hitProbability * 20;

    // Urgency and strategic value
    score += params.urgency * 0.5;
    score += params.strategicValue * 0.3;

    return Math.max(-100, Math.min(100, score));
  }

  /**
   * Get effectiveness of attacker against defender
   */
  private getEffectiveness(attackerType: string, defenderType: string): number {
    const attackerMap = this.effectivenessMatrix.get(attackerType);
    return attackerMap?.get(defenderType) || 1.0;
  }

  /**
   * Get threat level from score
   */
  private getThreatLevel(score: number): ThreatLevel {
    if (score >= 80) return ThreatLevel.CRITICAL;
    if (score >= 60) return ThreatLevel.HIGH;
    if (score >= 40) return ThreatLevel.MEDIUM;
    if (score >= 20) return ThreatLevel.LOW;
    return ThreatLevel.NONE;
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(a: Axial, b: Axial): number {
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
  }
}

/**
 * Default threat assessment module instance
 */
export const threatAssessmentModule = new ThreatAssessmentModule();
