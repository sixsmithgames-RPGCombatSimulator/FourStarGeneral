import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { SelectionIntelOverlay } from "../src/ui/announcements/SelectionIntelOverlay";
import type { BattleSelectionIntel, TerrainSelectionIntel } from "../src/ui/announcements/AnnouncementTypes";

registerTest("SELECTION_INTEL_OVERLAY_RENDERS_COMMAND_CARDS_AND_NOTES", async ({ Given, When, Then }) => {
  const container = document.createElement("div");
  container.innerHTML = `
    <section id="battleIntelOverlay" class="battle-intel-overlay hidden" tabindex="-1">
      <button id="battleIntelOverlayDismiss" type="button">x</button>
      <button id="battleIntelOverlayToggle" type="button">Expand</button>
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
    rangeLabel: "1",
    canEntrench: true,
    moveOptions: 3,
    attackOptions: 1,
    unitTabs: [],
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
        label: "Fortify",
        detail: "Build defensive works on this hex.",
        tone: "defense",
        available: false,
        reason: "Hold position and stay uncommitted this turn to use infantry field actions."
      }
    ],
    detailSections: [
      {
        title: "Unit",
        entries: [
          { label: "Class", value: "Specialist" },
          { label: "Role", value: "Anti Infantry" }
        ]
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

registerTest("SELECTION_INTEL_OVERLAY_SHOWS_RANGE_AND_DETAILS_WITHOUT_REDUNDANT_BATTLE_SUMMARY", async ({ Given, When, Then }) => {
  const container = document.createElement("div");
  container.innerHTML = `
    <section id="battleIntelOverlay" class="battle-intel-overlay hidden" tabindex="-1">
      <button id="battleIntelOverlayDismiss" type="button">x</button>
      <button id="battleIntelOverlayToggle" type="button">Expand</button>
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
    hexKey: "14,5",
    terrainName: "Hill",
    unitLabel: "Anti-Tank Gun Battery",
    unitStrength: 100,
    unitAmmo: 4,
    unitFuel: 0,
    unitEntrenchment: 0,
    movementRemaining: 1,
    movementMax: 1,
    rangeLabel: "1-2",
    canEntrench: false,
    moveOptions: 2,
    attackOptions: 0,
    unitTabs: [],
    statusMessage: "Anti-Tank Gun Battery selected at 14,5.",
    statusChips: [{ label: "Fortifications", tone: "good" }],
    actionCards: [
      {
        id: "enterSentry",
        label: "Sentry",
        detail: "Hold position and stay uncommitted this turn to set sentry.",
        tone: "defense",
        available: true
      }
    ],
    detailSections: [
      {
        title: "Unit",
        entries: [
          { label: "Class", value: "Specialist" },
          { label: "Role", value: "Anti Tank" },
          { label: "Mobility", value: "Wheel" }
        ]
      },
      {
        title: "Protection",
        entries: [{ label: "Armor", value: "F 1 / S 1 / T 1" }]
      }
    ],
    notes: []
  };

  let overlay: SelectionIntelOverlay | null = null;
  await Given("a mounted selection intel overlay", async () => {
    overlay = new SelectionIntelOverlay();
  });

  await When("battle intel is expanded to inspect the unit details tab", async () => {
    overlay?.update(intel);
    document.getElementById("battleIntelOverlayToggle")?.click();
    container.querySelector<HTMLButtonElement>("[data-selection-intel-tab='unit']")?.click();
  });

  await Then("the overlay replaces targets with range, hides non-infantry entrenchment, and renders unit details", async () => {
    const metaText = document.getElementById("battleIntelOverlayMeta")?.textContent?.trim() ?? "";
    if (metaText !== "14,5 • Hill") {
      throw new Error(`Expected battle summary to only show hex and terrain, received '${metaText}'.`);
    }

    const bodyText = document.getElementById("battleIntelOverlayBody")?.textContent ?? "";
    if (!bodyText.includes("Range") || !bodyText.includes("1-2")) {
      throw new Error(`Expected overlay body to include range data, received '${bodyText}'.`);
    }
    if (bodyText.includes("Targets")) {
      throw new Error("Expected legacy targets label to be removed from battle intel.");
    }
    if (bodyText.includes("Entrench")) {
      throw new Error("Expected non-infantry unit overlay to omit the entrench stat.");
    }
    if (!bodyText.includes("Mobility") || !bodyText.includes("Anti Tank")) {
      throw new Error(`Expected unit details tab to render non-redundant definition data, received '${bodyText}'.`);
    }

    overlay?.dispose();
    container.remove();
  });
});

