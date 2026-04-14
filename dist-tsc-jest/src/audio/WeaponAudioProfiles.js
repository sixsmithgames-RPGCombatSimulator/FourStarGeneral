/**
 * Weapon Audio Profiles
 *
 * Defines how each weapon class assembles sound layers at runtime.
 * Each profile specifies which layer pools to use, variation parameters,
 * and assembly constraints.
 */
const ARMOR_IMPACT_POOL = ["impact_armor_01", "impact_armor_02"];
const SMALL_ARMS_POOL = ["small_arms_fire_01", "small_arms_fire_02"];
const MG_FIRE_POOL = ["mg_fire_01", "mg_fire_02", "mg_fire_03"];
const MG_CLUSTER_POOL = ["mg_cluster_01", "mg_cluster_02"];
const CANNON_POOL = ["cannon_fire_01", "cannon_fire_02", "cannon_fire_03"];
const EXPLOSION_POOL = ["explosion_01", "explosion_02", "explosion_03"];
const explosionImpactPools = {
    soft: EXPLOSION_POOL,
    earth: EXPLOSION_POOL,
    mud: EXPLOSION_POOL,
    grass: EXPLOSION_POOL,
    armor: ARMOR_IMPACT_POOL,
    wood: EXPLOSION_POOL,
    masonry: EXPLOSION_POOL,
    road: EXPLOSION_POOL,
    sand: EXPLOSION_POOL,
    snow: EXPLOSION_POOL
};
const weaponOnlyArmorImpactPools = {
    armor: ARMOR_IMPACT_POOL
};
/**
 * Weapon audio profile catalog.
 */
export const WEAPON_AUDIO_PROFILES = {
    small_arms: {
        weaponClass: "small_arms",
        transientPool: SMALL_ARMS_POOL,
        impactPoolsByMaterial: weaponOnlyArmorImpactPools,
        pitchJitterPct: 0.02,
        gainJitterDb: 0.7,
        startOffsetJitterMs: 6,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 1
    },
    mg: {
        weaponClass: "mg",
        transientPool: MG_FIRE_POOL,
        bodyPool: MG_CLUSTER_POOL,
        impactPoolsByMaterial: weaponOnlyArmorImpactPools,
        pitchJitterPct: 0.018,
        gainJitterDb: 0.9,
        startOffsetJitterMs: 8,
        minLayers: 1,
        maxLayers: 3,
        transientCooldown: 1,
        impactCooldown: 1
    },
    mortar: {
        weaponClass: "mortar",
        transientPool: ["explosion_01"],
        bodyPool: ["explosion_02"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.025,
        gainJitterDb: 1.1,
        startOffsetJitterMs: 10,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 0
    },
    cannon: {
        weaponClass: "cannon",
        transientPool: CANNON_POOL,
        impactPoolsByMaterial: {
            armor: ARMOR_IMPACT_POOL,
            earth: ["explosion_01"],
            masonry: ["explosion_02"],
            road: ["explosion_01"],
            wood: ["explosion_01"]
        },
        pitchJitterPct: 0.02,
        gainJitterDb: 1.0,
        startOffsetJitterMs: 8,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 1
    },
    tank_50mm: {
        weaponClass: "tank_50mm",
        transientPool: CANNON_POOL,
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.018,
        gainJitterDb: 1.0,
        startOffsetJitterMs: 8,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 1
    },
    tank_75mm: {
        weaponClass: "tank_75mm",
        transientPool: CANNON_POOL,
        bodyPool: ["explosion_01"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.02,
        gainJitterDb: 1.1,
        startOffsetJitterMs: 10,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 1
    },
    tank_100mm: {
        weaponClass: "tank_100mm",
        transientPool: CANNON_POOL,
        bodyPool: ["explosion_02"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.024,
        gainJitterDb: 1.2,
        startOffsetJitterMs: 10,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 1
    },
    tank_destroyer_150mm: {
        weaponClass: "tank_destroyer_150mm",
        transientPool: ["cannon_fire_03"],
        bodyPool: ["explosion_03"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.026,
        gainJitterDb: 1.3,
        startOffsetJitterMs: 12,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 1
    },
    rocket: {
        weaponClass: "rocket",
        transientPool: ["explosion_01"],
        bodyPool: ["explosion_03"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.028,
        gainJitterDb: 1.2,
        startOffsetJitterMs: 14,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 1,
        impactCooldown: 0
    },
    artillery: {
        weaponClass: "artillery",
        transientPool: EXPLOSION_POOL,
        bodyPool: ["explosion_02", "explosion_03"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.03,
        gainJitterDb: 1.4,
        startOffsetJitterMs: 16,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 0,
        impactCooldown: 0
    },
    small_bomb: {
        weaponClass: "small_bomb",
        transientPool: ["explosion_01", "explosion_02"],
        bodyPool: ["explosion_03"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.032,
        gainJitterDb: 1.4,
        startOffsetJitterMs: 16,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 0,
        impactCooldown: 0
    },
    large_bomb: {
        weaponClass: "large_bomb",
        transientPool: ["explosion_02", "explosion_03"],
        bodyPool: ["explosion_01", "explosion_03"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.036,
        gainJitterDb: 1.6,
        startOffsetJitterMs: 18,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 0,
        impactCooldown: 0
    },
    demolition_charge: {
        weaponClass: "demolition_charge",
        transientPool: ["explosion_01", "explosion_03"],
        bodyPool: ["explosion_02"],
        impactPoolsByMaterial: explosionImpactPools,
        pitchJitterPct: 0.03,
        gainJitterDb: 1.3,
        startOffsetJitterMs: 14,
        minLayers: 1,
        maxLayers: 2,
        transientCooldown: 0,
        impactCooldown: 0
    }
};
/**
 * Map terrain types to impact materials for sound selection.
 */
export function terrainToImpactMaterial(terrainType) {
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
