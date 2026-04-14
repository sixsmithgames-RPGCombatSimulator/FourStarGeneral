import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { PrecombatScreen } from "../src/ui/screens/PrecombatScreen";
import { BattleState } from "../src/state/BattleState";
function mountPrecombatDom() {
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
}
function createScreen() {
    mountPrecombatDom();
    const fakeScreenManager = {
        showScreen: () => { },
        showScreenById: () => { },
        getCurrentScreen: () => null
    };
    const screen = new PrecombatScreen(fakeScreenManager, new BattleState());
    // @ts-expect-error - test override for jsdom.
    screen.renderMiniMap = () => { };
    screen.initialize();
    return screen;
}
registerTest("PRECOMBAT_ENFORCES_A_CONVOY_MINIMUM_FOR_RIVER_WATCH", async ({ Given, When, Then }) => {
    let screen;
    let convoyCount = 0;
    let convoyVisible = false;
    await Given("River Watch precombat loads with mission defaults", async () => {
        screen = createScreen();
        screen.setup("patrol_river_watch", null, "Normal");
    });
    await When("the commander reviews the unit roster and tries to remove the convoy", async () => {
        const internals = screen;
        convoyCount = internals.allocationCounts.get("supplyConvoy") ?? 0;
        convoyVisible = internals.allocationLogisticsList.innerHTML.includes('data-key="supplyConvoy"');
        internals.handleAllocationAdjustment("supplyConvoy", -1);
        internals.handleAllocationAdjustment("supplyConvoy", -1);
        convoyCount = internals.allocationCounts.get("supplyConvoy") ?? 0;
    });
    await Then("the mission still includes one convoy because it was not explicitly restricted", async () => {
        if (!convoyVisible) {
            throw new Error("Expected River Watch to surface a supply convoy in the unit roster.");
        }
        if (convoyCount !== 1) {
            throw new Error(`Expected River Watch to enforce a convoy floor of 1, saw ${convoyCount}.`);
        }
        document.body.innerHTML = "";
    });
});
registerTest("PRECOMBAT_HONORS_EXPLICIT_CONVOY_RESTRICTIONS", async ({ Given, When, Then }) => {
    let screen;
    let convoyVisible = true;
    let convoyCount = 1;
    await Given("a mission that explicitly restricts supply convoys", async () => {
        screen = createScreen();
        screen.setup("training", null, "Normal");
        const internals = screen;
        internals.scenarioSource.restrictedUnits = ["supplyConvoy"];
        internals.allocationCounts.set("supplyConvoy", 0);
        internals.seedRecommendedLogisticsAllocations();
        internals.rerenderAllocations();
        convoyVisible = internals.allocationLogisticsList.innerHTML.includes('data-key="supplyConvoy"');
        convoyCount = internals.allocationCounts.get("supplyConvoy") ?? 0;
    });
    await When("the roster is rendered after restriction evaluation", async () => {
        // Assertions live in Then for clearer failure output.
    });
    await Then("the convoy entry disappears and no minimum is enforced", async () => {
        if (convoyVisible) {
            throw new Error("Expected explicitly restricted convoys to be hidden from the mission roster.");
        }
        if (convoyCount !== 0) {
            throw new Error(`Expected explicit convoy restriction to keep the count at 0, saw ${convoyCount}.`);
        }
        document.body.innerHTML = "";
    });
});
registerTest("PRECOMBAT_SUPPLY_REQUISITIONS_CONVERT_TO_REAL_DEPOT_PACKAGES", async ({ Given, When, Then }) => {
    let screen;
    let depotAmmo = 0;
    let depotFuel = 0;
    await Given("a precombat requisition plan that buys one ammunition dump and one fuel dump", async () => {
        screen = createScreen();
        screen.setup("training", null, "Normal");
        const internals = screen;
        internals.allocationCounts.set("ammo", 1);
        internals.allocationCounts.set("fuel", 1);
        const summary = internals.buildAllocationSummary([]);
        depotAmmo = summary.depotPackage.ammo;
        depotFuel = summary.depotPackage.fuel;
    });
    await When("the summary converts requisitions into depot stock", async () => {
        // Assertions run in Then for clearer failure output.
    });
    await Then("each dump adds a full stock package instead of a literal single point", async () => {
        if (depotAmmo !== 36) {
            throw new Error(`Expected one ammunition dump to seed 36 depot ammo, received ${depotAmmo}.`);
        }
        if (depotFuel !== 54) {
            throw new Error(`Expected one fuel dump to seed 54 depot fuel, received ${depotFuel}.`);
        }
        document.body.innerHTML = "";
    });
});
