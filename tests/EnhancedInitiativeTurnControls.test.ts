import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import { EnhancedInitiativeTurnControls } from "../src/ui/components/EnhancedInitiativeTurnControls";
import type { InitiativeGroup } from "../src/core/GroupedInitiativeQueue";
import type { UnitActivation } from "../src/core/InitiativeQueue";

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

function frozenGroup(ownerId: UnitActivation["ownerId"], remaining: number, retainCompleted = false): InitiativeGroup {
  const group: InitiativeGroup = {
    initiative: 5,
    isCompleted: false,
    currentUnitIndex: 0,
    units: Array.from({ length: retainCompleted ? 19 : remaining }, (_, index) => Object.freeze({
      unitId: `${ownerId}-formation-${index}`,
      ownerId,
      initiative: 5,
      isActivated: index >= remaining,
      sortOrder: index
    }))
  };
  Object.freeze(group.units);
  return Object.freeze(group);
}

function assertNoEnemyCardinality(container: HTMLElement): void {
  const surfaces = [container.textContent ?? ""];
  for (const element of [container, ...container.querySelectorAll<HTMLElement>("*")]) {
    for (const attribute of element.attributes) {
      if (attribute.name === "data-current-initiative-group") {
        assert.ok(attribute.value === "5" || attribute.value === "", "Only the initiative band may be exposed as numeric group data.");
      } else if (attribute.name === "title" || attribute.name.startsWith("aria-") || attribute.name.startsWith("data-")) {
        surfaces.push(attribute.value);
      }
    }
    assert.equal(element.style.width, "", "Enemy progress must not survive as a numeric width, including on hidden nodes.");
  }
  assert.doesNotMatch(surfaces.join("\n").replace(/Initiative 5/g, ""), /\d/, "Enemy cardinality must not appear in text, titles, accessibility metadata or data attributes.");
}

// These legacy nodes are deliberately supplied here. initializeControls does not
// ship them; this contract guards the optional writer, not the observed live DOM.
function appendLegacyProgress(container: HTMLElement): void {
  container.insertAdjacentHTML("beforeend", `<div class="current-group-info">
    <span class="group-initiative"></span><span class="progress-fill"></span><span class="progress-text"></span>
  </div>`);
}

registerTest("ENHANCED_INITIATIVE_CONTROLS_ENEMY_COUNTS_STAY_PRIVATE_DURING_GROUP_TRANSITIONS", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const controls = new EnhancedInitiativeTurnControls(container, noopEvents);
  const enemy = Object.freeze({ unitId: "enemy-current", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 0 } satisfies UnitActivation);
  try {
    controls.updatePhase("initiativeTurn");
    controls.updatePlayerTurn(false);
    for (const retainCompleted of [false, true]) {
      for (const remaining of [19, 18, 1, 0]) {
        const group = frozenGroup("bot", remaining, retainCompleted);
        const before = JSON.stringify(group);
        controls.updateCurrentUnit(enemy);
        controls.updateCurrentGroup(group);
        assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Enemy group");
        assert.equal(container.querySelector(".initiative-status__detail")?.textContent, "Enemy orders resolving");
        assertNoEnemyCardinality(container);
        controls.updateCurrentUnit(null);
        assertNoEnemyCardinality(container);
        if (group.units.length) {
          assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Enemy group", "The supplied enemy roster still establishes ownership when the current activation is absent.");
          assert.equal(container.querySelector(".initiative-status__detail")?.textContent, "Enemy orders resolving");
        }
        assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].every(button => button.disabled), "Enemy activity must not enable a player command.");
        assert.equal(JSON.stringify(group), before, "Rendering must not alter supplied activation state.");
      }
    }
  } finally {
    controls.dispose();
    container.remove();
  }
});

registerTest("ENHANCED_INITIATIVE_CONTROLS_OPTIONAL_PROGRESS_CLEARS_COUNTS_ON_OWNER_CHANGE", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const controls = new EnhancedInitiativeTurnControls(container, noopEvents);
  appendLegacyProgress(container);
  const friendly = frozenGroup("player", 1, true);
  const enemy = frozenGroup("bot", 19);
  try {
    controls.updateCurrentGroup(friendly);
    controls.updateCurrentUnit(friendly.units[0]);
    assert.equal(container.querySelector(".progress-text")?.textContent, "18/19");
    assert.notEqual(container.querySelector<HTMLElement>(".progress-fill")?.style.width, "");

    // BattleScreen supplies the new current activation before replacing its group.
    controls.updateCurrentUnit(enemy.units[0]);
    assertNoEnemyCardinality(container);
    for (const remaining of [19, 18, 1, 0]) {
      controls.updateCurrentGroup(frozenGroup("bot", remaining));
      assertNoEnemyCardinality(container);
      controls.updateCurrentUnit(null);
      assertNoEnemyCardinality(container);
    }
    controls.updateCurrentGroup(enemy);
    controls.updateCurrentUnit(friendly.units[0]);
    assertNoEnemyCardinality(container);
    controls.updateCurrentGroup(friendly);
    assert.equal(container.querySelector(".progress-text")?.textContent, "18/19", "Friendly progress returns after the supplied roster is friendly again.");
    controls.updateCurrentUnit(null);
    controls.updateCurrentGroup(null);
    assertNoEnemyCardinality(container);
  } finally {
    controls.dispose();
    container.remove();
  }
});

registerTest("ENHANCED_INITIATIVE_CONTROLS_RETAIN_PLAYER_COUNTS_AND_COMPLETED_ROUND", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const controls = new EnhancedInitiativeTurnControls(container, noopEvents);
  appendLegacyProgress(container);
  try {
    controls.updatePhase("initiativeTurn");
    controls.updatePlayerTurn(true);
    for (const remaining of [19, 18, 1, 0]) {
      const group = frozenGroup("player", remaining, true);
      const before = JSON.stringify(group);
      controls.updateCurrentUnit(group.units[0]);
      controls.updateCurrentGroup(group);
      assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Your group");
      assert.equal(container.querySelector(".initiative-status__detail")?.textContent, `${remaining} formation${remaining === 1 ? "" : "s"} ready`);
      assert.equal(container.querySelector(".progress-text")?.textContent, `${19 - remaining}/19`);
      assert.ok(Math.abs(parseFloat(container.querySelector<HTMLElement>(".progress-fill")!.style.width) - (19 - remaining) / 19 * 100) < 0.001);
      controls.updateCurrentUnit(null);
      assert.equal(container.querySelector(".initiative-status__detail")?.textContent, `${remaining} formation${remaining === 1 ? "" : "s"} ready`);
      assert.equal(JSON.stringify(group), before);
    }
    controls.updateCurrentGroup(null);
    controls.updateRoundAdvanceReady(true);
    assert.equal(container.querySelector(".initiative-status__label")?.textContent, "Initiative Complete");
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Turn ready");
    assert.equal(container.querySelector(".initiative-status__detail")?.textContent, "All formations ordered");
    assert.equal(container.querySelector(".group-advance-btn")?.textContent, "End Turn");
  } finally {
    controls.dispose();
    container.remove();
  }
});

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
    edgeButton.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });

  await Then("the global initiative shortcut does not end the turn", async () => {
    expect(endTurnCalls === 0, `Expected no End Turn shortcut call, received ${endTurnCalls}.`);
    expect(nextGroupCalls === 0, `Expected no Next Group shortcut call, received ${nextGroupCalls}.`);
    controls.dispose();
  });
});
