export type SpriteRenderFaction = "Player" | "Bot" | "Ally";

export type AirShowPoint = {
  cx: number;
  cy: number;
};

export type AirShowCombatRole = "cap" | "escort" | "strike";
export type AirShowFlightRole = "interceptor" | "escort" | "bomber";

export type ResolvedAirShowFlightSpec = {
  id: string;
  scenarioType: string;
  faction?: SpriteRenderFaction;
  originHexKey?: string | null;
  strengthBefore: number;
  strengthAfterEscortPhase?: number;
  finalStrength?: number;
  laneOffsetPx?: number;
  role: AirShowFlightRole;
  combatRole?: AirShowCombatRole;
};

export type ResolvedAirShowStrikeFlightSpec = ResolvedAirShowFlightSpec & {
  targetHexKey?: string | null;
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

export type ResolvedAirShowFlakBurst = {
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
  bomberUnitKey?: string | null;
  targetHexKey?: string | null;
};

export type ResolvedAirShowScene = {
  kind?: "airToAir" | "capClash";
  hexKey: string;
  interceptors: ReadonlyArray<ResolvedAirShowFlightSpec>;
  escorts: ReadonlyArray<ResolvedAirShowFlightSpec>;
  // `bombers` is the authoritative contested-playback collection.
  bombers?: ReadonlyArray<ResolvedAirShowStrikeFlightSpec>;
  // `bomber` mirrors the first bomber for transitional consumers.
  bomber: ResolvedAirShowStrikeFlightSpec | null;
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
  flakBursts?: ReadonlyArray<ResolvedAirShowFlakBurst>;
  playerHqKey?: string | null;
  botHqKey?: string | null;
};

export function resolveResolvedAirShowBombers(
  scene: ResolvedAirShowScene
): ReadonlyArray<ResolvedAirShowStrikeFlightSpec> {
  if (Array.isArray(scene.bombers) && scene.bombers.length > 0) {
    return scene.bombers;
  }
  return scene.bomber ? [scene.bomber] : [];
}

export function resolvePrimaryResolvedAirShowBomber(
  scene: ResolvedAirShowScene
): ResolvedAirShowStrikeFlightSpec | null {
  return resolveResolvedAirShowBombers(scene)[0] ?? null;
}

export interface AirShowInspectionPoint {
  readonly cx: number;
  readonly cy: number;
}

export interface AirShowInspectionFlightActor {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: AirShowFlightRole;
  readonly active: boolean;
  readonly headingDegrees: number;
  readonly position: AirShowInspectionPoint;
}

export interface PlannedAirShowFlightActor extends AirShowInspectionFlightActor {
  readonly size: number;
  readonly formationIndex: number;
  readonly biasX: number;
  readonly biasY: number;
}

export interface AirShowInspectionFlight {
  readonly id: string;
  readonly role: AirShowFlightRole;
  readonly combatRole?: AirShowCombatRole;
  readonly faction?: SpriteRenderFaction;
  readonly scenarioType: string;
  readonly originHexKey?: string | null;
  readonly strengthBefore: number;
  readonly strengthAfterEscortPhase?: number;
  readonly finalStrength?: number;
  readonly laneOffsetPx?: number;
  readonly actors: ReadonlyArray<AirShowInspectionFlightActor>;
}

export interface PlannedAirShowFlight extends Omit<AirShowInspectionFlight, "actors"> {
  readonly actors: ReadonlyArray<PlannedAirShowFlightActor>;
}

export interface AirShowInspectionSampledPosition {
  readonly timeMs: number;
  readonly progress: number;
  readonly pathProgress?: number;
  readonly cx: number;
  readonly cy: number;
  readonly headingDegrees: number;
}

export interface AirShowInspectionAssignment {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: AirShowFlightRole;
  // Planner control waypoints. Use sampledPositions for rendered continuity or speed assertions.
  readonly points: ReadonlyArray<AirShowInspectionPoint>;
  // Canonical painted-position samples from the shared playback scene.
  readonly sampledPositions: ReadonlyArray<AirShowInspectionSampledPosition>;
}

export interface PlannedAirShowAssignmentProgressKeyframe {
  readonly timeMs: number;
  readonly progress: number;
}

export interface PlannedAirShowAssignment extends AirShowInspectionAssignment {
  readonly headingBlend?: number;
  readonly multiFlightOffsetPx?: number;
  readonly progressOffset?: number;
  readonly distanceBudgetPx?: number;
  readonly progressTimeline?: ReadonlyArray<PlannedAirShowAssignmentProgressKeyframe>;
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

export interface PlannedAirShowTracer extends AirShowInspectionTracer {
  readonly color?: string;
  readonly burstCount?: number;
  readonly spreadPx?: number;
}

export interface AirShowInspectionFlakBurst {
  readonly progress: number;
  readonly bomberUnitKey?: string | null;
  readonly targetHexKey?: string | null;
  readonly targetCenter: AirShowInspectionPoint;
  readonly targetSource: "targetHex" | "bomberTarget" | "averageBomberTarget" | "corridorStrike";
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
  readonly visibleActorIds: ReadonlyArray<string>;
  readonly assignments: ReadonlyArray<AirShowInspectionAssignment>;
  readonly tracers: ReadonlyArray<AirShowInspectionTracer>;
  readonly flakBursts: ReadonlyArray<AirShowInspectionFlakBurst>;
}

export interface PlannedAirShowPhase extends Omit<AirShowInspectionPhase, "assignments" | "tracers"> {
  readonly assignments: ReadonlyArray<PlannedAirShowAssignment>;
  readonly tracers: ReadonlyArray<PlannedAirShowTracer>;
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
  readonly hqMidX: number | null;
  readonly bomberTarget?: AirShowInspectionPoint | null;
  readonly originPlan: import("./AirShowPlanner").AirShowInspectionOriginPlan | null;
  readonly phaseTimingAudit: ReadonlyArray<import("./AirShowPlanner").AirShowInspectionPhaseTimingAudit>;
  readonly flights: ReadonlyArray<AirShowInspectionFlight>;
  readonly phases: ReadonlyArray<AirShowInspectionPhase>;
}

export interface PlannedAirShowScene extends Omit<AirShowInspectionReport, "flights" | "phases"> {
  readonly flights: ReadonlyArray<PlannedAirShowFlight>;
  readonly phases: ReadonlyArray<PlannedAirShowPhase>;
}
