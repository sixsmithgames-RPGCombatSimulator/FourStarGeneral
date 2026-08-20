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
  let transitionStatus: HTMLElement;
  let app: HTMLElement;

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
    app = document.createElement("main");
    app.id = "app";
    app.append(landing, campaign);
    document.body.append(app);
    transitionStatus = document.createElement("div");
    transitionStatus.id = "screenTransitionStatus";
    transitionStatus.className = "hidden";
    transitionStatus.setAttribute("aria-hidden", "true");
    transitionStatus.innerHTML = `<span data-screen-transition-copy></span>`;
    document.body.append(transitionStatus);

    manager = new ScreenManager();
    manager.registerScreen("landing", landing);
    manager.registerScreen("campaign", campaign);
    manager.showScreenById("landing");
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
    if (transitionStatus.classList.contains("hidden") || transitionStatus.getAttribute("aria-hidden") !== "false") {
      throw new Error("A visible transition status did not cover the destination paint boundary.");
    }
    if (!app.inert || app.getAttribute("aria-busy") !== "true" || document.activeElement !== transitionStatus) {
      throw new Error("Transition status did not block pointer/keyboard input and own focus during destination paint.");
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!campaign.classList.contains("screen-entering")) {
      throw new Error("Campaign entrance animation was not scheduled for the next frame.");
    }
    manager.endTransition();
    if (app.inert || app.hasAttribute("aria-busy")) {
      throw new Error("Transition completion did not restore application input.");
    }
  });
});
