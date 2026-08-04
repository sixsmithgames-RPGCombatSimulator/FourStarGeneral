import type {
  AirShowCombatRole,
  AirShowFlightRole,
  AirShowPoint,
  SpriteRenderFaction
} from "./AirShowPlaybackScene";
import type {
  AirShowInspectionOriginPlan,
  AirShowMapBounds
} from "./AirShowPlanner";

export const AIR_SHOW_FIGHTER_SPEED_PX_PER_MS = 0.115;
export const AIR_SHOW_BOMBER_SPEED_PX_PER_MS = 0.0575;
export const AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS = 100;
export const AIR_SHOW_FIGHTER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE = 67;
export const AIR_SHOW_BOMBER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE = 32;

export type AirShowScenarioFamily =
  | "strike-only"
  | "escorted-strike"
  | "intercepted-strike"
  | "cap-clash"
  | "full-engagement";

export type AirShowBeatLabel =
  | "fighter-ingress"
  | "escort-clash-merge"
  | "escort-clash-scramble"
  | "bomber-ingress"
  | "bomber-defense-pass"
  | "target-run"
  | "egress";

export interface AirShowTimelineGeometry {
  readonly mapBounds: AirShowMapBounds;
  readonly playerHq: AirShowPoint;
  readonly botHq: AirShowPoint;
  readonly playerOrigin: AirShowPoint;
  readonly botOrigin: AirShowPoint;
  readonly attackOrigin: AirShowPoint;
  readonly defenseOrigin: AirShowPoint;
  readonly engagement: AirShowPoint;
  readonly target: AirShowPoint;
  readonly merge: AirShowPoint;
  readonly defenseIntercept: AirShowPoint;
  readonly release: AirShowPoint;
  readonly axis: { readonly x: number; readonly y: number };
  readonly normal: { readonly x: number; readonly y: number };
}

export interface AirShowTimelineActor {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: AirShowFlightRole;
  readonly combatRole?: AirShowCombatRole;
  readonly scenarioType: string;
  readonly faction?: SpriteRenderFaction;
  readonly formationIndex: number;
  readonly size: number;
  readonly laneOffsetPx: number;
  readonly initialStrength: number;
  readonly finalStrength: number;
}

export interface AirShowTimelineFlight {
  readonly id: string;
  readonly role: AirShowFlightRole;
  readonly combatRole?: AirShowCombatRole;
  readonly faction?: SpriteRenderFaction;
  readonly scenarioType: string;
  readonly originHexKey?: string | null;
  readonly strengthBefore: number;
  readonly strengthAfterEscortPhase?: number;
  readonly finalStrength?: number;
  readonly laneOffsetPx?: number;
  readonly actorIds: ReadonlyArray<string>;
}

export interface AirShowTimelineSegment {
  readonly label: AirShowBeatLabel;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly speedPxPerMs: number;
  readonly lengthPx: number;
  readonly points: ReadonlyArray<AirShowPoint>;
}

export interface AirShowTimelineTrack {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: AirShowFlightRole;
  readonly visibleFromMs: number;
  readonly visibleUntilMs: number;
  readonly segments: ReadonlyArray<AirShowTimelineSegment>;
}

