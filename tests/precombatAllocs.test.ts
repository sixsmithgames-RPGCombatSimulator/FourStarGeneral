/**
 * Guards the precombat allocation dataset to alert designers when numeric caps or categories drift.
 * This keeps UI expectations stable without requiring factories to defensively clone or clamp values.
 */
import "./domEnvironment.js";
import { registerTest as registerHarnessTest, type TestFn } from "./harness.js";
import assert from "node:assert/strict";
import {
  allocationOptions,
  ALLOCATION_BY_KEY,
  ALLOCATION_BY_CATEGORY,
  isAllocationKey,
  getAllocationOption,
  type AllocationCategory,
  type UnitAllocationOption
} from "../src/data/unitAllocation";
import { PrecombatScreen } from "../src/ui/screens/PrecombatScreen";
import type { IScreenManager } from "../src/contracts/IScreenManager";
import { BattleState } from "../src/state/BattleState";
import { ensureDeploymentState } from "../src/state/DeploymentState";
import { ensureTutorialState } from "../src/state/TutorialState";
import { ensureUnlockState } from "../src/state/UnlockState";
import { getMissionBriefing, getMissionProfile, getMissionSummaryPackage, getMissionTitle } from "../src/data/missions";

const screenCleanups: Array<() => void> = [];

/** Restore only these fixtures' singleton writes, retaining earlier tests' objects and subscriptions. */
function preserveFixtureState(state: object): () => void {
  const restore: Array<() => void> = [];
  const visited = new WeakSet<object>();
  const remember = (value: unknown): void => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (value instanceof Map) {
      const entries = [...value.entries()];
      entries.forEach(([key, entry]) => { remember(key); remember(entry); });
      restore.push(() => { value.clear(); entries.forEach(([key, entry]) => value.set(key, entry)); });
    } else if (value instanceof Set) {
      const entries = [...value]; entries.forEach(remember);
      restore.push(() => { value.clear(); entries.forEach(entry => value.add(entry)); });
    } else if (value === state || Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) {
      // Capture original descriptors and nested values, including arrays changed in place; keep object identities.
      const descriptors = Object.getOwnPropertyDescriptors(value);
      Reflect.ownKeys(descriptors).forEach(key => remember(Reflect.get(descriptors, key).value));
      restore.push(() => {
        Reflect.ownKeys(value).filter(key => !Reflect.has(descriptors, key)).forEach(key => Reflect.deleteProperty(value, key));
        Object.defineProperties(value, descriptors);
      });
    }
  };
  remember(state);
  return () => restore.forEach(cleanup => cleanup());
}

/** The file is also run in the shared harness; cleanup must occur even when an assertion fails. */
function registerTest(id: string, spec: TestFn): void {
  registerHarnessTest(id, async context => {
    const deployment = ensureDeploymentState();
    const unlock = ensureUnlockState();
    const states = [deployment, ensureTutorialState(), unlock];
    const restorePriorTests = states.map(preserveFixtureState);
    // Seed earlier-test data before real initialize/setup, which refreshes sprites in nested records.
    const pool = [{ key: "infantry", label: "Prior pool", remaining: 2, sprite: "prior-pool.svg" }];
    const reserves = [{ unitKey: "infantry", label: "Prior reserve", remaining: 2, sprite: "prior-reserve.svg", status: "ready" as const }];
    const placement = { hexKey: "99,99", unitKey: "infantry", faction: "Player" as const, sprite: "prior-placement.svg" };
    deployment.pool = pool; deployment.reserves = reserves; deployment.placements.set(placement.hexKey, placement);
    const placementMap = deployment.placements;
    const poolEntry = pool[0]; const reserveEntry = reserves[0];
    const deploymentBefore = structuredClone(Object.fromEntries(Object.entries(deployment)));
    const priorListener = () => {};
    unlock.subscribe(priorListener);
    const listeners = Reflect.get(unlock, "listeners") as Set<unknown>;
    const listenersBefore = [...listeners];
    const restores = states.map(preserveFixtureState);
    try { await spec(context); }
    finally {
      screenCleanups.splice(0).reverse().forEach(cleanup => cleanup());
      try {
        restores.reverse().forEach(restore => restore());
        assert.deepEqual(Object.fromEntries(Object.entries(deployment)), deploymentBefore, "Pre-existing deployment values survive real screen initialization.");
        assert.equal(deployment.pool, pool); assert.equal(deployment.pool[0], poolEntry);
        assert.equal(deployment.reserves, reserves); assert.equal(deployment.reserves[0], reserveEntry);
        assert.equal(deployment.placements, placementMap); assert.equal(deployment.placements.get(placement.hexKey), placement);
        assert.equal(Reflect.get(unlock, "listeners"), listeners); assert.deepEqual([...listeners], listenersBefore);
        console.log(`[FIXTURE CLEANUP PASS] ${id}: nonempty deployment contents, identities and prior listener restored.`);
      } finally {
        restorePriorTests.reverse().forEach(restore => restore());
        document.body.replaceChildren();
      }
    }
  });
}

