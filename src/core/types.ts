import type terrainData from "../data/terrain.json";
import type { unitTypesData } from "../data/unitSystem/derivedUnitTypes";
import type scenarioData from "../data/scenario01.json";

export type Axial = { q: number; r: number };

export type TerrainKey = keyof typeof terrainData;
export type MoveType = "leg" | "wheel" | "track" | "air";
export type TerrainDensity = "sparse" | "average" | "dense";
export type ReconStatus = "aerial" | "intel" | "firsthand" | "none";
export type TerrainFeature =
  | "road"
  | "rocks"
  | "foothills"
  | "cliffs"
  | "small rivers"
  | "bridge"
  | "large river"
  | "ford"
  | "shallow"
  | "rubble"
  | "pastures"
  | "trees"
  | "shrubs"
  | "buildings"
  | "mounds"
  | "ditches"
  | "hedges"
  | "trenches"
  | "walls"
  | "barracades"
  | "light fortifications"
  | "moderate fortifications"
  | "heavy fortifications";

export type TerrainType =
  | "marsh"
  | "mountain"
  | "grass"
  | "rural"
  | "urban"
  | "coastal"
  | "water";

export type TerrainMoveCost = Record<MoveType, number>;

export interface TerrainDefinition {
  moveCost: TerrainMoveCost;
  defense: number;
  accMod: number;
  blocksLOS: boolean;
}

export type TerrainDictionary = typeof terrainData;

export interface TileDefinition {
  terrain: TerrainKey;
  terrainType: TerrainType;
  density: TerrainDensity;
  features: TerrainFeature[];
  recon: ReconStatus;
  /** Optional art-variant override. "center" selects the urban-center tile; "1"–"4" pin a specific variation.
   *  When absent the renderer picks deterministically from the available variants using hex position. */
  spriteVariant?: string;
}

export type TilePalette = Record<string, TileDefinition>;

export interface TileInstance {
  tile: string;
  recon?: ReconStatus;
  density?: TerrainDensity;
  features?: TerrainFeature[];
  /** Optional art-variant override forwarded to the terrain sprite resolver. See TileDefinition.spriteVariant. */
  spriteVariant?: string;
}

/**
 * Combat stance for infantry-type units (infantry, AT infantry, engineers, recon bikes).
 * Determines engagement behavior and tactical tradeoffs.
 */
export type CombatStance = "fireAtWill" | "assault" | "suppressive" | "digIn";

/**
 * Types of hex modifications that can be built by engineer units.
 */
export type HexModificationType = "tankTraps" | "fortifications" | "clearedPath" | "smoke";
export type FacingDirection = "NW" | "NE" | "E" | "SE" | "SW" | "W";
export type HexEdgeFacing = FacingDirection;
export type LegacyScenarioFacing = "N" | "NE" | "SE" | "S" | "SW" | "NW";
export const FACING_DIRECTIONS = ["NW", "NE", "E", "SE", "SW", "W"] as const;

export function normalizeFacingDirection(
  facing: FacingDirection | LegacyScenarioFacing | string | null | undefined,
  fallback: FacingDirection = "NW"
): FacingDirection {
  switch (facing) {
    case "NW":
    case "NE":
    case "E":
    case "SE":
    case "SW":
    case "W":
      return facing;
    case "N":
      return "NW";
    case "S":
      return "SE";
    default:
      return fallback;
  }
}

/**
 * Hex modification built by engineers to alter terrain properties.
 */
export interface HexModification {
  /** Type of modification */
  type: HexModificationType;
  /** Hex location */
  hex: Axial;
  /** Faction that built this modification */
  faction: "Player" | "Bot" | "Ally";
  /** Optional edge-facing for directional battlefield works such as fortifications or tank traps. */
  facing?: HexEdgeFacing;
  /** Optional build depth for progressive works such as cleared paths. */
  level?: number;
  /** Turn when modification was built (for persistence/serialization) */
  builtOnTurn?: number;
  /** Turn at which this modification expires and should be automatically removed (used by smoke screens). */
  expiresOnTurn?: number;
  /** Current structural integrity for fortifications. Missing values are treated as 100 for old scenarios. */
  integrity?: number;
  /** Maximum structural integrity for repair and display. Defaults to 100. */
  maxIntegrity?: number;
  /** Derived fortification damage state for UI and cover projection. */
  damageState?: "intact" | "damaged" | "breached" | "severelyDamaged" | "destroyed";
}

