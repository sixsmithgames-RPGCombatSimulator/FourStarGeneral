import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  focusAndRevealWithinScrollOwner,
  revealElementWithinScrollOwner
} from "../src/ui/components/FocusedScrollReveal";

registerTest("FOCUSED_SCROLL_REVEAL_MOVES_ONLY_THE_DESIGNATED_OWNER", async ({ Given, When, Then }) => {
  const owner = document.createElement("div");
  const target = document.createElement("button");
  const outsider = document.createElement("button");
  owner.append(target);
  document.body.append(owner, outsider);
  owner.scrollTop = 40;
  Object.defineProperties(owner, {
    clientTop: { configurable: true, value: 3 },
    clientHeight: { configurable: true, value: 194 }
  });
  owner.getBoundingClientRect = () => ({ top: 100, bottom: 300 } as DOMRect);
  target.getBoundingClientRect = () => ({ top: 280, bottom: 340 } as DOMRect);
  outsider.getBoundingClientRect = () => ({ top: 320, bottom: 360 } as DOMRect);

  await Given("one focus target below its designated scroll pane and one unrelated target", async () => {});
  await When("the shared focus-reveal boundary focuses and reveals the owned target", async () => {
    focusAndRevealWithinScrollOwner(target, owner);
    revealElementWithinScrollOwner(owner, outsider);
  });
  await Then("only the designated owner's client viewport reveals the target and its focus ring", async () => {
    if (document.activeElement !== target || owner.scrollTop !== 85 || document.documentElement.scrollTop !== 0) {
      throw new Error(`Unexpected focus/scroll result: active=${document.activeElement?.tagName}, owner=${owner.scrollTop}.`);
    }
    owner.remove(); outsider.remove();
  });
});
