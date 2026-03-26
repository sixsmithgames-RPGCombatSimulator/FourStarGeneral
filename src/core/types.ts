import type terrainData from "../data/terrain.json";
import type unitTypesData from "../data/unitTypes.json";
import type scenarioData from "../data/scenario01.json";

export type Axial = { q: number; r: number };

export type TerrainKey = keyof typeof terrainData;
export type MoveType = "leg" | "wheel" | "track" | "air";
export type TerrainDensity = "sparse" | "average" | "dense";
export type ReconStatus = "aerial" | "intel" | "firsthand" | "none";
export type TerrainFeature =
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
}

export type TilePalette = Record<string, TileDefinition>;

export interface TileInstance {
  tile: string;
  recon?: ReconStatus;
  density?: TerrainDensity;
  features?: TerrainFeature[];
}

/**
 * Combat stance for infantry-type units (infantry, AT infantry, engineers, recon bikes).
 * Determines engagement behavior and tactical tradeoffs.
 */
export type CombatStance = "assault" | "suppressive" | "digIn";

/**
 * Types of hex modifications that can be built by engineer units.
 */
export type HexModificationType = "tankTraps" | "fortifications" | "clearedPath";

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
  /** Turn when modification was built (for persistence/serialization) */
  builtOnTurn?: number;
}

export interface ScenarioUnit {
  type: keyof typeof unitTypesData;
  hex: Axial;
  strength: number;  // Percentage: 0-100 (100 = full strength, 0 = destroyed)
  experience: number;
  ammo: number;
  fuel: number;
  entrench: number;
  facing: "N" | "NE" | "SE" | "S" | "SW" | "NW";
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

// Roles describe the high-level responsibilities an airframe can perform in the sortie planner.
export type AirSupportRole = "strike" | "escort" | "cap" | "transport" | "recon";

// AirSupportProfile captures flight characteristics used to validate mission assignments and refit pacing.
export interface AirSupportProfile {
  roles: AirSupportRole[];
  cruiseSpeedKph: number;
  combatRadiusKm: number;
  refitTurns: number;
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
  airSupport?: AirSupportProfile;
}

export type UnitTypeDictionary = typeof unitTypesData;

export type GameScenario = typeof scenarioData;