function createPrecombatScreen(manager: IScreenManager, battle: BattleState): PrecombatScreen {
  const screen = new PrecombatScreen(manager, battle);
  const lifecycle = screen as unknown as {
    screenShownListener: EventListener;
    resizeListener: EventListener;
    miniMapRenderFrame: number | null;
    miniMapRetryTimer: number | null;
  };
  screenCleanups.push(() => {
    document.removeEventListener("screen:shown", lifecycle.screenShownListener);
    window.removeEventListener("resize", lifecycle.resizeListener);
    if (lifecycle.miniMapRenderFrame !== null) window.cancelAnimationFrame(lifecycle.miniMapRenderFrame);
    if (lifecycle.miniMapRetryTimer !== null) window.clearTimeout(lifecycle.miniMapRetryTimer);
  });
  return screen;
}

const allowedCategories: ReadonlySet<AllocationCategory> = new Set<AllocationCategory>([
  "units",
  "supplies",
  "support",
  "logistics"
]);

/**
 * Compiles all allocation keys released to the UI and validates numeric and categorical invariants.
 */
registerTest("PRECOMBAT_ALLOCATIONS_DATA_CONSTRAINTS", async ({ Given, When, Then }) => {
  let snapshot: readonly UnitAllocationOption[] = [];
  const invalidQuantities: string[] = [];
  const negativeCosts: string[] = [];
  const unexpectedCategories: string[] = [];
  const lookupMismatches: string[] = [];

  await Given("the canonical allocation dataset", async () => {
    snapshot = allocationOptions;
  });

  await When("validating numeric thresholds and lookup structures", async () => {
    for (const option of snapshot) {
      if (option.maxQuantity <= 0) {
        invalidQuantities.push(option.key);
      }
      if (option.costPerUnit < 0) {
        negativeCosts.push(option.key);
      }
      if (!allowedCategories.has(option.category)) {
        unexpectedCategories.push(option.key);
      }

      if (ALLOCATION_BY_KEY[option.key] !== option) {
        lookupMismatches.push(option.key);
      }
      const recovered = getAllocationOption(option.key);
      if (recovered !== option) {
        lookupMismatches.push(option.key);
      }
    }
  });

  await Then("every allocation uses valid caps, costs, categories, and consistent lookups", async () => {
    if (invalidQuantities.length > 0) {
      throw new Error(`Max quantity must be positive: ${invalidQuantities.join(", ")}`);
    }
    if (negativeCosts.length > 0) {
      throw new Error(`Cost cannot be negative: ${negativeCosts.join(", ")}`);
    }
    if (unexpectedCategories.length > 0) {
      throw new Error(`Unknown allocation categories: ${unexpectedCategories.join(", ")}`);
    }
    if (lookupMismatches.length > 0) {
      throw new Error(`Allocation lookup mismatch detected: ${lookupMismatches.join(", ")}`);
    }
  });
});

/**
 * Validates that `PrecombatScreen` renders deterministic allocation markup and keeps budget indicators stable after rerenders.
 */
registerTest("PRECOMBAT_RENDER_IDEMPOTENCE", async ({ Given, When, Then }) => {
  // Provide the minimal DOM structure required by `PrecombatScreen.initialize()` so the screen can bind elements without a browser.
  document.body.innerHTML = `
    <section id="precombatScreen">
      <h1 id="precombatMissionTitle"></h1>
      <p id="precombatMissionBriefing"></p>
      <ul id="objectiveList"></ul>
      <span id="missionTurnLimit"></span>
      <p id="missionClockNote"></p>
      <ul id="baselineSupplyList"></ul>
      <p id="missionDoctrineNotes"></p>
      <button id="returnToLanding"></button>
      <button id="proceedToBattle"></button>
      <button id="allocationWarningReturn"></button>
      <button id="allocationWarningProceed"></button>
      <div id="allocationUnitList"></div>
      <div id="allocationSupplyList"></div>
      <div id="allocationSupportList"></div>
      <div id="allocationLogisticsList"></div>
      <button id="resetAllocations"></button>
      <div id="allocationWarningOverlay" class="hidden"></div>
      <div id="allocationWarningModal"></div>
      <div id="predeployedSummary"></div>
      <div id="predeployedUnitList"></div>
      <aside id="precombatBudgetPanel" data-state="ready">
        <span id="budgetSpent"></span>
        <span id="budgetRemaining"></span>
        <div id="allocationFeedback"></div>
      </aside>
      <article id="commanderSummaryCard">
        <h2 id="commanderName"></h2>
        <p id="commanderSummary"></p>
        <span id="commanderMissions"></span>
        <span id="commanderVictories"></span>
        <span id="commanderUnits"></span>
        <span id="commanderCasualties"></span>
      </article>
      <div id="precombatMapCanvas"></div>
      <svg id="precombatHexMap"></svg>
      <footer class="precombat-footer"></footer>
    </section>
  `;

  let screen: PrecombatScreen;
  let initialMarkup = "";
  let rerenderMarkup = "";

  await Given("a precombat screen with seeded DOM and mocks", async () => {
    const fakeScreenManager: IScreenManager = {
      showScreen: () => {
        /* no-op: tests do not navigate */
      },
      showScreenById: () => {
        /* no-op: tests do not navigate */
      },
      getCurrentScreen: () => null
    };

    const battleState = new BattleState();
    screen = createPrecombatScreen(fakeScreenManager, battleState);

    // Replace expensive rendering hooks that rely on canvas/SVG layout with no-ops so tests run quickly under jsdom.
    // @ts-expect-error - overriding private helper purely for testing efficiency.
    screen.renderMiniMap = () => {};

    screen.initialize();
  });

  await When("rendering allocations twice and forcing a manual rerender", async () => {
    screen.setup("training", null, "Normal");
    screen.setup("patrol", null, "Normal");

    const internals = screen as unknown as {
      allocationUnitList: HTMLElement;
      budgetPanel: HTMLElement;
      rerenderAllocations: () => void;
      updateBudgetDisplay: () => void;
      budgetSpentElement: HTMLElement;
      budgetRemainingElement: HTMLElement;
    };

    initialMarkup = `${internals.allocationUnitList.innerHTML}|${internals.budgetPanel.dataset.state ?? ""}`;
    internals.rerenderAllocations();
    internals.updateBudgetDisplay();
    rerenderMarkup = `${internals.allocationUnitList.innerHTML}|${internals.budgetPanel.dataset.state ?? ""}`;
  });

  await Then("markup stays identical and budget numbers remain valid", async () => {
    if (initialMarkup !== rerenderMarkup) {
      throw new Error("Precombat allocation markup diverged after rerender; expected deterministic output.");
    }

    const internals = screen as unknown as {
      budgetSpentElement: HTMLElement;
      budgetRemainingElement: HTMLElement;
    };

    const spent = Number(internals.budgetSpentElement.textContent?.replace(/[^0-9.-]/g, ""));
    const remaining = Number(internals.budgetRemainingElement.textContent?.replace(/[^0-9.-]/g, ""));

    if (!Number.isFinite(spent) || spent < 0) {
      throw new Error(`Budget spent should be non-negative, received '${internals.budgetSpentElement.textContent}'.`);
    }

    if (!Number.isFinite(remaining) || remaining <= 0) {
      throw new Error(`Budget remaining should stay positive, received '${internals.budgetRemainingElement.textContent}'.`);
    }

    document.body.innerHTML = "";
  });
});

