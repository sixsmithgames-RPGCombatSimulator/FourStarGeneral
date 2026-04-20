export const AIR_SHOW_FIGHTER_SPEED_PX_PER_MS = 0.115;
export const AIR_SHOW_BOMBER_SPEED_PX_PER_MS = 0.0575;

const AIR_SHOW_SEQUENCE_TIME_SCALE = 3;
const AIR_SHOW_BOMBER_SPEED_MULTIPLIER = 0.8;
const AIR_SHOW_FIGHTER_SPEED_MULTIPLIER = 1.85;
const AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS = 1280;

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
  readonly fighterEgressDurationMs: number;
  readonly bomberStartDelayMs: number;
}

export function scaleAirShowSequenceMs(durationMs: number): number {
  return Math.max(1, Math.round(durationMs * AIR_SHOW_SEQUENCE_TIME_SCALE));
}

function scaleAirShowSpeedDuration(durationMs: number, speedMultiplier: number): number {
  const safeSpeed = Math.max(0.1, speedMultiplier);
  return scaleAirShowSequenceMs(Math.round(durationMs / safeSpeed));
}

export function resolveBomberInterceptIngressDurationMs(): number {
  return scaleAirShowSpeedDuration(1500, AIR_SHOW_BOMBER_SPEED_MULTIPLIER);
}

export function resolveFighterInterceptIngressDurationMs(): number {
  return scaleAirShowSpeedDuration(1250, AIR_SHOW_FIGHTER_SPEED_MULTIPLIER);
}

export function resolveBomberSortieIngressDurationMs(): number {
  return scaleAirShowSpeedDuration(2100, AIR_SHOW_BOMBER_SPEED_MULTIPLIER);
}

export function resolveBomberSortieEgressDurationMs(): number {
  return scaleAirShowSpeedDuration(1850, AIR_SHOW_BOMBER_SPEED_MULTIPLIER);
}

export function resolveFighterSortieIngressDurationMs(): number {
  return scaleAirShowSpeedDuration(1850, AIR_SHOW_FIGHTER_SPEED_MULTIPLIER);
}

export function resolveFighterSortieEgressDurationMs(): number {
  return scaleAirShowSpeedDuration(1600, AIR_SHOW_FIGHTER_SPEED_MULTIPLIER);
}

export function resolveAirInterceptBomberArrivalDelayMs(): number {
  return Math.max(0, resolveBomberInterceptIngressDurationMs() - resolveFighterInterceptIngressDurationMs());
}

export function buildResolvedAirCombatSceneTimingPolicy(
  baseBomberArrivalDelayMs = resolveAirInterceptBomberArrivalDelayMs()
): ResolvedAirCombatSceneTimingPolicy {
  const escortClashDurationMs = scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 1.24));

  return {
    fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 1.44),
    escortClashDurationMs,
    bomberIngressDurationMs: Math.round(resolveBomberInterceptIngressDurationMs() * 5.2),
    bomberPassDurationMs: scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 2.18)),
    strikeRunDurationMs: scaleAirShowSequenceMs(5120),
    egressDurationMs: scaleAirShowSequenceMs(920),
    bomberArrivalDelayMs: Math.max(0, Math.round(baseBomberArrivalDelayMs)) + escortClashDurationMs + scaleAirShowSequenceMs(260),
    bombReleaseProgress: 0.91
  };
}

export function buildCoordinatedAirClusterTimingPolicy(): CoordinatedAirClusterTimingPolicy {
  return {
    fighterIngressDurationMs: Math.round(resolveFighterInterceptIngressDurationMs() * 0.96),
    escortClashDurationMs: scaleAirShowSequenceMs(Math.round(AIR_SHOW_DOGFIGHT_ORBIT_BASE_MS * 1.24)),
    fighterEgressDurationMs: scaleAirShowSequenceMs(920),
    bomberStartDelayMs: scaleAirShowSequenceMs(880)
  };
}
