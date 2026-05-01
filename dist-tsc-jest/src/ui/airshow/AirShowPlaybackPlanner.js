import { HEX_HEIGHT, HEX_WIDTH } from "../../core/balance";
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
    const resolvePreviousPhaseBoundaryVector = (flight) => {
        if ((previousPhaseAssignments?.length ?? 0) <= 0) {
            return null;
        }
        const boundaryVectors = previousPhaseAssignments
            .filter((assignment) => assignment.actor.flightId === flight.spec.id)
            .map((assignment) => {
            if (assignment.points.length < 2) {
                return null;
            }
            const boundaryPoint = assignment.points[assignment.points.length - 1];
            for (let index = assignment.points.length - 2; index >= 0; index -= 1) {
                const reference = assignment.points[index];
                if (!boundaryPoint || !reference) {
                    continue;
                }
                const dx = boundaryPoint.cx - reference.cx;
                const dy = boundaryPoint.cy - reference.cy;
                if (Math.hypot(dx, dy) <= 0.5) {
                    continue;
                }
                return { dx, dy };
            }
            return null;
        })
            .filter((vector) => !!vector);
        if (boundaryVectors.length === 0) {
            return null;
        }
        return boundaryVectors.reduce((acc, vector) => {
            acc.dx += vector.dx;
            acc.dy += vector.dy;
            return acc;
        }, { dx: 0, dy: 0 });
    };
    const resolvePreviousPhaseBoundaryHeadingDegrees = (flight, fallbackHeadingDegrees) => {
        const averageVector = resolvePreviousPhaseBoundaryVector(flight);
        if (!averageVector || Math.hypot(averageVector.dx, averageVector.dy) <= 0.5) {
            return fallbackHeadingDegrees;
        }
        return ((Math.atan2(averageVector.dy, averageVector.dx) * 180) / Math.PI + 90 + 360) % 360;
    };
    const bridgePathToPreviousPhaseMotion = (flight, path, carryDistancePx = 30) => {
        if (path.length < 2) {
            return [...path];
        }
        const boundaryVector = resolvePreviousPhaseBoundaryVector(flight);
        if (!boundaryVector || Math.hypot(boundaryVector.dx, boundaryVector.dy) <= 0.5) {
            return [...path];
        }
        const start = path[0];
        const first = path[1];
        const second = path[2] ?? first;
        if (!start || !first || !second) {
            return [...path];
        }
        const firstVector = {
            dx: first.cx - start.cx,
            dy: first.cy - start.cy
        };
        const firstVectorLength = Math.hypot(firstVector.dx, firstVector.dy);
        if (firstVectorLength <= 0.5) {
            return [...path];
        }
        const boundaryLength = Math.hypot(boundaryVector.dx, boundaryVector.dy);
        const alignment = (boundaryVector.dx * firstVector.dx + boundaryVector.dy * firstVector.dy)
            / (boundaryLength * firstVectorLength);
        if (alignment >= -0.05) {
            return [...path];
        }
        const normalizedBoundary = {
            dx: boundaryVector.dx / boundaryLength,
            dy: boundaryVector.dy / boundaryLength
        };
        const carryPx = host.clamp(Math.min(carryDistancePx, firstVectorLength * 0.7), 18, 40);
        const bridgePoint = {
            cx: start.cx + normalizedBoundary.dx * carryPx,
            cy: start.cy + normalizedBoundary.dy * carryPx
        };
        const blendPoint = {
            cx: bridgePoint.cx + (second.cx - bridgePoint.cx) * 0.38,
            cy: bridgePoint.cy + (second.cy - bridgePoint.cy) * 0.38
        };
        return [
            start,
            bridgePoint,
            blendPoint,
            ...path.slice(1)
        ].filter((point, index, points) => {
            if (index === 0) {
                return true;
            }
            const previous = points[index - 1];
            return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
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
                const previousInspectionPhase = phases[phases.length - 1];
                const previousInspectionAssignment = previousInspectionPhase?.assignments.find((candidate) => candidate.actorId === assignment.actor.id);
                const previousInspectionEnd = previousInspectionAssignment?.sampledPositions[previousInspectionAssignment.sampledPositions.length - 1]
                    ?? null;
                for (let i = 0; i <= sampleCount; i += 1) {
                    const progress = i / sampleCount;
                    const timeMs = Math.round(progress * durationMs);
                    const sample = host.sampleAirShowAssignmentAtTime(assignment, timeMs, durationMs);
                    const paintedPosition = i === 0 && previousInspectionEnd
                        ? previousInspectionEnd
                        : sample.position;
                    sampledPositions.push({
                        timeMs,
                        progress,
                        pathProgress: sample.pathProgress,
                        cx: Math.round(paintedPosition.cx * 10) / 10,
                        cy: Math.round(paintedPosition.cy * 10) / 10,
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
                const batteryCenter = burst.batteryHexKey ? host.resolveHexCenterByKey(burst.batteryHexKey) : null;
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
                const rangeReferenceCenter = batteryCenter
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
                    batteryHexKey: burst.batteryHexKey ?? null,
                    sampledBomberCenter: bomberPathCenter ? { cx: bomberPathCenter.cx, cy: bomberPathCenter.cy } : undefined,
                    rangeReferenceCenter: { cx: rangeReferenceCenter.cx, cy: rangeReferenceCenter.cy },
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
    const buildPlannedAirShowSceneReport = () => ({
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
    });
    const visibleBounds = host.resolveAirShowVisibleBounds();
    const compactEgressLaneStepPx = visibleBounds && Math.max(0, visibleBounds.maxX - visibleBounds.minX) <= 1500
        ? 46
        : 64;
    const scenePlayerHq = host.resolveHexCenterByKey(scene.playerHqKey);
    const sceneBotHq = host.resolveHexCenterByKey(scene.botHqKey);
    const hqMidX = scenePlayerHq && sceneBotHq
        ? (scenePlayerHq.cx + sceneBotHq.cx) / 2
        : null;
    const resolveFighterHomePoint = (flight, index, totalFlights) => {
        const rand = stageRandom(`fighter-home:${flight.spec.id}:${index}`);
        const laneOffset = (index - (totalFlights - 1) / 2) * compactEgressLaneStepPx;
        const homeFaction = flight.spec.role === "interceptor"
            ? "Bot"
            : flight.spec.role === "escort"
                ? "Player"
                : flight.spec.faction;
        const homeHq = homeFaction === "Bot" ? sceneBotHq : scenePlayerHq;
        const sideOrigin = resolveAirShowFallbackOrigin(center, homeFaction, mapBounds, {
            offsetPx: host.offMapDistancePx,
            hexHeight: HEX_HEIGHT
        });
        const resolvedSideOrigin = homeHq && mapBounds
            ? {
                cx: sideOrigin.cx,
                cy: host.clamp(homeHq.cy, mapBounds.minY - 220, mapBounds.maxY + 220)
            }
            : sideOrigin;
        return host.offsetAirShowPoint(resolvedSideOrigin, corridor.normal.x * laneOffset + (rand() - 0.5) * 22, corridor.normal.y * laneOffset + (rand() - 0.5) * 18);
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
    const resolveRouteHeadingDot = (start, end, startHeadingDegrees) => {
        const routeForward = normalizeVector(end.cx - start.cx, end.cy - start.cy, 0, -1);
        const headingForward = resolveHeadingVector(startHeadingDegrees, routeForward);
        return headingForward.x * routeForward.x + headingForward.y * routeForward.y;
    };
    const resolveVectorAngleDegrees = (left, right) => {
        const leftX = "dx" in left ? left.dx : left.x;
        const leftY = "dy" in left ? left.dy : left.y;
        const rightX = "dx" in right ? right.dx : right.x;
        const rightY = "dy" in right ? right.dy : right.y;
        const leftLength = Math.hypot(leftX, leftY);
        const rightLength = Math.hypot(rightX, rightY);
        if (leftLength <= 0.001 || rightLength <= 0.001) {
            return 0;
        }
        const dot = host.clamp((leftX * rightX + leftY * rightY) / (leftLength * rightLength), -1, 1);
        return (Math.acos(dot) * 180) / Math.PI;
    };
    const resolveWaypointTurnDegrees = (previous, current, next) => resolveVectorAngleDegrees({
        x: current.cx - previous.cx,
        y: current.cy - previous.cy
    }, {
        x: next.cx - current.cx,
        y: next.cy - current.cy
    });
    const reinforceCompactFighterTravel = (assignments, durationMs, minimumSpeedPxPerMs, focusByFlightId, options) => assignments.map((assignment) => {
        if (assignment.actor.role !== "interceptor"
            && assignment.actor.role !== "escort") {
            return assignment;
        }
        if (assignment.points.length < 2 || durationMs <= 0) {
            return assignment;
        }
        const currentTravelPx = host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, durationMs);
        const desiredTravelPx = host.clamp(durationMs * minimumSpeedPxPerMs, options.phase === "merge" ? 128 : 82, options.phase === "merge" ? 174 : 132);
        if (currentTravelPx >= desiredTravelPx) {
            return assignment;
        }
        const start = assignment.points[0];
        const end = assignment.points[assignment.points.length - 1];
        if (!start || !end) {
            return assignment;
        }
        const headingForward = resolveHeadingVector(assignment.actor.headingDegrees, {
            x: end.cx - start.cx,
            y: end.cy - start.cy
        });
        const routeForward = normalizeVector(end.cx - start.cx, end.cy - start.cy, headingForward.x, headingForward.y);
        const sideSign = assignment.actor.role === "interceptor"
            ? assignment.actor.formationIndex % 2 === 0 ? -1 : 1
            : assignment.actor.formationIndex % 2 === 0 ? 1 : -1;
        const lateral = {
            x: -routeForward.y * sideSign,
            y: routeForward.x * sideSign
        };
        const focusPoint = focusByFlightId.get(assignment.actor.flightId) ?? {
            cx: (start.cx + end.cx) * 0.5,
            cy: (start.cy + end.cy) * 0.5
        };
        const routeDistancePx = Math.max(18, Math.hypot(end.cx - start.cx, end.cy - start.cy));
        const deficitPx = desiredTravelPx - currentTravelPx;
        const weavePx = host.clamp(deficitPx * (options.phase === "merge" ? 0.72 : 0.82), options.phase === "merge" ? 10 : 12, options.phase === "merge"
            ? options.hasActiveBombers ? 28 : 34
            : options.hasActiveBombers ? 24 : 30);
        const forwardLeadPx = host.clamp(deficitPx * 0.24, 6, options.phase === "merge" ? 22 : 18);
        const midOne = {
            cx: start.cx
                + routeForward.x * Math.max(18, routeDistancePx * 0.34)
                + lateral.x * weavePx,
            cy: start.cy
                + routeForward.y * Math.max(18, routeDistancePx * 0.34)
                + lateral.y * weavePx
        };
        const midTwo = {
            cx: focusPoint.cx * 0.28
                + (start.cx + routeForward.x * Math.max(28, routeDistancePx * 0.66)) * 0.72
                - lateral.x * weavePx * 0.72,
            cy: focusPoint.cy * 0.28
                + (start.cy + routeForward.y * Math.max(28, routeDistancePx * 0.66)) * 0.72
                - lateral.y * weavePx * 0.72
        };
        const finalSettle = {
            cx: end.cx - routeForward.x * forwardLeadPx + lateral.x * weavePx * 0.18,
            cy: end.cy - routeForward.y * forwardLeadPx + lateral.y * weavePx * 0.18
        };
        return {
            ...assignment,
            points: [
                start,
                midOne,
                midTwo,
                finalSettle,
                end
            ]
        };
    });
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
    const tightenPathAroundFightSpace = (path, focusPoint, maxDistancePx) => path
        .map((point, index) => {
        const lastIndex = path.length - 1;
        if (index === 0 || index >= lastIndex) {
            return point;
        }
        const effectiveMaxDistancePx = index >= lastIndex - 1
            ? maxDistancePx * 1.45
            : index >= lastIndex - 2
                ? maxDistancePx * 1.22
                : maxDistancePx;
        const dx = point.cx - focusPoint.cx;
        const dy = point.cy - focusPoint.cy;
        const distancePx = Math.hypot(dx, dy);
        if (distancePx <= effectiveMaxDistancePx || distancePx < 0.001) {
            return point;
        }
        const scale = effectiveMaxDistancePx / distancePx;
        return {
            cx: focusPoint.cx + dx * scale,
            cy: focusPoint.cy + dy * scale
        };
    })
        .filter((point, index, points) => {
        if (index === 0) {
            return true;
        }
        const previous = points[index - 1];
        return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
    });
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
        const peelJitterPx = (peelRand() - 0.5) * 10;
        const fighterHomeLaneContext = resolveFighterHomeLaneContext(flight, fighterFlights);
        const egressHeadingDegrees = tailHeadingByFlightId.get(flight.spec.id) ?? host.resolveAirShowFlightHeadingDegrees(flight);
        const fullEgressPoint = resolveFighterHomePoint(flight, fighterHomeLaneContext.index, fighterHomeLaneContext.totalFlights);
        const homeDx = fullEgressPoint.cx - current.cx;
        const homeDy = fullEgressPoint.cy - current.cy;
        const homeDistancePx = Math.max(1, Math.hypot(homeDx, homeDy));
        const homeForward = { x: homeDx / homeDistancePx, y: homeDy / homeDistancePx };
        const homeNormal = { x: -homeForward.y, y: homeForward.x };
        const headingForward = resolveHeadingVector(egressHeadingDegrees, homeForward);
        const peelSideSign = host.resolveAirShowRouteSideSign(current, fullEgressPoint, egressHeadingDegrees, flight.spec.role === "escort" ? 1 : -1);
        const currentCenterDx = current.cx - corridor.center.cx;
        const currentCenterDy = current.cy - corridor.center.cy;
        const currentCenterDistancePx = Math.max(1, Math.hypot(currentCenterDx, currentCenterDy));
        const radialOutward = currentCenterDistancePx > 1
            ? {
                x: currentCenterDx / currentCenterDistancePx,
                y: currentCenterDy / currentCenterDistancePx
            }
            : {
                x: homeNormal.x * peelSideSign,
                y: homeNormal.y * peelSideSign
            };
        const peelCoverageRatio = flight.spec.role === "escort" ? 1.08 : 0.95;
        const peelMinForwardPx = flight.spec.role === "escort" ? 320 : 260;
        const peelMaxForwardPx = flight.spec.role === "escort" ? 720 : 560;
        const peelForwardPx = host.clamp(Math.round(durationMs
            * host.airShowFighterSpeedPxPerMs
            * (flight.spec.role === "escort" ? 1.18 : 1.05)), peelMinForwardPx, Math.max(peelMinForwardPx, Math.min(peelMaxForwardPx, homeDistancePx * peelCoverageRatio)));
        const laneOffset = (index - (fighterFlights.length - 1) / 2) * compactEgressLaneStepPx * 0.34;
        let peelLateralPx = laneOffset
            + peelSideSign * (flight.spec.role === "escort" ? 52 : 42)
            + peelJitterPx;
        let routeForward = homeForward;
        let routeNormal = homeNormal;
        let peelTarget = host.offsetAirShowPoint(current, routeForward.x * peelForwardPx + routeNormal.x * peelLateralPx, routeForward.y * peelForwardPx + routeNormal.y * peelLateralPx);
        const peelTargetCenterDistancePx = Math.hypot(peelTarget.cx - corridor.center.cx, peelTarget.cy - corridor.center.cy);
        const shouldPreserveOutwardPeel = currentCenterDistancePx >= 120
            && peelTargetCenterDistancePx < currentCenterDistancePx - (flight.spec.role === "escort" ? 8 : 18);
        if (shouldPreserveOutwardPeel) {
            const outwardBias = flight.spec.role === "escort" ? 0.72 : 0.82;
            const outwardBlend = {
                x: radialOutward.x * outwardBias + headingForward.x * (1 - outwardBias),
                y: radialOutward.y * outwardBias + headingForward.y * (1 - outwardBias)
            };
            const outwardBlendDistance = Math.hypot(outwardBlend.x, outwardBlend.y);
            routeForward =
                outwardBlendDistance > 0.001
                    ? {
                        x: outwardBlend.x / outwardBlendDistance,
                        y: outwardBlend.y / outwardBlendDistance
                    }
                    : radialOutward;
            routeNormal = { x: -routeForward.y, y: routeForward.x };
            const outwardReferenceTarget = host.offsetAirShowPoint(current, routeForward.x * peelForwardPx, routeForward.y * peelForwardPx);
            const outwardSideSign = host.resolveAirShowRouteSideSign(current, outwardReferenceTarget, egressHeadingDegrees, peelSideSign);
            peelLateralPx =
                laneOffset
                    + outwardSideSign * (flight.spec.role === "escort" ? 56 : 48)
                    + peelJitterPx * 0.8;
            peelTarget = host.offsetAirShowPoint(current, routeForward.x * peelForwardPx + routeNormal.x * peelLateralPx, routeForward.y * peelForwardPx + routeNormal.y * peelLateralPx);
        }
        const peelHomeSideSign = flight.spec.role === "escort" ? -1 : 1;
        const visibleBounds = host.resolveAirShowVisibleBounds();
        const peelMidX = visibleBounds
            ? (visibleBounds.minX + visibleBounds.maxX) / 2
            : (hqMidX ?? corridor.center.cx);
        const minimumPeelSideDistancePx = 430 + Math.abs(fighterHomeLaneContext.index) * 26;
        const rawSideCommittedPeelX = peelMidX + peelHomeSideSign * minimumPeelSideDistancePx;
        const sideCommittedPeelX = visibleBounds
            ? host.clamp(rawSideCommittedPeelX, visibleBounds.minX + 54, visibleBounds.maxX - 54)
            : rawSideCommittedPeelX;
        peelTarget = {
            ...peelTarget,
            cx: peelHomeSideSign < 0
                ? Math.min(peelTarget.cx, sideCommittedPeelX)
                : Math.max(peelTarget.cx, sideCommittedPeelX)
        };
        const minimumRadialPeelDistancePx = currentCenterDistancePx + (flight.spec.role === "escort" ? 110 : 92);
        const peelTargetRadialDistancePx = Math.hypot(peelTarget.cx - corridor.center.cx, peelTarget.cy - corridor.center.cy);
        if (peelTargetRadialDistancePx < minimumRadialPeelDistancePx) {
            peelTarget = host.offsetAirShowPoint(corridor.center, radialOutward.x * minimumRadialPeelDistancePx, radialOutward.y * minimumRadialPeelDistancePx);
        }
        const routeSideSign = host.resolveAirShowRouteSideSign(current, peelTarget, egressHeadingDegrees, flight.spec.role === "escort" ? 1 : -1);
        const headingRouteDot = headingForward.x * routeForward.x + headingForward.y * routeForward.y;
        const peelCarryPx = Math.min(Math.max(38, peelForwardPx * 0.18), Math.max(72, peelForwardPx * 0.3));
        const peelPathSource = headingRouteDot < 0.1
            ? [
                current,
                host.offsetAirShowPoint(current, headingForward.x * (peelCarryPx * 0.36) + routeNormal.x * routeSideSign * 22, headingForward.y * (peelCarryPx * 0.36) + routeNormal.y * routeSideSign * 22),
                host.offsetAirShowPoint(current, headingForward.x * peelCarryPx + routeNormal.x * routeSideSign * (Math.abs(peelLateralPx) * 0.78 + 22), headingForward.y * peelCarryPx + routeNormal.y * routeSideSign * (Math.abs(peelLateralPx) * 0.78 + 22)),
                host.offsetAirShowPoint(current, routeForward.x * Math.max(58, peelForwardPx * 0.46) + routeNormal.x * peelLateralPx, routeForward.y * Math.max(58, peelForwardPx * 0.46) + routeNormal.y * peelLateralPx),
                host.offsetAirShowPoint(current, routeForward.x * Math.max(112, peelForwardPx * 0.82) + routeNormal.x * peelLateralPx * 0.42, routeForward.y * Math.max(112, peelForwardPx * 0.82) + routeNormal.y * peelLateralPx * 0.42),
                peelTarget
            ]
            : buildForwardContinuousRoutePath(current, peelTarget, {
                startHeadingDegrees: egressHeadingDegrees,
                lateralSign: routeSideSign,
                minRouteDot: -0.25,
                carryForwardPx: peelCarryPx,
                earlyAlongPx: Math.max(52, peelForwardPx * 0.38),
                midAlongPx: Math.max(90, peelForwardPx * 0.7),
                lateAlongPx: Math.max(126, peelForwardPx * 0.9),
                entryLateralPx: Math.abs(peelLateralPx) + 34,
                midLateralPx: Math.abs(peelLateralPx) * 0.56 + 18,
                lateLateralPx: Math.abs(peelLateralPx) * 0.18 + 8
            });
        const stabilizedPeelPathSource = [
            current,
            host.offsetAirShowPoint(current, headingForward.x * 58, headingForward.y * 58),
            host.offsetAirShowPoint(current, headingForward.x * 118 + routeNormal.x * routeSideSign * 8, headingForward.y * 118 + routeNormal.y * routeSideSign * 8),
            host.offsetAirShowPoint(current, headingForward.x * 168 + routeNormal.x * routeSideSign * 18, headingForward.y * 168 + routeNormal.y * routeSideSign * 18),
            ...peelPathSource.slice(1).filter((point) => Math.hypot(point.cx - current.cx, point.cy - current.cy) > 96)
        ];
        const peelPath = host.sanitizeAirShowEntryPath(stabilizedPeelPathSource, {
            maxTurnDeg: 54,
            strongTurnDeg: 94,
            maxFirstSegmentPx: 92,
            maxSharpTurnDeg: 128,
            maxWaypointsToRemove: 0
        });
        return host.buildAirShowFlightAssignments(flight, peelPath, 0.24, index, fighterFlights.length).map((assignment) => {
            const previousInspectionAssignment = phases[phases.length - 1]?.assignments.find((candidate) => candidate.actorId === assignment.actor.id);
            const previousInspectionEnd = previousInspectionAssignment?.sampledPositions[previousInspectionAssignment.sampledPositions.length - 1] ?? null;
            const previousAssignment = previousPhaseAssignments.find((candidate) => candidate.actor.id === assignment.actor.id);
            const previousEnd = previousInspectionEnd
                ? { cx: previousInspectionEnd.cx, cy: previousInspectionEnd.cy }
                : previousAssignment
                    ? host.sampleAirShowAssignmentAtTime(previousAssignment, previousPhaseDurationMs, previousPhaseDurationMs).position
                    : null;
            const plannedStart = assignment.points[0] ?? assignment.actor.position;
            const continuityDx = previousEnd ? previousEnd.cx - plannedStart.cx : 0;
            const continuityDy = previousEnd ? previousEnd.cy - plannedStart.cy : 0;
            const continuousPoints = previousEnd && Math.hypot(continuityDx, continuityDy) > 0.5
                ? assignment.points.map((point) => ({
                    cx: point.cx + continuityDx,
                    cy: point.cy + continuityDy
                }))
                : assignment.points;
            return {
                ...assignment,
                actor: previousEnd && Math.hypot(continuityDx, continuityDy) > 0.5
                    ? {
                        ...assignment.actor,
                        position: previousEnd
                    }
                    : assignment.actor,
                points: continuousPoints,
                progressTimeline: [
                    { timeMs: 0, progress: 0 },
                    { timeMs: Math.round(durationMs * 0.22), progress: 0.58 },
                    { timeMs: Math.round(durationMs * 0.5), progress: 1 },
                    { timeMs: durationMs, progress: 1 }
                ]
            };
        });
    });
    const buildFighterEgressAssignments = (fighterFlights) => fighterFlights.flatMap((flight, index) => {
        const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const rand = stageRandom(`fighter-egress:${flight.spec.id}:${index}`);
        const fighterHomeLaneContext = resolveFighterHomeLaneContext(flight, fighterFlights);
        const phaseBoundaryHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
        const egressHeadingDegrees = phaseBoundaryHeadingDegrees;
        const baseEgressPoint = resolveFighterHomePoint(flight, fighterHomeLaneContext.index, fighterHomeLaneContext.totalFlights);
        const egressPoint = baseEgressPoint;
        const egressLateralSign = host.resolveAirShowRouteSideSign(current, egressPoint, egressHeadingDegrees, flight.spec.role === "escort" ? 1 : -1);
        const homeDx = egressPoint.cx - current.cx;
        const homeDy = egressPoint.cy - current.cy;
        const homeDistancePx = Math.max(1, Math.hypot(homeDx, homeDy));
        const homeForward = normalizeVector(homeDx, homeDy, 0, -1);
        const headingForward = resolveHeadingVector(phaseBoundaryHeadingDegrees, homeForward);
        const headingRouteDot = headingForward.x * homeForward.x + headingForward.y * homeForward.y;
        const homeSideSign = hqMidX === null
            ? (egressPoint.cx >= current.cx ? 1 : -1)
            : (egressPoint.cx >= hqMidX ? 1 : -1);
        const mustCrossHomeSide = hqMidX !== null
            && (homeSideSign < 0
                ? current.cx > hqMidX - 72
                : current.cx < hqMidX + 72);
        const rawEgressPath = mustCrossHomeSide
            ? buildForwardContinuousRoutePath(current, egressPoint, {
                startHeadingDegrees: egressHeadingDegrees,
                lateralSign: egressLateralSign,
                minRouteDot: -0.18,
                carryForwardPx: flight.spec.role === "escort" ? 62 : 70,
                earlyAlongPx: Math.max(96, homeDistancePx * 0.24),
                midAlongPx: Math.max(168, homeDistancePx * 0.5),
                lateAlongPx: Math.max(236, homeDistancePx * 0.78),
                entryLateralPx: 18 + rand() * 6,
                midLateralPx: 12 + rand() * 4,
                lateLateralPx: 5 + rand() * 2
            })
            : headingRouteDot > -0.14 && homeDistancePx <= 420
                ? buildForwardContinuousRoutePath(current, egressPoint, {
                    startHeadingDegrees: egressHeadingDegrees,
                    lateralSign: egressLateralSign,
                    minRouteDot: -0.22,
                    carryForwardPx: 50 + rand() * 16,
                    earlyAlongPx: Math.max(76, homeDistancePx * 0.3),
                    midAlongPx: Math.max(132, homeDistancePx * 0.58),
                    lateAlongPx: Math.max(184, homeDistancePx * 0.84),
                    entryLateralPx: 18 + rand() * 7,
                    midLateralPx: 8 + rand() * 4,
                    lateLateralPx: 3 + rand() * 2
                })
                : host.buildAirShowDisengagePath(current, egressPoint, {
                    startHeadingDegrees: egressHeadingDegrees,
                    lateralSign: egressLateralSign,
                    corridorWidthPx: flight.spec.role === "escort" ? 15 + rand() * 4 : 13 + rand() * 4,
                    driftPx: flight.spec.role === "escort" ? 10 + rand() * 4 : 8 + rand() * 3,
                    preferForwardContinuous: true
                });
        const egressPath = host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, rawEgressPath, flight.spec.role === "escort" ? 34 : 42), {
            maxTurnDeg: 44,
            strongTurnDeg: 78,
            maxFirstSegmentPx: 72,
            maxSharpTurnDeg: 104,
            maxWaypointsToRemove: 3
        });
        return host.buildAirShowFlightAssignments(flight, egressPath, 0.26, index, fighterFlights.length);
    });
    const buildSmoothHomeSideFighterEgressPath = (points, homeSideSign) => {
        if (points.length < 3) {
            return [...points];
        }
        const start = points[0];
        const rawSecond = points[1];
        const rawEnd = points[points.length - 1];
        const sideSign = homeSideSign >= 0 ? 1 : -1;
        const minimumHomeAdvancePx = 220;
        const endSignedX = rawEnd.cx * sideSign;
        const minimumSignedX = start.cx * sideSign + minimumHomeAdvancePx;
        const end = {
            cx: endSignedX < minimumSignedX ? minimumSignedX * sideSign : rawEnd.cx,
            cy: rawEnd.cy
        };
        const dx = end.cx - start.cx;
        const dy = end.cy - start.cy;
        const distancePx = Math.max(1, Math.hypot(dx, dy));
        const routeForward = normalizeVector(dx, dy, sideSign, 0);
        const initialVector = normalizeVector(rawSecond.cx - start.cx, rawSecond.cy - start.cy, routeForward.x, routeForward.y);
        const alignment = initialVector.x * routeForward.x + initialVector.y * routeForward.y;
        const entryForward = alignment < -0.05
            ? routeForward
            : normalizeVector(initialVector.x * 0.62 + routeForward.x * 0.38, initialVector.y * 0.62 + routeForward.y * 0.38, routeForward.x, routeForward.y);
        const entryHandlePx = host.clamp(Math.hypot(rawSecond.cx - start.cx, rawSecond.cy - start.cy) * 1.45, 42, Math.min(112, distancePx * 0.34));
        const exitHandlePx = host.clamp(distancePx * 0.22, 58, 132);
        const controlA = {
            cx: start.cx + entryForward.x * entryHandlePx,
            cy: start.cy + entryForward.y * entryHandlePx
        };
        const controlB = {
            cx: end.cx - routeForward.x * exitHandlePx,
            cy: end.cy - routeForward.y * exitHandlePx
        };
        const curveSamples = [0, 0.14, 0.3, 0.52, 0.76, 1].map((t) => {
            const u = 1 - t;
            return {
                cx: u * u * u * start.cx
                    + 3 * u * u * t * controlA.cx
                    + 3 * u * t * t * controlB.cx
                    + t * t * t * end.cx,
                cy: u * u * u * start.cy
                    + 3 * u * u * t * controlA.cy
                    + 3 * u * t * t * controlB.cy
                    + t * t * t * end.cy
            };
        });
        let bestSignedX = curveSamples[0].cx * sideSign;
        const homeSidePoints = curveSamples.map((point, index) => {
            if (index === 0) {
                return point;
            }
            const minimumStepPx = index === curveSamples.length - 1 ? 0 : 6;
            const signedX = point.cx * sideSign;
            const correctedSignedX = Math.max(signedX, bestSignedX + minimumStepPx);
            bestSignedX = correctedSignedX;
            return {
                cx: correctedSignedX * sideSign,
                cy: point.cy
            };
        });
        return host.sanitizeAirShowEntryPath(homeSidePoints, {
            maxTurnDeg: 36,
            strongTurnDeg: 70,
            maxFirstSegmentPx: 74,
            maxSharpTurnDeg: 92,
            maxWaypointsToRemove: 2
        });
    };
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
    const buildCorridorContestedAirShowPlan = () => {
        if (bomberFlights.length <= 0 || interceptorFlights.length <= 0) {
            return null;
        }
        const measurePathLength = (points) => {
            let lengthPx = 0;
            for (let index = 1; index < points.length; index += 1) {
                const previous = points[index - 1];
                const current = points[index];
                if (previous && current) {
                    lengthPx += Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
                }
            }
            return lengthPx;
        };
        const dedupePath = (points) => points.filter((point, index) => {
            const previous = index > 0 ? points[index - 1] : null;
            return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
        });
        const pointAtPathDistance = (points, distancePx) => {
            if (points.length <= 0) {
                return { cx: center.cx, cy: center.cy };
            }
            const clampedDistancePx = host.clamp(distancePx, 0, measurePathLength(points));
            let traversedPx = 0;
            for (let index = 1; index < points.length; index += 1) {
                const previous = points[index - 1];
                const current = points[index];
                if (!previous || !current) {
                    continue;
                }
                const segmentLengthPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
                if (segmentLengthPx <= 0.0001) {
                    continue;
                }
                if (traversedPx + segmentLengthPx >= clampedDistancePx) {
                    const ratio = host.clamp((clampedDistancePx - traversedPx) / segmentLengthPx, 0, 1);
                    return {
                        cx: previous.cx + (current.cx - previous.cx) * ratio,
                        cy: previous.cy + (current.cy - previous.cy) * ratio
                    };
                }
                traversedPx += segmentLengthPx;
            }
            return { ...points[points.length - 1] };
        };
        const slicePathByDistanceRange = (points, startDistancePx, endDistancePx) => {
            const totalLengthPx = measurePathLength(points);
            if (points.length < 2 || totalLengthPx <= 0.5) {
                return [...points];
            }
            const startPx = host.clamp(startDistancePx, 0, totalLengthPx);
            const endPx = host.clamp(endDistancePx, startPx, totalLengthPx);
            const sliced = [pointAtPathDistance(points, startPx)];
            let traversedPx = 0;
            for (let index = 1; index < points.length; index += 1) {
                const previous = points[index - 1];
                const current = points[index];
                if (!previous || !current) {
                    continue;
                }
                const segmentLengthPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
                const segmentEndPx = traversedPx + segmentLengthPx;
                if (segmentEndPx > startPx + 0.001 && segmentEndPx < endPx - 0.001) {
                    sliced.push({ ...current });
                }
                traversedPx = segmentEndPx;
            }
            sliced.push(pointAtPathDistance(points, endPx));
            return dedupePath(sliced);
        };
        const smoothCorridorPath = (start, end, lateralDriftPx = 0) => {
            const startProjection = host.resolveAirShowCorridorCoordinates(corridor, start);
            const endProjection = host.resolveAirShowCorridorCoordinates(corridor, end);
            return dedupePath([
                start,
                host.projectAirShowCorridorPoint(corridor, startProjection.alongPx * 0.62 + endProjection.alongPx * 0.38, startProjection.lateralPx * 0.62 + endProjection.lateralPx * 0.38 + lateralDriftPx * 0.7),
                host.projectAirShowCorridorPoint(corridor, startProjection.alongPx * 0.28 + endProjection.alongPx * 0.72, startProjection.lateralPx * 0.28 + endProjection.lateralPx * 0.72 + lateralDriftPx * 0.35),
                end
            ]);
        };
        const buildSpeedMatchedCorridorPath = (start, preferredEnd, durationMs, speedPxPerMs, lateralSign) => {
            const targetLengthPx = Math.max(32, Math.max(1, durationMs) * speedPxPerMs);
            const directDx = preferredEnd.cx - start.cx;
            const directDy = preferredEnd.cy - start.cy;
            const directLengthPx = Math.hypot(directDx, directDy);
            const travel = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
            const normal = { x: -travel.y, y: travel.x };
            if (directLengthPx >= targetLengthPx - 1) {
                return dedupePath([
                    start,
                    {
                        cx: start.cx + travel.x * targetLengthPx,
                        cy: start.cy + travel.y * targetLengthPx
                    }
                ]);
            }
            const thirdPx = Math.max(1, directLengthPx / 3);
            const solvedLateralPx = Math.sqrt(Math.max(0, Math.pow((targetLengthPx - thirdPx) / 2, 2) - thirdPx * thirdPx));
            const lateralPx = host.clamp(solvedLateralPx, 0, 142);
            const path = dedupePath([
                start,
                {
                    cx: start.cx + travel.x * directLengthPx * 0.34 + normal.x * lateralSign * lateralPx,
                    cy: start.cy + travel.y * directLengthPx * 0.34 + normal.y * lateralSign * lateralPx
                },
                {
                    cx: start.cx + travel.x * directLengthPx * 0.68 + normal.x * lateralSign * lateralPx * 0.88,
                    cy: start.cy + travel.y * directLengthPx * 0.68 + normal.y * lateralSign * lateralPx * 0.88
                },
                preferredEnd
            ]);
            const measuredLengthPx = measurePathLength(path);
            if (measuredLengthPx >= targetLengthPx - 6) {
                return path;
            }
            const extraForwardPx = Math.min(92, targetLengthPx - measuredLengthPx);
            return dedupePath([
                start,
                path[1] ?? start,
                path[2] ?? preferredEnd,
                {
                    cx: preferredEnd.cx + travel.x * extraForwardPx,
                    cy: preferredEnd.cy + travel.y * extraForwardPx
                }
            ]);
        };
        const buildSpeedMatchedPassPath = (start, passPoint, durationMs, speedPxPerMs, lateralSign) => {
            const targetLengthPx = Math.max(64, Math.max(1, durationMs) * speedPxPerMs);
            const forward = normalizeVector(passPoint.cx - start.cx, passPoint.cy - start.cy, corridor.axis.x, corridor.axis.y);
            const normal = { x: -forward.y, y: forward.x };
            const approachPoint = {
                cx: start.cx + forward.x * Math.min(84, targetLengthPx * 0.22),
                cy: start.cy + forward.y * Math.min(84, targetLengthPx * 0.22)
            };
            const basePath = dedupePath([start, approachPoint, passPoint]);
            const baseLengthPx = measurePathLength(basePath);
            if (baseLengthPx >= targetLengthPx - 6) {
                return basePath;
            }
            const exitDistancePx = Math.max(96, targetLengthPx - baseLengthPx);
            return dedupePath([
                ...basePath,
                {
                    cx: passPoint.cx + forward.x * exitDistancePx + normal.x * lateralSign * Math.min(52, exitDistancePx * 0.18),
                    cy: passPoint.cy + forward.y * exitDistancePx + normal.y * lateralSign * Math.min(52, exitDistancePx * 0.18)
                }
            ]);
        };
        const buildAssignmentsForFlightPath = (flight, path, headingBlend) => {
            const resolvedPath = dedupePath(path);
            if (resolvedPath.length < 2) {
                const start = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                resolvedPath.push(host.offsetAirShowPoint(start, corridor.axis.x, corridor.axis.y));
            }
            return host.buildAirShowFlightAssignments(flight, resolvedPath, headingBlend, 0, 1, { phaseStartAnchor: resolvedPath[0] });
        };
        const bomberPlans = bomberFlights.map((bomberFlight, index) => {
            const profile = initialBomberApproachProfilesById.get(bomberFlight.spec.id);
            const start = host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
            const laneIndex = profile?.laneIndex ?? (bomberFlights.length <= 1 ? 0 : index - (bomberFlights.length - 1) / 2);
            const targetCenter = profile?.targetCenter
                ?? bomberTargetCentersById.get(bomberFlight.spec.id)
                ?? averageBomberTargetCenter
                ?? corridor.strike;
            const laneOffsetPx = laneIndex * 22 + (bomberFlight.spec.laneOffsetPx ?? 0) * 0.35;
            const turnEntry = host.offsetAirShowPoint(targetCenter, -corridor.axis.x * 78 + corridor.normal.x * laneOffsetPx, -corridor.axis.y * 78 + corridor.normal.y * laneOffsetPx);
            const turnSideSign = laneIndex >= 0 ? 1 : -1;
            const nearTarget = host.offsetAirShowPoint(targetCenter, -corridor.axis.x * 30 + corridor.normal.x * laneOffsetPx, -corridor.axis.y * 30 + corridor.normal.y * laneOffsetPx);
            const turnApex = host.offsetAirShowPoint(targetCenter, -corridor.axis.x * 42 + corridor.normal.x * (laneOffsetPx + turnSideSign * 92), -corridor.axis.y * 42 + corridor.normal.y * (laneOffsetPx + turnSideSign * 92));
            const turnExit = host.offsetAirShowPoint(targetCenter, -corridor.axis.x * 124 + corridor.normal.x * (laneOffsetPx + turnSideSign * 154), -corridor.axis.y * 124 + corridor.normal.y * (laneOffsetPx + turnSideSign * 154));
            return {
                flight: bomberFlight,
                preTargetPath: smoothCorridorPath(start, turnEntry, laneIndex * 8),
                targetRunPath: dedupePath([turnEntry, nearTarget, turnApex, turnExit]),
                targetCenter
            };
        });
        const preTargetFractions = new Map([
            ["fighter-ingress", [0, 0.2]],
            ["escort-clash-merge", [0.2, 0.4]],
            ["escort-clash-scramble", [0.4, 0.62]],
            ["bomber-ingress", [0.62, 0.66]],
            ["bomber-defense-pass", [0.66, 1]]
        ]);
        const resolveBomberPhasePath = (plan, label) => {
            const [startProgress, endProgress] = preTargetFractions.get(label) ?? [0, 1];
            const lengthPx = measurePathLength(plan.preTargetPath);
            return slicePathByDistanceRange(plan.preTargetPath, lengthPx * startProgress, lengthPx * endProgress);
        };
        const phaseDurationMs = (label) => {
            const longestPathPx = bomberPlans.reduce((longest, plan) => Math.max(longest, measurePathLength(resolveBomberPhasePath(plan, label))), 0);
            return Math.max(1, Math.round(longestPathPx / host.airShowBomberSpeedPxPerMs));
        };
        const durationByPhase = new Map([
            ["fighter-ingress", phaseDurationMs("fighter-ingress")],
            ["escort-clash-merge", phaseDurationMs("escort-clash-merge")],
            ["escort-clash-scramble", phaseDurationMs("escort-clash-scramble")],
            ["bomber-ingress", phaseDurationMs("bomber-ingress")],
            ["bomber-defense-pass", phaseDurationMs("bomber-defense-pass")]
        ]);
        const targetRunDurationMs = Math.max(1, Math.round(bomberPlans.reduce((longest, plan) => Math.max(longest, measurePathLength(plan.targetRunPath)), 0)
            / host.airShowBomberSpeedPxPerMs));
        const roleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: host.airShowBomberSpeedPxPerMs
        });
        const buildBomberPhaseAssignments = (label) => bomberPlans.flatMap((plan) => buildAssignmentsForFlightPath(plan.flight, resolveBomberPhasePath(plan, label), 0.22));
        const averageBomberPointAtPreTargetProgress = (progress) => host.averageAirShowPoints(bomberPlans.map((plan) => pointAtPathDistance(plan.preTargetPath, measurePathLength(plan.preTargetPath) * host.clamp(progress, 0, 1))))
            ?? corridor.strike;
        const buildFighterGroups = () => {
            const interceptors = activeFlights(interceptorFlights);
            const escorts = activeFlights(escortFlights);
            if (escorts.length <= 0) {
                return interceptors.map((flight, index) => ({
                    interceptorFlights: [flight],
                    escortFlights: [],
                    lane: interceptors.length <= 1 ? 0 : index - (interceptors.length - 1) / 2
                }));
            }
            const groupCount = Math.max(1, Math.min(interceptors.length, escorts.length));
            const groups = Array.from({ length: groupCount }, (_, index) => ({
                interceptorFlights: interceptors[index] ? [interceptors[index]] : [],
                escortFlights: escorts[index] ? [escorts[index]] : [],
                lane: groupCount <= 1 ? 0 : index - (groupCount - 1) / 2
            }));
            interceptors.slice(groupCount).forEach((flight, index) => {
                groups[index % groups.length].interceptorFlights.push(flight);
            });
            escorts.slice(groupCount).forEach((flight, index) => {
                groups[index % groups.length].escortFlights.push(flight);
            });
            return groups;
        };
        const fighterGroups = buildFighterGroups();
        const resolveGroupLane = (group, flight, role) => {
            const roleFlights = role === "interceptor" ? group.interceptorFlights : group.escortFlights;
            const localIndex = Math.max(0, roleFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id));
            const localLane = roleFlights.length <= 1 ? 0 : localIndex - (roleFlights.length - 1) / 2;
            return group.lane + localLane * 0.42;
        };
        const fighterIngressRoleSeparationPx = 104;
        const fightCenter = (preTargetProgress, groupLane, leadPx = 34) => {
            const bomberPoint = averageBomberPointAtPreTargetProgress(preTargetProgress);
            return host.offsetAirShowPoint(bomberPoint, corridor.axis.x * leadPx + corridor.normal.x * groupLane * 58, corridor.axis.y * leadPx + corridor.normal.y * groupLane * 58);
        };
        const buildFighterPhaseAssignments = (label) => {
            const assignments = [];
            fighterGroups.forEach((group) => {
                [
                    ...group.interceptorFlights.map((flight) => ({ flight, role: "interceptor" })),
                    ...group.escortFlights.map((flight) => ({ flight, role: "escort" }))
                ].forEach(({ flight, role }) => {
                    const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                    const lane = resolveGroupLane(group, flight, role);
                    const roleSide = role === "interceptor" ? 1 : -1;
                    let path;
                    if (label === "fighter-ingress") {
                        const centerPoint = fightCenter(0.2, lane, 8);
                        const separatedTarget = host.offsetAirShowPoint(centerPoint, corridor.axis.x * roleSide * 12 + corridor.normal.x * roleSide * fighterIngressRoleSeparationPx, corridor.axis.y * roleSide * 12 + corridor.normal.y * roleSide * fighterIngressRoleSeparationPx);
                        const target = {
                            cx: separatedTarget.cx + (center.cx - separatedTarget.cx) * 0.03,
                            cy: separatedTarget.cy + (center.cy - separatedTarget.cy) * 0.03
                        };
                        const ingressDurationMs = durationByPhase.get("fighter-ingress") ?? 1;
                        const ingressLengthPx = Math.max(96, ingressDurationMs * host.airShowFighterSpeedPxPerMs);
                        const approach = normalizeVector(target.cx - current.cx, target.cy - current.cy, corridor.axis.x * roleSide, corridor.axis.y * roleSide);
                        const start = {
                            cx: target.cx - approach.x * ingressLengthPx,
                            cy: target.cy - approach.y * ingressLengthPx
                        };
                        path = dedupePath([start, target]);
                    }
                    else if (label === "escort-clash-merge") {
                        const centerPoint = fightCenter(0.4, lane, 30);
                        const passPoint = host.offsetAirShowPoint(centerPoint, corridor.normal.x * lane * 8, corridor.normal.y * lane * 8);
                        const exitPoint = host.offsetAirShowPoint(centerPoint, -corridor.axis.x * roleSide * 28 + corridor.normal.x * lane * 8, -corridor.axis.y * roleSide * 28 + corridor.normal.y * lane * 8);
                        path = dedupePath([
                            current,
                            host.offsetAirShowPoint(current, (passPoint.cx - current.cx) * 0.42 + corridor.normal.x * roleSide * 12, (passPoint.cy - current.cy) * 0.42 + corridor.normal.y * roleSide * 12),
                            passPoint,
                            exitPoint
                        ]);
                    }
                    else if (label === "escort-clash-scramble") {
                        const centerPoint = fightCenter(0.62, lane, 22);
                        path = dedupePath([
                            current,
                            host.offsetAirShowPoint(centerPoint, -corridor.axis.x * roleSide * 8 + corridor.normal.x * (lane * 8 + roleSide * 6), -corridor.axis.y * roleSide * 8 + corridor.normal.y * (lane * 8 + roleSide * 6)),
                            host.offsetAirShowPoint(centerPoint, corridor.normal.x * lane * 6, corridor.normal.y * lane * 6),
                            host.offsetAirShowPoint(centerPoint, -corridor.axis.x * 54 + corridor.normal.x * lane * 18, -corridor.axis.y * 54 + corridor.normal.y * lane * 18)
                        ]);
                    }
                    else if (label === "bomber-ingress") {
                        const centerPoint = averageBomberPointAtPreTargetProgress(0.66);
                        const target = role === "interceptor"
                            ? host.offsetAirShowPoint(centerPoint, -corridor.axis.x * 76 + corridor.normal.x * (lane * 30 - 10), -corridor.axis.y * 76 + corridor.normal.y * (lane * 30 - 10))
                            : host.offsetAirShowPoint(centerPoint, -corridor.axis.x * 44 + corridor.normal.x * (lane * 36 + 96), -corridor.axis.y * 44 + corridor.normal.y * (lane * 36 + 96));
                        path = buildSpeedMatchedCorridorPath(current, target, durationByPhase.get("bomber-ingress") ?? 1, host.airShowFighterSpeedPxPerMs, role === "interceptor" ? -1 : 1);
                    }
                    else if (role === "interceptor") {
                        const interceptorIndex = activeFlights(interceptorFlights).findIndex((candidate) => candidate.spec.id === flight.spec.id);
                        const targetPlan = bomberPlans[Math.max(0, interceptorIndex) % Math.max(1, bomberPlans.length)];
                        const focusPoint = targetPlan
                            ? pointAtPathDistance(targetPlan.preTargetPath, measurePathLength(targetPlan.preTargetPath) * 0.84)
                            : averageBomberPointAtPreTargetProgress(0.84);
                        const aimPoint = host.offsetAirShowPoint(focusPoint, corridor.normal.x * lane * 16, corridor.normal.y * lane * 16);
                        path = buildSpeedMatchedPassPath(current, aimPoint, durationByPhase.get("bomber-defense-pass") ?? 1, host.airShowFighterSpeedPxPerMs, lane >= 0 ? 1 : -1);
                    }
                    else {
                        const centerPoint = averageBomberPointAtPreTargetProgress(0.86);
                        path = smoothCorridorPath(current, host.offsetAirShowPoint(centerPoint, corridor.axis.x * 86 + corridor.normal.x * (lane * 42 + 160), corridor.axis.y * 86 + corridor.normal.y * (lane * 42 + 160)), 22);
                    }
                    assignments.push(...buildAssignmentsForFlightPath(flight, path, 0.34));
                });
            });
            return assignments;
        };
        const buildDogfightTracers = (assignments, label) => {
            const tracers = [];
            const isMerge = label === "escort-clash-merge";
            fighterGroups.forEach((group, groupIndex) => {
                group.interceptorFlights.forEach((interceptorFlight, index) => {
                    const escortTarget = group.escortFlights[(index + (isMerge ? 0 : 1)) % Math.max(1, group.escortFlights.length)];
                    if (!escortTarget) {
                        return;
                    }
                    tracers.push(...host.buildAirShowDynamicTracerVolley(assignments, interceptorFlight, escortTarget, {
                        emitter: "nose",
                        color: "#fff5cf",
                        width: 0.66,
                        lifetimeMs: 40,
                        spreadPx: isMerge ? 6 : 7,
                        streakLengthPx: isMerge ? 126 : 136,
                        visibleLengthPx: isMerge ? 10 : 11,
                        fanHalfAngleDeg: 2.4,
                        burstCount: isMerge ? 3 : 4,
                        maxAlignmentDeg: 72,
                        maxRangePx: 230,
                        timings: isMerge ? [0.6, 0.72, 0.84] : [0.18, 0.3, 0.44, 0.58, 0.72],
                        fallbackToNearest: true
                    }));
                });
                group.escortFlights.forEach((escortFlight, index) => {
                    const interceptorTarget = group.interceptorFlights[(index + groupIndex + (isMerge ? 0 : 1)) % Math.max(1, group.interceptorFlights.length)];
                    if (!interceptorTarget) {
                        return;
                    }
                    tracers.push(...host.buildAirShowDynamicTracerVolley(assignments, escortFlight, interceptorTarget, {
                        emitter: "nose",
                        color: "#ffd98a",
                        width: 0.58,
                        lifetimeMs: 38,
                        spreadPx: isMerge ? 5 : 6,
                        streakLengthPx: isMerge ? 118 : 128,
                        visibleLengthPx: isMerge ? 9 : 10,
                        fanHalfAngleDeg: 2,
                        burstCount: isMerge ? 2 : 3,
                        maxAlignmentDeg: 72,
                        maxRangePx: 220,
                        timings: isMerge ? [0.62, 0.76, 0.88] : [0.22, 0.36, 0.5, 0.64, 0.78],
                        fallbackToNearest: true
                    }));
                });
            });
            return tracers;
        };
        const resolveRangedFlakBursts = (assignments, durationMs, phase) => {
            const assignmentsByActorId = host.buildAirShowAssignmentLookup(assignments);
            const rangePx = HEX_WIDTH * 8;
            return bomberPlans.flatMap((plan) => {
                const scoped = host.resolveAirShowBomberFlakBursts(scene, plan.flight.spec.id);
                if (scoped.length <= 0) {
                    return [];
                }
                const splitIndex = host.clamp(Math.round(scoped.length * 0.45), 1, Math.max(1, scoped.length - 1));
                const phaseBursts = scoped.length <= 1
                    ? (phase === "target" ? scoped : [])
                    : (phase === "defense" ? scoped.slice(0, splitIndex) : scoped.slice(splitIndex));
                const localStart = phase === "defense" ? 0.18 : 0.08;
                const localEnd = phase === "defense" ? 0.88 : 0.72;
                return phaseBursts.flatMap((burst, index) => {
                    const progress = phaseBursts.length <= 1
                        ? (localStart + localEnd) / 2
                        : localStart + (index / Math.max(1, phaseBursts.length - 1)) * (localEnd - localStart);
                    const sampledActorPositions = plan.flight.actors.flatMap((actor) => {
                        const assignment = assignmentsByActorId.get(actor.id);
                        return assignment
                            ? [host.sampleAirShowAssignmentAtTime(assignment, durationMs * progress, durationMs).position]
                            : [];
                    });
                    const bomberCenter = host.averageAirShowPoints(sampledActorPositions);
                    const targetCenter = (burst.targetHexKey ? host.resolveHexCenterByKey(burst.targetHexKey) : null) ?? plan.targetCenter;
                    const batteryCenter = burst.batteryHexKey ? host.resolveHexCenterByKey(burst.batteryHexKey) : null;
                    const rangeReferenceCenter = batteryCenter ?? targetCenter;
                    if (!bomberCenter
                        || Math.hypot(bomberCenter.cx - rangeReferenceCenter.cx, bomberCenter.cy - rangeReferenceCenter.cy) > rangePx) {
                        return [];
                    }
                    return [{
                            ...burst,
                            progress,
                            bomberUnitKey: plan.flight.spec.id,
                            targetHexKey: burst.targetHexKey
                                ?? bomberSpecsById.get(plan.flight.spec.id)?.targetHexKey
                                ?? scene.bomberTargetHexKey
                                ?? null,
                            batteryHexKey: burst.batteryHexKey ?? null
                        }];
                });
            });
        };
        const recordCorridorPhase = (label, fighterAssignments, tracerBursts = [], flakBursts = []) => {
            const durationMs = durationByPhase.get(label) ?? 1;
            const assignments = [...buildBomberPhaseAssignments(label), ...fighterAssignments];
            recordPhase(label, assignments, durationMs, tracerBursts, flakBursts, roleSpeeds);
            previousPhaseAssignments = assignments;
            previousPhaseDurationMs = durationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        };
        recordCorridorPhase("fighter-ingress", buildFighterPhaseAssignments("fighter-ingress"));
        if (escortFlights.length > 0) {
            const mergeAssignments = [...buildBomberPhaseAssignments("escort-clash-merge"), ...buildFighterPhaseAssignments("escort-clash-merge")];
            const mergeDurationMs = durationByPhase.get("escort-clash-merge") ?? 1;
            recordPhase("escort-clash-merge", mergeAssignments, mergeDurationMs, buildDogfightTracers(mergeAssignments, "escort-clash-merge"), [], roleSpeeds);
            previousPhaseAssignments = mergeAssignments;
            previousPhaseDurationMs = mergeDurationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
            const scrambleAssignments = [...buildBomberPhaseAssignments("escort-clash-scramble"), ...buildFighterPhaseAssignments("escort-clash-scramble")];
            const scrambleDurationMs = durationByPhase.get("escort-clash-scramble") ?? 1;
            recordPhase("escort-clash-scramble", scrambleAssignments, scrambleDurationMs, buildDogfightTracers(scrambleAssignments, "escort-clash-scramble"), [], roleSpeeds);
            previousPhaseAssignments = scrambleAssignments;
            previousPhaseDurationMs = scrambleDurationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        }
        recordCorridorPhase("bomber-ingress", buildFighterPhaseAssignments("bomber-ingress"));
        const bomberDefenseAssignments = [...buildBomberPhaseAssignments("bomber-defense-pass"), ...buildFighterPhaseAssignments("bomber-defense-pass")];
        const bomberDefenseDurationMs = durationByPhase.get("bomber-defense-pass") ?? 1;
        const bomberDefenseTracers = [];
        activeFlights(interceptorFlights).forEach((interceptorFlight, index) => {
            const targetBomber = bomberFlights[index % Math.max(1, bomberFlights.length)];
            if (!targetBomber) {
                return;
            }
            bomberDefenseTracers.push(...host.buildAirShowDynamicTracerVolley(bomberDefenseAssignments, interceptorFlight, targetBomber, {
                emitter: "nose",
                color: "#fff5cf",
                width: 0.66,
                lifetimeMs: 40,
                spreadPx: 7,
                streakLengthPx: 138,
                visibleLengthPx: 11,
                fanHalfAngleDeg: 2.2,
                burstCount: 4,
                maxAlignmentDeg: 78,
                maxRangePx: 240,
                timings: [0.2, 0.32, 0.44, 0.56, 0.68],
                fallbackToNearest: true
            }), ...host.buildAirShowDynamicTracerVolley(bomberDefenseAssignments, targetBomber, interceptorFlight, {
                emitter: "center",
                color: "#fff1c8",
                width: 0.38,
                lifetimeMs: 34,
                spreadPx: 4,
                streakLengthPx: 94,
                visibleLengthPx: 8,
                fanHalfAngleDeg: 1.2,
                burstCount: 2,
                maxAlignmentDeg: 120,
                maxRangePx: 220,
                timings: [0.28, 0.46, 0.64],
                fallbackToNearest: true
            }));
        });
        recordPhase("bomber-defense-pass", bomberDefenseAssignments, bomberDefenseDurationMs, bomberDefenseTracers, resolveRangedFlakBursts(bomberDefenseAssignments, bomberDefenseDurationMs, "defense"), roleSpeeds);
        previousPhaseAssignments = bomberDefenseAssignments;
        previousPhaseDurationMs = bomberDefenseDurationMs;
        updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        interceptorFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
        escortFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
        const targetRunFighterAssignments = [...activeFlights(interceptorFlights), ...activeFlights(escortFlights)].flatMap((flight, index, flights) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const home = resolveFighterHomePoint(flight, index, Math.max(1, flights.length));
            return buildAssignmentsForFlightPath(flight, host.buildAirShowDisengagePath(current, home, {
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                lateralSign: flight.spec.role === "interceptor" ? -1 : 1,
                corridorWidthPx: 24,
                driftPx: 22,
                preferForwardContinuous: true
            }), 0.28);
        });
        const targetRunAssignments = [
            ...bomberPlans.flatMap((plan) => buildAssignmentsForFlightPath(plan.flight, plan.targetRunPath, 0.24)),
            ...targetRunFighterAssignments
        ];
        recordPhase("target-run", targetRunAssignments, targetRunDurationMs, [], resolveRangedFlakBursts(targetRunAssignments, targetRunDurationMs, "target"), roleSpeeds);
        previousPhaseAssignments = targetRunAssignments;
        previousPhaseDurationMs = targetRunDurationMs;
        updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        bomberFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
        const egressFighterFlights = [...activeFlights(interceptorFlights), ...activeFlights(escortFlights)];
        const egressFighterAssignments = egressFighterFlights.flatMap((flight, index) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const home = resolveFighterHomePoint(flight, index, Math.max(1, egressFighterFlights.length));
            return buildAssignmentsForFlightPath(flight, host.buildAirShowDisengagePath(current, home, {
                startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                lateralSign: flight.spec.role === "interceptor" ? -1 : 1,
                corridorWidthPx: 26,
                driftPx: 18,
                preferForwardContinuous: true
            }), 0.26);
        });
        const egressAssignments = [...buildBomberEgressAssignments(activeFlights(bomberFlights)), ...egressFighterAssignments];
        if (egressAssignments.length > 0) {
            const egressDurationMs = Math.max(1, Math.round(egressAssignments.reduce((longest, assignment) => Math.max(longest, measurePathLength(assignment.points)), 0)
                / host.airShowBomberSpeedPxPerMs));
            recordPhase("egress", egressAssignments, egressDurationMs, [], [], roleSpeeds);
        }
        return buildPlannedAirShowSceneReport();
    };
    const corridorContestedPlan = buildCorridorContestedAirShowPlan();
    if (corridorContestedPlan) {
        return corridorContestedPlan;
    }
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
            harmonizeIngressVisibility: true,
            softenExitRoles: ["interceptor", "escort"],
            softenExitTurnLimitDeg: 98,
            softenExitWaypointCount: 6
        });
        recordPhase("fighter-ingress", preparedFighterIngressAssignments, governedFighterIngressPlan.durationMs, [], [], governedFighterIngressPlan.roleSpeeds);
        previousPhaseAssignments = preparedFighterIngressAssignments;
        previousPhaseDurationMs = governedFighterIngressPlan.durationMs;
        updateFlightAnchors([...interceptorFlights, ...escortFlights, ...bomberFlights]);
    }
    const escortExchanges = scene.escortExchanges ?? [];
    if (escortExchanges.length > 0 || (interceptorFlights.length > 0 && escortFlights.length > 0)) {
        const rawEscortPairs = escortExchanges
            .map((exchange) => {
            const directInterceptor = flightMap.get(exchange.attackerUnitKey);
            const directEscort = flightMap.get(exchange.defenderUnitKey);
            if (directInterceptor?.spec.role === "interceptor"
                && directEscort?.spec.role === "escort") {
                return {
                    exchange,
                    interceptorFlight: directInterceptor,
                    escortFlight: directEscort,
                    source: "event"
                };
            }
            const reverseInterceptor = flightMap.get(exchange.defenderUnitKey);
            const reverseEscort = flightMap.get(exchange.attackerUnitKey);
            if (reverseInterceptor?.spec.role === "interceptor"
                && reverseEscort?.spec.role === "escort") {
                return {
                    exchange,
                    interceptorFlight: reverseInterceptor,
                    escortFlight: reverseEscort,
                    source: "event"
                };
            }
            return null;
        })
            .filter((entry) => !!entry);
        const uniqueEscortPairs = Array.from(new Map(rawEscortPairs.map((entry) => [
            `${entry.escortFlight.spec.id}:${entry.interceptorFlight.spec.id}`,
            entry
        ])).values());
        const resolveFlightCurrentPoint = (flight) => host.averageAirShowPosition(flight.actors) ?? flight.anchor;
        const resolveFlightDistancePx = (left, right) => {
            const leftPoint = resolveFlightCurrentPoint(left);
            const rightPoint = resolveFlightCurrentPoint(right);
            return Math.hypot(leftPoint.cx - rightPoint.cx, leftPoint.cy - rightPoint.cy);
        };
        const seededEscortPairs = [...uniqueEscortPairs]
            .sort((left, right) => resolveFlightDistancePx(left.interceptorFlight, left.escortFlight)
            - resolveFlightDistancePx(right.interceptorFlight, right.escortFlight))
            .reduce((selected, pair) => {
            const interceptorAlreadySeeded = selected.some((entry) => entry.interceptorFlight.spec.id === pair.interceptorFlight.spec.id);
            const escortAlreadySeeded = selected.some((entry) => entry.escortFlight.spec.id === pair.escortFlight.spec.id);
            if (interceptorAlreadySeeded || escortAlreadySeeded) {
                return selected;
            }
            selected.push(pair);
            return selected;
        }, []);
        if (seededEscortPairs.length > 0 || (interceptorFlights.length > 0 && escortFlights.length > 0)) {
            const escortBeatCount = 2;
            for (let beat = 0; beat < escortBeatCount; beat += 1) {
                const defaultEscortBeatDurationMs = beat === 0 ? plannedEscortMergeDurationMs : plannedEscortScrambleDurationMs;
                const phaseAssignments = [];
                const tracerBursts = [];
                const activeInterceptorFlights = activeFlights(interceptorFlights);
                const activeEscortFlights = activeFlights(escortFlights);
                const activeBomberFlights = activeFlights(bomberFlights);
                const escortBeatHasActiveBombers = bomberFlights.some((flight) => flight.actors.some((actor) => actor.active));
                const resolvedEscortBeatDurationDefaultMs = beat === 1 && escortBeatHasActiveBombers
                    ? Math.round(defaultEscortBeatDurationMs * 0.8)
                    : defaultEscortBeatDurationMs;
                const escortClashFlightsById = new Map([...activeInterceptorFlights, ...activeEscortFlights].map((flight) => [flight.spec.id, flight]));
                const rawClashCenter = host.resolveAirShowEscortClashCenter(corridor, activeInterceptorFlights, activeEscortFlights, beat);
                const bomberCenterForClash = beat === 1
                    ? host.averageAirShowPoints(activeBomberFlights.map(resolveFlightCurrentPoint))
                    : null;
                const clashCenter = bomberCenterForClash && activeBomberFlights.length > 0
                    ? {
                        cx: rawClashCenter.cx * 0.12 + bomberCenterForClash.cx * 0.88,
                        cy: rawClashCenter.cy * 0.12 + bomberCenterForClash.cy * 0.88
                    }
                    : rawClashCenter;
                const activeEscortPairs = seededEscortPairs.filter((pair) => pair.interceptorFlight.actors.some((actor) => actor.active)
                    && pair.escortFlight.actors.some((actor) => actor.active));
                const engagedInterceptorIds = new Set(activeEscortPairs.map((pair) => pair.interceptorFlight.spec.id));
                const engagedEscortIds = new Set(activeEscortPairs.map((pair) => pair.escortFlight.spec.id));
                const supplementalInterceptors = activeInterceptorFlights.filter((flight) => !engagedInterceptorIds.has(flight.spec.id));
                const supplementalEscorts = activeEscortFlights.filter((flight) => !engagedEscortIds.has(flight.spec.id));
                while (supplementalInterceptors.length > 0 && supplementalEscorts.length > 0) {
                    let bestInterceptorIndex = 0;
                    let bestEscortIndex = 0;
                    let bestDistancePx = Number.POSITIVE_INFINITY;
                    supplementalInterceptors.forEach((interceptorFlight, interceptorIndex) => {
                        supplementalEscorts.forEach((escortFlight, escortIndex) => {
                            const separationPx = resolveFlightDistancePx(interceptorFlight, escortFlight);
                            if (separationPx < bestDistancePx) {
                                bestDistancePx = separationPx;
                                bestInterceptorIndex = interceptorIndex;
                                bestEscortIndex = escortIndex;
                            }
                        });
                    });
                    const interceptorFlight = supplementalInterceptors.splice(bestInterceptorIndex, 1)[0];
                    const escortFlight = supplementalEscorts.splice(bestEscortIndex, 1)[0];
                    if (!interceptorFlight || !escortFlight) {
                        break;
                    }
                    activeEscortPairs.push({
                        exchange: null,
                        interceptorFlight,
                        escortFlight,
                        source: "synthetic"
                    });
                    engagedInterceptorIds.add(interceptorFlight.spec.id);
                    engagedEscortIds.add(escortFlight.spec.id);
                }
                const escortGroups = activeEscortPairs.map((pair) => ({
                    pair,
                    interceptorFlights: [pair.interceptorFlight],
                    escortFlights: [pair.escortFlight]
                }));
                const assignFlightToNearestEngagementGroup = (flight, role) => {
                    if (escortGroups.length <= 0) {
                        return false;
                    }
                    const current = resolveFlightCurrentPoint(flight);
                    let bestGroup = escortGroups[0];
                    let bestDistancePx = Number.POSITIVE_INFINITY;
                    escortGroups.forEach((group) => {
                        const counterpartFlights = role === "interceptor"
                            ? group.escortFlights
                            : group.interceptorFlights;
                        const counterpartCenter = host.averageAirShowPoints(counterpartFlights.map(resolveFlightCurrentPoint))
                            ?? clashCenter;
                        const distancePx = Math.hypot(counterpartCenter.cx - current.cx, counterpartCenter.cy - current.cy);
                        if (distancePx < bestDistancePx) {
                            bestDistancePx = distancePx;
                            bestGroup = group;
                        }
                    });
                    if (role === "interceptor") {
                        bestGroup.interceptorFlights.push(flight);
                    }
                    else {
                        bestGroup.escortFlights.push(flight);
                    }
                    return true;
                };
                activeInterceptorFlights
                    .filter((flight) => !engagedInterceptorIds.has(flight.spec.id))
                    .forEach((flight) => {
                    if (assignFlightToNearestEngagementGroup(flight, "interceptor")) {
                        engagedInterceptorIds.add(flight.spec.id);
                    }
                });
                activeEscortFlights
                    .filter((flight) => !engagedEscortIds.has(flight.spec.id))
                    .forEach((flight) => {
                    if (assignFlightToNearestEngagementGroup(flight, "escort")) {
                        engagedEscortIds.add(flight.spec.id);
                    }
                });
                const resolveEscortEngagementClashPoint = (group, pairIndex) => {
                    const isSyntheticPair = group.pair.source === "synthetic";
                    const engagementMidpoint = host.averageAirShowPoints([
                        ...group.interceptorFlights.map(resolveFlightCurrentPoint),
                        ...group.escortFlights.map(resolveFlightCurrentPoint)
                    ])
                        ?? clashCenter;
                    const baseProjection = host.resolveAirShowCorridorCoordinates(corridor, clashCenter);
                    const midpointProjection = host.resolveAirShowCorridorCoordinates(corridor, engagementMidpoint);
                    const pairLane = escortGroups.length <= 1
                        ? 0
                        : pairIndex - (escortGroups.length - 1) / 2;
                    const alongLimitPx = beat === 0
                        ? 56
                        : activeBomberFlights.length > 0
                            ? 340
                            : 78;
                    const projectedPoint = host.projectAirShowCorridorPoint(corridor, host.clamp(baseProjection.alongPx * (isSyntheticPair ? (beat === 0 ? 0.34 : 0.26) : (beat === 0 ? 0.62 : 0.5))
                        + midpointProjection.alongPx * (isSyntheticPair ? (beat === 0 ? 0.66 : 0.74) : (beat === 0 ? 0.38 : 0.5)), -alongLimitPx, alongLimitPx), host.clamp(baseProjection.lateralPx * (isSyntheticPair ? 0.14 : 0.34)
                        + midpointProjection.lateralPx * (isSyntheticPair ? 0.56 : 0.26)
                        + pairLane * (isSyntheticPair ? (beat === 0 ? 14 : 16) : (beat === 0 ? 20 : 22)), -60, 60));
                    return projectedPoint;
                };
                const groupStates = escortGroups.map((group, pairIndex) => {
                    const groupCenter = resolveEscortEngagementClashPoint(group, pairIndex);
                    const groupProjection = host.resolveAirShowCorridorCoordinates(corridor, groupCenter);
                    return {
                        group,
                        groupCenter,
                        groupProjection
                    };
                });
                const escortCombatFocusByFlightId = new Map();
                groupStates.forEach((state) => {
                    [...state.group.interceptorFlights, ...state.group.escortFlights].forEach((flight) => {
                        escortCombatFocusByFlightId.set(flight.spec.id, state.groupCenter);
                    });
                });
                groupStates.forEach((state) => {
                    const crowdedGroup = state.group.interceptorFlights.length > 1
                        || state.group.escortFlights.length > 1;
                    const isSyntheticGroup = state.group.pair.source === "synthetic";
                    const hasActiveBomberFlights = bomberFlights.some((flight) => flight.actors.some((actor) => actor.active));
                    const scrambleTighteningRadiusPx = hasActiveBomberFlights
                        ? (crowdedGroup ? 30 : 34)
                        : (crowdedGroup ? 72 : 80);
                    state.group.interceptorFlights.forEach((flight, interceptorIndex) => {
                        const targetEscortFlight = state.group.escortFlights[interceptorIndex % Math.max(1, state.group.escortFlights.length)]
                            ?? state.group.pair.escortFlight;
                        const targetEscortPoint = resolveFlightCurrentPoint(targetEscortFlight);
                        const current = resolveFlightCurrentPoint(flight);
                        const localLane = state.group.interceptorFlights.length <= 1
                            ? 0
                            : interceptorIndex - (state.group.interceptorFlights.length - 1) / 2;
                        const pairFightMidpoint = {
                            cx: (current.cx + targetEscortPoint.cx) / 2,
                            cy: (current.cy + targetEscortPoint.cy) / 2
                        };
                        const localizedFightCenter = {
                            cx: pairFightMidpoint.cx * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cx * (crowdedGroup ? 0.26 : 0.12),
                            cy: pairFightMidpoint.cy * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cy * (crowdedGroup ? 0.26 : 0.12)
                        };
                        const localizedProjection = host.resolveAirShowCorridorCoordinates(corridor, localizedFightCenter);
                        const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
                        const sideSign = host.resolveAirShowRouteSideSign(current, localizedFightCenter, startHeadingDegrees, localLane <= 0 ? -1 : 1);
                        const syntheticClosurePoint = {
                            cx: current.cx + (localizedFightCenter.cx - current.cx) * 0.82,
                            cy: current.cy + (localizedFightCenter.cy - current.cy) * 0.82
                        };
                        const sharedScrambleFocusPoint = host.projectAirShowCorridorPoint(corridor, state.groupProjection.alongPx + localLane * 0.5, state.groupProjection.lateralPx + localLane * (crowdedGroup ? 4 : 7));
                        const scrambleFocusPoint = host.projectAirShowCorridorPoint(corridor, localizedProjection.alongPx + 1 + localLane * 2, localizedProjection.lateralPx + localLane * (crowdedGroup ? 6 : 12));
                        const scrambleRouteDot = resolveRouteHeadingDot(current, scrambleFocusPoint, startHeadingDegrees);
                        const preferContinuousScrambleClosure = !hasActiveBomberFlights
                            || crowdedGroup
                            || isSyntheticGroup
                            || scrambleRouteDot <= (hasActiveBomberFlights ? 0.16 : 0.34);
                        const scrambleTighteningFocusPoint = hasActiveBomberFlights
                            ? sharedScrambleFocusPoint
                            : scrambleFocusPoint;
                        const scrambleJoinPath = hasActiveBomberFlights
                            ? (preferContinuousScrambleClosure
                                ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    minRouteDot: -0.08,
                                    carryForwardPx: crowdedGroup ? 28 : 34,
                                    earlyAlongPx: crowdedGroup ? 46 : 58,
                                    midAlongPx: crowdedGroup ? 74 : 92,
                                    lateAlongPx: crowdedGroup ? 98 : 118,
                                    entryLateralPx: 12 + Math.abs(localLane) * 3,
                                    midLateralPx: 5 + Math.abs(localLane) * 1.5,
                                    lateLateralPx: 2 + Math.abs(localLane)
                                })
                                : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    entryLateralPx: 3 + Math.abs(localLane),
                                    mergeLateralPx: Math.max(1, Math.abs(localLane) * 2),
                                    attackOffsetPx: localLane * 3,
                                    closeInPx: 2,
                                    overshootPx: crowdedGroup ? 2 : 3,
                                    breakLateralPx: 3 + Math.abs(localLane) * 1.5,
                                    breakForwardPx: crowdedGroup ? 2 : 3,
                                    driftPx: 1
                                }))
                            : (preferContinuousScrambleClosure
                                ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    minRouteDot: -0.12,
                                    carryForwardPx: crowdedGroup ? 48 : 58,
                                    earlyAlongPx: crowdedGroup ? 72 : 84,
                                    midAlongPx: crowdedGroup ? 108 : 126,
                                    lateAlongPx: crowdedGroup ? 142 : 164,
                                    entryLateralPx: 18 + Math.abs(localLane) * (crowdedGroup ? 4 : 5),
                                    midLateralPx: 8 + Math.abs(localLane) * 2,
                                    lateLateralPx: 3 + Math.abs(localLane) * 1.5
                                })
                                : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    entryLateralPx: 4 + Math.abs(localLane) * 2,
                                    mergeLateralPx: Math.max(1, Math.abs(localLane) * 3),
                                    attackOffsetPx: localLane * 6,
                                    closeInPx: crowdedGroup ? 3 : 4,
                                    overshootPx: crowdedGroup ? 4 : 6,
                                    breakLateralPx: 6 + Math.abs(localLane) * 3,
                                    breakForwardPx: crowdedGroup ? 4 : 5,
                                    driftPx: 1
                                }));
                        const interceptorPath = beat === 0
                            ? host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, isSyntheticGroup && interceptorIndex === 0
                                ? host.buildAirShowCurvedPath(current, syntheticClosurePoint, -24 * sideSign, 10, startHeadingDegrees)
                                : host.buildAirShowMergePassPath(current, localizedFightCenter, corridor, {
                                    sideSign,
                                    laneIndex: localLane,
                                    startHeadingDegrees,
                                    entrySeparationPx: crowdedGroup ? 44 : 54,
                                    crossSeparationPx: crowdedGroup ? 4 : 5,
                                    overshootPx: crowdedGroup ? 18 : 24
                                }), 22), {
                                maxTurnDeg: 42,
                                strongTurnDeg: 86,
                                maxFirstSegmentPx: 64,
                                maxSharpTurnDeg: 116,
                                maxWaypointsToRemove: 2
                            })
                            : host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, tightenPathAroundFightSpace(scrambleJoinPath, scrambleTighteningFocusPoint, scrambleTighteningRadiusPx), hasActiveBomberFlights ? 22 : 30), {
                                maxTurnDeg: hasActiveBomberFlights ? 38 : 34,
                                strongTurnDeg: hasActiveBomberFlights ? 80 : 72,
                                maxFirstSegmentPx: hasActiveBomberFlights ? 58 : 52,
                                maxSharpTurnDeg: hasActiveBomberFlights ? 108 : 96,
                                maxWaypointsToRemove: hasActiveBomberFlights ? 2 : 3
                            });
                        phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, interceptorPath, 0.26, 0, 1));
                    });
                    state.group.escortFlights.forEach((flight, escortIndex) => {
                        const targetInterceptorFlight = state.group.interceptorFlights[escortIndex % Math.max(1, state.group.interceptorFlights.length)]
                            ?? state.group.pair.interceptorFlight;
                        const targetInterceptorPoint = resolveFlightCurrentPoint(targetInterceptorFlight);
                        const current = resolveFlightCurrentPoint(flight);
                        const localLane = state.group.escortFlights.length <= 1
                            ? 0
                            : escortIndex - (state.group.escortFlights.length - 1) / 2;
                        const pairFightMidpoint = {
                            cx: (current.cx + targetInterceptorPoint.cx) / 2,
                            cy: (current.cy + targetInterceptorPoint.cy) / 2
                        };
                        const localizedFightCenter = {
                            cx: pairFightMidpoint.cx * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cx * (crowdedGroup ? 0.26 : 0.12),
                            cy: pairFightMidpoint.cy * (crowdedGroup ? 0.74 : 0.88) + state.groupCenter.cy * (crowdedGroup ? 0.26 : 0.12)
                        };
                        const localizedProjection = host.resolveAirShowCorridorCoordinates(corridor, localizedFightCenter);
                        const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
                        const sideSign = host.resolveAirShowRouteSideSign(current, localizedFightCenter, startHeadingDegrees, localLane >= 0 ? 1 : -1);
                        const syntheticClosurePoint = {
                            cx: current.cx + (localizedFightCenter.cx - current.cx) * 0.88,
                            cy: current.cy + (localizedFightCenter.cy - current.cy) * 0.88
                        };
                        const sharedScrambleFocusPoint = host.projectAirShowCorridorPoint(corridor, state.groupProjection.alongPx + localLane * 0.5, state.groupProjection.lateralPx + localLane * (crowdedGroup ? 4 : 7));
                        const scrambleFocusPoint = host.projectAirShowCorridorPoint(corridor, localizedProjection.alongPx - 1 + localLane * 1.5, localizedProjection.lateralPx + localLane * (crowdedGroup ? 5 : 10));
                        const scrambleRouteDot = resolveRouteHeadingDot(current, scrambleFocusPoint, startHeadingDegrees);
                        const preferContinuousScrambleClosure = !hasActiveBomberFlights
                            || crowdedGroup
                            || isSyntheticGroup
                            || scrambleRouteDot <= (hasActiveBomberFlights ? 0.22 : 0.34);
                        const scrambleTighteningFocusPoint = hasActiveBomberFlights
                            ? sharedScrambleFocusPoint
                            : localizedFightCenter;
                        const escortScramblePath = hasActiveBomberFlights
                            ? (preferContinuousScrambleClosure
                                ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    minRouteDot: -0.08,
                                    carryForwardPx: crowdedGroup ? 24 : 30,
                                    earlyAlongPx: crowdedGroup ? 40 : 52,
                                    midAlongPx: crowdedGroup ? 66 : 84,
                                    lateAlongPx: crowdedGroup ? 88 : 108,
                                    entryLateralPx: 10 + Math.abs(localLane) * 2.5,
                                    midLateralPx: 4 + Math.abs(localLane) * 1.25,
                                    lateLateralPx: 2 + Math.abs(localLane) * 0.8
                                })
                                : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    entryLateralPx: 3 + Math.abs(localLane),
                                    mergeLateralPx: Math.max(1, Math.abs(localLane) * 1.5),
                                    attackOffsetPx: localLane * 2,
                                    closeInPx: 2,
                                    overshootPx: 2,
                                    breakLateralPx: 3 + Math.abs(localLane) * 1.5,
                                    breakForwardPx: 2,
                                    driftPx: 1
                                }))
                            : (preferContinuousScrambleClosure
                                ? buildForwardContinuousRoutePath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    minRouteDot: -0.14,
                                    carryForwardPx: crowdedGroup ? 30 : 36,
                                    earlyAlongPx: crowdedGroup ? 46 : 58,
                                    midAlongPx: crowdedGroup ? 74 : 90,
                                    lateAlongPx: crowdedGroup ? 98 : 118,
                                    entryLateralPx: 10 + Math.abs(localLane) * 2.5,
                                    midLateralPx: 5 + Math.abs(localLane) * 1.5,
                                    lateLateralPx: 2 + Math.abs(localLane)
                                })
                                : host.buildAirShowPursuitPath(current, scrambleFocusPoint, {
                                    startHeadingDegrees,
                                    lateralSign: sideSign,
                                    entryLateralPx: 4 + Math.abs(localLane) * 2,
                                    mergeLateralPx: Math.max(1, Math.abs(localLane) * 2),
                                    attackOffsetPx: localLane * 5,
                                    closeInPx: 3,
                                    overshootPx: 4,
                                    breakLateralPx: 6 + Math.abs(localLane) * 2,
                                    breakForwardPx: 4,
                                    driftPx: 1
                                }));
                        const escortPath = beat === 0
                            ? host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, isSyntheticGroup && escortIndex === 0
                                ? host.buildAirShowCurvedPath(current, syntheticClosurePoint, 22 * sideSign, 9, startHeadingDegrees)
                                : host.buildAirShowMergePassPath(current, localizedFightCenter, corridor, {
                                    sideSign,
                                    laneIndex: localLane,
                                    startHeadingDegrees,
                                    entrySeparationPx: crowdedGroup ? 40 : 50,
                                    crossSeparationPx: crowdedGroup ? 4 : 5,
                                    overshootPx: crowdedGroup ? 18 : 22
                                }), 20), {
                                maxTurnDeg: 40,
                                strongTurnDeg: 84,
                                maxFirstSegmentPx: 62,
                                maxSharpTurnDeg: 114,
                                maxWaypointsToRemove: 2
                            })
                            : host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, tightenPathAroundFightSpace(escortScramblePath, scrambleTighteningFocusPoint, scrambleTighteningRadiusPx), hasActiveBomberFlights ? 20 : 28), {
                                maxTurnDeg: hasActiveBomberFlights ? 36 : 32,
                                strongTurnDeg: hasActiveBomberFlights ? 78 : 70,
                                maxFirstSegmentPx: hasActiveBomberFlights ? 56 : 50,
                                maxSharpTurnDeg: hasActiveBomberFlights ? 106 : 94,
                                maxWaypointsToRemove: hasActiveBomberFlights ? 2 : 3
                            });
                        phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, escortPath, 0.24, 0, 1));
                    });
                });
                const holdingInterceptors = activeInterceptorFlights.filter((flight) => !engagedInterceptorIds.has(flight.spec.id));
                const holdingEscorts = activeEscortFlights.filter((flight) => !engagedEscortIds.has(flight.spec.id));
                const resolveSupportFocusPoint = (flight, current, role, laneIndex) => {
                    const defaultFocusPoint = host.resolveAirShowEscortClashFocusPoint(corridor, role, beat, laneIndex, clashCenter);
                    if (groupStates.length <= 0) {
                        const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
                        return {
                            focusPoint: defaultFocusPoint,
                            sideSign: host.resolveAirShowRouteSideSign(current, defaultFocusPoint, startHeadingDegrees, role === "interceptor" ? -1 : 1),
                            startHeadingDegrees
                        };
                    }
                    const nearestGroup = groupStates.reduce((closest, candidate) => {
                        const closestDistancePx = Math.hypot(current.cx - closest.groupCenter.cx, current.cy - closest.groupCenter.cy);
                        const candidateDistancePx = Math.hypot(current.cx - candidate.groupCenter.cx, current.cy - candidate.groupCenter.cy);
                        return candidateDistancePx < closestDistancePx ? candidate : closest;
                    });
                    const groupProjection = nearestGroup.groupProjection;
                    const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
                    const localSideSign = host.resolveAirShowRouteSideSign(current, nearestGroup.groupCenter, startHeadingDegrees, role === "interceptor" ? -1 : 1);
                    return {
                        focusPoint: host.projectAirShowCorridorPoint(corridor, groupProjection.alongPx + (beat === 0 ? (role === "interceptor" ? -6 : 6) : (role === "interceptor" ? 8 : 2)), groupProjection.lateralPx + localSideSign * (beat === 0 ? 12 : 16) + laneIndex * (beat === 0 ? 10 : 12)),
                        sideSign: localSideSign,
                        startHeadingDegrees
                    };
                };
                holdingInterceptors.forEach((flight, index) => {
                    const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                    const laneIndex = index - (holdingInterceptors.length - 1) / 2;
                    const supportFocus = resolveSupportFocusPoint(flight, current, "interceptor", laneIndex);
                    const path = beat === 0
                        ? host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, host.buildAirShowMergePassPath(current, supportFocus.focusPoint, corridor, {
                            sideSign: supportFocus.sideSign,
                            laneIndex: 0,
                            startHeadingDegrees: supportFocus.startHeadingDegrees,
                            entrySeparationPx: 42,
                            crossSeparationPx: 4,
                            overshootPx: 18
                        }), 18), {
                            maxTurnDeg: 38,
                            strongTurnDeg: 78,
                            maxFirstSegmentPx: 54,
                            maxSharpTurnDeg: 108,
                            maxWaypointsToRemove: 2
                        })
                        : host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, host.buildAirShowPursuitPath(current, supportFocus.focusPoint, {
                            startHeadingDegrees: supportFocus.startHeadingDegrees,
                            lateralSign: supportFocus.sideSign,
                            entryLateralPx: 6,
                            mergeLateralPx: 2,
                            attackOffsetPx: 0,
                            closeInPx: 3,
                            overshootPx: 5,
                            breakLateralPx: 7,
                            breakForwardPx: 4,
                            driftPx: 1
                        }), 16), {
                            maxTurnDeg: 36,
                            strongTurnDeg: 76,
                            maxFirstSegmentPx: 52,
                            maxSharpTurnDeg: 106,
                            maxWaypointsToRemove: 2
                        });
                    phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, path, 0.26, 0, 1));
                });
                holdingEscorts.forEach((flight, index) => {
                    const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                    const laneIndex = index - (holdingEscorts.length - 1) / 2;
                    const supportFocus = resolveSupportFocusPoint(flight, current, "escort", laneIndex);
                    const path = beat === 0
                        ? host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, host.buildAirShowMergePassPath(current, supportFocus.focusPoint, corridor, {
                            sideSign: supportFocus.sideSign,
                            laneIndex: 0,
                            startHeadingDegrees: supportFocus.startHeadingDegrees,
                            entrySeparationPx: 40,
                            crossSeparationPx: 4,
                            overshootPx: 18
                        }), 16), {
                            maxTurnDeg: 38,
                            strongTurnDeg: 76,
                            maxFirstSegmentPx: 52,
                            maxSharpTurnDeg: 106,
                            maxWaypointsToRemove: 2
                        })
                        : host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, host.buildAirShowPursuitPath(current, supportFocus.focusPoint, {
                            startHeadingDegrees: supportFocus.startHeadingDegrees,
                            lateralSign: supportFocus.sideSign,
                            entryLateralPx: 5,
                            mergeLateralPx: 2,
                            attackOffsetPx: 0,
                            closeInPx: 3,
                            overshootPx: 4,
                            breakLateralPx: 6,
                            breakForwardPx: 4,
                            driftPx: 1
                        }), 14), {
                            maxTurnDeg: 34,
                            strongTurnDeg: 72,
                            maxFirstSegmentPx: 48,
                            maxSharpTurnDeg: 104,
                            maxWaypointsToRemove: 2
                        });
                    phaseAssignments.push(...host.buildAirShowFlightAssignments(flight, path, 0.24, 0, 1));
                });
                const escortClashRoleSpeeds = host.resolveAirShowRoleSpeedMap({
                    interceptor: host.airShowFighterSpeedPxPerMs,
                    escort: host.airShowFighterSpeedPxPerMs,
                    bomber: host.airShowBomberSpeedPxPerMs
                });
                const escortBeatDurationFloorMs = beat === 0
                    ? resolvedEscortBeatDurationDefaultMs
                    : Math.max(activeBomberFlights.length > 0 ? 860 : 980, Math.round(resolvedEscortBeatDurationDefaultMs
                        * (activeBomberFlights.length > 0 ? 0.74 : 0.82)));
                if (activeBomberFlights.length > 0) {
                    const bomberPhaseLabel = beat === 0 ? "escort-clash-merge" : "escort-clash-scramble";
                    const bomberPhaseAssignments = host.buildContestedBomberPhaseSliceAssignments(activeBomberFlights, contestedBomberMasterPaths, contestedBomberPhaseDurations, bomberPhaseLabel);
                    phaseAssignments.push(...bomberPhaseAssignments);
                }
                const escortBeatDurationMs = beat === 0
                    ? resolvedEscortBeatDurationDefaultMs
                    : host.resolveAirShowPhaseDurationFromRoleSpeeds(phaseAssignments, escortClashRoleSpeeds, resolvedEscortBeatDurationDefaultMs, escortBeatDurationFloorMs, resolvedEscortBeatDurationDefaultMs, ["interceptor", "escort"]);
                const extendedPhaseAssignments = beat === 1
                    ? host.extendAirShowPhaseAssignmentsForSpeed(phaseAssignments, escortBeatDurationMs, escortClashRoleSpeeds, {
                        clampCenter: corridor.center,
                        orbitSignByRole: {
                            interceptor: -1,
                            escort: 1
                        }
                    })
                    : phaseAssignments;
                const escortPhasePreparationOptions = {
                    previousAssignments: previousPhaseAssignments,
                    previousDurationMs: previousPhaseDurationMs,
                    entryTurnLimitDeg: beat === 0 ? 72 : 52,
                    softenEntryRoles: beat === 1 ? ["interceptor", "escort"] : undefined,
                    softenEntryTurnLimitDeg: beat === 1 ? 68 : undefined,
                    softenEntryWaypointCount: beat === 1 ? 18 : undefined,
                    softenExitRoles: beat === 1 ? ["interceptor", "escort"] : undefined,
                    softenExitTurnLimitDeg: beat === 1 ? 76 : undefined,
                    softenExitWaypointCount: beat === 1 ? 14 : undefined
                };
                let resolvedPhaseAssignments = host.prepareAirShowPhaseAssignments(extendedPhaseAssignments, escortBeatDurationMs, [0.3, 0.5, 0.7], beat === 0 ? 42 : 40, escortClashRoleSpeeds, escortPhasePreparationOptions);
                if (beat === 0) {
                    const mergeStartPointsByRole = new Map();
                    resolvedPhaseAssignments.forEach((assignment) => {
                        if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                            return;
                        }
                        const startPoint = assignment.points[0];
                        if (!startPoint) {
                            return;
                        }
                        const roleStartPoints = mergeStartPointsByRole.get(assignment.actor.role) ?? [];
                        roleStartPoints.push(startPoint);
                        mergeStartPointsByRole.set(assignment.actor.role, roleStartPoints);
                    });
                    resolvedPhaseAssignments = resolvedPhaseAssignments.map((assignment) => {
                        if ((assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort")
                            || assignment.points.length < 2) {
                            return assignment;
                        }
                        const startPoint = assignment.points[0];
                        if (!startPoint) {
                            return assignment;
                        }
                        const opposingRole = assignment.actor.role === "interceptor" ? "escort" : "interceptor";
                        const opposingStarts = mergeStartPointsByRole.get(opposingRole) ?? [];
                        if (opposingStarts.length <= 0) {
                            return assignment;
                        }
                        const nearestOpposingStart = opposingStarts.reduce((nearest, candidate) => {
                            const nearestDistancePx = Math.hypot(startPoint.cx - nearest.cx, startPoint.cy - nearest.cy);
                            const candidateDistancePx = Math.hypot(startPoint.cx - candidate.cx, startPoint.cy - candidate.cy);
                            return candidateDistancePx < nearestDistancePx ? candidate : nearest;
                        });
                        const awayVector = normalizeVector(startPoint.cx - nearestOpposingStart.cx, startPoint.cy - nearestOpposingStart.cy, assignment.actor.role === "interceptor" ? -corridor.normal.x : corridor.normal.x, assignment.actor.role === "interceptor" ? -corridor.normal.y : corridor.normal.y);
                        const laneOffsetPx = assignment.actor.formationIndex * 4;
                        const earlyStagingPoint = {
                            cx: startPoint.cx
                                + awayVector.x * 156
                                + corridor.normal.x * laneOffsetPx,
                            cy: startPoint.cy
                                + awayVector.y * 156
                                + corridor.normal.y * laneOffsetPx
                        };
                        return {
                            ...assignment,
                            points: [
                                startPoint,
                                earlyStagingPoint,
                                ...assignment.points.slice(1)
                            ]
                        };
                    });
                }
                if (beat === 1) {
                    let scrambleBoundaryRepairApplied = false;
                    const repairedScrambleAssignments = resolvedPhaseAssignments.map((assignment) => {
                        if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                            return assignment;
                        }
                        const flight = escortClashFlightsById.get(assignment.actor.flightId);
                        if (!flight) {
                            return assignment;
                        }
                        const previousBoundaryVector = resolvePreviousPhaseBoundaryVector(flight);
                        if (!previousBoundaryVector || assignment.points.length < 2) {
                            return assignment;
                        }
                        const startPoint = assignment.points[0];
                        const nextPoint = assignment.points.find((point, index) => index > 0 && !!startPoint && Math.hypot(point.cx - startPoint.cx, point.cy - startPoint.cy) > 0.5);
                        if (!startPoint || !nextPoint) {
                            return assignment;
                        }
                        const entryTurnDeg = resolveVectorAngleDegrees({
                            x: previousBoundaryVector.dx,
                            y: previousBoundaryVector.dy
                        }, {
                            x: nextPoint.cx - startPoint.cx,
                            y: nextPoint.cy - startPoint.cy
                        });
                        if (entryTurnDeg < 110) {
                            return assignment;
                        }
                        const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
                        const endPoint = assignment.points[assignment.points.length - 1] ?? nextPoint;
                        const routeSideSign = host.resolveAirShowRouteSideSign(startPoint, endPoint, startHeadingDegrees, assignment.actor.role === "interceptor" ? -1 : 1);
                        const forwardVector = resolveHeadingVector(startHeadingDegrees, {
                            x: endPoint.cx - startPoint.cx,
                            y: endPoint.cy - startPoint.cy
                        });
                        const forwardLeadDistancePx = assignment.actor.role === "interceptor" ? 84 : 72;
                        const forwardLeadBlend = assignment.actor.role === "interceptor" ? 0.18 : 0.22;
                        const forwardLeadPoint = {
                            cx: startPoint.cx
                                + forwardVector.x * forwardLeadDistancePx
                                + (endPoint.cx - startPoint.cx) * forwardLeadBlend,
                            cy: startPoint.cy
                                + forwardVector.y * forwardLeadDistancePx
                                + (endPoint.cy - startPoint.cy) * forwardLeadBlend
                        };
                        scrambleBoundaryRepairApplied = true;
                        return {
                            ...assignment,
                            points: host.sanitizeAirShowEntryPath([
                                startPoint,
                                forwardLeadPoint,
                                ...buildForwardContinuousRoutePath(forwardLeadPoint, endPoint, {
                                    startHeadingDegrees,
                                    lateralSign: routeSideSign,
                                    minRouteDot: -0.08,
                                    carryForwardPx: assignment.actor.role === "interceptor" ? 72 : 64,
                                    earlyAlongPx: assignment.actor.role === "interceptor" ? 108 : 96,
                                    midAlongPx: assignment.actor.role === "interceptor" ? 156 : 142,
                                    lateAlongPx: assignment.actor.role === "interceptor" ? 204 : 188,
                                    entryLateralPx: assignment.actor.role === "interceptor" ? 18 : 16,
                                    midLateralPx: assignment.actor.role === "interceptor" ? 7 : 6,
                                    lateLateralPx: 3
                                }).slice(1)
                            ], assignment.actor.role === "interceptor"
                                ? {
                                    maxTurnDeg: 34,
                                    strongTurnDeg: 72,
                                    maxFirstSegmentPx: 52,
                                    maxSharpTurnDeg: 96,
                                    maxWaypointsToRemove: 4
                                }
                                : {
                                    maxTurnDeg: 32,
                                    strongTurnDeg: 68,
                                    maxFirstSegmentPx: 48,
                                    maxSharpTurnDeg: 92,
                                    maxWaypointsToRemove: 4
                                })
                        };
                    });
                    if (scrambleBoundaryRepairApplied) {
                        resolvedPhaseAssignments = host.prepareAirShowPhaseAssignments(repairedScrambleAssignments, escortBeatDurationMs, [0.3, 0.5, 0.7], 44, escortClashRoleSpeeds, {
                            ...escortPhasePreparationOptions,
                            entryTurnLimitDeg: 48,
                            softenEntryTurnLimitDeg: 64,
                            softenEntryWaypointCount: 20,
                            softenExitTurnLimitDeg: 72,
                            softenExitWaypointCount: 16
                        });
                    }
                }
                resolvedPhaseAssignments = reinforceCompactFighterTravel(resolvedPhaseAssignments, escortBeatDurationMs, beat === 0 ? 0.034 : 0.064, escortCombatFocusByFlightId, {
                    hasActiveBombers: activeBomberFlights.length > 0,
                    phase: beat === 0 ? "merge" : "scramble"
                });
                if (beat === 1) {
                    const hasActiveBomberFlightsForScramble = bomberFlights.some((flight) => flight.actors.some((actor) => actor.active));
                    resolvedPhaseAssignments = resolvedPhaseAssignments.map((assignment) => {
                        if (assignment.actor.role !== "interceptor"
                            && assignment.actor.role !== "escort") {
                            return assignment;
                        }
                        const focusPoint = escortCombatFocusByFlightId.get(assignment.actor.flightId);
                        if (!focusPoint || assignment.points.length < 3) {
                            return assignment;
                        }
                        const lastIndex = assignment.points.length - 1;
                        const tightenedPoints = assignment.points.map((point, index) => {
                            if (index === 0) {
                                return point;
                            }
                            const dx = point.cx - focusPoint.cx;
                            const dy = point.cy - focusPoint.cy;
                            const distancePx = Math.hypot(dx, dy);
                            if (distancePx < 0.001) {
                                return point;
                            }
                            const progress = index / Math.max(1, lastIndex);
                            const maxDistancePx = hasActiveBomberFlightsForScramble
                                ? host.clamp(82 - progress * 16 + Math.abs(assignment.actor.formationIndex) * 2, 54, 90)
                                : host.clamp(164 - progress * 14 + Math.abs(assignment.actor.formationIndex) * 6, 132, 182);
                            const minDistancePx = hasActiveBomberFlightsForScramble
                                ? host.clamp(34
                                    + Math.sin(progress * Math.PI) * 6
                                    + Math.abs(assignment.actor.formationIndex) * 1.4, 30, Math.max(32, maxDistancePx - 5))
                                : host.clamp(88
                                    + Math.sin(progress * Math.PI) * 14
                                    + Math.abs(assignment.actor.formationIndex) * 5, 78, Math.max(82, maxDistancePx - 8));
                            const targetDistancePx = host.clamp(distancePx, minDistancePx, maxDistancePx);
                            const scale = targetDistancePx / distancePx;
                            const combatWeaveRadians = hasActiveBomberFlightsForScramble && progress > 0.16 && progress < 0.94
                                ? Math.sin(progress * Math.PI * 4 + assignment.actor.formationIndex * 0.65) * 0.24
                                : 0;
                            const cos = Math.cos(combatWeaveRadians);
                            const sin = Math.sin(combatWeaveRadians);
                            const clippedDx = dx * scale;
                            const clippedDy = dy * scale;
                            return {
                                cx: focusPoint.cx + clippedDx * cos - clippedDy * sin,
                                cy: focusPoint.cy + clippedDx * sin + clippedDy * cos
                            };
                        });
                        return {
                            ...assignment,
                            points: host.sanitizeAirShowEntryPath(tightenedPoints, assignment.actor.role === "interceptor"
                                ? {
                                    maxTurnDeg: hasActiveBomberFlightsForScramble ? 36 : 42,
                                    strongTurnDeg: hasActiveBomberFlightsForScramble ? 74 : 86,
                                    maxFirstSegmentPx: hasActiveBomberFlightsForScramble ? 58 : 72,
                                    maxSharpTurnDeg: hasActiveBomberFlightsForScramble ? 98 : 112,
                                    maxWaypointsToRemove: 3
                                }
                                : {
                                    maxTurnDeg: hasActiveBomberFlightsForScramble ? 34 : 40,
                                    strongTurnDeg: hasActiveBomberFlightsForScramble ? 72 : 84,
                                    maxFirstSegmentPx: hasActiveBomberFlightsForScramble ? 56 : 70,
                                    maxSharpTurnDeg: hasActiveBomberFlightsForScramble ? 96 : 110,
                                    maxWaypointsToRemove: 3
                                })
                        };
                    });
                    resolvedPhaseAssignments = reinforceCompactFighterTravel(resolvedPhaseAssignments, escortBeatDurationMs, 0.064, escortCombatFocusByFlightId, {
                        hasActiveBombers: hasActiveBomberFlightsForScramble,
                        phase: "scramble"
                    });
                }
                const timedPhaseAssignments = beat === 0
                    ? host.shapeCompactAirShowMergeAssignments(resolvedPhaseAssignments, escortBeatDurationMs)
                    : resolvedPhaseAssignments;
                groupStates.forEach((state) => {
                    const baseTimings = beat === 0
                        ? [0.52, 0.64, 0.76, 0.88]
                        : [0.14, 0.26, 0.38, 0.5, 0.62, 0.74];
                    state.group.interceptorFlights.forEach((flight, interceptorIndex) => {
                        const targetEscortFlight = state.group.escortFlights[interceptorIndex % Math.max(1, state.group.escortFlights.length)];
                        if (!targetEscortFlight) {
                            return;
                        }
                        tracerBursts.push(...host.buildAirShowDynamicTracerVolley(timedPhaseAssignments, flight, targetEscortFlight, {
                            emitter: "nose",
                            color: "#fff5cf",
                            width: beat === 0 ? 0.78 : 0.72,
                            lifetimeMs: beat === 0 ? 44 : 42,
                            spreadPx: beat === 0 ? 7 : 8,
                            streakLengthPx: beat === 0 ? 132 : 142,
                            visibleLengthPx: beat === 0 ? 11 : 12,
                            fanHalfAngleDeg: 2.6,
                            burstCount: 4,
                            maxAlignmentDeg: beat === 0 ? 30 : 36,
                            maxRangePx: beat === 0 ? 164 : 176,
                            timings: baseTimings.map((timing) => host.clamp(timing + interceptorIndex * 0.02, beat === 0 ? 0.08 : 0.12, beat === 0 ? 0.9 : 0.8)),
                            fallbackToNearest: true
                        }));
                    });
                    state.group.escortFlights.forEach((flight, escortIndex) => {
                        const targetInterceptorFlight = state.group.interceptorFlights[escortIndex % Math.max(1, state.group.interceptorFlights.length)];
                        if (!targetInterceptorFlight) {
                            return;
                        }
                        tracerBursts.push(...host.buildAirShowDynamicTracerVolley(timedPhaseAssignments, flight, targetInterceptorFlight, {
                            emitter: "nose",
                            color: "#ffd98a",
                            width: beat === 0 ? 0.66 : 0.62,
                            lifetimeMs: beat === 0 ? 42 : 40,
                            spreadPx: beat === 0 ? 6 : 7,
                            streakLengthPx: beat === 0 ? 126 : 138,
                            visibleLengthPx: beat === 0 ? 10 : 11,
                            fanHalfAngleDeg: 2.2,
                            burstCount: 3,
                            maxAlignmentDeg: beat === 0 ? 30 : 36,
                            maxRangePx: beat === 0 ? 160 : 172,
                            timings: baseTimings.map((timing) => host.clamp(timing + 0.02 + escortIndex * 0.02, beat === 0 ? 0.08 : 0.12, beat === 0 ? 0.9 : 0.8)),
                            fallbackToNearest: true
                        }));
                    });
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
        recordPhase("bomber-gap", bomberGapAssignments, Math.max(120, Math.min(260, Math.round((scene.bomberArrivalDelayMs ?? 0) * 0.58))), [], [], host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs
        }));
        updateFlightAnchors([...survivingInterceptors, ...survivingEscorts]);
    }
    const scopedFlakBurstsByBomberId = new Map();
    const resolveScopedBomberFlakBursts = (flight) => {
        const cached = scopedFlakBurstsByBomberId.get(flight.spec.id);
        if (cached) {
            return cached;
        }
        const bursts = host.resolveAirShowBomberFlakBursts(scene, flight.spec.id);
        scopedFlakBurstsByBomberId.set(flight.spec.id, bursts);
        return bursts;
    };
    const buildScopedFlakBurstKey = (burst) => [
        burst.bomberUnitKey ?? "unscoped",
        burst.targetHexKey ?? "target",
        Math.round((burst.progress ?? 0) * 1000),
        Math.round((burst.alongOffsetPx ?? 0) * 10),
        Math.round((burst.lateralOffsetPx ?? 0) * 10),
        burst.count ?? 0
    ].join("|");
    const collectScopedBomberFlakBursts = (flights) => Array.from(new Map(flights.flatMap((flight) => resolveScopedBomberFlakBursts(flight).map((burst) => [
        buildScopedFlakBurstKey(burst),
        burst
    ]))).values());
    const remapFlakBurstsToPhase = (bursts, options) => {
        const globalWindowSpan = Math.max(0.0001, options.globalEndProgress - options.globalStartProgress);
        return bursts.flatMap((burst) => {
            const globalProgress = host.clamp(burst.progress ?? 0, 0, 1);
            const inWindow = globalProgress >= options.globalStartProgress - 0.0001
                && (options.includeEnd
                    ? globalProgress <= options.globalEndProgress + 0.0001
                    : globalProgress < options.globalEndProgress - 0.0001);
            if (!inWindow) {
                return [];
            }
            const windowProgress = host.clamp((globalProgress - options.globalStartProgress) / globalWindowSpan, 0, 1);
            return [{
                    ...burst,
                    progress: host.clamp(options.localStartProgress
                        + windowProgress * (options.localEndProgress - options.localStartProgress), options.localStartProgress, options.localEndProgress)
                }];
        });
    };
    const shouldDeferBomberFinalStrengthForFlak = (flight) => resolveScopedBomberFlakBursts(flight).length > 0;
    if (survivingBombers.length > 0) {
        const bomberIngressRallyPoint = host.averageAirShowPoints(survivingBombers.map((flight) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const targetApproach = bomberApproachProfilesById.get(flight.spec.id)?.targetApproach ?? current;
            return {
                cx: current.cx * 0.44 + targetApproach.cx * 0.56,
                cy: current.cy * 0.44 + targetApproach.cy * 0.56
            };
        }))
            ?? corridor.merge;
        const bomberIngressRallyProjection = host.resolveAirShowCorridorCoordinates(corridor, bomberIngressRallyPoint);
        const resolveBomberIngressCoverTarget = (current, role, laneIndex) => {
            const basePlan = role === "interceptor"
                ? {
                    corridorWidthPx: 18,
                    driftPx: 12,
                    minimumTravelPx: 148,
                    lateralSign: -1
                }
                : {
                    corridorWidthPx: 16,
                    driftPx: 12,
                    minimumTravelPx: 124,
                    lateralSign: 1
                };
            const currentProjection = host.resolveAirShowCorridorCoordinates(corridor, current);
            const desiredAlongPx = role === "interceptor"
                ? bomberIngressRallyProjection.alongPx - 34 + laneIndex * 18
                : bomberIngressRallyProjection.alongPx + 18 + laneIndex * 16;
            const desiredLateralPx = role === "interceptor"
                ? bomberIngressRallyProjection.lateralPx - 104 + laneIndex * 22
                : bomberIngressRallyProjection.lateralPx + 92 + laneIndex * 20;
            const targetAlongPx = host.clamp(desiredAlongPx * 0.88 + currentProjection.alongPx * 0.12, role === "interceptor" ? -128 : -44, role === "interceptor" ? 28 : 98);
            const targetLateralPx = host.clamp(desiredLateralPx * 0.92 + currentProjection.lateralPx * 0.08, role === "interceptor" ? -188 : 58, role === "interceptor" ? -68 : 168);
            const targetPoint = host.projectAirShowCorridorPoint(corridor, targetAlongPx, targetLateralPx);
            const routeDistancePx = Math.hypot(targetPoint.cx - current.cx, targetPoint.cy - current.cy);
            if (routeDistancePx >= basePlan.minimumTravelPx) {
                return {
                    endAlongPx: targetAlongPx,
                    baseLateralPx: targetLateralPx,
                    corridorWidthPx: basePlan.corridorWidthPx,
                    driftPx: basePlan.driftPx
                };
            }
            const alongSign = targetAlongPx >= currentProjection.alongPx ? 1 : -1;
            const travelShortfallPx = basePlan.minimumTravelPx - routeDistancePx;
            return {
                endAlongPx: targetAlongPx
                    + alongSign * host.clamp(travelShortfallPx * 0.84, 24, role === "interceptor" ? 108 : 92),
                baseLateralPx: targetLateralPx
                    + basePlan.lateralSign * host.clamp(travelShortfallPx * 0.3, 10, role === "interceptor" ? 34 : 30),
                corridorWidthPx: basePlan.corridorWidthPx,
                driftPx: basePlan.driftPx
            };
        };
        const bomberIngressAssignments = host.buildContestedBomberPhaseSliceAssignments(survivingBombers, contestedBomberMasterPaths, contestedBomberPhaseDurations, "bomber-ingress");
        const bomberIngressDurationMs = plannedBomberIngressDurationMs;
        const bomberIngressFlakBursts = [];
        const bomberDefenseFlakBursts = remapFlakBurstsToPhase(collectScopedBomberFlakBursts(survivingBombers), {
            globalStartProgress: 0.46,
            globalEndProgress: 0.78,
            localStartProgress: 0.18,
            localEndProgress: 0.88
        });
        const bomberIngressFighterSpeedBudgetPx = bomberIngressDurationMs * host.airShowFighterSpeedPxPerMs;
        const bomberIngressMinimumFighterTravelPx = host.clamp(bomberIngressFighterSpeedBudgetPx * 0.45, 6, 58);
        const bomberIngressRepairTriggerTravelPx = Math.max(0, bomberIngressMinimumFighterTravelPx - 4);
        const desiredBomberIngressInterceptorTravelPx = host.clamp(Math.max(bomberIngressRepairTriggerTravelPx + 4, bomberIngressFighterSpeedBudgetPx * 0.72), 8, Math.max(8, bomberIngressFighterSpeedBudgetPx * 0.86));
        const desiredBomberIngressEscortTravelPx = host.clamp(Math.max(bomberIngressRepairTriggerTravelPx + 3, bomberIngressFighterSpeedBudgetPx * 0.68), 8, Math.max(8, bomberIngressFighterSpeedBudgetPx * 0.82));
        const truncatePathToLength = (points, targetPathLengthPx) => {
            if (points.length < 2 || !Number.isFinite(targetPathLengthPx) || targetPathLengthPx <= 0) {
                return [...points];
            }
            const truncated = [{ ...points[0] }];
            let remainingPx = targetPathLengthPx;
            for (let index = 1; index < points.length; index += 1) {
                const previous = points[index - 1];
                const current = points[index];
                if (!previous || !current) {
                    continue;
                }
                const segmentLengthPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
                if (segmentLengthPx <= 0.0001) {
                    continue;
                }
                if (remainingPx >= segmentLengthPx) {
                    truncated.push({ ...current });
                    remainingPx -= segmentLengthPx;
                    continue;
                }
                const ratio = host.clamp(remainingPx / segmentLengthPx, 0, 1);
                truncated.push({
                    cx: previous.cx + (current.cx - previous.cx) * ratio,
                    cy: previous.cy + (current.cy - previous.cy) * ratio
                });
                break;
            }
            if (truncated.length < 2) {
                truncated.push({ ...points[points.length - 1] });
            }
            return truncated;
        };
        const orderedSurvivingInterceptors = [...survivingInterceptors].sort((left, right) => {
            const leftCurrent = host.averageAirShowPosition(left.actors) ?? left.anchor;
            const rightCurrent = host.averageAirShowPosition(right.actors) ?? right.anchor;
            return host.resolveAirShowCorridorCoordinates(corridor, leftCurrent).lateralPx
                - host.resolveAirShowCorridorCoordinates(corridor, rightCurrent).lateralPx;
        });
        const orderedSurvivingEscorts = [...survivingEscorts].sort((left, right) => {
            const leftCurrent = host.averageAirShowPosition(left.actors) ?? left.anchor;
            const rightCurrent = host.averageAirShowPosition(right.actors) ?? right.anchor;
            return host.resolveAirShowCorridorCoordinates(corridor, leftCurrent).lateralPx
                - host.resolveAirShowCorridorCoordinates(corridor, rightCurrent).lateralPx;
        });
        const buildBomberIngressCoverAssignmentsForFlight = (flight, role, index, totalFlights) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const laneIndex = index - (totalFlights - 1) / 2;
            const target = resolveBomberIngressCoverTarget(current, role, laneIndex);
            const currentProjection = host.resolveAirShowCorridorCoordinates(corridor, current);
            const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
            const defaultLaneSideSign = role === "interceptor"
                ? (laneIndex <= 0 ? -1 : 1)
                : (laneIndex >= 0 ? 1 : -1);
            const buildCoverPath = (resolvedTargetPoint, emphasis = "base") => {
                const routeSideSign = host.resolveAirShowRouteSideSign(current, resolvedTargetPoint, startHeadingDegrees, defaultLaneSideSign);
                const laneMagnitude = Math.abs(laneIndex);
                return host.sanitizeAirShowEntryPath(bridgePathToPreviousPhaseMotion(flight, buildForwardContinuousRoutePath(current, resolvedTargetPoint, role === "interceptor"
                    ? {
                        startHeadingDegrees,
                        lateralSign: routeSideSign,
                        minRouteDot: emphasis === "aggressive" ? -0.12 : -0.18,
                        carryForwardPx: (emphasis === "aggressive" ? 84 : 60) + laneMagnitude * 10,
                        earlyAlongPx: (emphasis === "aggressive" ? 150 : 112) + laneMagnitude * 16,
                        midAlongPx: (emphasis === "aggressive" ? 218 : 162) + laneMagnitude * 18,
                        lateAlongPx: (emphasis === "aggressive" ? 272 : 208) + laneMagnitude * 16,
                        entryLateralPx: (emphasis === "aggressive" ? 26 : 20) + laneMagnitude * 5.5,
                        midLateralPx: (emphasis === "aggressive" ? 11 : 8) + laneMagnitude * 2.5,
                        lateLateralPx: (emphasis === "aggressive" ? 4 : 3) + laneMagnitude * 1.25
                    }
                    : {
                        startHeadingDegrees,
                        lateralSign: routeSideSign,
                        minRouteDot: emphasis === "aggressive" ? -0.08 : -0.14,
                        carryForwardPx: (emphasis === "aggressive" ? 66 : 48) + laneMagnitude * 8,
                        earlyAlongPx: (emphasis === "aggressive" ? 128 : 92) + laneMagnitude * 12,
                        midAlongPx: (emphasis === "aggressive" ? 186 : 138) + laneMagnitude * 14,
                        lateAlongPx: (emphasis === "aggressive" ? 228 : 176) + laneMagnitude * 12,
                        entryLateralPx: (emphasis === "aggressive" ? 22 : 18) + laneMagnitude * 4.5,
                        midLateralPx: (emphasis === "aggressive" ? 10 : 7) + laneMagnitude * 2.25,
                        lateLateralPx: (emphasis === "aggressive" ? 4 : 3) + laneMagnitude * 1.25
                    }), role === "interceptor"
                    ? (emphasis === "aggressive" ? 52 : 40)
                    : (emphasis === "aggressive" ? 34 : 26)), role === "interceptor"
                    ? {
                        maxTurnDeg: 44,
                        strongTurnDeg: 88,
                        maxFirstSegmentPx: emphasis === "aggressive" ? 88 : 76,
                        maxSharpTurnDeg: 112,
                        maxWaypointsToRemove: 3
                    }
                    : {
                        maxTurnDeg: 40,
                        strongTurnDeg: 84,
                        maxFirstSegmentPx: emphasis === "aggressive" ? 82 : 72,
                        maxSharpTurnDeg: 108,
                        maxWaypointsToRemove: 3
                    });
            };
            const buildAssignmentsForPath = (path) => host.buildAirShowFlightAssignments(flight, path, role === "interceptor" ? 0.26 : 0.24, index, Math.max(1, totalFlights));
            const baseTargetPoint = host.projectAirShowCorridorPoint(corridor, target.endAlongPx, target.baseLateralPx);
            let assignments = buildAssignmentsForPath(buildCoverPath(baseTargetPoint));
            const meanTraversedLengthPx = assignments.length > 0
                ? assignments.reduce((sum, assignment) => sum + host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, bomberIngressDurationMs), 0) / assignments.length
                : 0;
            if (meanTraversedLengthPx + 4 >= bomberIngressMinimumFighterTravelPx) {
                return assignments;
            }
            const alongDirection = target.endAlongPx >= currentProjection.alongPx ? 1 : -1;
            const travelShortfallPx = bomberIngressMinimumFighterTravelPx - meanTraversedLengthPx;
            const aggressiveTargetPoint = host.projectAirShowCorridorPoint(corridor, target.endAlongPx + alongDirection * host.clamp(travelShortfallPx * 0.82, role === "interceptor" ? 42 : 34, role === "interceptor" ? 132 : 116), target.baseLateralPx + (role === "interceptor" ? -1 : 1) * host.clamp(travelShortfallPx * 0.2, 10, role === "interceptor" ? 32 : 28));
            assignments = buildAssignmentsForPath(buildCoverPath(aggressiveTargetPoint, "aggressive"));
            return assignments;
        };
        const bomberIngressFighterAssignments = [
            ...orderedSurvivingInterceptors.flatMap((flight, index) => buildBomberIngressCoverAssignmentsForFlight(flight, "interceptor", index, orderedSurvivingInterceptors.length)),
            ...orderedSurvivingEscorts.flatMap((flight, index) => buildBomberIngressCoverAssignmentsForFlight(flight, "escort", index, orderedSurvivingEscorts.length))
        ];
        const bomberIngressRoleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: host.airShowBomberSpeedPxPerMs
        });
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
        const extendedBomberIngressAssignmentsByActorId = new Map(extendedBomberIngressAssignments.map((assignment) => [assignment.actor.id, assignment]));
        const bomberIngressPhasePreparationOptions = {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 84,
            softenEntryRoles: ["interceptor", "escort"],
            softenEntryTurnLimitDeg: 98,
            softenEntryWaypointCount: 8,
            softenExitRoles: ["interceptor", "escort"],
            softenExitTurnLimitDeg: 94,
            softenExitWaypointCount: 8
        };
        const preparedBomberIngressAssignments = host.prepareAirShowPhaseAssignments(extendedBomberIngressAssignments, bomberIngressDurationMs, [0.22, 0.5, 0.78, 0.94], undefined, bomberIngressRoleSpeeds, bomberIngressPhasePreparationOptions);
        let bomberIngressAssignmentsRepaired = false;
        const repairedBomberIngressAssignments = preparedBomberIngressAssignments.map((assignment) => {
            if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                return assignment;
            }
            const ingressFlight = flightMap.get(assignment.actor.flightId);
            const traversedLengthPx = host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, bomberIngressDurationMs);
            const startPoint = assignment.points[0] ?? null;
            const nextPoint = assignment.points.find((point, index) => index > 0
                && !!startPoint
                && Math.hypot(point.cx - startPoint.cx, point.cy - startPoint.cy) > 0.5) ?? null;
            const previousBoundaryVector = ingressFlight
                ? resolvePreviousPhaseBoundaryVector(ingressFlight)
                : null;
            const entryTurnDeg = previousBoundaryVector && startPoint && nextPoint
                ? resolveVectorAngleDegrees({
                    x: previousBoundaryVector.dx,
                    y: previousBoundaryVector.dy
                }, {
                    x: nextPoint.cx - startPoint.cx,
                    y: nextPoint.cy - startPoint.cy
                })
                : 0;
            const needsTravelRepair = traversedLengthPx + 4 < bomberIngressRepairTriggerTravelPx;
            const needsBoundaryRepair = entryTurnDeg >= 108;
            if (!needsTravelRepair && !needsBoundaryRepair) {
                return assignment;
            }
            const originalAssignment = extendedBomberIngressAssignmentsByActorId.get(assignment.actor.id);
            if (!originalAssignment || originalAssignment.points.length <= 1) {
                return assignment;
            }
            bomberIngressAssignmentsRepaired = true;
            const resolvedStartPoint = startPoint ?? originalAssignment.points[0];
            const roleSpecificEntryOptions = assignment.actor.role === "interceptor"
                ? {
                    maxTurnDeg: 40,
                    strongTurnDeg: 80,
                    maxFirstSegmentPx: 72,
                    maxSharpTurnDeg: 104,
                    maxWaypointsToRemove: 4
                }
                : {
                    maxTurnDeg: 36,
                    strongTurnDeg: 76,
                    maxFirstSegmentPx: 68,
                    maxSharpTurnDeg: 100,
                    maxWaypointsToRemove: 4
                };
            const restoredPoints = needsBoundaryRepair && ingressFlight
                ? (() => {
                    const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(ingressFlight, host.resolveAirShowFlightHeadingDegrees(ingressFlight));
                    const endPoint = originalAssignment.points[originalAssignment.points.length - 1]
                        ?? nextPoint
                        ?? resolvedStartPoint;
                    const routeSideSign = host.resolveAirShowRouteSideSign(resolvedStartPoint, endPoint, startHeadingDegrees, assignment.actor.role === "interceptor" ? -1 : 1);
                    const forwardVector = resolveHeadingVector(startHeadingDegrees, {
                        x: endPoint.cx - resolvedStartPoint.cx,
                        y: endPoint.cy - resolvedStartPoint.cy
                    });
                    const forwardLeadDistancePx = assignment.actor.role === "interceptor" ? 92 : 80;
                    const forwardLeadBlend = assignment.actor.role === "interceptor" ? 0.14 : 0.18;
                    const forwardLeadPoint = {
                        cx: resolvedStartPoint.cx
                            + forwardVector.x * forwardLeadDistancePx
                            + (endPoint.cx - resolvedStartPoint.cx) * forwardLeadBlend,
                        cy: resolvedStartPoint.cy
                            + forwardVector.y * forwardLeadDistancePx
                            + (endPoint.cy - resolvedStartPoint.cy) * forwardLeadBlend
                    };
                    return host.sanitizeAirShowEntryPath([
                        resolvedStartPoint,
                        forwardLeadPoint,
                        ...buildForwardContinuousRoutePath(forwardLeadPoint, endPoint, {
                            startHeadingDegrees,
                            lateralSign: routeSideSign,
                            minRouteDot: -0.06,
                            carryForwardPx: assignment.actor.role === "interceptor" ? 86 : 74,
                            earlyAlongPx: assignment.actor.role === "interceptor" ? 128 : 112,
                            midAlongPx: assignment.actor.role === "interceptor" ? 184 : 164,
                            lateAlongPx: assignment.actor.role === "interceptor" ? 238 : 214,
                            entryLateralPx: assignment.actor.role === "interceptor" ? 24 : 20,
                            midLateralPx: assignment.actor.role === "interceptor" ? 10 : 8,
                            lateLateralPx: assignment.actor.role === "interceptor" ? 4 : 3
                        }).slice(1)
                    ], roleSpecificEntryOptions);
                })()
                : host.sanitizeAirShowEntryPath([
                    resolvedStartPoint,
                    ...originalAssignment.points.slice(1)
                ], roleSpecificEntryOptions);
            return {
                ...assignment,
                points: restoredPoints
            };
        });
        const repairedBomberIngressAssignmentsByActorId = new Map(repairedBomberIngressAssignments.map((assignment) => [assignment.actor.id, assignment]));
        const spacedBomberIngressAssignments = bomberIngressAssignmentsRepaired
            ? host.prepareAirShowPhaseAssignments(repairedBomberIngressAssignments, bomberIngressDurationMs, [0.22, 0.5, 0.78, 0.94], 40, bomberIngressRoleSpeeds, {
                ...bomberIngressPhasePreparationOptions,
                entryTurnLimitDeg: 80,
                softenEntryTurnLimitDeg: 92,
                softenEntryWaypointCount: 10,
                softenExitTurnLimitDeg: 90,
                softenExitWaypointCount: 10
            })
            : repairedBomberIngressAssignments;
        const finalizedBomberIngressAssignments = spacedBomberIngressAssignments.map((assignment) => {
            if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                return assignment;
            }
            const desiredBomberIngressTravelPx = assignment.actor.role === "interceptor"
                ? desiredBomberIngressInterceptorTravelPx
                : desiredBomberIngressEscortTravelPx;
            const traversedLengthPx = host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, bomberIngressDurationMs);
            if (traversedLengthPx + 4 >= desiredBomberIngressTravelPx) {
                return assignment;
            }
            const sourceAssignment = repairedBomberIngressAssignmentsByActorId.get(assignment.actor.id);
            if (!sourceAssignment || sourceAssignment.points.length <= 1) {
                return assignment;
            }
            return {
                ...assignment,
                points: host.sanitizeAirShowEntryPath(truncatePathToLength([
                    assignment.points[0] ?? sourceAssignment.points[0],
                    ...sourceAssignment.points.slice(1)
                ], desiredBomberIngressTravelPx), assignment.actor.role === "interceptor"
                    ? {
                        maxTurnDeg: 40,
                        strongTurnDeg: 80,
                        maxFirstSegmentPx: 72,
                        maxSharpTurnDeg: 104,
                        maxWaypointsToRemove: 4
                    }
                    : {
                        maxTurnDeg: 36,
                        strongTurnDeg: 76,
                        maxFirstSegmentPx: 68,
                        maxSharpTurnDeg: 100,
                        maxWaypointsToRemove: 4
                    })
            };
        });
        let bomberIngressBoundaryRepairApplied = false;
        const smoothedBomberIngressAssignments = finalizedBomberIngressAssignments.map((assignment) => {
            if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                return assignment;
            }
            const ingressFlight = flightMap.get(assignment.actor.flightId);
            const previousBoundaryVector = ingressFlight
                ? resolvePreviousPhaseBoundaryVector(ingressFlight)
                : null;
            if (!ingressFlight || !previousBoundaryVector || assignment.points.length < 2) {
                return assignment;
            }
            const startPoint = assignment.points[0];
            const nextPoint = assignment.points.find((point, index) => index > 0 && !!startPoint && Math.hypot(point.cx - startPoint.cx, point.cy - startPoint.cy) > 0.5);
            if (!startPoint || !nextPoint) {
                return assignment;
            }
            const entryTurnDeg = resolveVectorAngleDegrees({
                x: previousBoundaryVector.dx,
                y: previousBoundaryVector.dy
            }, {
                x: nextPoint.cx - startPoint.cx,
                y: nextPoint.cy - startPoint.cy
            });
            if (entryTurnDeg < 104) {
                return assignment;
            }
            const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(ingressFlight, host.resolveAirShowFlightHeadingDegrees(ingressFlight));
            const endPoint = assignment.points[assignment.points.length - 1] ?? nextPoint;
            const routeSideSign = host.resolveAirShowRouteSideSign(startPoint, endPoint, startHeadingDegrees, assignment.actor.role === "interceptor" ? -1 : 1);
            const forwardVector = resolveHeadingVector(startHeadingDegrees, {
                x: endPoint.cx - startPoint.cx,
                y: endPoint.cy - startPoint.cy
            });
            const forwardLeadDistancePx = assignment.actor.role === "interceptor" ? 96 : 82;
            const forwardLeadBlend = assignment.actor.role === "interceptor" ? 0.16 : 0.2;
            const forwardLeadPoint = {
                cx: startPoint.cx
                    + forwardVector.x * forwardLeadDistancePx
                    + (endPoint.cx - startPoint.cx) * forwardLeadBlend,
                cy: startPoint.cy
                    + forwardVector.y * forwardLeadDistancePx
                    + (endPoint.cy - startPoint.cy) * forwardLeadBlend
            };
            bomberIngressBoundaryRepairApplied = true;
            return {
                ...assignment,
                points: host.sanitizeAirShowEntryPath([
                    startPoint,
                    forwardLeadPoint,
                    ...buildForwardContinuousRoutePath(forwardLeadPoint, endPoint, {
                        startHeadingDegrees,
                        lateralSign: routeSideSign,
                        minRouteDot: -0.04,
                        carryForwardPx: assignment.actor.role === "interceptor" ? 88 : 76,
                        earlyAlongPx: assignment.actor.role === "interceptor" ? 132 : 116,
                        midAlongPx: assignment.actor.role === "interceptor" ? 188 : 168,
                        lateAlongPx: assignment.actor.role === "interceptor" ? 242 : 218,
                        entryLateralPx: assignment.actor.role === "interceptor" ? 22 : 18,
                        midLateralPx: assignment.actor.role === "interceptor" ? 9 : 7,
                        lateLateralPx: assignment.actor.role === "interceptor" ? 4 : 3
                    }).slice(1)
                ], assignment.actor.role === "interceptor"
                    ? {
                        maxTurnDeg: 38,
                        strongTurnDeg: 78,
                        maxFirstSegmentPx: 76,
                        maxSharpTurnDeg: 102,
                        maxWaypointsToRemove: 4
                    }
                    : {
                        maxTurnDeg: 34,
                        strongTurnDeg: 72,
                        maxFirstSegmentPx: 72,
                        maxSharpTurnDeg: 98,
                        maxWaypointsToRemove: 4
                    })
            };
        });
        const stableBomberIngressAssignments = bomberIngressBoundaryRepairApplied
            ? host.prepareAirShowPhaseAssignments(smoothedBomberIngressAssignments, bomberIngressDurationMs, [0.22, 0.5, 0.78, 0.94], 40, bomberIngressRoleSpeeds, {
                ...bomberIngressPhasePreparationOptions,
                entryTurnLimitDeg: 74,
                softenEntryTurnLimitDeg: 86,
                softenEntryWaypointCount: 10,
                softenExitTurnLimitDeg: 90,
                softenExitWaypointCount: 10
            })
            : smoothedBomberIngressAssignments;
        const motionLockedBomberIngressAssignments = stableBomberIngressAssignments.map((assignment) => {
            if (assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort") {
                return assignment;
            }
            const startSample = host.sampleAirShowAssignmentAtTime(assignment, 0, bomberIngressDurationMs, 0);
            const endSample = host.sampleAirShowAssignmentAtTime(assignment, bomberIngressDurationMs, bomberIngressDurationMs, 1);
            const dx = endSample.position.cx - startSample.position.cx;
            const dy = endSample.position.cy - startSample.position.cy;
            const displacementPx = Math.hypot(dx, dy);
            const maximumDisplacementPx = bomberIngressDurationMs * host.airShowFighterSpeedPxPerMs * 0.94;
            if (displacementPx > maximumDisplacementPx + 4 && assignment.points.length >= 2) {
                const cappedPoints = truncatePathToLength(assignment.points, Math.max(8, maximumDisplacementPx));
                return {
                    ...assignment,
                    points: host.sanitizeAirShowEntryPath(cappedPoints, assignment.actor.role === "interceptor"
                        ? {
                            maxTurnDeg: 40,
                            strongTurnDeg: 82,
                            maxFirstSegmentPx: 76,
                            maxSharpTurnDeg: 104,
                            maxWaypointsToRemove: 3
                        }
                        : {
                            maxTurnDeg: 38,
                            strongTurnDeg: 78,
                            maxFirstSegmentPx: 72,
                            maxSharpTurnDeg: 100,
                            maxWaypointsToRemove: 3
                        })
                };
            }
            const speedLimitedDisplacementPx = bomberIngressDurationMs * host.airShowFighterSpeedPxPerMs * 0.96;
            const minimumDisplacementPx = Math.max(42, Math.min(assignment.actor.role === "interceptor" ? 66 : 62, speedLimitedDisplacementPx));
            if (displacementPx >= minimumDisplacementPx || assignment.points.length < 2) {
                return assignment;
            }
            const ingressFlight = flightMap.get(assignment.actor.flightId);
            const previousBoundaryVector = ingressFlight
                ? resolvePreviousPhaseBoundaryVector(ingressFlight)
                : null;
            const fallbackForward = resolveHeadingVector(endSample.headingDegrees, previousBoundaryVector
                ? { x: previousBoundaryVector.dx, y: previousBoundaryVector.dy }
                : { x: dx, y: dy });
            const forward = displacementPx > 0.5
                ? { x: dx / displacementPx, y: dy / displacementPx }
                : fallbackForward;
            const startPoint = assignment.points[0];
            const endPoint = {
                cx: startPoint.cx + forward.x * minimumDisplacementPx,
                cy: startPoint.cy + forward.y * minimumDisplacementPx
            };
            return {
                ...assignment,
                points: host.sanitizeAirShowEntryPath([
                    startPoint,
                    ...assignment.points.slice(1, -1),
                    endPoint
                ], assignment.actor.role === "interceptor"
                    ? {
                        maxTurnDeg: 40,
                        strongTurnDeg: 82,
                        maxFirstSegmentPx: 76,
                        maxSharpTurnDeg: 104,
                        maxWaypointsToRemove: 3
                    }
                    : {
                        maxTurnDeg: 38,
                        strongTurnDeg: 78,
                        maxFirstSegmentPx: 72,
                        maxSharpTurnDeg: 100,
                        maxWaypointsToRemove: 3
                    })
            };
        });
        const fighterIngressFlightLanesById = new Map();
        ["interceptor", "escort"].forEach((role) => {
            const flightIds = Array.from(new Set(motionLockedBomberIngressAssignments
                .filter((assignment) => assignment.actor.role === role)
                .map((assignment) => assignment.actor.flightId)));
            flightIds.forEach((flightId, index) => {
                fighterIngressFlightLanesById.set(flightId, flightIds.length <= 1 ? 0 : index - (flightIds.length - 1) / 2);
            });
        });
        const flightSpreadBomberIngressAssignments = motionLockedBomberIngressAssignments.map((assignment) => {
            if (assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort") {
                return assignment;
            }
            const flightLane = fighterIngressFlightLanesById.get(assignment.actor.flightId) ?? 0;
            if (Math.abs(flightLane) < 0.001 || assignment.points.length < 2) {
                return assignment;
            }
            const lastIndex = assignment.points.length - 1;
            const laneOffsetPx = flightLane * (assignment.actor.role === "interceptor" ? 12 : 10);
            const visualLaneOffsetPx = flightLane * (assignment.actor.role === "interceptor" ? 24 : 18);
            return {
                ...assignment,
                multiFlightOffsetPx: (assignment.multiFlightOffsetPx ?? 0) + visualLaneOffsetPx,
                points: assignment.points.map((point, pointIndex) => {
                    if (pointIndex === 0) {
                        return point;
                    }
                    const progress = pointIndex / Math.max(1, lastIndex);
                    const ramp = progress * progress;
                    return {
                        cx: point.cx
                            + (corridor.normal.x * laneOffsetPx + corridor.axis.x * laneOffsetPx * 0.12) * ramp,
                        cy: point.cy
                            + (corridor.normal.y * laneOffsetPx + corridor.axis.y * laneOffsetPx * 0.12) * ramp
                    };
                })
            };
        });
        recordPhase("bomber-ingress", flightSpreadBomberIngressAssignments, bomberIngressDurationMs, [], bomberIngressFlakBursts, bomberIngressRoleSpeeds);
        previousPhaseAssignments = flightSpreadBomberIngressAssignments;
        previousPhaseDurationMs = bomberIngressDurationMs;
        updateFlightAnchors([...survivingBombers, ...survivingInterceptors, ...survivingEscorts]);
        const bomberPassEntriesByBomber = host.resolveAirShowBomberPassEntries(scene, flightMap);
        const bomberAttackEntries = survivingBombers.flatMap((bomberFlight) => (bomberPassEntriesByBomber.get(bomberFlight.spec.id) ?? []).map((entry) => ({
            ...entry,
            bomberFlight
        })));
        const attackEntriesForShow = host.resolveAirShowBomberDefensePassAttackEntries(bomberAttackEntries, interceptorFlights, survivingBombers);
        const hasAuthoredBomberDefensePasses = bomberAttackEntries.length > 0;
        if (attackEntriesForShow.length > 0) {
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
            const phaseAssignments = [...bomberDefenseAssignments];
            const tracerBursts = [];
            const attackEntriesByBomberId = new Map();
            attackEntriesForShow.forEach((entry, attackEntryIndex) => {
                const bomberEntries = attackEntriesByBomberId.get(entry.bomberFlight.spec.id) ?? [];
                bomberEntries.push(entry);
                attackEntriesByBomberId.set(entry.bomberFlight.spec.id, bomberEntries);
            });
            const bomberAttackContexts = new Map();
            const buildPhaseTracerTimings = (centerProgress, offsets, minProgress, maxProgress) => offsets
                .map((offset) => host.clamp(centerProgress + offset, minProgress, maxProgress))
                .filter((timing, index, timings) => timings.findIndex((candidate) => Math.abs(candidate - timing) < 0.012) === index);
            const scoreBomberDefenseEntryPath = (path, boundaryVector, phaseCorridor, passDirection, targetPoint) => {
                if (path.length < 2) {
                    return Number.POSITIVE_INFINITY;
                }
                const start = path[0];
                const firstPoint = path.find((point, index) => index > 0 && !!start && Math.hypot(point.cx - start.cx, point.cy - start.cy) > 0.5) ?? null;
                const secondPoint = path.find((point, index) => index > 1 && !!firstPoint && Math.hypot(point.cx - firstPoint.cx, point.cy - firstPoint.cy) > 0.5) ?? null;
                const entryTurnDeg = boundaryVector && firstPoint
                    ? resolveVectorAngleDegrees({ x: boundaryVector.dx, y: boundaryVector.dy }, {
                        x: firstPoint.cx - start.cx,
                        y: firstPoint.cy - start.cy
                    })
                    : 0;
                let maxEarlyTurnDeg = 0;
                for (let index = 1; index < Math.min(path.length - 1, 5); index += 1) {
                    const previous = path[index - 1];
                    const current = path[index];
                    const next = path[index + 1];
                    if (!previous || !current || !next) {
                        continue;
                    }
                    maxEarlyTurnDeg = Math.max(maxEarlyTurnDeg, resolveWaypointTurnDegrees(previous, current, next));
                }
                let earlyRegressionPenalty = 0;
                for (let index = 1; index < Math.min(path.length, 4); index += 1) {
                    const previous = path[index - 1];
                    const current = path[index];
                    if (!previous || !current) {
                        continue;
                    }
                    const previousAlongPx = host.resolveAirShowCorridorCoordinates(phaseCorridor, previous).alongPx;
                    const currentAlongPx = host.resolveAirShowCorridorCoordinates(phaseCorridor, current).alongPx;
                    if ((currentAlongPx - previousAlongPx) * passDirection < -4) {
                        earlyRegressionPenalty += 240;
                    }
                }
                const firstPointDistancePenalty = firstPoint
                    && Math.hypot(firstPoint.cx - targetPoint.cx, firstPoint.cy - targetPoint.cy)
                        > Math.hypot(start.cx - targetPoint.cx, start.cy - targetPoint.cy) + 28
                    ? 18
                    : 0;
                const secondTurnPenalty = boundaryVector && firstPoint && secondPoint
                    ? resolveVectorAngleDegrees({
                        x: firstPoint.cx - start.cx,
                        y: firstPoint.cy - start.cy
                    }, {
                        x: secondPoint.cx - firstPoint.cx,
                        y: secondPoint.cy - firstPoint.cy
                    }) * 0.7
                    : 0;
                return (entryTurnDeg * 5
                    + maxEarlyTurnDeg * 0.7
                    + secondTurnPenalty * 0.6
                    + earlyRegressionPenalty
                    + firstPointDistancePenalty);
            };
            attackEntriesByBomberId.forEach((entries) => {
                entries.forEach((entry, localAttackIndex) => {
                    bomberAttackContexts.set(entry.interceptorFlight.spec.id, {
                        localAttackCount: entries.length,
                        localAttackIndex
                    });
                });
            });
            attackEntriesForShow.forEach((entry, attackEntryIndex) => {
                const interceptorCurrent = host.averageAirShowPosition(entry.interceptorFlight.actors) ?? entry.interceptorFlight.anchor;
                const interceptorEntryHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(entry.interceptorFlight, host.resolveAirShowFlightHeadingDegrees(entry.interceptorFlight));
                const attackContext = bomberAttackContexts.get(entry.interceptorFlight.spec.id);
                const rawLane = !attackContext || attackContext.localAttackCount <= 1
                    ? 0
                    : attackContext.localAttackIndex - (attackContext.localAttackCount - 1) / 2;
                const lane = hasAuthoredBomberDefensePasses ? rawLane : rawLane * 0.55;
                const bomberCurrent = host.averageAirShowPosition(entry.bomberFlight.actors) ?? entry.bomberFlight.anchor;
                const bomberApproachProfile = bomberApproachProfilesById.get(entry.bomberFlight.spec.id);
                const defenseTargetPoint = bomberDefenseTargets.find((candidate) => candidate.bomberFlight.spec.id === entry.bomberFlight.spec.id)?.defenseTarget
                    ?? bomberApproachProfile?.targetApproach
                    ?? corridor.strike;
                const attackFocusPoint = hasAuthoredBomberDefensePasses
                    ? defenseTargetPoint
                    : {
                        cx: bomberCurrent.cx + (defenseTargetPoint.cx - bomberCurrent.cx) * 0.46,
                        cy: bomberCurrent.cy + (defenseTargetPoint.cy - bomberCurrent.cy) * 0.46
                    };
                const attackCorridor = host.resolveAirShowCorridor(center, bomberCurrent, bomberApproachProfile?.targetCenter ?? corridor.strike);
                const attackPassEnd = Math.round(host.resolveAirShowCorridorCoordinates(attackCorridor, attackFocusPoint).alongPx);
                const attackPassStart = attackPassEnd - (hasAuthoredBomberDefensePasses ? 132 : 112);
                const fallbackDirection = host.resolveAirShowCorridorSideSign(interceptorCurrent, attackCorridor, (attackContext?.localAttackIndex ?? 0) % 2 === 0 ? -1 : 1);
                const headingDirectedDirection = host.resolveAirShowRouteSideSign(interceptorCurrent, attackFocusPoint, interceptorEntryHeadingDegrees, fallbackDirection);
                const passDirection = attackPassEnd >= attackPassStart ? 1 : -1;
                const previousBoundaryVector = resolvePreviousPhaseBoundaryVector(entry.interceptorFlight);
                const candidateAttackSigns = [
                    headingDirectedDirection,
                    fallbackDirection,
                    -headingDirectedDirection,
                    -fallbackDirection
                ].map((sign) => (sign >= 0 ? 1 : -1))
                    .filter((sign, index, signs) => signs.indexOf(sign) === index);
                const buildBomberDefenseAttackPath = (attackSideSign) => {
                    const targetVector = normalizeVector(attackFocusPoint.cx - interceptorCurrent.cx, attackFocusPoint.cy - interceptorCurrent.cy, 0, -1);
                    const headingVector = resolveHeadingVector(interceptorEntryHeadingDegrees, targetVector);
                    const headingDot = headingVector.x * targetVector.x + headingVector.y * targetVector.y;
                    const entryVector = headingDot > 0.25
                        ? normalizeVector(targetVector.x * 0.72 + headingVector.x * 0.28, targetVector.y * 0.72 + headingVector.y * 0.28, targetVector.x, targetVector.y)
                        : targetVector;
                    const lateralVector = {
                        x: -targetVector.y * attackSideSign,
                        y: targetVector.x * attackSideSign
                    };
                    const attackDistancePx = Math.max(1, Math.hypot(attackFocusPoint.cx - interceptorCurrent.cx, attackFocusPoint.cy - interceptorCurrent.cy));
                    const leadOnePx = host.clamp(attackDistancePx * 0.18, 38, 58);
                    const leadTwoPx = host.clamp(attackDistancePx * 0.42, 86, 132);
                    const laneSpreadPx = lane * 10;
                    const attackLinePath = [
                        interceptorCurrent,
                        {
                            cx: interceptorCurrent.cx + entryVector.x * leadOnePx,
                            cy: interceptorCurrent.cy + entryVector.y * leadOnePx
                        },
                        {
                            cx: interceptorCurrent.cx
                                + targetVector.x * leadTwoPx
                                + lateralVector.x * (10 + laneSpreadPx),
                            cy: interceptorCurrent.cy
                                + targetVector.y * leadTwoPx
                                + lateralVector.y * (10 + laneSpreadPx)
                        },
                        {
                            cx: attackFocusPoint.cx
                                + lateralVector.x * Math.max(-12, Math.min(12, laneSpreadPx * 0.45)),
                            cy: attackFocusPoint.cy
                                + lateralVector.y * Math.max(-12, Math.min(12, laneSpreadPx * 0.45))
                        },
                        {
                            cx: attackFocusPoint.cx
                                + targetVector.x * 92
                                + lateralVector.x * Math.max(-10, Math.min(10, laneSpreadPx * 0.3)),
                            cy: attackFocusPoint.cy
                                + targetVector.y * 92
                                + lateralVector.y * Math.max(-10, Math.min(10, laneSpreadPx * 0.3))
                        }
                    ];
                    return host.sanitizeAirShowEntryPath(attackLinePath, {
                        maxTurnDeg: 34,
                        strongTurnDeg: 68,
                        maxFirstSegmentPx: 68,
                        maxSharpTurnDeg: 96,
                        maxWaypointsToRemove: 3
                    });
                };
                const interceptorPath = candidateAttackSigns
                    .map((attackSideSign) => {
                    const path = buildBomberDefenseAttackPath(attackSideSign);
                    return {
                        path,
                        score: scoreBomberDefenseEntryPath(path, previousBoundaryVector, attackCorridor, passDirection, attackFocusPoint)
                    };
                })
                    .sort((left, right) => left.score - right.score)[0]?.path
                    ?? buildBomberDefenseAttackPath(fallbackDirection);
                phaseAssignments.push(...host.buildAirShowFlightAssignments(entry.interceptorFlight, interceptorPath, 0.3, attackEntryIndex, Math.max(1, attackEntriesForShow.length)));
            });
            const activeScreeningEscorts = activeFlights(escortFlights);
            const screeningEscortAssignments = activeScreeningEscorts.flatMap((flight, escortIndex) => (() => {
                const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                const laneIndex = escortIndex - (activeScreeningEscorts.length - 1) / 2;
                const startHeadingDegrees = resolvePreviousPhaseBoundaryHeadingDegrees(flight, host.resolveAirShowFlightHeadingDegrees(flight));
                const escortTargetPoint = host.projectAirShowCorridorPoint(corridor, passEnd + 18 + laneIndex * 12, 84 + laneIndex * 20);
                const routeSideSign = host.resolveAirShowRouteSideSign(current, escortTargetPoint, startHeadingDegrees, laneIndex >= 0 ? 1 : -1);
                const escortForwardVector = resolveHeadingVector(startHeadingDegrees, {
                    x: escortTargetPoint.cx - current.cx,
                    y: escortTargetPoint.cy - current.cy
                });
                const escortLateralVector = {
                    x: -escortForwardVector.y * routeSideSign,
                    y: escortForwardVector.x * routeSideSign
                };
                const escortScreenPath = [
                    current,
                    {
                        cx: current.cx + escortForwardVector.x * 54 + escortLateralVector.x * (4 + Math.abs(laneIndex) * 2),
                        cy: current.cy + escortForwardVector.y * 54 + escortLateralVector.y * (4 + Math.abs(laneIndex) * 2)
                    },
                    {
                        cx: current.cx + escortForwardVector.x * 126 + escortLateralVector.x * (10 + Math.abs(laneIndex) * 3),
                        cy: current.cy + escortForwardVector.y * 126 + escortLateralVector.y * (10 + Math.abs(laneIndex) * 3)
                    },
                    {
                        cx: current.cx + escortForwardVector.x * 214 + escortLateralVector.x * (16 + Math.abs(laneIndex) * 4),
                        cy: current.cy + escortForwardVector.y * 214 + escortLateralVector.y * (16 + Math.abs(laneIndex) * 4)
                    },
                    escortTargetPoint
                ];
                return host.buildAirShowFlightAssignments(flight, host.sanitizeAirShowEntryPath(escortScreenPath, {
                    maxTurnDeg: 36,
                    strongTurnDeg: 74,
                    maxFirstSegmentPx: 60,
                    maxSharpTurnDeg: 102,
                    maxWaypointsToRemove: 4
                }), 0.24, escortIndex, Math.max(1, activeScreeningEscorts.length));
            })());
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
                entryTurnLimitDeg: 54,
                softenEntryRoles: ["bomber", "interceptor", "escort"],
                softenEntryTurnLimitDeg: 70,
                softenEntryWaypointCount: 24,
                softenExitRoles: ["bomber", "interceptor", "escort"],
                softenExitTurnLimitDeg: 78,
                softenExitWaypointCount: 14
            });
            let bomberDefensePlaybackAssignments = [
                ...spacedPhaseAssignments,
                ...screeningEscortAssignments
            ];
            const previousBomberDefenseAssignmentsByActorId = host.buildAirShowAssignmentLookup(previousPhaseAssignments);
            bomberDefensePlaybackAssignments = bomberDefensePlaybackAssignments.map((assignment) => {
                if (assignment.actor.role !== "interceptor"
                    && assignment.actor.role !== "escort") {
                    return assignment;
                }
                if (assignment.points.length < 3 || previousPhaseDurationMs <= 0) {
                    return assignment;
                }
                const previousAssignment = previousBomberDefenseAssignmentsByActorId.get(assignment.actor.id);
                if (!previousAssignment) {
                    return assignment;
                }
                const previousSampleA = host.sampleAirShowAssignmentAtTime(previousAssignment, previousPhaseDurationMs * 0.88, previousPhaseDurationMs);
                const previousSampleB = host.sampleAirShowAssignmentAtTime(previousAssignment, previousPhaseDurationMs, previousPhaseDurationMs, 1);
                const renderedOffsetPx = assignment.multiFlightOffsetPx ?? 0;
                const renderedStart = {
                    cx: previousSampleB.position.cx,
                    cy: previousSampleB.position.cy
                };
                const routeAnchorIndex = assignment.points.length >= 5
                    ? 3
                    : assignment.points.length - 1;
                const routeAnchor = assignment.points[routeAnchorIndex];
                const renderedRouteAnchor = {
                    cx: routeAnchor.cx + renderedOffsetPx,
                    cy: routeAnchor.cy
                };
                const targetForward = normalizeVector(renderedRouteAnchor.cx - renderedStart.cx, renderedRouteAnchor.cy - renderedStart.cy, corridor.axis.x, corridor.axis.y);
                let entryForward = normalizeVector(previousSampleB.position.cx - previousSampleA.position.cx, previousSampleB.position.cy - previousSampleA.position.cy, targetForward.x, targetForward.y);
                const entryTargetDot = entryForward.x * targetForward.x + entryForward.y * targetForward.y;
                if (entryTargetDot < 0.16) {
                    entryForward = normalizeVector(entryForward.x * 0.25 + targetForward.x * 1.75, entryForward.y * 0.25 + targetForward.y * 1.75, targetForward.x, targetForward.y);
                }
                const entryBlendWeight = entryTargetDot < 0.16 ? 0.24 : 0.52;
                const blendedForward = normalizeVector(entryForward.x * entryBlendWeight + targetForward.x * (1 - entryBlendWeight), entryForward.y * entryBlendWeight + targetForward.y * (1 - entryBlendWeight), targetForward.x, targetForward.y);
                const routeAnchorDistancePx = Math.max(1, Math.hypot(renderedRouteAnchor.cx - renderedStart.cx, renderedRouteAnchor.cy - renderedStart.cy));
                const leadADistancePx = host.clamp(routeAnchorDistancePx * 0.42, 16, 54);
                const leadBDistancePx = host.clamp(routeAnchorDistancePx * 0.78, leadADistancePx + 8, Math.max(leadADistancePx + 8, routeAnchorDistancePx - 6));
                const renderedLeadA = host.offsetAirShowPoint(renderedStart, blendedForward.x * leadADistancePx, blendedForward.y * leadADistancePx);
                const renderedLeadB = host.offsetAirShowPoint(renderedStart, blendedForward.x * leadBDistancePx, blendedForward.y * leadBDistancePx);
                const smoothedEntryPoints = [
                    renderedStart,
                    renderedLeadA,
                    renderedLeadB,
                    ...assignment.points.slice(routeAnchorIndex).map((point) => ({
                        cx: point.cx + renderedOffsetPx,
                        cy: point.cy
                    }))
                ].map((point) => ({
                    cx: point.cx - renderedOffsetPx,
                    cy: point.cy
                }));
                return {
                    ...assignment,
                    points: smoothedEntryPoints
                };
            });
            const bomberDefenseAssignmentsByActorId = host.buildAirShowAssignmentLookup(bomberDefensePlaybackAssignments);
            const sampleFlightCenterAtProgress = (flight, progress) => {
                const sampledActorPositions = flight.actors.flatMap((actor) => {
                    const assignment = bomberDefenseAssignmentsByActorId.get(actor.id);
                    const sampledPosition = assignment
                        ? host.sampleAirShowAssignmentAtTime(assignment, bomberPassBeatDurationMs * progress, bomberPassBeatDurationMs).position
                        : actor.position;
                    return sampledPosition ? [sampledPosition] : [];
                });
                return host.averageAirShowPoints(sampledActorPositions);
            };
            const resolveClosestApproachProgress = (sourceFlight, targetFlight) => {
                let bestProgress = null;
                let bestDistancePx = Number.POSITIVE_INFINITY;
                const sampleCount = 13;
                for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
                    const progress = 0.12 + (0.72 * sampleIndex) / Math.max(1, sampleCount - 1);
                    const sourcePoint = sampleFlightCenterAtProgress(sourceFlight, progress);
                    const targetPoint = sampleFlightCenterAtProgress(targetFlight, progress);
                    if (!sourcePoint || !targetPoint) {
                        continue;
                    }
                    const distancePx = Math.hypot(sourcePoint.cx - targetPoint.cx, sourcePoint.cy - targetPoint.cy);
                    if (distancePx < bestDistancePx) {
                        bestDistancePx = distancePx;
                        bestProgress = progress;
                    }
                }
                return bestProgress;
            };
            attackEntriesForShow.forEach((entry) => {
                const attackContext = bomberAttackContexts.get(entry.interceptorFlight.spec.id);
                const attackLaneOffset = attackContext && attackContext.localAttackCount > 1
                    ? attackContext.localAttackIndex - (attackContext.localAttackCount - 1) / 2
                    : 0;
                const attackCenterProgress = host.clamp((resolveClosestApproachProgress(entry.interceptorFlight, entry.bomberFlight) ?? 0.48)
                    + attackLaneOffset * 0.025, 0.16, 0.82);
                const attackTimings = buildPhaseTracerTimings(attackCenterProgress, [-0.16, -0.1, -0.04, 0.03, 0.1, 0.17], 0.08, 0.92);
                const defensiveTimings = buildPhaseTracerTimings(host.clamp(attackCenterProgress + 0.04, 0.18, 0.88), [-0.03, 0.08, 0.18], 0.12, 0.94);
                tracerBursts.push(...host.buildAirShowBomberDefensePassTracerBursts(bomberDefensePlaybackAssignments, entry.interceptorFlight, entry.bomberFlight, {
                    attackTimings: attackTimings.length > 0 ? attackTimings : [0.28, 0.4, 0.52, 0.64],
                    defensiveTimings: defensiveTimings.length > 0 ? defensiveTimings : [0.34, 0.5, 0.66],
                    fallbackToNearest: true
                }));
            });
            if (tracerBursts.length === 0) {
                const fallbackAttackerFlight = activeFlights(interceptorFlights)[0]
                    ?? activeFlights(escortFlights)[0]
                    ?? null;
                const fallbackBomberFlight = survivingBombers[0] ?? null;
                const fallbackInterceptor = fallbackAttackerFlight?.actors.find((actor) => actor.active) ?? null;
                const fallbackBomber = fallbackBomberFlight?.actors.find((actor) => actor.active) ?? null;
                if (fallbackAttackerFlight && fallbackBomberFlight) {
                    tracerBursts.push(...host.buildAirShowBomberDefensePassTracerBursts(bomberDefensePlaybackAssignments, fallbackAttackerFlight, fallbackBomberFlight, {
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
            recordPhase("bomber-defense-pass", bomberDefensePlaybackAssignments, bomberPassBeatDurationMs, tracerBursts, bomberDefenseFlakBursts, bomberDefenseRoleSpeeds);
            previousPhaseAssignments = bomberDefensePlaybackAssignments;
            previousPhaseDurationMs = bomberPassBeatDurationMs;
            updateFlightAnchors([...survivingBombers, ...interceptorFlights, ...escortFlights]);
            survivingBombers.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, shouldDeferBomberFinalStrengthForFlak(flight)
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
        let strikeRunDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(bomberStrikeRunAssignments, strikeRunRoleSpeeds, scene.strikeRunDurationMs ?? 980, 640, 7000, ["bomber"]);
        const fighterPeelHeadingByFlightId = collectStableTailHeadingsByFlightId(previousPhaseAssignments, previousPhaseDurationMs, 0.72, 0.92);
        const fighterPeelAssignments = buildFighterPeelAssignments(targetRunFighterFlights, strikeRunDurationMs, fighterPeelHeadingByFlightId);
        const strikeRunAssignments = [
            ...bomberStrikeRunAssignments,
            ...fighterPeelAssignments
        ];
        const strikeRunTracerBursts = [];
        const scopedStrikeRunFlakBursts = remapFlakBurstsToPhase(collectScopedBomberFlakBursts(postPassBombers), {
            globalStartProgress: 0.78,
            globalEndProgress: 1,
            localStartProgress: 0.54,
            localEndProgress: host.clamp(Math.max(0.66, (scene.bombReleaseProgress ?? 0.92) - 0.04), 0.66, 0.88),
            includeEnd: true
        });
        const strikeRunFlakBursts = scopedStrikeRunFlakBursts.length > 0
            ? scopedStrikeRunFlakBursts
            : Array.from(collectScopedBomberFlakBursts(postPassBombers).reduce((burstsByBomberId, burst) => {
                if (!burst.bomberUnitKey) {
                    return burstsByBomberId;
                }
                const previousBurst = burstsByBomberId.get(burst.bomberUnitKey);
                if (!previousBurst || burst.progress > previousBurst.progress) {
                    burstsByBomberId.set(burst.bomberUnitKey, burst);
                }
                return burstsByBomberId;
            }, new Map()).values()).map((burst, index) => ({
                ...burst,
                progress: host.clamp(0.54 + index * 0.045, 0.54, host.clamp(Math.max(0.7, (scene.bombReleaseProgress ?? 0.92) - 0.04), 0.7, 0.88))
            }));
        let finalizedStrikeRunAssignments = host.prepareAirShowPhaseAssignments(strikeRunAssignments, strikeRunDurationMs, [0.18, 0.42, 0.66, 0.86], undefined, strikeRunRoleSpeeds, {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 78,
            softenEntryRoles: ["bomber", "interceptor", "escort"],
            softenEntryTurnLimitDeg: 92,
            softenEntryWaypointCount: 7
        });
        host.collectAirShowFlightTailHeadings(finalizedStrikeRunAssignments, {
            role: "bomber",
            sampleStartProgress: 0.9,
            sampleEndProgress: 1
        }).forEach((headingDegrees, flightId) => {
            egressHeadingByFlightId.set(flightId, headingDegrees);
        });
        strikeRunDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(finalizedStrikeRunAssignments, strikeRunRoleSpeeds, strikeRunDurationMs, 560, 7000, ["bomber"]);
        const previousInspectionPhase = phases[phases.length - 1];
        if (previousInspectionPhase) {
            finalizedStrikeRunAssignments = finalizedStrikeRunAssignments.map((assignment) => {
                const previousInspectionAssignment = previousInspectionPhase.assignments.find((candidate) => candidate.actorId === assignment.actor.id);
                const previousInspectionEnd = previousInspectionAssignment?.sampledPositions[previousInspectionAssignment.sampledPositions.length - 1] ?? null;
                const plannedStart = assignment.points[0] ?? assignment.actor.position;
                const renderedOffsetPx = assignment.multiFlightOffsetPx ?? 0;
                if (!plannedStart) {
                    return assignment;
                }
                const continuityDx = previousInspectionEnd
                    ? previousInspectionEnd.cx - (plannedStart.cx + renderedOffsetPx)
                    : 0;
                const continuityDy = previousInspectionEnd ? previousInspectionEnd.cy - plannedStart.cy : 0;
                const needsContinuityShift = Math.hypot(continuityDx, continuityDy) > 0.5;
                const shiftedPoints = needsContinuityShift
                    ? assignment.points.map((point) => ({
                        cx: point.cx + continuityDx,
                        cy: point.cy + continuityDy
                    }))
                    : assignment.points;
                const radiallyCommittedPoints = assignment.actor.role === "interceptor" || assignment.actor.role === "escort"
                    ? (() => {
                        const startPoint = shiftedPoints[0];
                        const endPoint = shiftedPoints[shiftedPoints.length - 1];
                        if (!startPoint || !endPoint || shiftedPoints.length < 2) {
                            return shiftedPoints;
                        }
                        const renderedStartPoint = {
                            cx: startPoint.cx + renderedOffsetPx,
                            cy: startPoint.cy
                        };
                        const renderedEndPoint = {
                            cx: endPoint.cx + renderedOffsetPx,
                            cy: endPoint.cy
                        };
                        const startDistancePx = Math.hypot(renderedStartPoint.cx - corridor.center.cx, renderedStartPoint.cy - corridor.center.cy);
                        const endDistancePx = Math.hypot(renderedEndPoint.cx - corridor.center.cx, renderedEndPoint.cy - corridor.center.cy);
                        const minimumEndDistancePx = startDistancePx + (assignment.actor.role === "escort" ? 150 : 128);
                        const correction = endDistancePx >= minimumEndDistancePx
                            ? { x: 0, y: 0 }
                            : (() => {
                                const outward = normalizeVector(renderedEndPoint.cx - corridor.center.cx, renderedEndPoint.cy - corridor.center.cy, renderedStartPoint.cx - corridor.center.cx, renderedStartPoint.cy - corridor.center.cy);
                                const desiredEndPoint = host.offsetAirShowPoint(corridor.center, outward.x * minimumEndDistancePx, outward.y * minimumEndDistancePx);
                                return {
                                    x: desiredEndPoint.cx - renderedEndPoint.cx,
                                    y: desiredEndPoint.cy - renderedEndPoint.cy
                                };
                            })();
                        const correctionStartIndex = shiftedPoints.length <= 4 ? 1 : 3;
                        const correctedPoints = shiftedPoints.map((point, pointIndex) => {
                            const ramp = Math.max(0, pointIndex - correctionStartIndex)
                                / Math.max(1, shiftedPoints.length - 1 - correctionStartIndex);
                            const easedRamp = ramp * ramp;
                            return {
                                cx: point.cx + correction.x * easedRamp,
                                cy: point.cy + correction.y * easedRamp
                            };
                        });
                        const previousSamples = previousInspectionAssignment?.sampledPositions ?? [];
                        const previousSampleA = previousSamples[previousSamples.length - 2];
                        const previousSampleB = previousSamples[previousSamples.length - 1];
                        const correctedStart = correctedPoints[0];
                        const correctedEnd = correctedPoints[correctedPoints.length - 1];
                        if (!correctedStart || !correctedEnd || !previousSampleA || !previousSampleB) {
                            return correctedPoints;
                        }
                        const renderedStart = {
                            cx: correctedStart.cx + renderedOffsetPx,
                            cy: correctedStart.cy
                        };
                        const renderedEnd = {
                            cx: correctedEnd.cx + renderedOffsetPx,
                            cy: correctedEnd.cy
                        };
                        const targetForward = normalizeVector(renderedEnd.cx - renderedStart.cx, renderedEnd.cy - renderedStart.cy, corridor.axis.x, corridor.axis.y);
                        let entryForward = normalizeVector(previousSampleB.cx - previousSampleA.cx, previousSampleB.cy - previousSampleA.cy, targetForward.x, targetForward.y);
                        const entryTargetDot = entryForward.x * targetForward.x + entryForward.y * targetForward.y;
                        if (entryTargetDot < 0.12) {
                            entryForward = normalizeVector(entryForward.x + targetForward.x * 1.35, entryForward.y + targetForward.y * 1.35, targetForward.x, targetForward.y);
                        }
                        const blendedForward = normalizeVector(entryForward.x * 0.58 + targetForward.x * 0.42, entryForward.y * 0.58 + targetForward.y * 0.42, targetForward.x, targetForward.y);
                        const routeNormal = {
                            x: -targetForward.y * (assignment.actor.role === "escort" ? 1 : -1),
                            y: targetForward.x * (assignment.actor.role === "escort" ? 1 : -1)
                        };
                        const renderedLeadA = host.offsetAirShowPoint(renderedStart, blendedForward.x * 72, blendedForward.y * 72);
                        const renderedLeadB = host.offsetAirShowPoint(renderedStart, blendedForward.x * 128 + targetForward.x * 46, blendedForward.y * 128 + targetForward.y * 46);
                        const renderedMid = host.offsetAirShowPoint({
                            cx: renderedStart.cx + (renderedEnd.cx - renderedStart.cx) * 0.62,
                            cy: renderedStart.cy + (renderedEnd.cy - renderedStart.cy) * 0.62
                        }, routeNormal.x * 18, routeNormal.y * 18);
                        return [
                            renderedStart,
                            renderedLeadA,
                            renderedLeadB,
                            renderedMid,
                            renderedEnd
                        ].map((point) => ({
                            cx: point.cx - renderedOffsetPx,
                            cy: point.cy
                        }));
                    })()
                    : shiftedPoints;
                return {
                    ...assignment,
                    actor: needsContinuityShift
                        ? {
                            ...assignment.actor,
                            position: {
                                cx: previousInspectionEnd.cx,
                                cy: previousInspectionEnd.cy
                            }
                        }
                        : assignment.actor,
                    points: radiallyCommittedPoints
                };
            });
        }
        recordPhase("target-run", finalizedStrikeRunAssignments, strikeRunDurationMs, strikeRunTracerBursts, strikeRunFlakBursts, strikeRunRoleSpeeds);
        previousPhaseAssignments = finalizedStrikeRunAssignments;
        previousPhaseDurationMs = strikeRunDurationMs;
        updateFlightAnchors([
            ...postPassBombers,
            ...targetRunFighterFlights
        ]);
        postPassBombers.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
    }
    const fighterEgressFlights = activeFlights([...interceptorFlights, ...escortFlights]);
    const bomberEgressFlights = activeFlights(bomberFlights).filter((flight) => (flight.currentStrength ?? flight.spec.finalStrength ?? 0) > 0);
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
        const egressDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(egressAssignments, egressRoleSpeeds, scene.egressDurationMs ?? 1080, 820, 9800);
        const finalizedEgressAssignments = host.prepareAirShowPhaseAssignments(egressAssignments, egressDurationMs, [0.22, 0.5, 0.78], 42, egressRoleSpeeds, {
            previousAssignments: previousPhaseAssignments,
            previousDurationMs: previousPhaseDurationMs,
            entryTurnLimitDeg: 58,
            directTurnHomeRoles: ["bomber"]
        });
        const directedEgressAssignments = finalizedEgressAssignments.map((assignment) => {
            if (assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort") {
                return assignment;
            }
            const homeSideSign = assignment.actor.role === "escort" ? -1 : 1;
            const sideCorrectedPoints = hqMidX === null
                ? assignment.points
                : assignment.points.map((point, pointIndex) => {
                    if (pointIndex === 0) {
                        return point;
                    }
                    const sideFloorX = hqMidX + homeSideSign * (360 + Math.min(pointIndex, 4) * 28);
                    const targetCx = homeSideSign < 0
                        ? Math.min(point.cx, sideFloorX)
                        : Math.max(point.cx, sideFloorX);
                    const correctionWeight = host.clamp(pointIndex / 2, 0, 1);
                    return {
                        ...point,
                        cx: point.cx + (targetCx - point.cx) * correctionWeight
                    };
                });
            const homeSidePoints = buildSmoothHomeSideFighterEgressPath(sideCorrectedPoints, homeSideSign);
            return {
                ...assignment,
                points: homeSidePoints,
                progressTimeline: [
                    { timeMs: 0, progress: 0 },
                    { timeMs: Math.round(egressDurationMs * 0.22), progress: 0.44 },
                    { timeMs: Math.round(egressDurationMs * 0.62), progress: 0.86 },
                    { timeMs: egressDurationMs, progress: 1 }
                ]
            };
        });
        recordPhase("egress", directedEgressAssignments, egressDurationMs, [], [], egressRoleSpeeds);
    }
    return buildPlannedAirShowSceneReport();
}
