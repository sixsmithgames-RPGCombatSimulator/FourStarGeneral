export {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS
} from "./AirShowTimeline";

const AIR_SHOW_SEQUENCE_TIME_SCALE = 3;

export function scaleAirShowSequenceMs(durationMs: number): number {
  return Math.max(1, Math.round(durationMs * AIR_SHOW_SEQUENCE_TIME_SCALE));
}
