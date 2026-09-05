import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  SIDEBAR_MINI_TUTORIALS,
  SIDEBAR_MINI_TUTORIAL_EVENT,
  normalizeSidebarMiniTutorialKey
} from "../src/data/sidebarMiniTutorials";
import { getCombatPhases, getDeploymentPhases, getNextPhase, getPrecombatPhases, getTutorialStep, getTutorialStepNumber } from "../src/data/tutorialSteps";
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

  await Then("each panel has a concise multi-step brief with real highlight targets", async () => {
    for (const key of sidebarKeys) {
      const tutorial = SIDEBAR_MINI_TUTORIALS.find((candidate) => candidate.key === key);
      expect(Boolean(tutorial), `Missing sidebar mini tutorial for ${key}.`);
      expect(Boolean(tutorial?.label.trim()), `${key} mini tutorial needs a brief label.`);
      expect((tutorial?.steps.length ?? 0) >= 3, `${key} mini tutorial should teach at least three parts of its panel.`);
      for (const step of tutorial?.steps ?? []) {
        expect(Boolean(step.title.trim()), `${key} mini tutorial step needs a title.`);
        expect(Boolean(step.content.trim()), `${key} mini tutorial step needs content.`);
        expect(Boolean(step.highlightSelector.trim()), `${key} mini tutorial step needs a highlight selector.`);
        expect(Boolean(step.actionLabel?.trim() || step.actionHint?.trim()), `${key} mini tutorial step needs a next action.`);
        expect(step.content.length <= 190, `${key} mini tutorial step should stay compact.`);
      }
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
    expect(getNextPhase("initiative_order") === "active_group_units", "Initiative order should lead into selecting an eligible formation.");
    expect(getNextPhase("active_group_units") === "movement_intro", "Selecting an active formation should lead into movement teaching.");
    expect(!deploymentPhases.includes("roster_intro"), "Roster should be taught only by its sidebar mini tutorial.");
    expect(!deploymentPhases.includes("air_support_intro"), "Air Support should be taught only by its sidebar mini tutorial.");
    expect(getNextPhase("select_recon") === "select_howitzer", "Recon requisition should lead into the separate howitzer step.");
    expect(getNextPhase("select_howitzer") === "select_ammo", "Howitzer requisition should lead into logistics.");
    expect(getNextPhase("movement_intro") === "enemy_activation", "A successful recon move should hand initiative to the enemy.");
    expect(getNextPhase("enemy_activation") === "engineer_intro", "Enemy movement should lead into the engineer lesson.");
    expect(getNextPhase("engineer_intro") === "intel_overlay_expand", "Selecting engineers should lead into their order card.");
    expect(getNextPhase("intel_overlay_expand") === "engineer_orders", "The expanded order card should lead into real fortification work.");
    expect(getNextPhase("engineer_orders") === "enemy_response", "Completed fortifications should hand initiative back to the enemy.");
    expect(getNextPhase("enemy_response") === "artillery_support_intro", "The next friendly group should begin with the artillery support brief.");
    expect(getNextPhase("artillery_support_intro") === "select_artillery_observer", "The artillery support brief should lead into observer selection.");
    expect(getNextPhase("select_artillery_observer") === "artillery_intro", "A legal observer should lead into a real artillery request.");
    expect(getNextPhase("artillery_intro") === "post_artillery_enemy_response", "Queued artillery should let the enemy initiative group resolve before direct fire.");
    expect(getNextPhase("post_artillery_enemy_response") === "select_attack_unit", "The post-artillery enemy response should return to a direct-fire lesson.");
    expect(getNextPhase("select_attack_unit") === "attack_intro", "A legal firing unit should lead into a confirmed attack.");
    expect(getNextPhase("attack_intro") === "spend_activation", "A completed attack should lead into the initiative handoff.");
    expect(getNextPhase("spend_activation") === "round_handoff", "Advancing the group should show the initiative handoff.");
    expect(getNextPhase("round_handoff") === "select_smoke_unit", "The next friendly group should lead into the smoke lesson.");
    expect(getNextPhase("select_smoke_unit") === "smoke_demo", "A smoke-capable formation should lead into a real smoke order.");
    expect(getNextPhase("smoke_demo") === "complete", "A completed smoke screen should lead to final certification.");
    expect(getNextPhase("complete") === null, "Final certification should dismiss instead of looping.");
    expect(combatPhases.includes("spend_activation"), "The main tutorial should teach the real Next Group control.");
    expect(!combatPhases.includes("next_unit"), "The main tutorial should stay with the natural action sequence.");
    expect(!combatPhases.includes("skip_group"), "The main tutorial should not interrupt the first turn with optional controls.");
    expect(combatPhases.includes("round_handoff"), "The main tutorial should show the initiative handoff before smoke training.");
    expect(!combatPhases.includes("turn_end"), "The redundant battle routine step should stay out of the main tutorial.");
    expect(!combatPhases.includes("flak_intro"), "Air-defense controls belong in their sidebar brief, not the first-turn lesson.");
    expect(!combatPhases.includes("air_missions"), "Air missions should not auto-open the Air sidebar during the main tutorial.");
    expect(!combatPhases.includes("logistics_intro"), "Logistics should not auto-open during the main tutorial.");
    expect((getTutorialStep("base_camp")?.content.includes("Zone Alpha") ?? false), "Base-camp instructions should direct the player to Zone Alpha.");
    expect(getTutorialStep("movement_intro")?.waitForAction === true, "Movement tutorial should require a successful map move.");
    expect((getTutorialStep("movement_intro")?.content.includes("moves quickly") ?? false), "Movement tutorial should explain recon's speed.");
    expect((getTutorialStep("movement_intro")?.content.includes("lightly armed") ?? false), "Movement tutorial should explain recon's weakness.");
    expect((getTutorialStep("movement_intro")?.content.includes("Drag or scroll the map") ?? false), "Movement tutorial should teach map navigation.");
    const fortificationStep = getTutorialStep("engineer_orders");
    expect(fortificationStep?.waitForAction === true, "Fortifications should require a successful engineer order.");
    expect(fortificationStep?.title === "Build Fortifications", "The engineer lesson should use direct fortification language.");
    expect(
      fortificationStep?.content === "Click Fortify. Then choose the marked edge facing the nearest enemy.",
      "The engineer lesson should direct the player toward the enemy-facing edge."
    );
    expect(
      fortificationStep?.highlightSelector === "body:not(:has(#battleFortificationFacing:not(.hidden))) #battleIntelOverlay [data-selection-action='fortifications'], #battleFortificationFacing:not(.hidden) [data-fortification-recommended='true']",
      "The engineer lesson should follow the interaction from the Fortify order to the recommended edge."
    );
    expect(getTutorialStep("attack_intro")?.waitForAction === true, "Fire Orders should require a confirmed attack.");
    expect(getTutorialStep("artillery_support_intro")?.waitForAction === false, "Artillery support should be an explicit briefing before observer selection.");
    expect(
      getTutorialStep("artillery_support_intro")?.content.includes("Corps Artillery") === true,
      "Artillery support should identify the off-map Corps Artillery asset."
    );
    expect(getTutorialStep("artillery_intro")?.waitForAction === true, "Artillery should require a queued support request.");
    expect(getTutorialStep("select_smoke_unit")?.waitForAction === true, "Smoke training should require a smoke-capable formation.");
    expect(getTutorialStep("smoke_demo")?.waitForAction === true, "Smoke training should require a completed smoke screen.");
    expect(getTutorialStep("smoke_demo")?.content.includes("neighboring hex") === true, "Smoke should be taught as a close screen, not long-range mortar fire.");
    expect(getTutorialStep("enemy_activation")?.waitForAction === true, "Enemy Action should wait for initiative handoff instead of showing a premature Continue button.");
    expect((getTutorialStep("initiative_order")?.content.includes("battle clock") ?? false) === false, "Initiative copy should explain the UI without mystifying phrases.");
    expect(
      getTutorialStep("place_units")?.highlightSelector === "#autoDeployEvenly, #autoDeployGrouped",
      "Placement instructions should anchor near the deploy-mode buttons."
    );
    expect(getTutorialStep("place_units")?.position === "top", "Placement instructions should render above the deploy-mode controls.");
    expect(getTutorialStep("place_units")?.arrowDirection === "down", "Placement instructions should point directly at the deploy-mode controls.");
    expect(getTutorialStep("select_tanks")?.highlightFirstMatch === true, "Armor requisition should spotlight one required company at a time.");
    expect(
      getTutorialStep("select_tanks")?.highlightSelector?.includes("[data-quantity='0']") === true,
      "Armor requisition should advance the spotlight as each company is added."
    );
  });
});

