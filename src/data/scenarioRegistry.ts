import defaultScenario from "./scenario01.json";
import riverWatchScenario from "./scenario_river_watch.json";
import type { MissionKey } from "../state/UIState";
import { assertScenarioSourceValid } from "./scenarioValidation";

export type ScenarioSource = typeof defaultScenario | typeof riverWatchScenario;

const scenarioSourcesByMissionKey: Record<"training" | "patrol" | "patrol_river_watch" | "assault" | "campaign", ScenarioSource> = {
  training: defaultScenario as ScenarioSource,
  patrol: defaultScenario as ScenarioSource,
  patrol_river_watch: riverWatchScenario as ScenarioSource,
  assault: defaultScenario as ScenarioSource,
  campaign: defaultScenario as ScenarioSource
};

/**
 * Returns the raw scenario data source for a given mission key.
 */
export function getScenarioByMissionKey(missionKey: string): ScenarioSource {
  const resolvedKey = missionKey.trim() as MissionKey;
  if (!(resolvedKey in scenarioSourcesByMissionKey)) {
    throw new Error(`[scenarioRegistry] Unknown mission key: ${missionKey}`);
  }

  const scenario = scenarioSourcesByMissionKey[resolvedKey as keyof typeof scenarioSourcesByMissionKey];
  assertScenarioSourceValid(scenario, resolvedKey);

  const name = (scenario as { name?: string }).name;
  const size = (scenario as { size?: { cols?: number; rows?: number } }).size;
  console.info("[scenarioRegistry] resolve scenario", { missionKey: resolvedKey, name, size });
  return scenario;
}
