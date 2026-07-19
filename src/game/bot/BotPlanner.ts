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
const PROXIMITY_ENGAGE_RADIUS = 6;
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
 * Bonus per nearby ally when staging an assault. Keeps the formation moving as a group instead of feeding units piecemeal.
 */
const ASSAULT_SUPPORT_BONUS = 3;
/**
 * Reward for ending a move on a destination that masks the approach from hostile LOS.
 */
const MASKED_APPROACH_BONUS = 6;
/**
 * Penalty per visible hostile when a unit advances without being ready to fight from that endpoint.
 */
const EXPOSED_APPROACH_PENALTY = 3.5;
/**
 * Penalty for pushing a combat unit ahead of its nearby support umbrella.
 */
const LONE_ADVANCE_PENALTY = 7;
/**
 * Recon units should scout for the formation, not die unsupported far in front of it.
 */
const RECON_OVERRUN_PENALTY = 10;
/**
 * Small reward for approach hexes that naturally block LOS and help hide the advance.
 */
const BLOCKING_TERRAIN_APPROACH_BONUS = 3;
/**
 * Reward for shaving whole turns off the march to a firing position.
 */
const TIME_TO_TARGET_BONUS = 8;
/**
 * Penalty for burning movement without improving when the unit can realistically fight.
 */
const STALLED_APPROACH_PENALTY = 6;
/**
 * Infantry and towed support should lean into masked covered movement while closing.
 */
const INFANTRY_COVER_MARCH_BONUS = 4;
/**
 * Infantry caught crossing open ground ahead of the line are very vulnerable.
 */
const INFANTRY_EXPOSED_MARCH_PENALTY = 5;
/**
 * When there is no realistic near-term shot coming back, infantry should take free tempo instead of bogging
 * themselves down in rough ground just because it looks safer on paper.
 */
const SAFE_TEMPO_APPROACH_BONUS = 4;
/**
 * Crawling through slow terrain is only worth it when that terrain is actually buying meaningful protection.
 */
const SLOW_TERRAIN_TEMPO_PENALTY = 3;
/**
 * Infantry that reaches a covered staging position near contact should sometimes hold and deepen its posture
 * instead of shuffling for another marginal hex.
 */
const INFANTRY_CONSOLIDATION_BONUS = 14;
/**
 * Armor should arrive as a spearhead, not as single vehicles trickling forward.
 */
const ARMORED_UNIFIED_FRONT_BONUS = 5;
/**
 * Armor that outruns the rest of the front loses most of its battlefield leverage.
 */
const ARMORED_OUTRUN_SUPPORT_PENALTY = 7;
/**
 * Defended objectives need a wider battlefield picture than a simple distance-to-VP score.
 * These radii describe the defensive network around a town or fortified objective.
 */
const STRONGHOLD_OBJECTIVE_RING = 3;
const STRONGHOLD_SUPPORT_RADIUS = 6;
const STRONGHOLD_SUPPRESSED_THRESHOLD = 24;
const STRONGHOLD_OPEN_APPROACH_PENALTY = 10;
const STRONGHOLD_COVERED_APPROACH_BONUS = 6;
const STRONGHOLD_ROAD_APPROACH_PENALTY = 8;
const STRONGHOLD_ARMORED_EARLY_ENTRY_PENALTY = 14;
const STRONGHOLD_INFANTRY_STAGING_BONUS = 5;
const STRONGHOLD_SUPPRESSED_ASSAULT_BONUS = 8;

/**
 * Bonus for recon units spotting enemies for allies.
 */
const RECON_SPOTTING_BONUS = 10;

/**
 * Range within which recon provides spotting bonuses to allies.
 */
const RECON_SPOTTING_RANGE = 6;
/**
 * Recon elements should fan out into overlapping lanes rather than stack into the same hex cluster.
 */
const RECON_CLUSTER_PENALTY = 10;
/**
 * Small reward for maintaining a dispersed recon screen that covers distinct avenues of approach.
 */
const RECON_SPREAD_BONUS = 6;
/**
 * Reward for recon units sitting just ahead of friendly combat troops instead of diving into the front line.
 */
const RECON_SCREENING_BONUS = 5;
/**
 * Penalty for recon ending too close to the enemy front where it stops scouting and starts dying.
 */
const RECON_FRONTLINE_PENALTY = 12;
/**
 * Recon should avoid ending one move away from the enemy unless the state truly demands it.
 */
const RECON_CLOSE_CONTACT_PENALTY = 9;
/**
 * Direct enemy fire on a recon endpoint should matter even if the unit is not the immediate attack target.
 */
const RECON_DIRECT_THREAT_WEIGHT = 0.12;
/**
 * Penalty when enemy recon can expose the endpoint to artillery and air support.
 */
const RECON_COUNTERSPOT_PENALTY = 6;
/**
 * Additional punishment when spotted recon sits inside enemy artillery coverage.
 */
const RECON_COUNTERBATTERY_SPOT_PENALTY = 5;
/**
 * Additional punishment when spotted recon can be serviced by strike aircraft.
 */
const RECON_AIR_STRIKE_SPOT_PENALTY = 4;
/**
 * Recon that walks into an already supported enemy kill zone is no longer scouting, just volunteering to die.
 */
const RECON_KILL_ZONE_PENALTY = 7;
/**
 * Recon screens work best when they stay a few hexes ahead of the main line instead of touching the front.
 */
const RECON_IDEAL_SCREEN_MIN_DISTANCE = 3;
const RECON_IDEAL_SCREEN_MAX_DISTANCE = 5;

/**
 * Bonus applied for occupying an objective hex.
 * This should be significant enough to make bots prioritize objectives over pure combat.
 */
const OBJECTIVE_CONTROL_BONUS = 45;

/**
 * Bonus per turn already held (encourages holding objectives).
 */
const OBJECTIVE_HOLD_BONUS = 5;

/**
 * Bonus for moving toward an objective (distance reduction).
 */
const OBJECTIVE_APPROACH_BONUS = 8;
/**
 * Base value for non-attack moves that deliberately set up a stronger shot on a later turn.
 * This lets the planner prefer "good staging" over aimless pressure once contact is established.
 */
const FIRE_SETUP_BASE_BONUS = 10;
/**
 * Reward for destinations that can step into a valid firing lane on the next turn.
 */
const FIRE_SETUP_READY_BONUS = 8;
/**
 * Penalty per hex the destination still sits outside the unit's attack band.
 */
const FIRE_SETUP_RANGE_GAP_PENALTY = 5;
/**
 * Heavier penalty for positions that still cannot realistically attack after a full move next turn.
 */
const FIRE_SETUP_FUTURE_GAP_PENALTY = 9;
/**
 * Reward/penalty pair used by direct-fire units so they value staging hexes with a real firing lane.
 */
const FIRE_SETUP_LOS_BONUS = 4;
const FIRE_SETUP_NO_LOS_PENALTY = 10;
/**
 * Direct-fire units should value masked jump-off positions when they still need another turn before firing.
 */
