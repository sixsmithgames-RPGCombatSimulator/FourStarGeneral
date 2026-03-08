import defaultScenario from "./scenario01.json";
import riverWatchScenario from "./scenario_river_watch.json";

// ScenarioSource is intentionally loose (any) because map JSON varies; downstream code normalizes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScenarioSource = any;

/**
 * Returns the raw scenario data source for a given mission key.
 * Falls back to the default scenario when no specialized map exists.
 */
export function getScenarioByMissionKey(missionKey: string): ScenarioSource {
  switch (missionKey) {
    case "patrol_river_watch":
      return riverWatchScenario as ScenarioSource;
    default:
      return defaultScenario as ScenarioSource;
  }
}