export interface PersonnelStatusPool {
  fit: number;
  injured: number;
  wounded: number;
  severelyWounded: number;
  killed: number;
}

export interface VehicleStatusPool {
  operational: number;
  damaged: number;
  disabled: number;
  destroyed: number;
}

export interface FormationStatus {
  personnel: Record<string, PersonnelStatusPool>;
  equipment: Record<string, VehicleStatusPool>;
  ammo: Record<string, number>;
  suppression: number;
  fatigue?: number;
  /** Describes how personnel and equipment pools convert into combat readiness. */
  readinessModel?: FormationReadinessModel;
}

export interface PersonnelStatusSummary extends PersonnelStatusPool {
  total: number;
  casualties: number;
  nonEffective: number;
  effective: number;
  readiness: number;
}

export interface EquipmentStatusSummary extends VehicleStatusPool {
  total: number;
  losses: number;
  nonOperational: number;
  effective: number;
  readiness: number;
}

export type FormationReadinessBasis = "personnel" | "platform" | "combined";

export interface FormationReadinessModel {
  basis: FormationReadinessBasis;
  personnelWeight: number;
  equipmentWeight: number;
}

export interface FormationReadinessComponentSummary {
  total: number;
  effective: number;
  readiness: number;
  loss: number;
}

export interface FormationReadinessBreakdown {
  basis: FormationReadinessBasis;
  personnelWeight: number;
  equipmentWeight: number;
  personnel: FormationReadinessComponentSummary;
  equipment: FormationReadinessComponentSummary | null;
}

export interface FormationStatusSummary {
  personnel: PersonnelStatusSummary;
  equipment: EquipmentStatusSummary;
  suppression: number;
  readiness: number;
  readinessBreakdown: FormationReadinessBreakdown;
}

export interface ScenarioUnit {
  type: keyof typeof unitTypesData;
  hex: Axial;
  /** Readiness summary derived from status pools when present. Retained for old UI, AI, and scenarios. */
  strength: number;
  /** Effective experience, kept for compatibility with old callers. */
  experience: number;
  /** Trained experience the formation starts with. */
  baseExperience?: number;
  /** Experience earned from intentional attacks during this battle. */
  earnedExperience?: number;
  /** Status pools are the authoritative damage store for new unit-system code. */
  status?: FormationStatus;
  /** Allocation/formation key that produced this scenario unit, when known. */
  formationKey?: string;
  ammo: number;
  fuel: number;
  entrench: number;
  facing: FacingDirection;
  /** When true, unit begins play placed on its hex instead of in reserves. Optional. */
  preDeployed?: boolean;
  /** Stable unique identifier for this unit instance. Generated once and persisted across saves/loads.
   *  Used to distinguish multiple squadrons of the same type at the same base (air units) or same hex. */
  unitId?: string;
  /** Indicates which controller manages this unit. Defaults to the owning faction's AI. Player control enables direct command. */
  controlledBy?: "AI" | "Player";
  /** Array of unit IDs that are currently suppressing this unit. Multiple suppressors result in pinned status. */
  suppressedBy?: string[];
  /** Holds the battalion on alert until its next activation or until incoming fire breaks the stance. */
  onSentry?: boolean;
  /** Tow posture for limbered gun batteries and anti-tank pieces. */
  towState?: "deployed" | "towed";
}

export interface ScenarioSide {
  hq: Axial;
  general: {
    accBonus: number;
    dmgBonus: number;
    moveBonus: number;
    supplyBonus: number;
  };
  units: ScenarioUnit[];
  goal?: string;
  strategy?: string;
  resources?: number;
  objectives?: string[];
}

export interface ScenarioDeploymentZone {
  key: string;
  label: string;
  description: string;
  capacity: number;
  faction: "Player" | "Bot" | "Ally";
  hexes: readonly [number, number][];
}

