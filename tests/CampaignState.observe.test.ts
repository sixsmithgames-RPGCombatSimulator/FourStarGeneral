import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { ensureCampaignState } from "../src/state/CampaignState";
import type { CampaignScenarioData } from "../src/core/campaignTypes";

registerTest("CAMPAIGN_STATE_NOTIFIES", async ({ Given, When, Then }) => {
  const state = ensureCampaignState();
  state.reset();
  const calls: string[] = [];

  await Given("a subscriber is registered", async () => {
    state.subscribe((reason) => calls.push(reason));
  });

  const scenario: CampaignScenarioData = {
    key: "obs_test",
    title: "Observe",
    description: "",
    dimensions: { cols: 1, rows: 1 },
    background: { imageUrl: "about:blank" },
    tilePalette: {},
    tiles: [],
    fronts: [],
    objectives: [],
    economies: []
  };

  await When("scenario and engagements are updated", async () => {
    state.setScenario(scenario);
    state.setPendingEngagements([{ id: "e1", frontKey: null, objectiveKey: null, attacker: "Player", defender: "Bot", hexKeys: [], tags: [] }]);
  });

  await Then("listeners receive notifications", async () => {
    if (!calls.includes("scenarioLoaded")) throw new Error("scenarioLoaded not emitted");
    if (!calls.includes("engagementsUpdated")) throw new Error("engagementsUpdated not emitted");
  });
});
