import type { IMapRenderer } from "../contracts/IMapRenderer";
import { normalizeFacingDirection, type HexEdgeFacing, type HexModification, type ScenarioData, type ScenarioUnit, type TerrainDictionary, type UnitClass, type UnitTypeDefinition } from "../core/types";
import { getSpriteForScenarioType } from "../data/unitSpriteCatalog";
import { HEX_RADIUS, HEX_HEIGHT, HEX_WIDTH } from "../core/balance";
import { CoordinateSystem, type TileDetails } from "./CoordinateSystem";
import { TerrainRenderer } from "./TerrainRenderer";
import { RoadOverlayRenderer } from "./RoadOverlayRenderer";
import { ProceduralEffectsAnimator, getZoomTier } from "./ProceduralEffects";
import { loadEffectSpecifications } from "./EffectSpecifications";
import { getTerrainTint, shouldUseTerrainResponse, loadTerrainTints } from "./TerrainResponseSystem";
import { WreckFxRenderer, resolveWreckFxClass, type WreckFxClass } from "./WreckFxRenderer";
import { CombatSoundManager, type QueuedWeaponSoundRequest } from "../audio/CombatSoundManager";
import type { WeaponSoundClass } from "../audio/SoundAssetMetadata";
import { sampleAirShowWaypointPath } from "../ui/airshow/AirShowPathMath";
import {
  logAirShowPackageStart,
  logAirShowBeatStart,
  logAirShowActorTransition,
  logAirShowEffect,
  logAirShowOwnershipAssert,
  logAirShowPackageEnd,
  logAirShowReportLink,
  debugAirShowPhase,
  debugAirShowEffect,
  debugAirShowActor,
  type AirShowRole,
  type AirShowActorState,
  type AirShowEffectType
} from "../ui/airshow/AirShowLogger";
import terrainData from "../data/terrain.json";
import unitTypesData from "../data/unitTypes.json";
import { axialDirections, hexLine, type Axial } from "../core/Hex";

/**
 * Recon status types.
 */
export type ReconStatusKey = "unknown" | "spotted" | "identified" | "visible";

export interface BattleTargetMarker {
  readonly id: string;
  readonly hexKey: string;
  readonly icon: "crosshair" | "parachute";
  readonly accentColor?: string;
  readonly tooltip?: string;
  readonly interactive?: boolean;
}

/**
 * Hex rendering configuration constants.
 */
const HEX_DEFAULT_STROKE = "#2a2a2a";
const HEX_DEFAULT_STROKE_WIDTH = 1;
const SVG_NS = "http://www.w3.org/2000/svg";
const SELECTION_GLOW_CLASS = "hex-selection-glow";
const ACTIVE_ZONE_CLASS = "deployment-zone";
const MOVE_OPTION_HIGHLIGHT_CLASS = "move-option-highlight";
const ATTACK_TARGET_HIGHLIGHT_CLASS = "attack-target-highlight";
const IDLE_UNIT_HIGHLIGHT_CLASS = "idle-unit-highlight";
/**
 * Static sprite used for the base camp marker. Using new URL ensures bundlers resolve the asset with type safety.
 */
const BASE_CAMP_MARKER_SPRITE = new URL("../assets/units/Base_camp.png", import.meta.url).href;
const BASE_CAMP_MARKER_CLASS = "base-camp-marker";
const BASE_CAMP_MARKER_SIZE = HEX_RADIUS * 1.8;
const UNKNOWN_CONTACT_SPRITE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <polygon points="32,4 60,32 32,60 4,32" fill="#451313" stroke="#f3b36b" stroke-width="4"/>
    <circle cx="32" cy="32" r="12" fill="#0d1017" opacity="0.9"/>
    <text x="32" y="39" text-anchor="middle" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="#f9d49a">?</text>
  </svg>`
)}`;

type CombatAnimationKey = keyof typeof import("./SpriteSheetAnimator").COMBAT_ANIMATIONS;
type AircraftAnimationProgressCallback = (progress: number, centerX: number, centerY: number) => void;
type SpriteRenderFaction = "Player" | "Bot" | "Ally";
type AircraftSortieOptions = {
  ingressDurationMs?: number;
  egressDurationMs?: number;
  turnDelayMs?: number;
  strength?: number;
  laneOffsetPx?: number;
  faction?: SpriteRenderFaction;
  role?: AirShowRole;
  onIngressProgress?: AircraftAnimationProgressCallback;
  onEgressProgress?: AircraftAnimationProgressCallback;
  onTargetPass?: (centerX: number, centerY: number) => void | Promise<void>;
};
type AircraftOrbitOptions = {
  orbitRadiusPx?: number;
  turns?: number;
  startAngleRad?: number;
  clockwise?: boolean;
  verticalScale?: number;
  onProgress?: AircraftAnimationProgressCallback;
};
type AirShowFlightSpec = {
  id: string;
  scenarioType: string;
  faction?: SpriteRenderFaction;
  strength?: number;
  laneOffsetPx?: number;
  team: "interceptor" | "escort" | "bomber";
};
export type ResolvedAirShowFlightSpec = {
  id: string;
  scenarioType: string;
  faction?: SpriteRenderFaction;
  originHexKey?: string | null;
  strengthBefore: number;
  strengthAfterEscortPhase?: number;
  finalStrength?: number;
  laneOffsetPx?: number;
  role: "interceptor" | "escort" | "bomber";
  combatRole?: "cap" | "escort" | "strike";
};
export type ResolvedAirShowExchange = {
  attackerUnitKey: string;
  defenderUnitKey: string;
  attackerStrengthAfter?: number;
  defenderStrengthAfter?: number;
  damageToDefender?: number;
  retaliationDamage?: number;
  attackerDestroyed?: boolean;
  defenderDestroyed?: boolean;
  visualPasses?: number;
};
export type ResolvedAirShowScene = {
  kind?: "airToAir" | "capClash";
  hexKey: string;
  interceptors: ReadonlyArray<ResolvedAirShowFlightSpec>;
  escorts: ReadonlyArray<ResolvedAirShowFlightSpec>;
  bomber: ResolvedAirShowFlightSpec | null;
  escortExchanges?: ReadonlyArray<ResolvedAirShowExchange>;
  bomberPassExchanges?: ReadonlyArray<ResolvedAirShowExchange>;
  fighterIngressDurationMs?: number;
  escortClashDurationMs?: number;
  bomberIngressDurationMs?: number;
  bomberPassDurationMs?: number;
  strikeRunDurationMs?: number;
  egressDurationMs?: number;
  bomberArrivalDelayMs?: number;
  bomberTargetHexKey?: string | null;
  bombReleaseProgress?: number;
  flakBursts?: ReadonlyArray<{
    progress: number;
    count: number;
    scale?: number;
    alongOffsetPx?: number;
    lateralOffsetPx?: number;
    alongSpreadPx?: number;
    lateralSpreadPx?: number;
    puffCount?: number;
    smokePuffCount?: number;
    smokeScale?: number;
  }>;
};
type AirShowPoint = { cx: number; cy: number };
type AirShowCorridor = {
  center: AirShowPoint;
  axis: { x: number; y: number };
  normal: { x: number; y: number };
  entry: AirShowPoint;
  merge: AirShowPoint;
  strike: AirShowPoint;
  exit: AirShowPoint;
};
type AirShowRuntimeActor = {
  id: string;
  flightId: string;
  role: "interceptor" | "escort" | "bomber";
  image: SVGImageElement;
  size: number;
  formationIndex: number;
  headingDegrees: number;
  position: AirShowPoint;
  biasX: number;
  biasY: number;
  active: boolean;
};
type AirShowRuntimeFlightInternal = {
  spec: ResolvedAirShowFlightSpec;
  actors: AirShowRuntimeActor[];
  currentStrength: number;
  anchor: AirShowPoint;
};
type AirShowPhaseAssignment = {
  actor: AirShowRuntimeActor;
  points: AirShowPoint[];
  headingBlend?: number;
  multiFlightOffsetPx?: number;
  progressOffset?: number;
};
type AirShowPhaseOptions = {
  easing?: "easeInOut" | "linear";
};
type AirShowTracerBurst = {
  progress: number;
  source: AirShowRuntimeActor;
  target: AirShowRuntimeActor | AirShowPoint;
  emitter: "nose" | "center";
  color?: string;
  width?: number;
  lifetimeMs?: number;
  burstCount?: number;
  spreadPx?: number;
  streakLengthPx?: number;
  visibleLengthPx?: number;
  fanHalfAngleDeg?: number;
};

export interface AirShowInspectionPoint {
  readonly cx: number;
  readonly cy: number;
}

export interface AirShowInspectionFlightActor {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: "interceptor" | "escort" | "bomber";
  readonly active: boolean;
  readonly headingDegrees: number;
  readonly position: AirShowInspectionPoint;
}

export interface AirShowInspectionFlight {
  readonly id: string;
  readonly role: "interceptor" | "escort" | "bomber";
  readonly combatRole?: "cap" | "escort" | "strike";
  readonly faction?: SpriteRenderFaction;
  readonly scenarioType: string;
  readonly originHexKey?: string | null;
  readonly strengthBefore: number;
  readonly strengthAfterEscortPhase?: number;
  readonly finalStrength?: number;
  readonly actors: ReadonlyArray<AirShowInspectionFlightActor>;
}

export interface AirShowInspectionSampledPosition {
  readonly timeMs: number;
  readonly progress: number;
  readonly cx: number;
  readonly cy: number;
  readonly headingDegrees: number;
}

export interface AirShowInspectionAssignment {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: "interceptor" | "escort" | "bomber";
  readonly points: ReadonlyArray<AirShowInspectionPoint>;
  readonly sampledPositions: ReadonlyArray<AirShowInspectionSampledPosition>;
}

export interface AirShowInspectionTracer {
  readonly progress: number;
  readonly sourceActorId: string;
  readonly targetActorId?: string;
  readonly targetPoint?: AirShowInspectionPoint;
  readonly emitter: "nose" | "center";
  readonly emitterPoint: AirShowInspectionPoint;
  readonly sourceHeadingDegrees: number;
  readonly width?: number;
  readonly lifetimeMs?: number;
  readonly streakLengthPx: number;
  readonly visibleLengthPx: number;
  readonly fanHalfAngleDeg: number;
  readonly centerlineEndPoint: AirShowInspectionPoint;
  readonly leftFanEndPoint?: AirShowInspectionPoint;
  readonly rightFanEndPoint?: AirShowInspectionPoint;
}

export interface AirShowInspectionFlakBurst {
  readonly progress: number;
  readonly burstCenter: AirShowInspectionPoint;
  readonly flashCount: number;
  readonly puffCount: number;
  readonly smokePuffCount: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly points: ReadonlyArray<AirShowInspectionPoint>;
}

export interface AirShowInspectionPhase {
  readonly label: string;
  readonly durationMs: number;
  readonly assignments: ReadonlyArray<AirShowInspectionAssignment>;
  readonly tracers: ReadonlyArray<AirShowInspectionTracer>;
  readonly flakBursts: ReadonlyArray<AirShowInspectionFlakBurst>;
}

export interface AirShowInspectionReport {
  readonly hexKey: string;
  readonly center: AirShowInspectionPoint;
  readonly corridor: {
    readonly center: AirShowInspectionPoint;
    readonly entry: AirShowInspectionPoint;
    readonly merge: AirShowInspectionPoint;
    readonly strike: AirShowInspectionPoint;
    readonly exit: AirShowInspectionPoint;
  };
  readonly bomberTarget?: AirShowInspectionPoint | null;
  readonly flights: ReadonlyArray<AirShowInspectionFlight>;
  readonly phases: ReadonlyArray<AirShowInspectionPhase>;
}

/**
 * Timeline-based linked strike package contracts.
 * Replaces split animation ownership between BattleScreen and HexMapRenderer.
 */

/**
 * Runtime flight descriptor for air show sprites. Unified lifecycle - created at package start,
 * removed at package end. No despawn/respawn during timeline execution.
 */
export interface AirShowRuntimeFlight {
  readonly id: string;              // Unique identifier for tracking throughout timeline
  readonly unitKey: string;         // Game engine unit key
  readonly unitType: string;        // Sprite type for rendering
  readonly faction: "allied" | "axis";
  readonly role: "bomber" | "escort" | "interceptor";
  readonly strength: number;        // Formation size
  readonly laneOffsetPx: number;    // Horizontal spacing for formations
  readonly originHexKey?: string;   // For egress path calculation
}

export type LinkedStrikePackageBeatType = "ingress" | "combat" | "bombing" | "egress";

export interface LinkedStrikePackageBeatAction {
  readonly tracers?: ReadonlyArray<{
    readonly sourceId: string;
    readonly targetId: string;
    readonly progressTrigger: number;
    readonly emitter: "nose" | "center";
  }>;
  readonly bombDrop?: {
    readonly bomberIds: readonly string[];
    readonly targetHexKey: string;
    readonly progressTrigger: number;
  };
  readonly flakBursts?: ReadonlyArray<{
    readonly targetId: string;
    readonly progressTrigger: number;
    readonly intensity: number;
  }>;
  readonly destroyed?: ReadonlyArray<{
    readonly unitId: string;
    readonly progressTrigger: number;
  }>;
}

export interface LinkedStrikePackageBeat {
  readonly startMs: number;        // Absolute time from package start
  readonly durationMs: number;
  readonly type: LinkedStrikePackageBeatType;
  readonly participants: {
    readonly fighters?: ReadonlyArray<AirShowRuntimeFlight>;
    readonly bombers?: ReadonlyArray<AirShowRuntimeFlight>;
  };
  readonly actions: LinkedStrikePackageBeatAction;
}

export interface LinkedStrikePackageScene {
  readonly beats: readonly LinkedStrikePackageBeat[];
  readonly combatVolume: {
    readonly centerX: number;
    readonly centerY: number;
    readonly radiusPx: number;
  };
  readonly bomberCorridor: {
    readonly startX: number;
    readonly startY: number;
    readonly targetX: number;
    readonly targetY: number;
  };
  readonly totalDurationMs: number;
  readonly targetHexKey: string;
}

/**
 * Handle returned when staging a unit move so callers can delay playback until the camera settles.
 * Ensures the ghost sprite is already parked on the origin tile while the destination sprite stays hidden.
 */
export interface MoveAnimationHandle {
  play(durationMs: number): Promise<void>;
  dispose(): void;
}

interface MoveAnimationContext {
  ghost: SVGGElement;
  movingGroup: SVGGElement;
  restoreOpacity: string;
  setGhostProgress: (progress: number) => void;
}

export interface RenderedUnitStackMember {
  readonly unit: ScenarioUnit;
  readonly faction: "Player" | "Bot" | "Ally";
  readonly reconStatus?: ReconStatusKey | boolean;
}

 type AftermathEntry = {
   smokeLevel: 0 | 1 | 2;
   flames: boolean;
   wreck: boolean;
   wreckClass: WreckFxClass;
   wreckScenarioType: string | null;
   fireTurnsRemaining: number;
   group: SVGGElement | null;
 };

/**
 * Main hex map renderer responsible for generating SVG markup.
 * Coordinates terrain rendering, road overlays, and hex element management.
 */
export class HexMapRenderer implements IMapRenderer {
  private static readonly AIRCRAFT_GHOST_ICON_SIZE = 60;
  private static readonly AIRCRAFT_FORMATION_SPACING = 33;
  private static readonly AIRCRAFT_ORBIT_HEADING_BLEND = 0.28;
  // Role-based size multipliers: fighters +50%, bombers +100%
  private static readonly AIRCRAFT_FIGHTER_SIZE_MULTIPLIER = 1.5;
  private static readonly AIRCRAFT_BOMBER_SIZE_MULTIPLIER = 2.0;
  // Role-based spacing multipliers (proportional to size to prevent overlap)
  private static readonly AIRCRAFT_FIGHTER_SPACING_MULTIPLIER = 1.5;
  private static readonly AIRCRAFT_BOMBER_SPACING_MULTIPLIER = 2.0;
  // Collision-aware formation spacing per North Star Spec
  // Minimum center-to-center spacing: 0.8 sprite widths (same-role), 1.0 (different-role)
  private static readonly AIRCRAFT_SAME_ROLE_SPACING_FACTOR = 0.8;
  private static readonly AIRCRAFT_DIFF_ROLE_SPACING_FACTOR = 1.0;
  private static readonly AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION = 6; // aircraft count threshold
  private static readonly AIRCRAFT_MAX_OVERLAP_STACK = 3; // max silhouettes before depth correction
  private static readonly AIRCRAFT_ALTITUDE_LANE_OFFSET_PX = 45; // layered spacing for high density
  private hexElementMap = new Map<string, SVGGElement>();
  private hexPolygonMap = new Map<string, SVGPolygonElement>();
  private hexLabelMap = new Map<string, SVGTextElement>();
  private hexUnitImageMap = new Map<string, SVGGElement>();
  private readonly hexUnitFacingAngleMap = new Map<string, number>();
  private baseCampMarker: SVGImageElement | null = null;
  private baseCampHexKey: string | null = null;
  private initialized = false;

  private readonly terrainRenderer = new TerrainRenderer();
  private readonly roadRenderer = new RoadOverlayRenderer();
  private readonly reconOverlayState = new Map<string, ReconStatusKey>();
  private combatAnimator: ProceduralEffectsAnimator | null = null;
  private readonly soundManager: CombatSoundManager = new CombatSoundManager();
  private readonly recentEffects = new Map<string, number>(); // Dedupe guard: effectKey -> timestamp
  private static effectSpecsLoaded = false;
  private soundCatalogReady: Promise<void> | null = null;
  private wreckFxRenderer: WreckFxRenderer | null = null;

  private hexClickHandler: ((key: string) => void) | null = null;
  private boundDelegatedClickHandler: ((event: MouseEvent) => void) | null = null;
  private selectionChangedHandler: ((key: string | null) => void) | null = null;
  private highlightedHexKey: string | null = null;
  private readonly activeZoneKeys = new Set<string>();
  private readonly moveOptionHighlightKeys = new Set<string>();
  private readonly attackTargetHighlightKeys = new Set<string>();
  private readonly idleUnitHighlightKeys = new Set<string>();
  /** Tracks the unit class occupying each hex so effects can vary by attacker/defender type. */
  private readonly hexUnitClassMap: Map<string, UnitClass> = new Map();
  /** Tracks the unit scenario type occupying each hex so visuals can vary beyond the broad UnitClass. */
  private readonly hexUnitScenarioTypeMap: Map<string, string> = new Map();
  private readonly aftermathByHexKey: Map<string, AftermathEntry> = new Map();
  /** Temporary debug markers for visualizing placements independent of recon/LOS. */
  private readonly debugMarkerMap: Map<string, SVGGElement> = new Map();
  /** Professional objective markers showing hold status with distinct styling */
  private readonly objectiveMarkerMap: Map<string, SVGGElement> = new Map();
  /** Engineer-built terrain overlays such as fortifications and tank traps. */
  private readonly hexModificationOverlayMap: Map<string, SVGGElement> = new Map();
  private readonly hexModificationStateMap: Map<string, HexModification[]> = new Map();
  private queuedTargetMarkerLayer: SVGGElement | null = null;
  private selectionGlow: SVGCircleElement | null = null;

  private svgElement: SVGSVGElement | null = null;
  /** Single transform owner - all pan/zoom should transform ONLY this group, not the SVG */
  private viewportRoot: SVGGElement | null = null;
  private canvasElement: HTMLDivElement | null = null;
  private scenarioData: ScenarioData | null = null;
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;
  /** Dedicated overlay for combat effects so muzzle flashes/explosions render above unit sprites. */
  private combatEffectsLayer: SVGGElement | null = null;
  private combatAnimationOverlayHost: HTMLDivElement | null = null;
  /** HTML overlay that hosts frame-sequence sprite playback outside the SVG compositor. */
  private combatAnimationOverlay: HTMLDivElement | null = null;
  /** Keeps the HTML effect overlay aligned with the live viewportRoot pan/zoom transform. */
  private combatAnimationOverlayObserver: MutationObserver | null = null;
  /** Reusable radial flash element so ordnance impacts pop without washing out the whole battlefield. */
  private flashOverlay: SVGCircleElement | null = null;

  /**
   * Allows callers to register a click handler that receives the hex key.
   */
  onHexClick(handler: (key: string) => void): void {
    this.hexClickHandler = handler;
    this.rebindHexInteractions();
  }

  /**
   * Animates an aircraft along a segmented multi-leg path between two hexes.
   * Uses axial hexLine to generate intermediate waypoints so long flights read clearly.
   */
  async animateAircraftPathByHex(fromKey: string, toKey: string, scenarioType: string, segmentMs = 350): Promise<void> {
    if (fromKey === toKey) {
      return;
    }
    const parseKey = (key: string): { col: number; row: number } | null => {
      const parts = key.split(",").map((s) => Number(s));
      if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
      return { col: parts[0], row: parts[1] };
    };
    const origin = parseKey(fromKey);
    const dest = parseKey(toKey);
    if (!origin || !dest) {
      await this.animateAircraftFlyover(fromKey, toKey, scenarioType, Math.max(200, segmentMs));
      return;
    }
    const a = CoordinateSystem.offsetToAxial(origin.col, origin.row);
    const b = CoordinateSystem.offsetToAxial(dest.col, dest.row);
    const path: Axial[] = hexLine(a, b);
    if (path.length <= 1) {
      await this.animateAircraftFlyover(fromKey, toKey, scenarioType, Math.max(200, segmentMs));
      return;
    }
    const toOffsetKey = (ax: Axial): string => {
      const off = CoordinateSystem.axialToOffset(ax.q, ax.r);
      return CoordinateSystem.makeHexKey(off.col, off.row);
    };
    const keys = path.map(toOffsetKey);
    for (let i = 0; i < keys.length - 1; i += 1) {
      await this.animateAircraftFlyover(keys[i]!, keys[i + 1]!, scenarioType, segmentMs);
    }
  }

  /**
   * Renders a brief target marker overlay at the specified hex key.
   * The marker fades out automatically after a short duration.
   */
  async playTargetMarker(hexKey: string, durationMs = 600): Promise<void> {
    if (!this.svgElement) return;
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) return;
    const center = this.extractHexCenter(cell);
    if (!center) return;
    const layer = this.ensureCombatEffectsLayer();
    if (!layer) return;
    const group = document.createElementNS(SVG_NS, "g");
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(center.cx));
    circle.setAttribute("cy", String(center.cy));
    circle.setAttribute("r", String(Math.max(HEX_WIDTH, HEX_RADIUS) * 0.55));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "#f5c46d");
    circle.setAttribute("stroke-width", "2");
    circle.setAttribute("opacity", "0.9");
    const crossH = document.createElementNS(SVG_NS, "line");
    crossH.setAttribute("x1", String(center.cx - 8));
    crossH.setAttribute("y1", String(center.cy));
    crossH.setAttribute("x2", String(center.cx + 8));
    crossH.setAttribute("y2", String(center.cy));
    crossH.setAttribute("stroke", "#f5c46d");
    crossH.setAttribute("stroke-width", "2");
    const crossV = document.createElementNS(SVG_NS, "line");
    crossV.setAttribute("x1", String(center.cx));
    crossV.setAttribute("y1", String(center.cy - 8));
    crossV.setAttribute("x2", String(center.cx));
    crossV.setAttribute("y2", String(center.cy + 8));
    crossV.setAttribute("stroke", "#f5c46d");
    crossV.setAttribute("stroke-width", "2");
    group.appendChild(circle);
    group.appendChild(crossH);
    group.appendChild(crossV);
    group.style.pointerEvents = "none";
    layer.appendChild(group);
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(100, durationMs)));
    group.remove();
  }

  syncQueuedTargetMarkers(markers: readonly BattleTargetMarker[]): void {
    const layer = this.ensureQueuedTargetMarkerLayer();
    if (!layer) {
      return;
    }

    layer.replaceChildren();
    if (markers.length === 0) {
      return;
    }

    const markersByHex = new Map<string, BattleTargetMarker[]>();
    markers.forEach((marker) => {
      const entries = markersByHex.get(marker.hexKey) ?? [];
      entries.push(marker);
      markersByHex.set(marker.hexKey, entries);
    });

    markersByHex.forEach((entries, hexKey) => {
      const cell = this.hexElementMap.get(hexKey);
      if (!cell) {
        return;
      }
      const center = this.extractHexCenter(cell);
      if (!center) {
        return;
      }
      entries.forEach((marker, index) => {
        const group = this.buildQueuedTargetMarker(marker, center.cx, center.cy, index, entries.length);
        layer.appendChild(group);
      });
    });
  }

  /**
   * Animates a temporary aircraft sprite flying from one hex to another without mutating unit icons.
   * Used for Air Support visuals (arrivals and air-to-air engagements) so sorties can be shown "in action".
   * When strength is provided, renders as a formation with 1-4 sprites based on strength.
   */
  async animateAircraftFlyover(
    fromKey: string,
    toKey: string,
    scenarioType: string,
    durationMs = 2800,
    onProgress?: AircraftAnimationProgressCallback,
    endProgress = 1,
    strength?: number,
    laneOffsetPx = 0,
    faction?: SpriteRenderFaction,
    role: AirShowRole = "interceptor"
  ): Promise<void> {
    if (!this.svgElement) {
      console.warn("[HexMapRenderer] animateAircraftFlyover skipped: no SVG element available", {
        fromKey,
        toKey,
        scenarioType,
        durationMs
      });
      return;
    }
    const fromCell = this.hexElementMap.get(fromKey);
    const toCell = this.hexElementMap.get(toKey);
    if (!fromCell || !toCell) {
      console.warn("[HexMapRenderer] animateAircraftFlyover skipped: missing hex cell(s)", {
        fromKey,
        toKey,
        scenarioType,
        hasFrom: !!fromCell,
        hasTo: !!toCell
      });
      return;
    }

    const startCenter = this.extractHexCenter(fromCell);
    const endCenter = this.extractHexCenter(toCell);
    if (!startCenter || !endCenter) {
      console.warn("[HexMapRenderer] animateAircraftFlyover skipped: missing hex center(s)", {
        fromKey,
        toKey,
        scenarioType,
        hasStartCenter: !!startCenter,
        hasEndCenter: !!endCenter
      });
      return;
    }

    const spriteHref = getSpriteForScenarioType(scenarioType, faction);
    if (!spriteHref) {
      console.error("[HexMapRenderer] animateAircraftFlyover skipped: missing sprite mapping for scenarioType", {
        fromKey,
        toKey,
        scenarioType
      });
      return;
    }

    const iconSize = HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE;
    const ghost = this.createAircraftFormationGhost(spriteHref, iconSize, strength, role);
    const isFormation = ghost instanceof SVGGElement;

    const layer = this.ensureCombatEffectsLayer();
    if (!layer) {
      console.error("[HexMapRenderer] animateAircraftFlyover skipped: missing combat effects layer", {
        fromKey,
        toKey,
        scenarioType
      });
      return;
    }
    layer.appendChild(ghost);

    // For formations (groups), position via transform. For single sprites, use x/y attributes.
    const dx = endCenter.cx - startCenter.cx;
    const dy = endCenter.cy - startCenter.cy;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / distance;
    const ny = dx / distance;
    const startCenterX = startCenter.cx + nx * laneOffsetPx;
    const startCenterY = startCenter.cy + ny * laneOffsetPx;
    const endCenterX = endCenter.cx + nx * laneOffsetPx;
    const endCenterY = endCenter.cy + ny * laneOffsetPx;

    const headingDegrees = this.resolveAircraftHeadingDegrees(endCenterX - startCenterX, endCenterY - startCenterY);
    this.positionAircraftGhost(ghost, isFormation, iconSize, startCenterX, startCenterY, headingDegrees);

    const clampedEndProgress = this.clamp(endProgress, 0.01, 1);
    const effectiveDurationMs = Math.max(1, durationMs * clampedEndProgress);

    if (durationMs <= 0) {
      const finalProgress = clampedEndProgress;
      const finalCenterX = startCenterX + (endCenterX - startCenterX) * finalProgress;
      const finalCenterY = startCenterY + (endCenterY - startCenterY) * finalProgress;

      this.positionAircraftGhost(ghost, isFormation, iconSize, finalCenterX, finalCenterY, headingDegrees);
      onProgress?.(finalProgress, finalCenterX, finalCenterY);
      ghost.remove();
      return;
    }

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step: FrameRequestCallback = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / effectiveDurationMs);
        const eased = this.easeInOut(t);
        const progressedDistance = eased * clampedEndProgress;
        const centerX = startCenterX + (endCenterX - startCenterX) * progressedDistance;
        const centerY = startCenterY + (endCenterY - startCenterY) * progressedDistance;

        this.positionAircraftGhost(ghost, isFormation, iconSize, centerX, centerY, headingDegrees);
        onProgress?.(progressedDistance, centerX, centerY);
        if (t >= 1) {
          resolve();
          return;
        }
        this.scheduleAnimationFrame(step);
      };
      this.scheduleAnimationFrame(step);
    });

    ghost.remove();
  }

  /**
   * Animates an aircraft along a shallow arc between two hexes for more cinematic flyovers.
   * This is used primarily for dedicated air missions (ingress/egress), while engagements
   * can continue to rely on the straight-line helper when desired.
   * When strength is provided, renders as a formation with 1-4 sprites based on strength.
   */
  async animateAircraftArc(
    fromKey: string,
    toKey: string,
    scenarioType: string,
    durationMs = 2800,
    onProgress?: AircraftAnimationProgressCallback,
    endProgress = 1,
    strength?: number,
    laneOffsetPx = 0,
    faction?: SpriteRenderFaction,
    role: AirShowRole = "interceptor"
  ): Promise<void> {
    if (!this.svgElement) {
      console.warn("[HexMapRenderer] animateAircraftArc skipped: no SVG element available", {
        fromKey,
        toKey,
        scenarioType,
        durationMs
      });
      return;
    }
    const fromCell = this.hexElementMap.get(fromKey);
    const toCell = this.hexElementMap.get(toKey);
    if (!fromCell || !toCell) {
      console.warn("[HexMapRenderer] animateAircraftArc skipped: missing hex cell(s)", {
        fromKey,
        toKey,
        scenarioType,
        hasFrom: !!fromCell,
        hasTo: !!toCell
      });
      return;
    }

    const startCenter = this.extractHexCenter(fromCell);
    const endCenter = this.extractHexCenter(toCell);
    if (!startCenter || !endCenter) {
      console.warn("[HexMapRenderer] animateAircraftArc skipped: missing hex center(s)", {
        fromKey,
        toKey,
        scenarioType,
        hasStartCenter: !!startCenter,
        hasEndCenter: !!endCenter
      });
      return;
    }

    const spriteHref = getSpriteForScenarioType(scenarioType, faction);
    if (!spriteHref) {
      console.error("[HexMapRenderer] animateAircraftArc skipped: missing sprite mapping for scenarioType", {
        fromKey,
        toKey,
        scenarioType
      });
      return;
    }

    const iconSize = HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE;
    const ghost = this.createAircraftFormationGhost(spriteHref, iconSize, strength, role);
    const isFormation = ghost instanceof SVGGElement;

    const rawDx = endCenter.cx - startCenter.cx;
    const rawDy = endCenter.cy - startCenter.cy;
    const rawDistance = Math.max(1, Math.hypot(rawDx, rawDy));
    const rawNx = -rawDy / rawDistance;
    const rawNy = rawDx / rawDistance;
    const startCenterX = startCenter.cx + rawNx * laneOffsetPx;
    const startCenterY = startCenter.cy + rawNy * laneOffsetPx;
    const endCenterX = endCenter.cx + rawNx * laneOffsetPx;
    const endCenterY = endCenter.cy + rawNy * laneOffsetPx;

    const dx = endCenterX - startCenterX;
    const dy = endCenterY - startCenterY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    // Perpendicular normal for arc offset; fixed orientation keeps visuals predictable.
    const nx = -dy / distance;
    const ny = dx / distance;
    const arcAmplitude = distance * 0.3;
    const controlCenterX = (startCenterX + endCenterX) / 2 + nx * arcAmplitude;
    const controlCenterY = (startCenterY + endCenterY) / 2 + ny * arcAmplitude;

    const layer = this.ensureCombatEffectsLayer();
    if (!layer) {
      console.error("[HexMapRenderer] animateAircraftArc skipped: missing combat effects layer", {
        fromKey,
        toKey,
        scenarioType
      });
      return;
    }
    layer.appendChild(ghost);

    let lastHeadingDegrees = this.resolveAircraftHeadingDegrees(controlCenterX - startCenterX, controlCenterY - startCenterY);
    this.positionAircraftGhost(ghost, isFormation, iconSize, startCenterX, startCenterY, lastHeadingDegrees);

    const clampedEndProgress = this.clamp(endProgress, 0.01, 1);
    const effectiveDurationMs = Math.max(1, durationMs * clampedEndProgress);

    if (durationMs <= 0) {
      const eased = clampedEndProgress;
      const oneMinusT = 1 - eased;
      const bcx = oneMinusT * oneMinusT * startCenterX + 2 * oneMinusT * eased * controlCenterX + eased * eased * endCenterX;
      const bcy = oneMinusT * oneMinusT * startCenterY + 2 * oneMinusT * eased * controlCenterY + eased * eased * endCenterY;

      const tangentX = 2 * (1 - eased) * (controlCenterX - startCenterX) + 2 * eased * (endCenterX - controlCenterX);
      const tangentY = 2 * (1 - eased) * (controlCenterY - startCenterY) + 2 * eased * (endCenterY - controlCenterY);
      lastHeadingDegrees = this.resolveAircraftHeadingDegrees(tangentX, tangentY, lastHeadingDegrees);
      this.positionAircraftGhost(ghost, isFormation, iconSize, bcx, bcy, lastHeadingDegrees);
      onProgress?.(clampedEndProgress, bcx, bcy);
      ghost.remove();
      return;
    }

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step: FrameRequestCallback = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / effectiveDurationMs);
        const eased = this.easeInOut(t);
        const progressedDistance = eased * clampedEndProgress;
        const oneMinusT = 1 - progressedDistance;
        // Quadratic Bézier interpolation between start, control, and end points (using center coordinates)
        const bcx = oneMinusT * oneMinusT * startCenterX + 2 * oneMinusT * progressedDistance * controlCenterX + progressedDistance * progressedDistance * endCenterX;
        const bcy = oneMinusT * oneMinusT * startCenterY + 2 * oneMinusT * progressedDistance * controlCenterY + progressedDistance * progressedDistance * endCenterY;

        const tangentX =
          2 * (1 - progressedDistance) * (controlCenterX - startCenterX) +
          2 * progressedDistance * (endCenterX - controlCenterX);
        const tangentY =
          2 * (1 - progressedDistance) * (controlCenterY - startCenterY) +
          2 * progressedDistance * (endCenterY - controlCenterY);
        lastHeadingDegrees = this.resolveAircraftHeadingDegrees(tangentX, tangentY, lastHeadingDegrees);
        this.positionAircraftGhost(ghost, isFormation, iconSize, bcx, bcy, lastHeadingDegrees);
        onProgress?.(progressedDistance, bcx, bcy);
        if (t >= 1) {
          resolve();
          return;
        }
        this.scheduleAnimationFrame(step);
      };
      this.scheduleAnimationFrame(step);
    });

    ghost.remove();
  }

  /**
   * Orbits an aircraft around a focal hex so air-to-air engagements can show circling fighters
   * instead of only straight-line ingress legs.
   */
  async animateAirDogfightShowAt(
    hexKey: string,
    flights: ReadonlyArray<AirShowFlightSpec>,
    durationMs = 3200
  ): Promise<void> {
    if (!this.svgElement) {
      return;
    }

    const cell = this.hexElementMap.get(hexKey);
    const center = cell ? this.extractHexCenter(cell) : null;
    const layer = this.ensureCombatEffectsLayer();
    if (!center || !layer) {
      return;
    }

    const combatFlights = flights.filter(
      (flight): flight is AirShowFlightSpec & { team: "interceptor" | "escort" } =>
        flight.team === "interceptor" || flight.team === "escort"
    );
    if (combatFlights.length === 0) {
      return;
    }

    const spriteStates: Array<{
      team: "interceptor" | "escort";
      image: SVGImageElement;
      size: number;
      path: Array<{ cx: number; cy: number }>;
      lastHeadingDegrees: number;
      position: { cx: number; cy: number };
    }> = [];

    const buildDogfightPath = (
      team: "interceptor" | "escort",
      flightIndex: number,
      spriteIndex: number,
      laneOffsetPx: number,
      biasX: number,
      biasY: number
    ): Array<{ cx: number; cy: number }> => {
      const teamSign = team === "interceptor" ? -1 : 1;
      const lateral = 68 + flightIndex * 10 + Math.min(18, Math.abs(laneOffsetPx) * 0.4) + Math.abs(biasX) * 0.18;
      const vertical = 26 + (spriteIndex % 3) * 8 + Math.abs(biasY) * 0.12;
      const centerSkew = biasX * 0.2;
      const altitudeSkew = biasY * 0.3;
      return [
        { cx: center.cx + teamSign * lateral, cy: center.cy + altitudeSkew },
        { cx: center.cx + teamSign * 24 + centerSkew, cy: center.cy - vertical + altitudeSkew * 0.35 },
        { cx: center.cx - teamSign * 6 + centerSkew, cy: center.cy - 12 + altitudeSkew * 0.2 },
        { cx: center.cx - teamSign * (lateral * 0.72), cy: center.cy + vertical * 0.28 + altitudeSkew * 0.4 },
        { cx: center.cx - teamSign * 16 + centerSkew, cy: center.cy + vertical + altitudeSkew * 0.25 },
        { cx: center.cx + teamSign * (lateral * 0.56), cy: center.cy - vertical * 0.2 + altitudeSkew * 0.3 }
      ];
    };

    combatFlights.forEach((flight, flightIndex) => {
      const spriteHref = getSpriteForScenarioType(flight.scenarioType, flight.faction);
      if (!spriteHref) {
        return;
      }
      const ghosts = this.createAircraftSpriteGhosts(
        spriteHref,
        HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE,
        flight.strength,
        flight.team
      );
      ghosts.forEach((ghostSpec, spriteIndex) => {
        layer.appendChild(ghostSpec.image);
        const path = buildDogfightPath(
          flight.team,
          flightIndex,
          spriteIndex,
          flight.laneOffsetPx ?? 0,
          ghostSpec.biasX,
          ghostSpec.biasY
        );
        const initialSample = this.sampleAircraftWaypointPath(path, 0);
        const heading = this.resolveAircraftHeadingDegrees(initialSample.derivative.dx, initialSample.derivative.dy);
        this.positionAircraftImageGhost(ghostSpec.image, ghostSpec.size, initialSample.point.cx, initialSample.point.cy, heading);
        spriteStates.push({
          team: flight.team,
          image: ghostSpec.image,
          size: ghostSpec.size,
          path,
          lastHeadingDegrees: heading,
          position: initialSample.point
        });
      });
    });

    if (spriteStates.length === 0) {
      return;
    }

    const tracerWindows = [0.14, 0.28, 0.42, 0.58, 0.74, 0.88];
    let nextTracerWindow = 0;

    try {
      await new Promise<void>((resolve) => {
        const startTime = performance.now();
        const step: FrameRequestCallback = (now) => {
          const elapsed = now - startTime;
          const rawProgress = Math.min(1, elapsed / Math.max(1, durationMs));
          const easedProgress = this.easeInOut(rawProgress);
          const interceptorPositions: Array<{ cx: number; cy: number }> = [];
          const escortPositions: Array<{ cx: number; cy: number }> = [];

          spriteStates.forEach((sprite, spriteIndex) => {
            const spriteProgress = this.clamp(easedProgress + spriteIndex * 0.012, 0, 1);
            const sample = this.sampleAircraftWaypointPath(sprite.path, spriteProgress);
            sprite.lastHeadingDegrees = this.interpolateAircraftHeadingDegrees(
              sprite.lastHeadingDegrees,
              this.resolveAircraftHeadingDegrees(sample.derivative.dx, sample.derivative.dy, sprite.lastHeadingDegrees),
              0.34
            );
            sprite.position = sample.point;
            this.positionAircraftImageGhost(
              sprite.image,
              sprite.size,
              sample.point.cx,
              sample.point.cy,
              sprite.lastHeadingDegrees
            );
            if (sprite.team === "interceptor") {
              interceptorPositions.push(sample.point);
            } else {
              escortPositions.push(sample.point);
            }
          });

          while (
            nextTracerWindow < tracerWindows.length &&
            easedProgress >= tracerWindows[nextTracerWindow]! &&
            interceptorPositions.length > 0 &&
            escortPositions.length > 0
          ) {
            const tracerIndex = nextTracerWindow;
            const interceptorPoint = interceptorPositions[tracerIndex % interceptorPositions.length]!;
            const escortPoint = escortPositions[(tracerIndex * 2) % escortPositions.length]!;
            this.playAirTracerExchange(interceptorPoint, escortPoint);
            this.playAirTracerExchange(escortPoint, interceptorPoint, { reverse: true, color: "#fff1c8", width: 1.05 });
            nextTracerWindow += 1;
          }

          if (rawProgress >= 1) {
            resolve();
            return;
          }
          this.scheduleAnimationFrame(step);
        };
        this.scheduleAnimationFrame(step);
      });
    } finally {
      spriteStates.forEach((sprite) => sprite.image.remove());
    }
  }

  async animateBomberInterceptionShowAt(
    hexKey: string,
    bomber: AirShowFlightSpec | null,
    interceptors: ReadonlyArray<AirShowFlightSpec>,
    durationMs = 3600
  ): Promise<void> {
    if (!this.svgElement || !bomber || interceptors.length === 0) {
      return;
    }

    const cell = this.hexElementMap.get(hexKey);
    const center = cell ? this.extractHexCenter(cell) : null;
    const layer = this.ensureCombatEffectsLayer();
    if (!center || !layer) {
      return;
    }

    const bomberHref = getSpriteForScenarioType(bomber.scenarioType, bomber.faction);
    if (!bomberHref) {
      return;
    }

    const bomberSprites = this.createAircraftSpriteGhosts(
      bomberHref,
      HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE,
      bomber.strength,
      "bomber"
    ).map((sprite, index) => {
      layer.appendChild(sprite.image);
      const entry = {
        image: sprite.image,
        size: sprite.size,
        path: [
          { cx: center.cx - 76 + sprite.biasX * 0.18, cy: center.cy + 10 + sprite.biasY * 0.2 },
          { cx: center.cx - 22 + sprite.biasX * 0.12, cy: center.cy - 6 + sprite.biasY * 0.15 },
          { cx: center.cx + 18 + sprite.biasX * 0.08, cy: center.cy + 3 + sprite.biasY * 0.12 },
          { cx: center.cx + 72 + sprite.biasX * 0.16, cy: center.cy - 10 + sprite.biasY * 0.14 }
        ],
        lastHeadingDegrees: 0,
        position: { cx: center.cx, cy: center.cy },
        index
      };
      const sample = this.sampleAircraftWaypointPath(entry.path, 0);
      entry.lastHeadingDegrees = this.resolveAircraftHeadingDegrees(sample.derivative.dx, sample.derivative.dy);
      entry.position = sample.point;
      this.positionAircraftImageGhost(entry.image, entry.size, sample.point.cx, sample.point.cy, entry.lastHeadingDegrees);
      return entry;
    });

    const interceptorSprites: Array<{
      image: SVGImageElement;
      size: number;
      path: Array<{ cx: number; cy: number }>;
      lastHeadingDegrees: number;
      position: { cx: number; cy: number };
    }> = [];

    interceptors.forEach((flight, flightIndex) => {
      const spriteHref = getSpriteForScenarioType(flight.scenarioType, flight.faction);
      if (!spriteHref) {
        return;
      }
      const ghosts = this.createAircraftSpriteGhosts(
        spriteHref,
        HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE,
        flight.strength,
        flight.team
      );
      ghosts.forEach((ghostSpec, spriteIndex) => {
        layer.appendChild(ghostSpec.image);
        const flankSign = (flightIndex + spriteIndex) % 2 === 0 ? -1 : 1;
        const entry = {
          image: ghostSpec.image,
          size: ghostSpec.size,
          path: [
            { cx: center.cx - 86 + ghostSpec.biasX * 0.18, cy: center.cy + flankSign * (30 + ghostSpec.biasY * 0.15) },
            { cx: center.cx - 34 + ghostSpec.biasX * 0.1, cy: center.cy + flankSign * (18 + ghostSpec.biasY * 0.12) },
            { cx: center.cx + 6 + ghostSpec.biasX * 0.06, cy: center.cy + flankSign * 3 + ghostSpec.biasY * 0.08 },
            { cx: center.cx + 54 + ghostSpec.biasX * 0.12, cy: center.cy - flankSign * (24 + ghostSpec.biasY * 0.1) },
            { cx: center.cx + 30 + ghostSpec.biasX * 0.08, cy: center.cy - flankSign * (34 + ghostSpec.biasY * 0.12) },
            { cx: center.cx - 4 + ghostSpec.biasX * 0.05, cy: center.cy - flankSign * (8 + ghostSpec.biasY * 0.08) },
            { cx: center.cx - 38 + ghostSpec.biasX * 0.1, cy: center.cy + flankSign * (18 + ghostSpec.biasY * 0.1) },
            { cx: center.cx - 74 + ghostSpec.biasX * 0.14, cy: center.cy + flankSign * (34 + ghostSpec.biasY * 0.12) }
          ],
          lastHeadingDegrees: 0,
          position: { cx: center.cx, cy: center.cy }
        };
        const sample = this.sampleAircraftWaypointPath(entry.path, 0);
        entry.lastHeadingDegrees = this.resolveAircraftHeadingDegrees(sample.derivative.dx, sample.derivative.dy);
        entry.position = sample.point;
        this.positionAircraftImageGhost(entry.image, entry.size, sample.point.cx, sample.point.cy, entry.lastHeadingDegrees);
        interceptorSprites.push(entry);
      });
    });

    if (interceptorSprites.length === 0) {
      bomberSprites.forEach((sprite) => sprite.image.remove());
      return;
    }

    const tracerWindows = [0.2, 0.3, 0.4, 0.62, 0.72, 0.82];
    let nextTracerWindow = 0;

    try {
      await new Promise<void>((resolve) => {
        const startTime = performance.now();
        const step: FrameRequestCallback = (now) => {
          const elapsed = now - startTime;
          const rawProgress = Math.min(1, elapsed / Math.max(1, durationMs));
          const easedProgress = this.easeInOut(rawProgress);

          bomberSprites.forEach((sprite, index) => {
            const sample = this.sampleAircraftWaypointPath(sprite.path, this.clamp(easedProgress + index * 0.01, 0, 1));
            sprite.lastHeadingDegrees = this.interpolateAircraftHeadingDegrees(
              sprite.lastHeadingDegrees,
              this.resolveAircraftHeadingDegrees(sample.derivative.dx, sample.derivative.dy, sprite.lastHeadingDegrees),
              0.22
            );
            sprite.position = sample.point;
            this.positionAircraftImageGhost(sprite.image, sprite.size, sample.point.cx, sample.point.cy, sprite.lastHeadingDegrees);
          });

          interceptorSprites.forEach((sprite, index) => {
            const sample = this.sampleAircraftWaypointPath(sprite.path, this.clamp(easedProgress + index * 0.008, 0, 1));
            sprite.lastHeadingDegrees = this.interpolateAircraftHeadingDegrees(
              sprite.lastHeadingDegrees,
              this.resolveAircraftHeadingDegrees(sample.derivative.dx, sample.derivative.dy, sprite.lastHeadingDegrees),
              0.38
            );
            sprite.position = sample.point;
            this.positionAircraftImageGhost(sprite.image, sprite.size, sample.point.cx, sample.point.cy, sprite.lastHeadingDegrees);
          });

          while (
            nextTracerWindow < tracerWindows.length &&
            easedProgress >= tracerWindows[nextTracerWindow]! &&
            bomberSprites.length > 0 &&
            interceptorSprites.length > 0
          ) {
            const tracerIndex = nextTracerWindow;
            const interceptorPoint = interceptorSprites[tracerIndex % interceptorSprites.length]!.position;
            const bomberPoint = bomberSprites[(tracerIndex * 2) % bomberSprites.length]!.position;
            this.playAirTracerExchange(interceptorPoint, bomberPoint, { lifetimeMs: 280 });
            this.playAirTracerExchange(bomberPoint, interceptorPoint, { reverse: true, color: "#fff1c8", width: 1.05, lifetimeMs: 260 });
            nextTracerWindow += 1;
          }

          if (rawProgress >= 1) {
            resolve();
            return;
          }
          this.scheduleAnimationFrame(step);
        };
        this.scheduleAnimationFrame(step);
      });
    } finally {
      bomberSprites.forEach((sprite) => sprite.image.remove());
      interceptorSprites.forEach((sprite) => sprite.image.remove());
    }
  }

  inspectResolvedAirCombatShow(scene: ResolvedAirShowScene): AirShowInspectionReport | null {
    if (!this.svgElement) {
      return null;
    }

    const layer = this.ensureCombatEffectsLayer();
    const center = this.resolveHexCenterByKey(scene.hexKey);
    if (!layer || !center) {
      return null;
    }

    const interceptorFallbackOrigin = { cx: center.cx - 248, cy: center.cy + 126 };
    const escortFallbackOrigin = { cx: center.cx + 248, cy: center.cy - 126 };
    const bomberFallbackOrigin = { cx: center.cx - 286, cy: center.cy + 148 };

    const defaultHeadingFor = (origin: AirShowPoint): number =>
      this.resolveAircraftHeadingDegrees(center.cx - origin.cx, center.cy - origin.cy);

    const interceptorFlights = scene.interceptors
      .map((spec) => this.buildAirShowRuntimeFlight(layer, spec, interceptorFallbackOrigin, defaultHeadingFor(interceptorFallbackOrigin)))
      .filter((flight): flight is AirShowRuntimeFlightInternal => !!flight);
    const escortFlights = scene.escorts
      .map((spec) => this.buildAirShowRuntimeFlight(layer, spec, escortFallbackOrigin, defaultHeadingFor(escortFallbackOrigin)))
      .filter((flight): flight is AirShowRuntimeFlightInternal => !!flight);
    const bomberFlight =
      scene.bomber
        ? this.buildAirShowRuntimeFlight(layer, scene.bomber, bomberFallbackOrigin, defaultHeadingFor(bomberFallbackOrigin))
        : null;

    const allFlights = [...interceptorFlights, ...escortFlights, ...(bomberFlight ? [bomberFlight] : [])];
    if (allFlights.length === 0) {
      return null;
    }

    const flightMap = new Map(allFlights.map((flight) => [flight.spec.id, flight] as const));
    const sceneSeed = this.seedFromHexKey(
      `${scene.hexKey}:airshow:${scene.interceptors.length}:${scene.escorts.length}:${scene.bomber?.id ?? "none"}`
    );
    const stageRandom = (label: string): (() => number) =>
      this.seededRandom(this.seedFromHexKey(`${sceneSeed}:${label}`));
    const bomberTargetCenter = scene.bomberTargetHexKey ? this.resolveHexCenterByKey(scene.bomberTargetHexKey) : null;
    const corridor = this.resolveAirShowCorridor(
      center,
      bomberFlight ? this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor : null,
      bomberTargetCenter
    );
    const corridorPoint = (alongPx: number, lateralPx = 0): AirShowPoint =>
      this.projectAirShowCorridorPoint(corridor, alongPx, lateralPx);
    const updateFlightAnchors = (flights: ReadonlyArray<AirShowRuntimeFlightInternal>): void => {
      flights.forEach((flight) => {
        flight.anchor = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
      });
    };
    const activeFlights = (flights: ReadonlyArray<AirShowRuntimeFlightInternal>): AirShowRuntimeFlightInternal[] =>
      flights.filter((flight) => flight.actors.some((actor) => actor.active));
    const buildBandAssignments = (
      flights: ReadonlyArray<AirShowRuntimeFlightInternal>,
      label: string,
      options: {
        alongPx: number;
        lateralPx: number;
        alongStepPx?: number;
        lateralStepPx?: number;
        jitterAlongPx?: number;
        jitterLateralPx?: number;
        arcPx?: number;
        driftPx?: number;
        headingBlend?: number;
      }
    ): AirShowPhaseAssignment[] =>
      flights.flatMap((flight, index) => {
        const rand = stageRandom(`band:${label}:${flight.spec.id}:${index}`);
        const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const lane = flights.length <= 1 ? 0 : index - (flights.length - 1) / 2;
        const holdTarget = corridorPoint(
          options.alongPx +
            lane * (options.alongStepPx ?? 34) +
            (rand() - 0.5) * (options.jitterAlongPx ?? 28),
          options.lateralPx +
            lane * (options.lateralStepPx ?? 48) +
            (rand() - 0.5) * (options.jitterLateralPx ?? 24)
        );
        return this.buildAirShowFlightAssignments(
          flight,
          this.buildAirShowCurvedPath(
            current,
            holdTarget,
            (lane >= 0 ? 1 : -1) * (options.arcPx ?? 76),
            (rand() - 0.5) * (options.driftPx ?? 34),
            this.resolveAirShowFlightHeadingDegrees(flight)
          ),
          options.headingBlend ?? 0.26
        );
      });

    const phases: AirShowInspectionPhase[] = [];
    const recordPhase = (
      label: string,
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      durationMs: number,
      tracerBursts: ReadonlyArray<AirShowTracerBurst> = [],
      flakBursts: ReadonlyArray<NonNullable<ResolvedAirShowScene["flakBursts"]>[number]> = []
    ): void => {
      const assignmentsByActorId = this.buildAirShowAssignmentLookup(assignments);
      phases.push({
        label,
        durationMs,
        assignments: assignments.map((assignment) => {
          const sampledPositions: AirShowInspectionSampledPosition[] = [];
          const sampleCount = Math.max(4, Math.ceil(durationMs / 250));
          for (let i = 0; i <= sampleCount; i += 1) {
            const progress = i / sampleCount;
            const timeMs = Math.round(progress * durationMs);
            const sample = this.sampleAirShowAssignmentAtProgress(assignment, progress);
            sampledPositions.push({
              timeMs,
              progress,
              cx: Math.round(sample.position.cx * 10) / 10,
              cy: Math.round(sample.position.cy * 10) / 10,
              headingDegrees: Math.round(sample.headingDegrees * 10) / 10
            });
          }
          return {
            actorId: assignment.actor.id,
            flightId: assignment.actor.flightId,
            role: assignment.actor.role,
            points: assignment.points.map((point) => ({ cx: point.cx, cy: point.cy })),
            sampledPositions
          };
        }),
        tracers: tracerBursts.flatMap<AirShowInspectionPhase["tracers"][number]>((burst) => {
          const sourceAssignment = assignmentsByActorId.get(burst.source.id);
          const sampledSource = sourceAssignment
            ? this.sampleAirShowAssignmentAtProgress(sourceAssignment, burst.progress)
            : {
                position: burst.source.position,
                headingDegrees: burst.source.headingDegrees,
                size: burst.source.size
              };
          const targetAssignment =
            "image" in burst.target
              ? assignmentsByActorId.get((burst.target as AirShowRuntimeActor).id)
              : undefined;
          const sampledTargetPoint =
            "image" in burst.target
              ? (targetAssignment
                  ? this.sampleAirShowAssignmentAtProgress(targetAssignment, burst.progress).position
                  : (burst.target as AirShowRuntimeActor).position)
              : (burst.target as AirShowPoint);
          if (
            sampledTargetPoint
            && !this.shouldRenderAirShowTracerBurst(sampledSource, sampledTargetPoint, burst)
          ) {
            return [];
          }
          const geometry = this.resolveAirShowTracerBurstGeometry(sampledSource, burst);
          return [{
            progress: burst.progress,
            sourceActorId: burst.source.id,
            targetActorId: "image" in burst.target ? (burst.target as AirShowRuntimeActor).id : undefined,
            targetPoint: sampledTargetPoint ? { cx: sampledTargetPoint.cx, cy: sampledTargetPoint.cy } : undefined,
            emitter: burst.emitter,
            emitterPoint: { cx: geometry.emitterPoint.cx, cy: geometry.emitterPoint.cy },
            sourceHeadingDegrees: geometry.sourceHeadingDegrees,
            width: burst.width,
            lifetimeMs: burst.lifetimeMs,
            streakLengthPx: geometry.streakLengthPx,
            visibleLengthPx: geometry.visibleLengthPx,
            fanHalfAngleDeg: geometry.fanHalfAngleDeg,
            centerlineEndPoint: {
              cx: geometry.centerlineEndPoint.cx,
              cy: geometry.centerlineEndPoint.cy
            },
            leftFanEndPoint: geometry.leftFanEndPoint
              ? { cx: geometry.leftFanEndPoint.cx, cy: geometry.leftFanEndPoint.cy }
              : undefined,
            rightFanEndPoint: geometry.rightFanEndPoint
              ? { cx: geometry.rightFanEndPoint.cx, cy: geometry.rightFanEndPoint.cy }
              : undefined
          }];
        }),
        flakBursts: flakBursts.map((burst) => {
          const wave = this.resolveAirShowFlakBurstWave(corridor, bomberTargetCenter ?? corridor.strike, burst);
          const xs = wave.points.map((point) => point.cx);
          const ys = wave.points.map((point) => point.cy);
          return {
            progress: burst.progress,
            burstCenter: { cx: wave.center.cx, cy: wave.center.cy },
            flashCount: wave.flashCount,
            puffCount: wave.puffCount,
            smokePuffCount: wave.smokePuffCount,
            widthPx: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
            heightPx: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0,
            points: wave.points.map((point) => ({ cx: point.cx, cy: point.cy }))
          };
        })
      });
      this.applyInspectionAirShowAssignments(assignments);
    };

    try {
      const ingressAssignments: AirShowPhaseAssignment[] = [
        ...buildBandAssignments(
          interceptorFlights,
          "ingress:interceptors",
          this.resolveAirShowIngressBandPlan(scene.kind, "interceptor")
        ),
        ...buildBandAssignments(
          escortFlights,
          "ingress:escorts",
          this.resolveAirShowIngressBandPlan(scene.kind, "escort")
        )
      ];
      if (ingressAssignments.length > 0) {
        recordPhase("fighter-ingress", ingressAssignments, Math.max(1250, scene.fighterIngressDurationMs ?? 1750));
        updateFlightAnchors([...interceptorFlights, ...escortFlights]);
      }

      const escortExchanges = scene.escortExchanges ?? [];
      if (escortExchanges.length > 0) {
        type EscortPairData = {
          exchange: (typeof escortExchanges)[number];
          interceptorFlight: AirShowRuntimeFlightInternal;
          escortFlight: AirShowRuntimeFlightInternal;
          pairIndex: number;
          focusPoint: AirShowPoint;
        };

        const rawEscortPairs = escortExchanges
          .map((exchange) => {
            const interceptorFlight = flightMap.get(exchange.defenderUnitKey);
            const escortFlight = flightMap.get(exchange.attackerUnitKey);
            if (!interceptorFlight || !escortFlight) {
              return null;
            }
            return { exchange, interceptorFlight, escortFlight };
          })
          .filter((entry): entry is {
            exchange: (typeof escortExchanges)[number];
            interceptorFlight: AirShowRuntimeFlightInternal;
            escortFlight: AirShowRuntimeFlightInternal;
          } => !!entry);
        const uniqueEscortPairs = Array.from(
          new Map(
            rawEscortPairs.map((entry) => [
              `${entry.escortFlight.spec.id}:${entry.interceptorFlight.spec.id}`,
              entry
            ] as const)
          ).values()
        ).map((entry, pairIndex, allPairs) => {
          const rand = stageRandom(`escort:pair:${pairIndex}:${entry.escortFlight.spec.id}:${entry.interceptorFlight.spec.id}`);
          return {
            ...entry,
            pairIndex,
            focusPoint: corridorPoint(
              -4 + (rand() - 0.5) * 10,
              (pairIndex - (allPairs.length - 1) / 2) * 74 + (rand() - 0.5) * 18
            )
          } satisfies EscortPairData;
        });

        const pairFocusesByFlightId = new Map<string, AirShowPoint[]>();
        uniqueEscortPairs.forEach((pair) => {
          const interceptorFocuses = pairFocusesByFlightId.get(pair.interceptorFlight.spec.id) ?? [];
          interceptorFocuses.push(pair.focusPoint);
          pairFocusesByFlightId.set(pair.interceptorFlight.spec.id, interceptorFocuses);

          const escortFocuses = pairFocusesByFlightId.get(pair.escortFlight.spec.id) ?? [];
          escortFocuses.push(pair.focusPoint);
          pairFocusesByFlightId.set(pair.escortFlight.spec.id, escortFocuses);
        });

        if (uniqueEscortPairs.length > 0) {
          const escortBeatCount = 2;
          for (let beat = 0; beat < escortBeatCount; beat += 1) {
            const escortBeatDurationMs =
              beat === 0
                ? Math.max(760, Math.round((scene.escortClashDurationMs ?? 1980) * 0.38))
                : Math.max(1040, Math.round((scene.escortClashDurationMs ?? 1980) * 0.62));
            const phaseAssignments: AirShowPhaseAssignment[] = [];
            const tracerBursts: AirShowTracerBurst[] = [];
            const activeInterceptorFlights = activeFlights(interceptorFlights);
            const activeEscortFlights = activeFlights(escortFlights);

            activeInterceptorFlights.forEach((flight, index) => {
              const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
              const focusPoint =
                this.averageAirShowPoints(pairFocusesByFlightId.get(flight.spec.id) ?? []) ??
                corridorPoint(-10, -148 + (index - (activeInterceptorFlights.length - 1) / 2) * 90);
              const sideSign = this.resolveAirShowCorridorSideSign(
                current,
                corridor,
                index <= (activeInterceptorFlights.length - 1) / 2 ? -1 : 1
              );
              const laneIndex = index - (activeInterceptorFlights.length - 1) / 2;
              const path = this.buildAirShowDogfightPassPath(current, focusPoint, corridor, {
                sideSign,
                laneIndex,
                passSign: beat === 0 ? 1 : -1,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight),
                entrySeparationPx: 176,
                crossSeparationPx: 18,
                overshootPx: 184,
                turnRadiusPx: 162
              });
              phaseAssignments.push(...this.buildAirShowFlightAssignments(flight, path, 0.26, index, activeInterceptorFlights.length));
            });

            activeEscortFlights.forEach((flight, index) => {
              const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
              const focusPoint =
                this.averageAirShowPoints(pairFocusesByFlightId.get(flight.spec.id) ?? []) ??
                corridorPoint(8, 132 + (index - (activeEscortFlights.length - 1) / 2) * 50);
              const sideSign = this.resolveAirShowCorridorSideSign(
                current,
                corridor,
                index >= (activeEscortFlights.length - 1) / 2 ? 1 : -1
              );
              const laneIndex = index - (activeEscortFlights.length - 1) / 2;
              const path = this.buildAirShowDogfightPassPath(current, focusPoint, corridor, {
                sideSign,
                laneIndex,
                passSign: beat === 0 ? 1 : -1,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight),
                entrySeparationPx: 164,
                crossSeparationPx: 16,
                overshootPx: 176,
                turnRadiusPx: 154
              });
              phaseAssignments.push(...this.buildAirShowFlightAssignments(flight, path, 0.24, index, activeEscortFlights.length));
            });

            const useCloseScrambleTracerProfile =
              scene.kind === "airToAir"
              && !!bomberFlight
              && beat > 0
              && uniqueEscortPairs.length <= 2
              && activeInterceptorFlights.length <= 3
              && activeEscortFlights.length <= 2;
            uniqueEscortPairs.forEach((pair) => {
              const baseTimings = beat === 0
                ? [0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6]
                : [0.18, 0.26, 0.34, 0.42, 0.5, 0.58, 0.66, 0.74];
              tracerBursts.push(
                ...this.buildAirShowDynamicTracerVolley(
                  phaseAssignments,
                  pair.interceptorFlight,
                  pair.escortFlight,
                  {
                    emitter: useCloseScrambleTracerProfile ? "center" : "nose",
                    color: "#fff5cf",
                    width: useCloseScrambleTracerProfile ? 0.15 : 0.14,
                    lifetimeMs: 22,
                    spreadPx: 0,
                    streakLengthPx: 720,
                    visibleLengthPx: useCloseScrambleTracerProfile ? 18 : 16,
                    fanHalfAngleDeg: 0,
                    burstCount: (pair.exchange.damageToDefender ?? 0) > 0 ? 9 : 8,
                    maxAlignmentDeg: beat === 0 ? 16 : useCloseScrambleTracerProfile ? 30 : 18,
                    maxRangePx: beat === 0 ? 176 : useCloseScrambleTracerProfile ? 260 : 220,
                    timings: baseTimings
                  }
                ),
                ...this.buildAirShowDynamicTracerVolley(
                  phaseAssignments,
                  pair.escortFlight,
                  pair.interceptorFlight,
                  {
                    emitter: useCloseScrambleTracerProfile ? "center" : "nose",
                    color: "#ffd98a",
                    width: useCloseScrambleTracerProfile ? 0.15 : 0.14,
                    lifetimeMs: 22,
                    spreadPx: 0,
                    streakLengthPx: 720,
                    visibleLengthPx: useCloseScrambleTracerProfile ? 18 : 16,
                    fanHalfAngleDeg: 0,
                    burstCount: (pair.exchange.retaliationDamage ?? 0) > 0 ? 9 : 8,
                    maxAlignmentDeg: beat === 0 ? 16 : useCloseScrambleTracerProfile ? 30 : 18,
                    maxRangePx: beat === 0 ? 176 : useCloseScrambleTracerProfile ? 260 : 220,
                    timings: baseTimings.map((timing) => Math.min(0.84, timing + 0.03))
                  }
                )
              );
            });

            const spacedPhaseAssignments = this.resolveAirShowPhaseSpacing(phaseAssignments);
            recordPhase(
              beat === 0 ? "escort-clash-merge" : "escort-clash-scramble",
              spacedPhaseAssignments,
              escortBeatDurationMs,
              tracerBursts
            );
            updateFlightAnchors([...interceptorFlights, ...escortFlights]);
          }

          interceptorFlights.forEach((flight) => this.syncAirShowFlightStrengthForInspection(
            flight,
            Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)
          ));
          escortFlights.forEach((flight) => this.syncAirShowFlightStrengthForInspection(
            flight,
            Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)
          ));
          updateFlightAnchors([...interceptorFlights, ...escortFlights]);
        }
      } else if (interceptorFlights.length + escortFlights.length > 1 && !bomberFlight) {
        // Only hold/drift when no bomber is present. If a bomber is approaching,
        // skip straight to defense positioning to avoid "linger and drift" effect
        // while the next bomber arrives.
        const idleAssignments = [
          ...buildBandAssignments(activeFlights(interceptorFlights), "escort-idle:interceptors", {
            alongPx: -92, lateralPx: -196, alongStepPx: 28, lateralStepPx: 42, jitterAlongPx: 0, jitterLateralPx: 0, arcPx: 15, driftPx: 18
          }),
          ...buildBandAssignments(activeFlights(escortFlights), "escort-idle:escorts", {
            alongPx: 12, lateralPx: 172, alongStepPx: 24, lateralStepPx: 38, jitterAlongPx: 0, jitterLateralPx: 0, arcPx: 15, driftPx: 18
          })
        ];
        recordPhase("escort-hold", idleAssignments, Math.max(520, Math.round((scene.escortClashDurationMs ?? 1500) * 0.55)));
        updateFlightAnchors([...interceptorFlights, ...escortFlights]);
      }

      const survivingInterceptors = activeFlights(interceptorFlights);
      const survivingEscorts = activeFlights(escortFlights);

      if (
        bomberFlight
        && (scene.bomberArrivalDelayMs ?? 0) > 0
        && (scene.escortExchanges?.length ?? 0) > 0
        && (survivingInterceptors.length > 0 || survivingEscorts.length > 0)
      ) {
        const bomberGapAssignments: AirShowPhaseAssignment[] = [
          ...survivingInterceptors.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowScreenRunPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                corridor,
                {
                  endAlongPx: -96,
                  baseLateralPx: -118,
                  laneIndex: index - (survivingInterceptors.length - 1) / 2,
                  sideSign: -1,
                  alongStepPx: 16,
                  lateralStepPx: 28,
                  corridorWidthPx: 18,
                  driftPx: 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.28
            )
          ),
          ...survivingEscorts.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowScreenRunPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                corridor,
                {
                  endAlongPx: -18,
                  baseLateralPx: 132,
                  laneIndex: index - (survivingEscorts.length - 1) / 2,
                  sideSign: 1,
                  alongStepPx: 18,
                  lateralStepPx: 30,
                  corridorWidthPx: 18,
                  driftPx: 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.26
            )
          )
        ];
        recordPhase(
          "bomber-gap",
          bomberGapAssignments,
          Math.max(180, scene.bomberArrivalDelayMs ?? 0)
        );
        updateFlightAnchors([...survivingInterceptors, ...survivingEscorts]);
      }

      // Phase existence based on flight strength, not individual actor visibility
      if (bomberFlight && (bomberFlight.currentStrength ?? 0) > 0) {
        const rand = stageRandom(`ingress:bomber:${bomberFlight.spec.id}`);
        const ingressTarget = corridorPoint(-58, (rand() - 0.5) * 12);
        const bomberIngressAssignments: AirShowPhaseAssignment[] = [
          ...this.buildAirShowFlightAssignments(
            bomberFlight,
            this.buildAirShowBomberRunPath(
              this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor,
              ingressTarget,
              {
                lateralSign: this.resolveAirShowRouteSideSign(
                  this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor,
                  ingressTarget,
                  this.resolveAirShowFlightHeadingDegrees(bomberFlight),
                  rand() > 0.5 ? 1 : -1
                ),
                corridorWidthPx: 20 + rand() * 6,
                driftPx: 28 + rand() * 12,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
              }
            ),
            0.22
          ),
          ...survivingInterceptors.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowScreenRunPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                corridor,
                {
                  endAlongPx: 22,
                  baseLateralPx: -86,
                  laneIndex: index - (survivingInterceptors.length - 1) / 2,
                  sideSign: -1,
                  alongStepPx: 18,
                  lateralStepPx: 34,
                  corridorWidthPx: 14,
                  driftPx: 12,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.24
            )
          ),
          ...survivingEscorts.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowTargetRunEscortPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                ingressTarget,
                corridor,
                {
                  laneIndex: index - (survivingEscorts.length - 1) / 2,
                  sideSign: 1,
                  alongOffsetPx: survivingInterceptors.length > 0 ? 18 : 58,
                  lateralBasePx: survivingInterceptors.length > 0 ? 64 : 118,
                  lateralStepPx: survivingInterceptors.length > 0 ? 24 : 34,
                  corridorWidthPx: survivingInterceptors.length > 0 ? 14 : 18,
                  driftPx: survivingInterceptors.length > 0 ? 10 : 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.24
            )
          )
        ];
        recordPhase("bomber-ingress", bomberIngressAssignments, Math.max(3000, scene.bomberIngressDurationMs ?? 3500));
        updateFlightAnchors([bomberFlight, ...survivingInterceptors, ...survivingEscorts]);

        const bomberPassExchanges = scene.bomberPassExchanges ?? [];
        const bomberAttackEntries = Array.from(
          new Map(
            bomberPassExchanges
              .map((exchange, exchangeIndex) => {
                const interceptorFlight = flightMap.get(exchange.attackerUnitKey);
                if (!interceptorFlight) return null;
                return [exchange.attackerUnitKey, { exchange, interceptorFlight, exchangeIndex }] as const;
              })
              .filter((entry): entry is readonly [string, { exchange: (typeof bomberPassExchanges)[number]; interceptorFlight: AirShowRuntimeFlightInternal; exchangeIndex: number }] => !!entry)
          ).values()
        );
        const bomberVisualPassCount = bomberAttackEntries.length > 0 ? 1 : 0;
        if (bomberAttackEntries.length > 0 && bomberVisualPassCount > 0) {
          const bomberPassBeatDurationMs = Math.max(
            760,
            Math.round((scene.bomberPassDurationMs ?? 2360) / bomberVisualPassCount)
          );
          for (let passIndex = 0; passIndex < bomberVisualPassCount; passIndex += 1) {
            const bomberCurrent = this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
            const passStart = -36 + (passIndex / Math.max(1, bomberVisualPassCount)) * 44;
            const passEnd = 8 + ((passIndex + 1) / Math.max(1, bomberVisualPassCount)) * 92;
            const bomberLateral = passIndex % 2 === 0 ? -6 : 6;

            const phaseAssignments: AirShowPhaseAssignment[] = [
              ...this.buildAirShowFlightAssignments(
                bomberFlight,
                this.buildAirShowBomberContinuationPath(bomberCurrent, corridorPoint(passEnd, bomberLateral), {
                  lateralSign: bomberLateral >= 0 ? 1 : -1,
                  corridorWidthPx: 14,
                  driftPx: 8,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
                }),
                0.22
              )
            ];
            const tracerBursts: AirShowTracerBurst[] = [];
            const activeAttackEntries = bomberAttackEntries.filter((entry) =>
              entry.interceptorFlight.actors.some((actor) => actor.active)
            );

            activeAttackEntries.forEach((entry, attackIndex) => {
              const interceptorCurrent = this.averageAirShowPosition(entry.interceptorFlight.actors) ?? entry.interceptorFlight.anchor;
              const lane = activeAttackEntries.length <= 1 ? 0 : attackIndex - (activeAttackEntries.length - 1) / 2;
              const direction = this.resolveAirShowCorridorSideSign(
                interceptorCurrent,
                corridor,
                attackIndex % 2 === 0 ? -1 : 1
              );
              const interceptorPath = this.buildAirShowBomberInterceptPassPath(interceptorCurrent, corridor, {
                passStartAlongPx: passStart,
                passEndAlongPx: passEnd,
                laneIndex: lane,
                attackSideSign: direction,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(entry.interceptorFlight)
              });
              phaseAssignments.push(...this.buildAirShowFlightAssignments(entry.interceptorFlight, interceptorPath, 0.3));

              tracerBursts.push(
                ...this.buildAirShowDynamicTracerVolley(
                  phaseAssignments,
                  entry.interceptorFlight,
                  bomberFlight,
                  {
                    emitter: "nose",
                    width: 0.18,
                    lifetimeMs: 30,
                    spreadPx: 0,
                    streakLengthPx: 684,
                    visibleLengthPx: 24,
                    fanHalfAngleDeg: 0,
                    burstCount: 8,
                    maxAlignmentDeg: 9,
                    maxRangePx: 144,
                    timings: [0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.72]
                  }
                )
              );
              if ((entry.exchange.retaliationDamage ?? 0) > 0) {
                tracerBursts.push(
                  ...this.buildAirShowDynamicTracerVolley(
                    phaseAssignments,
                    bomberFlight,
                    entry.interceptorFlight,
                    {
                      emitter: "center",
                      color: "#fff1c8",
                      width: 0.17,
                      lifetimeMs: 28,
                      spreadPx: 0,
                      streakLengthPx: 560,
                      visibleLengthPx: 22,
                      fanHalfAngleDeg: 0,
                      burstCount: 5,
                      maxAlignmentDeg: 12,
                      maxRangePx: 164,
                      timings: [0.44, 0.52, 0.6, 0.68]
                    }
                  )
                );
              }
            });

            const engagedInterceptorIds = new Set(activeAttackEntries.map((entry) => entry.interceptorFlight.spec.id));
            const holdingInterceptors = activeFlights(interceptorFlights).filter((flight) => !engagedInterceptorIds.has(flight.spec.id));
            phaseAssignments.push(
              ...buildBandAssignments(holdingInterceptors, `bomber-stack:other-interceptors:${passIndex}`, {
                alongPx: passStart - 28, lateralPx: -156, alongStepPx: 22, lateralStepPx: 30, jitterAlongPx: 0, jitterLateralPx: 0, arcPx: 12, driftPx: 12
              })
            );
            const activeScreeningEscorts = activeFlights(escortFlights);
            phaseAssignments.push(
              ...activeScreeningEscorts.flatMap((flight, escortIndex) =>
                this.buildAirShowFlightAssignments(
                  flight,
                  this.buildAirShowTargetRunEscortPath(
                    this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                    corridorPoint(passEnd, bomberLateral),
                    corridor,
                    {
                      laneIndex: escortIndex - (activeScreeningEscorts.length - 1) / 2,
                      sideSign: 1,
                      alongOffsetPx: 28,
                      lateralBasePx: 84,
                      lateralStepPx: 24,
                      corridorWidthPx: 14,
                      driftPx: 10,
                      startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                    }
                  ),
                  0.24
                )
              )
            );
            recordPhase("bomber-defense-pass", phaseAssignments, bomberPassBeatDurationMs, tracerBursts);
            updateFlightAnchors([bomberFlight, ...interceptorFlights, ...escortFlights]);
          }

          this.syncAirShowFlightStrengthForInspection(
            bomberFlight,
            Math.max(0, bomberFlight.spec.finalStrength ?? bomberFlight.currentStrength)
          );
          interceptorFlights.forEach((flight) =>
            this.syncAirShowFlightStrengthForInspection(
              flight,
              Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)
            )
          );
          updateFlightAnchors([bomberFlight, ...interceptorFlights]);
        }
      }

      const postPassInterceptors = activeFlights(interceptorFlights);
      const postPassEscorts = activeFlights(escortFlights);
      // Phase existence based on flight strength, not individual actor visibility
      if (bomberFlight && bomberTargetCenter && (bomberFlight.currentStrength ?? 0) > 0) {
        const keepInterceptorsOnTargetRun = postPassInterceptors.length > 0 && escortFlights.length === 0;
        const keepEscortsOnTargetRun = postPassEscorts.length > 0 && interceptorFlights.length === 0;
        const rand = stageRandom(`target-run:${bomberFlight.spec.id}`);
        const bomberCurrent = this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
        const targetApproach = this.offsetAirShowPoint(
          bomberTargetCenter,
          -corridor.axis.x * 14 + corridor.normal.x * ((rand() - 0.5) * 8),
          -corridor.axis.y * 14 + corridor.normal.y * ((rand() - 0.5) * 8)
        );
        const strikeRunAssignments: AirShowPhaseAssignment[] = [
          ...this.buildAirShowFlightAssignments(
            bomberFlight,
            this.buildAirShowBomberTargetRunPath(bomberCurrent, targetApproach, {
              lateralSign: this.resolveAirShowRouteSideSign(
                bomberCurrent,
                targetApproach,
                this.resolveAirShowFlightHeadingDegrees(bomberFlight),
                rand() > 0.5 ? 1 : -1
              ),
              corridorWidthPx: 10,
              startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
            }),
            0.2
          ),
          ...(keepEscortsOnTargetRun ? postPassEscorts.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowTargetRunEscortPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                targetApproach,
                corridor,
                {
                  laneIndex: index - (postPassEscorts.length - 1) / 2,
                  sideSign: 1,
                  alongOffsetPx: 54,
                  lateralBasePx: 116,
                  lateralStepPx: 32,
                  corridorWidthPx: 18,
                  driftPx: 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.24
            )
          ) : []),
          ...(keepInterceptorsOnTargetRun ? postPassInterceptors.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowBomberInterceptPassPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                corridor,
                {
                  passStartAlongPx: 18,
                  passEndAlongPx: 96,
                  laneIndex: index - (postPassInterceptors.length - 1) / 2,
                  attackSideSign: this.resolveAirShowCorridorSideSign(
                    this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                    corridor,
                    -1
                  ),
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.34
            )
          ) : [])
        ];
        const strikeRunTracerBursts = keepInterceptorsOnTargetRun ? postPassInterceptors.flatMap((flight) => [
          ...this.buildAirShowDynamicTracerVolley(strikeRunAssignments, flight, bomberFlight, {
            emitter: "nose",
            width: 0.18,
            lifetimeMs: 30,
            spreadPx: 0,
            streakLengthPx: 660,
            visibleLengthPx: 24,
            fanHalfAngleDeg: 0,
            burstCount: 6,
            maxAlignmentDeg: 9,
            maxRangePx: 138,
            timings: [0.42, 0.5, 0.58, 0.66, 0.74]
          }),
          ...this.buildAirShowDynamicTracerVolley(strikeRunAssignments, bomberFlight, flight, {
            emitter: "center",
            color: "#fff1c8",
            width: 0.17,
            lifetimeMs: 28,
            spreadPx: 0,
            streakLengthPx: 540,
            visibleLengthPx: 22,
            fanHalfAngleDeg: 0,
            burstCount: 5,
            maxAlignmentDeg: 12,
            maxRangePx: 156,
            timings: [0.48, 0.56, 0.64, 0.72]
          })
        ]) : [];
        recordPhase(
          "target-run",
          strikeRunAssignments,
          Math.max(640, scene.strikeRunDurationMs ?? 980),
          strikeRunTracerBursts,
          scene.flakBursts ?? []
        );
        updateFlightAnchors([
          bomberFlight,
          ...(keepInterceptorsOnTargetRun ? postPassInterceptors : []),
          ...(keepEscortsOnTargetRun ? postPassEscorts : [])
        ]);
      }

      const egressFlights = activeFlights([...interceptorFlights, ...escortFlights, ...(bomberFlight ? [bomberFlight] : [])]);
      if (egressFlights.length > 0) {
        const egressAssignments = egressFlights.flatMap((flight, index) => {
          const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
          const rand = stageRandom(`egress:${flight.spec.id}:${index}`);
          const egressPoint =
            flight.spec.role === "bomber"
              ? (() => {
                  const originCenter = this.resolveHexCenterByKey(flight.spec.originHexKey);
                  if (originCenter) {
                    return this.offsetAirShowPoint(originCenter, (rand() - 0.5) * 22, (rand() - 0.5) * 18);
                  }
                  return corridorPoint(126 + rand() * 20, (rand() - 0.5) * 12);
                })()
              : flight.spec.role === "escort"
                ? corridorPoint(108 + index * 18 + rand() * 16, 138 + index * 18 + (rand() - 0.5) * 24)
                : corridorPoint(-146 - index * 18 - rand() * 16, -156 - index * 20 + (rand() - 0.5) * 24);
          return this.buildAirShowFlightAssignments(
            flight,
            this.buildAirShowDisengagePath(current, egressPoint, {
              lateralSign: this.resolveAirShowRouteSideSign(
                current,
                egressPoint,
                this.resolveAirShowFlightHeadingDegrees(flight),
                flight.spec.role === "escort" ? 1 : -1
              ),
              corridorWidthPx: flight.spec.role === "bomber" ? 18 + rand() * 8 : 22 + rand() * 10,
              driftPx: flight.spec.role === "bomber" ? 16 + rand() * 8 : 18 + rand() * 8,
              startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
            }),
            flight.spec.role === "bomber" ? 0.18 : 0.26
          );
        });
        recordPhase("egress", egressAssignments, Math.max(820, scene.egressDurationMs ?? 1080));
      }

      return {
        hexKey: scene.hexKey,
        center: { cx: center.cx, cy: center.cy },
        corridor: {
          center: { cx: corridor.center.cx, cy: corridor.center.cy },
          entry: { cx: corridor.entry.cx, cy: corridor.entry.cy },
          merge: { cx: corridor.merge.cx, cy: corridor.merge.cy },
          strike: { cx: corridor.strike.cx, cy: corridor.strike.cy },
          exit: { cx: corridor.exit.cx, cy: corridor.exit.cy }
        },
        bomberTarget: bomberTargetCenter ? { cx: bomberTargetCenter.cx, cy: bomberTargetCenter.cy } : null,
        flights: allFlights.map((flight) => this.describeInspectionAirShowFlight(flight)),
        phases
      };
    } finally {
      allFlights.forEach((flight) => {
        flight.actors.forEach((actor) => actor.image.remove());
      });
    }
  }

  async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
    if (!this.svgElement) {
      return;
    }

    const layer = this.ensureCombatEffectsLayer();
    const center = this.resolveHexCenterByKey(scene.hexKey);
    if (!layer || !center) {
      return;
    }

    const interceptorFallbackOrigin = { cx: center.cx - 248, cy: center.cy + 126 };
    const escortFallbackOrigin = { cx: center.cx + 248, cy: center.cy - 126 };
    const bomberFallbackOrigin = { cx: center.cx - 286, cy: center.cy + 148 };

    const defaultHeadingFor = (origin: AirShowPoint): number =>
      this.resolveAircraftHeadingDegrees(center.cx - origin.cx, center.cy - origin.cy);

    const interceptorFlights = scene.interceptors
      .map((spec) => this.buildAirShowRuntimeFlight(layer, spec, interceptorFallbackOrigin, defaultHeadingFor(interceptorFallbackOrigin)))
      .filter((flight): flight is AirShowRuntimeFlightInternal => !!flight);
    const escortFlights = scene.escorts
      .map((spec) => this.buildAirShowRuntimeFlight(layer, spec, escortFallbackOrigin, defaultHeadingFor(escortFallbackOrigin)))
      .filter((flight): flight is AirShowRuntimeFlightInternal => !!flight);
    const bomberFlight =
      scene.bomber
        ? this.buildAirShowRuntimeFlight(layer, scene.bomber, bomberFallbackOrigin, defaultHeadingFor(bomberFallbackOrigin))
        : null;

    const allFlights = [...interceptorFlights, ...escortFlights, ...(bomberFlight ? [bomberFlight] : [])];
    if (allFlights.length === 0) {
      return;
    }

    // Package-level logging for air combat scene
    const packageId = `ascene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const allFlightIds = allFlights.map(f => f.spec.id);
    const roles: AirShowRole[] = [
      ...interceptorFlights.map(() => "interceptor" as AirShowRole),
      ...escortFlights.map(() => "escort" as AirShowRole),
      ...(bomberFlight ? ["bomber" as AirShowRole] : [])
    ];

    logAirShowPackageStart(
      packageId,
      "ResolvedAirCombat",
      "HexMapRenderer",
      allFlightIds,
      roles,
      scene.hexKey
    );

    logAirShowOwnershipAssert(packageId, "HexMapRenderer", null);

    // Detailed debug behind noisy flag
    debugAirShowPhase("SceneStart", {
      hexKey: scene.hexKey,
      interceptorCount: interceptorFlights.length,
      escortCount: escortFlights.length,
      hasBomber: !!bomberFlight,
      center: { cx: Math.round(center.cx), cy: Math.round(center.cy) }
    });

    if (bomberFlight) {
      bomberFlight.actors.forEach((actor) => {
        actor.image.style.opacity = "0";
      });
      debugAirShowActor(bomberFlight.spec.id, "initially hidden", { opacity: 0 });
    }

    const flightMap = new Map(allFlights.map((flight) => [flight.spec.id, flight] as const));
    const sceneSeed = this.seedFromHexKey(
      `${scene.hexKey}:airshow:${scene.interceptors.length}:${scene.escorts.length}:${scene.bomber?.id ?? "none"}`
    );
    const stageRandom = (label: string): (() => number) =>
      this.seededRandom(this.seedFromHexKey(`${sceneSeed}:${label}`));
    const bomberTargetCenter = scene.bomberTargetHexKey ? this.resolveHexCenterByKey(scene.bomberTargetHexKey) : null;
    const corridor = this.resolveAirShowCorridor(
      center,
      bomberFlight ? this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor : null,
      bomberTargetCenter
    );
    const corridorPoint = (alongPx: number, lateralPx = 0): AirShowPoint =>
      this.projectAirShowCorridorPoint(corridor, alongPx, lateralPx);
    const updateFlightAnchors = (flights: ReadonlyArray<AirShowRuntimeFlightInternal>): void => {
      flights.forEach((flight) => {
        flight.anchor = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
      });
    };
    const activeFlights = (flights: ReadonlyArray<AirShowRuntimeFlightInternal>): AirShowRuntimeFlightInternal[] =>
      flights.filter((flight) => flight.actors.some((actor) => actor.active));
    const scheduleTimedFlakBursts = (
      flight: AirShowRuntimeFlightInternal | null,
      durationMs: number,
      bursts: ReadonlyArray<NonNullable<ResolvedAirShowScene["flakBursts"]>[number]>
    ): (() => void) => {
      if (!flight || bursts.length === 0) {
        return () => {};
      }
      const handles = bursts.map((burst) =>
        window.setTimeout(() => {
          const wave = this.resolveAirShowFlakBurstWave(corridor, bomberTargetCenter ?? corridor.strike, burst);
          this.playAirShowFlakWave(wave, burst.scale ?? 1.08, burst.smokeScale ?? 0.94);
        }, Math.max(0, Math.round(durationMs * this.clamp(burst.progress, 0, 1))))
      );
      return () => {
        handles.forEach((handle) => window.clearTimeout(handle));
      };
    };
    const scheduleBombRelease = (
      durationMs: number,
      targetHexKey: string | null | undefined,
      progress: number
    ): (() => void) => {
      if (!targetHexKey) {
        return () => {};
      }
      const handle = window.setTimeout(() => {
        void this.playExplosion(targetHexKey, true);
        void this.playDustCloud(targetHexKey);
      }, Math.max(0, Math.round(durationMs * this.clamp(progress, 0, 1))));
      return () => {
        window.clearTimeout(handle);
      };
    };
    const buildBandAssignments = (
      flights: ReadonlyArray<AirShowRuntimeFlightInternal>,
      label: string,
      options: {
        alongPx: number;
        lateralPx: number;
        alongStepPx?: number;
        lateralStepPx?: number;
        jitterAlongPx?: number;
        jitterLateralPx?: number;
        arcPx?: number;
        driftPx?: number;
        headingBlend?: number;
      }
    ): AirShowPhaseAssignment[] =>
      flights.flatMap((flight, index) => {
        const rand = stageRandom(`band:${label}:${flight.spec.id}:${index}`);
        const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const lane = flights.length <= 1 ? 0 : index - (flights.length - 1) / 2;
        const holdTarget = corridorPoint(
          options.alongPx +
            lane * (options.alongStepPx ?? 34) +
            (rand() - 0.5) * (options.jitterAlongPx ?? 28),
          options.lateralPx +
            lane * (options.lateralStepPx ?? 48) +
            (rand() - 0.5) * (options.jitterLateralPx ?? 24)
        );
        return this.buildAirShowFlightAssignments(
          flight,
          this.buildAirShowCurvedPath(
            current,
            holdTarget,
            (lane >= 0 ? 1 : -1) * (options.arcPx ?? 76),
            (rand() - 0.5) * (options.driftPx ?? 34),
            this.resolveAirShowFlightHeadingDegrees(flight)
          ),
          options.headingBlend ?? 0.26
        );
      });

    try {
      const ingressAssignments: AirShowPhaseAssignment[] = [
        ...buildBandAssignments(
          interceptorFlights,
          "ingress:interceptors",
          this.resolveAirShowIngressBandPlan(scene.kind, "interceptor")
        ),
        ...buildBandAssignments(
          escortFlights,
          "ingress:escorts",
          this.resolveAirShowIngressBandPlan(scene.kind, "escort")
        )
      ];
      if (ingressAssignments.length > 0) {
        logAirShowBeatStart(packageId, 0, "ingress", interceptorFlights.map(f => f.spec.id));
        debugAirShowPhase("Ingress", { type: "fighters approaching" });
        await this.runAirShowPhase(
          ingressAssignments,
          Math.max(1250, scene.fighterIngressDurationMs ?? 1750),
          [],
          { easing: "linear" }
        );
        updateFlightAnchors([...interceptorFlights, ...escortFlights]);
      }

      const escortExchanges = scene.escortExchanges ?? [];
      if (escortExchanges.length > 0) {
        // Role-read beat: brief pause (250ms) so player can visually identify formation/roles
        // Per North Star Spec: "No weapon fire until both the ingress leg and role read have completed"
        logAirShowBeatStart(packageId, 1, "roleRead", [...interceptorFlights.map(f => f.spec.id), ...escortFlights.map(f => f.spec.id)]);
        debugAirShowPhase("RoleRead", { durationMs: 250, participants: interceptorFlights.length + escortFlights.length });
        await new Promise(resolve => setTimeout(resolve, 250));

        // Now begin escort clash / weapons exchange
      logAirShowBeatStart(packageId, 2, "escortClash", escortFlights.map(f => f.spec.id));
      debugAirShowPhase("EscortClash", { exchanges: escortExchanges.length });
        type EscortPairData = {
          exchange: (typeof escortExchanges)[number];
          interceptorFlight: AirShowRuntimeFlightInternal;
          escortFlight: AirShowRuntimeFlightInternal;
          pairIndex: number;
          focusPoint: AirShowPoint;
        };

        const rawEscortPairs = escortExchanges
          .map((exchange) => {
            const interceptorFlight = flightMap.get(exchange.defenderUnitKey);
            const escortFlight = flightMap.get(exchange.attackerUnitKey);
            if (!interceptorFlight || !escortFlight) {
              return null;
            }
            return { exchange, interceptorFlight, escortFlight };
          })
          .filter(
            (
              entry
            ): entry is {
              exchange: (typeof escortExchanges)[number];
              interceptorFlight: AirShowRuntimeFlightInternal;
              escortFlight: AirShowRuntimeFlightInternal;
            } => !!entry
          );
        const uniqueEscortPairs = Array.from(
          new Map(
            rawEscortPairs.map((entry) => [
              `${entry.escortFlight.spec.id}:${entry.interceptorFlight.spec.id}`,
              entry
            ] as const)
          ).values()
        ).map((entry, pairIndex, allPairs) => {
          const rand = stageRandom(
            `escort:pair:${pairIndex}:${entry.escortFlight.spec.id}:${entry.interceptorFlight.spec.id}`
          );
          return {
            ...entry,
            pairIndex,
            focusPoint: corridorPoint(
              -4 + (rand() - 0.5) * 10,
              (pairIndex - (allPairs.length - 1) / 2) * 74 + (rand() - 0.5) * 18
            )
          } satisfies EscortPairData;
        });

        const pairFocusesByFlightId = new Map<string, AirShowPoint[]>();
        uniqueEscortPairs.forEach((pair) => {
          const interceptorFocuses = pairFocusesByFlightId.get(pair.interceptorFlight.spec.id) ?? [];
          interceptorFocuses.push(pair.focusPoint);
          pairFocusesByFlightId.set(pair.interceptorFlight.spec.id, interceptorFocuses);

          const escortFocuses = pairFocusesByFlightId.get(pair.escortFlight.spec.id) ?? [];
          escortFocuses.push(pair.focusPoint);
          pairFocusesByFlightId.set(pair.escortFlight.spec.id, escortFocuses);
        });

        if (uniqueEscortPairs.length > 0) {
          const escortBeatCount = 2;
          for (let beat = 0; beat < escortBeatCount; beat += 1) {
            const escortBeatDurationMs =
              beat === 0
                ? Math.max(760, Math.round((scene.escortClashDurationMs ?? 1980) * 0.38))
                : Math.max(1040, Math.round((scene.escortClashDurationMs ?? 1980) * 0.62));
            const phaseAssignments: AirShowPhaseAssignment[] = [];
            const tracerBursts: AirShowTracerBurst[] = [];
            const activeInterceptorFlights = activeFlights(interceptorFlights);
            const activeEscortFlights = activeFlights(escortFlights);

            activeInterceptorFlights.forEach((flight, index) => {
              const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
              const focusPoint =
                this.averageAirShowPoints(pairFocusesByFlightId.get(flight.spec.id) ?? []) ??
                corridorPoint(
                  -10,
                  -148 + (index - (activeInterceptorFlights.length - 1) / 2) * 90
                );
              const sideSign = this.resolveAirShowCorridorSideSign(
                current,
                corridor,
                index <= (activeInterceptorFlights.length - 1) / 2 ? -1 : 1
              );
              const laneIndex = index - (activeInterceptorFlights.length - 1) / 2;
              const path = this.buildAirShowDogfightPassPath(current, focusPoint, corridor, {
                sideSign,
                laneIndex,
                passSign: beat === 0 ? 1 : -1,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight),
                entrySeparationPx: 176,
                crossSeparationPx: 18,
                overshootPx: 184,
                turnRadiusPx: 162
              });
              phaseAssignments.push(...this.buildAirShowFlightAssignments(flight, path, 0.26, index, activeInterceptorFlights.length));
            });

            activeEscortFlights.forEach((flight, index) => {
              const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
              const focusPoint =
                this.averageAirShowPoints(pairFocusesByFlightId.get(flight.spec.id) ?? []) ??
                corridorPoint(
                  8,
                  132 + (index - (activeEscortFlights.length - 1) / 2) * 50
                );
              const sideSign = this.resolveAirShowCorridorSideSign(
                current,
                corridor,
                index >= (activeEscortFlights.length - 1) / 2 ? 1 : -1
              );
              const laneIndex = index - (activeEscortFlights.length - 1) / 2;
              const path = this.buildAirShowDogfightPassPath(current, focusPoint, corridor, {
                sideSign,
                laneIndex,
                passSign: beat === 0 ? 1 : -1,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight),
                entrySeparationPx: 164,
                crossSeparationPx: 16,
                overshootPx: 176,
                turnRadiusPx: 154
              });
              phaseAssignments.push(...this.buildAirShowFlightAssignments(flight, path, 0.24, index, activeEscortFlights.length));
            });

            const useCloseScrambleTracerProfile =
              scene.kind === "airToAir"
              && !!bomberFlight
              && beat > 0
              && uniqueEscortPairs.length <= 2
              && activeInterceptorFlights.length <= 3
              && activeEscortFlights.length <= 2;
            uniqueEscortPairs.forEach((pair) => {
              const baseTimings = beat === 0
                ? [0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6]
                : [0.18, 0.26, 0.34, 0.42, 0.5, 0.58, 0.66, 0.74];
              tracerBursts.push(
                ...this.buildAirShowDynamicTracerVolley(
                  phaseAssignments,
                  pair.interceptorFlight,
                  pair.escortFlight,
                  {
                    emitter: useCloseScrambleTracerProfile ? "center" : "nose",
                    color: "#fff5cf",
                    width: useCloseScrambleTracerProfile ? 0.15 : 0.14,
                    lifetimeMs: 22,
                    spreadPx: 0,
                    streakLengthPx: 720,
                    visibleLengthPx: useCloseScrambleTracerProfile ? 18 : 16,
                    fanHalfAngleDeg: 0,
                    burstCount: (pair.exchange.damageToDefender ?? 0) > 0 ? 9 : 8,
                    maxAlignmentDeg: beat === 0 ? 16 : useCloseScrambleTracerProfile ? 30 : 18,
                    maxRangePx: beat === 0 ? 176 : useCloseScrambleTracerProfile ? 260 : 220,
                    timings: baseTimings
                  }
                ),
                ...this.buildAirShowDynamicTracerVolley(
                  phaseAssignments,
                  pair.escortFlight,
                  pair.interceptorFlight,
                  {
                    emitter: useCloseScrambleTracerProfile ? "center" : "nose",
                    color: "#ffd98a",
                    width: useCloseScrambleTracerProfile ? 0.15 : 0.14,
                    lifetimeMs: 22,
                    spreadPx: 0,
                    streakLengthPx: 720,
                    visibleLengthPx: useCloseScrambleTracerProfile ? 18 : 16,
                    fanHalfAngleDeg: 0,
                    burstCount: (pair.exchange.retaliationDamage ?? 0) > 0 ? 9 : 8,
                    maxAlignmentDeg: beat === 0 ? 16 : useCloseScrambleTracerProfile ? 30 : 18,
                    maxRangePx: beat === 0 ? 176 : useCloseScrambleTracerProfile ? 260 : 220,
                    timings: baseTimings.map((timing) => Math.min(0.84, timing + 0.03))
                  }
                )
              );
            });

            // Apply collision-aware spacing resolution before running phase
            // Per North Star Spec: prevents aircraft from overlapping into dense clusters
            const spacedPhaseAssignments = this.resolveAirShowPhaseSpacing(phaseAssignments);

            await this.runAirShowPhase(spacedPhaseAssignments, escortBeatDurationMs, tracerBursts, { easing: "linear" });
            updateFlightAnchors([...interceptorFlights, ...escortFlights]);
          }

          await Promise.all([
            ...interceptorFlights.map((flight) =>
              this.syncAirShowFlightStrength(
                flight,
                Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength),
                { x: -0.88, y: 0.68 }
              )
            ),
            ...escortFlights.map((flight) =>
              this.syncAirShowFlightStrength(
                flight,
                Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength),
                { x: 0.88, y: -0.68 }
              )
            )
          ]);
          updateFlightAnchors([...interceptorFlights, ...escortFlights]);
        }
      } else if (interceptorFlights.length + escortFlights.length > 1 && !bomberFlight) {
        // Only hold/drift when no bomber is present. Skip to defense positioning
        // when a bomber is approaching to prevent "linger and drift" effect.
        await this.runAirShowPhase(
          [
            ...buildBandAssignments(activeFlights(interceptorFlights), "escort-idle:interceptors", {
              alongPx: -92,
              lateralPx: -196,
              alongStepPx: 28,
              lateralStepPx: 42,
              jitterAlongPx: 0,
              jitterLateralPx: 0,
              arcPx: 15,
              driftPx: 18
            }),
            ...buildBandAssignments(activeFlights(escortFlights), "escort-idle:escorts", {
              alongPx: 12,
              lateralPx: 172,
              alongStepPx: 24,
              lateralStepPx: 38,
              jitterAlongPx: 0,
              jitterLateralPx: 0,
              arcPx: 15,
              driftPx: 18
            })
          ],
          Math.max(520, Math.round((scene.escortClashDurationMs ?? 1500) * 0.55))
        );
        updateFlightAnchors([...interceptorFlights, ...escortFlights]);
      }

      const survivingInterceptors = activeFlights(interceptorFlights);
      const survivingEscorts = activeFlights(escortFlights);
      debugAirShowPhase("PostEscortStatus", {
        interceptors: survivingInterceptors.length,
        escorts: survivingEscorts.length
      });

      if (
        bomberFlight
        && (scene.bomberArrivalDelayMs ?? 0) > 0
        && (scene.escortExchanges?.length ?? 0) > 0
        && (survivingInterceptors.length > 0 || survivingEscorts.length > 0)
      ) {
        const survivingFighters = [...survivingInterceptors, ...survivingEscorts];
        logAirShowBeatStart(packageId, 2, "bomberGap", survivingFighters.map((f: AirShowRuntimeFlightInternal) => f.spec.id));
        debugAirShowPhase("BomberGap", { durationMs: Math.round(scene.bomberArrivalDelayMs ?? 0) });
        await this.runAirShowPhase(
          [
            ...survivingInterceptors.flatMap((flight, index) =>
              this.buildAirShowFlightAssignments(
                flight,
                this.buildAirShowScreenRunPath(
                  this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                  corridor,
                  {
                    endAlongPx: -96,
                    baseLateralPx: -118,
                    laneIndex: index - (survivingInterceptors.length - 1) / 2,
                  sideSign: -1,
                  alongStepPx: 16,
                  lateralStepPx: 28,
                  corridorWidthPx: 18,
                  driftPx: 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.28
              )
            ),
            ...survivingEscorts.flatMap((flight, index) =>
              this.buildAirShowFlightAssignments(
                flight,
                this.buildAirShowScreenRunPath(
                  this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                  corridor,
                  {
                    endAlongPx: -18,
                    baseLateralPx: 132,
                    laneIndex: index - (survivingEscorts.length - 1) / 2,
                  sideSign: 1,
                  alongStepPx: 18,
                  lateralStepPx: 30,
                  corridorWidthPx: 18,
                  driftPx: 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.26
              )
            )
          ],
          Math.max(180, scene.bomberArrivalDelayMs ?? 0),
          [],
          { easing: "linear" }
        );
        updateFlightAnchors([...survivingInterceptors, ...survivingEscorts]);
      }

      // Phase existence based on flight strength, not individual actor visibility
      if (bomberFlight && (bomberFlight.currentStrength ?? 0) > 0) {
        logAirShowBeatStart(packageId, 4, "bomberIngress", [bomberFlight.spec.id]);
      debugAirShowPhase("BomberIngress", {});
        await Promise.all(
          bomberFlight.actors
            .filter((actor) => actor.active)
            .map((actor) => this.fadeInActor(actor, 400))
        );
        logAirShowActorTransition(packageId, bomberFlight.spec.id, "bomber", "ingress", "engaged", "fadeIn complete");
        debugAirShowActor(bomberFlight.spec.id, "faded in", { visible: bomberFlight.actors.filter(a => a.active).length });
        const rand = stageRandom(`ingress:bomber:${bomberFlight.spec.id}`);
        const ingressTarget = corridorPoint(-58, (rand() - 0.5) * 12);
        const bomberIngressAssignments: AirShowPhaseAssignment[] = [
          ...this.buildAirShowFlightAssignments(
            bomberFlight,
            this.buildAirShowBomberRunPath(
              this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor,
              ingressTarget,
              {
                lateralSign: this.resolveAirShowRouteSideSign(
                  this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor,
                  ingressTarget,
                  this.resolveAirShowFlightHeadingDegrees(bomberFlight),
                  rand() > 0.5 ? 1 : -1
                ),
                corridorWidthPx: 20 + rand() * 6,
                driftPx: 28 + rand() * 12,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
              }
            ),
            0.22
          ),
          ...survivingInterceptors.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowScreenRunPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                corridor,
                {
                  endAlongPx: 22,
                  baseLateralPx: -86,
                  laneIndex: index - (survivingInterceptors.length - 1) / 2,
                  sideSign: -1,
                  alongStepPx: 18,
                  lateralStepPx: 34,
                  corridorWidthPx: 14,
                  driftPx: 12,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.24
            )
          ),
          ...survivingEscorts.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowTargetRunEscortPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                ingressTarget,
                corridor,
                {
                  laneIndex: index - (survivingEscorts.length - 1) / 2,
                  sideSign: 1,
                  alongOffsetPx: survivingInterceptors.length > 0 ? 18 : 58,
                  lateralBasePx: survivingInterceptors.length > 0 ? 64 : 118,
                  lateralStepPx: survivingInterceptors.length > 0 ? 24 : 34,
                  corridorWidthPx: survivingInterceptors.length > 0 ? 14 : 18,
                  driftPx: survivingInterceptors.length > 0 ? 10 : 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.24
            )
          )
        ];
        const bomberIngressDurationMs = Math.max(3000, scene.bomberIngressDurationMs ?? 3500);
          await this.runAirShowPhase(bomberIngressAssignments, bomberIngressDurationMs, [], { easing: "linear" });
        updateFlightAnchors([bomberFlight, ...survivingInterceptors, ...survivingEscorts]);

        const bomberPassExchanges = scene.bomberPassExchanges ?? [];
        const bomberAttackEntries = Array.from(
          new Map(
            bomberPassExchanges
              .map((exchange, exchangeIndex) => {
                const interceptorFlight = flightMap.get(exchange.attackerUnitKey);
                if (!interceptorFlight) {
                  return null;
                }
                return [
                  exchange.attackerUnitKey,
                  {
                    exchange,
                    interceptorFlight,
                    exchangeIndex
                  }
                ] as const;
              })
              .filter(
                (
                  entry
                ): entry is readonly [
                  string,
                  {
                    exchange: (typeof bomberPassExchanges)[number];
                    interceptorFlight: AirShowRuntimeFlightInternal;
                    exchangeIndex: number;
                  }
                ] => !!entry
              )
          ).values()
        );
        const bomberVisualPassCount = bomberAttackEntries.length > 0 ? 1 : 0;
        const bomberPassActors = [
          ...interceptorFlights.map(f => f.spec.id),
          ...(bomberFlight ? [bomberFlight.spec.id] : [])
        ];
        logAirShowBeatStart(packageId, 5, "bomberPass", bomberPassActors);
        debugAirShowPhase("BomberPass", {
          attacks: bomberAttackEntries.length,
          passes: bomberVisualPassCount
        });
        if (bomberAttackEntries.length > 0 && bomberVisualPassCount > 0) {
          const bomberPassBeatDurationMs = Math.max(
            760,
            Math.round((scene.bomberPassDurationMs ?? 2360) / bomberVisualPassCount)
          );

          for (let passIndex = 0; passIndex < bomberVisualPassCount; passIndex += 1) {
            const bomberCurrent = this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
            const passStart = -36 + (passIndex / Math.max(1, bomberVisualPassCount)) * 44;
            const passEnd = 8 + ((passIndex + 1) / Math.max(1, bomberVisualPassCount)) * 92;
            const bomberLateral = passIndex % 2 === 0 ? -6 : 6;

            const phaseAssignments: AirShowPhaseAssignment[] = [
              ...this.buildAirShowFlightAssignments(
                bomberFlight,
                this.buildAirShowBomberContinuationPath(
                  bomberCurrent,
                  corridorPoint(passEnd, bomberLateral),
                  {
                    lateralSign: bomberLateral >= 0 ? 1 : -1,
                    corridorWidthPx: 14,
                    driftPx: 8,
                    startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
                  }
                ),
                0.22
              )
            ];
            const tracerBursts: AirShowTracerBurst[] = [];
            const activeAttackEntries = bomberAttackEntries.filter((entry) =>
              entry.interceptorFlight.actors.some((actor) => actor.active)
            );

            activeAttackEntries.forEach((entry, attackIndex) => {
              const interceptorCurrent = this.averageAirShowPosition(entry.interceptorFlight.actors) ?? entry.interceptorFlight.anchor;
              const lane = activeAttackEntries.length <= 1 ? 0 : attackIndex - (activeAttackEntries.length - 1) / 2;
              const direction = this.resolveAirShowCorridorSideSign(
                interceptorCurrent,
                corridor,
                attackIndex % 2 === 0 ? -1 : 1
              );
              const interceptorPath = this.buildAirShowBomberInterceptPassPath(interceptorCurrent, corridor, {
                passStartAlongPx: passStart,
                passEndAlongPx: passEnd,
                laneIndex: lane,
                attackSideSign: direction,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(entry.interceptorFlight)
              });
              phaseAssignments.push(...this.buildAirShowFlightAssignments(entry.interceptorFlight, interceptorPath, 0.3));

              tracerBursts.push(
                ...this.buildAirShowDynamicTracerVolley(
                  phaseAssignments,
                  entry.interceptorFlight,
                  bomberFlight,
                  {
                    emitter: "nose",
                    width: 0.18,
                    lifetimeMs: 30,
                    spreadPx: 0,
                    streakLengthPx: 684,
                    visibleLengthPx: 24,
                    fanHalfAngleDeg: 0,
                    burstCount: 8,
                    maxAlignmentDeg: 9,
                    maxRangePx: 144,
                    timings: [0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.72]
                  }
                )
              );
              if ((entry.exchange.retaliationDamage ?? 0) > 0) {
                tracerBursts.push(
                  ...this.buildAirShowDynamicTracerVolley(
                    phaseAssignments,
                    bomberFlight,
                    entry.interceptorFlight,
                    {
                      emitter: "center",
                      color: "#fff1c8",
                      width: 0.17,
                      lifetimeMs: 28,
                      spreadPx: 0,
                      streakLengthPx: 560,
                      visibleLengthPx: 22,
                      fanHalfAngleDeg: 0,
                      burstCount: 5,
                      maxAlignmentDeg: 12,
                      maxRangePx: 164,
                      timings: [0.44, 0.52, 0.6, 0.68]
                    }
                  )
                );
              }
            });

            const engagedInterceptorIds = new Set(activeAttackEntries.map((entry) => entry.interceptorFlight.spec.id));
            const holdingInterceptors = activeFlights(interceptorFlights).filter(
              (flight) => !engagedInterceptorIds.has(flight.spec.id)
            );
            phaseAssignments.push(
              ...buildBandAssignments(
                holdingInterceptors,
                `bomber-stack:other-interceptors:${passIndex}`,
                {
                  alongPx: passStart - 28,
                  lateralPx: -156,
                  alongStepPx: 22,
                  lateralStepPx: 30,
                  jitterAlongPx: 0,
                  jitterLateralPx: 0,
                  arcPx: 12,
                  driftPx: 12
                }
              )
            );
            const activeScreeningEscorts = activeFlights(escortFlights);
            phaseAssignments.push(
              ...activeScreeningEscorts.flatMap((flight, escortIndex) =>
                this.buildAirShowFlightAssignments(
                  flight,
                  this.buildAirShowTargetRunEscortPath(
                    this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                    corridorPoint(passEnd, bomberLateral),
                    corridor,
                    {
                      laneIndex: escortIndex - (activeScreeningEscorts.length - 1) / 2,
                      sideSign: 1,
                      alongOffsetPx: 28,
                      lateralBasePx: 84,
                      lateralStepPx: 24,
                      corridorWidthPx: 14,
                      driftPx: 10,
                      startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                    }
                  ),
                  0.24
                )
              )
            );

            await this.runAirShowPhase(phaseAssignments, bomberPassBeatDurationMs, tracerBursts, { easing: "linear" });
            updateFlightAnchors([bomberFlight, ...interceptorFlights, ...escortFlights]);
          }

          await Promise.all([
            this.syncAirShowFlightStrength(
              bomberFlight,
              Math.max(0, bomberFlight.spec.finalStrength ?? bomberFlight.currentStrength),
              { x: 0.95, y: 0.2 }
            ),
            ...interceptorFlights.map((flight) =>
              this.syncAirShowFlightStrength(
                flight,
                Math.max(0, flight.spec.finalStrength ?? flight.currentStrength),
                { x: -0.75, y: 0.8 }
              )
            )
          ]);
          updateFlightAnchors([bomberFlight, ...interceptorFlights]);
        }
      }

      const postPassInterceptors = activeFlights(interceptorFlights);
      const postPassEscorts = activeFlights(escortFlights);
      // Phase existence based on flight strength, not individual actor visibility
      if (bomberFlight && bomberTargetCenter && (bomberFlight.currentStrength ?? 0) > 0) {
        logAirShowBeatStart(packageId, 6, "targetRun", [bomberFlight.spec.id]);
      debugAirShowPhase("TargetRun", {});
        const keepInterceptorsOnTargetRun = postPassInterceptors.length > 0 && escortFlights.length === 0;
        const keepEscortsOnTargetRun = postPassEscorts.length > 0 && interceptorFlights.length === 0;
        const rand = stageRandom(`target-run:${bomberFlight.spec.id}`);
        const bomberCurrent = this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
        const targetApproach = this.offsetAirShowPoint(
          bomberTargetCenter,
          -corridor.axis.x * 14 + corridor.normal.x * ((rand() - 0.5) * 8),
          -corridor.axis.y * 14 + corridor.normal.y * ((rand() - 0.5) * 8)
        );
        const strikeRunAssignments: AirShowPhaseAssignment[] = [
          ...this.buildAirShowFlightAssignments(
            bomberFlight,
            this.buildAirShowBomberTargetRunPath(bomberCurrent, targetApproach, {
              lateralSign: this.resolveAirShowRouteSideSign(
                bomberCurrent,
                targetApproach,
                this.resolveAirShowFlightHeadingDegrees(bomberFlight),
                rand() > 0.5 ? 1 : -1
              ),
              corridorWidthPx: 10,
              startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
            }),
            0.2
          ),
          ...(keepEscortsOnTargetRun ? postPassEscorts.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowTargetRunEscortPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                targetApproach,
                corridor,
                {
                  laneIndex: index - (postPassEscorts.length - 1) / 2,
                  sideSign: 1,
                  alongOffsetPx: 54,
                  lateralBasePx: 116,
                  lateralStepPx: 32,
                  corridorWidthPx: 18,
                  driftPx: 18,
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.24
            )
          ) : []),
          ...(keepInterceptorsOnTargetRun ? postPassInterceptors.flatMap((flight, index) =>
            this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowBomberInterceptPassPath(
                this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                corridor,
                {
                  passStartAlongPx: 18,
                  passEndAlongPx: 96,
                  laneIndex: index - (postPassInterceptors.length - 1) / 2,
                  attackSideSign: this.resolveAirShowCorridorSideSign(
                    this.averageAirShowPosition(flight.actors) ?? flight.anchor,
                    corridor,
                    -1
                  ),
                  startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
                }
              ),
              0.34
            )
          ) : [])
        ];
        const strikeRunTracerBursts = keepInterceptorsOnTargetRun ? postPassInterceptors.flatMap((flight) => [
          ...this.buildAirShowDynamicTracerVolley(strikeRunAssignments, flight, bomberFlight, {
            emitter: "nose",
            width: 0.18,
            lifetimeMs: 30,
            spreadPx: 0,
            streakLengthPx: 660,
            visibleLengthPx: 24,
            fanHalfAngleDeg: 0,
            burstCount: 6,
            maxAlignmentDeg: 9,
            maxRangePx: 138,
            timings: [0.42, 0.5, 0.58, 0.66, 0.74]
          }),
          ...this.buildAirShowDynamicTracerVolley(strikeRunAssignments, bomberFlight, flight, {
            emitter: "center",
            color: "#fff1c8",
            width: 0.17,
            lifetimeMs: 28,
            spreadPx: 0,
            streakLengthPx: 540,
            visibleLengthPx: 22,
            fanHalfAngleDeg: 0,
            burstCount: 5,
            maxAlignmentDeg: 12,
            maxRangePx: 156,
            timings: [0.48, 0.56, 0.64, 0.72]
          })
        ]) : [];
        const strikeRunDurationMs = Math.max(640, scene.strikeRunDurationMs ?? 980);
        const cancelStrikeRunFlak = scheduleTimedFlakBursts(
          bomberFlight,
          strikeRunDurationMs,
          scene.flakBursts ?? []
        );
        const cancelBombRelease = scheduleBombRelease(
          strikeRunDurationMs,
          scene.bomberTargetHexKey,
          scene.bombReleaseProgress ?? 0.74
        );
        await this.runAirShowPhase(strikeRunAssignments, strikeRunDurationMs, strikeRunTracerBursts, { easing: "linear" });
        cancelBombRelease();
        cancelStrikeRunFlak();
        updateFlightAnchors([
          bomberFlight,
          ...(keepInterceptorsOnTargetRun ? postPassInterceptors : []),
          ...(keepEscortsOnTargetRun ? postPassEscorts : [])
        ]);
      }

      const egressFlights = activeFlights([
        ...interceptorFlights,
        ...escortFlights,
        ...(bomberFlight ? [bomberFlight] : [])
      ]);
      logAirShowBeatStart(packageId, 7, "egress", egressFlights.map(f => f.spec.id));
      debugAirShowPhase("Egress", { flights: egressFlights.length });
      if (egressFlights.length > 0) {
        await this.runAirShowPhase(
          egressFlights.flatMap((flight, index) => {
            const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const rand = stageRandom(`egress:${flight.spec.id}:${index}`);
            const egressPoint =
              flight.spec.role === "bomber"
                ? (() => {
                    const originCenter = this.resolveHexCenterByKey(flight.spec.originHexKey);
                    if (originCenter) {
                      return this.offsetAirShowPoint(
                        originCenter,
                        (rand() - 0.5) * 22,
                        (rand() - 0.5) * 18
                      );
                    }
                    return corridorPoint(126 + rand() * 20, (rand() - 0.5) * 12);
                  })()
                : flight.spec.role === "escort"
                  ? corridorPoint(108 + index * 18 + rand() * 16, 138 + index * 18 + (rand() - 0.5) * 24)
                  : corridorPoint(-146 - index * 18 - rand() * 16, -156 - index * 20 + (rand() - 0.5) * 24);
            return this.buildAirShowFlightAssignments(
              flight,
              this.buildAirShowDisengagePath(current, egressPoint, {
                lateralSign: this.resolveAirShowRouteSideSign(
                  current,
                  egressPoint,
                  this.resolveAirShowFlightHeadingDegrees(flight),
                  flight.spec.role === "escort" ? 1 : -1
                ),
                corridorWidthPx: flight.spec.role === "bomber" ? 18 + rand() * 8 : 22 + rand() * 10,
                driftPx: flight.spec.role === "bomber" ? 16 + rand() * 8 : 18 + rand() * 8,
                startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(flight)
              }),
              0.26
            );
          }),
          Math.max(560, scene.egressDurationMs ?? 980),
          [],
          { easing: "linear" }
        );

        await Promise.all(
          egressFlights.flatMap((flight) => flight.actors.map((actor) => this.fadeOutActor(actor, 300)))
        );
      }
      // Calculate final outcome
      const finalSurvivors = egressFlights.map(f => f.spec.id);
      const finalDestroyed: string[] = []; // Track destroyed if needed
      logAirShowPackageEnd(packageId, "success", finalSurvivors, finalDestroyed, true);
    } finally {
      debugAirShowPhase("Cleanup", {
        flights: allFlights.length,
        totalSprites: allFlights.reduce((sum, f) => sum + f.actors.length, 0)
      });
      allFlights.forEach((flight) => {
        flight.actors.forEach((actor) => actor.image.remove());
      });
    }
  }

  /**
   * Timeline-based linked strike package director.
   * Unified animation ownership - replaces split responsibility between BattleScreen and HexMapRenderer.
   *
   * Executes overlapping beats with continuous flight paths. All sprites created at start, removed at end.
   * No despawn/respawn cycles.
   *
   * Phase 0 stub implementation - full rendering in Phases 1-6.
   */
  async playLinkedStrikePackage(scene: LinkedStrikePackageScene): Promise<void> {
    if (!this.svgElement) {
      return;
    }

    const layer = this.ensureCombatEffectsLayer();
    if (!layer) {
      return;
    }

    // Phase 0: Basic structure only - no rendering yet
    // This demonstrates the timeline architecture that will replace sequential phases

    // Collect all unique participants across all beats first
    const allParticipants = new Map<string, AirShowRuntimeFlight>();
    scene.beats.forEach((beat) => {
      beat.participants.fighters?.forEach((flight) => allParticipants.set(flight.id, flight));
      beat.participants.bombers?.forEach((flight) => allParticipants.set(flight.id, flight));
    });

    // Generate package ID for tracking and log package start
    const packageId = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const missionIds = Array.from(allParticipants.values()).map(f => f.id);
    const roles = Array.from(new Set(Array.from(allParticipants.values()).map(f => f.role as AirShowRole)));

    logAirShowPackageStart(
      packageId,
      "LinkedStrikePackage",
      "HexMapRenderer",
      missionIds,
      roles,
      scene.targetHexKey
    );

    // Detailed debug info behind noisy flag
    debugAirShowPhase("PackageInit", {
      beats: scene.beats.length,
      totalDurationMs: scene.totalDurationMs,
      combatVolume: scene.combatVolume,
      bomberCorridor: scene.bomberCorridor
    });

    // Log each beat start
    scene.beats.forEach((beat, index) => {
      const actorIds = [
        ...(beat.participants.fighters?.map(f => f.id) ?? []),
        ...(beat.participants.bombers?.map(f => f.id) ?? [])
      ];
      logAirShowBeatStart(packageId, index, beat.type, actorIds);

      // Detailed debug logging behind noisy flag
      debugAirShowPhase(`Beat-${index}`, {
        type: beat.type,
        startMs: beat.startMs,
        durationMs: beat.durationMs,
        fighters: beat.participants.fighters?.length ?? 0,
        bombers: beat.participants.bombers?.length ?? 0,
        tracers: beat.actions.tracers?.length ?? 0,
        flakBursts: beat.actions.flakBursts?.length ?? 0,
        destroyed: beat.actions.destroyed?.length ?? 0,
        hasBombDrop: !!beat.actions.bombDrop
      });
    });

    // TODO Phase 0.3: Create sprite elements for all participants
    // TODO Phase 0.4: Implement spatial zone update functions (combat volume vs bomber corridor)
    // TODO Phase 1-6: Implement beat execution with proper rendering
    // TODO Phase 7: Remove old animateResolvedAirCombatShow after validation

    // For now, wait for the total duration to simulate the animation timeline
    await new Promise((resolve) => setTimeout(resolve, scene.totalDurationMs));

    // Determine outcome based on surviving actors
    const survivingIds = Array.from(allParticipants.values())
      .filter(f => f.id) // All survive in Phase 0 stub
      .map(f => f.id);
    const destroyedIds: string[] = []; // None destroyed in stub

    logAirShowPackageEnd(packageId, "success", survivingIds, destroyedIds, true);
  }

  /**
   * Convenience helper for mission-style flights that should clearly depart and return.
   * Flies an arc from origin to destination, pauses briefly, then flies a mirrored arc back.
   */
  async animateAircraftRoundTrip(
    fromKey: string,
    toKey: string,
    scenarioType: string,
    legDurationMs = 2200,
    pauseMs = 300,
    strength?: number,
    laneOffsetPx = 0,
    faction?: SpriteRenderFaction,
    role: AirShowRole = "interceptor"
  ): Promise<void> {
    await this.animateAircraftArc(fromKey, toKey, scenarioType, legDurationMs, undefined, 1, strength, laneOffsetPx, faction, role);
    if (pauseMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, pauseMs));
    }
    await this.animateAircraftArc(toKey, fromKey, scenarioType, legDurationMs, undefined, 1, strength, laneOffsetPx, faction, role);
  }

  /**
   * Flies a single persistent aircraft ghost through ingress, target pass, and egress without despawning
   * between legs. This keeps strike sorties visually continuous while still allowing BattleScreen to hook
   * flak, impact, and smoke effects into precise phases of the run.
   */
  async animateAircraftSortie(
    fromKey: string,
    targetKey: string,
    returnKey: string,
    scenarioType: string,
    options: AircraftSortieOptions = {}
  ): Promise<void> {
    if (!this.svgElement) {
      console.warn("[HexMapRenderer] animateAircraftSortie skipped: no SVG element available", {
        fromKey,
        targetKey,
        returnKey,
        scenarioType
      });
      return;
    }

    const fromCell = this.hexElementMap.get(fromKey);
    const targetCell = this.hexElementMap.get(targetKey);
    const returnCell = this.hexElementMap.get(returnKey);
    if (!fromCell || !targetCell || !returnCell) {
      console.warn("[HexMapRenderer] animateAircraftSortie skipped: missing hex cell(s)", {
        fromKey,
        targetKey,
        returnKey,
        scenarioType,
        hasFrom: !!fromCell,
        hasTarget: !!targetCell,
        hasReturn: !!returnCell
      });
      return;
    }

    const startCenter = this.extractHexCenter(fromCell);
    const targetCenter = this.extractHexCenter(targetCell);
    const returnCenter = this.extractHexCenter(returnCell);
    if (!startCenter || !targetCenter || !returnCenter) {
      console.warn("[HexMapRenderer] animateAircraftSortie skipped: missing hex center(s)", {
        fromKey,
        targetKey,
        returnKey,
        scenarioType,
        hasStartCenter: !!startCenter,
        hasTargetCenter: !!targetCenter,
        hasReturnCenter: !!returnCenter
      });
      return;
    }

    const spriteHref = getSpriteForScenarioType(scenarioType, options.faction);
    if (!spriteHref) {
      console.error("[HexMapRenderer] animateAircraftSortie skipped: missing sprite mapping for scenarioType", {
        fromKey,
        targetKey,
        returnKey,
        scenarioType
      });
      return;
    }

    const iconSize = HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE;
    const ghost = this.createAircraftFormationGhost(spriteHref, iconSize, options.strength, options.role ?? "interceptor");
    const isFormation = ghost instanceof SVGGElement;
    const layer = this.ensureCombatEffectsLayer();
    if (!layer) {
      console.error("[HexMapRenderer] animateAircraftSortie skipped: missing combat effects layer", {
        fromKey,
        targetKey,
        returnKey,
        scenarioType
      });
      return;
    }

    const rawDx = targetCenter.cx - startCenter.cx;
    const rawDy = targetCenter.cy - startCenter.cy;
    const rawDistance = Math.max(1, Math.hypot(rawDx, rawDy));
    const nx = -rawDy / rawDistance;
    const ny = rawDx / rawDistance;
    const laneOffsetPx = options.laneOffsetPx ?? 0;
    const shiftedStart = { cx: startCenter.cx + nx * laneOffsetPx, cy: startCenter.cy + ny * laneOffsetPx };
    const shiftedTarget = { cx: targetCenter.cx + nx * laneOffsetPx, cy: targetCenter.cy + ny * laneOffsetPx };
    const shiftedReturn = { cx: returnCenter.cx + nx * laneOffsetPx, cy: returnCenter.cy + ny * laneOffsetPx };

    const ingressDurationMs = Math.max(0, options.ingressDurationMs ?? 2300);
    const egressDurationMs = Math.max(0, options.egressDurationMs ?? 1900);
    const totalDurationMs = Math.max(1, ingressDurationMs + egressDurationMs);
    const ingressDistance = Math.max(1, Math.hypot(shiftedTarget.cx - shiftedStart.cx, shiftedTarget.cy - shiftedStart.cy));
    const egressDistance = Math.max(1, Math.hypot(shiftedReturn.cx - shiftedTarget.cx, shiftedReturn.cy - shiftedTarget.cy));
    const ingressDirection = this.normalizeAircraftVector(
      shiftedTarget.cx - shiftedStart.cx,
      shiftedTarget.cy - shiftedStart.cy,
      1,
      0
    );
    const egressDirection = this.normalizeAircraftVector(
      shiftedReturn.cx - shiftedTarget.cx,
      shiftedReturn.cy - shiftedTarget.cy,
      -ingressDirection.x,
      -ingressDirection.y
    );
    const turnDirection = this.resolveAircraftSortieTurnVector(ingressDirection, egressDirection, laneOffsetPx);
    const ingressTangent = {
      dx: ingressDirection.x * ingressDistance * 0.88,
      dy: ingressDirection.y * ingressDistance * 0.88
    };
    const sharedTurnSpeed =
      Math.min(
        ingressDistance / Math.max(1, ingressDurationMs || 1),
        egressDistance / Math.max(1, egressDurationMs || 1)
      ) * 0.92;
    const targetIngressTangent = {
      dx: turnDirection.x * sharedTurnSpeed * Math.max(1, ingressDurationMs || 1),
      dy: turnDirection.y * sharedTurnSpeed * Math.max(1, ingressDurationMs || 1)
    };
    const targetEgressTangent = {
      dx: turnDirection.x * sharedTurnSpeed * Math.max(1, egressDurationMs || 1),
      dy: turnDirection.y * sharedTurnSpeed * Math.max(1, egressDurationMs || 1)
    };
    const egressTangent = {
      dx: egressDirection.x * egressDistance * 0.88,
      dy: egressDirection.y * egressDistance * 0.88
    };
    let lastHeadingDegrees = this.resolveAircraftHeadingDegrees(ingressDirection.x, ingressDirection.y);
    let targetPassTriggered = false;
    let targetPassError: unknown = null;
    let targetPassPromise: Promise<void> | null = null;
    const triggerTargetPass = (centerX: number, centerY: number): void => {
      if (targetPassTriggered) {
        return;
      }
      targetPassTriggered = true;
      try {
        targetPassPromise = Promise.resolve(options.onTargetPass?.(centerX, centerY)).catch((error) => {
          targetPassError = error;
        });
      } catch (error) {
        targetPassError = error;
        targetPassPromise = Promise.resolve();
      }
    };

    layer.appendChild(ghost);
    this.positionAircraftGhost(ghost, isFormation, iconSize, shiftedStart.cx, shiftedStart.cy, lastHeadingDegrees);

    try {
      await new Promise<void>((resolve) => {
        const startTime = performance.now();
        const step: FrameRequestCallback = (now) => {
          const elapsed = Math.min(totalDurationMs, Math.max(0, now - startTime));
          const inIngress = ingressDurationMs > 0 && (egressDurationMs <= 0 || elapsed <= ingressDurationMs);
          let centerX = shiftedTarget.cx;
          let centerY = shiftedTarget.cy;
          let tangentX = targetIngressTangent.dx;
          let tangentY = targetIngressTangent.dy;

          if (inIngress || egressDurationMs <= 0) {
            const ingressProgress = ingressDurationMs <= 0 ? 1 : elapsed / Math.max(1, ingressDurationMs);
            const point = this.interpolateAircraftHermitePoint(
              shiftedStart,
              shiftedTarget,
              ingressTangent,
              targetIngressTangent,
              ingressProgress
            );
            const tangent = this.interpolateAircraftHermiteDerivative(
              shiftedStart,
              shiftedTarget,
              ingressTangent,
              targetIngressTangent,
              ingressProgress
            );
            centerX = point.cx;
            centerY = point.cy;
            tangentX = tangent.dx;
            tangentY = tangent.dy;
            options.onIngressProgress?.(ingressProgress, centerX, centerY);
            if (!targetPassTriggered && ingressProgress >= 1) {
              triggerTargetPass(centerX, centerY);
            }
          } else {
            if (!targetPassTriggered) {
              triggerTargetPass(shiftedTarget.cx, shiftedTarget.cy);
            }
            const egressProgress = (elapsed - ingressDurationMs) / Math.max(1, egressDurationMs);
            const point = this.interpolateAircraftHermitePoint(
              shiftedTarget,
              shiftedReturn,
              targetEgressTangent,
              egressTangent,
              egressProgress
            );
            const tangent = this.interpolateAircraftHermiteDerivative(
              shiftedTarget,
              shiftedReturn,
              targetEgressTangent,
              egressTangent,
              egressProgress
            );
            centerX = point.cx;
            centerY = point.cy;
            tangentX = tangent.dx;
            tangentY = tangent.dy;
            options.onEgressProgress?.(egressProgress, centerX, centerY);
          }

          lastHeadingDegrees = this.resolveAircraftHeadingDegrees(tangentX, tangentY, lastHeadingDegrees);
          this.positionAircraftGhost(ghost, isFormation, iconSize, centerX, centerY, lastHeadingDegrees);

          if (elapsed >= totalDurationMs) {
            if (!targetPassTriggered) {
              triggerTargetPass(shiftedTarget.cx, shiftedTarget.cy);
            }
            resolve();
            return;
          }

          this.scheduleAnimationFrame(step);
        };
        this.scheduleAnimationFrame(step);
      });

      if (targetPassPromise) {
        await targetPassPromise;
      }
      if (targetPassError) {
        throw targetPassError;
      }
    } finally {
      ghost.remove();
    }
  }

  /** Plays a brief tracer effect at the given hex key to indicate aerial gunfire. */
  async playDogfight(hexKey: string): Promise<void> {
    const effectsLayer = this.ensureCombatEffectsLayer();
    const hexElement = this.hexElementMap.get(hexKey);
    const center = hexElement ? this.extractHexCenter(hexElement) : null;
    if (!effectsLayer || !center) {
      return;
    }

    const burstGroup = document.createElementNS(SVG_NS, "g");
    burstGroup.classList.add("air-dogfight-burst");
    burstGroup.style.pointerEvents = "none";
    effectsLayer.appendChild(burstGroup);

    const tracerCount = 18;
    const burstCount = 16;
    const tracerLifetimeMs = 420;
    const burstLifetimeMs = 460;

    const scheduleCleanup = (node: SVGElement, delayMs: number) => {
      window.setTimeout(() => node.remove(), delayMs);
    };

    for (let index = 0; index < tracerCount; index += 1) {
      const ringAngle = (index / tracerCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.28;
      const orbitRadius = 10 + Math.random() * 18;
      const tracerAngle = ringAngle + (Math.random() - 0.5) * 1.1;
      const tracerLength = 8 + Math.random() * 7;
      const cx = center.cx + Math.cos(ringAngle) * orbitRadius;
      const cy = center.cy + Math.sin(ringAngle) * orbitRadius * 0.72;
      const x1 = cx - Math.cos(tracerAngle) * tracerLength * 0.5;
      const y1 = cy - Math.sin(tracerAngle) * tracerLength * 0.5;
      const x2 = cx + Math.cos(tracerAngle) * tracerLength * 0.5;
      const y2 = cy + Math.sin(tracerAngle) * tracerLength * 0.5;
      const dashGap = tracerLength + 8;
      const tracerDelayMs = index * 16;

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("stroke", index % 3 === 0 ? "#fff7d9" : index % 2 === 0 ? "#ffd68c" : "#ffb14f");
      line.setAttribute("stroke-width", String(index % 4 === 0 ? 1.1 : 0.92));
      line.setAttribute("stroke-linecap", "round");
      line.style.opacity = "0.18";
      line.style.strokeDasharray = `${Math.max(4, tracerLength * 0.65)} ${dashGap}`;
      line.style.strokeDashoffset = String(dashGap);
      burstGroup.appendChild(line);

      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          line.style.transition = `stroke-dashoffset ${tracerLifetimeMs}ms linear, opacity ${Math.max(90, tracerLifetimeMs - 40)}ms ease-out`;
          line.style.opacity = "0.98";
          line.style.strokeDashoffset = "0";
        });
      }, tracerDelayMs);
      window.setTimeout(() => {
        line.style.opacity = "0";
      }, tracerDelayMs + Math.max(90, tracerLifetimeMs - 40));
      scheduleCleanup(line, tracerDelayMs + tracerLifetimeMs + 60);
    }

    for (let index = 0; index < burstCount; index += 1) {
      const angle = (index / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const radius = 8 + Math.random() * 16;
      const x = center.cx + Math.cos(angle) * radius;
      const y = center.cy + Math.sin(angle) * radius * 0.74;
      const flashDelayMs = 18 + index * 14;

      const cluster = document.createElementNS(SVG_NS, "g");
      cluster.setAttribute("transform", `translate(${x},${y})`);
      cluster.style.opacity = "0";

      const flash = document.createElementNS(SVG_NS, "circle");
      flash.setAttribute("cx", "0");
      flash.setAttribute("cy", "0");
      flash.setAttribute("r", String(0.95 + Math.random() * 1.2));
      flash.setAttribute("fill", index % 3 === 0 ? "#fff6cf" : "#ffce74");
      flash.setAttribute("opacity", "0.92");
      cluster.appendChild(flash);

      const puff = document.createElementNS(SVG_NS, "ellipse");
      puff.setAttribute("cx", String((Math.random() - 0.5) * 1.8));
      puff.setAttribute("cy", String(0.8 + Math.random() * 1.8));
      puff.setAttribute("rx", String(1.8 + Math.random() * 1.8));
      puff.setAttribute("ry", String(1.1 + Math.random() * 1.1));
      puff.setAttribute("fill", index % 2 === 0 ? "#d7cab9" : "#bca895");
      puff.setAttribute("opacity", "0.26");
      cluster.appendChild(puff);

      burstGroup.appendChild(cluster);
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          cluster.style.transition = `opacity ${burstLifetimeMs}ms ease-out`;
          cluster.style.opacity = "1";
        });
      }, flashDelayMs);
      window.setTimeout(() => {
        cluster.style.opacity = "0";
      }, flashDelayMs + 70);
      scheduleCleanup(cluster, flashDelayMs + burstLifetimeMs + 70);
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        burstGroup.remove();
        resolve();
      }, 620);
    });
  }

  /** Plays a distinct defensive-gunner burst so bomber return fire reads separately from a dogfight. */
  async playBomberDefensePass(hexKey: string): Promise<void> {
    const effectsLayer = this.ensureCombatEffectsLayer();
    const hexElement = this.hexElementMap.get(hexKey);
    const center = hexElement ? this.extractHexCenter(hexElement) : null;
    if (!effectsLayer || !center) {
      return;
    }

    const burstGroup = document.createElementNS(SVG_NS, "g");
    burstGroup.classList.add("air-bomber-defense-burst");
    burstGroup.style.pointerEvents = "none";
    effectsLayer.appendChild(burstGroup);

    const tracerCount = 12;
    const flashCount = 10;
    const tracerLifetimeMs = 520;
    const flashLifetimeMs = 420;

    const scheduleCleanup = (node: SVGElement, delayMs: number) => {
      window.setTimeout(() => node.remove(), delayMs);
    };

    for (let index = 0; index < tracerCount; index += 1) {
      const laneBias = (index / Math.max(1, tracerCount - 1) - 0.5) * 20;
      const startX = center.cx - 12 + Math.random() * 8;
      const startY = center.cy + laneBias * 0.35;
      const endX = center.cx + 24 + Math.random() * 18;
      const endY = center.cy + laneBias * 0.9 + (Math.random() - 0.5) * 8;
      const tracerDelayMs = index * 22;

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(startX));
      line.setAttribute("y1", String(startY));
      line.setAttribute("x2", String(endX));
      line.setAttribute("y2", String(endY));
      line.setAttribute("stroke", index % 2 === 0 ? "#ffd68c" : "#fff5cf");
      line.setAttribute("stroke-width", index % 3 === 0 ? "1.4" : "1.05");
      line.setAttribute("stroke-linecap", "round");
      line.style.opacity = "0.12";
      line.style.strokeDasharray = "10 28";
      line.style.strokeDashoffset = "28";
      burstGroup.appendChild(line);

      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          line.style.transition = `stroke-dashoffset ${tracerLifetimeMs}ms linear, opacity ${Math.max(120, tracerLifetimeMs - 80)}ms ease-out`;
          line.style.opacity = "0.96";
          line.style.strokeDashoffset = "0";
        });
      }, tracerDelayMs);
      window.setTimeout(() => {
        line.style.opacity = "0";
      }, tracerDelayMs + Math.max(120, tracerLifetimeMs - 90));
      scheduleCleanup(line, tracerDelayMs + tracerLifetimeMs + 70);
    }

    for (let index = 0; index < flashCount; index += 1) {
      const flashDelayMs = 12 + index * 24;
      const x = center.cx - 6 + Math.random() * 14;
      const y = center.cy - 10 + Math.random() * 20;

      const flash = document.createElementNS(SVG_NS, "circle");
      flash.setAttribute("cx", String(x));
      flash.setAttribute("cy", String(y));
      flash.setAttribute("r", String(1.2 + Math.random() * 1.6));
      flash.setAttribute("fill", index % 2 === 0 ? "#fff4c1" : "#ffc76c");
      flash.style.opacity = "0";
      burstGroup.appendChild(flash);

      window.setTimeout(() => {
        flash.style.transition = "opacity 90ms ease-out";
        flash.style.opacity = "0.95";
      }, flashDelayMs);
      window.setTimeout(() => {
        flash.style.transition = `opacity ${flashLifetimeMs}ms ease-out`;
        flash.style.opacity = "0";
      }, flashDelayMs + 90);
      scheduleCleanup(flash, flashDelayMs + flashLifetimeMs + 120);
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        burstGroup.remove();
        resolve();
      }, 760);
    });
  }

  /**
   * Ensures the persistent base camp marker element exists so it can be reused across renders.
   */
  private ensureBaseCampMarker(svg: SVGSVGElement): void {
    const viewportRoot = this.viewportRoot || svg.querySelector("#viewportRoot");
    if (!viewportRoot) {
      console.warn("[HexMapRenderer] Cannot add base camp marker - viewportRoot not found");
      return;
    }

    if (this.baseCampMarker) {
      if (!this.baseCampMarker.isConnected) {
        viewportRoot.appendChild(this.baseCampMarker);
      }
      return;
    }
    const marker = document.createElementNS(SVG_NS, "image");
    marker.classList.add(BASE_CAMP_MARKER_CLASS);
    marker.setAttribute("href", BASE_CAMP_MARKER_SPRITE);
    marker.setAttribute("width", String(BASE_CAMP_MARKER_SIZE));
    marker.setAttribute("height", String(BASE_CAMP_MARKER_SIZE));
    marker.setAttribute("preserveAspectRatio", "xMidYMid slice");
    marker.style.display = "none";
    marker.style.pointerEvents = "none";
    viewportRoot.appendChild(marker);
    this.baseCampMarker = marker;
  }

  /**
   * Positions the base camp marker on the requested hex key so commanders can see the supply origin.
   */
  renderBaseCampMarker(hexKey: string | null): void {
    this.baseCampHexKey = hexKey;
    if (!this.svgElement) {
      // Log when the renderer is asked to draw without an SVG so the caller can diagnose initialization order.
      console.warn("[HexMapRenderer] renderBaseCampMarker skipped: no SVG element available", { hexKey });
      return;
    }
    this.ensureBaseCampMarker(this.svgElement);
    const marker = this.baseCampMarker;
    if (!marker) {
      console.error("[HexMapRenderer] renderBaseCampMarker failed: marker element missing after ensureBaseCampMarker", { hexKey });
      return;
    }

    if (!hexKey) {
      marker.style.display = "none";
      console.log("[HexMapRenderer] Base camp marker hidden", { hexKey });
      return;
    }

    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      console.warn("[HexMapRenderer] Base camp marker cannot find cell", { hexKey, availableKeys: Array.from(this.hexElementMap.keys()) });
      marker.style.display = "none";
      return;
    }

    // Ensure the marker lives inside the target hex group so terrain renders beneath it while unit sprites stay on top.
    const unitGroup = this.hexUnitImageMap.get(hexKey) ?? null;
    if (marker.parentNode !== cell) {
      if (unitGroup && unitGroup.parentNode === cell) {
        cell.insertBefore(marker, unitGroup);
      } else {
        cell.appendChild(marker);
      }
    } else if (unitGroup && marker.nextSibling !== unitGroup) {
      // Maintain ordering when units re-render after the marker has already been attached.
      cell.insertBefore(marker, unitGroup);
    }

    const cx = Number(cell.dataset.cx ?? NaN);
    const cy = Number(cell.dataset.cy ?? NaN);
    if (Number.isNaN(cx) || Number.isNaN(cy)) {
      console.warn("[HexMapRenderer] Base camp marker missing coordinate dataset", { hexKey, dataset: cell.dataset });
      marker.style.display = "none";
      return;
    }

    const halfSize = BASE_CAMP_MARKER_SIZE / 2;
    marker.setAttribute("x", String(cx - halfSize));
    marker.setAttribute("y", String(cy - halfSize));
    marker.style.display = "block";
    console.log("[HexMapRenderer] Base camp marker positioned", { hexKey, cx, cy, size: BASE_CAMP_MARKER_SIZE });
  }

  /**
   * Allows callers to register a selection changed handler that receives the hex key.
   */
  onSelectionChanged(handler: (key: string | null) => void): void {
    this.selectionChangedHandler = handler;
  }

  /**
   * Toggles the animated selection glow independently of the core selection routine so the UI can
   * emphasize the current hex without re-triggering renderer callbacks.
   * @param shouldShow - Whether the glow should be visible.
   * @param hexKey - Optional hex key to reposition the glow when showing it.
   */
  toggleSelectionGlow(shouldShow: boolean, hexKey?: string): void {
    if (!shouldShow || !hexKey) {
      this.hideSelectionGlow();
      return;
    }

    if (!this.selectionGlow && this.svgElement) {
      this.ensureSelectionGlow(this.svgElement);
    }

    this.positionSelectionGlow(hexKey);
  }

  /**
   * Recenters the scrollable viewport on the requested hex so upcoming animations begin in frame.
   * The method gracefully exits when DOM references are missing to avoid breaking existing flows.
   */
  focusOnHex(hexKey: string, options?: { behavior?: ScrollBehavior; padding?: number }): void {
    const canvas = this.canvasElement;
    const cell = this.hexElementMap.get(hexKey);
    if (!canvas || !cell) {
      return;
    }

    const viewport = canvas.parentElement;
    if (!viewport) {
      return;
    }

    const cx = Number(cell.dataset.cx ?? NaN);
    const cy = Number(cell.dataset.cy ?? NaN);
    if (Number.isNaN(cx) || Number.isNaN(cy)) {
      return;
    }

    const behavior = options?.behavior ?? "smooth";
    const padding = options?.padding ?? 0;

    const halfWidth = viewport.clientWidth / 2;
    const halfHeight = viewport.clientHeight / 2;

    const maxLeft = Math.max(0, this.mapPixelWidth - viewport.clientWidth);
    const maxTop = Math.max(0, this.mapPixelHeight - viewport.clientHeight);

    const desiredLeft = this.clamp(cx - halfWidth - padding, 0, maxLeft);
    const desiredTop = this.clamp(cy - halfHeight - padding, 0, maxTop);

    if (typeof viewport.scrollTo === "function") {
      viewport.scrollTo({ left: desiredLeft, top: desiredTop, behavior });
      if (behavior !== "smooth") {
        viewport.scrollLeft = desiredLeft;
        viewport.scrollTop = desiredTop;
      }
      return;
    }

    viewport.scrollLeft = desiredLeft;
    viewport.scrollTop = desiredTop;
  }

  /**
   * Plays a temporary sprite animation that travels from one hex to another.
   * Callers should re-render units once the promise resolves so canonical engine state is reflected.
   */
  async animateUnitMove(fromKey: string, toKey: string, durationMs = 500): Promise<void> {
    if (durationMs < 0) {
      durationMs = 0;
    }

    const handle = this.primeUnitMove(fromKey, toKey);
    if (!handle) {
      return;
    }

    try {
      await handle.play(durationMs);
    } finally {
      handle.dispose();
    }
  }

  /**
   * Prepares the SVG state for a future move animation by hiding the destination sprite and
   * planting a ghost image on the origin hex. Call `play()` on the returned handle once the camera settles.
   */
  primeUnitMove(fromKey: string, toKey: string): MoveAnimationHandle | null {
    const context = this.createMoveAnimationContext(fromKey, toKey);
    if (!context) {
      return null;
    }

    context.setGhostProgress(0);

    let settled = false;
    const finalize = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      this.cleanupMoveGhost(context.ghost, context.movingGroup, context.restoreOpacity);
    };

    return {
      play: async (duration) => {
        if (settled) {
          return;
        }

        if (duration <= 0) {
          context.setGhostProgress(1);
          finalize();
          return;
        }

        await this.runMoveAnimation(context, duration);
        finalize();
      },
      dispose: finalize
    };
  }

  private createMoveAnimationContext(fromKey: string, toKey: string): MoveAnimationContext | null {
    if (!this.svgElement) {
      return null;
    }

    const fromCell = this.hexElementMap.get(fromKey);
    const toCell = this.hexElementMap.get(toKey);
    if (!fromCell || !toCell) {
      return null;
    }

    const startCenter = this.extractHexCenter(fromCell);
    const endCenter = this.extractHexCenter(toCell);
    if (!startCenter || !endCenter) {
      return null;
    }

    const destinationGroup = this.hexUnitImageMap.get(toKey) ?? null;
    const sourceGroup = destinationGroup ?? this.hexUnitImageMap.get(fromKey) ?? null;
    if (!sourceGroup) {
      return null;
    }

    const ghost = sourceGroup.cloneNode(true) as SVGGElement;
    ghost.classList.add("unit-move-ghost");
    ghost.querySelectorAll("image").forEach((node) => node.classList.add("unit-move-ghost"));
    ghost.style.pointerEvents = "none";
    ghost.style.transition = "";
    ghost.style.transform = "";
    this.positionUnitStack(ghost, startCenter.cx, startCenter.cy);

    let movingGroup = destinationGroup;
    if (!movingGroup) {
      const originGroup = this.hexUnitImageMap.get(fromKey) ?? null;
      if (!originGroup) {
        ghost.remove();
        return null;
      }
      const clone = originGroup.cloneNode(true) as SVGGElement;
      this.positionUnitStack(clone, endCenter.cx, endCenter.cy);
      toCell.appendChild(clone);
      this.hexUnitImageMap.set(toKey, clone);
      this.hexUnitImageMap.delete(fromKey);
      originGroup.remove();
      movingGroup = clone;
    }

    const restoreOpacity = movingGroup.style.opacity || "";
    movingGroup.style.opacity = "0";
    const effectsLayer = this.ensureCombatEffectsLayer();
    if (effectsLayer) {
      effectsLayer.appendChild(ghost);
    } else {
      this.svgElement.appendChild(ghost);
    }

    const dx = endCenter.cx - startCenter.cx;
    const dy = endCenter.cy - startCenter.cy;
    const angleDeg = this.resolveAngleDegFromVector(dx, dy);
    this.applyFacingAngleToGroup(ghost, startCenter.cx, startCenter.cy, angleDeg);
    this.applyFacingAngleToGroup(movingGroup, endCenter.cx, endCenter.cy, angleDeg);
    if (fromKey !== toKey) {
      this.hexUnitFacingAngleMap.delete(fromKey);
    }
    this.hexUnitFacingAngleMap.set(toKey, angleDeg);
    const setGhostProgress = (progress: number): void => {
      ghost.style.transform = `translate(${dx * progress}px, ${dy * progress}px)`;
    };

    return {
      ghost,
      movingGroup,
      restoreOpacity,
      setGhostProgress
    };
  }

  private runMoveAnimation(context: MoveAnimationContext, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const step = (timestamp: number): void => {
        const elapsed = timestamp - startTime;
        const rawProgress = elapsed / durationMs;
        const clamped = rawProgress >= 1 ? 1 : rawProgress;
        const eased = this.easeInOut(clamped);
        context.setGhostProgress(eased);

        if (clamped >= 1) {
          resolve();
          return;
        }

        this.scheduleAnimationFrame(step);
      };

      this.scheduleAnimationFrame(step);
    });
  }

  private async playArcedProjectile(
    attackerHexKey: string,
    defenderHexKey: string,
    durationMs = 520,
    options?: { color?: string; radius?: number; arcHeight?: number }
  ): Promise<void> {
    const layer = this.ensureCombatEffectsLayer();
    if (!this.svgElement || !layer) {
      return;
    }

    const attackerCell = this.hexElementMap.get(attackerHexKey);
    const defenderCell = this.hexElementMap.get(defenderHexKey);
    if (!attackerCell || !defenderCell) {
      return;
    }
    const a = this.extractHexCenter(attackerCell);
    const b = this.extractHexCenter(defenderCell);
    if (!a || !b) {
      return;
    }

    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const dist = Math.hypot(dx, dy) || 1;

    const arcHeight = options?.arcHeight ?? this.clamp(dist * 0.35, 18, 64);
    const nx = -dy / dist;
    const ny = dx / dist;
    const ctrlX = (a.cx + b.cx) / 2 + nx * arcHeight;
    const ctrlY = (a.cy + b.cy) / 2 + ny * arcHeight;

    const color = options?.color ?? "#ffcf5a";
    const radius = options?.radius ?? 3;

    const shell = document.createElementNS(SVG_NS, "circle");
    shell.setAttribute("r", String(radius));
    shell.setAttribute("fill", color);
    shell.style.pointerEvents = "none";
    layer.appendChild(shell);

    const startTime = performance.now();
    return new Promise((resolve) => {
      const step = (timestamp: number): void => {
        const elapsed = timestamp - startTime;
        const t = this.clamp(elapsed / durationMs, 0, 1);
        const eased = this.easeInOut(t);

        const omt = 1 - eased;
        const x = omt * omt * a.cx + 2 * omt * eased * ctrlX + eased * eased * b.cx;
        const y = omt * omt * a.cy + 2 * omt * eased * ctrlY + eased * eased * b.cy;
        shell.setAttribute("cx", String(x));
        shell.setAttribute("cy", String(y));

        if (t >= 1) {
          shell.remove();
          resolve();
          return;
        }

        this.scheduleAnimationFrame(step);
      };

      this.scheduleAnimationFrame(step);
    });
  }

  /**
   * Renders the complete hex map into SVG.
   */
  render(svg: SVGSVGElement, canvas: HTMLDivElement, data: ScenarioData): void {
    this.svgElement = svg;
    this.canvasElement = canvas;
    this.scenarioData = data;
    const previousCombatEffectsLayer = this.combatEffectsLayer;
    const previousCombatAnimationOverlay = this.combatAnimationOverlay;

    // Reset combat overlay each render because assigning innerHTML clears prior nodes.
    this.combatEffectsLayer = null;
    this.queuedTargetMarkerLayer = null;

    // Clear any cached unit occupancy metadata (unit icons are rebuilt by BattleScreen after re-render).
    // Keeping stale entries can cause attack effects to use the wrong style for an empty tile.
    this.hexUnitClassMap.clear();
    this.hexUnitScenarioTypeMap.clear();

    const margin = HEX_RADIUS * 2;
    const hexes: Array<{
      tile: TileDetails;
      x: number;
      y: number;
      col: number;
      row: number;
      recon: ReconStatusKey;
    }> = [];

    const previousSelection = this.highlightedHexKey;
    const previousZoneKeys = new Set(this.activeZoneKeys);
    const previousMoveOptionKeys = new Set(this.moveOptionHighlightKeys);
    const previousAttackTargetKeys = new Set(this.attackTargetHighlightKeys);

    this.resetReconOverlayState();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    // Process all tiles and calculate bounds
    data.tiles.forEach((rowTiles, rowIndex) => {
      rowTiles.forEach((entry, columnIndex) => {
        const tile = CoordinateSystem.resolveTile(entry, data.tilePalette);
        if (!tile) {
          return;
        }

        const { q, r } = CoordinateSystem.offsetToAxial(columnIndex, rowIndex);
        const { x, y } = CoordinateSystem.axialToPixel(q, r);

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        const reconStatus = this.normalizeReconStatus(tile.recon);
        const hexKey = CoordinateSystem.makeHexKey(columnIndex, rowIndex);
        this.trackHexReconStatus(hexKey, reconStatus);
        hexes.push({ tile, x, y, col: columnIndex, row: rowIndex, recon: reconStatus });
      });
    });

    if (hexes.length === 0) {
      svg.innerHTML = "";
      return;
    }

    // Calculate map dimensions
    const mapWidth = maxX - minX + margin * 2;
    const mapHeight = maxY - minY + margin * 2;

    this.mapPixelWidth = mapWidth;
    this.mapPixelHeight = mapHeight;

    canvas.style.width = `${mapWidth}px`;
    canvas.style.height = `${mapHeight}px`;
    svg.setAttribute("viewBox", `0 0 ${mapWidth} ${mapHeight}`);
    svg.setAttribute("width", `${mapWidth}`);
    svg.setAttribute("height", `${mapHeight}`);

    // Generate SVG markup for all hexes
    const hexMarkup = hexes.map((hex) => this.renderHex(hex, minX, minY, margin, data)).join("");

    // CRITICAL: Preserve viewportRoot across renders to maintain camera transform state
    // Query or create viewportRoot - NEVER replace it once it exists
    let viewportRoot = svg.querySelector("#viewportRoot") as SVGGElement | null;
    let needsInitialization = false;

    if (!viewportRoot) {
      // First render: create the persistent viewportRoot structure
      const markup = `
        <defs id="battleDefs"></defs>
        <g id="viewportRoot">
          <g class="combat-effects-layer" data-debug="combat-effects-layer"></g>
        </g>
      `;
      svg.innerHTML = markup;
      viewportRoot = svg.querySelector("#viewportRoot") as SVGGElement;
      needsInitialization = true;
      console.log("[HexMapRenderer] viewportRoot created for first time");
    }

    if (!viewportRoot) {
      console.error("[HexMapRenderer] CRITICAL: viewportRoot creation failed");
      return;
    }

    // Update hex content while preserving viewportRoot element itself
    // Find or create effects layer, then update hex markup before it
    let effectsLayer = viewportRoot.querySelector(".combat-effects-layer") as SVGGElement | null;
    if (!effectsLayer) {
      effectsLayer = document.createElementNS(SVG_NS, "g");
      effectsLayer.classList.add("combat-effects-layer");
      effectsLayer.setAttribute("data-debug", "combat-effects-layer");
      viewportRoot.appendChild(effectsLayer);
    }

    // Clear old hex content but preserve effects layer
    effectsLayer.remove();
    viewportRoot.innerHTML = hexMarkup;
    viewportRoot.appendChild(effectsLayer);

    this.viewportRoot = viewportRoot;
    console.log("[HexMapRenderer] viewportRoot updated with children:", {
      childCount: this.viewportRoot.children.length,
      hexCount: this.viewportRoot.querySelectorAll('.battle-hex').length,
      preserved: !needsInitialization
    });

    this.ensureSelectionGlow(svg);
    this.cacheHexReferences();
    this.applyReconOverlayClasses();
    this.rebindHexInteractions();

    if (!this.wreckFxRenderer) {
      this.wreckFxRenderer = new WreckFxRenderer(svg, () => getZoomTier(this.getCurrentZoom()));
    } else {
      this.wreckFxRenderer.bindSvg(svg);
    }

    this.rehydrateAftermathOverlays();

    // Get reference to the combat effects layer (now inside viewportRoot)
    this.combatEffectsLayer = this.viewportRoot?.querySelector(".combat-effects-layer") as SVGGElement | null;
    if (!this.combatEffectsLayer) {
      console.error("[HexMapRenderer] CRITICAL: combat-effects-layer not found after render");
    }

    this.combatAnimationOverlay = this.ensureCombatAnimationOverlay();
    this.bindCombatAnimationOverlayTransformObserver();
    this.syncCombatAnimationOverlayLayout();

    if (
      this.combatAnimator &&
      ((previousCombatEffectsLayer && this.combatEffectsLayer && previousCombatEffectsLayer !== this.combatEffectsLayer) ||
        (previousCombatAnimationOverlay && this.combatAnimationOverlay && previousCombatAnimationOverlay !== this.combatAnimationOverlay))
    ) {
      this.combatAnimator.stopAll();
      this.combatAnimator = null;
    }

    // Initialize combat animator with the SVG combat effects layer for procedural effects.
    if (this.combatEffectsLayer && !this.combatAnimator) {
      this.combatAnimator = new ProceduralEffectsAnimator(this.combatEffectsLayer, this.soundManager);
      console.log("[HexMapRenderer] Combat animator initialized with SVG effects layer and sound manager");

      // Load effect specifications, terrain tints, and sound catalog asynchronously (only once)
      if (!HexMapRenderer.effectSpecsLoaded) {
        HexMapRenderer.effectSpecsLoaded = true;
        Promise.all([
          loadEffectSpecifications("data/effectSpecs.json"),
          loadTerrainTints("data/terrainTints.json")
        ]).catch((error) => {
          console.error("[HexMapRenderer] Failed to load effect specifications or terrain tints:", error);
        });
      }

      // Load sound catalog asynchronously (only once)
      if (!this.soundCatalogReady) {
        this.soundCatalogReady = this.soundManager.loadSoundCatalog("data/soundCatalog.json").catch((error) => {
          console.error("[HexMapRenderer] Failed to load sound catalog:", error);
        });
      }
    }

    if (previousSelection) {
      this.highlightedHexKey = null;
      this.applyHexSelection(previousSelection, true);
    }

    this.activeZoneKeys.clear();
    if (previousZoneKeys.size > 0) {
      this.setZoneHighlights(previousZoneKeys);
    }

    this.moveOptionHighlightKeys.clear();
    this.attackTargetHighlightKeys.clear();
    if (previousMoveOptionKeys.size > 0 || previousAttackTargetKeys.size > 0) {
      this.setTacticalHighlights(previousMoveOptionKeys, previousAttackTargetKeys);
    }

    if (this.baseCampHexKey) {
      this.renderBaseCampMarker(this.baseCampHexKey);
    }

    // Effects layer is created once as the last child of viewportRoot, so it's always on top.
    // No need to re-append it.
  }

  private ensureCombatAnimationOverlay(): HTMLDivElement | null {
    if (!this.canvasElement) {
      return null;
    }

    let host = this.canvasElement.querySelector<HTMLDivElement>(".combat-animation-overlay-host");
    if (!host) {
      host = document.createElement("div");
      host.classList.add("combat-animation-overlay-host");
      host.style.position = "absolute";
      host.style.pointerEvents = "none";
      host.style.overflow = "hidden";
      host.style.zIndex = "4";
      this.canvasElement.appendChild(host);
    }

    let overlay = host.querySelector<HTMLDivElement>(".combat-animation-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.classList.add("combat-animation-overlay");
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.transformOrigin = "0 0";
      host.appendChild(overlay);
    }

    this.combatAnimationOverlayHost = host;
    overlay.style.width = `${this.mapPixelWidth}px`;
    overlay.style.height = `${this.mapPixelHeight}px`;
    return overlay;
  }

  private ensureQueuedTargetMarkerLayer(): SVGGElement | null {
    const viewportRoot = this.viewportRoot || this.svgElement?.querySelector("#viewportRoot");
    if (!viewportRoot) {
      return null;
    }
    let layer = this.queuedTargetMarkerLayer;
    if (!layer || !layer.isConnected) {
      layer = viewportRoot.querySelector<SVGGElement>(".queued-target-marker-layer");
    }
    if (!layer) {
      layer = document.createElementNS(SVG_NS, "g");
      layer.classList.add("queued-target-marker-layer");
      layer.style.pointerEvents = "none";
      viewportRoot.appendChild(layer);
    } else if (layer.parentNode !== viewportRoot) {
      viewportRoot.appendChild(layer);
    }
    this.queuedTargetMarkerLayer = layer;
    return layer;
  }

  private buildQueuedTargetMarker(
    marker: BattleTargetMarker,
    cx: number,
    cy: number,
    index: number,
    totalAtHex: number
  ): SVGGElement {
    const { dx, dy } = this.resolveQueuedTargetMarkerOffset(index, totalAtHex);
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("queued-target-marker");
    group.setAttribute("data-marker-id", marker.id);
    group.setAttribute("transform", `translate(${cx + dx} ${cy + dy})`);
    group.style.pointerEvents = marker.interactive ? "all" : "none";
    if (marker.interactive) {
      group.style.cursor = "pointer";
      group.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        document.dispatchEvent(new CustomEvent("battle:targetMarkerClicked", { detail: { markerId: marker.id } }));
      });
    }

    const hitArea = document.createElementNS(SVG_NS, "circle");
    hitArea.setAttribute("cx", "0");
    hitArea.setAttribute("cy", "0");
    hitArea.setAttribute("r", "18");
    hitArea.setAttribute("fill", "rgba(0, 0, 0, 0.001)");
    group.appendChild(hitArea);

    const badge = document.createElementNS(SVG_NS, "circle");
    badge.setAttribute("cx", "0");
    badge.setAttribute("cy", "0");
    badge.setAttribute("r", "14");
    badge.setAttribute("fill", "rgba(12, 16, 22, 0.72)");
    badge.setAttribute("stroke", "rgba(255, 255, 255, 0.3)");
    badge.setAttribute("stroke-width", "1");
    group.appendChild(badge);

    if (marker.icon === "parachute") {
      group.appendChild(this.buildParachuteMarkerShape(marker.accentColor ?? "#f4f1e8"));
    } else {
      group.appendChild(this.buildCrosshairMarkerShape(marker.accentColor ?? "#d7263d"));
    }

    if (marker.tooltip) {
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = marker.tooltip;
      group.appendChild(title);
    }

    return group;
  }

  private buildCrosshairMarkerShape(color: string): SVGGElement {
    const group = document.createElementNS(SVG_NS, "g");
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "0");
    ring.setAttribute("cy", "0");
    ring.setAttribute("r", "9");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", color);
    ring.setAttribute("stroke-width", "2.4");
    group.appendChild(ring);

    const centerDot = document.createElementNS(SVG_NS, "circle");
    centerDot.setAttribute("cx", "0");
    centerDot.setAttribute("cy", "0");
    centerDot.setAttribute("r", "1.8");
    centerDot.setAttribute("fill", color);
    group.appendChild(centerDot);

    [
      { x1: -13, y1: 0, x2: -5, y2: 0 },
      { x1: 5, y1: 0, x2: 13, y2: 0 },
      { x1: 0, y1: -13, x2: 0, y2: -5 },
      { x1: 0, y1: 5, x2: 0, y2: 13 }
    ].forEach((segment) => {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(segment.x1));
      line.setAttribute("y1", String(segment.y1));
      line.setAttribute("x2", String(segment.x2));
      line.setAttribute("y2", String(segment.y2));
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "2.4");
      line.setAttribute("stroke-linecap", "round");
      group.appendChild(line);
    });

    return group;
  }

  private buildParachuteMarkerShape(color: string): SVGGElement {
    const group = document.createElementNS(SVG_NS, "g");
    const canopy = document.createElementNS(SVG_NS, "path");
    canopy.setAttribute("d", "M -10 0 Q 0 -12 10 0 L 8 0 Q 0 -7 -8 0 Z");
    canopy.setAttribute("fill", color);
    canopy.setAttribute("stroke", "#ab2b34");
    canopy.setAttribute("stroke-width", "1.5");
    group.appendChild(canopy);

    [
      { x1: -6, y1: 0, x2: -2, y2: 8 },
      { x1: 0, y1: -2, x2: 0, y2: 8 },
      { x1: 6, y1: 0, x2: 2, y2: 8 }
    ].forEach((segment) => {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(segment.x1));
      line.setAttribute("y1", String(segment.y1));
      line.setAttribute("x2", String(segment.x2));
      line.setAttribute("y2", String(segment.y2));
      line.setAttribute("stroke", "#ab2b34");
      line.setAttribute("stroke-width", "1.4");
      line.setAttribute("stroke-linecap", "round");
      group.appendChild(line);
    });

    const payload = document.createElementNS(SVG_NS, "circle");
    payload.setAttribute("cx", "0");
    payload.setAttribute("cy", "10");
    payload.setAttribute("r", "2.5");
    payload.setAttribute("fill", "#ab2b34");
    group.appendChild(payload);

    return group;
  }

  private resolveQueuedTargetMarkerOffset(index: number, totalAtHex: number): { dx: number; dy: number } {
    if (totalAtHex <= 1) {
      return { dx: 0, dy: 0 };
    }
    const offsets = [
      { dx: -14, dy: -10 },
      { dx: 14, dy: -10 },
      { dx: -10, dy: 12 },
      { dx: 10, dy: 12 }
    ];
    return offsets[index % offsets.length] ?? { dx: 0, dy: 0 };
  }

  private resolveViewportRootMatrix(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    if (!this.viewportRoot) {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    const transformList = (this.viewportRoot as SVGGElement & {
      transform?: { baseVal?: { consolidate?: () => { matrix?: DOMMatrix | SVGMatrix } | null } };
    }).transform;
    const consolidated = transformList?.baseVal?.consolidate?.();
    if (consolidated?.matrix) {
      const { a, b, c, d, e, f } = consolidated.matrix;
      return { a, b, c, d, e, f };
    }

    const transformValue = this.viewportRoot.getAttribute("transform")?.trim() ?? "";
    if (transformValue.length === 0) {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    const translateMatch = transformValue.match(/translate\(\s*(-?\d*\.?\d+)(?:[\s,]+(-?\d*\.?\d+))?\s*\)/i);
    const scaleMatch = transformValue.match(/scale\(\s*(-?\d*\.?\d+)(?:[\s,]+(-?\d*\.?\d+))?\s*\)/i);
    if (!translateMatch || !scaleMatch) {
      throw new Error(`[HexMapRenderer] Unsupported viewportRoot transform for combat animation overlay: ${transformValue}`);
    }

    const translateX = Number(translateMatch[1]);
    const translateY = Number(translateMatch[2] ?? "0");
    const scaleX = Number(scaleMatch[1]);
    const scaleY = Number(scaleMatch[2] ?? scaleMatch[1]);
    if (![translateX, translateY, scaleX, scaleY].every(Number.isFinite)) {
      throw new Error(`[HexMapRenderer] Non-finite viewportRoot transform for combat animation overlay: ${transformValue}`);
    }

    return { a: scaleX, b: 0, c: 0, d: scaleY, e: translateX, f: translateY };
  }

  /**
   * Get current viewport zoom level.
   * Returns the scale component from the viewportRoot transform matrix.
   */
  private getCurrentZoom(): number {
    const matrix = this.resolveViewportRootMatrix();
    return matrix.a; // Scale X component represents zoom level
  }

  private syncCombatAnimationOverlayLayout(): void {
    if (!this.combatAnimationOverlayHost || !this.combatAnimationOverlay || !this.viewportRoot || !this.svgElement || !this.canvasElement) {
      return;
    }

    const svgRect = this.svgElement.getBoundingClientRect();
    const canvasRect = this.canvasElement.getBoundingClientRect();
    const renderScaleX = this.mapPixelWidth > 0 ? svgRect.width / this.mapPixelWidth : 1;
    const renderScaleY = this.mapPixelHeight > 0 ? svgRect.height / this.mapPixelHeight : 1;
    const renderScale = Number.isFinite(renderScaleX) && renderScaleX > 0 ? renderScaleX : Number.isFinite(renderScaleY) && renderScaleY > 0 ? renderScaleY : 1;
    const matrix = this.resolveViewportRootMatrix();

    this.combatAnimationOverlayHost.style.left = `${svgRect.left - canvasRect.left}px`;
    this.combatAnimationOverlayHost.style.top = `${svgRect.top - canvasRect.top}px`;
    this.combatAnimationOverlayHost.style.width = `${svgRect.width}px`;
    this.combatAnimationOverlayHost.style.height = `${svgRect.height}px`;
    this.combatAnimationOverlay.style.transform = `matrix(${matrix.a * renderScale}, ${matrix.b * renderScale}, ${matrix.c * renderScale}, ${matrix.d * renderScale}, ${matrix.e * renderScale}, ${matrix.f * renderScale})`;
  }

  private bindCombatAnimationOverlayTransformObserver(): void {
    this.combatAnimationOverlayObserver?.disconnect();
    this.combatAnimationOverlayObserver = null;

    if (!this.viewportRoot) {
      return;
    }

    if (typeof MutationObserver !== "function") {
      this.syncCombatAnimationOverlayLayout();
      return;
    }

    this.combatAnimationOverlayObserver = new MutationObserver(() => {
      this.syncCombatAnimationOverlayLayout();
    });
    this.combatAnimationOverlayObserver.observe(this.viewportRoot, {
      attributes: true,
      attributeFilter: ["transform"]
    });
  }

  /**
   * Initializes or re-initializes the map.
   */
  initialize(force = false): void {
    if (!this.initialized || force) {
      if (this.svgElement && this.canvasElement && this.scenarioData) {
        this.render(this.svgElement, this.canvasElement, this.scenarioData);
        this.initialized = true;
      }
    }
  }

  /**
   * Enables or mutes combat audio without disturbing the rest of the renderer state.
   */
  setSoundEnabled(enabled: boolean): void {
    this.soundManager.setMasterVolume(enabled ? CombatSoundManager.DEFAULT_MASTER_VOLUME : 0);
  }

  /**
   * Reports whether combat audio is currently enabled.
   */
  isSoundEnabled(): boolean {
    return this.soundManager.getMasterVolume() > 0.001;
  }

  /**
   * Caches DOM references to hex elements.
   */
  cacheHexReferences(): void {
    if (!this.svgElement) {
      return;
    }

    this.hexElementMap.clear();
    this.hexPolygonMap.clear();
    this.hexLabelMap.clear();
    this.hexUnitImageMap.clear();
    this.hexModificationOverlayMap.clear();
    this.hexModificationStateMap.clear();

    this.aftermathByHexKey.forEach((entry) => {
      entry.group = null;
    });

    const hexCells = Array.from(this.svgElement.querySelectorAll<SVGGElement>(".hex-cell"));

    hexCells.forEach((cell) => {
      const hexKey = cell.dataset.hex;
      if (!hexKey) {
        return;
      }

      this.hexElementMap.set(hexKey, cell);

      const polygon = cell.querySelector<SVGPolygonElement>("polygon.hex-tile");
      if (polygon) {
        this.hexPolygonMap.set(hexKey, polygon);
      }

      const unitGroup = cell.querySelector<SVGGElement>("g.unit-stack");
      if (unitGroup) {
        this.hexUnitImageMap.set(hexKey, unitGroup);
      }
    });
  }

  private resolveUnitStackCount(strength: number): number {
    const normalized = Math.max(0, Math.min(100, strength));
    return Math.max(1, Math.min(4, Math.ceil(normalized / 25)));
  }

  private resolveUnitStackLayout(
    count: number,
    variant: "diamond" | "corners" = "diamond",
    scaleMultiplier = 1,
    spreadMultiplier = 1
  ): Array<{ ox: number; oy: number; scale: number }> {
    const normalizedCount = Math.max(1, Math.min(4, Math.round(count)));
    const spread = 20 * spreadMultiplier;

    // These scales intentionally change gradually from 4 -> 1 so the last remaining sprite
    // doesn't "pop" larger when the unit takes damage.
    const scaleByCount: Record<number, number> = {
      1: 0.82,
      2: 0.76,
      3: 0.7,
      4: 0.66
    };

    const scale = (scaleByCount[normalizedCount] ?? 0.7) * scaleMultiplier;

    if (normalizedCount <= 1) {
      return variant === "corners"
        ? [{ ox: -spread, oy: -spread, scale }]
        : [{ ox: 0, oy: 0, scale }];
    }

    if (normalizedCount === 2) {
      if (variant === "corners") {
        return [
          { ox: -spread, oy: -spread, scale },
          { ox: spread, oy: -spread, scale }
        ];
      }
      return [
        { ox: -spread, oy: 0, scale },
        { ox: spread, oy: 0, scale }
      ];
    }

    if (normalizedCount === 3) {
      if (variant === "corners") {
        return [
          { ox: -spread, oy: -spread, scale },
          { ox: spread, oy: -spread, scale },
          { ox: -spread, oy: spread, scale }
        ];
      }
      return [
        { ox: 0, oy: -spread, scale },
        { ox: -spread, oy: 0, scale },
        { ox: spread, oy: 0, scale }
      ];
    }

    if (variant === "corners") {
      return [
        { ox: -spread, oy: -spread, scale },
        { ox: spread, oy: -spread, scale },
        { ox: -spread, oy: spread, scale },
        { ox: spread, oy: spread, scale }
      ];
    }

    // Full-strength stacks should read as a "diamond" (rotated square) rather than a square.
    return [
      { ox: 0, oy: -spread, scale },
      { ox: spread, oy: 0, scale },
      { ox: 0, oy: spread, scale },
      { ox: -spread, oy: 0, scale }
    ];
  }

  private resolveStackDecorationAnchor(
    cx: number,
    cy: number,
    variant: "diamond" | "corners",
    stacked: boolean
  ): { cx: number; cy: number } {
    if (!stacked) {
      return { cx, cy };
    }
    return variant === "corners"
      ? { cx: cx + 12, cy: cy + 2 }
      : { cx: cx - 12, cy: cy + 2 };
  }

  private positionUnitStack(group: SVGGElement, cx: number, cy: number): void {
    const images = Array.from(group.querySelectorAll<SVGImageElement>("image.unit-icon"));
    images.forEach((image) => {
      const baseSize = Number(image.dataset.baseSize ?? 40);
      const scale = Number(image.dataset.scale ?? 1);
      const ox = Number(image.dataset.ox ?? 0);
      const oy = Number(image.dataset.oy ?? 0);
      const width = baseSize * scale;
      const height = baseSize * scale;
      image.setAttribute("width", String(width));
      image.setAttribute("height", String(height));
      image.setAttribute("x", String(cx - width / 2 + ox));
      image.setAttribute("y", String(cy - height / 2 + oy));
    });
  }

  private resolveAngleDegFromVector(dx: number, dy: number): number {
    if (dx === 0 && dy === 0) {
      return 0;
    }
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  private normalizeFacing(facing: ScenarioUnit["facing"] | string | null | undefined): ScenarioUnit["facing"] {
    return normalizeFacingDirection(facing);
  }

  private normalizeHexEdgeFacing(facing: HexEdgeFacing | string | null | undefined): HexEdgeFacing | null {
    if (facing === null || facing === undefined) {
      return null;
    }
    return normalizeFacingDirection(facing, "NW");
  }

  private getHexVertices(cx: number, cy: number): Array<{ x: number; y: number }> {
    const halfWidth = HEX_WIDTH / 2;
    return [
      { x: cx, y: cy - HEX_RADIUS },
      { x: cx + halfWidth, y: cy - HEX_RADIUS / 2 },
      { x: cx + halfWidth, y: cy + HEX_RADIUS / 2 },
      { x: cx, y: cy + HEX_RADIUS },
      { x: cx - halfWidth, y: cy + HEX_RADIUS / 2 },
      { x: cx - halfWidth, y: cy - HEX_RADIUS / 2 }
    ];
  }

  private resolveHexEdgeGeometry(cx: number, cy: number, facing: HexEdgeFacing): {
    mid: { x: number; y: number };
    inward: { x: number; y: number };
    angleDeg: number;
    length: number;
  } {
    const vertices = this.getHexVertices(cx, cy);
    const [start, end] = (() => {
      switch (facing) {
        case "NW":
          return [vertices[5]!, vertices[0]!];
        case "NE":
          return [vertices[0]!, vertices[1]!];
        case "E":
          return [vertices[1]!, vertices[2]!];
        case "SE":
          return [vertices[2]!, vertices[3]!];
        case "SW":
          return [vertices[3]!, vertices[4]!];
        case "W":
        default:
          return [vertices[4]!, vertices[5]!];
      }
    })();

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const tangent = { x: dx / length, y: dy / length };
    return {
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      inward: { x: -tangent.y, y: tangent.x },
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
      length
    };
  }

  private appendFortificationPanels(container: SVGElement, totalLength: number): void {
    const panelCount = 3;
    const gap = 3;
    const panelHeight = 6;
    const usableLength = Math.max(18, totalLength);
    const panelWidth = Math.max(5, (usableLength - gap * (panelCount - 1)) / panelCount);
    const stripWidth = panelWidth * panelCount + gap * (panelCount - 1);
    const startX = -stripWidth / 2;

    for (let index = 0; index < panelCount; index += 1) {
      const panel = document.createElementNS(SVG_NS, "rect");
      panel.setAttribute("x", String(startX + index * (panelWidth + gap)));
      panel.setAttribute("y", String(-panelHeight / 2));
      panel.setAttribute("width", String(panelWidth));
      panel.setAttribute("height", String(panelHeight));
      panel.setAttribute("fill", "#050607");
      panel.setAttribute("fill-opacity", "0.2");
      panel.setAttribute("stroke", "#050607");
      panel.setAttribute("stroke-opacity", "0.92");
      panel.setAttribute("stroke-width", "0.9");
      container.appendChild(panel);
    }
  }

  private appendTankTrapPanels(container: SVGElement, totalLength: number): void {
    const trapCount = 3;
    const gap = 6;
    const usableLength = Math.max(18, totalLength);
    const trapWidth = Math.max(6, (usableLength - gap * (trapCount - 1)) / trapCount);
    const stripWidth = trapWidth * trapCount + gap * (trapCount - 1);
    const startX = -stripWidth / 2;

    for (let index = 0; index < trapCount; index += 1) {
      const centerX = startX + index * (trapWidth + gap) + trapWidth / 2;
      [
        { x1: centerX - 4.5, y1: 4.8, x2: centerX + 4.5, y2: -4.8 },
        { x1: centerX - 4.5, y1: -4.8, x2: centerX + 4.5, y2: 4.8 },
        { x1: centerX, y1: -5.6, x2: centerX, y2: 5.6 }
      ].forEach((segment) => {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(segment.x1));
        line.setAttribute("y1", String(segment.y1));
        line.setAttribute("x2", String(segment.x2));
        line.setAttribute("y2", String(segment.y2));
        line.setAttribute("stroke", "#050607");
        line.setAttribute("stroke-width", "1.35");
        line.setAttribute("stroke-linecap", "round");
        container.appendChild(line);
      });
    }
  }

  private resolveFacingAngleDeg(facing: ScenarioUnit["facing"]): number {
    const facingVectors: Record<ScenarioUnit["facing"], { q: number; r: number }> = {
      E: { q: 1, r: 0 },
      NE: { q: 1, r: -1 },
      NW: { q: 0, r: -1 },
      W: { q: -1, r: 0 },
      SW: { q: -1, r: 1 },
      SE: { q: 0, r: 1 }
    };
    const v = facingVectors[facing];
    const origin = CoordinateSystem.axialToPixel(0, 0);
    const p = CoordinateSystem.axialToPixel(v.q, v.r);
    return this.resolveAngleDegFromVector(p.x - origin.x, p.y - origin.y);
  }

  private ensureFacingGroup(group: SVGGElement): SVGGElement {
    const existing = group.querySelector<SVGGElement>("g.unit-stack-facing");
    if (existing) {
      return existing;
    }

    const facingGroup = document.createElementNS(SVG_NS, "g");
    facingGroup.classList.add("unit-stack-facing");
    const images = Array.from(group.childNodes).filter((node): node is SVGImageElement => {
      if (!(node instanceof SVGImageElement)) {
        return false;
      }
      return node.classList.contains("unit-icon");
    });
    images.forEach((img) => facingGroup.appendChild(img));
    group.appendChild(facingGroup);
    return facingGroup;
  }

  private ensureDecorationGroup(group: SVGGElement): SVGGElement {
    const existing = group.querySelector<SVGGElement>("g.unit-stack-decorations");
    if (existing) {
      // Keep status overlays as the last child so pinned/suppressed badges always render above the unit art.
      if (existing.parentNode === group && group.lastElementChild !== existing) {
        group.appendChild(existing);
      }
      return existing;
    }

    const decorationGroup = document.createElementNS(SVG_NS, "g");
    decorationGroup.classList.add("unit-stack-decorations");
    decorationGroup.style.pointerEvents = "none";
    group.appendChild(decorationGroup);
    return decorationGroup;
  }

  private renderUnitDecorations(group: SVGGElement, cx: number, cy: number, unit: ScenarioUnit): void {
    const decorations = this.ensureDecorationGroup(group);
    decorations.replaceChildren();

    const entrenchment = Math.max(0, Math.min(2, Math.round(unit.entrench ?? 0)));
    if (entrenchment > 0) {
      decorations.appendChild(this.renderEntrenchmentPips(cx, cy, entrenchment));
    }

    const suppressorCount = unit.suppressedBy?.length ?? 0;
    const suppressionState = suppressorCount >= 2 ? "pinned" : suppressorCount === 1 ? "suppressed" : "clear";

    // Log suppression state to debug pip visibility
    if (suppressionState !== "clear") {
      console.log("[HexMapRenderer] renderUnitDecorations - unit:", unit.type,
        "unitId:", unit.unitId,
        "suppressedBy:", unit.suppressedBy,
        "suppressorCount:", suppressorCount,
        "suppressionState:", suppressionState,
        "statusPips will include:", suppressionState);
    }

    // Note: suppression/sentry/entrench state is set on the main unit-stack group in renderUnitStack
    // This method only renders visual decorations

    const statusPips: Array<"sentry" | "suppressed" | "pinned"> = [];
    if (unit.onSentry) {
      statusPips.push("sentry");
    }
    if (suppressionState === "suppressed" || suppressionState === "pinned") {
      statusPips.push(suppressionState);
    }

    if (statusPips.length > 0) {
      decorations.appendChild(this.renderStatusPips(cx, cy, statusPips));
    }
  }

  private renderEntrenchmentPips(cx: number, cy: number, entrenchment: number): SVGGElement {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("unit-entrenchment-pips");
    group.setAttribute("data-entrenchment", String(entrenchment));

    const spacing = 10;
    const startX = cx - ((entrenchment - 1) * spacing) / 2;
    const y = cy + 20;
    for (let index = 0; index < entrenchment; index += 1) {
      const x = startX + index * spacing;
      const pip = document.createElementNS(SVG_NS, "path");
      pip.setAttribute("d", `M ${x - 4} ${y + 3} L ${x} ${y - 3} L ${x + 4} ${y + 3}`);
      pip.setAttribute("fill", "none");
      pip.setAttribute("stroke", "#f3d49a");
      pip.setAttribute("stroke-width", "1.9");
      pip.setAttribute("stroke-linecap", "round");
      pip.setAttribute("stroke-linejoin", "round");
      pip.setAttribute("opacity", "0.96");
      group.appendChild(pip);
    }
    return group;
  }

  private renderStatusPips(
    cx: number,
    cy: number,
    statuses: ReadonlyArray<"sentry" | "suppressed" | "pinned">
  ): SVGGElement {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("unit-status-pips");

    const spacing = 12;
    const startX = cx + 12 - ((statuses.length - 1) * spacing) / 2;
    const y = cy - 24;
    statuses.forEach((status, index) => {
      group.appendChild(this.renderStatusPip(startX + index * spacing, y, status));
    });

    return group;
  }

  private renderStatusPip(x: number, y: number, status: "sentry" | "suppressed" | "pinned"): SVGGElement {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("unit-status-pip");
    group.setAttribute("data-status", status);

    // Make sentry pip clickable with pointer cursor
    if (status === "sentry") {
      group.style.cursor = "pointer";
      group.setAttribute("data-clickable", "true");
    }

    const backdrop = document.createElementNS(SVG_NS, "circle");
    backdrop.setAttribute("cx", String(x));
    backdrop.setAttribute("cy", String(y));
    backdrop.setAttribute("r", "5.5");
    backdrop.setAttribute("stroke-width", "1");
    backdrop.setAttribute("opacity", "0.98");

    if (status === "sentry") {
      backdrop.setAttribute("fill", "rgba(41, 66, 82, 0.96)");
      backdrop.setAttribute("stroke", "#b8e6f8");

      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("cx", String(x));
      ring.setAttribute("cy", String(y));
      ring.setAttribute("r", "2.2");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "#e7fbff");
      ring.setAttribute("stroke-width", "1");
      group.appendChild(backdrop);
      group.appendChild(ring);

      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "0.8");
      dot.setAttribute("fill", "#e7fbff");
      group.appendChild(dot);

      const crosshair = document.createElementNS(SVG_NS, "path");
      crosshair.setAttribute(
        "d",
        `M ${x} ${y - 4.2} L ${x} ${y - 2.8} M ${x + 4.2} ${y} L ${x + 2.8} ${y} M ${x} ${y + 4.2} L ${x} ${y + 2.8} M ${x - 4.2} ${y} L ${x - 2.8} ${y}`
      );
      crosshair.setAttribute("fill", "none");
      crosshair.setAttribute("stroke", "#e7fbff");
      crosshair.setAttribute("stroke-width", "0.9");
      crosshair.setAttribute("stroke-linecap", "round");
      group.appendChild(crosshair);
      return group;
    }

    if (status === "suppressed") {
      backdrop.setAttribute("fill", "rgba(133, 95, 26, 0.94)");
      backdrop.setAttribute("stroke", "#ffd37a");
      group.appendChild(backdrop);

      const slash = document.createElementNS(SVG_NS, "path");
      slash.setAttribute("d", `M ${x - 2.6} ${y + 2.1} L ${x + 2.6} ${y - 2.1}`);
      slash.setAttribute("fill", "none");
      slash.setAttribute("stroke", "#fff4cf");
      slash.setAttribute("stroke-width", "1.4");
      slash.setAttribute("stroke-linecap", "round");
      group.appendChild(slash);
      return group;
    }

    backdrop.setAttribute("fill", "rgba(132, 27, 27, 0.94)");
    backdrop.setAttribute("stroke", "#ff9e99");
    group.appendChild(backdrop);

    const cross = document.createElementNS(SVG_NS, "path");
    cross.setAttribute("d", `M ${x - 2.6} ${y - 2.6} L ${x + 2.6} ${y + 2.6} M ${x + 2.6} ${y - 2.6} L ${x - 2.6} ${y + 2.6}`);
    cross.setAttribute("fill", "none");
    cross.setAttribute("stroke", "#fff1ef");
    cross.setAttribute("stroke-width", "1.35");
    cross.setAttribute("stroke-linecap", "round");
    group.appendChild(cross);

    return group;
  }

  private applyFacingAngleToGroup(group: SVGGElement, cx: number, cy: number, angleDeg: number): void {
    const formationGroups = Array.from(group.querySelectorAll<SVGGElement>(":scope > g.unit-stack-formation"));
    if (formationGroups.length > 0) {
      formationGroups.forEach((formationGroup) => this.applyFacingAngleToGroup(formationGroup, cx, cy, angleDeg));
      return;
    }
    const facingGroup = this.ensureFacingGroup(group);
    if (group.dataset.reconStatus === "spotted") {
      facingGroup.setAttribute("transform", `translate(${cx} ${cy}) scale(1 1) translate(${-cx} ${-cy})`);
      return;
    }
    // All unit types use horizontal flip only. Rotating 2D sprites makes them appear
    // tilted/laying down which looks unprofessional. The facing angle determines
    // whether the sprite faces left or right.
    const normalized = ((angleDeg % 360) + 360) % 360;
    const faceLeft = normalized > 90 && normalized < 270;
    const sx = faceLeft ? -1 : 1;
    facingGroup.setAttribute("transform", `translate(${cx} ${cy}) scale(${sx} 1) translate(${-cx} ${-cy})`);
  }

  private setHexFacingAngle(hexKey: string, cx: number, cy: number, angleDeg: number): void {
    this.hexUnitFacingAngleMap.set(hexKey, angleDeg);
    const group = this.hexUnitImageMap.get(hexKey);
    if (group) {
      this.applyFacingAngleToGroup(group, cx, cy, angleDeg);
    }
  }

  /**
   * Rebinds click handlers for hex selection.
   */
  /**
   * Rebinds click handlers for hex selection using event delegation.
   *
   * Uses a single delegated event listener on the parent SVG instead of individual
   * listeners on each hex cell. This is performant and prevents duplicate handler bugs.
   */
  private rebindHexInteractions(): void {
    if (!this.svgElement) {
      return;
    }

    // Remove any existing delegated listener by removing and re-adding it
    // (we store the bound function so removeEventListener works correctly)
    if (this.boundDelegatedClickHandler) {
      this.svgElement.removeEventListener("click", this.boundDelegatedClickHandler);
    }

    // Create and store the bound handler so we can remove it later
    this.boundDelegatedClickHandler = (event: MouseEvent) => {
      if (!this.hexClickHandler) return;

      // Check if the click was on a sentry pip - if so, dispatch a custom event and stop propagation
      const target = event.target as Element;
      const sentryPip = target.closest(".unit-status-pip[data-status='sentry'][data-clickable='true']") as SVGGElement | null;

      if (sentryPip) {
        // Find the hex this sentry pip belongs to
        const hexCell = sentryPip.closest(".hex-cell") as SVGGElement | null;
        if (hexCell && hexCell.dataset.hex) {
          console.log("[HexMapRenderer] Sentry pip clicked on hex:", hexCell.dataset.hex);
          // Broadcast custom event for sentry pip clicks
          document.dispatchEvent(new CustomEvent("battle:sentryPipClicked", { detail: { offsetKey: hexCell.dataset.hex } }));
          event.stopPropagation();
          return;
        }
      }

      // Find the closest .hex-cell ancestor from the click target
      const hexCell = target.closest(".hex-cell") as SVGGElement | null;

      if (!hexCell) return;

      const key = hexCell.dataset.hex;
      if (!key) return;

      this.hexClickHandler(key);
      // Also broadcast a DOM event so non-renderer components (e.g., PopupManager) can react to map picks.
      document.dispatchEvent(new CustomEvent("battle:hexClicked", { detail: { offsetKey: key } }));
    };

    // Add the single delegated listener to the parent SVG
    if (this.hexClickHandler) {
      this.svgElement.addEventListener("click", this.boundDelegatedClickHandler);
    }
  }

  /**
   * Retrieves a cached hex element by key.
   */
  getHexElement(key: string): SVGGElement | undefined {
    return this.hexElementMap.get(key);
  }

  /**
   * Returns the cached center point for a hex in viewport coordinates.
   */
  getHexCenter(key: string): { cx: number; cy: number } | null {
    const cell = this.hexElementMap.get(key);
    if (!cell) {
      return null;
    }
    return this.extractHexCenter(cell);
  }

  /**
   * Returns the viewport root group - the ONLY element that should be transformed for camera pan/zoom.
   * All map content (hexes, units, effects) are children of this group and share its coordinate space.
   */
  getViewportRoot(): SVGGElement | null {
    return this.viewportRoot;
  }

  /**
   * Applies the `.is-selected` class to the requested hex and removes it from any previously
   * highlighted cell. When `silent` is true the selection-changed callback is not fired; this is
   * used internally when rehydrating highlights after a render.
   */
  applyHexSelection(key: string | null, silent = false): void {
    if (this.highlightedHexKey === key) {
      return;
    }

    if (this.highlightedHexKey) {
      this.toggleHexSelectionClass(this.highlightedHexKey, false);
    }

    this.highlightedHexKey = key;

    if (key) {
      this.toggleHexSelectionClass(key, true);
      this.positionSelectionGlow(key);
    } else {
      this.hideSelectionGlow();
    }

    if (!silent) {
      this.selectionChangedHandler?.(this.highlightedHexKey);
    }
  }

  /**
   * Clears any active selection highlight and notifies observers.
   */
  clearSelectionHighlight(): void {
    if (!this.highlightedHexKey) {
      return;
    }
    this.toggleHexSelectionClass(this.highlightedHexKey, false);
    this.highlightedHexKey = null;
    this.hideSelectionGlow();
    this.selectionChangedHandler?.(null);
  }

  private toggleHexSelectionClass(hexKey: string, enabled: boolean): void {
    const group = this.hexElementMap.get(hexKey);
    const polygon = this.hexPolygonMap.get(hexKey);
    if (enabled) {
      group?.classList.add("is-selected");
      polygon?.classList.add("is-selected");
    } else {
      group?.classList.remove("is-selected");
      polygon?.classList.remove("is-selected");
    }
  }

  private ensureSelectionGlow(svg: SVGSVGElement): void {
    if (this.selectionGlow) {
      return;
    }
    const glow = document.createElementNS(SVG_NS, "circle");
    glow.classList.add(SELECTION_GLOW_CLASS);
    // Use the larger of radius/half-width so the glow hugs pointy-top corners instead of stopping short on wide axes.
    const glowRadius = Math.max(HEX_WIDTH / 2, HEX_RADIUS) + 4;
    glow.setAttribute("r", String(glowRadius));
    glow.setAttribute("cx", "0");
    glow.setAttribute("cy", "0");
    glow.style.display = "none";

    // Append to viewportRoot so it moves with pan/zoom
    const viewportRoot = this.viewportRoot || svg.querySelector("#viewportRoot");
    if (viewportRoot) {
      viewportRoot.insertBefore(glow, viewportRoot.firstChild);
    } else {
      console.warn("[HexMapRenderer] Cannot add selection glow - viewportRoot not found");
      svg.insertBefore(glow, svg.firstChild);
    }
    this.selectionGlow = glow;
  }

  private positionSelectionGlow(hexKey: string): void {
    if (!this.selectionGlow) {
      if (!this.svgElement) {
        return;
      }
      this.ensureSelectionGlow(this.svgElement);
    }
    const glow = this.selectionGlow;
    if (!glow) {
      return;
    }
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      glow.style.display = "none";
      return;
    }

    let cx = Number(cell.dataset.cx ?? NaN);
    let cy = Number(cell.dataset.cy ?? NaN);

    if (Number.isNaN(cx) || Number.isNaN(cy)) {
      const polygon = this.hexPolygonMap.get(hexKey);
      if (polygon) {
        const points = polygon.getAttribute("points");
        if (points) {
          const coordinates = points
            .trim()
            .split(/\s+/)
            .map((pair) => pair.split(",").map(Number))
            .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
          if (coordinates.length > 0) {
            const total = coordinates.reduce(
              (accum, [x, y]) => ({ cx: accum.cx + x, cy: accum.cy + y }),
              { cx: 0, cy: 0 }
            );
            cx = total.cx / coordinates.length;
            cy = total.cy / coordinates.length;
          }
        }
      }
    }

    if (Number.isNaN(cx) || Number.isNaN(cy)) {
      glow.style.display = "none";
      return;
    }

    glow.setAttribute("cx", String(cx));
    glow.setAttribute("cy", String(cy));
    glow.style.display = "block";
  }

  /**
   * Hides the selection glow when no hex is active.
   */
  private hideSelectionGlow(): void {
    if (!this.selectionGlow) {
      return;
    }
    this.selectionGlow.style.display = "none";
  }

  /**
   * Marks a collection of hex keys with the `.deployment-zone` class to visualize active zones.
   * Any keys omitted from the new collection have their outline removed.
   */
  setZoneHighlights(keys: Iterable<string>): void {
    const nextKeys = new Set<string>();
    for (const key of keys) {
      nextKeys.add(key);
      if (!this.activeZoneKeys.has(key)) {
        this.toggleZoneOutline(key, true);
      }
    }

    this.activeZoneKeys.forEach((key) => {
      if (!nextKeys.has(key)) {
        this.toggleZoneOutline(key, false);
      }
    });

    this.activeZoneKeys.clear();
    nextKeys.forEach((key) => this.activeZoneKeys.add(key));
  }

  /**
   * Applies distinct highlight classes for reachable movement hexes and valid attack targets.
   * Movement options stay green while hostile targets remain red.
   */
  setTacticalHighlights(moveKeys: Iterable<string>, attackKeys: Iterable<string>): void {
    const nextMoveKeys = new Set(moveKeys);
    const nextAttackKeys = new Set(attackKeys);

    nextMoveKeys.forEach((key) => {
      if (!this.moveOptionHighlightKeys.has(key)) {
        this.toggleHexHighlightClass(key, MOVE_OPTION_HIGHLIGHT_CLASS, true);
      }
    });
    this.moveOptionHighlightKeys.forEach((key) => {
      if (!nextMoveKeys.has(key)) {
        this.toggleHexHighlightClass(key, MOVE_OPTION_HIGHLIGHT_CLASS, false);
      }
    });

    nextAttackKeys.forEach((key) => {
      if (!this.attackTargetHighlightKeys.has(key)) {
        this.toggleHexHighlightClass(key, ATTACK_TARGET_HIGHLIGHT_CLASS, true);
      }
    });
    this.attackTargetHighlightKeys.forEach((key) => {
      if (!nextAttackKeys.has(key)) {
        this.toggleHexHighlightClass(key, ATTACK_TARGET_HIGHLIGHT_CLASS, false);
      }
    });

    this.moveOptionHighlightKeys.clear();
    nextMoveKeys.forEach((key) => this.moveOptionHighlightKeys.add(key));

    this.attackTargetHighlightKeys.clear();
    nextAttackKeys.forEach((key) => this.attackTargetHighlightKeys.add(key));
  }

  clearTacticalHighlights(): void {
    this.setTacticalHighlights([], []);
  }

  /**
   * Applies or removes the idle-unit outline on the specified hex key.
   * The outline uses a dedicated CSS class so the highlight style remains overridable via stylesheets.
   */
  toggleIdleUnitHighlight(hexKey: string, enabled: boolean): void {
    if (enabled) {
      this.toggleHexHighlightClass(hexKey, IDLE_UNIT_HIGHLIGHT_CLASS, true);
      this.idleUnitHighlightKeys.add(hexKey);
    } else {
      this.toggleHexHighlightClass(hexKey, IDLE_UNIT_HIGHLIGHT_CLASS, false);
      this.idleUnitHighlightKeys.delete(hexKey);
    }
  }

  /**
   * Clears all idle-unit outlines so a fresh pass can repaint them.
   */
  clearIdleUnitHighlights(): void {
    this.idleUnitHighlightKeys.forEach((key) => this.toggleIdleUnitHighlight(key, false));
    this.idleUnitHighlightKeys.clear();
  }

  private toggleZoneOutline(hexKey: string, enabled: boolean): void {
    this.toggleHexHighlightClass(hexKey, ACTIVE_ZONE_CLASS, enabled);
  }

  private toggleHexHighlightClass(hexKey: string, className: string, enabled: boolean): void {
    const group = this.hexElementMap.get(hexKey);
    const polygon = this.hexPolygonMap.get(hexKey);
    if (enabled) {
      group?.classList.add(className);
      polygon?.classList.add(className);
    } else {
      group?.classList.remove(className);
      polygon?.classList.remove(className);
    }
  }

  /**
   * Resets stored recon overlay state prior to a re-render.
   */
  resetReconOverlayState(): void {
    this.reconOverlayState.clear();
  }

  /** Removes all debug markers. Intended for temporary diagnostics only. */
  clearDebugMarkers(): void {
    this.debugMarkerMap.forEach((marker) => marker.remove());
    this.debugMarkerMap.clear();
  }

  /** Renders a small marker on the given hex regardless of recon/LOS for diagnostics. */
  renderDebugMarker(hexKey: string, options?: { label?: string; color?: string; opacity?: number }): void {
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      return;
    }

    const existing = this.debugMarkerMap.get(hexKey);
    if (existing) {
      existing.remove();
      this.debugMarkerMap.delete(hexKey);
    }

    const cx = Number(cell.dataset.cx ?? 0);
    const cy = Number(cell.dataset.cy ?? 0);
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("debug-placement-marker");

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(HEX_RADIUS * 0.35));
    circle.setAttribute("fill", options?.color ?? "#ff4d4f");
    circle.setAttribute("opacity", String(options?.opacity ?? 0.45));
    circle.setAttribute("stroke", "#111");
    circle.setAttribute("stroke-width", "1.5");
    group.appendChild(circle);

    const label = options?.label;
    if (label) {
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", String(cx));
      text.setAttribute("y", String(cy + 4));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#fff");
      text.setAttribute("font-size", "10");
      text.setAttribute("font-weight", "700");
      text.textContent = label;
      group.appendChild(text);
    }

    // Append to the SVG so markers share the same coordinate space and stacking as units.
    if (this.svgElement) {
      this.svgElement.appendChild(group);
    } else {
      this.canvasElement?.appendChild(group);
    }
    this.debugMarkerMap.set(hexKey, group);
  }

  /** Removes all objective markers */
  clearObjectiveMarkers(): void {
    this.objectiveMarkerMap.forEach((marker) => marker.remove());
    this.objectiveMarkerMap.clear();
  }

  /**
   * Renders a professional objective marker on the given hex.
   * Uses distinct visual styling with gradients, glows, and animations
   */
  renderObjectiveMarker(hexKey: string, options?: { status?: "unoccupied" | "player" | "enemy"; counter?: string; tooltip?: string }): void {
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      return;
    }

    // Remove existing marker
    const existing = this.objectiveMarkerMap.get(hexKey);
    if (existing) {
      existing.remove();
      this.objectiveMarkerMap.delete(hexKey);
    }

    const cx = Number(cell.dataset.cx ?? 0);
    const cy = Number(cell.dataset.cy ?? 0);
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("objective-marker");

    const status = options?.status ?? "unoccupied";

    // Color scheme based on status with professional gradients
    let primaryColor: string;
    let labelText: string;
    let animationClass: string;

    switch (status) {
      case "player":
        primaryColor = "#22c55e";
        labelText = "SECURED";
        animationClass = "objective-marker--secured";
        break;
      case "enemy":
        primaryColor = "#ef4444";
        labelText = options?.counter ?? "ENEMY";
        animationClass = "objective-marker--enemy";
        break;
      default: // unoccupied
        primaryColor = "#f5c46d";
        labelText = "OBJECTIVE";
        animationClass = "objective-marker--neutral";
    }

    group.classList.add(animationClass);

    // Add SVG native tooltip with detailed information
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = options?.tooltip ?? `Objective: ${labelText}`;
    group.appendChild(title);

    // Subtle marker: just a small circle with thin border
    const markerRadius = 8;
    const markerY = cy - 6;

    // Subtle glow
    const glow = document.createElementNS(SVG_NS, "circle");
    glow.setAttribute("cx", String(cx));
    glow.setAttribute("cy", String(markerY));
    glow.setAttribute("r", String(markerRadius + 4));
    glow.setAttribute("fill", primaryColor);
    glow.setAttribute("opacity", "0.15");
    glow.classList.add("objective-glow");
    group.appendChild(glow);

    // Main marker circle - transparent with colored border
    const marker = document.createElementNS(SVG_NS, "circle");
    marker.setAttribute("cx", String(cx));
    marker.setAttribute("cy", String(markerY));
    marker.setAttribute("r", String(markerRadius));
    marker.setAttribute("fill", "rgba(0, 0, 0, 0.3)");
    marker.setAttribute("stroke", primaryColor);
    marker.setAttribute("stroke-width", "2");
    marker.setAttribute("opacity", "0.7");
    group.appendChild(marker);

    // Small center dot
    const centerDot = document.createElementNS(SVG_NS, "circle");
    centerDot.setAttribute("cx", String(cx));
    centerDot.setAttribute("cy", String(markerY));
    centerDot.setAttribute("r", "2");
    centerDot.setAttribute("fill", primaryColor);
    centerDot.setAttribute("opacity", "0.8");
    group.appendChild(centerDot);

    // Append to viewportRoot so markers pan/zoom with the map
    const viewportRoot = this.viewportRoot || this.svgElement?.querySelector("#viewportRoot");
    if (viewportRoot) {
      viewportRoot.appendChild(group);
    } else if (this.svgElement) {
      this.svgElement.appendChild(group);
    } else {
      this.canvasElement?.appendChild(group);
    }
    this.objectiveMarkerMap.set(hexKey, group);
  }

  /**
   * Creates an SVG path for a 5-pointed star
   */
  private createStarPath(cx: number, cy: number, size: number): string {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? size : size * 0.4;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      points.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
    }
    points.push('Z');
    return points.join(' ');
  }

  /**
   * Tracks recon status for a specific hex so CSS overlays can be applied.
   */
  trackHexReconStatus(key: string, status: ReconStatusKey): void {
    this.reconOverlayState.set(key, status);
  }

  /**
   * Applies recon CSS classes based on cached recon state.
   */
  applyReconOverlayClasses(): void {
    this.reconOverlayState.forEach((status, key) => {
      const element = this.hexElementMap.get(key);
      if (!element) {
        return;
      }
      element.classList.remove("recon-unknown", "recon-spotted", "recon-identified", "recon-visible");
      element.classList.add(`recon-${status}`);
    });
  }

  private isSupplyTruckUnit(unit: ScenarioUnit): boolean {
    return unit.type === "Supply_Truck";
  }

  private resolveRenderableStackMembers(members: readonly RenderedUnitStackMember[]): RenderedUnitStackMember[] {
    const prioritized = [...members].sort((left, right) => {
      const leftConvoy = this.isSupplyTruckUnit(left.unit) ? 1 : 0;
      const rightConvoy = this.isSupplyTruckUnit(right.unit) ? 1 : 0;
      if (leftConvoy !== rightConvoy) {
        return leftConvoy - rightConvoy;
      }
      return (right.unit.strength ?? 0) - (left.unit.strength ?? 0);
    });
    return prioritized.slice(0, 2);
  }

  /**
   * Renders one or two formations on a hex. Additional units are intentionally hidden once the visible cap is
   * reached so stacked combat tiles remain readable.
   */
  renderUnitStack(hexKey: string, members: readonly RenderedUnitStackMember[]): void {
    const cell = this.hexElementMap.get(hexKey);
    const visibleMembers = this.resolveRenderableStackMembers(members).filter((entry) => Boolean(entry.unit));
    if (!cell || visibleMembers.length === 0) {
      return;
    }

    const existingAftermath = this.aftermathByHexKey.get(hexKey);
    if (existingAftermath?.wreck) {
      this.removeAftermathOverlay(hexKey);
    }

    const cx = Number(cell.dataset.cx ?? 0);
    const cy = Number(cell.dataset.cy ?? 0);
    const iconSize = 40;
    const existing = this.hexUnitImageMap.get(hexKey) ?? null;
    if (existing) {
      existing.remove();
      this.hexUnitImageMap.delete(hexKey);
    }

    const primaryMember = visibleMembers[0]!;
    const primaryReconStatus: ReconStatusKey =
      typeof primaryMember.reconStatus === "boolean"
        ? (primaryMember.reconStatus ? "spotted" : "visible")
        : (primaryMember.reconStatus ?? "visible");
    this.hexUnitScenarioTypeMap.set(hexKey, String(primaryMember.unit.type));
    try {
      const def = (unitTypesData as Record<string, UnitTypeDefinition>)[primaryMember.unit.type as string];
      if (def?.class) {
        this.hexUnitClassMap.set(hexKey, def.class);
      }
    } catch {}

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("unit-stack");
    group.dataset.reconStatus = primaryReconStatus;
    group.dataset.stackCount = String(visibleMembers.length);

    visibleMembers.forEach((member, index) => {
      const variant: "diamond" | "corners" = index === 0 ? "diamond" : "corners";
      const reconStatus: ReconStatusKey =
        typeof member.reconStatus === "boolean"
          ? (member.reconStatus ? "spotted" : "visible")
          : (member.reconStatus ?? "visible");
      const spriteHref =
        reconStatus === "spotted" ? UNKNOWN_CONTACT_SPRITE : getSpriteForScenarioType(member.unit.type as string, member.faction);
      const stackCount = this.resolveUnitStackCount(member.unit.strength);
      const layout = this.resolveUnitStackLayout(
        stackCount,
        variant,
        visibleMembers.length > 1 ? 0.74 : 1,
        visibleMembers.length > 1 ? 0.72 : 1
      );
      const formationGroup = document.createElementNS(SVG_NS, "g");
      formationGroup.classList.add("unit-stack-formation");
      formationGroup.dataset.slot = String(index);
      formationGroup.dataset.unitId = member.unit.unitId ?? `${member.unit.type}@${hexKey}:${index}`;
      formationGroup.dataset.faction = member.faction;
      formationGroup.dataset.reconStatus = reconStatus;

      const facingGroup = document.createElementNS(SVG_NS, "g");
      facingGroup.classList.add("unit-stack-facing");
      layout.forEach((spec) => {
        const image = document.createElementNS(SVG_NS, "image");
        if (spriteHref) {
          image.setAttribute("href", spriteHref);
        } else {
          image.removeAttribute("href");
        }
        image.setAttribute("preserveAspectRatio", "xMidYMid meet");
        image.dataset.baseSize = String(iconSize);
        image.dataset.scale = String(spec.scale);
        image.dataset.ox = String(spec.ox);
        image.dataset.oy = String(spec.oy);
        image.classList.add("unit-icon", `faction-${member.faction.toLowerCase()}`);
        image.classList.remove("spotted-only", "recon-identified", "recon-visible");
        image.style.removeProperty("filter");

        if (reconStatus === "spotted") {
          image.style.opacity = "0.94";
          image.classList.add("spotted-only");
        } else if (reconStatus === "identified") {
          image.style.opacity = "0.78";
          image.style.filter = "saturate(0.55) brightness(0.95)";
          image.classList.add("recon-identified");
        } else {
          image.style.removeProperty("opacity");
          image.classList.add("recon-visible");
        }
        facingGroup.appendChild(image);
      });
      formationGroup.appendChild(facingGroup);
      group.appendChild(formationGroup);

      const decorationAnchor = this.resolveStackDecorationAnchor(cx, cy, variant, visibleMembers.length > 1);
      this.renderUnitDecorations(formationGroup, decorationAnchor.cx, decorationAnchor.cy, member.unit);
      this.applyFacingAngleToGroup(
        formationGroup,
        cx,
        cy,
        this.resolveFacingAngleDeg(this.normalizeFacing(member.unit.facing))
      );
    });

    // Calculate and set suppression/sentry state on main unit-stack group
    const primaryUnit = primaryMember.unit;
    const suppressorCount = primaryUnit.suppressedBy?.length ?? 0;
    const suppressionState = suppressorCount >= 2 ? "pinned" : suppressorCount === 1 ? "suppressed" : "clear";
    group.dataset.suppressionState = suppressionState;
    group.dataset.sentryState = primaryUnit.onSentry ? "on" : "off";
    group.dataset.entrenchLevel = String(Math.max(0, Math.min(2, Math.round(primaryUnit.entrench ?? 0))));

    if (suppressionState === "suppressed" || suppressionState === "pinned") {
      group.classList.add(suppressionState === "pinned" ? "unit-stack--pinned" : "unit-stack--suppressed");
    }

    this.positionUnitStack(group, cx, cy);
    const storedAngle = this.hexUnitFacingAngleMap.get(hexKey) ?? null;
    if (storedAngle !== null && visibleMembers.length === 1) {
      this.applyFacingAngleToGroup(group, cx, cy, storedAngle);
    } else if (storedAngle === null && visibleMembers.length === 1) {
      this.hexUnitFacingAngleMap.set(
        hexKey,
        this.resolveFacingAngleDeg(this.normalizeFacing(primaryMember.unit.facing))
      );
    } else if (visibleMembers.length > 1) {
      this.hexUnitFacingAngleMap.delete(hexKey);
    }
    cell.appendChild(group);
    this.hexUnitImageMap.set(hexKey, group);
  }

  /**
   * Renders or updates a single visible formation on a hex cell.
   */
  renderUnit(
    hexKey: string,
    unit: ScenarioUnit,
    faction: "Player" | "Bot" | "Ally",
    reconStatus: ReconStatusKey | boolean = "visible"
  ): void {
    this.renderUnitStack(hexKey, [{ unit, faction, reconStatus }]);
  }

  /**
   * Removes a unit icon from the specified hex if present.
   */
  clearUnit(hexKey: string): void {
    const group = this.hexUnitImageMap.get(hexKey);
    if (!group) {
      return;
    }
    group.remove();
    this.hexUnitImageMap.delete(hexKey);
    this.hexUnitClassMap.delete(hexKey);
    this.hexUnitScenarioTypeMap.delete(hexKey);
    this.hexUnitFacingAngleMap.delete(hexKey);
  }

  clearHexModification(hexKey: string): void {
    this.hexModificationStateMap.delete(hexKey);
    const overlay = this.hexModificationOverlayMap.get(hexKey);
    if (overlay) {
      overlay.remove();
      this.hexModificationOverlayMap.delete(hexKey);
    }
    this.getAdjacentHexKeys(hexKey).forEach((neighborHexKey) => this.refreshHexModificationOverlay(neighborHexKey));
  }

  clearAllHexModifications(): void {
    this.hexModificationOverlayMap.forEach((overlay) => overlay.remove());
    this.hexModificationOverlayMap.clear();
    this.hexModificationStateMap.clear();
  }

  renderHexModification(hexKey: string, modification: HexModification): void {
    this.renderHexModifications(hexKey, [modification]);
  }

  renderHexModifications(hexKey: string, modifications: readonly HexModification[]): void {
    this.hexModificationStateMap.set(hexKey, modifications.map((modification) => structuredClone(modification)));
    this.refreshHexModificationOverlay(hexKey);
    this.getAdjacentHexKeys(hexKey).forEach((neighborHexKey) => this.refreshHexModificationOverlay(neighborHexKey));
  }

  private refreshHexModificationOverlay(hexKey: string): void {
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      return;
    }
    const modifications = this.hexModificationStateMap.get(hexKey) ?? [];
    if (modifications.length === 0) {
      const existing = this.hexModificationOverlayMap.get(hexKey);
      if (existing) {
        existing.remove();
        this.hexModificationOverlayMap.delete(hexKey);
      }
      return;
    }

    let overlay = this.hexModificationOverlayMap.get(hexKey) ?? null;
    if (!overlay) {
      overlay = document.createElementNS(SVG_NS, "g");
      overlay.classList.add("hex-modification-overlay");
      overlay.style.pointerEvents = "none";
      this.hexModificationOverlayMap.set(hexKey, overlay);
    }

    const primary = modifications[0]!;
    overlay.setAttribute("data-modification-type", primary.type);
    overlay.setAttribute("data-faction", primary.faction);
    overlay.setAttribute("data-modification-count", String(modifications.length));
    const facings = modifications
      .map((modification) => modification.facing)
      .filter((facing): facing is HexEdgeFacing => facing !== null && facing !== undefined);
    if (facings.length > 0) {
      overlay.setAttribute("data-modification-facing", facings.join(","));
    } else {
      overlay.removeAttribute("data-modification-facing");
    }
    const clearPathLevel = modifications
      .filter((modification) => modification.type === "clearedPath")
      .reduce((highest, modification) => Math.max(highest, modification.level ?? 1), 0);
    if (clearPathLevel > 0) {
      overlay.setAttribute("data-cleared-path-level", String(clearPathLevel));
    } else {
      overlay.removeAttribute("data-cleared-path-level");
    }
    overlay.replaceChildren(...modifications.map((modification) => this.buildHexModificationOverlay(hexKey, cell, modification)));

    const existingUnitGroup = this.hexUnitImageMap.get(hexKey);
    if (existingUnitGroup && existingUnitGroup.parentNode === cell) {
      cell.insertBefore(overlay, existingUnitGroup);
    } else if (overlay.parentNode !== cell) {
      cell.appendChild(overlay);
    }
  }

  private buildHexModificationOverlay(hexKey: string, cell: SVGGElement, modification: HexModification): SVGElement {
    const center = this.extractHexCenter(cell);
    const cx = center?.cx ?? Number(cell.dataset.cx ?? 0);
    const cy = center?.cy ?? Number(cell.dataset.cy ?? 0);

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("hex-modification-overlay__icon");
    group.setAttribute("data-modification-type", modification.type);
    if (modification.facing) {
      group.setAttribute("data-modification-facing", modification.facing);
    }

    switch (modification.type) {
      case "fortifications": {
        const facing = this.normalizeHexEdgeFacing(modification.facing);
        if (!facing) {
          const legacyGroup = document.createElementNS(SVG_NS, "g");
          legacyGroup.setAttribute("transform", `translate(${cx} ${cy + 12})`);
          this.appendFortificationPanels(legacyGroup, 28);
          group.appendChild(legacyGroup);
          break;
        }

        const edge = this.resolveHexEdgeGeometry(cx, cy, facing);
        const edgeGroup = document.createElementNS(SVG_NS, "g");
        edgeGroup.setAttribute(
          "transform",
          `translate(${edge.mid.x + edge.inward.x * 4} ${edge.mid.y + edge.inward.y * 4}) rotate(${edge.angleDeg})`
        );
        this.appendFortificationPanels(edgeGroup, Math.max(18, edge.length - 12));
        group.appendChild(edgeGroup);
        break;
      }
      case "tankTraps": {
        const facing = this.normalizeHexEdgeFacing(modification.facing);
        if (!facing) {
          const legacyGroup = document.createElementNS(SVG_NS, "g");
          legacyGroup.setAttribute("transform", `translate(${cx} ${cy + 12})`);
          this.appendTankTrapPanels(legacyGroup, 28);
          group.appendChild(legacyGroup);
          break;
        }

        const edge = this.resolveHexEdgeGeometry(cx, cy, facing);
        const edgeGroup = document.createElementNS(SVG_NS, "g");
        edgeGroup.setAttribute(
          "transform",
          `translate(${edge.mid.x + edge.inward.x * 4} ${edge.mid.y + edge.inward.y * 4}) rotate(${edge.angleDeg})`
        );
        this.appendTankTrapPanels(edgeGroup, Math.max(18, edge.length - 12));
        group.appendChild(edgeGroup);
        break;
      }
      case "clearedPath":
      default: {
        const level = Math.max(1, Math.min(3, modification.level ?? 1));
        group.setAttribute("data-cleared-path-level", String(level));
        const tile = this.getTileDetailsAtHexKey(hexKey);
        const offset = CoordinateSystem.parseHexKey(hexKey);
        if (tile && offset && this.scenarioData) {
          group.innerHTML = this.roadRenderer.drawRoadOverlay(
            cx,
            cy,
            tile,
            offset.col,
            offset.row,
            this.scenarioData.tiles,
            this.scenarioData.tilePalette,
            {
              treatCurrentAsRoad: true,
              style: {
                strokeColor: "#8b6f47",
                strokeWidth: this.resolveClearedPathStrokeWidth(level),
                opacity: 0.96
              },
              neighborHasRoad: ({ tile: neighborTile, col, row }) => (
                this.roadRenderer.hasRoad(neighborTile) ||
                this.getClearPathLevelForHexKey(CoordinateSystem.makeHexKey(col, row)) > 0
              )
            }
          );
        } else {
          const lane = document.createElementNS(SVG_NS, "path");
          lane.setAttribute("d", `M ${cx - 20} ${cy + 18} C ${cx - 8} ${cy + 10}, ${cx + 4} ${cy + 22}, ${cx + 20} ${cy + 14}`);
          lane.setAttribute("fill", "none");
          lane.setAttribute("stroke", "#8b6f47");
          lane.setAttribute("stroke-width", String(this.resolveClearedPathStrokeWidth(level)));
          lane.setAttribute("stroke-linecap", "round");
          group.appendChild(lane);
        }
        break;
      }
    }

    return group;
  }

  private resolveClearedPathStrokeWidth(level: number): number {
    switch (Math.max(1, Math.min(3, level))) {
      case 1:
        return 1.2;
      case 2:
        return 2.1;
      case 3:
      default:
        return 3;
    }
  }

  private getTileDetailsAtHexKey(hexKey: string): TileDetails | null {
    if (!this.scenarioData) {
      return null;
    }
    const offset = CoordinateSystem.parseHexKey(hexKey);
    if (!offset) {
      return null;
    }
    const rowTiles = this.scenarioData.tiles[offset.row];
    if (!rowTiles) {
      return null;
    }
    const tileEntry = rowTiles[offset.col];
    if (!tileEntry) {
      return null;
    }
    return CoordinateSystem.resolveTile(tileEntry, this.scenarioData.tilePalette);
  }

  private getClearPathLevelForHexKey(hexKey: string): number {
    return (this.hexModificationStateMap.get(hexKey) ?? []).reduce((highest, modification) => {
      if (modification.type !== "clearedPath") {
        return highest;
      }
      return Math.max(highest, modification.level ?? 1);
    }, 0);
  }

  private getAdjacentHexKeys(hexKey: string): string[] {
    const offset = CoordinateSystem.parseHexKey(hexKey);
    if (!offset) {
      return [];
    }
    const axial = CoordinateSystem.offsetToAxial(offset.col, offset.row);
    return axialDirections.map((dir) => {
      const neighbor = CoordinateSystem.axialToOffset(axial.q + dir.q, axial.r + dir.r);
      return CoordinateSystem.makeHexKey(neighbor.col, neighbor.row);
    }).filter((neighborHexKey) => this.hexElementMap.has(neighborHexKey));
  }

  /**
   * Renders a single hex tile.
   */
  private renderHex(
    hex: { tile: TileDetails; x: number; y: number; col: number; row: number; recon: ReconStatusKey },
    minX: number,
    minY: number,
    margin: number,
    data: ScenarioData
  ): string {
    const { tile, x, y, col, row } = hex;
    const cx = x - minX + margin;
    const cy = y - minY + margin;

    const points = CoordinateSystem.hexPoints(cx, cy);
    const fill = this.terrainRenderer.getTerrainFill(tile.terrain, tile.terrainType);
    const tooltip = this.terrainRenderer.generateHexTooltip(tile);
    const hexKey = CoordinateSystem.makeHexKey(col, row);
    const clipId = `clip-${hexKey.replace(/[^a-z0-9]/gi, "-")}`;
    const sprite = this.terrainRenderer.getTerrainSprite(tile);

    // Look up terrain definition for LOS and combat stats
    const terrainDef = (terrainData as TerrainDictionary)[tile.terrain as keyof TerrainDictionary];
    const defense = terrainDef?.defense ?? 0;
    const accMod = terrainDef?.accMod ?? 0;
    const blocksLOS = terrainDef?.blocksLOS ?? false;

    // Apply a small overscan so varied sprite art fully covers the hex without obvious borders.
    const spriteOverscan = 1.08; // 8% zoom keeps edges masked while preserving centering.
    const imageWidth = HEX_WIDTH * spriteOverscan;
    const imageHeight = HEX_HEIGHT * spriteOverscan;
    const imageX = cx - imageWidth / 2;
    const imageY = cy - imageHeight / 2;

    const roadOverlay = this.roadRenderer.drawRoadOverlay(
      cx,
      cy,
      tile,
      col,
      row,
      data.tiles,
      data.tilePalette
    );
    const featureOverlay = this.renderTerrainFeatureOverlay(tile, cx, cy, clipId);

    return `
      <g class="hex-cell" data-terrain="${tile.terrain}" data-terrain-type="${tile.terrainType}" data-features="${tile.features.join("|")}" data-hex="${hexKey}" data-col="${col}" data-row="${row}" data-cx="${cx}" data-cy="${cy}" data-clip-id="${clipId}" data-defense="${defense}" data-acc-mod="${accMod}" data-blocks-los="${blocksLOS}">
        <defs>
          <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
            <polygon points="${points}"></polygon>
          </clipPath>
        </defs>
        ${sprite ? `<image href="${sprite}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" class="terrain-sprite" />` : ""}
        <polygon class="hex-tile" points="${points}" fill="${fill}" fill-opacity="${sprite ? 0.35 : 1}" stroke="${HEX_DEFAULT_STROKE}" stroke-width="${HEX_DEFAULT_STROKE_WIDTH}"></polygon>
        ${roadOverlay}
        ${featureOverlay}
        <title>${tooltip}</title>
      </g>
    `;
  }

  private renderTerrainFeatureOverlay(tile: TileDetails, cx: number, cy: number, clipId: string): string {
    if (tile.features.length === 0) {
      return "";
    }

    const features = new Set(tile.features.map((feature) => feature.toLowerCase()));
    const overlays: string[] = [];

    if (features.has("shallow")) {
      overlays.push(this.renderShallowCrossingOverlay(cx, cy, clipId));
    }
    if (features.has("ford")) {
      overlays.push(this.renderFordOverlay(cx, cy, clipId));
    }
    if (features.has("bridge") && features.has("rubble")) {
      overlays.push(this.renderRubbleBridgeOverlay(cx, cy, clipId));
    }

    return overlays.join("");
  }

  private renderShallowCrossingOverlay(cx: number, cy: number, clipId: string): string {
    const startX = cx - HEX_WIDTH * 0.24;
    const endX = cx + HEX_WIDTH * 0.24;
    const topY = cy - HEX_HEIGHT * 0.12;
    const midY = cy;
    const bottomY = cy + HEX_HEIGHT * 0.12;

    return `
      <g class="terrain-feature-overlay terrain-feature-overlay--shallow" clip-path="url(#${clipId})" opacity="0.95">
        <path d="M ${startX} ${topY} C ${cx - HEX_WIDTH * 0.12} ${topY - 4}, ${cx + HEX_WIDTH * 0.04} ${topY + 4}, ${endX} ${topY}" fill="none" stroke="#d8ecf7" stroke-width="2.4" stroke-linecap="round" />
        <path d="M ${startX} ${midY} C ${cx - HEX_WIDTH * 0.1} ${midY - 5}, ${cx + HEX_WIDTH * 0.08} ${midY + 5}, ${endX} ${midY}" fill="none" stroke="#f3f8fb" stroke-width="2.8" stroke-linecap="round" />
        <path d="M ${startX} ${bottomY} C ${cx - HEX_WIDTH * 0.08} ${bottomY - 4}, ${cx + HEX_WIDTH * 0.12} ${bottomY + 4}, ${endX} ${bottomY}" fill="none" stroke="#d8ecf7" stroke-width="2.4" stroke-linecap="round" />
      </g>
    `;
  }

  private renderFordOverlay(cx: number, cy: number, clipId: string): string {
    const stoneOffsets = [-20, -10, 0, 10, 20];
    const stones = stoneOffsets
      .map((offset, index) => {
        const radius = index % 2 === 0 ? 3.4 : 2.8;
        const y = cy + (index % 2 === 0 ? -2 : 2);
        return `<circle cx="${cx + offset}" cy="${y}" r="${radius}" fill="#d7c099" fill-opacity="0.95" stroke="#755f41" stroke-width="0.9" />`;
      })
      .join("");

    return `
      <g class="terrain-feature-overlay terrain-feature-overlay--ford" clip-path="url(#${clipId})">
        <path d="M ${cx - HEX_WIDTH * 0.28} ${cy} L ${cx + HEX_WIDTH * 0.28} ${cy}" fill="none" stroke="#8b6f47" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.85" />
        ${stones}
      </g>
    `;
  }

  private renderRubbleBridgeOverlay(cx: number, cy: number, clipId: string): string {
    const beamWidth = HEX_WIDTH * 0.2;
    const beamHeight = 5;
    const rubble = [
      { x: cx - 9, y: cy + 6, r: 2.4 },
      { x: cx - 3, y: cy + 8, r: 2.1 },
      { x: cx + 5, y: cy + 7, r: 2.5 },
      { x: cx + 11, y: cy + 5, r: 1.9 }
    ]
      .map(({ x, y, r }) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#756451" fill-opacity="0.95" />`)
      .join("");

    return `
      <g class="terrain-feature-overlay terrain-feature-overlay--rubble-bridge" clip-path="url(#${clipId})" opacity="0.95">
        <rect x="${cx - beamWidth - 4}" y="${cy - beamHeight / 2}" width="${beamWidth}" height="${beamHeight}" rx="1.4" fill="#6c5945" />
        <rect x="${cx + 4}" y="${cy - beamHeight / 2}" width="${beamWidth}" height="${beamHeight}" rx="1.4" fill="#6c5945" />
        <line x1="${cx - 4}" y1="${cy - 3}" x2="${cx + 4}" y2="${cy + 3}" stroke="#4f4031" stroke-width="2" />
        <line x1="${cx - 4}" y1="${cy + 3}" x2="${cx + 4}" y2="${cy - 3}" stroke="#4f4031" stroke-width="2" />
        ${rubble}
      </g>
    `;
  }

  /**
   * Normalizes recon status string to valid enum value.
   */
  private normalizeReconStatus(recon: string): ReconStatusKey {
    const normalized = recon.toLowerCase();
    const validStatuses: ReconStatusKey[] = ["unknown", "spotted", "identified", "visible"];

    if (validStatuses.includes(normalized as ReconStatusKey)) {
      return normalized as ReconStatusKey;
    }

    return "unknown";
  }

  private rehydrateAftermathOverlays(): void {
    this.aftermathByHexKey.forEach((_entry, hexKey) => {
      this.syncAftermathOverlay(hexKey);
    });
  }

  markHexWrecked(hexKey: string, unitClass?: UnitClass, fireTurns = 2): void {
    const scenarioType = this.getUnitScenarioTypeAt(hexKey);
    const wreckClass = resolveWreckFxClass(unitClass, scenarioType);
    const hasFlames = wreckClass !== "infantry";
    const existing = this.aftermathByHexKey.get(hexKey);
    const next: AftermathEntry = {
      smokeLevel: hasFlames ? 2 : 0,
      flames: hasFlames,
      wreck: true,
      wreckClass,
      wreckScenarioType: scenarioType ?? null,
      fireTurnsRemaining: Math.max(0, Math.floor(fireTurns)),
      group: existing?.group ?? null
    };
    this.aftermathByHexKey.set(hexKey, next);
    this.syncAftermathOverlay(hexKey);
  }

  markHexDamaged(hexKey: string, unitClass?: UnitClass, strengthAfter?: number, turns = 2): void {
    const isVehicle = unitClass === "vehicle" || unitClass === "tank";
    if (!isVehicle) {
      return;
    }

    const normalizedStrength = typeof strengthAfter === "number" ? Math.max(0, Math.min(100, strengthAfter)) : 99;
    const isCritical = normalizedStrength <= 49;
    const smokeLevel: 0 | 1 | 2 = isCritical ? 2 : 1;
    const flames = Boolean(isCritical);

    const existing = this.aftermathByHexKey.get(hexKey);
    const next: AftermathEntry = {
      smokeLevel,
      flames,
      wreck: false,
      wreckClass: resolveWreckFxClass(unitClass, this.getUnitScenarioTypeAt(hexKey)),
      wreckScenarioType: this.getUnitScenarioTypeAt(hexKey) ?? null,
      fireTurnsRemaining: Math.max(0, Math.floor(turns)),
      group: existing?.group ?? null
    };
    this.aftermathByHexKey.set(hexKey, next);
    this.syncAftermathOverlay(hexKey);
  }

  advanceAftermathTurn(): void {
    this.aftermathByHexKey.forEach((entry, hexKey) => {
      if (entry.wreck) {
        if (entry.fireTurnsRemaining <= 0) {
          return;
        }
        entry.fireTurnsRemaining -= 1;
        if (entry.fireTurnsRemaining <= 0) {
          entry.smokeLevel = 0;
          entry.flames = false;
          this.syncAftermathOverlay(hexKey);
        }
        return;
      }

      if (entry.fireTurnsRemaining <= 0) {
        this.removeAftermathOverlay(hexKey);
        return;
      }
      entry.fireTurnsRemaining -= 1;
      if (entry.fireTurnsRemaining <= 0) {
        this.removeAftermathOverlay(hexKey);
      }
    });
  }

  private removeAftermathOverlay(hexKey: string): void {
    const entry = this.aftermathByHexKey.get(hexKey);
    this.wreckFxRenderer?.removeWreck(hexKey);
    if (entry?.group) {
      entry.group.remove();
      entry.group = null;
    }
    this.aftermathByHexKey.delete(hexKey);
  }

  private syncAftermathOverlay(hexKey: string): void {
    const entry = this.aftermathByHexKey.get(hexKey);
    if (!entry) {
      return;
    }

    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      return;
    }

    const center = this.extractHexCenter(cell);
    if (!center) {
      return;
    }

    if (!entry.group || !entry.group.isConnected) {
      const g = document.createElementNS(SVG_NS, "g");
      g.classList.add("aftermath-overlay");
      g.style.pointerEvents = "none";
      cell.appendChild(g);
      entry.group = g;
    }

    const group = entry.group;
    while (group.firstChild) {
      group.firstChild.remove();
    }

    if (entry.wreck) {
      group.appendChild(this.createWreckShape(hexKey, entry.wreckClass, entry.wreckScenarioType, center.cx, center.cy));
      if (entry.flames || entry.smokeLevel > 0) {
        this.wreckFxRenderer?.upsertWreck({
          hexKey,
          parentGroup: group,
          anchorX: center.cx,
          anchorY: center.cy + 8,
          seed: this.seedFromHexKey(`${hexKey}:${entry.wreckClass}`),
          wreckClass: entry.wreckClass
        });
      } else {
        this.wreckFxRenderer?.removeWreck(hexKey);
      }
      return;
    }

    if (entry.smokeLevel > 0 || entry.flames) {
      this.wreckFxRenderer?.upsertWreck({
        hexKey,
        parentGroup: group,
        anchorX: center.cx,
        anchorY: center.cy + 6,
        seed: this.seedFromHexKey(`${hexKey}:${entry.wreckClass}:damage:${entry.smokeLevel}:${entry.flames ? 1 : 0}`),
        wreckClass: entry.wreckClass,
        mode: "damage",
        forcedSeverity: this.resolveDamageAftermathSeverity(entry),
        allowFlames: entry.flames
      });
    } else {
      this.wreckFxRenderer?.removeWreck(hexKey);
    }
  }

  private resolveDamageAftermathSeverity(entry: AftermathEntry): "settling" | "smoldering" {
    return entry.flames || entry.smokeLevel === 2 ? "settling" : "smoldering";
  }

  private seedFromHexKey(hexKey: string): number {
    let hash = 2166136261;
    for (let i = 0; i < hexKey.length; i += 1) {
      hash ^= hexKey.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private seededRandom(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  private createWreckFragment(
    group: SVGGElement,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDeg: number,
    fill: string,
    opacity: number = 0.86
  ): void {
    const fragment = document.createElementNS(SVG_NS, "rect");
    fragment.setAttribute("x", String(x - width / 2));
    fragment.setAttribute("y", String(y - height / 2));
    fragment.setAttribute("width", String(width));
    fragment.setAttribute("height", String(height));
    fragment.setAttribute("rx", String(Math.min(width, height) * 0.22));
    fragment.setAttribute("fill", fill);
    fragment.setAttribute("opacity", String(opacity));
    fragment.setAttribute("transform", `rotate(${rotationDeg} ${x} ${y})`);
    group.appendChild(fragment);
  }

  private createWreckWheel(group: SVGGElement, x: number, y: number, radius: number, opacity: number = 0.72): void {
    const wheel = document.createElementNS(SVG_NS, "circle");
    wheel.setAttribute("cx", String(x));
    wheel.setAttribute("cy", String(y));
    wheel.setAttribute("r", String(radius));
    wheel.setAttribute("fill", "none");
    wheel.setAttribute("stroke", "#242424");
    wheel.setAttribute("stroke-width", String(Math.max(0.8, radius * 0.45)));
    wheel.setAttribute("opacity", String(opacity));
    group.appendChild(wheel);
  }

  private createScatterDebris(
    group: SVGGElement,
    rand: () => number,
    cx: number,
    cy: number,
    count: number,
    spreadX: number,
    spreadY: number,
    minSize: number,
    maxSize: number
  ): void {
    for (let index = 0; index < count; index += 1) {
      const x = cx + (rand() - 0.5) * spreadX;
      const y = cy + 8 + (rand() - 0.5) * spreadY;
      const width = minSize + rand() * (maxSize - minSize);
      const height = Math.max(1.2, minSize * 0.45 + rand() * (maxSize - minSize) * 0.55);
      const rotation = -38 + rand() * 76;
      const fill = rand() > 0.55 ? "#2d2d2d" : "#434343";
      this.createWreckFragment(group, x, y, width, height, rotation, fill, 0.72 + rand() * 0.16);
    }
  }

  private createWreckShape(hexKey: string, wreckClass: WreckFxClass, scenarioType: string | null, cx: number, cy: number): SVGGElement {
    const g = document.createElementNS(SVG_NS, "g");
    const rand = this.seededRandom(this.seedFromHexKey(`${hexKey}:wreck:${wreckClass}:${scenarioType ?? "generic"}`));
    const normalizedType = String(scenarioType ?? "").toLowerCase();

    const scorch = document.createElementNS(SVG_NS, "ellipse");
    scorch.setAttribute("cx", String(cx));
    scorch.setAttribute("cy", String(cy + 12));
    scorch.setAttribute("rx", wreckClass === "tank" || wreckClass === "convoy" ? "18" : wreckClass === "artillery" ? "16" : normalizedType.includes("bike") ? "10" : "13");
    scorch.setAttribute("ry", wreckClass === "tank" ? "6.5" : normalizedType.includes("bike") ? "3.4" : "4.6");
    scorch.setAttribute("fill", "#131313");
    scorch.setAttribute("opacity", "0.24");
    g.appendChild(scorch);

    if (normalizedType.includes("bike")) {
      const frame = document.createElementNS(SVG_NS, "path");
      frame.setAttribute("d", `M ${cx - 7} ${cy + 6} L ${cx - 1} ${cy + 1} L ${cx + 5} ${cy + 6} L ${cx - 2} ${cy + 8} Z`);
      frame.setAttribute("fill", "#2a2a2a");
      frame.setAttribute("opacity", "0.84");
      const fork = document.createElementNS(SVG_NS, "path");
      fork.setAttribute("d", `M ${cx - 2} ${cy + 1} L ${cx + 6} ${cy - 2} M ${cx - 1} ${cy + 2} L ${cx - 7} ${cy + 3}`);
      fork.setAttribute("stroke", "#3b3b3b");
      fork.setAttribute("stroke-width", "1.8");
      fork.setAttribute("stroke-linecap", "round");
      fork.setAttribute("opacity", "0.76");
      g.append(frame, fork);
      this.createWreckWheel(g, cx - 7, cy + 7, 2.8, 0.68);
      this.createWreckWheel(g, cx + 7, cy + 4, 2.5, 0.62);
      this.createScatterDebris(g, rand, cx, cy, 9, 22, 12, 1.4, 3.6);
      return g;
    }

    if (wreckClass === "tank") {
      const hull = document.createElementNS(SVG_NS, "path");
      hull.setAttribute("d", `M ${cx - 12} ${cy + 7} L ${cx - 4} ${cy + 1} L ${cx + 10} ${cy + 4} L ${cx + 6} ${cy + 10} L ${cx - 8} ${cy + 11} Z`);
      hull.setAttribute("fill", "#2a2a2a");
      hull.setAttribute("opacity", "0.88");
      hull.setAttribute("transform", `rotate(${-10 + rand() * 12} ${cx} ${cy})`);
      const turret = document.createElementNS(SVG_NS, "path");
      turret.setAttribute("d", `M ${cx - 3} ${cy - 1} L ${cx + 6} ${cy + 1} L ${cx + 2} ${cy + 6} L ${cx - 5} ${cy + 4} Z`);
      turret.setAttribute("fill", "#202020");
      turret.setAttribute("opacity", "0.9");
      turret.setAttribute("transform", `rotate(${8 + rand() * 18} ${cx} ${cy})`);
      const tracks = document.createElementNS(SVG_NS, "path");
      tracks.setAttribute("d", `M ${cx - 15} ${cy + 12} L ${cx - 6} ${cy + 10} M ${cx + 2} ${cy + 12} L ${cx + 13} ${cy + 9}`);
      tracks.setAttribute("stroke", "#4b4b4b");
      tracks.setAttribute("stroke-width", "2.6");
      tracks.setAttribute("stroke-linecap", "round");
      tracks.setAttribute("opacity", "0.7");
      g.append(hull, turret, tracks);
      this.createScatterDebris(g, rand, cx, cy, 10, 30, 16, 1.8, 4.8);
      return g;
    }

    if (wreckClass === "artillery") {
      const carriage = document.createElementNS(SVG_NS, "path");
      carriage.setAttribute("d", `M ${cx - 11} ${cy + 7} L ${cx - 2} ${cy + 2} L ${cx + 4} ${cy + 5} L ${cx - 4} ${cy + 10} Z`);
      carriage.setAttribute("fill", "#2c2c2c");
      carriage.setAttribute("opacity", "0.84");
      const barrel = document.createElementNS(SVG_NS, "path");
      barrel.setAttribute("d", `M ${cx - 1} ${cy + 2} L ${cx + 10} ${cy - 3}`);
      barrel.setAttribute("stroke", "#3f3f3f");
      barrel.setAttribute("stroke-width", "2.2");
      barrel.setAttribute("stroke-linecap", "round");
      barrel.setAttribute("opacity", "0.78");
      this.createWreckWheel(g, cx - 10, cy + 9, 3.2, 0.62);
      g.append(carriage, barrel);
      this.createScatterDebris(g, rand, cx, cy, 9, 26, 15, 1.6, 4.2);
      return g;
    }

    if (wreckClass === "convoy" || wreckClass === "truck") {
      const chassis = document.createElementNS(SVG_NS, "path");
      chassis.setAttribute("d", `M ${cx - 10} ${cy + 6} L ${cx - 1} ${cy + 1} L ${cx + 8} ${cy + 4} L ${cx + 4} ${cy + 9} L ${cx - 7} ${cy + 10} Z`);
      chassis.setAttribute("fill", wreckClass === "convoy" ? "#292929" : "#2f2f2f");
      chassis.setAttribute("opacity", "0.84");
      chassis.setAttribute("transform", `rotate(${-14 + rand() * 16} ${cx} ${cy})`);
      const cabin = document.createElementNS(SVG_NS, "rect");
      cabin.setAttribute("x", String(cx - 3));
      cabin.setAttribute("y", String(cy + 1));
      cabin.setAttribute("width", wreckClass === "convoy" ? "7" : "6");
      cabin.setAttribute("height", "4");
      cabin.setAttribute("rx", "1.2");
      cabin.setAttribute("fill", "#202020");
      cabin.setAttribute("opacity", "0.8");
      cabin.setAttribute("transform", `rotate(${6 + rand() * 10} ${cx} ${cy})`);
      g.append(chassis, cabin);
      this.createWreckWheel(g, cx - 8, cy + 9, 2.5, 0.6);
      this.createWreckWheel(g, cx + 7, cy + 7, 2.2, 0.56);
      this.createScatterDebris(g, rand, cx, cy, wreckClass === "convoy" ? 11 : 8, wreckClass === "convoy" ? 32 : 26, 15, 1.4, wreckClass === "convoy" ? 4.6 : 3.9);
      return g;
    }

    const rubbleStroke = document.createElementNS(SVG_NS, "path");
    rubbleStroke.setAttribute("d", `M ${cx - 7} ${cy + 8} L ${cx - 1} ${cy + 4} M ${cx + 2} ${cy + 9} L ${cx + 7} ${cy + 6}`);
    rubbleStroke.setAttribute("stroke", "#3f3f3f");
    rubbleStroke.setAttribute("stroke-width", "1.8");
    rubbleStroke.setAttribute("stroke-linecap", "round");
    rubbleStroke.setAttribute("opacity", "0.68");
    g.appendChild(rubbleStroke);
    this.createScatterDebris(g, rand, cx, cy, 7, 18, 10, 1.2, 3.2);
    return g;
  }

  private extractHexCenter(cell: SVGGElement): { cx: number; cy: number } | null {
    const cx = Number(cell.dataset.cx ?? NaN);
    const cy = Number(cell.dataset.cy ?? NaN);
    if (Number.isNaN(cx) || Number.isNaN(cy)) {
      return null;
    }
    return { cx, cy };
  }

  private createMoveGhost(spriteHref: string, width: number, height: number): SVGImageElement {
    const ghost = document.createElementNS(SVG_NS, "image");
    ghost.classList.add("unit-move-ghost");
    ghost.setAttribute("href", spriteHref);
    ghost.setAttribute("width", String(width));
    ghost.setAttribute("height", String(height));
    ghost.setAttribute("preserveAspectRatio", "xMidYMid slice");
    ghost.style.pointerEvents = "none";
    return ghost;
  }

  /**
   * Resolves formation layout for aircraft sprites based on strength and role.
   * Returns positions for 1-4 sprites in tactical flight formations.
   * Role-based spacing prevents overlap: fighters +50%, bombers +100% spread.
   */
  private resolveAircraftFormationLayout(
    strength: number,
    role: AirShowRole = "interceptor"
  ): Array<{ ox: number; oy: number; scale: number }> {
    const stackCount = this.resolveUnitStackCount(strength);
    const baseSpacing = HexMapRenderer.AIRCRAFT_FORMATION_SPACING;
    // Apply role-based spacing multiplier
    const spacingMultiplier = role === "bomber"
      ? HexMapRenderer.AIRCRAFT_BOMBER_SPACING_MULTIPLIER
      : HexMapRenderer.AIRCRAFT_FIGHTER_SPACING_MULTIPLIER;
    const spacing = baseSpacing * spacingMultiplier;

    // Scale decreases as formation size increases to maintain visual cohesion
    const scaleByCount: Record<number, number> = {
      1: 0.85,
      2: 0.78,
      3: 0.72,
      4: 0.68
    };
    const scale = scaleByCount[stackCount] ?? 0.72;

    switch (stackCount) {
      case 1:
        // Single aircraft - centered
        return [{ ox: 0, oy: 0, scale }];

      case 2:
        // Two-ship element - side by side
        return [
          { ox: -spacing, oy: 0, scale },
          { ox: spacing, oy: 0, scale }
        ];

      case 3:
        // Three-ship vic - leader with two wingmen
        return [
          { ox: 0, oy: -spacing * 0.6, scale },           // Lead
          { ox: -spacing * 1.1, oy: spacing * 0.5, scale }, // Left wing
          { ox: spacing * 1.1, oy: spacing * 0.5, scale }   // Right wing
        ];

      case 4:
        // Four-ship finger-four - staggered pairs
        return [
          { ox: -spacing * 0.8, oy: -spacing * 0.5, scale }, // Lead left
          { ox: spacing * 0.8, oy: -spacing * 0.5, scale },  // Lead right
          { ox: -spacing * 0.8, oy: spacing * 0.6, scale },  // Trail left
          { ox: spacing * 0.8, oy: spacing * 0.6, scale }    // Trail right
        ];

      default:
        return [{ ox: 0, oy: 0, scale }];
    }
  }

  /**
   * Creates a formation group for aircraft animations showing multiple sprites based on strength and role.
   * Falls back to single sprite if strength is not provided (backward compatibility).
   * Role-based sizing: fighters +50%, bombers +100%.
   */
  private createAircraftFormationGhost(
    spriteHref: string,
    iconSize: number,
    strength?: number,
    role: AirShowRole = "interceptor"
  ): SVGGElement | SVGImageElement {
    // Apply role-based size multiplier
    const sizeMultiplier = role === "bomber"
      ? HexMapRenderer.AIRCRAFT_BOMBER_SIZE_MULTIPLIER
      : HexMapRenderer.AIRCRAFT_FIGHTER_SIZE_MULTIPLIER;
    const scaledIconSize = iconSize * sizeMultiplier;

    // Backward compatibility: if no strength provided, use single sprite
    if (strength === undefined || strength === null) {
      return this.createMoveGhost(spriteHref, scaledIconSize, scaledIconSize);
    }

    const formationGroup = document.createElementNS(SVG_NS, "g");
    formationGroup.classList.add("aircraft-formation");
    formationGroup.style.pointerEvents = "none";

    const layout = this.resolveAircraftFormationLayout(strength, role);

    layout.forEach((spec, index) => {
      const sprite = document.createElementNS(SVG_NS, "image");
      sprite.setAttribute("href", spriteHref);
      const spriteSize = scaledIconSize * spec.scale;
      sprite.setAttribute("width", String(spriteSize));
      sprite.setAttribute("height", String(spriteSize));
      // Center each sprite at its offset position
      sprite.setAttribute("x", String(spec.ox - spriteSize / 2));
      sprite.setAttribute("y", String(spec.oy - spriteSize / 2));
      sprite.setAttribute("preserveAspectRatio", "xMidYMid slice");
      sprite.classList.add("aircraft-sprite", `formation-pos-${index}`);
      sprite.style.pointerEvents = "none";
      formationGroup.appendChild(sprite);
    });

    return formationGroup;
  }

  private createAircraftSpriteGhosts(
    spriteHref: string,
    iconSize: number,
    strength?: number,
    role: AirShowRole = "interceptor"
  ): Array<{ image: SVGImageElement; size: number; biasX: number; biasY: number; formationIndex: number }> {
    // Apply role-based size multiplier
    const sizeMultiplier = role === "bomber"
      ? HexMapRenderer.AIRCRAFT_BOMBER_SIZE_MULTIPLIER
      : HexMapRenderer.AIRCRAFT_FIGHTER_SIZE_MULTIPLIER;
    const scaledIconSize = iconSize * sizeMultiplier;

    const layout =
      strength === undefined || strength === null
        ? [{ ox: 0, oy: 0, scale: 1 }]
        : this.resolveAircraftFormationLayout(strength, role);

    return layout.map((spec, index) => {
      const spriteSize = scaledIconSize * spec.scale;
      const image = this.createMoveGhost(spriteHref, spriteSize, spriteSize);
      image.classList.add("aircraft-show-sprite", `aircraft-show-sprite-${index}`);
      return {
        image,
        size: spriteSize,
        biasX: spec.ox * 0.48,
        biasY: spec.oy * 0.48,
        formationIndex: index
      };
    });
  }

  private normalizeAircraftVector(
    dx: number,
    dy: number,
    fallbackX = 1,
    fallbackY = 0
  ): { x: number; y: number } {
    const length = Math.hypot(dx, dy);
    if (length > 0.001) {
      return { x: dx / length, y: dy / length };
    }

    const fallbackLength = Math.max(0.001, Math.hypot(fallbackX, fallbackY));
    return {
      x: fallbackX / fallbackLength,
      y: fallbackY / fallbackLength
    };
  }

  private resolveAircraftHeadingDegrees(dx: number, dy: number, fallbackDegrees = 0): number {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return ((fallbackDegrees % 360) + 360) % 360;
    }
    const heading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    return ((heading % 360) + 360) % 360;
  }

  private interpolateAircraftHeadingDegrees(currentDegrees: number, targetDegrees: number, blend = 1): number {
    const normalizedCurrent = ((currentDegrees % 360) + 360) % 360;
    const normalizedTarget = ((targetDegrees % 360) + 360) % 360;
    const normalizedBlend = this.clamp(blend, 0, 1);
    const delta = ((((normalizedTarget - normalizedCurrent) % 360) + 540) % 360) - 180;
    return ((normalizedCurrent + delta * normalizedBlend) % 360 + 360) % 360;
  }

  private sampleAircraftWaypointPath(
    points: ReadonlyArray<{ cx: number; cy: number }>,
    progress: number
  ): { point: { cx: number; cy: number }; derivative: { dx: number; dy: number } } {
    return sampleAirShowWaypointPath(points, progress);
  }

  private positionAircraftImageGhost(
    ghost: SVGImageElement,
    size: number,
    centerX: number,
    centerY: number,
    headingDegrees = 0
  ): void {
    ghost.setAttribute("x", String(centerX - size / 2));
    ghost.setAttribute("y", String(centerY - size / 2));
    ghost.setAttribute("transform", `rotate(${headingDegrees} ${centerX} ${centerY})`);
  }

  private playAirTracerExchange(
    start: { cx: number; cy: number },
    end: { cx: number; cy: number },
    options: {
      lifetimeMs?: number;
      reverse?: boolean;
      color?: string;
      width?: number;
      visibleLengthPx?: number;
    } = {}
  ): void {
    const effectsLayer = this.ensureCombatEffectsLayer();
    if (!effectsLayer) {
      return;
    }

    const distance = Math.max(0.001, Math.hypot(end.cx - start.cx, end.cy - start.cy));
    const lifetimeMs = Math.max(18, options.lifetimeMs ?? 30);
    const strokeColor = options.color ?? (options.reverse ? "#fff0b8" : "#ffbf47");
    const strokeWidth = options.width ?? (options.reverse ? 0.18 : 0.2);
    const visibleLengthPx = this.clamp(
      options.visibleLengthPx ?? Math.min(32, distance * 0.08),
      10,
      Math.min(distance, 42)
    );
    const visibleRatio = this.clamp(visibleLengthPx / distance, 0.02, 0.28);
    const glow = document.createElementNS(SVG_NS, "line");
    const tracer = document.createElementNS(SVG_NS, "line");
    [glow, tracer].forEach((line) => {
      line.setAttribute("x1", String(start.cx));
      line.setAttribute("y1", String(start.cy));
      line.setAttribute("x2", String(start.cx));
      line.setAttribute("y2", String(start.cy));
      line.setAttribute("stroke-linecap", "round");
      line.style.opacity = "0";
    });
    glow.setAttribute("stroke", options.reverse ? "#ffe39a" : "#ff9d1f");
    glow.setAttribute("stroke-width", String(strokeWidth * 1.12));
    glow.style.opacity = "0";
    tracer.setAttribute("stroke", strokeColor);
    tracer.setAttribute("stroke-width", String(strokeWidth));

    effectsLayer.appendChild(glow);
    effectsLayer.appendChild(tracer);

    const animationStart = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - animationStart) / lifetimeMs);
      const headProgress = this.clamp(progress * 1.34, 0, 1);
      const tailProgress = this.clamp(headProgress - visibleRatio, 0, 1);
      const head = {
        cx: start.cx + (end.cx - start.cx) * headProgress,
        cy: start.cy + (end.cy - start.cy) * headProgress
      };
      const tail = {
        cx: start.cx + (end.cx - start.cx) * tailProgress,
        cy: start.cy + (end.cy - start.cy) * tailProgress
      };
      const rise = this.clamp(progress / 0.12, 0, 1);
      const decay = progress < 0.22 ? 1 : 1 - (progress - 0.22) / 0.78;
      const opacity = rise * this.clamp(decay, 0, 1);
      [glow, tracer].forEach((line) => {
        line.setAttribute("x1", String(tail.cx));
        line.setAttribute("y1", String(tail.cy));
        line.setAttribute("x2", String(head.cx));
        line.setAttribute("y2", String(head.cy));
      });
      glow.style.opacity = `${0.05 * opacity}`;
      tracer.style.opacity = `${0.88 * opacity}`;
      if (progress >= 1) {
        glow.remove();
        tracer.remove();
        return;
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  private resolveAirShowVisibleActorCount(strength: number): number {
    if (strength <= 0) {
      return 0;
    }
    return this.resolveUnitStackCount(strength);
  }

  private resolveHexCenterByKey(hexKey: string | null | undefined): AirShowPoint | null {
    if (!hexKey) {
      return null;
    }
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      return null;
    }
    return this.extractHexCenter(cell);
  }

  private buildAirShowRuntimeFlight(
    layer: SVGGElement,
    spec: ResolvedAirShowFlightSpec,
    fallbackOrigin: AirShowPoint,
    defaultHeadingDegrees: number
  ): AirShowRuntimeFlightInternal | null {
    const spriteHref = getSpriteForScenarioType(spec.scenarioType, spec.faction);
    if (!spriteHref) {
      return null;
    }

    const origin = this.resolveHexCenterByKey(spec.originHexKey) ?? fallbackOrigin;
    const ghosts = this.createAircraftSpriteGhosts(
      spriteHref,
      HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE,
      spec.strengthBefore,
      spec.role
    );
    const visibleCount = this.resolveAirShowVisibleActorCount(spec.strengthBefore);
    const formationMid = ghosts.length <= 1 ? 0 : (ghosts.length - 1) / 2;
    const actors: AirShowRuntimeActor[] = ghosts.map((ghostSpec, index) => {
      layer.appendChild(ghostSpec.image);
      const position = {
        cx: origin.cx + ghostSpec.biasX,
        cy: origin.cy + ghostSpec.biasY
      };
      const headingDegrees =
        defaultHeadingDegrees +
        (ghostSpec.formationIndex - formationMid) * (spec.role === "bomber" ? 5 : 8);
      this.positionAircraftImageGhost(ghostSpec.image, ghostSpec.size, position.cx, position.cy, headingDegrees);
      ghostSpec.image.style.opacity = index < visibleCount ? "1" : "0";
      return {
        id: `${spec.id}:${index}`,
        flightId: spec.id,
        role: spec.role,
        image: ghostSpec.image,
        size: ghostSpec.size,
        formationIndex: ghostSpec.formationIndex,
        headingDegrees,
        position,
        biasX: ghostSpec.biasX,
        biasY: ghostSpec.biasY,
        active: index < visibleCount
      };
    });

    const activeCount = actors.filter(a => a.active).length;
    const roleLabel =
      spec.role === "escort" && spec.combatRole === "cap"
        ? "opposition/cap"
        : spec.combatRole && spec.combatRole !== spec.role
          ? `${spec.role}/${spec.combatRole}`
          : spec.role;
    debugAirShowPhase("FlightCreated", {
      flightId: spec.id,
      role: roleLabel,
      active: `${activeCount}/${actors.length}`,
      origin: { cx: Math.round(origin.cx), cy: Math.round(origin.cy) },
      heading: Math.round(defaultHeadingDegrees)
    });
    actors.forEach((actor) => {
      if (actor.active) {
        debugAirShowActor(actor.id, "initialized", {
          pos: { cx: Math.round(actor.position.cx), cy: Math.round(actor.position.cy) },
          heading: Math.round(actor.headingDegrees),
          formation: actor.formationIndex
        });
      }
    });

    return {
      spec,
      actors,
      currentStrength: Math.max(0, spec.strengthBefore),
      anchor: this.averageAirShowPosition(actors) ?? origin
    };
  }

  private resolveAirShowSceneAnchor(
    center: AirShowPoint,
    role: "interceptor" | "escort" | "bomber",
    index: number,
    total: number,
    sideBias = 1
  ): AirShowPoint {
    const lane = total <= 1 ? 0 : index - (total - 1) / 2;
    const rand = this.seededRandom(this.seedFromHexKey(`airshow-anchor:${role}:${index}:${total}:${sideBias}`));

    // Per North Star Spec: aircraft must spawn at least 8 hexes from combat center
    // HEX_WIDTH ~83px, so 8 hexes = ~664px minimum distance
    const MINIMUM_SPAWN_DISTANCE_PX = 8 * HEX_WIDTH; // ~665px

    if (role === "bomber") {
      // Bombers spawn further out with slower ingress (3.0s minimum)
      const bomberDistance = MINIMUM_SPAWN_DISTANCE_PX + rand() * 40;
      return {
        cx: center.cx + sideBias * bomberDistance,
        cy: center.cy + lane * 32 + (rand() - 0.5) * 24
      };
    }

    // Fighters/escorts spawn at 8+ hex distance with faster ingress (1.25s minimum)
    const fighterDistance = MINIMUM_SPAWN_DISTANCE_PX + rand() * 32;
    const xBase = role === "interceptor" ? -fighterDistance : fighterDistance;
    const laneSpread = 48;
    return {
      cx: center.cx + xBase + sideBias * lane * 28 + (rand() - 0.5) * 30,
      cy: center.cy + lane * laneSpread + (rand() - 0.5) * 24
    };
  }

  private offsetAirShowPoint(point: AirShowPoint, dx: number, dy: number): AirShowPoint {
    return {
      cx: point.cx + dx,
      cy: point.cy + dy
    };
  }

  /**
   * Calculates minimum center-to-center spacing between aircraft sprites based on roles.
   * Same-role: 0.8 sprite widths | Different-role: 1.0 sprite widths
   */
  private resolveAirShowMinimumSpacing(spriteSizeA: number, spriteSizeB: number, roleA: AirShowRole, roleB: AirShowRole): number {
    const avgSize = (spriteSizeA + spriteSizeB) / 2;
    const isSameRole = roleA === roleB;
    const spacingFactor = isSameRole
      ? HexMapRenderer.AIRCRAFT_SAME_ROLE_SPACING_FACTOR
      : HexMapRenderer.AIRCRAFT_DIFF_ROLE_SPACING_FACTOR;
    return avgSize * spacingFactor;
  }

  /**
   * Detects sprite collisions and resolves spacing violations.
   * Returns corrected positions with enforced minimum spacing.
   */
  private resolveAirShowCollisionFreePositions(
    actors: ReadonlyArray<AirShowRuntimeActor>,
    targetPositions: ReadonlyArray<AirShowPoint>,
    maxIterations = 3
  ): AirShowPoint[] {
    if (actors.length !== targetPositions.length) {
      return [...targetPositions];
    }

    // Create mutable copies
    let positions = targetPositions.map(p => ({ ...p }));
    const activeActors = actors.filter(a => a.active);

    // Iteratively resolve collisions
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let hadCollision = false;

      for (let i = 0; i < activeActors.length; i++) {
        for (let j = i + 1; j < activeActors.length; j++) {
          const actorA = activeActors[i];
          const actorB = activeActors[j];
          const posA = positions[i];
          const posB = positions[j];

          // Calculate current distance
          const dx = posB.cx - posA.cx;
          const dy = posB.cy - posA.cy;
          const distance = Math.hypot(dx, dy);

          // Calculate required minimum spacing
          const minSpacing = this.resolveAirShowMinimumSpacing(
            actorA.size,
            actorB.size,
            actorA.role,
            actorB.role
          );

          // If collision detected, push apart
          if (distance < minSpacing && distance > 0) {
            hadCollision = true;
            const overlap = minSpacing - distance;
            const pushX = (dx / distance) * overlap * 0.55; // Distribute push between both actors
            const pushY = (dy / distance) * overlap * 0.55;

            positions[i] = { cx: posA.cx - pushX, cy: posA.cy - pushY };
            positions[j] = { cx: posB.cx + pushX, cy: posB.cy + pushY };
          }
        }
      }

      if (!hadCollision) break; // All collisions resolved
    }

    return positions;
  }

  /**
   * Assigns altitude lanes when aircraft density exceeds threshold (>6 aircraft).
   * Fans aircraft into layered offsets to prevent visual congestion.
   */
  private resolveAirShowAltitudeLaneOffsets(
    flights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    basePositions: ReadonlyArray<AirShowPoint>
  ): AirShowPoint[] {
    const totalActors = flights.reduce((sum, f) => sum + f.actors.filter(a => a.active).length, 0);

    // If density is low, no altitude layering needed
    if (totalActors <= HexMapRenderer.AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION) {
      return [...basePositions];
    }

    // Assign altitude lanes by flight role to maintain visual hierarchy
    // Interceptors: high lane (-offset), Escorts: mid lane, Bombers: low lane (+offset)
    const laneByRole: Record<AirShowRole, number> = {
      interceptor: -1,
      escort: 0,
      bomber: 1
    };

    let positionIndex = 0;
    const result: AirShowPoint[] = [];

    for (const flight of flights) {
      const activeActors = flight.actors.filter(a => a.active);
      const lane = laneByRole[flight.spec.role] ?? 0;
      const laneOffset = lane * HexMapRenderer.AIRCRAFT_ALTITUDE_LANE_OFFSET_PX;

      for (const actor of activeActors) {
        const basePos = basePositions[positionIndex];
        // Apply lateral offset based on lane (simulated altitude via parallax)
        result.push({
          cx: basePos.cx + laneOffset * 0.3, // Slight lateral shift
          cy: basePos.cy + laneOffset          // Vertical lane separation
        });
        positionIndex++;
      }
    }

    // Log altitude lane assignment for diagnostics
    debugAirShowPhase("AltitudeLanesApplied", {
      totalActors,
      densityThreshold: HexMapRenderer.AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION,
      lanesUsed: [...new Set(flights.map(f => laneByRole[f.spec.role] ?? 0))].sort()
    });

    return result;
  }

  /**
   * Expands combat ellipse when screen-space density exceeds threshold.
   * Pre-rendering adjustment to ensure adequate spacing before animation.
   */
  private resolveAirShowExpandedCombatEllipse(
    center: AirShowPoint,
    flights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    baseRadiusPx: number
  ): { center: AirShowPoint; radiusPx: number } {
    const totalActors = flights.reduce((sum, f) => sum + f.actors.filter(a => a.active).length, 0);

    // If density exceeds threshold, expand the combat ellipse
    if (totalActors > HexMapRenderer.AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION) {
      const expansionFactor = 1 + (totalActors - HexMapRenderer.AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION) * 0.15;
      const expandedRadius = baseRadiusPx * expansionFactor;

      debugAirShowPhase("CombatEllipseExpanded", {
        baseRadius: Math.round(baseRadiusPx),
        expandedRadius: Math.round(expandedRadius),
        totalActors,
        expansionFactor: Math.round(expansionFactor * 100) / 100
      });

      return { center, radiusPx: expandedRadius };
    }

    return { center, radiusPx: baseRadiusPx };
  }

  private interpolateAirShowPoint(start: AirShowPoint, end: AirShowPoint, progress: number): AirShowPoint {
    const t = this.clamp(progress, 0, 1);
    return {
      cx: start.cx + (end.cx - start.cx) * t,
      cy: start.cy + (end.cy - start.cy) * t
    };
  }

  private resolveAirShowCorridor(
    center: AirShowPoint,
    origin: AirShowPoint | null,
    target: AirShowPoint | null
  ): AirShowCorridor {
    const approach = origin ?? { cx: center.cx - 220, cy: center.cy + 110 };
    const egress = target ?? { cx: center.cx + 220, cy: center.cy - 24 };
    const axis = this.normalizeAircraftVector(
      egress.cx - approach.cx,
      egress.cy - approach.cy,
      1,
      0
    );
    const normal = { x: -axis.y, y: axis.x };
    return {
      center,
      axis,
      normal,
      entry: {
        cx: center.cx - axis.x * 126,
        cy: center.cy - axis.y * 126
      },
      merge: {
        cx: center.cx - axis.x * 44,
        cy: center.cy - axis.y * 44
      },
      strike: {
        cx: center.cx + axis.x * 52,
        cy: center.cy + axis.y * 52
      },
      exit: {
        cx: center.cx + axis.x * 118,
        cy: center.cy + axis.y * 118
      }
    };
  }

  private projectAirShowCorridorPoint(corridor: AirShowCorridor, alongPx: number, lateralPx = 0): AirShowPoint {
    return {
      cx: corridor.center.cx + corridor.axis.x * alongPx + corridor.normal.x * lateralPx,
      cy: corridor.center.cy + corridor.axis.y * alongPx + corridor.normal.y * lateralPx
    };
  }

  private fadeInActor(actor: AirShowRuntimeActor, durationMs = 400): Promise<void> {
    return new Promise((resolve) => {
      actor.image.style.transition = `opacity ${durationMs}ms ease-in`;
      actor.image.style.opacity = "1";
      setTimeout(() => {
        actor.image.style.transition = "";
        resolve();
      }, durationMs);
    });
  }

  private fadeOutActor(actor: AirShowRuntimeActor, durationMs = 300): Promise<void> {
    return new Promise((resolve) => {
      actor.image.style.transition = `opacity ${durationMs}ms ease-out`;
      actor.image.style.opacity = "0";
      setTimeout(() => {
        actor.image.style.transition = "";
        resolve();
      }, durationMs);
    });
  }

  private buildAirShowCurvedPath(
    start: AirShowPoint,
    end: AirShowPoint,
    arcPx = 0,
    driftPx = 0,
    startHeadingDegrees?: number
  ): AirShowPoint[] {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const fx = dx / length;
    const fy = dy / length;
    const lateralSign = arcPx >= 0 ? 1 : -1;
    const arcMagnitudePx = Math.abs(arcPx);
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const setupPoint = this.clampPointToViewportBounds(
      {
        cx: start.cx + fx * (length * 0.34) + nx * lateralSign * (arcMagnitudePx * 0.36) + fx * driftPx * 0.18,
        cy: start.cy + fy * (length * 0.34) + ny * lateralSign * (arcMagnitudePx * 0.36) + fy * driftPx * 0.18
      },
      clampCenter,
      430,
      300
    );
    const midB = this.clampPointToViewportBounds(
      {
        cx: start.cx + fx * (length * 0.62) + nx * lateralSign * (arcMagnitudePx * 0.22) + fx * driftPx * 0.54,
        cy: start.cy + fy * (length * 0.62) + ny * lateralSign * (arcMagnitudePx * 0.22) + fy * driftPx * 0.54
      },
      clampCenter,
      430,
      300
    );
    const midC = this.clampPointToViewportBounds(
      {
        cx: start.cx + fx * (length * 0.84) + nx * lateralSign * (arcMagnitudePx * 0.08) + fx * driftPx,
        cy: start.cy + fy * (length * 0.84) + ny * lateralSign * (arcMagnitudePx * 0.08) + fy * driftPx
      },
      clampCenter,
      430,
      300
    );
    const leadPoint = this.buildAirShowHeadingLeadPoint(start, setupPoint, {
      startHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(34, length * 0.18), Math.max(52, length * 0.24)),
      leadLateralPx: arcMagnitudePx * 0.26,
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    return [start, leadPoint, setupPoint, midB, midC, end];
  }

  private resolveAirShowWaypointTurnDegrees(
    previous: AirShowPoint,
    current: AirShowPoint,
    next: AirShowPoint
  ): number {
    return this.resolveAirShowVectorAngleDegrees(
      { x: current.cx - previous.cx, y: current.cy - previous.cy },
      { x: next.cx - current.cx, y: next.cy - current.cy }
    );
  }

  private pruneAirShowTurnWaypoint(
    path: ReadonlyArray<AirShowPoint>,
    waypointIndex: number,
    maxTurnDeg: number
  ): AirShowPoint[] {
    if (waypointIndex <= 0 || waypointIndex >= path.length - 1) {
      return [...path];
    }
    const previous = path[waypointIndex - 1];
    const current = path[waypointIndex];
    const next = path[waypointIndex + 1];
    if (!previous || !current || !next) {
      return [...path];
    }
    const turnDeg = this.resolveAirShowWaypointTurnDegrees(previous, current, next);
    const directDistancePx = Math.hypot(next.cx - previous.cx, next.cy - previous.cy);
    if (turnDeg <= maxTurnDeg || directDistancePx < 12) {
      return [...path];
    }
    return path.filter((_, index) => index !== waypointIndex);
  }

  private pruneAirShowEarlyTurnWaypoints(
    path: ReadonlyArray<AirShowPoint>,
    options: {
      maxTurnDeg?: number;
      strongTurnDeg?: number;
      maxFirstSegmentPx?: number;
      maxWaypointsToRemove?: number;
    } = {}
  ): AirShowPoint[] {
    const prunedPath = [...path];
    const maxTurnDeg = options.maxTurnDeg ?? 52;
    const strongTurnDeg = options.strongTurnDeg ?? 120;
    const maxFirstSegmentPx = options.maxFirstSegmentPx ?? 56;
    const maxWaypointsToRemove = options.maxWaypointsToRemove ?? 2;
    let removedWaypoints = 0;
    while (prunedPath.length >= 3 && removedWaypoints < maxWaypointsToRemove) {
      const start = prunedPath[0];
      const firstWaypoint = prunedPath[1];
      const secondWaypoint = prunedPath[2];
      if (!start || !firstWaypoint || !secondWaypoint) {
        break;
      }
      const firstTurnDeg = this.resolveAirShowWaypointTurnDegrees(start, firstWaypoint, secondWaypoint);
      const firstSegmentPx = Math.hypot(firstWaypoint.cx - start.cx, firstWaypoint.cy - start.cy);
      if (firstTurnDeg <= maxTurnDeg || (firstTurnDeg < strongTurnDeg && firstSegmentPx > maxFirstSegmentPx)) {
        break;
      }
      prunedPath.splice(1, 1);
      removedWaypoints += 1;
    }
    return prunedPath;
  }

  /**
   * Clamps a point to remain within viewport bounds.
   * Prevents aircraft from flying off-screen during maneuvers.
   *
   * @param point - Point to clamp
   * @param center - Viewport center (typically target hex)
   * @param maxHorizontalPx - Maximum horizontal distance from center (default 600)
   * @param maxVerticalPx - Maximum vertical distance from center (default 400)
   * @returns Clamped point within bounds
   */
  private clampPointToViewportBounds(
    point: AirShowPoint,
    center: AirShowPoint,
    maxHorizontalPx: number = 600,
    maxVerticalPx: number = 400
  ): AirShowPoint {
    const dx = point.cx - center.cx;
    const dy = point.cy - center.cy;
    const clampedX = Math.max(-maxHorizontalPx, Math.min(maxHorizontalPx, dx));
    const clampedY = Math.max(-maxVerticalPx, Math.min(maxVerticalPx, dy));
    return {
      cx: center.cx + clampedX,
      cy: center.cy + clampedY
    };
  }

  private buildAirShowPursuitPath(
    start: AirShowPoint,
    target: AirShowPoint,
    options: {
      startHeadingDegrees?: number;
      lateralSign?: number;
      entryLateralPx?: number;
      mergeLateralPx?: number;
      attackOffsetPx?: number;
      closeInPx?: number;
      overshootPx?: number;
      breakLateralPx?: number;
      breakForwardPx?: number;
      driftPx?: number;
    } = {}
  ): AirShowPoint[] {
    const dx = target.cx - start.cx;
    const dy = target.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const fx = dx / length;
    const fy = dy / length;
    const nx = -fy;
    const ny = fx;
    const lateralSign = options.lateralSign ?? 1;
    const entryLateralPx = options.entryLateralPx ?? 86;
    const mergeLateralPx = options.mergeLateralPx ?? 32;
    const attackOffsetPx = options.attackOffsetPx ?? 10;
    const closeInPx = options.closeInPx ?? 18;
    const overshootPx = options.overshootPx ?? 60;
    const breakLateralPx = options.breakLateralPx ?? 50;
    const breakForwardPx = options.breakForwardPx ?? 40;
    const driftPx = options.driftPx ?? 0;
    const clampPoint = (point: AirShowPoint): AirShowPoint => this.clampPointToViewportBounds(point, target);
    const entryPoint = clampPoint({
      cx: start.cx + fx * (length * 0.28) + nx * lateralSign * (entryLateralPx * 0.54) + fx * driftPx * 0.12,
      cy: start.cy + fy * (length * 0.28) + ny * lateralSign * (entryLateralPx * 0.54) + fy * driftPx * 0.12
    });
    const mergePoint = clampPoint({
      cx: start.cx + fx * (length * 0.54) + nx * lateralSign * mergeLateralPx + fx * driftPx * 0.34,
      cy: start.cy + fy * (length * 0.54) + ny * lateralSign * mergeLateralPx + fy * driftPx * 0.34
    });
    const attackPoint = clampPoint({
      cx: target.cx - fx * closeInPx + nx * lateralSign * attackOffsetPx,
      cy: target.cy - fy * closeInPx + ny * lateralSign * attackOffsetPx
    });
    const overshootPoint = clampPoint({
      cx:
        target.cx +
        fx * (overshootPx * 0.48 + breakForwardPx * 0.12) +
        nx * lateralSign * Math.max(attackOffsetPx * 0.9, breakLateralPx * 0.24),
      cy:
        target.cy +
        fy * (overshootPx * 0.48 + breakForwardPx * 0.12) +
        ny * lateralSign * Math.max(attackOffsetPx * 0.9, breakLateralPx * 0.24)
    });
    const exitPoint = clampPoint({
      cx: target.cx + fx * (overshootPx + breakForwardPx) + nx * lateralSign * (breakLateralPx * 0.72),
      cy: target.cy + fy * (overshootPx + breakForwardPx) + ny * lateralSign * (breakLateralPx * 0.72)
    });
    const leadPoint = this.buildAirShowHeadingLeadPoint(start, entryPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(44, length * 0.16), Math.max(68, length * 0.22)),
      leadLateralPx: entryLateralPx * 0.22,
      clampCenter: target
    });

    return [
      start,
      leadPoint,
      entryPoint,
      mergePoint,
      attackPoint,
      overshootPoint,
      exitPoint
    ];
  }

  private buildAirShowBreakTurnPath(
    start: AirShowPoint,
    threat: AirShowPoint,
    options: {
      startHeadingDegrees?: number;
      lateralSign?: number;
      entryLateralPx?: number;
      guardForwardPx?: number;
      guardLateralPx?: number;
      exitForwardPx?: number;
      exitLateralPx?: number;
      trailForwardPx?: number;
    } = {}
  ): AirShowPoint[] {
    const dx = threat.cx - start.cx;
    const dy = threat.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const fx = dx / length;
    const fy = dy / length;
    const nx = -fy;
    const ny = fx;
    const lateralSign = options.lateralSign ?? 1;
    const entryLateralPx = options.entryLateralPx ?? 44;
    const guardForwardPx = options.guardForwardPx ?? 22;
    const guardLateralPx = options.guardLateralPx ?? 64;
    const exitForwardPx = options.exitForwardPx ?? 62;
    const exitLateralPx = options.exitLateralPx ?? 80;
    const trailForwardPx = options.trailForwardPx ?? 30;
    const clampPoint = (point: AirShowPoint): AirShowPoint => this.clampPointToViewportBounds(point, threat);
    const setupPoint = clampPoint({
      cx: start.cx + fx * (length * 0.24) + nx * lateralSign * (entryLateralPx * 0.58),
      cy: start.cy + fy * (length * 0.24) + ny * lateralSign * (entryLateralPx * 0.58)
    });
    const guardPoint = clampPoint({
      cx: threat.cx - fx * guardForwardPx + nx * lateralSign * (guardLateralPx * 0.76),
      cy: threat.cy - fy * guardForwardPx + ny * lateralSign * (guardLateralPx * 0.76)
    });
    const turnInPoint = clampPoint({
      cx: threat.cx - fx * Math.max(8, guardForwardPx * 0.12) - nx * lateralSign * Math.max(12, guardLateralPx * 0.14),
      cy: threat.cy - fy * Math.max(8, guardForwardPx * 0.12) - ny * lateralSign * Math.max(12, guardLateralPx * 0.14)
    });
    const crossingPoint = clampPoint({
      cx: threat.cx + fx * Math.max(18, exitForwardPx * 0.28) - nx * lateralSign * Math.max(10, exitLateralPx * 0.22),
      cy: threat.cy + fy * Math.max(18, exitForwardPx * 0.28) - ny * lateralSign * Math.max(10, exitLateralPx * 0.22)
    });
    const exitPoint = clampPoint({
      cx: threat.cx + fx * exitForwardPx - nx * lateralSign * (exitLateralPx * 0.82),
      cy: threat.cy + fy * exitForwardPx - ny * lateralSign * (exitLateralPx * 0.82)
    });
    const trailPoint = clampPoint({
      cx: threat.cx + fx * (exitForwardPx + trailForwardPx) - nx * lateralSign * (exitLateralPx * 0.96),
      cy: threat.cy + fy * (exitForwardPx + trailForwardPx) - ny * lateralSign * (exitLateralPx * 0.96)
    });
    const leadPoint = this.buildAirShowHeadingLeadPoint(start, setupPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(34, length * 0.14), Math.max(52, length * 0.2)),
      leadLateralPx: entryLateralPx * 0.2,
      clampCenter: threat
    });

    return [
      start,
      leadPoint,
      setupPoint,
      guardPoint,
      turnInPoint,
      crossingPoint,
      exitPoint,
      trailPoint
    ];
  }

  private buildAirShowBomberRunPath(
    start: AirShowPoint,
    end: AirShowPoint,
    options: {
      lateralSign?: number;
      corridorWidthPx?: number;
      driftPx?: number;
      startHeadingDegrees?: number;
    } = {}
  ): AirShowPoint[] {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const fx = dx / length;
    const fy = dy / length;
    const nx = -fy;
    const ny = fx;
    const lateralSign = options.lateralSign ?? 1;
    const corridorWidthPx = options.corridorWidthPx ?? 28;
    const driftPx = options.driftPx ?? 36;
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const setupPoint = this.clampPointToViewportBounds(
      {
        cx: start.cx + fx * (length * 0.28) + nx * lateralSign * (corridorWidthPx * 0.32) + fx * driftPx * 0.16,
        cy: start.cy + fy * (length * 0.28) + ny * lateralSign * (corridorWidthPx * 0.32) + fy * driftPx * 0.16
      },
      clampCenter,
      430,
      300
    );
    const cruisePoint = this.clampPointToViewportBounds(
      {
        cx: start.cx + fx * (length * 0.56) + nx * lateralSign * (corridorWidthPx * 0.18) + fx * driftPx * 0.46,
        cy: start.cy + fy * (length * 0.56) + ny * lateralSign * (corridorWidthPx * 0.18) + fy * driftPx * 0.46
      },
      clampCenter,
      430,
      300
    );
    const settlePoint = this.clampPointToViewportBounds(
      {
        cx: start.cx + fx * (length * 0.82) + nx * lateralSign * (corridorWidthPx * 0.08) + fx * driftPx,
        cy: start.cy + fy * (length * 0.82) + ny * lateralSign * (corridorWidthPx * 0.08) + fy * driftPx
      },
      clampCenter,
      430,
      300
    );
    const finalApproach = this.clampPointToViewportBounds(
      {
        cx: end.cx - fx * 8 + nx * lateralSign * (corridorWidthPx * 0.03),
        cy: end.cy - fy * 8 + ny * lateralSign * (corridorWidthPx * 0.03)
      },
      clampCenter,
      430,
      300
    );
    const leadPoint = this.buildAirShowHeadingLeadPoint(start, setupPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(34, length * 0.16), Math.max(48, length * 0.22)),
      leadLateralPx: corridorWidthPx * 0.18,
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const entryBridgePoints = this.buildAirShowPhaseEntryBridge(start, setupPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: lateralSign,
      carryForwardPx: Math.min(Math.max(28, length * 0.12), Math.max(44, length * 0.18)),
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? start;
    const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
      [start, ...entryBridgePoints],
      options.startHeadingDegrees
    );
    const entryLeadPoint = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, setupPoint, {
      startHeadingDegrees: bridgeExitHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(26, length * 0.14), Math.max(38, length * 0.18)),
      leadLateralPx: corridorWidthPx * 0.12,
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const entryLeadIndex = 1 + entryBridgePoints.length;
    const path = [start, ...entryBridgePoints, entryLeadPoint, setupPoint, cruisePoint, settlePoint, finalApproach, end];
    const prunedLeadPath = this.pruneAirShowTurnWaypoint(path, entryLeadIndex, 56);
    return this.pruneAirShowEarlyTurnWaypoints(prunedLeadPath, {
      maxTurnDeg: 52,
      strongTurnDeg: 116,
      maxFirstSegmentPx: 60,
      maxWaypointsToRemove: 2
    }).filter((point, index, points) => {
      const previous = index === 0 ? null : points[index - 1];
      if (!previous) {
        return true;
      }
      return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
  }

  private buildAirShowBomberContinuationPath(
    start: AirShowPoint,
    end: AirShowPoint,
    options: {
      lateralSign?: number;
      corridorWidthPx?: number;
      driftPx?: number;
      startHeadingDegrees?: number;
    } = {}
  ): AirShowPoint[] {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const fx = dx / length;
    const fy = dy / length;
    const nx = -fy;
    const ny = fx;
    const lateralSign = options.lateralSign ?? 1;
    const corridorWidthPx = options.corridorWidthPx ?? 16;
    const driftPx = options.driftPx ?? 10;
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, clampCenter, 430, 300);
    const entryBridgePoints = this.buildAirShowPhaseEntryBridge(start, end, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: lateralSign,
      carryForwardPx: Math.min(Math.max(20, length * 0.1), Math.max(34, length * 0.18)),
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? start;
    const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
      [start, ...entryBridgePoints],
      options.startHeadingDegrees
    );
    const settlePoint = clampPoint({
      cx:
        start.cx +
        fx * (length * 0.46) +
        nx * lateralSign * (corridorWidthPx * 0.08) +
        fx * driftPx * 0.2,
      cy:
        start.cy +
        fy * (length * 0.46) +
        ny * lateralSign * (corridorWidthPx * 0.08) +
        fy * driftPx * 0.2
    });
    const leadPoint = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, settlePoint, {
      startHeadingDegrees: bridgeExitHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(18, length * 0.1), Math.max(28, length * 0.16)),
      leadLateralPx: corridorWidthPx * 0.06,
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const finalApproach = clampPoint({
      cx: end.cx - fx * Math.min(8, Math.max(4, length * 0.08)) + nx * lateralSign * (corridorWidthPx * 0.02),
      cy: end.cy - fy * Math.min(8, Math.max(4, length * 0.08)) + ny * lateralSign * (corridorWidthPx * 0.02)
    });
    const path = [start, ...entryBridgePoints, leadPoint, settlePoint, finalApproach, end];
    return path.filter((point, index) => {
      const previous = index === 0 ? null : path[index - 1];
      if (!previous) {
        return true;
      }
      return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
  }

  private buildAirShowBomberTargetRunPath(
    start: AirShowPoint,
    end: AirShowPoint,
    options: {
      lateralSign?: number;
      corridorWidthPx?: number;
      startHeadingDegrees?: number;
    } = {}
  ): AirShowPoint[] {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const fx = dx / length;
    const fy = dy / length;
    const nx = -fy;
    const ny = fx;
    const lateralSign = options.lateralSign ?? 1;
    const corridorWidthPx = options.corridorWidthPx ?? 10;
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const bridgePoints = this.buildAirShowPhaseEntryBridge(start, end, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: lateralSign,
      carryForwardPx: Math.min(Math.max(42, length * 0.22), Math.max(60, length * 0.3)),
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const bridgeExitPoint = bridgePoints[bridgePoints.length - 1] ?? start;
    const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
      [start, ...bridgePoints],
      options.startHeadingDegrees
    );
    const turnSettlePoint = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, end, {
      startHeadingDegrees: bridgeExitHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(26, length * 0.18), Math.max(40, length * 0.24)),
      leadLateralPx: corridorWidthPx * 0.08,
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const releasePoint = this.clampPointToViewportBounds(
      {
        cx: start.cx + fx * (length * 0.62) + nx * lateralSign * (corridorWidthPx * 0.04),
        cy: start.cy + fy * (length * 0.62) + ny * lateralSign * (corridorWidthPx * 0.04)
      },
      clampCenter,
      430,
      300
    );
    const finalApproach = this.clampPointToViewportBounds(
      {
        cx: end.cx - fx * Math.min(10, Math.max(6, length * 0.12)) + nx * lateralSign * (corridorWidthPx * 0.02),
        cy: end.cy - fy * Math.min(10, Math.max(6, length * 0.12)) + ny * lateralSign * (corridorWidthPx * 0.02)
      },
      clampCenter,
      430,
      300
    );
    const path = [start, ...bridgePoints, turnSettlePoint, releasePoint, finalApproach, end];
    return path.filter((point, index) => {
      const previous = index === 0 ? null : path[index - 1];
      if (!previous) {
        return true;
      }
      return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
  }

  private buildAirShowDisengagePath(
    start: AirShowPoint,
    end: AirShowPoint,
    options: {
      lateralSign?: number;
      corridorWidthPx?: number;
      driftPx?: number;
      startHeadingDegrees?: number;
    } = {}
  ): AirShowPoint[] {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const lateralSign = options.lateralSign ?? 1;
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const entryBridgePoints = this.buildAirShowPhaseEntryBridge(start, end, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: lateralSign,
      carryForwardPx: Math.min(Math.max(30, length * 0.12), Math.max(48, length * 0.2)),
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? start;
    const breakawayLead = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, end, {
      startHeadingDegrees: this.resolveAirShowPathHeadingDegrees(
        [start, ...entryBridgePoints],
        options.startHeadingDegrees
      ),
      lateralSign,
      leadForwardPx: Math.min(Math.max(28, length * 0.14), Math.max(42, length * 0.2)),
      leadLateralPx: Math.max(8, (options.corridorWidthPx ?? 20) * 0.16),
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const breakawayHeading = this.resolveAirShowPathHeadingDegrees(
      [start, ...entryBridgePoints, breakawayLead],
      options.startHeadingDegrees
    );
    const continuation = this.buildAirShowBomberRunPath(breakawayLead, end, {
      lateralSign,
      corridorWidthPx: options.corridorWidthPx,
      driftPx: options.driftPx,
      startHeadingDegrees: breakawayHeading
    });
    return [start, ...entryBridgePoints, breakawayLead, ...continuation.slice(1)];
  }

  private buildAirShowDogfightPassPath(
    start: AirShowPoint,
    focus: AirShowPoint,
    corridor: AirShowCorridor,
    options: {
      sideSign: number;
      laneIndex?: number;
      passSign?: number;
      startHeadingDegrees?: number;
      entrySeparationPx?: number;
      crossSeparationPx?: number;
      overshootPx?: number;
      turnRadiusPx?: number;
    }
  ): AirShowPoint[] {
    const laneIndex = options.laneIndex ?? 0;
    const sideSign = options.sideSign >= 0 ? 1 : -1;
    const passSign = (options.passSign ?? 1) >= 0 ? 1 : -1;
    const reengage = passSign < 0;
    const entrySeparationPx = options.entrySeparationPx ?? 176;
    const crossSeparationPx = options.crossSeparationPx ?? 24;
    const overshootPx = options.overshootPx ?? 184;
    const turnRadiusPx = options.turnRadiusPx ?? 162;
    const laneSpreadPx = laneIndex * 45;
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, corridor.center, 430, 300);
    const focusPoint = clampPoint(focus);
    const pointFromFocus = (alongPx: number, lateralPx: number): AirShowPoint =>
      clampPoint({
        cx: focusPoint.cx + corridor.axis.x * alongPx + corridor.normal.x * lateralPx,
        cy: focusPoint.cy + corridor.axis.y * alongPx + corridor.normal.y * lateralPx
      });
    const buildEntryTurn = (
      target: AirShowPoint,
      lateralSign: number,
      carryForwardPx: number,
      leadForwardPx: number
    ): AirShowPoint[] => {
      const rawEntryBridgePoints = this.buildAirShowPhaseEntryBridge(start, target, {
        startHeadingDegrees: options.startHeadingDegrees,
        sideSign: lateralSign,
        clampCenter: corridor.center,
        carryForwardPx,
        maxHorizontalPx: 430,
        maxVerticalPx: 300
      });
      const entryBridgePoints = [...rawEntryBridgePoints];
      while (entryBridgePoints.length > 1) {
        const firstPoint = entryBridgePoints[0];
        const secondPoint = entryBridgePoints[1];
        if (!firstPoint || !secondPoint) {
          break;
        }
        const firstTurnDeg = this.resolveAirShowWaypointTurnDegrees(start, firstPoint, secondPoint);
        const firstSegmentPx = Math.hypot(firstPoint.cx - start.cx, firstPoint.cy - start.cy);
        if (firstTurnDeg <= 96 || firstSegmentPx >= 36) {
          break;
        }
        entryBridgePoints.shift();
      }
      const buildLeadPoint = (bridgePoints: ReadonlyArray<AirShowPoint>): AirShowPoint => {
        const bridgeExitPoint = bridgePoints[bridgePoints.length - 1] ?? start;
        const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
          [start, ...bridgePoints],
          options.startHeadingDegrees
        );
        return this.buildAirShowHeadingLeadPoint(bridgeExitPoint, target, {
          startHeadingDegrees: bridgeExitHeadingDegrees,
          lateralSign,
          leadForwardPx,
          leadLateralPx: 10,
          clampCenter: corridor.center,
          maxHorizontalPx: 430,
          maxVerticalPx: 300
        });
      };
      let leadPoint = buildLeadPoint(entryBridgePoints);
      while (entryBridgePoints.length > 0) {
        const previous =
          entryBridgePoints.length >= 2 ? entryBridgePoints[entryBridgePoints.length - 2] : start;
        const current = entryBridgePoints[entryBridgePoints.length - 1];
        if (!previous || !current) {
          break;
        }
        const exitTurnDeg = this.resolveAirShowWaypointTurnDegrees(previous, current, leadPoint);
        const exitSegmentPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
        if (exitTurnDeg <= 104 || exitSegmentPx >= 42) {
          break;
        }
        entryBridgePoints.pop();
        leadPoint = buildLeadPoint(entryBridgePoints);
      }
      leadPoint = buildLeadPoint(entryBridgePoints);
      const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? start;
      const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
        [start, ...entryBridgePoints],
        options.startHeadingDegrees
      );
      const finalLeadPoint = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, target, {
        startHeadingDegrees: bridgeExitHeadingDegrees,
        lateralSign,
        leadForwardPx,
        leadLateralPx: 10,
        clampCenter: corridor.center,
        maxHorizontalPx: 430,
        maxVerticalPx: 300
      });
      const entryPath = [start, ...entryBridgePoints, finalLeadPoint, target];
      const smoothedEntryPath = this.pruneAirShowEarlyTurnWaypoints(entryPath, {
        maxTurnDeg: 52,
        strongTurnDeg: 116,
        maxFirstSegmentPx: 58,
        maxWaypointsToRemove: 2
      });
      return this.pruneAirShowTurnWaypoint(smoothedEntryPath, smoothedEntryPath.length - 2, 56);
    };

    if (reengage) {
      // Authored reengage pass: Approach arc → Commit pass → Break turn → Rejoin arc → Egress arc
      // No direction reversals. Control-point noise only at approach entry.
      const approachEntry = pointFromFocus(
        -sideSign * Math.max(14, entrySeparationPx * 0.08),
        sideSign * Math.max(54, entrySeparationPx * 0.36 + laneSpreadPx * 0.12)
      );
      const approachTurn = buildEntryTurn(approachEntry, sideSign, 52, 42);
      // Commit pass: monotonic sweep through the focal zone
      const commitPoint = pointFromFocus(
        sideSign * Math.max(8, crossSeparationPx * 0.45),
        sideSign * Math.max(8, crossSeparationPx * 0.6 + laneIndex * 4)
      );
      // Break turn: sharp exit arc away from focal zone, same lateral direction — no reversal
      const breakApex = pointFromFocus(
        sideSign * Math.max(44, turnRadiusPx * 0.3),
        -sideSign * Math.max(52, turnRadiusPx * 0.34 + laneSpreadPx * 0.12)
      );
      // Rejoin arc: sweeps outward continuing the break direction
      const rejoinArc = pointFromFocus(
        sideSign * Math.max(92, overshootPx * 0.52),
        -sideSign * Math.max(70, turnRadiusPx * 0.46 + laneSpreadPx * 0.14)
      );
      // Egress arc: exits the engagement zone cleanly
      const egressEnd = pointFromFocus(
        sideSign * Math.max(138, overshootPx * 0.8),
        -sideSign * Math.max(40, turnRadiusPx * 0.24 + laneSpreadPx * 0.08)
      );
      return [...approachTurn, commitPoint, breakApex, rejoinArc, egressEnd];
    }
    const turnInPoint = pointFromFocus(
      -sideSign * Math.max(24, entrySeparationPx * 0.15),
      sideSign * Math.max(74, entrySeparationPx * 0.48 + laneSpreadPx * 0.14 + passSign * 4)
    );
    const entryTurn = buildEntryTurn(turnInPoint, sideSign, 58, 48);
    const mergePoint = pointFromFocus(
      -sideSign * Math.max(6, crossSeparationPx * 0.3),
      sideSign * Math.max(22, crossSeparationPx * 1.4 + laneIndex * 22)
    );
    const crossingPoint = pointFromFocus(
      sideSign * Math.max(10, crossSeparationPx * 0.52),
      -sideSign * Math.max(10, crossSeparationPx * 0.92 - 6 + laneIndex * 18)
    );
    // Break turn exit: sweeps away from focal zone in consistent direction — no coil reversal
    const breakExit = pointFromFocus(
      sideSign * Math.max(50, overshootPx * 0.28),
      -sideSign * Math.max(62, turnRadiusPx * 0.42 + laneSpreadPx * 0.1 + passSign * 6)
    );
    // Egress continues the break direction monotonically
    const egressPoint = pointFromFocus(
      sideSign * Math.max(104, overshootPx * 0.6),
      -sideSign * Math.max(46, turnRadiusPx * 0.32 + laneSpreadPx * 0.08)
    );

    return [...entryTurn, mergePoint, crossingPoint, breakExit, egressPoint];
  }

  private resolveAirShowHeadingVector(headingDegrees: number): { x: number; y: number } {
    return this.normalizeAircraftVector(
      Math.cos(((headingDegrees - 90) * Math.PI) / 180),
      Math.sin(((headingDegrees - 90) * Math.PI) / 180),
      0,
      -1
    );
  }

  private resolveAirShowFlightHeadingDegrees(flight: AirShowRuntimeFlightInternal): number {
    const activeActors = flight.actors.filter((actor) => actor.active);
    if (activeActors.length === 0) {
      return 0;
    }
    const vector = activeActors.reduce(
      (acc, actor) => {
        const heading = this.resolveAirShowHeadingVector(actor.headingDegrees);
        acc.x += heading.x;
        acc.y += heading.y;
        return acc;
      },
      { x: 0, y: 0 }
    );
    return this.resolveAircraftHeadingDegrees(vector.x, vector.y, activeActors[0]?.headingDegrees ?? 0);
  }

  private resolveAirShowCorridorSideSign(
    point: AirShowPoint,
    corridor: AirShowCorridor,
    fallback = 1
  ): number {
    const lateralOffset =
      (point.cx - corridor.center.cx) * corridor.normal.x +
      (point.cy - corridor.center.cy) * corridor.normal.y;
    if (Math.abs(lateralOffset) > 4) {
      return lateralOffset >= 0 ? 1 : -1;
    }
    return fallback >= 0 ? 1 : -1;
  }

  private resolveAirShowRouteSideSign(
    start: AirShowPoint,
    end: AirShowPoint,
    startHeadingDegrees?: number,
    fallback = 1
  ): number {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const routeNormal = { x: -dy / length, y: dx / length };
    if (typeof startHeadingDegrees === "number") {
      const headingForward = this.resolveAirShowHeadingVector(startHeadingDegrees);
      const lateralDot = headingForward.x * routeNormal.x + headingForward.y * routeNormal.y;
      if (Math.abs(lateralDot) > 0.08) {
        return lateralDot >= 0 ? 1 : -1;
      }
    }
    return fallback >= 0 ? 1 : -1;
  }

  private buildAirShowScreenRunPath(
    start: AirShowPoint,
    corridor: AirShowCorridor,
    options: {
      endAlongPx: number;
      baseLateralPx: number;
      laneIndex?: number;
      sideSign?: number;
      alongStepPx?: number;
      lateralStepPx?: number;
      corridorWidthPx?: number;
      driftPx?: number;
      startHeadingDegrees?: number;
    }
  ): AirShowPoint[] {
    const laneIndex = options.laneIndex ?? 0;
    const sideSign = options.sideSign ?? 1;
    const destination = this.clampPointToViewportBounds(
      this.projectAirShowCorridorPoint(
        corridor,
        options.endAlongPx + laneIndex * (options.alongStepPx ?? 18),
        options.baseLateralPx + laneIndex * (options.lateralStepPx ?? 28)
      ),
      corridor.center,
      430,
      300
    );
    return this.buildAirShowBomberRunPath(start, destination, {
      lateralSign: sideSign >= 0 ? 1 : -1,
      corridorWidthPx: options.corridorWidthPx ?? 18,
      driftPx: options.driftPx ?? 18,
      startHeadingDegrees: options.startHeadingDegrees
    });
  }

  private buildAirShowTargetRunEscortPath(
    start: AirShowPoint,
    targetApproach: AirShowPoint,
    corridor: AirShowCorridor,
    options: {
      laneIndex?: number;
      sideSign?: number;
      alongOffsetPx?: number;
      lateralBasePx?: number;
      lateralStepPx?: number;
      corridorWidthPx?: number;
      driftPx?: number;
      startHeadingDegrees?: number;
    } = {}
  ): AirShowPoint[] {
    const laneIndex = options.laneIndex ?? 0;
    const sideSign = options.sideSign ?? 1;
    const destination = this.clampPointToViewportBounds(
      {
        cx:
          targetApproach.cx +
          corridor.axis.x * (options.alongOffsetPx ?? 52) +
          corridor.normal.x * sideSign * ((options.lateralBasePx ?? 118) + laneIndex * (options.lateralStepPx ?? 34)),
        cy:
          targetApproach.cy +
          corridor.axis.y * (options.alongOffsetPx ?? 52) +
          corridor.normal.y * sideSign * ((options.lateralBasePx ?? 118) + laneIndex * (options.lateralStepPx ?? 34))
      },
      corridor.center,
      430,
      300
    );
    return this.buildAirShowBomberRunPath(start, destination, {
      lateralSign: sideSign >= 0 ? 1 : -1,
      corridorWidthPx: options.corridorWidthPx ?? 18,
      driftPx: options.driftPx ?? 18,
      startHeadingDegrees: options.startHeadingDegrees
    });
  }

  private resolveAirShowIngressBandPlan(
    sceneKind: ResolvedAirShowScene["kind"] | undefined,
    role: "interceptor" | "escort"
  ): {
    alongPx: number;
    lateralPx: number;
    alongStepPx: number;
    lateralStepPx: number;
    jitterAlongPx: number;
    jitterLateralPx: number;
    arcPx: number;
    driftPx: number;
    headingBlend: number;
  } {
    if (sceneKind === "airToAir" && role === "interceptor") {
      return {
        alongPx: -86,
        lateralPx: -184,
        alongStepPx: 38,
        lateralStepPx: 56,
        jitterAlongPx: 0,
        jitterLateralPx: 0,
        arcPx: 42,
        driftPx: 56,
        headingBlend: 0.26
      };
    }
    if (sceneKind === "airToAir" && role === "escort") {
      return {
        alongPx: 82,
        lateralPx: 188,
        alongStepPx: 34,
        lateralStepPx: 56,
        jitterAlongPx: 0,
        jitterLateralPx: 0,
        arcPx: 38,
        driftPx: 52,
        headingBlend: 0.26
      };
    }
    if (role === "interceptor") {
      return {
        alongPx: -86,
        lateralPx: -184,
        alongStepPx: 42,
        lateralStepPx: 58,
        jitterAlongPx: 0,
        jitterLateralPx: 0,
        arcPx: 28,
        driftPx: 42,
        headingBlend: 0.28
      };
    }
    return {
      alongPx: -18,
      lateralPx: 158,
      alongStepPx: 30,
      lateralStepPx: 54,
      jitterAlongPx: 0,
      jitterLateralPx: 0,
      arcPx: 28,
      driftPx: 40,
      headingBlend: 0.28
    };
  }

  private buildAirShowBomberInterceptPassPath(
    start: AirShowPoint,
    corridor: AirShowCorridor,
    options: {
      passStartAlongPx: number;
      passEndAlongPx: number;
      laneIndex?: number;
      attackSideSign?: number;
      startHeadingDegrees?: number;
    }
  ): AirShowPoint[] {
    const laneIndex = options.laneIndex ?? 0;
    const attackSideSign = options.attackSideSign ?? 1;
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, corridor.center, 420, 280);
    const pointOnCorridor = (alongPx: number, lateralPx: number): AirShowPoint =>
      clampPoint(this.projectAirShowCorridorPoint(corridor, alongPx, lateralPx));
    const approachPoint = pointOnCorridor(
      options.passStartAlongPx - 112,
      laneIndex * 22 + attackSideSign * 92
    );
    const alignmentPoint = pointOnCorridor(
      options.passStartAlongPx - 40,
      laneIndex * 12 + attackSideSign * 42
    );
    const firingPoint = pointOnCorridor(
      options.passStartAlongPx + 18,
      laneIndex * 6 + attackSideSign * 12
    );
    const crossingPoint = pointOnCorridor(
      options.passEndAlongPx - 12,
      -laneIndex * 8 - attackSideSign * 10
    );
    const extendPoint = pointOnCorridor(
      options.passEndAlongPx + 54,
      -laneIndex * 14 - attackSideSign * 42
    );
    const exitPoint = pointOnCorridor(
      options.passEndAlongPx + 136,
      -laneIndex * 24 - attackSideSign * 92
    );
    const entryBridgePoints = this.buildAirShowPhaseEntryBridge(start, approachPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: attackSideSign,
      carryForwardPx: 82,
      clampCenter: corridor.center,
      maxHorizontalPx: 420,
      maxVerticalPx: 280
    });
    const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? start;
    const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
      [start, ...entryBridgePoints],
      options.startHeadingDegrees
    );
    const headingLead = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, approachPoint, {
      startHeadingDegrees: bridgeExitHeadingDegrees,
      lateralSign: attackSideSign,
      leadForwardPx: 64,
      leadLateralPx: 14,
      clampCenter: corridor.center,
      maxHorizontalPx: 420,
      maxVerticalPx: 280
    });
    const headingLeadIndex = 1 + entryBridgePoints.length;
    const path = [
      start,
      ...entryBridgePoints,
      headingLead,
      approachPoint,
      alignmentPoint,
      firingPoint,
      crossingPoint,
      extendPoint,
      exitPoint
    ];
    return this.pruneAirShowEarlyTurnWaypoints(
      this.pruneAirShowTurnWaypoint(path, headingLeadIndex, 52),
      {
        maxTurnDeg: 52,
        strongTurnDeg: 116,
        maxFirstSegmentPx: 60,
        maxWaypointsToRemove: 2
      }
    );
  }

  private resolveAirShowPathForwardVector(
    routeForward: { x: number; y: number },
    startHeadingDegrees?: number,
    minRouteDot = 0.14
  ): { x: number; y: number } {
    if (typeof startHeadingDegrees !== "number") {
      return routeForward;
    }
    const headingForward = this.resolveAirShowHeadingVector(startHeadingDegrees);
    const dot = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
    if (dot >= minRouteDot) {
      return headingForward;
    }
    const routeBlend = this.clamp((minRouteDot - dot) / (1 - Math.max(-1, dot)), 0.38, 0.92);
    return this.normalizeAircraftVector(
      headingForward.x * (1 - routeBlend) + routeForward.x * routeBlend,
      headingForward.y * (1 - routeBlend) + routeForward.y * routeBlend,
      routeForward.x,
      routeForward.y
    );
  }

  private buildAirShowHeadingLeadPoint(
    start: AirShowPoint,
    toward: AirShowPoint,
    options: {
      startHeadingDegrees?: number;
      lateralSign?: number;
      leadForwardPx?: number;
      leadLateralPx?: number;
      clampCenter?: AirShowPoint;
      maxHorizontalPx?: number;
      maxVerticalPx?: number;
    } = {}
  ): AirShowPoint {
    const dx = toward.cx - start.cx;
    const dy = toward.cy - start.cy;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const routeForward = this.normalizeAircraftVector(dx, dy, 0, -1);
    const routeNormal = { x: -routeForward.y, y: routeForward.x };
    const headingForward = this.resolveAirShowPathForwardVector(
      routeForward,
      options.startHeadingDegrees
    );
    const alignment = this.clamp((headingForward.x * routeForward.x + headingForward.y * routeForward.y + 1) * 0.5, 0, 1);
    const blendedForward = this.normalizeAircraftVector(
      headingForward.x * (0.16 + alignment * 0.34) + routeForward.x * (0.84 - alignment * 0.34),
      headingForward.y * (0.16 + alignment * 0.34) + routeForward.y * (0.84 - alignment * 0.34),
      routeForward.x,
      routeForward.y
    );
    const requestedForwardPx = options.leadForwardPx ?? Math.max(30, distance * 0.22);
    const forwardPx = Math.min(
      requestedForwardPx * (0.34 + alignment * 0.66),
      Math.max(12, distance * (0.22 + alignment * 0.34))
    );
    const lateralSign = options.lateralSign ?? 0;
    const requestedLateralPx = Math.abs(options.leadLateralPx ?? 0);
    const lateralPx =
      Math.min(requestedLateralPx, Math.max(0, distance * (0.08 + alignment * 0.08))) *
      lateralSign;
    const rawPoint = {
      cx: start.cx + blendedForward.x * forwardPx + routeNormal.x * lateralPx,
      cy: start.cy + blendedForward.y * forwardPx + routeNormal.y * lateralPx
    };
    const progressAlongRoute =
      (rawPoint.cx - start.cx) * routeForward.x + (rawPoint.cy - start.cy) * routeForward.y;
    const clampedAlongRoute = this.clamp(
      progressAlongRoute,
      distance * (0.1 + alignment * 0.08),
      distance * (0.38 + alignment * 0.22)
    );
    const point = {
      cx: start.cx + routeForward.x * clampedAlongRoute + routeNormal.x * lateralPx,
      cy: start.cy + routeForward.y * clampedAlongRoute + routeNormal.y * lateralPx
    };
    return options.clampCenter
      ? this.clampPointToViewportBounds(
          point,
          options.clampCenter,
          options.maxHorizontalPx ?? 430,
          options.maxVerticalPx ?? 300
        )
      : point;
  }

  private buildAirShowHeadingCarryPoint(
    start: AirShowPoint,
    options: {
      startHeadingDegrees?: number;
      toward: AirShowPoint;
      carryForwardPx?: number;
      clampCenter?: AirShowPoint;
      maxHorizontalPx?: number;
      maxVerticalPx?: number;
    }
  ): AirShowPoint {
    const dx = options.toward.cx - start.cx;
    const dy = options.toward.cy - start.cy;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const routeForward = this.normalizeAircraftVector(dx, dy, 0, -1);
    const headingForward =
      typeof options.startHeadingDegrees === "number"
        ? this.resolveAirShowHeadingVector(options.startHeadingDegrees)
        : routeForward;
    const alignment = this.clamp((headingForward.x * routeForward.x + headingForward.y * routeForward.y + 1) * 0.5, 0, 1);
    const forward = this.normalizeAircraftVector(
      headingForward.x * (0.1 + alignment * 0.56) + routeForward.x * (0.9 - alignment * 0.56),
      headingForward.y * (0.1 + alignment * 0.56) + routeForward.y * (0.9 - alignment * 0.56),
      routeForward.x,
      routeForward.y
    );
    const carryForwardPx = Math.min(
      (options.carryForwardPx ?? 48) * (0.14 + alignment * 0.86),
      Math.max(8, distance * (0.08 + alignment * 0.26))
    );
    const point = {
      cx: start.cx + forward.x * carryForwardPx,
      cy: start.cy + forward.y * carryForwardPx
    };
    return options.clampCenter
      ? this.clampPointToViewportBounds(
          point,
          options.clampCenter,
          options.maxHorizontalPx ?? 430,
          options.maxVerticalPx ?? 300
        )
      : point;
  }

  private resolveAirShowPathHeadingDegrees(
    points: ReadonlyArray<AirShowPoint>,
    fallbackHeadingDegrees?: number
  ): number | undefined {
    for (let index = points.length - 1; index > 0; index -= 1) {
      const current = points[index];
      const previous = points[index - 1];
      if (!current || !previous) {
        continue;
      }
      const dx = current.cx - previous.cx;
      const dy = current.cy - previous.cy;
      if (Math.hypot(dx, dy) < 1) {
        continue;
      }
      return this.resolveAircraftHeadingDegrees(dx, dy, fallbackHeadingDegrees ?? 0);
    }
    return typeof fallbackHeadingDegrees === "number" ? fallbackHeadingDegrees : undefined;
  }

  private buildAirShowPhaseEntryBridge(
    start: AirShowPoint,
    toward: AirShowPoint,
    options: {
      startHeadingDegrees?: number;
      sideSign?: number;
      carryForwardPx?: number;
      clampCenter?: AirShowPoint;
      maxHorizontalPx?: number;
      maxVerticalPx?: number;
    }
  ): AirShowPoint[] {
    const dx = toward.cx - start.cx;
    const dy = toward.cy - start.cy;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const routeForward = this.normalizeAircraftVector(dx, dy, 0, -1);
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      options.clampCenter
        ? this.clampPointToViewportBounds(
            point,
            options.clampCenter,
            options.maxHorizontalPx ?? 430,
            options.maxVerticalPx ?? 300
          )
        : point;
    const buildCarryOnlyBridge = (): AirShowPoint[] => {
      const carryPoint = this.buildAirShowHeadingCarryPoint(start, {
        startHeadingDegrees: options.startHeadingDegrees,
        toward,
        carryForwardPx: options.carryForwardPx,
        clampCenter: options.clampCenter,
        maxHorizontalPx: options.maxHorizontalPx,
        maxVerticalPx: options.maxVerticalPx
      });
      if (
        typeof options.startHeadingDegrees === "number"
        && this.resolveAirShowWaypointTurnDegrees(start, carryPoint, toward) > 52
      ) {
        return [];
      }
      return [carryPoint];
    };
    if (typeof options.startHeadingDegrees !== "number") {
      return buildCarryOnlyBridge();
    }

    const headingForward = this.resolveAirShowHeadingVector(options.startHeadingDegrees);
    const dot = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
    if (dot >= 0.48) {
      return buildCarryOnlyBridge();
    }

    const routeNormal = { x: -routeForward.y, y: routeForward.x };
    const turnCross = headingForward.x * routeForward.y - headingForward.y * routeForward.x;
    const turnSign =
      Math.abs(turnCross) > 0.08
        ? (turnCross >= 0 ? 1 : -1)
        : (options.sideSign ?? 1) >= 0
          ? 1
          : -1;
    const reversalFactor = this.clamp((0.48 - dot) / 1.48, 0, 1);
    const carryDistancePx = Math.min(
      Math.max(options.carryForwardPx ?? 56, distance * (0.2 + reversalFactor * 0.12)),
      Math.max(96, distance * (0.34 + reversalFactor * 0.12))
    );
    const lateralArcPx = Math.min(
      Math.max(46, distance * (0.14 + reversalFactor * 0.12)),
      Math.max(98, distance * (0.3 + reversalFactor * 0.08))
    );
    const joinAlongPx = Math.min(
      Math.max(52, distance * (0.18 + reversalFactor * 0.1)),
      Math.max(92, distance * (0.34 + reversalFactor * 0.08))
    );
    const joinLateralPx = Math.min(
      lateralArcPx * (0.18 + reversalFactor * 0.18),
      Math.max(20, distance * 0.16)
    );
    const handleInPx = Math.min(
      Math.max(30, joinAlongPx * (0.4 + reversalFactor * 0.12)),
      Math.max(56, distance * (0.18 + reversalFactor * 0.06))
    );
    const carryPointA = clampPoint({
      cx:
        start.cx +
        headingForward.x * (carryDistancePx * 0.42) +
        routeNormal.x * turnSign * (lateralArcPx * (0.04 + reversalFactor * 0.05)),
      cy:
        start.cy +
        headingForward.y * (carryDistancePx * 0.42) +
        routeNormal.y * turnSign * (lateralArcPx * (0.04 + reversalFactor * 0.05))
    });
    const carryPointB = clampPoint({
      cx:
        start.cx +
        headingForward.x * carryDistancePx +
        routeNormal.x * turnSign * (lateralArcPx * (0.1 + reversalFactor * 0.09)),
      cy:
        start.cy +
        headingForward.y * carryDistancePx +
        routeNormal.y * turnSign * (lateralArcPx * (0.1 + reversalFactor * 0.09))
    });
    const startControl = clampPoint({
      cx:
        carryPointB.cx +
        headingForward.x * Math.max(34, carryDistancePx * (0.22 + reversalFactor * 0.1)) +
        routeNormal.x * turnSign * (lateralArcPx * (0.18 + reversalFactor * 0.16)),
      cy:
        carryPointB.cy +
        headingForward.y * Math.max(34, carryDistancePx * (0.22 + reversalFactor * 0.1)) +
        routeNormal.y * turnSign * (lateralArcPx * (0.18 + reversalFactor * 0.16))
    });
    const joinPoint = clampPoint({
      cx: start.cx + routeForward.x * joinAlongPx + routeNormal.x * turnSign * joinLateralPx,
      cy: start.cy + routeForward.y * joinAlongPx + routeNormal.y * turnSign * joinLateralPx
    });
    const joinControl = clampPoint({
      cx:
        joinPoint.cx -
        routeForward.x * handleInPx +
        routeNormal.x * turnSign * (lateralArcPx * (0.14 + reversalFactor * 0.12)),
      cy:
        joinPoint.cy -
        routeForward.y * handleInPx +
        routeNormal.y * turnSign * (lateralArcPx * (0.14 + reversalFactor * 0.12))
    });
    const cubicPointAt = (progress: number): AirShowPoint => {
      const t = this.clamp(progress, 0, 1);
      const oneMinusT = 1 - t;
      const oneMinusT2 = oneMinusT * oneMinusT;
      const t2 = t * t;
        return clampPoint({
        cx:
          oneMinusT2 * oneMinusT * carryPointB.cx +
          3 * oneMinusT2 * t * startControl.cx +
          3 * oneMinusT * t2 * joinControl.cx +
          t2 * t * joinPoint.cx,
        cy:
          oneMinusT2 * oneMinusT * carryPointB.cy +
          3 * oneMinusT2 * t * startControl.cy +
          3 * oneMinusT * t2 * joinControl.cy +
          t2 * t * joinPoint.cy
      });
    };
    const stepCount = reversalFactor > 0.66 ? 4 : reversalFactor > 0.28 ? 3 : 2;
    const samples = [
      carryPointA,
      carryPointB,
      ...Array.from({ length: stepCount }, (_, index) =>
        cubicPointAt((index + 1) / stepCount)
      )
    ];
    const prunedSamples = [...samples];
    while (prunedSamples.length > 1) {
      const firstPoint = prunedSamples[0];
      const secondPoint = prunedSamples[1];
      if (!firstPoint || !secondPoint) {
        break;
      }
      const firstTurnDeg = this.resolveAirShowWaypointTurnDegrees(start, firstPoint, secondPoint);
      const firstSegmentPx = Math.hypot(firstPoint.cx - start.cx, firstPoint.cy - start.cy);
      if (firstTurnDeg <= 52 || (firstTurnDeg < 120 && firstSegmentPx > 56)) {
        break;
      }
      prunedSamples.shift();
    }
    const simplifiedSamples = [...prunedSamples];
    let simplifiedIndex = 1;
    while (simplifiedIndex < simplifiedSamples.length - 1) {
      const previous = simplifiedSamples[simplifiedIndex - 1];
      const current = simplifiedSamples[simplifiedIndex];
      const next = simplifiedSamples[simplifiedIndex + 1];
      if (!previous || !current || !next) {
        break;
      }
      const turnDeg = this.resolveAirShowWaypointTurnDegrees(previous, current, next);
      const previousSegmentPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
      const nextSegmentPx = Math.hypot(next.cx - current.cx, next.cy - current.cy);
      if (turnDeg <= 124 || (previousSegmentPx >= 10 && nextSegmentPx >= 10)) {
        simplifiedIndex += 1;
        continue;
      }
      simplifiedSamples.splice(simplifiedIndex, 1);
      simplifiedIndex = Math.max(1, simplifiedIndex - 1);
    }
    while (simplifiedSamples.length > 1) {
      const previous =
        simplifiedSamples.length >= 2
          ? simplifiedSamples[simplifiedSamples.length - 2]
          : start;
      const current = simplifiedSamples[simplifiedSamples.length - 1];
      if (!previous || !current) {
        break;
      }
      const exitTurnDeg = this.resolveAirShowWaypointTurnDegrees(previous, current, toward);
      const exitSegmentPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
      if (exitTurnDeg <= 120 || exitSegmentPx >= 44) {
        break;
      }
      simplifiedSamples.pop();
    }
    while (simplifiedSamples.length > 1) {
      const firstPoint = simplifiedSamples[0];
      const secondPoint = simplifiedSamples[1];
      if (!firstPoint || !secondPoint) {
        break;
      }
      const firstTurnDeg = this.resolveAirShowWaypointTurnDegrees(start, firstPoint, secondPoint);
      const firstSegmentPx = Math.hypot(firstPoint.cx - start.cx, firstPoint.cy - start.cy);
      if (firstTurnDeg <= 52 || (firstTurnDeg < 120 && firstSegmentPx > 56)) {
        break;
      }
      simplifiedSamples.shift();
    }
    if (simplifiedSamples.length === 1) {
      const onlyPoint = simplifiedSamples[0];
      if (onlyPoint && this.resolveAirShowWaypointTurnDegrees(start, onlyPoint, toward) > 52) {
        return [];
      }
    }
    return simplifiedSamples.filter((point, index) => {
      const previous = index === 0 ? start : simplifiedSamples[index - 1];
      return !!previous && Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
  }

  private buildAirShowFlightAssignments(
    flight: AirShowRuntimeFlightInternal,
    basePath: AirShowPoint[],
    headingBlend = 0.34,
    flightIndex = 0,
    totalFlights = 1
  ): AirShowPhaseAssignment[] {
    // Multi-flight separation: when multiple flights share a phase, add lateral offset
    // per flight to prevent formation overlap. 80px per flight index ensures readable separation.
    // This offset is stored in the assignment but NOT added to the path points (to preserve
    // phase handoff continuity). It is applied during sampling/rendering only.
    const multiFlightOffsetPx = totalFlights > 1
      ? (flightIndex - (totalFlights - 1) / 2) * 80
      : 0;
    // Include ALL actors in phase assignments to maintain formation continuity.
    // Visual visibility is controlled per-actor via opacity in syncAirShowFlightStrengthForInspection.
    // This prevents aircraft from "disappearing" at target hex between phases.
    return flight.actors
      .map((actor) => ({
        actor,
        points: basePath.map((point, pointIndex) => ({
          // Preserve each actor's formation lane through the full phase so the
          // next beat begins from the true prior endpoint instead of re-staging.
          // Store unbiased path points; multi-flight offset applied during sampling.
          cx: point.cx + actor.biasX,
          cy: point.cy + actor.biasY
        })),
        headingBlend,
        progressOffset:
          (actor.formationIndex - (flight.actors.length - 1) / 2) * 0.018 +
          (actor.role === "bomber" ? 0.008 : actor.role === "escort" ? 0.004 : -0.004),
        multiFlightOffsetPx
      }));
  }

  private sampleAirShowAssignmentAtProgress(
    assignment: AirShowPhaseAssignment,
    progress: number
  ): Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size"> {
    const sample = this.sampleAircraftWaypointPath(
      assignment.points,
      this.clamp(progress + (assignment.progressOffset ?? 0), 0, 1)
    );
    // Apply multi-flight offset for visual separation without breaking phase continuity
    const offsetPx = assignment.multiFlightOffsetPx ?? 0;
    return {
      position: {
        cx: sample.point.cx + offsetPx,
        cy: sample.point.cy
      },
      headingDegrees: this.resolveAircraftHeadingDegrees(
        sample.derivative.dx,
        sample.derivative.dy,
        assignment.actor.headingDegrees
      ),
      size: assignment.actor.size
    };
  }

  private buildAirShowAssignmentLookup(
    assignments: ReadonlyArray<AirShowPhaseAssignment>
  ): Map<string, AirShowPhaseAssignment> {
    return new Map(assignments.map((assignment) => [assignment.actor.id, assignment] as const));
  }

  /**
   * Resolves collision-aware spacing across all phase assignments.
   * Enforces minimum spacing between actors from different flights during combat phases.
   * Per North Star Spec: 0.8 sprite widths (same-role), 1.0 (different-role).
   */
  private resolveAirShowPhaseSpacing(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    progressSamplePoints: number[] = [0.3, 0.5, 0.7] // Check spacing at multiple points along paths
  ): AirShowPhaseAssignment[] {
    // Get all active actors
    const allActors = assignments.map(a => a.actor);
    const totalActiveActors = allActors.filter(a => a.active).length;

    // If low density, no inter-flight spacing correction needed
    if (totalActiveActors <= HexMapRenderer.AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION) {
      return [...assignments];
    }

    debugAirShowPhase("PhaseSpacingResolution", {
      totalAssignments: assignments.length,
      activeActors: totalActiveActors,
      threshold: HexMapRenderer.AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION
    });

    // Create mutable copies of assignments
    const resolvedAssignments = assignments.map(a => ({
      ...a,
      points: [...a.points]
    }));

    // Check and resolve spacing at each sample point along the paths
    for (const progress of progressSamplePoints) {
      // Get positions at this progress for all actors
      const positionsAtProgress: AirShowPoint[] = [];
      const actorIndices: number[] = [];

      resolvedAssignments.forEach((assignment, index) => {
        const sampled = this.sampleAirShowAssignmentAtProgress(assignment, progress);
        positionsAtProgress.push(sampled.position);
        actorIndices.push(index);
      });

      // Resolve collisions at this progress point
      const resolvedPositions = this.resolveAirShowCollisionFreePositions(
        allActors,
        positionsAtProgress,
        2 // Max iterations per progress point
      );

      // Apply corrections to assignment paths (distribute correction across path points)
      for (let i = 0; i < resolvedPositions.length; i++) {
        const assignmentIndex = actorIndices[i];
        const originalPos = positionsAtProgress[i];
        const resolvedPos = resolvedPositions[i];
        const correctionX = resolvedPos.cx - originalPos.cx;
        const correctionY = resolvedPos.cy - originalPos.cy;

        // Apply correction to all path points proportionally
        const assignment = resolvedAssignments[assignmentIndex];
        const pathLength = assignment.points.length;
        assignment.points = assignment.points.map((point, pointIndex) => {
          // Keep spacing corrections centered in the active combat window so phase entry/exit geometry
          // stays aligned with authored paths while the mid-phase still gets density relief.
          const pointProgress = pointIndex / (pathLength - 1 || 1);
          const proximityFactor = Math.max(0, 1 - Math.abs(pointProgress - progress) / 0.35);
          const factor = proximityFactor * proximityFactor * 0.42;

          return {
            cx: point.cx + correctionX * factor,
            cy: point.cy + correctionY * factor
          };
        });
      }
    }

    return resolvedAssignments;
  }

  private selectAirShowTracerActors(
    sourceFlight: AirShowRuntimeFlightInternal,
    targetFlight: AirShowRuntimeFlightInternal,
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    progress: number,
    emitter: "nose" | "center" = "nose",
    constraints: {
      maxAlignmentDeg?: number;
      maxRangePx?: number;
    } = {}
  ): { sourceActor: AirShowRuntimeActor; targetActor: AirShowRuntimeActor } | null {
    const assignmentsByActorId = this.buildAirShowAssignmentLookup(assignments);
    let bestSource: AirShowRuntimeActor | null = null;
    let bestTarget: AirShowRuntimeActor | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const maxAlignmentDeg = constraints.maxAlignmentDeg ?? (emitter === "center" ? 18 : 12);
    const maxRangePx = constraints.maxRangePx ?? (emitter === "center" ? 176 : 138);

    sourceFlight.actors
      .filter((actor) => actor.active)
      .forEach((sourceActor) => {
        const sourceAssignment = assignmentsByActorId.get(sourceActor.id);
        if (!sourceAssignment) {
          return;
        }
        const sampledSource = this.sampleAirShowAssignmentAtProgress(sourceAssignment, progress);
        const emitterPoint = this.resolveAirShowEmitterPoint(sampledSource, emitter);
        const headingVector = this.resolveAirShowHeadingVector(sampledSource.headingDegrees);

        targetFlight.actors
          .filter((actor) => actor.active)
          .forEach((targetActor) => {
            const targetAssignment = assignmentsByActorId.get(targetActor.id);
            if (!targetAssignment) {
              return;
            }
            const sampledTarget = this.sampleAirShowAssignmentAtProgress(targetAssignment, progress);
            const targetVector = {
              x: sampledTarget.position.cx - emitterPoint.cx,
              y: sampledTarget.position.cy - emitterPoint.cy
            };
            const distance = Math.hypot(targetVector.x, targetVector.y);
            if (distance < 6) {
              return;
            }
            const alignmentDeg = this.resolveAirShowVectorAngleDegrees(headingVector, targetVector);
            if (alignmentDeg > maxAlignmentDeg || distance > maxRangePx) {
              return;
            }
            const score = alignmentDeg * 3.2 + distance * 0.045;
            if (score < bestScore) {
              bestScore = score;
              bestSource = sourceActor;
              bestTarget = targetActor;
            }
          });
      });

    if (!bestSource || !bestTarget) {
      return null;
    }
    return {
      sourceActor: bestSource,
      targetActor: bestTarget
    };
  }

  private resolveAirShowEmitterPoint(
    actor: Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size">,
    emitter: "nose" | "center"
  ): AirShowPoint {
    if (emitter === "center") {
      return actor.position;
    }
    const angleRad = ((actor.headingDegrees - 90) * Math.PI) / 180;
    return {
      cx: actor.position.cx + Math.cos(angleRad) * actor.size * 0.28,
      cy: actor.position.cy + Math.sin(angleRad) * actor.size * 0.28
    };
  }

  private rotateAirShowVector(vector: { x: number; y: number }, degrees: number): { x: number; y: number } {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos
    };
  }

  private resolveAirShowTracerBurstGeometry(
    actor: Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size">,
    burst: Pick<AirShowTracerBurst, "emitter" | "burstCount" | "spreadPx" | "streakLengthPx" | "visibleLengthPx" | "fanHalfAngleDeg">
  ): {
    readonly emitterPoint: AirShowPoint;
    readonly sourceHeadingDegrees: number;
    readonly streakLengthPx: number;
    readonly visibleLengthPx: number;
    readonly fanHalfAngleDeg: number;
    readonly centerlineEndPoint: AirShowPoint;
    readonly leftFanEndPoint?: AirShowPoint;
    readonly rightFanEndPoint?: AirShowPoint;
    readonly segments: ReadonlyArray<{ readonly start: AirShowPoint; readonly end: AirShowPoint }>;
  } {
    const burstCount = Math.max(1, burst.burstCount ?? 1);
    const emitterPoint =
      burst.emitter === "center"
        ? actor.position
        : this.resolveAirShowEmitterPoint(actor, burst.emitter);
    const sourceHeadingDegrees = ((actor.headingDegrees % 360) + 360) % 360;
    const baseForward = this.normalizeAircraftVector(
      Math.cos(((sourceHeadingDegrees - 90) * Math.PI) / 180),
      Math.sin(((sourceHeadingDegrees - 90) * Math.PI) / 180),
      0,
      -1
    );
    const lateral = { x: -baseForward.y, y: baseForward.x };
    const streakLengthPx = Math.max(
      96,
      burst.streakLengthPx ?? actor.size * (burst.emitter === "center" ? 7.2 : 7.8)
    );
    const visibleLengthPx = this.clamp(
      burst.visibleLengthPx ?? Math.min(36, streakLengthPx * 0.085),
      10,
      Math.min(streakLengthPx, 44)
    );
    const fanHalfAngleDeg = Math.max(
      0,
      burst.fanHalfAngleDeg
      ?? (burst.emitter === "center"
        ? 6 + Math.max(0, burstCount - 1) * 1.6
        : 3 + Math.max(0, burstCount - 1) * 1.2)
    );
    const centerlineEndPoint = {
      cx: emitterPoint.cx + baseForward.x * streakLengthPx,
      cy: emitterPoint.cy + baseForward.y * streakLengthPx
    };

    const segments = Array.from({ length: burstCount }, (_, index) => {
      const fanT = burstCount <= 1 ? 0 : (index / Math.max(1, burstCount - 1)) * 2 - 1;
      const fanAngleDeg = fanT * fanHalfAngleDeg;
      const direction = this.rotateAirShowVector(baseForward, fanAngleDeg);
      const startOffsetPx = burstCount <= 1 ? 0 : fanT * Math.max(0, burst.spreadPx ?? 0) * 0.18;
      const start = {
        cx: emitterPoint.cx + lateral.x * startOffsetPx,
        cy: emitterPoint.cy + lateral.y * startOffsetPx
      };
      return {
        start,
        end: {
          cx: start.cx + direction.x * streakLengthPx,
          cy: start.cy + direction.y * streakLengthPx
        }
      };
    });

    return {
      emitterPoint,
      sourceHeadingDegrees,
      streakLengthPx,
      visibleLengthPx,
      fanHalfAngleDeg,
      centerlineEndPoint,
      leftFanEndPoint: segments.length > 1 ? segments[0]?.end : undefined,
      rightFanEndPoint: segments.length > 1 ? segments[segments.length - 1]?.end : undefined,
      segments
    };
  }

  private buildAirShowTracerVolley(
    source: AirShowRuntimeActor,
    target: AirShowRuntimeActor | AirShowPoint,
    options: {
      emitter?: "nose" | "center";
      color?: string;
      width?: number;
      lifetimeMs?: number;
      spreadPx?: number;
      streakLengthPx?: number;
      visibleLengthPx?: number;
      fanHalfAngleDeg?: number;
      burstCount?: number;
      maxAlignmentDeg?: number;
      maxRangePx?: number;
      timings?: ReadonlyArray<number>;
    } = {}
  ): AirShowTracerBurst[] {
    const density = Math.max(4, options.burstCount ?? (options.emitter === "center" ? 6 : 7));
    const timingCount = Math.max(6, density);
    const timings =
      options.timings
      ?? Array.from({ length: timingCount }, (_, index) =>
          0.38 + (index / Math.max(1, timingCount - 1)) * 0.42
        );
    const perBurstSegments = 1;
    const baseSpreadPx = Math.min(
      options.spreadPx ?? (options.emitter === "center" ? 3 : 2),
      options.emitter === "center" ? 3 : 2
    );
    const baseFanHalfAngleDeg = Math.min(
      options.fanHalfAngleDeg ?? (options.emitter === "center" ? 3 : 2),
      options.emitter === "center" ? 3 : 2
    );
    return timings.map((progress, volleyIndex) => ({
      progress,
      source,
      target,
      emitter: options.emitter ?? "nose",
      color: options.color,
      width: options.width,
      lifetimeMs: options.lifetimeMs,
      spreadPx: baseSpreadPx + volleyIndex * 0.08,
      streakLengthPx: options.streakLengthPx ?? (options.emitter === "center" ? 312 : 328),
      visibleLengthPx: options.visibleLengthPx,
      fanHalfAngleDeg: baseFanHalfAngleDeg + volleyIndex * 0.12,
      burstCount: perBurstSegments
    }));
  }

  private buildAirShowDynamicTracerVolley(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    sourceFlight: AirShowRuntimeFlightInternal,
    targetFlight: AirShowRuntimeFlightInternal,
    options: {
      emitter?: "nose" | "center";
      color?: string;
      width?: number;
      lifetimeMs?: number;
      spreadPx?: number;
      streakLengthPx?: number;
      visibleLengthPx?: number;
      fanHalfAngleDeg?: number;
      burstCount?: number;
      maxAlignmentDeg?: number;
      maxRangePx?: number;
      timings?: ReadonlyArray<number>;
    } = {}
  ): AirShowTracerBurst[] {
    const emitter = options.emitter ?? "nose";
    const timings =
      options.timings
      ?? Array.from({ length: Math.max(5, options.burstCount ?? 6) }, (_, index) => 0.34 + index * 0.08);
    return timings.flatMap((progress, volleyIndex) => {
      const pair = this.selectAirShowTracerActors(sourceFlight, targetFlight, assignments, progress, emitter, {
        maxAlignmentDeg: options.maxAlignmentDeg,
        maxRangePx: options.maxRangePx
      });
      if (!pair) {
        return [];
      }
      return [{
        progress,
        source: pair.sourceActor,
        target: pair.targetActor,
        emitter,
        color: options.color,
        width: options.width,
        lifetimeMs: options.lifetimeMs,
        spreadPx: Math.max(0, options.spreadPx ?? 0),
        streakLengthPx: options.streakLengthPx,
        visibleLengthPx: options.visibleLengthPx,
        fanHalfAngleDeg: Math.max(0, options.fanHalfAngleDeg ?? 0),
        burstCount: 1
      }];
    });
  }

  private resolveAirShowFlakBurstWave(
    corridor: AirShowCorridor,
    targetCenter: AirShowPoint,
    burst: NonNullable<ResolvedAirShowScene["flakBursts"]>[number]
  ): {
    readonly center: AirShowPoint;
    readonly flashCount: number;
    readonly points: ReadonlyArray<AirShowPoint>;
    readonly puffCount: number;
    readonly smokePuffCount: number;
  } {
    const alongOffsetPx = burst.alongOffsetPx ?? -46;
    const lateralOffsetPx = burst.lateralOffsetPx ?? 0;
    const alongSpreadPx = Math.max(24, burst.alongSpreadPx ?? 42);
    const lateralSpreadPx = Math.max(28, burst.lateralSpreadPx ?? HEX_WIDTH * 0.7);
    const puffCount = Math.max(8, burst.puffCount ?? Math.max(10, burst.count * 5));
    const smokePuffCount = Math.max(10, burst.smokePuffCount ?? Math.round(puffCount * 1.2));
    const center = this.clampPointToViewportBounds(
      {
        cx: targetCenter.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
        cy: targetCenter.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
      },
      targetCenter,
      430,
      300
    );
    const points = Array.from({ length: puffCount }, (_, index) => {
      const t = puffCount <= 1 ? 0.5 : index / Math.max(1, puffCount - 1);
      const lateralT = t * 2 - 1;
      const arcWave = Math.sin(t * Math.PI) * 0.52;
      const alongJitter = (Math.cos(t * Math.PI * 2.4) * 0.38 + (index % 3) * 0.14 - 0.14) * alongSpreadPx;
      const lateralJitter = lateralT * lateralSpreadPx + Math.sin(t * Math.PI * 2.2) * 8;
      return this.clampPointToViewportBounds(
        {
          cx: center.cx + corridor.axis.x * alongJitter + corridor.normal.x * lateralJitter,
          cy: center.cy + corridor.axis.y * alongJitter + corridor.normal.y * lateralJitter - arcWave * 8
        },
        targetCenter,
        470,
        320
      );
    });
    const flashCount = Math.max(2, Math.round(puffCount * 0.1));
    return { center, flashCount, points, puffCount, smokePuffCount };
  }

  private resolveAirShowTracerTargetPoint(target: AirShowRuntimeActor | AirShowPoint): AirShowPoint {
    return "image" in target ? target.position : target;
  }

  private resolveAirShowVectorAngleDegrees(
    left: { x: number; y: number },
    right: { x: number; y: number }
  ): number {
    const leftLength = Math.hypot(left.x, left.y);
    const rightLength = Math.hypot(right.x, right.y);
    if (leftLength < 0.001 || rightLength < 0.001) {
      return 0;
    }
    const dot = (left.x * right.x + left.y * right.y) / (leftLength * rightLength);
    return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
  }

  private shouldRenderAirShowTracerBurst(
    source: Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size">,
    targetPoint: AirShowPoint,
    burst: Pick<AirShowTracerBurst, "emitter" | "burstCount" | "spreadPx" | "streakLengthPx" | "fanHalfAngleDeg">
  ): boolean {
    const geometry = this.resolveAirShowTracerBurstGeometry(source, burst);
    const forwardVector = {
      x: geometry.centerlineEndPoint.cx - geometry.emitterPoint.cx,
      y: geometry.centerlineEndPoint.cy - geometry.emitterPoint.cy
    };
    const targetVector = {
      x: targetPoint.cx - geometry.emitterPoint.cx,
      y: targetPoint.cy - geometry.emitterPoint.cy
    };
    const thresholdDeg =
      burst.emitter === "center"
        ? Math.max(14, geometry.fanHalfAngleDeg + 8)
        : Math.max(10, geometry.fanHalfAngleDeg + 8);
    return this.resolveAirShowVectorAngleDegrees(forwardVector, targetVector) <= thresholdDeg;
  }

  private playAirShowTracerBurst(burst: AirShowTracerBurst): void {
    const targetPoint = this.resolveAirShowTracerTargetPoint(burst.target);
    if (!this.shouldRenderAirShowTracerBurst(burst.source, targetPoint, burst)) {
      return;
    }
    const geometry = this.resolveAirShowTracerBurstGeometry(burst.source, burst);
    geometry.segments.forEach((segment, index) => {
      window.setTimeout(() => {
        this.playAirTracerExchange(
          segment.start,
          segment.end,
          {
            color: burst.color,
            width: burst.width,
            lifetimeMs: burst.lifetimeMs,
            visibleLengthPx: geometry.visibleLengthPx
          }
        );
      }, index * 16);
    });
  }

  private averageAirShowPosition(actors: ReadonlyArray<AirShowRuntimeActor>): AirShowPoint | null {
    const activeActors = actors.filter((actor) => actor.active);
    if (activeActors.length === 0) {
      return null;
    }
    const totals = activeActors.reduce(
      (acc, actor) => {
        acc.cx += actor.position.cx;
        acc.cy += actor.position.cy;
        return acc;
      },
      { cx: 0, cy: 0 }
    );
    return {
      cx: totals.cx / activeActors.length,
      cy: totals.cy / activeActors.length
    };
  }

  private averageAirShowPoints(points: ReadonlyArray<AirShowPoint>): AirShowPoint | null {
    if (points.length === 0) {
      return null;
    }
    const totals = points.reduce(
      (acc, point) => {
        acc.cx += point.cx;
        acc.cy += point.cy;
        return acc;
      },
      { cx: 0, cy: 0 }
    );
    return {
      cx: totals.cx / points.length,
      cy: totals.cy / points.length
    };
  }

  private describeInspectionAirShowFlight(flight: AirShowRuntimeFlightInternal): AirShowInspectionFlight {
    return {
      id: flight.spec.id,
      role: flight.spec.role,
      combatRole: flight.spec.combatRole,
      faction: flight.spec.faction,
      scenarioType: flight.spec.scenarioType,
      originHexKey: flight.spec.originHexKey,
      strengthBefore: flight.spec.strengthBefore,
      strengthAfterEscortPhase: flight.spec.strengthAfterEscortPhase,
      finalStrength: flight.spec.finalStrength,
      actors: flight.actors.map((actor) => ({
        actorId: actor.id,
        flightId: actor.flightId,
        role: actor.role,
        active: actor.active,
        headingDegrees: actor.headingDegrees,
        position: { cx: actor.position.cx, cy: actor.position.cy }
      }))
    };
  }

  private applyInspectionAirShowAssignments(assignments: ReadonlyArray<AirShowPhaseAssignment>): void {
    assignments.forEach((assignment) => {
      const finalPoint = assignment.points[assignment.points.length - 1];
      if (!finalPoint) {
        return;
      }
      assignment.actor.position = {
        cx: finalPoint.cx - assignment.actor.biasX,
        cy: finalPoint.cy - assignment.actor.biasY
      };
      if (assignment.points.length >= 2) {
        const previousPoint = assignment.points[assignment.points.length - 2]!;
        assignment.actor.headingDegrees = this.resolveAircraftHeadingDegrees(
          finalPoint.cx - previousPoint.cx,
          finalPoint.cy - previousPoint.cy
        );
      }
      this.positionAircraftImageGhost(
        assignment.actor.image,
        assignment.actor.size,
        assignment.actor.position.cx,
        assignment.actor.position.cy,
        assignment.actor.headingDegrees
      );
    });
  }

  private syncAirShowFlightStrengthForInspection(
    flight: AirShowRuntimeFlightInternal,
    targetStrength: number
  ): void {
    flight.currentStrength = Math.max(0, targetStrength);
    const targetVisibleCount = this.resolveAirShowVisibleActorCount(flight.currentStrength);
    flight.actors.forEach((actor, index) => {
      actor.active = index < targetVisibleCount;
      actor.image.style.opacity = actor.active ? "1" : "0";
    });
  }

  /**
   * Phase 0.4: Spatial zone helper functions for linked strike packages.
   * These enforce spatial separation between combat volume (dogfight) and bomber corridor (strike path).
   */

  /**
   * Updates actor position within bounded combat volume.
   * Ensures escorts/interceptors stay on camera during dogfight.
   *
   * @param actor - Aircraft sprite to update
   * @param volume - Combat volume bounds (center + radius)
   * @param targetX - Desired X position (before clamping)
   * @param targetY - Desired Y position (before clamping)
   * @param blend - Smooth blend factor (0-1, higher = faster approach)
   */
  private updateCombatVolumePosition(
    actor: AirShowRuntimeActor,
    volume: { centerX: number; centerY: number; radiusPx: number },
    targetX: number,
    targetY: number,
    blend: number
  ): void {
    // Calculate offset from volume center
    const offsetX = targetX - volume.centerX;
    const offsetY = targetY - volume.centerY;
    const distance = Math.hypot(offsetX, offsetY);

    // Clamp to radius if outside volume
    let clampedX = targetX;
    let clampedY = targetY;
    if (distance > volume.radiusPx) {
      const scale = volume.radiusPx / distance;
      clampedX = volume.centerX + offsetX * scale;
      clampedY = volume.centerY + offsetY * scale;
    }

    // Smooth blend toward target
    actor.position.cx += (clampedX - actor.position.cx) * blend;
    actor.position.cy += (clampedY - actor.position.cy) * blend;

    // Update sprite position
    actor.image.style.left = `${actor.position.cx}px`;
    actor.image.style.top = `${actor.position.cy}px`;
  }

  /**
   * Updates bomber position along smooth corridor path.
   * Keeps strike aircraft separate from dogfight area.
   *
   * @param actor - Bomber sprite to update
   * @param corridor - Corridor path definition (start → target)
   * @param progress - Progress along corridor (0-1)
   * @param lateralOffsetPx - Formation spacing offset
   */
  private updateBomberCorridorPosition(
    actor: AirShowRuntimeActor,
    corridor: { startX: number; startY: number; targetX: number; targetY: number },
    progress: number,
    lateralOffsetPx: number
  ): void {
    // Linear interpolation along corridor (Phase 0 - straight line, U-shape in later phases)
    const baseX = corridor.startX + (corridor.targetX - corridor.startX) * progress;
    const baseY = corridor.startY + (corridor.targetY - corridor.startY) * progress;

    // Calculate perpendicular offset for formation spacing
    const dx = corridor.targetX - corridor.startX;
    const dy = corridor.targetY - corridor.startY;
    const length = Math.hypot(dx, dy);
    const normalX = length > 0 ? -dy / length : 0;
    const normalY = length > 0 ? dx / length : 0;

    // Apply lateral offset
    actor.position.cx = baseX + normalX * lateralOffsetPx;
    actor.position.cy = baseY + normalY * lateralOffsetPx;

    // Update sprite position
    actor.image.style.left = `${actor.position.cx}px`;
    actor.image.style.top = `${actor.position.cy}px`;
  }

  /**
   * Clamps coordinates to viewport bounds.
   * Prevents aircraft from flying off-screen during maneuvers.
   *
   * @param x - X coordinate to clamp
   * @param y - Y coordinate to clamp
   * @param centerX - Viewport center X
   * @param centerY - Viewport center Y
   * @param marginH - Horizontal margin (±px from center)
   * @param marginV - Vertical margin (±px from center)
   * @returns Clamped coordinates
   */
  private clampToViewport(
    x: number,
    y: number,
    centerX: number,
    centerY: number,
    marginH: number = 600,
    marginV: number = 400
  ): { x: number; y: number } {
    return {
      x: Math.max(centerX - marginH, Math.min(centerX + marginH, x)),
      y: Math.max(centerY - marginV, Math.min(centerY + marginV, y))
    };
  }

  private selectAirShowActor(
    flight: AirShowRuntimeFlightInternal | null | undefined,
    index: number,
    preferTail = false
  ): AirShowRuntimeActor | null {
    if (!flight) {
      return null;
    }
    const activeActors = flight.actors.filter((actor) => actor.active);
    if (activeActors.length === 0) {
      return null;
    }
    const ordered = preferTail
      ? [...activeActors].sort((left, right) => right.formationIndex - left.formationIndex)
      : [...activeActors].sort((left, right) => left.formationIndex - right.formationIndex);
    return ordered[index % ordered.length] ?? ordered[0] ?? null;
  }

  private async runAirShowPhase(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    tracerBursts: ReadonlyArray<AirShowTracerBurst> = [],
    options: AirShowPhaseOptions = {}
  ): Promise<void> {
    if (durationMs <= 0 || assignments.length === 0) {
      return;
    }

    debugAirShowPhase("PhaseStart", {
      aircraft: assignments.length,
      durationMs,
      tracerBursts: tracerBursts.length
    });
    assignments.forEach(assignment => {
      const start = assignment.points[0];
      const end = assignment.points[assignment.points.length - 1];
      debugAirShowActor(assignment.actor.id, "path assigned", {
        from: { cx: Math.round(start?.cx ?? 0), cy: Math.round(start?.cy ?? 0) },
        to: { cx: Math.round(end?.cx ?? 0), cy: Math.round(end?.cy ?? 0) },
        waypoints: assignment.points.length
      });
    });

    const sortedBursts = [...tracerBursts].sort((left, right) => left.progress - right.progress);
    let nextBurstIndex = 0;
    let lastLoggedProgress = -1;

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step: FrameRequestCallback = (now) => {
        const elapsed = now - startTime;
        const rawProgress = Math.min(1, elapsed / Math.max(1, durationMs));
        const easedProgress = options.easing === "linear" ? rawProgress : this.easeInOut(rawProgress);

        // Log progress at 25%, 50%, 75%, 100%
        const progressCheckpoint = Math.floor(rawProgress * 4) * 25;
        if (progressCheckpoint > lastLoggedProgress && progressCheckpoint > 0) {
          lastLoggedProgress = progressCheckpoint;
          debugAirShowPhase("Progress", { percent: progressCheckpoint, elapsedMs: Math.round(elapsed) });
          assignments.slice(0, 3).forEach(assignment => {
            debugAirShowActor(assignment.actor.id, "position", {
              cx: Math.round(assignment.actor.position.cx),
              cy: Math.round(assignment.actor.position.cy),
              heading: Math.round(assignment.actor.headingDegrees)
            });
          });
          if (assignments.length > 3) {
            debugAirShowPhase("MoreActors", { count: assignments.length - 3 });
          }
        }

        assignments.forEach((assignment, assignmentIndex) => {
          const sample = this.sampleAircraftWaypointPath(
            assignment.points,
            this.clamp(easedProgress + (assignment.progressOffset ?? assignmentIndex * 0.003), 0, 1)
          );
          assignment.actor.headingDegrees = this.interpolateAircraftHeadingDegrees(
            assignment.actor.headingDegrees,
            this.resolveAircraftHeadingDegrees(sample.derivative.dx, sample.derivative.dy, assignment.actor.headingDegrees),
            assignment.headingBlend ?? 0.34
          );
          assignment.actor.position = sample.point;
          this.positionAircraftImageGhost(
            assignment.actor.image,
            assignment.actor.size,
            sample.point.cx,
            sample.point.cy,
            assignment.actor.headingDegrees
          );
        });

        while (nextBurstIndex < sortedBursts.length && easedProgress >= sortedBursts[nextBurstIndex]!.progress) {
          const burst = sortedBursts[nextBurstIndex]!;
          const sourceId = burst.source.id;
          const targetId = 'id' in burst.target ? burst.target.id : `point(${Math.round(burst.target.cx)},${Math.round(burst.target.cy)})`;
          debugAirShowEffect(`Tracer burst @ ${Math.round(easedProgress * 100)}%`, {
            source: sourceId,
            target: targetId,
            emitter: burst.emitter
          });
          this.playAirShowTracerBurst(burst);
          nextBurstIndex += 1;
        }

        if (rawProgress >= 1) {
          assignments.forEach((assignment) => {
            const finalPoint = assignment.points[assignment.points.length - 1];
            if (!finalPoint) {
              return;
            }
            const previousPoint = assignment.points[Math.max(0, assignment.points.length - 2)] ?? finalPoint;
            assignment.actor.headingDegrees = this.resolveAircraftHeadingDegrees(
              finalPoint.cx - previousPoint.cx,
              finalPoint.cy - previousPoint.cy,
              assignment.actor.headingDegrees
            );
            assignment.actor.position = {
              cx: finalPoint.cx,
              cy: finalPoint.cy
            };
            this.positionAircraftImageGhost(
              assignment.actor.image,
              assignment.actor.size,
              finalPoint.cx,
              finalPoint.cy,
              assignment.actor.headingDegrees
            );
          });
          debugAirShowPhase("Complete", { durationMs: Math.round(now - startTime) });
          resolve();
          return;
        }
        this.scheduleAnimationFrame(step);
      };
      this.scheduleAnimationFrame(step);
    });
  }

  private async syncAirShowFlightStrength(
    flight: AirShowRuntimeFlightInternal,
    targetStrength: number,
    escapeVector: { x: number; y: number }
  ): Promise<void> {
    const previousStrength = flight.currentStrength;
    flight.currentStrength = Math.max(0, targetStrength);
    const targetVisibleCount = this.resolveAirShowVisibleActorCount(flight.currentStrength);
    const activeActors = flight.actors.filter((actor) => actor.active);

    debugAirShowPhase("StrengthSync", {
      flightId: flight.spec.id,
      strengthChange: `${previousStrength} → ${targetStrength}`,
      visibilityChange: `${activeActors.length} → ${targetVisibleCount}`
    });

    if (activeActors.length <= targetVisibleCount) {
      return;
    }

    const removedActors = [...activeActors]
      .sort((left, right) => right.formationIndex - left.formationIndex)
      .slice(0, activeActors.length - targetVisibleCount);

    debugAirShowPhase("RemovingActors", {
      flightId: flight.spec.id,
      count: removedActors.length
    });
    removedActors.forEach(actor => {
      debugAirShowActor(actor.id, "diving out", {
        cx: Math.round(actor.position.cx),
        cy: Math.round(actor.position.cy)
      });
    });

    const assignments: AirShowPhaseAssignment[] = removedActors.map((actor, index) => {
      const diveEnd = {
        cx: actor.position.cx + escapeVector.x * (28 + index * 10),
        cy: actor.position.cy + escapeVector.y * (28 + index * 10) + 18 + index * 6
      };
      return {
        actor,
        points: this.buildAirShowCurvedPath(actor.position, diveEnd, 10 + index * 4, 12 + index * 3),
        headingBlend: 0.46
      };
    });

    await this.runAirShowPhase(assignments, 320);
    await Promise.all(removedActors.map((actor) => this.fadeOutActor(actor, 200)));
    removedActors.forEach((actor) => {
      actor.active = false;
    });
    debugAirShowPhase("ActiveCount", {
      flightId: flight.spec.id,
      active: flight.actors.filter(a => a.active).length
    });
  }

  private resolveAircraftSortieTurnVector(
    ingressDirection: { x: number; y: number },
    egressDirection: { x: number; y: number },
    laneOffsetPx: number
  ): { x: number; y: number } {
    const blendedDirection = this.normalizeAircraftVector(
      ingressDirection.x + egressDirection.x,
      ingressDirection.y + egressDirection.y,
      0,
      0
    );
    const blendedLength = Math.hypot(ingressDirection.x + egressDirection.x, ingressDirection.y + egressDirection.y);
    if (blendedLength > 0.2) {
      return blendedDirection;
    }

    const bankSign = laneOffsetPx < 0 ? -1 : 1;
    return this.normalizeAircraftVector(
      -ingressDirection.y * bankSign,
      ingressDirection.x * bankSign,
      -ingressDirection.y,
      ingressDirection.x
    );
  }

  private interpolateAircraftHermitePoint(
    start: { cx: number; cy: number },
    end: { cx: number; cy: number },
    startTangent: { dx: number; dy: number },
    endTangent: { dx: number; dy: number },
    progress: number
  ): { cx: number; cy: number } {
    const t = this.clamp(progress, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return {
      cx: h00 * start.cx + h10 * startTangent.dx + h01 * end.cx + h11 * endTangent.dx,
      cy: h00 * start.cy + h10 * startTangent.dy + h01 * end.cy + h11 * endTangent.dy
    };
  }

  private interpolateAircraftHermiteDerivative(
    start: { cx: number; cy: number },
    end: { cx: number; cy: number },
    startTangent: { dx: number; dy: number },
    endTangent: { dx: number; dy: number },
    progress: number
  ): { dx: number; dy: number } {
    const t = this.clamp(progress, 0, 1);
    const t2 = t * t;
    const dh00 = 6 * t2 - 6 * t;
    const dh10 = 3 * t2 - 4 * t + 1;
    const dh01 = -6 * t2 + 6 * t;
    const dh11 = 3 * t2 - 2 * t;

    return {
      dx: dh00 * start.cx + dh10 * startTangent.dx + dh01 * end.cx + dh11 * endTangent.dx,
      dy: dh00 * start.cy + dh10 * startTangent.dy + dh01 * end.cy + dh11 * endTangent.dy
    };
  }

  private positionAircraftGhost(
    ghost: SVGGElement | SVGImageElement,
    isFormation: boolean,
    iconSize: number,
    centerX: number,
    centerY: number,
    headingDegrees = 0
  ): void {
    if (isFormation) {
      ghost.setAttribute("transform", `translate(${centerX},${centerY}) rotate(${headingDegrees})`);
      return;
    }

    const x = centerX - iconSize / 2;
    const y = centerY - iconSize / 2;
    (ghost as SVGImageElement).setAttribute("x", String(x));
    (ghost as SVGImageElement).setAttribute("y", String(y));
    (ghost as SVGImageElement).setAttribute("transform", `rotate(${headingDegrees} ${centerX} ${centerY})`);
  }

  private async animateAircraftGhostArcSegment(
    ghost: SVGGElement | SVGImageElement,
    isFormation: boolean,
    iconSize: number,
    start: { cx: number; cy: number },
    end: { cx: number; cy: number },
    durationMs: number,
    onProgress?: AircraftAnimationProgressCallback,
    bendDirection = 1
  ): Promise<void> {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / distance;
    const ny = dx / distance;
    const arcAmplitude = distance * 0.3 * bendDirection;
    const control = {
      cx: (start.cx + end.cx) / 2 + nx * arcAmplitude,
      cy: (start.cy + end.cy) / 2 + ny * arcAmplitude
    };

    if (durationMs <= 0) {
      const tangentX = 2 * (end.cx - control.cx);
      const tangentY = 2 * (end.cy - control.cy);
      const headingDegrees = this.resolveAircraftHeadingDegrees(tangentX, tangentY);
      this.positionAircraftGhost(ghost, isFormation, iconSize, end.cx, end.cy, headingDegrees);
      onProgress?.(1, end.cx, end.cy);
      return;
    }

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      let lastHeadingDegrees = this.resolveAircraftHeadingDegrees(control.cx - start.cx, control.cy - start.cy);
      const step: FrameRequestCallback = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const eased = this.easeInOut(t);
        const omt = 1 - eased;
        const centerX = omt * omt * start.cx + 2 * omt * eased * control.cx + eased * eased * end.cx;
        const centerY = omt * omt * start.cy + 2 * omt * eased * control.cy + eased * eased * end.cy;
        const tangentX = 2 * omt * (control.cx - start.cx) + 2 * eased * (end.cx - control.cx);
        const tangentY = 2 * omt * (control.cy - start.cy) + 2 * eased * (end.cy - control.cy);

        lastHeadingDegrees = this.resolveAircraftHeadingDegrees(tangentX, tangentY, lastHeadingDegrees);
        this.positionAircraftGhost(ghost, isFormation, iconSize, centerX, centerY, lastHeadingDegrees);
        onProgress?.(eased, centerX, centerY);

        if (t >= 1) {
          resolve();
          return;
        }
        this.scheduleAnimationFrame(step);
      };
      this.scheduleAnimationFrame(step);
    });
  }

  private cleanupMoveGhost(ghost: SVGGElement, original: SVGGElement, restoreOpacity: string): void {
    ghost.remove();
    if (restoreOpacity === "" || restoreOpacity === "1") {
      original.style.removeProperty("opacity");
    } else {
      original.style.opacity = restoreOpacity;
    }
  }

  /** Ensures the top-layer SVG group used for combat effects exists and remains attached. */
  /**
   * Returns the combat effects layer without moving it.
   * The layer is created once during render() and stays as the last child of viewportRoot.
   */
  private ensureCombatEffectsLayer(): SVGGElement | null {
    if (this.combatEffectsLayer && this.combatEffectsLayer.isConnected) {
      return this.combatEffectsLayer;
    }

    // Layer should have been created during render() - if it's missing, something is wrong
    console.error("[HexMapRenderer] Combat effects layer missing - should have been created in render()");
    return null;
  }

  /**
   * Briefly shows a localized flash over the impact hex to boost perceived brightness without obscuring the board.
   */
  private async playFlashOverlay(
    center: { cx: number; cy: number },
    radius: number,
    intensity: number = 0.6,
    durationMs: number = 140
  ): Promise<void> {
    const svg = this.svgElement;
    const layer = this.ensureCombatEffectsLayer();
    if (!svg || !layer) {
      return;
    }

    if (!this.flashOverlay || !this.flashOverlay.isConnected) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.classList.add("combat-flash-overlay");
      circle.setAttribute("fill", "white");
      circle.style.pointerEvents = "none";
      circle.style.opacity = "0";
      this.flashOverlay = circle;
      layer.appendChild(circle);
    }

    const overlay = this.flashOverlay;
    overlay.setAttribute("cx", String(center.cx));
    overlay.setAttribute("cy", String(center.cy));
    overlay.setAttribute("r", String(radius));
    layer.appendChild(overlay);

    return new Promise((resolve) => {
      overlay.style.transition = "opacity 90ms ease-out";
      overlay.style.opacity = String(intensity);
      requestAnimationFrame(() => {
        overlay.style.transition = `opacity ${durationMs}ms ease-in`;
        overlay.style.opacity = "0";
        window.setTimeout(() => {
          resolve();
        }, durationMs);
      });
    });
  }

  private scheduleAnimationFrame(step: FrameRequestCallback): void {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(step);
      return;
    }

    setTimeout(() => step(performance.now()), 16);
  }

  private easeInOut(progress: number): number {
    // Cosine ease-in-out keeps motion smooth without sharp stops.
    return 0.5 - Math.cos(progress * Math.PI) / 2;
  }

  private clamp(value: number, min: number, max: number): number {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  /** Returns the cached unit class (if any) for a given hex. */
  private getUnitClassAt(hexKey: string): UnitClass | undefined {
    return this.hexUnitClassMap.get(hexKey);
  }

  /** Returns the cached unit scenario type (if any) for a given hex. */
  private getUnitScenarioTypeAt(hexKey: string): string | undefined {
    return this.hexUnitScenarioTypeMap.get(hexKey);
  }

  private isSmallArmsAttack(attackerHexKey: string): boolean {
    const attackerClass = this.getUnitClassAt(attackerHexKey);
    const attackerType = this.getUnitScenarioTypeAt(attackerHexKey);
    return attackerClass === "infantry" || attackerClass === "recon" || attackerType === "Assault_Gun";
  }

  private isArcingArtilleryAttack(attackerHexKey: string): boolean {
    const attackerClass = this.getUnitClassAt(attackerHexKey);
    const attackerType = this.getUnitScenarioTypeAt(attackerHexKey);
    return attackerClass === "artillery" || attackerType === "SP_Artillery";
  }

  private isRocketArtilleryAttack(attackerHexKey: string): boolean {
    return this.getUnitScenarioTypeAt(attackerHexKey) === "Rocket_Artillery";
  }

  private isAirStrafingAttack(attackerHexKey: string): boolean {
    const attackerClass = this.getUnitClassAt(attackerHexKey);
    const attackerType = this.getUnitScenarioTypeAt(attackerHexKey);
    return attackerClass === "air" && (attackerType === "Fighter" || attackerType === "Interceptor");
  }

  private isAirBombingAttack(attackerHexKey: string): boolean {
    const attackerClass = this.getUnitClassAt(attackerHexKey);
    const attackerType = this.getUnitScenarioTypeAt(attackerHexKey);
    return attackerClass === "air" && (attackerType === "Ground_Attack" || attackerType === "Bomber");
  }

  /** Maps attacker class to tracer visual style. */
  private chooseTracerStyle(attackerClass?: UnitClass): { color: string; width: number } {
    switch (attackerClass) {
      case "infantry":
      case "specialist":
        return { color: "#ffd37a", width: 1.1 }; // small arms – warm yellow, thin streak
      case "vehicle":
        return { color: "#ffe08a", width: 1.5 }; // autocannon – bright yellow
      case "tank":
        return { color: "#ffcf5a", width: 2.0 }; // main gun – still not a beam
      case "artillery":
        return { color: "#ff9e5a", width: 2.5 }; // shells – orange
      case "air":
        return { color: "#aee1ff", width: 1.5 }; // MGs/cannons – cool cyan, very thin
      default:
        return { color: "#ffd37a", width: 1.9 };
    }
  }

  private chooseTracerCount(attackerClass?: UnitClass): number {
    switch (attackerClass) {
      case "infantry":
      case "specialist":
        return 4;
      case "vehicle":
        return 3;
      case "tank":
        return 2;
      case "artillery":
        return 3;
      case "air":
        return 3;
      default:
        return 3;
    }
  }

  private chooseImpactCount(attackerClass?: UnitClass): number {
    switch (attackerClass) {
      case "tank":
      case "artillery":
        return 3;
      case "vehicle":
        return 2;
      case "infantry":
      case "specialist":
        return 2;
      case "air":
        return 2;
      default:
        return 2;
    }
  }

  /** Maps attacker class to a subtle recoil magnitude in pixels. */
  private chooseRecoilMagnitude(attackerClass?: UnitClass): number {
    switch (attackerClass) {
      case "infantry":
      case "specialist":
        return 3;
      case "vehicle":
        return 4;
      case "tank":
      case "artillery":
        return 6;
      case "air":
        return 2;
      default:
        return 5;
    }
  }

  /** Maps defender class to fallback spark-ray count when a sprite impact sheet is not appropriate. */
  private chooseSparkCount(defenderClass?: UnitClass): number {
    switch (defenderClass) {
      case "tank":
        return 12;
      case "vehicle":
        return 9;
      case "air":
        return 6;
      default:
        return 8;
    }
  }

  private getUnitTypeDefinition(unitType?: string): UnitTypeDefinition | undefined {
    if (!unitType) {
      return undefined;
    }
    return (unitTypesData as Record<string, UnitTypeDefinition>)[unitType];
  }

  private getImpactWeaponRating(attackerType?: string, attackerClass?: UnitClass): number {
    const definition = this.getUnitTypeDefinition(attackerType);
    const directFireRating = Math.max(definition?.ap ?? 0, definition?.hardAttack ?? 0);

    if (attackerType === "Bomber") {
      return Math.max(directFireRating, 75);
    }
    if (attackerType === "Ground_Attack") {
      return Math.max(directFireRating, 48);
    }
    if (attackerClass === "artillery") {
      return Math.max(directFireRating, 40);
    }

    return directFireRating;
  }

  private chooseImpactSparkScale(attackerType?: string, attackerClass?: UnitClass): number {
    const impactRating = this.getImpactWeaponRating(attackerType, attackerClass);

    if (impactRating >= 70) return 1.28;
    if (impactRating >= 50) return 1.12;
    if (impactRating >= 32) return 0.98;
    if (impactRating >= 18) return 0.86;
    if (impactRating >= 8) return 0.76;
    return attackerClass === "recon" ? 0.68 : 0.72;
  }

  private chooseImpactSparkBurstCount(attackerType?: string, attackerClass?: UnitClass): number {
    const impactRating = this.getImpactWeaponRating(attackerType, attackerClass);

    if (attackerType === "Bomber") {
      return 3;
    }
    if (attackerType === "Ground_Attack" || attackerClass === "artillery") {
      return 2;
    }
    return impactRating >= 40 ? 2 : 1;
  }

  /**
   * Plays a combat animation at the specified hex key.
   * Returns a promise that resolves when the animation completes.
   */
  async playCombatAnimation(
    animationType: CombatAnimationKey | string,
    hexKey: string,
    offsetX: number = 0,
    offsetY: number = 0,
    scale: number = 1,
    soundRequest?: QueuedWeaponSoundRequest | false
  ): Promise<void> {
    console.log(`[HexMapRenderer] playCombatAnimation START - type: ${animationType}, hex: ${hexKey}, offset: (${offsetX}, ${offsetY}), scale: ${scale}`);

    const dedupeWindowMs = this.getEffectDedupeWindowMs(animationType);
    // Dedupe guard: prevent same effect from firing twice within a short window
    const effectKey = `${animationType}:${hexKey}:${Math.round(offsetX)}:${Math.round(offsetY)}`;
    const now = performance.now();
    const lastCall = this.recentEffects.get(effectKey);
    if (lastCall && now - lastCall < dedupeWindowMs) {
      console.log(`[HexMapRenderer] playCombatAnimation SKIPPED - duplicate within ${dedupeWindowMs}ms: ${effectKey}`);
      return;
    }
    this.recentEffects.set(effectKey, now);

    // Clean up old entries (keep map from growing unbounded)
    if (this.recentEffects.size > 100) {
      const cutoff = now - 1000;
      for (const [key, timestamp] of this.recentEffects.entries()) {
        if (timestamp < cutoff) {
          this.recentEffects.delete(key);
        }
      }
    }

    const hexElement = this.hexElementMap.get(hexKey);
    if (!hexElement) {
      console.warn(`[HexMapRenderer] Hex element not found for key: ${hexKey}`);
      return;
    }
    console.log(`[HexMapRenderer] Hex element found for ${hexKey}:`, hexElement);

    // Derive the hex centre from cached metadata instead of relying on SVG transforms (hex cells are absolute).
    const center = this.extractHexCenter(hexElement);
    if (!center) {
      console.error(`[HexMapRenderer] Could not extract hex center for ${hexKey}`);
      return;
    }
    console.log(`[HexMapRenderer] Hex center for ${hexKey}: (${center.cx}, ${center.cy})`);

    // Animation specs carry their own anchor point so tall blast plumes can sit on the target hex
    // without requiring the renderer to know each sheet's pixel geometry.
    const finalX = center.cx + offsetX;
    const finalY = center.cy + offsetY;

    // Determine if this effect should use terrain-responsive tinting
    let terrainTint: string | undefined;
    if (shouldUseTerrainResponse(animationType)) {
      const terrainType = this.getTerrainTypeAt(hexKey);
      const tint = getTerrainTint(terrainType);
      // Use dust color as the primary terrain tint for effects
      terrainTint = tint.dust;
    }

    await this.playCombatAnimationAt(animationType, finalX, finalY, scale, soundRequest, terrainTint);
    console.log(`[HexMapRenderer] playCombatAnimation COMPLETE - type: ${animationType}, hex: ${hexKey}`);
  }

  /**
   * Plays a combat effect directly at viewport coordinates, which keeps airbursts and future freeform effects off the hex grid.
   */
  private getEffectDedupeWindowMs(animationType: CombatAnimationKey | string): number {
    if (animationType === "flakBurst") {
      return 24;
    }
    if (animationType === "airDamageSmoke") {
      return 40;
    }
    return 100;
  }

  /**
   * Plays a combat effect directly at viewport coordinates, which keeps airbursts and future freeform effects off the hex grid.
   */
  async playCombatAnimationAt(
    animationType: CombatAnimationKey | string,
    x: number,
    y: number,
    scale: number = 1,
    soundRequest?: QueuedWeaponSoundRequest | false,
    terrainTint?: string,
    dedupeKey?: string | false
  ): Promise<void> {
    const effectsLayer = this.ensureCombatEffectsLayer();
    if (!effectsLayer) {
      console.error("[HexMapRenderer] playCombatAnimationAt FAILED - No effects layer available");
      return;
    }
    console.log("[HexMapRenderer] Effects layer obtained:", effectsLayer, "isConnected:", effectsLayer.isConnected, "parentNode:", effectsLayer.parentNode?.nodeName);

    if (!this.combatAnimator) {
      console.log("[HexMapRenderer] Creating new ProceduralEffectsAnimator with SVG effects layer and sound manager");
      this.combatAnimator = new ProceduralEffectsAnimator(effectsLayer, this.soundManager);
    }
    if (!this.combatAnimator) {
      console.warn("[HexMapRenderer] Combat animator not initialized");
      return;
    }
    console.log("[HexMapRenderer] Combat animator ready:", this.combatAnimator);

    if (dedupeKey !== false) {
      const dedupeWindowMs = this.getEffectDedupeWindowMs(animationType);
      const effectKey = dedupeKey ?? `${animationType}:${Math.round(x)}:${Math.round(y)}:${Math.round(scale * 100)}`;
      const now = performance.now();
      const lastCall = this.recentEffects.get(effectKey);
      if (lastCall && now - lastCall < dedupeWindowMs) {
        console.log(`[HexMapRenderer] playCombatAnimationAt SKIPPED - duplicate within ${dedupeWindowMs}ms: ${effectKey}`);
        return;
      }
      this.recentEffects.set(effectKey, now);

      if (this.recentEffects.size > 100) {
        const cutoff = now - 1000;
        for (const [key, timestamp] of this.recentEffects.entries()) {
          if (timestamp < cutoff) {
            this.recentEffects.delete(key);
          }
        }
      }
    }

    const currentZoom = this.getCurrentZoom();
    const zoomTier = getZoomTier(currentZoom);

    if (this.soundCatalogReady) {
      await this.soundCatalogReady;
    }

    console.log(`[HexMapRenderer] Calling combatAnimator.playAnimation at (${x}, ${y}), zoom: ${currentZoom.toFixed(2)} (${zoomTier}), terrain: ${terrainTint ?? 'none'}`);
    await this.combatAnimator.playAnimation(animationType, x, y, scale, zoomTier, terrainTint, soundRequest);
  }

  /**
   * Plays clustered airborne flak puffs around a live aircraft position instead of snapping to a ground hex.
   */
  async playFlakBurstAt(
    x: number,
    y: number,
    count: number = 1,
    scale: number = 1.08,
    dedupeKey?: string | false
  ): Promise<void> {
    const burstCount = Math.max(1, count);
    const spreadPx = burstCount === 1 ? 5 : Math.min(16, 7 + burstCount * 1.6);
    const burstPromises = Array.from({ length: burstCount }).map((_, index) => {
      const ratio = burstCount === 1 ? 0.5 : index / burstCount;
      const angle = ratio * Math.PI * 2 + Math.PI / 6;
      const radius = burstCount === 1 ? 0 : spreadPx * (0.55 + (index % 2) * 0.18);
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius * 0.72;
      const burstScale = scale * (index === 0 ? 1 : Math.max(0.72, 0.92 - index * 0.04));
      return new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playCombatAnimationAt(
            "flakBurst",
            x + offsetX,
            y + offsetY,
            burstScale,
            false,
            undefined,
            dedupeKey === false ? false : dedupeKey
          ).then(() => resolve());
        }, index * 28);
      });
    });

    await Promise.all(burstPromises);
  }

  private playAirShowFlakWave(
    wave: {
      readonly points: ReadonlyArray<AirShowPoint>;
      readonly flashCount: number;
      readonly puffCount: number;
      readonly smokePuffCount: number;
    },
    scale = 1.08,
    smokeScale = 0.92
  ): void {
    wave.points.forEach((point, index) => {
      const flashDelayMs = index * 6;
      const smokeDelayMs = index * 8;
      const puffScale = smokeScale * (1.08 + (index % 6) * 0.06);
      if (index < wave.flashCount) {
        window.setTimeout(() => {
          void this.playFlakBurstAt(point.cx, point.cy, 1, scale * (0.08 + (index % 4) * 0.015), false);
        }, flashDelayMs);
      }
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx, point.cy, puffScale * 1.18, false);
      }, smokeDelayMs);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx + 3, point.cy - 2, puffScale * 1.12, false);
      }, smokeDelayMs + 280);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx - 3, point.cy + 2, puffScale * 1.04, false);
      }, smokeDelayMs + 760);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx + 2, point.cy + 3, puffScale * 0.98, false);
      }, smokeDelayMs + 1520);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx - 3, point.cy - 2, puffScale * 0.9, false);
      }, smokeDelayMs + 2620);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx + 2, point.cy - 3, puffScale * 0.82, false);
      }, smokeDelayMs + 4120);
    });
    wave.points.slice(0, wave.smokePuffCount).forEach((point, index) => {
      const delayMs = 420 + index * 12;
      const puffScale = smokeScale * (1.12 + (index % 5) * 0.06);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx + 2, point.cy - 1, puffScale, false);
      }, delayMs);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx - 2, point.cy + 1, puffScale * 0.96, false);
      }, delayMs + 980);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx + 3, point.cy, puffScale * 0.9, false);
      }, delayMs + 2080);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx - 3, point.cy - 1, puffScale * 0.84, false);
      }, delayMs + 3460);
      window.setTimeout(() => {
        void this.playAirDamageSmokeTrailAt(point.cx + 1, point.cy + 2, puffScale * 0.78, false);
      }, delayMs + 4980);
    });
  }

  /**
   * Plays a faint smoke puff that can trail a damaged aircraft on egress.
   */
  async playAirDamageSmokeTrailAt(
    x: number,
    y: number,
    scale: number = 0.72,
    dedupeKey?: string | false
  ): Promise<void> {
    await this.playCombatAnimationAt("airDamageSmoke", x, y, scale, false, undefined, dedupeKey);
  }

  /**
   * Get weapon effect type for a unit at the specified hex.
   */
  private getWeaponEffectType(hexKey: string): string {
    const scenarioType = this.getUnitScenarioTypeAt(hexKey);
    if (!scenarioType) {
      return "small_arms"; // Fallback
    }

    const unitDef = unitTypesData[scenarioType as keyof typeof unitTypesData];
    if (!unitDef || !unitDef.weaponEffectType) {
      return "small_arms"; // Fallback
    }

    return unitDef.weaponEffectType;
  }

  private resolveWeaponSoundClass(
    attackerHexKey?: string,
    attackerType?: string,
    attackerClass?: UnitClass
  ): WeaponSoundClass {
    if (attackerType === "Bomber") {
      return "large_bomb";
    }
    if (attackerType === "Ground_Attack") {
      return "small_bomb";
    }
    if (attackerClass === "artillery") {
      return "cannon";
    }

    const weaponType = attackerHexKey ? this.getWeaponEffectType(attackerHexKey) : undefined;
    switch (weaponType) {
      case "mg":
        return "mg";
      case "cannon":
        return attackerClass === "tank" ? "tank_75mm" : "cannon";
      case "small_arms":
        return "small_arms";
      default:
        if (attackerClass === "air" || attackerClass === "recon") {
          return "mg";
        }
        if (attackerClass === "tank") {
          return "tank_75mm";
        }
        return "small_arms";
    }
  }

  private createArmorImpactSoundRequest(
    attackerHexKey?: string,
    attackerType?: string,
    attackerClass?: UnitClass,
    gainMultiplier: number = 0.75
  ): QueuedWeaponSoundRequest {
    return {
      weaponClass: this.resolveWeaponSoundClass(attackerHexKey, attackerType, attackerClass),
      targetMaterial: "armor",
      playbackMode: "impact_only",
      gainMultiplier
    };
  }

  private async playWeaponSoundBurst(
    attackerHexKey: string,
    burstCount: number,
    intervalMs: number,
    gainMultiplier: number
  ): Promise<void> {
    const soundClass = this.resolveWeaponSoundClass(
      attackerHexKey,
      this.getUnitScenarioTypeAt(attackerHexKey),
      this.getUnitClassAt(attackerHexKey)
    );

    const soundBursts = Array.from({ length: Math.max(1, burstCount) }).map((_, index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.soundManager.playWeaponSound({
            weaponClass: soundClass,
            playbackMode: "transient_only",
            gainMultiplier,
            seed: Math.floor(performance.now() * 1000) + index
          }).then(() => resolve());
        }, index * intervalMs);
      })
    );

    await Promise.all(soundBursts);
  }

  private chooseDirectFireImpactProfile(
    attackerHexKey: string,
    targetIsHardTarget: boolean,
    defenderIsAir: boolean
  ): {
    animationType: string;
    baseScale: number;
    impactOffsets: Array<[number, number]>;
    staggerMs: number;
  } {
    if (defenderIsAir) {
      return {
        animationType: "explosionSmall",
        baseScale: 1.2,
        impactOffsets: [[-8, -4], [8, 3]],
        staggerMs: 60
      };
    }

    const weaponType = this.getWeaponEffectType(attackerHexKey);
    switch (weaponType) {
      case "mg":
        return {
          animationType: "mg",
          baseScale: targetIsHardTarget ? 0.68 : 0.58,
          impactOffsets: targetIsHardTarget
            ? [
                [-10, -4],
                [8, -1],
                [-2, 6],
                [6, 5]
              ]
            : [
                [-8, -3],
                [7, 2],
                [-1, 5]
              ],
          staggerMs: 44
        };
      case "cannon":
        return {
          animationType: "cannon",
          baseScale: targetIsHardTarget ? 0.8 : 0.7,
          impactOffsets: targetIsHardTarget
            ? [
                [-12, -4],
                [9, 1],
                [-4, 7]
              ]
            : [
                [-9, -3],
                [7, 2]
              ],
          staggerMs: 78
        };
      case "small_arms":
      default:
        return {
          animationType: "small_arms",
          baseScale: targetIsHardTarget ? 0.56 : 0.48,
          impactOffsets: targetIsHardTarget
            ? [
                [-7, -2],
                [6, 1],
                [-2, 5]
              ]
            : [
                [-6, -2],
                [5, 2]
              ],
          staggerMs: 38
        };
    }
  }

  private chooseMuzzleFlashProfile(attackerHexKey: string): {
    animationType: string;
    baseScale: number;
    offsets: Array<[number, number]>;
    staggerMs: number;
  } {
    switch (this.getWeaponEffectType(attackerHexKey)) {
      case "mg":
        return {
          animationType: "mg_muzzle",
          baseScale: 0.3,
          offsets: [
            [0, 0],
            [-4, -1],
            [-2, 2],
            [2, -2],
            [5, 0],
            [1, 3],
            [-5, 1]
          ],
          staggerMs: 18
        };
      case "cannon":
        return {
          animationType: "cannon_muzzle",
          baseScale: 0.42,
          offsets: [
            [0, 0],
            [3, -1],
            [-3, 2]
          ],
          staggerMs: 24
        };
      case "small_arms":
      default:
        return {
          animationType: "small_arms_muzzle",
          baseScale: 0.24,
          offsets: [
            [0, 0],
            [-3, 1],
            [2, -2],
            [4, 1],
            [-1, 3]
          ],
          staggerMs: 20
        };
    }
  }

  /**
   * Get terrain type at the specified hex for terrain-responsive effects.
   */
  private getTerrainTypeAt(hexKey: string): string {
    if (!this.scenarioData) {
      return "plain"; // Fallback
    }

    const parts = hexKey.split(",");
    if (parts.length !== 2) {
      return "plain"; // Fallback
    }

    const col = Number(parts[0]);
    const row = Number(parts[1]);

    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      return "plain"; // Fallback
    }

    const rowTiles = this.scenarioData.tiles[row];
    if (!rowTiles) {
      return "plain"; // Fallback
    }

    const tileInstance = rowTiles[col];
    if (!tileInstance) {
      return "plain"; // Fallback
    }

    const tileDef = this.scenarioData.tilePalette[tileInstance.tile];
    if (!tileDef) {
      return "plain"; // Fallback
    }

    return tileDef.terrain;
  }

  /**
   * Plays a muzzle flash animation at the attacker's hex using the unit's weapon type.
   */
  async playMuzzleFlash(
    attackerHexKey: string,
    soundBursts: number = 1,
    soundIntervalMs: number = 0,
    gainMultiplier: number = 1
  ): Promise<void> {
    const profile = this.chooseMuzzleFlashProfile(attackerHexKey);
    const visualBursts = profile.offsets.map(([offsetX, offsetY], index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const scale = index === 0 ? profile.baseScale : profile.baseScale * Math.max(0.72, 0.94 - index * 0.05);
          void this.playCombatAnimation(profile.animationType, attackerHexKey, offsetX, offsetY, scale, false).then(() => resolve());
        }, index * profile.staggerMs);
      })
    );

    await Promise.all([
      Promise.all(visualBursts).then(() => undefined),
      this.playWeaponSoundBurst(attackerHexKey, soundBursts, soundIntervalMs, gainMultiplier)
    ]);
  }

  /**
   * Plays an explosion animation at the defender's hex.
   * Uses small explosion for infantry, large for tanks/vehicles.
   */
  async playExplosion(defenderHexKey: string, isLargeExplosion: boolean = false): Promise<void> {
    const animType = isLargeExplosion ? "explosionLarge" : "explosionSmall";
    const scale = isLargeExplosion ? 1.6 : 1.2;
    console.log(`[HexMapRenderer] playExplosion called - hex: ${defenderHexKey}, type: ${animType}, scale: ${scale}`);
    await this.playCombatAnimation(animType, defenderHexKey, 0, 0, scale);
    console.log(`[HexMapRenderer] playExplosion completed for hex: ${defenderHexKey}`);
  }

  /**
   * Plays a support-artillery barrage at the defender hex using several smaller offsets
   * instead of one centered detonation.
   */
  async playArtillerySupportImpact(defenderHexKey: string, targetClass?: UnitClass): Promise<void> {
    const defenderIsAir = targetClass === "air";
    const targetIsHardTarget = targetClass === "vehicle" || targetClass === "tank" || targetClass === "air";

    const hitShakePromise = this.playHitShake(defenderHexKey, defenderIsAir ? 7 : targetIsHardTarget ? 6 : 5);
    const impactPromise = defenderIsAir
      ? this.playCombatAnimation("explosionSmall", defenderHexKey, 0, 0, 1.5)
      : this.playArtilleryImpactBurst(defenderHexKey, targetIsHardTarget);
    const dustPromise = defenderIsAir
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          window.setTimeout(() => {
            void this.playDustCloudLinger(defenderHexKey, 0.68).then(() => resolve());
          }, 180);
        });

    await Promise.all([hitShakePromise, impactPromise, dustPromise]);
  }

  /**
   * Plays a dust cloud animation (for movement or near misses).
   */
  async playDustCloud(hexKey: string): Promise<void> {
    console.log(`[HexMapRenderer] playDustCloud called for hex: ${hexKey}`);
    await this.playCombatAnimation("dustCloud", hexKey, 0, 0, 1.2);
    console.log(`[HexMapRenderer] playDustCloud completed for hex: ${hexKey}`);
  }

  /**
   * Soft dust puff helper for aftermath visuals. Currently delegates to playDustCloud;
   * kept separate for future opacity/timing tuning without changing call sites.
   */
  private async playDustCloudLinger(hexKey: string, _opacity: number = 0.6): Promise<void> {
    await this.playDustCloud(hexKey);
  }

  /** Renders a fast, thin tracer streak from attacker to defender and removes it quickly. */
  private async playProjectileTracer(
    attackerHexKey: string,
    defenderHexKey: string,
    durationMs = 90,
    options?: { style?: { color: string; width: number }; jitterPx?: number; segLenScalar?: number }
  ): Promise<void> {
    const layer = this.ensureCombatEffectsLayer();
    if (!this.svgElement || !layer) {
      return;
    }

    const attackerCell = this.hexElementMap.get(attackerHexKey);
    const defenderCell = this.hexElementMap.get(defenderHexKey);
    if (!attackerCell || !defenderCell) {
      return;
    }
    const a = this.extractHexCenter(attackerCell);
    const b = this.extractHexCenter(defenderCell);
    if (!a || !b) {
      return;
    }

    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const length = Math.hypot(dx, dy);

    const style = options?.style ?? this.chooseTracerStyle(this.getUnitClassAt(attackerHexKey));

    const jitter = Math.max(0, options?.jitterPx ?? 0);
    const startJx = jitter > 0 ? (Math.random() - 0.5) * 2 * jitter : 0;
    const startJy = jitter > 0 ? (Math.random() - 0.5) * 2 * jitter : 0;
    const endJx = jitter > 0 ? (Math.random() - 0.5) * 2 * jitter : 0;
    const endJy = jitter > 0 ? (Math.random() - 0.5) * 2 * jitter : 0;

    const x1 = a.cx + startJx;
    const y1 = a.cy + startJy;
    const x2 = b.cx + endJx;
    const y2 = b.cy + endJy;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", style.color);
    line.setAttribute("stroke-width", String(style.width));
    line.setAttribute("stroke-linecap", "round");
    line.style.pointerEvents = "none";
    line.style.opacity = "1";
    // Animate a short dash that travels along the path rather than drawing the entire beam.
    const segScalar = options?.segLenScalar ?? 0.18;
    const segLen = this.clamp(length * segScalar, 6, 24);
    line.style.strokeDasharray = `${segLen} ${length}`;
    line.style.strokeDashoffset = String(length + segLen);
    layer.appendChild(line);

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        line.style.transition = `stroke-dashoffset ${durationMs}ms linear`;
        line.style.strokeDashoffset = "0";
        window.setTimeout(() => {
          line.style.transition = `opacity 60ms ease-out`;
          line.style.opacity = "0";
          window.setTimeout(() => {
            line.remove();
            resolve();
          }, 70);
        }, durationMs);
      });
    });
  }

  /** Briefly nudges the attacker sprite backward opposite the shot vector and returns to rest. */
  private async playRecoilNudge(attackerHexKey: string, defenderHexKey: string, magnitudePx = 5): Promise<void> {
    const attackerCell = this.hexElementMap.get(attackerHexKey);
    const defenderCell = this.hexElementMap.get(defenderHexKey);
    const group = this.hexUnitImageMap.get(attackerHexKey);
    if (!attackerCell || !defenderCell || !group) {
      return;
    }
    const a = this.extractHexCenter(attackerCell);
    const d = this.extractHexCenter(defenderCell);
    if (!a || !d) {
      return;
    }
    const vx = d.cx - a.cx;
    const vy = d.cy - a.cy;
    const vlen = Math.hypot(vx, vy) || 1;
    const ux = -(vx / vlen) * magnitudePx;
    const uy = -(vy / vlen) * magnitudePx;

    const prevTransform = group.style.transform;
    const prevTransition = group.style.transition;

    return new Promise((resolve) => {
      group.style.willChange = "transform";
      group.style.transition = "transform 60ms ease-out";
      group.style.transform = `${prevTransform ? prevTransform + " " : ""}translate(${ux}px, ${uy}px)`;
      window.setTimeout(() => {
        group.style.transition = "transform 90ms ease-in";
        group.style.transform = prevTransform || "";
        window.setTimeout(() => {
          group.style.transition = prevTransition || "";
          group.style.willChange = "auto";
          resolve();
        }, 100);
      }, 65);
    });
  }

  private async playHitShake(hexKey: string, magnitudePx = 4): Promise<void> {
    const group = this.hexUnitImageMap.get(hexKey);
    if (!group) {
      return;
    }

    const prevTransform = group.style.transform;
    const prevTransition = group.style.transition;

    const applyStep = (x: number, y: number, ms: number): void => {
      group.style.transition = `transform ${ms}ms ease-in-out`;
      group.style.transform = `${prevTransform ? prevTransform + " " : ""}translate(${x}px, ${y}px)`;
    };

    return new Promise((resolve) => {
      group.style.willChange = "transform";
      applyStep(-magnitudePx, 0, 30);
      window.setTimeout(() => {
        applyStep(magnitudePx, -magnitudePx / 2, 30);
        window.setTimeout(() => {
          applyStep(-magnitudePx / 2, magnitudePx / 2, 30);
          window.setTimeout(() => {
            applyStep(magnitudePx / 2, 0, 30);
            window.setTimeout(() => {
              group.style.transition = "transform 70ms ease-out";
              group.style.transform = prevTransform || "";
              window.setTimeout(() => {
                group.style.transition = prevTransition || "";
                group.style.willChange = "auto";
                resolve();
              }, 80);
            }, 35);
          }, 35);
        }, 35);
      }, 35);
    });
  }

  /** Emits a short burst of procedural spark rays for air hits and lightweight fallback impacts. */
  private async playLegacySparkBurst(defenderHexKey: string, rayCount = 8, durationMs = 160): Promise<void> {
    const layer = this.ensureCombatEffectsLayer();
    if (!this.svgElement || !layer) {
      return;
    }
    const cell = this.hexElementMap.get(defenderHexKey);
    if (!cell) {
      return;
    }
    const c = this.extractHexCenter(cell);
    if (!c) {
      return;
    }

    const rays: SVGPathElement[] = [];
    for (let i = 0; i < rayCount; i += 1) {
      const ang = (Math.PI * 2 * i) / rayCount + (Math.random() - 0.5) * 0.5;
      const len = 10 + Math.random() * 8;
      const x2 = c.cx + Math.cos(ang) * len;
      const y2 = c.cy + Math.sin(ang) * len;
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", `M ${c.cx} ${c.cy} L ${x2} ${y2}`);
      path.setAttribute("stroke", "#ffd88a");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.style.pointerEvents = "none";
      path.style.opacity = "1";
      const total = len;
      path.style.strokeDasharray = String(total);
      path.style.strokeDashoffset = String(total);
      layer.appendChild(path);
      rays.push(path);
    }

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        rays.forEach((p) => {
          p.style.transition = `stroke-dashoffset ${durationMs}ms ease-out`;
          p.style.strokeDashoffset = "0";
        });
        window.setTimeout(() => {
          rays.forEach((p) => {
            p.style.transition = `opacity 120ms ease-in`;
            p.style.opacity = "0";
          });
          window.setTimeout(() => {
            rays.forEach((p) => p.remove());
            resolve();
          }, 130);
        }, durationMs);
      });
    });
  }

  /**
   * Plays a hit/spark impact effect. Vehicle targets use the FSG sprite sheet, while air and fallback
   * impacts continue to use lightweight procedural spark rays.
   */
  private async playSparkBurst(
    defenderHexKey: string,
    options: {
      attackerHexKey?: string;
      attackerType?: string;
      attackerClass?: UnitClass;
      defenderClass?: UnitClass;
      durationMs?: number;
      rayCount?: number;
      scaleMultiplier?: number;
      burstCount?: number;
    } = {}
  ): Promise<void> {
    const defenderClass = options.defenderClass;
    if (defenderClass !== "tank" && defenderClass !== "vehicle") {
      return this.playLegacySparkBurst(
        defenderHexKey,
        options.rayCount ?? this.chooseSparkCount(defenderClass),
        options.durationMs ?? 160
      );
    }

    const burstCount = this.clamp(
      Math.round(options.burstCount ?? this.chooseImpactSparkBurstCount(options.attackerType, options.attackerClass)),
      1,
      3
    );
    const scaleMultiplier = Math.max(0.65, options.scaleMultiplier ?? 1);
    const baseScale = this.chooseImpactSparkScale(options.attackerType, options.attackerClass) * scaleMultiplier;
    const staggerMs = Math.max(28, Math.min(72, Math.round((options.durationMs ?? 160) * 0.32)));
    const jitterPx = 7 + (burstCount - 1) * 2;
    const impactSoundRequest = this.createArmorImpactSoundRequest(
      options.attackerHexKey,
      options.attackerType,
      options.attackerClass
    );

    const burstPromises = Array.from({ length: burstCount }).map((_, index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const offsetX = (Math.random() - 0.5) * jitterPx * 2;
          const offsetY = (Math.random() - 0.5) * jitterPx * 1.6;
          const scale = index === 0 ? baseScale : baseScale * 0.88;
          void this.playCombatAnimation(
            "impactHits",
            defenderHexKey,
            offsetX,
            offsetY,
            scale,
            {
              ...impactSoundRequest,
              gainMultiplier: index === 0 ? 0.78 : 0.64
            }
          ).then(() => resolve());
        }, index * staggerMs);
      })
    );

    await Promise.all(burstPromises);
  }

  private async playArtilleryImpactBurst(
    defenderHexKey: string,
    targetIsHardTarget: boolean,
    options?: {
      centerOffsetX?: number;
      centerOffsetY?: number;
      spreadScale?: number;
      staggerMs?: number;
      scaleMultiplier?: number;
    }
  ): Promise<void> {
    const spreadPx = (targetIsHardTarget ? HEX_RADIUS * 0.42 : HEX_RADIUS * 0.54) * (options?.spreadScale ?? 1);
    const roundedSpread = Math.max(10, Math.round(spreadPx));
    const centerOffsetX = Math.round(options?.centerOffsetX ?? 0);
    const centerOffsetY = Math.round(options?.centerOffsetY ?? 0);
    const impactOffsets = targetIsHardTarget
      ? [
          [centerOffsetX - roundedSpread, centerOffsetY - Math.round(roundedSpread * 0.28)],
          [centerOffsetX + Math.round(roundedSpread * 0.78), centerOffsetY - Math.round(roundedSpread * 0.14)],
          [centerOffsetX - Math.round(roundedSpread * 0.32), centerOffsetY + Math.round(roundedSpread * 0.52)],
          [centerOffsetX + Math.round(roundedSpread * 0.44), centerOffsetY + Math.round(roundedSpread * 0.38)]
        ]
      : [
          [centerOffsetX - roundedSpread, centerOffsetY + Math.round(roundedSpread * 0.18)],
          [centerOffsetX + Math.round(roundedSpread * 0.82), centerOffsetY - Math.round(roundedSpread * 0.34)],
          [centerOffsetX + Math.round(roundedSpread * 0.16), centerOffsetY + Math.round(roundedSpread * 0.62)],
          [centerOffsetX - Math.round(roundedSpread * 0.46), centerOffsetY - Math.round(roundedSpread * 0.44)]
        ];
    const baseScale = (targetIsHardTarget ? 0.38 : 0.34) * (options?.scaleMultiplier ?? 1);
    const staggerMs = Math.max(70, Math.round(options?.staggerMs ?? 180));

    const burstPromises = impactOffsets.map(([offsetX, offsetY], index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const scale = baseScale * (0.96 + index * 0.04);
          void this.playCombatAnimation("explosionSmall", defenderHexKey, offsetX, offsetY, scale).then(() => resolve());
        }, index * staggerMs);
      })
    );

    await Promise.all(burstPromises);
  }

  private async playRocketArtillerySalvo(
    attackerHexKey: string,
    defenderHexKey: string,
    targetIsHardTarget: boolean
  ): Promise<void> {
    const volleyCenters = [
      { x: -Math.round(HEX_RADIUS * 0.34), y: -Math.round(HEX_RADIUS * 0.18) },
      { x: Math.round(HEX_RADIUS * 0.3), y: -Math.round(HEX_RADIUS * 0.08) },
      { x: Math.round(HEX_RADIUS * 0.06), y: Math.round(HEX_RADIUS * 0.3) }
    ];

    const volleyPromises = volleyCenters.map((center, index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void Promise.all([
            this.playArcedProjectile(attackerHexKey, defenderHexKey, 520, {
              color: "#ff8f4a",
              radius: 2.8,
              arcHeight: 48 + index * 4
            }),
            new Promise<void>((impactResolve) => {
              window.setTimeout(() => {
                void this.playArtilleryImpactBurst(defenderHexKey, targetIsHardTarget, {
                  centerOffsetX: center.x,
                  centerOffsetY: center.y,
                  spreadScale: 0.92,
                  staggerMs: 95,
                  scaleMultiplier: 0.94
                }).then(() => impactResolve());
              }, 230 + index * 20);
            })
          ]).then(() => resolve());
        }, index * 120);
      })
    );

    await Promise.all(volleyPromises);
  }

  /**
   * Plays a full attack animation sequence: muzzle flash + explosion.
   */
  async playAttackSequence(
    attackerHexKey: string,
    defenderHexKey: string,
    targetIsHardTarget: boolean
  ): Promise<void> {
    const attackerElement = this.hexElementMap.get(attackerHexKey);
    const defenderElementForFacing = this.hexElementMap.get(defenderHexKey);
    if (attackerElement && defenderElementForFacing) {
      const a = this.extractHexCenter(attackerElement);
      const d = this.extractHexCenter(defenderElementForFacing);
      if (a && d) {
        // Attacker faces defender
        const attackAngle = this.resolveAngleDegFromVector(d.cx - a.cx, d.cy - a.cy);
        this.setHexFacingAngle(attackerHexKey, a.cx, a.cy, attackAngle);
        // Defender turns to face the incoming threat
        const defendAngle = this.resolveAngleDegFromVector(a.cx - d.cx, a.cy - d.cy);
        this.setHexFacingAngle(defenderHexKey, d.cx, d.cy, defendAngle);
      }
    }

    const attackerClass = this.getUnitClassAt(attackerHexKey);
    const attackerType = this.getUnitScenarioTypeAt(attackerHexKey);
    const defenderClass = this.getUnitClassAt(defenderHexKey);
    const useSmallArmsVisuals = this.isSmallArmsAttack(attackerHexKey);
    const useArcingArtilleryVisuals = this.isArcingArtilleryAttack(attackerHexKey);
    const useRocketArtilleryVisuals = this.isRocketArtilleryAttack(attackerHexKey);
    const useAirStrafingVisuals = this.isAirStrafingAttack(attackerHexKey);
    const useAirBombingVisuals = this.isAirBombingAttack(attackerHexKey);
    const defenderIsAir = defenderClass === "air";
    const suppressImpactFlash = useArcingArtilleryVisuals;

    const defenderElement = this.hexElementMap.get(defenderHexKey);
    const defenderCenter = defenderElement ? this.extractHexCenter(defenderElement) : null;
    const flashRadius = HEX_RADIUS * (useArcingArtilleryVisuals || useAirBombingVisuals ? 1.55 : targetIsHardTarget ? 1.25 : 1.0);
    const flashIntensity = useArcingArtilleryVisuals || useAirBombingVisuals ? 0.62 : targetIsHardTarget ? 0.55 : 0.4;
    const flashOverlayPromise = !suppressImpactFlash && defenderCenter
      ? this.playFlashOverlay(
          defenderCenter,
          flashRadius,
          flashIntensity,
          useArcingArtilleryVisuals || useAirBombingVisuals ? 210 : targetIsHardTarget ? 160 : 130
        )
      : Promise.resolve();

    const muzzleSoundBursts = useAirStrafingVisuals ? 3 : useSmallArmsVisuals ? attackerClass === "recon" ? 2 : 3 : 1;
    const muzzleSoundIntervalMs = useAirStrafingVisuals ? 88 : useSmallArmsVisuals ? 72 : 0;
    const muzzleSoundGain = useAirStrafingVisuals ? 0.78 : useSmallArmsVisuals ? 0.84 : 1;
    const flashPromise = useAirBombingVisuals
      ? Promise.resolve()
      : this.playMuzzleFlash(attackerHexKey, muzzleSoundBursts, muzzleSoundIntervalMs, muzzleSoundGain);
    const markerPromise = this.playTargetMarker(defenderHexKey, 240);

    const recoilMagnitude = this.chooseRecoilMagnitude(attackerClass);
    const recoilPromise = attackerClass === "air" ? Promise.resolve() : this.playRecoilNudge(attackerHexKey, defenderHexKey, recoilMagnitude);

    if (useAirStrafingVisuals) {
      const tracerStyle = { color: "#aee1ff", width: 1.05 };
      const tracerCount = defenderIsAir ? 10 : 9;
      const tracerPromises = Array.from({ length: tracerCount }).map((_, index) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            void this.playProjectileTracer(attackerHexKey, defenderHexKey, 60, {
              style: tracerStyle,
              jitterPx: 7,
              segLenScalar: 0.14
            }).then(() => resolve());
          }, index * 18);
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const hitShakePromise = this.playHitShake(defenderHexKey, defenderIsAir ? 7 : targetIsHardTarget ? 5 : 4);
      const sparksPromise = this.playSparkBurst(defenderHexKey, {
        attackerHexKey,
        attackerType,
        attackerClass,
        defenderClass,
        durationMs: 130,
        rayCount: defenderIsAir ? 10 : targetIsHardTarget ? 9 : 7,
        scaleMultiplier: targetIsHardTarget ? 0.95 : 1
      });
      const airBurstPromise = defenderIsAir
        ? this.playCombatAnimation("explosionSmall", defenderHexKey, 0, 0, 1.45)
        : Promise.resolve();
      const dustPromise = !defenderIsAir && !targetIsHardTarget
        ? this.playCombatAnimation("dustCloud", defenderHexKey, 0, 0, 1.05)
        : Promise.resolve();
      const hardImpactPromise = !defenderIsAir && targetIsHardTarget
        ? this.playCombatAnimation("explosionSmall", defenderHexKey, 0, 0, 1.15)
        : Promise.resolve();

      await Promise.all([
        flashPromise,
        ...tracerPromises,
        recoilPromise,
        markerPromise,
        hitShakePromise,
        sparksPromise,
        airBurstPromise,
        dustPromise,
        hardImpactPromise,
        flashOverlayPromise
      ]);

      return;
    }

    if (useAirBombingVisuals) {
      const bombPromise = this.playArcedProjectile(attackerHexKey, defenderHexKey, 720, {
        color: "#2b2b2b",
        radius: 3.8,
        arcHeight: 72
      });

      await new Promise((resolve) => setTimeout(resolve, 420));

      const hitShakePromise = this.playHitShake(defenderHexKey, defenderIsAir ? 8 : targetIsHardTarget ? 7 : 6);

      const impactAnim = defenderIsAir ? "explosionSmall" : "explosionLarge";
      const baseImpactScale = attackerType === "Bomber" ? 2.6 : 2.25;
      const impactScale = defenderIsAir ? 1.75 : targetIsHardTarget ? baseImpactScale * 1.05 : baseImpactScale;
      const impactPromise = this.playCombatAnimation(impactAnim, defenderHexKey, 0, 0, impactScale);

      const sparksPromise = !defenderIsAir && targetIsHardTarget
        ? this.playSparkBurst(defenderHexKey, {
            attackerHexKey,
            attackerType,
            attackerClass,
            defenderClass,
            durationMs: 160,
            burstCount: 3,
            scaleMultiplier: 1.18
          })
        : Promise.resolve();
      const dustPromise = !defenderIsAir
        ? new Promise<void>((resolve) => {
            window.setTimeout(() => {
              void this.playCombatAnimation("dustCloud", defenderHexKey, 0, 0, 1.8).then(() => resolve());
            }, 90);
          })
        : Promise.resolve();

      await Promise.all([
        bombPromise,
        recoilPromise,
        markerPromise,
        hitShakePromise,
        impactPromise,
        sparksPromise,
        dustPromise,
        flashOverlayPromise
      ]);

      return;
    }

    if (useArcingArtilleryVisuals) {
      const lobPromise = useRocketArtilleryVisuals
        ? Promise.resolve()
        : this.playArcedProjectile(attackerHexKey, defenderHexKey, 620, {
            color: "#ffcf5a",
            radius: 3.2,
            arcHeight: attackerType === "Flak_88" ? 42 : 56
          });

      await new Promise((resolve) => setTimeout(resolve, useRocketArtilleryVisuals ? 120 : 420));

      const hitShakePromise = this.playHitShake(defenderHexKey, targetIsHardTarget ? 6 : 5);

      const impactPromise = defenderIsAir
        ? this.playCombatAnimation("explosionSmall", defenderHexKey, 0, 0, 1.7)
        : useRocketArtilleryVisuals
          ? this.playRocketArtillerySalvo(attackerHexKey, defenderHexKey, targetIsHardTarget)
          : this.playArtilleryImpactBurst(defenderHexKey, targetIsHardTarget);

      const sparksPromise = defenderIsAir
        ? this.playSparkBurst(defenderHexKey, {
            attackerHexKey,
            attackerType,
            attackerClass,
            defenderClass,
            durationMs: 170,
            rayCount: 10
          })
        : targetIsHardTarget
          ? this.playSparkBurst(defenderHexKey, {
              attackerHexKey,
              attackerType,
              attackerClass,
              defenderClass,
              durationMs: 160,
              scaleMultiplier: 1.08
            })
          : Promise.resolve();
      const dustPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          if (defenderIsAir) {
            resolve();
            return;
          }
          void this.playDustCloudLinger(defenderHexKey, 0.65).then(() => resolve());
        }, useRocketArtilleryVisuals ? 260 : 140);
      });

      await Promise.all([
        flashPromise,
        lobPromise,
        recoilPromise,
        markerPromise,
        hitShakePromise,
        impactPromise,
        sparksPromise,
        dustPromise,
        flashOverlayPromise
      ]);

      return;
    }

    const tracerStyle = useSmallArmsVisuals
      ? { color: "#ffe9a8", width: attackerClass === "recon" ? 1.1 : 1.2 }
      : this.chooseTracerStyle(attackerClass);
    const tracerCount = useSmallArmsVisuals ? (attackerClass === "recon" ? 9 : 8) : this.chooseTracerCount(attackerClass);
    const tracerPromises = Array.from({ length: tracerCount }).map((_, index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playProjectileTracer(attackerHexKey, defenderHexKey, useSmallArmsVisuals ? 70 : index === 0 ? 90 : 110, {
            style: tracerStyle,
            jitterPx: useSmallArmsVisuals ? 6 : 0,
            segLenScalar: useSmallArmsVisuals ? 0.12 : 0.18
          }).then(() => resolve());
        }, index * (useSmallArmsVisuals ? 28 : 55));
      })
    );

    await new Promise((resolve) => setTimeout(resolve, useSmallArmsVisuals ? 90 : 110));

    const hitShakePromise = this.playHitShake(defenderHexKey, targetIsHardTarget ? 5 : 4);

    if (useSmallArmsVisuals) {
      const sparksPromise = this.playSparkBurst(defenderHexKey, {
        attackerHexKey,
        attackerType,
        attackerClass,
        defenderClass,
        durationMs: 140,
        rayCount: targetIsHardTarget ? 8 : 6
      });
      const airBurstPromise = defenderIsAir ? this.playCombatAnimation("explosionSmall", defenderHexKey, 0, 0, 1.35) : Promise.resolve();
      const dustPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          if (defenderIsAir) {
            resolve();
            return;
          }
          void this.playDustCloudLinger(defenderHexKey, 0.55).then(() => resolve());
        }, 70);
      });

      await Promise.all([
        flashPromise,
        ...tracerPromises,
        recoilPromise,
        markerPromise,
        hitShakePromise,
        sparksPromise,
        airBurstPromise,
        dustPromise,
        flashOverlayPromise
      ]);

      return;
    }

    const impactProfile = this.chooseDirectFireImpactProfile(attackerHexKey, targetIsHardTarget, defenderIsAir);
    const impactPromises = impactProfile.impactOffsets.map(([ox, oy], index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const scale = index === 0 ? impactProfile.baseScale : impactProfile.baseScale * (0.94 - index * 0.03);
          void this.playCombatAnimation(impactProfile.animationType, defenderHexKey, ox, oy, scale, false).then(() => resolve());
        }, index * impactProfile.staggerMs);
      })
    );

    const sparksPromise = defenderIsAir
      ? this.playSparkBurst(defenderHexKey, {
          attackerHexKey,
          attackerType,
          attackerClass,
          defenderClass,
          durationMs: 170,
          rayCount: 9
        })
      : targetIsHardTarget
        ? this.playSparkBurst(defenderHexKey, {
            attackerHexKey,
            attackerType,
            attackerClass,
            defenderClass
          })
        : Promise.resolve();
    const dustPromise = !defenderIsAir && !targetIsHardTarget
      ? new Promise<void>((resolve) => {
          window.setTimeout(() => {
            void this.playDustCloudLinger(defenderHexKey, 0.6).then(() => resolve());
          }, 120);
        })
      : Promise.resolve();

    await Promise.all([
      flashPromise,
      ...tracerPromises,
      recoilPromise,
      markerPromise,
      hitShakePromise,
      ...impactPromises,
      sparksPromise,
      dustPromise,
      flashOverlayPromise
    ]);
  }
}
