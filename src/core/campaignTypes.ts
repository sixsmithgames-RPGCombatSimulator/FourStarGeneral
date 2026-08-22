import type { Axial } from "./types";
import type { CampaignIntelligenceBriefing } from "./campaignIntelTypes";

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

export type CampaignInfrastructureDamageState =
  | "intact"
  | "damaged"
  | "breached"
  | "severelyDamaged"
  | "destroyed";

/** Mutable operational condition projected for a strategic installation. */
export interface CampaignInfrastructureState {
  readonly role: CampaignTileRole;
  maxIntegrity: number;
  integrity: number;
  damageState: CampaignInfrastructureDamageState;
  effectiveness: number;
  disabled: boolean;
  lastDamageSegment: number | null;
  lastRepairSegment: number | null;
  lastCapturedSegment: number | null;
  capturedFrom: CampaignFactionKey | null;
  capturedBy: CampaignFactionKey | null;
  captureDisruptionUntilSegment: number | null;
  activeRepairOrderId: string | null;
}

/**
 * Describes the strategic value of a single campaign tile at the authored theater scale.
 * Tactical terrain is intentionally omitted; instead we capture control, capacity, and sprite metadata.
 */
export interface CampaignForceGroup {
  /** Scenario unit type (or alias) representing this force cluster. */
  unitType: string;
  /** Aggregated count of formations staged at this tile. */
  count: number;
  /** Optional label surfaced in tooltips for additional context. */
  label?: string;
  /** Campaign segment when this authored group first enters the operational order of battle. */
  availableFromSegment?: number;
  /** Optional player-facing event copy emitted when the group becomes available. */
  availabilityCopy?: string;
}

export interface CampaignTileDefinition {
  /** High-level role determines icon, UI copy, and rules interactions (e.g., airbase increases sortie capacity). */
  role: CampaignTileRole;
  /** Current controller informs resource generation and front line rendering. */
  factionControl: CampaignFactionKey;
  /** Optional player-facing geographic or operational name, such as Utah Beach or Caen. */
  mapLabel?: string;
  /** Optional sprite key references art under src/assets/campaign. */
  spriteKey?: string;
  /** Supply throughput contributed by this location each campaign turn. */
  supplyValue?: number;
  /** Optional authored structural ceiling; role-specific defaults apply when omitted. */
  infrastructureMaxIntegrity?: number;
  /** Optional authored structural points restored per three-hour repair segment. */
  infrastructureRepairRate?: number;
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
  /** Clockwise facing angle in degrees. Directional sprites select their nearest authored view. */
  rotation?: number;
  /** Axial hex coordinate that this entry occupies. */
  hex: Axial;
  /** Tile-specific force overrides applied on top of palette defaults. */
  forces?: CampaignForceGroup[];
  /** Day number when the current controller took (or last confirmed) control. Used for auto-front rules. */
  controlSinceDay?: number;
  /** Runtime infrastructure projection. Authored scenarios may also seed pre-existing damage. */
  infrastructure?: CampaignInfrastructureState;
}

/**
 * Strategic fronts define borders between factions. The renderer fills or outlines these collections of hexes.
 */
export interface CampaignFrontLine {
  key: string;
  label: string;
  /** Ordered list of hex keys ("col,row") describing the border path so we can render directional polylines. */
  hexKeys: string[];
  /**
   * Exact derived control-adjacency edges. Each pair uses offset keys and must join adjacent tiles
   * controlled by opposing non-neutral factions. Legacy authored fronts may omit this field.
   */
  edges?: Array<{
    friendlyHexKey: string;
    opposingHexKey: string;
  }>;
  /** Faction that initiated or currently holds the initiative on this front. */
  initiative: CampaignFactionKey;
  /**
   * Optional advantage modifiers applied when this front spawns a tactical battle (e.g., artillery bonus, supply penalty).
   */
  modifiers?: string[];
}

export type CampaignObjectiveCategory = "primary" | "secondary" | "optional" | "failure";
export type CampaignObjectiveVisibility = "briefed" | "revealedByEvent" | "secretUntilResolved";

/** Data-driven conditions evaluated against authoritative post-control campaign truth. */
export type CampaignObjectiveCondition =
  | {
      kind: "controlHex";
      /** Defaults to the objective marker hex. */
      hex?: Axial;
      /** Defaults to Player. */
      faction?: CampaignFactionKey;
      /** Completed campaign segments of uninterrupted control required. */
      holdSegments?: number;
      /** Optional operational-capacity requirement for an installation on the hex. */
      minimumInfrastructureEffectiveness?: number;
    }
  | {
      kind: "formationStrength";
      formationId: string;
      comparison: "atLeast" | "atMost";
      /** Effective personnel/equipment/readiness percentage in the inclusive range 0-100. */
      percent: number;
    }
  | {
      kind: "formationStatus";
      formationId: string;
      statuses: Array<"unavailable" | "ready" | "committed" | "inTransit" | "isolated" | "refitting" | "shattered" | "destroyed" | "captured">;
    }
  | {
      kind: "resourceThreshold";
      /** Defaults to Player. */
      faction?: CampaignFactionKey;
      resource: "manpower" | "supplies" | "fuel" | "ammo" | "airPower" | "navalPower" | "intelCoverage";
      comparison: "atLeast" | "atMost";
      amount: number;
    }
  | {
      kind: "operationResult";
      engagementId: string;
      result: "victory" | "defeat" | "stalemate" | "anyResolved";
    }
  | {
      kind: "surviveUntil";
      segment: number;
    }
  | {
      kind: "objectiveStatus";
      objectiveKey: string;
      status: "completed" | "failed";
    };

