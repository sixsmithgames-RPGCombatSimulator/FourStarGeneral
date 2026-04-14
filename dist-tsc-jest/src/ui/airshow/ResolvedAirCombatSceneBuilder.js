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
                finalStrength: event.bomberStrengthAfter ?? fallbackStrength,
                laneOffsetPx: options.bomberLaneOffsetPx ?? options.fallbackLaneOffsetPx ?? 0,
                role: "bomber",
                combatRole: "strike"
            };
        })()
        : null;
    const eventEscortUnitKeys = event.escorts.map((escort) => escort.unitKey);
    const linkedEscortUnitKeys = linkedEscortFlights.map((flight) => flight.unitKey);
    const linkedEscortMissingFromEventUnitKeys = linkedEscortUnitKeys.filter((unitKey) => !eventEscortUnitKeys.includes(unitKey));
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
            flakBursts: options.flakEvent && includeBomber
                ? (() => {
                    const engagementCount = Array.isArray(options.flakEvent.flakEngagements) && options.flakEvent.flakEngagements.length > 0
                        ? options.flakEvent.flakEngagements.length
                        : Math.max(0, options.flakEvent.interceptors.length);
                    const waveCount = Math.max(18, Math.min(26, engagementCount * 3 + 14));
                    return Array.from({ length: waveCount }, (_, index) => ({
                        // Flak fires during bomber approach (25-55% progress), not at end (82%+)
                        // This ensures flak is visible while bombers are on target run, not after they egress
                        progress: Math.min(0.55, 0.25 + index * 0.016),
                        count: engagementCount,
                        scale: 0.34 + index * 0.01,
                        alongOffsetPx: -24 + Math.sin((index / Math.max(1, waveCount - 1)) * Math.PI) * 12,
                        lateralOffsetPx: (index - (waveCount - 1) / 2) * Math.min(22, 14 + engagementCount * 3),
                        alongSpreadPx: 54 + engagementCount * 12,
                        lateralSpreadPx: 84 + engagementCount * 14,
                        puffCount: 18 + engagementCount * 8,
                        smokePuffCount: 24 + engagementCount * 10,
                        smokeScale: 1.36 + index * 0.028
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