registerTest("PRECOMBAT_IMPLEMENTED_LOGISTICS_RESPECT_QUANTITIES_CAPS_AND_BUDGET", async ({ Given, When, Then }) => {
  document.body.innerHTML = `
    <section id="precombatScreen">
      <h1 id="precombatMissionTitle"></h1>
      <p id="precombatMissionBriefing"></p>
      <ul id="objectiveList"></ul>
      <span id="missionTurnLimit"></span>
      <p id="missionClockNote"></p>
      <ul id="baselineSupplyList"></ul>
      <p id="missionDoctrineNotes"></p>
      <button id="returnToLanding"></button>
      <button id="proceedToBattle"></button>
      <button id="allocationWarningReturn"></button>
      <button id="allocationWarningProceed"></button>
      <div id="allocationUnitList"></div>
      <div id="allocationSupplyList"></div>
      <div id="allocationSupportList"></div>
      <div id="allocationLogisticsList"></div>
      <button id="resetAllocations"></button>
      <div id="allocationWarningOverlay" class="hidden"></div>
      <div id="allocationWarningModal"></div>
      <div id="predeployedSummary"></div>
      <div id="predeployedUnitList"></div>
      <aside id="precombatBudgetPanel" data-state="ready">
        <span id="budgetSpent"></span>
        <span id="budgetRemaining"></span>
        <div id="allocationFeedback"></div>
      </aside>
      <article id="commanderSummaryCard">
        <h2 id="commanderName"></h2>
        <p id="commanderSummary"></p>
        <span id="commanderMissions"></span>
        <span id="commanderVictories"></span>
        <span id="commanderUnits"></span>
        <span id="commanderCasualties"></span>
      </article>
      <div id="precombatMapCanvas"></div>
      <svg id="precombatHexMap"></svg>
      <footer class="precombat-footer"></footer>
    </section>
  `;

  const card = (key: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(`#allocationLogisticsList .allocation-item[data-key="${key}"]`);
    assert.ok(element, `Expected ${key} logistics card.`);
    return element;
  };
  const control = (key: string, action: string): HTMLButtonElement => {
    const button = card(key).querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
    assert.ok(button, `Expected ${key} ${action} control.`);
    return button;
  };
  const spent = (): number => Number(document.querySelector("#budgetSpent")!.textContent!.replace(/[^0-9]/g, ""));
  const remaining = (): number => Number(document.querySelector("#budgetRemaining")!.textContent!.replace(/[^0-9]/g, ""));
  let startingSpend = 0;
  let budget = 0;

  await Given("a precombat screen rendering the logistics allocation list", async () => {
    const fakeScreenManager: IScreenManager = {
      showScreen: () => {},
      showScreenById: () => {},
      getCurrentScreen: () => null
    };

    const battleState = new BattleState();
    const screen = createPrecombatScreen(fakeScreenManager, battleState);
    // @ts-expect-error - overriding private helper purely for testing efficiency.
    screen.renderMiniMap = () => {};
    screen.initialize();
    screen.setup("training", null, "Normal");
    const infantry = document.querySelector<HTMLButtonElement>('#allocationUnitList [data-key="infantry"][data-action="increment"]');
    assert.ok(infantry); infantry.click();
    startingSpend = spent(); budget = startingSpend + remaining();
  });

  await When("medical and repair sections are requisitioned through their actual quantity buttons", async () => {
    for (const [key, cost, cap] of [["medic", 60, 15], ["maintenance", 55, 12]] as const) {
      const option = getAllocationOption(key)!;
      assert.equal(option.costPerUnit, cost); assert.equal(option.maxQuantity, cap);
      assert.equal(card(key).dataset.unavailable, "false");
      assert.doesNotMatch(card(key).textContent!, /Pending|Planned feature/);
      assert.equal(control(key, "increment").disabled, false);
      assert.equal(control(key, "decrement").disabled, true);
      const before = spent();
      control(key, "increment").click();
      assert.equal(card(key).dataset.quantity, "1");
      assert.equal(card(key).querySelector(".allocation-count")!.textContent, "1");
      assert.equal(spent(), before + cost);
      assert.equal(card(key).querySelector(".allocation-total")!.textContent, `${cost} RP`);
      control(key, "decrement").click();
      assert.equal(card(key).dataset.quantity, "0"); assert.equal(spent(), before);
      control(key, "decrement").click();
      assert.equal(card(key).dataset.quantity, "0"); assert.equal(spent(), before);
      for (let quantity = 0; quantity < cap; quantity++) control(key, "increment").click();
      assert.equal(card(key).dataset.quantity, String(cap));
      assert.equal(control(key, "increment").disabled, true);
      assert.equal(spent(), before + cap * cost);
      control(key, "increment").click();
      assert.equal(card(key).dataset.quantity, String(cap));
      assert.equal(spent(), before + cap * cost);
    }
  });

  await Then("caps prevent extra quantities and excessive logistics spend blocks battle until reduced", async () => {
    const proceed = document.querySelector<HTMLButtonElement>("#proceedToBattle")!;
    assert.equal(spent(), startingSpend + 15 * 60 + 12 * 55);
    assert.ok(spent() > budget); assert.equal(remaining(), 0);
    assert.equal(proceed.disabled, true);
    assert.equal(document.querySelector<HTMLElement>("#precombatBudgetPanel")!.dataset.state, "over-budget");
    assert.match(document.querySelector("#allocationFeedback")!.textContent!, /Over requisition budget/);
    for (const [key, cap] of [["medic", 15], ["maintenance", 12]] as const) {
      for (let quantity = 0; quantity < cap; quantity++) control(key, "decrement").click();
    }
    assert.equal(spent(), startingSpend); assert.equal(remaining(), budget - startingSpend);
    assert.equal(proceed.disabled, false);
    assert.equal(document.querySelector<HTMLElement>("#precombatBudgetPanel")!.dataset.state, "within-budget");
  });
});

