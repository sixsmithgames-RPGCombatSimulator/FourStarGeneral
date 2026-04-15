export interface AirShowPathPoint {
  readonly cx: number;
  readonly cy: number;
}

export interface AirShowPathDerivative {
  readonly dx: number;
  readonly dy: number;
}

export interface AirShowWaypointSample {
  readonly point: AirShowPathPoint;
  readonly derivative: AirShowPathDerivative;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceBetween(left: AirShowPathPoint, right: AirShowPathPoint): number {
  return Math.hypot(right.cx - left.cx, right.cy - left.cy);
}

function normalizeVector(
  dx: number,
  dy: number,
  fallbackX = 1,
  fallbackY = 0
): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  if (length > 0.0001) {
    return { x: dx / length, y: dy / length };
  }
  const fallbackLength = Math.max(0.0001, Math.hypot(fallbackX, fallbackY));
  return {
    x: fallbackX / fallbackLength,
    y: fallbackY / fallbackLength
  };
}

function angleBetweenVectors(
  left: { x: number; y: number },
  right: { x: number; y: number }
): number {
  const leftLength = Math.hypot(left.x, left.y);
  const rightLength = Math.hypot(right.x, right.y);
  if (leftLength < 0.0001 || rightLength < 0.0001) {
    return 0;
  }
  const dot = (left.x * right.x + left.y * right.y) / (leftLength * rightLength);
  return Math.acos(clamp(dot, -1, 1)) * (180 / Math.PI);
}

function stabilizeHermiteTangent(
  start: AirShowPathPoint,
  end: AirShowPathPoint,
  tangent: AirShowPathDerivative
): AirShowPathDerivative {
  const dx = end.cx - start.cx;
  const dy = end.cy - start.cy;
  const segmentLength = Math.max(0.0001, Math.hypot(dx, dy));
  const forward = { x: dx / segmentLength, y: dy / segmentLength };
  const lateral = { x: -forward.y, y: forward.x };
  const rawForward =
    tangent.dx * forward.x + tangent.dy * forward.y;
  const rawLateral =
    tangent.dx * lateral.x + tangent.dy * lateral.y;
  const tangentDirection = normalizeVector(tangent.dx, tangent.dy, forward.x, forward.y);
  const alignment = clamp((tangentDirection.x * forward.x + tangentDirection.y * forward.y + 1) * 0.5, 0, 1);
  const reversalRisk = 1 - alignment;
  const forwardMagnitude = rawForward <= segmentLength * 0.04
    ? segmentLength * 0.12
    : clamp(
        rawForward,
        segmentLength * (0.1 + alignment * 0.12),
        segmentLength * (0.42 + alignment * 0.3)
      );
  const lateralCap = segmentLength * (0.04 + alignment * 0.08);
  const lateralMagnitude = clamp(
    rawLateral,
    -lateralCap,
    lateralCap
  ) * (0.78 + alignment * 0.22);
  if (reversalRisk > 0.72) {
    return {
      dx: forward.x * forwardMagnitude,
      dy: forward.y * forwardMagnitude
    };
  }
  return {
    dx: forward.x * forwardMagnitude + lateral.x * lateralMagnitude,
    dy: forward.y * forwardMagnitude + lateral.y * lateralMagnitude
  };
}

