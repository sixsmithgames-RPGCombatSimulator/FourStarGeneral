/**
 * Small nudge applied when multiple moves score similarly; pushes choices toward the intended target.
 * This value is deliberately modest so it never outweighs real tactical scores (damage, retaliation, VP).
 */
const STEERING_TIE_BIAS = 0.6;
/**
 * Within this many hexes, units treat nearby enemies as an immediate concern and will prioritize
 * closing or attacking even when strategic objectives exist. This models the "game on" behavior
 * once forces make contact.
 */
const PROXIMITY_ENGAGE_RADIUS = 12;
/**
 * Bonus applied to enemy-pressure moves when contact is established (nearby or visible). Ensures that
 * pressure beats a distant objective approach so the AI pivots into combat once engaged.
 */
const CONTACT_ENGAGE_BONUS = 8;

// ==========================================
// ADVANCED TACTICAL AI CONSTANTS
// ==========================================

/**
 * Bonus applied when attacking a damaged unit (strength < 50%).
 * Encourages the bot to focus fire on weakened targets for efficient kills.
 */
const FOCUS_FIRE_BONUS = 12;

/**
 * Threshold below which a unit is considered "low health" for focus fire.
 */
const LOW_HEALTH_THRESHOLD = 50;

/**
 * Critical health threshold for maximum priority targeting.
 */
const CRITICAL_HEALTH_THRESHOLD = 25;

/**
 * Bonus for attacking from a flanking position (side/rear).
 * Rewards tactical positioning for increased damage.
 */
const FLANKING_BONUS = 8;

/**
 * Bonus for attacking when allied units are adjacent to the target.
 * Encourages combined arms and coordinated attacks.
 */
const COMBINED_ARMS_BONUS = 6;

/**
 * Bonus per allied unit within support range of an attack.
 * Stacks to reward concentrated force.
 */
const SUPPORT_CONCENTRATION_BONUS = 2;

/**
 * Range within which allies provide support bonuses.
 */
const SUPPORT_RANGE = 3;

/**
 * Bonus for artillery staying at optimal range (max range - 2).
 * Keeps artillery from getting too close to the front line.
 */
const ARTILLERY_RANGE_BONUS = 5;

/**
 * Penalty for artillery being within close range of enemies.
 * Discourages artillery from advancing into danger.
 */
const ARTILLERY_DANGER_PENALTY = -15;

/**
 * Range within which artillery feels endangered.
 */
const ARTILLERY_DANGER_RANGE = 4;

/**
 * Bonus for moving to defensible terrain (forest, urban, hills).
 * Encourages smart positioning when not attacking.
 */
const DEFENSIVE_TERRAIN_BONUS = 4;

/**
 * Penalty for leaving cover to move into open terrain.
 */
const EXPOSED_POSITION_PENALTY = -3;

/**
 * Bonus for recon units spotting enemies for allies.
 */
const RECON_SPOTTING_BONUS = 10;

/**
 * Range within which recon provides spotting bonuses to allies.
 */
const RECON_SPOTTING_RANGE = 6;

/**
 * Difficulty levels control how aggressively and intelligently the bot plays.
 * - Easy: Bot makes conservative decisions, accepts higher risk, less aggressive
 * - Normal: Balanced tactical decision-making
 * - Hard: Highly aggressive, optimal targeting, punishes player mistakes
 */
export type BotDifficulty = "Easy" | "Normal" | "Hard";

/**
 * Difficulty modifiers applied to bot scoring decisions.
 * Higher values make the bot more aggressive/effective.
 */
export interface DifficultyModifiers {
  /** Multiplier for damage weighting in attack scoring */
  readonly damageWeight: number;
  /** Multiplier for retaliation penalty in attack scoring */
  readonly retaliationWeight: number;
  /** Multiplier for attack opportunity bonus */
  readonly attackOpportunityBonus: number;
  /** Multiplier for engagement bonus when in contact */
  readonly contactEngageBonus: number;
  /** Multiplier for objective approach scoring */
  readonly objectiveWeight: number;
  /** Accuracy bonus/penalty applied to bot attacks (percentage) */
  readonly accuracyMod: number;
  /** Damage bonus/penalty applied to bot attacks (percentage) */
  readonly damageMod: number;
  // Advanced tactical AI modifiers
  /** Multiplier for focus fire bonus on damaged enemies */
  readonly focusFireWeight: number;
  /** Multiplier for flanking attack bonus */
  readonly flankingWeight: number;
  /** Multiplier for combined arms coordination bonus */
  readonly combinedArmsWeight: number;
  /** Whether to use advanced tactical scoring */
  readonly useTacticalAI: boolean;
}

/**
 * Returns the difficulty modifiers for the specified level.
 */
