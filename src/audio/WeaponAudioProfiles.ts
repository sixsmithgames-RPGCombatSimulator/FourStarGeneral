/**
 * Weapon Audio Profiles
 *
 * Defines how each weapon class assembles sound layers at runtime.
 * Each profile specifies which layer pools to use, variation parameters,
 * and assembly constraints.
 */

import type { WeaponSoundClass, ImpactMaterial } from "./SoundAssetMetadata";

/**
 * Audio profile defining how a weapon's sound is assembled.
 */
export interface WeaponAudioProfile {
  /** Weapon class identifier */
  readonly weaponClass: WeaponSoundClass;

  /** Pool of transient layer asset IDs */
  readonly transientPool: readonly string[];
  /** Optional pool of body layer asset IDs */
  readonly bodyPool?: readonly string[];
  /** Optional pool of mechanical layer asset IDs */
  readonly mechanicalPool?: readonly string[];
  /** Optional pool of flight/travel layer asset IDs */
  readonly flightPool?: readonly string[];

  /** Impact pools organized by material */
  readonly impactPoolsByMaterial: Partial<Record<ImpactMaterial, readonly string[]>>;
  /** Optional debris pools organized by material */
  readonly debrisPoolsByMaterial?: Partial<Record<ImpactMaterial, readonly string[]>>;
  /** Optional tail layer pools */
  readonly tailPools?: readonly string[];

  /** Pitch variation percentage (e.g., 0.02 = ±2%) */
  readonly pitchJitterPct: number;
  /** Gain variation in decibels */
  readonly gainJitterDb: number;
  /** Start time offset variation in milliseconds */
  readonly startOffsetJitterMs: number;

  /** Minimum layers to use per event */
  readonly minLayers: number;
  /** Maximum layers to use per event */
  readonly maxLayers: number;

  /** Repetition control: variants to skip after use */
  readonly transientCooldown?: number;
  /** Repetition control: impact variant cooldown */
  readonly impactCooldown?: number;
}

/**
 * Weapon audio profile catalog.
 */
