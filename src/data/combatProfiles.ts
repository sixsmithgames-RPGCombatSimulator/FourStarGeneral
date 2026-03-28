import type { CombatClassification } from "../core/types";

/**
 * Each point describes the expected hit probability at a given range band before per-unit accuracy,
 * target signature, cover, commander skill, and experience modify the result.
 */
export interface CombatRangePoint {
  readonly range: number;
  readonly accuracy: number;
}

/**
 * A combat profile captures the shared battlefield behavior for a family of units.
 *
 * We intentionally keep the broad tactical identity here and leave per-unit numbers such as
 * `softAttack`, `hardAttack`, `ap`, and `accuracyBase` in `unitTypes.json`. The profile gives us
 * readable knobs for the weapon family, while the unit definition lets individual formations sit
 * above or below that family baseline.
 */
export interface CombatProfileDefinition {
  readonly label: string;
  readonly description: string;
  readonly accuracyReference: number;
  readonly softAttackReference: number;
  readonly hardAttackReference: number;
  readonly shotsPerTurn: number;
  readonly baseDamagePerHit: number;
  readonly suppressionPerHit: number;
  readonly rangeAccuracy: readonly CombatRangePoint[];
}

/**
 * The registry is intentionally sparse rather than exhaustively filling every possible category /
 * weight / role permutation. If a unit declares a profile that is not listed here, combat should
 * fail fast so the tuning gap is obvious and can be authored explicitly.
 */