export interface ScenarioData {
  name: string;
  size: { cols: number; rows: number };
  tilePalette: TilePalette;
  tiles: TileInstance[][];
  objectives: Array<{ hex: Axial; owner: "Player" | "Bot"; vp: number }>;
  turnLimit: number;
  sides: {
    Player: ScenarioSide;
    Bot: ScenarioSide;
    Ally?: ScenarioSide;
  };
  deploymentZones?: ScenarioDeploymentZone[];
  /** Mission-specific budget override. If not specified, uses default 10,000,000. */
  playerBudget?: number;
  /** Unit types explicitly blocked from purchase, including default logistics entitlements like supply convoys. */
  restrictedUnits?: string[];
  /** Curated list of allowed combat units. Supply convoys remain available unless explicitly restricted. */
  allowedUnits?: string[];
  /** Normal delivery delay for in-battle requisitions from the main supply route. Defaults to 3 if omitted. */
  mainSupplyDistanceTurns?: number;
  /** Allocation keys that may be bought during the battle with battle requisition points. */
  allowedBattleRequisitions?: string[];
}

/**
 * Broad unit class used by non-combat systems such as supply priority, rendering, and scenario validation.
 * This remains intentionally coarse so the rest of the game can keep using stable top-level categories.
 */
export const UNIT_CLASS_VALUES = ["infantry", "specialist", "vehicle", "tank", "artillery", "air", "recon"] as const;
export type UnitClass = typeof UNIT_CLASS_VALUES[number];

/**
 * Combat classification splits battlefield tuning away from the broad unit class above.
 * The combat system can now distinguish, for example, light recon bikes from medium armored-car scouts
 * without forcing every other subsystem to understand that extra detail.
 */
export type CombatCategory = UnitClass;
export const COMBAT_WEIGHT_VALUES = ["light", "medium", "heavy"] as const;
export type CombatWeightClass = typeof COMBAT_WEIGHT_VALUES[number];
export const COMBAT_ROLE_VALUES = ["normal", "antiTank", "antiVehicle", "antiInfantry", "support"] as const;
export type CombatRole = typeof COMBAT_ROLE_VALUES[number];
export const COMBAT_SIGNATURE_VALUES = ["tiny", "small", "medium", "large"] as const;
export type CombatSignature = typeof COMBAT_SIGNATURE_VALUES[number];

/**
 * Fine-grained combat metadata consumed only by combat tuning and previews.
 * Keeping these values together avoids spreading loosely-related tuning fields across the unit definition.
 */
export interface CombatClassification {
  category: CombatCategory;
  weight: CombatWeightClass;
  role: CombatRole;
  signature: CombatSignature;
}

export type WeaponDamageRole =
  | "smallArms"
  | "machineGun"
  | "antiTank"
  | "directHe"
  | "indirectHe"
  | "demolition"
  | "airGun"
  | "airBomb"
  | "airRocket"
  | "smoke"
  | "unarmed";

/**
 * Hit types categorize the nature of physical contact between weapon and target.
 * Used to distinguish meaningful damage from superficial contacts in combat resolution.
 */
export type HitType =
  | "nonEffect"      // Valid contact, but no meaningful damage (armor strike, glancing impact)
  | "softComponent"  // Minor system damage (optics, antenna, tracks, exposed stowage)
  | "penetrating"    // Armor defeated or direct crew compartment hit
  | "areaEffect";    // Blast/fragmentation affecting multiple targets (HE, bombs, mortars)

/**
 * Armor exposure states determine crew vulnerability to small arms and fragmentation.
 * In live combat, all armored units are assumed buttoned up unless scenario specifies otherwise.
 */
export type ArmorExposureState =
  | "buttonedUp"     // All hatches closed - crew immune to small arms, limited visibility
  | "unbuttoned"     // Commander exposed - small arms can target crew with reduced effect
  | "openTop"        // No overhead protection - full crew vulnerability
  | "enclosed";      // Full armor protection (default for tanks in combat)

/**
 * Hit distribution defines how weapon contacts translate to different hit types
 * based on target class and armor exposure. Values should sum to 1.0 (100%).
 */
export interface HitDistribution {
  /** Probability of non-effect contact (no damage, suppression only) */
  nonEffect: number;
  /** Probability of soft-component damage (optics, tracks, antenna) */
  softComponent: number;
  /** Probability of penetrating hit (armor defeat, crew casualty) */
  penetrating: number;
  /** Probability of area effect (HE burst, affects multiple targets) */
  areaEffect: number;
}

/**
 * Target-specific hit distribution maps weapon effects against different defender types.
 * All armor targets in combat are assumed buttoned up (static state).
 */
