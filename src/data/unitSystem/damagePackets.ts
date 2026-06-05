import type { AttackResult, AttackerContext } from "../../core/Combat";
import {
  adjustHitDistributionForArmor,
  equipmentStatusOutcomeScalar,
  inferWeaponDamageType,
  isHighExplosivePersonnelRole,
  personnelStatusOutcomeScalar,
  personnelTargetExposureScalar,
  penetrationDamageScalar,
  resolveWeaponHitDistribution
} from "../../core/armorEffects";
import type {
  ComponentDamageSpec,
  EquipmentDamageEffect,
  EquipmentStatusSummary,
  FormationStatus,
  FormationStatusSummary,
  HitDistribution,
  PersonnelDamageEffect,
  PersonnelStatusPool,
  PersonnelStatusSummary,
  ScenarioUnit,
  UnitTypeDefinition,
  VehicleStatusPool,
  VehicleComponent,
  WeaponDamageType,
  WeaponShotGroup
} from "../../core/types";
import { pickFacingArmor } from "../../core/Combat";
import type { Axial } from "../../core/Hex";
import { calculateFormationReadiness, deriveStrengthFromStatus, ensureFormationStatus } from "./status";

export interface PersonnelDamageDelta {
  injured: number;
  wounded: number;
  severelyWounded: number;
  killed: number;
}

export interface EquipmentDamageDelta {
  damaged: number;
  disabled: number;
  destroyed: number;
}

/**
 * Component-specific damage tracks which vehicle systems were affected by combat.
 * Enables detailed repair tracking and component-specific vulnerability.
 */
export interface ComponentDamageDelta {
  /** Components reduced to damaged state (impaired function). */
  damaged: Partial<Record<VehicleComponent, number>>;
  /** Components reduced to disabled state (non-functional). */
  disabled: Partial<Record<VehicleComponent, number>>;
  /** Components reduced to destroyed state (requires replacement). */
  destroyed: Partial<Record<VehicleComponent, number>>;
}

export interface WeaponHitSummary {
  id: string;
  label: string;
  /** Authored full-strength weapon shots from the formation model. */
  baseShots: number;
  /** Effective shots after combat posture, readiness, movement, and suppression scaling. */
  shots: number;
  /** Target contacts for this weapon group before personnel/equipment outcome conversion. */
  expectedHits: number;
  personnel: PersonnelDamageDelta;
  equipment: EquipmentDamageDelta;
  suppression: number;
  fortificationDamage: number;
  /** Damage type classification for this weapon's effects. */
  damageType?: WeaponDamageType;
  /** Component-specific damage breakdown for detailed repair tracking. */
  componentDamage?: ComponentDamageDelta;
  /** Hit type distribution showing how contacts translated to damage. */
  hitTypeCounts?: {
    nonEffect: number;
    softComponent: number;
    penetrating: number;
    areaEffect: number;
  };
}

export interface DamagePacket {
  personnel: PersonnelDamageDelta;
  equipment: EquipmentDamageDelta;
  suppression: number;
  fortificationDamage: number;
  readinessLoss: number;
  weaponHits: readonly WeaponHitSummary[];
  /** Aggregate component damage across all weapon hits for repair tracking. */
  componentDamage?: ComponentDamageDelta;
  /** Set of damage types that contributed to this packet (for activity logging). */
  damageTypesUsed?: ReadonlySet<WeaponDamageType>;
}

export interface DamagePacketRequest {
  attacker: ScenarioUnit;
  attackerDefinition: UnitTypeDefinition;
  attackerHex: Axial;
  defender: ScenarioUnit;
  defenderDefinition: UnitTypeDefinition;
  defenderHex: Axial;
  attackResult: AttackResult;
  targetFacing: ScenarioUnit["facing"];
  attackerStance?: AttackerContext["stance"];
  defenderCtx?: AttackerContext;
  effectScalar?: number;
  suppressionScalar?: number;
}

const EMPTY_PERSONNEL_DELTA: PersonnelDamageDelta = Object.freeze({
  injured: 0,
  wounded: 0,
  severelyWounded: 0,
  killed: 0
});

const EMPTY_EQUIPMENT_DELTA: EquipmentDamageDelta = Object.freeze({
  damaged: 0,
  disabled: 0,
  destroyed: 0
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addPersonnel(left: PersonnelDamageDelta, right: PersonnelDamageDelta): PersonnelDamageDelta {
  return {
    injured: left.injured + right.injured,
    wounded: left.wounded + right.wounded,
    severelyWounded: left.severelyWounded + right.severelyWounded,
    killed: left.killed + right.killed
  };
}

function addEquipment(left: EquipmentDamageDelta, right: EquipmentDamageDelta): EquipmentDamageDelta {
  return {
    damaged: left.damaged + right.damaged,
    disabled: left.disabled + right.disabled,
    destroyed: left.destroyed + right.destroyed
  };
}

function livingPersonnel(status: FormationStatus | undefined): number {
  if (!status) return 0;
  return Object.values(status.personnel).reduce(
    (sum, pool) => sum + Math.max(0, pool.fit + pool.injured + pool.wounded + pool.severelyWounded),
    0
  );
}

function nonDestroyedEquipment(status: FormationStatus | undefined): number {
  if (!status) return 0;
  return Object.values(status.equipment).reduce(
    (sum, pool) => sum + Math.max(0, pool.operational + pool.damaged + pool.disabled),
    0
  );
}

function outcomeRound(value: number, threshold = 0.35): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < threshold) return 0;
  return Math.max(1, Math.round(value));
}

interface CapPersonnelEffectOptions {
  readonly contactHits?: number;
}

function countPersonnelDelta(delta: PersonnelDamageDelta): number {
  return delta.injured + delta.wounded + delta.severelyWounded + delta.killed;
}

function defenderAmmoVulnerabilityScalar(defender: ScenarioUnit, defenderDefinition: UnitTypeDefinition): number {
  if (defenderDefinition.moveType === "air") {
    return 1;
  }
  if (typeof defender.ammo !== "number") {
    return 1;
  }
  return defender.ammo <= 0 ? 2.25 : 1;
}

