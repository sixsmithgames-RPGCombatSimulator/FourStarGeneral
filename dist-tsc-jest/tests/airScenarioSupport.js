import { CoordinateSystem } from "../src/rendering/CoordinateSystem.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer.js";
import { GameEngine } from "../src/game/GameEngine.js";
import { ensureDomEnvironment } from "./domEnvironment.js";
import { buildResolvedAirCombatScene } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder.js";
import { buildCoordinatedAirClusterPlaybackPlan } from "../src/ui/airshow/ClusterAirPlaybackPlanner.js";
import { sampleAirShowWaypointPath, sampleAirShowWaypointPoints } from "../src/ui/airshow/AirShowPathMath.js";
const plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
const terrain = { plains };
const fighterDef = {
    class: "air",
    combat: { category: "air", weight: "light", role: "normal", signature: "large" },
    movement: 5,
    moveType: "air",
    vision: 5,
    ammo: 6,
    fuel: 50,
    rangeMin: 1,
    rangeMax: 2,
    initiative: 6,
    armor: { front: 6, side: 5, top: 5 },
    hardAttack: 12,
    softAttack: 18,
    ap: 6,
    accuracyBase: 64,
    traits: ["skirmish"],
    cost: 320,
    airSupport: {
        roles: ["escort", "cap"],
        cruiseSpeedKph: 540,
        combatRadiusKm: 250,
        refitTurns: 1
    }
};
const interceptorDef = {
    ...fighterDef,
    initiative: 7,
    accuracyBase: 68
};
const bomberDef = {
    class: "air",
    combat: { category: "air", weight: "light", role: "normal", signature: "large" },
    movement: 4,
    moveType: "air",
    vision: 4,
    ammo: 4,
    fuel: 60,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 1,
    armor: { front: 8, side: 8, top: 8 },
    hardAttack: 16,
    softAttack: 45,
    ap: 8,
    accuracyBase: 55,
    traits: ["indirect", "carpet"],
    cost: 380,
    airSupport: {
        roles: ["strike"],
        cruiseSpeedKph: 450,
        combatRadiusKm: 250,
        refitTurns: 2
    }
};
const flakDef = {
    class: "vehicle",
    combat: { category: "artillery", weight: "medium", role: "normal", signature: "large" },
    movement: 1,
    moveType: "wheel",
    vision: 3,
    ammo: 6,
    fuel: 20,
    rangeMin: 1,
    rangeMax: 2,
    initiative: 4,
    armor: { front: 2, side: 1, top: 1 },
    hardAttack: 12,
    softAttack: 4,
    ap: 10,
    accuracyBase: 62,
    traits: ["intercept"],
    cost: 240
};
const infantryDef = {
    class: "infantry",
    combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
    movement: 1,
    moveType: "leg",
    vision: 2,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 3,
    armor: { front: 1, side: 1, top: 1 },
    hardAttack: 2,
    softAttack: 8,
    ap: 1,
    accuracyBase: 55,
    traits: [],
    cost: 80
};
const unitTypes = {
    Fighter: fighterDef,
    Interceptor: interceptorDef,
    Bomber: bomberDef,
    Flak_88: flakDef,
    Infantry_42: infantryDef
};
function side(hq) {
    return { hq, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] };
}
function scenario() {
    const tileKey = "plains";
    const row = Array.from({ length: 16 }, () => ({ tile: tileKey }));
    return {
        name: "Air Combat Automation Scenario",
        size: { cols: 16, rows: 16 },
        tilePalette: {
            [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
        },
        tiles: Array.from({ length: 16 }, () => row),
        objectives: [],
        turnLimit: 6,
        sides: { Player: side({ q: 0, r: 2 }), Bot: side({ q: 14, r: 14 }) }
    };
}
function make(type, hex, unitId, extras = {}) {
    return {
        type: type,
        hex,
        strength: 100,
        experience: 0,
        ammo: unitTypes[type].ammo ?? 6,
        fuel: unitTypes[type].fuel ?? 50,
        entrench: 0,
        facing: "NW",
        unitId,
        ...extras
    };
}
function setMission(engine, mission) {
    (engine.scheduledAirMissions).set(String(mission.id), mission);
}
const airCoverTemplate = {
    kind: "airCover",
    label: "CAP",
    description: "",
    allowedRoles: ["cap"],
    requiresTarget: false,
    requiresFriendlyEscortTarget: false,
    durationTurns: 1
};
const strikeTemplate = {
    kind: "strike",
    label: "Strike",
    description: "",
    allowedRoles: ["strike"],
    requiresTarget: true,
    requiresFriendlyEscortTarget: false,
    durationTurns: 0
};
const escortTemplate = {
    kind: "escort",
    label: "Escort",
    description: "",
    allowedRoles: ["escort"],
    requiresTarget: false,
    requiresFriendlyEscortTarget: true,
    durationTurns: 1
};
function buildEngine() {
    const config = {
        scenario: scenario(),
        unitTypes,
        terrain,
        playerSide: side({ q: 0, r: 2 }),
        botSide: side({ q: 14, r: 14 })
    };
    const engine = new GameEngine(config);
    engine.beginDeployment();
    engine.initializeFromAllocations([
        make("Fighter", { q: 0, r: 0 }, "u_pcap1"),
        make("Interceptor", { q: 1, r: 0 }, "u_pcap2"),
        make("Fighter", { q: 0, r: 1 }, "u_pcap3"),
        make("Infantry_42", { q: 3, r: 2 }, "u_ptarget1"),
        make("Infantry_42", { q: 4, r: 2 }, "u_ptarget2"),
        make("Infantry_42", { q: 3, r: 3 }, "u_ptarget3"),
        make("Infantry_42", { q: 4, r: 3 }, "u_ptarget4"),
        make("Flak_88", { q: 2, r: 2 }, "u_pflak1", { onSentry: true }),
        make("Flak_88", { q: 5, r: 2 }, "u_pflak2", { onSentry: true }),
        make("Flak_88", { q: 2, r: 4 }, "u_pflak3", { onSentry: true }),
        make("Flak_88", { q: 5, r: 4 }, "u_pflak4", { onSentry: true })
    ]);
    engine.setBaseCamp({ q: 0, r: 2 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();
    const internals = engine;
    [
        make("Bomber", { q: 13, r: 14 }, "u_bbomber1"),
        make("Bomber", { q: 14, r: 14 }, "u_bbomber2"),
        make("Bomber", { q: 13, r: 13 }, "u_bbomber3"),
        make("Bomber", { q: 14, r: 13 }, "u_bbomber4"),
        make("Fighter", { q: 12, r: 14 }, "u_bescort1"),
        make("Fighter", { q: 12, r: 13 }, "u_bescort2")
    ].forEach((unit) => {
        internals.botPlacements.set(`${unit.hex.q},${unit.hex.r}`, unit);
    });
    [
        {
            id: "player-cap-1",
            unitKey: "u_pcap1",
            originHexKey: "0,0",
            unitType: "Fighter",
            targetHex: { q: 3, r: 2 }
        },
        {
            id: "player-cap-2",
            unitKey: "u_pcap2",
            originHexKey: "1,0",
            unitType: "Interceptor",
            targetHex: { q: 4, r: 2 }
        },
        {
            id: "player-cap-3",
            unitKey: "u_pcap3",
            originHexKey: "0,1",
            unitType: "Fighter",
            targetHex: { q: 3, r: 3 }
        }
    ].forEach((mission) => {
        setMission(engine, {
            ...mission,
            template: airCoverTemplate,
            faction: "Player",
            status: "inFlight",
            launchTurn: 1,
            turnsRemaining: 0,
            interceptions: 0,
            airCombatDamageInflicted: 0,
            airCombatDamageTaken: 0,
            airCombatKills: 0
        });
    });
    [
        {
            id: "bot-strike-1",
            unitKey: "u_bbomber1",
            originHexKey: "13,14",
            targetHex: { q: 3, r: 2 },
            targetUnitKey: "u_ptarget1"
        },
        {
            id: "bot-strike-2",
            unitKey: "u_bbomber2",
            originHexKey: "14,14",
            targetHex: { q: 4, r: 2 },
            targetUnitKey: "u_ptarget2"
        },
        {
            id: "bot-strike-3",
            unitKey: "u_bbomber3",
            originHexKey: "13,13",
            targetHex: { q: 3, r: 3 },
            targetUnitKey: "u_ptarget3"
        },
        {
            id: "bot-strike-4",
            unitKey: "u_bbomber4",
            originHexKey: "14,13",
            targetHex: { q: 4, r: 3 },
            targetUnitKey: "u_ptarget4"
        }
    ].forEach((mission) => {
        setMission(engine, {
            ...mission,
            template: strikeTemplate,
            faction: "Bot",
            unitType: "Bomber",
            status: "resolving",
            launchTurn: 1,
            turnsRemaining: 0,
            interceptions: 0,
            airCombatDamageInflicted: 0,
            airCombatDamageTaken: 0,
            airCombatKills: 0
        });
    });
    [
        {
            id: "bot-escort-1",
            unitKey: "u_bescort1",
            originHexKey: "12,14",
            escortTargetUnitKey: "u_bbomber1"
        },
        {
            id: "bot-escort-2",
            unitKey: "u_bescort2",
            originHexKey: "12,13",
            escortTargetUnitKey: "u_bbomber2"
        }
    ].forEach((mission) => {
        setMission(engine, {
            ...mission,
            template: escortTemplate,
            faction: "Bot",
            unitType: "Fighter",
            status: "resolving",
            launchTurn: 1,
            turnsRemaining: 0,
            interceptions: 0,
            airCombatDamageInflicted: 0,
            airCombatDamageTaken: 0,
            airCombatKills: 0
        });
    });
    return engine;
}
function inspectCoordinatedFighterScene(scene) {
    if (!scene) {
        return null;
    }
    ensureDomEnvironment();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "1600");
    svg.setAttribute("height", "1200");
    const canvas = document.createElement("div");
    document.body.appendChild(svg);
    document.body.appendChild(canvas);
    const renderer = new HexMapRenderer();
    const hostFetch = globalThis.fetch?.bind(globalThis);
    const mockJsonResponse = (payload) => ({
        ok: true,
        status: 200,
        json: async () => payload
    });
    if (hostFetch) {
        globalThis.fetch = (async (input, init) => {
            const url = String(input);
            if (url.endsWith("data/effectSpecs.json")) {
                return mockJsonResponse([]);
            }
            if (url.endsWith("data/terrainTints.json")) {
                return mockJsonResponse([]);
            }
            if (url.endsWith("data/soundCatalog.json")) {
                return mockJsonResponse({ version: 1, assets: {} });
            }
            return hostFetch(input, init);
        });
    }
    renderer.render(svg, canvas, scenario());
    try {
        const report = renderer.inspectResolvedAirCombatShow(scene);
        if (!report) {
            return null;
        }
        return {
            phaseLabels: report.phases.map((phase) => phase.label),
            tracerCount: report.phases.reduce((sum, phase) => sum + phase.tracers.length, 0),
            durationMs: report.phases.reduce((sum, phase) => sum + phase.durationMs, 0)
        };
    }
    finally {
        if (hostFetch) {
            globalThis.fetch = hostFetch;
        }
        svg.remove();
        canvas.remove();
    }
}
function isResolvedMissionReport(report) {
    return (report.event ?? "resolved") === "resolved";
}
function describeMission(report) {
    const label = report.unitLabel ?? `${report.unitType} ${report.unitKey}`;
    const result = report.outcome?.result?.toUpperCase() ?? "UNKNOWN";
    const target = report.targetHex
        ? `${report.targetHex.q},${report.targetHex.r}`
        : report.escortTargetLabel ?? report.escortTargetUnitKey ?? "-";
    return `${report.faction} ${report.kind} ${label} -> ${target} [${result}]`;
}
function describeEngagement(event) {
    if (event.type === "capClash") {
        return `capClash @ ${event.location.q},${event.location.r}: ${event.interceptors.length} allied vs ${event.escorts.length} axis CAP`;
    }
    if (event.type === "flak") {
        return `flak @ ${event.location.q},${event.location.r}: ${event.interceptors.length} battery/batteries vs ${event.bomber.label ?? event.bomber.unitType}`;
    }
    return `airToAir @ ${event.location.q},${event.location.r}: ${event.interceptors.length} interceptors, ${event.escorts.length} escorts, bomber ${event.bomber.label ?? event.bomber.unitType}`;
}
function toOffsetHexKey(hex) {
    const offset = CoordinateSystem.axialToOffset(hex.q, hex.r);
    return `${offset.col},${offset.row}`;
}
function offsetHexKeyToAxial(hexKey) {
    if (!hexKey) {
        return null;
    }
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
        return null;
    }
    return CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
}
function lookupUnitHex(engine, unitKey, faction) {
    const lookup = engine.lookupUnitBySquadronId(unitKey, faction);
    return lookup?.unit?.hex ? structuredClone(lookup.unit.hex) : null;
}
function findScheduledMissionById(engine, missionId, faction) {
    return engine.getScheduledAirMissions(faction).find((entry) => entry.id === missionId) ?? null;
}
function findLinkedStrikeMissionForEscort(engine, protectedSquadronId, faction) {
    if (!protectedSquadronId) {
        return null;
    }
    const matches = engine
        .getScheduledAirMissions(faction)
        .filter((entry) => entry.kind === "strike" && entry.unitKey === protectedSquadronId);
    return matches.find((entry) => entry.status !== "completed") ?? matches[0] ?? null;
}
function resolvePlaybackTargetHex(engine, flight) {
    const mission = findScheduledMissionById(engine, flight.missionId, flight.faction);
    if (mission?.targetHex) {
        return structuredClone(mission.targetHex);
    }
    const escortedSquadronId = mission?.escortTargetUnitKey ?? flight.escortTargetUnitKey;
    if (escortedSquadronId) {
        const linkedStrike = findLinkedStrikeMissionForEscort(engine, escortedSquadronId, flight.faction);
        if (linkedStrike?.targetHex) {
            return structuredClone(linkedStrike.targetHex);
        }
        return lookupUnitHex(engine, escortedSquadronId, flight.faction);
    }
    return flight.targetHex ? structuredClone(flight.targetHex) : null;
}
function buildLaneOffsets(count) {
    if (count <= 1) {
        return [0];
    }
    const spacing = 27;
    const mid = (count - 1) / 2;
    return Array.from({ length: count }, (_, index) => Math.round((index - mid) * spacing));
}
function buildPreparedPlaybackFlights(engine, arrivals) {
    const unresolved = [];
    arrivals.forEach((arrival) => {
        const originKey = arrival.originHexKey ? CoordinateSystem.axialKeyToOffsetKey(arrival.originHexKey) : null;
        const targetHex = resolvePlaybackTargetHex(engine, {
            missionId: arrival.missionId,
            faction: arrival.faction,
            targetHex: arrival.targetHex,
            escortTargetUnitKey: arrival.escortTargetUnitKey
        });
        const destKey = targetHex ? toOffsetHexKey(targetHex) : null;
        const silentPatrolStationing = arrival.kind === "airCover"
            && !arrival.targetHex
            && !arrival.targetUnitKey
            && !arrival.escortTargetUnitKey;
        if ((!originKey || !destKey) && !silentPatrolStationing) {
            return;
        }
        if (!originKey || !destKey) {
            return;
        }
        unresolved.push({
            missionId: arrival.missionId,
            faction: arrival.faction,
            kind: arrival.kind,
            unitKey: arrival.unitKey,
            originKey,
            destKey,
            unitType: arrival.unitType,
            strength: arrival.unitStrength ?? lookupUnitStrength(engine, arrival.unitKey, arrival.faction),
            targetHexKey: targetHex ? toOffsetHexKey(targetHex) : null,
            escortTargetUnitKey: arrival.escortTargetUnitKey
        });
    });
    const grouped = new Map();
    unresolved.forEach((flight) => {
        const groupKey = `${flight.originKey}->${flight.destKey}`;
        const group = grouped.get(groupKey) ?? [];
        group.push(flight);
        grouped.set(groupKey, group);
    });
    const preparedFlights = [];
    grouped.forEach((group) => {
        const offsets = buildLaneOffsets(group.length);
        group.forEach((flight, index) => {
            preparedFlights.push({
                ...flight,
                laneOffsetPx: offsets[index] ?? 0
            });
        });
    });
    return preparedFlights;
}
function buildFallbackPlaybackArrivals(engine) {
    const factions = ["Player", "Bot", "Ally"];
    const seenMissionIds = new Set();
    const arrivals = [];
    factions.forEach((faction) => {
        engine.getScheduledAirMissions(faction).forEach((mission) => {
            if (seenMissionIds.has(mission.id)) {
                return;
            }
            seenMissionIds.add(mission.id);
            arrivals.push({
                missionId: mission.id,
                faction: mission.faction,
                unitKey: mission.unitKey,
                originHexKey: mission.originHexKey,
                unitType: mission.unitType,
                unitStrength: lookupUnitStrength(engine, mission.unitKey, mission.faction),
                kind: mission.kind,
                targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
                targetUnitKey: mission.targetUnitKey,
                escortTargetUnitKey: mission.escortTargetUnitKey
            });
        });
    });
    return arrivals;
}
function buildPlaybackProjection(engine, arrivals, engagements) {
    const preparedFlights = buildPreparedPlaybackFlights(engine, arrivals);
    const linkedEventsByMissionId = new Map();
    const linkedEventsByBomberUnitKey = new Map();
    engagements.forEach((event) => {
        if (event.missionId) {
            const linked = linkedEventsByMissionId.get(event.missionId) ?? [];
            linked.push(event);
            linkedEventsByMissionId.set(event.missionId, linked);
        }
        const linkedToBomber = linkedEventsByBomberUnitKey.get(event.bomber.unitKey) ?? [];
        linkedToBomber.push(event);
        linkedEventsByBomberUnitKey.set(event.bomber.unitKey, linkedToBomber);
    });
    const linkedEscortFlights = new Map();
    const nonEscortFlights = [];
    preparedFlights.forEach((flight) => {
        if (flight.kind === "escort" && flight.escortTargetUnitKey) {
            const escorts = linkedEscortFlights.get(flight.escortTargetUnitKey) ?? [];
            escorts.push(flight);
            linkedEscortFlights.set(flight.escortTargetUnitKey, escorts);
            return;
        }
        nonEscortFlights.push(flight);
    });
    const linkedStrikeFlights = [];
    const linkedStrikeMissionIds = new Set();
    const claimedAirBattleUnitKeys = new Set();
    const claimedLinkedEvents = new Set();
    nonEscortFlights.forEach((flight) => {
        const linkedEvents = Array.from(new Set([
            ...(linkedEventsByMissionId.get(flight.missionId) ?? []),
            ...(linkedEventsByBomberUnitKey.get(flight.unitKey) ?? [])
        ]));
        if (flight.kind !== "strike" || linkedEvents.length <= 0) {
            return;
        }
        linkedStrikeMissionIds.add(flight.missionId);
        linkedEvents.forEach((event) => claimedLinkedEvents.add(event));
        const linkedEscorts = linkedEscortFlights.get(flight.unitKey) ?? [];
        linkedEvents.forEach((event) => {
            if (event.type !== "airToAir") {
                return;
            }
            event.interceptors.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
            event.escorts.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
            linkedEscorts.forEach((escortFlight) => claimedAirBattleUnitKeys.add(escortFlight.unitKey));
        });
        linkedStrikeFlights.push({
            flight,
            linkedEvents,
            escorts: linkedEscorts
        });
        linkedEscortFlights.delete(flight.unitKey);
    });
    engagements.forEach((event) => {
        if (event.type !== "capClash") {
            return;
        }
        event.interceptors.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
        event.escorts.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
    });
    const standaloneFlights = [];
    nonEscortFlights.forEach((flight) => {
        if (linkedStrikeMissionIds.has(flight.missionId)) {
            return;
        }
        if ((flight.kind === "airCover" || flight.kind === "escort") && claimedAirBattleUnitKeys.has(flight.unitKey)) {
            return;
        }
        standaloneFlights.push(flight);
    });
    linkedEscortFlights.forEach((escorts) => {
        escorts
            .filter((flight) => !claimedAirBattleUnitKeys.has(flight.unitKey))
            .forEach((flight) => standaloneFlights.push(flight));
    });
    const standaloneEvents = engagements.filter((event) => !claimedLinkedEvents.has(event));
    const operations = [];
    let index = 0;
    standaloneEvents
        .filter((event) => event.type === "capClash")
        .forEach((event) => {
        const focusKey = toOffsetHexKey(event.location);
        operations.push({
            kind: "event",
            index,
            focusHex: structuredClone(event.location),
            focusKey,
            summary: {
                kind: "event",
                missionId: event.missionId,
                unitKey: event.bomber.unitKey,
                focusKey,
                label: `${event.type}:${event.missionId ?? event.bomber.unitKey}`
            }
        });
        index += 1;
    });
    linkedStrikeFlights.forEach(({ flight, linkedEvents, escorts }) => {
        const focusHex = resolvePlaybackTargetHex(engine, flight) ?? offsetHexKeyToAxial(flight.destKey);
        const focusKey = focusHex ? toOffsetHexKey(focusHex) : flight.destKey;
        operations.push({
            kind: "linkedStrike",
            index,
            focusHex,
            focusKey,
            summary: {
                kind: "linkedStrike",
                missionId: flight.missionId,
                unitKey: flight.unitKey,
                focusKey,
                label: `linkedStrike:${flight.missionId}:${flight.unitKey}`,
                linkedEventTypes: linkedEvents.map((event) => event.type),
                escortUnitKeys: escorts.map((escort) => escort.unitKey)
            }
        });
        index += 1;
    });
    standaloneFlights.forEach((flight) => {
        const focusHex = resolvePlaybackTargetHex(engine, flight) ?? offsetHexKeyToAxial(flight.destKey);
        const focusKey = focusHex ? toOffsetHexKey(focusHex) : flight.destKey;
        operations.push({
            kind: "flight",
            index,
            focusHex,
            focusKey,
            summary: {
                kind: "flight",
                missionId: flight.missionId,
                unitKey: flight.unitKey,
                focusKey,
                label: `flight:${flight.missionId}:${flight.kind}:${flight.unitKey}`
            }
        });
        index += 1;
    });
    standaloneEvents
        .filter((event) => event.type !== "capClash")
        .forEach((event) => {
        const focusKey = toOffsetHexKey(event.location);
        operations.push({
            kind: "event",
            index,
            focusHex: structuredClone(event.location),
            focusKey,
            summary: {
                kind: "event",
                missionId: event.missionId,
                unitKey: event.bomber.unitKey,
                focusKey,
                label: `${event.type}:${event.missionId ?? event.bomber.unitKey}`
            }
        });
        index += 1;
    });
    const clusters = [];
    const clusterOperationGroups = [];
    const visited = new Set();
    for (let startIndex = 0; startIndex < operations.length; startIndex += 1) {
        if (visited.has(startIndex)) {
            continue;
        }
        const clusterOperations = [];
        const queue = [startIndex];
        visited.add(startIndex);
        while (queue.length > 0) {
            const currentIndex = queue.shift();
            if (currentIndex === undefined) {
                continue;
            }
            const current = operations[currentIndex];
            clusterOperations.push(current);
            for (let candidateIndex = 0; candidateIndex < operations.length; candidateIndex += 1) {
                if (visited.has(candidateIndex)) {
                    continue;
                }
                const candidate = operations[candidateIndex];
                const sameFocus = current.focusKey && candidate.focusKey && current.focusKey === candidate.focusKey;
                const nearbyFocus = current.focusHex
                    && candidate.focusHex
                    && axialDistance(current.focusHex, candidate.focusHex) <= 8;
                if (!sameFocus && !nearbyFocus) {
                    continue;
                }
                visited.add(candidateIndex);
                queue.push(candidateIndex);
            }
        }
        clusterOperations.sort((left, right) => left.index - right.index);
        clusterOperationGroups.push(clusterOperations);
        const focusKeys = Array.from(new Set(clusterOperations.map((operation) => operation.focusKey).filter((focusKey) => Boolean(focusKey))));
        clusters.push({
            index: clusters.length,
            focusKeys,
            operationSummaries: clusterOperations.map((operation) => operation.summary)
        });
    }
    const coordinatedPlans = clusterOperationGroups
        .map((clusterOperations, clusterIndex) => {
        const plan = buildCoordinatedAirClusterPlaybackPlan(clusterOperations
            .map((operation) => {
            if (operation.kind === "linkedStrike") {
                const linkedStrike = linkedStrikeFlights.find((entry) => entry.flight.missionId === operation.summary.missionId);
                if (!linkedStrike) {
                    return null;
                }
                return {
                    kind: "linkedStrike",
                    index: operation.index,
                    focusHex: operation.focusHex,
                    focusKey: operation.focusKey,
                    flight: linkedStrike.flight,
                    linkedEvents: linkedStrike.linkedEvents,
                    escorts: linkedStrike.escorts
                };
            }
            if (operation.kind === "flight") {
                const standaloneFlight = standaloneFlights.find((entry) => entry.missionId === operation.summary.missionId);
                if (!standaloneFlight) {
                    return null;
                }
                return {
                    kind: "flight",
                    index: operation.index,
                    focusHex: operation.focusHex,
                    focusKey: operation.focusKey,
                    flight: standaloneFlight
                };
            }
            const standaloneEvent = standaloneEvents.find((event) => event.type === operation.summary.label.split(":")[0]
                && (event.missionId ?? event.bomber.unitKey) === (operation.summary.missionId ?? operation.summary.unitKey));
            if (!standaloneEvent) {
                return null;
            }
            return {
                kind: "event",
                index: operation.index,
                focusHex: operation.focusHex ?? structuredClone(standaloneEvent.location),
                focusKey: operation.focusKey ?? toOffsetHexKey(standaloneEvent.location),
                event: standaloneEvent
            };
        })
            .filter((entry) => !!entry), {
            resolveOriginKey: (unitKey, faction) => lookupUnitOriginKey(engine, unitKey, faction) ?? null,
            resolveStrength: (unitKey, faction) => lookupUnitStrength(engine, unitKey, faction),
            fighterIngressDurationMs: 1680,
            escortClashDurationMs: 2120,
            fighterEgressDurationMs: 920,
            bomberStartDelayMs: 880
        });
        if (!plan) {
            return null;
        }
        const fighterSceneInspection = inspectCoordinatedFighterScene(plan.scene);
        return {
            clusterIndex,
            focusKey: plan.focusKey,
            hasFighterScene: !!plan.scene,
            fighterSceneInterceptorCount: plan.scene?.interceptors.length ?? 0,
            fighterSceneEscortCount: plan.scene?.escorts.length ?? 0,
            fighterScenePhaseLabels: fighterSceneInspection?.phaseLabels ?? [],
            fighterSceneTracerCount: fighterSceneInspection?.tracerCount ?? 0,
            fighterSceneDurationMs: fighterSceneInspection?.durationMs ?? 0,
            strikeSortieMissionIds: Array.from(plan.strikeMissionIds),
            residualOperationLabels: Array.from(plan.residualOperations.map((entry) => {
                if (entry.kind === "linkedStrike") {
                    return `linkedStrike:${entry.flight.missionId}`;
                }
                if (entry.kind === "flight") {
                    return `flight:${entry.flight.missionId}`;
                }
                return `event:${entry.event.type}:${entry.event.missionId ?? entry.event.bomber.unitKey}`;
            })),
            bomberStartDelayMs: plan.bomberStartDelayMs,
            fighterIngressLeadMs: plan.fighterIngressLeadMs
        };
    })
        .filter(Boolean);
    return {
        preparedFlights,
        linkedStrikeMissionIds: linkedStrikeFlights.map((entry) => entry.flight.missionId),
        standaloneFlightMissionIds: standaloneFlights.map((flight) => flight.missionId),
        standaloneEventMissionIds: standaloneEvents.map((event) => event.missionId ?? event.type),
        clusters,
        coordinatedPlans
    };
}
function lookupUnitOriginKey(engine, unitKey, faction) {
    const lookup = engine.lookupUnitBySquadronId(unitKey, faction);
    if (lookup) {
        return toOffsetHexKey(lookup.unit.hex);
    }
    const missionOriginKey = engine
        .getScheduledAirMissions(faction)
        .find((mission) => mission.unitKey === unitKey && typeof mission.originHexKey === "string")
        ?.originHexKey
        ?? null;
    return missionOriginKey ? CoordinateSystem.axialKeyToOffsetKey(missionOriginKey) ?? undefined : undefined;
}
function lookupUnitStrength(engine, unitKey, faction) {
    const lookup = engine.lookupUnitBySquadronId(unitKey, faction);
    return lookup?.unit.strength ?? 100;
}
function buildInspectableScene(engine, event, flakEvent) {
    if (event.type !== "airToAir" && event.type !== "capClash") {
        return null;
    }
    const participantOffsets = buildLaneOffsets(event.interceptors.length + event.escorts.length);
    const interceptorOffsets = participantOffsets.slice(0, event.interceptors.length);
    const escortOffsets = participantOffsets.slice(event.interceptors.length, event.interceptors.length + event.escorts.length);
    const mission = event.missionId
        ? engine.getScheduledAirMissions(event.bomber.faction).find((entry) => entry.id === event.missionId) ?? null
        : null;
    const bomberTargetHexKey = mission?.targetHex ? toOffsetHexKey(mission.targetHex) : null;
    const linkedEscortFlights = event.type === "airToAir"
        ? engine
            .getScheduledAirMissions(event.bomber.faction)
            .filter((entry) => entry.kind === "escort" && entry.escortTargetUnitKey === event.bomber.unitKey)
            .map((entry) => ({
            unitKey: entry.unitKey,
            originKey: entry.originHexKey ?? lookupUnitOriginKey(engine, entry.unitKey, entry.faction) ?? "",
            unitType: entry.unitType,
            faction: entry.faction,
            strength: lookupUnitStrength(engine, entry.unitKey, entry.faction)
        }))
            .filter((entry) => entry.originKey.length > 0)
        : [];
    return buildResolvedAirCombatScene(event, {
        locKey: toOffsetHexKey(event.location),
        resolveOriginKey: (unitKey, faction) => lookupUnitOriginKey(engine, unitKey, faction) ?? null,
        resolveStrength: (unitKey, faction) => lookupUnitStrength(engine, unitKey, faction),
        interceptorLaneOffsets: interceptorOffsets,
        escortLaneOffsets: escortOffsets,
        bomberLaneOffsetPx: 0,
        linkedEscortFlights,
        bomberOriginKey: lookupUnitOriginKey(engine, event.bomber.unitKey, event.bomber.faction) ?? null,
        bomberTargetKey: bomberTargetHexKey,
        flakEvent,
        includeBomber: event.type === "airToAir"
    });
}
function buildSyntheticInspectableCases() {
    const makeFlight = (id, role, combatRole, originHexKey, laneOffsetPx, scenarioType, faction, strengthBefore, strengthAfterEscortPhase = strengthBefore, finalStrength = strengthBefore) => ({
        id,
        scenarioType,
        faction,
        originHexKey,
        strengthBefore,
        strengthAfterEscortPhase,
        finalStrength,
        laneOffsetPx,
        role,
        combatRole
    });
    const makeParticipant = (unitKey, renderRole, combatRole, originHexKey) => ({
        unitKey,
        renderRole,
        combatRole,
        source: "event",
        originHexKey
    });
    const makeBomber = (unitKey, faction) => ({
        unitKey,
        unitType: "Bomber",
        label: unitKey,
        faction,
        strength: 100
    });
    const makeFighter = (unitKey, faction, unitType = "Fighter", strength = 100) => ({
        unitKey,
        unitType,
        label: unitKey,
        faction,
        strength
    });
    const makeDiagnostics = (eventType, participants) => ({
        eventType,
        bomberIncluded: participants.some((participant) => participant.renderRole === "bomber"),
        participants,
        linkedEscortUnitKeys: participants
            .filter((participant) => participant.renderRole === "escort" && participant.combatRole === "escort")
            .map((participant) => participant.unitKey),
        eventEscortUnitKeys: participants
            .filter((participant) => participant.renderRole === "escort")
            .map((participant) => participant.unitKey),
        linkedEscortMissingFromEventUnitKeys: [],
        oppositionCapFlightUnitKeys: participants
            .filter((participant) => participant.renderRole === "escort" && participant.combatRole === "cap")
            .map((participant) => participant.unitKey),
        unresolvedOriginUnitKeys: []
    });
    const makeFlakBursts = (count) => Array.from({ length: count }, (_, index) => ({
        // Keep the barrage in the late final-approach window so diagnostics catch
        // regressions where flak starts bursting while the strike package is still far
        // from the target hex.
        progress: Math.min(0.9, 0.66 + index * 0.013),
        count: 1,
        scale: 0.34 + index * 0.01,
        alongOffsetPx: -12 + Math.sin((index / Math.max(1, count - 1)) * Math.PI) * 8,
        lateralOffsetPx: (index - (count - 1) / 2) * 14,
        alongSpreadPx: 62,
        lateralSpreadPx: 98,
        puffCount: 22,
        smokePuffCount: 28,
        smokeScale: 1.28 + index * 0.018
    }));
    const scenario1Participants = [
        makeParticipant("synthetic-s1-escort", "escort", "escort", "1,6"),
        makeParticipant("synthetic-s1-bomber", "bomber", "strike", "1,7")
    ];
    const scenario2Participants = [makeParticipant("synthetic-s2-bomber", "bomber", "strike", "1,7")];
    const scenario3Participants = [
        makeParticipant("synthetic-s3-interceptor-a", "interceptor", "cap", "6,2"),
        makeParticipant("synthetic-s3-interceptor-b", "interceptor", "cap", "6,3"),
        makeParticipant("synthetic-s3-bomber", "bomber", "strike", "1,7")
    ];
    const scenario4Participants = [
        makeParticipant("synthetic-s4-player-cap-a", "interceptor", "cap", "0,1"),
        makeParticipant("synthetic-s4-player-cap-b", "interceptor", "cap", "0,2"),
        makeParticipant("synthetic-s4-axis-cap", "escort", "cap", "7,6")
    ];
    const scenario5Participants = [
        makeParticipant("synthetic-s5-interceptor-a", "interceptor", "cap", "6,1"),
        makeParticipant("synthetic-s5-interceptor-b", "interceptor", "cap", "6,2"),
        makeParticipant("synthetic-s5-interceptor-c", "interceptor", "cap", "6,3"),
        makeParticipant("synthetic-s5-escort-a", "escort", "escort", "1,5"),
        makeParticipant("synthetic-s5-escort-b", "escort", "escort", "1,6"),
        makeParticipant("synthetic-s5-bomber", "bomber", "strike", "1,7")
    ];
    return [
        {
            event: {
                type: "airToAir",
                missionId: "synthetic-scenario-1-escort-strike-no-interceptors",
                location: { q: 4, r: 4 },
                interceptors: [],
                escorts: [makeFighter("synthetic-s1-escort", "Player")],
                bomber: makeBomber("synthetic-s1-bomber", "Player"),
                escortExchanges: [],
                bomberPassExchanges: []
            },
            diagnostics: makeDiagnostics("airToAir", [...scenario1Participants]),
            scene: {
                kind: "airToAir",
                hexKey: "4,4",
                interceptors: [],
                escorts: [makeFlight("synthetic-s1-escort", "escort", "escort", "1,6", 42, "Fighter", "Player", 100)],
                bomber: makeFlight("synthetic-s1-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100),
                escortExchanges: [],
                bomberPassExchanges: [],
                bomberTargetHexKey: "5,5",
                bomberArrivalDelayMs: 260,
                flakBursts: makeFlakBursts(18)
            }
        },
        {
            event: {
                type: "airToAir",
                missionId: "synthetic-scenario-2-strike-only",
                location: { q: 4, r: 4 },
                interceptors: [],
                escorts: [],
                bomber: makeBomber("synthetic-s2-bomber", "Player"),
                escortExchanges: [],
                bomberPassExchanges: []
            },
            diagnostics: makeDiagnostics("airToAir", [...scenario2Participants]),
            scene: {
                kind: "airToAir",
                hexKey: "4,4",
                interceptors: [],
                escorts: [],
                bomber: makeFlight("synthetic-s2-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100),
                escortExchanges: [],
                bomberPassExchanges: [],
                bomberTargetHexKey: "5,5",
                flakBursts: makeFlakBursts(18)
            }
        },
        {
            event: {
                type: "airToAir",
                missionId: "synthetic-scenario-3-strike-plus-interceptors-no-escorts",
                location: { q: 4, r: 4 },
                interceptors: [
                    makeFighter("synthetic-s3-interceptor-a", "Bot"),
                    makeFighter("synthetic-s3-interceptor-b", "Bot", "Interceptor")
                ],
                escorts: [],
                bomber: makeBomber("synthetic-s3-bomber", "Player"),
                escortExchanges: [],
                bomberPassExchanges: [
                    { attackerUnitKey: "synthetic-s3-interceptor-a", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 },
                    { attackerUnitKey: "synthetic-s3-interceptor-b", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 }
                ]
            },
            diagnostics: makeDiagnostics("airToAir", [...scenario3Participants]),
            scene: {
                kind: "airToAir",
                hexKey: "4,4",
                interceptors: [
                    makeFlight("synthetic-s3-interceptor-a", "interceptor", "cap", "6,2", -30, "Fighter", "Bot", 100, 100, 92),
                    makeFlight("synthetic-s3-interceptor-b", "interceptor", "cap", "6,3", 30, "Interceptor", "Bot", 100, 100, 88)
                ],
                escorts: [],
                bomber: makeFlight("synthetic-s3-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100, 82, 82),
                escortExchanges: [],
                bomberPassExchanges: [
                    { attackerUnitKey: "synthetic-s3-interceptor-a", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 },
                    { attackerUnitKey: "synthetic-s3-interceptor-b", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 }
                ],
                bomberTargetHexKey: "5,5",
                flakBursts: makeFlakBursts(18)
            }
        },
        {
            event: {
                type: "capClash",
                missionId: "synthetic-scenario-4-cap-clash",
                location: { q: 4, r: 4 },
                interceptors: [
                    makeFighter("synthetic-s4-player-cap-a", "Player", "Fighter", 58),
                    makeFighter("synthetic-s4-player-cap-b", "Player", "Interceptor", 63)
                ],
                escorts: [makeFighter("synthetic-s4-axis-cap", "Bot", "Fighter", 42)]
            },
            diagnostics: makeDiagnostics("capClash", [...scenario4Participants]),
            scene: {
                kind: "capClash",
                hexKey: "4,4",
                interceptors: [
                    makeFlight("synthetic-s4-player-cap-a", "interceptor", "cap", "0,1", -24, "Fighter", "Player", 100, 58, 58),
                    makeFlight("synthetic-s4-player-cap-b", "interceptor", "cap", "0,2", 24, "Interceptor", "Player", 100, 63, 63)
                ],
                escorts: [makeFlight("synthetic-s4-axis-cap", "escort", "cap", "7,6", 0, "Fighter", "Bot", 100, 42, 42)],
                bomber: null,
                escortExchanges: [
                    { attackerUnitKey: "synthetic-s4-player-cap-a", defenderUnitKey: "synthetic-s4-axis-cap", defenderStrengthAfter: 71 },
                    { attackerUnitKey: "synthetic-s4-player-cap-b", defenderUnitKey: "synthetic-s4-axis-cap", defenderStrengthAfter: 42 }
                ],
                bomberPassExchanges: []
            }
        },
        {
            event: {
                type: "airToAir",
                missionId: "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack",
                location: { q: 4, r: 4 },
                interceptors: [
                    makeFighter("synthetic-s5-interceptor-a", "Bot", "Fighter", 25),
                    makeFighter("synthetic-s5-interceptor-b", "Bot", "Interceptor", 25),
                    makeFighter("synthetic-s5-interceptor-c", "Bot", "Fighter", 25)
                ],
                escorts: [
                    makeFighter("synthetic-s5-escort-a", "Player", "Fighter", 25),
                    makeFighter("synthetic-s5-escort-b", "Player", "Interceptor", 25)
                ],
                bomber: makeBomber("synthetic-s5-bomber", "Player"),
                escortExchanges: [
                    { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-escort-a", defenderStrengthAfter: 25 },
                    { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-escort-b", defenderStrengthAfter: 25 }
                ],
                bomberPassExchanges: [
                    { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
                    { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
                    { attackerUnitKey: "synthetic-s5-interceptor-c", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 }
                ]
            },
            diagnostics: makeDiagnostics("airToAir", [...scenario5Participants]),
            scene: {
                kind: "airToAir",
                hexKey: "4,4",
                interceptors: [
                    makeFlight("synthetic-s5-interceptor-a", "interceptor", "cap", "6,1", -54, "Fighter", "Bot", 25, 25, 25),
                    makeFlight("synthetic-s5-interceptor-b", "interceptor", "cap", "6,2", 0, "Interceptor", "Bot", 25, 25, 25),
                    makeFlight("synthetic-s5-interceptor-c", "interceptor", "cap", "6,3", 54, "Fighter", "Bot", 25, 25, 25)
                ],
                escorts: [
                    makeFlight("synthetic-s5-escort-a", "escort", "escort", "1,5", -36, "Fighter", "Player", 25, 25, 25),
                    makeFlight("synthetic-s5-escort-b", "escort", "escort", "1,6", 36, "Interceptor", "Player", 25, 25, 25)
                ],
                bomber: makeFlight("synthetic-s5-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100, 100, 78),
                escortExchanges: [
                    { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-escort-a", defenderStrengthAfter: 25 },
                    { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-escort-b", defenderStrengthAfter: 25 }
                ],
                bomberPassExchanges: [
                    { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
                    { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
                    { attackerUnitKey: "synthetic-s5-interceptor-c", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 }
                ],
                bomberTargetHexKey: "5,5",
                bomberArrivalDelayMs: 220,
                flakBursts: makeFlakBursts(20)
            }
        }
    ];
}
function buildAirshowInspections(engine, engagements) {
    ensureDomEnvironment();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "1600");
    svg.setAttribute("height", "1200");
    const canvas = document.createElement("div");
    document.body.appendChild(svg);
    document.body.appendChild(canvas);
    const renderer = new HexMapRenderer();
    const hostFetch = globalThis.fetch?.bind(globalThis);
    const mockJsonResponse = (payload) => ({
        ok: true,
        status: 200,
        json: async () => payload
    });
    if (hostFetch) {
        globalThis.fetch = (async (input, init) => {
            const url = String(input);
            if (url.endsWith("data/effectSpecs.json")) {
                return mockJsonResponse([]);
            }
            if (url.endsWith("data/terrainTints.json")) {
                return mockJsonResponse([]);
            }
            if (url.endsWith("data/soundCatalog.json")) {
                return mockJsonResponse({ version: 1, assets: {} });
            }
            return hostFetch(input, init);
        });
    }
    renderer.render(svg, canvas, scenario());
    try {
        const inspect = (event, scene, diagnostics) => {
            const report = renderer.inspectResolvedAirCombatShow(scene);
            if (!report) {
                return null;
            }
            const phaseMetrics = report.phases.map((phase, phaseIndex) => measurePhase(report, phase, phaseIndex > 0 ? report.phases[phaseIndex - 1] : undefined));
            const findings = detectAirshowFindings(event, diagnostics, report, phaseMetrics, (scene.flakBursts?.length ?? 0) > 0);
            return { eventType: event.type, missionId: event.missionId, diagnostics, report, phaseMetrics, findings };
        };
        const engineCases = engagements.flatMap((event) => {
            const linkedFlak = event.type === "airToAir" && event.missionId
                ? engagements.find((candidate) => candidate.type === "flak" && candidate.missionId === event.missionId) ?? null
                : null;
            const scene = buildInspectableScene(engine, event, linkedFlak);
            if (!scene) {
                return [];
            }
            const inspection = inspect(event, scene.scene, scene.diagnostics);
            return inspection ? [inspection] : [];
        });
        const syntheticCases = buildSyntheticInspectableCases().flatMap((entry) => {
            const inspection = inspect(entry.event, entry.scene, entry.diagnostics);
            return inspection ? [inspection] : [];
        });
        return [...engineCases, ...syntheticCases];
    }
    finally {
        if (hostFetch) {
            globalThis.fetch = hostFetch;
        }
        svg.remove();
        canvas.remove();
    }
}
function distanceBetween(left, right) {
    return Math.hypot(right.cx - left.cx, right.cy - left.cy);
}
function averagePoint(points) {
    if (points.length <= 0) {
        return { cx: 0, cy: 0 };
    }
    const totals = points.reduce((acc, point) => {
        acc.cx += point.cx;
        acc.cy += point.cy;
        return acc;
    }, { cx: 0, cy: 0 });
    return {
        cx: totals.cx / points.length,
        cy: totals.cy / points.length
    };
}
function sampleInspectionPathPoint(points, progress) {
    return sampleAirShowWaypointPath(points, progress).point;
}
function sampleInspectionPath(points, sampleCount = 15) {
    return sampleAirShowWaypointPoints(points, sampleCount);
}
function axialDistance(left, right) {
    const dq = left.q - right.q;
    const dr = left.r - right.r;
    const ds = (-left.q - left.r) - (-right.q - right.r);
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}
function unitDefinitionHasTrait(definition, trait) {
    if (!definition || !Array.isArray(definition.traits)) {
        return false;
    }
    return definition.traits.includes(trait);
}
function angleBetweenVectors(left, right) {
    const leftLength = Math.hypot(left.x, left.y);
    const rightLength = Math.hypot(right.x, right.y);
    if (leftLength < 0.001 || rightLength < 0.001) {
        return 0;
    }
    const dot = (left.x * right.x + left.y * right.y) / (leftLength * rightLength);
    return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
}
function measurePhase(report, phase, previousPhase) {
    const sampledAssignments = phase.assignments.map((assignment) => ({
        assignment,
        samples: sampleInspectionPath(assignment.points, 17)
    }));
    const allPoints = sampledAssignments.flatMap((entry) => entry.samples.map((sample) => sample.point));
    const xs = allPoints.map((point) => point.cx);
    const ys = allPoints.map((point) => point.cy);
    const widthPx = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
    const heightPx = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;
    const pathLengths = sampledAssignments.map(({ samples }) => samples.slice(1).reduce((sum, sample, index) => {
        const prev = samples[index].point;
        return sum + Math.hypot(sample.point.cx - prev.cx, sample.point.cy - prev.cy);
    }, 0));
    const waypointTurnAngles = sampledAssignments.flatMap(({ samples }) => samples.slice(2).map((sample, index) => {
        const first = samples[index].point;
        const second = samples[index + 1].point;
        return angleBetweenVectors({ x: second.cx - first.cx, y: second.cy - first.cy }, { x: sample.point.cx - second.cx, y: sample.point.cy - second.cy });
    }));
    const firstWaypointTurnAngles = sampledAssignments
        .map(({ samples }) => {
        if (samples.length < 3) {
            return null;
        }
        const first = samples[0].point;
        const second = samples[1].point;
        const third = samples[2].point;
        return angleBetweenVectors({ x: second.cx - first.cx, y: second.cy - first.cy }, { x: third.cx - second.cx, y: third.cy - second.cy });
    })
        .filter((angle) => typeof angle === "number");
    const displacements = sampledAssignments.map(({ samples }) => {
        const start = samples[0]?.point;
        const end = samples[samples.length - 1]?.point;
        if (!start || !end) {
            return 0;
        }
        return Math.hypot(end.cx - start.cx, end.cy - start.cy);
    });
    const meanPathLengthPx = pathLengths.length > 0 ? pathLengths.reduce((sum, value) => sum + value, 0) / pathLengths.length : 0;
    const meanDisplacementPx = displacements.length > 0 ? displacements.reduce((sum, value) => sum + value, 0) / displacements.length : 0;
    const meanEfficiency = meanPathLengthPx > 0 ? meanDisplacementPx / meanPathLengthPx : 0;
    const tracerLengths = phase.tracers.map((tracer) => tracer.streakLengthPx);
    const visibleTracerLengths = phase.tracers.map((tracer) => tracer.visibleLengthPx);
    const tracerFanSpans = phase.tracers.map((tracer) => tracer.leftFanEndPoint && tracer.rightFanEndPoint
        ? distanceBetween(tracer.leftFanEndPoint, tracer.rightFanEndPoint)
        : 0);
    const tracerAlignmentAngles = phase.tracers
        .map((tracer) => {
        if (!tracer.targetPoint) {
            return null;
        }
        return angleBetweenVectors({
            x: tracer.centerlineEndPoint.cx - tracer.emitterPoint.cx,
            y: tracer.centerlineEndPoint.cy - tracer.emitterPoint.cy
        }, {
            x: tracer.targetPoint.cx - tracer.emitterPoint.cx,
            y: tracer.targetPoint.cy - tracer.emitterPoint.cy
        });
    })
        .filter((angle) => typeof angle === "number");
    const tracerRanges = phase.tracers
        .map((tracer) => {
        if (!tracer.targetPoint) {
            return null;
        }
        return distanceBetween(tracer.emitterPoint, tracer.targetPoint);
    })
        .filter((range) => typeof range === "number");
    const flakWidths = phase.flakBursts.map((burst) => burst.widthPx);
    const flakHeights = phase.flakBursts.map((burst) => burst.heightPx);
    const flakFlashCounts = phase.flakBursts.map((burst) => burst.flashCount);
    const entryTurnAngles = previousPhase
        ? phase.assignments
            .map((assignment) => {
            const previousAssignment = previousPhase.assignments.find((candidate) => candidate.actorId === assignment.actorId);
            if (!previousAssignment) {
                return null;
            }
            const previousSamples = sampleInspectionPath(previousAssignment.points, 17);
            const currentSamples = sampleInspectionPath(assignment.points, 17);
            if (previousSamples.length < 3 || currentSamples.length < 3) {
                return null;
            }
            const previousTail = previousSamples[previousSamples.length - 1].point;
            const previousBeforeTail = previousSamples[previousSamples.length - 2].point;
            const currentStart = currentSamples[0].point;
            const currentNext = currentSamples[1].point;
            return angleBetweenVectors({ x: previousTail.cx - previousBeforeTail.cx, y: previousTail.cy - previousBeforeTail.cy }, { x: currentNext.cx - currentStart.cx, y: currentNext.cy - currentStart.cy });
        })
            .filter((angle) => typeof angle === "number")
        : [];
    const flightsById = new Map(report.flights.map((flight) => [flight.id, flight]));
    const groupedAssignments = new Map();
    phase.assignments.forEach((assignment) => {
        const flight = flightsById.get(assignment.flightId);
        const faction = flight?.faction ?? "Unknown";
        const combatRole = flight?.combatRole ?? "unknown";
        const label = `${faction} ${combatRole}`.trim();
        const bucket = groupedAssignments.get(label) ?? [];
        bucket.push(assignment);
        groupedAssignments.set(label, bucket);
    });
    const groupMetrics = Array.from(groupedAssignments.entries()).map(([label, assignments]) => {
        const flight = flightsById.get(assignments[0]?.flightId ?? "");
        const faction = (flight?.faction ?? "Unknown");
        const combatRole = (flight?.combatRole ?? "unknown");
        const startCentroid = averagePoint(assignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0)));
        const midCentroid = averagePoint(assignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0.5)));
        const endCentroid = averagePoint(assignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 1)));
        const assignmentPathLengths = assignments.map((assignment) => {
            const samples = sampleInspectionPath(assignment.points, 17);
            return samples.slice(1).reduce((sum, sample, index) => sum + distanceBetween(samples[index].point, sample.point), 0);
        });
        const assignmentDisplacements = assignments.map((assignment) => distanceBetween(sampleInspectionPathPoint(assignment.points, 0), sampleInspectionPathPoint(assignment.points, 1)));
        const groupMeanPathLengthPx = assignmentPathLengths.length > 0
            ? assignmentPathLengths.reduce((sum, value) => sum + value, 0) / assignmentPathLengths.length
            : 0;
        const groupMeanDisplacementPx = assignmentDisplacements.length > 0
            ? assignmentDisplacements.reduce((sum, value) => sum + value, 0) / assignmentDisplacements.length
            : 0;
        return {
            label,
            faction,
            combatRole,
            assignmentCount: assignments.length,
            centroidStart: startCentroid,
            centroidMid: midCentroid,
            centroidEnd: endCentroid,
            meanPathLengthPx: groupMeanPathLengthPx,
            meanDisplacementPx: groupMeanDisplacementPx,
            meanEfficiency: groupMeanPathLengthPx > 0 ? groupMeanDisplacementPx / groupMeanPathLengthPx : 0,
            meanSpeedPxPerSec: groupMeanPathLengthPx / Math.max(0.001, phase.durationMs / 1000)
        };
    });
    const relationMetrics = [];
    for (let leftIndex = 0; leftIndex < groupMetrics.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < groupMetrics.length; rightIndex += 1) {
            const leftGroup = groupMetrics[leftIndex];
            const rightGroup = groupMetrics[rightIndex];
            if (leftGroup.faction === rightGroup.faction) {
                continue;
            }
            const leftAssignments = groupedAssignments.get(leftGroup.label) ?? [];
            const rightAssignments = groupedAssignments.get(rightGroup.label) ?? [];
            const leftMidPoints = leftAssignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0.5));
            const rightMidPoints = rightAssignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0.5));
            const minMidPairSeparationPx = leftMidPoints.length > 0 && rightMidPoints.length > 0
                ? Math.min(...leftMidPoints.flatMap((leftPoint) => rightMidPoints.map((rightPoint) => distanceBetween(leftPoint, rightPoint))))
                : 0;
            const leftDirection = {
                x: leftGroup.centroidMid.cx - leftGroup.centroidStart.cx,
                y: leftGroup.centroidMid.cy - leftGroup.centroidStart.cy
            };
            const rightDirection = {
                x: rightGroup.centroidMid.cx - rightGroup.centroidStart.cx,
                y: rightGroup.centroidMid.cy - rightGroup.centroidStart.cy
            };
            relationMetrics.push({
                fromLabel: leftGroup.label,
                toLabel: rightGroup.label,
                separationStartPx: distanceBetween(leftGroup.centroidStart, rightGroup.centroidStart),
                separationMidPx: distanceBetween(leftGroup.centroidMid, rightGroup.centroidMid),
                separationEndPx: distanceBetween(leftGroup.centroidEnd, rightGroup.centroidEnd),
                minMidPairSeparationPx,
                approachAngleDeg: angleBetweenVectors(leftDirection, rightDirection)
            });
        }
    }
    return {
        label: phase.label,
        widthPx,
        heightPx,
        meanPathLengthPx,
        meanDisplacementPx,
        meanEfficiency,
        meanSpeedPxPerSec: meanPathLengthPx / Math.max(0.001, phase.durationMs / 1000),
        tracerCount: phase.tracers.length,
        meanTracerLengthPx: tracerLengths.length > 0 ? tracerLengths.reduce((sum, value) => sum + value, 0) / tracerLengths.length : 0,
        meanVisibleTracerLengthPx: visibleTracerLengths.length > 0
            ? visibleTracerLengths.reduce((sum, value) => sum + value, 0) / visibleTracerLengths.length
            : 0,
        meanTracerFanSpanPx: tracerFanSpans.length > 0 ? tracerFanSpans.reduce((sum, value) => sum + value, 0) / tracerFanSpans.length : 0,
        meanTracerAlignmentDeg: tracerAlignmentAngles.length > 0
            ? tracerAlignmentAngles.reduce((sum, value) => sum + value, 0) / tracerAlignmentAngles.length
            : 0,
        maxTracerAlignmentDeg: tracerAlignmentAngles.length > 0 ? Math.max(...tracerAlignmentAngles) : 0,
        meanTracerRangePx: tracerRanges.length > 0 ? tracerRanges.reduce((sum, value) => sum + value, 0) / tracerRanges.length : 0,
        maxTracerRangePx: tracerRanges.length > 0 ? Math.max(...tracerRanges) : 0,
        flakBurstCount: phase.flakBursts.length,
        flakFlashCount: flakFlashCounts.reduce((sum, value) => sum + value, 0),
        flakPuffCount: phase.flakBursts.reduce((sum, burst) => sum + burst.puffCount, 0),
        meanFlakWidthPx: flakWidths.length > 0 ? flakWidths.reduce((sum, value) => sum + value, 0) / flakWidths.length : 0,
        meanFlakHeightPx: flakHeights.length > 0 ? flakHeights.reduce((sum, value) => sum + value, 0) / flakHeights.length : 0,
        meanEntryTurnAngleDeg: entryTurnAngles.length > 0 ? entryTurnAngles.reduce((sum, value) => sum + value, 0) / entryTurnAngles.length : 0,
        maxEntryTurnAngleDeg: entryTurnAngles.length > 0 ? Math.max(...entryTurnAngles) : 0,
        meanWaypointTurnAngleDeg: waypointTurnAngles.length > 0 ? waypointTurnAngles.reduce((sum, value) => sum + value, 0) / waypointTurnAngles.length : 0,
        maxWaypointTurnAngleDeg: waypointTurnAngles.length > 0 ? Math.max(...waypointTurnAngles) : 0,
        meanFirstWaypointTurnAngleDeg: firstWaypointTurnAngles.length > 0
            ? firstWaypointTurnAngles.reduce((sum, value) => sum + value, 0) / firstWaypointTurnAngles.length
            : 0,
        maxFirstWaypointTurnAngleDeg: firstWaypointTurnAngles.length > 0 ? Math.max(...firstWaypointTurnAngles) : 0,
        groupMetrics,
        relationMetrics,
        tracerMetrics: phase.tracers.map((tracer) => ({
            progress: tracer.progress,
            sourceActorId: tracer.sourceActorId,
            emitter: tracer.emitter,
            sourceHeadingDegrees: tracer.sourceHeadingDegrees,
            width: tracer.width,
            lifetimeMs: tracer.lifetimeMs,
            streakLengthPx: tracer.streakLengthPx,
            visibleLengthPx: tracer.visibleLengthPx,
            fanHalfAngleDeg: tracer.fanHalfAngleDeg,
            emitterPoint: tracer.emitterPoint,
            centerlineEndPoint: tracer.centerlineEndPoint,
            leftFanEndPoint: tracer.leftFanEndPoint,
            rightFanEndPoint: tracer.rightFanEndPoint,
            targetPoint: tracer.targetPoint,
            targetAlignmentDeg: tracer.targetPoint
                ? angleBetweenVectors({
                    x: tracer.centerlineEndPoint.cx - tracer.emitterPoint.cx,
                    y: tracer.centerlineEndPoint.cy - tracer.emitterPoint.cy
                }, {
                    x: tracer.targetPoint.cx - tracer.emitterPoint.cx,
                    y: tracer.targetPoint.cy - tracer.emitterPoint.cy
                })
                : undefined,
            targetRangePx: tracer.targetPoint ? distanceBetween(tracer.emitterPoint, tracer.targetPoint) : undefined
        })),
        flakMetrics: phase.flakBursts.map((burst) => ({
            progress: burst.progress,
            burstCenter: burst.burstCenter,
            flashCount: burst.flashCount,
            puffCount: burst.puffCount,
            smokePuffCount: burst.smokePuffCount,
            widthPx: burst.widthPx,
            heightPx: burst.heightPx
        }))
    };
}
function collectPhaseContinuityGaps(report) {
    const gaps = [];
    for (let phaseIndex = 1; phaseIndex < report.phases.length; phaseIndex += 1) {
        const previousPhase = report.phases[phaseIndex - 1];
        const currentPhase = report.phases[phaseIndex];
        const previousAssignmentsByActor = new Map(previousPhase.assignments.map((assignment) => [assignment.actorId, assignment]));
        currentPhase.assignments.forEach((assignment) => {
            const previousAssignment = previousAssignmentsByActor.get(assignment.actorId);
            const previousEnd = previousAssignment?.points[previousAssignment.points.length - 1];
            const currentStart = assignment.points[0];
            if (!previousEnd || !currentStart) {
                return;
            }
            gaps.push({
                actorId: assignment.actorId,
                role: assignment.role,
                fromLabel: previousPhase.label,
                toLabel: currentPhase.label,
                gapPx: distanceBetween(previousEnd, currentStart)
            });
        });
    }
    return gaps;
}
function detectAirshowFindings(event, diagnostics, report, phaseMetrics, expectedFlakOnTargetRun) {
    const findings = [];
    if (diagnostics.linkedEscortMissingFromEventUnitKeys.length > 0) {
        findings.push({
            code: "linked-escort-missing-from-event",
            message: `${event.type} ${event.missionId ?? "<no-mission>"} omitted linked escort unit(s): ` +
                diagnostics.linkedEscortMissingFromEventUnitKeys.join(", ")
        });
    }
    if (diagnostics.unresolvedOriginUnitKeys.length > 0) {
        findings.push({
            code: "unresolved-airshow-origins",
            message: `${event.type} ${event.missionId ?? "<no-mission>"} could not resolve origin hexes for: ` +
                diagnostics.unresolvedOriginUnitKeys.join(", ")
        });
    }
    const fighterIngressMetric = phaseMetrics.find((metric) => metric.label === "fighter-ingress");
    if (fighterIngressMetric) {
        const capGroups = fighterIngressMetric.groupMetrics.filter((group) => group.combatRole === "cap");
        const escortGroups = fighterIngressMetric.groupMetrics.filter((group) => group.combatRole === "escort");
        if (capGroups.length > 0 && escortGroups.length > 0) {
            const capEndDistancePx = capGroups.reduce((sum, group) => sum + distanceBetween(group.centroidEnd, report.center), 0) / capGroups.length;
            const escortEndDistancePx = escortGroups.reduce((sum, group) => sum + distanceBetween(group.centroidEnd, report.center), 0) / escortGroups.length;
            if (escortEndDistancePx + 28 < capEndDistancePx) {
                findings.push({
                    code: "escort-ingress-overreach",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} fighter ingress places escorts ${Math.round(capEndDistancePx - escortEndDistancePx)}px ` +
                        `deeper into the contested center than the defending CAP.`
                });
            }
        }
    }
    const bomberGapPhase = report.phases.find((phase) => phase.label === "bomber-gap");
    if (bomberGapPhase && bomberGapPhase.durationMs > 1400) {
        findings.push({
            code: "long-bomber-gap",
            message: `${event.type} ${event.missionId ?? "<no-mission>"} inserts a ${bomberGapPhase.durationMs}ms bomber-gap drift window ` +
                `between the dogfight and strike run.`
        });
    }
    const bomberGapMetric = phaseMetrics.find((metric) => metric.label === "bomber-gap");
    if (bomberGapMetric) {
        bomberGapMetric.groupMetrics
            .filter((group) => group.combatRole !== "strike")
            .forEach((group) => {
            if (group.meanDisplacementPx < 90 || group.meanSpeedPxPerSec < 110) {
                findings.push({
                    code: "static-bomber-gap-screen",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} keeps ${group.label} drifting only ` +
                        `${Math.round(group.meanDisplacementPx)}px at ${Math.round(group.meanSpeedPxPerSec)}px/s during bomber-gap.`
                });
            }
        });
    }
    const continuityGaps = collectPhaseContinuityGaps(report);
    const worstBomberGap = continuityGaps
        .filter((gap) => gap.role === "bomber")
        .sort((left, right) => right.gapPx - left.gapPx)[0];
    if (worstBomberGap && worstBomberGap.gapPx > 8) {
        findings.push({
            code: "bomber-phase-pop",
            message: `${event.type} ${event.missionId ?? "<no-mission>"} moves bomber actor ${worstBomberGap.actorId} ` +
                `${Math.round(worstBomberGap.gapPx)}px between ${worstBomberGap.fromLabel} and ${worstBomberGap.toLabel}.`
        });
    }
    phaseMetrics.forEach((metric) => {
        if (metric.label.includes("ingress") && metric.meanDisplacementPx < 90) {
            findings.push({
                code: "compressed-ingress",
                message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only displaced aircraft ` +
                    `${Math.round(metric.meanDisplacementPx)}px on average.`
            });
        }
        if (metric.label.includes("ingress")) {
            metric.groupMetrics.forEach((group) => {
                if (group.meanDisplacementPx < 50) {
                    findings.push({
                        code: "compressed-ingress-group",
                        message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only moved ${group.label} ` +
                            `${Math.round(group.meanDisplacementPx)}px on average.`
                    });
                }
            });
        }
        if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.widthPx < 140 && metric.heightPx < 140) {
            findings.push({
                code: "collapsed-combat-volume",
                message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} stayed in a ` +
                    `${Math.round(metric.widthPx)}x${Math.round(metric.heightPx)}px box.`
            });
        }
        if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.meanPathLengthPx > 260 && metric.meanEfficiency < 0.22) {
            findings.push({
                code: "orbit-heavy-maneuver",
                message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} displaced aircraft only ` +
                    `${Math.round(metric.meanEfficiency * 100)}% of their travelled path.`
            });
        }
        if (metric.label === "target-run") {
            if (expectedFlakOnTargetRun && metric.flakBurstCount <= 0) {
                findings.push({
                    code: "missing-flak-target-run",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} expected flak coverage on target-run but scheduled no flak bursts.`
                });
            }
            metric.groupMetrics
                .filter((group) => group.combatRole === "escort")
                .forEach((group) => {
                if (group.meanDisplacementPx < 80) {
                    findings.push({
                        code: "static-target-screen",
                        message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} kept ${group.label} moving only ` +
                            `${Math.round(group.meanDisplacementPx)}px on average.`
                    });
                }
            });
        }
        if (metric.label.includes("bomber-pass")) {
            metric.groupMetrics
                .filter((group) => group.combatRole === "escort")
                .forEach((group) => {
                if (group.meanDisplacementPx < 40) {
                    findings.push({
                        code: "static-bomber-screen",
                        message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} kept ${group.label} screening only ` +
                            `${Math.round(group.meanDisplacementPx)}px on average.`
                    });
                }
            });
        }
        if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.tracerCount <= 0) {
            findings.push({
                code: "missing-tracer-phase",
                message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} scheduled no tracers.`
            });
        }
        if (metric.meanEntryTurnAngleDeg > 110 || metric.maxEntryTurnAngleDeg > 145) {
            findings.push({
                code: "hard-phase-reversal",
                message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} enters with mean/max turn ` +
                    `${Math.round(metric.meanEntryTurnAngleDeg)}/${Math.round(metric.maxEntryTurnAngleDeg)} degrees.`
            });
        }
        const isScramblePhase = metric.label.includes("scramble");
        const isEgressPhase = metric.label === "egress";
        const isBomberManeuverPhase = metric.label.includes("pass") || metric.label === "target-run" || metric.label === "bomber-ingress";
        const waypointMeanThreshold = isScramblePhase ? 56 : isEgressPhase ? 34 : isBomberManeuverPhase ? 32 : 26;
        const waypointMaxThreshold = isScramblePhase ? 180 : isEgressPhase ? 180 : isBomberManeuverPhase ? 176 : 160;
        if (metric.meanWaypointTurnAngleDeg > waypointMeanThreshold ||
            (metric.maxWaypointTurnAngleDeg > waypointMaxThreshold
                && metric.meanWaypointTurnAngleDeg > waypointMeanThreshold * 0.92)) {
            findings.push({
                code: "sharp-waypoint-turn",
                message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} bends within the path at ` +
                    `${Math.round(metric.meanWaypointTurnAngleDeg)}/${Math.round(metric.maxWaypointTurnAngleDeg)} degrees.`
            });
        }
        const isClashPhase = metric.label.includes("clash");
        // Clash phases involve convergence from arbitrary ingress positions; the linear first-segment
        // interpolation makes the first-turn metric unreliable here — disable it (set to 180).
        const firstTurnMeanThreshold = isScramblePhase || isClashPhase ? 180 : isEgressPhase ? 42 : isBomberManeuverPhase ? 38 : 34;
        const firstTurnMaxThreshold = isScramblePhase || isClashPhase ? 180 : isEgressPhase ? 75 : isBomberManeuverPhase ? 130 : 60;
        if (metric.meanFirstWaypointTurnAngleDeg > firstTurnMeanThreshold ||
            metric.maxFirstWaypointTurnAngleDeg > firstTurnMaxThreshold) {
            findings.push({
                code: "jerky-phase-entry",
                message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} turns too sharply at its first waypoint ` +
                    `(${Math.round(metric.meanFirstWaypointTurnAngleDeg)}/${Math.round(metric.maxFirstWaypointTurnAngleDeg)} degrees).`
            });
        }
        if (metric.label.includes("clash")) {
            metric.relationMetrics.forEach((relation) => {
                if (relation.approachAngleDeg < 40 && relation.separationMidPx > 80) {
                    findings.push({
                        code: "parallel-dogfight-approach",
                        message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} keeps ${relation.fromLabel} and ${relation.toLabel} ` +
                            `moving only ${Math.round(relation.approachAngleDeg)} degrees apart while still ${Math.round(relation.separationMidPx)}px apart.`
                    });
                }
            });
        }
        if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.tracerCount > 0) {
            if (metric.meanTracerLengthPx < 220) {
                findings.push({
                    code: "short-tracers",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only paints ` +
                        `${Math.round(metric.meanTracerLengthPx)}px tracer streaks on average.`
                });
            }
            if (metric.meanTracerAlignmentDeg > 24 || metric.maxTracerAlignmentDeg > 38) {
                findings.push({
                    code: "misaligned-tracers",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} aims tracers ` +
                        `${Math.round(metric.meanTracerAlignmentDeg)}/${Math.round(metric.maxTracerAlignmentDeg)} degrees away from target.`
                });
            }
            if (metric.meanTracerFanSpanPx > 18) {
                findings.push({
                    code: "laser-fan-tracers",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} spreads tracer fans across ` +
                        `${Math.round(metric.meanTracerFanSpanPx)}px on average instead of tight forward bursts.`
                });
            }
            if (metric.meanTracerRangePx > 150 || metric.maxTracerRangePx > 210) {
                findings.push({
                    code: "detached-tracer-fire",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} fires from ` +
                        `${Math.round(metric.meanTracerRangePx)}/${Math.round(metric.maxTracerRangePx)}px away from targets.`
                });
            }
        }
        if (metric.label === "target-run" && metric.flakBurstCount > 0) {
            if (metric.flakMetrics.some((flak) => flak.progress < 0.6)) {
                findings.push({
                    code: "early-flak-window",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} schedules flak before the final approach window.`
                });
            }
            if (metric.flakMetrics.some((flak) => flak.progress > 0.94)) {
                findings.push({
                    code: "late-flak-window",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} lets flak slip past the target approach and into bomb-release timing.`
                });
            }
            if (metric.meanFlakWidthPx < 120) {
                findings.push({
                    code: "narrow-flak-belt",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only spreads flak ` +
                        `${Math.round(metric.meanFlakWidthPx)}px wide on average.`
                });
            }
            if (metric.flakPuffCount < 18) {
                findings.push({
                    code: "sparse-flak-belt",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only schedules ` +
                        `${metric.flakPuffCount} flak puffs total.`
                });
            }
            if (metric.flakFlashCount > Math.max(14, Math.round(metric.flakPuffCount * 0.45))) {
                findings.push({
                    code: "overbright-flak-barrage",
                    message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} still shows ` +
                        `${metric.flakFlashCount} visible flak flashes for ${metric.flakPuffCount} scheduled puffs.`
                });
            }
        }
    });
    return findings;
}
function detectAnomalies(engine, missionReports, engagements) {
    const anomalies = [];
    const internals = engine;
    const hasDefendingFlakCoverage = (report) => {
        if (!report.targetHex) {
            return false;
        }
        const defendingPlacements = report.faction === "Bot" ? internals.playerPlacements : internals.botPlacements;
        return Array.from(defendingPlacements.values()).some((unit) => {
            const definition = unitTypes[unit.type];
            if (!unitDefinitionHasTrait(definition, "intercept")) {
                return false;
            }
            return axialDistance(unit.hex, report.targetHex) <= 2;
        });
    };
    missionReports
        .filter(isResolvedMissionReport)
        .filter((report) => report.kind === "strike")
        .forEach((report) => {
        if (report.outcome?.result !== "destroyed") {
            return;
        }
        const strikeEvents = engagements.filter((event) => event.missionId === report.missionId);
        const hasCause = strikeEvents.some((event) => event.bomberDestroyed === true);
        if (!hasCause) {
            anomalies.push({
                code: "missing-destruction-cause",
                message: `${describeMission(report)} was destroyed without any matching air-to-air or flak kill event.`
            });
        }
    });
    missionReports
        .filter(isResolvedMissionReport)
        .filter((report) => report.kind === "escort")
        .forEach((report) => {
        if (report.outcome?.result === "aborted") {
            anomalies.push({
                code: "escort-aborted",
                message: `${describeMission(report)} resolved as ABORTED.`
            });
        }
    });
    missionReports
        .filter(isResolvedMissionReport)
        .filter((report) => report.kind === "strike")
        .forEach((report) => {
        const activeEscorts = missionReports.filter((candidate) => isResolvedMissionReport(candidate)
            &&
                candidate.kind === "escort"
            && candidate.escortTargetUnitKey === report.unitKey
            && candidate.outcome?.result !== "aborted");
        const strikeAirEvent = engagements.find((event) => event.type === "airToAir" && event.missionId === report.missionId);
        if (activeEscorts.length > 0 && strikeAirEvent && (strikeAirEvent.escorts?.length ?? 0) <= 0) {
            anomalies.push({
                code: "escort-missing-from-air-event",
                message: `${describeMission(report)} had ${activeEscorts.length} resolved escort report(s), but its air-to-air event showed no escorts.`
            });
        }
        const hasFlakEvent = engagements.some((event) => event.type === "flak" && event.missionId === report.missionId);
        if (report.outcome?.result !== "destroyed" && hasDefendingFlakCoverage(report) && !hasFlakEvent) {
            anomalies.push({
                code: "missing-flak-engagement",
                message: `${describeMission(report)} entered a target hex covered by sentry flak, but no flak engagement event was recorded.`
            });
        }
    });
    return anomalies;
}
export function runAirScenario() {
    const engine = buildEngine();
    engine.resolveReadyAirMissionsForRound();
    const arrivals = (() => {
        const consumed = engine.consumeAirMissionArrivals();
        return consumed.length > 0 ? consumed : buildFallbackPlaybackArrivals(engine);
    })();
    const missionReports = engine.getAirMissionReports().filter(isResolvedMissionReport);
    const engagements = engine.consumeAirEngagements();
    const playbackProjection = buildPlaybackProjection(engine, arrivals, engagements);
    const airshowInspections = buildAirshowInspections(engine, engagements);
    const findings = airshowInspections.flatMap((entry) => entry.findings);
    return {
        scenarioName: "Air Combat Automation Scenario",
        arrivals,
        missionReports,
        engagements,
        playbackProjection,
        airshowInspections,
        anomalies: detectAnomalies(engine, missionReports, engagements),
        findings
    };
}
export function formatAirScenarioReport(result) {
    const formatPoint = (point) => point ? `(${Math.round(point.cx)},${Math.round(point.cy)})` : "(n/a)";
    const lines = [];
    lines.push(`Scenario: ${result.scenarioName}`);
    lines.push(`Mission arrivals: ${result.arrivals.length}`);
    lines.push(`Mission reports: ${result.missionReports.length}`);
    lines.push(`Engagement events: ${result.engagements.length}`);
    lines.push("");
    lines.push("Mission arrivals:");
    result.arrivals.forEach((arrival) => {
        const targetHex = arrival.targetHex ? `${arrival.targetHex.q},${arrival.targetHex.r}` : arrival.escortTargetUnitKey ?? "none";
        lines.push(`- ${arrival.faction} ${arrival.kind} ${arrival.unitType} ${arrival.unitKey} -> ${targetHex}`);
    });
    lines.push("");
    lines.push("Mission results:");
    result.missionReports.forEach((report) => {
        lines.push(`- ${describeMission(report)}`);
    });
    lines.push("");
    lines.push("Engagement timeline:");
    result.engagements.forEach((event) => {
        lines.push(`- ${describeEngagement(event)}`);
    });
    lines.push("");
    lines.push("Playback projection:");
    lines.push(`- prepared=${result.playbackProjection.preparedFlights.length} linkedStrikeOps=${result.playbackProjection.linkedStrikeMissionIds.length} ` +
        `standaloneFlights=${result.playbackProjection.standaloneFlightMissionIds.length} standaloneEvents=${result.playbackProjection.standaloneEventMissionIds.length} ` +
        `clusters=${result.playbackProjection.clusters.length} coordinatedPlans=${result.playbackProjection.coordinatedPlans.length}`);
    result.playbackProjection.preparedFlights.forEach((flight) => {
        lines.push(`  flight ${flight.missionId} ${flight.kind} ${flight.unitKey} ${flight.originKey}->${flight.destKey} lane=${flight.laneOffsetPx}`
            + (flight.escortTargetUnitKey ? ` escortTarget=${flight.escortTargetUnitKey}` : ""));
    });
    result.playbackProjection.clusters.forEach((cluster) => {
        lines.push(`  cluster #${cluster.index + 1} focus=${cluster.focusKeys.join(" | ") || "<none>"} ops=${cluster.operationSummaries.length}`);
        cluster.operationSummaries.forEach((operation) => {
            lines.push(`    ${operation.label} focus=${operation.focusKey ?? "<none>"}`
                + (operation.linkedEventTypes && operation.linkedEventTypes.length > 0
                    ? ` events=${operation.linkedEventTypes.join("|")}`
                    : "")
                + (operation.escortUnitKeys && operation.escortUnitKeys.length > 0
                    ? ` escorts=${operation.escortUnitKeys.join("|")}`
                    : ""));
        });
    });
    result.playbackProjection.coordinatedPlans.forEach((plan) => {
        lines.push(`  coordinated cluster #${plan.clusterIndex + 1} focus=${plan.focusKey ?? "<none>"} ` +
            `fighterScene=${plan.hasFighterScene} interceptors=${plan.fighterSceneInterceptorCount} escorts=${plan.fighterSceneEscortCount} ` +
            `strikeSorties=${plan.strikeSortieMissionIds.join("|") || "<none>"} bomberDelayMs=${plan.bomberStartDelayMs} ` +
            `fighterLeadMs=${plan.fighterIngressLeadMs} fighterSceneDurationMs=${plan.fighterSceneDurationMs} tracers=${plan.fighterSceneTracerCount}`);
        if (plan.fighterScenePhaseLabels.length > 0) {
            lines.push(`    fighterScenePhases=${plan.fighterScenePhaseLabels.join(" -> ")}`);
        }
        if (plan.residualOperationLabels.length > 0) {
            lines.push(`    residual=${plan.residualOperationLabels.join(" | ")}`);
        }
    });
    lines.push("");
    if (result.airshowInspections.length > 0) {
        lines.push("Airshow geometry:");
        result.airshowInspections.forEach((inspectionEntry) => {
            lines.push(`- ${inspectionEntry.eventType}${inspectionEntry.missionId ? ` (${inspectionEntry.missionId})` : ""} center=(${Math.round(inspectionEntry.report.center.cx)},${Math.round(inspectionEntry.report.center.cy)}) phases=${inspectionEntry.report.phases.length}`);
            lines.push(`  diagnostics escorts(event=${inspectionEntry.diagnostics.eventEscortUnitKeys.length}, linked=${inspectionEntry.diagnostics.linkedEscortUnitKeys.length}) ` +
                `bomberIncluded=${inspectionEntry.diagnostics.bomberIncluded} unresolvedOrigins=${inspectionEntry.diagnostics.unresolvedOriginUnitKeys.length}`);
            if (inspectionEntry.diagnostics.linkedEscortMissingFromEventUnitKeys.length > 0) {
                lines.push(`    missingFromEvent: ${inspectionEntry.diagnostics.linkedEscortMissingFromEventUnitKeys.join(", ")}`);
            }
            if (inspectionEntry.diagnostics.oppositionCapFlightUnitKeys.length > 0) {
                lines.push(`    oppositionLaneCAP: ${inspectionEntry.diagnostics.oppositionCapFlightUnitKeys.join(", ")}`);
            }
            inspectionEntry.report.phases.forEach((phase) => {
                const metrics = inspectionEntry.phaseMetrics.find((entry) => entry.label === phase.label);
                lines.push(`  phase ${phase.label} ${phase.durationMs}ms assignments=${phase.assignments.length} tracers=${phase.tracers.length}` +
                    (metrics
                        ? ` box=${Math.round(metrics.widthPx)}x${Math.round(metrics.heightPx)} path=${Math.round(metrics.meanPathLengthPx)} disp=${Math.round(metrics.meanDisplacementPx)} eff=${Math.round(metrics.meanEfficiency * 100)}%` +
                            ` speed=${Math.round(metrics.meanSpeedPxPerSec)}` +
                            ` turn=${Math.round(metrics.meanEntryTurnAngleDeg)}/${Math.round(metrics.maxEntryTurnAngleDeg)}` +
                            ` pathTurn=${Math.round(metrics.meanWaypointTurnAngleDeg)}/${Math.round(metrics.maxWaypointTurnAngleDeg)}` +
                            ` firstTurn=${Math.round(metrics.meanFirstWaypointTurnAngleDeg)}/${Math.round(metrics.maxFirstWaypointTurnAngleDeg)}` +
                            ` tracerLen=${Math.round(metrics.meanTracerLengthPx)}/${Math.round(metrics.meanVisibleTracerLengthPx)} tracerFan=${Math.round(metrics.meanTracerFanSpanPx)}` +
                            ` tracerAlign=${Math.round(metrics.meanTracerAlignmentDeg)}/${Math.round(metrics.maxTracerAlignmentDeg)}` +
                            ` tracerRange=${Math.round(metrics.meanTracerRangePx)}/${Math.round(metrics.maxTracerRangePx)}` +
                            (metrics.flakBurstCount > 0
                                ? ` flak=${metrics.flakBurstCount}x${metrics.flakFlashCount}/${metrics.flakPuffCount} belt=${Math.round(metrics.meanFlakWidthPx)}x${Math.round(metrics.meanFlakHeightPx)}`
                                : "")
                        : ""));
                metrics?.groupMetrics.forEach((group) => {
                    lines.push(`    group ${group.label}: n=${group.assignmentCount} start=${formatPoint(group.centroidStart)} ` +
                        `mid=${formatPoint(group.centroidMid)} end=${formatPoint(group.centroidEnd)} ` +
                        `path=${Math.round(group.meanPathLengthPx)} disp=${Math.round(group.meanDisplacementPx)} eff=${Math.round(group.meanEfficiency * 100)}% speed=${Math.round(group.meanSpeedPxPerSec)}`);
                });
                metrics?.relationMetrics.forEach((relation) => {
                    lines.push(`    relation ${relation.fromLabel} -> ${relation.toLabel}: ` +
                        `sep(start=${Math.round(relation.separationStartPx)}, mid=${Math.round(relation.separationMidPx)}, end=${Math.round(relation.separationEndPx)}) ` +
                        `closestMid=${Math.round(relation.minMidPairSeparationPx)} angle=${Math.round(relation.approachAngleDeg)}`);
                });
                phase.assignments.slice(0, 6).forEach((assignment) => {
                    const compactPoints = sampleInspectionPath(assignment.points, 7)
                        .map((sample) => sample.point)
                        .map((point) => `(${Math.round(point.cx)},${Math.round(point.cy)})`)
                        .join(" -> ");
                    lines.push(`    ${assignment.actorId}: ${compactPoints}`);
                });
                metrics?.tracerMetrics.slice(0, 4).forEach((tracer) => {
                    const fanLabel = tracer.leftFanEndPoint && tracer.rightFanEndPoint
                        ? ` fan=${formatPoint(tracer.leftFanEndPoint)} | ${formatPoint(tracer.centerlineEndPoint)} | ${formatPoint(tracer.rightFanEndPoint)}`
                        : ` centerline=${formatPoint(tracer.centerlineEndPoint)}`;
                    lines.push(`    tracer ${Math.round(tracer.progress * 100)}% ${tracer.sourceActorId} ${tracer.emitter} ` +
                        `heading=${Math.round(tracer.sourceHeadingDegrees)} len=${Math.round(tracer.streakLengthPx)}/${Math.round(tracer.visibleLengthPx)} fanHalf=${Math.round(tracer.fanHalfAngleDeg)} ` +
                        `width=${tracer.width?.toFixed(2) ?? "?"} life=${Math.round(tracer.lifetimeMs ?? 0)} ` +
                        `emit=${formatPoint(tracer.emitterPoint)}${fanLabel}` +
                        (tracer.targetPoint ? ` targetRef=${formatPoint(tracer.targetPoint)}` : "") +
                        (typeof tracer.targetAlignmentDeg === "number" ? ` align=${Math.round(tracer.targetAlignmentDeg)}` : "") +
                        (typeof tracer.targetRangePx === "number" ? ` range=${Math.round(tracer.targetRangePx)}` : ""));
                });
                metrics?.flakMetrics.slice(0, 3).forEach((flak) => {
                    lines.push(`    flak ${Math.round(flak.progress * 100)}% center=${formatPoint(flak.burstCenter)} ` +
                        `flash/puffs=${flak.flashCount}/${flak.puffCount}/${flak.smokePuffCount} ` +
                        `belt=${Math.round(flak.widthPx)}x${Math.round(flak.heightPx)}`);
                });
            });
        });
        lines.push("");
    }
    lines.push("Diagnostics:");
    if (result.findings.length > 0) {
        result.findings.forEach((finding) => {
            lines.push(`- [${finding.code}] ${finding.message}`);
        });
    }
    else {
        lines.push("- none");
    }
    lines.push("");
    if (result.anomalies.length > 0) {
        lines.push("Anomalies:");
        result.anomalies.forEach((anomaly) => {
            lines.push(`- [${anomaly.code}] ${anomaly.message}`);
        });
    }
    else {
        lines.push("Anomalies:");
        lines.push("- none");
    }
    return lines.join("\n");
}