export interface WeaponHitDistribution {
  /** Distribution when targeting infantry or specialist units (soft targets) */
  vsInfantry: HitDistribution;
  /** Distribution when targeting buttoned-up armor (tanks, vehicles in combat) */
  vsArmorButtoned: HitDistribution;
  /** Distribution when targeting artillery or recon vehicles (often less protected) */
  vsArtillery: HitDistribution;
}

export interface PersonnelDamageEffect {
  /** Expected fit personnel moved to injured per effective hit. */
  injured: number;
  /** Expected fit personnel moved to wounded per effective hit. */
  wounded: number;
  /** Expected fit personnel moved to severely wounded per effective hit. */
  severelyWounded: number;
  /** Expected fit personnel killed per effective hit. */
  killed: number;
  /** Hard ceiling for fatalities from one effective hit, used for HE squad-size limits. */
  maxKilledPerHit?: number;
  /** Hard ceiling for all personnel outcomes from one effective hit. */
  maxCasualtiesPerHit?: number;
  /** Payload-specific blast/fragmentation yield. Target exposure is applied separately. */
  blastMultiplier?: number;
  /** Fractional threshold for rounding nonfatal personnel outcomes from this weapon. */
  casualtyRoundingThreshold?: number;
  /** Fractional threshold for rounding fatalities from this weapon. */
  fatalityRoundingThreshold?: number;
  /** Minimum total casualties per direct/near HE contact after target exposure. */
  minimumCasualtiesPerHit?: number;
  /** Minimum wounded-or-worse outcomes per direct/near HE contact after target exposure. */
  minimumWoundedPerHit?: number;
  /** Minimum fatalities per direct/near HE contact after target exposure. */
  minimumKilledPerHit?: number;
}

export interface EquipmentDamageEffect {
  /** Expected operational vehicles/equipment moved to damaged per effective hit. */
  damaged: number;
  /** Expected operational vehicles/equipment moved to disabled per effective hit. */
  disabled: number;
  /** Expected operational vehicles/equipment destroyed per effective hit. */
  destroyed: number;
  /** Optional weapon-specific penetration override. Defaults to the formation AP value. */
  armorPenetration?: number;
  /** Damage type classification for this weapon's hard effects. */
  damageType?: WeaponDamageType;
  /** Component-specific damage distribution (which vehicle components are affected). */
  componentDamage?: ComponentDamageSpec;
}

/**
 * Weapon damage types determine how weapons interact with different targets
 * and affect component vulnerability calculations.
 */
export type WeaponDamageType =
  | "bullet"       // Small arms, machine guns - kinetic damage
  | "explosive"    // HE rounds, bombs, artillery - blast and shock damage
  | "fragment"     // Shrapnel from HE rounds - area fragmentation damage
  | "flame"        // Flamethrowers, napalm - incendiary damage
  | "kinetic"      // High-velocity AP rounds - armor-penetrating kinetic
  | "shapedCharge"; // HEAT rounds - shaped explosive charge for armor penetration

/**
 * Vehicle components that can be individually damaged.
 * Enables detailed repair tracking and component-specific vulnerability.
 */
export type VehicleComponent =
  | "engine"       // Mobility - damaged reduces speed, disabled stops vehicle
  | "tracks"       // Mobility - damaged reduces speed, disabled immobilizes
  | "suspension"   // Mobility - damaged affects off-road capability
  | "gun"          // Firepower - damaged reduces accuracy, disabled removes fire capability
  | "turret"       // Firepower - damaged affects traverse speed, disabled locks turret
  | "optics"       // Targeting - damaged reduces accuracy, disabled requires manual targeting
  | "radio"        // Communication - damaged reduces command range, disabled isolates unit
  | "fuelSystem"   // Survivability - damaged increases fire risk, disabled causes immobilization
  | "armor";       // Protection - damaged plates reduce effective armor value

/**
 * Component damage specification maps weapon effects to specific vehicle components.
 * Used by EquipmentDamageEffect to determine which components are affected.
 */
export interface ComponentDamageSpec {
  /** Components primarily affected by penetrating hits (armor defeat). */
  penetrating?: readonly VehicleComponent[];
  /** Components affected by soft component damage (optics, tracks, antenna). */
  softComponent?: readonly VehicleComponent[];
  /** Components affected by area effect/HE burst (wider damage spread). */
  areaEffect?: readonly VehicleComponent[];
}

