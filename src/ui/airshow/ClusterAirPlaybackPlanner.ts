import type { Axial } from "../../core/types";
import type { AirEngagementEvent, TurnFaction } from "../../game/GameEngine";
import type {
  ResolvedAirShowExchange,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowStrikeFlightSpec,
  ResolvedAirShowScene
} from "../../rendering/HexMapRenderer";
import { buildResolvedAirShowFlakBursts } from "./ResolvedAirCombatSceneBuilder";

export interface ClusterPlaybackFlight {
  readonly missionId: string;
  readonly faction: TurnFaction;
  readonly kind: string;
  readonly unitKey: string;
  readonly originKey: string;
  readonly destKey: string;
  readonly unitType: string;
  readonly strength?: number;
  readonly laneOffsetPx: number;
  readonly targetHex?: Axial;
  readonly targetUnitKey?: string;
  readonly escortTargetUnitKey?: string;
}

export interface ClusterLinkedStrikePlaybackOperation {
  readonly kind: "linkedStrike";
  readonly index: number;
  readonly focusHex: Axial | null;
  readonly focusKey: string | null;
  readonly flight: ClusterPlaybackFlight;
  readonly linkedEvents: readonly AirEngagementEvent[];
  readonly escorts: readonly ClusterPlaybackFlight[];
}

export interface ClusterStandaloneFlightPlaybackOperation {
  readonly kind: "flight";
  readonly index: number;
  readonly focusHex: Axial | null;
  readonly focusKey: string | null;
  readonly flight: ClusterPlaybackFlight;
}

export interface ClusterStandaloneEventPlaybackOperation {
  readonly kind: "event";
  readonly index: number;
  readonly focusHex: Axial;
  readonly focusKey: string;
  readonly event: AirEngagementEvent;
}

export type ClusterPlaybackOperation =
  | ClusterLinkedStrikePlaybackOperation
  | ClusterStandaloneFlightPlaybackOperation
  | ClusterStandaloneEventPlaybackOperation;

export interface CoordinatedAirClusterPlaybackPlan {
  readonly focusKey: string | null;
  readonly scene: ResolvedAirShowScene | null;
  readonly announcementEvents: readonly AirEngagementEvent[];
  readonly flakAnnouncementEvents: readonly AirEngagementEvent[];
  readonly strikeMissionIds: readonly string[];
  readonly residualOperations: readonly ClusterPlaybackOperation[];
  readonly bomberStartDelayMs: number;
  readonly fighterIngressLeadMs: number;
  readonly handledOperationIndices: readonly number[];
}

export interface BuildCoordinatedAirClusterPlaybackPlanOptions {
  readonly resolveOriginKey: (unitKey: string, faction: TurnFaction) => string | null;
  readonly resolveStrength: (unitKey: string, faction: TurnFaction) => number;
  readonly fighterIngressDurationMs: number;
  readonly escortClashDurationMs: number;
  readonly fighterEgressDurationMs: number;
  readonly bomberStartDelayMs?: number;
}

type MutableFlightSpec = {
  readonly id: string;
  readonly scenarioType: string;
  readonly faction: TurnFaction;
  originHexKey?: string | null;
  strengthBefore: number;
  strengthAfterEscortPhase: number;
  finalStrength: number;
  laneOffsetPx: number;
  readonly role: "interceptor" | "escort";
  readonly combatRole: "cap" | "escort";
};

function dedupeEvents(events: readonly AirEngagementEvent[]): AirEngagementEvent[] {
  return Array.from(new Set(events));
}

function getEventInterceptors(event: AirEngagementEvent): readonly AirEngagementEvent["interceptors"][number][] {
  return Array.isArray((event as { interceptors?: readonly AirEngagementEvent["interceptors"][number][] }).interceptors)
    ? ((event as { interceptors: readonly AirEngagementEvent["interceptors"][number][] }).interceptors)
    : [];
}

function getEventEscorts(event: AirEngagementEvent): readonly AirEngagementEvent["escorts"][number][] {
  return Array.isArray((event as { escorts?: readonly AirEngagementEvent["escorts"][number][] }).escorts)
    ? ((event as { escorts: readonly AirEngagementEvent["escorts"][number][] }).escorts)
    : [];
}

function updateStrengthFloor(current: number, candidate: number | null | undefined): number {
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return current;
  }
  return Math.min(current, candidate);
}

