import {
  AIR_SHOW_OFF_MAP_DISTANCE_PX,
  buildAirShowInspectionOriginPlan,
  resolveAirShowBoundsRayIntersection,
  resolveAirShowHqAxis,
  type AirShowMapBounds
} from "./AirShowPlanner";
import type {
  AirShowFlightRole,
  AirShowPoint,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowScene,
  SpriteRenderFaction
} from "./AirShowPlaybackScene";
import { resolveResolvedAirShowBombers } from "./AirShowPlaybackScene";
import {
  AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS,
  measureAirShowPath,
  resolveAirShowRoleSpeed,
  sampleAirShowPathByDistance,
  sampleAirShowTimelineTrack,
  verifyAirShowTimeline,
  type AirShowBeatLabel,
  type AirShowScenarioFamily,
  type AirShowTimeline,
  type AirShowTimelineActor,
  type AirShowTimelineBeat,
  type AirShowTimelineCue,
  type AirShowTimelineFlight,
  type AirShowTimelineGeometry,
  type AirShowTimelineSegment,
  type AirShowTimelineTrack
} from "./AirShowTimeline";

export interface AirShowDirectorInput {
  readonly scene: ResolvedAirShowScene;
  readonly mapBounds: AirShowMapBounds;
  readonly playerHq: AirShowPoint | null;
  readonly botHq: AirShowPoint | null;
  readonly engagement: AirShowPoint;
  readonly target: AirShowPoint | null;
  readonly hexWidth: number;
  readonly hexHeight: number;
  readonly seed?: number;
}

const FIGHTER_BREAK_TURN_DESIGN_DEGREES_PER_SAMPLE = 55;

interface Vector {
  readonly x: number;
  readonly y: number;
}

interface MutableSegment {
  label: AirShowBeatLabel;
  startTimeMs: number;
  endTimeMs: number;
  speedPxPerMs: number;
  lengthPx: number;
  points: AirShowPoint[];
}

interface MutableTrack {
  actorId: string;
  flightId: string;
  role: AirShowFlightRole;
  visibleFromMs: number;
  visibleUntilMs: number;
  segments: MutableSegment[];
}

interface ActorDraft {
  readonly actor: AirShowTimelineActor;
  readonly spec: ResolvedAirShowFlightSpec;
  readonly origin: AirShowPoint;
  readonly factionSide: -1 | 1;
  readonly laneOffsetPx: number;
  readonly turnSide: -1 | 1;
}

interface FighterClashPlan {
  readonly tracks: MutableTrack[];
  readonly mergeTimeMs: number;
  readonly scrambleEndByActorId: ReadonlyMap<string, number>;
  readonly scrambleEndPointByActorId: ReadonlyMap<string, AirShowPoint>;
  readonly scrambleEndHeadingByActorId: ReadonlyMap<string, Vector>;
}

interface BomberPlanResult {
  readonly tracks: MutableTrack[];
  readonly cues: AirShowTimelineCue[];
  readonly primaryReleaseTimeMs: number | null;
}

const BASE_AIRCRAFT_ICON_SIZE = 60;
const STRENGTH_PER_ACTOR = 25;
const FIGHTER_SIZE_MULTIPLIER = 0.75;
const BOMBER_SIZE_MULTIPLIER = 1.5;
const FIGHTER_LANE_SPACING_PX = 28;
const BOMBER_LANE_SPACING_PX = 70;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(dx: number, dy: number, fallback: Vector = { x: 1, y: 0 }): Vector {
  const length = Math.hypot(dx, dy);
  if (length > 0.0001) {
    return { x: dx / length, y: dy / length };
  }
  const fallbackLength = Math.max(0.0001, Math.hypot(fallback.x, fallback.y));
  return { x: fallback.x / fallbackLength, y: fallback.y / fallbackLength };
}

function add(point: AirShowPoint, vector: Vector, distancePx: number): AirShowPoint {
  return {
    cx: point.cx + vector.x * distancePx,
    cy: point.cy + vector.y * distancePx
  };
}

function offset(point: AirShowPoint, axis: Vector, alongPx: number, normal: Vector, lateralPx: number): AirShowPoint {
  return {
    cx: point.cx + axis.x * alongPx + normal.x * lateralPx,
    cy: point.cy + axis.y * alongPx + normal.y * lateralPx
  };
}

function dedupePoints(points: ReadonlyArray<AirShowPoint>): AirShowPoint[] {
  const deduped: AirShowPoint[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.01) {
      deduped.push({ cx: point.cx, cy: point.cy });
    }
  });
  return deduped;
}

function sampleCubicBezier(
  start: AirShowPoint,
  controlA: AirShowPoint,
  controlB: AirShowPoint,
  end: AirShowPoint,
  sampleCount = 18
): AirShowPoint[] {
  return Array.from({ length: Math.max(2, sampleCount) + 1 }, (_, index) => {
    const t = index / Math.max(2, sampleCount);
    const inverse = 1 - t;
    return {
      cx:
        inverse * inverse * inverse * start.cx
        + 3 * inverse * inverse * t * controlA.cx
        + 3 * inverse * t * t * controlB.cx
        + t * t * t * end.cx,
      cy:
        inverse * inverse * inverse * start.cy
        + 3 * inverse * inverse * t * controlA.cy
        + 3 * inverse * t * t * controlB.cy
        + t * t * t * end.cy
    };
  });
}

function sampleForwardLaneChange(
  start: AirShowPoint,
  heading: Vector,
  normal: Vector,
  alongDistancePx: number,
  lateralDistancePx: number,
  sampleCount = 48
): AirShowPoint[] {
  return Array.from({ length: Math.max(8, sampleCount) + 1 }, (_, index) => {
    const progress = index / Math.max(8, sampleCount);
    const smoothLateralProgress = progress * progress * (3 - 2 * progress);
    return offset(
      start,
      heading,
      alongDistancePx * progress,
      normal,
      lateralDistancePx * smoothLateralProgress
    );
  });
}

