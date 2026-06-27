import { HEX_HEIGHT, HEX_WIDTH } from "../../core/balance";
import { buildAirShowInspectionOriginPlan, buildAirShowPhaseTimingAudit, resolveAirShowBoundsRayIntersection, resolveAirShowFallbackOrigin } from "./AirShowPlanner";
import { buildAirShowPresetRailPath, projectAirShowRailPoint, resolveAirShowRailCoordinates, resolveAirShowRailLaneOffsetPx } from "./AirShowRailPlanner";
function spreadBomberFormationAssignmentsForCorridor(assignments, corridor) {
    const actorCountByFlightId = new Map();
    assignments.forEach((assignment) => {
        if (assignment.actor.role !== "bomber") {
            return;
        }
        actorCountByFlightId.set(assignment.actor.flightId, Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1));
    });
    return assignments.map((assignment) => {
        if (assignment.actor.role !== "bomber") {
            return assignment;
        }
        const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
        if (actorCount <= 1) {
            return assignment;
        }
        const pairIndex = Math.floor(assignment.actor.formationIndex / 2);
        const pairCount = Math.ceil(actorCount / 2);
        const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
        const pairSlot = pairIndex - (pairCount - 1) / 2;
        const alongOffsetPx = pairSlot * 72 + sideSign * 9;
        const lateralOffsetPx = sideSign * (44 + pairIndex * 7);
        return {
            ...assignment,
            points: assignment.points.map((point) => ({
                cx: point.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
                cy: point.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
            }))
        };
    });
}
function resolveFighterFormationLaneOffsetPx(formationIndex, actorCount, flightLane, actorSpacingPx, flightBandPaddingPx) {
    const safeActorCount = Math.max(1, actorCount);
    const actorSlot = formationIndex - (safeActorCount - 1) / 2;
    const flightBandSpacingPx = Math.max(actorSpacingPx * safeActorCount + flightBandPaddingPx, actorSpacingPx * 2);
    return flightLane * flightBandSpacingPx + actorSlot * actorSpacingPx;
}
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
    const resolvePreviousPhaseSampledBoundaryVector = (flight, sampleWindowMs = 250) => {
        if ((previousPhaseAssignments?.length ?? 0) <= 0 || previousPhaseDurationMs <= 0) {
            return null;
        }
        const sampledVectors = previousPhaseAssignments
            .filter((assignment) => assignment.actor.flightId === flight.spec.id)
            .map((assignment) => {
            const endSample = host.sampleAirShowAssignmentAtTime(assignment, previousPhaseDurationMs, previousPhaseDurationMs);
            const nearEndSample = host.sampleAirShowAssignmentAtTime(assignment, Math.max(0, previousPhaseDurationMs - sampleWindowMs), previousPhaseDurationMs);
            const dx = endSample.position.cx - nearEndSample.position.cx;
            const dy = endSample.position.cy - nearEndSample.position.cy;
            return Math.hypot(dx, dy) > 0.5 ? { dx, dy } : null;
        })
            .filter((vector) => !!vector);
        if (sampledVectors.length <= 0) {
            return null;
        }
        return {
            dx: sampledVectors.reduce((sum, vector) => sum + vector.dx, 0) / sampledVectors.length,
            dy: sampledVectors.reduce((sum, vector) => sum + vector.dy, 0) / sampledVectors.length
        };
    };
    const resolvePreviousActorSampledBoundaryVector = (actorId, sampleWindowMs = 250) => {
        if ((previousPhaseAssignments?.length ?? 0) <= 0 || previousPhaseDurationMs <= 0) {
            return null;
        }
        const previousAssignment = previousPhaseAssignments.find((assignment) => assignment.actor.id === actorId);
        if (!previousAssignment) {
            return null;
        }
        const endSample = host.sampleAirShowAssignmentAtTime(previousAssignment, previousPhaseDurationMs, previousPhaseDurationMs);
        const nearEndSample = host.sampleAirShowAssignmentAtTime(previousAssignment, Math.max(0, previousPhaseDurationMs - sampleWindowMs), previousPhaseDurationMs);
        const dx = endSample.position.cx - nearEndSample.position.cx;
        const dy = endSample.position.cy - nearEndSample.position.cy;
        return Math.hypot(dx, dy) > 0.5
            ? { start: endSample.position, dx, dy }
            : null;
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
        if (alignment >= 0.78) {
            return [...path];
        }
        const normalizedBoundary = {
            dx: boundaryVector.dx / boundaryLength,
            dy: boundaryVector.dy / boundaryLength
        };
        const transitionTargetDistancePx = host.clamp(carryDistancePx * 2.7, 132, 240);
        let transitionEndIndex = 1;
        let traversedPx = 0;
        for (let index = 1; index < path.length; index += 1) {
            const previousPoint = path[index - 1];
            const currentPoint = path[index];
            if (!previousPoint || !currentPoint) {
                continue;
            }
            traversedPx += Math.hypot(currentPoint.cx - previousPoint.cx, currentPoint.cy - previousPoint.cy);
            transitionEndIndex = index;
            if (traversedPx >= transitionTargetDistancePx) {
                break;
            }
        }
        const transitionEnd = path[transitionEndIndex];
        if (transitionEnd && transitionEndIndex > 1) {
            const previousEnd = path[Math.max(0, transitionEndIndex - 1)] ?? start;
            const nextEnd = path[Math.min(path.length - 1, transitionEndIndex + 1)] ?? transitionEnd;
            const exitForward = normalizeVector(nextEnd.cx - previousEnd.cx, nextEnd.cy - previousEnd.cy, transitionEnd.cx - start.cx, transitionEnd.cy - start.cy);
            const transitionDistancePx = Math.max(1, Math.hypot(transitionEnd.cx - start.cx, transitionEnd.cy - start.cy));
            const entryHandlePx = host.clamp(transitionDistancePx * 0.42, 78, 178);
            const exitHandlePx = host.clamp(transitionDistancePx * 0.34, 68, 158);
            const firstControl = {
                cx: start.cx + normalizedBoundary.dx * entryHandlePx,
                cy: start.cy + normalizedBoundary.dy * entryHandlePx
            };
            const secondControl = {
                cx: transitionEnd.cx - exitForward.x * exitHandlePx,
                cy: transitionEnd.cy - exitForward.y * exitHandlePx
            };
            const transitionSamples = Array.from({ length: 17 }, (_, stepIndex) => {
                const t = stepIndex / 16;
                const inv = 1 - t;
                return {
                    cx: start.cx * inv * inv * inv
                        + firstControl.cx * 3 * inv * inv * t
                        + secondControl.cx * 3 * inv * t * t
                        + transitionEnd.cx * t * t * t,
                    cy: start.cy * inv * inv * inv
                        + firstControl.cy * 3 * inv * inv * t
                        + secondControl.cy * 3 * inv * t * t
                        + transitionEnd.cy * t * t * t
                };
            });
            return [
                ...transitionSamples,
                ...path.slice(transitionEndIndex + 1)
            ].filter((point, index, points) => {
                if (index === 0) {
                    return true;
                }
                const previousPoint = points[index - 1];
                return !previousPoint || Math.hypot(point.cx - previousPoint.cx, point.cy - previousPoint.cy) > 0.5;
            });
        }
        const carryPx = host.clamp(Math.min(carryDistancePx, firstVectorLength * 0.7), 18, Math.max(40, carryDistancePx));
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
    const isVisualSeedOnlyBomberFlight = (flight) => flight.spec.role === "bomber"
        && Math.max(0, flight.spec.strengthBefore, flight.spec.strengthAfterEscortPhase ?? 0, flight.spec.finalStrength ?? 0) <= 0
        && flight.currentStrength > 0;
    const resolvePostTargetRunBomberStrength = (flight) => isVisualSeedOnlyBomberFlight(flight)
        ? flight.currentStrength
        : Math.max(0, flight.spec.finalStrength ?? flight.currentStrength);
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
                const batteryCenter = burst.batteryHexKey ? host.resolveHexCenterByKey(burst.batteryHexKey) : null;
                const bomberTargetCenter = burst.bomberUnitKey ? bomberTargetCentersById.get(burst.bomberUnitKey) ?? null : null;
                const explicitRangeReferenceCenter = burst.rangeReferenceCenter ?? null;
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
                const rangeReferenceCenter = explicitRangeReferenceCenter
                    ?? batteryCenter
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
                    scale: burst.scale,
                    smokeScale: burst.smokeScale,
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
    const sceneVisibleWidthPx = visibleBounds
        ? Math.max(1, visibleBounds.maxX - visibleBounds.minX)
        : 0;
    const compactEgressLaneStepPx = visibleBounds && sceneVisibleWidthPx <= 1500
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
        const commitPeelTargetToHomeSide = (point) => ({
            ...point,
            cx: peelHomeSideSign < 0
                ? Math.min(point.cx, sideCommittedPeelX)
                : Math.max(point.cx, sideCommittedPeelX)
        });
        peelTarget = commitPeelTargetToHomeSide(peelTarget);
        const minimumRadialPeelDistancePx = currentCenterDistancePx + (flight.spec.role === "escort" ? 110 : 92);
        const peelTargetRadialDistancePx = Math.hypot(peelTarget.cx - corridor.center.cx, peelTarget.cy - corridor.center.cy);
        if (peelTargetRadialDistancePx < minimumRadialPeelDistancePx) {
            peelTarget = commitPeelTargetToHomeSide(host.offsetAirShowPoint(corridor.center, radialOutward.x * minimumRadialPeelDistancePx, radialOutward.y * minimumRadialPeelDistancePx));
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
            const anchoredPeelPoints = previousEnd && Math.hypot(continuityDx, continuityDy) > 0.5
                ? assignment.points.map((point, pointIndex) => {
                    const release = pointIndex / Math.max(1, assignment.points.length - 1);
                    const continuityWeight = (1 - release) * (1 - release);
                    const shiftedPoint = {
                        cx: point.cx + continuityDx * continuityWeight,
                        cy: point.cy + continuityDy * continuityWeight
                    };
                    if (pointIndex === 0) {
                        return shiftedPoint;
                    }
                    const homeSideWeight = release * release;
                    const sideCommittedCx = peelHomeSideSign < 0
                        ? Math.min(shiftedPoint.cx, sideCommittedPeelX)
                        : Math.max(shiftedPoint.cx, sideCommittedPeelX);
                    return {
                        ...shiftedPoint,
                        cx: shiftedPoint.cx
                            + (sideCommittedCx - shiftedPoint.cx) * homeSideWeight
                    };
                })
                : continuousPoints;
            return {
                ...assignment,
                actor: previousEnd && Math.hypot(continuityDx, continuityDy) > 0.5
                    ? {
                        ...assignment.actor,
                        position: previousEnd
                    }
                    : assignment.actor,
                points: anchoredPeelPoints,
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
        const sampledBoundaryVector = resolvePreviousPhaseSampledBoundaryVector(flight);
        const sampledBoundaryHeadingDegrees = sampledBoundaryVector && Math.hypot(sampledBoundaryVector.dx, sampledBoundaryVector.dy) > 0.5
            ? ((Math.atan2(sampledBoundaryVector.dy, sampledBoundaryVector.dx) * 180) / Math.PI + 90 + 360) % 360
            : null;
        const egressHeadingDegrees = sampledBoundaryHeadingDegrees
            ?? egressHeadingByFlightId.get(flight.spec.id)
            ?? host.resolveAirShowFlightHeadingDegrees(flight);
        const boundaryForward = sampledBoundaryVector && Math.hypot(sampledBoundaryVector.dx, sampledBoundaryVector.dy) > 0.5
            ? normalizeVector(sampledBoundaryVector.dx, sampledBoundaryVector.dy, corridor.axis.x, corridor.axis.y)
            : resolveHeadingVector(egressHeadingDegrees, corridor.axis);
        const egressPoint = (() => {
            const originCenter = hqAxis
                ? (flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin)
                : host.resolveHexCenterByKey(flight.spec.originHexKey);
            if (visibleBounds) {
                const laneOffsetPx = (index - (bomberFlightsForPhase.length - 1) / 2) * 14;
                const boundaryPoint = resolveAirShowBoundsRayIntersection(current, boundaryForward, visibleBounds)
                    ?? {
                        cx: host.clamp(current.cx + boundaryForward.x * host.offMapDistancePx, visibleBounds.minX, visibleBounds.maxX),
                        cy: host.clamp(current.cy + boundaryForward.y * host.offMapDistancePx, visibleBounds.minY, visibleBounds.maxY)
                    };
                const lateral = { x: -boundaryForward.y, y: boundaryForward.x };
                const egressOffMapDistancePx = host.offMapDistancePx * 0.38;
                return {
                    cx: boundaryPoint.cx
                        + boundaryForward.x * egressOffMapDistancePx
                        + lateral.x * laneOffsetPx
                        + (rand() - 0.5) * 8,
                    cy: boundaryPoint.cy
                        + boundaryForward.y * egressOffMapDistancePx
                        + lateral.y * laneOffsetPx
                        + (rand() - 0.5) * 8
                };
            }
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
        const headingForward = boundaryForward;
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
        const firstLegTarget = egressPath[1] ?? egressPoint;
        const continuityForward = normalizeVector(firstLegTarget.cx - current.cx, firstLegTarget.cy - current.cy, headingForward.x, headingForward.y);
        const continuityDistancePx = host.clamp(Math.hypot(firstLegTarget.cx - current.cx, firstLegTarget.cy - current.cy) * 0.42, 42, 74);
        const continuityPoint = host.offsetAirShowPoint(current, continuityForward.x * continuityDistancePx, continuityForward.y * continuityDistancePx);
        const continuitySeedPath = [
            current,
            continuityPoint,
            ...egressPath.slice(1)
        ].filter((point, pointIndex, path) => {
            if (pointIndex === 0) {
                return true;
            }
            const previous = path[pointIndex - 1];
            return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
        });
        const continuousEgressPath = host.sanitizeAirShowEntryPath(continuitySeedPath, {
            maxTurnDeg: 40,
            strongTurnDeg: 74,
            maxFirstSegmentPx: 72,
            maxSharpTurnDeg: 100,
            maxWaypointsToRemove: 2
        });
        return host.buildAirShowFlightAssignments(flight, continuousEgressPath, 0.18, index, bomberFlightsForPhase.length);
    });
    const buildCorridorContestedAirShowPlan = () => {
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
        const roundPathCorners = (points, radiusPx, stepsPerCorner = 5) => {
            if (points.length <= 2 || radiusPx <= 1 || stepsPerCorner <= 0) {
                return dedupePath(points);
            }
            const rounded = [points[0]];
            for (let index = 1; index < points.length - 1; index += 1) {
                const previous = points[index - 1];
                const current = points[index];
                const next = points[index + 1];
                if (!previous || !current || !next) {
                    continue;
                }
                const incomingLengthPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
                const outgoingLengthPx = Math.hypot(next.cx - current.cx, next.cy - current.cy);
                if (incomingLengthPx <= 1 || outgoingLengthPx <= 1) {
                    rounded.push(current);
                    continue;
                }
                const cutPx = Math.min(radiusPx, incomingLengthPx * 0.42, outgoingLengthPx * 0.42);
                const before = {
                    cx: current.cx + (previous.cx - current.cx) * (cutPx / incomingLengthPx),
                    cy: current.cy + (previous.cy - current.cy) * (cutPx / incomingLengthPx)
                };
                const after = {
                    cx: current.cx + (next.cx - current.cx) * (cutPx / outgoingLengthPx),
                    cy: current.cy + (next.cy - current.cy) * (cutPx / outgoingLengthPx)
                };
                rounded.push(before);
                for (let step = 1; step <= stepsPerCorner; step += 1) {
                    const t = step / stepsPerCorner;
                    const inv = 1 - t;
                    rounded.push({
                        cx: before.cx * inv * inv + current.cx * 2 * inv * t + after.cx * t * t,
                        cy: before.cy * inv * inv + current.cy * 2 * inv * t + after.cy * t * t
                    });
                }
            }
            rounded.push(points[points.length - 1]);
            return dedupePath(rounded);
        };
        const simplifyShortInteriorSegments = (points, minSegmentPx) => {
            if (points.length <= 2 || minSegmentPx <= 0) {
                return dedupePath(points);
            }
            const simplified = [points[0]];
            for (let index = 1; index < points.length - 1; index += 1) {
                const point = points[index];
                const previousKept = simplified[simplified.length - 1];
                if (!point || !previousKept) {
                    continue;
                }
                if (Math.hypot(point.cx - previousKept.cx, point.cy - previousKept.cy) >= minSegmentPx) {
                    simplified.push(point);
                }
            }
            const finalPoint = points[points.length - 1];
            if (Math.hypot(finalPoint.cx - simplified[simplified.length - 1].cx, finalPoint.cy - simplified[simplified.length - 1].cy) > 0.5) {
                simplified.push(finalPoint);
            }
            return dedupePath(simplified);
        };
        const softenAirShowPathCorners = (points, iterations) => {
            let softened = dedupePath(points);
            for (let iteration = 0; iteration < iterations; iteration += 1) {
                if (softened.length <= 2) {
                    return softened;
                }
                const nextPoints = [softened[0]];
                for (let index = 0; index < softened.length - 1; index += 1) {
                    const current = softened[index];
                    const next = softened[index + 1];
                    if (!current || !next) {
                        continue;
                    }
                    nextPoints.push({
                        cx: current.cx * 0.72 + next.cx * 0.28,
                        cy: current.cy * 0.72 + next.cy * 0.28
                    }, {
                        cx: current.cx * 0.28 + next.cx * 0.72,
                        cy: current.cy * 0.28 + next.cy * 0.72
                    });
                }
                nextPoints.push(softened[softened.length - 1]);
                softened = dedupePath(nextPoints);
            }
            return softened;
        };
        const buildCubicAirShowPath = (start, firstControl, secondControl, end, steps = 12) => {
            const stepCount = Math.max(2, Math.round(steps));
            return dedupePath(Array.from({ length: stepCount + 1 }, (_, stepIndex) => {
                const t = stepIndex / stepCount;
                const inv = 1 - t;
                return {
                    cx: start.cx * inv * inv * inv
                        + firstControl.cx * 3 * inv * inv * t
                        + secondControl.cx * 3 * inv * t * t
                        + end.cx * t * t * t,
                    cy: start.cy * inv * inv * inv
                        + firstControl.cy * 3 * inv * inv * t
                        + secondControl.cy * 3 * inv * t * t
                        + end.cy * t * t * t
                };
            }));
        };
        const separatePhaseEndAssignments = (assignments, minimumDistancePx) => {
            const resolvedAssignments = assignments.map((assignment) => ({
                ...assignment,
                points: [...assignment.points]
            }));
            for (let iteration = 0; iteration < 4; iteration += 1) {
                let adjusted = false;
                for (let leftIndex = 0; leftIndex < resolvedAssignments.length; leftIndex += 1) {
                    for (let rightIndex = leftIndex + 1; rightIndex < resolvedAssignments.length; rightIndex += 1) {
                        const left = resolvedAssignments[leftIndex];
                        const right = resolvedAssignments[rightIndex];
                        const sameFlight = left.actor.flightId === right.actor.flightId;
                        const sameFlightFighterPair = sameFlight
                            && (left.actor.role === "interceptor"
                                || left.actor.role === "escort")
                            && left.actor.role === right.actor.role;
                        if (!left.actor.active ||
                            !right.actor.active ||
                            (sameFlight && !sameFlightFighterPair) ||
                            left.actor.role !== right.actor.role ||
                            left.points.length < 2 ||
                            right.points.length < 2) {
                            continue;
                        }
                        const leftEndIndex = left.points.length - 1;
                        const rightEndIndex = right.points.length - 1;
                        const leftEnd = left.points[leftEndIndex];
                        const rightEnd = right.points[rightEndIndex];
                        const dx = rightEnd.cx - leftEnd.cx;
                        const dy = rightEnd.cy - leftEnd.cy;
                        const distancePx = Math.hypot(dx, dy);
                        if (distancePx >= minimumDistancePx || distancePx < 0) {
                            continue;
                        }
                        const fallbackSign = left.actor.formationIndex <= right.actor.formationIndex ? -1 : 1;
                        const separation = normalizeVector(dx, dy, corridor.normal.x * fallbackSign, corridor.normal.y * fallbackSign);
                        const correctionPx = (minimumDistancePx - Math.max(0.1, distancePx))
                            * (sameFlightFighterPair ? 0.72 : 0.58);
                        const applyEndOffset = (assignment, sign) => {
                            const lastIndex = assignment.points.length - 1;
                            const previousIndex = assignment.points.length - 2;
                            const last = assignment.points[lastIndex];
                            const previous = assignment.points[previousIndex];
                            if (last) {
                                assignment.points[lastIndex] = {
                                    cx: last.cx + separation.x * correctionPx * sign,
                                    cy: last.cy + separation.y * correctionPx * sign
                                };
                            }
                            if (previous) {
                                assignment.points[previousIndex] = {
                                    cx: previous.cx + separation.x * correctionPx * sign * 0.35,
                                    cy: previous.cy + separation.y * correctionPx * sign * 0.35
                                };
                            }
                        };
                        applyEndOffset(left, -1);
                        applyEndOffset(right, 1);
                        adjusted = true;
                    }
                }
                if (!adjusted) {
                    break;
                }
            }
            return resolvedAssignments;
        };
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
        const resamplePathByDistance = (points, maxSegmentLengthPx) => {
            const lengthPx = measurePathLength(points);
            if (points.length <= 2 || lengthPx <= 1 || maxSegmentLengthPx <= 1) {
                return dedupePath(points);
            }
            const segmentCount = Math.max(2, Math.ceil(lengthPx / maxSegmentLengthPx));
            return dedupePath(Array.from({ length: segmentCount + 1 }, (_, index) => pointAtPathDistance(points, lengthPx * (index / segmentCount))));
        };
        const resolveClosestDistanceOnPath = (points, point) => {
            if (points.length < 2) {
                return 0;
            }
            let traversedPx = 0;
            let closestDistancePx = 0;
            let closestDistanceSquared = Number.POSITIVE_INFINITY;
            for (let index = 1; index < points.length; index += 1) {
                const previous = points[index - 1];
                const current = points[index];
                if (!previous || !current) {
                    continue;
                }
                const dx = current.cx - previous.cx;
                const dy = current.cy - previous.cy;
                const segmentLengthSquared = dx * dx + dy * dy;
                if (segmentLengthSquared <= 0.0001) {
                    continue;
                }
                const segmentLengthPx = Math.sqrt(segmentLengthSquared);
                const t = host.clamp(((point.cx - previous.cx) * dx + (point.cy - previous.cy) * dy) / segmentLengthSquared, 0, 1);
                const projected = {
                    cx: previous.cx + dx * t,
                    cy: previous.cy + dy * t
                };
                const distanceSquared = Math.pow(point.cx - projected.cx, 2) + Math.pow(point.cy - projected.cy, 2);
                if (distanceSquared < closestDistanceSquared) {
                    closestDistanceSquared = distanceSquared;
                    closestDistancePx = traversedPx + segmentLengthPx * t;
                }
                traversedPx += segmentLengthPx;
            }
            return closestDistancePx;
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
        const matchPathLengthWithCarry = (points, targetLengthPx, lateralSign = 1) => {
            if (points.length < 2 || !Number.isFinite(targetLengthPx) || targetLengthPx <= 1) {
                return dedupePath(points);
            }
            const currentLengthPx = measurePathLength(points);
            if (currentLengthPx > targetLengthPx + 1) {
                return slicePathByDistanceRange(points, 0, targetLengthPx);
            }
            const extraDistancePx = targetLengthPx - currentLengthPx;
            if (extraDistancePx <= 1) {
                return dedupePath(points);
            }
            const end = points[points.length - 1];
            const previous = points[points.length - 2];
            const travel = normalizeVector(end.cx - previous.cx, end.cy - previous.cy, corridor.axis.x, corridor.axis.y);
            const normal = { x: -travel.y, y: travel.x };
            const sideSign = lateralSign < 0 ? -1 : 1;
            const lateralPx = host.clamp(extraDistancePx * 0.035, 0, 26);
            const progressStops = extraDistancePx <= 96
                ? [1]
                : extraDistancePx <= 220
                    ? [0.5, 1]
                    : [0.34, 0.68, 1];
            return dedupePath([
                ...points,
                ...progressStops.map((progress) => {
                    const lateralEase = Math.sin(progress * Math.PI);
                    return {
                        cx: end.cx + travel.x * extraDistancePx * progress + normal.x * sideSign * lateralPx * lateralEase,
                        cy: end.cy + travel.y * extraDistancePx * progress + normal.y * sideSign * lateralPx * lateralEase
                    };
                })
            ]);
        };
        const matchAssignmentPathLength = (assignment, durationMs, lateralSign = 1) => {
            const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role);
            if (!roleSpeedPxPerMs || durationMs <= 0) {
                return assignment;
            }
            return {
                ...assignment,
                points: matchPathLengthWithCarry(assignment.points, durationMs * roleSpeedPxPerMs, lateralSign)
            };
        };
        const buildEndpointPreservingLengthMatchedPath = (start, end, targetLengthPx, lateralSign = 1) => {
            const directDistancePx = Math.hypot(end.cx - start.cx, end.cy - start.cy);
            if (directDistancePx <= 1 || targetLengthPx <= directDistancePx + 1) {
                return dedupePath([start, end]);
            }
            const forward = normalizeVector(end.cx - start.cx, end.cy - start.cy, corridor.axis.x, corridor.axis.y);
            const normal = { x: -forward.y, y: forward.x };
            const sideSign = lateralSign < 0 ? -1 : 1;
            const buildArc = (lateralPx) => dedupePath([
                start,
                {
                    cx: start.cx + (end.cx - start.cx) * 0.25 + normal.x * sideSign * lateralPx * 0.74,
                    cy: start.cy + (end.cy - start.cy) * 0.25 + normal.y * sideSign * lateralPx * 0.74
                },
                {
                    cx: start.cx + (end.cx - start.cx) * 0.5 + normal.x * sideSign * lateralPx,
                    cy: start.cy + (end.cy - start.cy) * 0.5 + normal.y * sideSign * lateralPx
                },
                {
                    cx: start.cx + (end.cx - start.cx) * 0.76 + normal.x * sideSign * lateralPx * 0.58,
                    cy: start.cy + (end.cy - start.cy) * 0.76 + normal.y * sideSign * lateralPx * 0.58
                },
                end
            ]);
            let lowPx = 0;
            let highPx = Math.min(Math.max(targetLengthPx * 0.72, 120), 520);
            for (let iteration = 0; iteration < 18; iteration += 1) {
                const midPx = (lowPx + highPx) * 0.5;
                const midLengthPx = measurePathLength(buildArc(midPx));
                if (midLengthPx < targetLengthPx) {
                    lowPx = midPx;
                }
                else {
                    highPx = midPx;
                }
            }
            const resolvedPath = buildArc((lowPx + highPx) * 0.5);
            return measurePathLength(resolvedPath) > targetLengthPx + 1
                ? slicePathByDistanceRange(resolvedPath, 0, targetLengthPx)
                : resolvedPath;
        };
        const buildEndpointPreservingCircularArcPath = (start, end, targetLengthPx, lateralSign = 1) => {
            const dx = end.cx - start.cx;
            const dy = end.cy - start.cy;
            const chordPx = Math.hypot(dx, dy);
            if (chordPx <= 1 || targetLengthPx <= chordPx + 1) {
                return dedupePath([start, end]);
            }
            const ratio = targetLengthPx / chordPx;
            let lowTheta = 0.001;
            let highTheta = Math.PI * 1.94;
            for (let iteration = 0; iteration < 28; iteration += 1) {
                const midTheta = (lowTheta + highTheta) * 0.5;
                const midRatio = midTheta / Math.max(0.0001, 2 * Math.sin(midTheta * 0.5));
                if (midRatio < ratio) {
                    lowTheta = midTheta;
                }
                else {
                    highTheta = midTheta;
                }
            }
            const theta = (lowTheta + highTheta) * 0.5;
            const radiusPx = Math.max(chordPx * 0.5 + 0.001, targetLengthPx / theta);
            const forward = { x: dx / chordPx, y: dy / chordPx };
            const normal = { x: -forward.y, y: forward.x };
            const sideSign = lateralSign < 0 ? -1 : 1;
            const centerDistancePx = Math.sqrt(Math.max(0, radiusPx * radiusPx - (chordPx * 0.5) ** 2));
            const midpoint = { cx: (start.cx + end.cx) * 0.5, cy: (start.cy + end.cy) * 0.5 };
            const center = {
                cx: midpoint.cx + normal.x * sideSign * centerDistancePx,
                cy: midpoint.cy + normal.y * sideSign * centerDistancePx
            };
            const startAngle = Math.atan2(start.cy - center.cy, start.cx - center.cx);
            const endAngle = Math.atan2(end.cy - center.cy, end.cx - center.cx);
            const rawDelta = endAngle - startAngle;
            const deltas = [rawDelta, rawDelta + Math.PI * 2, rawDelta - Math.PI * 2];
            const desiredSign = sideSign > 0 ? -1 : 1;
            const matchingSignDeltas = deltas.filter((delta) => Math.sign(delta) === desiredSign);
            const candidates = matchingSignDeltas.length > 0 ? matchingSignDeltas : deltas;
            const delta = candidates.reduce((best, candidate) => Math.abs(Math.abs(candidate) - theta) < Math.abs(Math.abs(best) - theta) ? candidate : best);
            const segmentCount = Math.max(12, Math.min(44, Math.ceil(Math.abs(delta) / (Math.PI / 16))));
            return dedupePath(Array.from({ length: segmentCount + 1 }, (_, index) => {
                const progress = index / segmentCount;
                const angle = startAngle + delta * progress;
                return {
                    cx: center.cx + Math.cos(angle) * radiusPx,
                    cy: center.cy + Math.sin(angle) * radiusPx
                };
            }));
        };
        const buildGovernedPassRail = (start, passPoint, durationMs, speedPxPerMs, passProgress, lateralSign = 1) => {
            const targetLengthPx = Math.max(64, durationMs * speedPxPerMs);
            const clampedPassProgress = host.clamp(passProgress, 0.24, 0.76);
            const forward = normalizeVector(passPoint.cx - start.cx, passPoint.cy - start.cy, corridor.axis.x, corridor.axis.y);
            const normal = { x: -forward.y, y: forward.x };
            const sideSign = lateralSign < 0 ? -1 : 1;
            const approachBudgetPx = Math.max(48, targetLengthPx * clampedPassProgress);
            const directToPassPx = Math.hypot(passPoint.cx - start.cx, passPoint.cy - start.cy);
            const leadDistancePx = Math.min(92, approachBudgetPx * 0.32, Math.max(28, directToPassPx * 0.42));
            const lateralDriftPx = Math.min(30, approachBudgetPx * 0.05);
            const approachLead = host.offsetAirShowPoint(start, forward.x * leadDistancePx + normal.x * sideSign * lateralDriftPx * 0.35, forward.y * leadDistancePx + normal.y * sideSign * lateralDriftPx * 0.35);
            const prePass = host.offsetAirShowPoint(passPoint, -forward.x * Math.min(72, approachBudgetPx * 0.2) + normal.x * sideSign * lateralDriftPx * 0.26, -forward.y * Math.min(72, approachBudgetPx * 0.2) + normal.y * sideSign * lateralDriftPx * 0.26);
            const prePassAlongPx = (prePass.cx - start.cx) * forward.x + (prePass.cy - start.cy) * forward.y;
            const keepPrePass = directToPassPx >= 96
                && prePassAlongPx > leadDistancePx + 18
                && prePassAlongPx < directToPassPx - 16;
            const basePath = directToPassPx < 64
                ? dedupePath([start, passPoint])
                : keepPrePass
                    ? dedupePath([start, approachLead, prePass, passPoint])
                    : dedupePath([start, approachLead, passPoint]);
            const baseLengthPx = measurePathLength(basePath);
            const smoothMatchedPath = (points) => matchPathLengthWithCarry(roundPathCorners(points, Math.min(34, Math.max(10, targetLengthPx * 0.08)), 5), targetLengthPx, sideSign);
            if (baseLengthPx >= targetLengthPx - 1) {
                return smoothMatchedPath(slicePathByDistanceRange(basePath, 0, targetLengthPx));
            }
            const exitDistancePx = targetLengthPx - baseLengthPx;
            const exitPoint = host.offsetAirShowPoint(passPoint, forward.x * exitDistancePx + normal.x * sideSign * Math.min(42, exitDistancePx * 0.12), forward.y * exitDistancePx + normal.y * sideSign * Math.min(42, exitDistancePx * 0.12));
            return smoothMatchedPath([...basePath, exitPoint]);
        };
        const buildGovernedMergeTurnRail = (start, passPoint, durationMs, speedPxPerMs, lateralSign = 1) => {
            const targetLengthPx = Math.max(64, durationMs * speedPxPerMs);
            const forward = normalizeVector(passPoint.cx - start.cx, passPoint.cy - start.cy, corridor.axis.x, corridor.axis.y);
            const directToPassPx = Math.hypot(passPoint.cx - start.cx, passPoint.cy - start.cy);
            const approachLeadDistancePx = Math.min(88, Math.max(34, directToPassPx * 0.36));
            const approachLead = host.offsetAirShowPoint(start, forward.x * approachLeadDistancePx, forward.y * approachLeadDistancePx);
            const approachPath = directToPassPx < 52
                ? dedupePath([start, passPoint])
                : dedupePath([start, approachLead, passPoint]);
            const approachLengthPx = measurePathLength(approachPath);
            if (approachLengthPx >= targetLengthPx - 1) {
                return slicePathByDistanceRange(approachPath, 0, targetLengthPx);
            }
            const remainingLengthPx = targetLengthPx - approachLengthPx;
            const turnSign = lateralSign < 0 ? -1 : 1;
            const normal = { x: -forward.y, y: forward.x };
            const radiusPx = host.clamp(remainingLengthPx * 0.28, 72, 126);
            const centerPoint = host.offsetAirShowPoint(passPoint, normal.x * turnSign * radiusPx, normal.y * turnSign * radiusPx);
            const startAngleRad = Math.atan2(passPoint.cy - centerPoint.cy, passPoint.cx - centerPoint.cx);
            const buildArc = (angleRad) => {
                const stepCount = Math.max(8, Math.ceil(Math.abs(angleRad) / (Math.PI / 18)));
                return dedupePath([
                    ...approachPath,
                    ...Array.from({ length: stepCount }, (_, index) => {
                        const progress = (index + 1) / stepCount;
                        const resolvedAngleRad = startAngleRad + turnSign * angleRad * progress;
                        return {
                            cx: centerPoint.cx + Math.cos(resolvedAngleRad) * radiusPx,
                            cy: centerPoint.cy + Math.sin(resolvedAngleRad) * radiusPx
                        };
                    })
                ]);
            };
            let lowAngleRad = 0;
            let highAngleRad = Math.max(remainingLengthPx / radiusPx, Math.PI * 0.75);
            for (let iteration = 0; iteration < 18; iteration += 1) {
                if (measurePathLength(buildArc(highAngleRad)) >= targetLengthPx) {
                    break;
                }
                highAngleRad *= 1.24;
            }
            for (let iteration = 0; iteration < 18; iteration += 1) {
                const midAngleRad = (lowAngleRad + highAngleRad) * 0.5;
                if (measurePathLength(buildArc(midAngleRad)) < targetLengthPx) {
                    lowAngleRad = midAngleRad;
                }
                else {
                    highAngleRad = midAngleRad;
                }
            }
            const resolvedPath = buildArc((lowAngleRad + highAngleRad) * 0.5);
            return measurePathLength(resolvedPath) > targetLengthPx + 1
                ? slicePathByDistanceRange(resolvedPath, 0, targetLengthPx)
                : resolvedPath;
        };
        const buildAssignmentsForFlightPath = (flight, path, headingBlend) => {
            const resolvedPath = dedupePath(path);
            if (resolvedPath.length < 2) {
                const start = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
                resolvedPath.push(host.offsetAirShowPoint(start, corridor.axis.x, corridor.axis.y));
            }
            const assignments = host.buildAirShowFlightAssignments(flight, resolvedPath, headingBlend, 0, 1, { phaseStartAnchor: resolvedPath[0] });
            const spreadFighterFormationAssignments = (fighterAssignments) => {
                const actorCountByFlightId = new Map();
                fighterAssignments.forEach((assignment) => {
                    if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                        return;
                    }
                    actorCountByFlightId.set(assignment.actor.flightId, Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1));
                });
                return fighterAssignments.map((assignment) => {
                    if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                        return assignment;
                    }
                    const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
                    if (actorCount <= 1) {
                        return assignment;
                    }
                    const slot = assignment.actor.formationIndex - (actorCount - 1) / 2;
                    const roleBiasPx = assignment.actor.role === "interceptor" ? -8 : 8;
                    const alongOffsetPx = slot * 9;
                    const lateralOffsetPx = slot * 20 + roleBiasPx;
                    return {
                        ...assignment,
                        points: assignment.points.map((point) => ({
                            cx: point.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
                            cy: point.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
                        }))
                    };
                });
            };
            return flight.spec.role === "bomber"
                ? spreadBomberFormationAssignments(assignments)
                : spreadFighterFormationAssignments(assignments);
        };
        const spreadBomberFormationAssignments = (assignments) => {
            const actorCountByFlightId = new Map();
            assignments.forEach((assignment) => {
                if (assignment.actor.role !== "bomber") {
                    return;
                }
                actorCountByFlightId.set(assignment.actor.flightId, Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1));
            });
            return assignments.map((assignment) => {
                if (assignment.actor.role !== "bomber") {
                    return assignment;
                }
                const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
                if (actorCount <= 1) {
                    return assignment;
                }
                const pairIndex = Math.floor(assignment.actor.formationIndex / 2);
                const pairCount = Math.ceil(actorCount / 2);
                const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
                const pairSlot = pairIndex - (pairCount - 1) / 2;
                const alongOffsetPx = pairSlot * 72 + sideSign * 9;
                const lateralOffsetPx = sideSign * (44 + pairIndex * 7);
                return {
                    ...assignment,
                    points: assignment.points.map((point) => ({
                        cx: point.cx + corridor.axis.x * alongOffsetPx + corridor.normal.x * lateralOffsetPx,
                        cy: point.cy + corridor.axis.y * alongOffsetPx + corridor.normal.y * lateralOffsetPx
                    }))
                };
            });
        };
        const bomberPlans = bomberFlights.map((bomberFlight, index) => {
            const profile = initialBomberApproachProfilesById.get(bomberFlight.spec.id);
            const start = host.averageAirShowPosition(bomberFlight.actors) ?? bomberFlight.anchor;
            const laneIndex = profile?.laneIndex ?? (bomberFlights.length <= 1 ? 0 : index - (bomberFlights.length - 1) / 2);
            const targetCenter = profile?.targetCenter
                ?? bomberTargetCentersById.get(bomberFlight.spec.id)
                ?? averageBomberTargetCenter
                ?? corridor.strike;
            const startProjection = host.resolveAirShowCorridorCoordinates(corridor, start);
            const targetProjection = host.resolveAirShowCorridorCoordinates(corridor, targetCenter);
            const targetDeltaAlongPx = targetProjection.alongPx - startProjection.alongPx;
            const fallbackAttackSign = bomberFlight.spec.faction === "Bot" ? 1 : -1;
            const attackAlongSign = Math.abs(targetDeltaAlongPx) > 1
                ? (targetDeltaAlongPx >= 0 ? 1 : -1)
                : fallbackAttackSign;
            const attackForward = {
                x: corridor.axis.x * attackAlongSign,
                y: corridor.axis.y * attackAlongSign
            };
            const attackNormal = { x: -attackForward.y, y: attackForward.x };
            const laneOffsetPx = laneIndex * 22 + (bomberFlight.spec.laneOffsetPx ?? 0) * 0.35;
            const turnEntry = host.offsetAirShowPoint(targetCenter, -attackForward.x * 92 + attackNormal.x * laneOffsetPx, -attackForward.y * 92 + attackNormal.y * laneOffsetPx);
            const nearTarget = host.offsetAirShowPoint(targetCenter, -attackForward.x * 48 + attackNormal.x * laneOffsetPx, -attackForward.y * 48 + attackNormal.y * laneOffsetPx);
            const releasePoint = host.offsetAirShowPoint(targetCenter, attackNormal.x * laneOffsetPx, attackNormal.y * laneOffsetPx);
            const targetRunExit = host.offsetAirShowPoint(targetCenter, attackForward.x * 112 + attackNormal.x * laneOffsetPx, attackForward.y * 112 + attackNormal.y * laneOffsetPx);
            const targetRunPath = roundPathCorners(dedupePath([turnEntry, nearTarget, releasePoint, targetRunExit]), 18, 6);
            return {
                flight: bomberFlight,
                preTargetPath: smoothCorridorPath(start, turnEntry, laneIndex * 8),
                targetRunPath,
                targetCenter,
                attackForward
            };
        });
        const preTargetPhaseWeights = new Map([
            ["fighter-ingress", 0.195],
            ["escort-clash-merge", 0.195],
            ["escort-clash-scramble", 0.19],
            ["bomber-ingress", 0.22],
            ["bomber-defense-pass", 0.2]
        ]);
        const orderedPreTargetPhaseLabels = [
            "fighter-ingress",
            "escort-clash-merge",
            "escort-clash-scramble",
            "bomber-ingress",
            "bomber-defense-pass"
        ];
        const totalPreTargetPhaseWeight = orderedPreTargetPhaseLabels.reduce((sum, label) => sum + Math.max(0, preTargetPhaseWeights.get(label) ?? 0), 0);
        const preTargetPhaseWindows = new Map();
        let elapsedPreTargetWeight = 0;
        orderedPreTargetPhaseLabels.forEach((label) => {
            const phaseWeight = Math.max(0, preTargetPhaseWeights.get(label) ?? 0);
            const startProgress = totalPreTargetPhaseWeight > 0 ? elapsedPreTargetWeight / totalPreTargetPhaseWeight : 0;
            elapsedPreTargetWeight += phaseWeight;
            const endProgress = totalPreTargetPhaseWeight > 0 ? elapsedPreTargetWeight / totalPreTargetPhaseWeight : startProgress;
            preTargetPhaseWindows.set(label, [host.clamp(startProgress, 0, 1), host.clamp(endProgress, startProgress, 1)]);
        });
        const resolveBomberPhasePath = (plan, label) => {
            const [startProgress, endProgress] = preTargetPhaseWindows.get(label) ?? [0, 1];
            const lengthPx = measurePathLength(plan.preTargetPath);
            const staticStartDistancePx = lengthPx * startProgress;
            const staticEndDistancePx = lengthPx * endProgress;
            const current = host.averageAirShowPosition(plan.flight.actors) ?? plan.flight.anchor;
            const currentDistancePx = resolveClosestDistanceOnPath(plan.preTargetPath, current);
            const phaseOverflowAllowancePx = label === "fighter-ingress"
                ? Math.max(18, lengthPx * 0.02)
                : label === "escort-clash-merge"
                    ? Math.max(18, lengthPx * 0.024)
                    : label === "escort-clash-scramble"
                        ? Math.max(20, lengthPx * 0.028)
                        : label === "bomber-ingress"
                            ? Math.max(24, lengthPx * 0.034)
                            : Math.max(0, lengthPx * 0.08);
            const phaseDistanceCeilingPx = label === "bomber-defense-pass"
                ? lengthPx
                : host.clamp(staticEndDistancePx + phaseOverflowAllowancePx, staticStartDistancePx, lengthPx);
            const startDistancePx = host.clamp(currentDistancePx, staticStartDistancePx, phaseDistanceCeilingPx);
            const staticSegmentLengthPx = Math.max(1, staticEndDistancePx - staticStartDistancePx);
            const minimumAdvancePx = label === "fighter-ingress"
                ? Math.max(24, lengthPx * 0.03)
                : label === "escort-clash-merge"
                    ? Math.max(20, lengthPx * 0.022)
                    : label === "escort-clash-scramble"
                        ? Math.max(20, lengthPx * 0.022)
                        : label === "bomber-ingress"
                            ? Math.max(22, lengthPx * 0.024)
                            : Math.max(22, lengthPx * 0.024);
            const desiredEndDistancePx = Math.max(staticEndDistancePx, startDistancePx + Math.min(staticSegmentLengthPx, minimumAdvancePx));
            const endDistancePx = host.clamp(desiredEndDistancePx, startDistancePx, phaseDistanceCeilingPx);
            const path = slicePathByDistanceRange(plan.preTargetPath, startDistancePx, endDistancePx);
            if (path.length <= 0) {
                return [current];
            }
            const canonicalStart = path[0];
            const offsetX = current.cx - canonicalStart.cx;
            const offsetY = current.cy - canonicalStart.cy;
            return dedupePath(path.map((point) => ({
                cx: point.cx + offsetX,
                cy: point.cy + offsetY
            })));
        };
        const seedPhaseDurationMs = (label) => {
            const longestPathPx = bomberPlans.reduce((longest, plan) => Math.max(longest, measurePathLength(resolveBomberPhasePath(plan, label))), 0);
            return Math.max(1, Math.round(longestPathPx / host.airShowBomberSpeedPxPerMs));
        };
        const seedDurationByPhase = new Map([
            ["fighter-ingress", seedPhaseDurationMs("fighter-ingress")],
            ["escort-clash-merge", seedPhaseDurationMs("escort-clash-merge")],
            ["escort-clash-scramble", seedPhaseDurationMs("escort-clash-scramble")],
            ["bomber-ingress", seedPhaseDurationMs("bomber-ingress")],
            ["bomber-defense-pass", seedPhaseDurationMs("bomber-defense-pass")]
        ]);
        const governedBomberSpeedPxPerMs = Math.min(host.airShowBomberSpeedPxPerMs, host.airShowFighterSpeedPxPerMs * 0.5);
        const seedTargetRunDurationMs = Math.max(1, Math.round(bomberPlans.reduce((longest, plan) => Math.max(longest, measurePathLength(plan.targetRunPath)), 0)
            / governedBomberSpeedPxPerMs));
        const roleSpeeds = host.resolveAirShowRoleSpeedMap({
            interceptor: host.airShowFighterSpeedPxPerMs,
            escort: host.airShowFighterSpeedPxPerMs,
            bomber: governedBomberSpeedPxPerMs
        });
        const buildBomberPhaseAssignments = (label) => bomberPlans.flatMap((plan) => buildAssignmentsForFlightPath(plan.flight, resolveBomberPhasePath(plan, label), 0.22));
        const averageBomberPointAtPreTargetProgress = (progress) => host.averageAirShowPoints(bomberPlans.map((plan) => pointAtPathDistance(plan.preTargetPath, measurePathLength(plan.preTargetPath) * host.clamp(progress, 0, 1))))
            ?? corridor.strike;
        const bomberPhaseFocusPoint = (plan, label, progress) => {
            const phasePath = resolveBomberPhasePath(plan, label);
            return pointAtPathDistance(phasePath, measurePathLength(phasePath) * host.clamp(progress, 0, 1));
        };
        const averageBomberPointAtPhaseProgress = (label, progress) => host.averageAirShowPoints(bomberPlans.map((plan) => bomberPhaseFocusPoint(plan, label, progress)))
            ?? averageBomberPointAtPreTargetProgress(progress);
        const fighterClashCenter = (groupLane, leadPx = 0) => host.offsetAirShowPoint(corridor.merge, corridor.axis.x * leadPx + corridor.normal.x * groupLane * 58, corridor.axis.y * leadPx + corridor.normal.y * groupLane * 58);
        const blendAirShowPoints = (start, end, progress) => {
            const clampedProgress = host.clamp(progress, 0, 1);
            return {
                cx: start.cx + (end.cx - start.cx) * clampedProgress,
                cy: start.cy + (end.cy - start.cy) * clampedProgress
            };
        };
        const clampAirShowPointToFightPocket = (point, centerCoordinates, maxRearAlongPx, maxForwardAlongPx, maxLateralPx) => {
            const pointCoordinates = resolveAirShowRailCoordinates(corridor, point);
            const clampedAlongPx = host.clamp(pointCoordinates.alongPx, centerCoordinates.alongPx - Math.max(0, maxRearAlongPx), centerCoordinates.alongPx + Math.max(0, maxForwardAlongPx));
            const clampedLateralPx = host.clamp(pointCoordinates.lateralPx, centerCoordinates.lateralPx - Math.max(0, maxLateralPx), centerCoordinates.lateralPx + Math.max(0, maxLateralPx));
            if (Math.abs(clampedAlongPx - pointCoordinates.alongPx) <= 0.001
                && Math.abs(clampedLateralPx - pointCoordinates.lateralPx) <= 0.001) {
                return point;
            }
            return projectAirShowRailPoint(corridor, clampedAlongPx, clampedLateralPx);
        };
        const clampFightPathToPocket = (points, center, { maxRearAlongPx, maxForwardAlongPx, maxLateralPx, preserveStart = false, preserveLeadingPoints }) => {
            if (points.length <= 0) {
                return [];
            }
            const centerCoordinates = resolveAirShowRailCoordinates(corridor, center);
            const preservedPointCount = Math.max(0, Math.round(preserveLeadingPoints ?? (preserveStart ? 1 : 0)));
            return dedupePath(points.map((point, index) => index < preservedPointCount
                ? point
                : clampAirShowPointToFightPocket(point, centerCoordinates, maxRearAlongPx, maxForwardAlongPx, maxLateralPx)));
        };
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
        const fighterRailTarget = (anchor, laneOffsetPx, alongOffsetPx = 0) => {
            const anchorCoordinates = resolveAirShowRailCoordinates(corridor, anchor);
            return projectAirShowRailPoint(corridor, anchorCoordinates.alongPx + alongOffsetPx, laneOffsetPx);
        };
        const buildFighterRailPath = (current, target, laneOffsetPx, label) => {
            if (label === "fighter-ingress"
                || label === "escort-clash-merge"
                || label === "escort-clash-scramble") {
                return buildAirShowPresetRailPath(corridor, current, target, {
                    lateralPx: laneOffsetPx,
                    midLateralPx: laneOffsetPx,
                    entryProgress: 0.34,
                    exitProgress: 0.72
                });
            }
            const targetLengthPx = Math.max(1, (seedDurationByPhase.get(label) ?? 1) * host.airShowFighterSpeedPxPerMs);
            const directDx = target.cx - current.cx;
            const directDy = target.cy - current.cy;
            const directLengthPx = Math.hypot(directDx, directDy);
            if (directLengthPx < targetLengthPx - 8 && directLengthPx > 1) {
                const forward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
                const normal = { x: -forward.y, y: forward.x };
                const lateralSign = laneOffsetPx >= 0 ? 1 : -1;
                const thirdPx = directLengthPx / 3;
                const solvedLateralPx = Math.sqrt(Math.max(0, Math.pow((targetLengthPx - thirdPx) / 2, 2) - thirdPx * thirdPx));
                // Prevent short-path speed matching from creating giant lateral loops that
                // scatter fighters across the map during bomber-ingress/defense.
                const lateralPx = host.clamp(solvedLateralPx, 0, 240);
                return dedupePath([
                    current,
                    {
                        cx: current.cx + forward.x * thirdPx + normal.x * lateralSign * lateralPx,
                        cy: current.cy + forward.y * thirdPx + normal.y * lateralSign * lateralPx
                    },
                    {
                        cx: current.cx + forward.x * thirdPx * 2 + normal.x * lateralSign * lateralPx,
                        cy: current.cy + forward.y * thirdPx * 2 + normal.y * lateralSign * lateralPx
                    },
                    target
                ]);
            }
            return buildAirShowPresetRailPath(corridor, current, target, {
                lateralPx: laneOffsetPx,
                midLateralPx: laneOffsetPx,
                entryProgress: 0.34,
                exitProgress: 0.72
            });
        };
        const rebuildFighterIngressPathToMergeEndpoint = (assignment, durationMs) => {
            if (assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort") {
                return assignment;
            }
            const start = assignment.points[0];
            if (!start || assignment.points.length < 2) {
                return assignment;
            }
            const mergeCoordinates = resolveAirShowRailCoordinates(corridor, corridor.merge);
            const startCoordinates = resolveAirShowRailCoordinates(corridor, start);
            const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
            const pairIndex = Math.floor(assignment.actor.formationIndex / 2);
            const originSideLeadSign = startCoordinates.alongPx >= mergeCoordinates.alongPx ? 1 : -1;
            const roleLeadPx = originSideLeadSign * 98;
            const roleLateralBiasPx = assignment.actor.role === "interceptor" ? -54 : 54;
            const slotLeadPx = sideSign * 6;
            const slotLateralPx = sideSign * (24 + pairIndex * 6);
            const target = projectAirShowRailPoint(corridor, mergeCoordinates.alongPx + roleLeadPx + slotLeadPx, mergeCoordinates.lateralPx + roleLateralBiasPx + slotLateralPx);
            const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
            const targetProjection = resolveAirShowRailCoordinates(corridor, target);
            let escortVisibleEntryProgress = null;
            const directDx = target.cx - start.cx;
            const directDy = target.cy - start.cy;
            const directDistancePx = Math.max(1, Math.hypot(directDx, directDy));
            const forward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
            const bendNormal = { x: -forward.y, y: forward.x };
            const lateralKickSign = targetProjection.lateralPx < 0 ? -1 : 1;
            const bendLateralPx = assignment.actor.role === "interceptor"
                ? host.clamp(directDistancePx * 0.07, 32, 92)
                : host.clamp(directDistancePx * 0.035, 18, 54);
            let points = buildCubicAirShowPath(start, {
                cx: start.cx + directDx * 0.34 + bendNormal.x * lateralKickSign * bendLateralPx,
                cy: start.cy + directDy * 0.34 + bendNormal.y * lateralKickSign * bendLateralPx
            }, {
                cx: start.cx + directDx * 0.68 + bendNormal.x * lateralKickSign * bendLateralPx * 0.42,
                cy: start.cy + directDy * 0.68 + bendNormal.y * lateralKickSign * bendLateralPx * 0.42
            }, target, 18);
            let pathLengthPx = measurePathLength(points);
            const maxGovernedTravelPx = durationMs * roleSpeedPxPerMs;
            if (pathLengthPx > maxGovernedTravelPx + 1) {
                points = slicePathByDistanceRange(points, 0, maxGovernedTravelPx);
                pathLengthPx = measurePathLength(points);
                escortVisibleEntryProgress = null;
            }
            const activeDurationMs = Math.min(durationMs, Math.max(1, Math.round(pathLengthPx / Math.max(0.0001, roleSpeedPxPerMs))));
            const startTimeMs = Math.max(0, durationMs - activeDurationMs);
            const progressTimeline = escortVisibleEntryProgress !== null
                ? [
                    { timeMs: 0, progress: 0 },
                    { timeMs: Math.round(durationMs * 0.28), progress: escortVisibleEntryProgress },
                    { timeMs: durationMs, progress: 1 }
                ]
                : startTimeMs > 1
                    ? [
                        { timeMs: 0, progress: 0 },
                        { timeMs: Math.round(startTimeMs), progress: 0 },
                        { timeMs: durationMs, progress: 1 }
                    ]
                    : undefined;
            return {
                ...assignment,
                points,
                progressTimeline
            };
        };
        /**
         * Fighters ride deterministic corridor rails. Pairing/ganging chooses who shares
         * lanes and targets; it does not invent per-aircraft simulator turns.
         */
        const ensureMinimumBomberIngressFighterTarget = (current, target, flight, laneOffsetPx) => {
            const minTravelPx = 148 + Math.min(28, Math.abs(laneOffsetPx) * 0.16);
            const directDx = target.cx - current.cx;
            const directDy = target.cy - current.cy;
            const directDistancePx = Math.hypot(directDx, directDy);
            if (directDistancePx >= minTravelPx) {
                return target;
            }
            const headingForward = resolveHeadingVector(host.resolveAirShowFlightHeadingDegrees(flight), corridor.axis);
            const forward = directDistancePx > 10
                ? normalizeVector(directDx, directDy, headingForward.x, headingForward.y)
                : headingForward;
            const normal = { x: -forward.y, y: forward.x };
            return {
                cx: current.cx + forward.x * minTravelPx + normal.x * host.clamp(laneOffsetPx * 0.05, -10, 10),
                cy: current.cy + forward.y * minTravelPx + normal.y * host.clamp(laneOffsetPx * 0.05, -10, 10)
            };
        };
        const buildFighterPhaseAssignments = (label) => {
            const assignments = [];
            fighterGroups.forEach((group) => {
                [
                    ...group.interceptorFlights.map((flight) => ({ flight, role: "interceptor" })),
                    ...group.escortFlights.map((flight) => ({ flight, role: "escort" }))
                ].forEach(({ flight, role }) => {
                    const factionOrigin = hqAxis
                        ? (flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin)
                        : fallbackOriginFor(flight.spec);
                    const current = label === "fighter-ingress"
                        ? factionOrigin
                        : (host.averageAirShowPosition(flight.actors) ?? flight.anchor);
                    const lane = resolveGroupLane(group, flight, role);
                    const roleFlights = role === "interceptor" ? group.interceptorFlights : group.escortFlights;
                    const localSlot = Math.max(0, roleFlights.findIndex((candidate) => candidate.spec.id === flight.spec.id));
                    const localLane = roleFlights.length <= 1 ? 0 : localSlot - (roleFlights.length - 1) / 2;
                    const travelSign = role === "interceptor" ? -1 : 1;
                    const laneOffsetPx = resolveAirShowRailLaneOffsetPx(lane, role, (flight.spec.laneOffsetPx ?? 0) * 0.24);
                    const buildFighterPeelAwayPath = (baseDistancePx, phaseLabel) => {
                        const homeVector = normalizeVector(factionOrigin.cx - current.cx, factionOrigin.cy - current.cy, flight.spec.faction === "Bot" ? corridor.axis.x : -corridor.axis.x, flight.spec.faction === "Bot" ? corridor.axis.y : -corridor.axis.y);
                        const entryForward = resolveHeadingVector(host.resolveAirShowFlightHeadingDegrees(flight), homeVector);
                        const routeNormal = { x: -homeVector.y, y: homeVector.x };
                        const phaseSpeedPxPerMs = roleSpeeds.get(role) ?? host.airShowFighterSpeedPxPerMs;
                        const phaseTravelPx = Math.max(1, (seedDurationByPhase.get(phaseLabel) ?? 1) * phaseSpeedPxPerMs);
                        const peelDistancePx = host.clamp(phaseTravelPx * 0.58, baseDistancePx * 0.82, baseDistancePx * 1.36);
                        const entryDistancePx = host.clamp(phaseTravelPx * 0.16, 92, 210);
                        const peelLaneOffsetPx = laneOffsetPx * 0.24 + localLane * 18;
                        const firstControl = {
                            cx: current.cx + entryForward.x * entryDistancePx + routeNormal.x * peelLaneOffsetPx * 0.08,
                            cy: current.cy + entryForward.y * entryDistancePx + routeNormal.y * peelLaneOffsetPx * 0.08
                        };
                        const secondControl = {
                            cx: current.cx + homeVector.x * peelDistancePx * 0.72 + routeNormal.x * peelLaneOffsetPx * 0.54,
                            cy: current.cy + homeVector.y * peelDistancePx * 0.72 + routeNormal.y * peelLaneOffsetPx * 0.54
                        };
                        const peelTarget = {
                            cx: current.cx + homeVector.x * peelDistancePx + routeNormal.x * peelLaneOffsetPx,
                            cy: current.cy + homeVector.y * peelDistancePx + routeNormal.y * peelLaneOffsetPx
                        };
                        return buildCubicAirShowPath(current, firstControl, secondControl, peelTarget, 16);
                    };
                    let path;
                    if (label === "fighter-ingress") {
                        const mergeCoordinates = resolveAirShowRailCoordinates(corridor, corridor.merge);
                        const currentCoordinates = resolveAirShowRailCoordinates(corridor, current);
                        const ingressLaneOffsetPx = host.clamp(laneOffsetPx * 0.58, -118, 118);
                        const ingressLeadPx = (currentCoordinates.alongPx >= mergeCoordinates.alongPx ? 1 : -1) * 98;
                        const target = projectAirShowRailPoint(corridor, mergeCoordinates.alongPx + ingressLeadPx, mergeCoordinates.lateralPx + ingressLaneOffsetPx);
                        path = buildFighterRailPath(current, target, ingressLaneOffsetPx, label);
                    }
                    else if (label === "escort-clash-merge") {
                        const mergeLaneOffsetPx = laneOffsetPx * 0.72;
                        const mergeFocus = fighterClashCenter(lane, 0);
                        path = host.buildAirShowMergePassPath(current, host.offsetAirShowPoint(mergeFocus, corridor.normal.x * mergeLaneOffsetPx * 0.14, corridor.normal.y * mergeLaneOffsetPx * 0.14), corridor, {
                            sideSign: role === "interceptor" ? -1 : 1,
                            laneIndex: lane + localLane * 0.2 + (role === "interceptor" ? -0.2 : 0.2),
                            startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                            entrySeparationPx: role === "interceptor" ? 136 : 122,
                            crossSeparationPx: role === "interceptor" ? 24 : 20,
                            overshootPx: role === "interceptor" ? 148 : 132
                        });
                    }
                    else if (label === "escort-clash-scramble") {
                        const scrambleFocus = fighterClashCenter(group.lane, 26);
                        const chaseLaneOffsetPx = laneOffsetPx * 0.16 + localLane * (role === "interceptor" ? -4 : 4);
                        const chaseLeadPx = role === "interceptor" ? -4 : 6;
                        const target = host.offsetAirShowPoint(scrambleFocus, corridor.normal.x * chaseLaneOffsetPx + corridor.axis.x * chaseLeadPx, corridor.normal.y * chaseLaneOffsetPx + corridor.axis.y * chaseLeadPx);
                        path =
                            role === "interceptor"
                                ? host.buildAirShowPursuitPath(current, target, {
                                    startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                                    lateralSign: lane >= 0 ? 1 : -1,
                                    entryLateralPx: 44 + Math.abs(localLane) * 6,
                                    mergeLateralPx: 16 + Math.abs(localLane) * 5,
                                    attackOffsetPx: 4 + Math.abs(localLane) * 2,
                                    closeInPx: 10,
                                    overshootPx: 44,
                                    breakLateralPx: 32,
                                    breakForwardPx: 30,
                                    driftPx: group.lane * 4
                                })
                                : host.buildAirShowBreakTurnPath(current, target, {
                                    startHeadingDegrees: host.resolveAirShowFlightHeadingDegrees(flight),
                                    lateralSign: lane >= 0 ? -1 : 1,
                                    entryLateralPx: 22 + Math.abs(localLane) * 4,
                                    guardForwardPx: 14,
                                    guardLateralPx: 34 + Math.abs(localLane) * 6,
                                    exitForwardPx: 46,
                                    exitLateralPx: 44 + Math.abs(localLane) * 6,
                                    trailForwardPx: 22
                                });
                    }
                    else if (label === "bomber-ingress") {
                        if (role === "interceptor") {
                            const interceptorIndex = activeFlights(interceptorFlights).findIndex((candidate) => candidate.spec.id === flight.spec.id);
                            const targetPlan = bomberPlans[Math.max(0, interceptorIndex) % Math.max(1, bomberPlans.length)];
                            const bomberFormationFocus = averageBomberPointAtPhaseProgress("bomber-ingress", 0.84);
                            const assignedBomberFocus = targetPlan
                                ? bomberPhaseFocusPoint(targetPlan, "bomber-ingress", 0.84)
                                : averageBomberPointAtPhaseProgress("bomber-ingress", 0.84);
                            const defenseFocus = {
                                cx: assignedBomberFocus.cx * 0.34 + bomberFormationFocus.cx * 0.66,
                                cy: assignedBomberFocus.cy * 0.34 + bomberFormationFocus.cy * 0.66
                            };
                            const stagingDistancePx = 12;
                            const rawStagingPoint = host.offsetAirShowPoint(defenseFocus, -corridor.axis.x * stagingDistancePx
                                + corridor.normal.x * (Math.abs(laneOffsetPx) * 0.2 + localLane * 14), -corridor.axis.y * stagingDistancePx
                                + corridor.normal.y * (Math.abs(laneOffsetPx) * 0.2 + localLane * 14));
                            const stagingPoint = ensureMinimumBomberIngressFighterTarget(current, rawStagingPoint, flight, laneOffsetPx);
                            const directDx = stagingPoint.cx - current.cx;
                            const directDy = stagingPoint.cy - current.cy;
                            const directForward = normalizeVector(directDx, directDy, corridor.axis.x, corridor.axis.y);
                            const directNormal = { x: -directForward.y, y: directForward.x };
                            path = dedupePath([
                                current,
                                {
                                    cx: current.cx + directDx * 0.36 + directNormal.x * laneOffsetPx * 0.04,
                                    cy: current.cy + directDy * 0.36 + directNormal.y * laneOffsetPx * 0.04
                                },
                                {
                                    cx: current.cx + directDx * 0.72 + directNormal.x * laneOffsetPx * 0.02,
                                    cy: current.cy + directDy * 0.72 + directNormal.y * laneOffsetPx * 0.02
                                },
                                stagingPoint
                            ]);
                        }
                        else {
                            path = buildFighterPeelAwayPath(540 + Math.abs(lane) * 30 + Math.max(0, localSlot) * 18, label);
                        }
                    }
                    else if (label === "bomber-defense-pass" && role === "escort") {
                        path = buildFighterPeelAwayPath(660 + Math.abs(lane) * 30 + Math.max(0, localSlot) * 18, label);
                    }
                    else if (role === "interceptor") {
                        const interceptorIndex = activeFlights(interceptorFlights).findIndex((candidate) => candidate.spec.id === flight.spec.id);
                        const targetPlan = bomberPlans[Math.max(0, interceptorIndex) % Math.max(1, bomberPlans.length)];
                        const focusPoint = targetPlan
                            ? bomberPhaseFocusPoint(targetPlan, label, 0.56)
                            : averageBomberPointAtPhaseProgress(label, 0.56);
                        path = buildFighterRailPath(current, fighterRailTarget(focusPoint, laneOffsetPx * 0.36, 34), laneOffsetPx * 0.36, label);
                    }
                    else {
                        const currentCoords = resolveAirShowRailCoordinates(corridor, current);
                        const homeAlongSign = hqAxis
                            ? (flight.spec.faction === "Bot" ? -1 : 1)
                            : (currentCoords.alongPx >= 0 ? 1 : -1);
                        const peelTarget = projectAirShowRailPoint(corridor, currentCoords.alongPx + homeAlongSign * (168 + Math.abs(lane) * 22), laneOffsetPx * 0.62 + homeAlongSign * 36);
                        path = buildFighterRailPath(current, peelTarget, laneOffsetPx * 0.46, label);
                    }
                    assignments.push(...buildAssignmentsForFlightPath(flight, path, 0.34));
                });
            });
            return assignments;
        };
        /**
         * Build short dogfight tracer volleys for close, weaving merge engagements.
         */
        const buildDogfightTracers = (assignments, label, durationMs) => {
            const tracers = [];
            const isMerge = label === "escort-clash-merge";
            const interceptorTimings = isMerge ? [0.44, 0.52, 0.6] : [0.24, 0.34];
            const escortTimings = isMerge ? [0.32, 0.46, 0.56] : [0.3, 0.42, 0.54, 0.66, 0.78];
            const targetHeadingConstraint = isMerge
                ? {}
                : { minTargetHeadingDot: 0.1 };
            const buildValidatedDogfightTracer = (sourceFlight, targetFlight, timings, options) => {
                const assignmentsByActorId = host.buildAirShowAssignmentLookup(assignments);
                let best = null;
                const candidateProgresses = Array.from(new Set(timings.flatMap((progress) => [
                    progress,
                    progress - 0.03,
                    progress + 0.03,
                    progress - 0.06,
                    progress + 0.06,
                    progress - 0.09,
                    progress + 0.09
                ])
                    .map((progress) => Number(host.clamp(progress, 0, 1).toFixed(3)))));
                candidateProgresses.forEach((progress) => {
                    sourceFlight.actors.filter((actor) => actor.active).forEach((sourceActor) => {
                        const sourceAssignment = assignmentsByActorId.get(sourceActor.id);
                        if (!sourceAssignment) {
                            return;
                        }
                        const sampledSource = host.sampleAirShowAssignmentAtTime(sourceAssignment, progress * durationMs, durationMs);
                        targetFlight.actors.filter((actor) => actor.active).forEach((targetActor) => {
                            const targetAssignment = assignmentsByActorId.get(targetActor.id);
                            if (!targetAssignment) {
                                return;
                            }
                            const sampledTarget = host.sampleAirShowAssignmentAtTime(targetAssignment, progress * durationMs, durationMs);
                            const geometry = host.resolveAirShowTracerBurstGeometry(sampledSource, options, sampledTarget.position);
                            const targetVector = {
                                x: sampledTarget.position.cx - geometry.emitterPoint.cx,
                                y: sampledTarget.position.cy - geometry.emitterPoint.cy
                            };
                            const distancePx = Math.hypot(targetVector.x, targetVector.y);
                            if (distancePx < 6 || distancePx > 160) {
                                return;
                            }
                            const sourceHeading = resolveHeadingVector(sampledSource.headingDegrees, targetVector);
                            const targetHeading = resolveHeadingVector(sampledTarget.headingDegrees, sourceHeading);
                            const alignmentDeg = resolveVectorAngleDegrees(sourceHeading, targetVector);
                            const targetHeadingDot = sourceHeading.x * targetHeading.x + sourceHeading.y * targetHeading.y;
                            if (alignmentDeg > 30 || targetHeadingDot <= 0.1) {
                                return;
                            }
                            const score = alignmentDeg * 3.2 + distancePx * 0.045;
                            if (!best || score < best.score) {
                                best = { progress, sourceActor, targetActor, score };
                            }
                        });
                    });
                });
                const selected = best;
                return selected
                    ? {
                        progress: selected.progress,
                        source: selected.sourceActor,
                        target: selected.targetActor,
                        ...options
                    }
                    : null;
            };
            fighterGroups.forEach((group, groupIndex) => {
                group.interceptorFlights.forEach((interceptorFlight, index) => {
                    const escortTarget = group.escortFlights[(index + (isMerge ? 0 : 1)) % Math.max(1, group.escortFlights.length)];
                    if (!escortTarget) {
                        return;
                    }
                    tracers.push(...host.buildAirShowDynamicTracerVolley(assignments, interceptorFlight, escortTarget, {
                        emitter: "nose",
                        color: "#fff5cf",
                        width: 0.56,
                        lifetimeMs: 34,
                        spreadPx: 10,
                        streakLengthPx: 108,
                        visibleLengthPx: 7,
                        fanHalfAngleDeg: 1.8,
                        burstCount: isMerge ? 3 : 4,
                        maxAlignmentDeg: isMerge ? 32 : 32,
                        maxRangePx: isMerge ? 330 : 338,
                        ...targetHeadingConstraint,
                        timings: interceptorTimings,
                        durationMs,
                        fallbackToNearest: false
                    }));
                });
                group.escortFlights.forEach((escortFlight, index) => {
                    const interceptorTargets = isMerge
                        ? group.interceptorFlights
                        : [
                            group.interceptorFlights[(index + groupIndex + 1) % Math.max(1, group.interceptorFlights.length)]
                        ].filter((target) => !!target);
                    if (interceptorTargets.length <= 0) {
                        return;
                    }
                    interceptorTargets.forEach((interceptorTarget) => {
                        tracers.push(...host.buildAirShowDynamicTracerVolley(assignments, escortFlight, interceptorTarget, {
                            emitter: "nose",
                            color: "#ffd98a",
                            width: 0.54,
                            lifetimeMs: 34,
                            spreadPx: 10,
                            streakLengthPx: 102,
                            visibleLengthPx: 7,
                            fanHalfAngleDeg: 1.7,
                            burstCount: isMerge ? 3 : 4,
                            maxAlignmentDeg: isMerge ? 32 : 32,
                            maxRangePx: isMerge ? 330 : 344,
                            ...targetHeadingConstraint,
                            timings: escortTimings,
                            durationMs,
                            fallbackToNearest: false
                        }));
                    });
                });
                if (!isMerge) {
                    const escortSource = group.escortFlights[0];
                    const interceptorTarget = group.interceptorFlights[0];
                    const escortTracer = escortSource && interceptorTarget
                        ? buildValidatedDogfightTracer(escortSource, interceptorTarget, [0.42, 0.48, 0.54, 0.57], {
                            emitter: "nose",
                            color: "#ffd98a",
                            width: 0.54,
                            lifetimeMs: 34,
                            spreadPx: 10,
                            streakLengthPx: 102,
                            visibleLengthPx: 7,
                            fanHalfAngleDeg: 1.7,
                            burstCount: 4
                        })
                        : null;
                    const interceptorSource = group.interceptorFlights[0];
                    const escortTarget = group.escortFlights[0];
                    const supplementalTracer = escortTracer
                        ?? (interceptorSource && escortTarget
                            ? buildValidatedDogfightTracer(interceptorSource, escortTarget, [0.45, 0.48, 0.54, 0.57], {
                                emitter: "nose",
                                color: "#fff5cf",
                                width: 0.56,
                                lifetimeMs: 34,
                                spreadPx: 10,
                                streakLengthPx: 108,
                                visibleLengthPx: 7,
                                fanHalfAngleDeg: 1.8,
                                burstCount: 4
                            })
                            : null);
                    if (supplementalTracer
                        && !tracers.some((tracer) => {
                            const targetActor = "id" in tracer.target ? tracer.target : null;
                            const supplementalTarget = supplementalTracer.target;
                            return (tracer.source.flightId === supplementalTracer.source.flightId
                                && targetActor?.flightId === supplementalTarget.flightId
                                && Math.abs(tracer.progress - supplementalTracer.progress) < 0.035);
                        })) {
                        tracers.push(supplementalTracer);
                    }
                }
            });
            return tracers;
        };
        /**
         * Resolve continuous flak bursts during bomber approach.
         * Flak runs continuously when bombers are within 8 hex range of flak battery,
         * sampled at bomber positions during the phase, tapering after ordnance release.
         */
        const resolveContinuousFlakBursts = (assignments, durationMs, phase) => {
            const assignmentsByActorId = host.buildAirShowAssignmentLookup(assignments);
            const rangePx = HEX_WIDTH * 8; // 8 hex range for flak engagement
            const resolvedBursts = bomberPlans.flatMap((plan, planIndex) => {
                const scoped = host.resolveAirShowBomberFlakBursts(scene, plan.flight.spec.id);
                const bomberSlot = planIndex - (bomberPlans.length - 1) / 2;
                const syntheticProgressSlots = phase === "approach"
                    ? [0.3, 0.5]
                    : [0.58, 0.76];
                const syntheticMinProgress = phase === "approach" ? 0.16 : 0.2;
                const syntheticMaxProgress = phase === "approach" ? 0.86 : 0.84;
                const syntheticScopedBursts = syntheticProgressSlots.map((slotProgress, slotIndex) => {
                    const slotSeed = host.seedFromHexKey(`${plan.flight.spec.id}:${phase}:synthetic-slot:${slotIndex}`) >>> 0;
                    const slotNoise = ((((Math.imul(slotSeed ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0) / 0x100000000) - 0.5);
                    return {
                        progress: host.clamp(slotProgress
                            + bomberSlot * (phase === "approach" ? 0.018 : 0.016)
                            + slotNoise * (phase === "approach" ? 0.076 : 0.064), syntheticMinProgress, syntheticMaxProgress),
                        count: 1,
                        puffCount: phase === "approach" ? 2 : 3,
                        smokePuffCount: phase === "approach" ? 3 : 4,
                        scale: 0.72,
                        smokeScale: 1.12,
                        alongOffsetPx: -72 + slotIndex * 34 + bomberSlot * 14,
                        lateralOffsetPx: bomberSlot * 106 + (slotIndex - 0.5) * 58,
                        alongSpreadPx: 66,
                        lateralSpreadPx: 176,
                        bomberUnitKey: plan.flight.spec.id,
                        targetHexKey: bomberSpecsById.get(plan.flight.spec.id)?.targetHexKey
                            ?? scene.bomberTargetHexKey
                            ?? null,
                        batteryHexKey: null
                    };
                });
                const usingSyntheticSource = scoped.length <= 0;
                const expandedScopedBursts = scoped.length === 1
                    ? scoped.flatMap((burst) => {
                        const baseProgress = burst.progress ?? 0.5;
                        const volleyOffsets = phase === "approach" ? [-0.018, 0.022] : [-0.016, 0.02];
                        return volleyOffsets.map((offset, volleyIndex) => ({
                            ...burst,
                            progress: host.clamp(baseProgress + offset, phase === "approach" ? 0.14 : 0.18, phase === "approach" ? 0.88 : 0.85),
                            alongOffsetPx: (burst.alongOffsetPx ?? 0) + (volleyIndex === 0 ? -10 : 10),
                            lateralOffsetPx: (burst.lateralOffsetPx ?? 0) + (volleyIndex === 0 ? -14 : 14),
                            count: 1
                        }));
                    })
                    : scoped;
                const sourceBursts = usingSyntheticSource ? syntheticScopedBursts : expandedScopedBursts;
                const scopedCount = sourceBursts.length;
                return sourceBursts.flatMap((burst, burstIndex) => {
                    const jitter01 = (sampleIndex, salt) => {
                        let seed = (host.seedFromHexKey(`${plan.flight.spec.id}:${phase}:${burstIndex}:${burst.batteryHexKey ?? ""}:${burst.targetHexKey ?? ""}`)
                            + sampleIndex * 374761393
                            + salt * 668265263) >>> 0;
                        seed = (seed ^ (seed >>> 13)) >>> 0;
                        seed = Math.imul(seed, 1274126177) >>> 0;
                        return ((seed ^ (seed >>> 16)) >>> 0) / 0x100000000;
                    };
                    const minProgress = phase === "approach" ? 0.12 : 0.14;
                    const maxProgress = phase === "approach" ? 0.88 : 0.83;
                    const targetCenter = (burst.targetHexKey ? host.resolveHexCenterByKey(burst.targetHexKey) : null) ?? plan.targetCenter;
                    const batteryCenter = burst.batteryHexKey ? host.resolveHexCenterByKey(burst.batteryHexKey) : null;
                    const rangeReferenceCenter = batteryCenter ?? targetCenter;
                    const slotProgress = host.clamp(burst.progress
                        ?? (scopedCount <= 1 ? 0.5 : burstIndex / Math.max(1, scopedCount - 1)), 0, 1);
                    const slotWidth = (maxProgress - minProgress) / Math.max(1, scopedCount);
                    const baseProgress = host.clamp(minProgress
                        + (maxProgress - minProgress)
                            * host.clamp(slotProgress + (jitter01(burstIndex, 53) - 0.5) * (0.34 / Math.max(1, scopedCount)), 0, 1), minProgress, maxProgress);
                    const sampledBomberCenterByProgress = new Map();
                    const sampleBomberCenterAtProgress = (progress) => {
                        const normalizedProgress = Number(host.clamp(progress, 0, 1).toFixed(4));
                        if (sampledBomberCenterByProgress.has(normalizedProgress)) {
                            return sampledBomberCenterByProgress.get(normalizedProgress) ?? null;
                        }
                        const sampledActorPositions = plan.flight.actors.flatMap((actor) => {
                            const assignment = assignmentsByActorId.get(actor.id);
                            return assignment
                                ? [host.sampleAirShowAssignmentAtTime(assignment, durationMs * normalizedProgress, durationMs).position]
                                : [];
                        });
                        const centerAtProgress = host.averageAirShowPoints(sampledActorPositions);
                        sampledBomberCenterByProgress.set(normalizedProgress, centerAtProgress);
                        return centerAtProgress;
                    };
                    const sweepStepCount = phase === "approach" ? 12 : 14;
                    const sweepProgresses = Array.from({ length: sweepStepCount + 1 }, (_, stepIndex) => host.clamp(minProgress + (maxProgress - minProgress) * (stepIndex / sweepStepCount), minProgress, maxProgress));
                    const candidateProgresses = Array.from(new Set([
                        baseProgress,
                        slotProgress,
                        host.clamp(baseProgress - slotWidth * 0.72, minProgress, maxProgress),
                        host.clamp(baseProgress + slotWidth * 0.72, minProgress, maxProgress),
                        host.clamp(baseProgress + (jitter01(burstIndex, 79) - 0.5) * slotWidth, minProgress, maxProgress),
                        ...sweepProgresses
                    ].map((progress) => Number(progress.toFixed(4)))));
                    const candidateSamples = candidateProgresses.flatMap((progress) => {
                        const bomberCenter = sampleBomberCenterAtProgress(progress);
                        if (!bomberCenter) {
                            return [];
                        }
                        return [{
                                progress,
                                bomberCenter,
                                distancePx: Math.hypot(bomberCenter.cx - rangeReferenceCenter.cx, bomberCenter.cy - rangeReferenceCenter.cy)
                            }];
                    });
                    const chooseBestSample = (samples) => samples.reduce((bestSample, sample) => {
                        if (!bestSample) {
                            return sample;
                        }
                        const bestBaseDelta = Math.abs(bestSample.progress - baseProgress);
                        const sampleBaseDelta = Math.abs(sample.progress - baseProgress);
                        if (sampleBaseDelta + 0.0001 < bestBaseDelta) {
                            return sample;
                        }
                        if (Math.abs(sampleBaseDelta - bestBaseDelta) <= 0.0001 && sample.distancePx < bestSample.distancePx) {
                            return sample;
                        }
                        return bestSample;
                    }, null);
                    const inRangeSamples = candidateSamples.filter((sample) => sample.distancePx <= rangePx);
                    const selectedSample = chooseBestSample(inRangeSamples) ?? chooseBestSample(candidateSamples);
                    if (!selectedSample) {
                        return [];
                    }
                    if (!usingSyntheticSource && selectedSample.distancePx > rangePx) {
                        return []; // Source flak may only render when bomber is in battery range during this phase.
                    }
                    const sampleIndex = burstIndex;
                    const basePuffCount = burst.puffCount ?? (phase === "approach" ? 4 : 5);
                    const puffCount = Math.max(2, Math.min(3, Math.round(basePuffCount <= 1 ? 2 : basePuffCount * 0.34)));
                    const requestedSmokePuffCount = burst.smokePuffCount ?? Math.round(puffCount * 1.15);
                    const smokePuffCount = Math.max(puffCount + 1, Math.min(5, Math.round(requestedSmokePuffCount * 0.8)));
                    const jitteredProgress = host.clamp(selectedSample.progress
                        + bomberSlot * (phase === "approach" ? 0.011 : 0.014)
                        + (jitter01(sampleIndex, burstIndex + 1) - 0.5)
                            * (usingSyntheticSource ? (phase === "approach" ? 0.05 : 0.054) : (phase === "approach" ? 0.042 : 0.046)), minProgress, phase === "approach" ? maxProgress : 0.84);
                    const jitteredBomberCenter = sampleBomberCenterAtProgress(jitteredProgress) ?? selectedSample.bomberCenter;
                    const syntheticRangeReferenceCenter = usingSyntheticSource
                        ? { cx: jitteredBomberCenter.cx, cy: jitteredBomberCenter.cy }
                        : undefined;
                    return [{
                            ...burst,
                            progress: jitteredProgress,
                            count: Math.max(1, burst.count ?? 1),
                            puffCount,
                            smokePuffCount,
                            rangeReferenceCenter: syntheticRangeReferenceCenter,
                            alongOffsetPx: host.clamp((burst.alongOffsetPx ?? 0) * 0.64 - 52 + jitter01(sampleIndex, burstIndex + 11) * 148, -152, 152),
                            lateralOffsetPx: host.clamp((burst.lateralOffsetPx ?? 0) * 0.58
                                + (jitter01(sampleIndex, burstIndex + 23) - 0.5) * 244
                                + bomberSlot * 42
                                + (burstIndex - (scopedCount - 1) / 2) * 22
                                + (jitter01(sampleIndex, planIndex + 71) - 0.5) * 62, -308, 308),
                            alongSpreadPx: Math.max(64, Math.min(116, Math.round((burst.alongSpreadPx ?? 72) * (0.94 + jitter01(sampleIndex, burstIndex + 29) * 0.24)))),
                            lateralSpreadPx: Math.max(190, Math.min(320, Math.round((burst.lateralSpreadPx ?? 186) * (1.12 + jitter01(sampleIndex, burstIndex + 37) * 0.3)))),
                            scale: Math.max(0.62, (burst.scale ?? 1) * (0.7 + jitter01(sampleIndex, burstIndex + 31) * 0.26)),
                            smokeScale: Math.max(1.08, (burst.smokeScale ?? 1) * (1.02 + jitter01(sampleIndex, burstIndex + 43) * 0.22)),
                            bomberUnitKey: plan.flight.spec.id,
                            targetHexKey: burst.targetHexKey
                                ?? bomberSpecsById.get(plan.flight.spec.id)?.targetHexKey
                                ?? scene.bomberTargetHexKey
                                ?? null,
                            batteryHexKey: burst.batteryHexKey ?? null
                        }];
                });
            });
            const densityAdjustedBursts = (() => {
                if (resolvedBursts.length <= 0) {
                    return resolvedBursts;
                }
                const minimumBurstCount = phase === "target" ? 6 : 4;
                const maximumBurstCount = phase === "target" ? 10 : 8;
                if (resolvedBursts.length > maximumBurstCount) {
                    const sorted = [...resolvedBursts].sort((left, right) => (left.progress ?? 0) - (right.progress ?? 0));
                    return Array.from({ length: maximumBurstCount }, (_, index) => sorted[Math.round(index * (sorted.length - 1) / Math.max(1, maximumBurstCount - 1))]);
                }
                if (resolvedBursts.length >= minimumBurstCount) {
                    return resolvedBursts;
                }
                const cloneCountPerBurst = Math.ceil(minimumBurstCount / resolvedBursts.length);
                const cloneGap = phase === "target" ? 0.026 : 0.03;
                const expandedBursts = [];
                for (let cloneIndex = 0; cloneIndex < cloneCountPerBurst; cloneIndex += 1) {
                    const cloneSlot = cloneIndex - (cloneCountPerBurst - 1) / 2;
                    resolvedBursts.forEach((burst, burstIndex) => {
                        expandedBursts.push({
                            ...burst,
                            progress: host.clamp((burst.progress ?? 0.5) + cloneSlot * cloneGap, phase === "approach" ? 0.12 : 0.14, phase === "approach" ? 0.88 : 0.84),
                            puffCount: Math.max(3, burst.puffCount ?? 3),
                            smokePuffCount: Math.max(4, burst.smokePuffCount ?? 4),
                            alongOffsetPx: (burst.alongOffsetPx ?? 0)
                                + (cloneSlot * 34)
                                + (burstIndex % 2 === 0 ? -8 : 8),
                            lateralOffsetPx: (burst.lateralOffsetPx ?? 0)
                                + (cloneSlot * 58)
                                + (burstIndex % 2 === 0 ? 16 : -16)
                        });
                    });
                }
                return expandedBursts.slice(0, minimumBurstCount);
            })();
            if (densityAdjustedBursts.length <= 1) {
                return densityAdjustedBursts;
            }
            const minProgress = phase === "approach" ? 0.12 : 0.14;
            const maxProgress = phase === "approach" ? 0.88 : 0.84;
            const minimumGap = phase === "approach" ? 0.022 : 0.02;
            const sortedBursts = [...densityAdjustedBursts].sort((left, right) => (left.progress ?? 0) - (right.progress ?? 0));
            let previousProgress = minProgress - minimumGap;
            return sortedBursts.map((burst, index) => {
                const remainingBursts = sortedBursts.length - index - 1;
                const latestProgress = maxProgress - remainingBursts * minimumGap;
                const requestedProgress = host.clamp(burst.progress ?? minProgress, minProgress, maxProgress);
                const progress = host.clamp(Math.max(requestedProgress, previousProgress + minimumGap), minProgress, Math.max(minProgress, latestProgress));
                previousProgress = progress;
                return {
                    ...burst,
                    progress
                };
            });
        };
        const commitCorridorPhaseEndState = (assignments, durationMs) => {
            assignments.forEach((assignment) => {
                const finalSample = host.sampleAirShowAssignmentAtTime(assignment, durationMs, durationMs);
                assignment.actor.position = {
                    cx: finalSample.position.cx,
                    cy: finalSample.position.cy
                };
                assignment.actor.headingDegrees = finalSample.headingDegrees;
            });
        };
        const buildRenderedChordPacedTimeline = (assignment, durationMs, keyframeCount = 11) => {
            if (assignment.points.length < 2 || durationMs <= 0 || keyframeCount < 2) {
                return undefined;
            }
            const sampleCount = Math.max(24, keyframeCount * 8);
            const timelineFreeAssignment = {
                ...assignment,
                progressOffset: 0,
                progressTimeline: undefined
            };
            const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
                const progress = index / sampleCount;
                const sample = host.sampleAirShowAssignmentAtTime(timelineFreeAssignment, progress * durationMs, durationMs, progress);
                return {
                    progress,
                    point: sample.position,
                    cumulativePx: 0
                };
            });
            let cumulativePx = 0;
            for (let index = 1; index < samples.length; index += 1) {
                const previous = samples[index - 1];
                const current = samples[index];
                cumulativePx += Math.hypot(current.point.cx - previous.point.cx, current.point.cy - previous.point.cy);
                current.cumulativePx = cumulativePx;
            }
            if (!Number.isFinite(cumulativePx) || cumulativePx <= 1) {
                return undefined;
            }
            return Array.from({ length: keyframeCount }, (_, keyframeIndex) => {
                if (keyframeIndex === 0) {
                    return { timeMs: 0, progress: 0 };
                }
                if (keyframeIndex === keyframeCount - 1) {
                    return { timeMs: durationMs, progress: 1 };
                }
                const targetDistancePx = cumulativePx * (keyframeIndex / (keyframeCount - 1));
                let resolvedProgress = keyframeIndex / (keyframeCount - 1);
                for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
                    const previous = samples[sampleIndex - 1];
                    const current = samples[sampleIndex];
                    if (targetDistancePx > current.cumulativePx && sampleIndex < samples.length - 1) {
                        continue;
                    }
                    const segmentDistancePx = Math.max(0.0001, current.cumulativePx - previous.cumulativePx);
                    const mix = host.clamp((targetDistancePx - previous.cumulativePx) / segmentDistancePx, 0, 1);
                    resolvedProgress = previous.progress + (current.progress - previous.progress) * mix;
                    break;
                }
                return {
                    timeMs: durationMs * (keyframeIndex / (keyframeCount - 1)),
                    progress: host.clamp(resolvedProgress, 0, 1)
                };
            });
        };
        const resolveCorridorPhaseDurationMs = (label, assignments) => {
            const fighterTimedPhase = label === "fighter-ingress"
                || label === "escort-clash-merge"
                || label === "escort-clash-scramble";
            const fighterRolesForTimedPhase = fighterTimedPhase
                && assignments.some((assignment) => assignment.actor.role === "interceptor" || assignment.actor.role === "escort")
                ? ["interceptor", "escort"]
                : undefined;
            const requiredRoles = fighterRolesForTimedPhase
                ?? (assignments.some((assignment) => assignment.actor.role === "bomber")
                    && orderedPreTargetPhaseLabels.includes(label)
                    ? ["bomber"]
                    : undefined);
            const resolvedDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(assignments, roleSpeeds, seedDurationByPhase.get(label) ?? 1, 1, 60000, requiredRoles);
            if (label === "fighter-ingress") {
                const seededDurationMs = Math.max(1, Math.round(seedDurationByPhase.get("fighter-ingress") ?? fighterIngressSeedDurationMs ?? resolvedDurationMs));
                const ingressMinDurationMs = Math.max(1, Math.round(seededDurationMs * 0.72));
                return Math.max(resolvedDurationMs, ingressMinDurationMs);
            }
            if (label === "escort-clash-merge" || label === "escort-clash-scramble") {
                return Math.max(label === "escort-clash-merge" ? 1100 : 3100, resolvedDurationMs);
            }
            if (label === "bomber-ingress") {
                const seededDurationMs = Math.max(1, Math.round(seedDurationByPhase.get("bomber-ingress") ?? resolvedDurationMs));
                const seededPreTargetDurationMs = orderedPreTargetPhaseLabels.reduce((sum, phaseLabel) => sum + Math.max(1, Math.round(seedDurationByPhase.get(phaseLabel) ?? 1)), 0);
                const ingressReadableShareFloorMs = Math.max(1, Math.round(seededPreTargetDurationMs * 0.12));
                const ingressMinDurationMs = Math.max(ingressReadableShareFloorMs, Math.round(seededDurationMs * 1.48));
                const ingressMaxDurationMs = Math.max(ingressMinDurationMs, Math.round(seededDurationMs * 1.75));
                return host.clamp(resolvedDurationMs, ingressMinDurationMs, ingressMaxDurationMs);
            }
            if (label === "bomber-defense-pass") {
                const seededDurationMs = Math.max(1, Math.round(seedDurationByPhase.get("bomber-defense-pass") ?? resolvedDurationMs));
                const ingressReferenceDurationMs = Math.max(1, Math.round(seedDurationByPhase.get("bomber-ingress") ?? seededDurationMs));
                const defenseMinDurationMs = Math.max(840, Math.round(seededDurationMs * 0.34), Math.round(ingressReferenceDurationMs * 0.88));
                const defenseMaxDurationMs = Math.max(defenseMinDurationMs, Math.round(seededDurationMs * 1.48));
                return host.clamp(resolvedDurationMs, defenseMinDurationMs, defenseMaxDurationMs);
            }
            return resolvedDurationMs;
        };
        const recordCorridorPhase = (label, fighterAssignments, tracerBursts = [], flakBursts = []) => {
            const rawAssignments = [...buildBomberPhaseAssignments(label), ...fighterAssignments];
            let durationMs = resolveCorridorPhaseDurationMs(label, rawAssignments);
            let assignments = finalizeCorridorPhaseAssignments(label, rawAssignments, durationMs);
            durationMs = resolveCorridorPhaseDurationMs(label, assignments);
            assignments = finalizeCorridorPhaseAssignments(label, assignments, durationMs);
            recordPhase(label, assignments, durationMs, tracerBursts, flakBursts, roleSpeeds);
            commitCorridorPhaseEndState(assignments, durationMs);
            previousPhaseAssignments = assignments;
            previousPhaseDurationMs = durationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        };
        const alignClashFightersThroughSharedFightSpace = (assignments, durationMs, fightSpaceCenter) => {
            const fighterAssignments = assignments.filter((assignment) => assignment.actor.role === "interceptor" || assignment.actor.role === "escort");
            if (fighterAssignments.length <= 1 || durationMs <= 0) {
                return [...assignments];
            }
            const flightIds = Array.from(new Set(fighterAssignments.map((assignment) => assignment.actor.flightId)));
            const laneByFlightId = new Map(flightIds.map((flightId, index) => [flightId, index - (flightIds.length - 1) / 2]));
            const actorCountByFlightId = new Map();
            fighterAssignments.forEach((assignment) => {
                actorCountByFlightId.set(assignment.actor.flightId, Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1));
            });
            return assignments.map((assignment) => {
                if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                    return assignment;
                }
                const start = assignment.points[0] ?? assignment.actor.position;
                const lane = laneByFlightId.get(assignment.actor.flightId) ?? 0;
                const roleSide = assignment.actor.role === "interceptor" ? -1 : 1;
                const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
                const actorSlot = assignment.actor.formationIndex - (actorCount - 1) / 2;
                const convergencePoint = host.offsetAirShowPoint(fightSpaceCenter, corridor.axis.x * roleSide * 3 + corridor.normal.x * (lane * 12 + actorSlot * 5), corridor.axis.y * roleSide * 3 + corridor.normal.y * (lane * 12 + actorSlot * 5));
                const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
                const points = buildGovernedMergeTurnRail(start, convergencePoint, durationMs, roleSpeedPxPerMs, roleSide);
                return {
                    ...assignment,
                    points,
                    progressTimeline: undefined
                };
            });
        };
        const alignScrambleFightersThroughChasePocket = (assignments, durationMs, fightSpaceCenter) => {
            const fighterAssignments = assignments.filter((assignment) => assignment.actor.role === "interceptor" || assignment.actor.role === "escort");
            if (fighterAssignments.length <= 1 || durationMs <= 0) {
                return [...assignments];
            }
            const flightIds = Array.from(new Set(fighterAssignments.map((assignment) => assignment.actor.flightId)));
            const laneByFlightId = new Map(flightIds.map((flightId, index) => [flightId, index - (flightIds.length - 1) / 2]));
            const actorCountByFlightId = new Map();
            fighterAssignments.forEach((assignment) => {
                actorCountByFlightId.set(assignment.actor.flightId, Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1));
            });
            const fighterAssignmentsByFlightId = new Map();
            fighterAssignments.forEach((assignment) => {
                const entries = fighterAssignmentsByFlightId.get(assignment.actor.flightId) ?? [];
                entries.push(assignment);
                fighterAssignmentsByFlightId.set(assignment.actor.flightId, entries);
            });
            const averageStartForFlights = (flights) => {
                let sumX = 0;
                let sumY = 0;
                let count = 0;
                flights.forEach((flight) => {
                    fighterAssignmentsByFlightId.get(flight.spec.id)?.forEach((assignment) => {
                        const start = assignment.points[0] ?? assignment.actor.position;
                        sumX += start.cx;
                        sumY += start.cy;
                        count += 1;
                    });
                });
                return count > 0 ? { cx: sumX / count, cy: sumY / count } : null;
            };
            const chasePlanByFlightId = new Map();
            fighterGroups.forEach((group, groupIndex) => {
                const directionSign = groupIndex % 2 === 0 ? 1 : -1;
                const fallbackForward = {
                    x: corridor.axis.x * directionSign,
                    y: corridor.axis.y * directionSign
                };
                const interceptorStart = averageStartForFlights(group.interceptorFlights);
                const escortStart = averageStartForFlights(group.escortFlights);
                const groupForward = interceptorStart && escortStart
                    ? normalizeVector(escortStart.cx - interceptorStart.cx, escortStart.cy - interceptorStart.cy, fallbackForward.x, fallbackForward.y)
                    : fallbackForward;
                const groupPocketCenter = interceptorStart && escortStart
                    ? {
                        cx: (interceptorStart.cx + escortStart.cx) * 0.5,
                        cy: (interceptorStart.cy + escortStart.cy) * 0.5
                    }
                    : fightSpaceCenter;
                const assignRolePlans = (flights, role) => {
                    flights.forEach((flight, index) => {
                        const localLane = flights.length <= 1 ? 0 : index - (flights.length - 1) / 2;
                        chasePlanByFlightId.set(flight.spec.id, {
                            forward: groupForward,
                            pocketCenter: groupPocketCenter,
                            lane: group.lane + localLane * 0.24,
                            roleAheadSign: role === "escort" ? 1 : -1
                        });
                    });
                };
                assignRolePlans(group.interceptorFlights, "interceptor");
                assignRolePlans(group.escortFlights, "escort");
            });
            return assignments.map((assignment) => {
                if (assignment.actor.role !== "interceptor" && assignment.actor.role !== "escort") {
                    return assignment;
                }
                const start = assignment.points[0] ?? assignment.actor.position;
                const lane = laneByFlightId.get(assignment.actor.flightId) ?? 0;
                const roleSide = assignment.actor.role === "interceptor" ? -1 : 1;
                const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
                const actorSlot = assignment.actor.formationIndex - (actorCount - 1) / 2;
                const chasePlan = chasePlanByFlightId.get(assignment.actor.flightId) ?? {
                    forward: {
                        x: corridor.axis.x * (lane >= 0 ? 1 : -1),
                        y: corridor.axis.y * (lane >= 0 ? 1 : -1)
                    },
                    pocketCenter: fightSpaceCenter,
                    lane,
                    roleAheadSign: roleSide > 0 ? 1 : -1
                };
                const chaseForward = chasePlan.forward;
                const chaseNormal = { x: -chaseForward.y, y: chaseForward.x };
                const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
                const targetLengthPx = Math.max(64, durationMs * roleSpeedPxPerMs);
                const laneOffsetPx = chasePlan.lane * 8 + actorSlot * 2;
                const roleLaneOffsetPx = 0;
                const trailAlongPx = chasePlan.roleAheadSign * (4 + Math.abs(actorSlot) * 2);
                const chasePathCenter = host.offsetAirShowPoint(chasePlan.pocketCenter, chaseNormal.x * laneOffsetPx, chaseNormal.y * laneOffsetPx);
                const chaseExitForPath = host.offsetAirShowPoint(chasePathCenter, chaseForward.x * (targetLengthPx * 0.28 + trailAlongPx)
                    + chaseNormal.x * roleLaneOffsetPx * 0.7, chaseForward.y * (targetLengthPx * 0.28 + trailAlongPx)
                    + chaseNormal.y * roleLaneOffsetPx * 0.7);
                const roleTurnAlongPx = assignment.actor.role === "interceptor" ? 8 : 6;
                const rolePocketAlongPx = assignment.actor.role === "interceptor" ? 3 : 4;
                const rawTurnPoint = host.offsetAirShowPoint(chasePlan.pocketCenter, chaseForward.x * roleTurnAlongPx
                    + chaseNormal.x * (laneOffsetPx * 0.42 + roleLaneOffsetPx * 0.45), chaseForward.y * roleTurnAlongPx
                    + chaseNormal.y * (laneOffsetPx * 0.42 + roleLaneOffsetPx * 0.45));
                const rawTurnDelta = {
                    x: rawTurnPoint.cx - start.cx,
                    y: rawTurnPoint.cy - start.cy
                };
                const rawTurnAlongPx = rawTurnDelta.x * chaseForward.x + rawTurnDelta.y * chaseForward.y;
                const minimumTurnAlongPx = assignment.actor.role === "escort" ? -8 : 0;
                const initialTurnPoint = rawTurnAlongPx < minimumTurnAlongPx
                    ? host.offsetAirShowPoint(rawTurnPoint, chaseForward.x * (minimumTurnAlongPx - rawTurnAlongPx), chaseForward.y * (minimumTurnAlongPx - rawTurnAlongPx))
                    : rawTurnPoint;
                const turnDistancePx = Math.hypot(initialTurnPoint.cx - start.cx, initialTurnPoint.cy - start.cy);
                const minimumTurnDistancePx = assignment.actor.role === "escort"
                    ? Math.min(68, Math.max(52, targetLengthPx * 0.2))
                    : 0;
                const turnPoint = minimumTurnDistancePx > 0 && turnDistancePx > 0.5 && turnDistancePx < minimumTurnDistancePx
                    ? host.offsetAirShowPoint(start, (initialTurnPoint.cx - start.cx) * (minimumTurnDistancePx / turnDistancePx), (initialTurnPoint.cy - start.cy) * (minimumTurnDistancePx / turnDistancePx))
                    : initialTurnPoint;
                const pocketPoint = host.offsetAirShowPoint(chasePlan.pocketCenter, chaseForward.x * rolePocketAlongPx
                    + chaseNormal.x * (laneOffsetPx * 0.2 + roleLaneOffsetPx * 0.28), chaseForward.y * rolePocketAlongPx
                    + chaseNormal.y * (laneOffsetPx * 0.2 + roleLaneOffsetPx * 0.28));
                const turnEntryForward = normalizeVector(turnPoint.cx - start.cx, turnPoint.cy - start.cy, chaseForward.x, chaseForward.y);
                const turnExitForward = normalizeVector(chaseExitForPath.cx - turnPoint.cx, chaseExitForPath.cy - turnPoint.cy, chaseForward.x, chaseForward.y);
                const turnToChaseAngleDeg = resolveVectorAngleDegrees(turnEntryForward, turnExitForward);
                const needsEscortRecovery = assignment.actor.role === "escort"
                    && turnToChaseAngleDeg > 108;
                const escortRecoveryForward = needsEscortRecovery
                    ? normalizeVector(turnExitForward.x + turnEntryForward.x * 0.86, turnExitForward.y + turnEntryForward.y * 0.86, turnExitForward.x, turnExitForward.y)
                    : turnExitForward;
                const escortRecoveryDistancePx = Math.min(72, Math.max(52, targetLengthPx * 0.22));
                const recoveryPoint = needsEscortRecovery
                    ? host.offsetAirShowPoint(turnPoint, escortRecoveryForward.x * escortRecoveryDistancePx, escortRecoveryForward.y * escortRecoveryDistancePx)
                    : null;
                const chaseExit = recoveryPoint
                    ? host.offsetAirShowPoint(recoveryPoint, chaseForward.x * Math.max(72, targetLengthPx * 0.28)
                        + chaseNormal.x * roleLaneOffsetPx * 0.35, chaseForward.y * Math.max(72, targetLengthPx * 0.28)
                        + chaseNormal.y * roleLaneOffsetPx * 0.35)
                    : chaseExitForPath;
                const escortHoldPoint = !recoveryPoint && assignment.actor.role === "escort"
                    ? {
                        cx: turnPoint.cx * 0.2 + chaseExit.cx * 0.8,
                        cy: turnPoint.cy * 0.66 + chaseExit.cy * 0.34 + 8
                    }
                    : null;
                const chaseTurnPoint = escortHoldPoint
                    ? {
                        cx: turnPoint.cx * 0.68 + escortHoldPoint.cx * 0.32,
                        cy: turnPoint.cy * 0.78 + escortHoldPoint.cy * 0.22
                    }
                    : turnPoint;
                const baseChasePath = (() => {
                    const rawPath = recoveryPoint
                        ? roundPathCorners(dedupePath([start, turnPoint, recoveryPoint, pocketPoint, chaseExit]), 32, 7)
                        : escortHoldPoint
                            ? roundPathCorners(dedupePath([start, chaseTurnPoint, escortHoldPoint, pocketPoint, chaseExit]), 30, 6)
                            : dedupePath([start, chaseTurnPoint, pocketPoint, chaseExit]);
                    if (rawPath.length <= 2) {
                        return rawPath;
                    }
                    const firstPoint = rawPath[0];
                    const lastPoint = rawPath[rawPath.length - 1];
                    const pathForward = normalizeVector(lastPoint.cx - firstPoint.cx, lastPoint.cy - firstPoint.cy, chaseForward.x, chaseForward.y);
                    const totalAlongPx = (lastPoint.cx - firstPoint.cx) * pathForward.x
                        + (lastPoint.cy - firstPoint.cy) * pathForward.y;
                    if (totalAlongPx <= 24) {
                        return rawPath;
                    }
                    const minimumForwardStepPx = host.clamp(totalAlongPx * 0.08, 8, 18);
                    const prunedPath = [firstPoint];
                    let lastAcceptedAlongPx = 0;
                    for (let pointIndex = 1; pointIndex < rawPath.length - 1; pointIndex += 1) {
                        const point = rawPath[pointIndex];
                        const pointAlongPx = (point.cx - firstPoint.cx) * pathForward.x
                            + (point.cy - firstPoint.cy) * pathForward.y;
                        if (pointAlongPx <= lastAcceptedAlongPx + minimumForwardStepPx
                            || pointAlongPx >= totalAlongPx - minimumForwardStepPx) {
                            continue;
                        }
                        prunedPath.push(point);
                        lastAcceptedAlongPx = pointAlongPx;
                    }
                    prunedPath.push(lastPoint);
                    return dedupePath(prunedPath);
                })();
                const points = resamplePathByDistance(matchPathLengthWithCarry(baseChasePath, targetLengthPx, chasePlan.lane >= 0 ? 1 : -1), 34);
                return {
                    ...assignment,
                    points,
                    progressTimeline: undefined
                };
            });
        };
        const finalizeCorridorPhaseAssignments = (label, assignments, durationMs) => {
            const originalAssignmentByActorId = new Map(assignments.map((assignment) => [assignment.actor.id, assignment]));
            const isEscortClashPhase = label === "escort-clash-merge" || label === "escort-clash-scramble";
            const preserveFighterRailPhase = isEscortClashPhase
                || label === "fighter-ingress"
                || label === "bomber-ingress"
                || label === "bomber-defense-pass";
            const extensionModeByRole = preserveFighterRailPhase
                ? {
                    interceptor: "carry",
                    escort: "carry",
                    bomber: "carry"
                }
                : undefined;
            const extendedAssignments = preserveFighterRailPhase
                ? [...assignments]
                : host.extendAirShowPhaseAssignmentsForSpeed(assignments, durationMs, roleSpeeds, {
                    clampCenter: corridor.strike,
                    orbitSignByRole: {
                        interceptor: 1,
                        escort: -1,
                        bomber: 1
                    },
                    extendAtByRole: {
                        interceptor: "end",
                        escort: "end",
                        bomber: "end"
                    },
                    maxHorizontalPx: 520,
                    maxVerticalPx: 360,
                    extensionMode: "carry",
                    extensionModeByRole
                });
            const preparedAssignments = label === "fighter-ingress"
                ? [...extendedAssignments]
                : host.prepareAirShowPhaseAssignments(extendedAssignments, durationMs, [0.24, 0.5, 0.76], 42, roleSpeeds, {
                    previousAssignments: previousPhaseAssignments,
                    previousDurationMs: previousPhaseDurationMs,
                    entryTurnLimitDeg: 58,
                    softenEntryRoles: ["bomber", "interceptor", "escort"],
                    softenEntryTurnLimitDeg: 70,
                    softenEntryWaypointCount: 18,
                    softenExitRoles: ["bomber", "interceptor", "escort"],
                    softenExitTurnLimitDeg: 78,
                    softenExitWaypointCount: 12,
                    sanitizeEntryTurns: true,
                    sanitizeEntryTurnLimitDeg: 42,
                    sanitizeEntryStrongTurnDeg: 84,
                    sanitizeEntryMaxFirstSegmentPx: 92,
                    sanitizeEntryMaxSharpTurnDeg: 96,
                    sanitizeEntryMaxWaypointsToRemove: 5
                });
            const mergeFightSpaceCenter = fighterClashCenter(0, 0);
            const scrambleFightSpaceCenter = fighterClashCenter(0, 26);
            const resolvedTimedAssignments = label === "escort-clash-merge"
                ? alignClashFightersThroughSharedFightSpace(preparedAssignments, durationMs, mergeFightSpaceCenter)
                : label === "escort-clash-scramble"
                    ? alignScrambleFightersThroughChasePocket(preparedAssignments, durationMs, scrambleFightSpaceCenter)
                    : preparedAssignments;
            const finalSpeedAdjustedAssignments = preserveFighterRailPhase
                ? resolvedTimedAssignments
                : host.extendAirShowPhaseAssignmentsForSpeed(resolvedTimedAssignments, durationMs, roleSpeeds, {
                    clampCenter: corridor.strike,
                    orbitSignByRole: {
                        interceptor: 1,
                        escort: -1,
                        bomber: 1
                    },
                    extendAtByRole: {
                        interceptor: "end",
                        escort: "end",
                        bomber: "end"
                    },
                    maxHorizontalPx: 520,
                    maxVerticalPx: 360,
                    extensionMode: "carry",
                    extensionModeByRole
                });
            const phasePatternAlignedAssignments = label === "bomber-defense-pass"
                ? finalSpeedAdjustedAssignments.map((assignment) => {
                    if (assignment.actor.role !== "interceptor") {
                        return assignment;
                    }
                    const bomberAssignments = finalSpeedAdjustedAssignments.filter((candidate) => candidate.actor.role === "bomber");
                    if (bomberAssignments.length <= 0) {
                        return assignment;
                    }
                    const originalAssignment = originalAssignmentByActorId.get(assignment.actor.id);
                    const start = assignment.points[0] ?? originalAssignment?.points[0] ?? assignment.actor.position;
                    const targetBomberSample = bomberAssignments
                        .map((candidate, index) => {
                        const interceptSample = host.sampleAirShowAssignmentAtTime(candidate, durationMs * 0.44, durationMs).position;
                        const distancePx = Math.hypot(interceptSample.cx - start.cx, interceptSample.cy - start.cy);
                        return {
                            candidate,
                            interceptSample,
                            distancePx,
                            index
                        };
                    })
                        .sort((left, right) => left.distancePx === right.distancePx
                        ? left.index - right.index
                        : left.distancePx - right.distancePx)[0];
                    if (!targetBomberSample) {
                        return assignment;
                    }
                    const targetBomberAssignment = targetBomberSample.candidate;
                    const interceptorAssignments = finalSpeedAdjustedAssignments.filter((candidate) => candidate.actor.role === "interceptor");
                    const interceptorFlightIds = Array.from(new Set(interceptorAssignments.map((candidate) => candidate.actor.flightId)));
                    const interceptorLaneByFlightId = new Map(interceptorFlightIds.map((flightId, index) => [
                        flightId,
                        index - (interceptorFlightIds.length - 1) / 2
                    ]));
                    const fighterActorCount = Math.max(1, interceptorAssignments.filter((candidate) => candidate.actor.flightId === assignment.actor.flightId
                        && candidate.actor.role === "interceptor").length);
                    const flightLane = interceptorLaneByFlightId.get(assignment.actor.flightId) ?? 0;
                    const lateralOffsetPx = -10
                        + resolveFighterFormationLaneOffsetPx(assignment.actor.formationIndex, fighterActorCount, flightLane, 12, 22);
                    const bomberAt = (progress) => host.sampleAirShowAssignmentAtTime(targetBomberAssignment, durationMs * host.clamp(progress, 0, 1), durationMs).position;
                    const bomberIntercept = bomberAt(0.46);
                    const interceptPoint = host.offsetAirShowPoint(bomberIntercept, -corridor.axis.x * 6 + corridor.normal.x * lateralOffsetPx * 0.4, -corridor.axis.y * 6 + corridor.normal.y * lateralOffsetPx * 0.4);
                    const attackSideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
                    const points = buildGovernedPassRail(start, interceptPoint, durationMs, roleSpeeds.get("interceptor") ?? host.airShowFighterSpeedPxPerMs, 0.46, attackSideSign);
                    return {
                        ...assignment,
                        points,
                        progressTimeline: undefined
                    };
                })
                : finalSpeedAdjustedAssignments;
            const fighterClashTravelCappedAssignments = label === "escort-clash-merge" || label === "escort-clash-scramble"
                ? phasePatternAlignedAssignments.map((assignment) => {
                    if (assignment.actor.role !== "interceptor"
                        && assignment.actor.role !== "escort") {
                        return assignment;
                    }
                    const roleSpeedPxPerMs = roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
                    const maxFighterClashTravelPx = Math.max(label === "escort-clash-merge" ? 500 : 520, durationMs * roleSpeedPxPerMs * 1.04);
                    const travelPx = measurePathLength(assignment.points);
                    if (travelPx <= maxFighterClashTravelPx + 1) {
                        return assignment;
                    }
                    return {
                        ...assignment,
                        points: slicePathByDistanceRange(assignment.points, 0, maxFighterClashTravelPx)
                    };
                })
                : phasePatternAlignedAssignments;
            const fighterClashSpeedFlooredAssignments = label === "escort-clash-scramble"
                ? fighterClashTravelCappedAssignments.map((assignment) => {
                    if (assignment.actor.role !== "interceptor"
                        && assignment.actor.role !== "escort") {
                        return assignment;
                    }
                    return {
                        ...assignment,
                        progressTimeline: buildRenderedChordPacedTimeline(assignment, durationMs)
                    };
                })
                : fighterClashTravelCappedAssignments;
            const bomberDefenseSpeedCappedAssignments = label === "bomber-defense-pass"
                ? fighterClashSpeedFlooredAssignments.map((assignment) => {
                    if (assignment.actor.role !== "interceptor"
                        && assignment.actor.role !== "escort") {
                        return assignment;
                    }
                    const roleTravelCapMultiplier = 1.02;
                    const maxFighterCombatTravelPx = Math.max(assignment.actor.role === "interceptor" ? 24 : 18, durationMs * host.airShowFighterSpeedPxPerMs * roleTravelCapMultiplier);
                    const travelPx = measurePathLength(assignment.points);
                    if (travelPx <= maxFighterCombatTravelPx + 1) {
                        return assignment;
                    }
                    return {
                        ...assignment,
                        points: slicePathByDistanceRange(assignment.points, 0, maxFighterCombatTravelPx)
                    };
                })
                : fighterClashSpeedFlooredAssignments;
            const bomberDefenseSpeedFlooredAssignments = label === "bomber-defense-pass"
                ? bomberDefenseSpeedCappedAssignments.map((assignment) => {
                    if (assignment.actor.role !== "interceptor"
                        && assignment.actor.role !== "escort") {
                        return assignment;
                    }
                    const roleTravelFloorMultiplier = 0.98;
                    const minimumFighterCombatTravelPx = Math.max(assignment.actor.role === "interceptor" ? 28 : 18, durationMs * host.airShowFighterSpeedPxPerMs * roleTravelFloorMultiplier);
                    const currentTravelPx = measurePathLength(assignment.points);
                    if (currentTravelPx >= minimumFighterCombatTravelPx - 1) {
                        return assignment;
                    }
                    const points = [...assignment.points];
                    const start = points[0] ?? assignment.actor.position;
                    const end = points[points.length - 1] ?? start;
                    const previous = points[points.length - 2] ?? start;
                    const extensionDirection = normalizeVector(end.cx - previous.cx, end.cy - previous.cy, corridor.axis.x, corridor.axis.y);
                    const sideSign = assignment.actor.role === "interceptor" ? -1 : 1;
                    const formationBias = assignment.actor.formationIndex - 1.5;
                    const lateralDriftPx = sideSign * (assignment.actor.role === "interceptor"
                        ? (20 + Math.abs(formationBias) * 5)
                        : (8 + Math.abs(formationBias) * 2));
                    const lateralDriftScale = assignment.actor.role === "interceptor" ? 1 : 0.26;
                    const extensionPx = minimumFighterCombatTravelPx - currentTravelPx;
                    const carryPoint = host.offsetAirShowPoint(end, extensionDirection.x * Math.min(68, extensionPx * 0.4)
                        + corridor.normal.x * lateralDriftPx * lateralDriftScale * 0.42, extensionDirection.y * Math.min(68, extensionPx * 0.4)
                        + corridor.normal.y * lateralDriftPx * lateralDriftScale * 0.42);
                    const extensionPoint = host.offsetAirShowPoint(end, extensionDirection.x * extensionPx + corridor.normal.x * lateralDriftPx * lateralDriftScale, extensionDirection.y * extensionPx + corridor.normal.y * lateralDriftPx * lateralDriftScale);
                    return {
                        ...assignment,
                        points: dedupePath([...points, carryPoint, extensionPoint])
                    };
                })
                : bomberDefenseSpeedCappedAssignments;
            const endpointAlignedAssignments = label === "fighter-ingress"
                ? bomberDefenseSpeedFlooredAssignments.map((assignment) => rebuildFighterIngressPathToMergeEndpoint(assignment, durationMs))
                : bomberDefenseSpeedFlooredAssignments;
            const bomberIngressFighterGovernedAssignments = label === "bomber-ingress"
                ? (() => {
                    const governedFighterAssignments = host.extendAirShowPhaseAssignmentsForSpeed(endpointAlignedAssignments.filter((assignment) => assignment.actor.role === "interceptor"
                        || assignment.actor.role === "escort"), durationMs, roleSpeeds, {
                        clampCenter: corridor.strike,
                        extendAtByRole: {
                            interceptor: "end",
                            escort: "end"
                        },
                        extensionMode: "carry",
                        extensionModeByRole: {
                            interceptor: "carry",
                            escort: "carry"
                        }
                    });
                    const governedFighterAssignmentByActorId = new Map(governedFighterAssignments.map((assignment) => [assignment.actor.id, assignment]));
                    return endpointAlignedAssignments.map((assignment) => {
                        const governedAssignment = governedFighterAssignmentByActorId.get(assignment.actor.id) ?? assignment;
                        if (governedAssignment.actor.role !== "interceptor" && governedAssignment.actor.role !== "escort") {
                            return governedAssignment;
                        }
                        const start = governedAssignment.points[0] ?? governedAssignment.actor.position;
                        const end = assignment.points[assignment.points.length - 1] ?? start;
                        const roleSpeedPxPerMs = roleSpeeds.get(governedAssignment.actor.role) ?? host.airShowFighterSpeedPxPerMs;
                        const targetRenderedLengthPx = durationMs * roleSpeedPxPerMs * 1.045;
                        const sideSign = governedAssignment.actor.role === "interceptor" ? -1 : 1;
                        const measureRenderedLength = (points) => host.resolveAirShowAssignmentTraversedPathLengthPx({
                            ...governedAssignment,
                            points: [...points],
                            progressOffset: 0,
                            progressTimeline: undefined
                        }, durationMs);
                        let points = buildEndpointPreservingLengthMatchedPath(start, end, targetRenderedLengthPx, sideSign);
                        let renderedLengthPx = measureRenderedLength(points);
                        if (renderedLengthPx < targetRenderedLengthPx - 4) {
                            points = buildEndpointPreservingLengthMatchedPath(start, end, targetRenderedLengthPx + (targetRenderedLengthPx - renderedLengthPx) * 1.05, sideSign);
                            renderedLengthPx = measureRenderedLength(points);
                        }
                        if (renderedLengthPx < targetRenderedLengthPx - 4) {
                            points = matchPathLengthWithCarry(points, measurePathLength(points) + (targetRenderedLengthPx - renderedLengthPx) * 1.05, sideSign);
                        }
                        return {
                            ...governedAssignment,
                            points
                        };
                    });
                })()
                : endpointAlignedAssignments;
            const bomberIngressFighterAssignments = label === "bomber-ingress"
                ? bomberIngressFighterGovernedAssignments.map((assignment) => {
                    if (assignment.actor.role !== "interceptor"
                        && assignment.actor.role !== "escort") {
                        return assignment;
                    }
                    return {
                        ...assignment,
                        progressTimeline: buildRenderedChordPacedTimeline(assignment, durationMs, 21)
                    };
                })
                : bomberIngressFighterGovernedAssignments;
            const bomberBackTimedAssignments = orderedPreTargetPhaseLabels.includes(label)
                ? bomberIngressFighterAssignments.map((assignment) => {
                    if (assignment.actor.role !== "bomber") {
                        return assignment;
                    }
                    const originalAssignment = originalAssignmentByActorId.get(assignment.actor.id);
                    if (!originalAssignment || originalAssignment.points.length <= 0) {
                        return assignment;
                    }
                    const preparedStart = assignment.points[0] ?? originalAssignment.points[0];
                    const originalStart = originalAssignment.points[0];
                    const dx = preparedStart.cx - originalStart.cx;
                    const dy = preparedStart.cy - originalStart.cy;
                    let points = originalAssignment.points.map((point) => ({
                        cx: point.cx + dx,
                        cy: point.cy + dy
                    }));
                    const bomberTravelDurationMs = label === "fighter-ingress"
                        ? (() => {
                            const seededDurationMs = Math.max(1, Math.round(seedDurationByPhase.get("fighter-ingress") ?? durationMs));
                            return Math.min(durationMs, Math.round(seededDurationMs + Math.max(0, durationMs - seededDurationMs) * 0.36));
                        })()
                        : durationMs;
                    const governedBomberTravelPx = Math.max(24, bomberTravelDurationMs * host.airShowBomberSpeedPxPerMs);
                    points = matchPathLengthWithCarry(points, governedBomberTravelPx, assignment.actor.formationIndex % 2 === 0 ? -1 : 1);
                    const activeDurationMs = Math.min(durationMs, Math.max(1, Math.round(measurePathLength(points) / host.airShowBomberSpeedPxPerMs)));
                    const maxDogfightHoldRatio = label === "escort-clash-merge"
                        ? 0.08
                        : label === "escort-clash-scramble" || label === "bomber-defense-pass"
                            ? 0.1
                            : Number.POSITIVE_INFINITY;
                    const maxDogfightHoldMs = Number.isFinite(maxDogfightHoldRatio)
                        ? Math.round(durationMs * maxDogfightHoldRatio)
                        : Number.POSITIVE_INFINITY;
                    const startTimeMs = Math.min(Math.max(0, durationMs - activeDurationMs), maxDogfightHoldMs);
                    return {
                        ...assignment,
                        points,
                        progressTimeline: startTimeMs > 80
                            ? [
                                { timeMs: 0, progress: 0 },
                                { timeMs: startTimeMs, progress: 0 },
                                { timeMs: durationMs, progress: 1 }
                            ]
                            : undefined
                    };
                })
                : bomberIngressFighterAssignments;
            const bomberIngressSpeedRestoredAssignments = label === "bomber-ingress"
                ? (() => {
                    const bomberAssignments = bomberBackTimedAssignments.filter((assignment) => assignment.actor.role === "bomber");
                    if (bomberAssignments.length <= 0) {
                        return bomberBackTimedAssignments;
                    }
                    const extendedBomberAssignments = host.extendAirShowPhaseAssignmentsForSpeed(bomberAssignments, durationMs, roleSpeeds, {
                        clampCenter: corridor.strike,
                        orbitSignByRole: { bomber: 1 },
                        extendAtByRole: { bomber: "end" },
                        extensionMode: "carry",
                        extensionModeByRole: { bomber: "carry" },
                        maxHorizontalPx: 520,
                        maxVerticalPx: 360
                    });
                    const extendedBomberAssignmentsByActorId = new Map(extendedBomberAssignments.map((assignment) => [assignment.actor.id, assignment]));
                    return bomberBackTimedAssignments.map((assignment) => extendedBomberAssignmentsByActorId.get(assignment.actor.id) ?? assignment);
                })()
                : bomberBackTimedAssignments;
            const bomberIngressContactAlignedAssignments = label === "bomber-ingress"
                ? (() => {
                    const bomberAssignments = bomberIngressSpeedRestoredAssignments.filter((assignment) => assignment.actor.role === "bomber");
                    const interceptorAssignments = bomberIngressSpeedRestoredAssignments.filter((assignment) => assignment.actor.role === "interceptor");
                    if (bomberAssignments.length <= 0 || interceptorAssignments.length <= 0) {
                        return bomberIngressSpeedRestoredAssignments;
                    }
                    const bomberContactPoint = host.averageAirShowPoints(bomberAssignments.map((assignment) => host.sampleAirShowAssignmentAtTime(assignment, durationMs * 0.84, durationMs).position))
                        ?? corridor.strike;
                    const flightIds = Array.from(new Set(interceptorAssignments.map((assignment) => assignment.actor.flightId)));
                    const laneByFlightId = new Map(flightIds.map((flightId, index) => [flightId, index - (flightIds.length - 1) / 2]));
                    const actorCountByFlightId = new Map();
                    interceptorAssignments.forEach((assignment) => {
                        actorCountByFlightId.set(assignment.actor.flightId, Math.max(actorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1));
                    });
                    return bomberIngressSpeedRestoredAssignments.map((assignment) => {
                        if (assignment.actor.role !== "interceptor") {
                            return assignment;
                        }
                        const start = assignment.points[0] ?? assignment.actor.position;
                        const roleSpeedPxPerMs = roleSpeeds.get("interceptor") ?? host.airShowFighterSpeedPxPerMs;
                        const targetRenderedLengthPx = durationMs * roleSpeedPxPerMs * 1.045;
                        const actorCount = actorCountByFlightId.get(assignment.actor.flightId) ?? 1;
                        const lane = laneByFlightId.get(assignment.actor.flightId) ?? 0;
                        const lateralOffsetPx = resolveFighterFormationLaneOffsetPx(assignment.actor.formationIndex, actorCount, lane, 12, 22);
                        const contactPoint = host.offsetAirShowPoint(bomberContactPoint, -corridor.axis.x * 14 + corridor.normal.x * lateralOffsetPx, -corridor.axis.y * 14 + corridor.normal.y * lateralOffsetPx);
                        const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
                        const measureRenderedLength = (points) => host.resolveAirShowAssignmentTraversedPathLengthPx({
                            ...assignment,
                            points: [...points],
                            progressOffset: 0,
                            progressTimeline: undefined
                        }, durationMs);
                        const buildContactPath = (targetLengthPx, pathSideSign) => buildEndpointPreservingCircularArcPath(start, contactPoint, targetLengthPx, pathSideSign);
                        const entryTurnDegFor = (points) => {
                            const firstPoint = points[1];
                            if (!firstPoint) {
                                return 0;
                            }
                            const pathForward = normalizeVector(firstPoint.cx - start.cx, firstPoint.cy - start.cy, corridor.axis.x, corridor.axis.y);
                            const headingForward = resolveHeadingVector(assignment.actor.headingDegrees, pathForward);
                            return resolveVectorAngleDegrees(headingForward, pathForward);
                        };
                        const primaryPoints = buildContactPath(targetRenderedLengthPx, sideSign);
                        const alternatePoints = buildContactPath(targetRenderedLengthPx, -sideSign);
                        let selectedSideSign = entryTurnDegFor(alternatePoints) + 2 < entryTurnDegFor(primaryPoints)
                            ? -sideSign
                            : sideSign;
                        let points = selectedSideSign === sideSign ? primaryPoints : alternatePoints;
                        let renderedLengthPx = measureRenderedLength(points);
                        if (renderedLengthPx < targetRenderedLengthPx - 4) {
                            points = buildContactPath(targetRenderedLengthPx + (targetRenderedLengthPx - renderedLengthPx) * 1.05, selectedSideSign);
                            renderedLengthPx = measureRenderedLength(points);
                        }
                        if (renderedLengthPx < targetRenderedLengthPx - 4) {
                            points = matchPathLengthWithCarry(points, measurePathLength(points) + (targetRenderedLengthPx - renderedLengthPx) * 1.05, selectedSideSign);
                        }
                        const alignedAssignment = {
                            ...assignment,
                            points,
                            progressTimeline: undefined
                        };
                        return {
                            ...alignedAssignment,
                            progressTimeline: buildRenderedChordPacedTimeline(alignedAssignment, durationMs, 21)
                        };
                    });
                })()
                : bomberIngressSpeedRestoredAssignments;
            const dogfightBomberSpeedRestoredAssignments = label === "escort-clash-merge" || label === "escort-clash-scramble"
                ? (() => {
                    const bomberAssignments = bomberIngressContactAlignedAssignments.filter((assignment) => assignment.actor.role === "bomber");
                    if (bomberAssignments.length <= 0) {
                        return bomberIngressContactAlignedAssignments;
                    }
                    const extendedBomberAssignments = host.extendAirShowPhaseAssignmentsForSpeed(bomberAssignments, durationMs, roleSpeeds, {
                        clampCenter: corridor.strike,
                        orbitSignByRole: { bomber: 1 },
                        extendAtByRole: { bomber: "end" },
                        extensionMode: "carry",
                        extensionModeByRole: { bomber: "carry" },
                        maxHorizontalPx: 520,
                        maxVerticalPx: 360
                    });
                    const extendedBomberAssignmentsByActorId = new Map(extendedBomberAssignments.map((assignment) => [assignment.actor.id, assignment]));
                    return bomberIngressContactAlignedAssignments.map((assignment) => extendedBomberAssignmentsByActorId.get(assignment.actor.id) ?? assignment);
                })()
                : bomberIngressContactAlignedAssignments;
            const dogfightBomberMovementGuardedAssignments = label === "escort-clash-merge" || label === "escort-clash-scramble"
                ? dogfightBomberSpeedRestoredAssignments.map((assignment) => {
                    if (assignment.actor.role !== "bomber" || assignment.points.length < 2) {
                        return assignment;
                    }
                    const currentTravelPx = measurePathLength(assignment.points);
                    const movementFloorRatio = 1;
                    const minimumTravelPx = Math.max(24, durationMs * host.airShowBomberSpeedPxPerMs * movementFloorRatio);
                    if (currentTravelPx >= minimumTravelPx - 1) {
                        return assignment;
                    }
                    const start = assignment.points[0];
                    const end = assignment.points[assignment.points.length - 1];
                    if (!start || !end) {
                        return assignment;
                    }
                    const forward = normalizeVector(end.cx - start.cx, end.cy - start.cy, corridor.axis.x, corridor.axis.y);
                    const extensionPx = minimumTravelPx - currentTravelPx;
                    return {
                        ...assignment,
                        points: dedupePath([
                            ...assignment.points.slice(0, -1),
                            {
                                cx: end.cx + forward.x * extensionPx,
                                cy: end.cy + forward.y * extensionPx
                            }
                        ])
                    };
                })
                : dogfightBomberSpeedRestoredAssignments;
            const bomberDefenseSpeedRestoredAssignments = label === "bomber-defense-pass"
                ? (() => {
                    const bomberAssignments = dogfightBomberMovementGuardedAssignments.filter((assignment) => assignment.actor.role === "bomber");
                    if (bomberAssignments.length <= 0) {
                        return dogfightBomberMovementGuardedAssignments;
                    }
                    const extendedBomberAssignments = host.extendAirShowPhaseAssignmentsForSpeed(bomberAssignments, durationMs, roleSpeeds, {
                        clampCenter: corridor.strike,
                        orbitSignByRole: { bomber: 1 },
                        extendAtByRole: { bomber: "end" },
                        extensionMode: "carry",
                        extensionModeByRole: { bomber: "carry" },
                        maxHorizontalPx: 560,
                        maxVerticalPx: 380
                    });
                    const extendedBomberAssignmentsByActorId = new Map(extendedBomberAssignments.map((assignment) => [assignment.actor.id, assignment]));
                    return dogfightBomberMovementGuardedAssignments.map((assignment) => extendedBomberAssignmentsByActorId.get(assignment.actor.id) ?? assignment);
                })()
                : dogfightBomberMovementGuardedAssignments;
            return separatePhaseEndAssignments(bomberDefenseSpeedRestoredAssignments, label === "bomber-defense-pass" ? 28 : 16);
        };
        const hasInterceptors = interceptorFlights.length > 0;
        const hasEscorts = escortFlights.length > 0;
        const hasBombers = bomberFlights.length > 0;
        const hasAnyFighters = hasInterceptors || hasEscorts;
        const hasFighterOpposition = hasInterceptors && hasEscorts;
        if (hasAnyFighters) {
            recordCorridorPhase("fighter-ingress", buildFighterPhaseAssignments("fighter-ingress"));
        }
        if (hasFighterOpposition) {
            const rawMergeAssignments = [...buildBomberPhaseAssignments("escort-clash-merge"), ...buildFighterPhaseAssignments("escort-clash-merge")];
            let mergeDurationMs = resolveCorridorPhaseDurationMs("escort-clash-merge", rawMergeAssignments);
            let mergeAssignments = finalizeCorridorPhaseAssignments("escort-clash-merge", rawMergeAssignments, mergeDurationMs);
            mergeDurationMs = resolveCorridorPhaseDurationMs("escort-clash-merge", mergeAssignments);
            mergeAssignments = finalizeCorridorPhaseAssignments("escort-clash-merge", mergeAssignments, mergeDurationMs);
            recordPhase("escort-clash-merge", mergeAssignments, mergeDurationMs, buildDogfightTracers(mergeAssignments, "escort-clash-merge", mergeDurationMs), [], roleSpeeds);
            commitCorridorPhaseEndState(mergeAssignments, mergeDurationMs);
            previousPhaseAssignments = mergeAssignments;
            previousPhaseDurationMs = mergeDurationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
            const rawScrambleAssignments = [...buildBomberPhaseAssignments("escort-clash-scramble"), ...buildFighterPhaseAssignments("escort-clash-scramble")];
            let scrambleDurationMs = resolveCorridorPhaseDurationMs("escort-clash-scramble", rawScrambleAssignments);
            let scrambleAssignments = finalizeCorridorPhaseAssignments("escort-clash-scramble", rawScrambleAssignments, scrambleDurationMs);
            scrambleDurationMs = resolveCorridorPhaseDurationMs("escort-clash-scramble", scrambleAssignments);
            scrambleAssignments = finalizeCorridorPhaseAssignments("escort-clash-scramble", scrambleAssignments, scrambleDurationMs);
            recordPhase("escort-clash-scramble", scrambleAssignments, scrambleDurationMs, buildDogfightTracers(scrambleAssignments, "escort-clash-scramble", scrambleDurationMs), [], roleSpeeds);
            commitCorridorPhaseEndState(scrambleAssignments, scrambleDurationMs);
            previousPhaseAssignments = scrambleAssignments;
            previousPhaseDurationMs = scrambleDurationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        }
        if (hasBombers) {
            recordCorridorPhase("bomber-ingress", hasAnyFighters ? buildFighterPhaseAssignments("bomber-ingress") : []);
        }
        if (hasBombers && hasInterceptors) {
            const rawBomberDefenseAssignments = [...buildBomberPhaseAssignments("bomber-defense-pass"), ...buildFighterPhaseAssignments("bomber-defense-pass")];
            let bomberDefenseDurationMs = resolveCorridorPhaseDurationMs("bomber-defense-pass", rawBomberDefenseAssignments);
            let bomberDefenseAssignments = finalizeCorridorPhaseAssignments("bomber-defense-pass", rawBomberDefenseAssignments, bomberDefenseDurationMs);
            bomberDefenseDurationMs = resolveCorridorPhaseDurationMs("bomber-defense-pass", bomberDefenseAssignments);
            bomberDefenseAssignments = finalizeCorridorPhaseAssignments("bomber-defense-pass", bomberDefenseAssignments, bomberDefenseDurationMs);
            const bomberDefenseTracers = [];
            activeFlights(interceptorFlights).forEach((interceptorFlight, index) => {
                const targetBomber = bomberFlights[index % Math.max(1, bomberFlights.length)];
                if (!targetBomber) {
                    return;
                }
                bomberDefenseTracers.push(...host.buildAirShowDynamicTracerVolley(bomberDefenseAssignments, interceptorFlight, targetBomber, {
                    emitter: "nose",
                    color: "#fff5cf",
                    width: 0.54,
                    lifetimeMs: 34,
                    spreadPx: 9,
                    streakLengthPx: 104,
                    visibleLengthPx: 7,
                    fanHalfAngleDeg: 1.7,
                    burstCount: 4,
                    maxAlignmentDeg: 42,
                    maxRangePx: 204,
                    timings: [0, 0.04, 0.08, 0.12, 0.18],
                    durationMs: bomberDefenseDurationMs,
                    fallbackToNearest: false
                }), ...host.buildAirShowDynamicTracerVolley(bomberDefenseAssignments, targetBomber, interceptorFlight, {
                    emitter: "center",
                    color: "#fff1c8",
                    width: 0.44,
                    lifetimeMs: 36,
                    spreadPx: 7,
                    streakLengthPx: 86,
                    visibleLengthPx: 6,
                    fanHalfAngleDeg: 0.9,
                    burstCount: 3,
                    maxAlignmentDeg: 96,
                    maxRangePx: 204,
                    timings: [0.24, 0.38, 0.52, 0.66],
                    durationMs: bomberDefenseDurationMs,
                    fallbackToNearest: false
                }));
            });
            recordPhase("bomber-defense-pass", bomberDefenseAssignments, bomberDefenseDurationMs, bomberDefenseTracers, resolveContinuousFlakBursts(bomberDefenseAssignments, bomberDefenseDurationMs, "approach"), roleSpeeds);
            commitCorridorPhaseEndState(bomberDefenseAssignments, bomberDefenseDurationMs);
            previousPhaseAssignments = bomberDefenseAssignments;
            previousPhaseDurationMs = bomberDefenseDurationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
            interceptorFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
            escortFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, Math.max(0, flight.spec.finalStrength ?? flight.currentStrength)));
        }
        const homeSideMidX = hqMidX
            ?? (visibleBounds ? (visibleBounds.minX + visibleBounds.maxX) / 2 : corridor.center.cx);
        const homeSideVisibleWidthPx = visibleBounds
            ? Math.max(1, visibleBounds.maxX - visibleBounds.minX)
            : Math.max(960, Math.abs(corridor.exit.cx - corridor.entry.cx) + 520);
        const fighterFlightById = new Map([...interceptorFlights, ...escortFlights].map((flight) => [flight.spec.id, flight]));
        const resolveFighterHomeSideX = (sideSignInput, distancePx, laneOffsetPx = 0, clampToVisible = true) => {
            const sideSign = sideSignInput < 0 ? -1 : 1;
            const rawX = homeSideMidX + sideSign * distancePx + sideSign * laneOffsetPx;
            if (!visibleBounds || !clampToVisible) {
                return rawX;
            }
            return host.clamp(rawX, visibleBounds.minX + 54, visibleBounds.maxX - 54);
        };
        const resolveFighterHomeSideSign = (assignment) => {
            const ownerFlight = fighterFlightById.get(assignment.actor.flightId);
            const origin = ownerFlight
                ? (hqAxis
                    ? (ownerFlight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin)
                    : fallbackOriginFor(ownerFlight.spec))
                : null;
            if (origin) {
                return origin.cx >= homeSideMidX ? 1 : -1;
            }
            const renderedStartX = assignment.points[0]
                ? assignment.points[0].cx + (assignment.multiFlightOffsetPx ?? 0)
                : assignment.actor.position.cx;
            return renderedStartX >= homeSideMidX ? 1 : -1;
        };
        const buildHomeSideTargetRunFighterPath = (assignment, durationMs) => {
            if (assignment.actor.role !== "interceptor"
                && assignment.actor.role !== "escort") {
                return assignment;
            }
            const start = assignment.points[0] ?? assignment.actor.position;
            const rawEnd = assignment.points[assignment.points.length - 1] ?? start;
            const laneOffsetPx = (assignment.actor.formationIndex - 0.5) * 22;
            const sideSign = resolveFighterHomeSideSign(assignment);
            const fallbackForward = resolveHeadingVector(assignment.actor.headingDegrees, {
                x: rawEnd.cx - start.cx,
                y: rawEnd.cy - start.cy
            });
            const targetLengthPx = durationMs * (roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs);
            const outboundForward = normalizeVector(sideSign * 0.92 + (fallbackForward.x * sideSign > 0.2 ? fallbackForward.x * 0.28 : 0), fallbackForward.y * 0.42 + corridor.axis.y * 0.18, sideSign, fallbackForward.y);
            const outboundNormal = { x: -outboundForward.y, y: outboundForward.x };
            const controlDistancePx = host.clamp(targetLengthPx * 0.23, 84, 136);
            const exitDistancePx = host.clamp(targetLengthPx * 0.54, 180, Math.max(220, targetLengthPx * 0.72));
            const firstControl = {
                cx: start.cx + outboundForward.x * controlDistancePx + outboundNormal.x * laneOffsetPx * 0.25,
                cy: start.cy + outboundForward.y * controlDistancePx + outboundNormal.y * laneOffsetPx * 0.25
            };
            const secondControl = {
                cx: start.cx + outboundForward.x * exitDistancePx * 0.72 + outboundNormal.x * laneOffsetPx * 0.44,
                cy: start.cy + outboundForward.y * exitDistancePx * 0.72 + outboundNormal.y * laneOffsetPx * 0.44
            };
            const sideExit = {
                cx: start.cx + outboundForward.x * exitDistancePx + outboundNormal.x * laneOffsetPx * 0.58,
                cy: start.cy + outboundForward.y * exitDistancePx + outboundNormal.y * laneOffsetPx * 0.58
            };
            return {
                ...assignment,
                points: matchPathLengthWithCarry(buildCubicAirShowPath(start, firstControl, secondControl, sideExit, 16), targetLengthPx, sideSign),
                progressTimeline: undefined
            };
        };
        const buildTargetRunFighterAssignments = (durationMs) => [...activeFlights(interceptorFlights), ...activeFlights(escortFlights)].flatMap((flight, index, flights) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const homeSideSign = current.cx >= center.cx ? 1 : -1;
            const awayFromStrike = {
                x: corridor.normal.x * homeSideSign,
                y: corridor.normal.y * homeSideSign
            };
            const peelDistancePx = Math.max(150, durationMs * host.airShowFighterSpeedPxPerMs * 0.92);
            const radialAway = normalizeVector(current.cx - center.cx + homeSideSign * 120, current.cy - center.cy, awayFromStrike.x, awayFromStrike.y);
            const rawPeelPoint = host.offsetAirShowPoint(current, radialAway.x * peelDistancePx + corridor.axis.x * 36, radialAway.y * peelDistancePx + corridor.axis.y * 36);
            const sideCommittedPeelX = resolveFighterHomeSideX(homeSideSign, Math.min(homeSideVisibleWidthPx * 0.42, 480), (index - (flights.length - 1) / 2) * 14);
            const peelPoint = {
                ...rawPeelPoint,
                cx: homeSideSign < 0
                    ? Math.min(rawPeelPoint.cx, sideCommittedPeelX)
                    : Math.max(rawPeelPoint.cx, sideCommittedPeelX)
            };
            return buildAssignmentsForFlightPath(flight, buildAirShowPresetRailPath(corridor, current, peelPoint, {
                lateralPx: host.resolveAirShowCorridorCoordinates(corridor, peelPoint).lateralPx,
                midLateralPx: host.resolveAirShowCorridorCoordinates(corridor, peelPoint).lateralPx,
                entryProgress: 0.4,
                exitProgress: 0.76
            }), 0.28);
        });
        const rawTargetRunBomberAssignments = bomberPlans.flatMap((plan) => buildAssignmentsForFlightPath(plan.flight, plan.targetRunPath, 0.24));
        const targetRunPackageForward = normalizeVector(bomberPlans.reduce((sum, plan) => sum + plan.attackForward.x, 0), bomberPlans.reduce((sum, plan) => sum + plan.attackForward.y, 0), corridor.axis.x, corridor.axis.y);
        const targetRunBomberActorCountByFlightId = new Map();
        rawTargetRunBomberAssignments.forEach((assignment) => {
            if (assignment.actor.role !== "bomber") {
                return;
            }
            targetRunBomberActorCountByFlightId.set(assignment.actor.flightId, Math.max(targetRunBomberActorCountByFlightId.get(assignment.actor.flightId) ?? 0, assignment.actor.formationIndex + 1));
        });
        const buildTargetRunPhaseAssignments = (durationMs) => {
            const rawTargetRunAssignments = [
                ...rawTargetRunBomberAssignments,
                ...buildTargetRunFighterAssignments(durationMs)
            ];
            const preparedTargetRunAssignments = host.prepareAirShowPhaseAssignments(rawTargetRunAssignments, durationMs, [0.2, 0.5, 0.78], 44, roleSpeeds, {
                previousAssignments: previousPhaseAssignments,
                previousDurationMs: previousPhaseDurationMs,
                entryTurnLimitDeg: 58,
                softenEntryRoles: ["bomber", "interceptor", "escort"],
                softenEntryTurnLimitDeg: 72,
                softenEntryWaypointCount: 18,
                softenExitRoles: ["interceptor", "escort"],
                softenExitTurnLimitDeg: 82,
                softenExitWaypointCount: 12,
                sanitizeEntryTurns: true,
                sanitizeEntryTurnLimitDeg: 42,
                sanitizeEntryStrongTurnDeg: 84,
                sanitizeEntryMaxFirstSegmentPx: 92,
                sanitizeEntryMaxSharpTurnDeg: 96,
                sanitizeEntryMaxWaypointsToRemove: 5
            });
            return host.extendAirShowPhaseAssignmentsForSpeed(preparedTargetRunAssignments, durationMs, roleSpeeds, {
                clampCenter: corridor.strike,
                orbitSignByRole: {
                    interceptor: -1,
                    escort: 1,
                    bomber: 1
                },
                extendAtByRole: {
                    interceptor: "end",
                    escort: "end",
                    bomber: "end"
                },
                maxHorizontalPx: 520,
                maxVerticalPx: 360,
                extensionMode: "carry",
                extensionModeByRole: {
                    interceptor: "carry",
                    escort: "carry",
                    bomber: "carry"
                }
            }).map((assignment) => {
                if (assignment.actor.role !== "bomber") {
                    return buildHomeSideTargetRunFighterPath(assignment, durationMs);
                }
                const preparedStart = assignment.points[0];
                if (!preparedStart) {
                    return assignment;
                }
                const sourcePlan = bomberPlans.find((plan) => plan.flight.spec.id === assignment.actor.flightId);
                const sourcePlanIndex = bomberPlans.findIndex((plan) => plan.flight.spec.id === assignment.actor.flightId);
                const packageSlot = sourcePlanIndex >= 0
                    ? sourcePlanIndex - (bomberPlans.length - 1) / 2
                    : 0;
                const releaseBase = sourcePlan?.targetCenter ?? corridor.strike;
                const actorCount = targetRunBomberActorCountByFlightId.get(assignment.actor.flightId) ?? 1;
                const pairIndex = Math.floor(assignment.actor.formationIndex / 2);
                const pairCount = Math.ceil(actorCount / 2);
                const sideSign = assignment.actor.formationIndex % 2 === 0 ? -1 : 1;
                const pairSlot = pairIndex - (pairCount - 1) / 2;
                const actorSlot = assignment.actor.formationIndex - (actorCount - 1) / 2;
                const packageLateralOffsetPx = packageSlot * 150;
                const actorLateralOffsetPx = actorCount <= 1
                    ? 0
                    : actorSlot * (actorCount === 2 ? 120 : 110);
                const lateralReleaseOffsetPx = packageLateralOffsetPx + actorLateralOffsetPx;
                const packageAlongOffsetPx = packageSlot * 18;
                const actorAlongOffsetPx = actorCount <= 1
                    ? 0
                    : pairSlot * 44 + sideSign * 5;
                const targetForward = normalizeVector(releaseBase.cx - preparedStart.cx, releaseBase.cy - preparedStart.cy, sourcePlan?.attackForward.x ?? targetRunPackageForward.x, sourcePlan?.attackForward.y ?? targetRunPackageForward.y);
                const packageForwardAlignment = targetRunPackageForward.x * targetForward.x
                    + targetRunPackageForward.y * targetForward.y;
                const releaseForward = packageForwardAlignment > 0.25
                    ? targetRunPackageForward
                    : targetForward;
                const releaseNormal = { x: -releaseForward.y, y: releaseForward.x };
                const releasePoint = {
                    cx: releaseBase.cx
                        + releaseForward.x * (packageAlongOffsetPx + actorAlongOffsetPx)
                        + releaseNormal.x * lateralReleaseOffsetPx,
                    cy: releaseBase.cy
                        + releaseForward.y * (packageAlongOffsetPx + actorAlongOffsetPx)
                        + releaseNormal.y * lateralReleaseOffsetPx
                };
                const targetRunOvershootLimitPx = 112;
                const exitPoint = {
                    cx: releasePoint.cx + releaseForward.x * targetRunOvershootLimitPx,
                    cy: releasePoint.cy + releaseForward.y * targetRunOvershootLimitPx
                };
                const releaseDistancePx = Math.hypot(releasePoint.cx - preparedStart.cx, releasePoint.cy - preparedStart.cy);
                const previousActorMotion = resolvePreviousActorSampledBoundaryVector(assignment.actor.id, 420);
                const inheritedForward = previousActorMotion
                    ? normalizeVector(previousActorMotion.dx, previousActorMotion.dy, targetForward.x, targetForward.y)
                    : null;
                const inheritedAlignment = inheritedForward
                    ? inheritedForward.x * targetForward.x + inheritedForward.y * targetForward.y
                    : 1;
                const entryForward = inheritedForward && inheritedAlignment > -0.15
                    ? inheritedForward
                    : targetForward;
                const entryCommitDistancePx = Math.min(host.clamp(releaseDistancePx * 0.28, 18, 72), Math.max(8, releaseDistancePx * 0.55));
                const entryCommitPoint = {
                    cx: preparedStart.cx + entryForward.x * entryCommitDistancePx,
                    cy: preparedStart.cy + entryForward.y * entryCommitDistancePx
                };
                const finalTargetRunPoints = dedupePath([preparedStart, entryCommitPoint, releasePoint, exitPoint]);
                return {
                    ...assignment,
                    points: finalTargetRunPoints,
                    progressTimeline: undefined
                };
            });
        };
        let targetRunDurationMs = seedTargetRunDurationMs;
        let targetRunAssignments = buildTargetRunPhaseAssignments(targetRunDurationMs);
        const bomberTargetRunAssignments = targetRunAssignments.filter((assignment) => assignment.actor.role === "bomber");
        const bomberTargetRunPathLengthsPx = bomberTargetRunAssignments.map((assignment) => host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, targetRunDurationMs));
        const meanBomberTargetRunPathLengthPx = bomberTargetRunPathLengthsPx.length > 0
            ? bomberTargetRunPathLengthsPx.reduce((sum, pathLengthPx) => sum + pathLengthPx, 0)
                / bomberTargetRunPathLengthsPx.length
            : 0;
        const maxBomberTargetRunPathLengthPx = bomberTargetRunPathLengthsPx.length > 0
            ? Math.max(...bomberTargetRunPathLengthsPx)
            : 0;
        const meanBomberTargetRunDurationMs = meanBomberTargetRunPathLengthPx > 0
            ? meanBomberTargetRunPathLengthPx / governedBomberSpeedPxPerMs
            : targetRunDurationMs;
        const maxBomberTargetRunDurationMs = maxBomberTargetRunPathLengthPx > 0
            ? maxBomberTargetRunPathLengthPx / governedBomberSpeedPxPerMs
            : targetRunDurationMs;
        // Use the longest bomber lane as the phase clock, then pad shorter lanes with
        // straight-through overshoot so every sprite can keep bomber px/ms speed.
        const governedTargetRunDurationMs = host.clamp(Math.round(maxBomberTargetRunDurationMs || meanBomberTargetRunDurationMs), 1, 60000);
        if (Math.abs(governedTargetRunDurationMs - targetRunDurationMs) > 1) {
            targetRunDurationMs = governedTargetRunDurationMs;
            targetRunAssignments = buildTargetRunPhaseAssignments(targetRunDurationMs);
        }
        targetRunAssignments = targetRunAssignments.map((assignment) => {
            if (assignment.actor.role !== "bomber") {
                return assignment;
            }
            const targetRunExpectedPathLengthPx = targetRunDurationMs * governedBomberSpeedPxPerMs;
            const currentPathLengthPx = host.resolveAirShowAssignmentTraversedPathLengthPx(assignment, targetRunDurationMs);
            const pathLengthDeficitPx = targetRunExpectedPathLengthPx - currentPathLengthPx;
            let adjustedAssignment = assignment;
            if (pathLengthDeficitPx > 8 && assignment.points.length >= 2) {
                const endPoint = assignment.points[assignment.points.length - 1];
                const previousPoint = assignment.points[assignment.points.length - 2];
                const extensionForward = normalizeVector(endPoint.cx - previousPoint.cx, endPoint.cy - previousPoint.cy, targetRunPackageForward.x, targetRunPackageForward.y);
                adjustedAssignment = {
                    ...assignment,
                    points: dedupePath([
                        ...assignment.points,
                        host.offsetAirShowPoint(endPoint, extensionForward.x * pathLengthDeficitPx, extensionForward.y * pathLengthDeficitPx)
                    ])
                };
            }
            return {
                ...adjustedAssignment,
                progressTimeline: buildRenderedChordPacedTimeline(adjustedAssignment, targetRunDurationMs, 33)
            };
        });
        recordPhase("target-run", targetRunAssignments, targetRunDurationMs, [], resolveContinuousFlakBursts(targetRunAssignments, targetRunDurationMs, "target"), roleSpeeds);
        commitCorridorPhaseEndState(targetRunAssignments, targetRunDurationMs);
        previousPhaseAssignments = targetRunAssignments;
        previousPhaseDurationMs = targetRunDurationMs;
        updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        bomberFlights.forEach((flight) => host.syncAirShowFlightStrengthForInspection(flight, resolvePostTargetRunBomberStrength(flight)));
        const egressFighterFlights = [...activeFlights(interceptorFlights), ...activeFlights(escortFlights)];
        const egressFighterAssignments = egressFighterFlights.flatMap((flight, index) => {
            const current = host.averageAirShowPosition(flight.actors) ?? flight.anchor;
            const headingDegrees = host.resolveAirShowFlightHeadingDegrees(flight);
            const outwardFallback = normalizeVector(current.cx - center.cx, current.cy - center.cy, corridor.axis.x, corridor.axis.y);
            const forward = resolveHeadingVector(headingDegrees, outwardFallback);
            const boundary = mapBounds
                ? resolveAirShowBoundsRayIntersection(current, forward, mapBounds)
                : null;
            const lateral = { x: -forward.y, y: forward.x };
            const formationOffsetPx = (index - (egressFighterFlights.length - 1) / 2) * 34;
            const home = boundary
                ? host.offsetAirShowPoint(boundary, forward.x * host.offMapDistancePx + lateral.x * formationOffsetPx, forward.y * host.offMapDistancePx + lateral.y * formationOffsetPx)
                : host.offsetAirShowPoint(current, forward.x * (host.offMapDistancePx + 520) + lateral.x * formationOffsetPx, forward.y * (host.offMapDistancePx + 520) + lateral.y * formationOffsetPx);
            return buildAssignmentsForFlightPath(flight, host.sanitizeAirShowEntryPath(host.buildAirShowDisengagePath(current, home, {
                startHeadingDegrees: headingDegrees,
                lateralSign: flight.spec.role === "interceptor" ? -1 : 1,
                corridorWidthPx: 18,
                driftPx: 10,
                preferForwardContinuous: true
            }), {
                maxTurnDeg: 42,
                strongTurnDeg: 78,
                maxFirstSegmentPx: 82,
                maxSharpTurnDeg: 104,
                maxWaypointsToRemove: 2
            }), 0.26);
        });
        const rawEgressAssignments = [...buildBomberEgressAssignments(activeFlights(bomberFlights)), ...egressFighterAssignments];
        const preserveBomberEgressEntryMotion = (assignments) => assignments.map((assignment) => {
            if (assignment.actor.role !== "bomber" || assignment.points.length < 2) {
                return assignment;
            }
            const boundaryMotion = resolvePreviousActorSampledBoundaryVector(assignment.actor.id);
            if (!boundaryMotion) {
                return assignment;
            }
            const finalPoint = assignment.points[assignment.points.length - 1];
            if (!finalPoint) {
                return assignment;
            }
            const entryForward = normalizeVector(boundaryMotion.dx, boundaryMotion.dy, finalPoint.cx - boundaryMotion.start.cx, finalPoint.cy - boundaryMotion.start.cy);
            const entryHeadingDegrees = ((Math.atan2(entryForward.y, entryForward.x) * 180) / Math.PI + 90 + 360) % 360;
            const lateralSign = host.resolveAirShowRouteSideSign(boundaryMotion.start, finalPoint, entryHeadingDegrees, 1);
            const distancePx = Math.max(1, Math.hypot(finalPoint.cx - boundaryMotion.start.cx, finalPoint.cy - boundaryMotion.start.cy));
            const carryForwardPx = host.clamp(distancePx * 0.22, 72, 150);
            const entryCarryPoint = host.offsetAirShowPoint(boundaryMotion.start, entryForward.x * carryForwardPx, entryForward.y * carryForwardPx);
            const tailPath = buildForwardContinuousRoutePath(entryCarryPoint, finalPoint, {
                startHeadingDegrees: entryHeadingDegrees,
                lateralSign,
                minRouteDot: -0.72,
                carryForwardPx: host.clamp(distancePx * 0.14, 58, 132),
                earlyAlongPx: Math.max(carryForwardPx + 72, distancePx * 0.34),
                midAlongPx: Math.max(carryForwardPx + 154, distancePx * 0.58),
                lateAlongPx: Math.max(carryForwardPx + 226, distancePx * 0.84),
                entryLateralPx: 6,
                midLateralPx: 6,
                lateLateralPx: 4
            });
            const preservedPoints = [boundaryMotion.start, entryCarryPoint, ...tailPath.slice(1)]
                .filter((point, pointIndex, path) => {
                if (pointIndex === 0) {
                    return true;
                }
                const previous = path[pointIndex - 1];
                return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5;
            });
            return {
                ...assignment,
                points: host.sanitizeAirShowEntryPath(roundPathCorners(preservedPoints, 72, 10), {
                    maxTurnDeg: 42,
                    strongTurnDeg: 82,
                    maxFirstSegmentPx: 96,
                    maxSharpTurnDeg: 104,
                    maxWaypointsToRemove: 4
                })
            };
        });
        const resolveGovernedEgressDurationMs = (assignments, seedDurationMs) => {
            const resolvedDurationMs = host.resolveAirShowPhaseDurationFromRoleSpeeds(assignments, roleSpeeds, seedDurationMs, 1, 60000);
            const referenceTargetRunDurationMs = Math.max(1, targetRunDurationMs);
            const minimumDurationMs = Math.max(2800, Math.round(referenceTargetRunDurationMs * 0.42));
            const maximumDurationMs = Math.max(minimumDurationMs + 1600, Math.min(12000, Math.round(referenceTargetRunDurationMs * 1.12)));
            return host.clamp(resolvedDurationMs, minimumDurationMs, maximumDurationMs);
        };
        if (rawEgressAssignments.length > 0) {
            let egressDurationMs = resolveGovernedEgressDurationMs(rawEgressAssignments, targetRunDurationMs);
            let egressAssignments = host.prepareAirShowPhaseAssignments(host.extendAirShowPhaseAssignmentsForSpeed(rawEgressAssignments, egressDurationMs, roleSpeeds, {
                clampCenter: corridor.strike,
                orbitSignByRole: {
                    interceptor: -1,
                    escort: 1,
                    bomber: 1
                },
                extendAtByRole: {
                    interceptor: "end",
                    escort: "end",
                    bomber: "end"
                },
                maxHorizontalPx: 560,
                maxVerticalPx: 380,
                extensionMode: "carry"
            }), egressDurationMs, [0.2, 0.5, 0.8], 44, roleSpeeds, {
                previousAssignments: previousPhaseAssignments,
                previousDurationMs: previousPhaseDurationMs,
                entryTurnLimitDeg: 60,
                softenEntryRoles: ["bomber", "interceptor", "escort"],
                softenEntryTurnLimitDeg: 72,
                softenEntryWaypointCount: 18,
                softenExitRoles: ["bomber", "interceptor", "escort"],
                softenExitTurnLimitDeg: 84,
                softenExitWaypointCount: 12,
                sanitizeEntryTurns: true,
                sanitizeEntryTurnLimitDeg: 42,
                sanitizeEntryStrongTurnDeg: 84,
                sanitizeEntryMaxFirstSegmentPx: 92,
                sanitizeEntryMaxSharpTurnDeg: 96,
                sanitizeEntryMaxWaypointsToRemove: 5
            });
            egressAssignments = host.extendAirShowPhaseAssignmentsForSpeed(egressAssignments, egressDurationMs, roleSpeeds, {
                clampCenter: corridor.strike,
                orbitSignByRole: {
                    interceptor: -1,
                    escort: 1,
                    bomber: 1
                },
                extendAtByRole: {
                    interceptor: "end",
                    escort: "end",
                    bomber: "end"
                },
                maxHorizontalPx: 560,
                maxVerticalPx: 380,
                extensionMode: "carry"
            });
            egressDurationMs = resolveGovernedEgressDurationMs(egressAssignments, egressDurationMs);
            egressAssignments = host.prepareAirShowPhaseAssignments(host.extendAirShowPhaseAssignmentsForSpeed(egressAssignments, egressDurationMs, roleSpeeds, {
                clampCenter: corridor.strike,
                orbitSignByRole: {
                    interceptor: -1,
                    escort: 1,
                    bomber: 1
                },
                extendAtByRole: {
                    interceptor: "end",
                    escort: "end",
                    bomber: "end"
                },
                maxHorizontalPx: 560,
                maxVerticalPx: 380,
                extensionMode: "carry"
            }), egressDurationMs, [0.2, 0.5, 0.8], 44, roleSpeeds, {
                previousAssignments: previousPhaseAssignments,
                previousDurationMs: previousPhaseDurationMs,
                entryTurnLimitDeg: 60,
                softenEntryRoles: ["bomber", "interceptor", "escort"],
                softenEntryTurnLimitDeg: 72,
                softenEntryWaypointCount: 18,
                softenExitRoles: ["bomber", "interceptor", "escort"],
                softenExitTurnLimitDeg: 84,
                softenExitWaypointCount: 12,
                sanitizeEntryTurns: true,
                sanitizeEntryTurnLimitDeg: 42,
                sanitizeEntryStrongTurnDeg: 84,
                sanitizeEntryMaxFirstSegmentPx: 92,
                sanitizeEntryMaxSharpTurnDeg: 96,
                sanitizeEntryMaxWaypointsToRemove: 5
            });
            egressAssignments = host.extendAirShowPhaseAssignmentsForSpeed(egressAssignments, egressDurationMs, roleSpeeds, {
                clampCenter: corridor.strike,
                orbitSignByRole: {
                    interceptor: -1,
                    escort: 1,
                    bomber: 1
                },
                extendAtByRole: {
                    interceptor: "end",
                    escort: "end",
                    bomber: "end"
                },
                maxHorizontalPx: 560,
                maxVerticalPx: 380,
                extensionMode: "carry"
            });
            const buildHomeSideFighterEgressAssignment = (assignment) => {
                if (assignment.actor.role !== "interceptor"
                    && assignment.actor.role !== "escort") {
                    return assignment;
                }
                const start = assignment.points[0] ?? assignment.actor.position;
                const rawSecond = assignment.points[1] ?? start;
                const rawEnd = assignment.points[assignment.points.length - 1] ?? rawSecond;
                const renderedOffsetPx = assignment.multiFlightOffsetPx ?? 0;
                const laneOffsetPx = (assignment.actor.formationIndex - 0.5) * 28;
                const sideSign = resolveFighterHomeSideSign(assignment);
                const fallbackForward = resolveHeadingVector(assignment.actor.headingDegrees, {
                    x: rawEnd.cx - start.cx,
                    y: rawEnd.cy - start.cy
                });
                const entryForward = normalizeVector(rawSecond.cx - start.cx, rawSecond.cy - start.cy, fallbackForward.x, fallbackForward.y);
                const targetLengthPx = egressDurationMs * (roleSpeeds.get(assignment.actor.role) ?? host.airShowFighterSpeedPxPerMs);
                const isCarryingAwayFromHome = entryForward.x * sideSign < -0.12;
                const entryControlDistancePx = isCarryingAwayFromHome
                    ? host.clamp(targetLengthPx * 0.04, 72, 168)
                    : host.clamp(targetLengthPx * 0.08, 156, 360);
                const boundaryExitX = visibleBounds
                    ? (sideSign < 0
                        ? visibleBounds.minX - host.offMapDistancePx * 0.86 - Math.abs(laneOffsetPx)
                        : visibleBounds.maxX + host.offMapDistancePx * 0.86 + Math.abs(laneOffsetPx))
                    : homeSideMidX + sideSign * (homeSideVisibleWidthPx * 0.9 + host.offMapDistancePx);
                const renderedStartX = start.cx + renderedOffsetPx;
                const minimumForwardExitX = renderedStartX + sideSign * Math.max(180, homeSideVisibleWidthPx * 0.18);
                const offMapExitX = sideSign < 0
                    ? Math.min(boundaryExitX, minimumForwardExitX)
                    : Math.max(boundaryExitX, minimumForwardExitX);
                const exitPoint = {
                    cx: offMapExitX - renderedOffsetPx,
                    cy: rawEnd.cy
                };
                const routeForward = normalizeVector(exitPoint.cx - start.cx, exitPoint.cy - start.cy, sideSign, 0);
                const routeNormal = { x: -routeForward.y, y: routeForward.x };
                const entryRouteDot = entryForward.x * routeForward.x + entryForward.y * routeForward.y;
                const reverseHomeTurn = entryRouteDot < -0.18;
                const turnSideSign = assignment.actor.formationIndex % 2 === 0
                    ? -1
                    : 1;
                const reverseBreakawayForward = normalizeVector(entryForward.x * 0.28 + routeForward.x * 0.72, entryForward.y * 0.28 + routeForward.y * 0.72, routeForward.x, routeForward.y);
                const reverseTurnNormal = {
                    x: routeNormal.x * turnSideSign,
                    y: routeNormal.y * turnSideSign
                };
                const exitControlDistancePx = host.clamp(targetLengthPx * 0.14, 260, 680);
                const reverseTurnLateralPx = host.clamp(targetLengthPx * 0.2 + Math.abs(laneOffsetPx), 132, 280);
                const reverseEntryControlDistancePx = host.clamp(targetLengthPx * 0.24, 184, 360);
                const firstControl = reverseHomeTurn
                    ? {
                        cx: start.cx
                            + reverseBreakawayForward.x * reverseEntryControlDistancePx
                            + reverseTurnNormal.x * reverseTurnLateralPx * 0.38,
                        cy: start.cy
                            + reverseBreakawayForward.y * reverseEntryControlDistancePx
                            + reverseTurnNormal.y * reverseTurnLateralPx * 0.38
                    }
                    : {
                        cx: start.cx + entryForward.x * entryControlDistancePx + routeNormal.x * laneOffsetPx * 0.12,
                        cy: start.cy + entryForward.y * entryControlDistancePx + routeNormal.y * laneOffsetPx * 0.12
                    };
                const secondControl = reverseHomeTurn
                    ? {
                        cx: exitPoint.cx
                            - routeForward.x * exitControlDistancePx
                            + reverseTurnNormal.x * reverseTurnLateralPx * 0.46,
                        cy: exitPoint.cy
                            - routeForward.y * exitControlDistancePx
                            + reverseTurnNormal.y * reverseTurnLateralPx * 0.46
                    }
                    : {
                        cx: exitPoint.cx - routeForward.x * exitControlDistancePx + routeNormal.x * laneOffsetPx * 0.42,
                        cy: exitPoint.cy - routeForward.y * exitControlDistancePx + routeNormal.y * laneOffsetPx * 0.42
                    };
                const rebuiltPoints = buildCubicAirShowPath(start, firstControl, secondControl, exitPoint, 32);
                return {
                    ...assignment,
                    points: host.sanitizeAirShowEntryPath(rebuiltPoints, {
                        maxTurnDeg: 42,
                        strongTurnDeg: 78,
                        maxFirstSegmentPx: 128,
                        maxSharpTurnDeg: 96,
                        maxWaypointsToRemove: 4
                    }),
                    progressTimeline: undefined
                };
            };
            egressAssignments = preserveBomberEgressEntryMotion(egressAssignments).map((assignment) => buildHomeSideFighterEgressAssignment(assignment));
            egressDurationMs = resolveGovernedEgressDurationMs(egressAssignments, egressDurationMs);
            const resolveEgressCarrySign = (assignment) => {
                const start = assignment.points[0] ?? assignment.actor.position;
                const end = assignment.points[assignment.points.length - 1] ?? start;
                const dx = end.cx - start.cx;
                if (Math.abs(dx) > 0.001) {
                    return dx >= 0 ? 1 : -1;
                }
                if (assignment.actor.role === "escort") {
                    return -1;
                }
                if (assignment.actor.role === "interceptor") {
                    return 1;
                }
                const ownerFlight = flightMap.get(assignment.actor.flightId);
                return ownerFlight?.spec.faction === "Bot" ? 1 : -1;
            };
            egressAssignments = egressAssignments.map((assignment) => matchAssignmentPathLength(assignment, egressDurationMs, resolveEgressCarrySign(assignment)));
            recordPhase("egress", egressAssignments, egressDurationMs, [], [], roleSpeeds);
            commitCorridorPhaseEndState(egressAssignments, egressDurationMs);
            previousPhaseAssignments = egressAssignments;
            previousPhaseDurationMs = egressDurationMs;
            updateFlightAnchors([...bomberFlights, ...interceptorFlights, ...escortFlights]);
        }
        return buildPlannedAirShowSceneReport();
    };
    // Single-orchestrator policy: corridor choreography is the only planner path.
    // No fallback planner path is retained below this return.
    return buildCorridorContestedAirShowPlan();
}
