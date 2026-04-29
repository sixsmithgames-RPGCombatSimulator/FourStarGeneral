import { HEX_HEIGHT } from "../../core/balance";
import {
  buildAirShowInspectionOriginPlan,
  buildAirShowPhaseTimingAudit,
  resolveAirShowFallbackOrigin
} from "./AirShowPlanner";
import type {
  AirShowHqAxis,
  AirShowInspectionPhaseTimingAudit,
  AirShowMapBounds,
  AirShowPhaseTimingSample
} from "./AirShowPlanner";
import type {
  AirShowInspectionFlakBurst,
  AirShowInspectionPhase,
  AirShowInspectionSampledPosition,
  AirShowPoint,
  PlannedAirShowFlight,
  PlannedAirShowScene,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowScene,
  ResolvedAirShowStrikeFlightSpec
} from "./AirShowPlaybackScene";

export interface AirShowPlannerActor {
  id: string;
  flightId: string;
  role: "interceptor" | "escort" | "bomber";
  size: number;
  formationIndex: number;
  headingDegrees: number;
  position: AirShowPoint;
  biasX: number;
  biasY: number;
  active: boolean;
}

export interface AirShowPlannerFlight {
  spec: ResolvedAirShowFlightSpec;
  actors: AirShowPlannerActor[];
  currentStrength: number;
  anchor: AirShowPoint;
}

export interface AirShowPlannerAssignmentProgressKeyframe {
  timeMs: number;
  progress: number;
}

export interface AirShowPlannerPhaseAssignment {
  actor: AirShowPlannerActor;
  points: AirShowPoint[];
  headingBlend?: number;
  multiFlightOffsetPx?: number;
  progressOffset?: number;
  distanceBudgetPx?: number;
  progressTimeline?: ReadonlyArray<AirShowPlannerAssignmentProgressKeyframe>;
}

export interface AirShowPlannerBomberApproachProfile {
  targetCenter: AirShowPoint;
  targetApproach: AirShowPoint;
  standoffPoint: AirShowPoint;
  laneIndex: number;
}

export interface AirShowPlannerContestedBomberPhaseDurations {
  fighterIngressDurationMs: number;
  escortMergeDurationMs: number;
  escortScrambleDurationMs: number;
  bomberIngressDurationMs: number;
  bomberDefenseDurationMs: number;
}

export interface AirShowPlannerContestedFighterIngressPlan {
  assignments: AirShowPlannerPhaseAssignment[];
  durationMs: number;
  roleSpeeds: ReadonlyMap<AirShowPlannerActor["role"], number>;
  progressSamplePoints: number[];
}

export type AirShowPlannerContestedBomberPhaseLabel =
  | "fighter-ingress"
  | "escort-clash-merge"
  | "escort-clash-scramble"
  | "bomber-ingress"
  | "bomber-defense-pass";

export interface AirShowPlannerTracerBurst {
  progress: number;
  source: AirShowPlannerActor;
  target: AirShowPlannerActor | AirShowPoint;
  emitter: "nose" | "center";
  color?: string;
  width?: number;
  lifetimeMs?: number;
  burstCount?: number;
  spreadPx?: number;
  streakLengthPx?: number;
  visibleLengthPx?: number;
  fanHalfAngleDeg?: number;
}

export interface AirShowPlannerCorridor {
  center: AirShowPoint;
  axis: { x: number; y: number };
  normal: { x: number; y: number };
  entry: AirShowPoint;
  merge: AirShowPoint;
  strike: AirShowPoint;
  exit: AirShowPoint;
}

type AirShowRuntimeActor = AirShowPlannerActor;
type AirShowRuntimeFlightInternal = AirShowPlannerFlight;
type AirShowPhaseAssignment = AirShowPlannerPhaseAssignment;
type AirShowTracerBurst = AirShowPlannerTracerBurst;
type AirShowContestedBomberPhaseLabel = AirShowPlannerContestedBomberPhaseLabel;

export interface PlanResolvedAirCombatShowHost {
  readonly offMapDistancePx: number;
  readonly airShowFighterSpeedPxPerMs: number;
  readonly airShowBomberSpeedPxPerMs: number;
  resolveHexCenterByKey(hexKey: string | null | undefined): AirShowPoint | null;
  resolveHqAxis(
    playerHqKey: string | null | undefined,
    botHqKey: string | null | undefined
  ): AirShowHqAxis | null;
  resolveAirShowMapBounds(): AirShowMapBounds | null;
  resolveAircraftHeadingDegrees(dx: number, dy: number, fallbackDegrees?: number): number;
  buildAirShowPlannedFlight(
    spec: ResolvedAirShowFlightSpec,
    fallbackOrigin: AirShowPoint,
    defaultHeadingDegrees: number
  ): AirShowPlannerFlight | null;
  resolveSceneBomberSpecs(scene: ResolvedAirShowScene): ReadonlyArray<ResolvedAirShowStrikeFlightSpec>;
  seedFromHexKey(seed: string): number;
  seededRandom(seed: number): () => number;
  resolveAirShowBomberTargetCenter(
    spec: ResolvedAirShowStrikeFlightSpec,
    scene: ResolvedAirShowScene
  ): AirShowPoint | null;
  averageAirShowPoints(points: ReadonlyArray<AirShowPoint>): AirShowPoint | null;
  averageAirShowPosition(
    actors: ReadonlyArray<Pick<AirShowPlannerActor, "position">>
  ): AirShowPoint | null;
  resolveAirShowCorridor(
    center: AirShowPoint,
    averageBomberAnchor: AirShowPoint | null,
    averageBomberTargetCenter: AirShowPoint | null,
    hqAxis?: AirShowHqAxis | null
  ): AirShowPlannerCorridor;
  normalizeAirShowSceneFlightAnchors(
    corridor: AirShowPlannerCorridor,
    sceneKind: ResolvedAirShowScene["kind"],
    interceptorFlights: ReadonlyArray<AirShowPlannerFlight>,
    escortFlights: ReadonlyArray<AirShowPlannerFlight>,
    bomberFlights: ReadonlyArray<AirShowPlannerFlight>,
    hqAxis: AirShowHqAxis | null
  ): void;
  resolveAirShowBomberApproachProfiles(
    bomberFlights: ReadonlyArray<AirShowPlannerFlight>,
    corridor: AirShowPlannerCorridor,
    bomberTargetCentersById: ReadonlyMap<string, AirShowPoint>,
    averageBomberTargetCenter: AirShowPoint | null,
    stageRandom: (label: string) => () => number
  ): ReadonlyMap<string, AirShowPlannerBomberApproachProfile>;
  clamp(value: number, min: number, max: number): number;
  projectAirShowCorridorPoint(
    corridor: AirShowPlannerCorridor,
    alongPx: number,
    lateralPx?: number
  ): AirShowPoint;
  buildAirShowAssignmentLookup(
    assignments: ReadonlyArray<AirShowPlannerPhaseAssignment>
  ): ReadonlyMap<string, AirShowPlannerPhaseAssignment>;
  sampleAirShowAssignmentAtTime(
    assignment: AirShowPlannerPhaseAssignment,
    timeMs: number,
    durationMs: number,
    terminalProgress?: number
  ): { position: AirShowPoint; headingDegrees: number; size: number; pathProgress: number };
  shouldRenderAirShowTracerBurst(
    source: Pick<AirShowPlannerActor, "position" | "headingDegrees" | "size">,
    targetPoint: AirShowPoint,
    burst: Pick<
      AirShowPlannerTracerBurst,
      "emitter" | "burstCount" | "spreadPx" | "streakLengthPx" | "fanHalfAngleDeg"
    >
  ): boolean;
  resolveAirShowTracerBurstGeometry(
    source: Pick<AirShowPlannerActor, "position" | "headingDegrees" | "size">,
    burst: Pick<
      AirShowPlannerTracerBurst,
      "emitter" | "burstCount" | "spreadPx" | "streakLengthPx" | "fanHalfAngleDeg"
    >,
    targetPoint: AirShowPoint
  ): {
    emitterPoint: AirShowPoint;
    sourceHeadingDegrees: number;
    streakLengthPx: number;
    visibleLengthPx: number;
    fanHalfAngleDeg: number;
    centerlineEndPoint: AirShowPoint;
    leftFanEndPoint?: AirShowPoint;
    rightFanEndPoint?: AirShowPoint;
  };
  resolveAirShowFlakBurstWave(
    corridor: AirShowPlannerCorridor,
    targetCenter: AirShowPoint,
    burst: NonNullable<ResolvedAirShowScene["flakBursts"]>[number]
  ): {
    center: AirShowPoint;
    flashCount: number;
    points: ReadonlyArray<AirShowPoint>;
    puffCount: number;
    smokePuffCount: number;
  };
  resolveAirShowAssignmentTraversedPathLengthPx(
    assignment: AirShowPlannerPhaseAssignment,
    durationMs: number
  ): number;
  resolveAirShowAssignmentActiveDurationMs(
    assignment: AirShowPlannerPhaseAssignment,
    durationMs: number
  ): number;
  applyPlannedAirShowAssignments(
    assignments: ReadonlyArray<AirShowPlannerPhaseAssignment>,
    durationMs: number
  ): void;
  buildContestedFighterIngressPlan(
    scene: ResolvedAirShowScene,
    corridor: AirShowPlannerCorridor,
    interceptorFlights: ReadonlyArray<AirShowPlannerFlight>,
    escortFlights: ReadonlyArray<AirShowPlannerFlight>,
    fighterIngressSeedDurationMs: number,
    stageRandom: (label: string) => () => number
  ): AirShowPlannerContestedFighterIngressPlan | null;
  resolveAirShowContestedBomberPhaseDurations(
    bomberFlights: ReadonlyArray<AirShowPlannerFlight>,
    corridor: AirShowPlannerCorridor,
    initialBomberApproachProfilesById: ReadonlyMap<string, AirShowPlannerBomberApproachProfile>,
    scene: ResolvedAirShowScene,
    stageRandom: (label: string) => () => number,
    fighterIngressDurationMs?: number
  ): AirShowPlannerContestedBomberPhaseDurations;
  retimeContestedFighterIngressPlan(
    fighterIngressPlan: AirShowPlannerContestedFighterIngressPlan,
    governedDurationMs: number
  ): AirShowPlannerContestedFighterIngressPlan;
  buildContestedBomberMasterPaths(
    bomberFlights: ReadonlyArray<AirShowPlannerFlight>,
    corridor: AirShowPlannerCorridor,
    initialBomberApproachProfilesById: ReadonlyMap<string, AirShowPlannerBomberApproachProfile>,
    stageRandom: (label: string) => () => number
  ): ReadonlyMap<string, ReadonlyArray<AirShowPoint>>;
  buildContestedBomberPhaseSliceAssignments(
    bomberFlights: ReadonlyArray<AirShowPlannerFlight>,
    masterPathsByBomberId: ReadonlyMap<string, ReadonlyArray<AirShowPoint>>,
    durations: AirShowPlannerContestedBomberPhaseDurations,
    phaseLabel: AirShowPlannerContestedBomberPhaseLabel
  ): AirShowPlannerPhaseAssignment[];
  extendAirShowPhaseAssignmentsForSpeed(
    assignments: ReadonlyArray<AirShowPlannerPhaseAssignment>,
    durationMs: number,
    roleSpeeds: ReadonlyMap<AirShowPlannerActor["role"], number>,
    options: Record<string, unknown>
  ): AirShowPlannerPhaseAssignment[];
  prepareAirShowPhaseAssignments(
    assignments: ReadonlyArray<AirShowPlannerPhaseAssignment>,
    durationMs: number,
    progressSamplePoints?: number[],
    turnSampleCount?: number,
    roleTargetSpeeds?: ReadonlyMap<AirShowPlannerActor["role"], number>,
    options?: Record<string, unknown>
  ): AirShowPlannerPhaseAssignment[];
  resolveAirShowEscortClashCenter(...args: any[]): AirShowPoint;
  resolveAirShowEscortClashFocusPoint(...args: any[]): AirShowPoint;
  buildAirShowBomberInterceptPassPath(...args: any[]): AirShowPoint[];
  buildAirShowBomberTargetRunPath(...args: any[]): AirShowPoint[];
  buildAirShowCurvedPath(...args: any[]): AirShowPoint[];
  buildAirShowMergePassPath(...args: any[]): AirShowPoint[];
  buildAirShowPursuitPath(...args: any[]): AirShowPoint[];
  buildAirShowScreenRunPath(...args: any[]): AirShowPoint[];
  buildAirShowFlightAssignments(...args: any[]): AirShowPlannerPhaseAssignment[];
  buildAirShowDynamicTracerVolley(...args: any[]): AirShowPlannerTracerBurst[];
  buildAirShowTracerVolley(...args: any[]): AirShowPlannerTracerBurst[];
  buildAirShowBandAssignments(...args: any[]): AirShowPlannerPhaseAssignment[];
  buildAirShowBreakTurnPath(...args: any[]): AirShowPoint[];
  shapeCompactAirShowMergeAssignments(...args: any[]): AirShowPlannerPhaseAssignment[];
  syncAirShowFlightStrengthForInspection(
    flight: AirShowPlannerFlight,
    targetStrength: number
  ): void;
  resolveAirShowBomberDefensePassAttackEntries(...args: any[]): ReadonlyArray<{
    interceptorFlight: AirShowPlannerFlight;
    bomberFlight: AirShowPlannerFlight;
  }>;
  buildAirShowBomberDefensePassTracerBursts(...args: any[]): AirShowPlannerTracerBurst[];
  buildAirShowTargetRunEscortPath(...args: any[]): AirShowPoint[];
  resolveAirShowBomberFlakBursts(
    scene: ResolvedAirShowScene,
    bomberUnitKey?: string | null
  ): ReadonlyArray<NonNullable<ResolvedAirShowScene["flakBursts"]>[number]>;
  resolveAirShowBomberPassEntries(...args: any[]): ReadonlyMap<string, ReadonlyArray<any>>;
  resolveAirShowCorridorSideSign(...args: any[]): number;
  resolveAirShowRoleSpeedMap(
    overrides?: Partial<Record<AirShowPlannerActor["role"], number>>
  ): ReadonlyMap<AirShowPlannerActor["role"], number>;
  resolveAirShowPhaseDurationFromRoleSpeeds(
    assignments: ReadonlyArray<AirShowPlannerPhaseAssignment>,
    roleTargetSpeeds: ReadonlyMap<AirShowPlannerActor["role"], number>,
    defaultDurationMs: number,
    minDurationMs: number,
    maxDurationMs: number,
    requiredRoles?: ReadonlyArray<AirShowPlannerActor["role"]>
  ): number;
  finalizeAirShowPhaseAssignments(
    assignments: ReadonlyArray<AirShowPlannerPhaseAssignment>,
    durationMs: number,
    progressSamplePoints?: number[],
    turnSampleCount?: number,
    roleTargetSpeeds?: ReadonlyMap<AirShowPlannerActor["role"], number>,
    options?: Record<string, unknown>
  ): AirShowPlannerPhaseAssignment[];
  collectAirShowFlightTailHeadings(
    assignments: ReadonlyArray<AirShowPlannerPhaseAssignment>,
    options?: Record<string, unknown>
  ): ReadonlyMap<string, number>;
  resolveAirShowVisibleBounds():
    | { minX: number; maxX: number; minY: number; maxY: number }
    | null;
  resolveAirShowCorridorCoordinates(
    corridor: AirShowPlannerCorridor,
    point: AirShowPoint
  ): { alongPx: number; lateralPx: number };
  offsetAirShowPoint(point: AirShowPoint, dx: number, dy: number): AirShowPoint;
  resolveAirShowFlightHeadingDegrees(flight: AirShowPlannerFlight): number;
  buildAirShowDisengagePath(
    current: AirShowPoint,
    egressPoint: AirShowPoint,
    options?: Record<string, unknown>
  ): AirShowPoint[];
  resolveAirShowRouteSideSign(
    current: AirShowPoint,
    egressPoint: AirShowPoint,
    egressHeadingDegrees: number,
    fallbackSign: number
  ): number;
  sanitizeAirShowEntryPath(...args: any[]): AirShowPoint[];
}

