import {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS
} from "../src/ui/airshow/AirShowPlaybackPolicy.js";

export type AirScenarioResult = ReturnType<(typeof import("./airScenarioSupport.js"))["runAirScenario"]>;

export type PositionSample = {
  cx: number;
  cy: number;
  timeMs: number;
  progress?: number;
};

export type AssignmentLike = {
  actorId: string;
  role: string;
  points?: ReadonlyArray<{ cx: number; cy: number }>;
  sampledPositions: ReadonlyArray<PositionSample>;
};

export type PhaseLike = {
  label: string;
  durationMs: number;
  assignments: ReadonlyArray<AssignmentLike>;
};

export const AIR_SHOW_EXPECTED_SPEED_RATIO =
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS / AIR_SHOW_BOMBER_SPEED_PX_PER_MS;

export function getAuthoritativeContestedPlan(result: AirScenarioResult | null) {
  return result?.playbackProjection.coordinatedPlans.find(
    (plan) => plan.sceneReport && plan.strikeSortieMissionIds.length > 0
  ) ?? null;
}

export function getAuthoritativeContestedInspection(result: AirScenarioResult | null) {
  return result?.airshowInspections.find(
    (entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-")
  ) ?? null;
}

export function getAuthoritativeContestedPackagePhases(
  result: AirScenarioResult | null
): ReadonlyArray<PhaseLike> | null {
  const coordinatedPlan = getAuthoritativeContestedPlan(result);
  if (coordinatedPlan?.sceneReport) {
    return coordinatedPlan.sceneReport.phases as ReadonlyArray<PhaseLike>;
  }

  const legacyInspection = getAuthoritativeContestedInspection(result);
  return legacyInspection?.report.phases as ReadonlyArray<PhaseLike> | undefined ?? null;
}

export function calculateObservedSpeed(
  samples: ReadonlyArray<{ cx: number; cy: number; timeMs: number }>
): number {
  if (samples.length < 3) {
    return 0;
  }

  const startIdx = Math.floor(samples.length * 0.2);
  const endIdx = Math.floor(samples.length * 0.8);
  let totalDistance = 0;
  let totalTime = 0;

  for (let i = startIdx + 1; i <= endIdx && i < samples.length; i += 1) {
    const dx = samples[i].cx - samples[i - 1].cx;
    const dy = samples[i].cy - samples[i - 1].cy;
    const dt = samples[i].timeMs - samples[i - 1].timeMs;
    if (dt <= 0) {
      continue;
    }
    totalDistance += Math.hypot(dx, dy);
    totalTime += dt;
  }

  return totalTime > 0 ? totalDistance / totalTime : 0;
}

export function calculatePathLength(
  points: ReadonlyArray<{ cx: number; cy: number }>
): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].cx - points[i - 1].cx;
    const dy = points[i].cy - points[i - 1].cy;
    length += Math.hypot(dx, dy);
  }
  return length;
}

export {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS
};
