import type { AirEngagementEvent, TurnFaction } from "../../game/GameEngine";
import type {
  ResolvedAirShowFlakBurst,
  ResolvedAirShowScene
} from "./AirShowPlaybackScene";
import {
  buildResolvedAirCombatSceneTimingPolicy,
  type ResolvedAirCombatSceneTimingOverrides
} from "./AirShowTimingPolicies";

export interface LinkedEscortFlightContext {
  readonly unitKey: string;
  readonly originKey: string;
  readonly unitType: string;
  readonly faction: TurnFaction;
  readonly strength?: number;
}

export interface ResolvedAirCombatSceneParticipantDiagnostic {
  readonly unitKey: string;
  readonly renderRole: "interceptor" | "escort" | "bomber";
  readonly combatRole: "cap" | "escort" | "strike";
  readonly source: "event" | "event+linked-origin";
  readonly originHexKey?: string | null;
}

export interface ResolvedAirCombatSceneDiagnostic {
  readonly eventType: "airToAir" | "capClash";
  readonly bomberIncluded: boolean;
  readonly bomberSuppressedReason?: "capClash" | "disabled";
  readonly participants: ReadonlyArray<ResolvedAirCombatSceneParticipantDiagnostic>;
  readonly linkedEscortUnitKeys: ReadonlyArray<string>;
  readonly eventEscortUnitKeys: ReadonlyArray<string>;
  readonly linkedEscortMissingFromEventUnitKeys: ReadonlyArray<string>;
  readonly oppositionCapFlightUnitKeys: ReadonlyArray<string>;
  readonly unresolvedOriginUnitKeys: ReadonlyArray<string>;
}

export interface BuildResolvedAirCombatSceneOptions {
  readonly locKey: string;
  readonly resolveOriginKey: (unitKey: string, faction: TurnFaction) => string | null;
  readonly resolveStrength: (unitKey: string, faction: TurnFaction) => number;
  readonly fallbackLaneOffsetPx?: number;
  readonly interceptorLaneOffsets?: readonly number[];
  readonly escortLaneOffsets?: readonly number[];
  readonly bomberLaneOffsetPx?: number;
  readonly linkedEscortFlights?: readonly LinkedEscortFlightContext[];
  readonly bomberOriginKey?: string | null;
  readonly bomberTargetKey?: string | null;
  readonly flakEvent?: AirEngagementEvent | null;
  readonly includeBomber?: boolean;
  readonly phaseTimings?: ResolvedAirCombatSceneTimingOverrides;
  readonly playerHqKey?: string | null;
  readonly botHqKey?: string | null;
}

export interface BuildResolvedAirCombatSceneResult {
  readonly scene: ResolvedAirShowScene;
  readonly diagnostics: ResolvedAirCombatSceneDiagnostic;
}

export interface BuildResolvedAirShowFlakBurstOptions {
  readonly bomberUnitKey?: string | null;
  readonly targetHexKey?: string | null;
}

export function buildResolvedAirShowFlakBursts(
  flakEvent: AirEngagementEvent | null | undefined,
  options: BuildResolvedAirShowFlakBurstOptions = {}
): ReadonlyArray<ResolvedAirShowFlakBurst> {
  if (!flakEvent) {
    return [];
  }

  const engagementCount =
    Array.isArray(flakEvent.flakEngagements) && flakEvent.flakEngagements.length > 0
      ? flakEvent.flakEngagements.length
      : Math.max(0, flakEvent.interceptors.length);
  const normalizedEngagementCount = Math.max(1, engagementCount);
  const waveCount = Math.max(8, Math.min(12, normalizedEngagementCount * 2 + 5));
  return Array.from({ length: waveCount }, (_, index) => ({
    // Keep flak in the late approach window, but shape it as clustered airbursts
    // around the bomber track instead of a corridor-wide sweep across the target.
    progress: Math.min(0.82, 0.6 + index * 0.018),
    count: normalizedEngagementCount,
    scale: 0.66 + index * 0.022,
    alongOffsetPx: -8 + Math.sin((index / Math.max(1, waveCount - 1)) * Math.PI * 1.35) * 6,
    lateralOffsetPx: Math.sin(index * 1.17) * Math.min(26, 10 + normalizedEngagementCount * 4),
    alongSpreadPx: 40 + normalizedEngagementCount * 8,
    lateralSpreadPx: 58 + normalizedEngagementCount * 12,
    puffCount: 7 + normalizedEngagementCount * 2,
    smokePuffCount: 9 + normalizedEngagementCount * 2,
    smokeScale: 1.08 + index * 0.022,
    bomberUnitKey: options.bomberUnitKey ?? null,
    targetHexKey: options.targetHexKey ?? null
  }));
}

