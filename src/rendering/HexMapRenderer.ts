import type { IMapRenderer } from "../contracts/IMapRenderer";
import { normalizeFacingDirection, type HexEdgeFacing, type HexModification, type ScenarioData, type ScenarioUnit, type UnitClass, type UnitTypeDefinition } from "../core/types";
import { getSpriteForScenarioType } from "../data/unitSpriteCatalog";
import { HEX_RADIUS, HEX_HEIGHT, HEX_WIDTH } from "../core/balance";
import { CoordinateSystem, type TileDetails } from "./CoordinateSystem";
import { TerrainRenderer } from "./TerrainRenderer";
import { RoadOverlayRenderer } from "./RoadOverlayRenderer";
import { RiverOverlayRenderer } from "./RiverOverlayRenderer";
import { buildFringeHexMarkup, buildHexTileMarkup, type HexMapMarkupServices } from "./HexMapMarkupBuilder";
import { buildHexMapLayout } from "./HexMapLayout";
import { parseViewportTransform, type ViewportTransformMatrix } from "./ViewportTransform";
import { ProceduralEffectsAnimator, getZoomTier } from "./ProceduralEffects";
import { SpriteSheetAnimator } from "./SpriteSheetAnimator";
import { loadEffectSpecifications, type RawEffectSpec } from "./EffectSpecifications";
import { getTerrainTint, shouldUseTerrainResponse, loadTerrainTints, type TerrainTint } from "./TerrainResponseSystem";
import { WreckFxRenderer, resolveWreckFxClass, type WreckFxClass } from "./WreckFxRenderer";
import {
  CombatSoundManager,
  type CombatAudioAvailability,
  type QueuedWeaponSoundRequest
} from "../audio/CombatSoundManager";
import type { SoundCatalog, WeaponSoundClass } from "../audio/SoundAssetMetadata";
import {
  buildAirShowMapBounds,
  type AirShowMapBounds
} from "../ui/airshow/AirShowPlanner";
import { planAirShowTimeline } from "../ui/airshow/AirShowDirector";
import {
  sampleAirShowTimelineTrack,
  type AirShowTimeline,
  type AirShowTimelineCue
} from "../ui/airshow/AirShowTimeline";
import { describeAirShowTimeline } from "../ui/airshow/AirShowTimelineInspection";
import { resolveResolvedAirShowBombers } from "../ui/airshow/AirShowPlaybackScene";
import type {
  AirShowInspectionReport,
  AirShowPoint,
  PlannedAirShowFlight,
  PlannedAirShowScene,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowScene
} from "../ui/airshow/AirShowPlaybackScene";
import {
  beginAirShowRuntimeTrace,
  completeAirShowRuntimeTrace,
  recordAirShowRuntimeTraceEvent,
  recordAirShowTimelineBeat,
  recordAirShowTimelineComplete,
  recordAirShowTimelineCue,
  recordAirShowTimelineStart,
  type AirShowRuntimeTraceSession
} from "../ui/airshow/AirShowRuntimeTrace";
import {
  logAirShowPackageStart,
  logAirShowOwnershipAssert,
  logAirShowPackageEnd,
  type AirShowRole
} from "../ui/airshow/AirShowLogger";
import unitTypesData from "../data/unitSystem/derivedUnitTypes";
import { axialDirections } from "../core/Hex";
import {
  MIN_STRENGTH_PER_STACK_ACTOR,
  prepareUnitStackPresentation,
  resolveUnitStackCount,
  type ReconStatusKey,
  type RenderedStatusPip,
  type RenderedUnitStackMember,
  type UnitStackFormationPresentation
} from "./UnitStackPresentation";
export type {
  AirShowInspectionOriginPlan,
  AirShowInspectionPhaseTimingAudit,
  AirShowInspectionPhaseTimingRoleAudit
} from "../ui/airshow/AirShowPlanner";

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
export type { ReconStatusKey, RenderedUnitStackMember } from "./UnitStackPresentation";

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
  // Role-based size multipliers: bombers are 2x fighter size
  private static readonly AIRCRAFT_FIGHTER_SIZE_MULTIPLIER = 0.75;
  private static readonly AIRCRAFT_BOMBER_SIZE_MULTIPLIER = 1.5;
  // Role-based spacing multipliers (proportional to size to prevent overlap)
  private static readonly AIRCRAFT_FIGHTER_SPACING_MULTIPLIER = 0.75;
  private static readonly AIRCRAFT_BOMBER_SPACING_MULTIPLIER = 1.5;
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
  private readonly mapMarkupServices: HexMapMarkupServices = {
    terrainRenderer: this.terrainRenderer,
    roadRenderer: this.roadRenderer,
    riverRenderer: this.riverRenderer
  };
  private readonly reconOverlayState = new Map<string, ReconStatusKey>();
  private combatAnimator: ProceduralEffectsAnimator | null = null;
  private spriteSheetAnimator: SpriteSheetAnimator | null = null;
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
  /** Persistent battle-local casualty and equipment recovery markers. */
  private readonly recoverySiteMarkerMap: Map<string, SVGGElement> = new Map();
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
  /** Last camera transform already consumed; Firefox can report identical SVG attribute records repeatedly. */
  private lastObservedViewportTransform: string | null = null;
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

  private planResolvedAirCombatShow(scene: ResolvedAirShowScene): PlannedAirShowScene | null {
    const timeline = this.planResolvedAirCombatTimeline(scene);
    return timeline ? describeAirShowTimeline(timeline) : null;
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

  private async animateAirShowTimeline(scene: ResolvedAirShowScene, timeline: AirShowTimeline, callbacks: AirShowPlaybackCallbacks): Promise<void> {
    const layer = this.ensureCombatEffectsLayer();
    if (!layer) {
      return;
    }
    const plannedScene = describeAirShowTimeline(timeline);
    const runtimeTrace = beginAirShowRuntimeTrace(scene, timeline, plannedScene);
    const runtimeFlights = plannedScene.flights
      .map((flight) => this.buildAirShowRuntimeFlightFromPlan(layer, flight, runtimeTrace))
      .filter((flight): flight is AirShowRuntimeFlightInternal => !!flight);
    const sceneActors = runtimeFlights.flatMap((flight) => flight.actors);
    const actorsById = new Map(sceneActors.map((actor) => [actor.id, actor] as const));
    const destructionTimeByActorId = new Map(timeline.cues.flatMap(
      (cue) => cue.kind === "destruction" ? [[cue.actorId, cue.timeMs] as const] : []));
    const packageId = `ascene-v2-${Date.now()}-${timeline.seed.toString(36)}`;
    logAirShowPackageStart(packageId, "ResolvedAirCombat", "AirShowTimelinePlayer",
      plannedScene.flights.map((flight) => flight.id), plannedScene.flights.map((flight) => flight.role as AirShowRole), scene.hexKey);
    logAirShowOwnershipAssert(packageId, "AirShowTimelinePlayer", null);
    recordAirShowTimelineStart(runtimeTrace, timeline);
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
          const beatChanged = nextBeatLabel !== currentBeatLabel;
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

          if (beatChanged) {
            const activeActorIds = sceneActors.filter((actor) => actor.active).map((actor) => actor.id);
            recordAirShowTimelineBeat(runtimeTrace, currentBeatLabel, elapsedMs, activeActorIds);
          }

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
            recordAirShowTimelineCue(runtimeTrace, cue);
            nextCueIndex += 1;
          }

          if (elapsedMs >= timeline.totalDurationMs) {
            recordAirShowTimelineComplete(runtimeTrace, elapsedMs, nextCueIndex);
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
      completeAirShowRuntimeTrace(runtimeTrace, status, runtimeError);
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

    const previousSelection = this.highlightedHexKey;
    const previousZoneKeys = new Set(this.activeZoneKeys);
    const previousMoveOptionKeys = new Set(this.moveOptionHighlightKeys);
    const previousAttackTargetKeys = new Set(this.attackTargetHighlightKeys);

    this.resetReconOverlayState();
    const layout = buildHexMapLayout(data);
    for (const { entry, row, col } of layout.unresolvedTiles.slice(0, 5)) {
      console.warn(`[HexMapRenderer] Failed to resolve tile at [${row}][${col}]`, {
        entry,
        paletteKeys: Object.keys(data.tilePalette).slice(0, 10)
      });
    }
    const hexes = layout.hexes.map((hex) => {
      const recon = this.normalizeReconStatus(hex.tile.recon);
      this.trackHexReconStatus(CoordinateSystem.makeHexKey(hex.col, hex.row), recon);
      return { ...hex, recon };
    });

    console.info(`[HexMapRenderer] Tile resolution: ${hexes.length} resolved, ${layout.unresolvedTiles.length} unresolved, ${hexes.length} hexes to render`);
    if (hexes.length === 0) {
      svg.innerHTML = "";
      return;
    }

    const { width: mapWidth, height: mapHeight, minX, minY, margin, realAxialKeys } = layout;

    this.mapPixelWidth = mapWidth;
    this.mapPixelHeight = mapHeight;

    canvas.style.width = `${mapWidth}px`;
    canvas.style.height = `${mapHeight}px`;
    svg.setAttribute("viewBox", `0 0 ${mapWidth} ${mapHeight}`);
    svg.setAttribute("width", `${mapWidth}`);
    svg.setAttribute("height", `${mapHeight}`);

    // Generate SVG markup for all hexes, preceded by fringe ghost hexes that soften the map boundary.
    const fringeMarkup = buildFringeHexMarkup(realAxialKeys, hexes, minX, minY, margin, this.mapMarkupServices);
    const hexMarkup = fringeMarkup + hexes
      .map((hex) => buildHexTileMarkup(hex, minX, minY, margin, data, this.mapMarkupServices))
      .join("");

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

  private resolveViewportRootMatrix(): ViewportTransformMatrix {
    return parseViewportTransform(this.viewportRoot?.getAttribute("transform"));
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
    this.lastObservedViewportTransform = this.viewportRoot?.getAttribute("transform") ?? "";

    if (!this.viewportRoot) {
      return;
    }

    if (typeof MutationObserver !== "function") {
      this.syncCombatAnimationOverlayLayout();
      return;
    }

    this.combatAnimationOverlayObserver = new MutationObserver(() => {
      const transformValue = this.viewportRoot?.getAttribute("transform") ?? "";
      if (transformValue === this.lastObservedViewportTransform) {
        return;
      }
      this.lastObservedViewportTransform = transformValue;
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
    return this.soundManager.getAvailability().available && this.soundManager.getMasterVolume() > 0.001;
  }

  /** Separates browser capability from the commander's persisted sound preference. */
  getSoundAvailability(): CombatAudioAvailability {
    return this.soundManager.getAvailability();
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

  private renderUnitDecorations(
    group: SVGGElement,
    cx: number,
    cy: number,
    entrenchment: number,
    statusPips: readonly RenderedStatusPip[]
  ): void {
    const decorations = this.ensureDecorationGroup(group);
    decorations.replaceChildren();

    if (entrenchment > 0) {
      decorations.appendChild(this.renderEntrenchmentPips(cx, cy, entrenchment));
    }

    // Note: suppression/sentry/entrench state is set on the main unit-stack group in renderUnitStack
    // This method only renders visual decorations

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

  /** Removes every tactical recovery-site marker before the engine snapshot is redrawn. */
  clearRecoverySiteMarkers(): void {
    this.recoverySiteMarkerMap.forEach((marker) => marker.remove());
    this.recoverySiteMarkerMap.clear();
  }

  /** Renders a compact medical/maintenance marker in the lower corner of a hex. */
  renderRecoverySiteMarker(
    hexKey: string,
    options: { personnel: number; equipment: number; tooltip?: string }
  ): void {
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) return;
    this.recoverySiteMarkerMap.get(hexKey)?.remove();

    const cx = Number(cell.dataset.cx ?? 0);
    const cy = Number(cell.dataset.cy ?? 0);
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("recovery-site-marker");
    group.setAttribute("data-recovery-site", hexKey);
    group.setAttribute("pointer-events", "none");

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = options.tooltip ?? `Recovery site: ${options.personnel} personnel, ${options.equipment} equipment`;
    group.appendChild(title);

    const plate = document.createElementNS(SVG_NS, "rect");
    plate.setAttribute("x", String(cx - 27));
    plate.setAttribute("y", String(cy + 19));
    plate.setAttribute("width", "54");
    plate.setAttribute("height", "18");
    plate.setAttribute("rx", "5");
    plate.setAttribute("fill", "rgba(22, 18, 14, 0.92)");
    plate.setAttribute("stroke", "#f0b85c");
    plate.setAttribute("stroke-width", "1.5");
    group.appendChild(plate);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(cx));
    label.setAttribute("y", String(cy + 32));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "#ffe2a6");
    label.setAttribute("font-size", "10");
    label.setAttribute("font-weight", "700");
    label.textContent = `✚${Math.max(0, Math.round(options.personnel))} ⚙${Math.max(0, Math.round(options.equipment))}`;
    group.appendChild(label);

    const viewportRoot = this.viewportRoot || this.svgElement?.querySelector<SVGGElement>("#viewportRoot");
    (viewportRoot ?? this.svgElement)?.appendChild(group);
    this.recoverySiteMarkerMap.set(hexKey, group);
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

  private appendUnitStackFormation(
    group: SVGGElement,
    formation: UnitStackFormationPresentation,
    hexKey: string,
    cx: number,
    cy: number,
    iconSize: number
  ): void {
    if (!formation.hasRegisteredSprites) {
      console.error(
        "[HexMapRenderer] renderUnitStack: no sprite registered for unit type+faction — unit will render blank.",
        {
          type: formation.scenarioType,
          faction: formation.faction,
          hexKey,
          unitId: formation.unitId ?? undefined,
          controlledBy: formation.controlledBy ?? undefined,
          debug: {
            hasUnitId: Boolean(formation.unitId),
            hasControlledBy: Boolean(formation.controlledBy),
            isScenarioUnit: Boolean(formation.scenarioType),
            possibleFaction: formation.controlledBy === "Player" ? "Player" :
              formation.controlledBy === "AI" ? "Bot" : "Unknown"
          }
        }
      );
    }
    const formationGroup = document.createElementNS(SVG_NS, "g");
    formationGroup.classList.add("unit-stack-formation");
    formationGroup.dataset.slot = String(formation.slot);
    formationGroup.dataset.unitId = formation.unitId ?? `${formation.scenarioType}@${hexKey}:${formation.slot}`;
    formationGroup.dataset.faction = formation.faction;
    formationGroup.dataset.reconStatus = formation.reconStatus;

    const facingGroup = document.createElementNS(SVG_NS, "g");
    facingGroup.classList.add("unit-stack-facing");
    formation.layout.forEach((spec, posIndex) => {
      const resolvedHref = formation.spriteHrefs[posIndex] ?? null;
      const image = document.createElementNS(SVG_NS, "image");
      if (resolvedHref) image.setAttribute("href", resolvedHref);
      else image.removeAttribute("href");
      image.setAttribute("preserveAspectRatio", "xMidYMid meet");
      image.dataset.baseSize = String(iconSize);
      image.dataset.scale = String(spec.scale);
      image.dataset.ox = String(spec.ox);
      image.dataset.oy = String(spec.oy);
      image.classList.add("unit-icon", `faction-${formation.faction.toLowerCase()}`);
      image.classList.remove("spotted-only", "recon-identified", "recon-visible");
      image.style.removeProperty("filter");
      if (formation.reconStatus === "spotted") {
        image.style.opacity = "0.94";
        image.classList.add("spotted-only");
      } else if (formation.reconStatus === "identified") {
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
    this.renderUnitDecorations(
      formationGroup,
      cx + formation.decorationOffset.dx,
      cy + formation.decorationOffset.dy,
      formation.entrenchmentLevel,
      formation.statusPips
    );
    this.applyFacingAngleToGroup(formationGroup, cx, cy, formation.facingAngleDeg);
  }

  /**
   * Renders one or two formations on a hex. Additional units are intentionally hidden once the visible cap is
   * reached so stacked combat tiles remain readable.
   */
  renderUnitStack(hexKey: string, members: readonly RenderedUnitStackMember[]): void {
    const cell = this.hexElementMap.get(hexKey);
    const presentation = prepareUnitStackPresentation(members);
    if (!cell || !presentation) {
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

    const primary = presentation.primary;
    this.hexUnitScenarioTypeMap.set(hexKey, primary.scenarioType);
    try {
      const def = (unitTypesData as Record<string, UnitTypeDefinition>)[primary.scenarioType];
      if (def?.class) {
        this.hexUnitClassMap.set(hexKey, def.class);
      }
    } catch {}

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("unit-stack");
    group.dataset.reconStatus = primary.reconStatus;
    group.dataset.stackCount = String(presentation.formations.length);

    presentation.formations.forEach((formation) => {
      this.appendUnitStackFormation(group, formation, hexKey, cx, cy, iconSize);
    });

    group.dataset.suppressionState = primary.suppressionState;
    group.dataset.sentryState = primary.sentryState;
    group.dataset.entrenchLevel = String(primary.entrenchmentLevel);

    if (primary.suppressionState === "suppressed") {
      group.classList.add("unit-stack--suppressed");
    } else if (primary.suppressionState === "pinned" || primary.suppressionState === "broken") {
      group.classList.add(primary.suppressionState === "broken" ? "unit-stack--broken" : "unit-stack--pinned");
    }

    this.positionUnitStack(group, cx, cy);
    const storedAngle = this.hexUnitFacingAngleMap.get(hexKey) ?? null;
    if (storedAngle !== null && presentation.formations.length === 1) {
      this.applyFacingAngleToGroup(group, cx, cy, storedAngle);
    } else if (storedAngle === null && presentation.formations.length === 1) {
      this.hexUnitFacingAngleMap.set(hexKey, primary.facingAngleDeg);
    } else if (presentation.formations.length > 1) {
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
    const stackCount = resolveUnitStackCount(strength);
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
    return spec.role === "bomber" ? MIN_STRENGTH_PER_STACK_ACTOR : 0;
  }

  private resolveScenarioViewportPointForOffsetCoordinate(col: number, row: number): AirShowPoint | null {
    const data = this.scenarioData;
    if (!data) {
      return null;
    }
    const layout = buildHexMapLayout(data);
    if (layout.hexes.length === 0) {
      return null;
    }

    const axial = CoordinateSystem.offsetToAxial(col, row);
    const pixel = CoordinateSystem.axialToPixel(axial.q, axial.r);
    return {
      cx: pixel.x - layout.minX + layout.margin,
      cy: pixel.y - layout.minY + layout.margin
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

  private resolveAirShowMapBounds(): AirShowMapBounds | null {
    const centers = Array.from(this.hexElementMap.values())
      .map((cell) => this.extractHexCenter(cell))
      .filter((center): center is AirShowPoint => !!center);
    return buildAirShowMapBounds(centers, HEX_WIDTH, HEX_HEIGHT);
  }



  private buildAirShowRuntimeFlightFromPlan(
    layer: SVGGElement,
    flight: PlannedAirShowFlight,
    runtimeTrace: AirShowRuntimeTraceSession | null
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
      recordAirShowRuntimeTraceEvent(runtimeTrace, {
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


  /**
   * Calculates minimum center-to-center spacing between aircraft sprites based on roles.
   * Same-role: 0.8 sprite widths | Different-role: 1.0 sprite widths
   */

  /**
   * Detects sprite collisions and resolves spacing violations.
   * Returns corrected positions with enforced minimum spacing.
   */

  /**
   * Assigns altitude lanes when aircraft density exceeds threshold (>6 aircraft).
   * Fans aircraft into layered offsets to prevent visual congestion.
   */

  /**
   * Expands combat ellipse when screen-space density exceeds threshold.
   * Pre-rendering adjustment to ensure adequate spacing before animation.
   */



















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



























































































  /**
   * Resolves collision-aware spacing across all phase assignments.
   * Enforces minimum spacing between actors from different flights during combat phases.
   * Per North Star Spec: 0.8 sprite widths (same-role), 1.0 (different-role).
   */





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







  private resolveAirShowTracerTargetPoint(target: AirShowRuntimeActor | AirShowPoint): AirShowPoint {
    return "image" in target ? target.position : target;
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





  /**
   * Phase 0.4: Spatial zone helper functions for linked strike packages.
   * These enforce spatial separation between combat volume (dogfight) and bomber corridor (strike path).
   */

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

    console.log(`[HexMapRenderer] playExplosion called - hex: ${defenderHexKey}, type: explosionSmall, scale: 1.2`);
    await this.playCombatAnimation("explosionSmall", defenderHexKey, 0, 0, 1.2);
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