registerTest("PRECOMBAT_SEEDS_LOW_COST_SUPPLY_CONVOYS_BUT_STILL_REQUIRES_COMBAT_FORCES", async ({ Given, When, Then }) => {
  document.body.innerHTML = `
    <section id="precombatScreen">
      <h1 id="precombatMissionTitle"></h1>
      <p id="precombatMissionBriefing"></p>
      <ul id="objectiveList"></ul>
      <span id="missionTurnLimit"></span>
      <p id="missionClockNote"></p>
      <ul id="baselineSupplyList"></ul>
      <p id="missionDoctrineNotes"></p>
      <button id="returnToLanding"></button>
      <button id="proceedToBattle"></button>
      <button id="allocationWarningReturn"></button>
      <button id="allocationWarningProceed"></button>
      <div id="allocationUnitList"></div>
      <div id="allocationSupplyList"></div>
      <div id="allocationSupportList"></div>
      <div id="allocationLogisticsList"></div>
      <button id="resetAllocations"></button>
      <div id="allocationWarningOverlay" class="hidden"></div>
      <div id="allocationWarningModal"></div>
      <div id="predeployedSummary"></div>
      <div id="predeployedUnitList"></div>
      <aside id="precombatBudgetPanel" data-state="ready">
        <span id="budgetSpent"></span>
        <span id="budgetRemaining"></span>
        <div id="allocationFeedback"></div>
      </aside>
      <article id="commanderSummaryCard">
        <h2 id="commanderName"></h2>
        <p id="commanderSummary"></p>
        <span id="commanderMissions"></span>
        <span id="commanderVictories"></span>
        <span id="commanderUnits"></span>
        <span id="commanderCasualties"></span>
      </article>
      <div id="precombatMapCanvas"></div>
      <svg id="precombatHexMap"></svg>
      <footer class="precombat-footer"></footer>
    </section>
  `;

  let convoyCost = 0;
  let convoyCount = 0;
  let proceedDisabled = false;

  await Given("a fresh precombat screen", async () => {
    const fakeScreenManager: IScreenManager = {
      showScreen: () => {},
      showScreenById: () => {},
      getCurrentScreen: () => null
    };

    const battleState = new BattleState();
    const screen = createPrecombatScreen(fakeScreenManager, battleState);
    // @ts-expect-error - overriding private helper purely for testing efficiency.
    screen.renderMiniMap = () => {};
    screen.initialize();
    screen.setup("training", null, "Normal");

    const internals = screen as unknown as {
      allocationCounts: Map<string, number>;
      updateBudgetDisplay: () => void;
      proceedToBattleButton: HTMLButtonElement;
    };

    convoyCost = getAllocationOption("supplyConvoy")?.costPerUnit ?? 0;
    convoyCount = internals.allocationCounts.get("supplyConvoy") ?? 0;

    internals.allocationCounts.forEach((_value, key) => {
      internals.allocationCounts.set(key, key === "supplyConvoy" ? convoyCount : 0);
    });
    internals.updateBudgetDisplay();
    proceedDisabled = internals.proceedToBattleButton.disabled;
  });

  await When("reading the default convoy package and battle gating state", async () => {
    // All assertions happen in Then for clearer failure messages.
  });

  await Then("convoys stay cheap, are pre-seeded, and do not count as the only combat force", async () => {
    const infantryCost = getAllocationOption("infantry")?.costPerUnit ?? Number.POSITIVE_INFINITY;
    if (!(convoyCost > 0 && convoyCost < infantryCost)) {
      throw new Error(`Expected supply convoys to stay a low-cost requisition, saw cost ${convoyCost}.`);
    }
    if (convoyCount < 1) {
      throw new Error(`Expected precombat to seed at least one supply convoy by default, saw ${convoyCount}.`);
    }
    if (!proceedDisabled) {
      throw new Error("Expected convoy-only rosters to remain blocked until the commander adds an actual combat formation.");
    }
    document.body.innerHTML = "";
  });
});