function buildRoundedWaypointPath(points: ReadonlyArray<AirShowPathPoint>): ReadonlyArray<AirShowPathPoint> {
  if (points.length <= 2) {
    return points;
  }

  const expanded: AirShowPathPoint[] = [points[0]!];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const incoming = normalizeVector(current.cx - previous.cx, current.cy - previous.cy);
    const outgoing = normalizeVector(next.cx - current.cx, next.cy - current.cy);
    const incomingLength = distanceBetween(previous, current);
    const outgoingLength = distanceBetween(current, next);
    const turnAngleDeg = angleBetweenVectors(incoming, outgoing);
    const isEdgeWaypoint = index === 1 || index === points.length - 2;
    const shortestLegPx = Math.min(incomingLength, outgoingLength);

    if (incomingLength < 18 || outgoingLength < 18 || turnAngleDeg < 12) {
      expanded.push(current);
      continue;
    }
    if (
      shortestLegPx < (isEdgeWaypoint ? 56 : 42)
      || (turnAngleDeg > 146 && shortestLegPx < 96)
    ) {
      expanded.push(current);
      continue;
    }

    const turnRatio = clamp(turnAngleDeg / 180, 0.14, isEdgeWaypoint ? 0.2 : 0.3);
    const radiusPx = Math.min(
      isEdgeWaypoint ? 64 : 104,
      incomingLength * turnRatio,
      outgoingLength * turnRatio
    );
    const entryPoint = {
      cx: current.cx - incoming.x * radiusPx,
      cy: current.cy - incoming.y * radiusPx
    };
    const exitPoint = {
      cx: current.cx + outgoing.x * radiusPx,
      cy: current.cy + outgoing.y * radiusPx
    };
    if (
      distanceBetween(expanded[expanded.length - 1]!, entryPoint) < 10
      || distanceBetween(entryPoint, exitPoint) < 14
      || distanceBetween(exitPoint, next) < 10
    ) {
      expanded.push(current);
      continue;
    }

    if (distanceBetween(expanded[expanded.length - 1]!, entryPoint) > 2) {
      expanded.push(entryPoint);
    }
    if (distanceBetween(entryPoint, exitPoint) > 2) {
      expanded.push(exitPoint);
    } else {
      expanded.push(current);
    }
  }

  expanded.push(points[points.length - 1]!);
  return expanded;
}