registerTest("MAIN_TUTORIAL_STEP_NUMBERS_ARE_STATIC_AND_UNIQUE", async ({ Then }) => {
  await Then("every rendered main phase maps to one stable visible step number", async () => {
    const phases = [...getPrecombatPhases(), ...getDeploymentPhases(), ...getCombatPhases()];
    const numbers = phases.map((phase) => getTutorialStepNumber(phase));
    expect(numbers.every((number) => typeof number === "number"), "Every main tutorial phase should have a static step number.");
    expect(new Set(numbers).size === numbers.length, "Main tutorial phases should not reuse visible step numbers.");
    expect(numbers[0] === 1, "The first visible tutorial phase should be Step 1.");
    expect(numbers[numbers.length - 1] === phases.length, "The final visible step number should match the phase count.");
  });
});

registerTest("TUTORIAL_WAIT_BUTTON_USES_DIRECT_DISABLED_COPY", async ({ Given, Then }) => {
  let overlay: TutorialOverlay;
  const tutorialState = ensureTutorialState();

  await Given("a required-action tutorial step is visible", async () => {
    tutorialState.endTutorial();
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `<div id="battleMapCanvas"><div class="hex-cell initiative-group-highlight" data-tutorial-guided-hex="true">Recon Bike Patrol</div></div>`;
    setRect(document.querySelector<HTMLElement>(".initiative-group-highlight") as HTMLElement, { left: 160, top: 180, width: 80, height: 72 });
    overlay = new TutorialOverlay();
    overlay.initialize();
    tutorialState.startTutorial();
    tutorialState.advancePhase("active_group_units", false);
  });

  await Then("the disabled button is the full instruction and does not use the legacy waiting class", async () => {
    const actionButton = document.querySelector<HTMLButtonElement>(".tutorial-action-btn");
    expect(actionButton?.disabled === true, "Required-action tutorial steps should disable the tutorial button.");
    expect(actionButton?.textContent === "To continue, complete the action above", `Unexpected wait text: ${actionButton?.textContent ?? "<missing>"}.`);
    expect(actionButton?.classList.contains("waiting") === false, "Wait buttons should not use the legacy waiting class with appended copy.");
    overlay.dispose();
    tutorialState.endTutorial();
  });
});

