import { HEX_HEIGHT, HEX_WIDTH } from "../../core/balance";
import {
  buildAirShowInspectionOriginPlan,
  buildAirShowPhaseTimingAudit,
  resolveAirShowBoundsRayIntersection,
  resolveAirShowFallbackOrigin
} from "./AirShowPlanner";
import {
  buildAirShowPresetRailPath,
  projectAirShowRailPoint,
  resolveAirShowRailCoordinates,
  resolveAirShowRailLaneOffsetPx
} from "./AirShowRailPlanner";
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
  const resolvePreviousPhaseSampledBoundaryVector = (
    flight: AirShowPlannerFlight,
    sampleWindowMs = 250
  ): { dx: number; dy: number } | null => {
    if ((previousPhaseAssignments?.length ?? 0) <= 0 || previousPhaseDurationMs <= 0) {
      return null;
    }
    const sampledVectors = previousPhaseAssignments
      .filter((assignment) => assignment.actor.flightId === flight.spec.id)
      .map((assignment) => {
        const endSample = host.sampleAirShowAssignmentAtTime(
          assignment,
          previousPhaseDurationMs,
          previousPhaseDurationMs
        );
        const nearEndSample = host.sampleAirShowAssignmentAtTime(
          assignment,
          Math.max(0, previousPhaseDurationMs - sampleWindowMs),
          previousPhaseDurationMs
        );
        const dx = endSample.position.cx - nearEndSample.position.cx;
        const dy = endSample.position.cy - nearEndSample.position.cy;
        return Math.hypot(dx, dy) > 0.5 ? { dx, dy } : null;
      })
      .filter((vector): vector is { dx: number; dy: number } => !!vector);
    if (sampledVectors.length <= 0) {
      return null;
    }
    return {
      dx: sampledVectors.reduce((sum, vector) => sum + vector.dx, 0) / sampledVectors.length,
      dy: sampledVectors.reduce((sum, vector) => sum + vector.dy, 0) / sampledVectors.length
    };
  };
  const resolvePreviousActorSampledBoundaryVector = (
    actorId: string,
    sampleWindowMs = 250
  ): { start: AirShowPoint; dx: number; dy: number } | null => {
    if ((previousPhaseAssignments?.length ?? 0) <= 0 || previousPhaseDurationMs <= 0) {
      return null;
    }
    const previousAssignment = previousPhaseAssignments.find(
      (assignment) => assignment.actor.id === actorId
    );
    if (!previousAssignment) {
      return null;
    }
    const endSample = host.sampleAirShowAssignmentAtTime(
      previousAssignment,
      previousPhaseDurationMs,
      previousPhaseDurationMs
    );
    const nearEndSample = host.sampleAirShowAssignmentAtTime(
      previousAssignment,
      Math.max(0, previousPhaseDurationMs - sampleWindowMs),
      previousPhaseDurationMs
    );
    const dx = endSample.position.cx - nearEndSample.position.cx;
    const dy = endSample.position.cy - nearEndSample.position.cy;
    return Math.hypot(dx, dy) > 0.5
      ? { start: endSample.position, dx, dy }
      : null;
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
        const batteryCenter = burst.batteryHexKey ? host.resolveHexCenterByKey(burst.batteryHexKey) : null;
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
        const rangeReferenceCenter =
          batteryCenter
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
          batteryHexKey: burst.batteryHexKey ?? null,
          sampledBomberCenter: bomberPathCenter ? { cx: bomberPathCenter.cx, cy: bomberPathCenter.cy } : undefined,
          rangeReferenceCenter: { cx: rangeReferenceCenter.cx, cy: rangeReferenceCenter.cy },
          targetCenter: { cx: scopedTargetCenter.cx, cy: scopedTargetCenter.cy },
          targetSource,
          burstCenter: { cx: wave.center.cx, cy: wave.center.cy },
          flashCount: wave.flashCount,
          puffCount: wave.puffCount,
          smokePuffCount: wave.smokePuffCount,
          scale: burst.scale,
          smokeScale: burst.smokeScale,
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
  const buildPlannedAirShowSceneReport = (): PlannedAirShowScene => ({
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
  });
  const visibleBounds = host.resolveAirShowVisibleBounds();
  const sceneVisibleWidthPx = visibleBounds
    ? Math.max(1, visibleBounds.maxX - visibleBounds.minX)
    : 0;
  const compactEgressLaneStepPx =
    visibleBounds && sceneVisibleWidthPx <= 1500
      ? 46
      : 64;
  const scenePlayerHq = host.resolveHexCenterByKey(scene.playerHqKey);
  const sceneBotHq = host.resolveHexCenterByKey(scene.botHqKey);
  const hqMidX =
    scenePlayerHq && sceneBotHq
      ? (scenePlayerHq.cx + sceneBotHq.cx) / 2
      : null;
  const resolveFighterHomePoint = (
    flight: AirShowPlannerFlight,
    index: number,
    totalFlights: number
  ): AirShowPoint => {
    const rand = stageRandom(`fighter-home:${flight.spec.id}:${index}`);
    const laneOffset = (index - (totalFlights - 1) / 2) * compactEgressLaneStepPx;
    const homeFaction =
      flight.spec.role === "interceptor"
        ? "Bot"
        : flight.spec.role === "escort"
          ? "Player"
          : flight.spec.faction;
    const homeHq = homeFaction === "Bot" ? sceneBotHq : scenePlayerHq;
    const sideOrigin = resolveAirShowFallbackOrigin(center, homeFaction, mapBounds, {
      offsetPx: host.offMapDistancePx,
      hexHeight: HEX_HEIGHT
    });
    const resolvedSideOrigin =
      homeHq && mapBounds
        ? {
            cx: sideOrigin.cx,
            cy: host.clamp(homeHq.cy, mapBounds.minY - 220, mapBounds.maxY + 220)
          }
        : sideOrigin;
    return host.offsetAirShowPoint(
      resolvedSideOrigin,
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
  const reinforceCompactFighterTravel = (
    assignments: ReadonlyArray<AirShowPhaseAssignment>,
    durationMs: number,
    minimumSpeedPxPerMs: number,
    focusByFlightId: ReadonlyMap<string, AirShowPoint>,
    options: {
      readonly hasActiveBombers: boolean;
      readonly phase: "merge" | "scramble";
    }
  ): AirShowPhaseAssignment[] =>
    assignments.map((assignment) => {
      if (
        assignment.actor.role !== "interceptor"
        && assignment.actor.role !== "escort"
      ) {
        return assignment;
      }
      if (assignment.points.length < 2 || durationMs <= 0) {
        return assignment;
      }
      const currentTravelPx = host.resolveAirShowAssignmentTraversedPathLengthPx(
        assignment,
        durationMs
      );
      const desiredTravelPx = host.clamp(
        durationMs * minimumSpeedPxPerMs,
        options.phase === "merge" ? 128 : 82,
        options.phase === "merge" ? 174 : 132
      );
      if (currentTravelPx >= desiredTravelPx) {
        return assignment;
      }
      const start = assignment.points[0];
      const end = assignment.points[assignment.points.length - 1];
      if (!start || !end) {
        return assignment;
      }
      const headingForward = resolveHeadingVector(
        assignment.actor.headingDegrees,
        {
          x: end.cx - start.cx,
          y: end.cy - start.cy
        }
      );
      const routeForward = normalizeVector(
        end.cx - start.cx,
        end.cy - start.cy,
        headingForward.x,
        headingForward.y
      );
      const sideSign =
        assignment.actor.role === "interceptor"
          ? assignment.actor.formationIndex % 2 === 0 ? -1 : 1
          : assignment.actor.formationIndex % 2 === 0 ? 1 : -1;
      const lateral = {
        x: -routeForward.y * sideSign,
        y: routeForward.x * sideSign
      };
      const focusPoint = focusByFlightId.get(assignment.actor.flightId) ?? {
        cx: (start.cx + end.cx) * 0.5,
        cy: (start.cy + end.cy) * 0.5
      };
      const routeDistancePx = Math.max(18, Math.hypot(end.cx - start.cx, end.cy - start.cy));
      const deficitPx = desiredTravelPx - currentTravelPx;
      const weavePx = host.clamp(
        deficitPx * (options.phase === "merge" ? 0.72 : 0.82),
        options.phase === "merge" ? 10 : 12,
        options.phase === "merge"
          ? options.hasActiveBombers ? 28 : 34
          : options.hasActiveBombers ? 24 : 30
      );
      const forwardLeadPx = host.clamp(deficitPx * 0.24, 6, options.phase === "merge" ? 22 : 18);
      const midOne = {
        cx:
          start.cx
          + routeForward.x * Math.max(18, routeDistancePx * 0.34)
          + lateral.x * weavePx,
        cy:
          start.cy
          + routeForward.y * Math.max(18, routeDistancePx * 0.34)
          + lateral.y * weavePx
      };
      const midTwo = {
        cx:
          focusPoint.cx * 0.28
          + (start.cx + routeForward.x * Math.max(28, routeDistancePx * 0.66)) * 0.72
          - lateral.x * weavePx * 0.72,
        cy:
          focusPoint.cy * 0.28
          + (start.cy + routeForward.y * Math.max(28, routeDistancePx * 0.66)) * 0.72
          - lateral.y * weavePx * 0.72
      };
      const finalSettle = {
        cx: end.cx - routeForward.x * forwardLeadPx + lateral.x * weavePx * 0.18,
        cy: end.cy - routeForward.y * forwardLeadPx + lateral.y * weavePx * 0.18
      };
      return {
        ...assignment,
        points: [
          start,
          midOne,
          midTwo,
          finalSettle,
          end
        ]
      };
    });
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
      const peelJitterPx = (peelRand() - 0.5) * 10;
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
      const peelSideSign = host.resolveAirShowRouteSideSign(
        current,
        fullEgressPoint,
        egressHeadingDegrees,
        flight.spec.role === "escort" ? 1 : -1
      );
      const currentCenterDx = current.cx - corridor.center.cx;
      const currentCenterDy = current.cy - corridor.center.cy;
      const currentCenterDistancePx = Math.max(1, Math.hypot(currentCenterDx, currentCenterDy));
      const radialOutward =
        currentCenterDistancePx > 1
          ? {
              x: currentCenterDx / currentCenterDistancePx,
              y: currentCenterDy / currentCenterDistancePx
            }
          : {
              x: homeNormal.x * peelSideSign,
              y: homeNormal.y * peelSideSign
            };
      const peelCoverageRatio = flight.spec.role === "escort" ? 1.08 : 0.95;
      const peelMinForwardPx = flight.spec.role === "escort" ? 320 : 260;
      const peelMaxForwardPx = flight.spec.role === "escort" ? 720 : 560;
      const peelForwardPx = host.clamp(
        Math.round(
          durationMs
          * host.airShowFighterSpeedPxPerMs
          * (flight.spec.role === "escort" ? 1.18 : 1.05)
        ),
        peelMinForwardPx,
        Math.max(peelMinForwardPx, Math.min(peelMaxForwardPx, homeDistancePx * peelCoverageRatio))
      );
      const laneOffset = (index - (fighterFlights.length - 1) / 2) * compactEgressLaneStepPx * 0.34;
      let peelLateralPx =
        laneOffset
        + peelSideSign * (flight.spec.role === "escort" ? 52 : 42)
        + peelJitterPx;
      let routeForward = homeForward;
      let routeNormal = homeNormal;
      let peelTarget = host.offsetAirShowPoint(
        current,
        routeForward.x * peelForwardPx + routeNormal.x * peelLateralPx,
        routeForward.y * peelForwardPx + routeNormal.y * peelLateralPx
      );
      const peelTargetCenterDistancePx = Math.hypot(
        peelTarget.cx - corridor.center.cx,
        peelTarget.cy - corridor.center.cy
      );
      const shouldPreserveOutwardPeel =
        currentCenterDistancePx >= 120
        && peelTargetCenterDistancePx < currentCenterDistancePx - (flight.spec.role === "escort" ? 8 : 18);
      if (shouldPreserveOutwardPeel) {
        const outwardBias = flight.spec.role === "escort" ? 0.72 : 0.82;
        const outwardBlend = {
          x: radialOutward.x * outwardBias + headingForward.x * (1 - outwardBias),
          y: radialOutward.y * outwardBias + headingForward.y * (1 - outwardBias)
        };
        const outwardBlendDistance = Math.hypot(outwardBlend.x, outwardBlend.y);
        routeForward =
          outwardBlendDistance > 0.001
            ? {
                x: outwardBlend.x / outwardBlendDistance,
                y: outwardBlend.y / outwardBlendDistance
              }
            : radialOutward;
        routeNormal = { x: -routeForward.y, y: routeForward.x };
        const outwardReferenceTarget = host.offsetAirShowPoint(
          current,
          routeForward.x * peelForwardPx,
          routeForward.y * peelForwardPx
        );
        const outwardSideSign = host.resolveAirShowRouteSideSign(
          current,
          outwardReferenceTarget,
          egressHeadingDegrees,
          peelSideSign
        );
        peelLateralPx =
          laneOffset
          + outwardSideSign * (flight.spec.role === "escort" ? 56 : 48)
          + peelJitterPx * 0.8;
        peelTarget = host.offsetAirShowPoint(
          current,
          routeForward.x * peelForwardPx + routeNormal.x * peelLateralPx,
          routeForward.y * peelForwardPx + routeNormal.y * peelLateralPx
        );
      }
      const peelHomeSideSign = flight.spec.role === "escort" ? -1 : 1;
      const visibleBounds = host.resolveAirShowVisibleBounds();
      const peelMidX = visibleBounds
        ? (visibleBounds.minX + visibleBounds.maxX) / 2
        : (hqMidX ?? corridor.center.cx);
      const minimumPeelSideDistancePx = 430 + Math.abs(fighterHomeLaneContext.index) * 26;
      const rawSideCommittedPeelX =
        peelMidX + peelHomeSideSign * minimumPeelSideDistancePx;
      const sideCommittedPeelX = visibleBounds
        ? host.clamp(
            rawSideCommittedPeelX,
            visibleBounds.minX + 54,
            visibleBounds.maxX - 54
          )
        : rawSideCommittedPeelX;
      const commitPeelTargetToHomeSide = (point: AirShowPoint): AirShowPoint => ({
        ...point,
        cx:
          peelHomeSideSign < 0
            ? Math.min(point.cx, sideCommittedPeelX)
            : Math.max(point.cx, sideCommittedPeelX)
      });
      peelTarget = commitPeelTargetToHomeSide(peelTarget);
      const minimumRadialPeelDistancePx =
        currentCenterDistancePx + (flight.spec.role === "escort" ? 110 : 92);
      const peelTargetRadialDistancePx = Math.hypot(
        peelTarget.cx - corridor.center.cx,
        peelTarget.cy - corridor.center.cy
      );
      if (peelTargetRadialDistancePx < minimumRadialPeelDistancePx) {
        peelTarget = commitPeelTargetToHomeSide(
          host.offsetAirShowPoint(
            corridor.center,
            radialOutward.x * minimumRadialPeelDistancePx,
            radialOutward.y * minimumRadialPeelDistancePx
          )
        );
      }
      const routeSideSign = host.resolveAirShowRouteSideSign(
        current,
        peelTarget,
        egressHeadingDegrees,
        flight.spec.role === "escort" ? 1 : -1
      );
      const headingRouteDot = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
      const peelCarryPx = Math.min(Math.max(38, peelForwardPx * 0.18), Math.max(72, peelForwardPx * 0.3));
      const peelPathSource =
        headingRouteDot < 0.1
          ? [
              current,
              host.offsetAirShowPoint(
                current,
                headingForward.x * (peelCarryPx * 0.36) + routeNormal.x * routeSideSign * 22,
                headingForward.y * (peelCarryPx * 0.36) + routeNormal.y * routeSideSign * 22
              ),
              host.offsetAirShowPoint(
                current,
                headingForward.x * peelCarryPx + routeNormal.x * routeSideSign * (Math.abs(peelLateralPx) * 0.78 + 22),
                headingForward.y * peelCarryPx + routeNormal.y * routeSideSign * (Math.abs(peelLateralPx) * 0.78 + 22)
              ),
              host.offsetAirShowPoint(
                current,
                routeForward.x * Math.max(58, peelForwardPx * 0.46) + routeNormal.x * peelLateralPx,
                routeForward.y * Math.max(58, peelForwardPx * 0.46) + routeNormal.y * peelLateralPx
              ),
              host.offsetAirShowPoint(
                current,
                routeForward.x * Math.max(112, peelForwardPx * 0.82) + routeNormal.x * peelLateralPx * 0.42,
                routeForward.y * Math.max(112, peelForwardPx * 0.82) + routeNormal.y * peelLateralPx * 0.42
              ),
              peelTarget
            ]
          : buildForwardContinuousRoutePath(current, peelTarget, {
              startHeadingDegrees: egressHeadingDegrees,
              lateralSign: routeSideSign,
              minRouteDot: -0.25,
              carryForwardPx: peelCarryPx,
              earlyAlongPx: Math.max(52, peelForwardPx * 0.38),
              midAlongPx: Math.max(90, peelForwardPx * 0.7),
              lateAlongPx: Math.max(126, peelForwardPx * 0.9),
              entryLateralPx: Math.abs(peelLateralPx) + 34,
              midLateralPx: Math.abs(peelLateralPx) * 0.56 + 18,
              lateLateralPx: Math.abs(peelLateralPx) * 0.18 + 8
            });
      const stabilizedPeelPathSource = [
        current,
        host.offsetAirShowPoint(
          current,
          headingForward.x * 58,
          headingForward.y * 58
        ),
        host.offsetAirShowPoint(
          current,
          headingForward.x * 118 + routeNormal.x * routeSideSign * 8,
          headingForward.y * 118 + routeNormal.y * routeSideSign * 8
        ),
        host.offsetAirShowPoint(
          current,
          headingForward.x * 168 + routeNormal.x * routeSideSign * 18,
          headingForward.y * 168 + routeNormal.y * routeSideSign * 18
        ),
        ...peelPathSource.slice(1).filter((point) =>
          Math.hypot(point.cx - current.cx, point.cy - current.cy) > 96
        )
      ];
      const peelPath = host.sanitizeAirShowEntryPath(
        stabilizedPeelPathSource,
        {
          maxTurnDeg: 54,
          strongTurnDeg: 94,
          maxFirstSegmentPx: 92,
          maxSharpTurnDeg: 128,
          maxWaypointsToRemove: 0
        }
      );
      return host.buildAirShowFlightAssignments(
        flight,
        peelPath,
        0.24,
        index,
        fighterFlights.length
      ).map((assignment) => {
        const previousInspectionAssignment = phases[phases.length - 1]?.assignments.find(
          (candidate) => candidate.actorId === assignment.actor.id
        );
        const previousInspectionEnd =
          previousInspectionAssignment?.sampledPositions[
            previousInspectionAssignment.sampledPositions.length - 1
          ] ?? null;
        const previousAssignment = previousPhaseAssignments.find(
          (candidate) => candidate.actor.id === assignment.actor.id
        );
        const previousEnd = previousInspectionEnd
          ? { cx: previousInspectionEnd.cx, cy: previousInspectionEnd.cy }
          : previousAssignment
            ? host.sampleAirShowAssignmentAtTime(
                previousAssignment,
                previousPhaseDurationMs,
                previousPhaseDurationMs
              ).position
            : null;
        const plannedStart = assignment.points[0] ?? assignment.actor.position;
        const continuityDx = previousEnd ? previousEnd.cx - plannedStart.cx : 0;
        const continuityDy = previousEnd ? previousEnd.cy - plannedStart.cy : 0;
        const continuousPoints =
          previousEnd && Math.hypot(continuityDx, continuityDy) > 0.5
            ? assignment.points.map((point) => ({
                cx: point.cx + continuityDx,
                cy: point.cy + continuityDy
              }))
            : assignment.points;
        const anchoredPeelPoints =
          previousEnd && Math.hypot(continuityDx, continuityDy) > 0.5
            ? assignment.points.map((point, pointIndex) => {
                const release =
                  pointIndex / Math.max(1, assignment.points.length - 1);
                const continuityWeight = (1 - release) * (1 - release);
                const shiftedPoint = {
                  cx: point.cx + continuityDx * continuityWeight,
                  cy: point.cy + continuityDy * continuityWeight
                };
                if (pointIndex === 0) {
                  return shiftedPoint;
                }
                const homeSideWeight = release * release;
                const sideCommittedCx =
                  peelHomeSideSign < 0
                    ? Math.min(shiftedPoint.cx, sideCommittedPeelX)
                    : Math.max(shiftedPoint.cx, sideCommittedPeelX);
                return {
                  ...shiftedPoint,
                  cx:
                    shiftedPoint.cx
                    + (sideCommittedCx - shiftedPoint.cx) * homeSideWeight
                };
              })
            : continuousPoints;
        return {
          ...assignment,
          actor:
            previousEnd && Math.hypot(continuityDx, continuityDy) > 0.5
              ? {
                  ...assignment.actor,
                  position: previousEnd
                }
              : assignment.actor,
          points: anchoredPeelPoints,
          progressTimeline: [
            { timeMs: 0, progress: 0 },
            { timeMs: Math.round(durationMs * 0.22), progress: 0.58 },
            { timeMs: Math.round(durationMs * 0.5), progress: 1 },
            { timeMs: durationMs, progress: 1 }
          ]
        };
      });
    });
  const buildFighterEgressAssignments = (
    fighterFlights: ReadonlyArray<AirShowPlannerFlight>
  ): AirShowPhaseAssignment[] =>
    fighterFlights.flatMap((flight, index) => {
      const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const rand = stageRandom(`fighter-egress:${flight.spec.id}:${index}`);
      const fighterHomeLaneContext = resolveFighterHomeLaneContext(flight, fighterFlights);
      const phaseBoundaryHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
        flight,
        host.resolveAirShowFlightHeadingDegrees(flight)
      );
      const egressHeadingDegrees = phaseBoundaryHeadingDegrees;
      const baseEgressPoint = resolveFighterHomePoint(
        flight,
        fighterHomeLaneContext.index,
        fighterHomeLaneContext.totalFlights
      );
      const egressPoint = baseEgressPoint;
      const egressLateralSign = host.resolveAirShowRouteSideSign(
        current,
        egressPoint,
        egressHeadingDegrees,
        flight.spec.role === "escort" ? 1 : -1
      );
      const homeDx = egressPoint.cx - current.cx;
      const homeDy = egressPoint.cy - current.cy;
      const homeDistancePx = Math.max(1, Math.hypot(homeDx, homeDy));
      const homeForward = normalizeVector(homeDx, homeDy, 0, -1);
      const headingForward = resolveHeadingVector(phaseBoundaryHeadingDegrees, homeForward);
      const headingRouteDot = headingForward.x * homeForward.x + headingForward.y * homeForward.y;
      const homeSideSign =
        hqMidX === null
          ? (egressPoint.cx >= current.cx ? 1 : -1)
          : (egressPoint.cx >= hqMidX ? 1 : -1);
      const mustCrossHomeSide =
        hqMidX !== null
        && (
          homeSideSign < 0
            ? current.cx > hqMidX - 72
            : current.cx < hqMidX + 72
        );
      const rawEgressPath =
        mustCrossHomeSide
          ? buildForwardContinuousRoutePath(current, egressPoint, {
              startHeadingDegrees: egressHeadingDegrees,
              lateralSign: egressLateralSign,
              minRouteDot: -0.18,
              carryForwardPx: flight.spec.role === "escort" ? 62 : 70,
              earlyAlongPx: Math.max(96, homeDistancePx * 0.24),
              midAlongPx: Math.max(168, homeDistancePx * 0.5),
              lateAlongPx: Math.max(236, homeDistancePx * 0.78),
              entryLateralPx: 18 + rand() * 6,
              midLateralPx: 12 + rand() * 4,
              lateLateralPx: 5 + rand() * 2
            })
          : headingRouteDot > -0.14 && homeDistancePx <= 420
          ? buildForwardContinuousRoutePath(current, egressPoint, {
              startHeadingDegrees: egressHeadingDegrees,
              lateralSign: egressLateralSign,
              minRouteDot: -0.22,
              carryForwardPx: 50 + rand() * 16,
              earlyAlongPx: Math.max(76, homeDistancePx * 0.3),
              midAlongPx: Math.max(132, homeDistancePx * 0.58),
              lateAlongPx: Math.max(184, homeDistancePx * 0.84),
              entryLateralPx: 18 + rand() * 7,
              midLateralPx: 8 + rand() * 4,
              lateLateralPx: 3 + rand() * 2
            })
          : host.buildAirShowDisengagePath(current, egressPoint, {
              startHeadingDegrees: egressHeadingDegrees,
              lateralSign: egressLateralSign,
              corridorWidthPx: flight.spec.role === "escort" ? 15 + rand() * 4 : 13 + rand() * 4,
              driftPx: flight.spec.role === "escort" ? 10 + rand() * 4 : 8 + rand() * 3,
              preferForwardContinuous: true
            });
      const egressPath = host.sanitizeAirShowEntryPath(
        bridgePathToPreviousPhaseMotion(
          flight,
          rawEgressPath,
          flight.spec.role === "escort" ? 34 : 42
        ),
        {
          maxTurnDeg: 44,
          strongTurnDeg: 78,
          maxFirstSegmentPx: 72,
          maxSharpTurnDeg: 104,
          maxWaypointsToRemove: 3
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
  const buildSmoothHomeSideFighterEgressPath = (
    points: ReadonlyArray<AirShowPoint>,
    homeSideSign: number
  ): AirShowPoint[] => {
    if (points.length < 3) {
      return [...points];
    }
    const start = points[0]!;
    const rawSecond = points[1]!;
    const rawEnd = points[points.length - 1]!;
    const sideSign = homeSideSign >= 0 ? 1 : -1;
    const minimumHomeAdvancePx = 220;
    const endSignedX = rawEnd.cx * sideSign;
    const minimumSignedX = start.cx * sideSign + minimumHomeAdvancePx;
    const end = {
      cx: endSignedX < minimumSignedX ? minimumSignedX * sideSign : rawEnd.cx,
      cy: rawEnd.cy
    };
    const dx = end.cx - start.cx;
    const dy = end.cy - start.cy;
    const distancePx = Math.max(1, Math.hypot(dx, dy));
    const routeForward = normalizeVector(dx, dy, sideSign, 0);
    const initialVector = normalizeVector(
      rawSecond.cx - start.cx,
      rawSecond.cy - start.cy,
      routeForward.x,
      routeForward.y
    );
    const alignment = initialVector.x * routeForward.x + initialVector.y * routeForward.y;
    const entryForward =
      alignment < -0.05
        ? routeForward
        : normalizeVector(
            initialVector.x * 0.62 + routeForward.x * 0.38,
            initialVector.y * 0.62 + routeForward.y * 0.38,
            routeForward.x,
            routeForward.y
          );
    const entryHandlePx = host.clamp(
      Math.hypot(rawSecond.cx - start.cx, rawSecond.cy - start.cy) * 1.45,
      42,
      Math.min(112, distancePx * 0.34)
    );
    const exitHandlePx = host.clamp(distancePx * 0.22, 58, 132);
    const controlA = {
      cx: start.cx + entryForward.x * entryHandlePx,
      cy: start.cy + entryForward.y * entryHandlePx
    };
    const controlB = {
      cx: end.cx - routeForward.x * exitHandlePx,
      cy: end.cy - routeForward.y * exitHandlePx
    };
    const curveSamples = [0, 0.14, 0.3, 0.52, 0.76, 1].map((t) => {
      const u = 1 - t;
      return {
        cx:
          u * u * u * start.cx
          + 3 * u * u * t * controlA.cx
          + 3 * u * t * t * controlB.cx
          + t * t * t * end.cx,
        cy:
          u * u * u * start.cy
          + 3 * u * u * t * controlA.cy
          + 3 * u * t * t * controlB.cy
          + t * t * t * end.cy
      };
    });
    let bestSignedX = curveSamples[0]!.cx * sideSign;
    const homeSidePoints = curveSamples.map((point, index) => {
      if (index === 0) {
        return point;
      }
      const minimumStepPx = index === curveSamples.length - 1 ? 0 : 6;
      const signedX = point.cx * sideSign;
      const correctedSignedX = Math.max(signedX, bestSignedX + minimumStepPx);
      bestSignedX = correctedSignedX;
      return {
        cx: correctedSignedX * sideSign,
        cy: point.cy
      };
    });
    return host.sanitizeAirShowEntryPath(homeSidePoints, {
      maxTurnDeg: 36,
      strongTurnDeg: 70,
      maxFirstSegmentPx: 74,
      maxSharpTurnDeg: 92,
      maxWaypointsToRemove: 2
    });
  };
  const buildBomberEgressAssignments = (
    bomberFlightsForPhase: ReadonlyArray<AirShowPlannerFlight>
  ): AirShowPhaseAssignment[] =>
    bomberFlightsForPhase.flatMap((flight, index) => {
      const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const rand = stageRandom(`bomber-egress:${flight.spec.id}:${index}`);
      const sampledBoundaryVector = resolvePreviousPhaseSampledBoundaryVector(flight);
      const sampledBoundaryHeadingDegrees =
        sampledBoundaryVector && Math.hypot(sampledBoundaryVector.dx, sampledBoundaryVector.dy) > 0.5
          ? ((Math.atan2(sampledBoundaryVector.dy, sampledBoundaryVector.dx) * 180) / Math.PI + 90 + 360) % 360
          : null;
      const egressHeadingDegrees =
        sampledBoundaryHeadingDegrees
        ?? egressHeadingByFlightId.get(flight.spec.id)
        ?? host.resolveAirShowFlightHeadingDegrees(flight);
      const phaseBoundaryHeadingDegrees =
        sampledBoundaryHeadingDegrees ?? host.resolveAirShowFlightHeadingDegrees(flight);
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
      const headingForward =
        sampledBoundaryVector && Math.hypot(sampledBoundaryVector.dx, sampledBoundaryVector.dy) > 0.5
          ? normalizeVector(sampledBoundaryVector.dx, sampledBoundaryVector.dy, homeForward.x, homeForward.y)
          : resolveHeadingVector(phaseBoundaryHeadingDegrees, homeForward);
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
      const continuityPoint = host.offsetAirShowPoint(
        current,
        headingForward.x * 96 + corridor.normal.x * (rand() - 0.5) * 10,
        headingForward.y * 96 + corridor.normal.y * (rand() - 0.5) * 10
      );
      const continuousEgressPath = [
        current,
        continuityPoint,
        ...egressPath.slice(1)
      ].filter((point, pointIndex, path) => {
        if (pointIndex === 0) {
          return true;
        }
        const previous = path[pointIndex - 1];
        return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
      });
      return host.buildAirShowFlightAssignments(
        flight,
        continuousEgressPath,
        0.18,
        index,
        bomberFlightsForPhase.length
      );
    });

  const buildCorridorContestedAirShowPlan = (): PlannedAirShowScene | null => {
    if (bomberFlights.length <= 0 || interceptorFlights.length <= 0) {
      return null;
    }

    type CorridorPhaseLabel =
      | "fighter-ingress"
      | "escort-clash-merge"
      | "escort-clash-scramble"
      | "bomber-ingress"
      | "bomber-defense-pass";
    type FighterEngagementGroup = {
      interceptorFlights: AirShowRuntimeFlightInternal[];
      escortFlights: AirShowRuntimeFlightInternal[];
      lane: number;
    };
    type BomberCorridorPlan = {
      flight: AirShowRuntimeFlightInternal;
      preTargetPath: AirShowPoint[];
      targetRunPath: AirShowPoint[];
      targetCenter: AirShowPoint;
    };

    const measurePathLength = (points: ReadonlyArray<AirShowPoint>): number => {
      let lengthPx = 0;
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous && current) {
          lengthPx += Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
        }
      }
      return lengthPx;
    };
    const dedupePath = (points: ReadonlyArray<AirShowPoint>): AirShowPoint[] =>
      points.filter((point, index) => {
        const previous = index > 0 ? points[index - 1] : null;
        return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
      });
    const separatePhaseEndAssignments = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      minimumDistancePx: number
    ): AirShowPhaseAssignment[] => {
      const resolvedAssignments = assignments.map((assignment) => ({
        ...assignment,
        points: [...assignment.points]
      }));
      for (let iteration = 0; iteration < 4; iteration += 1) {
        let adjusted = false;
        for (let leftIndex = 0; leftIndex < resolvedAssignments.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < resolvedAssignments.length; rightIndex += 1) {
            const left = resolvedAssignments[leftIndex]!;
            const right = resolvedAssignments[rightIndex]!;
            if (
              !left.actor.active ||
              !right.actor.active ||
              left.actor.flightId === right.actor.flightId ||
              left.actor.role !== right.actor.role ||
              left.points.length < 2 ||
              right.points.length < 2
            ) {
              continue;
            }
            const leftEndIndex = left.points.length - 1;
            const rightEndIndex = right.points.length - 1;
            const leftEnd = left.points[leftEndIndex]!;
            const rightEnd = right.points[rightEndIndex]!;
            const dx = rightEnd.cx - leftEnd.cx;
            const dy = rightEnd.cy - leftEnd.cy;
            const distancePx = Math.hypot(dx, dy);
            if (distancePx >= minimumDistancePx || distancePx < 0) {
              continue;
            }
            const fallbackSign = left.actor.formationIndex <= right.actor.formationIndex ? -1 : 1;
            const separation = normalizeVector(
              dx,
              dy,
              corridor.normal.x * fallbackSign,
              corridor.normal.y * fallbackSign
            );
            const correctionPx = (minimumDistancePx - Math.max(0.1, distancePx)) * 0.58;
            const applyEndOffset = (
              assignment: AirShowPhaseAssignment,
              sign: number
            ): void => {
              const lastIndex = assignment.points.length - 1;
              const previousIndex = assignment.points.length - 2;
              const last = assignment.points[lastIndex];
              const previous = assignment.points[previousIndex];
              if (last) {
                assignment.points[lastIndex] = {
                  cx: last.cx + separation.x * correctionPx * sign,
                  cy: last.cy + separation.y * correctionPx * sign
                };
              }
              if (previous) {
                assignment.points[previousIndex] = {
                  cx: previous.cx + separation.x * correctionPx * sign * 0.35,
                  cy: previous.cy + separation.y * correctionPx * sign * 0.35
                };
              }
            };
            applyEndOffset(left, -1);
            applyEndOffset(right, 1);
            adjusted = true;
          }
        }
        if (!adjusted) {
          break;
        }
      }
      return resolvedAssignments;
    };
    const pointAtPathDistance = (points: ReadonlyArray<AirShowPoint>, distancePx: number): AirShowPoint => {
      if (points.length <= 0) {
        return { cx: center.cx, cy: center.cy };
      }
      const clampedDistancePx = host.clamp(distancePx, 0, measurePathLength(points));
      let traversedPx = 0;
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
        if (traversedPx + segmentLengthPx >= clampedDistancePx) {
          const ratio = host.clamp((clampedDistancePx - traversedPx) / segmentLengthPx, 0, 1);
          return {
            cx: previous.cx + (current.cx - previous.cx) * ratio,
            cy: previous.cy + (current.cy - previous.cy) * ratio
          };
        }
        traversedPx += segmentLengthPx;
      }
      return { ...points[points.length - 1]! };
    };
    const resolveClosestDistanceOnPath = (
      points: ReadonlyArray<AirShowPoint>,
      point: AirShowPoint
    ): number => {
      if (points.length < 2) {
        return 0;
      }
      let traversedPx = 0;
      let closestDistancePx = 0;
      let closestDistanceSquared = Number.POSITIVE_INFINITY;
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (!previous || !current) {
          continue;
        }
        const dx = current.cx - previous.cx;
        const dy = current.cy - previous.cy;
        const segmentLengthSquared = dx * dx + dy * dy;
        if (segmentLengthSquared <= 0.0001) {
          continue;
        }
        const segmentLengthPx = Math.sqrt(segmentLengthSquared);
        const t = host.clamp(
          ((point.cx - previous.cx) * dx + (point.cy - previous.cy) * dy) / segmentLengthSquared,
          0,
          1
        );
        const projected = {
          cx: previous.cx + dx * t,
          cy: previous.cy + dy * t
        };
        const distanceSquared =
          Math.pow(point.cx - projected.cx, 2) + Math.pow(point.cy - projected.cy, 2);
        if (distanceSquared < closestDistanceSquared) {
          closestDistanceSquared = distanceSquared;
          closestDistancePx = traversedPx + segmentLengthPx * t;
        }
        traversedPx += segmentLengthPx;
      }
      return closestDistancePx;
    };
    const slicePathByDistanceRange = (
      points: ReadonlyArray<AirShowPoint>,
      startDistancePx: number,
      endDistancePx: number
    ): AirShowPoint[] => {
      const totalLengthPx = measurePathLength(points);
      if (points.length < 2 || totalLengthPx <= 0.5) {
        return [...points];
      }
      const startPx = host.clamp(startDistancePx, 0, totalLengthPx);
      const endPx = host.clamp(endDistancePx, startPx, totalLengthPx);
      const sliced: AirShowPoint[] = [pointAtPathDistance(points, startPx)];
      let traversedPx = 0;
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (!previous || !current) {
          continue;
        }
        const segmentLengthPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
        const segmentEndPx = traversedPx + segmentLengthPx;
        if (segmentEndPx > startPx + 0.001 && segmentEndPx < endPx - 0.001) {
          sliced.push({ ...current });
        }
        traversedPx = segmentEndPx;
      }
      sliced.push(pointAtPathDistance(points, endPx));
      return dedupePath(sliced);
    };
    const smoothCorridorPath = (
      start: AirShowPoint,
      end: AirShowPoint,
      lateralDriftPx = 0
    ): AirShowPoint[] => {
      const startProjection = host.resolveAirShowCorridorCoordinates(corridor, start);
      const endProjection = host.resolveAirShowCorridorCoordinates(corridor, end);
      return dedupePath([
        start,
        host.projectAirShowCorridorPoint(
          corridor,
          startProjection.alongPx * 0.62 + endProjection.alongPx * 0.38,
          startProjection.lateralPx * 0.62 + endProjection.lateralPx * 0.38 + lateralDriftPx * 0.7
        ),
        host.projectAirShowCorridorPoint(
          corridor,
          startProjection.alongPx * 0.28 + endProjection.alongPx * 0.72,
          startProjection.lateralPx * 0.28 + endProjection.lateralPx * 0.72 + lateralDriftPx * 0.35
        ),
        end
      ]);
    };
    const buildSpeedMatchedCorridorPath = (
      start: AirShowPoint,
      preferredEnd: AirShowPoint,
      durationMs: number,
      speedPxPerMs: number,
      lateralSign: number
    ): AirShowPoint[] => {
      const targetLengthPx = Math.max(32, Math.max(1, durationMs) * speedPxPerMs);
      const directDx = preferredEnd.cx - start.cx;
      const directDy = preferredEnd.cy - start.cy;
      const directLengthPx = Math.hypot(directDx, directDy);
      const travel = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
      const normal = { x: -travel.y, y: travel.x };
      if (directLengthPx >= targetLengthPx - 1) {
        return dedupePath([
          start,
          {
            cx: start.cx + travel.x * targetLengthPx,
            cy: start.cy + travel.y * targetLengthPx
          }
        ]);
      }

      const thirdPx = Math.max(1, directLengthPx / 3);
      const solvedLateralPx = Math.sqrt(
        Math.max(0, Math.pow((targetLengthPx - thirdPx) / 2, 2) - thirdPx * thirdPx)
      );
      const lateralPx = host.clamp(solvedLateralPx, 0, 142);
      const path = dedupePath([
        start,
        {
          cx: start.cx + travel.x * directLengthPx * 0.34 + normal.x * lateralSign * lateralPx,
          cy: start.cy + travel.y * directLengthPx * 0.34 + normal.y * lateralSign * lateralPx
        },
        {
          cx: start.cx + travel.x * directLengthPx * 0.68 + normal.x * lateralSign * lateralPx * 0.88,
          cy: start.cy + travel.y * directLengthPx * 0.68 + normal.y * lateralSign * lateralPx * 0.88
        },
        preferredEnd
      ]);
      const measuredLengthPx = measurePathLength(path);
      if (measuredLengthPx >= targetLengthPx - 6) {
        return path;
      }
      const extraForwardPx = Math.min(92, targetLengthPx - measuredLengthPx);
      return dedupePath([
        start,
        path[1] ?? start,
        path[2] ?? preferredEnd,
        {
          cx: preferredEnd.cx + travel.x * extraForwardPx,
          cy: preferredEnd.cy + travel.y * extraForwardPx
        }
      ]);
    };
    const buildSpeedMatchedPassPath = (
      start: AirShowPoint,
      passPoint: AirShowPoint,
      durationMs: number,
      speedPxPerMs: number,
      lateralSign: number
    ): AirShowPoint[] => {
      const targetLengthPx = Math.max(64, Math.max(1, durationMs) * speedPxPerMs);
      const forward = normalizeVector(passPoint.cx - start.cx, passPoint.cy - start.cy, corridor.axis.x, corridor.axis.y);
      const normal = { x: -forward.y, y: forward.x };
      const approachPoint = {
        cx: start.cx + forward.x * Math.min(84, targetLengthPx * 0.22),
        cy: start.cy + forward.y * Math.min(84, targetLengthPx * 0.22)
      };
      const basePath = dedupePath([start, approachPoint, passPoint]);
      const baseLengthPx = measurePathLength(basePath);
      if (baseLengthPx >= targetLengthPx - 6) {
        return basePath;
      }
      const exitDistancePx = Math.max(96, targetLengthPx - baseLengthPx);
      return dedupePath([
        ...basePath,
        {
          cx: passPoint.cx + forward.x * exitDistancePx + normal.x * lateralSign * Math.min(52, exitDistancePx * 0.18),
          cy: passPoint.cy + forward.y * exitDistancePx + normal.y * lateralSign * Math.min(52, exitDistancePx * 0.18)
        }
      ]);
    };
    const buildAssignmentsForFlightPath = (
      flight: AirShowRuntimeFlightInternal,
      path: ReadonlyArray<AirShowPoint>,
      headingBlend: number
    ): AirShowPhaseAssignment[] => {
      const resolvedPath = dedupePath(path);
      if (resolvedPath.length < 2) {
        const start = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        resolvedPath.push(host.offsetAirShowPoint(start, corridor.axis.x, corridor.axis.y));
      }
      return host.buildAirShowFlightAssignments(
        flight,
        resolvedPath,
        headingBlend,
        0,
        1,
        { phaseStartAnchor: resolvedPath[0] }
      );
    };
    const bomberPlans = bomberFlights.map((bomberFlight, index): BomberCorridorPlan => {
      const profile = initialBomberApproachProfilesById.get(bomberFlight.spec.id);
      const start = host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
      const laneIndex = profile?.laneIndex ?? (bomberFlights.length <= 1 ? 0 : index - (bomberFlights.length - 1) / 2);
      const targetCenter =
        profile?.targetCenter
        ?? bomberTargetCentersById.get(bomberFlight.spec.id)
        ?? averageBomberTargetCenter
        ?? corridor.strike;
      const laneOffsetPx = laneIndex * 22 + (bomberFlight.spec.laneOffsetPx ?? 0) * 0.35;
      const turnEntry = host.offsetAirShowPoint(
        targetCenter,
        -corridor.axis.x * 78 + corridor.normal.x * laneOffsetPx,
        -corridor.axis.y * 78 + corridor.normal.y * laneOffsetPx
      );
      const turnSideSign = laneIndex >= 0 ? 1 : -1;
      const nearTarget = host.offsetAirShowPoint(
        targetCenter,
        -corridor.axis.x * 34 + corridor.normal.x * laneOffsetPx,
        -corridor.axis.y * 34 + corridor.normal.y * laneOffsetPx
      );
      const releasePoint = host.offsetAirShowPoint(
        targetCenter,
        corridor.normal.x * laneOffsetPx,
        corridor.normal.y * laneOffsetPx
      );
      const turnApex = host.offsetAirShowPoint(
        targetCenter,
        corridor.axis.x * 18 + corridor.normal.x * (laneOffsetPx + turnSideSign * 76),
        corridor.axis.y * 18 + corridor.normal.y * (laneOffsetPx + turnSideSign * 76)
      );
      const turnExit = host.offsetAirShowPoint(
        targetCenter,
        corridor.axis.x * 28 + corridor.normal.x * (laneOffsetPx + turnSideSign * 126),
        corridor.axis.y * 28 + corridor.normal.y * (laneOffsetPx + turnSideSign * 126)
      );
      return {
        flight: bomberFlight,
        preTargetPath: smoothCorridorPath(start, turnEntry, laneIndex * 8),
        targetRunPath: dedupePath([turnEntry, nearTarget, releasePoint, turnApex, turnExit]),
        targetCenter
      };
    });
    const preTargetPhaseWeights = new Map<CorridorPhaseLabel, number>([
      ["fighter-ingress", 0.2],
      ["escort-clash-merge", 0.2],
      ["escort-clash-scramble", 0.2],
      ["bomber-ingress", 0.185],
      ["bomber-defense-pass", 0.215]
    ]);
    const orderedPreTargetPhaseLabels: CorridorPhaseLabel[] = [
      "fighter-ingress",
      "escort-clash-merge",
      "escort-clash-scramble",
      "bomber-ingress",
      "bomber-defense-pass"
    ];
    const totalPreTargetPhaseWeight = orderedPreTargetPhaseLabels.reduce(
      (sum, label) => sum + Math.max(0, preTargetPhaseWeights.get(label) ?? 0),
      0
    );
    const preTargetPhaseWindows = new Map<CorridorPhaseLabel, [number, number]>();
    let elapsedPreTargetWeight = 0;
    orderedPreTargetPhaseLabels.forEach((label) => {
      const phaseWeight = Math.max(0, preTargetPhaseWeights.get(label) ?? 0);
      const startProgress =
        totalPreTargetPhaseWeight > 0 ? elapsedPreTargetWeight / totalPreTargetPhaseWeight : 0;
      elapsedPreTargetWeight += phaseWeight;
      const endProgress =
        totalPreTargetPhaseWeight > 0 ? elapsedPreTargetWeight / totalPreTargetPhaseWeight : startProgress;
      preTargetPhaseWindows.set(label, [host.clamp(startProgress, 0, 1), host.clamp(endProgress, startProgress, 1)]);
    });
    const resolveBomberPhasePath = (plan: BomberCorridorPlan, label: CorridorPhaseLabel): AirShowPoint[] => {
      const [startProgress, endProgress] = preTargetPhaseWindows.get(label) ?? [0, 1];
      const lengthPx = measurePathLength(plan.preTargetPath);
      const staticStartDistancePx = lengthPx * startProgress;
      const staticEndDistancePx = lengthPx * endProgress;
      const current = host.averageAirShowPosition(plan.flight.actors) ?? plan.flight.anchor;
      const currentDistancePx = resolveClosestDistanceOnPath(plan.preTargetPath, current);
      const startDistancePx = Math.max(staticStartDistancePx, currentDistancePx);
      const segmentLengthPx = Math.max(1, staticEndDistancePx - staticStartDistancePx);
      const endDistancePx = Math.min(lengthPx, Math.max(staticEndDistancePx, startDistancePx + segmentLengthPx));
      const path = slicePathByDistanceRange(plan.preTargetPath, startDistancePx, endDistancePx);
      return path.length > 0
        ? dedupePath([current, ...path.slice(1)])
        : [current];
    };
    const seedPhaseDurationMs = (label: CorridorPhaseLabel): number => {
      const longestPathPx = bomberPlans.reduce(
        (longest, plan) => Math.max(longest, measurePathLength(resolveBomberPhasePath(plan, label))),
        0
      );
      return Math.max(1, Math.round(longestPathPx / host.airShowBomberSpeedPxPerMs));
    };
    const seedDurationByPhase = new Map<CorridorPhaseLabel, number>([
      ["fighter-ingress", seedPhaseDurationMs("fighter-ingress")],
      ["escort-clash-merge", seedPhaseDurationMs("escort-clash-merge")],
      ["escort-clash-scramble", seedPhaseDurationMs("escort-clash-scramble")],
      ["bomber-ingress", seedPhaseDurationMs("bomber-ingress")],
      ["bomber-defense-pass", seedPhaseDurationMs("bomber-defense-pass")]
    ]);
    const targetRunDurationMs = Math.max(
      1,
      Math.round(
        bomberPlans.reduce((longest, plan) => Math.max(longest, measurePathLength(plan.targetRunPath)), 0)
        / host.airShowBomberSpeedPxPerMs
      )
    );
    const roleSpeeds = host.resolveAirShowRoleSpeedMap({
      interceptor: host.airShowFighterSpeedPxPerMs,
      escort: host.airShowFighterSpeedPxPerMs,
      bomber: host.airShowBomberSpeedPxPerMs
    });
    const buildBomberPhaseAssignments = (label: CorridorPhaseLabel): AirShowPhaseAssignment[] =>
      bomberPlans.flatMap((plan) => buildAssignmentsForFlightPath(plan.flight, resolveBomberPhasePath(plan, label), 0.22));
    const averageBomberPointAtPreTargetProgress = (progress: number): AirShowPoint =>
      host.averageAirShowPoints(
        bomberPlans.map((plan) =>
          pointAtPathDistance(plan.preTargetPath, measurePathLength(plan.preTargetPath) * host.clamp(progress, 0, 1))
        )
      )
      ?? corridor.strike;
    const bomberPhaseFocusPoint = (
      plan: BomberCorridorPlan,
      label: CorridorPhaseLabel,
      progress: number
    ): AirShowPoint => {
      const phasePath = resolveBomberPhasePath(plan, label);
      return pointAtPathDistance(phasePath, measurePathLength(phasePath) * host.clamp(progress, 0, 1));
    };
    const averageBomberPointAtPhaseProgress = (label: CorridorPhaseLabel, progress: number): AirShowPoint =>
      host.averageAirShowPoints(
        bomberPlans.map((plan) => bomberPhaseFocusPoint(plan, label, progress))
      )
      ?? averageBomberPointAtPreTargetProgress(progress);
    const fighterClashCenter = (groupLane: number, leadPx = 0): AirShowPoint =>
      host.offsetAirShowPoint(
        corridor.merge,
        corridor.axis.x * leadPx + corridor.normal.x * groupLane * 58,
        corridor.axis.y * leadPx + corridor.normal.y * groupLane * 58
      );
    const blendAirShowPoints = (start: AirShowPoint, end: AirShowPoint, progress: number): AirShowPoint => {
      const clampedProgress = host.clamp(progress, 0, 1);
      return {
        cx: start.cx + (end.cx - start.cx) * clampedProgress,
        cy: start.cy + (end.cy - start.cy) * clampedProgress
      };
    };

    const buildFighterGroups = (): FighterEngagementGroup[] => {
      const interceptors = activeFlights(interceptorFlights);
      const escorts = activeFlights(escortFlights);
      if (escorts.length <= 0) {
        return interceptors.map((flight, index) => ({
          interceptorFlights: [flight],
          escortFlights: [],
          lane: interceptors.length <= 1 ? 0 : index - (interceptors.length - 1) / 2
        }));
      }
      const groupCount = Math.max(1, Math.min(interceptors.length, escorts.length));
      const groups: FighterEngagementGroup[] = Array.from({ length: groupCount }, (_, index) => ({
        interceptorFlights: interceptors[index] ? [interceptors[index]!] : [],
        escortFlights: escorts[index] ? [escorts[index]!] : [],
        lane: groupCount <= 1 ? 0 : index - (groupCount - 1) / 2
      }));
      interceptors.slice(groupCount).forEach((flight, index) => {
        groups[index % groups.length]!.interceptorFlights.push(flight);
      });
      escorts.slice(groupCount).forEach((flight, index) => {
        groups[index % groups.length]!.escortFlights.push(flight);
      });
      return groups;
    };
    const fighterGroups = buildFighterGroups();
    const resolveGroupLane = (
      group: FighterEngagementGroup,
      flight: AirShowRuntimeFlightInternal,
      role: "interceptor" | "escort"
    ): number => {
      const roleFlights = role === "interceptor" ? group.interceptorFlights : group.escortFlights;
      const localIndex = Math.max(0, roleFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id));
      const localLane = roleFlights.length <= 1 ? 0 : localIndex - (roleFlights.length - 1) / 2;
      return group.lane + localLane * 0.42;
    };
    const fighterRailTarget = (
      anchor: AirShowPoint,
      laneOffsetPx: number,
      alongOffsetPx = 0
    ): AirShowPoint => {
      const anchorCoordinates = resolveAirShowRailCoordinates(corridor, anchor);
      return projectAirShowRailPoint(
        corridor,
        anchorCoordinates.alongPx + alongOffsetPx,
        laneOffsetPx
      );
    };
    const buildFighterRailPath = (
      current: AirShowPoint,
      target: AirShowPoint,
      laneOffsetPx: number,
      label: CorridorPhaseLabel
    ): AirShowPoint[] => {
      if (
        label === "fighter-ingress"
        || label === "escort-clash-merge"
        || label === "escort-clash-scramble"
      ) {
        return buildAirShowPresetRailPath(corridor, current, target, {
          lateralPx: laneOffsetPx,
          midLateralPx: laneOffsetPx,
          entryProgress: 0.34,
          exitProgress: 0.72
        });
      }
      const targetLengthPx = Math.max(
        1,
        (seedDurationByPhase.get(label) ?? 1) * host.airShowFighterSpeedPxPerMs
      );
      const directDx = target.cx - current.cx;
      const directDy = target.cy - current.cy;
      const directLengthPx = Math.hypot(directDx, directDy);
      if (directLengthPx < targetLengthPx - 8 && directLengthPx > 1) {
        const forward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
        const normal = { x: -forward.y, y: forward.x };
        const lateralSign = laneOffsetPx >= 0 ? 1 : -1;
        const thirdPx = directLengthPx / 3;
        const solvedLateralPx = Math.sqrt(
          Math.max(0, Math.pow((targetLengthPx - thirdPx) / 2, 2) - thirdPx * thirdPx)
        );
        const lateralPx = host.clamp(solvedLateralPx, 0, 1200);
        return dedupePath([
          current,
          {
            cx: current.cx + forward.x * thirdPx + normal.x * lateralSign * lateralPx,
            cy: current.cy + forward.y * thirdPx + normal.y * lateralSign * lateralPx
          },
          {
            cx: current.cx + forward.x * thirdPx * 2 + normal.x * lateralSign * lateralPx,
            cy: current.cy + forward.y * thirdPx * 2 + normal.y * lateralSign * lateralPx
          },
          target
        ]);
      }
      return buildAirShowPresetRailPath(corridor, current, target, {
        lateralPx: laneOffsetPx,
        midLateralPx: laneOffsetPx,
        entryProgress: 0.34,
        exitProgress: 0.72
      });
    };
    const rebuildFighterIngressPathToMergeEndpoint = (
      assignment: AirShowPhaseAssignment,
      durationMs: number
    ): AirShowPhaseAssignment => {
      if (
        assignment.actor.role !== "interceptor"
        && assignment.actor.role !== "escort"
      ) {
        return assignment;
      }
      const start = assignment.points[0];
      if (!start || assignment.points.length < 2) {
        return assignment;
      }
      const target = assignment.points[assignment.points.length - 1];
      if (!target) {
        return assignment;
      }
      const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
      const targetProjection = resolveAirShowRailCoordinates(corridor, target);
      let escortVisibleEntryProgress: number | null = null;
      const points = assignment.actor.role === "interceptor"
        ? (() => {
            const lateralKickSign = targetProjection.lateralPx < 0 ? -1 : 1;
            const directDx = target.cx - start.cx;
            const directDy = target.cy - start.cy;
            const directDistancePx = Math.hypot(target.cx - start.cx, target.cy - start.cy);
            const forward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
            const bendNormal = { x: -forward.y, y: forward.x };
            const bendLateralPx = host.clamp(directDistancePx * 0.33, 160, 520);
            return dedupePath([
              start,
              {
                cx: start.cx + directDx * 0.5 + bendNormal.x * lateralKickSign * bendLateralPx,
                cy: start.cy + directDy * 0.5 + bendNormal.y * lateralKickSign * bendLateralPx
              },
              target
            ]);
          })()
        : (() => {
            const basePoints = dedupePath(buildAirShowPresetRailPath(corridor, start, target, {
              lateralPx: targetProjection.lateralPx,
              midLateralPx: targetProjection.lateralPx,
              entryProgress: 0.34,
              exitProgress: 0.72
            }));
            const startsLeftOfMap = !!visibleBounds && start.cx < visibleBounds.minX - 48 && target.cx > visibleBounds.minX + 80;
            const startsRightOfMap = !!visibleBounds && start.cx > visibleBounds.maxX + 48 && target.cx < visibleBounds.maxX - 80;
            if (!visibleBounds || sceneVisibleWidthPx <= 1500 || (!startsLeftOfMap && !startsRightOfMap)) {
              return basePoints;
            }
            const visibleEntryX = startsLeftOfMap
              ? visibleBounds.minX + 26
              : visibleBounds.maxX - 26;
            const directT = Math.abs(target.cx - start.cx) > 1
              ? host.clamp((visibleEntryX - start.cx) / (target.cx - start.cx), 0.08, 0.32)
              : 0.18;
            const visibleEntryPoint = {
              cx: visibleEntryX,
              cy:
                start.cy
                + (target.cy - start.cy) * directT
                + corridor.normal.y * targetProjection.lateralPx * 0.08
            };
            const candidatePoints = dedupePath([start, visibleEntryPoint, ...basePoints.slice(1)]);
            const candidateLengthPx = measurePathLength(candidatePoints);
            escortVisibleEntryProgress = candidateLengthPx > 0
              ? host.clamp(measurePathLength(candidatePoints.slice(0, 2)) / candidateLengthPx, 0, 1)
              : null;
            return candidatePoints;
          })();
      const pathLengthPx = measurePathLength(points);
      const activeDurationMs = Math.min(
        durationMs,
        Math.max(1, Math.round(pathLengthPx / Math.max(0.0001, roleSpeedPxPerMs)))
      );
      const startTimeMs = Math.max(0, durationMs - activeDurationMs);
      const progressTimeline = escortVisibleEntryProgress !== null
        ? [
            { timeMs: 0, progress: 0 },
            { timeMs: Math.round(durationMs * 0.28), progress: escortVisibleEntryProgress },
            { timeMs: durationMs, progress: 1 }
          ]
        : startTimeMs > 1
          ? [
              { timeMs: 0, progress: 0 },
              { timeMs: Math.round(startTimeMs), progress: 0 },
              { timeMs: durationMs, progress: 1 }
            ]
          : undefined;
      return {
        ...assignment,
        points,
        progressTimeline
      };
    };
    /**
     * Fighters ride deterministic corridor rails. Pairing/ganging chooses who shares
     * lanes and targets; it does not invent per-aircraft simulator turns.
     */
    const buildFighterPhaseAssignments = (label: CorridorPhaseLabel): AirShowPhaseAssignment[] => {
      const assignments: AirShowPhaseAssignment[] = [];
      fighterGroups.forEach((group, groupIndex) => {
        [
          ...group.interceptorFlights.map((flight) => ({ flight, role: "interceptor" as const })),
          ...group.escortFlights.map((flight) => ({ flight, role: "escort" as const }))
        ].forEach(({ flight, role }) => {
          const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
          const lane = resolveGroupLane(group, flight, role);
          const travelSign = role === "interceptor" ? -1 : 1;
          const laneOffsetPx = resolveAirShowRailLaneOffsetPx(
            lane,
            role,
            (flight.spec.laneOffsetPx ?? 0) * 0.24
          );
          let path: AirShowPoint[];

          if (label === "fighter-ingress") {
            if (role === "interceptor") {
              const currentCoordinates = resolveAirShowRailCoordinates(corridor, current);
              const startAlongPx = currentCoordinates.alongPx > 420
                ? currentCoordinates.alongPx + 240
                : currentCoordinates.alongPx;
              const start = currentCoordinates.alongPx > 420
                ? projectAirShowRailPoint(corridor, startAlongPx, currentCoordinates.lateralPx)
                : current;
              const targetAlongPx = -240;
              const target = projectAirShowRailPoint(corridor, targetAlongPx, laneOffsetPx);
              const lateralKickSign = laneOffsetPx < 0 ? -1 : 1;
              const directDx = target.cx - start.cx;
              const directDy = target.cy - start.cy;
              const directDistancePx = Math.hypot(target.cx - start.cx, target.cy - start.cy);
              const forward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
              const bendNormal = { x: -forward.y, y: forward.x };
              const bendLateralPx = host.clamp(directDistancePx * 0.33, 160, 520);
              const midPoint = {
                cx: start.cx + directDx * 0.5 + bendNormal.x * lateralKickSign * bendLateralPx,
                cy: start.cy + directDy * 0.5 + bendNormal.y * lateralKickSign * bendLateralPx
              };
              path = dedupePath([start, midPoint, target]);
            } else {
              const currentCoordinates = resolveAirShowRailCoordinates(corridor, current);
              const escortIngressHoldbackPx = sceneVisibleWidthPx > 1500 ? 260 : 220;
              const heldBackAlongPx = Math.abs(currentCoordinates.alongPx) > 420
                ? Math.sign(currentCoordinates.alongPx || 1) * escortIngressHoldbackPx
                : currentCoordinates.alongPx;
              const target = projectAirShowRailPoint(corridor, heldBackAlongPx, laneOffsetPx);
              path = buildFighterRailPath(current, target, laneOffsetPx, label);
            }
          } else if (label === "escort-clash-merge") {
            const mergeLaneOffsetPx = laneOffsetPx * 0.72;
            const target = role === "escort"
              ? projectAirShowRailPoint(corridor, -410, mergeLaneOffsetPx)
              : fighterRailTarget(fighterClashCenter(lane, 28), mergeLaneOffsetPx, travelSign * 140);
            path = buildFighterRailPath(current, target, mergeLaneOffsetPx, label);
          } else if (label === "escort-clash-scramble") {
            const switchedGroup = fighterGroups.length > 1
              ? fighterGroups[
                  (groupIndex + (role === "interceptor" ? 1 : fighterGroups.length - 1)) % fighterGroups.length
                ]!
              : group;
            const switchedLane = switchedGroup.lane;
            const switchedLaneOffsetPx = resolveAirShowRailLaneOffsetPx(
              switchedLane,
              role,
              (flight.spec.laneOffsetPx ?? 0) * 0.2
            );
            const scrambleFocus = averageBomberPointAtPhaseProgress("escort-clash-scramble", 0.86);
            const localSlot = (
              role === "interceptor"
                ? group.interceptorFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id)
                : group.escortFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id)
            );
            const chaseLaneOffsetPx = switchedLaneOffsetPx * 0.2 + Math.max(0, localSlot) * (role === "interceptor" ? -8 : 8);
            const chaseLeadPx = role === "interceptor" ? -18 : 18;
            const target = host.offsetAirShowPoint(
              scrambleFocus,
              corridor.normal.x * chaseLaneOffsetPx + corridor.axis.x * chaseLeadPx,
              corridor.normal.y * chaseLaneOffsetPx + corridor.axis.y * chaseLeadPx
            );
            path = buildFighterRailPath(current, target, chaseLaneOffsetPx, label);
          } else if (label === "bomber-ingress") {
            if (role === "interceptor") {
              const interceptorIndex = activeFlights(interceptorFlights).findIndex((candidate) => candidate.spec.id === flight.spec.id);
              const targetPlan = bomberPlans[Math.max(0, interceptorIndex) % Math.max(1, bomberPlans.length)];
              const attackFocus = targetPlan
                ? pointAtPathDistance(targetPlan.preTargetPath, measurePathLength(targetPlan.preTargetPath) * 0.72)
                : averageBomberPointAtPreTargetProgress(0.72);
              path = buildFighterRailPath(current, fighterRailTarget(attackFocus, laneOffsetPx * 0.44, 24), laneOffsetPx * 0.44, label);
            } else {
              const protectPoint = averageBomberPointAtPreTargetProgress(0.68);
              path = buildFighterRailPath(current, fighterRailTarget(protectPoint, laneOffsetPx * 0.62, 56), laneOffsetPx * 0.62, label);
            }
          } else if (role === "interceptor") {
            const interceptorIndex = activeFlights(interceptorFlights).findIndex((candidate) => candidate.spec.id === flight.spec.id);
            const targetPlan = bomberPlans[Math.max(0, interceptorIndex) % Math.max(1, bomberPlans.length)];
            const focusPoint = targetPlan
              ? bomberPhaseFocusPoint(targetPlan, label, 0.56)
              : averageBomberPointAtPhaseProgress(label, 0.56);
            path = buildFighterRailPath(current, fighterRailTarget(focusPoint, laneOffsetPx * 0.36, 34), laneOffsetPx * 0.36, label);
          } else {
            const centerPoint = averageBomberPointAtPhaseProgress(label, 0.62);
            path = buildFighterRailPath(current, fighterRailTarget(centerPoint, laneOffsetPx * 0.52, 86), laneOffsetPx * 0.52, label);
          }
          assignments.push(...buildAssignmentsForFlightPath(flight, path, 0.34));
        });
      });
      return assignments;
    };
    /**
     * Build aggressive dogfight tracer volleys for head-on pass engagement.
     * Tracers fire during head-on convergence and peel-off maneuvers.
     */
    const buildDogfightTracers = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      label: "escort-clash-merge" | "escort-clash-scramble"
    ): AirShowTracerBurst[] => {
      const tracers: AirShowTracerBurst[] = [];
      const isMerge = label === "escort-clash-merge";
      // Aggressive head-on pass timing: tracers fire during convergence and break
      // Merge phase: single concentrated burst at head-on pass (0.5-0.7)
      // Scramble phase: sustained fire during re-pair and second pass (0.2-0.8)
      const interceptorTimings = isMerge
        ? [0.55, 0.68, 0.78] // Head-on pass convergence then peel
        : [0.25, 0.40, 0.55, 0.70, 0.82]; // Re-pair, second pass, exit
      const escortTimings = isMerge
        ? [0.58, 0.72, 0.82] // Slight offset for visual chaos
        : [0.30, 0.45, 0.60, 0.75, 0.88];
      fighterGroups.forEach((group, groupIndex) => {
        group.interceptorFlights.forEach((interceptorFlight, index) => {
          const escortTarget = group.escortFlights[(index + (isMerge ? 0 : 1)) % Math.max(1, group.escortFlights.length)];
          if (!escortTarget) {
            return;
          }
          tracers.push(...host.buildAirShowDynamicTracerVolley(assignments, interceptorFlight, escortTarget, {
            emitter: "nose",
            color: "#fff5cf",
            width: 0.7,
            lifetimeMs: 42,
            spreadPx: isMerge ? 7 : 8,
            streakLengthPx: isMerge ? 134 : 148,
            visibleLengthPx: isMerge ? 11 : 12,
            fanHalfAngleDeg: 2.6,
            burstCount: isMerge ? 3 : 5,
            maxAlignmentDeg: 78,
            maxRangePx: 240,
            timings: interceptorTimings,
            fallbackToNearest: true
          }));
        });
        group.escortFlights.forEach((escortFlight, index) => {
          const interceptorTarget = group.interceptorFlights[
            (index + groupIndex + (isMerge ? 0 : 1)) % Math.max(1, group.interceptorFlights.length)
          ];
          if (!interceptorTarget) {
            return;
          }
          tracers.push(...host.buildAirShowDynamicTracerVolley(assignments, escortFlight, interceptorTarget, {
            emitter: "nose",
            color: "#ffd98a",
            width: 0.62,
            lifetimeMs: 40,
            spreadPx: isMerge ? 6 : 7,
            streakLengthPx: isMerge ? 126 : 138,
            visibleLengthPx: isMerge ? 10 : 11,
            fanHalfAngleDeg: 2.2,
            burstCount: isMerge ? 3 : 4,
            maxAlignmentDeg: 76,
            maxRangePx: 230,
            timings: escortTimings,
            fallbackToNearest: true
          }));
        });
      });
      return tracers;
    };
    type ScopedFlakBurst = NonNullable<ResolvedAirShowScene["flakBursts"]>[number];
    /**
     * Resolve continuous flak bursts during bomber approach.
     * Flak runs continuously when bombers are within 8 hex range of flak battery,
     * sampled at bomber positions during the phase, tapering after ordnance release.
     */
    const resolveContinuousFlakBursts = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      durationMs: number,
      phase: "approach" | "target"
    ): ScopedFlakBurst[] => {
      const assignmentsByActorId = host.buildAirShowAssignmentLookup(assignments);
      const rangePx = HEX_WIDTH * 8; // 8 hex range for flak engagement
      return bomberPlans.flatMap((plan) => {
        const scoped = host.resolveAirShowBomberFlakBursts(scene, plan.flight.spec.id);
        if (scoped.length <= 0) {
          return [];
        }
        const scopedCount = scoped.length;
        return scoped.flatMap((burst, burstIndex) => {
          const jitter01 = (sampleIndex: number, salt: number): number => {
            let seed =
              (
                host.seedFromHexKey(`${plan.flight.spec.id}:${burst.batteryHexKey ?? ""}:${burst.targetHexKey ?? ""}`)
                + sampleIndex * 374761393
                + salt * 668265263
              ) >>> 0;
            seed = (seed ^ (seed >>> 13)) >>> 0;
            seed = Math.imul(seed, 1274126177) >>> 0;
            return ((seed ^ (seed >>> 16)) >>> 0) / 0x100000000;
          };
          const minProgress = phase === "approach" ? 0.12 : 0.14;
          const maxProgress = phase === "approach" ? 0.88 : 0.83;
          const targetCenter = (burst.targetHexKey ? host.resolveHexCenterByKey(burst.targetHexKey) : null) ?? plan.targetCenter;
          const batteryCenter = burst.batteryHexKey ? host.resolveHexCenterByKey(burst.batteryHexKey) : null;
          const rangeReferenceCenter = batteryCenter ?? targetCenter;
          const slotProgress =
            scopedCount <= 1
              ? 0.5
              : burstIndex / Math.max(1, scopedCount - 1);
          const slotWidth = (maxProgress - minProgress) / Math.max(1, scopedCount);
          const baseProgress = host.clamp(
            minProgress
            + (maxProgress - minProgress)
              * host.clamp(
                slotProgress + (jitter01(burstIndex, 53) - 0.5) * (0.58 / Math.max(1, scopedCount)),
                0,
                1
              ),
            minProgress,
            maxProgress
          );
          const candidateProgresses = Array.from(new Set([
            baseProgress,
            host.clamp(baseProgress - slotWidth * 0.75, minProgress, maxProgress),
            host.clamp(baseProgress + slotWidth * 0.75, minProgress, maxProgress),
            (minProgress + maxProgress) / 2
          ].map((progress) => Number(progress.toFixed(4)))));
          const isBomberInFlakRange = (progress: number): boolean => {
            const sampledActorPositions = plan.flight.actors.flatMap((actor) => {
              const assignment = assignmentsByActorId.get(actor.id);
              return assignment
                ? [host.sampleAirShowAssignmentAtTime(assignment, durationMs * progress, durationMs).position]
                : [];
            });
            const bomberCenter = host.averageAirShowPoints(sampledActorPositions);
            if (!bomberCenter) {
              return false;
            }
            const distancePx = Math.hypot(
              bomberCenter.cx - rangeReferenceCenter.cx,
              bomberCenter.cy - rangeReferenceCenter.cy
            );
            return distancePx <= rangePx;
          };
          const inRangeProgress = candidateProgresses.find((progress) => isBomberInFlakRange(progress));
          if (inRangeProgress === undefined) {
            return []; // No flak if bomber never within range during this phase
          }
          const sampleIndex = burstIndex;
          const basePuffCount = burst.puffCount ?? (phase === "approach" ? 12 : 13);
          const puffCount = Math.max(
            11,
            Math.min(
              16,
              Math.round(basePuffCount <= 1 ? (phase === "approach" ? 11 : 12) : basePuffCount * 0.68)
            )
          );
          const requestedSmokePuffCount = burst.smokePuffCount ?? Math.round(puffCount * 1.45);
          const smokePuffCount = Math.max(
            puffCount + 3,
            Math.min(24, Math.round(requestedSmokePuffCount))
          );
          const jitteredProgress = host.clamp(
            inRangeProgress + (jitter01(sampleIndex, burstIndex + 1) - 0.5) * (phase === "approach" ? 0.026 : 0.022),
            0.08,
            phase === "approach" ? maxProgress : 0.84
          );
          return [{
            ...burst,
            progress: jitteredProgress,
            count: Math.max(1, burst.count ?? 1),
            puffCount,
            smokePuffCount,
            alongOffsetPx: host.clamp(
              (burst.alongOffsetPx ?? 0) * 0.55 - 44 + jitter01(sampleIndex, burstIndex + 11) * 122,
              -110,
              110
            ),
            lateralOffsetPx: host.clamp(
              (burst.lateralOffsetPx ?? 0) * 0.5
              + (jitter01(sampleIndex, burstIndex + 23) - 0.5) * 310
              + (burstIndex - (scopedCount - 1) / 2) * 5,
              -210,
              210
            ),
            alongSpreadPx: Math.max(
              58,
              Math.min(104, Math.round((burst.alongSpreadPx ?? 64) * (0.9 + jitter01(sampleIndex, burstIndex + 29) * 0.24)))
            ),
            lateralSpreadPx: Math.max(
              132,
              Math.min(178, Math.round((burst.lateralSpreadPx ?? 126) * (1.02 + jitter01(sampleIndex, burstIndex + 37) * 0.28)))
            ),
            scale: Math.max(0.72, (burst.scale ?? 1) * (0.9 + jitter01(sampleIndex, burstIndex + 31) * 0.34)),
            smokeScale: Math.max(1.16, (burst.smokeScale ?? 1) * (1.12 + jitter01(sampleIndex, burstIndex + 43) * 0.22)),
            bomberUnitKey: plan.flight.spec.id,
            targetHexKey:
              burst.targetHexKey
              ?? bomberSpecsById.get(plan.flight.spec.id)?.targetHexKey
              ?? scene.bomberTargetHexKey
              ?? null,
            batteryHexKey: burst.batteryHexKey ?? null
          }];
        });
      });
    };

    const commitCorridorPhaseEndState = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      durationMs: number
    ): void => {
      assignments.forEach((assignment) => {
        const finalSample = host.sampleAirShowAssignmentAtTime(assignment, durationMs, durationMs);
        assignment.actor.position = {
          cx: finalSample.position.cx,
          cy: finalSample.position.cy
        };
        assignment.actor.headingDegrees = finalSample.headingDegrees;
      });
    };
    const resolveCorridorPhaseDurationMs = (
      label: CorridorPhaseLabel,
      assignments: ReadonlyArray<AirShowPhaseAssignment>
    ): number => {
      const fighterTimedPhase =
        label === "fighter-ingress"
        || label === "escort-clash-merge"
        || label === "escort-clash-scramble";
      const fighterRolesForTimedPhase =
        fighterTimedPhase
        && assignments.some((assignment) => assignment.actor.role === "interceptor" || assignment.actor.role === "escort")
          ? ["interceptor", "escort"] as const
          : undefined;
      const requiredRoles: ReadonlyArray<AirShowPlannerActor["role"]> | undefined =
        fighterRolesForTimedPhase
        ?? (assignments.some((assignment) => assignment.actor.role === "bomber")
        && orderedPreTargetPhaseLabels.includes(label)
          ? ["bomber"]
          : undefined);
      return host.resolveAirShowPhaseDurationFromRoleSpeeds(
        assignments,
        roleSpeeds,
        seedDurationByPhase.get(label) ?? 1,
        1,
        60000,
        requiredRoles
      );
    };

    const recordCorridorPhase = (
      label: CorridorPhaseLabel,
      fighterAssignments: ReadonlyArray<AirShowPhaseAssignment>,
      tracerBursts: ReadonlyArray<AirShowTracerBurst> = [],
      flakBursts: ReadonlyArray<ScopedFlakBurst> = []
    ): void => {
      const rawAssignments = [...buildBomberPhaseAssignments(label), ...fighterAssignments];
      let durationMs = resolveCorridorPhaseDurationMs(label, rawAssignments);
      let assignments = finalizeCorridorPhaseAssignments(label, rawAssignments, durationMs);
      durationMs = resolveCorridorPhaseDurationMs(label, assignments);
      assignments = finalizeCorridorPhaseAssignments(label, assignments, durationMs);
      recordPhase(label, assignments, durationMs, tracerBursts, flakBursts, roleSpeeds);
      commitCorridorPhaseEndState(assignments, durationMs);
      previousPhaseAssignments = assignments;
      previousPhaseDurationMs = durationMs;
      updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
    };

    const pathProgressAtDistance = (
      points: ReadonlyArray<AirShowPoint>,
      targetDistancePx: number
    ): number => {
      const totalLengthPx = measurePathLength(points);
      return totalLengthPx > 0
        ? host.clamp(targetDistancePx / totalLengthPx, 0, 1)
        : 0;
    };

    const alignClashFightersThroughSharedFightSpace = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      durationMs: number,
      fightSpaceCenter: AirShowPoint,
      convergenceTimeProgress: number
    ): AirShowPhaseAssignment[] => {
      const fighterAssignments = assignments.filter(
        (assignment) => assignment.actor.role === "interceptor" || assignment.actor.role === "escort"
      );
      if (fighterAssignments.length <= 1 || durationMs <= 0) {
        return [...assignments];
      }
      const flightIds = Array.from(new Set(fighterAssignments.map((assignment) => assignment.actor.flightId)));
      const laneByFlightId = new Map(
        flightIds.map((flightId, index) => [flightId, index - (flightIds.length - 1) / 2] as const)
      );
      return assignments.map((assignment) => {
        if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
          return assignment;
        }
        const start = assignment.points[0] ?? assignment.actor.position;
        const end = assignment.points[assignment.points.length - 1] ?? start;
        const lane = laneByFlightId.get(assignment.actor.flightId) ?? 0;
        const roleSide = assignment.actor.role === "interceptor" ? -1 : 1;
        const previousAssignment = previousPhaseAssignments.find(
          (candidate) => candidate.actor.id === assignment.actor.id
        );
        const previousHeading = previousAssignment
          ? (() => {
              const previousEnd = host.sampleAirShowAssignmentAtTime(
                previousAssignment,
                previousPhaseDurationMs,
                previousPhaseDurationMs
              ).position;
              const previousNearEnd = host.sampleAirShowAssignmentAtTime(
                previousAssignment,
                Math.max(0, previousPhaseDurationMs - 250),
                previousPhaseDurationMs
              ).position;
              return normalizeVector(
                previousEnd.cx - previousNearEnd.cx,
                previousEnd.cy - previousNearEnd.cy,
                corridor.axis.x,
                corridor.axis.y
              );
            })()
          : null;
        const convergencePoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.axis.x * roleSide * 6 + corridor.normal.x * lane * 10,
          corridor.axis.y * roleSide * 6 + corridor.normal.y * lane * 10
        );
        const currentForward =
          previousHeading
          ?? resolveHeadingVector(assignment.actor.headingDegrees, {
            x: convergencePoint.cx - start.cx,
            y: convergencePoint.cy - start.cy
          });
        const carryDistancePx = assignment.actor.role === "escort" ? 118 : 520;
        const carryPoint = host.offsetAirShowPoint(
          start,
          currentForward.x * carryDistancePx,
          currentForward.y * carryDistancePx
        );
        const entryPoint = host.offsetAirShowPoint(
          carryPoint,
          (convergencePoint.cx - carryPoint.cx) * 0.44 + corridor.normal.x * roleSide * 10,
          (convergencePoint.cy - carryPoint.cy) * 0.44 + corridor.normal.y * roleSide * 10
        );
        const preMergePoint = host.offsetAirShowPoint(
          entryPoint,
          (convergencePoint.cx - entryPoint.cx) * 0.55 + corridor.normal.x * lane * 4,
          (convergencePoint.cy - entryPoint.cy) * 0.55 + corridor.normal.y * lane * 4
        );
        const exitPoint = host.offsetAirShowPoint(
          convergencePoint,
          (end.cx - convergencePoint.cx) * 0.38 + corridor.normal.x * roleSide * 10,
          (end.cy - convergencePoint.cy) * 0.38 + corridor.normal.y * roleSide * 10
        );
        const points = dedupePath([start, carryPoint, entryPoint, preMergePoint, convergencePoint, exitPoint, end]);
        const convergencePointIndex = points.findIndex((point) => point === convergencePoint);
        const convergenceDistancePx = measurePathLength(
          points.slice(0, convergencePointIndex >= 0 ? convergencePointIndex + 1 : 5)
        );
        return {
          ...assignment,
          points,
          progressTimeline: [
            { timeMs: 0, progress: 0 },
            {
              timeMs: Math.round(durationMs * convergenceTimeProgress),
              progress: pathProgressAtDistance(points, convergenceDistancePx)
            },
            { timeMs: durationMs, progress: 1 }
          ]
        };
      });
    };

    const alignScrambleFightersThroughChasePocket = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      durationMs: number,
      fightSpaceCenter: AirShowPoint
    ): AirShowPhaseAssignment[] => {
      const fighterAssignments = assignments.filter(
        (assignment) => assignment.actor.role === "interceptor" || assignment.actor.role === "escort"
      );
      if (fighterAssignments.length <= 1 || durationMs <= 0) {
        return [...assignments];
      }
      const flightIds = Array.from(new Set(fighterAssignments.map((assignment) => assignment.actor.flightId)));
      const laneByFlightId = new Map(
        flightIds.map((flightId, index) => [flightId, index - (flightIds.length - 1) / 2] as const)
      );
      const actorCountByFlightId = new Map<string, number>();
      fighterAssignments.forEach((assignment) => {
        actorCountByFlightId.set(
          assignment.actor.flightId,
          Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1)
        );
      });

      return assignments.map((assignment) => {
        if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
          return assignment;
        }
        const start = assignment.points[0] ?? assignment.actor.position;
        const end = assignment.points[assignment.points.length - 1] ?? start;
        const lane = laneByFlightId.get(assignment.actor.flightId) ?? 0;
        const roleSide = assignment.actor.role === "interceptor" ? -1 : 1;
        const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
        const actorSlot = assignment.actor.formationIndex - (actorCount - 1) / 2;
        const previousAssignment = previousPhaseAssignments.find(
          (candidate) => candidate.actor.id === assignment.actor.id
        );
        const previousHeading = previousAssignment
          ? (() => {
              const previousEnd = host.sampleAirShowAssignmentAtTime(
                previousAssignment,
                previousPhaseDurationMs,
                previousPhaseDurationMs
              ).position;
              const previousNearEnd = host.sampleAirShowAssignmentAtTime(
                previousAssignment,
                Math.max(0, previousPhaseDurationMs - 250),
                previousPhaseDurationMs
              ).position;
              return normalizeVector(
                previousEnd.cx - previousNearEnd.cx,
                previousEnd.cy - previousNearEnd.cy,
                corridor.axis.x,
                corridor.axis.y
              );
            })()
          : null;
        const currentForward =
          previousHeading
          ?? resolveHeadingVector(assignment.actor.headingDegrees, {
            x: fightSpaceCenter.cx - start.cx,
            y: fightSpaceCenter.cy - start.cy
          });
        const carryPoint = host.offsetAirShowPoint(
          start,
          currentForward.x * 58,
          currentForward.y * 58
        );
        const pocketPoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.normal.x * (lane * 9 + roleSide * 5 + actorSlot * 4)
            + corridor.axis.x * (roleSide * 3 + actorSlot * 2),
          corridor.normal.y * (lane * 9 + roleSide * 5 + actorSlot * 4)
            + corridor.axis.y * (roleSide * 3 + actorSlot * 2)
        );
        const sweepPoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.axis.x * (42 + lane * 5)
            + corridor.normal.x * (lane * 18 - roleSide * 24 + actorSlot * 4),
          corridor.axis.y * (42 + lane * 5)
            + corridor.normal.y * (lane * 18 - roleSide * 24 + actorSlot * 4)
        );
        const entryPoint = host.offsetAirShowPoint(
          carryPoint,
          (pocketPoint.cx - carryPoint.cx) * 0.52 + corridor.normal.x * roleSide * 12,
          (pocketPoint.cy - carryPoint.cy) * 0.52 + corridor.normal.y * roleSide * 12
        );
        const exitPoint = host.offsetAirShowPoint(
          sweepPoint,
          (end.cx - sweepPoint.cx) * 0.34,
          (end.cy - sweepPoint.cy) * 0.34
        );
        const points = dedupePath([start, carryPoint, entryPoint, pocketPoint, sweepPoint, exitPoint, end]);
        const pocketPointIndex = points.findIndex((point) => point === pocketPoint);
        const sweepPointIndex = points.findIndex((point) => point === sweepPoint);
        const pocketDistancePx = measurePathLength(
          points.slice(0, pocketPointIndex >= 0 ? pocketPointIndex + 1 : 4)
        );
        const sweepDistancePx = measurePathLength(
          points.slice(0, sweepPointIndex >= 0 ? sweepPointIndex + 1 : 5)
        );
        return {
          ...assignment,
          points,
          progressTimeline: [
            { timeMs: 0, progress: 0 },
            {
              timeMs: Math.round(durationMs * 0.52),
              progress: pathProgressAtDistance(points, pocketDistancePx)
            },
            {
              timeMs: Math.round(durationMs * 0.72),
              progress: pathProgressAtDistance(points, sweepDistancePx)
            },
            { timeMs: durationMs, progress: 1 }
          ]
        };
      });
    };

    const finalizeCorridorPhaseAssignments = (
      label: CorridorPhaseLabel,
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      durationMs: number
    ): AirShowPhaseAssignment[] => {
      const originalAssignmentByActorId = new Map(
        assignments.map((assignment) => [assignment.actor.id, assignment] as const)
      );
      const isEscortClashPhase =
        label === "escort-clash-merge" || label === "escort-clash-scramble";
      const preserveFighterRailPhase = isEscortClashPhase || label === "fighter-ingress";
      const extensionModeByRole = preserveFighterRailPhase
        ? {
            interceptor: "carry" as const,
            escort: "carry" as const,
            bomber: "carry" as const
          }
        : undefined;
      const extendedAssignments = preserveFighterRailPhase
        ? [...assignments]
        : host.extendAirShowPhaseAssignmentsForSpeed(
            assignments,
            durationMs,
            roleSpeeds,
            {
              clampCenter: corridor.strike,
              orbitSignByRole: {
                interceptor: 1,
                escort: -1,
                bomber: 1
              },
              extendAtByRole: {
                interceptor: "end",
                escort: "end",
                bomber: "end"
              },
              maxHorizontalPx: 520,
              maxVerticalPx: 360,
              extensionMode: "carry",
              extensionModeByRole
            }
          );
      const preparedAssignments = host.prepareAirShowPhaseAssignments(
        extendedAssignments,
        durationMs,
        [0.24, 0.5, 0.76],
        42,
        roleSpeeds,
        {
          previousAssignments: previousPhaseAssignments,
          previousDurationMs: previousPhaseDurationMs,
          entryTurnLimitDeg: label === "fighter-ingress" ? 108 : 58,
          softenEntryRoles: ["bomber", "interceptor", "escort"],
          softenEntryTurnLimitDeg: label === "fighter-ingress" ? 96 : 70,
          softenEntryWaypointCount: label === "fighter-ingress" ? 8 : 18,
          softenExitRoles: ["bomber", "interceptor", "escort"],
          softenExitTurnLimitDeg: 78,
          softenExitWaypointCount: 12,
          sanitizeEntryTurns: label !== "fighter-ingress",
          sanitizeEntryTurnLimitDeg: 42,
          sanitizeEntryStrongTurnDeg: 84,
          sanitizeEntryMaxFirstSegmentPx: 92,
          sanitizeEntryMaxSharpTurnDeg: 96,
          sanitizeEntryMaxWaypointsToRemove: 5
        }
      );
      const resolvedTimedAssignments = label === "escort-clash-merge"
        ? alignClashFightersThroughSharedFightSpace(
            preparedAssignments,
            durationMs,
            projectAirShowRailPoint(corridor, -420, 0),
            0.54
          )
        : label === "escort-clash-scramble"
          ? alignScrambleFightersThroughChasePocket(
              preparedAssignments,
              durationMs,
              blendAirShowPoints(
                fighterClashCenter(0, 68),
                averageBomberPointAtPhaseProgress("escort-clash-scramble", 0.58),
                0.42
              )
            )
        : preparedAssignments;
      const finalSpeedAdjustedAssignments = preserveFighterRailPhase
        ? resolvedTimedAssignments
        : host.extendAirShowPhaseAssignmentsForSpeed(
            resolvedTimedAssignments,
            durationMs,
            roleSpeeds,
            {
              clampCenter: corridor.strike,
              orbitSignByRole: {
                interceptor: 1,
                escort: -1,
                bomber: 1
              },
              extendAtByRole: {
                interceptor: "end",
                escort: "end",
                bomber: "end"
              },
              maxHorizontalPx: 520,
              maxVerticalPx: 360,
              extensionMode: "carry",
              extensionModeByRole
            }
          );
      const phasePatternAlignedAssignments =
        label === "bomber-defense-pass"
          ? finalSpeedAdjustedAssignments.map((assignment) => {
              if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                return assignment;
              }
              const bomberAssignments = finalSpeedAdjustedAssignments.filter(
                (candidate) => candidate.actor.role === "bomber"
              );
              if (bomberAssignments.length <= 0) {
                return assignment;
              }
              const fighterFlightIds = Array.from(
                new Set(
                  finalSpeedAdjustedAssignments
                    .filter((candidate) => candidate.actor.role === "interceptor" || candidate.actor.role === "escort")
                    .map((candidate) => candidate.actor.flightId)
                )
              );
              const fighterFlightIndex = Math.max(0, fighterFlightIds.indexOf(assignment.actor.flightId));
              const targetBomberAssignment = bomberAssignments[fighterFlightIndex % bomberAssignments.length];
              if (!targetBomberAssignment) {
                return assignment;
              }
              const originalAssignment = originalAssignmentByActorId.get(assignment.actor.id);
              const start = assignment.points[0] ?? originalAssignment?.points[0] ?? assignment.actor.position;
              const localLane = assignment.actor.formationIndex - 0.5;
              const lateralOffsetPx = (assignment.actor.role === "interceptor" ? -46 : 50) + localLane * 18;
              const interceptFocus = host.sampleAirShowAssignmentAtTime(
                targetBomberAssignment,
                durationMs * 0.5,
                durationMs
              ).position;
              const exitFocus = host.sampleAirShowAssignmentAtTime(
                targetBomberAssignment,
                durationMs * 0.86,
                durationMs
              ).position;
              const interceptPoint = host.offsetAirShowPoint(
                interceptFocus,
                corridor.normal.x * lateralOffsetPx - corridor.axis.x * 32,
                corridor.normal.y * lateralOffsetPx - corridor.axis.y * 32
              );
              const entryPoint = host.offsetAirShowPoint(
                start,
                (interceptPoint.cx - start.cx) * 0.46 + corridor.normal.x * lateralOffsetPx * 0.34,
                (interceptPoint.cy - start.cy) * 0.46 + corridor.normal.y * lateralOffsetPx * 0.34
              );
              const exitPoint = host.offsetAirShowPoint(
                exitFocus,
                corridor.normal.x * lateralOffsetPx * 0.58 + corridor.axis.x * 150,
                corridor.normal.y * lateralOffsetPx * 0.58 + corridor.axis.y * 150
              );
              return {
                ...assignment,
                points: dedupePath([start, entryPoint, interceptPoint, exitPoint]),
                progressTimeline: undefined
              };
            })
          : finalSpeedAdjustedAssignments;
      const endpointAlignedAssignments =
        label === "fighter-ingress"
          ? phasePatternAlignedAssignments.map((assignment) =>
              rebuildFighterIngressPathToMergeEndpoint(assignment, durationMs)
            )
          : phasePatternAlignedAssignments;
      const bomberBackTimedAssignments = orderedPreTargetPhaseLabels.includes(label)
        ? endpointAlignedAssignments.map((assignment) => {
            if (assignment.actor.role !== "bomber") {
              return assignment;
            }
            const originalAssignment = originalAssignmentByActorId.get(assignment.actor.id);
            if (!originalAssignment || originalAssignment.points.length <= 0) {
              return assignment;
            }
            const preparedStart = assignment.points[0] ?? originalAssignment.points[0]!;
            const originalStart = originalAssignment.points[0]!;
            const dx = preparedStart.cx - originalStart.cx;
            const dy = preparedStart.cy - originalStart.cy;
            let points = originalAssignment.points.map((point) => ({
              cx: point.cx + dx,
              cy: point.cy + dy
            }));
            if (label === "escort-clash-merge" && points.length >= 2) {
              const start = points[0]!;
              const end = points[points.length - 1]!;
              const directDx = end.cx - start.cx;
              const directDy = end.cy - start.cy;
              const directDistancePx = Math.hypot(directDx, directDy);
              if (directDistancePx > 80) {
                const forward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
                const bendNormal = { x: -forward.y, y: forward.x };
                const bendSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
                const bendPx = host.clamp(directDistancePx * 0.26, 118, 156);
                points = dedupePath([
                  start,
                  {
                    cx: start.cx + directDx * 0.5 + bendNormal.x * bendSign * bendPx,
                    cy: start.cy + directDy * 0.5 + bendNormal.y * bendSign * bendPx
                  },
                  end
                ]);
              }
            }
            const activeDurationMs = Math.min(
              durationMs,
              Math.max(1, Math.round(measurePathLength(points) / host.airShowBomberSpeedPxPerMs))
            );
            const maxDogfightHoldRatio =
              label === "escort-clash-merge"
                ? 0.08
                : label === "escort-clash-scramble" || label === "bomber-defense-pass"
                  ? 0.16
                  : Number.POSITIVE_INFINITY;
            const maxDogfightHoldMs = Number.isFinite(maxDogfightHoldRatio)
              ? Math.round(durationMs * maxDogfightHoldRatio)
              : Number.POSITIVE_INFINITY;
            const startTimeMs = Math.min(Math.max(0, durationMs - activeDurationMs), maxDogfightHoldMs);
            return {
              ...assignment,
              points,
              progressTimeline:
                startTimeMs > 80
                  ? [
                      { timeMs: 0, progress: 0 },
                      { timeMs: startTimeMs, progress: 0 },
                      { timeMs: durationMs, progress: 1 }
                    ]
                  : undefined
            };
          })
        : endpointAlignedAssignments;
      return separatePhaseEndAssignments(bomberBackTimedAssignments, 16);
    };

    recordCorridorPhase("fighter-ingress", buildFighterPhaseAssignments("fighter-ingress"));
    if (escortFlights.length > 0) {
      const rawMergeAssignments = [...buildBomberPhaseAssignments("escort-clash-merge"), ...buildFighterPhaseAssignments("escort-clash-merge")];
      let mergeDurationMs = resolveCorridorPhaseDurationMs("escort-clash-merge", rawMergeAssignments);
      let mergeAssignments = finalizeCorridorPhaseAssignments("escort-clash-merge", rawMergeAssignments, mergeDurationMs);
      mergeDurationMs = resolveCorridorPhaseDurationMs("escort-clash-merge", mergeAssignments);
      mergeAssignments = finalizeCorridorPhaseAssignments("escort-clash-merge", mergeAssignments, mergeDurationMs);
      recordPhase("escort-clash-merge", mergeAssignments, mergeDurationMs, buildDogfightTracers(mergeAssignments, "escort-clash-merge"), [], roleSpeeds);
      commitCorridorPhaseEndState(mergeAssignments, mergeDurationMs);
      previousPhaseAssignments = mergeAssignments;
      previousPhaseDurationMs = mergeDurationMs;
      updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);

      const rawScrambleAssignments = [...buildBomberPhaseAssignments("escort-clash-scramble"), ...buildFighterPhaseAssignments("escort-clash-scramble")];
      let scrambleDurationMs = resolveCorridorPhaseDurationMs("escort-clash-scramble", rawScrambleAssignments);
      let scrambleAssignments = finalizeCorridorPhaseAssignments("escort-clash-scramble", rawScrambleAssignments, scrambleDurationMs);
      scrambleDurationMs = resolveCorridorPhaseDurationMs("escort-clash-scramble", scrambleAssignments);
      scrambleAssignments = finalizeCorridorPhaseAssignments("escort-clash-scramble", scrambleAssignments, scrambleDurationMs);
      recordPhase("escort-clash-scramble", scrambleAssignments, scrambleDurationMs, buildDogfightTracers(scrambleAssignments, "escort-clash-scramble"), [], roleSpeeds);
      commitCorridorPhaseEndState(scrambleAssignments, scrambleDurationMs);
      previousPhaseAssignments = scrambleAssignments;
      previousPhaseDurationMs = scrambleDurationMs;
      updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
    }
    recordCorridorPhase("bomber-ingress", buildFighterPhaseAssignments("bomber-ingress"));

    const rawBomberDefenseAssignments = [...buildBomberPhaseAssignments("bomber-defense-pass"), ...buildFighterPhaseAssignments("bomber-defense-pass")];
    let bomberDefenseDurationMs = resolveCorridorPhaseDurationMs("bomber-defense-pass", rawBomberDefenseAssignments);
    let bomberDefenseAssignments = finalizeCorridorPhaseAssignments("bomber-defense-pass", rawBomberDefenseAssignments, bomberDefenseDurationMs);
    bomberDefenseDurationMs = resolveCorridorPhaseDurationMs("bomber-defense-pass", bomberDefenseAssignments);
    bomberDefenseAssignments = finalizeCorridorPhaseAssignments("bomber-defense-pass", bomberDefenseAssignments, bomberDefenseDurationMs);
    const bomberDefenseTracers: AirShowTracerBurst[] = [];
    activeFlights(interceptorFlights).forEach((interceptorFlight, index) => {
      const targetBomber = bomberFlights[index % Math.max(1, bomberFlights.length)];
      if (!targetBomber) {
        return;
      }
      bomberDefenseTracers.push(
        ...host.buildAirShowDynamicTracerVolley(bomberDefenseAssignments, interceptorFlight, targetBomber, {
          emitter: "nose",
          color: "#fff5cf",
          width: 0.66,
          lifetimeMs: 40,
          spreadPx: 7,
          streakLengthPx: 138,
          visibleLengthPx: 11,
          fanHalfAngleDeg: 2.2,
          burstCount: 4,
          maxAlignmentDeg: 78,
          maxRangePx: 240,
          timings: [0.2, 0.32, 0.44, 0.56, 0.68],
          fallbackToNearest: true
        }),
        ...host.buildAirShowDynamicTracerVolley(bomberDefenseAssignments, targetBomber, interceptorFlight, {
          emitter: "center",
          color: "#fff1c8",
          width: 0.38,
          lifetimeMs: 34,
          spreadPx: 4,
          streakLengthPx: 94,
          visibleLengthPx: 8,
          fanHalfAngleDeg: 1.2,
          burstCount: 2,
          maxAlignmentDeg: 120,
          maxRangePx: 220,
          timings: [0.28, 0.46, 0.64],
          fallbackToNearest: true
        })
      );
    });
    recordPhase(
      "bomber-defense-pass",
      bomberDefenseAssignments,
      bomberDefenseDurationMs,
      bomberDefenseTracers,
      resolveContinuousFlakBursts(bomberDefenseAssignments, bomberDefenseDurationMs, "approach"),
      roleSpeeds
    );
    commitCorridorPhaseEndState(bomberDefenseAssignments, bomberDefenseDurationMs);
    previousPhaseAssignments = bomberDefenseAssignments;
    previousPhaseDurationMs = bomberDefenseDurationMs;
    updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
    interceptorFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
    escortFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));

    const homeSideMidX =
      hqMidX
      ?? (visibleBounds ? (visibleBounds.minX + visibleBounds.maxX) / 2 : corridor.center.cx);
    const homeSideVisibleWidthPx = visibleBounds
      ? Math.max(1, visibleBounds.maxX - visibleBounds.minX)
      : Math.max(960, Math.abs(corridor.exit.cx - corridor.entry.cx) + 520);
    const resolveFighterHomeSideX = (
      role: "interceptor" | "escort",
      distancePx: number,
      laneOffsetPx = 0,
      clampToVisible = true
    ): number => {
      const sideSign = role === "interceptor" ? 1 : -1;
      const rawX = homeSideMidX + sideSign * distancePx + sideSign * laneOffsetPx;
      if (!visibleBounds || !clampToVisible) {
        return rawX;
      }
      return host.clamp(rawX, visibleBounds.minX + 54, visibleBounds.maxX - 54);
    };
    const buildHomeSideTargetRunFighterPath = (
      assignment: AirShowPhaseAssignment
    ): AirShowPhaseAssignment => {
      if (
        assignment.actor.role !== "interceptor"
        && assignment.actor.role !== "escort"
      ) {
        return assignment;
      }
      const start = assignment.points[0] ?? assignment.actor.position;
      const rawSecond = assignment.points[1] ?? start;
      const rawEnd = assignment.points[assignment.points.length - 1] ?? rawSecond;
      const renderedOffsetPx = assignment.multiFlightOffsetPx ?? 0;
      const laneOffsetPx = (assignment.actor.formationIndex - 0.5) * 22;
      const sideSign = assignment.actor.role === "interceptor" ? 1 : -1;
      const startRenderedX = start.cx + renderedOffsetPx;
      const clampHomeX = (x: number): number =>
        visibleBounds ? host.clamp(x, visibleBounds.minX + 54, visibleBounds.maxX - 54) : x;
      const fallbackForward = resolveHeadingVector(assignment.actor.headingDegrees, {
        x: rawEnd.cx - start.cx,
        y: rawEnd.cy - start.cy
      });
      const baseEarlyHomeX = resolveFighterHomeSideX(
        assignment.actor.role,
        Math.min(homeSideVisibleWidthPx * 0.34, 390),
        laneOffsetPx
      );
      const baseFarHomeX = resolveFighterHomeSideX(
        assignment.actor.role,
        Math.min(homeSideVisibleWidthPx * 0.47, 540),
        laneOffsetPx
      );
      const earlyHomeX = clampHomeX(
        sideSign < 0
          ? Math.min(baseEarlyHomeX, startRenderedX - 140)
          : Math.max(baseEarlyHomeX, startRenderedX + 170)
      );
      const farHomeX = clampHomeX(
        sideSign < 0
          ? Math.min(baseFarHomeX, earlyHomeX - 150, startRenderedX - 310)
          : Math.max(baseFarHomeX, earlyHomeX + 150, startRenderedX + 340)
      );
      const releaseDy = rawEnd.cy - start.cy;
      const desiredLead = {
        cx: earlyHomeX - renderedOffsetPx,
        cy: start.cy + releaseDy * 0.26 + fallbackForward.y * 12
      };
      const entryForward = normalizeVector(
        desiredLead.cx - start.cx,
        desiredLead.cy - start.cy,
        sideSign,
        fallbackForward.y
      );
      const entryLeadDistancePx = host.clamp(
        Math.hypot(desiredLead.cx - start.cx, desiredLead.cy - start.cy) * 0.26,
        56,
        92
      );
      const entryLead = host.offsetAirShowPoint(
        start,
        entryForward.x * entryLeadDistancePx,
        entryForward.y * entryLeadDistancePx
      );
      const sideLead = {
        cx: earlyHomeX - renderedOffsetPx,
        cy: desiredLead.cy
      };
      const sideCommit = {
        cx: farHomeX - renderedOffsetPx,
        cy: start.cy + releaseDy * 0.58
      };
      const sideExit = {
        cx: farHomeX - renderedOffsetPx,
        cy: rawEnd.cy
      };
      const points = dedupePath([
        start,
        entryLead,
        sideLead,
        sideCommit,
        sideExit
      ]);
      return {
        ...assignment,
        points,
        progressTimeline: [
          { timeMs: 0, progress: 0 },
          { timeMs: Math.round(targetRunDurationMs * 0.24), progress: 0.5 },
          { timeMs: Math.round(targetRunDurationMs * 0.46), progress: 0.86 },
          { timeMs: targetRunDurationMs, progress: 1 }
        ]
      };
    };

    const targetRunFighterAssignments = [...activeFlights(interceptorFlights), ...activeFlights(escortFlights)].flatMap((flight, index, flights) => {
      const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const roleSide = flight.spec.role === "interceptor" ? -1 : 1;
      const awayFromStrike = {
        x: corridor.normal.x * roleSide,
        y: corridor.normal.y * roleSide
      };
      const homeSideSign = flight.spec.role === "interceptor" ? 1 : -1;
      const peelDistancePx = Math.max(150, targetRunDurationMs * host.airShowFighterSpeedPxPerMs * 0.92);
      const radialAway = normalizeVector(
        current.cx - center.cx + homeSideSign * 120,
        current.cy - center.cy,
        awayFromStrike.x,
        awayFromStrike.y
      );
      const rawPeelPoint = host.offsetAirShowPoint(
        current,
        radialAway.x * peelDistancePx + corridor.axis.x * 36,
        radialAway.y * peelDistancePx + corridor.axis.y * 36
      );
      const sideCommittedPeelX = resolveFighterHomeSideX(
        flight.spec.role === "interceptor" ? "interceptor" : "escort",
        Math.min(homeSideVisibleWidthPx * 0.42, 480),
        (index - (flights.length - 1) / 2) * 14
      );
      const peelPoint = {
        ...rawPeelPoint,
        cx:
          homeSideSign < 0
            ? Math.min(rawPeelPoint.cx, sideCommittedPeelX)
            : Math.max(rawPeelPoint.cx, sideCommittedPeelX)
      };
      return buildAssignmentsForFlightPath(
        flight,
        buildAirShowPresetRailPath(corridor, current, peelPoint, {
          lateralPx: host.resolveAirShowCorridorCoordinates(corridor, peelPoint).lateralPx,
          midLateralPx: host.resolveAirShowCorridorCoordinates(corridor, peelPoint).lateralPx,
          entryProgress: 0.4,
          exitProgress: 0.76
        }),
        0.28
      );
    });
    const rawTargetRunAssignments = [
      ...bomberPlans.flatMap((plan) => buildAssignmentsForFlightPath(plan.flight, plan.targetRunPath, 0.24)),
      ...targetRunFighterAssignments
    ];
    const rawTargetRunAssignmentByActorId = new Map(
      rawTargetRunAssignments.map((assignment) => [assignment.actor.id, assignment] as const)
    );
    const preparedTargetRunAssignments = host.prepareAirShowPhaseAssignments(
      rawTargetRunAssignments,
      targetRunDurationMs,
      [0.2, 0.5, 0.78],
      44,
      roleSpeeds,
      {
        previousAssignments: previousPhaseAssignments,
        previousDurationMs: previousPhaseDurationMs,
        entryTurnLimitDeg: 58,
        softenEntryRoles: ["bomber", "interceptor", "escort"],
        softenEntryTurnLimitDeg: 72,
        softenEntryWaypointCount: 18,
        softenExitRoles: ["interceptor", "escort"],
        softenExitTurnLimitDeg: 82,
        softenExitWaypointCount: 12,
        sanitizeEntryTurns: true,
        sanitizeEntryTurnLimitDeg: 42,
        sanitizeEntryStrongTurnDeg: 84,
        sanitizeEntryMaxFirstSegmentPx: 92,
        sanitizeEntryMaxSharpTurnDeg: 96,
        sanitizeEntryMaxWaypointsToRemove: 5
      }
    );
    const targetRunAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
      preparedTargetRunAssignments,
      targetRunDurationMs,
      roleSpeeds,
      {
        clampCenter: corridor.strike,
        orbitSignByRole: {
          interceptor: -1,
          escort: 1,
          bomber: 1
        },
        extendAtByRole: {
          interceptor: "end",
          escort: "end",
          bomber: "end"
        },
        maxHorizontalPx: 520,
        maxVerticalPx: 360,
        extensionMode: "carry",
        extensionModeByRole: {
          interceptor: "carry",
          escort: "carry",
          bomber: "carry"
        }
      }
    ).map((assignment) => {
      if (assignment.actor.role !== "bomber") {
        return buildHomeSideTargetRunFighterPath(assignment);
      }
      const rawAssignment = rawTargetRunAssignmentByActorId.get(assignment.actor.id);
      if (!rawAssignment || rawAssignment.points.length <= 0) {
        return assignment;
      }
      const preparedStart = assignment.points[0] ?? rawAssignment.points[0]!;
      const rawStart = rawAssignment.points[0]!;
      const dx = preparedStart.cx - rawStart.cx;
      const dy = preparedStart.cy - rawStart.cy;
      return {
        ...assignment,
        points: rawAssignment.points.map((point) => ({ cx: point.cx + dx, cy: point.cy + dy })),
        progressTimeline: undefined
      };
    });
    recordPhase(
      "target-run",
      targetRunAssignments,
      targetRunDurationMs,
      [],
      resolveContinuousFlakBursts(targetRunAssignments, targetRunDurationMs, "target"),
      roleSpeeds
    );
    commitCorridorPhaseEndState(targetRunAssignments, targetRunDurationMs);
    previousPhaseAssignments = targetRunAssignments;
    previousPhaseDurationMs = targetRunDurationMs;
    updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);

    bomberFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
    const egressFighterFlights = [...activeFlights(interceptorFlights), ...activeFlights(escortFlights)];
    const egressFighterAssignments = egressFighterFlights.flatMap((flight, index) => {
      const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
      const headingDegrees = host.resolveAirShowFlightHeadingDegrees(flight);
      const outwardFallback = normalizeVector(
        current.cx - center.cx,
        current.cy - center.cy,
        corridor.axis.x,
        corridor.axis.y
      );
      const forward = resolveHeadingVector(headingDegrees, outwardFallback);
      const boundary = mapBounds
        ? resolveAirShowBoundsRayIntersection(current, forward, mapBounds)
        : null;
      const lateral = { x: -forward.y, y: forward.x };
      const formationOffsetPx = (index - (egressFighterFlights.length - 1) / 2) * 34;
      const home = boundary
        ? host.offsetAirShowPoint(
            boundary,
            forward.x * host.offMapDistancePx + lateral.x * formationOffsetPx,
            forward.y * host.offMapDistancePx + lateral.y * formationOffsetPx
          )
        : host.offsetAirShowPoint(
            current,
            forward.x * (host.offMapDistancePx + 520) + lateral.x * formationOffsetPx,
            forward.y * (host.offMapDistancePx + 520) + lateral.y * formationOffsetPx
          );
      return buildAssignmentsForFlightPath(
        flight,
        host.sanitizeAirShowEntryPath(
          host.buildAirShowDisengagePath(current, home, {
            startHeadingDegrees: headingDegrees,
            lateralSign: flight.spec.role === "interceptor" ? -1 : 1,
            corridorWidthPx: 18,
            driftPx: 10,
            preferForwardContinuous: true
          }),
          {
            maxTurnDeg: 42,
            strongTurnDeg: 78,
            maxFirstSegmentPx: 82,
            maxSharpTurnDeg: 104,
            maxWaypointsToRemove: 2
          }
        ),
        0.26
      );
    });
    const rawEgressAssignments = [...buildBomberEgressAssignments(activeFlights(bomberFlights)), ...egressFighterAssignments];
    const preserveBomberEgressEntryMotion = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>
    ): AirShowPhaseAssignment[] =>
      assignments.map((assignment) => {
        if (assignment.actor.role !== "bomber" || assignment.points.length < 2) {
          return assignment;
        }
        const boundaryMotion = resolvePreviousActorSampledBoundaryVector(assignment.actor.id);
        if (!boundaryMotion) {
          return assignment;
        }
        const finalPoint = assignment.points[assignment.points.length - 1];
        if (!finalPoint) {
          return assignment;
        }
        const entryForward = normalizeVector(
          boundaryMotion.dx,
          boundaryMotion.dy,
          finalPoint.cx - boundaryMotion.start.cx,
          finalPoint.cy - boundaryMotion.start.cy
        );
        const entryHeadingDegrees =
          ((Math.atan2(entryForward.y, entryForward.x) * 180) / Math.PI + 90 + 360) % 360;
        const lateralSign = host.resolveAirShowRouteSideSign(
          boundaryMotion.start,
          finalPoint,
          entryHeadingDegrees,
          1
        );
        const distancePx = Math.max(
          1,
          Math.hypot(finalPoint.cx - boundaryMotion.start.cx, finalPoint.cy - boundaryMotion.start.cy)
        );
        const carryForwardPx = Math.min(160, Math.max(120, distancePx * 0.1));
        const entryCarryPoint = host.offsetAirShowPoint(
          boundaryMotion.start,
          entryForward.x * carryForwardPx,
          entryForward.y * carryForwardPx
        );
        const tailPath = buildForwardContinuousRoutePath(
          entryCarryPoint,
          finalPoint,
          {
            startHeadingDegrees: entryHeadingDegrees,
            lateralSign,
            minRouteDot: -0.72,
            carryForwardPx: Math.min(140, Math.max(96, distancePx * 0.12)),
            earlyAlongPx: Math.max(96, distancePx * 0.26),
            midAlongPx: Math.max(168, distancePx * 0.56),
            lateAlongPx: Math.max(240, distancePx * 0.84),
            entryLateralPx: 14,
            midLateralPx: 9,
            lateLateralPx: 4
          }
        );
        return {
          ...assignment,
          points: [boundaryMotion.start, entryCarryPoint, ...tailPath.slice(1)]
            .filter((point, pointIndex, path) => {
              if (pointIndex === 0) {
                return true;
              }
              const previous = path[pointIndex - 1];
              return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
            })
        };
      });
    if (rawEgressAssignments.length > 0) {
      let egressDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
        rawEgressAssignments,
        roleSpeeds,
        targetRunDurationMs,
        1,
        60000
      );
      let egressAssignments = host.prepareAirShowPhaseAssignments(
        host.extendAirShowPhaseAssignmentsForSpeed(
          rawEgressAssignments,
          egressDurationMs,
          roleSpeeds,
          {
            clampCenter: corridor.strike,
            orbitSignByRole: {
              interceptor: -1,
              escort: 1,
              bomber: 1
            },
            extendAtByRole: {
              interceptor: "end",
              escort: "end",
              bomber: "end"
            },
            maxHorizontalPx: 560,
            maxVerticalPx: 380,
            extensionMode: "carry"
          }
        ),
        egressDurationMs,
        [0.2, 0.5, 0.8],
        44,
        roleSpeeds,
        {
          previousAssignments: previousPhaseAssignments,
          previousDurationMs: previousPhaseDurationMs,
          entryTurnLimitDeg: 60,
          softenEntryRoles: ["bomber", "interceptor", "escort"],
          softenEntryTurnLimitDeg: 72,
          softenEntryWaypointCount: 18,
          softenExitRoles: ["bomber", "interceptor", "escort"],
          softenExitTurnLimitDeg: 84,
          softenExitWaypointCount: 12,
          sanitizeEntryTurns: true,
          sanitizeEntryTurnLimitDeg: 42,
          sanitizeEntryStrongTurnDeg: 84,
          sanitizeEntryMaxFirstSegmentPx: 92,
          sanitizeEntryMaxSharpTurnDeg: 96,
          sanitizeEntryMaxWaypointsToRemove: 5
        }
      );
      egressAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
        egressAssignments,
        egressDurationMs,
        roleSpeeds,
        {
          clampCenter: corridor.strike,
          orbitSignByRole: {
            interceptor: -1,
            escort: 1,
            bomber: 1
          },
          extendAtByRole: {
            interceptor: "end",
            escort: "end",
            bomber: "end"
          },
          maxHorizontalPx: 560,
          maxVerticalPx: 380,
          extensionMode: "carry"
        }
      );
      egressDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
        egressAssignments,
        roleSpeeds,
        egressDurationMs,
        1,
        60000
      );
      egressAssignments = host.prepareAirShowPhaseAssignments(
        host.extendAirShowPhaseAssignmentsForSpeed(
          egressAssignments,
          egressDurationMs,
          roleSpeeds,
          {
            clampCenter: corridor.strike,
            orbitSignByRole: {
              interceptor: -1,
              escort: 1,
              bomber: 1
            },
            extendAtByRole: {
              interceptor: "end",
              escort: "end",
              bomber: "end"
            },
            maxHorizontalPx: 560,
            maxVerticalPx: 380,
            extensionMode: "carry"
          }
        ),
        egressDurationMs,
        [0.2, 0.5, 0.8],
        44,
        roleSpeeds,
        {
          previousAssignments: previousPhaseAssignments,
          previousDurationMs: previousPhaseDurationMs,
          entryTurnLimitDeg: 60,
          softenEntryRoles: ["bomber", "interceptor", "escort"],
          softenEntryTurnLimitDeg: 72,
          softenEntryWaypointCount: 18,
          softenExitRoles: ["bomber", "interceptor", "escort"],
          softenExitTurnLimitDeg: 84,
          softenExitWaypointCount: 12,
          sanitizeEntryTurns: true,
          sanitizeEntryTurnLimitDeg: 42,
          sanitizeEntryStrongTurnDeg: 84,
          sanitizeEntryMaxFirstSegmentPx: 92,
          sanitizeEntryMaxSharpTurnDeg: 96,
          sanitizeEntryMaxWaypointsToRemove: 5
        }
      );
      egressAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
        egressAssignments,
        egressDurationMs,
        roleSpeeds,
        {
          clampCenter: corridor.strike,
          orbitSignByRole: {
            interceptor: -1,
            escort: 1,
            bomber: 1
          },
          extendAtByRole: {
            interceptor: "end",
            escort: "end",
            bomber: "end"
          },
          maxHorizontalPx: 560,
          maxVerticalPx: 380,
          extensionMode: "carry"
        }
      );
      const buildHomeSideFighterEgressAssignment = (
        assignment: AirShowPhaseAssignment,
        durationMs: number
      ): AirShowPhaseAssignment => {
        if (
          assignment.actor.role !== "interceptor"
          && assignment.actor.role !== "escort"
        ) {
          return assignment;
        }
        const start = assignment.points[0] ?? assignment.actor.position;
        const rawSecond = assignment.points[1] ?? start;
        const rawEnd = assignment.points[assignment.points.length - 1] ?? rawSecond;
        const renderedOffsetPx = assignment.multiFlightOffsetPx ?? 0;
        const laneOffsetPx = (assignment.actor.formationIndex - 0.5) * 28;
        const sideSign = assignment.actor.role === "interceptor" ? 1 : -1;
        const fallbackForward = resolveHeadingVector(assignment.actor.headingDegrees, {
          x: rawEnd.cx - start.cx,
          y: rawEnd.cy - start.cy
        });
        const entryForward = normalizeVector(
          rawSecond.cx - start.cx,
          rawSecond.cy - start.cy,
          fallbackForward.x,
          fallbackForward.y
        );
        const renderedStartX = start.cx + renderedOffsetPx;
        const sideGuardX = resolveFighterHomeSideX(
          assignment.actor.role,
          Math.min(homeSideVisibleWidthPx * 0.36, 420),
          laneOffsetPx
        );
        const committedStartSideX =
          sideSign < 0
            ? Math.min(renderedStartX, sideGuardX)
            : Math.max(renderedStartX, sideGuardX);
        const offMapExitX = visibleBounds
          ? (
              sideSign < 0
                ? visibleBounds.minX - host.offMapDistancePx * 0.86 - Math.abs(laneOffsetPx)
                : visibleBounds.maxX + host.offMapDistancePx * 0.86 + Math.abs(laneOffsetPx)
            )
          : homeSideMidX + sideSign * (homeSideVisibleWidthPx * 0.9 + host.offMapDistancePx);
        const egressDy = rawEnd.cy - start.cy;
        const entryLead = {
          cx: committedStartSideX - renderedOffsetPx,
          cy: start.cy + entryForward.y * 64
        };
        const exitMid = {
          cx: committedStartSideX * 0.36 + offMapExitX * 0.64 - renderedOffsetPx,
          cy: start.cy + egressDy * 0.58
        };
        const exitPoint = {
          cx: offMapExitX - renderedOffsetPx,
          cy: rawEnd.cy
        };
        return {
          ...assignment,
          points: dedupePath([
            start,
            entryLead,
            exitMid,
            exitPoint
          ]),
          progressTimeline: [
            { timeMs: 0, progress: 0 },
            { timeMs: Math.round(durationMs * 0.18), progress: 0.5 },
            { timeMs: Math.round(durationMs * 0.46), progress: 0.86 },
            { timeMs: durationMs, progress: 1 }
          ]
        };
      };
      egressAssignments = preserveBomberEgressEntryMotion(egressAssignments).map((assignment) =>
        buildHomeSideFighterEgressAssignment(assignment, egressDurationMs)
      );
      egressDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
        egressAssignments,
        roleSpeeds,
        egressDurationMs,
        1,
        60000
      );
      recordPhase("egress", egressAssignments, egressDurationMs, [], [], roleSpeeds);
      commitCorridorPhaseEndState(egressAssignments, egressDurationMs);
      previousPhaseAssignments = egressAssignments;
      previousPhaseDurationMs = egressDurationMs;
      updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
    }

    return buildPlannedAirShowSceneReport();
  };

  const corridorContestedPlan = buildCorridorContestedAirShowPlan();
  if (corridorContestedPlan) {
    return corridorContestedPlan;
  }

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
          const activeBomberFlights = activeFlights(bomberFlights);
          const escortBeatHasActiveBombers = bomberFlights.some((flight) =>
            flight.actors.some((actor) => actor.active)
          );
          const resolvedEscortBeatDurationDefaultMs =
            beat === 1 && escortBeatHasActiveBombers
              ? Math.round(defaultEscortBeatDurationMs * 0.8)
              : defaultEscortBeatDurationMs;
          const escortClashFlightsById = new Map(
            [...activeInterceptorFlights, ...activeEscortFlights].map((flight) => [flight.spec.id, flight] as const)
          );
          const rawClashCenter = host.resolveAirShowEscortClashCenter(
            corridor,
            activeInterceptorFlights,
            activeEscortFlights,
            beat
          );
          const bomberCenterForClash =
            beat === 1
              ? host.averageAirShowPoints(activeBomberFlights.map(resolveFlightCurrentPoint))
              : null;
          const clashCenter =
            bomberCenterForClash && activeBomberFlights.length > 0
              ? {
                  cx: rawClashCenter.cx * 0.12 + bomberCenterForClash.cx * 0.88,
                  cy: rawClashCenter.cy * 0.12 + bomberCenterForClash.cy * 0.88
                }
              : rawClashCenter;
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
            const alongLimitPx =
              beat === 0
                ? 56
                : activeBomberFlights.length > 0
                  ? 340
                  : 78;
            const projectedPoint = host.projectAirShowCorridorPoint(
              corridor,
              host.clamp(
                baseProjection.alongPx * (isSyntheticPair ? (beat === 0 ? 0.34 : 0.26) : (beat === 0 ? 0.62 : 0.5))
                + midpointProjection.alongPx * (isSyntheticPair ? (beat === 0 ? 0.66 : 0.74) : (beat === 0 ? 0.38 : 0.5)),
                -alongLimitPx,
                alongLimitPx
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
          const escortCombatFocusByFlightId = new Map<string, AirShowPoint>();
          groupStates.forEach((state) => {
            [...state.group.interceptorFlights, ...state.group.escortFlights].forEach((flight) => {
              escortCombatFocusByFlightId.set(flight.spec.id, state.groupCenter);
            });
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
                ? (crowdedGroup ? 30 : 34)
                : (crowdedGroup ? 72 : 80);
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
              const pairFightMidpoint: AirShowPoint = {
                cx: (current.cx + targetEscortPoint.cx) / 2,
                cy: (current.cy + targetEscortPoint.cy) / 2
              };
              const localizedFightCenter = {
                cx: pairFightMidpoint.cx * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cx * (crowdedGroup ? 0.26 : 0.12),
                cy: pairFightMidpoint.cy * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cy * (crowdedGroup ? 0.26 : 0.12)
              };
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
              const preferContinuousScrambleClosure =
                !hasActiveBomberFlights
                || crowdedGroup
                || isSyntheticGroup
                || scrambleRouteDot <= (hasActiveBomberFlights ? 0.16 : 0.34);
              const scrambleTighteningFocusPoint =
                hasActiveBomberFlights
                  ? sharedScrambleFocusPoint
                  : scrambleFocusPoint;
              const scrambleJoinPath =
                hasActiveBomberFlights
                  ? (
                      preferContinuousScrambleClosure
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
                      preferContinuousScrambleClosure
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
                      tightenPathAroundFightSpace(
                        scrambleJoinPath,
                        scrambleTighteningFocusPoint,
                        scrambleTighteningRadiusPx
                      ),
                      hasActiveBomberFlights ? 22 : 30
                    ),
                    {
                      maxTurnDeg: hasActiveBomberFlights ? 38 : 34,
                      strongTurnDeg: hasActiveBomberFlights ? 80 : 72,
                      maxFirstSegmentPx: hasActiveBomberFlights ? 58 : 52,
                      maxSharpTurnDeg: hasActiveBomberFlights ? 108 : 96,
                      maxWaypointsToRemove: hasActiveBomberFlights ? 2 : 3
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
              const pairFightMidpoint: AirShowPoint = {
                cx: (current.cx + targetInterceptorPoint.cx) / 2,
                cy: (current.cy + targetInterceptorPoint.cy) / 2
              };
              const localizedFightCenter = {
                cx: pairFightMidpoint.cx * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cx * (crowdedGroup ? 0.26 : 0.12),
                cy: pairFightMidpoint.cy * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cy * (crowdedGroup ? 0.26 : 0.12)
              };
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
              const preferContinuousScrambleClosure =
                !hasActiveBomberFlights
                || crowdedGroup
                || isSyntheticGroup
                || scrambleRouteDot <= (hasActiveBomberFlights ? 0.22 : 0.34);
              const scrambleTighteningFocusPoint =
                hasActiveBomberFlights
                  ? sharedScrambleFocusPoint
                  : localizedFightCenter;
              const escortScramblePath =
                hasActiveBomberFlights
                  ? (
                      preferContinuousScrambleClosure
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
                      preferContinuousScrambleClosure
                        ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                            startHeadingDegrees,
                            lateralSign: sideSign,
                            minRouteDot: -0.14,
                            carryForwardPx: crowdedGroup ? 30 : 36,
                            earlyAlongPx: crowdedGroup ? 46 : 58,
                            midAlongPx: crowdedGroup ? 74 : 90,
                            lateAlongPx: crowdedGroup ? 98 : 118,
                            entryLateralPx: 10 + Math.abs(localLane) * 2.5,
                            midLateralPx: 5 + Math.abs(localLane) * 1.5,
                            lateLateralPx: 2 + Math.abs(localLane)
                          })
                        : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
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
                      tightenPathAroundFightSpace(
                        escortScramblePath,
                        scrambleTighteningFocusPoint,
                        scrambleTighteningRadiusPx
                      ),
                      hasActiveBomberFlights ? 20 : 28
                    ),
                    {
                      maxTurnDeg: hasActiveBomberFlights ? 36 : 32,
                      strongTurnDeg: hasActiveBomberFlights ? 78 : 70,
                      maxFirstSegmentPx: hasActiveBomberFlights ? 56 : 50,
                      maxSharpTurnDeg: hasActiveBomberFlights ? 106 : 94,
                      maxWaypointsToRemove: hasActiveBomberFlights ? 2 : 3
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

          const escortClashRoleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: host.airShowBomberSpeedPxPerMs
          });
          const escortBeatDurationFloorMs =
            beat === 0
              ? resolvedEscortBeatDurationDefaultMs
              : Math.max(
                  activeBomberFlights.length > 0 ? 860 : 980,
                  Math.round(
                    resolvedEscortBeatDurationDefaultMs
                    * (activeBomberFlights.length > 0 ? 0.74 : 0.82)
                  )
                );
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
          const escortBeatDurationMs =
            beat === 0
              ? resolvedEscortBeatDurationDefaultMs
              : host.resolveAirShowPhaseDurationFromRoleSpeeds(
                  phaseAssignments,
                  escortClashRoleSpeeds,
                  resolvedEscortBeatDurationDefaultMs,
                  escortBeatDurationFloorMs,
                  resolvedEscortBeatDurationDefaultMs,
                  ["interceptor", "escort"]
                );
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
          const escortPhasePreparationOptions = {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: beat === 0 ? 72 : 52,
            softenEntryRoles: beat === 1 ? ["interceptor", "escort"] : undefined,
            softenEntryTurnLimitDeg: beat === 1 ? 68 : undefined,
            softenEntryWaypointCount: beat === 1 ? 18 : undefined,
            softenExitRoles: beat === 1 ? ["interceptor", "escort"] : undefined,
            softenExitTurnLimitDeg: beat === 1 ? 76 : undefined,
            softenExitWaypointCount: beat === 1 ? 14 : undefined
          };
          let resolvedPhaseAssignments = host.prepareAirShowPhaseAssignments(
            extendedPhaseAssignments,
            escortBeatDurationMs,
            [0.3, 0.5, 0.7],
            beat === 0 ? 42 : 40,
            escortClashRoleSpeeds,
            escortPhasePreparationOptions
          );
          if (beat === 0) {
            const mergeStartPointsByRole = new Map<"interceptor" | "escort", AirShowPoint[]>();
            resolvedPhaseAssignments.forEach((assignment) => {
              if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                return;
              }
              const startPoint = assignment.points[0];
              if (!startPoint) {
                return;
              }
              const roleStartPoints = mergeStartPointsByRole.get(assignment.actor.role) ?? [];
              roleStartPoints.push(startPoint);
              mergeStartPointsByRole.set(assignment.actor.role, roleStartPoints);
            });
            resolvedPhaseAssignments = resolvedPhaseAssignments.map((assignment) => {
              if (
                (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort")
                || assignment.points.length < 2
              ) {
                return assignment;
              }
              const startPoint = assignment.points[0];
              if (!startPoint) {
                return assignment;
              }
              const opposingRole = assignment.actor.role === "interceptor" ? "escort" : "interceptor";
              const opposingStarts = mergeStartPointsByRole.get(opposingRole) ?? [];
              if (opposingStarts.length <= 0) {
                return assignment;
              }
              const nearestOpposingStart = opposingStarts.reduce((nearest, candidate) => {
                const nearestDistancePx = Math.hypot(
                  startPoint.cx - nearest.cx,
                  startPoint.cy - nearest.cy
                );
                const candidateDistancePx = Math.hypot(
                  startPoint.cx - candidate.cx,
                  startPoint.cy - candidate.cy
                );
                return candidateDistancePx < nearestDistancePx ? candidate : nearest;
              });
              const awayVector = normalizeVector(
                startPoint.cx - nearestOpposingStart.cx,
                startPoint.cy - nearestOpposingStart.cy,
                assignment.actor.role === "interceptor" ? -corridor.normal.x : corridor.normal.x,
                assignment.actor.role === "interceptor" ? -corridor.normal.y : corridor.normal.y
              );
              const laneOffsetPx = assignment.actor.formationIndex * 4;
              const earlyStagingPoint = {
                cx:
                  startPoint.cx
                  + awayVector.x * 156
                  + corridor.normal.x * laneOffsetPx,
                cy:
                  startPoint.cy
                  + awayVector.y * 156
                  + corridor.normal.y * laneOffsetPx
              };
              return {
                ...assignment,
                points: [
                  startPoint,
                  earlyStagingPoint,
                  ...assignment.points.slice(1)
                ]
              };
            });
          }
            if (beat === 1) {
              let scrambleBoundaryRepairApplied = false;
              const repairedScrambleAssignments = resolvedPhaseAssignments.map((assignment) => {
              if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                return assignment;
              }
              const flight = escortClashFlightsById.get(assignment.actor.flightId);
              if (!flight) {
                return assignment;
              }
              const previousBoundaryVector = resolvePreviousPhaseBoundaryVector(flight);
              if (!previousBoundaryVector || assignment.points.length < 2) {
                return assignment;
              }
              const startPoint = assignment.points[0];
              const nextPoint = assignment.points.find((point, index) =>
                index > 0 && !!startPoint && Math.hypot(point.cx - startPoint.cx, point.cy - startPoint.cy) > 0.5
              );
              if (!startPoint || !nextPoint) {
                return assignment;
              }
              const entryTurnDeg = resolveVectorAngleDegrees(
                {
                  x: previousBoundaryVector.dx,
                  y: previousBoundaryVector.dy
                },
                {
                  x: nextPoint.cx - startPoint.cx,
                  y: nextPoint.cy - startPoint.cy
                }
              );
              if (entryTurnDeg < 110) {
                return assignment;
              }
              const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
                flight,
                host.resolveAirShowFlightHeadingDegrees(flight)
              );
              const endPoint = assignment.points[assignment.points.length - 1] ?? nextPoint;
              const routeSideSign = host.resolveAirShowRouteSideSign(
                startPoint,
                endPoint,
                startHeadingDegrees,
                assignment.actor.role === "interceptor" ? -1 : 1
              );
              const forwardVector = resolveHeadingVector(startHeadingDegrees, {
                x: endPoint.cx - startPoint.cx,
                y: endPoint.cy - startPoint.cy
              });
              const forwardLeadDistancePx =
                assignment.actor.role === "interceptor" ? 84 : 72;
              const forwardLeadBlend =
                assignment.actor.role === "interceptor" ? 0.18 : 0.22;
              const forwardLeadPoint: AirShowPoint = {
                cx:
                  startPoint.cx
                  + forwardVector.x * forwardLeadDistancePx
                  + (endPoint.cx - startPoint.cx) * forwardLeadBlend,
                cy:
                  startPoint.cy
                  + forwardVector.y * forwardLeadDistancePx
                  + (endPoint.cy - startPoint.cy) * forwardLeadBlend
              };
              scrambleBoundaryRepairApplied = true;
              return {
                ...assignment,
                points: host.sanitizeAirShowEntryPath(
                  [
                    startPoint,
                    forwardLeadPoint,
                    ...buildForwardContinuousRoutePath(forwardLeadPoint, endPoint, {
                      startHeadingDegrees,
                      lateralSign: routeSideSign,
                      minRouteDot: -0.08,
                      carryForwardPx: assignment.actor.role === "interceptor" ? 72 : 64,
                      earlyAlongPx: assignment.actor.role === "interceptor" ? 108 : 96,
                      midAlongPx: assignment.actor.role === "interceptor" ? 156 : 142,
                      lateAlongPx: assignment.actor.role === "interceptor" ? 204 : 188,
                      entryLateralPx: assignment.actor.role === "interceptor" ? 18 : 16,
                      midLateralPx: assignment.actor.role === "interceptor" ? 7 : 6,
                      lateLateralPx: 3
                    }).slice(1)
                  ],
                  assignment.actor.role === "interceptor"
                    ? {
                        maxTurnDeg: 34,
                        strongTurnDeg: 72,
                        maxFirstSegmentPx: 52,
                        maxSharpTurnDeg: 96,
                        maxWaypointsToRemove: 4
                      }
                    : {
                        maxTurnDeg: 32,
                        strongTurnDeg: 68,
                        maxFirstSegmentPx: 48,
                        maxSharpTurnDeg: 92,
                        maxWaypointsToRemove: 4
                      }
                )
              };
            });
            if (scrambleBoundaryRepairApplied) {
              resolvedPhaseAssignments = host.prepareAirShowPhaseAssignments(
                repairedScrambleAssignments,
                escortBeatDurationMs,
                [0.3, 0.5, 0.7],
                44,
                escortClashRoleSpeeds,
                {
                  ...escortPhasePreparationOptions,
                  entryTurnLimitDeg: 48,
                  softenEntryTurnLimitDeg: 64,
                  softenEntryWaypointCount: 20,
                  softenExitTurnLimitDeg: 72,
                  softenExitWaypointCount: 16
                }
              );
            }
          }
          resolvedPhaseAssignments = reinforceCompactFighterTravel(
            resolvedPhaseAssignments,
            escortBeatDurationMs,
            beat === 0 ? 0.034 : 0.064,
            escortCombatFocusByFlightId,
            {
              hasActiveBombers: activeBomberFlights.length > 0,
              phase: beat === 0 ? "merge" : "scramble"
            }
          );
          if (beat === 1) {
            const hasActiveBomberFlightsForScramble = bomberFlights.some((flight) =>
              flight.actors.some((actor) => actor.active)
            );
            resolvedPhaseAssignments = resolvedPhaseAssignments.map((assignment) => {
              if (
                assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort"
              ) {
                return assignment;
              }
              const focusPoint = escortCombatFocusByFlightId.get(assignment.actor.flightId);
              if (!focusPoint || assignment.points.length < 3) {
                return assignment;
              }
              const lastIndex = assignment.points.length - 1;
              const tightenedPoints = assignment.points.map((point, index) => {
                if (index === 0) {
                  return point;
                }
                const dx = point.cx - focusPoint.cx;
                const dy = point.cy - focusPoint.cy;
                const distancePx = Math.hypot(dx, dy);
                if (distancePx < 0.001) {
                  return point;
                }
                const progress = index / Math.max(1, lastIndex);
                const maxDistancePx = hasActiveBomberFlightsForScramble
                  ? host.clamp(
                      82 - progress * 16 + Math.abs(assignment.actor.formationIndex) * 2,
                      54,
                      90
                    )
                  : host.clamp(
                      164 - progress * 14 + Math.abs(assignment.actor.formationIndex) * 6,
                      132,
                      182
                    );
                const minDistancePx = hasActiveBomberFlightsForScramble
                  ? host.clamp(
                      34
                        + Math.sin(progress * Math.PI) * 6
                        + Math.abs(assignment.actor.formationIndex) * 1.4,
                      30,
                      Math.max(32, maxDistancePx - 5)
                    )
                  : host.clamp(
                      88
                        + Math.sin(progress * Math.PI) * 14
                        + Math.abs(assignment.actor.formationIndex) * 5,
                      78,
                      Math.max(82, maxDistancePx - 8)
                    );
                const targetDistancePx = host.clamp(distancePx, minDistancePx, maxDistancePx);
                const scale = targetDistancePx / distancePx;
                const combatWeaveRadians =
                  hasActiveBomberFlightsForScramble && progress > 0.16 && progress < 0.94
                    ? Math.sin(progress * Math.PI * 4 + assignment.actor.formationIndex * 0.65) * 0.24
                    : 0;
                const cos = Math.cos(combatWeaveRadians);
                const sin = Math.sin(combatWeaveRadians);
                const clippedDx = dx * scale;
                const clippedDy = dy * scale;
                return {
                  cx: focusPoint.cx + clippedDx * cos - clippedDy * sin,
                  cy: focusPoint.cy + clippedDx * sin + clippedDy * cos
                };
              });
              return {
                ...assignment,
                points: host.sanitizeAirShowEntryPath(
                  tightenedPoints,
                  assignment.actor.role === "interceptor"
                    ? {
                        maxTurnDeg: hasActiveBomberFlightsForScramble ? 36 : 42,
                        strongTurnDeg: hasActiveBomberFlightsForScramble ? 74 : 86,
                        maxFirstSegmentPx: hasActiveBomberFlightsForScramble ? 58 : 72,
                        maxSharpTurnDeg: hasActiveBomberFlightsForScramble ? 98 : 112,
                        maxWaypointsToRemove: 3
                      }
                    : {
                        maxTurnDeg: hasActiveBomberFlightsForScramble ? 34 : 40,
                        strongTurnDeg: hasActiveBomberFlightsForScramble ? 72 : 84,
                        maxFirstSegmentPx: hasActiveBomberFlightsForScramble ? 56 : 70,
                        maxSharpTurnDeg: hasActiveBomberFlightsForScramble ? 96 : 110,
                        maxWaypointsToRemove: 3
                      }
                )
              };
            });
            resolvedPhaseAssignments = reinforceCompactFighterTravel(
              resolvedPhaseAssignments,
              escortBeatDurationMs,
              0.064,
              escortCombatFocusByFlightId,
              {
                hasActiveBombers: hasActiveBomberFlightsForScramble,
                phase: "scramble"
              }
            );
          }
          const timedPhaseAssignments =
            beat === 0
              ? host.shapeCompactAirShowMergeAssignments(resolvedPhaseAssignments, escortBeatDurationMs)
              : resolvedPhaseAssignments;
          groupStates.forEach((state) => {
            const baseTimings = beat === 0
              ? [0.52, 0.64, 0.76, 0.88]
              : [0.14, 0.26, 0.38, 0.5, 0.62, 0.74];
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
        Math.max(120, Math.min(260, Math.round((scene.bomberArrivalDelayMs ?? 0) * 0.58))),
        [],
        [],
        host.resolveAirShowRoleSpeedMap({
          interceptor: host.airShowFighterSpeedPxPerMs,
          escort: host.airShowFighterSpeedPxPerMs
        })
      );
      updateFlightAnchors([...survivingInterceptors, ...survivingEscorts]);
    }

    type ScopedFlakBurst = NonNullable<ResolvedAirShowScene["flakBursts"]>[number];
    const scopedFlakBurstsByBomberId = new Map<string, ReadonlyArray<ScopedFlakBurst>>();
    const resolveScopedBomberFlakBursts = (
      flight: AirShowRuntimeFlightInternal
    ): ReadonlyArray<ScopedFlakBurst> => {
      const cached = scopedFlakBurstsByBomberId.get(flight.spec.id);
      if (cached) {
        return cached;
      }
      const bursts = host.resolveAirShowBomberFlakBursts(scene, flight.spec.id);
      scopedFlakBurstsByBomberId.set(flight.spec.id, bursts);
      return bursts;
    };
    const buildScopedFlakBurstKey = (burst: ScopedFlakBurst): string =>
      [
        burst.bomberUnitKey ?? "unscoped",
        burst.targetHexKey ?? "target",
        Math.round((burst.progress ?? 0) * 1000),
        Math.round((burst.alongOffsetPx ?? 0) * 10),
        Math.round((burst.lateralOffsetPx ?? 0) * 10),
        burst.count ?? 0
      ].join("|");
    const collectScopedBomberFlakBursts = (
      flights: ReadonlyArray<AirShowRuntimeFlightInternal>
    ): ScopedFlakBurst[] =>
      Array.from(
        new Map(
          flights.flatMap((flight) =>
            resolveScopedBomberFlakBursts(flight).map((burst) => [
              buildScopedFlakBurstKey(burst),
              burst
            ] as const)
          )
        ).values()
      );
    const remapFlakBurstsToPhase = (
      bursts: ReadonlyArray<ScopedFlakBurst>,
      options: {
        globalStartProgress: number;
        globalEndProgress: number;
        localStartProgress: number;
        localEndProgress: number;
        includeEnd?: boolean;
      }
    ): ScopedFlakBurst[] => {
      const globalWindowSpan = Math.max(
        0.0001,
        options.globalEndProgress - options.globalStartProgress
      );
      return bursts.flatMap((burst) => {
        const globalProgress = host.clamp(burst.progress ?? 0, 0, 1);
        const inWindow =
          globalProgress >= options.globalStartProgress - 0.0001
          && (
            options.includeEnd
              ? globalProgress <= options.globalEndProgress + 0.0001
              : globalProgress < options.globalEndProgress - 0.0001
          );
        if (!inWindow) {
          return [];
        }
        const windowProgress = host.clamp(
          (globalProgress - options.globalStartProgress) / globalWindowSpan,
          0,
          1
        );
        return [{
          ...burst,
          progress: host.clamp(
            options.localStartProgress
            + windowProgress * (options.localEndProgress - options.localStartProgress),
            options.localStartProgress,
            options.localEndProgress
          )
        }];
      });
    };
    const shouldDeferBomberFinalStrengthForFlak = (
      flight: AirShowRuntimeFlightInternal
    ): boolean => resolveScopedBomberFlakBursts(flight).length > 0;

    if (survivingBombers.length > 0) {
      const bomberIngressRallyPoint =
        host.averageAirShowPoints(
          survivingBombers.map((flight) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const targetApproach = bomberApproachProfilesById.get(flight.spec.id)?.targetApproach ?? current;
            return {
              cx: current.cx * 0.44 + targetApproach.cx * 0.56,
              cy: current.cy * 0.44 + targetApproach.cy * 0.56
            };
          })
        )
        ?? corridor.merge;
      const bomberIngressRallyProjection = host.resolveAirShowCorridorCoordinates(
        corridor,
        bomberIngressRallyPoint
      );
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
                corridorWidthPx: 18,
                driftPx: 12,
                minimumTravelPx: 148,
                lateralSign: -1
              }
            : {
                corridorWidthPx: 16,
                driftPx: 12,
                minimumTravelPx: 124,
                lateralSign: 1
              };
        const currentProjection = host.resolveAirShowCorridorCoordinates(corridor, current);
        const desiredAlongPx =
          role === "interceptor"
            ? bomberIngressRallyProjection.alongPx - 34 + laneIndex * 18
            : bomberIngressRallyProjection.alongPx + 18 + laneIndex * 16;
        const desiredLateralPx =
          role === "interceptor"
            ? bomberIngressRallyProjection.lateralPx - 104 + laneIndex * 22
            : bomberIngressRallyProjection.lateralPx + 92 + laneIndex * 20;
        const targetAlongPx = host.clamp(
          desiredAlongPx * 0.88 + currentProjection.alongPx * 0.12,
          role === "interceptor" ? -128 : -44,
          role === "interceptor" ? 28 : 98
        );
        const targetLateralPx = host.clamp(
          desiredLateralPx * 0.92 + currentProjection.lateralPx * 0.08,
          role === "interceptor" ? -188 : 58,
          role === "interceptor" ? -68 : 168
        );
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
        const alongSign = targetAlongPx >= currentProjection.alongPx ? 1 : -1;
        const travelShortfallPx = basePlan.minimumTravelPx - routeDistancePx;
        return {
          endAlongPx:
            targetAlongPx
            + alongSign * host.clamp(travelShortfallPx * 0.84, 24, role === "interceptor" ? 108 : 92),
          baseLateralPx:
            targetLateralPx
            + basePlan.lateralSign * host.clamp(travelShortfallPx * 0.3, 10, role === "interceptor" ? 34 : 30),
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
      const bomberIngressDurationMs = plannedBomberIngressDurationMs;
      const bomberIngressFlakBursts: ScopedFlakBurst[] = [];
      const bomberDefenseFlakBursts = remapFlakBurstsToPhase(
        collectScopedBomberFlakBursts(survivingBombers),
        {
          globalStartProgress: 0.46,
          globalEndProgress: 0.78,
          localStartProgress: 0.18,
          localEndProgress: 0.88
        }
      );
      const bomberIngressFighterSpeedBudgetPx =
        bomberIngressDurationMs * host.airShowFighterSpeedPxPerMs;
      const bomberIngressMinimumFighterTravelPx = host.clamp(
        bomberIngressFighterSpeedBudgetPx * 0.45,
        6,
        58
      );
      const bomberIngressRepairTriggerTravelPx = Math.max(
        0,
        bomberIngressMinimumFighterTravelPx - 4
      );
      const desiredBomberIngressInterceptorTravelPx = host.clamp(
        Math.max(
          bomberIngressRepairTriggerTravelPx + 4,
          bomberIngressFighterSpeedBudgetPx * 0.72
        ),
        8,
        Math.max(8, bomberIngressFighterSpeedBudgetPx * 0.86)
      );
      const desiredBomberIngressEscortTravelPx = host.clamp(
        Math.max(
          bomberIngressRepairTriggerTravelPx + 3,
          bomberIngressFighterSpeedBudgetPx * 0.68
        ),
        8,
        Math.max(8, bomberIngressFighterSpeedBudgetPx * 0.82)
      );
      const truncatePathToLength = (
        points: ReadonlyArray<AirShowPoint>,
        targetPathLengthPx: number
      ): AirShowPoint[] => {
        if (points.length < 2 || !Number.isFinite(targetPathLengthPx) || targetPathLengthPx <= 0) {
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
          const ratio = host.clamp(remainingPx / segmentLengthPx, 0, 1);
          truncated.push({
            cx: previous.cx + (current.cx - previous.cx) * ratio,
            cy: previous.cy + (current.cy - previous.cy) * ratio
          });
          break;
        }
        if (truncated.length < 2) {
          truncated.push({ ...points[points.length - 1]! });
        }
        return truncated;
      };
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
      const buildBomberIngressCoverAssignmentsForFlight = (
        flight: AirShowRuntimeFlightInternal,
        role: "interceptor" | "escort",
        index: number,
        totalFlights: number
      ): AirShowPhaseAssignment[] => {
        const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const laneIndex = index - (totalFlights - 1) / 2;
        const target = resolveBomberIngressCoverTarget(current, role, laneIndex);
        const currentProjection = host.resolveAirShowCorridorCoordinates(corridor, current);
        const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
          flight,
          host.resolveAirShowFlightHeadingDegrees(flight)
        );
        const defaultLaneSideSign =
          role === "interceptor"
            ? (laneIndex <= 0 ? -1 : 1)
            : (laneIndex >= 0 ? 1 : -1);
        const buildCoverPath = (
          resolvedTargetPoint: AirShowPoint,
          emphasis: "base" | "aggressive" = "base"
        ): AirShowPoint[] => {
          const routeSideSign = host.resolveAirShowRouteSideSign(
            current,
            resolvedTargetPoint,
            startHeadingDegrees,
            defaultLaneSideSign
          );
          const laneMagnitude = Math.abs(laneIndex);
          return host.sanitizeAirShowEntryPath(
            bridgePathToPreviousPhaseMotion(
              flight,
              buildForwardContinuousRoutePath(
                current,
                resolvedTargetPoint,
                role === "interceptor"
                  ? {
                      startHeadingDegrees,
                      lateralSign: routeSideSign,
                      minRouteDot: emphasis === "aggressive" ? -0.12 : -0.18,
                      carryForwardPx: (emphasis === "aggressive" ? 84 : 60) + laneMagnitude * 10,
                      earlyAlongPx: (emphasis === "aggressive" ? 150 : 112) + laneMagnitude * 16,
                      midAlongPx: (emphasis === "aggressive" ? 218 : 162) + laneMagnitude * 18,
                      lateAlongPx: (emphasis === "aggressive" ? 272 : 208) + laneMagnitude * 16,
                      entryLateralPx: (emphasis === "aggressive" ? 26 : 20) + laneMagnitude * 5.5,
                      midLateralPx: (emphasis === "aggressive" ? 11 : 8) + laneMagnitude * 2.5,
                      lateLateralPx: (emphasis === "aggressive" ? 4 : 3) + laneMagnitude * 1.25
                    }
                  : {
                      startHeadingDegrees,
                      lateralSign: routeSideSign,
                      minRouteDot: emphasis === "aggressive" ? -0.08 : -0.14,
                      carryForwardPx: (emphasis === "aggressive" ? 66 : 48) + laneMagnitude * 8,
                      earlyAlongPx: (emphasis === "aggressive" ? 128 : 92) + laneMagnitude * 12,
                      midAlongPx: (emphasis === "aggressive" ? 186 : 138) + laneMagnitude * 14,
                      lateAlongPx: (emphasis === "aggressive" ? 228 : 176) + laneMagnitude * 12,
                      entryLateralPx: (emphasis === "aggressive" ? 22 : 18) + laneMagnitude * 4.5,
                      midLateralPx: (emphasis === "aggressive" ? 10 : 7) + laneMagnitude * 2.25,
                      lateLateralPx: (emphasis === "aggressive" ? 4 : 3) + laneMagnitude * 1.25
                    }
              ),
              role === "interceptor"
                ? (emphasis === "aggressive" ? 52 : 40)
                : (emphasis === "aggressive" ? 34 : 26)
            ),
            role === "interceptor"
              ? {
                  maxTurnDeg: 44,
                  strongTurnDeg: 88,
                  maxFirstSegmentPx: emphasis === "aggressive" ? 88 : 76,
                  maxSharpTurnDeg: 112,
                  maxWaypointsToRemove: 3
                }
              : {
                  maxTurnDeg: 40,
                  strongTurnDeg: 84,
                  maxFirstSegmentPx: emphasis === "aggressive" ? 82 : 72,
                  maxSharpTurnDeg: 108,
                  maxWaypointsToRemove: 3
                }
          );
        };
        const buildAssignmentsForPath = (path: AirShowPoint[]): AirShowPhaseAssignment[] =>
          host.buildAirShowFlightAssignments(
            flight,
            path,
            role === "interceptor" ? 0.26 : 0.24,
            index,
            Math.max(1, totalFlights)
          );
        const baseTargetPoint = host.projectAirShowCorridorPoint(
          corridor,
          target.endAlongPx,
          target.baseLateralPx
        );
        let assignments = buildAssignmentsForPath(buildCoverPath(baseTargetPoint));
        const meanTraversedLengthPx =
          assignments.length > 0
            ? assignments.reduce(
                (sum, assignment) => sum + host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, bomberIngressDurationMs),
                0
              ) / assignments.length
            : 0;
        if (meanTraversedLengthPx + 4 >= bomberIngressMinimumFighterTravelPx) {
          return assignments;
        }
        const alongDirection = target.endAlongPx >= currentProjection.alongPx ? 1 : -1;
        const travelShortfallPx = bomberIngressMinimumFighterTravelPx - meanTraversedLengthPx;
        const aggressiveTargetPoint = host.projectAirShowCorridorPoint(
          corridor,
          target.endAlongPx + alongDirection * host.clamp(
            travelShortfallPx * 0.82,
            role === "interceptor" ? 42 : 34,
            role === "interceptor" ? 132 : 116
          ),
          target.baseLateralPx + (role === "interceptor" ? -1 : 1) * host.clamp(
            travelShortfallPx * 0.2,
            10,
            role === "interceptor" ? 32 : 28
          )
        );
        assignments = buildAssignmentsForPath(buildCoverPath(aggressiveTargetPoint, "aggressive"));
        return assignments;
      };
      const bomberIngressFighterAssignments: AirShowPhaseAssignment[] = [
        ...orderedSurvivingInterceptors.flatMap((flight, index) =>
          buildBomberIngressCoverAssignmentsForFlight(
            flight,
            "interceptor",
            index,
            orderedSurvivingInterceptors.length
          )
        ),
        ...orderedSurvivingEscorts.flatMap((flight, index) =>
          buildBomberIngressCoverAssignmentsForFlight(
            flight,
            "escort",
            index,
            orderedSurvivingEscorts.length
          )
        )
      ];
      const bomberIngressRoleSpeeds = host.resolveAirShowRoleSpeedMap({
        interceptor: host.airShowFighterSpeedPxPerMs,
        escort: host.airShowFighterSpeedPxPerMs,
        bomber: host.airShowBomberSpeedPxPerMs
      });
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
      const extendedBomberIngressAssignmentsByActorId = new Map(
        extendedBomberIngressAssignments.map((assignment) => [assignment.actor.id, assignment] as const)
      );
      const bomberIngressPhasePreparationOptions = {
        previousAssignments: previousPhaseAssignments,
        previousDurationMs: previousPhaseDurationMs,
        entryTurnLimitDeg: 84,
        softenEntryRoles: ["interceptor", "escort"],
        softenEntryTurnLimitDeg: 98,
        softenEntryWaypointCount: 8,
        softenExitRoles: ["interceptor", "escort"],
        softenExitTurnLimitDeg: 94,
        softenExitWaypointCount: 8
      } satisfies Record<string, unknown>;
      const preparedBomberIngressAssignments = host.prepareAirShowPhaseAssignments(
        extendedBomberIngressAssignments,
        bomberIngressDurationMs,
        [0.22, 0.5, 0.78, 0.94],
        undefined,
        bomberIngressRoleSpeeds,
        bomberIngressPhasePreparationOptions
      );
      let bomberIngressAssignmentsRepaired = false;
      const repairedBomberIngressAssignments = preparedBomberIngressAssignments.map((assignment) => {
        if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
          return assignment;
        }
        const ingressFlight = flightMap.get(assignment.actor.flightId);
        const traversedLengthPx = host.resolveAirShowAssignmentTraversedPathLengthPx(
          assignment,
          bomberIngressDurationMs
        );
        const startPoint = assignment.points[0] ?? null;
        const nextPoint =
          assignment.points.find((point, index) =>
            index > 0
            && !!startPoint
            && Math.hypot(point.cx - startPoint.cx, point.cy - startPoint.cy) > 0.5
          ) ?? null;
        const previousBoundaryVector = ingressFlight
          ? resolvePreviousPhaseBoundaryVector(ingressFlight)
          : null;
        const entryTurnDeg =
          previousBoundaryVector && startPoint && nextPoint
            ? resolveVectorAngleDegrees(
                {
                  x: previousBoundaryVector.dx,
                  y: previousBoundaryVector.dy
                },
                {
                  x: nextPoint.cx - startPoint.cx,
                  y: nextPoint.cy - startPoint.cy
                }
              )
            : 0;
        const needsTravelRepair = traversedLengthPx + 4 < bomberIngressRepairTriggerTravelPx;
        const needsBoundaryRepair = entryTurnDeg >= 108;
        if (!needsTravelRepair && !needsBoundaryRepair) {
          return assignment;
        }
        const originalAssignment = extendedBomberIngressAssignmentsByActorId.get(assignment.actor.id);
        if (!originalAssignment || originalAssignment.points.length <= 1) {
          return assignment;
        }
        bomberIngressAssignmentsRepaired = true;
        const resolvedStartPoint = startPoint ?? originalAssignment.points[0]!;
        const roleSpecificEntryOptions =
          assignment.actor.role === "interceptor"
            ? {
                maxTurnDeg: 40,
                strongTurnDeg: 80,
                maxFirstSegmentPx: 72,
                maxSharpTurnDeg: 104,
                maxWaypointsToRemove: 4
              }
            : {
                maxTurnDeg: 36,
                strongTurnDeg: 76,
                maxFirstSegmentPx: 68,
                maxSharpTurnDeg: 100,
                maxWaypointsToRemove: 4
              };
        const restoredPoints =
          needsBoundaryRepair && ingressFlight
            ? (() => {
                const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
                  ingressFlight,
                  host.resolveAirShowFlightHeadingDegrees(ingressFlight)
                );
                const endPoint =
                  originalAssignment.points[originalAssignment.points.length - 1]
                  ?? nextPoint
                  ?? resolvedStartPoint;
                const routeSideSign = host.resolveAirShowRouteSideSign(
                  resolvedStartPoint,
                  endPoint,
                  startHeadingDegrees,
                  assignment.actor.role === "interceptor" ? -1 : 1
                );
                const forwardVector = resolveHeadingVector(startHeadingDegrees, {
                  x: endPoint.cx - resolvedStartPoint.cx,
                  y: endPoint.cy - resolvedStartPoint.cy
                });
                const forwardLeadDistancePx =
                  assignment.actor.role === "interceptor" ? 92 : 80;
                const forwardLeadBlend =
                  assignment.actor.role === "interceptor" ? 0.14 : 0.18;
                const forwardLeadPoint: AirShowPoint = {
                  cx:
                    resolvedStartPoint.cx
                    + forwardVector.x * forwardLeadDistancePx
                    + (endPoint.cx - resolvedStartPoint.cx) * forwardLeadBlend,
                  cy:
                    resolvedStartPoint.cy
                    + forwardVector.y * forwardLeadDistancePx
                    + (endPoint.cy - resolvedStartPoint.cy) * forwardLeadBlend
                };
                return host.sanitizeAirShowEntryPath(
                  [
                    resolvedStartPoint,
                    forwardLeadPoint,
                    ...buildForwardContinuousRoutePath(forwardLeadPoint, endPoint, {
                      startHeadingDegrees,
                      lateralSign: routeSideSign,
                      minRouteDot: -0.06,
                      carryForwardPx: assignment.actor.role === "interceptor" ? 86 : 74,
                      earlyAlongPx: assignment.actor.role === "interceptor" ? 128 : 112,
                      midAlongPx: assignment.actor.role === "interceptor" ? 184 : 164,
                      lateAlongPx: assignment.actor.role === "interceptor" ? 238 : 214,
                      entryLateralPx: assignment.actor.role === "interceptor" ? 24 : 20,
                      midLateralPx: assignment.actor.role === "interceptor" ? 10 : 8,
                      lateLateralPx: assignment.actor.role === "interceptor" ? 4 : 3
                    }).slice(1)
                  ],
                  roleSpecificEntryOptions
                );
              })()
            : host.sanitizeAirShowEntryPath(
                [
                  resolvedStartPoint,
                  ...originalAssignment.points.slice(1)
                ],
                roleSpecificEntryOptions
              );
        return {
          ...assignment,
          points: restoredPoints
        };
      });
      const repairedBomberIngressAssignmentsByActorId = new Map(
        repairedBomberIngressAssignments.map((assignment) => [assignment.actor.id, assignment] as const)
      );
      const spacedBomberIngressAssignments =
        bomberIngressAssignmentsRepaired
          ? host.prepareAirShowPhaseAssignments(
              repairedBomberIngressAssignments,
              bomberIngressDurationMs,
              [0.22, 0.5, 0.78, 0.94],
              40,
              bomberIngressRoleSpeeds,
              {
                ...bomberIngressPhasePreparationOptions,
                entryTurnLimitDeg: 80,
                softenEntryTurnLimitDeg: 92,
                softenEntryWaypointCount: 10,
                softenExitTurnLimitDeg: 90,
                softenExitWaypointCount: 10
              }
            )
          : repairedBomberIngressAssignments;
      const finalizedBomberIngressAssignments = spacedBomberIngressAssignments.map((assignment) => {
        if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
          return assignment;
        }
        const desiredBomberIngressTravelPx =
          assignment.actor.role === "interceptor"
            ? desiredBomberIngressInterceptorTravelPx
            : desiredBomberIngressEscortTravelPx;
        const traversedLengthPx = host.resolveAirShowAssignmentTraversedPathLengthPx(
          assignment,
          bomberIngressDurationMs
        );
        if (traversedLengthPx + 4 >= desiredBomberIngressTravelPx) {
          return assignment;
        }
        const sourceAssignment = repairedBomberIngressAssignmentsByActorId.get(assignment.actor.id);
        if (!sourceAssignment || sourceAssignment.points.length <= 1) {
          return assignment;
        }
        return {
          ...assignment,
          points: host.sanitizeAirShowEntryPath(
            truncatePathToLength(
              [
                assignment.points[0] ?? sourceAssignment.points[0]!,
                ...sourceAssignment.points.slice(1)
              ],
              desiredBomberIngressTravelPx
            ),
            assignment.actor.role === "interceptor"
              ? {
                  maxTurnDeg: 40,
                  strongTurnDeg: 80,
                  maxFirstSegmentPx: 72,
                  maxSharpTurnDeg: 104,
                  maxWaypointsToRemove: 4
                }
              : {
                  maxTurnDeg: 36,
                  strongTurnDeg: 76,
                  maxFirstSegmentPx: 68,
                  maxSharpTurnDeg: 100,
                  maxWaypointsToRemove: 4
                }
          )
        };
      });
      let bomberIngressBoundaryRepairApplied = false;
      const smoothedBomberIngressAssignments = finalizedBomberIngressAssignments.map((assignment) => {
        if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
          return assignment;
        }
        const ingressFlight = flightMap.get(assignment.actor.flightId);
        const previousBoundaryVector = ingressFlight
          ? resolvePreviousPhaseBoundaryVector(ingressFlight)
          : null;
        if (!ingressFlight || !previousBoundaryVector || assignment.points.length < 2) {
          return assignment;
        }
        const startPoint = assignment.points[0];
        const nextPoint = assignment.points.find((point, index) =>
          index > 0 && !!startPoint && Math.hypot(point.cx - startPoint.cx, point.cy - startPoint.cy) > 0.5
        );
        if (!startPoint || !nextPoint) {
          return assignment;
        }
        const entryTurnDeg = resolveVectorAngleDegrees(
          {
            x: previousBoundaryVector.dx,
            y: previousBoundaryVector.dy
          },
          {
            x: nextPoint.cx - startPoint.cx,
            y: nextPoint.cy - startPoint.cy
          }
        );
        if (entryTurnDeg < 104) {
          return assignment;
        }
        const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
          ingressFlight,
          host.resolveAirShowFlightHeadingDegrees(ingressFlight)
        );
        const endPoint = assignment.points[assignment.points.length - 1] ?? nextPoint;
        const routeSideSign = host.resolveAirShowRouteSideSign(
          startPoint,
          endPoint,
          startHeadingDegrees,
          assignment.actor.role === "interceptor" ? -1 : 1
        );
        const forwardVector = resolveHeadingVector(startHeadingDegrees, {
          x: endPoint.cx - startPoint.cx,
          y: endPoint.cy - startPoint.cy
        });
        const forwardLeadDistancePx =
          assignment.actor.role === "interceptor" ? 96 : 82;
        const forwardLeadBlend =
          assignment.actor.role === "interceptor" ? 0.16 : 0.2;
        const forwardLeadPoint: AirShowPoint = {
          cx:
            startPoint.cx
            + forwardVector.x * forwardLeadDistancePx
            + (endPoint.cx - startPoint.cx) * forwardLeadBlend,
          cy:
            startPoint.cy
            + forwardVector.y * forwardLeadDistancePx
            + (endPoint.cy - startPoint.cy) * forwardLeadBlend
        };
        bomberIngressBoundaryRepairApplied = true;
        return {
          ...assignment,
          points: host.sanitizeAirShowEntryPath(
            [
              startPoint,
              forwardLeadPoint,
              ...buildForwardContinuousRoutePath(forwardLeadPoint, endPoint, {
                startHeadingDegrees,
                lateralSign: routeSideSign,
                minRouteDot: -0.04,
                carryForwardPx: assignment.actor.role === "interceptor" ? 88 : 76,
                earlyAlongPx: assignment.actor.role === "interceptor" ? 132 : 116,
                midAlongPx: assignment.actor.role === "interceptor" ? 188 : 168,
                lateAlongPx: assignment.actor.role === "interceptor" ? 242 : 218,
                entryLateralPx: assignment.actor.role === "interceptor" ? 22 : 18,
                midLateralPx: assignment.actor.role === "interceptor" ? 9 : 7,
                lateLateralPx: assignment.actor.role === "interceptor" ? 4 : 3
              }).slice(1)
            ],
            assignment.actor.role === "interceptor"
              ? {
                  maxTurnDeg: 38,
                  strongTurnDeg: 78,
                  maxFirstSegmentPx: 76,
                  maxSharpTurnDeg: 102,
                  maxWaypointsToRemove: 4
                }
              : {
                  maxTurnDeg: 34,
                  strongTurnDeg: 72,
                  maxFirstSegmentPx: 72,
                  maxSharpTurnDeg: 98,
                  maxWaypointsToRemove: 4
                }
          )
        };
      });
      const stableBomberIngressAssignments =
        bomberIngressBoundaryRepairApplied
          ? host.prepareAirShowPhaseAssignments(
              smoothedBomberIngressAssignments,
              bomberIngressDurationMs,
              [0.22, 0.5, 0.78, 0.94],
              40,
              bomberIngressRoleSpeeds,
              {
                ...bomberIngressPhasePreparationOptions,
                entryTurnLimitDeg: 74,
                softenEntryTurnLimitDeg: 86,
                softenEntryWaypointCount: 10,
                softenExitTurnLimitDeg: 90,
                softenExitWaypointCount: 10
              }
            )
          : smoothedBomberIngressAssignments;
      const motionLockedBomberIngressAssignments = stableBomberIngressAssignments.map((assignment) => {
        if (
          assignment.actor.role !== "interceptor"
          && assignment.actor.role !== "escort"
        ) {
          return assignment;
        }
        const startSample = host.sampleAirShowAssignmentAtTime(
          assignment,
          0,
          bomberIngressDurationMs,
          0
        );
        const endSample = host.sampleAirShowAssignmentAtTime(
          assignment,
          bomberIngressDurationMs,
          bomberIngressDurationMs,
          1
        );
        const dx = endSample.position.cx - startSample.position.cx;
        const dy = endSample.position.cy - startSample.position.cy;
        const displacementPx = Math.hypot(dx, dy);
        const maximumDisplacementPx =
          bomberIngressDurationMs * host.airShowFighterSpeedPxPerMs * 0.94;
        if (displacementPx > maximumDisplacementPx + 4 && assignment.points.length >= 2) {
          const cappedPoints = truncatePathToLength(
            assignment.points,
            Math.max(8, maximumDisplacementPx)
          );
          return {
            ...assignment,
            points: host.sanitizeAirShowEntryPath(
              cappedPoints,
              assignment.actor.role === "interceptor"
                ? {
                    maxTurnDeg: 40,
                    strongTurnDeg: 82,
                    maxFirstSegmentPx: 76,
                    maxSharpTurnDeg: 104,
                    maxWaypointsToRemove: 3
                  }
                : {
                    maxTurnDeg: 38,
                    strongTurnDeg: 78,
                    maxFirstSegmentPx: 72,
                    maxSharpTurnDeg: 100,
                    maxWaypointsToRemove: 3
                  }
            )
          };
        }
        const speedLimitedDisplacementPx =
          bomberIngressDurationMs * host.airShowFighterSpeedPxPerMs * 0.96;
        const minimumDisplacementPx = Math.max(
          42,
          Math.min(
            assignment.actor.role === "interceptor" ? 66 : 62,
            speedLimitedDisplacementPx
          )
        );
        if (displacementPx >= minimumDisplacementPx || assignment.points.length < 2) {
          return assignment;
        }
        const ingressFlight = flightMap.get(assignment.actor.flightId);
        const previousBoundaryVector = ingressFlight
          ? resolvePreviousPhaseBoundaryVector(ingressFlight)
          : null;
        const fallbackForward = resolveHeadingVector(
          endSample.headingDegrees,
          previousBoundaryVector
            ? { x: previousBoundaryVector.dx, y: previousBoundaryVector.dy }
            : { x: dx, y: dy }
        );
        const forward =
          displacementPx > 0.5
            ? { x: dx / displacementPx, y: dy / displacementPx }
            : fallbackForward;
        const startPoint = assignment.points[0]!;
        const endPoint = {
          cx: startPoint.cx + forward.x * minimumDisplacementPx,
          cy: startPoint.cy + forward.y * minimumDisplacementPx
        };
        return {
          ...assignment,
          points: host.sanitizeAirShowEntryPath(
            [
              startPoint,
              ...assignment.points.slice(1, -1),
              endPoint
            ],
            assignment.actor.role === "interceptor"
              ? {
                  maxTurnDeg: 40,
                  strongTurnDeg: 82,
                  maxFirstSegmentPx: 76,
                  maxSharpTurnDeg: 104,
                  maxWaypointsToRemove: 3
                }
              : {
                  maxTurnDeg: 38,
                  strongTurnDeg: 78,
                  maxFirstSegmentPx: 72,
                  maxSharpTurnDeg: 100,
                  maxWaypointsToRemove: 3
                }
          )
        };
      });
      const fighterIngressFlightLanesById = new Map<string, number>();
      (["interceptor", "escort"] as const).forEach((role) => {
        const flightIds = Array.from(
          new Set(
            motionLockedBomberIngressAssignments
              .filter((assignment) => assignment.actor.role === role)
              .map((assignment) => assignment.actor.flightId)
          )
        );
        flightIds.forEach((flightId, index) => {
          fighterIngressFlightLanesById.set(
            flightId,
            flightIds.length <= 1 ? 0 : index - (flightIds.length - 1) / 2
          );
        });
      });
      const flightSpreadBomberIngressAssignments = motionLockedBomberIngressAssignments.map((assignment) => {
        if (
          assignment.actor.role !== "interceptor"
          && assignment.actor.role !== "escort"
        ) {
          return assignment;
        }
        const flightLane = fighterIngressFlightLanesById.get(assignment.actor.flightId) ?? 0;
        if (Math.abs(flightLane) < 0.001 || assignment.points.length < 2) {
          return assignment;
        }
        const lastIndex = assignment.points.length - 1;
        const laneOffsetPx = flightLane * (assignment.actor.role === "interceptor" ? 12 : 10);
        const visualLaneOffsetPx = flightLane * (assignment.actor.role === "interceptor" ? 24 : 18);
        return {
          ...assignment,
          multiFlightOffsetPx: (assignment.multiFlightOffsetPx ?? 0) + visualLaneOffsetPx,
          points: assignment.points.map((point, pointIndex) => {
            if (pointIndex === 0) {
              return point;
            }
            const progress = pointIndex / Math.max(1, lastIndex);
            const ramp = progress * progress;
            return {
              cx:
                point.cx
                + (corridor.normal.x * laneOffsetPx + corridor.axis.x * laneOffsetPx * 0.12) * ramp,
              cy:
                point.cy
                + (corridor.normal.y * laneOffsetPx + corridor.axis.y * laneOffsetPx * 0.12) * ramp
            };
          })
        };
      });
      recordPhase(
        "bomber-ingress",
        flightSpreadBomberIngressAssignments,
        bomberIngressDurationMs,
        [],
        bomberIngressFlakBursts,
        bomberIngressRoleSpeeds
      );
      previousPhaseAssignments = flightSpreadBomberIngressAssignments;
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
      const hasAuthoredBomberDefensePasses = bomberAttackEntries.length > 0;
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
        attackEntriesForShow.forEach((entry, attackEntryIndex) => {
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

        attackEntriesForShow.forEach((entry, attackEntryIndex) => {
          const interceptorCurrent = host.averageAirShowPosition(entry.interceptorFlight.actors) ?? entry.interceptorFlight.anchor;
          const interceptorEntryHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
            entry.interceptorFlight,
            host.resolveAirShowFlightHeadingDegrees(entry.interceptorFlight)
          );
          const attackContext = bomberAttackContexts.get(entry.interceptorFlight.spec.id);
          const rawLane =
            !attackContext || attackContext.localAttackCount <= 1
              ? 0
              : attackContext.localAttackIndex - (attackContext.localAttackCount - 1) / 2;
          const lane = hasAuthoredBomberDefensePasses ? rawLane : rawLane * 0.55;
          const bomberCurrent = host.averageAirShowPosition(entry.bomberFlight.actors) ?? entry.bomberFlight.anchor;
          const bomberApproachProfile = bomberApproachProfilesById.get(entry.bomberFlight.spec.id);
          const defenseTargetPoint =
            bomberDefenseTargets.find((candidate) => candidate.bomberFlight.spec.id === entry.bomberFlight.spec.id)?.defenseTarget
            ?? bomberApproachProfile?.targetApproach
            ?? corridor.strike;
          const attackFocusPoint = hasAuthoredBomberDefensePasses
            ? defenseTargetPoint
            : {
                cx: bomberCurrent.cx + (defenseTargetPoint.cx - bomberCurrent.cx) * 0.46,
                cy: bomberCurrent.cy + (defenseTargetPoint.cy - bomberCurrent.cy) * 0.46
              };
          const attackCorridor = host.resolveAirShowCorridor(
            center,
            bomberCurrent,
            bomberApproachProfile?.targetCenter ?? corridor.strike
          );
          const attackPassEnd = Math.round(
            host.resolveAirShowCorridorCoordinates(
              attackCorridor,
              attackFocusPoint
            ).alongPx
          );
          const attackPassStart = attackPassEnd - (hasAuthoredBomberDefensePasses ? 132 : 112);
          const fallbackDirection = host.resolveAirShowCorridorSideSign(
            interceptorCurrent,
            attackCorridor,
            (attackContext?.localAttackIndex ?? 0) % 2 === 0 ? -1 : 1
          );
          const headingDirectedDirection = host.resolveAirShowRouteSideSign(
            interceptorCurrent,
            attackFocusPoint,
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
          const buildBomberDefenseAttackPath = (attackSideSign: number): AirShowPoint[] => {
            const targetVector = normalizeVector(
              attackFocusPoint.cx - interceptorCurrent.cx,
              attackFocusPoint.cy - interceptorCurrent.cy,
              0,
              -1
            );
            const headingVector = resolveHeadingVector(interceptorEntryHeadingDegrees, targetVector);
            const headingDot = headingVector.x * targetVector.x + headingVector.y * targetVector.y;
            const entryVector =
              headingDot > 0.25
                ? normalizeVector(
                    targetVector.x * 0.72 + headingVector.x * 0.28,
                    targetVector.y * 0.72 + headingVector.y * 0.28,
                    targetVector.x,
                    targetVector.y
                  )
                : targetVector;
            const lateralVector = {
              x: -targetVector.y * attackSideSign,
              y: targetVector.x * attackSideSign
            };
            const attackDistancePx = Math.max(
              1,
              Math.hypot(
                attackFocusPoint.cx - interceptorCurrent.cx,
                attackFocusPoint.cy - interceptorCurrent.cy
              )
            );
            const leadOnePx = host.clamp(attackDistancePx * 0.18, 38, 58);
            const leadTwoPx = host.clamp(attackDistancePx * 0.42, 86, 132);
            const laneSpreadPx = lane * 10;
            const attackLinePath = [
              interceptorCurrent,
              {
                cx: interceptorCurrent.cx + entryVector.x * leadOnePx,
                cy: interceptorCurrent.cy + entryVector.y * leadOnePx
              },
              {
                cx:
                  interceptorCurrent.cx
                  + targetVector.x * leadTwoPx
                  + lateralVector.x * (10 + laneSpreadPx),
                cy:
                  interceptorCurrent.cy
                  + targetVector.y * leadTwoPx
                  + lateralVector.y * (10 + laneSpreadPx)
              },
              {
                cx:
                  attackFocusPoint.cx
                  + lateralVector.x * Math.max(-12, Math.min(12, laneSpreadPx * 0.45)),
                cy:
                  attackFocusPoint.cy
                  + lateralVector.y * Math.max(-12, Math.min(12, laneSpreadPx * 0.45))
              },
              {
                cx:
                  attackFocusPoint.cx
                  + targetVector.x * 92
                  + lateralVector.x * Math.max(-10, Math.min(10, laneSpreadPx * 0.3)),
                cy:
                  attackFocusPoint.cy
                  + targetVector.y * 92
                  + lateralVector.y * Math.max(-10, Math.min(10, laneSpreadPx * 0.3))
              }
            ];
            return host.sanitizeAirShowEntryPath(attackLinePath, {
              maxTurnDeg: 34,
              strongTurnDeg: 68,
              maxFirstSegmentPx: 68,
              maxSharpTurnDeg: 96,
              maxWaypointsToRemove: 3
            });
          };
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
                      attackFocusPoint
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
              attackEntryIndex,
              Math.max(1, attackEntriesForShow.length)
            )
          );
        });
        const activeScreeningEscorts = activeFlights(escortFlights);
        const screeningEscortAssignments = activeScreeningEscorts.flatMap((flight, escortIndex) =>
            (() => {
              const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
              const laneIndex = escortIndex - (activeScreeningEscorts.length - 1) / 2;
              const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(
                flight,
                host.resolveAirShowFlightHeadingDegrees(flight)
              );
              const escortTargetPoint = host.projectAirShowCorridorPoint(
                corridor,
                passEnd + 18 + laneIndex * 12,
                84 + laneIndex * 20
              );
              const routeSideSign = host.resolveAirShowRouteSideSign(
                current,
                escortTargetPoint,
                startHeadingDegrees,
                laneIndex >= 0 ? 1 : -1
              );
              const escortForwardVector = resolveHeadingVector(startHeadingDegrees, {
                x: escortTargetPoint.cx - current.cx,
                y: escortTargetPoint.cy - current.cy
              });
              const escortLateralVector = {
                x: -escortForwardVector.y * routeSideSign,
                y: escortForwardVector.x * routeSideSign
              };
              const escortScreenPath = [
                current,
                {
                  cx: current.cx + escortForwardVector.x * 54 + escortLateralVector.x * (4 + Math.abs(laneIndex) * 2),
                  cy: current.cy + escortForwardVector.y * 54 + escortLateralVector.y * (4 + Math.abs(laneIndex) * 2)
                },
                {
                  cx: current.cx + escortForwardVector.x * 126 + escortLateralVector.x * (10 + Math.abs(laneIndex) * 3),
                  cy: current.cy + escortForwardVector.y * 126 + escortLateralVector.y * (10 + Math.abs(laneIndex) * 3)
                },
                {
                  cx: current.cx + escortForwardVector.x * 214 + escortLateralVector.x * (16 + Math.abs(laneIndex) * 4),
                  cy: current.cy + escortForwardVector.y * 214 + escortLateralVector.y * (16 + Math.abs(laneIndex) * 4)
                },
                escortTargetPoint
              ];
              return host.buildAirShowFlightAssignments(
                flight,
                host.sanitizeAirShowEntryPath(
                  escortScreenPath,
                  {
                    maxTurnDeg: 36,
                    strongTurnDeg: 74,
                    maxFirstSegmentPx: 60,
                    maxSharpTurnDeg: 102,
                    maxWaypointsToRemove: 4
                  }
                ),
                0.24,
                escortIndex,
                Math.max(1, activeScreeningEscorts.length)
              );
            })()
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
            entryTurnLimitDeg: 54,
            softenEntryRoles: ["bomber", "interceptor", "escort"],
            softenEntryTurnLimitDeg: 70,
            softenEntryWaypointCount: 24,
            softenExitRoles: ["bomber", "interceptor", "escort"],
            softenExitTurnLimitDeg: 78,
            softenExitWaypointCount: 14
          }
        );
        let bomberDefensePlaybackAssignments = [
          ...spacedPhaseAssignments,
          ...screeningEscortAssignments
        ];
        const previousBomberDefenseAssignmentsByActorId =
          host.buildAirShowAssignmentLookup(previousPhaseAssignments);
        bomberDefensePlaybackAssignments = bomberDefensePlaybackAssignments.map((assignment) => {
          if (
            assignment.actor.role !== "interceptor"
            && assignment.actor.role !== "escort"
          ) {
            return assignment;
          }
          if (assignment.points.length < 3 || previousPhaseDurationMs <= 0) {
            return assignment;
          }
          const previousAssignment = previousBomberDefenseAssignmentsByActorId.get(assignment.actor.id);
          if (!previousAssignment) {
            return assignment;
          }
          const previousSampleA = host.sampleAirShowAssignmentAtTime(
            previousAssignment,
            previousPhaseDurationMs * 0.88,
            previousPhaseDurationMs
          );
          const previousSampleB = host.sampleAirShowAssignmentAtTime(
            previousAssignment,
            previousPhaseDurationMs,
            previousPhaseDurationMs,
            1
          );
          const renderedOffsetPx = assignment.multiFlightOffsetPx ?? 0;
          const renderedStart = {
            cx: previousSampleB.position.cx,
            cy: previousSampleB.position.cy
          };
          const routeAnchorIndex = assignment.points.length >= 5
            ? 3
            : assignment.points.length - 1;
          const routeAnchor = assignment.points[routeAnchorIndex]!;
          const renderedRouteAnchor = {
            cx: routeAnchor.cx + renderedOffsetPx,
            cy: routeAnchor.cy
          };
          const targetForward = normalizeVector(
            renderedRouteAnchor.cx - renderedStart.cx,
            renderedRouteAnchor.cy - renderedStart.cy,
            corridor.axis.x,
            corridor.axis.y
          );
          let entryForward = normalizeVector(
            previousSampleB.position.cx - previousSampleA.position.cx,
            previousSampleB.position.cy - previousSampleA.position.cy,
            targetForward.x,
            targetForward.y
          );
          const entryTargetDot =
            entryForward.x * targetForward.x + entryForward.y * targetForward.y;
          if (entryTargetDot < 0.16) {
            entryForward = normalizeVector(
              entryForward.x * 0.25 + targetForward.x * 1.75,
              entryForward.y * 0.25 + targetForward.y * 1.75,
              targetForward.x,
              targetForward.y
            );
          }
          const entryBlendWeight = entryTargetDot < 0.16 ? 0.24 : 0.52;
          const blendedForward = normalizeVector(
            entryForward.x * entryBlendWeight + targetForward.x * (1 - entryBlendWeight),
            entryForward.y * entryBlendWeight + targetForward.y * (1 - entryBlendWeight),
            targetForward.x,
            targetForward.y
          );
          const routeAnchorDistancePx = Math.max(
            1,
            Math.hypot(
              renderedRouteAnchor.cx - renderedStart.cx,
              renderedRouteAnchor.cy - renderedStart.cy
            )
          );
          const leadADistancePx = host.clamp(routeAnchorDistancePx * 0.42, 16, 54);
          const leadBDistancePx = host.clamp(
            routeAnchorDistancePx * 0.78,
            leadADistancePx + 8,
            Math.max(leadADistancePx + 8, routeAnchorDistancePx - 6)
          );
          const renderedLeadA = host.offsetAirShowPoint(
            renderedStart,
            blendedForward.x * leadADistancePx,
            blendedForward.y * leadADistancePx
          );
          const renderedLeadB = host.offsetAirShowPoint(
            renderedStart,
            blendedForward.x * leadBDistancePx,
            blendedForward.y * leadBDistancePx
          );
          const smoothedEntryPoints = [
            renderedStart,
            renderedLeadA,
            renderedLeadB,
            ...assignment.points.slice(routeAnchorIndex).map((point) => ({
              cx: point.cx + renderedOffsetPx,
              cy: point.cy
            }))
          ].map((point) => ({
            cx: point.cx - renderedOffsetPx,
            cy: point.cy
          }));
          return {
            ...assignment,
            points: smoothedEntryPoints
          };
        });
        const bomberDefenseAssignmentsByActorId = host.buildAirShowAssignmentLookup(bomberDefensePlaybackAssignments);
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
              bomberDefensePlaybackAssignments,
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
                bomberDefensePlaybackAssignments,
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
          bomberDefensePlaybackAssignments,
          bomberPassBeatDurationMs,
          tracerBursts,
          bomberDefenseFlakBursts,
          bomberDefenseRoleSpeeds
        );
        previousPhaseAssignments = bomberDefensePlaybackAssignments;
        previousPhaseDurationMs = bomberPassBeatDurationMs;
        updateFlightAnchors([...survivingBombers, ...interceptorFlights, ...escortFlights]);

        survivingBombers.forEach((flight) =>
          host.syncAirShowFlightStrengthForInspection(
            flight,
            Math.max(
              0,
              shouldDeferBomberFinalStrengthForFlak(flight)
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
      let strikeRunDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
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
      const fighterPeelAssignments = buildFighterPeelAssignments(
        targetRunFighterFlights,
        strikeRunDurationMs,
        fighterPeelHeadingByFlightId
      );
      const strikeRunAssignments: AirShowPhaseAssignment[] = [
        ...bomberStrikeRunAssignments,
        ...fighterPeelAssignments
      ];
      const strikeRunTracerBursts: AirShowTracerBurst[] = [];
      const scopedStrikeRunFlakBursts = remapFlakBurstsToPhase(
        collectScopedBomberFlakBursts(postPassBombers),
        {
          globalStartProgress: 0.78,
          globalEndProgress: 1,
          localStartProgress: 0.54,
          localEndProgress: host.clamp(
            Math.max(0.66, (scene.bombReleaseProgress ?? 0.92) - 0.04),
            0.66,
            0.88
          ),
          includeEnd: true
        }
      );
      const strikeRunFlakBursts =
        scopedStrikeRunFlakBursts.length > 0
          ? scopedStrikeRunFlakBursts
          : Array.from(
              collectScopedBomberFlakBursts(postPassBombers).reduce((burstsByBomberId, burst) => {
                if (!burst.bomberUnitKey) {
                  return burstsByBomberId;
                }
                const previousBurst = burstsByBomberId.get(burst.bomberUnitKey);
                if (!previousBurst || burst.progress > previousBurst.progress) {
                  burstsByBomberId.set(burst.bomberUnitKey, burst);
                }
                return burstsByBomberId;
              }, new Map<string, ScopedFlakBurst>()).values()
            ).map((burst, index) => ({
              ...burst,
              progress: host.clamp(
                0.54 + index * 0.045,
                0.54,
                host.clamp(
                  Math.max(0.7, (scene.bombReleaseProgress ?? 0.92) - 0.04),
                  0.7,
                  0.88
                )
              )
            }));
      let finalizedStrikeRunAssignments = host.prepareAirShowPhaseAssignments(
        strikeRunAssignments,
        strikeRunDurationMs,
        [0.18, 0.42, 0.66, 0.86],
        undefined,
        strikeRunRoleSpeeds,
        {
          previousAssignments: previousPhaseAssignments,
          previousDurationMs: previousPhaseDurationMs,
          entryTurnLimitDeg: 78,
          softenEntryRoles: ["bomber", "interceptor", "escort"],
          softenEntryTurnLimitDeg: 92,
          softenEntryWaypointCount: 7
        }
      );
      host.collectAirShowFlightTailHeadings(finalizedStrikeRunAssignments, {
        role: "bomber",
        sampleStartProgress: 0.9,
        sampleEndProgress: 1
      }).forEach((headingDegrees, flightId) => {
        egressHeadingByFlightId.set(flightId, headingDegrees);
      });
      strikeRunDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
        finalizedStrikeRunAssignments,
        strikeRunRoleSpeeds,
        strikeRunDurationMs,
        560,
        7000,
        ["bomber"]
      );
      const previousInspectionPhase = phases[phases.length - 1];
      if (previousInspectionPhase) {
        finalizedStrikeRunAssignments = finalizedStrikeRunAssignments.map((assignment) => {
          const previousInspectionAssignment = previousInspectionPhase.assignments.find(
            (candidate) => candidate.actorId === assignment.actor.id
          );
          const previousInspectionEnd =
            previousInspectionAssignment?.sampledPositions[
              previousInspectionAssignment.sampledPositions.length - 1
            ] ?? null;
          const plannedStart = assignment.points[0] ?? assignment.actor.position;
          const renderedOffsetPx = assignment.multiFlightOffsetPx ?? 0;
          if (!plannedStart) {
            return assignment;
          }
          const continuityDx = previousInspectionEnd
            ? previousInspectionEnd.cx - (plannedStart.cx + renderedOffsetPx)
            : 0;
          const continuityDy = previousInspectionEnd ? previousInspectionEnd.cy - plannedStart.cy : 0;
          const needsContinuityShift = Math.hypot(continuityDx, continuityDy) > 0.5;
          const shiftedPoints = needsContinuityShift
            ? assignment.points.map((point) => ({
                cx: point.cx + continuityDx,
                cy: point.cy + continuityDy
              }))
            : assignment.points;
          const radiallyCommittedPoints =
            assignment.actor.role === "interceptor" || assignment.actor.role === "escort"
              ? (() => {
                  const startPoint = shiftedPoints[0];
                  const endPoint = shiftedPoints[shiftedPoints.length - 1];
                  if (!startPoint || !endPoint || shiftedPoints.length < 2) {
                    return shiftedPoints;
                  }
                  const renderedStartPoint = {
                    cx: startPoint.cx + renderedOffsetPx,
                    cy: startPoint.cy
                  };
                  const renderedEndPoint = {
                    cx: endPoint.cx + renderedOffsetPx,
                    cy: endPoint.cy
                  };
                  const startDistancePx = Math.hypot(
                    renderedStartPoint.cx - corridor.center.cx,
                    renderedStartPoint.cy - corridor.center.cy
                  );
                  const endDistancePx = Math.hypot(
                    renderedEndPoint.cx - corridor.center.cx,
                    renderedEndPoint.cy - corridor.center.cy
                  );
                  const minimumEndDistancePx =
                    startDistancePx + (assignment.actor.role === "escort" ? 150 : 128);
                  const correction =
                    endDistancePx >= minimumEndDistancePx
                      ? { x: 0, y: 0 }
                      : (() => {
                          const outward = normalizeVector(
                            renderedEndPoint.cx - corridor.center.cx,
                            renderedEndPoint.cy - corridor.center.cy,
                            renderedStartPoint.cx - corridor.center.cx,
                            renderedStartPoint.cy - corridor.center.cy
                          );
                          const desiredEndPoint = host.offsetAirShowPoint(
                            corridor.center,
                            outward.x * minimumEndDistancePx,
                            outward.y * minimumEndDistancePx
                          );
                          return {
                            x: desiredEndPoint.cx - renderedEndPoint.cx,
                            y: desiredEndPoint.cy - renderedEndPoint.cy
                          };
                        })();
                  const correctionStartIndex = shiftedPoints.length <= 4 ? 1 : 3;
                  const correctedPoints = shiftedPoints.map((point, pointIndex) => {
                    const ramp =
                      Math.max(0, pointIndex - correctionStartIndex)
                      / Math.max(1, shiftedPoints.length - 1 - correctionStartIndex);
                    const easedRamp = ramp * ramp;
                    return {
                      cx: point.cx + correction.x * easedRamp,
                      cy: point.cy + correction.y * easedRamp
                    };
                  });
                  const previousSamples = previousInspectionAssignment?.sampledPositions ?? [];
                  const previousSampleA = previousSamples[previousSamples.length - 2];
                  const previousSampleB = previousSamples[previousSamples.length - 1];
                  const correctedStart = correctedPoints[0];
                  const correctedEnd = correctedPoints[correctedPoints.length - 1];
                  if (!correctedStart || !correctedEnd || !previousSampleA || !previousSampleB) {
                    return correctedPoints;
                  }
                  const renderedStart = {
                    cx: correctedStart.cx + renderedOffsetPx,
                    cy: correctedStart.cy
                  };
                  const renderedEnd = {
                    cx: correctedEnd.cx + renderedOffsetPx,
                    cy: correctedEnd.cy
                  };
                  const targetForward = normalizeVector(
                    renderedEnd.cx - renderedStart.cx,
                    renderedEnd.cy - renderedStart.cy,
                    corridor.axis.x,
                    corridor.axis.y
                  );
                  let entryForward = normalizeVector(
                    previousSampleB.cx - previousSampleA.cx,
                    previousSampleB.cy - previousSampleA.cy,
                    targetForward.x,
                    targetForward.y
                  );
                  const entryTargetDot =
                    entryForward.x * targetForward.x + entryForward.y * targetForward.y;
                  if (entryTargetDot < 0.12) {
                    entryForward = normalizeVector(
                      entryForward.x + targetForward.x * 1.35,
                      entryForward.y + targetForward.y * 1.35,
                      targetForward.x,
                      targetForward.y
                    );
                  }
                  const blendedForward = normalizeVector(
                    entryForward.x * 0.58 + targetForward.x * 0.42,
                    entryForward.y * 0.58 + targetForward.y * 0.42,
                    targetForward.x,
                    targetForward.y
                  );
                  const routeNormal = {
                    x: -targetForward.y * (assignment.actor.role === "escort" ? 1 : -1),
                    y: targetForward.x * (assignment.actor.role === "escort" ? 1 : -1)
                  };
                  const renderedLeadA = host.offsetAirShowPoint(
                    renderedStart,
                    blendedForward.x * 72,
                    blendedForward.y * 72
                  );
                  const renderedLeadB = host.offsetAirShowPoint(
                    renderedStart,
                    blendedForward.x * 128 + targetForward.x * 46,
                    blendedForward.y * 128 + targetForward.y * 46
                  );
                  const renderedMid = host.offsetAirShowPoint(
                    {
                      cx: renderedStart.cx + (renderedEnd.cx - renderedStart.cx) * 0.62,
                      cy: renderedStart.cy + (renderedEnd.cy - renderedStart.cy) * 0.62
                    },
                    routeNormal.x * 18,
                    routeNormal.y * 18
                  );
                  return [
                    renderedStart,
                    renderedLeadA,
                    renderedLeadB,
                    renderedMid,
                    renderedEnd
                  ].map((point) => ({
                    cx: point.cx - renderedOffsetPx,
                    cy: point.cy
                  }));
                })()
              : shiftedPoints;
          return {
            ...assignment,
            actor: needsContinuityShift
              ? {
                  ...assignment.actor,
                  position: {
                    cx: previousInspectionEnd!.cx,
                    cy: previousInspectionEnd!.cy
                  }
                }
              : assignment.actor,
            points: radiallyCommittedPoints
          };
        });
      }
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
      updateFlightAnchors([
        ...postPassBombers,
        ...targetRunFighterFlights
      ]);
      postPassBombers.forEach((flight) =>
        host.syncAirShowFlightStrengthForInspection(
          flight,
          Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)
        )
      );
    }

    const fighterEgressFlights = activeFlights([...interceptorFlights, ...escortFlights]);
    const bomberEgressFlights = activeFlights(bomberFlights).filter(
      (flight) => (flight.currentStrength ?? flight.spec.finalStrength ?? 0) > 0
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
        9800
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
          entryTurnLimitDeg: 58,
          directTurnHomeRoles: ["bomber"]
        }
      );
      const directedEgressAssignments = finalizedEgressAssignments.map((assignment) => {
        if (
          assignment.actor.role !== "interceptor"
          && assignment.actor.role !== "escort"
        ) {
          return assignment;
        }
        const homeSideSign = assignment.actor.role === "escort" ? -1 : 1;
        const sideCorrectedPoints =
          hqMidX === null
            ? assignment.points
            : assignment.points.map((point, pointIndex) => {
                if (pointIndex === 0) {
                  return point;
                }
                const sideFloorX = hqMidX + homeSideSign * (360 + Math.min(pointIndex, 4) * 28);
                const targetCx =
                  homeSideSign < 0
                    ? Math.min(point.cx, sideFloorX)
                    : Math.max(point.cx, sideFloorX);
                const correctionWeight = host.clamp(pointIndex / 2, 0, 1);
                return {
                  ...point,
                  cx: point.cx + (targetCx - point.cx) * correctionWeight
                };
              });
        const homeSidePoints = buildSmoothHomeSideFighterEgressPath(
          sideCorrectedPoints,
          homeSideSign
        );
        return {
          ...assignment,
          points: homeSidePoints,
          progressTimeline: [
            { timeMs: 0, progress: 0 },
            { timeMs: Math.round(egressDurationMs * 0.22), progress: 0.44 },
            { timeMs: Math.round(egressDurationMs * 0.62), progress: 0.86 },
            { timeMs: egressDurationMs, progress: 1 }
          ]
        };
      });
      recordPhase("egress", directedEgressAssignments, egressDurationMs, [], [], egressRoleSpeeds);
    }

    return buildPlannedAirShowSceneReport();
}
