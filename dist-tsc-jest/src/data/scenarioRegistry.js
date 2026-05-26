import defaultScenario from "./scenario01.json";
import citadelRidgeScenario from "./scenario_citadel_ridge.json";
import townDefenseScenario from "./scenario_town_defense.json";
import riverWatchScenario from "./scenario_river_watch.json";
import pointeDuHocScenario from "./scenario_pointe_du_hoc.json";
import twoBridgesScenario from "./scenario_two_bridges.json";
import elAlameinScenario from "./scenario_el_alamein.json";
import kasserinePassScenario from "./scenario_kasserine_pass.json";
import gelaLandingsScenario from "./scenario_gela_landings.json";
import anzioBeachheadScenario from "./scenario_anzio_beachhead.json";
import monteCassinoScenario from "./scenario_monte_cassino.json";
import omahaBeachScenario from "./scenario_omaha_beach.json";
import carentanScenario from "./scenario_carentan.json";
import arnhemBridgeScenario from "./scenario_arnhem_bridge.json";
import falaisePocketScenario from "./scenario_falaise_pocket.json";
import hurtgenForestScenario from "./scenario_hurtgen_forest.json";
import bastogneScenario from "./scenario_bastogne.json";
import remagenScenario from "./scenario_remagen.json";
import { isValidMission } from "./missions";
import { assertScenarioSourceValid } from "./scenarioValidation";
const scenarioSourcesByMissionKey = {
    training: defaultScenario,
    patrol: townDefenseScenario,
    patrol_river_watch: riverWatchScenario,
    patrol_pointe_du_hoc: pointeDuHocScenario,
    assault_el_alamein: elAlameinScenario,
    assault_kasserine_pass: kasserinePassScenario,
    assault_gela_landings: gelaLandingsScenario,
    assault_anzio_beachhead: anzioBeachheadScenario,
    assault_monte_cassino: monteCassinoScenario,
    assault_omaha_beach: omahaBeachScenario,
    assault_carentan: carentanScenario,
    assault_arnhem_bridge: arnhemBridgeScenario,
    assault_falaise_pocket: falaisePocketScenario,
    assault_hurtgen_forest: hurtgenForestScenario,
    assault_citadel_ridge: citadelRidgeScenario,
    assault_bastogne: bastogneScenario,
    assault_remagen: remagenScenario,
    assault: twoBridgesScenario,
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
