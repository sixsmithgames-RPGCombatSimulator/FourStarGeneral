import { combat as combatBalance } from "./balance";
import type {
  HitDistribution,
  PersonnelDamageEffect,
  UnitTypeDefinition,
  WeaponDamageRole,
  WeaponDamageType,
  WeaponShotGroup
} from "./types";

export function inferWeaponDamageType(
  role: WeaponDamageRole,
  explicit?: WeaponDamageType
): WeaponDamageType {
  if (explicit) return explicit;
  if (role === "antiTank") return "kinetic";
  if (isHighExplosivePersonnelRole(role)) {
    return "explosive";
  }
  return "bullet";
}

export function isHighExplosivePersonnelRole(role: WeaponDamageRole): boolean {
  return role === "directHe" ||
    role === "indirectHe" ||
    role === "demolition" ||
    role === "airBomb" ||
    role === "airRocket";
}

export function isSoftSkinnedSupportVehicle(defender: UnitTypeDefinition): boolean {
  return defender.class === "vehicle" &&
    (defender.armor?.front ?? 0) <= 3 &&
    defender.combat.role === "support";
}

export function isProtectedEquipmentTarget(defender: UnitTypeDefinition): boolean {
  return defender.class === "tank" ||
    defender.class === "air" ||
    (defender.class === "vehicle" && !isSoftSkinnedSupportVehicle(defender));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isArmorPiercing(role: WeaponDamageRole, damageType: WeaponDamageType): boolean {
  return role === "antiTank" || damageType === "kinetic" || damageType === "shapedCharge";
}

function isBlastWeapon(role: WeaponDamageRole, damageType: WeaponDamageType): boolean {
  return damageType === "explosive" ||
    damageType === "fragment" ||
    isHighExplosivePersonnelRole(role);
}

function retainedPenetrationShare(
  role: WeaponDamageRole,
  damageType: WeaponDamageType,
  margin: number
): number {
  if (margin >= 0) return 1;
  if (role === "smallArms" || role === "machineGun" || damageType === "bullet") {
    return 0;
  }
  if (isBlastWeapon(role, damageType)) {
    if (margin <= -8) return 0.02;
    if (margin <= -6) return 0.05;
    if (margin <= -4) return 0.1;
    if (margin <= -2) return 0.18;
    return 0.32;
  }
  if (margin <= -8) return 0;
  if (margin <= -6) return 0.02;
  if (margin <= -4) return 0.06;
  if (margin <= -2) return 0.14;
  return 0.28;
}

export function penetrationDamageScalar(
  role: WeaponDamageRole,
  damageType: WeaponDamageType | undefined,
  margin: number,
  facingArmor: number
): number {
  const resolvedDamageType = inferWeaponDamageType(role, damageType);
  if (facingArmor <= 0) return 1;
  if (margin >= 0) {
    const base = role === "airGun" || resolvedDamageType === "bullet" ? 0.65 : 1;
    const bonus = margin * combatBalance.penetration.positiveDamageBonusPerPoint;
    return clamp(base + bonus, 0.1, role === "airGun" ? 1.15 : 1.8);
  }
  if (role === "smallArms" || role === "machineGun" || resolvedDamageType === "bullet") {
    return 0;
  }
  const floor = isBlastWeapon(role, resolvedDamageType) ? 0.015 : 0.005;
  return clamp(Math.exp(margin * 0.45), floor, 0.75);
}

export function adjustHitDistributionForArmor(
  distribution: HitDistribution,
  role: WeaponDamageRole,
  damageType: WeaponDamageType | undefined,
  defender: UnitTypeDefinition,
  weaponAP: number,
  facingArmor: number
): HitDistribution {
  const margin = weaponAP - facingArmor;
  if (!isProtectedEquipmentTarget(defender) || facingArmor <= 0 || distribution.penetrating <= 0) {
    return distribution;
  }

  const resolvedDamageType = inferWeaponDamageType(role, damageType);
  if (margin >= 0) {
    if (!isArmorPiercing(role, resolvedDamageType)) {
      return distribution;
    }
    const upgrade = clamp(margin * 0.06, 0, 0.35);
    const nonEffectToPenetrating = distribution.nonEffect * upgrade * 0.5;
    const nonEffectToSoft = distribution.nonEffect * upgrade * 0.25;
    const softToPenetrating = distribution.softComponent * upgrade;

    return {
      nonEffect: distribution.nonEffect - nonEffectToPenetrating - nonEffectToSoft,
      softComponent: distribution.softComponent + nonEffectToSoft - softToPenetrating,
      penetrating: distribution.penetrating + nonEffectToPenetrating + softToPenetrating,
      areaEffect: distribution.areaEffect
    };
  }

  const retained = retainedPenetrationShare(role, resolvedDamageType, margin);
  const displaced = distribution.penetrating * (1 - retained);
  const apLike = isArmorPiercing(role, resolvedDamageType);
  const blastLike = isBlastWeapon(role, resolvedDamageType);
  const softShare = apLike
    ? (margin <= -6 ? 0.1 : margin <= -3 ? 0.16 : 0.24)
    : blastLike
      ? 0.36
      : 0.08;
  const areaShare = blastLike ? 0.18 : 0;
  const nonEffectShare = Math.max(0, 1 - softShare - areaShare);

  return {
    nonEffect: distribution.nonEffect + displaced * nonEffectShare,
    softComponent: distribution.softComponent + displaced * softShare,
    penetrating: distribution.penetrating * retained,
    areaEffect: distribution.areaEffect + displaced * areaShare
  };
}

export function equipmentStatusOutcomeScalar(
  role: WeaponDamageRole,
  damageType: WeaponDamageType | undefined,
  defender: UnitTypeDefinition
): number {
  const resolvedDamageType = inferWeaponDamageType(role, damageType);
  if (defender.class === "air") {
    if (role === "smallArms" || role === "machineGun") return 0.2;
    if (role === "airGun") return 0.75;
    return 0.65;
  }
  if (defender.class === "tank") {
    if (role === "airGun") return 0.12;
    if (role === "airRocket") return 0.26;
    if (role === "airBomb") return 0.24;
    if (resolvedDamageType === "shapedCharge") return 0.32;
    if (role === "antiTank" || resolvedDamageType === "kinetic") return 0.24;
    if (role === "demolition") return 0.45;
    if (role === "directHe" || role === "indirectHe") return 0.28;
    return 0.15;
  }
  if (defender.class === "vehicle") {
    if (isSoftSkinnedSupportVehicle(defender)) {
      if (role === "smallArms" || role === "machineGun") return 0.35;
      return 0.85;
    }
    if (role === "airGun") return 0.2;
    if (role === "antiTank" || resolvedDamageType === "kinetic" || resolvedDamageType === "shapedCharge") return 0.45;
    return 0.4;
  }
  if (defender.class === "artillery" || defender.class === "recon") {
    if (role === "smallArms" || role === "machineGun") return 0.55;
    return 0.75;
  }
  return 1;
}

function defaultHitDistributionForRole(
  role: WeaponDamageRole,
  damageType: WeaponDamageType,
  defender: UnitTypeDefinition
): HitDistribution {
  if (role === "unarmed") {
    return { nonEffect: 1, softComponent: 0, penetrating: 0, areaEffect: 0 };
  }

  const protectedTarget = isProtectedEquipmentTarget(defender);
  const exposedCrewTarget = defender.class === "artillery" || defender.class === "recon";
  const softSkinnedVehicle = isSoftSkinnedSupportVehicle(defender);
  const personnelTarget = defender.class === "infantry" || defender.class === "specialist";
  const blastWeapon = damageType === "explosive" ||
    damageType === "fragment" ||
    role === "directHe" ||
    role === "indirectHe" ||
    role === "demolition" ||
    role === "airBomb" ||
    role === "airRocket";
  const armorPiercing = role === "antiTank" || damageType === "kinetic" || damageType === "shapedCharge";

  if (personnelTarget) {
    if (blastWeapon) return { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1 };
    if (role === "airGun") return { nonEffect: 0.1, softComponent: 0, penetrating: 0, areaEffect: 0.9 };
    if (armorPiercing) return { nonEffect: 0.2, softComponent: 0.3, penetrating: 0.5, areaEffect: 0 };
    if (role === "smallArms" || role === "machineGun") {
      return { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 };
    }
    return { nonEffect: 0.05, softComponent: 0, penetrating: 0.95, areaEffect: 0 };
  }

  if (protectedTarget) {
    if (role === "smallArms" || role === "machineGun") {
      return { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 };
    }
    if (role === "airGun") return { nonEffect: 0.75, softComponent: 0.1, penetrating: 0.15, areaEffect: 0 };
    if (role === "airBomb") return { nonEffect: 0.15, softComponent: 0.3, penetrating: 0.55, areaEffect: 0 };
    if (role === "airRocket") return { nonEffect: 0.2, softComponent: 0.35, penetrating: 0.45, areaEffect: 0 };
    if (role === "demolition") return { nonEffect: 0.25, softComponent: 0.35, penetrating: 0.4, areaEffect: 0 };
    if (armorPiercing) return { nonEffect: 0.15, softComponent: 0.25, penetrating: 0.6, areaEffect: 0 };
    if (blastWeapon) return { nonEffect: 0.45, softComponent: 0.35, penetrating: 0.2, areaEffect: 0 };
    return { nonEffect: 0.7, softComponent: 0.2, penetrating: 0.1, areaEffect: 0 };
  }

  if (exposedCrewTarget || softSkinnedVehicle) {
    if (role === "smallArms" || role === "machineGun") {
      return { nonEffect: 0.1, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 };
    }
    if (role === "airGun") return { nonEffect: 0.65, softComponent: 0.15, penetrating: 0.2, areaEffect: 0 };
    if (role === "airBomb" || role === "airRocket" || role === "demolition") {
      return { nonEffect: 0.12, softComponent: 0.23, penetrating: 0.65, areaEffect: 0 };
    }
    if (armorPiercing) return { nonEffect: 0.1, softComponent: 0.2, penetrating: 0.7, areaEffect: 0 };
    if (blastWeapon) return { nonEffect: 0.2, softComponent: 0.3, penetrating: 0.5, areaEffect: 0 };
    return { nonEffect: 0.15, softComponent: 0.2, penetrating: 0.65, areaEffect: 0 };
  }

  return { nonEffect: 0.1, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 };
}

function blendHitDistribution(
  baseline: HitDistribution,
  exposed: HitDistribution,
  exposedShare: number
): HitDistribution {
  const share = clamp(exposedShare, 0, 1);
  const baseShare = 1 - share;
  return {
    nonEffect: baseline.nonEffect * baseShare + exposed.nonEffect * share,
    softComponent: baseline.softComponent * baseShare + exposed.softComponent * share,
    penetrating: baseline.penetrating * baseShare + exposed.penetrating * share,
    areaEffect: baseline.areaEffect * baseShare + exposed.areaEffect * share
  };
}

export function resolveWeaponHitDistribution(
  group: WeaponShotGroup,
  defender: UnitTypeDefinition
): HitDistribution {
  const authored = group.hitDistribution;
  if (authored) {
    if (defender.class === "infantry" || defender.class === "specialist") {
      return authored.vsInfantry;
    }
    if (defender.class === "tank" || defender.class === "air") {
      return authored.vsArmorButtoned;
    }
    if (defender.class === "vehicle") {
      return isSoftSkinnedSupportVehicle(defender) ? authored.vsArtillery : authored.vsArmorButtoned;
    }
    if (defender.class === "recon") {
      const lightRecon = defender.combat.weight === "light" && (defender.armor?.front ?? 0) <= 2;
      if (lightRecon && (group.role === "smallArms" || group.role === "machineGun" || group.role === "airGun")) {
        // Motorcycle scouts are exposed, but not equivalent to static gun crews:
        // most small-arms fire misses, glances off equipment, or forces dispersion.
        return blendHitDistribution(authored.vsArmorButtoned, authored.vsArtillery, 0.01);
      }
      if (lightRecon && group.role === "antiTank") {
        return blendHitDistribution(authored.vsArmorButtoned, authored.vsArtillery, 0.1);
      }
      if (lightRecon && isHighExplosivePersonnelRole(group.role)) {
        return blendHitDistribution(authored.vsArmorButtoned, authored.vsArtillery, 0.03);
      }
      return lightRecon ? authored.vsArtillery : authored.vsArmorButtoned;
    }
    if (defender.class === "artillery") {
      return authored.vsArtillery;
    }
    return authored.vsInfantry;
  }

  return defaultHitDistributionForRole(
    group.role,
    inferWeaponDamageType(group.role, group.hardEffect?.damageType),
    defender
  );
}

export function personnelTargetExposureScalar(
  role: WeaponDamageRole,
  defender: UnitTypeDefinition
): number {
  const defenderIsPersonnelTarget = defender.class === "infantry" || defender.class === "specialist";
  const defenderIsExposedCrewTarget = defender.class === "artillery" || defender.class === "recon";
  const defenderIsSoftSkinnedVehicle = isSoftSkinnedSupportVehicle(defender);
  const defenderIsProtectedTarget = defender.class === "tank" ||
    defender.class === "air" ||
    (defender.class === "vehicle" && !defenderIsSoftSkinnedVehicle);

  if (defenderIsProtectedTarget) {
    if (role === "smallArms" || role === "machineGun") return 0.02;
    if (role === "antiTank") return 0.08;
    if (role === "airBomb" || role === "airRocket") return 0.1;
    if (isHighExplosivePersonnelRole(role)) return 0.06;
    return 0.05;
  }

  if (defenderIsSoftSkinnedVehicle) {
    if (role === "smallArms" || role === "machineGun") return 0.08;
    if (role === "antiTank") return 0.08;
    if (role === "airBomb") return 0.75;
    if (role === "airRocket") return 0.7;
    if (role === "demolition") return 0.75;
    if (role === "directHe") return 0.65;
    if (role === "indirectHe") return 0.6;
    return 0.12;
  }

  if (defenderIsExposedCrewTarget) {
    if (role === "smallArms") return 0.06;
    if (role === "machineGun" || role === "airGun") return 0.055;
    if (role === "airBomb" || role === "airRocket") return 1;
    if (role === "demolition") return 0.95;
    if (role === "directHe") return 0.9;
    if (role === "indirectHe") return 0.85;
    return 0.08;
  }

  if (defenderIsPersonnelTarget) {
    if (role === "smallArms") return 0.045;
    if (role === "machineGun" || role === "airGun") return 0.035;
    if (isHighExplosivePersonnelRole(role)) return 1;
    if (role === "antiTank") return 0.05;
  }

  return 0.08;
}

export function personnelStatusOutcomeScalar(
  role: WeaponDamageRole,
  defender: UnitTypeDefinition,
  effect?: PersonnelDamageEffect
): number {
  const defenderIsPersonnelTarget = defender.class === "infantry" || defender.class === "specialist";
  const defenderIsExposedCrewTarget = defender.class === "artillery" || defender.class === "recon";
  const defenderIsSoftSkinnedVehicle = isSoftSkinnedSupportVehicle(defender);
  const defenderIsProtectedTarget = defender.class === "tank" ||
    defender.class === "air" ||
    (defender.class === "vehicle" && !defenderIsSoftSkinnedVehicle);

  if (isHighExplosivePersonnelRole(role)) {
    return personnelTargetExposureScalar(role, defender) * Math.max(0, effect?.blastMultiplier ?? 1);
  }

  if (defenderIsPersonnelTarget || defenderIsExposedCrewTarget) {
    if (role === "smallArms" || role === "machineGun" || role === "airGun") {
      return 1;
    }
    if (role === "antiTank") {
      return 1.9;
    }
    return 1;
  }

  if (defenderIsSoftSkinnedVehicle) {
    if (role === "smallArms" || role === "machineGun" || role === "airGun") {
      return 0.45;
    }
    if (role === "antiTank") {
      return 1.35;
    }
    return Math.max(
      personnelIncidentalOutcomeScalar(role, defender),
      personnelTargetExposureScalar(role, defender)
    );
  }

  if (defenderIsProtectedTarget) {
    if (role === "smallArms" || role === "machineGun") {
      return 0.12;
    }
    if (role === "airGun") {
      return 0.2;
    }
    if (role === "antiTank") {
      return 0.35;
    }
    return personnelIncidentalOutcomeScalar(role, defender);
  }

  return personnelIncidentalOutcomeScalar(role, defender);
}

function personnelIncidentalOutcomeScalar(
  role: WeaponDamageRole,
  defender: UnitTypeDefinition
): number {
  const defenderIsPersonnelTarget = defender.class === "infantry" || defender.class === "specialist";
  const defenderIsExposedCrewTarget = defender.class === "artillery" || defender.class === "recon";
  const defenderIsSoftSkinnedVehicle = isSoftSkinnedSupportVehicle(defender);
  const defenderIsProtectedTarget = defender.class === "tank" ||
    defender.class === "air" ||
    (defender.class === "vehicle" && !defenderIsSoftSkinnedVehicle);

  if (defenderIsProtectedTarget) {
    if (role === "smallArms" || role === "machineGun") return 0.02;
    if (role === "antiTank") return 0.08;
    if (role === "directHe" || role === "indirectHe") return 0.05;
    if (role === "airBomb" || role === "airRocket") return 0.08;
    return 0.05;
  }

  if (defenderIsSoftSkinnedVehicle) {
    if (role === "smallArms" || role === "machineGun") return 0.08;
    if (role === "antiTank") return 0.08;
    if (role === "directHe") return 0.32;
    if (role === "indirectHe") return 0.28;
    if (role === "airRocket") return 0.38;
    if (role === "airBomb") return 0.45;
    if (role === "demolition") return 0.45;
    return 0.12;
  }

  if (defenderIsExposedCrewTarget) {
    if (role === "smallArms") return 0.06;
    if (role === "machineGun" || role === "airGun") return 0.055;
    if (role === "directHe") return 0.38;
    if (role === "indirectHe") return 0.34;
    if (role === "airBomb" || role === "airRocket") return 0.42;
    if (role === "demolition") return 0.45;
    return 0.08;
  }

  if (defenderIsPersonnelTarget) {
    if (role === "smallArms") return 0.045;
    if (role === "machineGun" || role === "airGun") return 0.035;
    if (role === "directHe") return 0.45;
    if (role === "indirectHe") return 0.38;
    if (role === "airRocket") return 0.42;
    if (role === "airBomb") return 0.5;
    if (role === "demolition") return 0.55;
    if (role === "antiTank") return 0.05;
  }

  return 0.08;
}