function sampleTurnArc(
  start: AirShowPoint,
  axis: Vector,
  normal: Vector,
  turnSide: -1 | 1,
  radiusPx: number,
  degrees: number
): { readonly points: AirShowPoint[]; readonly endTangent: Vector } {
  const center = add(start, normal, turnSide * radiusPx);
  const radians = degrees * Math.PI / 180;
  const sampleCount = Math.max(18, Math.ceil(Math.abs(degrees) / 5));
  const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const angle = radians * (index / sampleCount);
    return {
      cx:
        center.cx
        + axis.x * radiusPx * Math.sin(angle)
        - normal.x * turnSide * radiusPx * Math.cos(angle),
      cy:
        center.cy
        + axis.y * radiusPx * Math.sin(angle)
        - normal.y * turnSide * radiusPx * Math.cos(angle)
    };
  });
  return {
    points,
    endTangent: normalize(
      axis.x * Math.cos(radians) + normal.x * turnSide * Math.sin(radians),
      axis.y * Math.cos(radians) + normal.y * turnSide * Math.sin(radians),
      { x: -axis.x, y: -axis.y }
    )
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function isPlayerSide(faction: SpriteRenderFaction | undefined): boolean {
  return faction !== "Bot";
}

function resolveScenario(scene: ResolvedAirShowScene): AirShowScenarioFamily {
  const bombers = resolveResolvedAirShowBombers(scene);
  const hasBombers = bombers.length > 0;
  const hasInterceptors = scene.interceptors.length > 0;
  const hasEscorts = scene.escorts.length > 0;
  if (!hasBombers) {
    return "cap-clash";
  }
  if (hasInterceptors && hasEscorts) {
    return "full-engagement";
  }
  if (hasInterceptors) {
    return "intercepted-strike";
  }
  if (hasEscorts) {
    return "escorted-strike";
  }
  return "strike-only";
}

function strongestRecordedStrength(spec: ResolvedAirShowFlightSpec): number {
  return Math.max(
    0,
    spec.strengthBefore,
    spec.strengthAfterEscortPhase ?? 0,
    spec.finalStrength ?? 0
  );
}

function visualStrength(spec: ResolvedAirShowFlightSpec): number {
  const strongest = strongestRecordedStrength(spec);
  return strongest > 0 ? strongest : spec.role === "bomber" ? STRENGTH_PER_ACTOR : 0;
}

function actorCountForStrength(strength: number): number {
  return strength <= 0 ? 0 : clamp(Math.ceil(strength / STRENGTH_PER_ACTOR), 1, 4);
}

function actorScale(actorCount: number): number {
  return ({ 1: 0.85, 2: 0.78, 3: 0.72, 4: 0.68 } as Record<number, number>)[actorCount] ?? 0.72;
}

function roleSize(role: AirShowFlightRole, count: number): number {
  const multiplier = role === "bomber" ? BOMBER_SIZE_MULTIPLIER : FIGHTER_SIZE_MULTIPLIER;
  return BASE_AIRCRAFT_ICON_SIZE * multiplier * actorScale(count);
}

function buildActors(
  scene: ResolvedAirShowScene,
  playerOrigin: AirShowPoint,
  botOrigin: AirShowPoint,
  seed: number
): { readonly actors: AirShowTimelineActor[]; readonly flights: AirShowTimelineFlight[]; readonly drafts: ActorDraft[] } {
  const specs = [
    ...scene.interceptors,
    ...scene.escorts,
    ...resolveResolvedAirShowBombers(scene)
  ];
  const actors: AirShowTimelineActor[] = [];
  const flights: AirShowTimelineFlight[] = [];
  const drafts: ActorDraft[] = [];
  const roleFactionCounters = new Map<string, number>();
  const roleFactionTotals = new Map<string, number>();

  specs.forEach((spec) => {
    const count = actorCountForStrength(visualStrength(spec));
    const key = `${spec.role}:${isPlayerSide(spec.faction) ? "player" : "bot"}`;
    roleFactionTotals.set(key, (roleFactionTotals.get(key) ?? 0) + count);
  });

  specs.forEach((spec) => {
    const strength = visualStrength(spec);
    const count = actorCountForStrength(strength);
    const actorIds: string[] = [];
    const key = `${spec.role}:${isPlayerSide(spec.faction) ? "player" : "bot"}`;
    const total = roleFactionTotals.get(key) ?? count;
    const spacing = spec.role === "bomber" ? BOMBER_LANE_SPACING_PX : FIGHTER_LANE_SPACING_PX;
    const origin = isPlayerSide(spec.faction) ? playerOrigin : botOrigin;
    const factionSide: -1 | 1 = isPlayerSide(spec.faction) ? -1 : 1;
    const startIndex = roleFactionCounters.get(key) ?? 0;
    const random = createRandom(stableHash(`${seed}:${spec.id}:lanes`));

    for (let index = 0; index < count; index += 1) {
      const globalIndex = startIndex + index;
      const centeredIndex = globalIndex - (total - 1) / 2;
      const jitterPx = (random() - 0.5) * (spec.role === "bomber" ? 5 : 4);
      const laneOffsetPx =
        (spec.laneOffsetPx ?? 0)
        + centeredIndex * spacing
        + jitterPx;
      const actorId = `${spec.id}:${index}`;
      actorIds.push(actorId);
      const finalRecorded = Math.max(0, spec.finalStrength ?? spec.strengthAfterEscortPhase ?? spec.strengthBefore);
      const seededTutorialBomber = spec.role === "bomber" && strongestRecordedStrength(spec) <= 0;
      const actor: AirShowTimelineActor = {
        actorId,
        flightId: spec.id,
        role: spec.role,
        combatRole: spec.combatRole,
        scenarioType: spec.scenarioType,
        faction: spec.faction,
        formationIndex: index,
        size: roleSize(spec.role, count),
        laneOffsetPx,
        initialStrength: strength,
        finalStrength: seededTutorialBomber ? strength : finalRecorded
      };
      actors.push(actor);
      drafts.push({
        actor,
        spec,
        origin,
        factionSide,
        laneOffsetPx,
        turnSide: spec.role === "bomber"
          ? (stableHash(`${seed}:${spec.id}:formation-turn`) % 2 === 0 ? -1 : 1)
          : ((globalIndex + factionSide + 4) % 2 === 0 ? -1 : 1) as -1 | 1
      });
    }
    roleFactionCounters.set(key, startIndex + count);
    flights.push({
      id: spec.id,
      role: spec.role,
      combatRole: spec.combatRole,
      faction: spec.faction,
      scenarioType: spec.scenarioType,
      originHexKey: spec.originHexKey,
      strengthBefore: spec.strengthBefore,
      strengthAfterEscortPhase: spec.strengthAfterEscortPhase,
      finalStrength: spec.finalStrength,
      laneOffsetPx: spec.laneOffsetPx,
      actorIds
    });
  });

  return { actors, flights, drafts };
}

function createSegment(
  label: AirShowBeatLabel,
  startTimeMs: number,
  points: ReadonlyArray<AirShowPoint>,
  role: AirShowFlightRole
): MutableSegment {
  const normalizedPoints = dedupePoints(points);
  const lengthPx = measureAirShowPath(normalizedPoints);
  const speedPxPerMs = resolveAirShowRoleSpeed(role);
  const durationMs = lengthPx / speedPxPerMs;
  return {
    label,
    startTimeMs,
    endTimeMs: startTimeMs + durationMs,
    speedPxPerMs,
    lengthPx,
    points: normalizedPoints
  };
}

function appendSegment(
  track: MutableTrack,
  label: AirShowBeatLabel,
  points: ReadonlyArray<AirShowPoint>
): MutableSegment {
  const startTimeMs = track.segments[track.segments.length - 1]?.endTimeMs ?? track.visibleFromMs;
  const segment = createSegment(label, startTimeMs, points, track.role);
  track.segments.push(segment);
  track.visibleUntilMs = segment.endTimeMs;
  return segment;
}

function buildSmoothExitPath(
  start: AirShowPoint,
  startHeading: Vector,
  exit: AirShowPoint,
  unitPx: number
): AirShowPoint[] {
  const exitDirection = normalize(exit.cx - start.cx, exit.cy - start.cy, startHeading);
  const distancePx = Math.max(unitPx * 2, Math.hypot(exit.cx - start.cx, exit.cy - start.cy));
  const headingCross = startHeading.x * exitDirection.y - startHeading.y * exitDirection.x;
  if (startHeading.x * exitDirection.x + startHeading.y * exitDirection.y < 0.35) {
    return buildLengthGovernedRendezvousPath(
      start,
      startHeading,
      exit,
      exitDirection,
      { x: -startHeading.y, y: startHeading.x },
      headingCross >= 0 ? 1 : -1,
      distancePx,
      unitPx
    );
  }
  const controlDistancePx = clamp(distancePx * 0.24, unitPx * 0.8, unitPx * 2.8);
  return sampleCubicBezier(
    start,
    add(start, startHeading, controlDistancePx),
    add(exit, exitDirection, -controlDistancePx),
    exit,
    28
  );
}

function smoothAuthoredRail(points: ReadonlyArray<AirShowPoint>, iterations = 3): AirShowPoint[] {
  let smoothed = dedupePoints(points);
  for (let iteration = 0; iteration < iterations && smoothed.length >= 3; iteration += 1) {
    const next: AirShowPoint[] = [smoothed[0]!];
    for (let index = 0; index < smoothed.length - 1; index += 1) {
      const start = smoothed[index]!;
      const end = smoothed[index + 1]!;
      next.push(
        {
          cx: start.cx * 0.75 + end.cx * 0.25,
          cy: start.cy * 0.75 + end.cy * 0.25
        },
        {
          cx: start.cx * 0.25 + end.cx * 0.75,
          cy: start.cy * 0.25 + end.cy * 0.75
        }
      );
    }
    next.push(smoothed[smoothed.length - 1]!);
    smoothed = dedupePoints(next);
  }
  return smoothed;
}

function buildTangentTurnPrefix(
  start: AirShowPoint,
  startHeading: Vector,
  end: AirShowPoint,
  unitPx: number,
  preferredSide: -1 | 1
): ReturnType<typeof sampleTurnArc> | null {
  const initialDirect = normalize(end.cx - start.cx, end.cy - start.cy, startHeading);
  if (startHeading.x * initialDirect.x + startHeading.y * initialDirect.y >= 0.65) {
    return null;
  }
  const turnNormal = { x: -startHeading.y, y: startHeading.x };
  const radiusPx = unitPx * 1.35;
  let best: { readonly side: -1 | 1; readonly degrees: number; readonly errorDegrees: number } | null = null;
  const sides: ReadonlyArray<-1 | 1> = [preferredSide, (preferredSide * -1) as -1 | 1];
  for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
    const side = sides[sideIndex]!;
    const center = add(start, turnNormal, side * radiusPx);
    for (let degrees = 8; degrees <= 210; degrees += 2) {
      const radians = degrees * Math.PI / 180;
      const point = {
        cx: center.cx + startHeading.x * radiusPx * Math.sin(radians)
          - turnNormal.x * side * radiusPx * Math.cos(radians),
        cy: center.cy + startHeading.y * radiusPx * Math.sin(radians)
          - turnNormal.y * side * radiusPx * Math.cos(radians)
      };
      const tangent = normalize(
        startHeading.x * Math.cos(radians) + turnNormal.x * side * Math.sin(radians),
        startHeading.y * Math.cos(radians) + turnNormal.y * side * Math.sin(radians),
        startHeading
      );
      const toEnd = normalize(end.cx - point.cx, end.cy - point.cy, tangent);
      const alignment = clamp(tangent.x * toEnd.x + tangent.y * toEnd.y, -1, 1);
      const errorDegrees = Math.acos(alignment) * 180 / Math.PI + sideIndex * 0.25;
      if (!best || errorDegrees < best.errorDegrees) {
        best = { side, degrees, errorDegrees };
      }
    }
  }
  return best
    ? sampleTurnArc(start, startHeading, turnNormal, best.side, radiusPx, best.degrees)
    : null;
}

function buildReversalRendezvousPath(
  start: AirShowPoint,
  startHeading: Vector,
  end: AirShowPoint,
  endHeading: Vector,
  preferredSide: -1 | 1,
  targetLengthPx: number,
  unitPx: number
): AirShowPoint[] {
  const headingDot = clamp(startHeading.x * endHeading.x + startHeading.y * endHeading.y, -1, 1);
  const headingCross = startHeading.x * endHeading.y - startHeading.y * endHeading.x;
  const turnDegrees = Math.acos(headingDot) * 180 / Math.PI;
  const turnSide: -1 | 1 = Math.abs(headingCross) > 0.001
    ? (headingCross >= 0 ? 1 : -1)
    : preferredSide;
  const turnNormal = { x: -startHeading.y, y: startHeading.x };
  const endNormal = { x: -endHeading.y, y: endHeading.x };
  const minimumTurnRadiusPx = resolveAirShowRoleSpeed("interceptor")
    * AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS
    / (FIGHTER_BREAK_TURN_DESIGN_DEGREES_PER_SAMPLE * Math.PI / 180);
  const turnRadiusPx = Math.max(unitPx * 1.05, minimumTurnRadiusPx * 1.1);
  const buildCandidate = (leadDistancePx: number): {
    readonly path: AirShowPoint[];
    readonly alongDistancePx: number;
    readonly lateralDistancePx: number;
  } => {
    const turnStart = add(start, startHeading, leadDistancePx);
    const turn = sampleTurnArc(
      turnStart,
      startHeading,
      turnNormal,
      turnSide,
      turnRadiusPx,
      turnDegrees
    );
    const turnEnd = turn.points[turn.points.length - 1]!;
    const toEnd = { x: end.cx - turnEnd.cx, y: end.cy - turnEnd.cy };
    const alongDistancePx = toEnd.x * endHeading.x + toEnd.y * endHeading.y;
    const lateralDistancePx = toEnd.x * endNormal.x + toEnd.y * endNormal.y;
    const laneChange = sampleForwardLaneChange(
      turnEnd,
      endHeading,
      endNormal,
      Math.max(0.01, alongDistancePx),
      lateralDistancePx,
      72
    );
    return {
      path: dedupePoints([
        start,
        ...(leadDistancePx > 0 ? [turnStart] : []),
        ...turn.points.slice(leadDistancePx > 0 ? 1 : 0),
        ...laneChange.slice(1)
      ]),
      alongDistancePx,
      lateralDistancePx
    };
  };

  let minimumLeadPx = 0;
  let selected = buildCandidate(minimumLeadPx);
  while (
    selected.alongDistancePx < Math.max(unitPx * 0.8, Math.abs(selected.lateralDistancePx) * 2.4)
    && minimumLeadPx < targetLengthPx + unitPx * 4
  ) {
    minimumLeadPx += unitPx * 0.25;
    selected = buildCandidate(minimumLeadPx);
  }
  if (measureAirShowPath(selected.path) >= targetLengthPx - 0.01) {
    return selected.path;
  }

  let low = minimumLeadPx;
  let high = Math.max(low + unitPx, targetLengthPx * 0.5);
  while (measureAirShowPath(buildCandidate(high).path) < targetLengthPx) {
    high *= 1.5;
  }
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const leadDistancePx = (low + high) * 0.5;
    const candidate = buildCandidate(leadDistancePx);
    if (measureAirShowPath(candidate.path) < targetLengthPx) {
      low = leadDistancePx;
    } else {
      high = leadDistancePx;
      selected = candidate;
    }
  }
  return selected.path;
}