registerTest("PRECOMBAT_RIVER_WATCH_USES_AUTHORED_MISSION_PACKAGE", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let battleState: BattleState;
  let objectiveList: HTMLUListElement | null = null;
  let briefingElement: HTMLElement | null = null;
  let doctrineElement: HTMLElement | null = null;
  let turnLimitElement: HTMLElement | null = null;
  let supplyList: HTMLUListElement | null = null;

  await Given("a precombat screen with the full River Watch mission briefing scaffold", async () => {
    document.body.innerHTML = `
      <section id="precombatScreen">
        <h1 id="precombatMissionTitle"></h1>
        <p id="precombatMissionBriefing"></p>
        <ul id="objectiveList"></ul>
        <span id="missionTurnLimit"></span>
        <p id="missionClockNote"></p>
        <ul id="baselineSupplyList"></ul>
        <p id="missionDoctrineNotes"></p>
        <button id="returnToLanding"></button>
        <button id="proceedToBattle"></button>
        <button id="allocationWarningReturn"></button>
        <button id="allocationWarningProceed"></button>
        <div id="allocationUnitList"></div>
        <div id="allocationSupplyList"></div>
        <div id="allocationSupportList"></div>
        <div id="allocationLogisticsList"></div>
        <button id="resetAllocations"></button>
        <div id="allocationWarningOverlay" class="hidden"></div>
        <div id="allocationWarningModal"></div>
        <div id="predeployedSummary"></div>
        <div id="predeployedUnitList"></div>
        <aside id="precombatBudgetPanel" data-state="ready">
          <span id="budgetSpent"></span>
          <span id="budgetRemaining"></span>
          <div id="allocationFeedback"></div>
        </aside>
        <article id="commanderSummaryCard">
          <h2 id="commanderName"></h2>
          <p id="commanderSummary"></p>
          <span id="commanderMissions"></span>
          <span id="commanderVictories"></span>
          <span id="commanderUnits"></span>
          <span id="commanderCasualties"></span>
        </article>
        <div id="precombatMapCanvas"></div>
        <svg id="precombatHexMap"></svg>
        <footer class="precombat-footer"></footer>
      </section>
    `;

    objectiveList = document.getElementById("objectiveList") as HTMLUListElement | null;
    briefingElement = document.getElementById("precombatMissionBriefing");
    doctrineElement = document.getElementById("missionDoctrineNotes");
    turnLimitElement = document.getElementById("missionTurnLimit");
    supplyList = document.getElementById("baselineSupplyList") as HTMLUListElement | null;

    const fakeScreenManager: IScreenManager = {
      showScreen: () => {},
      showScreenById: () => {},
      getCurrentScreen: () => null
    };

    battleState = new BattleState();
    screen = createPrecombatScreen(fakeScreenManager, battleState);
    // @ts-expect-error - overriding private helper purely for testing efficiency.
    screen.renderMiniMap = () => {};
    screen.initialize();
  });

  await When("River Crossing Watch is set up in precombat", async () => {
    screen.setup("patrol_river_watch", null, "Normal");
  });

  await Then("the authored mission package drives both the DOM and BattleState handoff", async () => {
    const summary = getMissionSummaryPackage("patrol_river_watch", "Normal");
    const missionInfo = battleState.getPrecombatMissionInfo();
    const titleElement = document.getElementById("precombatMissionTitle");
    const expectedObjectives = [
      "Primary: Hold all fords for 8 consecutive turns",
      "Secondary: Destroy the enemy comms team before it reaches the central ford",
      "Tertiary: Keep at least one recon unit alive"
    ];

    if (!titleElement || titleElement.textContent !== getMissionTitle("patrol_river_watch")) {
      throw new Error(`Expected authored mission title, received ${titleElement?.textContent}`);
    }
    if (!briefingElement || briefingElement.textContent !== getMissionBriefing("patrol_river_watch")) {
      throw new Error(`Expected authored mission briefing, received ${briefingElement?.textContent}`);
    }
    if (!objectiveList) {
      throw new Error("Expected objective list element to exist.");
    }
    const objectiveText = objectiveList.textContent ?? "";
    if (!objectiveText.includes(expectedObjectives[0])) {
      throw new Error(`Expected primary authored objective, received ${objectiveText}`);
    }
    if (!objectiveText.includes(expectedObjectives[1])) {
      throw new Error("Expected authored secondary objective to render.");
    }
    if (!objectiveText.includes(expectedObjectives[2])) {
      throw new Error("Expected authored tertiary objective to render.");
    }
    if (!doctrineElement || doctrineElement.textContent !== summary.doctrine) {
      throw new Error(`Expected authored doctrine, received ${doctrineElement?.textContent}`);
    }
    if (!turnLimitElement || turnLimitElement.textContent !== `${summary.turnLimit} turns`) {
      throw new Error(`Expected authored turn limit, received ${turnLimitElement?.textContent}`);
    }
    if (!supplyList) {
      throw new Error("Expected supply list element to exist.");
    }
    const supplyText = supplyList.textContent ?? "";
    if (!supplyText.includes("Off-map Artillery")) {
      throw new Error(`Expected concise support summary, received ${supplyText}`);
    }
    if (supplyText.includes("Predeployed Patrol") || supplyText.includes("Hold until dawn")) {
      throw new Error(`Expected duplicated patrol details to stay out of the concise support summary, received ${supplyText}`);
    }
    if (!missionInfo) {
      throw new Error("Expected BattleState mission handoff to be populated.");
    }
    if (missionInfo.briefing !== getMissionBriefing("patrol_river_watch")) {
      throw new Error("Expected BattleState mission briefing to match the authored package.");
    }
    if (missionInfo.objectives.join("|") !== expectedObjectives.join("|")) {
      throw new Error("Expected BattleState mission objectives to match the mission-rule summary.");
    }
    if (missionInfo.baselineSupplies.map((item) => `${item.label}:${item.amount}`).join("|") !== summary.supplies.map((item) => `${item.label}:${item.amount}`).join("|")) {
      throw new Error("Expected BattleState baseline supplies to match the authored package.");
    }
    document.body.innerHTML = "";
  });
});

