import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  SIDEBAR_MINI_TUTORIALS,
  SIDEBAR_MINI_TUTORIAL_EVENT,
  normalizeSidebarMiniTutorialKey
} from "../src/data/sidebarMiniTutorials";
import { getCombatPhases, getDeploymentPhases, getNextPhase } from "../src/data/tutorialSteps";
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

registerTest("MAIN_TUTORIAL_DOES_NOT_FORCE_SIDEBAR_PANEL_BRIEFS", async ({ Then }) => {
  await Then("deployment and combat flow skip sidebar mini-tutorial phases", async () => {
    const deploymentPhases = getDeploymentPhases();
    const combatPhases = getCombatPhases();

    expect(getNextPhase("place_units") === "begin_battle", "Main deployment tutorial should go from deployment to Begin Battle.");
    expect(getNextPhase("begin_battle") === "initiative_order", "Battle start should lead into the initiative order lesson.");
    expect(getNextPhase("initiative_order") === "initiative_group", "Initiative order should lead into active group teaching.");
    expect(getNextPhase("initiative_group") === "active_group_units", "Active group teaching should lead into selecting an eligible formation.");
    expect(getNextPhase("active_group_units") === "movement_intro", "Selecting an active formation should lead into movement teaching.");
    expect(!deploymentPhases.includes("roster_intro"), "Roster should be taught only by its sidebar mini tutorial.");
    expect(!deploymentPhases.includes("air_support_intro"), "Air Support should be taught only by its sidebar mini tutorial.");
    expect(getNextPhase("attack_intro") === "intel_overlay_expand", "Fire Orders should lead into the unit intel card before Lay Smoke.");
    expect(getNextPhase("intel_overlay_expand") === "smoke_demo", "Expanded intel should teach where Lay Smoke appears.");
    expect(getNextPhase("smoke_demo") === "spend_activation", "Smoke should not block the first recon activation.");
    expect(getNextPhase("spend_activation") === "enemy_activation", "The tutorial should spend the first activation before enemy tempo.");
    expect(combatPhases.includes("spend_activation"), "Combat tutorial should include a real activation-spend gate.");
    expect(getNextPhase("turn_end") === "complete", "Command loop should advance to the final certification step.");
    expect(getNextPhase("complete") === null, "Final certification should dismiss instead of looping.");
    expect(combatPhases.includes("next_unit"), "Combat tutorial should explain cycling active initiative groups.");
    expect(combatPhases.includes("skip_group"), "Combat tutorial should explain skipping an initiative group.");
    expect(combatPhases.includes("round_handoff"), "Combat tutorial should explain the initiative round handoff.");
    expect(!combatPhases.includes("air_missions"), "Air missions should not auto-open the Air sidebar during the main tutorial.");
    expect(!combatPhases.includes("logistics_intro"), "Logistics should not auto-open during the main tutorial.");
  });
});

registerTest("TUTORIAL_OVERLAY_DOES_NOT_CLICK_SIDEBAR_PANELS_TO_FIND_TARGETS", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;
  let airClicked = false;

  await Given("a sidebar air button exists but the air panel is closed", async () => {
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `
      <nav class="control-sidebar">
        <button type="button" data-popup="airSupport">Air</button>
      </nav>
    `;
    document.querySelector<HTMLButtonElement>("[data-popup='airSupport']")?.addEventListener("click", () => {
      airClicked = true;
    });
    overlay = new TutorialOverlay();
    overlay.initialize();
  });

  await When("a missing air-panel selector is requested for anchoring", async () => {
    (
      overlay as unknown as {
        ensureAnchorTarget: (selector: string) => void;
      }
    ).ensureAnchorTarget(".battle-popup[data-popup-key=\"airSupport\"] [data-air-panel]");
  });

  await Then("the tutorial waits instead of opening the sidebar itself", async () => {
    expect(!airClicked, "Tutorial anchoring should not click the Air Support sidebar button.");
    overlay.dispose();
  });
});

registerTest("TUTORIAL_FINAL_CERTIFICATION_RENDERS_BEFORE_DISMISSAL", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;
  const tutorialState = ensureTutorialState();

  await Given("the command loop step is visible with a highlight target", async () => {
    tutorialState.endTutorial();
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `
      <div class="initiative-turn-controls-container">Initiative controls</div>
      <div id="battleMapCanvas">Map</div>
    `;
    const initiativeControls = document.querySelector<HTMLElement>(".initiative-turn-controls-container");
    if (!initiativeControls) {
      throw new Error("Missing initiative controls fixture.");
    }
    setRect(initiativeControls, { left: 600, top: 80, width: 320, height: 80 });
    overlay = new TutorialOverlay();
    overlay.initialize();
    tutorialState.jumpToPhase("turn_end");
  });

  await When("the player confirms the command loop", async () => {
    const actionButton = document.querySelector<HTMLButtonElement>(".tutorial-action-btn");
    expect(actionButton?.textContent === "Command On", "Expected Command On action on the command loop step.");
    actionButton?.click();
  });

  await Then("the certification step is rendered and then dismisses the tutorial", async () => {
    const actionButton = document.querySelector<HTMLButtonElement>(".tutorial-action-btn");
    const title = document.querySelector<HTMLElement>(".tutorial-title")?.textContent ?? "";
    expect(title === "Command Certified", "Expected final certification title to render.");
    expect(actionButton?.textContent === "Dismiss", "Expected Dismiss action on final certification.");
    expect(tutorialState.getProgress().isActive, "Tutorial should remain active while final certification is visible.");

    actionButton?.click();
    expect(!tutorialState.getProgress().isActive, "Dismissing certification should end the tutorial.");
    overlay.dispose();
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