function buildLengthGovernedRendezvousPath(
  start: AirShowPoint,
  startHeading: Vector,
  end: AirShowPoint,
  endHeading: Vector,
  normal: Vector,
  turnSide: -1 | 1,
  targetLengthPx: number,
  unitPx: number
): AirShowPoint[] {
  const initialDirect = normalize(end.cx - start.cx, end.cy - start.cy, startHeading);
  const startsAwayFromEnd = startHeading.x * initialDirect.x + startHeading.y * initialDirect.y < -0.35;
  const reversesHeading = startHeading.x * endHeading.x + startHeading.y * endHeading.y < -0.75;
  if (startsAwayFromEnd && reversesHeading) {
    return buildReversalRendezvousPath(
      start,
      startHeading,
      end,
      endHeading,
      turnSide,
      targetLengthPx,
      unitPx
    );
  }
  const turnPrefix = buildTangentTurnPrefix(start, startHeading, end, unitPx, turnSide);
  const transferStart = turnPrefix?.points[turnPrefix.points.length - 1] ?? start;
  const transferHeading = turnPrefix?.endTangent ?? startHeading;
  const prefixPoints = turnPrefix?.points ?? [start];
  const direct = normalize(end.cx - transferStart.cx, end.cy - transferStart.cy, transferHeading);
  const distancePx = Math.hypot(end.cx - transferStart.cx, end.cy - transferStart.cy);
  const prefixLengthPx = measureAirShowPath(prefixPoints);
  const remainingTargetLengthPx = Math.max(distancePx, targetLengthPx - prefixLengthPx);
  const lengthHeadroomPx = Math.max(0, remainingTargetLengthPx - distancePx);
  const minimumControlPx = Math.min(
    unitPx * 0.45,
    Math.max(distancePx * 0.22, lengthHeadroomPx * 0.08)
  );
  const maximumControlPx = Math.max(minimumControlPx, unitPx * 1.8);
  const controlPx = clamp(
    distancePx * 0.28 + Math.min(lengthHeadroomPx * 0.12, unitPx * 1.2),
    minimumControlPx,
    maximumControlPx
  );
  const buildCandidate = (amplitudePx: number): AirShowPoint[] => {
    const midpointControlPx = clamp(
      controlPx + Math.abs(amplitudePx) * 0.55,
      controlPx,
      unitPx * 4.5
    );
    const midpoint = {
      cx: (transferStart.cx + end.cx) * 0.5 + normal.x * amplitudePx * turnSide,
      cy: (transferStart.cy + end.cy) * 0.5 + normal.y * amplitudePx * turnSide
    };
    const first = sampleCubicBezier(
      transferStart,
      add(transferStart, transferHeading, controlPx),
      add(midpoint, direct, -midpointControlPx),
      midpoint,
      48
    );
    const second = sampleCubicBezier(
      midpoint,
      add(midpoint, direct, midpointControlPx),
      add(end, endHeading, -controlPx),
      end,
      48
    );
    const transfer = smoothAuthoredRail([...first, ...second.slice(1)]);
    return dedupePoints([...prefixPoints, ...transfer.slice(1)]);
  };

  const baseline = buildCandidate(0);
  if (measureAirShowPath(baseline) >= targetLengthPx - 0.0001) {
    return baseline;
  }
  let low = 0;
  let high = Math.max(unitPx, remainingTargetLengthPx * 0.5);
  while (measureAirShowPath(buildCandidate(high)) < targetLengthPx && high < targetLengthPx * 8) {
    high *= 1.5;
  }
  let selected = buildCandidate(high);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const amplitudePx = (low + high) * 0.5;
    const candidate = buildCandidate(amplitudePx);
    if (measureAirShowPath(candidate) < targetLengthPx) {
      low = amplitudePx;
    } else {
      high = amplitudePx;
      selected = candidate;
    }
  }
  return selected;
}

function buildBomberScreenPath(
  bomberTargetRun: MutableSegment,
  side: -1 | 1,
  unitPx: number,
  geometry: AirShowTimelineGeometry
): AirShowPoint[] {
  const fighterSpeed = resolveAirShowRoleSpeed("escort");
  const targetLengthPx = bomberTargetRun.lengthPx
    * fighterSpeed / bomberTargetRun.speedPxPerMs;
  const bomberApproach = bomberTargetRun.points[0]!;
  const bomberPass = bomberTargetRun.points[Math.min(2, bomberTargetRun.points.length - 1)]!;
  const bomberEnd = bomberTargetRun.points[bomberTargetRun.points.length - 1]!;
  const bomberPrevious = bomberTargetRun.points[Math.max(0, bomberTargetRun.points.length - 2)]!;
  const bomberEndHeading = normalize(
    bomberEnd.cx - bomberPrevious.cx,
    bomberEnd.cy - bomberPrevious.cy,
    { x: -geometry.axis.x, y: -geometry.axis.y }
  );
  const bomberTurnSide: -1 | 1 = bomberEndHeading.x * geometry.normal.x
    + bomberEndHeading.y * geometry.normal.y >= 0 ? 1 : -1;
  const baseOffsetPx = unitPx * 1.35;
  const corridorStart = add(bomberApproach, geometry.normal, side * baseOffsetPx);
  const corridorEnd = add(bomberPass, geometry.normal, side * baseOffsetPx);
  const corridor = [corridorStart, corridorEnd];
  const turnDegrees = 160;
  const buildCandidate = (turnRadiusPx: number): AirShowPoint[] => {
    const turn = sampleTurnArc(
      corridorEnd,
      geometry.axis,
      geometry.normal,
      bomberTurnSide,
      turnRadiusPx,
      turnDegrees
    );
    return dedupePoints([...corridor, ...turn.points.slice(1)]);
  };
  let low = unitPx * 1.5;
  let high = unitPx * 5.5;
  while (measureAirShowPath(buildCandidate(high)) < targetLengthPx) {
    high *= 1.25;
  }
  let selected = buildCandidate(high);
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const radiusPx = (low + high) * 0.5;
    const candidate = buildCandidate(radiusPx);
    if (measureAirShowPath(candidate) < targetLengthPx) {
      low = radiusPx;
    } else {
      high = radiusPx;
      selected = candidate;
    }
  }
  return selected;
}

function buildScramblePath(
  start: AirShowPoint,
  incoming: Vector,
  finalHeading: Vector,
  normal: Vector,
  turnSide: -1 | 1,
  unitPx: number,
  finalLanePx: number
): AirShowPoint[] {
  void normal;
  const headingDot = clamp(incoming.x * finalHeading.x + incoming.y * finalHeading.y, -1, 1);
  const headingCross = incoming.x * finalHeading.y - incoming.y * finalHeading.x;
  const turnDegrees = Math.acos(headingDot) * 180 / Math.PI;
  const resolvedTurnSide: -1 | 1 = Math.abs(headingCross) > 0.001
    ? (headingCross > 0 ? 1 : -1)
    : turnSide;
  const incomingNormal = { x: -incoming.y, y: incoming.x };
  const minimumTurnRadiusPx = resolveAirShowRoleSpeed("interceptor")
    * AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS
    / (FIGHTER_BREAK_TURN_DESIGN_DEGREES_PER_SAMPLE * Math.PI / 180);
  const turn = sampleTurnArc(
    start,
    incoming,
    incomingNormal,
    resolvedTurnSide,
    Math.max(unitPx * 0.45, minimumTurnRadiusPx),
    turnDegrees
  );
  const arcEnd = turn.points[turn.points.length - 1]!;
  const finalNormal = { x: -finalHeading.y, y: finalHeading.x };
  const lateralDistancePx = clamp(finalLanePx * 0.22, -unitPx * 0.3, unitPx * 0.3);
  const extension = sampleForwardLaneChange(
    arcEnd,
    finalHeading,
    finalNormal,
    Math.max(unitPx * 0.9, Math.abs(lateralDistancePx) * 2.6),
    lateralDistancePx,
    32
  );
  return dedupePoints([...turn.points, ...extension.slice(1)]);
}

