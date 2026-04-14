import defaultScenario from "./scenario01.json";
import citadelRidgeScenario from "./scenario_citadel_ridge.json";
import townDefenseScenario from "./scenario_town_defense";
import riverWatchScenario from "./scenario_river_watch.json";
import { assertScenarioSourceValid } from "./scenarioValidation";
const scenarioSourcesByMissionKey = {
    training: defaultScenario,
    patrol: townDefenseScenario,
    patrol_river_watch: riverWatchScenario,
    assault_citadel_ridge: citadelRidgeScenario,
    assault: defaultScenario,
    campaign: defaultScenario
};
/**
 * Returns the raw scenario data source for a given mission key.
 */
export function getScenarioByMissionKey(missionKey) {
    const resolvedKey = missionKey.trim();
    if (!(resolvedKey in scenarioSourcesByMissionKey)) {
        throw new Error(`[scenarioRegistry] Unknown mission key: ${missionKey}`);
    }
    const scenario = scenarioSourcesByMissionKey[resolvedKey];
    assertScenarioSourceValid(scenario, resolvedKey);
    const name = scenario.name;
    const size = scenario.size;
    console.info("[scenarioRegistry] resolve scenario", { missionKey: resolvedKey, name, size });
    return scenario;
}