const FIRE_SETUP_MASKED_STAGING_BONUS = 10;

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
import type { HexModification, TerrainDefinition, TerrainFeature, ScenarioUnit, UnitTypeDefinition } from "../../core/types";

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
  snapshot: PlannerUnitSnapshot,
  origin: Axial,
  reachable: Map<string, ReachableHex>,
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[],
  occupancy: ReadonlyMap<string, "bot" | "player">,
  input: BotPlannerInput,
  modifiers: DifficultyModifiers,
  strongholds: readonly StrongholdProfile[]
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
      let score = 2 + reduction * OBJECTIVE_APPROACH_BONUS + objective.vp * 0.3;

      // Big bonus if we're landing on the objective itself
      const destKey = axialKey(option.hex);
      if (destKey === key) {
        score += OBJECTIVE_CONTROL_BONUS * modifiers.objectiveWeight;

        const currentOccupant = occupancy.get(key);
        if (!currentOccupant || currentOccupant === "player") {
          score += 10 * modifiers.objectiveWeight;
        }
      }

      if (score > bestReductionScore) {
        bestReductionScore = score;
        rationale = destKey === key
          ? `Occupy objective at ${key}`
          : `Advance toward objective at ${key}`;
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
      score: bestReductionScore - (option.path.length - 1)
        + calculateApproachPositionScore(snapshot, option.hex, bestTargetHex, input, modifiers, option.path.length, strongholds),
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
  snapshot: PlannerUnitSnapshot,
  reachable: Map<string, ReachableHex>,
  enemies: readonly PlannerUnitSnapshot[],
  input: BotPlannerInput,
  modifiers: DifficultyModifiers,
  strongholds: readonly StrongholdProfile[]
): ActionCandidate | null {
  if (enemies.length === 0) {
    return null;
  }

  const purpose = classifyUnitPurpose(snapshot.definition);

  if (purpose === "artillery") {
    return scoreArtilleryHoldOrDisplace(snapshot, reachable, enemies, input, modifiers, strongholds);
  }

  let best: ActionCandidate | null = null;
  const otherReconAllies = purpose === "recon"
    ? input.botUnits.filter((ally) =>
        axialKey(ally.unit.hex) !== axialKey(snapshot.unit.hex) && ally.definition.class === "recon"
      )
    : [];

  for (const option of reachable.values()) {
    if (option.path.length <= 1) {
      continue; // Staying in place does not apply pressure.
    }
    const reconObservationCoverage = purpose === "recon"
      ? calculateReconObservationCoverage(option.hex, snapshot, input)
      : null;
    if (purpose === "recon") {
      if (reconObservationCoverage!.overlappingTargets > 0 && reconObservationCoverage!.uniqueTargets <= 0) {
        continue;
      }
      const clustersWithOtherRecon = otherReconAllies.some((ally) => hexDistance(ally.unit.hex, option.hex) <= 2);
      if (clustersWithOtherRecon) {
        const hasAlternateSpreadLane = Array.from(reachable.values()).some((alternate) =>
          alternate.path.length > 1
          && axialKey(alternate.hex) !== axialKey(option.hex)
          && otherReconAllies.every((ally) => hexDistance(ally.unit.hex, alternate.hex) > 2)
          && calculateReconObservationCoverage(alternate.hex, snapshot, input).uniqueTargets > 0
        );
        if (hasAlternateSpreadLane) {
          continue;
        }
      }
    }

    for (const enemy of enemies) {
      if (!canPotentiallyAttackTarget(snapshot, enemy)) {
        continue;
      }

      const originDistance = hexDistance(snapshot.unit.hex, enemy.unit.hex);
      const distance = hexDistance(option.hex, enemy.unit.hex);
      const distanceGain = originDistance - distance;
      const originTurns = estimateTurnsToAttackWindow(snapshot.definition, snapshot.unit.hex, enemy.unit.hex, input);
      const destinationTurns = estimateTurnsToAttackWindow(snapshot.definition, option.hex, enemy.unit.hex, input);
      const turnGain = originTurns - destinationTurns;
      if (distanceGain <= 0 && turnGain <= 0) {
        continue; // Only reward moves that tighten the noose or materially improve attack timing.
      }

      let score = 4
        + distanceGain * 2.5
        + turnGain * 12
        + calculateContextualTargetPriorityBonus(purpose, enemy, input, strongholds) * 0.5
        + calculatePressureDamagePotential(snapshot, enemy) * 0.22
        - (option.path.length - 1) * 0.45;
      if (reconObservationCoverage) {
        score += reconObservationCoverage.uniqueTargets * 6 - reconObservationCoverage.overlappingTargets * 2;
      }
      score += calculateApproachPositionScore(snapshot, option.hex, enemy.unit.hex, input, modifiers, option.path.length, strongholds);

      const candidate: ActionCandidate = {
        destination: option.hex,
        path: option.path,
        attackTarget: null,
        expectedDamage: 0,
        expectedRetaliation: 0,
        score,
        rationale: `Advance to pressure ${describePriorityTarget(enemy)}`
      };

      // Steering: add a small nudge toward the chosen enemy to break ties consistently toward the target.
      if (option.path.length > 1) {
        candidate.score += STEERING_TIE_BIAS * steeringBias(snapshot.unit.hex, option.path[1], enemy.unit.hex);
      }

      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
  }

  return best;
}

/**
 * Long-range/towed formations should not drive into the enemy's face just because a target is visible.
 * Once a unit is outside danger range it holds its firing position and waits for a target to come into
 * range (handled separately by the attack scorer). It only moves when staying put is actually dangerous,
 * and even then it displaces to the safest reachable hex rather than closing the distance further.
 */
function scoreArtilleryHoldOrDisplace(
  snapshot: PlannerUnitSnapshot,
  reachable: Map<string, ReachableHex>,
  enemies: readonly PlannerUnitSnapshot[],
  input: BotPlannerInput,
  modifiers: DifficultyModifiers,
  strongholds: readonly StrongholdProfile[]
): ActionCandidate | null {
  const nearestEnemyDistance = Math.min(
    ...enemies.map((enemy) => hexDistance(snapshot.unit.hex, enemy.unit.hex))
  );

  if (nearestEnemyDistance > ARTILLERY_DANGER_RANGE) {
    // Not under threat: hold this position and wait for a target instead of advancing toward the enemy.
    return null;
  }

  // Something is actually wrong with staying put (enemy is closing to danger range) - find a safer hex
  // to displace to. Only reachable hexes that increase distance from every nearby enemy qualify; this is
  // a retreat/reposition, not an advance.
  let retreat: ActionCandidate | null = null;
  const currentEnemyDistances = enemies.map((enemy) => hexDistance(snapshot.unit.hex, enemy.unit.hex));
  for (const option of reachable.values()) {
    if (option.path.length <= 1) {
      continue;
    }
    const optionEnemyDistances = enemies.map((enemy) => hexDistance(option.hex, enemy.unit.hex));
    const optionNearestEnemyDistance = Math.min(...optionEnemyDistances);
    const movesTowardAnyEnemy = optionEnemyDistances.some(
      (distance, index) => distance < (currentEnemyDistances[index] ?? Number.POSITIVE_INFINITY)
    );
    if (optionNearestEnemyDistance <= nearestEnemyDistance || movesTowardAnyEnemy) {
      continue; // Must gain safety without creeping toward a different enemy formation.
    }

    let score = 4
      + (optionNearestEnemyDistance - nearestEnemyDistance) * 3
      - (option.path.length - 1) * 0.45;
    score += calculateApproachPositionScore(snapshot, option.hex, null, input, modifiers, option.path.length, strongholds);

    const candidate: ActionCandidate = {
      destination: option.hex,
      path: option.path,
      attackTarget: null,
      expectedDamage: 0,
      expectedRetaliation: 0,
      score,
      rationale: "Displace to a safer firing position"
    };

    if (!retreat || candidate.score > retreat.score) {
      retreat = candidate;
    }
  }

  return retreat;
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
    readonly featuresAt?: (hex: Axial) => readonly TerrainFeature[];
    readonly isRoad?: (hex: Axial) => boolean;
    readonly hexModificationsAt?: (hex: Axial) => readonly HexModification[];
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
  readonly fieldAction?: "digIn" | null;
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
  fieldAction?: "digIn" | null;
  expectedDamage: number;
  expectedRetaliation: number;
  score: number;
  rationale: string;
}

type StrongholdDefenseNodeCategory = "observer" | "artillery" | "flak" | "antiTank" | "garrison" | "works";

interface StrongholdDefenseNode {
  readonly key: string;
  readonly hex: Axial;
  readonly category: StrongholdDefenseNodeCategory;
  readonly weight: number;
  readonly readiness: number;
}

interface StrongholdProfile {
  readonly objectiveHex: Axial;
  readonly isTownLike: boolean;
  readonly defensePressure: number;
  readonly suppressed: boolean;
  readonly nodeKeys: ReadonlySet<string>;
  readonly nodes: readonly StrongholdDefenseNode[];
}

function isFlakRole(definition: UnitTypeDefinition): boolean {
  return definition.traits.includes("intercept");
}

function isAntiTankRole(definition: UnitTypeDefinition): boolean {
  return definition.combat.role === "antiTank";
}

function calculateStrongholdNodeReadiness(snapshot: PlannerUnitSnapshot): number {
  let readiness = Math.max(0.2, (snapshot.unit.strength ?? 100) / 100);
  if ((snapshot.unit.suppressedBy?.length ?? 0) > 0) {
    readiness *= 0.55;
  }
  if (snapshot.unit.towState === "towed") {
    readiness *= 0.7;
  }
  if (snapshot.unit.onSentry) {
    readiness *= 1.05;
  }
  return readiness;
}

function getStrongholdNodeWeight(category: StrongholdDefenseNodeCategory): number {
  switch (category) {
    case "observer":
      return 16;
    case "artillery":
      return 15;
    case "flak":
      return 13;
    case "antiTank":
      return 12;
    case "works":
      return 9;
    case "garrison":
    default:
      return 7;
  }
}

function objectiveLooksTownLike(objectiveHex: Axial, input: BotPlannerInput): boolean {
  const terrain = input.map.terrainAt(objectiveHex);
  const features = input.map.featuresAt?.(objectiveHex) ?? [];
  const modifications = input.map.hexModificationsAt?.(objectiveHex) ?? [];
  if ((terrain?.defense ?? 0) >= 2 || terrain?.blocksLOS) {
    return true;
  }
  if (features.includes("buildings") || features.includes("walls")) {
    return true;
  }
  if (modifications.some((modification) => modification.type === "fortifications" || modification.type === "tankTraps")) {
    return true;
  }

  return neighbors(objectiveHex).some((neighbor) => {
    if (!input.map.inBounds(neighbor)) {
      return false;
    }
    const nearbyFeatures = input.map.featuresAt?.(neighbor) ?? [];
    const nearbyMods = input.map.hexModificationsAt?.(neighbor) ?? [];
    const nearbyTerrain = input.map.terrainAt(neighbor);
    return nearbyFeatures.includes("buildings")
      || nearbyFeatures.includes("walls")
      || nearbyMods.some((modification) => modification.type === "fortifications" || modification.type === "tankTraps")
      || (nearbyTerrain?.defense ?? 0) >= 2;
  });
}

function unitSupportsObjectiveFireControl(
  snapshot: PlannerUnitSnapshot,
  objectiveHex: Axial,
  input: BotPlannerInput
): StrongholdDefenseNodeCategory | null {
  const distanceToObjective = hexDistance(snapshot.unit.hex, objectiveHex);
  const definition = snapshot.definition;

  if (
    definition.class === "recon"
    && distanceToObjective <= STRONGHOLD_SUPPORT_RADIUS
    && input.losAllows(snapshot.unit.hex, objectiveHex, false)
  ) {
    return "observer";
  }

  if (definition.class === "artillery") {
    const turnsToThreat = estimateTurnsToAttackWindow(definition, snapshot.unit.hex, objectiveHex, input);
    if (Number.isFinite(turnsToThreat) && turnsToThreat <= 1) {
      return "artillery";
    }
  }

  if (isFlakRole(definition) && distanceToObjective <= STRONGHOLD_SUPPORT_RADIUS) {
    return "flak";
  }

  if (isAntiTankRole(definition) && distanceToObjective <= STRONGHOLD_OBJECTIVE_RING + 1) {
    return "antiTank";
  }

  if (distanceToObjective <= STRONGHOLD_OBJECTIVE_RING && definition.moveType !== "air") {
    return "garrison";
  }

  return null;
}

function buildStrongholdProfiles(
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[],
  input: BotPlannerInput
): StrongholdProfile[] {
  const profiles: StrongholdProfile[] = [];

  objectives.forEach((objective) => {
    const objectiveHex = objective.hex;
    const isTownLike = objectiveLooksTownLike(objectiveHex, input);
    const nodes: StrongholdDefenseNode[] = [];
    const nodeKeys = new Set<string>();

    const worksHexes = [objectiveHex, ...neighbors(objectiveHex)].filter((hex, index, all) =>
      input.map.inBounds(hex) && all.findIndex((other) => axialKey(other) === axialKey(hex)) === index
    );
    worksHexes.forEach((hex) => {
      const modifications = input.map.hexModificationsAt?.(hex) ?? [];
      if (modifications.some((modification) => modification.type === "fortifications" || modification.type === "tankTraps")) {
        const key = `works:${axialKey(hex)}`;
        nodes.push({
          key,
          hex,
          category: "works",
          weight: getStrongholdNodeWeight("works"),
          readiness: 1
        });
        nodeKeys.add(key);
      }
    });

    input.playerUnits.forEach((snapshot) => {
      const category = unitSupportsObjectiveFireControl(snapshot, objectiveHex, input);
      if (!category) {
        return;
      }
      const key = axialKey(snapshot.unit.hex);
      nodes.push({
        key,
        hex: snapshot.unit.hex,
        category,
        weight: getStrongholdNodeWeight(category),
        readiness: calculateStrongholdNodeReadiness(snapshot)
      });
      nodeKeys.add(key);
    });

    const defensePressure = nodes.reduce((sum, node) => sum + node.weight * node.readiness, 0);
    const fireControlReadiness = nodes
      .filter((node) => node.category === "observer" || node.category === "artillery" || node.category === "flak")
      .reduce((sum, node) => sum + node.weight * node.readiness, 0);
    const suppressed = defensePressure < STRONGHOLD_SUPPRESSED_THRESHOLD || fireControlReadiness < 18;

    if (!isTownLike && nodes.length < 2 && defensePressure < 18) {
      return;
    }

    profiles.push({
      objectiveHex,
      isTownLike,
      defensePressure,
      suppressed,
      nodeKeys,
      nodes
    });
  });

  return profiles;
}

function findStrongholdNodeContext(
  defender: PlannerUnitSnapshot | null,
  strongholds: readonly StrongholdProfile[]
): { profile: StrongholdProfile; node: StrongholdDefenseNode } | null {
  if (!defender) {
    return null;
  }
  const defenderKey = axialKey(defender.unit.hex);
  for (const profile of strongholds) {
    const node = profile.nodes.find((candidate) => candidate.key === defenderKey);
    if (node) {
      return { profile, node };
    }
  }
  return null;
}

function findRelevantStrongholdForApproach(
  destination: Axial,
  focusHex: Axial | null,
  strongholds: readonly StrongholdProfile[]
): StrongholdProfile | null {
  let best: StrongholdProfile | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const focusKey = focusHex ? axialKey(focusHex) : null;

  strongholds.forEach((profile) => {
    const destinationDistance = hexDistance(destination, profile.objectiveHex);
    const focusDistance = focusHex ? hexDistance(focusHex, profile.objectiveHex) : Number.POSITIVE_INFINITY;
    const nodeMatch = focusKey ? profile.nodeKeys.has(focusKey) : false;
    const relevanceDistance = nodeMatch ? 0 : Math.min(destinationDistance, focusDistance);
    if (relevanceDistance > STRONGHOLD_SUPPORT_RADIUS) {
      return;
    }
    if (relevanceDistance < bestDistance) {
      bestDistance = relevanceDistance;
      best = profile;
    }
  });

  return best;
}

function calculateStrongholdSuppressionPriorityBonus(
  purpose: UnitPurpose,
  defender: PlannerUnitSnapshot | null,
  strongholds: readonly StrongholdProfile[]
): number {
  const context = findStrongholdNodeContext(defender, strongholds);
  if (!context) {
    return 0;
  }

  const { profile, node } = context;
  let bonus = node.weight * (profile.suppressed ? 0.35 : 0.7);

  if (!profile.suppressed) {
    switch (node.category) {
      case "observer":
        bonus += 10;
        break;
      case "artillery":
        bonus += 8;
        break;
      case "flak":
        bonus += 7;
        break;
      case "antiTank":
        bonus += 6;
        break;
      case "works":
        bonus += 5;
        break;
      default:
        bonus += 2;
        break;
    }
  }

  if (purpose === "antiArmor" && (node.category === "antiTank" || node.category === "observer")) {
    bonus += 4;
  }
  if (purpose === "artillery" && (node.category === "artillery" || node.category === "flak" || node.category === "works")) {
    bonus += 4;
  }
  if (purpose === "antiInfantry" && (node.category === "observer" || node.category === "garrison")) {
    bonus += 3;
  }

  return bonus;
}

function calculateStrongholdApproachAdjustment(
  snapshot: PlannerUnitSnapshot,
  destination: Axial,
  focusHex: Axial | null,
  input: BotPlannerInput,
  strongholds: readonly StrongholdProfile[]
): number {
  const profile = findRelevantStrongholdForApproach(destination, focusHex, strongholds);
  if (!profile) {
    return 0;
  }

  const terrain = input.map.terrainAt(destination);
  const modifications = input.map.hexModificationsAt?.(destination) ?? [];
  const smoked = modifications.some((modification) => modification.type === "smoke");
  const covered = Boolean(terrain?.blocksLOS || (terrain?.defense ?? 0) >= 2 || smoked);
  const openLane = !covered && (terrain?.defense ?? 0) <= 1;
  const objectiveDistance = hexDistance(destination, profile.objectiveHex);
  const onRoad = input.map.isRoad?.(destination) ?? false;
  let score = 0;

  if (!profile.suppressed) {
    if (objectiveDistance <= STRONGHOLD_SUPPORT_RADIUS && covered) {
      score += 4;
    }
    if (objectiveDistance <= STRONGHOLD_SUPPORT_RADIUS && openLane) {
      score -= 5;
    }
    if (objectiveDistance <= STRONGHOLD_OBJECTIVE_RING + 1 && onRoad) {
      score -= STRONGHOLD_ROAD_APPROACH_PENALTY;
    }
    if (objectiveDistance <= STRONGHOLD_OBJECTIVE_RING && openLane) {
      score -= STRONGHOLD_OPEN_APPROACH_PENALTY + Math.min(10, profile.defensePressure * 0.18);
    }
    if (covered && objectiveDistance <= STRONGHOLD_OBJECTIVE_RING + 1) {
      score += STRONGHOLD_COVERED_APPROACH_BONUS;
    }
    if (isArmoredGroundUnit(snapshot.definition)) {
      if (objectiveDistance <= STRONGHOLD_SUPPORT_RADIUS && openLane) {
        score -= 7;
      }
      if (objectiveDistance <= STRONGHOLD_OBJECTIVE_RING) {
        score -= STRONGHOLD_ARMORED_EARLY_ENTRY_PENALTY + Math.min(12, profile.defensePressure * 0.22);
      } else if (covered && objectiveDistance <= STRONGHOLD_SUPPORT_RADIUS) {
        score += 5;
      }
    } else if (snapshot.definition.class === "infantry" || snapshot.definition.class === "specialist") {
      if (covered && objectiveDistance <= STRONGHOLD_SUPPORT_RADIUS) {
        score += STRONGHOLD_INFANTRY_STAGING_BONUS;
      }
      if (objectiveDistance <= 2 && openLane) {
        score -= 6;
      }
    } else if (snapshot.definition.class === "recon" && objectiveDistance <= STRONGHOLD_OBJECTIVE_RING) {
      score -= 10 + Math.min(8, profile.defensePressure * 0.15);
    }
  } else if (objectiveDistance <= STRONGHOLD_OBJECTIVE_RING) {
    if (isArmoredGroundUnit(snapshot.definition)) {
      score += STRONGHOLD_SUPPRESSED_ASSAULT_BONUS;
    } else if (snapshot.definition.class === "infantry" || snapshot.definition.class === "specialist") {
      score += STRONGHOLD_SUPPRESSED_ASSAULT_BONUS * 0.75;
    }
  }

  return score;
}

/**
 * Enemy-pressure should overrule objective marching, but not a deliberate firing setup or attack plan.
 */
function isObjectiveCandidate(candidate: ActionCandidate | null): boolean {
  return Boolean(candidate && candidate.attackTarget === null && candidate.rationale.toLowerCase().includes("objective"));
}

function isPassiveStagingCandidate(candidate: ActionCandidate | null): boolean {
  if (!candidate || candidate.attackTarget) {
    return false;
  }
  return candidate.rationale.toLowerCase().startsWith("stage for");
}

/**
 * Rear units should keep marching when they are still well outside the fight and only found a distant staging idea.
 */
function shouldCompareMarchPlans(
  snapshot: PlannerUnitSnapshot,
  candidate: ActionCandidate | null,
  nearestEnemyDistance: number
): boolean {
  if (!candidate || candidate.score < 0) {
    return true;
  }
  if (!isPassiveStagingCandidate(candidate)) {
    return false;
  }

  const tacticalReach = (snapshot.definition.rangeMax ?? 1) + resolveTacticalMoveRate(snapshot.definition);
  return nearestEnemyDistance > Math.max(PROXIMITY_ENGAGE_RADIUS + 1, tacticalReach + 2);
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
  const bestCosts = new Map<string, number>([[originKey, 0]]);
  const frontier: Array<{ hex: Axial; cost: number; path: Axial[] }> = [{
    hex: origin,
    cost: 0,
    path: [origin]
  }];

  let impassableCount = 0;
  let highCostCount = 0;

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (!current) {
      break;
    }

    const currentKey = axialKey(current.hex);
    const bestKnownCost = bestCosts.get(currentKey);
    if (bestKnownCost !== undefined && current.cost > bestKnownCost) {
      continue;
    }
    const currentOccupant = input.occupancy.get(currentKey);
    if (currentKey === originKey || currentOccupant !== "bot") {
      results.set(currentKey, {
        hex: current.hex,
        cost: current.cost,
        path: current.path
      });
    }

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
        impassableCount++;
        continue; // Treat very high cost as impassable for land units.
      }
      if (terrainCost > 1) {
        highCostCount++;
      }

      const occupant = input.occupancy.get(neighborKey);
      if (occupant === "player") {
        continue; // Do not step onto enemy-occupied hexes; attacks target adjacent positions instead.
      }

      const newCost = current.cost + terrainCost;
      if (newCost > allowance) {
        continue;
      }

      const knownCost = bestCosts.get(neighborKey);
      if (knownCost !== undefined && knownCost <= newCost) {
        continue;
      }
      bestCosts.set(neighborKey, newCost);

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

/**
 * Treat tanks, armored vehicles, and heavily protected ground formations as armored strike targets.
 * The fallback armor check keeps odd specialist data aligned with the bot's battlefield priorities.
 */
function isArmoredGroundUnit(definition: UnitTypeDefinition): boolean {
  if (definition.moveType === "air") {
    return false;
  }
  if (definition.class === "tank" || definition.class === "vehicle") {
    return true;
  }

  const heaviestArmor = Math.max(definition.armor.front, definition.armor.side, definition.armor.top);
  return heaviestArmor >= 6 && definition.combat.weight !== "light";
}

/**
 * Immediate attack scoring and multi-turn staging should agree on what a unit is meant to hunt.
 */
function calculatePurposeBonus(
  purpose: UnitPurpose,
  defender: PlannerUnitSnapshot | null
): number {
  if (!defender) {
    return 0;
  }

  const defenderClass = defender.definition.class;
  if (purpose === "antiArmor") {
    if (isArmoredGroundUnit(defender.definition)) {
      return 15;
    }
    if (defenderClass === "artillery") {
      return 6;
    }
    if (defenderClass === "recon") {
      return 4;
    }
    if (defenderClass === "air" || defenderClass === "infantry") {
      return -5;
    }
  }
  if (purpose === "antiInfantry") {
    if (defenderClass === "infantry" || defenderClass === "specialist") {
      return 12;
    }
    if (defenderClass === "recon") {
      return 10;
    }
    if (defenderClass === "artillery") {
      return 4;
    }
    if (isArmoredGroundUnit(defender.definition)) {
      return -6;
    }
  }
  if (purpose === "artillery") {
    if (defenderClass === "artillery") {
      return 8;
    }
    if (defenderClass === "recon") {
      return 5;
    }
    if (defenderClass === "infantry" || defenderClass === "specialist") {
      return 6;
    }
    if (isArmoredGroundUnit(defender.definition)) {
      return 4;
    }
  }
  if (purpose === "recon" && defenderClass === "artillery") {
    return 4;
  }
  if (defenderClass === "recon") {
    return 4;
  }
  return 0;
}

/**
 * Uses weapon stats and battlefield role to estimate how urgently the formation should neutralize this target.
 */
function calculateThreatProjection(defender: PlannerUnitSnapshot | null): number {
  if (!defender) {
    return 0;
  }

  const def = defender.definition;
  let threat = 0;
  threat += def.softAttack * 0.45;
  threat += def.hardAttack * 0.75;
  threat += def.ap * 0.7;
  threat += (def.rangeMax ?? 1) * 2.5;
  threat += Math.max(def.armor.front, def.armor.side, def.armor.top) * 0.8;

  if (def.class === "artillery") {
    threat += 18;
  }
  if (def.combat.role === "antiTank") {
    threat += 16;
  }
  if (isArmoredGroundUnit(def)) {
    threat += 12;
  }
  if (def.class === "recon") {
    threat += 10;
  }
  if (def.traits.includes("intercept")) {
    threat += 10;
  }

  return threat;
}

/**
 * Uses the unit's real tactical move rate so "next turn" estimates do not inherit the planner's long-horizon search allowance.
 */
function resolveTacticalMoveRate(definition: UnitTypeDefinition): number {
  return Math.max(1, definition.movement ?? 1);
}

/**
 * Rough offensive leverage estimate for staging and pressure scoring.
 */
function calculatePressureDamagePotential(
  attacker: PlannerUnitSnapshot,
  defender: PlannerUnitSnapshot | null
): number {
  if (!defender) {
    return 0;
  }

  const againstArmor = isArmoredGroundUnit(defender.definition);
  const baseDamage = againstArmor
    ? attacker.definition.hardAttack * 0.75 + attacker.definition.ap * 0.55
    : attacker.definition.softAttack * 0.65 + attacker.definition.hardAttack * 0.15;
  const rangeFactor = Math.max(1, (attacker.definition.rangeMax ?? 1) * 0.35);
  return baseDamage + rangeFactor;
}

/**
 * Estimates how many turns remain before the unit can reach a valid attack window on the target.
 */
function estimateTurnsToAttackWindow(
  definition: UnitTypeDefinition,
  fromHex: Axial,
  targetHex: Axial,
  input: BotPlannerInput
): number {
  const rangeMin = definition.rangeMin ?? 1;
  const rangeMax = definition.rangeMax ?? 1;
  const distance = hexDistance(fromHex, targetHex);
  const attackBandGap = distanceToAttackBand(distance, rangeMin, rangeMax);
  const tacticalMoveRate = resolveTacticalMoveRate(definition);
  let turns = attackBandGap <= 0 ? 0 : Math.ceil(attackBandGap / tacticalMoveRate);

  if (requiresDirectLOS(definition) && !input.losAllows(fromHex, targetHex, definition.moveType === "air")) {
    turns += 1;
  }

  return turns;
}

/**
 * High-value battlefield assets attract fire even from generalists because removing them changes the whole fight.
 */
function calculateStrategicTargetBonus(defender: PlannerUnitSnapshot | null): number {
  if (!defender) {
    return 0;
  }

  let bonus = 0;
  if (isArmoredGroundUnit(defender.definition)) {
    bonus += 14;
  }
  if (defender.definition.class === "artillery") {
    bonus += 18;
  }
  if (defender.definition.combat.role === "antiTank") {
    bonus += 12;
  }
  if (defender.definition.class === "recon") {
    bonus += 10;
  }
  bonus += calculateThreatProjection(defender) * 0.55;
  return bonus;
}

/**
 * Shared target-priority score used by both attack selection and positioning logic.
 */
function calculateTargetPriorityBonus(
  purpose: UnitPurpose,
  defender: PlannerUnitSnapshot | null
): number {
  return calculatePurposeBonus(purpose, defender) + calculateStrategicTargetBonus(defender);
}

/**
 * Shared visibility helper so recon valuation can reason about what an enemy observer is actually exposing.
 */
function canObserverSeeTarget(
  observer: PlannerUnitSnapshot,
  targetHex: Axial,
  input: BotPlannerInput
): boolean {
  const visionRange = Math.max(1, observer.definition.vision ?? observer.definition.rangeMax ?? 1);
  if (hexDistance(observer.unit.hex, targetHex) > visionRange) {
    return false;
  }
  return input.losAllows(observer.unit.hex, targetHex, observer.definition.moveType === "air");
}

function calculateReconObservationCoverage(
  destination: Axial,
  attacker: PlannerUnitSnapshot,
  input: BotPlannerInput
): { overlappingTargets: number; uniqueTargets: number } {
  if (attacker.definition.class !== "recon") {
    return { overlappingTargets: 0, uniqueTargets: 0 };
  }

  const selfKey = axialKey(attacker.unit.hex);
  const otherReconAllies = input.botUnits.filter((ally) =>
    axialKey(ally.unit.hex) !== selfKey && ally.definition.class === "recon"
  );
  const visibleTargets = input.playerUnits.filter((enemy) =>
    input.losAllows(destination, enemy.unit.hex, attacker.definition.moveType === "air")
  );
  const overlappingTargets = visibleTargets.filter((enemy) =>
    otherReconAllies.some((ally) => input.losAllows(ally.unit.hex, enemy.unit.hex, ally.definition.moveType === "air"))
  ).length;

  return {
    overlappingTargets,
    uniqueTargets: visibleTargets.length - overlappingTargets
  };
}

/**
 * Enemy recon becomes a higher priority when it is actively exposing the bot's armored/artillery elements
 * to short-horizon fires from artillery, strike aircraft, or anti-tank support.
 */
function calculateReconObservationNetworkThreat(
  defender: PlannerUnitSnapshot | null,
  input: BotPlannerInput
): number {
  if (!defender || defender.definition.class !== "recon") {
    return 0;
  }

  const defenderKey = axialKey(defender.unit.hex);
  const exposedBotUnits = input.botUnits.filter((botUnit) =>
    botUnit.definition.moveType !== "air" && canObserverSeeTarget(defender, botUnit.unit.hex, input)
  );
  if (exposedBotUnits.length === 0) {
    return 0;
  }

  let networkThreat = 0;
  for (const botUnit of exposedBotUnits) {
    const exposedValue = 2
      + calculateThreatProjection(botUnit) * 0.12
      + calculateStrategicTargetBonus(botUnit) * 0.18;
    const enabledFireSupport = input.playerUnits.reduce((sum, ally) => {
      if (axialKey(ally.unit.hex) === defenderKey) {
        return sum;
      }
      if (!canPotentiallyAttackTarget(ally, botUnit)) {
        return sum;
      }

      const turnsToThreat = estimateTurnsToAttackWindow(ally.definition, ally.unit.hex, botUnit.unit.hex, input);
      if (!Number.isFinite(turnsToThreat) || turnsToThreat > 1) {
        return sum;
      }

      if (ally.definition.class === "artillery") {
        return sum + (turnsToThreat === 0 ? 7 : 5);
      }
      if (ally.definition.moveType === "air" && ally.definition.airSupport?.roles?.includes("strike")) {
        return sum + 6;
      }
      if (ally.definition.combat.role === "antiTank") {
        return sum + (turnsToThreat === 0 ? 5 : 3);
      }
      if (isArmoredGroundUnit(ally.definition)) {
        return sum + (turnsToThreat === 0 ? 4 : 2);
      }

      return sum + (turnsToThreat === 0 ? 2 : 1);
    }, 0);

    networkThreat += Math.min(18, exposedValue + enabledFireSupport);
  }

  return Math.min(24, networkThreat * 0.5);
}

/**
 * Base target priority is static; this contextual layer catches observer units that are multiplying allied fires.
 */
function calculateContextualTargetPriorityBonus(
  purpose: UnitPurpose,
  defender: PlannerUnitSnapshot | null,
  input: BotPlannerInput,
  strongholds: readonly StrongholdProfile[] = []
): number {
  return calculateTargetPriorityBonus(purpose, defender)
    + calculateReconObservationNetworkThreat(defender, input)
    + calculateStrongholdSuppressionPriorityBonus(purpose, defender, strongholds);
}

/**
 * Returns how many hexes separate a destination from the unit's valid firing band.
 */
function distanceToAttackBand(distance: number, rangeMin: number, rangeMax: number): number {
  if (distance < rangeMin) {
    return rangeMin - distance;
  }
  if (distance > rangeMax) {
    return distance - rangeMax;
  }
  return 0;
}

/**
 * Direct-fire formations need a firing lane; indirect artillery can stage behind the line as long as it is spotted.
 */
function requiresDirectLOS(definition: UnitTypeDefinition): boolean {
  if (definition.moveType === "air") {
    return false;
  }
  if (definition.class === "artillery") {
    return false;
  }
  return !definition.traits.includes("indirect");
}

/**
 * Used to skip air targets that most ground formations can never legally attack.
 */
function canPotentiallyAttackTarget(attacker: PlannerUnitSnapshot, defender: PlannerUnitSnapshot): boolean {
  if (defender.definition.moveType !== "air") {
    return true;
  }
  return attacker.definition.moveType === "air" || attacker.unit.type.toLowerCase().includes("flak");
}

/**
 * Human-readable label for rationale strings when the planner stages around battlefield priorities.
 */
function describePriorityTarget(defender: PlannerUnitSnapshot): string {
  if (defender.definition.class === "artillery") {
    return `artillery ${defender.unit.type}`;
  }
  if (isArmoredGroundUnit(defender.definition)) {
    return `armored ${defender.unit.type}`;
  }
  return defender.unit.type;
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
  let spottingScore = 0;
  const otherReconAllies = allies.filter((ally) => ally !== attacker && ally.definition.class === "recon");

  const allyFollowThroughValue = (ally: PlannerUnitSnapshot, enemy: PlannerUnitSnapshot): number => {
    if (ally === attacker || ally.definition.class === "recon") {
      return 0;
    }

    const allyDistance = hexDistance(ally.unit.hex, enemy.unit.hex);
    const rangeMin = ally.definition.rangeMin ?? 1;
    const rangeMax = ally.definition.rangeMax ?? 1;

    if (ally.definition.class === "artillery") {
      return allyDistance >= rangeMin && allyDistance <= rangeMax ? 1.8 : 0;
    }

    if (ally.definition.moveType === "air" && ally.definition.airSupport?.roles?.includes("strike")) {
      return 1.7;
    }

    if (allyDistance <= RECON_SPOTTING_RANGE) {
      if (ally.definition.traits.includes("indirect") || (ally.definition.rangeMax ?? 1) > 1) {
        return 1.2;
      }
      return 0.85;
    }

    return 0;
  };

  for (const enemy of enemies) {
    // Check if we can see this enemy from the new position
    if (!losAllows(hex, enemy.unit.hex, isAir)) continue;

    const followThrough = allies.reduce((sum, ally) => sum + allyFollowThroughValue(ally, enemy), 0);
    if (followThrough <= 0) {
      continue;
    }

    const alreadyCoveredByOtherRecon = otherReconAllies.some((ally) =>
      losAllows(ally.unit.hex, enemy.unit.hex, ally.definition.moveType === "air")
    );
    const coverageMultiplier = alreadyCoveredByOtherRecon ? 0.35 : 1;
    const targetValue = 1
      + Math.min(1.2, calculateTargetPriorityBonus("recon", enemy) * 0.025)
      + Math.min(1.0, calculateThreatProjection(enemy) * 0.015);
    spottingScore += Math.min(followThrough, 3.5) * targetValue * coverageMultiplier;
  }

  return Math.min(spottingScore, RECON_SPOTTING_BONUS * 2.4);
}

/**
 * Recon should screen, spot, and survive. This helper penalizes clustering, front-line lunges,
 * and counter-spotting exposure while rewarding dispersed observation lanes for the main body.
 */
function calculateReconPositioningScore(
  destination: Axial,
  attacker: PlannerUnitSnapshot,
  input: BotPlannerInput,
  focusHex: Axial | null
): number {
  if (attacker.definition.class !== "recon") {
    return 0;
  }

  const selfKey = axialKey(attacker.unit.hex);
  const terrain = input.map.terrainAt(destination);
  const otherReconAllies = input.botUnits.filter((ally) =>
    axialKey(ally.unit.hex) !== selfKey && ally.definition.class === "recon"
  );
  const combatSupportDistances = input.botUnits
    .filter((ally) => axialKey(ally.unit.hex) !== selfKey && ally.definition.class !== "recon" && ally.definition.moveType !== "air")
    .map((ally) => hexDistance(ally.unit.hex, destination));
  const nearbyCombatSupport = combatSupportDistances.filter((distance) => distance <= SUPPORT_RANGE).length;
  const nearestCombatSupportDistance = combatSupportDistances.length > 0
    ? Math.min(...combatSupportDistances)
    : Number.POSITIVE_INFINITY;
  const nearestEnemyDistance = input.playerUnits.reduce(
    (min, enemy) => Math.min(min, hexDistance(destination, enemy.unit.hex)),
    Number.POSITIVE_INFINITY
  );

  const canProjectThreatToHex = (enemy: PlannerUnitSnapshot): boolean => {
    const rangeMin = enemy.definition.rangeMin ?? 1;
    const rangeMax = enemy.definition.rangeMax ?? 1;
    if (rangeMax <= 0) {
      return false;
    }
    const distance = hexDistance(enemy.unit.hex, destination);
    if (distance < rangeMin || distance > rangeMax) {
      return false;
    }
    const isEnemyAir = enemy.definition.moveType === "air";
    return !requiresDirectLOS(enemy.definition) || input.losAllows(enemy.unit.hex, destination, isEnemyAir);
  };

  const directThreats = input.playerUnits.filter((enemy) =>
    enemy.definition.class !== "artillery"
    && !(enemy.definition.moveType === "air" && enemy.definition.airSupport?.roles?.includes("strike"))
    && canProjectThreatToHex(enemy)
  );
  const playerReconSpotters = input.playerUnits.filter((enemy) =>
    enemy.definition.class === "recon" && input.losAllows(enemy.unit.hex, destination, enemy.definition.moveType === "air")
  );
  const artilleryCoverage = input.playerUnits.filter((enemy) =>
    enemy.definition.class === "artillery" && canProjectThreatToHex(enemy)
  ).length;
  const strikeAircraftCoverage = input.playerUnits.filter((enemy) =>
    enemy.definition.moveType === "air" && enemy.definition.airSupport?.roles?.includes("strike")
  ).length;
  const nearbyReconCount = otherReconAllies.filter((ally) => hexDistance(ally.unit.hex, destination) <= 2).length;
  const spreadWindowCount = otherReconAllies.filter((ally) => {
    const distance = hexDistance(ally.unit.hex, destination);
    return distance >= 3 && distance <= RECON_SPOTTING_RANGE;
  }).length;
  const observationCoverage = calculateReconObservationCoverage(destination, attacker, input);
  const overlappingObservationCount = observationCoverage.overlappingTargets;
  const uniqueObservationCount = observationCoverage.uniqueTargets;

  let score = calculateReconSpottingBonus(destination, input.playerUnits, input.botUnits, attacker, input.losAllows);

  if (nearbyReconCount > 0) {
    score -= nearbyReconCount * RECON_CLUSTER_PENALTY;
  } else if (spreadWindowCount > 0) {
    score += RECON_SPREAD_BONUS;
  }
  if (overlappingObservationCount > 0) {
    score -= overlappingObservationCount * 8;
  }
  if (uniqueObservationCount > 0) {
    score += Math.min(2, uniqueObservationCount) * 2;
  }

  if (terrain?.blocksLOS && nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS) {
    score += 2;
  }

  if (nearestEnemyDistance <= 1) {
    score -= RECON_FRONTLINE_PENALTY + RECON_CLOSE_CONTACT_PENALTY;
  } else if (nearestEnemyDistance === 2) {
    score -= RECON_CLOSE_CONTACT_PENALTY;
  } else if (
    nearestEnemyDistance >= RECON_IDEAL_SCREEN_MIN_DISTANCE
    && nearestEnemyDistance <= RECON_IDEAL_SCREEN_MAX_DISTANCE
    && nearbyCombatSupport > 0
  ) {
    score += RECON_SCREENING_BONUS;
  }

  if (nearbyCombatSupport === 0 && nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS + 1) {
    score -= RECON_OVERRUN_PENALTY;
    if (Number.isFinite(nearestCombatSupportDistance)) {
      score -= Math.max(0, nearestCombatSupportDistance - SUPPORT_RANGE) * 1.5;
    }
  }

  if (directThreats.length > 0) {
    const weightedThreat = directThreats.reduce(
      (sum, enemy) => sum + 1 + calculateThreatProjection(enemy) * RECON_DIRECT_THREAT_WEIGHT,
      0
    );
    score -= weightedThreat;
  }

  const killZonePressure = directThreats.length + artilleryCoverage + Math.min(2, strikeAircraftCoverage);
  if (nearestEnemyDistance <= 2 && killZonePressure > 0) {
    score -= RECON_KILL_ZONE_PENALTY + killZonePressure * 1.5;
  }
  if (nearestEnemyDistance <= 2 && !terrain?.blocksLOS) {
    score -= 5;
  }
  if (nearestEnemyDistance <= 3 && nearbyCombatSupport < Math.max(1, directThreats.length)) {
    score -= RECON_OVERRUN_PENALTY * 0.8;
  }

  if (playerReconSpotters.length > 0) {
    score -= playerReconSpotters.length * RECON_COUNTERSPOT_PENALTY;
    if (artilleryCoverage > 0) {
      score -= artilleryCoverage * RECON_COUNTERBATTERY_SPOT_PENALTY;
    }
    if (strikeAircraftCoverage > 0) {
      score -= Math.min(2, strikeAircraftCoverage) * RECON_AIR_STRIKE_SPOT_PENALTY;
    }
  }

  if (focusHex && hexDistance(destination, focusHex) <= 1 && directThreats.length > 1) {
    score -= 4;
  }

  return score;
}

function calculateApproachThreatEnvelope(
  snapshot: PlannerUnitSnapshot,
  destination: Axial,
  input: BotPlannerInput,
  focusHex: Axial | null,
  inAttackBand: boolean
): { visible: number; directImmediate: number; directNear: number; indirectImmediate: number } {
  const focusKey = focusHex ? axialKey(focusHex) : null;
  let visible = 0;
  let directImmediate = 0;
  let directNear = 0;
  let indirectImmediate = 0;

  input.playerUnits.forEach((enemy) => {
    if (!canPotentiallyAttackTarget(enemy, snapshot)) {
      return;
    }

    const enemyKey = axialKey(enemy.unit.hex);
    if (focusKey && inAttackBand && enemyKey === focusKey) {
      return;
    }

    const enemyIsAir = enemy.definition.moveType === "air";
    const hasLos = !requiresDirectLOS(enemy.definition) || input.losAllows(enemy.unit.hex, destination, enemyIsAir);
    if (hasLos) {
      visible += 1;
    }

    const turnsToThreat = estimateTurnsToAttackWindow(enemy.definition, enemy.unit.hex, destination, input);
    if (enemy.definition.class === "artillery") {
      if (turnsToThreat <= 1) {
        indirectImmediate += 1;
      }
      return;
    }

    if (!hasLos) {
      return;
    }
    if (turnsToThreat <= 1) {
      directImmediate += 1;
    } else if (turnsToThreat <= 2) {
      directNear += 1;
    }
  });

  return { visible, directImmediate, directNear, indirectImmediate };
}

function scoreInfantryConsolidation(
  snapshot: PlannerUnitSnapshot,
  input: BotPlannerInput,
  modifiers: DifficultyModifiers,
  focusHex: Axial | null,
  strongholds: readonly StrongholdProfile[]
): ActionCandidate | null {
  if (snapshot.definition.class !== "infantry" || snapshot.unit.entrench >= 2) {
    return null;
  }

  const terrain = input.map.terrainAt(snapshot.unit.hex);
  const onObjective = input.objectives.some((objective) => axialKey(objective.hex) === axialKey(snapshot.unit.hex));
  const defensible = Boolean(terrain && (terrain.blocksLOS || terrain.defense >= 2)) || onObjective;
  if (!defensible) {
    return null;
  }

  const nearestEnemyDistance = input.playerUnits.reduce(
    (min, enemy) => Math.min(min, hexDistance(snapshot.unit.hex, enemy.unit.hex)),
    Number.POSITIVE_INFINITY
  );
  if (!onObjective && nearestEnemyDistance > PROXIMITY_ENGAGE_RADIUS + 1) {
    return null;
  }

  const approachScore = calculateApproachPositionScore(
    snapshot,
    snapshot.unit.hex,
    focusHex,
    input,
    modifiers,
    1,
    strongholds
  );
  const entrenchHeadroom = Math.max(0, 2 - (snapshot.unit.entrench ?? 0));
  const score = approachScore
    + INFANTRY_CONSOLIDATION_BONUS
    + entrenchHeadroom * 4
    + (terrain?.blocksLOS ? 3 : 0)
    + ((terrain?.defense ?? 0) >= 2 ? 2 : 0)
    + (onObjective ? 5 : 0)
    + Math.max(0, PROXIMITY_ENGAGE_RADIUS + 1 - nearestEnemyDistance) * 0.8;

  return {
    destination: snapshot.unit.hex,
    path: [snapshot.unit.hex],
    attackTarget: null,
    fieldAction: "digIn",
    expectedDamage: 0,
    expectedRetaliation: 0,
    score,
    rationale: onObjective ? "Consolidate objective and dig in" : "Consolidate in cover and dig in"
  };
}

/**
 * Scores the safety and cohesion of a non-attack destination so the bot stages whole groups instead of lone probes.
 * This rewards covered, mutually supporting approaches and penalizes exposed lunges that end outside a fighting posture.
 */
function calculateApproachPositionScore(
  snapshot: PlannerUnitSnapshot,
  destination: Axial,
  focusHex: Axial | null,
  input: BotPlannerInput,
  modifiers: DifficultyModifiers,
  pathLength = 1,
  strongholds: readonly StrongholdProfile[] = []
): number {
  if (!modifiers.useTacticalAI) {
    return 0;
  }

  const terrain = input.map.terrainAt(destination);
  const selfKey = axialKey(snapshot.unit.hex);
  const supportDistances = input.botUnits
    .filter((ally) => axialKey(ally.unit.hex) !== selfKey)
    .map((ally) => hexDistance(ally.unit.hex, destination));
  const nearbySupport = supportDistances.filter((distance) => distance <= SUPPORT_RANGE).length;
  const nearestSupportDistance = supportDistances.length > 0 ? Math.min(...supportDistances) : Number.POSITIVE_INFINITY;
  const combatSupportDistances = input.botUnits
    .filter((ally) => axialKey(ally.unit.hex) !== selfKey && ally.definition.class !== "recon" && ally.definition.moveType !== "air")
    .map((ally) => hexDistance(ally.unit.hex, destination));
  const nearbyCombatSupport = combatSupportDistances.filter((distance) => distance <= SUPPORT_RANGE).length;
  const nearestCombatSupportDistance = combatSupportDistances.length > 0
    ? Math.min(...combatSupportDistances)
    : Number.POSITIVE_INFINITY;
  const nearestEnemyDistance = input.playerUnits.reduce(
    (min, enemy) => Math.min(min, hexDistance(destination, enemy.unit.hex)),
    Number.POSITIVE_INFINITY
  );

  const rangeMin = snapshot.definition.rangeMin ?? 1;
  const rangeMax = snapshot.definition.rangeMax ?? 1;
  const focusDistance = focusHex ? hexDistance(destination, focusHex) : Number.POSITIVE_INFINITY;
  const inAttackBand = focusHex ? distanceToAttackBand(focusDistance, rangeMin, rangeMax) === 0 : false;
  const originTurnsToAttack = focusHex
    ? estimateTurnsToAttackWindow(snapshot.definition, snapshot.unit.hex, focusHex, input)
    : 0;
  const destinationTurnsToAttack = focusHex
    ? estimateTurnsToAttackWindow(snapshot.definition, destination, focusHex, input)
    : 0;
  const turnGain = originTurnsToAttack - destinationTurnsToAttack;
  const wantsCoveredApproach = requiresDirectLOS(snapshot.definition)
    || snapshot.definition.class === "recon"
    || isArmoredGroundUnit(snapshot.definition);
  const terrainCost = input.map.movementCost(destination, snapshot.definition.moveType);
  const threatEnvelope = calculateApproachThreatEnvelope(snapshot, destination, input, focusHex, inAttackBand);
  const visibleThreats = threatEnvelope.visible;
  const directImmediateThreats = threatEnvelope.directImmediate;
  const directNearThreats = threatEnvelope.directNear;
  const indirectImmediateThreats = threatEnvelope.indirectImmediate;
  const weightedThreatExposure = directImmediateThreats + directNearThreats * 0.6 + indirectImmediateThreats * 0.4;

  let score = calculateTerrainPositionScore(destination, terrain, false);
  const relevantSupportCount = snapshot.definition.class === "recon" ? nearbyCombatSupport : nearbySupport;
  const relevantSupportDistance = snapshot.definition.class === "recon" ? nearestCombatSupportDistance : nearestSupportDistance;

  if (terrain?.blocksLOS && nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS + 2) {
    score += BLOCKING_TERRAIN_APPROACH_BONUS;
    if (isArmoredGroundUnit(snapshot.definition)) {
      score += 4;
    }
  }

  if (turnGain > 0) {
    score += turnGain * TIME_TO_TARGET_BONUS;
  } else if (pathLength > 1 && focusHex && !inAttackBand) {
    score -= STALLED_APPROACH_PENALTY;
  }

  if (relevantSupportCount > 0) {
    score += Math.min(relevantSupportCount, 3) * ASSAULT_SUPPORT_BONUS;
  } else if (nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS + 2 && snapshot.definition.class !== "artillery") {
    score -= LONE_ADVANCE_PENALTY;
    if (Number.isFinite(relevantSupportDistance)) {
      score -= Math.max(0, relevantSupportDistance - SUPPORT_RANGE) * 1.5;
    }
  }

  if (wantsCoveredApproach) {
    if (directImmediateThreats === 0 && directNearThreats === 0 && nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS + 2) {
      score += MASKED_APPROACH_BONUS;
    } else if (!inAttackBand) {
      score -= weightedThreatExposure * EXPOSED_APPROACH_PENALTY;
      if (directImmediateThreats > 1) {
        // Multiple open firing lanes are where piecemeal pushes get chewed up. Penalize them sharply.
        score -= (directImmediateThreats - 1) * 4;
      }
      if (directNearThreats > 0) {
        score -= directNearThreats * 2;
      }
    } else if (directImmediateThreats > 1) {
      score -= (directImmediateThreats - 1) * 2;
    }
  }

  if (snapshot.definition.class === "infantry" || snapshot.definition.class === "specialist") {
    if (!inAttackBand) {
      if (terrain?.blocksLOS || (terrain?.defense ?? 0) >= 2 || weightedThreatExposure === 0) {
        score += INFANTRY_COVER_MARCH_BONUS;
      } else if (directImmediateThreats > 0) {
        score -= directImmediateThreats * INFANTRY_EXPOSED_MARCH_PENALTY;
      } else if (directNearThreats > 0) {
        score -= directNearThreats * (INFANTRY_EXPOSED_MARCH_PENALTY * 0.5);
      }

      if (turnGain > 0 && directImmediateThreats === 0 && directNearThreats <= 1 && terrainCost <= 1) {
        score += SAFE_TEMPO_APPROACH_BONUS;
      }
      if (terrainCost > 1 && nearestEnemyDistance > PROXIMITY_ENGAGE_RADIUS + 1) {
        if (!terrain?.blocksLOS && (terrain?.defense ?? 0) < 2) {
          score -= (terrainCost - 1) * SLOW_TERRAIN_TEMPO_PENALTY;
        } else if (turnGain <= 0) {
          score -= (terrainCost - 1) * (SLOW_TERRAIN_TEMPO_PENALTY - 1);
        }
      }
    }
  }

  if (isArmoredGroundUnit(snapshot.definition)) {
    if (!inAttackBand && !terrain?.blocksLOS) {
      score -= directImmediateThreats * 10 + directNearThreats * 3;
      if (directImmediateThreats > 0 && indirectImmediateThreats > 0) {
        score -= indirectImmediateThreats * 5;
      }
      if (directImmediateThreats > 0 && destinationTurnsToAttack > 0) {
        score -= 4;
      }
    }
    if (!inAttackBand && directImmediateThreats + directNearThreats > nearbySupport) {
      score -= (directImmediateThreats + directNearThreats - nearbySupport) * 6;
    }
    const alliedArmorTurnBand = input.botUnits
      .filter((ally) => axialKey(ally.unit.hex) !== selfKey && isArmoredGroundUnit(ally.definition))
      .map((ally) => {
        const allyTurns = focusHex
          ? estimateTurnsToAttackWindow(ally.definition, ally.unit.hex, focusHex, input)
          : 0;
        return Math.abs(destinationTurnsToAttack - allyTurns);
      });
    const closestArmorTimingGap = alliedArmorTurnBand.length > 0
      ? Math.min(...alliedArmorTurnBand)
      : Number.POSITIVE_INFINITY;

    if (nearbySupport > 0) {
      score += 2;
    }
    if (closestArmorTimingGap <= 1) {
      score += ARMORED_UNIFIED_FRONT_BONUS;
    } else if (Number.isFinite(closestArmorTimingGap) && destinationTurnsToAttack < originTurnsToAttack) {
      score -= ARMORED_OUTRUN_SUPPORT_PENALTY + (closestArmorTimingGap - 1) * 2;
    }
  }

  score += calculateReconPositioningScore(destination, snapshot, input, focusHex);
  score += calculateStrongholdApproachAdjustment(snapshot, destination, focusHex, input, strongholds);

  return score;
}

/**
 * Calculates bonus for moving to or holding objective hexes.
 * Returns a high score for occupying objectives, scaled by difficulty and VP value.
 */
function scoreObjectiveControl(
  destination: Axial,
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[],
  occupancy: ReadonlyMap<string, "bot" | "player">,
  modifiers: DifficultyModifiers
): number {
  if (objectives.length === 0) {
    return 0;
  }

  const destKey = axialKey(destination);

  // Check if destination is an objective hex
  for (const objective of objectives) {
    const objKey = axialKey(objective.hex);
    if (objKey !== destKey) {
      continue;
    }

    // Found an objective at this destination
    const currentOccupant = occupancy.get(objKey);
    let bonus = OBJECTIVE_CONTROL_BONUS;

    // Scale by VP value
    bonus += objective.vp * 0.2;

    // Extra bonus if currently unoccupied or player-controlled (needs contesting)
    if (!currentOccupant || currentOccupant === "player") {
      bonus += 10;
    }

    // Apply difficulty scaling
    bonus *= modifiers.objectiveWeight;

    return bonus;
  }

  return 0;
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

  const purposeBonus = calculatePurposeBonus(purpose, defender);
  const strategicTargetBonus = calculateStrategicTargetBonus(defender);

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

  return damageScore
    + purposeBonus
    + strategicTargetBonus
    + attackOpportunityBonus
    + mobilityPenalty
    + tacticalBonus
    - retaliationPenalty;
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
  modifiers: DifficultyModifiers,
  strongholds: readonly StrongholdProfile[] = []
): number {
  // Get base score
  let score = scoreCandidate(purpose, attacker, defender, candidate, modifiers);
  score += calculateContextualTargetPriorityBonus(purpose, defender, input, strongholds) - calculateTargetPriorityBonus(purpose, defender);

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

  // Recon units should be rewarded for unique spotting lanes and punished for clustered or overexposed endpoints.
  score += calculateReconPositioningScore(candidate.destination, attacker, input, defender?.unit.hex ?? null);

  // Objective control bonus - prioritize holding objectives
  score += scoreObjectiveControl(
    candidate.destination,
    input.objectives,
    input.occupancy,
    modifiers
  );

  return score;
}

/**
 * Adds non-attack movement options so units can advance toward objectives when no shot is available.
 * Prioritizes actually reaching and occupying objective hexes.
 */
function scoreObjectiveAdvance(
  snapshot: PlannerUnitSnapshot,
  origin: Axial,
  reachable: Map<string, ReachableHex>,
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[],
  occupancy: ReadonlyMap<string, "bot" | "player">,
  input: BotPlannerInput,
  modifiers: DifficultyModifiers,
  strongholds: readonly StrongholdProfile[]
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
    let score = OBJECTIVE_APPROACH_BONUS + objective.vp * 0.5 + distanceReduction * 2;

    // Large bonus if we're actually reaching the objective hex
    const destKey = axialKey(option.hex);
    if (destKey === key) {
      score += OBJECTIVE_CONTROL_BONUS * modifiers.objectiveWeight;

      const currentOccupant = occupancy.get(key);
      // Extra bonus for contesting unoccupied or player-controlled objectives
      if (!currentOccupant || currentOccupant === "player") {
        score += 10 * modifiers.objectiveWeight;
      }
    }

    if (!best || score > best.score) {
      best = {
        destination: option.hex,
        path: option.path,
        attackTarget: null,
        expectedDamage: 0,
        expectedRetaliation: 0,
        score: score + calculateApproachPositionScore(snapshot, option.hex, objective.hex, input, modifiers, option.path.length, strongholds),
        rationale: destKey === key
          ? `Occupy objective worth ${objective.vp} VP`
          : `Advance to objective worth ${objective.vp} VP`
      };
    }
  });
  return best;
}