function buildFighterClash(
  drafts: ReadonlyArray<ActorDraft>,
  geometry: AirShowTimelineGeometry,
  unitPx: number
): FighterClashPlan {
  const fighterDrafts = drafts.filter((draft) => draft.actor.role !== "bomber");
  const speed = resolveAirShowRoleSpeed("interceptor");
  const preDistancePx = unitPx * 0.72;
  const postDistancePx = unitPx * 0.4;
  const prepared = fighterDrafts.map((draft) => {
    const incoming = normalize(
      geometry.merge.cx - draft.origin.cx,
      geometry.merge.cy - draft.origin.cy,
      draft.factionSide < 0 ? geometry.axis : { x: -geometry.axis.x, y: -geometry.axis.y }
    );
    const sameFactionDrafts = fighterDrafts.filter((candidate) =>
      isPlayerSide(candidate.actor.faction) === isPlayerSide(draft.actor.faction)
    );
    const factionIndex = sameFactionDrafts.indexOf(draft);
    const pairIndex = factionIndex - (sameFactionDrafts.length - 1) / 2;
    const factionSeparationPx = isPlayerSide(draft.actor.faction) ? -9 : 9;
    const mergeLanePx = pairIndex * 20 + factionSeparationPx + (draft.spec.laneOffsetPx ?? 0) * 0.18;
    const mergePoint = add(geometry.merge, geometry.normal, mergeLanePx);
    const preMerge = add(mergePoint, incoming, -preDistancePx);
    const postMerge = add(mergePoint, incoming, postDistancePx);
    const originPoint = add(draft.origin, geometry.normal, mergeLanePx);
    const ingressLengthPx = measureAirShowPath([originPoint, preMerge]);
    const preMergeLengthPx = measureAirShowPath([preMerge, mergePoint]);
    return {
      draft,
      incoming,
      mergeLanePx,
      mergePoint,
      preMerge,
      postMerge,
      originPoint,
      timeToMergeMs: (ingressLengthPx + preMergeLengthPx) / speed
    };
  });
  const mergeTimeMs = Math.max(300, ...prepared.map((entry) => entry.timeToMergeMs + 300));
  const tracks: MutableTrack[] = [];
  const scrambleEndByActorId = new Map<string, number>();
  const scrambleEndPointByActorId = new Map<string, AirShowPoint>();
  const scrambleEndHeadingByActorId = new Map<string, Vector>();

  const flightIds = [...new Set(prepared.map((entry) => entry.draft.actor.flightId))].sort();
  const flightIndexById = new Map(flightIds.map((flightId, index) => [flightId, index] as const));
  const turnSideForMask = (entry: typeof prepared[number], mask: number): -1 | 1 => {
    const bitIndex = flightIndexById.get(entry.draft.actor.flightId) ?? -1;
    return bitIndex >= 0 && bitIndex < 10 && (mask & (1 << bitIndex)) !== 0
      ? (entry.draft.turnSide * -1) as -1 | 1
      : entry.draft.turnSide;
  };
  const leaderEntries = prepared.filter((entry) => entry.draft.actor.formationIndex === 0);
  const initialLeaderSamples = leaderEntries.map((entry) => ({
    actorId: entry.draft.actor.actorId,
    playerSide: isPlayerSide(entry.draft.actor.faction),
    point: entry.mergePoint
  }));
  const nearestOpponentIds = (samples: typeof initialLeaderSamples): ReadonlyMap<string, string> =>
    new Map(samples.map((source) => {
      const nearest = samples
        .filter((candidate) => candidate.playerSide !== source.playerSide)
        .sort((left, right) =>
          Math.hypot(left.point.cx - source.point.cx, left.point.cy - source.point.cy)
          - Math.hypot(right.point.cx - source.point.cx, right.point.cy - source.point.cy)
        )[0];
      return [source.actorId, nearest?.actorId ?? ""] as const;
    }));
  const initialPairs = nearestOpponentIds(initialLeaderSamples);
  let selectedTurnMask = 0;
  let selectedTurnScore = Number.NEGATIVE_INFINITY;
  const combinationCount = 1 << Math.min(10, flightIds.length);
  for (let mask = 0; mask < combinationCount; mask += 1) {
    const candidatePaths = leaderEntries.map((entry) => {
      const resolvedTurnSide = turnSideForMask(entry, mask);
      const finalHeading = { x: -entry.incoming.x, y: -entry.incoming.y };
      const switchedLanePx = -entry.mergeLanePx + resolvedTurnSide * 12;
      const path = buildScramblePath(
        entry.postMerge,
        entry.incoming,
        finalHeading,
        geometry.normal,
        resolvedTurnSide,
        unitPx,
        switchedLanePx
      );
      return { entry, path, lengthPx: measureAirShowPath(path) };
    });
    const sharedDistancePx = Math.min(...candidatePaths.map((candidate) => candidate.lengthPx)) * 0.5;
    const candidateSamples = candidatePaths.map((candidate) => ({
      actorId: candidate.entry.draft.actor.actorId,
      playerSide: isPlayerSide(candidate.entry.draft.actor.faction),
      point: sampleAirShowPathByDistance(
        candidate.path,
        candidate.lengthPx > 0 ? sharedDistancePx / candidate.lengthPx : 0
      ).point
    }));
    const candidatePairs = nearestOpponentIds(candidateSamples);
    const eligible = candidateSamples.filter((source) =>
      candidateSamples.filter((candidate) => candidate.playerSide !== source.playerSide).length >= 2
    );
    const switchedCount = eligible.filter((source) =>
      initialPairs.get(source.actorId) !== candidatePairs.get(source.actorId)
    ).length;
    const playerPoints = candidateSamples.filter((sample) => sample.playerSide).map((sample) => sample.point);
    const botPoints = candidateSamples.filter((sample) => !sample.playerSide).map((sample) => sample.point);
    const centroid = (points: ReadonlyArray<AirShowPoint>): AirShowPoint => ({
      cx: points.reduce((sum, point) => sum + point.cx, 0) / Math.max(1, points.length),
      cy: points.reduce((sum, point) => sum + point.cy, 0) / Math.max(1, points.length)
    });
    const playerCentroid = centroid(playerPoints);
    const botCentroid = centroid(botPoints);
    const centroidDistancePx = Math.hypot(
      playerCentroid.cx - botCentroid.cx,
      playerCentroid.cy - botCentroid.cy
    );
    const score = switchedCount * 10000 - centroidDistancePx - mask * 0.0001;
    if (score > selectedTurnScore) {
      selectedTurnMask = mask;
      selectedTurnScore = score;
    }
  }

  prepared.forEach((entry, index) => {
    const ingressLengthPx = measureAirShowPath([entry.originPoint, entry.preMerge]);
    const preMergeLengthPx = measureAirShowPath([entry.preMerge, entry.mergePoint]);
    const ingressStartMs = mergeTimeMs - (ingressLengthPx + preMergeLengthPx) / speed;
    const ingress = createSegment("fighter-ingress", ingressStartMs, [entry.originPoint, entry.preMerge], entry.draft.actor.role);
    const mergeSegment = createSegment(
      "escort-clash-merge",
      ingress.endTimeMs,
      [entry.preMerge, entry.mergePoint, entry.postMerge],
      entry.draft.actor.role
    );
    const resolvedTurnSide = turnSideForMask(entry, selectedTurnMask);
    const switchedLanePx = -entry.mergeLanePx + resolvedTurnSide * 12;
    const finalHeading = { x: -entry.incoming.x, y: -entry.incoming.y };
    const scramblePath = buildScramblePath(
      entry.postMerge,
      entry.incoming,
      finalHeading,
      geometry.normal,
      resolvedTurnSide,
      unitPx,
      switchedLanePx
    );
    const scramble = createSegment(
      "escort-clash-scramble",
      mergeSegment.endTimeMs,
      scramblePath,
      entry.draft.actor.role
    );
    tracks.push({
      actorId: entry.draft.actor.actorId,
      flightId: entry.draft.actor.flightId,
      role: entry.draft.actor.role,
      visibleFromMs: ingress.startTimeMs,
      visibleUntilMs: scramble.endTimeMs,
      segments: [ingress, mergeSegment, scramble]
    });
    scrambleEndByActorId.set(entry.draft.actor.actorId, scramble.endTimeMs);
    scrambleEndPointByActorId.set(entry.draft.actor.actorId, scramble.points[scramble.points.length - 1]!);
    scrambleEndHeadingByActorId.set(entry.draft.actor.actorId, finalHeading);
    void index;
  });

  return {
    tracks,
    mergeTimeMs,
    scrambleEndByActorId,
    scrambleEndPointByActorId,
    scrambleEndHeadingByActorId
  };
}

function buildFighterTracerCues(
  fighterTracks: ReadonlyArray<MutableTrack>,
  actors: ReadonlyArray<AirShowTimelineActor>,
  mergeTimeMs: number,
  seed: number
): AirShowTimelineCue[] {
  const actorById = new Map(actors.map((actor) => [actor.actorId, actor] as const));
  const playerTracks = fighterTracks
    .filter((track) => isPlayerSide(actorById.get(track.actorId)?.faction))
    .sort((left, right) => left.actorId.localeCompare(right.actorId));
  const botTracks = fighterTracks
    .filter((track) => !isPlayerSide(actorById.get(track.actorId)?.faction))
    .sort((left, right) => left.actorId.localeCompare(right.actorId));
  if (playerTracks.length === 0 || botTracks.length === 0) {
    return [];
  }
  const cues: AirShowTimelineCue[] = [];
  const addAlignedCue = (
    source: MutableTrack,
    target: MutableTrack,
    startTimeMs: number,
    endTimeMs: number,
    color: string,
    visibleLengthPx: number
  ): void => {
    const timeMs = findAlignedTracerTime(source, target, startTimeMs, endTimeMs);
    if (timeMs === null) {
      return;
    }
    cues.push({
      kind: "tracer",
      timeMs,
      sourceActorId: source.actorId,
      targetActorId: target.actorId,
      emitter: "nose",
      color,
      width: 0.58,
      lifetimeMs: 94,
      visibleLengthPx
    });
  };

  playerTracks.forEach((playerTrack, index) => {
    const botTrack = botTracks[index % botTracks.length]!;
    const playerMerge = playerTrack.segments.find((segment) => segment.label === "escort-clash-merge");
    const botMerge = botTrack.segments.find((segment) => segment.label === "escort-clash-merge");
    if (!playerMerge || !botMerge) {
      return;
    }
    const windowStartMs = Math.max(playerMerge.startTimeMs, botMerge.startTimeMs, mergeTimeMs - 900);
    const windowEndMs = Math.min(playerMerge.endTimeMs, botMerge.endTimeMs, mergeTimeMs + 160);
    addAlignedCue(playerTrack, botTrack, windowStartMs, windowEndMs, "#ffbf47", 24);
    addAlignedCue(botTrack, playerTrack, windowStartMs, windowEndMs, "#fff0b8", 22);
  });

  const random = createRandom(stableHash(`${seed}:scramble-tracers`));
  const ordered = [...playerTracks, ...botTracks];
  ordered.forEach((source, index) => {
    const opposing = isPlayerSide(actorById.get(source.actorId)?.faction) ? botTracks : playerTracks;
    const target = opposing[(index + 1) % opposing.length];
    const scramble = source.segments.find((segment) => segment.label === "escort-clash-scramble");
    const targetScramble = target?.segments.find((segment) => segment.label === "escort-clash-scramble");
    if (!target || !scramble || !targetScramble) {
      return;
    }
    const overlapStartMs = Math.max(scramble.startTimeMs, targetScramble.startTimeMs);
    const overlapEndMs = Math.min(scramble.endTimeMs, targetScramble.endTimeMs);
    const windowSizeMs = Math.max(0, overlapEndMs - overlapStartMs);
    const jitterMs = windowSizeMs * random() * 0.08;
    addAlignedCue(
      source,
      target,
      overlapStartMs + jitterMs,
      overlapEndMs,
      index % 2 === 0 ? "#ffbf47" : "#fff0b8",
      26
    );
  });
  return cues;
}