export function getDifficultyModifiers(difficulty: BotDifficulty): DifficultyModifiers {
  switch (difficulty) {
    case "Easy":
      return {
        damageWeight: 2.5,           // Less emphasis on damage output
        retaliationWeight: 3.5,      // More afraid of taking damage
        attackOpportunityBonus: 5,   // Less aggressive about attacking
        contactEngageBonus: 5,       // Less likely to engage
        objectiveWeight: 0.8,        // Less focused on objectives
        accuracyMod: -10,            // 10% accuracy penalty
        damageMod: -15,              // 15% damage penalty
        // Easy bots don't use advanced tactics
        focusFireWeight: 0.3,        // Rarely focuses damaged targets
        flankingWeight: 0.2,         // Doesn't seek flanking positions
        combinedArmsWeight: 0.2,     // Poor coordination
        useTacticalAI: false         // Basic behavior only
      };
    case "Normal":
      return {
        damageWeight: 3.5,           // Standard damage weight
        retaliationWeight: 2.5,      // Standard caution
        attackOpportunityBonus: 8,   // Standard attack incentive
        contactEngageBonus: 8,       // Standard engagement
        objectiveWeight: 1.0,        // Standard objective focus
        accuracyMod: 0,              // No accuracy modifier
        damageMod: 0,                // No damage modifier
        // Normal bots use some tactics
        focusFireWeight: 0.7,        // Sometimes focuses damaged targets
        flankingWeight: 0.5,         // Occasionally seeks flanking
        combinedArmsWeight: 0.6,     // Moderate coordination
        useTacticalAI: true          // Uses tactical AI
      };
    case "Hard":
      return {
        damageWeight: 4.5,           // Maximizes damage output
        retaliationWeight: 1.5,      // More willing to trade
        attackOpportunityBonus: 12,  // Very aggressive
        contactEngageBonus: 12,      // Presses advantage hard
        objectiveWeight: 1.3,        // Highly objective-focused
        accuracyMod: 10,             // 10% accuracy bonus
        damageMod: 10,               // 10% damage bonus
        // Hard bots use full advanced tactics
        focusFireWeight: 1.2,        // Aggressively focuses weakened units
        flankingWeight: 1.0,         // Actively seeks flanking positions
        combinedArmsWeight: 1.0,     // Excellent coordination
        useTacticalAI: true          // Full tactical AI
      };
    default:
      return getDifficultyModifiers("Normal");
  }
}

import { axialKey, hexDistance, neighbors, type Axial } from "../../core/Hex";
import type { TerrainDefinition, ScenarioUnit, UnitTypeDefinition } from "../../core/types";

/**
 * BotStrategyMode mirrors the engine toggle so planners can branch without importing GameEngine directly.
 */
export type BotStrategyMode = "Simple" | "Heuristic";

/** Light-weight snapshot combining a unit instance with its immutable definition. */
export interface PlannerUnitSnapshot {
  readonly unit: ScenarioUnit;
  readonly definition: UnitTypeDefinition;
}

/**
 * Tiny steering helper that nudges tie-breaks toward the target vector.
 * Returns a value in [-1, 1] where 1 means the first step aligns with the vector to the target.
 * This is intentionally small and only influences cases where scores are otherwise similar.
 */
function steeringBias(origin: Axial, firstStep: Axial, target: Axial): number {
  const step = { q: firstStep.q - origin.q, r: firstStep.r - origin.r };
  const toTarget = { q: target.q - origin.q, r: target.r - origin.r };
  const stepLen = Math.hypot(step.q, step.r) || 1;
  const tgtLen = Math.hypot(toTarget.q, toTarget.r) || 1;
  const dot = (step.q * toTarget.q + step.r * toTarget.r) / (stepLen * tgtLen);
  // Clamp for numerical stability
  return Math.max(-1, Math.min(1, dot));
}

/**
 * Promote moves that shrink distance to an active objective even when it cannot be captured this turn.
 */
