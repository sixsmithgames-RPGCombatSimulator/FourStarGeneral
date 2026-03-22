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

/** Facing strings reused from `ScenarioUnit`. */
export type Facing = ScenarioUnit["facing"];

/** Simple helper because the combat math calls for repeated clamping. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type CombatProfileKey = keyof typeof combatBalance.damage.shotsPerTurn;

/**
 * Resolves the combat profile a unit should use for range, volume-of-fire, and damage tables.
 * This lets formations like recon bikes keep their scouting role without inheriting the hotter
 * armored-car combat curve.
 */
function resolveCombatProfile(unit: UnitTypeDefinition): CombatProfileKey {
  if (unit.class === "recon" && unit.moveType === "wheel" && (unit.rangeMax ?? 1) <= 1 && unit.hardAttack <= 0) {
    return "infantry";
  }
  return unit.class as CombatProfileKey;
}

function resolveAccuracyScalar(unit: UnitTypeDefinition, profile: CombatProfileKey): number {
  const reference = combatBalance.profileReference.accuracyBase[profile] ?? unit.accuracyBase;
  if (!Number.isFinite(reference) || reference <= 0) {
    return 1;
  }
  return Math.max(0.25, unit.accuracyBase / reference);
}

function resolveAttackScalar(
  unit: UnitTypeDefinition,
  profile: CombatProfileKey,
  isSoftTarget: boolean
): number {
  const attackValue = isSoftTarget ? unit.softAttack : unit.hardAttack;
  if (!Number.isFinite(attackValue) || attackValue <= 0) {
    return 0;
  }
  const reference = isSoftTarget
    ? combatBalance.profileReference.softAttack[profile]
    : combatBalance.profileReference.hardAttack[profile];
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
function getBaseAccuracyByRange(unitClass: UnitClass, distance: number): number {
  const table = combatBalance.accuracy.baseByRange[unitClass];
  if (!table) {
    // Fallback to infantry table if class not found
    return combatBalance.accuracy.baseByRange.infantry[0].accuracy;
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
 * 3. Add terrain modifier (defender in cover is harder to hit)
 * 4. Apply commander bonus as percentage multiplier
 * 5. Clamp to min/max bounds after range, terrain, and spotting adjustments
 */
export function calculateAccuracy(request: AttackRequest): AccuracyBreakdown {
  const attacker = request.attacker;
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

  // Step 3: Apply terrain modifier multiplicatively.
  const terrainMod = terrainAccMod(defenderCtx.terrain, defenderCtx.isRushing, defenderCtx.fortified, defenderCtx.class);
  const terrainMultiplier = 1 + terrainMod / 100;
  const afterTerrain = combinedAfterCommander * terrainMultiplier;

  // Step 4: Apply spotted target penalty as multiplier
  const spottedMultiplier = defenderCtx.isSpottedOnly ? 0.5 : 1.0;
  let afterSpotted = afterTerrain * spottedMultiplier;

  // Assault already benefits from the forced 25m engagement range above; applying
  // a second multiplier here overstates close-assault lethality and breaks parity
  // between preview and expected battlefield outcomes.
  const finalPreClamp = afterSpotted;

  // Step 5: Clamp to bounds
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
 * Light and medium armor should sharply dampen small-arms fire, but not render it completely
 * meaningless. This scalar models chip damage bleeding through from soft attack values when a
 * target is armored but the attacker lacks a dedicated hard-attack punch.
 */
function resolveArmorChipScalar(effectiveAP: number, facingArmor: number): number {
  const armor = Math.max(0, facingArmor);
  if (armor <= 0) {
    return 1;
  }
  const armorGap = Math.max(0, armor - Math.max(0, effectiveAP));
  return combatBalance.penetration.underPenetrationScale / (1 + armor * 3 + armorGap * 2);
}

/**
 * Calculate shots fired based on unit class and current strength percentage.
 * Uses realistic shot counts from balance table.
 */
export function calculateShots(attacker: UnitTypeDefinition | UnitClass, strengthPercent: number): number {
  const combatProfile = typeof attacker === "string" ? attacker : resolveCombatProfile(attacker);
  const fullStrengthShots = combatBalance.damage.shotsPerTurn[combatProfile] ?? 1000;
  return Math.round(fullStrengthShots * (strengthPercent / 100));
}

/**
 * Calculate damage per hit as percentage of target strength (0-100%).
 * Uses realistic damage values from historical data.
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
  const damageScalar = 1 + (commanderDamageBonus / 100);
  const softAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, true);
  const hardAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, false);

  // Get base damage from table
  const targetType = isSoftTarget ? 'soft' : 'hard';
  const damageTable = combatBalance.damage.damagePercent[combatProfile];

  // Provide a safe fallback so the UI can still report numbers for unexpected unit classes.
  let baseDamage: number;
  let afterExperience: number;
  let finalDamage: number;

  if (!damageTable) {
    baseDamage = isSoftTarget ? 0.01 : 0.001;
    afterExperience = baseDamage * experienceScalar;
    const attackScalar = isSoftTarget ? softAttackScalar : hardAttackScalar;
    finalDamage = attackScalar <= 0 ? 0 : Math.max(0, afterExperience * damageScalar * attackScalar);
  } else if (isSoftTarget) {
    baseDamage = damageTable[targetType].full;
    afterExperience = baseDamage * experienceScalar;
    finalDamage = softAttackScalar <= 0 ? 0 : Math.max(0, afterExperience * damageScalar * softAttackScalar);
  } else {
    // Determine penetration result for hard targets
    let penetrationResult: 'full' | 'partial' = 'full';
    const margin = effectiveAP - facingArmor;
    if (margin < 0) {
      penetrationResult = 'partial'; // Under-penetration/glancing hit
    }

    const penetratingBaseDamage = damageTable.hard[penetrationResult];
    const penetratingAfterExperience = penetratingBaseDamage * experienceScalar;
    const penetratingDamage = hardAttackScalar <= 0
      ? 0
      : Math.max(0, penetratingAfterExperience * damageScalar * hardAttackScalar);

    const chipBaseDamage = damageTable.soft.full * resolveArmorChipScalar(effectiveAP, facingArmor);
    const chipAfterExperience = chipBaseDamage * experienceScalar;
    const chipDamage = softAttackScalar <= 0
      ? 0
      : Math.max(0, chipAfterExperience * damageScalar * softAttackScalar);

    if (chipDamage > penetratingDamage) {
      baseDamage = chipBaseDamage;
      afterExperience = chipAfterExperience;
      finalDamage = chipDamage;
    } else {
      baseDamage = penetratingBaseDamage;
      afterExperience = penetratingAfterExperience;
      finalDamage = penetratingDamage;
    }
  }

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
  const expectedSuppression = expectedHits * combatBalance.damage.suppressionPerHit;

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