registerTest("PRECOMBAT_RIVER_WATCH_HARD_DIFFICULTY_UPDATES_EXTRACTION_WINDOW", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let battleState: BattleState;
  let turnLimitElement: HTMLElement | null = null;
  let supplyList: HTMLUListElement | null = null;

  await Given("a precombat screen configured for River Watch difficulty checks", async () => {
    document.body.innerHTML = `
      <section id="precombatScreen">
        <h1 id="precombatMissionTitle"></h1>
        <p id="precombatMissionBriefing"></p>
        <ul id="objectiveList"></ul>
        <span id="missionTurnLimit"></span>
        <p id="missionClockNote"></p>
        <ul id="baselineSupplyList"></ul>
        <p id="missionDoctrineNotes"></p>
        <button id="returnToLanding"></button>
        <button id="proceedToBattle"></button>
        <button id="allocationWarningReturn"></button>
        <button id="allocationWarningProceed"></button>
        <div id="allocationUnitList"></div>
        <div id="allocationSupplyList"></div>
        <div id="allocationSupportList"></div>
        <div id="allocationLogisticsList"></div>
        <button id="resetAllocations"></button>
        <div id="allocationWarningOverlay" class="hidden"></div>
        <div id="allocationWarningModal"></div>
        <div id="predeployedSummary"></div>
        <div id="predeployedUnitList"></div>
        <aside id="precombatBudgetPanel" data-state="ready">
          <span id="budgetSpent"></span>
          <span id="budgetRemaining"></span>
          <div id="allocationFeedback"></div>
        </aside>
        <article id="commanderSummaryCard">
          <h2 id="commanderName"></h2>
          <p id="commanderSummary"></p>
          <span id="commanderMissions"></span>
          <span id="commanderVictories"></span>
          <span id="commanderUnits"></span>
          <span id="commanderCasualties"></span>
        </article>
        <div id="precombatMapCanvas"></div>
        <svg id="precombatHexMap"></svg>
        <footer class="precombat-footer"></footer>
      </section>
    `;

    turnLimitElement = document.getElementById("missionTurnLimit");
    supplyList = document.getElementById("baselineSupplyList") as HTMLUListElement | null;

    const fakeScreenManager: IScreenManager = {
      showScreen: () => {},
      showScreenById: () => {},
      getCurrentScreen: () => null
    };

    battleState = new BattleState();
    screen = createPrecombatScreen(fakeScreenManager, battleState);
    // @ts-expect-error - overriding private helper purely for testing efficiency.
    screen.renderMiniMap = () => {};
    screen.initialize();
  });

  await When("River Crossing Watch is rendered on Hard", async () => {
    screen.setup("patrol_river_watch", null, "Hard");
  });

  await Then("the authored extraction window and mission handoff use the fixed mission timer", async () => {
    const summary = getMissionSummaryPackage("patrol_river_watch", "Hard");
    const missionInfo = battleState.getPrecombatMissionInfo();

    if (!turnLimitElement || turnLimitElement.textContent !== "12 turns") {
      throw new Error(`Expected fixed extraction window of 12 turns, received ${turnLimitElement?.textContent}`);
    }
    if (!supplyList) {
      throw new Error("Expected supply list element to exist.");
    }
    const supplyText = supplyList.textContent ?? "";
    if (!supplyText.includes("Off-map Artillery")) {
      throw new Error(`Expected Hard briefing support summary to keep off-map artillery visible, received ${supplyText}`);
    }
    if (supplyText.includes("Hold until dawn on turn 12")) {
      throw new Error(`Expected fixed extraction window copy to stay in the turn-limit panel, received ${supplyText}`);
    }
    if (!missionInfo) {
      throw new Error("Expected BattleState mission handoff to be populated.");
    }
    if (missionInfo.turnLimit !== 12) {
      throw new Error(`Expected BattleState turn limit to be 12, received ${missionInfo.turnLimit}`);
    }
    if (missionInfo.baselineSupplies.map((item) => `${item.label}:${item.amount}`).join("|") !== summary.supplies.map((item) => `${item.label}:${item.amount}`).join("|")) {
      throw new Error("Expected BattleState Hard supply summary to match the authored package.");
    }
    document.body.innerHTML = "";
  });
});