function findAlignedTracerTime(
  source: MutableTrack,
  target: MutableTrack,
  requestedStartMs: number,
  requestedEndMs: number
): number | null {
  const sourceStartMs = source.segments[0]?.startTimeMs ?? source.visibleFromMs;
  const sourceEndMs = source.segments[source.segments.length - 1]?.endTimeMs ?? source.visibleUntilMs;
  const targetStartMs = target.segments[0]?.startTimeMs ?? target.visibleFromMs;
  const targetEndMs = target.segments[target.segments.length - 1]?.endTimeMs ?? target.visibleUntilMs;
  const startTimeMs = Math.max(requestedStartMs, source.visibleFromMs, target.visibleFromMs, sourceStartMs, targetStartMs);
  const endTimeMs = Math.min(requestedEndMs, source.visibleUntilMs, target.visibleUntilMs, sourceEndMs, targetEndMs);
  if (endTimeMs <= startTimeMs) {
    return null;
  }

  let bestTimeMs: number | null = null;
  let bestAimErrorDegrees = Number.POSITIVE_INFINITY;
  const sampleCount = 96;
  for (let index = 0; index <= sampleCount; index += 1) {
    const timeMs = startTimeMs + (endTimeMs - startTimeMs) * index / sampleCount;
    const sourceSample = sampleAirShowTimelineTrack(source, timeMs);
    const targetSample = sampleAirShowTimelineTrack(target, timeMs);
    if (!sourceSample || !targetSample) {
      continue;
    }
    const targetVector = normalize(
      targetSample.point.cx - sourceSample.point.cx,
      targetSample.point.cy - sourceSample.point.cy
    );
    const headingRadians = (sourceSample.headingDegrees - 90) * Math.PI / 180;
    const headingVector = { x: Math.cos(headingRadians), y: Math.sin(headingRadians) };
    const dot = clamp(headingVector.x * targetVector.x + headingVector.y * targetVector.y, -1, 1);
    const aimErrorDegrees = Math.acos(dot) * 180 / Math.PI;
    const separationPx = Math.hypot(
      targetSample.point.cx - sourceSample.point.cx,
      targetSample.point.cy - sourceSample.point.cy
    );
    if (separationPx >= 24 && aimErrorDegrees < bestAimErrorDegrees) {
      bestAimErrorDegrees = aimErrorDegrees;
      bestTimeMs = timeMs;
    }
  }
  return bestAimErrorDegrees <= 34 ? bestTimeMs : null;
}

function buildInterceptorPasses(
  drafts: ReadonlyArray<ActorDraft>,
  existingTracks: MutableTrack[],
  geometry: AirShowTimelineGeometry,
  unitPx: number,
  fallbackStartMs: number
): { readonly crossTimeMs: number | null } {
  const interceptors = drafts.filter((draft) => draft.actor.role === "interceptor");
  let primaryCrossTimeMs: number | null = null;
  interceptors.forEach((draft, index) => {
    const existing = existingTracks.find((track) => track.actorId === draft.actor.actorId);
    const track: MutableTrack = existing ?? {
      actorId: draft.actor.actorId,
      flightId: draft.actor.flightId,
      role: draft.actor.role,
      visibleFromMs: fallbackStartMs + index * 80,
      visibleUntilMs: fallbackStartMs + index * 80,
      segments: []
    };
    if (!existing) {
      existingTracks.push(track);
    }
    const lastExistingSegment = track.segments[track.segments.length - 1];
    const start = lastExistingSegment?.points[lastExistingSegment.points.length - 1]
      ?? add(draft.origin, geometry.normal, draft.laneOffsetPx);
    const previousExistingPoint = lastExistingSegment?.points[
      Math.max(0, (lastExistingSegment?.points.length ?? 1) - 2)
    ];
    const startHeading = previousExistingPoint
      ? normalize(start.cx - previousExistingPoint.cx, start.cy - previousExistingPoint.cy, {
          x: -geometry.axis.x,
          y: -geometry.axis.y
        })
      : normalize(geometry.defenseIntercept.cx - start.cx, geometry.defenseIntercept.cy - start.cy, {
          x: -geometry.axis.x,
          y: -geometry.axis.y
        });
    const passHeading = { x: -geometry.axis.x, y: -geometry.axis.y };
    const passNormal = { x: -passHeading.y, y: passHeading.x };
    const turnDot = clamp(startHeading.x * passHeading.x + startHeading.y * passHeading.y, -1, 1);
    const turnCross = startHeading.x * passHeading.y - startHeading.y * passHeading.x;
    const turnDegrees = Math.acos(turnDot) * 180 / Math.PI;
    const turnNormal = { x: -startHeading.y, y: startHeading.x };
    const turnSide: -1 | 1 = Math.abs(turnCross) > 0.001
      ? (turnCross >= 0 ? 1 : -1)
      : draft.turnSide;
    const minimumTurnRadiusPx = resolveAirShowRoleSpeed("interceptor")
      * AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS
      / (FIGHTER_BREAK_TURN_DESIGN_DEGREES_PER_SAMPLE * Math.PI / 180);
    const buildTransitionTurn = (leadDistancePx: number): AirShowPoint[] => {
      const turnStart = add(start, startHeading, leadDistancePx);
      const transitionTurn = turnDegrees > 1
        ? sampleTurnArc(
            turnStart,
            startHeading,
            turnNormal,
            turnSide,
            minimumTurnRadiusPx * 1.08,
            turnDegrees
          )
        : null;
      return dedupePoints([
        start,
        ...(leadDistancePx > 0 ? [turnStart] : []),
        ...(transitionTurn?.points.slice(leadDistancePx > 0 ? 1 : 0) ?? [])
      ]);
    };
    const centeredIndex = index - (interceptors.length - 1) * 0.5;
    const passLanePx = centeredIndex * unitPx * 0.48 + draft.laneOffsetPx * 0.08;
    const cross = offset(
      geometry.defenseIntercept,
      geometry.axis,
      0,
      geometry.normal,
      passLanePx
    );
    const postCross = offset(
      geometry.defenseIntercept,
      geometry.axis,
      -unitPx * 0.82,
      geometry.normal,
      passLanePx
    );
    let turnPoints = buildTransitionTurn(0);
    let turnEnd = turnPoints[turnPoints.length - 1]!;
    let toCross = { x: cross.cx - turnEnd.cx, y: cross.cy - turnEnd.cy };
    let totalAlongPx = toCross.x * passHeading.x + toCross.y * passHeading.y;
    let lateralToLanePx = toCross.x * passNormal.x + toCross.y * passNormal.y;
    let passLeadDistancePx = clamp(totalAlongPx * 0.22, unitPx * 0.32, unitPx * 0.7);
    let transitionAlongPx = totalAlongPx - passLeadDistancePx;
    let hasForwardRunway = transitionAlongPx >= Math.max(unitPx * 0.7, Math.abs(lateralToLanePx) * 2.2);
    for (let step = 1; step <= 12 && !hasForwardRunway; step += 1) {
      turnPoints = buildTransitionTurn(unitPx * 0.25 * step);
      turnEnd = turnPoints[turnPoints.length - 1]!;
      toCross = { x: cross.cx - turnEnd.cx, y: cross.cy - turnEnd.cy };
      totalAlongPx = toCross.x * passHeading.x + toCross.y * passHeading.y;
      lateralToLanePx = toCross.x * passNormal.x + toCross.y * passNormal.y;
      passLeadDistancePx = clamp(totalAlongPx * 0.22, unitPx * 0.32, unitPx * 0.7);
      transitionAlongPx = totalAlongPx - passLeadDistancePx;
      hasForwardRunway = transitionAlongPx >= Math.max(unitPx * 0.7, Math.abs(lateralToLanePx) * 2.2);
    }
    const preCross = hasForwardRunway
      ? offset(turnEnd, passHeading, transitionAlongPx, passNormal, lateralToLanePx)
      : offset(geometry.defenseIntercept, geometry.axis, unitPx * 0.45, geometry.normal, passLanePx);
    const transitionPath = hasForwardRunway
      ? dedupePoints([
          ...turnPoints,
          ...sampleForwardLaneChange(
            turnEnd,
            passHeading,
            passNormal,
            transitionAlongPx,
            lateralToLanePx,
            48
          ).slice(1)
        ])
      : buildLengthGovernedRendezvousPath(
          start,
          startHeading,
          preCross,
          passHeading,
          geometry.normal,
          turnSide,
          Math.max(Math.hypot(preCross.cx - start.cx, preCross.cy - start.cy), unitPx * 2),
          unitPx
        );
    appendSegment(track, "bomber-defense-pass", transitionPath);
    const passPoints = [preCross, cross, postCross];
    const pass = appendSegment(track, "bomber-defense-pass", passPoints);
    const crossDistancePx = measureAirShowPath([preCross, cross]);
    const crossTimeMs = pass.startTimeMs + crossDistancePx / pass.speedPxPerMs;
    if (primaryCrossTimeMs === null || crossTimeMs < primaryCrossTimeMs) {
      primaryCrossTimeMs = crossTimeMs;
    }
    const exitPath = buildSmoothExitPath(
      postCross,
      normalize(postCross.cx - cross.cx, postCross.cy - cross.cy, geometry.axis),
      add(draft.origin, geometry.normal, draft.laneOffsetPx),
      unitPx
    );
    appendSegment(track, "egress", exitPath);
  });
  return { crossTimeMs: primaryCrossTimeMs };
}

