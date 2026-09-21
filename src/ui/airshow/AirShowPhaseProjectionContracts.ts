import type {
  AirShowPoint,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowScene
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

export interface AirShowPhaseProjectionServices {
  resolveHexCenterByKey(hexKey: string | null | undefined): AirShowPoint | null;
  averageAirShowPoints(points: ReadonlyArray<AirShowPoint>): AirShowPoint | null;
  clamp(value: number, min: number, max: number): number;
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
}
