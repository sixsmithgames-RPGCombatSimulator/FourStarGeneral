import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { ensureTutorialState } from "../src/state/TutorialState";
import { TutorialOverlay } from "../src/ui/components/TutorialOverlay";

registerTest("TUTORIAL_OVERLAY_COMBINES_MULTI_TARGET_BOUNDS_AND_HIGHLIGHTS_EACH_MATCH", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;
  let firstTarget: HTMLElement;
  let secondTarget: HTMLElement;
  let spotlight: HTMLElement | null = null;

  await Given("two highlighted tutorial targets in different positions", async () => {
    document.body.innerHTML = `
      <div id="targetOne"></div>
      <div id="targetTwo"></div>
    `;

    firstTarget = document.getElementById("targetOne") as HTMLElement;
    secondTarget = document.getElementById("targetTwo") as HTMLElement;

    firstTarget.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 120,
        right: 260,
        bottom: 220,
        width: 160,
        height: 100,
        x: 100,
        y: 120,
        toJSON: () => ({})
      }) as DOMRect;
    secondTarget.getBoundingClientRect = () =>
      ({
        left: 420,
        top: 280,
        right: 640,
        bottom: 420,
        width: 220,
        height: 140,
        x: 420,
        y: 280,
        toJSON: () => ({})
      }) as DOMRect;

    overlay = new TutorialOverlay();
    overlay.initialize();
  });

  await When("the overlay positions a spotlight for a grouped selector", async () => {
    ensureTutorialState().highlightElement("#targetOne, #targetTwo");
    (
      overlay as unknown as {
        positionSpotlight: (selector: string) => void;
      }
    ).positionSpotlight("#targetOne, #targetTwo");

    spotlight = document.querySelector<HTMLElement>(".tutorial-spotlight");
  });

  await Then("the spotlight spans the combined bounds and both targets receive highlight styling", async () => {
    if (!spotlight) {
      throw new Error("Expected tutorial spotlight element to exist after initialization.");
    }

    if (spotlight.style.left !== "92px" || spotlight.style.top !== "112px") {
      throw new Error(`Expected spotlight to start at the padded minimum bounds, received left=${spotlight.style.left} top=${spotlight.style.top}.`);
    }

    if (spotlight.style.width !== "556px" || spotlight.style.height !== "316px") {
      throw new Error(`Expected spotlight to cover both targets, received width=${spotlight.style.width} height=${spotlight.style.height}.`);
    }

    if (!firstTarget.classList.contains("tutorial-highlight") || !secondTarget.classList.contains("tutorial-highlight")) {
      throw new Error("Expected every selector match to receive tutorial-highlight styling.");
    }

    overlay.dispose();
  });
});
