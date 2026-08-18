import { resolveSelectedOperationDestination } from "../src/ui/screens/LandingScreen.js";
import { registerTest } from "./harness.js";

registerTest("LANDING_RETAINED_CAMPAIGN_SELECTION_ROUTES_BACK_TO_CAMPAIGN", async ({ Given, When, Then }) => {
  let campaignDestination: ReturnType<typeof resolveSelectedOperationDestination> = "precombat";
  let battleDestination: ReturnType<typeof resolveSelectedOperationDestination> = "campaign";

  await Given("the landing screen retains a campaign selection after the player exits the strategic shell", async () => {});
  await When("the primary operation route is resolved for campaign and battle selections", async () => {
    campaignDestination = resolveSelectedOperationDestination("campaign");
    battleDestination = resolveSelectedOperationDestination("training");
  });
  await Then("campaign returns to the strategic shell while battle missions still enter precombat", async () => {
    if (campaignDestination !== "campaign" || battleDestination !== "precombat") {
      throw new Error(`Unexpected landing destinations: campaign=${campaignDestination}, battle=${battleDestination}`);
    }
  });
});
