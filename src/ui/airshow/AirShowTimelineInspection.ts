import {
  buildAirShowPhaseTimingAudit,
  type AirShowInspectionOriginPlan,
  type AirShowPhaseTimingSample,
  type AirShowPlannerRole
} from "./AirShowPlanner";
import type {
  AirShowInspectionFlakBurst,
  AirShowInspectionSampledPosition,
  PlannedAirShowFlight,
  PlannedAirShowPhase,
  PlannedAirShowScene,
  PlannedAirShowTracer
} from "./AirShowPlaybackScene";
import {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS,
  sampleAirShowTimelineTrack,
  type AirShowTimeline,
  type AirShowTimelineActor,
  type AirShowTimelineBeat,
  type AirShowTimelineTrack
} from "./AirShowTimeline";

type TimelineActorLookup = ReadonlyMap<string, AirShowTimelineActor>;
type TimelineTrackLookup = ReadonlyMap<string, AirShowTimelineTrack>;

function clonePoint(point: { readonly cx: number; readonly cy: number }): { cx: number; cy: number } {
  return { cx: point.cx, cy: point.cy };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneOriginPlan(originPlan: AirShowInspectionOriginPlan): AirShowInspectionOriginPlan {
  return {
    offsetPx: originPlan.offsetPx,
    axis: clonePoint(originPlan.axis),
    mapBounds: { ...originPlan.mapBounds },
    playerBoundary: clonePoint(originPlan.playerBoundary),
    botBoundary: clonePoint(originPlan.botBoundary),
    playerOrigin: clonePoint(originPlan.playerOrigin),
    botOrigin: clonePoint(originPlan.botOrigin)
  };
}

export function sampleTimelineTrackForInspectionBeat(
  track: AirShowTimelineTrack,
  beat: AirShowTimelineBeat,
  sampleCount = 16
): AirShowInspectionSampledPosition[] {
  const durationMs = Math.max(1, beat.endTimeMs - beat.startTimeMs);
  const resolvedSampleCount = Math.max(2, sampleCount);
  return Array.from({ length: resolvedSampleCount + 1 }, (_, index) => {
    const progress = index / resolvedSampleCount;
    const absoluteTimeMs = beat.startTimeMs + durationMs * progress;
    const sample = sampleAirShowTimelineTrack(track, absoluteTimeMs);
    return {
      timeMs: durationMs * progress,
      progress,
      pathProgress: sample?.segmentProgress ?? progress,
      cx: sample?.point.cx ?? 0,
      cy: sample?.point.cy ?? 0,
      headingDegrees: sample?.headingDegrees ?? 0
    };
  });
}

function projectTimelineFlights(
  timeline: AirShowTimeline,
  actorsById: TimelineActorLookup,
  tracksByActorId: TimelineTrackLookup
): PlannedAirShowFlight[] {
  return timeline.flights.map((flight) => ({
    id: flight.id,
    role: flight.role,
    combatRole: flight.combatRole,
    faction: flight.faction,
    scenarioType: flight.scenarioType,
    originHexKey: flight.originHexKey,
    strengthBefore: flight.strengthBefore,
    strengthAfterEscortPhase: flight.strengthAfterEscortPhase,
    finalStrength: flight.finalStrength,
    laneOffsetPx: flight.laneOffsetPx,
    actors: flight.actorIds.flatMap((actorId) => {
      const actor = actorsById.get(actorId);
      const track = tracksByActorId.get(actorId);
      const sample = track ? sampleAirShowTimelineTrack(track, track.visibleFromMs) : null;
      if (!actor || !track || !sample) {
        return [];
      }
      return [{
        actorId,
        flightId: flight.id,
        role: flight.role,
        active: true,
        headingDegrees: sample.headingDegrees,
        position: clonePoint(sample.point),
        size: actor.size,
        formationIndex: actor.formationIndex,
        biasX: 0,
        biasY: 0
      }];
    })
  }));
}

function projectPhaseAssignments(
  timeline: AirShowTimeline,
  beat: AirShowTimelineBeat
): PlannedAirShowPhase["assignments"] {
  return timeline.tracks
    .filter((track) => track.segments.some((segment) => segment.label === beat.label))
    .map((track) => {
      const segments = track.segments.filter((segment) => segment.label === beat.label);
      const points = segments.flatMap((segment, segmentIndex) => {
        const phasePoints = segmentIndex === 0 ? segment.points : segment.points.slice(1);
        return phasePoints.map(clonePoint);
      });
      return {
        actorId: track.actorId,
        flightId: track.flightId,
        role: track.role,
        points,
        sampledPositions: sampleTimelineTrackForInspectionBeat(track, beat)
      };
    });
}

function projectPhaseTracers(
  timeline: AirShowTimeline,
  beat: AirShowTimelineBeat,
  tracksByActorId: TimelineTrackLookup,
  durationMs: number
): PlannedAirShowTracer[] {
  return timeline.cues.flatMap((cue) => {
    if (cue.kind !== "tracer" || cue.timeMs < beat.startTimeMs || cue.timeMs > beat.endTimeMs) {
      return [];
    }
    const sourceTrack = tracksByActorId.get(cue.sourceActorId);
    const targetTrack = tracksByActorId.get(cue.targetActorId);
    const source = sourceTrack ? sampleAirShowTimelineTrack(sourceTrack, cue.timeMs) : null;
    const target = targetTrack ? sampleAirShowTimelineTrack(targetTrack, cue.timeMs) : null;
    if (!source || !target) {
      return [];
    }
    return [{
      progress: clamp((cue.timeMs - beat.startTimeMs) / durationMs, 0, 1),
      sourceActorId: cue.sourceActorId,
      targetActorId: cue.targetActorId,
      emitter: cue.emitter,
      emitterPoint: clonePoint(source.point),
      sourceHeadingDegrees: source.headingDegrees,
      width: cue.width,
      lifetimeMs: cue.lifetimeMs,
      streakLengthPx: Math.hypot(target.point.cx - source.point.cx, target.point.cy - source.point.cy),
      visibleLengthPx: cue.visibleLengthPx,
      fanHalfAngleDeg: 0,
      centerlineEndPoint: clonePoint(target.point),
      color: cue.color,
      burstCount: 1,
      spreadPx: 0
    }];
  });
}

function projectPhaseFlakBursts(
  timeline: AirShowTimeline,
  beat: AirShowTimelineBeat,
  actorsById: TimelineActorLookup,
  tracksByActorId: TimelineTrackLookup,
  durationMs: number
): AirShowInspectionFlakBurst[] {
  return timeline.cues.flatMap((cue): AirShowInspectionFlakBurst[] => {
    if (cue.kind !== "flak" || cue.timeMs < beat.startTimeMs || cue.timeMs > beat.endTimeMs) {
      return [];
    }
    const bomberTrack = tracksByActorId.get(cue.bomberActorId);
    const bomberSample = bomberTrack ? sampleAirShowTimelineTrack(bomberTrack, cue.timeMs) : null;
    return [{
      progress: clamp((cue.timeMs - beat.startTimeMs) / durationMs, 0, 1),
      bomberUnitKey: actorsById.get(cue.bomberActorId)?.flightId ?? cue.bomberActorId,
      targetHexKey: null,
      batteryHexKey: cue.batteryHexKey,
      sampledBomberCenter: bomberSample ? clonePoint(bomberSample.point) : undefined,
      rangeReferenceCenter: clonePoint(timeline.geometry.target),
      targetCenter: clonePoint(bomberSample?.point ?? timeline.geometry.target),
      targetSource: "bomberPath",
      burstCenter: clonePoint(cue.point),
      flashCount: 1,
      puffCount: 1,
      smokePuffCount: 2,
      scale: cue.scale,
      smokeScale: cue.smokeScale,
      widthPx: 0,
      heightPx: 0,
      points: [clonePoint(cue.point)]
    }];
  });
}

function projectTimelinePhase(
  timeline: AirShowTimeline,
  beat: AirShowTimelineBeat,
  actorsById: TimelineActorLookup,
  tracksByActorId: TimelineTrackLookup
): PlannedAirShowPhase {
  const durationMs = Math.max(1, beat.endTimeMs - beat.startTimeMs);
  return {
    label: beat.label,
    startTimeMs: beat.startTimeMs,
    endTimeMs: beat.endTimeMs,
    durationMs,
    visibleActorIds: timeline.tracks
      .filter((track) => track.visibleFromMs <= beat.endTimeMs && track.visibleUntilMs >= beat.startTimeMs)
      .map((track) => track.actorId),
    assignments: projectPhaseAssignments(timeline, beat),
    tracers: projectPhaseTracers(timeline, beat, tracksByActorId, durationMs),
    flakBursts: projectPhaseFlakBursts(timeline, beat, actorsById, tracksByActorId, durationMs)
  };
}

function collectPhaseTimingSamples(
  timeline: AirShowTimeline,
  beat: AirShowTimelineBeat
): AirShowPhaseTimingSample[] {
  return timeline.tracks.flatMap((track) => {
    const segments = track.segments.filter((segment) => segment.label === beat.label);
    if (segments.length === 0) {
      return [];
    }
    return [{
      role: track.role,
      pathLengthPx: segments.reduce((sum, segment) => sum + segment.lengthPx, 0),
      activeDurationMs: segments.reduce(
        (sum, segment) => sum + segment.endTimeMs - segment.startTimeMs,
        0
      )
    }];
  });
}

function projectTimelineTimingAudit(timeline: AirShowTimeline): PlannedAirShowScene["phaseTimingAudit"] {
  const roleSpeeds = new Map<AirShowPlannerRole, number>([
    ["interceptor", AIR_SHOW_FIGHTER_SPEED_PX_PER_MS],
    ["escort", AIR_SHOW_FIGHTER_SPEED_PX_PER_MS],
    ["bomber", AIR_SHOW_BOMBER_SPEED_PX_PER_MS]
  ]);
  return timeline.beats.map((beat) => buildAirShowPhaseTimingAudit(
    beat.label,
    Math.max(1, beat.endTimeMs - beat.startTimeMs),
    collectPhaseTimingSamples(timeline, beat),
    roleSpeeds
  ));
}

export function describeAirShowTimeline(timeline: AirShowTimeline): PlannedAirShowScene {
  const actorsById = new Map(timeline.actors.map((actor) => [actor.actorId, actor] as const));
  const tracksByActorId = new Map(timeline.tracks.map((track) => [track.actorId, track] as const));
  return {
    timelineVersion: 2,
    timelineScenario: timeline.scenario,
    timelineTotalDurationMs: timeline.totalDurationMs,
    timelineFindings: timeline.verification.findings.map((finding) => ({ ...finding })),
    hexKey: timeline.sceneId,
    center: clonePoint(timeline.geometry.engagement),
    corridor: {
      center: clonePoint(timeline.geometry.engagement),
      entry: clonePoint(timeline.geometry.attackOrigin),
      merge: clonePoint(timeline.geometry.merge),
      strike: clonePoint(timeline.geometry.target),
      exit: clonePoint(timeline.geometry.defenseOrigin)
    },
    hqMidX: (timeline.geometry.playerHq.cx + timeline.geometry.botHq.cx) * 0.5,
    bomberTarget: clonePoint(timeline.geometry.target),
    originPlan: cloneOriginPlan(timeline.originPlan),
    phaseTimingAudit: projectTimelineTimingAudit(timeline),
    flights: projectTimelineFlights(timeline, actorsById, tracksByActorId),
    phases: timeline.beats.map((beat) => projectTimelinePhase(
      timeline,
      beat,
      actorsById,
      tracksByActorId
    ))
  };
}