export const COMBAT_PROFILES = {
  "infantry.light.normal": {
    label: "Line infantry",
    description: "Standard rifle formations trading volume of fire for very low lethality per bullet.",
    accuracyReference: 60,
    softAttackReference: 25,
    hardAttackReference: 4,
    shotsPerTurn: 21000,
    baseDamagePerHit: 0.00952,
    suppressionPerHit: 0.1,
    rangeAccuracy: [
      { range: 0, accuracy: 25 },
      { range: 1, accuracy: 10 },
      { range: 2, accuracy: 1 },
      { range: 4, accuracy: 0.1 }
    ]
  },
  "infantry.heavy.antiTank": {
    label: "Infantry anti-tank teams",
    description: "Few heavy shots, strong penetration, and poor sustained anti-personnel output.",
    accuracyReference: 66,
    softAttackReference: 20,
    hardAttackReference: 22,
    shotsPerTurn: 20,
    baseDamagePerHit: 0.6,
    suppressionPerHit: 0.25,
    rangeAccuracy: [
      { range: 0, accuracy: 38 },
      { range: 1, accuracy: 18 },
      { range: 2, accuracy: 8 },
      { range: 4, accuracy: 3 },
      { range: 6, accuracy: 1 }
    ]
  },
  "specialist.light.antiInfantry": {
    label: "Combat engineers",
    description: "Short-range assault specialists carrying breaching charges, flamers, and demolition kits.",
    accuracyReference: 61,
    softAttackReference: 22,
    hardAttackReference: 10,
    shotsPerTurn: 180,
    baseDamagePerHit: 0.04,
    suppressionPerHit: 0.18,
    rangeAccuracy: [
      { range: 0, accuracy: 32 },
      { range: 1, accuracy: 18 },
      { range: 2, accuracy: 6 },
      { range: 4, accuracy: 1 }
    ]
  },
  "specialist.medium.antiTank": {
    label: "Towed anti-tank guns",
    description: "Crew-served anti-armor weapons with high first-hit lethality and sustained, truck-backed ammunition supply.",
    accuracyReference: 55,
    softAttackReference: 5,
    hardAttackReference: 50,
    // Four guns firing about 30 rounds per minute across the five-minute turn window.
    // The battery's tow trucks carry enough ready ammunition nearby to keep the guns firing.
    shotsPerTurn: 120,
    baseDamagePerHit: 2.0,
    suppressionPerHit: 0.2,
    rangeAccuracy: [
      { range: 0, accuracy: 45 },
      { range: 1, accuracy: 28 },
      { range: 2, accuracy: 18 },
      { range: 4, accuracy: 8 },
      { range: 8, accuracy: 2 }
    ]
  },
  "specialist.heavy.antiTank": {
    label: "Heavy anti-tank specialists",
    description: "Large-caliber dual-purpose guns optimized to defeat armor and aircraft at long range.",
    accuracyReference: 62,
    softAttackReference: 15,
    hardAttackReference: 70,
    shotsPerTurn: 240,
    baseDamagePerHit: 2.8,
    suppressionPerHit: 0.28,
    rangeAccuracy: [
      { range: 0, accuracy: 55 },
      { range: 1, accuracy: 40 },
      { range: 2, accuracy: 30 },
      { range: 3, accuracy: 20 }
    ]
  },
  "recon.light.normal": {
    label: "Light recon screen",
    description: "Motorbike or jeep scouts that can harass soft targets but should not replace line infantry.",
    accuracyReference: 55,
    softAttackReference: 16,
    hardAttackReference: 3,
    shotsPerTurn: 4500,
    baseDamagePerHit: 0.009,
    suppressionPerHit: 0.08,
    rangeAccuracy: [
      { range: 0, accuracy: 18 },
      { range: 1, accuracy: 8 },
      { range: 2, accuracy: 0.8 },
      { range: 4, accuracy: 0.1 }
    ]
  },
  "recon.medium.normal": {
    label: "Armored recon cars",
    description: "Autocannon-armed scouts with better accuracy and armor than liaison patrols.",
    accuracyReference: 60,
    softAttackReference: 20,
    hardAttackReference: 12,
    shotsPerTurn: 5000,
    baseDamagePerHit: 0.015,
    suppressionPerHit: 0.1,
    rangeAccuracy: [
      { range: 0, accuracy: 50 },
      { range: 1, accuracy: 25 },
      { range: 2, accuracy: 10 },
      { range: 4, accuracy: 3 }
    ]
  },
  "vehicle.medium.support": {
    label: "Support vehicles",
    description: "Transport and logistics vehicles. Their guns are incidental and should remain marginal.",
    accuracyReference: 18,
    softAttackReference: 4,
    hardAttackReference: 1,
    shotsPerTurn: 250,
    baseDamagePerHit: 0.004,
    suppressionPerHit: 0.02,
    rangeAccuracy: [
      { range: 0, accuracy: 12 },
      { range: 1, accuracy: 4 },
      { range: 2, accuracy: 0.5 }
    ]
  },
  "vehicle.medium.normal": {
    label: "Armed carriers",
    description: "Halftracks and armed transports that contribute suppressive fire but are not primary duelists.",
    accuracyReference: 55,
    softAttackReference: 18,
    hardAttackReference: 4,
    shotsPerTurn: 1000,
    baseDamagePerHit: 0.012,
    suppressionPerHit: 0.08,
    rangeAccuracy: [
      { range: 0, accuracy: 20 },
      { range: 1, accuracy: 5 },
      { range: 2, accuracy: 1 }
    ]
  },
  "tank.light.normal": {
    label: "Light tanks",
    description: "Fast armored vehicles with lighter guns and armor than the main battle line.",
    accuracyReference: 62,
    softAttackReference: 30,
    hardAttackReference: 20,
    shotsPerTurn: 220,
    baseDamagePerHit: 0.11,
    suppressionPerHit: 0.14,
    rangeAccuracy: [
      { range: 0, accuracy: 80 },
      { range: 1, accuracy: 68 },
      { range: 2, accuracy: 52 },
      { range: 4, accuracy: 20 },
      { range: 8, accuracy: 6 },
      { range: 12, accuracy: 1 }
    ]
  },
  "tank.medium.normal": {
    label: "Medium tanks",
    description: "The benchmark armored fighting vehicle profile for the current tactical scale.",
    accuracyReference: 65,
    softAttackReference: 40,
    hardAttackReference: 28,
    shotsPerTurn: 200,
    baseDamagePerHit: 0.133,
    suppressionPerHit: 0.16,
    rangeAccuracy: [
      { range: 0, accuracy: 85 },
      { range: 1, accuracy: 75 },
      { range: 2, accuracy: 60 },
      { range: 4, accuracy: 25 },
      { range: 8, accuracy: 8 },
      { range: 12, accuracy: 2 }
    ]
  },
  "tank.medium.antiInfantry": {
    label: "Assault guns",
    description: "Armored direct-fire support using heavy HE shells and suppression-oriented fire plans.",
    accuracyReference: 64,
    softAttackReference: 45,
    hardAttackReference: 32,
    shotsPerTurn: 180,
    baseDamagePerHit: 0.16,
    suppressionPerHit: 0.22,
    rangeAccuracy: [
      { range: 0, accuracy: 70 },
      { range: 1, accuracy: 60 },
      { range: 2, accuracy: 42 },
      { range: 4, accuracy: 14 },
      { range: 8, accuracy: 4 }
    ]
  },
  "tank.medium.antiTank": {
    label: "Tank destroyers",
    description: "Dedicated anti-armor platforms sacrificing versatility for penetration and accuracy.",
    accuracyReference: 68,
    softAttackReference: 10,
    hardAttackReference: 55,
    shotsPerTurn: 120,
    baseDamagePerHit: 0.2,
    suppressionPerHit: 0.12,
    rangeAccuracy: [
      { range: 0, accuracy: 88 },
      { range: 1, accuracy: 78 },
      { range: 2, accuracy: 64 },
      { range: 4, accuracy: 30 },
      { range: 8, accuracy: 10 },
      { range: 12, accuracy: 3 }
    ]
  },
  "tank.heavy.normal": {
    label: "Heavy tanks",
    description: "Breakthrough armor with long-range guns and fewer, more decisive shots.",
    accuracyReference: 66,
    softAttackReference: 42,
    hardAttackReference: 38,
    shotsPerTurn: 160,
    baseDamagePerHit: 0.18,
    suppressionPerHit: 0.18,
    rangeAccuracy: [
      { range: 0, accuracy: 90 },
      { range: 1, accuracy: 80 },
      { range: 2, accuracy: 68 },
      { range: 4, accuracy: 34 },
      { range: 8, accuracy: 12 },
      { range: 12, accuracy: 4 }
    ]
  },
  "artillery.medium.antiInfantry": {
    label: "Tube artillery",
    description: "Indirect HE fire with modest hit rates but strong suppression and casualty potential.",
    accuracyReference: 50,
    softAttackReference: 50,
    hardAttackReference: 14,
    shotsPerTurn: 40,
    baseDamagePerHit: 0.65,
    suppressionPerHit: 0.45,
    rangeAccuracy: [
      { range: 4, accuracy: 15 },
      { range: 8, accuracy: 10 },
      { range: 12, accuracy: 8 },
      { range: 20, accuracy: 5 },
      { range: 32, accuracy: 3 }
    ]
  },
  "artillery.heavy.antiInfantry": {
    label: "Rocket artillery",
    description: "Low-volume salvos with severe suppression and casualty spikes on successful impact.",
    accuracyReference: 48,
    softAttackReference: 60,
    hardAttackReference: 16,
    shotsPerTurn: 24,
    baseDamagePerHit: 1.1,
    suppressionPerHit: 0.7,
    rangeAccuracy: [
      { range: 4, accuracy: 12 },
      { range: 8, accuracy: 9 },
      { range: 12, accuracy: 7 },
      { range: 20, accuracy: 5 },
      { range: 32, accuracy: 3 }
    ]
  },
  "artillery.medium.normal": {
    label: "Self-propelled artillery",
    description: "Armored artillery with better readiness and sighting support than towed batteries.",
    accuracyReference: 55,
    softAttackReference: 52,
    hardAttackReference: 20,
    shotsPerTurn: 40,
    baseDamagePerHit: 0.75,
    suppressionPerHit: 0.5,
    rangeAccuracy: [
      { range: 4, accuracy: 16 },
      { range: 8, accuracy: 11 },
      { range: 12, accuracy: 8 },
      { range: 20, accuracy: 5 },
      { range: 32, accuracy: 3 }
    ]
  },
  "air.light.normal": {
    label: "Fighter sweep",
    description: "Fast airframes optimized for strafing and air-to-air engagements rather than payload weight.",
    accuracyReference: 65,
    softAttackReference: 18,
    hardAttackReference: 15,
    shotsPerTurn: 4,
    baseDamagePerHit: 2.6,
    suppressionPerHit: 0.3,
    rangeAccuracy: [
      { range: 0, accuracy: 60 },
      { range: 1, accuracy: 40 },
      { range: 2, accuracy: 20 },
      { range: 3, accuracy: 5 }
    ]
  },
  "air.light.antiVehicle": {
    label: "Ground-attack sorties",
    description: "Attack aircraft using rockets, cannon fire, and low-altitude strike runs against vehicles.",
    accuracyReference: 60,
    softAttackReference: 35,
    hardAttackReference: 20,
    shotsPerTurn: 4,
    baseDamagePerHit: 3.2,
    suppressionPerHit: 0.4,
    rangeAccuracy: [
      { range: 0, accuracy: 55 },
      { range: 1, accuracy: 36 },
      { range: 2, accuracy: 16 },
      { range: 3, accuracy: 4 }
    ]
  },
  "air.medium.antiInfantry": {
    label: "Bomber strike",
    description: "Heavy strike packages trading accuracy for payload mass and very strong suppression.",
    accuracyReference: 55,
    softAttackReference: 45,
    hardAttackReference: 16,
    shotsPerTurn: 2,
    baseDamagePerHit: 6,
    suppressionPerHit: 1,
    rangeAccuracy: [
      { range: 0, accuracy: 48 },
      { range: 1, accuracy: 30 },
      { range: 2, accuracy: 18 },
      { range: 3, accuracy: 6 }
    ]
  },
  "air.light.support": {
    label: "Support airframe",
    description: "Recon and transport aircraft that can contribute little or no direct damage in combat.",
    accuracyReference: 50,
    softAttackReference: 8,
    hardAttackReference: 2,
    shotsPerTurn: 1,
    baseDamagePerHit: 0.15,
    suppressionPerHit: 0.05,
    rangeAccuracy: [
      { range: 0, accuracy: 35 },
      { range: 1, accuracy: 20 },
      { range: 2, accuracy: 10 },
      { range: 3, accuracy: 3 }
    ]
  }
} as const satisfies Record<string, CombatProfileDefinition>;

export type CombatProfileKey = keyof typeof COMBAT_PROFILES;

/**
 * Build the stable lookup key shared between `unitTypes.json` combat metadata and the authored profile table.
 */
export function createCombatProfileKey(classification: CombatClassification): CombatProfileKey {
  const key = `${classification.category}.${classification.weight}.${classification.role}`;
  if (Object.prototype.hasOwnProperty.call(COMBAT_PROFILES, key)) {
    return key as CombatProfileKey;
  }
  throw new Error(`Combat profile '${key}' is not defined. Add it to src/data/combatProfiles.ts or fix the unit's combat classification.`);
}

/**
 * Resolve the authored combat profile for a unit's combat classification.
 *
 * We deliberately throw when a profile is missing instead of guessing. Combat tuning errors should be
 * surfaced at authoring time, not hidden behind implied defaults that make balance drift harder to see.
 */
export function getCombatProfile(classification: CombatClassification): CombatProfileDefinition {
  const key = createCombatProfileKey(classification);
  return COMBAT_PROFILES[key];
}
