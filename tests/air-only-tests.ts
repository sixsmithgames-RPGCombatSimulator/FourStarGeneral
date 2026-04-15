import "./domEnvironment.js";
import { runAllTests } from "./harness.js";

// Import only air-related tests
import "./BattleScreen.airMissionPlayback.test.js";
import "./AirMissions.arrivals.test.js";
import "./AirMissions.globalPhase.test.js";
import "./AirInterception.parity.test.js";
import "./AirInterception.layered.test.js";
import "./AirInterception.radius.test.js";
import "./AirStrike.damageRounding.test.js";
import "./AirSupport.summary.test.js";
import "./BotAirHeuristic.test.js";
import "./AirCombatSceneBuilder.test.js";
import "./AirShow.fighterMotion.test.js";
import "./AirShow.progressTiming.test.js";
import "./AirShow.speedModel.test.js";
import "./AirShow.bomberSpeed.validation.test.js";
import "./AirShow.coordinatedPackage.test.js";
import "./AirShow.regression.test.js";

// Execute only air-related tests
(async () => {
  await runAllTests();
})();
