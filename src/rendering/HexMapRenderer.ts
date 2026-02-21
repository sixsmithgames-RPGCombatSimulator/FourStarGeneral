import type { IMapRenderer } from "../contracts/IMapRenderer";
import type { ScenarioData, ScenarioUnit, TerrainDictionary, UnitClass, UnitTypeDefinition } from "../core/types";
import { getSpriteForScenarioType } from "../data/unitSpriteCatalog";
import { HEX_RADIUS, HEX_HEIGHT, HEX_WIDTH } from "../core/balance";
import { CoordinateSystem, type TileDetails } from "./CoordinateSystem";
import { TerrainRenderer } from "./TerrainRenderer";
import { RoadOverlayRenderer } from "./RoadOverlayRenderer";
import { SpriteSheetAnimator, COMBAT_ANIMATIONS } from "./SpriteSheetAnimator";
import terrainData from "../data/terrain.json";
import unitTypesData from "../data/unitTypes.json";
import { hexLine, type Axial } from "../core/Hex";

/**
 * Recon status types.
 */
export type ReconStatusKey = "unknown" | "spotted" | "identified" | "visible";

/**
 * Hex rendering configuration constants.
 */
const HEX_DEFAULT_STROKE = "#2a2a2a";
const HEX_DEFAULT_STROKE_WIDTH = 1;
const SVG_NS = "http://www.w3.org/2000/svg";
const SELECTION_GLOW_CLASS = "hex-selection-glow";
const ACTIVE_ZONE_CLASS = "deployment-zone";
const IDLE_UNIT_HIGHLIGHT_CLASS = "idle-unit-highlight";
/**
 * Static sprite used for the base camp marker. Using new URL ensures bundlers resolve the asset with type safety.
 */