function buildBomberTrack(
  draft: ActorDraft,
  geometry: AirShowTimelineGeometry,
  mapBounds: AirShowMapBounds,
  unitPx: number,
  interceptTimeMs: number | null
): { readonly track: MutableTrack; readonly releaseTimeMs: number; readonly releasePoint: AirShowPoint } {
  const lanePx = draft.laneOffsetPx;
  const origin = add(geometry.attackOrigin, geometry.normal, lanePx);
  const defense = add(geometry.defenseIntercept, geometry.normal, lanePx);
  const approach = offset(geometry.target, geometry.axis, -unitPx * 2.45, geometry.normal, lanePx);
  const release = offset(geometry.target, geometry.axis, -unitPx * 0.48, geometry.normal, lanePx);
  const pass = offset(geometry.target, geometry.axis, unitPx * 0.68, geometry.normal, lanePx);
  const ingressEnd = interceptTimeMs !== null ? defense : approach;
  const ingressLengthPx = measureAirShowPath([origin, ingressEnd]);
  const speed = resolveAirShowRoleSpeed("bomber");
  const startTimeMs = interceptTimeMs !== null
    ? interceptTimeMs - ingressLengthPx / speed
    : 300;
  const ingress = createSegment("bomber-ingress", startTimeMs, [origin, ingressEnd], "bomber");
  const track: MutableTrack = {
    actorId: draft.actor.actorId,
    flightId: draft.actor.flightId,
    role: "bomber",
    visibleFromMs: ingress.startTimeMs,
    visibleUntilMs: ingress.endTimeMs,
    segments: [ingress]
  };
  if (interceptTimeMs !== null) {
    appendSegment(track, "bomber-defense-pass", [defense, approach]);
  }
  const targetRunStartMs = track.segments[track.segments.length - 1]!.endTimeMs;
  const turnSide: -1 | 1 = draft.turnSide;
  const arc = sampleTurnArc(pass, geometry.axis, geometry.normal, turnSide, unitPx * 1.5, 160);
  const targetRunPoints = dedupePoints([approach, release, pass, ...arc.points.slice(1)]);
  const targetRun = createSegment("target-run", targetRunStartMs, targetRunPoints, "bomber");
  track.segments.push(targetRun);
  const releaseDistancePx = measureAirShowPath([approach, release]);
  const releaseTimeMs = targetRun.startTimeMs + releaseDistancePx / targetRun.speedPxPerMs;
  const arcEnd = arc.points[arc.points.length - 1]!;
  const boundary = resolveAirShowBoundsRayIntersection(arcEnd, arc.endTangent, mapBounds);
  const exit = boundary
    ? add(boundary, arc.endTangent, AIR_SHOW_OFF_MAP_DISTANCE_PX)
    : add(arcEnd, arc.endTangent, Math.hypot(mapBounds.maxX - mapBounds.minX, mapBounds.maxY - mapBounds.minY) + AIR_SHOW_OFF_MAP_DISTANCE_PX);
  appendSegment(track, "egress", [arcEnd, exit]);
  return { track, releaseTimeMs, releasePoint: release };
}

function buildFlakCues(
  scene: ResolvedAirShowScene,
  bomberTrack: MutableTrack,
  releaseTimeMs: number,
  geometry: AirShowTimelineGeometry,
  seed: number
): AirShowTimelineCue[] {
  if (!scene.flakBursts || scene.flakBursts.length === 0) {
    return [];
  }
  const batteryKeys = Array.from(new Set(
    scene.flakBursts.map((burst) => burst.batteryHexKey ?? "unscoped-battery")
  ));
  const startTimeMs = Math.max(
    bomberTrack.visibleFromMs + 240,
    releaseTimeMs - 3600
  );
  const endTimeMs = releaseTimeMs - 140;
  if (endTimeMs <= startTimeMs) {
    return [];
  }
  const cues: AirShowTimelineCue[] = [];
  batteryKeys.forEach((batteryKey, batteryIndex) => {
    const random = createRandom(stableHash(`${seed}:${bomberTrack.actorId}:${batteryKey}`));
    let timeMs = startTimeMs + batteryIndex * 83 + random() * 140;
    let puffIndex = 0;
    while (timeMs < endTimeMs && puffIndex < 18) {
      const sample = sampleAirShowTimelineTrack(bomberTrack, timeMs);
      if (sample) {
        const alongOffsetPx = (random() - 0.5) * 54;
        const lateralOffsetPx = (random() - 0.5) * 112;
        cues.push({
          kind: "flak",
          timeMs,
          bomberActorId: bomberTrack.actorId,
          batteryHexKey: batteryKey === "unscoped-battery" ? null : batteryKey,
          point: offset(sample.point, geometry.axis, alongOffsetPx, geometry.normal, lateralOffsetPx),
          scale: 0.58 + random() * 0.16,
          smokeScale: 0.92 + random() * 0.2,
          lingerMs: 1400 + Math.round(random() * 1000)
        });
      }
      timeMs += 210 + random() * 230;
      puffIndex += 1;
    }
  });
  return cues;
}

function deconflictFlakCueTimes(cues: ReadonlyArray<AirShowTimelineCue>): AirShowTimelineCue[] {
  const occupiedMilliseconds = new Set<number>();
  return [...cues]
    .sort((left, right) => left.timeMs - right.timeMs)
    .map((cue): AirShowTimelineCue => {
      if (cue.kind !== "flak") {
        return cue;
      }
      let timeMs = cue.timeMs;
      while (occupiedMilliseconds.has(Math.round(timeMs))) {
        timeMs += 7;
      }
      occupiedMilliseconds.add(Math.round(timeMs));
      return timeMs === cue.timeMs ? cue : { ...cue, timeMs };
    });
}

function buildBombers(
  scene: ResolvedAirShowScene,
  bomberDrafts: ReadonlyArray<ActorDraft>,
  geometry: AirShowTimelineGeometry,
  mapBounds: AirShowMapBounds,
  unitPx: number,
  interceptTimeMs: number | null,
  seed: number
): BomberPlanResult {
  const tracks: MutableTrack[] = [];
  const cues: AirShowTimelineCue[] = [];
  let primaryReleaseTimeMs: number | null = null;
  bomberDrafts.forEach((draft, index) => {
    const staggeredInterceptMs = interceptTimeMs === null ? null : interceptTimeMs + index * 115;
    const planned = buildBomberTrack(draft, geometry, mapBounds, unitPx, staggeredInterceptMs);
    tracks.push(planned.track);
    if (!scene.strikeAborted) {
      cues.push({
        kind: "bomb-release",
        timeMs: planned.releaseTimeMs,
        bomberActorId: draft.actor.actorId,
        targetHexKey: scene.bomberTargetHexKey ?? null,
        point: planned.releasePoint
      });
    }
    cues.push(...buildFlakCues(scene, planned.track, planned.releaseTimeMs, geometry, seed));
    if (index === 0 && !scene.strikeAborted) {
      primaryReleaseTimeMs = planned.releaseTimeMs;
      cues.push({
        kind: "impact",
        timeMs: planned.releaseTimeMs + 320,
        targetHexKey: scene.bomberTargetHexKey ?? null,
        point: geometry.target
      });
    }
  });
  return { tracks, cues, primaryReleaseTimeMs };
}

function synchronizeBomberTargetRunsForEscortArrival(
  bomberPlan: BomberPlanResult,
  bomberDrafts: ReadonlyArray<ActorDraft>,
  escortDrafts: ReadonlyArray<ActorDraft>,
  fighterTracks: ReadonlyArray<MutableTrack>,
  geometry: AirShowTimelineGeometry,
  unitPx: number
): BomberPlanResult {
  if (bomberPlan.tracks.length === 0 || escortDrafts.length === 0) {
    return bomberPlan;
  }

  let requestedFormationDelayMs = 0;
  for (let timingPass = 0; timingPass < 8; timingPass += 1) {
    let additionalDelayMs = 0;
    escortDrafts.forEach((draft, index) => {
      const fighterTrack = fighterTracks.find((track) => track.actorId === draft.actor.actorId);
      const last = fighterTrack?.segments[fighterTrack.segments.length - 1];
      const bomberTrack = bomberPlan.tracks[index % bomberPlan.tracks.length];
      const bomberTargetRun = bomberTrack?.segments.find((segment) => segment.label === "target-run");
      if (!fighterTrack || !last || !bomberTrack || !bomberTargetRun) {
        return;
      }
      const start = last.points[last.points.length - 1]!;
      const previous = last.points[Math.max(0, last.points.length - 2)]!;
      const startHeading = normalize(start.cx - previous.cx, start.cy - previous.cy, geometry.axis);
      const screenSide: -1 | 1 = index % 2 === 0 ? -1 : 1;
      const screenPath = buildBomberScreenPath(bomberTargetRun, screenSide, unitPx, geometry);
      const screenStart = screenPath[0]!;
      const screenStartHeading = normalize(
        screenPath[1]!.cx - screenStart.cx,
        screenPath[1]!.cy - screenStart.cy,
        geometry.axis
      );
      const intendedStartMs = bomberTargetRun.startTimeMs + requestedFormationDelayMs;
      const availableLengthPx = Math.max(
        Math.hypot(screenStart.cx - start.cx, screenStart.cy - start.cy),
        (intendedStartMs - last.endTimeMs) * resolveAirShowRoleSpeed(draft.actor.role)
      );
      const candidate = buildLengthGovernedRendezvousPath(
        start,
        startHeading,
        screenStart,
        screenStartHeading,
        geometry.normal,
        draft.turnSide,
        availableLengthPx,
        unitPx
      );
      const arrivalMs = last.endTimeMs
        + measureAirShowPath(candidate) / resolveAirShowRoleSpeed(draft.actor.role);
      additionalDelayMs = Math.max(additionalDelayMs, arrivalMs - intendedStartMs);
    });
    if (additionalDelayMs <= 0.1) {
      break;
    }
    requestedFormationDelayMs += additionalDelayMs;
  }
  if (requestedFormationDelayMs <= 0.001) {
    return bomberPlan;
  }

  const delayByBomberId = new Map<string, number>();
  const formationTurnSide = bomberDrafts[0]?.turnSide ?? 1;
  bomberPlan.tracks.forEach((track) => {
    const defenseIndex = track.segments.findIndex((segment) => segment.label === "bomber-defense-pass");
    const targetRunIndex = track.segments.findIndex((segment) => segment.label === "target-run");
    const defense = track.segments[defenseIndex];
    const targetRun = track.segments[targetRunIndex];
    if (!defense || !targetRun) {
      return;
    }

    const previousSegment = track.segments[defenseIndex - 1];
    const nextSegment = track.segments[targetRunIndex];
    const start = defense.points[0]!;
    const end = defense.points[defense.points.length - 1]!;
    const previousPoint = previousSegment?.points[Math.max(0, previousSegment.points.length - 2)] ?? start;
    const nextPoint = nextSegment?.points[Math.min(1, (nextSegment?.points.length ?? 1) - 1)] ?? end;
    const startHeading = normalize(start.cx - previousPoint.cx, start.cy - previousPoint.cy, geometry.axis);
    const endHeading = normalize(nextPoint.cx - end.cx, nextPoint.cy - end.cy, geometry.axis);
    const governedPath = buildLengthGovernedRendezvousPath(
      start,
      startHeading,
      end,
      endHeading,
      geometry.normal,
      formationTurnSide,
      defense.lengthPx + requestedFormationDelayMs * resolveAirShowRoleSpeed("bomber"),
      unitPx
    );
    const replacement = createSegment(
      "bomber-defense-pass",
      defense.startTimeMs,
      governedPath,
      "bomber"
    );
    const realizedDelayMs = replacement.endTimeMs - defense.endTimeMs;
    track.segments[defenseIndex] = replacement;
    for (let segmentIndex = defenseIndex + 1; segmentIndex < track.segments.length; segmentIndex += 1) {
      track.segments[segmentIndex]!.startTimeMs += realizedDelayMs;
      track.segments[segmentIndex]!.endTimeMs += realizedDelayMs;
    }
    track.visibleUntilMs += realizedDelayMs;
    delayByBomberId.set(track.actorId, realizedDelayMs);
  });

  const primaryBomberId = bomberPlan.tracks[0]?.actorId;
  const adjustedCues = bomberPlan.cues.map((cue): AirShowTimelineCue => {
    if (cue.kind === "impact") {
      return { ...cue, timeMs: cue.timeMs + (primaryBomberId ? delayByBomberId.get(primaryBomberId) ?? 0 : 0) };
    }
    if (cue.kind === "bomb-release" || cue.kind === "flak") {
      return { ...cue, timeMs: cue.timeMs + (delayByBomberId.get(cue.bomberActorId) ?? 0) };
    }
    return cue;
  });
  const primaryDelayMs = primaryBomberId ? delayByBomberId.get(primaryBomberId) ?? 0 : 0;
  return {
    tracks: bomberPlan.tracks,
    cues: adjustedCues,
    primaryReleaseTimeMs: bomberPlan.primaryReleaseTimeMs === null
      ? null
      : bomberPlan.primaryReleaseTimeMs + primaryDelayMs
  };
}