function buildExchangeKey(exchange: ResolvedAirShowExchange): string {
  return [
    exchange.attackerUnitKey,
    exchange.defenderUnitKey,
    exchange.damageToDefender ?? "",
    exchange.retaliationDamage ?? "",
    exchange.attackerStrengthAfter ?? "",
    exchange.defenderStrengthAfter ?? "",
    exchange.attackerDestroyed ? "1" : "0",
    exchange.defenderDestroyed ? "1" : "0"
  ].join("|");
}

function createMutableFlightSpec(
  unitKey: string,
  scenarioType: string,
  faction: TurnFaction,
  role: "interceptor" | "escort",
  combatRole: "cap" | "escort",
  originHexKey: string | null,
  strength: number,
  laneOffsetPx: number
): MutableFlightSpec {
  return {
    id: unitKey,
    scenarioType,
    faction,
    originHexKey,
    strengthBefore: strength,
    strengthAfterEscortPhase: strength,
    finalStrength: strength,
    laneOffsetPx,
    role,
    combatRole
  };
}

function toResolvedFlightSpec(spec: MutableFlightSpec): ResolvedAirShowFlightSpec {
  return {
    id: spec.id,
    scenarioType: spec.scenarioType,
    faction: spec.faction,
    originHexKey: spec.originHexKey ?? null,
    strengthBefore: spec.strengthBefore,
    strengthAfterEscortPhase: spec.strengthAfterEscortPhase,
    finalStrength: spec.finalStrength,
    laneOffsetPx: spec.laneOffsetPx,
    role: spec.role,
    combatRole: spec.combatRole
  };
}

function findMatchingEventForFlight(
  flight: ClusterPlaybackFlight,
  events: readonly AirEngagementEvent[],
  type: AirEngagementEvent["type"]
): AirEngagementEvent | null {
  return (
    events.find((event) => event.type === type && event.missionId === flight.missionId)
    ?? events.find((event) => event.type === type && event.bomber.unitKey === flight.unitKey)
    ?? null
  );
}

type CoordinatedStrikeSceneEntry = {
  readonly flight: ClusterPlaybackFlight;
  readonly airToAirEvent: AirEngagementEvent | null;
  readonly flakEvent: AirEngagementEvent | null;
  readonly destroyedBeforeTarget: boolean;
};

function toResolvedStrikeFlightSpec(
  entry: CoordinatedStrikeSceneEntry,
  options: BuildCoordinatedAirClusterPlaybackPlanOptions
): ResolvedAirShowStrikeFlightSpec {
  const { flight, airToAirEvent, flakEvent } = entry;
  const fallbackStrength =
    flight.strength ?? options.resolveStrength(flight.unitKey, flight.faction);
  const originHexKey = flight.originKey || options.resolveOriginKey(flight.unitKey, flight.faction);
  const targetHexKey =
    flight.destKey;
  const strengthAfterAirPhase =
    flakEvent?.bomberStrengthAfter
    ?? airToAirEvent?.bomberStrengthAfter
    ?? (entry.destroyedBeforeTarget ? 0 : fallbackStrength);
  return {
    id: flight.unitKey,
    scenarioType: flight.unitType,
    faction: flight.faction,
    originHexKey,
    strengthBefore:
      airToAirEvent?.bomberStrengthBefore
      ?? flakEvent?.bomberStrengthBefore
      ?? airToAirEvent?.bomber.strength
      ?? fallbackStrength,
    strengthAfterEscortPhase: strengthAfterAirPhase,
    finalStrength: strengthAfterAirPhase,
    laneOffsetPx: flight.laneOffsetPx,
    role: "bomber",
    combatRole: "strike",
    targetHexKey
  };
}

function resolveCoordinatedBomberStartDelayMs(
  fighterScenePresent: boolean,
  strikePlanCount: number,
  options: BuildCoordinatedAirClusterPlaybackPlanOptions
): { bomberStartDelayMs: number; fighterIngressLeadMs: number } {
  if (strikePlanCount <= 0) {
    return {
      bomberStartDelayMs: 0,
      fighterIngressLeadMs: 0
    };
  }

  const configuredLeadMs = Math.max(0, Math.round(options.bomberStartDelayMs ?? 0));
  if (!fighterScenePresent) {
    return {
      bomberStartDelayMs: configuredLeadMs,
      fighterIngressLeadMs: 0
    };
  }

  // Coordinated bomber arrivals need to trail not only fighter ingress, but enough of the
  // escort merge window that the package is still inbound while the dogfight establishes.
  // This keeps bombers from arriving on target while the CAP/escort fight is still making
  // its first merge pass.
  const fighterIngressLeadMs = Math.max(
    configuredLeadMs,
    Math.round(
      options.fighterIngressDurationMs +
      options.escortClashDurationMs * 0.42 +
      220
    )
  );

  return {
    bomberStartDelayMs: fighterIngressLeadMs,
    fighterIngressLeadMs
  };
}

