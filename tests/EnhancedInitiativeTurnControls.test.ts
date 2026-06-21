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
    const value = status?.querySelector<HTMLElement>(".initiative-status__value");
    const detail = status?.querySelector<HTMLElement>(".initiative-status__detail");

    expect(Boolean(status), "Expected initiative status element to be rendered.");
    expect(status?.dataset.currentInitiativeGroup === "7", "Expected current initiative group data to be exposed.");
    expect(value?.textContent === "Init 7 - Your group", `Unexpected initiative status value: ${value?.textContent ?? "<missing>"}.`);
    expect(detail?.textContent === "1 formation still in this band.", `Unexpected initiative detail: ${detail?.textContent ?? "<missing>"}.`);
    expect(Boolean(container.querySelector(".next-activation-btn")), "Expected Next Unit button for tutorial targeting.");
    expect(Boolean(container.querySelector(".skip-group-btn")), "Expected Skip Group button for tutorial targeting.");

    controls.dispose();
  });
});

registerTest("ENHANCED_INITIATIVE_CONTROLS_IGNORE_ENTER_FROM_DIALOG_CONTROLS", async ({ Given, When, Then }) => {
  let controls: EnhancedInitiativeTurnControls;
  let endTurnCalls = 0;
  let edgeButton: HTMLButtonElement;

  await Given("initiative controls are active behind an edge-selection dialog", async () => {
    document.body.innerHTML = `
      <div id="initiativeControls"></div>
      <div role="dialog" aria-modal="true"><button id="edgeButton">NW</button></div>
    `;
    const container = document.getElementById("initiativeControls") as HTMLElement;
    controls = new EnhancedInitiativeTurnControls(container, {
      ...noopEvents,
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
    controls.dispose();
  });
});
