import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import { ensureBattleState } from "../src/state/BattleState.js";
import { ensureTutorialState } from "../src/state/TutorialState.js";
import { PopupManager } from "../src/ui/components/PopupManager.js";

type PopupManagerTestAccess = {
  activePopup: string | null;
  openPopup(key: string): void;
  closePopup(): void;
  renderReconPanel(): void;
};

function mountPopupLayer(): HTMLButtonElement {
  document.body.innerHTML = `
    <div id="battlePopupLayer" class="popup-layer hidden" aria-hidden="true">
      <section class="battle-popup">
        <h2 data-popup-title></h2>
        <button id="battlePopupClose" type="button">Close</button>
        <div data-popup-body></div>
      </section>
    </div>
  `;
  const closeButton = document.querySelector<HTMLButtonElement>("#battlePopupClose");
  if (!closeButton) {
    throw new Error("Popup lifecycle fixture did not mount its close button.");
  }
  return closeButton;
}

registerTest("POPUP_MANAGER_DISPOSE_PREVENTS_GHOST_WAR_ROOM_AND_STORE_LISTENERS", async ({ Given, When, Then }) => {
  let first: PopupManager;
  let second: PopupManager;
  let closeButton: HTMLButtonElement;
  let firstWarRoomOpens = 0;
  let secondWarRoomOpens = 0;
  let firstCloseCalls = 0;
  let secondCloseCalls = 0;
  let firstReconRefreshes = 0;
  let secondReconRefreshes = 0;

  const battleState = ensureBattleState() as unknown as { battleUpdateListeners: Set<unknown>; emitBattleUpdate(): void };
  const tutorialState = ensureTutorialState() as unknown as { listeners: Set<unknown> };
  const initialBattleSubscriptions = battleState.battleUpdateListeners.size;
  const initialTutorialSubscriptions = tutorialState.listeners.size;

  await Given("one popup manager that has been disposed twice before its replacement is created", () => {
    closeButton = mountPopupLayer();
    first = new PopupManager();
    const internal = first as unknown as PopupManagerTestAccess;
    internal.openPopup = () => { firstWarRoomOpens += 1; };
    internal.closePopup = () => { firstCloseCalls += 1; };
    internal.renderReconPanel = () => { firstReconRefreshes += 1; };
    internal.activePopup = "recon";

    assert.equal(battleState.battleUpdateListeners.size, initialBattleSubscriptions + 1);
    assert.equal(tutorialState.listeners.size, initialTutorialSubscriptions + 1);
    first.dispose();
    first.dispose();
    assert.equal(battleState.battleUpdateListeners.size, initialBattleSubscriptions);
    assert.equal(tutorialState.listeners.size, initialTutorialSubscriptions);

    second = new PopupManager();
    const replacementInternal = second as unknown as PopupManagerTestAccess;
    replacementInternal.openPopup = () => { secondWarRoomOpens += 1; };
    replacementInternal.closePopup = () => { secondCloseCalls += 1; };
    replacementInternal.renderReconPanel = () => { secondReconRefreshes += 1; };
    replacementInternal.activePopup = "recon";
  });

  try {
    await When("the shared War Room event, popup control, and battle store each emit once", () => {
      document.dispatchEvent(new CustomEvent("warroom:openBattleRequisitions"));
      closeButton.click();
      battleState.emitBattleUpdate();
    });

    await Then("only the replacement manager should react once to each persistent source", () => {
      assert.equal(firstWarRoomOpens, 0);
      assert.equal(secondWarRoomOpens, 1);
      assert.equal(firstCloseCalls, 0);
      assert.equal(secondCloseCalls, 1);
      assert.equal(firstReconRefreshes, 0);
      assert.equal(secondReconRefreshes, 1);
      assert.equal(battleState.battleUpdateListeners.size, initialBattleSubscriptions + 1);
      assert.equal(tutorialState.listeners.size, initialTutorialSubscriptions + 1);
    });
  } finally {
    second!.dispose();
  }

  assert.equal(battleState.battleUpdateListeners.size, initialBattleSubscriptions);
  assert.equal(tutorialState.listeners.size, initialTutorialSubscriptions);
});