export function buildCoordinatedAirClusterPlaybackPlan(
  cluster: readonly ClusterPlaybackOperation[],
  options: BuildCoordinatedAirClusterPlaybackPlanOptions
): CoordinatedAirClusterPlaybackPlan | null {
  if (cluster.length === 0) {
    return null;
  }

  const linkedStrikeOperations = cluster.filter(
    (operation): operation is ClusterLinkedStrikePlaybackOperation => operation.kind === "linkedStrike"
  );
  const standaloneStrikeOperations = cluster.filter(
    (operation): operation is ClusterStandaloneFlightPlaybackOperation =>
      operation.kind === "flight" && operation.flight.kind === "strike"
  );
  const standaloneEventOperations = cluster.filter(
    (operation): operation is ClusterStandaloneEventPlaybackOperation => operation.kind === "event"
  );

  const strikeOperationCount = linkedStrikeOperations.length + standaloneStrikeOperations.length;
  const candidateCombatEvents = dedupeEvents([
    ...linkedStrikeOperations.flatMap((operation) => operation.linkedEvents.filter((event) => event.type === "airToAir")),
    ...standaloneEventOperations
      .map((operation) => operation.event)
      .filter((event) => event.type === "airToAir" || event.type === "capClash")
  ]);

  const hasEscortFighterBattle = candidateCombatEvents.some(
    (event) => getEventInterceptors(event).length > 0 && getEventEscorts(event).length > 0
  );
  const shouldCoordinate =
    strikeOperationCount > 1
    || (strikeOperationCount > 0 && hasEscortFighterBattle)
    || candidateCombatEvents.length > 1;
  if (!shouldCoordinate) {
    return null;
  }

  const focusKey = cluster.find((operation) => operation.focusKey)?.focusKey ?? null;
  const allEvents = dedupeEvents([
    ...linkedStrikeOperations.flatMap((operation) => operation.linkedEvents),
    ...standaloneEventOperations.map((operation) => operation.event)
  ]);

  const flightsByUnitKey = new Map<string, ClusterPlaybackFlight>();
  cluster.forEach((operation) => {
    if (operation.kind === "linkedStrike") {
      flightsByUnitKey.set(operation.flight.unitKey, operation.flight);
      operation.escorts.forEach((escort) => flightsByUnitKey.set(escort.unitKey, escort));
      return;
    }
    if (operation.kind === "flight") {
      flightsByUnitKey.set(operation.flight.unitKey, operation.flight);
    }
  });

  const interceptorSpecs = new Map<string, MutableFlightSpec>();
  const escortSpecs = new Map<string, MutableFlightSpec>();
  const claimedOperationIndices = new Set<number>();

  const upsertSceneFlight = (
    map: Map<string, MutableFlightSpec>,
    args: {
      unitKey: string;
      scenarioType: string;
      faction: TurnFaction;
      role: "interceptor" | "escort";
      combatRole: "cap" | "escort";
      originHexKey: string | null;
      strengthBefore: number;
      strengthAfterEscortPhase: number;
      finalStrength: number;
      laneOffsetPx: number;
    }
  ): void => {
    const current = map.get(args.unitKey);
    if (!current) {
      map.set(
        args.unitKey,
        createMutableFlightSpec(
          args.unitKey,
          args.scenarioType,
          args.faction,
          args.role,
          args.combatRole,
          args.originHexKey,
          args.strengthBefore,
          args.laneOffsetPx
        )
      );
    }
    const next = map.get(args.unitKey)!;
    if (!next.originHexKey && args.originHexKey) {
      next.originHexKey = args.originHexKey;
    }
    next.strengthBefore = Math.max(next.strengthBefore, args.strengthBefore);
    next.strengthAfterEscortPhase = updateStrengthFloor(
      next.strengthAfterEscortPhase,
      args.strengthAfterEscortPhase
    );
    next.finalStrength = updateStrengthFloor(next.finalStrength, args.finalStrength);
  };

  candidateCombatEvents.forEach((event) => {
    const ownerOperation = cluster.find(
      (operation) =>
        operation.kind === "linkedStrike"
        && operation.linkedEvents.includes(event)
    );
    if (ownerOperation) {
      claimedOperationIndices.add(ownerOperation.index);
    }

    getEventInterceptors(event).forEach((participant, index) => {
      const linkedFlight = flightsByUnitKey.get(participant.unitKey);
      const strengthBefore =
        participant.strength
        ?? linkedFlight?.strength
        ?? options.resolveStrength(participant.unitKey, participant.faction);
      upsertSceneFlight(interceptorSpecs, {
        unitKey: participant.unitKey,
        scenarioType: participant.unitType,
        faction: participant.faction,
        role: "interceptor",
        combatRole: "cap",
        originHexKey:
          linkedFlight?.originKey
          ?? options.resolveOriginKey(participant.unitKey, participant.faction),
        strengthBefore,
        strengthAfterEscortPhase:
          event.interceptorStrengthsAfterEscortPhase?.[index] ?? strengthBefore,
        finalStrength:
          event.interceptorFinalStrengths?.[index] ?? strengthBefore,
        laneOffsetPx: linkedFlight?.laneOffsetPx ?? 0
      });
    });

    getEventEscorts(event).forEach((participant, index) => {
      const linkedFlight = flightsByUnitKey.get(participant.unitKey);
      const combatRole = event.type === "capClash" ? "cap" : "escort";
      const strengthBefore =
        participant.strength
        ?? linkedFlight?.strength
        ?? options.resolveStrength(participant.unitKey, participant.faction);
      upsertSceneFlight(escortSpecs, {
        unitKey: participant.unitKey,
        scenarioType: participant.unitType,
        faction: participant.faction,
        role: "escort",
        combatRole,
        originHexKey:
          linkedFlight?.originKey
          ?? options.resolveOriginKey(participant.unitKey, participant.faction),
        strengthBefore,
        strengthAfterEscortPhase:
          event.escortStrengthsAfterEscortPhase?.[index] ?? strengthBefore,
        finalStrength:
          event.escortFinalStrengths?.[index] ?? strengthBefore,
        laneOffsetPx: linkedFlight?.laneOffsetPx ?? 0
      });
    });
  });

  cluster.forEach((operation) => {
    if (operation.kind !== "flight") {
      return;
    }
    const flight = operation.flight;
    if (flight.kind !== "airCover" && flight.kind !== "escort") {
      return;
    }
    claimedOperationIndices.add(operation.index);
    const role = flight.kind === "escort" ? "escort" : "interceptor";
    const targetMap = role === "escort" ? escortSpecs : interceptorSpecs;
    if (targetMap.has(flight.unitKey)) {
      return;
    }
    const fallbackStrength =
      flight.strength ?? options.resolveStrength(flight.unitKey, flight.faction);
    upsertSceneFlight(targetMap, {
      unitKey: flight.unitKey,
      scenarioType: flight.unitType,
      faction: flight.faction,
      role,
      combatRole: flight.kind === "escort" ? "escort" : "cap",
      originHexKey: flight.originKey || options.resolveOriginKey(flight.unitKey, flight.faction),
      strengthBefore: fallbackStrength,
      strengthAfterEscortPhase: fallbackStrength,
      finalStrength: fallbackStrength,
      laneOffsetPx: flight.laneOffsetPx
    });
  });

  linkedStrikeOperations.forEach((operation) => {
    operation.escorts.forEach((escort) => {
      claimedOperationIndices.add(operation.index);
      if (escortSpecs.has(escort.unitKey)) {
        return;
      }
      const fallbackStrength =
        escort.strength ?? options.resolveStrength(escort.unitKey, escort.faction);
      upsertSceneFlight(escortSpecs, {
        unitKey: escort.unitKey,
        scenarioType: escort.unitType,
        faction: escort.faction,
        role: "escort",
        combatRole: "escort",
        originHexKey: escort.originKey || options.resolveOriginKey(escort.unitKey, escort.faction),
        strengthBefore: fallbackStrength,
        strengthAfterEscortPhase: fallbackStrength,
        finalStrength: fallbackStrength,
        laneOffsetPx: escort.laneOffsetPx
      });
    });
  });

  const combinedEscortExchanges = Array.from(
    new Map(
      candidateCombatEvents
        .flatMap((event) => (event.escortExchanges ?? []) as readonly ResolvedAirShowExchange[])
        .map((exchange) => [buildExchangeKey(exchange), exchange] as const)
    ).values()
  );

  const coordinatedStrikeEntries: CoordinatedStrikeSceneEntry[] = [
    ...linkedStrikeOperations.map((operation) => {
      claimedOperationIndices.add(operation.index);
      const airToAirEvent =
        operation.linkedEvents.find((event) => event.type === "airToAir") ?? null;
      const flakEvent =
        operation.linkedEvents.find((event) => event.type === "flak") ?? null;
      return {
        flight: operation.flight,
        airToAirEvent,
        flakEvent,
        destroyedBeforeTarget:
          airToAirEvent?.bomberDestroyed === true || flakEvent?.bomberDestroyed === true
      };
    }),
    ...standaloneStrikeOperations.map((operation) => {
      claimedOperationIndices.add(operation.index);
      const airToAirEvent = findMatchingEventForFlight(operation.flight, allEvents, "airToAir");
      const flakEvent = findMatchingEventForFlight(operation.flight, allEvents, "flak");
      return {
        flight: operation.flight,
        airToAirEvent,
        flakEvent,
        destroyedBeforeTarget:
          airToAirEvent?.bomberDestroyed === true || flakEvent?.bomberDestroyed === true
      };
    })
  ];

  const coordinatedBombers = coordinatedStrikeEntries.map((entry) =>
    toResolvedStrikeFlightSpec(entry, options)
  );
  const combinedBomberPassExchanges = Array.from(
    new Map(
      coordinatedStrikeEntries
        .flatMap((entry) => (entry.airToAirEvent?.bomberPassExchanges ?? []) as readonly ResolvedAirShowExchange[])
        .map((exchange) => [buildExchangeKey(exchange), exchange] as const)
    ).values()
  );
  const combinedFlakBursts = coordinatedStrikeEntries.flatMap((entry) =>
    buildResolvedAirShowFlakBursts(entry.flakEvent, {
      bomberUnitKey: entry.flight.unitKey,
      targetHexKey: entry.flight.destKey
    })
  );
  const fighterScenePresent = interceptorSpecs.size + escortSpecs.size > 0;
  const scene =
    fighterScenePresent || coordinatedBombers.length > 0
      ? {
          kind:
            coordinatedBombers.length > 0 || candidateCombatEvents.some((event) => event.type === "airToAir")
              ? "airToAir" as const
              : "capClash" as const,
          hexKey: focusKey ?? cluster.find((operation) => operation.focusKey)?.focusKey ?? "0,0",
          interceptors: Array.from(interceptorSpecs.values()).map(toResolvedFlightSpec),
          escorts: Array.from(escortSpecs.values()).map(toResolvedFlightSpec),
          bomber: coordinatedBombers[0] ?? null,
          bombers: coordinatedBombers,
          escortExchanges: combinedEscortExchanges,
          bomberPassExchanges: combinedBomberPassExchanges,
          fighterIngressDurationMs: options.fighterIngressDurationMs,
          escortClashDurationMs: options.escortClashDurationMs,
          egressDurationMs: options.fighterEgressDurationMs,
          bomberArrivalDelayMs: 0,
          flakBursts: combinedFlakBursts
        } satisfies ResolvedAirShowScene
      : null;

  standaloneEventOperations.forEach((operation) => {
    if (operation.event.type === "airToAir" || operation.event.type === "capClash") {
      claimedOperationIndices.add(operation.index);
    }
  });

  const residualOperations = cluster.filter((operation) => !claimedOperationIndices.has(operation.index));
  const { bomberStartDelayMs, fighterIngressLeadMs } = resolveCoordinatedBomberStartDelayMs(
    fighterScenePresent,
    coordinatedBombers.length,
    options
  );
  const finalScene =
    scene
      ? {
          ...scene,
          bomberArrivalDelayMs: bomberStartDelayMs
        }
      : null;

  return {
    focusKey,
    scene: finalScene,
    announcementEvents: candidateCombatEvents,
    flakAnnouncementEvents: coordinatedStrikeEntries
      .map((entry) => entry.flakEvent)
      .filter((event): event is AirEngagementEvent => !!event),
    strikeMissionIds: coordinatedStrikeEntries.map((entry) => entry.flight.missionId),
    residualOperations,
    bomberStartDelayMs,
    fighterIngressLeadMs,
    handledOperationIndices: Array.from(claimedOperationIndices).sort((a, b) => a - b)
  };
}
