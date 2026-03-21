import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { SelectionIntelOverlay } from "../src/ui/announcements/SelectionIntelOverlay";
import type { BattleSelectionIntel } from "../src/ui/announcements/AnnouncementTypes";

registerTest("SELECTION_INTEL_OVERLAY_RENDERS_COMMAND_CARDS_AND_NOTES", async ({ Given, When, Then }) => {
  const container = document.createElement("div");
  container.innerHTML = `
    <section id="battleIntelOverlay" class="battle-intel-overlay hidden" tabindex="-1">
      <button id="battleIntelOverlayDismiss" type="button">x</button>
      <header>
        <h3 id="battleIntelOverlayTitle"></h3>
        <p id="battleIntelOverlayMeta"></p>
      </header>
      <div id="battleIntelOverlayBody"></div>
      <div id="battleIntelOverlayNotes" class="hidden"></div>
    </section>
  `;
  document.body.appendChild(container);

  const intel: BattleSelectionIntel = {
    kind: "battle",
    hexKey: "4,2",
    terrainName: "Village",
    unitLabel: "Engineer Company",
    unitStrength: 92,
    unitAmmo: 5,
    unitFuel: null,
    unitEntrenchment: 1,
    movementRemaining: 2,
    movementMax: 2,
    moveOptions: 3,
    attackOptions: 1,
    statusMessage: "Engineer Company selected at 4,2.",
    statusChips: [
      { label: "Engineer", tone: "neutral" },
      { label: "Suppressed", tone: "warning" }
    ],
    actionCards: [
      {
        id: "digIn",
        label: "Dig In",
        detail: "Gain +1 entrenchment, up to level 2.",
        tone: "defense",
        available: true
      },
      {
        id: "fortifications",
        label: "Fortify Hex",
        detail: "Build defensive works on this hex.",
        tone: "defense",
        available: false,
        reason: "Hold position and stay uncommitted this turn to use infantry field actions."
      }
    ],
    notes: ["Under suppressive fire this turn."]
  };

  let overlay: SelectionIntelOverlay | null = null;
  await Given("a mounted selection intel overlay", async () => {
    overlay = new SelectionIntelOverlay();
  });

  await When("battle intel includes command cards, status chips, and notes", async () => {
    overlay?.update(intel);
  });

  await Then("the overlay surfaces actionable command buttons and context notes", async () => {
    const root = document.getElementById("battleIntelOverlay");
    if (!root || root.dataset.intelKind !== "battle") {
      throw new Error("Expected overlay root to track that battle intel is currently displayed.");
    }

    const actions = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-selection-action]"));
    if (actions.length !== 2) {
      throw new Error(`Expected two command cards in the overlay, found ${actions.length}.`);
    }
    if (actions[0]?.dataset.selectionAction !== "digIn" || actions[0]?.disabled) {
      throw new Error("Expected dig-in command card to render as an enabled action.");
    }
    if (actions[1]?.dataset.selectionAction !== "fortifications" || !actions[1]?.disabled) {
      throw new Error("Expected fortification command card to render as disabled with its reason.");
    }

    const noteText = root.querySelector("#battleIntelOverlayNotes")?.textContent ?? "";
    if (!noteText.includes("Under suppressive fire")) {
      throw new Error(`Expected tactical note to render, received ${noteText}`);
    }

    overlay?.dispose();
    container.remove();
  });
});
