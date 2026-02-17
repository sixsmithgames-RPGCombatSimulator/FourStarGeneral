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
   * Accuracy modifiers broken into target-size adjustments plus distance falloff metadata. The
   * `sizeVs` table tracks how target silhouettes affect the chance to hit. Positive values make
   * the target easier to hit (larger/more visible), negative values make it harder (smaller/evasive).
   *
   * At 500m/hex scale:
   * - Infantry (0): Man-sized, takes cover, baseline difficulty
   * - Specialist (0): AT guns, engineers - small crews, dug-in positions
   * - Vehicles (+8): Trucks, halftracks - large (4m), unarmored, no camouflage, easy to spot
   * - Tanks (-2): Low profile (2.5m), camouflaged, trained crew positioning
   * - Artillery (-5): Dug-in emplacements, heavy camouflage, minimal movement
   * - Recon (-3): Fast-moving, evasive tactics, concealment priority
   * - Air (+5): Large silhouette vs AA, but varies by altitude/speed (future: split air-to-air vs AA)
   */
  accuracy: {
    min: 0.1,
    max: 95,
    expPerStar: 3,
    terrainCoverMod: 5,     // Bonus per terrain defense level
    commanderScalar: 0.01,  // Commander bonus applied as percentage multiplier
    /**
     * Realistic base accuracy by range (hexes at 250m scale) for each unit class.
     * Based on historical WWII hit probability data. Values represent single-shot
     * hit probability against standard targets (infantry vs infantry, tank vs tank).
     * Experience, terrain, and commander bonuses are applied as additive modifiers.
     *
     * Range interpolation: values between defined ranges use linear interpolation.
     * Ranges beyond the max use the final value.
     */
    baseByRange: {
      // Infantry: bolt-action/semi-auto rifles vs man-sized targets
      // Data: 100m=10%, 250m=5%, 500m=1%, 1000m=0.1%
      infantry: [
        { range: 0, accuracy: 30 },  // Adjacent (<125m): close combat
        { range: 1, accuracy: 5 },   // 250m
        { range: 2, accuracy: 1 },   // 500m
        { range: 4, accuracy: 0.1 }  // 1000m+
      ],
      // Specialist: AT guns, engineers - crew-served weapons, better training
      specialist: [
        { range: 0, accuracy: 40 },
        { range: 1, accuracy: 15 },
        { range: 2, accuracy: 8 },
        { range: 4, accuracy: 3 },
        { range: 8, accuracy: 1 }
      ],
      // Tank: 75mm class gun vs tank-sized targets
      // Data: 100m=80%, 500m=60%, 1000m=25%, 2000m=8%, 3000m=2%
      tank: [
        { range: 0, accuracy: 85 },  // <125m
        { range: 1, accuracy: 75 },  // 250m
        { range: 2, accuracy: 60 },  // 500m
        { range: 4, accuracy: 25 },  // 1000m
        { range: 8, accuracy: 8 },   // 2000m
        { range: 12, accuracy: 2 }   // 3000m
      ],
      // Artillery: indirect fire, heavily dependent on spotting
      artillery: [
        { range: 4, accuracy: 15 },   // 1000m (minimum range ~3)
        { range: 8, accuracy: 10 },   // 2000m
        { range: 12, accuracy: 8 },   // 3000m
        { range: 20, accuracy: 5 },   // 5000m
        { range: 32, accuracy: 3 }    // 8000m
      ],
      // Recon: light weapons, autocannons
      recon: [
        { range: 0, accuracy: 50 },
        { range: 1, accuracy: 25 },
        { range: 2, accuracy: 10 },
        { range: 4, accuracy: 3 }
      ],
      // Air: strafing/bombing runs
      air: [
        { range: 0, accuracy: 60 },
        { range: 1, accuracy: 40 },
        { range: 2, accuracy: 20 },
        { range: 3, accuracy: 5 }
      ],
      // Vehicle: mostly non-combat, some have defensive MGs
      vehicle: [
        { range: 0, accuracy: 20 },
        { range: 1, accuracy: 5 },
        { range: 2, accuracy: 1 }
      ]
    } as const
  },
  /**
   * Armor penetration heuristics. These values dictate when side/top armor applies and how much
   * hard-damage bleeds through on under-penetration results.
   */
  penetration: {
    sideHeuristicAngle: 60,
    topAttackClasses: new Set(["artillery", "air"]),
    underPenetrationScale: 0.25,
    starApBonus: 1
  },
  /**
   * Damage resolution using realistic shot counts and percentage-based damage.
   *
   * Shot counts represent actual rounds/volleys fired by a full-strength (100%) unit in 5 minutes.
   * At partial strength, multiply by (currentStrength / 100).
   *
   * Damage values are percentage of target strength lost per successful hit.
   */
  damage: {
    /**
     * Full-strength shot counts per 5-minute turn.
     * Based on realistic WWII rates of fire and unit composition.
     */
    shotsPerTurn: {
      infantry: 21000,    // 700 men × 6 rpm × 5 min
      specialist: 40,     // AT teams with bazooka/panzerfaust
      tank: 200,          // 25 tanks × 8 rounds per 5 min
      artillery: 40,      // 4 guns × 10 rounds per 5 min
      air: 4,             // 4-fighter squadron × 1 bomb each
      recon: 5000,        // Light autocannons/MGs
      vehicle: 1000       // Defensive MGs on trucks/halftracks
    } as const,

    /**
     * Damage per hit as percentage of target strength (0-100%).
     *
     * Format: damagePercent[attackerClass][isSoftTarget][penetrationResult]
     * - isSoftTarget: true = infantry/soft, false = tanks/hard
     * - penetrationResult: "full" = penetrated, "partial" = glanced/under-penetrated
     */
    damagePercent: {
      infantry: {
        soft: { full: 0.00952, partial: 0.00952 },  // Rifle vs infantry
        hard: { full: 0.0001, partial: 0.0001 }      // Rifle vs tank (negligible)
      },
      specialist: {
        soft: { full: 0.05, partial: 0.05 },         // AT round vs infantry
        hard: { full: 2.5, partial: 0.6 }            // AT round vs tank
      },
      tank: {
        soft: { full: 0.071, partial: 0.071 },       // Tank HE vs infantry
        hard: { full: 0.133, partial: 0.033 }        // Tank AP vs tank
      },
      artillery: {
        soft: { full: 0.643, partial: 0.643 },       // 105mm HE vs infantry
        hard: { full: 1.0, partial: 1.0 }            // 105mm HE vs tank
      },
      air: {
        soft: { full: 4.64, partial: 4.64 },         // 500lb bomb vs infantry
        hard: { full: 5.0, partial: 5.0 }            // 500lb bomb vs tank
      },
      recon: {
        soft: { full: 0.015, partial: 0.015 },       // Autocannon vs infantry
        hard: { full: 0.01, partial: 0.005 }         // Autocannon vs tank
      },
      vehicle: {
        soft: { full: 0.012, partial: 0.012 },       // MG vs infantry
        hard: { full: 0.0001, partial: 0.0001 }      // MG vs tank (negligible)
      }
    } as const,

    suppressionPerHit: 0.1  // Suppression as percentage (0-100%)
  },
  /**
   * Counter-fire policy toggles. Adjust retaliation availability and its accuracy impact here.
   */
  counterfire: {
    adjacentOnly: true,
    accuracyPenalty: 10,
    artyCloseCounterfire: false
  },
  /**
   * Entrenchment scaling. Controls defensive bonuses and accuracy penalties per entrenchment pip.
   */
  entrench: {
    max: 5,
    accPenaltyPerLevel: 5,
    defensePerLevel: 1
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
  tick: {
    ammoLoss: 1,
    fuelLoss: 1,
    entrenchLoss: 1,
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
