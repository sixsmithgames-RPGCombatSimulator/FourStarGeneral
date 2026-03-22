/**
 * Core combat helpers implement the shared damage and accuracy math described in the rules brief.
 * Keeping these routines here ensures every caller (preview UI, AI sims, persistence) references
 * identical logic that is parameterized by the values in `balance.ts`.
 */
import { combat as combatBalance, HEX_SCALE_METERS } from "./balance";
import type { Axial } from "./Hex";
import { axialDirections, hexDistance, subtract } from "./Hex";
import type { TerrainDefinition, UnitClass, UnitTypeDefinition } from "./types";
import type { ScenarioUnit } from "./types";
import { getCombatProfile, type CombatProfileDefinition } from "../data/combatProfiles";

/** Facing strings reused from `ScenarioUnit`. */
export type Facing = ScenarioUnit["facing"];

/** Simple helper because the combat math calls for repeated clamping. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolves the combat profile a unit should use for range, volume-of-fire, and damage tables.
 * Uses the new hierarchical combat classification system for more precise tuning.
 */
function resolveCombatProfile(unit: UnitTypeDefinition): CombatProfileDefinition {
  return getCombatProfile(unit.combat);
}

function resolveAccuracyScalar(unit: UnitTypeDefinition, profile: CombatProfileDefinition): number {
  const reference = profile.accuracyReference;
  if (!Number.isFinite(reference) || reference <= 0) {
    return 1;
  }
  return Math.max(0.25, unit.accuracyBase / reference);
}

function resolveAttackScalar(
  unit: UnitTypeDefinition,
  profile: CombatProfileDefinition,
  isSoftTarget: boolean
): number {
  const attackValue = isSoftTarget ? unit.softAttack : unit.hardAttack;
  if (!Number.isFinite(attackValue) || attackValue <= 0) {
    return 0;
  }
  const reference = isSoftTarget
    ? profile.softAttackReference
    : profile.hardAttackReference;
  if (!Number.isFinite(reference) || reference <= 0) {
    return 1;
  }
  return Math.max(0, attackValue / reference);
}

/**
 * General stats required for combat calculations. We avoid importing full profile objects so the
 * helpers remain lightweight and easy to unit-test.
 */
export interface GeneralCombatStats {
  accBonus: number;
  dmgBonus: number;
}

/**
 * Runtime combat state for one unit. We only capture the fields the resolution formulas need.
 * Strength is now a percentage (0-100) representing combat effectiveness.
 */
export interface UnitCombatState {
  unit: UnitTypeDefinition;
  strength: number;  // Percentage: 0-100 (100 = full strength, 0 = destroyed)
  experience: number;
  general: GeneralCombatStats;
}

/**
 * Defender context describing the tile modifiers and facing needed for armor resolution.
 */
export interface DefenderContext {
  terrain: TerrainDefinition;
  class: UnitClass;
  facing: Facing;
  hex: Axial;
  isRushing?: boolean; // Infantry rushing loses terrain cover
  isSpottedOnly?: boolean; // Target visible only via aircraft/recon spotting (no direct LOS)
  stance?: "assault" | "suppressive" | "digIn"; // Combat stance (infantry only)
  fortified?: boolean; // Hex has fortifications built by engineers (improves cover for infantry)
}

/**
 * Attacker context mirrors the defender details and keeps positional references for distance math.
 */
export interface AttackerContext {
  hex: Axial;
  stance?: "assault" | "suppressive" | "digIn"; // Combat stance (infantry only)
}

/**
 * Collected request for a combat preview or resolution pass. `isSoftTarget` controls whether soft or
 * hard attack stats are consulted when computing damage.
 */
export interface AttackRequest {
  attacker: UnitCombatState;
  defender: UnitCombatState;
  attackerCtx: AttackerContext;
  defenderCtx: DefenderContext;
  targetFacing: Facing;
  isSoftTarget: boolean;
}

/**
 * Result bundle returned by `resolveAttack()`. It exposes core metrics used by UI previews and AI
 * decision-making.
 */