function buildScreenEscortTracks(
  escortDrafts: ReadonlyArray<ActorDraft>,
  existingTracks: MutableTrack[],
  geometry: AirShowTimelineGeometry,
  mapBounds: AirShowMapBounds,
  unitPx: number,
  bomberTracks: ReadonlyArray<MutableTrack>
): void {
  escortDrafts.forEach((draft, index) => {
    const bomberTrack = bomberTracks[index % bomberTracks.length];
    const bomberTargetRun = bomberTrack?.segments.find((segment) => segment.label === "target-run");
    if (!bomberTargetRun) {
      return;
    }
    const existing = existingTracks.find((track) => track.actorId === draft.actor.actorId);
    const existingLastSegment = existing?.segments[existing.segments.length - 1];
    const existingStart = existingLastSegment?.points[existingLastSegment.points.length - 1] ?? null;
    const existingPreviousPoint = existingLastSegment?.points[
      Math.max(0, (existingLastSegment?.points.length ?? 1) - 2)
    ] ?? null;
    const screenHeading = existingStart && existingPreviousPoint
      ? normalize(
          existingStart.cx - existingPreviousPoint.cx,
          existingStart.cy - existingPreviousPoint.cy,
          geometry.axis
        )
      : geometry.axis;
    const screenSide: -1 | 1 = index % 2 === 0 ? -1 : 1;
    const screenPath = buildBomberScreenPath(bomberTargetRun, screenSide, unitPx, geometry);
    const screenStart = screenPath[0]!;
    const screenEnd = screenPath[screenPath.length - 1]!;
    const screenStartHeading = normalize(
      screenPath[1]!.cx - screenStart.cx,
      screenPath[1]!.cy - screenStart.cy,
      geometry.axis
    );
    const screenEndHeading = normalize(
      screenEnd.cx - screenPath[screenPath.length - 2]!.cx,
      screenEnd.cy - screenPath[screenPath.length - 2]!.cy,
      geometry.axis
    );
    const exitBoundary = resolveAirShowBoundsRayIntersection(screenEnd, screenEndHeading, mapBounds);
    const exit = exitBoundary
      ? add(exitBoundary, screenEndHeading, AIR_SHOW_OFF_MAP_DISTANCE_PX)
      : add(screenEnd, screenEndHeading, AIR_SHOW_OFF_MAP_DISTANCE_PX + unitPx * 8);
    if (!existing) {
      const origin = add(geometry.attackOrigin, geometry.normal, draft.laneOffsetPx);
      const ingressPath = sampleCubicBezier(
        origin,
        add(origin, geometry.axis, unitPx * 1.8),
        add(screenStart, screenStartHeading, -unitPx * 1.4),
        screenStart,
        64
      );
      const ingressLengthPx = measureAirShowPath(ingressPath);
      const startTimeMs = bomberTargetRun.startTimeMs
        - ingressLengthPx / resolveAirShowRoleSpeed(draft.actor.role);
      const ingress = createSegment("fighter-ingress", startTimeMs, ingressPath, draft.actor.role);
      const track: MutableTrack = {
        actorId: draft.actor.actorId,
        flightId: draft.actor.flightId,
        role: draft.actor.role,
        visibleFromMs: ingress.startTimeMs,
        visibleUntilMs: ingress.endTimeMs,
        segments: [ingress]
      };
      appendSegment(track, "target-run", screenPath);
      appendSegment(track, "egress", [screenEnd, exit]);
      existingTracks.push(track);
      return;
    }

    const last = existing.segments[existing.segments.length - 1]!;
    const start = last.points[last.points.length - 1]!;
    const rendezvousBudgetPx = Math.max(
      Math.hypot(screenStart.cx - start.cx, screenStart.cy - start.cy),
      (bomberTargetRun.startTimeMs - last.endTimeMs) * resolveAirShowRoleSpeed(draft.actor.role)
    );
    const rendezvousPath = buildLengthGovernedRendezvousPath(
      start,
      screenHeading,
      screenStart,
      screenStartHeading,
      geometry.normal,
      draft.turnSide,
      rendezvousBudgetPx,
      unitPx
    );
    appendSegment(existing, "bomber-defense-pass", rendezvousPath);
    appendSegment(existing, "target-run", screenPath);
    appendSegment(existing, "egress", [screenEnd, exit]);
  });
}

function appendCapClashEgress(
  drafts: ReadonlyArray<ActorDraft>,
  tracks: MutableTrack[],
  geometry: AirShowTimelineGeometry,
  unitPx: number
): void {
  drafts.filter((draft) => draft.actor.role !== "bomber").forEach((draft) => {
    const track = tracks.find((candidate) => candidate.actorId === draft.actor.actorId);
    if (!track) {
      return;
    }
    const last = track.segments[track.segments.length - 1]!;
    const start = last.points[last.points.length - 1]!;
    const exit = add(draft.origin, geometry.normal, draft.laneOffsetPx);
    const previousPoint = last.points[Math.max(0, last.points.length - 2)]!;
    const heading = normalize(start.cx - previousPoint.cx, start.cy - previousPoint.cy, geometry.axis);
    appendSegment(track, "egress", buildSmoothExitPath(start, heading, exit, unitPx));
  });
}

function buildBomberDefenseTracerCues(
  interceptorTracks: ReadonlyArray<MutableTrack>,
  bomberTracks: ReadonlyArray<MutableTrack>
): AirShowTimelineCue[] {
  if (interceptorTracks.length === 0 || bomberTracks.length === 0) {
    return [];
  }
  const cues: AirShowTimelineCue[] = [];
  interceptorTracks.forEach((source, index) => {
    const target = bomberTracks[index % bomberTracks.length]!;
    const sourceSegments = source.segments.filter((segment) => segment.label === "bomber-defense-pass");
    const targetSegments = target.segments.filter((segment) => segment.label === "bomber-defense-pass");
    if (sourceSegments.length === 0 || targetSegments.length === 0) {
      return;
    }
    const startTimeMs = Math.max(
      Math.min(...sourceSegments.map((segment) => segment.startTimeMs)),
      Math.min(...targetSegments.map((segment) => segment.startTimeMs))
    );
    const endTimeMs = Math.min(
      Math.max(...sourceSegments.map((segment) => segment.endTimeMs)),
      Math.max(...targetSegments.map((segment) => segment.endTimeMs))
    );
    const timeMs = findAlignedTracerTime(source, target, startTimeMs, endTimeMs);
    if (timeMs === null) {
      return;
    }
    cues.push({
      kind: "tracer",
      timeMs,
      sourceActorId: source.actorId,
      targetActorId: target.actorId,
      emitter: "nose",
      color: "#ffbf47",
      width: 0.62,
      lifetimeMs: 96,
      visibleLengthPx: 28
    });
  });
  return cues;
}

function buildTracerTargetPairs(
  sourceTracks: ReadonlyArray<MutableTrack>,
  targetTracks: ReadonlyArray<MutableTrack>
): ReadonlyArray<readonly [MutableTrack, MutableTrack]> {
  if (sourceTracks.length === 0 || targetTracks.length === 0) {
    return [];
  }
  return sourceTracks.map((source, index) => {
    const target = targetTracks[index % targetTracks.length]!;
    return [source, target] as const;
  });
}

function buildBomberTurretTracerCues(
  bomberTracks: ReadonlyArray<MutableTrack>,
  interceptorTracks: ReadonlyArray<MutableTrack>
): AirShowTimelineCue[] {
  return buildTracerTargetPairs(bomberTracks, interceptorTracks).flatMap(([source, target], index) => {
    const sourceSegments = source.segments.filter((segment) => segment.label === "bomber-defense-pass");
    const targetSegments = target.segments.filter((segment) => segment.label === "bomber-defense-pass");
    if (sourceSegments.length === 0 || targetSegments.length === 0) {
      return [];
    }
    const startTimeMs = Math.max(sourceSegments[0]!.startTimeMs, targetSegments[0]!.startTimeMs);
    const endTimeMs = Math.min(
      sourceSegments[sourceSegments.length - 1]!.endTimeMs,
      targetSegments[targetSegments.length - 1]!.endTimeMs
    );
    if (endTimeMs <= startTimeMs) {
      return [];
    }
    return [{
      kind: "tracer" as const,
      timeMs: startTimeMs + (endTimeMs - startTimeMs) * (0.45 + (index % 3) * 0.08),
      sourceActorId: source.actorId,
      targetActorId: target.actorId,
      emitter: "center" as const,
      color: "#fff0b8",
      width: 0.52,
      lifetimeMs: 90,
      visibleLengthPx: 22
    }];
  });
}

