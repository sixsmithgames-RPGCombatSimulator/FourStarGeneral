/**
 * AirShow Fighter Clash Diagnostic
 *
 * Run this to verify the clash choreography is working correctly.
 * Call runClashDiagnostic() from browser console or a test file.
 */

import type { AirShowPlannerPhaseAssignment } from "./AirShowPlaybackPlanner";
import type { AirShowPoint } from "./AirShowPlaybackScene";

export interface ClashDiagnosticResult {
  actorId: string;
  role: string;
  flightId: string;
  samples: Array<{
    timeMs: number;
    position: AirShowPoint;
    distanceToCenterPx: number;
  }>;
  maxDistanceToCenterPx: number;
  convergenceTimeMs: number | null;
  pathLengthPx: number;
  overshootDetected: boolean;
}

/**
 * Sample aircraft positions during the clash phase and detect issues
 */
export function runClashDiagnostic(
  assignments: AirShowPlannerPhaseAssignment[],
  fightSpaceCenter: AirShowPoint,
  phaseDurationMs: number,
  sampleIntervalMs: number,
  sampler: (assignment: AirShowPlannerPhaseAssignment, timeMs: number, durationMs: number) => {
    position: AirShowPoint;
    headingDegrees: number;
  }
): ClashDiagnosticResult[] {
  const results: ClashDiagnosticResult[] = [];
  const sampleCount = Math.ceil(phaseDurationMs / sampleIntervalMs);

  for (const assignment of assignments) {
    const samples: Array<{ timeMs: number; position: AirShowPoint; distanceToCenterPx: number }> = [];
    let maxDistanceToCenterPx = 0;
    let convergenceTimeMs: number | null = null;
    let overshootDetected = false;

    // Calculate path length
    let pathLengthPx = 0;
    const points = assignment.points;
    for (let i = 1; i < points.length; i++) {
      pathLengthPx += Math.hypot(
        points[i]!.cx - points[i - 1]!.cx,
        points[i]!.cy - points[i - 1]!.cy
      );
    }

    // Sample positions throughout the phase
    for (let i = 0; i <= sampleCount; i++) {
      const timeMs = Math.min(i * sampleIntervalMs, phaseDurationMs);
      const sample = sampler(assignment, timeMs, phaseDurationMs);
      const distanceToCenterPx = Math.hypot(
        sample.position.cx - fightSpaceCenter.cx,
        sample.position.cy - fightSpaceCenter.cy
      );

      samples.push({
        timeMs,
        position: sample.position,
        distanceToCenterPx
      });

      maxDistanceToCenterPx = Math.max(maxDistanceToCenterPx, distanceToCenterPx);

      // Detect convergence (within 100px of center)
      if (convergenceTimeMs === null && distanceToCenterPx <= 100) {
        convergenceTimeMs = timeMs;
      }

      // Detect overshoot: if at mid-phase we're more than 200px past center
      if (timeMs === Math.floor(phaseDurationMs * 0.5) && distanceToCenterPx > 200) {
        overshootDetected = true;
      }
    }

    results.push({
      actorId: assignment.actor.id,
      role: assignment.actor.role,
      flightId: assignment.actor.flightId,
      samples,
      maxDistanceToCenterPx,
      convergenceTimeMs,
      pathLengthPx,
      overshootDetected
    });
  }

  return results;
}

/**
 * Analyze diagnostic results and report issues
 */
export function analyzeClashResults(results: ClashDiagnosticResult[]): {
  passed: boolean;
  issues: string[];
  summary: string;
} {
  const issues: string[] = [];
  const fighterResults = results.filter(r => r.role === "interceptor" || r.role === "escort");

  // Check for overshoots
  const overshooters = fighterResults.filter(r => r.overshootDetected);
  if (overshooters.length > 0) {
    issues.push(`OVERSHOOT: ${overshooters.length} fighters fly past clash point and make U-turns`);
    for (const r of overshooters) {
      issues.push(`  - ${r.actorId} path: ${r.pathLengthPx.toFixed(0)}px`);
    }
  }

  // Check convergence timing
  const convergenceTimes = fighterResults
    .map(r => r.convergenceTimeMs)
    .filter((t): t is number => t !== null);

  if (convergenceTimes.length >= 2) {
    const maxDiff = Math.max(...convergenceTimes) - Math.min(...convergenceTimes);
    if (maxDiff > 200) {
      issues.push(`TIMING: Fighters arrive ${maxDiff}ms apart (max: 200ms)`);
    }
  }

  // Check path length differences
  const interceptorPaths = fighterResults
    .filter(r => r.role === "interceptor")
    .map(r => r.pathLengthPx);
  const escortPaths = fighterResults
    .filter(r => r.role === "escort")
    .map(r => r.pathLengthPx);

  if (interceptorPaths.length > 0 && escortPaths.length > 0) {
    const avgInt = interceptorPaths.reduce((a, b) => a + b, 0) / interceptorPaths.length;
    const avgEsc = escortPaths.reduce((a, b) => a + b, 0) / escortPaths.length;
    const diff = Math.abs(avgInt - avgEsc);

    if (diff > 100) {
      issues.push(`PATH LENGTH: Interceptors ${avgInt.toFixed(0)}px vs Escorts ${avgEsc.toFixed(0)}px (diff: ${diff.toFixed(0)}px)`);
    }
  }

  const passed = issues.length === 0;
  const summary = passed
    ? `PASS: All ${fighterResults.length} fighters converge properly`
    : `FAIL: ${issues.length} issues detected`;

  return { passed, issues, summary };
}