export interface AccuracyBreakdown {
  readonly baseRange: number;
  readonly experienceBonus: number;
  readonly commanderScalar: number;
  readonly baseWithCommander: number;
  readonly experienceWithCommander: number;
  readonly combinedAfterCommander: number;
  readonly terrainModifier: number;
  readonly terrainMultiplier: number;
  readonly afterTerrain: number;
  readonly spottedMultiplier: number;
  readonly finalPreClamp: number;
  readonly final: number;
}

export interface DamageBreakdown {
  readonly baseTableValue: number;
  readonly experienceScalar: number;
  readonly afterExperience: number;
  readonly commanderScalar: number;
  readonly final: number;
}

export interface AttackResult {
  accuracy: number;
  shots: number;
  damagePerHit: number;
  expectedHits: number;
  expectedDamage: number;
  expectedSuppression: number;
  effectiveAP: number;
  facingArmor: number;
  accuracyBreakdown: AccuracyBreakdown;
  damageBreakdown: DamageBreakdown;
}

/** Maps facing strings to direction indices in the axial direction table. */
const FACING_TO_INDEX: Record<Facing, number> = {
  N: 0,
  NE: 1,
  SE: 2,
  S: 3,
  SW: 4,
  NW: 5
};

/**
 * Convert a vector into a direction index by taking the closest axial direction. This supports the
 * armor facing heuristic without relying on floating-point angles.
 */
