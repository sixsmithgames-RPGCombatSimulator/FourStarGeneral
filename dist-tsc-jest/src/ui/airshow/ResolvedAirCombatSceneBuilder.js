import { axialKey } from "../../core/Hex";
import { buildResolvedAirCombatSceneTimingPolicy } from "./AirShowTimingPolicies";
export function buildResolvedAirShowFlakBursts(flakEvent, options = {}) {
    if (!flakEvent) {
        return [];
    }
    const scopedEngagements = Array.isArray(flakEvent.flakEngagements) && flakEvent.flakEngagements.length > 0
        ? flakEvent.flakEngagements.filter((engagement) => !options.bomberUnitKey || engagement.bomberUnitKey === options.bomberUnitKey)
        : [];
    const eventBomberUnitKey = flakEvent.bomber?.unitKey ?? null;
    if (scopedEngagements.length <= 0
        && !!options.bomberUnitKey
        && !!eventBomberUnitKey
        && options.bomberUnitKey !== eventBomberUnitKey) {
        return [];
    }
    const batteryCount = scopedEngagements.length > 0
        ? new Set(scopedEngagements.map((engagement) => engagement.batteryUnitKey)).size
        : Math.max(0, flakEvent.interceptors.length);
    const batteryHexKeys = scopedEngagements.length > 0
        ? scopedEngagements
            .map((engagement) => engagement.batteryHex ? axialKey(engagement.batteryHex) : null)
            .filter((hexKey) => !!hexKey)
        : flakEvent.interceptors
            .map((interceptor) => interceptor.hex ? axialKey(interceptor.hex) : null)
            .filter((hexKey) => !!hexKey);
    const normalizedBatteryCount = Math.max(1, batteryCount);
    const waveCount = Math.max(12, Math.min(18, normalizedBatteryCount * 3 + 9));
    const startProgress = 0.26;
    const endProgress = 0.88;
    const progressStep = waveCount <= 1
        ? 0
        : (endProgress - startProgress) / (waveCount - 1);
    return Array.from({ length: waveCount }, (_, index) => {
        const seed = ((index + 1) * 1103515245 + normalizedBatteryCount * 2654435761) >>> 0;
        const randA = ((seed >>> 8) & 0xffff) / 0xffff;
        const randB = ((seed >>> 16) & 0xffff) / 0xffff;
        const randC = ((seed >>> 24) & 0xff) / 0xff;
        return {
            // Flak should open before ordnance release, linger through the approach,
            // and scale with actual AA batteries instead of blanketing the whole package.
            progress: Math.max(startProgress, Math.min(endProgress, startProgress
                + index * progressStep
                + (randA - 0.5) * progressStep * 0.42)),
            count: 1,
            scale: 0.56 + randC * 0.1,
            alongOffsetPx: -10 + (randA - 0.5) * 46,
            lateralOffsetPx: (index % Math.max(1, normalizedBatteryCount) - (Math.max(1, normalizedBatteryCount) - 1) / 2) * 24
                + (randB - 0.5) * Math.min(62, 28 + normalizedBatteryCount * 8),
            alongSpreadPx: 46 + normalizedBatteryCount * 7,
            lateralSpreadPx: 82 + normalizedBatteryCount * 13,
            puffCount: 12 + (index % 3),
            smokePuffCount: 16 + (index % 4),
            smokeScale: 1.12 + randC * 0.14,
            bomberUnitKey: options.bomberUnitKey ?? null,
            targetHexKey: options.targetHexKey ?? null,
            batteryHexKey: batteryHexKeys[index % Math.max(1, batteryHexKeys.length)] ?? null
        };
    });
}
export function buildResolvedAirCombatScene(event, options) {
    const sceneKind = event.type === "capClash" ? "capClash" : "airToAir";
    const linkedEscortFlights = options.linkedEscortFlights ?? [];
    const linkedEscortByUnitKey = new Map(linkedEscortFlights.map((flight) => [flight.unitKey, flight]));
    const unresolvedOriginUnitKeys = [];
    const participants = [];
    const resolveParticipantOrigin = (unitKey, faction, linkedOriginKey) => {
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
            strengthAfterEscortPhase: event.interceptorStrengthsAfterEscortPhase?.[index]
                ?? interceptor.strength
                ?? options.resolveStrength(interceptor.unitKey, interceptor.faction),
            finalStrength: event.interceptorFinalStrengths?.[index]
                ?? interceptor.strength
                ?? options.resolveStrength(interceptor.unitKey, interceptor.faction),
            laneOffsetPx: options.interceptorLaneOffsets?.[index] ?? options.fallbackLaneOffsetPx ?? 0,
            role: "interceptor",
            combatRole: "cap"
        };
    });
    const escorts = event.escorts.map((escort, index) => {
        const linkedEscort = linkedEscortByUnitKey.get(escort.unitKey) ?? null;
        const combatRole = event.type === "capClash" ? "cap" : "escort";
        const { originHexKey, source } = resolveParticipantOrigin(escort.unitKey, escort.faction, linkedEscort?.originKey ?? null);
        participants.push({
            unitKey: escort.unitKey,
            renderRole: "escort",
            combatRole,
            source,
            originHexKey
        });
        const fallbackStrength = escort.strength
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
            role: "escort",
            combatRole
        };
    });
    const includeBomber = options.includeBomber ?? event.type !== "capClash";
    const bomber = includeBomber
        ? (() => {
            const { originHexKey, source } = resolveParticipantOrigin(event.bomber.unitKey, event.bomber.faction, options.bomberOriginKey ?? null);
            participants.push({
                unitKey: event.bomber.unitKey,
                renderRole: "bomber",
                combatRole: "strike",
                source,
                originHexKey
            });
            const fallbackStrength = event.bomberStrengthBefore
                ?? event.bomber.strength
                ?? options.resolveStrength(event.bomber.unitKey, event.bomber.faction);
            return {
                id: event.bomber.unitKey,
                scenarioType: event.bomber.unitType,
                faction: event.bomber.faction,
                originHexKey,
                strengthBefore: fallbackStrength,
                strengthAfterEscortPhase: event.bomberStrengthAfter ?? fallbackStrength,
                finalStrength: Math.max(0, Math.min(event.bomberStrengthAfter ?? fallbackStrength, options.flakEvent?.bomberStrengthAfter ?? event.bomberStrengthAfter ?? fallbackStrength)),
                laneOffsetPx: options.bomberLaneOffsetPx ?? options.fallbackLaneOffsetPx ?? 0,
                role: "bomber",
                combatRole: "strike"
            };
        })()
        : null;
    const resolvedBombers = bomber ? [bomber] : [];
    const eventEscortUnitKeys = event.escorts.map((escort) => escort.unitKey);
    const linkedEscortUnitKeys = linkedEscortFlights.map((flight) => flight.unitKey);
    const linkedEscortMissingFromEventUnitKeys = linkedEscortUnitKeys.filter((unitKey) => !eventEscortUnitKeys.includes(unitKey));
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
            flakBursts: includeBomber
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