export interface AirShowTimelineBeat {
  readonly label: AirShowBeatLabel;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

interface AirShowTimelineCueBase {
  readonly timeMs: number;
}

export interface AirShowTracerCue extends AirShowTimelineCueBase {
  readonly kind: "tracer";
  readonly sourceActorId: string;
  readonly targetActorId: string;
  readonly emitter: "nose" | "center";
  readonly color: string;
  readonly width: number;
  readonly lifetimeMs: number;
  readonly visibleLengthPx: number;
}

export interface AirShowFlakCue extends AirShowTimelineCueBase {
  readonly kind: "flak";
  readonly bomberActorId: string;
  readonly batteryHexKey?: string | null;
  readonly point: AirShowPoint;
  readonly scale: number;
  readonly smokeScale: number;
  readonly lingerMs: number;
}

export interface AirShowBombReleaseCue extends AirShowTimelineCueBase {
  readonly kind: "bomb-release";
  readonly bomberActorId: string;
  readonly targetHexKey?: string | null;
  readonly point: AirShowPoint;
}

export interface AirShowImpactCue extends AirShowTimelineCueBase {
  readonly kind: "impact";
  readonly targetHexKey?: string | null;
  readonly point: AirShowPoint;
}

export interface AirShowDestructionCue extends AirShowTimelineCueBase {
  readonly kind: "destruction";
  readonly actorId: string;
}

export type AirShowTimelineCue =
  | AirShowTracerCue
  | AirShowFlakCue
  | AirShowBombReleaseCue
  | AirShowImpactCue
  | AirShowDestructionCue;

export type AirShowTimelineFindingSeverity = "error" | "warning";

export interface AirShowTimelineFinding {
  readonly severity: AirShowTimelineFindingSeverity;
  readonly code: string;
  readonly message: string;
  readonly actorId?: string;
  readonly label?: AirShowBeatLabel;
}

export interface AirShowTimelineVerification {
  readonly valid: boolean;
  readonly findings: ReadonlyArray<AirShowTimelineFinding>;
}

export interface AirShowTimeline {
  readonly version: 2;
  readonly sceneId: string;
  readonly seed: number;
  readonly scenario: AirShowScenarioFamily;
  readonly totalDurationMs: number;
  readonly geometry: AirShowTimelineGeometry;
  readonly originPlan: AirShowInspectionOriginPlan;
  readonly flights: ReadonlyArray<AirShowTimelineFlight>;
  readonly actors: ReadonlyArray<AirShowTimelineActor>;
  readonly tracks: ReadonlyArray<AirShowTimelineTrack>;
  readonly beats: ReadonlyArray<AirShowTimelineBeat>;
  readonly cues: ReadonlyArray<AirShowTimelineCue>;
  readonly verification: AirShowTimelineVerification;
}

export interface AirShowTimelineTrackSample {
  readonly point: AirShowPoint;
  readonly headingDegrees: number;
  readonly segment: AirShowTimelineSegment;
  readonly segmentProgress: number;
}

export function measureAirShowPath(points: ReadonlyArray<AirShowPoint>): number {
  let lengthPx = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    lengthPx += Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
  }
  return lengthPx;
}

export function resolveAirShowHeadingDegrees(
  dx: number,
  dy: number,
  fallbackDegrees = 0
): number {
  if (Math.hypot(dx, dy) < 0.0001) {
    return ((fallbackDegrees % 360) + 360) % 360;
  }
  const heading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  return ((heading % 360) + 360) % 360;
}

export function sampleAirShowPathByDistance(
  points: ReadonlyArray<AirShowPoint>,
  progress: number
): { readonly point: AirShowPoint; readonly headingDegrees: number } {
  const fallback = points[0] ?? { cx: 0, cy: 0 };
  if (points.length < 2) {
    return { point: fallback, headingDegrees: 0 };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const segmentLengths: number[] = [];
  let totalLengthPx = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const lengthPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
    segmentLengths.push(lengthPx);
    totalLengthPx += lengthPx;
  }

  if (totalLengthPx < 0.0001) {
    return { point: fallback, headingDegrees: 0 };
  }

  const targetDistancePx = totalLengthPx * clampedProgress;
  let traversedPx = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const lengthPx = segmentLengths[index]!;
    const start = points[index]!;
    const end = points[index + 1]!;
    if (targetDistancePx <= traversedPx + lengthPx || index === segmentLengths.length - 1) {
      const localProgress = lengthPx > 0
        ? Math.max(0, Math.min(1, (targetDistancePx - traversedPx) / lengthPx))
        : 0;
      return {
        point: {
          cx: start.cx + (end.cx - start.cx) * localProgress,
          cy: start.cy + (end.cy - start.cy) * localProgress
        },
        headingDegrees: resolveAirShowHeadingDegrees(end.cx - start.cx, end.cy - start.cy)
      };
    }
    traversedPx += lengthPx;
  }

  const previous = points[points.length - 2]!;
  const end = points[points.length - 1]!;
  return {
    point: end,
    headingDegrees: resolveAirShowHeadingDegrees(end.cx - previous.cx, end.cy - previous.cy)
  };
}

