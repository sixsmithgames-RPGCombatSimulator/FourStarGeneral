export const AIR_SHOW_FIGHTER_SPEED_PX_PER_MS = 0.115;
export const AIR_SHOW_BOMBER_SPEED_PX_PER_MS = 0.0575;
export const AIR_SHOW_ESCORT_ACCELERATION_PROGRESS = 0.15;
export const AIR_SHOW_FIGHTER_CLASH_START_PROGRESS = 0.2;
const AIR_SHOW_SEQUENCE_TIME_SCALE = 3;
const AIR_SHOW_BOMBER_SPEED_MULTIPLIER = 0.8;
const AIR_SHOW_FIGHTER_SPEED_MULTIPLIER = 1.85;
export function scaleAirShowSequenceMs(durationMs) {
    return Math.max(1, Math.round(durationMs * AIR_SHOW_SEQUENCE_TIME_SCALE));
}
function scaleAirShowSpeedDuration(durationMs, speedMultiplier) {
    const safeSpeed = Math.max(0.1, speedMultiplier);
    return scaleAirShowSequenceMs(Math.round(durationMs / safeSpeed));
}
export function resolveBomberInterceptIngressDurationMs() {
    return scaleAirShowSpeedDuration(1500, AIR_SHOW_BOMBER_SPEED_MULTIPLIER);
}
export function resolveFighterInterceptIngressDurationMs() {
    return scaleAirShowSpeedDuration(1250, AIR_SHOW_FIGHTER_SPEED_MULTIPLIER);
}
export function resolveBomberSortieIngressDurationMs() {
    return scaleAirShowSpeedDuration(2100, AIR_SHOW_BOMBER_SPEED_MULTIPLIER);
}
export function resolveBomberSortieEgressDurationMs() {
    return scaleAirShowSpeedDuration(1850, AIR_SHOW_BOMBER_SPEED_MULTIPLIER);
}
export function resolveFighterSortieIngressDurationMs() {
    return scaleAirShowSpeedDuration(1850, AIR_SHOW_FIGHTER_SPEED_MULTIPLIER);
}
export function resolveFighterSortieEgressDurationMs() {
    return scaleAirShowSpeedDuration(1600, AIR_SHOW_FIGHTER_SPEED_MULTIPLIER);
}
export function resolveAirInterceptBomberArrivalDelayMs() {
    return Math.max(0, resolveBomberInterceptIngressDurationMs() - resolveFighterInterceptIngressDurationMs());
}
