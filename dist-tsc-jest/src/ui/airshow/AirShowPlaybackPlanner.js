import { HEX_HEIGHT } from "../../core/balance";
import { buildAirShowInspectionOriginPlan, buildAirShowPhaseTimingAudit, resolveAirShowFallbackOrigin } from "./AirShowPlanner";
function describePlannedAirShowFlight(flight) {
    return {
        id: flight.spec.id,
        role: flight.spec.role,
        combatRole: flight.spec.combatRole,
        faction: flight.spec.faction,
        scenarioType: flight.spec.scenarioType,
        originHexKey: flight.spec.originHexKey,
        strengthBefore: flight.spec.strengthBefore,
        strengthAfterEscortPhase: flight.spec.strengthAfterEscortPhase,
        finalStrength: flight.spec.finalStrength,
        laneOffsetPx: flight.spec.laneOffsetPx,
        actors: flight.actors.map((actor) => ({
            actorId: actor.id,
            flightId: actor.flightId,
            role: actor.role,
            active: actor.active,
            headingDegrees: actor.headingDegrees,
            position: { cx: actor.position.cx, cy: actor.position.cy },
            size: actor.size,
            formationIndex: actor.formationIndex,
            biasX: actor.biasX,
            biasY: actor.biasY
        }))
    };
}
export function planResolvedAirCombatShowScene(host, scene) {
    const center = host.resolveHexCenterByKey(scene.hexKey);
    if (!center) {
        return null;
    }
    const hqAxis = host.resolveHqAxis(scene.playerHqKey, scene.botHqKey);
    const mapBounds = hqAxis?.mapBounds ?? host.resolveAirShowMapBounds();
    const fallbackOriginFor = (spec) => spec.faction === "Bot"
        ? (hqAxis?.botOrigin ?? resolveAirShowFallbackOrigin(center, "Bot", mapBounds, { offsetPx: host.offMapDistancePx, hexHeight: HEX_HEIGHT }))
        : (hqAxis?.playerOrigin ?? resolveAirShowFallbackOrigin(center, spec.faction, mapBounds, { offsetPx: host.offMapDistancePx, hexHeight: HEX_HEIGHT }));
    const defaultHeadingFor = (origin) => host.resolveAircraftHeadingDegrees(center.cx - origin.cx, center.cy - origin.cy);
    const interceptorFlights = scene.interceptors
        .map((spec) => host.buildAirShowPlannedFlight(spec, fallbackOriginFor(spec), defaultHeadingFor(fallbackOriginFor(spec))))
        .filter((flight) => !!flight);
    const escortFlights = scene.escorts
        .map((spec) => host.buildAirShowPlannedFlight(spec, fallbackOriginFor(spec), defaultHeadingFor(fallbackOriginFor(spec))))
        .filter((flight) => !!flight);
    const bomberSpecs = host.resolveSceneBomberSpecs(scene);
    const bomberSpecsById = new Map(bomberSpecs.map((spec) => [spec.id, spec]));
    const bomberFlights = bomberSpecs
        .map((spec) => host.buildAirShowPlannedFlight(spec, fallbackOriginFor(spec), defaultHeadingFor(fallbackOriginFor(spec))))
        .filter((flight) => !!flight);
    const allFlights = [...interceptorFlights, ...escortFlights, ...bomberFlights];
    if (allFlights.length === 0) {
        return null;
    }
    const flightMap = new Map(allFlights.map((flight) => [flight.spec.id, flight]));
    const sceneActors = allFlights.flatMap((flight) => flight.actors);
    const sceneSeed = host.seedFromHexKey(`${scene.hexKey}:airshow:${scene.interceptors.length}:${scene.escorts.length}:${bomberSpecs.map((spec) => spec.id).join(",") || "none"}`);
    const stageRandom = (label) => host.seededRandom(host.seedFromHexKey(`${sceneSeed}:${label}`));
    const bomberTargetCentersById = new Map(bomberSpecs
        .map((spec) => [spec.id, host.resolveAirShowBomberTargetCenter(spec, scene)])
        .filter((entry) => !!entry[1]));
    const averageBomberAnchor = host.averageAirShowPoints(bomberFlights.map((flight) => host.averageAirShowPosition(flight.actors) ?? flight.anchor)) ?? null;
    const averageBomberTargetCenter = host.averageAirShowPoints(Array.from(bomberTargetCentersById.values())) ?? null;
    const corridor = host.resolveAirShowCorridor(center, averageBomberAnchor, averageBomberTargetCenter, hqAxis);
    host.normalizeAirShowSceneFlightAnchors(corridor, scene.kind, interceptorFlights, escortFlights, bomberFlights, hqAxis);
    const runtimeSeedFlights = allFlights.map((flight) => describePlannedAirShowFlight(flight));
    const initialBomberApproachProfilesById = host.resolveAirShowBomberApproachProfiles(bomberFlights, corridor, bomberTargetCentersById, averageBomberTargetCenter, stageRandom);
    const fighterIngressSeedDurationMs = host.clamp(Math.round(scene.fighterIngressDurationMs ?? 2520), 1250, 13250);
    const egressHeadingByFlightId = new Map();
    const corridorPoint = (alongPx, lateralPx = 0) => host.projectAirShowCorridorPoint(corridor, alongPx, lateralPx);
    const updateFlightAnchors = (flights) => {
        flights.forEach((flight) => {
            flight.anchor = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        });
    };
    const activeFlights = (flights) => flights.filter((flight) => flight.actors.some((actor) => actor.active));
    const phases = [];
    const phaseTimingAudit = [];
    let previousPhaseAssignments = [];
    let previousPhaseDurationMs = 0;
    const recordPhase = (label, assignments, durationMs, tracerBursts = [], flakBursts = [], roleTargetSpeeds = host.resolveAirShowRoleSpeedMap(), visibleActorIds) => {
        const assignmentsByActorId = host.buildAirShowAssignmentLookup(assignments);
        const sampleFlightCenterAtTime = (flightId, timeMs) => {
            if (!flightId) {
                return null;
            }
            const flight = flightMap.get(flightId);
            if (!flight) {
                return null;
            }
            const sampledActorPositions = flight.actors.map((actor) => {
                const assignment = assignmentsByActorId.get(actor.id);
                return assignment
                    ? host.sampleAirShowAssignmentAtTime(assignment, timeMs, durationMs).position
                    : actor.position;
            });
            return host.averageAirShowPoints(sampledActorPositions);
        };
        const activeSceneActorIds = sceneActors
            .filter((actor) => actor.active)
            .map((actor) => actor.id)
            .filter((actorId) => actorId.length > 0);
        const resolvedVisibleActorIds = Array.from(new Set([
            ...(visibleActorIds ?? assignments.map((assignment) => assignment.actor.id)).filter((actorId) => actorId.length > 0),
            ...activeSceneActorIds
        ]));
        phases.push({
            label,
            durationMs,
            visibleActorIds: resolvedVisibleActorIds,
            assignments: assignments.map((assignment) => {
                const sampledPositions = [];
                const sampleCount = Math.max(4, Math.ceil(durationMs / 250));
                for (let i = 0; i <= sampleCount; i += 1) {
                    const progress = i / sampleCount;
                    const timeMs = Math.round(progress * durationMs);
                    const sample = host.sampleAirShowAssignmentAtTime(assignment, timeMs, durationMs);
                    sampledPositions.push({
                        timeMs,
                        progress,
                        pathProgress: sample.pathProgress,
                        cx: Math.round(sample.position.cx * 10) / 10,
                        cy: Math.round(sample.position.cy * 10) / 10,
                        headingDegrees: Math.round(sample.headingDegrees * 10) / 10
                    });
                }
                return {
                    actorId: assignment.actor.id,
                    flightId: assignment.actor.flightId,
                    role: assignment.actor.role,
                    points: assignment.points.map((point) => ({ cx: point.cx, cy: point.cy })),
                    sampledPositions,
                    headingBlend: assignment.headingBlend,
                    multiFlightOffsetPx: assignment.multiFlightOffsetPx,
                    progressOffset: assignment.progressOffset,
                    distanceBudgetPx: assignment.distanceBudgetPx,
                    progressTimeline: assignment.progressTimeline?.map((keyframe) => ({
                        timeMs: keyframe.timeMs,
                        progress: keyframe.progress
                    }))
                };
            }),
            tracers: tracerBursts.flatMap((burst) => {
                const sourceAssignment = assignmentsByActorId.get(burst.source.id);
                const sampledSource = sourceAssignment
                    ? host.sampleAirShowAssignmentAtTime(sourceAssignment, burst.progress * durationMs, durationMs)
                    : {
                        position: burst.source.position,
                        headingDegrees: burst.source.headingDegrees,
                        size: burst.source.size,
                        pathProgress: burst.progress
                    };
                const targetAssignment = "id" in burst.target
                    ? assignmentsByActorId.get(burst.target.id)
                    : undefined;
                const sampledTargetPoint = "id" in burst.target
                    ? (targetAssignment
                        ? host.sampleAirShowAssignmentAtTime(targetAssignment, burst.progress * durationMs, durationMs).position
                        : burst.target.position)
                    : burst.target;
                if (sampledTargetPoint
                    && !host.shouldRenderAirShowTracerBurst(sampledSource, sampledTargetPoint, burst)) {
                    return [];
                }
                const geometry = host.resolveAirShowTracerBurstGeometry(sampledSource, burst, sampledTargetPoint);
                return [{
                        progress: burst.progress,
                        sourceActorId: burst.source.id,
                        targetActorId: "id" in burst.target ? burst.target.id : undefined,
                        targetPoint: sampledTargetPoint ? { cx: sampledTargetPoint.cx, cy: sampledTargetPoint.cy } : undefined,
                        emitter: burst.emitter,
                        emitterPoint: { cx: geometry.emitterPoint.cx, cy: geometry.emitterPoint.cy },
                        sourceHeadingDegrees: geometry.sourceHeadingDegrees,
                        color: burst.color,
                        width: burst.width,
                        lifetimeMs: burst.lifetimeMs,
                        burstCount: burst.burstCount,
                        spreadPx: burst.spreadPx,
                        streakLengthPx: geometry.streakLengthPx,
                        visibleLengthPx: geometry.visibleLengthPx,
                        fanHalfAngleDeg: geometry.fanHalfAngleDeg,
                        centerlineEndPoint: {
                            cx: geometry.centerlineEndPoint.cx,
                            cy: geometry.centerlineEndPoint.cy
                        },
                        leftFanEndPoint: geometry.leftFanEndPoint
                            ? { cx: geometry.leftFanEndPoint.cx, cy: geometry.leftFanEndPoint.cy }
                            : undefined,
                        rightFanEndPoint: geometry.rightFanEndPoint
                            ? { cx: geometry.rightFanEndPoint.cx, cy: geometry.rightFanEndPoint.cy }
                            : undefined
                    }];
            }),
            flakBursts: flakBursts.map((burst) => {
                const burstTimeMs = host.clamp(burst.progress, 0, 1) * durationMs;
                const bomberPathCenter = sampleFlightCenterAtTime(burst.bomberUnitKey ?? null, burstTimeMs);
                const targetHexCenter = burst.targetHexKey ? host.resolveHexCenterByKey(burst.targetHexKey) : null;
                const bomberTargetCenter = burst.bomberUnitKey ? bomberTargetCentersById.get(burst.bomberUnitKey) ?? null : null;
                const targetSource = bomberPathCenter
                    ? "bomberPath"
                    : targetHexCenter
                        ? "targetHex"
                        : bomberTargetCenter
                            ? "bomberTarget"
                            : averageBomberTargetCenter
                                ? "averageBomberTarget"
                                : "corridorStrike";
                const scopedTargetCenter = bomberPathCenter
                    ?? targetHexCenter
                    ?? bomberTargetCenter
                    ?? averageBomberTargetCenter
                    ?? corridor.strike;
                const wave = host.resolveAirShowFlakBurstWave(corridor, scopedTargetCenter, burst);
                const xs = wave.points.map((point) => point.cx);
                const ys = wave.points.map((point) => point.cy);
                return {
                    progress: burst.progress,
                    bomberUnitKey: burst.bomberUnitKey ?? null,
                    targetHexKey: burst.targetHexKey ?? null,
                    targetCenter: { cx: scopedTargetCenter.cx, cy: scopedTargetCenter.cy },
                    targetSource,
                    burstCenter: { cx: wave.center.cx, cy: wave.center.cy },
                    flashCount: wave.flashCount,
                    puffCount: wave.puffCount,
                    smokePuffCount: wave.smokePuffCount,
                    widthPx: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
                    heightPx: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0,
                    points: wave.points.map((point) => ({ cx: point.cx, cy: point.cy }))
                };
            })
        });
        phaseTimingAudit.push(buildAirShowPhaseTimingAudit(label, durationMs, assignments.map((assignment) => ({
            role: assignment.actor.role,
            pathLengthPx: host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, durationMs),
            activeDurationMs: host.resolveAirShowAssignmentActiveDurationMs(assignment, durationMs)
        })), roleTargetSpeeds));
        host.applyPlannedAirShowAssignments(assignments, durationMs);
    };
    const visibleBounds = host.resolveAirShowVisibleBounds();
    const compactEgressLaneStepPx = visibleBounds && Math.max(0, visibleBounds.maxX - visibleBounds.minX) <= 1500
        ? 46
        : 64;
    const resolveFighterHomePoint = (flight, index, totalFlights) => {
        const rand = stageRandom(`fighter-home:${flight.spec.id}:${index}`);
        const laneOffset = (index - (totalFlights - 1) / 2) * compactEgressLaneStepPx;
        if (hqAxis) {
            const origin = flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin;
            return host.offsetAirShowPoint(origin, corridor.normal.x * laneOffset + (rand() - 0.5) * 22, corridor.normal.y * laneOffset + (rand() - 0.5) * 18);
        }
        return host.offsetAirShowPoint(fallbackOriginFor(flight.spec), corridor.normal.x * laneOffset + (rand() - 0.5) * 22, corridor.normal.y * laneOffset + (rand() - 0.5) * 18);
    };
    const resolveFighterHomeLaneContext = (flight, fighterFlights) => {
        const homeFlights = fighterFlights.filter((candidate) => candidate.spec.faction === flight.spec.faction);
        const groupedIndex = homeFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id);
        if (groupedIndex >= 0 && homeFlights.length > 0) {
            return {
                index: groupedIndex,
                totalFlights: homeFlights.length
            };
        }
        const fallbackIndex = Math.max(0, fighterFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id));
        return {
            index: fallbackIndex,
            totalFlights: Math.max(1, fighterFlights.length)
        };
    };
    const normalizeVector = (x, y, fallbackX = 0, fallbackY = -1) => {
        const length = Math.hypot(x, y);
        if (length >= 0.001) {
            return { x: x / length, y: y / length };
        }
        const fallbackLength = Math.hypot(fallbackX, fallbackY);
        if (fallbackLength >= 0.001) {
            return { x: fallbackX / fallbackLength, y: fallbackY / fallbackLength };
        }
        return { x: 0, y: -1 };
    };
    const resolveHeadingVector = (headingDegrees, fallback) => {
        if (typeof headingDegrees !== "number") {
            return fallback;
        }
        const radians = ((headingDegrees - 90) * Math.PI) / 180;
        return normalizeVector(Math.cos(radians), Math.sin(radians), fallback.x, fallback.y);
    };
    const buildForwardContinuousRoutePath = (start, end, options = {}) => {
        const dx = end.cx - start.cx;
        const dy = end.cy - start.cy;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance <= 24) {
            return [start, end];
        }
        const routeForward = normalizeVector(dx, dy, 0, -1);
        const routeNormal = { x: -routeForward.y, y: routeForward.x };
        const headingForward = resolveHeadingVector(options.startHeadingDegrees, routeForward);
        const minRouteDot = options.minRouteDot ?? 0.22;
        const dot = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
        const routeBlend = dot >= minRouteDot
            ? 0
            : host.clamp((minRouteDot - dot) / (1 - Math.max(-1, dot)), 0.42, 0.96);
        const breakawayForward = routeBlend <= 0
            ? headingForward
            : normalizeVector(headingForward.x * (1 - routeBlend) + routeForward.x * routeBlend, headingForward.y * (1 - routeBlend) + routeForward.y * routeBlend, routeForward.x, routeForward.y);
        const reversalFactor = dot >= minRouteDot
            ? 0
            : host.clamp((minRouteDot - dot) / (1 - Math.max(-1, dot)), 0, 1);
        const lateralSign = (options.lateralSign ?? 1) >= 0 ? 1 : -1;
        const carryForwardPx = host.clamp(Math.round(options.carryForwardPx ?? distance * (0.14 + reversalFactor * 0.08)), 24, Math.max(64, Math.round(distance * 0.28)));
        const earlyAlongPx = host.clamp(Math.round(options.earlyAlongPx ?? distance * (0.24 + reversalFactor * 0.06)), carryForwardPx, Math.max(carryForwardPx + 12, Math.round(distance * 0.44)));
        const midAlongPx = host.clamp(Math.round(options.midAlongPx ?? distance * 0.58), earlyAlongPx + 18, Math.max(earlyAlongPx + 18, Math.round(distance * 0.8)));
        const lateAlongPx = host.clamp(Math.round(options.lateAlongPx ?? distance * 0.84), midAlongPx + 18, Math.max(midAlongPx + 18, Math.round(distance * 0.96)));
        const entryLateralPx = options.entryLateralPx
            ?? Math.min(Math.max(18, distance * 0.08), Math.max(42, distance * 0.18));
        const midLateralPx = options.midLateralPx
            ?? Math.min(entryLateralPx * (0.34 + reversalFactor * 0.08), Math.max(16, distance * 0.1));
        const lateLateralPx = options.lateLateralPx
            ?? Math.min(entryLateralPx * 0.12, Math.max(6, distance * 0.03));
        const carryPoint = host.offsetAirShowPoint(start, breakawayForward.x * carryForwardPx + routeNormal.x * lateralSign * entryLateralPx * 0.18, breakawayForward.y * carryForwardPx + routeNormal.y * lateralSign * entryLateralPx * 0.18);
        const earlyPoint = host.offsetAirShowPoint(start, routeForward.x * earlyAlongPx + routeNormal.x * lateralSign * entryLateralPx, routeForward.y * earlyAlongPx + routeNormal.y * lateralSign * entryLateralPx);
        const midPoint = host.offsetAirShowPoint(start, routeForward.x * midAlongPx + routeNormal.x * lateralSign * midLateralPx, routeForward.y * midAlongPx + routeNormal.y * lateralSign * midLateralPx);
        const latePoint = host.offsetAirShowPoint(start, routeForward.x * lateAlongPx + routeNormal.x * lateralSign * lateLateralPx, routeForward.y * lateAlongPx + routeNormal.y * lateralSign * lateLateralPx);
        return [start, carryPoint, earlyPoint, midPoint, latePoint, end].filter((point, index, points) => {
            if (index === 0) {
                return true;
            }
            const previous = points[index - 1];
            return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
        });
    };
    const collectStableTailHeadingsByFlightId = (assignments, durationMs, sampleStartProgress = 0.72, sampleEndProgress = 0.92) => {
        const headingsByFlightId = new Map();
        assignments.forEach((assignment) => {
            const startSample = host.sampleAirShowAssignmentAtTime(assignment, durationMs * sampleStartProgress, durationMs);
            const endSample = host.sampleAirShowAssignmentAtTime(assignment, durationMs * sampleEndProgress, durationMs);
            const dx = endSample.position.cx - startSample.position.cx;
            const dy = endSample.position.cy - startSample.position.cy;
            const headingDegrees = host.resolveAircraftHeadingDegrees(dx, dy, endSample.headingDegrees);
            const forward = resolveHeadingVector(headingDegrees, { x: 0, y: -1 });
            const entries = headingsByFlightId.get(assignment.actor.flightId) ?? [];
            entries.push({ x: forward.x, y: forward.y, fallback: headingDegrees });
            headingsByFlightId.set(assignment.actor.flightId, entries);
        });
        return new Map(Array.from(headingsByFlightId.entries()).map(([flightId, headings]) => {
            const vector = headings.reduce((acc, heading) => {
                acc.x += heading.x;
                acc.y += heading.y;
                return acc;
            }, { x: 0, y: 0 });
            return [
                flightId,
                host.resolveAircraftHeadingDegrees(vector.x, vector.y, headings[0]?.fallback ?? 0)
            ];
        }));
    };
    const buildFighterPeelAssignments = (fighterFlights, durationMs, tailHeadingByFlightId) => fighterFlights.flatMap((flight, index) => {
        const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const peelRand = stageRandom(`fighter-peel:${flight.spec.id}:${index}`);
        const fighterHomeLaneContext = resolveFighterHomeLaneContext(flight, fighterFlights);
        const egressHeadingDegrees = tailHeadingByFlightId.get(flight.spec.id) ?? host.resolveAirShowFlightHeadingDegrees(flight);
        const fullEgressPoint = resolveFighterHomePoint(flight, fighterHomeLaneContext.index, fighterHomeLaneContext.totalFlights);
        const homeDx = fullEgressPoint.cx - current.cx;
        const homeDy = fullEgressPoint.cy - current.cy;
        const homeDistancePx = Math.max(1, Math.hypot(homeDx, homeDy));
        const homeForward = { x: homeDx / homeDistancePx, y: homeDy / homeDistancePx };
        const homeNormal = { x: -homeForward.y, y: homeForward.x };
        const headingForward = resolveHeadingVector(egressHeadingDegrees, homeForward);
        const headingRouteDot = headingForward.x * homeForward.x + headingForward.y * homeForward.y;
        const peelSideSign = host.resolveAirShowRouteSideSign(current, fullEgressPoint, egressHeadingDegrees, flight.spec.role === "escort" ? 1 : -1);
        const peelCoverageRatio = flight.spec.role === "escort" ? 0.9 : 0.78;
        const peelMinForwardPx = flight.spec.role === "escort" ? 240 : 180;
        const peelMaxForwardPx = flight.spec.role === "escort" ? 620 : 460;
        const peelForwardPx = host.clamp(Math.round(durationMs
            * host.airShowFighterSpeedPxPerMs
            * (flight.spec.role === "escort" ? 0.98 : 0.9)), peelMinForwardPx, Math.max(peelMinForwardPx, Math.min(peelMaxForwardPx, homeDistancePx * peelCoverageRatio)));
        const laneOffset = (index - (fighterFlights.length - 1) / 2) * compactEgressLaneStepPx * 0.34;
        const peelLateralPx = laneOffset
            + peelSideSign * (flight.spec.role === "escort" ? 52 : 42)
            + (peelRand() - 0.5) * 10;
        const peelTarget = host.offsetAirShowPoint(current, homeForward.x * peelForwardPx + homeNormal.x * peelLateralPx, homeForward.y * peelForwardPx + homeNormal.y * peelLateralPx);
        const peelCarryPx = Math.min(Math.max(38, peelForwardPx * 0.18), Math.max(72, peelForwardPx * 0.3));
        const peelPathSource = headingRouteDot < 0.1
            ? [
                current,
                host.offsetAirShowPoint(current, headingForward.x * (peelCarryPx * 0.36) + homeNormal.x * peelSideSign * 22, headingForward.y * (peelCarryPx * 0.36) + homeNormal.y * peelSideSign * 22),
                host.offsetAirShowPoint(current, headingForward.x * peelCarryPx + homeNormal.x * peelSideSign * (Math.abs(peelLateralPx) * 0.78 + 22), headingForward.y * peelCarryPx + homeNormal.y * peelSideSign * (Math.abs(peelLateralPx) * 0.78 + 22)),
                host.offsetAirShowPoint(current, homeForward.x * Math.max(58, peelForwardPx * 0.46) + homeNormal.x * peelLateralPx, homeForward.y * Math.max(58, peelForwardPx * 0.46) + homeNormal.y * peelLateralPx),
                host.offsetAirShowPoint(current, homeForward.x * Math.max(112, peelForwardPx * 0.82) + homeNormal.x * peelLateralPx * 0.42, homeForward.y * Math.max(112, peelForwardPx * 0.82) + homeNormal.y * peelLateralPx * 0.42),
                peelTarget
            ]
            : buildForwardContinuousRoutePath(current, peelTarget, {
                startHeadingDegrees: egressHeadingDegrees,
                lateralSign: peelSideSign,
                minRouteDot: -0.25,
                carryForwardPx: peelCarryPx,
                earlyAlongPx: Math.max(52, peelForwardPx * 0.38),
                midAlongPx: Math.max(90, peelForwardPx * 0.7),
                lateAlongPx: Math.max(126, peelForwardPx * 0.9),
                entryLateralPx: Math.abs(peelLateralPx) + 34,
                midLateralPx: Math.abs(peelLateralPx) * 0.56 + 18,
                lateLateralPx: Math.abs(peelLateralPx) * 0.18 + 8
            });
        const peelPath = host.sanitizeAirShowEntryPath(peelPathSource, {
            maxTurnDeg: 54,
            strongTurnDeg: 94,
            maxFirstSegmentPx: 92,
            maxSharpTurnDeg: 118,
            maxWaypointsToRemove: 2
        });
        return host.buildAirShowFlightAssignments(flight, peelPath, 0.24, index, fighterFlights.length);
    });
    const buildFighterEgressAssignments = (fighterFlights) => fighterFlights.flatMap((flight, index) => {
        const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const rand = stageRandom(`fighter-egress:${flight.spec.id}:${index}`);
        const fighterHomeLaneContext = resolveFighterHomeLaneContext(flight, fighterFlights);
        const egressHeadingDegrees = host.resolveAirShowFlightHeadingDegrees(flight);
        const egressPoint = resolveFighterHomePoint(flight, fighterHomeLaneContext.index, fighterHomeLaneContext.totalFlights);
        const egressLateralSign = host.resolveAirShowRouteSideSign(current, egressPoint, egressHeadingDegrees, flight.spec.role === "escort" ? 1 : -1);
        const egressPath = host.sanitizeAirShowEntryPath(buildForwardContinuousRoutePath(current, egressPoint, {
            startHeadingDegrees: egressHeadingDegrees,
            lateralSign: egressLateralSign,
            minRouteDot: 0.2,
            carryForwardPx: 56 + rand() * 18,
            entryLateralPx: 28 + rand() * 10,
            midLateralPx: 12 + rand() * 6,
            lateLateralPx: 4 + rand() * 3
        }), {
            maxTurnDeg: 52,
            strongTurnDeg: 90,
            maxFirstSegmentPx: 88,
            maxSharpTurnDeg: 116,
            maxWaypointsToRemove: 2
        });
        return host.buildAirShowFlightAssignments(flight, egressPath, 0.26, index, fighterFlights.length);
    });
    const buildBomberEgressAssignments = (bomberFlightsForPhase) => bomberFlightsForPhase.flatMap((flight, index) => {
        const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const rand = stageRandom(`bomber-egress:${flight.spec.id}:${index}`);
        const egressHeadingDegrees = egressHeadingByFlightId.get(flight.spec.id) ?? host.resolveAirShowFlightHeadingDegrees(flight);
        const phaseBoundaryHeadingDegrees = host.resolveAirShowFlightHeadingDegrees(flight);
        const egressPoint = (() => {
            const originCenter = hqAxis
                ? (flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin)
                : host.resolveHexCenterByKey(flight.spec.originHexKey);
            if (originCenter) {
                return host.offsetAirShowPoint(originCenter, (rand() - 0.5) * 22, (rand() - 0.5) * 18);
            }
            return host.offsetAirShowPoint(fallbackOriginFor(flight.spec), corridor.normal.x * (rand() - 0.5) * 18, corridor.normal.y * (rand() - 0.5) * 18);
        })();
        const egressLateralSign = host.resolveAirShowRouteSideSign(current, egressPoint, egressHeadingDegrees, -1);
        const homeDx = egressPoint.cx - current.cx;
        const homeDy = egressPoint.cy - current.cy;
        const homeDistancePx = Math.max(1, Math.hypot(homeDx, homeDy));
        const homeForward = normalizeVector(homeDx, homeDy, 0, -1);
        const headingForward = resolveHeadingVector(phaseBoundaryHeadingDegrees, homeForward);
        const headingRouteDot = headingForward.x * homeForward.x + headingForward.y * homeForward.y;
        const rawEgressPath = headingRouteDot > -0.18 && homeDistancePx <= 380
            ? buildForwardContinuousRoutePath(current, egressPoint, {
                startHeadingDegrees: egressHeadingDegrees,
                lateralSign: egressLateralSign,
                minRouteDot: -0.28,
                carryForwardPx: 54 + rand() * 18,
                earlyAlongPx: Math.max(62, homeDistancePx * 0.28),
                midAlongPx: Math.max(112, homeDistancePx * 0.58),
                lateAlongPx: Math.max(162, homeDistancePx * 0.84),
                entryLateralPx: 18 + rand() * 6,
                midLateralPx: 8 + rand() * 4,
                lateLateralPx: 3 + rand() * 2
            })
            : host.buildAirShowDisengagePath(current, egressPoint, {
                startHeadingDegrees: egressHeadingDegrees,
                lateralSign: egressLateralSign,
                corridorWidthPx: 16 + rand() * 4,
                driftPx: 10 + rand() * 4,
                preferForwardContinuous: true
            });
        const egressPath = host.sanitizeAirShowEntryPath(rawEgressPath, {
            maxTurnDeg: 44,
            strongTurnDeg: 78,
            maxFirstSegmentPx: 74,
            maxSharpTurnDeg: 104,
            maxWaypointsToRemove: 2
        });
        return host.buildAirShowFlightAssignments(flight, egressPath, 0.18, index, bomberFlightsForPhase.length);
    });
    const hasFighterIngressParticipants = interceptorFlights.length > 0 || escortFlights.length > 0;
    const fighterIngressPlan = hasFighterIngressParticipants
        ? host.buildContestedFighterIngressPlan(scene, corridor, interceptorFlights, escortFlights, fighterIngressSeedDurationMs, stageRandom)
        : null;
    const contestedBomberPhaseDurations = host.resolveAirShowContestedBomberPhaseDurations(bomberFlights, corridor, initialBomberApproachProfilesById, scene, stageRandom, fighterIngressPlan?.durationMs);
    const governedFighterIngressPlan = fighterIngressPlan
        ? host.retimeContestedFighterIngressPlan(fighterIngressPlan, contestedBomberPhaseDurations.fighterIngressDurationMs)
        : null;
    const plannedEscortMergeDurationMs = contestedBomberPhaseDurations.escortMergeDurationMs;
    const plannedEscortScrambleDurationMs = contestedBomberPhaseDurations.escortScrambleDurationMs;
    const plannedBomberIngressDurationMs = contestedBomberPhaseDurations.bomberIngressDurationMs;
    const plannedBomberDefenseDurationMs = contestedBomberPhaseDurations.bomberDefenseDurationMs;
    const contestedBomberMasterPaths = host.buildContestedBomberMasterPaths(bomberFlights, corridor, initialBomberApproachProfilesById, stageRandom);
    if (governedFighterIngressPlan) {
        const extendedFighterIngressAssignments = host.extendAirShowPhaseAssignmentsForSpeed([
            ...governedFighterIngressPlan.assignments,
            ...host.buildContestedBomberPhaseSliceAssignments(bomberFlights, contestedBomberMasterPaths, contestedBomberPhaseDurations, "fighter-ingress")
        ], governedFighterIngressPlan.durationMs, governedFighterIngressPlan.roleSpeeds, {
            clampCenter: corridor.center,
            orbitSignByRole: {
                interceptor: -1,
                escort: 1
            },
            extendAt: "end"
        });
        const preparedFighterIngressAssignments = host.prepareAirShowPhaseAssignments(extendedFighterIngressAssignments, governedFighterIngressPlan.durationMs, governedFighterIngressPlan.progressSamplePoints, 42, governedFighterIngressPlan.roleSpeeds, {
            harmonizeIngressVisibility: true
        });
        recordPhase("fighter-ingress", preparedFighterIngressAssignments, governedFighterIngressPlan.durationMs, [], [], governedFighterIngressPlan.roleSpeeds);
        previousPhaseAssignments = preparedFighterIngressAssignments;
        previousPhaseDurationMs = governedFighterIngressPlan.durationMs;
        updateFlightAnchors([...interceptorFlights, ...escortFlights, ...bomberFlights]);
    }
    const escortExchanges = scene.escortExchanges ?? [];
    if (escortExchanges.length > 0) {
        const rawEscortPairs = escortExchanges
            .map((exchange) => {
            const interceptorFlight = flightMap.get(exchange.defenderUnitKey);
            const escortFlight = flightMap.get(exchange.attackerUnitKey);
            if (!interceptorFlight || !escortFlight) {
                return null;
            }
            return { exchange, interceptorFlight, escortFlight };
        })
            .filter((entry) => !!entry);
        const uniqueEscortPairs = Array.from(new Map(rawEscortPairs.map((entry) => [
            `${entry.escortFlight.spec.id}:${entry.interceptorFlight.spec.id}`,
            entry
        ])).values()).map((entry, pairIndex) => ({
            ...entry,
            pairIndex
        }));
        if (uniqueEscortPairs.length > 0) {
            const escortBeatCount = 2;
            for (let beat = 0; beat < escortBeatCount; beat += 1) {
                const defaultEscortBeatDurationMs = beat === 0 ? plannedEscortMergeDurationMs : plannedEscortScrambleDurationMs;
                const phaseAssignments = [];
                const tracerBursts = [];
                const activeInterceptorFlights = activeFlights(interceptorFlights);
                const activeEscortFlights = activeFlights(escortFlights);
                const clashCenter = host.resolveAirShowEscortClashCenter(corridor, activeInterceptorFlights, activeEscortFlights, beat);
                activeInterceptorFlights.forEach((flight, index) => {
                    const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                    const laneIndex = index - (activeInterceptorFlights.length - 1) / 2;
                    const focusPoint = host.resolveAirShowEscortClashFocusPoint(corridor, "interceptor", beat, laneIndex, clashCenter);
                    const sideSign = host.resolveAirShowRouteSideSign(current, focusPoint, host.resolveAirShowFlightHeadingDegrees(flight), index <= (activeInterceptorFlights.length - 1) / 2 ? -1 : 1);
                    const path = beat === 0
                        ? host.buildAirShowMergePassPath(current, focusPoint, corridor, {
                            sideSign,
                            laneIndex,
                            startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                            entrySeparationPx: 74,
                            crossSeparationPx: 8,
                            overshootPx: 42
                        })
                        : host.buildAirShowPursuitPath(current, focusPoint, {
                            startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                            lateralSign: sideSign,
                            entryLateralPx: 14,
                            mergeLateralPx: 6,
                            attackOffsetPx: laneIndex * 4,
                            closeInPx: 6,
                            overshootPx: 10,
                            breakLateralPx: 12,
                            breakForwardPx: 8
                        });
                    phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, path, 0.26, index, activeInterceptorFlights.length));
                });
                activeEscortFlights.forEach((flight, index) => {
                    const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                    const laneIndex = index - (activeEscortFlights.length - 1) / 2;
                    const focusPoint = host.resolveAirShowEscortClashFocusPoint(corridor, "escort", beat, laneIndex, clashCenter);
                    const sideSign = host.resolveAirShowRouteSideSign(current, focusPoint, host.resolveAirShowFlightHeadingDegrees(flight), index >= (activeEscortFlights.length - 1) / 2 ? 1 : -1);
                    const path = beat === 0
                        ? host.buildAirShowMergePassPath(current, focusPoint, corridor, {
                            sideSign,
                            laneIndex,
                            startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                            entrySeparationPx: 70,
                            crossSeparationPx: 8,
                            overshootPx: 38
                        })
                        : host.buildAirShowBreakTurnPath(current, focusPoint, {
                            startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                            lateralSign: sideSign,
                            entryLateralPx: 10,
                            guardForwardPx: 6,
                            guardLateralPx: 14,
                            exitForwardPx: 16,
                            exitLateralPx: 20,
                            trailForwardPx: 8
                        });
                    phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, path, 0.24, index, activeEscortFlights.length));
                });
                const activeBomberFlights = activeFlights(bomberFlights);
                const escortClashRoleSpeeds = host.resolveAirShowRoleSpeedMap({
                    interceptor: host.airShowFighterSpeedPxPerMs,
                    escort: host.airShowFighterSpeedPxPerMs,
                    bomber: host.airShowBomberSpeedPxPerMs
                });
                const escortBeatDurationMs = defaultEscortBeatDurationMs;
                if (activeBomberFlights.length > 0) {
                    const bomberPhaseLabel = beat === 0 ? "escort-clash-merge" : "escort-clash-scramble";
                    const bomberPhaseAssignments = host.buildContestedBomberPhaseSliceAssignments(activeBomberFlights, contestedBomberMasterPaths, contestedBomberPhaseDurations, bomberPhaseLabel);
                    phaseAssignments.push(...bomberPhaseAssignments);
                }
                const extendedPhaseAssignments = beat === 1
                    ? host.extendAirShowPhaseAssignmentsForSpeed(phaseAssignments, escortBeatDurationMs, escortClashRoleSpeeds, {
                        clampCenter: corridor.center,
                        orbitSignByRole: {
                            interceptor: -1,
                            escort: 1
                        }
                    })
                    : phaseAssignments;
                const resolvedPhaseAssignments = host.prepareAirShowPhaseAssignments(extendedPhaseAssignments, escortBeatDurationMs, [0.3, 0.5, 0.7], beat === 0 ? 42 : 34, escortClashRoleSpeeds, {
                    previousAssignments: previousPhaseAssignments,
                    previousDurationMs: previousPhaseDurationMs,
                    entryTurnLimitDeg: beat === 0 ? 72 : 78
                });
                const timedPhaseAssignments = beat === 0
                    ? host.shapeCompactAirShowMergeAssignments(resolvedPhaseAssignments, escortBeatDurationMs)
                    : resolvedPhaseAssignments;
                uniqueEscortPairs.forEach((pair) => {
                    const baseTimings = beat === 0
                        ? [0.62, 0.7, 0.78, 0.86]
                        : [0.16, 0.28, 0.4, 0.52, 0.64, 0.76];
                    tracerBursts.push(...host.buildAirShowDynamicTracerVolley(timedPhaseAssignments, pair.interceptorFlight, pair.escortFlight, {
                        emitter: "nose",
                        color: "#fff5cf",
                        width: beat === 0 ? 0.62 : 0.58,
                        lifetimeMs: beat === 0 ? 42 : 40,
                        spreadPx: beat === 0 ? 6 : 8,
                        streakLengthPx: beat === 0 ? 128 : 140,
                        visibleLengthPx: beat === 0 ? 10 : 12,
                        fanHalfAngleDeg: 2,
                        burstCount: 3,
                        maxAlignmentDeg: beat === 0 ? 24 : 30,
                        maxRangePx: beat === 0 ? 136 : 152,
                        timings: baseTimings,
                        fallbackToNearest: true
                    }), ...host.buildAirShowDynamicTracerVolley(timedPhaseAssignments, pair.escortFlight, pair.interceptorFlight, {
                        emitter: "nose",
                        color: "#ffd98a",
                        width: beat === 0 ? 0.58 : 0.54,
                        lifetimeMs: beat === 0 ? 40 : 38,
                        spreadPx: beat === 0 ? 6 : 8,
                        streakLengthPx: beat === 0 ? 124 : 136,
                        visibleLengthPx: beat === 0 ? 10 : 11,
                        fanHalfAngleDeg: 2,
                        burstCount: 3,
                        maxAlignmentDeg: beat === 0 ? 24 : 30,
                        maxRangePx: beat === 0 ? 136 : 152,
                        timings: baseTimings.map((timing) => Math.min(0.78, timing + 0.02)),
                        fallbackToNearest: true
                    }));
                });
                recordPhase(beat === 0 ? "escort-clash-merge" : "escort-clash-scramble", timedPhaseAssignments, escortBeatDurationMs, tracerBursts, [], escortClashRoleSpeeds);
                previousPhaseAssignments = timedPhaseAssignments;
                previousPhaseDurationMs = escortBeatDurationMs;
                updateFlightAnchors([...interceptorFlights, ...escortFlights, ...bomberFlights]);
            }
            interceptorFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)));
            escortFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)));
            updateFlightAnchors([...interceptorFlights, ...escortFlights, ...bomberFlights]);
        }
    }
    else if (interceptorFlights.length + escortFlights.length > 1 && bomberFlights.length === 0) {
        // Only hold/drift when no bomber is present. If a bomber is approaching,
        // skip straight to defense positioning to avoid "linger and drift" effect
        // while the next bomber arrives.
        const idleAssignments = [
            ...host.buildAirShowBandAssignments(activeFlights(interceptorFlights), "escort-idle:interceptors", corridor, scene.kind, stageRandom, {
                alongPx: -92,
                lateralPx: -196,
                alongStepPx: 28,
                lateralStepPx: 42,
                jitterAlongPx: 0,
                jitterLateralPx: 0,
                arcPx: 15,
                driftPx: 18
            }),
            ...host.buildAirShowBandAssignments(activeFlights(escortFlights), "escort-idle:escorts", corridor, scene.kind, stageRandom, {
                alongPx: 12,
                lateralPx: 172,
                alongStepPx: 24,
                lateralStepPx: 38,
                jitterAlongPx: 0,
                jitterLateralPx: 0,
                arcPx: 15,
                driftPx: 18
            })
        ];
        recordPhase("escort-hold", idleAssignments, Math.max(520, Math.round((scene.escortClashDurationMs ?? 1500) * 0.55)), [], [], host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs
        }));
        updateFlightAnchors([...interceptorFlights, ...escortFlights]);
    }
    const survivingInterceptors = activeFlights(interceptorFlights);
    const survivingEscorts = activeFlights(escortFlights);
    const survivingBombers = activeFlights(bomberFlights).filter((flight) => (flight.currentStrength ?? flight.spec.finalStrength ?? 0) > 0);
    const bomberApproachProfilesById = host.resolveAirShowBomberApproachProfiles(survivingBombers, corridor, bomberTargetCentersById, averageBomberTargetCenter, stageRandom);
    // Inspection path: BomberGap suppressed when bombers are present (mirrors runtime fix).
    if (survivingBombers.length === 0
        && (scene.bomberArrivalDelayMs ?? 0) > 0
        && (scene.escortExchanges?.length ?? 0) > 0
        && (survivingInterceptors.length > 0 || survivingEscorts.length > 0)) {
        const bomberGapAssignments = [
            ...survivingInterceptors.flatMap((flight, index) => host.buildAirShowFlightAssignments(flight, host.buildAirShowScreenRunPath(host.averageAirShowPosition(flight.actors) ?? flight.anchor, corridor, {
                endAlongPx: -96,
                baseLateralPx: -118,
                laneIndex: index - (survivingInterceptors.length - 1) / 2,
                sideSign: -1,
                alongStepPx: 16,
                lateralStepPx: 28,
                corridorWidthPx: 18,
                driftPx: 18,
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight)
            }), 0.28, index, survivingInterceptors.length)),
            ...survivingEscorts.flatMap((flight, index) => host.buildAirShowFlightAssignments(flight, host.buildAirShowScreenRunPath(host.averageAirShowPosition(flight.actors) ?? flight.anchor, corridor, {
                endAlongPx: -18,
                baseLateralPx: 132,
                laneIndex: index - (survivingEscorts.length - 1) / 2,
                sideSign: 1,
                alongStepPx: 18,
                lateralStepPx: 30,
                corridorWidthPx: 18,
                driftPx: 18,
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight)
            }), 0.26, index, survivingEscorts.length))
        ];
        recordPhase("bomber-gap", bomberGapAssignments, Math.max(180, scene.bomberArrivalDelayMs ?? 0), [], [], host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs
        }));
        updateFlightAnchors([...survivingInterceptors, ...survivingEscorts]);
    }
    if (survivingBombers.length > 0) {
        const bomberIngressAssignments = host.buildContestedBomberPhaseSliceAssignments(survivingBombers, contestedBomberMasterPaths, contestedBomberPhaseDurations, "bomber-ingress");
        const bomberIngressFighterAssignments = [
            ...survivingInterceptors.flatMap((flight, index) => host.buildAirShowFlightAssignments(flight, host.sanitizeAirShowEntryPath(host.buildAirShowScreenRunPath(host.averageAirShowPosition(flight.actors) ?? flight.anchor, corridor, {
                endAlongPx: -84,
                baseLateralPx: -142,
                laneIndex: index - (survivingInterceptors.length - 1) / 2,
                sideSign: -1,
                alongStepPx: 20,
                lateralStepPx: 28,
                corridorWidthPx: 18,
                driftPx: 14,
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight)
            }), {
                maxTurnDeg: 48,
                strongTurnDeg: 92,
                maxFirstSegmentPx: 82,
                maxSharpTurnDeg: 120,
                maxWaypointsToRemove: 3
            }), 0.26, index, survivingInterceptors.length)),
            ...survivingEscorts.flatMap((flight, index) => host.buildAirShowFlightAssignments(flight, host.sanitizeAirShowEntryPath(host.buildAirShowScreenRunPath(host.averageAirShowPosition(flight.actors) ?? flight.anchor, corridor, {
                endAlongPx: 24,
                baseLateralPx: 118,
                laneIndex: index - (survivingEscorts.length - 1) / 2,
                sideSign: 1,
                alongStepPx: 18,
                lateralStepPx: 24,
                corridorWidthPx: 16,
                driftPx: 14,
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight)
            }), {
                maxTurnDeg: 44,
                strongTurnDeg: 90,
                maxFirstSegmentPx: 78,
                maxSharpTurnDeg: 118,
                maxWaypointsToRemove: 3
            }), 0.24, index, survivingEscorts.length))
        ];
        const bomberIngressRoleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: host.airShowBomberSpeedPxPerMs
        });
        const bomberIngressDurationMs = plannedBomberIngressDurationMs;
        const extendedBomberIngressAssignments = host.extendAirShowPhaseAssignmentsForSpeed([
            ...bomberIngressAssignments,
            ...bomberIngressFighterAssignments
        ], bomberIngressDurationMs, bomberIngressRoleSpeeds, {
            clampCenter: corridor.center,
            orbitSignByRole: {
                interceptor: -1,
                escort: 1
            }
        });
        const spacedBomberIngressAssignments = host.prepareAirShowPhaseAssignments(extendedBomberIngressAssignments, bomberIngressDurationMs, [0.22, 0.5, 0.78, 0.94], undefined, bomberIngressRoleSpeeds, {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 90,
            directTurnHomeRoles: ["interceptor", "escort"],
            softenEntryRoles: ["interceptor", "escort"],
            softenEntryTurnLimitDeg: 102,
            softenEntryWaypointCount: 6
        });
        recordPhase("bomber-ingress", spacedBomberIngressAssignments, bomberIngressDurationMs, [], [], bomberIngressRoleSpeeds);
        previousPhaseAssignments = spacedBomberIngressAssignments;
        previousPhaseDurationMs = bomberIngressDurationMs;
        updateFlightAnchors([...survivingBombers, ...survivingInterceptors, ...survivingEscorts]);
        const bomberPassEntriesByBomber = host.resolveAirShowBomberPassEntries(scene, flightMap);
        const bomberAttackEntries = survivingBombers.flatMap((bomberFlight) => (bomberPassEntriesByBomber.get(bomberFlight.spec.id) ?? []).map((entry) => ({
            ...entry,
            bomberFlight
        })));
        if (bomberAttackEntries.length > 0) {
            const bomberDefenseAssignments = host.buildContestedBomberPhaseSliceAssignments(survivingBombers, contestedBomberMasterPaths, contestedBomberPhaseDurations, "bomber-defense-pass");
            const bomberDefenseTargets = survivingBombers.map((bomberFlight, bomberIndex) => {
                const laneIndex = survivingBombers.length <= 1 ? 0 : bomberIndex - (survivingBombers.length - 1) / 2;
                const defenseAssignment = bomberDefenseAssignments.find((assignment) => assignment.actor.flightId === bomberFlight.spec.id);
                const defenseTarget = defenseAssignment?.points[defenseAssignment.points.length - 1]
                    ?? (host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor);
                return {
                    bomberFlight,
                    laneIndex,
                    defenseTarget
                };
            });
            const averageDefenseAlongPx = bomberDefenseTargets.reduce((sum, entry) => {
                return sum + host.resolveAirShowCorridorCoordinates(corridor, entry.defenseTarget).alongPx;
            }, 0) / Math.max(1, bomberDefenseTargets.length);
            const passEnd = Math.round(averageDefenseAlongPx);
            const passStart = passEnd - 128;
            const phaseAssignments = [...bomberDefenseAssignments];
            const tracerBursts = [];
            const attackEntriesForShow = host.resolveAirShowBomberDefensePassAttackEntries(bomberAttackEntries, interceptorFlights, survivingBombers);
            attackEntriesForShow.forEach((entry, attackIndex) => {
                const interceptorCurrent = host.averageAirShowPosition(entry.interceptorFlight.actors) ?? entry.interceptorFlight.anchor;
                const lane = attackEntriesForShow.length <= 1 ? 0 : attackIndex - (attackEntriesForShow.length - 1) / 2;
                const bomberCurrent = host.averageAirShowPosition(entry.bomberFlight.actors) ?? entry.bomberFlight.anchor;
                const bomberApproachProfile = bomberApproachProfilesById.get(entry.bomberFlight.spec.id);
                const attackCorridor = host.resolveAirShowCorridor(center, bomberCurrent, bomberApproachProfile?.targetCenter ?? corridor.strike);
                const attackPassEnd = Math.round(host.resolveAirShowCorridorCoordinates(attackCorridor, bomberDefenseTargets.find((candidate) => candidate.bomberFlight.spec.id === entry.bomberFlight.spec.id)?.defenseTarget
                    ?? bomberApproachProfile?.targetApproach
                    ?? corridor.strike).alongPx);
                const attackPassStart = attackPassEnd - 116;
                const direction = host.resolveAirShowCorridorSideSign(interceptorCurrent, attackCorridor, attackIndex % 2 === 0 ? -1 : 1);
                const interceptorPath = host.buildAirShowBomberInterceptPassPath(interceptorCurrent, attackCorridor, {
                    passStartAlongPx: attackPassStart,
                    passEndAlongPx: attackPassEnd,
                    laneIndex: lane,
                    attackSideSign: direction,
                    startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(entry.interceptorFlight)
                });
                phaseAssignments.push(...host.buildAirShowFlightAssignments(entry.interceptorFlight, interceptorPath, 0.3, attackIndex, attackEntriesForShow.length));
            });
            const engagedInterceptorIds = new Set(attackEntriesForShow.map((entry) => entry.interceptorFlight.spec.id));
            const holdingInterceptors = activeFlights(interceptorFlights).filter((flight) => !engagedInterceptorIds.has(flight.spec.id));
            phaseAssignments.push(...host.buildAirShowBandAssignments(holdingInterceptors, "bomber-stack:other-interceptors:0", corridor, scene.kind, stageRandom, {
                alongPx: passStart - 28,
                lateralPx: -156,
                alongStepPx: 22,
                lateralStepPx: 30,
                jitterAlongPx: 0,
                jitterLateralPx: 0,
                arcPx: 12,
                driftPx: 12
            }));
            const activeScreeningEscorts = activeFlights(escortFlights);
            phaseAssignments.push(...activeScreeningEscorts.flatMap((flight, escortIndex) => host.buildAirShowFlightAssignments(flight, host.sanitizeAirShowEntryPath(host.buildAirShowScreenRunPath(host.averageAirShowPosition(flight.actors) ?? flight.anchor, corridor, {
                endAlongPx: passEnd + 36,
                baseLateralPx: 108,
                laneIndex: escortIndex - (activeScreeningEscorts.length - 1) / 2,
                sideSign: 1,
                alongStepPx: 18,
                lateralStepPx: 26,
                corridorWidthPx: 14,
                driftPx: 12,
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight)
            }), {
                maxTurnDeg: 42,
                strongTurnDeg: 86,
                maxFirstSegmentPx: 72,
                maxSharpTurnDeg: 116,
                maxWaypointsToRemove: 3
            }), 0.24, escortIndex, activeScreeningEscorts.length)));
            const bomberDefenseRoleSpeeds = host.resolveAirShowRoleSpeedMap({
                interceptor: host.airShowFighterSpeedPxPerMs,
                escort: host.airShowFighterSpeedPxPerMs,
                bomber: host.airShowBomberSpeedPxPerMs
            });
            const bomberPassBeatDurationMs = plannedBomberDefenseDurationMs;
            const extendedBomberDefenseAssignments = host.extendAirShowPhaseAssignmentsForSpeed(phaseAssignments, bomberPassBeatDurationMs, bomberDefenseRoleSpeeds, {
                clampCenter: corridor.center,
                orbitSignByRole: {
                    interceptor: -1,
                    escort: 1
                }
            });
            const spacedPhaseAssignments = host.prepareAirShowPhaseAssignments(extendedBomberDefenseAssignments, bomberPassBeatDurationMs, [0.04, 0.18, 0.36, 0.56, 0.76], 46, bomberDefenseRoleSpeeds, {
                previousAssignments: previousPhaseAssignments,
                previousDurationMs: previousPhaseDurationMs,
                entryTurnLimitDeg: 88,
                directTurnHomeRoles: ["interceptor", "escort"],
                softenEntryRoles: ["interceptor", "escort"],
                softenEntryTurnLimitDeg: 100,
                softenEntryWaypointCount: 6
            });
            attackEntriesForShow.forEach((entry) => {
                tracerBursts.push(...host.buildAirShowBomberDefensePassTracerBursts(spacedPhaseAssignments, entry.interceptorFlight, entry.bomberFlight));
            });
            if (tracerBursts.length === 0) {
                const fallbackAttackerFlight = activeFlights(interceptorFlights)[0]
                    ?? activeFlights(escortFlights)[0]
                    ?? null;
                const fallbackBomberFlight = survivingBombers[0] ?? null;
                const fallbackInterceptor = fallbackAttackerFlight?.actors.find((actor) => actor.active) ?? null;
                const fallbackBomber = fallbackBomberFlight?.actors.find((actor) => actor.active) ?? null;
                if (fallbackAttackerFlight && fallbackBomberFlight) {
                    tracerBursts.push(...host.buildAirShowBomberDefensePassTracerBursts(spacedPhaseAssignments, fallbackAttackerFlight, fallbackBomberFlight, {
                        attackTimings: [0.24, 0.38, 0.52, 0.66],
                        defensiveTimings: [0.36, 0.54, 0.72],
                        fallbackToNearest: true
                    }));
                }
                else if (fallbackInterceptor && fallbackBomber) {
                    tracerBursts.push(...host.buildAirShowTracerVolley(fallbackInterceptor, fallbackBomber, {
                        emitter: "nose",
                        width: 0.54,
                        lifetimeMs: 40,
                        spreadPx: 6,
                        streakLengthPx: 132,
                        visibleLengthPx: 12,
                        fanHalfAngleDeg: 2,
                        burstCount: 3,
                        timings: [0.28, 0.42, 0.56, 0.7]
                    }), ...host.buildAirShowTracerVolley(fallbackBomber, fallbackInterceptor, {
                        emitter: "center",
                        color: "#fff1c8",
                        width: 0.42,
                        lifetimeMs: 34,
                        spreadPx: 4,
                        streakLengthPx: 96,
                        visibleLengthPx: 8,
                        fanHalfAngleDeg: 1,
                        burstCount: 2,
                        timings: [0.36, 0.54, 0.72]
                    }));
                }
            }
            recordPhase("bomber-defense-pass", spacedPhaseAssignments, bomberPassBeatDurationMs, tracerBursts, [], bomberDefenseRoleSpeeds);
            previousPhaseAssignments = spacedPhaseAssignments;
            previousPhaseDurationMs = bomberPassBeatDurationMs;
            updateFlightAnchors([...survivingBombers, ...interceptorFlights, ...escortFlights]);
            const deferBomberFinalStrengthUntilFlak = (scene.flakBursts?.length ?? 0) > 0;
            survivingBombers.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, deferBomberFinalStrengthUntilFlak
                ? (flight.spec.strengthAfterEscortPhase ?? flight.currentStrength)
                : (flight.spec.finalStrength ?? flight.currentStrength))));
            interceptorFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
            updateFlightAnchors([...survivingBombers, ...interceptorFlights]);
        }
    }
    const postPassInterceptors = activeFlights(interceptorFlights);
    const postPassEscorts = activeFlights(escortFlights);
    const postPassBombers = activeFlights(bomberFlights).filter((flight) => (flight.currentStrength ?? 0) > 0);
    if (postPassBombers.length > 0) {
        const targetRunFighterFlights = [...postPassInterceptors, ...postPassEscorts];
        const bomberTargetRuns = postPassBombers.map((bomberFlight, index) => {
            const cachedProfile = bomberApproachProfilesById.get(bomberFlight.spec.id);
            const targetCenter = cachedProfile?.targetCenter
                ?? bomberTargetCentersById.get(bomberFlight.spec.id)
                ?? averageBomberTargetCenter
                ?? corridor.strike;
            const laneIndex = cachedProfile?.laneIndex
                ?? (postPassBombers.length <= 1 ? 0 : index - (postPassBombers.length - 1) / 2);
            const targetApproach = cachedProfile?.targetApproach
                ?? host.offsetAirShowPoint(targetCenter, -corridor.axis.x * 14 + corridor.normal.x * laneIndex * 16, -corridor.axis.y * 14 + corridor.normal.y * laneIndex * 16);
            return {
                bomberFlight,
                targetCenter,
                targetApproach,
                laneIndex,
                turnSideSign: host.resolveAirShowRouteSideSign(host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor, targetCenter, host.resolveAirShowFlightHeadingDegrees(bomberFlight), laneIndex >= 0 ? 1 : -1)
            };
        });
        const strikeRunRoleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: host.airShowBomberSpeedPxPerMs
        });
        const bomberStrikeRunAssignments = bomberTargetRuns.flatMap(({ bomberFlight, targetCenter, turnSideSign }, bomberIndex) => host.buildAirShowFlightAssignments(bomberFlight, host.buildAirShowBomberTargetRunPath(host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor, targetCenter, {
            lateralSign: turnSideSign,
            corridorWidthPx: 10,
            startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(bomberFlight)
        }), 0.2, bomberIndex, bomberTargetRuns.length));
        const strikeRunDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(bomberStrikeRunAssignments, strikeRunRoleSpeeds, scene.strikeRunDurationMs ?? 980, 640, 7000, ["bomber"]);
        const fighterPeelHeadingByFlightId = collectStableTailHeadingsByFlightId(previousPhaseAssignments, previousPhaseDurationMs, 0.72, 0.92);
        const strikeRunAssignments = [
            ...bomberStrikeRunAssignments,
            ...buildFighterPeelAssignments(targetRunFighterFlights, strikeRunDurationMs, fighterPeelHeadingByFlightId)
        ];
        const strikeRunTracerBursts = [];
        const strikeRunFlakBursts = bomberTargetRuns.flatMap(({ bomberFlight }) => host.resolveAirShowBomberFlakBursts(scene, bomberFlight.spec.id));
        const finalizedStrikeRunAssignments = host.prepareAirShowPhaseAssignments(strikeRunAssignments, strikeRunDurationMs, [0.18, 0.42, 0.66, 0.86], undefined, strikeRunRoleSpeeds, {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 84
        });
        host.collectAirShowFlightTailHeadings(finalizedStrikeRunAssignments, {
            role: "bomber",
            sampleStartProgress: 0.9,
            sampleEndProgress: 1
        }).forEach((headingDegrees, flightId) => {
            egressHeadingByFlightId.set(flightId, headingDegrees);
        });
        recordPhase("target-run", finalizedStrikeRunAssignments, strikeRunDurationMs, strikeRunTracerBursts, strikeRunFlakBursts, strikeRunRoleSpeeds);
        previousPhaseAssignments = finalizedStrikeRunAssignments;
        previousPhaseDurationMs = strikeRunDurationMs;
        if (strikeRunFlakBursts.length > 0) {
            postPassBombers.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
        }
        updateFlightAnchors([
            ...postPassBombers,
            ...targetRunFighterFlights
        ]);
    }
    const fighterEgressFlights = activeFlights([...interceptorFlights, ...escortFlights]);
    const bomberEgressFlights = activeFlights(bomberFlights).filter((flight) => (flight.currentStrength ?? 0) > 0);
    const egressFlights = [...bomberEgressFlights, ...fighterEgressFlights];
    if (egressFlights.length > 0) {
        const egressAssignments = [
            ...buildBomberEgressAssignments(bomberEgressFlights),
            ...buildFighterEgressAssignments(fighterEgressFlights)
        ];
        const egressRoleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: host.airShowBomberSpeedPxPerMs
        });
        const egressDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(egressAssignments, egressRoleSpeeds, scene.egressDurationMs ?? 1080, 820, 7000);
        const finalizedEgressAssignments = host.prepareAirShowPhaseAssignments(egressAssignments, egressDurationMs, [0.22, 0.5, 0.78], 42, egressRoleSpeeds, {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 72,
            directTurnHomeRoles: ["bomber"]
        });
        recordPhase("egress", finalizedEgressAssignments, egressDurationMs, [], [], egressRoleSpeeds);
    }
    return {
        hexKey: scene.hexKey,
        center: { cx: center.cx, cy: center.cy },
        corridor: {
            center: { cx: corridor.center.cx, cy: corridor.center.cy },
            entry: { cx: corridor.entry.cx, cy: corridor.entry.cy },
            merge: { cx: corridor.merge.cx, cy: corridor.merge.cy },
            strike: { cx: corridor.strike.cx, cy: corridor.strike.cy },
            exit: { cx: corridor.exit.cx, cy: corridor.exit.cy }
        },
        hqMidX: (() => {
            const ph = host.resolveHexCenterByKey(scene.playerHqKey);
            const bh = host.resolveHexCenterByKey(scene.botHqKey);
            return ph && bh ? (ph.cx + bh.cx) / 2 : null;
        })(),
        bomberTarget: averageBomberTargetCenter ? { cx: averageBomberTargetCenter.cx, cy: averageBomberTargetCenter.cy } : null,
        originPlan: hqAxis ? buildAirShowInspectionOriginPlan(hqAxis, host.offMapDistancePx) : null,
        phaseTimingAudit,
        flights: runtimeSeedFlights,
        phases
    };
}
