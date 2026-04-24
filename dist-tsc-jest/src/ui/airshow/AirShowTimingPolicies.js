import { resolveAirInterceptBomberArrivalDelayMs, resolveBomberInterceptIngressDurationMs, resolveFighterInterceptIngressDurationMs, scaleAirShowSequenceMs } from "./AirShowPlaybackPolicy";
const AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS = 1280;
export function buildResolvedAirCombatSceneTimingPolicy(baseBomberArrivalDelayMs = resolveAirInterceptBomberArrivalDelayMs()) {
    const escortClashDurationMs = scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 1.24));
    return {
        fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 1.44),
        escortClashDurationMs,
        bomberIngressDurationMs: Math.round(resolveBomberInterceptIngressDurationMs() * 5.2),
        bomberPassDurationMs: scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 2.18)),
        strikeRunDurationMs: scaleAirShowSequenceMs(5120),
        egressDurationMs: scaleAirShowSequenceMs(920),
        bomberArrivalDelayMs: Math.max(0, Math.round(baseBomberArrivalDelayMs)) + escortClashDurationMs + scaleAirShowSequenceMs(260),
        bombReleaseProgress: 0.5
    };
}
export function buildCoordinatedAirClusterTimingPolicy() {
    return {
        fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 0.96),
        escortClashDurationMs: scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 1.24)),
        fighterEgressDurationMs: scaleAirShowSequenceMs(920),
        bomberStartDelayMs: scaleAirShowSequenceMs(880)
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
    const fighterIngressLeadMs = Math.max(configuredLeadMs, Math.round(fighterIngressDurationMs +
        escortClashDurationMs * 0.42 +
        220));
    return {
        bomberStartDelayMs: fighterIngressLeadMs,
        fighterIngressLeadMs
    };
}