function interpolateHermitePoint(
  start: AirShowPathPoint,
  end: AirShowPathPoint,
  startTangent: AirShowPathDerivative,
  endTangent: AirShowPathDerivative,
  progress: number
): AirShowPathPoint {
  const t = clamp(progress, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return {
    cx: h00 * start.cx + h10 * startTangent.dx + h01 * end.cx + h11 * endTangent.dx,
    cy: h00 * start.cy + h10 * startTangent.dy + h01 * end.cy + h11 * endTangent.dy
  };
}

function interpolateHermiteDerivative(
  start: AirShowPathPoint,
  end: AirShowPathPoint,
  startTangent: AirShowPathDerivative,
  endTangent: AirShowPathDerivative,
  progress: number
): AirShowPathDerivative {
  const t = clamp(progress, 0, 1);
  const t2 = t * t;
  const dh00 = 6 * t2 - 6 * t;
  const dh10 = 3 * t2 - 4 * t + 1;
  const dh01 = -6 * t2 + 6 * t;
  const dh11 = 3 * t2 - 2 * t;

  return {
    dx: dh00 * start.cx + dh10 * startTangent.dx + dh01 * end.cx + dh11 * endTangent.dx,
    dy: dh00 * start.cy + dh10 * startTangent.dy + dh01 * end.cy + dh11 * endTangent.dy
  };
}

function interpolateLinearPoint(
  start: AirShowPathPoint,
  end: AirShowPathPoint,
  progress: number
): AirShowPathPoint {
  const t = clamp(progress, 0, 1);
  return {
    cx: start.cx + (end.cx - start.cx) * t,
    cy: start.cy + (end.cy - start.cy) * t
  };
}

function interpolateLinearDerivative(
  start: AirShowPathPoint,
  end: AirShowPathPoint
): AirShowPathDerivative {
  return {
    dx: end.cx - start.cx,
    dy: end.cy - start.cy
  };
}

export function sampleAirShowWaypointPath(
  points: ReadonlyArray<AirShowPathPoint>,
  progress: number
): AirShowWaypointSample {
  const effectivePoints = buildRoundedWaypointPath(points);
  if (effectivePoints.length <= 1) {
    const point = effectivePoints[0] ?? { cx: 0, cy: 0 };
    return {
      point,
      derivative: { dx: 0, dy: 0 }
    };
  }

  const clampedProgress = clamp(progress, 0, 1);
  const segmentCount = effectivePoints.length - 1;
  const useLinearSegments = segmentCount <= 1;
  const segmentSamples = Array.from({ length: segmentCount }, (_, segmentIndex) => {
    const p0 = effectivePoints[Math.max(0, segmentIndex - 1)] ?? effectivePoints[0]!;
    const p1 = effectivePoints[segmentIndex]!;
    const p2 = effectivePoints[segmentIndex + 1]!;
    const p3 = effectivePoints[Math.min(effectivePoints.length - 1, segmentIndex + 2)] ?? effectivePoints[effectivePoints.length - 1]!;
    const rawStartTangent = {
      dx: (p2.cx - p0.cx) * 0.5,
      dy: (p2.cy - p0.cy) * 0.5
    };
    const rawEndTangent = {
      dx: (p3.cx - p1.cx) * 0.5,
      dy: (p3.cy - p1.cy) * 0.5
    };
    const startTangent = stabilizeHermiteTangent(p1, p2, rawStartTangent);
    const endTangent = stabilizeHermiteTangent(p1, p2, rawEndTangent);
    const sampleCount = 10;
    const samplePoints: Array<{ t: number; point: AirShowPathPoint; cumulative: number }> = [];
    const samplePointAt = (t: number): AirShowPathPoint =>
      useLinearSegments
        ? interpolateLinearPoint(p1, p2, t)
        : interpolateHermitePoint(p1, p2, startTangent, endTangent, t);
    let previousPoint = samplePointAt(0);
    let cumulative = 0;
    samplePoints.push({ t: 0, point: previousPoint, cumulative });
    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
      const t = sampleIndex / sampleCount;
      const point = samplePointAt(t);
      cumulative += distanceBetween(previousPoint, point);
      samplePoints.push({ t, point, cumulative });
      previousPoint = point;
    }
    return {
      p1,
      p2,
      startTangent,
      endTangent,
      isBoundarySegment: useLinearSegments,
      samples: samplePoints,
      approxLength: Math.max(0.0001, cumulative)
    };
  });

  let totalLength = 0;
  segmentSamples.forEach((segment) => {
    totalLength += segment.approxLength;
  });

  const targetDistance = clampedProgress >= 1 ? totalLength : totalLength * clampedProgress;
  let traversed = 0;
  let segmentIndex = 0;
  for (; segmentIndex < segmentCount - 1; segmentIndex += 1) {
    const nextTraversed = traversed + (segmentSamples[segmentIndex]?.approxLength ?? 0);
    if (targetDistance <= nextTraversed) {
      break;
    }
    traversed = nextTraversed;
  }

  const activeSegment = segmentSamples[segmentIndex] ?? segmentSamples[segmentSamples.length - 1]!;
  const localTargetDistance =
    clampedProgress >= 1
      ? activeSegment.approxLength
      : clamp(targetDistance - traversed, 0, activeSegment.approxLength);
  let localProgress = 1;
  if (clampedProgress < 1) {
    const samples = activeSegment.samples;
    for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex += 1) {
      const left = samples[sampleIndex]!;
      const right = samples[sampleIndex + 1]!;
      if (localTargetDistance <= right.cumulative || sampleIndex === samples.length - 2) {
        const span = Math.max(0.0001, right.cumulative - left.cumulative);
        const mix = clamp((localTargetDistance - left.cumulative) / span, 0, 1);
        localProgress = left.t + (right.t - left.t) * mix;
        break;
      }
    }
  }

  return {
    point: activeSegment.isBoundarySegment
      ? interpolateLinearPoint(
          activeSegment.p1,
          activeSegment.p2,
          localProgress
        )
      : interpolateHermitePoint(
          activeSegment.p1,
          activeSegment.p2,
          activeSegment.startTangent,
          activeSegment.endTangent,
          localProgress
        ),
    derivative: activeSegment.isBoundarySegment
      ? interpolateLinearDerivative(activeSegment.p1, activeSegment.p2)
      : interpolateHermiteDerivative(
          activeSegment.p1,
          activeSegment.p2,
          activeSegment.startTangent,
          activeSegment.endTangent,
          localProgress
        )
  };
}

export function sampleAirShowWaypointPoints(
  points: ReadonlyArray<AirShowPathPoint>,
  sampleCount = 13
): readonly AirShowWaypointSample[] {
  const clampedCount = Math.max(2, sampleCount);
  return Array.from({ length: clampedCount }, (_, index) =>
    sampleAirShowWaypointPath(points, index / Math.max(1, clampedCount - 1))
  );
}
