/**
 * Core combat helpers implement the shared damage and accuracy math described in the rules brief.
 * Keeping these routines here ensures every caller (preview UI, AI sims, persistence) references
 * identical logic that is parameterized by the values in `balance.ts`.
 */
import { combat as combatBalance, HEX_SCALE_METERS } from "./balance";
import type { Axial } from "./Hex";
import { axialDirections, hexDistance, subtract } from "./Hex";
import type { HexEdgeFacing, HitDistribution, TerrainDefinition, UnitClass, UnitTypeDefinition, WeaponShotGroup } from "./types";
import type { ScenarioUnit } from "./types";
import { getCombatProfile, type CombatProfileDefinition } from "../data/combatProfiles";
import {
  adjustHitDistributionForArmor,
  equipmentStatusOutcomeScalar,
  personnelStatusOutcomeScalar,
  penetrationDamageScalar,
  resolveWeaponHitDistribution
} from "./armorEffects";

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
  stance?: "fireAtWill" | "assault" | "suppressive" | "digIn"; // Combat stance (infantry only)
  fortified?: boolean; // Legacy presence flag for hex fortifications.
  fortificationFacing?: HexEdgeFacing | null; // Directional edge facing for engineer-built fortifications.
  fortificationFacings?: readonly HexEdgeFacing[] | null; // Multiple fortified edges on the same hex.
}

/**
 * Attacker context mirrors the defender details and keeps positional references for distance math.
 */
export interface AttackerContext {
  hex: Axial;
  stance?: "fireAtWill" | "assault" | "suppressive" | "digIn"; // Combat stance (infantry only)
  movementPointsUsed?: number;
  movementAttackWindow?: number;
  isRetaliation?: boolean;
  isOnSentry?: boolean;
  suppressionState?: ShotSuppressionState;
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
  /** When true, uses theoretical maximum shots without posture/movement/suppression scalars (for unit damage matrix testing) */
  useTheoreticalShots?: boolean;
}

/**
 * Result bundle returned by `resolveAttack()`. It exposes core metrics used by UI previews and AI
 * decision-making.
 */