function capPersonnelEffect(
  effect: PersonnelDamageEffect,
  expectedHits: number,
  effectScalar: number,
  options: CapPersonnelEffectOptions = {}
): PersonnelDamageDelta {
  const scalar = Math.max(0, effectScalar);
  const effectiveHits = expectedHits * scalar;
  const raw = {
    injured: effect.injured * effectiveHits,
    wounded: effect.wounded * effectiveHits,
    severelyWounded: effect.severelyWounded * effectiveHits,
    killed: effect.killed * effectiveHits
  };
  const maxKilled = typeof effect.maxKilledPerHit === "number"
    ? Math.max(0, effect.maxKilledPerHit * effectiveHits)
    : Number.POSITIVE_INFINITY;
  const killed = Math.min(raw.killed, maxKilled);
  let capped = { ...raw, killed };
  const maxCasualties = typeof effect.maxCasualtiesPerHit === "number"
    ? Math.max(0, effect.maxCasualtiesPerHit * effectiveHits)
    : Number.POSITIVE_INFINITY;
  const total = capped.injured + capped.wounded + capped.severelyWounded + capped.killed;
  if (Number.isFinite(maxCasualties) && total > maxCasualties && total > 0) {
    const casualtyScalar = maxCasualties / total;
    capped = {
      injured: capped.injured * casualtyScalar,
      wounded: capped.wounded * casualtyScalar,
      severelyWounded: capped.severelyWounded * casualtyScalar,
      killed: capped.killed * casualtyScalar
    };
  }
  const raw2 = { ...capped };

  const contactHits = Math.max(0, options.contactHits ?? 0);
  if (contactHits > 0) {
    const fatalityThreshold = effect.fatalityRoundingThreshold ?? (effect.casualtyRoundingThreshold ?? 0.35);
    const casualtyThreshold = effect.casualtyRoundingThreshold ?? 0.35;
    const minimumKilled = (effect.minimumKilledPerHit ?? 0) * contactHits;
    if (raw2.killed < minimumKilled) {
      raw2.killed = minimumKilled;
    }

    const minimumWounded = (effect.minimumWoundedPerHit ?? 0) * contactHits;
    const nonfatalWounded = raw2.wounded + raw2.severelyWounded;
    if (nonfatalWounded < minimumWounded) {
      raw2.wounded += minimumWounded - nonfatalWounded;
    }

    const minimumCasualties = (effect.minimumCasualtiesPerHit ?? 0) * contactHits;
    const totalCasualties = raw2.injured + raw2.wounded + raw2.severelyWounded + raw2.killed;
    if (totalCasualties < minimumCasualties) {
      raw2.injured += minimumCasualties - totalCasualties;
    }
    void fatalityThreshold;
    void casualtyThreshold;
  }

  return raw2;
}

function penetrationEffectScalar(effect: EquipmentDamageEffect, group: WeaponShotGroup, request: DamagePacketRequest): number {
  const penetration = effect.armorPenetration ?? request.attackerDefinition.ap;
  const facingArmor = pickFacingArmor(
    request.attackerHex,
    request.defenderHex,
    request.targetFacing,
    request.defenderDefinition,
    request.attackerDefinition.class,
    resolvePacketAttackerStance(request)
  );
  if (facingArmor <= 0) {
    return 1;
  }
  const margin = penetration - facingArmor;
  return penetrationDamageScalar(group.role, effect.damageType, margin, facingArmor);
}