function addDestructionCues(
  actors: ReadonlyArray<AirShowTimelineActor>,
  tracks: MutableTrack[],
  cues: AirShowTimelineCue[]
): void {
  const actorsByFlight = new Map<string, AirShowTimelineActor[]>();
  actors.forEach((actor) => {
    const group = actorsByFlight.get(actor.flightId) ?? [];
    group.push(actor);
    actorsByFlight.set(actor.flightId, group);
  });
  actorsByFlight.forEach((flightActors) => {
    const initialStrength = Math.max(...flightActors.map((actor) => actor.initialStrength));
    const finalStrength = Math.max(...flightActors.map((actor) => actor.finalStrength));
    const survivingActorCount = finalStrength <= 0
      ? 0
      : clamp(Math.ceil(finalStrength / STRENGTH_PER_ACTOR), 1, flightActors.length);
    if (initialStrength <= 0 || survivingActorCount >= flightActors.length) {
      return;
    }
    flightActors.slice(survivingActorCount).forEach((actor, lossIndex) => {
      const track = tracks.find((candidate) => candidate.actorId === actor.actorId);
      if (!track) {
        return;
      }
      const lossSegment =
        track.segments.find((segment) => segment.label === "bomber-defense-pass")
        ?? track.segments.find((segment) => segment.label === "escort-clash-scramble")
        ?? track.segments[Math.max(0, track.segments.length - 2)];
      if (!lossSegment) {
        return;
      }
      const timeMs = lossSegment.startTimeMs
        + (lossSegment.endTimeMs - lossSegment.startTimeMs) * clamp(0.62 + lossIndex * 0.08, 0.62, 0.86);
      cues.push({ kind: "destruction", timeMs, actorId: actor.actorId });
      track.visibleUntilMs = Math.min(track.visibleUntilMs, timeMs + 900);
    });
  });
}

function shiftTimeline(
  tracks: MutableTrack[],
  cues: AirShowTimelineCue[],
  minimumStartMs = 180
): void {
  const earliest = Math.min(
    ...tracks.map((track) => track.visibleFromMs),
    ...cues.map((cue) => cue.timeMs),
    minimumStartMs
  );
  const shiftMs = earliest < minimumStartMs ? minimumStartMs - earliest : 0;
  if (shiftMs <= 0) {
    return;
  }
  tracks.forEach((track) => {
    track.visibleFromMs += shiftMs;
    track.visibleUntilMs += shiftMs;
    track.segments.forEach((segment) => {
      segment.startTimeMs += shiftMs;
      segment.endTimeMs += shiftMs;
    });
  });
  for (let index = 0; index < cues.length; index += 1) {
    cues[index] = { ...cues[index]!, timeMs: cues[index]!.timeMs + shiftMs } as AirShowTimelineCue;
  }
}

function buildBeats(tracks: ReadonlyArray<MutableTrack>): AirShowTimelineBeat[] {
  const labels: AirShowBeatLabel[] = [
    "fighter-ingress",
    "escort-clash-merge",
    "escort-clash-scramble",
    "bomber-ingress",
    "bomber-defense-pass",
    "target-run",
    "egress"
  ];
  return labels.flatMap((label) => {
    const segments = tracks.flatMap((track) => track.segments.filter((segment) => segment.label === label));
    if (segments.length === 0) {
      return [];
    }
    return [{
      label,
      startTimeMs: Math.min(...segments.map((segment) => segment.startTimeMs)),
      endTimeMs: Math.max(...segments.map((segment) => segment.endTimeMs))
    }];
  }).sort((left, right) => left.startTimeMs - right.startTimeMs || left.label.localeCompare(right.label));
}

function immutableTrack(track: MutableTrack): AirShowTimelineTrack {
  return {
    actorId: track.actorId,
    flightId: track.flightId,
    role: track.role,
    visibleFromMs: track.visibleFromMs,
    visibleUntilMs: track.visibleUntilMs,
    segments: track.segments.map((segment): AirShowTimelineSegment => ({
      label: segment.label,
      startTimeMs: segment.startTimeMs,
      endTimeMs: segment.endTimeMs,
      speedPxPerMs: segment.speedPxPerMs,
      lengthPx: segment.lengthPx,
      points: segment.points.map((point) => ({ cx: point.cx, cy: point.cy }))
    }))
  };
}

export function planAirShowTimeline(input: AirShowDirectorInput): AirShowTimeline {
  const { scene, mapBounds } = input;
  const center = {
    cx: (mapBounds.minX + mapBounds.maxX) * 0.5,
    cy: (mapBounds.minY + mapBounds.maxY) * 0.5
  };
  const fallbackInsetPx = Math.max(input.hexWidth, input.hexHeight) * 1.5;
  const playerHq = input.playerHq ?? { cx: mapBounds.minX + fallbackInsetPx, cy: center.cy };
  const botHq = input.botHq ?? { cx: mapBounds.maxX - fallbackInsetPx, cy: center.cy };
  const hqAxis = resolveAirShowHqAxis(playerHq, botHq, mapBounds, AIR_SHOW_OFF_MAP_DISTANCE_PX);
  if (!hqAxis) {
    throw new Error("AirShowDirector could not resolve the HQ axis from map geometry.");
  }

  const scenario = resolveScenario(scene);
  const bombers = resolveResolvedAirShowBombers(scene);
  const attackFaction = bombers[0]?.faction ?? scene.escorts[0]?.faction ?? "Player";
  const attackOrigin = isPlayerSide(attackFaction) ? hqAxis.playerOrigin : hqAxis.botOrigin;
  const defenseOrigin = isPlayerSide(attackFaction) ? hqAxis.botOrigin : hqAxis.playerOrigin;
  const target = input.target ?? input.engagement;
  const axis = normalize(target.cx - attackOrigin.cx, target.cy - attackOrigin.cy, {
    x: -hqAxis.axis.x,
    y: -hqAxis.axis.y
  });
  const normal = { x: -axis.y, y: axis.x };
  const unitPx = Math.max(48, Math.max(input.hexWidth, input.hexHeight));
  const originToTargetPx = Math.hypot(target.cx - attackOrigin.cx, target.cy - attackOrigin.cy);
  const mergeLeadPx = scenario === "cap-clash"
    ? 0
    : clamp(originToTargetPx * 0.42, unitPx * 3.8, unitPx * 6.2);
  const merge = scenario === "cap-clash"
    ? input.engagement
    : add(target, axis, -mergeLeadPx);
  const defenseIntercept = scenario === "cap-clash"
    ? input.engagement
    : add(merge, axis, -unitPx * 1.2);
  const release = add(target, axis, -unitPx * 0.48);
  const geometry: AirShowTimelineGeometry = {
    mapBounds,
    playerHq,
    botHq,
    playerOrigin: hqAxis.playerOrigin,
    botOrigin: hqAxis.botOrigin,
    attackOrigin,
    defenseOrigin,
    engagement: input.engagement,
    target,
    merge,
    defenseIntercept,
    release,
    axis,
    normal
  };
  const sceneSeed = input.seed ?? stableHash([
    scene.hexKey,
    scene.kind ?? "airToAir",
    ...scene.interceptors.map((flight) => flight.id),
    ...scene.escorts.map((flight) => flight.id),
    ...bombers.map((flight) => flight.id)
  ].join("|"));
  const built = buildActors(scene, hqAxis.playerOrigin, hqAxis.botOrigin, sceneSeed);
  const tracks: MutableTrack[] = [];
  let cues: AirShowTimelineCue[] = [];
  const fighterDrafts = built.drafts.filter((draft) => draft.actor.role !== "bomber");
  const bomberDrafts = built.drafts.filter((draft) => draft.actor.role === "bomber");
  const playerFighterPresent = fighterDrafts.some((draft) => isPlayerSide(draft.actor.faction));
  const botFighterPresent = fighterDrafts.some((draft) => !isPlayerSide(draft.actor.faction));
  const hasFighterClash = playerFighterPresent && botFighterPresent
    && (scenario === "cap-clash" || scenario === "full-engagement");
  let clash: FighterClashPlan | null = null;
  if (hasFighterClash) {
    clash = buildFighterClash(fighterDrafts, geometry, unitPx);
    tracks.push(...clash.tracks);
    cues.push(...buildFighterTracerCues(clash.tracks, built.actors, clash.mergeTimeMs, sceneSeed));
  }

  if (scenario === "cap-clash") {
    appendCapClashEgress(fighterDrafts, tracks, geometry, unitPx);
  }

  let interceptTimeMs: number | null = null;
  if (scenario === "intercepted-strike" || scenario === "full-engagement") {
    const fallbackStartMs = clash
      ? Math.max(...clash.tracks.map((track) => track.visibleUntilMs))
      : 300;
    const interceptorPass = buildInterceptorPasses(
      fighterDrafts,
      tracks,
      geometry,
      unitPx,
      fallbackStartMs
    );
    interceptTimeMs = interceptorPass.crossTimeMs;
  }

  let bomberPlan = buildBombers(
    scene,
    bomberDrafts,
    geometry,
    mapBounds,
    unitPx,
    interceptTimeMs,
    sceneSeed
  );
  const escortDrafts = fighterDrafts.filter((draft) => draft.actor.role === "escort");
  if (scenario === "full-engagement") {
    bomberPlan = synchronizeBomberTargetRunsForEscortArrival(
      bomberPlan,
      bomberDrafts,
      escortDrafts,
      tracks,
      geometry,
      unitPx
    );
  }
  tracks.push(...bomberPlan.tracks);
  cues.push(...bomberPlan.cues);

  if (scenario === "escorted-strike" || scenario === "full-engagement") {
    buildScreenEscortTracks(
      escortDrafts,
      tracks,
      geometry,
      mapBounds,
      unitPx,
      bomberPlan.tracks
    );
  }

  const interceptorTracks = tracks.filter((track) => track.role === "interceptor");
  cues.push(...buildBomberDefenseTracerCues(interceptorTracks, bomberPlan.tracks));
  cues.push(...buildBomberTurretTracerCues(bomberPlan.tracks, interceptorTracks));
  addDestructionCues(built.actors, tracks, cues);
  shiftTimeline(tracks, cues);
  cues = deconflictFlakCueTimes(cues);
  const immutableTracks = tracks.map(immutableTrack);
  const beats = buildBeats(tracks);
  const totalDurationMs = Math.max(
    1,
    ...immutableTracks.map((track) => track.visibleUntilMs),
    ...cues.map((cue) => cue.timeMs + (cue.kind === "impact" ? 700 : 0))
  );
  const withoutVerification: Omit<AirShowTimeline, "verification"> = {
    version: 2,
    sceneId: scene.hexKey,
    seed: sceneSeed,
    scenario,
    totalDurationMs,
    geometry,
    originPlan: buildAirShowInspectionOriginPlan(hqAxis, AIR_SHOW_OFF_MAP_DISTANCE_PX),
    flights: built.flights,
    actors: built.actors,
    tracks: immutableTracks,
    beats,
    cues: [...cues].sort((left, right) => left.timeMs - right.timeMs)
  };
  const verification = verifyAirShowTimeline(withoutVerification);
  return { ...withoutVerification, verification };
}