/**
 * When a unit cannot justify an immediate shot, look for the best staging hex to threaten a valuable target
 * on the following turn. This fills the gap between "attack now" and "march at the nearest thing."
 */
function scoreFireSetup(
  snapshot: PlannerUnitSnapshot,
  reachable: Map<string, ReachableHex>,
  enemies: readonly PlannerUnitSnapshot[],
  input: BotPlannerInput,
  modifiers: DifficultyModifiers,
  strongholds: readonly StrongholdProfile[]
): ActionCandidate | null {
  if (enemies.length === 0) {
    return null;
  }

  const purpose = classifyUnitPurpose(snapshot.definition);
  if (purpose === "recon") {
    return null;
  }
  const rangeMin = snapshot.definition.rangeMin ?? 1;
  const rangeMax = snapshot.definition.rangeMax ?? 1;
  if (rangeMax <= 0) {
    return null;
  }

  const nextTurnMoveAllowance = resolveTacticalMoveRate(snapshot.definition);
  const requiresLos = requiresDirectLOS(snapshot.definition);
  let best: ActionCandidate | null = null;

  const evaluateSetupPosition = (
    hex: Axial,
    path: readonly Axial[],
    enemy: PlannerUnitSnapshot
  ): { score: number; rangeGap: number; futureGap: number; hasLos: boolean; turnsToAttack: number } => {
    const terrain = input.map.terrainAt(hex);
    const nearestEnemyDistance = enemies.reduce(
      (min, other) => Math.min(min, hexDistance(hex, other.unit.hex)),
      Number.POSITIVE_INFINITY
    );
    const distance = hexDistance(hex, enemy.unit.hex);
    const rangeGap = distanceToAttackBand(distance, rangeMin, rangeMax);
    const futureGap = Math.max(0, rangeGap - nextTurnMoveAllowance);
    const hasLos = !requiresLos || input.losAllows(hex, enemy.unit.hex, false);
    const turnsToAttack = estimateTurnsToAttackWindow(snapshot.definition, hex, enemy.unit.hex, input);

    let score = FIRE_SETUP_BASE_BONUS
      + calculateContextualTargetPriorityBonus(purpose, enemy, input, strongholds)
      + calculateThreatProjection(enemy) * 0.2
      - rangeGap * FIRE_SETUP_RANGE_GAP_PENALTY
      - futureGap * FIRE_SETUP_FUTURE_GAP_PENALTY
      - turnsToAttack * TIME_TO_TARGET_BONUS * 0.7
      - (path.length - 1) * 0.75;

    if (futureGap === 0) {
      score += FIRE_SETUP_READY_BONUS;
    }

    const setupThreatEnvelope = calculateApproachThreatEnvelope(snapshot, hex, input, enemy.unit.hex, rangeGap === 0);
    if (
      isArmoredGroundUnit(snapshot.definition)
      && rangeGap > 0
      && !terrain?.blocksLOS
      && setupThreatEnvelope.directImmediate > 0
    ) {
      score -= setupThreatEnvelope.directImmediate * 14 + setupThreatEnvelope.indirectImmediate * 4;
    }
    if (
      requiresLos
      && rangeGap > 0
      && terrain?.blocksLOS
      && setupThreatEnvelope.directImmediate === 0
    ) {
      score += FIRE_SETUP_MASKED_STAGING_BONUS;
    }

    // Direct-fire units should not stage onto hexes that still leave the target masked next turn.
    score += hasLos ? FIRE_SETUP_LOS_BONUS : -FIRE_SETUP_NO_LOS_PENALTY;
    score += calculateTerrainPositionScore(hex, terrain, false);
    score += calculateArtilleryPositionScore(hex, nearestEnemyDistance, snapshot, enemy, modifiers);
    score += calculateApproachPositionScore(snapshot, hex, enemy.unit.hex, input, modifiers, path.length, strongholds);

    return { score, rangeGap, futureGap, hasLos, turnsToAttack };
  };

  for (const enemy of enemies) {
    if (!canPotentiallyAttackTarget(snapshot, enemy)) {
      continue;
    }
    const immediateOriginAttack = input.attackEstimator(snapshot, snapshot.unit.hex, enemy, enemy.unit.hex);
    if (immediateOriginAttack) {
      continue;
    }

    const originEvaluation = evaluateSetupPosition(snapshot.unit.hex, [snapshot.unit.hex], enemy);
    if (originEvaluation.turnsToAttack <= 1 && originEvaluation.futureGap === 0 && originEvaluation.hasLos) {
      const holdCandidate: ActionCandidate = {
        destination: snapshot.unit.hex,
        path: [snapshot.unit.hex],
        attackTarget: null,
        expectedDamage: 0,
        expectedRetaliation: 0,
        score: originEvaluation.score,
        rationale: `Hold fire lane on ${describePriorityTarget(enemy)}`
      };

      if (!best || holdCandidate.score > best.score) {
        best = holdCandidate;
      }
    }

    for (const option of reachable.values()) {
      if (option.path.length <= 1) {
        continue;
      }

      const evaluation = evaluateSetupPosition(option.hex, option.path, enemy);
      if (evaluation.turnsToAttack > 1) {
        continue;
      }
      const rangeImprovement = originEvaluation.rangeGap - evaluation.rangeGap;
      const futureImprovement = originEvaluation.futureGap - evaluation.futureGap;
      const losImprovement = (evaluation.hasLos ? 1 : 0) - (originEvaluation.hasLos ? 1 : 0);
      const turnImprovement = originEvaluation.turnsToAttack - evaluation.turnsToAttack;

      // If the move does not improve attack timing or LOS, it is just churn and should not compete.
      if (rangeImprovement <= 0 && futureImprovement <= 0 && losImprovement <= 0 && turnImprovement <= 0) {
        continue;
      }

      let score = evaluation.score
        + rangeImprovement * 6
        + futureImprovement * 10
        + losImprovement * 8
        + turnImprovement * 14;

      const candidate: ActionCandidate = {
        destination: option.hex,
        path: option.path,
        attackTarget: null,
        expectedDamage: 0,
        expectedRetaliation: 0,
        score,
        rationale: `Stage for ${describePriorityTarget(enemy)}`
      };

      if (option.path.length > 1) {
        candidate.score += STEERING_TIE_BIAS * steeringBias(snapshot.unit.hex, option.path[1], enemy.unit.hex);
      }

      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
  }

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
  allowEnemyEliminationFallback: boolean,
  strongholds: readonly StrongholdProfile[]
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
  const pressureTargets = globallySpottedPlayers.length > 0 ? globallySpottedPlayers : input.playerUnits;
  const consolidationFocus = pressureTargets.reduce<PlannerUnitSnapshot | null>((best, enemy) => {
    if (!best) {
      return enemy;
    }
    const bestDistance = hexDistance(snapshot.unit.hex, best.unit.hex);
    const enemyDistance = hexDistance(snapshot.unit.hex, enemy.unit.hex);
    if (enemyDistance !== bestDistance) {
      return enemyDistance < bestDistance ? enemy : best;
    }
    return calculateContextualTargetPriorityBonus(purpose, enemy, input, strongholds)
      > calculateContextualTargetPriorityBonus(purpose, best, input, strongholds)
      ? enemy
      : best;
  }, null);

  for (const playerSnapshot of input.playerUnits) {
    const rangeMax = snapshot.definition.rangeMax ?? 1;
    const rangeMin = snapshot.definition.rangeMin ?? 1;

    for (const option of reachable.values()) {
      // Artillery cannot move and fire in the same activation. Evaluating a mobile
      // firing hex produced plans whose move succeeded and whose attack was then
      // rejected by the engine, causing batteries to creep toward the front.
      if (purpose === "artillery" && axialKey(option.hex) !== axialKey(snapshot.unit.hex)) {
        continue;
      }
      const distance = hexDistance(option.hex, playerSnapshot.unit.hex);
      if (distance < rangeMin || distance > rangeMax) {
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
        ? scoreCandidateAdvanced(purpose, snapshot, playerSnapshot, candidate, input, difficultyMods, strongholds)
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

  if (purpose === "artillery") {
    const displacement = scoreArtilleryHoldOrDisplace(
      snapshot,
      reachable,
      input.playerUnits,
      input,
      difficultyMods,
      strongholds
    );
    if (displacement && (!top || displacement.score > top.score)) {
      top = displacement;
    }
    return top ?? {
      destination: snapshot.unit.hex,
      path: [snapshot.unit.hex],
      attackTarget: null,
      expectedDamage: 0,
      expectedRetaliation: 0,
      score: 0,
      rationale: "Hold long-range firing position"
    };
  }

  const setupCandidate = scoreFireSetup(snapshot, reachable, pressureTargets, input, difficultyMods, strongholds);
  if (setupCandidate && (allowEnemyEliminationFallback || enemyNearOrVisible)) {
    if (enemyNearOrVisible) {
      setupCandidate.score += difficultyMods.contactEngageBonus + Math.max(0, PROXIMITY_ENGAGE_RADIUS - nearestEnemyDistance);
    }
    if (!top || setupCandidate.score > top.score) {
      top = setupCandidate;
    }
  }

  const consolidationCandidate = scoreInfantryConsolidation(
    snapshot,
    input,
    difficultyMods,
    consolidationFocus?.unit.hex ?? null,
    strongholds
  );
  if (consolidationCandidate && (!top || consolidationCandidate.score > top.score)) {
    top = consolidationCandidate;
  }

  const shouldCompareMovementPlans = shouldCompareMarchPlans(snapshot, top, nearestEnemyDistance);
  const rearUnitNeedsObjectiveMarch = shouldCompareMovementPlans && activeObjectives.length > 0;

  // Consider movement toward objectives when no attack is available or when a rear unit only found a distant staging idea.
  if (shouldCompareMovementPlans) {
    let bestObjectiveCandidate: ActionCandidate | null = null;
    let bestObjectiveScore = Number.NEGATIVE_INFINITY;
    const advanceCandidate = scoreObjectiveAdvance(snapshot, snapshot.unit.hex, reachable, activeObjectives, input.occupancy, input, difficultyMods, strongholds);
    if (advanceCandidate && advanceCandidate.score > bestObjectiveScore) {
      bestObjectiveCandidate = advanceCandidate;
      bestObjectiveScore = advanceCandidate.score;
    }
    if (shouldCompareMarchPlans(snapshot, top, nearestEnemyDistance)) {
      const approachCandidate = scoreObjectiveApproach(snapshot, snapshot.unit.hex, reachable, activeObjectives, input.occupancy, input, difficultyMods, strongholds);
      if (approachCandidate && approachCandidate.score > bestObjectiveScore) {
        bestObjectiveCandidate = approachCandidate;
        bestObjectiveScore = approachCandidate.score;
      }
    }
    if (bestObjectiveCandidate) {
      if (rearUnitNeedsObjectiveMarch && isPassiveStagingCandidate(top)) {
        top = bestObjectiveCandidate;
      } else if (bestObjectiveCandidate.score > (top?.score ?? Number.NEGATIVE_INFINITY)) {
        top = bestObjectiveCandidate;
      }
    }
    // Engage nearby/visible enemies even when objectives exist; otherwise fall back to elimination goal
    // only when no contested objectives remain.
    if ((allowEnemyEliminationFallback || enemyNearOrVisible)
      && !rearUnitNeedsObjectiveMarch
      && shouldCompareMarchPlans(snapshot, top, nearestEnemyDistance)) {
      const pressureCandidate = scoreEnemyPressure(snapshot, reachable, pressureTargets, input, difficultyMods, strongholds);
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
  if ((allowEnemyEliminationFallback || enemyNearOrVisible) && !rearUnitNeedsObjectiveMarch && isObjectiveCandidate(top)) {
    const pressureCandidate = scoreEnemyPressure(snapshot, reachable, pressureTargets, input, difficultyMods, strongholds);
    if (pressureCandidate && enemyNearOrVisible) {
      // Apply difficulty-based contact engagement bonus
      pressureCandidate.score += difficultyMods.contactEngageBonus + Math.max(0, PROXIMITY_ENGAGE_RADIUS - nearestEnemyDistance);
    }
    if (pressureCandidate && (!top || pressureCandidate.score > top.score)) {
      top = pressureCandidate;
    }
  }

  // Final fallback: move toward nearest enemy even if we can't reach/attack them this turn
  // This prevents units from getting stuck when they can't find valid attack positions
  if (!top || top.score <= 0) {
    const fallbackPressure = scoreEnemyPressure(snapshot, reachable, input.playerUnits, input, difficultyMods, strongholds);
    if (fallbackPressure && (!top || fallbackPressure.score > top.score)) {
      top = fallbackPressure;
    }
  }

  if (purpose === "recon" && top && top.score < 0) {
    top = {
      destination: snapshot.unit.hex,
      path: [snapshot.unit.hex],
      attackTarget: null,
      expectedDamage: 0,
      expectedRetaliation: 0,
      score: 0,
      rationale: "Hold scouting screen"
    };
  }

  // Only hold position if literally no movement is possible
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
  const strongholds = buildStrongholdProfiles(activeObjectives, input);
  const eliminationObjectiveEnabled = activeObjectives.length === 0;
  input.botUnits.forEach((snapshot) => {
    const allowance = Math.max(0, input.movementAllowance(snapshot));
    const originKey = axialKey(snapshot.unit.hex);
    const reachable = computeReachableHexes(snapshot.unit.hex, allowance, snapshot.definition.moveType, input, originKey);
    const bestCandidate = pickBestCandidate(snapshot, input, reachable, activeObjectives, eliminationObjectiveEnabled, strongholds);
    if (bestCandidate) {
      actions.push({
        unit: snapshot,
        unitKey: originKey,
        origin: snapshot.unit.hex,
        destination: bestCandidate.destination,
        path: bestCandidate.path,
        attackTarget: bestCandidate.attackTarget,
        fieldAction: bestCandidate.fieldAction ?? null,
        expectedDamage: bestCandidate.expectedDamage,
        expectedRetaliation: bestCandidate.expectedRetaliation,
        score: bestCandidate.score,
        rationale: bestCandidate.rationale
      });
    }
  });

  return actions.sort((a, b) => b.score - a.score);
}