const BASE_CAMP_MARKER_SPRITE = new URL("../assets/units/Base_camp.png", import.meta.url).href;
const BASE_CAMP_MARKER_CLASS = "base-camp-marker";
const BASE_CAMP_MARKER_SIZE = HEX_RADIUS * 1.8;
const TRANSPORT_SHIP_SPRITE = new URL("../assets/units/Transport_Ship.png", import.meta.url).href;

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

 type AftermathEntry = {
   smokeLevel: 0 | 1 | 2;
   flames: boolean;
   wreck: boolean;
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
  /**
   * Tracks temporary boat overlays so maritime transport visuals can be updated or removed alongside unit icons.
   */
  private hexBoatOverlayMap = new Map<string, SVGImageElement>();
  private baseCampMarker: SVGImageElement | null = null;
  private baseCampHexKey: string | null = null;
  private initialized = false;

  private readonly terrainRenderer = new TerrainRenderer();
  private readonly roadRenderer = new RoadOverlayRenderer();
  private readonly reconOverlayState = new Map<string, ReconStatusKey>();
  private combatAnimator: SpriteSheetAnimator | null = null;

  private hexClickHandler: ((key: string) => void) | null = null;
  private selectionChangedHandler: ((key: string | null) => void) | null = null;
  private highlightedHexKey: string | null = null;
  private readonly activeZoneKeys = new Set<string>();
  private readonly idleUnitHighlightKeys = new Set<string>();
  /** Tracks the unit class occupying each hex so effects can vary by attacker/defender type. */
  private readonly hexUnitClassMap: Map<string, UnitClass> = new Map();
  /** Tracks the unit scenario type occupying each hex so visuals can vary beyond the broad UnitClass. */
  private readonly hexUnitScenarioTypeMap: Map<string, string> = new Map();
  private readonly aftermathByHexKey: Map<string, AftermathEntry> = new Map();
  private selectionGlow: SVGCircleElement | null = null;

  private svgElement: SVGSVGElement | null = null;
  private canvasElement: HTMLDivElement | null = null;
  private scenarioData: ScenarioData | null = null;
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;
  /** Dedicated overlay for combat effects so muzzle flashes/explosions render above unit sprites. */
  private combatEffectsLayer: SVGGElement | null = null;
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

  /**
   * Animates a temporary aircraft sprite flying from one hex to another without mutating unit icons.
   * Used for Air Support visuals (arrivals and air-to-air engagements) so sorties can be shown "in action".
   */
  async animateAircraftFlyover(fromKey: string, toKey: string, scenarioType: string, durationMs = 2800): Promise<void> {
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

    const spriteHref = getSpriteForScenarioType(scenarioType);
    if (!spriteHref) {
      console.error("[HexMapRenderer] animateAircraftFlyover skipped: missing sprite mapping for scenarioType", {
        fromKey,
        toKey,
        scenarioType
      });
      return;
    }

    const iconSize = 40;
    const startX = startCenter.cx - iconSize / 2;
    const startY = startCenter.cy - iconSize / 2;
    const endX = endCenter.cx - iconSize / 2;
    const endY = endCenter.cy - iconSize / 2;

    const ghost = this.createMoveGhost(spriteHref, iconSize, iconSize);
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
    ghost.setAttribute("x", String(startX));
    ghost.setAttribute("y", String(startY));

    if (durationMs <= 0) {
      ghost.setAttribute("x", String(endX));
      ghost.setAttribute("y", String(endY));
      ghost.remove();
      return;
    }

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step: FrameRequestCallback = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const eased = this.easeInOut(t);
        const x = startX + (endX - startX) * eased;
        const y = startY + (endY - startY) * eased;
        ghost.setAttribute("x", String(x));
        ghost.setAttribute("y", String(y));
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
   */
  async animateAircraftArc(fromKey: string, toKey: string, scenarioType: string, durationMs = 2800): Promise<void> {
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

    const spriteHref = getSpriteForScenarioType(scenarioType);
    if (!spriteHref) {
      console.error("[HexMapRenderer] animateAircraftArc skipped: missing sprite mapping for scenarioType", {
        fromKey,
        toKey,
        scenarioType
      });
      return;
    }

    const iconSize = 40;
    const startX = startCenter.cx - iconSize / 2;
    const startY = startCenter.cy - iconSize / 2;
    const endX = endCenter.cx - iconSize / 2;
    const endY = endCenter.cy - iconSize / 2;

    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    // Perpendicular normal for arc offset; fixed orientation keeps visuals predictable.
    const nx = -dy / distance;
    const ny = dx / distance;
    const arcAmplitude = distance * 0.3;
    const controlX = (startX + endX) / 2 + nx * arcAmplitude;
    const controlY = (startY + endY) / 2 + ny * arcAmplitude;

    const ghost = this.createMoveGhost(spriteHref, iconSize, iconSize);
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
    ghost.setAttribute("x", String(startX));
    ghost.setAttribute("y", String(startY));

    if (durationMs <= 0) {
      ghost.setAttribute("x", String(endX));
      ghost.setAttribute("y", String(endY));
      ghost.remove();
      return;
    }

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step: FrameRequestCallback = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const eased = this.easeInOut(t);
        const oneMinusT = 1 - eased;
        // Quadratic Bézier interpolation between start, control, and end.
        const bx = oneMinusT * oneMinusT * startX + 2 * oneMinusT * eased * controlX + eased * eased * endX;
        const by = oneMinusT * oneMinusT * startY + 2 * oneMinusT * eased * controlY + eased * eased * endY;
        ghost.setAttribute("x", String(bx));
        ghost.setAttribute("y", String(by));
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
   * Convenience helper for mission-style flights that should clearly depart and return.
   * Flies an arc from origin to destination, pauses briefly, then flies a mirrored arc back.
   */
  async animateAircraftRoundTrip(
    fromKey: string,
    toKey: string,
    scenarioType: string,
    legDurationMs = 2200,
    pauseMs = 300
  ): Promise<void> {
    await this.animateAircraftArc(fromKey, toKey, scenarioType, legDurationMs);
    if (pauseMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, pauseMs));
    }
    await this.animateAircraftArc(toKey, fromKey, scenarioType, legDurationMs);
  }

  /** Plays a brief tracer effect at the given hex key to indicate aerial gunfire. */
  async playDogfight(hexKey: string): Promise<void> {
    await this.playCombatAnimation("tracer", hexKey, 0, 0, 1.2);
  }

  /**
   * Ensures the persistent base camp marker element exists so it can be reused across renders.
   */
  private ensureBaseCampMarker(svg: SVGSVGElement): void {
    if (this.baseCampMarker) {
      if (!this.baseCampMarker.isConnected) {
        svg.appendChild(this.baseCampMarker);
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
    svg.appendChild(marker);
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

    // Reset combat overlay each render because assigning innerHTML clears prior nodes.
    this.combatEffectsLayer = null;
    this.combatAnimator = null;

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
    const markup = hexes.map((hex) => this.renderHex(hex, minX, minY, margin, data)).join("");
    svg.innerHTML = markup;
    this.ensureSelectionGlow(svg);
    this.cacheHexReferences();
    this.applyReconOverlayClasses();
    this.rebindHexInteractions();
    this.rehydrateAftermathOverlays();

    // Recreate the combat overlay after base geometry so effects render above units/terrain.
    const effectsLayer = this.ensureCombatEffectsLayer();
    if (!this.combatAnimator && effectsLayer) {
      this.combatAnimator = new SpriteSheetAnimator(effectsLayer);
    }

    if (previousSelection) {
      this.highlightedHexKey = null;
      this.applyHexSelection(previousSelection, true);
    }

    if (previousZoneKeys.size > 0) {
      this.setZoneHighlights(previousZoneKeys);
    } else if (this.activeZoneKeys.size > 0) {
      this.setZoneHighlights([]);
    }

    if (this.baseCampHexKey) {
      this.renderBaseCampMarker(this.baseCampHexKey);
    }
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
    this.hexBoatOverlayMap.clear();

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

  private resolveUnitStackLayout(count: number): Array<{ ox: number; oy: number; scale: number }> {
    const normalizedCount = Math.max(1, Math.min(4, Math.round(count)));
    const spread = 20;

    // These scales intentionally change gradually from 4 -> 1 so the last remaining sprite
    // doesn't "pop" larger when the unit takes damage.
    const scaleByCount: Record<number, number> = {
      1: 0.82,
      2: 0.76,
      3: 0.7,
      4: 0.66
    };

    const scale = scaleByCount[normalizedCount] ?? 0.7;

    if (normalizedCount <= 1) {
      return [{ ox: 0, oy: 0, scale }];
    }

    if (normalizedCount === 2) {
      return [
        { ox: -spread, oy: 0, scale },
        { ox: spread, oy: 0, scale }
      ];
    }

    if (normalizedCount === 3) {
      return [
        { ox: 0, oy: -spread, scale },
        { ox: -spread, oy: 0, scale },
        { ox: spread, oy: 0, scale }
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

  private resolveFacingAngleDeg(facing: ScenarioUnit["facing"]): number {
    const facingVectors: Record<ScenarioUnit["facing"], { q: number; r: number }> = {
      N: { q: 0, r: -1 },
      NE: { q: 1, r: -1 },
      SE: { q: 1, r: 0 },
      S: { q: 0, r: 1 },
      SW: { q: -1, r: 1 },
      NW: { q: -1, r: 0 }
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

  private applyFacingAngleToGroup(group: SVGGElement, cx: number, cy: number, angleDeg: number): void {
    const facingGroup = this.ensureFacingGroup(group);
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
  private rebindHexInteractions(): void {
    if (!this.svgElement) {
      return;
    }

    const hexCells = Array.from(this.svgElement.querySelectorAll<SVGGElement>(".hex-cell"));
    hexCells.forEach((cell) => {
      const key = cell.dataset.hex;
      if (!key) {
        return;
      }
      cell.onclick = null;
      if (this.hexClickHandler) {
        cell.addEventListener("click", () => {
          this.hexClickHandler?.(key);
          // Also broadcast a DOM event so non-renderer components (e.g., PopupManager) can react to map picks.
          document.dispatchEvent(new CustomEvent("battle:hexClicked", { detail: { offsetKey: key } }));
        });
      }
    });
  }

  /**
   * Retrieves a cached hex element by key.
   */
  getHexElement(key: string): SVGGElement | undefined {
    return this.hexElementMap.get(key);
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
    svg.insertBefore(glow, svg.firstChild);
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
   * Applies or removes the idle-unit outline on the specified hex key.
   * The outline uses a dedicated CSS class so the highlight style remains overridable via stylesheets.
   */
  toggleIdleUnitHighlight(hexKey: string, enabled: boolean): void {
    const group = this.hexElementMap.get(hexKey);
    const polygon = this.hexPolygonMap.get(hexKey);

    if (enabled) {
      group?.classList.add(IDLE_UNIT_HIGHLIGHT_CLASS);
      polygon?.classList.add(IDLE_UNIT_HIGHLIGHT_CLASS);
      this.idleUnitHighlightKeys.add(hexKey);
    } else {
      group?.classList.remove(IDLE_UNIT_HIGHLIGHT_CLASS);
      polygon?.classList.remove(IDLE_UNIT_HIGHLIGHT_CLASS);
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
    const group = this.hexElementMap.get(hexKey);
    const polygon = this.hexPolygonMap.get(hexKey);
    if (enabled) {
      group?.classList.add(ACTIVE_ZONE_CLASS);
      polygon?.classList.add(ACTIVE_ZONE_CLASS);
    } else {
      group?.classList.remove(ACTIVE_ZONE_CLASS);
      polygon?.classList.remove(ACTIVE_ZONE_CLASS);
    }
  }

  /**
   * Resets stored recon overlay state prior to a re-render.
   */
  resetReconOverlayState(): void {
    this.reconOverlayState.clear();
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

  /**
   * Renders or updates a unit icon on a hex cell.
   * @param hexKey - The hex coordinate key
   * @param unit - The unit to render
   * @param faction - The faction (Player or Bot)
   * @param isSpottedOnly - If true, renders unit with reduced opacity (spotted via recon, no direct LOS)
   */
  renderUnit(hexKey: string, unit: ScenarioUnit, faction: "Player" | "Bot", isSpottedOnly = false): void {
    const cell = this.hexElementMap.get(hexKey);
    if (!cell) {
      return;
    }

    const existingAftermath = this.aftermathByHexKey.get(hexKey);
    if (existingAftermath?.wreck) {
      this.removeAftermathOverlay(hexKey);
    }

    const existing = this.hexUnitImageMap.get(hexKey) ?? null;
    const cx = Number(cell.dataset.cx ?? 0);
    const cy = Number(cell.dataset.cy ?? 0);
    const iconSize = 40;

    const spriteHref = getSpriteForScenarioType(unit.type as string);
    // Cache the unit class for this hex so combat effects can style by weapon/armor type.
    try {
      const def = (unitTypesData as Record<string, UnitTypeDefinition>)[unit.type as string];
      if (def && def.class) {
        this.hexUnitClassMap.set(hexKey, def.class);
      }
    } catch {}
    this.hexUnitScenarioTypeMap.set(hexKey, String(unit.type));
    const terrain = (cell.dataset.terrain ?? "").toLowerCase();
    const terrainType = (cell.dataset.terrainType ?? "").toLowerCase();
    if (this.isMaritimeTerrain(terrain, terrainType)) {
      this.ensureBoatOverlay(hexKey, cell, cx, cy, iconSize);
    } else {
      this.removeBoatOverlay(hexKey);
    }

    const stackCount = this.resolveUnitStackCount(unit.strength);
    const layout = this.resolveUnitStackLayout(stackCount);

    const applyImageAttributes = (image: SVGImageElement, spec: { ox: number; oy: number; scale: number }): void => {
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
      image.classList.add("unit-icon");
      image.classList.remove("faction-player", "faction-bot");
      image.classList.add(`faction-${faction.toLowerCase()}`);

      if (isSpottedOnly) {
        image.style.opacity = "0.5";
        image.classList.add("spotted-only");
      } else {
        image.style.removeProperty("opacity");
        image.classList.remove("spotted-only");
      }
    };

    if (existing) {
      this.ensureFacingGroup(existing);
      const cachedClass = this.hexUnitClassMap.get(hexKey);
      if (cachedClass) {
        existing.dataset.unitClass = String(cachedClass);
      }
      const images = Array.from(existing.querySelectorAll<SVGImageElement>("image.unit-icon"));
      if (images.length !== stackCount) {
        existing.remove();
        this.hexUnitImageMap.delete(hexKey);
      } else {
        images.forEach((image, idx) => {
          const spec = layout[idx] ?? layout[0];
          applyImageAttributes(image, spec);
        });
        this.positionUnitStack(existing, cx, cy);
        const storedAngle = this.hexUnitFacingAngleMap.get(hexKey);
        const angleDeg = storedAngle ?? this.resolveFacingAngleDeg(unit.facing);
        this.applyFacingAngleToGroup(existing, cx, cy, angleDeg);
        if (storedAngle === undefined) {
          this.hexUnitFacingAngleMap.set(hexKey, angleDeg);
        }
        return;
      }
    }

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("unit-stack");
    const cachedClass = this.hexUnitClassMap.get(hexKey);
    if (cachedClass) {
      group.dataset.unitClass = String(cachedClass);
    }
    const facingGroup = document.createElementNS(SVG_NS, "g");
    facingGroup.classList.add("unit-stack-facing");
    layout.forEach((spec) => {
      const image = document.createElementNS(SVG_NS, "image");
      applyImageAttributes(image, spec);
      facingGroup.appendChild(image);
    });
    group.appendChild(facingGroup);
    this.positionUnitStack(group, cx, cy);
    const storedAngle = this.hexUnitFacingAngleMap.get(hexKey);
    const angleDeg = storedAngle ?? this.resolveFacingAngleDeg(unit.facing);
    this.applyFacingAngleToGroup(group, cx, cy, angleDeg);
    if (storedAngle === undefined) {
      this.hexUnitFacingAngleMap.set(hexKey, angleDeg);
    }
    cell.appendChild(group);
    this.hexUnitImageMap.set(hexKey, group);
  }

  /**
   * Removes a unit icon from the specified hex if present.
   */
  clearUnit(hexKey: string): void {
    const group = this.hexUnitImageMap.get(hexKey);
    if (!group) {
      this.removeBoatOverlay(hexKey);
      return;
    }
    group.remove();
    this.hexUnitImageMap.delete(hexKey);
    this.removeBoatOverlay(hexKey);
    this.hexUnitClassMap.delete(hexKey);
    this.hexUnitScenarioTypeMap.delete(hexKey);
    this.hexUnitFacingAngleMap.delete(hexKey);
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

    return `
      <g class="hex-cell" data-terrain="${tile.terrain}" data-terrain-type="${tile.terrainType}" data-hex="${hexKey}" data-col="${col}" data-row="${row}" data-cx="${cx}" data-cy="${cy}" data-clip-id="${clipId}" data-defense="${defense}" data-acc-mod="${accMod}" data-blocks-los="${blocksLOS}">
        <defs>
          <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
            <polygon points="${points}"></polygon>
          </clipPath>
        </defs>
        ${sprite ? `<image href="${sprite}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" class="terrain-sprite" />` : ""}
        <polygon class="hex-tile" points="${points}" fill="${fill}" fill-opacity="${sprite ? 0.35 : 1}" stroke="${HEX_DEFAULT_STROKE}" stroke-width="${HEX_DEFAULT_STROKE_WIDTH}"></polygon>
        ${roadOverlay}
        <title>${tooltip}</title>
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

  /**
   * Determines whether a terrain descriptor represents an open-water tile that should spawn a transport overlay.
   */
  private isMaritimeTerrain(terrain: string, terrainType: string): boolean {
    return terrain === "sea" || terrain === "ocean" || terrainType === "water" || terrainType === "sea" || terrainType === "ocean";
  }

  /**
   * Ensures a reusable boat shape is positioned beneath the unit icon so amphibious deployments visibly ride a transport.
   */
  private ensureBoatOverlay(hexKey: string, cell: SVGGElement, cx: number, cy: number, iconSize: number): void {
    const shipWidth = (iconSize + 16) * 1.5;
    const shipHeight = Math.max(iconSize * 0.55, 28) * 1.5;
    let overlay = this.hexBoatOverlayMap.get(hexKey);
    if (!overlay) {
      overlay = document.createElementNS(SVG_NS, "image");
      overlay.classList.add("unit-boat-overlay");
      overlay.setAttribute("href", TRANSPORT_SHIP_SPRITE);
      overlay.setAttribute("preserveAspectRatio", "xMidYMid meet");

      const unitGroup = this.hexUnitImageMap.get(hexKey);
      if (unitGroup) {
        cell.insertBefore(overlay, unitGroup);
      } else {
        cell.appendChild(overlay);
      }
      this.hexBoatOverlayMap.set(hexKey, overlay);
    }

    overlay.setAttribute("width", String(shipWidth));
    overlay.setAttribute("height", String(shipHeight));
    const shipX = cx - shipWidth / 2;
    const shipY = cy + iconSize / 2 - shipHeight + 4;
    overlay.setAttribute("x", String(shipX));
    overlay.setAttribute("y", String(shipY));
  }

  /**
   * Removes any existing boat overlay so land movement clears maritime visuals immediately.
   */
  private removeBoatOverlay(hexKey: string): void {
    const overlay = this.hexBoatOverlayMap.get(hexKey);
    if (!overlay) {
      return;
    }
    overlay.remove();
    this.hexBoatOverlayMap.delete(hexKey);
  }

  private rehydrateAftermathOverlays(): void {
    this.aftermathByHexKey.forEach((_entry, hexKey) => {
      this.syncAftermathOverlay(hexKey);
    });
  }

  markHexWrecked(hexKey: string, unitClass?: UnitClass, fireTurns = 2): void {
    const hasFlames = unitClass === "vehicle" || unitClass === "tank";
    const existing = this.aftermathByHexKey.get(hexKey);
    const next: AftermathEntry = {
      smokeLevel: hasFlames ? 2 : 0,
      flames: hasFlames,
      wreck: true,
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
      group.appendChild(this.createWreckShape(center.cx, center.cy));
    }

    const smokeLevel = entry.smokeLevel;
    if (smokeLevel === 1 || smokeLevel === 2) {
      group.appendChild(this.createSmokeShape(hexKey, center.cx, center.cy, smokeLevel));
    }

    if (entry.flames) {
      group.appendChild(this.createFlamesShape(hexKey, center.cx, center.cy));
    }
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

  private createSmokeShape(hexKey: string, cx: number, cy: number, smokeLevel: 1 | 2): SVGGElement {
    const g = document.createElementNS(SVG_NS, "g");
    const rand = this.seededRandom(this.seedFromHexKey(`${hexKey}:smoke:${smokeLevel}`));
    const puffCount = smokeLevel === 2 ? 7 : 5;
    const baseR = smokeLevel === 2 ? 10 : 8;
    for (let i = 0; i < puffCount; i += 1) {
      const c = document.createElementNS(SVG_NS, "circle");
      const dx = (rand() - 0.5) * (smokeLevel === 2 ? 18 : 14);
      const dy = 8 + (rand() - 0.5) * 10;
      const r = baseR + rand() * 7;
      c.setAttribute("cx", String(cx + dx));
      c.setAttribute("cy", String(cy + dy));
      c.setAttribute("r", String(r));
      c.setAttribute("fill", "#4f4f4f");
      c.setAttribute("opacity", smokeLevel === 2 ? "0.26" : "0.18");

      const drift = document.createElementNS(SVG_NS, "animateTransform");
      drift.setAttribute("attributeName", "transform");
      drift.setAttribute("type", "translate");
      drift.setAttribute("values", "0 12; 0 -18");
      drift.setAttribute("dur", `${2.2 + rand() * 1.6}s`);
      drift.setAttribute("repeatCount", "indefinite");

      const fade = document.createElementNS(SVG_NS, "animate");
      fade.setAttribute("attributeName", "opacity");
      fade.setAttribute("values", "0; 0.30; 0");
      fade.setAttribute("dur", `${2.2 + rand() * 1.6}s`);
      fade.setAttribute("repeatCount", "indefinite");

      c.appendChild(drift);
      c.appendChild(fade);
      g.appendChild(c);
    }
    return g;
  }

  private createFlamesShape(hexKey: string, cx: number, cy: number): SVGGElement {
    const g = document.createElementNS(SVG_NS, "g");
    const rand = this.seededRandom(this.seedFromHexKey(`${hexKey}:flames`));
    const offsets: Array<[number, number]> = [[-9, 12], [8, 14], [0, 8]];
    offsets.forEach(([dx, dy], index) => {
      const flame = document.createElementNS(SVG_NS, "path");
      const x = cx + dx;
      const y = cy + dy;
      const h = 10 + index * 3;
      const w = 7 + index * 2;
      flame.setAttribute(
        "d",
        `M ${x} ${y} C ${x - w} ${y - h * 0.3}, ${x - w * 0.5} ${y - h}, ${x} ${y - h} C ${x + w * 0.5} ${y - h}, ${x + w} ${y - h * 0.3}, ${x} ${y} Z`
      );
      flame.setAttribute("fill", index === 2 ? "#ffd35f" : "#ff6a00");
      flame.setAttribute("opacity", "0.85");

      const drift = document.createElementNS(SVG_NS, "animateTransform");
      drift.setAttribute("attributeName", "transform");
      drift.setAttribute("type", "translate");
      const rise = 2 + Math.round(rand() * 3);
      drift.setAttribute("values", `0 0; 0 ${-rise}; 0 0`);
      drift.setAttribute("dur", `${0.45 + index * 0.12}s`);
      drift.setAttribute("repeatCount", "indefinite");

      const alpha = document.createElementNS(SVG_NS, "animate");
      alpha.setAttribute("attributeName", "opacity");
      alpha.setAttribute("values", "0.55; 0.95; 0.55");
      alpha.setAttribute("dur", `${0.45 + index * 0.12}s`);
      alpha.setAttribute("repeatCount", "indefinite");

      flame.appendChild(drift);
      flame.appendChild(alpha);
      g.appendChild(flame);
    });
    return g;
  }

  private createWreckShape(cx: number, cy: number): SVGGElement {
    const g = document.createElementNS(SVG_NS, "g");
    const body = document.createElementNS(SVG_NS, "rect");
    body.setAttribute("x", String(cx - 14));
    body.setAttribute("y", String(cy + 2));
    body.setAttribute("width", "28");
    body.setAttribute("height", "12");
    body.setAttribute("rx", "3");
    body.setAttribute("fill", "#2b2b2b");
    body.setAttribute("opacity", "0.85");
    body.setAttribute("transform", `rotate(-12 ${cx} ${cy})`);

    const turret = document.createElementNS(SVG_NS, "rect");
    turret.setAttribute("x", String(cx - 6));
    turret.setAttribute("y", String(cy - 2));
    turret.setAttribute("width", "12");
    turret.setAttribute("height", "8");
    turret.setAttribute("rx", "2");
    turret.setAttribute("fill", "#1f1f1f");
    turret.setAttribute("opacity", "0.9");
    turret.setAttribute("transform", `rotate(8 ${cx} ${cy})`);

    const debris = document.createElementNS(SVG_NS, "path");
    debris.setAttribute(
      "d",
      `M ${cx - 18} ${cy + 18} L ${cx - 6} ${cy + 14} L ${cx + 2} ${cy + 22} L ${cx + 18} ${cy + 16}`
    );
    debris.setAttribute("stroke", "#3a3a3a");
    debris.setAttribute("stroke-width", "3");
    debris.setAttribute("stroke-linecap", "round");
    debris.setAttribute("opacity", "0.7");

    g.appendChild(body);
    g.appendChild(turret);
    g.appendChild(debris);
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

  private cleanupMoveGhost(ghost: SVGGElement, original: SVGGElement, restoreOpacity: string): void {
    ghost.remove();
    if (restoreOpacity === "" || restoreOpacity === "1") {
      original.style.removeProperty("opacity");
    } else {
      original.style.opacity = restoreOpacity;
    }
  }

  /** Ensures the top-layer SVG group used for combat effects exists and remains attached. */
  private ensureCombatEffectsLayer(): SVGGElement | null {
    if (!this.svgElement) {
      return null;
    }

    if (this.combatEffectsLayer && this.combatEffectsLayer.isConnected) {
      return this.combatEffectsLayer;
    }

    const layer = document.createElementNS(SVG_NS, "g");
    layer.classList.add("combat-effects-layer");
    this.svgElement.appendChild(layer);
    this.combatEffectsLayer = layer;
    this.flashOverlay = null;
    return layer;
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
    return attackerClass === "artillery" || attackerType === "Flak_88" || attackerType === "SP_Artillery";
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
        return { color: "#ffd37a", width: 1.6 }; // small arms – warm yellow, thin streak
      case "vehicle":
        return { color: "#ffe08a", width: 2.0 }; // autocannon – bright yellow
      case "tank":
        return { color: "#ffcf5a", width: 2.4 }; // main gun – still not a beam
      case "artillery":
        return { color: "#ff9e5a", width: 2.3 }; // shells – orange
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

  /** Maps defender class to spark ray count for hard-target impacts. */
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

  /**
   * Plays a combat animation at the specified hex key.
   * Returns a promise that resolves when the animation completes.
   */
  async playCombatAnimation(
    animationType: keyof typeof COMBAT_ANIMATIONS,
    hexKey: string,
    offsetX: number = 0,
    offsetY: number = 0,
    scale: number = 1
  ): Promise<void> {
    const effectsLayer = this.ensureCombatEffectsLayer();
    if (!effectsLayer) {
      return;
    }

    if (!this.combatAnimator) {
      this.combatAnimator = new SpriteSheetAnimator(effectsLayer);
    }
    if (!this.combatAnimator) {
      console.warn("[HexMapRenderer] Combat animator not initialized");
      return;
    }

    const hexElement = this.hexElementMap.get(hexKey);
    if (!hexElement) {
      console.warn(`[HexMapRenderer] Hex element not found for key: ${hexKey}`);
      return;
    }

    // Derive the hex centre from cached metadata instead of relying on SVG transforms (hex cells are absolute).
    const center = this.extractHexCenter(hexElement);
    if (!center) {
      return;
    }

    const spec = COMBAT_ANIMATIONS[animationType];
    const halfWidth = (spec.frameWidth * scale) / 2;
    const halfHeight = (spec.frameHeight * scale) / 2;

    const x = center.cx - halfWidth + offsetX;
    const y = center.cy - halfHeight + offsetY;

    await this.combatAnimator.playAnimation(animationType, x, y, scale);
  }

  /**
   * Plays a muzzle flash animation at the attacker's hex.
   */
  async playMuzzleFlash(attackerHexKey: string): Promise<void> {
    await this.playCombatAnimation("muzzleFlash", attackerHexKey, 0, 0, 1.25);
  }

  /**
   * Plays an explosion animation at the defender's hex.
   * Uses small explosion for infantry, large for tanks/vehicles.
   */
  async playExplosion(defenderHexKey: string, isLargeExplosion: boolean = false): Promise<void> {
    const animType = isLargeExplosion ? "explosionLarge" : "explosionSmall";
    const scale = isLargeExplosion ? 1.6 : 1.35;
    await this.playCombatAnimation(animType, defenderHexKey, 0, 0, scale);
  }

  /**
   * Plays a dust cloud animation (for movement or near misses).
   */
  async playDustCloud(hexKey: string): Promise<void> {
    await this.playCombatAnimation("dustCloud", hexKey, 0, 0, 1.2);
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

  /** Emits a short burst of metal sparks at the defender for hard-target impacts. */
  private async playSparkBurst(defenderHexKey: string, rayCount = 8, durationMs = 160): Promise<void> {
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
    const useAirStrafingVisuals = this.isAirStrafingAttack(attackerHexKey);
    const useAirBombingVisuals = this.isAirBombingAttack(attackerHexKey);
    const defenderIsAir = defenderClass === "air";

    const defenderElement = this.hexElementMap.get(defenderHexKey);
    const defenderCenter = defenderElement ? this.extractHexCenter(defenderElement) : null;
    const flashRadius = HEX_RADIUS * (useArcingArtilleryVisuals || useAirBombingVisuals ? 1.55 : targetIsHardTarget ? 1.25 : 1.0);
    const flashIntensity = useArcingArtilleryVisuals || useAirBombingVisuals ? 0.62 : targetIsHardTarget ? 0.55 : 0.4;
    const flashOverlayPromise = defenderCenter
      ? this.playFlashOverlay(
          defenderCenter,
          flashRadius,
          flashIntensity,
          useArcingArtilleryVisuals || useAirBombingVisuals ? 210 : targetIsHardTarget ? 160 : 130
        )
      : Promise.resolve();

    const flashPromise = useAirBombingVisuals ? Promise.resolve() : this.playMuzzleFlash(attackerHexKey);
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
      const sparksPromise = this.playSparkBurst(defenderHexKey, defenderIsAir ? 10 : targetIsHardTarget ? 9 : 7, 130);
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
      const impactOffsets: Array<[number, number]> = [[0, 0], [16, -10], [-14, 12]];
      const impactPromises = impactOffsets.map(([ox, oy], index) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            const scale = index === 0 ? impactScale : impactScale * 0.85;
            void this.playCombatAnimation(impactAnim, defenderHexKey, ox, oy, scale).then(() => resolve());
          }, index * 120);
        })
      );

      const sparksPromise = !defenderIsAir && targetIsHardTarget ? this.playSparkBurst(defenderHexKey, 14, 160) : Promise.resolve();
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
        ...impactPromises,
        sparksPromise,
        dustPromise,
        flashOverlayPromise
      ]);

      return;
    }

    if (useArcingArtilleryVisuals) {
      const lobPromise = this.playArcedProjectile(attackerHexKey, defenderHexKey, 620, {
        color: "#ffcf5a",
        radius: 3.2,
        arcHeight: attackerType === "Flak_88" ? 42 : 56
      });

      await new Promise((resolve) => setTimeout(resolve, 260));

      const hitShakePromise = this.playHitShake(defenderHexKey, targetIsHardTarget ? 6 : 5);

      const impactAnim = defenderIsAir ? "explosionSmall" : "explosionLarge";
      const impactScale = defenderIsAir ? 1.7 : targetIsHardTarget ? 2.05 : 1.9;
      const impactOffsets: Array<[number, number]> = [[0, 0], [14, -8], [-12, 10]];
      const impactPromises = impactOffsets.map(([ox, oy], index) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            const scale = index === 0 ? impactScale : impactScale * 0.85;
            void this.playCombatAnimation(impactAnim, defenderHexKey, ox, oy, scale).then(() => resolve());
          }, index * 110);
        })
      );

      const sparksCount = this.chooseSparkCount(defenderClass);
      const sparksPromise = defenderIsAir
        ? this.playSparkBurst(defenderHexKey, 10, 170)
        : targetIsHardTarget
          ? this.playSparkBurst(defenderHexKey, sparksCount)
          : Promise.resolve();
      const dustPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          if (defenderIsAir) {
            resolve();
            return;
          }
          void this.playDustCloudLinger(defenderHexKey, 0.65).then(() => resolve());
        }, 140);
      });

      await Promise.all([
        flashPromise,
        lobPromise,
        recoilPromise,
        markerPromise,
        hitShakePromise,
        ...impactPromises,
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
      const sparksPromise = this.playSparkBurst(defenderHexKey, targetIsHardTarget ? 8 : 6, 140);
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

    const impactCount = this.chooseImpactCount(attackerClass);
    const impactOffsets: Array<[number, number]> = impactCount >= 3
      ? [[0, 0], [10, -6], [-8, 6]]
      : [[0, 0], [8, 4]];
    const impactAnim = defenderIsAir ? "explosionSmall" : targetIsHardTarget ? "explosionLarge" : "explosionSmall";
    const impactScale = defenderIsAir ? 1.45 : targetIsHardTarget ? 1.6 : 1.35;
    const impactPromises = impactOffsets.map(([ox, oy], index) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const scale = index === 0 ? impactScale : impactScale * 0.85;
          void this.playCombatAnimation(impactAnim, defenderHexKey, ox, oy, scale).then(() => resolve());
        }, index * 80);
      })
    );

    const sparksCount = this.chooseSparkCount(defenderClass);
    const sparksPromise = defenderIsAir
      ? this.playSparkBurst(defenderHexKey, 9, 170)
      : targetIsHardTarget
        ? this.playSparkBurst(defenderHexKey, sparksCount)
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