export interface AccuracyBreakdown {
  readonly baseRange: number;
  readonly commanderScalar: number;
  readonly afterCommander: number;
  readonly experienceScalar: number;
  readonly afterExperience: number;
  readonly defenderExperienceScalar?: number;
  readonly afterDefenderExperience?: number;
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

export type ShotSuppressionState = "clear" | "suppressed" | "pinned" | "broken";

export interface ShotBreakdown {
  readonly theoreticalProfileShots: number;
  readonly formationScalar: number;
  readonly strengthScalar: number;
  readonly posture: "standard" | "suppressive" | "assault" | "retaliation" | "sentry" | "airSortie";
  readonly postureScalar: number;
  readonly movementScalar: number;
  readonly suppressionState: ShotSuppressionState;
  readonly suppressionScalar: number;
  readonly finalScalar: number;
  readonly final: number;
}

/**
 * Layered hit breakdown for three-layer combat model.
 * Separates target-area effects, effective contacts, and lethal outcomes.
 */
export interface LayeredHitBreakdown {
  /** Total rounds in target hex (suppression only, not physical contacts) */
  targetAreaEffects: number;
  /** Actual physical contacts with target (bullets, fragments, shells that hit) */
  effectiveContacts: number;
  /** Non-effect contacts (armor strikes, glancing impacts, or other contacts that do not materially damage the target) */
  nonEffectContacts: number;
  /** Soft-component contacts (optics, tracks, antenna, stowage) */
  softComponentContacts: number;
  /** Penetrating contacts (armor defeat, crew compartment hits) */
  penetratingContacts: number;
  /** Area-effect contacts (HE bursts, bomb impacts affecting multiple targets) */
  areaEffectContacts: number;
}

export interface AttackResult {
  accuracy: number;
  shots: number;
  damagePerHit: number;
  /** Expected target contacts before the weapon model translates those contacts into status outcomes. */
  expectedHits: number;
  /** Layered hit breakdown for three-layer combat model (target-area / effective / lethal) */
  layeredHits?: LayeredHitBreakdown;
  expectedDamage: number;
  expectedSuppression: number;
  effectiveAP: number;
  facingArmor: number;
  accuracyBreakdown: AccuracyBreakdown;
  damageBreakdown: DamageBreakdown;
  shotBreakdown?: ShotBreakdown;
}

/** Maps facing strings to direction indices in the axial direction table. */
const FACING_TO_INDEX: Record<Facing, number> = {
  E: 0,
  NE: 1,
  NW: 2,
  W: 3,
  SW: 4,
  SE: 5
};

const HEX_EDGE_TO_ANGLE_DEG: Record<HexEdgeFacing, number> = {
  E: 0,
  SE: 60,
  SW: 120,
  W: 180,
  NW: -120,
  NE: -60
};

function normalizeAngleDelta(angleA: number, angleB: number): number {
  const raw = Math.abs(angleA - angleB) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function axialToPixelVector(diff: Axial): { x: number; y: number } {
  return {
    x: Math.sqrt(3) * (diff.q + diff.r / 2),
    y: 1.5 * diff.r
  };
}

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
export function terrainAccMod(
  terrain: TerrainDefinition | null | undefined,
  isRushing?: boolean,
  fortificationCoverPct = 0,
  defenderClass?: UnitClass
): number {
  // Rushing units lose terrain cover
  if (isRushing) return 0;

  let baseMod = terrain?.accMod ?? 0;

  if (
    fortificationCoverPct !== 0 &&
    defenderClass &&
    ["infantry", "recon", "specialist"].includes(defenderClass)
  ) {
    baseMod += fortificationCoverPct;
  }

  return baseMod;
}

export function resolveFortificationCoverBonusPct(
  attackerHex: Axial,
  defenderHex: Axial,
  fortificationFacing: readonly HexEdgeFacing[] | HexEdgeFacing | null | undefined,
  attackerClass: UnitClass
): number {
  if (combatBalance.penetration.topAttackClasses.has(attackerClass)) {
    return 0;
  }
  const fortifiedFacings = Array.isArray(fortificationFacing)
    ? fortificationFacing.filter((edge): edge is HexEdgeFacing => edge !== null && edge !== undefined)
    : fortificationFacing
      ? [fortificationFacing]
      : [];
  if (fortifiedFacings.length === 0) {
    return combatBalance.cover.fortificationBonusPct;
  }

  const attackVector = axialToPixelVector(subtract(attackerHex, defenderHex));
  if (attackVector.x === 0 && attackVector.y === 0) {
    return 0;
  }

  const attackAngle = Math.atan2(attackVector.y, attackVector.x) * (180 / Math.PI);
  const edgeDiffs = (Object.entries(HEX_EDGE_TO_ANGLE_DEG) as Array<[HexEdgeFacing, number]>)
    .map(([edge, angle]) => ({ edge, diff: normalizeAngleDelta(attackAngle, angle) }))
    .sort((left, right) => left.diff - right.diff);

  const primary = edgeDiffs[0];
  const secondary = edgeDiffs[1];
  if (!primary) {
    return 0;
  }

  if (secondary && Math.abs(primary.diff - secondary.diff) <= 0.5) {
    return fortifiedFacings.includes(primary.edge) || fortifiedFacings.includes(secondary.edge)
      ? combatBalance.cover.fortificationBonusPct * 0.5
      : 0;
  }

  return fortifiedFacings.includes(primary.edge) ? combatBalance.cover.fortificationBonusPct : 0;
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
  if (delta === 3) {
    return defenderUnit.armor.rear ?? Math.max(1, Math.round(defenderUnit.armor.side * 0.75));
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

  // Step 2: Apply commander and experience bonuses multiplicatively
  const commanderAccuracyBonus = attacker.general.accBonus ?? 0;
  const commanderScalar = 1 + (commanderAccuracyBonus * combatBalance.accuracy.commanderScalar);
  const experienceScalar = 1 + (attacker.experience * combatBalance.accuracy.expPerStar / 100);

  // Chain multipliers: Base × Commander × Experience
  const afterCommander = baseAccuracy * commanderScalar;
  const afterExperience = afterCommander * experienceScalar;

  // Step 3: Apply target signature modifier
  // Smaller signatures are harder to hit, larger signatures are easier to hit
  const defenderSignature = defender.unit.combat.signature;
  const signatureMultiplier = combatBalance.accuracy.signatureMultiplier[defenderSignature] ?? 1.0;
  const afterSignature = afterExperience * signatureMultiplier;

  // Step 4: Veteran defenders reduce exposed area and react better under fire.
  const defenderExperienceScalar = Math.max(0.85, 1 - (defender.experience * combatBalance.accuracy.expPerStar / 100));
  const afterDefenderExperience = afterSignature * defenderExperienceScalar;

  // Step 5: Apply terrain modifier multiplicatively.
  const fortificationCoverPct = defenderCtx.fortified
    ? resolveFortificationCoverBonusPct(
      attackerCtx.hex,
      defenderCtx.hex,
      defenderCtx.fortificationFacings ?? defenderCtx.fortificationFacing,
      attacker.unit.class
    )
    : 0;
  const terrainMod = terrainAccMod(defenderCtx.terrain, defenderCtx.isRushing, fortificationCoverPct, defenderCtx.class);
  const terrainMultiplier = 1 + terrainMod / 100;
  const afterTerrain = afterDefenderExperience * terrainMultiplier;

  // Step 6: Apply spotted target penalty as multiplier
  const spottedMultiplier = defenderCtx.isSpottedOnly ? 0.5 : 1.0;
  const afterSpotted = afterTerrain * spottedMultiplier;

  // Assault already benefits from the forced 25m engagement range above; applying
  // a second multiplier here overstates close-assault lethality and breaks parity
  // between preview and expected battlefield outcomes.
  const finalPreClamp = afterSpotted;

  // Step 7: Clamp to bounds
  const finalAccuracy = clamp(finalPreClamp, combatBalance.accuracy.min, combatBalance.accuracy.max);

  return {
    baseRange: baseAccuracy,
    commanderScalar,
    afterCommander,
    experienceScalar,
    afterExperience,
    defenderExperienceScalar,
    afterDefenderExperience,
    terrainModifier: terrainMod,
    terrainMultiplier,
    afterTerrain,
    spottedMultiplier,
    finalPreClamp,
    final: finalAccuracy
  } satisfies AccuracyBreakdown;
}

/**
 * Effective armor penetration uses the maximum AP from weapon model groups.
 * 
 * PLATFORM+WEAPON SYSTEM: This function represents the complete transition from legacy unit-based AP
 * to the modern platform+weapon system where AP is derived exclusively from weapon characteristics.
 * 
 * WHY NOT WEIGHTED AVERAGE: Weighted AP is fundamentally wrong for a detailed damage system because:
 * 1. It dilutes the effectiveness of high-AP weapons by mixing them with low-AP shots
 * 
 * WEAPON GROUP REQUIREMENTS:
 * - All weapon groups must define armorPenetration in hardEffect
 * - No fallbacks allowed - explicit AP values required for every weapon
 * - Uses maximum AP from all weapon groups (best anti-armor capability)
 * - Mixed weapon loads (tanks with HE + AP + MG) work correctly via max selection
 * 
 * EXPERIENCE: Experience does not increase AP - you can't make a shell penetrate better through skill.
 * Experience improves accuracy and damage application, not fundamental weapon penetration.
 * 
 * @param attacker Unit combat state containing weapon model
 * @returns Maximum AP value from all weapon groups (minimum 2 for scale compliance)
 * @throws Error if weapon model or AP values are missing
 */
export function calculateEffectiveAP(attacker: UnitCombatState): number {
  const weaponModel = attacker.unit.weaponModel;
  
  // Platform+weapon system requires weapon model - no legacy fallbacks allowed
  if (!weaponModel || weaponModel.groups.length === 0) {
    throw new Error(`Unit has no weapon model groups defined. Platform+weapon system requires weapon groups for AP calculation.`);
  }

  // Find maximum AP from all weapon groups - represents best anti-armor capability
  // This allows mixed weapon loads to work correctly (e.g., tank with HE + AP + MG)
  let maxAP = 0;

  weaponModel.groups.forEach((group) => {
    // Extract AP from hardEffect.armorPenetration - required for all weapon groups
    const groupAP = group.armorPenetration ?? group.hardEffect?.armorPenetration ?? 0;
    
    // Validate that weapon groups follow the AP scale (no zero values)
    if (groupAP <= 0) {
      throw new Error(`Weapon group '${group.id}' has invalid AP value ${groupAP}. All weapon groups must have AP >= 2 (scale excludes zero).`);
    }
    
    if (groupAP > maxAP) {
      maxAP = groupAP;
    }
  });

  // Final validation - ensure we found valid AP values
  if (maxAP <= 0) {
    throw new Error(`Unit has no weapon groups with valid armor penetration defined. All weapon groups must define armorPenetration >= 2 in hardEffect.`);
  }

  return maxAP;
}

function mitigateReduction(scalar: number, experience: number, maxRestoredLoss: number): number {
  const clamped = clamp(scalar, 0, 1);
  const restoration = clamp(experience, 0, 5) / 5 * maxRestoredLoss;
  return clamp(clamped + (1 - clamped) * restoration, 0, 1);
}

/**
 * Determines the combat posture and corresponding shot scalar for ground units.
 * Posture represents the tactical situation and affects what percentage of the
 * theoretical maximum shot volume a unit can actually deliver.
 * 
 * SCALAR DIRECTION: Higher scalar = MORE shots, Lower scalar = FEWER shots
 * - 1.0 = 100% of theoretical maximum (most shots)
 * - 0.18 = 18% of theoretical maximum (fewer shots)
 * 
 * Posture scalars are realistic combat efficiency factors - even in ideal
 * conditions, units don't fire at their absolute 5-minute theoretical maximum
 * during a single combat turn due to targeting, coordination, and battlefield
 * constraints.
 * 
 * Posture hierarchy (checked in order):
 * 1. Air units: Always use full theoretical shots (airSortie: 1.0) - MAXIMUM
 * 2. Retaliation: Defensive fire with limited preparation (sentry: 0.35, retaliation: 0.12)
 * 3. Explicit stances: Offensive tactical choices (assault: 0.25, suppressive: 0.18)
 * 4. Standard: Fresh, stationary, deliberate attack (standard: 0.18) - BASELINE
 * 
 * Shot volume comparison (highest to lowest):
 * airSortie (1.0) > sentry (0.35) > assault (0.25) > standard (0.18) = suppressive (0.18) > retaliation (0.12)
 * 
 * SUPPRESSION SYSTEM:
 * - Suppressive stance: Same shot volume as standard, but adds attacker to target's suppressedBy array
 * - Target escalation: 1 suppressor = "suppressed", 2+ suppressors = "pinned" (or "broken" if strength < 25)
 * - Attacker effects: Units that are suppressed/pinned have their own shot volume reduced
 */
function resolveShotPosture(
  attacker: UnitTypeDefinition,
  context: AttackerContext
): Pick<ShotBreakdown, "posture" | "postureScalar"> {
  if (attacker.moveType === "air") {
    // Air units operate at full theoretical capacity during their sortie window
    return { posture: "airSortie", postureScalar: 1 };
  }
  if (context.isRetaliation) {
    // Defensive fire - sentry units have better preparation than spontaneous retaliation
    return context.isOnSentry
      ? { posture: "sentry", postureScalar: 0.35 } // Prepared defensive position
      : { posture: "retaliation", postureScalar: 0.12 }; // Hasty defensive fire
  }
  if (context.stance === "assault") {
    // Offensive assault - moving and firing reduces shot volume
    return { posture: "assault", postureScalar: 0.25 };
  }
  if (context.stance === "suppressive") {
    // Suppressive fire - same shot volume as standard but focuses on suppression effects
    return { posture: "suppressive", postureScalar: 0.18 };
  }
  
  // Standard posture: Fresh, stationary, deliberate attack
  // 0.18 represents realistic combat efficiency for ideal conditions
  // Units don't fire at absolute theoretical maximum due to:
  // - Target acquisition and tracking
  // - Fire coordination and communication
  // - Ammunition handling and reload cycles
  // - Battlefield awareness and threat avoidance
  return { posture: "standard", postureScalar: 0.18 };
}

function resolveMovementShotScalar(context: AttackerContext, experience: number): number {
  if (context.isRetaliation || context.isOnSentry) {
    return 1;
  }
  const used = Math.max(0, context.movementPointsUsed ?? 0);
  const window = Math.max(1, context.movementAttackWindow ?? 1);
  if (used <= 0) {
    return 1;
  }
  const movementShare = clamp(used / window, 0, 1);
  const raw = 1 - movementShare * 0.35;
  return mitigateReduction(raw, experience, 0.25);
}

function resolveSuppressionShotScalar(state: ShotSuppressionState, experience: number): number {
  if (state === "suppressed") {
    return mitigateReduction(0.6, experience, 0.5);
  }
  if (state === "pinned") {
    return mitigateReduction(0.32, experience, 0.5);
  }
  if (state === "broken") {
    return mitigateReduction(0.08, experience, 0.25);
  }
  return 1;
}

/**
 * Calculate actual shots fired from the authored five-minute weapon model.
 * 
 * Weapon-model shot counts represent the absolute theoretical maximum a formation
 * can deliver over a 5-minute engagement period. These values are already formation-scale.
 * 
 * For battlefield combat, multiple scalars convert theoretical maximums into realistic
 * fire volume:
 * - Strength/readiness: Reduced effectiveness as unit takes damage
 * - Posture: Tactical situation (standard: 0.18, assault: 0.25, suppressive: 0.18, etc.)
 * - Movement: Firing while moving reduces coordination
 * - Suppression: Pinned/broken units have reduced fire volume
 * - Experience: Veteran crews mitigate some reductions
 * 
 * A fresh stationary standard attack uses about 18% of theoretical maximum due to
 * realistic battlefield constraints (targeting, coordination, reload cycles, etc.).
 * 
 * When useTheoreticalShots=true: Returns full theoretical maximum without posture/
 * movement/suppression scalars. Used for unit damage matrix testing to compare
 * theoretical capabilities between units.
 * 
 * When useTheoreticalShots=false (default): Returns realistic battlefield shot volume.
 * Used for actual combat resolution.
 */
export function calculateShotBreakdown(request: AttackRequest): ShotBreakdown {
  const combatProfile = resolveCombatProfile(request.attacker.unit);
  const weaponModelShots = request.attacker.unit.weaponModel?.groups.reduce(
    (sum, group) => sum + Math.max(0, group.shots),
    0
  ) ?? 0;
  const theoreticalProfileShots = Math.max(0, weaponModelShots > 0 ? weaponModelShots : combatProfile.shotsPerTurn);

  const formationScalar = 1;
  const strengthScalar = clamp(request.attacker.strength / 100, 0, 1);
  const experience = Math.max(0, request.attacker.experience ?? 0);
  const posture = resolveShotPosture(request.attacker.unit, request.attackerCtx);
  const postureScalar = request.attacker.unit.moveType === "air"
    ? posture.postureScalar
    : mitigateReduction(posture.postureScalar, experience, posture.posture === "sentry" ? 0.1 : 0.18);
  const movementScalar = request.attacker.unit.moveType === "air"
    ? 1
    : resolveMovementShotScalar(request.attackerCtx, experience);
  const suppressionState = request.attackerCtx.suppressionState ?? "clear";
  const suppressionScalar = request.attacker.unit.moveType === "air"
    ? 1
    : resolveSuppressionShotScalar(suppressionState, experience);

  // When using theoretical shots (for unit damage matrix testing), bypass posture/movement/suppression scalars
  const finalScalar = request.useTheoreticalShots 
    ? formationScalar * strengthScalar 
    : formationScalar * strengthScalar * postureScalar * movementScalar * suppressionScalar;
  const final = Math.round(theoreticalProfileShots * finalScalar);

  return {
    theoreticalProfileShots,
    formationScalar,
    strengthScalar,
    posture: posture.posture,
    postureScalar,
    movementScalar,
    suppressionState,
    suppressionScalar,
    finalScalar,
    final
  };
}

/**
 * Backward-compatible helper for callers that only have a unit definition and strength value.
 * This now returns standard battlefield fire volume, not the profile's theoretical maximum.
 */
export function calculateShots(attacker: UnitTypeDefinition, strengthPercent: number): number {
  return calculateShotBreakdown({
    attacker: {
      unit: attacker,
      strength: strengthPercent,
      experience: 0,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    defender: {
      unit: attacker,
      strength: 100,
      experience: 0,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    attackerCtx: { hex: { q: 0, r: 0 } },
    defenderCtx: {
      terrain: { moveCost: { leg: 1, wheel: 1, track: 1, air: 1 }, defense: 0, accMod: 0, blocksLOS: false },
      class: attacker.class,
      facing: "E",
      hex: { q: 1, r: 0 }
    },
    targetFacing: "E",
    isSoftTarget: attacker.class === "infantry" || attacker.class === "specialist"
  }).final;
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
  const experienceScalar = 1 + attacker.experience * combatBalance.damage.experienceScalarPerStar;
  const commanderDamageBonus = attacker.general.dmgBonus ?? 0;
  const damageScalar = 1 + (commanderDamageBonus / 100);
  const softAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, true);
  const hardAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, false);

  // Get base damage from profile
  const baseDamage = combatProfile.baseDamagePerHit;
  const afterExperience = baseDamage * experienceScalar;

  // Apply attack type scalar (soft or hard)
  const attackScalar = isSoftTarget ? softAttackScalar : hardAttackScalar;
  const afterAttackType = afterExperience * attackScalar;

  // Apply armor penetration margin modifier to all targets
  let penetrationMarginScalar = 1;
  if (facingArmor > 0) {
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

function estimatePersonnelBasis(defender: UnitTypeDefinition): number {
  if (defender.class === "infantry") {
    if ((defender.baseExperience ?? 0) >= 2) return 150;
    return defender.combat.weight === "heavy" ? 770 : 720;
  }
  if (defender.class === "specialist") {
    if (defender.combat.weight === "heavy") return 160;
    if (defender.combat.role === "antiTank") return 132;
    return 160;
  }
  if (defender.class === "tank") {
    if (defender.combat.weight === "heavy") return 96;
    if (defender.combat.role === "antiTank") return 90;
    if (defender.combat.role === "antiInfantry") return 54;
    return 120;
  }
  if (defender.class === "artillery") {
    if (defender.combat.weight === "heavy") return 150;
    if (defender.combat.role === "normal") return 140;
    return 180;
  }
  if (defender.class === "recon") {
    return defender.combat.weight === "light" ? 54 : 150;
  }
  if (defender.class === "vehicle") {
    if (defender.combat.role === "support") return 48;
    return 180;
  }
  if (defender.class === "air") {
    if (defender.combat.role === "antiVehicle") return 130;
    if (defender.combat.role === "antiInfantry") return 150;
    if (defender.combat.role === "support") return 90;
    return defender.hardAttack >= 15 ? 160 : 120;
  }
  return 100;
}

function estimateEquipmentBasis(defender: UnitTypeDefinition): number {
  if (defender.class === "tank") {
    if (defender.combat.weight === "heavy") return 14;
    if (defender.combat.role === "antiTank") return 12;
    if (defender.combat.role === "antiInfantry") return 6;
    return 20;
  }
  if (defender.class === "artillery") {
    if (defender.combat.weight === "heavy") return 12;
    if (defender.combat.role === "normal") return 8;
    return 18;
  }
  if (defender.class === "recon") return 18;
  if (defender.class === "vehicle") {
    if (defender.combat.role === "support") return 8;
    return 24;
  }
  if (defender.class === "air") {
    if (defender.combat.role === "antiVehicle") return 8;
    if (defender.combat.role === "antiInfantry") return 6;
    if (defender.combat.role === "support") return 6;
    return defender.hardAttack >= 15 ? 16 : 12;
  }
  if (defender.class === "specialist" && defender.combat.weight !== "light") {
    if (defender.combat.weight === "heavy") return 16;
    if (defender.combat.role === "antiTank") return 18;
    return 12;
  }
  return 0;
}

function distributeExpectedHits(expectedHits: number, distribution: HitDistribution): {
  nonEffect: number;
  softComponent: number;
  penetrating: number;
  areaEffect: number;
} {
  return {
    nonEffect: expectedHits * distribution.nonEffect,
    softComponent: expectedHits * distribution.softComponent,
    penetrating: expectedHits * distribution.penetrating,
    areaEffect: expectedHits * distribution.areaEffect
  };
}

function penetrationEffectScalarForGroup(group: WeaponShotGroup, request: AttackRequest, facingArmor: number): number {
  const penetration = group.hardEffect?.armorPenetration ?? request.attacker.unit.ap ?? 0;
  if (facingArmor <= 0) {
    return 1;
  }
  const margin = penetration - facingArmor;
  return penetrationDamageScalar(group.role, group.hardEffect?.damageType, margin, facingArmor);
}

function estimateDetailedReadinessLoss(
  request: AttackRequest,
  group: WeaponShotGroup,
  expectedHits: number,
  facingArmor: number
): number {
  const distribution = resolveWeaponHitDistribution(group, request.defender.unit);
  const weaponAP = group.armorPenetration ?? group.hardEffect?.armorPenetration ?? request.attacker.unit.ap ?? 0;
  const effectiveDistribution = adjustHitDistributionForArmor(
    distribution,
    group.role,
    group.hardEffect?.damageType,
    request.defender.unit,
    weaponAP,
    facingArmor
  );
  const hitTypeCounts = distributeExpectedHits(expectedHits, effectiveDistribution);
  let personnelReadinessLoss = 0;
  let equipmentReadinessLoss = 0;

  if (group.softEffect) {
    const effectivePersonnelHits =
      (hitTypeCounts.penetrating * 0.98 +
        hitTypeCounts.areaEffect * 0.85 +
        hitTypeCounts.softComponent * 0.15 +
        hitTypeCounts.nonEffect * 0.02) *
      personnelStatusOutcomeScalar(group.role, request.defender.unit, group.softEffect);
    const injured = group.softEffect.injured * effectivePersonnelHits;
    const wounded = group.softEffect.wounded * effectivePersonnelHits;
    const severelyWounded = group.softEffect.severelyWounded * effectivePersonnelHits;
    const killed = group.softEffect.killed * effectivePersonnelHits;
    const effectiveLoss = injured * 0.25 + wounded + severelyWounded + killed;
    personnelReadinessLoss = (effectiveLoss / Math.max(1, estimatePersonnelBasis(request.defender.unit))) * 100;
  }

  if (group.hardEffect) {
    const armorScalar = penetrationEffectScalarForGroup(group, request, facingArmor);
    const equipmentOutcomeScalar = equipmentStatusOutcomeScalar(group.role, group.hardEffect.damageType, request.defender.unit);
    const damaged =
      (hitTypeCounts.penetrating * group.hardEffect.damaged * armorScalar +
        hitTypeCounts.areaEffect * group.hardEffect.damaged * 0.3 +
        hitTypeCounts.softComponent * group.hardEffect.damaged * 0.15) * equipmentOutcomeScalar;
    const disabled =
      (hitTypeCounts.penetrating * group.hardEffect.disabled * armorScalar +
        hitTypeCounts.areaEffect * group.hardEffect.disabled * 0.3 +
        hitTypeCounts.softComponent * group.hardEffect.disabled * 0.075) * equipmentOutcomeScalar;
    const destroyed = hitTypeCounts.penetrating * group.hardEffect.destroyed * armorScalar * equipmentOutcomeScalar;
    const equipmentBasis = estimateEquipmentBasis(request.defender.unit);
    equipmentReadinessLoss = equipmentBasis > 0
      ? ((damaged * 0.5 + disabled + destroyed) / equipmentBasis) * 100
      : 0;
  }

  const detailedDamage = personnelReadinessLoss + equipmentReadinessLoss;
  return Number.isFinite(detailedDamage) ? Math.max(0, detailedDamage) : 0;
}

/** Calculate damage per weapon group and aggregate for mixed weapon loads */
function calculateMixedWeaponDamage(
  request: AttackRequest,
  facingArmor: number,
  shotBreakdown: ShotBreakdown
): {
  totalExpectedDamage: number;
  totalExpectedHits: number;
  totalExpectedSuppression: number;
  aggregatedDamageBreakdown: DamageBreakdown;
} {
  const weaponModel = request.attacker.unit.weaponModel;
  
  if (!weaponModel || weaponModel.groups.length === 0) {
    throw new Error(
      `Weapon model missing for unit ${request.attacker.unit.class || 'unknown'}. ` +
      `All units must have a defined weapon model with at least one weapon group. ` +
      `Check formations.ts to ensure the unit has weaponModel: weaponModels.<modelName> defined.`
    );
  }

  let totalExpectedDamage = 0;
  let totalExpectedHits = 0;
  let totalExpectedSuppression = 0;
  let weightedDamagePerHit = 0;
  let weightedBaseTableValue = 0;
  let totalShots = 0;

  const accuracyBreakdown = calculateAccuracy(request);
  const combatProfile = resolveCombatProfile(request.attacker.unit);

  // Calculate damage for each weapon group individually
  weaponModel.groups.forEach((group) => {
    const groupShots = Math.max(0, group.shots) * shotBreakdown.finalScalar;
    const groupAP = group.armorPenetration ?? group.hardEffect?.armorPenetration ?? 0;
    
    if (groupShots > 0 && groupAP > 0) {
      const groupDamageBreakdown = calculateDamagePerHit(request, groupAP, facingArmor);
      const groupExpectedHits = (accuracyBreakdown.final / 100) * groupShots;
      const groupExpectedDamage = estimateDetailedReadinessLoss(
        request,
        group,
        groupExpectedHits,
        facingArmor
      );
      const groupSuppression = groupExpectedHits * (group.suppressionPerHit ?? combatProfile.suppressionPerHit);
      
      totalExpectedDamage += groupExpectedDamage;
      totalExpectedHits += groupExpectedHits;
      totalExpectedSuppression += groupSuppression;
      weightedDamagePerHit += (groupExpectedHits > 0 ? groupExpectedDamage / groupExpectedHits : groupDamageBreakdown.final) * groupShots;
      weightedBaseTableValue += groupDamageBreakdown.baseTableValue * groupShots;
      totalShots += groupShots;
    }
  });

  // Create aggregated damage breakdown (weighted average by shot count)
  const aggregatedDamageBreakdown: DamageBreakdown = {
    baseTableValue: weightedBaseTableValue / Math.max(totalShots, 1),
    experienceScalar: 1,
    afterExperience: weightedDamagePerHit / Math.max(totalShots, 1),
    commanderScalar: 1,
    final: weightedDamagePerHit / Math.max(totalShots, 1)
  };

  return { totalExpectedDamage, totalExpectedHits, totalExpectedSuppression, aggregatedDamageBreakdown };
}

/** Aggregate helper delivering the full combat math breakdown. */
export function resolveAttack(request: AttackRequest): AttackResult {
  const accuracyBreakdown = calculateAccuracy(request);
  const facingArmor = pickFacingArmor(
    request.attackerCtx.hex,
    request.defenderCtx.hex,
    request.targetFacing,
    request.defender.unit,
    request.attacker.unit.class
  );
  const shotBreakdown = calculateShotBreakdown(request);
  
  // Use mixed weapon damage calculation for proper AP per weapon group
  const { totalExpectedDamage, totalExpectedHits, totalExpectedSuppression, aggregatedDamageBreakdown } = 
    calculateMixedWeaponDamage(request, facingArmor, shotBreakdown);

  // Build layered hit breakdown (placeholder - will be refined in damagePackets integration)
  // For now, all contacts are treated as effectiveContacts with legacy expectedHits count
  const layeredHits: LayeredHitBreakdown = {
    targetAreaEffects: shotBreakdown.final * 0.8, // Most rounds are area fire/suppression
    effectiveContacts: totalExpectedHits, // Physical contacts
    nonEffectContacts: 0, // Will be populated by hitDistribution in damage phase
    softComponentContacts: 0,
    penetratingContacts: 0,
    areaEffectContacts: 0
  };

  // Keep effectiveAP for UI display purposes (shows max AP available)
  const effectiveAP = calculateEffectiveAP(request.attacker);

  return {
    accuracy: accuracyBreakdown.final,
    shots: shotBreakdown.final,
    damagePerHit: aggregatedDamageBreakdown.final,
    /** Expected target contacts before the weapon model translates those contacts into status outcomes. */
    expectedHits: totalExpectedHits,
    /** Layered hit breakdown for three-layer combat model (target-area / effective / lethal) */
    layeredHits,
    expectedDamage: totalExpectedDamage,
    expectedSuppression: totalExpectedSuppression,
    effectiveAP,
    facingArmor,
    accuracyBreakdown,
    damageBreakdown: aggregatedDamageBreakdown,
    shotBreakdown
  };
}
