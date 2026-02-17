import type { Axial } from "./types";

/**
 * Campaign map tile scale constant so downstream modules can convert distances and ranges.
 * The campaign layer models each hex as ten kilometers.
 */
export const CAMPAIGN_HEX_SCALE_KM = 10;

/**
 * Campaign time resolution: each turn represents 3 hours.
 * 8 segments = 1 day (24 hours).
 */
export const CAMPAIGN_SEGMENT_HOURS = 3;
export const SEGMENTS_PER_DAY = 8;

/** Identifies the owning faction of a campaign tile or objective. */
export type CampaignFactionKey = "Player" | "Bot" | "Neutral" | string;

/** Strategic installation or formation that can occupy a campaign tile. */
export type CampaignTileRole =
  | "airbase"
  | "navalBase"
  | "logisticsHub"
  | "taskForce"
  | "region"
  | "supplyRoute"
  | "intelNode"
  | "fortificationHeavy"
  | "fortificationLight";

/**
 * Describes the strategic value of a single campaign tile at 5km scale.
 * Tactical terrain is intentionally omitted; instead we capture control, capacity, and sprite metadata.
 */
export interface CampaignForceGroup {
  /** Scenario unit type (or alias) representing this force cluster. */
  unitType: string;
  /** Aggregated count of formations staged at this tile. */
  count: number;
  /** Optional label surfaced in tooltips for additional context. */
  label?: string;
}

export interface CampaignTileDefinition {
  /** High-level role determines icon, UI copy, and rules interactions (e.g., airbase increases sortie capacity). */
  role: CampaignTileRole;
  /** Current controller informs resource generation and front line rendering. */
  factionControl: CampaignFactionKey;
  /** Optional sprite key references art under src/assets/campaign. */
  spriteKey?: string;
  /** Supply throughput contributed by this location each campaign turn. */
  supplyValue?: number;
  /** Air wing capacity exposed to the sortie planner. */
  airSortieCapacity?: number;
  /** Naval task force slots reachable from this tile. */
  navalCapacity?: number;
  /** Fog of war support: tiles can declare whether their intel has been confirmed. */
  intelConfirmed?: boolean;
  /** Free-form notes allow designers to surface tooltips or scripted hooks. */
  notes?: string;
  /** Optional aggregated forces rendered on the campaign map. */
  forces?: CampaignForceGroup[];
}

/**
 * Map entry describing which campaign tile definition is instantiated at a specific hex coordinate.
 * Using axial coordinates keeps parity with tactical map helpers.
 */
export interface CampaignTileInstance {
  /** Reference key into the campaign tile palette map. */
  tile: string;
  /** Ownership overrides are stored here when a tile changes hands mid-campaign. */
  factionControl?: CampaignFactionKey;
  /** Optional sprite override so designers can swap icons without duplicating palette entries. */
  spriteKey?: string;
  /** Rotation angle in degrees (0, 90, 180, 270) for the sprite. */
  rotation?: number;
  /** Axial hex coordinate that this entry occupies. */
  hex: Axial;
  /** Tile-specific force overrides applied on top of palette defaults. */
  forces?: CampaignForceGroup[];
  /** Day number when the current controller took (or last confirmed) control. Used for auto-front rules. */
  controlSinceDay?: number;
}

/**
 * Strategic fronts define borders between factions. The renderer fills or outlines these collections of hexes.
 */
export interface CampaignFrontLine {
  key: string;
  label: string;
  /** Ordered list of hex keys ("col,row") describing the border path so we can render directional polylines. */
  hexKeys: string[];
  /** Faction that initiated or currently holds the initiative on this front. */
  initiative: CampaignFactionKey;
  /**
   * Optional advantage modifiers applied when this front spawns a tactical battle (e.g., artillery bonus, supply penalty).
   */
  modifiers?: string[];
}

/**
 * Strategic objectives reward the commander with bonuses when completed and may unlock new fronts.
 */
