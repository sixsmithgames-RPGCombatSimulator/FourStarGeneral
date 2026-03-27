import "./domEnvironment.js";
import { runAllTests } from "./harness.js";

// Import only tests that do not rely on JSON module loading in Node. These specs use inline scenarios.
import "./HexMapRenderer.animateUnitMove.test.js";
import "./HexMapRenderer.focusOnHex.test.js";
import "./HexMapRenderer.muzzleFlash.test.js";
import "./HexMapRenderer.tacticalOverlays.test.js";
import "./RoadOverlayRenderer.test.js";
import "./ProceduralPrimitives.test.js";
import "./FrameSequenceAnimator.playback.test.js";
import "./SpriteSheetAnimator.layout.test.js";
import "./MapViewport.interactions.test.js";
import "./BattleScreen.animations.test.js";
import "./BattleScreen.missionFlow.test.js";
import "./deploymentZonePlanner.test.js";
import "./scenarioValidation.test.js";
import "./CampaignMapRenderer.render.test.js";
import "./CampaignState.observe.test.js";
import "./CampaignScreen.status.test.js";
import "./MissionRules.riverWatch.test.js";
import "./unlockPurchases.test.js";
// Air Support system tests
import "./AirMissions.arrivals.test.js";
import "./AirInterception.parity.test.js";
import "./AirInterception.layered.test.js";
import "./AirInterception.radius.test.js";
import "./AirStrike.damageRounding.test.js";
import "./AirSupport.summary.test.js";
import "./GroundLogistics.enforcement.test.js";
import "./InfantryActions.commandState.test.js";
import "./BotMovement.zeroFuelSupport.test.js";
import "./ReconLOS.directFire.test.js";
import "./ReconBike.balance.test.js";
import "./precombatLogisticsMinimum.test.js";

// Execute the registered tests sequentially.
(async () => {
  await runAllTests();
})();