export const WEAPON_AUDIO_PROFILES: Record<WeaponSoundClass, WeaponAudioProfile> = {
  small_arms: {
    weaponClass: "small_arms",
    transientPool: ["small_arms_transient_01", "small_arms_transient_02", "small_arms_transient_03"],
    mechanicalPool: ["small_arms_mechanical_01", "small_arms_mechanical_02"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02", "impact_earth_03"],
      grass: ["impact_grass_01"],
      wood: ["impact_wood_01"],
      sand: ["impact_sand_01"]
    },
    tailPools: ["tail_small_01"],
    pitchJitterPct: 0.02, // ±2%
    gainJitterDb: 1.0,
    startOffsetJitterMs: 5,
    minLayers: 2,
    maxLayers: 3,
    transientCooldown: 2,
    impactCooldown: 3
  },

  mg: {
    weaponClass: "mg",
    transientPool: ["mg_transient_01", "mg_transient_02"],
    bodyPool: ["mg_body_01"],
    mechanicalPool: ["mg_mechanical_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02", "impact_earth_03"],
      grass: ["impact_grass_01"],
      wood: ["impact_wood_01"]
    },
    tailPools: ["tail_small_01"],
    pitchJitterPct: 0.015, // ±1.5%
    gainJitterDb: 0.8,
    startOffsetJitterMs: 8,
    minLayers: 3,
    maxLayers: 5,
    transientCooldown: 2,
    impactCooldown: 2
  },

  mortar: {
    weaponClass: "mortar",
    transientPool: ["mortar_transient_01"],
    bodyPool: ["mortar_body_01"],
    flightPool: ["mortar_flight_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      mud: ["impact_mud_01"],
      grass: ["impact_grass_01"]
    },
    debrisPoolsByMaterial: {
      earth: ["debris_earth_01"]
    },
    tailPools: ["tail_medium_01"],
    pitchJitterPct: 0.025, // ±2.5%
    gainJitterDb: 1.5,
    startOffsetJitterMs: 10,
    minLayers: 3,
    maxLayers: 5,
    transientCooldown: 1,
    impactCooldown: 2
  },

  cannon: {
    weaponClass: "cannon",
    transientPool: ["cannon_transient_01", "cannon_transient_02"],
    bodyPool: ["cannon_body_01"],
    mechanicalPool: ["cannon_mechanical_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      armor: ["impact_armor_01", "impact_armor_02"],
      wood: ["impact_wood_01"]
    },
    tailPools: ["tail_medium_01"],
    pitchJitterPct: 0.02,
    gainJitterDb: 1.2,
    startOffsetJitterMs: 8,
    minLayers: 3,
    maxLayers: 5,
    transientCooldown: 1,
    impactCooldown: 2
  },

  tank_50mm: {
    weaponClass: "tank_50mm",
    transientPool: ["cannon_transient_01", "cannon_transient_02"],
    bodyPool: ["cannon_body_01"],
    mechanicalPool: ["cannon_mechanical_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      armor: ["impact_armor_01", "impact_armor_02"]
    },
    tailPools: ["tail_medium_01"],
    pitchJitterPct: 0.018,
    gainJitterDb: 1.0,
    startOffsetJitterMs: 10,
    minLayers: 3,
    maxLayers: 5,
    transientCooldown: 1,
    impactCooldown: 2
  },

  tank_75mm: {
    weaponClass: "tank_75mm",
    transientPool: ["tank_75mm_transient_01"],
    bodyPool: ["tank_75mm_body_01"],
    mechanicalPool: ["tank_75mm_mechanical_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      armor: ["impact_armor_01", "impact_armor_02"]
    },
    tailPools: ["tail_medium_01"],
    pitchJitterPct: 0.02,
    gainJitterDb: 1.2,
    startOffsetJitterMs: 12,
    minLayers: 4,
    maxLayers: 6,
    transientCooldown: 1,
    impactCooldown: 2
  },

  tank_100mm: {
    weaponClass: "tank_100mm",
    transientPool: ["tank_75mm_transient_01"],
    bodyPool: ["tank_75mm_body_01"],
    mechanicalPool: ["tank_75mm_mechanical_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      armor: ["impact_armor_01", "impact_armor_02"]
    },
    tailPools: ["tail_large_01"],
    pitchJitterPct: 0.025,
    gainJitterDb: 1.5,
    startOffsetJitterMs: 15,
    minLayers: 4,
    maxLayers: 6,
    transientCooldown: 1,
    impactCooldown: 1
  },

  tank_destroyer_150mm: {
    weaponClass: "tank_destroyer_150mm",
    transientPool: ["artillery_transient_01"],
    bodyPool: ["artillery_body_01"],
    mechanicalPool: ["tank_75mm_mechanical_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      armor: ["impact_armor_01", "impact_armor_02"],
      masonry: ["impact_masonry_01"]
    },
    debrisPoolsByMaterial: {
      earth: ["debris_earth_01"]
    },
    tailPools: ["tail_large_01"],
    pitchJitterPct: 0.03,
    gainJitterDb: 2.0,
    startOffsetJitterMs: 20,
    minLayers: 5,
    maxLayers: 7,
    transientCooldown: 0,
    impactCooldown: 1
  },

  rocket: {
    weaponClass: "rocket",
    transientPool: ["rocket_transient_01"],
    bodyPool: ["rocket_body_01"],
    flightPool: ["rocket_flight_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      armor: ["impact_armor_01", "impact_armor_02"],
      masonry: ["impact_masonry_01"]
    },
    debrisPoolsByMaterial: {
      earth: ["debris_earth_01"],
      masonry: ["debris_masonry_01"]
    },
    tailPools: ["tail_large_01"],
    pitchJitterPct: 0.035, // ±3.5%
    gainJitterDb: 1.8,
    startOffsetJitterMs: 15,
    minLayers: 4,
    maxLayers: 6,
    transientCooldown: 1,
    impactCooldown: 1
  },

  artillery: {
    weaponClass: "artillery",
    transientPool: ["artillery_transient_01"],
    bodyPool: ["artillery_body_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      mud: ["impact_mud_01"],
      masonry: ["impact_masonry_01"]
    },
    debrisPoolsByMaterial: {
      earth: ["debris_earth_01"],
      wood: ["debris_wood_01"],
      masonry: ["debris_masonry_01"]
    },
    tailPools: ["tail_large_01"],
    pitchJitterPct: 0.03,
    gainJitterDb: 2.0,
    startOffsetJitterMs: 20,
    minLayers: 5,
    maxLayers: 7,
    transientCooldown: 0,
    impactCooldown: 1
  },

  small_bomb: {
    weaponClass: "small_bomb",
    transientPool: ["artillery_transient_01"],
    bodyPool: ["artillery_body_01"],
    flightPool: ["mortar_flight_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      masonry: ["impact_masonry_01"]
    },
    debrisPoolsByMaterial: {
      earth: ["debris_earth_01"],
      masonry: ["debris_masonry_01"]
    },
    tailPools: ["tail_large_01"],
    pitchJitterPct: 0.035,
    gainJitterDb: 2.0,
    startOffsetJitterMs: 20,
    minLayers: 5,
    maxLayers: 7,
    transientCooldown: 0,
    impactCooldown: 0
  },

  large_bomb: {
    weaponClass: "large_bomb",
    transientPool: ["large_bomb_transient_01"],
    bodyPool: ["large_bomb_body_01"],
    flightPool: ["large_bomb_flight_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      masonry: ["impact_masonry_01"]
    },
    debrisPoolsByMaterial: {
      earth: ["debris_earth_01"],
      wood: ["debris_wood_01"],
      masonry: ["debris_masonry_01"]
    },
    tailPools: ["tail_large_01"],
    pitchJitterPct: 0.04,
    gainJitterDb: 2.0,
    startOffsetJitterMs: 25,
    minLayers: 6,
    maxLayers: 8,
    transientCooldown: 0,
    impactCooldown: 0
  },

  demolition_charge: {
    weaponClass: "demolition_charge",
    transientPool: ["artillery_transient_01"],
    bodyPool: ["artillery_body_01"],
    impactPoolsByMaterial: {
      earth: ["impact_earth_01", "impact_earth_02"],
      masonry: ["impact_masonry_01"]
    },
    debrisPoolsByMaterial: {
      wood: ["debris_wood_01"],
      masonry: ["debris_masonry_01"]
    },
    tailPools: ["tail_large_01"],
    pitchJitterPct: 0.03,
    gainJitterDb: 1.8,
    startOffsetJitterMs: 15,
    minLayers: 4,
    maxLayers: 6,
    transientCooldown: 0,
    impactCooldown: 1
  }
};

/**
 * Map terrain types to impact materials for sound selection.
 */
export function terrainToImpactMaterial(terrainType: string): ImpactMaterial {
  const normalized = terrainType.toLowerCase();

  switch (normalized) {
    case "grasslands":
    case "grass":
    case "plain":
      return "grass";

    case "forest":
    case "woods":
      return "wood";

    case "hill":
    case "mountain":
      return "road"; // Rocky/hard surface

    case "marsh":
    case "swamp":
      return "mud";

    case "beach":
      return "sand";

    case "village":
    case "urban":
      return "masonry";

    case "river":
    case "sea":
      return "soft"; // Water impact (soft)

    default:
      return "earth"; // Default fallback
  }
}