function distributeHits(expectedHits: number, distribution: HitDistribution): {
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

function calculatePersonnelCasualties(
  hitTypeCounts: { nonEffect: number; softComponent: number; penetrating: number; areaEffect: number },
  softEffect: PersonnelDamageEffect,
  effectScalar: number,
  group: WeaponShotGroup,
  defender: UnitTypeDefinition
): PersonnelDamageDelta {
  // Conversion rates by hit type vs personnel
  // Penetrating hits (direct wounds): ~98% convert to casualties
  // Area effect (blast/shrapnel): ~85% convert to casualties
  // Soft component (ricochets, minor wounds): ~15% convert
  // Non-effect contacts (armor impacts/glancing hits): ~2% convert through incidental harm.
  const conversionRates = {
    penetrating: 0.98,
    areaEffect: 0.85,
    softComponent: 0.15,
    nonEffect: 0.02
  };

  const effectiveHits =
    hitTypeCounts.penetrating * conversionRates.penetrating +
    hitTypeCounts.areaEffect * conversionRates.areaEffect +
    hitTypeCounts.softComponent * conversionRates.softComponent +
    hitTypeCounts.nonEffect * conversionRates.nonEffect;
  const contactHits = isHighExplosivePersonnelRole(group.role)
    ? (hitTypeCounts.penetrating + hitTypeCounts.areaEffect) *
      effectScalar *
      personnelTargetExposureScalar(group.role, defender)
    : group.role === "antiTank"
      ? (hitTypeCounts.penetrating + hitTypeCounts.softComponent * 0.5 + hitTypeCounts.areaEffect * 0.25) * effectScalar
      : 0;
  const directPersonnelContacts = effectiveHits * effectScalar;

  const delta = capPersonnelEffect(
    softEffect,
    effectiveHits,
    effectScalar * personnelStatusOutcomeScalar(group.role, defender, softEffect),
    { contactHits }
  );
  const roundedOutcomeCount =
    roundDamageCount(delta.injured) +
    roundDamageCount(delta.wounded) +
    roundDamageCount(delta.severelyWounded) +
    roundDamageCount(delta.killed);
  if (
    group.role === "antiTank" &&
    directPersonnelContacts >= 0.35 &&
    roundedOutcomeCount <= 0 &&
    ["infantry", "specialist", "artillery", "recon"].includes(defender.class)
  ) {
    return { ...delta, wounded: 1 };
  }
  const blastMinimumContact = group.role === "airBomb" || group.role === "airRocket" ? 0.01 : 0.08;
  if (
    isHighExplosivePersonnelRole(group.role) &&
    contactHits >= blastMinimumContact &&
    roundedOutcomeCount <= 0 &&
    ["infantry", "specialist", "artillery", "recon", "vehicle"].includes(defender.class)
  ) {
    // Deterministic combat still needs low-probability blast contacts to leave a trace.
    // Near misses from bombs, rockets, mortars, and HE can produce a light casualty even
    // when the fractional casualty model would otherwise round every severity bucket to 0.
    return { ...delta, injured: 1 };
  }
  return delta;
}

function calculateEquipmentDamage(
  hitTypeCounts: { nonEffect: number; softComponent: number; penetrating: number; areaEffect: number },
  hardEffect: EquipmentDamageEffect,
  group: WeaponShotGroup,
  request: DamagePacketRequest,
  effectScalar: number
): EquipmentDamageDelta {
  // Equipment damage conversion by hit type
  // Penetrating: Full armor penetration logic applies
  // Area effect (HE): Moderate damage to exposed systems
  // Soft component: Minor damage (tracks, optics)
  // Non-effect: No equipment damage

  const armorScalar = penetrationEffectScalar(hardEffect, group, request);
  const equipmentOutcomeScalar = equipmentStatusOutcomeScalar(group.role, hardEffect.damageType, request.defenderDefinition);

  // Base damage from penetrating hits (full armor check)
  const penetratingDamage = {
    damaged: hitTypeCounts.penetrating * hardEffect.damaged * armorScalar,
    disabled: hitTypeCounts.penetrating * hardEffect.disabled * armorScalar,
    destroyed: hitTypeCounts.penetrating * hardEffect.destroyed * armorScalar
  };

  // Area effect causes reduced equipment damage (external components)
  const areaScalar = 0.3; // 30% of normal effect
  const areaDamage = {
    damaged: hitTypeCounts.areaEffect * hardEffect.damaged * areaScalar,
    disabled: hitTypeCounts.areaEffect * hardEffect.disabled * areaScalar,
    destroyed: 0 // Area effects rarely destroy armored vehicles outright
  };

  // Soft component hits cause only minor damage (tracks, optics, antenna)
  const softScalar = 0.15;
  const softDamage = {
    damaged: hitTypeCounts.softComponent * hardEffect.damaged * softScalar,
    disabled: hitTypeCounts.softComponent * hardEffect.disabled * softScalar * 0.5,
    destroyed: 0
  };

  const totalScalar = effectScalar * equipmentOutcomeScalar;
  const defenderIsAircraft = request.defenderDefinition.class === "air";
  const damagedThreshold = defenderIsAircraft ? 0.16 : 0.2;
  const disabledThreshold = defenderIsAircraft ? 0.12 : 0.2;
  const destroyedThreshold = defenderIsAircraft ? 0.1 : 0.2;
  const disabledScalar = defenderIsAircraft ? 1.15 : 1;
  const destroyedScalar = defenderIsAircraft ? 1.35 : 1;
  return {
    damaged: outcomeRound((penetratingDamage.damaged + areaDamage.damaged + softDamage.damaged) * totalScalar, damagedThreshold),
    disabled: outcomeRound((penetratingDamage.disabled + areaDamage.disabled + softDamage.disabled) * totalScalar * disabledScalar, disabledThreshold),
    destroyed: outcomeRound((penetratingDamage.destroyed + areaDamage.destroyed + softDamage.destroyed) * totalScalar * destroyedScalar, destroyedThreshold)
  };
}

function suppressionExposureScalar(group: WeaponShotGroup, defender: UnitTypeDefinition): number {
  if (defender.class === "tank" || defender.class === "vehicle" || defender.class === "air") {
    if (group.role === "smallArms") return 0.03;
    if (group.role === "machineGun") return 0.05;
    if (group.role === "antiTank") return 0.5;
    if (group.role === "directHe" || group.role === "indirectHe") return 0.35;
    if (group.role === "demolition") return 0.45;
    if (group.role === "airGun") return 0.25;
    if (group.role === "airRocket") return 0.65;
    if (group.role === "airBomb") return 0.8;
    return 0.1;
  }
  if (defender.class === "artillery" || defender.class === "recon") {
    if (group.role === "smallArms" || group.role === "machineGun") return 0.75;
    return 0.9;
  }
  return 1;
}

type PersonnelDamageKey = keyof PersonnelDamageDelta;
type PersonnelSourceKey = "fit" | "injured" | "wounded" | "severelyWounded";
type PersonnelTargetKey = "injured" | "wounded" | "severelyWounded" | "killed";
type EquipmentDamageKey = keyof EquipmentDamageDelta;
type EquipmentSourceKey = "operational" | "damaged" | "disabled";
type EquipmentTargetKey = "damaged" | "disabled" | "destroyed";
type PersonnelTransition = {
  readonly sources: readonly PersonnelSourceKey[];
  readonly target: PersonnelTargetKey;
  readonly sourceWeights: Partial<Record<PersonnelSourceKey, number>>;
};
type EquipmentTransition = {
  readonly sources: readonly EquipmentSourceKey[];
  readonly target: EquipmentTargetKey;
  readonly sourceWeights: Partial<Record<EquipmentSourceKey, number>>;
};

const PERSONNEL_TRANSITIONS: Record<PersonnelDamageKey, PersonnelTransition> = {
  killed: {
    sources: ["fit", "injured", "wounded", "severelyWounded"],
    target: "killed",
    // Combat contacts should primarily attrit currently effective personnel.
    // Existing casualties remain vulnerable, but at materially lower exposure.
    sourceWeights: { fit: 1, injured: 0.25, wounded: 0.08, severelyWounded: 0.04 }
  },
  severelyWounded: {
    sources: ["fit", "injured", "wounded"],
    target: "severelyWounded",
    sourceWeights: { fit: 1, injured: 0.3, wounded: 0.1 }
  },
  wounded: {
    sources: ["fit", "injured"],
    target: "wounded",
    sourceWeights: { fit: 1, injured: 0.25 }
  },
  injured: { sources: ["fit"], target: "injured", sourceWeights: { fit: 1 } }
};

const EQUIPMENT_TRANSITIONS: Record<EquipmentDamageKey, EquipmentTransition> = {
  destroyed: {
    sources: ["operational", "damaged", "disabled"],
    target: "destroyed",
    sourceWeights: { operational: 1, damaged: 0.45, disabled: 0.15 }
  },
  disabled: {
    sources: ["operational", "damaged"],
    target: "disabled",
    sourceWeights: { operational: 1, damaged: 0.5 }
  },
  damaged: { sources: ["operational"], target: "damaged", sourceWeights: { operational: 1 } }
};

function countEquipmentDelta(delta: EquipmentDamageDelta): number {
  return delta.destroyed + delta.disabled + delta.damaged;
}

function roundDamageCount(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function roundPersonnelDeltaPreservingMass(delta: PersonnelDamageDelta): PersonnelDamageDelta {
  const sanitized: PersonnelDamageDelta = {
    injured: Math.max(0, Number.isFinite(delta.injured) ? delta.injured : 0),
    wounded: Math.max(0, Number.isFinite(delta.wounded) ? delta.wounded : 0),
    severelyWounded: Math.max(0, Number.isFinite(delta.severelyWounded) ? delta.severelyWounded : 0),
    killed: Math.max(0, Number.isFinite(delta.killed) ? delta.killed : 0)
  };
  const roundedTotal = roundDamageCount(
    sanitized.injured + sanitized.wounded + sanitized.severelyWounded + sanitized.killed
  );
  if (roundedTotal <= 0) {
    return { ...EMPTY_PERSONNEL_DELTA };
  }
  const allocation = allocate(roundedTotal, [
    sanitized.killed,
    sanitized.severelyWounded,
    sanitized.wounded,
    sanitized.injured
  ]);
  return {
    killed: allocation[0] ?? 0,
    severelyWounded: allocation[1] ?? 0,
    wounded: allocation[2] ?? 0,
    injured: allocation[3] ?? 0
  };
}

function roundEquipmentDeltaPreservingMass(delta: EquipmentDamageDelta): EquipmentDamageDelta {
  const sanitized: EquipmentDamageDelta = {
    damaged: Math.max(0, Number.isFinite(delta.damaged) ? delta.damaged : 0),
    disabled: Math.max(0, Number.isFinite(delta.disabled) ? delta.disabled : 0),
    destroyed: Math.max(0, Number.isFinite(delta.destroyed) ? delta.destroyed : 0)
  };
  const roundedTotal = roundDamageCount(
    sanitized.damaged + sanitized.disabled + sanitized.destroyed
  );
  if (roundedTotal <= 0) {
    return { ...EMPTY_EQUIPMENT_DELTA };
  }
  const allocation = allocate(roundedTotal, [
    sanitized.destroyed,
    sanitized.disabled,
    sanitized.damaged
  ]);
  return {
    destroyed: allocation[0] ?? 0,
    disabled: allocation[1] ?? 0,
    damaged: allocation[2] ?? 0
  };
}

function eligiblePersonnelForTransition(
  pool: PersonnelStatusPool,
  transition: PersonnelTransition
): number {
  return transition.sources.reduce((sum, source) => (
    sum + Math.max(0, pool[source]) * Math.max(0, transition.sourceWeights[source] ?? 1)
  ), 0);
}

function allocateSourceTransitions<SourceKey extends string>(
  requested: number,
  sources: readonly SourceKey[],
  available: (source: SourceKey) => number,
  sourceWeights: Partial<Record<SourceKey, number>>
): number[] {
  const remainingBySource = sources.map((source) => Math.max(0, Math.round(available(source))));
  const allocations = sources.map(() => 0);
  let remaining = Math.min(roundDamageCount(requested), remainingBySource.reduce((sum, count) => sum + count, 0));

  while (remaining > 0) {
    let bestIndex = -1;
    let bestScore = 0;
    sources.forEach((source, index) => {
      const score = remainingBySource[index] * Math.max(0, sourceWeights[source] ?? 1);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) {
      break;
    }
    remainingBySource[bestIndex] -= 1;
    allocations[bestIndex] += 1;
    remaining -= 1;
  }

  return allocations;
}

function applyPersonnelTransitionToPool(
  pool: PersonnelStatusPool,
  amount: number,
  transition: PersonnelTransition
): number {
  let applied = 0;
  const allocations = allocateSourceTransitions(
    amount,
    transition.sources,
    (source) => pool[source],
    transition.sourceWeights
  );
  transition.sources.forEach((source, index) => {
    const taken = Math.min(Math.max(0, pool[source]), allocations[index] ?? 0);
    pool[source] -= taken;
    pool[transition.target] += taken;
    applied += taken;
  });
  return applied;
}

function eligibleEquipmentForTransition(
  pool: VehicleStatusPool,
  transition: EquipmentTransition
): number {
  return transition.sources.reduce((sum, source) => (
    sum + Math.max(0, pool[source]) * Math.max(0, transition.sourceWeights[source] ?? 1)
  ), 0);
}

function applyEquipmentTransitionToPool(
  pool: VehicleStatusPool,
  amount: number,
  transition: EquipmentTransition
): number {
  let applied = 0;
  const allocations = allocateSourceTransitions(
    amount,
    transition.sources,
    (source) => pool[source],
    transition.sourceWeights
  );
  transition.sources.forEach((source, index) => {
    const taken = Math.min(Math.max(0, pool[source]), allocations[index] ?? 0);
    pool[source] -= taken;
    pool[transition.target] += taken;
    applied += taken;
  });
  return applied;
}

function resolveShotBudget(request: DamagePacketRequest): number {
  if (Number.isFinite(request.attackResult.shots) && request.attackResult.shots > 0) {
    return request.attackResult.shots;
  }
  return request.attackerDefinition.weaponModel?.groups.reduce((sum, group) => sum + Math.max(0, group.shots), 0) ?? 0;
}

function resolvePacketAttackerStance(request: DamagePacketRequest): AttackerContext["stance"] | undefined {
  if (request.attackerStance) {
    return request.attackerStance;
  }
  return request.attackResult.shotBreakdown?.posture === "assault" ? "assault" : undefined;
}

/**
 * Calculate component-specific damage based on hit types and weapon's component damage spec.
 * Maps weapon hits to specific vehicle systems for detailed repair tracking.
 */
function calculateComponentDamage(
  hitTypeCounts: { nonEffect: number; softComponent: number; penetrating: number; areaEffect: number },
  componentSpec: ComponentDamageSpec | undefined,
  damagePerHit: EquipmentDamageDelta
): ComponentDamageDelta {
  const result: ComponentDamageDelta = {
    damaged: {},
    disabled: {},
    destroyed: {}
  };

  if (!componentSpec) {
    return result;
  }

  // Helper to distribute damage to components
  const applyDamageToComponents = (
    hitCount: number,
    components: readonly VehicleComponent[] | undefined,
    damagedCount: number,
    disabledCount: number,
    destroyedCount: number
  ): void => {
    if (!components || components.length === 0 || hitCount <= 0) return;

    // Distribute damage across specified components
    const damagePerComponent = {
      damaged: damagedCount / components.length,
      disabled: disabledCount / components.length,
      destroyed: destroyedCount / components.length
    };

    components.forEach((component) => {
      result.damaged[component] = (result.damaged[component] ?? 0) + damagePerComponent.damaged;
      result.disabled[component] = (result.disabled[component] ?? 0) + damagePerComponent.disabled;
      result.destroyed[component] = (result.destroyed[component] ?? 0) + damagePerComponent.destroyed;
    });
  };

  // Apply damage from each hit type to specified components
  if (componentSpec.penetrating) {
    applyDamageToComponents(
      hitTypeCounts.penetrating,
      componentSpec.penetrating,
      damagePerHit.damaged,
      damagePerHit.disabled,
      damagePerHit.destroyed
    );
  }

  if (componentSpec.softComponent) {
    // Soft component damage is reduced (tracks, optics, antenna damage)
    applyDamageToComponents(
      hitTypeCounts.softComponent,
      componentSpec.softComponent,
      damagePerHit.damaged * 0.3,
      damagePerHit.disabled * 0.1,
      0
    );
  }

  if (componentSpec.areaEffect) {
    // Area effect causes wider but less severe damage
    applyDamageToComponents(
      hitTypeCounts.areaEffect,
      componentSpec.areaEffect,
      damagePerHit.damaged * 0.5,
      damagePerHit.disabled * 0.2,
      0
    );
  }

  return result;
}

/**
 * Determine default component damage specification based on weapon role.
 * Used when weapon doesn't explicitly specify component damage mapping.
 */
function getDefaultComponentSpec(role: string): ComponentDamageSpec {
  switch (role) {
    case "smallArms":
    case "machineGun":
      return {
        penetrating: [],
        softComponent: ["optics", "radio", "tracks"],
        areaEffect: []
      };
    case "antiTank":
      return {
        penetrating: ["armor", "gun", "turret", "engine"],
        softComponent: ["tracks", "optics"],
        areaEffect: []
      };
    case "directHe":
    case "indirectHe":
      return {
        penetrating: [],
        softComponent: ["tracks", "optics", "radio"],
        areaEffect: ["tracks", "suspension", "optics", "radio", "gun"]
      };
    case "airBomb":
    case "airRocket":
      return {
        penetrating: ["armor", "engine", "fuelSystem"],
        softComponent: ["tracks", "optics", "radio", "turret"],
        areaEffect: ["engine", "tracks", "suspension", "gun", "turret", "optics", "radio"]
      };
    default:
      return {
        penetrating: [],
        softComponent: ["optics"],
        areaEffect: []
      };
  }
}

function distributeAppliedField(
  hits: readonly WeaponHitSummary[],
  total: number,
  readField: (hit: WeaponHitSummary) => number
): number[] {
  return allocate(total, hits.map(readField));
}

function scaleComponentDamage(delta: ComponentDamageDelta | undefined, scalar: number): ComponentDamageDelta | undefined {
  if (!delta) {
    return undefined;
  }
  const scaleEntries = (entries: Partial<Record<VehicleComponent, number>>): Partial<Record<VehicleComponent, number>> => {
    const scaled: Partial<Record<VehicleComponent, number>> = {};
    (Object.entries(entries) as [VehicleComponent, number][]).forEach(([component, value]) => {
      const next = value * scalar;
      if (next > 0) {
        scaled[component] = next;
      }
    });
    return scaled;
  };
  return {
    damaged: scaleEntries(delta.damaged),
    disabled: scaleEntries(delta.disabled),
    destroyed: scaleEntries(delta.destroyed)
  };
}

function aggregateComponentDamage(hits: readonly WeaponHitSummary[]): ComponentDamageDelta {
  const total: ComponentDamageDelta = { damaged: {}, disabled: {}, destroyed: {} };
  hits.forEach((hit) => {
    const componentDamage = hit.componentDamage;
    if (!componentDamage) return;
    (Object.keys(componentDamage.damaged) as VehicleComponent[]).forEach((component) => {
      total.damaged[component] = (total.damaged[component] ?? 0) + (componentDamage.damaged[component] ?? 0);
    });
    (Object.keys(componentDamage.disabled) as VehicleComponent[]).forEach((component) => {
      total.disabled[component] = (total.disabled[component] ?? 0) + (componentDamage.disabled[component] ?? 0);
    });
    (Object.keys(componentDamage.destroyed) as VehicleComponent[]).forEach((component) => {
      total.destroyed[component] = (total.destroyed[component] ?? 0) + (componentDamage.destroyed[component] ?? 0);
    });
  });
  return total;
}

function alignWeaponHitsToAppliedDamage(
  hits: readonly WeaponHitSummary[],
  appliedPersonnel: PersonnelDamageDelta,
  rawEquipment: EquipmentDamageDelta,
  appliedEquipment: EquipmentDamageDelta
): WeaponHitSummary[] {
  const personnelAllocations: Record<PersonnelDamageKey, number[]> = {
    killed: distributeAppliedField(hits, appliedPersonnel.killed, (hit) => hit.personnel.killed),
    severelyWounded: distributeAppliedField(hits, appliedPersonnel.severelyWounded, (hit) => hit.personnel.severelyWounded),
    wounded: distributeAppliedField(hits, appliedPersonnel.wounded, (hit) => hit.personnel.wounded),
    injured: distributeAppliedField(hits, appliedPersonnel.injured, (hit) => hit.personnel.injured)
  };
  const equipmentAllocations: Record<EquipmentDamageKey, number[]> = {
    destroyed: distributeAppliedField(hits, appliedEquipment.destroyed, (hit) => hit.equipment.destroyed),
    disabled: distributeAppliedField(hits, appliedEquipment.disabled, (hit) => hit.equipment.disabled),
    damaged: distributeAppliedField(hits, appliedEquipment.damaged, (hit) => hit.equipment.damaged)
  };
  const rawEquipmentEvents = Math.max(1, countEquipmentDelta(rawEquipment));
  const componentScalar = countEquipmentDelta(appliedEquipment) / rawEquipmentEvents;

  return hits.map((hit, index) => ({
    ...hit,
    personnel: {
      killed: personnelAllocations.killed[index] ?? 0,
      severelyWounded: personnelAllocations.severelyWounded[index] ?? 0,
      wounded: personnelAllocations.wounded[index] ?? 0,
      injured: personnelAllocations.injured[index] ?? 0
    },
    equipment: {
      destroyed: equipmentAllocations.destroyed[index] ?? 0,
      disabled: equipmentAllocations.disabled[index] ?? 0,
      damaged: equipmentAllocations.damaged[index] ?? 0
    },
    componentDamage: scaleComponentDamage(hit.componentDamage, componentScalar)
  }));
}

export function resolveDamagePacket(request: DamagePacketRequest): DamagePacket {
  const model = request.attackerDefinition.weaponModel;
  const status = ensureFormationStatus(request.defender, request.defender.formationKey);
  const personnelAvailable = livingPersonnel(status);
  const equipmentAvailable = nonDestroyedEquipment(status);
  const effectScalar = clamp(
    (request.effectScalar ?? 1) *
      defenderAmmoVulnerabilityScalar(request.defender, request.defenderDefinition),
    0,
    12
  );
  const suppressionScalar = clamp(request.suppressionScalar ?? 1, 0, 12);
  const accuracy = clamp(request.attackResult.accuracy / 100, 0, 1);
  const shotBudget = Math.max(0, resolveShotBudget(request));
  const attackerStance = resolvePacketAttackerStance(request);
  const shotCountTotal = model?.groups.reduce((sum, group) => sum + Math.max(0, group.shots), 0) ?? 0;

  if (!model || model.groups.length === 0 || accuracy <= 0 || shotBudget <= 0 || shotCountTotal <= 0) {
    return {
      personnel: { ...EMPTY_PERSONNEL_DELTA },
      equipment: { ...EMPTY_EQUIPMENT_DELTA },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    };
  }

  let personnel = { ...EMPTY_PERSONNEL_DELTA };
  let equipment = { ...EMPTY_EQUIPMENT_DELTA };
  let suppression = 0;
  let fortificationDamage = 0;
  const weaponHits: WeaponHitSummary[] = [];
  const damageTypesUsed = new Set<WeaponDamageType>();

  model.groups.forEach((group) => {
    const groupAccuracy = accuracy * (group.accuracyMultiplier ?? 1);
    const baseShots = Math.max(0, group.shots);
    const shotShare = baseShots / shotCountTotal;
    const shots = shotBudget * shotShare;
    const expectedHits = shots * clamp(groupAccuracy, 0, 0.95);

    const hitDistribution = resolveWeaponHitDistribution(group, request.defenderDefinition);

    const weaponAP = group.armorPenetration ?? group.hardEffect?.armorPenetration ?? request.attackerDefinition.ap ?? 0;
    const targetArmor = pickFacingArmor(
      request.attackerHex,
      request.defenderHex,
      request.targetFacing,
      request.defenderDefinition,
      request.attackerDefinition.class,
      attackerStance
    );
    const effectiveDistribution = adjustHitDistributionForArmor(
      hitDistribution,
      group.role,
      group.hardEffect?.damageType,
      request.defenderDefinition,
      weaponAP,
      targetArmor
    );

    const hitTypeCounts = distributeHits(expectedHits, effectiveDistribution);

    const groupPersonnel = personnelAvailable > 0 && group.softEffect
      ? calculatePersonnelCasualties(hitTypeCounts, group.softEffect, effectScalar, group, request.defenderDefinition)
      : { ...EMPTY_PERSONNEL_DELTA };
    const groupEquipment = equipmentAvailable > 0 && group.hardEffect
      ? calculateEquipmentDamage(hitTypeCounts, group.hardEffect, group, request, effectScalar)
      : { ...EMPTY_EQUIPMENT_DELTA };

    damageTypesUsed.add(inferWeaponDamageType(group.role, group.hardEffect?.damageType));

    const groupSuppression =
      expectedHits *
      (group.suppressionPerHit ?? 0) *
      effectScalar *
      suppressionScalar *
      suppressionExposureScalar(group, request.defenderDefinition);
    const groupFortificationDamage = expectedHits * (group.fortificationDamagePerHit ?? 0) * effectScalar;

    personnel = addPersonnel(personnel, groupPersonnel);
    equipment = addEquipment(equipment, groupEquipment);
    suppression += groupSuppression;
    fortificationDamage += groupFortificationDamage;

    // Calculate component damage for this weapon group
    const componentSpec = group.hardEffect?.componentDamage ?? getDefaultComponentSpec(group.role);
    const componentDamage = calculateComponentDamage(hitTypeCounts, componentSpec, groupEquipment);

    weaponHits.push({
      id: group.id,
      label: group.label,
      baseShots,
      shots: Math.round(shots),
      expectedHits,
      personnel: groupPersonnel,
      equipment: groupEquipment,
      suppression: groupSuppression,
      fortificationDamage: groupFortificationDamage,
      damageType: group.hardEffect ? inferWeaponDamageType(group.role, group.hardEffect.damageType) : undefined,
      componentDamage,
      hitTypeCounts
    });
  });

  const capStatus = structuredClone(status);
  const appliedPersonnel = applyPersonnelDelta(capStatus, personnel);
  const appliedEquipment = applyEquipmentDelta(capStatus, equipment);
  const appliedWeaponHits = alignWeaponHitsToAppliedDamage(weaponHits, appliedPersonnel, equipment, appliedEquipment);
  const appliedComponentDamage = aggregateComponentDamage(appliedWeaponHits);

  const readinessLoss = estimateReadinessLoss(request.defender, appliedPersonnel, appliedEquipment);
  return {
    personnel: appliedPersonnel,
    equipment: appliedEquipment,
    suppression,
    fortificationDamage,
    readinessLoss,
    weaponHits: appliedWeaponHits,
    componentDamage: appliedComponentDamage,
    damageTypesUsed
  };
}

function estimateReadinessLoss(
  defender: ScenarioUnit,
  personnel: PersonnelDamageDelta,
  equipment: EquipmentDamageDelta
): number {
  const beforeStrength = deriveStrengthFromStatus(ensureFormationStatus(defender, defender.formationKey), defender.strength);
  const clone = structuredClone(defender);
  applyDamagePacketToUnit(clone, {
    personnel,
    equipment,
    suppression: 0,
    fortificationDamage: 0,
    readinessLoss: 0,
    weaponHits: []
  });
  return Math.max(0, Math.round((beforeStrength - clone.strength) * 100) / 100);
}

function allocate(total: number, weights: readonly number[]): number[] {
  const roundedTotal = Math.max(0, Math.round(total));
  const weightTotal = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (roundedTotal <= 0 || weightTotal <= 0) {
    return weights.map(() => 0);
  }
  let remaining = roundedTotal;
  return weights.map((weight, index) => {
    const value = index === weights.length - 1
      ? remaining
      : Math.min(remaining, Math.round((Math.max(0, weight) / weightTotal) * roundedTotal));
    remaining -= value;
    return value;
  });
}

function contactPressurePromotionBudget(totalRequested: number, capacity: number): number {
  const maxCapacity = Math.max(1, Math.round(capacity));
  const pressureRatio = Math.max(0, totalRequested) / maxCapacity;
  if (pressureRatio <= 1) {
    return 0;
  }
  // Once contacts exceed available targets, the surplus represents repeat impacts on
  // already-hit people or vehicles. Convert part of that surplus into severity upgrades
  // instead of dropping it at the capacity cap.
  return Math.round(maxCapacity * clamp((pressureRatio - 1) * 0.25, 0, 2));
}

function promotePersonnelSeverityForContactPressure(
  capped: PersonnelDamageDelta,
  totalRequested: number,
  capacity: number
): PersonnelDamageDelta {
  const promoted = { ...capped };
  let budget = contactPressurePromotionBudget(totalRequested, capacity);

  const promote = (from: PersonnelTargetKey, to: PersonnelTargetKey): void => {
    if (budget <= 0) {
      return;
    }
    const count = Math.min(promoted[from], budget);
    promoted[from] -= count;
    promoted[to] += count;
    budget -= count;
  };

  // Extra contacts in a saturated target cannot invent more people, but they can
  // represent second and third impacts that push existing effects up the severity chain.
  while (budget > 0 && (promoted.injured > 0 || promoted.wounded > 0 || promoted.severelyWounded > 0)) {
    const before = budget;
    promote("injured", "wounded");
    promote("wounded", "severelyWounded");
    promote("severelyWounded", "killed");
    if (budget === before) {
      break;
    }
  }

  return promoted;
}

function promoteEquipmentSeverityForContactPressure(
  capped: EquipmentDamageDelta,
  totalRequested: number,
  capacity: number
): EquipmentDamageDelta {
  const promoted = { ...capped };
  let budget = contactPressurePromotionBudget(totalRequested, capacity);

  const promote = (from: EquipmentTargetKey, to: EquipmentTargetKey): void => {
    if (budget <= 0) {
      return;
    }
    const count = Math.min(promoted[from], budget);
    promoted[from] -= count;
    promoted[to] += count;
    budget -= count;
  };

  while (budget > 0 && (promoted.damaged > 0 || promoted.disabled > 0)) {
    const before = budget;
    promote("damaged", "disabled");
    promote("disabled", "destroyed");
    if (budget === before) {
      break;
    }
  }

  return promoted;
}

function scalePersonnelDeltaToCapacity(delta: PersonnelDamageDelta, capacity: number): PersonnelDamageDelta {
  const rounded: PersonnelDamageDelta = {
    injured: roundDamageCount(delta.injured),
    wounded: roundDamageCount(delta.wounded),
    severelyWounded: roundDamageCount(delta.severelyWounded),
    killed: roundDamageCount(delta.killed)
  };
  const maxCapacity = Math.max(0, Math.round(capacity));
  if (maxCapacity <= 0) {
    return { ...EMPTY_PERSONNEL_DELTA };
  }
  const totalRequested = countPersonnelDelta(rounded);
  if (totalRequested <= maxCapacity) {
    return rounded;
  }
  const scaled = allocate(maxCapacity, [
    rounded.injured,
    rounded.wounded,
    rounded.severelyWounded,
    rounded.killed
  ]);
  return promotePersonnelSeverityForContactPressure({
    injured: scaled[0] ?? 0,
    wounded: scaled[1] ?? 0,
    severelyWounded: scaled[2] ?? 0,
    killed: scaled[3] ?? 0
  }, totalRequested, maxCapacity);
}

function scaleEquipmentDeltaToCapacity(delta: EquipmentDamageDelta, capacity: number): EquipmentDamageDelta {
  const rounded: EquipmentDamageDelta = {
    damaged: roundDamageCount(delta.damaged),
    disabled: roundDamageCount(delta.disabled),
    destroyed: roundDamageCount(delta.destroyed)
  };
  const maxCapacity = Math.max(0, Math.round(capacity));
  if (maxCapacity <= 0) {
    return { ...EMPTY_EQUIPMENT_DELTA };
  }
  const totalRequested = countEquipmentDelta(rounded);
  if (totalRequested <= maxCapacity) {
    return rounded;
  }
  const scaled = allocate(maxCapacity, [
    rounded.damaged,
    rounded.disabled,
    rounded.destroyed
  ]);
  return promoteEquipmentSeverityForContactPressure({
    damaged: scaled[0] ?? 0,
    disabled: scaled[1] ?? 0,
    destroyed: scaled[2] ?? 0
  }, totalRequested, maxCapacity);
}

function applyPersonnelDelta(status: FormationStatus, delta: PersonnelDamageDelta): PersonnelDamageDelta {
  const applied: PersonnelDamageDelta = { ...EMPTY_PERSONNEL_DELTA };
  const capacity = livingPersonnel(status);
  const accumulated = roundPersonnelDeltaPreservingMass(delta);
  const requested = scalePersonnelDeltaToCapacity(accumulated, capacity);
  const directOrder: readonly PersonnelDamageKey[] = ["killed", "severelyWounded", "wounded", "injured"];

  const applyTransition = (key: PersonnelDamageKey, amount: number): number => {
    if (amount <= 0) return 0;
    const transition = PERSONNEL_TRANSITIONS[key];
    const pools = Object.values(status.personnel).filter((pool) => eligiblePersonnelForTransition(pool, transition) > 0);
    if (pools.length === 0) return 0;
    const allocations = allocate(amount, pools.map((pool) => eligiblePersonnelForTransition(pool, transition)));
    let transitionApplied = 0;
    pools.forEach((pool, index) => {
      transitionApplied += applyPersonnelTransitionToPool(pool, allocations[index] ?? 0, transition);
    });
    return transitionApplied;
  };

  directOrder.forEach((key) => {
    const amount = roundDamageCount(requested[key]);
    if (amount <= 0) return;
    applied[key] += applyTransition(key, amount);
  });

  return applied;
}

function applyEquipmentDelta(status: FormationStatus, delta: EquipmentDamageDelta): EquipmentDamageDelta {
  const applied: EquipmentDamageDelta = { ...EMPTY_EQUIPMENT_DELTA };
  const capacity = nonDestroyedEquipment(status);
  const requested = scaleEquipmentDeltaToCapacity(roundEquipmentDeltaPreservingMass(delta), capacity);
  const directOrder: readonly EquipmentDamageKey[] = ["destroyed", "disabled", "damaged"];

  const applyTransition = (key: EquipmentDamageKey, amount: number): number => {
    if (amount <= 0) return 0;
    const transition = EQUIPMENT_TRANSITIONS[key];
    const pools = Object.values(status.equipment).filter((pool) => eligibleEquipmentForTransition(pool, transition) > 0);
    if (pools.length === 0) return 0;
    const allocations = allocate(amount, pools.map((pool) => eligibleEquipmentForTransition(pool, transition)));
    let transitionApplied = 0;
    pools.forEach((pool, index) => {
      transitionApplied += applyEquipmentTransitionToPool(pool, allocations[index] ?? 0, transition);
    });
    return transitionApplied;
  };

  directOrder.forEach((key) => {
    const amount = roundDamageCount(requested[key]);
    if (amount <= 0) return;
    applied[key] += applyTransition(key, amount);
  });

  return applied;
}

export function applyDamagePacketToUnit(unit: ScenarioUnit, packet: DamagePacket): void {
  const status = ensureFormationStatus(unit, unit.formationKey);
  applyPersonnelDelta(status, packet.personnel);
  applyEquipmentDelta(status, packet.equipment);
  status.suppression = Math.max(0, Math.round((status.suppression ?? 0) + packet.suppression));
  unit.strength = deriveStrengthFromStatus(status, unit.strength);
}

function summarizePersonnel(status: FormationStatus | undefined): PersonnelStatusSummary {
  const readiness = calculateFormationReadiness(status, 100).breakdown.personnel;
  const summary = Object.values(status?.personnel ?? {}).reduce(
    (total, pool) => ({
      fit: total.fit + pool.fit,
      injured: total.injured + pool.injured,
      wounded: total.wounded + pool.wounded,
      severelyWounded: total.severelyWounded + pool.severelyWounded,
      killed: total.killed + pool.killed
    }),
    { fit: 0, injured: 0, wounded: 0, severelyWounded: 0, killed: 0 }
  );
  return {
    ...summary,
    total: summary.fit + summary.injured + summary.wounded + summary.severelyWounded + summary.killed,
    casualties: summary.injured + summary.wounded + summary.severelyWounded + summary.killed,
    nonEffective: Math.round((readiness.total - readiness.effective) * 10) / 10,
    effective: readiness.effective,
    readiness: readiness.readiness
  };
}

function summarizeEquipment(status: FormationStatus | undefined): EquipmentStatusSummary {
  const readiness = calculateFormationReadiness(status, 100).breakdown.equipment;
  const summary = Object.values(status?.equipment ?? {}).reduce(
    (total, pool) => ({
      operational: total.operational + pool.operational,
      damaged: total.damaged + pool.damaged,
      disabled: total.disabled + pool.disabled,
      destroyed: total.destroyed + pool.destroyed
    }),
    { operational: 0, damaged: 0, disabled: 0, destroyed: 0 }
  );
  return {
    ...summary,
    total: summary.operational + summary.damaged + summary.disabled + summary.destroyed,
    losses: summary.disabled + summary.destroyed,
    nonOperational: summary.damaged + summary.disabled + summary.destroyed,
    effective: readiness?.effective ?? 0,
    readiness: readiness?.readiness ?? 0
  };
}

export function summarizeFormationStatus(status: FormationStatus | undefined, fallbackStrength = 100): FormationStatusSummary {
  const readiness = calculateFormationReadiness(status, fallbackStrength);
  return {
    personnel: summarizePersonnel(status),
    equipment: summarizeEquipment(status),
    suppression: Math.max(0, Math.round(status?.suppression ?? 0)),
    readiness: readiness.readiness,
    readinessBreakdown: readiness.breakdown
  };
}

function formatReadinessLoss(value: number): string {
  if (Number.isInteger(value)) return value.toFixed(0);
  return Math.abs(value * 10 - Math.round(value * 10)) < 0.001 ? value.toFixed(1) : value.toFixed(2);
}

export function describeDamagePacket(packet: DamagePacket): string {
  const personnelBits: string[] = [];
  if (packet.personnel.killed > 0) personnelBits.push(`${packet.personnel.killed} KIA`);
  if (packet.personnel.severelyWounded > 0) personnelBits.push(`${packet.personnel.severelyWounded} severe`);
  if (packet.personnel.wounded > 0) personnelBits.push(`${packet.personnel.wounded} wounded`);
  if (packet.personnel.injured > 0) personnelBits.push(`${packet.personnel.injured} injured`);
  const equipmentBits: string[] = [];
  if (packet.equipment.destroyed > 0) equipmentBits.push(`${packet.equipment.destroyed} destroyed`);
  if (packet.equipment.disabled > 0) equipmentBits.push(`${packet.equipment.disabled} disabled`);
  if (packet.equipment.damaged > 0) equipmentBits.push(`${packet.equipment.damaged} damaged`);
  const parts = [
    personnelBits.length > 0 ? personnelBits.join(", ") : "no personnel losses",
    equipmentBits.length > 0 ? equipmentBits.join(", ") : "no equipment losses",
    `readiness -${formatReadinessLoss(packet.readinessLoss)}`
  ];
  return parts.join("; ");
}