export interface CampaignObjective {
  key: string;
  label: string;
  description: string;
  /** Hex location for UI focus and renderer markers. */
  hex: Axial;
  /** Owning faction at campaign start. */
  owner: CampaignFactionKey;
  /** Advantages granted when the player secures the objective. */
  rewards: string[];
  /** Optional penalties applied to the opposing faction. */
  penalties?: string[];
}

/**
 * Transport asset pools available for redeployment operations.
 */
export interface TransportCapacity {
  /** Available trucks for motorized ground transport. */
  trucks: number;
  /** Trucks currently deployed on redeployment missions. */
  trucksInTransit: number;
  /** Transport ships for naval lift operations. */
  transportShips: number;
  /** Ships currently at sea with cargo. */
  transportShipsInTransit: number;
  /** Transport aircraft for airlift operations. */
  transportPlanes: number;
  /** Planes currently on airlift missions. */
  transportPlanesInTransit: number;
}

/**
 * Defines a method of transporting forces across the campaign map.
 * Each mode has different speed, cost, capacity requirements, and restrictions.
 */
export interface TransportMode {
  /** Unique identifier for this transport mode. */
  key: string;
  /** Display name shown in UI. */
  label: string;
  /** Movement speed in hexes per day (remember: 1 hex = 5km). */
  speedHexPerDay: number;
  /** Supply cost per unit per hex traveled. */
  suppliesCostPerUnitPerHex: number;
  /** Fuel cost per unit per hex traveled. */
  fuelCostPerUnitPerHex: number;
  /** Manpower attrition risk per unit per hex (applied probabilistically). */
  manpowerRiskPerUnitPerHex: number;
  /** Type of transport capacity consumed, if any. */
  capacityType?: "trucks" | "transportShips" | "transportPlanes";
  /** How many units can be carried per transport vehicle. */
  capacityPerVehicle?: number;
  /** Which unit types are eligible for this transport mode. Empty array = all units. */
  applicableUnitTypes?: string[];
  /** If true, origin and destination must both be naval bases or coastal hexes. */
  requiresNavalBase?: boolean;
  /** If true, origin and destination must both be airbases. */
  requiresAirbase?: boolean;
  /** Short description of restrictions or use cases. */
  description?: string;
}

/**
 * Summary of resource pools tracked per faction on the campaign layer.
 * Totals influence decision making (reinforcements, supply convoys, etc.).
 */
export interface CampaignFactionEconomy {
  faction: CampaignFactionKey;
  manpower: number;
  /** Food, water, and wear/tear replaceables. 1 supply = 1 meal + water + consumables for 1 man. */
  supplies: number;
  /** Fuel in liters. 1 fuel = 1 liter. */
  fuel: number;
  /** Ammunition (small arms, shells, bombs) stored as cargo. Transported but not consumed on campaign map. */
  ammo: number;
  airPower: number;
  navalPower: number;
  intelCoverage: number;
  /** Transport assets available for force redeployment. */
  transportCapacity?: TransportCapacity;
}

/**
 * Campaign tile palette is indexed by designer-defined keys. This mirrors tactical scenario palettes.
 */
export type CampaignTilePalette = Record<string, CampaignTileDefinition>;

/**
 * Describes a terrain zone on the campaign map (land or water) using coordinate ranges.
 * Note: This is simplified and may not accurately represent irregular coastlines.
 */
export interface CampaignMapZone {
  /** Minimum r coordinate for this zone (inclusive). */
  rMin: number;
  /** Maximum r coordinate for this zone (inclusive). */
  rMax: number;
  /** Terrain type: land or water. */
  terrain: "land" | "water";
  /** Optional label for this zone (e.g., "England", "English Channel", "France"). */
  label?: string;
}

/**
 * Defines map extent corners and terrain zones to help developers understand coordinate geography.
 * This documentation aids in proper placement of bases, fortifications, and forces.
 */