registerTest("MISSION_PROFILE_EXPOSES_REUSABLE_CATEGORY_AND_DEPLOYMENT_DEFAULTS", async ({ When, Then }) => {
  let riverWatchProfile = getMissionProfile("patrol_river_watch", "Hard");
  let patrolProfile = getMissionProfile("patrol", "Normal");
  let trainingProfile = getMissionProfile("training", "Normal");

  await When("mission profiles are resolved for flagship and baseline patrol missions", async () => {
    riverWatchProfile = getMissionProfile("patrol_river_watch", "Hard");
    patrolProfile = getMissionProfile("patrol", "Normal");
    trainingProfile = getMissionProfile("training", "Normal");
  });

  await Then("shared mission metadata exposes category and deployment defaults for future mission authoring", async () => {
    if (riverWatchProfile.category !== "patrol") {
      throw new Error(`Expected River Watch to resolve as patrol category, received ${riverWatchProfile.category}`);
    }
    if (riverWatchProfile.deployment.preferredZoneKey !== "allied-start") {
      throw new Error(`Expected River Watch preferred deployment zone allied-start, received ${riverWatchProfile.deployment.preferredZoneKey}`);
    }
    if (riverWatchProfile.deployment.focusLabel !== "line of departure") {
      throw new Error(`Expected River Watch deployment focus label to be line of departure, received ${riverWatchProfile.deployment.focusLabel}`);
    }
    if (riverWatchProfile.deployment.validation.minimumPlayerZoneCapacityTotal !== 16) {
      throw new Error(`Expected River Watch deployment doctrine to require 16 player slots, received ${riverWatchProfile.deployment.validation.minimumPlayerZoneCapacityTotal}`);
    }
    if (riverWatchProfile.deployment.zoneDoctrine[0]?.zoneKey !== "allied-start") {
      throw new Error(`Expected River Watch zone doctrine to target allied-start, received ${riverWatchProfile.deployment.zoneDoctrine[0]?.zoneKey}`);
    }
    if (riverWatchProfile.deployment.zoneDoctrine[0]?.minimumCapacity !== 16) {
      throw new Error(`Expected River Watch zone doctrine minimum capacity 16, received ${riverWatchProfile.deployment.zoneDoctrine[0]?.minimumCapacity}`);
    }
    if (riverWatchProfile.summary.turnLimit !== 12) {
      throw new Error(`Expected River Watch mission profile to resolve turn limit 12, received ${riverWatchProfile.summary.turnLimit}`);
    }
    if (patrolProfile.category !== "patrol") {
      throw new Error(`Expected baseline patrol mission to resolve as patrol category, received ${patrolProfile.category}`);
    }
    if (patrolProfile.deployment.preferredZoneKey !== "zone-alpha") {
      throw new Error(`Expected baseline patrol preferred deployment zone zone-alpha, received ${patrolProfile.deployment.preferredZoneKey}`);
    }
    if (patrolProfile.deployment.focusLabel !== "town perimeter") {
      throw new Error(`Expected baseline patrol deployment focus label to be town perimeter, received ${patrolProfile.deployment.focusLabel}`);
    }
    if (patrolProfile.deployment.zoneDoctrine.length !== 1) {
      throw new Error(`Expected baseline patrol doctrine to expose one deployment zone, received ${patrolProfile.deployment.zoneDoctrine.length}`);
    }
    if (trainingProfile.deployment.preferredZoneKey !== "zone-alpha") {
      throw new Error(`Expected training preferred deployment zone zone-alpha, received ${trainingProfile.deployment.preferredZoneKey}`);
    }
    if (trainingProfile.deployment.zoneDoctrine.length !== 1) {
      throw new Error(`Expected training doctrine to expose one deployment zone, received ${trainingProfile.deployment.zoneDoctrine.length}`);
    }
    if (trainingProfile.deployment.zoneDoctrine[0]?.zoneKey !== "zone-alpha") {
      throw new Error(`Expected training doctrine to target zone-alpha, received ${trainingProfile.deployment.zoneDoctrine[0]?.zoneKey}`);
    }
    if (trainingProfile.deployment.validation.minimumPlayerZoneCapacityTotal !== 13) {
      throw new Error(`Expected training doctrine to require 13 player slots, received ${trainingProfile.deployment.validation.minimumPlayerZoneCapacityTotal}`);
    }
  });
});

