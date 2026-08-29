import type { IMapRenderer } from "../contracts/IMapRenderer";
import { normalizeFacingDirection, type HexEdgeFacing, type HexModification, type ScenarioData, type ScenarioUnit, type TerrainDictionary, type UnitClass, type UnitTypeDefinition } from "../core/types";
import { getSpriteForScenarioType, getCompositeSpritesForUnit } from "../data/unitSpriteCatalog";
import { HEX_RADIUS, HEX_HEIGHT, HEX_WIDTH } from "../core/balance";
import { CoordinateSystem, type TileDetails } from "./CoordinateSystem";
import { TerrainRenderer } from "./TerrainRenderer";
import { RoadOverlayRenderer } from "./RoadOverlayRenderer";
import { RiverOverlayRenderer } from "./RiverOverlayRenderer";
import { ProceduralEffectsAnimator, getZoomTier } from "./ProceduralEffects";
import { SpriteSheetAnimator } from "./SpriteSheetAnimator";
import { loadEffectSpecifications, type RawEffectSpec } from "./EffectSpecifications";
import { getTerrainTint, shouldUseTerrainResponse, loadTerrainTints, type TerrainTint } from "./TerrainResponseSystem";
import { WreckFxRenderer, resolveWreckFxClass, type WreckFxClass } from "./WreckFxRenderer";
import { CombatSoundManager, type QueuedWeaponSoundRequest } from "../audio/CombatSoundManager";
import type { SoundCatalog, WeaponSoundClass } from "../audio/SoundAssetMetadata";
import { sampleAirShowWaypointPath } from "../ui/airshow/AirShowPathMath";
import {
  AIR_SHOW_OFF_MAP_DISTANCE_PX,
  buildAirShowPhaseTimingAudit,
  buildAirShowMapBounds,
  resolveAirShowFallbackOrigin,
  resolveAirShowBoundsRayIntersection,
  resolveAirShowHqAxis,
  type AirShowHqAxis,
  type AirShowInspectionPhaseTimingRoleAudit,
  type AirShowMapBounds
} from "../ui/airshow/AirShowPlanner";
import { planAirShowTimeline } from "../ui/airshow/AirShowDirector";
import {
  sampleAirShowTimelineTrack,
  type AirShowTimeline,
  type AirShowTimelineBeat,
  type AirShowTimelineCue,
  type AirShowTimelineTrack
} from "../ui/airshow/AirShowTimeline";
import {
  AIR_SHOW_FIGHTER_CLASH_START_PROGRESS,
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS as AIR_SHOW_POLICY_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS as AIR_SHOW_POLICY_FIGHTER_SPEED_PX_PER_MS
} from "../ui/airshow/AirShowPlaybackPolicy";
import {
  type AirShowPlannerActor,
  type AirShowPlannerFlight
} from "../ui/airshow/AirShowPlaybackPlanner";
import { resolveResolvedAirShowBombers } from "../ui/airshow/AirShowPlaybackScene";
import type {
  AirShowInspectionAssignment,
  AirShowInspectionFlakBurst,
  AirShowInspectionFlight,
  AirShowInspectionFlightActor,
  AirShowInspectionPoint,
  AirShowInspectionPhase,
  AirShowInspectionReport,
  AirShowInspectionSampledPosition,
  AirShowInspectionTracer,
  AirShowPoint,
  PlannedAirShowFlight,
  PlannedAirShowPhase,
  PlannedAirShowScene,
  ResolvedAirShowExchange,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowFlakBurst,
  ResolvedAirShowScene,
  ResolvedAirShowStrikeFlightSpec,
  SpriteRenderFaction
} from "../ui/airshow/AirShowPlaybackScene";
import {
  beginAirShowRuntimeTrace,
  completeAirShowRuntimeTrace,
  recordAirShowRuntimeTraceEvent,
  type AirShowRuntimeTraceActorState,
  type AirShowRuntimeTraceEvent,
  type AirShowRuntimeTraceSession
} from "../ui/airshow/AirShowRuntimeTrace";
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
import unitTypesData from "../data/unitSystem/derivedUnitTypes";
import { axialDirections, hexLine, type Axial } from "../core/Hex";

export type {
  AirShowInspectionOriginPlan,
  AirShowInspectionPhaseTimingAudit,
  AirShowInspectionPhaseTimingRoleAudit
} from "../ui/airshow/AirShowPlanner";

type RenderedSuppressionState = "clear" | "suppressed" | "pinned" | "broken";
type RenderedStatusPip = "sentry" | "suppressed" | "pinned" | "broken";
export type {
  AirShowInspectionAssignment,
  AirShowInspectionFlakBurst,
  AirShowInspectionFlight,
  AirShowInspectionFlightActor,
  AirShowInspectionPoint,
  AirShowInspectionPhase,
  AirShowInspectionReport,
  AirShowInspectionSampledPosition,
  AirShowInspectionTracer,
  ResolvedAirShowExchange,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowFlakBurst,
  ResolvedAirShowScene,
  ResolvedAirShowStrikeFlightSpec,
  SpriteRenderFaction
} from "../ui/airshow/AirShowPlaybackScene";

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

export interface AirShowPlaybackCallbacks {
  readonly onImpact?: () => void | Promise<void>;
  readonly playImpactEffects?: boolean;
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
const INITIATIVE_GROUP_HIGHLIGHT_CLASS = "initiative-group-highlight";
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
const FORMATION_SMALL_ARMS_IMPACT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-12, -4],
  [9, 2],
  [-3, 7],
  [14, -6],
  [-17, 5],
  [4, -9]
];
const FORMATION_MG_IMPACT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-8, -2],
  [7, 1],
  [1, 6],
  [12, -4],
  [-13, 4]
];
const FORMATION_HE_IMPACT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-18, -6],
  [13, 8],
  [-3, 14]
];

type CombatAnimationKey = keyof typeof import("./SpriteSheetAnimator").COMBAT_ANIMATIONS;
type BombImpactVisual = {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
};
type BombImpactPattern = {
  readonly impacts: ReadonlyArray<BombImpactVisual>;
  readonly staggerMs: number;
  readonly projectileDurationMs: number;
  readonly projectileStaggerMs: number;
  readonly projectileRadius: number;
  readonly projectileArcHeight: number;
  readonly projectileCount: number;
  readonly dustScale: number;
};
type UnitWeaponModelForVisuals = NonNullable<UnitTypeDefinition["weaponModel"]>;
type WeaponVisualRole = UnitWeaponModelForVisuals["groups"][number]["role"];
type FormationFireMix = {
  readonly attackerType?: string;
  readonly attackerClass?: UnitClass;
  readonly hasWeaponModel: boolean;
  readonly totalShots: number;
  readonly shotsByRole: Partial<Record<WeaponVisualRole, number>>;
};
type TracerVisualLayer = {
  readonly count: number;
  readonly delayMs: number;
  readonly staggerMs: number;
  readonly durationMs: number;
  readonly jitterPx: number;
  readonly segLenScalar: number;
  readonly style: { readonly color: string; readonly width: number };
};
type MuzzleFlashProfile = {
  readonly animationType: string;
  readonly baseScale: number;
  readonly offsets: Array<[number, number]>;
  readonly staggerMs: number;
  readonly delayMs?: number;
};
type AircraftAnimationProgressCallback = (progress: number, centerX: number, centerY: number) => void;
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
type AirShowAssignmentProgressKeyframe = {
  timeMs: number;
  progress: number;
};
type AirShowPhaseAssignment = {
  actor: AirShowRuntimeActor;
  points: AirShowPoint[];
  headingBlend?: number;
  multiFlightOffsetPx?: number;
  progressOffset?: number;
  distanceBudgetPx?: number;
  progressTimeline?: ReadonlyArray<AirShowAssignmentProgressKeyframe>;
};
type AirShowBomberApproachProfile = {
  targetCenter: AirShowPoint;
  targetApproach: AirShowPoint;
  standoffPoint: AirShowPoint;
  laneIndex: number;
};
type AirShowBomberAdvancePlan = {
  assignments: AirShowPhaseAssignment[];
  destinationsByBomberId: Map<string, AirShowPoint>;
};
type AirShowContestedBomberPhaseDurations = {
  fighterIngressDurationMs: number;
  escortMergeDurationMs: number;
  escortScrambleDurationMs: number;
  bomberIngressDurationMs: number;
  bomberDefenseDurationMs: number;
};
type AirShowContestedBomberPhaseLabel =
  | "fighter-ingress"
  // INVESTIGATION: This phase name suggests escorts merging, but buildContestedBomberPhaseSliceAssignments
  // only slices bomber master paths for this time window. No explicit fighter/interceptor assignments
  // are built for this phase - fighters only have explicit assignments during fighter-ingress.
  | "escort-clash-merge"
  // INVESTIGATION: Same as escort-clash-merge - this phase only slices bomber master paths.
  // No explicit fighter/interceptor assignments are built for this phase.
  | "escort-clash-scramble"
  | "bomber-ingress"
  | "bomber-defense-pass";
type AirShowPhaseOptions = {
  easing?: "easeInOut" | "linear";
  sceneActors?: ReadonlyArray<AirShowRuntimeActor>;
  visibleActorIds?: ReadonlyArray<string>;
  phaseLabel?: string;
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

/**
 * Handle returned when staging a unit move so callers can delay playback until the camera settles.
 * Ensures the ghost sprite is already parked on the origin tile while the moving source sprite stays hidden.
 */
export interface MoveAnimationHandle {
  play(durationMs: number): Promise<void>;
  dispose(): void;
}

export interface MoveAnimationOptions {
  readonly path?: readonly string[];
  readonly unitId?: string | null;
}

interface MoveAnimationContext {
  ghost: SVGGElement;
  hiddenGroup: SVGGElement;
  restoreOpacity: string;
  setGhostProgress: (progress: number) => void;
}

interface MoveAnimationSubject {
  readonly cloneSource: SVGGElement;
  readonly hiddenGroup: SVGGElement;
}

interface MovePathPoint {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
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
export interface HexMapRendererAssetSources {
  readonly effects: string | readonly RawEffectSpec[];
  readonly terrainTints: string | readonly TerrainTint[];
  readonly sounds: SoundCatalog;
}

export class HexMapRenderer implements IMapRenderer {
  constructor(private readonly assetSources?: HexMapRendererAssetSources) {}

  private static readonly AIRCRAFT_GHOST_ICON_SIZE = 60;
  private static readonly AIRCRAFT_FORMATION_SPACING = 33;
  private static readonly MIN_STRENGTH_PER_STACK_ACTOR = 25;
  private static readonly AIRCRAFT_ORBIT_HEADING_BLEND = 0.28;
  // North Star Spec §Speed Model: Fighter V = 11.5 px/100ms, Bomber V/2 = 5.75 px/100ms.
  private static readonly AIR_SHOW_BOMBER_SPEED_PX_PER_MS = AIR_SHOW_POLICY_BOMBER_SPEED_PX_PER_MS;
  private static readonly AIR_SHOW_FIGHTER_SPEED_PX_PER_MS = AIR_SHOW_POLICY_FIGHTER_SPEED_PX_PER_MS;
  private static readonly AIR_SHOW_BOMBER_STANDOFF_DISTANCE_PX = HEX_HEIGHT * 2;
  // Role-based size multipliers: bombers are 2x fighter size
  private static readonly AIRCRAFT_FIGHTER_SIZE_MULTIPLIER = 0.75;
  private static readonly AIRCRAFT_BOMBER_SIZE_MULTIPLIER = 1.5;
  // Role-based spacing multipliers (proportional to size to prevent overlap)
  private static readonly AIRCRAFT_FIGHTER_SPACING_MULTIPLIER = 0.75;
  private static readonly AIRCRAFT_BOMBER_SPACING_MULTIPLIER = 1.5;
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
  private readonly riverRenderer = new RiverOverlayRenderer();
  private readonly reconOverlayState = new Map<string, ReconStatusKey>();
  private combatAnimator: ProceduralEffectsAnimator | null = null;
  private spriteSheetAnimator: SpriteSheetAnimator | null = null;
  private readonly soundManager: CombatSoundManager = new CombatSoundManager();
  private readonly recentEffects = new Map<string, number>(); // Dedupe guard: effectKey -> timestamp
  private activeAirShowRuntimeTrace: AirShowRuntimeTraceSession | null = null;
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
  private readonly initiativeGroupHighlightKeys = new Set<string>();
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
  /** Top-level layer for smoke overlays so they always render above adjacent hex cells. */
  private smokeScreenLayer: SVGGElement | null = null;
  private selectionGlow: SVGCircleElement | null = null;

  private svgElement: SVGSVGElement | null = null;
  /** Single transform owner - all pan/zoom should transform ONLY this group, not the SVG */
  private viewportRoot: SVGGElement | null = null;
  private canvasElement: HTMLDivElement | null = null;
  private scenarioData: ScenarioData | null = null;
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;
  /** Optional backdrop image URL (e.g., campaign map) to render behind the tactical hex grid. */
  private backdropImageUrl: string | null = null;
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
   * Sets an optional backdrop image URL (e.g., campaign map) to render behind the tactical hex grid.
   * The backdrop is rendered as an SVG image element at the root level, outside the viewportRoot,
   * so it remains static during pan/zoom operations.
   */
  setBackdropImage(url: string | null): void {
    this.backdropImageUrl = url;
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
    return this.planResolvedAirCombatShow(scene);
  }

  private planResolvedAirCombatTimeline(scene: ResolvedAirShowScene): AirShowTimeline | null {
    if (!this.svgElement) {
      return null;
    }
    const mapBounds = this.resolveAirShowMapBounds();
    if (!mapBounds) {
      return null;
    }
    const fallbackCenter = {
      cx: (mapBounds.minX + mapBounds.maxX) * 0.5,
      cy: (mapBounds.minY + mapBounds.maxY) * 0.5
    };
    const engagement = this.resolveHexCenterByKey(scene.hexKey) ?? fallbackCenter;
    const targetHexKey =
      scene.bomberTargetHexKey
      ?? resolveResolvedAirShowBombers(scene)[0]?.targetHexKey
      ?? null;
    const timeline = planAirShowTimeline({
      scene,
      mapBounds,
      playerHq: this.resolveHexCenterByKey(scene.playerHqKey),
      botHq: this.resolveHexCenterByKey(scene.botHqKey),
      engagement,
      target: this.resolveHexCenterByKey(targetHexKey) ?? engagement,
      hexWidth: HEX_WIDTH,
      hexHeight: HEX_HEIGHT
    });
    if (!timeline.verification.valid) {
      const details = timeline.verification.findings
        .map((finding) => `[${finding.code}] ${finding.message}`)
        .join("\n");
      throw new Error(`Air show timeline verification failed for ${scene.hexKey}:\n${details}`);
    }
    return timeline;
  }

  private sampleTimelineTrackForBeat(
    track: AirShowTimelineTrack,
    beat: AirShowTimelineBeat,
    sampleCount = 16
  ): AirShowInspectionSampledPosition[] {
    const durationMs = Math.max(1, beat.endTimeMs - beat.startTimeMs);
    return Array.from({ length: Math.max(2, sampleCount) + 1 }, (_, index) => {
      const progress = index / Math.max(2, sampleCount);
      const absoluteTimeMs = beat.startTimeMs + durationMs * progress;
      const sample = sampleAirShowTimelineTrack(track, absoluteTimeMs);
      return {
        timeMs: durationMs * progress,
        progress,
        pathProgress: sample?.segmentProgress ?? progress,
        cx: sample?.point.cx ?? 0,
        cy: sample?.point.cy ?? 0,
        headingDegrees: sample?.headingDegrees ?? 0
      };
    });
  }

  private describeAirShowTimeline(timeline: AirShowTimeline): PlannedAirShowScene {
    const actorsById = new Map(timeline.actors.map((actor) => [actor.actorId, actor] as const));
    const tracksByActorId = new Map(timeline.tracks.map((track) => [track.actorId, track] as const));
    const flights: PlannedAirShowFlight[] = timeline.flights.map((flight) => ({
      id: flight.id,
      role: flight.role,
      combatRole: flight.combatRole,
      faction: flight.faction,
      scenarioType: flight.scenarioType,
      originHexKey: flight.originHexKey,
      strengthBefore: flight.strengthBefore,
      strengthAfterEscortPhase: flight.strengthAfterEscortPhase,
      finalStrength: flight.finalStrength,
      laneOffsetPx: flight.laneOffsetPx,
      actors: flight.actorIds.flatMap((actorId) => {
        const actor = actorsById.get(actorId);
        const track = tracksByActorId.get(actorId);
        const sample = track ? sampleAirShowTimelineTrack(track, track.visibleFromMs) : null;
        if (!actor || !track || !sample) {
          return [];
        }
        return [{
          actorId,
          flightId: flight.id,
          role: flight.role,
          active: true,
          headingDegrees: sample.headingDegrees,
          position: sample.point,
          size: actor.size,
          formationIndex: actor.formationIndex,
          biasX: 0,
          biasY: 0
        }];
      })
    }));
    const phases: PlannedAirShowPhase[] = timeline.beats.map((beat) => {
      const durationMs = Math.max(1, beat.endTimeMs - beat.startTimeMs);
      const phaseTracks = timeline.tracks.filter((track) =>
        track.segments.some((segment) => segment.label === beat.label)
      );
      const assignments = phaseTracks.map((track) => {
        const segments = track.segments.filter((segment) => segment.label === beat.label);
        const points = segments.flatMap((segment, segmentIndex) =>
          segmentIndex === 0 ? [...segment.points] : segment.points.slice(1)
        );
        return {
          actorId: track.actorId,
          flightId: track.flightId,
          role: track.role,
          points,
          sampledPositions: this.sampleTimelineTrackForBeat(track, beat)
        };
      });
      const tracerCues = timeline.cues.filter(
        (cue) => cue.kind === "tracer" && cue.timeMs >= beat.startTimeMs && cue.timeMs <= beat.endTimeMs
      );
      const tracers = tracerCues.flatMap((cue) => {
        if (cue.kind !== "tracer") {
          return [];
        }
        const sourceTrack = tracksByActorId.get(cue.sourceActorId);
        const targetTrack = tracksByActorId.get(cue.targetActorId);
        const source = sourceTrack ? sampleAirShowTimelineTrack(sourceTrack, cue.timeMs) : null;
        const target = targetTrack ? sampleAirShowTimelineTrack(targetTrack, cue.timeMs) : null;
        if (!source || !target) {
          return [];
        }
        return [{
          progress: this.clamp((cue.timeMs - beat.startTimeMs) / durationMs, 0, 1),
          sourceActorId: cue.sourceActorId,
          targetActorId: cue.targetActorId,
          emitter: cue.emitter,
          emitterPoint: source.point,
          sourceHeadingDegrees: source.headingDegrees,
          width: cue.width,
          lifetimeMs: cue.lifetimeMs,
          streakLengthPx: Math.hypot(target.point.cx - source.point.cx, target.point.cy - source.point.cy),
          visibleLengthPx: cue.visibleLengthPx,
          fanHalfAngleDeg: 0,
          centerlineEndPoint: target.point,
          color: cue.color,
          burstCount: 1,
          spreadPx: 0
        }];
      });
      const flakBursts = timeline.cues.flatMap((cue): AirShowInspectionFlakBurst[] => {
        if (cue.kind !== "flak" || cue.timeMs < beat.startTimeMs || cue.timeMs > beat.endTimeMs) {
          return [];
        }
        const bomberTrack = tracksByActorId.get(cue.bomberActorId);
        const bomberSample = bomberTrack ? sampleAirShowTimelineTrack(bomberTrack, cue.timeMs) : null;
        return [{
          progress: this.clamp((cue.timeMs - beat.startTimeMs) / durationMs, 0, 1),
          bomberUnitKey: actorsById.get(cue.bomberActorId)?.flightId ?? cue.bomberActorId,
          targetHexKey: null,
          batteryHexKey: cue.batteryHexKey,
          sampledBomberCenter: bomberSample?.point,
          rangeReferenceCenter: timeline.geometry.target,
          targetCenter: bomberSample?.point ?? timeline.geometry.target,
          targetSource: "bomberPath",
          burstCenter: cue.point,
          flashCount: 1,
          puffCount: 1,
          smokePuffCount: 2,
          scale: cue.scale,
          smokeScale: cue.smokeScale,
          widthPx: 0,
          heightPx: 0,
          points: [cue.point]
        }];
      });
      return {
        label: beat.label,
        startTimeMs: beat.startTimeMs,
        endTimeMs: beat.endTimeMs,
        durationMs,
        visibleActorIds: timeline.tracks
          .filter((track) => track.visibleFromMs <= beat.endTimeMs && track.visibleUntilMs >= beat.startTimeMs)
          .map((track) => track.actorId),
        assignments,
        tracers,
        flakBursts
      };
    });
    const roleSpeeds = new Map<"interceptor" | "escort" | "bomber", number>([
      ["interceptor", AIR_SHOW_POLICY_FIGHTER_SPEED_PX_PER_MS],
      ["escort", AIR_SHOW_POLICY_FIGHTER_SPEED_PX_PER_MS],
      ["bomber", AIR_SHOW_POLICY_BOMBER_SPEED_PX_PER_MS]
    ]);
    const phaseTimingAudit = timeline.beats.map((beat) => {
      const durationMs = Math.max(1, beat.endTimeMs - beat.startTimeMs);
      return buildAirShowPhaseTimingAudit(
        beat.label,
        durationMs,
        timeline.tracks.flatMap((track) => {
          const segments = track.segments.filter((segment) => segment.label === beat.label);
          if (segments.length === 0) {
            return [];
          }
          return [{
            role: track.role,
            pathLengthPx: segments.reduce((sum, segment) => sum + segment.lengthPx, 0),
            activeDurationMs: segments.reduce(
              (sum, segment) => sum + segment.endTimeMs - segment.startTimeMs,
              0
            )
          }];
        }),
        roleSpeeds
      );
    });
    return {
      timelineVersion: 2,
      timelineScenario: timeline.scenario,
      timelineTotalDurationMs: timeline.totalDurationMs,
      timelineFindings: timeline.verification.findings,
      hexKey: timeline.sceneId,
      center: timeline.geometry.engagement,
      corridor: {
        center: timeline.geometry.engagement,
        entry: timeline.geometry.attackOrigin,
        merge: timeline.geometry.merge,
        strike: timeline.geometry.target,
        exit: timeline.geometry.defenseOrigin
      },
      hqMidX: (timeline.geometry.playerHq.cx + timeline.geometry.botHq.cx) * 0.5,
      bomberTarget: timeline.geometry.target,
      originPlan: timeline.originPlan,
      phaseTimingAudit,
      flights,
      phases
    };
  }

  private planResolvedAirCombatShow(scene: ResolvedAirShowScene): PlannedAirShowScene | null {
    const timeline = this.planResolvedAirCombatTimeline(scene);
    return timeline ? this.describeAirShowTimeline(timeline) : null;
  }

  private describePlannedAirShowFlight(flight: AirShowPlannerFlight): PlannedAirShowFlight {
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
      laneOffsetPx: flight.spec.laneOffsetPx,
      actors: flight.actors.map((actor) => ({
        actorId: actor.id,
        flightId: actor.flightId,
        role: actor.role,
        active: actor.active,
        headingDegrees: actor.headingDegrees,
        position: { cx: actor.position.cx, cy: actor.position.cy },
        size: actor.size,
        formationIndex: actor.formationIndex,
        biasX: actor.biasX,
        biasY: actor.biasY
      }))
    };
  }

  private playAirShowTimelineCue(
    cue: AirShowTimelineCue,
    actorsById: ReadonlyMap<string, AirShowRuntimeActor>,
    callbacks: AirShowPlaybackCallbacks
  ): void {
    if (cue.kind === "tracer") {
      const source = actorsById.get(cue.sourceActorId);
      const target = actorsById.get(cue.targetActorId);
      if (!source || !target || !source.active || !target.active) {
        return;
      }
      this.playAirShowTracerBurst({
        progress: 0,
        source,
        target,
        emitter: cue.emitter,
        color: cue.color,
        width: cue.width,
        lifetimeMs: cue.lifetimeMs,
        streakLengthPx: Math.hypot(
          target.position.cx - source.position.cx,
          target.position.cy - source.position.cy
        ),
        visibleLengthPx: cue.visibleLengthPx,
        fanHalfAngleDeg: 0,
        burstCount: 1,
        spreadPx: 0
      });
      return;
    }
    if (cue.kind === "flak") {
      this.playAirShowFlakWave(
        {
          points: [cue.point],
          flashCount: 1,
          puffCount: 1,
          smokePuffCount: 2,
          smokeLingerMs: cue.lingerMs
        },
        cue.scale,
        cue.smokeScale
      );
      return;
    }
    if (cue.kind === "impact") {
      if (cue.targetHexKey && callbacks.playImpactEffects !== false) {
        void this.playExplosion(cue.targetHexKey, true);
        void this.playDustCloud(cue.targetHexKey);
      }
      if (callbacks.onImpact) {
        void Promise.resolve(callbacks.onImpact());
      }
      return;
    }
    if (cue.kind === "bomb-release") {
      const bomber = actorsById.get(cue.bomberActorId);
      bomber?.image.setAttribute("data-airshow-bomb-released", "true");
      return;
    }
    const actor = actorsById.get(cue.actorId);
    if (actor) {
      actor.image.setAttribute("data-airshow-destroyed", "true");
      void this.playAirDamageSmokeTrailAt(actor.position.cx, actor.position.cy, 0.78);
    }
  }

  private async animateAirShowTimeline(
    scene: ResolvedAirShowScene,
    timeline: AirShowTimeline,
    callbacks: AirShowPlaybackCallbacks
  ): Promise<void> {
    const layer = this.ensureCombatEffectsLayer();
    if (!layer) {
      return;
    }
    const plannedScene = this.describeAirShowTimeline(timeline);
    const runtimeFlights = plannedScene.flights
      .map((flight) => this.buildAirShowRuntimeFlightFromPlan(layer, flight))
      .filter((flight): flight is AirShowRuntimeFlightInternal => !!flight);
    const sceneActors = runtimeFlights.flatMap((flight) => flight.actors);
    const actorsById = new Map(sceneActors.map((actor) => [actor.id, actor] as const));
    const tracksByActorId = new Map(timeline.tracks.map((track) => [track.actorId, track] as const));
    const destructionTimeByActorId = new Map(
      timeline.cues.flatMap((cue) => cue.kind === "destruction" ? [[cue.actorId, cue.timeMs] as const] : [])
    );
    const packageId = `ascene-v2-${Date.now()}-${timeline.seed.toString(36)}`;
    logAirShowPackageStart(
      packageId,
      "ResolvedAirCombat",
      "AirShowTimelinePlayer",
      plannedScene.flights.map((flight) => flight.id),
      plannedScene.flights.map((flight) => flight.role as AirShowRole),
      scene.hexKey
    );
    logAirShowOwnershipAssert(packageId, "AirShowTimelinePlayer", null);
    this.activeAirShowRuntimeTrace = beginAirShowRuntimeTrace(scene, plannedScene);
    sceneActors.forEach((actor) => {
      actor.active = false;
      actor.image.style.opacity = "0";
      actor.image.setAttribute("data-airshow-active", "false");
      actor.image.setAttribute("data-airshow-timeline-version", String(timeline.version));
    });

    let status: "success" | "error" = "success";
    let runtimeError: string | null = null;
    let nextCueIndex = 0;
    let currentBeatLabel = "pre-roll";
    const cueCounts = new Map<AirShowTimelineCue["kind"], number>();
    (["tracer", "flak", "bomb-release", "impact", "destruction"] as const).forEach((kind) => {
      cueCounts.set(kind, 0);
      layer.setAttribute(`data-airshow-cue-count-${kind}`, "0");
    });
    layer.setAttribute("data-airshow-completed", "false");
    layer.setAttribute("data-airshow-total-duration-ms", String(Math.round(timeline.totalDurationMs)));
    try {
      await new Promise<void>((resolve) => {
        const startTime = performance.now();
        const step: FrameRequestCallback = (now) => {
          const elapsedMs = Math.min(timeline.totalDurationMs, Math.max(0, now - startTime));
          const activeBeat = [...timeline.beats]
            .reverse()
            .find((beat) => elapsedMs >= beat.startTimeMs && elapsedMs <= beat.endTimeMs);
          const nextBeatLabel = activeBeat?.label ?? (elapsedMs >= timeline.totalDurationMs ? "complete" : "transition");
          layer.setAttribute("data-airshow-time-ms", String(Math.round(elapsedMs)));
          if (nextBeatLabel !== currentBeatLabel) {
            currentBeatLabel = nextBeatLabel;
            layer.setAttribute("data-airshow-beat", currentBeatLabel);
          }

          timeline.tracks.forEach((track) => {
            const actor = actorsById.get(track.actorId);
            if (!actor) {
              return;
            }
            const sample = sampleAirShowTimelineTrack(track, elapsedMs);
            const visible = elapsedMs >= track.visibleFromMs && elapsedMs <= track.visibleUntilMs;
            actor.active = visible;
            if (sample) {
              actor.position = sample.point;
              actor.headingDegrees = sample.headingDegrees;
              this.positionAircraftImageGhost(
                actor.image,
                actor.size,
                sample.point.cx,
                sample.point.cy,
                sample.headingDegrees
              );
            }
            const destructionTimeMs = destructionTimeByActorId.get(track.actorId);
            const destructionOpacity = destructionTimeMs !== undefined && elapsedMs >= destructionTimeMs
              ? this.clamp(
                  (track.visibleUntilMs - elapsedMs) / Math.max(1, track.visibleUntilMs - destructionTimeMs),
                  0,
                  1
                )
              : 1;
            actor.image.style.opacity = visible ? String(destructionOpacity) : "0";
            actor.image.setAttribute("data-airshow-active", visible ? "true" : "false");
          });

          while (nextCueIndex < timeline.cues.length && timeline.cues[nextCueIndex]!.timeMs <= elapsedMs) {
            const cue = timeline.cues[nextCueIndex]!;
            const cueCount = (cueCounts.get(cue.kind) ?? 0) + 1;
            cueCounts.set(cue.kind, cueCount);
            layer.setAttribute(`data-airshow-cue-count-${cue.kind}`, String(cueCount));
            layer.setAttribute("data-airshow-last-cue", cue.kind);
            if (cue.kind === "impact") {
              layer.setAttribute("data-airshow-impact-fired", "true");
            }
            this.playAirShowTimelineCue(cue, actorsById, callbacks);
            nextCueIndex += 1;
          }

          if (elapsedMs >= timeline.totalDurationMs) {
            resolve();
            return;
          }
          this.scheduleAnimationFrame(step);
        };
        this.scheduleAnimationFrame(step);
      });
      logAirShowPackageEnd(packageId, "success", plannedScene.flights.map((flight) => flight.id), [], true);
    } catch (error) {
      status = "error";
      runtimeError = error instanceof Error ? error.message : String(error);
      logAirShowPackageEnd(packageId, "aborted", [], plannedScene.flights.map((flight) => flight.id), false);
      throw error;
    } finally {
      completeAirShowRuntimeTrace(this.activeAirShowRuntimeTrace, status, runtimeError);
      this.activeAirShowRuntimeTrace = null;
      layer.setAttribute("data-airshow-completed", "true");
      sceneActors.forEach((actor) => actor.image.remove());
      layer.removeAttribute("data-airshow-beat");
      layer.removeAttribute("data-airshow-time-ms");
      layer.removeAttribute("data-airshow-last-cue");
      layer.removeAttribute("data-airshow-impact-fired");
    }
  }

  async animateResolvedAirCombatShow(
    scene: ResolvedAirShowScene,
    callbacks: AirShowPlaybackCallbacks = {}
  ): Promise<void> {
    const timeline = this.planResolvedAirCombatTimeline(scene);
    if (!timeline) {
      return;
    }
    await this.animateAirShowTimeline(scene, timeline, callbacks);
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
  async animateUnitMove(fromKey: string, toKey: string, durationMs = 500, options?: MoveAnimationOptions): Promise<void> {
    if (durationMs < 0) {
      durationMs = 0;
    }

    const handle = this.primeUnitMove(fromKey, toKey, options);
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
   * Prepares the SVG state for a future move animation by hiding the moving source sprite and
   * planting a ghost image on the origin hex. Call `play()` on the returned handle once the camera settles.
   */
  primeUnitMove(fromKey: string, toKey: string, options?: MoveAnimationOptions): MoveAnimationHandle | null {
    const context = this.createMoveAnimationContext(fromKey, toKey, options);
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
      this.cleanupMoveGhost(context.ghost, context.hiddenGroup, context.restoreOpacity);
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

  private createMoveAnimationContext(fromKey: string, toKey: string, options?: MoveAnimationOptions): MoveAnimationContext | null {
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

    const sourceStack = this.hexUnitImageMap.get(fromKey) ?? null;
    const destinationStack = this.hexUnitImageMap.get(toKey) ?? null;
    const movingSubject =
      this.resolveMoveAnimationSubject(sourceStack, options?.unitId)
      ?? this.resolveMoveAnimationSubject(destinationStack, options?.unitId);
    if (!movingSubject) {
      return null;
    }

    const ghost = movingSubject.cloneSource.cloneNode(true) as SVGGElement;
    ghost.classList.add("unit-move-ghost");
    ghost.querySelectorAll("image").forEach((node) => node.classList.add("unit-move-ghost"));
    ghost.style.pointerEvents = "none";
    ghost.style.transition = "";
    ghost.style.transform = "";
    this.positionUnitStack(ghost, startCenter.cx, startCenter.cy);

    let hiddenGroup = movingSubject.hiddenGroup;
    // Preserve per-move visual continuity for empty-target moves (especially bot turns):
    // stage a hidden clone at the destination so revealing it at animation end does not
    // make the formation snap back to its origin until a later full re-render.
    if (!destinationStack && sourceStack && fromKey !== toKey) {
      const movingSubjectLivesInSourceStack =
        movingSubject.hiddenGroup === sourceStack || sourceStack.contains(movingSubject.hiddenGroup);
      if (movingSubjectLivesInSourceStack) {
        if (movingSubject.hiddenGroup === sourceStack) {
          const stagedDestinationGroup = sourceStack.cloneNode(true) as SVGGElement;
          this.positionUnitStack(stagedDestinationGroup, endCenter.cx, endCenter.cy);
          toCell.appendChild(stagedDestinationGroup);
          this.hexUnitImageMap.set(toKey, stagedDestinationGroup);
          this.hexUnitImageMap.delete(fromKey);
          sourceStack.remove();
          hiddenGroup = stagedDestinationGroup;
        } else {
          const stagedDestinationGroup = document.createElementNS(SVG_NS, "g");
          stagedDestinationGroup.classList.add("unit-stack");
          stagedDestinationGroup.dataset.stackCount = "1";
          stagedDestinationGroup.dataset.reconStatus =
            movingSubject.hiddenGroup.dataset.reconStatus
            ?? sourceStack.dataset.reconStatus
            ?? "visible";
          const stagedFormation = movingSubject.hiddenGroup.cloneNode(true) as SVGGElement;
          stagedFormation.dataset.slot = "0";
          stagedDestinationGroup.appendChild(stagedFormation);
          this.positionUnitStack(stagedDestinationGroup, endCenter.cx, endCenter.cy);
          toCell.appendChild(stagedDestinationGroup);
          this.hexUnitImageMap.set(toKey, stagedDestinationGroup);
          movingSubject.hiddenGroup.style.opacity = "0";
          const remainingVisibleCount = Array.from(
            sourceStack.querySelectorAll<SVGGElement>(":scope > g.unit-stack-formation")
          ).reduce((count, formation) => (
            formation.style.opacity === "0" ? count : count + 1
          ), 0);
          if (remainingVisibleCount <= 0) {
            this.hexUnitImageMap.delete(fromKey);
            sourceStack.remove();
          } else {
            sourceStack.dataset.stackCount = String(remainingVisibleCount);
          }
          hiddenGroup = stagedDestinationGroup;
        }
      }
    }

    const restoreOpacity = hiddenGroup.style.opacity || "";
    hiddenGroup.style.opacity = "0";
    const effectsLayer = this.ensureCombatEffectsLayer();
    if (effectsLayer) {
      effectsLayer.appendChild(ghost);
    } else {
      this.svgElement.appendChild(ghost);
    }

    const pathPoints = this.resolveMovePathPoints(fromKey, toKey, options?.path);
    const finalSegment = this.resolveMovePathSample(pathPoints, 1);
    const angleDeg = finalSegment.angleDeg;
    this.applyFacingAngleToGroup(ghost, startCenter.cx, startCenter.cy, angleDeg);
    this.applyFacingAngleToGroup(hiddenGroup, endCenter.cx, endCenter.cy, angleDeg);
    if (fromKey !== toKey) {
      this.hexUnitFacingAngleMap.delete(fromKey);
    }
    this.hexUnitFacingAngleMap.set(toKey, angleDeg);
    const setGhostProgress = (progress: number): void => {
      const sample = this.resolveMovePathSample(pathPoints, progress);
      ghost.style.transform = `translate(${sample.cx - startCenter.cx}px, ${sample.cy - startCenter.cy}px)`;
      this.applyFacingAngleToGroup(ghost, startCenter.cx, startCenter.cy, sample.angleDeg);
    };

    return {
      ghost,
      hiddenGroup,
      restoreOpacity,
      setGhostProgress
    };
  }

  private resolveMoveAnimationSubject(
    stackGroup: SVGGElement | null,
    unitId?: string | null
  ): MoveAnimationSubject | null {
    if (!stackGroup) {
      return null;
    }

    const normalizedUnitId = unitId?.trim() ?? "";
    if (normalizedUnitId) {
      const matchingFormation = Array.from(
        stackGroup.querySelectorAll<SVGGElement>(":scope > g.unit-stack-formation")
      ).find((formationGroup) => formationGroup.dataset.unitId === normalizedUnitId);
      if (matchingFormation) {
        return {
          cloneSource: matchingFormation,
          hiddenGroup: matchingFormation
        };
      }
    }

    return {
      cloneSource: stackGroup,
      hiddenGroup: stackGroup
    };
  }

  private resolveMovePathPoints(fromKey: string, toKey: string, path?: readonly string[]): MovePathPoint[] {
    const normalizedKeys: string[] = [];
    const appendKey = (key: string | null | undefined): void => {
      if (!key) {
        return;
      }
      if (normalizedKeys[normalizedKeys.length - 1] === key) {
        return;
      }
      normalizedKeys.push(key);
    };

    appendKey(fromKey);
    path?.forEach((key) => appendKey(key));
    appendKey(toKey);

    const points = normalizedKeys
      .map((key): MovePathPoint | null => {
        const cell = this.hexElementMap.get(key);
        const center = cell ? this.extractHexCenter(cell) : null;
        return center ? { key, cx: center.cx, cy: center.cy } : null;
      })
      .filter((point): point is MovePathPoint => point !== null);

    const startCell = this.hexElementMap.get(fromKey);
    const endCell = this.hexElementMap.get(toKey);
    const startCenter = startCell ? this.extractHexCenter(startCell) : null;
    const endCenter = endCell ? this.extractHexCenter(endCell) : null;

    if (startCenter && points[0]?.key !== fromKey) {
      points.unshift({ key: fromKey, cx: startCenter.cx, cy: startCenter.cy });
    }
    if (endCenter && points[points.length - 1]?.key !== toKey) {
      points.push({ key: toKey, cx: endCenter.cx, cy: endCenter.cy });
    }

    return points.length >= 2 ? points : [
      { key: fromKey, cx: startCenter?.cx ?? 0, cy: startCenter?.cy ?? 0 },
      { key: toKey, cx: endCenter?.cx ?? startCenter?.cx ?? 0, cy: endCenter?.cy ?? startCenter?.cy ?? 0 }
    ];
  }

  private resolveMovePathSample(
    points: readonly MovePathPoint[],
    progress: number
  ): { cx: number; cy: number; angleDeg: number } {
    const fallback = points[0] ?? { key: "", cx: 0, cy: 0 };
    if (points.length <= 1) {
      return { cx: fallback.cx, cy: fallback.cy, angleDeg: 0 };
    }

    const segmentLengths: number[] = [];
    let totalDistance = 0;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const current = points[index]!;
      const length = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
      segmentLengths.push(length);
      totalDistance += length;
    }

    if (totalDistance <= 0) {
      return { cx: fallback.cx, cy: fallback.cy, angleDeg: 0 };
    }

    const targetDistance = this.clamp(progress, 0, 1) * totalDistance;
    let traversed = 0;
    for (let index = 0; index < segmentLengths.length; index += 1) {
      const length = segmentLengths[index]!;
      const start = points[index]!;
      const end = points[index + 1]!;
      const isFinalSegment = index === segmentLengths.length - 1;
      if (targetDistance <= traversed + length || isFinalSegment) {
        const localProgress = length <= 0 ? 1 : this.clamp((targetDistance - traversed) / length, 0, 1);
        const cx = start.cx + (end.cx - start.cx) * localProgress;
        const cy = start.cy + (end.cy - start.cy) * localProgress;
        const angleDeg = this.resolveAngleDegFromVector(end.cx - start.cx, end.cy - start.cy);
        return { cx, cy, angleDeg };
      }
      traversed += length;
    }

    const penultimate = points[points.length - 2]!;
    const last = points[points.length - 1]!;
    return {
      cx: last.cx,
      cy: last.cy,
      angleDeg: this.resolveAngleDegFromVector(last.cx - penultimate.cx, last.cy - penultimate.cy)
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
    options?: { color?: string; radius?: number; arcHeight?: number; targetOffsetX?: number; targetOffsetY?: number }
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

    const endCx = b.cx + (options?.targetOffsetX ?? 0);
    const endCy = b.cy + (options?.targetOffsetY ?? 0);
    const dx = endCx - a.cx;
    const dy = endCy - a.cy;
    const dist = Math.hypot(dx, dy) || 1;

    const arcHeight = options?.arcHeight ?? this.clamp(dist * 0.35, 18, 64);
    let nx = -dy / dist;
    let ny = dx / dist;
    // SVG +y points down-screen. If the perpendicular normal points downward,
    // flip it so lobbed shells always crest up-and-over instead of down-and-under.
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const ctrlX = (a.cx + endCx) / 2 + nx * arcHeight;
    const ctrlY = (a.cy + endCy) / 2 + ny * arcHeight;

    const color = options?.color ?? "#ffcf5a";
    const radius = options?.radius ?? 3;

    const trail = document.createElementNS(SVG_NS, "path");
    trail.setAttribute("fill", "none");
    trail.setAttribute("stroke", color);
    trail.setAttribute("stroke-width", String(Math.max(1.1, radius * 0.72)));
    trail.setAttribute("stroke-linecap", "round");
    trail.setAttribute("vector-effect", "non-scaling-stroke");
    trail.style.opacity = "0";
    trail.style.pointerEvents = "none";
    layer.appendChild(trail);

    const glow = document.createElementNS(SVG_NS, "circle");
    glow.setAttribute("r", String(radius * 2.4));
    glow.setAttribute("fill", color);
    glow.style.opacity = "0.18";
    glow.style.pointerEvents = "none";
    layer.appendChild(glow);

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
        const x = omt * omt * a.cx + 2 * omt * eased * ctrlX + eased * eased * endCx;
        const y = omt * omt * a.cy + 2 * omt * eased * ctrlY + eased * eased * endCy;
        const trailT = this.clamp(eased - 0.1, 0, 1);
        const trailOmt = 1 - trailT;
        const trailX = trailOmt * trailOmt * a.cx + 2 * trailOmt * trailT * ctrlX + trailT * trailT * endCx;
        const trailY = trailOmt * trailOmt * a.cy + 2 * trailOmt * trailT * ctrlY + trailT * trailT * endCy;
        shell.setAttribute("cx", String(x));
        shell.setAttribute("cy", String(y));
        glow.setAttribute("cx", String(x));
        glow.setAttribute("cy", String(y));
        trail.setAttribute("d", `M ${trailX} ${trailY} L ${x} ${y}`);
        trail.style.opacity = String(0.22 * (1 - t * 0.45));
        glow.style.opacity = String(0.18 * (1 - t * 0.35));

        if (t >= 1) {
          trail.remove();
          glow.remove();
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
    const realAxialKeys = new Set<string>();
    let resolvedTileCount = 0;
    let unresolvedTileCount = 0;
    data.tiles.forEach((rowTiles, rowIndex) => {
      rowTiles.forEach((entry, columnIndex) => {
        const tile = CoordinateSystem.resolveTile(entry, data.tilePalette);
        if (!tile) {
          unresolvedTileCount++;
          if (unresolvedTileCount <= 5) {
            console.warn(`[HexMapRenderer] Failed to resolve tile at [${rowIndex}][${columnIndex}]`, { entry, paletteKeys: Object.keys(data.tilePalette).slice(0, 10) });
          }
          return;
        }
        resolvedTileCount++;

        const { q, r } = CoordinateSystem.offsetToAxial(columnIndex, rowIndex);
        const { x, y } = CoordinateSystem.axialToPixel(q, r);

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        realAxialKeys.add(`${q},${r}`);
        const reconStatus = this.normalizeReconStatus(tile.recon);
        const hexKey = CoordinateSystem.makeHexKey(columnIndex, rowIndex);
        this.trackHexReconStatus(hexKey, reconStatus);
        hexes.push({ tile, x, y, col: columnIndex, row: rowIndex, recon: reconStatus });
      });
    });

    console.info(`[HexMapRenderer] Tile resolution: ${resolvedTileCount} resolved, ${unresolvedTileCount} unresolved, ${hexes.length} hexes to render`);
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

    // Generate SVG markup for all hexes, preceded by fringe ghost hexes that soften the map boundary.
    const fringeMarkup = this.buildFringeHexMarkup(realAxialKeys, hexes, minX, minY, margin);
    const hexMarkup = fringeMarkup + hexes.map((hex) => this.renderHex(hex, minX, minY, margin, data)).join("");

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

    // Render campaign map backdrop if available. The image sits at root SVG level, outside
    // viewportRoot, so it doesn't move with pan/zoom transforms.
    this.updateBackdropImage(svg, mapWidth, mapHeight);

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
    if (this.spriteSheetAnimator
      && previousCombatEffectsLayer
      && this.combatEffectsLayer
      && previousCombatEffectsLayer !== this.combatEffectsLayer) {
      this.spriteSheetAnimator.stopAll();
      this.spriteSheetAnimator = null;
    }

    // Initialize combat animator with the SVG combat effects layer for procedural effects.
    if (this.combatEffectsLayer && !this.combatAnimator) {
      this.combatAnimator = new ProceduralEffectsAnimator(this.combatEffectsLayer, this.soundManager);
      console.log("[HexMapRenderer] Combat animator initialized with SVG effects layer and sound manager");

      // Production injects its bundled catalogs. Isolated renderers remain deterministic
      // and silent instead of starting asset fetches behind the caller's back.
      if (this.assetSources && !HexMapRenderer.effectSpecsLoaded) {
        HexMapRenderer.effectSpecsLoaded = true;
        Promise.all([
          loadEffectSpecifications(this.assetSources.effects),
          loadTerrainTints(this.assetSources.terrainTints)
        ]).catch((error) => {
          console.error("[HexMapRenderer] Failed to load effect specifications or terrain tints:", error);
        });
      }

      if (this.assetSources && !this.soundCatalogReady) {
        this.soundCatalogReady = this.soundManager.loadSoundCatalog(this.assetSources.sounds).catch((error) => {
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

  private ensureSmokeScreenLayer(): SVGGElement | null {
    const viewportRoot = this.viewportRoot || this.svgElement?.querySelector<SVGGElement>("#viewportRoot");
    if (!viewportRoot) {
      return null;
    }
    let layer = this.smokeScreenLayer;
    if (!layer || !layer.isConnected) {
      layer = viewportRoot.querySelector<SVGGElement>(".smoke-screen-layer");
    }
    if (!layer) {
      layer = document.createElementNS(SVG_NS, "g");
      layer.classList.add("smoke-screen-layer");
      layer.style.pointerEvents = "none";
      // Insert before combat-effects-layer so effects still render on top.
      const effectsLayer = viewportRoot.querySelector(".combat-effects-layer");
      if (effectsLayer) {
        viewportRoot.insertBefore(layer, effectsLayer);
      } else {
        viewportRoot.appendChild(layer);
      }
    } else if (layer.parentNode !== viewportRoot) {
      const effectsLayer = viewportRoot.querySelector(".combat-effects-layer");
      if (effectsLayer) {
        viewportRoot.insertBefore(layer, effectsLayer);
      } else {
        viewportRoot.appendChild(layer);
      }
    }
    this.smokeScreenLayer = layer;
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
    return Math.max(1, Math.min(4, Math.ceil(normalized / HexMapRenderer.MIN_STRENGTH_PER_STACK_ACTOR)));
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

  /**
   * Appends animated smoke puffs along the edge inside `container`.
   * Each puff lifecycle: appear small → grow → drift upward → fade out → repeat from a new
   * scatter position. Puffs are densely staggered so the cloud is always full from frame 0.
   */
  private appendSmokePuffs(container: SVGElement, edgeLength: number): void {
    const puffCount = 20;
    const halfLength = Math.min(edgeLength / 2, 28);

    // Shared keyframes injected once per document.
    // Remove legacy v1 tag if it somehow persists from an older session.
    document.getElementById("smoke-puff-keyframes")?.remove();
    const styleId = "smoke-puff-keyframes-v2";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      // smoke-rise: single lifecycle — start at r=0/opacity=0, grow to peak, then fade to 0.
      // The transform drifts the puff upward and slightly sideways as it expands.
      // At 100% opacity snaps back to 0 (instantly hidden) so the next cycle starts fresh.
      style.textContent = `
        @keyframes smoke-rise {
          0%   { r: 0;   opacity: 0;    transform: translate(0px,  0px);  }
          10%  { r: 2;   opacity: 0.55; transform: translate(0px, -1px);  }
          35%  { r: 5.5; opacity: 0.80; transform: translate(1px, -3px);  }
          60%  { r: 7;   opacity: 0.55; transform: translate(-1px,-5px);  }
          85%  { r: 8;   opacity: 0.20; transform: translate(1px, -7px);  }
          99%  { r: 8.5; opacity: 0;    transform: translate(0px, -8px);  }
          100% { r: 0;   opacity: 0;    transform: translate(0px,  0px);  }
        }
      `;
      document.head.appendChild(style);
    }

    // Deterministic seeded spread — evenly distribute along the edge with a y-scatter.
    // Two interleaved rows (positive/negative Y) create visual depth.
    // Colours alternate white / light grey to break uniformity.
    const colours = ["white", "#d8d8d8", "white", "#cccccc", "white", "#e0e0e0"];

    for (let i = 0; i < puffCount; i++) {
      const t = i / puffCount;
      // Spread X across the full edge width; stagger between two Y lanes.
      const cx = -halfLength + t * halfLength * 2 + ((i % 3) - 1) * 3;
      // Two rows: even puffs sit slightly above centre, odd slightly below; tertiary offset adds variety.
      const cy = (i % 2 === 0 ? -4 : 4) + ((i % 5) - 2) * 1.5;
      // Vary duration so puffs at different stages of growth are always visible simultaneously.
      const duration = 1.6 + (i % 7) * 0.22;
      // Stagger delays uniformly so there is always a puff at every stage of the lifecycle.
      const delay = -(i * (duration / puffCount));
      const fill = colours[i % colours.length] as string;

      const puff = document.createElementNS(SVG_NS, "circle");
      // Position at the scatter origin; the keyframe translate handles drift.
      puff.setAttribute("cx", cx.toFixed(1));
      puff.setAttribute("cy", cy.toFixed(1));
      puff.setAttribute("r", "0");
      puff.setAttribute("fill", fill);
      puff.setAttribute("stroke", "rgba(180,180,180,0.2)");
      puff.setAttribute("stroke-width", "0.4");
      // Negative delay starts each puff mid-cycle so the cloud is full from frame 0.
      puff.style.animation = `smoke-rise ${duration.toFixed(2)}s ${delay.toFixed(2)}s ease-out infinite`;
      container.appendChild(puff);
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

    const suppressionState = this.resolveRenderedSuppressionState(unit);

    // Note: suppression/sentry/entrench state is set on the main unit-stack group in renderUnitStack
    // This method only renders visual decorations

    const statusPips: RenderedStatusPip[] = [];
    if (unit.onSentry) {
      statusPips.push("sentry");
    }
    if (suppressionState !== "clear") {
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

  private resolveRenderedSuppressionState(unit: ScenarioUnit): RenderedSuppressionState {
    const suppressorCount = unit.suppressedBy?.length ?? 0;
    if (suppressorCount >= 2) {
      return unit.strength < 25 ? "broken" : "pinned";
    }
    return suppressorCount === 1 ? "suppressed" : "clear";
  }

  private renderStatusPips(
    cx: number,
    cy: number,
    statuses: ReadonlyArray<RenderedStatusPip>
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

  private renderStatusPip(x: number, y: number, status: RenderedStatusPip): SVGGElement {
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

    backdrop.setAttribute("fill", status === "broken" ? "rgba(78, 12, 15, 0.97)" : "rgba(132, 27, 27, 0.94)");
    backdrop.setAttribute("stroke", status === "broken" ? "#ffcbc6" : "#ff9e99");
    group.appendChild(backdrop);

    const cross = document.createElementNS(SVG_NS, "path");
    cross.setAttribute("d", `M ${x - 2.6} ${y - 2.6} L ${x + 2.6} ${y + 2.6} M ${x + 2.6} ${y - 2.6} L ${x - 2.6} ${y + 2.6}`);
    cross.setAttribute("fill", "none");
    cross.setAttribute("stroke", "#fff1ef");
    cross.setAttribute("stroke-width", "1.35");
    cross.setAttribute("stroke-linecap", "round");
    group.appendChild(cross);

    if (status === "broken") {
      const lowerBar = document.createElementNS(SVG_NS, "path");
      lowerBar.setAttribute("d", `M ${x - 2.8} ${y + 3.4} L ${x + 2.8} ${y + 3.4}`);
      lowerBar.setAttribute("fill", "none");
      lowerBar.setAttribute("stroke", "#fff1ef");
      lowerBar.setAttribute("stroke-width", "1.2");
      lowerBar.setAttribute("stroke-linecap", "round");
      group.appendChild(lowerBar);
    }

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

  /**
   * Clears the cached movement-derived facing angle for a hex so the next renderUnitStack call
   * re-derives the angle from the unit's authoritative facing field instead of the stale cache.
   * Call this before renderEngineUnits whenever the engine changes a unit's facing in place
   * (e.g., via setUnitFacing) without triggering a movement animation.
   */
  clearUnitFacingAngle(hexKey: string): void {
    this.hexUnitFacingAngleMap.delete(hexKey);
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
    return this.resolveHexCenterByKey(key);
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

  /**
   * Updates or removes the campaign map backdrop image. The image is positioned at the root SVG level,
   * outside viewportRoot, so it remains static during pan/zoom operations.
   *
   * The backdrop is sized to 3x the map dimensions and centered, ensuring it fills the viewport
   * even when panning to the edges of the tactical hex grid.
   */
  private updateBackdropImage(svg: SVGSVGElement, width: number, height: number): void {
    const existingImage = svg.querySelector("#backdropImage") as SVGImageElement | null;

    if (!this.backdropImageUrl) {
      // Remove existing backdrop if no URL is set
      if (existingImage) {
        existingImage.remove();
      }
      return;
    }

    // Create or update the backdrop image
    let image = existingImage;
    if (!image) {
      image = document.createElementNS(SVG_NS, "image");
      image.id = "backdropImage";
      image.setAttribute("preserveAspectRatio", "xMidYMid slice");
      // Insert before viewportRoot so it renders behind all hex content
      const viewportRoot = svg.querySelector("#viewportRoot");
      if (viewportRoot) {
        svg.insertBefore(image, viewportRoot);
      } else {
        svg.appendChild(image);
      }
    }

    // Scale backdrop to cover the pan range - 3x map size centered on the map
    // This ensures the backdrop fills the viewport even at extreme pan positions
    const coverageScale = 3;
    const backdropWidth = width * coverageScale;
    const backdropHeight = height * coverageScale;
    const offsetX = -(backdropWidth - width) / 2;
    const offsetY = -(backdropHeight - height) / 2;

    image.setAttribute("href", this.backdropImageUrl);
    image.setAttribute("x", String(offsetX));
    image.setAttribute("y", String(offsetY));
    image.setAttribute("width", String(backdropWidth));
    image.setAttribute("height", String(backdropHeight));
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

  /**
   * Applies initiative group highlighting to specified hex keys.
   * Units in the current initiative group get a distinctive highlight.
   */
  setInitiativeGroupHighlights(keys: Iterable<string>): void {
    const nextKeys = new Set<string>();
    for (const key of keys) {
      nextKeys.add(key);
      if (!this.initiativeGroupHighlightKeys.has(key)) {
        this.toggleInitiativeGroupHighlight(key, true);
      }
    }

    this.initiativeGroupHighlightKeys.forEach((key) => {
      if (!nextKeys.has(key)) {
        this.toggleInitiativeGroupHighlight(key, false);
      }
    });

    this.initiativeGroupHighlightKeys.clear();
    nextKeys.forEach((key) => this.initiativeGroupHighlightKeys.add(key));
  }

  /**
   * Clears all initiative group highlights.
   */
  clearInitiativeGroupHighlights(): void {
    this.initiativeGroupHighlightKeys.forEach((key) => this.toggleInitiativeGroupHighlight(key, false));
    this.initiativeGroupHighlightKeys.clear();
  }

  /**
   * Toggles initiative group highlight for a specific hex.
   */
  private toggleInitiativeGroupHighlight(hexKey: string, enabled: boolean): void {
    this.toggleHexHighlightClass(hexKey, INITIATIVE_GROUP_HIGHLIGHT_CLASS, enabled);
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
    group.setAttribute("pointer-events", "none");

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
    const iconSize = 46;
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
      const stackCount = this.resolveUnitStackCount(member.unit.strength);
      const normalizedFacing = this.normalizeFacing(member.unit.facing);
      // Resolve per-position sprites with directional view based on unit facing; composite units
      // (e.g. Infantry_42) return a mixed array, non-composite units return the same sprite
      // for every position (with appropriate directional suffix based on facing).
      const compositeSprites =
        reconStatus === "spotted"
          ? null
          : getCompositeSpritesForUnit(
              member.unit.type as string,
              member.faction,
              stackCount,
              reconStatus,
              normalizedFacing
            );
      if (!compositeSprites && reconStatus !== "spotted") {
        console.error(
          "[HexMapRenderer] renderUnitStack: no sprite registered for unit type+faction — unit will render blank.",
          { 
            type: member.unit.type, 
            faction: member.faction, 
            hexKey,
            unitId: member.unit.unitId,
            controlledBy: member.unit.controlledBy,
            // Debug info to help identify missing sprites
            debug: {
              hasUnitId: !!member.unit.unitId,
              hasControlledBy: !!member.unit.controlledBy,
              isScenarioUnit: !!member.unit.type,
              possibleFaction: member.unit.controlledBy === 'Player' ? 'Player' : 
                             member.unit.controlledBy === 'AI' ? 'Bot' : 'Unknown'
            }
          }
        );
      }
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
      layout.forEach((spec, posIndex) => {
        const resolvedHref =
          reconStatus === "spotted"
            ? UNKNOWN_CONTACT_SPRITE
            : (compositeSprites?.[posIndex] ?? null);
        const image = document.createElementNS(SVG_NS, "image");
        if (resolvedHref) {
          image.setAttribute("href", resolvedHref);
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
          image.style.removeProperty("filter");
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
        this.resolveFacingAngleDeg(normalizedFacing)
      );
    });

    // Calculate and set suppression/sentry state on main unit-stack group
    const primaryUnit = primaryMember.unit;
    const suppressionState = this.resolveRenderedSuppressionState(primaryUnit);
    group.dataset.suppressionState = suppressionState;
    group.dataset.sentryState = primaryUnit.onSentry ? "on" : "off";
    group.dataset.entrenchLevel = String(Math.max(0, Math.min(2, Math.round(primaryUnit.entrench ?? 0))));

    if (suppressionState === "suppressed") {
      group.classList.add("unit-stack--suppressed");
    } else if (suppressionState === "pinned" || suppressionState === "broken") {
      group.classList.add(suppressionState === "broken" ? "unit-stack--broken" : "unit-stack--pinned");
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
    // Also evict any orphaned smoke-layer group for this key.
    this.smokeScreenLayer?.querySelector(`[data-hex-key="${hexKey}"]`)?.remove();
    this.getAdjacentHexKeys(hexKey).forEach((neighborHexKey) => this.refreshHexModificationOverlay(neighborHexKey));
  }

  clearAllHexModifications(): void {
    this.hexModificationOverlayMap.forEach((overlay) => overlay.remove());
    this.hexModificationOverlayMap.clear();
    this.hexModificationStateMap.clear();
    // Clear all smoke-layer children in one pass.
    if (this.smokeScreenLayer) {
      this.smokeScreenLayer.replaceChildren();
    }
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
    overlay.setAttribute("data-hex-key", hexKey);
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

    const hasSmoke = modifications.some((modification) => modification.type === "smoke");
    if (hasSmoke) {
      // Smoke puffs extend past the hex boundary, so the overlay must live in a shared top-level
      // layer above all hex cells to avoid being occluded by adjacent hex <g> siblings.
      const smokeLayer = this.ensureSmokeScreenLayer();
      if (smokeLayer && overlay.parentNode !== smokeLayer) {
        smokeLayer.appendChild(overlay);
      }
    } else {
      const existingUnitGroup = this.hexUnitImageMap.get(hexKey);
      if (existingUnitGroup && existingUnitGroup.parentNode === cell) {
        cell.insertBefore(overlay, existingUnitGroup);
      } else if (overlay.parentNode !== cell) {
        cell.appendChild(overlay);
      }
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
      case "smoke": {
        const facing = this.normalizeHexEdgeFacing(modification.facing);
        if (!facing) {
          break;
        }
        const edge = this.resolveHexEdgeGeometry(cx, cy, facing);
        const smokeGroup = document.createElementNS(SVG_NS, "g");
        // Position at the edge midpoint, slightly outward so puffs straddle the edge line.
        smokeGroup.setAttribute(
          "transform",
          `translate(${edge.mid.x} ${edge.mid.y}) rotate(${edge.angleDeg})`
        );
        this.appendSmokePuffs(smokeGroup, edge.length);
        group.appendChild(smokeGroup);
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
   * Builds SVG markup for fringe (ghost) hexes beyond the real map boundary.
   *
   * Two concentric rings of inert, non-interactive hexes are rendered beneath the real tile
   * grid to fill the dark empty space with terrain-blended colour. Each fringe hex inherits
   * its fill from the nearest real neighbour so the border dissolves naturally into the
   * surrounding darkness rather than cutting off hard.
   *
   * Ring distances and opacities are intentionally low so the effect reads as ambient
   * atmosphere rather than gameplay-relevant terrain.
   *
   * @param realAxialKeys - Set of "q,r" keys for every tile that actually exists in the map.
   * @param hexes - Processed real-tile array (used to resolve pixel position and terrain fill).
   * @param minX - Minimum raw X across all real tiles (used for cx offset calculation).
   * @param minY - Minimum raw Y across all real tiles.
   * @param margin - Canvas margin applied uniformly so fringe positions stay aligned.
   * @param data - Full scenario data for tile-palette resolution on edge tiles.
   * @returns SVG string for a `<g id="fringeLayer">` element, or empty string if no real hexes.
   */
  private buildFringeHexMarkup(
    realAxialKeys: Set<string>,
    hexes: Array<{ tile: TileDetails; x: number; y: number; col: number; row: number }>,
    minX: number,
    minY: number,
    margin: number
  ): string {
    if (hexes.length === 0) {
      return "";
    }

    // Build a lookup from axial key → terrain fill so fringe hexes can sample their nearest neighbour.
    const fillByAxialKey = new Map<string, string>();
    for (const hex of hexes) {
      const { q, r } = CoordinateSystem.offsetToAxial(hex.col, hex.row);
      const key = `${q},${r}`;
      const fill = this.terrainRenderer.getTerrainFill(hex.tile.terrain, hex.tile.terrainType);
      fillByAxialKey.set(key, fill);
    }

    // Five rings fade the boundary smoothly from near-full terrain colour to invisible.
    // Opacities follow an exponential decay: ring 0 (innermost) is most visible, ring 4 nearly gone.
    const FRINGE_RINGS = 5;
    const RING_OPACITY = [0.55, 0.38, 0.22, 0.10, 0.04];

    // Collect fringe hexes ring by ring. allFringeKeys tracks every hex already assigned to any
    // ring so the inner-loop claim check stays O(1) regardless of ring count.
    const fringeGroups: Array<{ q: number; r: number; fill: string; opacity: number }[]> = [];
    const allFringeKeys = new Set<string>();
    // The frontier expands one shell at a time; start from the real map boundary.
    let frontierKeys = new Set(realAxialKeys);

    for (let ring = 0; ring < FRINGE_RINGS; ring++) {
      const ringCandidates = new Map<string, { q: number; r: number }>();

      // Expand every frontier hex outward; collect neighbours not already placed.
      for (const key of frontierKeys) {
        const [qStr, rStr] = key.split(",");
        const q = Number(qStr);
        const r = Number(rStr);
        for (const dir of axialDirections) {
          const nq = q + dir.q;
          const nr = r + dir.r;
          const nkey = `${nq},${nr}`;
          if (!realAxialKeys.has(nkey) && !allFringeKeys.has(nkey) && !ringCandidates.has(nkey)) {
            ringCandidates.set(nkey, { q: nq, r: nr });
          }
        }
      }

      const opacity = RING_OPACITY[ring] ?? 0;
      const ringEntries: { q: number; r: number; fill: string; opacity: number }[] = [];

      for (const { q, r } of ringCandidates.values()) {
        // Sample fill from the closest real neighbour found within a search radius equal to
        // (ring + 1) steps so outer rings can still reach a real tile for colour sampling.
        let fill: string | null = null;
        const searchRadius = ring + 2;
        outerSearch: for (let dist = 1; dist <= searchRadius; dist++) {
          for (const dir of axialDirections) {
            const sq = q + dir.q * dist;
            const sr = r + dir.r * dist;
            const candidate = fillByAxialKey.get(`${sq},${sr}`);
            if (candidate) {
              fill = candidate;
              break outerSearch;
            }
          }
        }
        if (fill === null) {
          continue;
        }
        ringEntries.push({ q, r, fill, opacity });
        allFringeKeys.add(`${q},${r}`);
      }

      fringeGroups.push(ringEntries);
      // The next ring expands from the candidates we just placed, not the whole history.
      frontierKeys = new Set(ringCandidates.keys());
    }

    // Emit SVG polygons for every fringe hex. No clip-paths, no interaction attributes, no data-hex.
    const polygons: string[] = [];
    for (const ring of fringeGroups) {
      for (const { q, r, fill, opacity } of ring) {
        const { x, y } = CoordinateSystem.axialToPixel(q, r);
        const cx = x - minX + margin;
        const cy = y - minY + margin;
        const points = CoordinateSystem.hexPoints(cx, cy);
        polygons.push(
          `<polygon points="${points}" fill="${fill}" fill-opacity="${opacity}" stroke="none" style="pointer-events:none;" />`
        );
      }
    }

    if (polygons.length === 0) {
      return "";
    }

    return `<g id="fringeLayer" aria-hidden="true" style="pointer-events:none;">${polygons.join("")}</g>`;
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
    let sprite = this.terrainRenderer.getTerrainSprite(tile, col, row);
    // Beach water-edge detection: rotate Terrain_Beach_Water.png to face the nearest sea neighbour.
    // Rotation degrees are clockwise from the art's native NW-water orientation.
    const BEACH_WATER_ROTATION_DEG = [120, 60, 0, 300, 240, 180] as const;
    let beachWaterRotationDeg: number | null = null;
    if (tile.terrain.toLowerCase() === "beach") {
      const currentAxial = CoordinateSystem.offsetToAxial(col, row);
      for (let dirIdx = 0; dirIdx < axialDirections.length; dirIdx += 1) {
        const dir = axialDirections[dirIdx];
        const nq = currentAxial.q + dir.q;
        const nr = currentAxial.r + dir.r;
        const { col: nCol, row: nRow } = CoordinateSystem.axialToOffset(nq, nr);
        if (nRow >= 0 && nRow < data.tiles.length && nCol >= 0 && nCol < data.tiles[nRow].length) {
          const neighborTile = CoordinateSystem.resolveTile(data.tiles[nRow][nCol], data.tilePalette);
          if (neighborTile && neighborTile.terrain.toLowerCase() === "sea") {
            sprite = this.terrainRenderer.getBeachWaterSprite();
            beachWaterRotationDeg = BEACH_WATER_ROTATION_DEG[dirIdx];
            break;
          }
        }
      }
    }

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
    const riverOverlay = this.riverRenderer.drawRiverOverlay(
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
        ${sprite ? `<image href="${sprite}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" class="terrain-sprite"${beachWaterRotationDeg !== null ? ` transform="rotate(${beachWaterRotationDeg},${cx},${cy})"` : ""} />` : ""}
        <polygon class="hex-tile" points="${points}" fill="${fill}" fill-opacity="${sprite ? (tile.terrain.toLowerCase() === "sea" || beachWaterRotationDeg !== null ? 0.08 : 0.35) : 1}" stroke="${HEX_DEFAULT_STROKE}" stroke-width="${HEX_DEFAULT_STROKE_WIDTH}"></polygon>
        ${roadOverlay}
        ${riverOverlay}
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
    const layout = this.resolveAircraftSpriteLayoutSpecs(iconSize, strength, role);
    return layout.map((spec) => {
      const image = this.createMoveGhost(spriteHref, spec.size, spec.size);
      image.classList.add("aircraft-show-sprite", `aircraft-show-sprite-${spec.formationIndex}`);
      return {
        image,
        size: spec.size,
        biasX: spec.biasX,
        biasY: spec.biasY,
        formationIndex: spec.formationIndex
      };
    });
  }

  private resolveAircraftSpriteLayoutSpecs(
    iconSize: number,
    strength?: number,
    role: AirShowRole = "interceptor"
  ): Array<{ size: number; biasX: number; biasY: number; formationIndex: number }> {
    const sizeMultiplier = role === "bomber"
      ? HexMapRenderer.AIRCRAFT_BOMBER_SIZE_MULTIPLIER
      : HexMapRenderer.AIRCRAFT_FIGHTER_SIZE_MULTIPLIER;
    const scaledIconSize = iconSize * sizeMultiplier;
    const layout =
      strength === undefined || strength === null
        ? [{ ox: 0, oy: 0, scale: 1 }]
        : this.resolveAircraftFormationLayout(strength, role);
    return layout.map((spec, index) => ({
      size: scaledIconSize * spec.scale,
      biasX: spec.ox * 0.48,
      biasY: spec.oy * 0.48,
      formationIndex: index
    }));
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
    const lifetimeMs = Math.max(24, options.lifetimeMs ?? 48);
    const strokeColor = options.color ?? (options.reverse ? "#fff0b8" : "#ffbf47");
    const strokeWidth = Math.max(0.38, options.width ?? (options.reverse ? 0.42 : 0.5));
    const visibleLengthPx = this.clamp(
      options.visibleLengthPx ?? Math.min(10, distance * 0.1),
      3,
      Math.min(distance, 14)
    );
    const visibleRatio = this.clamp(visibleLengthPx / distance, 0.04, 0.48);
    const wake = document.createElementNS(SVG_NS, "line");
    const glow = document.createElementNS(SVG_NS, "line");
    const tracer = document.createElementNS(SVG_NS, "line");
    const headFlare = document.createElementNS(SVG_NS, "ellipse");
    [wake, glow, tracer].forEach((line) => {
      line.setAttribute("x1", String(start.cx));
      line.setAttribute("y1", String(start.cy));
      line.setAttribute("x2", String(start.cx));
      line.setAttribute("y2", String(start.cy));
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.style.opacity = "0";
    });
    wake.setAttribute("stroke", options.reverse ? "#fff6d2" : "#ffc15a");
    wake.setAttribute("stroke-width", String(Math.max(strokeWidth * 0.9, strokeWidth + 0.08)));
    glow.setAttribute("stroke", options.reverse ? "#ffe39a" : "#ff9d1f");
    glow.setAttribute("stroke-width", String(Math.max(strokeWidth * 1.45, strokeWidth + 0.22)));
    glow.style.opacity = "0";
    tracer.setAttribute("stroke", strokeColor);
    tracer.setAttribute("stroke-width", String(strokeWidth));
    tracer.setAttribute("stroke-linecap", "butt");
    headFlare.setAttribute("fill", options.reverse ? "#fff8df" : "#fff1b8");
    headFlare.setAttribute("rx", String(Math.max(0.58, strokeWidth * 0.92)));
    headFlare.setAttribute("ry", String(Math.max(0.3, strokeWidth * 0.5)));
    headFlare.setAttribute("vector-effect", "non-scaling-stroke");
    headFlare.style.opacity = "0";

    effectsLayer.appendChild(wake);
    effectsLayer.appendChild(glow);
    effectsLayer.appendChild(tracer);
    effectsLayer.appendChild(headFlare);

    const animationStart = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - animationStart) / lifetimeMs);
      const headProgress = this.clamp(progress * 1.42, 0, 1);
      const tailProgress = this.clamp(headProgress - visibleRatio, 0, 1);
      const wakeProgress = this.clamp(headProgress - visibleRatio * 2.75, 0, 1);
      const head = {
        cx: start.cx + (end.cx - start.cx) * headProgress,
        cy: start.cy + (end.cy - start.cy) * headProgress
      };
      const tail = {
        cx: start.cx + (end.cx - start.cx) * tailProgress,
        cy: start.cy + (end.cy - start.cy) * tailProgress
      };
      const wakeTail = {
        cx: start.cx + (end.cx - start.cx) * wakeProgress,
        cy: start.cy + (end.cy - start.cy) * wakeProgress
      };
      const rise = this.clamp(progress / 0.04, 0, 1);
      const decay = progress < 0.26 ? 1 : 1 - (progress - 0.26) / 0.74;
      const opacity = rise * this.clamp(decay, 0, 1);
      [glow, tracer].forEach((line) => {
        line.setAttribute("x1", String(tail.cx));
        line.setAttribute("y1", String(tail.cy));
        line.setAttribute("x2", String(head.cx));
        line.setAttribute("y2", String(head.cy));
      });
      wake.setAttribute("x1", String(wakeTail.cx));
      wake.setAttribute("y1", String(wakeTail.cy));
      wake.setAttribute("x2", String(tail.cx));
      wake.setAttribute("y2", String(tail.cy));
      wake.style.opacity = `${0.08 * opacity}`;
      glow.style.opacity = `${0.1 * opacity}`;
      tracer.style.opacity = `${0.92 * opacity}`;
      headFlare.setAttribute("cx", String(head.cx));
      headFlare.setAttribute("cy", String(head.cy));
      headFlare.setAttribute("transform", `rotate(${Math.atan2(end.cy - start.cy, end.cx - start.cx) * 180 / Math.PI} ${head.cx} ${head.cy})`);
      headFlare.style.opacity = `${0.56 * opacity}`;
      if (progress >= 1) {
        wake.remove();
        glow.remove();
        tracer.remove();
        headFlare.remove();
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

  private resolveAirShowInitialVisualStrength(
    spec: Pick<ResolvedAirShowFlightSpec, "role" | "strengthBefore" | "strengthAfterEscortPhase" | "finalStrength">
  ): number {
    const strongestRecordedStrength = Math.max(
      0,
      spec.strengthBefore,
      spec.strengthAfterEscortPhase ?? 0,
      spec.finalStrength ?? 0
    );
    if (strongestRecordedStrength > 0) {
      return strongestRecordedStrength;
    }

    // Tutorial/live playback can receive a bomber after combat state has already
    // dropped to zero. Keep a visual seed so the planned destruction can play.
    return spec.role === "bomber" ? HexMapRenderer.MIN_STRENGTH_PER_STACK_ACTOR : 0;
  }

  private resolveScenarioViewportPointForOffsetCoordinate(col: number, row: number): AirShowPoint | null {
    const data = this.scenarioData;
    if (!data) {
      return null;
    }
    const margin = HEX_RADIUS * 2;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let hasTile = false;

    data.tiles.forEach((rowTiles, rowIndex) => {
      rowTiles.forEach((entry, columnIndex) => {
        const tile = CoordinateSystem.resolveTile(entry, data.tilePalette);
        if (!tile) {
          return;
        }
        hasTile = true;
        const axial = CoordinateSystem.offsetToAxial(columnIndex, rowIndex);
        const pixel = CoordinateSystem.axialToPixel(axial.q, axial.r);
        minX = Math.min(minX, pixel.x);
        minY = Math.min(minY, pixel.y);
      });
    });

    if (!hasTile || !Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }

    const axial = CoordinateSystem.offsetToAxial(col, row);
    const pixel = CoordinateSystem.axialToPixel(axial.q, axial.r);
    return {
      cx: pixel.x - minX + margin,
      cy: pixel.y - minY + margin
    };
  }

  private resolveHexCenterByKey(hexKey: string | null | undefined): AirShowPoint | null {
    if (!hexKey) {
      return null;
    }
    const cell = this.hexElementMap.get(hexKey);
    if (cell) {
      return this.extractHexCenter(cell);
    }
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return null;
    }
    return this.resolveScenarioViewportPointForOffsetCoordinate(parsed.col, parsed.row);
  }

  // Airshow origins must sit outside the rendered tile envelope, not merely outside the
  // current viewBox. We push the HQ-side ray to the tile boundary and then the configured outside offset.
  private static readonly OFF_MAP_DISTANCE_PX = AIR_SHOW_OFF_MAP_DISTANCE_PX;

  private resolveAirShowMapBounds(): AirShowMapBounds | null {
    const centers = Array.from(this.hexElementMap.values())
      .map((cell) => this.extractHexCenter(cell))
      .filter((center): center is AirShowPoint => !!center);
    return buildAirShowMapBounds(centers, HEX_WIDTH, HEX_HEIGHT);
  }

  private resolveHqAxis(
    playerHqKey: string | null | undefined,
    botHqKey: string | null | undefined
  ): AirShowHqAxis | null {
    const playerHq = this.resolveHexCenterByKey(playerHqKey);
    const botHq = this.resolveHexCenterByKey(botHqKey);
    const mapBounds = this.resolveAirShowMapBounds();
    return resolveAirShowHqAxis(
      playerHq,
      botHq,
      mapBounds,
      HexMapRenderer.OFF_MAP_DISTANCE_PX
    );
  }

  private buildAirShowPlannedFlight(
    spec: ResolvedAirShowFlightSpec,
    fallbackOrigin: AirShowPoint,
    defaultHeadingDegrees: number
  ): AirShowPlannerFlight | null {
    const origin = this.resolveHexCenterByKey(spec.originHexKey) ?? fallbackOrigin;
    const visualStrength = this.resolveAirShowInitialVisualStrength(spec);
    const actorLayouts = this.resolveAircraftSpriteLayoutSpecs(
      HexMapRenderer.AIRCRAFT_GHOST_ICON_SIZE,
      visualStrength,
      spec.role
    );
    if (actorLayouts.length === 0) {
      return null;
    }

    const visibleCount = this.resolveAirShowVisibleActorCount(visualStrength);
    const formationMid = actorLayouts.length <= 1 ? 0 : (actorLayouts.length - 1) / 2;
    const actors: AirShowPlannerActor[] = actorLayouts.map((layout, index) => {
      const position = {
        cx: origin.cx + layout.biasX,
        cy: origin.cy + layout.biasY
      };
      const headingDegrees =
        defaultHeadingDegrees +
        (layout.formationIndex - formationMid) * (spec.role === "bomber" ? 5 : 8);
      return {
        id: `${spec.id}:${index}`,
        flightId: spec.id,
        role: spec.role,
        position,
        size: layout.size,
        formationIndex: layout.formationIndex,
        headingDegrees,
        biasX: layout.biasX,
        biasY: layout.biasY,
        active: index < visibleCount
      };
    });

    return {
      spec,
      actors,
      currentStrength: visualStrength,
      anchor: this.averageAirShowPosition(actors) ?? origin
    };
  }

  private buildAirShowRuntimeFlightFromPlan(
    layer: SVGGElement,
    flight: PlannedAirShowFlight
  ): AirShowRuntimeFlightInternal | null {
    const spriteHref = getSpriteForScenarioType(flight.scenarioType, flight.faction);
    if (!spriteHref) {
      console.error("[HexMapRenderer] Missing airshow sprite mapping", {
        flightId: flight.id,
        scenarioType: flight.scenarioType,
        faction: flight.faction,
        role: flight.role,
        combatRole: flight.combatRole
      });
      this.recordAirShowRuntimeTrace({
        kind: "runtime-flight-build-skipped",
        flightId: flight.id,
        role: flight.role,
        combatRole: flight.combatRole ?? flight.role,
        faction: flight.faction ?? "",
        scenarioType: flight.scenarioType,
        actorIds: flight.actors.map((actor) => actor.actorId),
        reason: "missing-sprite-mapping"
      });
      return null;
    }

    const actors: AirShowRuntimeActor[] = flight.actors.map((plannedActor) => {
      const image = this.createMoveGhost(spriteHref, plannedActor.size, plannedActor.size);
      layer.appendChild(image);
      image.setAttribute("data-testid", "airshow-actor");
      image.setAttribute("data-airshow-role", flight.role);
      image.setAttribute("data-airshow-flight-id", flight.id);
      image.setAttribute("data-airshow-actor-id", plannedActor.actorId);
      image.setAttribute("data-airshow-combat-role", flight.combatRole ?? flight.role);
      image.setAttribute("data-airshow-faction", flight.faction ?? "");
      this.positionAircraftImageGhost(
        image,
        plannedActor.size,
        plannedActor.position.cx,
        plannedActor.position.cy,
        plannedActor.headingDegrees
      );
      image.style.opacity = plannedActor.active ? "1" : "0";
      image.setAttribute("data-airshow-active", plannedActor.active ? "true" : "false");
      return {
        id: plannedActor.actorId,
        flightId: plannedActor.flightId,
        role: plannedActor.role,
        image,
        size: plannedActor.size,
        formationIndex: plannedActor.formationIndex,
        headingDegrees: plannedActor.headingDegrees,
        position: {
          cx: plannedActor.position.cx,
          cy: plannedActor.position.cy
        },
        biasX: plannedActor.biasX,
        biasY: plannedActor.biasY,
        active: plannedActor.active
      };
    });

    const visualStrength = this.resolveAirShowInitialVisualStrength(flight);

    return {
      spec: {
        id: flight.id,
        scenarioType: flight.scenarioType,
        faction: flight.faction,
        originHexKey: flight.originHexKey,
        strengthBefore: flight.strengthBefore,
        strengthAfterEscortPhase: flight.strengthAfterEscortPhase,
        finalStrength: flight.finalStrength,
        laneOffsetPx: flight.laneOffsetPx,
        role: flight.role,
        combatRole: flight.combatRole
      },
      actors,
      currentStrength: visualStrength,
      anchor: this.averageAirShowPosition(actors) ?? (flight.actors[0]?.position ?? { cx: 0, cy: 0 })
    };
  }

  private snapshotAirShowRuntimeActorState(actor: AirShowRuntimeActor): AirShowRuntimeTraceActorState {
    return {
      actorId: actor.id,
      flightId: actor.flightId,
      role: actor.role,
      active: actor.active,
      headingDegrees: actor.headingDegrees,
      cx: actor.position.cx,
      cy: actor.position.cy,
      opacity: actor.image.style.opacity || null,
      dataAirshowActive: actor.image.getAttribute("data-airshow-active")
    };
  }

  private recordAirShowRuntimeTrace(event: AirShowRuntimeTraceEvent): void {
    recordAirShowRuntimeTraceEvent(this.activeAirShowRuntimeTrace, event);
  }

  private resolveAirShowPhaseVisibleActorIds(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    visibleActorIds?: ReadonlyArray<string>
  ): string[] {
    const explicitVisibleActorIds = (visibleActorIds ?? []).filter((actorId) => actorId.length > 0);
    const assignmentActorIds = assignments
      .map((assignment) => assignment.actor.id)
      .filter((actorId) => actorId.length > 0);

    return Array.from(
      new Set([
        ...(explicitVisibleActorIds.length > 0 ? explicitVisibleActorIds : []),
        ...assignmentActorIds
      ])
    );
  }

  private buildAirShowRuntimeFlight(
    layer: SVGGElement,
    spec: ResolvedAirShowFlightSpec,
    fallbackOrigin: AirShowPoint,
    defaultHeadingDegrees: number
  ): AirShowRuntimeFlightInternal | null {
    const plannedFlight = this.buildAirShowPlannedFlight(spec, fallbackOrigin, defaultHeadingDegrees);
    if (!plannedFlight) {
      return null;
    }
    return this.buildAirShowRuntimeFlightFromPlan(layer, this.describePlannedAirShowFlight(plannedFlight));
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

    const MINIMUM_SPAWN_DISTANCE_PX = 500;

    if (role === "bomber") {
      const bomberDistance = MINIMUM_SPAWN_DISTANCE_PX + rand() * 22;
      return {
        cx: center.cx + sideBias * bomberDistance,
        cy: center.cy + lane * 32 + (rand() - 0.5) * 24
      };
    }

    const fighterDistance = MINIMUM_SPAWN_DISTANCE_PX + rand() * 20;
    const xBase = role === "interceptor" ? -fighterDistance : fighterDistance;
    const laneSpread = 48;
    return {
      cx: center.cx + xBase + sideBias * lane * 28 + (rand() - 0.5) * 30,
      cy: center.cy + lane * laneSpread + (rand() - 0.5) * 24
    };
  }

  private resolveAirShowSceneCorridorAnchor(
    corridor: AirShowCorridor,
    role: "interceptor" | "escort" | "bomber",
    index: number,
    total: number,
    alongSign: number
  ): AirShowPoint {
    const lane = total <= 1 ? 0 : index - (total - 1) / 2;
    const safeAlongSign = alongSign >= 0 ? 1 : -1;
    const mapBounds = this.resolveAirShowMapBounds();
    const direction = {
      x: corridor.axis.x * safeAlongSign,
      y: corridor.axis.y * safeAlongSign
    };
    const boundary = mapBounds
      ? resolveAirShowBoundsRayIntersection(corridor.center, direction, mapBounds)
      : null;
    const origin = boundary
      ? {
          cx: boundary.cx + direction.x * HexMapRenderer.OFF_MAP_DISTANCE_PX,
          cy: boundary.cy + direction.y * HexMapRenderer.OFF_MAP_DISTANCE_PX
        }
      : this.projectAirShowCorridorPoint(corridor, safeAlongSign * HexMapRenderer.OFF_MAP_DISTANCE_PX);
    const lateralStepPx =
      role === "interceptor"
        ? 72
        : role === "escort"
          ? 64
          : 58;
    return this.offsetAirShowPoint(
      origin,
      corridor.normal.x * lane * lateralStepPx,
      corridor.normal.y * lane * lateralStepPx
    );
  }

  private resolveAirShowViewportSafeSpawnAnchor(
    corridor: AirShowCorridor,
    flight: AirShowRuntimeFlightInternal,
    anchor: AirShowPoint
  ): AirShowPoint {
    const visibleBounds = this.resolveAirShowVisibleBounds();
    if (!visibleBounds) {
      return anchor;
    }

    const direction = this.normalizeAircraftVector(
      anchor.cx - corridor.center.cx,
      anchor.cy - corridor.center.cy,
      corridor.axis.x,
      corridor.axis.y
    );
    const visibleBoundary = resolveAirShowBoundsRayIntersection(corridor.center, direction, visibleBounds);
    if (!visibleBoundary) {
      return anchor;
    }

    const boundaryDistancePx =
      (visibleBoundary.cx - corridor.center.cx) * direction.x +
      (visibleBoundary.cy - corridor.center.cy) * direction.y;
    const anchorDistancePx =
      (anchor.cx - corridor.center.cx) * direction.x +
      (anchor.cy - corridor.center.cy) * direction.y;
    const actorsToValidate = flight.actors.filter((actor) => actor.active);
    let requiredDistancePx = anchorDistancePx;

    actorsToValidate.forEach((actor) => {
      const actorMarginPx = Math.max(
        flight.spec.role === "bomber" ? 34 : 52,
        actor.size * 0.5 + 12
      );
      const actorPosition = {
        cx: anchor.cx + actor.biasX,
        cy: anchor.cy + actor.biasY
      };
      const isSafelyOutsideViewport =
        actorPosition.cx <= visibleBounds.minX - actorMarginPx
        || actorPosition.cx >= visibleBounds.maxX + actorMarginPx
        || actorPosition.cy <= visibleBounds.minY - actorMarginPx
        || actorPosition.cy >= visibleBounds.maxY + actorMarginPx;
      if (isSafelyOutsideViewport) {
        return;
      }

      const actorBiasAlongPx = actor.biasX * direction.x + actor.biasY * direction.y;
      requiredDistancePx = Math.max(
        requiredDistancePx,
        boundaryDistancePx + actorMarginPx - actorBiasAlongPx
      );
    });

    if (requiredDistancePx <= anchorDistancePx + 0.5) {
      return anchor;
    }

    return {
      cx: corridor.center.cx + direction.x * requiredDistancePx,
      cy: corridor.center.cy + direction.y * requiredDistancePx
    };
  }

  private resolveAirShowViewportSafeEntryAnchor(
    flight: AirShowRuntimeFlightInternal,
    anchor: AirShowPoint,
    toward: AirShowPoint
  ): AirShowPoint {
    const visibleBounds = this.resolveAirShowVisibleBounds();
    if (!visibleBounds) {
      return anchor;
    }

    const direction = this.normalizeAircraftVector(
      anchor.cx - toward.cx,
      anchor.cy - toward.cy,
      anchor.cx - toward.cx,
      anchor.cy - toward.cy
    );
    const visibleBoundary = resolveAirShowBoundsRayIntersection(toward, direction, visibleBounds);
    if (!visibleBoundary) {
      return anchor;
    }

    const actorsToValidate = flight.actors.filter((actor) => actor.active);
    const isFlightOutsideViewport = (candidateAnchor: AirShowPoint): boolean =>
      actorsToValidate.every((actor) => {
        const actorMarginPx = Math.max(12, actor.size * 0.35);
        const actorPosition = {
          cx: candidateAnchor.cx + actor.biasX,
          cy: candidateAnchor.cy + actor.biasY
        };
        return (
          actorPosition.cx <= visibleBounds.minX - actorMarginPx
          || actorPosition.cx >= visibleBounds.maxX + actorMarginPx
          || actorPosition.cy <= visibleBounds.minY - actorMarginPx
          || actorPosition.cy >= visibleBounds.maxY + actorMarginPx
        );
      });
    if (isFlightOutsideViewport(anchor)) {
      return anchor;
    }

    const boundaryDistancePx =
      (visibleBoundary.cx - toward.cx) * direction.x +
      (visibleBoundary.cy - toward.cy) * direction.y;
    const anchorDistancePx =
      (anchor.cx - toward.cx) * direction.x +
      (anchor.cy - toward.cy) * direction.y;
    let candidateDistancePx = Math.max(anchorDistancePx, boundaryDistancePx);
    const stepPx = flight.spec.role === "bomber" ? 18 : 24;

    for (let iteration = 0; iteration < 48; iteration += 1) {
      const candidateAnchor = {
        cx: toward.cx + direction.x * candidateDistancePx,
        cy: toward.cy + direction.y * candidateDistancePx
      };
      if (isFlightOutsideViewport(candidateAnchor)) {
        return candidateAnchor;
      }
      candidateDistancePx += stepPx;
    }

    return {
      cx: toward.cx + direction.x * candidateDistancePx,
      cy: toward.cy + direction.y * candidateDistancePx
    };
  }

  private resetAirShowFlightToSceneAnchor(
    flight: AirShowRuntimeFlightInternal,
    anchor: AirShowPoint,
    headingTarget: AirShowPoint
  ): void {
    const formationMid = flight.actors.length <= 1 ? 0 : (flight.actors.length - 1) / 2;
    const baseHeadingDegrees = this.resolveAircraftHeadingDegrees(
      headingTarget.cx - anchor.cx,
      headingTarget.cy - anchor.cy,
      this.resolveAirShowFlightHeadingDegrees(flight) ?? 0
    );
    flight.actors.forEach((actor) => {
      const headingDegrees =
        baseHeadingDegrees
        + (actor.formationIndex - formationMid) * (actor.role === "bomber" ? 5 : 8);
      actor.headingDegrees = headingDegrees;
      actor.position = {
        cx: anchor.cx + actor.biasX,
        cy: anchor.cy + actor.biasY
      };
      if ("image" in actor && actor.image instanceof SVGImageElement) {
        this.positionAircraftImageGhost(
          actor.image,
          actor.size,
          actor.position.cx,
          actor.position.cy,
          headingDegrees
        );
      }
    });
    flight.anchor = this.averageAirShowPosition(flight.actors) ?? anchor;
  }

  private normalizeAirShowSceneFlightAnchors(
    corridor: AirShowCorridor,
    sceneKind: ResolvedAirShowScene["kind"] | undefined,
    interceptorFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    escortFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    bomberFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    hqAxis?: { playerOrigin: AirShowPoint; botOrigin: AirShowPoint; axis: { x: number; y: number } } | null
  ): void {
    const factionAlongSign = (flight: AirShowRuntimeFlightInternal): number | null => {
      if (!hqAxis) return null;
      return flight.spec.faction === "Bot" ? -1 : 1;
    };

    const positionFlights = (
      flights: ReadonlyArray<AirShowRuntimeFlightInternal>,
      role: "interceptor" | "escort" | "bomber",
      fallbackAlongSign: number
    ): void => {
      const orderedFlights = flights
        .map((flight, originalIndex) => ({
          flight,
          originalIndex,
          projection: this.resolveAirShowCorridorCoordinates(
            corridor,
            this.averageAirShowPosition(flight.actors) ?? flight.anchor
          )
        }))
        .sort((left, right) => {
          if (Math.abs(left.projection.lateralPx - right.projection.lateralPx) > 1) {
            return left.projection.lateralPx - right.projection.lateralPx;
          }
          return left.originalIndex - right.originalIndex;
        });

      orderedFlights.forEach((entry, orderedIndex) => {
        const laneIndex =
          orderedFlights.length <= 1
            ? 0
            : orderedIndex - (orderedFlights.length - 1) / 2;
        const resolvedFactionSign = factionAlongSign(entry.flight);
        const alongSign =
          resolvedFactionSign
          ?? (Math.abs(entry.projection.alongPx) > 24
            ? (entry.projection.alongPx >= 0 ? 1 : -1)
            : fallbackAlongSign);
        const baseAnchor = (hqAxis && resolvedFactionSign !== null)
          ? this.offsetAirShowPoint(
              resolvedFactionSign >= 0 ? hqAxis.playerOrigin : hqAxis.botOrigin,
              corridor.normal.x * laneIndex * 64,
              corridor.normal.y * laneIndex * 64
            )
          : this.resolveAirShowSceneCorridorAnchor(
              corridor,
              role,
              orderedIndex,
              orderedFlights.length,
              alongSign
            );
        const headingTarget =
          role === "bomber"
            ? this.resolveAirShowBomberIngressBandWaypoint(
                corridor,
                baseAnchor,
                sceneKind,
                laneIndex
              )
            : this.resolveAirShowEscortClashFocusPoint(
                corridor,
                role,
                0,
                laneIndex
              );
        this.resetAirShowFlightToSceneAnchor(entry.flight, baseAnchor, headingTarget);
      });
    };

    positionFlights(interceptorFlights, "interceptor", -1);
    positionFlights(escortFlights, "escort", 1);
    positionFlights(bomberFlights, "bomber", 1);
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
    const activeActorIndices = actors
      .map((actor, index) => (actor.active ? index : -1))
      .filter((index) => index >= 0);

    // Iteratively resolve collisions
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let hadCollision = false;

      for (let i = 0; i < activeActorIndices.length; i++) {
        for (let j = i + 1; j < activeActorIndices.length; j++) {
          const actorAIndex = activeActorIndices[i]!;
          const actorBIndex = activeActorIndices[j]!;
          const actorA = actors[actorAIndex]!;
          const actorB = actors[actorBIndex]!;
          const posA = positions[actorAIndex]!;
          const posB = positions[actorBIndex]!;

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

            positions[actorAIndex] = { cx: posA.cx - pushX, cy: posA.cy - pushY };
            positions[actorBIndex] = { cx: posB.cx + pushX, cy: posB.cy + pushY };
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
    target: AirShowPoint | null,
    hqAxis?: { botOrigin: AirShowPoint; playerOrigin: AirShowPoint } | null
  ): AirShowCorridor {
    const approach = hqAxis?.botOrigin ?? origin ?? { cx: center.cx - 220, cy: center.cy + 110 };
    const egress = hqAxis?.playerOrigin ?? target ?? { cx: center.cx + 220, cy: center.cy - 24 };
    const axis = this.normalizeAircraftVector(
      egress.cx - approach.cx,
      egress.cy - approach.cy,
      1,
      0
    );
    const normal = { x: -axis.y, y: axis.x };
    const merge = hqAxis
      ? {
          cx: (approach.cx + egress.cx) / 2,
          cy: (approach.cy + egress.cy) / 2
        }
      : {
          cx: center.cx - axis.x * 44,
          cy: center.cy - axis.y * 44
        };
    return {
      center,
      axis,
      normal,
      entry: {
        cx: center.cx - axis.x * 126,
        cy: center.cy - axis.y * 126
      },
      merge,
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

  private clampAirShowHqOriginToCorridorDistance(
    corridor: AirShowCorridor,
    hqOrigin: AirShowPoint,
    maxAlongPx: number,
    minAlongPx = 440
  ): AirShowPoint {
    const coords = this.resolveAirShowCorridorCoordinates(corridor, hqOrigin);
    const absAlong = Math.abs(coords.alongPx);
    const sign = Math.sign(coords.alongPx) || 1;
    const clampedAlong = this.clamp(absAlong, minAlongPx, maxAlongPx);
    if (clampedAlong === absAlong) {
      return hqOrigin;
    }
    return this.projectAirShowCorridorPoint(corridor, sign * clampedAlong, coords.lateralPx);
  }

  private resolveAirShowCorridorCoordinates(
    corridor: AirShowCorridor,
    point: AirShowPoint
  ): {
    alongPx: number;
    lateralPx: number;
  } {
    const offsetX = point.cx - corridor.center.cx;
    const offsetY = point.cy - corridor.center.cy;
    return {
      alongPx: offsetX * corridor.axis.x + offsetY * corridor.axis.y,
      lateralPx: offsetX * corridor.normal.x + offsetY * corridor.normal.y
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

  private buildAirShowIngressStagingPath(
    start: AirShowPoint,
    stagePoint: AirShowPoint,
    nextFocusPoint: AirShowPoint,
    options: {
      startHeadingDegrees?: number;
      lateralSign?: number;
      arcPx?: number;
      driftPx?: number;
    } = {}
  ): AirShowPoint[] {
    const stageDx = stagePoint.cx - start.cx;
    const stageDy = stagePoint.cy - start.cy;
    const stageDistance = Math.max(1, Math.hypot(stageDx, stageDy));
    const focusDx = nextFocusPoint.cx - stagePoint.cx;
    const focusDy = nextFocusPoint.cy - stagePoint.cy;
    const desiredForward = this.normalizeAircraftVector(focusDx, focusDy, stageDx, stageDy);
    const desiredNormal = { x: -desiredForward.y, y: desiredForward.x };
    const lateralSign = options.lateralSign ?? 1;
    const arcMagnitudePx = Math.abs(options.arcPx ?? 0);
    const driftPx = options.driftPx ?? 0;
    const clampCenter = {
      cx: (start.cx + stagePoint.cx + nextFocusPoint.cx) / 3,
      cy: (start.cy + stagePoint.cy + nextFocusPoint.cy) / 3
    };
    const bridgePoints = this.buildAirShowPhaseEntryBridge(start, stagePoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: lateralSign,
      carryForwardPx: Math.min(Math.max(34, stageDistance * 0.16), Math.max(54, stageDistance * 0.24)),
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const bridgeExitPoint = bridgePoints[bridgePoints.length - 1] ?? start;
    const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
      [start, ...bridgePoints],
      options.startHeadingDegrees
    );
    const settleDistancePx = Math.min(Math.max(46, stageDistance * 0.18), Math.max(72, stageDistance * 0.28));
    const settlePoint = this.clampPointToViewportBounds(
      {
        cx:
          stagePoint.cx -
          desiredForward.x * settleDistancePx +
          desiredNormal.x * lateralSign * Math.min(18, arcMagnitudePx * 0.16) -
          desiredForward.x * driftPx * 0.06,
        cy:
          stagePoint.cy -
          desiredForward.y * settleDistancePx +
          desiredNormal.y * lateralSign * Math.min(18, arcMagnitudePx * 0.16) -
          desiredForward.y * driftPx * 0.06
      },
      clampCenter,
      430,
      300
    );
    const commitPoint = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, settlePoint, {
      startHeadingDegrees: bridgeExitHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(28, stageDistance * 0.14), Math.max(42, stageDistance * 0.2)),
      leadLateralPx: Math.min(14, arcMagnitudePx * 0.1),
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    return this.pruneAirShowEarlyTurnWaypoints(
      this.pruneAirShowSharpTurns(
        [start, ...bridgePoints, commitPoint, settlePoint, stagePoint],
        112,
        2
      ),
      {
        maxTurnDeg: 48,
        strongTurnDeg: 96,
        maxFirstSegmentPx: 72,
        maxWaypointsToRemove: 1
      }
    );
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

  private profileAirShowPathTurns(
    path: ReadonlyArray<AirShowPoint>
  ): {
    readonly firstTurnDeg: number;
    readonly maxTurnDeg: number;
    readonly maxTurnWaypointIndex: number;
  } {
    let maxTurnDeg = 0;
    let maxTurnWaypointIndex = -1;
    for (let index = 1; index < path.length - 1; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      const next = path[index + 1];
      if (!previous || !current || !next) {
        continue;
      }
      const turnDeg = this.resolveAirShowWaypointTurnDegrees(previous, current, next);
      if (turnDeg > maxTurnDeg) {
        maxTurnDeg = turnDeg;
        maxTurnWaypointIndex = index;
      }
    }
    const firstTurnDeg =
      path.length >= 3
        ? this.resolveAirShowWaypointTurnDegrees(path[0]!, path[1]!, path[2]!)
        : 0;
    return {
      firstTurnDeg,
      maxTurnDeg,
      maxTurnWaypointIndex
    };
  }

  private pruneAirShowSharpTurns(
    path: ReadonlyArray<AirShowPoint>,
    maxTurnDeg: number,
    maxWaypointsToRemove = 2
  ): AirShowPoint[] {
    const prunedPath = [...path];
    let removedWaypoints = 0;
    while (prunedPath.length > 4 && removedWaypoints < maxWaypointsToRemove) {
      const profile = this.profileAirShowPathTurns(prunedPath);
      if (profile.maxTurnDeg <= maxTurnDeg || profile.maxTurnWaypointIndex <= 0) {
        break;
      }
      prunedPath.splice(profile.maxTurnWaypointIndex, 1);
      removedWaypoints += 1;
    }
    return prunedPath;
  }

  private pruneAirShowEntryWindowSharpTurns(
    path: ReadonlyArray<AirShowPoint>,
    maxTurnDeg: number,
    maxWaypointsToRemove = 2,
    entryWaypointCount = 3
  ): AirShowPoint[] {
    const prunedPath = [...path];
    let removedWaypoints = 0;
    while (prunedPath.length >= 4 && removedWaypoints < maxWaypointsToRemove) {
      let worstTurnDeg = maxTurnDeg;
      let worstTurnWaypointIndex = -1;
      const maxWaypointIndex = Math.min(prunedPath.length - 2, entryWaypointCount);
      for (let index = 1; index <= maxWaypointIndex; index += 1) {
        const previous = prunedPath[index - 1];
        const current = prunedPath[index];
        const next = prunedPath[index + 1];
        if (!previous || !current || !next) {
          continue;
        }
        const turnDeg = this.resolveAirShowWaypointTurnDegrees(previous, current, next);
        const directDistancePx = Math.hypot(next.cx - previous.cx, next.cy - previous.cy);
        if (turnDeg <= worstTurnDeg || directDistancePx < 12) {
          continue;
        }
        worstTurnDeg = turnDeg;
        worstTurnWaypointIndex = index;
      }
      if (worstTurnWaypointIndex <= 0) {
        break;
      }
      prunedPath.splice(worstTurnWaypointIndex, 1);
      removedWaypoints += 1;
    }
    return prunedPath;
  }

  private softenAirShowEntryWindowTurns(
    path: ReadonlyArray<AirShowPoint>,
    maxTurnDeg = 118,
    options: {
      maxWaypointsToRemove?: number;
      entryWaypointCount?: number;
      blendRangeDeg?: number;
      minBlendFactor?: number;
      maxBlendFactor?: number;
    } = {}
  ): AirShowPoint[] {
    const entryWindowPrunedPoints = this.pruneAirShowEntryWindowSharpTurns(
      path,
      maxTurnDeg,
      options.maxWaypointsToRemove ?? 2,
      options.entryWaypointCount ?? 3
    );
    const resolvedPoints =
      entryWindowPrunedPoints.length >= 2 ? [...entryWindowPrunedPoints] : [...path];
    if (resolvedPoints.length >= 3) {
      const resolvedStart = resolvedPoints[0];
      const resolvedFirst = resolvedPoints[1];
      const resolvedSecond = resolvedPoints[2];
      if (resolvedStart && resolvedFirst && resolvedSecond) {
        const resolvedFirstTurnDeg = this.resolveAirShowWaypointTurnDegrees(
          resolvedStart,
          resolvedFirst,
          resolvedSecond
        );
        if (resolvedFirstTurnDeg > maxTurnDeg) {
          const routeDx = resolvedSecond.cx - resolvedStart.cx;
          const routeDy = resolvedSecond.cy - resolvedStart.cy;
          const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
          const routeForward = this.normalizeAircraftVector(routeDx, routeDy, 0, -1);
          const firstSegmentPx = Math.hypot(
            resolvedFirst.cx - resolvedStart.cx,
            resolvedFirst.cy - resolvedStart.cy
          );
          const projectedFirstPoint = {
            cx:
              resolvedStart.cx +
              routeForward.x * Math.min(firstSegmentPx * 0.72, Math.max(18, routeDistance * 0.32)),
            cy:
              resolvedStart.cy +
              routeForward.y * Math.min(firstSegmentPx * 0.72, Math.max(18, routeDistance * 0.32))
          };
          const blendFactor = this.clamp(
            (resolvedFirstTurnDeg - maxTurnDeg) / (options.blendRangeDeg ?? 36),
            options.minBlendFactor ?? 0.4,
            options.maxBlendFactor ?? 0.75
          );
          resolvedPoints[1] = {
            cx: resolvedFirst.cx * (1 - blendFactor) + projectedFirstPoint.cx * blendFactor,
            cy: resolvedFirst.cy * (1 - blendFactor) + projectedFirstPoint.cy * blendFactor
          };
        }
      }
    }
    return resolvedPoints;
  }

  private softenAirShowExitWindowTurns(
    path: ReadonlyArray<AirShowPoint>,
    maxTurnDeg = 118,
    options: {
      maxWaypointsToRemove?: number;
      exitWaypointCount?: number;
      blendRangeDeg?: number;
      minBlendFactor?: number;
      maxBlendFactor?: number;
    } = {}
  ): AirShowPoint[] {
    if (path.length < 3) {
      return [...path];
    }
    return this.softenAirShowEntryWindowTurns(
      [...path].reverse(),
      maxTurnDeg,
      {
        maxWaypointsToRemove: options.maxWaypointsToRemove,
        entryWaypointCount: options.exitWaypointCount,
        blendRangeDeg: options.blendRangeDeg,
        minBlendFactor: options.minBlendFactor,
        maxBlendFactor: options.maxBlendFactor
      }
    ).reverse();
  }

  private sanitizeAirShowEntryPath(
    path: ReadonlyArray<AirShowPoint>,
    options: {
      maxTurnDeg?: number;
      strongTurnDeg?: number;
      maxFirstSegmentPx?: number;
      maxSharpTurnDeg?: number;
      maxWaypointsToRemove?: number;
    } = {}
  ): AirShowPoint[] {
    const earlyPruned = this.pruneAirShowEarlyTurnWaypoints(path, {
      maxTurnDeg: options.maxTurnDeg,
      strongTurnDeg: options.strongTurnDeg,
      maxFirstSegmentPx: options.maxFirstSegmentPx,
      maxWaypointsToRemove: options.maxWaypointsToRemove
    });
    const entryWindowPruned = this.pruneAirShowEntryWindowSharpTurns(
      earlyPruned,
      options.maxSharpTurnDeg ?? 124,
      options.maxWaypointsToRemove ?? 2
    );
    return this.pruneAirShowSharpTurns(
      entryWindowPruned,
      options.maxSharpTurnDeg ?? 124,
      options.maxWaypointsToRemove ?? 2
    );
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
    const candidate = {
      cx: center.cx + clampedX,
      cy: center.cy + clampedY
    };
    const visibleBounds = this.resolveAirShowVisibleBounds();
    if (!visibleBounds) {
      return candidate;
    }
    const insetPx = 18;
    return {
      cx: this.clamp(candidate.cx, visibleBounds.minX + insetPx, visibleBounds.maxX - insetPx),
      cy: this.clamp(candidate.cy, visibleBounds.minY + insetPx, visibleBounds.maxY - insetPx)
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
      cx: start.cx + fx * (length * 0.16) + nx * lateralSign * (entryLateralPx * 0.36) + fx * driftPx * 0.08,
      cy: start.cy + fy * (length * 0.16) + ny * lateralSign * (entryLateralPx * 0.36) + fy * driftPx * 0.08
    });
    const mergePoint = clampPoint({
      cx: start.cx + fx * (length * 0.3) + nx * lateralSign * mergeLateralPx + fx * driftPx * 0.2,
      cy: start.cy + fy * (length * 0.3) + ny * lateralSign * mergeLateralPx + fy * driftPx * 0.2
    });
    const attackPoint = clampPoint({
      cx: target.cx - fx * closeInPx + nx * lateralSign * attackOffsetPx,
      cy: target.cy - fy * closeInPx + ny * lateralSign * attackOffsetPx
    });
    const overshootPoint = clampPoint({
      cx:
        target.cx +
        fx * (overshootPx * 0.22 + breakForwardPx * 0.06) +
        nx * lateralSign * Math.max(attackOffsetPx * 0.6, breakLateralPx * 0.14),
      cy:
        target.cy +
        fy * (overshootPx * 0.22 + breakForwardPx * 0.06) +
        ny * lateralSign * Math.max(attackOffsetPx * 0.6, breakLateralPx * 0.14)
    });
    const exitPoint = clampPoint({
      cx: target.cx + fx * (overshootPx * 0.56 + breakForwardPx * 0.48) + nx * lateralSign * (breakLateralPx * 0.46),
      cy: target.cy + fy * (overshootPx * 0.56 + breakForwardPx * 0.48) + ny * lateralSign * (breakLateralPx * 0.46)
    });
    const leadPoint = this.buildAirShowHeadingLeadPoint(start, entryPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(24, length * 0.09), Math.max(40, length * 0.14)),
      leadLateralPx: entryLateralPx * 0.14,
      clampCenter: target
    });
    const authoredPath = [
      start,
      leadPoint,
      entryPoint,
      mergePoint,
      attackPoint,
      overshootPoint,
      exitPoint
    ];
    if (typeof options.startHeadingDegrees !== "number" || authoredPath.length < 2) {
      return authoredPath;
    }
    const firstPoint = authoredPath[1];
    if (!firstPoint) {
      return authoredPath;
    }
    const routeDx = firstPoint.cx - start.cx;
    const routeDy = firstPoint.cy - start.cy;
    const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
    const routeForward = this.normalizeAircraftVector(routeDx, routeDy, fx, fy);
    const routeNormal = { x: -routeForward.y, y: routeForward.x };
    const headingForward = this.resolveAirShowHeadingVector(options.startHeadingDegrees);
    if (this.resolveAirShowVectorAngleDegrees(headingForward, routeForward) <= 24) {
      return authoredPath;
    }
    const commitDistancePx = Math.min(Math.max(34, routeDistance * 0.16), Math.max(52, routeDistance * 0.24));
    const commitPoint = clampPoint({
      cx: start.cx + headingForward.x * commitDistancePx + routeNormal.x * lateralSign * Math.min(10, routeDistance * 0.04),
      cy: start.cy + headingForward.y * commitDistancePx + routeNormal.y * lateralSign * Math.min(10, routeDistance * 0.04)
    });
    const commitLead = this.buildAirShowHeadingLeadPoint(commitPoint, firstPoint, {
      startHeadingDegrees: this.resolveAircraftHeadingDegrees(
        commitPoint.cx - start.cx,
        commitPoint.cy - start.cy,
        options.startHeadingDegrees
      ),
      lateralSign,
      leadForwardPx: Math.min(Math.max(18, routeDistance * 0.1), Math.max(28, routeDistance * 0.14)),
      leadLateralPx: Math.max(6, entryLateralPx * 0.08),
      clampCenter: target
    });
    return this.pruneAirShowEarlyTurnWaypoints(
      [start, commitPoint, commitLead, ...authoredPath.slice(1)].filter((point, index, points) => {
        const previous = index === 0 ? null : points[index - 1];
        if (!previous) {
          return true;
        }
        return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
      }),
      {
        maxTurnDeg: 38,
        strongTurnDeg: 78,
        maxFirstSegmentPx: 58,
        maxWaypointsToRemove: 1
      }
    );
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
      cx: start.cx + fx * (length * 0.14) + nx * lateralSign * (entryLateralPx * 0.34),
      cy: start.cy + fy * (length * 0.14) + ny * lateralSign * (entryLateralPx * 0.34)
    });
    const guardPoint = clampPoint({
      cx: threat.cx - fx * guardForwardPx + nx * lateralSign * (guardLateralPx * 0.44),
      cy: threat.cy - fy * guardForwardPx + ny * lateralSign * (guardLateralPx * 0.44)
    });
    const turnInPoint = clampPoint({
      cx: threat.cx - fx * Math.max(8, guardForwardPx * 0.12) - nx * lateralSign * Math.max(12, guardLateralPx * 0.14),
      cy: threat.cy - fy * Math.max(8, guardForwardPx * 0.12) - ny * lateralSign * Math.max(12, guardLateralPx * 0.14)
    });
    const crossingPoint = clampPoint({
      cx: threat.cx + fx * Math.max(14, exitForwardPx * 0.2) - nx * lateralSign * Math.max(8, exitLateralPx * 0.16),
      cy: threat.cy + fy * Math.max(14, exitForwardPx * 0.2) - ny * lateralSign * Math.max(8, exitLateralPx * 0.16)
    });
    const exitPoint = clampPoint({
      cx: threat.cx + fx * (exitForwardPx * 0.6) - nx * lateralSign * (exitLateralPx * 0.5),
      cy: threat.cy + fy * (exitForwardPx * 0.6) - ny * lateralSign * (exitLateralPx * 0.5)
    });
    const trailPoint = clampPoint({
      cx: threat.cx + fx * (exitForwardPx * 0.68 + trailForwardPx * 0.56) - nx * lateralSign * (exitLateralPx * 0.6),
      cy: threat.cy + fy * (exitForwardPx * 0.68 + trailForwardPx * 0.56) - ny * lateralSign * (exitLateralPx * 0.6)
    });
    const leadPoint = this.buildAirShowHeadingLeadPoint(start, setupPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      lateralSign,
      leadForwardPx: Math.min(Math.max(18, length * 0.08), Math.max(30, length * 0.12)),
      leadLateralPx: entryLateralPx * 0.14,
      clampCenter: threat
    });
    const authoredPath = [
      start,
      leadPoint,
      setupPoint,
      guardPoint,
      turnInPoint,
      crossingPoint,
      exitPoint,
      trailPoint
    ];
    if (typeof options.startHeadingDegrees !== "number" || authoredPath.length < 2) {
      return authoredPath;
    }
    const firstPoint = authoredPath[1];
    if (!firstPoint) {
      return authoredPath;
    }
    const routeDx = firstPoint.cx - start.cx;
    const routeDy = firstPoint.cy - start.cy;
    const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
    const routeForward = this.normalizeAircraftVector(routeDx, routeDy, fx, fy);
    const routeNormal = { x: -routeForward.y, y: routeForward.x };
    const headingForward = this.resolveAirShowHeadingVector(options.startHeadingDegrees);
    if (this.resolveAirShowVectorAngleDegrees(headingForward, routeForward) <= 26) {
      return authoredPath;
    }
    const commitDistancePx = Math.min(Math.max(32, routeDistance * 0.14), Math.max(48, routeDistance * 0.22));
    const commitPoint = clampPoint({
      cx: start.cx + headingForward.x * commitDistancePx + routeNormal.x * lateralSign * Math.min(8, routeDistance * 0.04),
      cy: start.cy + headingForward.y * commitDistancePx + routeNormal.y * lateralSign * Math.min(8, routeDistance * 0.04)
    });
    const commitLead = this.buildAirShowHeadingLeadPoint(commitPoint, firstPoint, {
      startHeadingDegrees: this.resolveAircraftHeadingDegrees(
        commitPoint.cx - start.cx,
        commitPoint.cy - start.cy,
        options.startHeadingDegrees
      ),
      lateralSign,
      leadForwardPx: Math.min(Math.max(16, routeDistance * 0.1), Math.max(24, routeDistance * 0.14)),
      leadLateralPx: Math.max(6, entryLateralPx * 0.08),
      clampCenter: threat
    });
    return this.pruneAirShowEarlyTurnWaypoints(
      [start, commitPoint, commitLead, ...authoredPath.slice(1)].filter((point, index, points) => {
        const previous = index === 0 ? null : points[index - 1];
        if (!previous) {
          return true;
        }
        return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
      }),
      {
        maxTurnDeg: 40,
        strongTurnDeg: 80,
        maxFirstSegmentPx: 60,
        maxWaypointsToRemove: 1
      }
    );
  }

  private buildAirShowMergePassPath(
    start: AirShowPoint,
    focus: AirShowPoint,
    corridor: AirShowCorridor,
    options: {
      sideSign: number;
      laneIndex?: number;
      startHeadingDegrees?: number;
      entrySeparationPx?: number;
      crossSeparationPx?: number;
      overshootPx?: number;
    }
  ): AirShowPoint[] {
    const laneIndex = options.laneIndex ?? 0;
    const sideSign = options.sideSign >= 0 ? 1 : -1;
    const entrySeparationPx = options.entrySeparationPx ?? 124;
    const crossSeparationPx = options.crossSeparationPx ?? 16;
    const overshootPx = options.overshootPx ?? 126;
    const laneSpreadPx = laneIndex * 28;
    const currentProjection = this.resolveAirShowCorridorCoordinates(corridor, start);
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, corridor.center, 430, 300);
    const focusPoint = clampPoint(focus);
    const focusProjection = this.resolveAirShowCorridorCoordinates(corridor, focusPoint);
    const passDirection = focusProjection.alongPx >= currentProjection.alongPx ? 1 : -1;
    const pointOnCorridor = (alongPx: number, lateralPx: number): AirShowPoint =>
      clampPoint(this.projectAirShowCorridorPoint(corridor, alongPx, lateralPx));
    const routeDistancePx = Math.max(1, Math.hypot(focusPoint.cx - start.cx, focusPoint.cy - start.cy));
    const visibleBounds = this.resolveAirShowVisibleBounds();
    const visibleWidthPx =
      visibleBounds
        ? Math.max(0, visibleBounds.maxX - visibleBounds.minX)
        : Number.POSITIVE_INFINITY;
    const useTightMergeSpread = visibleWidthPx <= 1500;
    const focusAlongPx = focusProjection.alongPx;
    const focusLateralPx = focusProjection.lateralPx;
    const approachAlongPx = focusAlongPx - passDirection * Math.max(10, entrySeparationPx * 0.1);
    const compactJoinRatio = useTightMergeSpread ? 0.965 : 0.92;
    const joinAlongPx = this.clamp(
      currentProjection.alongPx + (approachAlongPx - currentProjection.alongPx) * compactJoinRatio,
      Math.min(currentProjection.alongPx, approachAlongPx),
      Math.max(currentProjection.alongPx, approachAlongPx)
    );
    const preMergeAlongPx = focusAlongPx - passDirection * (
      useTightMergeSpread
        ? Math.max(1, crossSeparationPx * 0.12)
        : Math.max(2, crossSeparationPx * 0.35)
    );
    const crossingAlongPx = focusAlongPx + passDirection * (
      useTightMergeSpread
        ? Math.max(2, crossSeparationPx * 0.08)
        : Math.max(4, crossSeparationPx * 0.12)
    );
    const extendAlongPx = focusAlongPx + passDirection * Math.max(18, overshootPx * 0.14);
    const exitAlongPx = focusAlongPx + passDirection * Math.max(36, overshootPx * 0.28);
    const joinPoint = pointOnCorridor(
      joinAlongPx,
      useTightMergeSpread
        ? focusLateralPx
        : focusLateralPx + sideSign * Math.max(8, entrySeparationPx * 0.05) + laneSpreadPx * 0.08
    );
    const preMergePoint = pointOnCorridor(
      preMergeAlongPx,
      useTightMergeSpread
        ? focusLateralPx
        : focusLateralPx + sideSign * Math.max(2, crossSeparationPx * 0.12) + laneIndex * 4
    );
    const mergePoint = pointOnCorridor(
      focusAlongPx,
      useTightMergeSpread
        ? focusLateralPx
        : focusLateralPx + laneIndex * 2
    );
    const crossingPoint = pointOnCorridor(
      crossingAlongPx,
      useTightMergeSpread
        ? focusLateralPx
        : focusLateralPx - sideSign * Math.max(2, crossSeparationPx * 0.05) + laneIndex * 3
    );
    const entryBridgePoints = this.buildAirShowPhaseEntryBridge(start, joinPoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign,
      carryForwardPx: useTightMergeSpread
        ? Math.min(Math.max(12, routeDistancePx * 0.05), Math.max(18, routeDistancePx * 0.08))
        : Math.min(Math.max(28, routeDistancePx * 0.12), Math.max(44, routeDistancePx * 0.18)),
      clampCenter: corridor.center,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? start;
    const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
      [start, ...entryBridgePoints],
      options.startHeadingDegrees
    );
    const commitPoint = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, joinPoint, {
      startHeadingDegrees: bridgeExitHeadingDegrees,
      lateralSign: sideSign,
      leadForwardPx: useTightMergeSpread
        ? Math.min(Math.max(8, routeDistancePx * 0.03), Math.max(14, routeDistancePx * 0.06))
        : Math.min(Math.max(20, routeDistancePx * 0.1), Math.max(34, routeDistancePx * 0.14)),
      leadLateralPx: Math.max(6, entrySeparationPx * 0.05),
      clampCenter: corridor.center,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    });
    const extendPoint = pointOnCorridor(
      extendAlongPx,
      focusLateralPx - sideSign * (10 + Math.abs(laneSpreadPx) * 0.05) + laneIndex * 4
    );
    const exitPoint = pointOnCorridor(
      exitAlongPx,
      focusLateralPx - sideSign * (16 + Math.abs(laneSpreadPx) * 0.08) + laneIndex * 5
    );
    const authoredPath = [
      start,
      ...entryBridgePoints,
      commitPoint,
      joinPoint,
      preMergePoint,
      mergePoint,
      crossingPoint,
      extendPoint,
      exitPoint
    ].filter((point, index, points) => {
      const previous = index === 0 ? null : points[index - 1];
      if (!previous) {
        return true;
      }
      return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });

    const smoothedPath = this.pruneAirShowTurnWaypoint(authoredPath, 1 + entryBridgePoints.length, 58);
    return this.pruneAirShowEarlyTurnWaypoints(
      this.pruneAirShowSharpTurns(smoothedPath, 96, 2),
      {
        maxTurnDeg: 52,
        strongTurnDeg: 96,
        maxFirstSegmentPx: 88,
        maxWaypointsToRemove: 2
      }
    );
  }

  private buildAirShowBomberMonotonicPath(
    start: AirShowPoint,
    end: AirShowPoint,
    options: {
      lateralSign?: number;
      corridorWidthPx?: number;
      driftPx?: number;
      earlyRatio?: number;
      midRatio?: number;
      lateRatio?: number;
      earlyLateralScale?: number;
      midLateralScale?: number;
      lateLateralScale?: number;
      finalLateralScale?: number;
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
    const corridorWidthPx = options.corridorWidthPx ?? 12;
    const driftPx = options.driftPx ?? 8;
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, clampCenter, 430, 300);
    const pointAlongRoute = (
      ratio: number,
      lateralScale: number,
      forwardDriftScale: number
    ): AirShowPoint =>
      clampPoint({
        cx:
          start.cx +
          fx * (length * ratio + driftPx * forwardDriftScale) +
          nx * lateralSign * (corridorWidthPx * lateralScale),
        cy:
          start.cy +
          fy * (length * ratio + driftPx * forwardDriftScale) +
          ny * lateralSign * (corridorWidthPx * lateralScale)
      });
    const earlyRatio = options.earlyRatio ?? (length <= 120 ? 0.34 : 0.22);
    const midRatio = options.midRatio ?? (length <= 120 ? 0.62 : 0.52);
    const lateRatio = options.lateRatio ?? (length <= 120 ? 0.86 : 0.8);
    const finalApproachBackPx = Math.min(
      Math.max(4, length * 0.06),
      Math.max(8, length * 0.1)
    );
    const finalApproach = clampPoint({
      cx:
        end.cx -
        fx * finalApproachBackPx +
        nx * lateralSign * (corridorWidthPx * (options.finalLateralScale ?? 0.02)),
      cy:
        end.cy -
        fy * finalApproachBackPx +
        ny * lateralSign * (corridorWidthPx * (options.finalLateralScale ?? 0.02))
    });
    const authoredPath =
      length <= 56
        ? [start, pointAlongRoute(0.54, 0.04, 0.04), end]
        : length <= 112
          ? [
              start,
              pointAlongRoute(earlyRatio, options.earlyLateralScale ?? 0.08, 0.08),
              pointAlongRoute(midRatio, options.midLateralScale ?? 0.04, 0.18),
              finalApproach,
              end
            ]
          : [
              start,
              pointAlongRoute(earlyRatio, options.earlyLateralScale ?? 0.12, 0.1),
              pointAlongRoute(midRatio, options.midLateralScale ?? 0.07, 0.22),
              pointAlongRoute(lateRatio, options.lateLateralScale ?? 0.03, 0.36),
              finalApproach,
              end
            ];
    const enforcedPath = this.enforceAirShowMonotonicRoutePath(authoredPath, start, end, {
      clampCenter,
      maxHorizontalPx: 430,
      maxVerticalPx: 300,
      maxLateralPx: Math.max(4, corridorWidthPx * 0.22),
      minAlongStepPx: length <= 80 ? 6 : 10
    });
    const smoothedPath = this.pruneAirShowEarlyTurnWaypoints(
      this.pruneAirShowSharpTurns(enforcedPath, 92, 1),
      {
        maxTurnDeg: 42,
        strongTurnDeg: 96,
        maxFirstSegmentPx: 68,
        maxWaypointsToRemove: 1
      }
    );
    return smoothedPath.filter((point, index, points) => {
      const previous = index === 0 ? null : points[index - 1];
      if (!previous) {
        return true;
      }
      return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
  }

  private buildAirShowBomberBreakawayPath(
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
    const routeForward = { x: dx / length, y: dy / length };
    const routeNormal = { x: -routeForward.y, y: routeForward.x };
    const lateralSign = options.lateralSign ?? 1;
    const corridorWidthPx = options.corridorWidthPx ?? 12;
    const driftPx = options.driftPx ?? 10;
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const headingForward =
      typeof options.startHeadingDegrees === "number"
        ? this.resolveAirShowHeadingVector(options.startHeadingDegrees)
        : routeForward;
    const headingDot = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
    if (headingDot >= 0.42) {
      return this.buildAirShowBomberMonotonicPath(start, end, {
        lateralSign,
        corridorWidthPx,
        driftPx,
        earlyRatio: 0.2,
        midRatio: 0.5,
        lateRatio: 0.78,
        earlyLateralScale: 0.05,
        midLateralScale: 0.03,
        lateLateralScale: 0.01,
        finalLateralScale: 0.006
      });
    }
    const turnCross = headingForward.x * routeForward.y - headingForward.y * routeForward.x;
    const turnSign =
      Math.abs(turnCross) > 0.08
        ? (turnCross >= 0 ? 1 : -1)
        : lateralSign >= 0
          ? 1
          : -1;
    const controlOutPx = this.clamp(length * 0.16, 36, 76);
    const controlInPx = this.clamp(length * 0.24, 54, 118);
    const lateralArcPx = this.clamp(length * 0.12, 26, 92);
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, clampCenter, 430, 300);
    const controlOut = clampPoint({
      cx:
        start.cx +
        headingForward.x * controlOutPx +
        routeNormal.x * turnSign * (lateralArcPx * 0.42),
      cy:
        start.cy +
        headingForward.y * controlOutPx +
        routeNormal.y * turnSign * (lateralArcPx * 0.42)
    });
    const controlIn = clampPoint({
      cx:
        end.cx -
        routeForward.x * controlInPx +
        routeNormal.x * turnSign * (lateralArcPx * 0.28),
      cy:
        end.cy -
        routeForward.y * controlInPx +
        routeNormal.y * turnSign * (lateralArcPx * 0.28)
    });
    const cubicPointAt = (progress: number): AirShowPoint => {
      const t = this.clamp(progress, 0, 1);
      const oneMinusT = 1 - t;
      const oneMinusT2 = oneMinusT * oneMinusT;
      const t2 = t * t;
      return clampPoint({
        cx:
          oneMinusT2 * oneMinusT * start.cx +
          3 * oneMinusT2 * t * controlOut.cx +
          3 * oneMinusT * t2 * controlIn.cx +
          t2 * t * end.cx,
        cy:
          oneMinusT2 * oneMinusT * start.cy +
          3 * oneMinusT2 * t * controlOut.cy +
          3 * oneMinusT * t2 * controlIn.cy +
          t2 * t * end.cy
      });
    };
    const sampleCount = headingDot < -0.18 ? 5 : 4;
    const curvedPath = [
      start,
      ...Array.from({ length: sampleCount }, (_, index) =>
        cubicPointAt((index + 1) / (sampleCount + 1))
      ),
      end
    ];
    const combinedPath = this.pruneAirShowSharpTurns(curvedPath, 96, 1);
    return this.pruneAirShowEarlyTurnWaypoints(combinedPath, {
      maxTurnDeg: 52,
      strongTurnDeg: 108,
      maxFirstSegmentPx: 72,
      maxWaypointsToRemove: 1
    }).filter((point, index, points) => {
      const previous = index === 0 ? null : points[index - 1];
      if (!previous) {
        return true;
      }
      return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
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
    return this.buildAirShowBomberMonotonicPath(start, end, {
      lateralSign: options.lateralSign,
      corridorWidthPx: options.corridorWidthPx ?? 12,
      driftPx: options.driftPx ?? 8,
      earlyRatio: 0.24,
      midRatio: 0.54,
      lateRatio: 0.82,
      earlyLateralScale: 0.08,
      midLateralScale: 0.04,
      lateLateralScale: 0.02,
      finalLateralScale: 0.01
    });
  }

  private buildAirShowBomberTargetRunPath(
    start: AirShowPoint,
    targetCenter: AirShowPoint,
    options: {
      lateralSign?: number;
      corridorWidthPx?: number;
      startHeadingDegrees?: number;
    } = {}
  ): AirShowPoint[] {
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, targetCenter, 430, 300);
    const forward =
      typeof options.startHeadingDegrees === "number"
        ? this.resolveAirShowHeadingVector(options.startHeadingDegrees)
        : this.normalizeAircraftVector(targetCenter.cx - start.cx, targetCenter.cy - start.cy, 0, -1);
    const desiredHalfSweepRad = (80 * Math.PI) / 180;
    const desiredFullSweepRad = desiredHalfSweepRad * 2;
    const chordDx = targetCenter.cx - start.cx;
    const chordDy = targetCenter.cy - start.cy;
    const chordLengthPx = Math.max(1, Math.hypot(chordDx, chordDy));
    const baseRadiusPx = (HEX_WIDTH * 3) / 2;
    const requiredRadiusPx = chordLengthPx / Math.max(0.0001, 2 * Math.sin(desiredHalfSweepRad / 2));
    const turnRadiusPx = Math.max(baseRadiusPx, requiredRadiusPx);
    const halfChordPx = chordLengthPx * 0.5;
    const perpendicularOffsetPx = Math.max(0, Math.sqrt(Math.max(0, turnRadiusPx * turnRadiusPx - halfChordPx * halfChordPx)));
    const chordUnit = { x: chordDx / chordLengthPx, y: chordDy / chordLengthPx };
    const normal = { x: -chordUnit.y, y: chordUnit.x };
    const midpoint = {
      cx: (start.cx + targetCenter.cx) * 0.5,
      cy: (start.cy + targetCenter.cy) * 0.5
    };
    const candidateCenters = [
      {
        cx: midpoint.cx + normal.x * perpendicularOffsetPx,
        cy: midpoint.cy + normal.y * perpendicularOffsetPx
      },
      {
        cx: midpoint.cx - normal.x * perpendicularOffsetPx,
        cy: midpoint.cy - normal.y * perpendicularOffsetPx
      }
    ];
    const normalizeSignedAngleRad = (radians: number): number => {
      let value = radians;
      while (value <= -Math.PI) {
        value += Math.PI * 2;
      }
      while (value > Math.PI) {
        value -= Math.PI * 2;
      }
      return value;
    };
    const rotateQuarterTurn = (
      vector: { x: number; y: number },
      sign: number
    ): { x: number; y: number } =>
      sign >= 0
        ? { x: -vector.y, y: vector.x }
        : { x: vector.y, y: -vector.x };

    const preferredTurnSign = options.lateralSign ?? 1;
    const bestArc = candidateCenters
      .map((center) => {
        const startAngle = Math.atan2(start.cy - center.cy, start.cx - center.cx);
        const midpointAngle = Math.atan2(targetCenter.cy - center.cy, targetCenter.cx - center.cx);
        const signedHalfSweepRad = normalizeSignedAngleRad(midpointAngle - startAngle);
        const turnSign = signedHalfSweepRad >= 0 ? 1 : -1;
        const radiusVectorAtStart = {
          x: start.cx - center.cx,
          y: start.cy - center.cy
        };
        const tangentStartVector = rotateQuarterTurn(radiusVectorAtStart, turnSign);
        const tangentAtStart = this.normalizeAircraftVector(
          tangentStartVector.x,
          tangentStartVector.y,
          forward.x,
          forward.y
        );
        const alignment = tangentAtStart.x * forward.x + tangentAtStart.y * forward.y;
        const halfSweepErrorRad = Math.abs(Math.abs(signedHalfSweepRad) - desiredHalfSweepRad);
        const sidePenalty = turnSign === preferredTurnSign ? 0 : 1;
        return {
          center,
          startAngle,
          turnSign,
          score: halfSweepErrorRad * 100 + sidePenalty * 10 + (1 - alignment) * 4
        };
      })
      .sort((left, right) => left.score - right.score)[0];

    if (!bestArc) {
      return [start, targetCenter];
    }

    const arcSamples = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((progress) => {
      const angle = bestArc.startAngle + bestArc.turnSign * desiredFullSweepRad * progress;
      return clampPoint({
        cx: bestArc.center.cx + Math.cos(angle) * turnRadiusPx,
        cy: bestArc.center.cy + Math.sin(angle) * turnRadiusPx
      });
    });
    return this.sanitizeAirShowEntryPath([start, ...arcSamples], {
      maxTurnDeg: 52,
      strongTurnDeg: 100,
      maxFirstSegmentPx: 72,
      maxSharpTurnDeg: 116,
      maxWaypointsToRemove: 2
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
      preferForwardContinuous?: boolean;
    } = {}
  ): AirShowPoint[] {
    if (options.preferForwardContinuous) {
      return this.buildAirShowBomberBreakawayPath(start, end, {
        lateralSign: options.lateralSign,
        corridorWidthPx: options.corridorWidthPx ?? 12,
        driftPx: options.driftPx ?? 10,
        startHeadingDegrees: options.startHeadingDegrees
      });
    }
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const routeForward = this.normalizeAircraftVector(dx, dy, 0, -1);
    const headingForward =
      typeof options.startHeadingDegrees === "number"
        ? this.resolveAirShowHeadingVector(options.startHeadingDegrees)
        : routeForward;
    const routeAlignment = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
    const needsQuickTurnHome = routeAlignment < 0.16;
    const lateralSign = options.lateralSign ?? 1;
    const clampCenter = {
      cx: (start.cx + end.cx) * 0.5,
      cy: (start.cy + end.cy) * 0.5
    };
    const entryBridgePoints = this.buildAirShowPhaseEntryBridge(start, end, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: lateralSign,
      carryForwardPx: needsQuickTurnHome
        ? Math.min(Math.max(12, length * 0.04), Math.max(28, length * 0.08))
        : Math.min(Math.max(30, length * 0.12), Math.max(48, length * 0.2)),
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
      leadForwardPx: needsQuickTurnHome
        ? Math.min(Math.max(18, length * 0.08), Math.max(30, length * 0.12))
        : Math.min(Math.max(28, length * 0.14), Math.max(42, length * 0.2)),
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

  private enforceAirShowMonotonicRoutePath(
    path: ReadonlyArray<AirShowPoint>,
    start: AirShowPoint,
    end: AirShowPoint,
    options: {
      clampCenter?: AirShowPoint;
      maxHorizontalPx?: number;
      maxVerticalPx?: number;
      maxLateralPx?: number;
      minAlongStepPx?: number;
    } = {}
  ): AirShowPoint[] {
    if (path.length <= 2) {
      return [...path];
    }
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const fx = dx / length;
    const fy = dy / length;
    const nx = -fy;
    const ny = fx;
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      options.clampCenter
        ? this.clampPointToViewportBounds(
            point,
            options.clampCenter,
            options.maxHorizontalPx ?? 430,
            options.maxVerticalPx ?? 300
          )
        : point;
    const interior = path.slice(1, -1);
    const minAlongStepPx = options.minAlongStepPx ?? 8;
    const maxLateralPx = options.maxLateralPx ?? Number.POSITIVE_INFINITY;
    const corrected: AirShowPoint[] = [start];
    let previousAlongPx = 0;
    interior.forEach((point, index) => {
      const deviationX = point.cx - start.cx;
      const deviationY = point.cy - start.cy;
      const remainingInterior = interior.length - index - 1;
      const minAllowedAlongPx = previousAlongPx + minAlongStepPx;
      const maxAllowedAlongPx = Math.max(
        minAllowedAlongPx,
        length - minAlongStepPx * (remainingInterior + 1)
      );
      const correctedAlongPx = this.clamp(
        deviationX * fx + deviationY * fy,
        minAllowedAlongPx,
        maxAllowedAlongPx
      );
      const correctedLateralPx = this.clamp(
        deviationX * nx + deviationY * ny,
        -maxLateralPx,
        maxLateralPx
      );
      const correctedPoint = clampPoint({
        cx: start.cx + fx * correctedAlongPx + nx * correctedLateralPx,
        cy: start.cy + fy * correctedAlongPx + ny * correctedLateralPx
      });
      if (
        Math.hypot(
          correctedPoint.cx - corrected[corrected.length - 1]!.cx,
          correctedPoint.cy - corrected[corrected.length - 1]!.cy
        ) >= 2
      ) {
        corrected.push(correctedPoint);
      }
      previousAlongPx = correctedAlongPx;
    });
    corrected.push(end);
    return corrected;
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
      // Trim bridge points that produce a sharp first turn AND are very short segments.
      // Always keep at least one bridge point — an empty bridge causes a direct phase entry
      // with maximum heading shock (the worst possible outcome).
      while (entryBridgePoints.length > 2) {
        const firstPoint = entryBridgePoints[0];
        const secondPoint = entryBridgePoints[1];
        if (!firstPoint || !secondPoint) {
          break;
        }
        const firstTurnDeg = this.resolveAirShowWaypointTurnDegrees(start, firstPoint, secondPoint);
        const firstSegmentPx = Math.hypot(firstPoint.cx - start.cx, firstPoint.cy - start.cy);
        if (firstTurnDeg <= 82 || firstSegmentPx >= 48) {
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
        if (exitTurnDeg <= 92 || exitSegmentPx >= 54) {
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
      const evaluatePathTurns = (path: ReadonlyArray<AirShowPoint>): {
        firstTurnDeg: number;
        maxTurnDeg: number;
        firstPointRecedes: boolean;
      } => {
        let maxTurnDeg = 0;
        for (let index = 1; index < path.length - 1; index += 1) {
          const previous = path[index - 1];
          const current = path[index];
          const next = path[index + 1];
          if (!previous || !current || !next) {
            continue;
          }
          maxTurnDeg = Math.max(
            maxTurnDeg,
            this.resolveAirShowWaypointTurnDegrees(previous, current, next)
          );
        }
        const firstPoint = path[1];
        const secondPoint = path[2];
        return {
          firstTurnDeg:
            firstPoint && secondPoint
              ? this.resolveAirShowWaypointTurnDegrees(start, firstPoint, secondPoint)
              : 0,
          maxTurnDeg,
          firstPointRecedes:
            !!firstPoint &&
            Math.hypot(firstPoint.cx - target.cx, firstPoint.cy - target.cy) >
              Math.hypot(start.cx - target.cx, start.cy - target.cy) + 8
        };
      };
      const buildMonotonicApproachPath = (): AirShowPoint[] => {
        const routeDx = target.cx - start.cx;
        const routeDy = target.cy - start.cy;
        const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
        const routeForward = this.normalizeAircraftVector(routeDx, routeDy, 0, -1);
        const routeNormal = { x: -routeForward.y, y: routeForward.x };
        const clampInline = (point: AirShowPoint): AirShowPoint =>
          this.clampPointToViewportBounds(point, corridor.center, 430, 300);
        const earlyLead = clampInline({
          cx:
            start.cx +
            routeForward.x * Math.min(Math.max(30, routeDistance * 0.22), Math.max(48, routeDistance * 0.32)) +
            routeNormal.x * lateralSign * Math.min(14, routeDistance * 0.05),
          cy:
            start.cy +
            routeForward.y * Math.min(Math.max(30, routeDistance * 0.22), Math.max(48, routeDistance * 0.32)) +
            routeNormal.y * lateralSign * Math.min(14, routeDistance * 0.05)
        });
        const settleLead = clampInline({
          cx:
            start.cx +
            routeForward.x * Math.min(Math.max(68, routeDistance * 0.56), Math.max(92, routeDistance * 0.72)) +
            routeNormal.x * lateralSign * Math.min(6, routeDistance * 0.025),
          cy:
            start.cy +
            routeForward.y * Math.min(Math.max(68, routeDistance * 0.56), Math.max(92, routeDistance * 0.72)) +
            routeNormal.y * lateralSign * Math.min(6, routeDistance * 0.025)
        });
        return [start, earlyLead, settleLead, target].filter((point, index, points) => {
          const previous = index === 0 ? null : points[index - 1];
          if (!previous) {
            return true;
          }
          return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
        });
      };
      const entryPath = [start, ...entryBridgePoints, finalLeadPoint, target];
      const smoothedEntryPath = this.pruneAirShowEarlyTurnWaypoints(entryPath, {
        maxTurnDeg: 48,
        strongTurnDeg: 104,
        maxFirstSegmentPx: 70,
        maxWaypointsToRemove: 2
      });
      let resolvedEntryPath = this.pruneAirShowTurnWaypoint(
        smoothedEntryPath,
        smoothedEntryPath.length - 2,
        56
      );
      const prependHeadingCommit = (path: ReadonlyArray<AirShowPoint>): AirShowPoint[] => {
        if (typeof options.startHeadingDegrees !== "number" || path.length < 2) {
          return [...path];
        }
        const firstPoint = path[1];
        if (!firstPoint) {
          return [...path];
        }
        const routeDx = firstPoint.cx - start.cx;
        const routeDy = firstPoint.cy - start.cy;
        const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
        const routeForward = this.normalizeAircraftVector(routeDx, routeDy, 0, -1);
        const routeNormal = { x: -routeForward.y, y: routeForward.x };
        const headingForward = this.resolveAirShowHeadingVector(options.startHeadingDegrees);
        const entryTurnDeg = this.resolveAirShowVectorAngleDegrees(headingForward, routeForward);
        if (entryTurnDeg <= 34) {
          return [...path];
        }
        const commitDistancePx = Math.min(
          Math.max(52, routeDistance * 0.22),
          Math.max(86, routeDistance * 0.34)
        );
        const commitPoint = this.clampPointToViewportBounds(
          {
            cx:
              start.cx +
              headingForward.x * commitDistancePx +
              routeNormal.x * lateralSign * Math.min(14, routeDistance * 0.05),
            cy:
              start.cy +
              headingForward.y * commitDistancePx +
              routeNormal.y * lateralSign * Math.min(14, routeDistance * 0.05)
          },
          corridor.center,
          430,
          300
        );
        if (Math.hypot(commitPoint.cx - start.cx, commitPoint.cy - start.cy) < 24) {
          return [...path];
        }
        const commitLead = this.buildAirShowHeadingLeadPoint(commitPoint, firstPoint, {
          startHeadingDegrees: this.resolveAircraftHeadingDegrees(
            commitPoint.cx - start.cx,
            commitPoint.cy - start.cy,
            options.startHeadingDegrees
          ),
          lateralSign,
          leadForwardPx: Math.min(
            Math.max(32, routeDistance * 0.14),
            Math.max(48, routeDistance * 0.2)
          ),
          leadLateralPx: 10,
          clampCenter: corridor.center,
          maxHorizontalPx: 430,
          maxVerticalPx: 300
        });
        return this.pruneAirShowEarlyTurnWaypoints(
          [start, commitPoint, commitLead, ...path.slice(1)].filter((point, index, points) => {
            const previous = index === 0 ? null : points[index - 1];
            if (!previous) {
              return true;
            }
            return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
          }),
          {
            maxTurnDeg: 42,
            strongTurnDeg: 88,
            maxFirstSegmentPx: 78,
            maxWaypointsToRemove: 1
          }
        );
      };
      const entryStats = evaluatePathTurns(resolvedEntryPath);
      if (
          entryStats.firstTurnDeg > 54 ||
          entryStats.maxTurnDeg > 112 ||
          entryStats.firstPointRecedes
        ) {
          const monotonicPath = buildMonotonicApproachPath();
          const smoothedMonotonicPath = this.pruneAirShowEarlyTurnWaypoints(monotonicPath, {
            maxTurnDeg: 50,
            strongTurnDeg: 110,
            maxFirstSegmentPx: 74,
            maxWaypointsToRemove: 1
          });
        resolvedEntryPath = this.pruneAirShowTurnWaypoint(
          smoothedMonotonicPath,
          smoothedMonotonicPath.length - 2,
          60
        );
      }
      return prependHeadingCommit(resolvedEntryPath);
    };

    if (reengage) {
      // Authored reengage pass: Approach arc → Commit pass → Break turn → Rejoin arc → Egress arc
      // No direction reversals. Control-point noise only at approach entry.
      const approachEntry = pointFromFocus(
        sideSign * Math.max(18, entrySeparationPx * 0.1),
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
      const smoothedReengage = this.pruneAirShowEarlyTurnWaypoints(
        [...approachTurn, commitPoint, breakApex, rejoinArc, egressEnd],
        {
          maxTurnDeg: 48,
          strongTurnDeg: 104,
          maxFirstSegmentPx: 76,
          maxWaypointsToRemove: 2
        }
      );
      return this.pruneAirShowSharpTurns(smoothedReengage, 116, 2);
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

    return this.pruneAirShowSharpTurns(
      [...entryTurn, mergePoint, crossingPoint, breakExit, egressPoint],
      118,
      2
    );
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

  private resolveSceneBomberSpecs(scene: ResolvedAirShowScene): ResolvedAirShowStrikeFlightSpec[] {
    return resolveResolvedAirShowBombers(scene).map((bomber) => ({
      ...bomber,
      targetHexKey: bomber.targetHexKey ?? scene.bomberTargetHexKey ?? null
    }));
  }

  private resolveAirShowBomberTargetHexKey(
    bomber: Pick<ResolvedAirShowStrikeFlightSpec, "id" | "targetHexKey">,
    scene: ResolvedAirShowScene
  ): string | null {
    return bomber.targetHexKey ?? scene.bomberTargetHexKey ?? null;
  }

  private resolveAirShowBomberTargetCenter(
    bomber: Pick<ResolvedAirShowStrikeFlightSpec, "id" | "targetHexKey">,
    scene: ResolvedAirShowScene
  ): AirShowPoint | null {
    const targetHexKey = this.resolveAirShowBomberTargetHexKey(bomber, scene);
    return targetHexKey ? this.resolveHexCenterByKey(targetHexKey) : null;
  }

  private resolveAirShowBomberFlakBursts(
    scene: ResolvedAirShowScene,
    bomberId: string
  ): ResolvedAirShowFlakBurst[] {
    const allBursts = scene.flakBursts ?? [];
    const scopedBursts = allBursts.filter((burst) => burst.bomberUnitKey === bomberId);
    if (scopedBursts.length > 0) {
      return scopedBursts;
    }
    const unscopedBursts = allBursts.filter((burst) => !burst.bomberUnitKey);
    if (unscopedBursts.length <= 0) {
      return [];
    }
    const hasAnyScopedBursts = allBursts.some((burst) => !!burst.bomberUnitKey);
    if (hasAnyScopedBursts) {
      return [];
    }
    const sceneBombers = this.resolveSceneBomberSpecs(scene);
    if (sceneBombers.length > 1 && sceneBombers[0]?.id !== bomberId) {
      return [];
    }
    return unscopedBursts;
  }

  private resolveAirShowEscortIngressMotionProfile(durationMs: number): {
    distanceBudgetPx: number;
    progressTimeline: ReadonlyArray<AirShowAssignmentProgressKeyframe>;
  } {
    const safeDurationMs = Math.max(1, durationMs);
    // Escorts maintain fighter speed (V) throughout; no ingress acceleration beat.
    const totalDistancePx = HexMapRenderer.AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * safeDurationMs;
    return {
      distanceBudgetPx: totalDistancePx,
      progressTimeline: [
        { timeMs: 0, progress: 0 },
        { timeMs: safeDurationMs, progress: 1 }
      ]
    };
  }

  private resolveAirShowDefaultEscortBeatDurationMs(scene: ResolvedAirShowScene, beat: number): number {
    return beat === 0
      ? Math.max(980, Math.round((scene.escortClashDurationMs ?? 1980) * 0.52))
      : Math.max(1040, Math.round((scene.escortClashDurationMs ?? 1980) * 0.48));
  }

  private resolveAirShowDefaultBomberIngressDurationMs(scene: ResolvedAirShowScene): number {
    return this.clamp(Math.round(scene.bomberIngressDurationMs ?? 3500), 3000, 7000);
  }

  private resolveAirShowDefaultBomberDefenseDurationMs(scene: ResolvedAirShowScene): number {
    return this.clamp(Math.max(1040, Math.round(scene.bomberPassDurationMs ?? 2360)), 1100, 5600);
  }

  private collectAirShowFlightTailHeadings(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    options: {
      role?: AirShowRuntimeActor["role"];
      sampleStartProgress?: number;
      sampleEndProgress?: number;
    } = {}
  ): Map<string, number> {
    const sampleStartProgress = this.clamp(options.sampleStartProgress ?? 0.9, 0, 1);
    const sampleEndProgress = this.clamp(options.sampleEndProgress ?? 1, 0, 1);
    const headingVectorsByFlightId = new Map<string, {
      dx: number;
      dy: number;
      count: number;
      fallbackHeadingDegrees: number;
    }>();
    assignments.forEach((assignment) => {
      if (options.role && assignment.actor.role !== options.role) {
        return;
      }
      const startSample = this.sampleAirShowAssignmentAtProgress(assignment, sampleStartProgress);
      const endSample = this.sampleAirShowAssignmentAtProgress(assignment, sampleEndProgress);
      const dx = endSample.position.cx - startSample.position.cx;
      const dy = endSample.position.cy - startSample.position.cy;
      if (Math.hypot(dx, dy) < 0.5) {
        return;
      }
      const accumulator = headingVectorsByFlightId.get(assignment.actor.flightId) ?? {
        dx: 0,
        dy: 0,
        count: 0,
        fallbackHeadingDegrees: assignment.actor.headingDegrees
      };
      accumulator.dx += dx;
      accumulator.dy += dy;
      accumulator.count += 1;
      accumulator.fallbackHeadingDegrees = assignment.actor.headingDegrees;
      headingVectorsByFlightId.set(assignment.actor.flightId, accumulator);
    });
    return new Map(
      Array.from(headingVectorsByFlightId.entries())
        .filter(([, accumulator]) => accumulator.count > 0)
        .map(([flightId, accumulator]) => [
          flightId,
          this.resolveAircraftHeadingDegrees(
            accumulator.dx,
            accumulator.dy,
            accumulator.fallbackHeadingDegrees
          )
        ] as const)
    );
  }

  private resolveAirShowBomberStandoffPoint(
    corridor: AirShowCorridor,
    targetCenter: AirShowPoint,
    laneIndex: number,
    laneOffsetPx: number
  ): AirShowPoint {
    return this.clampPointToViewportBounds(
      this.offsetAirShowPoint(
        targetCenter,
        -corridor.axis.x * HexMapRenderer.AIR_SHOW_BOMBER_STANDOFF_DISTANCE_PX + corridor.normal.x * laneOffsetPx,
        -corridor.axis.y * HexMapRenderer.AIR_SHOW_BOMBER_STANDOFF_DISTANCE_PX + corridor.normal.y * laneOffsetPx
      ),
      corridor.center,
      430,
      300
    );
  }

  private resolveAirShowBomberApproachProfiles(
    bomberFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    corridor: AirShowCorridor,
    bomberTargetCentersById: ReadonlyMap<string, AirShowPoint>,
    averageBomberTargetCenter: AirShowPoint | null,
    randomForLabel: (label: string) => () => number
  ): Map<string, AirShowBomberApproachProfile> {
    return new Map(
      bomberFlights.map((bomberFlight, index) => {
        const rand = randomForLabel(`bomber-approach:${bomberFlight.spec.id}`);
        const laneIndex = bomberFlights.length <= 1 ? 0 : index - (bomberFlights.length - 1) / 2;
        const targetCenter =
          bomberTargetCentersById.get(bomberFlight.spec.id)
          ?? averageBomberTargetCenter
          ?? corridor.strike;
        const packageTargetCenter = averageBomberTargetCenter ?? corridor.strike;
        const laneOffsetPx = laneIndex * 16 + (rand() - 0.5) * 8;
        const targetApproach = this.offsetAirShowPoint(
          targetCenter,
          -corridor.axis.x * 14 + corridor.normal.x * laneOffsetPx,
          -corridor.axis.y * 14 + corridor.normal.y * laneOffsetPx
        );
        const standoffPoint = this.resolveAirShowBomberStandoffPoint(
          corridor,
          packageTargetCenter,
          laneIndex,
          laneOffsetPx
        );
        return [bomberFlight.spec.id, { targetCenter, targetApproach, standoffPoint, laneIndex }] as const;
      })
    );
  }

  private buildContestedBomberMasterPaths(
    bomberFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    corridor: AirShowCorridor,
    approachProfilesByBomberId: ReadonlyMap<string, AirShowBomberApproachProfile>,
    randomForLabel: (label: string) => () => number
  ): Map<string, AirShowPoint[]> {
    return new Map(
      bomberFlights.map((bomberFlight) => {
        const rand = randomForLabel(`bomber-master:${bomberFlight.spec.id}`);
        const start = this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
        const standoffPoint =
          approachProfilesByBomberId.get(bomberFlight.spec.id)?.standoffPoint
          ?? corridor.strike;
        const path = this.buildAirShowBomberContinuationPath(start, standoffPoint, {
          lateralSign: this.resolveAirShowRouteSideSign(
            start,
            standoffPoint,
            this.resolveAirShowFlightHeadingDegrees(bomberFlight),
            rand() > 0.5 ? 1 : -1
          ),
          corridorWidthPx: 18 + rand() * 4,
          driftPx: 12 + rand() * 6,
          startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
        });
        return [bomberFlight.spec.id, path] as const;
      })
    );
  }

  private resolveAirShowContestedBomberPhaseDurations(
    bomberFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    corridor: AirShowCorridor,
    approachProfilesByBomberId: ReadonlyMap<string, AirShowBomberApproachProfile>,
    scene: ResolvedAirShowScene,
    randomForLabel: (label: string) => () => number,
    fighterIngressDurationMs?: number
  ): AirShowContestedBomberPhaseDurations {
    const defaultDurations: AirShowContestedBomberPhaseDurations = {
      fighterIngressDurationMs: this.clamp(
        Math.round(fighterIngressDurationMs ?? scene.fighterIngressDurationMs ?? 2520),
        1,
        13250
      ),
      escortMergeDurationMs: this.resolveAirShowDefaultEscortBeatDurationMs(scene, 0),
      escortScrambleDurationMs: this.resolveAirShowDefaultEscortBeatDurationMs(scene, 1),
      bomberIngressDurationMs: this.resolveAirShowDefaultBomberIngressDurationMs(scene),
      bomberDefenseDurationMs: this.resolveAirShowDefaultBomberDefenseDurationMs(scene)
    };
    if (bomberFlights.length === 0) {
      return defaultDurations;
    }

    const canonicalBomberPathLengthsPx = Array.from(
      this.buildContestedBomberMasterPaths(
        bomberFlights,
        corridor,
        approachProfilesByBomberId,
        randomForLabel
      ).values()
    ).map((path) => this.measureAirShowPathLength(path));
    const canonicalBomberPathLengthPx = canonicalBomberPathLengthsPx.reduce(
      (longest, pathLengthPx) => Math.max(longest, pathLengthPx),
      0
    );
    const canonicalPreTargetDurationMs = Math.max(1, Math.round(
      canonicalBomberPathLengthPx / HexMapRenderer.AIR_SHOW_BOMBER_SPEED_PX_PER_MS
    ));
    const remainingPreferredDurationMs =
      defaultDurations.escortMergeDurationMs
      + defaultDurations.escortScrambleDurationMs
      + defaultDurations.bomberIngressDurationMs
      + defaultDurations.bomberDefenseDurationMs;
    if (remainingPreferredDurationMs <= 0) {
      return defaultDurations;
    }

    // North Star: fighter clash must establish during early bomber approach.
    // Let fighter ingress consume only an early share of the bomber-governed
    // pre-target window so the clash does not slip toward the target.
    const maxFighterIngressDurationMs = Math.max(
      1,
      Math.min(3200, Math.round(canonicalPreTargetDurationMs * 0.32))
    );
    const fixedFighterIngressDurationMs = this.clamp(
      defaultDurations.fighterIngressDurationMs,
      1,
      Math.min(Math.max(1, canonicalPreTargetDurationMs - 4), maxFighterIngressDurationMs)
    );
    const scalableRemainingDurationMs = Math.max(4, canonicalPreTargetDurationMs - fixedFighterIngressDurationMs);
    const weightedEscortMergeDurationMs = Math.max(
      1,
      Math.round(defaultDurations.escortMergeDurationMs * 0.92)
    );
    const weightedEscortScrambleDurationMs = Math.max(
      1,
      Math.round(defaultDurations.escortScrambleDurationMs * 0.56)
    );
    const weightedBomberIngressDurationMs = Math.max(
      1,
      Math.round(defaultDurations.bomberIngressDurationMs * 0.22)
    );
    const weightedBomberDefenseDurationMs = Math.max(
      1,
      Math.round(defaultDurations.bomberDefenseDurationMs * 1.16)
    );
    const weightedRemainingDurationMs =
      weightedEscortMergeDurationMs
      + weightedEscortScrambleDurationMs
      + weightedBomberIngressDurationMs
      + weightedBomberDefenseDurationMs;
    const scale = scalableRemainingDurationMs / Math.max(1, weightedRemainingDurationMs);
    const scaledDurations: AirShowContestedBomberPhaseDurations = {
      fighterIngressDurationMs: fixedFighterIngressDurationMs,
      escortMergeDurationMs: Math.max(1, Math.round(weightedEscortMergeDurationMs * scale)),
      escortScrambleDurationMs: Math.max(1, Math.round(weightedEscortScrambleDurationMs * scale)),
      bomberIngressDurationMs: Math.max(1, Math.round(weightedBomberIngressDurationMs * scale)),
      bomberDefenseDurationMs: Math.max(1, Math.round(weightedBomberDefenseDurationMs * scale))
    };
    const scaledTotalDurationMs =
      scaledDurations.fighterIngressDurationMs
      + scaledDurations.escortMergeDurationMs
      + scaledDurations.escortScrambleDurationMs
      + scaledDurations.bomberIngressDurationMs
      + scaledDurations.bomberDefenseDurationMs;
    const durationDeltaMs = canonicalPreTargetDurationMs - scaledTotalDurationMs;
    scaledDurations.bomberDefenseDurationMs = Math.max(1, scaledDurations.bomberDefenseDurationMs + durationDeltaMs);
    return scaledDurations;
  }

  private buildContestedBomberPhaseSliceAssignments(
    bomberFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    masterPathsByBomberId: ReadonlyMap<string, ReadonlyArray<AirShowPoint>>,
    phaseDurations: AirShowContestedBomberPhaseDurations,
    label: AirShowContestedBomberPhaseLabel
  ): AirShowPhaseAssignment[] {
    if (bomberFlights.length <= 0) {
      return [];
    }
    const orderedPhaseLabels: AirShowContestedBomberPhaseLabel[] = [
      "fighter-ingress",
      "escort-clash-merge",
      "escort-clash-scramble",
      "bomber-ingress",
      "bomber-defense-pass"
    ];
    const durationByLabel = new Map<AirShowContestedBomberPhaseLabel, number>([
      ["fighter-ingress", phaseDurations.fighterIngressDurationMs],
      ["escort-clash-merge", phaseDurations.escortMergeDurationMs],
      ["escort-clash-scramble", phaseDurations.escortScrambleDurationMs],
      ["bomber-ingress", phaseDurations.bomberIngressDurationMs],
      ["bomber-defense-pass", phaseDurations.bomberDefenseDurationMs]
    ]);
    const totalDurationMs = orderedPhaseLabels.reduce((sum, phaseLabel) => {
      return sum + Math.max(0, durationByLabel.get(phaseLabel) ?? 0);
    }, 0);
    if (totalDurationMs <= 0) {
      return [];
    }
    let elapsedBeforeMs = 0;
    for (const phaseLabel of orderedPhaseLabels) {
      if (phaseLabel === label) {
        break;
      }
      elapsedBeforeMs += Math.max(0, durationByLabel.get(phaseLabel) ?? 0);
    }
    const phaseDurationMs = Math.max(0, durationByLabel.get(label) ?? 0);
    const startProgress = this.clamp(elapsedBeforeMs / totalDurationMs, 0, 1);
    const endProgress = this.clamp((elapsedBeforeMs + phaseDurationMs) / totalDurationMs, startProgress, 1);

    return bomberFlights.flatMap((bomberFlight, bomberIndex) => {
      const masterPath = masterPathsByBomberId.get(bomberFlight.spec.id);
      if (!masterPath || masterPath.length < 2) {
        return [];
      }
      const masterPathLengthPx = this.measureAirShowPathLength(masterPath);
      if (!Number.isFinite(masterPathLengthPx) || masterPathLengthPx <= 0.5) {
        return [];
      }
      const activeDurationMs = Math.max(
        1,
        Math.round(masterPathLengthPx / HexMapRenderer.AIR_SHOW_BOMBER_SPEED_PX_PER_MS)
      );
      const ingressDelayMs = Math.max(0, totalDurationMs - activeDurationMs);
      const activeStartTimeMs = this.clamp(elapsedBeforeMs - ingressDelayMs, 0, activeDurationMs);
      const activeEndTimeMs = this.clamp(
        elapsedBeforeMs + phaseDurationMs - ingressDelayMs,
        activeStartTimeMs,
        activeDurationMs
      );
      const flightStartProgress =
        activeDurationMs > 0 ? this.clamp(activeStartTimeMs / activeDurationMs, 0, 1) : startProgress;
      const flightEndProgress =
        activeDurationMs > 0 ? this.clamp(activeEndTimeMs / activeDurationMs, flightStartProgress, 1) : endProgress;
      if (flightEndProgress <= flightStartProgress + 0.0001) {
        return [];
      }
      const slicedPath = this.sliceAirShowPathByProgressRange(masterPath, flightStartProgress, flightEndProgress);
      const slicedPathLengthPx = this.measureAirShowPathLength(slicedPath);
      if (slicedPath.length < 2 || slicedPathLengthPx <= 0.5) {
        return [];
      }
      const phaseMovementStartMs = this.clamp(ingressDelayMs - elapsedBeforeMs, 0, phaseDurationMs);
      return this.buildAirShowFlightAssignments(
        bomberFlight,
        slicedPath,
        0.22,
        bomberIndex,
        bomberFlights.length,
        {
          phaseStartAnchor: slicedPath[0]
        }
      ).map((assignment) => ({
        ...assignment,
        distanceBudgetPx: slicedPathLengthPx,
        progressTimeline:
          phaseMovementStartMs > 1
            ? [
                { timeMs: 0, progress: 0 },
                { timeMs: Math.round(phaseMovementStartMs), progress: 0 },
                { timeMs: phaseDurationMs, progress: 1 }
              ]
            : undefined
      }));
    });
  }

  private resolveAirShowBomberAdvanceDestination(
    corridor: AirShowCorridor,
    current: AirShowPoint,
    standoffPoint: AirShowPoint,
    distanceBudgetPx: number,
    reserveAheadPx: number,
    minimumAdvancePx = 0
  ): AirShowPoint {
    const currentProjection = this.resolveAirShowCorridorCoordinates(corridor, current);
    const standoffProjection = this.resolveAirShowCorridorCoordinates(corridor, standoffPoint);
    const remainingAlongPx = standoffProjection.alongPx - currentProjection.alongPx;
    const remainingDistancePx = Math.max(0, Math.abs(remainingAlongPx));
    const clampedReserveAheadPx = Math.min(Math.max(0, reserveAheadPx), Math.max(0, remainingDistancePx - 1));
    const baseAdvancePx = Math.min(
      Math.max(0, distanceBudgetPx),
      Math.max(0, remainingDistancePx - clampedReserveAheadPx)
    );
    const plannedAdvancePx = Math.min(
      Math.max(
        baseAdvancePx,
        Math.min(Math.max(0, minimumAdvancePx), Math.max(0, remainingDistancePx - 1))
      ),
      remainingDistancePx
    );
    const alongDirection = Math.abs(remainingAlongPx) > 0.001 ? Math.sign(remainingAlongPx) : 0;
    const targetAlongPx = currentProjection.alongPx + alongDirection * plannedAdvancePx;
    const lateralRatio = remainingDistancePx > 0 ? plannedAdvancePx / remainingDistancePx : 1;
    const maxLateralStepPx = this.clamp(plannedAdvancePx * 0.22, 8, 36);
    const targetLateralPx =
      plannedAdvancePx <= 0
        ? currentProjection.lateralPx
        : currentProjection.lateralPx + this.clamp(
            (standoffProjection.lateralPx - currentProjection.lateralPx) * Math.max(0.3, lateralRatio),
            -maxLateralStepPx,
            maxLateralStepPx
          );
    return this.clampPointToViewportBounds(
      this.projectAirShowCorridorPoint(corridor, targetAlongPx, targetLateralPx),
      corridor.center,
      430,
      300
    );
  }

  private buildAirShowBomberAdvancePlan(
    bomberFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    corridor: AirShowCorridor,
    approachProfilesByBomberId: ReadonlyMap<string, AirShowBomberApproachProfile>,
    phaseDurationMs: number,
    reserveAheadDurationMs: number,
    label: string,
    randomForLabel: (label: string) => () => number
  ): AirShowBomberAdvancePlan {
    const distanceBudgetPx = HexMapRenderer.AIR_SHOW_BOMBER_SPEED_PX_PER_MS * Math.max(0, phaseDurationMs);
    const reserveAheadPx = HexMapRenderer.AIR_SHOW_BOMBER_SPEED_PX_PER_MS * Math.max(0, reserveAheadDurationMs);
    const minimumAdvancePx =
      label.startsWith("escort:") || label.startsWith("ingress:")
        ? Math.max(18, distanceBudgetPx * 0.34)
        : 0;
    const destinationsByBomberId = new Map<string, AirShowPoint>();
    const assignments = bomberFlights.flatMap((bomberFlight, bomberIndex) => {
      const rand = randomForLabel(`${label}:${bomberFlight.spec.id}`);
      const current = this.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
      const standoffPoint =
        approachProfilesByBomberId.get(bomberFlight.spec.id)?.standoffPoint
        ?? corridor.strike;
      const destination = this.resolveAirShowBomberAdvanceDestination(
        corridor,
        current,
        standoffPoint,
        distanceBudgetPx,
        reserveAheadPx,
        minimumAdvancePx
      );
      destinationsByBomberId.set(bomberFlight.spec.id, destination);
      const candidatePath = this.buildAirShowBomberContinuationPath(
        current,
        destination,
        {
          lateralSign: this.resolveAirShowRouteSideSign(
            current,
            destination,
            this.resolveAirShowFlightHeadingDegrees(bomberFlight),
            rand() > 0.5 ? 1 : -1
          ),
          corridorWidthPx: 18 + rand() * 4,
          driftPx: 12 + rand() * 6,
          startHeadingDegrees: this.resolveAirShowFlightHeadingDegrees(bomberFlight)
        }
      );
      const cappedDistanceBudgetPx = Math.min(distanceBudgetPx, this.measureAirShowPathLength(candidatePath));
      return this.buildAirShowFlightAssignments(
        bomberFlight,
        candidatePath,
        0.22,
        bomberIndex,
        bomberFlights.length
      ).map((assignment) => ({
        ...assignment,
        distanceBudgetPx: cappedDistanceBudgetPx
      }));
    });
    return {
      assignments,
      destinationsByBomberId
    };
  }

  private resolveAirShowBomberPassEntries(
    scene: ResolvedAirShowScene,
    flightMap: ReadonlyMap<string, AirShowRuntimeFlightInternal>
  ): Map<string, Array<{
    exchange: ResolvedAirShowExchange;
    interceptorFlight: AirShowRuntimeFlightInternal;
    exchangeIndex: number;
  }>> {
    const grouped = new Map<string, Array<{
      exchange: ResolvedAirShowExchange;
      interceptorFlight: AirShowRuntimeFlightInternal;
      exchangeIndex: number;
    }>>();

    (scene.bomberPassExchanges ?? []).forEach((exchange, exchangeIndex) => {
      const interceptorFlight = flightMap.get(exchange.attackerUnitKey);
      const bomberId = exchange.defenderUnitKey;
      if (!interceptorFlight || !bomberId) {
        return;
      }
      const entries = grouped.get(bomberId) ?? [];
      entries.push({ exchange, interceptorFlight, exchangeIndex });
      grouped.set(bomberId, entries);
    });

    return grouped;
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
    const sideSign = this.resolveAirShowRouteSideSign(
      start,
      destination,
      options.startHeadingDegrees,
      options.sideSign ?? 1
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
    // Contested fighter ingress must hand off close to the merge volume.
    // If escorts stage too deep on their own side, CAP can sit on-screen
    // waiting and the first clash beat reads like a second ingress.
    if (sceneKind === "airToAir" && role === "interceptor") {
      return {
        alongPx: 96,
        lateralPx: -118,
        alongStepPx: 24,
        lateralStepPx: 34,
        jitterAlongPx: 0,
        jitterLateralPx: 0,
        arcPx: 28,
        driftPx: 30,
        headingBlend: 0.24
      };
    }
    if (sceneKind === "airToAir" && role === "escort") {
      return {
        alongPx: 104,
        lateralPx: 92,
        alongStepPx: 18,
        lateralStepPx: 28,
        jitterAlongPx: 0,
        jitterLateralPx: 0,
        arcPx: 24,
        driftPx: 18,
        headingBlend: 0.22
      };
    }
    if (role === "interceptor") {
      return {
        alongPx: 104,
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
      alongPx: 252,
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

  private resolveAirShowBomberIngressBandWaypointPlan(
    sceneKind: ResolvedAirShowScene["kind"] | undefined
  ): {
    alongPx: number;
    alongStepPx: number;
  } {
    if (sceneKind === "airToAir") {
      return {
        alongPx: 248,
        alongStepPx: 34
      };
    }
    return {
      alongPx: 168,
      alongStepPx: 30
    };
  }

  private buildAirShowBandAssignments(
    flights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    label: string,
    corridor: AirShowCorridor,
    sceneKind: ResolvedAirShowScene["kind"] | undefined,
    randomForLabel: (label: string) => () => number,
    options: {
      role?: "interceptor" | "escort";
      alongPx: number;
      lateralPx: number;
      alongStepPx?: number;
      lateralStepPx?: number;
      jitterAlongPx?: number;
      jitterLateralPx?: number;
      arcPx?: number;
      driftPx?: number;
      headingBlend?: number;
      resolveHoldTarget?: (lane: number, index: number, current: AirShowPoint) => AirShowPoint | null;
      resolveHeadingTarget?: (lane: number, index: number) => AirShowPoint | null;
    }
  ): AirShowPhaseAssignment[] {
    return flights.flatMap((flight, index) => {
      const rand = randomForLabel(`band:${label}:${flight.spec.id}:${index}`);
      const current = this.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const startHeadingDegrees = this.resolveAirShowFlightHeadingDegrees(flight);
      const lane = flights.length <= 1 ? 0 : index - (flights.length - 1) / 2;
      const jitterAlongPx = (rand() - 0.5) * (options.jitterAlongPx ?? 28);
      const jitterLateralPx = (rand() - 0.5) * (options.jitterLateralPx ?? 24);
      const headingTarget = options.resolveHeadingTarget?.(lane, index) ?? null;
      const holdTarget = options.resolveHoldTarget?.(lane, index, current)
        ?? (options.role
          ? this.resolveAirShowIngressBandHoldTarget(
              corridor,
              current,
              sceneKind,
              options.role,
              lane,
              jitterAlongPx,
              jitterLateralPx
            )
          : this.projectAirShowCorridorPoint(
              corridor,
              options.alongPx + lane * (options.alongStepPx ?? 34) + jitterAlongPx,
              options.lateralPx + lane * (options.lateralStepPx ?? 48) + jitterLateralPx
            ));
      const phaseStartAnchor = current;
      const guidedPath = this.buildAirShowBomberContinuationPath(phaseStartAnchor, holdTarget, {
        lateralSign: lane >= 0 ? 1 : -1,
        corridorWidthPx: headingTarget ? 16 : 20,
        driftPx: this.clamp(Math.abs(options.driftPx ?? 34) * 0.2, 8, 18),
      });
      const resolvedPath = this.sanitizeAirShowEntryPath(guidedPath, {
        maxTurnDeg: 44,
        strongTurnDeg: 86,
        maxFirstSegmentPx: 76,
        maxSharpTurnDeg: 118,
        maxWaypointsToRemove: 2
      });
      return this.buildAirShowFlightAssignments(
        flight,
        resolvedPath,
        options.headingBlend ?? 0.26,
        0,
        1,
        { phaseStartAnchor }
      );
    });
  }

  private resolveAirShowContestedIngressHoldTarget(
    corridor: AirShowCorridor,
    current: AirShowPoint,
    role: "interceptor" | "escort",
    focusPoint: AirShowPoint,
    laneIndex: number
  ): AirShowPoint {
    const focusProjection = this.resolveAirShowCorridorCoordinates(corridor, focusPoint);
    const currentProjection = this.resolveAirShowCorridorCoordinates(corridor, current);
    const approachSign = focusProjection.alongPx >= currentProjection.alongPx ? 1 : -1;
    const visibleBounds = this.resolveAirShowVisibleBounds();
    const visibleWidthPx =
      visibleBounds
        ? Math.max(0, visibleBounds.maxX - visibleBounds.minX)
        : Number.POSITIVE_INFINITY;
    const useCompactIngressStaging = visibleWidthPx <= 1500;
    const roleAlongLeadPx =
      role === "interceptor"
        ? (useCompactIngressStaging ? 56 : 74)
        : (useCompactIngressStaging ? 46 : 58);
    const roleLaneAlongPx = laneIndex * (
      role === "interceptor"
        ? (useCompactIngressStaging ? 10 : 12)
        : (useCompactIngressStaging ? 8 : 10)
    );
    const roleLateralSign = role === "interceptor" ? -1 : 1;
    const roleLateralBasePx =
      role === "interceptor"
        ? (useCompactIngressStaging ? 48 : 68)
        : (useCompactIngressStaging ? 42 : 60);
    const roleLateralStepPx =
      role === "interceptor"
        ? (useCompactIngressStaging ? 18 : 24)
        : (useCompactIngressStaging ? 18 : 22);
    return this.projectAirShowCorridorPoint(
      corridor,
      focusProjection.alongPx - approachSign * roleAlongLeadPx + roleLaneAlongPx,
      focusProjection.lateralPx + roleLateralSign * (roleLateralBasePx + laneIndex * roleLateralStepPx)
    );
  }

  private resolveAirShowIngressBandHoldTarget(
    corridor: AirShowCorridor,
    current: AirShowPoint,
    sceneKind: ResolvedAirShowScene["kind"] | undefined,
    role: "interceptor" | "escort",
    laneIndex: number,
    jitterAlongPx = 0,
    jitterLateralPx = 0
  ): AirShowPoint {
    const plan = this.resolveAirShowIngressBandPlan(sceneKind, role);
    const currentProjection = this.resolveAirShowCorridorCoordinates(corridor, current);
    const alongSign =
      Math.abs(currentProjection.alongPx) > 6
        ? (currentProjection.alongPx >= 0 ? 1 : -1)
        : role === "escort" ? 1 : -1;
    return this.clampPointToViewportBounds(
      this.projectAirShowCorridorPoint(
        corridor,
        alongSign * Math.abs(plan.alongPx) + laneIndex * (plan.alongStepPx ?? 34) + jitterAlongPx,
        plan.lateralPx + laneIndex * (plan.lateralStepPx ?? 48) + jitterLateralPx
      ),
      corridor.center,
      430,
      300
    );
  }

  private resolveAirShowBomberIngressBandWaypoint(
    corridor: AirShowCorridor,
    current: AirShowPoint,
    sceneKind: ResolvedAirShowScene["kind"] | undefined,
    laneIndex: number,
    jitterAlongPx = 0,
    jitterLateralPx = 0
  ): AirShowPoint {
    const plan = this.resolveAirShowBomberIngressBandWaypointPlan(sceneKind);
    const currentProjection = this.resolveAirShowCorridorCoordinates(corridor, current);
    const alongSign = Math.abs(currentProjection.alongPx) > 6 ? (currentProjection.alongPx >= 0 ? 1 : -1) : 1;
    const targetAbsAlong = Math.max(Math.abs(plan.alongPx), 84);
    const targetLateralPx = laneIndex * 48 + jitterLateralPx;
    return this.clampPointToViewportBounds(
      this.projectAirShowCorridorPoint(
        corridor,
        alongSign * targetAbsAlong + laneIndex * (plan.alongStepPx ?? 34) + jitterAlongPx,
        targetLateralPx
      ),
      corridor.center,
      430,
      300
    );
  }

  private resolveAirShowFlightGroupCenter(
    flights: ReadonlyArray<AirShowRuntimeFlightInternal>
  ): AirShowPoint | null {
    return this.averageAirShowPoints(
      flights
        .filter((flight) => flight.actors.some((actor) => actor.active))
        .map((flight) => this.averageAirShowPosition(flight.actors) ?? flight.anchor)
    );
  }

  private resolveAirShowEscortClashCenter(
    corridor: AirShowCorridor,
    _interceptorFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    _escortFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    beat: number
  ): AirShowPoint {
    const strikeProjection = this.resolveAirShowCorridorCoordinates(corridor, corridor.strike);
    const mergeProjection = this.resolveAirShowCorridorCoordinates(corridor, corridor.merge);
    const interceptorSideSign = strikeProjection.alongPx >= 0 ? -1 : 1;
    const scrambleBiasPx =
      beat === 0
        ? 0
        : interceptorSideSign * this.clamp(Math.abs(strikeProjection.alongPx) * 0.04, 10, 34);
    return this.projectAirShowCorridorPoint(
      corridor,
      mergeProjection.alongPx + scrambleBiasPx,
      mergeProjection.lateralPx
    );
  }

  private resolveAirShowEscortClashFocusPoint(
    corridor: AirShowCorridor,
    role: "interceptor" | "escort",
    beat: number,
    laneIndex: number,
    clashCenter?: AirShowPoint
  ): AirShowPoint {
    const strikeProjection = this.resolveAirShowCorridorCoordinates(corridor, corridor.strike);
    const interceptorSideSign = strikeProjection.alongPx >= 0 ? -1 : 1;
    const baseProjection = this.resolveAirShowCorridorCoordinates(corridor, clashCenter ?? corridor.center);
    const scrambleOffsetPx = interceptorSideSign * this.clamp(Math.abs(strikeProjection.alongPx) * 0.035, 10, 30);
    const visibleBounds = this.resolveAirShowVisibleBounds();
    const visibleWidthPx =
      visibleBounds
        ? Math.max(0, visibleBounds.maxX - visibleBounds.minX)
        : Number.POSITIVE_INFINITY;
    const useTightMergeClosure = visibleWidthPx <= 1500;
    const mergeClosurePx = this.clamp(
      Math.abs(strikeProjection.alongPx) * (useTightMergeClosure ? 0.37 : 0.05),
      useTightMergeClosure ? 60 : 18,
      useTightMergeClosure ? 228 : 54
    );
    const alongPx =
      beat === 0
        ? baseProjection.alongPx + (
            role === "interceptor"
              ? -interceptorSideSign * mergeClosurePx
              : interceptorSideSign * mergeClosurePx
          )
        : baseProjection.alongPx + (role === "interceptor" ? scrambleOffsetPx * 0.38 : -scrambleOffsetPx * 0.22);
    const roleLateralPx =
      beat === 0
        ? useTightMergeClosure
          ? 0
          : role === "interceptor" ? -12 : 12
        : role === "interceptor" ? -24 : 24;
    const laneLateralPx = laneIndex * (beat === 0 ? (useTightMergeClosure ? 18 : 34) : 28);
    return this.projectAirShowCorridorPoint(
      corridor,
      alongPx,
      baseProjection.lateralPx + laneLateralPx + roleLateralPx
    );
  }

  private resolveAirShowBomberTargetRunExitPoint(
    corridor: AirShowCorridor,
    bomberCurrent: AirShowPoint,
    targetCenter: AirShowPoint,
    targetApproach: AirShowPoint,
    laneIndex: number
  ): AirShowPoint {
    const currentProjection = this.resolveAirShowCorridorCoordinates(corridor, bomberCurrent);
    const targetCenterProjection = this.resolveAirShowCorridorCoordinates(corridor, targetCenter);
    const targetApproachProjection = this.resolveAirShowCorridorCoordinates(corridor, targetApproach);
    const remainingToTargetPx = Math.max(0, targetCenterProjection.alongPx - currentProjection.alongPx);
    const overshootPx = this.clamp(remainingToTargetPx * 0.42, 64, 118);
    const targetAlongPx = Math.max(
      currentProjection.alongPx + 42,
      targetCenterProjection.alongPx + overshootPx
    );
    const desiredLaneLateralPx = targetApproachProjection.lateralPx + laneIndex * 2;
    const targetLateralPx = this.clamp(
      currentProjection.lateralPx * 0.24 + desiredLaneLateralPx * 0.76,
      desiredLaneLateralPx - 14,
      desiredLaneLateralPx + 14
    );
    return this.clampPointToViewportBounds(
      this.projectAirShowCorridorPoint(corridor, targetAlongPx, targetLateralPx),
      corridor.center,
      430,
      300
    );
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
    const currentProjection = this.resolveAirShowCorridorCoordinates(corridor, start);
    const passDirection = options.passEndAlongPx >= currentProjection.alongPx ? 1 : -1;
    const laneSpreadPx = laneIndex * 42;
    const clampPoint = (point: AirShowPoint): AirShowPoint =>
      this.clampPointToViewportBounds(point, corridor.center, 420, 280);
    const entryStart = clampPoint({
      cx: start.cx + laneIndex * 3.2,
      cy: start.cy + attackSideSign * laneIndex * 1.2
    });
    const pointOnCorridor = (alongPx: number, lateralPx: number): AirShowPoint =>
      clampPoint(this.projectAirShowCorridorPoint(corridor, alongPx, lateralPx));
    const stageAlongPx = this.clamp(
      currentProjection.alongPx + (options.passStartAlongPx - currentProjection.alongPx) * 0.48,
      Math.min(currentProjection.alongPx, options.passStartAlongPx) - 10,
      Math.max(currentProjection.alongPx, options.passStartAlongPx) + 10
    );
    const stagePoint = pointOnCorridor(
      stageAlongPx,
      laneSpreadPx + attackSideSign * 58
    );
    const gunPoint = pointOnCorridor(
      options.passStartAlongPx + passDirection * 12,
      laneSpreadPx + attackSideSign * 16
    );
    const crossingPoint = pointOnCorridor(
      options.passEndAlongPx + passDirection * 14,
      laneIndex * 10 - attackSideSign * 4
    );
    const extendPoint = pointOnCorridor(
      options.passEndAlongPx + passDirection * 56,
      laneIndex * 12 - attackSideSign * 26
    );
    const exitPoint = pointOnCorridor(
      options.passEndAlongPx + passDirection * 92,
      laneIndex * 14 - attackSideSign * 52
    );
    const evaluatePathEntry = (path: ReadonlyArray<AirShowPoint>): {
      firstTurnDeg: number;
      maxTurnDeg: number;
      earlyRegression: boolean;
      firstPointRecedes: boolean;
    } => {
      let maxTurnDeg = 0;
      for (let index = 1; index < path.length - 1; index += 1) {
        const previous = path[index - 1];
        const current = path[index];
        const next = path[index + 1];
        if (!previous || !current || !next) {
          continue;
        }
        maxTurnDeg = Math.max(
          maxTurnDeg,
          this.resolveAirShowWaypointTurnDegrees(previous, current, next)
        );
      }
      let earlyRegression = false;
      for (let index = 1; index < Math.min(path.length, 4); index += 1) {
        const previous = path[index - 1];
        const current = path[index];
        if (!previous || !current) {
          continue;
        }
        const previousAlongPx = this.resolveAirShowCorridorCoordinates(corridor, previous).alongPx;
        const currentAlongPx = this.resolveAirShowCorridorCoordinates(corridor, current).alongPx;
        if ((currentAlongPx - previousAlongPx) * passDirection < -6) {
          earlyRegression = true;
          break;
        }
      }
      const firstPoint = path[1];
      const secondPoint = path[2];
      return {
        firstTurnDeg:
          firstPoint && secondPoint
            ? this.resolveAirShowWaypointTurnDegrees(start, firstPoint, secondPoint)
            : 0,
        maxTurnDeg,
        earlyRegression,
        firstPointRecedes:
          !!firstPoint
          && Math.hypot(firstPoint.cx - stagePoint.cx, firstPoint.cy - stagePoint.cy)
            > Math.hypot(start.cx - stagePoint.cx, start.cy - stagePoint.cy) + 6
      };
    };
    const buildMonotonicInterceptEntryPath = (): AirShowPoint[] => {
      const routeDx = stagePoint.cx - entryStart.cx;
      const routeDy = stagePoint.cy - entryStart.cy;
      const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
      const routeForward = this.normalizeAircraftVector(routeDx, routeDy, corridor.axis.x, corridor.axis.y);
      const routeNormal = { x: -routeForward.y, y: routeForward.x };
      const clampInline = (point: AirShowPoint): AirShowPoint =>
        this.clampPointToViewportBounds(point, corridor.center, 420, 280);
      const entryLead = clampInline({
        cx:
          entryStart.cx +
          routeForward.x * Math.min(Math.max(28, routeDistance * 0.18), Math.max(44, routeDistance * 0.24)) +
          routeNormal.x * attackSideSign * Math.min(12, routeDistance * 0.04),
        cy:
          entryStart.cy +
          routeForward.y * Math.min(Math.max(28, routeDistance * 0.18), Math.max(44, routeDistance * 0.24)) +
          routeNormal.y * attackSideSign * Math.min(12, routeDistance * 0.04)
      });
      const settleLead = clampInline({
        cx:
          entryStart.cx +
          routeForward.x * Math.min(Math.max(72, routeDistance * 0.44), Math.max(104, routeDistance * 0.56)) +
          routeNormal.x * attackSideSign * Math.min(6, routeDistance * 0.02),
        cy:
          entryStart.cy +
          routeForward.y * Math.min(Math.max(72, routeDistance * 0.44), Math.max(104, routeDistance * 0.56)) +
          routeNormal.y * attackSideSign * Math.min(6, routeDistance * 0.02)
      });
      return [
        entryStart,
        entryLead,
        settleLead,
        stagePoint,
        gunPoint,
        crossingPoint,
        extendPoint,
        exitPoint
      ].filter((point, index, points) => {
        const previous = index === 0 ? null : points[index - 1];
        if (!previous) {
          return true;
        }
        return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
      });
    };
    const buildStagedInterceptEntryPath = (): AirShowPoint[] => {
      const stagedPath = this.buildAirShowIngressStagingPath(entryStart, stagePoint, gunPoint, {
        startHeadingDegrees: options.startHeadingDegrees,
        lateralSign: attackSideSign,
        arcPx: 28 + Math.abs(laneIndex) * 6,
        driftPx: 10 + Math.abs(laneIndex) * 2
      });
      return [...stagedPath, gunPoint, crossingPoint, extendPoint, exitPoint].filter((point, index, points) => {
        const previous = index === 0 ? null : points[index - 1];
        if (!previous) {
          return true;
        }
        return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
      });
    };
    const finalizeInterceptEntryCandidate = (
      candidatePath: ReadonlyArray<AirShowPoint>,
      options: {
        maxTurnDeg: number;
        strongTurnDeg: number;
        maxFirstSegmentPx: number;
        maxWaypointsToRemove: number;
        sharpTurnDeg: number;
        sharpTurnRemovals: number;
      }
    ): AirShowPoint[] =>
      this.pruneAirShowSharpTurns(
        this.pruneAirShowEarlyTurnWaypoints([...candidatePath], {
          maxTurnDeg: options.maxTurnDeg,
          strongTurnDeg: options.strongTurnDeg,
          maxFirstSegmentPx: options.maxFirstSegmentPx,
          maxWaypointsToRemove: options.maxWaypointsToRemove
        }),
        options.sharpTurnDeg,
        options.sharpTurnRemovals
      );
    const scoreInterceptEntryPath = (candidatePath: ReadonlyArray<AirShowPoint>): {
      path: AirShowPoint[];
      score: number;
    } => {
      const stats = evaluatePathEntry(candidatePath);
      return {
        path: [...candidatePath],
        score:
          stats.firstTurnDeg * 2.2
          + stats.maxTurnDeg
          + (stats.earlyRegression ? 420 : 0)
          + (stats.firstPointRecedes ? 240 : 0)
      };
    };
    const prependHeadingCommit = (path: ReadonlyArray<AirShowPoint>): AirShowPoint[] => {
      if (typeof options.startHeadingDegrees !== "number" || path.length < 2) {
        return [...path];
      }
      const firstPoint = path[1];
      if (!firstPoint) {
        return [...path];
      }
      const routeDx = firstPoint.cx - start.cx;
      const routeDy = firstPoint.cy - start.cy;
      const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
      const routeForward = this.normalizeAircraftVector(routeDx, routeDy, 0, -1);
      const routeNormal = { x: -routeForward.y, y: routeForward.x };
      const headingForward = this.resolveAirShowHeadingVector(options.startHeadingDegrees);
      const entryTurnDeg = this.resolveAirShowVectorAngleDegrees(headingForward, routeForward);
      if (entryTurnDeg <= 32) {
        return [...path];
      }
      const commitDistancePx = Math.min(
        Math.max(32, routeDistance * 0.14),
        Math.max(58, routeDistance * 0.24)
      );
      const commitPoint = this.clampPointToViewportBounds(
        {
          cx:
            start.cx +
            headingForward.x * commitDistancePx +
            routeNormal.x * attackSideSign * Math.min(12, routeDistance * 0.04),
          cy:
            start.cy +
            headingForward.y * commitDistancePx +
            routeNormal.y * attackSideSign * Math.min(12, routeDistance * 0.04)
        },
        corridor.center,
        420,
        280
      );
      if (Math.hypot(commitPoint.cx - start.cx, commitPoint.cy - start.cy) < 24) {
        return [...path];
      }
      const commitLead = this.buildAirShowHeadingLeadPoint(commitPoint, firstPoint, {
        startHeadingDegrees: this.resolveAircraftHeadingDegrees(
          commitPoint.cx - start.cx,
          commitPoint.cy - start.cy,
          options.startHeadingDegrees
        ),
        lateralSign: attackSideSign,
        leadForwardPx: Math.min(
          Math.max(18, routeDistance * 0.1),
          Math.max(30, routeDistance * 0.15)
        ),
        leadLateralPx: 6,
        clampCenter: corridor.center,
        maxHorizontalPx: 420,
        maxVerticalPx: 280
      });
      const candidatePath = this.pruneAirShowEarlyTurnWaypoints(
        [start, commitPoint, commitLead, ...path.slice(1)].filter((point, index, points) => {
          const previous = index === 0 ? null : points[index - 1];
          if (!previous) {
            return true;
          }
          return Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
        }),
        {
          maxTurnDeg: 42,
          strongTurnDeg: 88,
          maxFirstSegmentPx: 78,
          maxWaypointsToRemove: 1
        }
      );
      const baseStats = evaluatePathEntry(path);
      const candidateStats = evaluatePathEntry(candidatePath);
      if (
        candidateStats.firstTurnDeg > 52
        || candidateStats.earlyRegression
        || candidateStats.firstPointRecedes
        || candidateStats.firstTurnDeg > baseStats.firstTurnDeg + 4
        || candidateStats.maxTurnDeg > baseStats.maxTurnDeg + 10
      ) {
        return [...path];
      }
      return candidatePath;
    };
    const entryBridgePoints = this.buildAirShowPhaseEntryBridge(entryStart, stagePoint, {
      startHeadingDegrees: options.startHeadingDegrees,
      sideSign: attackSideSign,
      carryForwardPx: 56,
      clampCenter: corridor.center,
      maxHorizontalPx: 420,
      maxVerticalPx: 280
    });
    const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? entryStart;
    const bridgeExitHeadingDegrees = this.resolveAirShowPathHeadingDegrees(
      [entryStart, ...entryBridgePoints],
      options.startHeadingDegrees
    );
    const headingLead = this.buildAirShowHeadingLeadPoint(bridgeExitPoint, stagePoint, {
      startHeadingDegrees: bridgeExitHeadingDegrees,
      lateralSign: attackSideSign,
      leadForwardPx: 36,
      leadLateralPx: 12,
      clampCenter: corridor.center,
      maxHorizontalPx: 420,
      maxVerticalPx: 280
    });
    const headingLeadIndex = 1 + entryBridgePoints.length;
    const path = [
      entryStart,
      ...entryBridgePoints,
      headingLead,
      stagePoint,
      gunPoint,
      crossingPoint,
      extendPoint,
      exitPoint
    ];
    const earlyPruned = this.pruneAirShowEarlyTurnWaypoints(
      this.pruneAirShowTurnWaypoint(path, headingLeadIndex, 52),
      {
        maxTurnDeg: 44,
        strongTurnDeg: 88,
        maxFirstSegmentPx: 72,
        maxWaypointsToRemove: 3
      }
    );
    let resolvedPath = this.pruneAirShowSharpTurns(earlyPruned, 96, 3);
    const entryStats = evaluatePathEntry(resolvedPath);
    if (
      entryStats.firstTurnDeg > 54
      || entryStats.maxTurnDeg > 132
      || entryStats.earlyRegression
      || entryStats.firstPointRecedes
    ) {
      const stagedPath = finalizeInterceptEntryCandidate(buildStagedInterceptEntryPath(), {
        maxTurnDeg: 44,
        strongTurnDeg: 88,
        maxFirstSegmentPx: 76,
        maxWaypointsToRemove: 2,
        sharpTurnDeg: 104,
        sharpTurnRemovals: 2
      });
      const monotonicPath = finalizeInterceptEntryCandidate(buildMonotonicInterceptEntryPath(), {
        maxTurnDeg: 46,
        strongTurnDeg: 92,
        maxFirstSegmentPx: 78,
        maxWaypointsToRemove: 1,
        sharpTurnDeg: 112,
        sharpTurnRemovals: 2
      });
      resolvedPath =
        [stagedPath, monotonicPath]
          .filter((candidatePath) => candidatePath.length >= 2)
          .map((candidatePath) => scoreInterceptEntryPath(candidatePath))
          .sort((left, right) => left.score - right.score)[0]?.path
        ?? monotonicPath;
    }
    return prependHeadingCommit(resolvedPath);
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
    // Keep at least 2 bridge points — stripping down to 1 leaves a carryPointA that
    // often causes a near-180° first waypoint turn, the worst possible entry.
    while (prunedSamples.length > 2) {
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
    totalFlights = 1,
    options: {
      phaseStartAnchor?: AirShowPoint;
    } = {}
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
          // Keep the stored path in the same pre-offset coordinate frame for every
          // waypoint, then add the multi-flight offset only at sampling/render time.
          // This preserves rendered continuity while also keeping the inspected path
          // geometry truthful instead of introducing an artificial first-segment kink.
          cx:
            pointIndex === 0
              ? (options.phaseStartAnchor?.cx ?? flight.anchor.cx) + actor.biasX
              : point.cx + actor.biasX,
          cy:
            pointIndex === 0
              ? (options.phaseStartAnchor?.cy ?? flight.anchor.cy) + actor.biasY
              : point.cy + actor.biasY
        })),
        headingBlend,
        // Formation spread must stay spatial. Per-aircraft progress offsets make
        // actors on the same governed rail visibly accelerate/decelerate.
        progressOffset: 0,
        multiFlightOffsetPx
      }));
  }

  private measureAirShowPathLength(points: ReadonlyArray<AirShowPoint>): number {
    let lengthPx = 0;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current) {
        continue;
      }
      lengthPx += Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
    }
    return lengthPx;
  }

  private measureAirShowRenderedPathLength(
    points: ReadonlyArray<AirShowPoint>,
    startProgress = 0,
    endProgress = 1
  ): number {
    if (points.length < 2) {
      return 0;
    }
    const clampedStart = this.clamp(startProgress, 0, 1);
    const clampedEnd = this.clamp(endProgress, clampedStart, 1);
    const progressSpan = clampedEnd - clampedStart;
    if (progressSpan <= 0.0001) {
      return 0;
    }
    const sampleCount = Math.max(8, Math.ceil(48 * progressSpan));
    let previous = this.sampleAircraftWaypointPath(points, clampedStart).point;
    let lengthPx = 0;
    for (let index = 1; index <= sampleCount; index += 1) {
      const progress = clampedStart + progressSpan * (index / sampleCount);
      const current = this.sampleAircraftWaypointPath(points, progress).point;
      lengthPx += Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
      previous = current;
    }
    return lengthPx;
  }

  private truncateAirShowPathByLength(
    points: ReadonlyArray<AirShowPoint>,
    targetPathLengthPx: number
  ): AirShowPoint[] {
    if (points.length < 2 || !Number.isFinite(targetPathLengthPx) || targetPathLengthPx <= 0) {
      return [...points];
    }

    const currentPathLengthPx = this.measureAirShowPathLength(points);
    if (!Number.isFinite(currentPathLengthPx) || currentPathLengthPx <= 0 || targetPathLengthPx >= currentPathLengthPx - 1) {
      return [...points];
    }

    const truncated: AirShowPoint[] = [{ ...points[0]! }];
    let remainingPx = targetPathLengthPx;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current) {
        continue;
      }
      const segmentLengthPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
      if (segmentLengthPx <= 0.0001) {
        continue;
      }
      if (remainingPx >= segmentLengthPx) {
        truncated.push({ ...current });
        remainingPx -= segmentLengthPx;
        continue;
      }
      const ratio = this.clamp(remainingPx / segmentLengthPx, 0, 1);
      truncated.push({
        cx: previous.cx + (current.cx - previous.cx) * ratio,
        cy: previous.cy + (current.cy - previous.cy) * ratio
      });
      break;
    }

    if (truncated.length < 2) {
      const start = points[0]!;
      const next = points[1]!;
      const segmentLengthPx = Math.max(1, Math.hypot(next.cx - start.cx, next.cy - start.cy));
      const ratio = this.clamp(targetPathLengthPx / segmentLengthPx, 0.001, 1);
      truncated.push({
        cx: start.cx + (next.cx - start.cx) * ratio,
        cy: start.cy + (next.cy - start.cy) * ratio
      });
    }

    return truncated;
  }

  private extendAirShowPathWithLoiterArc(
    points: ReadonlyArray<AirShowPoint>,
    targetPathLengthPx: number,
    options: {
      clampCenter: AirShowPoint;
      orbitSign?: number;
      maxHorizontalPx?: number;
      maxVerticalPx?: number;
    }
  ): AirShowPoint[] {
    if (points.length < 2) {
      return [...points];
    }

    const extended = [...points];
    let currentPathLengthPx = this.measureAirShowPathLength(extended);
    let remainingLengthPx = targetPathLengthPx - currentPathLengthPx;
    if (!Number.isFinite(remainingLengthPx) || remainingLengthPx <= 6) {
      return extended;
    }

    let orbitSign = options.orbitSign ?? 1;
    let guard = 0;
    while (remainingLengthPx > 6 && guard < 6) {
      const end = extended[extended.length - 1];
      const previous = extended[extended.length - 2];
      if (!end || !previous) {
        break;
      }

      const forward = this.normalizeAircraftVector(
        end.cx - previous.cx,
        end.cy - previous.cy,
        1,
        0
      );
      const normal = { x: -forward.y, y: forward.x };
      const radiusPx = this.clamp(
        Math.min(Math.max(remainingLengthPx / Math.PI, 56), remainingLengthPx),
        56,
        132
      );
      const orbitCenter = {
        cx: end.cx + normal.x * orbitSign * radiusPx,
        cy: end.cy + normal.y * orbitSign * radiusPx
      };
      const startAngle = Math.atan2(end.cy - orbitCenter.cy, end.cx - orbitCenter.cx);
      const sweepRadians = this.clamp(
        remainingLengthPx / Math.max(1, radiusPx),
        Math.PI * 0.38,
        Math.PI * 1.6
      );
      const sampleCount = Math.max(6, Math.ceil(sweepRadians / (Math.PI / 10)));
      const lengthBeforeLoopPx = currentPathLengthPx;

      for (let index = 1; index <= sampleCount; index += 1) {
        const angle = startAngle - orbitSign * (sweepRadians * index) / sampleCount;
        const candidate = this.clampPointToViewportBounds(
          {
            cx: orbitCenter.cx + Math.cos(angle) * radiusPx,
            cy: orbitCenter.cy + Math.sin(angle) * radiusPx
          },
          options.clampCenter,
          options.maxHorizontalPx ?? 430,
          options.maxVerticalPx ?? 300
        );
        const lastPoint = extended[extended.length - 1];
        if (!lastPoint || Math.hypot(candidate.cx - lastPoint.cx, candidate.cy - lastPoint.cy) <= 1) {
          continue;
        }
        extended.push(candidate);
      }

      currentPathLengthPx = this.measureAirShowPathLength(extended);
      if (currentPathLengthPx <= lengthBeforeLoopPx + 2) {
        break;
      }
      remainingLengthPx = targetPathLengthPx - currentPathLengthPx;
      orbitSign *= -1;
      guard += 1;
    }

    return extended;
  }

  private extendAirShowPathWithCarry(
    points: ReadonlyArray<AirShowPoint>,
    targetPathLengthPx: number,
    options: {
      orbitSign?: number;
    } = {}
  ): AirShowPoint[] {
    if (points.length < 2) {
      return [...points];
    }
    const currentPathLengthPx = this.measureAirShowPathLength(points);
    const extraDistancePx = targetPathLengthPx - currentPathLengthPx;
    if (!Number.isFinite(extraDistancePx) || extraDistancePx <= 1) {
      return [...points];
    }

    const start = points[points.length - 2]!;
    const end = points[points.length - 1]!;
    const travel = this.normalizeAircraftVector(end.cx - start.cx, end.cy - start.cy, 1, 0);
    const normal = { x: -travel.y, y: travel.x };
    const sideSign = options.orbitSign && options.orbitSign < 0 ? -1 : 1;
    const lateralPx = this.clamp(extraDistancePx * 0.045, 0, 34);
    const progressStops = extraDistancePx <= 96 ? [1] : extraDistancePx <= 220 ? [0.5, 1] : [0.34, 0.68, 1];
    const carryPoints = progressStops.map((progress) => {
      const lateralEase = Math.sin(progress * Math.PI);
      return {
        cx: end.cx + travel.x * extraDistancePx * progress + normal.x * sideSign * lateralPx * lateralEase,
        cy: end.cy + travel.y * extraDistancePx * progress + normal.y * sideSign * lateralPx * lateralEase
      };
    });

    return [...points, ...carryPoints].filter((point, index, path) => {
      if (index === 0) {
        return true;
      }
      const previous = path[index - 1];
      return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
    });
  }

  private extendAirShowPhaseAssignmentsForSpeed(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number>,
    options: {
      clampCenter: AirShowPoint;
      orbitSignByRole?: Partial<Record<AirShowRuntimeActor["role"], number>>;
      maxHorizontalPx?: number;
      maxVerticalPx?: number;
      extendAt?: "start" | "end";
      extendAtByRole?: Partial<Record<AirShowRuntimeActor["role"], "start" | "end">>;
      extensionMode?: "loiter" | "carry";
      extensionModeByRole?: Partial<Record<AirShowRuntimeActor["role"], "loiter" | "carry">>;
      remapProgressTimelineForExtension?: boolean;
    }
  ): AirShowPhaseAssignment[] {
    return assignments.map((assignment) => {
      const targetSpeedPxPerMs = roleTargetSpeeds.get(assignment.actor.role) ?? 0;
      const explicitBudgetPx =
        typeof assignment.distanceBudgetPx === "number" && Number.isFinite(assignment.distanceBudgetPx)
          ? assignment.distanceBudgetPx
          : null;
      const targetPathLengthPx =
        explicitBudgetPx
        ?? (targetSpeedPxPerMs > 0 && durationMs > 0 ? targetSpeedPxPerMs * durationMs : null);
      if (!targetPathLengthPx || !Number.isFinite(targetPathLengthPx) || targetPathLengthPx <= 0) {
        return assignment;
      }

      const currentPathLengthPx = this.measureAirShowPathLength(assignment.points);
      if (currentPathLengthPx >= targetPathLengthPx - 8) {
        return assignment;
      }

      const extendAt = options.extendAtByRole?.[assignment.actor.role] ?? options.extendAt;
      const basePoints =
        extendAt === "start"
          ? [...assignment.points].reverse()
          : [...assignment.points];
      const extensionMode =
        options.extensionModeByRole?.[assignment.actor.role]
        ?? options.extensionMode;
      const extendedPoints =
        extensionMode === "carry"
          ? this.extendAirShowPathWithCarry(basePoints, targetPathLengthPx, {
              orbitSign: options.orbitSignByRole?.[assignment.actor.role]
            })
          : this.extendAirShowPathWithLoiterArc(basePoints, targetPathLengthPx, {
              clampCenter: options.clampCenter,
              orbitSign: options.orbitSignByRole?.[assignment.actor.role],
              maxHorizontalPx: options.maxHorizontalPx,
              maxVerticalPx: options.maxVerticalPx
            });

      return {
        ...assignment,
        points:
          extendAt === "start"
            ? extendedPoints.reverse()
            : extendedPoints,
        progressTimeline: options.remapProgressTimelineForExtension
          ? this.remapAirShowProgressTimelineForExtendedPath(
              assignment.progressTimeline,
              currentPathLengthPx,
              this.measureAirShowPathLength(extendedPoints),
              extendAt === "start"
            )
          : assignment.progressTimeline
      };
    });
  }

  private remapAirShowProgressTimelineForExtendedPath(
    timeline: ReadonlyArray<AirShowAssignmentProgressKeyframe> | undefined,
    originalPathLengthPx: number,
    extendedPathLengthPx: number,
    extendedAtStart: boolean
  ): ReadonlyArray<AirShowAssignmentProgressKeyframe> | undefined {
    if (
      !Array.isArray(timeline)
      || timeline.length < 2
      || !Number.isFinite(originalPathLengthPx)
      || !Number.isFinite(extendedPathLengthPx)
      || originalPathLengthPx <= 0
      || extendedPathLengthPx <= 0
    ) {
      return timeline;
    }
    const addedStartLengthPx = extendedAtStart
      ? Math.max(0, extendedPathLengthPx - originalPathLengthPx)
      : 0;
    return timeline.map((keyframe) => ({
      timeMs: keyframe.timeMs,
      progress: this.clamp(
        (addedStartLengthPx + this.clamp(keyframe.progress, 0, 1) * originalPathLengthPx)
          / extendedPathLengthPx,
        0,
        1
      )
    }));
  }

  private applyAirShowAssignmentDistanceBudget(
    assignment: AirShowPhaseAssignment,
    durationMs: number,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number>
  ): AirShowPhaseAssignment {
    const explicitBudgetPx =
      typeof assignment.distanceBudgetPx === "number" && Number.isFinite(assignment.distanceBudgetPx)
        ? assignment.distanceBudgetPx
        : null;
    const roleTargetSpeedPxPerMs = roleTargetSpeeds.get(assignment.actor.role) ?? 0;
    const implicitBudgetPx =
      explicitBudgetPx === null && roleTargetSpeedPxPerMs > 0 && durationMs > 0
        ? roleTargetSpeedPxPerMs * durationMs
        : null;
    const targetPathLengthPx = explicitBudgetPx ?? implicitBudgetPx;
    if (targetPathLengthPx === null || !Number.isFinite(targetPathLengthPx) || targetPathLengthPx <= 0) {
      return assignment;
    }
    return {
      ...assignment,
      points: this.truncateAirShowPathByLength(assignment.points, targetPathLengthPx)
    };
  }

  private resolveAirShowRoleSpeedMap(
    overrides: Partial<Record<AirShowRuntimeActor["role"], number>> = {}
  ): Map<AirShowRuntimeActor["role"], number> {
    return new Map<AirShowRuntimeActor["role"], number>([
      ["interceptor", overrides.interceptor ?? HexMapRenderer.AIR_SHOW_FIGHTER_SPEED_PX_PER_MS],
      ["escort", overrides.escort ?? HexMapRenderer.AIR_SHOW_FIGHTER_SPEED_PX_PER_MS],
      ["bomber", overrides.bomber ?? HexMapRenderer.AIR_SHOW_BOMBER_SPEED_PX_PER_MS]
    ]);
  }

  private applyAirShowPhaseMotionBudgets(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number> = this.resolveAirShowRoleSpeedMap()
  ): AirShowPhaseAssignment[] {
    return assignments.map((assignment) =>
      this.applyAirShowAssignmentDistanceBudget(assignment, durationMs, roleTargetSpeeds)
    );
  }

  private finalizeAirShowPhaseAssignments(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    progressSamplePoints: number[],
    smoothEntryRadiusPx?: number,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number> = this.resolveAirShowRoleSpeedMap()
  ): AirShowPhaseAssignment[] {
    const budgetedAssignments = this.applyAirShowPhaseMotionBudgets(assignments, durationMs, roleTargetSpeeds);
    const spacedAssignments = this.resolveAirShowPhaseSpacing(budgetedAssignments, durationMs, progressSamplePoints);
    const rebudgetedAssignments = this.applyAirShowPhaseMotionBudgets(spacedAssignments, durationMs, roleTargetSpeeds);
    const shapedAssignments =
      typeof smoothEntryRadiusPx === "number"
        ? this.smoothAirShowAssignmentEntries(rebudgetedAssignments, smoothEntryRadiusPx)
        : rebudgetedAssignments;
    const exitShapedAssignments =
      typeof smoothEntryRadiusPx === "number"
        ? this.smoothAirShowAssignmentExits(shapedAssignments, smoothEntryRadiusPx)
        : shapedAssignments;
    return exitShapedAssignments;
  }

  private prepareAirShowPhaseAssignments(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    progressSamplePoints: number[],
    smoothEntryRadiusPx: number | undefined,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number> = this.resolveAirShowRoleSpeedMap(),
    options: {
      previousAssignments?: ReadonlyArray<AirShowPhaseAssignment>;
      previousDurationMs?: number;
      harmonizeIngressVisibility?: boolean;
      entryTurnLimitDeg?: number;
      directTurnHomeRoles?: ReadonlyArray<AirShowRuntimeActor["role"]>;
      softenEntryRoles?: ReadonlyArray<AirShowRuntimeActor["role"]>;
      softenEntryTurnLimitDeg?: number;
      softenEntryWaypointCount?: number;
      softenExitRoles?: ReadonlyArray<AirShowRuntimeActor["role"]>;
      softenExitTurnLimitDeg?: number;
      softenExitWaypointCount?: number;
      sanitizeEntryTurns?: boolean;
      sanitizeEntryTurnLimitDeg?: number;
      sanitizeEntryStrongTurnDeg?: number;
      sanitizeEntryMaxFirstSegmentPx?: number;
      sanitizeEntryMaxSharpTurnDeg?: number;
      sanitizeEntryMaxWaypointsToRemove?: number;
    } = {}
  ): AirShowPhaseAssignment[] {
    let finalizedAssignments = this.finalizeAirShowPhaseAssignments(
      assignments,
      durationMs,
      progressSamplePoints,
      smoothEntryRadiusPx,
      roleTargetSpeeds
    );
    if (options.harmonizeIngressVisibility) {
      finalizedAssignments = this.harmonizeContestedIngressAssignmentsByVisibility(
        finalizedAssignments,
        durationMs,
        roleTargetSpeeds
      );
    }
    if ((options.previousAssignments?.length ?? 0) > 0) {
      finalizedAssignments = this.applyAirShowPhaseMotionBudgets(
        this.harmonizeAirShowPhaseEntryWithPreviousPhase(
          options.previousAssignments ?? [],
          options.previousDurationMs ?? durationMs,
          finalizedAssignments,
          durationMs,
          options.entryTurnLimitDeg ?? 108,
          new Set(options.directTurnHomeRoles ?? [])
        ),
        durationMs,
        roleTargetSpeeds
      );
    }
    const softenedEntryRoles = new Set(options.softenEntryRoles ?? []);
    if (softenedEntryRoles.size > 0) {
      let softenedEntryAssignmentsChanged = false;
      const softenedEntryAssignments = finalizedAssignments.map((assignment) => {
        if (!softenedEntryRoles.has(assignment.actor.role) || assignment.points.length < 3) {
          return assignment;
        }
        const softenedPoints = this.softenAirShowEntryWindowTurns(
          assignment.points,
          options.softenEntryTurnLimitDeg ?? 104,
          {
            maxWaypointsToRemove: 3,
            entryWaypointCount: options.softenEntryWaypointCount ?? 5,
            blendRangeDeg: 24,
            minBlendFactor: 0.48,
            maxBlendFactor: 0.8
          }
        );
        if (softenedPoints.length < 2 || softenedPoints === assignment.points) {
          return assignment;
        }
        if (softenedPoints.length !== assignment.points.length) {
          softenedEntryAssignmentsChanged = true;
        } else if (
          softenedPoints.some((point, index) => {
            const originalPoint = assignment.points[index];
            return !originalPoint || Math.hypot(point.cx - originalPoint.cx, point.cy - originalPoint.cy) > 0.5;
          })
        ) {
          softenedEntryAssignmentsChanged = true;
        }
        return {
          ...assignment,
          points: softenedPoints
        };
      });
      if (softenedEntryAssignmentsChanged) {
        finalizedAssignments = this.applyAirShowPhaseMotionBudgets(
          softenedEntryAssignments,
          durationMs,
          roleTargetSpeeds
        );
        finalizedAssignments = this.applyAirShowPhaseMotionBudgets(
          this.smoothAirShowAssignmentEntries(
            finalizedAssignments,
            this.clamp(
              Math.round((options.softenEntryTurnLimitDeg ?? 104) * 0.68),
              42,
              68
            )
          ),
          durationMs,
          roleTargetSpeeds
        );
      }
    }
    const softenedExitRoles = new Set(options.softenExitRoles ?? []);
    if (softenedExitRoles.size > 0) {
      let softenedExitAssignmentsChanged = false;
      const softenedExitAssignments = finalizedAssignments.map((assignment) => {
        if (!softenedExitRoles.has(assignment.actor.role) || assignment.points.length < 3) {
          return assignment;
        }
        const softenedPoints = this.softenAirShowExitWindowTurns(
          assignment.points,
          options.softenExitTurnLimitDeg ?? 104,
          {
            maxWaypointsToRemove: 3,
            exitWaypointCount: options.softenExitWaypointCount ?? 5,
            blendRangeDeg: 24,
            minBlendFactor: 0.48,
            maxBlendFactor: 0.8
          }
        );
        if (softenedPoints.length < 2 || softenedPoints === assignment.points) {
          return assignment;
        }
        if (softenedPoints.length !== assignment.points.length) {
          softenedExitAssignmentsChanged = true;
        } else if (
          softenedPoints.some((point, index) => {
            const originalPoint = assignment.points[index];
            return !originalPoint || Math.hypot(point.cx - originalPoint.cx, point.cy - originalPoint.cy) > 0.5;
          })
        ) {
          softenedExitAssignmentsChanged = true;
        }
        return {
          ...assignment,
          points: softenedPoints
        };
      });
      if (softenedExitAssignmentsChanged) {
        finalizedAssignments = this.applyAirShowPhaseMotionBudgets(
          softenedExitAssignments,
          durationMs,
          roleTargetSpeeds
        );
        finalizedAssignments = this.applyAirShowPhaseMotionBudgets(
          this.smoothAirShowAssignmentExits(
            finalizedAssignments,
            this.clamp(
              Math.round((options.softenExitTurnLimitDeg ?? 104) * 0.68),
              42,
              68
            )
          ),
          durationMs,
          roleTargetSpeeds
        );
      }
    }
    if ((options.previousAssignments?.length ?? 0) > 0) {
      const previousAssignmentsByActorId = this.buildAirShowAssignmentLookup(options.previousAssignments ?? []);
      finalizedAssignments = finalizedAssignments.map((assignment) => {
        const previousAssignment = previousAssignmentsByActorId.get(assignment.actor.id);
        if (!previousAssignment || assignment.points.length <= 0) {
          return assignment;
        }
        const previousBoundary = this.resolveAirShowAssignmentBoundaryState(
          previousAssignment,
          options.previousDurationMs ?? durationMs,
          "end"
        );
        if (!previousBoundary) {
          return assignment;
        }
        const currentOffsetPx = assignment.multiFlightOffsetPx ?? 0;
        return {
          ...assignment,
          points: [
            {
              cx: previousBoundary.point.cx - currentOffsetPx,
              cy: previousBoundary.point.cy
            },
            ...assignment.points.slice(1)
          ]
        };
      });
      if (typeof smoothEntryRadiusPx === "number") {
        finalizedAssignments = this.applyAirShowPhaseMotionBudgets(
          this.smoothAirShowAssignmentEntries(
            finalizedAssignments,
            this.clamp(Math.round(smoothEntryRadiusPx * 0.9), 42, 68)
          ),
          durationMs,
          roleTargetSpeeds
        );
      }
    }
    if (options.sanitizeEntryTurns) {
      let sanitizedAssignmentsChanged = false;
      const sanitizedAssignments = finalizedAssignments.map((assignment) => {
        if (assignment.points.length < 4) {
          return assignment;
        }
        const sanitizedPoints = this.sanitizeAirShowEntryPath(assignment.points, {
          maxTurnDeg: options.sanitizeEntryTurnLimitDeg ?? 42,
          strongTurnDeg: options.sanitizeEntryStrongTurnDeg ?? 84,
          maxFirstSegmentPx: options.sanitizeEntryMaxFirstSegmentPx ?? 92,
          maxSharpTurnDeg: options.sanitizeEntryMaxSharpTurnDeg ?? 108,
          maxWaypointsToRemove: options.sanitizeEntryMaxWaypointsToRemove ?? 4
        });
        if (sanitizedPoints.length < 2 || sanitizedPoints === assignment.points) {
          return assignment;
        }
        if (sanitizedPoints.length !== assignment.points.length) {
          sanitizedAssignmentsChanged = true;
        } else if (
          sanitizedPoints.some((point, index) => {
            const originalPoint = assignment.points[index];
            return !originalPoint || Math.hypot(point.cx - originalPoint.cx, point.cy - originalPoint.cy) > 0.5;
          })
        ) {
          sanitizedAssignmentsChanged = true;
        }
        return {
          ...assignment,
          points: sanitizedPoints
        };
      });
      if (sanitizedAssignmentsChanged) {
        finalizedAssignments = this.applyAirShowPhaseMotionBudgets(
          sanitizedAssignments,
          durationMs,
          roleTargetSpeeds
        );
      }
    }
    return finalizedAssignments;
  }

  private shapeCompactAirShowMergeAssignments(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number
  ): AirShowPhaseAssignment[] {
    if (durationMs <= 0 || assignments.length <= 0) {
      return [...assignments];
    }
    const visibleBounds = this.resolveAirShowVisibleBounds();
    const visibleWidthPx =
      visibleBounds
        ? Math.max(0, visibleBounds.maxX - visibleBounds.minX)
        : Number.POSITIVE_INFINITY;
    if (visibleWidthPx > 1500) {
      return [...assignments];
    }
    const midpointTimeMs = Math.round(durationMs * 0.5);
    const midpointProgress = 0.72;
    return assignments.map((assignment) => {
      if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
        return assignment;
      }
      if (assignment.points.length < 2) {
        return assignment;
      }
      return {
        ...assignment,
        progressTimeline: [
          { timeMs: 0, progress: 0 },
          { timeMs: midpointTimeMs, progress: midpointProgress },
          { timeMs: durationMs, progress: 1 }
        ]
      };
    });
  }

  private resolveAirShowPhaseDurationFromRoleSpeeds(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number>,
    fallbackMs: number,
    minMs: number,
    maxMs: number,
    primaryRoles?: ReadonlyArray<AirShowRuntimeActor["role"]>
  ): number {
    const rolesToMeasure =
      primaryRoles?.filter((role) => roleTargetSpeeds.has(role))
      ?? Array.from(roleTargetSpeeds.keys());
    const candidateDurations = rolesToMeasure
      .map((role) => {
        const targetSpeedPxPerMs = roleTargetSpeeds.get(role) ?? 0;
        if (targetSpeedPxPerMs <= 0) {
          return null;
        }
        const relevantAssignments = assignments.filter((assignment) => assignment.actor.role === role);
        if (relevantAssignments.length === 0) {
          return null;
        }
        const longestPathLengthPx = relevantAssignments.reduce(
          (longest, assignment) => Math.max(longest, this.measureAirShowPathLength(assignment.points)),
          0
        );
        if (!Number.isFinite(longestPathLengthPx) || longestPathLengthPx <= 0) {
          return null;
        }
        return longestPathLengthPx / targetSpeedPxPerMs;
      })
      .filter((durationMs): durationMs is number => typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0);

    if (candidateDurations.length === 0) {
      return this.clamp(fallbackMs, minMs, maxMs);
    }

    return this.clamp(Math.round(Math.max(...candidateDurations)), minMs, maxMs);
  }

  private resolveAirShowRolePhaseDurationMs(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    roles: ReadonlyArray<AirShowRuntimeActor["role"]>,
    targetSpeedPxPerMs: number,
    fallbackMs: number,
    minMs: number,
    maxMs: number
  ): number {
    const relevantAssignments = assignments.filter((assignment) => roles.includes(assignment.actor.role));
    if (relevantAssignments.length === 0 || targetSpeedPxPerMs <= 0) {
      return this.clamp(fallbackMs, minMs, maxMs);
    }
    const meanPathLengthPx =
      relevantAssignments.reduce((sum, assignment) => sum + this.measureAirShowPathLength(assignment.points), 0)
      / relevantAssignments.length;
    if (!Number.isFinite(meanPathLengthPx) || meanPathLengthPx <= 0) {
      return this.clamp(fallbackMs, minMs, maxMs);
    }
    return this.clamp(Math.round(meanPathLengthPx / targetSpeedPxPerMs), minMs, maxMs);
  }

  private resolveAirShowFighterPhaseDurationMs(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    fallbackMs: number,
    minMs: number,
    maxMs: number
  ): number {
    return this.resolveAirShowRolePhaseDurationMs(
      assignments,
      ["interceptor", "escort"],
      HexMapRenderer.AIR_SHOW_FIGHTER_SPEED_PX_PER_MS,
      fallbackMs,
      minMs,
      maxMs
    );
  }

  private resolveAirShowBomberPhaseDurationMs(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    fallbackMs: number,
    minMs: number,
    maxMs: number
  ): number {
    const bomberAssignments = assignments.filter((assignment) => assignment.actor.role === "bomber");
    if (bomberAssignments.length === 0) {
      return this.clamp(fallbackMs, minMs, maxMs);
    }
    const longestPathLengthPx = bomberAssignments.reduce((longest, assignment) => {
      return Math.max(longest, this.measureAirShowPathLength(assignment.points));
    }, 0);
    if (!Number.isFinite(longestPathLengthPx) || longestPathLengthPx <= 0) {
      return this.clamp(fallbackMs, minMs, maxMs);
    }
    return this.clamp(
      Math.round(longestPathLengthPx / HexMapRenderer.AIR_SHOW_BOMBER_SPEED_PX_PER_MS),
      minMs,
      maxMs
    );
  }

  private sampleAirShowAssignmentAtProgress(
    assignment: AirShowPhaseAssignment,
    progress: number
  ): Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size"> {
    const clampedProgress = this.clamp(progress, 0, 1);
    // Preserve exact phase boundaries so one phase hands off to the next without
    // teleport gaps while still allowing slight intra-phase formation staggering.
    const progressOffsetWeight =
      clampedProgress <= 0 || clampedProgress >= 1
        ? 0
        : Math.sin(clampedProgress * Math.PI);
    const sample = this.sampleAircraftWaypointPath(
      assignment.points,
      this.clamp(
        clampedProgress + (assignment.progressOffset ?? 0) * progressOffsetWeight,
        0,
        1
      )
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

  private resolveAirShowAssignmentPathProgressAtTime(
    assignment: AirShowPhaseAssignment,
    timeMs: number,
    durationMs: number,
    phaseProgressOverride?: number
  ): number {
    const clampedTimeMs = this.clamp(timeMs, 0, Math.max(0, durationMs));
    const timeline = assignment.progressTimeline;
    if (Array.isArray(timeline) && timeline.length >= 2) {
      const sortedTimeline = [...timeline].sort((left, right) => left.timeMs - right.timeMs);
      const first = sortedTimeline[0];
      const last = sortedTimeline[sortedTimeline.length - 1];
      if (first && clampedTimeMs <= first.timeMs) {
        return this.clamp(first.progress, 0, 1);
      }
      if (last && clampedTimeMs >= last.timeMs) {
        return this.clamp(last.progress, 0, 1);
      }
      for (let index = 1; index < sortedTimeline.length; index += 1) {
        const previous = sortedTimeline[index - 1];
        const current = sortedTimeline[index];
        if (!previous || !current || clampedTimeMs > current.timeMs) {
          continue;
        }
        const segmentDurationMs = Math.max(1, current.timeMs - previous.timeMs);
        const segmentProgress = this.clamp((clampedTimeMs - previous.timeMs) / segmentDurationMs, 0, 1);
        return this.clamp(
          previous.progress + (current.progress - previous.progress) * segmentProgress,
          0,
          1
        );
      }
    }
    if (
      typeof phaseProgressOverride === "number"
      && Number.isFinite(phaseProgressOverride)
    ) {
      return this.clamp(phaseProgressOverride, 0, 1);
    }
    return this.clamp(clampedTimeMs / Math.max(1, durationMs), 0, 1);
  }

  private sampleAirShowAssignmentAtTime(
    assignment: AirShowPhaseAssignment,
    timeMs: number,
    durationMs: number,
    phaseProgressOverride?: number
  ): Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size"> & { pathProgress: number } {
    const pathProgress = this.resolveAirShowAssignmentPathProgressAtTime(
      assignment,
      timeMs,
      durationMs,
      phaseProgressOverride
    );
    return {
      ...this.sampleAirShowAssignmentAtProgress(assignment, pathProgress),
      pathProgress
    };
  }

  private resolveAirShowAssignmentActiveDurationMs(
    assignment: AirShowPhaseAssignment,
    phaseDurationMs: number
  ): number {
    if (phaseDurationMs <= 0 || assignment.points.length <= 1) {
      return 0;
    }
    const timeline = assignment.progressTimeline;
    if (!Array.isArray(timeline) || timeline.length < 2) {
      return phaseDurationMs;
    }
    const sortedTimeline = [...timeline]
      .filter((keyframe) =>
        Number.isFinite(keyframe.timeMs) && Number.isFinite(keyframe.progress)
      )
      .sort((left, right) => left.timeMs - right.timeMs);
    if (sortedTimeline.length < 2) {
      return phaseDurationMs;
    }
    const progressEpsilon = 0.0001;
    let activeStartMs: number | null = null;
    let activeEndMs: number | null = null;
    for (let index = 1; index < sortedTimeline.length; index += 1) {
      const previous = sortedTimeline[index - 1];
      const current = sortedTimeline[index];
      if (!previous || !current) {
        continue;
      }
      if (Math.abs(current.progress - previous.progress) <= progressEpsilon) {
        continue;
      }
      if (activeStartMs === null) {
        activeStartMs = this.clamp(previous.timeMs, 0, phaseDurationMs);
      }
      activeEndMs = this.clamp(current.timeMs, 0, phaseDurationMs);
    }
    if (activeStartMs === null || activeEndMs === null) {
      return 0;
    }
    return Math.max(0, activeEndMs - activeStartMs);
  }

  private resolveAirShowAssignmentTraversedPathLengthPx(
    assignment: AirShowPhaseAssignment,
    phaseDurationMs: number
  ): number {
    if (assignment.points.length < 2) {
      return 0;
    }
    const startProgress = this.resolveAirShowAssignmentPathProgressAtTime(
      assignment,
      0,
      phaseDurationMs,
      0
    );
    const endProgress = this.resolveAirShowAssignmentPathProgressAtTime(
      assignment,
      phaseDurationMs,
      phaseDurationMs,
      1
    );
    if (endProgress <= startProgress + 0.0001) {
      return 0;
    }
    return this.measureAirShowRenderedPathLength(assignment.points, startProgress, endProgress);
  }

  private isAirShowPointWithinMapBounds(
    point: AirShowPoint,
    mapBounds: AirShowMapBounds,
    marginPx = 0
  ): boolean {
    return (
      point.cx >= mapBounds.minX - marginPx
      && point.cx <= mapBounds.maxX + marginPx
      && point.cy >= mapBounds.minY - marginPx
      && point.cy <= mapBounds.maxY + marginPx
    );
  }

  private resolveAirShowVisibleBounds(): AirShowMapBounds | null {
    const viewBox = this.svgElement?.viewBox?.baseVal;
    if (viewBox && Number.isFinite(viewBox.width) && Number.isFinite(viewBox.height) && viewBox.width > 0 && viewBox.height > 0) {
      try {
        const matrix = this.resolveViewportRootMatrix();
        const scaleX = matrix.a;
        const scaleY = matrix.d;
        if (Math.abs(scaleX) > 0.0001 && Math.abs(scaleY) > 0.0001) {
          const minX = (viewBox.x - matrix.e) / scaleX;
          const maxX = (viewBox.x + viewBox.width - matrix.e) / scaleX;
          const minY = (viewBox.y - matrix.f) / scaleY;
          const maxY = (viewBox.y + viewBox.height - matrix.f) / scaleY;
          return {
            minX: Math.min(minX, maxX),
            maxX: Math.max(minX, maxX),
            minY: Math.min(minY, maxY),
            maxY: Math.max(minY, maxY)
          };
        }
      } catch (error) {
        console.warn("[HexMapRenderer] Falling back to static airshow bounds; viewport transform could not be resolved.", error);
      }
      return {
        minX: viewBox.x,
        maxX: viewBox.x + viewBox.width,
        minY: viewBox.y,
        maxY: viewBox.y + viewBox.height
      };
    }
    const rawViewBox = this.svgElement?.getAttribute("viewBox");
    if (rawViewBox) {
      const values = rawViewBox
        .trim()
        .split(/[ ,]+/)
        .map((value) => Number.parseFloat(value))
        .filter((value) => Number.isFinite(value));
      if (values.length === 4) {
        const [x, y, width, height] = values;
        if (
          typeof x === "number"
          && typeof y === "number"
          && typeof width === "number"
          && typeof height === "number"
          && width > 0
          && height > 0
        ) {
          try {
            const matrix = this.resolveViewportRootMatrix();
            const scaleX = matrix.a;
            const scaleY = matrix.d;
            if (Math.abs(scaleX) > 0.0001 && Math.abs(scaleY) > 0.0001) {
              const minX = (x - matrix.e) / scaleX;
              const maxX = (x + width - matrix.e) / scaleX;
              const minY = (y - matrix.f) / scaleY;
              const maxY = (y + height - matrix.f) / scaleY;
              return {
                minX: Math.min(minX, maxX),
                maxX: Math.max(minX, maxX),
                minY: Math.min(minY, maxY),
                maxY: Math.max(minY, maxY)
              };
            }
          } catch (error) {
            console.warn("[HexMapRenderer] Falling back to static raw viewBox airshow bounds; viewport transform could not be resolved.", error);
          }
          return {
            minX: x,
            maxX: x + width,
            minY: y,
            maxY: y + height
          };
        }
      }
    }
    if (this.mapPixelWidth > 0 && this.mapPixelHeight > 0) {
      return {
        minX: 0,
        maxX: this.mapPixelWidth,
        minY: 0,
        maxY: this.mapPixelHeight
      };
    }
    const widthAttr = Number.parseFloat(this.svgElement?.getAttribute("width") ?? "");
    const heightAttr = Number.parseFloat(this.svgElement?.getAttribute("height") ?? "");
    if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr) && widthAttr > 0 && heightAttr > 0) {
      return {
        minX: 0,
        maxX: widthAttr,
        minY: 0,
        maxY: heightAttr
      };
    }
    return this.resolveAirShowMapBounds();
  }

  private resolveAirShowAssignmentFirstMapEntryTimeMs(
    assignment: AirShowPhaseAssignment,
    durationMs: number,
    mapBounds: AirShowMapBounds
  ): number | null {
    if (durationMs <= 0) {
      return null;
    }
    const initialSample = this.sampleAirShowAssignmentAtTime(assignment, 0, durationMs);
    if (this.isAirShowPointWithinMapBounds(initialSample.position, mapBounds)) {
      return 0;
    }
    const sampleCount = Math.max(24, Math.min(180, Math.round(durationMs / 24)));
    let previousTimeMs = 0;
    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
      const sampleTimeMs = (durationMs * sampleIndex) / sampleCount;
      const sample = this.sampleAirShowAssignmentAtTime(assignment, sampleTimeMs, durationMs);
      if (!this.isAirShowPointWithinMapBounds(sample.position, mapBounds)) {
        previousTimeMs = sampleTimeMs;
        continue;
      }
      let lowMs = previousTimeMs;
      let highMs = sampleTimeMs;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const midMs = (lowMs + highMs) * 0.5;
        const midSample = this.sampleAirShowAssignmentAtTime(assignment, midMs, durationMs);
        if (this.isAirShowPointWithinMapBounds(midSample.position, mapBounds)) {
          highMs = midMs;
        } else {
          lowMs = midMs;
        }
      }
      return Math.round(highMs);
    }
    return null;
  }

  private resolveAirShowRoleMapEntryTimeMs(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    mapBounds: AirShowMapBounds,
    role: AirShowRuntimeActor["role"],
    strategy: "earliest" | "latest" = "earliest"
  ): number | null {
    const times = assignments
      .filter((assignment) => assignment.actor.role === role)
      .map((assignment) => this.resolveAirShowAssignmentFirstMapEntryTimeMs(assignment, durationMs, mapBounds))
      .filter((timeMs): timeMs is number => typeof timeMs === "number" && Number.isFinite(timeMs));
    if (times.length <= 0) {
      return null;
    }
    return strategy === "latest" ? Math.max(...times) : Math.min(...times);
  }

  private resolveAirShowAssignmentPathBudgetPx(
    assignment: AirShowPhaseAssignment,
    durationMs: number,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number>
  ): number {
    const explicitBudgetPx =
      typeof assignment.distanceBudgetPx === "number" && Number.isFinite(assignment.distanceBudgetPx)
        ? assignment.distanceBudgetPx
        : null;
    if (explicitBudgetPx !== null) {
      return Math.max(0, explicitBudgetPx);
    }
    const roleTargetSpeedPxPerMs = roleTargetSpeeds.get(assignment.actor.role) ?? 0;
    return Math.max(0, roleTargetSpeedPxPerMs * Math.max(0, durationMs));
  }

  private sliceAirShowPathByProgressRange(
    points: ReadonlyArray<AirShowPoint>,
    startProgress: number,
    endProgress = 1
  ): AirShowPoint[] {
    if (points.length <= 0) {
      return [];
    }
    const clampedStart = this.clamp(startProgress, 0, 1);
    const clampedEnd = this.clamp(endProgress, clampedStart, 1);
    if (clampedStart <= 0 && clampedEnd >= 1) {
      return [...points];
    }
    const deltaProgress = clampedEnd - clampedStart;
    if (deltaProgress <= 0.0001) {
      const sample = this.sampleAircraftWaypointPath(points, clampedEnd);
      return [sample.point, sample.point];
    }
    const sampleCount = Math.max(4, Math.ceil(deltaProgress * 12));
    const sliced: AirShowPoint[] = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const progress = clampedStart + (deltaProgress * index) / sampleCount;
      const sample = this.sampleAircraftWaypointPath(points, progress);
      const lastPoint = sliced[sliced.length - 1];
      if (!lastPoint || Math.hypot(sample.point.cx - lastPoint.cx, sample.point.cy - lastPoint.cy) > 0.5) {
        sliced.push(sample.point);
      }
    }
    if (sliced.length === 1) {
      sliced.push({ ...sliced[0]! });
    }
    return sliced;
  }

  private remapAirShowAssignmentProgressTimelineAfterTrim(
    timeline: ReadonlyArray<AirShowAssignmentProgressKeyframe> | undefined,
    trimMs: number,
    originalDurationMs: number,
    trimmedDurationMs: number,
    startProgress: number
  ): ReadonlyArray<AirShowAssignmentProgressKeyframe> | undefined {
    if (!Array.isArray(timeline) || timeline.length < 2 || trimmedDurationMs <= 0) {
      return undefined;
    }
    const normalizedTimeline: AirShowAssignmentProgressKeyframe[] = [
      { timeMs: 0, progress: 0 }
    ];
    const remainingProgress = Math.max(0.0001, 1 - startProgress);
    timeline
      .filter((keyframe) => keyframe.timeMs > trimMs && keyframe.timeMs < originalDurationMs)
      .forEach((keyframe) => {
        normalizedTimeline.push({
          timeMs: Math.round(keyframe.timeMs - trimMs),
          progress: this.clamp((keyframe.progress - startProgress) / remainingProgress, 0, 1)
        });
      });
    normalizedTimeline.push({ timeMs: trimmedDurationMs, progress: 1 });
    return normalizedTimeline;
  }

  private trimAirShowPhaseLead(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    trimMs: number
  ): {
    durationMs: number;
    assignments: AirShowPhaseAssignment[];
  } {
    const clampedTrimMs = this.clamp(trimMs, 0, Math.max(0, durationMs - 1));
    if (clampedTrimMs <= 0) {
      return {
        durationMs,
        assignments: [...assignments]
      };
    }
    const trimmedDurationMs = Math.max(1, Math.round(durationMs - clampedTrimMs));
    return {
      durationMs: trimmedDurationMs,
      assignments: assignments.map((assignment) => {
        const startProgress = this.resolveAirShowAssignmentPathProgressAtTime(
          assignment,
          clampedTrimMs,
          durationMs
        );
        return {
          ...assignment,
          points: this.sliceAirShowPathByProgressRange(assignment.points, startProgress, 1),
          progressTimeline: this.remapAirShowAssignmentProgressTimelineAfterTrim(
            assignment.progressTimeline,
            clampedTrimMs,
            durationMs,
            trimmedDurationMs,
            startProgress
          )
        };
      })
    };
  }

  private resolveAirShowIngressPhaseLeadTrimMs(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number
  ): number {
    if (assignments.length <= 0 || durationMs <= 0) {
      return 0;
    }
    const visibleBounds = this.resolveAirShowVisibleBounds();
    if (!visibleBounds) {
      return 0;
    }
    const preferredPackageEntryMs =
      this.resolveAirShowRoleMapEntryTimeMs(assignments, durationMs, visibleBounds, "escort", "latest")
      ?? this.resolveAirShowRoleMapEntryTimeMs(assignments, durationMs, visibleBounds, "bomber", "earliest")
      ?? this.resolveAirShowRoleMapEntryTimeMs(assignments, durationMs, visibleBounds, "interceptor", "earliest");
    if (preferredPackageEntryMs === null) {
      return 0;
    }
    const desiredVisibleLeadMs = 220;
    return this.clamp(preferredPackageEntryMs - desiredVisibleLeadMs, 0, Math.max(0, durationMs - 260));
  }

  private ensureAirShowPointOutsideVisibleBounds(
    point: AirShowPoint,
    mapBounds: AirShowMapBounds,
    outward: { x: number; y: number },
    marginPx = 22
  ): AirShowPoint {
    let adjusted = { ...point };
    let attempts = 0;
    while (attempts < 12 && this.isAirShowPointWithinMapBounds(adjusted, mapBounds, marginPx)) {
      adjusted = {
        cx: adjusted.cx + outward.x * marginPx,
        cy: adjusted.cy + outward.y * marginPx
      };
      attempts += 1;
    }
    return adjusted;
  }

  private extendAirShowPathOffscreenForDelay(
    points: ReadonlyArray<AirShowPoint>,
    extraDistancePx: number,
    mapBounds: AirShowMapBounds
  ): AirShowPoint[] {
    if (points.length < 2 || extraDistancePx <= 1) {
      return [...points];
    }

    const start = points[0]!;
    const next = points[1]!;
    const viewCenter = {
      cx: (mapBounds.minX + mapBounds.maxX) * 0.5,
      cy: (mapBounds.minY + mapBounds.maxY) * 0.5
    };
    const outward = this.normalizeAircraftVector(
      start.cx - viewCenter.cx,
      start.cy - viewCenter.cy,
      start.cx - next.cx,
      start.cy - next.cy
    );
    const travel = this.normalizeAircraftVector(
      next.cx - start.cx,
      next.cy - start.cy,
      outward.x,
      outward.y
    );
    const normal = { x: -travel.y, y: travel.x };
    const sideSign =
      start.cx <= mapBounds.minX
        ? -1
        : start.cx >= mapBounds.maxX
          ? 1
          : start.cy <= mapBounds.minY
            ? -1
            : 1;
    const legAForwardPx = Math.max(28, Math.min(180, extraDistancePx * 0.32));
    const legBForwardPx = Math.max(72, Math.min(340, extraDistancePx * 0.82));
    const legCForwardPx = Math.max(124, Math.min(520, extraDistancePx * 1.34));
    const legLateralPx = Math.max(18, Math.min(148, extraDistancePx * 0.26));
    const detourA = this.ensureAirShowPointOutsideVisibleBounds(
      {
        cx: start.cx + outward.x * legAForwardPx + normal.x * sideSign * legLateralPx,
        cy: start.cy + outward.y * legAForwardPx + normal.y * sideSign * legLateralPx
      },
      mapBounds,
      outward
    );
    const detourB = this.ensureAirShowPointOutsideVisibleBounds(
      {
        cx: start.cx + outward.x * legBForwardPx - normal.x * sideSign * legLateralPx * 0.7,
        cy: start.cy + outward.y * legBForwardPx - normal.y * sideSign * legLateralPx * 0.7
      },
      mapBounds,
      outward
    );
    const detourC = this.ensureAirShowPointOutsideVisibleBounds(
      {
        cx: start.cx + outward.x * legCForwardPx + normal.x * sideSign * legLateralPx * 0.4,
        cy: start.cy + outward.y * legCForwardPx + normal.y * sideSign * legLateralPx * 0.4
      },
      mapBounds,
      outward
    );
    return [start, detourA, detourB, detourC, ...points.slice(1)];
  }

  private harmonizeContestedIngressAssignmentsByVisibility(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    roleTargetSpeeds: ReadonlyMap<AirShowRuntimeActor["role"], number>
  ): AirShowPhaseAssignment[] {
    if (assignments.length <= 0 || durationMs <= 0) {
      return [...assignments];
    }
    const visibleBounds = this.resolveAirShowVisibleBounds();
    if (!visibleBounds) {
      return [...assignments];
    }
    const earliestInterceptorEntryMs = this.resolveAirShowRoleMapEntryTimeMs(
      assignments,
      durationMs,
      visibleBounds,
      "interceptor",
      "earliest"
    );
    const earliestEscortEntryMs = this.resolveAirShowRoleMapEntryTimeMs(
      assignments,
      durationMs,
      visibleBounds,
      "escort",
      "earliest"
    );
    if (
      earliestInterceptorEntryMs === null
      || earliestEscortEntryMs === null
      || earliestInterceptorEntryMs + 36 >= earliestEscortEntryMs
    ) {
      return [...assignments];
    }

    const desiredDelayMs = earliestEscortEntryMs + 36 - earliestInterceptorEntryMs;
    const interceptorSpeedPxPerMs =
      roleTargetSpeeds.get("interceptor") ?? HexMapRenderer.AIR_SHOW_FIGHTER_SPEED_PX_PER_MS;

    const adjustedAssignments = assignments.map((assignment) => {
      if (assignment.actor.role !== "interceptor") {
        return assignment;
      }
      const targetPathLengthPx = this.resolveAirShowAssignmentPathBudgetPx(
        assignment,
        durationMs,
        roleTargetSpeeds
      );
      if (!Number.isFinite(targetPathLengthPx) || targetPathLengthPx <= 1) {
        return assignment;
      }
      const clampedDelayMs = this.clamp(
        desiredDelayMs,
        0,
        Math.max(0, durationMs - 420)
      );
      if (clampedDelayMs <= 1) {
        return assignment;
      }
      const reachableDistancePx = interceptorSpeedPxPerMs * Math.max(1, durationMs - clampedDelayMs);
      const endProgress = this.clamp(reachableDistancePx / targetPathLengthPx, 0.04, 1);
      return {
        ...assignment,
        progressTimeline: [
          { timeMs: 0, progress: 0 },
          { timeMs: Math.round(clampedDelayMs), progress: 0 },
          { timeMs: durationMs, progress: endProgress }
        ]
      };
    });

    const finalInterceptorEntryMs = this.resolveAirShowRoleMapEntryTimeMs(
      adjustedAssignments,
      durationMs,
      visibleBounds,
      "interceptor",
      "earliest"
    );
    debugAirShowPhase("IngressVisibilityHarmonized", {
      earliestInterceptorEntryMs,
      earliestEscortEntryMs,
      finalInterceptorEntryMs: finalInterceptorEntryMs ?? null
    });
    return adjustedAssignments;
  }

  private buildAirShowAssignmentLookup(
    assignments: ReadonlyArray<AirShowPhaseAssignment>
  ): Map<string, AirShowPhaseAssignment> {
    return new Map(assignments.map((assignment) => [assignment.actor.id, assignment] as const));
  }

  private resolveAirShowAssignmentBoundaryState(
    assignment: AirShowPhaseAssignment,
    durationMs: number,
    edge: "start" | "end"
  ): {
    point: AirShowPoint;
    forward: { x: number; y: number };
    headingDegrees: number;
  } | null {
    if (assignment.points.length < 2) {
      return null;
    }
    const totalDurationMs = Math.max(1, durationMs);
    const boundaryTimeMs = edge === "start" ? 0 : totalDurationMs;
    const sampleWindowMs = this.clamp(Math.round(totalDurationMs * 0.12), 24, 180);
    const referenceTimeMs =
      edge === "start"
        ? this.clamp(sampleWindowMs, 0, totalDurationMs)
        : this.clamp(totalDurationMs - sampleWindowMs, 0, totalDurationMs);
    const boundarySample = this.sampleAirShowAssignmentAtTime(
      assignment,
      boundaryTimeMs,
      totalDurationMs,
      edge === "start" ? 0 : 1
    );
    const referenceSample = this.sampleAirShowAssignmentAtTime(
      assignment,
      referenceTimeMs,
      totalDurationMs
    );
    const fallbackForward = this.resolveAirShowHeadingVector(boundarySample.headingDegrees);
    const forwardDx =
      edge === "start"
        ? referenceSample.position.cx - boundarySample.position.cx
        : boundarySample.position.cx - referenceSample.position.cx;
    const forwardDy =
      edge === "start"
        ? referenceSample.position.cy - boundarySample.position.cy
        : boundarySample.position.cy - referenceSample.position.cy;
    const resolvedHeadingDegrees =
      Math.hypot(forwardDx, forwardDy) > 0.5
        ? this.resolveAircraftHeadingDegrees(forwardDx, forwardDy, boundarySample.headingDegrees)
        : boundarySample.headingDegrees;
    return {
      point: {
        cx: boundarySample.position.cx,
        cy: boundarySample.position.cy
      },
      forward: this.normalizeAircraftVector(forwardDx, forwardDy, fallbackForward.x, fallbackForward.y),
      headingDegrees: resolvedHeadingDegrees
    };
  }

  private harmonizeAirShowPhaseEntryWithPreviousPhase(
    previousAssignments: ReadonlyArray<AirShowPhaseAssignment>,
    previousDurationMs: number,
    currentAssignments: ReadonlyArray<AirShowPhaseAssignment>,
    currentDurationMs: number,
    maxTurnDeg = 108,
    directTurnHomeRoles: ReadonlySet<AirShowRuntimeActor["role"]> = new Set()
  ): AirShowPhaseAssignment[] {
    const previousAssignmentsByActorId = this.buildAirShowAssignmentLookup(previousAssignments);
    const preserveBridgeEntryActorIds = new Set<string>();
    const resolvePathEntryTurnDeg = (
      start: AirShowPoint,
      previousForward: { x: number; y: number },
      points: ReadonlyArray<AirShowPoint>
    ): number => {
      const first = points.find((point) => Math.hypot(point.cx - start.cx, point.cy - start.cy) > 0.5);
      if (!first) {
        return 0;
      }
      const second =
        points.find((point) =>
          point !== first && Math.hypot(point.cx - first.cx, point.cy - first.cy) > 0.5
        )
        ?? first;
      const startVector = {
        x: first.cx - start.cx,
        y: first.cy - start.cy
      };
      const entryTurnDeg = this.resolveAirShowVectorAngleDegrees(previousForward, startVector);
      if (second === first) {
        return entryTurnDeg;
      }
      const firstWaypointTurnDeg = this.resolveAirShowWaypointTurnDegrees(start, first, second);
      return Math.max(entryTurnDeg, firstWaypointTurnDeg * 0.6);
    };
    const chooseBestEntryPath = (
      start: AirShowPoint,
      previousForward: { x: number; y: number },
      candidatePaths: ReadonlyArray<ReadonlyArray<AirShowPoint>>
    ): AirShowPoint[] | null => {
      const viablePaths = candidatePaths.filter((path) => path.length >= 2);
      if (viablePaths.length <= 0) {
        return null;
      }
      let best = [...viablePaths[0]!];
      for (const candidate of viablePaths.slice(1)) {
        const bestTurnDeg = resolvePathEntryTurnDeg(start, previousForward, best);
        const candidateTurnDeg = resolvePathEntryTurnDeg(start, previousForward, candidate);
        if (candidateTurnDeg < bestTurnDeg) {
          best = [...candidate];
        }
      }
      return best;
    };
    const contestedInterceptorRolesPresent =
      currentAssignments.some((candidate) => candidate.actor.role === "interceptor")
      || previousAssignments.some((candidate) => candidate.actor.role === "interceptor");
    const adjustedAssignments = currentAssignments.map((assignment) => {
      const previousAssignment = previousAssignmentsByActorId.get(assignment.actor.id);
      if (!previousAssignment || assignment.points.length < 2 || previousAssignment.points.length < 2) {
        return assignment;
      }
      const previousBoundary = this.resolveAirShowAssignmentBoundaryState(
        previousAssignment,
        previousDurationMs,
        "end"
      );
      const currentBoundary = this.resolveAirShowAssignmentBoundaryState(
        assignment,
        currentDurationMs,
        "start"
      );
      const currentStart = assignment.points[0];
      const currentFirst = assignment.points[1];
      if (!previousBoundary || !currentBoundary || !currentStart || !currentFirst) {
        return assignment;
      }
      const currentForward = this.normalizeAircraftVector(
        currentFirst.cx - currentStart.cx,
        currentFirst.cy - currentStart.cy,
        currentBoundary.forward.x,
        currentBoundary.forward.y
      );
      const startCarryDistancePx = Math.hypot(
        previousBoundary.point.cx - currentBoundary.point.cx,
        previousBoundary.point.cy - currentBoundary.point.cy
      );
      const entryTurnDeg = this.resolveAirShowVectorAngleDegrees(previousBoundary.forward, currentForward);
      const strongBoundaryShock = entryTurnDeg > Math.max(maxTurnDeg + 4, 98);
      if (startCarryDistancePx <= 1 && entryTurnDeg <= maxTurnDeg) {
        return assignment;
      }
      const originalFirstSegmentPx = Math.hypot(
        currentFirst.cx - currentStart.cx,
        currentFirst.cy - currentStart.cy
      );
      const firstSegmentPx = this.clamp(originalFirstSegmentPx, 18, 84);
      if (!Number.isFinite(firstSegmentPx) || firstSegmentPx < 6) {
        return assignment;
      }
      const currentOffsetPx = assignment.multiFlightOffsetPx ?? 0;
      const alignedStartPoint = {
        cx: previousBoundary.point.cx - currentOffsetPx,
        cy: previousBoundary.point.cy
      };
      let bridgeTargetIndex = assignment.points.length >= 4 ? 2 : 1;
      let bridgeTarget = assignment.points[bridgeTargetIndex] ?? currentFirst;
      let routeToTarget = {
        x: bridgeTarget.cx - alignedStartPoint.cx,
        y: bridgeTarget.cy - alignedStartPoint.cy
      };
      let routeForward = this.normalizeAircraftVector(
        routeToTarget.x,
        routeToTarget.y,
        currentForward.x,
        currentForward.y
      );
      let routeAlignment =
        previousBoundary.forward.x * routeForward.x + previousBoundary.forward.y * routeForward.y;
      const finalTarget = assignment.points[assignment.points.length - 1] ?? bridgeTarget;
      const overallRouteToTarget = {
        x: finalTarget.cx - alignedStartPoint.cx,
        y: finalTarget.cy - alignedStartPoint.cy
      };
      const overallRouteForward = this.normalizeAircraftVector(
        overallRouteToTarget.x,
        overallRouteToTarget.y,
        routeForward.x,
        routeForward.y
      );
      const overallRouteAlignment =
        previousBoundary.forward.x * overallRouteForward.x + previousBoundary.forward.y * overallRouteForward.y;
      if (
        contestedInterceptorRolesPresent
        && (overallRouteAlignment <= 0.24 || routeAlignment <= 0.18 || strongBoundaryShock)
        && directTurnHomeRoles.has(assignment.actor.role)
      ) {
        const turnHomeCross =
          previousBoundary.forward.x * overallRouteToTarget.y
          - previousBoundary.forward.y * overallRouteToTarget.x;
        const preferredTurnSign = turnHomeCross >= 0 ? 1 : -1;
        const turnHomePath = chooseBestEntryPath(
          alignedStartPoint,
          previousBoundary.forward,
          [preferredTurnSign, -preferredTurnSign].map((turnSign) =>
            this.softenAirShowEntryWindowTurns(
              this.sanitizeAirShowEntryPath(
                this.buildAirShowDisengagePath(alignedStartPoint, finalTarget, {
                  startHeadingDegrees: previousBoundary.headingDegrees,
                  lateralSign: turnSign,
                  corridorWidthPx: 12,
                  driftPx: 8,
                  preferForwardContinuous: true
                }),
                {
                  maxTurnDeg: 42,
                  strongTurnDeg: 84,
                  maxFirstSegmentPx: 76,
                  maxSharpTurnDeg: 104,
                  maxWaypointsToRemove: 2
                }
              ),
              strongBoundaryShock ? 132 : 104,
              {
                maxWaypointsToRemove: strongBoundaryShock ? 1 : 2,
                entryWaypointCount: strongBoundaryShock ? 5 : 4,
                blendRangeDeg: strongBoundaryShock ? 40 : 24,
                minBlendFactor: strongBoundaryShock ? 0.36 : 0.52,
                maxBlendFactor: strongBoundaryShock ? 0.68 : 0.84
              }
            )
          )
        ) ?? [];
        if (turnHomePath.length >= 2) {
          preserveBridgeEntryActorIds.add(assignment.actor.id);
          return {
            ...assignment,
            points: turnHomePath
          };
        }
      }
      if (overallRouteAlignment <= -0.2 && directTurnHomeRoles.has(assignment.actor.role) && assignment.points.length >= 4) {
        bridgeTargetIndex =
          assignment.points.length <= 4
            ? assignment.points.length - 1
            : this.clamp(
                Math.round((assignment.points.length - 1) * (assignment.points.length >= 7 ? 0.55 : 0.5)),
                3,
                assignment.points.length - 1
              );
        bridgeTarget = assignment.points[bridgeTargetIndex] ?? bridgeTarget;
        routeToTarget = {
          x: bridgeTarget.cx - alignedStartPoint.cx,
          y: bridgeTarget.cy - alignedStartPoint.cy
        };
        routeForward = this.normalizeAircraftVector(
          routeToTarget.x,
          routeToTarget.y,
          currentForward.x,
          currentForward.y
        );
        routeAlignment =
          previousBoundary.forward.x * routeForward.x + previousBoundary.forward.y * routeForward.y;
        preserveBridgeEntryActorIds.add(assignment.actor.id);
      }
      const routeCross = previousBoundary.forward.x * routeToTarget.y - previousBoundary.forward.y * routeToTarget.x;
      const preferredBridgeSign = routeCross >= 0 ? 1 : -1;
      const carryForwardPx =
        preserveBridgeEntryActorIds.has(assignment.actor.id)
          ? this.clamp(
              Math.round(
                Math.max(
                  firstSegmentPx * 0.84,
                  startCarryDistancePx * 0.4
                )
              ),
              28,
              84
            )
          : this.clamp(Math.round(Math.max(firstSegmentPx, startCarryDistancePx * 0.42)), 24, 88);
      const bridgePoints =
        chooseBestEntryPath(
          alignedStartPoint,
          previousBoundary.forward,
          [preferredBridgeSign, -preferredBridgeSign].map((bridgeSign) =>
            this.buildAirShowPhaseEntryBridge(alignedStartPoint, bridgeTarget, {
              startHeadingDegrees: previousBoundary.headingDegrees,
              sideSign: bridgeSign,
              carryForwardPx
            })
          )
        )
        ?? this.buildAirShowPhaseEntryBridge(alignedStartPoint, bridgeTarget, {
          startHeadingDegrees: previousBoundary.headingDegrees,
          sideSign: preferredBridgeSign,
          carryForwardPx
        });
      const adjustedPoints = [
        alignedStartPoint,
        ...bridgePoints,
        ...assignment.points.slice(bridgeTargetIndex)
      ].filter((point, index, points) => {
        if (index === 0) {
          return true;
        }
        const previousPoint = points[index - 1];
        return !previousPoint || Math.hypot(point.cx - previousPoint.cx, point.cy - previousPoint.cy) > 0.5;
      });
      if (adjustedPoints.length < 2) {
        return assignment;
      }
      const isDirectTurnHomeRole = directTurnHomeRoles.has(assignment.actor.role);
      const resolvedAdjustedPoints = preserveBridgeEntryActorIds.has(assignment.actor.id)
        ? this.pruneAirShowEntryWindowSharpTurns(
            adjustedPoints,
            isDirectTurnHomeRole ? 108 : 118,
            isDirectTurnHomeRole ? 3 : 2,
            isDirectTurnHomeRole ? 5 : 4
          )
        : adjustedPoints;
      const roleScopedAdjustedPoints = isDirectTurnHomeRole
        ? this.softenAirShowEntryWindowTurns(resolvedAdjustedPoints, 108, {
            maxWaypointsToRemove: 3,
            entryWaypointCount: 5,
            blendRangeDeg: 28,
            minBlendFactor: 0.5,
            maxBlendFactor: 0.82
          })
        : resolvedAdjustedPoints;
      const finalPoints = roleScopedAdjustedPoints.length >= 2 ? roleScopedAdjustedPoints : adjustedPoints;
      return {
        ...assignment,
        points: finalPoints,
        progressTimeline: assignment.progressTimeline
      };
    });
    const smoothedAssignments = this.smoothAirShowAssignmentEntries(
      adjustedAssignments.filter((assignment) => !preserveBridgeEntryActorIds.has(assignment.actor.id)),
      Math.min(52, maxTurnDeg * 0.42)
    );
    const smoothedAssignmentsByActorId = this.buildAirShowAssignmentLookup(smoothedAssignments);
    return adjustedAssignments.map((assignment) =>
      preserveBridgeEntryActorIds.has(assignment.actor.id)
        ? assignment
        : (smoothedAssignmentsByActorId.get(assignment.actor.id) ?? assignment)
    );
  }

  private resolveAirShowSpacingWindowWeight(progress: number): number {
    const startRamp = this.clamp((progress - 0.16) / 0.2, 0, 1);
    const endRamp = this.clamp((1 - progress - 0.16) / 0.2, 0, 1);
    return startRamp * endRamp;
  }

  /**
   * Resolves collision-aware spacing across all phase assignments.
   * Enforces minimum spacing between actors from different flights during combat phases.
   * Per North Star Spec: 0.8 sprite widths (same-role), 1.0 (different-role).
   */
  private resolveAirShowPhaseSpacing(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
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
        const sampled = this.sampleAirShowAssignmentAtTime(
          assignment,
          progress * durationMs,
          durationMs
        );
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
          const boundaryWeight = this.resolveAirShowSpacingWindowWeight(pointProgress);
          const factor =
            proximityFactor * proximityFactor * boundaryWeight * boundaryWeight * 0.28;

          return {
            cx: point.cx + correctionX * factor,
            cy: point.cy + correctionY * factor
          };
        });
      }
    }

    return resolvedAssignments;
  }

  private smoothAirShowAssignmentEntries(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    maxTurnDeg = 48
  ): AirShowPhaseAssignment[] {
    return assignments.map((assignment) => {
      if (assignment.points.length < 3) {
        return assignment;
      }
      const start = assignment.points[0];
      const first = assignment.points[1];
      const second = assignment.points[2];
      if (!start || !first || !second) {
        return assignment;
      }
      const initialTurnDeg = this.resolveAirShowWaypointTurnDegrees(start, first, second);
      if (initialTurnDeg <= maxTurnDeg) {
        return assignment;
      }
      const routeDx = second.cx - start.cx;
      const routeDy = second.cy - start.cy;
      const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
      const routeForward = this.normalizeAircraftVector(routeDx, routeDy, 0, -1);
      const firstSegmentPx = Math.hypot(first.cx - start.cx, first.cy - start.cy);
      const adjustedFirstSegmentPx = Math.min(
        firstSegmentPx,
        Math.max(18, routeDistance * 0.28)
      );
      const adjustedFirstPoint = {
        cx: start.cx + routeForward.x * adjustedFirstSegmentPx,
        cy: start.cy + routeForward.y * adjustedFirstSegmentPx
      };
      const adjustedPoints = [...assignment.points];
      adjustedPoints[1] = adjustedFirstPoint;
      if (adjustedPoints.length >= 4) {
        const third = adjustedPoints[3];
        if (third) {
          const secondRouteDx = third.cx - adjustedFirstPoint.cx;
          const secondRouteDy = third.cy - adjustedFirstPoint.cy;
          const secondRouteDistance = Math.max(1, Math.hypot(secondRouteDx, secondRouteDy));
          if (
            this.resolveAirShowWaypointTurnDegrees(adjustedFirstPoint, second, third)
            > maxTurnDeg * 2.2
          ) {
            const secondForward = this.normalizeAircraftVector(secondRouteDx, secondRouteDy, 0, -1);
            adjustedPoints[2] = {
              cx:
                adjustedFirstPoint.cx +
                secondForward.x * Math.min(Math.max(28, secondRouteDistance * 0.22), secondRouteDistance * 0.54),
              cy:
                adjustedFirstPoint.cy +
                secondForward.y * Math.min(Math.max(28, secondRouteDistance * 0.22), secondRouteDistance * 0.54)
            };
          }
        }
      }
      return {
        ...assignment,
        points: adjustedPoints
      };
    });
  }

  private smoothAirShowAssignmentExits(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    maxTurnDeg = 48
  ): AirShowPhaseAssignment[] {
    return assignments.map((assignment) => {
      if (assignment.points.length < 3) {
        return assignment;
      }
      const end = assignment.points[assignment.points.length - 1];
      const penultimate = assignment.points[assignment.points.length - 2];
      const beforePenultimate = assignment.points[assignment.points.length - 3];
      if (!end || !penultimate || !beforePenultimate) {
        return assignment;
      }
      const exitTurnDeg = this.resolveAirShowWaypointTurnDegrees(beforePenultimate, penultimate, end);
      if (exitTurnDeg <= maxTurnDeg) {
        return assignment;
      }
      const routeDx = end.cx - beforePenultimate.cx;
      const routeDy = end.cy - beforePenultimate.cy;
      const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
      const routeForward = this.normalizeAircraftVector(routeDx, routeDy, 0, -1);
      const lastSegmentPx = Math.hypot(end.cx - penultimate.cx, end.cy - penultimate.cy);
      const adjustedLastSegmentPx = Math.min(
        lastSegmentPx,
        Math.max(18, routeDistance * 0.28)
      );
      const adjustedPenultimate = {
        cx: end.cx - routeForward.x * adjustedLastSegmentPx,
        cy: end.cy - routeForward.y * adjustedLastSegmentPx
      };
      const adjustedPoints = [...assignment.points];
      adjustedPoints[adjustedPoints.length - 2] = adjustedPenultimate;
      if (adjustedPoints.length >= 4) {
        const beforeTail = adjustedPoints[adjustedPoints.length - 4];
        if (beforeTail) {
          const thirdRouteDx = adjustedPenultimate.cx - beforeTail.cx;
          const thirdRouteDy = adjustedPenultimate.cy - beforeTail.cy;
          const thirdRouteDistance = Math.max(1, Math.hypot(thirdRouteDx, thirdRouteDy));
          if (
            this.resolveAirShowWaypointTurnDegrees(beforeTail, beforePenultimate, adjustedPenultimate)
            > maxTurnDeg * 2.2
          ) {
            const thirdForward = this.normalizeAircraftVector(thirdRouteDx, thirdRouteDy, 0, -1);
            adjustedPoints[adjustedPoints.length - 3] = {
              cx:
                adjustedPenultimate.cx -
                thirdForward.x * Math.min(Math.max(28, thirdRouteDistance * 0.22), thirdRouteDistance * 0.54),
              cy:
                adjustedPenultimate.cy -
                thirdForward.y * Math.min(Math.max(28, thirdRouteDistance * 0.22), thirdRouteDistance * 0.54)
            };
          }
        }
      }
      return {
        ...assignment,
        points: adjustedPoints
      };
    });
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
      minTargetHeadingDot?: number;
      maxTargetHeadingDot?: number;
      durationMs?: number;
    } = {}
  ): { sourceActor: AirShowRuntimeActor; targetActor: AirShowRuntimeActor } | null {
    const assignmentsByActorId = this.buildAirShowAssignmentLookup(assignments);
    let bestSource: AirShowRuntimeActor | null = null;
    let bestTarget: AirShowRuntimeActor | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const enforceForwardAlignment = emitter !== "center";
    const maxAlignmentDeg = enforceForwardAlignment
      ? this.clamp(constraints.maxAlignmentDeg ?? 90, 6, 90)
      : 180;
    const maxRangePx = constraints.maxRangePx ?? (emitter === "center" ? 176 : 138);
    const minTargetHeadingDot =
      typeof constraints.minTargetHeadingDot === "number" && Number.isFinite(constraints.minTargetHeadingDot)
        ? this.clamp(constraints.minTargetHeadingDot, -1, 1)
        : null;
    const maxTargetHeadingDot =
      typeof constraints.maxTargetHeadingDot === "number" && Number.isFinite(constraints.maxTargetHeadingDot)
        ? this.clamp(constraints.maxTargetHeadingDot, -1, 1)
        : null;
    const durationMs =
      typeof constraints.durationMs === "number" && Number.isFinite(constraints.durationMs) && constraints.durationMs > 0
        ? constraints.durationMs
        : null;
    const sampleAssignment = (
      assignment: AirShowPhaseAssignment,
      sampleProgress: number
    ): Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size"> =>
      durationMs
        ? this.sampleAirShowAssignmentAtTime(assignment, sampleProgress * durationMs, durationMs)
        : this.sampleAirShowAssignmentAtProgress(assignment, sampleProgress);

    sourceFlight.actors
      .filter((actor) => actor.active)
      .forEach((sourceActor) => {
        const sourceAssignment = assignmentsByActorId.get(sourceActor.id);
        if (!sourceAssignment) {
          return;
        }
        const sampledSource = sampleAssignment(sourceAssignment, progress);
        const emitterPoint = this.resolveAirShowEmitterPoint(sampledSource, emitter);
        const headingVector = enforceForwardAlignment
          ? this.resolveAirShowHeadingVector(sampledSource.headingDegrees)
          : null;

        targetFlight.actors
          .filter((actor) => actor.active)
          .forEach((targetActor) => {
            const targetAssignment = assignmentsByActorId.get(targetActor.id);
            if (!targetAssignment) {
              return;
            }
            const sampledTarget = sampleAssignment(targetAssignment, progress);
            const targetVector = {
              x: sampledTarget.position.cx - emitterPoint.cx,
              y: sampledTarget.position.cy - emitterPoint.cy
            };
            const distance = Math.hypot(targetVector.x, targetVector.y);
            if (distance < 6) {
              return;
            }
            const alignmentDeg = headingVector
              ? this.resolveAirShowVectorAngleDegrees(headingVector, targetVector)
              : 0;
            if (headingVector && (minTargetHeadingDot !== null || maxTargetHeadingDot !== null)) {
              const targetHeadingVector = this.resolveAirShowHeadingVector(sampledTarget.headingDegrees);
              const targetHeadingDot =
                headingVector.x * targetHeadingVector.x + headingVector.y * targetHeadingVector.y;
              if (minTargetHeadingDot !== null && targetHeadingDot < minTargetHeadingDot) {
                return;
              }
              if (maxTargetHeadingDot !== null && targetHeadingDot > maxTargetHeadingDot) {
                return;
              }
            }
            if ((enforceForwardAlignment && alignmentDeg > maxAlignmentDeg) || distance > maxRangePx) {
              return;
            }
            const score = enforceForwardAlignment
              ? alignmentDeg * 3.2 + distance * 0.045
              : distance;
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

  private selectClosestAirShowTracerActors(
    sourceFlight: AirShowRuntimeFlightInternal,
    targetFlight: AirShowRuntimeFlightInternal,
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    progress: number,
    emitter: "nose" | "center" = "nose",
    durationMs?: number
  ): { sourceActor: AirShowRuntimeActor; targetActor: AirShowRuntimeActor } | null {
    const assignmentsByActorId = this.buildAirShowAssignmentLookup(assignments);
    let bestSource: AirShowRuntimeActor | null = null;
    let bestTarget: AirShowRuntimeActor | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const resolvedDurationMs =
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
        ? durationMs
        : null;
    const sampleAssignment = (
      assignment: AirShowPhaseAssignment,
      sampleProgress: number
    ): Pick<AirShowRuntimeActor, "position" | "headingDegrees" | "size"> =>
      resolvedDurationMs
        ? this.sampleAirShowAssignmentAtTime(assignment, sampleProgress * resolvedDurationMs, resolvedDurationMs)
        : this.sampleAirShowAssignmentAtProgress(assignment, sampleProgress);

    sourceFlight.actors
      .filter((actor) => actor.active)
      .forEach((sourceActor) => {
        const sourceAssignment = assignmentsByActorId.get(sourceActor.id);
        if (!sourceAssignment) {
          return;
        }
        const sampledSource = sampleAssignment(sourceAssignment, progress);
        const emitterPoint = this.resolveAirShowEmitterPoint(sampledSource, emitter);
        const sourceHeading = this.resolveAirShowHeadingVector(sampledSource.headingDegrees);

        targetFlight.actors
          .filter((actor) => actor.active)
          .forEach((targetActor) => {
            const targetAssignment = assignmentsByActorId.get(targetActor.id);
            if (!targetAssignment) {
              return;
            }
            const sampledTarget = sampleAssignment(targetAssignment, progress);
            const targetVector = {
              x: sampledTarget.position.cx - emitterPoint.cx,
              y: sampledTarget.position.cy - emitterPoint.cy
            };
            const distance = Math.hypot(targetVector.x, targetVector.y);
            if (distance < 6) {
              return;
            }
            const alignmentDeg = this.resolveAirShowVectorAngleDegrees(sourceHeading, targetVector);
            const formationBias = Math.abs(sourceActor.formationIndex - targetActor.formationIndex) * 10;
            const score =
              distance
              + formationBias
              + (emitter === "nose" ? alignmentDeg * 0.32 : 0);
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
      cx: actor.position.cx + Math.cos(angleRad) * actor.size * 0.46,
      cy: actor.position.cy + Math.sin(angleRad) * actor.size * 0.46
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
    burst: Pick<AirShowTracerBurst, "emitter" | "burstCount" | "spreadPx" | "streakLengthPx" | "visibleLengthPx" | "fanHalfAngleDeg">,
    targetPoint?: AirShowPoint | null
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
    const headingForward = this.normalizeAircraftVector(
      Math.cos(((sourceHeadingDegrees - 90) * Math.PI) / 180),
      Math.sin(((sourceHeadingDegrees - 90) * Math.PI) / 180),
      0,
      -1
    );
    const targetDirectedForward = targetPoint
      ? this.normalizeAircraftVector(
          targetPoint.cx - emitterPoint.cx,
          targetPoint.cy - emitterPoint.cy,
          headingForward.x,
          headingForward.y
        )
      : null;
    const baseForward = burst.emitter === "nose"
      ? headingForward
      : targetDirectedForward ?? headingForward;
    const lateral = { x: -baseForward.y, y: baseForward.x };
    const targetDistancePx = targetPoint
      ? Math.max(0.001, Math.hypot(targetPoint.cx - emitterPoint.cx, targetPoint.cy - emitterPoint.cy))
      : null;
    const requestedStreakLengthPx = burst.streakLengthPx ?? actor.size * (burst.emitter === "center" ? 4.6 : 5.4);
    const streakLengthCapPx =
      typeof targetDistancePx === "number"
        ? Math.max(96, targetDistancePx * 1.35)
        : Math.max(36, requestedStreakLengthPx);
    const streakLengthPx = this.clamp(
      Math.min(requestedStreakLengthPx, streakLengthCapPx),
      16,
      Math.max(18, streakLengthCapPx)
    );
    const visibleLengthPx = this.clamp(
      burst.visibleLengthPx ?? Math.min(14, streakLengthPx * 0.16),
      5,
      Math.min(streakLengthPx, 20)
    );
    const fanHalfAngleDeg = this.clamp(burst.fanHalfAngleDeg ?? 0, 0, 12);
    const spreadPx = Math.max(0, burst.spreadPx ?? 0);
    const centerlineEndPoint = {
      cx: emitterPoint.cx + baseForward.x * streakLengthPx,
      cy: emitterPoint.cy + baseForward.y * streakLengthPx
    };

    const segments = Array.from({ length: burstCount }, (_, index) => {
      const fanT = burstCount <= 1 ? 0 : (index / Math.max(1, burstCount - 1)) * 2 - 1;
      const direction = this.rotateAirShowVector(baseForward, fanT * fanHalfAngleDeg);
      const startOffsetPx = fanT * spreadPx * 0.5;
      const forwardBiasPx =
        typeof targetDistancePx === "number" && burstCount > 1
          ? (index % 2 === 0 ? -1 : 1) * Math.min(8, targetDistancePx * 0.08)
          : 0;
      const start = {
        cx: emitterPoint.cx + lateral.x * startOffsetPx + baseForward.x * forwardBiasPx,
        cy: emitterPoint.cy + lateral.y * startOffsetPx + baseForward.y * forwardBiasPx
      };
      const segmentLengthPx = this.clamp(
        typeof targetPoint === "object" && targetPoint
          ? Math.min(
              streakLengthPx * (0.88 - Math.abs(fanT) * 0.08),
              Math.max(14, Math.hypot(targetPoint.cx - start.cx, targetPoint.cy - start.cy) * 0.95)
            )
          : streakLengthPx,
        14,
        Math.max(18, streakLengthPx)
      );
      return {
        start,
        end: {
          cx: start.cx + direction.x * segmentLengthPx,
          cy: start.cy + direction.y * segmentLengthPx
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
    const timingCount =
      Array.isArray(options.timings) && options.timings.length > 0
        ? options.timings.length
        : (options.emitter === "center" ? 4 : 5);
    const timings =
      options.timings
      ?? Array.from({ length: timingCount }, (_, index) =>
          0.38 + (index / Math.max(1, timingCount - 1)) * 0.42
        );
    const perBurstSegments = Math.max(1, Math.round(options.burstCount ?? 1));
    return timings.map((progress, volleyIndex) => ({
      progress,
      source,
      target,
      emitter: options.emitter ?? "nose",
      color: options.color,
      width: options.width,
      lifetimeMs: options.lifetimeMs,
      spreadPx: options.spreadPx,
      streakLengthPx: options.streakLengthPx ?? (options.emitter === "center" ? 312 : 328),
      visibleLengthPx: options.visibleLengthPx,
      fanHalfAngleDeg: options.fanHalfAngleDeg,
      burstCount: perBurstSegments
    }));
  }

  private sampleAirShowFlightCentroidAtProgress(
    flight: AirShowRuntimeFlightInternal,
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    progress: number
  ): AirShowPoint | null {
    const assignmentsByActorId = this.buildAirShowAssignmentLookup(assignments);
    const sampledPoints = flight.actors
      .filter((actor) => actor.active)
      .map((actor) => {
        const assignment = assignmentsByActorId.get(actor.id);
        return assignment
          ? this.sampleAirShowAssignmentAtProgress(assignment, progress).position
          : actor.position;
      });
    return this.averageAirShowPoints(sampledPoints);
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
      minTargetHeadingDot?: number;
      maxTargetHeadingDot?: number;
      timings?: ReadonlyArray<number>;
      fallbackToNearest?: boolean;
      fallbackTarget?: "midpoint" | "target-centroid";
      durationMs?: number;
    } = {}
  ): AirShowTracerBurst[] {
    const emitter = options.emitter ?? "nose";
    const segmentCount = Math.max(1, Math.round(options.burstCount ?? 1));
    const timings =
      options.timings
      ?? Array.from({ length: emitter === "center" ? 4 : 5 }, (_, index) => 0.34 + index * 0.08);
    return timings.flatMap<AirShowTracerBurst>((progress, volleyIndex) => {
      const probeProgresses = [
        progress,
        progress - 0.03,
        progress + 0.03,
        progress - 0.06,
        progress + 0.06,
        progress - 0.09,
        progress + 0.09
      ]
        .map((candidate) => this.clamp(candidate, 0, 1))
        .filter((candidate, index, array) =>
          array.findIndex((value) => Math.abs(value - candidate) < 0.001) === index
        );
      let pair: { sourceActor: AirShowRuntimeActor; targetActor: AirShowRuntimeActor } | null = null;
      let resolvedProgress = progress;
      for (const probeProgress of probeProgresses) {
        const candidatePair = this.selectAirShowTracerActors(
          sourceFlight,
          targetFlight,
          assignments,
          probeProgress,
          emitter,
          {
            maxAlignmentDeg: options.maxAlignmentDeg,
            maxRangePx: options.maxRangePx,
            minTargetHeadingDot: options.minTargetHeadingDot,
            maxTargetHeadingDot: options.maxTargetHeadingDot,
            durationMs: options.durationMs
          }
        );
        if (!candidatePair) {
          continue;
        }
        pair = candidatePair;
        resolvedProgress = probeProgress;
        break;
      }
      if (!pair && options.fallbackToNearest) {
        pair = this.selectClosestAirShowTracerActors(
          sourceFlight,
          targetFlight,
          assignments,
          resolvedProgress,
          emitter,
          options.durationMs
        );
      }
      if (pair) {
        return [{
          progress: resolvedProgress,
          source: pair.sourceActor,
          target: pair.targetActor,
          emitter,
          color: options.color,
          width: options.width,
          lifetimeMs: options.lifetimeMs,
          spreadPx: options.spreadPx,
          streakLengthPx: options.streakLengthPx,
          visibleLengthPx: options.visibleLengthPx,
          fanHalfAngleDeg: options.fanHalfAngleDeg,
          burstCount: segmentCount
        }];
      }
      if (!pair && options.fallbackToNearest) {
        const closestPair = this.selectClosestAirShowTracerActors(
          sourceFlight,
          targetFlight,
          assignments,
          resolvedProgress,
          emitter,
          options.durationMs
        );
        const sourceActor = closestPair?.sourceActor ?? sourceFlight.actors.find((actor) => actor.active);
        const sourceCentroid = sourceActor
          ? this.sampleAirShowFlightCentroidAtProgress(sourceFlight, assignments, resolvedProgress)
          : null;
        const targetCentroid = sourceActor
          ? this.sampleAirShowFlightCentroidAtProgress(targetFlight, assignments, resolvedProgress)
          : null;
        if (closestPair && options.fallbackTarget !== "midpoint") {
          return [{
            progress: resolvedProgress,
            source: closestPair.sourceActor,
            target: closestPair.targetActor,
            emitter,
            color: options.color,
            width: options.width,
            lifetimeMs: options.lifetimeMs,
            spreadPx: options.spreadPx,
            streakLengthPx: options.streakLengthPx,
            visibleLengthPx: options.visibleLengthPx,
            fanHalfAngleDeg: options.fanHalfAngleDeg,
            burstCount: segmentCount
          }];
        }
        if (sourceActor && sourceCentroid && targetCentroid) {
          const fallbackTarget =
            options.fallbackTarget === "midpoint"
              ? {
                  cx: (sourceCentroid.cx + targetCentroid.cx) * 0.5,
                  cy: (sourceCentroid.cy + targetCentroid.cy) * 0.5
                }
              : targetCentroid;
          return [{
            progress: resolvedProgress,
            source: sourceActor,
            target: fallbackTarget,
            emitter,
            color: options.color,
            width: options.width,
            lifetimeMs: options.lifetimeMs,
            spreadPx: options.spreadPx,
            streakLengthPx: options.streakLengthPx,
            visibleLengthPx: options.visibleLengthPx,
            fanHalfAngleDeg: options.fanHalfAngleDeg,
            burstCount: segmentCount
          }];
        }
      }
      return [];
    });
  }

  private resolveAirShowBomberDefensePassAttackEntries(
    bomberAttackEntries: ReadonlyArray<{
      readonly interceptorFlight: AirShowRuntimeFlightInternal;
      readonly bomberFlight: AirShowRuntimeFlightInternal;
    }>,
    interceptorFlights: ReadonlyArray<AirShowRuntimeFlightInternal>,
    survivingBombers: ReadonlyArray<AirShowRuntimeFlightInternal>
  ): ReadonlyArray<{
    readonly interceptorFlight: AirShowRuntimeFlightInternal;
    readonly bomberFlight: AirShowRuntimeFlightInternal;
  }> {
    const activeInterceptors = interceptorFlights.filter((flight) =>
      flight.actors.some((actor) => actor.active)
    );
    if (activeInterceptors.length === 0 || survivingBombers.length === 0) {
      return [];
    }
    const resolveBomberLossScore = (flight: AirShowRuntimeFlightInternal): number => {
      const strengthBeforeDefense = flight.spec.strengthAfterEscortPhase ?? flight.currentStrength;
      const finalStrength = flight.spec.finalStrength ?? flight.currentStrength;
      return Math.max(0, strengthBeforeDefense - finalStrength);
    };
    const activeAttackEntries = bomberAttackEntries.filter((entry) =>
      entry.interceptorFlight.actors.some((actor) => actor.active)
      && entry.bomberFlight.actors.some((actor) => actor.active)
    );
    const prioritizedBombers = [...survivingBombers].sort(
      (left, right) => resolveBomberLossScore(right) - resolveBomberLossScore(left)
    );
    const resolveFlightCurrentPoint = (flight: AirShowRuntimeFlightInternal): AirShowPoint =>
      this.averageAirShowPosition(flight.actors) ?? flight.anchor;
    const resolvePreferredBomberFlight = (
      interceptorFlight: AirShowRuntimeFlightInternal,
      candidateBombers: ReadonlyArray<AirShowRuntimeFlightInternal>,
      fallbackBombers: ReadonlyArray<AirShowRuntimeFlightInternal>
    ): AirShowRuntimeFlightInternal | null => {
      const bomberPool = candidateBombers.length > 0 ? candidateBombers : fallbackBombers;
      if (bomberPool.length <= 0) {
        return null;
      }
      const interceptorPoint = resolveFlightCurrentPoint(interceptorFlight);
      return bomberPool.reduce((best, candidate) => {
        const bestPoint = resolveFlightCurrentPoint(best);
        const candidatePoint = resolveFlightCurrentPoint(candidate);
        const bestDistancePx = Math.hypot(
          bestPoint.cx - interceptorPoint.cx,
          bestPoint.cy - interceptorPoint.cy
        );
        const candidateDistancePx = Math.hypot(
          candidatePoint.cx - interceptorPoint.cx,
          candidatePoint.cy - interceptorPoint.cy
        );
        if (Math.abs(candidateDistancePx - bestDistancePx) > 10) {
          return candidateDistancePx < bestDistancePx ? candidate : best;
        }
        return resolveBomberLossScore(candidate) > resolveBomberLossScore(best)
          ? candidate
          : best;
      });
    };
    const resolvedEntries: Array<{
      interceptorFlight: AirShowRuntimeFlightInternal;
      bomberFlight: AirShowRuntimeFlightInternal;
    }> = [];
    const usedInterceptorIds = new Set<string>();
    const assignedBomberIds = new Set<string>();

    activeAttackEntries
      .sort(
        (left, right) =>
          resolveBomberLossScore(right.bomberFlight) - resolveBomberLossScore(left.bomberFlight)
      )
      .forEach((entry) => {
        if (usedInterceptorIds.has(entry.interceptorFlight.spec.id)) {
          return;
        }
        resolvedEntries.push({
          interceptorFlight: entry.interceptorFlight,
          bomberFlight: entry.bomberFlight
        });
        usedInterceptorIds.add(entry.interceptorFlight.spec.id);
        assignedBomberIds.add(entry.bomberFlight.spec.id);
      });

    const unusedInterceptors = activeInterceptors.filter(
      (flight) => !usedInterceptorIds.has(flight.spec.id)
    );
    const remainingUnassignedBombers = prioritizedBombers.filter(
      (flight) => !assignedBomberIds.has(flight.spec.id)
    );
    unusedInterceptors.forEach((interceptorFlight) => {
      const bomberFlight = resolvePreferredBomberFlight(
        interceptorFlight,
        remainingUnassignedBombers,
        prioritizedBombers
      );
      if (!bomberFlight) {
        return;
      }
      resolvedEntries.push({
        interceptorFlight,
        bomberFlight
      });
      assignedBomberIds.add(bomberFlight.spec.id);
      const remainingBomberIndex = remainingUnassignedBombers.findIndex(
        (flight) => flight.spec.id === bomberFlight.spec.id
      );
      if (remainingBomberIndex >= 0) {
        remainingUnassignedBombers.splice(remainingBomberIndex, 1);
      }
    });

    if (resolvedEntries.length > 0) {
      return resolvedEntries;
    }
    const remainingFallbackBombers = [...prioritizedBombers];
    return activeInterceptors.map((interceptorFlight) => {
      const bomberFlight =
        resolvePreferredBomberFlight(
          interceptorFlight,
          remainingFallbackBombers,
          prioritizedBombers
        )
        ?? prioritizedBombers[0]!;
      const remainingBomberIndex = remainingFallbackBombers.findIndex(
        (flight) => flight.spec.id === bomberFlight.spec.id
      );
      if (remainingBomberIndex >= 0) {
        remainingFallbackBombers.splice(remainingBomberIndex, 1);
      }
      return {
        interceptorFlight,
        bomberFlight
      };
    });
  }

  private buildAirShowBomberDefensePassTracerBursts(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    interceptorFlight: AirShowRuntimeFlightInternal,
    bomberFlight: AirShowRuntimeFlightInternal,
    options: {
      readonly attackTimings?: ReadonlyArray<number>;
      readonly defensiveTimings?: ReadonlyArray<number>;
      readonly fallbackToNearest?: boolean;
    } = {}
  ): AirShowTracerBurst[] {
    const attackTimings = options.attackTimings ?? [0.06, 0.14, 0.24, 0.34, 0.46, 0.58, 0.7, 0.8];
    const defensiveTimings = options.defensiveTimings ?? [0.2, 0.38, 0.56];
    const fallbackToNearest = options.fallbackToNearest ?? true;
    return [
      ...this.buildAirShowDynamicTracerVolley(assignments, interceptorFlight, bomberFlight, {
        emitter: "nose",
        width: 0.68,
        lifetimeMs: 44,
        spreadPx: 8,
        streakLengthPx: 126,
        visibleLengthPx: 11,
        fanHalfAngleDeg: 2.8,
        burstCount: 5,
        maxAlignmentDeg: 58,
        maxRangePx: 332,
        timings: attackTimings,
        fallbackToNearest,
        fallbackTarget: "target-centroid"
      }),
      ...this.buildAirShowDynamicTracerVolley(assignments, bomberFlight, interceptorFlight, {
        emitter: "center",
        color: "#fff1c8",
        width: 0.5,
        lifetimeMs: 42,
        spreadPx: 5,
        streakLengthPx: 112,
        visibleLengthPx: 10,
        fanHalfAngleDeg: 1.2,
        burstCount: 3,
        maxRangePx: 250,
        timings: defensiveTimings,
        fallbackToNearest,
        fallbackTarget: "target-centroid"
      })
    ];
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
    const alongOffsetPx = burst.alongOffsetPx ?? -8;
    const lateralOffsetPx = burst.lateralOffsetPx ?? 0;
    const requestedPuffCount = burst.puffCount ?? Math.max(4, burst.count * 3);
    const isSinglePuff = burst.puffCount !== undefined && requestedPuffCount <= 1;
    const alongSpreadPx = isSinglePuff
      ? Math.max(4, burst.alongSpreadPx ?? 8)
      : Math.max(32, burst.alongSpreadPx ?? 48);
    const lateralSpreadPx = isSinglePuff
      ? Math.max(4, burst.lateralSpreadPx ?? 8)
      : Math.max(176, burst.lateralSpreadPx ?? HEX_WIDTH * 1.58);
    const puffCount = Math.max(isSinglePuff ? 1 : 3, Math.min(10, requestedPuffCount));
    const requestedSmokePuffCount = burst.smokePuffCount ?? Math.round(puffCount * 1.05);
    const smokePuffCount = isSinglePuff
      ? Math.max(1, requestedSmokePuffCount)
      : Math.max(
          Math.round(puffCount * 0.45),
          Math.min(Math.max(puffCount + 3, Math.round(puffCount * 1.2)), requestedSmokePuffCount)
        );
    const center = this.clampPointToViewportBounds(
      {
        cx: targetCenter.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
        cy: targetCenter.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
      },
      targetCenter,
      430,
      300
    );
    let seed =
      (
        Math.round(targetCenter.cx * 13)
        + Math.round(targetCenter.cy * 17)
        + Math.round((burst.progress ?? 0) * 1000) * 19
        + Math.round((burst.count ?? 1) * 31)
        + Math.round(alongOffsetPx * 23)
        + Math.round(lateralOffsetPx * 29)
        + Math.round(alongSpreadPx * 7)
        + Math.round(lateralSpreadPx * 11)
        + Math.round(puffCount * 37)
      ) >>> 0;
    const nextRandom = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const baseAngle = nextRandom() * Math.PI * 2;
    let points = Array.from({ length: puffCount }, (_, index) => {
      const ringRatio = (index + nextRandom() * 0.7) / Math.max(1, puffCount);
      const angle = baseAngle + ringRatio * Math.PI * 2 + (nextRandom() - 0.5) * 0.68;
      const radial = Math.sqrt(nextRandom());
      const alongJitter =
        Math.cos(angle) * alongSpreadPx * (0.14 + radial * 0.64)
        + (nextRandom() - 0.5) * alongSpreadPx * 0.16;
      const lateralJitter =
        Math.sin(angle) * lateralSpreadPx * (0.18 + radial * 0.72)
        + (nextRandom() - 0.5) * lateralSpreadPx * 0.14;
      const screenJitterX = isSinglePuff
        ? 0
        : (nextRandom() - 0.5) * Math.max(150, Math.min(260, lateralSpreadPx * 1.04));
      const screenJitterY = isSinglePuff
        ? 0
        : (nextRandom() - 0.5) * Math.max(16, Math.min(42, alongSpreadPx * 0.36));
      return this.clampPointToViewportBounds(
        {
          cx: center.cx + corridor.axis.x * alongJitter + corridor.normal.x * lateralJitter + screenJitterX,
          cy: center.cy + corridor.axis.y * alongJitter + corridor.normal.y * lateralJitter + screenJitterY
        },
        targetCenter,
        470,
        320
      );
    });
    if (!isSinglePuff && points.length > 1) {
      const xs = points.map((point) => point.cx);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const currentWidthPx = Math.max(0, maxX - minX);
      const minimumVisualWidthPx = Math.max(156, Math.min(236, Math.round(lateralSpreadPx * 0.86)));
      if (currentWidthPx + 0.5 < minimumVisualWidthPx) {
        const widthDeficitHalfPx = (minimumVisualWidthPx - currentWidthPx) * 0.5;
        const sortedPointIndices = points
          .map((_, index) => index)
          .sort((leftIndex, rightIndex) => points[leftIndex]!.cx - points[rightIndex]!.cx);
        const leftMostIndex = sortedPointIndices[0] ?? 0;
        const rightMostIndex = sortedPointIndices[sortedPointIndices.length - 1] ?? leftMostIndex;
        points = points.map((point, index) => {
          let shiftXPx = 0;
          if (index === leftMostIndex) {
            shiftXPx = -widthDeficitHalfPx;
          } else if (index === rightMostIndex) {
            shiftXPx = widthDeficitHalfPx;
          } else {
            shiftXPx = (index % 2 === 0 ? -1 : 1) * widthDeficitHalfPx * 0.28;
          }
          return this.clampPointToViewportBounds(
            {
              cx: point.cx + shiftXPx,
              cy: point.cy
            },
            targetCenter,
            470,
            320
          );
        });
      }
    }
    const flashCount = isSinglePuff ? 1 : Math.max(1, Math.min(3, Math.round(puffCount * 0.24)));
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
    const geometry = this.resolveAirShowTracerBurstGeometry(source, burst, targetPoint);
    const targetVector = {
      x: targetPoint.cx - geometry.emitterPoint.cx,
      y: targetPoint.cy - geometry.emitterPoint.cy
    };
    if (Math.hypot(targetVector.x, targetVector.y) < 6) {
      return false;
    }
    return true;
  }

  private playAirShowTracerBurst(burst: AirShowTracerBurst): void {
    const targetPoint = this.resolveAirShowTracerTargetPoint(burst.target);
    if (!this.shouldRenderAirShowTracerBurst(burst.source, targetPoint, burst)) {
      return;
    }
    const geometry = this.resolveAirShowTracerBurstGeometry(burst.source, burst, targetPoint);
    geometry.segments.forEach((segment, index) => {
      const pulseCount = 2;
      const dx = segment.end.cx - segment.start.cx;
      const dy = segment.end.cy - segment.start.cy;
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const normal = { x: -dy / distance, y: dx / distance };
      for (let pulseIndex = 0; pulseIndex < pulseCount; pulseIndex += 1) {
        const laneOffsetPx =
          (pulseIndex - (pulseCount - 1) / 2) * 2.8
          + (index - (geometry.segments.length - 1) / 2) * 0.8;
        const laneStart = {
          cx: segment.start.cx + normal.x * laneOffsetPx,
          cy: segment.start.cy + normal.y * laneOffsetPx
        };
        const laneEnd = {
          cx: segment.end.cx + normal.x * laneOffsetPx,
          cy: segment.end.cy + normal.y * laneOffsetPx
        };
        window.setTimeout(() => {
          this.playAirTracerExchange(
            laneStart,
            laneEnd,
            {
              color: burst.color,
              width: burst.width,
              lifetimeMs: burst.lifetimeMs,
              visibleLengthPx: geometry.visibleLengthPx
            }
          );
        }, index * 18 + pulseIndex * 24);
      }
    });
  }

  private averageAirShowPosition(
    actors: ReadonlyArray<Pick<AirShowRuntimeActor, "position">>
  ): AirShowPoint | null {
    // Use ALL actors for position calculation, not just active ones.
    // The active flag controls visual opacity only; position must remain continuous.
    if (actors.length === 0) {
      return null;
    }
    const totals = actors.reduce(
      (acc, actor) => {
        acc.cx += actor.position.cx;
        acc.cy += actor.position.cy;
        return acc;
      },
      { cx: 0, cy: 0 }
    );
    return {
      cx: totals.cx / actors.length,
      cy: totals.cy / actors.length
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

  private applyInspectionAirShowAssignments(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number
  ): void {
    assignments.forEach((assignment) => {
      const finalSample = this.sampleAirShowAssignmentAtTime(assignment, durationMs, durationMs, 1);
      assignment.actor.position = {
        cx: finalSample.position.cx,
        cy: finalSample.position.cy
      };
      assignment.actor.headingDegrees = finalSample.headingDegrees;
      if ("image" in assignment.actor && assignment.actor.image instanceof SVGImageElement) {
        this.positionAircraftImageGhost(
          assignment.actor.image,
          assignment.actor.size,
          assignment.actor.position.cx,
          assignment.actor.position.cy,
          assignment.actor.headingDegrees
        );
      }
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
      if ("image" in actor && actor.image instanceof SVGImageElement) {
        actor.image.style.opacity = actor.active ? "1" : "0";
        actor.image.setAttribute("data-airshow-active", actor.active ? "true" : "false");
      }
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

    assignments.forEach((assignment) => {
      if (assignment.points.length > 0) {
        const phaseStartOffsetPx = assignment.multiFlightOffsetPx ?? 0;
        assignment.points[0] = {
          cx: assignment.actor.position.cx - phaseStartOffsetPx,
          cy: assignment.actor.position.cy
        };
      }
      const initialSample = this.sampleAirShowAssignmentAtTime(assignment, 0, durationMs, 0);
      assignment.actor.headingDegrees = this.interpolateAircraftHeadingDegrees(
        assignment.actor.headingDegrees,
        initialSample.headingDegrees,
        0.68
      );
      assignment.actor.position = {
        cx: initialSample.position.cx,
        cy: initialSample.position.cy
      };
      this.positionAircraftImageGhost(
        assignment.actor.image,
        assignment.actor.size,
        initialSample.position.cx,
        initialSample.position.cy,
        assignment.actor.headingDegrees
      );
    });

    const tracedActors =
      (options.sceneActors && options.sceneActors.length > 0)
        ? options.sceneActors
        : Array.from(new Map(assignments.map((assignment) => [assignment.actor.id, assignment.actor] as const)).values());
    const requestedVisibleActorIds = (options.visibleActorIds ?? assignments.map((assignment) => assignment.actor.id))
      .filter((actorId) => actorId.length > 0);
    const resolvedVisibleActorIds = this.resolveAirShowPhaseVisibleActorIds(
      assignments,
      options.visibleActorIds
    );
    this.recordAirShowRuntimeTrace({
      kind: "phase-start",
      label: options.phaseLabel ?? "(unlabeled-phase)",
      durationMs,
      assignmentActorIds: assignments.map((assignment) => assignment.actor.id),
      visibleActorIds: [...resolvedVisibleActorIds],
      actorStates: tracedActors.map((actor) => this.snapshotAirShowRuntimeActorState(actor))
    });
    const addedActiveActorIds = resolvedVisibleActorIds.filter(
      (actorId) => !requestedVisibleActorIds.includes(actorId)
    );
    if (addedActiveActorIds.length > 0) {
      this.recordAirShowRuntimeTrace({
        kind: "phase-visibility-expanded",
        label: options.phaseLabel ?? "(unlabeled-phase)",
        requestedVisibleActorIds: [...requestedVisibleActorIds],
        resolvedVisibleActorIds: [...resolvedVisibleActorIds],
        addedActiveActorIds,
        actorStates: tracedActors.map((actor) => this.snapshotAirShowRuntimeActorState(actor))
      });
    }

    this.syncAirShowPhaseVisibility(assignments, options.sceneActors, resolvedVisibleActorIds);
    this.recordAirShowRuntimeTrace({
      kind: "phase-visibility-sync",
      label: options.phaseLabel ?? "(unlabeled-phase)",
      visibleActorIds: [...resolvedVisibleActorIds],
      actorStates: tracedActors.map((actor) => this.snapshotAirShowRuntimeActorState(actor))
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

        assignments.forEach((assignment) => {
          const phaseProgressOverride =
            assignment.progressTimeline && assignment.progressTimeline.length >= 2
              ? undefined
              : easedProgress;
          const sample = this.sampleAirShowAssignmentAtTime(
            assignment,
            elapsed,
            durationMs,
            phaseProgressOverride
          );
          assignment.actor.headingDegrees = this.interpolateAircraftHeadingDegrees(
            assignment.actor.headingDegrees,
            sample.headingDegrees,
            assignment.headingBlend ?? 0.34
          );
          assignment.actor.position = sample.position;
          this.positionAircraftImageGhost(
            assignment.actor.image,
            assignment.actor.size,
            sample.position.cx,
            sample.position.cy,
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
            const finalSample = this.sampleAirShowAssignmentAtTime(assignment, durationMs, durationMs, 1);
            assignment.actor.headingDegrees = finalSample.headingDegrees;
            assignment.actor.position = {
              cx: finalSample.position.cx,
              cy: finalSample.position.cy
            };
            this.positionAircraftImageGhost(
              assignment.actor.image,
              assignment.actor.size,
              finalSample.position.cx,
              finalSample.position.cy,
              assignment.actor.headingDegrees
            );
          });
          this.recordAirShowRuntimeTrace({
            kind: "phase-complete",
            label: options.phaseLabel ?? "(unlabeled-phase)",
            requestedDurationMs: durationMs,
            elapsedMs: Math.round(now - startTime),
            actorStates: tracedActors.map((actor) => this.snapshotAirShowRuntimeActorState(actor))
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

  private syncAirShowPhaseVisibility(
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    sceneActors: ReadonlyArray<AirShowRuntimeActor> = [],
    visibleActorIds?: ReadonlyArray<string>
  ): void {
    const visibleActorIdSet = new Set(visibleActorIds ?? assignments.map((assignment) => assignment.actor.id));
    const actorsToSync =
      sceneActors.length > 0
        ? sceneActors
        : Array.from(new Map(assignments.map((assignment) => [assignment.actor.id, assignment.actor] as const)).values());

    actorsToSync.forEach((actor) => {
      const shouldDisplay = visibleActorIdSet.has(actor.id) && actor.active;
      actor.image.style.opacity = shouldDisplay ? "1" : "0";
      actor.image.setAttribute("data-airshow-active", shouldDisplay ? "true" : "false");
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
      this.recordAirShowRuntimeTrace({
        kind: "strength-sync",
        flightId: flight.spec.id,
        previousStrength,
        targetStrength,
        targetVisibleCount,
        activeActorIds: activeActors.map((actor) => actor.id),
        removedActorIds: []
      });
      return;
    }

    const removedActors = [...activeActors]
      .sort((left, right) => right.formationIndex - left.formationIndex)
      .slice(0, activeActors.length - targetVisibleCount);
    this.recordAirShowRuntimeTrace({
      kind: "strength-sync",
      flightId: flight.spec.id,
      previousStrength,
      targetStrength,
      targetVisibleCount,
      activeActorIds: activeActors.map((actor) => actor.id),
      removedActorIds: removedActors.map((actor) => actor.id)
    });

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
      this.recordAirShowRuntimeTrace({
        kind: "actor-fade-out",
        actorState: this.snapshotAirShowRuntimeActorState(actor)
      });
    });
    removedActors.forEach((actor) => {
      actor.active = false;
      actor.image.setAttribute("data-airshow-active", "false");
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
    const weaponModel = this.getUnitTypeDefinition(attackerType)?.weaponModel;
    const hasInfantryFireGroup = weaponModel?.groups.some((group) =>
      group.role === "smallArms" || group.role === "machineGun" || group.role === "demolition"
    ) ?? false;
    return attackerClass === "infantry" || attackerClass === "recon" || (attackerClass === "specialist" && hasInfantryFireGroup);
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
        return { color: "#ffd37a", width: 0.72 }; // small arms - warm yellow, thin streak
      case "vehicle":
        return { color: "#ffe08a", width: 1.05 }; // autocannon - bright yellow
      case "tank":
        return { color: "#ffcf5a", width: 1.25 }; // main gun trace, not a beam
      case "artillery":
        return { color: "#ff9e5a", width: 1.35 }; // shells - orange
      case "air":
        return { color: "#aee1ff", width: 0.95 }; // MGs/cannons - cool cyan, very thin
      default:
        return { color: "#ffd37a", width: 0.9 };
    }
  }

  private chooseTracerCount(attackerClass?: UnitClass): number {
    switch (attackerClass) {
      case "infantry":
      case "specialist":
        return 4;
      case "vehicle":
        return 2;
      case "tank":
        return 1;
      case "artillery":
        return 1;
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

  private resolveFormationFireMix(attackerHexKey: string): FormationFireMix {
    const attackerType = this.getUnitScenarioTypeAt(attackerHexKey);
    const attackerClass = this.getUnitClassAt(attackerHexKey);
    const weaponModel = this.getUnitTypeDefinition(attackerType)?.weaponModel;
    const shotsByRole: Partial<Record<WeaponVisualRole, number>> = {};

    weaponModel?.groups.forEach((group) => {
      shotsByRole[group.role] = (shotsByRole[group.role] ?? 0) + Math.max(0, group.shots);
    });

    const totalShots = Object.values(shotsByRole).reduce((sum, shots) => sum + (shots ?? 0), 0);
    return {
      attackerType,
      attackerClass,
      hasWeaponModel: Boolean(weaponModel),
      totalShots,
      shotsByRole
    };
  }

  private getRoleShots(mix: FormationFireMix, roles: readonly WeaponVisualRole[]): number {
    return roles.reduce((sum, role) => sum + (mix.shotsByRole[role] ?? 0), 0);
  }

  private chooseVisibleWeaponBurstCount(
    shots: number,
    minCount: number,
    maxCount: number,
    scalar: number = 1
  ): number {
    if (shots <= 0) {
      return 0;
    }
    return Math.round(this.clamp(Math.log10(shots + 1) * scalar, minCount, maxCount));
  }

  private buildFormationTracerLayers(
    mix: FormationFireMix,
    targetIsHardTarget: boolean,
    defenderIsAir: boolean
  ): TracerVisualLayer[] {
    const smallArmsShots = this.getRoleShots(mix, ["smallArms"]);
    const machineGunShots = this.getRoleShots(mix, ["machineGun"]);
    const antiTankShots = this.getRoleShots(mix, ["antiTank"]);
    const directHeShots = this.getRoleShots(mix, ["directHe", "demolition"]);
    const layers: TracerVisualLayer[] = [];

    const smallArmsCount = this.chooseVisibleWeaponBurstCount(smallArmsShots, 2, mix.attackerClass === "recon" ? 4 : 5, 1.18);
    if (smallArmsCount > 0) {
      layers.push({
        count: smallArmsCount,
        delayMs: 0,
        staggerMs: 26,
        durationMs: 62,
        jitterPx: defenderIsAir ? 9 : 12,
        segLenScalar: 0.07,
        style: { color: "#ffdba0", width: 0.52 }
      });
    }

    const machineGunCount = this.chooseVisibleWeaponBurstCount(machineGunShots, 1, mix.attackerClass === "recon" ? 3 : 4, 0.98);
    if (machineGunCount > 0) {
      layers.push({
        count: machineGunCount,
        delayMs: 18,
        staggerMs: 18,
        durationMs: 76,
        jitterPx: defenderIsAir ? 6 : 8,
        segLenScalar: 0.11,
        style: { color: "#fff0b8", width: 0.78 }
      });
    }

    const shouldShowLauncherTrace = targetIsHardTarget || mix.attackerType === "AT_Infantry" || directHeShots > 0;
    const launcherCount = shouldShowLauncherTrace
      ? this.chooseVisibleWeaponBurstCount(antiTankShots + directHeShots, 1, targetIsHardTarget ? 2 : 1, 0.58)
      : 0;
    if (launcherCount > 0) {
      layers.push({
        count: launcherCount,
        delayMs: 72,
        staggerMs: 82,
        durationMs: 116,
        jitterPx: 4,
        segLenScalar: 0.2,
        style: { color: "#ffc16b", width: 1.08 }
      });
    }

    if (layers.length > 0 || mix.hasWeaponModel) {
      return layers;
    }

    return [{
      count: mix.attackerClass === "recon" ? 4 : 5,
      delayMs: 0,
      staggerMs: 24,
      durationMs: 68,
      jitterPx: 9,
      segLenScalar: 0.08,
      style: { color: "#ffdba0", width: 0.58 }
    }];
  }

  private async playTracerLayer(attackerHexKey: string, defenderHexKey: string, layer: TracerVisualLayer): Promise<void> {
    const tracerPromises = Array.from({ length: layer.count }).map((_, index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playProjectileTracer(attackerHexKey, defenderHexKey, layer.durationMs, {
            style: { color: layer.style.color, width: layer.style.width },
            jitterPx: layer.jitterPx,
            segLenScalar: layer.segLenScalar
          }).then(() => resolve());
        }, layer.delayMs + index * layer.staggerMs);
      })
    );

    await Promise.all(tracerPromises);
  }

  private async playFormationTracerLayers(
    attackerHexKey: string,
    defenderHexKey: string,
    mix: FormationFireMix,
    targetIsHardTarget: boolean,
    defenderIsAir: boolean
  ): Promise<void> {
    const layers = this.buildFormationTracerLayers(mix, targetIsHardTarget, defenderIsAir);
    await Promise.all(layers.map((layer) => this.playTracerLayer(attackerHexKey, defenderHexKey, layer)));
  }

  private async playFormationImpactDetails(
    attackerHexKey: string,
    defenderHexKey: string,
    mix: FormationFireMix,
    targetIsHardTarget: boolean,
    defenderIsAir: boolean
  ): Promise<void> {
    const smallArmsShots = this.getRoleShots(mix, ["smallArms"]);
    const machineGunShots = this.getRoleShots(mix, ["machineGun"]);
    const antiTankShots = this.getRoleShots(mix, ["antiTank"]);
    const heShots = this.getRoleShots(mix, ["directHe", "indirectHe", "demolition"]);
    const promises: Promise<void>[] = [];

    const smallImpactCount = this.chooseVisibleWeaponBurstCount(smallArmsShots, 1, 4, 0.72);
    for (let index = 0; index < smallImpactCount; index += 1) {
      const [offsetX, offsetY] = FORMATION_SMALL_ARMS_IMPACT_OFFSETS[index % FORMATION_SMALL_ARMS_IMPACT_OFFSETS.length]!;
      promises.push(new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playCombatAnimation(
            "small_arms",
            defenderHexKey,
            offsetX,
            offsetY,
            targetIsHardTarget ? 0.22 : 0.28,
            false
          ).then(() => resolve());
        }, 52 + index * 34);
      }));
    }

    const mgImpactCount = this.chooseVisibleWeaponBurstCount(machineGunShots, 1, 3, 0.62);
    for (let index = 0; index < mgImpactCount; index += 1) {
      const [offsetX, offsetY] = FORMATION_MG_IMPACT_OFFSETS[index % FORMATION_MG_IMPACT_OFFSETS.length]!;
      promises.push(new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playCombatAnimation(
            "mg",
            defenderHexKey,
            offsetX,
            offsetY,
            targetIsHardTarget ? 0.24 : 0.31,
            false
          ).then(() => resolve());
        }, 68 + index * 30);
      }));
    }

    const heImpactCount = defenderIsAir ? 0 : this.chooseVisibleWeaponBurstCount(heShots, 1, mix.attackerType === "AT_Infantry" ? 3 : 2, 0.78);
    for (let index = 0; index < heImpactCount; index += 1) {
      const [offsetX, offsetY] = FORMATION_HE_IMPACT_OFFSETS[index % FORMATION_HE_IMPACT_OFFSETS.length]!;
      promises.push(new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void Promise.all([
            this.playArcedProjectile(attackerHexKey, defenderHexKey, 430 + index * 24, {
              color: "#e7d4a2",
              radius: 1.45,
              arcHeight: 34 + index * 4,
              targetOffsetX: offsetX,
              targetOffsetY: offsetY
            }),
            new Promise<void>((impactResolve) => {
              window.setTimeout(() => {
                void this.playCombatAnimation(
                  "explosionSmall",
                  defenderHexKey,
                  offsetX,
                  offsetY,
                  targetIsHardTarget ? 0.42 : 0.5,
                  false
                ).then(() => impactResolve());
              }, 190 + index * 28);
            })
          ]).then(() => resolve());
        }, 126 + index * 82);
      }));
    }

    const antiTankImpactCount = targetIsHardTarget ? this.chooseVisibleWeaponBurstCount(antiTankShots, 1, 1, 0.52) : 0;
    for (let index = 0; index < antiTankImpactCount; index += 1) {
      const offsetX = 10 + index * 6;
      const offsetY = -7 + index * 5;
      promises.push(new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void Promise.all([
            this.playArcedProjectile(attackerHexKey, defenderHexKey, 320, {
              color: "#f4a858",
              radius: 1.75,
              arcHeight: 18,
              targetOffsetX: offsetX,
              targetOffsetY: offsetY
            }),
            new Promise<void>((impactResolve) => {
              window.setTimeout(() => {
                void this.playCombatAnimation("cannon", defenderHexKey, offsetX, offsetY, 0.36, false).then(() => impactResolve());
              }, 150);
            })
          ]).then(() => resolve());
        }, 118 + index * 90);
      }));
    }

    await Promise.all(promises);
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
    if (animationType === "flakSmokePuff") {
      return 28;
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
          if (timestamp < cutoff) this.recentEffects.delete(key);
        }
      }
    }
    if (animationType === "impactHits") {
      if (!this.spriteSheetAnimator) this.spriteSheetAnimator = new SpriteSheetAnimator(effectsLayer);
      if (this.soundCatalogReady) await this.soundCatalogReady;
      const soundPromise = soundRequest !== false && soundRequest !== undefined
        ? this.soundManager.playWeaponSound({
            ...soundRequest,
            seed: Math.abs(Math.round(x * 31 + y * 17 + scale * 101))
          }).catch(() => undefined)
        : Promise.resolve();
      await Promise.all([
        this.spriteSheetAnimator.playAnimation("impactHits", x, y, scale),
        soundPromise
      ]);
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
      readonly smokeLingerMs?: number;
    },
    scale = 1.08,
    _smokeScale = 0.92
  ): void {
    const pointCount = Math.min(wave.puffCount, wave.points.length);
    const singlePuffWave = wave.puffCount <= 1 && pointCount <= 1;
    const flashPointCount = singlePuffWave
      ? pointCount
      : Math.min(pointCount, Math.max(1, wave.flashCount));
    const smokePointCount = singlePuffWave
      ? pointCount
      : Math.min(pointCount, Math.max(flashPointCount, wave.smokePuffCount));
    const waveSeed = wave.points.reduce(
      (seed, point, index) =>
        (
          seed
          + Math.round(point.cx * 17)
          + Math.round(point.cy * 23)
          + index * 1013904223
          + wave.puffCount * 97
          + wave.flashCount * 131
        ) >>> 0,
      2166136261
    );
    const jitter01 = (index: number, salt: number): number => {
      let seed = (waveSeed + index * 374761393 + salt * 668265263) >>> 0;
      seed = (seed ^ (seed >>> 13)) >>> 0;
      seed = Math.imul(seed, 1274126177) >>> 0;
      return ((seed ^ (seed >>> 16)) >>> 0) / 0x100000000;
    };
    const wavePhaseDelayMs = Math.round(jitter01(0, 5) * 90);
    const burstWindowMs = singlePuffWave
      ? 0
      : Math.round(140 + jitter01(0, 11) * 170);
    for (let index = 0; index < pointCount; index += 1) {
      const point = wave.points[index]!;
      const flashDelayMs = Math.round(singlePuffWave
        ? wavePhaseDelayMs
        : wavePhaseDelayMs
          + jitter01(index, 7) * burstWindowMs
          + (jitter01(index, 17) - 0.5) * 26);
      if (index < flashPointCount) {
        window.setTimeout(() => {
          const burstScale = scale * (0.72 + jitter01(index, 13) * 0.28);
          const flashCount = singlePuffWave ? 1 : jitter01(index, 19) > 0.94 ? 2 : 1;
          void this.playFlakBurstAt(
            point.cx + (jitter01(index, 23) - 0.5) * 16,
            point.cy + (jitter01(index, 29) - 0.5) * 11,
            flashCount,
            burstScale,
            false
          );
        }, flashDelayMs);
      }

      if (singlePuffWave) {
        const smokeLingerMs = Math.max(1200, wave.smokeLingerMs ?? 1600);
        window.setTimeout(() => {
          void this.playCombatAnimationAt(
            "flakSmokePuff",
            point.cx + (jitter01(index, 37) - 0.5) * 12,
            point.cy - 5 + (jitter01(index, 41) - 0.5) * 10,
            _smokeScale * (0.92 + jitter01(index, 43) * 0.12),
            false,
            undefined,
            false
          );
        }, flashDelayMs + 150);
        window.setTimeout(() => {
          void this.playCombatAnimationAt(
            "flakSmokePuff",
            point.cx + (jitter01(index, 59) - 0.5) * 18,
            point.cy - 8 + (jitter01(index, 61) - 0.5) * 14,
            _smokeScale * (0.78 + jitter01(index, 67) * 0.14),
            false,
            undefined,
            false
          );
        }, flashDelayMs + Math.round(smokeLingerMs * 0.48));
      }

      if (!singlePuffWave && index < smokePointCount) {
        window.setTimeout(() => {
          void this.playCombatAnimationAt(
            "flakSmokePuff",
            point.cx + (jitter01(index, 37) - 0.5) * 18,
            point.cy - 5 + (jitter01(index, 41) - 0.5) * 14,
            _smokeScale * (0.88 + jitter01(index, 43) * 0.2),
            false,
            undefined,
            false
          );
        }, flashDelayMs + 220 + Math.round(jitter01(index, 47) * 140));
        if (jitter01(index, 53) > 0.88) {
          window.setTimeout(() => {
            void this.playCombatAnimationAt(
              "flakSmokePuff",
              point.cx + (jitter01(index, 59) - 0.5) * 24,
              point.cy - 8 + (jitter01(index, 61) - 0.5) * 18,
              _smokeScale * (0.76 + jitter01(index, 67) * 0.2),
              false,
              undefined,
              false
            );
          }, flashDelayMs + 620 + Math.round(jitter01(index, 71) * 220));
        }
      }
    }

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
          baseScale: targetIsHardTarget ? 0.42 : 0.36,
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
          baseScale: targetIsHardTarget ? 0.58 : 0.48,
          impactOffsets: targetIsHardTarget
            ? [
                [-12, -4],
                [9, 1]
              ]
            : [
                [-9, -3]
              ],
          staggerMs: 78
        };
      case "small_arms":
      default:
        return {
          animationType: "small_arms",
          baseScale: targetIsHardTarget ? 0.34 : 0.28,
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

  private chooseMuzzleFlashProfile(attackerHexKey: string): MuzzleFlashProfile {
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

  private chooseMuzzleFlashProfiles(attackerHexKey: string): MuzzleFlashProfile[] {
    const mix = this.resolveFormationFireMix(attackerHexKey);
    if (!mix.hasWeaponModel) {
      return [this.chooseMuzzleFlashProfile(attackerHexKey)];
    }

    const profiles: MuzzleFlashProfile[] = [];
    const smallArmsCount = this.chooseVisibleWeaponBurstCount(this.getRoleShots(mix, ["smallArms"]), 2, 4, 0.9);
    if (smallArmsCount > 0) {
      const smallArmsOffsets: Array<[number, number]> = [
        [0, 0],
        [-3, 1],
        [2, -2],
        [4, 1]
      ];
      profiles.push({
        animationType: "small_arms_muzzle",
        baseScale: 0.18,
        offsets: smallArmsOffsets.slice(0, smallArmsCount),
        staggerMs: 18,
        delayMs: 0
      });
    }

    const machineGunCount = this.chooseVisibleWeaponBurstCount(this.getRoleShots(mix, ["machineGun"]), 1, 3, 0.82);
    if (machineGunCount > 0) {
      const machineGunOffsets: Array<[number, number]> = [
        [-4, -1],
        [1, 3],
        [5, 0]
      ];
      profiles.push({
        animationType: "mg_muzzle",
        baseScale: 0.21,
        offsets: machineGunOffsets.slice(0, machineGunCount),
        staggerMs: 16,
        delayMs: 14
      });
    }

    const launcherShots = this.getRoleShots(mix, ["antiTank", "directHe", "indirectHe", "demolition", "airRocket"]);
    if (launcherShots > 0) {
      profiles.push({
        animationType: "cannon_muzzle",
        baseScale: mix.attackerClass === "artillery" ? 0.32 : 0.24,
        offsets: [[5, -1]],
        staggerMs: 24,
        delayMs: mix.attackerClass === "artillery" ? 0 : 54
      });
    }

    return profiles.length > 0 ? profiles : [this.chooseMuzzleFlashProfile(attackerHexKey)];
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

    const tileEntry = rowTiles[col];
    if (!tileEntry) {
      return "plain"; // Fallback
    }

    const tileDef = CoordinateSystem.resolveTile(tileEntry, this.scenarioData.tilePalette);
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
    const profiles = this.chooseMuzzleFlashProfiles(attackerHexKey);
    const visualBursts = profiles.flatMap((profile) =>
      profile.offsets.map(([offsetX, offsetY], index) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            const scale = index === 0 ? profile.baseScale : profile.baseScale * Math.max(0.72, 0.94 - index * 0.05);
            void this.playCombatAnimation(profile.animationType, attackerHexKey, offsetX, offsetY, scale, false).then(() => resolve());
          }, (profile.delayMs ?? 0) + index * profile.staggerMs);
        })
      )
    );

    await Promise.all([
      Promise.all(visualBursts).then(() => undefined),
      this.playWeaponSoundBurst(attackerHexKey, soundBursts, soundIntervalMs, gainMultiplier)
    ]);
  }

  /**
   * Plays an explosion animation at the defender's hex.
   * Large bombing calls fan out into a stick of smaller impacts.
   */
  async playExplosion(defenderHexKey: string, isLargeExplosion: boolean = false): Promise<void> {
    if (isLargeExplosion) {
      console.log(`[HexMapRenderer] playExplosion called - hex: ${defenderHexKey}, type: bombStick`);
      await this.playBombImpactStick(defenderHexKey, "Bomber", this.getUnitClassAt(defenderHexKey));
      console.log(`[HexMapRenderer] playExplosion completed for hex: ${defenderHexKey}`);
      return;
    }

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

  /** Renders a fast, layered tracer streak from attacker to defender and removes it quickly. */
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
    const baseLength = Math.hypot(dx, dy);
    if (baseLength <= 0.001) {
      return;
    }

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

    const shotDx = x2 - x1;
    const shotDy = y2 - y1;
    const length = Math.max(1, Math.hypot(shotDx, shotDy));
    const unitX = shotDx / length;
    const unitY = shotDy / length;
    const normalX = -unitY;
    const normalY = unitX;
    const angleDeg = Math.atan2(shotDy, shotDx) * 180 / Math.PI;
    const segScalar = options?.segLenScalar ?? 0.18;
    const coreLength = this.clamp(length * segScalar, 6, 24);
    const wakeLength = this.clamp(coreLength * 2.8, coreLength + 8, 58);
    const travelMs = Math.max(30, durationMs);

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("combat-projectile-tracer");
    group.style.pointerEvents = "none";

    const createLine = (stroke: string, width: number, opacity: number): SVGLineElement => {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x1));
      line.setAttribute("y2", String(y1));
      line.setAttribute("stroke", stroke);
      line.setAttribute("stroke-width", String(width));
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.style.opacity = String(opacity);
      group.appendChild(line);
      return line;
    };

    const wake = createLine(style.color, Math.max(style.width * 1.25, style.width + 0.45), 0);
    const glow = createLine(style.color, Math.max(style.width * 3.1, style.width + 1.4), 0);
    const core = createLine(style.color, style.width, 0);
    const hotCore = createLine("#fff7d0", Math.max(0.46, style.width * 0.46), 0);

    const head = document.createElementNS(SVG_NS, "ellipse");
    head.setAttribute("fill", "#fff4c7");
    head.setAttribute("rx", String(Math.max(1, style.width * 1.35)));
    head.setAttribute("ry", String(Math.max(0.45, style.width * 0.62)));
    head.style.opacity = "0";
    group.appendChild(head);
    layer.appendChild(group);

    const setSegment = (
      line: SVGLineElement,
      fromDistance: number,
      toDistance: number,
      lateralOffset = 0
    ): void => {
      const from = this.clamp(fromDistance, 0, length);
      const to = this.clamp(toDistance, 0, length);
      line.setAttribute("x1", String(x1 + unitX * from + normalX * lateralOffset));
      line.setAttribute("y1", String(y1 + unitY * from + normalY * lateralOffset));
      line.setAttribute("x2", String(x1 + unitX * to + normalX * lateralOffset));
      line.setAttribute("y2", String(y1 + unitY * to + normalY * lateralOffset));
    };

    return new Promise((resolve) => {
      const startTime = performance.now();
      const step: FrameRequestCallback = (now) => {
        const progress = this.clamp((now - startTime) / travelMs, 0, 1);
        const headDistance = this.clamp(progress * (length + coreLength) - coreLength * 0.35, 0, length);
        const tailDistance = headDistance - coreLength;
        const wakeTailDistance = headDistance - wakeLength;
        const rise = this.clamp(progress / 0.12, 0, 1);
        const fade = progress < 0.72 ? 1 : this.clamp(1 - (progress - 0.72) / 0.28, 0, 1);
        const opacity = rise * fade;

        setSegment(wake, wakeTailDistance, tailDistance, 0);
        setSegment(glow, tailDistance, headDistance, 0);
        setSegment(core, tailDistance, headDistance, 0);
        setSegment(hotCore, Math.max(tailDistance, headDistance - coreLength * 0.54), headDistance, 0);
        wake.style.opacity = String(0.18 * opacity);
        glow.style.opacity = String(0.2 * opacity);
        core.style.opacity = String(0.94 * opacity);
        hotCore.style.opacity = String(0.9 * opacity);

        const headX = x1 + unitX * headDistance;
        const headY = y1 + unitY * headDistance;
        head.setAttribute("cx", String(headX));
        head.setAttribute("cy", String(headY));
        head.setAttribute("transform", `rotate(${angleDeg} ${headX} ${headY})`);
        head.style.opacity = String(0.78 * opacity);

        if (progress >= 1) {
          group.remove();
          resolve();
          return;
        }

        this.scheduleAnimationFrame(step);
      };
      this.scheduleAnimationFrame(step);
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
      new Promise<void>((resolve, reject) => {
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
          ).then(resolve, reject);
        }, index * staggerMs);
      })
    );

    await Promise.all(burstPromises);
  }

  private resolveBombImpactPattern(attackerType?: string, defenderClass?: UnitClass): BombImpactPattern {
    const defenderIsAir = defenderClass === "air";
    const hardTargetScale = defenderClass === "vehicle" || defenderClass === "tank" ? 1.06 : 1;

    if (defenderIsAir) {
      return {
        impacts: [
          { offsetX: -8, offsetY: -4, scale: 0.84 },
          { offsetX: 8, offsetY: 3, scale: 0.7 }
        ],
        staggerMs: 70,
        projectileDurationMs: 520,
        projectileStaggerMs: 64,
        projectileRadius: 2.1,
        projectileArcHeight: 44,
        projectileCount: 2,
        dustScale: 0
      };
    }

    if (attackerType === "Bomber") {
      return {
        impacts: [
          { offsetX: -31, offsetY: -9, scale: 0.96 * hardTargetScale },
          { offsetX: -15, offsetY: 7, scale: 0.82 * hardTargetScale },
          { offsetX: 2, offsetY: -5, scale: 0.9 * hardTargetScale },
          { offsetX: 18, offsetY: 8, scale: 0.84 * hardTargetScale },
          { offsetX: 32, offsetY: -3, scale: 0.76 * hardTargetScale }
        ],
        staggerMs: 86,
        projectileDurationMs: 650,
        projectileStaggerMs: 66,
        projectileRadius: 2.35,
        projectileArcHeight: 58,
        projectileCount: 4,
        dustScale: 1.18
      };
    }

    return {
      impacts: [
        { offsetX: -17, offsetY: -6, scale: 0.86 * hardTargetScale },
        { offsetX: 3, offsetY: 7, scale: 0.78 * hardTargetScale },
        { offsetX: 19, offsetY: -2, scale: 0.72 * hardTargetScale }
      ],
      staggerMs: 78,
      projectileDurationMs: 560,
      projectileStaggerMs: 72,
      projectileRadius: 2.05,
      projectileArcHeight: 46,
      projectileCount: 2,
      dustScale: 1.04
    };
  }

  private createBombImpactSoundRequest(attackerType: string | undefined, impactIndex: number): QueuedWeaponSoundRequest | false {
    if (impactIndex === 0) {
      return {
        weaponClass: attackerType === "Bomber" ? "large_bomb" : "small_bomb",
        targetMaterial: "earth",
        playbackMode: "impact_only",
        gainMultiplier: attackerType === "Bomber" ? 0.62 : 0.54
      };
    }

    if (attackerType === "Bomber" && impactIndex === 2) {
      return {
        weaponClass: "small_bomb",
        targetMaterial: "earth",
        playbackMode: "impact_only",
        gainMultiplier: 0.36
      };
    }

    return false;
  }

  private async playBombImpactStick(
    defenderHexKey: string,
    attackerType?: string,
    defenderClass?: UnitClass,
    pattern: BombImpactPattern = this.resolveBombImpactPattern(attackerType, defenderClass)
  ): Promise<void> {
    const impactPromises = pattern.impacts.map((impact, index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playCombatAnimation(
            "explosionSmall",
            defenderHexKey,
            impact.offsetX,
            impact.offsetY,
            impact.scale,
            this.createBombImpactSoundRequest(attackerType, index)
          ).then(() => resolve());
        }, index * pattern.staggerMs);
      })
    );

    await Promise.all(impactPromises);
  }

  private async playBombReleaseArcs(
    attackerHexKey: string,
    defenderHexKey: string,
    pattern: BombImpactPattern
  ): Promise<void> {
    const projectileImpacts = pattern.impacts.slice(0, Math.min(pattern.projectileCount, pattern.impacts.length));
    const projectilePromises = projectileImpacts.map((impact, index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playArcedProjectile(attackerHexKey, defenderHexKey, pattern.projectileDurationMs, {
            color: "#2b2b2b",
            radius: pattern.projectileRadius,
            arcHeight: pattern.projectileArcHeight + index * 3,
            targetOffsetX: impact.offsetX,
            targetOffsetY: impact.offsetY
          }).then(() => resolve());
        }, index * pattern.projectileStaggerMs);
      })
    );

    await Promise.all(projectilePromises);
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
    const formationFireMix = this.resolveFormationFireMix(attackerHexKey);
    const suppressImpactFlash = useArcingArtilleryVisuals;

    const defenderElement = this.hexElementMap.get(defenderHexKey);
    const defenderCenter = defenderElement ? this.extractHexCenter(defenderElement) : null;
    const flashRadius = HEX_RADIUS * (useArcingArtilleryVisuals ? 1.55 : useAirBombingVisuals ? 1.08 : targetIsHardTarget ? 1.25 : 1.0);
    const flashIntensity = useArcingArtilleryVisuals ? 0.62 : useAirBombingVisuals ? 0.38 : targetIsHardTarget ? 0.55 : 0.4;
    const flashOverlayPromise = !suppressImpactFlash && defenderCenter
      ? this.playFlashOverlay(
          defenderCenter,
          flashRadius,
          flashIntensity,
          useArcingArtilleryVisuals ? 210 : useAirBombingVisuals ? 150 : targetIsHardTarget ? 160 : 130
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
      const bombPattern = this.resolveBombImpactPattern(attackerType, defenderClass);
      const bombPromise = this.playBombReleaseArcs(attackerHexKey, defenderHexKey, bombPattern);

      await new Promise((resolve) => setTimeout(resolve, attackerType === "Bomber" ? 360 : 320));

      const hitShakePromise = this.playHitShake(defenderHexKey, defenderIsAir ? 6 : targetIsHardTarget ? 6 : 5);
      const impactPromise = this.playBombImpactStick(defenderHexKey, attackerType, defenderClass, bombPattern);

      const sparksPromise = !defenderIsAir && targetIsHardTarget
        ? this.playSparkBurst(defenderHexKey, {
            attackerHexKey,
            attackerType,
            attackerClass,
            defenderClass,
            durationMs: 140,
            burstCount: attackerType === "Bomber" ? 2 : 1,
            scaleMultiplier: 0.9
          })
        : Promise.resolve();
      const dustPromise = !defenderIsAir
        ? new Promise<void>((resolve) => {
            window.setTimeout(() => {
              void this.playCombatAnimation("dustCloud", defenderHexKey, 0, 0, bombPattern.dustScale).then(() => resolve());
            }, 120);
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

    const tracerStyle = this.chooseTracerStyle(attackerClass);
    const tracerCount = this.chooseTracerCount(attackerClass);
    const tracerPromise = useSmallArmsVisuals
      ? this.playFormationTracerLayers(attackerHexKey, defenderHexKey, formationFireMix, targetIsHardTarget, defenderIsAir)
      : Promise.all(Array.from({ length: tracerCount }).map((_, index) =>
          new Promise<void>((resolve) => {
            window.setTimeout(() => {
              void this.playProjectileTracer(attackerHexKey, defenderHexKey, index === 0 ? 92 : 108, {
                style: tracerStyle,
                jitterPx: attackerClass === "vehicle" ? 2 : 0,
                segLenScalar: attackerClass === "tank" || attackerClass === "artillery" ? 0.24 : 0.16
              }).then(() => resolve());
            }, index * 58);
          })
        )).then(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, useSmallArmsVisuals ? 90 : 110));

    const hitShakePromise = this.playHitShake(defenderHexKey, targetIsHardTarget ? 5 : 4);

    if (useSmallArmsVisuals) {
      const formationImpactPromise = this.playFormationImpactDetails(
        attackerHexKey,
        defenderHexKey,
        formationFireMix,
        targetIsHardTarget,
        defenderIsAir
      );
      const sparksPromise = defenderIsAir || targetIsHardTarget
        ? this.playSparkBurst(defenderHexKey, {
            attackerHexKey,
            attackerType,
            attackerClass,
            defenderClass,
            durationMs: 120,
            rayCount: targetIsHardTarget ? 6 : 5,
            scaleMultiplier: 0.72
          })
        : Promise.resolve();
      const airBurstPromise = defenderIsAir ? this.playCombatAnimation("explosionSmall", defenderHexKey, 0, 0, 0.78, false) : Promise.resolve();
      const dustPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          if (defenderIsAir) {
            resolve();
            return;
          }
          void this.playCombatAnimation("dustCloud", defenderHexKey, 0, 0, 0.58, false).then(() => resolve());
        }, 95);
      });

      await Promise.all([
        flashPromise,
        tracerPromise,
        recoilPromise,
        markerPromise,
        hitShakePromise,
        formationImpactPromise,
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
      tracerPromise,
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
