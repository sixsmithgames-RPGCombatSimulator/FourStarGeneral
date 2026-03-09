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
  const resolvedKey = missionKey.trim();
  let scenario: ScenarioSource;
  switch (missionKey) {
    case "patrol_river_watch":
      scenario = riverWatchScenario as ScenarioSource;
      break;
    default:
      scenario = defaultScenario as ScenarioSource;
      break;
  }

  const name = (scenario as { name?: string }).name;
  const size = (scenario as { size?: { cols?: number; rows?: number } }).size;
  console.info("[scenarioRegistry] resolve scenario", { missionKey: resolvedKey, name, size });
  return scenario;
}