registerTest("TUTORIAL_BACK_IS_AVAILABLE_ONLY_ON_REVERSIBLE_INFORMATION_STEPS", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;
  const tutorialState = ensureTutorialState();

  await Given("the tutorial is on an early reversible briefing", async () => {
    tutorialState.endTutorial();
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `
      <div id="allocationUnitList">Units</div>
      <div id="allocationSupportList">Support</div>
      <div id="allocationLogisticsList">Logistics</div>
      <div id="battleMapCanvas"><div class="hex-cell initiative-group-highlight" data-tutorial-guided-hex="true">Recon</div></div>
    `;
    document.querySelectorAll<HTMLElement>("div").forEach((element) => setRect(element, {}));
    overlay = new TutorialOverlay();
    overlay.initialize();
    tutorialState.jumpToPhase("unit_categories");
  });

  await Then("Back is visible and returns to the opening briefing", async () => {
    const backButton = document.querySelector<HTMLButtonElement>(".tutorial-back-btn");
    expect(backButton?.style.display !== "none", "The reversible briefing should expose Back.");
    backButton?.click();
    expect(tutorialState.getCurrentPhase() === "budget_overview", "Back should return to the previous reversible briefing.");
  });

  await When("the tutorial reaches a stateful battle action", async () => {
    tutorialState.jumpToPhase("active_group_units");
  });

  await Then("Back is hidden and cannot rewind the battle state", async () => {
    const backButton = document.querySelector<HTMLButtonElement>(".tutorial-back-btn");
    expect(backButton?.style.display === "none", "Stateful battle steps should hide Back.");
    backButton?.click();
    expect(tutorialState.getCurrentPhase() === "active_group_units", "A hidden Back control must not rewind a stateful phase.");
    overlay.dispose();
    tutorialState.endTutorial();
  });
});

