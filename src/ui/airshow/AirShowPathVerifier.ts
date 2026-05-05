/**
 * AirShow Path Verification Utilities
 *
 * Provides deterministic path verification for airshow aircraft.
 * Samples positions at regular intervals and validates they adhere to planned paths.
 */

import type { AirShowPlannerPhaseAssignment } from "./AirShowPlaybackPlanner";
import type { AirShowPoint } from "./AirShowPlaybackScene";

export interface PathSample {
  timeMs: number;
  position: AirShowPoint;
  headingDegrees: number;
}

export interface PathDeviation {
  timeMs: number;
  expectedPosition: AirShowPoint;
  actualPosition: AirShowPoint;
  deviationPx: number;
}

export interface PathVerificationResult {
  actorId: string;
  role: string;
  samples: PathSample[];
  maxDeviationPx: number;
  deviations: PathDeviation[];
  passed: boolean;
}

/**
 * Calculate distance from point to line segment
 */
function pointToSegmentDistance(
  point: AirShowPoint,
  segmentStart: AirShowPoint,
  segmentEnd: AirShowPoint
): number {
  const dx = segmentEnd.cx - segmentStart.cx;
  const dy = segmentEnd.cy - segmentStart.cy;
  const segmentLengthSq = dx * dx + dy * dy;

  if (segmentLengthSq === 0) {
    return Math.hypot(point.cx - segmentStart.cx, point.cy - segmentStart.cy);
  }

  // Project point onto line segment
  const t = Math.max(0, Math.min(1, (
    (point.cx - segmentStart.cx) * dx +
    (point.cy - segmentStart.cy) * dy
  ) / segmentLengthSq));

  const closestX = segmentStart.cx + t * dx;
  const closestY = segmentStart.cy + t * dy;

  return Math.hypot(point.cx - closestX, point.cy - closestY);
}

/**
 * Find minimum distance from a point to any segment of a path
 */
function distanceToPath(point: AirShowPoint, path: AirShowPoint[]): number {
  if (path.length < 2) {
    return path.length === 1
      ? Math.hypot(point.cx - path[0]!.cx, point.cy - path[0]!.cy)
      : Infinity;
  }

  let minDistance = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const distance = pointToSegmentDistance(point, path[i]!, path[i + 1]!);
    minDistance = Math.min(minDistance, distance);
  }
  return minDistance;
}

/**
 * Sample aircraft positions at regular intervals during a phase
 * and verify they adhere to the planned path.
 *
 * @param assignment - The phase assignment to verify
 * @param durationMs - Total phase duration in milliseconds
 * @param sampleIntervalMs - Interval between samples (default 100ms)
 * @param maxAllowedDeviationPx - Maximum allowed deviation from path (default 50px)
 * @param sampler - Function to sample position at a given time
 */
export function verifyAssignmentPath(
  assignment: AirShowPlannerPhaseAssignment,
  durationMs: number,
  sampleIntervalMs: number,
  maxAllowedDeviationPx: number,
  sampler: (assignment: AirShowPlannerPhaseAssignment, timeMs: number, durationMs: number) => {
    position: AirShowPoint;
    headingDegrees: number;
  }
): PathVerificationResult {
  const samples: PathSample[] = [];
  const deviations: PathDeviation[] = [];

  // Sample at regular intervals from 0 to durationMs
  const sampleCount = Math.ceil(durationMs / sampleIntervalMs);

  for (let i = 0; i <= sampleCount; i++) {
    const timeMs = Math.min(i * sampleIntervalMs, durationMs);
    const sample = sampler(assignment, timeMs, durationMs);

    samples.push({
      timeMs,
      position: sample.position,
      headingDegrees: sample.headingDegrees
    });

    // Calculate deviation from planned path
    const deviationPx = distanceToPath(sample.position, assignment.points);

    if (deviationPx > maxAllowedDeviationPx) {
      deviations.push({
        timeMs,
        expectedPosition: assignment.points[Math.floor(
          (timeMs / durationMs) * (assignment.points.length - 1)
        )] ?? assignment.points[0]!,
        actualPosition: sample.position,
        deviationPx
      });
    }
  }

  const maxDeviationPx = deviations.length > 0
    ? Math.max(...deviations.map(d => d.deviationPx))
    : 0;

  return {
    actorId: assignment.actor.id,
    role: assignment.actor.role,
    samples,
    maxDeviationPx,
    deviations,
    passed: maxDeviationPx <= maxAllowedDeviationPx
  };
}

/**
 * Verify that two fighters converge at similar times during a clash phase.
 * This ensures interceptors don't overshoot and make U-turns.
 *
 * @param assignments - All phase assignments
 * @param fightSpaceCenter - The center of the fight space
 * @param convergenceThresholdPx - Distance threshold for considering fighters "at convergence"
 * @param sampler - Function to sample position at a given time
 */
export function verifyFighterConvergence(
  assignments: AirShowPlannerPhaseAssignment[],
  fightSpaceCenter: AirShowPoint,
  phaseDurationMs: number,
  sampleIntervalMs: number,
  convergenceThresholdPx: number,
  sampler: (assignment: AirShowPlannerPhaseAssignment, timeMs: number, durationMs: number) => {
    position: AirShowPoint;
    headingDegrees: number;
  }
): {
  convergenceTimes: Map<string, number>;
  maxTimeDifferenceMs: number;
  passed: boolean;
} {
  const fighterAssignments = assignments.filter(
    a => a.actor.role === "interceptor" || a.actor.role === "escort"
  );

  const convergenceTimes = new Map<string, number>();

  // For each fighter, find when they first enter convergence zone
  for (const assignment of fighterAssignments) {
    const sampleCount = Math.ceil(phaseDurationMs / sampleIntervalMs);

    for (let i = 0; i <= sampleCount; i++) {
      const timeMs = Math.min(i * sampleIntervalMs, phaseDurationMs);
      const sample = sampler(assignment, timeMs, phaseDurationMs);

      const distanceToCenter = Math.hypot(
        sample.position.cx - fightSpaceCenter.cx,
        sample.position.cy - fightSpaceCenter.cy
      );

      if (distanceToCenter <= convergenceThresholdPx) {
        convergenceTimes.set(assignment.actor.id, timeMs);
        break;
      }
    }
  }

  // Calculate max time difference between fighters
  const times = Array.from(convergenceTimes.values());
  const maxTimeDifferenceMs = times.length >= 2
    ? Math.max(...times) - Math.min(...times)
    : 0;

  // Fighters should converge within 200ms of each other
  const passed = maxTimeDifferenceMs <= 200;

  return {
    convergenceTimes,
    maxTimeDifferenceMs,
    passed
  };
}

/**
 * Format verification results for test output
 */
export function formatVerificationResults(results: PathVerificationResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    lines.push(`\nActor: ${result.actorId} (${result.role})`);
    lines.push(`  Max Deviation: ${result.maxDeviationPx.toFixed(2)}px`);
    lines.push(`  Status: ${result.passed ? "PASS" : "FAIL"}`);

    if (result.deviations.length > 0) {
      lines.push(`  Deviations (${result.deviations.length}):`);
      for (const dev of result.deviations.slice(0, 5)) {
        lines.push(`    @${dev.timeMs}ms: ${dev.deviationPx.toFixed(2)}px off`);
      }
      if (result.deviations.length > 5) {
        lines.push(`    ... and ${result.deviations.length - 5} more`);
      }
    }
  }

  return lines.join("\n");
}
