/**
 * Guards the precombat allocation dataset to alert designers when numeric caps or categories drift.
 * This keeps UI expectations stable without requiring factories to defensively clone or clamp values.
 */
import "./domEnvironment.js";
import { registerTest } from "./harness.js";
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
import { getMissionBriefing, getMissionProfile, getMissionSummaryPackage, getMissionTitle } from "../src/data/missions";

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
    screen = new PrecombatScreen(fakeScreenManager, battleState);

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

registerTest("PRECOMBAT_SEEDS_LOW_COST_SUPPLY_CONVOYS_BUT_STILL_REQUIRES_COMBAT_FORCES", async ({ Given, When, Then }) => {
  document.body.innerHTML = `
    <section id="precombatScreen">
      <h1 id="precombatMissionTitle"></h1>
      <p id="precombatMissionBriefing"></p>
      <ul id="objectiveList"></ul>
      <span id="missionTurnLimit"></span>
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
    const screen = new PrecombatScreen(fakeScreenManager, battleState);
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
    if (convoyCount < 2) {
      throw new Error(`Expected precombat to seed at least two supply convoys by default, saw ${convoyCount}.`);
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
    screen = new PrecombatScreen(fakeScreenManager, battleState);
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
    if (!objectiveText.includes(summary.objectives[0])) {
      throw new Error(`Expected primary authored objective, received ${objectiveText}`);
    }
    if (!objectiveText.includes(summary.objectives[1])) {
      throw new Error("Expected authored secondary objective to render.");
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
    if (!supplyText.includes("Predeployed Patrol")) {
      throw new Error(`Expected authored patrol package summary, received ${supplyText}`);
    }
    if (supplyText.includes("Turn Limit")) {
      throw new Error("Expected authored mission package supplies to replace the old fallback entries.");
    }
    if (!missionInfo) {
      throw new Error("Expected BattleState mission handoff to be populated.");
    }
    if (missionInfo.briefing !== getMissionBriefing("patrol_river_watch")) {
      throw new Error("Expected BattleState mission briefing to match the authored package.");
    }
    if (missionInfo.objectives.join("|") !== summary.objectives.join("|")) {
      throw new Error("Expected BattleState mission objectives to match the authored package.");
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
    screen = new PrecombatScreen(fakeScreenManager, battleState);
    // @ts-expect-error - overriding private helper purely for testing efficiency.
    screen.renderMiniMap = () => {};
    screen.initialize();
  });

  await When("River Crossing Watch is rendered on Hard", async () => {
    screen.setup("patrol_river_watch", null, "Hard");
  });

  await Then("the authored extraction window and mission handoff use the Hard timer", async () => {
    const summary = getMissionSummaryPackage("patrol_river_watch", "Hard");
    const missionInfo = battleState.getPrecombatMissionInfo();

    if (!turnLimitElement || turnLimitElement.textContent !== "11 turns") {
      throw new Error(`Expected Hard extraction window of 11 turns, received ${turnLimitElement?.textContent}`);
    }
    if (!supplyList) {
      throw new Error("Expected supply list element to exist.");
    }
    const supplyText = supplyList.textContent ?? "";
    if (!supplyText.includes("Hold until dawn on turn 11")) {
      throw new Error(`Expected Hard extraction-window supply copy, received ${supplyText}`);
    }
    if (!missionInfo) {
      throw new Error("Expected BattleState mission handoff to be populated.");
    }
    if (missionInfo.turnLimit !== 11) {
      throw new Error(`Expected BattleState Hard turn limit to be 11, received ${missionInfo.turnLimit}`);
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

  await When("mission profiles are resolved for flagship and baseline patrol missions", async () => {
    riverWatchProfile = getMissionProfile("patrol_river_watch", "Hard");
    patrolProfile = getMissionProfile("patrol", "Normal");
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
    if (riverWatchProfile.deployment.validation.minimumPlayerZoneCapacityTotal !== 20) {
      throw new Error(`Expected River Watch deployment doctrine to require 20 player slots, received ${riverWatchProfile.deployment.validation.minimumPlayerZoneCapacityTotal}`);
    }
    if (riverWatchProfile.deployment.zoneDoctrine[0]?.zoneKey !== "allied-start") {
      throw new Error(`Expected River Watch zone doctrine to target allied-start, received ${riverWatchProfile.deployment.zoneDoctrine[0]?.zoneKey}`);
    }
    if (riverWatchProfile.deployment.zoneDoctrine[0]?.minimumCapacity !== 20) {
      throw new Error(`Expected River Watch zone doctrine minimum capacity 20, received ${riverWatchProfile.deployment.zoneDoctrine[0]?.minimumCapacity}`);
    }
    if (riverWatchProfile.summary.turnLimit !== 11) {
      throw new Error(`Expected Hard River Watch mission profile to resolve turn limit 11, received ${riverWatchProfile.summary.turnLimit}`);
    }
    if (patrolProfile.category !== "patrol") {
      throw new Error(`Expected baseline patrol mission to resolve as patrol category, received ${patrolProfile.category}`);
    }
    if (patrolProfile.deployment.preferredZoneKey !== "zone-alpha") {
      throw new Error(`Expected baseline patrol preferred deployment zone zone-alpha, received ${patrolProfile.deployment.preferredZoneKey}`);
    }
    if (patrolProfile.deployment.zoneDoctrine.length !== 2) {
      throw new Error(`Expected baseline patrol doctrine to expose two deployment zones, received ${patrolProfile.deployment.zoneDoctrine.length}`);
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
