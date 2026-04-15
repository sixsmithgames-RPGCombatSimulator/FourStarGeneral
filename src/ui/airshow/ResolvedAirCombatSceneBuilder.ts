import type { AirEngagementEvent, TurnFaction } from "../../game/GameEngine";
import type {
  ResolvedAirShowFlakBurst,
  ResolvedAirShowScene
} from "../../rendering/HexMapRenderer";

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
  const waveCount = Math.max(18, Math.min(26, engagementCount * 3 + 14));
  return Array.from({ length: waveCount }, (_, index) => ({
    // Flak should open late in the strike run, once the bombers are committed to
    // the target lane but before release, so the barrage reads as "target defense"
    // rather than a mid-map fireworks belt.
    progress: Math.min(0.9, 0.66 + index * 0.013),
    count: engagementCount,
    scale: 0.34 + index * 0.01,
    alongOffsetPx: -14 + Math.sin((index / Math.max(1, waveCount - 1)) * Math.PI) * 10,
    lateralOffsetPx: (index - (waveCount - 1) / 2) * Math.min(22, 14 + engagementCount * 3),
    alongSpreadPx: 54 + engagementCount * 12,
    lateralSpreadPx: 84 + engagementCount * 14,
    puffCount: 18 + engagementCount * 8,
    smokePuffCount: 24 + engagementCount * 10,
    smokeScale: 1.36 + index * 0.028,
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

  // Per North Star Spec §Speed Principles: fighter speed = V, bomber speed = V/2.
  // Derive ingress durations from hex distance so the scene is self-contained for
  // progress-based choreography without requiring BattleScreen runtime values.
  const parseHexKey = (key: string): { q: number; r: number } | null => {
    const parts = key.split(",");
    if (parts.length !== 2) return null;
    const q = parseInt(parts[0] ?? "", 10);
    const r = parseInt(parts[1] ?? "", 10);
    return isNaN(q) || isNaN(r) ? null : { q, r };
  };
  const hexDistance = (a: { q: number; r: number }, b: { q: number; r: number }): number => {
    const dq = b.q - a.q;
    const dr = b.r - a.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  };
  const locCoord = parseHexKey(options.locKey);
  const HEX_WIDTH_PX = Math.sqrt(3) * 48;
  const BASE_FIGHTER_PX_PER_MS = 0.12; // fighter pixel speed
  const MINIMUM_FIGHTER_INGRESS_MS = 1250;
  const MINIMUM_BOMBER_INGRESS_MS = 3000;

  // Fighter ingress: use nearest interceptor or escort origin distance to location hex.
  const fighterOriginKeys = [
    ...event.interceptors.map((i) => options.resolveOriginKey(i.unitKey, i.faction)),
    ...event.escorts.map((e) => options.resolveOriginKey(e.unitKey, e.faction))
  ].filter((k): k is string => !!k);
  const fighterDistances = locCoord
    ? fighterOriginKeys
        .map(parseHexKey)
        .filter((c): c is { q: number; r: number } => !!c)
        .map((c) => hexDistance(c, locCoord) * HEX_WIDTH_PX)
    : [];
  const fighterDistancePx = fighterDistances.length > 0
    ? Math.min(...fighterDistances)
    : 8 * HEX_WIDTH_PX;
  const fighterIngressDurationMs = Math.max(
    MINIMUM_FIGHTER_INGRESS_MS,
    Math.round(fighterDistancePx / BASE_FIGHTER_PX_PER_MS)
  );

  // Bomber ingress: per spec §Speed Principles bomber travels at V/2, so duration = 2× fighter.
  // Also factor in bomber's own hex distance vs fighter distance, but cap the ratio at 2.5
  // so the combined ingress phase remains visually coherent.
  const bomberOriginHex = options.bomberOriginKey ?? (includeBomber
    ? options.resolveOriginKey(event.bomber.unitKey, event.bomber.faction)
    : null);
  const bomberDistancePx = locCoord && bomberOriginHex
    ? (() => {
        const c = parseHexKey(bomberOriginHex);
        return c ? hexDistance(c, locCoord) * HEX_WIDTH_PX : fighterDistancePx;
      })()
    : fighterDistancePx;
  // Speed ratio: bomber at V/2 needs 2× the time a fighter would need for the same distance.
  // Use the longer of (bomber distance at V/2) vs (2 × fighter duration), capped at 2.5× fighter.
  const bomberDistanceDurationMs = Math.round((bomberDistancePx / BASE_FIGHTER_PX_PER_MS) * 2);
  const bomberIngressDurationMs = Math.max(
    MINIMUM_BOMBER_INGRESS_MS,
    Math.min(
      Math.round(fighterIngressDurationMs * 2.5),
      Math.max(bomberDistanceDurationMs, fighterIngressDurationMs * 2)
    )
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
      fighterIngressDurationMs,
      bomberIngressDurationMs,
      flakBursts:
        includeBomber
          ? buildResolvedAirShowFlakBursts(options.flakEvent, {
              bomberUnitKey: event.bomber.unitKey,
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