/**
 * Verifies deterministic budget math for each allocation category so UI summaries stay in sync with validation logic.
 */
registerTest("PRECOMBAT_ALLOCATIONS_BUDGET_SUMMARY", async ({ Given, When, Then }) => {
  let categoryTotals: Map<AllocationCategory, number>;
  let aggregateSpend = 0;

  await Given("allocation categories with their maximum spend", async () => {
    categoryTotals = new Map();
    for (const option of allocationOptions) {
      const currentTotal = categoryTotals.get(option.category) ?? 0;
      categoryTotals.set(option.category, currentTotal + option.costPerUnit * option.maxQuantity);
    }
  });

  await When("summing total maximum spend across all categories", async () => {
    aggregateSpend = Array.from(categoryTotals.values()).reduce((sum, value) => sum + value, 0);
  });

  await Then("every category remains budgeted and aggregate totals stay positive", async () => {
    for (const category of allowedCategories) {
      if (!categoryTotals.has(category)) {
        throw new Error(`Expected budget totals for category ${category}.`);
      }
      const total = categoryTotals.get(category) ?? 0;
      if (total <= 0) {
        throw new Error(`Budget total for category ${category} must be positive; received ${total}.`);
      }
    }

    if (aggregateSpend <= 0) {
      throw new Error("Aggregate allocation spend must remain positive to support UI budget indicators.");
    }
  });
});

/**
 * Ensures the category partitions and type guards remain synchronized with the dataset.
 */
registerTest("PRECOMBAT_ALLOCATIONS_LOOKUP_GUARDS", async ({ Given, When, Then }) => {
  let missingCategories: AllocationCategory[] = [];
  let unexpectedCategories: AllocationCategory[] = [];
  let guardSuccess: string[] = [];
  let guardFailure = false;

  await Given("the category lookup map and key guard", async () => {
    missingCategories = Array.from(allowedCategories).filter(
      (category) => !ALLOCATION_BY_CATEGORY.has(category)
    );
    unexpectedCategories = Array.from(ALLOCATION_BY_CATEGORY.keys()).filter(
      (category) => !allowedCategories.has(category)
    );
  });

  await When("evaluating partitions and guard behavior", async () => {
    guardSuccess = allocationOptions.filter((option) => isAllocationKey(option.key)).map((option) => option.key);
    guardFailure = isAllocationKey("__unknown__");
  });

  await Then("categories stay canonical and guards accept only known values", async () => {
    if (missingCategories.length > 0) {
      throw new Error(`Allocation categories missing: ${missingCategories.join(", ")}`);
    }
    if (unexpectedCategories.length > 0) {
      throw new Error(`Unexpected allocation categories: ${unexpectedCategories.join(", ")}`);
    }
    if (guardSuccess.length !== allocationOptions.length) {
      throw new Error("Expected guard to accept every known allocation key.");
    }
    if (guardFailure) {
      throw new Error("Allocation guard should reject unknown keys.");
    }
  });
});

registerTest("PRECOMBAT_CAMPAIGN_AIRBORNE_FORMATIONS_ARE_PRESENTED_AS_GROUND_FORCES", async ({ Given, When, Then }) => {
  const screen = Object.create(PrecombatScreen.prototype) as PrecombatScreen;
  const airborne = getAllocationOption("airborneDetachment");
  const categories: AllocationCategory[] = [];
  const descriptions: string[] = [];

  await Given("an airborne formation already ashore in a Player campaign engagement", async () => {
    if (!airborne) throw new Error("Airborne allocation metadata is unavailable.");
    (screen as any).engagementContext = { engagementId: "grounded-airborne" };
  });

  await When("precombat prepares its allocation presentation", async () => {
    for (const playerDefense of [false, true]) {
      (screen as any).isPlayerDefensiveEngagement = () => playerDefense;
      (screen as any).engagementContext = {
        engagementId: "grounded-airborne",
        availableForces: playerDefense ? [] : [{ unitType: "Paratrooper", formationIds: ["campaign-para"] }],
        enemyForces: playerDefense ? [{ unitType: "Paratrooper", formationIds: ["campaign-para"] }] : []
      };
      categories.push((screen as any).getAllocationPresentationCategory(airborne));
      descriptions.push((screen as any).getAllocationPresentationDescription(airborne));
    }
  });

  await Then("the formation appears with ground units for either role and never asks for another transport flight", async () => {
    if (categories.some((category) => category !== "units")
      || descriptions.some((description) => !/already on the ground/i.test(description))
      || descriptions.some((description) => /requires? (?:a )?transport flight/i.test(description))) {
      throw new Error(`Campaign airborne presentation remained misleading: ${categories.join("|")} / ${descriptions.join("|")}`);
    }
  });
});