registerTest("TUTORIAL_ACTION_USES_THE_AUTHORITATIVE_CURRENT_PHASE", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;
  const tutorialState = ensureTutorialState();

  await Given("an automatic action advanced the state before the overlay cache caught up", async () => {
    tutorialState.endTutorial();
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `
      <header class="battle-map-header">Command header</header>
      <div id="battleMapCanvas"></div>
    `;
    document.querySelectorAll<HTMLElement>("div, header").forEach((element) => setRect(element, {}));
    overlay = new TutorialOverlay();
    overlay.initialize();
    tutorialState.startTutorial();
    tutorialState.jumpToPhase("artillery_support_intro");
    (overlay as unknown as { currentStep: ReturnType<typeof getTutorialStep> }).currentStep = getTutorialStep("movement_intro");
  });

  await When("the player clicks Continue on the artillery briefing", async () => {
    document.querySelector<HTMLButtonElement>(".tutorial-action-btn")?.click();
  });

  await Then("the tutorial advances from the live phase instead of the stale cached step", async () => {
    expect(tutorialState.getCurrentPhase() === "select_artillery_observer", `Expected observer selection, received ${tutorialState.getCurrentPhase()}.`);
    overlay.dispose();
    tutorialState.endTutorial();
  });
});

registerTest("BATTLE_TUTORIAL_PROMPTS_DOCK_BELOW_THE_COMMAND_HEADER", async ({ Given, Then }) => {
  let overlay: TutorialOverlay;
  const tutorialState = ensureTutorialState();

  await Given("a battle tutorial step and command header are visible", async () => {
    tutorialState.endTutorial();
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `
      <header class="battle-map-header">Command header</header>
      <div id="battleMapCanvas"><div class="hex-cell initiative-group-highlight" data-tutorial-guided-hex="true">Recon</div></div>
    `;
    setRect(document.querySelector<HTMLElement>(".battle-map-header") as HTMLElement, {
      left: 120,
      top: 40,
      width: 980,
      height: 100
    });
    setRect(document.querySelector<HTMLElement>(".initiative-group-highlight") as HTMLElement, {
      left: 360,
      top: 320,
      width: 80,
      height: 72
    });
    overlay = new TutorialOverlay();
    overlay.initialize();
    tutorialState.jumpToPhase("active_group_units");
  });

  await Then("the prompt uses the stable top dock instead of a lower corner", async () => {
    const panel = document.querySelector<HTMLElement>(".tutorial-panel");
    expect(panel?.classList.contains("tutorial-battle-docked") === true, "Battle prompts should use the shared top dock.");
    expect(panel?.style.getPropertyValue("--tutorial-dock-top") === "152px", `Unexpected battle dock position: ${panel?.style.getPropertyValue("--tutorial-dock-top") ?? "<missing>"}.`);
    overlay.dispose();
    tutorialState.endTutorial();
  });
});

