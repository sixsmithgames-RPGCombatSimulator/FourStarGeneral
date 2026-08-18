/**
 * MODULE: ScreenManager.transition.test
 * WHAT: Certifies screen changes do not synchronously lay out heavyweight campaign content.
 * WHY: Forcing offsetWidth after revealing the campaign SVG blocked the browser main thread during campaign entry.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { ScreenManager } from "../src/ui/screens/ScreenManager";

registerTest("SCREEN_MANAGER_REVEALS_CAMPAIGN_WITHOUT_FORCED_REFLOW", async ({ Given, When, Then }) => {
  let landing: HTMLElement;
  let campaign: HTMLElement;
  let manager: ScreenManager;
  let synchronousLayoutReads = 0;

  await Given("a hidden heavyweight campaign screen and a visible landing screen", () => {
    landing = document.createElement("section");
    campaign = document.createElement("section");
    landing.className = "screen";
    campaign.className = "screen hidden";
    Object.defineProperty(campaign, "offsetWidth", {
      configurable: true,
      get: () => {
        synchronousLayoutReads += 1;
        return 1440;
      }
    });
    document.body.append(landing, campaign);

    manager = new ScreenManager();
    manager.registerScreen("landing", landing);
    manager.registerScreen("campaign", campaign);
  });

  await When("the commander enters the campaign", () => {
    manager.showScreenById("campaign");
  });

  await Then("the campaign is revealed without a synchronous layout read", async () => {
    if (synchronousLayoutReads !== 0) {
      throw new Error(`Campaign transition forced ${synchronousLayoutReads} synchronous layout read(s).`);
    }
    if (campaign.classList.contains("hidden") || !landing.classList.contains("hidden")) {
      throw new Error("Screen visibility did not transition to the campaign.");
    }
    if (campaign.getAttribute("aria-hidden") !== "false" || landing.getAttribute("aria-hidden") !== "true") {
      throw new Error("Screen accessibility visibility did not transition to the campaign.");
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!campaign.classList.contains("screen-entering")) {
      throw new Error("Campaign entrance animation was not scheduled for the next frame.");
    }
  });
});
