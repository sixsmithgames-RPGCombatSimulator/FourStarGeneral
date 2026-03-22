/**
 * Hex geometry shared by rendering, pathing, and combat math. Keeping these figures in one place
 * prevents subtle desyncs between visual presentation and underlying calculations.
 */
export const HEX_RADIUS = 48;
// Pointy-top orientation: width is flat-to-flat (sqrt(3) * R), height is point-to-point (2 * R)
export const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
export const HEX_HEIGHT = HEX_RADIUS * 2;

/**
 * Tactical scale: 1 hex = 250 meters
 *
 * This scale was chosen to match WWII tactical combat realities:
 * - Infantry effective range: ~250m (1 hex)
 * - Tank main gun range: 500-3,000m (2-12 hexes)
 * - Artillery range: 3,000-15,000m (12-60 hexes)
 * - Standard battlefield visibility: 1,000-2,000m (4-8 hexes)
 *
 * At this scale, a 20x20 hex map represents 5km x 5km (roughly 25 sq km),
 * appropriate for WWII battalion/regiment-level tactical engagements.
 * A 250m hex can hold ~25 tanks with combat spacing or thousands of infantry.
 */
export const HEX_SCALE_METERS = 250;
export const HEX_SCALE_KILOMETERS = 0.25;

/**
 * Temporal scale: 1 turn = 5 minutes
 *
 * This time scale makes movement speeds realistic for tactical WWII combat:
 * - Infantry (1 hex): 250m / 5 min = 50 m/min = 3 km/h (cautious combat advance under fire)
 * - Medium Tank (3 hexes): 750m / 5 min = 150 m/min = 9 km/h (deliberate tactical movement)
 * - Heavy Tank (2 hexes): 500m / 5 min = 100 m/min = 6 km/h (slow tactical advance)
 * - Recon Car (4 hexes): 1,000m / 5 min = 200 m/min = 12 km/h (reconnaissance pace)
 * - Scout Plane (6 hexes): 1,500m / 5 min = 300 m/min = 18 km/h (low patrol speed)
 *
 * Each turn represents a tactical phase including movement, observation, positioning, and
 * brief combat engagements (1-2 minutes of concentrated fire). The 5-minute window captures
 * the rapid pace of tactical combat while still allowing for maneuver and decision-making.
 */
export const TURN_TIME_MINUTES = 5;

/**
 * Centralized combat tuning. Every numeric knob for accuracy, penetration, damage, counter-fire,
 * entrenchment, ammo usage, and zone-of-control lives here so balancing is predictable. Formulas
 * in `src/core/Combat.ts` should never hard-code numbers; they read from this structure instead.
 */
export const combat = {
  /**
   * Accuracy is responsible only for determining whether a shot has a plausible chance to land.
   * Range curves now live in `src/data/combatProfiles.ts`; the values below are the global layers
   * applied on top of those authored weapon-family curves.
   */
  accuracy: {
    min: 0.1,
    max: 95,
    expPerStar: 3,
    commanderScalar: 0.01,
    /**
     * Signature scales the final hit probability before cover and spotting are applied.
     * Small targets force more precise fire; large targets expose more surface area.
     */
    signatureMultiplier: {
      tiny: 0.72,
      small: 0.86,
      medium: 1,
      large: 1.15
    } as const
  },
  /**
   * Cover reduces exposed target area and therefore belongs entirely in the hit-chance phase.
   * Terrain `accMod` remains the authored hand-tuned modifier, while terrain `defense` is now a
   * secondary authored cover level that is converted into additional hit reduction here.
   */
  cover: {
    defenseLevelToAccuracyPct: -2,
    fortificationBonusPct: -12,
    entrenchmentPerLevelPct: -15
  },
  /**
   * Armor matters only after a hit. The AP-versus-armor margin scales damage using separate positive
   * and negative per-point modifiers so overmatch and under-penetration are both readable to tune.
   */
  penetration: {
    topAttackClasses: new Set(["artillery", "air"]),
    starApBonus: 1,
    positiveDamageBonusPerPoint: 0.05,
    negativeDamagePenaltyPerPoint: 0.15,
    minimumDamageScalar: 0.1
  },
  /**
   * Damage uses the defender's current armor as a continuous blending signal between the unit's
   * authored `softAttack` and `hardAttack` values. This removes the old explicit soft-target branch
   * while still letting armor progressively shift engagements toward dedicated anti-armor weapons.
   */
  damage: {
    attackBlendArmorScale: 10,
    roleBias: {
      normal: { soft: 1, hard: 1 },
      antiTank: { soft: 0.35, hard: 1.25 },
      antiVehicle: { soft: 0.75, hard: 1.1 },
      antiInfantry: { soft: 1.2, hard: 0.8 },
      support: { soft: 0.7, hard: 0.7 }
    } as const,
    experienceScalarPerStar: 0.1
  },
  /**
   * Counter-fire policy toggles. Adjust retaliation availability and its accuracy impact here.
   */
  counterfire: {
    adjacentOnly: true,
    accuracyPenalty: 20,
    artyCloseCounterfire: false
  },
  /**
   * Entrenchment itself is still capped here; the actual hit-chance effect is authored in `cover`
   * because entrenchment now behaves purely as exposed-area reduction rather than post-hit defense.
   */
  entrench: {
    max: 2
  },
  /**
   * Ammo and fuel consumption rules shared by movement, attacks, and UI previews.
   */
  ammoFuel: {
    attackAmmoCost: 1,
    indirectExtraAmmo: 1,
    fuelPerGroundHex: 1,
    fuelRoadMultiplier: 0.5,
    fuelPerAirHex: 1
  },
  /**
   * Zone-of-control enforcement. Only units with the listed traits project ZoC, and leaving costs
   * additional movement points set here.
   */
  zoc: {
    enabledTraits: new Set(["zoc"]),
    leaveCost: 2
  }
} as const;