export function buildResolvedAirCombatScene(
  event: AirEngagementEvent,
  options: BuildResolvedAirCombatSceneOptions
): BuildResolvedAirCombatSceneResult {
  const sceneKind = event.type === "capClash" ? "capClash" : "airToAir";
  const linkedEscortFlights = options.linkedEscortFlights ?? [];
  const linkedEscortByUnitKey = new Map(linkedEscortFlights.map((flight) => [flight.unitKey, flight] as const));
  const unresolvedOriginUnitKeys: string[] = [];
  const participants: ResolvedAirCombatSceneParticipantDiagnostic[] = [];

  const resolveParticipantOrigin = (
    unitKey: string,
    faction: TurnFaction,
    linkedOriginKey?: string | null
  ): { originHexKey: string | null; source: "event" | "event+linked-origin" } => {
    if (linkedOriginKey) {
      return { originHexKey: linkedOriginKey, source: "event+linked-origin" };
    }
    const originHexKey = options.resolveOriginKey(unitKey, faction);
    if (!originHexKey) {
      unresolvedOriginUnitKeys.push(unitKey);
    }
    return { originHexKey, source: "event" };
  };

  const interceptors = event.interceptors.map((interceptor, index) => {
    const { originHexKey, source } = resolveParticipantOrigin(interceptor.unitKey, interceptor.faction);
    participants.push({
      unitKey: interceptor.unitKey,
      renderRole: "interceptor",
      combatRole: "cap",
      source,
      originHexKey
    });
    return {
      id: interceptor.unitKey,
      scenarioType: interceptor.unitType,
      faction: interceptor.faction,
      originHexKey,
      strengthBefore: interceptor.strength ?? options.resolveStrength(interceptor.unitKey, interceptor.faction),
      strengthAfterEscortPhase:
        event.interceptorStrengthsAfterEscortPhase?.[index]
        ?? interceptor.strength
        ?? options.resolveStrength(interceptor.unitKey, interceptor.faction),
      finalStrength:
        event.interceptorFinalStrengths?.[index]
        ?? interceptor.strength
        ?? options.resolveStrength(interceptor.unitKey, interceptor.faction),
      laneOffsetPx: options.interceptorLaneOffsets?.[index] ?? options.fallbackLaneOffsetPx ?? 0,
      role: "interceptor" as const,
      combatRole: "cap" as const
    };
  });

  const escorts = event.escorts.map((escort, index) => {
    const linkedEscort = linkedEscortByUnitKey.get(escort.unitKey) ?? null;
    const combatRole: "cap" | "escort" = event.type === "capClash" ? "cap" : "escort";
    const { originHexKey, source } = resolveParticipantOrigin(
      escort.unitKey,
      escort.faction,
      linkedEscort?.originKey ?? null
    );
    participants.push({
      unitKey: escort.unitKey,
      renderRole: "escort",
      combatRole,
      source,
      originHexKey
    });
    const fallbackStrength =
      escort.strength
      ?? linkedEscort?.strength
      ?? options.resolveStrength(escort.unitKey, escort.faction);
    return {
      id: escort.unitKey,
      scenarioType: escort.unitType,
      faction: escort.faction,
      originHexKey,
      strengthBefore: fallbackStrength,
      strengthAfterEscortPhase: event.escortStrengthsAfterEscortPhase?.[index] ?? fallbackStrength,
      finalStrength: event.escortFinalStrengths?.[index] ?? fallbackStrength,
      laneOffsetPx: options.escortLaneOffsets?.[index] ?? -(options.fallbackLaneOffsetPx ?? 0),
      role: "escort" as const,
      combatRole
    };
  });

  const includeBomber = options.includeBomber ?? event.type !== "capClash";
  const bomber =
    includeBomber
      ? (() => {
          const { originHexKey, source } = resolveParticipantOrigin(
            event.bomber.unitKey,
            event.bomber.faction,
            options.bomberOriginKey ?? null
          );
          participants.push({
            unitKey: event.bomber.unitKey,
            renderRole: "bomber",
            combatRole: "strike",
            source,
            originHexKey
          });
          const fallbackStrength =
            event.bomberStrengthBefore
            ?? event.bomber.strength
            ?? options.resolveStrength(event.bomber.unitKey, event.bomber.faction);
          return {
            id: event.bomber.unitKey,
            scenarioType: event.bomber.unitType,
            faction: event.bomber.faction,
            originHexKey,
            strengthBefore: fallbackStrength,
            strengthAfterEscortPhase: event.bomberStrengthAfter ?? fallbackStrength,
            finalStrength: Math.max(
              0,
              Math.min(
                event.bomberStrengthAfter ?? fallbackStrength,
                options.flakEvent?.bomberStrengthAfter ?? event.bomberStrengthAfter ?? fallbackStrength
              )
            ),
            laneOffsetPx: options.bomberLaneOffsetPx ?? options.fallbackLaneOffsetPx ?? 0,
            role: "bomber" as const,
            combatRole: "strike" as const
          };
        })()
      : null;
  const resolvedBombers = bomber ? [bomber] : [];

  const eventEscortUnitKeys = event.escorts.map((escort) => escort.unitKey);
  const linkedEscortUnitKeys = linkedEscortFlights.map((flight) => flight.unitKey);
  const linkedEscortMissingFromEventUnitKeys = linkedEscortUnitKeys.filter(
    (unitKey) => !eventEscortUnitKeys.includes(unitKey)
  );

  const phaseTimings = {
    ...buildResolvedAirCombatSceneTimingPolicy(),
    ...(options.phaseTimings ?? {})
  };

  return {
    scene: {
      kind: sceneKind,
      hexKey: options.locKey,
      interceptors,
      escorts,
      bombers: resolvedBombers,
      bomber: resolvedBombers[0] ?? null,
      escortExchanges: event.escortExchanges ?? [],
      bomberPassExchanges: includeBomber ? (event.bomberPassExchanges ?? []) : [],
      bomberTargetHexKey: options.bomberTargetKey,
      fighterIngressDurationMs: phaseTimings.fighterIngressDurationMs,
      escortClashDurationMs: phaseTimings.escortClashDurationMs,
      bomberIngressDurationMs: phaseTimings.bomberIngressDurationMs,
      bomberPassDurationMs: phaseTimings.bomberPassDurationMs,
      strikeRunDurationMs: phaseTimings.strikeRunDurationMs,
      egressDurationMs: phaseTimings.egressDurationMs,
      bomberArrivalDelayMs: phaseTimings.bomberArrivalDelayMs,
      bombReleaseProgress: phaseTimings.bombReleaseProgress,
      playerHqKey: options.playerHqKey ?? null,
      botHqKey: options.botHqKey ?? null,
      flakBursts:
        includeBomber
          ? buildResolvedAirShowFlakBursts(options.flakEvent, {
              bomberUnitKey: resolvedBombers[0]?.id ?? event.bomber.unitKey,
              targetHexKey: options.bomberTargetKey ?? null
            })
          : []
    },
    diagnostics: {
      eventType: sceneKind,
      bomberIncluded: includeBomber,
      bomberSuppressedReason: includeBomber ? undefined : event.type === "capClash" ? "capClash" : "disabled",
      participants,
      linkedEscortUnitKeys,
      eventEscortUnitKeys,
      linkedEscortMissingFromEventUnitKeys,
      oppositionCapFlightUnitKeys: participants
        .filter((participant) => participant.renderRole === "escort" && participant.combatRole === "cap")
        .map((participant) => participant.unitKey),
      unresolvedOriginUnitKeys: Array.from(new Set(unresolvedOriginUnitKeys))
    }
  };
}
