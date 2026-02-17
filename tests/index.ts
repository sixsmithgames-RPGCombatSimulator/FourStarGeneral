import "./domEnvironment.js";
import { runAllTests } from "./harness.js";

// Import only tests that do not rely on JSON module loading in Node. These specs use inline scenarios.
import "./HexMapRenderer.animateUnitMove.test.js";
import "./HexMapRenderer.focusOnHex.test.js";
import "./MapViewport.interactions.test.js";
import "./BattleScreen.animations.test.js";
import "./CampaignMapRenderer.render.test.js";
import "./CampaignState.observe.test.js";
// Air Support system tests
import "./AirMissions.arrivals.test.js";
import "./AirInterception.parity.test.js";
import "./AirInterception.layered.test.js";
import "./AirInterception.radius.test.js";
import "./AirStrike.damageRounding.test.js";
import "./AirSupport.summary.test.js";

// Execute the registered tests sequentially.
(async () => {
  await runAllTests();
})();
