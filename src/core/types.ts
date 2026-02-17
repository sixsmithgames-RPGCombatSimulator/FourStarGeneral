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
  | "pastures"
  | "trees"
  | "shrubs"
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

export interface ScenarioUnit {
  type: keyof typeof unitTypesData;
  hex: Axial;
  strength: number;  // Percentage: 0-100 (100 = full strength, 0 = destroyed)
  experience: number;
  ammo: number;
  fuel: number;
  entrench: number;
  facing: "N" | "NE" | "SE" | "S" | "SW" | "NW";
  /** Stable unique identifier for this unit instance. Generated once and persisted across saves/loads.
   *  Used to distinguish multiple squadrons of the same type at the same base (air units) or same hex. */
  unitId?: string;
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
  faction: "Player" | "Bot";
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
  };
  deploymentZones?: ScenarioDeploymentZone[];
}

export type UnitClass =
  | "infantry"
  | "specialist"
  | "vehicle"
  | "tank"
  | "artillery"
  | "air"
  | "recon";

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
