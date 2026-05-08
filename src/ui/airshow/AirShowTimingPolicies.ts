import {
  resolveAirInterceptBomberArrivalDelayMs,
  resolveBomberInterceptIngressDurationMs,
  resolveFighterInterceptIngressDurationMs,
  scaleAirShowSequenceMs
} from "./AirShowPlaybackPolicy";

const AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS = 320;

export interface ResolvedAirCombatSceneTimingPolicy {
  readonly fighterIngressDurationMs: number;
  readonly escortClashDurationMs: number;
  readonly bomberIngressDurationMs: number;
  readonly bomberPassDurationMs: number;
  readonly strikeRunDurationMs: number;
  readonly egressDurationMs: number;
  readonly bomberArrivalDelayMs: number;
  readonly bombReleaseProgress: number;
}

export type ResolvedAirCombatSceneTimingOverrides = Partial<ResolvedAirCombatSceneTimingPolicy>;

export interface CoordinatedAirClusterTimingPolicy {
  readonly fighterIngressDurationMs: number;
  readonly escortClashDurationMs: number;
  readonly bomberIngressDurationMs: number;
  readonly bomberPassDurationMs: number;
  readonly strikeRunDurationMs: number;
  readonly egressDurationMs: number;
  readonly bomberStartDelayMs: number;
  readonly bombReleaseProgress: number;
}

export interface CoordinatedAirClusterLeadWindow {
  readonly bomberStartDelayMs: number;
  readonly fighterIngressLeadMs: number;
}

export function buildResolvedAirCombatSceneTimingPolicy(
  baseBomberArrivalDelayMs = resolveAirInterceptBomberArrivalDelayMs()
): ResolvedAirCombatSceneTimingPolicy {
  const escortClashDurationMs = scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 1.82));

  return {
    fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 1.66),
    escortClashDurationMs,
    bomberIngressDurationMs: Math.round(resolveBomberInterceptIngressDurationMs() * 0.48),
    bomberPassDurationMs: scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 2.28)),
    strikeRunDurationMs: scaleAirShowSequenceMs(5120),
    egressDurationMs: scaleAirShowSequenceMs(920),
    bomberArrivalDelayMs:
      Math.max(0, Math.round(baseBomberArrivalDelayMs * 0.14))
      + Math.round(escortClashDurationMs * 0.14)
      + scaleAirShowSequenceMs(48),
    bombReleaseProgress: 0.56
  };
}

export function buildCoordinatedAirClusterTimingPolicy(): CoordinatedAirClusterTimingPolicy {
  const sharedSceneTimings = buildResolvedAirCombatSceneTimingPolicy(0);

  return {
    fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 1.14),
    escortClashDurationMs: sharedSceneTimings.escortClashDurationMs,
    bomberIngressDurationMs: Math.round(sharedSceneTimings.bomberIngressDurationMs * 1.04),
    bomberPassDurationMs: sharedSceneTimings.bomberPassDurationMs,
    strikeRunDurationMs: sharedSceneTimings.strikeRunDurationMs,
    egressDurationMs: sharedSceneTimings.egressDurationMs,
    bomberStartDelayMs: scaleAirShowSequenceMs(120),
    bombReleaseProgress: sharedSceneTimings.bombReleaseProgress
  };
}

export function resolveCoordinatedAirClusterLeadWindow(
  fighterScenePresent: boolean,
  strikePlanCount: number,
  fighterIngressDurationMs: number,
  escortClashDurationMs: number,
  configuredBomberStartDelayMs: number
): CoordinatedAirClusterLeadWindow {
  if (strikePlanCount <= 0) {
    return {
      bomberStartDelayMs: 0,
      fighterIngressLeadMs: 0
    };
  }

  const configuredLeadMs = Math.max(0, Math.round(configuredBomberStartDelayMs));
  if (!fighterScenePresent) {
    return {
      bomberStartDelayMs: configuredLeadMs,
      fighterIngressLeadMs: 0
    };
  }

  const fighterIngressLeadMs = Math.max(
    configuredLeadMs,
    Math.round(
      fighterIngressDurationMs * 0.36 +
      escortClashDurationMs * 0.12 +
      48
    )
  );

  return {
    bomberStartDelayMs: fighterIngressLeadMs,
    fighterIngressLeadMs
  };
}