registerTest("SELECTION_INTEL_OVERLAY_RENDERS_STACK_UNIT_TABS_FOR_SHARED_HEX_CONTROL", async ({ Given, When, Then }) => {
  const container = document.createElement("div");
  container.innerHTML = `
    <section id="battleIntelOverlay" class="battle-intel-overlay hidden" tabindex="-1">
      <button id="battleIntelOverlayDismiss" type="button">x</button>
      <button id="battleIntelOverlayToggle" type="button">Expand</button>
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
    hexKey: "6,9",
    terrainName: "Road",
    unitLabel: "Engineering Corps",
    unitStrength: 100,
    unitAmmo: 6,
    unitFuel: null,
    unitEntrenchment: 0,
    movementRemaining: 3,
    movementMax: 3,
    rangeLabel: "1",
    canEntrench: true,
    moveOptions: 6,
    attackOptions: 1,
    unitTabs: [
      {
        unitId: "engineer_1",
        label: "Engineering Corps",
        detail: "100% strength",
        selected: true
      },
      {
        unitId: "infantry_2",
        label: "Infantry Battalion",
        detail: "76% strength",
        selected: false
      }
    ],
    statusMessage: "Engineering Corps selected at 6,9.",
    statusChips: [{ label: "Engineer", tone: "neutral" }],
    actionCards: [
      {
        id: "digIn",
        label: "Dig In",
        detail: "Gain +1 entrenchment, up to level 2.",
        tone: "defense",
        available: true
      }
    ],
    detailSections: [],
    notes: []
  };

  let overlay: SelectionIntelOverlay | null = null;
  await Given("a mounted selection intel overlay for a stacked hex", async () => {
    overlay = new SelectionIntelOverlay();
  });

  await When("battle intel includes multiple player-controlled units on the selected hex", async () => {
    overlay?.update(intel);
  });

  await Then("the overlay renders selector tabs so the commander can switch units", async () => {
    const root = document.getElementById("battleIntelOverlay");
    const unitTabs = Array.from(root?.querySelectorAll<HTMLButtonElement>("[data-selection-action^='selectUnit:']") ?? []);
    if (unitTabs.length !== 2) {
      throw new Error(`Expected two stack unit tabs, found ${unitTabs.length}.`);
    }
    if (unitTabs[0]?.dataset.selectionAction !== "selectUnit:engineer_1" || unitTabs[0]?.getAttribute("aria-selected") !== "true") {
      throw new Error("Expected the first stack unit tab to be selected for the engineer formation.");
    }
    if (unitTabs[1]?.dataset.selectionAction !== "selectUnit:infantry_2" || unitTabs[1]?.getAttribute("aria-selected") !== "false") {
      throw new Error("Expected the second stack unit tab to target the alternate battalion.");
    }
    if (!(root?.textContent ?? "").includes("76% strength")) {
      throw new Error("Expected stack unit tabs to include a compact readiness summary for alternate units.");
    }

    overlay?.dispose();
    container.remove();
  });
});

registerTest("SELECTION_INTEL_OVERLAY_SHOWS_ENEMY_CONTACT_NOTES_FOR_TERRAIN_INTEL", async ({ Given, When, Then }) => {
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

  const intel: TerrainSelectionIntel = {
    kind: "terrain",
    hexKey: "8,5",
    terrainName: "Hill",
    notes: ["Enemy contact: Heavy Tank at 75% strength."]
  };

  let overlay: SelectionIntelOverlay | null = null;
  await Given("a mounted selection intel overlay", async () => {
    overlay = new SelectionIntelOverlay();
  });

  await When("terrain intel includes an enemy contact note", async () => {
    overlay?.update(intel);
  });

  await Then("the overlay body surfaces that enemy contact summary", async () => {
    const bodyText = document.getElementById("battleIntelOverlayBody")?.textContent ?? "";
    if (!bodyText.includes("Enemy contact: Heavy Tank at 75% strength.")) {
      throw new Error(`Expected terrain overlay body to include the enemy contact note, received '${bodyText}'.`);
    }

    overlay?.dispose();
    container.remove();
  });
});

registerTest("SELECTION_INTEL_OVERLAY_KEEPS_EXPANDED_MODE_ACROSS_SELECTION_CHANGES", async ({ Given, When, Then }) => {
  const container = document.createElement("div");
  container.innerHTML = `
    <section id="battleIntelOverlay" class="battle-intel-overlay hidden" tabindex="-1">
      <button id="battleIntelOverlayDismiss" type="button">x</button>
      <button id="battleIntelOverlayToggle" type="button">Expand</button>
      <header>
        <h3 id="battleIntelOverlayTitle"></h3>
        <p id="battleIntelOverlayMeta"></p>
      </header>
      <div id="battleIntelOverlayBody"></div>
      <div id="battleIntelOverlayNotes" class="hidden"></div>
    </section>
  `;
  document.body.appendChild(container);

  const firstIntel: BattleSelectionIntel = {
    kind: "battle",
    hexKey: "6,6",
    terrainName: "River",
    unitLabel: "Recon Squad",
    unitStrength: 97,
    unitAmmo: 6,
    unitFuel: 39,
    unitEntrenchment: 0,
    movementRemaining: 4,
    movementMax: 4,
    rangeLabel: "1-2",
    canEntrench: false,
    moveOptions: 4,
    attackOptions: 2,
    unitTabs: [],
    statusMessage: "Recon Squad selected at 6,6.",
    statusChips: [],
    actionCards: [
      {
        id: "enterSentry",
        label: "Sentry",
        detail: "Hold position and stay uncommitted this turn to set sentry.",
        tone: "defense",
        available: true
      }
    ],
    detailSections: [
      {
        title: "Unit",
        entries: [{ label: "Class", value: "Recon" }]
      }
    ],
    notes: []
  };

  const secondIntel: BattleSelectionIntel = {
    ...firstIntel,
    hexKey: "7,6",
    terrainName: "Hill",
    unitLabel: "Infantry Battalion",
    unitStrength: 84,
    unitAmmo: 4,
    unitFuel: null,
    movementRemaining: 2,
    movementMax: 2,
    rangeLabel: "1",
    canEntrench: true,
    statusMessage: "Infantry Battalion selected at 7,6.",
    detailSections: [
      {
        title: "Unit",
        entries: [{ label: "Class", value: "Line Infantry" }]
      }
    ]
  };

  let overlay: SelectionIntelOverlay | null = null;
  await Given("a mounted selection intel overlay", async () => {
    overlay = new SelectionIntelOverlay();
  });

  await When("the commander expands battle intel and then selects another unit", async () => {
    overlay?.update(firstIntel);
    document.getElementById("battleIntelOverlayToggle")?.click();
    overlay?.update(secondIntel);
  });

  await Then("the overlay remains expanded until the commander explicitly compacts it", async () => {
    const root = document.getElementById("battleIntelOverlay");
    const toggle = document.getElementById("battleIntelOverlayToggle");
    if (root?.dataset.collapsed !== "false") {
      throw new Error(`Expected expanded mode to persist across selection changes, received collapsed=${root?.dataset.collapsed ?? "missing"}.`);
    }
    if (toggle?.textContent?.trim() !== "Compact") {
      throw new Error(`Expected toggle to stay in compact-mode control state, received '${toggle?.textContent ?? ""}'.`);
    }

    overlay?.dispose();
    container.remove();
  });
});
