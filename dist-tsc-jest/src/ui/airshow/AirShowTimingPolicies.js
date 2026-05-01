import { resolveAirInterceptBomberArrivalDelayMs, resolveBomberInterceptIngressDurationMs, resolveFighterInterceptIngressDurationMs, scaleAirShowSequenceMs } from "./AirShowPlaybackPolicy";
const AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS = 320;
export function buildResolvedAirCombatSceneTimingPolicy(baseBomberArrivalDelayMs = resolveAirInterceptBomberArrivalDelayMs()) {
    const escortClashDurationMs = scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 1.82));
    return {
        fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 1.66),
        escortClashDurationMs,
        bomberIngressDurationMs: Math.round(resolveBomberInterceptIngressDurationMs() * 0.48),
        bomberPassDurationMs: scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 2.28)),
        strikeRunDurationMs: scaleAirShowSequenceMs(5120),
        egressDurationMs: scaleAirShowSequenceMs(920),
        bomberArrivalDelayMs: Math.max(0, Math.round(baseBomberArrivalDelayMs * 0.14))
            + Math.round(escortClashDurationMs * 0.14)
            + scaleAirShowSequenceMs(48),
        bombReleaseProgress: 0.56
    };
}
export function buildCoordinatedAirClusterTimingPolicy() {
    const sharedSceneTimings = buildResolvedAirCombatSceneTimingPolicy(0);
    return {
        fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 1.14),
        escortClashDurationMs: sharedSceneTimings.escortClashDurationMs,
        bomberIngressDurationMs: sharedSceneTimings.bomberIngressDurationMs,
        bomberPassDurationMs: sharedSceneTimings.bomberPassDurationMs,
        strikeRunDurationMs: sharedSceneTimings.strikeRunDurationMs,
        egressDurationMs: sharedSceneTimings.egressDurationMs,
        bomberStartDelayMs: scaleAirShowSequenceMs(120),
        bombReleaseProgress: sharedSceneTimings.bombReleaseProgress
    };
}
export function resolveCoordinatedAirClusterLeadWindow(fighterScenePresent, strikePlanCount, fighterIngressDurationMs, escortClashDurationMs, configuredBomberStartDelayMs) {
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
    const fighterIngressLeadMs = Math.max(configuredLeadMs, Math.round(fighterIngressDurationMs * 0.36 +
        escortClashDurationMs * 0.12 +
        48));
    return {
        bomberStartDelayMs: fighterIngressLeadMs,
        fighterIngressLeadMs
    };
}