export interface WeaponShotGroup {
  readonly id: string;
  readonly label: string;
  readonly role: WeaponDamageRole;
  /** Authored full-strength weapon shots for this group before combat posture/readiness scaling. */
  readonly shots: number;
  /** Converts broad formation accuracy into effective hits for this weapon group. */
  readonly accuracyMultiplier?: number;
  readonly softEffect?: PersonnelDamageEffect;
  readonly hardEffect?: EquipmentDamageEffect;
  readonly suppressionPerHit?: number;
  readonly fortificationDamagePerHit?: number;
  /**
   * Defines how weapon contacts translate to hit types based on target.
   * Explicitly authored per weapon to avoid technical debt from implicit defaults.
   * If omitted, weapon uses default distribution based on role.
   */
  readonly hitDistribution?: WeaponHitDistribution;
  /** Armor penetration value for AP vs armor comparison. Defaults to formation AP if not set. */
  readonly armorPenetration?: number;
}

export interface UnitWeaponModel {
  readonly doctrine: string;
  readonly groups: readonly WeaponShotGroup[];
}

// Roles describe the high-level responsibilities an airframe can perform in the sortie planner.
export type AirSupportRole = "strike" | "escort" | "cap" | "transport" | "recon";

// AirSupportProfile captures flight characteristics used to validate mission assignments and refit pacing.
export interface AirSupportProfile {
  roles: AirSupportRole[];
  cruiseSpeedKph: number;
  combatRadiusKm: number;
  refitTurns: number;
}

// AirCombatWeaponProfile captures aircraft-only firepower used during interceptions and defensive turret exchanges.
// This stays separate from ground-attack ordnance so bomb values are not reused against fighters.
export interface AirCombatWeaponProfile {
  accuracyBase?: number;
  hardAttack?: number;
  softAttack?: number;
  ap?: number;
  rangeMin?: number;
  rangeMax?: number;
  combat?: CombatClassification;
  shotsScalar?: number;
  damageScalar?: number;
  suppressionScalar?: number;
}

export interface AirCombatProfile {
  attack?: AirCombatWeaponProfile;
  turret?: AirCombatWeaponProfile;
}

// Mission kinds enumerate the user-facing Air Support selections shown in the planner UI.
export type AirMissionKind = "strike" | "escort" | "airCover" | "airTransport";

// AirMissionTemplate defines the static configuration for each mission option (who can fly it and what triggers it uses).
export interface AirMissionTemplate {
  kind: AirMissionKind;
  label: string;
  description: string;
  allowedRoles: AirSupportRole[];
  requiresTarget: boolean;
  requiresFriendlyEscortTarget: boolean;
  durationTurns: number;
}

export interface ArmorProfile {
  front: number;
  side: number;
  rear?: number;
  top: number;
}

export interface UnitTypeDefinition {
  class: UnitClass;
  /**
   * Combat-only tuning identity. This is more specific than `class` so balance tables can distinguish
   * light/medium/heavy and role-specialized formations without destabilizing non-combat systems.
   */
  combat: CombatClassification;
  /**
   * Weapon effect type for procedural combat animations.
   * Maps to effect specifications in effectSpecs.json.
   */
  weaponEffectType?: string;
  movement: number;
  moveType: MoveType;
  vision: number;
  ammo: number;
  fuel: number;
  rangeMin: number;
  rangeMax: number;
  initiative: number;
  armor: ArmorProfile;
  hardAttack: number;
  softAttack: number;
  ap: number;
  accuracyBase: number;
  traits: string[];
  cost: number;
  /** Trained experience assigned when this type is created without a formation-specific override. */
  baseExperience?: number;
  /** Gameplay translation for fortification damage while richer damage packets are being rolled in. */
  fortificationDamage?: "none" | "low" | "medium" | "high" | "veryHigh";
  /** Gameplay translation for suppression role while richer damage packets are being rolled in. */
  suppressionRole?: "none" | "low" | "medium" | "high" | "veryHigh";
  /** Authoritative weapon-shot model used by status-pool combat resolution. */
  weaponModel?: UnitWeaponModel;
  airSupport?: AirSupportProfile;
  airCombat?: AirCombatProfile;
}

export type UnitTypeDictionary = typeof unitTypesData;

export type GameScenario = typeof scenarioData;