/** Typed effects applied once when an objective completes. */
export type CampaignObjectiveRewardEffect =
  | {
      kind: "resource";
      /** Defaults to Player. */
      faction?: CampaignFactionKey;
      resource: "manpower" | "supplies" | "fuel" | "ammo";
      amount: number;
      label?: string;
    }
  | {
      kind: "power";
      /** Defaults to Player. */
      faction?: CampaignFactionKey;
      resource: "airPower" | "navalPower" | "intelCoverage";
      amount: number;
      label?: string;
    }
  | {
      kind: "unlock";
      key: string;
      label: string;
    };

/** One authored chapter of the operation. Objectives may activate only while their phase is current. */
export interface CampaignPhaseDefinition {
  key: string;
  label: string;
  description: string;
  objectiveKeys: string[];
}

/** Authored campaign arc and transparent terminal rules. */
export interface CampaignArcDefinition {
  phases: CampaignPhaseDefinition[];
  /** All listed objectives must complete for victory. Defaults to all primary objectives. */
  victoryObjectiveKeys?: string[];
  /** Any listed objective failure ends the campaign. Defaults to failed primary/failure objectives. */
  defeatObjectiveKeys?: string[];
  /** Optional command-viability defeat rule. */
  defeatWhenNoPlayerFormations?: boolean;
  /** Score-percent thresholds for the recorded victory grade. */
  decisiveVictoryThreshold?: number;
  standardVictoryThreshold?: number;
  /** Clearly separates a recorded result from optional sandbox continuation. */
  allowContinueAfterOutcome?: boolean;
}

/**
 * Strategic objectives are first-class campaign rules as well as map markers. Optional fields keep
 * legacy scenarios loadable; the Campaign 2.0 adapter supplies documented defaults.
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
  category?: CampaignObjectiveCategory;
  visibility?: CampaignObjectiveVisibility;
  conditions?: CampaignObjectiveCondition[];
  completionMode?: "all" | "any";
  /** Absolute campaign deadline. The condition is still evaluated on the deadline boundary. */
  deadlineSegment?: number;
  /** Legacy shorthand applied to control conditions that do not declare their own hold duration. */
  holdSegments?: number;
  /** Score awarded on completion; failure forfeits these points. */
  score?: number;
  /** Objective keys that must complete before this objective can activate. */
  requiresObjectives?: string[];
  /** Restricts activation to an authored campaign phase. */
  phaseKey?: string;
  /** Typed, mechanically applied rewards. Legacy reward strings remain display-only. */
  rewardEffects?: CampaignObjectiveRewardEffect[];
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
  /** Movement speed in campaign hexes per modeled time interval; distance comes from scenario.hexScaleKm. */
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
 * Player-set split of daily industrial capacity across resources.
 * Values are percentages that must sum to 100.
 */
export interface ProductionAllocation {
  supplies: number;
  fuel: number;
  ammo: number;
  manpower: number;
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
  /** Player-controlled split of daily industrial output. Persists with the scenario in saves. */
  productionAllocation?: ProductionAllocation;
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
  /** Source-backed fixed landmarks used to verify that the grid follows the painted background at theater scale. */
  registrationAnchors?: Array<{
    key: string;
    label: string;
    hex: Axial;
    sourceLabel: string;
  }>;
  /** Independent distance checks that prevent one locally correct cluster from certifying a mis-scaled theater. */
  distanceCalibrations?: Array<{
    fromAnchorKey: string;
    toAnchorKey: string;
    expectedDistanceKm: number;
    toleranceKm: number;
    sourceLabel: string;
  }>;
}

/**
 * Anchors abstract campaign segments to the operation's historical calendar.
 * The offset keeps familiar D-day notation coherent without changing deterministic segment math.
 */
export interface CampaignHistoricalCalendar {
  /** ISO calendar date represented by campaign segment zero. */
  startDateIso: string;
  /** D-day-relative day number represented by segment zero (for example, 1 renders as D+1). */
  operationDayOffset: number;
}

/**
 * One fixed strategic location included in a faction's pre-operation briefing.
 * This is immutable map knowledge, not a projection of the location's current
 * controller, garrison, capacity, damage, or operational status.
 */