function directionIndex(from: Axial, to: Axial): number {
  const diff = subtract(to, from);
  let bestIndex = 0;
  let bestScore = -Infinity;
  axialDirections.forEach((dir, index) => {
    const score = diff.q * dir.q + diff.r * dir.r;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/**
 * Interpolates accuracy from range-based table for a given unit class.
 * Uses linear interpolation between defined range points.
 */
function getBaseAccuracyByRange(profile: CombatProfileDefinition, distance: number): number {
  const table = profile.rangeAccuracy;

  // If no range table or empty, return a safe default
  if (!table || table.length === 0) {
    return 50; // Default 50% base accuracy
  }

  // Find the range bracket
  for (let i = 0; i < table.length; i++) {
    const current = table[i];

    if (distance <= current.range) {
      // If this is the first entry or exact match, return it
      if (i === 0) return current.accuracy;

      // Interpolate between previous and current
      const prev = table[i - 1];
      const ratio = (distance - prev.range) / (current.range - prev.range);
      return prev.accuracy + ratio * (current.accuracy - prev.accuracy);
    }
  }

  // Beyond max range, use last value
  return table[table.length - 1].accuracy;
}

/**
 * Table look-up for terrain accuracy modifiers. Centralizing it allows future logic (e.g. weather)
 * to hook in without rewriting callers. Rushing infantry lose terrain cover (no bonus).
 * Fortifications built by engineers improve cover for infantry-type units.
 */
export function terrainAccMod(terrain: TerrainDefinition | null | undefined, isRushing?: boolean, fortified?: boolean, defenderClass?: UnitClass): number {
  // Rushing units lose terrain cover
  if (isRushing) return 0;

  let baseMod = terrain?.accMod ?? 0;

  // Fortifications provide +15% cover bonus for infantry-type units
  if (fortified && defenderClass && ["infantry", "recon", "specialist"].includes(defenderClass)) {
    baseMod += 15;
  }

  return baseMod;
}

/**
 * Determine which armor value should apply based on relative hex positions and the defender's
 * stated facing. Artillery and air attackers follow the "top" heuristic defined in the balance
 * document.
 */
export function pickFacingArmor(
  attackerHex: Axial,
  defenderHex: Axial,
  defenderFacing: Facing,
  defenderUnit: UnitTypeDefinition,
  attackerClass: UnitClass
): number {
  if (combatBalance.penetration.topAttackClasses.has(attackerClass)) {
    return defenderUnit.armor.top;
  }

  const defenderFacingIndex = FACING_TO_INDEX[defenderFacing];
  const inboundIndex = directionIndex(defenderHex, attackerHex);
  const delta = (inboundIndex - defenderFacingIndex + axialDirections.length) % axialDirections.length;

  if (delta === 0) {
    return defenderUnit.armor.front;
  }

  return defenderUnit.armor.side;
}

/**
 * Calculate raw accuracy for the engagement using realistic WWII hit probability tables.
 *
 * New system (realistic):
 * 1. Look up base accuracy from range/class table (interpolated)
 * 2. Add experience bonus (+3% per star)
 * 3. Apply target signature modifier (tiny/small/medium/large affects exposed area)
 * 4. Add terrain modifier (defender in cover is harder to hit)
 * 5. Apply commander bonus as percentage multiplier
 * 6. Clamp to min/max bounds after range, terrain, and spotting adjustments
 */
export function calculateAccuracy(request: AttackRequest): AccuracyBreakdown {
  const attacker = request.attacker;
  const defender = request.defender;
  const defenderCtx = request.defenderCtx;
  const attackerCtx = request.attackerCtx;
  const combatProfile = resolveCombatProfile(attacker.unit);
  let distance = hexDistance(attackerCtx.hex, defenderCtx.hex);

  // If attacker is using assault stance, engagement happens at close range (0-50m, use 25m midpoint)
  const isAssault = attackerCtx.stance === "assault";
  const ASSAULT_CLOSE_RANGE_METERS = 25;
  if (isAssault) {
    distance = ASSAULT_CLOSE_RANGE_METERS / HEX_SCALE_METERS;
  }

  // Step 1: Get realistic base accuracy from range table
  const rangeAccuracy = getBaseAccuracyByRange(combatProfile, distance);
  const baseAccuracy = rangeAccuracy * resolveAccuracyScalar(attacker.unit, combatProfile);

  // Step 2: Add experience bonus
  const experienceBonus = attacker.experience * combatBalance.accuracy.expPerStar;
  const commanderAccuracyBonus = attacker.general.accBonus ?? 0;
  const commanderScalar = 1 + (commanderAccuracyBonus * combatBalance.accuracy.commanderScalar);

  // Apply commander bonus to base and experience components individually.
  const baseWithCommander = baseAccuracy * commanderScalar;
  const experienceWithCommander = experienceBonus * commanderScalar;
  const combinedAfterCommander = baseWithCommander + experienceWithCommander;

  // Step 3: Apply target signature modifier
  // Smaller signatures are harder to hit, larger signatures are easier to hit
  const defenderSignature = defender.unit.combat.signature;
  const signatureMultipliers = {
    tiny: 0.7,    // -30% hit chance (very hard to hit)
    small: 0.85,  // -15% hit chance
    medium: 1.0,  // baseline
    large: 1.15   // +15% hit chance
  };
  const signatureMultiplier = signatureMultipliers[defenderSignature] ?? 1.0;
  const afterSignature = combinedAfterCommander * signatureMultiplier;

  // Step 4: Apply terrain modifier multiplicatively.
  const terrainMod = terrainAccMod(defenderCtx.terrain, defenderCtx.isRushing, defenderCtx.fortified, defenderCtx.class);
  const terrainMultiplier = 1 + terrainMod / 100;
  const afterTerrain = afterSignature * terrainMultiplier;

  // Step 5: Apply spotted target penalty as multiplier
  const spottedMultiplier = defenderCtx.isSpottedOnly ? 0.5 : 1.0;
  let afterSpotted = afterTerrain * spottedMultiplier;

  // Assault already benefits from the forced 25m engagement range above; applying
  // a second multiplier here overstates close-assault lethality and breaks parity
  // between preview and expected battlefield outcomes.
  const finalPreClamp = afterSpotted;

  // Step 6: Clamp to bounds
  const finalAccuracy = clamp(finalPreClamp, combatBalance.accuracy.min, combatBalance.accuracy.max);

  return {
    baseRange: baseAccuracy,
    experienceBonus,
    commanderScalar,
    baseWithCommander,
    experienceWithCommander,
    combinedAfterCommander,
    terrainModifier: terrainMod,
    terrainMultiplier,
    afterTerrain,
    spottedMultiplier,
    finalPreClamp,
    final: finalAccuracy
  } satisfies AccuracyBreakdown;
}

/** Effective armor penetration value after experience bonuses. */
export function calculateEffectiveAP(attacker: UnitCombatState): number {
  return attacker.unit.ap + attacker.experience * combatBalance.penetration.starApBonus;
}

/**
 * Calculate shots fired based on unit's combat profile and current strength percentage.
 * Uses realistic shot counts from hierarchical combat profiles.
 */
export function calculateShots(attacker: UnitTypeDefinition, strengthPercent: number): number {
  const combatProfile = resolveCombatProfile(attacker);
  const fullStrengthShots = combatProfile.shotsPerTurn;
  return Math.round(fullStrengthShots * (strengthPercent / 100));
}

/**
 * Calculate damage per hit as percentage of target strength (0-100%).
 * Uses combat profile base damage with AP margin modifiers for armored targets.
 * New system:
 * - Base damage from combat profile
 * - Soft targets: use soft attack scalar directly
 * - Armored targets: apply AP margin modifier
 *   - margin >= 0: +5% per point of overpenetration
 *   - margin < 0: -15% per point of underpenetration
 */
export function calculateDamagePerHit(
  request: AttackRequest,
  effectiveAP: number,
  facingArmor: number
): DamageBreakdown {
  const { attacker, isSoftTarget } = request;
  const combatProfile = resolveCombatProfile(attacker.unit);
  const experienceScalar = 1 + attacker.experience * 0.1;
  const commanderDamageBonus = attacker.general.dmgBonus ?? 0;
  const damageScalar = 1 + (commanderDamageBonus);
  const softAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, true);
  const hardAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, false);

  // Get base damage from profile
  const baseDamage = combatProfile.baseDamagePerHit;
  let afterExperience = baseDamage * experienceScalar;

  // Apply attack type scalar (soft or hard)
  const attackScalar = isSoftTarget ? softAttackScalar : hardAttackScalar;
  let afterAttackType = afterExperience * attackScalar;

  // For armored targets, apply AP margin modifier
  let penetrationMarginScalar = 1;
  if (!isSoftTarget && facingArmor > 0) {
    const margin = effectiveAP - facingArmor;
    if (margin >= 0) {
      // Overpenetration: +5% damage per point
      penetrationMarginScalar = 1 + (margin * 0.05);
    } else {
      // Underpenetration: -15% damage per point
      penetrationMarginScalar = Math.max(0.1, 1 + (margin * 0.15)); // Floor at 10% to avoid complete negation
    }
  }

  const afterPenetration = afterAttackType * penetrationMarginScalar;
  const finalDamage = Math.max(0, afterPenetration * damageScalar);

  return {
    baseTableValue: baseDamage,
    experienceScalar,
    afterExperience,
    commanderScalar: damageScalar,
    final: finalDamage
  } satisfies DamageBreakdown;
}

/** Aggregate helper delivering the full combat math breakdown. */
export function resolveAttack(request: AttackRequest): AttackResult {
  const accuracyBreakdown = calculateAccuracy(request);
  const effectiveAP = calculateEffectiveAP(request.attacker);
  const facingArmor = pickFacingArmor(
    request.attackerCtx.hex,
    request.defenderCtx.hex,
    request.targetFacing,
    request.defender.unit,
    request.attacker.unit.class
  );
  const shots = calculateShots(request.attacker.unit, request.attacker.strength);
  const damageBreakdown = calculateDamagePerHit(request, effectiveAP, facingArmor);
  const expectedHits = (accuracyBreakdown.final / 100) * shots;
  const expectedDamage = expectedHits * damageBreakdown.final;

  // Use suppression from combat profile instead of global balance value
  const combatProfile = resolveCombatProfile(request.attacker.unit);
  const expectedSuppression = expectedHits * combatProfile.suppressionPerHit;

  return {
    accuracy: accuracyBreakdown.final,
    shots,
    damagePerHit: damageBreakdown.final,
    expectedHits,
    expectedDamage,
    expectedSuppression,
    effectiveAP,
    facingArmor,
    accuracyBreakdown,
    damageBreakdown
  };
}