function describePlannedAirShowFlight(flight: AirShowPlannerFlight): PlannedAirShowFlight {
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

export function planResolvedAirCombatShowScene(
  host: PlanResolvedAirCombatShowHost,
  scene: ResolvedAirShowScene
): PlannedAirShowScene | null {
  const center = host.resolveHexCenterByKey(scene.hexKey);
  if (!center) {
    return null;
  }

  const hqAxis = host.resolveHqAxis(scene.playerHqKey, scene.botHqKey);
  const mapBounds = hqAxis?.mapBounds ?? host.resolveAirShowMapBounds();
  const fallbackOriginFor = (spec: ResolvedAirShowFlightSpec): AirShowPoint =>
    spec.faction === "Bot"
      ? (hqAxis?.botOrigin ?? resolveAirShowFallbackOrigin(center, "Bot", mapBounds, { offsetPx: host.offMapDistancePx, hexHeight: HEX_HEIGHT }))
      : (hqAxis?.playerOrigin ?? resolveAirShowFallbackOrigin(center, spec.faction, mapBounds, { offsetPx: host.offMapDistancePx, hexHeight: HEX_HEIGHT }));

  const defaultHeadingFor = (origin: AirShowPoint): number =>
    host.resolveAircraftHeadingDegrees(center.cx - origin.cx, center.cy - origin.cy);

  const interceptorFlights = scene.interceptors
    .map((spec) => host.buildAirShowPlannedFlight(spec, fallbackOriginFor(spec), defaultHeadingFor(fallbackOriginFor(spec))))
    .filter((flight): flight is AirShowPlannerFlight => !!flight);
  const escortFlights = scene.escorts
    .map((spec) => host.buildAirShowPlannedFlight(spec, fallbackOriginFor(spec), defaultHeadingFor(fallbackOriginFor(spec))))
    .filter((flight): flight is AirShowPlannerFlight => !!flight);
  const bomberSpecs = host.resolveSceneBomberSpecs(scene);
  const bomberSpecsById = new Map(bomberSpecs.map((spec) => [spec.id, spec] as const));
  const bomberFlights = bomberSpecs
    .map((spec) => host.buildAirShowPlannedFlight(spec, fallbackOriginFor(spec), defaultHeadingFor(fallbackOriginFor(spec))))
    .filter((flight): flight is AirShowPlannerFlight => !!flight);

  const allFlights = [...interceptorFlights, ...escortFlights, ...bomberFlights];
  if (allFlights.length === 0) {
    return null;
  }

  const flightMap = new Map(allFlights.map((flight) => [flight.spec.id, flight] as const));
  const sceneActors = allFlights.flatMap((flight) => flight.actors);
  const sceneSeed = host.seedFromHexKey(
    `${scene.hexKey}:airshow:${scene.interceptors.length}:${scene.escorts.length}:${bomberSpecs.map((spec) => spec.id).join(",") || "none"}`
  );
  const stageRandom = (label: string): (() => number) =>
    host.seededRandom(host.seedFromHexKey(`${sceneSeed}:${label}`));
  const bomberTargetCentersById = new Map(
    bomberSpecs
      .map((spec) => [spec.id, host.resolveAirShowBomberTargetCenter(spec, scene)] as const)
      .filter((entry): entry is readonly [string, AirShowPoint] => !!entry[1])
  );
  const averageBomberAnchor =
    host.averageAirShowPoints(
      bomberFlights.map((flight) => host.averageAirShowPosition(flight.actors) ?? flight.anchor)
    ) ?? null;
  const averageBomberTargetCenter =
    host.averageAirShowPoints(Array.from(bomberTargetCentersById.values())) ?? null;
  const corridor = host.resolveAirShowCorridor(
    center,
    averageBomberAnchor,
    averageBomberTargetCenter,
    hqAxis
  );
  host.normalizeAirShowSceneFlightAnchors(
    corridor,
    scene.kind,
    interceptorFlights,
    escortFlights,
    bomberFlights,
    hqAxis
  );
  const runtimeSeedFlights = allFlights.map((flight) => describePlannedAirShowFlight(flight));
  const initialBomberApproachProfilesById = host.resolveAirShowBomberApproachProfiles(
    bomberFlights,
    corridor,
    bomberTargetCentersById,
    averageBomberTargetCenter,
    stageRandom
  );
  const fighterIngressSeedDurationMs = host.clamp(Math.round(scene.fighterIngressDurationMs ?? 2520), 1250, 13250);
  const egressHeadingByFlightId = new Map<string, number>();
  const corridorPoint = (alongPx: number, lateralPx = 0): AirShowPoint =>
    host.projectAirShowCorridorPoint(corridor, alongPx, lateralPx);
  const updateFlightAnchors = (flights: ReadonlyArray<AirShowPlannerFlight>): void => {
    flights.forEach((flight) => {
      flight.anchor = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
    });
  };
  const resolvePreviousPhaseBoundaryVector = (
    flight: AirShowPlannerFlight
  ): { dx: number; dy: number } | null => {
    if ((previousPhaseAssignments?.length ?? 0) <= 0) {
      return null;
    }
    const boundaryVectors = previousPhaseAssignments
      .filter((assignment) => assignment.actor.flightId === flight.spec.id)
      .map((assignment) => {
        if (assignment.points.length < 2) {
          return null;
        }
        const boundaryPoint = assignment.points[assignment.points.length - 1];
        for (let index = assignment.points.length - 2; index >= 0; index -= 1) {
          const reference = assignment.points[index];
          if (!boundaryPoint || !reference) {
            continue;
          }
          const dx = boundaryPoint.cx - reference.cx;
          const dy = boundaryPoint.cy - reference.cy;
          if (Math.hypot(dx, dy) <= 0.5) {
            continue;
          }
          return { dx, dy };
        }
        return null;
      })
      .filter((vector): vector is { dx: number; dy: number } => !!vector);
    if (boundaryVectors.length === 0) {
      return null;
    }
    return boundaryVectors.reduce(
      (acc, vector) => {
        acc.dx += vector.dx;
        acc.dy += vector.dy;
        return acc;
      },
      { dx: 0, dy: 0 }
    );
  };
  const resolvePreviousPhaseBoundaryHeadingDegrees = (
    flight: AirShowPlannerFlight,
    fallbackHeadingDegrees: number
  ): number => {
    const averageVector = resolvePreviousPhaseBoundaryVector(flight);
    if (!averageVector || Math.hypot(averageVector.dx, averageVector.dy) <= 0.5) {
      return fallbackHeadingDegrees;
    }
    return ((Math.atan2(averageVector.dy, averageVector.dx) * 180) / Math.PI + 90 + 360) % 360;
  };
  const bridgePathToPreviousPhaseMotion = (
    flight: AirShowPlannerFlight,
    path: ReadonlyArray<AirShowPoint>,
    carryDistancePx = 30
  ): AirShowPoint[] => {
    if (path.length < 2) {
      return [...path];
    }
    const boundaryVector = resolvePreviousPhaseBoundaryVector(flight);
    if (!boundaryVector || Math.hypot(boundaryVector.dx, boundaryVector.dy) <= 0.5) {
      return [...path];
    }
    const start = path[0];
    const first = path[1];
    const second = path[2] ?? first;
    if (!start || !first || !second) {
      return [...path];
    }
    const firstVector = {
      dx: first.cx - start.cx,
      dy: first.cy - start.cy
    };
    const firstVectorLength = Math.hypot(firstVector.dx, firstVector.dy);
    if (firstVectorLength <= 0.5) {
      return [...path];
    }
    const boundaryLength = Math.hypot(boundaryVector.dx, boundaryVector.dy);
    const alignment =
      (boundaryVector.dx * firstVector.dx + boundaryVector.dy * firstVector.dy)
      / (boundaryLength * firstVectorLength);
    if (alignment >= -0.05) {
      return [...path];
    }
    const normalizedBoundary = {
      dx: boundaryVector.dx / boundaryLength,
      dy: boundaryVector.dy / boundaryLength
    };
    const carryPx = host.clamp(
      Math.min(carryDistancePx, firstVectorLength * 0.7),
      18,
      40
    );
    const bridgePoint = {
      cx: start.cx + normalizedBoundary.dx * carryPx,
      cy: start.cy + normalizedBoundary.dy * carryPx
    };
    const blendPoint = {
      cx: bridgePoint.cx + (second.cx - bridgePoint.cx) * 0.38,
      cy: bridgePoint.cy + (second.cy - bridgePoint.cy) * 0.38
    };
    return [
      start,
      bridgePoint,
      blendPoint,
      ...path.slice(1)
    ].filter((point, index, points) => {
      if (index === 0) {
        return true;
      }
      const previous = points[index - 1];
      return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
    });
  };
  const activeFlights = (flights: ReadonlyArray<AirShowPlannerFlight>): AirShowPlannerFlight[] =>
    flights.filter((flight) => flight.actors.some((actor) => actor.active));
  const phases: PlannedAirShowScene["phases"][number][] = [];
  const phaseTimingAudit: AirShowInspectionPhaseTimingAudit[] = [];
  let previousPhaseAssignments: AirShowPhaseAssignment[] = [];
  let previousPhaseDurationMs = 0;
  const recordPhase = (
    label: string,
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    tracerBursts: ReadonlyArray<AirShowPlannerTracerBurst> = [],
    flakBursts: ReadonlyArray<NonNullable<ResolvedAirShowScene["flakBursts"]>[number]> = [],
    roleTargetSpeeds: ReadonlyMap<AirShowPlannerActor["role"], number> = host.resolveAirShowRoleSpeedMap(),
    visibleActorIds?: ReadonlyArray<string>
  ): void => {
    const assignmentsByActorId = host.buildAirShowAssignmentLookup(assignments);
    const sampleFlightCenterAtTime = (
      flightId: string | null | undefined,
      timeMs: number
    ): AirShowPoint | null => {
      if (!flightId) {
        return null;
      }
      const flight = flightMap.get(flightId);
      if (!flight) {
        return null;
      }
      const sampledActorPositions = flight.actors.map((actor) => {
        const assignment = assignmentsByActorId.get(actor.id);
        return assignment
          ? host.sampleAirShowAssignmentAtTime(assignment, timeMs, durationMs).position
          : actor.position;
      });
      return host.averageAirShowPoints(sampledActorPositions);
    };
    const activeSceneActorIds = sceneActors
      .filter((actor) => actor.active)
      .map((actor) => actor.id)
      .filter((actorId) => actorId.length > 0);
    const resolvedVisibleActorIds = Array.from(
      new Set(
        [
          ...(visibleActorIds ?? assignments.map((assignment) => assignment.actor.id)).filter(
            (actorId) => actorId.length > 0
          ),
          ...activeSceneActorIds
        ]
      )
    );
    phases.push({
      label,
      durationMs,
      visibleActorIds: resolvedVisibleActorIds,
      assignments: assignments.map((assignment) => {
        const sampledPositions: AirShowInspectionSampledPosition[] = [];
        const sampleCount = Math.max(4, Math.ceil(durationMs / 250));
        for (let i = 0; i <= sampleCount; i += 1) {
          const progress = i / sampleCount;
          const timeMs = Math.round(progress * durationMs);
          const sample = host.sampleAirShowAssignmentAtTime(assignment, timeMs, durationMs);
          sampledPositions.push({
            timeMs,
            progress,
            pathProgress: sample.pathProgress,
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
          sampledPositions,
          headingBlend: assignment.headingBlend,
          multiFlightOffsetPx: assignment.multiFlightOffsetPx,
          progressOffset: assignment.progressOffset,
          distanceBudgetPx: assignment.distanceBudgetPx,
          progressTimeline: assignment.progressTimeline?.map((keyframe) => ({
            timeMs: keyframe.timeMs,
            progress: keyframe.progress
          }))
        };
      }),
      tracers: tracerBursts.flatMap<PlannedAirShowScene["phases"][number]["tracers"][number]>((burst) => {
        const sourceAssignment = assignmentsByActorId.get(burst.source.id);
        const sampledSource = sourceAssignment
          ? host.sampleAirShowAssignmentAtTime(sourceAssignment, burst.progress * durationMs, durationMs)
          : {
              position: burst.source.position,
              headingDegrees: burst.source.headingDegrees,
              size: burst.source.size,
              pathProgress: burst.progress
            };
          const targetAssignment =
            "id" in burst.target
              ? assignmentsByActorId.get((burst.target as AirShowPlannerActor).id)
              : undefined;
          const sampledTargetPoint =
            "id" in burst.target
                ? (targetAssignment
                  ? host.sampleAirShowAssignmentAtTime(targetAssignment, burst.progress * durationMs, durationMs).position
                  : (burst.target as AirShowPlannerActor).position)
              : (burst.target as AirShowPoint);
        if (
          sampledTargetPoint
          && !host.shouldRenderAirShowTracerBurst(sampledSource, sampledTargetPoint, burst)
        ) {
          return [];
        }
        const geometry = host.resolveAirShowTracerBurstGeometry(sampledSource, burst, sampledTargetPoint);
        return [{
          progress: burst.progress,
          sourceActorId: burst.source.id,
            targetActorId: "id" in burst.target ? (burst.target as AirShowPlannerActor).id : undefined,
          targetPoint: sampledTargetPoint ? { cx: sampledTargetPoint.cx, cy: sampledTargetPoint.cy } : undefined,
          emitter: burst.emitter,
          emitterPoint: { cx: geometry.emitterPoint.cx, cy: geometry.emitterPoint.cy },
          sourceHeadingDegrees: geometry.sourceHeadingDegrees,
          color: burst.color,
          width: burst.width,
          lifetimeMs: burst.lifetimeMs,
          burstCount: burst.burstCount,
          spreadPx: burst.spreadPx,
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
        const burstTimeMs = host.clamp(burst.progress, 0, 1) * durationMs;
        const bomberPathCenter = sampleFlightCenterAtTime(burst.bomberUnitKey ?? null, burstTimeMs);
        const targetHexCenter = burst.targetHexKey ? host.resolveHexCenterByKey(burst.targetHexKey) : null;
        const bomberTargetCenter = burst.bomberUnitKey ? bomberTargetCentersById.get(burst.bomberUnitKey) ?? null : null;
        const targetSource: AirShowInspectionFlakBurst["targetSource"] =
          bomberPathCenter
            ? "bomberPath"
            : targetHexCenter
            ? "targetHex"
            : bomberTargetCenter
              ? "bomberTarget"
              : averageBomberTargetCenter
                ? "averageBomberTarget"
                : "corridorStrike";
        const scopedTargetCenter =
          bomberPathCenter
          ?? targetHexCenter
          ?? bomberTargetCenter
          ?? averageBomberTargetCenter
          ?? corridor.strike;
        const wave = host.resolveAirShowFlakBurstWave(corridor, scopedTargetCenter, burst);
        const xs = wave.points.map((point) => point.cx);
        const ys = wave.points.map((point) => point.cy);
        return {
          progress: burst.progress,
          bomberUnitKey: burst.bomberUnitKey ?? null,
          targetHexKey: burst.targetHexKey ?? null,
          targetCenter: { cx: scopedTargetCenter.cx, cy: scopedTargetCenter.cy },
          targetSource,
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
      phaseTimingAudit.push(
        buildAirShowPhaseTimingAudit(
          label,
          durationMs,
          assignments.map((assignment) => ({
            role: assignment.actor.role,
            pathLengthPx: host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, durationMs),
            activeDurationMs: host.resolveAirShowAssignmentActiveDurationMs(assignment, durationMs)
          })) satisfies ReadonlyArray<AirShowPhaseTimingSample>,
          roleTargetSpeeds
        )
      );
      host.applyPlannedAirShowAssignments(assignments, durationMs);
  };
  const visibleBounds = host.resolveAirShowVisibleBounds();
  const compactEgressLaneStepPx =
    visibleBounds && Math.max(0, visibleBounds.maxX - visibleBounds.minX) <= 1500
      ? 46
      : 64;
  const resolveFighterHomePoint = (
    flight: AirShowPlannerFlight,
    index: number,
    totalFlights: number
  ): AirShowPoint => {
    const rand = stageRandom(`fighter-home:${flight.spec.id}:${index}`);
    const laneOffset = (index - (totalFlights - 1) / 2) * compactEgressLaneStepPx;
    if (hqAxis) {
      const origin = flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin;
      return host.offsetAirShowPoint(
        origin,
        corridor.normal.x * laneOffset + (rand() - 0.5) * 22,
        corridor.normal.y * laneOffset + (rand() - 0.5) * 18
      );
    }
    return host.offsetAirShowPoint(
      fallbackOriginFor(flight.spec),
      corridor.normal.x * laneOffset + (rand() - 0.5) * 22,
      corridor.normal.y * laneOffset + (rand() - 0.5) * 18
    );
  };
  const resolveFighterHomeLaneContext = (
    flight: AirShowPlannerFlight,
    fighterFlights: ReadonlyArray<AirShowPlannerFlight>
  ): { index: number; totalFlights: number } => {
    const homeFlights = fighterFlights.filter(
      (candidate) => candidate.spec.faction === flight.spec.faction
    );
    const groupedIndex = homeFlights.findIndex(
      (candidate) => candidate.spec.id === flight.spec.id
    );
    if (groupedIndex >= 0 && homeFlights.length > 0) {
      return {
        index: groupedIndex,
        totalFlights: homeFlights.length
      };
    }
    const fallbackIndex = Math.max(
      0,
      fighterFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id)
    );
    return {
      index: fallbackIndex,
      totalFlights: Math.max(1, fighterFlights.length)
    };
  };
  const normalizeVector = (
    x: number,
    y: number,
    fallbackX = 0,
    fallbackY = -1
  ): { x: number; y: number } => {
    const length = Math.hypot(x, y);
    if (length >= 0.001) {
      return { x: x / length, y: y / length };
    }
    const fallbackLength = Math.hypot(fallbackX, fallbackY);
    if (fallbackLength >= 0.001) {
      return { x: fallbackX / fallbackLength, y: fallbackY / fallbackLength };
    }
    return { x: 0, y: -1 };
  };
  const resolveHeadingVector = (
    headingDegrees: number | undefined,
    fallback: { x: number; y: number }
  ): { x: number; y: number } => {
    if (typeof headingDegrees !== "number") {
      return fallback;
    }
    const radians = ((headingDegrees - 90) * Math.PI) / 180;
    return normalizeVector(Math.cos(radians), Math.sin(radians), fallback.x, fallback.y);
  };
  const resolveRouteHeadingDot = (
    start: AirShowPoint,
    end: AirShowPoint,
    startHeadingDegrees: number | undefined
  ): number => {
    const routeForward = normalizeVector(end.cx - start.cx, end.cy - start.cy, 0, -1);
    const headingForward = resolveHeadingVector(startHeadingDegrees, routeForward);
    return headingForward.x * routeForward.x + headingForward.y * routeForward.y;
  };
  const resolveVectorAngleDegrees = (
    left: { x: number; y: number } | { dx: number; dy: number },
    right: { x: number; y: number } | { dx: number; dy: number }
  ): number => {
    const leftX = "dx" in left ? left.dx : left.x;
    const leftY = "dy" in left ? left.dy : left.y;
    const rightX = "dx" in right ? right.dx : right.x;
    const rightY = "dy" in right ? right.dy : right.y;
    const leftLength = Math.hypot(leftX, leftY);
    const rightLength = Math.hypot(rightX, rightY);
    if (leftLength <= 0.001 || rightLength <= 0.001) {
      return 0;
    }
    const dot = host.clamp(
      (leftX * rightX + leftY * rightY) / (leftLength * rightLength),
      -1,
      1
    );
    return (Math.acos(dot) * 180) / Math.PI;
  };
  const resolveWaypointTurnDegrees = (
    previous: AirShowPoint,
    current: AirShowPoint,
    next: AirShowPoint
  ): number =>
    resolveVectorAngleDegrees(
      {
        x: current.cx - previous.cx,
        y: current.cy - previous.cy
      },
      {
        x: next.cx - current.cx,
        y: next.cy - current.cy
      }
    );
  const buildForwardContinuousRoutePath = (
    start: AirShowPoint,
    end: AirShowPoint,
    options: {
      startHeadingDegrees?: number;
      lateralSign?: number;
      minRouteDot?: number;
      carryForwardPx?: number;
      earlyAlongPx?: number;
      midAlongPx?: number;
      lateAlongPx?: number;
      entryLateralPx?: number;
      midLateralPx?: number;
      lateLateralPx?: number;
    } = {}
  ): AirShowPoint[] => {
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance <= 24) {
      return [start, end];
    }
    const routeForward = normalizeVector(dx, dy, 0, -1);
    const routeNormal = { x: -routeForward.y, y: routeForward.x };
    const headingForward = resolveHeadingVector(options.startHeadingDegrees, routeForward);
    const minRouteDot = options.minRouteDot ?? 0.22;
    const dot = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
    const routeBlend =
      dot >= minRouteDot
        ? 0
        : host.clamp((minRouteDot - dot) / (1 - Math.max(-1, dot)), 0.42, 0.96);
    const breakawayForward =
      routeBlend <= 0
        ? headingForward
        : normalizeVector(
            headingForward.x * (1 - routeBlend) + routeForward.x * routeBlend,
            headingForward.y * (1 - routeBlend) + routeForward.y * routeBlend,
            routeForward.x,
            routeForward.y
          );
    const reversalFactor =
      dot >= minRouteDot
        ? 0
        : host.clamp((minRouteDot - dot) / (1 - Math.max(-1, dot)), 0, 1);
    const lateralSign = (options.lateralSign ?? 1) >= 0 ? 1 : -1;
    const carryForwardPx = host.clamp(
      Math.round(options.carryForwardPx ?? distance * (0.14 + reversalFactor * 0.08)),
      24,
      Math.max(64, Math.round(distance * 0.28))
    );
    const earlyAlongPx = host.clamp(
      Math.round(options.earlyAlongPx ?? distance * (0.24 + reversalFactor * 0.06)),
      carryForwardPx,
      Math.max(carryForwardPx + 12, Math.round(distance * 0.44))
    );
    const midAlongPx = host.clamp(
      Math.round(options.midAlongPx ?? distance * 0.58),
      earlyAlongPx + 18,
      Math.max(earlyAlongPx + 18, Math.round(distance * 0.8))
    );
    const lateAlongPx = host.clamp(
      Math.round(options.lateAlongPx ?? distance * 0.84),
      midAlongPx + 18,
      Math.max(midAlongPx + 18, Math.round(distance * 0.96))
    );
    const entryLateralPx =
      options.entryLateralPx
      ?? Math.min(Math.max(18, distance * 0.08), Math.max(42, distance * 0.18));
    const midLateralPx =
      options.midLateralPx
      ?? Math.min(entryLateralPx * (0.34 + reversalFactor * 0.08), Math.max(16, distance * 0.1));
    const lateLateralPx =
      options.lateLateralPx
      ?? Math.min(entryLateralPx * 0.12, Math.max(6, distance * 0.03));
    const carryPoint = host.offsetAirShowPoint(
      start,
      breakawayForward.x * carryForwardPx + routeNormal.x * lateralSign * entryLateralPx * 0.18,
      breakawayForward.y * carryForwardPx + routeNormal.y * lateralSign * entryLateralPx * 0.18
    );
    const earlyPoint = host.offsetAirShowPoint(
      start,
      routeForward.x * earlyAlongPx + routeNormal.x * lateralSign * entryLateralPx,
      routeForward.y * earlyAlongPx + routeNormal.y * lateralSign * entryLateralPx
    );
    const midPoint = host.offsetAirShowPoint(
      start,
      routeForward.x * midAlongPx + routeNormal.x * lateralSign * midLateralPx,
      routeForward.y * midAlongPx + routeNormal.y * lateralSign * midLateralPx
    );
    const latePoint = host.offsetAirShowPoint(
      start,
      routeForward.x * lateAlongPx + routeNormal.x * lateralSign * lateLateralPx,
      routeForward.y * lateAlongPx + routeNormal.y * lateralSign * lateLateralPx
    );
    return [start, carryPoint, earlyPoint, midPoint, latePoint, end].filter((point, index, points) => {
      if (index === 0) {
        return true;
      }
      const previous = points[index - 1];
      return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
  };
  const tightenPathAroundFightSpace = (
    path: ReadonlyArray<AirShowPoint>,
    focusPoint: AirShowPoint,
    maxDistancePx: number
  ): AirShowPoint[] =>
    path
      .map((point, index) => {
        const lastIndex = path.length - 1;
        if (index === 0 || index >= lastIndex) {
          return point;
        }
        const effectiveMaxDistancePx =
          index >= lastIndex - 1
            ? maxDistancePx * 1.45
            : index >= lastIndex - 2
              ? maxDistancePx * 1.22
              : maxDistancePx;
        const dx = point.cx - focusPoint.cx;
        const dy = point.cy - focusPoint.cy;
        const distancePx = Math.hypot(dx, dy);
        if (distancePx <= effectiveMaxDistancePx || distancePx < 0.001) {
          return point;
        }
        const scale = effectiveMaxDistancePx / distancePx;
        return {
          cx: focusPoint.cx + dx * scale,
          cy: focusPoint.cy + dy * scale
        };
      })
      .filter((point, index, points) => {
        if (index === 0) {
          return true;
        }
        const previous = points[index - 1];
        return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
      });
  const collectStableTailHeadingsByFlightId = (
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    sampleStartProgress = 0.72,
    sampleEndProgress = 0.92
  ): ReadonlyMap<string, number> => {
    const headingsByFlightId = new Map<string, Array<{ x: number; y: number; fallback: number }>>();
    assignments.forEach((assignment) => {
      const startSample = host.sampleAirShowAssignmentAtTime(
        assignment,
        durationMs * sampleStartProgress,
        durationMs
      );
      const endSample = host.sampleAirShowAssignmentAtTime(
        assignment,
        durationMs * sampleEndProgress,
        durationMs
      );
      const dx = endSample.position.cx - startSample.position.cx;
      const dy = endSample.position.cy - startSample.position.cy;
      const headingDegrees = host.resolveAircraftHeadingDegrees(dx, dy, endSample.headingDegrees);
      const forward = resolveHeadingVector(headingDegrees, { x: 0, y: -1 });
      const entries = headingsByFlightId.get(assignment.actor.flightId) ?? [];
      entries.push({ x: forward.x, y: forward.y, fallback: headingDegrees });
      headingsByFlightId.set(assignment.actor.flightId, entries);
    });
    return new Map(
      Array.from(headingsByFlightId.entries()).map(([flightId, headings]) => {
        const vector = headings.reduce(
          (acc, heading) => {
            acc.x += heading.x;
            acc.y += heading.y;
            return acc;
          },
          { x: 0, y: 0 }
        );
        return [
          flightId,
          host.resolveAircraftHeadingDegrees(vector.x, vector.y, headings[0]?.fallback ?? 0)
        ] as const;
      })
    );
  };
  const buildFighterPeelAssignments = (
    fighterFlights: ReadonlyArray<AirShowPlannerFlight>,
    durationMs: number,
    tailHeadingByFlightId: ReadonlyMap<string, number>
  ): AirShowPhaseAssignment[] =>
    fighterFlights.flatMap((flight, index) => {
      const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const peelRand = stageRandom(`fighter-peel:${flight.spec.id}:${index}`);
      const fighterHomeLaneContext = resolveFighterHomeLaneContext(flight, fighterFlights);
      const egressHeadingDegrees =
        tailHeadingByFlightId.get(flight.spec.id) ?? host.resolveAirShowFlightHeadingDegrees(flight);
      const fullEgressPoint = resolveFighterHomePoint(
        flight,
        fighterHomeLaneContext.index,
        fighterHomeLaneContext.totalFlights
      );
      const homeDx = fullEgressPoint.cx - current.cx;
      const homeDy = fullEgressPoint.cy - current.cy;
      const homeDistancePx = Math.max(1, Math.hypot(homeDx, homeDy));
      const homeForward = { x: homeDx / homeDistancePx, y: homeDy / homeDistancePx };
      const homeNormal = { x: -homeForward.y, y: homeForward.x };
      const headingForward = resolveHeadingVector(egressHeadingDegrees, homeForward);
      const headingRouteDot = headingForward.x * homeForward.x + headingForward.y * homeForward.y;
      const peelSideSign = host.resolveAirShowRouteSideSign(
        current,
        fullEgressPoint,
        egressHeadingDegrees,
        flight.spec.role === "escort" ? 1 : -1
      );
      const peelCoverageRatio = flight.spec.role === "escort" ? 0.9 : 0.78;
      const peelMinForwardPx = flight.spec.role === "escort" ? 240 : 180;
      const peelMaxForwardPx = flight.spec.role === "escort" ? 620 : 460;
      const peelForwardPx = host.clamp(
        Math.round(
          durationMs
          * host.airShowFighterSpeedPxPerMs
          * (flight.spec.role === "escort" ? 0.98 : 0.9)
        ),
        peelMinForwardPx,
        Math.max(peelMinForwardPx, Math.min(peelMaxForwardPx, homeDistancePx * peelCoverageRatio))
      );
      const laneOffset = (index - (fighterFlights.length - 1) / 2) * compactEgressLaneStepPx * 0.34;
      const peelLateralPx =
        laneOffset
        + peelSideSign * (flight.spec.role === "escort" ? 52 : 42)
        + (peelRand() - 0.5) * 10;
      const peelTarget = host.offsetAirShowPoint(
        current,
        homeForward.x * peelForwardPx + homeNormal.x * peelLateralPx,
        homeForward.y * peelForwardPx + homeNormal.y * peelLateralPx
      );
      const peelCarryPx = Math.min(Math.max(38, peelForwardPx * 0.18), Math.max(72, peelForwardPx * 0.3));
      const peelPathSource =
        headingRouteDot < 0.1
          ? [
              current,
              host.offsetAirShowPoint(
                current,
                headingForward.x * (peelCarryPx * 0.36) + homeNormal.x * peelSideSign * 22,
                headingForward.y * (peelCarryPx * 0.36) + homeNormal.y * peelSideSign * 22
              ),
              host.offsetAirShowPoint(
                current,
                headingForward.x * peelCarryPx + homeNormal.x * peelSideSign * (Math.abs(peelLateralPx) * 0.78 + 22),
                headingForward.y * peelCarryPx + homeNormal.y * peelSideSign * (Math.abs(peelLateralPx) * 0.78 + 22)
              ),
              host.offsetAirShowPoint(
                current,
                homeForward.x * Math.max(58, peelForwardPx * 0.46) + homeNormal.x * peelLateralPx,
                homeForward.y * Math.max(58, peelForwardPx * 0.46) + homeNormal.y * peelLateralPx
              ),
              host.offsetAirShowPoint(
                current,
                homeForward.x * Math.max(112, peelForwardPx * 0.82) + homeNormal.x * peelLateralPx * 0.42,
                homeForward.y * Math.max(112, peelForwardPx * 0.82) + homeNormal.y * peelLateralPx * 0.42
              ),
              peelTarget
            ]
          : buildForwardContinuousRoutePath(current, peelTarget, {
              startHeadingDegrees: egressHeadingDegrees,
              lateralSign: peelSideSign,
              minRouteDot: -0.25,
              carryForwardPx: peelCarryPx,
              earlyAlongPx: Math.max(52, peelForwardPx * 0.38),
              midAlongPx: Math.max(90, peelForwardPx * 0.7),
              lateAlongPx: Math.max(126, peelForwardPx * 0.9),
              entryLateralPx: Math.abs(peelLateralPx) + 34,
              midLateralPx: Math.abs(peelLateralPx) * 0.56 + 18,
              lateLateralPx: Math.abs(peelLateralPx) * 0.18 + 8
            });
      const peelPath = host.sanitizeAirShowEntryPath(
        peelPathSource,
        {
          maxTurnDeg: 54,
          strongTurnDeg: 94,
          maxFirstSegmentPx: 92,
          maxSharpTurnDeg: 118,
          maxWaypointsToRemove: 2
        }
      );
      return host.buildAirShowFlightAssignments(
        flight,
        peelPath,
        0.24,
        index,
        fighterFlights.length
      );
    });
  const buildFighterEgressAssignments = (
    fighterFlights: ReadonlyArray<AirShowPlannerFlight>
  ): AirShowPhaseAssignment[] =>
    fighterFlights.flatMap((flight, index) => {
      const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const rand = stageRandom(`fighter-egress:${flight.spec.id}:${index}`);
      const fighterHomeLaneContext = resolveFighterHomeLaneContext(flight, fighterFlights);
      const egressHeadingDegrees = host.resolveAirShowFlightHeadingDegrees(flight);
      const egressPoint = resolveFighterHomePoint(
        flight,
        fighterHomeLaneContext.index,
        fighterHomeLaneContext.totalFlights
      );
      const egressLateralSign = host.resolveAirShowRouteSideSign(
        current,
        egressPoint,
        egressHeadingDegrees,
        flight.spec.role === "escort" ? 1 : -1
      );
      const egressPath = host.sanitizeAirShowEntryPath(
        buildForwardContinuousRoutePath(current, egressPoint, {
          startHeadingDegrees: egressHeadingDegrees,
          lateralSign: egressLateralSign,
          minRouteDot: 0.2,
          carryForwardPx: 56 + rand() * 18,
          entryLateralPx: 28 + rand() * 10,
          midLateralPx: 12 + rand() * 6,
          lateLateralPx: 4 + rand() * 3
        }),
        {
          maxTurnDeg: 52,
          strongTurnDeg: 90,
          maxFirstSegmentPx: 88,
          maxSharpTurnDeg: 116,
          maxWaypointsToRemove: 2
        }
      );
      return host.buildAirShowFlightAssignments(
        flight,
        egressPath,
        0.26,
        index,
        fighterFlights.length
      );
    });
  const buildBomberEgressAssignments = (
    bomberFlightsForPhase: ReadonlyArray<AirShowPlannerFlight>
  ): AirShowPhaseAssignment[] =>
    bomberFlightsForPhase.flatMap((flight, index) => {
      const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const rand = stageRandom(`bomber-egress:${flight.spec.id}:${index}`);
      const egressHeadingDegrees =
        egressHeadingByFlightId.get(flight.spec.id) ?? host.resolveAirShowFlightHeadingDegrees(flight);
      const phaseBoundaryHeadingDegrees = host.resolveAirShowFlightHeadingDegrees(flight);
      const egressPoint = (() => {
        const originCenter =
          hqAxis
            ? (flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin)
            : host.resolveHexCenterByKey(flight.spec.originHexKey);
        if (originCenter) {
          return host.offsetAirShowPoint(originCenter, (rand() - 0.5) * 22, (rand() - 0.5) * 18);
        }
        return host.offsetAirShowPoint(
          fallbackOriginFor(flight.spec),
          corridor.normal.x * (rand() - 0.5) * 18,
          corridor.normal.y * (rand() - 0.5) * 18
        );
      })();
      const egressLateralSign = host.resolveAirShowRouteSideSign(
        current,
        egressPoint,
        egressHeadingDegrees,
        -1
      );
      const homeDx = egressPoint.cx - current.cx;
      const homeDy = egressPoint.cy - current.cy;
      const homeDistancePx = Math.max(1, Math.hypot(homeDx, homeDy));
      const homeForward = normalizeVector(homeDx, homeDy, 0, -1);
      const headingForward = resolveHeadingVector(phaseBoundaryHeadingDegrees, homeForward);
      const headingRouteDot = headingForward.x * homeForward.x + headingForward.y * homeForward.y;
      const rawEgressPath =
        headingRouteDot > -0.18 && homeDistancePx <= 380
          ? buildForwardContinuousRoutePath(current, egressPoint, {
              startHeadingDegrees: egressHeadingDegrees,
              lateralSign: egressLateralSign,
              minRouteDot: -0.28,
              carryForwardPx: 54 + rand() * 18,
              earlyAlongPx: Math.max(62, homeDistancePx * 0.28),
              midAlongPx: Math.max(112, homeDistancePx * 0.58),
              lateAlongPx: Math.max(162, homeDistancePx * 0.84),
              entryLateralPx: 18 + rand() * 6,
              midLateralPx: 8 + rand() * 4,
              lateLateralPx: 3 + rand() * 2
            })
          : host.buildAirShowDisengagePath(current, egressPoint, {
              startHeadingDegrees: egressHeadingDegrees,
              lateralSign: egressLateralSign,
              corridorWidthPx: 16 + rand() * 4,
              driftPx: 10 + rand() * 4,
              preferForwardContinuous: true
            });
      const egressPath = host.sanitizeAirShowEntryPath(
        rawEgressPath,
        {
          maxTurnDeg: 44,
          strongTurnDeg: 78,
          maxFirstSegmentPx: 74,
          maxSharpTurnDeg: 104,
          maxWaypointsToRemove: 2
        }
      );
      return host.buildAirShowFlightAssignments(
        flight,
        egressPath,
        0.18,
        index,
        bomberFlightsForPhase.length
      );
    });

  const hasFighterIngressParticipants = interceptorFlights.length > 0 || escortFlights.length > 0;
    const fighterIngressPlan = hasFighterIngressParticipants
      ? host.buildContestedFighterIngressPlan(
          scene,
          corridor,
          interceptorFlights,
          escortFlights,
          fighterIngressSeedDurationMs,
          stageRandom
        )
      : null;
    const contestedBomberPhaseDurations = host.resolveAirShowContestedBomberPhaseDurations(
      bomberFlights,
      corridor,
      initialBomberApproachProfilesById,
      scene,
      stageRandom,
      fighterIngressPlan?.durationMs
    );
    const governedFighterIngressPlan = fighterIngressPlan
      ? host.retimeContestedFighterIngressPlan(
          fighterIngressPlan,
          contestedBomberPhaseDurations.fighterIngressDurationMs
        )
      : null;
    const plannedEscortMergeDurationMs = contestedBomberPhaseDurations.escortMergeDurationMs;
    const plannedEscortScrambleDurationMs = contestedBomberPhaseDurations.escortScrambleDurationMs;
    const plannedBomberIngressDurationMs = contestedBomberPhaseDurations.bomberIngressDurationMs;
    const plannedBomberDefenseDurationMs = contestedBomberPhaseDurations.bomberDefenseDurationMs;
    const contestedBomberMasterPaths = host.buildContestedBomberMasterPaths(
      bomberFlights,
      corridor,
      initialBomberApproachProfilesById,
      stageRandom
    );

    if (governedFighterIngressPlan) {
      const extendedFighterIngressAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
        [
          ...governedFighterIngressPlan.assignments,
          ...host.buildContestedBomberPhaseSliceAssignments(
            bomberFlights,
            contestedBomberMasterPaths,
            contestedBomberPhaseDurations,
            "fighter-ingress"
          )
        ],
        governedFighterIngressPlan.durationMs,
        governedFighterIngressPlan.roleSpeeds,
        {
          clampCenter: corridor.center,
          orbitSignByRole: {
            interceptor: -1,
            escort: 1
          },
          extendAt: "end"
        }
      );
      const preparedFighterIngressAssignments = host.prepareAirShowPhaseAssignments(
        extendedFighterIngressAssignments,
        governedFighterIngressPlan.durationMs,
        governedFighterIngressPlan.progressSamplePoints,
        42,
        governedFighterIngressPlan.roleSpeeds,
        {
          harmonizeIngressVisibility: true,
          softenExitRoles: ["interceptor", "escort"],
          softenExitTurnLimitDeg: 98,
          softenExitWaypointCount: 6
        }
      );
      recordPhase(
        "fighter-ingress",
        preparedFighterIngressAssignments,
        governedFighterIngressPlan.durationMs,
        [],
        [],
        governedFighterIngressPlan.roleSpeeds
      );
      previousPhaseAssignments = preparedFighterIngressAssignments;
      previousPhaseDurationMs = governedFighterIngressPlan.durationMs;
      updateFlightAnchors([...interceptorFlights, ...escortFlights, ...bomberFlights]);
    }

    const escortExchanges = scene.escortExchanges ?? [];
    if (escortExchanges.length > 0 || (interceptorFlights.length > 0 && escortFlights.length > 0)) {
      type EscortPairData = {
        exchange: (typeof escortExchanges)[number] | null;
        interceptorFlight: AirShowRuntimeFlightInternal;
        escortFlight: AirShowRuntimeFlightInternal;
        source: "event" | "synthetic";
      };

      const rawEscortPairs = escortExchanges
        .map((exchange): EscortPairData | null => {
          const directInterceptor = flightMap.get(exchange.attackerUnitKey);
          const directEscort = flightMap.get(exchange.defenderUnitKey);
          if (
            directInterceptor?.spec.role === "interceptor"
            && directEscort?.spec.role === "escort"
          ) {
            return {
              exchange,
              interceptorFlight: directInterceptor,
              escortFlight: directEscort,
              source: "event"
            };
          }
          const reverseInterceptor = flightMap.get(exchange.defenderUnitKey);
          const reverseEscort = flightMap.get(exchange.attackerUnitKey);
          if (
            reverseInterceptor?.spec.role === "interceptor"
            && reverseEscort?.spec.role === "escort"
          ) {
            return {
              exchange,
              interceptorFlight: reverseInterceptor,
              escortFlight: reverseEscort,
              source: "event"
            };
          }
          return null;
        })
        .filter((entry): entry is EscortPairData => !!entry);
      const uniqueEscortPairs = Array.from(
        new Map(
          rawEscortPairs.map((entry) => [
            `${entry.escortFlight.spec.id}:${entry.interceptorFlight.spec.id}`,
            entry
          ] as const)
        ).values()
      ) as EscortPairData[];
      const resolveFlightCurrentPoint = (flight: AirShowRuntimeFlightInternal): AirShowPoint =>
        host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const resolveFlightDistancePx = (
        left: AirShowRuntimeFlightInternal,
        right: AirShowRuntimeFlightInternal
      ): number => {
        const leftPoint = resolveFlightCurrentPoint(left);
        const rightPoint = resolveFlightCurrentPoint(right);
        return Math.hypot(leftPoint.cx - rightPoint.cx, leftPoint.cy - rightPoint.cy);
      };
      const seededEscortPairs = [...uniqueEscortPairs]
        .sort(
          (left, right) =>
            resolveFlightDistancePx(left.interceptorFlight, left.escortFlight)
            - resolveFlightDistancePx(right.interceptorFlight, right.escortFlight)
        )
        .reduce((selected, pair) => {
          const interceptorAlreadySeeded = selected.some(
            (entry) => entry.interceptorFlight.spec.id === pair.interceptorFlight.spec.id
          );
          const escortAlreadySeeded = selected.some(
            (entry) => entry.escortFlight.spec.id === pair.escortFlight.spec.id
          );
          if (interceptorAlreadySeeded || escortAlreadySeeded) {
            return selected;
          }
          selected.push(pair);
          return selected;
        }, [] as EscortPairData[]);

      if (seededEscortPairs.length > 0 || (interceptorFlights.length > 0 && escortFlights.length > 0)) {
        const escortBeatCount = 2;
        for (let beat = 0; beat < escortBeatCount; beat += 1) {
          const defaultEscortBeatDurationMs = beat === 0 ? plannedEscortMergeDurationMs : plannedEscortScrambleDurationMs;
          const phaseAssignments: AirShowPhaseAssignment[] = [];
          const tracerBursts: AirShowTracerBurst[] = [];
          const activeInterceptorFlights = activeFlights(interceptorFlights);
          const activeEscortFlights = activeFlights(escortFlights);
          const clashCenter = host.resolveAirShowEscortClashCenter(
            corridor,
            activeInterceptorFlights,
            activeEscortFlights,
            beat
          );
          const activeEscortPairs = seededEscortPairs.filter((pair) =>
            pair.interceptorFlight.actors.some((actor) => actor.active)
            && pair.escortFlight.actors.some((actor) => actor.active)
          );
          const engagedInterceptorIds = new Set(activeEscortPairs.map((pair) => pair.interceptorFlight.spec.id));
          const engagedEscortIds = new Set(activeEscortPairs.map((pair) => pair.escortFlight.spec.id));
          const supplementalInterceptors = activeInterceptorFlights.filter(
            (flight) => !engagedInterceptorIds.has(flight.spec.id)
          );
          const supplementalEscorts = activeEscortFlights.filter(
            (flight) => !engagedEscortIds.has(flight.spec.id)
          );
          while (supplementalInterceptors.length > 0 && supplementalEscorts.length > 0) {
            let bestInterceptorIndex = 0;
            let bestEscortIndex = 0;
            let bestDistancePx = Number.POSITIVE_INFINITY;
            supplementalInterceptors.forEach((interceptorFlight, interceptorIndex) => {
              supplementalEscorts.forEach((escortFlight, escortIndex) => {
                const separationPx = resolveFlightDistancePx(interceptorFlight, escortFlight);
                if (separationPx < bestDistancePx) {
                  bestDistancePx = separationPx;
                  bestInterceptorIndex = interceptorIndex;
                  bestEscortIndex = escortIndex;
                }
              });
            });
            const interceptorFlight = supplementalInterceptors.splice(bestInterceptorIndex, 1)[0];
            const escortFlight = supplementalEscorts.splice(bestEscortIndex, 1)[0];
            if (!interceptorFlight || !escortFlight) {
              break;
            }
            activeEscortPairs.push({
              exchange: null,
              interceptorFlight,
              escortFlight,
              source: "synthetic"
            });
            engagedInterceptorIds.add(interceptorFlight.spec.id);
            engagedEscortIds.add(escortFlight.spec.id);
          }
          type EscortEngagementGroup = {
            pair: EscortPairData;
            interceptorFlights: AirShowRuntimeFlightInternal[];
            escortFlights: AirShowRuntimeFlightInternal[];
          };
          const escortGroups: EscortEngagementGroup[] = activeEscortPairs.map((pair) => ({
            pair,
            interceptorFlights: [pair.interceptorFlight],
            escortFlights: [pair.escortFlight]
          }));
          const assignFlightToNearestEngagementGroup = (
            flight: AirShowRuntimeFlightInternal,
            role: "interceptor" | "escort"
          ): boolean => {
            if (escortGroups.length <= 0) {
              return false;
            }
            const current = resolveFlightCurrentPoint(flight);
            let bestGroup = escortGroups[0]!;
            let bestDistancePx = Number.POSITIVE_INFINITY;
            escortGroups.forEach((group) => {
              const counterpartFlights =
                role === "interceptor"
                  ? group.escortFlights
                  : group.interceptorFlights;
              const counterpartCenter =
                host.averageAirShowPoints(counterpartFlights.map(resolveFlightCurrentPoint))
                ?? clashCenter;
              const distancePx = Math.hypot(
                counterpartCenter.cx - current.cx,
                counterpartCenter.cy - current.cy
              );
              if (distancePx < bestDistancePx) {
                bestDistancePx = distancePx;
                bestGroup = group;
              }
            });
            if (role === "interceptor") {
              bestGroup.interceptorFlights.push(flight);
            } else {
              bestGroup.escortFlights.push(flight);
            }
            return true;
          };
          activeInterceptorFlights
            .filter((flight) => !engagedInterceptorIds.has(flight.spec.id))
            .forEach((flight) => {
              if (assignFlightToNearestEngagementGroup(flight, "interceptor")) {
                engagedInterceptorIds.add(flight.spec.id);
              }
            });
          activeEscortFlights
            .filter((flight) => !engagedEscortIds.has(flight.spec.id))
            .forEach((flight) => {
              if (assignFlightToNearestEngagementGroup(flight, "escort")) {
                engagedEscortIds.add(flight.spec.id);
              }
            });
          const resolveEscortEngagementClashPoint = (
            group: EscortEngagementGroup,
            pairIndex: number
          ): AirShowPoint => {
            const isSyntheticPair = group.pair.source === "synthetic";
            const engagementMidpoint =
              host.averageAirShowPoints([
                ...group.interceptorFlights.map(resolveFlightCurrentPoint),
                ...group.escortFlights.map(resolveFlightCurrentPoint)
              ])
              ?? clashCenter;
            const baseProjection = host.resolveAirShowCorridorCoordinates(corridor, clashCenter);
            const midpointProjection = host.resolveAirShowCorridorCoordinates(corridor, engagementMidpoint);
            const pairLane =
              escortGroups.length <= 1
                ? 0
                : pairIndex - (escortGroups.length - 1) / 2;
            const projectedPoint = host.projectAirShowCorridorPoint(
              corridor,
              host.clamp(
                baseProjection.alongPx * (isSyntheticPair ? (beat === 0 ? 0.34 : 0.26) : (beat === 0 ? 0.62 : 0.5))
                + midpointProjection.alongPx * (isSyntheticPair ? (beat === 0 ? 0.66 : 0.74) : (beat === 0 ? 0.38 : 0.5)),
                beat === 0 ? -56 : -78,
                beat === 0 ? 56 : 78
              ),
              host.clamp(
                baseProjection.lateralPx * (isSyntheticPair ? 0.14 : 0.34)
                + midpointProjection.lateralPx * (isSyntheticPair ? 0.56 : 0.26)
                + pairLane * (isSyntheticPair ? (beat === 0 ? 14 : 16) : (beat === 0 ? 20 : 22)),
                -60,
                60
              )
            );
            return projectedPoint;
          };
          const groupStates = escortGroups.map((group, pairIndex) => {
            const groupCenter = resolveEscortEngagementClashPoint(group, pairIndex);
            const groupProjection = host.resolveAirShowCorridorCoordinates(corridor, groupCenter);
            return {
              group,
              groupCenter,
              groupProjection
            };
          });

          groupStates.forEach((state) => {
            const crowdedGroup =
              state.group.interceptorFlights.length > 1
              || state.group.escortFlights.length > 1;
            const isSyntheticGroup = state.group.pair.source === "synthetic";
            const hasActiveBomberFlights = bomberFlights.some((flight) =>
              flight.actors.some((actor) => actor.active)
            );
            const scrambleTighteningRadiusPx =
              hasActiveBomberFlights
                ? (crowdedGroup ? 50 : 52)
                : (crowdedGroup ? 66 : 72);
            state.group.interceptorFlights.forEach((flight, interceptorIndex) => {
              const targetEscortFlight =
                state.group.escortFlights[
                  interceptorIndex % Math.max(1, state.group.escortFlights.length)
                ]
                ?? state.group.pair.escortFlight;
              const targetEscortPoint = resolveFlightCurrentPoint(targetEscortFlight);
              const current = resolveFlightCurrentPoint(flight);
              const localLane =
                state.group.interceptorFlights.length <= 1
                  ? 0
                  : interceptorIndex - (state.group.interceptorFlights.length - 1) / 2;
              const localizedFightCenter = crowdedGroup
                ? {
                    cx: state.groupCenter.cx * 0.34 + targetEscortPoint.cx * 0.66,
                    cy: state.groupCenter.cy * 0.34 + targetEscortPoint.cy * 0.66
                  }
                : state.groupCenter;
              const localizedProjection = host.resolveAirShowCorridorCoordinates(
                corridor,
                localizedFightCenter
              );
              const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
                flight,
                host.resolveAirShowFlightHeadingDegrees(flight)
              );
              const sideSign = host.resolveAirShowRouteSideSign(
                current,
                localizedFightCenter,
                startHeadingDegrees,
                localLane <= 0 ? -1 : 1
              );
              const syntheticClosurePoint: AirShowPoint = {
                cx: current.cx + (localizedFightCenter.cx - current.cx) * 0.82,
                cy: current.cy + (localizedFightCenter.cy - current.cy) * 0.82
              };
              const sharedScrambleFocusPoint = host.projectAirShowCorridorPoint(
                corridor,
                state.groupProjection.alongPx + localLane * 0.5,
                state.groupProjection.lateralPx + localLane * (crowdedGroup ? 4 : 7)
              );
              const scrambleFocusPoint = host.projectAirShowCorridorPoint(
                corridor,
                localizedProjection.alongPx + 1 + localLane * 2,
                localizedProjection.lateralPx + localLane * (crowdedGroup ? 6 : 12)
              );
              const scrambleRouteDot = resolveRouteHeadingDot(
                current,
                scrambleFocusPoint,
                startHeadingDegrees
              );
              const scrambleJoinPath =
                hasActiveBomberFlights
                  ? (
                      scrambleRouteDot <= 0.16
                        ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            minRouteDot: -0.08,
                            carryForwardPx: crowdedGroup ? 28 : 34,
                            earlyAlongPx: crowdedGroup ? 46 : 58,
                            midAlongPx: crowdedGroup ? 74 : 92,
                            lateAlongPx: crowdedGroup ? 98 : 118,
                            entryLateralPx: 12 + Math.abs(localLane) * 3,
                            midLateralPx: 5 + Math.abs(localLane) * 1.5,
                            lateLateralPx: 2 + Math.abs(localLane)
                          })
                        : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            entryLateralPx: 3 + Math.abs(localLane),
                            mergeLateralPx: Math.max(1, Math.abs(localLane) * 2),
                            attackOffsetPx: localLane * 3,
                            closeInPx: 2,
                            overshootPx: crowdedGroup ? 2 : 3,
                            breakLateralPx: 3 + Math.abs(localLane) * 1.5,
                            breakForwardPx: crowdedGroup ? 2 : 3,
                            driftPx: 1
                          })
                    )
                  : (
                      scrambleRouteDot <= 0.16
                        ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            minRouteDot: -0.12,
                            carryForwardPx: crowdedGroup ? 48 : 58,
                            earlyAlongPx: crowdedGroup ? 72 : 84,
                            midAlongPx: crowdedGroup ? 108 : 126,
                            lateAlongPx: crowdedGroup ? 142 : 164,
                            entryLateralPx: 18 + Math.abs(localLane) * (crowdedGroup ? 4 : 5),
                            midLateralPx: 8 + Math.abs(localLane) * 2,
                            lateLateralPx: 3 + Math.abs(localLane) * 1.5
                          })
                        : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            entryLateralPx: 4 + Math.abs(localLane) * 2,
                            mergeLateralPx: Math.max(1, Math.abs(localLane) * 3),
                            attackOffsetPx: localLane * 6,
                            closeInPx: crowdedGroup ? 3 : 4,
                            overshootPx: crowdedGroup ? 4 : 6,
                            breakLateralPx: 6 + Math.abs(localLane) * 3,
                            breakForwardPx: crowdedGroup ? 4 : 5,
                            driftPx: 1
                          })
                    );
              const interceptorPath = beat === 0
                ? host.sanitizeAirShowEntryPath(
                    bridgePathToPreviousPhaseMotion(
                      flight,
                      isSyntheticGroup && interceptorIndex === 0
                        ? host.buildAirShowCurvedPath(
                            current,
                            syntheticClosurePoint,
                            -24 * sideSign,
                            10,
                            startHeadingDegrees
                          )
                        : host.buildAirShowMergePassPath(current, localizedFightCenter, corridor, {
                            sideSign,
                            laneIndex: localLane,
                            startHeadingDegrees,
                            entrySeparationPx: crowdedGroup ? 44 : 54,
                            crossSeparationPx: crowdedGroup ? 4 : 5,
                            overshootPx: crowdedGroup ? 18 : 24
                          }),
                      22
                    ),
                    {
                      maxTurnDeg: 42,
                      strongTurnDeg: 86,
                      maxFirstSegmentPx: 64,
                      maxSharpTurnDeg: 116,
                      maxWaypointsToRemove: 2
                    }
                  )
                : host.sanitizeAirShowEntryPath(
                    bridgePathToPreviousPhaseMotion(
                      flight,
                      hasActiveBomberFlights
                        ? tightenPathAroundFightSpace(
                            scrambleJoinPath,
                            sharedScrambleFocusPoint,
                            scrambleTighteningRadiusPx
                          )
                        : scrambleJoinPath,
                      20
                    ),
                    {
                      maxTurnDeg: 40,
                      strongTurnDeg: 82,
                      maxFirstSegmentPx: 60,
                      maxSharpTurnDeg: 112,
                      maxWaypointsToRemove: 2
                    }
                  );
              phaseAssignments.push(
                ...host.buildAirShowFlightAssignments(flight, interceptorPath, 0.26, 0, 1)
              );
            });
            state.group.escortFlights.forEach((flight, escortIndex) => {
              const targetInterceptorFlight =
                state.group.interceptorFlights[
                  escortIndex % Math.max(1, state.group.interceptorFlights.length)
                ]
                ?? state.group.pair.interceptorFlight;
              const targetInterceptorPoint = resolveFlightCurrentPoint(targetInterceptorFlight);
              const current = resolveFlightCurrentPoint(flight);
              const localLane =
                state.group.escortFlights.length <= 1
                  ? 0
                  : escortIndex - (state.group.escortFlights.length - 1) / 2;
              const localizedFightCenter = crowdedGroup
                ? {
                    cx: state.groupCenter.cx * 0.34 + targetInterceptorPoint.cx * 0.66,
                    cy: state.groupCenter.cy * 0.34 + targetInterceptorPoint.cy * 0.66
                  }
                : state.groupCenter;
              const localizedProjection = host.resolveAirShowCorridorCoordinates(
                corridor,
                localizedFightCenter
              );
              const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
                flight,
                host.resolveAirShowFlightHeadingDegrees(flight)
              );
              const sideSign = host.resolveAirShowRouteSideSign(
                current,
                localizedFightCenter,
                startHeadingDegrees,
                localLane >= 0 ? 1 : -1
              );
              const syntheticClosurePoint: AirShowPoint = {
                cx: current.cx + (localizedFightCenter.cx - current.cx) * 0.88,
                cy: current.cy + (localizedFightCenter.cy - current.cy) * 0.88
              };
              const sharedScrambleFocusPoint = host.projectAirShowCorridorPoint(
                corridor,
                state.groupProjection.alongPx + localLane * 0.5,
                state.groupProjection.lateralPx + localLane * (crowdedGroup ? 4 : 7)
              );
              const scrambleFocusPoint = host.projectAirShowCorridorPoint(
                corridor,
                localizedProjection.alongPx - 1 + localLane * 1.5,
                localizedProjection.lateralPx + localLane * (crowdedGroup ? 5 : 10)
              );
              const scrambleRouteDot = resolveRouteHeadingDot(
                current,
                scrambleFocusPoint,
                startHeadingDegrees
              );
              const escortScramblePath =
                hasActiveBomberFlights
                  ? (
                      crowdedGroup || isSyntheticGroup || scrambleRouteDot <= 0.22
                        ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            minRouteDot: -0.08,
                            carryForwardPx: crowdedGroup ? 24 : 30,
                            earlyAlongPx: crowdedGroup ? 40 : 52,
                            midAlongPx: crowdedGroup ? 66 : 84,
                            lateAlongPx: crowdedGroup ? 88 : 108,
                            entryLateralPx: 10 + Math.abs(localLane) * 2.5,
                            midLateralPx: 4 + Math.abs(localLane) * 1.25,
                            lateLateralPx: 2 + Math.abs(localLane) * 0.8
                          })
                        : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            entryLateralPx: 3 + Math.abs(localLane),
                            mergeLateralPx: Math.max(1, Math.abs(localLane) * 1.5),
                            attackOffsetPx: localLane * 2,
                            closeInPx: 2,
                            overshootPx: 2,
                            breakLateralPx: 3 + Math.abs(localLane) * 1.5,
                            breakForwardPx: 2,
                            driftPx: 1
                          })
                    )
                  : (
                      crowdedGroup || isSyntheticGroup || scrambleRouteDot <= -0.18
                        ? host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            entryLateralPx: 4 + Math.abs(localLane) * 2,
                            mergeLateralPx: Math.max(1, Math.abs(localLane) * 2),
                            attackOffsetPx: localLane * 5,
                            closeInPx: 3,
                            overshootPx: 4,
                            breakLateralPx: 6 + Math.abs(localLane) * 2,
                            breakForwardPx: 4,
                            driftPx: 1
                          })
                        : host.buildAirShowBreakTurnPath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            entryLateralPx: 5,
                            guardForwardPx: 2,
                            guardLateralPx: 10,
                            exitForwardPx: 8,
                            exitLateralPx: 12,
                            trailForwardPx: 4
                          })
                    );
              const escortPath = beat === 0
                ? host.sanitizeAirShowEntryPath(
                    bridgePathToPreviousPhaseMotion(
                      flight,
                      isSyntheticGroup && escortIndex === 0
                        ? host.buildAirShowCurvedPath(
                            current,
                            syntheticClosurePoint,
                            22 * sideSign,
                            9,
                            startHeadingDegrees
                          )
                        : host.buildAirShowMergePassPath(current, localizedFightCenter, corridor, {
                            sideSign,
                            laneIndex: localLane,
                            startHeadingDegrees,
                            entrySeparationPx: crowdedGroup ? 40 : 50,
                            crossSeparationPx: crowdedGroup ? 4 : 5,
                            overshootPx: crowdedGroup ? 18 : 22
                          }),
                      20
                    ),
                    {
                      maxTurnDeg: 40,
                      strongTurnDeg: 84,
                      maxFirstSegmentPx: 62,
                      maxSharpTurnDeg: 114,
                      maxWaypointsToRemove: 2
                    }
                  )
                : host.sanitizeAirShowEntryPath(
                    bridgePathToPreviousPhaseMotion(
                      flight,
                      hasActiveBomberFlights
                        ? tightenPathAroundFightSpace(
                            escortScramblePath,
                            sharedScrambleFocusPoint,
                            scrambleTighteningRadiusPx
                          )
                        : escortScramblePath,
                      18
                    ),
                    {
                      maxTurnDeg: 38,
                      strongTurnDeg: 80,
                      maxFirstSegmentPx: 58,
                      maxSharpTurnDeg: 110,
                      maxWaypointsToRemove: 2
                    }
                  );
              phaseAssignments.push(
                ...host.buildAirShowFlightAssignments(flight, escortPath, 0.24, 0, 1)
              );
            });
          });

          const holdingInterceptors = activeInterceptorFlights.filter((flight) => !engagedInterceptorIds.has(flight.spec.id));
          const holdingEscorts = activeEscortFlights.filter((flight) => !engagedEscortIds.has(flight.spec.id));
          const resolveSupportFocusPoint = (
            flight: AirShowRuntimeFlightInternal,
            current: AirShowPoint,
            role: "interceptor" | "escort",
            laneIndex: number
          ): {
            focusPoint: AirShowPoint;
            sideSign: number;
            startHeadingDegrees: number;
          } => {
            const defaultFocusPoint = host.resolveAirShowEscortClashFocusPoint(
              corridor,
              role,
              beat,
              laneIndex,
              clashCenter
            );
            if (groupStates.length <= 0) {
              const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
                flight,
                host.resolveAirShowFlightHeadingDegrees(flight)
              );
              return {
                focusPoint: defaultFocusPoint,
                sideSign: host.resolveAirShowRouteSideSign(
                  current,
                  defaultFocusPoint,
                  startHeadingDegrees,
                  role === "interceptor" ? -1 : 1
                ),
                startHeadingDegrees
              };
            }
            const nearestGroup = groupStates.reduce((closest, candidate) => {
              const closestDistancePx = Math.hypot(
                current.cx - closest.groupCenter.cx,
                current.cy - closest.groupCenter.cy
              );
              const candidateDistancePx = Math.hypot(
                current.cx - candidate.groupCenter.cx,
                current.cy - candidate.groupCenter.cy
              );
              return candidateDistancePx < closestDistancePx ? candidate : closest;
            });
            const groupProjection = nearestGroup.groupProjection;
            const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
              flight,
              host.resolveAirShowFlightHeadingDegrees(flight)
            );
            const localSideSign = host.resolveAirShowRouteSideSign(
              current,
              nearestGroup.groupCenter,
              startHeadingDegrees,
              role === "interceptor" ? -1 : 1
            );
            return {
              focusPoint: host.projectAirShowCorridorPoint(
                corridor,
                groupProjection.alongPx + (beat === 0 ? (role === "interceptor" ? -6 : 6) : (role === "interceptor" ? 8 : 2)),
                groupProjection.lateralPx + localSideSign * (beat === 0 ? 12 : 16) + laneIndex * (beat === 0 ? 10 : 12)
              ),
              sideSign: localSideSign,
              startHeadingDegrees
            };
          };

          holdingInterceptors.forEach((flight, index) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const laneIndex = index - (holdingInterceptors.length - 1) / 2;
            const supportFocus = resolveSupportFocusPoint(flight, current, "interceptor", laneIndex);
            const path = beat === 0
              ? host.sanitizeAirShowEntryPath(
                  bridgePathToPreviousPhaseMotion(
                    flight,
                    host.buildAirShowMergePassPath(current, supportFocus.focusPoint, corridor, {
                      sideSign: supportFocus.sideSign,
                      laneIndex: 0,
                      startHeadingDegrees: supportFocus.startHeadingDegrees,
                      entrySeparationPx: 42,
                      crossSeparationPx: 4,
                      overshootPx: 18
                    }),
                    18
                  ),
                  {
                    maxTurnDeg: 38,
                    strongTurnDeg: 78,
                    maxFirstSegmentPx: 54,
                    maxSharpTurnDeg: 108,
                    maxWaypointsToRemove: 2
                  }
                )
              : host.sanitizeAirShowEntryPath(
                  bridgePathToPreviousPhaseMotion(
                    flight,
                    host.buildAirShowPursuitPath(current, supportFocus.focusPoint, {
                      startHeadingDegrees: supportFocus.startHeadingDegrees,
                      lateralSign: supportFocus.sideSign,
                      entryLateralPx: 6,
                      mergeLateralPx: 2,
                      attackOffsetPx: 0,
                      closeInPx: 3,
                      overshootPx: 5,
                      breakLateralPx: 7,
                      breakForwardPx: 4,
                      driftPx: 1
                    }),
                    16
                  ),
                  {
                    maxTurnDeg: 36,
                    strongTurnDeg: 76,
                    maxFirstSegmentPx: 52,
                    maxSharpTurnDeg: 106,
                    maxWaypointsToRemove: 2
                  }
                );
            phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, path, 0.26, 0, 1));
          });

          holdingEscorts.forEach((flight, index) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const laneIndex = index - (holdingEscorts.length - 1) / 2;
            const supportFocus = resolveSupportFocusPoint(flight, current, "escort", laneIndex);
            const path = beat === 0
              ? host.sanitizeAirShowEntryPath(
                  bridgePathToPreviousPhaseMotion(
                    flight,
                    host.buildAirShowMergePassPath(current, supportFocus.focusPoint, corridor, {
                      sideSign: supportFocus.sideSign,
                      laneIndex: 0,
                      startHeadingDegrees: supportFocus.startHeadingDegrees,
                      entrySeparationPx: 40,
                      crossSeparationPx: 4,
                      overshootPx: 18
                    }),
                    16
                  ),
                  {
                    maxTurnDeg: 38,
                    strongTurnDeg: 76,
                    maxFirstSegmentPx: 52,
                    maxSharpTurnDeg: 106,
                    maxWaypointsToRemove: 2
                  }
                )
              : host.sanitizeAirShowEntryPath(
                  bridgePathToPreviousPhaseMotion(
                    flight,
                    host.buildAirShowPursuitPath(current, supportFocus.focusPoint, {
                      startHeadingDegrees: supportFocus.startHeadingDegrees,
                      lateralSign: supportFocus.sideSign,
                      entryLateralPx: 5,
                      mergeLateralPx: 2,
                      attackOffsetPx: 0,
                      closeInPx: 3,
                      overshootPx: 4,
                      breakLateralPx: 6,
                      breakForwardPx: 4,
                      driftPx: 1
                    }),
                    14
                  ),
                  {
                    maxTurnDeg: 34,
                    strongTurnDeg: 72,
                    maxFirstSegmentPx: 48,
                    maxSharpTurnDeg: 104,
                    maxWaypointsToRemove: 2
                  }
                );
            phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, path, 0.24, 0, 1));
          });

          const activeBomberFlights = activeFlights(bomberFlights);
          const escortClashRoleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: host.airShowBomberSpeedPxPerMs
          });
          const escortBeatDurationMs = defaultEscortBeatDurationMs;
          if (activeBomberFlights.length > 0) {
            const bomberPhaseLabel: AirShowContestedBomberPhaseLabel =
              beat === 0 ? "escort-clash-merge" : "escort-clash-scramble";
            const bomberPhaseAssignments = host.buildContestedBomberPhaseSliceAssignments(
              activeBomberFlights,
              contestedBomberMasterPaths,
              contestedBomberPhaseDurations,
              bomberPhaseLabel
            );
            phaseAssignments.push(...bomberPhaseAssignments);
          }
          const extendedPhaseAssignments =
            beat === 1
              ? host.extendAirShowPhaseAssignmentsForSpeed(
                  phaseAssignments,
                  escortBeatDurationMs,
                  escortClashRoleSpeeds,
                  {
                    clampCenter: corridor.center,
                    orbitSignByRole: {
                      interceptor: -1,
                      escort: 1
                    }
                  }
                )
              : phaseAssignments;
          const resolvedPhaseAssignments = host.prepareAirShowPhaseAssignments(
            extendedPhaseAssignments,
            escortBeatDurationMs,
            [0.3, 0.5, 0.7],
            beat === 0 ? 42 : 34,
            escortClashRoleSpeeds,
            {
              previousAssignments: previousPhaseAssignments,
              previousDurationMs: previousPhaseDurationMs,
              entryTurnLimitDeg: beat === 0 ? 72 : 74,
              directTurnHomeRoles: beat === 1 ? ["interceptor", "escort"] : undefined,
              softenEntryRoles: beat === 1 ? ["interceptor", "escort"] : undefined,
              softenEntryTurnLimitDeg: beat === 1 ? 90 : undefined,
              softenEntryWaypointCount: beat === 1 ? 7 : undefined,
              softenExitRoles: beat === 1 ? ["interceptor", "escort"] : undefined,
              softenExitTurnLimitDeg: beat === 1 ? 98 : undefined,
              softenExitWaypointCount: beat === 1 ? 6 : undefined
            }
          );
          const timedPhaseAssignments =
            beat === 0
              ? host.shapeCompactAirShowMergeAssignments(resolvedPhaseAssignments, escortBeatDurationMs)
              : resolvedPhaseAssignments;
          groupStates.forEach((state) => {
            const baseTimings = beat === 0
              ? [0.62, 0.7, 0.78, 0.86]
              : [0.16, 0.28, 0.4, 0.52, 0.64, 0.76];
            state.group.interceptorFlights.forEach((flight, interceptorIndex) => {
              const targetEscortFlight = state.group.escortFlights[
                interceptorIndex % Math.max(1, state.group.escortFlights.length)
              ];
              if (!targetEscortFlight) {
                return;
              }
              tracerBursts.push(
                ...host.buildAirShowDynamicTracerVolley(
                  timedPhaseAssignments,
                  flight,
                  targetEscortFlight,
                  {
                    emitter: "nose",
                    color: "#fff5cf",
                    width: beat === 0 ? 0.78 : 0.72,
                    lifetimeMs: beat === 0 ? 44 : 42,
                    spreadPx: beat === 0 ? 7 : 8,
                    streakLengthPx: beat === 0 ? 132 : 142,
                    visibleLengthPx: beat === 0 ? 11 : 12,
                    fanHalfAngleDeg: 2.6,
                    burstCount: 4,
                    maxAlignmentDeg: beat === 0 ? 30 : 36,
                    maxRangePx: beat === 0 ? 164 : 176,
                    timings: baseTimings.map((timing) =>
                      host.clamp(
                        timing + interceptorIndex * 0.02,
                        beat === 0 ? 0.08 : 0.12,
                        beat === 0 ? 0.9 : 0.8
                      )
                    ),
                    fallbackToNearest: true
                  }
                )
              );
            });
            state.group.escortFlights.forEach((flight, escortIndex) => {
              const targetInterceptorFlight = state.group.interceptorFlights[
                escortIndex % Math.max(1, state.group.interceptorFlights.length)
              ];
              if (!targetInterceptorFlight) {
                return;
              }
              tracerBursts.push(
                ...host.buildAirShowDynamicTracerVolley(
                  timedPhaseAssignments,
                  flight,
                  targetInterceptorFlight,
                  {
                    emitter: "nose",
                    color: "#ffd98a",
                    width: beat === 0 ? 0.66 : 0.62,
                    lifetimeMs: beat === 0 ? 42 : 40,
                    spreadPx: beat === 0 ? 6 : 7,
                    streakLengthPx: beat === 0 ? 126 : 138,
                    visibleLengthPx: beat === 0 ? 10 : 11,
                    fanHalfAngleDeg: 2.2,
                    burstCount: 3,
                    maxAlignmentDeg: beat === 0 ? 30 : 36,
                    maxRangePx: beat === 0 ? 160 : 172,
                    timings: baseTimings.map((timing) =>
                      host.clamp(
                        timing + 0.02 + escortIndex * 0.02,
                        beat === 0 ? 0.08 : 0.12,
                        beat === 0 ? 0.9 : 0.8
                      )
                    ),
                    fallbackToNearest: true
                  }
                )
              );
            });
          });
          recordPhase(
            beat === 0 ? "escort-clash-merge" : "escort-clash-scramble",
            timedPhaseAssignments,
            escortBeatDurationMs,
            tracerBursts,
            [],
            escortClashRoleSpeeds
          );
          previousPhaseAssignments = timedPhaseAssignments;
          previousPhaseDurationMs = escortBeatDurationMs;
          updateFlightAnchors([...interceptorFlights, ...escortFlights, ...bomberFlights]);
        }

        interceptorFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(
          flight,
          Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)
        ));
        escortFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(
          flight,
          Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)
        ));
        updateFlightAnchors([...interceptorFlights, ...escortFlights, ...bomberFlights]);
      }
    } else if (interceptorFlights.length + escortFlights.length > 1 && bomberFlights.length === 0) {
      // Only hold/drift when no bomber is present. If a bomber is approaching,
      // skip straight to defense positioning to avoid "linger and drift" effect
      // while the next bomber arrives.
      const idleAssignments = [
        ...host.buildAirShowBandAssignments(
          activeFlights(interceptorFlights),
          "escort-idle:interceptors",
          corridor,
          scene.kind,
          stageRandom,
          {
            alongPx: -92,
            lateralPx: -196,
            alongStepPx: 28,
            lateralStepPx: 42,
            jitterAlongPx: 0,
            jitterLateralPx: 0,
            arcPx: 15,
            driftPx: 18
          }
        ),
        ...host.buildAirShowBandAssignments(
          activeFlights(escortFlights),
          "escort-idle:escorts",
          corridor,
          scene.kind,
          stageRandom,
          {
            alongPx: 12,
            lateralPx: 172,
            alongStepPx: 24,
            lateralStepPx: 38,
            jitterAlongPx: 0,
            jitterLateralPx: 0,
            arcPx: 15,
            driftPx: 18
          }
        )
      ];
      recordPhase(
        "escort-hold",
        idleAssignments,
        Math.max(520, Math.round((scene.escortClashDurationMs ?? 1500) * 0.55)),
        [],
        [],
        host.resolveAirShowRoleSpeedMap({
          interceptor: host.airShowFighterSpeedPxPerMs,
          escort: host.airShowFighterSpeedPxPerMs
        })
      );
      updateFlightAnchors([...interceptorFlights, ...escortFlights]);
    }

    const survivingInterceptors = activeFlights(interceptorFlights);
    const survivingEscorts = activeFlights(escortFlights);
    const survivingBombers = activeFlights(bomberFlights).filter(
      (flight) => (flight.currentStrength ?? flight.spec.finalStrength ?? 0) > 0
    );
    const bomberApproachProfilesById = host.resolveAirShowBomberApproachProfiles(
      survivingBombers,
      corridor,
      bomberTargetCentersById,
      averageBomberTargetCenter,
      stageRandom
    );

    // Inspection path: BomberGap suppressed when bombers are present (mirrors runtime fix).
    if (
      survivingBombers.length === 0
      && (scene.bomberArrivalDelayMs ?? 0) > 0
      && (scene.escortExchanges?.length ?? 0) > 0
      && (survivingInterceptors.length > 0 || survivingEscorts.length > 0)
    ) {
      const bomberGapAssignments: AirShowPhaseAssignment[] = [
        ...survivingInterceptors.flatMap((flight, index) =>
          host.buildAirShowFlightAssignments(
            flight,
            host.buildAirShowScreenRunPath(
              host.averageAirShowPosition(flight.actors) ?? flight.anchor,
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
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight)
              }
            ),
            0.28,
            index,
            survivingInterceptors.length
          )
        ),
        ...survivingEscorts.flatMap((flight, index) =>
          host.buildAirShowFlightAssignments(
            flight,
            host.buildAirShowScreenRunPath(
              host.averageAirShowPosition(flight.actors) ?? flight.anchor,
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
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight)
              }
            ),
            0.26,
            index,
            survivingEscorts.length
          )
        )
      ];
      recordPhase(
        "bomber-gap",
        bomberGapAssignments,
        Math.max(180, scene.bomberArrivalDelayMs ?? 0),
        [],
        [],
        host.resolveAirShowRoleSpeedMap({
          interceptor: host.airShowFighterSpeedPxPerMs,
          escort: host.airShowFighterSpeedPxPerMs
        })
      );
      updateFlightAnchors([...survivingInterceptors, ...survivingEscorts]);
    }

    if (survivingBombers.length > 0) {
      const resolveBomberIngressCoverTarget = (
        current: AirShowPoint,
        role: "interceptor" | "escort",
        laneIndex: number
      ): {
        endAlongPx: number;
        baseLateralPx: number;
        corridorWidthPx: number;
        driftPx: number;
      } => {
        const basePlan =
          role === "interceptor"
            ? {
                endAlongPx: -84,
                baseLateralPx: -142,
                alongStepPx: 20,
                lateralStepPx: 28,
                corridorWidthPx: 18,
                driftPx: 14,
                minimumTravelPx: 82,
                lateralSign: -1
              }
            : {
                endAlongPx: 24,
                baseLateralPx: 118,
                alongStepPx: 18,
                lateralStepPx: 24,
                corridorWidthPx: 16,
                driftPx: 14,
                minimumTravelPx: 72,
                lateralSign: 1
              };
        const targetAlongPx = basePlan.endAlongPx + laneIndex * basePlan.alongStepPx;
        const targetLateralPx = basePlan.baseLateralPx + laneIndex * basePlan.lateralStepPx;
        const targetPoint = host.projectAirShowCorridorPoint(corridor, targetAlongPx, targetLateralPx);
        const routeDistancePx = Math.hypot(targetPoint.cx - current.cx, targetPoint.cy - current.cy);
        if (routeDistancePx >= basePlan.minimumTravelPx) {
          return {
            endAlongPx: targetAlongPx,
            baseLateralPx: targetLateralPx,
            corridorWidthPx: basePlan.corridorWidthPx,
            driftPx: basePlan.driftPx
          };
        }
        const currentProjection = host.resolveAirShowCorridorCoordinates(corridor, current);
        const alongSign = targetAlongPx >= currentProjection.alongPx ? 1 : -1;
        const travelShortfallPx = basePlan.minimumTravelPx - routeDistancePx;
        return {
          endAlongPx:
            targetAlongPx
            + alongSign * host.clamp(travelShortfallPx * 0.78, 18, role === "interceptor" ? 64 : 58),
          baseLateralPx:
            targetLateralPx
            + basePlan.lateralSign * host.clamp(travelShortfallPx * 0.34, 8, role === "interceptor" ? 24 : 20),
          corridorWidthPx: basePlan.corridorWidthPx,
          driftPx: basePlan.driftPx
        };
      };
      const bomberIngressAssignments = host.buildContestedBomberPhaseSliceAssignments(
        survivingBombers,
        contestedBomberMasterPaths,
        contestedBomberPhaseDurations,
        "bomber-ingress"
      );
      const orderedSurvivingInterceptors = [...survivingInterceptors].sort((left, right) => {
        const leftCurrent = host.averageAirShowPosition(left.actors) ?? left.anchor;
        const rightCurrent = host.averageAirShowPosition(right.actors) ?? right.anchor;
        return host.resolveAirShowCorridorCoordinates(corridor, leftCurrent).lateralPx
          - host.resolveAirShowCorridorCoordinates(corridor, rightCurrent).lateralPx;
      });
      const orderedSurvivingEscorts = [...survivingEscorts].sort((left, right) => {
        const leftCurrent = host.averageAirShowPosition(left.actors) ?? left.anchor;
        const rightCurrent = host.averageAirShowPosition(right.actors) ?? right.anchor;
        return host.resolveAirShowCorridorCoordinates(corridor, leftCurrent).lateralPx
          - host.resolveAirShowCorridorCoordinates(corridor, rightCurrent).lateralPx;
      });
      const bomberIngressFighterAssignments: AirShowPhaseAssignment[] = [
        ...orderedSurvivingInterceptors.flatMap((flight, index) => {
          const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
          const laneIndex = index - (orderedSurvivingInterceptors.length - 1) / 2;
          const target = resolveBomberIngressCoverTarget(current, "interceptor", laneIndex);
          const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
            flight,
            host.resolveAirShowFlightHeadingDegrees(flight)
          );
          const targetPoint = host.projectAirShowCorridorPoint(
            corridor,
            target.endAlongPx,
            target.baseLateralPx
          );
          const routeSideSign = host.resolveAirShowRouteSideSign(
            current,
            targetPoint,
            startHeadingDegrees,
            laneIndex <= 0 ? -1 : 1
          );
          return host.buildAirShowFlightAssignments(
            flight,
            host.sanitizeAirShowEntryPath(
              bridgePathToPreviousPhaseMotion(
                flight,
                buildForwardContinuousRoutePath(
                  current,
                  targetPoint,
                  {
                    startHeadingDegrees,
                    lateralSign: routeSideSign,
                    minRouteDot: -0.24,
                    carryForwardPx: 68 + Math.abs(laneIndex) * 10,
                    earlyAlongPx: 102 + Math.abs(laneIndex) * 14,
                    midAlongPx: 148 + Math.abs(laneIndex) * 16,
                    lateAlongPx: 190 + Math.abs(laneIndex) * 14,
                    entryLateralPx: 26 + Math.abs(laneIndex) * 6,
                    midLateralPx: 12 + Math.abs(laneIndex) * 3,
                    lateLateralPx: 4 + Math.abs(laneIndex) * 1.5
                  }
                ),
                44
              ),
              {
                maxTurnDeg: 48,
                strongTurnDeg: 92,
                maxFirstSegmentPx: 82,
                maxSharpTurnDeg: 120,
                maxWaypointsToRemove: 3
              }
            ),
            0.26,
            0,
            1
          );
        }),
        ...orderedSurvivingEscorts.flatMap((flight, index) => {
          const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
          const laneIndex = index - (orderedSurvivingEscorts.length - 1) / 2;
          const target = resolveBomberIngressCoverTarget(current, "escort", laneIndex);
          const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
            flight,
            host.resolveAirShowFlightHeadingDegrees(flight)
          );
          const targetPoint = host.projectAirShowCorridorPoint(
            corridor,
            target.endAlongPx,
            target.baseLateralPx
          );
          const routeSideSign = host.resolveAirShowRouteSideSign(
            current,
            targetPoint,
            startHeadingDegrees,
            laneIndex >= 0 ? 1 : -1
          );
          return host.buildAirShowFlightAssignments(
            flight,
            host.sanitizeAirShowEntryPath(
              bridgePathToPreviousPhaseMotion(
                flight,
                buildForwardContinuousRoutePath(
                  current,
                  targetPoint,
                  {
                    startHeadingDegrees,
                    lateralSign: routeSideSign,
                    minRouteDot: -0.18,
                    carryForwardPx: 52 + Math.abs(laneIndex) * 6,
                    earlyAlongPx: 82 + Math.abs(laneIndex) * 10,
                    midAlongPx: 126 + Math.abs(laneIndex) * 12,
                    lateAlongPx: 162 + Math.abs(laneIndex) * 10,
                    entryLateralPx: 22 + Math.abs(laneIndex) * 5,
                    midLateralPx: 10 + Math.abs(laneIndex) * 2.5,
                    lateLateralPx: 4 + Math.abs(laneIndex)
                  }
                ),
                30
              ),
              {
                maxTurnDeg: 44,
                strongTurnDeg: 90,
                maxFirstSegmentPx: 78,
                maxSharpTurnDeg: 118,
                maxWaypointsToRemove: 3
              }
            ),
            0.24,
            0,
            1
          );
        })
      ];
      const bomberIngressRoleSpeeds = host.resolveAirShowRoleSpeedMap({
        interceptor: host.airShowFighterSpeedPxPerMs,
        escort: host.airShowFighterSpeedPxPerMs,
        bomber: host.airShowBomberSpeedPxPerMs
      });
      const bomberIngressDurationMs = plannedBomberIngressDurationMs;
      const extendedBomberIngressAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
        [
          ...bomberIngressAssignments,
          ...bomberIngressFighterAssignments
        ],
        bomberIngressDurationMs,
        bomberIngressRoleSpeeds,
        {
          clampCenter: corridor.center,
          orbitSignByRole: {
            interceptor: -1,
            escort: 1
          }
        }
      );
      const spacedBomberIngressAssignments = host.prepareAirShowPhaseAssignments(
        extendedBomberIngressAssignments,
        bomberIngressDurationMs,
        [0.22, 0.5, 0.78, 0.94],
        undefined,
        bomberIngressRoleSpeeds,
        {
          previousAssignments: previousPhaseAssignments,
          previousDurationMs: previousPhaseDurationMs,
          entryTurnLimitDeg: 90,
          directTurnHomeRoles: ["interceptor", "escort"],
          softenEntryRoles: ["interceptor", "escort"],
          softenEntryTurnLimitDeg: 110,
          softenEntryWaypointCount: 10,
          softenExitRoles: ["interceptor", "escort"],
          softenExitTurnLimitDeg: 108,
          softenExitWaypointCount: 10
        }
      );
      recordPhase(
        "bomber-ingress",
        spacedBomberIngressAssignments,
        bomberIngressDurationMs,
        [],
        [],
        bomberIngressRoleSpeeds
      );
      previousPhaseAssignments = spacedBomberIngressAssignments;
      previousPhaseDurationMs = bomberIngressDurationMs;
      updateFlightAnchors([...survivingBombers, ...survivingInterceptors, ...survivingEscorts]);

      const bomberPassEntriesByBomber = host.resolveAirShowBomberPassEntries(scene, flightMap);
      const bomberAttackEntries = survivingBombers.flatMap((bomberFlight) =>
        (bomberPassEntriesByBomber.get(bomberFlight.spec.id) ?? []).map((entry: any) => ({
          ...entry,
          bomberFlight
        }))
      );
      const attackEntriesForShow = host.resolveAirShowBomberDefensePassAttackEntries(
        bomberAttackEntries,
        interceptorFlights,
        survivingBombers
      );
      if (attackEntriesForShow.length > 0) {
          const bomberDefenseAssignments = host.buildContestedBomberPhaseSliceAssignments(
            survivingBombers,
            contestedBomberMasterPaths,
            contestedBomberPhaseDurations,
          "bomber-defense-pass"
        );
        const bomberDefenseTargets = survivingBombers.map((bomberFlight, bomberIndex) => {
          const laneIndex = survivingBombers.length <= 1 ? 0 : bomberIndex - (survivingBombers.length - 1) / 2;
          const defenseAssignment = bomberDefenseAssignments.find(
            (assignment) => assignment.actor.flightId === bomberFlight.spec.id
          );
          const defenseTarget =
            defenseAssignment?.points[defenseAssignment.points.length - 1]
            ?? (host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor);
          return {
            bomberFlight,
            laneIndex,
            defenseTarget
          };
        });
        const averageDefenseAlongPx =
          bomberDefenseTargets.reduce((sum, entry) => {
            return sum + host.resolveAirShowCorridorCoordinates(corridor, entry.defenseTarget).alongPx;
          }, 0) / Math.max(1, bomberDefenseTargets.length);
        const passEnd = Math.round(averageDefenseAlongPx);
        const phaseAssignments: AirShowPhaseAssignment[] = [...bomberDefenseAssignments];
        const tracerBursts: AirShowTracerBurst[] = [];
        const attackEntriesByBomberId = new Map<
          string,
          Array<(typeof attackEntriesForShow)[number]>
        >();
        attackEntriesForShow.forEach((entry) => {
          const bomberEntries = attackEntriesByBomberId.get(entry.bomberFlight.spec.id) ?? [];
          bomberEntries.push(entry);
          attackEntriesByBomberId.set(entry.bomberFlight.spec.id, bomberEntries);
        });
        const bomberAttackContexts = new Map<
          string,
          {
            readonly localAttackCount: number;
            readonly localAttackIndex: number;
          }
        >();
        const buildPhaseTracerTimings = (
          centerProgress: number,
          offsets: ReadonlyArray<number>,
          minProgress: number,
          maxProgress: number
        ): number[] =>
          offsets
            .map((offset) => host.clamp(centerProgress + offset, minProgress, maxProgress))
            .filter((timing, index, timings) =>
              timings.findIndex((candidate) => Math.abs(candidate - timing) < 0.012) === index
            );
        const scoreBomberDefenseEntryPath = (
          path: ReadonlyArray<AirShowPoint>,
          boundaryVector: { dx: number; dy: number } | null,
          phaseCorridor: AirShowPlannerCorridor,
          passDirection: number,
          targetPoint: AirShowPoint
        ): number => {
          if (path.length < 2) {
            return Number.POSITIVE_INFINITY;
          }
          const start = path[0];
          const firstPoint =
            path.find((point, index) =>
              index > 0 && !!start && Math.hypot(point.cx - start.cx, point.cy - start.cy) > 0.5
            ) ?? null;
          const secondPoint =
            path.find((point, index) =>
              index > 1 && !!firstPoint && Math.hypot(point.cx - firstPoint.cx, point.cy - firstPoint.cy) > 0.5
            ) ?? null;
          const entryTurnDeg =
            boundaryVector && firstPoint
              ? resolveVectorAngleDegrees(
                  { x: boundaryVector.dx, y: boundaryVector.dy },
                  {
                    x: firstPoint.cx - start.cx,
                    y: firstPoint.cy - start.cy
                  }
                )
              : 0;
          let maxEarlyTurnDeg = 0;
          for (let index = 1; index < Math.min(path.length - 1, 5); index += 1) {
            const previous = path[index - 1];
            const current = path[index];
            const next = path[index + 1];
            if (!previous || !current || !next) {
              continue;
            }
            maxEarlyTurnDeg = Math.max(
              maxEarlyTurnDeg,
              resolveWaypointTurnDegrees(previous, current, next)
            );
          }
          let earlyRegressionPenalty = 0;
          for (let index = 1; index < Math.min(path.length, 4); index += 1) {
            const previous = path[index - 1];
            const current = path[index];
            if (!previous || !current) {
              continue;
            }
            const previousAlongPx = host.resolveAirShowCorridorCoordinates(phaseCorridor, previous).alongPx;
            const currentAlongPx = host.resolveAirShowCorridorCoordinates(phaseCorridor, current).alongPx;
            if ((currentAlongPx - previousAlongPx) * passDirection < -4) {
              earlyRegressionPenalty += 240;
            }
          }
          const firstPointDistancePenalty =
            firstPoint
            && Math.hypot(firstPoint.cx - targetPoint.cx, firstPoint.cy - targetPoint.cy)
              > Math.hypot(start.cx - targetPoint.cx, start.cy - targetPoint.cy) + 28
              ? 18
              : 0;
          const secondTurnPenalty =
            boundaryVector && firstPoint && secondPoint
              ? resolveVectorAngleDegrees(
                  {
                    x: firstPoint.cx - start.cx,
                    y: firstPoint.cy - start.cy
                  },
                  {
                    x: secondPoint.cx - firstPoint.cx,
                    y: secondPoint.cy - firstPoint.cy
                  }
                ) * 0.7
              : 0;
          return (
            entryTurnDeg * 5
            + maxEarlyTurnDeg * 0.7
            + secondTurnPenalty * 0.6
            + earlyRegressionPenalty
            + firstPointDistancePenalty
          );
        };
        attackEntriesByBomberId.forEach((entries) => {
          entries.forEach((entry, localAttackIndex) => {
            bomberAttackContexts.set(entry.interceptorFlight.spec.id, {
              localAttackCount: entries.length,
              localAttackIndex
            });
          });
        });

        attackEntriesForShow.forEach((entry) => {
          const interceptorCurrent = host.averageAirShowPosition(entry.interceptorFlight.actors) ?? entry.interceptorFlight.anchor;
          const interceptorEntryHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
            entry.interceptorFlight,
            host.resolveAirShowFlightHeadingDegrees(entry.interceptorFlight)
          );
          const attackContext = bomberAttackContexts.get(entry.interceptorFlight.spec.id);
          const lane =
            !attackContext || attackContext.localAttackCount <= 1
              ? 0
              : attackContext.localAttackIndex - (attackContext.localAttackCount - 1) / 2;
          const bomberCurrent = host.averageAirShowPosition(entry.bomberFlight.actors) ?? entry.bomberFlight.anchor;
          const bomberApproachProfile = bomberApproachProfilesById.get(entry.bomberFlight.spec.id);
          const defenseTargetPoint =
            bomberDefenseTargets.find((candidate) => candidate.bomberFlight.spec.id === entry.bomberFlight.spec.id)?.defenseTarget
            ?? bomberApproachProfile?.targetApproach
            ?? corridor.strike;
          const attackCorridor = host.resolveAirShowCorridor(
            center,
            bomberCurrent,
            bomberApproachProfile?.targetCenter ?? corridor.strike
          );
          const attackPassEnd = Math.round(
            host.resolveAirShowCorridorCoordinates(
              attackCorridor,
              defenseTargetPoint
            ).alongPx
          );
          const attackPassStart = attackPassEnd - 132;
          const fallbackDirection = host.resolveAirShowCorridorSideSign(
            interceptorCurrent,
            attackCorridor,
            (attackContext?.localAttackIndex ?? 0) % 2 === 0 ? -1 : 1
          );
          const headingDirectedDirection = host.resolveAirShowRouteSideSign(
            interceptorCurrent,
            defenseTargetPoint,
            interceptorEntryHeadingDegrees,
            fallbackDirection
          );
          const passDirection = attackPassEnd >= attackPassStart ? 1 : -1;
          const previousBoundaryVector = resolvePreviousPhaseBoundaryVector(entry.interceptorFlight);
          const candidateAttackSigns = [
            headingDirectedDirection,
            fallbackDirection,
            -headingDirectedDirection,
            -fallbackDirection
          ].map((sign) => (sign >= 0 ? 1 : -1))
            .filter((sign, index, signs) => signs.indexOf(sign) === index);
          const buildBomberDefenseAttackPath = (attackSideSign: number): AirShowPoint[] =>
            host.sanitizeAirShowEntryPath(
              bridgePathToPreviousPhaseMotion(
                entry.interceptorFlight,
                host.buildAirShowBomberInterceptPassPath(interceptorCurrent, attackCorridor, {
                  passStartAlongPx: attackPassStart,
                  passEndAlongPx: attackPassEnd,
                  laneIndex: lane,
                  attackSideSign,
                  startHeadingDegrees: interceptorEntryHeadingDegrees
                }),
                52
              ),
              {
                maxTurnDeg: 44,
                strongTurnDeg: 88,
                maxFirstSegmentPx: 84,
                maxSharpTurnDeg: 112,
                maxWaypointsToRemove: 3
              }
            );
          const interceptorPath =
            candidateAttackSigns
              .map((attackSideSign) => {
                const path = buildBomberDefenseAttackPath(attackSideSign);
                return {
                  path,
                  score:
                    scoreBomberDefenseEntryPath(
                      path,
                      previousBoundaryVector,
                      attackCorridor,
                      passDirection,
                      bomberCurrent
                    )
                };
              })
              .sort((left, right) => left.score - right.score)[0]?.path
            ?? buildBomberDefenseAttackPath(fallbackDirection);
          phaseAssignments.push(
            ...host.buildAirShowFlightAssignments(
              entry.interceptorFlight,
              interceptorPath,
              0.3,
              0,
              1
            )
          );
        });
        const activeScreeningEscorts = activeFlights(escortFlights);
        phaseAssignments.push(
          ...activeScreeningEscorts.flatMap((flight, escortIndex) =>
            host.buildAirShowFlightAssignments(
              flight,
              host.sanitizeAirShowEntryPath(
                bridgePathToPreviousPhaseMotion(
                  flight,
                  host.buildAirShowScreenRunPath(
                    host.averageAirShowPosition(flight.actors) ?? flight.anchor,
                    corridor,
                    {
                      endAlongPx: passEnd + 36,
                      baseLateralPx: 108,
                      laneIndex: escortIndex - (activeScreeningEscorts.length - 1) / 2,
                      sideSign: 1,
                      alongStepPx: 18,
                      lateralStepPx: 26,
                      corridorWidthPx: 14,
                      driftPx: 12,
                      startHeadingDegrees: resolvePreviousPhaseBoundaryHeadingDegrees(
                        flight,
                        host.resolveAirShowFlightHeadingDegrees(flight)
                      )
                    }
                  ),
                  26
                ),
                {
                  maxTurnDeg: 42,
                  strongTurnDeg: 86,
                  maxFirstSegmentPx: 72,
                  maxSharpTurnDeg: 116,
                  maxWaypointsToRemove: 3
                }
              ),
              0.24,
              0,
              1
            )
          )
        );
        const bomberDefenseRoleSpeeds = host.resolveAirShowRoleSpeedMap({
          interceptor: host.airShowFighterSpeedPxPerMs,
          escort: host.airShowFighterSpeedPxPerMs,
          bomber: host.airShowBomberSpeedPxPerMs
        });
        const bomberPassBeatDurationMs = plannedBomberDefenseDurationMs;
        const extendedBomberDefenseAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
          phaseAssignments,
          bomberPassBeatDurationMs,
          bomberDefenseRoleSpeeds,
          {
            clampCenter: corridor.center,
            orbitSignByRole: {
              interceptor: -1,
              escort: 1
            }
          }
        );
        const spacedPhaseAssignments = host.prepareAirShowPhaseAssignments(
          extendedBomberDefenseAssignments,
          bomberPassBeatDurationMs,
          [0.04, 0.18, 0.36, 0.56, 0.76],
          46,
          bomberDefenseRoleSpeeds,
          {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 82,
            directTurnHomeRoles: ["interceptor", "escort"],
            softenEntryRoles: ["interceptor", "escort"],
            softenEntryTurnLimitDeg: 108,
            softenEntryWaypointCount: 14
          }
        );
        const bomberDefenseAssignmentsByActorId = host.buildAirShowAssignmentLookup(spacedPhaseAssignments);
        const sampleFlightCenterAtProgress = (
          flight: AirShowPlannerFlight,
          progress: number
        ): AirShowPoint | null => {
          const sampledActorPositions = flight.actors.flatMap((actor) => {
            const assignment = bomberDefenseAssignmentsByActorId.get(actor.id);
            const sampledPosition = assignment
              ? host.sampleAirShowAssignmentAtTime(
                  assignment,
                  bomberPassBeatDurationMs * progress,
                  bomberPassBeatDurationMs
                ).position
              : actor.position;
            return sampledPosition ? [sampledPosition] : [];
          });
          return host.averageAirShowPoints(sampledActorPositions);
        };
        const resolveClosestApproachProgress = (
          sourceFlight: AirShowPlannerFlight,
          targetFlight: AirShowPlannerFlight
        ): number | null => {
          let bestProgress: number | null = null;
          let bestDistancePx = Number.POSITIVE_INFINITY;
          const sampleCount = 13;
          for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
            const progress = 0.12 + (0.72 * sampleIndex) / Math.max(1, sampleCount - 1);
            const sourcePoint = sampleFlightCenterAtProgress(sourceFlight, progress);
            const targetPoint = sampleFlightCenterAtProgress(targetFlight, progress);
            if (!sourcePoint || !targetPoint) {
              continue;
            }
            const distancePx = Math.hypot(
              sourcePoint.cx - targetPoint.cx,
              sourcePoint.cy - targetPoint.cy
            );
            if (distancePx < bestDistancePx) {
              bestDistancePx = distancePx;
              bestProgress = progress;
            }
          }
          return bestProgress;
        };
        attackEntriesForShow.forEach((entry) => {
          const attackContext = bomberAttackContexts.get(entry.interceptorFlight.spec.id);
          const attackLaneOffset =
            attackContext && attackContext.localAttackCount > 1
              ? attackContext.localAttackIndex - (attackContext.localAttackCount - 1) / 2
              : 0;
          const attackCenterProgress = host.clamp(
            (resolveClosestApproachProgress(entry.interceptorFlight, entry.bomberFlight) ?? 0.48)
              + attackLaneOffset * 0.025,
            0.16,
            0.82
          );
          const attackTimings = buildPhaseTracerTimings(
            attackCenterProgress,
            [-0.16, -0.1, -0.04, 0.03, 0.1, 0.17],
            0.08,
            0.92
          );
          const defensiveTimings = buildPhaseTracerTimings(
            host.clamp(attackCenterProgress + 0.04, 0.18, 0.88),
            [-0.03, 0.08, 0.18],
            0.12,
            0.94
          );
          tracerBursts.push(
            ...host.buildAirShowBomberDefensePassTracerBursts(
              spacedPhaseAssignments,
              entry.interceptorFlight,
              entry.bomberFlight,
              {
                attackTimings: attackTimings.length > 0 ? attackTimings : [0.28, 0.4, 0.52, 0.64],
                defensiveTimings: defensiveTimings.length > 0 ? defensiveTimings : [0.34, 0.5, 0.66],
                fallbackToNearest: true
              }
            )
          );
        });
        if (tracerBursts.length === 0) {
          const fallbackAttackerFlight =
            activeFlights(interceptorFlights)[0]
            ?? activeFlights(escortFlights)[0]
            ?? null;
          const fallbackBomberFlight = survivingBombers[0] ?? null;
          const fallbackInterceptor = fallbackAttackerFlight?.actors.find((actor) => actor.active) ?? null;
          const fallbackBomber = fallbackBomberFlight?.actors.find((actor) => actor.active) ?? null;
          if (fallbackAttackerFlight && fallbackBomberFlight) {
            tracerBursts.push(
              ...host.buildAirShowBomberDefensePassTracerBursts(
                spacedPhaseAssignments,
                fallbackAttackerFlight,
                fallbackBomberFlight,
                {
                  attackTimings: [0.24, 0.38, 0.52, 0.66],
                  defensiveTimings: [0.36, 0.54, 0.72],
                  fallbackToNearest: true
                }
              )
            );
          } else if (fallbackInterceptor && fallbackBomber) {
            tracerBursts.push(
              ...host.buildAirShowTracerVolley(fallbackInterceptor, fallbackBomber, {
                emitter: "nose",
                width: 0.54,
                lifetimeMs: 40,
                spreadPx: 6,
                streakLengthPx: 132,
                visibleLengthPx: 12,
                fanHalfAngleDeg: 2,
                burstCount: 3,
                timings: [0.28, 0.42, 0.56, 0.7]
              }),
              ...host.buildAirShowTracerVolley(fallbackBomber, fallbackInterceptor, {
                emitter: "center",
                color: "#fff1c8",
                width: 0.42,
                lifetimeMs: 34,
                spreadPx: 4,
                streakLengthPx: 96,
                visibleLengthPx: 8,
                fanHalfAngleDeg: 1,
                burstCount: 2,
                timings: [0.36, 0.54, 0.72]
              })
            );
          }
        }
        recordPhase(
          "bomber-defense-pass",
          spacedPhaseAssignments,
          bomberPassBeatDurationMs,
          tracerBursts,
          [],
          bomberDefenseRoleSpeeds
        );
        previousPhaseAssignments = spacedPhaseAssignments;
        previousPhaseDurationMs = bomberPassBeatDurationMs;
        updateFlightAnchors([...survivingBombers, ...interceptorFlights, ...escortFlights]);

        const deferBomberFinalStrengthUntilFlak = (scene.flakBursts?.length ?? 0) > 0;
        survivingBombers.forEach((flight) =>
          host.syncAirShowFlightStrengthForInspection(
            flight,
            Math.max(
              0,
              deferBomberFinalStrengthUntilFlak
                ? (flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)
                : (flight.spec.finalStrength ?? flight.currentStrength)
            )
          )
        );
        interceptorFlights.forEach((flight) =>
          host.syncAirShowFlightStrengthForInspection(
            flight,
            Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)
          )
        );
        updateFlightAnchors([...survivingBombers, ...interceptorFlights]);
      }
    }

    const postPassInterceptors = activeFlights(interceptorFlights);
    const postPassEscorts = activeFlights(escortFlights);
    const postPassBombers = activeFlights(bomberFlights).filter(
      (flight) => (flight.currentStrength ?? 0) > 0
    );
    if (postPassBombers.length > 0) {
      const targetRunFighterFlights = [...postPassInterceptors, ...postPassEscorts];
      const bomberTargetRuns = postPassBombers.map((bomberFlight, index) => {
        const cachedProfile = bomberApproachProfilesById.get(bomberFlight.spec.id);
        const targetCenter =
          cachedProfile?.targetCenter
          ?? bomberTargetCentersById.get(bomberFlight.spec.id)
          ?? averageBomberTargetCenter
          ?? corridor.strike;
        const laneIndex =
          cachedProfile?.laneIndex
          ?? (postPassBombers.length <= 1 ? 0 : index - (postPassBombers.length - 1) / 2);
        const targetApproach =
          cachedProfile?.targetApproach
          ?? host.offsetAirShowPoint(
            targetCenter,
            -corridor.axis.x * 14 + corridor.normal.x * laneIndex * 16,
            -corridor.axis.y * 14 + corridor.normal.y * laneIndex * 16
          );
        return {
          bomberFlight,
          targetCenter,
          targetApproach,
          laneIndex,
          turnSideSign: host.resolveAirShowRouteSideSign(
            host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor,
            targetCenter,
            host.resolveAirShowFlightHeadingDegrees(bomberFlight),
            laneIndex >= 0 ? 1 : -1
          )
        };
      });
      const strikeRunRoleSpeeds = host.resolveAirShowRoleSpeedMap({
        interceptor: host.airShowFighterSpeedPxPerMs,
        escort: host.airShowFighterSpeedPxPerMs,
        bomber: host.airShowBomberSpeedPxPerMs
      });
      const bomberStrikeRunAssignments = bomberTargetRuns.flatMap(
        ({ bomberFlight, targetCenter, turnSideSign }, bomberIndex) =>
          host.buildAirShowFlightAssignments(
            bomberFlight,
            host.buildAirShowBomberTargetRunPath(
              host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor,
              targetCenter,
              {
                lateralSign: turnSideSign,
                corridorWidthPx: 10,
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(bomberFlight)
              }
            ),
            0.2,
            bomberIndex,
            bomberTargetRuns.length
          )
      );
      const strikeRunDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
        bomberStrikeRunAssignments,
        strikeRunRoleSpeeds,
        scene.strikeRunDurationMs ?? 980,
        640,
        7000,
        ["bomber"]
      );
      const fighterPeelHeadingByFlightId = collectStableTailHeadingsByFlightId(
        previousPhaseAssignments,
        previousPhaseDurationMs,
        0.72,
        0.92
      );
      const strikeRunAssignments: AirShowPhaseAssignment[] = [
        ...bomberStrikeRunAssignments,
        ...buildFighterPeelAssignments(
          targetRunFighterFlights,
          strikeRunDurationMs,
          fighterPeelHeadingByFlightId
        )
      ];
      const strikeRunTracerBursts: AirShowTracerBurst[] = [];
      const strikeRunFlakBursts = bomberTargetRuns.flatMap(({ bomberFlight }) =>
        host.resolveAirShowBomberFlakBursts(scene, bomberFlight.spec.id)
      );
        const finalizedStrikeRunAssignments = host.prepareAirShowPhaseAssignments(
          strikeRunAssignments,
          strikeRunDurationMs,
          [0.18, 0.42, 0.66, 0.86],
          undefined,
        strikeRunRoleSpeeds,
        {
          previousAssignments: previousPhaseAssignments,
          previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 84
          }
        );
      host.collectAirShowFlightTailHeadings(finalizedStrikeRunAssignments, {
        role: "bomber",
        sampleStartProgress: 0.9,
        sampleEndProgress: 1
      }).forEach((headingDegrees, flightId) => {
        egressHeadingByFlightId.set(flightId, headingDegrees);
      });
      recordPhase(
        "target-run",
        finalizedStrikeRunAssignments,
        strikeRunDurationMs,
        strikeRunTracerBursts,
        strikeRunFlakBursts,
        strikeRunRoleSpeeds
      );
      previousPhaseAssignments = finalizedStrikeRunAssignments;
      previousPhaseDurationMs = strikeRunDurationMs;
      if (strikeRunFlakBursts.length > 0) {
        postPassBombers.forEach((flight) =>
          host.syncAirShowFlightStrengthForInspection(
            flight,
            Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)
          )
        );
      }
      updateFlightAnchors([
        ...postPassBombers,
        ...targetRunFighterFlights
      ]);
    }

    const fighterEgressFlights = activeFlights([...interceptorFlights, ...escortFlights]);
    const bomberEgressFlights = activeFlights(bomberFlights).filter(
      (flight) => (flight.currentStrength ?? 0) > 0
    );
    const egressFlights = [...bomberEgressFlights, ...fighterEgressFlights];
    if (egressFlights.length > 0) {
      const egressAssignments = [
        ...buildBomberEgressAssignments(bomberEgressFlights),
        ...buildFighterEgressAssignments(fighterEgressFlights)
      ];
      const egressRoleSpeeds = host.resolveAirShowRoleSpeedMap({
        interceptor: host.airShowFighterSpeedPxPerMs,
        escort: host.airShowFighterSpeedPxPerMs,
        bomber: host.airShowBomberSpeedPxPerMs
      });
      const egressDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
        egressAssignments,
        egressRoleSpeeds,
        scene.egressDurationMs ?? 1080,
        820,
        7000
      );
      const finalizedEgressAssignments = host.prepareAirShowPhaseAssignments(
        egressAssignments,
        egressDurationMs,
        [0.22, 0.5, 0.78],
        42,
        egressRoleSpeeds,
        {
          previousAssignments: previousPhaseAssignments,
          previousDurationMs: previousPhaseDurationMs,
          entryTurnLimitDeg: 72,
          directTurnHomeRoles: ["bomber"]
        }
      );
      recordPhase("egress", finalizedEgressAssignments, egressDurationMs, [], [], egressRoleSpeeds);
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
      hqMidX: (() => {
        const ph = host.resolveHexCenterByKey(scene.playerHqKey);
        const bh = host.resolveHexCenterByKey(scene.botHqKey);
        return ph && bh ? (ph.cx + bh.cx) / 2 : null;
      })(),
      bomberTarget: averageBomberTargetCenter ? { cx: averageBomberTargetCenter.cx, cy: averageBomberTargetCenter.cy } : null,
      originPlan: hqAxis ? buildAirShowInspectionOriginPlan(hqAxis, host.offMapDistancePx) : null,
      phaseTimingAudit,
      flights: runtimeSeedFlights,
      phases
    };
}

