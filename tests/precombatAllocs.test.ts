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
    screen.setup("training", null);
    screen.setup("patrol", null);

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