export function sampleAirShowTimelineTrack(
  track: AirShowTimelineTrack,
  timeMs: number
): AirShowTimelineTrackSample | null {
  const first = track.segments[0];
  const last = track.segments[track.segments.length - 1];
  if (!first || !last) {
    return null;
  }

  const segment =
    track.segments.find((candidate) => timeMs >= candidate.startTimeMs && timeMs <= candidate.endTimeMs)
    ?? (timeMs < first.startTimeMs ? first : last);
  const durationMs = Math.max(0.0001, segment.endTimeMs - segment.startTimeMs);
  const segmentProgress = timeMs <= segment.startTimeMs
    ? 0
    : timeMs >= segment.endTimeMs
      ? 1
      : (timeMs - segment.startTimeMs) / durationMs;
  const sampled = sampleAirShowPathByDistance(segment.points, segmentProgress);
  return {
    point: sampled.point,
    headingDegrees: sampled.headingDegrees,
    segment,
    segmentProgress
  };
}

export function resolveAirShowRoleSpeed(role: AirShowFlightRole): number {
  return role === "bomber"
    ? AIR_SHOW_BOMBER_SPEED_PX_PER_MS
    : AIR_SHOW_FIGHTER_SPEED_PX_PER_MS;
}

function angularDifferenceDegrees(left: number, right: number): number {
  return Math.abs((((right - left) % 360) + 540) % 360 - 180);
}

