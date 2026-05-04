import defaultScenario from "./scenario01.json";
import citadelRidgeScenario from "./scenario_citadel_ridge.json";
import townDefenseScenario from "./scenario_town_defense.json";
import riverWatchScenario from "./scenario_river_watch.json";
import { isValidMission } from "./missions";
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
 * Returns the validated scenario data source for a given mission key.
 * Throws with a clear message if the key is unrecognised or the scenario fails validation.
 */
export function getScenarioByMissionKey(missionKey) {
    if (!isValidMission(missionKey)) {
        throw new Error(`[scenarioRegistry] Unknown mission key: "${missionKey}". Valid keys are: ${Object.keys(scenarioSourcesByMissionKey).join(", ")}.`);
    }
    const scenario = scenarioSourcesByMissionKey[missionKey];
    assertScenarioSourceValid(scenario, missionKey);
    console.info("[scenarioRegistry] resolve scenario", { missionKey, name: scenario.name, size: scenario.size });
    return scenario;
}
