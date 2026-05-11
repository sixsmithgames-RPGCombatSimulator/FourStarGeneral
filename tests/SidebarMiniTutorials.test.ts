import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  SIDEBAR_MINI_TUTORIALS,
  SIDEBAR_MINI_TUTORIAL_EVENT,
  normalizeSidebarMiniTutorialKey
} from "../src/data/sidebarMiniTutorials";
import { ensureTutorialState } from "../src/state/TutorialState";
import { TutorialOverlay } from "../src/ui/components/TutorialOverlay";

const expect = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const setRect = (element: HTMLElement, rect: Partial<DOMRect>): void => {
  const resolved = {
    left: rect.left ?? 120,
    top: rect.top ?? 120,
    width: rect.width ?? 360,
    height: rect.height ?? 220
  };
  element.getBoundingClientRect = () =>
    ({
      left: resolved.left,
      top: resolved.top,
      right: resolved.left + resolved.width,
      bottom: resolved.top + resolved.height,
      width: resolved.width,
      height: resolved.height,
      x: resolved.left,
      y: resolved.top,
      toJSON: () => ({})
    }) as DOMRect;
};

registerTest("SIDEBAR_MINI_TUTORIALS_COVER_EVERY_BATTLE_SIDEBAR_ITEM", async ({ Given, Then }) => {
  const sidebarKeys = ["baseOperations", "generalProfile", "recon", "airSupport", "logistics", "armyRoster"];

  await Given("the battle sidebar exposes six command panels", async () => {
    expect(SIDEBAR_MINI_TUTORIALS.length === sidebarKeys.length, "Expected one mini tutorial per battle sidebar panel.");
  });

  await Then("each panel has concise briefing data and a real highlight target selector", async () => {
    for (const key of sidebarKeys) {
      const tutorial = SIDEBAR_MINI_TUTORIALS.find((candidate) => candidate.key === key);
      expect(Boolean(tutorial), `Missing sidebar mini tutorial for ${key}.`);
      expect(Boolean(tutorial?.title.trim()), `${key} mini tutorial needs a title.`);
      expect(Boolean(tutorial?.content.trim()), `${key} mini tutorial needs content.`);
      expect(Boolean(tutorial?.highlightSelector.trim()), `${key} mini tutorial needs a highlight selector.`);
      expect(Boolean(tutorial?.actionLabel.trim()), `${key} mini tutorial needs an action label.`);
      expect((tutorial?.content.length ?? 0) <= 190, `${key} mini tutorial should stay compact.`);
    }

    expect(normalizeSidebarMiniTutorialKey("supplies") === "logistics", "Supplies should route into the combined Logistics tutorial.");
  });
});

registerTest("SIDEBAR_MINI_TUTORIAL_EVENT_RENDERS_DISMISSES_AND_PERSISTS", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;
  let target: HTMLElement;

  await Given("a roster popup is visible and the mini tutorial store is clear", async () => {
    window.sessionStorage.clear();
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    ensureTutorialState().endTutorial();

    document.body.innerHTML = `
      <div class="battle-popup" data-popup-key="armyRoster">
        <section id="armyRosterContent">Roster body</section>
      </div>
    `;
    target = document.getElementById("armyRosterContent") as HTMLElement;
    setRect(target, { left: 140, top: 140, width: 420, height: 260 });

    overlay = new TutorialOverlay();
    overlay.initialize();
  });

  await When("the roster command brief event is dispatched", async () => {
    document.dispatchEvent(
      new window.CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, {
        detail: { key: "armyRoster" }
      })
    );
  });

  await Then("the mini tutorial appears as a command brief anchored to the open panel", async () => {
    const container = document.getElementById("tutorialOverlayContainer");
    const title = document.querySelector<HTMLElement>(".tutorial-title");
    const indicator = document.querySelector<HTMLElement>(".tutorial-step-indicator");
    const skip = document.querySelector<HTMLButtonElement>(".tutorial-skip-btn");

    expect(Boolean(container && !container.classList.contains("hidden")), "Expected mini tutorial overlay to be visible.");
    expect(title?.textContent === "ROSTER: Order of Battle", `Unexpected mini tutorial title: ${title?.textContent ?? "<missing>"}.`);
    expect(indicator?.textContent === "Command Brief", `Unexpected mini tutorial indicator: ${indicator?.textContent ?? "<missing>"}.`);
    expect(skip?.textContent === "Close", `Expected mini tutorial skip button to read Close, received ${skip?.textContent ?? "<missing>"}.`);
    expect(target.classList.contains("tutorial-highlight"), "Expected the roster panel to be highlighted.");
  });

  await When("the player acknowledges the brief", async () => {
    document.querySelector<HTMLButtonElement>(".tutorial-action-btn")?.click();
  });

  await Then("the brief closes and does not show again for that panel in the same session", async () => {
    const container = document.getElementById("tutorialOverlayContainer");
    expect(Boolean(container?.classList.contains("hidden")), "Expected mini tutorial overlay to be hidden after acknowledgement.");

    document.dispatchEvent(
      new window.CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, {
        detail: { key: "armyRoster" }
      })
    );
    expect(Boolean(container?.classList.contains("hidden")), "Expected the seen roster mini tutorial to stay quiet.");

    overlay.dispose();
  });
});

registerTest("SIDEBAR_MINI_TUTORIALS_DO_NOT_INTERRUPT_ACTIVE_TRAINING", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;

  await Given("the main training tutorial is already active", async () => {
    window.sessionStorage.clear();
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `<section id="logisticsPanel">Logistics body</section>`;
    setRect(document.getElementById("logisticsPanel") as HTMLElement, { left: 160, top: 160, width: 360, height: 220 });

    overlay = new TutorialOverlay();
    overlay.initialize();
    ensureTutorialState().startTutorial();
  });

  await When("a sidebar panel requests its mini tutorial", async () => {
    document.dispatchEvent(
      new window.CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, {
        detail: { key: "logistics" }
      })
    );
  });

  await Then("the full training tutorial keeps control of the overlay", async () => {
    const title = document.querySelector<HTMLElement>(".tutorial-title");
    const indicator = document.querySelector<HTMLElement>(".tutorial-step-indicator");
    expect(title?.textContent === "Field Command", `Expected active training title, received ${title?.textContent ?? "<missing>"}.`);
    expect(indicator?.textContent?.startsWith("Step") === true, `Expected normal step indicator, received ${indicator?.textContent ?? "<missing>"}.`);

    overlay.dispose();
    ensureTutorialState().endTutorial();
  });
});