function scoreObjectiveApproach(
  origin: Axial,
  reachable: Map<string, ReachableHex>,
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[]
): ActionCandidate | null {
  if (objectives.length === 0) {
    return null;
  }

  let best: ActionCandidate | null = null;
  const originDistances = new Map<string, number>();
  for (const objective of objectives) {
    originDistances.set(axialKey(objective.hex), hexDistance(origin, objective.hex));
  }

  for (const option of reachable.values()) {
    if (option.path.length <= 1) {
      continue;
    }

    let bestReductionScore = -Infinity;
    let rationale = "";
    let bestTargetHex: Axial | null = null;
    for (const objective of objectives) {
      const key = axialKey(objective.hex);
      const currentDistance = originDistances.get(key) ?? hexDistance(origin, objective.hex);
      const newDistance = hexDistance(option.hex, objective.hex);
      const reduction = currentDistance - newDistance;
      if (reduction <= 0) {
        continue;
      }
      const score = 2 + reduction * 4 + objective.vp;
      if (score > bestReductionScore) {
        bestReductionScore = score;
        rationale = `Advance toward objective at ${key}`;
        bestTargetHex = objective.hex;
      }
    }

    if (bestReductionScore === -Infinity) {
      continue;
    }

    const candidate: ActionCandidate = {
      destination: option.hex,
      path: option.path,
      attackTarget: null,
      expectedDamage: 0,
      expectedRetaliation: 0,
      score: bestReductionScore - (option.path.length - 1),
      rationale
    };

    // Steering: favor first steps that align with the direction to the best objective for this option
    if (bestTargetHex && option.path.length > 1) {
      candidate.score += STEERING_TIE_BIAS * steeringBias(origin, option.path[1], bestTargetHex);
    }

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Returns only the objectives that still require action (either enemy-owned or currently held by the player).
 */
function filterActiveObjectives(
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[],
  occupancy: ReadonlyMap<string, "bot" | "player">
): { hex: Axial; owner: "Player" | "Bot"; vp: number }[] {
  return objectives.filter((objective) => {
    const key = axialKey(objective.hex);
    const occupant = occupancy.get(key);
    const controlledByBot = objective.owner === "Bot" || occupant === "bot";
    return !controlledByBot;
  });
}

/**
 * When no formal objective exists, drift toward the nearest enemy so formations keep pressure on the frontline.
 */
function scoreEnemyPressure(
  origin: Axial,
  reachable: Map<string, ReachableHex>,
  enemies: readonly PlannerUnitSnapshot[]
): ActionCandidate | null {
  if (enemies.length === 0) {
    return null;
  }

  const originDistance = enemies.reduce((min, enemy) => Math.min(min, hexDistance(origin, enemy.unit.hex)), Infinity);
  let best: ActionCandidate | null = null;

  for (const option of reachable.values()) {
    if (option.path.length <= 1) {
      continue; // Staying in place does not apply pressure.
    }

    let nearest: PlannerUnitSnapshot | null = null;
    let nearestDistance = Infinity;
    for (const enemy of enemies) {
      const distance = hexDistance(option.hex, enemy.unit.hex);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }

    if (nearestDistance >= originDistance) {
      continue; // Only reward moves that demonstrably tighten the noose.
    }

    const distanceGain = originDistance - nearestDistance;
    const score = 3 + distanceGain * 3 - (option.path.length - 1);
    const rationaleTarget = nearest ? nearest.unit.type : "enemy forces";
    const candidate: ActionCandidate = {
      destination: option.hex,
      path: option.path,
      attackTarget: null,
      expectedDamage: 0,
      expectedRetaliation: 0,
      score,
      rationale: `Advance to pressure ${rationaleTarget}`
    };

    // Steering: add a small nudge toward the nearest enemy to break ties consistently toward the target
    if (nearest && option.path.length > 1) {
      candidate.score += STEERING_TIE_BIAS * steeringBias(origin, option.path[1], nearest.unit.hex);
    }

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

/** Reachable hex bookkeeping used to evaluate movement destinations. */
export interface ReachableHex {
  readonly hex: Axial;
  readonly cost: number;
  readonly path: readonly Axial[];
}

/**
 * High-level intent buckets guide scoring to keep behaviors explainable for designers.
 */
export type UnitPurpose =
  | "antiArmor"
  | "antiInfantry"
  | "artillery"
  | "recon"
  | "support"
  | "generalist";

/**
 * AttackEstimate communicates the expected damage the bot will inflict vs. the retaliation it will endure.
 */
export interface AttackEstimate {
  readonly expectedDamage: number;
  readonly expectedRetaliation: number;
}

/** Input payload describing the static board state from the engine. */
export interface BotPlannerInput {
  readonly botUnits: readonly PlannerUnitSnapshot[];
  readonly playerUnits: readonly PlannerUnitSnapshot[];
  readonly objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[];
  readonly occupancy: ReadonlyMap<string, "bot" | "player">;
  readonly map: {
    readonly inBounds: (hex: Axial) => boolean;
    readonly terrainAt: (hex: Axial) => TerrainDefinition | null;
    readonly movementCost: (hex: Axial, moveType: UnitTypeDefinition["moveType"]) => number;
  };
  readonly losAllows: (attackerHex: Axial, targetHex: Axial, isAir: boolean) => boolean;
  readonly movementAllowance: (snapshot: PlannerUnitSnapshot) => number;
  readonly attackEstimator: (
    attacker: PlannerUnitSnapshot,
    attackerHex: Axial,
    defender: PlannerUnitSnapshot,
    defenderHex: Axial
  ) => AttackEstimate | null;
  /** Difficulty setting that affects bot scoring decisions. Defaults to Normal if not provided. */
  readonly difficulty?: BotDifficulty;
}

/**
 * PlannedBotAction articulates a single unit's chosen move plus optional attack target and score rationale.
 */
export interface PlannedBotAction {
  readonly unit: PlannerUnitSnapshot;
  readonly unitKey: string;
  readonly origin: Axial;
  readonly destination: Axial;
  readonly path: readonly Axial[];
  readonly attackTarget: Axial | null;
  readonly expectedDamage: number;
  readonly expectedRetaliation: number;
  readonly score: number;
  readonly rationale: string;
}

/** Internal shape used while evaluating individual move+attack candidates. */
interface ActionCandidate {
  destination: Axial;
  path: readonly Axial[];
  attackTarget: Axial | null;
  expectedDamage: number;
  expectedRetaliation: number;
  score: number;
  rationale: string;
}

/**
 * Dijkstra-style search restricted by movement allowance to collect passable tiles and the cheapest path to each.
 * The planner keeps this pure so the engine can re-run it without mutating live state.
 */
export function computeReachableHexes(
  origin: Axial,
  allowance: number,
  moveType: UnitTypeDefinition["moveType"],
  input: BotPlannerInput,
  originKey: string
): Map<string, ReachableHex> {
  const results = new Map<string, ReachableHex>();
  const frontier: Array<{ hex: Axial; cost: number; path: Axial[] }> = [{
    hex: origin,
    cost: 0,
    path: [origin]
  }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (!current) {
      break;
    }

    const currentKey = axialKey(current.hex);
    if (results.has(currentKey)) {
      continue;
    }
    results.set(currentKey, {
      hex: current.hex,
      cost: current.cost,
      path: current.path
    });

    // Stop exploring once the allocation budget is exhausted.
    if (current.cost >= allowance) {
      continue;
    }

    for (const neighbor of neighbors(current.hex)) {
      if (!input.map.inBounds(neighbor)) {
        continue;
      }
      const neighborKey = axialKey(neighbor);
      const terrainCost = input.map.movementCost(neighbor, moveType);
      if (!Number.isFinite(terrainCost) || terrainCost >= 999) {
        continue; // Treat very high cost as impassable for land units.
      }

      const occupant = input.occupancy.get(neighborKey);
      if (occupant === "bot" && neighborKey !== originKey) {
        continue; // Avoid pathing through fellow bot units to limit congestion.
      }
      if (occupant === "player") {
        continue; // Do not step onto enemy-occupied hexes; attacks target adjacent positions instead.
      }

      const newCost = current.cost + terrainCost;
      if (newCost > allowance) {
        continue;
      }

      const known = results.get(neighborKey);
      if (known && known.cost <= newCost) {
        continue;
      }

      frontier.push({
        hex: neighbor,
        cost: newCost,
        path: [...current.path, neighbor]
      });
    }
  }

  return results;
}

/**
 * Lightweight heuristic describing a unit's battlefield focus so scoring can reward aligned targets.
 */
export function classifyUnitPurpose(definition: UnitTypeDefinition): UnitPurpose {
  if (definition.class === "artillery") {
    return "artillery";
  }
  if (definition.class === "recon") {
    return "recon";
  }
  if (definition.class === "air") {
    return "support"; // Air units lean on planner scores specific to sortie roles.
  }

  const hardVsSoft = definition.hardAttack - definition.softAttack;
  if (hardVsSoft >= definition.softAttack * 0.5) {
    return "antiArmor";
  }
  if (-hardVsSoft >= definition.hardAttack * 0.5) {
    return "antiInfantry";
  }
  return "generalist";
}

// ==========================================
// ADVANCED TACTICAL AI SCORING FUNCTIONS
// ==========================================

/**
 * Calculates bonus for attacking a damaged/weakened enemy unit.
 * Prioritizes finishing off wounded targets for efficient kills.
 */
function calculateFocusFireBonus(
  defender: PlannerUnitSnapshot,
  modifiers: DifficultyModifiers
): number {
  if (!modifiers.useTacticalAI) return 0;

  const defenderStrength = defender.unit.strength ?? 100;

  // Critical health - massive priority boost
  if (defenderStrength <= CRITICAL_HEALTH_THRESHOLD) {
    return FOCUS_FIRE_BONUS * 1.5 * modifiers.focusFireWeight;
  }

  // Low health - significant priority boost
  if (defenderStrength <= LOW_HEALTH_THRESHOLD) {
    return FOCUS_FIRE_BONUS * modifiers.focusFireWeight;
  }

  // Moderate damage - small bonus
  if (defenderStrength <= 75) {
    return (FOCUS_FIRE_BONUS * 0.4) * modifiers.focusFireWeight;
  }

  return 0;
}

/**
 * Calculates bonus for attacking from a flanking position.
 * Rewards tactical positioning that would increase damage dealt.
 */
function calculateFlankingBonus(
  attackerHex: Axial,
  defender: PlannerUnitSnapshot,
  modifiers: DifficultyModifiers
): number {
  if (!modifiers.useTacticalAI) return 0;

  const defenderFacing = defender.unit.facing;
  if (!defenderFacing) return 0;

  // Calculate the direction from defender to attacker
  const dx = attackerHex.q - defender.unit.hex.q;
  const dr = attackerHex.r - defender.unit.hex.r;

  // Simplified facing check - determine if attack is from side or rear
  // Facing directions: "N", "NE", "SE", "S", "SW", "NW"
  const facingVectors: Record<string, { q: number; r: number }> = {
    N: { q: 0, r: -1 },
    NE: { q: 1, r: -1 },
    SE: { q: 1, r: 0 },
    S: { q: 0, r: 1 },
    SW: { q: -1, r: 1 },
    NW: { q: -1, r: 0 }
  };

  const facing = facingVectors[defenderFacing];
  if (!facing) return 0;

  // Normalize the attack direction
  const attackLen = Math.hypot(dx, dr) || 1;
  const normDx = dx / attackLen;
  const normDr = dr / attackLen;

  // Dot product with facing - negative means attacking from behind
  const dot = normDx * facing.q + normDr * facing.r;

  // Rear attack (dot < -0.5) - full bonus
  if (dot < -0.5) {
    return FLANKING_BONUS * modifiers.flankingWeight;
  }

  // Side attack (|dot| < 0.5) - partial bonus
  if (Math.abs(dot) < 0.5) {
    return (FLANKING_BONUS * 0.5) * modifiers.flankingWeight;
  }

  // Frontal attack - no bonus
  return 0;
}

/**
 * Calculates bonus for combined arms - attacking when allies are nearby.
 * Encourages coordinated attacks and concentration of force.
 */
function calculateCombinedArmsBonus(
  targetHex: Axial,
  botUnits: readonly PlannerUnitSnapshot[],
  attackerKey: string,
  modifiers: DifficultyModifiers
): number {
  if (!modifiers.useTacticalAI) return 0;

  let alliesNearTarget = 0;
  let alliesAdjacent = 0;

  for (const ally of botUnits) {
    const allyKey = axialKey(ally.unit.hex);
    if (allyKey === attackerKey) continue; // Skip self

    const distance = hexDistance(ally.unit.hex, targetHex);

    if (distance === 1) {
      alliesAdjacent++;
    } else if (distance <= SUPPORT_RANGE) {
      alliesNearTarget++;
    }
  }

  let bonus = 0;

  // Adjacent allies provide the combined arms bonus
  if (alliesAdjacent > 0) {
    bonus += COMBINED_ARMS_BONUS * modifiers.combinedArmsWeight;
  }

  // Nearby allies provide stacking support bonus
  bonus += alliesNearTarget * SUPPORT_CONCENTRATION_BONUS * modifiers.combinedArmsWeight;

  return bonus;
}

/**
 * Calculates artillery-specific positioning bonuses and penalties.
 * Keeps artillery at optimal range and away from danger.
 */
function calculateArtilleryPositionScore(
  attackerHex: Axial,
  nearestEnemyDistance: number,
  attacker: PlannerUnitSnapshot,
  defender: PlannerUnitSnapshot | null,
  modifiers: DifficultyModifiers
): number {
  if (!modifiers.useTacticalAI) return 0;
  if (attacker.definition.class !== "artillery") return 0;

  let score = 0;
  const maxRange = attacker.definition.rangeMax ?? 6;

  // Penalty for being too close to enemies
  if (nearestEnemyDistance <= ARTILLERY_DANGER_RANGE) {
    score += ARTILLERY_DANGER_PENALTY * modifiers.focusFireWeight;
  }

  // Bonus for firing at optimal range (max range - 2 to max range)
  if (defender) {
    const targetDistance = hexDistance(attackerHex, defender.unit.hex);
    const optimalRangeMin = Math.max(1, maxRange - 2);

    if (targetDistance >= optimalRangeMin && targetDistance <= maxRange) {
      score += ARTILLERY_RANGE_BONUS * modifiers.focusFireWeight;
    }
  }

  return score;
}

/**
 * Calculates terrain-based positioning bonus.
 * Rewards moving to defensible terrain when not attacking.
 */
function calculateTerrainPositionScore(
  hex: Axial,
  terrain: TerrainDefinition | null,
  isAttacking: boolean
): number {
  // Only apply when not attacking (positioning moves)
  if (isAttacking) return 0;
  if (!terrain) return 0;

  // Use defense value to determine terrain quality
  // High defense terrain (3+) is defensive, low defense (0-1) is exposed
  if (terrain.defense >= 3) {
    return DEFENSIVE_TERRAIN_BONUS;
  }

  if (terrain.defense <= 1 && terrain.accMod >= 0) {
    // Low defense and no accuracy penalty means exposed terrain
    return EXPOSED_POSITION_PENALTY;
  }

  return 0;
}

/**
 * Calculates recon spotting bonus.
 * Rewards recon units for positioning to spot enemies for allies.
 */
function calculateReconSpottingBonus(
  hex: Axial,
  enemies: readonly PlannerUnitSnapshot[],
  allies: readonly PlannerUnitSnapshot[],
  attacker: PlannerUnitSnapshot,
  losAllows: (attackerHex: Axial, targetHex: Axial, isAir: boolean) => boolean
): number {
  if (attacker.definition.class !== "recon") return 0;

  const isAir = attacker.definition.moveType === "air";
  let spottedForAllies = 0;

  for (const enemy of enemies) {
    // Check if we can see this enemy from the new position
    if (!losAllows(hex, enemy.unit.hex, isAir)) continue;

    // Count how many allies would benefit from this spotting
    for (const ally of allies) {
      if (ally === attacker) continue;
      const allyDistance = hexDistance(ally.unit.hex, enemy.unit.hex);
      if (allyDistance <= RECON_SPOTTING_RANGE) {
        spottedForAllies++;
      }
    }
  }

  return Math.min(spottedForAllies, 3) * RECON_SPOTTING_BONUS * 0.3;
}

/**
 * Converts candidate metrics into a comparable scalar. Higher scores win.
 * The optional modifiers parameter allows difficulty-based tuning of scoring weights.
 */
export function scoreCandidate(
  purpose: UnitPurpose,
  attacker: PlannerUnitSnapshot,
  defender: PlannerUnitSnapshot | null,
  candidate: ActionCandidate,
  modifiers?: DifficultyModifiers
): number {
  // Use provided modifiers or default to Normal difficulty values
  const mods = modifiers ?? getDifficultyModifiers("Normal");

  const purposeBonus = (() => {
    if (!defender) {
      return 0;
    }
    const defenderClass = defender.definition.class;
    if (purpose === "antiArmor") {
      if (defenderClass === "tank" || defenderClass === "vehicle") {
        return 15;
      }
      if (defenderClass === "artillery" || defenderClass === "air" || defenderClass === "infantry") {
        return -5;
      }
    }
    if (purpose === "antiInfantry") {
      if (defenderClass === "infantry" || defenderClass === "specialist") {
        return 12;
      }
      if (defenderClass === "tank" || defenderClass === "vehicle") {
        return -6;
      }
    }
    if (purpose === "artillery" && defenderClass === "infantry") {
      return 6;
    }
    if (purpose === "recon" && defenderClass === "artillery") {
      return 4;
    }
    return 0;
  })();

  // Apply difficulty modifiers to scoring weights
  const damageScore = candidate.expectedDamage * mods.damageWeight;
  const retaliationPenalty = candidate.expectedRetaliation * mods.retaliationWeight;
  const attackOpportunityBonus = defender ? mods.attackOpportunityBonus : 0;

  const mobilityPenalty = (() => {
    if (!defender) {
      return 0;
    }
    // Encourage staying within range bands rather than overshooting when damage is comparable.
    const distance = hexDistance(candidate.destination, defender.unit.hex);
    const maxRange = attacker.definition.rangeMax ?? 1;
    if (distance > maxRange) {
      return -4;
    }
    return 0;
  })();

  // Calculate advanced tactical bonuses if enabled
  let tacticalBonus = 0;

  if (mods.useTacticalAI && defender) {
    // Focus fire bonus - prioritize weakened enemies
    tacticalBonus += calculateFocusFireBonus(defender, mods);

    // Flanking bonus - reward attacking from sides/rear
    tacticalBonus += calculateFlankingBonus(candidate.destination, defender, mods);
  }

  return damageScore + purposeBonus + attackOpportunityBonus + mobilityPenalty + tacticalBonus - retaliationPenalty;
}

/**
 * Extended scoring function that includes all tactical considerations.
 * Used by pickBestCandidate for comprehensive attack evaluation.
 */
export function scoreCandidateAdvanced(
  purpose: UnitPurpose,
  attacker: PlannerUnitSnapshot,
  defender: PlannerUnitSnapshot | null,
  candidate: ActionCandidate,
  input: BotPlannerInput,
  modifiers: DifficultyModifiers
): number {
  // Get base score
  let score = scoreCandidate(purpose, attacker, defender, candidate, modifiers);

  if (!modifiers.useTacticalAI) {
    return score;
  }

  const attackerKey = axialKey(attacker.unit.hex);

  // Combined arms bonus - reward coordinated attacks
  if (defender) {
    score += calculateCombinedArmsBonus(
      defender.unit.hex,
      input.botUnits,
      attackerKey,
      modifiers
    );
  }

  // Artillery positioning - keep at optimal range
  const nearestEnemyDistance = input.playerUnits.reduce(
    (min, enemy) => Math.min(min, hexDistance(candidate.destination, enemy.unit.hex)),
    Infinity
  );

  score += calculateArtilleryPositionScore(
    candidate.destination,
    nearestEnemyDistance,
    attacker,
    defender,
    modifiers
  );

  // Terrain positioning bonus when not attacking
  if (!defender) {
    const terrain = input.map.terrainAt(candidate.destination);
    score += calculateTerrainPositionScore(candidate.destination, terrain, false);
  }

  // Recon spotting bonus
  score += calculateReconSpottingBonus(
    candidate.destination,
    input.playerUnits,
    input.botUnits,
    attacker,
    input.losAllows
  );

  return score;
}

/**
 * Adds non-attack movement options so units can advance toward objectives when no shot is available.
 */
function scoreObjectiveAdvance(
  origin: Axial,
  reachable: Map<string, ReachableHex>,
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[]
): ActionCandidate | null {
  if (objectives.length === 0) {
    return null;
  }
  let best: ActionCandidate | null = null;
  objectives.forEach((objective) => {
    const key = axialKey(objective.hex);
    const option = reachable.get(key);
    if (!option) {
      return;
    }
    const distanceReduction = hexDistance(origin, objective.hex) - hexDistance(option.hex, objective.hex);
    const score = 4 + objective.vp + distanceReduction * 2;
    if (!best || score > best.score) {
      best = {
        destination: option.hex,
        path: option.path,
        attackTarget: null,
        expectedDamage: 0,
        expectedRetaliation: 0,
        score,
        rationale: `Advance to objective worth ${objective.vp} VP`
      };
    }
  });
  return best;
}

/**
 * Evaluate all reachable attack positions for a single unit and pick the highest scoring candidate.
 */
function pickBestCandidate(
  snapshot: PlannerUnitSnapshot,
  input: BotPlannerInput,
  reachable: Map<string, ReachableHex>,
  activeObjectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[],
  allowEnemyEliminationFallback: boolean
): ActionCandidate | null {
  const purpose = classifyUnitPurpose(snapshot.definition);
  // Get difficulty modifiers for scoring (defaults to Normal if not specified)
  const difficultyMods = getDifficultyModifiers(input.difficulty ?? "Normal");
  let top: ActionCandidate | null = null;

  // Determine whether to elevate engagement vs. nearby/visible enemies even if objectives exist.
  const isAir = snapshot.definition.moveType === "air";
  let nearestEnemyDistance = Number.POSITIVE_INFINITY;
  let enemyVisible = false;
  // Build a global spotted set: any player unit seen by a friendly air or recon spotter should attract all units.
  const globallySpottedPlayers: PlannerUnitSnapshot[] = [];
  for (const player of input.playerUnits) {
    let spotted = false;
    for (const spotter of input.botUnits) {
      const spotterIsAir = spotter.definition.moveType === "air";
      const spotterIsRecon = (spotter.definition.class === "recon");
      if (!spotterIsAir && !spotterIsRecon) {
        continue;
      }
      if (input.losAllows(spotter.unit.hex, player.unit.hex, spotterIsAir)) {
        spotted = true;
        break;
      }
    }
    if (spotted) {
      globallySpottedPlayers.push(player);
    }
  }
  for (const enemy of input.playerUnits) {
    const d = hexDistance(snapshot.unit.hex, enemy.unit.hex);
    if (d < nearestEnemyDistance) {
      nearestEnemyDistance = d;
    }
    if (!enemyVisible && input.losAllows(snapshot.unit.hex, enemy.unit.hex, isAir)) {
      enemyVisible = true;
    }
  }
  const enemyNearOrVisible = enemyVisible || nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS || globallySpottedPlayers.length > 0;

  for (const playerSnapshot of input.playerUnits) {
    const rangeMax = snapshot.definition.rangeMax ?? 1;
    const rangeMin = snapshot.definition.rangeMin ?? 1;

    for (const option of reachable.values()) {
      const distance = hexDistance(option.hex, playerSnapshot.unit.hex);
      if (distance < rangeMin || distance > rangeMax) {
        continue;
      }
      if (!input.losAllows(option.hex, playerSnapshot.unit.hex, snapshot.definition.moveType === "air")) {
        continue;
      }
      const estimate = input.attackEstimator(snapshot, option.hex, playerSnapshot, playerSnapshot.unit.hex);
      if (!estimate) {
        continue;
      }

      const candidate: ActionCandidate = {
        destination: option.hex,
        path: option.path,
        attackTarget: playerSnapshot.unit.hex,
        expectedDamage: estimate.expectedDamage,
        expectedRetaliation: estimate.expectedRetaliation,
        score: 0,
        rationale: `Attack ${playerSnapshot.unit.type}`
      };
      // Use advanced tactical scoring for Normal/Hard, basic scoring for Easy
      candidate.score = difficultyMods.useTacticalAI
        ? scoreCandidateAdvanced(purpose, snapshot, playerSnapshot, candidate, input, difficultyMods)
        : scoreCandidate(purpose, snapshot, playerSnapshot, candidate, difficultyMods);

      // Steering: if multiple attack positions have similar value, prefer first steps that point toward the defender
      if (option.path.length > 1) {
        candidate.score += STEERING_TIE_BIAS * steeringBias(snapshot.unit.hex, option.path[1], playerSnapshot.unit.hex);
      }

      if (!top || candidate.score > top.score) {
        top = candidate;
      }
    }
  }

  // Consider movement toward objectives if no attack was valuable.
  if (!top || top.score < 0) {
    const advanceCandidate = scoreObjectiveAdvance(snapshot.unit.hex, reachable, activeObjectives);
    if (advanceCandidate && (!top || advanceCandidate.score > top.score)) {
      top = advanceCandidate;
    }
    if (!top || top.score < 0) {
      const approachCandidate = scoreObjectiveApproach(snapshot.unit.hex, reachable, activeObjectives);
      if (approachCandidate && (!top || approachCandidate.score > top.score)) {
        top = approachCandidate;
      }
    }
    // Engage nearby/visible enemies even when objectives exist; otherwise fall back to elimination goal
    // only when no contested objectives remain.
    if ((allowEnemyEliminationFallback || enemyNearOrVisible) && (!top || top.score < 0)) {
      const pressureTargets = globallySpottedPlayers.length > 0 ? globallySpottedPlayers : input.playerUnits;
      const pressureCandidate = scoreEnemyPressure(snapshot.unit.hex, reachable, pressureTargets);
      if (pressureCandidate && enemyNearOrVisible) {
        // Apply difficulty-based contact engagement bonus
        pressureCandidate.score += difficultyMods.contactEngageBonus + Math.max(0, PROXIMITY_ENGAGE_RADIUS - nearestEnemyDistance);
      }
      if (pressureCandidate && (!top || pressureCandidate.score > top.score)) {
        top = pressureCandidate;
      }
    }
  }

  // If we already have a decent objective move but an enemy-pressure option clearly outranks it
  // (due to proximity/visibility), prefer the pressure move. This keeps the AI responsive to contact.
  if ((allowEnemyEliminationFallback || enemyNearOrVisible)) {
    const pressureTargets = globallySpottedPlayers.length > 0 ? globallySpottedPlayers : input.playerUnits;
    const pressureCandidate = scoreEnemyPressure(snapshot.unit.hex, reachable, pressureTargets);
    if (pressureCandidate && enemyNearOrVisible) {
      // Apply difficulty-based contact engagement bonus
      pressureCandidate.score += difficultyMods.contactEngageBonus + Math.max(0, PROXIMITY_ENGAGE_RADIUS - nearestEnemyDistance);
    }
    if (pressureCandidate && (!top || pressureCandidate.score > top.score)) {
      top = pressureCandidate;
    }
  }

  // Fallback to holding position when nothing else scored positively.
  if (!top) {
    top = {
      destination: snapshot.unit.hex,
      path: [snapshot.unit.hex],
      attackTarget: null,
      expectedDamage: 0,
      expectedRetaliation: 0,
      score: 0,
      rationale: "Hold position"
    };
  }

  return top;
}

/**
 * Primary entry point used by GameEngine: produce a ranked action list for all bot-controlled units.
 */
export function planHeuristicBotTurn(input: BotPlannerInput): PlannedBotAction[] {
  const actions: PlannedBotAction[] = [];
  const activeObjectives = filterActiveObjectives(input.objectives, input.occupancy);
  const eliminationObjectiveEnabled = activeObjectives.length === 0;
  input.botUnits.forEach((snapshot) => {
    const allowance = Math.max(0, input.movementAllowance(snapshot));
    const originKey = axialKey(snapshot.unit.hex);
    const reachable = computeReachableHexes(snapshot.unit.hex, allowance, snapshot.definition.moveType, input, originKey);
    const bestCandidate = pickBestCandidate(snapshot, input, reachable, activeObjectives, eliminationObjectiveEnabled);
    if (bestCandidate) {
      actions.push({
        unit: snapshot,
        unitKey: originKey,
        origin: snapshot.unit.hex,
        destination: bestCandidate.destination,
        path: bestCandidate.path,
        attackTarget: bestCandidate.attackTarget,
        expectedDamage: bestCandidate.expectedDamage,
        expectedRetaliation: bestCandidate.expectedRetaliation,
        score: bestCandidate.score,
        rationale: bestCandidate.rationale
      });
    }
  });

  return actions.sort((a, b) => b.score - a.score);
}