export interface CampaignMapExtents {
  /** Human-readable description of what this map represents. */
  description: string;
  /** Four corner coordinates defining the map boundaries. */
  corners: {
    /** Northwest corner (typically q:0, r:0). */
    nw: { q: number; r: number; label: string };
    /** Northeast corner (typically q:cols-1, r:0). */
    ne: { q: number; r: number; label: string };
    /** Southwest corner (typically q:0, r:rows-1). */
    sw: { q: number; r: number; label: string };
    /** Southeast corner (typically q:cols-1, r:rows-1). */
    se: { q: number; r: number; label: string };
  };
  /** Simplified terrain zones using r coordinate ranges. Note: Does not account for irregular coastlines. */
  zones: CampaignMapZone[];
  /**
   * Set of hex coordinates marked as water terrain.
   * Format: "q,r" strings (e.g., "25,17" for hex at q=25, r=17).
   * This allows precise marking of irregular water bodies like the English Channel.
   */
  waterHexes?: string[];
}

/**
 * Full campaign scenario payload the engine loads for the strategic layer before spawning tactical engagements.
 */
export interface CampaignScenarioData {
  key: string;
  title: string;
  description: string;
  /** Allows future variants to tweak the hex scale without editing code. Defaults to CAMPAIGN_HEX_SCALE_KM. */
  hexScaleKm?: number;
  dimensions: { cols: number; rows: number };
  /** Optional map extent documentation defining corners and terrain zones. */
  mapExtents?: CampaignMapExtents;
  background: {
    imageUrl: string;
    attribution?: string;
    /** Describes how the background illustration should scale within the SVG view box. Defaults to "cover". */
    stretchMode?: "cover" | "contain" | "stretch";
    /**
     * Native pixel dimensions of the background illustration. When provided, the renderer sizes the SVG canvas to match so scrolling uses
     * the original artwork scale rather than re-deriving dimensions from hex geometry.
     */
    nativeWidth?: number;
    nativeHeight?: number;
    /**
     * Approximate theater width represented by the illustration in kilometers. Lets UI surfaces translate pixels into strategic distance
     * (e.g., to keep overlays roughly 5 km edge-to-edge when matching real-world references like the Channel coast).
     */
    nominalWidthKm?: number;
  };
  tilePalette: CampaignTilePalette;
  tiles: CampaignTileInstance[];
  fronts: CampaignFrontLine[];
  objectives: CampaignObjective[];
  economies: CampaignFactionEconomy[];
}

/**
 * Captures mutable state for the active campaign turn. The engine updates this structure and
 * broadcasts snapshots to the UI so commanders see live resource totals and upcoming engagements.
 */
export interface CampaignTurnState {
  scenarioKey: string;
  turnNumber: number;
  /** Faction completing decisions during this turn. */
  activeFaction: CampaignFactionKey;
  /** Resource ledger recording gains and expenditures this turn. */
  economyDeltas: CampaignFactionEconomy[];
  /** Pending tactical battles spawned from fronts or objectives. */
  pendingEngagements: CampaignPendingEngagement[];
}

/**
 * Describes a tactical battle opportunity generated from a campaign decision.
 */
export interface CampaignPendingEngagement {
  id: string;
  frontKey: string | null;
  objectiveKey: string | null;
  attacker: CampaignFactionKey;
  defender: CampaignFactionKey;
  /** Hexes implicated in the battle so the UI can animate focus before transitioning screens. */
  hexKeys: string[];
  /** Free-form tags help downstream systems decide which battle template to instantiate. */
  tags: string[];
}

/** Player actions on the campaign map are captured as decisions to enable undo/replay workflows later. */
export interface CampaignDecision {
  id: string;
  faction: CampaignFactionKey;
  type:
    | "redeploy"
    | "launchOffensive"
    | "fortifyFront"
    | "allocateAirWing"
    | "allocateNavalTaskForce"
    | "improveIntel"
    | "custom";
  /** Additional data depends on decision type; storing it as a free-form payload keeps the scaffold flexible. */
  payload: Record<string, unknown>;
  /** Campaign hex key(s) impacted by this decision for renderer highlighting. */
  affectedHexKeys: string[];
  comment?: string;
}