export function verifyAirShowTimeline(
  timeline: Omit<AirShowTimeline, "verification">
): AirShowTimelineVerification {
  const findings: AirShowTimelineFinding[] = [];
  const actorIds = new Set(timeline.actors.map((actor) => actor.actorId));
  const actorsById = new Map(timeline.actors.map((actor) => [actor.actorId, actor] as const));
  const tracksByActorId = new Map(timeline.tracks.map((track) => [track.actorId, track] as const));
  const expectedOffsetPx = 500;
  if (Math.abs(timeline.originPlan.offsetPx - expectedOffsetPx) > 0.001) {
    findings.push({
      severity: "error",
      code: "origin-offset",
      message: `Air show origin offset is ${timeline.originPlan.offsetPx}px; expected ${expectedOffsetPx}px.`
    });
  }

  timeline.tracks.forEach((track) => {
    if (!actorIds.has(track.actorId)) {
      findings.push({
        severity: "error",
        code: "unknown-track-actor",
        actorId: track.actorId,
        message: `Track references unknown actor ${track.actorId}.`
      });
    }
    if (track.segments.length === 0) {
      findings.push({
        severity: "error",
        code: "empty-track",
        actorId: track.actorId,
        message: `Actor ${track.actorId} has no movement segments.`
      });
      return;
    }

    const roleSpeed = resolveAirShowRoleSpeed(track.role);
    let previous: AirShowTimelineSegment | null = null;
    const combinedPoints: Array<{
      readonly point: AirShowPoint;
      readonly label: AirShowBeatLabel;
      readonly segmentIndex: number;
      readonly pointIndex: number;
    }> = [];
    track.segments.forEach((segment, segmentIndex) => {
      const measuredLengthPx = measureAirShowPath(segment.points);
      const durationMs = segment.endTimeMs - segment.startTimeMs;
      const realizedSpeed = durationMs > 0 ? measuredLengthPx / durationMs : 0;
      if (segment.points.length < 2 || measuredLengthPx < 0.5 || durationMs <= 0) {
        findings.push({
          severity: "error",
          code: "invalid-segment",
          actorId: track.actorId,
          label: segment.label,
          message: `${track.actorId} has an empty ${segment.label} movement segment.`
        });
      }
      if (Math.abs(measuredLengthPx - segment.lengthPx) > 0.05) {
        findings.push({
          severity: "error",
          code: "length-mismatch",
          actorId: track.actorId,
          label: segment.label,
          message: `${track.actorId} ${segment.label} stores ${segment.lengthPx.toFixed(2)}px but measures ${measuredLengthPx.toFixed(2)}px.`
        });
      }
      if (Math.abs(segment.speedPxPerMs - roleSpeed) > 0.000001 || Math.abs(realizedSpeed - roleSpeed) > 0.0005) {
        findings.push({
          severity: "error",
          code: "role-speed",
          actorId: track.actorId,
          label: segment.label,
          message: `${track.actorId} ${segment.label} realizes ${realizedSpeed.toFixed(4)}px/ms; expected ${roleSpeed.toFixed(4)}px/ms.`
        });
      }
      if (previous) {
        const previousEnd = previous.points[previous.points.length - 1]!;
        const currentStart = segment.points[0]!;
        const gapPx = Math.hypot(currentStart.cx - previousEnd.cx, currentStart.cy - previousEnd.cy);
        const timeGapMs = segment.startTimeMs - previous.endTimeMs;
        if (gapPx > 0.05 || Math.abs(timeGapMs) > 0.05) {
          findings.push({
            severity: "error",
            code: "track-discontinuity",
            actorId: track.actorId,
            label: segment.label,
            message: `${track.actorId} enters ${segment.label} with ${gapPx.toFixed(2)}px and ${timeGapMs.toFixed(2)}ms discontinuity.`
          });
        }
      }
      segment.points.forEach((point, index) => {
        if (combinedPoints.length === 0 || index > 0) {
          combinedPoints.push({ point, label: segment.label, segmentIndex, pointIndex: index });
        }
      });
      previous = segment;
    });

    const headingLimit = track.role === "bomber" ? 24 : 38;
    for (let index = 2; index < combinedPoints.length; index += 1) {
      const a = combinedPoints[index - 2]!.point;
      const b = combinedPoints[index - 1]!.point;
      const c = combinedPoints[index]!.point;
      const firstHeading = resolveAirShowHeadingDegrees(b.cx - a.cx, b.cy - a.cy);
      const secondHeading = resolveAirShowHeadingDegrees(c.cx - b.cx, c.cy - b.cy);
      const turnDegrees = angularDifferenceDegrees(firstHeading, secondHeading);
      if (turnDegrees > headingLimit + 0.01) {
        findings.push({
          severity: "error",
          code: "hard-turn",
          actorId: track.actorId,
          label: combinedPoints[index]!.label,
          message: `${track.actorId} turns ${turnDegrees.toFixed(1)} degrees entering ${combinedPoints[index]!.label} near (${b.cx.toFixed(1)}, ${b.cy.toFixed(1)}) at segment ${combinedPoints[index]!.segmentIndex}, point ${combinedPoints[index]!.pointIndex}; headings ${firstHeading.toFixed(1)} -> ${secondHeading.toFixed(1)}, limit is ${headingLimit}.`
        });
        break;
      }
    }

    const temporalHeadingLimit = track.role === "bomber"
      ? AIR_SHOW_BOMBER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE
      : AIR_SHOW_FIGHTER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE;
    const temporalSampleIntervalMs = AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS;
    let previousTemporalSample: AirShowTimelineTrackSample | null = null;
    for (
      let sampleTimeMs = track.visibleFromMs;
      sampleTimeMs <= track.visibleUntilMs + 0.01;
      sampleTimeMs += temporalSampleIntervalMs
    ) {
      const temporalSample = sampleAirShowTimelineTrack(track, Math.min(sampleTimeMs, track.visibleUntilMs));
      if (previousTemporalSample && temporalSample) {
        const headingChangeDegrees = angularDifferenceDegrees(
          previousTemporalSample.headingDegrees,
          temporalSample.headingDegrees
        );
        if (headingChangeDegrees > temporalHeadingLimit) {
          findings.push({
            severity: "error",
            code: "temporal-hard-turn",
            actorId: track.actorId,
            label: temporalSample.segment.label,
            message: `${track.actorId} changes heading ${headingChangeDegrees.toFixed(1)} degrees in ${temporalSampleIntervalMs}ms at ${sampleTimeMs.toFixed(1)}ms from ${previousTemporalSample.headingDegrees.toFixed(1)} degrees (${previousTemporalSample.segment.label}) to ${temporalSample.headingDegrees.toFixed(1)} degrees (${temporalSample.segment.label}); limit is ${temporalHeadingLimit} degrees.`
          });
          break;
        }
      }
      previousTemporalSample = temporalSample;
    }
  });

  timeline.cues.forEach((cue) => {
    if (cue.timeMs < 0 || cue.timeMs > timeline.totalDurationMs + 0.5) {
      findings.push({
        severity: "error",
        code: "cue-outside-timeline",
        message: `${cue.kind} cue at ${cue.timeMs.toFixed(1)}ms is outside the timeline.`
      });
    }
    if (cue.kind === "tracer" && (!actorIds.has(cue.sourceActorId) || !actorIds.has(cue.targetActorId))) {
      findings.push({
        severity: "error",
        code: "unknown-tracer-actor",
        message: `Tracer references unknown actors ${cue.sourceActorId} -> ${cue.targetActorId}.`
      });
    }
    if (cue.kind === "tracer" && actorIds.has(cue.sourceActorId) && actorIds.has(cue.targetActorId)) {
      const sourceTrack = tracksByActorId.get(cue.sourceActorId);
      const targetTrack = tracksByActorId.get(cue.targetActorId);
      const source = sourceTrack ? sampleAirShowTimelineTrack(sourceTrack, cue.timeMs) : null;
      const target = targetTrack ? sampleAirShowTimelineTrack(targetTrack, cue.timeMs) : null;
      if (cue.emitter === "nose" && source && target) {
        const targetVector = normalizeVerificationVector(
          target.point.cx - source.point.cx,
          target.point.cy - source.point.cy
        );
        const headingRadians = (source.headingDegrees - 90) * Math.PI / 180;
        const headingVector = { x: Math.cos(headingRadians), y: Math.sin(headingRadians) };
        const dot = Math.max(-1, Math.min(1, headingVector.x * targetVector.x + headingVector.y * targetVector.y));
        const aimErrorDegrees = Math.acos(dot) * 180 / Math.PI;
        if (aimErrorDegrees > 34) {
          findings.push({
            severity: "error",
            code: "misaligned-tracer",
            actorId: cue.sourceActorId,
            message: `${cue.sourceActorId} tracer aims ${aimErrorDegrees.toFixed(1)} degrees away from ${cue.targetActorId}.`
          });
        }
      }
      if (cue.visibleLengthPx < 18) {
        findings.push({
          severity: "error",
          code: "short-tracer",
          actorId: cue.sourceActorId,
          message: `${cue.sourceActorId} tracer is only ${cue.visibleLengthPx.toFixed(1)}px long.`
        });
      }
    }
  });

  if (timeline.scenario === "cap-clash") {
    const strikeCue = timeline.cues.find((cue) => cue.kind === "bomb-release" || cue.kind === "impact" || cue.kind === "flak");
    if (strikeCue) {
      findings.push({
        severity: "error",
        code: "cap-clash-strike-cue",
        message: `CAP clash contains prohibited ${strikeCue.kind} cue.`
      });
    }
    if (timeline.beats.some((beat) => beat.label === "target-run" || beat.label === "bomber-ingress")) {
      findings.push({
        severity: "error",
        code: "cap-clash-strike-beat",
        message: "CAP clash contains a prohibited bomber or target-run beat."
      });
    }
  }

  const bomberTracks = timeline.tracks.filter((track) => track.role === "bomber");
  const bomberTracksByFlight = new Map<string, AirShowTimelineTrack[]>();
  bomberTracks.forEach((track) => {
    const flightTracks = bomberTracksByFlight.get(track.flightId) ?? [];
    flightTracks.push(track);
    bomberTracksByFlight.set(track.flightId, flightTracks);
  });
  bomberTracksByFlight.forEach((flightTracks, flightId) => {
    for (let leftIndex = 0; leftIndex < flightTracks.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < flightTracks.length; rightIndex += 1) {
        const left = flightTracks[leftIndex]!;
        const right = flightTracks[rightIndex]!;
        const strikeLabels = new Set<AirShowBeatLabel>([
          "bomber-ingress",
          "bomber-defense-pass",
          "target-run"
        ]);
        const leftStrikeSegments = left.segments.filter((segment) => strikeLabels.has(segment.label));
        const rightStrikeSegments = right.segments.filter((segment) => strikeLabels.has(segment.label));
        const leftFirst = leftStrikeSegments[0];
        const rightFirst = rightStrikeSegments[0];
        const leftLast = leftStrikeSegments[leftStrikeSegments.length - 1];
        const rightLast = rightStrikeSegments[rightStrikeSegments.length - 1];
        if (!leftFirst || !rightFirst || !leftLast || !rightLast) {
          continue;
        }
        const overlapStartMs = Math.max(leftFirst.startTimeMs, rightFirst.startTimeMs);
        const overlapEndMs = Math.min(leftLast.endTimeMs, rightLast.endTimeMs);
        if (overlapEndMs <= overlapStartMs) {
          continue;
        }
        let minimumSeparationPx = Number.POSITIVE_INFINITY;
        for (let sampleIndex = 0; sampleIndex <= 32; sampleIndex += 1) {
          const progress = sampleIndex / 32;
          const timeMs = overlapStartMs + (overlapEndMs - overlapStartMs) * progress;
          const leftPoint = sampleAirShowTimelineTrack(left, timeMs)?.point;
          const rightPoint = sampleAirShowTimelineTrack(right, timeMs)?.point;
          if (leftPoint && rightPoint) {
            minimumSeparationPx = Math.min(
              minimumSeparationPx,
              Math.hypot(leftPoint.cx - rightPoint.cx, leftPoint.cy - rightPoint.cy)
            );
          }
        }
        if (minimumSeparationPx < 56) {
          findings.push({
            severity: "error",
            code: "bomber-overlap",
            actorId: right.actorId,
            label: "bomber-ingress",
            message: `${flightId} bombers close to ${minimumSeparationPx.toFixed(1)}px during the shared strike corridor; minimum is 56px.`
          });
        }
      }
    }
  });

  if (timeline.scenario === "escorted-strike" || timeline.scenario === "full-engagement") {
    const bomberTargetRuns = bomberTracks
      .map((track) => track.segments.find((segment) => segment.label === "target-run"))
      .filter((segment): segment is AirShowTimelineSegment => !!segment);
    timeline.tracks.filter((track) => track.role === "escort").forEach((track) => {
      const escortTargetRun = track.segments.find((segment) => segment.label === "target-run");
      if (!escortTargetRun) {
        findings.push({
          severity: "error",
          code: "escort-screen-missing",
          actorId: track.actorId,
          message: `${track.actorId} never establishes a bomber-screen target run.`
        });
        return;
      }
      const synchronized = bomberTargetRuns.some((bomberTargetRun) =>
        Math.abs(escortTargetRun.startTimeMs - bomberTargetRun.startTimeMs) <= 1
        && Math.abs(escortTargetRun.endTimeMs - bomberTargetRun.endTimeMs) <= 1
      );
      if (!synchronized) {
        const closest = bomberTargetRuns
          .map((bomberTargetRun) => ({
            startDeltaMs: escortTargetRun.startTimeMs - bomberTargetRun.startTimeMs,
            endDeltaMs: escortTargetRun.endTimeMs - bomberTargetRun.endTimeMs
          }))
          .sort((left, right) =>
            Math.abs(left.startDeltaMs) + Math.abs(left.endDeltaMs)
            - Math.abs(right.startDeltaMs) - Math.abs(right.endDeltaMs)
          )[0];
        findings.push({
          severity: "error",
          code: "escort-screen-timing",
          actorId: track.actorId,
          label: "target-run",
          message: `${track.actorId} target run is not synchronized to a bomber target run at role-correct speed; nearest deltas are ${closest?.startDeltaMs.toFixed(1) ?? "n/a"}ms start and ${closest?.endDeltaMs.toFixed(1) ?? "n/a"}ms end.`
        });
      }
    });
  }

  if (timeline.scenario === "cap-clash" || timeline.scenario === "full-engagement") {
    const scrambleTracks = timeline.tracks
      .map((track) => ({
        track,
        actor: actorsById.get(track.actorId),
        merge: track.segments.find((segment) => segment.label === "escort-clash-merge"),
        scramble: track.segments.find((segment) => segment.label === "escort-clash-scramble")
      }))
      .filter((entry): entry is {
        track: AirShowTimelineTrack;
        actor: AirShowTimelineActor;
        merge: AirShowTimelineSegment;
        scramble: AirShowTimelineSegment;
      } => !!entry.actor && !!entry.merge && !!entry.scramble && entry.track.role !== "bomber");
    const playerSide = scrambleTracks.filter((entry) => entry.actor.faction !== "Bot");
    const botSide = scrambleTracks.filter((entry) => entry.actor.faction === "Bot");
    const centroid = (points: ReadonlyArray<AirShowPoint>): AirShowPoint => ({
      cx: points.reduce((sum, point) => sum + point.cx, 0) / points.length,
      cy: points.reduce((sum, point) => sum + point.cy, 0) / points.length
    });
    if (playerSide.length > 0 && botSide.length > 0) {
      const mergePoint = (entry: typeof scrambleTracks[number]): AirShowPoint =>
        entry.merge.points[Math.floor(entry.merge.points.length / 2)]!;
      const playerMergePoints = playerSide.map(mergePoint);
      const botMergePoints = botSide.map(mergePoint);
      const playerMergeCentroid = centroid(playerMergePoints);
      const botMergeCentroid = centroid(botMergePoints);
      const mergeCentroidSeparationPx = Math.hypot(
        playerMergeCentroid.cx - botMergeCentroid.cx,
        playerMergeCentroid.cy - botMergeCentroid.cy
      );
      const farthestActorFromOpponentPx = Math.max(
        ...playerMergePoints.map((playerPoint) => Math.min(...botMergePoints.map((botPoint) =>
          Math.hypot(playerPoint.cx - botPoint.cx, playerPoint.cy - botPoint.cy)
        ))),
        ...botMergePoints.map((botPoint) => Math.min(...playerMergePoints.map((playerPoint) =>
          Math.hypot(playerPoint.cx - botPoint.cx, playerPoint.cy - botPoint.cy)
        )))
      );
      if (mergeCentroidSeparationPx > 36 || farthestActorFromOpponentPx > 68) {
        findings.push({
          severity: "error",
          code: "misaligned-merge",
          label: "escort-clash-merge",
          message: `Head-on merge lanes do not share one combat volume: centroids are ${mergeCentroidSeparationPx.toFixed(1)}px apart and the farthest fighter is ${farthestActorFromOpponentPx.toFixed(1)}px from an opponent; limits are 36px and 68px.`
        });
      }
    }
    const overlapStartMs = Math.max(...scrambleTracks.map((entry) => entry.scramble.startTimeMs));
    const overlapEndMs = Math.min(...scrambleTracks.map((entry) => entry.scramble.endTimeMs));
    if (playerSide.length > 0 && botSide.length > 0 && overlapEndMs > overlapStartMs) {
      const sampleTimeMs = overlapStartMs + (overlapEndMs - overlapStartMs) * 0.5;
      const sampleSide = (entries: typeof scrambleTracks): ReadonlyArray<AirShowPoint> => entries
        .map((entry) => sampleAirShowTimelineTrack(entry.track, sampleTimeMs)?.point)
        .filter((point): point is AirShowPoint => !!point);
      const playerPoints = sampleSide(playerSide);
      const botPoints = sampleSide(botSide);
      const playerCentroid = centroid(playerPoints);
      const botCentroid = centroid(botPoints);
      const centroidSeparationPx = Math.hypot(
        playerCentroid.cx - botCentroid.cx,
        playerCentroid.cy - botCentroid.cy
      );
      const nearestOpposingPairPx = Math.min(...playerPoints.flatMap((playerPoint) =>
        botPoints.map((botPoint) => Math.hypot(
          playerPoint.cx - botPoint.cx,
          playerPoint.cy - botPoint.cy
        ))
      ));
      if (centroidSeparationPx > 210 || nearestOpposingPairPx > 160) {
        findings.push({
          severity: "error",
          code: "split-scramble",
          label: "escort-clash-scramble",
          message: `Switched scramble splits the engagement: centroids are ${centroidSeparationPx.toFixed(1)}px apart and the nearest opposing pair is ${nearestOpposingPairPx.toFixed(1)}px apart; limits are 210px and 160px.`
        });
      }

      const pairingTracks = scrambleTracks.filter((entry) => entry.actor.formationIndex === 0);
      const sampleFighters = (timeMs: number): ReadonlyArray<{
        readonly actorId: string;
        readonly botSide: boolean;
        readonly point: AirShowPoint;
      }> => pairingTracks.flatMap((entry) => {
        const sample = sampleAirShowTimelineTrack(entry.track, timeMs);
        return sample ? [{ actorId: entry.track.actorId, botSide: entry.actor.faction === "Bot", point: sample.point }] : [];
      });
      const nearestPairIds = (sampled: ReturnType<typeof sampleFighters>): ReadonlyMap<string, string> =>
        new Map(sampled.map((source) => {
          const opponents = sampled.filter((candidate) =>
            candidate.botSide !== source.botSide
          );
          const nearest = opponents.sort((left, right) =>
            Math.hypot(left.point.cx - source.point.cx, left.point.cy - source.point.cy)
            - Math.hypot(right.point.cx - source.point.cx, right.point.cy - source.point.cy)
          )[0];
          return [source.actorId, nearest?.actorId ?? ""] as const;
        }));
      const minimumOpposingDistance = (sampled: ReturnType<typeof sampleFighters>): number =>
        Math.min(...sampled.flatMap((source) => sampled
          .filter((candidate) => candidate.botSide !== source.botSide)
          .map((candidate) => Math.hypot(
            candidate.point.cx - source.point.cx,
            candidate.point.cy - source.point.cy
          ))));
      const mergeOverlapStartMs = Math.max(...scrambleTracks.map((entry) => entry.merge.startTimeMs));
      const mergeOverlapEndMs = Math.min(...scrambleTracks.map((entry) => entry.merge.endTimeMs));
      const mergeSampleTimes = Array.from({ length: 21 }, (_, index) =>
        mergeOverlapStartMs + (mergeOverlapEndMs - mergeOverlapStartMs) * index / 20
      );
      const closestMergeTimeMs = mergeSampleTimes.reduce((bestTimeMs, candidateTimeMs) =>
        minimumOpposingDistance(sampleFighters(candidateTimeMs))
          < minimumOpposingDistance(sampleFighters(bestTimeMs)) ? candidateTimeMs : bestTimeMs
      );
      const mergePairs = nearestPairIds(sampleFighters(closestMergeTimeMs));
      const scramblePairs = nearestPairIds(sampleFighters(sampleTimeMs));
      const scrambleFighters = sampleFighters(sampleTimeMs);
      const comparableActors = [...mergePairs.keys()].filter((actorId) => {
        const source = scrambleFighters.find((fighter) => fighter.actorId === actorId);
        return source
          && scramblePairs.has(actorId)
          && scrambleFighters.filter((fighter) => fighter.botSide !== source.botSide).length >= 2;
      });
      const switchedActors = comparableActors.filter((actorId) => mergePairs.get(actorId) !== scramblePairs.get(actorId));
      const switchedFraction = comparableActors.length > 0 ? switchedActors.length / comparableActors.length : null;
      if (switchedFraction !== null && switchedFraction < 0.5) {
        const pairDetails = comparableActors
          .map((actorId) => `${actorId}:${mergePairs.get(actorId)}->${scramblePairs.get(actorId)}`)
          .join(", ");
        findings.push({
          severity: "error",
          code: "pairing-switch",
          label: "escort-clash-scramble",
          message: `Only ${(switchedFraction * 100).toFixed(0)}% of eligible fighter formations switch their nearest opponent after the merge; minimum is 50%. Pairings: ${pairDetails}.`
        });
      }
    }
  }

  return {
    valid: findings.every((finding) => finding.severity !== "error"),
    findings
  };
}

function normalizeVerificationVector(dx: number, dy: number): { readonly x: number; readonly y: number } {
  const length = Math.hypot(dx, dy);
  return length > 0.0001 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
}
