import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleState } from "../src/state/BattleState";
import { CORE_REGION_KEYS, CORE_SCHOOL_KEYS } from "../src/data/unlocks";
import { PrecombatScreen } from "../src/ui/screens/PrecombatScreen";
import type { IScreenManager } from "../src/contracts/IScreenManager";
import { UnlockState, ensureUnlockState } from "../src/state/UnlockState";

registerTest("UNLOCK_CATALOG_ALIGNS_WITH_MARKETED_FREE_CORE_BASELINE", async ({ Then }) => {
  await Then("the free-core catalog exposes two starter factions and two starter colleges", async () => {
    if (CORE_REGION_KEYS.length !== 2) {
      throw new Error(`Expected 2 free-core factions, received ${CORE_REGION_KEYS.length}.`);
    }
    if (CORE_SCHOOL_KEYS.length !== 2) {
      throw new Error(`Expected 2 free-core colleges, received ${CORE_SCHOOL_KEYS.length}.`);
    }
    if (!CORE_REGION_KEYS.includes("western-protectorate") || !CORE_REGION_KEYS.includes("atlantic-alliance")) {
      throw new Error(`Expected Western Protectorate and Atlantic Alliance to remain free-core, received ${CORE_REGION_KEYS.join(", ")}.`);
    }
    if (!CORE_SCHOOL_KEYS.includes("imperial-war-academy") || !CORE_SCHOOL_KEYS.includes("coastal-defense-college")) {
      throw new Error(`Expected Imperial War Academy and Coastal Defense College to remain free-core, received ${CORE_SCHOOL_KEYS.join(", ")}.`);
    }
  });
});

registerTest("UNLOCK_STATE_GRANTS_FULL_ROSTER_ONLY_TO_FULL_GAME_PLANS", async ({ Given, When, Then }) => {
  let unlockState: UnlockState;

  await Given("a fresh unlock state", async () => {
    unlockState = new UnlockState();
  });

  await When("free-core access is evaluated without the full-game plan", async () => {
    unlockState.hydrate({
      resolved: true,
      isAuthenticated: true,
      email: "commander@example.com",
      subscriptionStatus: null,
      planIds: [],
      isPrivileged: false
    });
  });

  await Then("core factions stay accessible while paid units remain locked until the full-game plan is present", async () => {
    if (!unlockState.hasRegionAccess("western-protectorate")) {
      throw new Error("Expected free-core faction access for Western Protectorate.");
    }
    if (!unlockState.hasSchoolAccess("coastal-defense-college")) {
      throw new Error("Expected free-core college access for Coastal Defense College.");
    }
    if (unlockState.hasUnitAccess("rocketArtilleryBattalion")) {
      throw new Error("Rocket Artillery should remain locked without the full-game plan.");
    }

    unlockState.hydrate({
      resolved: true,
      isAuthenticated: true,
      email: "commander@example.com",
      subscriptionStatus: "active",
      planIds: ["fourstargeneral"],
      isPrivileged: false
    });

    if (!unlockState.hasUnitAccess("rocketArtilleryBattalion")) {
      throw new Error("Expected the full-game plan to unlock paid unit requisitions.");
    }
    if (!unlockState.hasRegionAccess("northern-reach")) {
      throw new Error("Expected the full-game plan to unlock paid factions.");
    }
    if (!unlockState.hasSchoolAccess("mountain-ranger-school")) {
      throw new Error("Expected the full-game plan to unlock paid colleges.");
    }
  });
});

registerTest("PRECOMBAT_LOCKED_UNITS_RENDER_UNLOCK_CTA_AND_BLOCK_REQUISITIONS", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let battleState: BattleState;

  await Given("a precombat screen running under free-core access", async () => {
    ensureUnlockState().hydrate({
      resolved: true,
      isAuthenticated: true,
      email: "commander@example.com",
      subscriptionStatus: null,
      planIds: [],
      isPrivileged: false
    });

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

    const fakeScreenManager: IScreenManager = {
      showScreen: () => {},
      showScreenById: () => {},
      getCurrentScreen: () => null
    };

    battleState = new BattleState();
    screen = new PrecombatScreen(fakeScreenManager, battleState);
    // @ts-expect-error test-only rendering shortcut
    screen.renderMiniMap = () => {};
    screen.initialize();
  });

  await When("the training mission allocation roster is rendered", async () => {
    screen.setup("training", null, "Normal");
    const internals = screen as unknown as {
      handleAllocationAdjustment: (optionKey: string, delta: number) => void;
    };
    internals.handleAllocationAdjustment("rocketArtilleryBattalion", 1);
  });

  await Then("paid units show an unlock CTA instead of requisition controls and warn when selected", async () => {
    const row = document.querySelector<HTMLElement>('[data-key="rocketArtilleryBattalion"]');
    const feedback = document.getElementById("allocationFeedback");
    if (!row) {
      throw new Error("Expected Rocket Artillery allocation row to render.");
    }
    if (row.dataset.locked !== "true") {
      throw new Error(`Expected Rocket Artillery row to be marked locked, received ${row.dataset.locked}.`);
    }
    if (!row.textContent?.includes("Unlock Unit")) {
      throw new Error(`Expected locked unit row to expose an unlock CTA, received ${row.textContent}.`);
    }
    if (row.querySelector('[data-action="increment"]')) {
      throw new Error("Locked unit rows should not render increment controls.");
    }
    if (!feedback || !feedback.textContent?.includes("requires an unlock")) {
      throw new Error(`Expected locked-unit feedback when requisitioning Rocket Artillery, received ${feedback?.textContent}.`);
    }

    ensureUnlockState().hydrate({
      resolved: true,
      isAuthenticated: true,
      email: "commander@example.com",
      subscriptionStatus: "active",
      planIds: ["fourstargeneral"],
      isPrivileged: false
    });

    document.body.innerHTML = "";
  });
});
