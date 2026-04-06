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
    faction?: SpriteRenderFaction
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

    const iconSize = 40;
    const ghost = this.createAircraftFormationGhost(spriteHref, iconSize, strength);
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
    faction?: SpriteRenderFaction
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

    const iconSize = 40;
    const ghost = this.createAircraftFormationGhost(spriteHref, iconSize, strength);
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
  async animateAircraftOrbitAt(
    hexKey: string,
    scenarioType: string,
    durationMs = 800,
    strength?: number,
    laneOffsetPx = 0,
    faction?: SpriteRenderFaction,
    options: AircraftOrbitOptions = {}
  ): Promise<void> {
    if (!this.svgElement) {
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

    const spriteHref = getSpriteForScenarioType(scenarioType, faction);
    if (!spriteHref) {
      return;
    }

    const iconSize = 40;
    const ghost = this.createAircraftFormationGhost(spriteHref, iconSize, strength);
    const isFormation = ghost instanceof SVGGElement;
    const layer = this.ensureCombatEffectsLayer();
    if (!layer) {
      return;
    }
    layer.appendChild(ghost);

    const orbitRadiusPx = Math.max(10, options.orbitRadiusPx ?? (20 + Math.min(10, Math.abs(laneOffsetPx) * 0.25)));
    const turns = Math.max(0.25, options.turns ?? 1.5);
    const startAngleRad = options.startAngleRad ?? 0;
    const direction = options.clockwise === false ? -1 : 1;
    const verticalScale = Math.max(0.4, options.verticalScale ?? 0.7);

    const stepOrbit = (progress: number): void => {
      const angle = startAngleRad + direction * progress * turns * Math.PI * 2;
      const centerX = center.cx + Math.cos(angle) * orbitRadiusPx;
      const centerY = center.cy + Math.sin(angle) * orbitRadiusPx * verticalScale;
      const tangentX = -Math.sin(angle) * orbitRadiusPx * direction;
      const tangentY = Math.cos(angle) * orbitRadiusPx * verticalScale * direction;
      const headingDegrees = this.resolveAircraftHeadingDegrees(tangentX, tangentY);
      this.positionAircraftGhost(ghost, isFormation, iconSize, centerX, centerY, headingDegrees);
      options.onProgress?.(progress, centerX, centerY);
    };

    if (durationMs <= 0) {
      stepOrbit(1);
      ghost.remove();
      return;
    }

    stepOrbit(0);
    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step: FrameRequestCallback = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        stepOrbit(progress);
        if (progress >= 1) {
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
    faction?: SpriteRenderFaction
  ): Promise<void> {
    await this.animateAircraftArc(fromKey, toKey, scenarioType, legDurationMs, undefined, 1, strength, laneOffsetPx, faction);
    if (pauseMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, pauseMs));
    }
    await this.animateAircraftArc(toKey, fromKey, scenarioType, legDurationMs, undefined, 1, strength, laneOffsetPx, faction);
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

    const iconSize = 40;
    const ghost = this.createAircraftFormationGhost(spriteHref, iconSize, options.strength);
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

    const tracerCount = 12;
    const burstCount = 12;
    const tracerLifetimeMs = 220;
    const burstLifetimeMs = 260;

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
      const tracerDelayMs = index * 10;

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("stroke", index % 3 === 0 ? "#fff7d9" : index % 2 === 0 ? "#ffd68c" : "#ffb14f");
      line.setAttribute("stroke-width", String(index % 4 === 0 ? 0.9 : 0.74));
      line.setAttribute("stroke-linecap", "round");
      line.style.opacity = "0";
      line.style.strokeDasharray = `${Math.max(4, tracerLength * 0.65)} ${dashGap}`;
      line.style.strokeDashoffset = String(dashGap);
      burstGroup.appendChild(line);

      window.setTimeout(() => {
        line.style.transition = `stroke-dashoffset ${tracerLifetimeMs}ms linear, opacity ${Math.max(90, tracerLifetimeMs - 40)}ms ease-out`;
        line.style.opacity = "0.95";
        line.style.strokeDashoffset = "0";
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
      const flashDelayMs = 12 + index * 9;

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
        cluster.style.transition = `opacity ${burstLifetimeMs}ms ease-out`;
        cluster.style.opacity = "1";
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
      }, 320);
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

    group.classList.remove("unit-stack--suppressed", "unit-stack--pinned");
    group.dataset.suppressionState = suppressionState;
    group.dataset.sentryState = unit.onSentry ? "on" : "off";
    group.dataset.entrenchLevel = String(entrenchment);

    const statusPips: Array<"sentry" | "suppressed" | "pinned"> = [];
    if (unit.onSentry) {
      statusPips.push("sentry");
    }
    if (suppressionState === "suppressed" || suppressionState === "pinned") {
      group.classList.add(suppressionState === "pinned" ? "unit-stack--pinned" : "unit-stack--suppressed");
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
   * Resolves formation layout for aircraft sprites based on strength.
   * Returns positions for 1-4 sprites in tactical flight formations.
   */
  private resolveAircraftFormationLayout(
    strength: number
  ): Array<{ ox: number; oy: number; scale: number }> {
    const stackCount = this.resolveUnitStackCount(strength);
    const spacing = 22; // pixels between aircraft in formation

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
   * Creates a formation group for aircraft animations showing multiple sprites based on strength.
   * Falls back to single sprite if strength is not provided (backward compatibility).
   */
  private createAircraftFormationGhost(
    spriteHref: string,
    iconSize: number,
    strength?: number
  ): SVGGElement | SVGImageElement {
    // Backward compatibility: if no strength provided, use single sprite
    if (strength === undefined || strength === null) {
      return this.createMoveGhost(spriteHref, iconSize, iconSize);
    }

    const formationGroup = document.createElementNS(SVG_NS, "g");
    formationGroup.classList.add("aircraft-formation");
    formationGroup.style.pointerEvents = "none";

    const layout = this.resolveAircraftFormationLayout(strength);

    layout.forEach((spec, index) => {
      const sprite = document.createElementNS(SVG_NS, "image");
      sprite.setAttribute("href", spriteHref);
      const spriteSize = iconSize * spec.scale;
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
      return fallbackDegrees;
    }
    return Math.atan2(dy, dx) * (180 / Math.PI) + 90;
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
    terrainTint?: string
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

    const dedupeWindowMs = this.getEffectDedupeWindowMs(animationType);
    const effectKey = `${animationType}:${Math.round(x)}:${Math.round(y)}:${Math.round(scale * 100)}`;
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
  async playFlakBurstAt(x: number, y: number, count: number = 1, scale: number = 1.08): Promise<void> {
    const burstCount = Math.max(1, count);
    const spreadPx = burstCount === 1 ? 8 : Math.min(24, 10 + burstCount * 2.5);
    const burstPromises = Array.from({ length: burstCount }).map((_, index) => {
      const ratio = burstCount === 1 ? 0.5 : index / burstCount;
      const angle = ratio * Math.PI * 2 + Math.PI / 6;
      const radius = burstCount === 1 ? 0 : spreadPx * (0.55 + (index % 2) * 0.18);
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius * 0.72;
      const burstScale = scale * (index === 0 ? 1 : Math.max(0.78, 0.96 - index * 0.05));
      return new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.playCombatAnimationAt("flakBurst", x + offsetX, y + offsetY, burstScale, false).then(() => resolve());
        }, index * 70);
      });
    });

    await Promise.all(burstPromises);
  }

  /**
   * Plays a faint smoke puff that can trail a damaged aircraft on egress.
   */
  async playAirDamageSmokeTrailAt(x: number, y: number, scale: number = 0.72): Promise<void> {
    await this.playCombatAnimationAt("airDamageSmoke", x, y, scale, false);
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
