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
  bomber: ResolvedAirShowStrikeFlightSpec | null;
  bombers?: ReadonlyArray<ResolvedAirShowStrikeFlightSpec>;
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
  readonly points: ReadonlyArray<AirShowInspectionPoint>;
  readonly sampledPositions: ReadonlyArray<AirShowInspectionSampledPosition>;
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
  readonly assignments: ReadonlyArray<AirShowInspectionAssignment>;
  readonly tracers: ReadonlyArray<AirShowInspectionTracer>;
  readonly flakBursts: ReadonlyArray<AirShowInspectionFlakBurst>;
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

export type PlannedAirShowScene = AirShowInspectionReport;
