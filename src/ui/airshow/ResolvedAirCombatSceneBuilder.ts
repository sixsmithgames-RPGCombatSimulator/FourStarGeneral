import type { AirEngagementEvent, TurnFaction } from "../../game/GameEngine";
import type { ResolvedAirShowScene } from "../../rendering/HexMapRenderer";

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
}

export interface BuildResolvedAirCombatSceneResult {
  readonly scene: ResolvedAirShowScene;
  readonly diagnostics: ResolvedAirCombatSceneDiagnostic;
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
            finalStrength: event.bomberStrengthAfter ?? fallbackStrength,
            laneOffsetPx: options.bomberLaneOffsetPx ?? options.fallbackLaneOffsetPx ?? 0,
            role: "bomber" as const,
            combatRole: "strike" as const
          };
        })()
      : null;

  const eventEscortUnitKeys = event.escorts.map((escort) => escort.unitKey);
  const linkedEscortUnitKeys = linkedEscortFlights.map((flight) => flight.unitKey);
  const linkedEscortMissingFromEventUnitKeys = linkedEscortUnitKeys.filter(
    (unitKey) => !eventEscortUnitKeys.includes(unitKey)
  );

  return {
    scene: {
      kind: sceneKind,
      hexKey: options.locKey,
      interceptors,
      escorts,
      bomber,
      escortExchanges: event.escortExchanges ?? [],
      bomberPassExchanges: includeBomber ? (event.bomberPassExchanges ?? []) : [],
      bomberTargetHexKey: options.bomberTargetKey,
      flakBursts:
        options.flakEvent && includeBomber
          ? (() => {
              const engagementCount =
                Array.isArray(options.flakEvent.flakEngagements) && options.flakEvent.flakEngagements.length > 0
                  ? options.flakEvent.flakEngagements.length
                  : Math.max(0, options.flakEvent.interceptors.length);
              const waveCount = Math.max(3, Math.min(5, engagementCount + 2));
              return Array.from({ length: waveCount }, (_, index) => ({
                progress: 0.68 + index * 0.08,
                count: engagementCount,
                scale: 1.04 + index * 0.05,
                alongOffsetPx: -44 + index * 12,
                lateralOffsetPx: (index % 2 === 0 ? -1 : 1) * Math.min(16, engagementCount * 5),
                alongSpreadPx: 42 + engagementCount * 12,
                lateralSpreadPx: 88 + engagementCount * 16,
                puffCount: 12 + engagementCount * 8,
                smokePuffCount: 8 + engagementCount * 5,
                smokeScale: 0.88 + index * 0.04
              }));
            })()
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
