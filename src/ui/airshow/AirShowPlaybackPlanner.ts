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

function spreadBomberFormationAssignmentsForCorridor(
  assignments: ReadonlyArray<AirShowPhaseAssignment>,
  corridor: AirShowPlannerCorridor
): AirShowPhaseAssignment[] {
  const actorCountByFlightId = new Map<string, number>();
  assignments.forEach((assignment) => {
    if (assignment.actor.role !== "bomber") {
      return;
    }
    actorCountByFlightId.set(
      assignment.actor.flightId,
      Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1)
    );
  });
  return assignments.map((assignment) => {
    if (assignment.actor.role !== "bomber") {
      return assignment;
    }
    const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
    if (actorCount <= 1) {
      return assignment;
    }
    const pairIndex = Math.floor(assignment.actor.formationIndex / 2);
    const pairCount = Math.ceil(actorCount / 2);
    const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
    const pairSlot = pairIndex - (pairCount - 1) / 2;
    const alongOffsetPx = pairSlot * 72 + sideSign * 9;
    const lateralOffsetPx = sideSign * (44 + pairIndex * 7);
    return {
      ...assignment,
      points: assignment.points.map((point) => ({
        cx: point.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
        cy: point.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
      }))
    };
  });
}

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
        const explicitRangeReferenceCenter = burst.rangeReferenceCenter ?? null;
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
          explicitRangeReferenceCenter
          ?? batteryCenter
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
      const firstLegTarget = egressPath[1] ?? egressPoint;
      const continuityForward = normalizeVector(
        firstLegTarget.cx - current.cx,
        firstLegTarget.cy - current.cy,
        headingForward.x,
        headingForward.y
      );
      const continuityDistancePx = host.clamp(
        Math.hypot(firstLegTarget.cx - current.cx, firstLegTarget.cy - current.cy) * 0.42,
        42,
        74
      );
      const continuityPoint = host.offsetAirShowPoint(
        current,
        continuityForward.x * continuityDistancePx,
        continuityForward.y * continuityDistancePx
      );
      const continuitySeedPath = [
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
      const continuousEgressPath = host.sanitizeAirShowEntryPath(
        continuitySeedPath,
        {
          maxTurnDeg: 40,
          strongTurnDeg: 74,
          maxFirstSegmentPx: 72,
          maxSharpTurnDeg: 100,
          maxWaypointsToRemove: 2
        }
      );
      return host.buildAirShowFlightAssignments(
        flight,
        continuousEgressPath,
        0.18,
        index,
        bomberFlightsForPhase.length
      );
    });

  const buildCorridorContestedAirShowPlan = (): PlannedAirShowScene | null => {
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
            const sameFlight = left.actor.flightId === right.actor.flightId;
            const sameFlightFighterPair =
              sameFlight
              && (
                left.actor.role === "interceptor"
                || left.actor.role === "escort"
              )
              && left.actor.role === right.actor.role;
            if (
              !left.actor.active ||
              !right.actor.active ||
              (sameFlight && !sameFlightFighterPair) ||
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
            const correctionPx =
              (minimumDistancePx - Math.max(0.1, distancePx))
              * (sameFlightFighterPair ? 0.72 : 0.58);
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
      const assignments = host.buildAirShowFlightAssignments(
        flight,
        resolvedPath,
        headingBlend,
        0,
        1,
        { phaseStartAnchor: resolvedPath[0] }
      );
      const spreadFighterFormationAssignments = (
        fighterAssignments: ReadonlyArray<AirShowPhaseAssignment>
      ): AirShowPhaseAssignment[] => {
        const actorCountByFlightId = new Map<string, number>();
        fighterAssignments.forEach((assignment) => {
          if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
            return;
          }
          actorCountByFlightId.set(
            assignment.actor.flightId,
            Math.max(
              actorCountByFlightId.get(assignment.actor.flightId) ?? 0,
              assignment.actor.formationIndex + 1
            )
          );
        });
        return fighterAssignments.map((assignment) => {
          if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
            return assignment;
          }
          const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
          if (actorCount <= 1) {
            return assignment;
          }
          const slot = assignment.actor.formationIndex - (actorCount - 1) / 2;
          const roleBiasPx = assignment.actor.role === "interceptor" ? -8 : 8;
          const alongOffsetPx = slot * 9;
          const lateralOffsetPx = slot * 20 + roleBiasPx;
          return {
            ...assignment,
            points: assignment.points.map((point) => ({
              cx: point.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
              cy: point.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
            }))
          };
        });
      };
      return flight.spec.role === "bomber"
        ? spreadBomberFormationAssignments(assignments)
        : spreadFighterFormationAssignments(assignments);
    };
    const spreadBomberFormationAssignments = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>
    ): AirShowPhaseAssignment[] => {
      const actorCountByFlightId = new Map<string, number>();
      assignments.forEach((assignment) => {
        if (assignment.actor.role !== "bomber") {
          return;
        }
        actorCountByFlightId.set(
          assignment.actor.flightId,
          Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1)
        );
      });
      return assignments.map((assignment) => {
        if (assignment.actor.role !== "bomber") {
          return assignment;
        }
        const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
        if (actorCount <= 1) {
          return assignment;
        }
        const pairIndex = Math.floor(assignment.actor.formationIndex / 2);
        const pairCount = Math.ceil(actorCount / 2);
        const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
        const pairSlot = pairIndex - (pairCount - 1) / 2;
        const alongOffsetPx = pairSlot * 72 + sideSign * 9;
        const lateralOffsetPx = sideSign * (44 + pairIndex * 7);
        return {
          ...assignment,
          points: assignment.points.map((point) => ({
            cx: point.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
            cy: point.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
          }))
        };
      });
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
      ["fighter-ingress", 0.195],
      ["escort-clash-merge", 0.195],
      ["escort-clash-scramble", 0.19],
      ["bomber-ingress", 0.22],
      ["bomber-defense-pass", 0.2]
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
      const phaseOverflowAllowancePx =
        label === "fighter-ingress"
          ? Math.max(18, lengthPx * 0.02)
          : label === "escort-clash-merge"
            ? Math.max(18, lengthPx * 0.024)
            : label === "escort-clash-scramble"
              ? Math.max(20, lengthPx * 0.028)
              : label === "bomber-ingress"
                ? Math.max(24, lengthPx * 0.034)
                : Math.max(0, lengthPx * 0.08);
      const phaseDistanceCeilingPx =
        label === "bomber-defense-pass"
          ? lengthPx
          : host.clamp(
              staticEndDistancePx + phaseOverflowAllowancePx,
              staticStartDistancePx,
              lengthPx
            );
      const startDistancePx = host.clamp(
        currentDistancePx,
        staticStartDistancePx,
        phaseDistanceCeilingPx
      );
      const staticSegmentLengthPx = Math.max(1, staticEndDistancePx - staticStartDistancePx);
      const minimumAdvancePx =
        label === "fighter-ingress"
          ? Math.max(24, lengthPx * 0.03)
          : label === "escort-clash-merge"
            ? Math.max(20, lengthPx * 0.022)
            : label === "escort-clash-scramble"
              ? Math.max(20, lengthPx * 0.022)
              : label === "bomber-ingress"
                ? Math.max(22, lengthPx * 0.024)
                : Math.max(22, lengthPx * 0.024);
      const desiredEndDistancePx = Math.max(
        staticEndDistancePx,
        startDistancePx + Math.min(staticSegmentLengthPx, minimumAdvancePx)
      );
      const endDistancePx = host.clamp(
        desiredEndDistancePx,
        startDistancePx,
        phaseDistanceCeilingPx
      );
      const path = slicePathByDistanceRange(plan.preTargetPath, startDistancePx, endDistancePx);
      if (path.length <= 0) {
        return [current];
      }
      const canonicalStart = path[0]!;
      const offsetX = current.cx - canonicalStart.cx;
      const offsetY = current.cy - canonicalStart.cy;
      return dedupePath(
        path.map((point) => ({
          cx: point.cx + offsetX,
          cy: point.cy + offsetY
        }))
      );
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
    const governedBomberSpeedPxPerMs = Math.min(
      host.airShowBomberSpeedPxPerMs,
      host.airShowFighterSpeedPxPerMs * 0.5
    );
    const seedTargetRunDurationMs = Math.max(
      1,
      Math.round(
        bomberPlans.reduce((longest, plan) => Math.max(longest, measurePathLength(plan.targetRunPath)), 0)
        / governedBomberSpeedPxPerMs
      )
    );
    const roleSpeeds = host.resolveAirShowRoleSpeedMap({
      interceptor: host.airShowFighterSpeedPxPerMs,
      escort: host.airShowFighterSpeedPxPerMs,
      bomber: governedBomberSpeedPxPerMs
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
        // Prevent short-path speed matching from creating giant lateral loops that
        // scatter fighters across the map during bomber-ingress/defense.
        const lateralPx = host.clamp(solvedLateralPx, 0, 240);
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
      const mergeCoordinates = resolveAirShowRailCoordinates(corridor, corridor.merge);
      const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
      const pairIndex = Math.floor(assignment.actor.formationIndex / 2);
      const roleLeadPx = assignment.actor.role === "interceptor" ? -34 : -74;
      const roleLateralBiasPx = assignment.actor.role === "interceptor" ? -74 : 74;
      const slotLeadPx = sideSign * 6;
      const slotLateralPx = sideSign * (24 + pairIndex * 6);
      const target = projectAirShowRailPoint(
        corridor,
        mergeCoordinates.alongPx + roleLeadPx + slotLeadPx,
        mergeCoordinates.lateralPx + roleLateralBiasPx + slotLateralPx
      );
      const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
      const targetProjection = resolveAirShowRailCoordinates(corridor, target);
      let escortVisibleEntryProgress: number | null = null;
      let points = assignment.actor.role === "interceptor"
        ? (() => {
            const lateralKickSign = targetProjection.lateralPx < 0 ? -1 : 1;
            const directDx = target.cx - start.cx;
            const directDy = target.cy - start.cy;
            const directDistancePx = Math.hypot(target.cx - start.cx, target.cy - start.cy);
            const forward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
            const bendNormal = { x: -forward.y, y: forward.x };
            const bendLateralPx = host.clamp(directDistancePx * 0.11, 42, 128);
            return dedupePath([
              start,
              {
                cx: start.cx + directDx * 0.44 + bendNormal.x * lateralKickSign * bendLateralPx,
                cy: start.cy + directDy * 0.44 + bendNormal.y * lateralKickSign * bendLateralPx
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
      let pathLengthPx = measurePathLength(points);
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
          const factionOrigin =
            hqAxis
              ? (flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin)
              : fallbackOriginFor(flight.spec);
          const current =
            label === "fighter-ingress"
              ? factionOrigin
              : (host.averageAirShowPosition(flight.actors) ?? flight.anchor);
          const lane = resolveGroupLane(group, flight, role);
          const roleFlights = role === "interceptor" ? group.interceptorFlights : group.escortFlights;
          const localSlot = Math.max(0, roleFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id));
          const localLane = roleFlights.length <= 1 ? 0 : localSlot - (roleFlights.length - 1) / 2;
          const travelSign = role === "interceptor" ? -1 : 1;
          const laneOffsetPx = resolveAirShowRailLaneOffsetPx(
            lane,
            role,
            (flight.spec.laneOffsetPx ?? 0) * 0.24
          );
          let path: AirShowPoint[];

          if (label === "fighter-ingress") {
            const mergeCoordinates = resolveAirShowRailCoordinates(corridor, corridor.merge);
            const ingressLaneOffsetPx = host.clamp(laneOffsetPx * 0.58, -118, 118);
            const ingressLeadPx = role === "interceptor" ? -42 : 46;
            const target = projectAirShowRailPoint(
              corridor,
              mergeCoordinates.alongPx + ingressLeadPx,
              mergeCoordinates.lateralPx + ingressLaneOffsetPx
            );
            path = buildFighterRailPath(current, target, ingressLaneOffsetPx, label);
          } else if (label === "escort-clash-merge") {
            const mergeLaneOffsetPx = laneOffsetPx * 0.72;
            const mergeFocus = blendAirShowPoints(
              fighterClashCenter(lane, 14),
              averageBomberPointAtPhaseProgress("escort-clash-merge", 0.56),
              0.4
            );
            path = host.buildAirShowMergePassPath(
              current,
              host.offsetAirShowPoint(
                mergeFocus,
                corridor.normal.x * mergeLaneOffsetPx * 0.14,
                corridor.normal.y * mergeLaneOffsetPx * 0.14
              ),
              corridor,
              {
                sideSign: role === "interceptor" ? -1 : 1,
                laneIndex: lane + localLane * 0.2 + (role === "interceptor" ? -0.2 : 0.2),
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                entrySeparationPx: role === "interceptor" ? 136 : 122,
                crossSeparationPx: role === "interceptor" ? 24 : 20,
                overshootPx: role === "interceptor" ? 148 : 132
              }
            );
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
            const chaseLaneOffsetPx = switchedLaneOffsetPx * 0.12 + Math.max(0, localSlot) * (role === "interceptor" ? -6 : 6);
            const chaseLeadPx = role === "interceptor" ? -10 : 10;
            const target = host.offsetAirShowPoint(
              scrambleFocus,
              corridor.normal.x * chaseLaneOffsetPx + corridor.axis.x * chaseLeadPx,
              corridor.normal.y * chaseLaneOffsetPx + corridor.axis.y * chaseLeadPx
            );
            path =
              role === "interceptor"
                ? host.buildAirShowPursuitPath(current, target, {
                    startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                    lateralSign: lane >= 0 ? 1 : -1,
                    entryLateralPx: 62 + Math.abs(localLane) * 8,
                    mergeLateralPx: 20 + Math.abs(localLane) * 6,
                    attackOffsetPx: 6 + Math.abs(localLane) * 3,
                    closeInPx: 10,
                    overshootPx: 58,
                    breakLateralPx: 44,
                    breakForwardPx: 42,
                    driftPx: switchedLane * 8
                  })
                : host.buildAirShowBreakTurnPath(current, target, {
                    startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                    lateralSign: lane >= 0 ? -1 : 1,
                    entryLateralPx: 28 + Math.abs(localLane) * 6,
                    guardForwardPx: 18,
                    guardLateralPx: 48 + Math.abs(localLane) * 8,
                    exitForwardPx: 58,
                    exitLateralPx: 62 + Math.abs(localLane) * 8,
                    trailForwardPx: 26
                  });
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
          } else if (label === "bomber-defense-pass" && role === "escort") {
            const screenPoint = averageBomberPointAtPhaseProgress(label, 0.58);
            const screenLaneOffsetPx = laneOffsetPx * 0.78 + (lane >= 0 ? 24 : -24);
            path = buildFighterRailPath(
              current,
              fighterRailTarget(screenPoint, screenLaneOffsetPx, 42),
              screenLaneOffsetPx,
              label
            );
          } else if (role === "interceptor") {
            const interceptorIndex = activeFlights(interceptorFlights).findIndex((candidate) => candidate.spec.id === flight.spec.id);
            const targetPlan = bomberPlans[Math.max(0, interceptorIndex) % Math.max(1, bomberPlans.length)];
            const focusPoint = targetPlan
              ? bomberPhaseFocusPoint(targetPlan, label, 0.56)
              : averageBomberPointAtPhaseProgress(label, 0.56);
            path = buildFighterRailPath(current, fighterRailTarget(focusPoint, laneOffsetPx * 0.36, 34), laneOffsetPx * 0.36, label);
          } else {
            const currentCoords = resolveAirShowRailCoordinates(corridor, current);
            const homeAlongSign =
              hqAxis
                ? (flight.spec.faction === "Bot" ? -1 : 1)
                : (currentCoords.alongPx >= 0 ? 1 : -1);
            const peelTarget = projectAirShowRailPoint(
              corridor,
              currentCoords.alongPx + homeAlongSign * (168 + Math.abs(lane) * 22),
              laneOffsetPx * 0.62 + homeAlongSign * 36
            );
            path = buildFighterRailPath(current, peelTarget, laneOffsetPx * 0.46, label);
          }
          assignments.push(...buildAssignmentsForFlightPath(flight, path, 0.34));
        });
      });
      return assignments;
    };
    /**
     * Build short dogfight tracer volleys for close, weaving merge engagements.
     */
    const buildDogfightTracers = (
      assignments: ReadonlyArray<AirShowPhaseAssignment>,
      label: "escort-clash-merge" | "escort-clash-scramble"
    ): AirShowTracerBurst[] => {
      const tracers: AirShowTracerBurst[] = [];
      const isMerge = label === "escort-clash-merge";
      const interceptorTimings = isMerge
        ? [0.52, 0.64, 0.76]
        : [0.25, 0.40, 0.55, 0.70, 0.82];
      const escortTimings = isMerge
        ? [0.55, 0.67, 0.79]
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
            maxAlignmentDeg: isMerge ? 40 : 34,
            maxRangePx: isMerge ? 206 : 196,
            timings: interceptorTimings,
            fallbackToNearest: false
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
            maxAlignmentDeg: isMerge ? 38 : 32,
            maxRangePx: isMerge ? 202 : 192,
            timings: escortTimings,
            fallbackToNearest: false
          }));
        });
      });
      return isMerge
        ? tracers.map((tracer) => ({
            ...tracer,
            progress: Math.max(0.5, tracer.progress)
          }))
        : tracers;
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
      return bomberPlans.flatMap((plan, planIndex) => {
        const scoped = host.resolveAirShowBomberFlakBursts(scene, plan.flight.spec.id);
        const bomberSlot = planIndex - (bomberPlans.length - 1) / 2;
        const syntheticProgressSlots = phase === "approach"
          ? [0.3, 0.5]
          : [0.58, 0.76];
        const syntheticMinProgress = phase === "approach" ? 0.16 : 0.2;
        const syntheticMaxProgress = phase === "approach" ? 0.86 : 0.84;
        const syntheticScopedBursts: ScopedFlakBurst[] = syntheticProgressSlots.map((slotProgress, slotIndex) => {
          const slotSeed = host.seedFromHexKey(
            `${plan.flight.spec.id}:${phase}:synthetic-slot:${slotIndex}`
          ) >>> 0;
          const slotNoise = ((((Math.imul(slotSeed ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0) / 0x100000000) - 0.5);
          return {
            progress: host.clamp(
              slotProgress
              + bomberSlot * (phase === "approach" ? 0.018 : 0.016)
              + slotNoise * (phase === "approach" ? 0.076 : 0.064),
              syntheticMinProgress,
              syntheticMaxProgress
            ),
            count: 1,
            puffCount: phase === "approach" ? 2 : 3,
            smokePuffCount: phase === "approach" ? 3 : 4,
            scale: 0.72,
            smokeScale: 1.12,
            alongOffsetPx: -72 + slotIndex * 34 + bomberSlot * 14,
            lateralOffsetPx: bomberSlot * 106 + (slotIndex - 0.5) * 58,
            alongSpreadPx: 66,
            lateralSpreadPx: 176,
            bomberUnitKey: plan.flight.spec.id,
            targetHexKey:
              bomberSpecsById.get(plan.flight.spec.id)?.targetHexKey
              ?? scene.bomberTargetHexKey
              ?? null,
            batteryHexKey: null
          };
        });
        const usingSyntheticSource = scoped.length <= 0;
        const expandedScopedBursts =
          scoped.length === 1
            ? scoped.flatMap((burst) => {
                const baseProgress = burst.progress ?? 0.5;
                const volleyOffsets = phase === "approach" ? [-0.018, 0.022] : [-0.016, 0.02];
                return volleyOffsets.map((offset, volleyIndex) => ({
                  ...burst,
                  progress: host.clamp(baseProgress + offset, phase === "approach" ? 0.14 : 0.18, phase === "approach" ? 0.88 : 0.85),
                  alongOffsetPx: (burst.alongOffsetPx ?? 0) + (volleyIndex === 0 ? -10 : 10),
                  lateralOffsetPx: (burst.lateralOffsetPx ?? 0) + (volleyIndex === 0 ? -14 : 14),
                  count: 1
                }));
              })
            : scoped;
        const sourceBursts = usingSyntheticSource ? syntheticScopedBursts : expandedScopedBursts;
        const scopedCount = sourceBursts.length;
        return sourceBursts.flatMap((burst, burstIndex) => {
          const jitter01 = (sampleIndex: number, salt: number): number => {
            let seed =
              (
                host.seedFromHexKey(
                  `${plan.flight.spec.id}:${phase}:${burstIndex}:${burst.batteryHexKey ?? ""}:${burst.targetHexKey ?? ""}`
                )
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
          const slotProgress = host.clamp(
            burst.progress
            ?? (scopedCount <= 1 ? 0.5 : burstIndex / Math.max(1, scopedCount - 1)),
            0,
            1
          );
          const slotWidth = (maxProgress - minProgress) / Math.max(1, scopedCount);
          const baseProgress = host.clamp(
            minProgress
            + (maxProgress - minProgress)
              * host.clamp(
                slotProgress + (jitter01(burstIndex, 53) - 0.5) * (0.34 / Math.max(1, scopedCount)),
                0,
                1
              ),
            minProgress,
            maxProgress
          );
          const sampledBomberCenterByProgress = new Map<number, AirShowPoint | null>();
          const sampleBomberCenterAtProgress = (progress: number): AirShowPoint | null => {
            const normalizedProgress = Number(host.clamp(progress, 0, 1).toFixed(4));
            if (sampledBomberCenterByProgress.has(normalizedProgress)) {
              return sampledBomberCenterByProgress.get(normalizedProgress) ?? null;
            }
            const sampledActorPositions = plan.flight.actors.flatMap((actor) => {
              const assignment = assignmentsByActorId.get(actor.id);
              return assignment
                ? [host.sampleAirShowAssignmentAtTime(assignment, durationMs * normalizedProgress, durationMs).position]
                : [];
            });
            const centerAtProgress = host.averageAirShowPoints(sampledActorPositions);
            sampledBomberCenterByProgress.set(normalizedProgress, centerAtProgress);
            return centerAtProgress;
          };
          const sweepStepCount = phase === "approach" ? 12 : 14;
          const sweepProgresses = Array.from({ length: sweepStepCount + 1 }, (_, stepIndex) =>
            host.clamp(
              minProgress + (maxProgress - minProgress) * (stepIndex / sweepStepCount),
              minProgress,
              maxProgress
            )
          );
          const candidateProgresses = Array.from(new Set([
            baseProgress,
            slotProgress,
            host.clamp(baseProgress - slotWidth * 0.72, minProgress, maxProgress),
            host.clamp(baseProgress + slotWidth * 0.72, minProgress, maxProgress),
            host.clamp(baseProgress + (jitter01(burstIndex, 79) - 0.5) * slotWidth, minProgress, maxProgress),
            ...sweepProgresses
          ].map((progress) => Number(progress.toFixed(4)))));
          type FlakProgressSample = {
            progress: number;
            bomberCenter: AirShowPoint;
            distancePx: number;
          };
          const candidateSamples = candidateProgresses.flatMap((progress) => {
            const bomberCenter = sampleBomberCenterAtProgress(progress);
            if (!bomberCenter) {
              return [];
            }
            return [{
              progress,
              bomberCenter,
              distancePx: Math.hypot(
                bomberCenter.cx - rangeReferenceCenter.cx,
                bomberCenter.cy - rangeReferenceCenter.cy
              )
            }] satisfies FlakProgressSample[];
          });
          const chooseBestSample = (
            samples: ReadonlyArray<FlakProgressSample>
          ): FlakProgressSample | null =>
            samples.reduce<FlakProgressSample | null>((bestSample, sample) => {
              if (!bestSample) {
                return sample;
              }
              const bestBaseDelta = Math.abs(bestSample.progress - baseProgress);
              const sampleBaseDelta = Math.abs(sample.progress - baseProgress);
              if (sampleBaseDelta + 0.0001 < bestBaseDelta) {
                return sample;
              }
              if (Math.abs(sampleBaseDelta - bestBaseDelta) <= 0.0001 && sample.distancePx < bestSample.distancePx) {
                return sample;
              }
              return bestSample;
            }, null);
          const inRangeSamples = candidateSamples.filter((sample) => sample.distancePx <= rangePx);
          const selectedSample = chooseBestSample(inRangeSamples) ?? chooseBestSample(candidateSamples);
          if (!selectedSample) {
            return [];
          }
          if (!usingSyntheticSource && selectedSample.distancePx > rangePx) {
            return []; // Source flak may only render when bomber is in battery range during this phase.
          }
          const sampleIndex = burstIndex;
          const basePuffCount = burst.puffCount ?? (phase === "approach" ? 4 : 5);
          const puffCount = Math.max(
            2,
            Math.min(
              3,
              Math.round(basePuffCount <= 1 ? 2 : basePuffCount * 0.34)
            )
          );
          const requestedSmokePuffCount = burst.smokePuffCount ?? Math.round(puffCount * 1.15);
          const smokePuffCount = Math.max(
            puffCount + 1,
            Math.min(5, Math.round(requestedSmokePuffCount * 0.8))
          );
          const jitteredProgress = host.clamp(
            selectedSample.progress
            + bomberSlot * (phase === "approach" ? 0.011 : 0.014)
            + (jitter01(sampleIndex, burstIndex + 1) - 0.5)
            * (usingSyntheticSource ? (phase === "approach" ? 0.05 : 0.054) : (phase === "approach" ? 0.042 : 0.046)),
            minProgress,
            phase === "approach" ? maxProgress : 0.84
          );
          const jitteredBomberCenter = sampleBomberCenterAtProgress(jitteredProgress) ?? selectedSample.bomberCenter;
          const syntheticRangeReferenceCenter = usingSyntheticSource
            ? { cx: jitteredBomberCenter.cx, cy: jitteredBomberCenter.cy }
            : undefined;
          return [{
            ...burst,
            progress: jitteredProgress,
            count: Math.max(1, burst.count ?? 1),
            puffCount,
            smokePuffCount,
            rangeReferenceCenter: syntheticRangeReferenceCenter,
            alongOffsetPx: host.clamp(
              (burst.alongOffsetPx ?? 0) * 0.64 - 52 + jitter01(sampleIndex, burstIndex + 11) * 148,
              -152,
              152
            ),
            lateralOffsetPx: host.clamp(
              (burst.lateralOffsetPx ?? 0) * 0.58
              + (jitter01(sampleIndex, burstIndex + 23) - 0.5) * 244
              + bomberSlot * 42
              + (burstIndex - (scopedCount - 1) / 2) * 22
              + (jitter01(sampleIndex, planIndex + 71) - 0.5) * 62,
              -308,
              308
            ),
              alongSpreadPx: Math.max(
                64,
                Math.min(116, Math.round((burst.alongSpreadPx ?? 72) * (0.94 + jitter01(sampleIndex, burstIndex + 29) * 0.24)))
              ),
              lateralSpreadPx: Math.max(
                190,
                Math.min(320, Math.round((burst.lateralSpreadPx ?? 186) * (1.12 + jitter01(sampleIndex, burstIndex + 37) * 0.3)))
              ),
            scale: Math.max(0.62, (burst.scale ?? 1) * (0.7 + jitter01(sampleIndex, burstIndex + 31) * 0.26)),
            smokeScale: Math.max(1.08, (burst.smokeScale ?? 1) * (1.02 + jitter01(sampleIndex, burstIndex + 43) * 0.22)),
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
      const resolvedDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(
        assignments,
        roleSpeeds,
        seedDurationByPhase.get(label) ?? 1,
        1,
        60000,
        requiredRoles
      );
      if (label === "fighter-ingress") {
        const interceptorRequiredDurationMs = assignments.reduce((maxDurationMs, assignment) => {
          if (assignment.actor.role !== "interceptor") {
            return maxDurationMs;
          }
          const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
          const requiredDurationMs = Math.max(
            1,
            Math.round(measurePathLength(assignment.points) / Math.max(0.0001, roleSpeedPxPerMs))
          );
          return Math.max(maxDurationMs, requiredDurationMs);
        }, 0);
        const seededDurationMs = Math.max(
          1,
          Math.round(seedDurationByPhase.get("fighter-ingress") ?? fighterIngressSeedDurationMs ?? resolvedDurationMs)
        );
        const ingressMinDurationMs = Math.max(1, Math.round(seededDurationMs * 0.72));
        const governedDurationMs = interceptorRequiredDurationMs > 0
          ? Math.max(fighterIngressSeedDurationMs, interceptorRequiredDurationMs)
          : Math.max(resolvedDurationMs, fighterIngressSeedDurationMs);
        return Math.max(ingressMinDurationMs, governedDurationMs);
      }
      if (label === "escort-clash-merge" || label === "escort-clash-scramble") {
        const seededDurationMs = Math.max(
          1,
          Math.round(seedDurationByPhase.get(label) ?? resolvedDurationMs)
        );
        const ingressReferenceDurationMs = Math.max(
          1,
          Math.round(seedDurationByPhase.get("bomber-ingress") ?? seededDurationMs)
        );
        const ingressShareFloor =
          label === "escort-clash-merge"
            ? 0.74
            : 0.32;
        const ingressShareCeiling =
          label === "escort-clash-merge"
            ? 0.92
            : 0.52;
        const seededScaleFloor =
          label === "escort-clash-merge"
            ? 1.22
            : 1.1;
        const seededScaleCeiling =
          label === "escort-clash-merge"
            ? 2.08
            : 1.78;
        const clashMinDurationMs = Math.max(
          1100,
          Math.round(seededDurationMs * seededScaleFloor),
          Math.round(ingressReferenceDurationMs * ingressShareFloor)
        );
        const clashMaxDurationMs = Math.max(
          clashMinDurationMs,
          Math.round(seededDurationMs * seededScaleCeiling),
          Math.round(ingressReferenceDurationMs * ingressShareCeiling)
        );
        return host.clamp(resolvedDurationMs, clashMinDurationMs, clashMaxDurationMs);
      }
      if (label === "bomber-ingress") {
        const seededDurationMs = Math.max(
          1,
          Math.round(seedDurationByPhase.get("bomber-ingress") ?? resolvedDurationMs)
        );
        const seededPreTargetDurationMs = orderedPreTargetPhaseLabels.reduce(
          (sum, phaseLabel) => sum + Math.max(1, Math.round(seedDurationByPhase.get(phaseLabel) ?? 1)),
          0
        );
        const ingressReadableShareFloorMs = Math.max(
          1,
          Math.round(seededPreTargetDurationMs * 0.12)
        );
        const ingressMinDurationMs = Math.max(
          ingressReadableShareFloorMs,
          Math.round(seededDurationMs * 0.9)
        );
        const ingressMaxDurationMs = Math.max(
          ingressMinDurationMs,
          Math.round(seededDurationMs * 1.32)
        );
        return host.clamp(resolvedDurationMs, ingressMinDurationMs, ingressMaxDurationMs);
      }
      if (label === "bomber-defense-pass") {
        const seededDurationMs = Math.max(
          1,
          Math.round(seedDurationByPhase.get("bomber-defense-pass") ?? resolvedDurationMs)
        );
        const ingressReferenceDurationMs = Math.max(
          1,
          Math.round(seedDurationByPhase.get("bomber-ingress") ?? seededDurationMs)
        );
        const defenseMinDurationMs = Math.max(
          840,
          Math.round(seededDurationMs * 0.34),
          Math.round(ingressReferenceDurationMs * 0.88)
        );
        const defenseMaxDurationMs = Math.max(
          defenseMinDurationMs,
          Math.round(seededDurationMs * 1.48)
        );
        return host.clamp(resolvedDurationMs, defenseMinDurationMs, defenseMaxDurationMs);
      }
      return resolvedDurationMs;
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
        const convergencePoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.axis.x * roleSide * 8 + corridor.normal.x * (lane * 20 + actorSlot * 9),
          corridor.axis.y * roleSide * 8 + corridor.normal.y * (lane * 20 + actorSlot * 9)
        );
        const currentForward =
          previousHeading
          ?? resolveHeadingVector(assignment.actor.headingDegrees, {
            x: convergencePoint.cx - start.cx,
            y: convergencePoint.cy - start.cy
          });
        const distanceToConvergencePx = Math.hypot(
          convergencePoint.cx - start.cx,
          convergencePoint.cy - start.cy
        );
        const carryDistancePx = Math.min(108, distanceToConvergencePx * 0.14);
        const carryPoint = host.offsetAirShowPoint(
          start,
          currentForward.x * carryDistancePx,
          currentForward.y * carryDistancePx
        );
        const entryPoint = host.offsetAirShowPoint(
          carryPoint,
          (convergencePoint.cx - carryPoint.cx) * 0.36
            + corridor.normal.x * (roleSide * 38 + lane * 14 + actorSlot * 8),
          (convergencePoint.cy - carryPoint.cy) * 0.36
            + corridor.normal.y * (roleSide * 38 + lane * 14 + actorSlot * 8)
        );
        const preMergePoint = host.offsetAirShowPoint(
          entryPoint,
          (convergencePoint.cx - entryPoint.cx) * 0.62
            + corridor.normal.x * (lane * 12 - roleSide * 16 + actorSlot * 6),
          (convergencePoint.cy - entryPoint.cy) * 0.62
            + corridor.normal.y * (lane * 12 - roleSide * 16 + actorSlot * 6)
        );
        const breakPoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.axis.x * (42 + lane * 8 + actorSlot * 5)
            + corridor.normal.x * (lane * 30 - roleSide * 72 + actorSlot * 14),
          corridor.axis.y * (42 + lane * 8 + actorSlot * 5)
            + corridor.normal.y * (lane * 30 - roleSide * 72 + actorSlot * 14)
        );
        const rejoinPoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.axis.x * (122 + lane * 12)
            + corridor.normal.x * (roleSide * 34 + lane * 6 + actorSlot * 12),
          corridor.axis.y * (122 + lane * 12)
            + corridor.normal.y * (roleSide * 34 + lane * 6 + actorSlot * 12)
        );
        const exitPoint = host.offsetAirShowPoint(
          rejoinPoint,
          (end.cx - rejoinPoint.cx) * 0.42,
          (end.cy - rejoinPoint.cy) * 0.42
        );
        const points = dedupePath([
          start,
          carryPoint,
          entryPoint,
          preMergePoint,
          convergencePoint,
          breakPoint,
          rejoinPoint,
          exitPoint,
          end
        ]);
        const convergencePointIndex = points.findIndex((point) => point === convergencePoint);
        const breakPointIndex = points.findIndex((point) => point === breakPoint);
        const convergenceDistancePx = measurePathLength(
          points.slice(0, convergencePointIndex >= 0 ? convergencePointIndex + 1 : 5)
        );
        const breakDistancePx = measurePathLength(
          points.slice(0, breakPointIndex >= 0 ? breakPointIndex + 1 : 6)
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
            {
              timeMs: Math.round(durationMs * Math.min(0.76, convergenceTimeProgress + 0.16)),
              progress: pathProgressAtDistance(points, breakDistancePx)
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
          currentForward.x * 66,
          currentForward.y * 66
        );
        const escortConvergenceScale = assignment.actor.role === "escort" ? 0.18 : 1;
        const pocketNormalPx =
          (lane * 14 + roleSide * 8 + actorSlot * 5) * escortConvergenceScale;
        const pocketAxisPx =
          (roleSide * 4 + actorSlot * 2) * escortConvergenceScale;
        const sweepAxisPx =
          (50 + lane * 7) * (assignment.actor.role === "escort" ? 0.82 : 1);
        const sweepNormalPx =
          (lane * 24 - roleSide * 30 + actorSlot * 8) * (assignment.actor.role === "escort" ? 0.24 : 1);
        const pocketPoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.normal.x * pocketNormalPx + corridor.axis.x * pocketAxisPx,
          corridor.normal.y * pocketNormalPx + corridor.axis.y * pocketAxisPx
        );
        const sweepPoint = host.offsetAirShowPoint(
          fightSpaceCenter,
          corridor.axis.x * sweepAxisPx + corridor.normal.x * sweepNormalPx,
          corridor.axis.y * sweepAxisPx + corridor.normal.y * sweepNormalPx
        );
        const entryPoint = host.offsetAirShowPoint(
          carryPoint,
          (pocketPoint.cx - carryPoint.cx) * 0.58
            + corridor.normal.x * roleSide * (assignment.actor.role === "escort" ? 0 : 12),
          (pocketPoint.cy - carryPoint.cy) * 0.58
            + corridor.normal.y * roleSide * (assignment.actor.role === "escort" ? 0 : 12)
        );
        const exitPoint = host.offsetAirShowPoint(
          sweepPoint,
          (end.cx - sweepPoint.cx) * 0.42,
          (end.cy - sweepPoint.cy) * 0.42
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
      const preparedAssignments =
        label === "fighter-ingress"
          ? [...extendedAssignments]
          : host.prepareAirShowPhaseAssignments(
              extendedAssignments,
              durationMs,
              [0.24, 0.5, 0.76],
              42,
              roleSpeeds,
              {
                previousAssignments: previousPhaseAssignments,
                previousDurationMs: previousPhaseDurationMs,
                entryTurnLimitDeg: 58,
                softenEntryRoles: ["bomber", "interceptor", "escort"],
                softenEntryTurnLimitDeg: 70,
                softenEntryWaypointCount: 18,
                softenExitRoles: ["bomber", "interceptor", "escort"],
                softenExitTurnLimitDeg: 78,
                softenExitWaypointCount: 12,
                sanitizeEntryTurns: true,
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
            projectAirShowRailPoint(corridor, -240, 0),
            0.48
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
              if (assignment.actor.role !== "interceptor") {
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
                    .filter((candidate) => candidate.actor.role === "interceptor")
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
              const fighterActorCount = Math.max(
                1,
                finalSpeedAdjustedAssignments.filter(
                  (candidate) =>
                    candidate.actor.flightId === assignment.actor.flightId
                    && candidate.actor.role === "interceptor"
                ).length
              );
              const localLane = assignment.actor.formationIndex - (fighterActorCount - 1) / 2;
              const lateralOffsetPx = -22 + localLane * 11;
              const interceptFocus = host.sampleAirShowAssignmentAtTime(
                targetBomberAssignment,
                durationMs * 0.48,
                durationMs
              ).position;
              const exitFocus = host.sampleAirShowAssignmentAtTime(
                targetBomberAssignment,
                durationMs * 0.78,
                durationMs
              ).position;
              const interceptPoint = host.offsetAirShowPoint(
                interceptFocus,
                corridor.normal.x * lateralOffsetPx * 0.42 - corridor.axis.x * 8,
                corridor.normal.y * lateralOffsetPx * 0.42 - corridor.axis.y * 8
              );
              const entryPoint = host.offsetAirShowPoint(
                start,
                (interceptPoint.cx - start.cx) * 0.38
                  + corridor.normal.x * lateralOffsetPx * 0.22
                  - corridor.axis.x * 16,
                (interceptPoint.cy - start.cy) * 0.38
                  + corridor.normal.y * lateralOffsetPx * 0.22
                  - corridor.axis.y * 16
              );
              const crossingPoint = host.offsetAirShowPoint(
                interceptFocus,
                corridor.axis.x * 54 - corridor.normal.x * lateralOffsetPx * 0.32,
                corridor.axis.y * 54 - corridor.normal.y * lateralOffsetPx * 0.32
              );
              const exitPoint = host.offsetAirShowPoint(
                exitFocus,
                -corridor.normal.x * lateralOffsetPx * 0.58 + corridor.axis.x * 118,
                -corridor.normal.y * lateralOffsetPx * 0.58 + corridor.axis.y * 118
              );
              const points = dedupePath([start, entryPoint, interceptPoint, crossingPoint, exitPoint]);
              const interceptPointIndex = points.findIndex((point) => point === interceptPoint);
              const crossingPointIndex = points.findIndex((point) => point === crossingPoint);
              const interceptDistancePx = measurePathLength(
                points.slice(0, interceptPointIndex >= 0 ? interceptPointIndex + 1 : 3)
              );
              const crossingDistancePx = measurePathLength(
                points.slice(0, crossingPointIndex >= 0 ? crossingPointIndex + 1 : 4)
              );
              return {
                ...assignment,
                points,
                progressTimeline: [
                  { timeMs: 0, progress: 0 },
                  { timeMs: Math.round(durationMs * 0.48), progress: pathProgressAtDistance(points, interceptDistancePx) },
                  { timeMs: Math.round(durationMs * 0.64), progress: pathProgressAtDistance(points, crossingDistancePx) },
                  { timeMs: durationMs, progress: 1 }
                ]
              };
            })
          : finalSpeedAdjustedAssignments;
      const fighterClashTravelCappedAssignments =
        label === "escort-clash-merge" || label === "escort-clash-scramble"
          ? phasePatternAlignedAssignments.map((assignment) => {
              if (
                assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort"
              ) {
                return assignment;
              }
                const maxFighterClashTravelPx =
                  label === "escort-clash-merge"
                    ? 540
                    : 620;
              const travelPx = measurePathLength(assignment.points);
              if (travelPx <= maxFighterClashTravelPx + 1) {
                return assignment;
              }
              return {
                ...assignment,
                points: slicePathByDistanceRange(assignment.points, 0, maxFighterClashTravelPx)
              };
            })
          : phasePatternAlignedAssignments;
      const bomberDefenseSpeedCappedAssignments =
        label === "bomber-defense-pass"
          ? fighterClashTravelCappedAssignments.map((assignment) => {
              if (
                assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort"
              ) {
                return assignment;
              }
              const roleTravelCapMultiplier =
                assignment.actor.role === "interceptor" ? 1.31 : 0.54;
              const maxFighterCombatTravelPx = Math.max(
                assignment.actor.role === "interceptor" ? 24 : 18,
                durationMs * host.airShowFighterSpeedPxPerMs * roleTravelCapMultiplier
              );
              const travelPx = measurePathLength(assignment.points);
              if (travelPx <= maxFighterCombatTravelPx + 1) {
                return assignment;
              }
              return {
                ...assignment,
                points: slicePathByDistanceRange(assignment.points, 0, maxFighterCombatTravelPx)
              };
            })
          : fighterClashTravelCappedAssignments;
      const bomberDefenseSpeedFlooredAssignments =
        label === "bomber-defense-pass"
          ? bomberDefenseSpeedCappedAssignments.map((assignment) => {
              if (
                assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort"
              ) {
                return assignment;
              }
              const roleTravelFloorMultiplier =
                assignment.actor.role === "interceptor" ? 0.54 : 0.2;
              const minimumFighterCombatTravelPx = Math.max(
                assignment.actor.role === "interceptor" ? 28 : 18,
                durationMs * host.airShowFighterSpeedPxPerMs * roleTravelFloorMultiplier
              );
              const currentTravelPx = measurePathLength(assignment.points);
              if (currentTravelPx >= minimumFighterCombatTravelPx - 1) {
                return assignment;
              }
              const points = [...assignment.points];
              const start = points[0] ?? assignment.actor.position;
              const end = points[points.length - 1] ?? start;
              const previous = points[points.length - 2] ?? start;
              const extensionDirection = normalizeVector(
                end.cx - previous.cx,
                end.cy - previous.cy,
                corridor.axis.x,
                corridor.axis.y
              );
              const sideSign = assignment.actor.role === "interceptor" ? -1 : 1;
              const formationBias = assignment.actor.formationIndex - 1.5;
              const lateralDriftPx = sideSign * (
                assignment.actor.role === "interceptor"
                  ? (20 + Math.abs(formationBias) * 5)
                  : (8 + Math.abs(formationBias) * 2)
              );
              const lateralDriftScale = assignment.actor.role === "interceptor" ? 1 : 0.26;
              const extensionPx = minimumFighterCombatTravelPx - currentTravelPx;
              const carryPoint = host.offsetAirShowPoint(
                end,
                extensionDirection.x * Math.min(68, extensionPx * 0.4)
                  + corridor.normal.x * lateralDriftPx * lateralDriftScale * 0.42,
                extensionDirection.y * Math.min(68, extensionPx * 0.4)
                  + corridor.normal.y * lateralDriftPx * lateralDriftScale * 0.42
              );
              const extensionPoint = host.offsetAirShowPoint(
                end,
                extensionDirection.x * extensionPx + corridor.normal.x * lateralDriftPx * lateralDriftScale,
                extensionDirection.y * extensionPx + corridor.normal.y * lateralDriftPx * lateralDriftScale
              );
              return {
                ...assignment,
                points: dedupePath([...points, carryPoint, extensionPoint])
              };
            })
          : bomberDefenseSpeedCappedAssignments;
      const endpointAlignedAssignments =
        label === "fighter-ingress"
          ? bomberDefenseSpeedFlooredAssignments.map((assignment) =>
              rebuildFighterIngressPathToMergeEndpoint(assignment, durationMs)
            )
          : bomberDefenseSpeedFlooredAssignments;
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
            if (label === "fighter-ingress") {
              const maxBomberTravelPx = Math.max(24, durationMs * host.airShowBomberSpeedPxPerMs);
              const pathLengthPx = measurePathLength(points);
              if (pathLengthPx > maxBomberTravelPx + 1) {
                points = slicePathByDistanceRange(points, 0, maxBomberTravelPx);
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
                  ? 0.1
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
      const bomberIngressSpeedRestoredAssignments =
        label === "bomber-ingress"
          ? (() => {
              const bomberAssignments = bomberBackTimedAssignments.filter(
                (assignment) => assignment.actor.role === "bomber"
              );
              if (bomberAssignments.length <= 0) {
                return bomberBackTimedAssignments;
              }
              const extendedBomberAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
                bomberAssignments,
                durationMs,
                roleSpeeds,
                {
                  clampCenter: corridor.strike,
                  orbitSignByRole: { bomber: 1 },
                  extendAtByRole: { bomber: "end" },
                  extensionMode: "carry",
                  extensionModeByRole: { bomber: "carry" },
                  maxHorizontalPx: 520,
                  maxVerticalPx: 360
                }
              );
              const extendedBomberAssignmentsByActorId = new Map(
                extendedBomberAssignments.map((assignment) => [assignment.actor.id, assignment] as const)
              );
              return bomberBackTimedAssignments.map(
                (assignment) => extendedBomberAssignmentsByActorId.get(assignment.actor.id) ?? assignment
              );
            })()
          : bomberBackTimedAssignments;
      const dogfightBomberSpeedRestoredAssignments =
        label === "escort-clash-merge" || label === "escort-clash-scramble"
          ? (() => {
              const bomberAssignments = bomberIngressSpeedRestoredAssignments.filter(
                (assignment) => assignment.actor.role === "bomber"
              );
              if (bomberAssignments.length <= 0) {
                return bomberIngressSpeedRestoredAssignments;
              }
              const extendedBomberAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
                bomberAssignments,
                durationMs,
                roleSpeeds,
                {
                  clampCenter: corridor.strike,
                  orbitSignByRole: { bomber: 1 },
                  extendAtByRole: { bomber: "end" },
                  extensionMode: "carry",
                  extensionModeByRole: { bomber: "carry" },
                  maxHorizontalPx: 520,
                  maxVerticalPx: 360
                }
              );
              const extendedBomberAssignmentsByActorId = new Map(
                extendedBomberAssignments.map((assignment) => [assignment.actor.id, assignment] as const)
              );
              return bomberIngressSpeedRestoredAssignments.map(
                (assignment) => extendedBomberAssignmentsByActorId.get(assignment.actor.id) ?? assignment
              );
            })()
          : bomberIngressSpeedRestoredAssignments;
      const dogfightBomberMovementGuardedAssignments =
        label === "escort-clash-merge" || label === "escort-clash-scramble"
          ? dogfightBomberSpeedRestoredAssignments.map((assignment) => {
              if (assignment.actor.role !== "bomber" || assignment.points.length < 2) {
                return assignment;
              }
              const currentTravelPx = measurePathLength(assignment.points);
              const movementFloorRatio =
                label === "escort-clash-merge"
                  ? 1.18
                  : 1.04;
              const minimumTravelPx = Math.max(
                24,
                durationMs * host.airShowBomberSpeedPxPerMs * movementFloorRatio
              );
              if (currentTravelPx >= minimumTravelPx - 1) {
                return assignment;
              }
              const start = assignment.points[0];
              const end = assignment.points[assignment.points.length - 1];
              if (!start || !end) {
                return assignment;
              }
              const forward = normalizeVector(
                end.cx - start.cx,
                end.cy - start.cy,
                corridor.axis.x,
                corridor.axis.y
              );
              const extensionPx = minimumTravelPx - currentTravelPx;
              return {
                ...assignment,
                points: dedupePath([
                  ...assignment.points.slice(0, -1),
                  {
                    cx: end.cx + forward.x * extensionPx,
                    cy: end.cy + forward.y * extensionPx
                  }
                ])
              };
            })
          : dogfightBomberSpeedRestoredAssignments;
      const bomberDefenseSpeedRestoredAssignments =
        label === "bomber-defense-pass"
          ? (() => {
              const bomberAssignments = dogfightBomberMovementGuardedAssignments.filter(
                (assignment) => assignment.actor.role === "bomber"
              );
              if (bomberAssignments.length <= 0) {
                return dogfightBomberMovementGuardedAssignments;
              }
              const extendedBomberAssignments = host.extendAirShowPhaseAssignmentsForSpeed(
                bomberAssignments,
                durationMs,
                roleSpeeds,
                {
                  clampCenter: corridor.strike,
                  orbitSignByRole: { bomber: 1 },
                  extendAtByRole: { bomber: "end" },
                  extensionMode: "carry",
                  extensionModeByRole: { bomber: "carry" },
                  maxHorizontalPx: 560,
                  maxVerticalPx: 380
                }
              );
              const extendedBomberAssignmentsByActorId = new Map(
                extendedBomberAssignments.map((assignment) => [assignment.actor.id, assignment] as const)
              );
              return dogfightBomberMovementGuardedAssignments.map(
                (assignment) => extendedBomberAssignmentsByActorId.get(assignment.actor.id) ?? assignment
              );
            })()
          : dogfightBomberMovementGuardedAssignments;
      return separatePhaseEndAssignments(
        bomberDefenseSpeedRestoredAssignments,
        label === "bomber-defense-pass" ? 28 : 16
      );
    };

    const hasInterceptors = interceptorFlights.length > 0;
    const hasEscorts = escortFlights.length > 0;
    const hasBombers = bomberFlights.length > 0;
    const hasAnyFighters = hasInterceptors || hasEscorts;
    const hasFighterOpposition = hasInterceptors && hasEscorts;

    if (hasAnyFighters) {
      recordCorridorPhase("fighter-ingress", buildFighterPhaseAssignments("fighter-ingress"));
    }
    if (hasFighterOpposition) {
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
    if (hasBombers) {
      recordCorridorPhase("bomber-ingress", hasAnyFighters ? buildFighterPhaseAssignments("bomber-ingress") : []);
    }

    if (hasBombers && hasInterceptors) {
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
            maxAlignmentDeg: 58,
            maxRangePx: 340,
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
            maxAlignmentDeg: 96,
            maxRangePx: 208,
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
    }

    const homeSideMidX =
      hqMidX
      ?? (visibleBounds ? (visibleBounds.minX + visibleBounds.maxX) / 2 : corridor.center.cx);
    const homeSideVisibleWidthPx = visibleBounds
      ? Math.max(1, visibleBounds.maxX - visibleBounds.minX)
      : Math.max(960, Math.abs(corridor.exit.cx - corridor.entry.cx) + 520);
    const resolveFighterHomeSideX = (
      sideSignInput: number,
      distancePx: number,
      laneOffsetPx = 0,
      clampToVisible = true
    ): number => {
      const sideSign = sideSignInput < 0 ? -1 : 1;
      const rawX = homeSideMidX + sideSign * distancePx + sideSign * laneOffsetPx;
      if (!visibleBounds || !clampToVisible) {
        return rawX;
      }
      return host.clamp(rawX, visibleBounds.minX + 54, visibleBounds.maxX - 54);
    };
    const buildHomeSideTargetRunFighterPath = (
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
      const laneOffsetPx = (assignment.actor.formationIndex - 0.5) * 22;
      const startRenderedX = start.cx + renderedOffsetPx;
      const sideSign = startRenderedX >= center.cx ? 1 : -1;
      const clampHomeX = (x: number): number =>
        visibleBounds ? host.clamp(x, visibleBounds.minX + 54, visibleBounds.maxX - 54) : x;
      const fallbackForward = resolveHeadingVector(assignment.actor.headingDegrees, {
        x: rawEnd.cx - start.cx,
        y: rawEnd.cy - start.cy
      });
      const earlyOutwardOffsetPx = Math.max(180, Math.min(homeSideVisibleWidthPx * 0.16, 280));
      const farOutwardOffsetPx = Math.max(360, Math.min(homeSideVisibleWidthPx * 0.26, 460));
      const baseEarlyHomeX = clampHomeX(startRenderedX + sideSign * (earlyOutwardOffsetPx + laneOffsetPx));
      const baseFarHomeX = clampHomeX(startRenderedX + sideSign * (farOutwardOffsetPx + laneOffsetPx));
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
          { timeMs: Math.round(durationMs * 0.24), progress: 0.5 },
          { timeMs: Math.round(durationMs * 0.46), progress: 0.86 },
          { timeMs: durationMs, progress: 1 }
        ]
      };
    };

    const buildTargetRunFighterAssignments = (durationMs: number): AirShowPhaseAssignment[] =>
      [...activeFlights(interceptorFlights), ...activeFlights(escortFlights)].flatMap((flight, index, flights) => {
        const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const homeSideSign = current.cx >= center.cx ? 1 : -1;
        const awayFromStrike = {
          x: corridor.normal.x * homeSideSign,
          y: corridor.normal.y * homeSideSign
        };
        const peelDistancePx = Math.max(150, durationMs * host.airShowFighterSpeedPxPerMs * 0.92);
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
          homeSideSign,
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
    const rawTargetRunBomberAssignments = bomberPlans.flatMap((plan) =>
      buildAssignmentsForFlightPath(plan.flight, plan.targetRunPath, 0.24)
    );
    const rawTargetRunBomberAssignmentByActorId = new Map(
      rawTargetRunBomberAssignments.map((assignment) => [assignment.actor.id, assignment] as const)
    );
    const buildTargetRunPhaseAssignments = (durationMs: number): AirShowPhaseAssignment[] => {
      const rawTargetRunAssignments = [
        ...rawTargetRunBomberAssignments,
        ...buildTargetRunFighterAssignments(durationMs)
      ];
      const preparedTargetRunAssignments = host.prepareAirShowPhaseAssignments(
        rawTargetRunAssignments,
        durationMs,
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
      return host.extendAirShowPhaseAssignmentsForSpeed(
        preparedTargetRunAssignments,
        durationMs,
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
          return buildHomeSideTargetRunFighterPath(assignment, durationMs);
        }
        const rawAssignment = rawTargetRunBomberAssignmentByActorId.get(assignment.actor.id);
        if (!rawAssignment || rawAssignment.points.length <= 0) {
          return assignment;
        }
        const preparedStart = assignment.points[0] ?? rawAssignment.points[0]!;
        const rawStart = rawAssignment.points[0]!;
        const dx = preparedStart.cx - rawStart.cx;
        const dy = preparedStart.cy - rawStart.cy;
        const continuityShiftDistancePx = Math.hypot(dx, dy);
        const maxContinuityShiftPx = HEX_WIDTH * 2.6;
        const continuityShiftScale =
          continuityShiftDistancePx > maxContinuityShiftPx && continuityShiftDistancePx > 0.001
            ? maxContinuityShiftPx / continuityShiftDistancePx
            : 1;
        const continuityDx = dx * continuityShiftScale;
        const continuityDy = dy * continuityShiftScale;
        const shiftedPoints = rawAssignment.points.map((point) => ({
          cx: point.cx + continuityDx,
          cy: point.cy + continuityDy
        }));
        const continuityAnchoredPoints =
          shiftedPoints.length <= 0
            ? shiftedPoints
            : [
                { cx: preparedStart.cx, cy: preparedStart.cy },
                ...shiftedPoints.slice(1)
              ];
        const finalPoint = continuityAnchoredPoints[continuityAnchoredPoints.length - 1];
        const finalAlongFromStrikePx = finalPoint
          ? (finalPoint.cx - corridor.strike.cx) * corridor.axis.x
            + (finalPoint.cy - corridor.strike.cy) * corridor.axis.y
          : 0;
        const targetRunOvershootLimitPx = 112;
        const overshootTrimmedPoints =
          finalAlongFromStrikePx > targetRunOvershootLimitPx && continuityAnchoredPoints.length >= 2
            ? continuityAnchoredPoints.map((point, index, points) => {
                if (index === 0) {
                  return point;
                }
                const progress = index / Math.max(1, points.length - 1);
                const overshootPx = finalAlongFromStrikePx - targetRunOvershootLimitPx;
                return {
                  cx: point.cx - corridor.axis.x * overshootPx * progress,
                  cy: point.cy - corridor.axis.y * overshootPx * progress
                };
              })
            : continuityAnchoredPoints;
        const smoothedPoints = host.sanitizeAirShowEntryPath(overshootTrimmedPoints, {
          maxTurnDeg: 50,
          strongTurnDeg: 92,
          maxFirstSegmentPx: 88,
          maxSharpTurnDeg: 112,
          maxWaypointsToRemove: 2
        });
        return {
          ...assignment,
          points: smoothedPoints,
          progressTimeline: undefined
        };
      });
    };
    let targetRunDurationMs = seedTargetRunDurationMs;
    let targetRunAssignments = buildTargetRunPhaseAssignments(targetRunDurationMs);
    const bomberTargetRunAssignments = targetRunAssignments.filter(
      (assignment) => assignment.actor.role === "bomber"
    );
    const bomberTargetRunPathLengthsPx = bomberTargetRunAssignments.map((assignment) =>
      measurePathLength(assignment.points)
    );
    const meanBomberTargetRunPathLengthPx =
      bomberTargetRunPathLengthsPx.length > 0
        ? bomberTargetRunPathLengthsPx.reduce((sum, pathLengthPx) => sum + pathLengthPx, 0)
          / bomberTargetRunPathLengthsPx.length
        : 0;
    const maxBomberTargetRunPathLengthPx =
      bomberTargetRunPathLengthsPx.length > 0
        ? Math.max(...bomberTargetRunPathLengthsPx)
        : 0;
    const meanBomberTargetRunDurationMs =
      meanBomberTargetRunPathLengthPx > 0
        ? meanBomberTargetRunPathLengthPx / governedBomberSpeedPxPerMs
        : targetRunDurationMs;
    const maxBomberTargetRunDurationMs =
      maxBomberTargetRunPathLengthPx > 0
        ? maxBomberTargetRunPathLengthPx / governedBomberSpeedPxPerMs
        : targetRunDurationMs;
    // Keep strike-group speed in policy band by solving from mean bomber path length,
    // while blending a smaller share of the longest path to avoid outlier spikes.
    const governedTargetRunDurationMs = host.clamp(
      Math.round(
        meanBomberTargetRunDurationMs
        + (maxBomberTargetRunDurationMs - meanBomberTargetRunDurationMs) * 0.08
      ),
      1,
      60000
    );
    if (Math.abs(governedTargetRunDurationMs - targetRunDurationMs) > 1) {
      targetRunDurationMs = governedTargetRunDurationMs;
      targetRunAssignments = buildTargetRunPhaseAssignments(targetRunDurationMs);
    }
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
        const renderedStartX = start.cx + renderedOffsetPx;
        const sideSign = renderedStartX >= homeSideMidX ? 1 : -1;
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
        const sideGuardX = resolveFighterHomeSideX(
          sideSign,
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
        const carryPoint = host.offsetAirShowPoint(
          start,
          entryForward.x * 72,
          entryForward.y * 72
        );
        const sideLead = {
          cx: committedStartSideX - renderedOffsetPx,
          cy: start.cy + egressDy * 0.24 + entryForward.y * 42
        };
        const exitMid = {
          cx: committedStartSideX * 0.36 + offMapExitX * 0.64 - renderedOffsetPx,
          cy: start.cy + egressDy * 0.58
        };
        const exitPoint = {
          cx: offMapExitX - renderedOffsetPx,
          cy: rawEnd.cy
        };
        const rebuiltPoints = dedupePath([
          start,
          carryPoint,
          entryLead,
          sideLead,
          exitMid,
          exitPoint
        ]);
        return {
          ...assignment,
          points: host.sanitizeAirShowEntryPath(
            rebuiltPoints,
            {
              maxTurnDeg: 50,
              strongTurnDeg: 86,
              maxFirstSegmentPx: 94,
              maxSharpTurnDeg: 104,
              maxWaypointsToRemove: 2
            }
          ),
          progressTimeline: [
            { timeMs: 0, progress: 0 },
            { timeMs: Math.round(durationMs * 0.22), progress: 0.44 },
            { timeMs: Math.round(durationMs * 0.48), progress: 0.84 },
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

  // Single-orchestrator policy: corridor choreography is the only planner path.
  // No fallback planner path is retained below this return.
  return buildCorridorContestedAirShowPlan();

}