export interface CampaignBriefedStrategicSite {
  /** Stable authored identity independent from any runtime tile at the same location. */
  key: string;
  /** Faction whose command briefing contains this location. */
  observerFaction: CampaignFactionKey;
  /** Exact fixed location known from maps, photography, or historical planning records. */
  hex: Axial;
  /** Public geographic or installation name. */
  label: string;
  /** Broad installation class safe to expose without consulting runtime truth. */
  role: CampaignTileRole;
  /** Concise, source-bounded briefing text. Must not describe mutable runtime state. */
  summary: string;
  /** Player-facing provenance such as "Pre-operation aerial survey". */
  sourceLabel: string;
  /** Authored public marker art; never derived from a hidden runtime tile. */
  spriteKey: string;
}

/**
 * Full campaign scenario payload the engine loads for the strategic layer before spawning tactical engagements.
 */
export interface CampaignScenarioData {
  key: string;
  title: string;
  description: string;
  /** Optional historical anchor used by player-facing campaign clocks. */
  historicalCalendar?: CampaignHistoricalCalendar;
  /** Allows future variants to tweak the hex scale without editing code. Defaults to CAMPAIGN_HEX_SCALE_KM. */
  hexScaleKm?: number;
  dimensions: { cols: number; rows: number };
  /** Optional map extent documentation defining corners and terrain zones. */
  mapExtents?: CampaignMapExtents;
  background: {
    imageUrl: string;
    attribution?: string;
    /**
     * Registered campaign-grid projection. `flatTopOddQ` matches the campaign's axial/odd-q
     * neighbor math while covering rectangular background art without a skewed overscan lattice.
     * Missing values preserve the legacy pointy-top renderer for older and test scenarios.
     */
    gridLayout?: "flatTopOddQ";
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
     * (e.g., to keep overlays registered at the authored kilometer scale when matching real-world coastlines).
     */
    nominalWidthKm?: number;
  };
  tilePalette: CampaignTilePalette;
  /** Fixed sites known from an observer's briefing, kept separate from mutable runtime tiles. */
  briefedStrategicSites?: CampaignBriefedStrategicSite[];
  tiles: CampaignTileInstance[];
  fronts: CampaignFrontLine[];
  objectives: CampaignObjective[];
  /** Optional first-class phase, score, victory, and defeat policy. */
  campaignArc?: CampaignArcDefinition;
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
 * Mission archetypes derived from the campaign map context at the moment an engagement is queued.
 * The defender tile's palette role is the primary driver; see docs/CAMPAIGN_BATTLE_GENERATION_DESIGN.md.
 */
export type CampaignMissionType =
  | "fortifiedAssault"
  | "lineAssault"
  | "portAssault"
  | "airfieldRaid"
  | "depotRaid"
  | "meetingEngagement";

/** One aggregate campaign force pool entry with optional stable formation identities attached by Campaign 2.0. */
export interface CampaignEngagementForceGroup {
  hexKey: string;
  unitType: string;
  count: number;
  /** Stable campaign formations represented by this group, in deterministic selection order. */
  formationIds?: string[];
}

/**
 * Structured payload captured when an engagement is queued so precombat and battle generation
 * can honor the strategic situation: mission type, forces in position, enemy pool, and budget.
 * All downstream consumers must tolerate its absence (legacy engagements fall back to old behavior).
 */
export interface CampaignEngagementContext {
  engagementId: string;
  /** Offset hex key ("col,row") of the contested hex the battle is fought over. */
  battleHexKey: string;
  attacker: CampaignFactionKey;
  defender: CampaignFactionKey;
  missionType: CampaignMissionType;
  /** True when the assault crosses water; informs template choice in Phase 2. */
  amphibious: boolean;
  /** True when the battle hex borders declared water — steers template terrain selection. */
  coastal: boolean;
  /** Current battle-hex facility performance, used by tactical generation and briefings. */
  infrastructureEffectiveness?: number;
  /** Current battle-hex facility integrity, when the tile contains strategic infrastructure. */
  infrastructureIntegrity?: number;
  infrastructureMaxIntegrity?: number;
  infrastructureDamageState?: CampaignInfrastructureDamageState;
  /** Friendly force groups eligible to commit, with the hex they stage from. */
  availableForces: CampaignEngagementForceGroup[];
  /** Per-allocation-key quantity caps derived from availableForces via the mapping table. */
  allocationCaps: Record<string, number>;
  /** Defender force pool (exact counts internally; UI surfaces banded estimates only). */
  enemyForces: CampaignEngagementForceGroup[];
  /** Air sorties reachable from in-range friendly airbases. */
  airSorties: number;
  /** Discretionary consumables budget (RP) granted on top of committed-force value. */
  rpReserve: number;
  /** Mapped RP value of the player's available forces. */
  playerForceValue: number;
  /** Mapped RP value of the enemy pool. */
  enemyForceValue: number;
  /** playerForceValue / enemyForceValue (Infinity when enemy pool is empty). */
  forceRatio: number;
  /** Frozen faction knowledge captured at commitment. Player-facing UI must prefer this over true force values. */
  intelligenceBriefing?: CampaignIntelligenceBriefing;
  /** Resolved tactical template key; null until Phase 2 template selection lands. */
  templateKey: string | null;
  frontKey: string | null;
  objectiveKey: string | null;
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
  /** Structured strategic context captured at queue time. Optional for legacy engagements. */
  context?: CampaignEngagementContext;
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
