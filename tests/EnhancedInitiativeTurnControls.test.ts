import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { EnhancedInitiativeTurnControls } from "../src/ui/components/EnhancedInitiativeTurnControls";

const expect = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const noopEvents = {
  onSkipTurn: () => {},
  onEndTurn: () => {},
  onNextGroup: () => {},
  onNextActivation: () => {},
  onCompleteActivation: () => {},
  onProceedToNext: () => {},
  onSkipGroup: () => {}
};

registerTest("ENHANCED_INITIATIVE_CONTROLS_SURFACE_TUTORIAL_STATUS", async ({ Given, When, Then }) => {
  let controls: EnhancedInitiativeTurnControls;
  let container: HTMLElement;

  await Given("enhanced initiative controls are mounted", async () => {
    document.body.innerHTML = "<div id=\"initiativeControls\"></div>";
    container = document.getElementById("initiativeControls") as HTMLElement;
    controls = new EnhancedInitiativeTurnControls(container, noopEvents);
  });

  await When("a player initiative group becomes active", async () => {
    controls.updatePhase("initiativeTurn");
    controls.updateCurrentGroup({
      initiative: 7,
      isCompleted: false,
      currentUnitIndex: 0,
      units: [
        { unitId: "recon-1", ownerId: "player", initiative: 7, isActivated: false, sortOrder: 0 },
        { unitId: "recon-2", ownerId: "player", initiative: 7, isActivated: true, sortOrder: 1 }
      ]
    });
    controls.updateCurrentUnit({ unitId: "recon-1", ownerId: "player", initiative: 7, isActivated: false, sortOrder: 0 });
    controls.updatePlayerTurn(true);
  });

  await Then("the compact status names the active initiative band for tutorial anchoring", async () => {
    const status = container.querySelector<HTMLElement>("[data-initiative-status]");
    const label = status?.querySelector<HTMLElement>(".initiative-status__label");
    const value = status?.querySelector<HTMLElement>(".initiative-status__value");
    const detail = status?.querySelector<HTMLElement>(".initiative-status__detail");

    expect(Boolean(status), "Expected initiative status element to be rendered.");
    expect(status?.dataset.currentInitiativeGroup === "7", "Expected current initiative group data to be exposed.");
    expect(label?.textContent === "Initiative 7", `Unexpected initiative status label: ${label?.textContent ?? "<missing>"}.`);
    expect(value?.textContent === "Your group", `Unexpected initiative status value: ${value?.textContent ?? "<missing>"}.`);
    expect(detail?.textContent === "1 formation ready", `Unexpected initiative detail: ${detail?.textContent ?? "<missing>"}.`);
    expect(container.querySelector(".next-activation-btn")?.textContent?.trim() === "Next Formation", "Expected a plain-language formation selector.");
    expect(container.querySelector(".skip-group-btn")?.textContent?.trim() === "Hold Group", "Expected a plain-language hold command.");
    expect(container.querySelector(".group-advance-btn")?.textContent?.trim() === "Next Group", "Expected the primary command to advance only the active group.");
    expect(!/\p{Extended_Pictographic}/u.test(container.textContent ?? ""), "Expected initiative status to use plain language rather than operating-system emoji.");

    controls.dispose();
  });
});

registerTest("ENHANCED_INITIATIVE_CONTROLS_DISPATCH_MATCHES_VISIBLE_SCOPE", async ({ Given, When, Then }) => {
  let controls: EnhancedInitiativeTurnControls;
  let container: HTMLElement;
  let nextGroupCalls = 0;
  let endTurnCalls = 0;
  let disabledDuringEnemyInitiative = false;

  await Given("the adaptive initiative command is mounted for a player group", async () => {
    document.body.innerHTML = "<div id=\"initiativeControls\"></div>";
    container = document.getElementById("initiativeControls") as HTMLElement;
    controls = new EnhancedInitiativeTurnControls(container, {
      ...noopEvents,
      onNextGroup: () => {
        nextGroupCalls += 1;
      },
      onEndTurn: () => {
        endTurnCalls += 1;
      }
    });
    controls.updatePhase("initiativeTurn");
    controls.updateCurrentGroup({
      initiative: 5,
      isCompleted: false,
      currentUnitIndex: 0,
      units: [{ unitId: "infantry-1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 }]
    });
    controls.updateCurrentUnit({ unitId: "infantry-1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 });
    controls.updatePlayerTurn(true);
  });

  await When("the player advances a group and later ends the drained round", async () => {
    const advanceButton = container.querySelector<HTMLButtonElement>(".group-advance-btn");
    advanceButton?.click();
    controls.updateCurrentUnit({ unitId: "enemy-1", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 1 });
    controls.updatePlayerTurn(false);
    controls.setControlsEnabled(true);
    disabledDuringEnemyInitiative = advanceButton?.disabled === true;
    advanceButton?.click();
    controls.updateCurrentUnit(null);
    controls.updateCurrentGroup(null);
    controls.updatePlayerTurn(false);
    controls.updateRoundAdvanceReady(true);
    advanceButton?.click();
  });

  await Then("each label dispatches only the action it names", async () => {
    const advanceButton = container.querySelector<HTMLButtonElement>(".group-advance-btn");
    expect(nextGroupCalls === 1, `Expected one Next Group callback, received ${nextGroupCalls}.`);
    expect(endTurnCalls === 1, `Expected one End Turn callback, received ${endTurnCalls}.`);
    expect(disabledDuringEnemyInitiative, "Expected Next Group to remain disabled during enemy initiative.");
    expect(advanceButton?.textContent?.trim() === "End Turn", `Expected final action label, received ${advanceButton?.textContent?.trim() ?? "<missing>"}.`);
    controls.dispose();
  });
});

registerTest("ENHANCED_INITIATIVE_CONTROLS_IGNORE_ENTER_FROM_DIALOG_CONTROLS", async ({ Given, When, Then }) => {
  let controls: EnhancedInitiativeTurnControls;
  let endTurnCalls = 0;
  let nextGroupCalls = 0;
  let edgeButton: HTMLButtonElement;

  await Given("initiative controls are active behind an edge-selection dialog", async () => {
    document.body.innerHTML = `
      <div id="initiativeControls"></div>
      <div role="dialog" aria-modal="true"><button id="edgeButton">NW</button></div>
    `;
    const container = document.getElementById("initiativeControls") as HTMLElement;
    controls = new EnhancedInitiativeTurnControls(container, {
      ...noopEvents,
      onNextGroup: () => {
        nextGroupCalls += 1;
      },
      onEndTurn: () => {
        endTurnCalls += 1;
      }
    });
    controls.updatePhase("initiativeTurn");
    controls.updateCurrentGroup({
      initiative: 5,
      isCompleted: false,
      currentUnitIndex: 0,
      units: [{ unitId: "infantry-1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 }]
    });
    controls.updateCurrentUnit({ unitId: "infantry-1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 });
    controls.updatePlayerTurn(true);
    edgeButton = document.getElementById("edgeButton") as HTMLButtonElement;
  });

  await When("the player presses Enter on the dialog control", async () => {
    edgeButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });

  await Then("the global initiative shortcut does not end the turn", async () => {
    expect(endTurnCalls === 0, `Expected no End Turn shortcut call, received ${endTurnCalls}.`);
    expect(nextGroupCalls === 0, `Expected no Next Group shortcut call, received ${nextGroupCalls}.`);
    controls.dispose();
  });
});