registerTest("MOBILE_BATTLE_TUTORIAL_PROMPTS_DOCK_BELOW_THE_HEADER", async ({ Given, Then }) => {
  let overlay: TutorialOverlay;
  const tutorialState = ensureTutorialState();

  await Given("a mobile battle tutorial step and command header are visible", async () => {
    tutorialState.endTutorial();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = window.MutationObserver;
    document.body.innerHTML = `
      <header class="battle-map-header">Command header</header>
      <div id="battleMapCanvas"><div class="hex-cell initiative-group-highlight" data-tutorial-guided-hex="true">Recon</div></div>
    `;
    setRect(document.querySelector<HTMLElement>(".battle-map-header") as HTMLElement, {
      left: 46,
      top: 138,
      width: 299,
      height: 123
    });
    setRect(document.querySelector<HTMLElement>(".initiative-group-highlight") as HTMLElement, {
      left: 180,
      top: 340,
      width: 44,
      height: 40
    });
    overlay = new TutorialOverlay();
    overlay.initialize();
    tutorialState.jumpToPhase("active_group_units");
  });

  await Then("the prompt clears the command header with the compact eight-pixel gap", async () => {
    const panel = document.querySelector<HTMLElement>(".tutorial-panel");
    expect(panel?.classList.contains("tutorial-battle-docked") === true, "Mobile battle prompts should use the shared top dock.");
    expect(panel?.style.getPropertyValue("--tutorial-dock-top") === "269px", `Unexpected mobile battle dock position: ${panel?.style.getPropertyValue("--tutorial-dock-top") ?? "<missing>"}.`);
    expect(panel?.style.top === "269px", "The mobile panel position should use the unobstructed dock.");
    overlay.dispose();
    tutorialState.endTutorial();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
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

  await Given("the final certification is visible", async () => {
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
    tutorialState.jumpToPhase("complete");
  });

  await When("the player reviews the final message", async () => {
    await Promise.resolve();
  });

  await Then("the certification step remains visible until the player dismisses it", async () => {
    const actionButton = document.querySelector<HTMLButtonElement>(".tutorial-action-btn");
    const skipButton = document.querySelector<HTMLButtonElement>(".tutorial-skip-btn");
    const title = document.querySelector<HTMLElement>(".tutorial-title")?.textContent ?? "";
    expect(title === "Ready For Battle", "Expected final tutorial title to render.");
    expect(actionButton?.textContent === "Dismiss", "Expected Dismiss action on final certification.");
    expect(skipButton?.style.display === "none", "Final certification should not offer a redundant Skip control.");
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
        <section id="armyRosterContent">
          <div class="army-roster-summary">Roster summary</div>
          <section data-roster-section="frontline">Frontline</section>
          <section data-roster-section="reserves">Reserves</section>
          <button data-open-battle-requisitions>Open Battle Requisitions</button>
        </section>
      </div>
    `;
    target = document.querySelector(".army-roster-summary") as HTMLElement;
    Array.from(document.querySelectorAll<HTMLElement>("#armyRosterContent > *")).forEach((element, index) => {
      setRect(element, { left: 140, top: 140 + index * 70, width: 420, height: 60 });
    });

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

  await Then("the mini tutorial begins a roster walkthrough anchored to the summary", async () => {
    const container = document.getElementById("tutorialOverlayContainer");
    const title = document.querySelector<HTMLElement>(".tutorial-title");
    const indicator = document.querySelector<HTMLElement>(".tutorial-step-indicator");
    const skip = document.querySelector<HTMLButtonElement>(".tutorial-skip-btn");

    expect(Boolean(container && !container.classList.contains("hidden")), "Expected mini tutorial overlay to be visible.");
    expect(container?.getAttribute("aria-modal") === "false", "Sidebar walkthroughs must leave their panel controls available.");
    expect(title?.textContent === "Order Of Battle", `Unexpected mini tutorial title: ${title?.textContent ?? "<missing>"}.`);
    expect(indicator?.textContent === "Roster Brief 1 of 4", `Unexpected mini tutorial indicator: ${indicator?.textContent ?? "<missing>"}.`);
    expect(skip?.textContent === "Close", `Expected mini tutorial skip button to read Close, received ${skip?.textContent ?? "<missing>"}.`);
    expect(target.classList.contains("tutorial-highlight"), "Expected the roster panel to be highlighted.");
  });

  await When("the player advances through every roster lesson", async () => {
    const action = document.querySelector<HTMLButtonElement>(".tutorial-action-btn");
    action?.click();
    expect(document.querySelector<HTMLElement>(".tutorial-title")?.textContent === "Frontline Readiness", "Expected frontline lesson second.");
    action?.click();
    expect(document.querySelector<HTMLElement>(".tutorial-title")?.textContent === "Reserves And Support", "Expected reserve lesson third.");
    action?.click();
    expect(document.querySelector<HTMLElement>(".tutorial-title")?.textContent === "Request Reinforcements", "Expected requisition lesson last.");
    const requisitionsButton = document.querySelector<HTMLButtonElement>("[data-open-battle-requisitions]");
    requisitionsButton?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  await Then("the brief closes and does not show again for that panel in the same session", async () => {
    const container = document.getElementById("tutorialOverlayContainer");
    expect(Boolean(container?.classList.contains("hidden")), "Expected mini tutorial overlay to be hidden after the full walkthrough.");

    document.dispatchEvent(
      new window.CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, {
        detail: { key: "armyRoster" }
      })
    );
    expect(Boolean(container?.classList.contains("hidden")), "Expected the seen roster mini tutorial to stay quiet.");

    overlay.dispose();
  });
});

registerTest("SIDEBAR_MINI_TUTORIAL_REQUIRED_ACTION_ADVANCES_AFTER_REAL_PANEL_USE", async ({ Given, When, Then }) => {
  let overlay: TutorialOverlay;
  let reportButton: HTMLButtonElement;

  await Given("the command post is open with an interactive report", async () => {
    window.sessionStorage.clear();
    ensureTutorialState().endTutorial();
    document.body.innerHTML = `
      <div id="warRoomOverlay">
        <div class="war-room-surface">
          <div data-war-room-command-strip>Operation status</div>
          <button type="button" class="war-room-hotspot">Open report</button>
          <section id="warRoomDetail" class="hidden">Detailed report</section>
        </div>
      </div>
    `;
    Array.from(document.querySelectorAll<HTMLElement>("#warRoomOverlay *")).forEach((element, index) => {
      setRect(element, { left: 120 + index * 10, top: 100 + index * 20, width: 320, height: 70 });
    });
    reportButton = document.querySelector(".war-room-hotspot") as HTMLButtonElement;
    reportButton.addEventListener("click", () => {
      document.getElementById("warRoomDetail")?.classList.remove("hidden");
    });
    overlay = new TutorialOverlay();
    overlay.initialize();

    document.dispatchEvent(
      new window.CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, {
        detail: { key: "baseOperations" }
      })
    );
  });

  await When("the player reaches the report lesson and opens a highlighted report", async () => {
    document.querySelector<HTMLButtonElement>(".tutorial-action-btn")?.click();
    const action = document.querySelector<HTMLButtonElement>(".tutorial-action-btn");
    const hint = document.querySelector<HTMLElement>(".tutorial-action-hint");
    expect(action?.hidden === true, "Required panel use should replace the action button instead of disabling it.");
    expect(hint?.hidden === false, "Required panel use should display a direct instruction.");
    reportButton.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  await Then("the brief advances to the opened report", async () => {
    expect(document.querySelector<HTMLElement>(".tutorial-title")?.textContent === "Read The Report", "Expected report detail lesson after opening a report.");
    expect(document.querySelector<HTMLElement>(".tutorial-step-indicator")?.textContent === "OPS Brief 3 of 3", "Expected final OPS brief progress.");
    expect(document.getElementById("warRoomDetail")?.classList.contains("tutorial-highlight") === true, "Expected the opened report to be highlighted.");
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
    expect(title?.textContent === "Welcome To Training", `Expected active training title, received ${title?.textContent ?? "<missing>"}.`);
    expect(indicator?.textContent?.startsWith("Step") === true, `Expected normal step indicator, received ${indicator?.textContent ?? "<missing>"}.`);

    overlay.dispose();
    ensureTutorialState().endTutorial();
  });
});