/**
 * Supply network rules. Governs how far supply extends and how quickly units degrade when cut off.
 */
export const supply = {
  roadRange: 15,
  offroadRange: 8,
  offroadCostMultiplier: 2,
  convoy: {
    ammoCapacity: 12,
    fuelCapacity: 18,
    unloadAmmoPerTurn: 4,
    unloadFuelPerTurn: 6,
    sourceRadius: 1,
    serviceRadius: 1
  } as const,
  tick: {
    ammoLoss: 1,
    fuelLoss: 1,
    entrenchLoss: 0,
    stepLossWhenEmpty: 1
  },
  resupply: { ammo: 2, fuel: 2 } as const,
  generalBonus: { range: 3 } as const,
  /**
   * Baseline upkeep draw for each unit class when the formation remains linked to supply lines.
   * Ammo/fuel values represent per-turn consumption that will be routed through faction stockpiles.
   */
  upkeep: {
    infantry: { ammo: 1, fuel: 0 },
    specialist: { ammo: 1, fuel: 0 },
    vehicle: { ammo: 1, fuel: 2 },
    tank: { ammo: 2, fuel: 3 },
    artillery: { ammo: 2, fuel: 1 },
    air: { ammo: 2, fuel: 4 },
    recon: { ammo: 1, fuel: 2 }
  } as const,
  /**
   * Passive production credited to each faction at the start of a turn before upkeep drains apply.
   * These defaults can be overridden later by scenario logistics bonuses.
   */
  production: { ammo: 6, fuel: 8, rations: 4, parts: 2 } as const,
  /**
   * Multiplier that seeds depot stockpiles based on onboard unit totals during initialization/hydration.
   */
  stockpileMultiplier: { ammo: 1, fuel: 1, rations: 0, parts: 0 } as const,
  /**
   * History retention limit for the supply ledger so UI panels stay readable while still showing trends.
   */
  ledgerLimit: 50
} as const;

/**
 * UI-centric knobs collected here so presentational tweaks (odds rounding, etc.) are easy to audit.
 */
export const ui = {
  oddsEpsilon: 1,
  rosterWarnings: {
    ammo: { caution: 0.4, critical: 0.2 },
    fuel: { caution: 0.4, critical: 0.2 },
    strength: { caution: 0.6, critical: 0.3 }
  }
} as const;

/**
 * Commander defaults remain exposed separately for compatibility with existing profile code.
 */
export const COMMANDER_DEFAULTS = {
  accBonus: 0,
  dmgBonus: 0,
  moveBonus: 0,
  supplyBonus: 0
} as const;

/**
 * Fuel costs by movement profile, shared between validation and in-game logistics planners.
 */
export const FUEL_COST = {
  leg: 0,
  wheel: 1,
  track: 1,
  air: 1
} as const;

/**
 * Trait registry mirrored by `validateCanon()`. Keeping this close to combat knobs avoids drift.
 */
export const TRAIT_EFFECTS = {
  skirmish: { name: "skirmish" },
  indirect: { name: "indirect" },
  zoc: { name: "zoc" },
  entrenchBuster: { name: "entrenchBuster" },
  suppression: { name: "suppression" },
  intercept: { name: "intercept" },
  carpet: { name: "carpet" }
} as const;

/**
 * Legacy named exports derived from the centralized structures. These keep older call sites alive
 * during the migration while guaranteeing every value still funnels through the new objects.
 */
export const MOVEMENT_COST_MULTIPLIER_ROAD = combat.ammoFuel.fuelRoadMultiplier;
export const ZOC_EXIT_COST = combat.zoc.leaveCost;
export const ENTRENCH_MAX = combat.entrench.max;
export const SUPPLY_RANGE_ROAD = supply.roadRange;
export const SUPPLY_RANGE_OFFROAD = supply.offroadRange;
export const ROAD_FUEL_DIVISOR = 1 / combat.ammoFuel.fuelRoadMultiplier;
export const ACCURACY_CLAMP = { min: combat.accuracy.min, max: combat.accuracy.max } as const;
